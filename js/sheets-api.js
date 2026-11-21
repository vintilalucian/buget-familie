/**
 * Client Google Apps Script pentru sincronizare cu Google Sheets +
 * Utilitare de portabilitate (link de transfer / cod configurare pentru telefon nou).
 */

async function postToScript(webAppUrl, payload) {
  if (!webAppUrl) {
    throw new Error("URL-ul Google Apps Script nu este configurat.");
  }
  const url = webAppUrl.trim();
  const res = await fetch(url, {
    method: "POST",
    // text/plain evită CORS preflight OPTIONS care nu este suportat de Apps Script
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    throw new Error(`Eroare server (${res.status}). Verifică URL-ul și permisiunile Web App.`);
  }

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch (_) {
    throw new Error("Răspuns invalid de la Google Apps Script. Asigură-te că ai setat 'Cine are acces: Oricine'.");
  }

  if (!data.ok) {
    throw new Error(data.error || "Eroare necunoscută la Google Sheets.");
  }
  return data;
}

export async function pingSheet(webAppUrl, pin) {
  const cleanUrl = webAppUrl.trim();
  const sep = cleanUrl.includes("?") ? "&" : "?";
  const url = `${cleanUrl}${sep}action=ping&pin=${encodeURIComponent(pin || "")}`;
  const res = await fetch(url, { method: "GET" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "PIN invalid sau script neconfigurat.");
  return data;
}

export async function initSheet(webAppUrl, pin, settings) {
  return postToScript(webAppUrl, { action: "init", pin, settings });
}

export async function syncFromSheet(webAppUrl, pin, partner) {
  return postToScript(webAppUrl, { action: "sync", pin, partner });
}

export async function pushAddExpense(webAppUrl, pin, partner, expense) {
  return postToScript(webAppUrl, { action: "addExpense", pin, partner, expense });
}

export async function pushUpdateExpense(webAppUrl, pin, partner, expense) {
  return postToScript(webAppUrl, { action: "updateExpense", pin, partner, expense });
}

export async function pushDeleteExpense(webAppUrl, pin, partner, id) {
  return postToScript(webAppUrl, { action: "deleteExpense", pin, partner, id });
}

export async function pushBulkImport(webAppUrl, pin, partner, expenses) {
  return postToScript(webAppUrl, { action: "bulkImport", pin, partner, expenses });
}

export async function pushCategories(webAppUrl, pin, categories) {
  return postToScript(webAppUrl, { action: "saveCategories", pin, categories });
}

export async function pushCurrencies(webAppUrl, pin, currencies) {
  return postToScript(webAppUrl, { action: "saveCurrencies", pin, currencies });
}

export async function pushSettings(webAppUrl, pin, settings) {
  return postToScript(webAppUrl, { action: "saveSettings", pin, settings });
}

/**
 * Codifică datele de conectare într-un cod compact base64 UTF-8 pentru mutare ușoară pe alt telefon
 */
export function encodeSetupCode({ webAppUrl, pin, partner }) {
  const payload = JSON.stringify({ u: webAppUrl.trim(), p: pin || "", r: partner || "p1" });
  const bytes = new TextEncoder().encode(payload);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return "BF1-" + btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeSetupCode(rawCode) {
  let code = String(rawCode || "").trim();
  // Suportă și lipirea unui link complet care conține #setup=BF1-...
  if (code.includes("#setup=")) {
    code = code.split("#setup=")[1].split("&")[0];
  }
  if (!code.startsWith("BF1-")) {
    throw new Error("Cod de transfer invalid. Trebuie să înceapă cu BF1-.");
  }
  const b64 = code.slice(4).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  const json = new TextDecoder().decode(bytes);
  const parsed = JSON.parse(json);
  if (!parsed.u) throw new Error("Codul nu conține un URL valid.");
  return {
    webAppUrl: parsed.u,
    pin: parsed.p || "",
    partner: parsed.r === "p2" ? "p2" : "p1"
  };
}

export function buildTransferLink(config) {
  const code = encodeSetupCode(config);
  const base = window.location.href.split("#")[0];
  return `${base}#setup=${code}`;
}
