// Station de Recherche — moteur commun : horloge de simulation partagée,
// rattrapage hors-ligne et combinaison des boosts.
//
// vitesse_totale = boost_m1 × boost_m2 × boost_m3 (chacun ≥ 1, sans plafond).
//
// Le rattrapage rejoue la simulation pas à pas depuis le dernier horodatage ;
// à chaque pas simulé, un callback permet à paquets.js de faire avancer la
// progression du paquet avec la vitesse RÉELLE de ce pas (pas la vitesse
// actuelle appliquée rétroactivement).

import { etat, sauvegarder } from './etat.js';
import { initM1, stepM1, boostM1 } from './station-m1.js';
import { initM2, stepM2, boostM2 } from './station-m2.js';
import { initM3, stepM3, boostM3 } from './station-m3.js';

const PAS_FIN = 1;        // s — simulation au fil de l'eau (app ouverte)
const PAS_GROS = 60;      // s — replay accéléré des longues absences
const SEUIL_GROS = 300;   // s de retard au-delà desquels on passe en pas gros
const MAX_RATTRAPAGE = 7 * 86400; // s — au-delà, on saute (états convergés)

export function gauss() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function initStation() {
  const maintenant = Date.now();
  if (!etat.station || !etat.station.m1) {
    etat.station = {
      lastTick: maintenant,
      m1: initM1(maintenant),
      m2: initM2(maintenant),
      m3: initM3(maintenant),
    };
    sauvegarder();
  }
  // Migration des stubs de développement (modules livrés étape par étape).
  if (etat.station.m2?.stub) { etat.station.m2 = initM2(maintenant); sauvegarder(); }
  if (etat.station.m3?.stub) { etat.station.m3 = initM3(maintenant); sauvegarder(); }
}

export function boosts() {
  const s = etat.station;
  if (!s) return { m1: 1, m2: 1, m3: 1 };
  return { m1: boostM1(s.m1), m2: boostM2(s.m2), m3: boostM3(s.m3) };
}

export function vitesseTotale() {
  const b = boosts();
  return b.m1 * b.m2 * b.m3;
}

// Avance la simulation jusqu'à maintenant. surPas(dtSecondes, vitesse) est
// appelé après chaque pas avec la vitesse en vigueur PENDANT ce pas.
export function rejouerStation(surPas) {
  initStation();
  const s = etat.station;
  const maintenant = Date.now();
  let retard = (maintenant - s.lastTick) / 1000;
  if (retard <= 0) return;
  if (retard > MAX_RATTRAPAGE) {
    s.lastTick = maintenant - MAX_RATTRAPAGE * 1000;
    retard = MAX_RATTRAPAGE;
  }
  let garde = 0;
  while ((maintenant - s.lastTick) / 1000 >= PAS_FIN && garde < 700_000) {
    garde += 1;
    const enRetard = (maintenant - s.lastTick) / 1000;
    const dt = enRetard > SEUIL_GROS ? Math.min(PAS_GROS, enRetard - 60) : PAS_FIN;
    const vitesse = vitesseTotale();      // vitesse au début du pas
    s.lastTick += dt * 1000;
    const simNow = s.lastTick;
    stepM1(s.m1, dt, simNow);
    stepM2(s.m2, dt, simNow);
    stepM3(s.m3, dt, simNow);
    surPas?.(dt, vitesse);
  }
  sauvegarder();
}
