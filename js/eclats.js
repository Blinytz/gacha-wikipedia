// Moteur du taux de change des Éclats — modèle à régimes (spec section
// « Doublons et monnaie Éclats ») :
//  - régime bas (dérive vers ~0.7-0.85), haut (~1.2-1.4) ou neutre (~0.95-1.1)
//  - chaque régime dure entre dureeRegimeEclatsMin et Max, puis re-tirage
//  - à chaque tick (10 s), lissage exponentiel vers la cible + léger bruit
//  - clamp permanent entre tauxEclatsMin et tauxEclatsMax
//  - rattrapage hors-ligne : la simulation est rejouée tick par tick

import { etat, sauvegarder } from './etat.js';
import { config } from './config.js';

const LISSAGE = 0.035;            // rapprochement de la cible par tick
const BRUIT = 0.004;              // écart-type du bruit par tick
const PAS_ECHANTILLON = 300_000;  // un point d'historique toutes les 5 min
const MAX_HISTORIQUE = 2200;      // ~7,6 jours de points
const MAX_RATTRAPAGE_MS = 7 * 86400_000;

function msParTick() {
  return config.get('frequenceRafraichissementTauxEclats') * 1000;
}

function bornes() {
  const min = config.get('tauxEclatsMin');
  const max = config.get('tauxEclatsMax');
  return { min, max, portee: max - min };
}

function gauss() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function nouveauRegime(quand) {
  const { min, portee } = bornes();
  const r = Math.random();
  let type, cible;
  if (r < 0.4) {          // crash : zone basse ~0.70-0.85
    type = 'bas';
    cible = min + portee * (0.21 * Math.random());
  } else if (r < 0.8) {   // période intéressante : zone haute ~1.20-1.40
    type = 'haut';
    cible = min + portee * (0.71 + 0.29 * Math.random());
  } else {                // zone neutre intermédiaire (casse la prévisibilité)
    type = 'neutre';
    cible = min + portee * (0.36 + 0.21 * Math.random());
  }
  const dMin = config.get('dureeRegimeEclatsMin');
  const dMax = config.get('dureeRegimeEclatsMax');
  const duree = (dMin + Math.random() * (dMax - dMin)) * 1000;
  return { type, cible, finTs: quand + duree };
}

function unTick(te, quand) {
  if (quand >= te.regime.finTs) te.regime = nouveauRegime(quand);
  const { min, max } = bornes();
  te.taux += (te.regime.cible - te.taux) * LISSAGE + gauss() * BRUIT;
  te.taux = Math.min(max, Math.max(min, te.taux));
  if (quand - te.dernierEchantillon >= PAS_ECHANTILLON) {
    te.historique.push([quand, Number(te.taux.toFixed(4))]);
    te.dernierEchantillon = quand;
    if (te.historique.length > MAX_HISTORIQUE) {
      te.historique.splice(0, te.historique.length - MAX_HISTORIQUE);
    }
  }
}

export function initEclats() {
  const maintenant = Date.now();
  if (!etat.tauxEclats || typeof etat.tauxEclats.taux !== 'number') {
    etat.tauxEclats = {
      taux: 1.0,
      regime: nouveauRegime(maintenant),
      lastTick: maintenant,
      historique: [[maintenant, 1.0]],
      dernierEchantillon: maintenant,
    };
    sauvegarder();
  }
  tickEclats();   // rattrapage du temps hors ligne
}

export function tickEclats() {
  const te = etat.tauxEclats;
  if (!te) return;
  const pas = msParTick();
  let maintenant = Date.now();
  // Absence très longue : inutile de simuler plus loin que la fenêtre
  // conservée — on saute au début de la fenêtre de rattrapage.
  if (maintenant - te.lastTick > MAX_RATTRAPAGE_MS) {
    te.lastTick = maintenant - MAX_RATTRAPAGE_MS;
    te.dernierEchantillon = te.lastTick;
  }
  let avance = false;
  while (maintenant - te.lastTick >= pas) {
    te.lastTick += pas;
    unTick(te, te.lastTick);
    avance = true;
  }
  if (avance) sauvegarder();
}

export function tauxActuel() {
  return etat.tauxEclats?.taux ?? 1.0;
}

// Vend UN doublon : jamais le dernier exemplaire. Retourne le montant ou null.
export function vendreDoublon(carte) {
  const qte = etat.cartes[carte.id] || 0;
  if (qte < 2) return null;
  const montant = Math.round(carte.pv * tauxActuel());
  etat.cartes[carte.id] = qte - 1;
  etat.eclats += montant;
  sauvegarder();
  return montant;
}

// Retire des Éclats du compteur (simple décompte, aucune action automatisée).
export function consommerEclats(montant) {
  montant = Math.floor(montant);
  if (!Number.isFinite(montant) || montant <= 0 || montant > etat.eclats) return false;
  etat.eclats -= montant;
  sauvegarder();
  return true;
}

// Courbe SVG de l'historique (fenêtre en heures) — sans bibliothèque.
export function svgHistorique(heures = 6, largeur = 320, hauteur = 110) {
  const te = etat.tauxEclats;
  const { min, max } = bornes();
  const depuis = Date.now() - heures * 3600_000;
  const pts = (te?.historique ?? []).filter(([t]) => t >= depuis);
  if (te) pts.push([Date.now(), te.taux]);
  if (pts.length < 2) {
    return `<svg viewBox="0 0 ${largeur} ${hauteur}" class="graphe-taux">
      <text x="${largeur / 2}" y="${hauteur / 2}" class="txt-graphe" text-anchor="middle">
      Historique en cours de constitution…</text></svg>`;
  }
  const t0 = pts[0][0], t1 = pts[pts.length - 1][0];
  const x = t => 4 + (largeur - 8) * (t - t0) / Math.max(1, t1 - t0);
  const y = v => hauteur - 16 - (hauteur - 30) * (v - min) / (max - min);
  const ligne = pts.map(([t, v]) => `${x(t).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const seuilHaut = y(min + (max - min) * 0.71);
  const seuilBas = y(min + (max - min) * 0.21);
  return `
  <svg viewBox="0 0 ${largeur} ${hauteur}" class="graphe-taux" preserveAspectRatio="none">
    <line x1="0" x2="${largeur}" y1="${seuilHaut}" y2="${seuilHaut}" class="seuil seuil-haut"/>
    <line x1="0" x2="${largeur}" y1="${seuilBas}" y2="${seuilBas}" class="seuil seuil-bas"/>
    <text x="4" y="${seuilHaut - 3}" class="txt-graphe">zone haute</text>
    <text x="4" y="${seuilBas + 11}" class="txt-graphe">zone basse</text>
    <polyline points="${ligne}" class="courbe-taux"/>
    <circle cx="${x(t1).toFixed(1)}" cy="${y(pts[pts.length - 1][1]).toFixed(1)}" r="3.5"
            class="point-taux"/>
    <text x="${largeur - 4}" y="12" text-anchor="end" class="txt-graphe">
      ${heures}h — taux ×${tauxActuel().toFixed(2)}</text>
  </svg>`;
}
