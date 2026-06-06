# WorkMate v9 — Interface soignée type workspace

## Objectif v9

Cette version garde toutes les fonctions de WorkMate, mais transforme l'apparence :

- Interface plus proche d'un vrai produit SaaS moderne
- Inspiration Claude/Gemini dans la propreté visuelle
- Moins de style "jouet IA"
- Moins d'emojis
- Navigation plus sobre
- Écran assistant plus central et plus propre
- Landing page plus professionnelle
- Gmail OAuth conservé
- Correction Firebase conservée

## Fichiers à remplacer dans GitHub

- index.html
- style.css
- app.js
- vercel.json
- package.json
- README_DEPLOY.md
- api/ai.js
- api/gmail.js

## Vercel

Dans Project Settings > General :

- Framework Preset : Other
- Root Directory : vide
- Build Command : vide
- Output Directory : vide
- Install Command : vide ou npm install

Puis redéploie sans cache.
