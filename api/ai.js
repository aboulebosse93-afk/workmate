// api/ai.js — Proxy sécurisé pour Google Gemini
// La clé API reste côté serveur dans Vercel : process.env.GEMINI_API_KEY

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Méthode non autorisée" });
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        error: "Clé GEMINI_API_KEY manquante dans Vercel."
      });
    }

    const messages = req.body?.messages || [];

    const systemMessage = messages.find((m) => m.role === "system")?.content || "";
    const userMessages = messages
      .filter((m) => m.role !== "system")
      .map((m) => m.content)
      .join("\n\n");

    const finalPrompt = `
${systemMessage}

Demande utilisateur :
${userMessages}
`.trim();

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: finalPrompt
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1200
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error:
          data?.error?.message ||
          "Erreur API Gemini."
      });
    }

    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Aucune réponse générée par Gemini.";

    // On garde le même format que OpenRouter/OpenAI
    // pour éviter de modifier app.js maintenant.
    return res.status(200).json({
      choices: [
        {
          message: {
            content: text
          }
        }
      ],
      raw: data
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message || "Erreur serveur."
    });
  }
}
