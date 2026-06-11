const { NFC } = require('nfc-pcsc');
const EventEmitter = require('events');
const crypto = require('crypto');

class NFCService extends EventEmitter {
  constructor() {
    super();
    this.nfc = null;
    this.isRunning = false;
    this.connectedReaders = new Map();
    this.config = {
      maxRetries: 3,
      readTimeout: 5000,
      autoConnect: true
    };
  }

  async initialize() {
    try {
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
      console.log('✅ Service NFC démarré');

    } catch (error) {
      console.error('❌ Échec initialisation NFC:', error);
      throw error;
    }
  }

  async setupReader(reader) {
    console.log(`📖 Lecteur connecté: ${reader.name}`);
    this.connectedReaders.set(reader.name, reader);

    reader.on('card', async (card) => {
      await this.handleCard(reader, card);
    });

    reader.on('card.off', (card) => {
      console.log('📤 Carte retirée:', this.maskUID(card.uid));
      this.emit('cardRemoved', {
        readerId: reader.name,
        uid: card.uid
      });
    });

    reader.on('error', (err) => {
      console.error(`❌ Erreur lecteur ${reader.name}:`, err);
    });

    this.emit('readerConnected', {
      name: reader.name,
      status: 'connected'
    });
  }

  async handleCard(reader, card) {
    try {
      console.log(`📥 Carte détectée sur ${reader.name}`);
      console.log(`   UID: ${this.maskUID(card.uid)}`);
      console.log(`   Type: ${card.type}`);

      // Validation basique de la carte
      if (!this.isValidCard(card)) {
        this.emit('invalidCard', { readerId: reader.name, card });
        return;
      }

      // Hash de l'UID pour sécurité
      const uidHash = this.hashUID(card.uid);

      // Émission de l'événement de lecture
      this.emit('cardRead', {
        readerId: reader.name,
        uid: card.uid,
        uidHash: uidHash,
        type: card.type,
        timestamp: new Date(),
        raw: card
      });

      // Tentative de lecture des données supplémentaires
      try {
        const data = await this.readCardData(reader, card);
        if (data) {
          this.emit('cardDataRead', {
            readerId: reader.name,
            uid: card.uid,
            data: data,
            timestamp: new Date()
          });
        }
      } catch (readError) {
        console.warn('⚠️  Impossible de lire les données de la carte:', readError.message);
      }

    } catch (error) {
      console.error('❌ Erreur lors de la lecture carte:', error);
      this.emit('cardError', {
        readerId: reader.name,
        error: error.message
      });
    }
  }

  async readCardData(reader, card) {
    try {
      // Lecture de données basiques (adaptez selon vos besoins)
      const data = await reader.read(4, 16); // Bloc 4, 16 octets
      return data;
    } catch (error) {
      // Normal pour les cartes non-programmées
      return null;
    }
  }

  async writeCardData(readerName, data) {
    const reader = this.connectedReaders.get(readerName);
    if (!reader) {
      throw new Error('Lecteur non trouvé');
    }

    try {
      await reader.write(4, data); // Écrire au bloc 4
      return true;
    } catch (error) {
      console.error('❌ Erreur écriture carte:', error);
      throw error;
    }
  }

  isValidCard(card) {
    // Validation basique
    if (!card.uid || card.uid.length === 0) return false;
    if (card.uid === 'ff'.repeat(card.uid.length / 2)) return false; // UID invalide
    return true;
  }

  hashUID(uid) {
    // Hash SHA-256 de l'UID pour stockage sécurisé
    return crypto.createHash('sha256').update(uid).digest('hex');
  }

  maskUID(uid) {
    // Masque l'UID pour les logs (sécurité)
    if (uid.length <= 4) return '****';
    return uid.substring(0, 2) + '*'.repeat(uid.length - 4) + uid.substring(uid.length - 2);
  }

  getConnectedReaders() {
    return Array.from(this.connectedReaders.keys());
  }

  async stop() {
    try {
      if (this.nfc) {
        await this.nfc.close();
      }
      this.connectedReaders.clear();
      this.isRunning = false;
      console.log('⏹️  Service NFC arrêté');
    } catch (error) {
      console.error('❌ Erreur arrêt NFC:', error);
    }
  }
}

module.exports = NFCService;