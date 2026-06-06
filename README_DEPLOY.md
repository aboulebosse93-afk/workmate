# WorkMate AI — IA unifiée

Cette version regroupe les anciens assistants en une seule IA centrale : WorkMate AI.

## Structure obligatoire à la racine du repo GitHub

- index.html
- style.css
- app.js
- vercel.json
- package.json
- api/ai.js
- api/gmail.js

## Vercel

Dans Project Settings > General :

- Framework Preset : Other
- Root Directory : vide
- Build Command : vide
- Output Directory : vide
- Install Command : vide ou npm install

Dans Environment Variables, ajoute au moins une clé :

- OPENROUTER_API_KEY
- ou GEMINI_API_KEY
- ou GROQ_API_KEY
- ou COHERE_API_KEY

Puis redéploie sans cache.
