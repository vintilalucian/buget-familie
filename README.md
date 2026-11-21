# BugetFamilie — Aplicație PWA de Tracking Cumpărături cu Google Sheets

Aplicație web instalabilă (**PWA**) în limba română, concepută pentru a fi folosită simultan de ambii parteneri (soț + soție), având ca bază de date un fișier **Google Sheets** din Google Drive-ul tău.

## Funcționalități principale

- **Tab-uri separate în Google Sheets (`Cheltuieli_Eu` & `Cheltuieli_Sotie`)**: ambii parteneri pot adăuga cumpărături simultan fără conflicte de scriere, iar în aplicație cheltuielile se agregă automat.
- **Cheltuieli Private 🔒**: orice cheltuială marcată ca *Privată* este filtrată server-side în `Code.gs` și ascunsă de partener în aplicație.
- **20+ Categorii uzuale pre-populate** (Alimente, Chirie/Rată, Utilități, Transport, Restaurante, Sănătate, Haine, Vacanțe, Economii etc.), cu bugete lunare personalizabile și posibilitate de adăugare/editare.
- **Multi-valută**: pre-populat cu `RON`, `EUR`, `USD`, `GBP`, `CHF`, `HUF`, `MDL` + posibilitate de a adăuga orice altă valută, conversie automată la moneda de bază și calculator rapid.
- **Grafice & Insights Automate**: grafic Donut pe categorii, evoluție comparativă pe ultimele 6 luni (partener 1 vs partener 2 + linie buget), ritm zilnic, estimare sfârșit de lună, alerte buget și calcul automat de echilibru 50/50 pe cheltuielile comune.
- **Export / Import Excel (`.xlsx` & `.csv`)** și mod **Offline** cu coadă de sincronizare automată.
- **Portabilitate instantă la schimbarea telefonului**: generezi un **Link / Cod de Transfer (`BF1-...`)**, îl deschizi pe noul telefon și totul (cheltuieli, categorii, valute, setări) se încarcă automat din Google Sheets.

## Structura proiectului

```
buget-familie/
├── index.html                  # Interfața principală PWA
├── manifest.json               # Manifest instalare Android / iOS
├── sw.js                       # Service Worker (cache offline)
├── css/styles.css              # Design modern Light / Dark mode
├── icons/icon.svg              # Iconița aplicației
├── js/
│   ├── defaults.js             # 20 categorii, 7 valute, date demo
│   ├── store.js                # Stare locală + coadă offline + filtrare privacy
│   ├── sheets-api.js           # Client Google Apps Script + cod/link transfer
│   ├── insights.js             # Motor de analiză și insights automate
│   ├── charts.js               # Grafice SVG interactive (fără dependențe)
│   ├── excel.js                # Export / Import Excel (.xlsx / .csv)
│   └── app.js                  # Controler UI și modale
└── google-apps-script/
    └── Code.gs                 # Scriptul de lipit în Google Sheets → Apps Script
```

## Pornire rapidă locală (testare imediată)

```bash
python3 -m http.server 8080 --bind 127.0.0.1
```
Apoi deschide în browser: `http://127.0.0.1:8080`

## Instalare pe ambele telefoane (Android & iPhone)

1. Publică gratuit folderul `buget-familie` pe **Netlify Drop** (`https://app.netlify.com/drop` — tragi folderul în pagină) sau pe **GitHub Pages** / **Cloudflare Pages**.
2. Deschide link-ul pe telefon (Chrome pe Android / Safari pe iPhone) și alege **„Adaugă pe ecranul principal” (Add to Home Screen)**.
3. Aplicația va apărea cu iconiță proprie și va rula pe tot ecranul ca o aplicație nativă.

## Conectare la Google Sheets (3 minute)

1. Creează un **Google Sheet** nou în Google Drive și partajează-l cu soția ta (rol **Editor**).
2. Din Google Sheet, deschide **Extensii → Apps Script**.
3. Lipește codul din [`google-apps-script/Code.gs`](google-apps-script/Code.gs) și schimbă `DEFAULT_PIN` cu un PIN ales de tine.
4. Apasă **Implementare (Deploy) → Implementare nouă**:
   - Tip: **Aplicație web (Web app)**
   - Executare ca: **Eu (Me)**
   - Cine are acces: **Oricine (Anyone)**
5. Copiază URL-ul obținut, introdu-l în aplicație la **Setări → Conectare Google Sheets** împreună cu PIN-ul și apasă **Conectează & Inițializează Sheet**.
6. Din **Setări → Portabilitate**, generează **Link/Cod pentru Soția** și trimite-i-l pe WhatsApp — la deschidere telefonul ei se configurează automat pe tab-ul ei!
