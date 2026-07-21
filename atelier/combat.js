// Atelier — module Combat (mode roguelike) : pouvoirs, tags, synergies, rôles.
// Tout est éditable ; la config globale vit dans data/combat.json et les
// champs par carte (tags, pouvoir, pvCombat, role) dans data/<collection>.json.

import { getFichierTexte, putFichier, enfiler } from './github.js';

export const ROLES = ['attaque', 'defense', 'terrain'];
export const LIBELLE_ROLE = { attaque: 'Attaque', defense: 'Défense', terrain: 'Terrain' };

export const combat = {
  version: 1, roles: {}, declencheurs: {}, catalogueDeclencheurs: [],
  familles: [], paliersLiens: [], forceContinue: {}, forceDiscrete: {},
  pvCombat: {}, tagsRegistre: [],
};

export async function chargerCombat(bust) {
  try {
    const d = await (await fetch('data/combat.json' + bust)).json();
    Object.assign(combat, d);
  } catch { /* pas encore généré */ }
}

export function familleParId(id) {
  return combat.familles.find(f => f.id === id);
}

// Recompose la phrase du pouvoir à partir de ses sections.
export function textePouvoir(p) {
  const f = familleParId(p.familleId);
  if (!f) return p.texte || '';
  const effet = f.gabarit
    .replace('{valeur}', p.valeur)
    .replace('{unite}', p.unite ?? f.unite);
  const d = p.declencheur || '';
  return d ? `${d[0].toUpperCase()}${d.slice(1)}, ${effet}.` : `${effet[0].toUpperCase()}${effet.slice(1)}.`;
}

/* ---------------- écriture de la config globale ---------------- */

let fileCombat = Promise.resolve();

// Sérialise les écritures de combat.json et relit le sha à chaque fois.
export function sauverCombat(message) {
  enfiler(message || 'combat.json', async () => {
    const { texte, sha } = await getFichierTexte('data/combat.json');
    const distant = texte ? JSON.parse(texte) : {};
    // le local fait foi sur ce que l'utilisateur vient de changer, le distant
    // conserve ce que d'autres appareils auraient ajouté entre-temps
    const fusion = {
      ...distant, ...combat,
      roles: { ...(distant.roles || {}), ...combat.roles },
      declencheurs: { ...(distant.declencheurs || {}), ...combat.declencheurs },
      tagsRegistre: [...new Set([...(distant.tagsRegistre || []), ...combat.tagsRegistre])].sort(),
    };
    Object.assign(combat, fusion);
    await putFichier('data/combat.json',
      btoa(unescape(encodeURIComponent(JSON.stringify(fusion, null, 1)))),
      message || 'Atelier : config combat', sha);
  });
}

export function ajouterAuRegistre(tag) {
  if (!tag) return false;
  if (combat.tagsRegistre.includes(tag)) return false;
  combat.tagsRegistre = [...combat.tagsRegistre, tag].sort();
  return true;
}
