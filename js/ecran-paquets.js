// Écran Paquets : chargement en cours, file de paquets prêts, ouverture
// avec révélation carte par carte façon gacha.

import { etat } from './etat.js';
import { donnees } from './donnees.js';
import { formaterDuree, esc, NOMS_RARETE, htmlImageCarte } from './ui.js';
import { htmlCarte } from './carte.js';
import { initPaquets, rattraperPaquets, secondesRestantes, ouvrirPaquet,
         getVitesseTotale } from './paquets.js';

export function tickPaquets() {
  rattraperPaquets();
}

export function rendreEcranPaquets(section, options = {}) {
  initPaquets();
  const p = etat.paquets;
  const reste = secondesRestantes();
  const pct = Math.round(p.progression * 100);

  // Pendant le tick 1s, ne rafraîchir que les valeurs (pas de re-render DOM
  // complet, sinon les clics/animations seraient interrompus).
  if (options.tick && section.dataset.rendu === 'v6') {
    section.querySelector('#temps-restant').textContent = formaterDuree(reste);
    section.querySelector('#pct-paquet').textContent = `${pct}%`;
    const cercle = section.querySelector('#cercle-progres');
    cercle.style.strokeDashoffset = String(283 * (1 - p.progression));
    section.querySelector('#nb-prets').textContent = p.prets;
    section.querySelector('#btn-ouvrir').disabled = p.prets < 1;
    section.querySelector('#file-prets').classList.toggle('vide', p.prets === 0);
    return;
  }
  section.dataset.rendu = 'v6';

  section.innerHTML = `
    <div class="carte-panneau panneau-chargement">
      <h2>Prochain paquet</h2>
      <div class="zone-progres">
        <svg viewBox="0 0 100 100" class="anneau-progres">
          <circle cx="50" cy="50" r="45" class="anneau-fond"/>
          <circle cx="50" cy="50" r="45" class="anneau-valeur" id="cercle-progres"
                  style="stroke-dashoffset:${283 * (1 - p.progression)}"/>
        </svg>
        <div class="centre-progres">
          <div class="paquet-emoji">🎁</div>
          <div id="pct-paquet">${pct}%</div>
        </div>
      </div>
      <p class="texte-doux centre">
        Prêt dans <b id="temps-restant">${formaterDuree(reste)}</b><br>
        Vitesse de recherche : <b>×${getVitesseTotale().toFixed(2)}</b>
      </p>
    </div>

    <div class="carte-panneau" id="file-prets" ${p.prets === 0 ? 'class-vide' : ''}>
      <h2>File d'attente</h2>
      <p class="texte-doux"><b id="nb-prets">${p.prets}</b> paquet(s) prêt(s) à ouvrir</p>
      <button id="btn-ouvrir" class="btn btn-primaire btn-large"
              ${p.prets < 1 ? 'disabled' : ''}>✨ Ouvrir un paquet</button>
    </div>`;

  section.querySelector('#btn-ouvrir').addEventListener('click', () => {
    const tirage = ouvrirPaquet();
    if (tirage) lancerRevelation(tirage, () => rendreEcranPaquets(section, {}));
  });
}

/* ---------- révélation façon gacha ---------- */

function lancerRevelation(tirage, surFin) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay-ouverture';
  document.getElementById('overlays').append(overlay);
  let index = -1;   // -1 = paquet fermé, tap pour commencer

  const suivant = () => {
    index += 1;
    if (index >= tirage.length) return montrerBilan();
    const { carte, nouvelle } = tirage[index];
    const rarePlus = carte.rarete !== 'commune';
    overlay.innerHTML = `
      <div class="scene-ouverture ${rarePlus ? 'aura-' + carte.rarete : ''}">
        <div class="compteur-ouverture">${index + 1} / ${tirage.length}</div>
        ${nouvelle ? '<div class="badge-nouvelle">NOUVELLE !</div>' : ''}
        <div class="conteneur-revelation">${htmlCarte(carte, { dosVisible: true })}</div>
        <p class="astuce-carte">Touche la carte pour la révéler</p>
      </div>`;
    const el = overlay.querySelector('.carte-jeu');
    let revelee = false;
    overlay.querySelector('.scene-ouverture').addEventListener('click', (ev) => {
      if (ev.target.closest('a')) return;
      if (!revelee) {
        revelee = true;
        el.classList.remove('dos-visible');
        if (rarePlus) overlay.querySelector('.scene-ouverture').classList.add('flash');
      } else {
        suivant();
      }
    });
  };

  const montrerBilan = () => {
    const nbNouvelles = tirage.filter(t => t.nouvelle).length;
    overlay.innerHTML = `
      <div class="scene-ouverture bilan-ouverture">
        <h2>Paquet ouvert !</h2>
        <p class="texte-doux">${nbNouvelles} nouvelle(s) carte(s) sur ${tirage.length}</p>
        <div class="grille-bilan">
          ${tirage.map(({ carte, nouvelle }) => `
            <div class="mini-carte rarete-${carte.rarete}">
              ${htmlImageCarte(carte)}
              <span class="nom-mini">${esc(carte.nom)}</span>
              <span class="rarete-mini">${NOMS_RARETE[carte.rarete]}</span>
              ${nouvelle ? '<span class="pastille-nouvelle">★</span>' : ''}
            </div>`).join('')}
        </div>
        <button class="btn btn-primaire btn-large" id="btn-fin">Ranger dans la collection</button>
      </div>`;
    overlay.querySelector('#btn-fin').addEventListener('click', () => {
      overlay.remove();
      surFin();
    });
  };

  // écran d'entrée : le paquet à déchirer
  overlay.innerHTML = `
    <div class="scene-ouverture">
      <button class="paquet-a-ouvrir">🎁</button>
      <p class="astuce-carte">Touche le paquet pour l'ouvrir</p>
    </div>`;
  overlay.querySelector('.paquet-a-ouvrir').addEventListener('click', suivant);
}
