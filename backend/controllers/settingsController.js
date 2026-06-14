const Settings = require("../models/Settings");
const { logError } = require("../utils/secureLogger");
const { invalidateCache } = require("../utils/getSettings");

const getOrCreate = async () => {
  let s = await Settings.findOne();
  if (!s) s = await Settings.create({});
  return s;
};

const getSettings = async (req, res) => {
  try {
    const settings = await getOrCreate();
    return res.status(200).json({ settings });
  } catch (error) {
    logError("Erreur getSettings", error);
    return res.status(500).json({ message: "Erreur lors de la récupération des paramètres." });
  }
};

const updateSettings = async (req, res) => {
  try {
    const { otp, password, pin, session } = req.body;
    const settings = await getOrCreate();

    if (otp?.expiryMinutes          !== undefined) settings.otp.expiryMinutes          = otp.expiryMinutes;
    if (otp?.maxAttempts            !== undefined) settings.otp.maxAttempts            = otp.maxAttempts;
    if (password?.minLength         !== undefined) settings.password.minLength         = password.minLength;
    if (pin?.maxAttempts            !== undefined) settings.pin.maxAttempts            = pin.maxAttempts;
    if (pin?.blockDurationMinutes   !== undefined) settings.pin.blockDurationMinutes   = pin.blockDurationMinutes;
    if (session?.jwtExpiryHours     !== undefined) settings.session.jwtExpiryHours     = session.jwtExpiryHours;

    settings.updatedBy = req.user._id;
    await settings.save();

    invalidateCache();

    return res.status(200).json({
      message: "Paramètres mis à jour avec succès.",
      settings,
    });
  } catch (error) {
    logError("Erreur updateSettings", error);
    return res.status(500).json({ message: "Erreur lors de la mise à jour des paramètres." });
  }
};

module.exports = { getSettings, updateSettings };
