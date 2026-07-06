// Écran Collection — construit à l'étape 5. Stub étape 4.

import { donnees } from './donnees.js';

export function rendreEcranCollection(section) {
  section.innerHTML = `
    <div class="carte-panneau">
      <h2>Collection</h2>
      <p class="texte-doux">${donnees.collections.length} collections chargées,
      ${donnees.pool.length} cartes. Les grilles arrivent à l'étape 5.</p>
    </div>`;
}
