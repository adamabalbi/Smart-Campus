// ============================================================================
// Smart Campus — Agent NFC local
// ----------------------------------------------------------------------------
// Tourne sur un poste/kiosque physique équipé d'un lecteur ACR122U (USB).
// Lit les cartes via PCSC et pousse chaque événement au backend cloud, qui
// le rediffuse aux navigateurs kiosques connectés en WebSocket.
//
//   ACR122U (USB) → nfc-agent (local) → HTTPS POST → backend cloud → WSS → kiosques
//
// Configuration via variables d'environnement (voir .env.example) :
//   BACKEND_URL      ex. https://smart-campus-api.onrender.com
//   NFC_AGENT_TOKEN  même valeur que sur le backend (en-tête X-Agent-Token)
//   AGENT_ID         identifiant du poste (optionnel, pour les logs)
// ============================================================================

require('dotenv').config();
const NFCService = require('./nfcService');

const BACKEND_URL = (process.env.BACKEND_URL || 'http://localhost:5000').replace(/\/$/, '');
const AGENT_TOKEN = process.env.NFC_AGENT_TOKEN || '';
const AGENT_ID = process.env.AGENT_ID || 'nfc-agent-1';
const INGEST_URL = `${BACKEND_URL}/api/nfc/ingest`;

if (!AGENT_TOKEN) {
  console.error('❌ NFC_AGENT_TOKEN manquant. Définissez-le dans .env (même valeur que sur le backend).');
  process.exit(1);
}

console.log('🏫 Smart Campus — Agent NFC');
console.log(`   Poste     : ${AGENT_ID}`);
console.log(`   Backend   : ${BACKEND_URL}`);
console.log(`   Ingestion : ${INGEST_URL}`);

// Envoie un événement de carte au backend cloud
async function pushEvent(type, uid, cardType) {
  try {
    const res = await fetch(INGEST_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Token': AGENT_TOKEN,
      },
      body: JSON.stringify({ type, uid, cardType, agentId: AGENT_ID }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`⚠️  Backend a refusé l'événement (${res.status}): ${body.slice(0, 120)}`);
    } else {
      console.log(`📤 ${type} envoyé au backend`);
    }
  } catch (err) {
    console.warn(`⚠️  Échec d'envoi au backend (${err.message}). Backend injoignable ?`);
  }
}

const nfc = new NFCService();

nfc.on('cardRead', (data) => pushEvent('cardDetected', data.uid, data.type));
nfc.on('cardRemoved', (data) => pushEvent('cardRemoved', data.uid, null));
nfc.on('error', (err) => console.error('❌ NFC:', err.message));

nfc.initialize().catch((err) => {
  console.error('❌ Impossible d\'initialiser le lecteur NFC:', err.message);
  console.error('💡 Vérifiez que le lecteur ACR122U est branché et que les drivers PCSC sont installés.');
  process.exit(1);
});

// Arrêt propre
const shutdown = async () => {
  console.log('\n⏹️  Arrêt de l\'agent NFC...');
  await nfc.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
