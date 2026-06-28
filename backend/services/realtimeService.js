// Service de diffusion temps réel.
// server.js détient le serveur WebSocket ; il injecte ici la fonction de
// broadcast via setBroadcaster(). Les contrôleurs (accès, présences) peuvent
// alors pousser des événements aux clients (kiosques, dashboards) sans dépendre
// directement de server.js. NON BLOQUANT : si aucun broadcaster n'est défini,
// l'appel est simplement ignoré.

let broadcaster = null;

/**
 * Injecté par server.js au démarrage.
 * @param {(payload:object)=>void} fn
 */
function setBroadcaster(fn) {
  broadcaster = fn;
}

/**
 * Diffuse un événement à tous les clients WebSocket connectés.
 * @param {object} payload
 */
function broadcast(payload) {
  try {
    if (typeof broadcaster === "function") {
      broadcaster(payload);
    }
  } catch (err) {
    console.warn("⚠️  Broadcast temps réel ignoré:", err.message);
  }
}

module.exports = { setBroadcaster, broadcast };
