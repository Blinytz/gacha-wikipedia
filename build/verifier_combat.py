#!/usr/bin/env python3
"""Contrôle qualité des données de combat générées."""
import sys, json
from collections import Counter
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parent.parent

combat = json.loads((ROOT / 'data' / 'combat.json').read_text(encoding='utf-8'))
idx = json.loads((ROOT / 'data' / 'collections.json').read_text(encoding='utf-8'))
cartes = []
for c in idx['collections']:
    d = json.loads((ROOT / c['fichier']).read_text(encoding='utf-8'))
    cartes += [(d['slug'], x) for x in d['cartes']]

print(f'{len(cartes)} cartes · {len(combat["tagsRegistre"])} tags distincts\n')

# --- couverture
sans_tag = [c for _, c in cartes if not c.get('tags')]
sans_pouvoir = [c for _, c in cartes if not c.get('pouvoir')]
sans_role = [c for _, c in cartes if not c.get('role')]
print(f'sans tag      : {len(sans_tag):4} ({100*len(sans_tag)//len(cartes)} %)')
print(f'sans pouvoir  : {len(sans_pouvoir):4}')
print(f'sans rôle     : {len(sans_role):4}')

# --- répartition des rôles (en cartes, pas en collections)
roles = Counter(c.get('role') for _, c in cartes)
print(f'\nrôles : {dict(roles)}')

# --- familles d'effet
fam = Counter(c['pouvoir']['familleId'] for _, c in cartes if c.get('pouvoir'))
print(f'\n{len(fam)} familles utilisées, top 6 : {dict(fam.most_common(6))}')
inutilisees = [f['id'] for f in combat['familles'] if f['id'] not in fam]
if inutilisees:
    print(f'  familles jamais tirées : {inutilisees}')

# --- tags les plus fréquents
tous = Counter(t for _, c in cartes for t in c.get('tags', []))
print(f'\ntags les plus fréquents : {dict(tous.most_common(10))}')
solitaires = sum(1 for t, n in tous.items() if n == 1)
print(f'tags portés par une seule carte : {solitaires}')

# --- PV de combat
pv = [c.get('pvCombat') for _, c in cartes if c.get('pvCombat')]
hors = [v for v in pv if v < 10 or v > 500 or v % 10]
print(f'\nPV combat : min {min(pv)} max {max(pv)} · hors plage/pas de 10 : {len(hors)}')

# --- exemples
print('\n--- exemples de pouvoirs ---')
for slug, c in cartes[:3] + cartes[900:903]:
    if c.get('pouvoir'):
        print(f"  [{c.get('role','?'):8}] {c['nom'][:26]:28} {c['pouvoir']['texte'][:92]}")
        print(f"      tags: {c.get('tags')}")
