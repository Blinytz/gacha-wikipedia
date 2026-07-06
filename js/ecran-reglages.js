// Écran Réglages — étape 4 : export/import JSON, préférences, paramètres de
// test. L'UI complète de tous les paramètres (avec aides) arrive en phase D.

import { etat, exporterJSON, importerJSON, reinitialiserTout, sauvegarder } from './etat.js';
import { config, DEFAUTS } from './config.js';
import { donnees } from './donnees.js';
import { esc, confirmer } from './ui.js';

// Paramètres exposés dès maintenant (utile pour tester sans attendre 24h).
const PARAMS_VISIBLES = ['dureeBaseSecondes', 'tailleDuPaquet'];

export function rendreEcranReglages(section) {
  const avertissement = donnees.provisoire
    ? `<div class="bandeau-alerte">⚠️ Données de cartes PROVISOIRES (raretés/PV
       aléatoires) — les définitives arrivent avec l'étape 2.</div>` : '';

  section.innerHTML = `
    ${avertissement}
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
