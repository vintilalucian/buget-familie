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
  "Altele"
];

export const DEFAULT_SETTINGS = {
  partner1Name: "Eu",
  partner1Tab: "Cheltuieli_Eu",
  partner2Name: "Soția",
  partner2Tab: "Cheltuieli_Sotie",
  baseCurrency: "RON",
  monthlyBudget: 6500
};

export const DEFAULT_CATEGORIES = [
  { id: "alimente", name: "Alimente & Supermarket", icon: "🛒", color: "#10b981", budget: 2000, group: "Esentiale" },
  { id: "locuinta", name: "Chirie / Rată Casă", icon: "🏠", color: "#3b82f6", budget: 2500, group: "Esentiale" },
  { id: "utilitati", name: "Utilități (Curent, Gaz, Net)", icon: "💡", color: "#f59e0b", budget: 700, group: "Esentiale" },
  { id: "transport", name: "Transport & Combustibil", icon: "🚗", color: "#6366f1", budget: 600, group: "Esentiale" },
  { id: "restaurante", name: "Restaurante & Cafenele", icon: "🍽️", color: "#ec4899", budget: 500, group: "Stil de viata" },
  { id: "sanatate", name: "Sănătate & Farmacie", icon: "💊", color: "#ef4444", budget: 400, group: "Esentiale" },
  { id: "haine", name: "Îmbrăcăminte & Încălțăminte", icon: "👕", color: "#8b5cf6", budget: 400, group: "Stil de viata" },
  { id: "casa", name: "Casă, Mobilier & Grădină", icon: "🏡", color: "#14b8a6", budget: 350, group: "Esentiale" },
  { id: "electronice", name: "Electronice & Abonamente", icon: "📱", color: "#0ea5e9", budget: 300, group: "Stil de viata" },
  { id: "divertisment", name: "Divertisment & Timp Liber", icon: "🎬", color: "#f97316", budget: 300, group: "Stil de viata" },
  { id: "vacante", name: "Vacanțe & Călătorii", icon: "✈️", color: "#06b6d4", budget: 800, group: "Stil de viata" },
  { id: "cadouri", name: "Cadouri & Evenimente", icon: "🎁", color: "#d946ef", budget: 300, group: "Stil de viata" },
  { id: "copii", name: "Copii & Familie", icon: "👶", color: "#84cc16", budget: 500, group: "Esentiale" },
  { id: "animale", name: "Animale de Companie", icon: "🐾", color: "#a855f7", budget: 200, group: "Esentiale" },
  { id: "educatie", name: "Educație & Cărți", icon: "📚", color: "#2563eb", budget: 250, group: "Dezvoltare" },
  { id: "ingrijire", name: "Îngrijire Personală & Sport", icon: "💅", color: "#f43f5e", budget: 300, group: "Stil de viata" },
  { id: "auto", name: "Întreținere Auto & Asigurări", icon: "🔧", color: "#64748b", budget: 400, group: "Esentiale" },
  { id: "taxe", name: "Taxe, Impozite & Comisioane", icon: "📄", color: "#78716c", budget: 200, group: "Esentiale" },
  { id: "economii", name: "Economii & Investiții", icon: "💰", color: "#059669", budget: 1000, group: "Economii" },
  { id: "altele", name: "Altele", icon: "📦", color: "#94a3b8", budget: 200, group: "Altele" }
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
    // Luna curentă
    {
      id: "demo_1", date: fmtOffsetDate(0, d(0)), title: "Cumpărături Lidl săptămânale",
      amount: 342.5, currency: "RON", baseAmount: 342.5, category: "alimente",
      paymentMethod: "Card", isPrivate: false, notes: "Fructe, legume, lactate", owner: "p1"
    },
    {
      id: "demo_2", date: fmtOffsetDate(0, d(1)), title: "Farmacia Tei — vitamine & creme",
      amount: 185, currency: "RON", baseAmount: 185, category: "sanatate",
      paymentMethod: "Card", isPrivate: false, notes: "", owner: "p2"
    },
    {
      id: "demo_3", date: fmtOffsetDate(0, d(2)), title: "Rată apartament",
      amount: 450, currency: "EUR", baseAmount: 2241, category: "locuinta",
      paymentMethod: "Transfer", isPrivate: false, notes: "Transfer automat lunar", owner: "p1"
    },
    {
      id: "demo_4", date: fmtOffsetDate(0, d(3)), title: "Plin benzină OMV",
      amount: 310, currency: "RON", baseAmount: 310, category: "transport",
      paymentMethod: "Card", isPrivate: false, notes: "", owner: "p1"
    },
    {
      id: "demo_5", date: fmtOffsetDate(0, d(4)), title: "Cină în oraș — Trattoria",
      amount: 245, currency: "RON", baseAmount: 245, category: "restaurante",
      paymentMethod: "Revolut", isPrivate: false, notes: "Aniversare", owner: "p2"
    },
    {
      id: "demo_6", date: fmtOffsetDate(0, d(5)), title: "Factură curent + internet Digi",
      amount: 289.4, currency: "RON", baseAmount: 289.4, category: "utilitati",
      paymentMethod: "Transfer", isPrivate: false, notes: "", owner: "p1"
    },
    {
      id: "demo_7", date: fmtOffsetDate(0, d(6)), title: "Cadou surpriză (Privat)",
      amount: 220, currency: "RON", baseAmount: 220, category: "cadouri",
      paymentMethod: "Revolut", isPrivate: true, notes: "Vizibil doar pentru mine", owner: "p1"
    },
    {
      id: "demo_8", date: fmtOffsetDate(0, d(7)), title: "Kaufland — aprovizionare casă",
      amount: 418.9, currency: "RON", baseAmount: 418.9, category: "alimente",
      paymentMethod: "Bonuri masă", isPrivate: false, notes: "Detergenți și alimente", owner: "p2"
    },
    {
      id: "demo_9", date: fmtOffsetDate(0, d(8)), title: "Abonament Netflix + Spotify",
      amount: 16.99, currency: "EUR", baseAmount: 84.61, category: "electronice",
      paymentMethod: "Card", isPrivate: false, notes: "", owner: "p2"
    },
    {
      id: "demo_10", date: fmtOffsetDate(0, d(9)), title: "Sală fitness & îngrijire",
      amount: 210, currency: "RON", baseAmount: 210, category: "ingrijire",
      paymentMethod: "Card", isPrivate: false, notes: "", owner: "p2"
    },
    // Luna trecută
    {
      id: "demo_11", date: fmtOffsetDate(1, 5), title: "Rată apartament",
      amount: 450, currency: "EUR", baseAmount: 2241, category: "locuinta",
      paymentMethod: "Transfer", isPrivate: false, notes: "", owner: "p1"
    },
    {
      id: "demo_12", date: fmtOffsetDate(1, 10), title: "Cumpărături supermarket",
      amount: 920, currency: "RON", baseAmount: 920, category: "alimente",
      paymentMethod: "Card", isPrivate: false, notes: "", owner: "p2"
    },
    {
      id: "demo_13", date: fmtOffsetDate(1, 14), title: "Utilități lunare",
      amount: 410, currency: "RON", baseAmount: 410, category: "utilitati",
      paymentMethod: "Transfer", isPrivate: false, notes: "", owner: "p1"
    },
    {
      id: "demo_14", date: fmtOffsetDate(1, 19), title: "Haine toamnă-iarnă",
      amount: 540, currency: "RON", baseAmount: 540, category: "haine",
      paymentMethod: "Card", isPrivate: false, notes: "", owner: "p2"
    },
    {
      id: "demo_15", date: fmtOffsetDate(1, 22), title: "Combustibil & revizie",
      amount: 480, currency: "RON", baseAmount: 480, category: "transport",
      paymentMethod: "Card", isPrivate: false, notes: "", owner: "p1"
    },
    // Acum 2 luni
    {
      id: "demo_16", date: fmtOffsetDate(2, 5), title: "Rată apartament",
      amount: 450, currency: "EUR", baseAmount: 2241, category: "locuinta",
      paymentMethod: "Transfer", isPrivate: false, notes: "", owner: "p1"
    },
    {
      id: "demo_17", date: fmtOffsetDate(2, 12), title: "Alimente & piață",
      amount: 1150, currency: "RON", baseAmount: 1150, category: "alimente",
      paymentMethod: "Card", isPrivate: false, notes: "", owner: "p2"
    },
    {
      id: "demo_18", date: fmtOffsetDate(2, 18), title: "Weekend la munte",
      amount: 180, currency: "EUR", baseAmount: 896.4, category: "vacante",
      paymentMethod: "Revolut", isPrivate: false, notes: "Cazare Sinaia", owner: "p1"
    }
  ];
}
