// Moteur des paquets : chargement horodaté, file d'attente illimitée,
// rattrapage hors-ligne, tirage équiprobable dans le pool global.

import { etat, sauvegarder } from './etat.js';
import { config } from './config.js';
import { donnees } from './donnees.js';
import { vitesseTotale, rejouerStation } from './station.js';

// Point d'entrée UNIQUE de la vitesse : produit des boosts des 3 modules de
// la Station de Recherche (chacun ≥ 1).
export function getVitesseTotale() {
  return vitesseTotale();
}

export function initPaquets() {
  if (!etat.paquets || typeof etat.paquets.progression !== 'number') {
    etat.paquets = { progression: 0, lastTs: Date.now(), prets: 0, ouverts: 0 };
  }
  rattraperPaquets();
}

// Fait avancer le chargement en suivant le replay de la Station : chaque pas
// simulé applique la vitesse RÉELLE de ce pas (les boosts évoluent pendant
// l'absence — stock qui s'épuise, instances qui expirent…). La vitesse
// s'applique à la progression restante : jamais de retour à zéro.
export function rattraperPaquets() {
  const p = etat.paquets;
  if (!p) return;
  const duree = config.get('dureeBaseSecondes');
  rejouerStation((dt, vitesse) => {
    p.progression += dt * vitesse / duree;
    while (p.progression >= 1) {
      p.prets += 1;               // le suivant démarre automatiquement derrière
      p.progression -= 1;
    }
  });
  p.lastTs = Date.now();
  sauvegarder();
}

export function secondesRestantes() {
  const p = etat.paquets;
  const duree = config.get('dureeBaseSecondes');
  return Math.max(0, (1 - p.progression) * duree / getVitesseTotale());
}

// Tire un paquet depuis la file : cartes équiprobables, doublons conservés.
// Retourne [{carte, nouvelle}] ou null si aucun paquet prêt.
export function ouvrirPaquet() {
  rattraperPaquets();
  const p = etat.paquets;
  if (p.prets < 1) return null;
  p.prets -= 1;
  p.ouverts += 1;
  const taille = config.get('tailleDuPaquet');
  const tirage = [];
  for (let i = 0; i < taille; i++) {
    const id = donnees.pool[Math.floor(Math.random() * donnees.pool.length)];
    const carte = donnees.parId.get(id);
    const nouvelle = !(etat.cartes[id] > 0);
    etat.cartes[id] = (etat.cartes[id] || 0) + 1;
    tirage.push({ carte, nouvelle });
  }
  sauvegarder();
  return tirage;
}
