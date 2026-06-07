# WorkMate v28 — Correction icônes PWA et libellés

## Correction

Cette version corrige l’avertissement Chrome :

- icon-192.png manquant
- icon-512.png manquant
- manifest PWA mis à jour

## Libellés corrigés

- Chercheur → Rechercher
- Recherché → Recherche

## Ce que cela change

L’erreur visible dans la console :

Error while trying to use the following icon from the Manifest:
icon-192.png

disparaît après déploiement.

## Fichiers à remplacer / ajouter

- index.html
- style.css
- app.js
- manifest.json
- icon-192.png
- icon-512.png
- tous les autres fichiers du ZIP si tu remplaces tout

## Déploiement

Après upload GitHub :

- Vercel
- Deployments
- Redeploy
- sans cache
