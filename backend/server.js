const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const http = require("http");
const path = require("path");
const WebSocket = require("ws");
const connectDB = require("./config/db");

// Service NFC — chargé paresseusement (require dans initializeNFC) car il dépend
// de 'nfc-pcsc' (module natif) absent sur le cloud où ENABLE_NFC=false.
const { setNFCService } = require("./controllers/nfcController");

dotenv.config();

connectDB();

const app = express();

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",").map(o => o.trim())
  : ["http://localhost:5000", "http://127.0.0.1:5000"]; // Origines par défaut pour développement

app.use(cors({
  origin: (origin, callback) => {
    // Autoriser les requêtes sans origin ou origin null (fichiers locaux, Thunder Client, Postman)
    if (!origin || origin === "null") return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`Origine non autorisée : ${origin}`));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json({ limit: '10mb' }));

// Headers de sécurité de base partout. Le CSP est appliqué par route
// (strictCSP) sur les pages dont le JavaScript est externalisé.
app.use(helmet({ contentSecurityPolicy: false }));

// CSP stricte appliquée uniquement aux pages dont le JS est externalisé.
// (script-src 'self' : aucun script inline ; connect-src autorise le WebSocket NFC)
const strictCSP = helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "https:", "'unsafe-inline'"],
    fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
    imgSrc: ["'self'", "data:"],
    connectSrc: ["'self'", "ws:", "wss:"],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    frameAncestors: ["'self'"],
  },
});

// Fichiers statiques du kiosque (JS externalisé pour compatibilité CSP)
app.use("/kiosk-assets", express.static(path.join(__dirname, "../frontend/kiosk-assets")));

// Rate limiting pour l'authentification (protection contre force brute)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Max 5 tentatives par IP
  message: { message: "Trop de tentatives de connexion. Réessayez dans 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting général pour l'API
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // Max 100 requêtes par minute par IP
  message: { message: "Trop de requêtes. Réessayez dans une minute." }
});

app.use('/api', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/registration/verify-email', authLimiter);

app.get("/", (req, res) => {
  res.send("API Smart Campus fonctionne correctement");
});

// Route pour le kiosque NFC complet et fonctionnel
app.get("/kiosk-v2", strictCSP, (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Smart Campus - Kiosque NFC</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Source+Sans+3:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Source Sans 3', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #3D1F47, #2A1530);
      min-height: 100vh; color: white;
    }
    .container {
      max-width: 700px; margin: 2rem auto; padding: 2rem;
      background: rgba(255,255,255,0.08); border-radius: 20px;
      border-top: 4px solid #C9A86A;
      backdrop-filter: blur(10px); text-align: center;
      box-shadow: 0 20px 40px rgba(42,21,48,0.35);
    }
    .title { font-family: 'Fraunces', Georgia, serif; font-size: 2.5rem; margin-bottom: 0.5rem; font-weight: 700; }
    .subtitle { font-size: 1.2rem; opacity: 0.85; margin-bottom: 2rem; color: #E4D2A8; }
    .step {
      background: rgba(255,255,255,0.1); padding: 3rem 2rem; margin: 2rem 0;
      border-radius: 15px; border: 2px solid rgba(255,255,255,0.2);
    }
    .step.active { display: block; }
    .step.hidden { display: none; }
    .btn {
      background: rgba(255,255,255,0.2); border: 2px solid rgba(255,255,255,0.5);
      color: white; padding: 1.2rem 2rem; border-radius: 10px; font-size: 1.1rem;
      cursor: pointer; margin: 0.5rem; transition: all 0.3s ease; font-weight: 600;
    }
    .btn:hover { background: rgba(255,255,255,0.3); border-color: rgba(255,255,255,0.8); }
    .btn:active { transform: scale(0.98); }
    .btn.selected { background: rgba(201,168,106,0.35); border-color: #C9A86A; }
    .input {
      background: rgba(255,255,255,0.94); border: none; padding: 1.2rem;
      font-size: 1.8rem; text-align: center; border-radius: 10px; margin: 1rem;
      color: #2A1F2D; font-weight: 600; letter-spacing: 0.2rem;
    }
    .status {
      display: inline-flex; align-items: center; gap: 0.5rem;
      background: rgba(255,255,255,0.2); padding: 0.8rem 1.5rem;
      border-radius: 25px; margin: 1rem 0;
    }
    .indicator {
      width: 12px; height: 12px; border-radius: 50%; background: #8FBE7A;
      animation: pulse 2s infinite;
    }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
    .card-icon {
      font-size: 5rem; margin: 1.5rem 0;
      animation: bounce 2s infinite; display: block;
    }
    @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-15px); } }
    .success-icon {
      font-size: 6rem; color: #8FBE7A;
      animation: success-pulse 0.6s ease-out; display: block; margin: 1rem 0;
    }
    @keyframes success-pulse { 0% { transform: scale(0); } 50% { transform: scale(1.2); } 100% { transform: scale(1); } }
    .processing-icon {
      font-size: 4rem; animation: spin 1s linear infinite; margin: 1.5rem 0;
    }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    .balance { font-family: 'Fraunces', Georgia, serif; font-size: 2.5rem; font-weight: 700; margin: 1.5rem 0; color: #E4D2A8; text-shadow: 0 2px 4px rgba(0,0,0,0.3); }
    .student-info {
      background: rgba(255,255,255,0.12); border-radius: 10px;
      padding: 1.5rem; margin: 1.5rem 0; text-align: left;
    }
    .student-info h3 { font-family: 'Fraunces', Georgia, serif; margin: 0 0 0.5rem 0; font-size: 1.6rem; }
    .student-info p { margin: 0.3rem 0; opacity: 0.9; font-size: 1.1rem; }
    .error { color: #F0C9C3; background: rgba(155,58,58,0.25); padding: 1rem; border-radius: 8px; margin: 1rem 0; }
  </style>
</head>
<body>
  <div class="container">
    <h1 class="title">🏫 Smart Campus</h1>
    <p class="subtitle">Kiosque de Recharge NFC</p>

    <div class="status">
      <span class="indicator"></span>
      <span>Lecteur ACR122U connecté</span>
    </div>

    <!-- Étape 0: Sélection de la borne -->
    <div id="selectKiosk" class="step active">
      <div style="font-size: 4rem; margin-bottom: 1rem;">📍</div>
      <h2 style="font-size: 1.8rem; margin-bottom: 0.5rem;">Sélectionnez votre borne</h2>
      <p style="font-size: 1rem; opacity: 0.9; margin-bottom: 1.5rem;">
        Choisissez l'emplacement où vous effectuez votre recharge
      </p>
      <div id="kioskList" style="display:flex; flex-direction:column; gap:0.6rem; max-width:420px; margin:0 auto;"></div>
    </div>

    <!-- Étape 1: Attente -->
    <div id="waiting" class="step hidden">
      <div id="selectedKioskBadge" style="margin-bottom:1rem; font-size:0.95rem; opacity:0.9;"></div>
      <div class="card-icon">💳</div>
      <h2 style="font-size: 1.8rem; margin-bottom: 1rem;">Approchez votre carte NFC</h2>
      <p style="font-size: 1.1rem; opacity: 0.9; margin-bottom: 1rem;">
        Placez votre carte près du lecteur ACR122U
      </p>

      <div id="nfcStatus" style="margin: 1rem 0; padding: 1rem; background: rgba(255,255,255,0.1); border-radius: 10px;">
        <p id="nfcStatusText">🔗 Connexion au lecteur NFC...</p>
      </div>

      <div id="testButtons" style="margin-top: 2rem;">
        <p style="font-size: 0.9rem; opacity: 0.7; margin-bottom: 1rem;">Mode Test (Développement):</p>
        <button class="btn" data-action="simulateCard" data-uid="a89fb4ef" data-name="Jean Dupont">
          🧪 Test Carte 1 (Jean)
        </button>
        <button class="btn" data-action="simulateCard" data-uid="b8d4e0ef" data-name="Marie Martin">
          🧪 Test Carte 2 (Marie)
        </button>
        <button class="btn" data-action="simulateCard" data-uid="b840cdef" data-name="Test Admin">
          🧪 Test Carte 3 (Admin)
        </button>
      </div>
    </div>

    <!-- Étape 2: PIN -->
    <div id="pin" class="step hidden">
      <div style="font-size: 4rem; margin-bottom: 1rem;">🔐</div>
      <h2>Saisissez votre code PIN</h2>

      <div id="studentInfo" class="student-info"></div>

      <div style="margin: 2rem 0;">
        <input type="password" id="pinInput" class="input" placeholder="••••" maxlength="4" inputmode="numeric">
      </div>

      <div style="margin-top: 2rem;">
        <button class="btn" data-action="validatePin">✓ Valider PIN</button>
        <button class="btn" data-action="restart">✗ Annuler</button>
      </div>

      <div id="pinError" class="error" style="display: none;"></div>
    </div>

    <!-- Étape 3: Montant -->
    <div id="amount" class="step hidden">
      <div style="font-size: 4rem; margin-bottom: 1rem;">💰</div>
      <h2>Choisissez le montant à recharger</h2>

      <div class="balance">
        Solde actuel: <span id="currentBalance">0</span> XOF
      </div>

      <div style="margin: 2rem 0;">
        <button class="btn amount-btn" data-action="selectAmount" data-amount="1000">1 000 XOF</button>
        <button class="btn amount-btn" data-action="selectAmount" data-amount="2000">2 000 XOF</button>
        <button class="btn amount-btn" data-action="selectAmount" data-amount="5000">5 000 XOF</button>
      </div>
      <div style="margin: 1rem 0;">
        <button class="btn amount-btn" data-action="selectAmount" data-amount="10000">10 000 XOF</button>
        <button class="btn amount-btn" data-action="selectAmount" data-amount="20000">20 000 XOF</button>
      </div>

      <div style="margin-top: 2rem;">
        <button class="btn" data-action="confirmRecharge" id="confirmBtn" disabled
                style="opacity: 0.5; cursor: not-allowed;">
          ✓ Confirmer la recharge
        </button>
        <button class="btn" data-action="restart">✗ Annuler</button>
      </div>
    </div>

    <!-- Étape 4: Traitement -->
    <div id="processing" class="step hidden">
      <div class="processing-icon">⏳</div>
      <h2>Traitement en cours...</h2>
      <p style="opacity: 0.8; margin-top: 1rem;">Veuillez patienter</p>
    </div>

    <!-- Étape 5: Succès + reçu -->
    <div id="success" class="step hidden">
      <div class="success-icon">✅</div>
      <h2>Recharge effectuée avec succès !</h2>

      <div id="receiptBox" style="background:#fff; color:#2A1F2D; border-radius:12px; padding:1.5rem; max-width:420px; margin:1.5rem auto; text-align:left; font-size:14px; box-shadow:0 8px 24px rgba(0,0,0,0.25);">
        <div style="text-align:center; border-bottom:2px dashed #E4DCE2; padding-bottom:0.75rem; margin-bottom:0.75rem;">
          <div style="font-size:1.2rem; font-weight:700;">🏫 Smart Campus</div>
          <div style="font-size:0.85rem; color:#80727F;">Reçu de recharge</div>
        </div>
        <div style="display:flex; justify-content:space-between; margin:0.35rem 0;"><span>N° reçu</span><strong id="rcNumber">—</strong></div>
        <div style="display:flex; justify-content:space-between; margin:0.35rem 0;"><span>Date</span><strong id="rcDate">—</strong></div>
        <div style="display:flex; justify-content:space-between; margin:0.35rem 0;"><span>Borne</span><strong id="rcKiosk">—</strong></div>
        <div style="display:flex; justify-content:space-between; margin:0.35rem 0;"><span>Étudiant</span><strong id="rcStudent">—</strong></div>
        <div style="display:flex; justify-content:space-between; margin:0.35rem 0;"><span>Matricule</span><strong id="rcMatricule">—</strong></div>
        <div style="border-top:2px dashed #E4DCE2; margin-top:0.75rem; padding-top:0.75rem;">
          <div style="display:flex; justify-content:space-between; margin:0.35rem 0;"><span>Montant rechargé</span><strong id="rcAmount" style="color:#5B7553;">—</strong></div>
          <div style="display:flex; justify-content:space-between; margin:0.35rem 0;"><span>Ancien solde</span><span id="rcBefore">—</span></div>
          <div style="display:flex; justify-content:space-between; margin:0.35rem 0;"><span>Nouveau solde</span><strong id="rcAfter">—</strong></div>
        </div>
      </div>

      <div style="margin-top: 1rem;">
        <button class="btn" data-action="printReceipt">🖨️ Imprimer le reçu</button>
        <button class="btn" data-action="restart">🔄 Nouvelle transaction</button>
      </div>
    </div>

    <!-- Étape 6: Erreur -->
    <div id="error" class="step hidden">
      <div style="font-size: 4rem; color: #C98A85; margin-bottom: 1rem;">❌</div>
      <h2>Erreur de transaction</h2>
      <div id="errorMessage" style="margin: 1.5rem 0; padding: 1rem; background: rgba(255,107,107,0.2); border-radius: 8px;"></div>

      <div style="margin-top: 2rem;">
        <button class="btn" data-action="restart">🔄 Réessayer</button>
      </div>
    </div>
  </div>

  <script src="/kiosk-assets/kiosk-v2.js"></script>
</html>
  `);
});

app.use("/api/auth",     require("./routes/authRoutes"));
app.use("/api/students", require("./routes/studentRoutes"));
app.use("/api/cards",    require("./routes/cardRoutes"));
app.use("/api/wallets",  require("./routes/walletRoutes"));
app.use("/api/stats",        require("./routes/statsRoutes"));
app.use("/api/settings",     require("./routes/settingsRoutes"));
app.use("/api/registration",   require("./routes/registrationRoutes"));
app.use("/api/student-space",      require("./routes/studentSpaceRoutes"));
app.use("/api/card-applications",  require("./routes/cardApplicationRoutes"));
app.use("/api/scolarite",          require("./routes/scolariteRoutes"));
app.use("/api/nfc",              require("./routes/nfcRoutes"));
app.use("/api/services",         require("./routes/serviceRoutes"));
app.use("/api/access",           require("./routes/accessRoutes"));
app.use("/api/alerts",           require("./routes/alertRoutes"));
app.use("/api/audit",            require("./routes/auditRoutes"));

const PORT = process.env.PORT || 5000;

// Créer serveur HTTP pour WebSocket
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Initialisation du service NFC
let nfcService = null;

// Diffuse un événement à tous les kiosques (navigateurs) connectés en WebSocket
const broadcastToKiosks = (payload) => {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(payload));
    }
  });
};

// --- Endpoint d'ingestion NFC pour le nfc-agent distant ---
// En production, le lecteur ACR122U tourne sur un poste local (nfc-agent) qui
// pousse les lectures de carte ici ; le backend cloud les rediffuse aux kiosques.
// Protégé par un token machine (NFC_AGENT_TOKEN).
app.post('/api/nfc/ingest', (req, res) => {
  const token = req.headers['x-agent-token'];
  if (!process.env.NFC_AGENT_TOKEN || token !== process.env.NFC_AGENT_TOKEN) {
    return res.status(401).json({ message: 'Agent NFC non autorisé.' });
  }
  const { type, uid, cardType } = req.body || {};
  if (!['cardDetected', 'cardRemoved'].includes(type) || !uid) {
    return res.status(400).json({ message: 'Payload invalide (type, uid requis).' });
  }
  broadcastToKiosks({ type, uid, cardType: cardType || null, timestamp: Date.now() });
  return res.json({ ok: true });
});

// Gestion WebSocket pour communication temps réel
wss.on('connection', (ws) => {
  console.log('📱 Client kiosque connecté via WebSocket');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('📨 Message reçu du kiosque:', data);

      if (data.type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      }
    } catch (error) {
      console.error('❌ Erreur parsing message WebSocket:', error);
    }
  });

  ws.on('close', () => {
    console.log('📱 Client kiosque déconnecté');
  });

  // Envoyer état initial
  ws.send(JSON.stringify({
    type: 'status',
    nfcEnabled: process.env.ENABLE_NFC === 'true',
    timestamp: Date.now()
  }));
});

const initializeNFC = async () => {
  if (process.env.ENABLE_NFC === 'true') {
    try {
      const NFCService = require("./services/nfcService");
      nfcService = new NFCService();
      await nfcService.initialize();
      setNFCService(nfcService);

      // Écouter les événements NFC et les diffuser via WebSocket
      nfcService.on('cardRead', (cardData) => {
        console.log('📤 Diffusion événement carte via WebSocket:', cardData.uid);
        broadcastToKiosks({
          type: 'cardDetected',
          uid: cardData.uid,
          cardType: cardData.type,
          timestamp: cardData.timestamp
        });
      });

      nfcService.on('cardRemoved', (cardData) => {
        console.log('📤 Diffusion carte retirée via WebSocket');
        broadcastToKiosks({
          type: 'cardRemoved',
          uid: cardData.uid,
          timestamp: Date.now()
        });
      });

      console.log('🔗 Service NFC initialisé avec WebSocket');
    } catch (error) {
      console.warn('⚠️  Service NFC non disponible:', error.message);
      console.log('💡 Fonctionnalités NFC désactivées');
    }
  } else {
    console.log('📱 Service NFC désactivé (ENABLE_NFC=false)');
  }
};

server.listen(PORT, async () => {
  console.log(`🚀 Serveur HTTP lancé sur le port ${PORT}`);
  console.log(`🔗 WebSocket disponible sur ws://localhost:${PORT}`);

  // Initialisation différée du NFC pour ne pas bloquer le serveur
  setTimeout(initializeNFC, 2000);
});

// Gestion propre de l'arrêt
process.on('SIGINT', async () => {
  console.log('\n⏹️  Arrêt du serveur en cours...');

  if (nfcService) {
    try {
      await nfcService.stop();
      console.log('🔌 Service NFC arrêté proprement');
    } catch (error) {
      console.error('❌ Erreur arrêt NFC:', error);
    }
  }

  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🔄 Redémarrage du serveur...');
  if (nfcService) await nfcService.stop();
  process.exit(0);
});