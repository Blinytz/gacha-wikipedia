// Écran Paquets — moteur complet à l'étape 6. Stub étape 4.

export function tickPaquets() {}

export function rendreEcranPaquets(section) {
  if (section.dataset.rendu) return;
  section.dataset.rendu = '1';
  section.innerHTML = `
    <div class="carte-panneau">
      <h2>Ouverture de paquets</h2>
      <p class="texte-doux">Le moteur de tirage arrive à l'étape 6.</p>
    </div>`;
}
