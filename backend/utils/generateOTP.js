const { randomInt } = require("crypto");

// OTP à 6 chiffres généré avec un CSPRNG (crypto.randomInt), non prédictible.
// Remplace Math.random() (PRNG non cryptographique — CWE-338).
const generateOTP = () => randomInt(100000, 1000000).toString();

module.exports = generateOTP;
