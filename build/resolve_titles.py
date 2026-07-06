#!/usr/bin/env python3
"""Étape 1 — Résolution des titres Wikipedia fr pour les 2 328 cartes.

Lit collections-gacha-wikipedia.xlsx, résout chaque nom d'usage vers le titre
exact de l'article fr.wikipedia.org, et produit :
  - build/resolution.json   (résultats machine, consommés par l'étape 2)
  - build/audit.html        (rapport d'audit visuel à vérifier)
  - build/audit.csv         (équivalent tableur)

overrides.json a toujours priorité : { "Collection|Nom Excel": "Titre exact" }
(clé alternative acceptée : "Nom Excel" seul, si non ambigu).

Rejouable : cache HTTP sur disque (.cache.pkl), aucune requête n'est refaite.
"""
import sys, os, json, csv, time, pickle, re, unicodedata, html as htmlmod
import urllib.request, urllib.parse
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / 'build'
XLSX = Path(r'C:\Users\flxjr\Downloads\collections-gacha-wikipedia.xlsx')
API = 'https://fr.wikipedia.org/w/api.php'
UA = 'gacha-wikipedia-build/1.0 (projet perso; contact: claude.elk041@passmail.net)'
CACHE_PATH = BUILD / '.cache.pkl'
SLEEP = 0.08          # pause de politesse entre requêtes non cachées
BATCH = 20            # limite exlimit de l'API extracts

# ---------------------------------------------------------------- cache HTTP

_cache = {}
_cache_dirty = 0

def load_cache():
    global _cache
    if CACHE_PATH.exists():
        try:
            _cache = pickle.loads(CACHE_PATH.read_bytes())
        except Exception:
            _cache = {}

def save_cache(force=False):
    global _cache_dirty
    if force or _cache_dirty >= 25:
        CACHE_PATH.write_bytes(pickle.dumps(_cache))
        _cache_dirty = 0

def api_get(params):
    """GET sur l'API MediaWiki fr, JSON décodé, avec cache disque + retries."""
    global _cache_dirty
    params = dict(params, format='json', formatversion=2)
    url = API + '?' + urllib.parse.urlencode(params)
    if url in _cache:
        return _cache[url]
    last_err = None
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                data = json.loads(r.read().decode('utf-8'))
            _cache[url] = data
            _cache_dirty += 1
            save_cache()
            time.sleep(SLEEP)
            return data
        except Exception as e:
            last_err = e
            time.sleep(2 * (attempt + 1))
    print(f'  !! échec réseau définitif : {last_err} — {url[:120]}')
    return None

# ---------------------------------------------------------------- normalisation

def strip_accents(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s)
                   if unicodedata.category(c) != 'Mn')

def norm(s):
    s = strip_accents(str(s or '')).lower()
    s = re.sub(r"['’ʼ-]", ' ', s)
    s = re.sub(r'[^a-z0-9 ]', '', s)
    return re.sub(r'\s+', ' ', s).strip()

def base_title(t):
    """Titre sans qualificatif parenthésé final : 'Titan (lune)' -> 'Titan'."""
    return re.sub(r'\s*\([^)]*\)\s*$', '', t)

def slugify(s):
    s = strip_accents(str(s)).lower()
    s = re.sub(r'[^a-z0-9]+', '-', s)
    return s.strip('-')

# ---------------------------------------------------------------- contexte de collection

# Indice de contexte ajouté à la recherche quand le nom seul est ambigu.
HINTS = {
    'Merveilles du monde': 'merveille du monde',
    'Pilotes F1 champions du monde': 'pilote de Formule 1',
    'Elements chimiques': 'élément chimique',
    'Corps celestes': 'astronomie corps céleste',
    'Dieux et figures mythologiques grecques': 'mythologie grecque',
    'Grands dirigeants': 'dirigeant chef d’État histoire',
    'Constellations': 'constellation',
    'Monuments emblematiques': 'monument',
    'Dynasties et empires historiques': 'empire dynastie histoire',
    'Grandes batailles historiques': 'bataille',
    'Grandes guerres': 'guerre conflit',
    'Dinosaures celebres': 'dinosaure',
    'Grands explorateurs': 'explorateur',
    'Auteurs celebres': 'écrivain auteur littérature',
    'Scientifiques celebres': 'scientifique',
    'Grands peintres': 'peintre',
    'Tableaux celebres': 'tableau peinture',
    'Inventions importantes': 'invention technologie',
    'Aviateurs celebres': 'aviateur aviation',
    'Mammiferes': 'mammifère animal',
    'Oiseaux': 'oiseau',
    'Reptiles et amphibiens': 'reptile amphibien',
    'Poissons et vie marine': 'poisson animal marin',
    'Insectes': 'insecte',
    'Races de chien': 'race de chien',
    'Coupes du monde FIFA': 'Coupe du monde de football',
    'Plus grands joueurs de football': 'footballeur',
    'Mythologies du monde (hors Grece)': 'mythologie divinité',
    'Creatures et legendes': 'créature légendaire folklore',
    'Personnages de fiction celebres': 'personnage de fiction',
    'Jeux video cultes': 'jeu vidéo',
    'Films cultes': 'film',
}

# Qualificatifs parenthésés à essayer quand le sujet résolu semble hors-collection
# (ex : "Lion" dans Constellations -> "Lion (constellation)").
QUALIFIERS = {
    'Constellations': ['constellation'],
    'Corps celestes': ['lune', 'planète', 'planète naine', 'étoile',
                       'comète', 'astéroïde'],
    'Films cultes': ['film'],
    'Jeux video cultes': ['jeu vidéo', 'série de jeux vidéo'],
    'Personnages de fiction celebres': ['personnage'],
    'Tableaux celebres': ['tableau', 'peinture'],
    'Creatures et legendes': ['créature', 'mythologie', 'folklore', 'légende'],
    'Dieux et figures mythologiques grecques': ['mythologie'],
    'Mythologies du monde (hors Grece)': ['mythologie', 'dieu', 'déesse'],
}

# Mots-clés attendus dans l'extrait (accents ignorés). Si aucun n'apparaît,
# la carte est signalée "sujet douteux" et une requalification est tentée.
EXPECT = {
    'Pilotes F1 champions du monde': ['pilote', 'formule 1'],
    'Elements chimiques': ['chimique', 'element', 'atome', 'metal', 'gaz'],
    'Corps celestes': ['lune', 'planete', 'etoile', 'asteroide', 'comete',
                       'satellite', 'galaxie', 'naine', 'soleil', 'nebuleuse',
                       'amas', 'trou noir', 'ceinture', 'systeme solaire'],
    'Dieux et figures mythologiques grecques':
        ['mythologie', 'dieu', 'deesse', 'divinite', 'heros', 'titan',
         'nymphe', 'muse', 'gorgone', 'centaure', 'oracle', 'grec'],
    'Constellations': ['constellation'],
    'Grandes batailles historiques': ['bataille', 'siege', 'guerre',
                                      'operation', 'debarquement', 'affrontement'],
    'Grandes guerres': ['guerre', 'conflit', 'revolte', 'revolution', 'croisade'],
    'Dinosaures celebres': ['dinosaure', 'genre', 'fossile', 'cretace',
                            'jurassique', 'trias', 'reptile', 'especes', 'theropode'],
    'Grands explorateurs': ['explorateur', 'explorat', 'navigateur', 'astronaute',
                            'cosmonaute', 'expedition', 'voyageur', 'conquistador',
                            'alpiniste', 'aventurier'],
    'Auteurs celebres': ['ecrivain', 'auteur', 'autrice', 'poete', 'romancier',
                         'dramaturge', 'philosophe', 'litterature', 'romanciere'],
    'Scientifiques celebres': ['physicien', 'chimiste', 'mathematicien',
        'biologiste', 'astronome', 'scientifique', 'medecin', 'naturaliste',
        'informaticien', 'ingenieur', 'inventeur', 'economiste', 'psych',
        'neuro', 'geneticien', 'paleontologue', 'geologue', 'astrophysicien',
        'savant', 'physicienne', 'chercheu', 'anthropologue', 'ethologue',
        'primatologue', 'oceanographe', 'botaniste', 'zoologiste', 'logicien'],
    'Grands peintres': ['peintre', 'artiste', 'peinture'],
    'Tableaux celebres': ['tableau', 'peinture', 'toile', 'huile', 'fresque',
                          'panneau', 'estampe', 'oeuvre'],
    'Aviateurs celebres': ['aviateur', 'aviatrice', 'pilote', 'astronaute',
                           'cosmonaute', 'spationaute', 'aeronaute', 'aviation'],
    'Mammiferes': ['mammifere', 'espece', 'famille', 'genre', 'carnivore',
                   'rongeur', 'primate', 'cetace', 'marsupial', 'felin'],
    'Oiseaux': ['oiseau', 'espece', 'passereau', 'rapace', 'famille', 'genre'],
    'Reptiles et amphibiens': ['reptile', 'amphibien', 'serpent', 'lezard',
        'tortue', 'grenouille', 'espece', 'crocodil', 'salamandre', 'crapaud',
        'gecko', 'vipere', 'famille', 'genre'],
    'Poissons et vie marine': ['poisson', 'marin', 'requin', 'espece', 'mer',
        'ocean', 'cetace', 'mollusque', 'crustace', 'famille', 'genre',
        'corail', 'meduse', 'cephalopode', 'aquatique'],
    'Insectes': ['insecte', 'espece', 'papillon', 'coleoptere', 'fourmi',
                 'abeille', 'famille', 'genre', 'larve', 'arthropode'],
    'Races de chien': ['chien', 'race', 'berger', 'chasse', 'canine'],
    'Coupes du monde FIFA': ['coupe du monde', 'football'],
    'Plus grands joueurs de football': ['football', 'footballeur'],
    'Mythologies du monde (hors Grece)': ['mytholog', 'dieu', 'deesse',
                                          'divinite', 'religion', 'folklore'],
    'Creatures et legendes': ['creature', 'legend', 'mytholog', 'folklore',
                              'monstre', 'cryptide', 'fantastique', 'esprit'],
    'Personnages de fiction celebres': ['personnage', 'heros', 'fiction',
        'super-heros', 'protagoniste', 'serie', 'film', 'roman', 'bande dessinee',
        'jeu video', 'manga', 'dessin anime'],
    'Jeux video cultes': ['jeu video', 'jeux video'],
    'Films cultes': ['film'],
    'Dynasties et empires historiques': ['empire', 'dynastie', 'royaume',
        'califat', 'civilisation', 'etat', 'monarchie', 'sultanat', 'khanat',
        'republique', 'periode'],
    'Grands dirigeants': ['roi', 'reine', 'empereur', 'president', 'dirigeant',
        'homme d etat', 'femme d etat', 'chef', 'pharaon', 'tsar', 'sultan',
        'chancelier', 'premier ministre', 'general', 'imperatrice', 'monarque',
        'conquerant', 'khan', 'calife', 'duc', 'prince', 'politique', 'militaire',
        'regne', 'regna', 'fondateur', 'unificateur', 'shogun', 'consul'],
}

def extract_ok(extract, collection):
    """Vrai si l'extrait contient un mot-clé attendu (début de mot, accents
    ignorés) — évite les faux positifs en sous-chaîne ('kan' ≠ 'Ouzbékistan')."""
    kws = EXPECT.get(collection)
    if not kws or not extract:
        return True
    e = re.sub(r"['’]", ' ', strip_accents(extract).lower())
    return any(re.search(r'\b' + re.escape(strip_accents(k).lower()), e)
               for k in kws)

# ---------------------------------------------------------------- lecture Excel

def read_entries():
    import openpyxl
    wb = openpyxl.load_workbook(XLSX, read_only=True)
    ws = wb['Cartes']
    entries = []
    for i, r in enumerate(ws.iter_rows(values_only=True)):
        if i == 0 or not r[3]:
            continue
        entries.append({
            'collection': str(r[0]).strip(),
            'groupe': str(r[1] or '').strip(),
            'numero': int(r[2]),
            'nom': str(r[3]).strip(),
        })
    return entries

# ---------------------------------------------------------------- requêtes wiki

META_PROPS = dict(
    action='query', redirects=1,
    prop='extracts|pageimages|pageprops|info',
    exintro=1, explaintext=1, exsentences=3, exlimit='max',
    pithumbsize=160, ppprop='disambiguation', inprop='url',
)

def fetch_meta(titles):
    """Interroge l'API par lots de BATCH titres.
    Retourne { titre_demandé: page_dict | None }  (None = page inexistante).
    page_dict : title (canonique), extract, thumb, disambig, url."""
    out = {}
    titles = [t for t in titles if t]
    for i in range(0, len(titles), BATCH):
        chunk = titles[i:i + BATCH]
        data = api_get(dict(META_PROPS, titles='|'.join(chunk)))
        if not data:
            for t in chunk:
                out[t] = None
            continue
        q = data.get('query', {})
        # chaîne demandé -> normalisé -> redirigé -> titre final
        mapping = {}
        for m in q.get('normalized', []):
            mapping[m['from']] = m['to']
        redir = {m['from']: m['to'] for m in q.get('redirects', [])}
        pages = {p['title']: p for p in q.get('pages', [])}
        for t in chunk:
            final = mapping.get(t, t)
            seen = set()
            while final in redir and final not in seen:
                seen.add(final)
                final = redir[final]
            p = pages.get(final)
            if not p or p.get('missing'):
                out[t] = None
            else:
                out[t] = {
                    'title': p['title'],
                    'extract': (p.get('extract') or '').strip(),
                    'thumb': (p.get('thumbnail') or {}).get('source', ''),
                    'disambig': 'disambiguation' in (p.get('pageprops') or {}),
                    'url': p.get('fullurl') or
                           'https://fr.wikipedia.org/wiki/' +
                           urllib.parse.quote(p['title'].replace(' ', '_')),
                }
    return out

def search(query, limit=5):
    data = api_get(dict(action='query', list='search', srsearch=query,
                        srlimit=limit, srnamespace=0))
    if not data:
        return []
    return [h['title'] for h in data.get('query', {}).get('search', [])]

# ---------------------------------------------------------------- résolution

def pick_search_candidate(name, hits):
    """Choisit un candidat parmi les résultats de recherche sur le nom seul.
    Retourne (titre, confiance) ; confiance : 'exact' | 'parens' | None."""
    n = norm(name)
    exact = [h for h in hits if norm(h) == n]
    if exact:
        return exact[0], 'exact'
    parens = [h for h in hits if norm(base_title(h)) == n]
    if len(parens) == 1:
        return parens[0], 'parens'
    return None, None

def best_overlap(name, hits):
    """Meilleur hit par recouvrement de mots avec le nom (ordre stable en cas
    d'égalité : premier de la liste). Retourne (titre|None, score)."""
    tokens = set(norm(name).split())
    if not tokens:
        return None, 0.0
    best, best_s = None, 0.0
    for h in hits:
        ht = set(norm(base_title(h)).split()) | set(norm(h).split())
        s = len(tokens & ht) / len(tokens)
        if s > best_s:
            best, best_s = h, s
    return best, best_s

def resolve_all(entries, overrides):
    # Passe 1 : lookup direct par lot sur les noms Excel bruts
    names = sorted({e['nom'] for e in entries})
    print(f'Passe 1 — lookup direct de {len(names)} noms…')
    direct = fetch_meta(names)

    # Passe 2 : recherche pour les non-résolus / homonymies / overrides
    print('Passe 2 — recherches de secours…')
    candidates = {}   # (collection, nom) -> (titre_candidat, methode)
    need_meta = set()
    for k, e in enumerate(entries):
        key = f"{e['collection']}|{e['nom']}"
        ov = overrides.get(key) or overrides.get(e['nom'])
        if ov:
            candidates[(e['collection'], e['nom'])] = (ov, 'override')
            need_meta.add(ov)
            continue
        d = direct.get(e['nom'])
        if d and not d['disambig']:
            continue  # résolu en passe 1
        hint = HINTS.get(e['collection'], '')
        hits = search(e['nom'])
        cand, conf = pick_search_candidate(e['nom'], hits)
        if cand and conf == 'exact' and not (d and d['disambig']):
            method = 'search'
        else:
            hits2 = search(f"{e['nom']} {hint}") if hint else []
            cand2, conf2 = pick_search_candidate(e['nom'], hits2)
            if cand2:
                cand, method = cand2, 'search-hint'
            elif cand:
                method = 'search-parens' if conf == 'parens' else 'search'
            else:
                # aucun match exact : meilleur recouvrement de mots,
                # recherche contextuelle prioritaire à score égal
                b, s = best_overlap(e['nom'], hits2 + hits)
                if b:
                    cand, method = b, 'search-overlap'
                else:
                    cand, method = (hits2 + hits or [None])[0], \
                                   'search-top' if (hits2 + hits) else 'introuvable'
        if cand:
            candidates[(e['collection'], e['nom'])] = (cand, method)
            need_meta.add(cand)
        else:
            candidates[(e['collection'], e['nom'])] = (None, 'introuvable')
        if (k + 1) % 100 == 0:
            print(f'  … {k + 1}/{len(entries)}')

    # Passe 3 : métadonnées des candidats issus de la recherche
    print(f'Passe 3 — métadonnées de {len(need_meta)} candidats…')
    cand_meta = fetch_meta(sorted(need_meta))

    # Passe 3b : réparation des candidats tombés sur une page d'homonymie
    print('Passe 3b — réparation des homonymies…')
    repair_cand = {}
    for e in entries:
        key = (e['collection'], e['nom'])
        if key not in candidates:
            continue
        cand, method = candidates[key]
        meta = cand_meta.get(cand) if cand else None
        if not (meta and meta['disambig']) or method == 'override':
            continue
        hint = HINTS.get(e['collection'], '')
        bad = {norm(cand), norm(meta['title'])}
        hits = [h for h in (search(f"{e['nom']} {hint}", 8) + search(e['nom'], 8))
                if norm(h) not in bad]
        b, s = best_overlap(e['nom'], hits)
        alt = b or (hits[0] if hits else None)
        if alt:
            repair_cand[key] = alt
    metas2 = fetch_meta(sorted(set(repair_cand.values())))
    for key, alt in repair_cand.items():
        m = metas2.get(alt)
        if m and not m['disambig']:
            candidates[key] = (alt, 'search-repair')
            cand_meta[alt] = m

    # Assemblage
    results = []
    for e in entries:
        key = (e['collection'], e['nom'])
        d = direct.get(e['nom'])
        if key in candidates:
            cand, method = candidates[key]
            meta = cand_meta.get(cand) if cand else None
        else:
            cand, method, meta = e['nom'], 'direct', d

        statut = 'ok'
        note = ''
        if meta is None:
            statut, note = 'echec', 'page introuvable'
        elif meta['disambig']:
            statut, note = 'verifier', "page d'homonymie"
        elif method in ('search-hint', 'search-overlap', 'search-top',
                        'search-parens', 'search-repair'):
            statut, note = 'verifier', 'résolution par recherche contextuelle'
        elif not meta['extract']:
            statut, note = 'verifier', 'extrait vide'
        elif method == 'direct' and meta['title'] != e['nom']:
            note = 'redirection suivie'

        results.append({
            **e,
            'titre': meta['title'] if meta else '',
            'methode': method,
            'statut': statut,
            'note': note,
            'extrait': (meta['extract'] if meta else '')[:500],
            'thumb': meta['thumb'] if meta else '',
            'url': meta['url'] if meta else '',
            'image_absente': bool(meta and not meta['thumb']),
        })

    # Passe 4 : validation par mot-clé + requalification automatique.
    # Une carte dont l'extrait ne contient aucun mot-clé attendu pour sa
    # collection est suspecte : on tente "Nom (qualificatif)" puis une
    # recherche contextuelle validée par mot-clé avant de la signaler.
    print('Passe 4 — validation par mots-clés et requalification…')
    # Un nom Excel déjà qualifié ("Solaris (film, 1972)") est considéré comme
    # précis : jamais de remplacement automatique, au plus un signalement.
    suspects = [r for r in results if r['titre'] and r['methode'] != 'override'
                and not extract_ok(r['extrait'], r['collection'])
                and '(' not in r['nom']]
    for r in results:
        if r['titre'] and '(' in r['nom'] and r['methode'] != 'override' \
                and not extract_ok(r['extrait'], r['collection']) \
                and r['statut'] == 'ok':
            r['statut'] = 'verifier'
            r['note'] = (r['note'] + ' ; ' if r['note'] else '') + \
                        'sujet douteux (extrait sans mot-clé de la collection)'
    print(f'  {len(suspects)} cartes sans mot-clé attendu')
    trials = {}   # id(entry-résultat) -> [titres candidats ordonnés]
    all_titles = set()
    for r in suspects:
        cands = []
        for q in QUALIFIERS.get(r['collection'], []):
            for base in dict.fromkeys([r['nom'], base_title(r['titre'])]):
                cands.append(f'{base} ({q})')
        hint = HINTS.get(r['collection'], '')
        if hint:
            cands += [h for h in search(f"{r['nom']} {hint}", 6)
                      if h != r['titre']][:5]
        cands = list(dict.fromkeys(cands))
        trials[id(r)] = cands
        all_titles.update(cands)
    metas4 = fetch_meta(sorted(all_titles)) if all_titles else {}
    fixed = 0
    for r in suspects:
        # Un remplaçant n'est accepté que s'il porte le même nom de base que
        # la carte (éventuellement qualifié) — jamais un sujet différent.
        same_base = {norm(r['nom']), norm(base_title(r['titre']))}
        replaced = False
        for c in trials[id(r)]:
            m = metas4.get(c)
            if not m or m['disambig'] or not m['extract']:
                continue
            if norm(base_title(m['title'])) not in same_base and \
               norm(base_title(c)) not in same_base:
                continue
            if extract_ok(m['extract'], r['collection']):
                r.update(titre=m['title'], extrait=m['extract'][:500],
                         thumb=m['thumb'], url=m['url'],
                         image_absente=not m['thumb'],
                         methode='requalifie', statut='verifier',
                         note='requalifié par contexte de collection')
                fixed += 1
                replaced = True
                break
        if not replaced:
            r['statut'] = 'verifier'
            r['note'] = (r['note'] + ' ; ' if r['note'] else '') + \
                        'sujet douteux (extrait sans mot-clé de la collection)'
    print(f'  {fixed} cartes requalifiées automatiquement')

    # Doublons inter/intra-collections sur le titre canonique résolu
    seen = {}
    for r in results:
        if not r['titre']:
            continue
        seen.setdefault(r['titre'], []).append(r)
    for title, rs in seen.items():
        if len(rs) > 1:
            where = ', '.join(f"{r['collection']}#{r['numero']}" for r in rs)
            for r in rs:
                r['statut'] = 'verifier' if r['statut'] == 'ok' else r['statut']
                r['note'] = (r['note'] + ' ; ' if r['note'] else '') + \
                            f'DOUBLON : même page que {where}'
    return results

# ---------------------------------------------------------------- sorties

def write_outputs(results):
    (BUILD / 'resolution.json').write_text(
        json.dumps(results, ensure_ascii=False, indent=1), encoding='utf-8')

    with open(BUILD / 'audit.csv', 'w', newline='', encoding='utf-8-sig') as f:
        w = csv.writer(f, delimiter=';')
        w.writerow(['collection', 'numero', 'nom_excel', 'titre_resolu',
                    'statut', 'methode', 'note', 'extrait', 'url'])
        for r in results:
            w.writerow([r['collection'], r['numero'], r['nom'], r['titre'],
                        r['statut'], r['methode'], r['note'],
                        r['extrait'], r['url']])

    # ---- rapport HTML
    esc = htmlmod.escape
    counts = {'ok': 0, 'verifier': 0, 'echec': 0}
    for r in results:
        counts[r['statut']] += 1
    by_col = {}
    for r in results:
        by_col.setdefault(r['collection'], []).append(r)

    parts = ["""<!doctype html><html lang="fr"><meta charset="utf-8">
<title>Audit résolution des titres — Gacha Wikipedia</title>
<style>
 body{font-family:system-ui,sans-serif;margin:20px;background:#f7f7f9;color:#1c1c28}
 h1{font-size:22px} h2{font-size:17px;margin:8px 0}
 .resume{position:sticky;top:0;background:#fff;border:1px solid #ddd;border-radius:8px;
   padding:10px 16px;margin-bottom:18px;box-shadow:0 2px 6px rgba(0,0,0,.06);z-index:5}
 .pill{display:inline-block;border-radius:12px;padding:2px 10px;margin-right:8px;
   font-size:13px;font-weight:600;color:#fff}
 .p-ok{background:#2e9e5b}.p-verifier{background:#e08a00}.p-echec{background:#d33}
 details{background:#fff;border:1px solid #ddd;border-radius:8px;margin:10px 0;padding:4px 12px}
 summary{cursor:pointer;font-weight:600;padding:6px 0}
 table{border-collapse:collapse;width:100%;font-size:13px}
 td,th{border-top:1px solid #eee;padding:5px 8px;text-align:left;vertical-align:top}
 tr.verifier{background:#fff4e0} tr.echec{background:#ffe3e3}
 img{height:56px;border-radius:4px;background:#eee}
 .m{color:#777;font-size:11px} a{color:#2457c5;text-decoration:none}
 .noimg{color:#b55;font-size:11px;font-weight:600}
</style>
<h1>Audit — résolution des titres Wikipedia (étape 1)</h1>
<div class="resume">"""]
    parts.append(
        f'<span class="pill p-ok">{counts["ok"]} OK</span>'
        f'<span class="pill p-verifier">{counts["verifier"]} à vérifier</span>'
        f'<span class="pill p-echec">{counts["echec"]} introuvables</span>'
        f'<span class="m">sur {len(results)} cartes — corrections à reporter dans '
        f'build/overrides.json sous la forme "Collection|Nom Excel": "Titre exact"</span>')
    parts.append('</div>')

    for col in by_col:
        rows = by_col[col]
        nb_bad = sum(1 for r in rows if r['statut'] != 'ok')
        badge = f' — <span style="color:#e08a00">{nb_bad} à vérifier</span>' if nb_bad else ''
        parts.append(f'<details {"open" if nb_bad else ""}><summary>{esc(col)} '
                     f'({len(rows)} cartes){badge}</summary><table>')
        parts.append('<tr><th></th><th>#</th><th>Nom Excel</th><th>Titre résolu</th>'
                     '<th>Extrait</th><th>Statut / note</th></tr>')
        for r in rows:
            img = (f'<img src="{esc(r["thumb"])}" loading="lazy">' if r['thumb']
                   else '<span class="noimg">pas d’image</span>')
            link = (f'<a href="{esc(r["url"])}" target="_blank">{esc(r["titre"])}</a>'
                    if r['titre'] else '—')
            note = esc(r['note'] or r['methode'])
            parts.append(
                f'<tr class="{r["statut"]}"><td>{img}</td><td>{r["numero"]}</td>'
                f'<td>{esc(r["nom"])}</td><td>{link}<div class="m">{esc(r["methode"])}</div></td>'
                f'<td>{esc(r["extrait"][:180])}</td>'
                f'<td><b>{r["statut"]}</b><div class="m">{note}</div></td></tr>')
        parts.append('</table></details>')
    parts.append('</html>')
    (BUILD / 'audit.html').write_text('\n'.join(parts), encoding='utf-8')

# ---------------------------------------------------------------- main

def main():
    load_cache()
    overrides = json.loads((BUILD / 'overrides.json').read_text(encoding='utf-8'))
    overrides = {k: v for k, v in overrides.items() if not k.startswith('_')}
    entries = read_entries()
    print(f'{len(entries)} cartes, {len(set(e["collection"] for e in entries))} collections, '
          f'{len(overrides)} overrides')
    results = resolve_all(entries, overrides)
    save_cache(force=True)
    write_outputs(results)
    counts = {}
    for r in results:
        counts[r['statut']] = counts.get(r['statut'], 0) + 1
    noimg = sum(1 for r in results if r['image_absente'] and r['titre'])
    print(f"\nBILAN : {counts.get('ok',0)} ok, {counts.get('verifier',0)} à vérifier, "
          f"{counts.get('echec',0)} introuvables, {noimg} pages sans image")
    print('Sorties : build/audit.html, build/audit.csv, build/resolution.json')

if __name__ == '__main__':
    main()
