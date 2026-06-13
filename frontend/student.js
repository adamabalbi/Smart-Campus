const API = (window.SMART_CAMPUS_CONFIG && window.SMART_CAMPUS_CONFIG.API_BASE_URL) || "http://localhost:5000/api";

// ---- Auth guard (student only) ----
const token = localStorage.getItem("token");
const me    = JSON.parse(localStorage.getItem("user") || "null");
if (!token || !me || me.role !== "student") {
  window.location.href = "index.html";
}

// ---- API helper ----
async function req(path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  });
  const data = await res.json();
  if (res.status === 401) { localStorage.clear(); window.location.href = "index.html"; }
  return { ok: res.ok, data };
}

function showMsg(id, text, type = "error") {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = `alert alert-${type}`;
  el.textContent = text;
  el.classList.remove("hidden");
  if (type === "success") setTimeout(() => el.classList.add("hidden"), 4000);
}
function clearMsg(id) {
  const el = document.getElementById(id);
  if (el) { el.classList.add("hidden"); el.textContent = ""; }
}

// ---- Cache des données profil ----
let profileData = null;

// ---- Sidebar ----
document.getElementById("sbName").textContent = `${me.prenom} ${me.nom}`;

// ---- Bannière mot de passe temporaire ----
if (me.mustChangePassword) {
  document.getElementById("pwBanner").classList.remove("hidden");
}

// ---- Tabs ----
document.querySelectorAll(".nav-item[data-tab]").forEach(item => {
  item.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
    item.classList.add("active");
    document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
    document.getElementById(`tab-${item.dataset.tab}`)?.classList.add("active");
    if (item.dataset.tab === "notifications") loadNotifications();
  });
});

// ---- Logout ----
document.getElementById("logoutBtn").addEventListener("click", async () => {
  try { await req("/auth/logout", { method: "POST" }); } catch {}
  localStorage.clear();
  window.location.href = "index.html";
});

// =============================================================
// CHARGEMENT INITIAL
// =============================================================
async function init() {
  const { ok, data } = await req("/student-space/me");
  if (!ok) return;

  profileData = data;
  const { user, student, card, wallet } = data;

  // Sidebar matricule
  document.getElementById("sbMatricule").textContent =
    student?.matricule || "";

  renderSummary(user, student, card, wallet);
  renderProfile(user, student);
  renderWallet(wallet);
  renderCard(card, data.cardApplication);
  renderSecurity(user);
  loadNotifications();
}

// =============================================================
// RÉSUMÉ
// =============================================================
function renderSummary(user, student, card, wallet) {
  const cardStatus = card
    ? `<span class="${card.status === "active" ? "green" : "red"}">${card.status}</span>`
    : `<span class="muted">Non encore créée</span>`;

  document.getElementById("summaryCard").innerHTML = `
    <div class="id-card-head">
      <span class="id-card-inst"><i class="fa-solid fa-building-columns"></i> Smart Campus · Carte Étudiant</span>
      <span class="id-card-chip"></span>
    </div>
    <div class="id-card-identity">
      <div class="id-card-name">${user.prenom} ${user.nom}</div>
      <div class="id-card-matricule">${student?.matricule || "Matricule non attribué"}</div>
    </div>
    <div class="summary-grid">
      <div class="summary-item">
        <span class="label">Email</span>
        <span class="value">${user.email}</span>
      </div>
      <div class="summary-item">
        <span class="label">Filière</span>
        <span class="value">${student?.filiere || "—"}</span>
      </div>
      <div class="summary-item">
        <span class="label">Niveau</span>
        <span class="value">${student?.niveau || "—"}</span>
      </div>
      <div class="summary-item">
        <span class="label">Compte</span>
        <span class="value ${user.status === "active" ? "green" : "red"}">${user.status === "active" ? "Actif" : user.status}</span>
      </div>
      <div class="summary-item">
        <span class="label">Carte</span>
        <span class="value">${cardStatus}</span>
      </div>
      <div class="summary-item">
        <span class="label">Solde</span>
        <span class="value">${wallet ? `${wallet.balance.toLocaleString("fr-FR")} ${wallet.currency}` : "0 XOF"}</span>
      </div>
    </div>`;
}

const na = '<span style="color:var(--muted);font-style:italic">Non renseigné</span>';

// =============================================================
// PROFIL
// =============================================================
function renderProfile(user, student) {
  document.getElementById("profileInfo").innerHTML = `
    <table class="profile-table">
      <tr><td>Nom</td><td>${user.nom}</td></tr>
      <tr><td>Prénom</td><td>${user.prenom}</td></tr>
      <tr><td>Email</td><td>${user.email}</td></tr>
      <tr><td>Téléphone</td><td>${student?.telephone || na}</td></tr>
      <tr><td>Matricule</td><td>${student?.matricule || "—"}</td></tr>
      <tr><td>Filière</td><td>${student?.filiere || "—"}</td></tr>
      <tr><td>Niveau</td><td>${student?.niveau || "—"}</td></tr>
      <tr><td>Département</td><td>${student?.departement || na}</td></tr>
      <tr><td>Statut</td><td>${student?.status === "active" ? "Actif" : student?.status || "—"}</td></tr>
    </table>`;

  document.getElementById("inputTelephone").value = student?.telephone || "";
}

document.getElementById("formTelephone").addEventListener("submit", async (e) => {
  e.preventDefault();
  clearMsg("msgTelephone");
  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;

  const { ok, data } = await req("/student-space/me", {
    method: "PATCH",
    body: JSON.stringify({ telephone: document.getElementById("inputTelephone").value.trim() }),
  });

  if (!ok) {
    showMsg("msgTelephone", data.message);
  } else {
    showMsg("msgTelephone", "Téléphone mis à jour.", "success");
    if (profileData?.student) {
      profileData.student.telephone = data.telephone;
      renderProfile(profileData.user, profileData.student);
      renderSummary(profileData.user, profileData.student, profileData.card, profileData.wallet);
    }
  }
  btn.disabled = false;
});

// =============================================================
// PORTEFEUILLE
// =============================================================
let currentWallet = null;
let currentPage = 1;
const transactionsPerPage = 10;

function renderWallet(wallet) {
  currentWallet = wallet;

  if (wallet) {
    // Afficher le solde
    document.getElementById("walletBalance").textContent =
      `${wallet.balance.toLocaleString("fr-FR")} XOF`;

    const statusEl = document.getElementById("walletStatus");
    statusEl.textContent = wallet.status === "active" ? "Actif" : wallet.status;
    statusEl.className = `balance-status ${wallet.status === "active" ? "active" : "inactive"}`;

    // Afficher les plafonds
    document.getElementById("dailyLimitDisplay").textContent =
      `${(wallet.dailyLimit || 50000).toLocaleString("fr-FR")} XOF`;
    document.getElementById("monthlyLimitDisplay").textContent =
      `${(wallet.monthlyLimit || 500000).toLocaleString("fr-FR")} XOF`;

    // Charger l'historique
    loadTransactionHistory();
  }
}

// Actualiser le solde
document.getElementById("refreshBalanceBtn")?.addEventListener("click", async () => {
  const btn = document.getElementById("refreshBalanceBtn");
  const originalText = btn.textContent;
  btn.textContent = "Actualisation...";
  btn.disabled = true;

  try {
    await loadProfile();
  } finally {
    btn.textContent = originalText;
    btn.disabled = false;
  }
});

// Demande de recharge (placeholder)
document.getElementById("rechargeRequestBtn")?.addEventListener("click", () => {
  alert("Pour recharger votre portefeuille, rendez-vous :\n\n• Auprès d'un agent de paiement\n• À une borne de recharge sur le campus");
});

// Localiser les bornes (placeholder)
document.getElementById("findKioskBtn")?.addEventListener("click", () => {
  alert("Bornes de recharge disponibles :\n\n• Bibliothèque universitaire - Entrée principale\n• Résidence universitaire - Hall central\n• Cafétéria - Près de la caisse\n• Bâtiment administratif - Rez-de-chaussée");
});

// Charger l'historique des transactions
async function loadTransactionHistory(page = 1) {
  const listEl = document.getElementById("transactionsList");

  if (page === 1) {
    listEl.innerHTML = `<div class="state-msg">Chargement de l'historique...</div>`;
  }

  try {
    const typeFilter = document.getElementById("transactionTypeFilter")?.value || "";
    const channelFilter = document.getElementById("transactionChannelFilter")?.value || "";

    let query = `?page=${page}&limit=${transactionsPerPage}`;
    if (typeFilter) query += `&type=${typeFilter}`;
    if (channelFilter) query += `&channel=${channelFilter}`;

    const { ok, data } = await req(`/wallets/${profileData.student._id}/history${query}`);

    if (!ok) {
      listEl.innerHTML = `<div class="state-msg">Erreur lors du chargement de l'historique.</div>`;
      return;
    }

    const transactions = data.transactions || [];

    if (!transactions.length) {
      listEl.innerHTML = `<div class="state-msg">Aucune transaction trouvée.</div>`;
      document.getElementById("transactionsPagination").style.display = "none";
      return;
    }

    // Afficher les transactions
    listEl.innerHTML = transactions.map(t => renderTransactionItem(t)).join("");

    // Afficher la pagination
    renderPagination(data.pagination);

  } catch (error) {
    listEl.innerHTML = `<div class="state-msg">Erreur lors du chargement de l'historique.</div>`;
  }
}

function renderTransactionItem(transaction) {
  const isPositive = ["recharge", "refund"].includes(transaction.type);
  const amountClass = isPositive ? "positive" : "negative";
  const amountPrefix = isPositive ? "+" : "-";

  const typeLabels = {
    recharge: "Recharge",
    payment: "Paiement",
    refund: "Remboursement",
    transfer: "Virement"
  };

  const channelLabels = {
    agent: "Agent de paiement",
    kiosk: "Borne de recharge",
    online: "En ligne",
    api: "Système"
  };

  // Libellés des services de paiement (clé technique nom affiché)
  const serviceLabels = {
    cantine: "Cantine",
    bibliotheque: "Bibliothèque",
    imprimerie: "Imprimerie"
  };

  // Pour un paiement, afficher le nom du service plutôt que le canal technique
  const serviceName = transaction.metadata?.serviceLabel
    || serviceLabels[transaction.metadata?.service]
    || null;
  const sourceLabel = (transaction.type === "payment" && serviceName)
    ? serviceName
    : (channelLabels[transaction.channel] || transaction.channel);

  return `
    <div class="transaction-item">
      <div class="transaction-info">
        <div class="transaction-title">${typeLabels[transaction.type] || transaction.type}</div>
        <div class="transaction-details">
          ${sourceLabel}
          ${transaction.description ? ` • ${transaction.description}` : ""}
        </div>
      </div>
      <div class="transaction-amount">
        <div class="amount ${amountClass}">
          ${amountPrefix}${transaction.amount.toLocaleString("fr-FR")} XOF
        </div>
        <div class="date">${new Date(transaction.createdAt).toLocaleDateString("fr-FR")}</div>
      </div>
    </div>
  `;
}

function renderPagination(pagination) {
  const paginationEl = document.getElementById("transactionsPagination");

  if (!pagination || pagination.pages <= 1) {
    paginationEl.style.display = "none";
    return;
  }

  document.getElementById("pageInfo").textContent =
    `Page ${pagination.page} sur ${pagination.pages}`;

  document.getElementById("prevPageBtn").disabled = pagination.page <= 1;
  document.getElementById("nextPageBtn").disabled = pagination.page >= pagination.pages;

  paginationEl.style.display = "flex";
}

// Gestionnaires de pagination
document.getElementById("prevPageBtn")?.addEventListener("click", () => {
  if (currentPage > 1) {
    currentPage--;
    loadTransactionHistory(currentPage);
  }
});

document.getElementById("nextPageBtn")?.addEventListener("click", () => {
  currentPage++;
  loadTransactionHistory(currentPage);
});

// Filtres de transactions
document.getElementById("filterTransactionsBtn")?.addEventListener("click", () => {
  currentPage = 1;
  loadTransactionHistory(1);
});

// Auto-filtrage quand les sélections changent
["transactionTypeFilter", "transactionChannelFilter"].forEach(filterId => {
  document.getElementById(filterId)?.addEventListener("change", () => {
    currentPage = 1;
    loadTransactionHistory(1);
  });
});

// =============================================================
// CARTE
// =============================================================
function renderCard(card, cardApplication) {
  const el = document.getElementById("cardContent");

  if (!card) {
    // ── Demande en cours ──────────────────────────────────────────────────
    if (cardApplication && cardApplication.status === "pending") {
      el.innerHTML = `
        <div class="card-placeholder">
          <div class="icon"></div>
          <h3>Inscription en cours de traitement</h3>
          <p>Votre dossier d'inscription a été soumis le <strong>${new Date(cardApplication.createdAt).toLocaleDateString("fr-FR")}</strong>.<br>
          Le service de la scolarité va examiner votre inscription. Vous recevrez un email dès qu'elle sera validée.</p>
        </div>`;
      return;
    }

    if (cardApplication && cardApplication.status === "rejected") {
      el.innerHTML = `
        <div class="card-placeholder" style="border-color:#fecaca">
          <div class="icon"></div>
          <h3>Inscription refusée</h3>
          <p>${cardApplication.rejectionReason || "Contactez le service de la scolarité pour plus d'informations."}</p>
        </div>`;
      return;
    }

    // ── Formulaire d'inscription scolarité ────────────────────────────────
    el.innerHTML = `
      <div class="card-placeholder" style="margin-bottom:1.25rem">
        <div class="icon"><i class="fa-solid fa-user-graduate"></i></div>
        <h3>Inscription au service de scolarité</h3>
        <p>Votre compte a été validé. Complétez ce formulaire pour finaliser votre inscription et obtenir votre carte étudiant.</p>
      </div>

      <div class="card" style="max-width:500px">
        <div class="card-title">Informations académiques</div>

        <div style="background:var(--bg);border-radius:6px;padding:.75rem;margin-bottom:1rem;font-size:13px">
          <div><strong>Matricule :</strong> ${profileData?.student?.matricule || "—"}</div>
          <div><strong>Filière :</strong> ${profileData?.student?.filiere || "—"}</div>
          <div><strong>Niveau :</strong> ${profileData?.student?.niveau || "—"}</div>
          <div><strong>Département :</strong> ${profileData?.student?.departement || "Non renseigné"}</div>
        </div>

        <form id="formCardApplication">
          <div class="field">
            <label>Année académique <span style="color:var(--danger)">*</span></label>
            <select id="caAnnee" required>
              <option value="">Sélectionner...</option>
              <option value="2024-2025">2024-2025</option>
              <option value="2025-2026">2025-2026</option>
              <option value="2026-2027">2026-2027</option>
            </select>
          </div>
          <div class="field">
            <label>URL de la photo (optionnel)</label>
            <input type="url" id="caPhoto" placeholder="https://...">
          </div>
          <div class="field">
            <label>Notes / informations complémentaires</label>
            <input type="text" id="caNotes" placeholder="Ex: étudiant en échange international">
          </div>
          <div id="msgCardApp"></div>
          <button type="submit">Soumettre mon dossier d'inscription</button>
        </form>
      </div>`;

    document.getElementById("formCardApplication").addEventListener("submit", async (e) => {
      e.preventDefault();
      const msgEl = document.getElementById("msgCardApp");
      msgEl.className = "alert alert-error hidden";
      const btn = e.target.querySelector("button[type=submit]");
      btn.disabled = true;

      const { ok, data } = await req("/student-space/card-application", {
        method: "POST",
        body: JSON.stringify({
          anneeAcademique: document.getElementById("caAnnee").value,
          photoUrl:        document.getElementById("caPhoto").value.trim() || null,
          notes:           document.getElementById("caNotes").value.trim() || null,
        }),
      });

      if (!ok) {
        msgEl.textContent = data.message;
        msgEl.className   = "alert alert-error";
        btn.disabled = false;
      } else {
        const { ok: ok2, data: d2 } = await req("/student-space/me");
        if (ok2) {
          profileData = d2;
          renderCard(d2.card, d2.cardApplication);
          loadNotifications();
        }
      }
    });
    return;
  }

  const pinBanner = card.mustChangePIN
    ? `<div class="banner" style="margin-bottom:1rem">
        Vous devez changer votre PIN temporaire avant d'utiliser votre carte.
       </div>`
    : "";

  el.innerHTML = `
    ${pinBanner}
    <div class="card-info" style="margin-bottom:1.25rem">
      <table class="profile-table">
        <tr><td>Numéro de carte</td><td><strong>${card.cardNumber}</strong></td></tr>
        <tr><td>UID</td><td><code>${card.uid}</code></td></tr>
        <tr><td>Type</td><td>${card.type}</td></tr>
        <tr><td>Statut</td><td>${card.status === "active" ? "Active" : card.status}</td></tr>
        <tr><td>PIN temporaire</td><td>${card.mustChangePIN ? "À changer" : "Modifié"}</td></tr>
        <tr><td>Émise le</td><td>${new Date(card.issuedAt).toLocaleDateString("fr-FR")}</td></tr>
        <tr><td>Expire le</td><td>${card.expiresAt ? new Date(card.expiresAt).toLocaleDateString("fr-FR") : "Non définie"}</td></tr>
      </table>
    </div>

    <div class="card" style="max-width:420px">
      <div class="card-title">${card.mustChangePIN ? "Changer mon PIN (obligatoire)" : "Changer mon PIN"}</div>
      <form id="formChangePIN">
        <div class="field">
          <label>PIN actuel</label>
          <input type="password" id="pinCurrent" maxlength="6" inputmode="numeric" required placeholder="PIN reçu par email">
        </div>
        <div class="field">
          <label>Nouveau PIN (4–6 chiffres)</label>
          <input type="password" id="pinNew" maxlength="6" inputmode="numeric" required placeholder="Votre choix">
        </div>
        <div id="msgChangePIN"></div>
        <button type="submit">Modifier le PIN</button>
      </form>
    </div>`;

  document.getElementById("formChangePIN").addEventListener("submit", async (e) => {
    e.preventDefault();
    const msgEl = document.getElementById("msgChangePIN");
    msgEl.className = "alert alert-error hidden";
    const btn = e.target.querySelector("button[type=submit]");
    btn.disabled = true;

    const { ok, data } = await req("/student-space/change-pin", {
      method: "PATCH",
      body: JSON.stringify({
        currentPin: document.getElementById("pinCurrent").value,
        newPin:     document.getElementById("pinNew").value,
      }),
    });

    if (!ok) {
      msgEl.textContent = data.message;
      msgEl.className   = "alert alert-error";
    } else {
      msgEl.textContent = "PIN modifié avec succès.";
      msgEl.className   = "alert alert-success";
      e.target.reset();
      // Recharge le profil pour mettre à jour mustChangePIN
      const { ok: ok2, data: d2 } = await req("/student-space/me");
      if (ok2) {
        profileData = d2;
        renderCard(d2.card);
        renderSummary(d2.user, d2.student, d2.card, d2.wallet);
        loadNotifications();
      }
    }
    btn.disabled = false;
  });
}

// =============================================================
// NOTIFICATIONS
// =============================================================
const notifIcons = { success: "", warning: "", info: "ℹ" };

async function loadNotifications() {
  const el = document.getElementById("notificationsContent");
  el.innerHTML = `<div class="state-msg">Chargement...</div>`;

  const { ok, data } = await req("/student-space/notifications");
  if (!ok) { el.innerHTML = `<div class="state-msg">${data.message}</div>`; return; }

  const warnings = data.notifications.filter(n => n.type === "warning").length;
  const badge = document.getElementById("notifBadge");
  if (warnings > 0) {
    badge.textContent = warnings;
    badge.classList.remove("hidden");
  } else {
    badge.classList.add("hidden");
  }

  el.innerHTML = `<div class="notif-list">
    ${data.notifications.map(n => `
      <div class="notif-item ${n.type}">
        <span class="notif-icon">${notifIcons[n.type] || "•"}</span>
        <div>
          <div class="notif-msg">${n.message}</div>
          <div class="notif-date">${new Date(n.date).toLocaleDateString("fr-FR")}</div>
        </div>
      </div>
    `).join("")}
  </div>`;
}

// =============================================================
// SÉCURITÉ
// =============================================================
function renderSecurity(user) {
  document.getElementById("securityInfo").innerHTML = `
    <div class="security-rows">
      <div class="security-row">
        <span>Statut du compte</span>
        <strong>${user.status === "active" ? "Actif" : user.status}</strong>
      </div>
      <div class="security-row">
        <span>Dernière connexion</span>
        <strong>${user.lastLogin ? new Date(user.lastLogin).toLocaleString("fr-FR") : "Première connexion"}</strong>
      </div>
      <div class="security-row">
        <span>Mot de passe temporaire</span>
        <strong>${user.mustChangePassword ? "À changer" : "Modifié"}</strong>
      </div>
    </div>`;
}

document.getElementById("formChangePassword").addEventListener("submit", async (e) => {
  e.preventDefault();
  clearMsg("msgChangePassword");
  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;

  const { ok, data } = await req("/auth/change-password", {
    method: "PATCH",
    body: JSON.stringify({
      oldPassword: document.getElementById("cpOld").value,
      newPassword: document.getElementById("cpNew").value,
    }),
  });

  if (!ok) {
    showMsg("msgChangePassword", data.message);
  } else {
    showMsg("msgChangePassword", "Mot de passe changé avec succès.", "success");
    e.target.reset();
    document.getElementById("pwBanner").classList.add("hidden");
    const stored = JSON.parse(localStorage.getItem("user") || "{}");
    stored.mustChangePassword = false;
    localStorage.setItem("user", JSON.stringify(stored));
    if (profileData) {
      profileData.user.mustChangePassword = false;
      renderSecurity(profileData.user);
    }
  }
  btn.disabled = false;
});

// =============================================================
// INIT
// =============================================================
init();
