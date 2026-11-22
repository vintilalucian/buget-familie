import { analyzeImportRows } from "./importer.js";

/**
 * Export & Import Excel (.xlsx / .csv) cu suport offline și previzualizare sigură.
 */

let xlsxPromise = null;

function loadSheetJS() {
  if (typeof window === "undefined") return Promise.resolve(null);
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

function transactionsToRows(transactions, store) {
  const header = [
    "ID", "Data", "Tip", "Directie", "Titlu", "Suma", "Valuta",
    "Curs", "Sursa_Curs", "Suma_Baza", "Moneda_Baza",
    "Cont_ID", "Cont_Datorie_ID", "Transfer_Group_ID", "Linked_Tx_ID",
    "Principal", "Dobanda", "Split_Status",
    "Categorie", "Metoda_Plata", "Privat", "Proprietar", "Source_Identity", "Notite"
  ];
  const rows = transactions.map((e) => {
    const cat = store.getCategory(e.category);
    return [
      e.id,
      e.date,
      e.type || "cheltuiala",
      e.direction || "out",
      e.title,
      Number(e.amount) || 0,
      e.currency,
      e.exchangeRate ?? "",
      e.rateSource || "",
      Number(e.baseAmount) || 0,
      e.baseCurrency || store.state.settings.baseCurrency,
      e.accountId || "",
      e.debtAccountId || "",
      e.transferGroupId || "",
      e.linkedTxId || "",
      e.principalAmount ?? "",
      e.interestAmount ?? "",
      e.splitStatus || "",
      cat.id,
      e.paymentMethod || "Card",
      e.isPrivate ? "DA" : "NU",
      e.owner || "necunoscut",
      e.sourceIdentity || "",
      e.notes || ""
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

    const ws1 = XLSX.utils.aoa_to_sheet(transactionsToRows(p1Items, store));
    XLSX.utils.book_append_sheet(wb, ws1, (store.state.settings.partner1Tab || "Cheltuieli_Eu").slice(0, 31));

    const ws2 = XLSX.utils.aoa_to_sheet(transactionsToRows(p2Items, store));
    XLSX.utils.book_append_sheet(wb, ws2, (store.state.settings.partner2Tab || "Cheltuieli_Sotie").slice(0, 31));

    const accRows = [
      ["ID", "Nume", "Tip", "Valuta", "Sold_Initial", "Tip_Sold_Initial", "Proprietar", "Arhivat"],
      ...(store.state.accounts || []).map((a) => [
        a.id, a.name, a.type, a.currency, a.initialBalance, a.initialBalanceType || "verificat", a.owner || "comun", a.archived ? "DA" : "NU"
      ])
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(accRows), "Conturi");

    const catRows = [
      ["ID", "Nume", "Icon", "Culoare", "Buget_Lunar", "Grup", "Tip_Categorie"],
      ...store.state.categories.map((c) => [c.id, c.name, c.icon, c.color, c.budget, c.group, c.kind || "cheltuiala"])
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

  const rows = transactionsToRows(visible, store);
  const csv = "\uFEFF" + rows.map((r) => r.map(csvEscape).join(",")).join("\r\n");
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8;" }), `BugetFamilie_${stamp}.csv`);
  return { format: "csv", count: visible.length };
}

/**
 * Citește fișierul (.csv / .xlsx) și rulează analiza de previzualizare FĂRĂ a scrie în baza de date.
 */
export async function previewImportFile(file, store) {
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

  return analyzeImportRows(rows, {
    categories: store.state.categories,
    currencies: store.state.currencies,
    accounts: store.state.accounts,
    existingTransactions: store.state.expenses,
    baseCurrency: store.state.settings.baseCurrency || "RON",
    defaultOwner: "necunoscut"
  });
}

export function parseCsv(text) {
  const clean = String(text || "").replace(/^\uFEFF/, "");
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

function csvEscape(val) {
  const s = String(val ?? "");
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
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
