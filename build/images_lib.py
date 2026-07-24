#!/usr/bin/env python3
"""Étape D — boîte à outils images : HTTP avec cache, conversion webp,
sources (Wikipedia fr/en, Commons, TMDB, recherche Bing), index memo-app,
rasterisation SVG via Chrome headless. memo-app est en LECTURE SEULE."""
import sys, os, io, json, re, time, pickle, unicodedata, subprocess, tempfile
import urllib.request, urllib.parse
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
MEMO = Path(r'C:\Users\flxjr\OneDrive\Documents\Ecosystème Eclats\apps\memo')
CHROME = Path(r'C:\Program Files\Google\Chrome\Application\chrome.exe')
UA_BOT = 'wikideck-build/1.0 (projet perso; contact: claude.elk041@passmail.net)'
UA_NAV = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
          '(KHTML, like Gecko) Chrome/126.0 Safari/537.36')
CACHE_PATH = ROOT / 'build' / '.cache_images.pkl'
THUMB_H, FULL_MAX = 160, 800

_cache = pickle.loads(CACHE_PATH.read_bytes()) if CACHE_PATH.exists() else {}
_sale = 0


def save_cache(force=False):
    global _sale
    if force or _sale >= 20:
        CACHE_PATH.write_bytes(pickle.dumps(_cache))
        _sale = 0


def http_get(url, cache=True, navigateur=False, timeout=30):
    """GET binaire. Le cache pickle ne garde que les réponses texte/JSON
    (< 300 Ko) — les images sont matérialisées en fichiers, pas en cache."""
    global _sale
    if cache and url in _cache:
        return _cache[url]
    ua = UA_NAV if navigateur else UA_BOT
    data = None
    for tentative in range(3):
        try:
            req = urllib.request.Request(url, headers={
                'User-Agent': ua, 'Accept': '*/*',
                'Accept-Language': 'fr,en;q=0.8', 'Referer': 'https://www.bing.com/'})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                data = r.read()
            break
        except Exception:
            time.sleep(1.5 * (tentative + 1))
    if data is not None and cache and len(data) < 300_000:
        _cache[url] = data
        _sale += 1
        save_cache()
    time.sleep(0.05)
    return data


def api(host, params):
    params = dict(params, format='json', formatversion=2)
    url = f'https://{host}/w/api.php?' + urllib.parse.urlencode(params)
    data = http_get(url)
    try:
        return json.loads(data.decode('utf-8')) if data else None
    except Exception:
        return None


# ------------------------------------------------------------ normalisation

def strip_accents(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s)
                   if unicodedata.category(c) != 'Mn')


def norm(s):
    s = strip_accents(str(s or '')).lower()
    s = re.sub(r"['’ʼ-]", ' ', s)
    s = re.sub(r'[^a-z0-9 ]', '', s)
    return re.sub(r'\s+', ' ', s).strip()


# ------------------------------------------------------------ conversion webp

def to_thumb(data):
    try:
        img = Image.open(io.BytesIO(data)).convert('RGB')
        r = THUMB_H / img.height
        img = img.resize((max(1, round(img.width * r)), THUMB_H), Image.LANCZOS)
        out = io.BytesIO()
        img.save(out, 'WEBP', quality=82)
        return out.getvalue()
    except Exception:
        return None


def to_full(data):
    try:
        img = Image.open(io.BytesIO(data)).convert('RGB')
        if max(img.size) > FULL_MAX:
            r = FULL_MAX / max(img.size)
            img = img.resize((max(1, round(img.width * r)),
                              max(1, round(img.height * r))), Image.LANCZOS)
        out = io.BytesIO()
        img.save(out, 'WEBP', quality=90)
        return out.getvalue()
    except Exception:
        return None


def taille_image(data):
    try:
        return Image.open(io.BytesIO(data)).size
    except Exception:
        return (0, 0)


def telecharger_image(url, min_cote=500, navigateur=True):
    """Télécharge et valide une image ; retourne les octets ou None."""
    data = http_get(url, cache=False, navigateur=navigateur)
    if not data or len(data) < 4000:
        return None
    w, h = taille_image(data)
    if max(w, h) < min_cote:
        return None
    return data


# ------------------------------------------------------------ Wikipedia

MAUVAIS_FICHIERS = re.compile(
    r'(map|carte|range|distribution|locator|logo|flag|blason|armoiries|blank|'
    r'disambig|icon|pictogram|silhouette[_ ]inconnue)', re.I)


def wiki_images_batch(titres, host='fr.wikipedia.org', filtrer=True):
    """{titre -> URL de l'image principale (originale)} par lots de 50."""
    out = {}
    titres = [t for t in titres if t]
    for i in range(0, len(titres), 50):
        chunk = titres[i:i + 50]
        d = api(host, dict(action='query', titles='|'.join(chunk), redirects=1,
                           prop='pageimages', piprop='original|name',
                           pilicense='any'))
        if not d:
            continue
        q = d.get('query', {})
        mapping = {}
        for m in q.get('normalized', []) + q.get('redirects', []):
            mapping[m['from']] = m['to']
        pages = {p['title']: p for p in q.get('pages', [])}
        for t in chunk:
            final = mapping.get(t, t)
            final = mapping.get(final, final)
            p = pages.get(final)
            if not p:
                continue
            nomf = p.get('pageimage', '')
            orig = (p.get('original') or {}).get('source')
            if orig and (not filtrer or not MAUVAIS_FICHIERS.search(nomf or orig)):
                out[t] = orig
    return out


def langlinks_en(titres):
    """{titre fr -> titre en} par lots."""
    out = {}
    titres = [t for t in titres if t]
    for i in range(0, len(titres), 50):
        chunk = titres[i:i + 50]
        d = api('fr.wikipedia.org', dict(action='query', titles='|'.join(chunk),
                                         redirects=1, prop='langlinks',
                                         lllang='en', lllimit='max'))
        if not d:
            continue
        q = d.get('query', {})
        mapping = {}
        for m in q.get('normalized', []) + q.get('redirects', []):
            mapping[m['from']] = m['to']
        pages = {p['title']: p for p in q.get('pages', [])}
        for t in chunk:
            final = mapping.get(t, t)
            final = mapping.get(final, final)
            p = pages.get(final)
            ll = (p or {}).get('langlinks') or []
            if ll:
                out[t] = ll[0]['title']
    return out


def commons_thumb(fichier, largeur=1000):
    d = api('commons.wikimedia.org', dict(
        action='query', titles=f'File:{fichier}', prop='imageinfo',
        iiprop='url', iiurlwidth=largeur))
    try:
        info = d['query']['pages'][0]['imageinfo'][0]
        return info.get('thumburl') or info.get('url')
    except Exception:
        return None


# ------------------------------------------------------------ TMDB

def tmdb_poster(titre, cle_api):
    if not cle_api:
        return None
    url = ('https://api.themoviedb.org/3/search/movie?' + urllib.parse.urlencode(
        {'api_key': cle_api, 'query': titre, 'language': 'fr-FR'}))
    data = http_get(url)
    try:
        res = json.loads(data.decode('utf-8')).get('results') or []
        poster = next((r['poster_path'] for r in res if r.get('poster_path')), None)
        return f'https://image.tmdb.org/t/p/w780{poster}' if poster else None
    except Exception:
        return None


# ------------------------------------------------------------ recherche Bing

def bing_images(requete, n=8):
    url = ('https://www.bing.com/images/search?' +
           urllib.parse.urlencode({'q': requete, 'count': 35, 'qft': '+filterui:imagesize-large'}))
    data = http_get(url, navigateur=True)
    if not data:
        return []
    html = data.decode('utf-8', errors='replace')
    urls = re.findall(r'&quot;murl&quot;:&quot;(https?://[^&]+?)&quot;', html) or \
           re.findall(r'"murl":"(https?://[^"]+?)"', html)
    vus, out = set(), []
    for u in urls:
        u = u.replace('\\/', '/')
        if u not in vus:
            vus.add(u)
            out.append(u)
        if len(out) >= n:
            break
    return out


# ------------------------------------------------------------ memo-app

LABEL_IDX = {'films': 3, 'f1_champions': 3}          # défaut : colonne 2

def index_memo():
    """{liste: {norm(label): (chemin_full, ligne)}} depuis extracted_data.json.
    Le chemin full est résolu par glob (extensions variées)."""
    d = json.loads((MEMO / 'build' / 'extracted_data.json').read_text(encoding='utf-8'))
    idx = {}
    for l in d['DEFAULT_LISTS']:
        lid = l['id']
        li = LABEL_IDX.get(lid, 2)
        table = {}
        for row in l.get('rows', []):
            if len(row) <= li:
                continue
            n_ligne, label = row[0], str(row[li]).strip()
            label = re.sub(r'^[\U0001F1E6-\U0001F1FF\s]+', '', label)  # drapeaux emoji
            cands = list((MEMO / 'full' / lid).glob(f'{n_ligne}.*')) if \
                (MEMO / 'full' / lid).exists() else []
            if cands:
                table[norm(label)] = (cands[0], int(n_ligne) if str(n_ligne).isdigit() else 0)
        if table:
            idx[lid] = table
    return idx


def memo_data_uri_svg(lid, n_ligne):
    """Récupère le data-URI SVG d'une ligne memo (liste elements)."""
    d = json.loads((MEMO / 'build' / 'extracted_data.json').read_text(encoding='utf-8'))
    for l in d['DEFAULT_LISTS']:
        if l['id'] != lid:
            continue
        for row in l['rows']:
            if str(row[0]) == str(n_ligne) and str(row[1]).startswith('data:image/svg'):
                brut = row[1].split(',', 1)[1]
                return urllib.parse.unquote(brut)
    return None


def rasterizer_svg(svg_texte, largeur=900):
    """SVG -> PNG via Chrome headless (approche du build memo)."""
    with tempfile.TemporaryDirectory() as td:
        svg = Path(td) / 'in.svg'
        png = Path(td) / 'out.png'
        svg.write_text(svg_texte, encoding='utf-8')
        subprocess.run([str(CHROME), '--headless=new', '--disable-gpu',
                        f'--window-size={largeur},{round(largeur * 0.69)}',
                        f'--screenshot={png}', svg.as_uri()],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                       timeout=60, check=False)
        return png.read_bytes() if png.exists() else None
