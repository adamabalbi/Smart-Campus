const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

async function listUsers() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const users = await User.find().select('nom prenom email role status createdAt');

    console.log('👥 UTILISATEURS EXISTANTS:');
    console.log('========================\n');

    if (users.length === 0) {
      console.log('❌ Aucun utilisateur trouvé\n');
      return;
    }

    users.forEach((user, index) => {
      console.log(`${index + 1}. ${user.prenom} ${user.nom}`);
      console.log(`   📧 Email: ${user.email}`);
      console.log(`   👤 Rôle: ${user.role}`);
      console.log(`   📊 Status: ${user.status}`);
      console.log(`   📅 Créé: ${user.createdAt.toLocaleDateString('fr-FR')}`);
      console.log('');
    });

    console.log(`📈 TOTAL: ${users.length} utilisateur(s)\n`);

    // Compter par rôle
    const roleCount = users.reduce((acc, user) => {
      acc[user.role] = (acc[user.role] || 0) + 1;
      return acc;
    }, {});

    console.log('📊 RÉPARTITION PAR RÔLE:');
    Object.entries(roleCount).forEach(([role, count]) => {
      console.log(`   ${role}: ${count}`);
    });

  } catch (error) {
    console.error('❌ Erreur:', error.message);
  } finally {
    await mongoose.connection.close();
  }
}

listUsers();