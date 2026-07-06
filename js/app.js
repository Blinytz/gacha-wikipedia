// Point d'entrée : chargement des données, navigation, boucle d'horloge.

import { etat, sauvegarderMaintenant } from './etat.js';
import { chargerDonnees, donnees } from './donnees.js';
import { formaterNombre } from './ui.js';
import { rendreEcranPaquets, tickPaquets } from './ecran-paquets.js';
import { rendreEcranCollection } from './ecran-collection.js';
import { rendreEcranStation } from './ecran-station.js';
import { rendreEcranReglages } from './ecran-reglages.js';
import { initEclats, tickEclats, tauxActuel } from './eclats.js';

const ecrans = {
  paquets: rendreEcranPaquets,
  collection: rendreEcranCollection,
  station: rendreEcranStation,
  reglages: rendreEcranReglages,
};

export let ecranActif = 'paquets';

export function afficherEcran(nom, options = {}) {
  ecranActif = nom;
  for (const btn of document.querySelectorAll('#navbar button')) {
    btn.classList.toggle('actif', btn.dataset.ecran === nom);
  }
  for (const sec of document.querySelectorAll('.ecran')) {
    sec.classList.toggle('visible', sec.id === `ecran-${nom}`);
  }
  ecrans[nom](document.getElementById(`ecran-${nom}`), options);
}

export function rafraichirEntete() {
  document.getElementById('eclats-total').textContent = formaterNombre(etat.eclats);
  document.getElementById('eclats-taux').textContent = `×${tauxActuel().toFixed(2)}`;
}

async function demarrer() {
  try {
    await chargerDonnees();
  } catch (err) {
    document.getElementById('chargement').textContent =
      `Impossible de charger les données de cartes (${err.message}). ` +
      'Vérifie ta connexion pour le premier lancement.';
    return;
  }
  document.getElementById('chargement').remove();

  initEclats();          // création ou rattrapage hors-ligne du taux

  for (const btn of document.querySelectorAll('#navbar button')) {
    btn.addEventListener('click', () => afficherEcran(btn.dataset.ecran));
  }
  document.getElementById('chip-eclats').addEventListener('click',
    () => afficherEcran('reglages'));

  afficherEcran('paquets');
  rafraichirEntete();

  // Horloge : 1 tick/s pour l'UI et les moteurs (chacun gère sa propre cadence).
  setInterval(() => {
    tickEclats();
    tickPaquets();
    if (ecranActif === 'paquets') {
      rendreEcranPaquets(document.getElementById('ecran-paquets'), { tick: true });
    }
    rafraichirEntete();
  }, 1000);

  // Retour au premier plan : rattrapage immédiat.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      tickEclats(); tickPaquets(); rafraichirEntete();
      afficherEcran(ecranActif);
    }
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err =>
      console.warn('Service worker non enregistré :', err));
  }

  if (donnees.provisoire) {
    console.warn('DONNÉES PROVISOIRES — raretés/PV non définitifs (étape 2 à venir).');
  }
  // Accès console pour le débogage (projet perso) — pas utilisé par l'app.
  window.gachaDebug = { etat, donnees, sauvegarderMaintenant, afficherEcran };
  sauvegarderMaintenant();
}

demarrer();
