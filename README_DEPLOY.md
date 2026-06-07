# WorkMate v27 — Version 100 % sans frais

## Objectif

Cette version retire tout ce qui peut faire penser à un service payant.

## Supprimé / désactivé

- Page Abonnement
- Plans Pro / Entreprise
- Stripe
- Checkout
- Paiement
- Recherche web externe Serper / Tavily / Brave
- Mentions de clés payantes de recherche web

## Conservé

- Assistant central
- Conversations
- Renommer / supprimer les discussions
- Thème clair / sombre
- Bouton + images/fichiers
- Documents PDF / Word / texte
- OCR images côté navigateur
- Gmail / Calendar avec Google, selon quotas gratuits
- Projets
- Mémoire longue durée
- Base de connaissances locale
- Automatisations locales
- Actions
- Historique
- Profil
- Sécurité / confidentialité
- PWA
- Firestore sync
- Extension Chrome template

## Important

WorkMate reste sans abonnement et sans paiement.

Pour éviter les frais :
- ne configure pas Stripe
- ne configure pas SERPER_API_KEY
- ne configure pas TAVILY_API_KEY
- ne configure pas BRAVE_SEARCH_API_KEY

## Variables Vercel utiles

Tu peux garder seulement les clés IA gratuites ou de test :

- OPENROUTER_API_KEY si tu utilises des modèles gratuits
- GEMINI_API_KEY si tu utilises le quota gratuit
- GROQ_API_KEY si tu as du quota gratuit
- COHERE_API_KEY si tu as du quota gratuit

## Fichiers à remplacer dans GitHub

- index.html
- style.css
- app.js
- vercel.json
- package.json
- README_DEPLOY.md
- manifest.json
- service-worker.js
- api/ai.js
- api/gmail.js
- api/gmail-action.js
- api/calendar.js
- api/search.js
- chrome-extension-template/
