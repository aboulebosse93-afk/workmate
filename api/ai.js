// api/ai.js — Proxy sécurisé pour OpenRouter API

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "HTTP-Referer": "https://workmate-gamma.vercel.app",
        "X-Title": "WorkMate"
      },
      body: JSON.stringify({
        model: "mistralai/mistral-7b-instruct:free",
        max_tokens: 1000,
        messages: req.body.messages
      })
    });

    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ error: data.error?.message || "Erreur API" });
    return res.status(200).json(data);

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
