# WorkMate v29 — Correction PWA install + libellés

## Correction

Cette version corrige l’avertissement Chrome :

Banner not shown: beforeinstallpromptevent.preventDefault() called.

Pourquoi ?
Le navigateur indiquait que l’app bloquait la bannière d’installation sans proposer de bouton d’installation.

## Ajout

- Bouton "Installer l'application" dans la barre latérale
- Le bouton apparaît seulement quand Chrome autorise l’installation PWA
- Correction des icônes PWA :
  - icon-192.png
  - icon-512.png
- Correction des libellés :
  - Chercheur → Rechercher
  - Recherché → Recherche

## Important

Le message DevTools "DevTools is now available in French" n’est pas une erreur.
Il vient seulement de Chrome.

## Fichiers importants

- index.html
- style.css
- app.js
- manifest.json
- icon-192.png
- icon-512.png
- service-worker.js

## Déploiement

1. Upload tous les fichiers dans GitHub
2. Vérifie que icon-192.png et icon-512.png sont à la racine
3. Commit changes
4. Vercel → Deployments → Redeploy
5. Désactive le cache si possible
6. Recharge avec Ctrl + F5
