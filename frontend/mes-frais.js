// Espace étudiant — consultation des frais de scolarité (lecture seule).
const API = (window.SMART_CAMPUS_CONFIG && window.SMART_CAMPUS_CONFIG.API_BASE_URL) || "http://localhost:5000/api";
const token = localStorage.getItem("token");
if (!token) window.location.href = "index.html";

const fmt = (n) => Number(n || 0).toLocaleString("fr-FR") + " XOF";
const STATUS_FR = { paid: "Soldé", partial: "Paiement partiel", unpaid: "Non payé", exempted: "Exonéré (boursier)" };
const STATUS_CLASS = { paid: "st-paid", partial: "st-partial", unpaid: "st-unpaid", exempted: "st-exempted" };
const INST_FR = { paid: "Payée", pending: "À venir", late: "En retard" };

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
  });
  if (res.status === 401) { localStorage.clear(); window.location.href = "index.html"; }
  return res;
}

function renderFee(fee) {
  const rate = fee.totalAmount > 0 ? Math.round((fee.amountPaid / fee.totalAmount) * 100) : 0;
  const installments = (fee.installments || []).map((i) => `
    <tr>
      <td>${new Date(i.dueDate).toLocaleDateString("fr-FR")}</td>
      <td>${fmt(i.amount)}</td>
      <td>${i.paidAmount ? fmt(i.paidAmount) : "—"}</td>
      <td><span class="fee-status ${i.status === "paid" ? "st-paid" : i.status === "late" ? "st-unpaid" : "st-partial"}">${INST_FR[i.status]}</span></td>
    </tr>`).join("");

  return `
    <div class="svc-card">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h2 style="margin:0;">Année ${fee.academicYear}</h2>
        <span class="fee-status ${STATUS_CLASS[fee.status]}">${STATUS_FR[fee.status]}</span>
      </div>
      <div class="bar"><span style="width:${rate}%"></span></div>
      <div class="svc-info-row"><span>Montant total</span><strong>${fmt(fee.totalAmount)}</strong></div>
      <div class="svc-info-row"><span>Déjà payé</span><strong style="color:#8FBE7A;">${fmt(fee.amountPaid)}</strong></div>
      <div class="svc-info-row"><span>Reste à payer</span><strong class="big-amount">${fmt(fee.remainingAmount)}</strong></div>
      ${installments ? `
        <h3 style="margin-top:1.2rem;">Échéancier</h3>
        <table>
          <thead><tr><th>Échéance</th><th>Montant</th><th>Payé</th><th>Statut</th></tr></thead>
          <tbody>${installments}</tbody>
        </table>` : ""}
    </div>`;
}

async function load() {
  const res = await api("/scholarship/my-fees");
  if (!res || !res.ok) { document.getElementById("feesContainer").innerHTML = "<p>Erreur de chargement.</p>"; return; }
  const { student, fees } = await res.json();
  document.getElementById("studentName").textContent = `${student.prenom} ${student.nom} — ${student.matricule}`;
  const c = document.getElementById("feesContainer");
  if (!fees.length) {
    c.innerHTML = '<div class="svc-card"><p style="opacity:.8;">Aucun dossier de frais de scolarité n\'a encore été créé pour votre compte.</p></div>';
    return;
  }
  c.innerHTML = fees.map(renderFee).join("");
}

document.getElementById("logoutBtn").onclick = () => { localStorage.clear(); window.location.href = "index.html"; };
load();
