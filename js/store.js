import {
  DEFAULT_SETTINGS,
  DEFAULT_CATEGORIES,
  DEFAULT_CURRENCIES,
  createDemoExpenses
} from "./defaults.js";
import * as api from "./sheets-api.js";

const STORAGE_KEY = "buget_familie_state_v1";

function loadSavedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function createInitialState() {
  const now = new Date();
  const saved = loadSavedState();
  if (saved) {
    return {
      connection: saved.connection || { webAppUrl: "", pin: "1234", sheetName: "", lastSyncedAt: null },
      activePartner: saved.activePartner || "p1",
      theme: saved.theme || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"),
      settings: { ...DEFAULT_SETTINGS, ...(saved.settings || {}) },
      categories: saved.categories && saved.categories.length ? saved.categories : structuredClone(DEFAULT_CATEGORIES),
      currencies: saved.currencies && saved.currencies.length ? saved.currencies : structuredClone(DEFAULT_CURRENCIES),
      expenses: Array.isArray(saved.expenses) ? saved.expenses : [],
      pendingQueue: Array.isArray(saved.pendingQueue) ? saved.pendingQueue : [],
      isDemoMode: saved.isDemoMode ?? false,
      selectedYear: now.getFullYear(),
      selectedMonth: now.getMonth(),
      scope: "all", // all | mine | partner | shared | private
      syncing: false,
      lastError: null
    };
  }

  return {
    connection: { webAppUrl: "", pin: "1234", sheetName: "", lastSyncedAt: null },
    activePartner: "p1",
    theme: window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
    settings: structuredClone(DEFAULT_SETTINGS),
    categories: structuredClone(DEFAULT_CATEGORIES),
    currencies: structuredClone(DEFAULT_CURRENCIES),
    expenses: createDemoExpenses(),
    pendingQueue: [],
    isDemoMode: true,
    selectedYear: now.getFullYear(),
    selectedMonth: now.getMonth(),
    scope: "all",
    syncing: false,
    lastError: null
  };
}

class Store {
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
      connection: this.state.connection,
      activePartner: this.state.activePartner,
      theme: this.state.theme,
      settings: this.state.settings,
      categories: this.state.categories,
      currencies: this.state.currencies,
      expenses: this.state.expenses,
      pendingQueue: this.state.pendingQueue,
      isDemoMode: this.state.isDemoMode
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch (_) {}
  }

  isConnected() {
    return Boolean(this.state.connection.webAppUrl && this.state.connection.webAppUrl.trim());
  }

  setTheme(theme) {
    this.state.theme = theme;
    document.documentElement.setAttribute("data-theme", theme);
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
    this.state.activePartner = partner === "p2" ? "p2" : "p1";
    this.emit();
    if (this.isConnected()) {
      this.sync().catch(() => {});
    }
  }

  getPartnerName(partnerKey) {
    return partnerKey === "p2" ? this.state.settings.partner2Name : this.state.settings.partner1Name;
  }

  getCategory(catId) {
    return (
      this.state.categories.find((c) => c.id === catId || c.name === catId) || {
        id: "altele",
        name: catId || "Altele",
        icon: "📦",
        color: "#94a3b8",
        budget: 0,
        group: "Altele"
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

  toBaseCurrency(amount, currencyCode) {
    const cur = this.getCurrency(currencyCode);
    const base = this.getCurrency(this.state.settings.baseCurrency);
    const val = Number(amount) || 0;
    if (cur.code === base.code) return Math.round(val * 100) / 100;
    // Cursul din tabel este față de moneda de bază (ex: 1 EUR = 4.98 RON)
    const rateToBase = base.rate ? cur.rate / base.rate : cur.rate;
    return Math.round(val * rateToBase * 100) / 100;
  }

  /**
   * Returnează cheltuielile vizibile pentru partenerul activ (ascunde cheltuielile private ale celuilalt partener)
   */
  getVisibleExpenses({ year = null, month = null, scope = null } = {}) {
    const me = this.state.activePartner;
    const other = me === "p1" ? "p2" : "p1";
    const activeScope = scope ?? this.state.scope;

    return this.state.expenses.filter((exp) => {
      // Protecție confidențialitate: nu afișăm niciodată cheltuielile private ale partenerului
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

  async addExpense(data) {
    const now = new Date().toISOString();
    const expense = {
      id: "exp_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6),
      date: data.date || now.slice(0, 10),
      title: String(data.title || "").trim(),
      amount: Number(data.amount) || 0,
      currency: String(data.currency || this.state.settings.baseCurrency).toUpperCase(),
      baseAmount: this.toBaseCurrency(data.amount, data.currency),
      category: data.category || "altele",
      paymentMethod: data.paymentMethod || "Card",
      isPrivate: Boolean(data.isPrivate),
      notes: String(data.notes || "").trim(),
      owner: this.state.activePartner,
      createdAt: now,
      updatedAt: now
    };

    this.state.expenses.unshift(expense);
    this.emit();

    if (this.isConnected()) {
      await this.enqueueAndFlush({ type: "addExpense", partner: expense.owner, expense });
    }
    return expense;
  }

  async updateExpense(id, updates) {
    const idx = this.state.expenses.findIndex((e) => e.id === id);
    if (idx === -1) return null;
    const existing = this.state.expenses[idx];
    const updated = {
      ...existing,
      ...updates,
      amount: Number(updates.amount ?? existing.amount) || 0,
      currency: String(updates.currency || existing.currency).toUpperCase(),
      updatedAt: new Date().toISOString()
    };
    updated.baseAmount = this.toBaseCurrency(updated.amount, updated.currency);
    this.state.expenses[idx] = updated;
    this.emit();

    if (this.isConnected()) {
      await this.enqueueAndFlush({ type: "updateExpense", partner: updated.owner, expense: updated });
    }
    return updated;
  }

  async deleteExpense(id) {
    const existing = this.state.expenses.find((e) => e.id === id);
    if (!existing) return;
    this.state.expenses = this.state.expenses.filter((e) => e.id !== id);
    this.emit();

    if (this.isConnected()) {
      await this.enqueueAndFlush({ type: "deleteExpense", partner: existing.owner, id });
    }
  }

  async importExpenses(list) {
    const now = new Date().toISOString();
    const normalized = list.map((item, idx) => {
      const currency = String(item.currency || this.state.settings.baseCurrency).toUpperCase();
      const amount = Number(item.amount) || 0;
      return {
        id: item.id || `imp_${Date.now()}_${idx}`,
        date: item.date || now.slice(0, 10),
        title: String(item.title || "Cheltuială importată").trim(),
        amount,
        currency,
        baseAmount: this.toBaseCurrency(amount, currency),
        category: item.category || "altele",
        paymentMethod: item.paymentMethod || "Card",
        isPrivate: Boolean(item.isPrivate),
        notes: String(item.notes || "").trim(),
        owner: this.state.activePartner,
        createdAt: now,
        updatedAt: now
      };
    });

    this.state.expenses = [...normalized, ...this.state.expenses];
    this.emit();

    if (this.isConnected() && normalized.length) {
      await this.enqueueAndFlush({
        type: "bulkImport",
        partner: this.state.activePartner,
        expenses: normalized
      });
    }
    return normalized.length;
  }

  async saveCategories(categories) {
    this.state.categories = categories;
    this.emit();
    if (this.isConnected()) {
      await this.enqueueAndFlush({ type: "saveCategories", categories });
    }
  }

  async saveCurrencies(currencies) {
    this.state.currencies = currencies;
    // Recalculăm baseAmount pentru cheltuielile locale
    this.state.expenses = this.state.expenses.map((e) => ({
      ...e,
      baseAmount: this.toBaseCurrency(e.amount, e.currency)
    }));
    this.emit();
    if (this.isConnected()) {
      await this.enqueueAndFlush({ type: "saveCurrencies", currencies });
    }
  }

  async saveSettings(newSettings) {
    this.state.settings = { ...this.state.settings, ...newSettings };
    this.emit();
    if (this.isConnected()) {
      await this.enqueueAndFlush({ type: "saveSettings", settings: this.state.settings });
    }
  }

  async enqueueAndFlush(op) {
    this.state.pendingQueue.push(op);
    this.persist();
    return this.flushQueue();
  }

  async flushQueue() {
    if (!this.isConnected() || !this.state.pendingQueue.length) return;
    if (!navigator.onLine) return;

    const { webAppUrl, pin } = this.state.connection;
    while (this.state.pendingQueue.length > 0) {
      const op = this.state.pendingQueue[0];
      try {
        if (op.type === "addExpense") {
          await api.pushAddExpense(webAppUrl, pin, op.partner, op.expense);
        } else if (op.type === "updateExpense") {
          await api.pushUpdateExpense(webAppUrl, pin, op.partner, op.expense);
        } else if (op.type === "deleteExpense") {
          await api.pushDeleteExpense(webAppUrl, pin, op.partner, op.id);
        } else if (op.type === "bulkImport") {
          await api.pushBulkImport(webAppUrl, pin, op.partner, op.expenses);
        } else if (op.type === "saveCategories") {
          await api.pushCategories(webAppUrl, pin, op.categories);
        } else if (op.type === "saveCurrencies") {
          await api.pushCurrencies(webAppUrl, pin, op.currencies);
        } else if (op.type === "saveSettings") {
          await api.pushSettings(webAppUrl, pin, op.settings);
        }
        this.state.pendingQueue.shift();
        this.state.lastError = null;
        this.persist();
      } catch (err) {
        this.state.lastError = err.message;
        this.emit();
        break;
      }
    }
    this.emit();
  }

  async connectAndSync({ webAppUrl, pin, partner, initialize = true }) {
    this.state.syncing = true;
    this.state.lastError = null;
    this.emit();

    try {
      const cleanUrl = webAppUrl.trim();
      const cleanPin = String(pin || "").trim();
      if (partner) this.state.activePartner = partner;

      if (initialize) {
        await api.initSheet(cleanUrl, cleanPin, this.state.settings);
      } else {
        await api.pingSheet(cleanUrl, cleanPin);
      }

      this.state.connection = {
        ...this.state.connection,
        webAppUrl: cleanUrl,
        pin: cleanPin
      };
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
      const data = await api.syncFromSheet(webAppUrl, pin, this.state.activePartner);

      if (data.settings) {
        this.state.settings = { ...DEFAULT_SETTINGS, ...data.settings };
      }
      if (data.categories && data.categories.length) {
        this.state.categories = data.categories;
      }
      if (data.currencies && data.currencies.length) {
        this.state.currencies = data.currencies;
      }
      if (Array.isArray(data.expenses)) {
        // Sortăm descrescător după dată
        this.state.expenses = data.expenses.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      }
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
    this.state.connection = { webAppUrl: "", pin: "1234", sheetName: "", lastSyncedAt: null };
    this.state.pendingQueue = [];
    this.state.lastError = null;
    this.emit();
  }

  resetDemoData() {
    this.state.expenses = createDemoExpenses();
    this.state.categories = structuredClone(DEFAULT_CATEGORIES);
    this.state.currencies = structuredClone(DEFAULT_CURRENCIES);
    this.state.settings = structuredClone(DEFAULT_SETTINGS);
    this.state.isDemoMode = true;
    this.emit();
  }

  clearAllLocalExpenses() {
    this.state.expenses = [];
    this.state.isDemoMode = false;
    this.emit();
  }
}

export const store = new Store();
