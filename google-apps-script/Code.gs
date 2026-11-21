/**
 * BugetFamilie — Backend Google Apps Script pentru Google Sheets
 * ==============================================================
 * Instrucțiuni rapide:
 * 1. Creează un Google Sheet nou în Google Drive și partajează-l cu soția/partenerul (Editor).
 * 2. Din meniul Google Sheets, accesează: Extensii -> Apps Script.
 * 3. Șterge codul existent și lipește tot conținutul acestui fișier.
 * 4. (Opțional, recomandat) Setează un PIN de acces mai jos la DEFAULT_PIN (ex: "2468").
 * 5. Apasă "Implementare" (Deploy) -> "Implementare nouă" (New deployment).
 *    - Tip: Aplicație web (Web app)
 *    - Executare ca: Eu (Me)
 *    - Cine are acces: Oricine (Anyone)
 * 6. Copiază URL-ul aplicației web și introdu-l în aplicația BugetFamilie împreună cu PIN-ul!
 */

const DEFAULT_PIN = "1234"; // Schimbă acest PIN cu unul ales de tine (ex: "4829")

const SHEET_SETTINGS = "Setari";
const SHEET_CATEGORIES = "Categorii";
const SHEET_CURRENCIES = "Valute";
const SHEET_SUMMARY = "Sumar";

const EXPENSE_HEADERS = [
  "ID",
  "Data",
  "Titlu",
  "Suma",
  "Valuta",
  "Suma_Baza",
  "Categorie",
  "Metoda_Plata",
  "Privat",
  "Notite",
  "Creat_La",
  "Actualizat_La"
];

const DEFAULT_CATEGORIES = [
  ["alimente", "Alimente & Supermarket", "🛒", "#10b981", 2000, "Esentiale"],
  ["locuinta", "Chirie / Rată Casă", "🏠", "#3b82f6", 2500, "Esentiale"],
  ["utilitati", "Utilități (Curent, Gaz, Net)", "💡", "#f59e0b", 700, "Esentiale"],
  ["transport", "Transport & Combustibil", "🚗", "#6366f1", 600, "Esentiale"],
  ["restaurante", "Restaurante & Cafenele", "🍽️", "#ec4899", 500, "Stil de viata"],
  ["sanatate", "Sănătate & Farmacie", "💊", "#ef4444", 400, "Esentiale"],
  ["haine", "Îmbrăcăminte & Încălțăminte", "👕", "#8b5cf6", 400, "Stil de viata"],
  ["casa", "Casă, Mobilier & Grădină", "🏡", "#14b8a6", 350, "Esentiale"],
  ["electronice", "Electronice & Abonamente", "📱", "#0ea5e9", 300, "Stil de viata"],
  ["divertisment", "Divertisment & Timp Liber", "🎬", "#f97316", 300, "Stil de viata"],
  ["vacante", "Vacanțe & Călătorii", "✈️", "#06b6d4", 800, "Stil de viata"],
  ["cadouri", "Cadouri & Evenimente", "🎁", "#d946ef", 300, "Stil de viata"],
  ["copii", "Copii & Familie", "👶", "#84cc16", 500, "Esentiale"],
  ["animale", "Animale de Companie", "🐾", "#a855f7", 200, "Esentiale"],
  ["educatie", "Educație & Cărți", "📚", "#2563eb", 250, "Dezvoltare"],
  ["ingrijire", "Îngrijire Personală & Sport", "💅", "#f43f5e", 300, "Stil de viata"],
  ["auto", "Întreținere Auto & Asigurări", "🔧", "#64748b", 400, "Esentiale"],
  ["taxe", "Taxe, Impozite & Comisioane", "📄", "#78716c", 200, "Esentiale"],
  ["economii", "Economii & Investiții", "💰", "#059669", 1000, "Economii"],
  ["altele", "Altele", "📦", "#94a3b8", 200, "Altele"]
];

const DEFAULT_CURRENCIES = [
  ["RON", "Leu românesc", "lei", 1.0],
  ["EUR", "Euro", "€", 4.98],
  ["USD", "Dolar american", "$", 4.65],
  ["GBP", "Liră sterlină", "£", 5.85],
  ["CHF", "Franc elvețian", "CHF", 5.25],
  ["HUF", "Forint maghiar", "Ft", 0.0125],
  ["MDL", "Leu moldovenesc", "L", 0.26]
];

function getConfiguredPin() {
  const props = PropertiesService.getScriptProperties();
  return props.getProperty("ACCESS_PIN") || DEFAULT_PIN;
}

function checkPin(pin) {
  const expected = String(getConfiguredPin()).trim();
  if (!expected) return true;
  return String(pin || "").trim() === expected;
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  try {
    const params = (e && e.parameter) ? e.parameter : {};
    if (!checkPin(params.pin)) {
      return jsonResponse({ ok: false, error: "PIN invalid. Verifică codul de acces." });
    }
    const action = params.action || "ping";
    if (action === "ping") {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      return jsonResponse({
        ok: true,
        sheetName: ss.getName(),
        sheetId: ss.getId(),
        version: "1.0.0"
      });
    }
    if (action === "sync") {
      return jsonResponse(handleSync(params.partner || "p1"));
    }
    return jsonResponse({ ok: false, error: "Acțiune GET necunoscută: " + action });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message || String(err) });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const raw = (e && e.postData && e.postData.contents) ? e.postData.contents : "{}";
    const payload = JSON.parse(raw);

    if (!checkPin(payload.pin)) {
      return jsonResponse({ ok: false, error: "PIN invalid. Verifică codul de acces." });
    }

    const action = payload.action;
    if (action === "sync") {
      return jsonResponse(handleSync(payload.partner || "p1"));
    }

    // Operațiuni de scriere — protejate cu lock pentru concurență sigură
    lock.waitLock(15000);
    let result;
    switch (action) {
      case "init":
        result = handleInit(payload.settings);
        break;
      case "addExpense":
        result = handleAddExpense(payload.partner || "p1", payload.expense);
        break;
      case "updateExpense":
        result = handleUpdateExpense(payload.partner || "p1", payload.expense);
        break;
      case "deleteExpense":
        result = handleDeleteExpense(payload.partner || "p1", payload.id);
        break;
      case "bulkImport":
        result = handleBulkImport(payload.partner || "p1", payload.expenses || []);
        break;
      case "saveCategories":
        result = handleSaveCategories(payload.categories || []);
        break;
      case "saveCurrencies":
        result = handleSaveCurrencies(payload.currencies || []);
        break;
      case "saveSettings":
        result = handleSaveSettings(payload.settings || {});
        break;
      case "updatePin":
        result = handleUpdatePin(payload.newPin);
        break;
      default:
        result = { ok: false, error: "Acțiune necunoscută: " + action };
    }
    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message || String(err) });
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function ensureSheetStructure(customSettings) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. Setari
  let settingsSheet = ss.getSheetByName(SHEET_SETTINGS);
  if (!settingsSheet) {
    settingsSheet = ss.insertSheet(SHEET_SETTINGS);
    const defaults = [
      ["Cheie", "Valoare"],
      ["partner1Name", (customSettings && customSettings.partner1Name) || "Eu"],
      ["partner1Tab", (customSettings && customSettings.partner1Tab) || "Cheltuieli_Eu"],
      ["partner2Name", (customSettings && customSettings.partner2Name) || "Soția"],
      ["partner2Tab", (customSettings && customSettings.partner2Tab) || "Cheltuieli_Sotie"],
      ["baseCurrency", (customSettings && customSettings.baseCurrency) || "RON"],
      ["monthlyBudget", (customSettings && customSettings.monthlyBudget) || 6000]
    ];
    settingsSheet.getRange(1, 1, defaults.length, 2).setValues(defaults);
    styleHeaderRow(settingsSheet, 2, "#1e293b");
    settingsSheet.setColumnWidth(1, 180);
    settingsSheet.setColumnWidth(2, 240);
  }

  const settings = readSettingsMap(settingsSheet);

  // 2. Categorii
  let catSheet = ss.getSheetByName(SHEET_CATEGORIES);
  if (!catSheet) {
    catSheet = ss.insertSheet(SHEET_CATEGORIES);
    catSheet.getRange(1, 1, 1, 6).setValues([["ID", "Nume", "Icon", "Culoare", "Buget_Lunar", "Grup"]]);
    catSheet.getRange(2, 1, DEFAULT_CATEGORIES.length, 6).setValues(DEFAULT_CATEGORIES);
    styleHeaderRow(catSheet, 6, "#0f766e");
    catSheet.autoResizeColumns(1, 6);
  }

  // 3. Valute
  let curSheet = ss.getSheetByName(SHEET_CURRENCIES);
  if (!curSheet) {
    curSheet = ss.insertSheet(SHEET_CURRENCIES);
    curSheet.getRange(1, 1, 1, 4).setValues([["Cod", "Nume", "Simbol", "Curs_Baza"]]);
    curSheet.getRange(2, 1, DEFAULT_CURRENCIES.length, 4).setValues(DEFAULT_CURRENCIES);
    styleHeaderRow(curSheet, 4, "#4338ca");
    curSheet.autoResizeColumns(1, 4);
  }

  // 4. Tab-urile celor 2 parteneri
  ensurePartnerTab(ss, settings.partner1Tab || "Cheltuieli_Eu", "#2563eb");
  ensurePartnerTab(ss, settings.partner2Tab || "Cheltuieli_Sotie", "#db2777");

  // 5. Sumar automat cu formule Google Sheets
  ensureSummarySheet(ss, settings);

  return settings;
}

function ensurePartnerTab(ss, tabName, headerColor) {
  let sheet = ss.getSheetByName(tabName);
  if (!sheet) {
    sheet = ss.insertSheet(tabName);
    sheet.getRange(1, 1, 1, EXPENSE_HEADERS.length).setValues([EXPENSE_HEADERS]);
    styleHeaderRow(sheet, EXPENSE_HEADERS.length, headerColor);
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 140);
    sheet.setColumnWidth(2, 110);
    sheet.setColumnWidth(3, 220);
    sheet.setColumnWidth(4, 100);
    sheet.setColumnWidth(5, 80);
    sheet.setColumnWidth(6, 110);
    sheet.setColumnWidth(7, 180);
    sheet.setColumnWidth(8, 120);
    sheet.setColumnWidth(9, 80);
    sheet.setColumnWidth(10, 220);
  }
  return sheet;
}

function ensureSummarySheet(ss, settings) {
  let sumSheet = ss.getSheetByName(SHEET_SUMMARY);
  if (!sumSheet) {
    sumSheet = ss.insertSheet(SHEET_SUMMARY);
    const t1 = settings.partner1Tab || "Cheltuieli_Eu";
    const t2 = settings.partner2Tab || "Cheltuieli_Sotie";
    const p1 = settings.partner1Name || "Eu";
    const p2 = settings.partner2Name || "Soția";
    const rows = [
      ["Indicator", "Valoare"],
      ["Total cheltuieli " + p1 + " (monedă de bază)", "=SUM('" + t1 + "'!F2:F)"],
      ["Total cheltuieli " + p2 + " (monedă de bază)", "=SUM('" + t2 + "'!F2:F)"],
      ["Total combinat familie", "=B2+B3"],
      ["Total cheltuieli comune " + p1, "=SUMIF('" + t1 + "'!I2:I,\"NU\",'" + t1 + "'!F2:F)"],
      ["Total cheltuieli comune " + p2, "=SUMIF('" + t2 + "'!I2:I,\"NU\",'" + t2 + "'!F2:F)"],
      ["Număr tranzacții " + p1, "=COUNTA('" + t1 + "'!A2:A)"],
      ["Număr tranzacții " + p2, "=COUNTA('" + t2 + "'!A2:A)"]
    ];
    sumSheet.getRange(1, 1, rows.length, 2).setValues(rows);
    styleHeaderRow(sumSheet, 2, "#059669");
    sumSheet.setColumnWidth(1, 320);
    sumSheet.setColumnWidth(2, 160);
  }
}

function styleHeaderRow(sheet, cols, bgColor) {
  const range = sheet.getRange(1, 1, 1, cols);
  range.setBackground(bgColor)
    .setFontColor("#ffffff")
    .setFontWeight("bold")
    .setVerticalAlignment("middle");
  sheet.setRowHeight(1, 30);
}

function readSettingsMap(sheet) {
  const data = sheet.getDataRange().getValues();
  const map = {
    partner1Name: "Eu",
    partner1Tab: "Cheltuieli_Eu",
    partner2Name: "Soția",
    partner2Tab: "Cheltuieli_Sotie",
    baseCurrency: "RON",
    monthlyBudget: 6000
  };
  for (let i = 1; i < data.length; i++) {
    const key = String(data[i][0] || "").trim();
    if (key) {
      map[key] = key === "monthlyBudget" ? Number(data[i][1]) || 0 : String(data[i][1] || "");
    }
  }
  return map;
}

function readCategories(ss) {
  const sheet = ss.getSheetByName(SHEET_CATEGORIES);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const list = [];
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    list.push({
      id: String(data[i][0]),
      name: String(data[i][1]),
      icon: String(data[i][2] || "📦"),
      color: String(data[i][3] || "#64748b"),
      budget: Number(data[i][4]) || 0,
      group: String(data[i][5] || "Altele")
    });
  }
  return list;
}

function readCurrencies(ss) {
  const sheet = ss.getSheetByName(SHEET_CURRENCIES);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const list = [];
  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    list.push({
      code: String(data[i][0]).toUpperCase(),
      name: String(data[i][1]),
      symbol: String(data[i][2] || data[i][0]),
      rate: Number(data[i][3]) || 1
    });
  }
  return list;
}

function formatDateCell(val) {
  if (!val) return "";
  if (val instanceof Date) {
    return Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  return String(val).slice(0, 10);
}

function readExpensesFromTab(ss, tabName, ownerKey, includePrivate) {
  const sheet = ss.getSheetByName(tabName);
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const items = [];
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[0] && !row[2]) continue;
    const isPrivate = String(row[8] || "").toUpperCase() === "DA" || row[8] === true;
    if (isPrivate && !includePrivate) continue;
    items.push({
      id: String(row[0]),
      date: formatDateCell(row[1]),
      title: String(row[2] || ""),
      amount: Number(row[3]) || 0,
      currency: String(row[4] || "RON").toUpperCase(),
      baseAmount: Number(row[5]) || 0,
      category: String(row[6] || "altele"),
      paymentMethod: String(row[7] || "Card"),
      isPrivate: isPrivate,
      notes: String(row[9] || ""),
      createdAt: String(row[10] || ""),
      updatedAt: String(row[11] || ""),
      owner: ownerKey
    });
  }
  return items;
}

function handleInit(customSettings) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const settings = ensureSheetStructure(customSettings);
  return {
    ok: true,
    sheetName: ss.getName(),
    settings: settings,
    categories: readCategories(ss),
    currencies: readCurrencies(ss)
  };
}

function handleSync(activePartner) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const settings = ensureSheetStructure();
  const p1Expenses = readExpensesFromTab(ss, settings.partner1Tab, "p1", activePartner === "p1");
  const p2Expenses = readExpensesFromTab(ss, settings.partner2Tab, "p2", activePartner === "p2");

  return {
    ok: true,
    sheetName: ss.getName(),
    syncedAt: new Date().toISOString(),
    settings: settings,
    categories: readCategories(ss),
    currencies: readCurrencies(ss),
    expenses: p1Expenses.concat(p2Expenses)
  };
}

function getPartnerTabName(settings, partnerKey) {
  return partnerKey === "p2"
    ? (settings.partner2Tab || "Cheltuieli_Sotie")
    : (settings.partner1Tab || "Cheltuieli_Eu");
}

function expenseToRow(exp) {
  const now = new Date().toISOString();
  return [
    String(exp.id || ("exp_" + Date.now())),
    String(exp.date || now.slice(0, 10)),
    String(exp.title || ""),
    Number(exp.amount) || 0,
    String(exp.currency || "RON").toUpperCase(),
    Number(exp.baseAmount) || Number(exp.amount) || 0,
    String(exp.category || "altele"),
    String(exp.paymentMethod || "Card"),
    exp.isPrivate ? "DA" : "NU",
    String(exp.notes || ""),
    String(exp.createdAt || now),
    now
  ];
}

function handleAddExpense(partnerKey, expense) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const settings = ensureSheetStructure();
  const tabName = getPartnerTabName(settings, partnerKey);
  const sheet = ensurePartnerTab(ss, tabName, partnerKey === "p2" ? "#db2777" : "#2563eb");
  const row = expenseToRow(expense);
  sheet.appendRow(row);
  return { ok: true, id: row[0] };
}

function handleUpdateExpense(partnerKey, expense) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const settings = ensureSheetStructure();
  const tabName = getPartnerTabName(settings, partnerKey);
  const sheet = ss.getSheetByName(tabName);
  if (!sheet) return { ok: false, error: "Tab-ul nu există: " + tabName };

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(expense.id)) {
      const row = expenseToRow(expense);
      sheet.getRange(i + 1, 1, 1, row.length).setValues([row]);
      return { ok: true, id: expense.id };
    }
  }
  // Dacă nu a fost găsit, îl adăugăm ca rând nou
  const row = expenseToRow(expense);
  sheet.appendRow(row);
  return { ok: true, id: row[0], inserted: true };
}

function handleDeleteExpense(partnerKey, id) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const settings = ensureSheetStructure();
  const tabName = getPartnerTabName(settings, partnerKey);
  const sheet = ss.getSheetByName(tabName);
  if (!sheet) return { ok: false, error: "Tab-ul nu există" };

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      sheet.deleteRow(i + 1);
      return { ok: true, deleted: id };
    }
  }
  return { ok: true, deleted: null };
}

function handleBulkImport(partnerKey, expenses) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const settings = ensureSheetStructure();
  const tabName = getPartnerTabName(settings, partnerKey);
  const sheet = ensurePartnerTab(ss, tabName, partnerKey === "p2" ? "#db2777" : "#2563eb");

  if (!expenses.length) return { ok: true, imported: 0 };
  const rows = expenses.map(expenseToRow);
  const startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, rows.length, EXPENSE_HEADERS.length).setValues(rows);
  return { ok: true, imported: rows.length };
}

function handleSaveCategories(categories) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheetStructure();
  const sheet = ss.getSheetByName(SHEET_CATEGORIES);
  sheet.clearContents();
  sheet.getRange(1, 1, 1, 6).setValues([["ID", "Nume", "Icon", "Culoare", "Buget_Lunar", "Grup"]]);
  if (categories.length) {
    const rows = categories.map(c => [
      String(c.id),
      String(c.name),
      String(c.icon || "📦"),
      String(c.color || "#64748b"),
      Number(c.budget) || 0,
      String(c.group || "Altele")
    ]);
    sheet.getRange(2, 1, rows.length, 6).setValues(rows);
  }
  styleHeaderRow(sheet, 6, "#0f766e");
  return { ok: true, count: categories.length };
}

function handleSaveCurrencies(currencies) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheetStructure();
  const sheet = ss.getSheetByName(SHEET_CURRENCIES);
  sheet.clearContents();
  sheet.getRange(1, 1, 1, 4).setValues([["Cod", "Nume", "Simbol", "Curs_Baza"]]);
  if (currencies.length) {
    const rows = currencies.map(c => [
      String(c.code).toUpperCase(),
      String(c.name),
      String(c.symbol || c.code),
      Number(c.rate) || 1
    ]);
    sheet.getRange(2, 1, rows.length, 4).setValues(rows);
  }
  styleHeaderRow(sheet, 4, "#4338ca");
  return { ok: true, count: currencies.length };
}

function handleSaveSettings(newSettings) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const oldSettings = ensureSheetStructure();
  const sheet = ss.getSheetByName(SHEET_SETTINGS);

  // Redenumim tab-urile dacă utilizatorul le-a schimbat numele
  if (newSettings.partner1Tab && newSettings.partner1Tab !== oldSettings.partner1Tab) {
    const s1 = ss.getSheetByName(oldSettings.partner1Tab);
    if (s1 && !ss.getSheetByName(newSettings.partner1Tab)) {
      s1.setName(newSettings.partner1Tab);
    }
  }
  if (newSettings.partner2Tab && newSettings.partner2Tab !== oldSettings.partner2Tab) {
    const s2 = ss.getSheetByName(oldSettings.partner2Tab);
    if (s2 && !ss.getSheetByName(newSettings.partner2Tab)) {
      s2.setName(newSettings.partner2Tab);
    }
  }

  const merged = Object.assign({}, oldSettings, newSettings);
  const rows = [
    ["Cheie", "Valoare"],
    ["partner1Name", merged.partner1Name],
    ["partner1Tab", merged.partner1Tab],
    ["partner2Name", merged.partner2Name],
    ["partner2Tab", merged.partner2Tab],
    ["baseCurrency", merged.baseCurrency],
    ["monthlyBudget", Number(merged.monthlyBudget) || 0]
  ];
  sheet.clearContents();
  sheet.getRange(1, 1, rows.length, 2).setValues(rows);
  styleHeaderRow(sheet, 2, "#1e293b");
  return { ok: true, settings: merged };
}

function handleUpdatePin(newPin) {
  if (!newPin || String(newPin).trim().length < 4) {
    return { ok: false, error: "PIN-ul trebuie să aibă cel puțin 4 caractere." };
  }
  PropertiesService.getScriptProperties().setProperty("ACCESS_PIN", String(newPin).trim());
  return { ok: true };
}
