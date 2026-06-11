const mongoose = require('mongoose');
const User = require('../models/User');
const Student = require('../models/Student');
require('dotenv').config();

// Emails réels pour recevoir les OTP (alias Gmail du compte smartcampus.demos)
const emailUpdates = [
  { oldEmail: 'jean.dupont@campus.edu',  newEmail: 'smartcampus.demos+jean@gmail.com' },
  { oldEmail: 'marie.martin@campus.edu', newEmail: 'smartcampus.demos+marie@gmail.com' },
  { oldEmail: 'test.admin@campus.edu',   newEmail: 'smartcampus.demos+testadmin@gmail.com' },
];

async function updateEmails() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connexion MongoDB établie\n');

    for (const { oldEmail, newEmail } of emailUpdates) {
      const user = await User.findOneAndUpdate(
        { email: oldEmail },
        { email: newEmail },
        { new: true }
      );

      const student = await Student.findOneAndUpdate(
        { email: oldEmail },
        { email: newEmail },
        { new: true }
      );

      if (user) {
        console.log(`✅ ${user.prenom} ${user.nom}`);
        console.log(`   User:    ${oldEmail} → ${newEmail}`);
        console.log(`   Student: ${student ? 'mis à jour' : '⚠️ non trouvé'}\n`);
      } else {
        console.log(`⚠️  Utilisateur non trouvé: ${oldEmail}\n`);
      }
    }

    console.log('🎯 CONNEXION DASHBOARD ÉTUDIANT:');
    console.log('   Email:        smartcampus.demos+jean@gmail.com');
    console.log('   Mot de passe: Campus2024!');
    console.log('   OTP:          reçu dans la boîte smartcampus.demos@gmail.com');

  } catch (error) {
    console.error('❌ Erreur:', error.message);
  } finally {
    await mongoose.connection.close();
  }
}

updateEmails();