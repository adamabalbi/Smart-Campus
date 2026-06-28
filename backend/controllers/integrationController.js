const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { logError } = require("../utils/secureLogger");
const User = require("../models/User");
const Student = require("../models/Student");
const generateTempPassword = require("../utils/generateTempPassword");
const { logAudit } = require("../services/auditService");

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || "10", 10);

// ── Parsing CSV minimal (sans dépendance) ────────────────────────────────────
// Gère les guillemets et les virgules échappées. En-tête sur la 1re ligne.
function parseCsv(text) {
  const rows = [];
  let field = "", row = [], inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") { /* ignore */ }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).filter((r) => r.some((c) => c.trim() !== "")).map((r) => {
    const obj = {};
    header.forEach((h, idx) => { obj[h] = (r[idx] || "").trim(); });
    return obj;
  });
}

// Normalise un enregistrement étudiant venant de l'ESP vers notre schéma.
function normalize(rec) {
  const map = {
    matricule: rec.matricule || rec.Matricule || rec.MATRICULE,
    nom: rec.nom || rec.Nom || rec.NOM,
    prenom: rec.prenom || rec.Prenom || rec.prénom || rec.Prénom,
    email: (rec.email || rec.Email || "").toLowerCase(),
    departement: rec.departement || rec.département || rec.Departement || null,
    filiere: rec.filiere || rec.filière || rec.Filiere || rec.departement || "Non précisée",
    niveau: rec.niveau || rec.Niveau || rec.NIVEAU || "L1",
    statutScolarite: rec.statut_scolarite || rec.statutScolarite || null,
    telephone: rec.telephone || rec.téléphone || null,
  };
  return map;
}

const STATUT_MAP = {
  en_regle: "en_regle", "en règle": "en_regle", paye: "en_regle",
  exonere: "exonere", boursier: "exonere",
  non_en_regle: "non_en_regle", impaye: "non_en_regle",
  paiement_partiel: "paiement_partiel", partiel: "paiement_partiel",
  en_attente: "en_attente",
};

// ── POST /api/integration/esp/import-students ────────────────────────────────
// Accepte JSON { students: [...] } OU un corps CSV brut (Content-Type text/csv).
const importStudents = async (req, res) => {
  try {
    let records = [];
    if (typeof req.body === "string") {
      records = parseCsv(req.body);
    } else if (Array.isArray(req.body.students)) {
      records = req.body.students;
    } else if (typeof req.body.csv === "string") {
      records = parseCsv(req.body.csv);
    } else {
      return res.status(400).json({ message: "Fournir { students: [...] }, { csv: \"...\" } ou un corps text/csv." });
    }

    const report = { total: records.length, created: 0, skipped: 0, errors: [] };

    for (const raw of records) {
      const s = normalize(raw);
      try {
        if (!s.matricule || !s.nom || !s.prenom || !s.email) {
          report.errors.push({ matricule: s.matricule || "?", error: "Champs obligatoires manquants (matricule, nom, prenom, email)." });
          continue;
        }
        // Doublon : matricule ou email déjà présent
        const dup = await Student.findOne({ $or: [{ matricule: s.matricule }, { email: s.email }] });
        if (dup) { report.skipped++; continue; }
        const dupUser = await User.findOne({ email: s.email });
        if (dupUser) { report.skipped++; continue; }

        const tempPassword = generateTempPassword();
        const hashedPassword = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);

        const user = await User.create({
          nom: s.nom, prenom: s.prenom, email: s.email,
          password: hashedPassword, role: "student", status: "active", mustChangePassword: true,
        });

        await Student.create({
          userId: user._id,
          matricule: s.matricule,
          nom: s.nom, prenom: s.prenom, email: s.email,
          telephone: s.telephone,
          filiere: s.filiere,
          niveau: s.niveau,
          departement: s.departement,
          status: "active",
          statutScolarite: STATUT_MAP[(s.statutScolarite || "").toLowerCase()] || "en_attente",
        });
        // NB : le portefeuille (Wallet) est créé à l'attribution de la carte
        // (cardId requis), conformément au flux existant.
        report.created++;
      } catch (e) {
        report.errors.push({ matricule: s.matricule || "?", error: e.message });
      }
    }

    await logAudit({ req, action: "esp_import_students", targetType: "Student", description: `Import ESP — ${report.created} créés, ${report.skipped} ignorés, ${report.errors.length} erreurs (sur ${report.total})`, newValue: report });
    return res.json({ message: "Import terminé.", report });
  } catch (error) {
    logError("Erreur importStudents", error);
    return res.status(500).json({ message: "Erreur serveur lors de l'import." });
  }
};

// ── GET /api/integration/esp/export-students ─────────────────────────────────
// Export CSV compatible ESP avec les statuts à jour. ?format=json possible.
const exportStudents = async (req, res) => {
  try {
    const students = await Student.find().select("matricule nom prenom email departement filiere niveau statutScolarite").sort({ matricule: 1 });

    if (req.query.format === "json") {
      return res.json({ count: students.length, students });
    }

    const rows = [["matricule", "nom", "prenom", "email", "departement", "filiere", "niveau", "statut_scolarite"]];
    students.forEach((s) => rows.push([s.matricule, s.nom, s.prenom, s.email, s.departement || "", s.filiere, s.niveau, s.statutScolarite]));
    const csv = rows.map((r) => r.map((c) => `"${String(c == null ? "" : c).replace(/"/g, '""')}"`).join(",")).join("\n");

    await logAudit({ req, action: "esp_export_students", description: `Export ESP — ${students.length} étudiants` });
    res.set("Content-Type", "text/csv; charset=utf-8");
    res.set("Content-Disposition", `attachment; filename="esp_students_${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.send("﻿" + csv);
  } catch (error) {
    logError("Erreur exportStudents", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── GET /api/integration/esp/sync-status ─────────────────────────────────────
// Étudiants potentiellement non synchronisés (sans carte, sans departement, etc.)
const syncStatus = async (req, res) => {
  try {
    const Card = require("../models/Card");
    const total = await Student.countDocuments();
    const withoutDept = await Student.countDocuments({ $or: [{ departement: null }, { departement: "" }] });

    const studentIds = await Card.distinct("studentId");
    const withoutCard = await Student.countDocuments({ _id: { $nin: studentIds } });

    const pending = await Student.find({ statutScolarite: "en_attente" })
      .select("matricule nom prenom email")
      .limit(100);

    return res.json({
      total,
      withoutCard,
      withoutDepartment: withoutDept,
      pendingScolarite: pending.length,
      pendingList: pending,
      synced: total - pending.length,
    });
  } catch (error) {
    logError("Erreur syncStatus", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

// ── POST /api/integration/esp/webhook ────────────────────────────────────────
// Reçoit des mises à jour du SI ESP. Sécurisé par signature HMAC-SHA256 partagée
// (en-tête X-ESP-Signature = hex(hmac(secret, rawBody))).
// Body: { event: 'student.updated'|'student.created', data: {...} }
const webhook = async (req, res) => {
  try {
    const secret = process.env.ESP_WEBHOOK_SECRET;
    if (!secret) return res.status(503).json({ message: "Webhook non configuré (ESP_WEBHOOK_SECRET absent)." });

    const signature = req.headers["x-esp-signature"];
    const raw = req.rawBody || JSON.stringify(req.body);
    const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");

    // Comparaison à temps constant (anti timing attack)
    const sigBuf = Buffer.from(signature || "", "hex");
    const expBuf = Buffer.from(expected, "hex");
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return res.status(401).json({ message: "Signature HMAC invalide." });
    }

    const { event, data } = req.body || {};
    if (!event || !data) return res.status(400).json({ message: "event et data requis." });

    let result = "ignored";
    if (event === "student.updated" || event === "student.created") {
      const s = normalize(data);
      if (!s.matricule) return res.status(400).json({ message: "matricule requis." });
      const student = await Student.findOne({ matricule: s.matricule });
      if (student) {
        if (s.statutScolarite) student.statutScolarite = STATUT_MAP[s.statutScolarite.toLowerCase()] || student.statutScolarite;
        if (s.departement) student.departement = s.departement;
        if (s.niveau) student.niveau = s.niveau;
        if (s.filiere) student.filiere = s.filiere;
        await student.save();
        result = "updated";
      } else if (event === "student.created" && s.nom && s.prenom && s.email) {
        const tempPassword = generateTempPassword();
        const user = await User.create({
          nom: s.nom, prenom: s.prenom, email: s.email,
          password: await bcrypt.hash(tempPassword, BCRYPT_ROUNDS),
          role: "student", status: "active", mustChangePassword: true,
        });
        await Student.create({
          userId: user._id, matricule: s.matricule, nom: s.nom, prenom: s.prenom, email: s.email,
          filiere: s.filiere, niveau: s.niveau, departement: s.departement, status: "active",
          statutScolarite: STATUT_MAP[(s.statutScolarite || "").toLowerCase()] || "en_attente",
        });
        result = "created";
      }
    }

    await logAudit({ req, actor: { _id: null, role: "system" }, action: "esp_webhook", targetType: "Student", description: `Webhook ESP — ${event} (${data.matricule || "?"}) → ${result}` });
    return res.json({ ok: true, event, result });
  } catch (error) {
    logError("Erreur webhook ESP", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

module.exports = { importStudents, exportStudents, syncStatus, webhook };
