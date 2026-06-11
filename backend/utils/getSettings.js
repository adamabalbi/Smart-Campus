const Settings = require("../models/Settings");

let cached  = null;
let cachedAt = 0;
const TTL   = 60 * 1000; // 1 minute

const getSettings = async () => {
  const now = Date.now();
  if (cached && now - cachedAt < TTL) return cached;

  let settings = await Settings.findOne();
  if (!settings) settings = await Settings.create({});

  cached   = settings.toObject();
  cachedAt = now;
  return cached;
};

const invalidateCache = () => { cached = null; };

module.exports = { getSettings, invalidateCache };
