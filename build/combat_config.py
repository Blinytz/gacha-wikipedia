#!/usr/bin/env python3
"""Configuration de départ du mode roguelike (spec wikigacha-roguelike-spec).

Tout est réglable ensuite depuis l'atelier : ce fichier ne sert qu'à produire
les valeurs PAR DÉFAUT de data/combat.json à la première génération.
"""

# --- Section 3 : rôle par collection (attaque / defense / terrain)
ROLES = {
    'merveilles-du-monde': 'terrain',
    'pilotes-f1-champions-du-monde': 'attaque',
    'elements-chimiques': 'terrain',
    'corps-celestes': 'terrain',
    'dieux-et-figures-mythologiques-grecques': 'attaque',
    'grands-dirigeants': 'attaque',
    'constellations': 'terrain',
    'monuments-emblematiques': 'terrain',
    'dynasties-et-empires-historiques': 'terrain',
    'grandes-batailles-historiques': 'attaque',
    'grandes-guerres': 'attaque',
    'dinosaures-celebres': 'attaque',
    'grands-explorateurs': 'defense',
    'auteurs-celebres': 'defense',
    'scientifiques-celebres': 'defense',
    'grands-peintres': 'defense',
    'tableaux-celebres': 'terrain',
    'inventions-importantes': 'defense',
    'aviateurs-celebres': 'attaque',
    'mammiferes': 'attaque',
    'oiseaux': 'defense',
    'reptiles-et-amphibiens': 'attaque',
    'poissons-et-vie-marine': 'defense',
    'insectes': 'attaque',
    'races-de-chien': 'defense',
    'coupes-du-monde-fifa': 'terrain',
    'plus-grands-joueurs-de-football': 'attaque',
    'mythologies-du-monde-hors-grece': 'attaque',
    'creatures-et-legendes': 'attaque',
    'personnages-de-fiction-celebres': 'attaque',
    'jeux-video-cultes': 'terrain',
    'films-cultes': 'terrain',
}

# --- Section 4.2 Variable 1 : déclencheur par collection (catalogue 4.4)
DECLENCHEURS = {
    'merveilles-du-monde': 'au début du combat',
    'pilotes-f1-champions-du-monde': 'après avoir gagné le duel du tour',
    'elements-chimiques': 'au début du combat',
    'corps-celestes': 'au début du combat',
    'dieux-et-figures-mythologiques-grecques': "quand elle est sur le point d'être détruite",
    'grands-dirigeants': 'si elle survit 2 tours',
    'constellations': 'au premier tour uniquement',
    'monuments-emblematiques': 'quand la Base passe sous 50 % de ses PV',
    'dynasties-et-empires-historiques': 'si elle survit 2 tours',
    'grandes-batailles-historiques': 'si au moins 2 cartes du même type sont jouées ce tour',
    'grandes-guerres': 'si elle survit 2 tours',
    'dinosaures-celebres': "quand une carte Terrain vient d'être détruite",
    'grands-explorateurs': 'au premier tour uniquement',
    'auteurs-celebres': "si le joueur a plus de cartes en main que l'adversaire",
    'scientifiques-celebres': 'si au moins 2 cartes jouées ce tour partagent un tag',
    'grands-peintres': 'au début du combat',
    'tableaux-celebres': 'quand la Base passe sous 50 % de ses PV',
    'inventions-importantes': 'si au moins 2 cartes du même type sont jouées ce tour',
    'aviateurs-celebres': 'après avoir gagné le duel du tour',
    'mammiferes': 'si une autre carte de sa collection est en jeu',
    'oiseaux': "si le joueur a moins de cartes en main que l'adversaire",
    'reptiles-et-amphibiens': "quand elle est sur le point d'être détruite",
    'poissons-et-vie-marine': 'au début du combat',
    'insectes': 'si une autre carte de sa collection est en jeu',
    'races-de-chien': 'si une autre carte de sa collection est en jeu',
    'coupes-du-monde-fifa': 'après avoir gagné le duel du tour',
    'plus-grands-joueurs-de-football': 'après avoir gagné le duel du tour',
    'mythologies-du-monde-hors-grece': "quand elle est sur le point d'être détruite",
    'creatures-et-legendes': "quand elle est sur le point d'être détruite",
    'personnages-de-fiction-celebres': 'si au moins 2 cartes jouées ce tour partagent un tag',
    'jeux-video-cultes': "si l'adversaire n'a joué aucune carte Attaque",
    'films-cultes': 'au premier tour uniquement',
}

# Catalogue de déclencheurs proposés dans l'atelier (section 4.4)
CATALOGUE_DECLENCHEURS = [
    'au début du combat',
    'au premier tour uniquement',
    'si elle survit 2 tours',
    'après avoir gagné le duel du tour',
    "quand elle est sur le point d'être détruite",
    'quand la Base passe sous 50 % de ses PV',
    'si au moins 2 cartes du même type sont jouées ce tour',
    'si au moins 2 cartes jouées ce tour partagent un tag',
    "si le joueur a plus de cartes en main que l'adversaire",
    "si le joueur a moins de cartes en main que l'adversaire",
    'si une autre carte de sa collection est en jeu',
    "si l'adversaire n'a joué aucune carte Attaque",
    "quand une carte Terrain vient d'être détruite",
]

# --- Section 4.2 Variable 2 : familles d'effet par palier de connexions
# type : continue (%) | discrete (entier bas) ; gabarit : {valeur} + {unite}
FAMILLES = [
    # palier faible
    {'id': 'defensif-direct', 'nom': 'Défensif direct', 'palier': 'faible',
     'type': 'continue', 'unite': '%', 'ciblage': 'elle-même',
     'gabarit': 'elle augmente sa Défense de {valeur} {unite}'},
    {'id': 'regeneration', 'nom': 'Régénération', 'palier': 'faible',
     'type': 'continue', 'unite': '%', 'ciblage': 'Base alliée',
     'gabarit': 'elle rend à la Base {valeur} {unite} de ses propres PV'},
    {'id': 'esquive', 'nom': 'Esquive', 'palier': 'faible',
     'type': 'discrete', 'unite': 'fois', 'ciblage': 'Base alliée',
     'gabarit': 'elle annule entièrement les dégâts du tour ({valeur} {unite} par combat)'},
    {'id': 'renaissance', 'nom': 'Renaissance', 'palier': 'faible',
     'type': 'continue', 'unite': '%', 'ciblage': 'elle-même',
     'gabarit': 'elle revient en main au lieu de partir à la défausse si la Base est sous {valeur} {unite}'},
    # palier moyen-bas
    {'id': 'offensif-direct', 'nom': 'Offensif direct', 'palier': 'moyen-bas',
     'type': 'continue', 'unite': '%', 'ciblage': 'elle-même',
     'gabarit': 'elle augmente son Attaque de {valeur} {unite}'},
    {'id': 'vol-de-force', 'nom': 'Vol de force', 'palier': 'moyen-bas',
     'type': 'continue', 'unite': '%', 'ciblage': 'la plus forte de la ligne adverse',
     'gabarit': "elle retire {valeur} {unite} de sa force à la plus forte carte adverse et se l'ajoute"},
    {'id': 'affaiblissement', 'nom': 'Affaiblissement adverse', 'palier': 'moyen-bas',
     'type': 'continue', 'unite': '%', 'ciblage': 'ligne adverse',
     'gabarit': "elle réduit l'Attaque adverse de {valeur} {unite} pour ce tour"},
    # palier moyen-haut
    {'id': 'synergie-ligne', 'nom': 'Synergie de ligne', 'palier': 'moyen-haut',
     'type': 'continue', 'unite': '%', 'ciblage': 'sa propre ligne',
     'gabarit': 'elle augmente de {valeur} {unite} la valeur des autres cartes de sa ligne'},
    {'id': 'meute', 'nom': 'Meute', 'palier': 'moyen-haut',
     'type': 'continue', 'unite': '%', 'ciblage': 'elle-même',
     'gabarit': 'elle gagne {valeur} {unite} par autre carte de sa collection en jeu'},
    {'id': 'degats-zone', 'nom': 'Dégâts de zone', 'palier': 'moyen-haut',
     'type': 'continue', 'unite': '%', 'ciblage': 'Base adverse',
     'gabarit': 'elle inflige directement à la Base adverse {valeur} {unite} de ses PV, Défense ignorée'},
    {'id': 'gel-sabotage', 'nom': 'Gel / Sabotage', 'palier': 'moyen-haut',
     'type': 'discrete', 'unite': 'tour(s)', 'ciblage': 'la plus forte de la ligne adverse',
     'gabarit': 'elle gèle la plus forte carte adverse pendant {valeur} {unite}'},
    # palier élevé
    {'id': 'synergie-equipe', 'nom': "Synergie d'équipe", 'palier': 'eleve',
     'type': 'continue', 'unite': '%', 'ciblage': 'toutes les cartes alliées du tour',
     'gabarit': 'elle augmente de {valeur} {unite} toutes les cartes jouées ce tour'},
    {'id': 'renforcement-terrain', 'nom': 'Renforcement Terrain', 'palier': 'eleve',
     'type': 'continue', 'unite': '%', 'ciblage': 'Base alliée',
     'gabarit': 'elle ajoute à la Base {valeur} {unite} des PV Terrain en jeu'},
    {'id': 'extension-slot', 'nom': 'Extension de slot', 'palier': 'eleve',
     'type': 'discrete', 'unite': "point(s) d'énergie", 'ciblage': 'joueur',
     'gabarit': 'elle octroie +{valeur} {unite} pour ce tour'},
    {'id': 'echo', 'nom': 'Écho', 'palier': 'eleve',
     'type': 'discrete', 'unite': 'fois', 'ciblage': 'sa propre ligne',
     'gabarit': 'elle répète le dernier effet déclenché sur sa ligne ({valeur} {unite})'},
    # palier très élevé
    {'id': 'pioche', 'nom': 'Pioche', 'palier': 'tres-eleve',
     'type': 'discrete', 'unite': 'carte(s)', 'ciblage': 'joueur',
     'gabarit': 'elle fait piocher {valeur} {unite}'},
    {'id': 'reactivation', 'nom': 'Réactivation', 'palier': 'tres-eleve',
     'type': 'discrete', 'unite': 'carte(s)', 'ciblage': 'défausse alliée',
     'gabarit': 'elle rejoue {valeur} {unite} de la défausse'},
    {'id': 'verrou', 'nom': 'Verrou', 'palier': 'tres-eleve',
     'type': 'discrete', 'unite': 'tour(s)', 'ciblage': 'Terrain adverse',
     'gabarit': 'elle bloque les effets du Terrain adverse pendant {valeur} {unite}'},
    {'id': 'dernier-rempart', 'nom': 'Dernier rempart', 'palier': 'tres-eleve',
     'type': 'continue', 'unite': '%', 'ciblage': 'elle-même',
     'gabarit': 'elle gagne {valeur} {unite} si elle est la dernière carte de sa ligne'},
    {'id': 'underdog', 'nom': 'Underdog', 'palier': 'tres-eleve',
     'type': 'continue', 'unite': '%', 'ciblage': 'elle-même',
     'gabarit': "elle gagne {valeur} {unite} si la Base alliée est inférieure à celle de l'adversaire"},
]

# Seuils de liens sortants Wikipedia -> palier (Variable 2)
PALIERS_LIENS = [
    ('faible', 0), ('moyen-bas', 80), ('moyen-haut', 200),
    ('eleve', 350), ('tres-eleve', 500),
]

# Variable 3 : plages de force par rareté (min, max). Notoriété = position fine.
FORCE_CONTINUE = {
    'commune': [5, 15], 'rare': [15, 25], 'epique': [25, 40],
    'mythique': [40, 60], 'legendaire': [60, 90],
}
FORCE_DISCRETE = {
    'commune': [1, 1], 'rare': [1, 1], 'epique': [1, 2],
    'mythique': [2, 2], 'legendaire': [2, 3],
}

# Section 3 : PV de combat (10 à 500 par pas de 10) selon la rareté
PV_COMBAT = {
    'commune': [10, 120], 'rare': [120, 220], 'epique': [220, 320],
    'mythique': [320, 410], 'legendaire': [410, 500],
}
