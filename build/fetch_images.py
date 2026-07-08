#!/usr/bin/env python3
"""Étape D — téléchargement des images : 100 % de couverture, qualité d'abord.

Ordre de priorité par carte :
  1. image imposée par l'utilisateur (corrections.json)
  2. memo-app (correspondance nom -> image déjà téléchargée, LECTURE SEULE)
  3. source spécialisée de la collection (TMDB, IAU, jaquettes EN, …)
  4. Wikipedia fr puis en (image principale, fichiers cartes/logos filtrés)
  5. recherche d'images Bing (dernier recours, jamais de placeholder)

Usage : python fetch_images.py [--collection <slug>] [--force]
Clé TMDB : variable d'environnement TMDB_API_KEY (jamais committée).
Sorties : images/{thumbs,full}/<col>/<slug>.webp, build/images_sources.json,
build/rapport_images.csv, build/contact_sheets/<col>.html
"""
import sys, os, json, re, csv, argparse, html as htmlmod
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'build'))
import images_lib as il

TMDB_KEY = os.environ.get('TMDB_API_KEY', '')

# collections gacha -> listes memo où chercher une correspondance de nom
MEMO_LISTES = {
    'dieux-et-figures-mythologiques-grecques': ['mythologie'],
    'pilotes-f1-champions-du-monde': ['f1_champions'],
    'films-cultes': ['films'],
    'grands-peintres': ['peintres'],
    'scientifiques-celebres': ['grands_scientifiques'],
    'grands-dirigeants': ['chefs_etat', 'rois_france'],
    'auteurs-celebres': ['litterature', 'philosophes'],
    'grandes-batailles-historiques': ['batailles_decisives'],
    'grandes-guerres': ['guerres'],
    'dynasties-et-empires-historiques': ['civilisations'],
    'grands-explorateurs': ['grandes_explorations'],
    'inventions-importantes': ['inventions_majeures'],
    'corps-celestes': ['lunes'],
}
ANIMAUX = {'mammiferes', 'oiseaux', 'reptiles-et-amphibiens',
           'poissons-et-vie-marine', 'insectes', 'races-de-chien',
           'dinosaures-celebres'}
CONTEXTE_BING = {
    'mammiferes': 'animal photo', 'oiseaux': 'oiseau photo',
    'reptiles-et-amphibiens': 'reptile photo', 'insectes': 'insecte photo',
    'poissons-et-vie-marine': 'photo mer', 'races-de-chien': 'chien race photo',
    'dinosaures-celebres': 'dinosaure', 'films-cultes': 'affiche film poster',
    'jeux-video-cultes': 'jeu vidéo cover art', 'tableaux-celebres': 'peinture tableau',
    'personnages-de-fiction-celebres': 'personnage', 'creatures-et-legendes': 'créature mythologie art',
    'mythologies-du-monde-hors-grece': 'dieu mythologie art',
    'dieux-et-figures-mythologiques-grecques': 'hades game art',
    'monuments-emblematiques': 'photo', 'merveilles-du-monde': 'photo',
    'constellations': 'constellation carte du ciel',
    'elements-chimiques': 'élément chimique échantillon',
}


def charger_cartes(filtre_col):
    index = json.loads((ROOT / 'data' / 'collections.json').read_text(encoding='utf-8'))
    cols = []
    for c in index['collections']:
        if filtre_col and c['slug'] != filtre_col:
            continue
        d = json.loads((ROOT / c['fichier']).read_text(encoding='utf-8'))
        cols.append(d)
    return cols


def correction_pour(corrections, collection, numero):
    for c in corrections.values():
        if c['collection'] == collection and c['numero'] == numero:
            return c
    return {}


class Resolveur:
    def __init__(self):
        corrections = json.loads((ROOT / 'build' / 'corrections.json').read_text(encoding='utf-8'))
        self.par_num = {(c['collection'], c['numero']): c for c in corrections.values()}
        print('Indexation des images memo-app…')
        self.memo = il.index_memo()
        self.cache_wiki_fr = {}
        self.cache_wiki_en = {}
        self.cache_langlinks = {}

    # -- pré-chargements par collection (batch API)
    def precharger(self, d):
        titres = [c['titrePage'] for c in d['cartes']]
        filtrer = d['slug'] in ANIMAUX or d['slug'] not in (
            'coupes-du-monde-fifa',)
        self.cache_wiki_fr.update(il.wiki_images_batch(titres, 'fr.wikipedia.org', filtrer))
        manquants = [t for t in titres if t not in self.cache_wiki_fr]
        if manquants:
            self.cache_langlinks.update(il.langlinks_en(manquants))
            en_titres = [self.cache_langlinks[t] for t in manquants
                         if t in self.cache_langlinks]
            en_imgs = il.wiki_images_batch(en_titres, 'en.wikipedia.org', filtrer)
            for t in manquants:
                en = self.cache_langlinks.get(t)
                if en and en in en_imgs:
                    self.cache_wiki_en[t] = en_imgs[en]

    def memo_match(self, slug, carte):
        listes = MEMO_LISTES.get(slug, [])
        cles = [carte['nom'], carte['titrePage'],
                re.sub(r'\s*\([^)]*\)', '', carte['titrePage'])]
        # correspondances manuelles (sujets identiques, noms différents)
        ALIAS = {'les erinyes': 'tisiphone', 'erinyes': 'tisiphone'}
        cles += [ALIAS[il.norm(c)] for c in list(cles) if il.norm(c) in ALIAS]
        if slug == 'coupes-du-monde-fifa':
            m = re.search(r'(\d{4})', carte['titrePage'])
            if m:
                cles = [m.group(1)]
                listes = ['coupes_monde']
        for lid in listes:
            table = self.memo.get(lid, {})
            for cle in cles:
                hit = table.get(il.norm(cle))
                if hit:
                    return hit[0], f'memo:{lid}'
        return None, None

    def resoudre(self, d, carte):
        """Retourne (octets_image, source) selon la chaîne de priorité."""
        slug = d['slug']
        corr = self.par_num.get((d['collection'], carte['numero']), {})

        # 1. image imposée
        for cle_url in ('imageUrl', 'imageFallback'):
            if corr.get(cle_url) and cle_url == 'imageUrl':
                data = il.telecharger_image(corr['imageUrl'], min_cote=300)
                if data:
                    return data, 'imposée'

        # 2. memo-app (imposé par remarque OU correspondance automatique)
        chemin, src = self.memo_match(slug, carte)
        if chemin:
            try:
                return chemin.read_bytes(), src
            except Exception:
                pass
        # éléments chimiques lourds : tuile SVG memo rasterisée
        if slug == 'elements-chimiques' and corr.get('memoImage'):
            svg = il.memo_data_uri_svg('elements', carte['numero'])
            if svg:
                png = il.rasterizer_svg(svg)
                if png:
                    return png, 'memo:svg-element'
        if corr.get('imageFallback'):
            data = il.telecharger_image(corr['imageFallback'], min_cote=300)
            if data:
                return data, 'imposée-secours'

        # 3. sources spécialisées
        if slug == 'films-cultes' and TMDB_KEY:
            url = il.tmdb_poster(carte['nom'], TMDB_KEY) or \
                  il.tmdb_poster(carte['titrePage'], TMDB_KEY)
            if url:
                data = il.telecharger_image(url, min_cote=400, navigateur=False)
                if data:
                    return data, 'tmdb'
        if slug == 'constellations':
            en = self.cache_langlinks.get(carte['titrePage']) or \
                 il.langlinks_en([carte['titrePage']]).get(carte['titrePage'])
            if en:
                latin = re.sub(r'\s*\(constellation\)', '', en)
                url = il.commons_thumb(f'{latin} IAU.svg')
                if url:
                    data = il.telecharger_image(url, min_cote=500, navigateur=False)
                    if data:
                        return data, 'iau'
        if slug == 'jeux-video-cultes':
            en = self.cache_langlinks.get(carte['titrePage']) or \
                 il.langlinks_en([carte['titrePage']]).get(carte['titrePage'])
            if en:
                imgs = il.wiki_images_batch([en], 'en.wikipedia.org', filtrer=False)
                if en in imgs:
                    data = il.telecharger_image(imgs[en], min_cote=250, navigateur=False)
                    if data:
                        return data, 'wiki-en-cover'

        # 4. Wikipedia fr puis en
        url = self.cache_wiki_fr.get(carte['titrePage'])
        if url:
            data = il.telecharger_image(url, min_cote=450, navigateur=False)
            if data:
                return data, 'wiki-fr'
        url = self.cache_wiki_en.get(carte['titrePage'])
        if url:
            data = il.telecharger_image(url, min_cote=450, navigateur=False)
            if data:
                return data, 'wiki-en'

        # 5. recherche Bing (dernier recours)
        contexte = CONTEXTE_BING.get(slug, '')
        for req in (f"{carte['nom']} {contexte}", carte['titrePage']):
            for u in il.bing_images(req):
                data = il.telecharger_image(u, min_cote=500)
                if data:
                    return data, 'bing'
        return None, 'ECHEC'


def contact_sheet(d, resultats):
    esc = htmlmod.escape
    lignes = ''.join(f"""
      <div class="c"><img src="../../images/thumbs/{d['slug']}/{esc(c['id'].split('_', 1)[1])}.webp">
      <span>{esc(c['nom'])}</span><small>{esc(src)}</small></div>"""
      for c, src in resultats)
    (ROOT / 'build' / 'contact_sheets').mkdir(exist_ok=True)
    (ROOT / 'build' / 'contact_sheets' / f"{d['slug']}.html").write_text(f"""<!doctype html>
<meta charset="utf-8"><title>{esc(d['collection'])}</title>
<style>body{{background:#181822;color:#eee;font-family:sans-serif}}
.g{{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px}}
.c{{background:#242433;border-radius:8px;padding:6px;text-align:center}}
.c img{{width:100%;height:110px;object-fit:cover;border-radius:6px}}
.c span{{font-size:11px;display:block}}.c small{{color:#999;font-size:9px}}</style>
<h2>{esc(d['collection'])} ({len(resultats)})</h2><div class="g">{lignes}</div>""",
        encoding='utf-8')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--collection')
    ap.add_argument('--force', action='store_true')
    args = ap.parse_args()

    res = Resolveur()
    rapport_path = ROOT / 'build' / 'rapport_images.csv'
    sources_path = ROOT / 'build' / 'images_sources.json'
    sources = json.loads(sources_path.read_text(encoding='utf-8')) \
        if sources_path.exists() else {}

    for d in charger_cartes(args.collection):
        slug = d['slug']
        dossier_t = ROOT / 'images' / 'thumbs' / slug
        dossier_f = ROOT / 'images' / 'full' / slug
        dossier_t.mkdir(parents=True, exist_ok=True)
        dossier_f.mkdir(parents=True, exist_ok=True)
        print(f'== {slug} ({len(d["cartes"])} cartes)')
        res.precharger(d)
        resultats, echecs = [], 0
        for carte in d['cartes']:
            fslug = carte['id'].split('_', 1)[1]
            fic_t, fic_f = dossier_t / f'{fslug}.webp', dossier_f / f'{fslug}.webp'
            if fic_t.exists() and fic_f.exists() and not args.force:
                resultats.append((carte, sources.get(carte['id'], {}).get('source', 'existant')))
                continue
            data, src = res.resoudre(d, carte)
            if data:
                th, fu = il.to_thumb(data), il.to_full(data)
                if th and fu:
                    fic_t.write_bytes(th)
                    fic_f.write_bytes(fu)
                    sources[carte['id']] = {'source': src}
                    resultats.append((carte, src))
                    continue
            echecs += 1
            sources[carte['id']] = {'source': 'ECHEC'}
            resultats.append((carte, 'ECHEC'))
            print(f'  ✗ {carte["nom"]}')
        contact_sheet(d, resultats)
        sources_path.write_text(json.dumps(sources, ensure_ascii=False, indent=0),
                                encoding='utf-8')
        il.save_cache(force=True)
        from collections import Counter
        cnt = Counter(s for _, s in resultats)
        print(f'   {dict(cnt)}' + (f' — {echecs} ÉCHECS' if echecs else ''))

    with open(rapport_path, 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.writer(f, delimiter=';')
        w.writerow(['id', 'source'])
        for cid, v in sorted(sources.items()):
            w.writerow([cid, v['source']])
    print('Terminé. rapport_images.csv + contact_sheets/ écrits.')


if __name__ == '__main__':
    main()
