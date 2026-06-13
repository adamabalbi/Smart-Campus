// Vérification Cloudflare Turnstile (anti-bot) sur les formulaires sensibles.
// Le frontend envoie un jeton (turnstileToken) ; on le valide côté serveur
// auprès de Cloudflare avant de traiter la requête.
//
// Si TURNSTILE_SECRET_KEY n'est pas défini, la vérification est ignorée
// (dev local / déploiement progressif). Dès qu'on configure la clé sur Render,
// la protection s'active automatiquement.

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const verifyTurnstile = async (req, res, next) => {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  // Pas de clé configurée → on n'impose pas Turnstile (rétrocompatible).
  if (!secret) return next();

  const token = req.body && req.body.turnstileToken;
  if (!token) {
    return res.status(400).json({ message: "Vérification anti-robot manquante. Réessayez." });
  }

  try {
    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip || "";
    const params = new URLSearchParams();
    params.append("secret", secret);
    params.append("response", token);
    if (ip) params.append("remoteip", ip);

    const resp = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });
    const data = await resp.json().catch(() => ({ success: false }));

    if (!data.success) {
      return res.status(403).json({ message: "Échec de la vérification anti-robot. Réessayez." });
    }
    return next();
  } catch (err) {
    // En cas d'indisponibilité de Cloudflare, on évite de bloquer totalement le service.
    console.warn("⚠️  Turnstile indisponible:", err.message);
    return next();
  }
};

module.exports = { verifyTurnstile };
