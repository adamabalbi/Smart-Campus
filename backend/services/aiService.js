// Service d'appel à l'API IA (Flask) pour la détection de paiements suspects.
// Conçu pour être NON BLOQUANT : toute erreur/timeout renvoie null (pas d'alerte),
// le paiement n'est jamais interrompu par l'IA.

const AI_URL = process.env.AI_URL || "http://localhost:5001";
const AI_TIMEOUT_MS = parseInt(process.env.AI_TIMEOUT_MS || "2000", 10);

/**
 * Envoie les features d'un paiement au modèle IA.
 * @returns {Promise<{label:number, decision:string, score:number}|null>}
 */
async function predictPayment(features) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const res = await fetch(`${AI_URL}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(features),
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      console.warn(`⚠️  IA: réponse ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    clearTimeout(timer);
    console.warn("⚠️  IA indisponible:", err.message);
    return null;
  }
}

module.exports = { predictPayment };
