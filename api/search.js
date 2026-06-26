// api/search.js — Recherche web désactivée en version sans frais
export default async function handler(req, res) {
  return res.status(200).json({
    provider: "disabled",
    results: [],
    message: "Recherche web externe désactivée pour éviter tout frais. Utilise la recherche globale locale dans WorkMate."
  });
}
