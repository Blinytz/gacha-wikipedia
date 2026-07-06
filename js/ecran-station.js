// Écran Station de Recherche — construit en phase C (étapes 8 à 10).

export function rendreEcranStation(section) {
  section.innerHTML = `
    <div class="carte-panneau">
      <h2>Station de Recherche</h2>
      <p class="texte-doux">🔬 En construction — les 3 modules d'accélération
      (Calibrage 3D, Chaîne de production, Marché) arrivent en phase C.</p>
      <p class="texte-doux">Vitesse actuelle : <b>×1.00</b></p>
    </div>`;
}
