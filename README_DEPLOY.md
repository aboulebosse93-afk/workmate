# WorkMate v35 — Corrections rapport de test

## Bugs corrigés

1. Inscription
- Message plus clair si l’email existe déjà.
- Bouton “Cet email existe déjà ? Se connecter”.
- Email prérempli côté connexion.

2. Markdown
- Rendu Markdown simple ajouté aux résultats Documents et Réunion.
- Les titres `##`, le gras `**texte**`, les listes et le code inline sont mieux affichés.

3. Partage
- Le bouton Partager affiche maintenant un feedback si aucune discussion n’est active.
- Toast de confirmation après export.

4. Retour assistant
- Ajout d’un bouton retour dans Historique.
- Fonction `goAssistant()` robuste.

5. Projet actif
- Le bouton “Utiliser” affiche un toast.
- Un bandeau “Projet actif” apparaît dans l’assistant.

6. Actions / Actes
- Filtre d’extraction amélioré.
- Ignore mieux les paragraphes longs et les contenus non pertinents.
- Garde surtout les lignes ressemblant à de vraies tâches.

7. Documents
- Anti-doublon : deux clics sur “Analyser” mettent à jour le document au lieu de créer deux copies.
- Boutons Copier et Exporter .txt sur les résultats Documents.
- Boutons Copier et Exporter .txt sur les résultats Réunion.

8. Raccourcis
- Ctrl + Entrée : envoyer dans l’assistant.
- Ctrl + N : nouvelle discussion.

## Vérifications

- app.js : syntaxe OK
- api/ai.js : syntaxe OK
- api/gmail.js : syntaxe OK
- api/gmail-action.js : syntaxe OK
- api/calendar.js : syntaxe OK
- api/search.js : syntaxe OK
- service-worker.js : syntaxe OK

## Déploiement

1. Remplacer tous les fichiers du repo GitHub par ceux de ce ZIP.
2. Commit changes.
3. Vercel → Deployments → Redeploy.
4. Redéployer sans cache si possible.
5. Recharger avec Ctrl + F5.
