const mongoose = require("mongoose");
require("dotenv").config();

const Card = require("./models/Card");
const Wallet = require("./models/Wallet");
const Student = require("./models/Student");

async function fixMissingWallet() {
  try {
    console.log("🔗 Connexion à MongoDB...");
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB connecté");

    // Trouver la carte avec l'UID problématique
    const cardUID = "043477E76E";
    console.log(`🔍 Recherche de la carte avec UID: ${cardUID}`);

    const card = await Card.findOne({ uid: cardUID }).populate('studentId');
    if (!card) {
      console.error(`❌ Carte avec UID ${cardUID} non trouvée`);
      return;
    }

    console.log(`✅ Carte trouvée: ${card._id}, Étudiant: ${card.studentId._id}`);

    // Vérifier si un portefeuille existe déjà pour cette carte
    const walletByCard = await Wallet.findOne({ cardId: card._id });
    if (walletByCard) {
      console.log(`✅ Portefeuille déjà associé à cette carte: ${walletByCard._id}`);
      return;
    }

    // Vérifier s'il y a un portefeuille pour cet étudiant
    const walletByStudent = await Wallet.findOne({ studentId: card.studentId._id });

    if (walletByStudent) {
      console.log(`🔧 Portefeuille trouvé pour l'étudiant mais pas associé à cette carte`);
      console.log(`   - Portefeuille ID: ${walletByStudent._id}`);
      console.log(`   - Carte actuelle: ${walletByStudent.cardId || 'Aucune'}`);
      console.log(`🔧 Association du portefeuille à la carte...`);

      walletByStudent.cardId = card._id;
      await walletByStudent.save();

      console.log(`✅ Portefeuille associé à la carte avec succès!`);
      const wallet = walletByStudent;
    } else {
      // Créer le portefeuille manquant
      console.log("🔧 Création du portefeuille manquant...");
      const wallet = await Wallet.create({
        studentId: card.studentId._id,
        cardId: card._id,
        balance: 0,
        currency: "XOF",
        status: "active",
        dailyLimit: 50000,
        monthlyLimit: 500000,
      });
      console.log(`✅ Nouveau portefeuille créé: ${wallet._id}`);
    }

    console.log(`✅ Portefeuille créé avec succès: ${wallet._id}`);
    console.log(`📊 Détails:`);
    console.log(`   - Étudiant: ${card.studentId.prenom} ${card.studentId.nom}`);
    console.log(`   - Matricule: ${card.studentId.matricule}`);
    console.log(`   - Balance: ${wallet.balance} ${wallet.currency}`);

  } catch (error) {
    console.error("❌ Erreur:", error.message);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Connexion fermée");
  }
}

fixMissingWallet();