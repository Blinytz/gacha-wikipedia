// Écran Réglages — étape 4 : export/import JSON, préférences, paramètres de
// test. L'UI complète de tous les paramètres (avec aides) arrive en phase D.

import { etat, exporterJSON, importerJSON, reinitialiserTout, sauvegarder } from './etat.js';
import { config, DEFAUTS } from './config.js';
import { donnees } from './donnees.js';
import { esc, confirmer } from './ui.js';

function htmlSectionsParametres() {
  return Object.entries(config.sections()).map(([section, cles]) => {
    const nbSurcharges = cles.filter(c => config.estSurcharge(c)).length;
    const badge = nbSurcharges
      ? `<span class="badge-surcharge">${nbSurcharges} modifié${nbSurcharges > 1 ? 's' : ''}</span>` : '';
    return `
    <details class="section-params" data-section="${esc(section)}">
      <summary>${esc(section)} ${badge}</summary>
      ${cles.map(cle => {
        const def = DEFAUTS[cle];
        const surcharge = config.estSurcharge(cle);
        return `
        <label class="ligne-param ${surcharge ? 'surchargee' : ''}">
          <span class="nom-param">${cle}
            ${surcharge ? '<span class="puce-surcharge">●</span>' : ''}</span>
          <input type="number" data-param="${cle}" value="${config.get(cle)}"
                 step="any" inputmode="decimal">
          <span class="aide-param">${esc(def.aide)}
            <em class="rappel-defaut">défaut : ${def.valeur}</em></span>
        </label>`;
      }).join('')}
      <button class="btn btn-discret" data-reset-section="${esc(section)}">
        ↺ Réinitialiser « ${esc(section)} » aux valeurs par défaut</button>
    </details>`;
  }).join('');
}

export function rendreEcranReglages(section) {
  // Conserve les accordéons ouverts à travers les re-rendus.
  const ouvertes = new Set(
    [...section.querySelectorAll('details.section-params[open]')]
      .map(d => d.dataset.section));

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
      <p class="texte-doux">Tout l'équilibrage du jeu est réglable ici
      (${Object.keys(DEFAUTS).length} paramètres,
      <b id="nb-modifies">${Object.keys(DEFAUTS).filter(c => config.estSurcharge(c)).length}</b>
      modifié(s)). Un point violet ● signale une valeur modifiée. Les changements
      s'appliquent immédiatement (sauf mention ⚠️).</p>
      <input type="search" id="filtre-params" class="champ-conso champ-filtre"
             placeholder="🔍 Filtrer les paramètres (nom ou description)…">
      ${htmlSectionsParametres()}
      <button id="btn-reset-global" class="btn btn-danger btn-discret">
        ↺ Réinitialiser TOUS les paramètres aux valeurs par défaut</button>
    </div>

    <div class="carte-panneau zone-danger">
      <h2>Zone dangereuse</h2>
      <button id="btn-reset-tout" class="btn btn-danger">🗑️ Tout réinitialiser</button>
    </div>`;

  for (const d of section.querySelectorAll('details.section-params')) {
    if (ouvertes.has(d.dataset.section)) d.open = true;
  }

  // --- filtre des paramètres (nom + texte d'aide)
  const champFiltre = section.querySelector('#filtre-params');
  champFiltre.addEventListener('input', () => {
    const q = champFiltre.value.trim().toLowerCase();
    for (const det of section.querySelectorAll('details.section-params')) {
      let visibles = 0;
      for (const ligne of det.querySelectorAll('.ligne-param')) {
        const texte = ligne.textContent.toLowerCase();
        const ok = !q || texte.includes(q);
        ligne.style.display = ok ? '' : 'none';
        if (ok) visibles += 1;
      }
      det.style.display = visibles ? '' : 'none';
      if (q && visibles) det.open = true;
    }
  });

  section.querySelector('#btn-reset-global').addEventListener('click', () => {
    if (!confirmer('Réinitialiser TOUS les paramètres aux valeurs par défaut ? (les cartes, Éclats et progressions ne sont pas touchés)')) return;
    etat.configUtilisateur = {};
    sauvegarder();
    rendreEcranReglages(section);
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
      // ≥ 0 : les seuils/taux < 1 sont légitimes ; jamais de négatif ni NaN.
      if (Number.isFinite(v) && v >= 0) {
        config.set(input.dataset.param, v);
        rendreEcranReglages(section);   // rafraîchit puces et badges
      } else {
        input.value = config.get(input.dataset.param);
      }
    });
  }
  for (const btn of section.querySelectorAll('[data-reset-section]')) {
    btn.addEventListener('click', () => {
      if (!confirmer(`Réinitialiser tous les paramètres de « ${btn.dataset.resetSection} » ?`)) return;
      config.reinitialiserSection(btn.dataset.resetSection);
      rendreEcranReglages(section);
    });
  }

  section.querySelector('#btn-reset-tout').addEventListener('click', () => {
    if (!confirmer('Vraiment tout effacer ? Cartes, Éclats, réglages — irréversible sans export.')) return;
    reinitialiserTout();
    location.reload();
  });
}
