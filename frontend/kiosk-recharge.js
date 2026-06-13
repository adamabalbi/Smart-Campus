const API = (window.SMART_CAMPUS_CONFIG && window.SMART_CAMPUS_CONFIG.API_BASE_URL) || "http://localhost:5000/api";

// État de la session
let currentStep = 1;
let sessionData = {
  uid: '',
  pin: '',
  amount: 0,
  wallet: null,
  card: null,
  student: null,
  transaction: null
};

// Utilitaires
function formatCurrency(amount) {
  return new Intl.NumberFormat('fr-FR').format(amount) + ' XOF';
}

function formatDateTime(date) {
  return new Date(date).toLocaleString('fr-FR');
}

function showError(stepId, message) {
  const errorEl = document.getElementById(`${stepId}Error`);
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.style.display = 'block';
  }
}

function hideError(stepId) {
  const errorEl = document.getElementById(`${stepId}Error`);
  if (errorEl) {
    errorEl.style.display = 'none';
  }
}

function showStep(stepNumber) {
  document.querySelectorAll('.kiosk-step').forEach(step => {
    step.classList.remove('active');
  });

  const targetStep = document.getElementById(`step-${getStepName(stepNumber)}`);
  if (targetStep) {
    targetStep.classList.add('active');
    currentStep = stepNumber;
  }
}

function getStepName(stepNumber) {
  const stepNames = {
    1: 'card',
    2: 'pin',
    3: 'amount',
    4: 'confirm',
    5: 'success'
  };
  return stepNames[stepNumber] || 'card';
}

async function apiCall(path, opts = {}) {
  try {
    const res = await fetch(`${API}${path}`, {
      ...opts,
      headers: {
        "Content-Type": "application/json",
        ...(opts.headers || {}),
      },
    });
    const data = await res.json();
    return { ok: res.ok, data };
  } catch (error) {
    console.error("Erreur API:", error);
    return { ok: false, data: { message: "Erreur de connexion" } };
  }
}

// =============================================================
// ÉTAPE 1: PRÉSENTATION DE LA CARTE
// =============================================================

document.getElementById('validateCardBtn').addEventListener('click', async () => {
  const uid = document.getElementById('cardUIDInput').value.trim().toUpperCase();

  if (!uid) {
    showError('card', 'Veuillez saisir l\'UID de votre carte');
    return;
  }

  hideError('card');

  const btn = document.getElementById('validateCardBtn');
  btn.disabled = true;
  btn.textContent = 'Vérification...';

  const { ok, data } = await apiCall(`/wallets/card/${uid}`);

  btn.disabled = false;
  btn.textContent = 'Valider';

  if (!ok) {
    showError('card', data.message || 'Carte introuvable');
    return;
  }

  // Vérifications supplémentaires
  if (data.card.status !== 'active') {
    showError('card', 'Carte inactive. Contactez le service étudiant.');
    return;
  }

  if (data.wallet.status !== 'active') {
    showError('card', 'Portefeuille suspendu. Contactez le service étudiant.');
    return;
  }

  // Enregistrer les données
  sessionData.uid = uid;
  sessionData.wallet = data.wallet;
  sessionData.card = data.card;
  sessionData.student = data.wallet.studentId;

  // Afficher les informations de l'étudiant à l'étape PIN
  document.getElementById('studentInfo').innerHTML = `
    <div style="background: #f8f9fa; padding: 1rem; border-radius: 8px; text-align: center;">
      <strong>${sessionData.student.prenom} ${sessionData.student.nom}</strong><br>
      <span style="color: var(--muted);">${sessionData.student.matricule}</span><br>
      <span style="color: var(--success); font-weight: 600;">
        Solde actuel: ${formatCurrency(sessionData.wallet.balance)}
      </span>
    </div>
  `;

  showStep(2);
  document.getElementById('pinInput').focus();
});

// Validation automatique UID avec Enter
document.getElementById('cardUIDInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    document.getElementById('validateCardBtn').click();
  }
});

// =============================================================
// ÉTAPE 2: SAISIE DU PIN
// =============================================================

document.getElementById('validatePinBtn').addEventListener('click', async () => {
  const pin = document.getElementById('pinInput').value.trim();

  if (!pin || pin.length < 4) {
    showError('pin', 'Code PIN invalide (4-6 chiffres requis)');
    return;
  }

  hideError('pin');
  sessionData.pin = pin;

  // Afficher les informations de solde à l'étape montant
  document.getElementById('balanceInfo').innerHTML = `
    <div style="background: #f8f9fa; padding: 1rem; border-radius: 8px;">
      <div style="text-align: center;">
        <strong>Solde actuel: ${formatCurrency(sessionData.wallet.balance)}</strong>
      </div>
    </div>
  `;

  showStep(3);
});

document.getElementById('backToPinBtn').addEventListener('click', () => {
  showStep(1);
  document.getElementById('cardUIDInput').focus();
});

// Validation automatique PIN avec Enter
document.getElementById('pinInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    document.getElementById('validatePinBtn').click();
  }
});

// =============================================================
// ÉTAPE 3: CHOIX DU MONTANT
// =============================================================

let selectedAmount = 0;

// Boutons de montant prédéfinis
document.querySelectorAll('.amount-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    // Désélectionner tous les boutons
    document.querySelectorAll('.amount-btn').forEach(b => b.classList.remove('selected'));
    // Sélectionner le bouton cliqué
    btn.classList.add('selected');

    selectedAmount = parseInt(btn.dataset.amount);
    document.getElementById('customAmount').value = '';

    updateContinueButton();
  });
});

// Montant personnalisé
document.getElementById('customAmount').addEventListener('input', (e) => {
  const amount = parseInt(e.target.value) || 0;

  // Désélectionner les boutons prédéfinis
  document.querySelectorAll('.amount-btn').forEach(b => b.classList.remove('selected'));

  selectedAmount = amount;
  updateContinueButton();
});

function updateContinueButton() {
  const continueBtn = document.getElementById('continueToConfirmBtn');
  const isValid = selectedAmount >= 100 && selectedAmount <= 100000;

  continueBtn.disabled = !isValid;

  if (selectedAmount > 0 && selectedAmount < 100) {
    showError('amount', 'Montant minimum: 100 XOF');
  } else if (selectedAmount > 100000) {
    showError('amount', 'Montant maximum: 100,000 XOF');
  } else {
    hideError('amount');
  }
}

document.getElementById('continueToConfirmBtn').addEventListener('click', () => {
  if (selectedAmount >= 100 && selectedAmount <= 100000) {
    sessionData.amount = selectedAmount;

    // Afficher les informations de confirmation
    const currentBalance = sessionData.wallet.balance;
    const newBalance = currentBalance + selectedAmount;

    document.getElementById('confirmStudentName').textContent =
      `${sessionData.student.prenom} ${sessionData.student.nom}`;
    document.getElementById('confirmCurrentBalance').textContent =
      formatCurrency(currentBalance);
    document.getElementById('confirmAmount').textContent =
      formatCurrency(selectedAmount);
    document.getElementById('confirmNewBalance').textContent =
      formatCurrency(newBalance);

    showStep(4);
  }
});

document.getElementById('backToAmountBtn').addEventListener('click', () => {
  showStep(2);
  document.getElementById('pinInput').focus();
});

// =============================================================
// ÉTAPE 4: CONFIRMATION
// =============================================================

document.getElementById('processRechargeBtn').addEventListener('click', async () => {
  hideError('confirm');

  const btn = document.getElementById('processRechargeBtn');
  btn.disabled = true;
  btn.textContent = 'Traitement en cours...';

  const { ok, data } = await apiCall('/wallets/recharge/kiosk', {
    method: 'POST',
    body: JSON.stringify({
      uid: sessionData.uid,
      amount: sessionData.amount,
      pin: sessionData.pin
    })
  });

  btn.disabled = false;
  btn.textContent = 'Procéder au paiement';

  if (!ok) {
    showError('confirm', data.message || 'Erreur lors de la recharge');
    return;
  }

  // Enregistrer les données de la transaction
  sessionData.transaction = data.transaction;
  sessionData.wallet = data.wallet;

  // Afficher les informations de succès
  document.getElementById('successTransactionId').textContent =
    sessionData.transaction.id.slice(-8); // Afficher seulement les 8 derniers caractères
  document.getElementById('successDate').textContent =
    formatDateTime(sessionData.transaction.createdAt);
  document.getElementById('successStudentName').textContent =
    `${sessionData.student.prenom} ${sessionData.student.nom}`;
  document.getElementById('successAmount').textContent =
    formatCurrency(sessionData.transaction.amount);
  document.getElementById('successNewBalance').textContent =
    formatCurrency(sessionData.transaction.balanceAfter);

  showStep(5);
});

document.getElementById('backToConfirmBtn').addEventListener('click', () => {
  showStep(3);
});

// =============================================================
// ÉTAPE 5: SUCCÈS
// =============================================================

document.getElementById('printReceiptBtn').addEventListener('click', () => {
  window.print();
});

document.getElementById('newTransactionBtn').addEventListener('click', () => {
  resetSession();
});

// =============================================================
// UTILITAIRES
// =============================================================

function resetSession() {
  // Réinitialiser les données de session
  sessionData = {
    uid: '',
    pin: '',
    amount: 0,
    wallet: null,
    card: null,
    student: null,
    transaction: null
  };

  selectedAmount = 0;

  // Réinitialiser les champs
  document.getElementById('cardUIDInput').value = '';
  document.getElementById('pinInput').value = '';
  document.getElementById('customAmount').value = '';

  // Désélectionner les boutons de montant
  document.querySelectorAll('.amount-btn').forEach(b => b.classList.remove('selected'));

  // Masquer toutes les erreurs
  ['card', 'pin', 'amount', 'confirm'].forEach(step => hideError(step));

  // Retourner à la première étape
  showStep(1);
  document.getElementById('cardUIDInput').focus();
}

// Auto-timeout après 2 minutes d'inactivité
let inactivityTimer;

function resetInactivityTimer() {
  clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(() => {
    alert('Session expirée par inactivité. Retour à l\'écran d\'accueil.');
    resetSession();
  }, 2 * 60 * 1000); // 2 minutes
}

// Réinitialiser le timer à chaque interaction
['click', 'keypress', 'input'].forEach(event => {
  document.addEventListener(event, resetInactivityTimer);
});

// Initialisation
resetInactivityTimer();
document.getElementById('cardUIDInput').focus();