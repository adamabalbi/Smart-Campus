// Espace agent financier — gestion des frais de scolarité.
const API = (window.SMART_CAMPUS_CONFIG && window.SMART_CAMPUS_CONFIG.API_BASE_URL) || "http://localhost:5000/api";
const token = localStorage.getItem("token");
if (!token) window.location.href = "index.html";

const fmt = (n) => Number(n || 0).toLocaleString("fr-FR") + " XOF";
// Échappe le HTML avant insertion via innerHTML (anti-XSS stocké).
const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
));
const STATUS_FR = { paid: "Soldé", partial: "Partiel", unpaid: "Non payé", exempted: "Exonéré" };
const STATUS_CLASS = { paid: "st-paid", partial: "st-partial", unpaid: "st-unpaid", exempted: "st-exempted" };

// Année par défaut : année académique courante (sept→août)
function defaultYear() {
  const now = new Date();
  const y = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return `${y}-${y + 1}`;
}

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
  if (res.status === 401 || res.status === 403) { localStorage.clear(); window.location.href = "index.html"; }
  return res;
}

function toast(msg, ok = true) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.style.background = ok ? "#2F6F4F" : "#B85C5C";
  t.style.display = "block";
  setTimeout(() => (t.style.display = "none"), 3500);
}

const yearInput = document.getElementById("yearInput");
yearInput.value = defaultYear();

// --- Onglets ---
document.querySelectorAll(".tab").forEach((tab) => {
  tab.onclick = () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById("panel-" + tab.dataset.tab).classList.add("active");
    if (tab.dataset.tab === "report") loadReport();
  };
});

// --- Stats ---
async function loadStats() {
  const year = yearInput.value.trim();
  const res = await api("/scholarship/stats?academicYear=" + encodeURIComponent(year));
  if (!res || !res.ok) return;
  const s = await res.json();
  document.getElementById("statsGrid").innerHTML = `
    <div class="stat"><div class="num">${fmt(s.totalCollected)}</div><div class="lbl">Collecté</div></div>
    <div class="stat"><div class="num">${fmt(s.totalRemaining)}</div><div class="lbl">Reste à collecter</div></div>
    <div class="stat"><div class="num">${s.collectionRate}%</div><div class="lbl">Taux de collecte</div></div>
    <div class="stat"><div class="num">${s.byStatus.paid}</div><div class="lbl">Soldés</div></div>
    <div class="stat"><div class="num">${s.byStatus.partial}</div><div class="lbl">Partiels</div></div>
    <div class="stat"><div class="num">${s.byStatus.unpaid}</div><div class="lbl">Non payés</div></div>`;
}

// --- Liste ---
async function loadList() {
  const status = document.getElementById("filterStatus").value;
  const year = yearInput.value.trim();
  const qs = new URLSearchParams({ academicYear: year });
  if (status) qs.set("status", status);
  const res = await api("/scholarship/list?" + qs.toString());
  if (!res || !res.ok) return;
  const { fees } = await res.json();
  const body = document.getElementById("listBody");
  if (!fees.length) { body.innerHTML = '<tr><td colspan="8" style="opacity:.7;">Aucun dossier.</td></tr>'; return; }
  body.innerHTML = fees.map((f) => {
    const s = f.studentId || {};
    return `<tr>
      <td>${esc(s.prenom)} ${esc(s.nom)}<br><span style="opacity:.6;font-size:.8rem;">${esc(s.matricule)}</span></td>
      <td>${esc(s.filiere || "—")} / ${esc(s.niveau)}</td>
      <td>${esc(f.academicYear)}</td>
      <td>${fmt(f.totalAmount)}</td>
      <td>${fmt(f.amountPaid)}</td>
      <td>${fmt(f.remainingAmount)}</td>
      <td><span class="fee-status ${STATUS_CLASS[f.status]}">${STATUS_FR[f.status]}</span></td>
      <td><span class="link" data-student="${esc(s._id)}">Détail</span></td>
    </tr>`;
  }).join("");
  body.querySelectorAll(".link[data-student]").forEach((el) => {
    el.onclick = () => openDetail(el.dataset.student);
  });
}

// --- Détail d'un étudiant ---
async function openDetail(studentId) {
  const res = await api("/scholarship/student/" + studentId);
  if (!res || !res.ok) { toast("Détail indisponible", false); return; }
  const { student, fees } = await res.json();
  const body = document.getElementById("detailBody");
  body.innerHTML = `
    <p><strong>${esc(student.prenom)} ${esc(student.nom)}</strong> — ${esc(student.matricule)}<br>
    <span style="opacity:.7;">${esc(student.filiere)} / ${esc(student.niveau)} — ${esc(student.email)}</span><br>
    <span class="note" style="font-size:.78rem; opacity:.6;">ID: ${esc(student._id)}</span></p>
    ${fees.map((f) => `
      <div style="border-top:1px solid rgba(255,255,255,0.1); padding-top:.8rem; margin-top:.8rem;">
        <div style="display:flex; justify-content:space-between;"><strong>${esc(f.academicYear)}</strong>
          <span class="fee-status ${STATUS_CLASS[f.status]}">${STATUS_FR[f.status]}</span></div>
        <div class="svc-info-row"><span>Total</span><strong>${fmt(f.totalAmount)}</strong></div>
        <div class="svc-info-row"><span>Payé</span><strong>${fmt(f.amountPaid)}</strong></div>
        <div class="svc-info-row"><span>Reste</span><strong>${fmt(f.remainingAmount)}</strong></div>
        <div style="margin-top:.5rem;">
          <label class="field-label">Modifier le statut</label>
          <select class="input statusSel" data-fee="${f._id}">
            ${["unpaid", "partial", "paid", "exempted"].map((st) => `<option value="${st}" ${st === f.status ? "selected" : ""}>${STATUS_FR[st]}</option>`).join("")}
          </select>
          <button class="btn" data-savefee="${f._id}" style="margin-top:.4rem;">Appliquer</button>
        </div>
      </div>`).join("") || "<p>Aucun dossier.</p>"}`;

  body.querySelectorAll("[data-savefee]").forEach((btn) => {
    btn.onclick = async () => {
      const feeId = btn.dataset.savefee;
      const sel = body.querySelector(`.statusSel[data-fee="${feeId}"]`);
      const r = await api(`/scholarship/${feeId}/status`, { method: "PATCH", body: JSON.stringify({ status: sel.value }) });
      if (r && r.ok) { toast("Statut mis à jour"); loadList(); loadStats(); }
      else toast("Échec de la mise à jour", false);
    };
  });
  document.getElementById("detailModal").style.display = "flex";
}
document.getElementById("closeDetail").onclick = () => (document.getElementById("detailModal").style.display = "none");

// --- Encaisser ---
document.getElementById("payBtn").onclick = async () => {
  const uid = document.getElementById("payUid").value.trim();
  const pin = document.getElementById("payPin").value.trim();
  const academicYear = document.getElementById("payYear").value.trim() || yearInput.value.trim();
  const amount = document.getElementById("payAmount").value.trim();
  const out = document.getElementById("payResult");
  if (!uid || !pin) { out.innerHTML = '<p style="color:#EAD3D0;">UID et PIN requis.</p>'; return; }

  const payload = { uid, pin, academicYear, idempotencyKey: `fin-${uid}-${Date.now()}` };
  if (amount) payload.amount = parseInt(amount, 10);

  out.innerHTML = "Traitement…";
  const res = await api("/scholarship/pay", { method: "POST", body: JSON.stringify(payload) });
  const data = await res.json();
  if (res.ok && data.success) {
    const r = data.data.receipt;
    out.innerHTML = `<div class="svc-card" style="background:rgba(95,141,78,0.18);">
      <strong><i class="fa-solid fa-circle-check"></i> Paiement encaissé</strong>
      <div class="svc-info-row"><span>Reçu</span><strong>${esc(r.receiptNumber)}</strong></div>
      <div class="svc-info-row"><span>Étudiant</span><strong>${esc(r.studentName)} (${esc(r.matricule)})</strong></div>
      <div class="svc-info-row"><span>Montant</span><strong>${fmt(r.amount)}</strong></div>
      <div class="svc-info-row"><span>Reste dû</span><strong>${fmt(r.remaining)}</strong></div>
      <div class="svc-info-row"><span>Statut</span><strong>${STATUS_FR[r.status]}</strong></div>
      <button class="btn" data-receipt="${data.data.transaction._id}"><i class="fa-solid fa-file-pdf"></i> Télécharger le reçu PDF</button>
      ${data.aiDecision === "suspect" ? '<p style="color:#E0A458;margin-top:.5rem;"><i class="fa-solid fa-robot"></i> ⚠️ Paiement signalé suspect par l\'IA (alerte créée).</p>' : ""}
    </div>`;
    document.getElementById("payPin").value = "";
    document.getElementById("payAmount").value = "";
    const rb = out.querySelector("[data-receipt]");
    if (rb) rb.onclick = () => downloadReceipt(rb.dataset.receipt);
    loadStats(); loadList();
  } else {
    let msg = data.message || "Échec du paiement.";
    if (data.missing) msg += ` Montant manquant : ${fmt(data.missing)}.`;
    out.innerHTML = `<p style="color:#EAD3D0;"><i class="fa-solid fa-circle-xmark"></i> ${msg}</p>`;
  }
};

// Télécharge le reçu PDF avec l'en-tête d'authentification (blob).
async function downloadReceipt(txId) {
  const res = await fetch(`${API}/scholarship/receipt/${txId}?download=1`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) { toast("Reçu indisponible", false); return; }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = `recu_${txId}.pdf`; a.click();
  URL.revokeObjectURL(url);
}

// --- Créer dossier ---
document.getElementById("createBtn").onclick = async () => {
  const studentId = document.getElementById("cStudentId").value.trim();
  const academicYear = document.getElementById("cYear").value.trim() || yearInput.value.trim();
  const totalAmount = document.getElementById("cTotal").value.trim();
  const out = document.getElementById("createResult");
  if (!studentId || !totalAmount) { out.innerHTML = '<p style="color:#EAD3D0;">ID étudiant et montant requis.</p>'; return; }
  const res = await api("/scholarship/fees", { method: "POST", body: JSON.stringify({ studentId, academicYear, totalAmount: parseInt(totalAmount, 10) }) });
  const data = await res.json();
  if (res.ok) { out.innerHTML = `<p style="color:#8FBE7A;">✔ ${data.message}</p>`; loadStats(); loadList(); }
  else out.innerHTML = `<p style="color:#EAD3D0;">${data.message || "Erreur."}</p>`;
};

// --- Rapport ---
async function loadReport() {
  const year = yearInput.value.trim();
  const res = await api("/scholarship/stats?academicYear=" + encodeURIComponent(year));
  if (!res || !res.ok) return;
  const s = await res.json();
  document.getElementById("reportBox").innerHTML = `
    <h2 style="margin-top:0;">Rapport de collecte — ${year}</h2>
    <div class="svc-info-row"><span>Montant total attendu</span><strong>${fmt(s.totalExpected)}</strong></div>
    <div class="svc-info-row"><span>Montant collecté</span><strong style="color:#8FBE7A;">${fmt(s.totalCollected)}</strong></div>
    <div class="svc-info-row"><span>Reste à collecter</span><strong>${fmt(s.totalRemaining)}</strong></div>
    <div class="svc-info-row"><span>Taux de collecte</span><strong>${s.collectionRate}%</strong></div>
    <hr style="border-color:rgba(255,255,255,0.1); margin:1rem 0;">
    <div class="svc-info-row"><span>Dossiers soldés</span><strong>${s.byStatus.paid}</strong></div>
    <div class="svc-info-row"><span>Paiements partiels</span><strong>${s.byStatus.partial}</strong></div>
    <div class="svc-info-row"><span>Non payés</span><strong>${s.byStatus.unpaid}</strong></div>
    <div class="svc-info-row"><span>Exonérés (boursiers)</span><strong>${s.byStatus.exempted}</strong></div>
    <button class="btn" style="margin-top:1rem;" onclick="window.print()"><i class="fa-solid fa-print"></i> Imprimer le rapport</button>`;
}

// --- Changement de mot de passe ---
const pwdModal = document.getElementById("pwdModal");
document.getElementById("pwdBtn").onclick = () => {
  document.getElementById("oldPwd").value = "";
  document.getElementById("newPwd").value = "";
  document.getElementById("confirmPwd").value = "";
  document.getElementById("pwdMsg").innerHTML = "";
  pwdModal.style.display = "flex";
};
document.getElementById("pwdClose").onclick = () => { pwdModal.style.display = "none"; };
document.getElementById("pwdSubmit").onclick = async () => {
  const oldPassword = document.getElementById("oldPwd").value;
  const newPassword = document.getElementById("newPwd").value;
  const confirm = document.getElementById("confirmPwd").value;
  const msg = document.getElementById("pwdMsg");
  if (!oldPassword || !newPassword) { msg.innerHTML = '<p style="color:#EAD3D0;">Tous les champs sont requis.</p>'; return; }
  if (newPassword !== confirm) { msg.innerHTML = '<p style="color:#EAD3D0;">Les deux nouveaux mots de passe ne correspondent pas.</p>'; return; }
  // fetch direct : un mot de passe actuel erroné renvoie 401, qui ne doit PAS déconnecter.
  const res = await fetch(API + "/auth/change-password", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ oldPassword, newPassword }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok) {
    msg.innerHTML = '<p style="color:#8FBE7A;"><i class="fa-solid fa-circle-check"></i> Mot de passe modifié avec succès.</p>';
    setTimeout(() => { pwdModal.style.display = "none"; }, 1500);
  } else {
    msg.innerHTML = `<p style="color:#EAD3D0;">${esc(data.message || "Échec de la modification.")}</p>`;
  }
};

document.getElementById("logoutBtn").onclick = () => { localStorage.clear(); window.location.href = "index.html"; };
document.getElementById("refreshList").onclick = loadList;
document.getElementById("filterStatus").onchange = loadList;
yearInput.onchange = () => { loadStats(); loadList(); };

loadStats();
loadList();
