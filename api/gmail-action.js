// api/gmail-action.js — Actions Gmail avancées
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const accessToken = String(req.body?.accessToken || "").trim();
  const action = String(req.body?.action || "").trim();

  if (!accessToken) return res.status(400).json({ error: "Access token Gmail manquant." });

  async function gmailFetch(url, options = {}) {
    const r = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });

    const text = await r.text();
    const data = text ? JSON.parse(text) : {};

    if (!r.ok) {
      throw new Error(data?.error?.message || `Erreur Gmail ${r.status}`);
    }

    return data;
  }

  try {
    if (action === "createDraft") {
      const to = String(req.body?.to || "").trim();
      const subject = String(req.body?.subject || "Réponse").trim();
      const body = String(req.body?.body || "").trim();

      if (!to || !body) {
        return res.status(400).json({ error: "Destinataire ou message manquant." });
      }

      const rawEmail = [
        `To: ${to}`,
        `Subject: ${subject}`,
        "Content-Type: text/plain; charset=utf-8",
        "",
        body
      ].join("\r\n");

      const encoded = Buffer.from(rawEmail)
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");

      const data = await gmailFetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
        method: "POST",
        body: JSON.stringify({ message: { raw: encoded } })
      });

      return res.status(200).json({ ok: true, draft: data });
    }

    if (action === "modify") {
      const ids = Array.isArray(req.body?.ids) ? req.body.ids.slice(0, 50) : [];
      const addLabelIds = Array.isArray(req.body?.addLabelIds) ? req.body.addLabelIds : [];
      const removeLabelIds = Array.isArray(req.body?.removeLabelIds) ? req.body.removeLabelIds : [];

      const results = [];
      for (const id of ids) {
        const data = await gmailFetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}/modify`, {
          method: "POST",
          body: JSON.stringify({ addLabelIds, removeLabelIds })
        });
        results.push(data);
      }

      return res.status(200).json({ ok: true, count: results.length });
    }

    return res.status(400).json({ error: "Action inconnue." });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Erreur action Gmail" });
  }
}
