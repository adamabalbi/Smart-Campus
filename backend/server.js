const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const http = require("http");
const WebSocket = require("ws");
const connectDB = require("./config/db");

// Service NFC
const NFCService = require("./services/nfcService");
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
app.use(express.json());

app.get("/", (req, res) => {
  res.send("API Smart Campus fonctionne correctement");
});

// Route de test pour debug
app.get("/test-kiosk", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Test Kiosque NFC - Debug</title>
  <style>
    body { font-family: Arial; padding: 2rem; background: #f0f0f0; }
    .step { background: white; padding: 2rem; margin: 1rem 0; border-radius: 10px; }
    .hidden { display: none; }
    .btn { background: #007bff; color: white; padding: 1rem; border: none; border-radius: 5px; margin: 0.5rem; cursor: pointer; }
    .input { padding: 1rem; font-size: 1.2rem; margin: 1rem; border: 1px solid #ccc; border-radius: 5px; }
  </style>
</head>
<body>
  <h1>🧪 Test Kiosque NFC - Debug</h1>

  <div id="step-waiting" class="step">
    <h2>Test API NFC</h2>
    <button class="btn" onclick="testAPI()">Test Carte Jean (a89fb4ef)</button>
    <div id="result" style="margin-top: 1rem; padding: 1rem; background: #f8f9fa;"></div>
  </div>

  <script>
    async function testAPI() {
      const resultDiv = document.getElementById('result');
      resultDiv.innerHTML = '⏳ Test en cours...';

      try {
        console.log('🔍 Début test API...');

        const response = await fetch('/api/nfc/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid: 'a89fb4ef', readerId: 'test-debug' })
        });

        console.log('📡 Response status:', response.status);

        const data = await response.json();
        console.log('📄 Response data:', data);

        if (data.success) {
          resultDiv.innerHTML = \`
            <h3>✅ Succès !</h3>
            <p><strong>Étudiant:</strong> \${data.data.student.prenom} \${data.data.student.nom}</p>
            <p><strong>Matricule:</strong> \${data.data.student.matricule}</p>
            <p><strong>Solde:</strong> \${data.data.wallet.balance} XOF</p>
            <p><strong>PIN requis:</strong> \${data.data.card.pinRequired ? 'Oui' : 'Non'}</p>
          \`;
        } else {
          resultDiv.innerHTML = \`<h3>❌ Erreur API</h3><p>\${data.message}</p>\`;
        }

      } catch (error) {
        console.error('💥 Erreur:', error);
        resultDiv.innerHTML = \`<h3>💥 Erreur JavaScript</h3><p>\${error.message}</p>\`;
      }
    }
  </script>
</body>
</html>
  `);
});

// Route pour le kiosque NFC complet et fonctionnel
app.get("/kiosk-v2", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Smart Campus - Kiosque NFC</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: linear-gradient(135deg, #667eea, #764ba2);
      min-height: 100vh; color: white;
    }
    .container {
      max-width: 700px; margin: 2rem auto; padding: 2rem;
      background: rgba(255,255,255,0.1); border-radius: 20px;
      backdrop-filter: blur(10px); text-align: center;
      box-shadow: 0 20px 40px rgba(0,0,0,0.2);
    }
    .title { font-size: 2.5rem; margin-bottom: 0.5rem; font-weight: 700; }
    .subtitle { font-size: 1.2rem; opacity: 0.9; margin-bottom: 2rem; }
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
    .btn.selected { background: rgba(255,255,255,0.4); border-color: rgba(255,255,255,0.9); }
    .input {
      background: rgba(255,255,255,0.9); border: none; padding: 1.2rem;
      font-size: 1.8rem; text-align: center; border-radius: 10px; margin: 1rem;
      color: #333; font-weight: 600; letter-spacing: 0.2rem;
    }
    .status {
      display: inline-flex; align-items: center; gap: 0.5rem;
      background: rgba(255,255,255,0.2); padding: 0.8rem 1.5rem;
      border-radius: 25px; margin: 1rem 0;
    }
    .indicator {
      width: 12px; height: 12px; border-radius: 50%; background: #44ff44;
      animation: pulse 2s infinite;
    }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
    .card-icon {
      font-size: 5rem; margin: 1.5rem 0;
      animation: bounce 2s infinite; display: block;
    }
    @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-15px); } }
    .success-icon {
      font-size: 6rem; color: #44ff44;
      animation: success-pulse 0.6s ease-out; display: block; margin: 1rem 0;
    }
    @keyframes success-pulse { 0% { transform: scale(0); } 50% { transform: scale(1.2); } 100% { transform: scale(1); } }
    .processing-icon {
      font-size: 4rem; animation: spin 1s linear infinite; margin: 1.5rem 0;
    }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    .balance { font-size: 2.5rem; font-weight: 700; margin: 1.5rem 0; text-shadow: 0 2px 4px rgba(0,0,0,0.3); }
    .student-info {
      background: rgba(255,255,255,0.15); border-radius: 10px;
      padding: 1.5rem; margin: 1.5rem 0; text-align: left;
    }
    .student-info h3 { margin: 0 0 0.5rem 0; font-size: 1.6rem; }
    .student-info p { margin: 0.3rem 0; opacity: 0.9; font-size: 1.1rem; }
    .error { color: #ff6b6b; background: rgba(255,107,107,0.2); padding: 1rem; border-radius: 8px; margin: 1rem 0; }
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
        <button class="btn" onclick="simulateCard('a89fb4ef', 'Jean Dupont')">
          🧪 Test Carte 1 (Jean)
        </button>
        <button class="btn" onclick="simulateCard('b8d4e0ef', 'Marie Martin')">
          🧪 Test Carte 2 (Marie)
        </button>
        <button class="btn" onclick="simulateCard('b840cdef', 'Test Admin')">
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
        <button class="btn" onclick="validatePin()">✓ Valider PIN</button>
        <button class="btn" onclick="restart()">✗ Annuler</button>
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
        <button class="btn amount-btn" onclick="selectAmount(1000)">1 000 XOF</button>
        <button class="btn amount-btn" onclick="selectAmount(2000)">2 000 XOF</button>
        <button class="btn amount-btn" onclick="selectAmount(5000)">5 000 XOF</button>
      </div>
      <div style="margin: 1rem 0;">
        <button class="btn amount-btn" onclick="selectAmount(10000)">10 000 XOF</button>
        <button class="btn amount-btn" onclick="selectAmount(20000)">20 000 XOF</button>
      </div>

      <div style="margin-top: 2rem;">
        <button class="btn" onclick="confirmRecharge()" id="confirmBtn" disabled
                style="opacity: 0.5; cursor: not-allowed;">
          ✓ Confirmer la recharge
        </button>
        <button class="btn" onclick="restart()">✗ Annuler</button>
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

      <div id="receiptBox" style="background:#fff; color:#222; border-radius:12px; padding:1.5rem; max-width:420px; margin:1.5rem auto; text-align:left; font-size:14px; box-shadow:0 8px 24px rgba(0,0,0,0.25);">
        <div style="text-align:center; border-bottom:2px dashed #ccc; padding-bottom:0.75rem; margin-bottom:0.75rem;">
          <div style="font-size:1.2rem; font-weight:700;">🏫 Smart Campus</div>
          <div style="font-size:0.85rem; color:#666;">Reçu de recharge</div>
        </div>
        <div style="display:flex; justify-content:space-between; margin:0.35rem 0;"><span>N° reçu</span><strong id="rcNumber">—</strong></div>
        <div style="display:flex; justify-content:space-between; margin:0.35rem 0;"><span>Date</span><strong id="rcDate">—</strong></div>
        <div style="display:flex; justify-content:space-between; margin:0.35rem 0;"><span>Borne</span><strong id="rcKiosk">—</strong></div>
        <div style="display:flex; justify-content:space-between; margin:0.35rem 0;"><span>Étudiant</span><strong id="rcStudent">—</strong></div>
        <div style="display:flex; justify-content:space-between; margin:0.35rem 0;"><span>Matricule</span><strong id="rcMatricule">—</strong></div>
        <div style="border-top:2px dashed #ccc; margin-top:0.75rem; padding-top:0.75rem;">
          <div style="display:flex; justify-content:space-between; margin:0.35rem 0;"><span>Montant rechargé</span><strong id="rcAmount" style="color:#16a34a;">—</strong></div>
          <div style="display:flex; justify-content:space-between; margin:0.35rem 0;"><span>Ancien solde</span><span id="rcBefore">—</span></div>
          <div style="display:flex; justify-content:space-between; margin:0.35rem 0;"><span>Nouveau solde</span><strong id="rcAfter">—</strong></div>
        </div>
      </div>

      <div style="margin-top: 1rem;">
        <button class="btn" onclick="printReceipt()">🖨️ Imprimer le reçu</button>
        <button class="btn" onclick="restart()">🔄 Nouvelle transaction</button>
      </div>
    </div>

    <!-- Étape 6: Erreur -->
    <div id="error" class="step hidden">
      <div style="font-size: 4rem; color: #ff6b6b; margin-bottom: 1rem;">❌</div>
      <h2>Erreur de transaction</h2>
      <div id="errorMessage" style="margin: 1.5rem 0; padding: 1rem; background: rgba(255,107,107,0.2); border-radius: 8px;"></div>

      <div style="margin-top: 2rem;">
        <button class="btn" onclick="restart()">🔄 Réessayer</button>
      </div>
    </div>
  </div>

  <script>
    // Variables globales
    let currentCard = null;
    let currentStudent = null;
    let currentWallet = null;
    let selectedAmount = 0;
    let websocket = null;
    let nfcConnected = false;
    let selectedKiosk = null;

    // Les 8 bornes de recharge du campus (traçabilité)
    const kiosks = [
      { id: 'BORNE-01', label: 'Bibliothèque centrale' },
      { id: 'BORNE-02', label: 'Restaurant universitaire (RU)' },
      { id: 'BORNE-03', label: 'Hall Bâtiment A' },
      { id: 'BORNE-04', label: 'Hall Bâtiment B' },
      { id: 'BORNE-05', label: 'Faculté des Sciences' },
      { id: 'BORNE-06', label: 'Faculté de Droit' },
      { id: 'BORNE-07', label: 'Résidence universitaire' },
      { id: 'BORNE-08', label: 'Entrée principale / Accueil' }
    ];

    // Génère les boutons de bornes
    function renderKioskList() {
      const list = document.getElementById('kioskList');
      list.innerHTML = kiosks.map(k =>
        '<button class="btn" style="text-align:left;" onclick="chooseKiosk(\\'' + k.id + '\\')">📍 ' + k.label + '</button>'
      ).join('');
    }

    // Sélection d'une borne → passage à l'attente de carte
    function chooseKiosk(id) {
      selectedKiosk = kiosks.find(k => k.id === id);
      document.getElementById('selectedKioskBadge').innerHTML =
        '📍 Borne : <strong>' + selectedKiosk.label + '</strong> ' +
        '<a href="#" onclick="changeKiosk(); return false;" style="color:#fff; text-decoration:underline; font-size:0.85rem; margin-left:0.5rem;">changer</a>';
      showStep('waiting');
    }

    // Revenir à la sélection de borne
    function changeKiosk() {
      selectedKiosk = null;
      showStep('selectKiosk');
    }

    // Mapping PIN par UID
    const pinMap = {
      'a89fb4ef': '1234',
      'b8d4e0ef': '5678',
      'b840cdef': '9999'
    };

    // Connexion WebSocket pour détection automatique des cartes
    function connectWebSocket() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = \`\${protocol}//\${window.location.host}\`;

      console.log('🔗 Connexion WebSocket:', wsUrl);

      websocket = new WebSocket(wsUrl);

      websocket.onopen = () => {
        console.log('✅ WebSocket connecté');
        updateNFCStatus('🟢 Lecteur NFC connecté - En attente de carte', true);

        // Ping périodique pour maintenir la connexion
        setInterval(() => {
          if (websocket.readyState === WebSocket.OPEN) {
            websocket.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000);
      };

      websocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('📨 Événement WebSocket:', data);

          switch (data.type) {
            case 'cardDetected':
              handlePhysicalCard(data.uid, data.cardType);
              break;

            case 'cardRemoved':
              console.log('📤 Carte physique retirée');
              break;

            case 'status':
              if (data.nfcEnabled) {
                updateNFCStatus('🟢 Service NFC actif', true);
              } else {
                updateNFCStatus('🟠 Service NFC désactivé', false);
              }
              break;

            case 'pong':
              // Réponse au ping - connexion OK
              break;
          }
        } catch (error) {
          console.error('❌ Erreur parsing WebSocket:', error);
        }
      };

      websocket.onclose = () => {
        console.log('📡 WebSocket déconnecté');
        updateNFCStatus('🔴 Connexion perdue - Reconnexion...', false);

        // Tentative de reconnexion après 3 secondes
        setTimeout(connectWebSocket, 3000);
      };

      websocket.onerror = (error) => {
        console.error('❌ Erreur WebSocket:', error);
        updateNFCStatus('🔴 Erreur de connexion NFC', false);
      };
    }

    // Mise à jour du statut NFC dans l'interface
    function updateNFCStatus(message, connected) {
      nfcConnected = connected;
      const statusEl = document.getElementById('nfcStatusText');
      if (statusEl) {
        statusEl.textContent = message;
        statusEl.style.color = connected ? '#44ff44' : '#ff6b6b';
      }
    }

    // Gestion des cartes physiques détectées
    async function handlePhysicalCard(uid, cardType) {
      console.log('📱 Carte physique détectée:', uid, cardType);

      // Ne traiter que si on est en attente
      if (currentCard !== null) {
        console.log('⚠️ Transaction déjà en cours, carte ignorée');
        return;
      }

      updateNFCStatus(\`📖 Lecture carte \${uid.substring(0, 8)}...\`, true);

      try {
        const response = await fetch('/api/nfc/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid: uid, readerId: 'acr122u-physical' })
        });

        const data = await response.json();
        console.log('📄 Réponse auth carte physique:', data);

        if (data.success) {
          currentCard = { uid: uid, ...data.data.card };
          currentStudent = data.data.student;
          currentWallet = data.data.wallet;

          updateNFCStatus(\`✅ Carte identifiée: \${currentStudent.prenom}\`, true);

          // Afficher infos étudiant
          document.getElementById('studentInfo').innerHTML = \`
            <h3>\${currentStudent.prenom} \${currentStudent.nom}</h3>
            <p><strong>Matricule:</strong> \${currentStudent.matricule}</p>
            <p><strong>Filière:</strong> \${currentStudent.filiere}</p>
            <p><strong>Niveau:</strong> \${currentStudent.niveau}</p>
          \`;

          showStep('pin');
          document.getElementById('pinInput').focus();

        } else {
          updateNFCStatus('❌ Carte non reconnue', false);
          showError(data.message || 'Carte non reconnue');
          setTimeout(() => {
            updateNFCStatus('🟢 En attente de carte', true);
          }, 3000);
        }

      } catch (error) {
        console.error('💥 Erreur auth carte physique:', error);
        updateNFCStatus('❌ Erreur de connexion', false);
        showError('Erreur de connexion: ' + error.message);
      }
    }

    // Fonction pour afficher une étape
    function showStep(stepName) {
      console.log('📺 Affichage étape:', stepName);

      // Masquer toutes les étapes
      document.querySelectorAll('.step').forEach(step => {
        step.classList.remove('active');
        step.classList.add('hidden');
      });

      // Afficher l'étape demandée
      const targetStep = document.getElementById(stepName);
      if (targetStep) {
        targetStep.classList.remove('hidden');
        targetStep.classList.add('active');
      } else {
        console.error('❌ Étape non trouvée:', stepName);
      }
    }

    // Simulation de carte (boutons de test)
    async function simulateCard(uid, studentName) {
      console.log('🧪 Simulation carte:', uid, studentName);

      try {
        const response = await fetch('/api/nfc/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid: uid, readerId: 'kiosk-test' })
        });

        const data = await response.json();
        console.log('📄 Réponse API:', data);

        if (data.success) {
          currentCard = { uid: uid, ...data.data.card };
          currentStudent = data.data.student;
          currentWallet = data.data.wallet;

          // Afficher infos étudiant
          document.getElementById('studentInfo').innerHTML = \`
            <h3>\${currentStudent.prenom} \${currentStudent.nom}</h3>
            <p><strong>Matricule:</strong> \${currentStudent.matricule}</p>
            <p><strong>Filière:</strong> \${currentStudent.filiere}</p>
            <p><strong>Niveau:</strong> \${currentStudent.niveau}</p>
          \`;

          showStep('pin');
          document.getElementById('pinInput').focus();

        } else {
          showError(data.message || 'Carte non reconnue');
        }

      } catch (error) {
        console.error('💥 Erreur:', error);
        showError('Erreur de connexion: ' + error.message);
      }
    }

    // Validation du PIN via API
    async function validatePin() {
      const pin = document.getElementById('pinInput').value;
      const errorDiv = document.getElementById('pinError');

      if (pin.length !== 4) {
        errorDiv.textContent = 'Le PIN doit contenir 4 chiffres';
        errorDiv.style.display = 'block';
        return;
      }

      console.log('🔐 Validation PIN via API...');

      try {
        const response = await fetch('/api/nfc/validate-pin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid: currentCard.uid,
            pin: pin,
            readerId: 'kiosk-test'
          })
        });

        const data = await response.json();
        console.log('🔑 Réponse validation PIN:', data);

        if (data.success) {
          errorDiv.style.display = 'none';
          console.log('✅ PIN validé côté serveur');

          // Afficher le solde
          document.getElementById('currentBalance').textContent =
            (currentWallet?.balance || 0).toLocaleString('fr-FR');

          showStep('amount');
        } else {
          errorDiv.textContent = data.message || 'PIN incorrect';
          errorDiv.style.display = 'block';
          document.getElementById('pinInput').value = '';
          document.getElementById('pinInput').focus();

          if (data.blocked) {
            setTimeout(() => {
              showError('Carte bloquée après 3 tentatives incorrectes');
            }, 2000);
          }
        }

      } catch (error) {
        console.error('💥 Erreur validation PIN:', error);
        errorDiv.textContent = 'Erreur de connexion';
        errorDiv.style.display = 'block';
      }
    }

    // Sélection du montant
    function selectAmount(amount) {
      selectedAmount = amount;

      // Reset des boutons
      document.querySelectorAll('.amount-btn').forEach(btn => {
        btn.classList.remove('selected');
      });

      // Sélectionner le bouton cliqué
      event.target.classList.add('selected');

      // Activer le bouton confirmer
      const confirmBtn = document.getElementById('confirmBtn');
      confirmBtn.disabled = false;
      confirmBtn.style.opacity = '1';
      confirmBtn.style.cursor = 'pointer';
    }

    // Confirmation de la recharge
    async function confirmRecharge() {
      if (!selectedAmount) {
        alert('Veuillez sélectionner un montant');
        return;
      }

      showStep('processing');

      try {
        const response = await fetch('/api/nfc/recharge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid: currentCard.uid,
            amount: selectedAmount,
            readerId: selectedKiosk ? selectedKiosk.id : 'kiosk-test',
            metadata: {
              kioskId: selectedKiosk ? selectedKiosk.id : 'kiosk-test',
              location: selectedKiosk ? selectedKiosk.label : 'Non précisée'
            }
          })
        });

        const data = await response.json();
        console.log('💰 Réponse recharge:', data);

        if (data.success) {
          showReceipt(data.data.receipt);
          showStep('success');

          // Auto-retour après 20 secondes (laisse le temps de lire/imprimer)
          setTimeout(() => {
            restart();
          }, 20000);
        } else {
          throw new Error(data.message || 'Erreur de recharge');
        }

      } catch (error) {
        console.error('💥 Erreur recharge:', error);
        showError('Erreur: ' + error.message);
      }
    }

    // Remplit le reçu affiché
    function showReceipt(r) {
      if (!r) return;
      document.getElementById('rcNumber').textContent    = r.receiptNumber;
      document.getElementById('rcDate').textContent      = new Date(r.date).toLocaleString('fr-FR');
      document.getElementById('rcKiosk').textContent     = r.location;
      document.getElementById('rcStudent').textContent   = r.studentName;
      document.getElementById('rcMatricule').textContent = r.matricule;
      document.getElementById('rcAmount').textContent    = r.amount.toLocaleString('fr-FR') + ' XOF';
      document.getElementById('rcBefore').textContent    = r.balanceBefore.toLocaleString('fr-FR') + ' XOF';
      document.getElementById('rcAfter').textContent     = r.balanceAfter.toLocaleString('fr-FR') + ' XOF';
    }

    // Impression du reçu
    function printReceipt() {
      const content = document.getElementById('receiptBox').outerHTML;
      const w = window.open('', '', 'width=400,height=600');
      w.document.write('<html><head><title>Reçu Smart Campus</title></head><body>' + content + '</body></html>');
      w.document.close();
      w.print();
    }

    // Affichage d'erreur
    function showError(message) {
      document.getElementById('errorMessage').textContent = message;
      showStep('error');

      // Auto-retour après 5 secondes
      setTimeout(() => {
        restart();
      }, 5000);
    }

    // Redémarrage
    function restart() {
      console.log('🔄 Redémarrage');

      // Reset des variables
      currentCard = null;
      currentStudent = null;
      currentWallet = null;
      selectedAmount = 0;

      // Reset de l'interface
      document.getElementById('pinInput').value = '';
      document.getElementById('pinError').style.display = 'none';

      document.querySelectorAll('.amount-btn').forEach(btn => {
        btn.classList.remove('selected');
      });

      const confirmBtn = document.getElementById('confirmBtn');
      confirmBtn.disabled = true;
      confirmBtn.style.opacity = '0.5';
      confirmBtn.style.cursor = 'not-allowed';

      // Remettre le statut NFC en attente
      if (nfcConnected) {
        updateNFCStatus('🟢 En attente de carte', true);
      }

      // Revenir à l'attente de carte si une borne est déjà choisie,
      // sinon redemander la sélection de borne
      showStep(selectedKiosk ? 'waiting' : 'selectKiosk');
    }

    // Initialisation au chargement de la page
    document.addEventListener('DOMContentLoaded', () => {
      console.log('🎯 Initialisation kiosque NFC');

      // Générer la liste des bornes
      renderKioskList();

      // Connexion WebSocket pour détection automatique
      connectWebSocket();

      // Auto-submit PIN sur 4 chiffres
      document.getElementById('pinInput').addEventListener('input', function() {
        if (this.value.length === 4) {
          setTimeout(validatePin, 200);
        }
      });

      console.log('✅ Kiosque NFC prêt');
    });
  </script>
</body>
</html>
  `);
});

// Route pour le kiosque NFC complet (version corrigée)
app.get("/kiosk", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Kiosque NFC - Smart Campus</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; background: linear-gradient(135deg, #667eea, #764ba2); min-height: 100vh; color: white; }
    .container { max-width: 600px; margin: 2rem auto; padding: 2rem; background: rgba(255,255,255,0.1); border-radius: 20px; text-align: center; }
    .title { font-size: 2rem; margin-bottom: 1rem; }
    .step { background: rgba(255,255,255,0.1); padding: 2rem; margin: 1rem 0; border-radius: 15px; }
    .hidden { display: none; }
    .btn { background: rgba(255,255,255,0.2); border: 2px solid rgba(255,255,255,0.5); color: white; padding: 1rem 2rem; border-radius: 10px; font-size: 1.1rem; cursor: pointer; margin: 0.5rem; }
    .btn:hover { background: rgba(255,255,255,0.3); }
    .input { background: rgba(255,255,255,0.9); border: none; padding: 1rem; font-size: 1.5rem; text-align: center; border-radius: 10px; margin: 1rem; color: #333; }
    .status { display: inline-flex; align-items: center; gap: 0.5rem; background: rgba(255,255,255,0.2); padding: 0.5rem 1rem; border-radius: 25px; margin: 1rem 0; }
    .indicator { width: 12px; height: 12px; border-radius: 50%; background: #ff4444; animation: pulse 2s infinite; }
    .indicator.connected { background: #44ff44; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
    .card-icon { font-size: 4rem; margin: 1rem 0; animation: bounce 2s infinite; }
    @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="container">
    <h1 class="title">🏫 Smart Campus - Kiosque NFC</h1>

    <div class="status">
      <span class="indicator connected"></span>
      <span>Lecteur ACR122U connecté</span>
    </div>

    <div id="step-waiting" class="step">
      <div class="card-icon">💳</div>
      <h2>Approchez votre carte NFC</h2>
      <p>Placez votre carte près du lecteur ACR122U</p>
      <button class="btn" onclick="testCard('a89fb4ef')">Test Carte 1 (Jean)</button>
      <button class="btn" onclick="testCard('b8d4e0ef')">Test Carte 2 (Marie)</button>
      <button class="btn" onclick="testCard('b840cdef')">Test Carte 3 (Admin)</button>
    </div>

    <div id="step-pin" class="step hidden">
      <h2>🔐 Saisissez votre PIN</h2>
      <div id="studentInfo"></div>
      <input type="password" id="pinInput" class="input" placeholder="••••" maxlength="4">
      <div>
        <button class="btn" onclick="validatePin()">Valider</button>
        <button class="btn" onclick="cancel()">Annuler</button>
      </div>
      <div id="pinError" style="color: #ff6b6b; margin-top: 1rem;"></div>
    </div>

    <div id="step-amount" class="step hidden">
      <h2>💰 Choisissez le montant</h2>
      <div id="currentBalance" style="font-size: 2rem; margin: 1rem 0;"></div>
      <div>
        <button class="btn" onclick="selectAmount(1000)">1 000 XOF</button>
        <button class="btn" onclick="selectAmount(2000)">2 000 XOF</button>
        <button class="btn" onclick="selectAmount(5000)">5 000 XOF</button>
      </div>
      <div>
        <button class="btn" onclick="processRecharge()">Confirmer</button>
        <button class="btn" onclick="cancel()">Annuler</button>
      </div>
    </div>

    <div id="step-processing" class="step hidden">
      <div style="font-size: 4rem; animation: spin 1s linear infinite;">⏳</div>
      <h2>Traitement en cours...</h2>
      <p>Veuillez patienter</p>
    </div>

    <div id="step-success" class="step hidden">
      <div style="font-size: 4rem; color: #44ff44;">✅</div>
      <h2>Recharge Réussie !</h2>
      <div id="newBalance" style="font-size: 2rem; margin: 1rem 0;"></div>
      <button class="btn" onclick="restart()">Nouvelle Transaction</button>
    </div>

    <div id="step-error" class="step hidden">
      <div style="font-size: 4rem; color: #ff6b6b;">❌</div>
      <h2>Erreur</h2>
      <div id="errorMsg"></div>
      <button class="btn" onclick="restart()">Réessayer</button>
    </div>
  </div>

  <script>
    let currentCard = null;
    let selectedAmount = 0;

    async function testCard(uid) {
      try {
        const response = await fetch('/api/nfc/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid, readerId: 'kiosk-test' })
        });
        const data = await response.json();

        if (data.success) {
          currentCard = { uid, ...data.data };
          document.getElementById('studentInfo').innerHTML =
            '<h3>' + data.data.student.prenom + ' ' + data.data.student.nom + '</h3>' +
            '<p>Matricule: ' + data.data.student.matricule + '</p>';
          showStep('step-pin');
          document.getElementById('pinInput').focus();
        } else {
          showError(data.message);
        }
      } catch (error) {
        showError('Erreur de connexion: ' + error.message);
      }
    }

    async function validatePin() {
      const pin = document.getElementById('pinInput').value;
      if (pin.length !== 4) {
        document.getElementById('pinError').textContent = 'PIN doit contenir 4 chiffres';
        return;
      }

      const pinMap = { 'a89fb4ef': '1234', 'b8d4e0ef': '5678', 'b840cdef': '9999' };

      if (pin === pinMap[currentCard.uid]) {
        document.getElementById('currentBalance').textContent =
          'Solde: ' + (currentCard.wallet?.balance || 0).toLocaleString() + ' XOF';
        showStep('step-amount');
      } else {
        document.getElementById('pinError').textContent = 'PIN incorrect';
        document.getElementById('pinInput').value = '';
      }
    }

    function selectAmount(amount) {
      selectedAmount = amount;
      document.querySelectorAll('.btn').forEach(b => b.style.background = 'rgba(255,255,255,0.2)');
      event.target.style.background = 'rgba(255,255,255,0.4)';
    }

    async function processRecharge() {
      if (!selectedAmount) {
        alert('Sélectionnez un montant');
        return;
      }

      try {
        showStep('step-processing');
        const response = await fetch('/api/nfc/recharge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            uid: currentCard.uid,
            amount: selectedAmount,
            readerId: 'kiosk-test'
          })
        });
        const data = await response.json();

        if (data.success) {
          document.getElementById('newBalance').textContent =
            'Nouveau solde: ' + data.data.wallet.balance.toLocaleString() + ' XOF';
          showStep('step-success');
        } else {
          showError(data.message);
        }
      } catch (error) {
        showError('Erreur: ' + error.message);
      }
    }

    function showStep(stepId) {
      document.querySelectorAll('.step').forEach(s => s.classList.add('hidden'));
      const targetStep = document.getElementById(stepId);
      if (targetStep) {
        targetStep.classList.remove('hidden');
      } else {
        console.error('Élément non trouvé:', stepId);
      }
    }

    function showError(msg) {
      const errorMsgEl = document.getElementById('errorMsg');
      if (errorMsgEl) {
        errorMsgEl.textContent = msg;
      }
      showStep('step-error');
    }

    function cancel() { restart(); }

    function restart() {
      currentCard = null;
      selectedAmount = 0;
      const pinInput = document.getElementById('pinInput');
      const pinError = document.getElementById('pinError');
      if (pinInput) pinInput.value = '';
      if (pinError) pinError.textContent = '';
      showStep('step-waiting');
    }
  </script>
</body>
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
      nfcService = new NFCService();
      await nfcService.initialize();
      setNFCService(nfcService);

      // Écouter les événements NFC et les diffuser via WebSocket
      nfcService.on('cardRead', (cardData) => {
        console.log('📤 Diffusion événement carte via WebSocket:', cardData.uid);

        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              type: 'cardDetected',
              uid: cardData.uid,
              cardType: cardData.type,
              timestamp: cardData.timestamp
            }));
          }
        });
      });

      nfcService.on('cardRemoved', (cardData) => {
        console.log('📤 Diffusion carte retirée via WebSocket');

        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({
              type: 'cardRemoved',
              uid: cardData.uid,
              timestamp: Date.now()
            }));
          }
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