#!/usr/bin/env python3
"""Données PROVISOIRES pour le développement de l'app (phase B).

Génère data/<collection>.json + data/collections.json depuis build/resolution.json
avec des pageviews ALÉATOIRES (seed fixe, reproductible). Le schéma et
l'algorithme rareté/PV (rarete_pv.py) sont exactement ceux de l'étape 2 —
seules les valeurs de pageviews sont fausses. L'index porte "provisoire": true.
"""
import json, random, sys, unicodedata, re
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parent.parent
import rarete_pv


def strip_accents(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s)
                   if unicodedata.category(c) != 'Mn')


def slugify(s):
    s = strip_accents(str(s)).lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def main():
    resolution = json.loads((ROOT / 'build' / 'resolution.json')
                            .read_text(encoding='utf-8'))
    rng = random.Random(42)

    by_col = {}
    for r in resolution:
        by_col.setdefault(r['collection'], []).append(r)

    (ROOT / 'data').mkdir(exist_ok=True)
    index = {'provisoire': True,
             'note': 'PAGEVIEWS ALÉATOIRES — à régénérer par generate_cards.py (étape 2)',
             'collections': []}

    for col, rows in by_col.items():
        col_slug = slugify(col)
        # Pageviews provisoires : distribution log-normale plausible
        views = [int(10 ** rng.uniform(2.5, 6.5)) for _ in rows]
        paliers, rangs = rarete_pv.raretes(views)
        cartes = []
        seen_slugs = set()
        for r, vue, palier, rang in zip(rows, views, paliers, rangs):
            page_slug = slugify(r['titre'] or r['nom'])
            while page_slug in seen_slugs:       # doublon résolu (provisoire)
                page_slug += '-b'
            seen_slugs.add(page_slug)
            cartes.append({
                'id': f'{col_slug}_{page_slug}',
                'nom': r['titre'] or r['nom'],
                'imageUrl': f'images/full/{col_slug}/{page_slug}.webp',
                'thumbUrl': f'images/thumbs/{col_slug}/{page_slug}.webp',
                'description': r['extrait'],
                'collection': col,
                'rarete': palier,
                'pv': rarete_pv.pv(rang),
                'lienWikipedia': r['url'],
                'pageviews': vue,
                'numero': r['numero'],
            })
        (ROOT / 'data' / f'{col_slug}.json').write_text(
            json.dumps({'collection': col, 'slug': col_slug, 'cartes': cartes},
                       ensure_ascii=False), encoding='utf-8')
        index['collections'].append({'slug': col_slug, 'nom': col,
                                     'nbCartes': len(cartes),
                                     'fichier': f'data/{col_slug}.json'})

    (ROOT / 'data' / 'collections.json').write_text(
        json.dumps(index, ensure_ascii=False, indent=1), encoding='utf-8')

    total = sum(c['nbCartes'] for c in index['collections'])
    print(f"{len(index['collections'])} collections, {total} cartes générées (PROVISOIRE)")
    from collections import Counter
    cnt = Counter()
    for col in index['collections']:
        d = json.loads((ROOT / 'data' / f"{col['slug']}.json").read_text(encoding='utf-8'))
        cnt.update(c['rarete'] for c in d['cartes'])
    print('répartition raretés :', dict(cnt))


if __name__ == '__main__':
    main()
