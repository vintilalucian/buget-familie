/**
 * Export & Import Excel (.xlsx / .csv) cu suport offline complet.
 * Dacă utilizatorul este online, încarcă SheetJS (xlsx) pentru fișiere .xlsx native cu tab-uri separate.
 * Dacă este offline, folosește export/import CSV UTF-8 compatibil direct cu Excel și Google Sheets.
 */

let xlsxPromise = null;

function loadSheetJS() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (!navigator.onLine) return Promise.resolve(null);
  if (!xlsxPromise) {
    xlsxPromise = new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
      script.async = true;
      script.onload = () => resolve(window.XLSX || null);
      script.onerror = () => resolve(null);
      document.head.appendChild(script);
    });
  }
  return xlsxPromise;
}

function expensesToRows(expenses, store) {
  const header = [
    "ID", "Data", "Titlu", "Suma", "Valuta", "Suma_Baza",
    "Categorie", "Metoda_Plata", "Privat", "Notite", "Partener"
  ];
  const rows = expenses.map((e) => {
    const cat = store.getCategory(e.category);
    return [
      e.id,
      e.date,
      e.title,
      Number(e.amount) || 0,
      e.currency,
      Number(e.baseAmount) || 0,
      cat.name,
      e.paymentMethod || "Card",
      e.isPrivate ? "DA" : "NU",
      e.notes || "",
      store.getPartnerName(e.owner)
    ];
  });
  return [header, ...rows];
}

export async function exportToExcel(store) {
  const XLSX = await loadSheetJS();
  const visible = store.getVisibleExpenses({ scope: "all" });
  const p1Items = visible.filter((e) => e.owner !== "p2");
  const p2Items = visible.filter((e) => e.owner === "p2");
  const stamp = new Date().toISOString().slice(0, 10);

  if (XLSX) {
    const wb = XLSX.utils.book_new();

    const ws1 = XLSX.utils.aoa_to_sheet(expensesToRows(p1Items, store));
    XLSX.utils.book_append_sheet(wb, ws1, (store.state.settings.partner1Tab || "Cheltuieli_Eu").slice(0, 31));

    const ws2 = XLSX.utils.aoa_to_sheet(expensesToRows(p2Items, store));
    XLSX.utils.book_append_sheet(wb, ws2, (store.state.settings.partner2Tab || "Cheltuieli_Sotie").slice(0, 31));

    const catRows = [
      ["ID", "Nume", "Icon", "Culoare", "Buget_Lunar", "Grup"],
      ...store.state.categories.map((c) => [c.id, c.name, c.icon, c.color, c.budget, c.group])
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(catRows), "Categorii");

    const curRows = [
      ["Cod", "Nume", "Simbol", "Curs_Baza"],
      ...store.state.currencies.map((c) => [c.code, c.name, c.symbol, c.rate])
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(curRows), "Valute");

    XLSX.writeFile(wb, `BugetFamilie_${stamp}.xlsx`);
    return { format: "xlsx", count: visible.length };
  }

  // Fallback CSV cu BOM UTF-8 (se deschide corect cu diacritice în Excel)
  const rows = expensesToRows(visible, store);
  const csv = "\uFEFF" + rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8;" }), `BugetFamilie_${stamp}.csv`);
  return { format: "csv", count: visible.length };
}

export async function importFromFile(file, store) {
  const name = (file.name || "").toLowerCase();
  let rows = [];

  if (name.endsWith(".csv")) {
    const text = await file.text();
    rows = parseCsv(text);
  } else {
    const XLSX = await loadSheetJS();
    if (!XLSX) {
      throw new Error("Pentru import .xlsx este necesară conexiune la internet (sau folosește un fișier .csv).");
    }
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const firstSheet = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: "" });
  }

  if (rows.length < 2) {
    throw new Error("Fișierul nu conține rânduri de cheltuieli.");
  }

  const headers = rows[0].map((h) => String(h || "").trim().toLowerCase());
  const col = (aliases) => headers.findIndex((h) => aliases.some((a) => h.includes(a)));

  const idxDate = col(["data", "date"]);
  const idxTitle = col(["titlu", "descriere", "title", "produs", "nume"]);
  const idxAmount = col(["suma", "valoare", "amount", "pret"]);
  const idxCurrency = col(["valuta", "moneda", "currency"]);
  const idxCategory = col(["categorie", "category"]);
  const idxPayment = col(["metoda", "plata", "payment"]);
  const idxPrivate = col(["privat", "private"]);
  const idxNotes = col(["notite", "note", "observatii"]);

  const imported = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r.length) continue;
    const rawTitle = idxTitle >= 0 ? String(r[idxTitle] || "").trim() : "";
    const rawAmount = idxAmount >= 0 ? parseFloat(String(r[idxAmount]).replace(",", ".")) : NaN;
    if (!rawTitle && isNaN(rawAmount)) continue;

    // Potrivire categorie după ID sau nume
    const rawCat = idxCategory >= 0 ? String(r[idxCategory] || "").trim() : "";
    const matchedCat = store.state.categories.find(
      (c) => c.id.toLowerCase() === rawCat.toLowerCase() || c.name.toLowerCase() === rawCat.toLowerCase()
    );

    imported.push({
      date: normalizeDate(idxDate >= 0 ? r[idxDate] : ""),
      title: rawTitle || "Cheltuială importată",
      amount: isNaN(rawAmount) ? 0 : Math.abs(rawAmount),
      currency: idxCurrency >= 0 && r[idxCurrency] ? String(r[idxCurrency]).trim().toUpperCase() : store.state.settings.baseCurrency,
      category: matchedCat ? matchedCat.id : "altele",
      paymentMethod: idxPayment >= 0 && r[idxPayment] ? String(r[idxPayment]).trim() : "Card",
      isPrivate: idxPrivate >= 0 ? ["da", "yes", "true", "1"].includes(String(r[idxPrivate]).trim().toLowerCase()) : false,
      notes: idxNotes >= 0 ? String(r[idxNotes] || "").trim() : ""
    });
  }

  return imported;
}

function normalizeDate(val) {
  if (!val) return new Date().toISOString().slice(0, 10);
  if (typeof val === "number" && val > 20000) {
    // Excel serial date
    const utcDays = Math.floor(val - 25569);
    return new Date(utcDays * 86400 * 1000).toISOString().slice(0, 10);
  }
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const dmy = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }
  return new Date().toISOString().slice(0, 10);
}

function csvEscape(val) {
  const s = String(val ?? "");
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function parseCsv(text) {
  const clean = text.replace(/^\uFEFF/, "");
  const rows = [];
  let cur = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (inQuotes) {
      if (ch === '"' && clean[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === "," || ch === ";") {
      cur.push(field);
      field = "";
    } else if (ch === "\n") {
      cur.push(field.replace(/\r$/, ""));
      rows.push(cur);
      cur = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field || cur.length) {
    cur.push(field.replace(/\r$/, ""));
    rows.push(cur);
  }
  return rows;
}

function downloadBlob(blob, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 500);
}
