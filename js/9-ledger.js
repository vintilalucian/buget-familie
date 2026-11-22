import { TX_TYPES } from "./defaults.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Verifică dacă Suma_Baza corespunde cu Suma * Curs (toleranță max(0.05, 1%)).
 * Nu suprascrie tăcut Suma_Baza — returnează un verdict explicit.
 */
export function checkBaseAmountConsistency(amount, exchangeRate, baseAmount) {
  const amt = Number(amount);
  const rate = Number(exchangeRate);
  const base = Number(baseAmount);
  if (!Number.isFinite(amt) || !Number.isFinite(rate) || rate <= 0 || !Number.isFinite(base)) {
    return { checked: false, mismatch: false, expected: null, diff: null };
  }
  const expected = round2(amt * rate);
  const diff = round2(Math.abs(base - expected));
  const tolerance = Math.max(0.05, expected * 0.01);
  return {
    checked: true,
    mismatch: diff > tolerance,
    expected,
    diff
  };
}

/**
 * Validează o tranzacție fără a inventa valori tăcute (fără abs(), fără data de azi, fără ID gol).
 */
export function validateTransaction(tx) {
  const errors = [];
  const warnings = [];

  if (!tx || typeof tx !== "object") {
    return { valid: false, errors: ["Obiect tranzacție invalid"], warnings: [], baseMismatch: false };
  }

  if (!tx.id || !String(tx.id).trim()) {
    errors.push("MISSING_ID: Rândul nu are ID stabil.");
  }

  if (!tx.date || !DATE_RE.test(String(tx.date).trim())) {
    errors.push("INVALID_DATE: Data lipsește sau nu respectă formatul YYYY-MM-DD.");
  }

  const type = tx.type || "cheltuiala";
  if (!TX_TYPES[type]) {
    errors.push(`INVALID_TYPE: Tip tranzacție necunoscut (${type}).`);
  }

  const rawAmt = Number(tx.amount);
  if (!Number.isFinite(rawAmt) || rawAmt <= 0) {
    errors.push("INVALID_AMOUNT: Suma trebuie să fie un număr strict pozitiv (nu se aplică abs() tăcut).");
  }

  if (!tx.currency || !String(tx.currency).trim()) {
    errors.push("MISSING_CURRENCY: Valuta lipsește.");
  }

  let baseMismatch = Boolean(tx.baseMismatch);
  if (tx.baseAmount !== undefined && tx.baseAmount !== null && tx.baseAmount !== "") {
    const rawBase = Number(tx.baseAmount);
    if (!Number.isFinite(rawBase) || rawBase < 0) {
      errors.push("INVALID_BASE_AMOUNT: Suma în moneda de bază este invalidă.");
    } else if (tx.exchangeRate !== undefined && tx.exchangeRate !== null && Number(tx.exchangeRate) > 0) {
      const check = checkBaseAmountConsistency(rawAmt, tx.exchangeRate, rawBase);
      if (check.mismatch) {
        baseMismatch = true;
        warnings.push(
          `BASE_MISMATCH: Suma_Baza (${rawBase}) diferă de Suma × Curs (${check.expected}, diferență ${check.diff}).`
        );
      }
    }
  }

  if (type === "rata_credit" && tx.splitStatus === "defalcat") {
    const p = Number(tx.principalAmount) || 0;
    const i = Number(tx.interestAmount) || 0;
    if (p < 0 || i < 0) {
      errors.push("INVALID_CREDIT_SPLIT: Principalul și dobânda trebuie să fie >= 0.");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    baseMismatch
  };
}

/**
 * Creează un transfer legat cu două picioare (sursă OUT + destinație IN).
 * Suportă atât transferuri în aceeași valută, cât și transferuri între valute diferite (cross-currency).
 */
export function createTransferPair({
  idPrefix,
  date,
  title,
  sourceAccountId,
  destAccountId,
  sourceAmount,
  sourceCurrency,
  destAmount,
  destCurrency,
  sourceBaseAmount,
  destBaseAmount,
  baseCurrency = "RON",
  sourceExchangeRate = 1,
  destExchangeRate = 1,
  rateSource = "manual",
  owner = "p1",
  isPrivate = false,
  notes = ""
}) {
  if (!sourceAccountId || !destAccountId) {
    throw new Error("Transferul necesită atât cont sursă, cât și cont destinație.");
  }
  if (sourceAccountId === destAccountId) {
    throw new Error("Contul sursă și contul destinație trebuie să fie diferite.");
  }
  const sAmt = Number(sourceAmount);
  const dAmt = Number(destAmount ?? sourceAmount);
  if (!Number.isFinite(sAmt) || sAmt <= 0 || !Number.isFinite(dAmt) || dAmt <= 0) {
    throw new Error("Sumele transferului trebuie să fie strict pozitive.");
  }

  const now = new Date().toISOString();
  const groupId = "tr_" + (idPrefix || (Date.now() + "_" + Math.random().toString(36).slice(2, 6)));
  const sCur = String(sourceCurrency || baseCurrency).toUpperCase();
  const dCur = String(destCurrency || sCur).toUpperCase();
  const sRate = Number(sourceExchangeRate) || 1;
  const dRate = Number(destExchangeRate) || 1;

  const legOut = {
    id: `${groupId}_out`,
    date,
    type: "transfer",
    direction: "out",
    transferGroupId: groupId,
    title: title || "Transfer între conturi",
    amount: round2(sAmt),
    currency: sCur,
    exchangeRate: sRate,
    rateSource,
    baseAmount: round2(sourceBaseAmount ?? sAmt * sRate),
    baseCurrency,
    accountId: sourceAccountId,
    category: "altele",
    paymentMethod: "Transfer",
    isPrivate: Boolean(isPrivate),
    notes,
    owner,
    createdAt: now,
    updatedAt: now
  };

  const legIn = {
    id: `${groupId}_in`,
    date,
    type: "transfer",
    direction: "in",
    transferGroupId: groupId,
    title: title || "Transfer între conturi",
    amount: round2(dAmt),
    currency: dCur,
    exchangeRate: dRate,
    rateSource,
    baseAmount: round2(destBaseAmount ?? dAmt * dRate),
    baseCurrency,
    accountId: destAccountId,
    category: "altele",
    paymentMethod: "Transfer",
    isPrivate: Boolean(isPrivate),
    notes,
    owner,
    createdAt: now,
    updatedAt: now
  };

  return [legOut, legIn];
}

/**
 * Calculează soldul nativ al fiecărui cont pornind de la initialBalance + toate tranzacțiile valide.
 * Tranzacțiile invalide (ex: sume negative în Sheet) sunt ignorate și semnalate, nu corup tăcut soldul.
 */
export function computeAccountBalances(accounts, transactions) {
  const map = new Map();
  (accounts || []).forEach((acc) => {
    map.set(acc.id, {
      ...acc,
      balance: round2(acc.initialBalance || 0),
      txCount: 0
    });
  });

  (transactions || []).forEach((tx) => {
    const v = validateTransaction(tx);
    if (!v.valid) return;

    const amt = Number(tx.amount);
    const type = tx.type || "cheltuiala";
    const dir = tx.direction || TX_TYPES[type]?.defaultDir || "out";

    if (tx.accountId && map.has(tx.accountId)) {
      const entry = map.get(tx.accountId);
      let delta = 0;
      if (type === "cheltuiala" || type === "rata_credit") {
        delta = -amt;
      } else if (type === "venit" || type === "rambursare_comerciant" || type === "decontare_terti") {
        delta = +amt;
      } else {
        // transfer, transfer_fara_pereche, investitie, ajustare, rambursare_imprumut -> direcție explicită
        delta = dir === "in" ? +amt : -amt;
      }
      entry.balance = round2(entry.balance + delta);
      entry.txCount += 1;
    }

    // Pentru rata_credit cu principal defalcat, principalul reduce soldul datoriei (ex: -45000 + 310 = -44690)
    if (type === "rata_credit" && tx.debtAccountId && map.has(tx.debtAccountId)) {
      const principal = Number(tx.principalAmount) || 0;
      if (principal > 0) {
        const debtAcc = map.get(tx.debtAccountId);
        debtAcc.balance = round2(debtAcc.balance + principal);
        debtAcc.txCount += 1;
      }
    }

    // Pentru rambursare_imprumut legată de un cont de datorie separat
    if (type === "rambursare_imprumut" && tx.debtAccountId && tx.debtAccountId !== tx.accountId && map.has(tx.debtAccountId)) {
      const debtAcc = map.get(tx.debtAccountId);
      // Dacă am plătit către împrumut (out din cont curent), datoria scade (+amt spre 0); dacă am primit înapoi (in), creanța scade (-amt)
      const debtDelta = dir === "out" ? +amt : -amt;
      debtAcc.balance = round2(debtAcc.balance + debtDelta);
      debtAcc.txCount += 1;
    }
  });

  return Array.from(map.values());
}

/**
 * Calculează sumarul contabil (venituri, cheltuieli brute/nete, rambursări, dobânzi credite, transferuri)
 * strict pe baza tipului explicit, fără ghicire după semn.
 */
export function computeLedgerSummary(transactions) {
  let venituri = 0;
  let cheltuieliBrute = 0;
  let rambursariComerciant = 0;
  let dobanziCredite = 0;
  let principalCredite = 0;
  let rateNedefalcate = 0;
  let rambursariImprumut = 0;
  let decontariTerti = 0;
  let transferuriVolum = 0;
  let investitiiVolum = 0;
  let ajustariCount = 0;
  const invalidRows = [];
  const mismatchRows = [];

  (transactions || []).forEach((tx) => {
    const v = validateTransaction(tx);
    if (!v.valid) {
      invalidRows.push({ tx, errors: v.errors });
      return;
    }
    if (v.baseMismatch) {
      mismatchRows.push({ tx, warnings: v.warnings });
    }

    const base = Number(tx.baseAmount) || 0;
    const type = tx.type || "cheltuiala";
    const rate = Number(tx.exchangeRate) || (tx.amount > 0 ? base / tx.amount : 1);

    switch (type) {
      case "venit":
        venituri += base;
        break;
      case "cheltuiala":
        cheltuieliBrute += base;
        break;
      case "rambursare_comerciant":
        // Reduce cheltuiala netă; NU crește venitul
        rambursariComerciant += base;
        break;
      case "rata_credit": {
        const hasSplit = tx.splitStatus === "defalcat" || Number(tx.principalAmount) > 0 || Number(tx.interestAmount) > 0;
        if (hasSplit) {
          const pBase = round2((Number(tx.principalAmount) || 0) * rate);
          const iBase = round2((Number(tx.interestAmount) || 0) * rate);
          principalCredite += pBase;
          dobanziCredite += iBase;
        } else {
          // Rămâne explicit "nedefalcat" — nu inventăm defalcare
          rateNedefalcate += base;
        }
        break;
      }
      case "rambursare_imprumut":
        // Mișcă datoria, NU e venit
        rambursariImprumut += base;
        break;
      case "decontare_terti":
        decontariTerti += base;
        break;
      case "transfer":
      case "transfer_fara_pereche":
        // Nu intră în cheltuieli sau venituri
        if ((tx.direction || "out") === "out") transferuriVolum += base;
        break;
      case "investitie":
        investitiiVolum += base;
        break;
      case "ajustare":
        ajustariCount += 1;
        break;
      default:
        break;
    }
  });

  const cheltuieliNete = round2(Math.max(0, cheltuieliBrute - rambursariComerciant) + dobanziCredite);
  const balantaNeta = round2(venituri - cheltuieliNete);

  return {
    venituri: round2(venituri),
    cheltuieliBrute: round2(cheltuieliBrute),
    rambursariComerciant: round2(rambursariComerciant),
    dobanziCredite: round2(dobanziCredite),
    principalCredite: round2(principalCredite),
    rateNedefalcate: round2(rateNedefalcate),
    cheltuieliNete,
    balantaNeta,
    rambursariImprumut: round2(rambursariImprumut),
    decontariTerti: round2(decontariTerti),
    transferuriVolum: round2(transferuriVolum),
    investitiiVolum: round2(investitiiVolum),
    ajustariCount,
    invalidRows,
    mismatchRows
  };
}
