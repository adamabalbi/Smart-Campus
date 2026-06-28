const { logError } = require("../utils/secureLogger");
const Course = require("../models/Course");
const Student = require("../models/Student");
const { logAudit } = require("../services/auditService");

// GET /api/courses — liste (filtres: department, level, academicYear, instructorId)
const listCourses = async (req, res) => {
  try {
    const { department, level, academicYear } = req.query;
    const filter = {};
    if (department) filter.department = department;
    if (level) filter.level = level;
    if (academicYear) filter.academicYear = academicYear;
    // Un enseignant ne voit que ses cours
    if (req.user.role === "instructor") filter.instructorId = req.user._id;

    const courses = await Course.find(filter)
      .populate("enrolledStudents", "nom prenom matricule")
      .sort({ code: 1 });
    return res.json({ count: courses.length, courses });
  } catch (error) {
    logError("Erreur listCourses", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

// GET /api/courses/:id
const getCourse = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id).populate("enrolledStudents", "nom prenom matricule");
    if (!course) return res.status(404).json({ message: "Cours introuvable." });
    return res.json({ course });
  } catch (error) {
    logError("Erreur getCourse", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

// POST /api/courses — créer (admin)
const createCourse = async (req, res) => {
  try {
    const { code, name, department, level, instructor, instructorId, schedule, academicYear, enrolledStudents } = req.body;
    if (!code || !name || !academicYear) {
      return res.status(400).json({ message: "code, name et academicYear requis." });
    }
    const exists = await Course.findOne({ code, academicYear });
    if (exists) return res.status(400).json({ message: "Un cours avec ce code existe déjà pour cette année." });

    const course = await Course.create({
      code, name, department, level, instructor,
      instructorId: instructorId || null,
      schedule: Array.isArray(schedule) ? schedule : [],
      academicYear,
      enrolledStudents: Array.isArray(enrolledStudents) ? enrolledStudents : [],
    });

    await logAudit({ req, action: "course_created", targetType: "Course", targetId: course._id, description: `Cours créé — ${code} ${name} (${academicYear})` });
    return res.status(201).json({ message: "Cours créé.", course });
  } catch (error) {
    logError("Erreur createCourse", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

// PATCH /api/courses/:id — modifier (admin)
const updateCourse = async (req, res) => {
  try {
    const allowed = ["name", "department", "level", "instructor", "instructorId", "schedule", "enrolledStudents"];
    const update = {};
    allowed.forEach((k) => { if (req.body[k] !== undefined) update[k] = req.body[k]; });

    const course = await Course.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!course) return res.status(404).json({ message: "Cours introuvable." });

    await logAudit({ req, action: "course_updated", targetType: "Course", targetId: course._id, description: `Cours modifié — ${course.code}`, newValue: update });
    return res.json({ message: "Cours mis à jour.", course });
  } catch (error) {
    logError("Erreur updateCourse", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

// POST /api/courses/:id/enroll — inscrire des étudiants (admin)
// Body: { studentIds: [..] } ou { matricules: [..] }
const enrollStudents = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ message: "Cours introuvable." });

    let ids = Array.isArray(req.body.studentIds) ? req.body.studentIds : [];
    if (Array.isArray(req.body.matricules) && req.body.matricules.length) {
      const found = await Student.find({ matricule: { $in: req.body.matricules } }).select("_id");
      ids = ids.concat(found.map((s) => s._id.toString()));
    }
    if (!ids.length) return res.status(400).json({ message: "Aucun étudiant fourni." });

    const set = new Set(course.enrolledStudents.map((x) => x.toString()));
    ids.forEach((id) => set.add(id.toString()));
    course.enrolledStudents = [...set];
    await course.save();

    await logAudit({ req, action: "course_enrollment_updated", targetType: "Course", targetId: course._id, description: `Inscriptions mises à jour — ${course.code} (${course.enrolledStudents.length} étudiants)` });
    return res.json({ message: "Étudiants inscrits.", enrolledCount: course.enrolledStudents.length });
  } catch (error) {
    logError("Erreur enrollStudents", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

// DELETE /api/courses/:id/enroll/:studentId — désinscrire (admin)
const unenrollStudent = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ message: "Cours introuvable." });
    course.enrolledStudents = course.enrolledStudents.filter((x) => x.toString() !== req.params.studentId);
    await course.save();
    return res.json({ message: "Étudiant désinscrit.", enrolledCount: course.enrolledStudents.length });
  } catch (error) {
    logError("Erreur unenrollStudent", error);
    return res.status(500).json({ message: "Erreur serveur." });
  }
};

module.exports = { listCourses, getCourse, createCourse, updateCourse, enrollStudents, unenrollStudent };
