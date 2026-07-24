"""Algorithme partagé rareté/PV — spec « wikideck-prompt-claude-code.md ».

Utilisé par make_provisional_data.py (données provisoires, pageviews aléatoires)
et par generate_cards.py (étape 2, pageviews réels). Toute modification ici
impacte les deux : ne changer les seuils qu'en régénérant une collection entière.
"""

SEUILS = {'legendaire': 0.02, 'mythique': 0.06, 'epique': 0.16, 'rare': 0.26}
PV_MIN, PV_MAX = 20, 340


def rangs_percentiles(pageviews):
    """Rang percentile de chaque carte (0 = la moins populaire, 1 = la plus
    populaire), aligné sur l'ordre d'entrée. Ex-aequo stricts → même rang.
    Cas N=1 → rang 1."""
    n = len(pageviews)
    if n == 0:
        return []
    if n == 1:
        return [1.0]
    ordre = sorted(range(n), key=lambda i: pageviews[i])
    rangs = [0.0] * n
    i = 0
    while i < n:
        j = i
        while j + 1 < n and pageviews[ordre[j + 1]] == pageviews[ordre[i]]:
            j += 1
        rp = i / (n - 1)
        for k in range(i, j + 1):
            rangs[ordre[k]] = rp
        i = j + 1
    return rangs


def quotas(n):
    """Effectifs par palier avec garantie ≥1 sur Légendaire/Mythique/Épique/Rare
    (algorithme exact de la spec, section « règle de garantie minimale »)."""
    q = {
        'legendaire': max(1, round(n * SEUILS['legendaire'])),
        'mythique': max(1, round(n * SEUILS['mythique'])),
        'epique': max(1, round(n * SEUILS['epique'])),
        'rare': max(1, round(n * SEUILS['rare'])),
    }
    q['commune'] = n - sum(q.values())
    # Collection très petite : réduire rare, puis épique, puis mythique,
    # en gardant légendaire = 1 en priorité absolue.
    for palier in ('rare', 'epique', 'mythique'):
        while q['commune'] < 0 and q[palier] > 0:
            q[palier] -= 1
            q['commune'] += 1
    return q


def raretes(pageviews):
    """Rareté de chaque carte, alignée sur l'ordre d'entrée. Assignation par
    quotas, du rang percentile le plus haut vers le plus bas."""
    n = len(pageviews)
    rangs = rangs_percentiles(pageviews)
    q = quotas(n)
    # Ordre de parcours : popularité décroissante (rang percentile décroissant,
    # départage stable par index pour les ex-aequo).
    ordre = sorted(range(n), key=lambda i: (-rangs[i], i))
    out = [None] * n
    it = iter(ordre)
    for palier in ('legendaire', 'mythique', 'epique', 'rare', 'commune'):
        for _ in range(q[palier]):
            out[next(it)] = palier
    return out, rangs


def pv(rang_percentile):
    return round(PV_MIN + rang_percentile * (PV_MAX - PV_MIN))
