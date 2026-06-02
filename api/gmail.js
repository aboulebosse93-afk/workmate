// ============================================================
//  /api/gmail.js  —  Lit les emails via l'API Gmail
//  Reçoit { accessToken, maxEmails } et renvoie { emails: [...] }
// ============================================================
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  try {
    const { accessToken, maxEmails = 50 } = req.body || {};
    if (!accessToken) {
      return res.status(400).json({ error: "accessToken manquant." });
    }

    const auth = { Authorization: `Bearer ${accessToken}` };
    const limit = Math.min(Number(maxEmails) || 50, 200);

    // 1) Liste des IDs de messages (boîte de réception)
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${limit}&labelIds=INBOX`,
      { headers: auth }
    );

    if (listRes.status === 401 || listRes.status === 403) {
      return res.status(listRes.status).json({ error: "Token Gmail expiré ou invalide." });
    }

    const list = await listRes.json();
    const ids = (list.messages || []).map((m) => m.id);
    if (ids.length === 0) {
      return res.status(200).json({ emails: [] });
    }

    // 2) Récupère les métadonnées de chaque message (en parallèle)
    const emails = await Promise.all(
      ids.map(async (id) => {
        try {
          const r = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
            { headers: auth }
          );
          const msg = await r.json();
          const headers = msg.payload?.headers || [];
          const get = (name) =>
            headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";
          return {
            from: get("From"),
            subject: get("Subject") || "(sans objet)",
            date: get("Date"),
            snippet: (msg.snippet || "").slice(0, 300)
          };
        } catch {
          return null;
        }
      })
    );

    return res.status(200).json({ emails: emails.filter(Boolean) });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Erreur serveur Gmail." });
  }
}
