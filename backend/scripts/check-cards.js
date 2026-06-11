const mongoose = require('mongoose');
const User = require('../models/User');
const Student = require('../models/Student');
const Card = require('../models/Card');
require('dotenv').config();

async function checkCardsStatus() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    // Récupérer tous les utilisateurs
    const users = await User.find().select('nom prenom email role status');

    // Récupérer toutes les cartes avec leurs étudiants
    const cards = await Card.find()
      .populate({
        path: 'studentId',
        populate: { path: 'userId' }
      });

    console.log('🔍 ANALYSE DES CARTES NFC:\n');
    console.log('=========================\n');

    console.log('💳 UTILISATEURS AVEC CARTES NFC:');
    console.log('─────────────────────────────────');

    if (cards.length === 0) {
      console.log('❌ Aucune carte trouvée\n');
    } else {
      let validCards = 0;
      cards.forEach((card, index) => {
        const student = card.studentId;

        if (student && student.userId) {
          const user = student.userId;
          validCards++;

          console.log(`${validCards}. ${user.prenom} ${user.nom}`);
          console.log(`   📧 ${user.email}`);
          console.log(`   💳 Carte: ${card.cardNumber}`);
          console.log(`   🔑 UID: ${card.uid}`);
          console.log(`   📊 Status: ${card.status}`);
          console.log('');
        } else {
          console.log(`⚠️  Carte ${card.cardNumber || 'sans nom'} - Étudiant ou utilisateur manquant`);
        }
      });
    }

    // Trouver les utilisateurs sans cartes
    const usersWithCards = cards.map(card => card.studentId.userId._id.toString());
    const usersWithoutCards = users.filter(user => !usersWithCards.includes(user._id.toString()));

    console.log('❌ UTILISATEURS SANS CARTES NFC:');
    console.log('──────────────────────────────────');

    if (usersWithoutCards.length === 0) {
      console.log('✅ Tous les utilisateurs ont une carte\n');
    } else {
      usersWithoutCards.forEach((user, index) => {
        console.log(`${index + 1}. ${user.prenom} ${user.nom}`);
        console.log(`   📧 ${user.email}`);
        console.log(`   👤 Rôle: ${user.role}`);
        console.log(`   ❓ Besoin carte? ${user.role === 'student' ? 'OUI' : 'Non (rôle administratif)'}`);
        console.log('');
      });
    }

    console.log(`📊 RÉSUMÉ:`);
    console.log(`   💳 Utilisateurs avec carte: ${cards.length}`);
    console.log(`   ❌ Utilisateurs sans carte: ${usersWithoutCards.length}`);
    console.log(`   🎓 Étudiants sans carte: ${usersWithoutCards.filter(u => u.role === 'student').length}`);
    console.log(`   👥 Staff sans carte: ${usersWithoutCards.filter(u => u.role !== 'student').length}`);

  } catch (error) {
    console.error('❌ Erreur:', error.message);
  } finally {
    await mongoose.connection.close();
  }
}

checkCardsStatus();