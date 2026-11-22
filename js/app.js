import {
  MONTHS_RO,
  PAYMENT_METHODS,
  CATEGORY_GROUPS,
  TX_TYPES,
  ACCOUNT_TYPES,
  INITIAL_BALANCE_TYPES
} from "./defaults.js";
import { store } from "./store.js";
import { computeMonthlyAnalytics, formatMoney } from "./insights.js";
import { computeAccountBalances } from "./ledger.js";
import { renderDonutChart, renderMonthlyTrendChart, renderDailyBarsChart } from "./charts.js";
import { exportToExcel, previewImportFile } from "./excel.js";
import { encodeSetupCode, decodeSetupCode, buildTransferLink } from "./sheets-api.js";

let currentView = "dashboard";
let txSearch = "";
let txTypeFilter = "all";
let txCategoryFilter = "all";
let txCurrencyFilter = "all";
let editingExpenseId = null;

const $ = (sel, root = document) => root.querySelector(sel);

function esc(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function showToast(msg, duration = 3200) {
  const wrap = $("#toast-container");
  if (!wrap) return;
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transition = "opacity 0.25s";
    setTimeout(() => el.remove(), 260);
  }, duration);
}

// =========================================================================
// Inițializare & Portabilitate FĂRĂ credențiale în URL (#setup=BF2-...)
// =========================================================================
function checkUrlSetupHash() {
  const hash = window.location.hash || "";
  if (!hash.includes("setup=BF2-")) return;
  try {
    const cfg = decodeSetupCode(hash);
    history.replaceState(null, "", window.location.pathname + window.location.search);
    store.state.connection.webAppUrl = cfg.webAppUrl;
    store.persist();
    currentView = "settings";
    render();
    showToast("Adresa Web App a fost preluată. Introdu PIN-ul tău personal în Setări pentru conectare.", 5000);
  } catch (err) {
    showToast("Eroare la link-ul de configurare: " + err.message, 5000);
  }
}

function initApp() {
  document.documentElement.setAttribute("data-theme", store.state.theme);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  window.addEventListener("online", () => {
    if (store.isConnected()) {
      store.flushQueue().then(() => {
        if (!store.state.pendingQueue.length) showToast("Conexiune restabilită — date sincronizate!");
      });
    }
  });

  store.subscribe(() => render());
  bindGlobalEvents();
  render();
  checkUrlSetupHash();

  if (store.isConnected() && navigator.onLine) {
    store.sync().catch(() => {});
  }
}

function bindGlobalEvents() {
  document.addEventListener("click", (e) => {
    const navBtn = e.target.closest("[data-view]");
    if (navBtn) {
      currentView = navBtn.dataset.view;
      render();
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const partnerBtn = e.target.closest("[data-switch-partner]");
    if (partnerBtn) {
      if (store.isConnected()) {
        showToast("Când ești conectat, profilul este determinat automat de PIN-ul tău personal.", 3500);
        return;
      }
      store.setActivePartner(partnerBtn.dataset.switchPartner);
      showToast(`Profil demo activ: ${store.getPartnerName(store.state.activePartner)}`);
      return;
    }

    const scopeBtn = e.target.closest("[data-scope]");
    if (scopeBtn) {
      store.setScope(scopeBtn.dataset.scope);
      return;
    }

    if (e.target.closest("#btn-prev-month")) { store.shiftMonth(-1); return; }
    if (e.target.closest("#btn-next-month")) { store.shiftMonth(1); return; }
    if (e.target.closest("#btn-theme")) { store.toggleTheme(); return; }
    if (e.target.closest("#btn-sync")) { handleManualSync(); return; }
    if (e.target.closest("#fab-add")) { openExpenseModal(null); return; }

    const txRow = e.target.closest("[data-edit-expense]");
    if (txRow) {
      openExpenseModal(txRow.dataset.editExpense);
      return;
    }

    if (e.target.closest("[data-close-modal]") || e.target.classList.contains("modal-backdrop")) {
      closeModals();
      return;
    }
  });
}

async function handleManualSync() {
  if (!store.isConnected()) {
    currentView = "settings";
    render();
    showToast("Conectează fișierul Google Sheets din Setări.");
    return;
  }
  try {
    await store.sync();
    showToast("Sincronizat cu Google Sheets!");
  } catch (err) {
    showToast("Eroare sincronizare: " + err.message, 4500);
  }
}

// =========================================================================
// Render principal
// =========================================================================
function render() {
  renderChrome();
  const root = $("#view-root");
  if (currentView === "dashboard") root.innerHTML = renderDashboard();
  else if (currentView === "transactions") root.innerHTML = renderTransactions();
  else if (currentView === "analytics") root.innerHTML = renderAnalytics();
  else if (currentView === "catalog") root.innerHTML = renderCatalog();
  else if (currentView === "settings") root.innerHTML = renderSettings();

  bindViewSpecificEvents();
}

function renderChrome() {
  const s = store.state;
  document.querySelectorAll("[data-view]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === currentView);
  });

  const p1Btn = $("#pill-p1");
  const p2Btn = $("#pill-p2");
  if (p1Btn && p2Btn) {
    p1Btn.textContent = s.settings.partner1Name || "Eu";
    p2Btn.textContent = s.settings.partner2Name || "Soția";
    p1Btn.classList.toggle("active", s.activePartner === "p1");
    p2Btn.classList.toggle("active", s.activePartner === "p2");
  }

  const themeBtn = $("#btn-theme");
  if (themeBtn) themeBtn.textContent = s.theme === "dark" ? "☀️" : "🌙";

  const syncDot = $("#sync-dot");
  const syncLabel = $("#sync-label");
  if (syncDot && syncLabel) {
    syncDot.className = "sync-dot";
    if (s.syncing) {
      syncDot.classList.add("spinning");
      syncLabel.textContent = "Sincronizare...";
    } else if (!store.isConnected()) {
      syncLabel.textContent = s.isDemoMode ? "Demo" : "Local";
    } else if (s.lastError) {
      syncDot.classList.add("error");
      syncLabel.textContent = "Eroare";
    } else if (s.pendingQueue.length > 0) {
      syncDot.classList.add("pending");
      syncLabel.textContent = `Coadă (${s.pendingQueue.length})`;
    } else {
      syncDot.classList.add("online");
      syncLabel.textContent = "Sheets OK";
    }
  }
}

function renderControlsRow() {
  const s = store.state;
  const monthName = `${MONTHS_RO[s.selectedMonth]} ${s.selectedYear}`;
  const meName = store.getPartnerName(s.activePartner);
  const otherName = store.getPartnerName(s.activePartner === "p1" ? "p2" : "p1");

  const scopes = [
    { id: "all", label: "Împreună" },
    { id: "shared", label: "Doar Comune" },
    { id: "mine", label: `Doar ${meName}` },
    { id: "partner", label: `Doar ${otherName}` },
    { id: "private", label: "🔒 Privatele mele" }
  ];

  return `
    <div class="controls-row">
      <div class="month-nav">
        <button id="btn-prev-month" aria-label="Luna anterioară">‹</button>
        <div class="month-label">${monthName}</div>
        <button id="btn-next-month" aria-label="Luna următoare">›</button>
      </div>
      <div class="scope-pills">
        ${scopes.map((sc) => `<button class="chip ${s.scope === sc.id ? "active" : ""}" data-scope="${sc.id}">${esc(sc.label)}</button>`).join("")}
      </div>
    </div>
  `;
}

function renderStatusBanners() {
  const s = store.state;
  let html = "";
  if (s.failedQueue && s.failedQueue.length > 0) {
    html += `
      <div class="banner error">
        <div class="banner-text">
          <strong>Conflicte / Operații eșuate (${s.failedQueue.length}):</strong>
          ${s.failedQueue.slice(0, 2).map((f) => `[${esc(f.errorCode)}] ${esc(f.error)}`).join(" • ")}
        </div>
        <button class="btn btn-sm btn-secondary" id="btn-clear-failed">Am înțeles</button>
      </div>
    `;
  }
  if (s.lastError) {
    html += `
      <div class="banner error">
        <div class="banner-text"><strong>Atenție sincronizare:</strong> ${esc(s.lastError)}</div>
        <button class="btn btn-sm btn-secondary" id="btn-retry-sync">Reîncearcă</button>
      </div>
    `;
  } else if (s.auditWarnings && s.auditWarnings.length > 0) {
    html += `
      <div class="banner error">
        <div class="banner-text"><strong>Audit date Sheet:</strong> ${s.auditWarnings.length} avertisment(e) (ex. rânduri fără ID, sume negative sau Suma_Baza necorelată).</div>
        <button class="btn btn-sm btn-secondary" data-view="analytics">Detalii</button>
      </div>
    `;
  } else if (!store.isConnected() && s.isDemoMode) {
    html += `
      <div class="banner">
        <div class="banner-text"><strong>Mod Demo (date fictive)</strong> — Explorează conturile, veniturile, transferurile și importul cu previzualizare.</div>
        <button class="btn btn-sm btn-primary" data-view="settings">Setări Sheets</button>
      </div>
    `;
  }
  return html;
}

// =========================================================================
// 1. DASHBOARD (ACASĂ)
// =========================================================================
function renderDashboard() {
  const s = store.state;
  const a = computeMonthlyAnalytics(store, s.selectedYear, s.selectedMonth, s.scope);
  const p1Name = s.settings.partner1Name;
  const p2Name = s.settings.partner2Name;

  const progressClass = a.budgetPct >= 100 ? "danger" : a.budgetPct >= 80 ? "warn" : "";
  const deltaText =
    a.diffPrevPct === null
      ? "Prima lună cu date"
      : `${a.diffPrevPct >= 0 ? "↑" : "↓"} ${Math.abs(a.diffPrevPct)}% față de luna trecută`;

  const splitTotal = a.p1Total + a.p2Total;
  const p1Pct = splitTotal > 0 ? Math.round((a.p1Total / splitTotal) * 100) : 50;
  const p2Pct = splitTotal > 0 ? 100 - p1Pct : 50;

  const activeAccounts = a.accountBalances.filter((acc) => !acc.archived);
  const recent = a.expenses.slice(0, 6);

  return `
    ${renderStatusBanners()}
    ${renderControlsRow()}

    <section class="card hero-card">
      <div class="hero-top">
        <div>
          <div class="hero-label">Cheltuieli nete (${MONTHS_RO[s.selectedMonth]})</div>
          <div class="hero-amount">${formatMoney(a.total, a.baseCur)}</div>
          <span class="hero-delta">${deltaText}</span>
        </div>
        <div style="text-align:right">
          <div class="hero-label">${a.count} ${a.count === 1 ? "tranzacție" : "tranzacții"}</div>
        </div>
      </div>

      ${a.monthlyBudget > 0 ? `
        <div class="budget-progress">
          <div class="progress-meta">
            <span>Buget: ${formatMoney(a.monthlyBudget, a.baseCur)}</span>
            <span>${Math.round(a.budgetPct)}% (${a.remainingBudget >= 0 ? "rămas " + formatMoney(a.remainingBudget, a.baseCur) : "depășit cu " + formatMoney(Math.abs(a.remainingBudget), a.baseCur)})</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill ${progressClass}" style="width:${Math.min(100, Math.round(a.budgetPct))}%"></div>
          </div>
        </div>
      ` : ""}

      <div class="hero-stats">
        <div>
          <div class="hero-stat-label">Venituri</div>
          <div class="hero-stat-val">${formatMoney(a.ledger.venituri, a.baseCur)}</div>
        </div>
        <div>
          <div class="hero-stat-label">Balanță netă</div>
          <div class="hero-stat-val">${a.ledger.balantaNeta >= 0 ? "+" : ""}${formatMoney(a.ledger.balantaNeta, a.baseCur)}</div>
        </div>
        <div>
          <div class="hero-stat-label">Medie / zi</div>
          <div class="hero-stat-val">${formatMoney(a.dailyAvg, a.baseCur)}</div>
        </div>
      </div>
    </section>

    <section class="card">
      <div class="card-header">
        <h2 class="card-title">🏦 Conturi & Solduri (${activeAccounts.length})</h2>
        <button class="btn btn-sm btn-secondary" data-view="catalog">Gestionează</button>
      </div>
      <div class="item-grid">
        ${activeAccounts.map((acc) => `
          <div class="mini-card">
            <div class="mini-left">
              <div class="mini-icon" style="background:var(--primary-soft); color:var(--primary)">${acc.type === "datorie" ? "🏛️" : acc.type === "cash" ? "💵" : "🏦"}</div>
              <div>
                <div style="font-weight:700; font-size:0.86rem">${esc(acc.name)}</div>
                <div class="card-sub">${esc(store.getPartnerName(acc.owner))} • ${esc(acc.initialBalanceType || "verificat")}</div>
              </div>
            </div>
            <div style="text-align:right; font-weight:800; font-size:0.88rem; color:${acc.balance < 0 ? "var(--danger)" : "var(--text)"}">
              ${formatMoney(acc.balance, acc.currency)}
            </div>
          </div>
        `).join("")}
      </div>
    </section>

    <div class="grid-2">
      <section class="card">
        <div class="card-header">
          <h2 class="card-title">👥 Contribuție Cheltuieli Nete</h2>
          <span class="card-sub">Fără transferuri</span>
        </div>
        <div class="split-bar">
          <div class="split-p1" style="width:${p1Pct}%"></div>
          <div class="split-p2" style="width:${p2Pct}%"></div>
        </div>
        <div class="split-labels">
          <div class="split-partner">
            <span class="dot" style="background:var(--p1)"></span>
            <div>
              <div style="font-weight:700">${esc(p1Name)} (${p1Pct}%)</div>
              <div class="card-sub">${formatMoney(a.p1Total, a.baseCur)}</div>
            </div>
          </div>
          <div class="split-partner" style="text-align:right">
            <div>
              <div style="font-weight:700">${esc(p2Name)} (${p2Pct}%)</div>
              <div class="card-sub">${formatMoney(a.p2Total, a.baseCur)}</div>
            </div>
            <span class="dot" style="background:var(--p2)"></span>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-header">
          <h2 class="card-title">💡 Insights Automate</h2>
          <button class="btn btn-sm btn-secondary" data-view="analytics">Toate →</button>
        </div>
        <div class="insights-list">
          ${a.insights.slice(0, 2).map((ins) => `
            <div class="insight-item ${ins.type}">
              <div class="insight-icon">${ins.icon}</div>
              <div>
                <div class="insight-title">${esc(ins.title)}</div>
                <div class="insight-text">${esc(ins.text)}</div>
              </div>
            </div>
          `).join("")}
        </div>
      </section>
    </div>

    <section class="card">
      <div class="card-header">
        <h2 class="card-title">🧾 Ultimele Tranzacții</h2>
        <button class="btn btn-sm btn-secondary" data-view="transactions">Vezi toate (${a.count})</button>
      </div>
      ${recent.length ? `<div class="tx-list">${recent.map((e) => renderTxRow(e, a.baseCur)).join("")}</div>` : `
        <div class="empty-state">
          <div class="big-ic">🛍️</div>
          <div>Nu ai tranzacții în ${MONTHS_RO[s.selectedMonth]}. Apasă <strong>+</strong> pentru a adăuga!</div>
        </div>
      `}
    </section>
  `;
}

function renderTxRow(exp, baseCur) {
  const cat = store.getCategory(exp.category);
  const typeMeta = TX_TYPES[exp.type || "cheltuiala"] || TX_TYPES.cheltuiala;
  const ownerName = store.getPartnerName(exp.owner);
  const ownerClass = exp.owner === "p2" ? "badge-p2" : "badge-p1";
  const acc = exp.accountId ? store.getAccount(exp.accountId) : null;
  const showOrig = exp.currency && exp.currency !== (exp.baseCurrency || baseCur);
  const isPositiveFlow = exp.type === "venit" || exp.type === "rambursare_comerciant" || (exp.direction === "in" && exp.type !== "cheltuiala");

  return `
    <div class="tx-item" data-edit-expense="${esc(exp.id)}">
      <div class="tx-icon" style="background:${cat.color}20; color:${cat.color}">${exp.type === "cheltuiala" || !exp.type ? cat.icon : typeMeta.icon}</div>
      <div class="tx-main">
        <div class="tx-title">
          <span>${esc(exp.title)}</span>
          ${exp.type && exp.type !== "cheltuiala" ? `<span class="badge badge-private">${esc(typeMeta.label)}</span>` : ""}
          ${exp.isPrivate ? `<span class="badge badge-private">🔒 Privat</span>` : ""}
          ${exp.pendingSync ? `<span class="badge" style="background:var(--warning-soft); color:var(--warning)">⏳ În așteptare</span>` : ""}
          ${exp.baseMismatch ? `<span class="badge" style="background:var(--danger-soft); color:var(--danger)">⚠️ Curs</span>` : ""}
        </div>
        <div class="tx-meta">
          <span>${esc(exp.date)}</span>
          <span>• ${esc(cat.name)}</span>
          ${acc ? `<span>• ${esc(acc.name)}</span>` : ""}
          <span class="badge ${ownerClass}">${esc(ownerName)}</span>
        </div>
      </div>
      <div class="tx-right">
        <div class="tx-amount" style="color:${isPositiveFlow ? "var(--success)" : "var(--text)"}">
          ${isPositiveFlow ? "+" : ""}${formatMoney(exp.baseAmount, exp.baseCurrency || baseCur)}
        </div>
        ${showOrig ? `<div class="tx-orig">${formatMoney(exp.amount, exp.currency)}</div>` : ""}
      </div>
    </div>
  `;
}

// =========================================================================
// 2. TRANZACȚII (LISTĂ COMPLETĂ + FILTRE + IMPORT CU PREVIZUALIZARE)
// =========================================================================
function renderTransactions() {
  const s = store.state;
  const baseCur = s.settings.baseCurrency || "RON";
  let list = store.getVisibleExpenses({ year: s.selectedYear, month: s.selectedMonth, scope: s.scope });

  if (txTypeFilter !== "all") {
    list = list.filter((e) => (e.type || "cheltuiala") === txTypeFilter);
  }
  if (txCategoryFilter !== "all") {
    list = list.filter((e) => e.category === txCategoryFilter);
  }
  if (txCurrencyFilter !== "all") {
    list = list.filter((e) => e.currency === txCurrencyFilter);
  }
  if (txSearch.trim()) {
    const q = txSearch.trim().toLowerCase();
    list = list.filter(
      (e) =>
        (e.title || "").toLowerCase().includes(q) ||
        (e.notes || "").toLowerCase().includes(q) ||
        store.getCategory(e.category).name.toLowerCase().includes(q)
    );
  }

  return `
    ${renderControlsRow()}

    <section class="card">
      <div class="card-header">
        <div>
          <h2 class="card-title">📋 Toate Tranzacțiile (${list.length})</h2>
          <div class="card-sub">Importul oferă previzualizare, validare și totaluri de control înainte de scriere</div>
        </div>
        <div class="btn-row">
          <button class="btn btn-sm btn-secondary" id="btn-export-excel">⬇️ Export Excel</button>
          <label class="btn btn-sm btn-primary" style="cursor:pointer">
            ⬆️ Import (cu previzualizare)
            <input type="file" id="input-import-excel" accept=".xlsx,.xls,.csv" hidden>
          </label>
        </div>
      </div>

      <div class="filter-bar" style="margin-bottom:14px">
        <input class="input" id="tx-search" type="search" placeholder="Caută magazin, titlu, notițe..." value="${esc(txSearch)}">
        <select class="select" id="tx-type-filter">
          <option value="all">Toate tipurile</option>
          ${Object.values(TX_TYPES).map((t) => `<option value="${esc(t.id)}" ${txTypeFilter === t.id ? "selected" : ""}>${t.icon} ${esc(t.label)}</option>`).join("")}
        </select>
        <select class="select" id="tx-cat-filter">
          <option value="all">Toate categoriile</option>
          ${s.categories.map((c) => `<option value="${esc(c.id)}" ${txCategoryFilter === c.id ? "selected" : ""}>${c.icon} ${esc(c.name)}</option>`).join("")}
        </select>
      </div>

      ${list.length ? `<div class="tx-list">${list.map((e) => renderTxRow(e, baseCur)).join("")}</div>` : `
        <div class="empty-state">
          <div class="big-ic">🔍</div>
          <div>Nicio tranzacție nu corespunde filtrelor selectate.</div>
        </div>
      `}
    </section>
  `;
}

// =========================================================================
// 3. STATISTICI & INSIGHTS
// =========================================================================
function renderAnalytics() {
  const s = store.state;
  const a = computeMonthlyAnalytics(store, s.selectedYear, s.selectedMonth, s.scope);

  return `
    ${renderControlsRow()}

    <section class="card">
      <div class="card-header">
        <h2 class="card-title">🧠 Insights & Audit Contabil — ${MONTHS_RO[s.selectedMonth]}</h2>
        <span class="card-sub">${a.insights.length} analize</span>
      </div>
      <div class="insights-list">
        ${a.insights.map((ins) => `
          <div class="insight-item ${ins.type}">
            <div class="insight-icon">${ins.icon}</div>
            <div>
              <div class="insight-title">${esc(ins.title)}</div>
              <div class="insight-text">${esc(ins.text)}</div>
            </div>
          </div>
        `).join("")}
      </div>
    </section>

    <section class="card">
      <div class="card-header">
        <h2 class="card-title">🍩 Cheltuieli Nete pe Categorii</h2>
        <span class="card-sub">${a.byCategory.length} categorii active</span>
      </div>
      ${renderDonutChart(a.byCategory, a.total, a.baseCur)}
    </section>

    <div class="grid-2">
      <section class="card">
        <div class="card-header">
          <h2 class="card-title">📊 Evoluție Ultimele 6 Luni</h2>
          <span class="card-sub">Comparație parteneri</span>
        </div>
        ${renderMonthlyTrendChart(a.trend6Months, a.monthlyBudget, s.settings.partner1Name, s.settings.partner2Name, a.baseCur)}
      </section>

      <section class="card">
        <div class="card-header">
          <h2 class="card-title">📅 Ritm Zilnic — ${MONTHS_RO[s.selectedMonth]}</h2>
          <span class="card-sub">Medie: ${formatMoney(a.dailyAvg, a.baseCur)}/zi</span>
        </div>
        ${renderDailyBarsChart(a.dailyTotals, a.baseCur)}
      </section>
    </div>
  `;
}

// =========================================================================
// 4. CONTURI, CATEGORII & VALUTE
// =========================================================================
function renderCatalog() {
  const s = store.state;
  const baseCur = s.settings.baseCurrency || "RON";
  const balances = computeAccountBalances(s.accounts || [], store.getVisibleExpenses({ scope: "all" }));

  return `
    <section class="card">
      <div class="card-header">
        <div>
          <h2 class="card-title">🏦 Conturi cu Sold (${balances.length})</h2>
          <div class="card-sub">Soldurile se calculează din soldul inițial + tranzacțiile legate de fiecare cont</div>
        </div>
        <button class="btn btn-sm btn-primary" id="btn-add-account">+ Cont</button>
      </div>
      <div class="item-grid">
        ${balances.map((acc) => `
          <div class="mini-card">
            <div class="mini-left">
              <div class="mini-icon" style="background:var(--primary-soft); color:var(--primary)">${acc.type === "datorie" ? "🏛️" : "🏦"}</div>
              <div>
                <div style="font-weight:700; font-size:0.86rem">${esc(acc.name)} ${acc.archived ? "(Arhivat)" : ""}</div>
                <div class="card-sub">Sold: <strong>${formatMoney(acc.balance, acc.currency)}</strong> • Inițial: ${acc.initialBalance} (${esc(acc.initialBalanceType || "verificat")})</div>
              </div>
            </div>
            <button class="icon-btn" data-edit-acc="${esc(acc.id)}" title="Editează cont">✏️</button>
          </div>
        `).join("")}
      </div>
    </section>

    <section class="card">
      <div class="card-header">
        <div>
          <h2 class="card-title">🏷️ Categorii (${s.categories.length})</h2>
          <div class="card-sub">Include categorii separate pentru cheltuieli și venituri</div>
        </div>
        <button class="btn btn-sm btn-primary" id="btn-add-category">+ Categorie</button>
      </div>
      <div class="item-grid">
        ${s.categories.map((c) => `
          <div class="mini-card">
            <div class="mini-left">
              <div class="mini-icon" style="background:${c.color}20; color:${c.color}">${c.icon}</div>
              <div>
                <div style="font-weight:700; font-size:0.86rem">${esc(c.name)}</div>
                <div class="card-sub">${esc(c.kind || "cheltuiala")} ${c.budget > 0 ? `• Buget: ${formatMoney(c.budget, baseCur)}` : ""}</div>
              </div>
            </div>
            <button class="icon-btn" data-edit-cat="${esc(c.id)}" title="Editează">✏️</button>
          </div>
        `).join("")}
      </div>
    </section>

    <section class="card">
      <div class="card-header">
        <div>
          <h2 class="card-title">💱 Valute & Cursuri Curente (${s.currencies.length})</h2>
          <div class="card-sub">Monedă de bază: <strong>${esc(baseCur)}</strong>. Modificarea unui curs NU schimbă sumele istorice deja înregistrate.</div>
        </div>
        <button class="btn btn-sm btn-primary" id="btn-add-currency">+ Valută</button>
      </div>
      <div class="item-grid">
        ${s.currencies.map((c) => `
          <div class="mini-card">
            <div class="mini-left">
              <div class="mini-icon" style="background:var(--primary-soft); color:var(--primary); font-weight:800; font-size:0.88rem">${esc(c.symbol)}</div>
              <div>
                <div style="font-weight:700; font-size:0.88rem">${esc(c.code)} — ${esc(c.name)}</div>
                <div class="card-sub">1 ${esc(c.code)} = <strong>${c.rate}</strong> ${esc(baseCur)}</div>
              </div>
            </div>
            <button class="icon-btn" data-edit-cur="${esc(c.code)}" title="Editează curs">✏️</button>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

// =========================================================================
// 5. SETĂRI, SECURITATE PER PARTENER & PORTABILITATE FĂRĂ CREDENȚIALE
// =========================================================================
function renderSettings() {
  const s = store.state;
  const connected = store.isConnected();

  return `
    <section class="card">
      <div class="card-header">
        <div>
          <h2 class="card-title">☁️ Conectare Securizată Google Sheets</h2>
          <div class="card-sub">${connected ? `Autentificat de server ca: ${esc(store.getPartnerName(s.activePartner))} (${esc(s.connection.sheetName || "Sheet")})` : "Neconectat — autentificare prin PIN personal (minim 6 caractere, fără PIN implicit)"}</div>
        </div>
        ${connected ? `<span class="badge" style="background:var(--success-soft); color:var(--success)">● Conectat</span>` : ""}
      </div>

      <form id="form-connection" class="form-grid">
        <div class="field">
          <label>URL Google Apps Script (Web App)</label>
          <input class="input" id="conn-url" type="url" placeholder="https://script.google.com/macros/s/.../exec" value="${esc(s.connection.webAppUrl)}" required>
        </div>
        <div class="field">
          <label>PIN-ul tău personal (PIN_P1 sau PIN_P2 din Script Properties — minim 6 caractere)</label>
          <input class="input" id="conn-pin" type="password" placeholder="Introdu PIN-ul tău personal" value="${esc(s.connection.pin)}" minlength="6" required>
        </div>
        <div class="card-sub">
          Identitatea partenerului (<code>p1</code> sau <code>p2</code>) este determinată <strong>exclusiv de server din PIN</strong> prin POST (niciodată în URL).
        </div>
        <div class="btn-row">
          <button type="submit" class="btn btn-primary">🔗 Conectează & Inițializează</button>
          ${connected ? `<button type="button" class="btn btn-secondary" id="btn-settings-sync">🔄 Sincronizează</button>` : ""}
          ${connected ? `<button type="button" class="btn btn-danger" id="btn-disconnect">Deconectează & Șterge cache local</button>` : ""}
        </div>
      </form>
    </section>

    <section class="card">
      <div class="card-header">
        <div>
          <h2 class="card-title">📱 Portabilitate Telefon Nou (Fără credențiale în link)</h2>
          <div class="card-sub">Link-ul <code>BF2-...</code> transmite DOAR adresa Web App. Fiecare partener își introduce PIN-ul propriu separat.</div>
        </div>
      </div>

      ${s.connection.webAppUrl ? `
        <div class="btn-row" style="margin-bottom:12px">
          <button class="btn btn-primary" id="btn-gen-transfer">📤 Generează Link/Cod (fără PIN)</button>
        </div>
        <div id="transfer-output" style="display:none; margin-bottom:14px"></div>
      ` : `<div class="card-sub" style="margin-bottom:12px">Introdu adresa Web App mai sus pentru a genera un link de configurare fără PIN.</div>`}

      <div style="padding-top:12px; border-top:1px solid var(--border)">
        <label style="display:block; font-size:0.8rem; font-weight:700; color:var(--text-muted); margin-bottom:6px">Ai primit un cod BF2-...?</label>
        <div style="display:flex; gap:8px">
          <input class="input" id="input-setup-code" placeholder="Lipește aici codul BF2-... (fără PIN)">
          <button class="btn btn-primary" id="btn-apply-setup-code">Preia URL</button>
        </div>
      </div>
    </section>

    <section class="card">
      <div class="card-header">
        <h2 class="card-title">⚙️ Preferințe Familie & Monedă de Bază</h2>
      </div>
      <form id="form-family-settings" class="form-grid">
        <div class="form-grid cols-2">
          <div class="field">
            <label>Nume Partener 1</label>
            <input class="input" id="set-p1-name" value="${esc(s.settings.partner1Name)}" required>
          </div>
          <div class="field">
            <label>Tab Partener 1</label>
            <input class="input" id="set-p1-tab" value="${esc(s.settings.partner1Tab)}" required>
          </div>
        </div>
        <div class="form-grid cols-2">
          <div class="field">
            <label>Nume Partener 2</label>
            <input class="input" id="set-p2-name" value="${esc(s.settings.partner2Name)}" required>
          </div>
          <div class="field">
            <label>Tab Partener 2</label>
            <input class="input" id="set-p2-tab" value="${esc(s.settings.partner2Tab)}" required>
          </div>
        </div>
        <div class="form-grid cols-2">
          <div class="field">
            <label>Monedă de bază configurabilă (ex. EUR sau RON)</label>
            <select class="select" id="set-base-cur">
              ${s.currencies.map((c) => `<option value="${esc(c.code)}" ${s.settings.baseCurrency === c.code ? "selected" : ""}>${esc(c.code)} — ${esc(c.name)}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label>Buget lunar țintă (${esc(s.settings.baseCurrency)})</label>
            <input class="input" id="set-budget" type="number" min="0" step="50" value="${Number(s.settings.monthlyBudget) || 0}">
          </div>
        </div>
        <div class="btn-row">
          <button type="submit" class="btn btn-primary">💾 Salvează setările</button>
        </div>
      </form>
    </section>

    <section class="card">
      <div class="card-header">
        <h2 class="card-title">🛠️ Date locale & Demo</h2>
      </div>
      <div class="btn-row">
        <button class="btn btn-secondary" id="btn-export-excel-2">⬇️ Export Excel (.xlsx)</button>
        <button class="btn btn-secondary" id="btn-load-demo">✨ Încarcă date Demo fictive</button>
        <button class="btn btn-danger" id="btn-clear-local">🗑️ Golește datele locale</button>
      </div>
    </section>
  `;
}

// =========================================================================
// Evenimente specifice fiecărei pagini
// =========================================================================
function bindViewSpecificEvents() {
  const retryBtn = $("#btn-retry-sync");
  if (retryBtn) retryBtn.onclick = handleManualSync;
  const clearFailedBtn = $("#btn-clear-failed");
  if (clearFailedBtn) clearFailedBtn.onclick = () => store.clearFailedQueue();

  const searchEl = $("#tx-search");
  if (searchEl) {
    searchEl.oninput = (e) => {
      txSearch = e.target.value;
      render();
      const el = $("#tx-search");
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    };
  }
  const typeF = $("#tx-type-filter");
  if (typeF) typeF.onchange = (e) => { txTypeFilter = e.target.value; render(); };
  const catF = $("#tx-cat-filter");
  if (catF) catF.onchange = (e) => { txCategoryFilter = e.target.value; render(); };

  const handleExport = async () => {
    try {
      const res = await exportToExcel(store);
      showToast(`Exportat ${res.count} tranzacții (.${res.format})!`);
    } catch (err) {
      showToast("Eroare export: " + err.message, 4000);
    }
  };
  const expBtn = $("#btn-export-excel");
  if (expBtn) expBtn.onclick = handleExport;
  const expBtn2 = $("#btn-export-excel-2");
  if (expBtn2) expBtn2.onclick = handleExport;

  const impInput = $("#input-import-excel");
  if (impInput) {
    impInput.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const report = await previewImportFile(file, store);
        openImportPreviewModal(file.name, report);
      } catch (err) {
        showToast("Eroare citire fișier: " + err.message, 4500);
      }
      e.target.value = "";
    };
  }

  // Conturi, Categorii, Valute
  const addAccBtn = $("#btn-add-account");
  if (addAccBtn) addAccBtn.onclick = () => openAccountModal(null);
  document.querySelectorAll("[data-edit-acc]").forEach((btn) => {
    btn.onclick = () => openAccountModal(btn.dataset.editAcc);
  });

  const addCatBtn = $("#btn-add-category");
  if (addCatBtn) addCatBtn.onclick = () => openCategoryModal(null);
  document.querySelectorAll("[data-edit-cat]").forEach((btn) => {
    btn.onclick = () => openCategoryModal(btn.dataset.editCat);
  });

  const addCurBtn = $("#btn-add-currency");
  if (addCurBtn) addCurBtn.onclick = () => openCurrencyModal(null);
  document.querySelectorAll("[data-edit-cur]").forEach((btn) => {
    btn.onclick = () => openCurrencyModal(btn.dataset.editCur);
  });

  // Setări conectare
  const connForm = $("#form-connection");
  if (connForm) {
    connForm.onsubmit = async (e) => {
      e.preventDefault();
      try {
        showToast("Se autentifică și se sincronizează...");
        await store.connectAndSync({
          webAppUrl: $("#conn-url").value,
          pin: $("#conn-pin").value,
          initialize: true
        });
        showToast(`Conectat ca ${store.getPartnerName(store.state.activePartner)}!`);
      } catch (err) {
        showToast("Eroare conectare: " + err.message, 5000);
      }
    };
  }

  const setSyncBtn = $("#btn-settings-sync");
  if (setSyncBtn) setSyncBtn.onclick = handleManualSync;

  const discBtn = $("#btn-disconnect");
  if (discBtn) {
    discBtn.onclick = () => {
      if (confirm("Deconectezi Google Sheets și ștergi datele sincronizate din localStorage de pe acest telefon?")) {
        store.disconnectSheet();
        showToast("Deconectat și cache local curățat.");
      }
    };
  }

  const genTr = $("#btn-gen-transfer");
  if (genTr) {
    genTr.onclick = () => {
      const cfg = { webAppUrl: store.state.connection.webAppUrl };
      const code = encodeSetupCode(cfg);
      const link = buildTransferLink(cfg);
      const out = $("#transfer-output");
      out.style.display = "block";
      out.innerHTML = `
        <div class="code-box" style="margin-bottom:8px">
          <div style="font-weight:700; margin-bottom:4px; font-family:inherit">Cod configurare (DOAR URL, fără PIN):</div>
          <div>${esc(code)}</div>
        </div>
        <div class="btn-row">
          <button class="btn btn-sm btn-primary" id="btn-copy-link">🔗 Copiază Link</button>
          <button class="btn btn-sm btn-secondary" id="btn-copy-code">📋 Copiază Cod</button>
        </div>
      `;
      $("#btn-copy-link").onclick = () => copyText(link, "Link fără PIN copiat!");
      $("#btn-copy-code").onclick = () => copyText(code, "Cod BF2 copiat!");
    };
  }

  const applyCodeBtn = $("#btn-apply-setup-code");
  if (applyCodeBtn) {
    applyCodeBtn.onclick = () => {
      const raw = $("#input-setup-code").value;
      if (!raw.trim()) return;
      try {
        const cfg = decodeSetupCode(raw);
        store.state.connection.webAppUrl = cfg.webAppUrl;
        store.persist();
        render();
        showToast("URL preluat! Introdu acum PIN-ul tău personal mai sus și apasă Conectează.");
      } catch (err) {
        showToast("Eroare cod: " + err.message, 4500);
      }
    };
  }

  const famForm = $("#form-family-settings");
  if (famForm) {
    famForm.onsubmit = async (e) => {
      e.preventDefault();
      await store.saveSettings({
        partner1Name: $("#set-p1-name").value.trim() || "Eu",
        partner1Tab: $("#set-p1-tab").value.trim() || "Cheltuieli_Eu",
        partner2Name: $("#set-p2-name").value.trim() || "Soția",
        partner2Tab: $("#set-p2-tab").value.trim() || "Cheltuieli_Sotie",
        baseCurrency: $("#set-base-cur").value,
        monthlyBudget: Number($("#set-budget").value) || 0
      });
      showToast("Setările au fost salvate!");
    };
  }

  const demoBtn = $("#btn-load-demo");
  if (demoBtn) {
    demoBtn.onclick = () => {
      store.resetDemoData();
      showToast("Datele Demo fictive au fost încărcate!");
    };
  }
  const clearBtn = $("#btn-clear-local");
  if (clearBtn) {
    clearBtn.onclick = () => {
      if (confirm("Ștergi datele locale?")) {
        store.clearAllLocalExpenses();
        showToast("Datele locale au fost șterse.");
      }
    };
  }
}

async function copyText(text, successMsg) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(successMsg);
  } catch (_) {
    showToast("Nu am putut copia automat.");
  }
}

// =========================================================================
// MODALE: Previzualizare Import, Tranzacție, Cont, Categorie, Valută
// =========================================================================
function closeModals() {
  document.querySelectorAll(".modal-backdrop").forEach((m) => m.classList.remove("open"));
  editingExpenseId = null;
}

function openImportPreviewModal(fileName, report) {
  const modal = $("#modal-main");
  const ct = report.controlTotals;
  modal.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-header">
        <h3 class="modal-title">🔎 Previzualizare Import: ${esc(fileName)}</h3>
        <button class="close-btn" data-close-modal>✕</button>
      </div>
      <div class="form-grid">
        <div class="insight-item info">
          <div class="insight-icon">📊</div>
          <div>
            <div class="insight-title">Raport analiză (${report.totalRead} rânduri citite)</div>
            <div class="insight-text">
              ✅ Gata de import: <strong>${report.readyRows.length}</strong> •
              ⏭️ Dubluri ignorate: <strong>${report.duplicateRows.length}</strong> •
              ⚠️ Puse deoparte: <strong>${report.stagedRows.length}</strong>
            </div>
          </div>
        </div>

        ${report.overlapWarning ? `
          <div class="insight-item warning">
            <div class="insight-icon">📅</div>
            <div><div class="insight-title">Suprapunere perioade</div><div class="insight-text">${esc(report.overlapWarning)}</div></div>
          </div>
        ` : ""}

        ${(report.unknownCategories.length || report.unknownCurrencies.length || report.unknownAccounts.length) ? `
          <div class="insight-item danger">
            <div class="insight-icon">🚫</div>
            <div>
              <div class="insight-title">Elemente necunoscute (nu au fost înlocuite tăcut)</div>
              <div class="insight-text">
                ${report.unknownCategories.length ? `Categorii: <strong>${esc(report.unknownCategories.join(", "))}</strong><br>` : ""}
                ${report.unknownCurrencies.length ? `Valute: <strong>${esc(report.unknownCurrencies.join(", "))}</strong><br>` : ""}
                ${report.unknownAccounts.length ? `Conturi: <strong>${esc(report.unknownAccounts.join(", "))}</strong>` : ""}
              </div>
            </div>
          </div>
        ` : ""}

        <div class="mini-card" style="flex-direction:column; align-items:stretch">
          <div style="font-weight:700; font-size:0.84rem">Totaluri de control (sursă vs. gata de import)</div>
          <div class="card-sub">Sursă: Credit ${ct.sourceCredit} | Debit ${ct.sourceDebit} | Net ${ct.sourceNet}</div>
          <div class="card-sub">Valid: Credit ${ct.readyCredit} | Debit ${ct.readyDebit} | Net ${ct.readyNet}</div>
          ${ct.hasUnexplainedDiff ? `<div class="card-sub" style="color:var(--danger); font-weight:700">⚠️ Există diferențe / rânduri puse deoparte — importul NU este complet 100%.</div>` : ""}
        </div>

        ${report.stagedRows.length ? `
          <div style="max-height:150px; overflow-y:auto; display:flex; flex-direction:column; gap:6px">
            ${report.stagedRows.slice(0, 15).map((st) => `
              <div class="card-sub" style="padding:6px 8px; background:var(--danger-soft); border-radius:8px">
                <strong>Rând ${st.rowNumber}</strong> (${esc(st.rawTitle)}): ${esc(st.reasons.join("; "))}
              </div>
            `).join("")}
          </div>
        ` : ""}

        <div class="btn-row" style="justify-content:flex-end; margin-top:6px">
          <button class="btn btn-secondary" data-close-modal>Anulează</button>
          ${report.readyRows.length > 0 ? `<button class="btn btn-primary" id="btn-confirm-import">✅ Importă ${report.readyRows.length} rânduri valide</button>` : ""}
        </div>
      </div>
    </div>
  `;
  modal.classList.add("open");

  const confirmBtn = $("#btn-confirm-import");
  if (confirmBtn) {
    confirmBtn.onclick = async () => {
      closeModals();
      const count = await store.commitImportRows(report.readyRows);
      showToast(`Importat ${count} rânduri valide! (${report.stagedRows.length} puse deoparte, ${report.duplicateRows.length} dubluri ignorate)`);
    };
  }
}

function openExpenseModal(expenseId) {
  const s = store.state;
  const exp = expenseId ? s.expenses.find((e) => e.id === expenseId) : null;
  editingExpenseId = exp ? exp.id : null;
  const isOwner = !exp || exp.owner === s.activePartner;
  const baseCur = s.settings.baseCurrency || "RON";
  const initialType = exp ? (exp.type || "cheltuiala") : "cheltuiala";

  const modal = $("#modal-main");
  modal.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-header">
        <h3 class="modal-title">${exp ? (isOwner ? "✏️ Editează Tranzacția" : "👁️ Detalii Tranzacție") : "➕ Tranzacție Nouă"}</h3>
        <button class="close-btn" data-close-modal>✕</button>
      </div>
      <form id="form-expense" class="form-grid">
        <div class="form-grid cols-2">
          <div class="field">
            <label>Tip tranzacție</label>
            <select class="select" id="exp-type" ${isOwner && !exp ? "" : "disabled"}>
              ${Object.values(TX_TYPES).map((t) => `<option value="${esc(t.id)}" ${initialType === t.id ? "selected" : ""}>${t.icon} ${esc(t.label)}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label>Data</label>
            <input class="input" id="exp-date" type="date" value="${esc(exp ? exp.date : new Date().toISOString().slice(0, 10))}" ${isOwner ? "required" : "disabled"}>
          </div>
        </div>

        <div class="form-grid cols-2">
          <div class="field">
            <label>Sumă nativă (strict pozitivă)</label>
            <input class="input" id="exp-amount" type="number" step="0.01" min="0.01" placeholder="0.00" value="${exp ? exp.amount : ""}" ${isOwner ? "required" : "disabled"}>
          </div>
          <div class="field">
            <label>Valută</label>
            <select class="select" id="exp-currency" ${isOwner ? "" : "disabled"}>
              ${s.currencies.map((c) => `<option value="${esc(c.code)}" ${(exp ? exp.currency : baseCur) === c.code ? "selected" : ""}>${esc(c.code)} (${esc(c.symbol)})</option>`).join("")}
            </select>
          </div>
        </div>

        <div class="form-grid cols-2">
          <div class="field">
            <label>Cont sursă / principal</label>
            <select class="select" id="exp-account" ${isOwner ? "" : "disabled"}>
              <option value="">— Fără cont —</option>
              ${s.accounts.filter((a) => !a.archived).map((a) => `<option value="${esc(a.id)}" ${(exp ? exp.accountId : (s.accounts[0]?.id || "")) === a.id ? "selected" : ""}>${esc(a.name)} (${esc(a.currency)})</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label>Curs pe rând (față de ${esc(baseCur)})</label>
            <input class="input" id="exp-rate" type="number" step="0.0001" min="0.0001" value="${exp ? (exp.exchangeRate || 1) : 1}" ${isOwner ? "required" : "disabled"}>
          </div>
        </div>

        <div id="transfer-fields" class="form-grid cols-2" style="display:none">
          <div class="field">
            <label>Cont destinație (transfer)</label>
            <select class="select" id="exp-dest-account">
              ${s.accounts.filter((a) => !a.archived).map((a) => `<option value="${esc(a.id)}">${esc(a.name)} (${esc(a.currency)})</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label>Sumă destinație (pt. schimb valutar)</label>
            <input class="input" id="exp-dest-amount" type="number" step="0.01" min="0.01" placeholder="Identică dacă aceeași valută">
          </div>
        </div>

        <div id="credit-fields" class="form-grid cols-2" style="display:none">
          <div class="field">
            <label>Principal (scade datoria)</label>
            <input class="input" id="exp-principal" type="number" step="0.01" min="0" value="${exp && exp.principalAmount !== undefined ? exp.principalAmount : ""}" placeholder="Opțional (altfel nedefalcat)">
          </div>
          <div class="field">
            <label>Dobândă / Comisioane (cheltuială)</label>
            <input class="input" id="exp-interest" type="number" step="0.01" min="0" value="${exp && exp.interestAmount !== undefined ? exp.interestAmount : ""}" placeholder="Opțional">
          </div>
        </div>

        <div class="field">
          <label>Descriere / Magazin</label>
          <input class="input" id="exp-title" type="text" placeholder="ex: Cumpărături Lidl, Salariu, Transfer economii..." value="${esc(exp ? exp.title : "")}" ${isOwner ? "required" : "disabled"}>
        </div>

        <div class="form-grid cols-2">
          <div class="field">
            <label>Categorie</label>
            <select class="select" id="exp-category" ${isOwner ? "" : "disabled"}>
              ${s.categories.map((c) => `<option value="${esc(c.id)}" ${(exp ? exp.category : "alimente") === c.id ? "selected" : ""}>${c.icon} ${esc(c.name)}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label>Metodă de plată</label>
            <select class="select" id="exp-payment" ${isOwner ? "" : "disabled"}>
              ${PAYMENT_METHODS.map((pm) => `<option value="${esc(pm)}" ${(exp ? exp.paymentMethod : "Card") === pm ? "selected" : ""}>${esc(pm)}</option>`).join("")}
            </select>
          </div>
        </div>

        <div class="toggle-row">
          <div>
            <div style="font-weight:700; font-size:0.88rem">🔒 Tranzacție privată</div>
            <div class="card-sub">Ascunsă de partener pe server (identitate reală din PIN)</div>
          </div>
          <label class="switch">
            <input type="checkbox" id="exp-private" ${exp && exp.isPrivate ? "checked" : ""} ${isOwner ? "" : "disabled"}>
            <span class="slider"></span>
          </label>
        </div>

        <div class="field">
          <label>Notițe (opțional)</label>
          <textarea class="textarea" id="exp-notes" rows="2" ${isOwner ? "" : "disabled"}>${esc(exp ? exp.notes : "")}</textarea>
        </div>

        ${isOwner ? `
          <div class="btn-row" style="justify-content:space-between; margin-top:6px">
            ${exp ? `<button type="button" class="btn btn-danger" id="btn-del-expense">🗑️ Șterge</button>` : `<span></span>`}
            <div class="btn-row">
              <button type="button" class="btn btn-secondary" data-close-modal>Anulează</button>
              <button type="submit" class="btn btn-primary">${exp ? "💾 Salvează" : "➕ Adaugă"}</button>
            </div>
          </div>
        ` : `<div class="card-sub">Această tranzacție aparține tab-ului <strong>${esc(store.getPartnerName(exp.owner))}</strong>.</div>`}
      </form>
    </div>
  `;
  modal.classList.add("open");

  const typeEl = $("#exp-type");
  const curEl = $("#exp-currency");
  const rateEl = $("#exp-rate");
  const trFields = $("#transfer-fields");
  const crFields = $("#credit-fields");

  const syncConditionalFields = () => {
    const t = typeEl.value;
    trFields.style.display = !exp && t === "transfer" ? "grid" : "none";
    crFields.style.display = t === "rata_credit" ? "grid" : "none";
  };
  typeEl.onchange = syncConditionalFields;
  curEl.onchange = () => {
    rateEl.value = store.getRateToBase(curEl.value);
  };
  syncConditionalFields();

  $("#form-expense").onsubmit = async (e) => {
    e.preventDefault();
    try {
      const type = typeEl.value;
      const amount = Number($("#exp-amount").value);
      const currency = curEl.value;
      const exchangeRate = Number(rateEl.value) || 1;
      const date = $("#exp-date").value;
      const title = $("#exp-title").value.trim();
      const accountId = $("#exp-account").value;
      const isPrivate = $("#exp-private").checked;
      const notes = $("#exp-notes").value.trim();

      if (!exp && type === "transfer") {
        const destAccountId = $("#exp-dest-account").value;
        const destAcc = store.getAccount(destAccountId);
        const destAmount = Number($("#exp-dest-amount").value) || amount;
        await store.addTransfer({
          date, title, sourceAccountId: accountId, destAccountId,
          sourceAmount: amount, sourceCurrency: currency,
          destAmount, destCurrency: destAcc ? destAcc.currency : currency,
          sourceExchangeRate: exchangeRate,
          destExchangeRate: destAcc ? store.getRateToBase(destAcc.currency) : exchangeRate,
          isPrivate, notes
        });
        closeModals();
        showToast("Transfer cu 2 picioare adăugat!");
        return;
      }

      const principalRaw = $("#exp-principal").value;
      const interestRaw = $("#exp-interest").value;
      const payload = {
        type, date, title, amount, currency, exchangeRate,
        accountId,
        category: $("#exp-category").value,
        paymentMethod: $("#exp-payment").value,
        isPrivate, notes
      };
      if (type === "rata_credit") {
        if (principalRaw !== "" || interestRaw !== "") {
          payload.principalAmount = Number(principalRaw) || 0;
          payload.interestAmount = Number(interestRaw) || 0;
          payload.splitStatus = "defalcat";
        } else {
          payload.splitStatus = "nedefalcat";
        }
      }

      closeModals();
      if (exp) {
        await store.updateExpense(exp.id, payload);
        showToast("Tranzacție actualizată!");
      } else {
        await store.addExpense(payload);
        showToast("Tranzacție adăugată!");
      }
    } catch (err) {
      showToast("Eroare validare: " + err.message, 4500);
    }
  };

  const delBtn = $("#btn-del-expense");
  if (delBtn) {
    delBtn.onclick = async () => {
      if (confirm("Ștergi definitiv această tranzacție?")) {
        closeModals();
        await store.deleteExpense(exp.id);
        showToast("Tranzacție ștearsă.");
      }
    };
  }
}

function openAccountModal(accId) {
  const s = store.state;
  const acc = accId ? s.accounts.find((a) => a.id === accId) : null;
  const modal = $("#modal-main");
  modal.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-header">
        <h3 class="modal-title">${acc ? "✏️ Editează Contul" : "➕ Cont Nou"}</h3>
        <button class="close-btn" data-close-modal>✕</button>
      </div>
      <form id="form-acc" class="form-grid">
        <div class="field">
          <label>Nume cont</label>
          <input class="input" id="acc-name" value="${esc(acc ? acc.name : "")}" placeholder="ex: Cont ING RON, Revolut EUR" required>
        </div>
        <div class="form-grid cols-2">
          <div class="field">
            <label>Tip cont</label>
            <select class="select" id="acc-type">
              ${ACCOUNT_TYPES.map((t) => `<option value="${esc(t.id)}" ${(acc ? acc.type : "banca") === t.id ? "selected" : ""}>${esc(t.label)}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label>Valută</label>
            <select class="select" id="acc-cur">
              ${s.currencies.map((c) => `<option value="${esc(c.code)}" ${(acc ? acc.currency : s.settings.baseCurrency) === c.code ? "selected" : ""}>${esc(c.code)}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="form-grid cols-2">
          <div class="field">
            <label>Sold inițial</label>
            <input class="input" id="acc-init" type="number" step="0.01" value="${acc ? acc.initialBalance : 0}">
          </div>
          <div class="field">
            <label>Tip sold inițial</label>
            <select class="select" id="acc-init-type">
              ${INITIAL_BALANCE_TYPES.map((t) => `<option value="${esc(t.id)}" ${(acc ? acc.initialBalanceType : "verificat") === t.id ? "selected" : ""}>${esc(t.label)}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="form-grid cols-2">
          <div class="field">
            <label>Proprietar cont</label>
            <select class="select" id="acc-owner">
              <option value="p1" ${(acc ? acc.owner : "p1") === "p1" ? "selected" : ""}>${esc(s.settings.partner1Name)}</option>
              <option value="p2" ${(acc ? acc.owner : "") === "p2" ? "selected" : ""}>${esc(s.settings.partner2Name)}</option>
              <option value="comun" ${(acc ? acc.owner : "") === "comun" ? "selected" : ""}>Comun</option>
              <option value="necunoscut" ${(acc ? acc.owner : "") === "necunoscut" ? "selected" : ""}>Necunoscut</option>
            </select>
          </div>
          <div class="field">
            <label>Arhivat</label>
            <select class="select" id="acc-archived">
              <option value="no" ${!(acc && acc.archived) ? "selected" : ""}>Nu (Activ)</option>
              <option value="yes" ${acc && acc.archived ? "selected" : ""}>Da (Arhivat)</option>
            </select>
          </div>
        </div>
        <div class="btn-row" style="justify-content:flex-end; margin-top:6px">
          <button type="button" class="btn btn-secondary" data-close-modal>Anulează</button>
          <button type="submit" class="btn btn-primary">💾 Salvează cont</button>
        </div>
      </form>
    </div>
  `;
  modal.classList.add("open");

  $("#form-acc").onsubmit = async (e) => {
    e.preventDefault();
    const name = $("#acc-name").value.trim();
    const entry = {
      id: acc ? acc.id : "acc_" + name.toLowerCase().replace(/[^a-z0-9]+/g, "_") + "_" + Date.now().toString(36).slice(-3),
      name,
      type: $("#acc-type").value,
      currency: $("#acc-cur").value,
      initialBalance: Number($("#acc-init").value) || 0,
      initialBalanceType: $("#acc-init-type").value,
      owner: $("#acc-owner").value,
      archived: $("#acc-archived").value === "yes"
    };
    const next = acc
      ? s.accounts.map((a) => (a.id === acc.id ? entry : a))
      : [...s.accounts, entry];
    closeModals();
    await store.saveAccounts(next);
    showToast("Cont salvat!");
  };
}

function openCategoryModal(catId) {
  const cat = catId ? store.state.categories.find((c) => c.id === catId) : null;
  const modal = $("#modal-main");
  modal.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-header">
        <h3 class="modal-title">${cat ? "✏️ Editează Categoria" : "➕ Categorie Nouă"}</h3>
        <button class="close-btn" data-close-modal>✕</button>
      </div>
      <form id="form-cat" class="form-grid">
        <div class="field">
          <label>Nume categorie</label>
          <input class="input" id="cat-name" value="${esc(cat ? cat.name : "")}" required>
        </div>
        <div class="form-grid cols-2">
          <div class="field">
            <label>Emoji</label>
            <input class="input" id="cat-icon" value="${esc(cat ? cat.icon : "🛍️")}" maxlength="4">
          </div>
          <div class="field">
            <label>Culoare</label>
            <input class="input" id="cat-color" type="color" value="${esc(cat ? cat.color : "#3b82f6")}" style="height:42px; padding:4px">
          </div>
        </div>
        <div class="form-grid cols-2">
          <div class="field">
            <label>Tip categorie</label>
            <select class="select" id="cat-kind">
              <option value="cheltuiala" ${(cat ? cat.kind : "cheltuiala") === "cheltuiala" ? "selected" : ""}>Cheltuială</option>
              <option value="venit" ${(cat ? cat.kind : "") === "venit" ? "selected" : ""}>Venit</option>
              <option value="ambele" ${(cat ? cat.kind : "") === "ambele" ? "selected" : ""}>Ambele</option>
            </select>
          </div>
          <div class="field">
            <label>Buget lunar (${esc(store.state.settings.baseCurrency)})</label>
            <input class="input" id="cat-budget" type="number" min="0" step="50" value="${cat ? cat.budget : 0}">
          </div>
        </div>
        <div class="field">
          <label>Grup</label>
          <select class="select" id="cat-group">
            ${CATEGORY_GROUPS.map((g) => `<option value="${esc(g)}" ${(cat ? cat.group : "Esentiale") === g ? "selected" : ""}>${esc(g)}</option>`).join("")}
          </select>
        </div>
        <div class="btn-row" style="justify-content:space-between; margin-top:6px">
          ${cat ? `<button type="button" class="btn btn-danger" id="btn-del-cat">🗑️ Șterge</button>` : `<span></span>`}
          <div class="btn-row">
            <button type="button" class="btn btn-secondary" data-close-modal>Anulează</button>
            <button type="submit" class="btn btn-primary">💾 Salvează</button>
          </div>
        </div>
      </form>
    </div>
  `;
  modal.classList.add("open");

  $("#form-cat").onsubmit = async (e) => {
    e.preventDefault();
    const name = $("#cat-name").value.trim();
    const entry = {
      id: cat ? cat.id : name.toLowerCase().replace(/[^a-z0-9]+/g, "_") + "_" + Date.now().toString(36).slice(-3),
      name,
      icon: $("#cat-icon").value.trim() || "📦",
      color: $("#cat-color").value || "#3b82f6",
      kind: $("#cat-kind").value,
      budget: Number($("#cat-budget").value) || 0,
      group: $("#cat-group").value
    };
    const next = cat
      ? store.state.categories.map((c) => (c.id === cat.id ? entry : c))
      : [...store.state.categories, entry];
    closeModals();
    await store.saveCategories(next);
    showToast("Categorie salvată!");
  };

  const delBtn = $("#btn-del-cat");
  if (delBtn) {
    delBtn.onclick = async () => {
      if (confirm("Ștergi această categorie?")) {
        closeModals();
        await store.saveCategories(store.state.categories.filter((c) => c.id !== cat.id));
        showToast("Categorie ștearsă.");
      }
    };
  }
}

function openCurrencyModal(code) {
  const cur = code ? store.state.currencies.find((c) => c.code === code) : null;
  const baseCur = store.state.settings.baseCurrency || "RON";
  const modal = $("#modal-main");
  modal.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-header">
        <h3 class="modal-title">${cur ? `✏️ Editează ${cur.code}` : "➕ Valută Nouă"}</h3>
        <button class="close-btn" data-close-modal>✕</button>
      </div>
      <form id="form-cur" class="form-grid">
        <div class="form-grid cols-2">
          <div class="field">
            <label>Cod valută</label>
            <input class="input" id="cur-code" value="${esc(cur ? cur.code : "")}" maxlength="5" ${cur ? "readonly" : "required"}>
          </div>
          <div class="field">
            <label>Simbol</label>
            <input class="input" id="cur-symbol" value="${esc(cur ? cur.symbol : "")}" maxlength="5" required>
          </div>
        </div>
        <div class="field">
          <label>Denumire</label>
          <input class="input" id="cur-name" value="${esc(cur ? cur.name : "")}" required>
        </div>
        <div class="field">
          <label>Curs curent față de ${esc(baseCur)} (nu modifică tranzacțiile istorice)</label>
          <input class="input" id="cur-rate" type="number" step="0.0001" min="0.0001" value="${cur ? cur.rate : 1}" required>
        </div>
        <div class="btn-row" style="justify-content:space-between; margin-top:6px">
          ${cur && cur.code !== baseCur ? `<button type="button" class="btn btn-danger" id="btn-del-cur">🗑️ Șterge</button>` : `<span></span>`}
          <div class="btn-row">
            <button type="button" class="btn btn-secondary" data-close-modal>Anulează</button>
            <button type="submit" class="btn btn-primary">💾 Salvează</button>
          </div>
        </div>
      </form>
    </div>
  `;
  modal.classList.add("open");

  $("#form-cur").onsubmit = async (e) => {
    e.preventDefault();
    const entry = {
      code: $("#cur-code").value.trim().toUpperCase(),
      symbol: $("#cur-symbol").value.trim(),
      name: $("#cur-name").value.trim(),
      rate: Number($("#cur-rate").value) || 1
    };
    const exists = store.state.currencies.some((c) => c.code === entry.code);
    const next = exists
      ? store.state.currencies.map((c) => (c.code === entry.code ? entry : c))
      : [...store.state.currencies, entry];
    closeModals();
    await store.saveCurrencies(next);
    showToast(`Valuta ${entry.code} salvată (sumele istorice au rămas neschimbate).`);
  };

  const delBtn = $("#btn-del-cur");
  if (delBtn) {
    delBtn.onclick = async () => {
      if (confirm(`Ștergi valuta ${cur.code}?`)) {
        closeModals();
        await store.saveCurrencies(store.state.currencies.filter((c) => c.code !== cur.code));
        showToast(`Valuta ${cur.code} ștearsă.`);
      }
    };
  }
}

document.addEventListener("DOMContentLoaded", initApp);
