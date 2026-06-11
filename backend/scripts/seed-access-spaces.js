const mongoose = require('mongoose');
require('dotenv').config();
const AccessSpace = require('../models/AccessSpace');

const spaces = [
  { key: 'salle-info',    label: 'Salle informatique',     description: 'Salle des ordinateurs' },
  { key: 'bibliotheque',  label: 'Bibliothèque',           description: 'Espace de lecture et emprunt' },
  { key: 'laboratoire',   label: 'Laboratoire',            description: 'Laboratoire informatique / sciences' },
  { key: 'salle-cours',   label: 'Salle de cours',         description: 'Salles de cours' },
  { key: 'batiment-admin',label: 'Bâtiment administratif', description: 'Locaux administratifs' },
  { key: 'residence',     label: 'Résidence universitaire',description: 'Logement étudiant' },
];

async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connexion MongoDB établie\n');

    for (const s of spaces) {
      const existing = await AccessSpace.findOne({ key: s.key });
      if (existing) {
        console.log(`↪️  Espace déjà présent : ${s.label} (${existing.status})`);
      } else {
        await AccessSpace.create({ ...s, status: 'active' });
        console.log(`✅ Espace créé : ${s.label} (actif)`);
      }
    }

    console.log('\n🎯 Espaces disponibles :');
    const all = await AccessSpace.find();
    all.forEach(s => console.log(`   - ${s.label} [${s.key}] : ${s.status}`));
  } catch (error) {
    console.error('❌ Erreur:', error.message);
  } finally {
    await mongoose.connection.close();
  }
}

seed();
