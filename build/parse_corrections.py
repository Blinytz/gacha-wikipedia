#!/usr/bin/env python3
"""Étape A — parse verification-cartes-gacha2.xlsx (colonnes I «Titre corrigé»
et J «Remarques») vers build/corrections.json.

Par carte (clé "Collection|Nom Excel") :
  page        titre exact fr.wikipedia imposé (depuis URL de remarque ou titre corrigé)
  imageUrl    URL d'image imposée
  memoImage   True -> réutiliser l'image de memo-app
  supprimer   True -> retirer la carte de la collection
  valide      True -> résolution confirmée par l'utilisateur («ok»)
  nomCarte    indice de nom d'affichage donné par l'utilisateur
  note        remarque brute (référence)
"""
import sys, json, re, urllib.parse
from pathlib import Path
import openpyxl

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parent.parent
XLSX = Path(r'C:\Users\flxjr\Downloads\verification-cartes-gacha2.xlsx')

RE_URL_WIKI = re.compile(r'https?://fr\.wikipedia\.org/wiki/(\S+)')
RE_URL_AUTRE = re.compile(r'https?://(?!fr\.wikipedia\.org)\S+')
RE_TITRE_WIKI_TXT = re.compile(r'([^\n:]+?)\s*[–—-]\s*Wikip')

MOTS_SUPPRESSION = ('supprimer le doublon', 'supprime la carte', 'supprimer la ligne',
                    'supprimer cette carte', 'supprime cette carte', 'doublon à supprimer',
                    'supprimer le doublon')
MOTS_MEMO = ('utiliser les images utilisées dans memo.html',
             'utiliser les images de hadès',
             'utiliser le logo de la compétition')
MOTS_IMAGE = ('lien de l’image', "lien de l'image", 'lien pour l’image', "lien pour l'image",
              'lien vers l’image', "lien vers l'image", 'voici un lien',
              "lien d'une meilleure image", 'image à mettre', 'utiliser celle-ci')

# Erreur signalée par l'utilisateur : ne pas appliquer.
IGNORES = {('Monuments emblematiques', 'Bourj Al Arab')}


def decoder_page(url):
    t = urllib.parse.unquote(url.split('/wiki/')[-1]).replace('_', ' ')
    t = re.sub(r'[.,;]+$', '', t).strip()
    # parenthèse finale : ne la retirer que si elle est orpheline
    if t.endswith(')') and t.count('(') < t.count(')'):
        t = t[:-1]
    return t.strip()


def main():
    wb = openpyxl.load_workbook(XLSX, read_only=True)
    ws = wb['Cartes']
    corrections = {}
    anomalies = []
    n_page = n_img = n_memo = n_del = n_ok = n_titre = 0

    for r in ws.iter_rows(min_row=2, values_only=True):
        collection, numero, nom = r[0], r[1], r[2]
        titre_corrige = (str(r[8]).strip() if r[8] not in (None, '') else '')
        remarque = (str(r[9]).strip() if len(r) > 9 and r[9] not in (None, '') else '')
        if not titre_corrige and not remarque:
            continue
        cle = f'{collection}|{nom}'
        c = {'collection': collection, 'numero': numero, 'nom': nom, 'note': remarque}
        bas = remarque.lower()

        if (collection, nom) in IGNORES:
            c['anomalie'] = 'correction écartée (erreur signalée par l’utilisateur)'
            anomalies.append(f'{cle} : correction «{titre_corrige}» ignorée (erreur utilisateur confirmée)')
            corrections[cle] = c
            continue

        if bas == 'ok':
            c['valide'] = True
            n_ok += 1
            corrections[cle] = c
            continue

        # suppression ?
        if any(m in bas for m in MOTS_SUPPRESSION):
            c['supprimer'] = True
            n_del += 1
            corrections[cle] = c
            continue

        # page imposée par URL fr.wikipedia dans la remarque
        m = RE_URL_WIKI.search(remarque)
        if m:
            c['page'] = decoder_page(m.group(0))
            n_page += 1
        else:
            # forme textuelle « la bonne page est … — Wikipédia »
            m2 = RE_TITRE_WIKI_TXT.search(remarque)
            if m2:
                c['page'] = m2.group(1).strip()
                n_page += 1

        # image imposée (URL non-wikipedia) — seulement si le contexte le dit
        if any(mot in bas for mot in MOTS_IMAGE) or 'manque l\'image' in bas \
           or 'manque l’image' in bas:
            m3 = RE_URL_AUTRE.search(remarque)
            if m3:
                c['imageUrl'] = m3.group(0).rstrip(').,;')
                n_img += 1

        # réutilisation memo
        if any(mot in bas for mot in MOTS_MEMO):
            c['memoImage'] = True
            n_memo += 1
            # cas Érèbe : URL de secours si absent de Hadès
            if 'si pas d\'image' in bas or 'si pas d’image' in bas:
                m4 = RE_URL_AUTRE.search(remarque)
                if m4:
                    c['imageFallback'] = m4.group(0).rstrip(').,;')

        # titre corrigé (colonne I) : candidat page ET/OU nom d'affichage
        if titre_corrige:
            c['titreCorrige'] = titre_corrige
            n_titre += 1

        corrections[cle] = c

    sortie = ROOT / 'build' / 'corrections.json'
    sortie.write_text(json.dumps(corrections, ensure_ascii=False, indent=1),
                      encoding='utf-8')
    print(f'{len(corrections)} cartes annotées -> {sortie.name}')
    print(f'  pages imposées: {n_page} | images imposées: {n_img} | memo: {n_memo}'
          f' | suppressions: {n_del} | validées ok: {n_ok} | titres corrigés: {n_titre}')
    for a in anomalies:
        print('  ⚠️', a)


if __name__ == '__main__':
    main()
