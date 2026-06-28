// ============================================================================
// Seed de démonstration ESP — Scénarios 1 à 3
// ----------------------------------------------------------------------------
// Crée/MET À JOUR (idempotent) :
//   • les espaces d'accès multi-niveaux (Scénario 1)
//   • des cours de démonstration avec emploi du temps (Scénario 3)
//   • des dossiers de frais de scolarité pour les étudiants existants (Scénario 2)
//
// Utilisation :
//   node scripts/seed-esp-demo.js              # année académique courante
//   node scripts/seed-esp-demo.js 2025-2026    # année précisée
//
// Sûr à relancer : ne duplique rien (upsert par clé/matricule/année).
// ============================================================================
const mongoose = require("mongoose");
require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const AccessSpace = require("../models/AccessSpace");
const Course = require("../models/Course");
const Student = require("../models/Student");
const User = require("../models/User");
const ScholarshipFee = require("../models/ScholarshipFee");

// Année académique courante (bascule en septembre)
function currentAcademicYear() {
  const now = new Date();
  const y = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return `${y}-${y + 1}`;
}
const YEAR = process.argv[2] || currentAcademicYear();

// ── Scénario 1 : espaces multi-niveaux ──────────────────────────────────────
// schedule : lun-ven 07:00-19:00, sam 08:00-13:00, dim fermé (par défaut).
const week = (open = "07:00", close = "19:00", sat = { open: "08:00", close: "13:00" }) => ({
  monday: { open, close }, tuesday: { open, close }, wednesday: { open, close },
  thursday: { open, close }, friday: { open, close },
  saturday: sat, sunday: { open: null, close: null },
});

const SPACES = [
  { key: "entree-principale", label: "Entrée principale ESP", spaceType: "entrance",
    enforceSchedule: true, schedule: week("06:00", "22:00", { open: "06:00", close: "20:00" }), capacity: 0 },
  { key: "dept-gi", label: "Département Génie Informatique", spaceType: "department",
    allowedDepartments: ["GI"], enforceSchedule: true, schedule: week(), capacity: 0 },
  { key: "salle-cours-gi", label: "Salle de cours GI", spaceType: "classroom",
    allowedDepartments: ["GI"], allowedLevels: ["L1", "L2", "L3", "M1", "M2"],
    enforceSchedule: true, schedule: week(), capacity: 60 },
  { key: "labo-info-1", label: "Laboratoire informatique 1", spaceType: "lab",
    allowedDepartments: ["GI"], allowedLevels: ["L3", "M1", "M2"],
    enforceSchedule: true, schedule: week("08:00", "18:00"), capacity: 30, requiresPinVerification: true },
  { key: "bibliotheque", label: "Bibliothèque centrale", spaceType: "library",
    enforceSchedule: true, schedule: week("08:00", "20:00", { open: "09:00", close: "17:00" }), capacity: 120 },
  { key: "cantine", label: "Restaurant universitaire", spaceType: "cafeteria",
    enforceSchedule: true, schedule: week("11:00", "15:00", { open: "11:00", close: "14:00" }), capacity: 200 },
  { key: "imprimerie", label: "Imprimerie", spaceType: "office",
    enforceSchedule: true, schedule: week("08:00", "17:00", { open: null, close: null }), capacity: 0 },
  { key: "salle-admin", label: "Salles administratives", spaceType: "admin",
    enforceSchedule: true, schedule: week("08:00", "17:00", { open: null, close: null }), capacity: 0 },
  { key: "salle-profs", label: "Salle des professeurs", spaceType: "admin",
    enforceSchedule: true, schedule: week("07:00", "20:00"), capacity: 0 },
];

async function seedSpaces() {
  console.log("\n🚪 Espaces d'accès multi-niveaux");
  for (const s of SPACES) {
    const existing = await AccessSpace.findOne({ key: s.key });
    if (existing) {
      // Met à jour les champs multi-niveaux sans écraser status/readerToken existants
      Object.assign(existing, s);
      await existing.save();
      console.log(`   ↻ mis à jour : ${s.label}`);
    } else {
      await AccessSpace.create({ ...s, status: "active" });
      console.log(`   ✅ créé : ${s.label}`);
    }
  }
}

// ── Scénario 3 : cours de démonstration (département GI) ─────────────────────
// dayOfWeek : 1=lundi … 5=vendredi
const COURSES = [
  { code: "GI-ALG", name: "Algorithmique et structures de données", department: "GI", level: "L2",
    instructor: "Dr. Diallo",
    schedule: [{ dayOfWeek: 1, startTime: "08:00", endTime: "10:00", room: "salle-cours-gi" }] },
  { code: "GI-RES", name: "Réseaux informatiques", department: "GI", level: "L3",
    instructor: "Dr. Ndiaye",
    schedule: [{ dayOfWeek: 2, startTime: "10:00", endTime: "12:00", room: "labo-info-1" }] },
  { code: "GI-BD", name: "Bases de données avancées", department: "GI", level: "M1",
    instructor: "Pr. Sow",
    schedule: [{ dayOfWeek: 3, startTime: "14:00", endTime: "17:00", room: "labo-info-1" }] },
];

async function seedCourses() {
  console.log("\n📚 Cours de démonstration");
  // Résout les spaceId à partir des clés de salle
  const spaceByKey = {};
  (await AccessSpace.find()).forEach((s) => { spaceByKey[s.key] = s._id; });

  // Un enseignant de démo (rôle instructor) pour rattacher les cours
  let instructor = await User.findOne({ role: "instructor" });

  for (const c of COURSES) {
    const schedule = c.schedule.map((slot) => ({ ...slot, spaceId: spaceByKey[slot.room] || null }));
    // Inscrit les étudiants du même département+niveau (ou tous les étudiants du niveau)
    const enrolled = await Student.find({
      $or: [{ departement: c.department }, { filiere: c.department }],
      niveau: c.level, status: "active",
    }).select("_id");
    const enrolledIds = enrolled.map((s) => s._id);

    const existing = await Course.findOne({ code: c.code, academicYear: YEAR });
    if (existing) {
      existing.schedule = schedule;
      if (instructor) existing.instructorId = instructor._id;
      if (enrolledIds.length) existing.enrolledStudents = enrolledIds;
      await existing.save();
      console.log(`   ↻ mis à jour : ${c.code} (${existing.enrolledStudents.length} inscrits)`);
    } else {
      await Course.create({
        ...c, schedule, academicYear: YEAR,
        instructorId: instructor ? instructor._id : null,
        enrolledStudents: enrolledIds,
      });
      console.log(`   ✅ créé : ${c.code} — ${c.name} (${enrolledIds.length} inscrits)`);
    }
  }
  if (!instructor) {
    console.log("   ⚠️  Aucun compte 'instructor' trouvé : cours créés sans enseignant rattaché.");
    console.log("      Crée un compte Enseignant via le dashboard puis relance ce script.");
  }
}

// ── Scénario 2 : dossiers de frais de scolarité ─────────────────────────────
const TOTAL_BY_LEVEL = { L1: 150000, L2: 150000, L3: 175000, M1: 250000, M2: 250000 };

async function seedFees() {
  console.log("\n💰 Dossiers de frais de scolarité");
  const students = await Student.find({ status: "active" });
  let created = 0, skipped = 0;

  for (const s of students) {
    const existing = await ScholarshipFee.findOne({ studentId: s._id, academicYear: YEAR });
    if (existing) { skipped++; continue; }

    const total = TOTAL_BY_LEVEL[s.niveau] || 150000;
    const isExempt = s.statutScolarite === "exonere";

    // Échéancier en 3 tranches (sauf exonérés)
    const installments = isExempt ? [] : [
      { dueDate: new Date(`${YEAR.split("-")[0]}-11-30`), amount: Math.round(total * 0.4), status: "pending" },
      { dueDate: new Date(`${YEAR.split("-")[1]}-02-28`), amount: Math.round(total * 0.3), status: "pending" },
      { dueDate: new Date(`${YEAR.split("-")[1]}-04-30`), amount: total - Math.round(total * 0.4) - Math.round(total * 0.3), status: "pending" },
    ];

    const fee = new ScholarshipFee({
      studentId: s._id, academicYear: YEAR, totalAmount: total, amountPaid: 0,
      status: isExempt ? "exempted" : "unpaid", installments,
    });
    fee.recompute();
    await fee.save();
    created++;
  }
  console.log(`   ✅ ${created} dossier(s) créé(s), ${skipped} déjà présent(s) — année ${YEAR}`);
}

async function main() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log(`✅ MongoDB connecté — seed ESP (année ${YEAR})`);

    await seedSpaces();
    await seedCourses();
    await seedFees();

    console.log("\n🎯 Seed terminé.");
  } catch (err) {
    console.error("❌ Erreur seed:", err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
  }
}

main();
