#!/usr/bin/env python3
"""Étape A — liste compacte des résolutions restant douteuses, pour revue.

Écarte : cartes supprimées, validées «ok», overrides utilisateur, et les cas
où le titre résolu n'est que la forme accentuée/qualifiée du nom Excel.
Le reste est imprimé par collection pour arbitrage manuel.
"""
import sys, json
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'build'))
from resolve_titles import norm, base_title

rs = json.loads((ROOT / 'build' / 'resolution.json').read_text(encoding='utf-8'))
corrections = json.loads((ROOT / 'build' / 'corrections.json').read_text(encoding='utf-8'))

suspects = {}
auto_ok = 0
for r in rs:
    cle = f"{r['collection']}|{r['nom']}"
    c = corrections.get(cle, {})
    if c.get('supprimer') or c.get('valide') or r['methode'] == 'override':
        continue
    if r['statut'] == 'ok' and 'DOUBLON' not in r['note']:
        continue
    n, t, bt = norm(r['nom']), norm(r['titre']), norm(base_title(r['titre']))
    # accents / articles / qualificatif : différence sans risque
    sans_article = norm(__import__('re').sub(r"^(le |la |les |l )", '', n))
    if t in (n, sans_article) or bt in (n, sans_article):
        auto_ok += 1
        continue
    suspects.setdefault(r['collection'], []).append(r)

total = sum(len(v) for v in suspects.values())
print(f'{auto_ok} douteux auto-acceptés (accents/qualificatifs), {total} à arbitrer :\n')
for col, rows in sorted(suspects.items()):
    print(f'=== {col} ({len(rows)})')
    for r in rows:
        note = ('DOUBLON' if 'DOUBLON' in r['note'] else r['methode'])
        print(f"  {r['nom'][:34]:36}-> {r['titre'][:40]:42} [{note}] {r['extrait'][:60]}")
