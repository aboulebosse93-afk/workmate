// api/gmail.js — Lecture des emails Gmail via Google API
// api/gmail.js — Lecture de tous les emails Gmail via Google API

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { accessToken, maxEmails = 20 } = req.body;
  const { accessToken, maxEmails = 200 } = req.body;
  if (!accessToken) return res.status(401).json({ error: "Token manquant" });

  try {
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxEmails}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const listData = await listRes.json();
    if (!listData.messages) return res.status(200).json({ emails: [] });
    let allMessages = [];
    let pageToken = null;

    const emails = await Promise.all(
      listData.messages.slice(0, maxEmails).map(async (msg) => {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const msgData = await msgRes.json();
        const headers = msgData.payload?.headers || [];
        const from = headers.find(h => h.name === "From")?.value || "Inconnu";
        const subject = headers.find(h => h.name === "Subject")?.value || "(Sans objet)";
        const date = headers.find(h => h.name === "Date")?.value || "";
        const snippet = msgData.snippet || "";
        return { from, subject, date, snippet, id: msg.id };
      })
    );
    // Récupère tous les emails avec pagination
    do {
      const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=100${pageToken ? `&pageToken=${pageToken}` : ""}`;
      const listRes = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      const listData = await listRes.json();
      if (!listData.messages) break;
      allMessages = allMessages.concat(listData.messages);
      pageToken = listData.nextPageToken;
      if (allMessages.length >= maxEmails) break;
    } while (pageToken);

    return res.status(200).json({ emails });
    if (allMessages.length === 0) return res.status(200).json({ emails: [], total: 0 });

    // Lit les détails par batch de 10
    const emails = [];
    const limit = Math.min(allMessages.length, maxEmails);
    for (let i = 0; i < limit; i += 10) {
      const batch = allMessages.slice(i, i + 10);
      const results = await Promise.all(
        batch.map(async (msg) => {
          const msgRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          const msgData = await msgRes.json();
          const headers = msgData.payload?.headers || [];
          const from = headers.find(h => h.name === "From")?.value || "Inconnu";
          const subject = headers.find(h => h.name === "Subject")?.value || "(Sans objet)";
          const date = headers.find(h => h.name === "Date")?.value || "";
          const snippet = msgData.snippet || "";
          return { from, subject, date, snippet };
        })
      );
      emails.push(...results);
    }

    return res.status(200).json({ emails, total: allMessages.length });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
