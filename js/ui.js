// Petits utilitaires d'interface partagés.

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function formaterDuree(secondes) {
  secondes = Math.max(0, Math.round(secondes));
  const h = Math.floor(secondes / 3600);
  const m = Math.floor((secondes % 3600) / 60);
  const s = secondes % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

export function formaterNombre(n) {
  return new Intl.NumberFormat('fr-FR').format(Math.round(n));
}

// Dégradé stable dérivé du nom — placeholder tant que l'image n'existe pas.
export function teinteDepuisNom(nom) {
  let h = 0;
  for (const c of String(nom)) h = (h * 31 + c.codePointAt(0)) % 360;
  return h;
}

export function htmlImageCarte(carte, classe = '') {
  const h = teinteDepuisNom(carte.nom);
  const initiale = esc([...carte.nom][0] ?? '?');
  return `<div class="img-carte ${classe}" style="--h:${h}">
    <span class="initiale">${initiale}</span>
    <img src="${esc(carte.thumbUrl)}" alt="" loading="lazy"
         onload="this.parentElement.classList.add('chargee')" onerror="this.remove()">
  </div>`;
}

export const NOMS_RARETE = {
  commune: 'Commune', rare: 'Rare', epique: 'Épique',
  mythique: 'Mythique', legendaire: 'Légendaire',
};

export function confirmer(message) {
  return window.confirm(message);
}
