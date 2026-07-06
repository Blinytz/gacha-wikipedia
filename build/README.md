# Build — Génération des données Gacha Wikipedia

Scripts Python de la phase A. Source : `collections-gacha-wikipedia.xlsx`
(32 collections, 2 328 cartes). Aucun de ces scripts n'est utilisé par l'app :
ils produisent les fichiers statiques de `data/` et `images/`.

## Étape 1 — Résolution des titres

```bash
cd build
python resolve_titles.py
```

Produit :
- `resolution.json` — nom Excel → titre exact fr.wikipedia (consommé par l'étape 2)
- `audit.html` — rapport de vérification visuel (ouvrir dans le navigateur)
- `audit.csv` — équivalent tableur (séparateur `;`, encodage Excel)

Statuts dans l'audit :
- **ok** — lookup direct ou correspondance exacte (accents près)
- **verifier** — résolu par recherche contextuelle : à contrôler visuellement
- **echec** — page introuvable : override obligatoire

## Corrections manuelles — overrides.json

Toujours prioritaire sur la résolution automatique :

```json
{
  "Corps celestes|Titan": "Titan (lune)",
  "Mercure": "Mercure (planète)"
}
```

Clé `"Collection|Nom Excel"` (précise) ou `"Nom Excel"` (globale).
Relancer `python resolve_titles.py` après édition — le cache HTTP
(`.cache.pkl`, gitignoré) évite de re-télécharger ce qui l'a déjà été.

## Étapes suivantes

- Étape 2 : `generate_cards.py` — pageviews 12 mois, percentiles, raretés, PV → `data/*.json`
- Étape 3 : `fetch_images.py` — téléchargement webp thumbs/full → `images/`
