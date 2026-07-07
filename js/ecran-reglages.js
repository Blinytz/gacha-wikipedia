// Écran Réglages — étape 4 : export/import JSON, préférences, paramètres de
// test. L'UI complète de tous les paramètres (avec aides) arrive en phase D.

import { etat, exporterJSON, importerJSON, reinitialiserTout, sauvegarder } from './etat.js';
import { config, DEFAUTS } from './config.js';
import { donnees } from './donnees.js';
import { esc, confirmer, formaterNombre } from './ui.js';
import { tauxActuel, svgHistorique, consommerEclats } from './eclats.js';

// Paramètres exposés dès maintenant (utile pour tester sans attendre 24h).
const PARAMS_VISIBLES = ['dureeBaseSecondes', 'tailleDuPaquet'];

export function rendreEcranReglages(section) {
  const avertissement = donnees.provisoire
    ? `<div class="bandeau-alerte">⚠️ Données de cartes PROVISOIRES (raretés/PV
       aléatoires) — les définitives arrivent avec l'étape 2.</div>` : '';

  section.innerHTML = `
    ${avertissement}
    <div class="carte-panneau">
      <h2>Éclats</h2>
      <div class="ligne-eclats">
        <div class="total-eclats"><span class="gemme">◆</span>
          <b id="regl-eclats-total">${formaterNombre(etat.eclats)}</b></div>
        <div class="taux-eclats">taux <b id="regl-taux">×${tauxActuel().toFixed(2)}</b></div>
      </div>
      <div id="regl-graphe">${svgHistorique(6)}</div>
      <p class="texte-doux">La courbe montre les 6 dernières heures : régime haut
      (vendre !), bas (attendre) ou neutre. Mise à jour toutes les 10 s, même
      pendant que l'app est fermée (rattrapage au retour).</p>
      <div class="rangee-boutons">
        <input type="number" id="conso-montant" min="1" step="1"
               placeholder="Quantité…" class="champ-conso">
        <button id="btn-consommer" class="btn">Consommer des Éclats</button>
      </div>
      <p class="texte-doux">La consommation retire simplement du compteur —
      la conversion en valeur réelle reste à ta discrétion, hors de l'app.</p>
    </div>

    <div class="carte-panneau">
      <h2>Sauvegarde</h2>
      <p class="texte-doux">L'état complet du jeu (cartes, Éclats, réglages) vit
      uniquement sur cet appareil. Exporte régulièrement !</p>
      <div class="rangee-boutons">
        <button id="btn-export" class="btn">📤 Exporter</button>
        <button id="btn-import" class="btn">📥 Importer</button>
        <input type="file" id="fichier-import" accept=".json,application/json" hidden>
      </div>
    </div>

    <div class="carte-panneau">
      <h2>Préférences</h2>
      <label class="ligne-pref">
        <input type="checkbox" id="pref-vides" ${etat.prefs.afficherVides ? 'checked' : ''}>
        Afficher les emplacements non obtenus dans les collections
      </label>
    </div>

    <div class="carte-panneau">
      <h2>Paramètres</h2>
      <p class="texte-doux">Réglages d'équilibrage (liste complète en phase D).</p>
      ${PARAMS_VISIBLES.map(cle => `
        <label class="ligne-param">
          <span class="nom-param">${cle}</span>
          <input type="number" data-param="${cle}" value="${config.get(cle)}" step="any">
          <span class="aide-param">${esc(DEFAUTS[cle].aide)}</span>
        </label>`).join('')}
      <button id="btn-reset-params" class="btn btn-discret">Réinitialiser ces paramètres</button>
    </div>

    <div class="carte-panneau zone-danger">
      <h2>Zone dangereuse</h2>
      <button id="btn-reset-tout" class="btn btn-danger">🗑️ Tout réinitialiser</button>
    </div>`;

  section.querySelector('#btn-consommer').addEventListener('click', () => {
    const champ = section.querySelector('#conso-montant');
    const montant = Math.floor(Number(champ.value));
    if (!Number.isFinite(montant) || montant <= 0) { alert('Quantité invalide.'); return; }
    if (montant > etat.eclats) { alert(`Tu n'as que ${formaterNombre(etat.eclats)} Éclats.`); return; }
    if (!confirmer(`Consommer ${formaterNombre(montant)} Éclats ? (simple décompte, irréversible)`)) return;
    consommerEclats(montant);
    champ.value = '';
    document.dispatchEvent(new CustomEvent('gacha:eclats-changes'));
    majEclatsUI(section);
  });

  section.querySelector('#btn-export').addEventListener('click', () => {
    const blob = new Blob([exporterJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `gacha-wikipedia-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });

  const fichier = section.querySelector('#fichier-import');
  section.querySelector('#btn-import').addEventListener('click', () => fichier.click());
  fichier.addEventListener('change', async () => {
    const f = fichier.files[0];
    if (!f) return;
    try {
      const texte = await f.text();
      JSON.parse(texte); // validation avant confirmation
      if (!confirmer('Remplacer TOUT l’état actuel par cette sauvegarde ?')) return;
      importerJSON(texte);
      location.reload();
    } catch (err) {
      alert(`Import impossible : ${err.message}`);
    }
    fichier.value = '';
  });

  section.querySelector('#pref-vides').addEventListener('change', (ev) => {
    etat.prefs.afficherVides = ev.target.checked;
    sauvegarder();
  });

  for (const input of section.querySelectorAll('input[data-param]')) {
    input.addEventListener('change', () => {
      const v = Number(input.value);
      if (Number.isFinite(v) && v > 0) config.set(input.dataset.param, v);
      else input.value = config.get(input.dataset.param);
    });
  }
  section.querySelector('#btn-reset-params').addEventListener('click', () => {
    config.reinitialiserSection('Tirage et paquets');
    rendreEcranReglages(section);
  });

  section.querySelector('#btn-reset-tout').addEventListener('click', () => {
    if (!confirmer('Vraiment tout effacer ? Cartes, Éclats, réglages — irréversible sans export.')) return;
    reinitialiserTout();
    location.reload();
  });
}

// Rafraîchissement léger (compteur, taux, courbe) appelé à chaque tick quand
// l'écran Réglages est visible — sans re-render complet (les champs restent
// éditables).
export function majEclatsUI(section) {
  const total = section.querySelector('#regl-eclats-total');
  if (!total) return;
  total.textContent = formaterNombre(etat.eclats);
  section.querySelector('#regl-taux').textContent = `×${tauxActuel().toFixed(2)}`;
  section.querySelector('#regl-graphe').innerHTML = svgHistorique(6);
}
