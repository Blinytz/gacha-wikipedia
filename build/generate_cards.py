#!/usr/bin/env python3
"""Étape C — données DÉFINITIVES : pageviews réels 12 mois -> raretés/PV.

Consomme resolution.json (+ corrections/suppressions + noms_cartes.json),
interroge l'API pageviews Wikimedia (cache disque, rejouable), calcule les
rangs percentiles et raretés à quotas garantis (rarete_pv.py), écrit
data/<collection>.json + data/collections.json (sans flag provisoire) et
build/rapport_donnees.txt (contrôle : paliers, top/flop par collection).
"""
import sys, json, re, time, pickle, unicodedata, urllib.request, urllib.parse
from datetime import date, timedelta
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'build'))
import rarete_pv

UA = 'wikideck-build/1.0 (projet perso; contact: claude.elk041@passmail.net)'
CACHE_PV = ROOT / 'build' / '.cache_pageviews.pkl'
SLEEP = 0.03

_cache = pickle.loads(CACHE_PV.read_bytes()) if CACHE_PV.exists() else {}
_sale = 0


def strip_accents(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s)
                   if unicodedata.category(c) != 'Mn')


def slugify(s):
    s = strip_accents(str(s)).lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def periode():
    fin = date.today().replace(day=1) - timedelta(days=1)      # fin du mois dernier
    debut = (fin.replace(day=1) - timedelta(days=360)).replace(day=1)
    return debut.strftime('%Y%m%d'), fin.strftime('%Y%m%d')


DEBUT, FIN = periode()


def pageviews(titre):
    """Vues cumulées des 12 derniers mois (0 si article sans statistiques)."""
    global _sale
    art = urllib.parse.quote(titre.replace(' ', '_'), safe='')
    url = (f'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/'
           f'fr.wikipedia/all-access/user/{art}/monthly/{DEBUT}/{FIN}')
    if url in _cache:
        return _cache[url]
    total = 0
    for tentative in range(3):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=25) as r:
                data = json.loads(r.read().decode('utf-8'))
            total = sum(x.get('views', 0) for x in data.get('items', []))
            break
        except urllib.error.HTTPError as e:
            if e.code == 404:      # pas de stats -> 0 vue
                break
            time.sleep(2 * (tentative + 1))
        except Exception:
            time.sleep(2 * (tentative + 1))
    _cache[url] = total
    _sale += 1
    if _sale >= 50:
        CACHE_PV.write_bytes(pickle.dumps(_cache))
        _sale = 0
    time.sleep(SLEEP)
    return total


def main():
    rs = json.loads((ROOT / 'build' / 'resolution.json').read_text(encoding='utf-8'))
    corrections = json.loads((ROOT / 'build' / 'corrections.json').read_text(encoding='utf-8'))
    noms = json.loads((ROOT / 'build' / 'noms_cartes.json').read_text(encoding='utf-8'))
    sup_extra = set(json.loads((ROOT / 'build' / 'suppressions_extra.json')
                               .read_text(encoding='utf-8')))

    par_col = {}
    for r in rs:
        cle = f"{r['collection']}|{r['nom']}"
        if corrections.get(cle, {}).get('supprimer') or cle in sup_extra:
            continue
        r['_cle'] = cle
        par_col.setdefault(r['collection'], []).append(r)

    total = sum(len(v) for v in par_col.values())
    print(f'{total} cartes après suppressions — pageviews {DEBUT} -> {FIN}')

    (ROOT / 'data').mkdir(exist_ok=True)
    index = {'collections': []}
    rapport = [f'Rapport données définitives — pageviews {DEBUT}->{FIN}\n']
    fait = 0

    for col, rows in par_col.items():
        col_slug = slugify(col)
        vues = []
        for r in rows:
            vues.append(pageviews(r['titre']))
            fait += 1
            if fait % 100 == 0:
                print(f'  … {fait}/{total}')
        paliers, rangs = rarete_pv.raretes(vues)

        cartes, seen = [], set()
        for r, vue, palier, rang in zip(rows, vues, paliers, rangs):
            slug = slugify(r['titre'])
            while slug in seen:
                slug += '-b'
            seen.add(slug)
            n = noms.get(r['_cle'], {})
            cartes.append({
                'id': f'{col_slug}_{slug}',
                'nom': n.get('nomCarte') or r['titre'],
                'titrePage': r['titre'],
                'imageUrl': f'images/full/{col_slug}/{slug}.webp',
                'thumbUrl': f'images/thumbs/{col_slug}/{slug}.webp',
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

        # rapport de contrôle
        from collections import Counter
        cnt = Counter(c['rarete'] for c in cartes)
        tri = sorted(cartes, key=lambda c: -c['pageviews'])
        rapport.append(f"== {col} ({len(cartes)} cartes) "
                       f"L:{cnt['legendaire']} M:{cnt['mythique']} E:{cnt['epique']} "
                       f"R:{cnt['rare']} C:{cnt['commune']}")
        rapport.append('  top  : ' + ' | '.join(
            f"{c['nom']} ({c['pageviews']:,} vues, {c['rarete']}, {c['pv']}PV)"
            for c in tri[:3]))
        rapport.append('  flop : ' + ' | '.join(
            f"{c['nom']} ({c['pageviews']:,} vues, {c['pv']}PV)" for c in tri[-3:]))

    (ROOT / 'data' / 'collections.json').write_text(
        json.dumps(index, ensure_ascii=False, indent=1), encoding='utf-8')
    CACHE_PV.write_bytes(pickle.dumps(_cache))
    (ROOT / 'build' / 'rapport_donnees.txt').write_text(
        '\n'.join(rapport), encoding='utf-8')
    print(f'{len(index["collections"])} collections écrites, rapport_donnees.txt généré')


if __name__ == '__main__':
    main()
