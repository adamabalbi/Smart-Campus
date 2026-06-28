const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const mongoose = require("mongoose");
const { logError } = require("../utils/secureLogger");
const Card = require("../models/Card");
const Student = require("../models/Student");
const Wallet = require("../models/Wallet");
const Transaction = require("../models/Transaction");
const ScholarshipFee = require("../models/ScholarshipFee");
const Alert = require("../models/Alert");
const NFCLog = require("../models/NFCLog");
const sendEmail = require("../utils/sendEmail");
const { logAudit } = require("../services/auditService");
const { predictPayment } = require("../services/aiService");

const hashUID = (uid) => crypto.createHash("sha256").update(String(uid).toLowerCase()).digest("hex");

// Numéro de reçu unique : ESP-{année}-{matricule}-{timestamp}
const buildReceiptNumber = (academicYear, matricule) => {
  const year = (academicYear || `${new Date().getFullYear()}`).split("-")[0];
  return `ESP-${year}-${matricule}-${Date.now()}`;
};

// Récupère le Student lié à l'utilisateur connecté (rôle student)
const getOwnStudent = (userId) => Student.findOne({ userId });

// ───────────────────────────────────────────────────────────────────────────
// GET /api/scholarship/my-fees — l'étudiant consulte SES frais
// ───────────────────────────────────────────────────────────────────────────
const getMyFees = async (req, res) => {
  try {
    const student = await getOwnStudent(req.user._id);
    if (!student) return res.status(404).json({ message: "Profil étudiant introuvable." });

    const { academicYear } = req.query;
    const filter = { studentId: student._id };
    if (academicYear) filter.academicYear = academicYear;

    const fees = await ScholarshipFee.find(filter).sort({ academicYear: -1 });
    return res.json({ student: { matricule: student.matricule, nom: student.nom, prenom: student.prenom }, fees });
  } catch (error) {
    logError("Erreur getMyFees", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

// ───────────────────────────────────────────────────────────────────────────
// GET /api/scholarship/student/:id — admin/finance consulte un étudiant
// ───────────────────────────────────────────────────────────────────────────
const getStudentFees = async (req, res) => {
  try {
    const student = await Student.findById(req.params.id).select("matricule nom prenom email filiere niveau statutScolarite");
    if (!student) return res.status(404).json({ message: "Étudiant introuvable." });

    const fees = await ScholarshipFee.find({ studentId: student._id }).sort({ academicYear: -1 });
    return res.json({ student, fees });
  } catch (error) {
    logError("Erreur getStudentFees", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

// ───────────────────────────────────────────────────────────────────────────
// POST /api/scholarship/fees — créer/mettre à jour un dossier de frais (admin/finance)
// Body: { studentId, academicYear, totalAmount, installments? }
// ───────────────────────────────────────────────────────────────────────────
const upsertFee = async (req, res) => {
  try {
    const { studentId, academicYear, totalAmount, installments } = req.body;
    if (!studentId || !academicYear || totalAmount == null) {
      return res.status(400).json({ message: "studentId, academicYear et totalAmount requis." });
    }
    const student = await Student.findById(studentId);
    if (!student) return res.status(404).json({ message: "Étudiant introuvable." });

    let fee = await ScholarshipFee.findOne({ studentId, academicYear });
    const isNew = !fee;
    if (!fee) fee = new ScholarshipFee({ studentId, academicYear, amountPaid: 0 });

    fee.totalAmount = Math.max(0, parseInt(totalAmount, 10));
    if (Array.isArray(installments)) {
      fee.installments = installments.map((i) => ({
        dueDate: i.dueDate,
        amount: Math.max(0, parseInt(i.amount, 10)),
        status: "pending",
      }));
    }
    // Boursier déjà exonéré ? on respecte le statut, sinon recalcul.
    if (student.statutScolarite === "exonere") fee.status = "exempted";
    fee.recompute();
    await fee.save();

    await logAudit({ req, action: isNew ? "scholarship_fee_created" : "scholarship_fee_updated", targetType: "ScholarshipFee", targetId: fee._id, description: `Dossier frais ${academicYear} — ${student.prenom} ${student.nom} (${student.matricule}) : total ${fee.totalAmount} XOF`, newValue: { totalAmount: fee.totalAmount, status: fee.status } });

    return res.status(isNew ? 201 : 200).json({ message: "Dossier de frais enregistré.", fee });
  } catch (error) {
    logError("Erreur upsertFee", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

// ───────────────────────────────────────────────────────────────────────────
// Cœur du paiement scolarité par carte NFC (atomique + idempotent + IA + email)
// installmentId optionnel : paiement ciblé d'une tranche.
// ───────────────────────────────────────────────────────────────────────────
async function processScholarshipPayment(req, res, { isInstallment }) {
  const { uid, pin, academicYear, readerId, idempotencyKey } = req.body;
  const installmentId = req.body.installmentId || null;
  let amount = req.body.amount != null ? parseInt(req.body.amount, 10) : null;

  if (!uid || !pin) {
    return res.status(400).json({ message: "UID et PIN requis." });
  }

  const uidHash = hashUID(uid);

  try {
    // 1. Carte active + NFC
    const card = await Card.findOne({ uidHash, status: "active", nfcEnabled: true })
      .populate({ path: "studentId", populate: { path: "userId" } });
    if (!card) {
      await safeNfcLog(uid, "payment", false, "Card not found", readerId);
      return res.status(404).json({ message: "Paiement refusé : carte non active ou introuvable." });
    }

    // 2. PIN
    const isPinValid = card.pinHash && bcrypt.compareSync(pin, card.pinHash);
    if (!isPinValid) {
      card.nfcFailures = (card.nfcFailures || 0) + 1;
      if (card.nfcFailures >= 3) card.status = "blocked";
      await card.save();
      await safeNfcLog(uid, "payment", false, "Invalid PIN", readerId);
      return res.status(401).json({ message: "Paiement refusé : PIN incorrect.", blocked: card.nfcFailures >= 3 });
    }
    card.nfcFailures = 0;
    await card.save();

    // 3. Étudiant actif
    const student = card.studentId;
    if (!student || student.status !== "active") {
      await safeNfcLog(uid, "payment", false, "Student inactive", readerId);
      return res.status(403).json({ message: "Paiement refusé : étudiant inactif." });
    }

    // 4. Dossier de frais (année courante ou précisée)
    const feeFilter = { studentId: student._id };
    if (academicYear) feeFilter.academicYear = academicYear;
    const fee = await ScholarshipFee.findOne(feeFilter).sort({ academicYear: -1 });
    if (!fee) {
      return res.status(404).json({ message: "Aucun dossier de frais de scolarité trouvé." });
    }
    if (fee.status === "exempted") {
      return res.status(400).json({ message: "Frais exonérés (boursier) : aucun paiement requis." });
    }
    if (fee.remainingAmount <= 0) {
      return res.status(400).json({ message: "Frais de scolarité déjà soldés." });
    }

    // 5. Déterminer le montant
    let installment = null;
    if (isInstallment) {
      if (!installmentId) return res.status(400).json({ message: "installmentId requis pour un paiement par tranche." });
      installment = fee.installments.id(installmentId);
      if (!installment) return res.status(404).json({ message: "Tranche introuvable." });
      if (installment.status === "paid") return res.status(400).json({ message: "Tranche déjà payée." });
      amount = Math.max(0, installment.amount - (installment.paidAmount || 0));
    }
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Montant invalide." });
    }
    // On ne dépasse jamais le reste dû
    if (amount > fee.remainingAmount) amount = fee.remainingAmount;

    // 6. Wallet + solde
    const wallet = await Wallet.findOne({ studentId: student._id });
    if (!wallet || wallet.status !== "active") {
      return res.status(403).json({ message: "Paiement refusé : portefeuille indisponible." });
    }
    const balanceBefore = wallet.balance;
    if (balanceBefore < amount) {
      await safeNfcLog(uid, "payment", false, "Insufficient balance", readerId);
      return res.status(400).json({
        message: "Solde insuffisant pour payer les frais de scolarité.",
        balance: balanceBefore,
        required: amount,
        missing: amount - balanceBefore,
      });
    }

    // 7. Idempotence
    if (idempotencyKey) {
      const existing = await Transaction.findOne({ idempotencyKey });
      if (existing) {
        return res.json({
          success: true,
          message: "Paiement déjà traité (idempotence)",
          aiDecision: null,
          data: { transaction: existing, fee },
        });
      }
    }

    const receiptNumber = buildReceiptNumber(fee.academicYear, student.matricule);
    const newBalance = balanceBefore - amount;
    const oldStatutScolarite = student.statutScolarite;

    // 8. Transaction atomique : débit wallet + transaction + maj dossier + maj étudiant
    const session = await mongoose.startSession();
    let transaction;
    try {
      await session.withTransaction(async () => {
        const created = await Transaction.create([{
          studentId: student._id,
          cardId: card._id,
          walletId: wallet._id,
          agentId: null,
          type: "payment",
          channel: "api",
          amount,
          balanceBefore,
          balanceAfter: newBalance,
          status: "pending",
          description: `Frais de scolarité ${fee.academicYear}${installment ? " (tranche)" : ""}`,
          pinVerified: true,
          idempotencyKey: idempotencyKey || undefined,
          metadata: {
            service: "scholarship",
            serviceLabel: `Frais de scolarité ${fee.academicYear}`,
            receiptNumber,
            readerId: readerId || null,
            uid: uid.substring(0, 4) + "***",
          },
          processedAt: new Date(),
        }], { session });
        transaction = created[0];

        // Débit wallet
        wallet.balance = newBalance;
        wallet.lastActivity = new Date();
        await wallet.save({ session });

        // Mise à jour du dossier de frais
        fee.amountPaid += amount;
        fee.receiptNumber = receiptNumber;
        if (installment) {
          installment.paidAmount = (installment.paidAmount || 0) + amount;
          installment.paidDate = new Date();
          installment.transactionId = transaction._id;
          if (installment.paidAmount >= installment.amount) installment.status = "paid";
        }
        fee.recompute();
        await fee.save({ session });

        // Mise à jour automatique du statut de scolarité de l'étudiant
        const newStatut = fee.status === "paid" ? "en_regle" : "paiement_partiel";
        if (student.statutScolarite !== newStatut && student.statutScolarite !== "exonere") {
          student.statutScolarite = newStatut;
          await student.save({ session });
        }

        transaction.status = "validated";
        await transaction.save({ session });
      });
    } finally {
      await session.endSession();
    }

    await safeNfcLog(uid, "payment", true, null, readerId, { amount, transactionId: transaction._id });

    await logAudit({ req, actor: { _id: student.userId, role: "student" }, action: "payment", targetType: "Transaction", targetId: transaction._id, description: `Paiement scolarité de ${amount} XOF — ${student.prenom} ${student.nom} (${student.matricule}) — ${fee.academicYear}${installment ? " (tranche)" : ""}`, oldValue: { balance: balanceBefore, statutScolarite: oldStatutScolarite }, newValue: { balance: newBalance, statutScolarite: student.statutScolarite, feeStatus: fee.status } });

    // 9. Analyse IA (non bloquante) — service_type 'scholarship'
    let aiResult = null;
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const [recentOps, failedAttempts] = await Promise.all([
        Transaction.countDocuments({ studentId: student._id, createdAt: { $gte: oneHourAgo } }),
        NFCLog.countDocuments({ cardUid: uidHash, success: false, timestamp: { $gte: oneHourAgo } }),
      ]);
      const features = {
        operation_type: "payment",
        amount,
        hour: new Date().getHours(),
        card_status: card.status,
        balance_before: balanceBefore,
        service_type: "scholarship",
        recent_operations_count: recentOps,
        failed_attempts_count: failedAttempts,
        is_authorized_service: 1,
      };
      aiResult = await predictPayment(features);
      if (aiResult && aiResult.decision === "suspect") {
        const score = aiResult.score;
        const severity = score == null ? "medium" : (score >= 0.8 ? "high" : score >= 0.5 ? "medium" : "low");
        const alert = await Alert.create({
          transactionId: transaction._id,
          studentId: student._id,
          type: "suspicious_payment",
          service: "scholarship",
          amount,
          score,
          severity,
          reason: "Paiement de scolarité détecté comme suspect par le modèle IA",
          metadata: { features },
        });
        await logAudit({ req, actor: { _id: student.userId, role: "student" }, action: "ai_alert_created", targetType: "Alert", targetId: alert._id, description: `Alerte IA — paiement scolarité suspect de ${amount} XOF (score ${score}, ${severity}) — ${student.prenom} ${student.nom}`, newValue: { score, severity, transactionId: transaction._id } });
      }
    } catch (aiErr) {
      logError("⚠️  Analyse IA scolarité ignorée", aiErr);
    }

    // 10. Email de confirmation (non bloquant)
    try {
      if (student.email) {
        await sendEmail({
          to: student.email,
          subject: `Smart Campus — Reçu de paiement scolarité ${fee.academicYear}`,
          text: `Bonjour ${student.prenom} ${student.nom},

Nous confirmons votre paiement des frais de scolarité.

N° de reçu     : ${receiptNumber}
Année          : ${fee.academicYear}
Montant payé   : ${amount.toLocaleString("fr-FR")} XOF
Total payé     : ${fee.amountPaid.toLocaleString("fr-FR")} XOF
Reste à payer  : ${fee.remainingAmount.toLocaleString("fr-FR")} XOF
Statut         : ${fee.status === "paid" ? "Soldé (en règle)" : "Paiement partiel"}

Matricule : ${student.matricule}

Conservez ce reçu. Vous pouvez le retélécharger depuis votre espace étudiant.

Cordialement,
Service de Scolarité — Smart Campus`,
        });
      }
    } catch (mailErr) {
      logError("⚠️  Email reçu scolarité non envoyé", mailErr);
    }

    // SÉCURITÉ : invalider la validation PIN après transaction (si applicable)
    if (typeof card.resetPinValidation === "function") {
      card.resetPinValidation();
      await card.save();
    }

    return res.json({
      success: true,
      message: "Paiement des frais de scolarité effectué avec succès.",
      aiDecision: aiResult ? aiResult.decision : null,
      data: {
        transaction,
        fee,
        receipt: {
          receiptNumber,
          academicYear: fee.academicYear,
          studentName: `${student.prenom} ${student.nom}`,
          matricule: student.matricule,
          amount,
          balanceBefore,
          balanceAfter: newBalance,
          totalPaid: fee.amountPaid,
          remaining: fee.remainingAmount,
          status: fee.status,
          date: transaction.processedAt,
        },
      },
    });
  } catch (error) {
    logError("Erreur processScholarshipPayment", error);
    await safeNfcLog(uid, "payment", false, error.message, readerId);
    return res.status(500).json({ message: "Erreur serveur lors du paiement de la scolarité." });
  }
}

// Log NFC non bloquant
async function safeNfcLog(uid, action, success, errorMessage = null, readerId = null, metadata = {}) {
  try {
    await NFCLog.create({
      cardUid: uid ? hashUID(uid) : null,
      action,
      success,
      timestamp: new Date(),
      deviceId: readerId,
      errorCode: errorMessage,
      metadata,
    });
  } catch (e) {
    logError("Erreur log NFC scolarité", e);
  }
}

// POST /api/scholarship/pay
const pay = (req, res) => processScholarshipPayment(req, res, { isInstallment: false });
// POST /api/scholarship/pay-installment
const payInstallment = (req, res) => processScholarshipPayment(req, res, { isInstallment: true });

// ───────────────────────────────────────────────────────────────────────────
// GET /api/scholarship/receipt/:id — reçu PDF binaire (téléchargeable)
// :id = id de la transaction. Accessible au propriétaire ou admin/finance.
// ?download=1 force le téléchargement (sinon affichage inline dans le navigateur).
// ───────────────────────────────────────────────────────────────────────────
const getReceipt = async (req, res) => {
  try {
    const tx = await Transaction.findById(req.params.id).populate("studentId", "nom prenom matricule filiere niveau userId");
    if (!tx || tx.metadata?.service !== "scholarship") {
      return res.status(404).json({ message: "Reçu introuvable." });
    }

    // Contrôle d'accès : propriétaire (étudiant) ou rôle financier/admin
    const privileged = ["super_admin", "admin", "finance_agent", "service_scolarite"].includes(req.user.role);
    const isOwner = tx.studentId && tx.studentId.userId && tx.studentId.userId.toString() === req.user._id.toString();
    if (!privileged && !isOwner) {
      return res.status(403).json({ message: "Accès refusé à ce reçu." });
    }

    const s = tx.studentId;
    const f = (n) => Number(n || 0).toLocaleString("fr-FR") + " XOF";
    const receiptNumber = tx.metadata.receiptNumber || tx._id.toString();

    const PDFDocument = require("pdfkit");
    const doc = new PDFDocument({ size: "A4", margin: 56, info: { Title: `Recu ${receiptNumber}`, Author: "Smart Campus ESP" } });

    const disposition = req.query.download ? "attachment" : "inline";
    res.set("Content-Type", "application/pdf");
    res.set("Content-Disposition", `${disposition}; filename="recu_${receiptNumber}.pdf"`);
    doc.pipe(res);

    const GREEN = "#2F6F4F";
    const GREY = "#6B7280";
    const DARK = "#1F2933";

    // En-tête
    doc.fillColor(GREEN).fontSize(22).font("Helvetica-Bold").text("Smart Campus — ESP", { align: "center" });
    doc.moveDown(0.2);
    doc.fillColor(GREY).fontSize(11).font("Helvetica").text("Reçu de paiement des frais de scolarité", { align: "center" });
    doc.moveDown(0.4);
    doc.fillColor("#2F855A").fontSize(10).text("PAIEMENT VALIDÉ", { align: "center" });

    // Filet
    doc.moveDown(0.8);
    const lineY = doc.y;
    doc.strokeColor("#DDDDDD").lineWidth(1).moveTo(56, lineY).lineTo(539, lineY).stroke();
    doc.moveDown(0.8);

    // Lignes d'information
    const row = (label, value, opts = {}) => {
      const y = doc.y;
      doc.fillColor(GREY).fontSize(11).font("Helvetica").text(label, 56, y);
      doc.fillColor(opts.color || DARK).font(opts.bold ? "Helvetica-Bold" : "Helvetica").text(value, 56, y, { align: "right", width: 483 });
      doc.moveDown(0.55);
    };

    row("N° de reçu", receiptNumber, { bold: true });
    row("Date", new Date(tx.processedAt || tx.createdAt).toLocaleString("fr-FR"));
    row("Étudiant", `${s.prenom} ${s.nom}`, { bold: true });
    row("Matricule", s.matricule);
    row("Filière / Niveau", `${s.filiere || "—"} / ${s.niveau || "—"}`);
    if (tx.metadata.serviceLabel) row("Objet", tx.metadata.serviceLabel);

    // Filet total
    doc.moveDown(0.3);
    const tY = doc.y;
    doc.strokeColor("#DDDDDD").lineWidth(1).dash(3, { space: 3 }).moveTo(56, tY).lineTo(539, tY).stroke().undash();
    doc.moveDown(0.8);

    row("Montant payé", f(tx.amount), { bold: true, color: "#2F855A" });
    row("Solde avant", f(tx.balanceBefore));
    row("Solde après", f(tx.balanceAfter), { bold: true });

    // Pied de page
    doc.moveDown(2);
    doc.fillColor(GREY).fontSize(9).font("Helvetica").text(
      "Ce reçu est généré électroniquement par la plateforme Smart Campus et fait foi de paiement. Conservez-le.",
      { align: "center" }
    );

    doc.end();
  } catch (error) {
    logError("Erreur getReceipt", error);
    if (!res.headersSent) return res.status(500).json({ message: "Erreur serveur." });
  }
};

// ───────────────────────────────────────────────────────────────────────────
// PATCH /api/scholarship/:id/status — admin/finance met à jour le statut
// Body: { status: 'unpaid'|'partial'|'paid'|'exempted' }
// ───────────────────────────────────────────────────────────────────────────
const updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!["unpaid", "partial", "paid", "exempted"].includes(status)) {
      return res.status(400).json({ message: "Statut invalide." });
    }
    const fee = await ScholarshipFee.findById(req.params.id).populate("studentId");
    if (!fee) return res.status(404).json({ message: "Dossier introuvable." });

    const oldStatus = fee.status;
    fee.status = status;
    if (status === "paid") { fee.amountPaid = fee.totalAmount; fee.remainingAmount = 0; }
    if (status !== "exempted" && status !== "paid") fee.recompute();
    if (status === "exempted") fee.remainingAmount = Math.max(0, fee.totalAmount - fee.amountPaid);
    await fee.save();

    // Répercussion sur le statut de scolarité de l'étudiant
    const student = fee.studentId;
    if (student) {
      const map = { paid: "en_regle", exempted: "exonere", partial: "paiement_partiel", unpaid: "non_en_regle" };
      student.statutScolarite = map[status];
      await student.save();
    }

    await logAudit({ req, action: "scholarship_status_updated", targetType: "ScholarshipFee", targetId: fee._id, description: `Statut frais ${fee.academicYear} — ${student ? student.prenom + " " + student.nom : ""} : ${oldStatus} → ${status}`, oldValue: { status: oldStatus }, newValue: { status } });

    return res.json({ message: "Statut mis à jour.", fee });
  } catch (error) {
    logError("Erreur updateStatus", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

// ───────────────────────────────────────────────────────────────────────────
// GET /api/scholarship/stats — statistiques de collecte (admin/finance)
// Query: academicYear?
// ───────────────────────────────────────────────────────────────────────────
const getStats = async (req, res) => {
  try {
    const { academicYear } = req.query;
    const match = {};
    if (academicYear) match.academicYear = academicYear;

    const agg = await ScholarshipFee.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalExpected: { $sum: "$totalAmount" },
          totalCollected: { $sum: "$amountPaid" },
        },
      },
    ]);

    const summary = { unpaid: 0, partial: 0, paid: 0, exempted: 0 };
    let totalExpected = 0, totalCollected = 0;
    agg.forEach((g) => {
      summary[g._id] = g.count;
      totalExpected += g.totalExpected;
      totalCollected += g.totalCollected;
    });

    return res.json({
      academicYear: academicYear || "toutes",
      byStatus: summary,
      totalExpected,
      totalCollected,
      totalRemaining: Math.max(0, totalExpected - totalCollected),
      collectionRate: totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0,
    });
  } catch (error) {
    logError("Erreur getStats", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

// ───────────────────────────────────────────────────────────────────────────
// GET /api/scholarship/list — liste des dossiers (admin/finance) avec filtre statut
// ───────────────────────────────────────────────────────────────────────────
const listFees = async (req, res) => {
  try {
    const { status, academicYear, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (academicYear) filter.academicYear = academicYear;

    const fees = await ScholarshipFee.find(filter)
      .populate("studentId", "nom prenom matricule filiere niveau")
      .sort({ updatedAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);
    const total = await ScholarshipFee.countDocuments(filter);

    return res.json({
      fees,
      pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    logError("Erreur listFees", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

module.exports = {
  getMyFees,
  getStudentFees,
  upsertFee,
  pay,
  payInstallment,
  getReceipt,
  updateStatus,
  getStats,
  listFees,
};
