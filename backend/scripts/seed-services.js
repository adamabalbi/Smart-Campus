const mongoose = require('mongoose');
require('dotenv').config();
const Service = require('../models/Service');

const services = [
  { key: 'cantine',      label: 'Cantine',      description: 'Paiement des repas' },
  { key: 'bibliotheque', label: 'Bibliothèque', description: 'Pénalités et frais de bibliothèque' },
  { key: 'imprimerie',   label: 'Imprimerie',   description: 'Impressions, photocopies et scans' },
];

async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connexion MongoDB établie\n');

    for (const s of services) {
      const existing = await Service.findOne({ key: s.key });
      if (existing) {
        console.log(`↪️  Service déjà présent : ${s.label} (statut: ${existing.status})`);
      } else {
        await Service.create({ ...s, status: 'active' });
        console.log(`✅ Service créé : ${s.label} (actif)`);
      }
    }

    console.log('\n🎯 Services disponibles :');
    const all = await Service.find();
    all.forEach(s => console.log(`   - ${s.label} [${s.key}] : ${s.status}`));

  } catch (error) {
    console.error('❌ Erreur:', error.message);
  } finally {
    await mongoose.connection.close();
  }
}

seed();
