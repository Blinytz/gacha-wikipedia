// Module 3 — Marché à 3 indices.
// Trois indices simulés (régimes de tendance, volatilité par grappes, chocs,
// mean reversion), trading avec commission et prix moyen pondéré, dividendes
// de l'indice Stable, calendrier d'événements procédural, et conversion du
// Capital de gains en instances de boost temporaires cumulables.

import { config } from './config.js';
import { gauss } from './station.js';

// Métadonnées fixes ; les valeurs numériques des profils vivent dans la
// config (deriveHoraire*/volatiliteHoraire*/facteurAgite*/probaChoc*/
// amplitudeChoc* par indice) et se lisent via profilDyn().
export const PROFILS = {
  stable:  { nom: 'Stable',  suffixe: 'Stable',  dividende: true },
  modere:  { nom: 'Modéré',  suffixe: 'Modere',  dividende: false },
  volatil: { nom: 'Volatil', suffixe: 'Volatil', dividende: false },
};

function profilDyn(cle) {
  const s = PROFILS[cle].suffixe;
  return {
    deriveH: config.get('deriveHoraire' + s),
    volH: config.get('volatiliteHoraire' + s),
    facteurAgite: config.get('facteurAgite' + s),
    probaChoc: config.get('probaChoc' + s),
    ampChoc: config.get('amplitudeChoc' + s),
  };
}

function tirerPondere(branches) {
  const total = branches.reduce((a, [, p]) => a + p, 0) || 1;
  let r = Math.random() * total;
  for (const [v, p] of branches) {
    r -= p;
    if (r <= 0) return v;
  }
  return branches[branches.length - 1][0];
}

/* ------------------------------------------------ génération procédurale */

const BANQUES = {
  sujets: ['Le consortium', 'La guilde marchande', 'Le laboratoire central',
           'Les archives', 'Le syndicat des forages', 'La fondation',
           "L'observatoire", 'Le collectif des artisans'],
  verbes: ['annonce', 'prépare', 'dément', 'révèle', 'suspend',
           'réorganise', 'finance', 'renégocie'],
  complements: ['une fusion majeure', 'un audit surprise', 'une découverte',
                'des sanctions', 'un prototype instable', 'une pénurie',
                'une expansion rapide', 'des rumeurs persistantes'],
};

function tirerSansRepetition(banque, recents) {
  const dispo = BANQUES[banque].filter(m => !recents[banque].includes(m));
  const mot = dispo[Math.floor(Math.random() * dispo.length)];
  recents[banque].push(mot);
  if (recents[banque].length > 3) recents[banque].shift();
  return mot;
}

// Fiabilité calibrée par tier d'impact — valeurs dans la config.
const SUFFIXE_IMPACT = { faible: 'Faible', moyen: 'Moyen', fort: 'Fort' };

function tierImpact(impact) {
  const s = SUFFIXE_IMPACT[impact];
  return {
    pRetournement: config.get('retournement' + s),
    pFausseAlerte: config.get('fausseAlerte' + s),
    saut: [config.get(`saut${s}Min`), config.get(`saut${s}Max`)],
  };
}

function nouvelEvenement(m3, quand) {
  const indices = Object.keys(PROFILS);
  const impact = tirerPondere([
    ['faible', config.get('poidsImpactFaible')],
    ['moyen', config.get('poidsImpactMoyen')],
    ['fort', config.get('poidsImpactFort')],
  ]);
  const fMin = config.get('fenetreResolutionMin');
  const fMax = config.get('fenetreResolutionMax');
  return {
    titre: `${tirerSansRepetition('sujets', m3.recents)} ` +
           `${tirerSansRepetition('verbes', m3.recents)} ` +
           `${tirerSansRepetition('complements', m3.recents)}`,
    indice: indices[Math.floor(Math.random() * 3)],
    direction: Math.random() < 0.5 ? 1 : -1,
    impact,
    resolutionTs: Math.round(quand + (fMin + Math.random() * (fMax - fMin)) * 1000),
  };
}

/* ------------------------------------------------ initialisation */

function initIndice(maintenant) {
  return {
    prix: 100, mm: 100, parts: 0, prixMoyen: 0,
    regime: { dir: 0, finTs: maintenant },
    agite: false, agiteFinTs: maintenant,
    histo: [[maintenant, 100]], dernierEch: maintenant,
  };
}

function initCanal(maintenant) {
  return { val: 1, cible: 1, cibleTs: maintenant };
}

export function initM3(maintenant) {
  const m3 = {
    liquidites: config.get('capitalDepart'),
    capitalGains: 0,
    indices: {
      stable: initIndice(maintenant),
      modere: initIndice(maintenant),
      volatil: initIndice(maintenant),
    },
    tauxIntensite: initCanal(maintenant),
    tauxDuree: initCanal(maintenant),
    boosts: [],
    evenements: [],
    historiqueEvenements: [],
    recents: { sujets: [], verbes: [], complements: [] },
  };
  while (m3.evenements.length < config.get('nbEcheances')) {
    m3.evenements.push(nouvelEvenement(m3, maintenant));
  }
  return m3;
}

/* ------------------------------------------------ simulation */

function stepIndice(ind, cle, dt, simNow) {
  const profil = profilDyn(cle);
  const dtH = dt / 3600;
  if (simNow >= ind.regime.finTs) {
    const dir = tirerPondere([
      [-1, config.get('poidsRegimeBaissier')],
      [0, config.get('poidsRegimeStable')],
      [1, config.get('poidsRegimeHaussier')],
    ]);
    const dMin = config.get('dureeRegimeIndiceMin');
    const dMax = config.get('dureeRegimeIndiceMax');
    ind.regime = { dir, finTs: simNow + (dMin + Math.random() * (dMax - dMin)) * 1000 };
  }
  if (simNow >= ind.agiteFinTs) {
    ind.agite = !ind.agite;
    const [dMin, dMax] = ind.agite
      ? [config.get('dureeAgiteMin'), config.get('dureeAgiteMax')]
      : [config.get('dureeCalmeMin'), config.get('dureeCalmeMax')];
    ind.agiteFinTs = simNow + (dMin + Math.random() * (dMax - dMin)) * 1000;
  }
  const sigma = profil.volH * (ind.agite ? profil.facteurAgite : 1);
  let facteur = 1 + profil.deriveH * ind.regime.dir * dtH
                + sigma * gauss() * Math.sqrt(dtH);
  if (Math.random() < profil.probaChoc * dt) {
    facteur *= 1 + (Math.random() < 0.5 ? -1 : 1) * profil.ampChoc * (0.5 + Math.random());
  }
  const plancher = config.get('prixPlancherM3');
  ind.prix = Math.max(plancher, ind.prix * facteur);
  // mean reversion légère vers la moyenne mobile
  ind.prix += (ind.mm - ind.prix) * Math.min(1, config.get('meanReversionHoraire') * dtH);
  ind.mm += (ind.prix - ind.mm) * Math.min(1, dt / config.get('periodeMoyenneMobile'));
  if (simNow - ind.dernierEch >= config.get('echantillonnageIndices') * 1000) {
    ind.histo.push([simNow, Number(ind.prix.toFixed(3))]);
    ind.dernierEch = simNow;
    const plafond = config.get('maxPointsIndices');
    if (ind.histo.length > plafond) ind.histo.splice(0, ind.histo.length - plafond);
  }
}

function stepCanal(canal, dt, simNow, min, max) {
  const tau = config.get('vitesseDeriveTauxConversion');
  if (simNow >= canal.cibleTs) {
    canal.cible = min + Math.random() * (max - min);
    canal.cibleTs = simNow + tau * (0.5 + Math.random()) * 1000;
  }
  canal.val += (canal.cible - canal.val) * Math.min(1, dt / tau)
               + gauss() * 0.004 * Math.sqrt(dt);
  canal.val = Math.max(min, Math.min(max, canal.val));
}

export function stepM3(m3, dt, simNow) {
  if (!m3 || m3.stub || !m3.indices) return;
  const dtJour = dt / 86400;

  for (const [cle, ind] of Object.entries(m3.indices)) {
    stepIndice(ind, cle, dt, simNow);
  }

  // filet de sécurité passif + dividendes du Stable (→ Capital de gains)
  m3.liquidites += config.get('allocationSecoursJournaliere') * dtJour;
  const stable = m3.indices.stable;
  if (stable.parts > 0) {
    m3.capitalGains += stable.parts * stable.prix
                       * config.get('tauxDividendeIndiceStable') * dtJour;
  }

  // taux de conversion des deux canaux
  stepCanal(m3.tauxIntensite, dt, simNow,
    config.get('amplitudeTauxIntensiteMin'), config.get('amplitudeTauxIntensiteMax'));
  stepCanal(m3.tauxDuree, dt, simNow,
    config.get('amplitudeTauxDureeMin'), config.get('amplitudeTauxDureeMax'));

  // expiration des instances de boost
  m3.boosts = m3.boosts.filter(b => b.finTs > simNow);

  // résolution des échéances passées + regarnissage du calendrier
  for (const ev of [...m3.evenements]) {
    if (simNow < ev.resolutionTs) continue;
    m3.evenements.splice(m3.evenements.indexOf(ev), 1);
    const tier = tierImpact(ev.impact);
    const r = Math.random();
    let effet;
    if (r < tier.pFausseAlerte) {
      effet = 'sans effet';
    } else {
      const dir = (r < tier.pFausseAlerte + tier.pRetournement) ? -ev.direction : ev.direction;
      const [a, b] = tier.saut;
      const saut = (a + Math.random() * (b - a)) * dir;
      const ind = m3.indices[ev.indice];
      ind.prix = Math.max(config.get('prixPlancherM3'), ind.prix * (1 + saut));
      const pMin = config.get('dureeRegimePostEvenementMin');
      const pMax = config.get('dureeRegimePostEvenementMax');
      ind.regime = { dir, finTs: simNow + (pMin + Math.random() * (pMax - pMin)) * 1000 };
      effet = `${saut > 0 ? '+' : ''}${(saut * 100).toFixed(1)}%`
              + (dir !== ev.direction ? ' (retournement !)' : '');
    }
    m3.historiqueEvenements.unshift({
      titre: ev.titre, indice: ev.indice, impact: ev.impact,
      direction: ev.direction, effet, ts: ev.resolutionTs,
    });
    if (m3.historiqueEvenements.length > 10) m3.historiqueEvenements.pop();
  }
  while (m3.evenements.length < config.get('nbEcheances')) {
    m3.evenements.push(nouvelEvenement(m3, simNow));
  }
}

export function boostM3(m3) {
  if (!m3 || m3.stub || !m3.boosts) return 1;
  const maintenant = Date.now();
  return 1 + m3.boosts.reduce((somme, b) =>
    b.finTs > maintenant ? somme + b.intensite : somme, 0);
}

/* ------------------------------------------------ actions du joueur */

// Achète pour `montant` de liquidités sur un indice. Retourne les parts
// acquises ou null si invalide.
export function acheterM3(m3, cle, montant) {
  if (!Number.isFinite(montant) || montant <= 0 || montant > m3.liquidites) return null;
  const ind = m3.indices[cle];
  const net = montant * (1 - config.get('tauxCommission'));
  const qte = net / ind.prix;
  ind.prixMoyen = ind.parts + qte > 0
    ? (ind.parts * ind.prixMoyen + qte * ind.prix) / (ind.parts + qte) : 0;
  ind.parts += qte;
  m3.liquidites -= montant;
  return qte;
}

// Vend `qte` parts. Le produit net revient aux liquidités ; le gain latent
// réalisé (s'il est positif) alimente EN PLUS le Capital de gains.
export function vendreM3(m3, cle, qte) {
  const ind = m3.indices[cle];
  if (!Number.isFinite(qte) || qte <= 0 || qte > ind.parts + 1e-9) return null;
  qte = Math.min(qte, ind.parts);
  const brut = qte * ind.prix;
  const produit = brut * (1 - config.get('tauxCommission'));
  const gain = (ind.prix - ind.prixMoyen) * qte;
  m3.liquidites += produit;
  if (gain > 0) m3.capitalGains += gain;
  ind.parts -= qte;
  if (ind.parts < 1e-9) { ind.parts = 0; ind.prixMoyen = 0; }
  return { produit, gain: Math.max(0, gain) };
}

// Convertit `montant` de Capital de gains en une instance de boost.
// `repartition` = part allouée à l'Intensité (0..1), le reste à la Durée.
export function convertirM3(m3, montant, repartition) {
  if (!Number.isFinite(montant) || montant <= 0 || montant > m3.capitalGains) return null;
  const intensite = montant * repartition * m3.tauxIntensite.val
                    * config.get('echelleIntensiteM3');
  const dureeS = montant * (1 - repartition) * m3.tauxDuree.val
                 * config.get('echelleDureeM3');
  if (intensite <= 0 || dureeS < config.get('dureeMinConversionM3')) return null;
  m3.capitalGains -= montant;
  m3.boosts.push({ intensite, finTs: Date.now() + dureeS * 1000 });
  return { intensite, dureeS };
}

export function apercuConversion(m3, montant, repartition) {
  return {
    intensite: montant * repartition * m3.tauxIntensite.val
               * config.get('echelleIntensiteM3'),
    dureeS: montant * (1 - repartition) * m3.tauxDuree.val
            * config.get('echelleDureeM3'),
  };
}

// Texte de fenêtre floue pour une échéance ("dans 2 à 5h" etc.).
export function fenetreFloue(ev, maintenant) {
  const h = (ev.resolutionTs - maintenant) / 3600_000;
  if (h <= 0) return 'imminent';
  if (h < 1) return `dans moins d'1h`;
  const bas = Math.max(1, Math.floor(h - 0.8));
  const haut = Math.ceil(h + 0.8);
  return `dans ${bas} à ${haut}h`;
}
