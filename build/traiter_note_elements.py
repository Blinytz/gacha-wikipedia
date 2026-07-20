#!/usr/bin/env python3
"""Traite la note atelier « éléments chimiques » : remplace les images listées
par la tuile SVG schématique de Mémo (abréviation), pour homogénéiser toute la
collection sur le style des éléments lourds (oganesson, seaborgium…).

Mapping : numéro de carte gacha = numéro atomique = ligne memo `elements`.
Rendu identique aux 19 déjà en place (rasterisation Chrome + to_thumb/to_full).
"""
import sys, json
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'build'))
import images_lib as il

SLUG = 'elements-chimiques'


def main():
    note = json.loads((ROOT / 'build' / 'notes_atelier.json').read_text(encoding='utf-8'))
    cible = next((n for n in note['notes']
                  if n['statut'] == 'ouverte' and 'elements-chimiques' in
                  ' '.join(n['images'])), None)
    if not cible:
        print('Aucune note ouverte sur les éléments chimiques.')
        return

    d = json.loads((ROOT / 'data' / f'{SLUG}.json').read_text(encoding='utf-8'))
    par_id = {c['id']: c for c in d['cartes']}
    sources = json.loads((ROOT / 'build' / 'images_sources.json').read_text(encoding='utf-8'))

    ids = cible['images']
    print(f'{len(ids)} éléments à retuiler')
    faits, echecs = 0, []
    for cid in ids:
        carte = par_id.get(cid)
        if not carte:
            echecs.append(f'{cid} (carte absente)')
            continue
        svg = il.memo_data_uri_svg('elements', carte['numero'])
        if not svg:
            echecs.append(f'{cid} (pas de SVG memo #{carte["numero"]})')
            continue
        png = il.rasterizer_svg(svg, largeur=900)
        if not png:
            echecs.append(f'{cid} (rasterisation)')
            continue
        th, fu = il.to_thumb(png), il.to_full(png)
        if not (th and fu):
            echecs.append(f'{cid} (conversion webp)')
            continue
        fslug = cid.split('_', 1)[1]
        (ROOT / 'images' / 'thumbs' / SLUG / f'{fslug}.webp').write_bytes(th)
        (ROOT / 'images' / 'full' / SLUG / f'{fslug}.webp').write_bytes(fu)
        sources[cid] = {'source': 'memo:svg-element'}
        faits += 1
        if faits % 20 == 0:
            print(f'  … {faits}/{len(ids)}')

    (ROOT / 'build' / 'images_sources.json').write_text(
        json.dumps(sources, ensure_ascii=False, indent=0), encoding='utf-8')

    # marque la note traitée
    cible['statut'] = 'traitee'
    cible['majLe'] = int(__import__('time').time() * 1000)
    (ROOT / 'build' / 'notes_atelier.json').write_text(
        json.dumps(note, ensure_ascii=False, indent=1), encoding='utf-8')

    print(f'\n{faits} éléments retuilés, {len(echecs)} échec(s)')
    for e in echecs:
        print('  ⚠️', e)


if __name__ == '__main__':
    main()
