// Paramètres ajustables — spec section « Paramètres ajustables ».
// RIEN n'est hardcodé dans la logique : toujours passer par config.get(cle).
// Chaque entrée : valeur par défaut, section (pour l'écran Réglages) et aide.

import { etat, sauvegarder } from './etat.js';

export const DEFAUTS = {
  // --- Tirage et paquets
  dureeBaseSecondes:  { valeur: 86400, section: 'Tirage et paquets',
    aide: "Temps de chargement d'un paquet à vitesse x1, en secondes (24h = 86400)." },
  tailleDuPaquet:     { valeur: 10, section: 'Tirage et paquets',
    aide: 'Nombre de cartes tirées par paquet.' },

  // --- Rareté et PV (utilisés à la génération des données, informatif ici)
  seuilLegendaire: { valeur: 0.02, section: 'Rareté et PV',
    aide: 'Fraction de la collection en Légendaire (appliqué à la régénération des données).' },
  seuilMythique:   { valeur: 0.06, section: 'Rareté et PV',
    aide: 'Fraction de la collection en Mythique.' },
  seuilEpique:     { valeur: 0.16, section: 'Rareté et PV',
    aide: 'Fraction de la collection en Épique.' },
  seuilRare:       { valeur: 0.26, section: 'Rareté et PV',
    aide: 'Fraction de la collection en Rare.' },
  pvMin: { valeur: 20,  section: 'Rareté et PV', aide: 'PV de la carte la moins populaire.' },
  pvMax: { valeur: 340, section: 'Rareté et PV', aide: 'PV de la carte la plus populaire.' },

  // --- Module 1 — Calibrage 3D
  vitesseDeriveCible: { valeur: 1.5, section: 'Module 1 — Calibrage 3D',
    aide: "Vitesse de déplacement de la cible cachée (% de l'espace par seconde)." },
  inertieCible: { valeur: 0.5, section: 'Module 1 — Calibrage 3D',
    aide: 'Résistance de la cible aux changements de direction (0 = nerveuse, 1 = très inerte).' },
  amplitudeBruitSignal: { valeur: 15, section: 'Module 1 — Calibrage 3D',
    aide: 'Écart maximal entre le signal affiché et la proximité réelle (points sur 100).' },
  vitesseDeriveBruit: { valeur: 3, section: 'Module 1 — Calibrage 3D',
    aide: 'Durée (s) sur laquelle le bruit du signal dérive.' },
  frequenceRafraichissementBoost: { valeur: 10, section: 'Module 1 — Calibrage 3D',
    aide: 'Intervalle (s) entre deux mises à jour du boost affiché.' },
  dureeMoyenneFenetreStabilite: { valeur: 18000, section: 'Module 1 — Calibrage 3D',
    aide: 'Intervalle moyen (s) entre deux fenêtres de stabilité (5h = 18000).' },
  dureeFenetreStabilite: { valeur: 600, section: 'Module 1 — Calibrage 3D',
    aide: "Durée de base (s) d'une fenêtre de stabilité normale (jackpot ×2-4, turbulence ×1-2)." },
  probabiliteEvenementRadical: { valeur: 0.12, section: 'Module 1 — Calibrage 3D',
    aide: "Chance qu'une fenêtre soit radicale (jackpot ou turbulence) plutôt que normale." },
  energieMax: { valeur: 10000, section: 'Module 1 — Calibrage 3D',
    aide: "Capacité maximale de la jauge d'énergie." },
  tauxEnergieParSeconde: { valeur: 0.5, section: 'Module 1 — Calibrage 3D',
    aide: "Vitesse de génération/consommation d'énergie à ±100% (points par seconde)." },

  // --- Module 2 — Chaîne Collecte/Traitement/Raffinage
  dureeDeVieLot: { valeur: 2700, section: 'Module 2 — Chaîne',
    aide: "Temps (s) avant péremption d'un lot collecté non traité (45 min = 2700)." },
  capaciteMaxFileAttente: { valeur: 600, section: 'Module 2 — Chaîne',
    aide: 'Stockage maximum de la file de matière collectée en attente.' },
  capaciteMaxStockTraite: { valeur: 2000, section: 'Module 2 — Chaîne',
    aide: 'Stockage maximum du stock de matière traitée impérissable.' },
  debitMaxCollecte: { valeur: 40, section: 'Module 2 — Chaîne',
    aide: 'Débit maximal de Collecte à 100% de capacité (unités/min).' },
  debitMaxTraitement: { valeur: 40, section: 'Module 2 — Chaîne',
    aide: 'Débit maximal de Traitement à 100% de capacité (unités/min).' },
  intensiteBoostParRaffinage: { valeur: 1, section: 'Module 2 — Chaîne',
    aide: 'Constante K : boost = 1 + raffinage% × K.' },
  consommationStockParRaffinage: { valeur: 20, section: 'Module 2 — Chaîne',
    aide: 'Consommation du stock traité à Raffinage 100% (unités/min).' },

  // --- Module 3 — Marché à 3 indices
  capitalDepart: { valeur: 500, section: 'Module 3 — Marché',
    aide: 'Liquidités de départ du joueur.' },
  allocationSecoursJournaliere: { valeur: 20, section: 'Module 3 — Marché',
    aide: 'Filet de sécurité passif quotidien (unités/jour).' },
  tauxCommission: { valeur: 0.0015, section: 'Module 3 — Marché',
    aide: 'Commission prélevée à chaque achat/vente (0.0015 = 0,15%).' },
  tauxDividendeIndiceStable: { valeur: 0.005, section: 'Module 3 — Marché',
    aide: "Dividende journalier de l'indice Stable, proportionnel aux parts détenues." },
  amplitudeTauxIntensiteMin: { valeur: 0.5, section: 'Module 3 — Marché',
    aide: 'Borne basse du taux de conversion Intensité.' },
  amplitudeTauxIntensiteMax: { valeur: 2, section: 'Module 3 — Marché',
    aide: 'Borne haute du taux de conversion Intensité.' },
  amplitudeTauxDureeMin: { valeur: 0.5, section: 'Module 3 — Marché',
    aide: 'Borne basse du taux de conversion Durée.' },
  amplitudeTauxDureeMax: { valeur: 2, section: 'Module 3 — Marché',
    aide: 'Borne haute du taux de conversion Durée.' },
  vitesseDeriveTauxConversion: { valeur: 21600, section: 'Module 3 — Marché',
    aide: 'Durée caractéristique (s) de dérive des taux de conversion (6h = 21600).' },

  // --- Éclats
  tauxEclatsMin: { valeur: 0.7, section: 'Éclats',
    aide: 'Borne basse du taux de change des Éclats.' },
  tauxEclatsMax: { valeur: 1.4, section: 'Éclats',
    aide: 'Borne haute du taux de change des Éclats.' },
  dureeRegimeEclatsMin: { valeur: 1200, section: 'Éclats',
    aide: "Durée minimale (s) d'un régime haut/bas/neutre (20 min = 1200)." },
  dureeRegimeEclatsMax: { valeur: 5400, section: 'Éclats',
    aide: "Durée maximale (s) d'un régime (90 min = 5400)." },
  frequenceRafraichissementTauxEclats: { valeur: 10, section: 'Éclats',
    aide: 'Intervalle (s) entre deux mises à jour du taux affiché.' },
};

export const config = {
  get(cle) {
    const surcharge = etat.configUtilisateur?.[cle];
    if (surcharge !== undefined && surcharge !== null) return surcharge;
    if (!(cle in DEFAUTS)) throw new Error(`Paramètre inconnu : ${cle}`);
    return DEFAUTS[cle].valeur;
  },
  set(cle, valeur) {
    if (!(cle in DEFAUTS)) throw new Error(`Paramètre inconnu : ${cle}`);
    etat.configUtilisateur[cle] = valeur;
    sauvegarder();
  },
  reinitialiserSection(section) {
    for (const [cle, def] of Object.entries(DEFAUTS)) {
      if (def.section === section) delete etat.configUtilisateur[cle];
    }
    sauvegarder();
  },
};
