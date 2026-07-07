// Écran Station de Recherche : vitesse totale, 3 onglets (un par module).
// Rendu complet à l'ouverture + rafraîchissement léger à chaque tick (les
// curseurs ne sont jamais re-rendus pendant qu'on les manipule).

import { etat, sauvegarder } from './etat.js';
import { boosts, vitesseTotale, initStation } from './station.js';
import { signalAffiche, annonceFenetre } from './station-m1.js';
import { reglerCurseurM2, quantiteEnFile, tensionRegime,
         prochainePeremption } from './station-m2.js';
import { PROFILS, acheterM3, vendreM3, convertirM3, apercuConversion,
         fenetreFloue } from './station-m3.js';
import { formaterDuree, formaterNombre, esc } from './ui.js';
import { config } from './config.js';

const NOMS_REGIME_FLUX = { faible: 'Faible', modere: 'Modéré', fort: 'Fort' };

let ongletActif = 'm1';

export function rendreEcranStation(section, options = {}) {
  initStation();
  if (options.onglet) ongletActif = options.onglet;
  const b = boosts();

  section.innerHTML = `
    <div class="carte-panneau entete-station">
      <div class="vitesse-totale">Vitesse de recherche
        <b id="st-vitesse">×${vitesseTotale().toFixed(2)}</b></div>
      <div class="boosts-modules">
        <button class="chip-module ${ongletActif === 'm1' ? 'actif' : ''}" data-onglet="m1">
          Calibrage <b id="st-b1">×${b.m1.toFixed(2)}</b></button>
        <button class="chip-module ${ongletActif === 'm2' ? 'actif' : ''}" data-onglet="m2">
          Chaîne <b id="st-b2">×${b.m2.toFixed(2)}</b></button>
        <button class="chip-module ${ongletActif === 'm3' ? 'actif' : ''}" data-onglet="m3">
          Marché <b id="st-b3">×${b.m3.toFixed(2)}</b></button>
      </div>
    </div>
    <div id="module-conteneur"></div>`;

  for (const btn of section.querySelectorAll('.chip-module')) {
    btn.addEventListener('click', () =>
      rendreEcranStation(section, { onglet: btn.dataset.onglet }));
  }

  const conteneur = section.querySelector('#module-conteneur');
  if (ongletActif === 'm1') rendreM1(conteneur);
  else if (ongletActif === 'm2') rendreM2(conteneur);
  else rendreM3(conteneur);
}

/* ---------------- Module 1 — Calibrage 3D ---------------- */

function rendreM1(conteneur) {
  const m1 = etat.station.m1;
  const eMax = config.get('energieMax');
  conteneur.innerHTML = `
    <div class="carte-panneau">
      <h2>Calibrage 3D</h2>
      <p class="annonce-fenetre" id="m1-fenetre">${annonceFenetre(m1, Date.now())}</p>

      <div class="bloc-signal">
        <div class="libelle-jauge">Signal de proximité <small>(bruité, temps réel)</small></div>
        <div class="jauge-signal"><div id="m1-signal" style="width:${signalAffiche(m1).toFixed(1)}%"></div></div>
        <div class="ligne-boost-m1">Boost mesuré
          <b id="m1-boost">×${m1.boostAffiche.toFixed(2)}</b>
          <small>(sonde rafraîchie toutes les ${config.get('frequenceRafraichissementBoost')} s)</small>
        </div>
      </div>

      ${['x', 'y', 'z'].map(axe => `
        <label class="ligne-curseur">
          <span class="nom-curseur">Axe ${axe.toUpperCase()}</span>
          <input type="range" min="0" max="100" step="0.5" data-axe="${axe}"
                 value="${m1.curseurs[axe]}">
          <span class="valeur-curseur" id="m1-val-${axe}">${Math.round(m1.curseurs[axe])}</span>
        </label>`).join('')}
    </div>

    <div class="carte-panneau">
      <h2>Énergie</h2>
      <div class="libelle-jauge">Réserve
        <span id="m1-energie-txt">${Math.round(m1.energie)} / ${eMax}</span></div>
      <div class="jauge-energie"><div id="m1-energie" style="width:${100 * m1.energie / eMax}%"></div></div>
      <label class="ligne-curseur curseur-energie">
        <span class="nom-curseur">⚡</span>
        <input type="range" min="-100" max="100" step="1" id="m1-curseur-energie"
               value="${m1.curseurEnergie}">
        <span class="valeur-curseur" id="m1-val-energie">${m1.curseurEnergie}%</span>
      </label>
      <p class="texte-doux">-100 % = génération pure (recharge la réserve) ·
      +100 % = consommation pure. Dépenser de l'énergie PRÈS de la cible
      amplifie fortement le boost ; loin d'elle, ça ne produit presque rien.</p>
    </div>`;

  for (const input of conteneur.querySelectorAll('input[data-axe]')) {
    input.addEventListener('input', () => {
      const axe = input.dataset.axe;
      etat.station.m1.curseurs[axe] = Number(input.value);
      conteneur.querySelector(`#m1-val-${axe}`).textContent = Math.round(input.value);
      sauvegarder();
    });
  }
  const ce = conteneur.querySelector('#m1-curseur-energie');
  ce.addEventListener('input', () => {
    etat.station.m1.curseurEnergie = Number(ce.value);
    conteneur.querySelector('#m1-val-energie').textContent = `${ce.value}%`;
    sauvegarder();
  });
}

/* ---------------- Modules 2 et 3 (étapes 9 et 10) ---------------- */

function rendreM2(conteneur) {
  const m2 = etat.station.m2;
  const capFile = config.get('capaciteMaxFileAttente');
  const capStock = config.get('capaciteMaxStockTraite');
  const enFile = quantiteEnFile(m2);

  conteneur.innerHTML = `
    <div class="carte-panneau">
      <h2>Chaîne de production</h2>
      <div class="ligne-regime-flux">
        <span>Flux entrant : <b id="m2-regime">${NOMS_REGIME_FLUX[m2.regime.type]}</b>
          <small id="m2-flux">(${(m2.fluxActuel * 60).toFixed(1)} u/min)</small></span>
      </div>
      <div class="libelle-jauge">Tension du régime
        <small>(un changement approche quand elle monte)</small></div>
      <div class="jauge-tension"><div id="m2-tension"
        style="width:${(tensionRegime(m2, Date.now()) * 100).toFixed(0)}%"></div></div>

      ${['collecte', 'traitement', 'raffinage'].map(nom => `
        <label class="ligne-curseur">
          <span class="nom-curseur">${nom[0].toUpperCase() + nom.slice(1)}</span>
          <input type="range" min="0" max="100" step="1" data-curseur-m2="${nom}"
                 value="${m2.curseurs[nom]}">
          <span class="valeur-curseur" id="m2-val-${nom}">${m2.curseurs[nom]}%</span>
        </label>`).join('')}
      <p class="texte-doux">Budget partagé : monter un curseur prend au suivant
      du cycle (Collecte → Traitement → Raffinage → Collecte).</p>
    </div>

    <div class="carte-panneau">
      <h2>Matière</h2>
      <div class="libelle-jauge">File d'attente (périssable)
        <span><span id="m2-file">${Math.round(enFile)}</span> / ${capFile}</span></div>
      <div class="jauge-file"><div id="m2-jauge-file" style="width:${100 * enFile / capFile}%"></div></div>
      <p class="texte-doux" id="m2-peremption">${textePeremption(m2)}</p>
      <div class="libelle-jauge">Stock traité (impérissable)
        <span><span id="m2-stock">${Math.round(m2.stock)}</span> / ${capStock}</span></div>
      <div class="jauge-stock"><div id="m2-jauge-stock" style="width:${100 * m2.stock / capStock}%"></div></div>
      <p class="texte-doux">Boost actuel : <b id="m2-boost">×${boosts().m2.toFixed(2)}</b>
      — le Raffinage consomme le stock ; à sec, le boost retombe à ×1 net.</p>
    </div>`;

  for (const input of conteneur.querySelectorAll('input[data-curseur-m2]')) {
    input.addEventListener('input', () => {
      reglerCurseurM2(m2, input.dataset.curseurM2, Number(input.value));
      for (const nom of ['collecte', 'traitement', 'raffinage']) {
        const el = conteneur.querySelector(`input[data-curseur-m2="${nom}"]`);
        if (el !== input) el.value = m2.curseurs[nom];
        conteneur.querySelector(`#m2-val-${nom}`).textContent = `${m2.curseurs[nom]}%`;
      }
      sauvegarder();
    });
  }
}

function textePeremption(m2) {
  const s = prochainePeremption(m2, Date.now());
  return s === null ? 'File vide — rien à périmer.'
    : `Prochain lot périmé dans ${formaterDuree(s)} s'il n'est pas traité.`;
}

function graphIndice(ind, heures = 6, largeur = 320, hauteur = 74) {
  const depuis = Date.now() - heures * 3600_000;
  const pts = ind.histo.filter(([t]) => t >= depuis);
  pts.push([Date.now(), ind.prix]);
  if (pts.length < 2) return '<svg class="graphe-indice"></svg>';
  const vals = pts.map(p => p[1]).concat(ind.mm);
  const vMin = Math.min(...vals) * 0.995, vMax = Math.max(...vals) * 1.005;
  const t0 = pts[0][0], t1 = pts[pts.length - 1][0];
  const x = t => 2 + (largeur - 4) * (t - t0) / Math.max(1, t1 - t0);
  const y = v => hauteur - 4 - (hauteur - 8) * (v - vMin) / Math.max(1e-9, vMax - vMin);
  const ligne = pts.map(([t, v]) => `${x(t).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const yMM = y(ind.mm).toFixed(1);
  return `<svg viewBox="0 0 ${largeur} ${hauteur}" class="graphe-indice" preserveAspectRatio="none">
    <line x1="0" x2="${largeur}" y1="${yMM}" y2="${yMM}" class="ligne-mm"/>
    <polyline points="${ligne}" class="courbe-indice"/>
  </svg>`;
}

function rendreM3(conteneur) {
  const m3 = etat.station.m3;

  const blocsIndices = Object.entries(PROFILS).map(([cle, profil]) => {
    const ind = m3.indices[cle];
    const pl = ind.parts > 0
      ? ` · latent <b class="${ind.prix >= ind.prixMoyen ? 'gain' : 'perte'}">
          ${((ind.prix / ind.prixMoyen - 1) * 100).toFixed(1)}%</b>` : '';
    return `
    <div class="carte-panneau panneau-indice">
      <div class="entete-indice">
        <h3>${profil.nom}${profil.dividende ? ' <small>💰 dividendes</small>' : ''}</h3>
        <b id="m3-prix-${cle}">${ind.prix.toFixed(2)}</b>
      </div>
      <div id="m3-graphe-${cle}">${graphIndice(ind)}</div>
      <div class="ligne-portefeuille" id="m3-pf-${cle}">
        Parts : <b>${ind.parts.toFixed(2)}</b>
        ${ind.parts > 0 ? ` · PM ${ind.prixMoyen.toFixed(2)}${pl}` : ''}
      </div>
      <div class="rangee-trading">
        <input type="number" min="1" max="100" step="1" value="50"
               id="m3-pct-${cle}" class="champ-pct" inputmode="numeric">
        <span class="pct-symbole">%</span>
        <button class="btn btn-mini" data-achat="${cle}">Acheter</button>
        <button class="btn btn-mini" data-vente="${cle}">Vendre</button>
      </div>
    </div>`;
  }).join('');

  const echeances = m3.evenements
    .slice().sort((a, b) => a.resolutionTs - b.resolutionTs)
    .map(ev => `
      <li><b>${esc(ev.titre)}</b><br>
        <span class="detail-echeance">${PROFILS[ev.indice].nom} ·
        ${ev.direction > 0 ? '📈 hausse' : '📉 baisse'} probable ·
        impact ${ev.impact} · <i id="m3-ech-${ev.resolutionTs}">${fenetreFloue(ev, Date.now())}</i></span></li>`)
    .join('');

  const historique = m3.historiqueEvenements.slice(0, 4).map(h => `
    <li class="ligne-histo">${esc(h.titre)} — ${PROFILS[h.indice].nom} :
      <b>${esc(h.effet)}</b></li>`).join('');

  conteneur.innerHTML = `
    <div class="carte-panneau">
      <h2>Portefeuille</h2>
      <div class="ligne-eclats">
        <div>Liquidités <b id="m3-liquidites">${m3.liquidites.toFixed(1)}</b></div>
        <div>Capital de gains <b id="m3-gains" class="gain">${m3.capitalGains.toFixed(1)}</b></div>
      </div>
      <p class="texte-doux">Commission ${(config.get('tauxCommission') * 100).toFixed(2)} %
      par transaction · +${config.get('allocationSecoursJournaliere')}/jour de filet de sécurité.
      Le % s'applique aux liquidités (achat) ou aux parts (vente).</p>
    </div>

    ${blocsIndices}

    <div class="carte-panneau">
      <h2>Conversion en boost</h2>
      <p class="texte-doux">Taux du moment — Intensité :
        <b id="m3-taux-int">×${m3.tauxIntensite.val.toFixed(2)}</b> ·
        Durée : <b id="m3-taux-dur">×${m3.tauxDuree.val.toFixed(2)}</b>
        (ils dérivent chacun de leur côté : guette les bons créneaux)</p>
      <label class="ligne-curseur">
        <span class="nom-curseur">Capital</span>
        <input type="number" min="1" step="1" id="m3-montant" class="champ-pct large"
               placeholder="montant">
      </label>
      <label class="ligne-curseur">
        <span class="nom-curseur">⚖️</span>
        <input type="range" min="5" max="95" step="5" value="50" id="m3-repartition">
        <span class="valeur-curseur" id="m3-rep-txt">50/50</span>
      </label>
      <p class="texte-doux" id="m3-apercu">—</p>
      <button class="btn btn-primaire" id="m3-convertir">Convertir</button>
      <ul class="liste-boosts" id="m3-boosts">${htmlBoostsActifs(m3)}</ul>
    </div>

    <div class="carte-panneau">
      <h2>Calendrier</h2>
      <ul class="liste-echeances">${echeances}</ul>
      ${historique ? `<h3 class="titre-histo">Dernières résolutions</h3>
        <ul class="liste-echeances">${historique}</ul>` : ''}
    </div>`;

  // --- trading
  for (const btn of conteneur.querySelectorAll('[data-achat]')) {
    btn.addEventListener('click', () => {
      const cle = btn.dataset.achat;
      const pct = Number(conteneur.querySelector(`#m3-pct-${cle}`).value) / 100;
      const montant = m3.liquidites * Math.min(1, Math.max(0, pct));
      if (acheterM3(m3, cle, montant) === null) { alert('Montant invalide.'); return; }
      sauvegarder();
      rendreM3(conteneur);
    });
  }
  for (const btn of conteneur.querySelectorAll('[data-vente]')) {
    btn.addEventListener('click', () => {
      const cle = btn.dataset.vente;
      const pct = Number(conteneur.querySelector(`#m3-pct-${cle}`).value) / 100;
      const qte = m3.indices[cle].parts * Math.min(1, Math.max(0, pct));
      const res = vendreM3(m3, cle, qte);
      if (res === null) { alert('Aucune part à vendre.'); return; }
      sauvegarder();
      rendreM3(conteneur);
    });
  }

  // --- conversion
  const majApercu = () => {
    const montant = Number(conteneur.querySelector('#m3-montant').value);
    const rep = Number(conteneur.querySelector('#m3-repartition').value) / 100;
    conteneur.querySelector('#m3-rep-txt').textContent =
      `${Math.round(rep * 100)}/${Math.round((1 - rep) * 100)}`;
    if (!Number.isFinite(montant) || montant <= 0) {
      conteneur.querySelector('#m3-apercu').textContent = '—'; return;
    }
    const a = apercuConversion(m3, montant, rep);
    conteneur.querySelector('#m3-apercu').textContent =
      `→ +${a.intensite.toFixed(2)} d'intensité pendant ${formaterDuree(a.dureeS)}`;
  };
  conteneur.querySelector('#m3-montant').addEventListener('input', majApercu);
  conteneur.querySelector('#m3-repartition').addEventListener('input', majApercu);
  conteneur.querySelector('#m3-convertir').addEventListener('click', () => {
    const montant = Number(conteneur.querySelector('#m3-montant').value);
    const rep = Number(conteneur.querySelector('#m3-repartition').value) / 100;
    const res = convertirM3(m3, montant, rep);
    if (res === null) {
      alert('Conversion impossible : vérifie le montant (≤ Capital de gains) et une durée ≥ 30 s.');
      return;
    }
    sauvegarder();
    rendreM3(conteneur);
  });
}

function htmlBoostsActifs(m3) {
  const maintenant = Date.now();
  const actifs = m3.boosts.filter(b => b.finTs > maintenant);
  if (!actifs.length) return '<li class="texte-doux">Aucune instance active.</li>';
  return actifs.map(b => `<li>+${b.intensite.toFixed(2)} —
    expire dans ${formaterDuree((b.finTs - maintenant) / 1000)}</li>`).join('');
}

/* ---------------- rafraîchissement léger (tick 1 s) ---------------- */

export function majStationUI(section) {
  if (!etat.station || !section.querySelector('#st-vitesse')) return;
  const b = boosts();
  section.querySelector('#st-vitesse').textContent = `×${vitesseTotale().toFixed(2)}`;
  section.querySelector('#st-b1').textContent = `×${b.m1.toFixed(2)}`;
  section.querySelector('#st-b2').textContent = `×${b.m2.toFixed(2)}`;
  section.querySelector('#st-b3').textContent = `×${b.m3.toFixed(2)}`;

  const m1 = etat.station.m1;
  const signal = section.querySelector('#m1-signal');
  if (signal) {
    signal.style.width = `${signalAffiche(m1).toFixed(1)}%`;
    section.querySelector('#m1-boost').textContent = `×${m1.boostAffiche.toFixed(2)}`;
    section.querySelector('#m1-fenetre').textContent = annonceFenetre(m1, Date.now());
    const eMax = config.get('energieMax');
    section.querySelector('#m1-energie').style.width = `${100 * m1.energie / eMax}%`;
    section.querySelector('#m1-energie-txt').textContent =
      `${Math.round(m1.energie)} / ${eMax}`;
  }

  const m2 = etat.station.m2;
  const jaugeFile = section.querySelector('#m2-jauge-file');
  if (jaugeFile && m2 && !m2.stub) {
    const capFile = config.get('capaciteMaxFileAttente');
    const capStock = config.get('capaciteMaxStockTraite');
    const enFile = quantiteEnFile(m2);
    section.querySelector('#m2-regime').textContent = NOMS_REGIME_FLUX[m2.regime.type];
    section.querySelector('#m2-flux').textContent = `(${(m2.fluxActuel * 60).toFixed(1)} u/min)`;
    section.querySelector('#m2-tension').style.width =
      `${(tensionRegime(m2, Date.now()) * 100).toFixed(0)}%`;
    section.querySelector('#m2-file').textContent = Math.round(enFile);
    jaugeFile.style.width = `${100 * enFile / capFile}%`;
    section.querySelector('#m2-peremption').textContent = textePeremption(m2);
    section.querySelector('#m2-stock').textContent = Math.round(m2.stock);
    section.querySelector('#m2-jauge-stock').style.width = `${100 * m2.stock / capStock}%`;
    section.querySelector('#m2-boost').textContent = `×${b.m2.toFixed(2)}`;
  }

  const m3 = etat.station.m3;
  if (m3 && !m3.stub && section.querySelector('#m3-liquidites')) {
    section.querySelector('#m3-liquidites').textContent = m3.liquidites.toFixed(1);
    section.querySelector('#m3-gains').textContent = m3.capitalGains.toFixed(1);
    section.querySelector('#m3-taux-int').textContent = `×${m3.tauxIntensite.val.toFixed(2)}`;
    section.querySelector('#m3-taux-dur').textContent = `×${m3.tauxDuree.val.toFixed(2)}`;
    for (const cle of Object.keys(m3.indices)) {
      const ind = m3.indices[cle];
      const prixEl = section.querySelector(`#m3-prix-${cle}`);
      if (prixEl) prixEl.textContent = ind.prix.toFixed(2);
      const g = section.querySelector(`#m3-graphe-${cle}`);
      if (g) g.innerHTML = graphIndice(ind);
    }
    for (const ev of m3.evenements) {
      const el = section.querySelector(`#m3-ech-${ev.resolutionTs}`);
      if (el) el.textContent = fenetreFloue(ev, Date.now());
    }
    section.querySelector('#m3-boosts').innerHTML = htmlBoostsActifs(m3);
  }
}
