#!/usr/bin/env python3
"""Génère les données de combat (mode roguelike) pour les 2304 cartes :

  - tags automatiques Lieu (pays + continent) et Temps (période) via Wikidata,
    l'entité étant déterminée sans ambiguïté par le lien Wikipédia de la carte ;
  - palier de connexions (liens sortants de l'article) -> famille d'effet ;
  - pouvoir = déclencheur (collection) + famille (palier) + force (rareté +
    notoriété), rédigé en toutes lettres et découpé en sections modifiables ;
  - PV de combat (10-500 par pas de 10) selon rareté + notoriété.

Sorties : data/combat.json (config globale éditable) et champs `tags`,
`pouvoir`, `pvCombat`, `role` injectés dans data/<collection>.json.

Tout reste modifiable ensuite depuis l'atelier — ce script ne fait que la
première attribution (et ne réécrase jamais un champ marqué `manuel`).
"""
import sys, json, time, pickle, hashlib, re, urllib.parse, urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'build'))
import combat_config as cfg

UA = 'gacha-wikipedia-build/1.0 (projet perso; contact: claude.elk041@passmail.net)'
CACHE = ROOT / 'build' / '.cache_combat.pkl'
_cache = pickle.loads(CACHE.read_bytes()) if CACHE.exists() else {}
_sale = 0


def sauver_cache(force=False):
    global _sale
    if force or _sale >= 40:
        CACHE.write_bytes(pickle.dumps(_cache))
        _sale = 0


def get_json(url, essais=3):
    """Aucune mise en cache de la réponse brute : les réponses Wikidata
    (claims complets) pèsent plusieurs Mo. Seules les données EXTRAITES sont
    mises en cache, par les fonctions appelantes."""
    for i in range(essais):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                data = json.loads(r.read().decode('utf-8'))
            time.sleep(0.05)
            return data
        except Exception:
            time.sleep(1.5 * (i + 1))
    return None


# ------------------------------------------------------------ Wikidata

WD = 'https://www.wikidata.org/w/api.php'
PROPS_PAYS = ['P27', 'P17', 'P495']          # citoyenneté, pays, pays d'origine
PROPS_DATE = ['P569', 'P570', 'P571', 'P580', 'P582', 'P585', 'P577']


def _val_qid(claim):
    try:
        return claim['mainsnak']['datavalue']['value']['id']
    except Exception:
        return None


def _val_annee(claim):
    try:
        t = claim['mainsnak']['datavalue']['value']['time']   # ex : +1769-08-15T00:00:00Z
        m = re.match(r'([+-])(\d+)-', t)
        an = int(m.group(2))
        return -an if m.group(1) == '-' else an
    except Exception:
        return None


def clef(t):
    return (t or '').replace('_', ' ').strip().lower()


def entites_par_titres(titres):
    """{titre frwiki -> {qid, pays:[qid], annees:[int], periodes:[qid]}}
    Le rattachement titre->entité se fait par le sitelink frwiki renvoyé
    (sitefilter), jamais par l'ordre des résultats qui n'est pas garanti."""
    global _sale
    out = {}
    restants = []
    for t in titres:                       # cache par titre (données extraites)
        c = _cache.get('ent:' + clef(t))
        if c is not None:
            out[clef(t)] = c
        else:
            restants.append(t)
    for i in range(0, len(restants), 50):
        lot = restants[i:i + 50]
        url = (WD + '?action=wbgetentities&format=json&sites=frwiki'
               '&props=claims|sitelinks&sitefilter=frwiki&titles='
               + urllib.parse.quote('|'.join(lot)))
        d = get_json(url)
        for t in lot:                      # mémorise même les absences
            _cache.setdefault('ent:' + clef(t),
                              {'qid': None, 'pays': [], 'annees': [], 'periodes': []})
        if not d or 'entities' not in d:
            continue
        for qid, ent in d['entities'].items():
            if qid.startswith('-') or 'claims' not in ent:
                continue
            titre = ((ent.get('sitelinks') or {}).get('frwiki') or {}).get('title')
            if not titre:
                continue
            cl = ent.get('claims', {})
            pays = []
            for p in PROPS_PAYS:
                for c in cl.get(p, []):
                    q = _val_qid(c)
                    if q and q not in pays:
                        pays.append(q)
            annees = []
            for p in PROPS_DATE:
                for c in cl.get(p, []):
                    a = _val_annee(c)
                    if a is not None:
                        annees.append(a)
            periodes = [q for c in cl.get('P2348', []) if (q := _val_qid(c))]
            info = {'qid': qid, 'pays': pays, 'annees': annees,
                    'periodes': periodes}
            out[clef(titre)] = info
            _cache['ent:' + clef(titre)] = info
        _sale += 5
        sauver_cache()
    sauver_cache(force=True)
    return out


def libelles_et_continents(qids):
    """{qid -> (libelle_fr, continent_libelle|None)} pour les pays/périodes."""
    infos, besoin_continent = {}, {}
    restants = []
    for q in [q for q in qids if q]:
        c = _cache.get('lib:' + q)
        if c is not None:
            infos[q] = list(c)
        else:
            restants.append(q)
    for i in range(0, len(restants), 50):
        lot = restants[i:i + 50]
        url = (WD + '?action=wbgetentities&format=json&props=labels|claims'
               '&languages=fr&ids=' + '|'.join(lot))
        d = get_json(url)
        if not d:
            continue
        for qid, ent in (d.get('entities') or {}).items():
            lib = (ent.get('labels', {}).get('fr') or {}).get('value')
            cont_qid = None
            for c in ent.get('claims', {}).get('P30', []):
                cont_qid = _val_qid(c)
                break
            infos[qid] = [lib, None]
            if cont_qid:
                besoin_continent[qid] = cont_qid
    # libellés des continents
    cq = list({v for v in besoin_continent.values()})
    libs_cont = {}
    for i in range(0, len(cq), 50):
        lot = cq[i:i + 50]
        d = get_json(WD + '?action=wbgetentities&format=json&props=labels'
                     '&languages=fr&ids=' + '|'.join(lot))
        for qid, ent in ((d or {}).get('entities') or {}).items():
            libs_cont[qid] = (ent.get('labels', {}).get('fr') or {}).get('value')
    for qid, cqid in besoin_continent.items():
        if qid in infos:
            infos[qid][1] = libs_cont.get(cqid)
    for q in restants:                     # cache des données extraites
        _cache['lib:' + q] = infos.get(q, [None, None])
    sauver_cache(force=True)
    return infos


# ------------------------------------------------------------ tags Temps

ROMAINS = ['', 'Ier', 'IIe', 'IIIe', 'IVe', 'Ve', 'VIe', 'VIIe', 'VIIIe', 'IXe',
           'Xe', 'XIe', 'XIIe', 'XIIIe', 'XIVe', 'XVe', 'XVIe', 'XVIIe',
           'XVIIIe', 'XIXe', 'XXe', 'XXIe', 'XXIIe']


def tag_periode(an):
    """Granularité variable selon l'ancienneté (spec 2.2)."""
    if an >= 1920:
        return f'Années {an // 10 * 10}'
    if an >= 1000:
        return f'{ROMAINS[(an - 1) // 100 + 1]} siècle'
    if an >= 500:
        return 'Haut Moyen Âge'
    if an >= 0:
        return 'Antiquité tardive'
    if an >= -500:
        return 'Antiquité classique'
    if an >= -1000:
        return 'Haute Antiquité'
    if an >= -1200:
        return 'Âge du fer'
    if an >= -3300:
        return 'Âge du bronze'
    return 'Préhistoire'


def tags_temps(annees):
    """Tous les paliers couverts par la plage (Napoléon -> XVIIIe ET XIXe).
    On échantillonne les bornes + chaque frontière de décennie/siècle."""
    if not annees:
        return []
    a, b = min(annees), max(annees)
    if b - a > 2000:                 # plage aberrante : on garde la fin
        return [tag_periode(b)]
    points = {a, b}
    y = max(a, 1920) // 10 * 10      # décennies (à partir de 1920)
    while y <= b:
        if y >= a:
            points.add(y)
        y += 10
    y = (a // 100) * 100             # siècles
    while y <= b:
        points.add(max(a, y))
        y += 100
    tags = []
    for p in sorted(points):
        t = tag_periode(p)
        if t not in tags:
            tags.append(t)
    return tags[:6]


# ------------------------------------------------------------ liens sortants

def nb_liens(titre):
    """Compte les liens sortants. On ne met en cache QUE le nombre : garder les
    500 titres de chaque réponse ferait exploser le cache (237 Mo) et la RAM."""
    global _sale
    cle = 'liens:' + titre
    if cle in _cache:
        return _cache[cle]
    url = ('https://fr.wikipedia.org/w/api.php?action=query&format=json'
           '&redirects=1&prop=links&pllimit=max&titles=' + urllib.parse.quote(titre))
    d = None
    for i in range(3):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                d = json.loads(r.read().decode('utf-8'))
            break
        except Exception:
            time.sleep(1.5 * (i + 1))
    n = 0
    if d:
        pages = (d.get('query') or {}).get('pages') or {}
        n = sum(len(p.get('links', [])) for p in pages.values())
        if d.get('continue'):
            n = max(n, 500)      # au-delà du plafond anonyme : palier maximal
    _cache[cle] = n
    _sale += 1
    sauver_cache()
    time.sleep(0.05)
    return n


def palier_de(n):
    palier = 'faible'
    for nom, seuil in cfg.PALIERS_LIENS:
        if n >= seuil:
            palier = nom
    return palier


# ------------------------------------------------------------ pouvoirs

def hash_int(s):
    return int(hashlib.md5(s.encode('utf-8')).hexdigest()[:8], 16)


def valeur_force(carte, famille, position):
    """position 0..1 = notoriété relative dans sa collection (facteur fin)."""
    table = cfg.FORCE_CONTINUE if famille['type'] == 'continue' else cfg.FORCE_DISCRETE
    lo, hi = table.get(carte['rarete'], [1, 1])
    v = lo + (hi - lo) * position
    return round(v) if famille['type'] == 'discrete' else int(round(v))


def texte_pouvoir(declencheur, famille, valeur):
    effet = famille['gabarit'].format(valeur=valeur, unite=famille['unite'])
    return f'{declencheur[0].upper()}{declencheur[1:]}, {effet}.'


# ------------------------------------------------------------ programme

def main():
    idx = json.loads((ROOT / 'data' / 'collections.json').read_text(encoding='utf-8'))
    familles_par_palier = {}
    for f in cfg.FAMILLES:
        familles_par_palier.setdefault(f['palier'], []).append(f)

    # 1) toutes les cartes + leurs titres Wikipédia
    cols = []
    for c in idx['collections']:
        d = json.loads((ROOT / c['fichier']).read_text(encoding='utf-8'))
        cols.append(d)
    toutes = [(d, carte) for d in cols for carte in d['cartes']]
    print(f'{len(toutes)} cartes')

    titres = []
    for _, carte in toutes:
        lien = carte.get('lienWikipedia') or ''
        t = urllib.parse.unquote(lien.split('/wiki/')[-1]).replace('_', ' ') if lien else ''
        carte['_titreWiki'] = t
        if t:
            titres.append(t)

    # 2) Wikidata : entités -> pays / dates / périodes
    print('Wikidata : entités…')
    ents = entites_par_titres(sorted(set(titres)))
    print(f'  {len(ents)} entités résolues')
    qids = {q for e in ents.values() for q in e['pays']} | \
           {q for e in ents.values() for q in e['periodes']}
    print(f'Wikidata : libellés + continents ({len(qids)} entités)…')
    infos = libelles_et_continents(sorted(qids))

    # 3) liens sortants (palier de famille d'effet)
    print('Wikipédia : liens sortants…')
    liens = {}
    for i, t in enumerate(sorted(set(titres)), 1):
        liens[t] = nb_liens(t)
        if i % 200 == 0:
            print(f'  … {i}/{len(set(titres))}')
            sauver_cache(force=True)
    sauver_cache(force=True)

    # 4) attribution carte par carte
    registre = set()
    for d in cols:
        slug = d['slug']
        role = cfg.ROLES.get(slug, 'attaque')
        decl = cfg.DECLENCHEURS.get(slug, 'au début du combat')
        vues = sorted({c.get('pageviews', 0) for c in d['cartes']})
        for carte in d['cartes']:
            t = carte.pop('_titreWiki', '')
            e = ents.get(clef(t), {})

            # --- tags Lieu / Temps
            tags = []
            for q in e.get('pays', [])[:1]:
                lib, cont = infos.get(q, [None, None])
                if lib:
                    tags.append(lib)
                if cont:
                    tags.append(cont)
            tags += tags_temps(e.get('annees', []))
            for q in e.get('periodes', []):
                lib = infos.get(q, [None, None])[0]
                if lib and lib not in tags:
                    tags.append(lib)
            tags = [x for x in dict.fromkeys(tags) if x]

            # --- pouvoir
            n = liens.get(t, 0)
            palier = palier_de(n)
            choix = familles_par_palier.get(palier) or cfg.FAMILLES
            famille = choix[hash_int(carte['id']) % len(choix)]
            position = (vues.index(carte.get('pageviews', 0)) / max(1, len(vues) - 1)) if len(vues) > 1 else 0.5
            valeur = valeur_force(carte, famille, position)

            # ne jamais écraser ce que l'utilisateur a réglé à la main
            if not carte.get('tagsManuel'):
                carte['tags'] = tags
            if not carte.get('pouvoirManuel'):
                carte['pouvoir'] = {
                    'declencheur': decl, 'familleId': famille['id'],
                    'valeur': valeur, 'unite': famille['unite'],
                    'texte': texte_pouvoir(decl, famille, valeur),
                }
            if not carte.get('pvCombatManuel'):
                lo, hi = cfg.PV_COMBAT.get(carte['rarete'], [10, 500])
                carte['pvCombat'] = int(round((lo + (hi - lo) * position) / 10) * 10)
            carte['role'] = role
            carte['liensSortants'] = n
            registre.update(carte.get('tags', []))

        (ROOT / 'data' / f'{slug}.json').write_text(
            json.dumps(d, ensure_ascii=False), encoding='utf-8')

    # 5) config globale
    combat = {
        'version': 1,
        'roles': {d['slug']: cfg.ROLES.get(d['slug'], 'attaque') for d in cols},
        'declencheurs': {d['slug']: cfg.DECLENCHEURS.get(d['slug'], 'au début du combat') for d in cols},
        'catalogueDeclencheurs': cfg.CATALOGUE_DECLENCHEURS,
        'familles': cfg.FAMILLES,
        'paliersLiens': cfg.PALIERS_LIENS,
        'forceContinue': cfg.FORCE_CONTINUE,
        'forceDiscrete': cfg.FORCE_DISCRETE,
        'pvCombat': cfg.PV_COMBAT,
        'tagsRegistre': sorted(registre),
    }
    (ROOT / 'data' / 'combat.json').write_text(
        json.dumps(combat, ensure_ascii=False, indent=1), encoding='utf-8')

    sans_tag = sum(1 for _, c in toutes if not c.get('tags'))
    print(f'\nOK — {len(registre)} tags distincts, {sans_tag} cartes sans tag')
    from collections import Counter
    cnt = Counter(c['pouvoir']['familleId'] for _, c in toutes if c.get('pouvoir'))
    print('familles :', dict(cnt.most_common(8)))


if __name__ == '__main__':
    main()
