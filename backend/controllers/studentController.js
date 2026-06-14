const bcrypt = require("bcryptjs");
const { logError } = require("../utils/secureLogger");
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || "10", 10);

const User            = require("../models/User");
const Student         = require("../models/Student");
const Card            = require("../models/Card");
const Wallet          = require("../models/Wallet");
const CardApplication = require("../models/CardApplication");

const generateTempPassword = require("../utils/generateTempPassword");
const sendEmail            = require("../utils/sendEmail");
const { logAudit }         = require("../services/auditService");

// 1. Créer un étudiant + compte utilisateur étudiant
const createStudent = async (req, res) => {
  try {
    const {
      matricule,
      nom,
      prenom,
      email,
      telephone,
      filiere,
      niveau,
      departement,
    } = req.body;

    if (!matricule || !nom || !prenom || !email || !filiere || !niveau) {
      return res.status(400).json({
        message: "Veuillez remplir tous les champs obligatoires.",
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        message: "Un utilisateur avec cet email existe déjà.",
      });
    }

    const existingStudent = await Student.findOne({ matricule });
    if (existingStudent) {
      return res.status(400).json({
        message: "Un étudiant avec ce matricule existe déjà.",
      });
    }

    const tempPassword = generateTempPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);

    const user = await User.create({
      nom,
      prenom,
      email,
      password: hashedPassword,
      role: "student",
      status: "active",
      mustChangePassword: true,
    });

    const student = await Student.create({
      userId: user._id,
      matricule,
      nom,
      prenom,
      email,
      telephone,
      filiere,
      niveau,
      departement,
      status: "active",
    });

    await sendEmail({
      to: email,
      subject: "Création de votre compte étudiant Smart Campus",
      text: `Bonjour ${prenom} ${nom},

Votre compte étudiant Smart Campus a été créé.

Voici vos informations de connexion :

Email : ${email}
Mot de passe temporaire : ${tempPassword}
Matricule : ${matricule}
Filière : ${filiere}
Niveau : ${niveau}

Pour des raisons de sécurité, vous devrez changer ce mot de passe après votre première connexion.

Cordialement,
Plateforme Smart Campus`,
    });

    await logAudit({ req, action: "student_created", targetType: "Student", targetId: student._id, description: `Création de l'étudiant ${prenom} ${nom} (${matricule})`, newValue: { matricule, email, filiere, niveau } });

    return res.status(201).json({
      message:
        "Étudiant créé avec succès. Un compte utilisateur étudiant et un mail de connexion ont été générés.",
      student,
      user: {
        id: user._id,
        nom: user.nom,
        prenom: user.prenom,
        email: user.email,
        role: user.role,
        status: user.status,
        mustChangePassword: user.mustChangePassword,
      },
    });
  } catch (error) {
    logError("Erreur createStudent", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la création de l'étudiant.",
    });
  }
};

// 2. Lister tous les étudiants
const getStudents = async (req, res) => {
  try {
    const students = await Student.find()
      .populate("userId", "nom prenom email role status mustChangePassword")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      message: "Liste des étudiants récupérée avec succès.",
      count: students.length,
      students,
    });
  } catch (error) {
    logError("Erreur getStudents", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la récupération des étudiants.",
    });
  }
};

// 3. Consulter un étudiant par ID
const getStudentById = async (req, res) => {
  try {
    const { id } = req.params;

    const student = await Student.findById(id).populate(
      "userId",
      "nom prenom email role status mustChangePassword"
    );

    if (!student) {
      return res.status(404).json({
        message: "Étudiant introuvable.",
      });
    }

    return res.status(200).json({
      message: "Étudiant récupéré avec succès.",
      student,
    });
  } catch (error) {
    logError("Erreur getStudentById", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la récupération de l'étudiant.",
    });
  }
};

// 4. Modifier un étudiant
const updateStudent = async (req, res) => {
  try {
    const { id } = req.params;

    const {
      nom,
      prenom,
      telephone,
      filiere,
      niveau,
      departement,
    } = req.body;

    const student = await Student.findById(id);

    if (!student) {
      return res.status(404).json({
        message: "Étudiant introuvable.",
      });
    }

    if (nom) student.nom = nom;
    if (prenom) student.prenom = prenom;
    if (telephone) student.telephone = telephone;
    if (filiere) student.filiere = filiere;
    if (niveau) student.niveau = niveau;
    if (departement) student.departement = departement;

    await student.save();

    await User.findByIdAndUpdate(student.userId, {
      nom: student.nom,
      prenom: student.prenom,
    });

    return res.status(200).json({
      message: "Étudiant modifié avec succès.",
      student,
    });
  } catch (error) {
    logError("Erreur updateStudent", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la modification de l'étudiant.",
    });
  }
};

// 5. Changer le statut d'un étudiant
const updateStudentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowedStatuses = ["active", "inactive", "disabled"];

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        message:
          "Statut invalide. Valeurs possibles : active, inactive, disabled.",
      });
    }

    const student = await Student.findById(id);

    if (!student) {
      return res.status(404).json({
        message: "Étudiant introuvable.",
      });
    }

    const oldStatus = student.status;
    student.status = status;
    await student.save();

    await logAudit({ req, action: "student_status_updated", targetType: "Student", targetId: student._id, description: `Statut de ${student.prenom} ${student.nom} (${student.matricule}) : ${oldStatus} → ${status}`, oldValue: { status: oldStatus }, newValue: { status } });

    const userStatus = status === "active" ? "active" : "disabled";

    await User.findByIdAndUpdate(student.userId, {
      status: userStatus,
    });

    return res.status(200).json({
      message: "Statut de l'étudiant mis à jour avec succès.",
      student,
    });
  } catch (error) {
    logError("Erreur updateStudentStatus", error);
    return res.status(500).json({
      message: "Erreur serveur lors de la mise à jour du statut étudiant.",
    });
  }
};

// 6. Supprimer un étudiant (cascade : User, Card, Wallet, CardApplication)
const deleteStudent = async (req, res) => {
  try {
    const { id } = req.params;

    const student = await Student.findById(id);
    if (!student) {
      return res.status(404).json({ message: "Étudiant introuvable." });
    }

    await Promise.all([
      User.findByIdAndDelete(student.userId),
      Card.findOneAndDelete({ studentId: student._id }),
      Wallet.findOneAndDelete({ studentId: student._id }),
      CardApplication.findOneAndDelete({ studentId: student._id }),
    ]);

    await Student.findByIdAndDelete(id);

    await logAudit({ req, action: "student_deleted", targetType: "Student", targetId: id, description: `Suppression de l'étudiant ${student.prenom} ${student.nom} (${student.matricule}) et de ses données associées`, oldValue: { matricule: student.matricule, email: student.email } });

    return res.status(200).json({ message: "Étudiant et toutes ses données supprimés avec succès." });
  } catch (error) {
    logError("Erreur deleteStudent", error);
    return res.status(500).json({ message: "Erreur serveur lors de la suppression." });
  }
};

module.exports = {
  createStudent,
  getStudents,
  getStudentById,
  updateStudent,
  updateStudentStatus,
  deleteStudent,
};