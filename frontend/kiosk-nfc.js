const API = (window.SMART_CAMPUS_CONFIG && window.SMART_CAMPUS_CONFIG.API_BASE_URL) || "http://localhost:5000/api";

// Variables globales du kiosque
let currentCard = null;
let currentStudent = null;
let currentWallet = null;
let selectedAmount = 0;
let readerConnected = false;
let transactionInProgress = false;

// État de l'interface
let currentStep = 'waiting';

// Initialisation du kiosque
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🏪 Initialisation du kiosque NFC...');
  await checkReaderStatus();
  startCardDetection();
});

// Vérification du statut du lecteur NFC
async function checkReaderStatus() {
  try {
    const response = await fetch(`${API}/nfc/readers/status`);
    const data = await response.json();

    if (data.success && data.data.serviceStatus === 'running') {
      updateReaderStatus(true, `${data.data.readersCount} lecteur(s) connecté(s)`);
    } else {
      updateReaderStatus(false, 'Service NFC indisponible');
    }
  } catch (error) {
    console.error('Erreur vérification lecteur:', error);
    updateReaderStatus(false, 'Erreur de connexion');
  }
}

// Mise à jour du statut du lecteur dans l'UI
function updateReaderStatus(connected, message) {
  readerConnected = connected;
  const indicator = document.getElementById('readerStatus');
  const text = document.getElementById('readerStatusText');

  indicator.className = `status-indicator ${connected ? 'connected' : ''}`;
  text.textContent = message;
}

// Simulation de détection de carte (à remplacer par vraie intégration)
function startCardDetection() {
  // Pour test : simulation d'une carte toutes les 30 secondes
  console.log('👀 Surveillance des cartes activée');

  // En production, ceci sera remplacé par les événements du service NFC
  // Exemple d'intégration WebSocket :
  /*
  const ws = new WebSocket('ws://localhost:3001');
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'cardDetected') {
      handleCardDetected(data.uid);
    }
  };
  */

  // Pour démo : bouton de test
  if (location.hostname === 'localhost') {
    addTestButton();
  }
}

// Bouton de test pour développement
function addTestButton() {
  const testBtn = document.createElement('button');
  testBtn.textContent = '🧪 Test Carte (Dev)';
  testBtn.className = 'kiosk-btn';
  testBtn.style.position = 'fixed';
  testBtn.style.top = '20px';
  testBtn.style.right = '20px';
  testBtn.style.zIndex = '1000';
  testBtn.onclick = () => handleCardDetected('1234567890ABCDEF'); // UID de test
  document.body.appendChild(testBtn);
}

// Gestion de la détection d'une carte
async function handleCardDetected(uid) {
  if (transactionInProgress) {
    console.log('⚠️ Transaction en cours, carte ignorée');
    return;
  }

  console.log('📱 Carte détectée:', uid);

  try {
    // Authentification de la carte
    const response = await fetch(`${API}/nfc/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: uid,
        readerId: 'kiosk-001' // ID du kiosque
      })
    });

    const data = await response.json();

    if (data.success) {
      currentCard = data.data.card;
      currentStudent = data.data.student;
      currentWallet = data.data.wallet;

      if (currentCard.pinRequired) {
        showPinStep();
      } else {
        showAmountStep();
      }
    } else {
      showError(data.message || 'Carte non reconnue');
    }

  } catch (error) {
    console.error('Erreur authentification carte:', error);
    showError('Erreur de connexion au serveur');
  }
}

// Affichage de l'étape validation PIN
function showPinStep() {
  console.log('🔐 Affichage étape PIN');
  transactionInProgress = true;
  currentStep = 'pin';

  // Mise à jour des informations étudiant
  const studentInfo = document.getElementById('studentInfo');
  studentInfo.innerHTML = `
    <h3>${currentStudent.prenom} ${currentStudent.nom}</h3>
    <p><strong>Matricule:</strong> ${currentStudent.matricule}</p>
    <p><strong>Filière:</strong> ${currentStudent.filiere}</p>
    <p><strong>Niveau:</strong> ${currentStudent.niveau}</p>
  `;

  showStep('step-pin');
  document.getElementById('pinInput').focus();

  // Auto-submit sur 4 chiffres
  const pinInput = document.getElementById('pinInput');
  pinInput.oninput = function() {
    if (this.value.length === 4) {
      setTimeout(validatePin, 100); // Petit délai pour UX
    }
  };
}

// Validation du PIN
async function validatePin() {
  const pin = document.getElementById('pinInput').value;

  if (pin.length !== 4) {
    showPinError('PIN doit contenir 4 chiffres');
    return;
  }

  try {
    const response = await fetch(`${API}/nfc/validate-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: currentCard.uid || '1234567890ABCDEF', // UID depuis l'auth
        pin: pin,
        readerId: 'kiosk-001'
      })
    });

    const data = await response.json();

    if (data.success) {
      clearPinError();
      showAmountStep();
    } else {
      showPinError(data.message || 'PIN incorrect');
      document.getElementById('pinInput').value = '';
      document.getElementById('pinInput').focus();

      if (data.blocked) {
        setTimeout(() => {
          showError('Carte bloquée après 3 tentatives incorrectes');
        }, 2000);
      }
    }

  } catch (error) {
    console.error('Erreur validation PIN:', error);
    showPinError('Erreur de connexion');
  }
}

// Affichage des erreurs PIN
function showPinError(message) {
  const errorEl = document.getElementById('pinError');
  errorEl.textContent = message;
  errorEl.classList.remove('hidden');
}

function clearPinError() {
  const errorEl = document.getElementById('pinError');
  errorEl.classList.add('hidden');
}

// Affichage de l'étape choix montant
function showAmountStep() {
  console.log('💰 Affichage étape montant');
  currentStep = 'amount';

  // Affichage du solde actuel
  const balance = currentWallet ? currentWallet.balance : 0;
  document.getElementById('currentBalance').textContent = balance.toLocaleString('fr-FR');

  showStep('step-amount');
}

// Sélection d'un montant prédéfini
function selectAmount(amount) {
  selectedAmount = amount;
  document.getElementById('customAmount').value = '';

  // Feedback visuel
  document.querySelectorAll('.kiosk-btn').forEach(btn => {
    btn.style.background = 'rgba(255,255,255,0.2)';
  });

  event.target.style.background = 'rgba(255,255,255,0.4)';
}

// Confirmation du montant
function confirmAmount() {
  // Vérifier montant custom si pas de sélection
  if (!selectedAmount) {
    const customAmount = parseInt(document.getElementById('customAmount').value);
    if (customAmount && customAmount >= 100 && customAmount <= 50000) {
      selectedAmount = customAmount;
    } else {
      alert('Veuillez sélectionner ou saisir un montant valide (100-50000 XOF)');
      return;
    }
  }

  processRecharge();
}

// Traitement de la recharge
async function processRecharge() {
  console.log(`💳 Traitement recharge: ${selectedAmount} XOF`);
  showStep('step-processing');

  try {
    const response = await fetch(`${API}/nfc/recharge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid: currentCard.uid || '1234567890ABCDEF',
        amount: selectedAmount,
        readerId: 'kiosk-001',
        metadata: {
          kioskId: 'kiosk-001',
          location: 'Hall principal'
        }
      })
    });

    const data = await response.json();

    if (data.success) {
      // Succès
      const newBalance = data.data.wallet.balance;
      document.getElementById('newBalance').textContent = newBalance.toLocaleString('fr-FR');
      showStep('step-success');

      console.log('✅ Recharge réussie');

      // Auto-retour après 10 secondes
      setTimeout(newTransaction, 10000);
    } else {
      throw new Error(data.message || 'Erreur de recharge');
    }

  } catch (error) {
    console.error('Erreur recharge:', error);
    showError(error.message || 'Erreur de connexion au serveur');
  }
}

// Nouvelle transaction
function newTransaction() {
  console.log('🔄 Nouvelle transaction');

  // Reset des variables
  currentCard = null;
  currentStudent = null;
  currentWallet = null;
  selectedAmount = 0;
  transactionInProgress = false;

  // Reset de l'UI
  document.getElementById('pinInput').value = '';
  document.getElementById('customAmount').value = '';
  clearPinError();

  // Retour à l'attente
  currentStep = 'waiting';
  showStep('step-waiting');
}

// Annulation de transaction
function cancelTransaction() {
  console.log('❌ Transaction annulée');
  newTransaction();
}

// Affichage d'une erreur
function showError(message) {
  console.error('💥 Erreur:', message);
  document.getElementById('errorMessage').textContent = message;
  showStep('step-error');

  // Auto-retour après 5 secondes
  setTimeout(newTransaction, 5000);
}

// Gestion de l'affichage des étapes
function showStep(stepId) {
  // Masquer toutes les étapes
  document.querySelectorAll('.step-container').forEach(step => {
    step.classList.add('hidden');
  });

  // Afficher l'étape demandée
  document.getElementById(stepId).classList.remove('hidden');

  console.log(`📺 Affichage: ${stepId}`);
}

// Gestion des raccourcis clavier pour le kiosque
document.addEventListener('keydown', (e) => {
  switch(e.key) {
    case 'Escape':
      if (currentStep !== 'waiting') {
        cancelTransaction();
      }
      break;

    case 'Enter':
      if (currentStep === 'pin') {
        validatePin();
      } else if (currentStep === 'amount') {
        confirmAmount();
      }
      break;

    case 'F5':
      e.preventDefault();
      location.reload(); // Reset complet du kiosque
      break;
  }
});

// Gestion de la perte de réseau
window.addEventListener('online', () => {
  console.log('🌐 Connexion rétablie');
  updateReaderStatus(true, 'Connexion rétablie');
});

window.addEventListener('offline', () => {
  console.log('📡 Connexion perdue');
  updateReaderStatus(false, 'Hors ligne');
});