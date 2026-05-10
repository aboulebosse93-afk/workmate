// api/gmail.js — Lecture des emails Gmail via Google API

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { accessToken, maxEmails = 20 } = req.body;
  if (!accessToken) return res.status(401).json({ error: "Token manquant" });

  try {
    const listRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxEmails}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const listData = await listRes.json();
    if (!listData.messages) return res.status(200).json({ emails: [] });

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

    return res.status(200).json({ emails });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
