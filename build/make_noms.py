#!/usr/bin/env python3
"""Étape B — noms de cartes intelligents.

Pour chaque carte : un nom d'affichage (titre de carte) distinct du titre
Wikipedia, qui désigne exactement le même sujet :
  1. indice utilisateur (colonne «Titre corrigé») prioritaire, nettoyé ;
  2. sinon nom Excel (souvent le nom commun/compréhensible), accentué via le
     titre de page quand c'est la même chose, sinon via l'API opensearch
     (les redirections portent la forme accentuée) ;
  3. parenthèses supprimées, article homogénéisé par collection, majuscule.

Sorties : build/noms_cartes.json (machine) + build/noms_cartes.csv (relecture).
"""
import sys, json, re, csv
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'build'))
import resolve_titles as rt
from resolve_titles import norm, base_title

TYPOS = {'pourdre': 'poudre'}
RE_ARTICLE = re.compile(r"^(Le |La |Les |L')", re.I)


def nettoyer(nom):
    nom = re.sub(r'\s*\([^)]*\)\s*', ' ', nom).strip()      # parenthèses
    nom = re.sub(r'\s+', ' ', nom)
    for typo, ok in TYPOS.items():
        nom = re.sub(typo, ok, nom, flags=re.I)
    return nom[0].upper() + nom[1:] if nom else nom


def accentuer_tokens(nom, r):
    """Restauration d'accents token par token : chaque mot sans accent est
    remplacé par sa forme accentuée si elle apparaît dans le titre résolu ou
    l'extrait de la carte (même mot, accents près). Les noms propres
    étrangers restent intacts."""
    # dictionnaire de secours pour les mots français fréquents dont la forme
    # accentuée n'apparaît ni dans le titre ni dans l'extrait
    DICO = ['guêpe', 'Corée', 'nébuleuse', 'Colisée', 'météore', 'éléphant',
            'écureuil', 'épée', 'château', 'cathédrale', 'théâtre', 'musée',
            'pyramide', 'forêt', 'désert', 'météorite', 'comète', 'étoile',
            'Vénus', 'Pérou', 'Egée', 'Crète', 'Amérique', 'Sibérie', 'Panthéon']
    vocab = {norm(m): m for m in DICO}
    for mot in re.findall(r"[A-Za-zÀ-ÿ'’-]+", f"{r['titre']} {r['extrait']}"):
        vocab.setdefault(norm(mot), mot)
    tokens = nom.split(' ')
    out = []
    for t in tokens:
        # gère les préfixes élidés (d'Helix, l'Ecriture)
        m = re.match(r"^([DdLl]['’])?(.+)$", t)
        prefixe, corps = m.group(1) or '', m.group(2)
        cand = vocab.get(norm(corps))
        if cand and strip_accents(cand).lower() == strip_accents(corps).lower() \
                and cand != corps:
            corps = cand if corps[0].islower() else cand[0].upper() + cand[1:]
        out.append(prefixe + corps)
    return ' '.join(out)


def strip_accents(s):
    import unicodedata
    return ''.join(c for c in unicodedata.normalize('NFD', s)
                   if unicodedata.category(c) != 'Mn')


def accentuer(nom_excel, titre):
    """Restaure les accents du nom Excel. Si le titre de page (ou sa base) est
    la même chose, sa graphie fait foi ; sinon on interroge opensearch : les
    redirections Wikipedia portent la forme accentuée des noms communs."""
    if norm(titre) == norm(nom_excel):
        return titre
    bt = base_title(titre)
    if norm(bt) == norm(nom_excel):
        return bt
    sans_art = RE_ARTICLE.sub('', nom_excel)
    if norm(bt) == norm(sans_art):
        return bt
    data = rt.api_get(dict(action='opensearch', search=nom_excel, limit=8,
                           redirects='return'))
    if data and len(data) > 1:
        # préférer une forme RÉELLEMENT accentuée (différente du nom brut) —
        # les redirections sans accents existent et ne nous apprennent rien
        egal = None
        for cand in data[1]:
            for forme in (cand, base_title(cand)):
                if norm(forme) == norm(nom_excel):
                    if forme != nom_excel:
                        return forme
                    egal = egal or forme
    return None   # pas de forme accentuée sûre (accentuer_tokens prendra le relais)


def main():
    rt.load_cache()
    rs = json.loads((ROOT / 'build' / 'resolution.json').read_text(encoding='utf-8'))
    corrections = json.loads((ROOT / 'build' / 'corrections.json').read_text(encoding='utf-8'))
    hints = json.loads((ROOT / 'build' / 'noms_hints.json').read_text(encoding='utf-8'))

    par_col = {}
    for r in rs:
        cle = f"{r['collection']}|{r['nom']}"
        if corrections.get(cle, {}).get('supprimer'):
            continue
        par_col.setdefault(r['collection'], []).append(r)

    noms = {}       # cle -> {nomCarte, source, aVerifier}
    n_hint = n_titre = n_accent = n_brut = 0

    for col, rows in par_col.items():
        bruts = []
        for r in rows:
            cle = f"{col}|{r['nom']}"
            if cle in hints:
                brut, source = nettoyer(hints[cle]), 'utilisateur'
                n_hint += 1
            else:
                acc = accentuer(r['nom'], r['titre'])
                if acc is not None:
                    brut, source = nettoyer(acc), 'wikipedia'
                    n_titre += 1
                else:
                    # restauration d'accents via le vocabulaire de la carte
                    repare = accentuer_tokens(r['nom'], r)
                    if repare != r['nom']:
                        brut, source = nettoyer(repare), 'accents-restaures'
                        n_accent += 1
                    else:
                        # nom gardé tel quel (souvent un nom propre étranger)
                        brut, source = nettoyer(r['nom']), 'excel-brut'
                        n_brut += 1
            bruts.append((cle, r, brut, source))

        # homogénéisation des articles : majorité sans article -> tout sans
        avec = sum(1 for _, _, b, _ in bruts if RE_ARTICLE.match(b))
        enleve_articles = avec <= len(bruts) * 0.5
        vus = {}
        for cle, r, brut, source in bruts:
            nom = RE_ARTICLE.sub('', brut).strip() if enleve_articles else brut
            nom = nom[0].upper() + nom[1:]
            double = norm(nom) in vus
            vus[norm(nom)] = cle
            noms[cle] = {
                'nomCarte': nom, 'source': source,
                'aVerifier': source == 'excel-brut' or double,
                **({'doublonNom': True} if double else {}),
            }

    rt.save_cache(force=True)
    (ROOT / 'build' / 'noms_cartes.json').write_text(
        json.dumps(noms, ensure_ascii=False, indent=1), encoding='utf-8')

    with open(ROOT / 'build' / 'noms_cartes.csv', 'w', newline='',
              encoding='utf-8-sig') as f:
        w = csv.writer(f, delimiter=';')
        w.writerow(['collection', 'nom_excel', 'titre_page', 'nom_carte',
                    'source', 'a_verifier'])
        for r in rs:
            cle = f"{r['collection']}|{r['nom']}"
            if cle not in noms:
                continue
            n = noms[cle]
            w.writerow([r['collection'], r['nom'], r['titre'], n['nomCarte'],
                        n['source'], 'X' if n['aVerifier'] else ''])

    doubles = sum(1 for n in noms.values() if n.get('doublonNom'))
    print(f'{len(noms)} noms de cartes — {n_hint} indices utilisateur, '
          f'{n_titre} via Wikipedia (accentués), {n_brut} bruts à relire, '
          f'{doubles} doublons de nom intra-collection')


if __name__ == '__main__':
    main()
