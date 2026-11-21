import { DAYS_RO, MONTHS_SHORT_RO } from "./defaults.js";

export function formatMoney(amount, currencySymbolOrCode = "RON") {
  const num = Number(amount) || 0;
  const formatted = new Intl.NumberFormat("ro-RO", {
    minimumFractionDigits: num % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2
  }).format(num);
  return `${formatted} ${currencySymbolOrCode}`;
}

export function computeMonthlyAnalytics(store, year, month, scope = "all") {
  const baseCur = store.state.settings.baseCurrency || "RON";
  const expenses = store.getVisibleExpenses({ year, month, scope });

  // Luna precedentă pentru comparație
  const prevDate = new Date(year, month - 1, 1);
  const prevExpenses = store.getVisibleExpenses({
    year: prevDate.getFullYear(),
    month: prevDate.getMonth(),
    scope
  });

  const total = expenses.reduce((s, e) => s + (Number(e.baseAmount) || 0), 0);
  const prevTotal = prevExpenses.reduce((s, e) => s + (Number(e.baseAmount) || 0), 0);
  const diffPrev = total - prevTotal;
  const diffPrevPct = prevTotal > 0 ? Math.round((diffPrev / prevTotal) * 100) : null;

  // Împărțire pe parteneri (toate vizibile + doar comune pentru decont 50/50)
  let p1Total = 0;
  let p2Total = 0;
  let p1Shared = 0;
  let p2Shared = 0;

  expenses.forEach((e) => {
    const val = Number(e.baseAmount) || 0;
    if (e.owner === "p2") {
      p2Total += val;
      if (!e.isPrivate) p2Shared += val;
    } else {
      p1Total += val;
      if (!e.isPrivate) p1Shared += val;
    }
  });

  // Pe categorii
  const catMap = new Map();
  expenses.forEach((e) => {
    const cat = store.getCategory(e.category);
    const cur = catMap.get(cat.id) || {
      ...cat,
      total: 0,
      count: 0
    };
    cur.total += Number(e.baseAmount) || 0;
    cur.count += 1;
    catMap.set(cat.id, cur);
  });

  const byCategory = Array.from(catMap.values())
    .sort((a, b) => b.total - a.total)
    .map((c) => ({
      ...c,
      pct: total > 0 ? (c.total / total) * 100 : 0,
      budgetPct: c.budget > 0 ? (c.total / c.budget) * 100 : 0
    }));

  // Pe valute originale
  const curMap = new Map();
  expenses.forEach((e) => {
    const code = e.currency || baseCur;
    const entry = curMap.get(code) || { code, originalTotal: 0, baseTotal: 0, count: 0 };
    entry.originalTotal += Number(e.amount) || 0;
    entry.baseTotal += Number(e.baseAmount) || 0;
    entry.count += 1;
    curMap.set(code, entry);
  });
  const byCurrency = Array.from(curMap.values()).sort((a, b) => b.baseTotal - a.baseTotal);

  // Pe zile din lună & zile din săptămână
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dailyTotals = Array.from({ length: daysInMonth }, (_, i) => ({ day: i + 1, total: 0 }));
  const weekdayTotals = Array.from({ length: 7 }, (_, i) => ({ dayIndex: i, name: DAYS_RO[i], total: 0, count: 0 }));

  expenses.forEach((e) => {
    if (!e.date) return;
    const parts = e.date.split("-").map(Number);
    if (parts.length === 3) {
      const dayIdx = parts[2] - 1;
      if (dayIdx >= 0 && dayIdx < daysInMonth) {
        dailyTotals[dayIdx].total += Number(e.baseAmount) || 0;
      }
      const wd = new Date(parts[0], parts[1] - 1, parts[2]).getDay();
      weekdayTotals[wd].total += Number(e.baseAmount) || 0;
      weekdayTotals[wd].count += 1;
    }
  });

  // Medie zilnică & proiecție sfârșit de lună
  const now = new Date();
  const isCurrentMonth = now.getFullYear() === year && now.getMonth() === month;
  const elapsedDays = isCurrentMonth ? Math.max(1, now.getDate()) : daysInMonth;
  const dailyAvg = total / elapsedDays;
  const projectedTotal = isCurrentMonth ? dailyAvg * daysInMonth : total;

  // Buget
  const monthlyBudget = Number(store.state.settings.monthlyBudget) || 0;
  const budgetPct = monthlyBudget > 0 ? (total / monthlyBudget) * 100 : 0;
  const remainingBudget = monthlyBudget - total;

  // Trend ultimele 6 luni
  const trend6Months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(year, month - i, 1);
    const mExp = store.getVisibleExpenses({ year: d.getFullYear(), month: d.getMonth(), scope });
    let mP1 = 0;
    let mP2 = 0;
    mExp.forEach((e) => {
      if (e.owner === "p2") mP2 += Number(e.baseAmount) || 0;
      else mP1 += Number(e.baseAmount) || 0;
    });
    trend6Months.push({
      year: d.getFullYear(),
      month: d.getMonth(),
      label: MONTHS_SHORT_RO[d.getMonth()],
      p1: Math.round(mP1 * 100) / 100,
      p2: Math.round(mP2 * 100) / 100,
      total: Math.round((mP1 + mP2) * 100) / 100
    });
  }

  // Generare Insights Automate în limba română
  const insights = buildInsights({
    store,
    baseCur,
    expenses,
    total,
    prevTotal,
    diffPrev,
    diffPrevPct,
    monthlyBudget,
    budgetPct,
    projectedTotal,
    isCurrentMonth,
    byCategory,
    byCurrency,
    weekdayTotals,
    p1Shared,
    p2Shared
  });

  return {
    baseCur,
    expenses,
    count: expenses.length,
    total,
    prevTotal,
    diffPrev,
    diffPrevPct,
    dailyAvg,
    projectedTotal,
    isCurrentMonth,
    monthlyBudget,
    budgetPct,
    remainingBudget,
    p1Total,
    p2Total,
    p1Shared,
    p2Shared,
    byCategory,
    byCurrency,
    dailyTotals,
    weekdayTotals,
    trend6Months,
    insights
  };
}

function buildInsights(ctx) {
  const {
    store, baseCur, expenses, total, prevTotal, diffPrev, diffPrevPct,
    monthlyBudget, budgetPct, projectedTotal, isCurrentMonth,
    byCategory, byCurrency, weekdayTotals, p1Shared, p2Shared
  } = ctx;

  const list = [];

  if (!expenses.length) {
    list.push({
      type: "info",
      icon: "✨",
      title: "Nicio cheltuială înregistrată încă",
      text: "Apasă butonul + de jos pentru a adăuga prima cumpărătură din această lună."
    });
    return list;
  }

  // 1. Comparație față de luna precedentă
  if (prevTotal > 0 && diffPrevPct !== null) {
    if (diffPrevPct > 10) {
      list.push({
        type: "warning",
        icon: "📈",
        title: `Cheltuieli cu ${diffPrevPct}% mai mari față de luna trecută`,
        text: `Ați cheltuit cu ${formatMoney(diffPrev, baseCur)} mai mult comparativ cu luna anterioară (${formatMoney(prevTotal, baseCur)}).`
      });
    } else if (diffPrevPct < -5) {
      list.push({
        type: "positive",
        icon: "🎉",
        title: `Economie de ${Math.abs(diffPrevPct)}% față de luna trecută`,
        text: `Bravo! Sunteți cu ${formatMoney(Math.abs(diffPrev), baseCur)} sub nivelul lunii anterioare.`
      });
    } else {
      list.push({
        type: "info",
        icon: "⚖️",
        title: "Ritm stabil față de luna trecută",
        text: `Diferența este de doar ${diffPrevPct >= 0 ? "+" : ""}${diffPrevPct}% (${formatMoney(Math.abs(diffPrev), baseCur)}).`
      });
    }
  }

  // 2. Proiecție sfârșit de lună vs buget
  if (isCurrentMonth && monthlyBudget > 0) {
    if (budgetPct >= 100) {
      list.push({
        type: "danger",
        icon: "🚨",
        title: "Bugetul lunar a fost depășit",
        text: `Ați atins ${Math.round(budgetPct)}% din bugetul de ${formatMoney(monthlyBudget, baseCur)} (+${formatMoney(total - monthlyBudget, baseCur)}).`
      });
    } else if (projectedTotal > monthlyBudget * 1.05) {
      list.push({
        type: "warning",
        icon: "⏱️",
        title: `Proiecție peste buget: ~${formatMoney(projectedTotal, baseCur)}`,
        text: `La ritmul actual, veți depăși bugetul lunar cu aproximativ ${formatMoney(projectedTotal - monthlyBudget, baseCur)}.`
      });
    } else {
      list.push({
        type: "positive",
        icon: "✅",
        title: "Încadrare bună în buget",
        text: `La ritmul actual, estimați să încheiați luna la ~${formatMoney(projectedTotal, baseCur)} (sub ținta de ${formatMoney(monthlyBudget, baseCur)}).`
      });
    }
  }

  // 3. Categoria principală & alerte pe categorii
  if (byCategory.length > 0) {
    const top = byCategory[0];
    list.push({
      type: "info",
      icon: top.icon,
      title: `Top categorie: ${top.name} (${Math.round(top.pct)}%)`,
      text: `${formatMoney(top.total, baseCur)} din ${top.count} ${top.count === 1 ? "tranzacție" : "tranzacții"}.`
    });
  }

  const overCats = byCategory.filter((c) => c.budget > 0 && c.total > c.budget);
  if (overCats.length > 0) {
    const names = overCats.slice(0, 2).map((c) => `${c.icon} ${c.name} (${Math.round(c.budgetPct)}%)`).join(", ");
    list.push({
      type: "warning",
      icon: "⚠️",
      title: `${overCats.length} ${overCats.length === 1 ? "categorie a depășit" : "categorii au depășit"} limita`,
      text: `Verifică: ${names}.`
    });
  }

  // 4. Decont 50/50 pe cheltuielile comune
  if (p1Shared > 0 || p2Shared > 0) {
    const diff = Math.abs(p1Shared - p2Shared) / 2;
    if (diff >= 10) {
      const p1Name = store.state.settings.partner1Name;
      const p2Name = store.state.settings.partner2Name;
      const payer = p1Shared < p2Shared ? p1Name : p2Name;
      const receiver = p1Shared < p2Shared ? p2Name : p1Name;
      list.push({
        type: "info",
        icon: "🤝",
        title: "Echilibru cheltuieli comune (50/50)",
        text: `${p1Name}: ${formatMoney(p1Shared, baseCur)} vs ${p2Name}: ${formatMoney(p2Shared, baseCur)}. Pentru împărțire egală, ${payer} ar avea de compensat ${formatMoney(diff, baseCur)} către ${receiver}.`
      });
    }
  }

  // 5. Ziua săptămânii cu cele mai mari cheltuieli
  const topDay = [...weekdayTotals].sort((a, b) => b.total - a.total)[0];
  if (topDay && topDay.total > 0) {
    list.push({
      type: "info",
      icon: "📅",
      title: `Ziua de vârf: ${topDay.name}`,
      text: `Ați cheltuit ${formatMoney(topDay.total, baseCur)} în zilele de ${topDay.name} (${topDay.count} cumpărături).`
    });
  }

  // 6. Cea mai mare cheltuială individuală
  const biggest = [...expenses].sort((a, b) => (b.baseAmount || 0) - (a.baseAmount || 0))[0];
  if (biggest) {
    const origStr = biggest.currency !== baseCur ? ` (${formatMoney(biggest.amount, biggest.currency)})` : "";
    list.push({
      type: "info",
      icon: "🏷️",
      title: `Cea mai mare cheltuială: ${biggest.title}`,
      text: `${formatMoney(biggest.baseAmount, baseCur)}${origStr} pe data de ${biggest.date}.`
    });
  }

  // 7. Valute străine folosite
  const foreign = byCurrency.filter((c) => c.code !== baseCur);
  if (foreign.length > 0) {
    const summary = foreign.map((c) => `${formatMoney(c.originalTotal, c.code)}`).join(", ");
    list.push({
      type: "info",
      icon: "💱",
      title: "Cheltuieli în alte valute",
      text: `Pe lângă ${baseCur}, aveți tranzacții în: ${summary}.`
    });
  }

  return list;
}
