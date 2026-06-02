// ============================================================
//  /api/ai.js  —  Proxy sécurisé vers Cohere
//  La clé API reste côté serveur (variable d'env Vercel : COHERE_API_KEY)
// ============================================================
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  const apiKey = process.env.COHERE_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "COHERE_API_KEY manquante côté serveur." });
  }

  try {
    const { messages } = req.body || {};
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Paramètre 'messages' invalide." });
    }

    const cohereRes = await fetch("https://api.cohere.com/v2/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "command-r-plus-08-2024",
        messages,
        temperature: 0.6,
        max_tokens: 2048
      })
    });

    const data = await cohereRes.json();

    if (!cohereRes.ok) {
      return res
        .status(cohereRes.status)
        .json({ error: data?.message || "Erreur de l'API Cohere." });
    }

    // Cohere v2 renvoie message.content = [{ type:"text", text:"..." }]
    const text = Array.isArray(data?.message?.content)
      ? data.message.content.map((c) => c.text || "").join("")
      : (data?.message?.content || "");

    // On renvoie le format attendu par le front : data.choices[0].message.content
    return res.status(200).json({
      choices: [{ message: { role: "assistant", content: text } }]
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Erreur serveur." });
  }
}
