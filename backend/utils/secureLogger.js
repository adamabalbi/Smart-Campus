// Logger sécurisé qui évite l'exposition de stack traces en production

const isProd = process.env.NODE_ENV === 'production';

/**
 * Log sécurisé d'une erreur
 * @param {string} context - Contexte de l'erreur (ex: "Erreur authentification")
 * @param {Error} error - L'erreur à logger
 * @param {object} safeData - Données non sensibles à inclure
 */
const logError = (context, error, safeData = {}) => {
  if (isProd) {
    // En production : juste le message, pas la stack trace
    console.error(`${context}: ${error.message}`, safeData);
  } else {
    // En développement : stack trace complète
    console.error(`${context}:`, error, safeData);
  }
};

/**
 * Log sécurisé d'informations sensibles
 * @param {string} message
 * @param {object} data - Données à nettoyer
 */
const logSafe = (message, data = {}) => {
  const safeData = { ...data };

  // Supprime les champs sensibles
  delete safeData.password;
  delete safeData.pin;
  delete safeData.pinHash;
  delete safeData.uid;
  delete safeData.uidHash;
  delete safeData.token;
  delete safeData.secret;

  // Masque les emails partiellement
  if (safeData.email) {
    safeData.email = safeData.email.replace(/(.{2}).*(@.*)/, '$1***$2');
  }

  console.log(message, safeData);
};

/**
 * Log d'activité suspecte (toujours détaillé)
 * @param {string} activity
 * @param {object} details
 */
const logSuspicious = (activity, details = {}) => {
  console.warn(`🚨 ACTIVITÉ SUSPECTE: ${activity}`, details);
};

module.exports = {
  logError,
  logSafe,
  logSuspicious,
  isProd
};