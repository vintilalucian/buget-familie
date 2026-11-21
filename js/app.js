import { MONTHS_RO, PAYMENT_METHODS, CATEGORY_GROUPS } from "./defaults.js";
import { store } from "./store.js";
import { computeMonthlyAnalytics, formatMoney } from "./insights.js";
import { renderDonutChart, renderMonthlyTrendChart, renderDailyBarsChart } from "./charts.js";
import { exportToExcel, importFromFile } from "./excel.js";
import { encodeSetupCode, decodeSetupCode, buildTransferLink } from "./sheets-api.js";

let currentView = "dashboard";
let txSearch = "";
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

function showToast(msg, duration = 3000) {
  const wrap = $("#toast-container");
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
// Inițializare & Portabilitate din URL (#setup=BF1-...)
// =========================================================================
async function checkUrlSetupHash() {
  const hash = window.location.hash || "";
  if (!hash.includes("setup=BF1-")) return;
  try {
    const cfg = decodeSetupCode(hash);
    // Curățăm hash-ul ca să nu rămână PIN-ul vizibil în bara de adrese
    history.replaceState(null, "", window.location.pathname + window.location.search);
    showToast("Se configurează conexiunea Google Sheets...");
    await store.connectAndSync({
      webAppUrl: cfg.webAppUrl,
      pin: cfg.pin,
      partner: cfg.partner,
      initialize: false
    });
    showToast(`Conectat cu succes ca ${store.getPartnerName(cfg.partner)}!`);
  } catch (err) {
    showToast("Eroare la link-ul de transfer: " + err.message, 5000);
  }
}

function initApp() {
  document.documentElement.setAttribute("data-theme", store.state.theme);

  // Înregistrare Service Worker pentru PWA offline
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  // Re-sincronizare automată când revine internetul
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

  // Sincronizare discretă la deschidere dacă e conectat
  if (store.isConnected() && navigator.onLine) {
    store.sync().catch(() => {});
  }
}

function bindGlobalEvents() {
  // Navigare (sidebar + bottom bar)
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
      store.setActivePartner(partnerBtn.dataset.switchPartner);
      showToast(`Profil activ: ${store.getPartnerName(store.state.activePartner)}`);
      return;
    }

    const scopeBtn = e.target.closest("[data-scope]");
    if (scopeBtn) {
      store.setScope(scopeBtn.dataset.scope);
      return;
    }

    if (e.target.closest("#btn-prev-month")) {
      store.shiftMonth(-1);
      return;
    }
    if (e.target.closest("#btn-next-month")) {
      store.shiftMonth(1);
      return;
    }
    if (e.target.closest("#btn-theme")) {
      store.toggleTheme();
      return;
    }
    if (e.target.closest("#btn-sync")) {
      handleManualSync();
      return;
    }
    if (e.target.closest("#fab-add")) {
      openExpenseModal(null);
      return;
    }

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
  // Navigare activă
  document.querySelectorAll("[data-view]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === currentView);
  });

  // Switcher partener
  const p1Btn = $("#pill-p1");
  const p2Btn = $("#pill-p2");
  if (p1Btn && p2Btn) {
    p1Btn.textContent = s.settings.partner1Name || "Eu";
    p2Btn.textContent = s.settings.partner2Name || "Soția";
    p1Btn.classList.toggle("active", s.activePartner === "p1");
    p2Btn.classList.toggle("active", s.activePartner === "p2");
  }

  // Tema
  const themeBtn = $("#btn-theme");
  if (themeBtn) themeBtn.textContent = s.theme === "dark" ? "☀️" : "🌙";

  // Status sincronizare
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
      syncLabel.textContent = `În așteptare (${s.pendingQueue.length})`;
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
  if (s.lastError) {
    html += `
      <div class="banner error">
        <div class="banner-text"><strong>Atenție sincronizare:</strong> ${esc(s.lastError)}</div>
        <button class="btn btn-sm btn-secondary" id="btn-retry-sync">Reîncearcă</button>
      </div>
    `;
  } else if (!store.isConnected() && s.isDemoMode) {
    html += `
      <div class="banner">
        <div class="banner-text"><strong>Mod Demo activ</strong> — Explorează graficele și categoriile, apoi conectează Google Sheet-ul tău pentru sincronizare reală cu partenerul.</div>
        <button class="btn btn-sm btn-primary" data-view="settings">Conectează Sheets</button>
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

  const recent = a.expenses.slice(0, 6);

  return `
    ${renderStatusBanners()}
    ${renderControlsRow()}

    <section class="card hero-card">
      <div class="hero-top">
        <div>
          <div class="hero-label">Total cheltuieli (${MONTHS_RO[s.selectedMonth]})</div>
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
            <span>Buget lunar: ${formatMoney(a.monthlyBudget, a.baseCur)}</span>
            <span>${Math.round(a.budgetPct)}% (${a.remainingBudget >= 0 ? "rămas " + formatMoney(a.remainingBudget, a.baseCur) : "depășit cu " + formatMoney(Math.abs(a.remainingBudget), a.baseCur)})</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill ${progressClass}" style="width:${Math.min(100, Math.round(a.budgetPct))}%"></div>
          </div>
        </div>
      ` : ""}

      <div class="hero-stats">
        <div>
          <div class="hero-stat-label">Medie zilnică</div>
          <div class="hero-stat-val">${formatMoney(a.dailyAvg, a.baseCur)}</div>
        </div>
        <div>
          <div class="hero-stat-label">${a.isCurrentMonth ? "Estimare lună" : "Total final"}</div>
          <div class="hero-stat-val">${formatMoney(a.projectedTotal, a.baseCur)}</div>
        </div>
        <div>
          <div class="hero-stat-label">Luna trecută</div>
          <div class="hero-stat-val">${formatMoney(a.prevTotal, a.baseCur)}</div>
        </div>
      </div>
    </section>

    <div class="grid-2">
      <section class="card">
        <div class="card-header">
          <h2 class="card-title">👥 Contribuție Parteneri</h2>
          <span class="card-sub">Tab-uri separate</span>
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
        <h2 class="card-title">🧾 Ultimele Cumpărături</h2>
        <button class="btn btn-sm btn-secondary" data-view="transactions">Vezi toate (${a.count})</button>
      </div>
      ${recent.length ? `<div class="tx-list">${recent.map((e) => renderTxRow(e, a.baseCur)).join("")}</div>` : `
        <div class="empty-state">
          <div class="big-ic">🛍️</div>
          <div>Nu ai cheltuieli în ${MONTHS_RO[s.selectedMonth]}. Apasă <strong>+</strong> pentru a adăuga!</div>
        </div>
      `}
    </section>
  `;
}

function renderTxRow(exp, baseCur) {
  const cat = store.getCategory(exp.category);
  const ownerName = store.getPartnerName(exp.owner);
  const ownerClass = exp.owner === "p2" ? "badge-p2" : "badge-p1";
  const showOrig = exp.currency && exp.currency !== baseCur;

  return `
    <div class="tx-item" data-edit-expense="${esc(exp.id)}">
      <div class="tx-icon" style="background:${cat.color}20; color:${cat.color}">${cat.icon}</div>
      <div class="tx-main">
        <div class="tx-title">
          <span>${esc(exp.title)}</span>
          ${exp.isPrivate ? `<span class="badge badge-private">🔒 Privat</span>` : ""}
        </div>
        <div class="tx-meta">
          <span>${esc(exp.date)}</span>
          <span>• ${esc(cat.name)}</span>
          <span class="badge ${ownerClass}">${esc(ownerName)}</span>
          <span>• ${esc(exp.paymentMethod || "Card")}</span>
        </div>
      </div>
      <div class="tx-right">
        <div class="tx-amount">${formatMoney(exp.baseAmount, baseCur)}</div>
        ${showOrig ? `<div class="tx-orig">${formatMoney(exp.amount, exp.currency)}</div>` : ""}
      </div>
    </div>
  `;
}

// =========================================================================
// 2. CHELTUIELI (LISTĂ COMPLETĂ + FILTRE + EXCEL)
// =========================================================================
function renderTransactions() {
  const s = store.state;
  const baseCur = s.settings.baseCurrency || "RON";
  let list = store.getVisibleExpenses({ year: s.selectedYear, month: s.selectedMonth, scope: s.scope });

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

  const filteredSum = list.reduce((sum, e) => sum + (Number(e.baseAmount) || 0), 0);

  return `
    ${renderControlsRow()}

    <section class="card">
      <div class="card-header">
        <div>
          <h2 class="card-title">📋 Toate Cheltuielile (${list.length})</h2>
          <div class="card-sub">Total filtrat: <strong>${formatMoney(filteredSum, baseCur)}</strong></div>
        </div>
        <div class="btn-row">
          <button class="btn btn-sm btn-secondary" id="btn-export-excel">⬇️ Export Excel</button>
          <label class="btn btn-sm btn-secondary" style="cursor:pointer">
            ⬆️ Import Excel/CSV
            <input type="file" id="input-import-excel" accept=".xlsx,.xls,.csv" hidden>
          </label>
        </div>
      </div>

      <div class="filter-bar" style="margin-bottom:14px">
        <input class="input" id="tx-search" type="search" placeholder="Caută magazin, produs, notițe..." value="${esc(txSearch)}">
        <select class="select" id="tx-cat-filter">
          <option value="all">Toate categoriile</option>
          ${s.categories.map((c) => `<option value="${esc(c.id)}" ${txCategoryFilter === c.id ? "selected" : ""}>${c.icon} ${esc(c.name)}</option>`).join("")}
        </select>
        <select class="select" id="tx-cur-filter">
          <option value="all">Toate valutele</option>
          ${s.currencies.map((c) => `<option value="${esc(c.code)}" ${txCurrencyFilter === c.code ? "selected" : ""}>${esc(c.code)} (${esc(c.symbol)})</option>`).join("")}
        </select>
      </div>

      ${list.length ? `<div class="tx-list">${list.map((e) => renderTxRow(e, baseCur)).join("")}</div>` : `
        <div class="empty-state">
          <div class="big-ic">🔍</div>
          <div>Nicio cheltuială nu corespunde filtrelor selectate.</div>
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
        <h2 class="card-title">🧠 Insights Automate — ${MONTHS_RO[s.selectedMonth]}</h2>
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
        <h2 class="card-title">🍩 Cheltuieli pe Categorii</h2>
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
        ${a.byCurrency.length > 1 ? `
          <div style="margin-top:14px; padding-top:12px; border-top:1px solid var(--border)">
            <div class="card-sub" style="margin-bottom:6px; font-weight:700">Rezumat pe valute:</div>
            <div class="btn-row">
              ${a.byCurrency.map((c) => `<span class="badge badge-p1" style="font-size:0.78rem; padding:4px 10px">${formatMoney(c.originalTotal, c.code)}</span>`).join("")}
            </div>
          </div>
        ` : ""}
      </section>
    </div>
  `;
}

// =========================================================================
// 4. CATEGORII & VALUTE
// =========================================================================
function renderCatalog() {
  const s = store.state;
  const baseCur = s.settings.baseCurrency || "RON";

  return `
    <section class="card">
      <div class="card-header">
        <div>
          <h2 class="card-title">🏷️ Categorii de Cheltuieli (${s.categories.length})</h2>
          <div class="card-sub">Pre-populate cu cele mai uzuale categorii — poți adăuga sau seta bugete lunare</div>
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
                <div class="card-sub">${c.budget > 0 ? `Buget: ${formatMoney(c.budget, baseCur)}` : "Fără limită"} • ${esc(c.group || "Altele")}</div>
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
          <h2 class="card-title">💱 Valute & Cursuri de Schimb (${s.currencies.length})</h2>
          <div class="card-sub">Monedă de bază: <strong>${esc(baseCur)}</strong> — toate graficele se convertesc automat</div>
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

      <div style="margin-top:16px; padding-top:14px; border-top:1px solid var(--border)">
        <div class="card-title" style="font-size:0.9rem; margin-bottom:10px">🔄 Calculator rapid de conversie</div>
        <div class="form-grid cols-2">
          <div style="display:flex; gap:8px">
            <input class="input" id="conv-amount" type="number" step="any" value="100" placeholder="Sumă">
            <select class="select" id="conv-from" style="width:110px">
              ${s.currencies.map((c) => `<option value="${esc(c.code)}" ${c.code === "EUR" ? "selected" : ""}>${esc(c.code)}</option>`).join("")}
            </select>
          </div>
          <div style="display:flex; align-items:center; gap:8px">
            <span style="font-weight:700">=</span>
            <div class="input" id="conv-result" style="font-weight:800; color:var(--primary)">${formatMoney(store.toBaseCurrency(100, "EUR"), baseCur)}</div>
          </div>
        </div>
      </div>
    </section>
  `;
}

// =========================================================================
// 5. SETĂRI, GOOGLE SHEETS & PORTABILITATE TELEFON NOU
// =========================================================================
function renderSettings() {
  const s = store.state;
  const connected = store.isConnected();

  return `
    <section class="card">
      <div class="card-header">
        <div>
          <h2 class="card-title">☁️ Conectare Google Sheets (Google Drive)</h2>
          <div class="card-sub">${connected ? `Conectat la: ${esc(s.connection.sheetName || "Google Sheet")}` : "Neconectat — datele sunt momentan doar pe acest dispozitiv"}</div>
        </div>
        ${connected ? `<span class="badge" style="background:var(--success-soft); color:var(--success)">● Conectat</span>` : ""}
      </div>

      <form id="form-connection" class="form-grid">
        <div class="field">
          <label>URL Google Apps Script (Web App)</label>
          <input class="input" id="conn-url" type="url" placeholder="https://script.google.com/macros/s/.../exec" value="${esc(s.connection.webAppUrl)}" required>
        </div>
        <div class="form-grid cols-2">
          <div class="field">
            <label>PIN de securitate (din Code.gs)</label>
            <input class="input" id="conn-pin" type="password" placeholder="ex: 1234" value="${esc(s.connection.pin)}">
          </div>
          <div class="field">
            <label>Cine folosește acest telefon?</label>
            <select class="select" id="conn-partner">
              <option value="p1" ${s.activePartner === "p1" ? "selected" : ""}>${esc(s.settings.partner1Name)} (Tab: ${esc(s.settings.partner1Tab)})</option>
              <option value="p2" ${s.activePartner === "p2" ? "selected" : ""}>${esc(s.settings.partner2Name)} (Tab: ${esc(s.settings.partner2Tab)})</option>
            </select>
          </div>
        </div>
        <div class="btn-row">
          <button type="submit" class="btn btn-primary">🔗 Conectează & Inițializează Sheet</button>
          ${connected ? `<button type="button" class="btn btn-secondary" id="btn-settings-sync">🔄 Sincronizează acum</button>` : ""}
          ${connected ? `<button type="button" class="btn btn-danger" id="btn-disconnect">Deconectează</button>` : ""}
        </div>
      </form>
    </section>

    <section class="card">
      <div class="card-header">
        <div>
          <h2 class="card-title">📱 Portabilitate — Schimbare Telefon / Partajare cu Soția</h2>
          <div class="card-sub">Configurează instant un telefon nou fără să introduci manual URL-ul și PIN-ul</div>
        </div>
      </div>

      ${connected ? `
        <div class="btn-row" style="margin-bottom:12px">
          <button class="btn btn-primary" id="btn-gen-transfer-p1">📤 Link/Cod pentru ${esc(s.settings.partner1Name)}</button>
          <button class="btn btn-secondary" id="btn-gen-transfer-p2">📤 Link/Cod pentru ${esc(s.settings.partner2Name)}</button>
        </div>
        <div id="transfer-output" style="display:none; margin-bottom:14px"></div>
      ` : `<div class="card-sub" style="margin-bottom:12px">Conectează mai întâi Google Sheet-ul de mai sus pentru a genera link/cod de transfer.</div>`}

      <div style="padding-top:12px; border-top:1px solid var(--border)">
        <label style="display:block; font-size:0.8rem; font-weight:700; color:var(--text-muted); margin-bottom:6px">Ai deja un cod de transfer (BF1-...) sau link?</label>
        <div style="display:flex; gap:8px">
          <input class="input" id="input-setup-code" placeholder="Lipește aici codul BF1-... sau link-ul primit">
          <button class="btn btn-primary" id="btn-apply-setup-code">Activează</button>
        </div>
      </div>
    </section>

    <section class="card">
      <div class="card-header">
        <h2 class="card-title">⚙️ Preferințe Familie & Tab-uri Google Sheets</h2>
      </div>
      <form id="form-family-settings" class="form-grid">
        <div class="form-grid cols-2">
          <div class="field">
            <label>Nume Partener 1</label>
            <input class="input" id="set-p1-name" value="${esc(s.settings.partner1Name)}" required>
          </div>
          <div class="field">
            <label>Nume Tab Google Sheets (Partener 1)</label>
            <input class="input" id="set-p1-tab" value="${esc(s.settings.partner1Tab)}" required>
          </div>
        </div>
        <div class="form-grid cols-2">
          <div class="field">
            <label>Nume Partener 2</label>
            <input class="input" id="set-p2-name" value="${esc(s.settings.partner2Name)}" required>
          </div>
          <div class="field">
            <label>Nume Tab Google Sheets (Partener 2)</label>
            <input class="input" id="set-p2-tab" value="${esc(s.settings.partner2Tab)}" required>
          </div>
        </div>
        <div class="form-grid cols-2">
          <div class="field">
            <label>Monedă principală (de bază)</label>
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
        <h2 class="card-title">📖 Ghid rapid conectare Google Sheets (3 minute)</h2>
        <button class="btn btn-sm btn-primary" id="btn-copy-gas">📋 Copiază Code.gs</button>
      </div>
      <ol class="step-list">
        <li>Deschide <strong>Google Drive</strong>, creează un fișier <strong>Google Sheets</strong> nou (ex: <em>Buget Familie</em>) și partajează-l cu soția ta (cu rol de <strong>Editor</strong>).</li>
        <li>În Google Sheet, mergi la meniul <strong>Extensii → Apps Script</strong>.</li>
        <li>Apasă butonul <strong>„Copiază Code.gs”</strong> de mai sus, șterge codul implicit din Apps Script și lipește scriptul copiat. Poți schimba <code>DEFAULT_PIN</code> cu un PIN ales de tine.</li>
        <li>Apasă <strong>Implementare (Deploy) → Implementare nouă</strong>, alege tipul <strong>Aplicație web</strong>, la „Executare ca” lasă <strong>Eu</strong>, iar la „Cine are acces” alege <strong>Oricine</strong>.</li>
        <li>Copiază <strong>URL-ul aplicației web</strong>, lipește-l mai sus și apasă <strong>Conectează & Inițializează Sheet</strong>. Scriptul va crea automat tab-urile separate (<code>Cheltuieli_Eu</code>, <code>Cheltuieli_Sotie</code>, <code>Categorii</code>, <code>Valute</code>, <code>Sumar</code>).</li>
        <li>Pentru telefonul soției (sau când schimbi telefonul): apasă <strong>„Link/Cod pentru Soția”</strong> și trimite-i link-ul pe WhatsApp!</li>
      </ol>
    </section>

    <section class="card">
      <div class="card-header">
        <h2 class="card-title">🛠️ Date locale & Backup</h2>
      </div>
      <div class="btn-row">
        <button class="btn btn-secondary" id="btn-export-excel-2">⬇️ Export Excel (.xlsx)</button>
        <button class="btn btn-secondary" id="btn-load-demo">✨ Încarcă date Demo</button>
        <button class="btn btn-danger" id="btn-clear-local">🗑️ Golește cheltuielile locale</button>
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

  // Tranzacții filtre
  const searchEl = $("#tx-search");
  if (searchEl) {
    searchEl.oninput = (e) => {
      txSearch = e.target.value;
      render();
      const el = $("#tx-search");
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    };
  }
  const catF = $("#tx-cat-filter");
  if (catF) catF.onchange = (e) => { txCategoryFilter = e.target.value; render(); };
  const curF = $("#tx-cur-filter");
  if (curF) curF.onchange = (e) => { txCurrencyFilter = e.target.value; render(); };

  // Export & Import Excel
  const expBtn = $("#btn-export-excel") || $("#btn-export-excel-2");
  if (expBtn) {
    expBtn.onclick = async () => {
      try {
        const res = await exportToExcel(store);
        showToast(`Exportat ${res.count} cheltuieli (.${res.format})!`);
      } catch (err) {
        showToast("Eroare export: " + err.message, 4000);
      }
    };
  }
  const expBtn2 = $("#btn-export-excel-2");
  if (expBtn2 && expBtn2 !== expBtn) {
    expBtn2.onclick = async () => {
      const res = await exportToExcel(store);
      showToast(`Exportat ${res.count} cheltuieli (.${res.format})!`);
    };
  }

  const impInput = $("#input-import-excel");
  if (impInput) {
    impInput.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const rows = await importFromFile(file, store);
        const count = await store.importExpenses(rows);
        showToast(`Importat cu succes ${count} cheltuieli în tab-ul tău!`);
      } catch (err) {
        showToast("Eroare import: " + err.message, 4500);
      }
      e.target.value = "";
    };
  }

  // Categorii & Valute
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

  // Calculator valutar
  const convAmt = $("#conv-amount");
  const convFrom = $("#conv-from");
  const convRes = $("#conv-result");
  if (convAmt && convFrom && convRes) {
    const updateConv = () => {
      const val = store.toBaseCurrency(convAmt.value, convFrom.value);
      convRes.textContent = formatMoney(val, store.state.settings.baseCurrency);
    };
    convAmt.oninput = updateConv;
    convFrom.onchange = updateConv;
  }

  // Setări conectare
  const connForm = $("#form-connection");
  if (connForm) {
    connForm.onsubmit = async (e) => {
      e.preventDefault();
      try {
        showToast("Se conectează și se inițializează Google Sheet...");
        await store.connectAndSync({
          webAppUrl: $("#conn-url").value,
          pin: $("#conn-pin").value,
          partner: $("#conn-partner").value,
          initialize: true
        });
        showToast("Google Sheets conectat și sincronizat cu succes!");
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
      if (confirm("Deconectezi Google Sheets de pe acest telefon? Datele din Google Drive rămân intacte.")) {
        store.disconnectSheet();
        showToast("Deconectat de la Google Sheets.");
      }
    };
  }

  // Portabilitate: generare link & cod transfer
  const showTransfer = (partnerKey) => {
    const cfg = {
      webAppUrl: store.state.connection.webAppUrl,
      pin: store.state.connection.pin,
      partner: partnerKey
    };
    const code = encodeSetupCode(cfg);
    const link = buildTransferLink(cfg);
    const out = $("#transfer-output");
    out.style.display = "block";
    out.innerHTML = `
      <div class="code-box" style="margin-bottom:8px">
        <div style="font-weight:700; margin-bottom:4px; font-family:inherit">Cod transfer pentru ${esc(store.getPartnerName(partnerKey))}:</div>
        <div>${esc(code)}</div>
      </div>
      <div class="btn-row">
        <button class="btn btn-sm btn-primary" id="btn-copy-link">🔗 Copiază Link Direct</button>
        <button class="btn btn-sm btn-secondary" id="btn-copy-code">📋 Copiază Codul</button>
      </div>
    `;
    $("#btn-copy-link").onclick = () => copyText(link, "Link de transfer copiat! Trimite-l pe noul telefon.");
    $("#btn-copy-code").onclick = () => copyText(code, "Cod de transfer copiat!");
  };

  const genP1 = $("#btn-gen-transfer-p1");
  if (genP1) genP1.onclick = () => showTransfer("p1");
  const genP2 = $("#btn-gen-transfer-p2");
  if (genP2) genP2.onclick = () => showTransfer("p2");

  const applyCodeBtn = $("#btn-apply-setup-code");
  if (applyCodeBtn) {
    applyCodeBtn.onclick = async () => {
      const raw = $("#input-setup-code").value;
      if (!raw.trim()) return;
      try {
        const cfg = decodeSetupCode(raw);
        showToast("Se activează configurația...");
        await store.connectAndSync({ ...cfg, initialize: false });
        showToast(`Configurat și sincronizat ca ${store.getPartnerName(cfg.partner)}!`);
      } catch (err) {
        showToast("Eroare cod: " + err.message, 4500);
      }
    };
  }

  // Preferințe familie
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
      showToast("Setările familiei au fost salvate!");
    };
  }

  // Copiere Code.gs
  const copyGasBtn = $("#btn-copy-gas");
  if (copyGasBtn) {
    copyGasBtn.onclick = async () => {
      try {
        const res = await fetch("./google-apps-script/Code.gs");
        if (!res.ok) throw new Error("Nu am putut citi fișierul Code.gs");
        const code = await res.text();
        await copyText(code, "Scriptul Code.gs a fost copiat! Lipește-l în Google Sheets → Apps Script.");
      } catch (err) {
        showToast("Eroare copiere Code.gs: " + err.message, 4000);
      }
    };
  }

  // Date demo & curățare
  const demoBtn = $("#btn-load-demo");
  if (demoBtn) {
    demoBtn.onclick = () => {
      store.resetDemoData();
      showToast("Datele Demo au fost încărcate!");
    };
  }
  const clearBtn = $("#btn-clear-local");
  if (clearBtn) {
    clearBtn.onclick = () => {
      if (confirm("Ștergi cheltuielile salvate local? (Datele din Google Sheets nu sunt afectate.)")) {
        store.clearAllLocalExpenses();
        showToast("Lista locală a fost golită.");
      }
    };
  }
}

async function copyText(text, successMsg) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(successMsg);
  } catch (_) {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
    showToast(successMsg);
  }
}

// =========================================================================
// MODALE: Cheltuială, Categorie, Valută
// =========================================================================
function closeModals() {
  document.querySelectorAll(".modal-backdrop").forEach((m) => m.classList.remove("open"));
  editingExpenseId = null;
}

function openExpenseModal(expenseId) {
  const s = store.state;
  const exp = expenseId ? s.expenses.find((e) => e.id === expenseId) : null;
  editingExpenseId = exp ? exp.id : null;
  const isOwner = !exp || exp.owner === s.activePartner;
  const baseCur = s.settings.baseCurrency || "RON";

  const modal = $("#modal-main");
  modal.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-header">
        <h3 class="modal-title">${exp ? (isOwner ? "✏️ Editează Cheltuiala" : "👁️ Detalii Cheltuială") : "➕ Cheltuială Nouă"}</h3>
        <button class="close-btn" data-close-modal>✕</button>
      </div>
      <form id="form-expense" class="form-grid">
        <div class="form-grid cols-2">
          <div class="field">
            <label>Sumă</label>
            <input class="input" id="exp-amount" type="number" step="0.01" min="0.01" placeholder="0.00" value="${exp ? exp.amount : ""}" ${isOwner ? "required" : "disabled"}>
          </div>
          <div class="field">
            <label>Valută</label>
            <select class="select" id="exp-currency" ${isOwner ? "" : "disabled"}>
              ${s.currencies.map((c) => `<option value="${esc(c.code)}" ${(exp ? exp.currency : baseCur) === c.code ? "selected" : ""}>${esc(c.code)} (${esc(c.symbol)})</option>`).join("")}
            </select>
          </div>
        </div>
        <div id="exp-conv-hint" class="card-sub" style="margin-top:-6px"></div>

        <div class="field">
          <label>Descriere / Magazin</label>
          <input class="input" id="exp-title" type="text" placeholder="ex: Cumpărături Lidl, Benzină, Factură..." value="${esc(exp ? exp.title : "")}" ${isOwner ? "required" : "disabled"}>
        </div>

        <div class="form-grid cols-2">
          <div class="field">
            <label>Categorie</label>
            <select class="select" id="exp-category" ${isOwner ? "" : "disabled"}>
              ${s.categories.map((c) => `<option value="${esc(c.id)}" ${(exp ? exp.category : "alimente") === c.id ? "selected" : ""}>${c.icon} ${esc(c.name)}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label>Data</label>
            <input class="input" id="exp-date" type="date" value="${esc(exp ? exp.date : new Date().toISOString().slice(0, 10))}" ${isOwner ? "required" : "disabled"}>
          </div>
        </div>

        <div class="field">
          <label>Metodă de plată</label>
          <select class="select" id="exp-payment" ${isOwner ? "" : "disabled"}>
            ${PAYMENT_METHODS.map((pm) => `<option value="${esc(pm)}" ${(exp ? exp.paymentMethod : "Card") === pm ? "selected" : ""}>${esc(pm)}</option>`).join("")}
          </select>
        </div>

        <div class="toggle-row">
          <div>
            <div style="font-weight:700; font-size:0.88rem">🔒 Cheltuială privată</div>
            <div class="card-sub">Ascunsă de ${esc(store.getPartnerName(s.activePartner === "p1" ? "p2" : "p1"))} în aplicație</div>
          </div>
          <label class="switch">
            <input type="checkbox" id="exp-private" ${exp && exp.isPrivate ? "checked" : ""} ${isOwner ? "" : "disabled"}>
            <span class="slider"></span>
          </label>
        </div>

        <div class="field">
          <label>Notițe (opțional)</label>
          <textarea class="textarea" id="exp-notes" rows="2" placeholder="Detalii suplimentare..." ${isOwner ? "" : "disabled"}>${esc(exp ? exp.notes : "")}</textarea>
        </div>

        ${isOwner ? `
          <div class="btn-row" style="justify-content:space-between; margin-top:6px">
            ${exp ? `<button type="button" class="btn btn-danger" id="btn-del-expense">🗑️ Șterge</button>` : `<span></span>`}
            <div class="btn-row">
              <button type="button" class="btn btn-secondary" data-close-modal>Anulează</button>
              <button type="submit" class="btn btn-primary">${exp ? "💾 Salvează" : "➕ Adaugă"}</button>
            </div>
          </div>
        ` : `
          <div class="card-sub">Această cheltuială aparține tab-ului <strong>${esc(store.getPartnerName(exp.owner))}</strong> și poate fi editată doar de acolo.</div>
        `}
      </form>
    </div>
  `;
  modal.classList.add("open");

  // Preview conversie live
  const amtEl = $("#exp-amount");
  const curEl = $("#exp-currency");
  const hintEl = $("#exp-conv-hint");
  const updateHint = () => {
    const val = Number(amtEl.value) || 0;
    const cur = curEl.value;
    if (cur !== baseCur && val > 0) {
      hintEl.textContent = `≈ ${formatMoney(store.toBaseCurrency(val, cur), baseCur)} (conversie automată)`;
    } else {
      hintEl.textContent = "";
    }
  };
  amtEl.oninput = updateHint;
  curEl.onchange = updateHint;
  updateHint();
  if (!exp) setTimeout(() => amtEl.focus(), 80);

  const form = $("#form-expense");
  form.onsubmit = async (e) => {
    e.preventDefault();
    const payload = {
      amount: Number(amtEl.value),
      currency: curEl.value,
      title: $("#exp-title").value.trim(),
      category: $("#exp-category").value,
      date: $("#exp-date").value,
      paymentMethod: $("#exp-payment").value,
      isPrivate: $("#exp-private").checked,
      notes: $("#exp-notes").value.trim()
    };
    closeModals();
    if (exp) {
      await store.updateExpense(exp.id, payload);
      showToast("Cheltuială actualizată!");
    } else {
      await store.addExpense(payload);
      showToast("Cheltuială adăugată!");
    }
  };

  const delBtn = $("#btn-del-expense");
  if (delBtn) {
    delBtn.onclick = async () => {
      if (confirm("Ștergi definitiv această cheltuială?")) {
        closeModals();
        await store.deleteExpense(exp.id);
        showToast("Cheltuială ștearsă.");
      }
    };
  }
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
          <input class="input" id="cat-name" value="${esc(cat ? cat.name : "")}" placeholder="ex: Cafea & Gustări" required>
        </div>
        <div class="form-grid cols-2">
          <div class="field">
            <label>Emoji / Icon</label>
            <input class="input" id="cat-icon" value="${esc(cat ? cat.icon : "🛍️")}" maxlength="4">
          </div>
          <div class="field">
            <label>Culoare</label>
            <input class="input" id="cat-color" type="color" value="${esc(cat ? cat.color : "#3b82f6")}" style="height:42px; padding:4px">
          </div>
        </div>
        <div class="form-grid cols-2">
          <div class="field">
            <label>Buget lunar opțional (${esc(store.state.settings.baseCurrency)})</label>
            <input class="input" id="cat-budget" type="number" min="0" step="50" value="${cat ? cat.budget : 0}">
          </div>
          <div class="field">
            <label>Grup</label>
            <select class="select" id="cat-group">
              ${CATEGORY_GROUPS.map((g) => `<option value="${esc(g)}" ${(cat ? cat.group : "Esentiale") === g ? "selected" : ""}>${esc(g)}</option>`).join("")}
            </select>
          </div>
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
        <h3 class="modal-title">${cur ? `✏️ Editează ${cur.code}` : "➕ Adaugă Valută Nouă"}</h3>
        <button class="close-btn" data-close-modal>✕</button>
      </div>
      <form id="form-cur" class="form-grid">
        <div class="form-grid cols-2">
          <div class="field">
            <label>Cod valută (3 litere)</label>
            <input class="input" id="cur-code" value="${esc(cur ? cur.code : "")}" placeholder="ex: PLN, BGN, TRY" maxlength="5" ${cur ? "readonly" : "required"}>
          </div>
          <div class="field">
            <label>Simbol</label>
            <input class="input" id="cur-symbol" value="${esc(cur ? cur.symbol : "")}" placeholder="ex: zł, лв, ₺" maxlength="5" required>
          </div>
        </div>
        <div class="field">
          <label>Denumire</label>
          <input class="input" id="cur-name" value="${esc(cur ? cur.name : "")}" placeholder="ex: Zlot polonez" required>
        </div>
        <div class="field">
          <label>Curs față de ${esc(baseCur)} (1 unitate = ? ${esc(baseCur)})</label>
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
    showToast(`Valuta ${entry.code} a fost salvată!`);
  };

  const delBtn = $("#btn-del-cur");
  if (delBtn) {
    delBtn.onclick = async () => {
      if (confirm(`Ștergi valuta ${cur.code}?`)) {
        closeModals();
        await store.saveCurrencies(store.state.currencies.filter((c) => c.code !== cur.code));
        showToast(`Valuta ${cur.code} a fost ștearsă.`);
      }
    };
  }
}

document.addEventListener("DOMContentLoaded", initApp);
