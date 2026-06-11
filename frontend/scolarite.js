const API = "http://localhost:5000/api";

const token = localStorage.getItem("token");
const me    = JSON.parse(localStorage.getItem("user") || "null");
const allowed = ["super_admin", "admin", "service_scolarite"];
if (!token || !me || !allowed.includes(me.role)) {
  window.location.href = "index.html";
}

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

document.getElementById("sbName").textContent = `${me.prenom} ${me.nom}`;

// Tabs
document.querySelectorAll(".nav-item[data-tab]").forEach(item => {
  item.addEventListener("click", () => {
    document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
    item.classList.add("active");
    document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
    document.getElementById(`tab-${item.dataset.tab}`)?.classList.add("active");
    if (item.dataset.tab === "applications") loadApplications();
    if (item.dataset.tab === "students")     loadStudents();
    if (item.dataset.tab === "account")      loadAccount();
  });
});

// Logout
document.getElementById("logoutBtn").addEventListener("click", async () => {
  try { await req("/auth/logout", { method: "POST" }); } catch {}
  localStorage.clear();
  window.location.href = "index.html";
});

// ── Statut scolarité labels & badges ─────────────────────────────────────────
const statutLabels = {
  en_attente:       "En attente",
  en_regle:         "En règle",
  non_en_regle:     "Non en règle",
  paiement_partiel: "Paiement partiel",
  exonere:          "Exonéré",
};
const statutColors = {
  en_attente:       "badge-inactive",
  en_regle:         "badge-active",
  non_en_regle:     "badge-blocked",
  paiement_partiel: "badge-expired",
  exonere:          "badge-active",
};
const appStatusLabels = { pending: "En attente", approved: "Validée", rejected: "Refusée" };
const appStatusColors = { pending: "badge-inactive", approved: "badge-active", rejected: "badge-blocked" };

function badge(cls, text) {
  return `<span class="badge ${cls}">${text}</span>`;
}

// =============================================================
// A. DEMANDES D'INSCRIPTION
// =============================================================
let appFilter = "pending";

document.querySelectorAll(".sc-filter").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".sc-filter").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    appFilter = btn.dataset.status;
    loadApplications();
  });
});

async function loadApplications() {
  const el = document.getElementById("applicationsTable");
  el.innerHTML = `<div class="state-msg">Chargement...</div>`;
  const query = appFilter ? `?status=${appFilter}` : "";
  const { ok, data } = await req(`/scolarite/applications${query}`);
  if (!ok) { el.innerHTML = `<div class="state-msg">${data.message}</div>`; return; }
  if (!data.applications.length) { el.innerHTML = `<div class="state-msg">Aucune demande.</div>`; return; }

  el.innerHTML = `
    <table>
      <thead><tr>
        <th>Nom</th><th>Prénom</th><th>Matricule</th><th>Email</th>
        <th>Filière</th><th>Niveau</th><th>Statut inscription</th>
        <th>Statut scolarité</th><th>Date</th><th>Actions</th>
      </tr></thead>
      <tbody>
        ${data.applications.map(a => {
          const s = a.studentId;
          return `<tr>
            <td>${s?.nom || "—"}</td>
            <td>${s?.prenom || "—"}</td>
            <td>${s?.matricule || "—"}</td>
            <td style="font-size:12px">${s?.email || "—"}</td>
            <td>${s?.filiere || "—"}</td>
            <td>${s?.niveau || "—"}</td>
            <td>${badge(appStatusColors[a.status], appStatusLabels[a.status])}</td>
            <td>${s ? badge(statutColors[s.statutScolarite], statutLabels[s.statutScolarite]) : "—"}</td>
            <td style="font-size:12px">${new Date(a.createdAt).toLocaleDateString("fr-FR")}</td>
            <td><div class="td-actions">
              <button class="btn-sm btn-ghost app-detail" data-app='${JSON.stringify({
                anneeAcademique: a.anneeAcademique,
                notes: a.notes,
                photoUrl: a.photoUrl,
                createdAt: a.createdAt,
                rejectionReason: a.rejectionReason,
              })}' data-student='${JSON.stringify({
                nom: s?.nom, prenom: s?.prenom, matricule: s?.matricule,
                email: s?.email, filiere: s?.filiere, niveau: s?.niveau,
                departement: s?.departement,
                statutScolarite: s?.statutScolarite,
                commentaireScolarite: s?.commentaireScolarite,
              })}'>Détail</button>
              ${s ? `<button class="btn-sm btn-ghost app-statut" data-id="${s._id}" data-nom="${s.prenom} ${s.nom}" data-statut="${s.statutScolarite}">Statut</button>` : ""}
              ${a.status === "pending" ? `
                <button class="btn-sm btn-ghost app-validate" data-id="${a._id}" data-nom="${s?.prenom} ${s?.nom}">Valider</button>
                <button class="btn-sm btn-ghost app-refuse"   data-id="${a._id}">Refuser</button>
              ` : ""}
            </div></td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>`;

  el.querySelectorAll(".app-detail").forEach(btn => btn.addEventListener("click", () => {
    openDetail(JSON.parse(btn.dataset.student), JSON.parse(btn.dataset.app));
  }));
  el.querySelectorAll(".app-statut").forEach(btn => btn.addEventListener("click", () => {
    openStatutModal(btn.dataset.id, btn.dataset.nom, btn.dataset.statut);
  }));
  el.querySelectorAll(".app-validate").forEach(btn => btn.addEventListener("click", () => {
    openValidateModal(btn.dataset.id, btn.dataset.nom);
  }));
  el.querySelectorAll(".app-refuse").forEach(btn => btn.addEventListener("click", () => {
    openRefuseModal(btn.dataset.id);
  }));
}

// =============================================================
// B. ÉTUDIANTS INSCRITS
// =============================================================
let studFilter = "";

document.querySelectorAll(".ss-filter").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".ss-filter").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    studFilter = btn.dataset.status;
    loadStudents();
  });
});

async function loadStudents() {
  const el = document.getElementById("studentsTable");
  el.innerHTML = `<div class="state-msg">Chargement...</div>`;
  const query = studFilter ? `?statutScolarite=${studFilter}` : "";
  const { ok, data } = await req(`/scolarite/students${query}`);
  if (!ok) { el.innerHTML = `<div class="state-msg">${data.message}</div>`; return; }
  if (!data.students.length) { el.innerHTML = `<div class="state-msg">Aucun étudiant.</div>`; return; }

  el.innerHTML = `
    <table>
      <thead><tr>
        <th>Matricule</th><th>Nom</th><th>Prénom</th><th>Email</th>
        <th>Filière</th><th>Niveau</th><th>Statut étudiant</th>
        <th>Statut scolarité</th><th>Statut carte</th><th>Actions</th>
      </tr></thead>
      <tbody>
        ${data.students.map(s => {
          const carteLabel = s.statutCarte
            ? statutLabels[s.statutCarte] || s.statutCarte
            : "Aucune carte";
          const carteBadge = s.statutCarte
            ? `<span class="badge badge-${s.statutCarte === "active" ? "active" : "inactive"}">${carteLabel}</span>`
            : `<span class="badge badge-inactive">Aucune carte</span>`;

          return `<tr>
            <td>${s.matricule}</td>
            <td>${s.nom}</td>
            <td>${s.prenom}</td>
            <td style="font-size:12px">${s.email}</td>
            <td>${s.filiere}</td>
            <td>${s.niveau}</td>
            <td>${badge(s.status === "active" ? "badge-active" : "badge-blocked", s.status)}</td>
            <td>${badge(statutColors[s.statutScolarite], statutLabels[s.statutScolarite])}</td>
            <td>${carteBadge}</td>
            <td>
              <button class="btn-sm btn-ghost stud-statut" data-id="${s._id}" data-nom="${s.prenom} ${s.nom}" data-statut="${s.statutScolarite}">Modifier statut</button>
            </td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>`;

  el.querySelectorAll(".stud-statut").forEach(btn => btn.addEventListener("click", () => {
    openStatutModal(btn.dataset.id, btn.dataset.nom, btn.dataset.statut, true);
  }));
}

// =============================================================
// MODAL : DÉTAIL
// =============================================================
function openDetail(student, app) {
  document.getElementById("detailContent").innerHTML = `
    <div class="detail-row"><span>Nom complet</span><strong>${student.prenom} ${student.nom}</strong></div>
    <div class="detail-row"><span>Matricule</span><strong>${student.matricule || "—"}</strong></div>
    <div class="detail-row"><span>Email</span><strong>${student.email}</strong></div>
    <div class="detail-row"><span>Filière</span><strong>${student.filiere || "—"}</strong></div>
    <div class="detail-row"><span>Niveau</span><strong>${student.niveau || "—"}</strong></div>
    <div class="detail-row"><span>Département</span><strong>${student.departement || "—"}</strong></div>
    <div class="detail-row"><span>Année académique</span><strong>${app.anneeAcademique || "—"}</strong></div>
    <div class="detail-row"><span>Statut scolarité</span>${badge(statutColors[student.statutScolarite], statutLabels[student.statutScolarite])}</div>
    ${student.commentaireScolarite ? `<div class="detail-row"><span>Commentaire</span><strong>${student.commentaireScolarite}</strong></div>` : ""}
    ${app.notes ? `<div class="detail-row"><span>Notes étudiant</span><strong>${app.notes}</strong></div>` : ""}
    <div class="detail-row"><span>Soumis le</span><strong>${new Date(app.createdAt).toLocaleDateString("fr-FR")}</strong></div>
  `;
  document.getElementById("detailModal").classList.remove("hidden");
}
document.getElementById("detailClose").addEventListener("click", () =>
  document.getElementById("detailModal").classList.add("hidden")
);

// =============================================================
// MODAL : STATUT SCOLARITÉ
// =============================================================
let statutStudentId = null;
let statutReloadFn  = loadApplications;

function openStatutModal(id, nom, current, fromStudents = false) {
  statutStudentId = id;
  statutReloadFn  = fromStudents ? loadStudents : loadApplications;
  document.getElementById("statutModalInfo").textContent = `Étudiant : ${nom}`;
  document.getElementById("statutSelect").value = current;
  document.getElementById("statutComment").value = "";
  clearMsg("statutMsg");
  document.getElementById("statutModal").classList.remove("hidden");
}
document.getElementById("statutCancel").addEventListener("click", () =>
  document.getElementById("statutModal").classList.add("hidden")
);
document.getElementById("statutConfirm").addEventListener("click", async () => {
  clearMsg("statutMsg");
  const { ok, data } = await req(`/scolarite/students/${statutStudentId}/statut`, {
    method: "PATCH",
    body: JSON.stringify({
      statutScolarite: document.getElementById("statutSelect").value,
      commentaire:     document.getElementById("statutComment").value.trim(),
    }),
  });
  if (!ok) { showMsg("statutMsg", data.message); return; }
  document.getElementById("statutModal").classList.add("hidden");
  statutReloadFn();
});

// =============================================================
// MODAL : VALIDER INSCRIPTION
// =============================================================
let validateAppId = null;
function openValidateModal(id, nom) {
  validateAppId = id;
  document.getElementById("validateInfo").textContent = `Étudiant : ${nom}`;
  clearMsg("validateMsg");
  document.getElementById("validateModal").classList.remove("hidden");
}
document.getElementById("validateCancel").addEventListener("click", () =>
  document.getElementById("validateModal").classList.add("hidden")
);
document.getElementById("validateConfirm").addEventListener("click", async () => {
  clearMsg("validateMsg");
  const { ok, data } = await req(`/scolarite/applications/${validateAppId}/validate`, {
    method: "PATCH",
    body: JSON.stringify({}),
  });
  if (!ok) { showMsg("validateMsg", data.message); return; }
  document.getElementById("validateModal").classList.add("hidden");
  loadApplications();
});

// =============================================================
// MODAL : REFUSER INSCRIPTION
// =============================================================
let refuseAppId = null;
function openRefuseModal(id) {
  refuseAppId = id;
  document.getElementById("refuseReason").value = "";
  clearMsg("refuseMsg");
  document.getElementById("refuseModal").classList.remove("hidden");
}
document.getElementById("refuseCancel").addEventListener("click", () =>
  document.getElementById("refuseModal").classList.add("hidden")
);
document.getElementById("refuseConfirm").addEventListener("click", async () => {
  const reason = document.getElementById("refuseReason").value.trim();
  clearMsg("refuseMsg");
  const { ok, data } = await req(`/scolarite/applications/${refuseAppId}/reject`, {
    method: "PATCH",
    body: JSON.stringify({ reason }),
  });
  if (!ok) { showMsg("refuseMsg", data.message); return; }
  document.getElementById("refuseModal").classList.add("hidden");
  loadApplications();
});

// =============================================================
// C. MON COMPTE
// =============================================================
function loadAccount() {
  document.getElementById("accountName").textContent = `${me.prenom} ${me.nom}`;
  document.getElementById("accountEmail").textContent = me.email;

  // Réinitialiser le formulaire
  document.getElementById("currentPassword").value = "";
  document.getElementById("newPassword").value = "";
  document.getElementById("confirmPassword").value = "";
  clearMsg("passwordMsg");
}

// Gestionnaire pour le changement de mot de passe
document.getElementById("changePasswordBtn").addEventListener("click", async () => {
  clearMsg("passwordMsg");

  const currentPassword = document.getElementById("currentPassword").value.trim();
  const newPassword = document.getElementById("newPassword").value.trim();
  const confirmPassword = document.getElementById("confirmPassword").value.trim();

  // Validations
  if (!currentPassword || !newPassword || !confirmPassword) {
    showMsg("passwordMsg", "Veuillez remplir tous les champs.");
    return;
  }

  if (newPassword !== confirmPassword) {
    showMsg("passwordMsg", "Les nouveaux mots de passe ne correspondent pas.");
    return;
  }

  if (newPassword.length < 6) {
    showMsg("passwordMsg", "Le nouveau mot de passe doit contenir au moins 6 caractères.");
    return;
  }

  // Appel API
  const { ok, data } = await req("/auth/change-password", {
    method: "PATCH",
    body: JSON.stringify({
      oldPassword: currentPassword,
      newPassword: newPassword,
    }),
  });

  if (!ok) {
    showMsg("passwordMsg", data.message);
    return;
  }

  showMsg("passwordMsg", "Mot de passe changé avec succès !", "success");

  // Réinitialiser le formulaire
  document.getElementById("currentPassword").value = "";
  document.getElementById("newPassword").value = "";
  document.getElementById("confirmPassword").value = "";

  // Mettre à jour les données utilisateur si mustChangePassword était true
  if (data.user) {
    const updatedUser = { ...me, ...data.user };
    localStorage.setItem("user", JSON.stringify(updatedUser));
  }
});

// =============================================================
// INIT
// =============================================================
loadApplications();
