import { TX_TYPES } from "./defaults.js";
import { checkBaseAmountConsistency, round2 } from "./ledger.js";

const EXACT_HEADER_MAP = {
  id: ["id", "transaction id", "tx id", "tx_id", "source_id", "cod"],
  date: ["data", "date", "transaction date", "data tranzactiei", "data_tranzactiei"],
  type: ["tip", "type", "transaction type", "tip tranzactie", "tip_tranzactie"],
  direction: ["directie", "direcție", "direction", "sens"],
  title: ["titlu", "title", "descriere", "description", "payee", "merchant", "comerciant", "nume"],
  amount: ["suma", "sumă", "amount", "valoare", "suma nativa", "sumă nativă"],
  currency: ["valuta", "valută", "moneda", "monedă", "currency"],
  exchangeRate: ["curs", "rate", "exchange rate", "exchange_rate", "curs_schimb"],
  rateSource: ["sursa_curs", "sursa curs", "rate_source", "rate source"],
  baseAmount: ["suma_baza", "suma baza", "sumă bază", "base amount", "base_amount", "amount in base currency"],
  baseCurrency: ["moneda_baza", "moneda baza", "base_currency", "base currency"],
  account: ["cont", "cont_id", "account", "account_id", "wallet", "portofel"],
  destAccount: ["cont_destinatie", "cont destinatie", "destination account", "to account"],
  destAmount: ["suma_destinatie", "suma destinatie", "sumă destinație", "destination amount", "to amount"],
  destCurrency: ["valuta_destinatie", "valuta destinatie", "destination currency", "to currency"],
  debtAccount: ["cont_datorie", "cont_datorie_id", "debt account", "loan account"],
  principal: ["principal", "principal_amount"],
  interest: ["dobanda", "dobândă", "interest", "dobanda_comisioane"],
  category: ["categorie", "category"],
  paymentMethod: ["metoda_plata", "metoda plata", "metodă plată", "payment method", "payment_method"],
  isPrivate: ["privat", "private"],
  owner: ["proprietar", "proprietar_sursa", "owner", "partener", "partner"],
  notes: ["notite", "notițe", "note", "notes", "observatii", "observații", "memo"]
};

const TYPE_ALIASES = {
  cheltuiala: "cheltuiala",
  cheltuială: "cheltuiala",
  expense: "cheltuiala",
  debit: "cheltuiala",
  venit: "venit",
  income: "venit",
  credit: "venit",
  transfer: "transfer",
  "transfer intre conturi": "transfer",
  "transfer între conturi": "transfer",
  transfer_fara_pereche: "transfer_fara_pereche",
  "transfer fara pereche": "transfer_fara_pereche",
  investitie: "investitie",
  investiție: "investitie",
  investment: "investitie",
  ajustare: "ajustare",
  adjustment: "ajustare",
  rambursare_comerciant: "rambursare_comerciant",
  "rambursare comerciant": "rambursare_comerciant",
  refund: "rambursare_comerciant",
  "merchant refund": "rambursare_comerciant",
  rambursare_imprumut: "rambursare_imprumut",
  "rambursare imprumut": "rambursare_imprumut",
  "loan repayment": "rambursare_imprumut",
  decontare_terti: "decontare_terti",
  "decontare terti": "decontare_terti",
  reimbursement: "decontare_terti",
  rata_credit: "rata_credit",
  "rata credit": "rata_credit",
  "loan installment": "rata_credit"
};

function normHeader(h) {
  return String(h ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function mapColumnsExact(headerRow) {
  const normalized = headerRow.map(normHeader);
  const cols = {};
  const ambiguous = [];

  for (const [field, aliases] of Object.entries(EXACT_HEADER_MAP)) {
    const matches = [];
    normalized.forEach((h, idx) => {
      if (aliases.includes(h)) matches.push(idx);
    });
    if (matches.length === 1) {
      cols[field] = matches[0];
    } else if (matches.length > 1) {
      cols[field] = matches[0];
      ambiguous.push({ field, headers: matches.map((i) => headerRow[i]) });
    } else {
      cols[field] = -1;
    }
  }
  return { cols, ambiguous };
}

function parseStrictDate(val) {
  if (val === undefined || val === null || val === "") return null;
  if (typeof val === "number" && val > 20000 && val < 80000) {
    const utcDays = Math.floor(val - 25569);
    const iso = new Date(utcDays * 86400 * 1000).toISOString().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
  }
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}[T ]/.test(s)) return s.slice(0, 10);
  const dmy = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (dmy) {
    const d = Number(dmy[1]);
    const m = Number(dmy[2]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${dmy[3]}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }
  }
  return null;
}

function parseStrictNumber(val) {
  if (val === undefined || val === null || val === "") return null;
  if (typeof val === "number") return Number.isFinite(val) ? val : null;
  let s = String(val).trim();
  if (!s) return null;
  // Elimină spații de mii
  s = s.replace(/\s+/g, "");
  // Format românesc 1.234,56 -> 1234.56
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d+(,\d+)$/.test(s)) {
    s = s.replace(",", ".");
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const num = Number(s);
  return Number.isFinite(num) ? num : null;
}

function buildContentFingerprint(row) {
  return [
    row.date,
    row.type,
    row.direction,
    (row.title || "").trim().toLowerCase(),
    round2(row.amount).toFixed(2),
    row.currency,
    row.accountId || ""
  ].join("|");
}

/**
 * Analizează rândurile dintr-un fișier (CSV / XLSX) FĂRĂ a scrie în baza de date.
 * Produce raport complet de previzualizare:
 * - readyRows: rânduri valide gata de import
 * - stagedRows: rânduri puse deoparte (cu motiv exact)
 * - duplicateRows: rânduri deja existente (detectate prin identitate stabilă / apariție numerotată)
 * - unknownCategories / unknownCurrencies / unknownAccounts
 * - mismatchRows: rânduri unde Suma_Baza diferă de Suma × Curs
 * - controlTotals: totaluri de control credit/debit/net + avertisment de suprapunere perioade
 */
export function analyzeImportRows(rawRows, ctx) {
  const {
    categories = [],
    currencies = [],
    accounts = [],
    existingTransactions = [],
    baseCurrency = "RON",
    defaultOwner = "necunoscut"
  } = ctx || {};

  if (!Array.isArray(rawRows) || rawRows.length < 2) {
    return {
      ok: false,
      error: "Fișierul nu conține antet și rânduri de date.",
      totalRead: 0,
      readyRows: [],
      stagedRows: [],
      duplicateRows: [],
      mismatchRows: [],
      unknownCategories: [],
      unknownCurrencies: [],
      unknownAccounts: [],
      ambiguousColumns: [],
      overlapWarning: null,
      controlTotals: {
        sourceCredit: 0, sourceDebit: 0, sourceNet: 0,
        readyCredit: 0, readyDebit: 0, readyNet: 0,
        hasUnexplainedDiff: false
      }
    };
  }

  const { cols, ambiguous } = mapColumnsExact(rawRows[0]);
  const catByKey = new Map();
  categories.forEach((c) => {
    catByKey.set(c.id.toLowerCase(), c);
    catByKey.set(c.name.toLowerCase(), c);
  });
  const curByCode = new Map(currencies.map((c) => [c.code.toUpperCase(), c]));
  const accByKey = new Map();
  accounts.forEach((a) => {
    accByKey.set(a.id.toLowerCase(), a);
    accByKey.set(a.name.toLowerCase(), a);
  });

  // Index identități existente pentru detectare dubluri fără a contopi tranzacții legitime identice
  const existingIdentities = new Set();
  const existingDates = [];
  existingTransactions.forEach((tx) => {
    if (tx.sourceIdentity) existingIdentities.add(tx.sourceIdentity);
    if (tx.id) existingIdentities.add("src:" + tx.id);
    if (tx.date) existingDates.push(tx.date);
  });

  const readyRows = [];
  const stagedRows = [];
  const duplicateRows = [];
  const mismatchRows = [];
  const unknownCategories = new Set();
  const unknownCurrencies = new Set();
  const unknownAccounts = new Set();
  const occurrenceCounter = new Map();

  let totalRead = 0;
  let sourceCredit = 0;
  let sourceDebit = 0;
  let readyCredit = 0;
  let readyDebit = 0;
  const importDates = [];

  const getCell = (r, field) => (cols[field] >= 0 ? r[cols[field]] : undefined);

  for (let i = 1; i < rawRows.length; i++) {
    const r = rawRows[i];
    if (!r || r.every((cell) => String(cell ?? "").trim() === "")) continue;
    totalRead += 1;

    const reasons = [];
    const rawId = String(getCell(r, "id") ?? "").trim();
    const rawDate = getCell(r, "date");
    const rawType = String(getCell(r, "type") ?? "").trim().toLowerCase();
    const rawDir = String(getCell(r, "direction") ?? "").trim().toLowerCase();
    const title = String(getCell(r, "title") ?? "").trim();
    const rawAmount = parseStrictNumber(getCell(r, "amount"));
    const rawCurrency = String(getCell(r, "currency") ?? "").trim().toUpperCase();
    const rawRate = parseStrictNumber(getCell(r, "exchangeRate"));
    const rawRateSource = String(getCell(r, "rateSource") ?? "").trim() || "sursa_import";
    const rawBaseAmount = parseStrictNumber(getCell(r, "baseAmount"));
    const rawBaseCur = String(getCell(r, "baseCurrency") ?? baseCurrency).trim().toUpperCase();
    const rawCat = String(getCell(r, "category") ?? "").trim();
    const rawAcc = String(getCell(r, "account") ?? "").trim();
    const rawDestAcc = String(getCell(r, "destAccount") ?? "").trim();
    const rawDestAmt = parseStrictNumber(getCell(r, "destAmount"));
    const rawDestCur = String(getCell(r, "destCurrency") ?? "").trim().toUpperCase();
    const rawPrincipal = parseStrictNumber(getCell(r, "principal"));
    const rawInterest = parseStrictNumber(getCell(r, "interest"));
    const rawPayment = String(getCell(r, "paymentMethod") ?? "").trim() || "Card";
    const rawPrivate = String(getCell(r, "isPrivate") ?? "").trim().toLowerCase();
    const rawOwner = String(getCell(r, "owner") ?? "").trim();
    const notes = String(getCell(r, "notes") ?? "").trim();

    // 1. Data (nu inventăm data de azi!)
    const date = parseStrictDate(rawDate);
    if (!date) reasons.push("Data lipsește sau are format invalid");
    else importDates.push(date);

    // 2. Tip explicit (NU transformăm tăcut venituri/transferuri în cheltuieli!)
    let type = null;
    if (rawType) {
      type = TYPE_ALIASES[rawType] || null;
      if (!type) reasons.push(`Tip necunoscut: "${rawType}"`);
    } else if (cols.type >= 0) {
      reasons.push("Tipul tranzacției lipsește");
    } else {
      // Dacă fișierul nu are deloc coloană Tip, acceptăm implicit cheltuiala DOAR dacă suma e strict pozitivă
      type = "cheltuiala";
    }

    // 3. Suma (NU aplicăm Math.abs()!)
    if (rawAmount === null) {
      reasons.push("Suma nu este un număr valid");
    } else if (rawAmount <= 0) {
      reasons.push(`Sumă negativă sau zero (${rawAmount}) — necesită tip și direcție explicite, nu se aplică abs()`);
    }

    // 4. Valuta (nu inventăm curs sau valută!)
    const currency = rawCurrency || baseCurrency;
    const curObj = curByCode.get(currency);
    if (!curObj) {
      unknownCurrencies.add(currency);
      reasons.push(`Valută necunoscută: "${currency}"`);
    }

    // 5. Categorie (nu înlocuim tăcut cu altele!)
    let categoryId = null;
    if (type === "transfer" || type === "transfer_fara_pereche" || type === "ajustare") {
      categoryId = rawCat ? (catByKey.get(rawCat.toLowerCase())?.id || "altele") : "altele";
    } else if (rawCat) {
      const matched = catByKey.get(rawCat.toLowerCase());
      if (matched) {
        categoryId = matched.id;
      } else {
        unknownCategories.add(rawCat);
        reasons.push(`Categorie necunoscută: "${rawCat}"`);
      }
    } else {
      reasons.push("Categoria lipsește");
    }

    // 6. Cont (dacă coloana există și are valoare, trebuie să existe în Conturi)
    let accountId = "";
    if (rawAcc) {
      const matchedAcc = accByKey.get(rawAcc.toLowerCase());
      if (matchedAcc) accountId = matchedAcc.id;
      else {
        unknownAccounts.add(rawAcc);
        reasons.push(`Cont necunoscut: "${rawAcc}"`);
      }
    }

    // 7. Direcție
    const defaultDir = type && TX_TYPES[type] ? TX_TYPES[type].defaultDir : "out";
    const direction = rawDir === "in" || rawDir === "out" ? rawDir : defaultDir;

    // 8. Totaluri de control din sursă (dacă suma e numerică pozitivă și tipul e cunoscut)
    if (rawAmount !== null && rawAmount > 0 && type) {
      if (direction === "in") sourceCredit = round2(sourceCredit + rawAmount);
      else sourceDebit = round2(sourceDebit + rawAmount);
    }

    // 9. Suma_Baza și Curs — păstrăm din sursă, verificăm consistența
    let exchangeRate = rawRate;
    let baseAmount = rawBaseAmount;
    let baseMismatch = false;
    let mismatchInfo = null;

    if (exchangeRate === null) {
      if (currency === rawBaseCur) {
        exchangeRate = 1;
      } else if (baseAmount !== null && rawAmount && rawAmount > 0) {
        exchangeRate = round2((baseAmount / rawAmount) * 10000) / 10000;
      } else if (curObj) {
        exchangeRate = curObj.rate;
      }
    }

    if (baseAmount === null && rawAmount !== null && rawAmount > 0 && exchangeRate !== null) {
      baseAmount = round2(rawAmount * exchangeRate);
    }

    if (rawAmount !== null && rawAmount > 0 && exchangeRate !== null && baseAmount !== null) {
      const check = checkBaseAmountConsistency(rawAmount, exchangeRate, baseAmount);
      if (check.mismatch) {
        baseMismatch = true;
        mismatchInfo = `Suma_Baza (${baseAmount}) != Suma × Curs (${check.expected})`;
      }
    }

    // 10. Proprietar sursă (nu falsificăm ca p1 dacă lipsește!)
    let owner = defaultOwner;
    if (rawOwner) {
      const lo = rawOwner.toLowerCase();
      if (lo === "p1" || lo === "eu") owner = "p1";
      else if (lo === "p2" || lo === "sotia" || lo === "soția") owner = "p2";
      else owner = rawOwner;
    }

    if (reasons.length > 0) {
      stagedRows.push({
        rowNumber: i + 1,
        rawTitle: title || "(fără titlu)",
        rawAmount: getCell(r, "amount"),
        rawType: rawType || "(lipsă)",
        reasons
      });
      continue;
    }

    const baseTx = {
      date,
      type,
      direction,
      title: title || TX_TYPES[type].label,
      amount: round2(rawAmount),
      currency,
      exchangeRate,
      rateSource: rawRate !== null || rawBaseAmount !== null ? rawRateSource : "curs_curent",
      baseAmount: round2(baseAmount),
      baseCurrency: rawBaseCur,
      baseMismatch,
      accountId,
      category: categoryId,
      paymentMethod: rawPayment,
      isPrivate: ["da", "yes", "true", "1"].includes(rawPrivate),
      owner,
      notes
    };

    if (type === "rata_credit") {
      if (rawPrincipal !== null || rawInterest !== null) {
        baseTx.principalAmount = round2(rawPrincipal || 0);
        baseTx.interestAmount = round2(rawInterest || 0);
        baseTx.splitStatus = "defalcat";
      } else {
        baseTx.splitStatus = "nedefalcat";
      }
    }

    // Transfer cu destinație explicită pe același rând -> pregătim 2 picioare
    if (type === "transfer" && rawDestAcc) {
      const destAccObj = accByKey.get(rawDestAcc.toLowerCase());
      if (!destAccObj) {
        unknownAccounts.add(rawDestAcc);
        stagedRows.push({
          rowNumber: i + 1,
          rawTitle: title || "Transfer",
          rawAmount,
          rawType: type,
          reasons: [`Cont destinație necunoscut: "${rawDestAcc}"`]
        });
        continue;
      }
      baseTx.destAccountId = destAccObj.id;
      baseTx.destAmount = rawDestAmt !== null && rawDestAmt > 0 ? round2(rawDestAmt) : baseTx.amount;
      baseTx.destCurrency = rawDestCur || destAccObj.currency || baseTx.currency;
    }

    // Identitate stabilă: fie din ID sursă, fie amprentă + apariție numerotată (#1, #2...)
    let sourceIdentity;
    if (rawId) {
      sourceIdentity = "src:" + rawId;
    } else {
      const fp = buildContentFingerprint(baseTx);
      const count = (occurrenceCounter.get(fp) || 0) + 1;
      occurrenceCounter.set(fp, count);
      sourceIdentity = `fp:${fp}#${count}`;
    }

    if (existingIdentities.has(sourceIdentity)) {
      duplicateRows.push({
        rowNumber: i + 1,
        title: baseTx.title,
        date: baseTx.date,
        amount: baseTx.amount,
        currency: baseTx.currency,
        sourceIdentity
      });
      continue;
    }

    baseTx.sourceIdentity = sourceIdentity;
    baseTx.id = rawId || `imp_${simpleHash(sourceIdentity)}`;
    existingIdentities.add(sourceIdentity);

    if (baseMismatch) {
      mismatchRows.push({
        rowNumber: i + 1,
        id: baseTx.id,
        title: baseTx.title,
        detail: mismatchInfo
      });
    }

    if (baseTx.direction === "in") readyCredit = round2(readyCredit + baseTx.amount);
    else readyDebit = round2(readyDebit + baseTx.amount);

    readyRows.push(baseTx);
  }

  // Audit de suprapunere de perioade față de tranzacțiile existente
  let overlapWarning = null;
  if (importDates.length && existingDates.length) {
    const impMin = [...importDates].sort()[0];
    const impMax = [...importDates].sort()[importDates.length - 1];
    const exMin = [...existingDates].sort()[0];
    const exMax = [...existingDates].sort()[existingDates.length - 1];
    if (impMin <= exMax && impMax >= exMin) {
      overlapWarning = `Perioada importată (${impMin} → ${impMax}) se suprapune cu datele existente (${exMin} → ${exMax}). Verifică dublurile și totalurile de control.`;
    }
  }

  const sourceNet = round2(sourceCredit - sourceDebit);
  const readyNet = round2(readyCredit - readyDebit);
  const hasUnexplainedDiff = stagedRows.length > 0 || (duplicateRows.length === 0 && Math.abs(sourceNet - readyNet) > 0.01);

  return {
    ok: true,
    totalRead,
    readyRows,
    stagedRows,
    duplicateRows,
    mismatchRows,
    unknownCategories: Array.from(unknownCategories),
    unknownCurrencies: Array.from(unknownCurrencies),
    unknownAccounts: Array.from(unknownAccounts),
    ambiguousColumns: ambiguous,
    overlapWarning,
    controlTotals: {
      sourceCredit,
      sourceDebit,
      sourceNet,
      readyCredit,
      readyDebit,
      readyNet,
      hasUnexplainedDiff
    }
  };
}

function simpleHash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
