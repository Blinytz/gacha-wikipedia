// Persistance — une clé localStorage unique, état complet versionné.
// Ne jamais perdre silencieusement un état existant : en cas de JSON corrompu,
// une copie est conservée sous CLE + '-corrompu' avant de repartir à neuf.

const CLE = 'gachaWikipediaEtat';
export const VERSION_ETAT = 1;

function etatInitial() {
  return {
    version: VERSION_ETAT,
    creeLe: Date.now(),
    cartes: {},              // id de carte -> quantité possédée
    eclats: 0,
    tauxEclats: null,        // initialisé par eclats.js
    paquets: null,           // initialisé par paquets.js
    station: null,           // phase C
    configUtilisateur: {},   // surcharges des paramètres (voir config.js)
    prefs: { afficherVides: true },
  };
}

function migrer(e) {
  // Migrations futures : if (e.version === 1) { ...; e.version = 2; }
  return e;
}

function charger() {
  let brut = null;
  try {
    brut = localStorage.getItem(CLE);
    if (!brut) return etatInitial();
    const e = migrer(JSON.parse(brut));
    if (typeof e !== 'object' || e === null || typeof e.cartes !== 'object') {
      throw new Error('structure invalide');
    }
    return { ...etatInitial(), ...e };
  } catch (err) {
    console.error('État corrompu, copie de sauvegarde conservée :', err);
    try { if (brut) localStorage.setItem(CLE + '-corrompu', brut); } catch {}
    alerteErreur("L'état sauvegardé était illisible. Une copie a été conservée, l'application repart à neuf.");
    return etatInitial();
  }
}

export const etat = charger();

let minuterieSauvegarde = null;
let erreurQuotaSignalee = false;

export function sauvegarder() {
  // Débounce : de nombreuses mutations rapprochées = une seule écriture.
  clearTimeout(minuterieSauvegarde);
  minuterieSauvegarde = setTimeout(sauvegarderMaintenant, 400);
}

export function sauvegarderMaintenant() {
  clearTimeout(minuterieSauvegarde);
  try {
    localStorage.setItem(CLE, JSON.stringify(etat));
  } catch (err) {
    console.error('Échec de sauvegarde :', err);
    if (!erreurQuotaSignalee) {
      erreurQuotaSignalee = true;
      alerteErreur('Impossible de sauvegarder (stockage plein ?). Exporte ta sauvegarde depuis les Réglages !');
    }
  }
}

window.addEventListener('beforeunload', sauvegarderMaintenant);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') sauvegarderMaintenant();
});

export function exporterJSON() {
  return JSON.stringify(etat, null, 1);
}

export function importerJSON(texte) {
  const e = JSON.parse(texte);   // lève si invalide — géré par l'appelant
  if (typeof e !== 'object' || e === null || typeof e.version !== 'number'
      || typeof e.cartes !== 'object') {
    throw new Error("Ce fichier n'est pas une sauvegarde Gacha Wikipedia valide.");
  }
  localStorage.setItem(CLE, JSON.stringify(migrer(e)));
}

export function reinitialiserTout() {
  localStorage.removeItem(CLE);
}

function alerteErreur(message) {
  // Différé pour ne pas bloquer le chargement du module.
  setTimeout(() => alert(message), 50);
}
