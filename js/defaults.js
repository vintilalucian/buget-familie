export const MONTHS_RO = [
  "Ianuarie", "Februarie", "Martie", "Aprilie", "Mai", "Iunie",
  "Iulie", "August", "Septembrie", "Octombrie", "Noiembrie", "Decembrie"
];

export const MONTHS_SHORT_RO = [
  "Ian", "Feb", "Mar", "Apr", "Mai", "Iun",
  "Iul", "Aug", "Sep", "Oct", "Noi", "Dec"
];

export const DAYS_RO = [
  "Duminică", "Luni", "Marți", "Miercuri", "Joi", "Vineri", "Sâmbătă"
];

export const PAYMENT_METHODS = [
  "Card",
  "Cash",
  "Transfer",
  "Revolut",
  "Bonuri masă"
];

export const CATEGORY_GROUPS = [
  "Esentiale",
  "Stil de viata",
  "Dezvoltare",
  "Economii",
  "Venituri",
  "Altele"
];

export const TX_TYPES = {
  cheltuiala: { id: "cheltuiala", label: "Cheltuială", icon: "💸", defaultDir: "out" },
  venit: { id: "venit", label: "Venit", icon: "💵", defaultDir: "in" },
  transfer: { id: "transfer", label: "Transfer între conturi", icon: "🔁", defaultDir: "out" },
  transfer_fara_pereche: { id: "transfer_fara_pereche", label: "Transfer fără pereche", icon: "↗️", defaultDir: "out" },
  investitie: { id: "investitie", label: "Investiție", icon: "📈", defaultDir: "out" },
  ajustare: { id: "ajustare", label: "Ajustare sold", icon: "🛠️", defaultDir: "in" },
  rambursare_comerciant: { id: "rambursare_comerciant", label: "Rambursare comerciant", icon: "↩️", defaultDir: "in" },
  rambursare_imprumut: { id: "rambursare_imprumut", label: "Rambursare împrumut", icon: "🏦", defaultDir: "in" },
  decontare_terti: { id: "decontare_terti", label: "Decontare de la terți", icon: "🤝", defaultDir: "in" },
  rata_credit: { id: "rata_credit", label: "Rată credit", icon: "🏛️", defaultDir: "out" }
};

export const ACCOUNT_TYPES = [
  { id: "banca", label: "Cont bancar" },
  { id: "cash", label: "Numerar (Cash)" },
  { id: "card_credit", label: "Card de credit" },
  { id: "economii", label: "Cont economii" },
  { id: "datorie", label: "Credit / Datorie" },
  { id: "investitii", label: "Cont investiții" }
];

export const INITIAL_BALANCE_TYPES = [
  { id: "verificat", label: "Verificat" },
  { id: "implicit_0", label: "Implicit 0 (la prima înregistrare)" },
  { id: "ajustare_propusa", label: "Ajustare propusă" }
];

export const DEFAULT_SETTINGS = {
  partner1Name: "Eu",
  partner1Tab: "Cheltuieli_Eu",
  partner2Name: "Soția",
  partner2Tab: "Cheltuieli_Sotie",
  baseCurrency: "RON",
  monthlyBudget: 6500
};

export const DEFAULT_ACCOUNTS = [
  { id: "acc_banca_ron", name: "Cont Principal RON", type: "banca", currency: "RON", initialBalance: 8500, initialBalanceType: "verificat", owner: "p1", archived: false },
  { id: "acc_banca_eur", name: "Cont Economii EUR", type: "economii", currency: "EUR", initialBalance: 2400, initialBalanceType: "verificat", owner: "comun", archived: false },
  { id: "acc_sotie_ron", name: "Cont Partener RON", type: "banca", currency: "RON", initialBalance: 6200, initialBalanceType: "verificat", owner: "p2", archived: false },
  { id: "acc_cash_ron", name: "Portofel Cash", type: "cash", currency: "RON", initialBalance: 600, initialBalanceType: "verificat", owner: "comun", archived: false },
  { id: "acc_credit_casa", name: "Credit Ipotecar", type: "datorie", currency: "EUR", initialBalance: -45000, initialBalanceType: "verificat", owner: "comun", archived: false }
];

export const DEFAULT_CATEGORIES = [
  // Categorii cheltuieli (20)
  { id: "alimente", name: "Alimente & Supermarket", icon: "🛒", color: "#10b981", budget: 2000, group: "Esentiale", kind: "cheltuiala" },
  { id: "locuinta", name: "Chirie / Rată Casă", icon: "🏠", color: "#3b82f6", budget: 2500, group: "Esentiale", kind: "cheltuiala" },
  { id: "utilitati", name: "Utilități (Curent, Gaz, Net)", icon: "💡", color: "#f59e0b", budget: 700, group: "Esentiale", kind: "cheltuiala" },
  { id: "transport", name: "Transport & Combustibil", icon: "🚗", color: "#6366f1", budget: 600, group: "Esentiale", kind: "cheltuiala" },
  { id: "restaurante", name: "Restaurante & Cafenele", icon: "🍽️", color: "#ec4899", budget: 500, group: "Stil de viata", kind: "cheltuiala" },
  { id: "sanatate", name: "Sănătate & Farmacie", icon: "💊", color: "#ef4444", budget: 400, group: "Esentiale", kind: "cheltuiala" },
  { id: "haine", name: "Îmbrăcăminte & Încălțăminte", icon: "👕", color: "#8b5cf6", budget: 400, group: "Stil de viata", kind: "cheltuiala" },
  { id: "casa", name: "Casă, Mobilier & Grădină", icon: "🏡", color: "#14b8a6", budget: 350, group: "Esentiale", kind: "cheltuiala" },
  { id: "electronice", name: "Electronice & Abonamente", icon: "📱", color: "#0ea5e9", budget: 300, group: "Stil de viata", kind: "cheltuiala" },
  { id: "divertisment", name: "Divertisment & Timp Liber", icon: "🎬", color: "#f97316", budget: 300, group: "Stil de viata", kind: "cheltuiala" },
  { id: "vacante", name: "Vacanțe & Călătorii", icon: "✈️", color: "#06b6d4", budget: 800, group: "Stil de viata", kind: "cheltuiala" },
  { id: "cadouri", name: "Cadouri & Evenimente", icon: "🎁", color: "#d946ef", budget: 300, group: "Stil de viata", kind: "cheltuiala" },
  { id: "copii", name: "Copii & Familie", icon: "👶", color: "#84cc16", budget: 500, group: "Esentiale", kind: "cheltuiala" },
  { id: "animale", name: "Animale de Companie", icon: "🐾", color: "#a855f7", budget: 200, group: "Esentiale", kind: "cheltuiala" },
  { id: "educatie", name: "Educație & Cărți", icon: "📚", color: "#2563eb", budget: 250, group: "Dezvoltare", kind: "cheltuiala" },
  { id: "ingrijire", name: "Îngrijire Personală & Sport", icon: "💅", color: "#f43f5e", budget: 300, group: "Stil de viata", kind: "cheltuiala" },
  { id: "auto", name: "Întreținere Auto & Asigurări", icon: "🔧", color: "#64748b", budget: 400, group: "Esentiale", kind: "cheltuiala" },
  { id: "taxe", name: "Taxe, Impozite & Comisioane", icon: "📄", color: "#78716c", budget: 200, group: "Esentiale", kind: "cheltuiala" },
  { id: "economii", name: "Economii & Investiții", icon: "💰", color: "#059669", budget: 1000, group: "Economii", kind: "cheltuiala" },
  { id: "altele", name: "Altele", icon: "📦", color: "#94a3b8", budget: 200, group: "Altele", kind: "ambele" },
  // Categorii venituri (5)
  { id: "venit_salariu", name: "Salariu", icon: "💼", color: "#10b981", budget: 0, group: "Venituri", kind: "venit" },
  { id: "venit_bonus", name: "Bonus / Prime", icon: "🏆", color: "#059669", budget: 0, group: "Venituri", kind: "venit" },
  { id: "venit_freelance", name: "Freelance / Proiecte", icon: "💻", color: "#0ea5e9", budget: 0, group: "Venituri", kind: "venit" },
  { id: "venit_chirii", name: "Chirii / Dividende", icon: "🏢", color: "#6366f1", budget: 0, group: "Venituri", kind: "venit" },
  { id: "venit_altele", name: "Alte Venituri", icon: "✨", color: "#14b8a6", budget: 0, group: "Venituri", kind: "venit" }
];

export const DEFAULT_CURRENCIES = [
  { code: "RON", name: "Leu românesc", symbol: "lei", rate: 1.0 },
  { code: "EUR", name: "Euro", symbol: "€", rate: 4.98 },
  { code: "USD", name: "Dolar american", symbol: "$", rate: 4.65 },
  { code: "GBP", name: "Liră sterlină", symbol: "£", rate: 5.85 },
  { code: "CHF", name: "Franc elvețian", symbol: "CHF", rate: 5.25 },
  { code: "HUF", name: "Forint maghiar", symbol: "Ft", rate: 0.0125 },
  { code: "MDL", name: "Leu moldovenesc", symbol: "L", rate: 0.26 }
];

function fmtOffsetDate(monthsAgo, day) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - monthsAgo, Math.min(day, 28));
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function createDemoExpenses() {
  const todayDay = Math.min(new Date().getDate(), 28);
  const d = (offset) => Math.max(1, todayDay - offset);

  return [
    {
      id: "demo_inc_1", date: fmtOffsetDate(0, 1), type: "venit", direction: "in",
      title: "Salariu lunar", amount: 7200, currency: "RON", exchangeRate: 1, rateSource: "curs_curent",
      baseAmount: 7200, baseCurrency: "RON", accountId: "acc_banca_ron", category: "venit_salariu",
      paymentMethod: "Transfer", isPrivate: false, notes: "Demo", owner: "p1"
    },
    {
      id: "demo_inc_2", date: fmtOffsetDate(0, 2), type: "venit", direction: "in",
      title: "Salariu partener", amount: 5800, currency: "RON", exchangeRate: 1, rateSource: "curs_curent",
      baseAmount: 5800, baseCurrency: "RON", accountId: "acc_sotie_ron", category: "venit_salariu",
      paymentMethod: "Transfer", isPrivate: false, notes: "Demo", owner: "p2"
    },
    {
      id: "demo_1", date: fmtOffsetDate(0, d(0)), type: "cheltuiala", direction: "out",
      title: "Cumpărături Lidl săptămânale", amount: 342.5, currency: "RON", exchangeRate: 1, rateSource: "curs_curent",
      baseAmount: 342.5, baseCurrency: "RON", accountId: "acc_banca_ron", category: "alimente",
      paymentMethod: "Card", isPrivate: false, notes: "Fructe, legume, lactate", owner: "p1"
    },
    {
      id: "demo_2", date: fmtOffsetDate(0, d(1)), type: "cheltuiala", direction: "out",
      title: "Farmacia Tei — vitamine & creme", amount: 185, currency: "RON", exchangeRate: 1, rateSource: "curs_curent",
      baseAmount: 185, baseCurrency: "RON", accountId: "acc_sotie_ron", category: "sanatate",
      paymentMethod: "Card", isPrivate: false, notes: "", owner: "p2"
    },
    {
      id: "demo_3", date: fmtOffsetDate(0, d(2)), type: "rata_credit", direction: "out",
      title: "Rată credit ipotecar", amount: 450, currency: "EUR", exchangeRate: 4.98, rateSource: "manual",
      baseAmount: 2241, baseCurrency: "RON", accountId: "acc_banca_eur", debtAccountId: "acc_credit_casa",
      principalAmount: 310, interestAmount: 140, splitStatus: "defalcat",
      category: "locuinta", paymentMethod: "Transfer", isPrivate: false, notes: "310 EUR principal + 140 EUR dobândă", owner: "p1"
    },
    {
      id: "demo_tr_out", date: fmtOffsetDate(0, d(3)), type: "transfer", direction: "out",
      transferGroupId: "tr_demo_1", title: "Transfer economii EUR",
      amount: 1494, currency: "RON", exchangeRate: 1, rateSource: "manual",
      baseAmount: 1494, baseCurrency: "RON", accountId: "acc_banca_ron", category: "economii",
      paymentMethod: "Transfer", isPrivate: false, notes: "Schimb valutar în cont EUR", owner: "p1"
    },
    {
      id: "demo_tr_in", date: fmtOffsetDate(0, d(3)), type: "transfer", direction: "in",
      transferGroupId: "tr_demo_1", title: "Transfer economii EUR",
      amount: 300, currency: "EUR", exchangeRate: 4.98, rateSource: "manual",
      baseAmount: 1494, baseCurrency: "RON", accountId: "acc_banca_eur", category: "economii",
      paymentMethod: "Transfer", isPrivate: false, notes: "Schimb valutar din cont RON", owner: "p1"
    },
    {
      id: "demo_4", date: fmtOffsetDate(0, d(3)), type: "cheltuiala", direction: "out",
      title: "Plin benzină OMV", amount: 310, currency: "RON", exchangeRate: 1, rateSource: "curs_curent",
      baseAmount: 310, baseCurrency: "RON", accountId: "acc_banca_ron", category: "transport",
      paymentMethod: "Card", isPrivate: false, notes: "", owner: "p1"
    },
    {
      id: "demo_5", date: fmtOffsetDate(0, d(4)), type: "cheltuiala", direction: "out",
      title: "Cină în oraș — Trattoria", amount: 245, currency: "RON", exchangeRate: 1, rateSource: "curs_curent",
      baseAmount: 245, baseCurrency: "RON", accountId: "acc_sotie_ron", category: "restaurante",
      paymentMethod: "Revolut", isPrivate: false, notes: "Aniversare", owner: "p2"
    },
    {
      id: "demo_6", date: fmtOffsetDate(0, d(5)), type: "cheltuiala", direction: "out",
      title: "Factură curent + internet Digi", amount: 289.4, currency: "RON", exchangeRate: 1, rateSource: "curs_curent",
      baseAmount: 289.4, baseCurrency: "RON", accountId: "acc_banca_ron", category: "utilitati",
      paymentMethod: "Transfer", isPrivate: false, notes: "", owner: "p1"
    },
    {
      id: "demo_7", date: fmtOffsetDate(0, d(6)), type: "cheltuiala", direction: "out",
      title: "Cadou surpriză (Privat)", amount: 220, currency: "RON", exchangeRate: 1, rateSource: "curs_curent",
      baseAmount: 220, baseCurrency: "RON", accountId: "acc_banca_ron", category: "cadouri",
      paymentMethod: "Revolut", isPrivate: true, notes: "Vizibil doar pentru mine", owner: "p1"
    },
    {
      id: "demo_refund", date: fmtOffsetDate(0, d(6)), type: "rambursare_comerciant", direction: "in",
      linkedTxId: "demo_8", title: "Retur produs Kaufland", amount: 45, currency: "RON", exchangeRate: 1, rateSource: "curs_curent",
      baseAmount: 45, baseCurrency: "RON", accountId: "acc_sotie_ron", category: "alimente",
      paymentMethod: "Card", isPrivate: false, notes: "Scade cheltuiala netă", owner: "p2"
    },
    {
      id: "demo_8", date: fmtOffsetDate(0, d(7)), type: "cheltuiala", direction: "out",
      title: "Kaufland — aprovizionare casă", amount: 418.9, currency: "RON", exchangeRate: 1, rateSource: "curs_curent",
      baseAmount: 418.9, baseCurrency: "RON", accountId: "acc_sotie_ron", category: "alimente",
      paymentMethod: "Bonuri masă", isPrivate: false, notes: "Detergenți și alimente", owner: "p2"
    },
    {
      id: "demo_9", date: fmtOffsetDate(0, d(8)), type: "cheltuiala", direction: "out",
      title: "Abonament Netflix + Spotify", amount: 16.99, currency: "EUR", exchangeRate: 4.98, rateSource: "curs_curent",
      baseAmount: 84.61, baseCurrency: "RON", accountId: "acc_sotie_ron", category: "electronice",
      paymentMethod: "Card", isPrivate: false, notes: "", owner: "p2"
    },
    {
      id: "demo_11", date: fmtOffsetDate(1, 10), type: "cheltuiala", direction: "out",
      title: "Cumpărături supermarket", amount: 920, currency: "RON", exchangeRate: 1, rateSource: "curs_curent",
      baseAmount: 920, baseCurrency: "RON", accountId: "acc_sotie_ron", category: "alimente",
      paymentMethod: "Card", isPrivate: false, notes: "", owner: "p2"
    },
    {
      id: "demo_12", date: fmtOffsetDate(1, 14), type: "cheltuiala", direction: "out",
      title: "Utilități lunare", amount: 410, currency: "RON", exchangeRate: 1, rateSource: "curs_curent",
      baseAmount: 410, baseCurrency: "RON", accountId: "acc_banca_ron", category: "utilitati",
      paymentMethod: "Transfer", isPrivate: false, notes: "", owner: "p1"
    }
  ];
}
