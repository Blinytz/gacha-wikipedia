// Écran Éclats dédié : compteur, taux en direct, courbe (fenêtre au choix),
// consommation manuelle. Accessible par l'onglet ◆ et la pastille de l'entête.

import { etat } from './etat.js';
import { config } from './config.js';
import { tauxActuel, svgHistorique, consommerEclats } from './eclats.js';
import { formaterNombre, confirmer } from './ui.js';

const FENETRES = [3, 6, 12, 24, 48];   // heures proposées pour la courbe
let fenetreChoisie = null;             // null = valeur de la config

function fenetre() {
  return fenetreChoisie ?? config.get('fenetreGraphiqueEclats');
}

export function rendreEcranEclats(section) {
  section.innerHTML = `
    <div class="carte-panneau">
      <h2>Éclats</h2>
      <div class="ligne-eclats">
        <div class="total-eclats"><span class="gemme">◆</span>
          <b id="ecl-total">${formaterNombre(etat.eclats)}</b></div>
        <div class="taux-eclats">taux <b id="ecl-taux">×${tauxActuel().toFixed(2)}</b></div>
      </div>
      <div id="ecl-graphe">${svgHistorique(fenetre())}</div>
      <div class="rangee-boutons choix-fenetre">
        ${FENETRES.map(h => `<button class="btn btn-discret ${h === fenetre() ? 'actif-fenetre' : ''}"
          data-fenetre="${h}">${h}h</button>`).join('')}
      </div>
      <p class="texte-doux">Régime haut : vendre — régime bas : attendre. Le taux
      évolue toutes les ${config.get('frequenceRafraichissementTauxEclats')} s,
      même app fermée (rattrapage au retour).</p>
    </div>

    <div class="carte-panneau">
      <h2>Consommer des Éclats</h2>
      <div class="rangee-boutons">
        <input type="number" id="ecl-conso" min="1" step="1"
               placeholder="Quantité…" class="champ-conso">
        <button id="ecl-btn-consommer" class="btn">Consommer</button>
      </div>
      <p class="texte-doux">Simple décompte manuel — la conversion en valeur
      réelle reste à ta discrétion, hors de l'app.</p>
    </div>`;

  for (const btn of section.querySelectorAll('[data-fenetre]')) {
    btn.addEventListener('click', () => {
      fenetreChoisie = Number(btn.dataset.fenetre);
      rendreEcranEclats(section);
    });
  }
  section.querySelector('#ecl-btn-consommer').addEventListener('click', () => {
    const champ = section.querySelector('#ecl-conso');
    const montant = Math.floor(Number(champ.value));
    if (!Number.isFinite(montant) || montant <= 0) { alert('Quantité invalide.'); return; }
    if (montant > etat.eclats) { alert(`Tu n'as que ${formaterNombre(etat.eclats)} Éclats.`); return; }
    if (!confirmer(`Consommer ${formaterNombre(montant)} Éclats ? (simple décompte, irréversible)`)) return;
    consommerEclats(montant);
    champ.value = '';
    document.dispatchEvent(new CustomEvent('gacha:eclats-changes'));
    majEclatsUI(section);
  });
}

// Rafraîchissement léger appelé au tick quand l'écran est visible.
export function majEclatsUI(section) {
  const total = section.querySelector('#ecl-total');
  if (!total) return;
  total.textContent = formaterNombre(etat.eclats);
  section.querySelector('#ecl-taux').textContent = `×${tauxActuel().toFixed(2)}`;
  section.querySelector('#ecl-graphe').innerHTML = svgHistorique(fenetre());
}
