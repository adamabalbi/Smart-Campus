const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
require('dotenv').config();

const NEW_PASSWORD = 'Campus2024!';

const targetEmails = [
  'smartcampus.demos+jean@gmail.com',
  'smartcampus.demos+marie@gmail.com',
  'smartcampus.demos+testadmin@gmail.com',
];

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connexion MongoDB établie\n');

    for (const email of targetEmails) {
      const user = await User.findOne({ email });

      if (!user) {
        console.log(`⚠️  Utilisateur non trouvé: ${email}\n`);
        continue;
      }

      // Diagnostic : le mot de passe actuel correspond-il à Campus2024! ?
      const matchesCurrent = await bcrypt.compare(NEW_PASSWORD, user.password);
      console.log(`👤 ${user.prenom} ${user.nom} (${email})`);
      console.log(`   'Campus2024!' correspond au hash actuel ? ${matchesCurrent ? 'OUI' : 'NON'}`);

      // Réinitialisation propre
      user.password = await bcrypt.hash(NEW_PASSWORD, 10);
      user.mustChangePassword = true;
      await user.save();

      console.log(`   🔑 Mot de passe réinitialisé à: ${NEW_PASSWORD}\n`);
    }

    console.log('🎯 CONNEXION:');
    console.log('   Mot de passe pour les 3 comptes: Campus2024!');
    console.log('   (À changer à la première connexion)');

  } catch (error) {
    console.error('❌ Erreur:', error.message);
  } finally {
    await mongoose.connection.close();
  }
}

run();