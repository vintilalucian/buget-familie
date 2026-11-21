# Ghid de Migrare TimelyBills → Google Sheets (`BugetFamilie`)

Acest document conține structura exactă a fișierului Google Sheets folosit de aplicația **BugetFamilie**, regulile de completare manuală a datelor exportate din **TimelyBills** și punctele pentru care așteptăm feedback.

---

## 1. Structura tab-urilor din Google Sheets

Fișierul Google Sheets (inițializat automat de scriptul `Code.gs`) conține următoarele tab-uri:

- **`Cheltuieli_Eu`** — cheltuielile Partenerului 1
- **`Cheltuieli_Sotie`** — cheltuielile Partenerului 2
- **`Categorii`** — catalogul de categorii (`ID`, `Nume`, `Icon`, `Culoare`, `Buget_Lunar`, `Grup`)
- **`Valute`** — valutele și cursurile față de moneda principală (`Cod`, `Nume`, `Simbol`, `Curs_Baza`)
- **`Setari`** — setări generale (nu șterge cheile existente)
- **`Sumar`** — calculat automat prin formule Google Sheets (nu se editează manual)

> **Reguli generale:**
> - Nu modifica ordinea coloanelor din rândul 1 (antetul).
> - Nu lăsa rânduri complet goale între tranzacții.

---

## 2. Formatul exact al coloanelor (A → L) în `Cheltuieli_Eu` și `Cheltuieli_Sotie`

| Col | Antet | Obligatoriu | Format & Reguli | Exemplu |
|---|---|---|---|---|
| **A** | `ID` | **Da** | Identificator **unic** per rând (nu se repetă). Recomandare: `tb_0001`, `tb_0002`... | `tb_0001` |
| **B** | `Data` | **Da** | Format strict `YYYY-MM-DD` (sau celulă Date formatată `YYYY-MM-DD`) | `2026-10-15` |
| **C** | `Titlu` | **Da** | Descrierea cheltuielii / magazinului (din *Title / Description / Payee* din TimelyBills) | `Cumpărături Lidl` |
| **D** | `Suma` | **Da** | Număr **pozitiv**, fără simbol valută, fără minus | `342.50` |
| **E** | `Valuta` | **Da** | Cod ISO 3 litere majuscule (trebuie să existe în tab-ul `Valute`) | `RON` / `EUR` |
| **F** | `Suma_Baza` | **Da** | Suma convertită în moneda principală (`RON`). Se poate pune valoarea calculată sau formula: `=D2*IFERROR(VLOOKUP(E2,Valute!$A$2:$D$50,4,FALSE),1)` | `342.50` |
| **G** | `Categorie` | **Da** | **ID-ul** categoriei din tab-ul `Categorii` (lista mai jos). Dacă lipsește, adaugă categoria nouă în `Categorii` | `alimente` |
| **H** | `Metoda_Plata` | Recomandat | Ex: `Card`, `Cash`, `Transfer`, `Revolut`, `Bonuri masă` (sau numele contului/cardului din TimelyBills) | `Card` |
| **I** | `Privat` | **Da** | Strict `NU` (cheltuială comună) sau `DA` (cheltuială privată, ascunsă de partener în aplicație) | `NU` |
| **J** | `Notite` | Opțional | Observații, tag-uri sau subcategorie din TimelyBills | `Fructe, legume` |
| **K** | `Creat_La` | Opțional | Timestamp ISO (ex: `2026-10-15T12:00:00Z`) sau gol | `2026-10-15T12:00:00Z` |
| **L** | `Actualizat_La` | Opțional | Timestamp ISO sau gol | `2026-10-15T12:00:00Z` |

---

## 3. Lista ID-urilor de categorii predefinite (coloana `G`)

| ID (se pune în col. G) | Nume categorie | Grup |
|---|---|---|
| `alimente` | 🛒 Alimente & Supermarket | Esentiale |
| `locuinta` | 🏠 Chirie / Rată Casă | Esentiale |
| `utilitati` | 💡 Utilități (Curent, Gaz, Net) | Esentiale |
| `transport` | 🚗 Transport & Combustibil | Esentiale |
| `restaurante` | 🍽️ Restaurante & Cafenele | Stil de viata |
| `sanatate` | 💊 Sănătate & Farmacie | Esentiale |
| `haine` | 👕 Îmbrăcăminte & Încălțăminte | Stil de viata |
| `casa` | 🏡 Casă, Mobilier & Grădină | Esentiale |
| `electronice` | 📱 Electronice & Abonamente | Stil de viata |
| `divertisment` | 🎬 Divertisment & Timp Liber | Stil de viata |
| `vacante` | ✈️ Vacanțe & Călătorii | Stil de viata |
| `cadouri` | 🎁 Cadouri & Evenimente | Stil de viata |
| `copii` | 👶 Copii & Familie | Esentiale |
| `animale` | 🐾 Animale de Companie | Esentiale |
| `educatie` | 📚 Educație & Cărți | Dezvoltare |
| `ingrijire` | 💅 Îngrijire Personală & Sport | Stil de viata |
| `auto` | 🔧 Întreținere Auto & Asigurări | Esentiale |
| `taxe` | 📄 Taxe, Impozite & Comisioane | Esentiale |
| `economii` | 💰 Economii & Investiții | Economii |
| `altele` | 📦 Altele | Altele |

### Adăugare categorii noi din TimelyBills
Dacă în TimelyBills există categorii care merită păstrate separat, adaugă un rând nou în tab-ul **`Categorii`** cu:
- `ID`: litere mici fără diacritice/spații (ex: `cafea_gustari`)
- `Nume`: denumirea afișată în aplicație (ex: `Cafea & Gustări`)
- `Icon`: un emoji (ex: `☕`)
- `Culoare`: cod hex (ex: `#b45309`)
- `Buget_Lunar`: număr (sau `0` dacă nu are limită)
- `Grup`: `Esentiale` / `Stil de viata` / `Dezvoltare` / `Economii` / `Altele`

---

## 4. Valute predefinite (tab-ul `Valute`)

`RON` (1.0), `EUR` (4.98), `USD` (4.65), `GBP` (5.85), `CHF` (5.25), `HUF` (0.0125), `MDL` (0.26).

Dacă în exportul TimelyBills apar alte valute (ex: `PLN`, `BGN`, `TRY`), adaugă un rând nou în tab-ul **`Valute`** cu coloanele `Cod`, `Nume`, `Simbol`, `Curs_Baza`.

---

## 5. Reguli la curățarea exportului TimelyBills

1. **Doar cheltuieli:** În forma actuală aplicația urmărește cheltuieli/cumpărături. Dacă exportul conține **Venituri (Income)** sau **Transferuri interne între conturi proprii**, nu le amesteca în `Cheltuieli_*` (notează-le la secțiunea de feedback).
2. **Sume pozitive:** Dacă TimelyBills exportă cheltuielile cu minus (`-120.00`), convertește-le în valori pozitive (`120.00`).
3. **Separare pe tab-uri:** Pune cheltuielile Partenerului 1 în `Cheltuieli_Eu` și ale Partenerului 2 în `Cheltuieli_Sotie`. Dacă exportul vechi nu diferențiază cine a plătit, pune-le în `Cheltuieli_Eu` și notează acest lucru.
4. **Verificare:** După completare, deschide aplicația și apasă butonul de sincronizare din colțul dreapta-sus pentru a verifica totalurile și graficele.

---

## 6. Feedback așteptat după analiza exportului TimelyBills

Te rugăm să ne transmiți ce informații sau funcționalități din TimelyBills **lipsesc** sau ar fi utile în `BugetFamilie`:

- [ ] **Venituri (Income)** & balanță netă lunară (Venituri − Cheltuieli)
- [ ] **Facturi recurente / scadențe** (*Recurring Bills* / remindere)
- [ ] **Subcategorii** sau **Tag-uri** multiple pe tranzacție
- [ ] **Conturi / Portofele multiple** cu urmărirea soldului pe fiecare cont
- [ ] **Împărțiri custom** (altele decât 50/50) sau **poze bonuri**
- [ ] **Categorii / Valute** suplimentare din TimelyBills care ar trebui predefinite
- [ ] Alte observații despre structura datelor din export
