#!/usr/bin/env python3
"""Étape A — transforme corrections.json en overrides.json vérifiés.

- 'page' imposée par remarque -> override direct (vérifié via l'API).
- 'titreCorrige' sans page : si c'est un titre d'article existant -> override ;
  sinon c'est un indice de nom d'affichage -> noms_hints.json (étape B).
- Coupes du monde : nom «Pays Année» -> page «Coupe du monde de football (de) Année».
Fusionne avec l'overrides.json existant. Utilise le cache HTTP de resolve_titles.
"""
import sys, json, re
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'build'))
import resolve_titles as rt

def main():
    rt.load_cache()
    corrections = json.loads((ROOT / 'build' / 'corrections.json').read_text(encoding='utf-8'))
    overrides = json.loads((ROOT / 'build' / 'overrides.json').read_text(encoding='utf-8'))
    hints = {}
    problemes = []

    # 1) pages imposées + titres corrigés candidats + coupes du monde
    a_verifier = {}   # cle -> [titres candidats ordonnés]
    for cle, c in corrections.items():
        if c.get('supprimer') or c.get('anomalie'):
            continue
        cands = []
        if c.get('page'):
            cands.append(c['page'])
        if c['collection'] == 'Coupes du monde FIFA':
            m = re.search(r'(\d{4})', c['nom'])
            if m:
                an = m.group(1)
                cands += [f'Coupe du monde de football de {an}',
                          f'Coupe du monde de football {an}']
        if c.get('titreCorrige') and c['titreCorrige'] not in cands:
            cands.append(c['titreCorrige'])
            # variante sans article initial ("La machine à vapeur" -> page "Machine à vapeur")
            sans_article = re.sub(r"^(?:Le |La |Les |L')", '', c['titreCorrige']).strip()
            if sans_article != c['titreCorrige']:
                cands.append(sans_article[0].upper() + sans_article[1:])
        if cands:
            a_verifier[cle] = cands
        if c.get('titreCorrige'):
            hints[cle] = c['titreCorrige']

    # 2) vérification d'existence par lots
    tous = sorted({t for cands in a_verifier.values() for t in cands})
    print(f'Vérification de {len(tous)} titres candidats…')
    metas = rt.fetch_meta(tous)

    for cle, cands in a_verifier.items():
        choisi = None
        for t in cands:
            m = metas.get(t)
            if m and not m['disambig']:
                choisi = m['title']      # canonique après redirection
                break
        if choisi:
            overrides[cle] = choisi
        else:
            problemes.append(f'{cle} : aucun candidat valide parmi {cands}')

    (ROOT / 'build' / 'overrides.json').write_text(
        json.dumps(overrides, ensure_ascii=False, indent=1, sort_keys=True),
        encoding='utf-8')
    (ROOT / 'build' / 'noms_hints.json').write_text(
        json.dumps(hints, ensure_ascii=False, indent=1, sort_keys=True),
        encoding='utf-8')
    rt.save_cache(force=True)
    print(f'{len(overrides)} overrides écrits, {len(hints)} indices de noms.')
    for p in problemes:
        print('  ⚠️', p)


if __name__ == '__main__':
    main()
