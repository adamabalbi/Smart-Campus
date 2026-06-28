const API = (window.SMART_CAMPUS_CONFIG && window.SMART_CAMPUS_CONFIG.API_BASE_URL) || "http://localhost:5000/api";

// ---- Auth guard ----
const token = localStorage.getItem("token");
const me    = JSON.parse(localStorage.getItem("user") || "null");
if (!token || !me) window.location.href = "index.html";
if (me?.role === "student") window.location.href = "student.html";
if (me?.role === "payment_agent") window.location.href = "payment-agent.html";

// ---- Variables globales ----
let studentsCache = [];

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
  const data = await res.json().catch(() => ({ message: `Réponse invalide (${res.status})` }));
  if (res.status === 401) { localStorage.clear(); window.location.href = "index.html"; }
  return { ok: res.ok, data };
}

// ---- Message helpers ----
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

// ---- Badge ----
function badge(status) {
  return `<span class="badge badge-${status}">${status}</span>`;
}

// ---- Sidebar ----
document.getElementById("sbName").textContent = `${me.prenom} ${me.nom}`;
document.getElementById("sbRole").textContent  = me.role;

// ---- Rôles disponibles selon le compte connecté ----
const rolesCreables = me.role === "super_admin"
  ? ["admin", "security_agent", "payment_agent", "librarian", "service_scolarite", "finance_agent", "instructor", "charge_cantine", "charge_imprimerie"]
  : ["security_agent", "payment_agent", "librarian", "service_scolarite", "finance_agent", "instructor", "charge_cantine", "charge_imprimerie"];

const rolesLabels = {
  super_admin:       "Super-admin",
  admin:             "Admin",
  security_agent:    "Agent sécurité",
  payment_agent:     "Agent paiement",
  librarian:         "Bibliothécaire",
  service_scolarite: "Service scolarité",
  finance_agent:     "Agent financier",
  instructor:        "Enseignant",
  charge_cantine:    "Chargé de cantine",
  charge_imprimerie: "Chargé d'imprimerie",
  student:           "Étudiant",
};

document.getElementById("uRole").innerHTML =
  rolesCreables.map(r => `<option value="${r}">${rolesLabels[r]}</option>`).join("");

if (me.mustChangePassword) {
  const banner = document.createElement("div");
  banner.className = "banner";
  banner.textContent = "Vous devez changer votre mot de passe. Rendez-vous dans \"Mon compte\".";
  document.querySelector(".main").prepend(banner);
}

// ---- Onglets conditionnels ----
if (!["super_admin", "admin"].includes(me.role)) {
  document.querySelectorAll(".super-only, .super-only-section").forEach(el => el.remove());
}
if (me.role !== "super_admin") {
  document.getElementById("settingsSection")?.remove();
}

// ---- Onglet actif par défaut ----
const firstTab = ["super_admin", "admin"].includes(me.role) ? "stats" : "users";
document.querySelectorAll(".nav-item[data-tab]").forEach(n => n.classList.remove("active"));
document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
document.querySelector(`.nav-item[data-tab="${firstTab}"]`)?.classList.add("active");
document.getElementById(`tab-${firstTab}`)?.classList.add("active");
if (firstTab === "stats") loadStats();
else loadUsers();

// ---- Tabs ----
document.querySelectorAll(".nav-item[data-tab]").forEach(item => {
  item.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
    item.classList.add("active");
    document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
    document.getElementById(`tab-${item.dataset.tab}`)?.classList.add("active");
    if (item.dataset.tab === "stats")         loadStats();
    if (item.dataset.tab === "users")         loadUsers();
    if (item.dataset.tab === "students")      loadStudents();
    if (item.dataset.tab === "cards")         { loadStudentsForSelect(); loadCards(); }
    if (item.dataset.tab === "registrations") loadRegistrations();
    if (item.dataset.tab === "services")      loadServices();
    if (item.dataset.tab === "access")        loadAccessSpaces();
    if (item.dataset.tab === "alerts")        loadAlerts();
    if (item.dataset.tab === "audit")         initAudit();
  });
});

// ---- Alertes IA ----
let alertStatusFilter = "new";

document.querySelectorAll(".alert-filter-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".alert-filter-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    alertStatusFilter = btn.dataset.status;
    loadAlerts();
  });
});

async function loadAlerts() {
  const el = document.getElementById("alertsTable");
  el.innerHTML = `<div class="state-msg">Chargement...</div>`;

  const query = alertStatusFilter ? `?status=${alertStatusFilter}` : "";
  const { ok, data } = await req(`/alerts${query}`);
  if (!ok) { el.innerHTML = `<div class="state-msg">Erreur de chargement.</div>`; return; }

  const alerts = data.alerts || [];
  if (!alerts.length) { el.innerHTML = `<div class="state-msg">Aucune alerte.</div>`; return; }

  const sevColor = { high: "badge-blocked", medium: "badge-inactive", low: "badge-active" };
  const sevLabel = { high: "Élevée", medium: "Moyenne", low: "Faible" };
  const stLabel = { new: "Nouvelle", reviewed: "Traitée", dismissed: "Ignorée" };

  el.innerHTML = `
    <table>
      <thead><tr><th>Date</th><th>Étudiant</th><th>Service</th><th>Montant</th><th>Score</th><th>Sévérité</th><th>Statut</th><th>Actions</th></tr></thead>
      <tbody>
        ${alerts.map(a => `
          <tr>
            <td style="font-size:12px">${new Date(a.createdAt).toLocaleString("fr-FR")}</td>
            <td>${a.studentName}<br><span style="font-size:11px;color:var(--muted)">${a.studentMatricule}</span></td>
            <td>${a.service || "—"}</td>
            <td style="color:var(--danger)">${new Intl.NumberFormat("fr-FR").format(a.amount)} FCFA</td>
            <td>${a.score != null ? Math.round(a.score * 100) + "%" : "—"}</td>
            <td><span class="badge ${sevColor[a.severity] || "badge-inactive"}">${sevLabel[a.severity] || a.severity}</span></td>
            <td><span class="badge badge-${a.status === "new" ? "blocked" : "active"}">${stLabel[a.status] || a.status}</span></td>
            <td>
              ${a.status !== "reviewed" ? `<button class="btn-sm btn-ghost al-act" data-id="${a._id}" data-st="reviewed">Traiter</button>` : ""}
              ${a.status !== "dismissed" ? `<button class="btn-sm btn-ghost al-act" data-id="${a._id}" data-st="dismissed">Ignorer</button>` : ""}
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>`;

  el.querySelectorAll(".al-act").forEach(btn =>
    btn.addEventListener("click", () => updateAlert(btn.dataset.id, btn.dataset.st))
  );
}

async function updateAlert(id, status) {
  const { ok, data } = await req(`/alerts/${id}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  if (!ok) { alert(data.message || "Erreur"); return; }
  loadAlerts();
}

// ---- Historique / journal d'audit ----
let auditPage = 1;
let auditInitialized = false;

const AUDIT_ACTION_LABELS = {
  login: "Connexion",
  login_failed: "Connexion échouée",
  logout: "Déconnexion",
  password_changed: "Mot de passe changé",
  user_created: "Compte créé",
  user_status_updated: "Statut compte modifié",
  user_role_updated: "Rôle modifié",
  user_deleted: "Compte supprimé",
  student_created: "Étudiant créé",
  student_status_updated: "Statut étudiant modifié",
  student_deleted: "Étudiant supprimé",
  registration_submitted: "Inscription soumise",
  registration_email_verified: "Email confirmé",
  registration_approved: "Inscription validée",
  registration_rejected: "Inscription refusée",
  scolarite_updated: "Scolarité modifiée",
  enrollment_validated: "Dossier validé",
  enrollment_rejected: "Dossier refusé",
  card_created: "Carte créée",
  card_blocked: "Carte bloquée",
  card_status_updated: "Statut carte modifié",
  recharge: "Recharge",
  payment: "Paiement",
  ai_alert_created: "Alerte IA",
  alert_status_updated: "Alerte traitée",
  access_granted: "Accès autorisé",
  access_denied: "Accès refusé",
  access_space_status_updated: "Espace activé/désactivé",
  access_space_rules_updated: "Règles d'accès modifiées",
};

function initAudit() {
  if (!auditInitialized) {
    auditInitialized = true;

    // Remplir le filtre actions avec celles présentes en base
    req("/audit/actions").then(({ ok, data }) => {
      if (!ok) return;
      const sel = document.getElementById("auditActionFilter");
      data.actions.forEach(a => {
        const opt = document.createElement("option");
        opt.value = a;
        opt.textContent = AUDIT_ACTION_LABELS[a] || a;
        sel.appendChild(opt);
      });
    });

    ["auditActionFilter", "auditStatusFilter", "auditFromFilter", "auditToFilter"].forEach(id =>
      document.getElementById(id).addEventListener("change", () => { auditPage = 1; loadAudit(); })
    );

    let auditSearchTimeout;
    document.getElementById("auditSearch").addEventListener("input", () => {
      clearTimeout(auditSearchTimeout);
      auditSearchTimeout = setTimeout(() => { auditPage = 1; loadAudit(); }, 350);
    });

    document.getElementById("auditResetBtn").addEventListener("click", () => {
      ["auditActionFilter", "auditStatusFilter", "auditFromFilter", "auditToFilter", "auditSearch"]
        .forEach(id => { document.getElementById(id).value = ""; });
      auditPage = 1;
      loadAudit();
    });
  }
  auditPage = 1;
  loadAudit();
}

async function loadAudit() {
  const el = document.getElementById("auditTable");
  el.innerHTML = `<div class="state-msg">Chargement...</div>`;

  const params = new URLSearchParams({ page: auditPage, limit: 25 });
  const action = document.getElementById("auditActionFilter").value;
  const status = document.getElementById("auditStatusFilter").value;
  const from   = document.getElementById("auditFromFilter").value;
  const to     = document.getElementById("auditToFilter").value;
  const q      = document.getElementById("auditSearch").value.trim();
  if (action) params.set("action", action);
  if (status) params.set("status", status);
  if (from)   params.set("from", from);
  if (to)     params.set("to", `${to}T23:59:59`);
  if (q)      params.set("q", q);

  const { ok, data } = await req(`/audit?${params}`);
  if (!ok) { el.innerHTML = `<div class="state-msg">Erreur de chargement.</div>`; return; }

  const logs = data.logs || [];
  if (!logs.length) {
    el.innerHTML = `<div class="state-msg">Aucun événement.</div>`;
    document.getElementById("auditPagination").innerHTML = "";
    return;
  }

  el.innerHTML = `
    <table>
      <thead><tr><th>Date</th><th>Acteur</th><th>Action</th><th>Cible</th><th>Description</th><th>IP</th><th>Résultat</th></tr></thead>
      <tbody>
        ${logs.map(l => {
          const actor = l.actorId
            ? `${[l.actorId.prenom, l.actorId.nom].filter(Boolean).join(" ") || l.actorId.email || ""}<br><span style="font-size:11px;color:var(--muted)">${l.actorRole}</span>`
            : `<span style="color:var(--muted)">Système</span><br><span style="font-size:11px;color:var(--muted)">${l.actorRole}</span>`;
          return `
          <tr>
            <td style="font-size:12px;white-space:nowrap">${new Date(l.createdAt).toLocaleString("fr-FR")}</td>
            <td>${actor}</td>
            <td><span class="badge badge-inactive">${AUDIT_ACTION_LABELS[l.action] || l.action}</span></td>
            <td style="font-size:12px">${l.targetType || "—"}</td>
            <td style="font-size:13px">${l.description || "—"}</td>
            <td style="font-size:11px;color:var(--muted)">${l.ipAddress || "—"}</td>
            <td><span class="badge badge-${l.status === "success" ? "active" : "blocked"}">${l.status === "success" ? "Succès" : "Échec"}</span></td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>`;

  const { page, pages, total } = data.pagination;
  const pagEl = document.getElementById("auditPagination");
  pagEl.innerHTML = pages > 1 ? `
    <button class="btn-sm btn-ghost" id="auditPrevBtn" ${page <= 1 ? "disabled" : ""}>Précédent</button>
    <span style="font-size:13px;color:var(--muted)">Page ${page} / ${pages} (${total} événements)</span>
    <button class="btn-sm btn-ghost" id="auditNextBtn" ${page >= pages ? "disabled" : ""}>Suivant </button>
  ` : `<span style="font-size:13px;color:var(--muted)">${total} événement(s)</span>`;

  document.getElementById("auditPrevBtn")?.addEventListener("click", () => { auditPage--; loadAudit(); });
  document.getElementById("auditNextBtn")?.addEventListener("click", () => { auditPage++; loadAudit(); });
}

// ---- Services du campus ----
async function loadServices() {
  const el = document.getElementById("servicesTable");
  el.innerHTML = `<div class="state-msg">Chargement...</div>`;

  const { ok, data } = await req("/services");
  if (!ok) { el.innerHTML = `<div class="state-msg">Erreur de chargement.</div>`; return; }

  const services = data.services || [];
  if (!services.length) { el.innerHTML = `<div class="state-msg">Aucun service.</div>`; return; }

  el.innerHTML = `
    <table>
      <thead><tr><th>Service</th><th>Clé</th><th>Description</th><th>Statut</th><th>Action</th></tr></thead>
      <tbody>
        ${services.map(s => `
          <tr>
            <td><strong>${s.label}</strong></td>
            <td><code>${s.key}</code></td>
            <td style="font-size:12px">${s.description || "—"}</td>
            <td><span class="badge badge-${s.status === "active" ? "active" : "blocked"}">${s.status === "active" ? "Actif" : "Inactif"}</span></td>
            <td>
              <button class="btn-sm ${s.status === "active" ? "btn-ghost" : ""}" data-key="${s.key}" data-next="${s.status === "active" ? "inactive" : "active"}"
                style="${s.status === "active" ? "color:var(--danger)" : "background:var(--success);color:#fff"}">
                ${s.status === "active" ? "Désactiver" : "Activer"}
              </button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>`;

  el.querySelectorAll("button[data-key]").forEach(btn =>
    btn.addEventListener("click", () => toggleService(btn.dataset.key, btn.dataset.next))
  );
}

async function toggleService(key, nextStatus) {
  const { ok, data } = await req(`/services/${key}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status: nextStatus }),
  });
  if (!ok) { alert(data.message || "Erreur"); return; }
  loadServices();
}

// ---- Espaces d'accès ----
let accessSpacesCache = [];

async function loadAccessSpaces() {
  const el = document.getElementById("accessSpacesTable");
  el.innerHTML = `<div class="state-msg">Chargement...</div>`;

  const { ok, data } = await req("/access/spaces");
  if (!ok) { el.innerHTML = `<div class="state-msg">Erreur de chargement.</div>`; return; }

  accessSpacesCache = data.spaces || [];
  if (!accessSpacesCache.length) { el.innerHTML = `<div class="state-msg">Aucun espace.</div>`; return; }

  el.innerHTML = `
    <table>
      <thead><tr><th>Espace</th><th>Filières</th><th>Niveaux</th><th>Horaires</th><th>Statut</th><th>Actions</th></tr></thead>
      <tbody>
        ${accessSpacesCache.map(s => `
          <tr>
            <td><strong>${s.label}</strong><br><span style="font-size:11px;color:var(--muted)">${s.key}</span></td>
            <td style="font-size:12px">${s.allowedFilieres?.length ? s.allowedFilieres.join(", ") : "Toutes"}</td>
            <td style="font-size:12px">${s.allowedNiveaux?.length ? s.allowedNiveaux.join(", ") : "Tous"}</td>
            <td style="font-size:12px">${s.enforceSchedule ? `${s.openTime}–${s.closeTime}` : "Libre"}</td>
            <td><span class="badge badge-${s.status === "active" ? "active" : "blocked"}">${s.status === "active" ? "Actif" : "Inactif"}</span></td>
            <td>
              <button class="btn-sm btn-ghost as-edit" data-key="${s.key}">Règles</button>
              <button class="btn-sm as-toggle" data-key="${s.key}" data-next="${s.status === "active" ? "inactive" : "active"}"
                style="${s.status === "active" ? "color:var(--danger)" : "background:var(--success);color:#fff"}">
                ${s.status === "active" ? "Désactiver" : "Activer"}
              </button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>`;

  el.querySelectorAll(".as-toggle").forEach(btn =>
    btn.addEventListener("click", () => toggleSpace(btn.dataset.key, btn.dataset.next))
  );
  el.querySelectorAll(".as-edit").forEach(btn =>
    btn.addEventListener("click", () => openSpaceRules(btn.dataset.key))
  );
}

async function toggleSpace(key, nextStatus) {
  const { ok, data } = await req(`/access/spaces/${key}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status: nextStatus }),
  });
  if (!ok) { alert(data.message || "Erreur"); return; }
  loadAccessSpaces();
}

let editingSpaceKey = null;
function openSpaceRules(key) {
  const s = accessSpacesCache.find(x => x.key === key);
  if (!s) return;
  editingSpaceKey = key;
  document.getElementById("spaceRulesTitle").textContent = `Règles d'accès — ${s.label}`;
  document.getElementById("srFilieres").value = (s.allowedFilieres || []).join(", ");
  document.getElementById("srNiveaux").value  = (s.allowedNiveaux || []).join(", ");
  document.getElementById("srEnforce").checked = !!s.enforceSchedule;
  document.getElementById("srOpen").value  = s.openTime || "08:00";
  document.getElementById("srClose").value = s.closeTime || "18:00";
  clearMsg("spaceRulesMsg");
  document.getElementById("spaceRulesModal").classList.remove("hidden");
}

document.getElementById("spaceRulesCancel").addEventListener("click", () =>
  document.getElementById("spaceRulesModal").classList.add("hidden")
);

document.getElementById("spaceRulesConfirm").addEventListener("click", async () => {
  clearMsg("spaceRulesMsg");
  const body = {
    allowedFilieres: document.getElementById("srFilieres").value.split(",").map(x => x.trim()).filter(Boolean),
    allowedNiveaux:  document.getElementById("srNiveaux").value.split(",").map(x => x.trim()).filter(Boolean),
    enforceSchedule: document.getElementById("srEnforce").checked,
    openTime:  document.getElementById("srOpen").value,
    closeTime: document.getElementById("srClose").value,
  };
  const { ok, data } = await req(`/access/spaces/${editingSpaceKey}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
  if (!ok) { showMsg("spaceRulesMsg", data.message || "Erreur"); return; }
  document.getElementById("spaceRulesModal").classList.add("hidden");
  loadAccessSpaces();
});

// ---- Logout ----
document.getElementById("logoutBtn").addEventListener("click", async () => {
  try { await req("/auth/logout", { method: "POST" }); } catch {}
  localStorage.clear();
  window.location.href = "index.html";
});

// =============================================================
// USERS
// =============================================================
async function loadUsers() {
  const el = document.getElementById("usersTable");
  el.innerHTML = `<div class="state-msg">Chargement...</div>`;
  const { ok, data } = await req("/auth/users");
  if (!ok) { el.innerHTML = `<div class="state-msg">${data.message}</div>`; return; }
  if (!data.users.length) { el.innerHTML = `<div class="state-msg">Aucun utilisateur.</div>`; return; }

  // Filtrer les étudiants de la liste des utilisateurs
  const nonStudentUsers = data.users.filter(u => u.role !== "student");

  el.innerHTML = `
    <table>
      <thead><tr>
        <th>Nom</th><th>Prénom</th><th>Email</th><th>Rôle</th><th>Statut</th><th>Actions</th>
      </tr></thead>
      <tbody>
        ${nonStudentUsers.map(u => {
          const isSelf     = u._id === me.id;
          const isSuper    = u.role === "super_admin";
          const isAdmin    = u.role === "admin";
          const requesterIsAdmin = me.role === "admin";

          const canStatus = !isSelf && !(requesterIsAdmin && (isSuper || isAdmin));
          const canRole   = !isSelf && !(requesterIsAdmin && (isSuper || isAdmin));
          const canDelete = !isSelf && !(requesterIsAdmin && isSuper);

          return `
          <tr>
            <td>${u.nom}</td>
            <td>${u.prenom}</td>
            <td>${u.email}</td>
            <td>${rolesLabels[u.role] || u.role}</td>
            <td>${badge(u.status)}</td>
            <td><div class="td-actions">
              ${canStatus ? `<button class="btn-sm btn-ghost status-user-btn" data-id="${u._id}" data-status="${u.status}">Statut</button>` : ""}
              ${canRole   ? `<button class="btn-sm btn-ghost role-user-btn"   data-id="${u._id}" data-role="${u.role}">Rôle</button>` : ""}
              ${canDelete ? `<button class="btn-sm btn-ghost delete-user-btn" data-id="${u._id}" data-nom="${u.nom} ${u.prenom}">Supprimer</button>` : ""}
            </div></td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>`;

  el.querySelectorAll(".status-user-btn").forEach(btn => {
    btn.addEventListener("click", () => openStatusModal("user", btn.dataset.id, btn.dataset.status));
  });
  el.querySelectorAll(".role-user-btn").forEach(btn => {
    btn.addEventListener("click", () => openRoleModal(btn.dataset.id, btn.dataset.role));
  });
  el.querySelectorAll(".delete-user-btn").forEach(btn => {
    btn.addEventListener("click", () => deleteUser(btn.dataset.id, btn.dataset.nom));
  });
}

document.getElementById("formCreateUser").addEventListener("submit", async (e) => {
  e.preventDefault();
  clearMsg("msgCreateUser");
  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;

  const { ok, data } = await req("/auth/users", {
    method: "POST",
    body: JSON.stringify({
      nom:    document.getElementById("uNom").value.trim(),
      prenom: document.getElementById("uPrenom").value.trim(),
      email:  document.getElementById("uEmail").value.trim(),
      role:   document.getElementById("uRole").value,
    }),
  });

  if (!ok) {
    showMsg("msgCreateUser", data.message);
  } else {
    showMsg("msgCreateUser", "Utilisateur créé. Un email avec le mot de passe temporaire a été envoyé.", "success");
    e.target.reset();
    loadUsers();
  }
  btn.disabled = false;
});

// =============================================================
// STUDENTS
// =============================================================
async function loadStudents() {
  const el = document.getElementById("studentsTable");
  el.innerHTML = `<div class="state-msg">Chargement...</div>`;
  const { ok, data } = await req("/students");
  if (!ok) { el.innerHTML = `<div class="state-msg">${data.message}</div>`; return; }

  studentsCache = data.students;
  renderStudentsTable(studentsCache);
  updateSearchInfo(studentsCache.length, studentsCache.length);
}

function renderStudentsTable(students) {
  const el = document.getElementById("studentsTable");

  if (!students.length) {
    el.innerHTML = `<div class="state-msg">Aucun étudiant trouvé.</div>`;
    return;
  }

  const statutScoLabels = {
    en_attente: "En attente", en_regle: "En règle",
    non_en_regle: "Non en règle", paiement_partiel: "Paiement partiel", exonere: "Exonéré",
  };
  const statutScoColors = {
    en_attente: "badge-inactive", en_regle: "badge-active",
    non_en_regle: "badge-blocked", paiement_partiel: "badge-expired", exonere: "badge-active",
  };

  el.innerHTML = `
    <table>
      <thead><tr>
        <th>Matricule</th><th>Nom</th><th>Prénom</th><th>Email</th>
        <th>Filière</th><th>Niveau</th><th>Statut</th><th>Scolarité</th><th>Actions</th>
      </tr></thead>
      <tbody>
        ${students.map(s => `
          <tr>
            <td>${s.matricule}</td>
            <td>${s.nom}</td>
            <td>${s.prenom}</td>
            <td style="font-size:12px">${s.email}</td>
            <td>${s.filiere}</td>
            <td>${s.niveau}</td>
            <td>${badge(s.status)}</td>
            <td><span class="badge ${statutScoColors[s.statutScolarite] || 'badge-inactive'}">${statutScoLabels[s.statutScolarite] || s.statutScolarite}</span></td>
            <td><div class="td-actions">
              <button class="btn-sm btn-ghost edit-btn"   data-id="${s._id}">Modifier</button>
              <button class="btn-sm btn-ghost status-btn" data-id="${s._id}" data-status="${s.status}">Statut</button>
              <button class="btn-sm btn-ghost delete-student-btn" data-id="${s._id}" data-nom="${s.prenom} ${s.nom}">Supprimer</button>
            </div></td>
          </tr>
        `).join("")}
      </tbody>
    </table>`;

  // Attacher les gestionnaires d'événements
  el.querySelectorAll(".edit-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const s = studentsCache.find(x => x._id === btn.dataset.id);
      if (s) openEditStudent(s);
    });
  });
  el.querySelectorAll(".status-btn").forEach(btn => {
    btn.addEventListener("click", () => openStatusModal("student", btn.dataset.id, btn.dataset.status));
  });
  el.querySelectorAll(".delete-student-btn").forEach(btn => {
    btn.addEventListener("click", () => deleteStudent(btn.dataset.id, btn.dataset.nom));
  });
}

function filterStudents(searchTerm) {
  if (!searchTerm.trim()) {
    renderStudentsTable(studentsCache);
    updateSearchInfo(studentsCache.length, studentsCache.length);
    return;
  }

  const filtered = studentsCache.filter(s => {
    const search = searchTerm.toLowerCase();
    return (
      s.nom.toLowerCase().includes(search) ||
      s.prenom.toLowerCase().includes(search) ||
      s.email.toLowerCase().includes(search) ||
      s.matricule.toLowerCase().includes(search) ||
      s.filiere.toLowerCase().includes(search) ||
      s.niveau.toLowerCase().includes(search)
    );
  });

  renderStudentsTable(filtered);
  updateSearchInfo(filtered.length, studentsCache.length);
}

function updateSearchInfo(displayed, total) {
  const info = document.getElementById("searchInfo");
  if (!info) return;

  if (displayed === total) {
    info.textContent = `${total} étudiant${total > 1 ? 's' : ''} au total`;
  } else {
    info.textContent = `${displayed} sur ${total} étudiant${total > 1 ? 's' : ''}`;
  }
}


async function deleteStudent(id, nom) {
  if (!confirm(`Supprimer définitivement l'étudiant ${nom} ?\n\nCette action supprime aussi son compte, sa carte et son portefeuille.`)) return;
  const { ok, data } = await req(`/students/${id}`, { method: "DELETE" });
  if (!ok) { alert(data.message); return; }
  loadStudents();
}

// Edit student modal
let editStudentId = null;

function openEditStudent(s) {
  editStudentId = s._id;
  document.getElementById("eNom").value         = s.nom;
  document.getElementById("ePrenom").value      = s.prenom;
  document.getElementById("eTelephone").value   = s.telephone || "";
  document.getElementById("eFiliere").value     = s.filiere;
  document.getElementById("eNiveau").value      = s.niveau;
  document.getElementById("eDepartement").value = s.departement || "";
  clearMsg("editStudentMsg");
  document.getElementById("editStudentModal").classList.remove("hidden");
}

document.getElementById("editStudentCancel").addEventListener("click", () => {
  document.getElementById("editStudentModal").classList.add("hidden");
});

document.getElementById("editStudentConfirm").addEventListener("click", async () => {
  clearMsg("editStudentMsg");
  const body = {
    nom:        document.getElementById("eNom").value.trim(),
    prenom:     document.getElementById("ePrenom").value.trim(),
    filiere:    document.getElementById("eFiliere").value.trim(),
    niveau:     document.getElementById("eNiveau").value.trim(),
  };
  const dep = document.getElementById("eDepartement").value.trim();
  const tel = document.getElementById("eTelephone").value.trim();
  if (dep) body.departement = dep;
  if (tel) body.telephone   = tel;

  const { ok, data } = await req(`/students/${editStudentId}`, { method: "PUT", body: JSON.stringify(body) });

  if (!ok) {
    showMsg("editStudentMsg", data.message);
  } else {
    document.getElementById("editStudentModal").classList.add("hidden");
    loadStudents();
  }
});

// =============================================================
// CARDS
// =============================================================
async function loadStudentsForSelect() {
  const select = document.getElementById("cStudentId");
  select.innerHTML = `<option value="">Chargement...</option>`;
  const { ok, data } = await req("/students");
  if (!ok) { select.innerHTML = `<option value="">Erreur chargement</option>`; return; }

  const actifs = data.students.filter(s => s.status === "active");
  select.innerHTML = `<option value="">Sélectionner un étudiant</option>` +
    actifs.map(s => `<option value="${s._id}">${s.matricule} — ${s.prenom} ${s.nom}</option>`).join("");
}

async function loadCards() {
  const el = document.getElementById("cardsTable");
  el.innerHTML = `<div class="state-msg">Chargement...</div>`;
  const { ok, data } = await req("/cards");
  if (!ok) { el.innerHTML = `<div class="state-msg">${data.message}</div>`; return; }
  if (!data.cards.length) { el.innerHTML = `<div class="state-msg">Aucune carte.</div>`; return; }

  el.innerHTML = `
    <table>
      <thead><tr>
        <th>N° Carte</th><th>Étudiant</th><th>Type</th>
        <th>Statut</th><th>PIN</th><th>Émise le</th><th>Actions</th>
      </tr></thead>
      <tbody>
        ${data.cards.map(c => {
          const pinBlocked = c.pinBlockedUntil && new Date(c.pinBlockedUntil) > new Date();
          const pinStatus  = pinBlocked
            ? `<span style="color:var(--danger);font-size:12px">Bloqué</span>`
            : `<span style="font-size:12px">${c.pinAttempts}/3 essais</span>`;

          return `<tr>
            <td style="font-size:12px">${c.cardNumber}</td>
            <td style="font-size:12px">${c.studentId ? `${c.studentId.prenom} ${c.studentId.nom}<br><span style="color:var(--muted)">${c.studentId.matricule}</span>` : "—"}</td>
            <td style="font-size:12px">${c.type}</td>
            <td>${badge(c.status)}</td>
            <td>${pinStatus}</td>
            <td style="font-size:12px">${new Date(c.issuedAt).toLocaleDateString("fr-FR")}</td>
            <td><div class="td-actions">
              <button class="btn-sm btn-ghost edit-card-btn" data-id="${c._id}" data-type="${c.type}" data-expiry="${c.expiresAt || ''}" data-num="${c.cardNumber}">Modifier</button>
              <button class="btn-sm btn-ghost status-btn"    data-id="${c._id}" data-status="${c.status}">Statut</button>
              <button class="btn-sm btn-ghost pin-btn"       data-id="${c._id}">Reset PIN</button>
            </div></td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>`;

  el.querySelectorAll(".edit-card-btn").forEach(btn =>
    btn.addEventListener("click", () => openEditCardModal(btn.dataset.id, btn.dataset.type, btn.dataset.expiry, btn.dataset.num))
  );
  el.querySelectorAll(".status-btn").forEach(btn => {
    btn.addEventListener("click", () => openStatusModal("card", btn.dataset.id, btn.dataset.status));
  });
  el.querySelectorAll(".pin-btn").forEach(btn => {
    btn.addEventListener("click", () => openPinModal(btn.dataset.id));
  });
}

// Générateur d'UID simulé (MIFARE Classic 1K = 4 octets = 8 hex)
document.getElementById("generateUid")?.addEventListener("click", () => {
  const bytes  = Array.from({ length: 5 }, () =>
    Math.floor(Math.random() * 256).toString(16).padStart(2, "0").toUpperCase()
  );
  // Octet 0 = 04 (NXP prefix standard)
  bytes[0] = "04";
  document.getElementById("cUid").value = bytes.join("");
});

// ---- Scan d'une carte physique via le lecteur ACR122U (WebSocket) ----
let scanSocket = null;
let scanActive = false;

function setScanStatus(text, color) {
  const el = document.getElementById("scanStatus");
  if (el) { el.textContent = text; el.style.color = color || "var(--muted)"; }
}

document.getElementById("scanCardBtn")?.addEventListener("click", () => {
  // Si un scan est déjà en cours, l'annuler
  if (scanActive) {
    scanActive = false;
    if (scanSocket) scanSocket.close();
    setScanStatus("Scan annulé. 8–14 caractères hexadécimaux", "var(--muted)");
    return;
  }

  const wsUrl = (window.SMART_CAMPUS_CONFIG && window.SMART_CAMPUS_CONFIG.WS_BASE_URL) || "ws://localhost:5000";
  setScanStatus("Approchez la carte du lecteur ACR122U...", "var(--primary)");
  scanActive = true;

  scanSocket = new WebSocket(wsUrl);

  scanSocket.onopen = () => {
    console.log("WebSocket scan connecté");
  };

  scanSocket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === "cardDetected" && scanActive) {
        document.getElementById("cUid").value = data.uid;
        setScanStatus(`Carte détectée : ${data.uid}`, "#22c55e");
        scanActive = false;
        scanSocket.close();
      }
    } catch (err) {
      console.error("Erreur message WebSocket scan:", err);
    }
  };

  scanSocket.onerror = () => {
    setScanStatus("Lecteur NFC indisponible (serveur lancé avec ENABLE_NFC=true ?)", "#B85C5C");
    scanActive = false;
  };

  scanSocket.onclose = () => {
    console.log("WebSocket scan fermé");
  };

  // Timeout de sécurité : 20 secondes
  setTimeout(() => {
    if (scanActive) {
      scanActive = false;
      if (scanSocket) scanSocket.close();
      setScanStatus("Délai dépassé. Cliquez à nouveau sur Scanner.", "#C9A227");
    }
  }, 20000);
});

document.getElementById("formCreateCard").addEventListener("submit", async (e) => {
  e.preventDefault();
  clearMsg("msgCreateCard");
  const btn = e.target.querySelector("button[type=submit]");
  btn.disabled = true;

  const body = {
    studentId: document.getElementById("cStudentId").value,
    uid:       document.getElementById("cUid").value.trim().toUpperCase(),
    pin:       document.getElementById("cPin").value,
    type:      document.getElementById("cType").value,
  };
  const exp = document.getElementById("cExpiresAt").value;
  if (exp) body.expiresAt = exp;

  const { ok, data } = await req("/cards", { method: "POST", body: JSON.stringify(body) });

  if (!ok) {
    showMsg("msgCreateCard", data.message);
  } else {
    showMsg("msgCreateCard", `Carte ${data.card.cardNumber} émise avec succès.`, "success");
    e.target.reset();
    loadCards();
  }
  btn.disabled = false;
});

// Recherche par UID
document.getElementById("searchUidBtn")?.addEventListener("click", async () => {
  const uid = document.getElementById("searchUid").value.trim().toUpperCase();
  const el  = document.getElementById("searchUidResult");
  if (!uid) return;

  el.innerHTML = `<div class="state-msg">Recherche...</div>`;
  const { ok, data } = await req(`/cards/uid/${uid}`);

  if (!ok) {
    el.innerHTML = `<div class="alert alert-error" style="margin:0">${data.message}</div>`;
    return;
  }

  const c = data.card;
  const s = c.studentId;
  el.innerHTML = `
    <div style="font-size:13px;background:var(--bg);border-radius:6px;padding:.75rem">
      <div><strong>N°</strong> ${c.cardNumber}</div>
      <div><strong>Statut</strong> ${badge(c.status)}</div>
      <div><strong>Étudiant</strong> ${s ? `${s.prenom} ${s.nom} (${s.matricule})` : "—"}</div>
      <div><strong>Tentatives PIN</strong> ${c.pinAttempts}/3</div>
      ${c.pinBlockedUntil ? `<div style="color:var(--danger)"><strong>Bloqué jusqu'au</strong> ${new Date(c.pinBlockedUntil).toLocaleString("fr-FR")}</div>` : ""}
    </div>`;
});

// Vérification PIN
document.getElementById("verifyPinBtn")?.addEventListener("click", async () => {
  const uid = document.getElementById("verifyUid").value.trim().toUpperCase();
  const pin = document.getElementById("verifyPin").value;
  const el  = document.getElementById("verifyPinResult");

  if (!uid || !pin) {
    el.innerHTML = `<div class="alert alert-error" style="margin:0">UID et PIN obligatoires.</div>`;
    return;
  }

  const { ok, data } = await req("/cards/verify-pin", {
    method: "POST",
    body: JSON.stringify({ uid, pin }),
  });

  if (ok) {
    el.innerHTML = `<div class="alert alert-success" style="margin:0">PIN correct — accès autorisé.</div>`;
  } else {
    el.innerHTML = `<div class="alert alert-error" style="margin:0">${data.message}${data.pinAttempts ? ` (${data.pinAttempts}/3 tentatives)` : ""}</div>`;
  }
});

// =============================================================
// STATUS MODAL (users / students / cards)
// =============================================================
let statusCtx = null;

const statusOpts = {
  user:    ["active", "blocked", "disabled"],
  student: ["active", "inactive", "disabled"],
  card:    ["active", "blocked", "lost", "expired", "disabled"],
};

function openStatusModal(type, id, current) {
  statusCtx = { type, id };
  document.getElementById("statusModalTitle").textContent =
    type === "user" ? "Statut utilisateur" :
    type === "student" ? "Statut étudiant" : "Statut carte";
  document.getElementById("statusModalSelect").innerHTML =
    statusOpts[type].map(s => `<option value="${s}" ${s === current ? "selected" : ""}>${s}</option>`).join("");
  clearMsg("statusModalMsg");
  document.getElementById("statusModal").classList.remove("hidden");
}

document.getElementById("statusModalCancel").addEventListener("click", () => {
  document.getElementById("statusModal").classList.add("hidden");
});

document.getElementById("statusModalConfirm").addEventListener("click", async () => {
  const { type, id } = statusCtx;
  const status = document.getElementById("statusModalSelect").value;
  clearMsg("statusModalMsg");

  const path =
    type === "user"    ? `/auth/users/${id}/status` :
    type === "student" ? `/students/${id}/status`   :
                         `/cards/${id}/status`;

  const { ok, data } = await req(path, { method: "PATCH", body: JSON.stringify({ status }) });

  if (!ok) {
    showMsg("statusModalMsg", data.message);
  } else {
    document.getElementById("statusModal").classList.add("hidden");
    if (type === "user")    loadUsers();
    if (type === "student") loadStudents();
    if (type === "card")    loadCards();
  }
});

// =============================================================
// DETAILS MODAL
// =============================================================
function openDetailsModal(u) {
  document.getElementById("detailsContent").innerHTML = `
    <div class="detail-row"><span>Nom complet</span><strong>${u.prenom} ${u.nom}</strong></div>
    <div class="detail-row"><span>Email</span><strong>${u.email}</strong></div>
    <div class="detail-row"><span>Rôle</span><strong>${rolesLabels[u.role] || u.role}</strong></div>
    <div class="detail-row"><span>Statut</span>${badge(u.status)}</div>
    <div class="detail-row"><span>Créé le</span><strong>${new Date(u.createdAt).toLocaleDateString("fr-FR")}</strong></div>
    <div class="detail-row"><span>Dernière connexion</span><strong>${u.lastLogin ? new Date(u.lastLogin).toLocaleString("fr-FR") : "Jamais"}</strong></div>
  `;
  document.getElementById("detailsModal").classList.remove("hidden");
}

document.getElementById("detailsModalClose").addEventListener("click", () => {
  document.getElementById("detailsModal").classList.add("hidden");
});

// =============================================================
// ROLE MODAL
// =============================================================
let roleModalUserId = null;

const rolesModifiables = me.role === "super_admin"
  ? ["admin", "security_agent", "payment_agent", "librarian", "service_scolarite", "finance_agent", "instructor", "charge_cantine", "charge_imprimerie"]
  : ["security_agent", "payment_agent", "librarian", "service_scolarite", "finance_agent", "instructor", "charge_cantine", "charge_imprimerie"];

function openRoleModal(userId, currentRole) {
  roleModalUserId = userId;
  document.getElementById("roleModalSelect").innerHTML =
    rolesModifiables.map(r => `<option value="${r}" ${r === currentRole ? "selected" : ""}>${rolesLabels[r]}</option>`).join("");
  clearMsg("roleModalMsg");
  document.getElementById("roleModal").classList.remove("hidden");
}

document.getElementById("roleModalCancel").addEventListener("click", () => {
  document.getElementById("roleModal").classList.add("hidden");
});

document.getElementById("roleModalConfirm").addEventListener("click", async () => {
  const role = document.getElementById("roleModalSelect").value;
  clearMsg("roleModalMsg");

  const { ok, data } = await req(`/auth/users/${roleModalUserId}/role`, {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });

  if (!ok) {
    showMsg("roleModalMsg", data.message);
  } else {
    document.getElementById("roleModal").classList.add("hidden");
    loadUsers();
  }
});

// =============================================================
// DELETE USER
// =============================================================
async function deleteUser(userId, nom) {
  if (!confirm(`Supprimer définitivement le compte de ${nom} ?`)) return;

  const { ok, data } = await req(`/auth/users/${userId}`, { method: "DELETE" });

  if (!ok) {
    alert(data.message);
  } else {
    loadUsers();
  }
}

// =============================================================
// EDIT CARD MODAL
// =============================================================
let editCardId = null;

// Preset selector affiche/cache l'input date
document.getElementById("editCardExpiryPreset")?.addEventListener("change", (e) => {
  const input = document.getElementById("editCardExpiry");
  if (e.target.value === "custom") {
    input.classList.remove("hidden");
    const min = new Date();
    min.setDate(min.getDate() + 1);
    input.min = min.toISOString().substring(0, 10);
    input.value = "";
  } else {
    input.classList.add("hidden");
    input.value = "";
  }
});

function resolveExpiry() {
  const preset = document.getElementById("editCardExpiryPreset").value;
  if (!preset) return null;
  if (preset === "custom") {
    const v = document.getElementById("editCardExpiry").value;
    return v || null;
  }
  const years = parseInt(preset);
  const d = new Date();
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().substring(0, 10);
}

function openEditCardModal(id, type, expiry, cardNumber) {
  editCardId = id;
  document.getElementById("editCardInfo").textContent = `Carte : ${cardNumber}`;
  document.getElementById("editCardType").value = type;
  // Réinitialise le preset
  document.getElementById("editCardExpiryPreset").value = "";
  document.getElementById("editCardExpiry").classList.add("hidden");
  document.getElementById("editCardExpiry").value = "";
  clearMsg("editCardMsg");
  document.getElementById("editCardModal").classList.remove("hidden");
}

document.getElementById("editCardCancel").addEventListener("click", () => {
  document.getElementById("editCardModal").classList.add("hidden");
});

document.getElementById("editCardConfirm").addEventListener("click", async () => {
  clearMsg("editCardMsg");

  const preset = document.getElementById("editCardExpiryPreset").value;
  if (preset === "custom" && !document.getElementById("editCardExpiry").value) {
    showMsg("editCardMsg", "Veuillez sélectionner une date personnalisée.");
    return;
  }

  const body = {
    type:      document.getElementById("editCardType").value,
    expiresAt: resolveExpiry(),
  };

  const { ok, data } = await req(`/cards/${editCardId}`, {
    method: "PUT",
    body: JSON.stringify(body),
  });

  if (!ok) {
    showMsg("editCardMsg", data.message);
  } else {
    document.getElementById("editCardModal").classList.add("hidden");
    loadCards();
  }
});

// =============================================================
// PIN MODAL
// =============================================================
let pinCardId = null;

function openPinModal(id) {
  pinCardId = id;
  document.getElementById("pinNewInput").value = "";
  clearMsg("pinModalMsg");
  document.getElementById("pinModal").classList.remove("hidden");
}

document.getElementById("pinModalCancel").addEventListener("click", () => {
  document.getElementById("pinModal").classList.add("hidden");
});

document.getElementById("pinModalConfirm").addEventListener("click", async () => {
  clearMsg("pinModalMsg");
  const newPin = document.getElementById("pinNewInput").value;

  const { ok, data } = await req(`/cards/${pinCardId}/reset-pin`, {
    method: "PATCH",
    body: JSON.stringify({ newPin }),
  });

  if (!ok) {
    showMsg("pinModalMsg", data.message);
  } else {
    document.getElementById("pinModal").classList.add("hidden");
    loadCards();
  }
});

// =============================================================
// CHANGE PASSWORD
// =============================================================
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
    // update stored user
    const updated = { ...me, mustChangePassword: false };
    localStorage.setItem("user", JSON.stringify(updated));
    document.querySelector(".banner")?.remove();
  }
  btn.disabled = false;
});

// =============================================================
// STATS + DASHBOARD
// =============================================================
function statCard(label, value, mod = "") {
  return `<div class="stat-card ${mod}">
    <div class="stat-label">${label}</div>
    <div class="stat-value">${value}</div>
  </div>`;
}

async function loadStats() {
  if (me.role === "super_admin") {
    await loadSuperAdminDash();
  } else {
    await loadAdminDash();
  }
}

// ---- SUPER ADMIN dashboard ----
async function loadSuperAdminDash() {
  document.getElementById("mgmtTitle").textContent = "Gestion globale des utilisateurs";

  const [statsRes, settingsRes] = await Promise.all([
    req("/stats"),
    req("/settings"),
  ]);

  if (statsRes.ok) {
    const { users, cards, aiAlerts } = statsRes.data.stats;
    document.getElementById("statsGrid").innerHTML =
      statCard("Total utilisateurs",     users.total,                "primary") +
      statCard("Admins",                 users.admins                        ) +
      statCard("Étudiants",              users.students                      ) +
      statCard("Bibliothécaires",        users.librarians            || 0    ) +
      statCard("Service scolarité",      users.service_scolarite     || 0    ) +
      statCard("Chargés de cantine",     users.charge_cantine        || 0    ) +
      statCard("Chargés d'imprimerie",   users.charge_imprimerie     || 0    ) +
      statCard("Cartes actives",         cards.active,               "success") +
      statCard("Cartes bloquées",        cards.blocked,              "danger" ) +
      statCard("Alertes IA",             aiAlerts.total                      );
  }

  if (settingsRes.ok) {
    const s = settingsRes.data.settings;
    document.getElementById("setOtpMaxAttempts").value    = s.otp.maxAttempts;
    document.getElementById("setOtpExpiry").value         = s.otp.expiryMinutes;
    document.getElementById("setPasswordMinLength").value = s.password.minLength;
    document.getElementById("setJwtExpiry").value         = s.session.jwtExpiryHours;
    document.getElementById("setPinMaxAttempts").value    = s.pin.maxAttempts;
    document.getElementById("setPinBlockDuration").value  = s.pin.blockDurationMinutes;
  }

  loadGlobalUsers();
}

// ---- ADMIN dashboard ----
async function loadAdminDash() {
  document.getElementById("mgmtTitle").textContent = "Gestion opérationnelle";

  const statsRes = await req("/stats");

  if (statsRes.ok) {
    const { users, cards, aiAlerts } = statsRes.data.stats;
    document.getElementById("statsGrid").innerHTML =
      statCard("Étudiants",              users.students                      ) +
      statCard("Bibliothécaires",        users.librarians            || 0    ) +
      statCard("Service scolarité",      users.service_scolarite     || 0    ) +
      statCard("Chargés de cantine",     users.charge_cantine        || 0    ) +
      statCard("Chargés d'imprimerie",   users.charge_imprimerie     || 0    ) +
      statCard("Cartes actives",         cards.active,               "success") +
      statCard("Cartes bloquées",        cards.blocked,              "danger" ) +
      statCard("Alertes récentes",       aiAlerts.total                      );
  }

  loadOperationalUsers();
}

// ---- Gestion opérationnelle (admin) ----
async function loadOperationalUsers() {
  const el = document.getElementById("dashUsersTable");
  el.innerHTML = `<div class="state-msg">Chargement...</div>`;
  const { ok, data } = await req("/auth/users");
  if (!ok) { el.innerHTML = `<div class="state-msg">${data.message}</div>`; return; }
  if (!data.users.length) { el.innerHTML = `<div class="state-msg">Aucun utilisateur.</div>`; return; }

  // Admin ne voit pas les super_admin ni lui-même dans ce tableau
  const visible = data.users.filter(u => u.role !== "super_admin" && u._id !== me.id);

  el.innerHTML = `
    <table>
      <thead><tr>
        <th>Nom</th><th>Email</th><th>Rôle</th><th>Statut</th><th>Créé le</th><th>Actions</th>
      </tr></thead>
      <tbody>
        ${visible.map(u => {
          const isAdmin   = u.role === "admin";
          const canModify = !isAdmin;

          return `<tr>
            <td>${u.nom} ${u.prenom}</td>
            <td>${u.email}</td>
            <td>${rolesLabels[u.role] || u.role}</td>
            <td>${badge(u.status)}</td>
            <td>${new Date(u.createdAt).toLocaleDateString("fr-FR")}</td>
            <td><div class="td-actions">
              ${canModify ? `<button class="btn-sm btn-ghost op-role"     data-id="${u._id}" data-role="${u.role}">Modifier rôle</button>` : ""}
              ${canModify && u.status !== "disabled" ? `<button class="btn-sm btn-ghost op-disable"  data-id="${u._id}">Désactiver</button>` : ""}
              ${canModify && u.status !== "active"   ? `<button class="btn-sm btn-ghost op-activate" data-id="${u._id}">Réactiver</button>`  : ""}
              <button class="btn-sm btn-ghost op-details" data-user='${JSON.stringify({
                nom: u.nom, prenom: u.prenom, email: u.email,
                role: u.role, status: u.status,
                createdAt: u.createdAt, lastLogin: u.lastLogin
              })}'>Voir détails</button>
            </div></td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>`;

  el.querySelectorAll(".op-role").forEach(btn =>
    btn.addEventListener("click", () => openRoleModal(btn.dataset.id, btn.dataset.role))
  );
  el.querySelectorAll(".op-disable").forEach(btn =>
    btn.addEventListener("click", () => quickStatus(btn.dataset.id, "disabled", loadOperationalUsers))
  );
  el.querySelectorAll(".op-activate").forEach(btn =>
    btn.addEventListener("click", () => quickStatus(btn.dataset.id, "active", loadOperationalUsers))
  );
  el.querySelectorAll(".op-details").forEach(btn =>
    btn.addEventListener("click", () => openDetailsModal(JSON.parse(btn.dataset.user)))
  );
}

// Utilisateurs dans le dashboard (actions directes)
let globalUsersCache = [];

async function loadGlobalUsers() {
  const el = document.getElementById("globalUsersTable");
  el.innerHTML = `<div class="state-msg">Chargement...</div>`;
  const { ok, data } = await req("/auth/users");
  if (!ok) { el.innerHTML = `<div class="state-msg">${data.message}</div>`; return; }
  if (!data.users.length) { el.innerHTML = `<div class="state-msg">Aucun utilisateur.</div>`; return; }

  globalUsersCache = data.users;

  el.innerHTML = `
    <table>
      <thead><tr>
        <th>Nom</th><th>Email</th><th>Rôle</th><th>Statut</th><th>Créé le</th><th>Actions</th>
      </tr></thead>
      <tbody>
        ${data.users.map(u => {
          const isSelf  = u._id === me.id;
          const isSuper = u.role === "super_admin";
          const canAct  = !isSelf && !isSuper;

          return `<tr>
            <td>${u.nom} ${u.prenom}</td>
            <td>${u.email}</td>
            <td>${rolesLabels[u.role] || u.role}</td>
            <td>${badge(u.status)}</td>
            <td>${new Date(u.createdAt).toLocaleDateString("fr-FR")}</td>
            <td><div class="td-actions">
              ${canAct ? `<button class="btn-sm btn-ghost gu-role"     data-id="${u._id}" data-role="${u.role}">Modifier rôle</button>` : ""}
              ${canAct && u.status !== "disabled" ? `<button class="btn-sm btn-ghost gu-disable"  data-id="${u._id}">Désactiver</button>` : ""}
              ${canAct && u.status !== "active"   ? `<button class="btn-sm btn-ghost gu-activate" data-id="${u._id}">Réactiver</button>` : ""}
              ${canAct ? `<button class="btn-sm btn-ghost gu-delete"   data-id="${u._id}" data-nom="${u.nom} ${u.prenom}">Supprimer</button>` : ""}
            </div></td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>`;

  el.querySelectorAll(".gu-role").forEach(btn =>
    btn.addEventListener("click", () => openRoleModal(btn.dataset.id, btn.dataset.role))
  );
  el.querySelectorAll(".gu-disable").forEach(btn =>
    btn.addEventListener("click", () => quickStatus(btn.dataset.id, "disabled", loadGlobalUsers))
  );
  el.querySelectorAll(".gu-activate").forEach(btn =>
    btn.addEventListener("click", () => quickStatus(btn.dataset.id, "active", loadGlobalUsers))
  );
  el.querySelectorAll(".gu-delete").forEach(btn =>
    btn.addEventListener("click", () => deleteUser(btn.dataset.id, btn.dataset.nom))
  );
}

async function quickStatus(userId, status, reload) {
  const { ok, data } = await req(`/auth/users/${userId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
  if (!ok) { alert(data.message); return; }
  reload();
}

document.getElementById("saveSettingsBtn")?.addEventListener("click", async () => {
  clearMsg("msgSettings");

  const body = {
    otp: {
      maxAttempts:   parseInt(document.getElementById("setOtpMaxAttempts").value),
      expiryMinutes: parseInt(document.getElementById("setOtpExpiry").value),
    },
    password: {
      minLength: parseInt(document.getElementById("setPasswordMinLength").value),
    },
    pin: {
      maxAttempts:          parseInt(document.getElementById("setPinMaxAttempts").value),
      blockDurationMinutes: parseInt(document.getElementById("setPinBlockDuration").value),
    },
    session: {
      jwtExpiryHours: parseInt(document.getElementById("setJwtExpiry").value),
    },
  };

  const { ok, data } = await req("/settings", { method: "PATCH", body: JSON.stringify(body) });
  showMsg("msgSettings", data.message, ok ? "success" : "error");
});

// =============================================================
// DEMANDES DE CARTE
// =============================================================
const caStatusLabels = { pending: "En attente", approved: "Approuvée", rejected: "Rejetée" };
const caStatusColors = { pending: "badge-inactive", approved: "badge-active", rejected: "badge-blocked" };
let currentCaFilter = "pending";

document.querySelectorAll(".ca-filter-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".ca-filter-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentCaFilter = btn.dataset.status;
    loadCardApplications();
  });
});

async function loadCardApplications() {
  const el = document.getElementById("cardAppsTable");
  el.innerHTML = `<div class="state-msg">Chargement...</div>`;
  const query = currentCaFilter ? `?status=${currentCaFilter}` : "";
  const { ok, data } = await req(`/card-applications${query}`);
  if (!ok) { el.innerHTML = `<div class="state-msg">${data.message}</div>`; return; }
  if (!data.applications.length) { el.innerHTML = `<div class="state-msg">Aucune demande.</div>`; return; }

  el.innerHTML = `
    <table>
      <thead><tr>
        <th>Étudiant</th><th>Matricule</th><th>Filière</th><th>Niveau</th>
        <th>Année acad.</th><th>Date</th><th>Statut</th><th>Actions</th>
      </tr></thead>
      <tbody>
        ${data.applications.map(a => {
          const s = a.studentId;
          return `<tr>
            <td>${s ? `${s.prenom} ${s.nom}` : "—"}</td>
            <td>${s?.matricule || "—"}</td>
            <td>${s?.filiere || "—"}</td>
            <td>${s?.niveau || "—"}</td>
            <td>${a.anneeAcademique}</td>
            <td>${new Date(a.createdAt).toLocaleDateString("fr-FR")}</td>
            <td><span class="badge ${caStatusColors[a.status]}">${caStatusLabels[a.status]}</span></td>
            <td><div class="td-actions">
              <span style="font-size:12px;color:var(--muted);font-style:italic">
                Validation réservée au service scolarité
              </span>
            </div></td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>`;

  el.querySelectorAll(".ca-approve").forEach(btn =>
    btn.addEventListener("click", () => openApproveCardApp(btn.dataset.id, btn.dataset.name))
  );
  el.querySelectorAll(".ca-reject").forEach(btn =>
    btn.addEventListener("click", () => openRejectCardApp(btn.dataset.id))
  );
}

let approveCardAppId = null;
function openApproveCardApp(id, name) {
  approveCardAppId = id;
  document.getElementById("approveCardAppInfo").textContent = `Étudiant : ${name}`;
  clearMsg("approveCardAppMsg");
  document.getElementById("approveCardAppModal").classList.remove("hidden");
}
document.getElementById("approveCardAppCancel").addEventListener("click", () =>
  document.getElementById("approveCardAppModal").classList.add("hidden")
);
document.getElementById("approveCardAppConfirm").addEventListener("click", async () => {
  clearMsg("approveCardAppMsg");
  const { ok, data } = await req(`/card-applications/${approveCardAppId}/approve`, {
    method: "PATCH",
    body: JSON.stringify({}),
  });
  if (!ok) { showMsg("approveCardAppMsg", data.message); return; }
  document.getElementById("approveCardAppModal").classList.add("hidden");
  loadCardApplications();
});

let rejectCardAppId = null;
function openRejectCardApp(id) {
  rejectCardAppId = id;
  document.getElementById("rejectCardAppReason").value = "";
  clearMsg("rejectCardAppMsg");
  document.getElementById("rejectCardAppModal").classList.remove("hidden");
}
document.getElementById("rejectCardAppCancel").addEventListener("click", () =>
  document.getElementById("rejectCardAppModal").classList.add("hidden")
);
document.getElementById("rejectCardAppConfirm").addEventListener("click", async () => {
  const reason = document.getElementById("rejectCardAppReason").value.trim();
  clearMsg("rejectCardAppMsg");
  const { ok, data } = await req(`/card-applications/${rejectCardAppId}/reject`, {
    method: "PATCH",
    body: JSON.stringify({ reason }),
  });
  if (!ok) { showMsg("rejectCardAppMsg", data.message); return; }
  document.getElementById("rejectCardAppModal").classList.add("hidden");
  loadCardApplications();
});

// =============================================================
// INSCRIPTIONS
// =============================================================
const statusLabels = {
  pending_email_verification: "En attente d'email",
  email_verified:             "Email vérifié",
  approved:                   "Approuvée",
  rejected:                   "Rejetée",
};
const statusColors = {
  pending_email_verification: "badge-inactive",
  email_verified:             "badge-active",
  approved:                   "badge-active",
  rejected:                   "badge-blocked",
};

let currentRegFilter = "email_verified";

document.querySelectorAll(".reg-filter-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".reg-filter-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentRegFilter = btn.dataset.status;
    loadRegistrations();
  });
});

async function loadRegistrations() {
  const el = document.getElementById("registrationsTable");
  el.innerHTML = `<div class="state-msg">Chargement...</div>`;

  const query = currentRegFilter ? `?status=${currentRegFilter}` : "";
  const { ok, data } = await req(`/registration${query}`);
  if (!ok) { el.innerHTML = `<div class="state-msg">${data.message}</div>`; return; }
  if (!data.registrations.length) {
    el.innerHTML = `<div class="state-msg">Aucune inscription dans cette catégorie.</div>`;
    return;
  }

  el.innerHTML = `
    <table>
      <thead><tr>
        <th>Nom</th><th>Email</th><th>Filière</th><th>Niveau</th>
        <th>Date</th><th>Statut</th><th>Actions</th>
      </tr></thead>
      <tbody>
        ${data.registrations.map(r => `
          <tr>
            <td>${r.prenom} ${r.nom}</td>
            <td>${r.email}</td>
            <td>${r.filiere}</td>
            <td>${r.niveau}</td>
            <td>${new Date(r.createdAt).toLocaleDateString("fr-FR")}</td>
            <td><span class="badge ${statusColors[r.status] || ''}">${statusLabels[r.status] || r.status}</span></td>
            <td><div class="td-actions">
              ${r.status === "email_verified" ? `
                <button class="btn-sm btn-ghost reg-approve" data-id="${r._id}" data-name="${r.prenom} ${r.nom}">Approuver</button>
                <button class="btn-sm btn-ghost reg-reject"  data-id="${r._id}">Rejeter</button>
              ` : "—"}
            </div></td>
          </tr>
        `).join("")}
      </tbody>
    </table>`;

  el.querySelectorAll(".reg-approve").forEach(btn =>
    btn.addEventListener("click", () => openApproveModal(btn.dataset.id, btn.dataset.name))
  );
  el.querySelectorAll(".reg-reject").forEach(btn =>
    btn.addEventListener("click", () => openRejectModal(btn.dataset.id))
  );
}

// Approve modal
let approveRegId = null;
function openApproveModal(id, name) {
  approveRegId = id;
  document.getElementById("approveModalInfo").textContent = `Étudiant : ${name}`;
  clearMsg("approveModalMsg");
  document.getElementById("approveModal").classList.remove("hidden");
}
document.getElementById("approveModalCancel").addEventListener("click", () =>
  document.getElementById("approveModal").classList.add("hidden")
);
document.getElementById("approveModalConfirm").addEventListener("click", async () => {
  clearMsg("approveModalMsg");

  const { ok, data } = await req(`/registration/${approveRegId}/approve`, {
    method: "PATCH",
    body: JSON.stringify({}),
  });
  if (!ok) { showMsg("approveModalMsg", data.message); return; }

  document.getElementById("approveModal").classList.add("hidden");
  loadRegistrations();
});

// Reject modal
let rejectRegId = null;
function openRejectModal(id) {
  rejectRegId = id;
  document.getElementById("rejectReason").value = "";
  clearMsg("rejectModalMsg");
  document.getElementById("rejectModal").classList.remove("hidden");
}
document.getElementById("rejectModalCancel").addEventListener("click", () =>
  document.getElementById("rejectModal").classList.add("hidden")
);
document.getElementById("rejectModalConfirm").addEventListener("click", async () => {
  const reason = document.getElementById("rejectReason").value.trim();
  clearMsg("rejectModalMsg");

  const { ok, data } = await req(`/registration/${rejectRegId}/reject`, {
    method: "PATCH",
    body: JSON.stringify({ reason }),
  });
  if (!ok) { showMsg("rejectModalMsg", data.message); return; }

  document.getElementById("rejectModal").classList.add("hidden");
  loadRegistrations();
});


// =============================================================
// RECHERCHE ÉTUDIANTS
// =============================================================
let searchTimeout;

document.getElementById("studentSearch").addEventListener("input", (e) => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    filterStudents(e.target.value);
  }, 300); // Délai de 300ms pour éviter trop d'appels
});

document.getElementById("clearSearchBtn").addEventListener("click", () => {
  document.getElementById("studentSearch").value = "";
  filterStudents("");
});

// Gestionnaire pour Enter
document.getElementById("studentSearch").addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    clearTimeout(searchTimeout);
    filterStudents(e.target.value);
  }
});

// =============================================================
// INIT
// =============================================================
