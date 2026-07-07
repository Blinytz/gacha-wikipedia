// Module 2 — Chaîne Collecte / Traitement / Raffinage.
// Trois curseurs à budget partagé (somme = 100 %, vol cyclique). La matière
// brute arrive selon un régime (Faible/Modéré/Fort) ; Collecte la capture
// vers une file périssable, Traitement la transforme en stock impérissable,
// Raffinage consomme le stock pour produire le boost.

import { config } from './config.js';
import { gauss } from './station.js';

function niveauFlux(type) {
  return config.get({ faible: 'niveauFluxFaible', modere: 'niveauFluxModere',
                      fort: 'niveauFluxFort' }[type]);
}

// Transitions pondérées (poids normalisés, ajustables dans les Réglages).
const TRANSITIONS = {
  faible: [['modere', 'transFaibleVersModere'], ['fort', 'transFaibleVersFort']],
  modere: [['faible', 'transModereVersFaible'], ['fort', 'transModereVersFort']],
  fort:   [['modere', 'transFortVersModere'], ['faible', 'transFortVersFaible']],
};

function regimeSuivant(type) {
  const branches = TRANSITIONS[type].map(([vers, cle]) => [vers, config.get(cle)]);
  const total = branches.reduce((a, [, p]) => a + p, 0) || 1;
  let r = Math.random() * total;
  for (const [vers, p] of branches) {
    r -= p;
    if (r <= 0) return vers;
  }
  return branches[branches.length - 1][0];
}

function nouveauRegimeFlux(type, quand) {
  const dMin = config.get('dureeRegimeFluxMin');
  const dMax = config.get('dureeRegimeFluxMax');
  const duree = (dMin + Math.random() * (dMax - dMin)) * 1000;
  return { type, debutTs: quand, finTs: quand + duree, bruit: 0 };
}

export function initM2(maintenant) {
  return {
    curseurs: { collecte: 34, traitement: 33, raffinage: 33 },
    file: [],            // lots périssables [{q, expireTs}]
    stock: 0,
    regime: nouveauRegimeFlux('modere', maintenant),
    fluxActuel: 0,
    pertes: { peremption: 0, debordement: 0 },   // compteurs indicatifs
  };
}

// Vol cyclique : Collecte -> Traitement -> Raffinage -> Collecte.
// Augmenter un curseur prend au suivant (puis au sur-suivant) ; diminuer
// restitue au suivant. La somme reste exactement 100.
const CYCLE = { collecte: 'traitement', traitement: 'raffinage', raffinage: 'collecte' };

export function reglerCurseurM2(m2, nom, valeurVoulue) {
  const c = m2.curseurs;
  valeurVoulue = Math.max(0, Math.min(100, Math.round(valeurVoulue)));
  let delta = valeurVoulue - c[nom];
  if (delta > 0) {
    const suivant = CYCLE[nom], surSuivant = CYCLE[suivant];
    const prise1 = Math.min(delta, c[suivant]);
    c[suivant] -= prise1;
    const prise2 = Math.min(delta - prise1, c[surSuivant]);
    c[surSuivant] -= prise2;
    c[nom] += prise1 + prise2;
  } else if (delta < 0) {
    c[CYCLE[nom]] += -delta;
    c[nom] = valeurVoulue;
  }
}

export function stepM2(m2, dt, simNow) {
  // --- régime de flux entrant
  if (simNow >= m2.regime.finTs) {
    m2.regime = nouveauRegimeFlux(regimeSuivant(m2.regime.type), simNow);
  }
  // bruit léger autour du niveau de base (marche lente bornée)
  const amplBruit = config.get('amplitudeBruitFlux');
  m2.regime.bruit = Math.max(-amplBruit, Math.min(amplBruit,
    m2.regime.bruit + gauss() * config.get('incrementBruitFlux') * dt
    - m2.regime.bruit * config.get('rappelBruitFlux') * dt));
  const debitMaxC = config.get('debitMaxCollecte') / 60;       // unités/s
  const debitMaxT = config.get('debitMaxTraitement') / 60;
  const flux = debitMaxC * (niveauFlux(m2.regime.type) + m2.regime.bruit);
  m2.fluxActuel = Math.max(0, flux);

  // --- collecte : capacité = curseur % du débit max ; le surplus est perdu
  const capaciteCollecte = debitMaxC * (m2.curseurs.collecte / 100);
  let collecte = Math.min(m2.fluxActuel, capaciteCollecte) * dt;

  // --- péremption de la file (lots FIFO)
  while (m2.file.length && m2.file[0].expireTs <= simNow) {
    m2.pertes.peremption += m2.file.shift().q;
  }

  // --- entrée en file (plafond de stockage)
  const capFile = config.get('capaciteMaxFileAttente');
  const enFile = m2.file.reduce((a, l) => a + l.q, 0);
  const place = Math.max(0, capFile - enFile);
  if (collecte > place) { m2.pertes.debordement += collecte - place; collecte = place; }
  if (collecte > 0) {
    const expireTs = simNow + config.get('dureeDeVieLot') * 1000;
    const dernier = m2.file[m2.file.length - 1];
    // agrégation par tranche d'expiration pour borner la taille de la file
    if (dernier && expireTs - dernier.expireTs <
        config.get('granulariteLotsM2') * 1000) dernier.q += collecte;
    else m2.file.push({ q: collecte, expireTs });
  }

  // --- traitement : file (FIFO) -> stock impérissable
  let capaciteTraitement = debitMaxT * (m2.curseurs.traitement / 100) * dt;
  const capStock = config.get('capaciteMaxStockTraite');
  while (capaciteTraitement > 0 && m2.file.length && m2.stock < capStock) {
    const lot = m2.file[0];
    const pris = Math.min(lot.q, capaciteTraitement, capStock - m2.stock);
    lot.q -= pris; m2.stock += pris; capaciteTraitement -= pris;
    if (lot.q <= 1e-9) m2.file.shift();
  }

  // --- raffinage : consomme le stock, boost immédiat tant qu'il y en a
  const conso = (config.get('consommationStockParRaffinage') / 60)
                * (m2.curseurs.raffinage / 100) * dt;
  m2.stock = Math.max(0, m2.stock - conso);
}

export function boostM2(m2) {
  if (!m2 || m2.stub || !m2.curseurs) return 1;
  if (m2.stock <= 0) return 1;    // stock vide -> retombe immédiatement à ×1
  return 1 + (m2.curseurs.raffinage / 100) * config.get('intensiteBoostParRaffinage');
}

export function quantiteEnFile(m2) {
  return m2.file.reduce((a, l) => a + l.q, 0);
}

// Tension : monte doucement à l'approche de la fin naturelle du régime.
export function tensionRegime(m2, maintenant) {
  const r = m2.regime;
  return Math.max(0, Math.min(1, (maintenant - r.debutTs) / (r.finTs - r.debutTs)));
}

export function prochainePeremption(m2, maintenant) {
  if (!m2.file.length) return null;
  return Math.max(0, (m2.file[0].expireTs - maintenant) / 1000);
}
