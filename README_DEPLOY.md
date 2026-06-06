# WorkMate v13 — Profil avec paramètres modifiables

## Nouveautés

Quand l’utilisateur clique sur Profil, il peut maintenant modifier :

- Prénom
- Nom
- Nom de l’espace de travail
- Apparence : sombre, clair ou selon l’appareil
- Langue des réponses : français, anglais ou automatique
- Style de réponse de l’assistant : professionnel, simple, détaillé ou direct
- Réglages Gmail par défaut :
  - période de lecture
  - nombre d’emails à lire
- Déconnexion Gmail
- Mot de passe

## Important

Les paramètres d’interface sont stockés dans le navigateur avec `localStorage`.
Le profil utilisateur reste stocké dans Firebase Firestore.

## Fichiers à remplacer dans GitHub

- index.html
- style.css
- app.js
- vercel.json
- package.json
- README_DEPLOY.md
- api/ai.js
- api/gmail.js
