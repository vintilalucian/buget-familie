import {
  DEFAULT_SETTINGS,
  DEFAULT_ACCOUNTS,
  DEFAULT_CATEGORIES,
  DEFAULT_CURRENCIES,
  TX_TYPES,
  createDemoExpenses
} from "./defaults.js";
import * as api from "./sheets-api.js";
import { validateTransaction, createTransferPair, round2 } from "./ledger.js";

const STORAGE_KEY = "buget_familie_state_v2";

function safeGetStorage(key) {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function safeSetStorage(key, val) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(key, JSON.stringify(val));
  } catch (_) {}
}

function safeRemoveStorage(key) {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(key);
  } catch (_) {}
}

function detectTheme() {
  try {
    if (typeof window !== "undefined" && window.matchMedia) {
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
  } catch (_) {}
  return "light";
}

function defaultTableVersions() {
  return { accounts: 1, categories: 1, currencies: 1, settings: 1 };
}

function createInitialState() {
  const now = new Date();
  const saved = safeGetStorage(STORAGE_KEY);
  if (saved) {
    return {
      connection: saved.connection || { webAppUrl: "", pin: "", sheetName: "", lastSyncedAt: null },
      activePartner: saved.activePartner || "p1",
      theme: saved.theme || detectTheme(),
      settings: { ...DEFAULT_SETTINGS, ...(saved.settings || {}) },
      accounts: Array.isArray(saved.accounts) && saved.accounts.length ? saved.accounts : structuredClone(DEFAULT_ACCOUNTS),
      categories: saved.categories && saved.categories.length ? saved.categories : structuredClone(DEFAULT_CATEGORIES),
      currencies: saved.currencies && saved.currencies.length ? saved.currencies : structuredClone(DEFAULT_CURRENCIES),
      tableVersions: { ...defaultTableVersions(), ...(saved.tableVersions || {}) },
      expenses: Array.isArray(saved.expenses) ? saved.expenses : [],
      auditWarnings: Array.isArray(saved.auditWarnings) ? saved.auditWarnings : [],
      pendingQueue: Array.isArray(saved.pendingQueue) ? saved.pendingQueue : [],
      failedQueue: Array.isArray(saved.failedQueue) ? saved.failedQueue : [],
      isDemoMode: saved.isDemoMode ?? false,
      selectedYear: now.getFullYear(),
      selectedMonth: now.getMonth(),
      scope: "all",
      syncing: false,
      lastError: null
    };
  }

  return {
    connection: { webAppUrl: "", pin: "", sheetName: "", lastSyncedAt: null },
    activePartner: "p1",
    theme: detectTheme(),
    settings: structuredClone(DEFAULT_SETTINGS),
    accounts: structuredClone(DEFAULT_ACCOUNTS),
    categories: structuredClone(DEFAULT_CATEGORIES),
    currencies: structuredClone(DEFAULT_CURRENCIES),
    tableVersions: defaultTableVersions(),
    expenses: createDemoExpenses(),
    auditWarnings: [],
    pendingQueue: [],
    failedQueue: [],
    isDemoMode: true,
    selectedYear: now.getFullYear(),
    selectedMonth: now.getMonth(),
    scope: "all",
    syncing: false,
    lastError: null
  };
}

/**
 * Combină lista venită de pe server cu operațiile încă aflate în `pendingQueue`,
 * marcându-le cu `pendingSync: true` astfel încât intrările netrimise să nu dispară la `sync()`.
 */
function mergeServerWithPending(serverExpenses, pendingQueue) {
  const map = new Map();
  (serverExpenses || []).forEach((e) => {
    map.set(e.id, { ...e, pendingSync: false });
  });

  (pendingQueue || []).forEach((op) => {
    if (op.type === "addExpense" && op.expense) {
      map.set(op.expense.id, { ...op.expense, pendingSync: true });
    } else if (op.type === "addTransfer" && Array.isArray(op.legs)) {
      op.legs.forEach((leg) => map.set(leg.id, { ...leg, pendingSync: true }));
    } else if (op.type === "updateExpense" && op.expense) {
      map.set(op.expense.id, { ...op.expense, pendingSync: true });
    } else if (op.type === "deleteExpense" && op.id) {
      map.delete(op.id);
    } else if (op.type === "bulkImport" && Array.isArray(op.expenses)) {
      op.expenses.forEach((e) => map.set(e.id, { ...e, pendingSync: true }));
    }
  });

  return Array.from(map.values()).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}

export class Store {
  constructor() {
    this.state = createInitialState();
    this.listeners = new Set();
  }

  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() {
    this.persist();
    this.listeners.forEach((fn) => fn(this.state));
  }

  persist() {
    const toSave = {
      connection: {
        webAppUrl: this.state.connection.webAppUrl,
        pin: this.state.connection.pin,
        sheetName: this.state.connection.sheetName,
        lastSyncedAt: this.state.connection.lastSyncedAt
      },
      activePartner: this.state.activePartner,
      theme: this.state.theme,
      settings: this.state.settings,
      accounts: this.state.accounts,
      categories: this.state.categories,
      currencies: this.state.currencies,
      tableVersions: this.state.tableVersions,
      expenses: this.state.expenses,
      auditWarnings: this.state.auditWarnings,
      pendingQueue: this.state.pendingQueue,
      failedQueue: this.state.failedQueue,
      isDemoMode: this.state.isDemoMode
    };
    safeSetStorage(STORAGE_KEY, toSave);
  }

  isConnected() {
    return Boolean(this.state.connection.webAppUrl && this.state.connection.webAppUrl.trim() && this.state.connection.pin);
  }

  setTheme(theme) {
    this.state.theme = theme;
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", theme);
    }
    this.emit();
  }

  toggleTheme() {
    this.setTheme(this.state.theme === "dark" ? "light" : "dark");
  }

  setMonth(year, month) {
    this.state.selectedYear = year;
    this.state.selectedMonth = month;
    this.emit();
  }

  shiftMonth(delta) {
    const d = new Date(this.state.selectedYear, this.state.selectedMonth + delta, 1);
    this.setMonth(d.getFullYear(), d.getMonth());
  }

  setScope(scope) {
    this.state.scope = scope;
    this.emit();
  }

  setActivePartner(partner) {
    if (this.isConnected()) return;
    this.state.activePartner = partner === "p2" ? "p2" : "p1";
    this.emit();
  }

  getPartnerName(partnerKey) {
    if (partnerKey === "p2") return this.state.settings.partner2Name;
    if (partnerKey === "p1") return this.state.settings.partner1Name;
    if (partnerKey === "comun") return "Comun";
    return "Necunoscut";
  }

  getAccount(accId) {
    return (this.state.accounts || []).find((a) => a.id === accId) || null;
  }

  getCategory(catId) {
    return (
      this.state.categories.find((c) => c.id === catId || c.name === catId) || {
        id: "altele",
        name: catId || "Altele",
        icon: "📦",
        color: "#94a3b8",
        budget: 0,
        group: "Altele",
        kind: "cheltuiala"
      }
    );
  }

  getCurrency(code) {
    const upper = String(code || this.state.settings.baseCurrency || "RON").toUpperCase();
    return (
      this.state.currencies.find((c) => c.code === upper) || {
        code: upper,
        name: upper,
        symbol: upper,
        rate: 1
      }
    );
  }

  getRateToBase(currencyCode) {
    const cur = this.getCurrency(currencyCode);
    const base = this.getCurrency(this.state.settings.baseCurrency);
    if (cur.code === base.code) return 1;
    return base.rate ? round2((cur.rate / base.rate) * 10000) / 10000 : cur.rate;
  }

  toBaseCurrency(amount, currencyCode) {
    const val = Number(amount) || 0;
    const rate = this.getRateToBase(currencyCode);
    return round2(val * rate);
  }

  getVisibleExpenses({ year = null, month = null, scope = null } = {}) {
    const me = this.state.activePartner;
    const other = me === "p1" ? "p2" : "p1";
    const activeScope = scope ?? this.state.scope;

    return this.state.expenses.filter((exp) => {
      if (exp.owner !== me && exp.isPrivate) return false;

      if (year !== null && month !== null) {
        if (!exp.date) return false;
        const [y, m] = exp.date.split("-").map(Number);
        if (y !== year || m - 1 !== month) return false;
      }

      if (activeScope === "mine") return exp.owner === me;
      if (activeScope === "partner") return exp.owner === other;
      if (activeScope === "shared") return !exp.isPrivate;
      if (activeScope === "private") return exp.owner === me && exp.isPrivate;
      return true;
    });
  }

  dismissFailedOp(index) {
    this.state.failedQueue = this.state.failedQueue.filter((_, i) => i !== index);
    this.emit();
  }

  clearFailedQueue() {
    this.state.failedQueue = [];
    this.emit();
  }

  async addExpense(data) {
    const now = new Date().toISOString();
    const type = data.type || "cheltuiala";
    const currency = String(data.currency || this.state.settings.baseCurrency).toUpperCase();
    const baseCurrency = String(data.baseCurrency || this.state.settings.baseCurrency).toUpperCase();
    const exchangeRate = data.exchangeRate !== undefined && data.exchangeRate !== ""
      ? Number(data.exchangeRate)
      : this.getRateToBase(currency);
    const amount = Number(data.amount);
    const baseAmount = data.baseAmount !== undefined && data.baseAmount !== ""
      ? Number(data.baseAmount)
      : round2(amount * exchangeRate);

    const tx = {
      id: data.id || ("tx_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6)),
      date: data.date,
      type,
      direction: data.direction || TX_TYPES[type]?.defaultDir || "out",
      title: String(data.title || "").trim(),
      amount,
      currency,
      exchangeRate,
      rateSource: data.rateSource || (data.exchangeRate !== undefined ? "manual" : "curs_curent"),
      baseAmount,
      baseCurrency,
      accountId: data.accountId || "",
      debtAccountId: data.debtAccountId || "",
      linkedTxId: data.linkedTxId || "",
      principalAmount: data.principalAmount !== undefined && data.principalAmount !== "" ? Number(data.principalAmount) : undefined,
      interestAmount: data.interestAmount !== undefined && data.interestAmount !== "" ? Number(data.interestAmount) : undefined,
      splitStatus: data.splitStatus || (type === "rata_credit" ? "nedefalcat" : ""),
      category: data.category || "altele",
      paymentMethod: data.paymentMethod || "Card",
      isPrivate: Boolean(data.isPrivate),
      notes: String(data.notes || "").trim(),
      owner: this.state.activePartner,
      createdAt: now,
      updatedAt: now,
      pendingSync: this.isConnected()
    };

    const check = validateTransaction(tx);
    if (!check.valid) {
      throw new Error(check.errors.join(" "));
    }
    tx.baseMismatch = check.baseMismatch;

    this.state.expenses.unshift(tx);
    this.emit();

    if (this.isConnected()) {
      await this.enqueueAndFlush({ type: "addExpense", expense: tx });
    }
    return tx;
  }

  async addTransfer(params) {
    const baseCurrency = this.state.settings.baseCurrency || "RON";
    const sCur = (params.sourceCurrency || baseCurrency).toUpperCase();
    const dCur = (params.destCurrency || sCur).toUpperCase();
    const sRate = params.sourceExchangeRate ?? this.getRateToBase(sCur);
    const dRate = params.destExchangeRate ?? this.getRateToBase(dCur);

    const legs = createTransferPair({
      ...params,
      sourceCurrency: sCur,
      destCurrency: dCur,
      baseCurrency,
      sourceExchangeRate: sRate,
      destExchangeRate: dRate,
      owner: this.state.activePartner
    }).map((l) => ({ ...l, pendingSync: this.isConnected() }));

    this.state.expenses = [...legs, ...this.state.expenses];
    this.emit();

    if (this.isConnected()) {
      await this.enqueueAndFlush({ type: "addTransfer", legs });
    }
    return legs;
  }

  async updateExpense(id, updates) {
    const idx = this.state.expenses.findIndex((e) => e.id === id);
    if (idx === -1) return null;
    const existing = this.state.expenses[idx];
    const expectedUpdatedAt = existing.updatedAt || "";
    const currency = String(updates.currency || existing.currency).toUpperCase();
    const amount = Number(updates.amount ?? existing.amount);
    const exchangeRate = updates.exchangeRate !== undefined && updates.exchangeRate !== ""
      ? Number(updates.exchangeRate)
      : (currency === existing.currency ? (existing.exchangeRate || 1) : this.getRateToBase(currency));
    const baseAmount = updates.baseAmount !== undefined && updates.baseAmount !== ""
      ? Number(updates.baseAmount)
      : round2(amount * exchangeRate);

    const updated = {
      ...existing,
      ...updates,
      amount,
      currency,
      exchangeRate,
      baseAmount,
      updatedAt: new Date().toISOString(),
      pendingSync: this.isConnected()
    };

    const check = validateTransaction(updated);
    if (!check.valid) {
      throw new Error(check.errors.join(" "));
    }
    updated.baseMismatch = check.baseMismatch;

    this.state.expenses[idx] = updated;
    this.emit();

    if (this.isConnected()) {
      await this.enqueueAndFlush({
        type: "updateExpense",
        expense: updated,
        expectedUpdatedAt
      });
    }
    return updated;
  }

  async deleteExpense(id) {
    const existing = this.state.expenses.find((e) => e.id === id);
    if (!existing) return;
    const targets = existing.transferGroupId
      ? this.state.expenses.filter((e) => e.transferGroupId === existing.transferGroupId)
      : [existing];
    const idsToRemove = targets.map((t) => t.id);

    this.state.expenses = this.state.expenses.filter((e) => !idsToRemove.includes(e.id));
    this.emit();

    if (this.isConnected()) {
      for (const target of targets) {
        await this.enqueueAndFlush({
          type: "deleteExpense",
          id: target.id,
          expectedUpdatedAt: target.updatedAt || ""
        });
      }
    }
  }

  async commitImportRows(readyRows) {
    const now = new Date().toISOString();
    const toInsert = [];

    for (const row of readyRows) {
      if (row.type === "transfer" && row.destAccountId) {
        const legs = createTransferPair({
          idPrefix: row.id,
          date: row.date,
          title: row.title,
          sourceAccountId: row.accountId,
          destAccountId: row.destAccountId,
          sourceAmount: row.amount,
          sourceCurrency: row.currency,
          destAmount: row.destAmount ?? row.amount,
          destCurrency: row.destCurrency ?? row.currency,
          sourceBaseAmount: row.baseAmount,
          destBaseAmount: row.baseAmount,
          baseCurrency: row.baseCurrency,
          sourceExchangeRate: row.exchangeRate,
          destExchangeRate: row.exchangeRate,
          rateSource: row.rateSource,
          owner: row.owner || "necunoscut",
          isPrivate: row.isPrivate,
          notes: row.notes
        });
        legs[0].sourceIdentity = row.sourceIdentity + ":out";
        legs[1].sourceIdentity = row.sourceIdentity + ":in";
        toInsert.push(...legs.map((l) => ({ ...l, pendingSync: this.isConnected() })));
      } else {
        toInsert.push({
          ...row,
          createdAt: now,
          updatedAt: now,
          pendingSync: this.isConnected()
        });
      }
    }

    this.state.expenses = [...toInsert, ...this.state.expenses];
    this.emit();

    if (this.isConnected() && toInsert.length) {
      await this.enqueueAndFlush({ type: "bulkImport", expenses: toInsert });
    }
    return toInsert.length;
  }

  async saveAccounts(accounts) {
    this.state.accounts = accounts;
    this.emit();
    if (this.isConnected()) {
      await this.enqueueAndFlush({
        type: "saveAccounts",
        accounts,
        expectedVersion: this.state.tableVersions.accounts
      });
    }
  }

  async saveCategories(categories) {
    this.state.categories = categories;
    this.emit();
    if (this.isConnected()) {
      await this.enqueueAndFlush({
        type: "saveCategories",
        categories,
        expectedVersion: this.state.tableVersions.categories
      });
    }
  }

  async saveCurrencies(currencies) {
    this.state.currencies = currencies;
    this.emit();
    if (this.isConnected()) {
      await this.enqueueAndFlush({
        type: "saveCurrencies",
        currencies,
        expectedVersion: this.state.tableVersions.currencies
      });
    }
  }

  async saveSettings(newSettings) {
    this.state.settings = { ...this.state.settings, ...newSettings };
    this.emit();
    if (this.isConnected()) {
      await this.enqueueAndFlush({
        type: "saveSettings",
        settings: this.state.settings,
        expectedVersion: this.state.tableVersions.settings
      });
    }
  }

  async enqueueAndFlush(op) {
    this.state.pendingQueue.push(op);
    this.persist();
    return this.flushQueue();
  }

  /**
   * Trimite operațiile din `pendingQueue`:
   * - Succes / confirmare idempotentă -> scoate operația din coadă și actualizează versiunea locală.
   * - Eroare permanentă sau conflict (CONFLICT_ID, VERSION_CONFLICT, validare) -> mută în `failedQueue`
   *   și CONTINUĂ cu operațiile independente următoare (nu blochează coada!).
   * - Eroare temporară (rețea, LOCK_TIMEOUT, HTTP 5xx) -> păstrează în `pendingQueue` pentru reîncercare.
   */
  async flushQueue() {
    if (!this.isConnected() || !this.state.pendingQueue.length) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;

    const { webAppUrl, pin } = this.state.connection;
    while (this.state.pendingQueue.length > 0) {
      const op = this.state.pendingQueue[0];
      try {
        let res = null;
        if (op.type === "addExpense") {
          res = await api.pushAddExpense(webAppUrl, pin, op.expense);
          if (res && res.id) {
            this.markLocalTxSynced(res.id, res.updatedAt);
          }
        } else if (op.type === "addTransfer") {
          res = await api.pushAddTransfer(webAppUrl, pin, op.legs);
          const legResults = Array.isArray(res && res.results) ? res.results : [];
          legResults.forEach((r) => {
            if (r.rezultat === "aplicat" || r.rezultat === "deja_aplicat") {
              this.markLocalTxSynced(r.id, r.updatedAt);
            }
          });
        } else if (op.type === "updateExpense") {
          res = await api.pushUpdateExpense(webAppUrl, pin, op.expense, op.expectedUpdatedAt);
          if (res && res.id) {
            this.markLocalTxSynced(res.id, res.updatedAt);
          }
        } else if (op.type === "deleteExpense") {
          res = await api.pushDeleteExpense(webAppUrl, pin, op.id, op.expectedUpdatedAt);
        } else if (op.type === "bulkImport") {
          res = await api.pushBulkImport(webAppUrl, pin, op.expenses);
          const rowResults = Array.isArray(res && res.results) ? res.results : [];
          const byId = new Map((op.expenses || []).map((e) => [e.id, e]));
          const rejectedIds = new Set();

          rowResults.forEach((r) => {
            if (r.rezultat === "aplicat" || r.rezultat === "deja_aplicat") {
              this.markLocalTxSynced(r.id, r.updatedAt);
            } else {
              if (r.id) rejectedIds.add(r.id);
              this.state.failedQueue.push({
                op: { type: "bulkImportRow", id: r.id, expense: byId.get(r.id) || null },
                errorCode: r.cod || "REJECTED",
                error: r.mesaj || "Rând respins sau în conflict.",
                failedAt: new Date().toISOString()
              });
            }
          });

          // Scoatem din lista locală doar rândurile optimiste respinse (nu atingem rândurile deja sincronizate)
          if (rejectedIds.size > 0) {
            this.state.expenses = this.state.expenses.filter(
              (e) => !(rejectedIds.has(e.id) && e.pendingSync)
            );
          }
        } else if (op.type === "saveAccounts") {
          res = await api.pushAccounts(webAppUrl, pin, op.accounts, op.expectedVersion);
          if (res && res.version) this.state.tableVersions.accounts = res.version;
        } else if (op.type === "saveCategories") {
          res = await api.pushCategories(webAppUrl, pin, op.categories, op.expectedVersion);
          if (res && res.version) this.state.tableVersions.categories = res.version;
        } else if (op.type === "saveCurrencies") {
          res = await api.pushCurrencies(webAppUrl, pin, op.currencies, op.expectedVersion);
          if (res && res.version) this.state.tableVersions.currencies = res.version;
        } else if (op.type === "saveSettings") {
          res = await api.pushSettings(webAppUrl, pin, op.settings, op.expectedVersion);
          if (res && res.version) this.state.tableVersions.settings = res.version;
        }
        this.state.pendingQueue.shift();
        this.state.lastError = null;
        this.persist();
      } catch (err) {
        const isPermanent = err && err.retryable === false;
        if (isPermanent) {
          this.state.pendingQueue.shift();
          // Dacă un transfer sau addExpense optimist a fost respins definitiv, îl scoatem din lista locală ca să nu apară fals sincronizat
          if (op.type === "addTransfer" && Array.isArray(op.legs)) {
            const legIds = new Set(op.legs.map((l) => l.id));
            this.state.expenses = this.state.expenses.filter((e) => !(legIds.has(e.id) && e.pendingSync));
          } else if (op.type === "addExpense" && op.expense) {
            this.state.expenses = this.state.expenses.filter((e) => !(e.id === op.expense.id && e.pendingSync));
          }
          this.state.failedQueue.push({
            op,
            errorCode: err.errorCode || "FAILED",
            error: err.message || String(err),
            failedAt: new Date().toISOString()
          });
          this.persist();
          continue;
        }
        this.state.lastError = err.message || String(err);
        this.emit();
        break;
      }
    }
    this.emit();
  }

  markLocalTxSynced(id, updatedAt) {
    const found = this.state.expenses.find((e) => e.id === id);
    if (found) {
      found.pendingSync = false;
      if (updatedAt) found.updatedAt = updatedAt;
    }
  }

  async connectAndSync({ webAppUrl, pin, initialize = true }) {
    this.state.syncing = true;
    this.state.lastError = null;
    this.emit();

    try {
      const cleanUrl = webAppUrl.trim();
      const cleanPin = String(pin || "").trim();
      if (!cleanPin || cleanPin.length < 6 || cleanPin === "1234" || cleanPin === "123456") {
        throw new Error("Introdu PIN-ul tău personal (minim 6 caractere, nu PIN-uri implicite).");
      }

      const authRes = initialize
        ? await api.initSheet(cleanUrl, cleanPin, this.state.settings)
        : await api.pingSheet(cleanUrl, cleanPin);

      this.state.activePartner = authRes.partner === "p2" ? "p2" : "p1";
      this.state.connection = {
        ...this.state.connection,
        webAppUrl: cleanUrl,
        pin: cleanPin
      };
      if (authRes.tableVersions) {
        this.state.tableVersions = { ...this.state.tableVersions, ...authRes.tableVersions };
      }
      this.state.isDemoMode = false;
      this.persist();

      return await this.sync();
    } catch (err) {
      this.state.syncing = false;
      this.state.lastError = err.message;
      this.emit();
      throw err;
    }
  }

  async sync() {
    if (!this.isConnected()) return null;
    this.state.syncing = true;
    this.state.lastError = null;
    this.emit();

    try {
      await this.flushQueue();
      const { webAppUrl, pin } = this.state.connection;
      const data = await api.syncFromSheet(webAppUrl, pin);

      if (data.partner) this.state.activePartner = data.partner === "p2" ? "p2" : "p1";
      if (data.settings) this.state.settings = { ...DEFAULT_SETTINGS, ...data.settings };
      if (Array.isArray(data.accounts) && data.accounts.length) this.state.accounts = data.accounts;
      if (Array.isArray(data.categories) && data.categories.length) this.state.categories = data.categories;
      if (Array.isArray(data.currencies) && data.currencies.length) this.state.currencies = data.currencies;
      if (data.tableVersions) this.state.tableVersions = { ...defaultTableVersions(), ...data.tableVersions };

      // Păstrăm vizibile operațiile rămase în `pendingQueue` (marcate `pendingSync: true`) chiar dacă flush a eșuat!
      if (Array.isArray(data.expenses)) {
        this.state.expenses = mergeServerWithPending(data.expenses, this.state.pendingQueue);
      }

      this.state.auditWarnings = Array.isArray(data.auditWarnings) ? data.auditWarnings : [];
      this.state.connection.sheetName = data.sheetName || this.state.connection.sheetName;
      this.state.connection.lastSyncedAt = data.syncedAt || new Date().toISOString();
      this.state.isDemoMode = false;
      this.state.syncing = false;
      this.emit();
      return data;
    } catch (err) {
      this.state.syncing = false;
      this.state.lastError = err.message;
      this.emit();
      throw err;
    }
  }

  disconnectSheet() {
    this.state.connection = { webAppUrl: "", pin: "", sheetName: "", lastSyncedAt: null };
    this.state.expenses = [];
    this.state.auditWarnings = [];
    this.state.pendingQueue = [];
    this.state.failedQueue = [];
    this.state.tableVersions = defaultTableVersions();
    this.state.lastError = null;
    this.state.isDemoMode = false;
    safeRemoveStorage(STORAGE_KEY);
    this.emit();
  }

  resetDemoData() {
    this.state.accounts = structuredClone(DEFAULT_ACCOUNTS);
    this.state.expenses = createDemoExpenses();
    this.state.categories = structuredClone(DEFAULT_CATEGORIES);
    this.state.currencies = structuredClone(DEFAULT_CURRENCIES);
    this.state.auditWarnings = [];
    this.state.pendingQueue = [];
    this.state.failedQueue = [];
    this.state.isDemoMode = true;
    this.emit();
  }

  clearAllLocalExpenses() {
    this.state.expenses = [];
    this.state.auditWarnings = [];
    this.state.pendingQueue = [];
    this.state.failedQueue = [];
    this.state.isDemoMode = false;
    this.emit();
  }
}

export const store = new Store();
