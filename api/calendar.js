// api/calendar.js — Google Calendar pour WorkMate
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const accessToken = String(req.body?.accessToken || "").trim();
  const action = String(req.body?.action || "").trim();

  if (!accessToken) return res.status(400).json({ error: "Access token Google manquant." });

  async function calFetch(url, options = {}) {
    const r = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    });

    const data = await r.json().catch(() => ({}));

    if (!r.ok) throw new Error(data?.error?.message || `Erreur Calendar ${r.status}`);

    return data;
  }

  try {
    if (action === "list") {
      const now = new Date();
      const timeMin = now.toISOString();
      const timeMax = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const url =
        "https://www.googleapis.com/calendar/v3/calendars/primary/events" +
        `?singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&maxResults=20`;

      const data = await calFetch(url);
      return res.status(200).json({ ok: true, events: data.items || [] });
    }

    if (action === "create") {
      const title = String(req.body?.title || "").trim();
      const start = String(req.body?.start || "").trim();
      const end = String(req.body?.end || "").trim();
      const attendees = String(req.body?.attendees || "")
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean)
        .map((email) => ({ email }));

      if (!title || !start || !end) {
        return res.status(400).json({ error: "Titre, début ou fin manquant." });
      }

      const data = await calFetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
        method: "POST",
        body: JSON.stringify({
          summary: title,
          start: { dateTime: new Date(start).toISOString() },
          end: { dateTime: new Date(end).toISOString() },
          attendees
        })
      });

      return res.status(200).json({ ok: true, event: data });
    }

    return res.status(400).json({ error: "Action inconnue." });
  } catch (error) {
    return res.status(500).json({ error: error.message || "Erreur Calendar" });
  }
}
