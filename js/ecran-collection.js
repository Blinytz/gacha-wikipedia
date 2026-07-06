// Écran Collection — vue d'ensemble des 32 collections puis grille par
// collection, cases non obtenues grisées, détail recto/verso au tap.

import { etat } from './etat.js';
import { donnees } from './donnees.js';
import { esc, htmlImageCarte, NOMS_RARETE } from './ui.js';
import { ouvrirDetailCarte } from './carte.js';

let collectionOuverte = null;   // slug ou null (vue d'ensemble)

export function rendreEcranCollection(section, options = {}) {
  if (options.collection !== undefined) collectionOuverte = options.collection;
  const col = donnees.collections.find(c => c.slug === collectionOuverte);
  if (col) rendreGrille(section, col);
  else rendreVueEnsemble(section);
}

function nbPossedees(col) {
  return col.cartes.filter(c => etat.cartes[c.id] > 0).length;
}

function rendreVueEnsemble(section) {
  const totalPossede = Object.keys(etat.cartes).filter(id => etat.cartes[id] > 0).length;
  const lignes = [...donnees.collections]
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'))
    .map(col => {
      const n = nbPossedees(col);
      const pct = Math.round(100 * n / col.nbCartes);
      const complet = n === col.nbCartes ? ' complet' : '';
      return `
      <button class="ligne-collection${complet}" data-slug="${col.slug}">
        <div class="infos-collection">
          <span class="nom-collection">${esc(col.nom)}</span>
          <span class="compte-collection">${n} / ${col.nbCartes}${complet ? ' ✦' : ''}</span>
        </div>
        <div class="barre-progression"><div style="width:${pct}%"></div></div>
      </button>`;
    }).join('');

  section.innerHTML = `
    <div class="entete-ecran">
      <h2>Collection</h2>
      <span class="texte-doux">${totalPossede} / ${donnees.pool.length} cartes</span>
    </div>
    <div class="liste-collections">${lignes}</div>`;

  for (const btn of section.querySelectorAll('.ligne-collection')) {
    btn.addEventListener('click', () =>
      rendreEcranCollection(section, { collection: btn.dataset.slug }));
  }
}

function rendreGrille(section, col) {
  const cartes = [...col.cartes].sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
  const afficherVides = etat.prefs.afficherVides;
  const n = nbPossedees(col);

  const cases = cartes.map(carte => {
    const qte = etat.cartes[carte.id] || 0;
    if (qte === 0) {
      return afficherVides
        ? `<div class="case-carte case-vide" title="Non obtenue">?</div>` : '';
    }
    const badge = qte >= 2 ? `<span class="badge-quantite">×${qte}</span>` : '';
    return `
    <button class="case-carte rarete-${carte.rarete}" data-id="${esc(carte.id)}">
      ${htmlImageCarte(carte)}
      <span class="nom-case">${esc(carte.nom)}</span>
      <span class="point-rarete" title="${NOMS_RARETE[carte.rarete]}"></span>
      ${badge}
    </button>`;
  }).join('');

  section.innerHTML = `
    <div class="entete-ecran">
      <button class="btn btn-discret btn-retour">← Collections</button>
      <h2>${esc(col.nom)}</h2>
      <span class="texte-doux">${n} / ${col.nbCartes}</span>
    </div>
    <div class="grille-cartes">${cases ||
      '<p class="texte-doux">Aucune carte possédée dans cette collection pour l’instant.</p>'}
    </div>`;

  section.querySelector('.btn-retour').addEventListener('click', () =>
    rendreEcranCollection(section, { collection: null }));
  for (const btn of section.querySelectorAll('.case-carte[data-id]')) {
    btn.addEventListener('click', () => {
      const carte = donnees.parId.get(btn.dataset.id);
      ouvrirDetailCarte(carte, detailOptions(carte, () =>
        rendreEcranCollection(section, {})));
    });
  }
}

// Point d'extension : l'étape 7 (Éclats) remplace ce hook pour ajouter la
// vente de doublons depuis le détail d'une carte.
export let detailOptions = () => ({});
export function definirDetailOptions(fn) { detailOptions = fn; }
