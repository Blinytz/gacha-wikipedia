// Composant carte à collectionner : rendu recto/verso + overlay de détail.
// Utilisé par l'écran Collection (étape 5) et la révélation de paquet (étape 6).

import { etat } from './etat.js';
import { esc, htmlImageCarte, NOMS_RARETE } from './ui.js';

export function htmlCarte(carte, { quantite = 0, dosVisible = false } = {}) {
  const badgeQte = quantite >= 2
    ? `<div class="badge-quantite">×${quantite}</div>` : '';
  return `
  <div class="carte-jeu rarete-${carte.rarete} ${dosVisible ? 'dos-visible' : ''}"
       data-id="${esc(carte.id)}">
    <div class="carte-interieur">
      <div class="carte-face carte-recto">
        <div class="brillance"></div>
        <div class="entete-carte">
          <span class="nom-carte">${esc(carte.nom)}</span>
          <span class="pv-carte"><b>${carte.pv}</b> PV</span>
        </div>
        ${htmlImageCarte(carte, 'illustration')}
        <div class="ligne-rarete">
          <span class="badge-rarete">${NOMS_RARETE[carte.rarete]}</span>
          <span class="collection-carte">${esc(carte.collection)}</span>
        </div>
        <div class="desc-carte">${esc(carte.description || '')}</div>
        ${badgeQte}
      </div>
      <div class="carte-face carte-verso">
        <div class="logo-wiki">W</div>
        <div class="cercle-verso"></div>
        <a class="lien-wiki" href="${esc(carte.lienWikipedia)}" target="_blank"
           rel="noopener">Voir la page Wikipedia ↗</a>
      </div>
    </div>
  </div>`;
}

// Ouvre le détail plein écran d'une carte, avec retournement au tap.
// `options.actions` : HTML additionnel injecté sous la carte (ex : bouton de
// vente à l'étape 7) ; `options.brancherActions(overlay)` câble ses listeners.
export function ouvrirDetailCarte(carte, options = {}) {
  const quantite = etat.cartes[carte.id] || 0;
  const overlay = document.createElement('div');
  overlay.className = 'overlay-carte';
  overlay.innerHTML = `
    <div class="fond-overlay"></div>
    <div class="contenu-overlay">
      ${htmlCarte(carte, { quantite })}
      <p class="astuce-carte">Touche la carte pour la retourner</p>
      ${options.actions || ''}
      <button class="btn btn-discret btn-fermer">Fermer</button>
    </div>`;
  document.getElementById('overlays').append(overlay);

  const el = overlay.querySelector('.carte-jeu');
  el.addEventListener('click', (ev) => {
    if (ev.target.closest('a')) return;   // le lien Wikipedia reste cliquable
    el.classList.toggle('dos-visible');
  });
  const fermer = () => overlay.remove();
  overlay.querySelector('.btn-fermer').addEventListener('click', fermer);
  overlay.querySelector('.fond-overlay').addEventListener('click', fermer);
  options.brancherActions?.(overlay, fermer);
  return overlay;
}
