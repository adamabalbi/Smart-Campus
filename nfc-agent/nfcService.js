// Service NFC local (lecteur ACR122U via PCSC).
// Version autonome reprise du backend (backend/services/nfcService.js) :
// émet les événements 'cardRead' et 'cardRemoved' que l'agent relaie au cloud.
const { NFC } = require('nfc-pcsc');
const EventEmitter = require('events');
const crypto = require('crypto');

class NFCService extends EventEmitter {
  constructor() {
    super();
    this.nfc = null;
    this.isRunning = false;
    this.connectedReaders = new Map();
  }

  async initialize() {
    console.log('🔗 Initialisation du service NFC...');
    this.nfc = new NFC();

    this.nfc.on('reader', async (reader) => {
      await this.setupReader(reader);
    });

    this.nfc.on('error', (err) => {
      console.error('❌ Erreur NFC:', err);
      this.emit('error', err);
    });

    this.isRunning = true;
    console.log('✅ Service NFC démarré — en attente d\'un lecteur ACR122U...');
  }

  async setupReader(reader) {
    console.log(`📖 Lecteur connecté: ${reader.name}`);
    this.connectedReaders.set(reader.name, reader);

    reader.on('card', (card) => {
      if (!this.isValidCard(card)) {
        this.emit('invalidCard', { readerId: reader.name, card });
        return;
      }
      console.log(`📥 Carte détectée sur ${reader.name} — UID ${this.maskUID(card.uid)} (${card.type})`);
      this.emit('cardRead', {
        readerId: reader.name,
        uid: card.uid,
        uidHash: this.hashUID(card.uid),
        type: card.type,
        timestamp: new Date(),
      });
    });

    reader.on('card.off', (card) => {
      console.log('📤 Carte retirée:', this.maskUID(card.uid));
      this.emit('cardRemoved', { readerId: reader.name, uid: card.uid });
    });

    reader.on('error', (err) => {
      console.error(`❌ Erreur lecteur ${reader.name}:`, err.message);
    });
  }

  isValidCard(card) {
    if (!card.uid || card.uid.length === 0) return false;
    if (card.uid === 'ff'.repeat(card.uid.length / 2)) return false;
    return true;
  }

  hashUID(uid) {
    return crypto.createHash('sha256').update(uid).digest('hex');
  }

  maskUID(uid) {
    if (uid.length <= 4) return '****';
    return uid.substring(0, 2) + '*'.repeat(uid.length - 4) + uid.substring(uid.length - 2);
  }

  async stop() {
    try {
      if (this.nfc) await this.nfc.close();
      this.connectedReaders.clear();
      this.isRunning = false;
      console.log('⏹️  Service NFC arrêté');
    } catch (error) {
      console.error('❌ Erreur arrêt NFC:', error.message);
    }
  }
}

module.exports = NFCService;
