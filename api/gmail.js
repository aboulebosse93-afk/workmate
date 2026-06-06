// ============================================================
// /api/gmail.js — Proxy sécurisé Gmail pour WorkMate AI
// Lit les emails Gmail avec un access token OAuth côté serveur.
// Utilisé par app.js avec fetch('/api/gmail')
// ============================================================

function jsonError(res, status, message) {
  return res.status(status).json({ error: message });
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function getHeader(headers = [], name) {
  const found = headers.find((h) => h.name?.toLowerCase() === name.toLowerCase());
  return found?.value || "";
}

function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .replace(/\u0000/g, "")
    .trim();
}

async function gmailFetch(url, accessToken) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json"
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      data?.error?.message ||
      data?.error_description ||
      `Erreur Gmail HTTP ${response.status}`;

    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return data;
}

async function readMessage(messageId, accessToken) {
  const params = new URLSearchParams({
    format: "metadata",
    metadataHeaders: "From"
  });

  // URLSearchParams garde une seule clé si on utilise set, donc on ajoute les headers séparément.
  const url =
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}` +
    `?format=metadata` +
    `&metadataHeaders=From` +
    `&metadataHeaders=To` +
    `&metadataHeaders=Subject` +
    `&metadataHeaders=Date`;

  const msg = await gmailFetch(url, accessToken);
  const headers = msg?.payload?.headers || [];

  return {
    id: msg.id,
    threadId: msg.threadId,
    from: cleanText(getHeader(headers, "From")) || "Expéditeur inconnu",
    to: cleanText(getHeader(headers, "To")),
    subject: cleanText(getHeader(headers, "Subject")) || "Sans objet",
    date: cleanText(getHeader(headers, "Date")),
    snippet: cleanText(msg.snippet || ""),
    labels: msg.labelIds || []
  };
}

async function readMessagesInBatches(messageIds, accessToken, batchSize = 10) {
  const emails = [];

  for (let i = 0; i < messageIds.length; i += batchSize) {
    const batch = messageIds.slice(i, i + batchSize);
    const result = await Promise.allSettled(batch.map((id) => readMessage(id, accessToken)));

    for (const item of result) {
      if (item.status === "fulfilled") {
        emails.push(item.value);
      }
    }
  }

  return emails;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return jsonError(res, 405, "Méthode non autorisée. Utilise POST.");
  }

  try {
    const accessToken = String(req.body?.accessToken || "").trim();

    if (!accessToken) {
      return jsonError(res, 400, "Access token Gmail manquant.");
    }

    // Gmail supporte jusqu'à 500 par requête, mais on limite à 100 pour éviter
    // que Vercel dépasse le temps d'exécution avec trop d'appels individuels.
    const maxEmails = clampNumber(req.body?.maxEmails, 1, 100, 50);

    // Recherche volontairement large : derniers emails de la boîte de réception.
    // Tu peux envoyer query depuis app.js plus tard si tu veux filtrer côté Gmail.
    const query = cleanText(req.body?.query || "in:inbox newer_than:30d");

    const listUrl =
      "https://gmail.googleapis.com/gmail/v1/users/me/messages?" +
      new URLSearchParams({
        maxResults: String(maxEmails),
        q: query
      }).toString();

    const listData = await gmailFetch(listUrl, accessToken);
    const messages = Array.isArray(listData.messages) ? listData.messages : [];

    if (!messages.length) {
      return res.status(200).json({
        count: 0,
        emails: []
      });
    }

    const ids = messages.map((m) => m.id).filter(Boolean);
    const emails = await readMessagesInBatches(ids, accessToken, 10);

    return res.status(200).json({
      count: emails.length,
      emails
    });
  } catch (error) {
    const status = error.status || 500;

    if (status === 401 || status === 403) {
      return jsonError(res, status, "Session Gmail expirée ou autorisation refusée. Reconnecte ton compte Google.");
    }

    return jsonError(res, status, error.message || "Erreur serveur Gmail.");
  }
}
