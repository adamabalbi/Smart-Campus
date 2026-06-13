// ============================================================================
// Smart Campus — Configuration front-end centralisée
// ----------------------------------------------------------------------------
// Détecte automatiquement l'environnement (local vs production) et expose
// l'URL du backend pour tous les scripts via window.SMART_CAMPUS_CONFIG.
//
// ⚠️ En production : remplacez PROD_BACKEND_ORIGIN par l'URL de votre backend
//    Render, puis redéployez le frontend (Netlify/Vercel).
//
// Ce fichier doit être inclus AVANT les autres scripts de chaque page :
//   <script src="config.js"></script>
//   <script src="dashboard.js"></script>
// ============================================================================
(function () {
  // 👉 À adapter : URL du backend déployé sur Render (sans slash final)
  const PROD_BACKEND_ORIGIN = "https://smart-campus-api.onrender.com";

  const host = window.location.hostname;
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "";

  // En local on parle au backend local ; en prod, au backend Render.
  const BACKEND_ORIGIN = isLocal ? "http://localhost:5000" : PROD_BACKEND_ORIGIN;

  window.SMART_CAMPUS_CONFIG = {
    BACKEND_ORIGIN,
    API_BASE_URL: BACKEND_ORIGIN + "/api",
    // ws:// en local, wss:// en https (prod)
    WS_BASE_URL: BACKEND_ORIGIN.replace(/^http/, "ws"),
  };
})();
