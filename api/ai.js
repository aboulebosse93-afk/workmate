// ============================================================
// /api/ai.js — Proxy sécurisé WorkMate AI
// Une seule entrée IA pour tout le site : chat, réunion, email,
// focus, Gmail, code, documents et questions générales.
//
// Variables Vercel supportées :
// 1) OPENROUTER_API_KEY + OPENROUTER_MODEL optionnel
// 2) COHERE_API_KEY + COHERE_MODEL optionnel
// 3) GROQ_API_KEY + GROQ_MODEL optionnel
// 4) GEMINI_API_KEY + GEMINI_MODEL optionnel
// ============================================================

function jsonError(res, status, message) {
  return res.status(status).json({ error: message });
}

function asOpenAIText(text) {
  return {
    choices: [
      {
        message: {
          role: "assistant",
          content: text || ""
        }
      }
    ]
  };
}

function normalizeMessages(messages) {
  return messages
    .filter((m) => m && typeof m.content === "string" && m.content.trim())
    .map((m) => ({
      role: ["system", "user", "assistant"].includes(m.role) ? m.role : "user",
      content: m.content
    }));
}

async function callOpenRouter(messages) {
  const model = process.env.OPENROUTER_MODEL || "deepseek/deepseek-chat-v3-0324:free";

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "HTTP-Referer": "https://workmate-gamma.vercel.app",
      "X-Title": "WorkMate AI"
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.45,
      max_tokens: 1800
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || data?.message || "Erreur OpenRouter.");
  }

  return data;
}

async function callCohere(messages) {
  const model = process.env.COHERE_MODEL || "command-r-plus-08-2024";

  const response = await fetch("https://api.cohere.com/v2/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.COHERE_API_KEY}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.45,
      max_tokens: 1800
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.message || "Erreur Cohere.");
  }

  const text = Array.isArray(data?.message?.content)
    ? data.message.content.map((c) => c.text || "").join("")
    : data?.message?.content || "";

  return asOpenAIText(text);
}

async function callGroq(messages) {
  const model = process.env.GROQ_MODEL || "llama-3.1-8b-instant";

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.GROQ_API_KEY}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.45,
      max_tokens: 1800
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || "Erreur Groq.");
  }

  return data;
}

function splitGeminiMessages(messages) {
  const systemText = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");

  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }]
    }));

  return { systemText, contents };
}

async function callGemini(messages) {
  const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";
  const { systemText, contents } = splitGeminiMessages(messages);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: systemText ? { parts: [{ text: systemText }] } : undefined,
        contents,
        generationConfig: {
          temperature: 0.45,
          maxOutputTokens: 1800
        }
      })
    }
  );

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || "Erreur Gemini.");
  }

  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  return asOpenAIText(text);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return jsonError(res, 405, "Méthode non autorisée.");
  }

  try {
    const messages = normalizeMessages(req.body?.messages || []);

    if (!messages.length) {
      return jsonError(res, 400, "Paramètre 'messages' manquant ou invalide.");
    }

    const providers = [];
    if (process.env.OPENROUTER_API_KEY) providers.push(["OpenRouter", callOpenRouter]);
    if (process.env.COHERE_API_KEY) providers.push(["Cohere", callCohere]);
    if (process.env.GROQ_API_KEY) providers.push(["Groq", callGroq]);
    if (process.env.GEMINI_API_KEY) providers.push(["Gemini", callGemini]);

    if (!providers.length) {
      return jsonError(
        res,
        500,
        "Aucune clé IA configurée. Ajoute au moins OPENROUTER_API_KEY, COHERE_API_KEY, GROQ_API_KEY ou GEMINI_API_KEY dans Vercel."
      );
    }

    let lastError = null;

    for (const [name, fn] of providers) {
      try {
        const data = await fn(messages);
        return res.status(200).json({ ...data, provider: name });
      } catch (error) {
        lastError = `${name}: ${error.message}`;
      }
    }

    return jsonError(res, 502, lastError || "Tous les fournisseurs IA ont échoué.");
  } catch (error) {
    return jsonError(res, 500, error.message || "Erreur serveur.");
  }
}
