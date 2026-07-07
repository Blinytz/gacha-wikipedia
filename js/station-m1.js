// Module 1 — Calibrage 3D.
// Une cible cachée dérive dans un espace 100×100×100 (marche aléatoire avec
// inertie, rebonds doux). Le joueur la traque avec 3 curseurs ; il ne voit
// qu'un signal de proximité bruité (bruit en marche aléatoire lente, jamais
// de saut). L'énergie dépensée près de la cible amplifie le boost.

import { config } from './config.js';
import { gauss } from './station.js';

const DIST_ZERO = 100;    // distance à laquelle la proximité tombe à 0

export function initM1(maintenant) {
  return {
    curseurs: { x: 50, y: 50, z: 50 },
    cible: {
      x: Math.random() * 100, y: Math.random() * 100, z: Math.random() * 100,
      vx: 0, vy: 0, vz: 0,
    },
    bruit: 0, bruitV: 0,
    energie: 0,
    curseurEnergie: 0,             // -100 (génération) … +100 (consommation)
    fenetre: { prochaineTs: prochaineFenetre(maintenant), active: null },
    boostAffiche: 1,
    boostAfficheTs: maintenant,
  };
}

function prochaineFenetre(depuis) {
  const moyenne = config.get('dureeMoyenneFenetreStabilite') * 1000;
  return depuis + moyenne * (0.6 + Math.random() * 0.8);   // ±40 %
}

// Facteur d'agitation de la cible selon la fenêtre en cours.
function facteurAgitation(m1, simNow) {
  const f = m1.fenetre;
  if (f.active && simNow < f.active.finTs) {
    return { normale: 0.15, jackpot: 0.03, turbulence: 3 }[f.active.type];
  }
  return 1;
}

export function stepM1(m1, dt, simNow) {
  // --- fenêtres de stabilité
  const f = m1.fenetre;
  if (f.active && simNow >= f.active.finTs) f.active = null;
  if (!f.active && simNow >= f.prochaineTs) {
    const dureeBase = config.get('dureeFenetreStabilite') * 1000;
    let type = 'normale', duree = dureeBase * (0.8 + Math.random() * 0.6);
    if (Math.random() < config.get('probabiliteEvenementRadical')) {
      if (Math.random() < 0.5) { type = 'jackpot'; duree = dureeBase * (2 + Math.random() * 2); }
      else { type = 'turbulence'; duree = dureeBase * (1 + Math.random()); }
    }
    f.active = { type, finTs: simNow + duree };
    f.prochaineTs = prochaineFenetre(simNow + duree);
  }

  // --- dérive de la cible (marche aléatoire avec inertie, rebonds doux)
  const vMax = config.get('vitesseDeriveCible') * facteurAgitation(m1, simNow);
  const inertie = Math.min(0.98, Math.max(0, config.get('inertieCible')));
  const c = m1.cible;
  for (const axe of ['x', 'y', 'z']) {
    const va = 'v' + axe;
    c[va] = c[va] * (inertie ** dt) + gauss() * vMax * (1 - inertie) * dt * 3;
    c[va] = Math.max(-vMax, Math.min(vMax, c[va]));
    c[axe] += c[va] * dt;
    if (c[axe] < 0) { c[axe] = -c[axe] * 0.5; c[va] = Math.abs(c[va]) * 0.5; }
    if (c[axe] > 100) { c[axe] = 100 - (c[axe] - 100) * 0.5; c[va] = -Math.abs(c[va]) * 0.5; }
  }

  // --- bruit du signal : petite marche aléatoire bornée
  const ampli = config.get('amplitudeBruitSignal');
  const tau = Math.max(1, config.get('vitesseDeriveBruit'));
  m1.bruitV += gauss() * (ampli / tau) * dt * 0.8 - m1.bruitV * Math.min(1, dt / tau);
  m1.bruit += m1.bruitV * dt;
  m1.bruit = Math.max(-ampli, Math.min(ampli, m1.bruit * (1 - 0.02 * dt)));

  // --- énergie
  const tauxE = config.get('tauxEnergieParSeconde');
  const eMax = config.get('energieMax');
  m1.energie -= (m1.curseurEnergie / 100) * tauxE * dt;   // curseur + = consomme
  m1.energie = Math.max(0, Math.min(eMax, m1.energie));

  // --- boost affiché (rafraîchi ponctuellement, pas en temps réel)
  if (simNow - m1.boostAfficheTs >= config.get('frequenceRafraichissementBoost') * 1000) {
    m1.boostAffiche = boostM1(m1);
    m1.boostAfficheTs = simNow;
  }
}

export function proximiteReelle(m1) {
  const { x, y, z } = m1.curseurs;
  const c = m1.cible;
  const d = Math.hypot(x - c.x, y - c.y, z - c.z);
  return Math.max(0, 100 * (1 - d / DIST_ZERO));
}

export function signalAffiche(m1) {
  return Math.max(0, Math.min(100, proximiteReelle(m1) + m1.bruit));
}

// Part d'énergie réellement dépensée (0..1) : curseur en consommation ET jauge
// non vide.
function partConsommation(m1) {
  if (m1.curseurEnergie <= 0 || m1.energie <= 0) return 0;
  return m1.curseurEnergie / 100;
}

export function boostM1(m1) {
  const prox = proximiteReelle(m1) / 100;
  const boostPosition = 1 + prox;
  return boostPosition * (1 + partConsommation(m1) * prox);
}

// Annonce de la prochaine fenêtre : précision croissante à l'approche.
export function annonceFenetre(m1, maintenant) {
  const f = m1.fenetre;
  if (f.active) {
    const min = Math.ceil((f.active.finTs - maintenant) / 60000);
    const libelle = { normale: '🟢 Fenêtre de stabilité en cours',
                      jackpot: '🌟 Stabilité exceptionnelle en cours',
                      turbulence: '🌪️ Turbulence en cours' }[f.active.type];
    return `${libelle} (~${Math.max(1, min)} min restantes)`;
  }
  const restant = f.prochaineTs - maintenant;
  const min = restant / 60000;
  if (min > 120) return `Prochain événement : dans ${Math.round(min / 60)}h environ`;
  if (min > 30) return `Prochain événement : dans ${Math.round(min / 15) * 15} min environ`;
  if (min > 5) return `Prochain événement : dans ${Math.round(min / 5) * 5} min`;
  return `Prochain événement imminent (≈${Math.max(1, Math.round(min))} min) — nature inconnue`;
}
