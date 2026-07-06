// Chargement des données statiques de cartes (data/*.json).
// Les fichiers sont générés par build/ (provisoires en phase B, définitifs à
// l'étape 2) et mis en cache par le service worker pour le hors-ligne.

export const donnees = {
  provisoire: false,
  collections: [],       // [{slug, nom, nbCartes, cartes: [...]}]
  parId: new Map(),      // id -> carte
  pool: [],              // tous les ids (tirage équiprobable global)
};

export async function chargerDonnees() {
  const index = await (await fetch('data/collections.json')).json();
  donnees.provisoire = !!index.provisoire;
  const fichiers = await Promise.all(
    index.collections.map(c => fetch(c.fichier).then(r => {
      if (!r.ok) throw new Error(`${c.fichier} : HTTP ${r.status}`);
      return r.json();
    }))
  );
  donnees.collections = fichiers.map(f => ({
    slug: f.slug, nom: f.collection, nbCartes: f.cartes.length, cartes: f.cartes,
  }));
  for (const col of donnees.collections) {
    for (const carte of col.cartes) {
      donnees.parId.set(carte.id, carte);
      donnees.pool.push(carte.id);
    }
  }
}
