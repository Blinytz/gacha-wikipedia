// Écran Station de Recherche : vitesse totale, 3 onglets (un par module).
// Rendu complet à l'ouverture + rafraîchissement léger à chaque tick (les
// curseurs ne sont jamais re-rendus pendant qu'on les manipule).

import { etat, sauvegarder } from './etat.js';
import { boosts, vitesseTotale, initStation } from './station.js';
import { signalAffiche, annonceFenetre } from './station-m1.js';
import { config } from './config.js';

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
  conteneur.innerHTML = `<div class="carte-panneau">
    <h2>Chaîne Collecte / Traitement / Raffinage</h2>
    <p class="texte-doux">🏭 En construction — étape 9.</p></div>`;
}

function rendreM3(conteneur) {
  conteneur.innerHTML = `<div class="carte-panneau">
    <h2>Marché à 3 indices</h2>
    <p class="texte-doux">📈 En construction — étape 10.</p></div>`;
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
}
