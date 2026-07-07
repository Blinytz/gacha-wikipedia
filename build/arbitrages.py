#!/usr/bin/env python3
"""Étape A — arbitrages manuels des résolutions douteuses restantes (revue
faite ligne à ligne sur review_suspects.py). Pour chaque carte : liste de
titres candidats, le premier existant (non-homonymie) gagne -> overrides.json.
Les suppressions complémentaires (doublons internes) vont dans
suppressions_extra.json (consommé par generate_cards.py)."""
import sys, json
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'build'))
import resolve_titles as rt

ARBITRAGES = {
    # Constellations / Corps célestes
    'Constellations|Bouclier': ['Écu de Sobieski'],
    'Corps celestes|Saturne': ['Saturne (planète)'],
    "Corps celestes|Nebuleuse d'Helix": ["Nébuleuse de l'Hélice"],
    'Corps celestes|Nebuleuse du Papillon': ['NGC 6302'],
    # Créatures et légendes
    'Creatures et legendes|Roc': ['Rokh', 'Roc (mythologie)'],
    'Creatures et legendes|Troll scandinave': ['Troll (créature)', 'Troll (mythologie nordique)', 'Troll'],
    'Creatures et legendes|Ogre (mythologie)': ['Ogre'],
    "Creatures et legendes|Jardin d'Eden": ["Jardin d'Éden", 'Éden'],
    # Mythologie grecque
    'Dieux et figures mythologiques grecques|Echidna (mythologie)': ['Échidna'],
    'Dieux et figures mythologiques grecques|Megere': ['Mégère (mythologie)'],
    'Dieux et figures mythologiques grecques|Tisiphone': ['Tisiphone (mythologie)', 'Tisiphone'],
    'Dieux et figures mythologiques grecques|Alecto': ['Alecto (mythologie)', 'Alecto (Érinye)'],
    # Histoire
    'Dynasties et empires historiques|Empire perse achemenide': ['Achéménides'],
    'Grands dirigeants|Isabelle Ire': ['Isabelle Ire de Castille', 'Isabelle la Catholique'],
    'Grands dirigeants|Frederic II le Grand': ['Frédéric II (roi de Prusse)'],
    # Insectes
    'Insectes|Guepe commune': ['Guêpe commune', 'Vespula vulgaris'],
    'Insectes|Frelon europeen': ['Frelon européen', 'Vespa crabro'],
    'Insectes|Fourmi charpentiere': ['Camponotus'],
    'Insectes|Coccinelle a sept points': ['Coccinelle à sept points', 'Coccinella septempunctata'],
    'Insectes|Sauterelle verte': ['Grande sauterelle verte', 'Tettigonia viridissima'],
    'Insectes|Cochenille': ['Cochenille', 'Coccoidea'],
    'Insectes|Guepe des figuiers': ['Agaonidae', 'Blastophaga psenes'],
    # Inventions
    "Inventions importantes|L'ecriture": ['Écriture'],
    "Inventions importantes|L'agriculture": ['Agriculture'],
    'Inventions importantes|Le vaccin': ['Vaccin'],
    'Inventions importantes|Le panneau solaire': ['Panneau solaire', 'Panneau photovoltaïque'],
    # Mammifères
    'Mammiferes|Hippopotame nain': ['Hippopotame pygmée', 'Hippopotame nain'],
    'Mammiferes|Zebre des plaines': ['Zèbre des plaines', 'Equus quagga', 'Zèbre'],
    'Mammiferes|Gorille des plaines': ["Gorille des plaines de l'Ouest", "Gorille de l'Ouest", 'Gorille'],
    'Mammiferes|Tatou geant': ['Tatou géant', 'Priodontes maximus'],
    'Mammiferes|Fourmilier geant': ['Fourmilier géant', 'Myrmecophaga tridactyla'],
    # Monuments
    'Monuments emblematiques|Bourj Al Arab': ['Burj Al Arab', 'Burj al-Arab'],
    'Monuments emblematiques|Ruines de Palmyre': ['Palmyre'],
    # Mythologies du monde
    'Mythologies du monde (hors Grece)|Hel (mythologie nordique)': ['Hel (déesse)', 'Hel'],
    'Mythologies du monde (hors Grece)|Amon (mythologie egyptienne)': ['Amon (mythologie égyptienne)', 'Amon'],
    'Mythologies du monde (hors Grece)|Inari (mythologie)': ['Inari (divinité)', 'Inari (kami)', 'Inari (mythologie)'],
    # Oiseaux
    'Oiseaux|Martin-pecheur': ["Martin-pêcheur d'Europe"],
    # Personnages de fiction
    'Personnages de fiction celebres|Frankenstein (creature)': ['Créature de Frankenstein', 'Monstre de Frankenstein'],
    'Personnages de fiction celebres|Ebenezer Scrooge': ['Ebenezer Scrooge'],
    'Personnages de fiction celebres|Le Genie': ['Génie (Disney)', 'Génie (Aladdin)'],
    'Personnages de fiction celebres|Ariel (La Petite Sirene)': ['Ariel (Disney)', 'Ariel (La Petite Sirène)'],
    'Personnages de fiction celebres|Elsa (La Reine des neiges)': ['Elsa (Disney)', 'Elsa (La Reine des neiges)'],
    'Personnages de fiction celebres|Luigi (personnage)': ['Luigi (personnage)', 'Luigi'],
    'Personnages de fiction celebres|Link (personnage)': ['Link (The Legend of Zelda)', 'Link (Zelda)', 'Link (personnage)'],
    'Personnages de fiction celebres|Agent 47': ['Agent 47', '47 (Hitman)'],
    'Personnages de fiction celebres|Le Voyageur (Outer Wilds)': ['Outer Wilds'],
    'Personnages de fiction celebres|Eleven (Stranger Things)': ['Eleven (Stranger Things)', 'Onze (Stranger Things)'],
    'Personnages de fiction celebres|Cthulhu (mythe)': ['Cthulhu'],
    'Personnages de fiction celebres|Vault Boy': ['Fallout (série de jeux vidéo)', 'Fallout'],
    'Personnages de fiction celebres|Spyro le Dragon': ['Spyro (personnage)', 'Spyro'],
    'Jeux video cultes|Spyro le Dragon': ['Spyro the Dragon (jeu vidéo)', 'Spyro the Dragon'],
    # Footballeurs
    'Plus grands joueurs de football|Falcao': ['Paulo Roberto Falcão'],
    # Poissons et vie marine
    'Poissons et vie marine|Poisson-lune': ['Môle (poisson)', 'Poisson-lune'],
    'Poissons et vie marine|Marlin': ['Istiophoridae', 'Makaire bleu'],
    'Poissons et vie marine|Meduse-boite': ['Cuboméduse', 'Cubozoa'],
    'Poissons et vie marine|Meduse lune': ['Aurélie (méduse)', 'Aurelia aurita'],
    'Poissons et vie marine|Crabe-araignee geant du Japon': ['Crabe géant du Japon', 'Macrocheira kaempferi'],
    'Poissons et vie marine|Eponge de mer': ['Éponge (animal)', 'Spongiaires', 'Porifera'],
    # Races de chien
    'Races de chien|Levrier Irlandais': ['Lévrier irlandais', 'Irish Wolfhound'],
    'Races de chien|Briard': ['Berger de Brie'],
    'Races de chien|Coonhound': ['Black and Tan Coonhound', 'Coonhound'],
    # Reptiles
    'Reptiles et amphibiens|Salamandre geante du Japon': ['Salamandre géante du Japon', 'Andrias japonicus'],
    'Reptiles et amphibiens|Iguane a queue epineuse': ['Ctenosaura similis', 'Ctenosaura'],
    # Scientifiques
    'Scientifiques celebres|Ptolemee': ['Claude Ptolémée', 'Ptolémée'],
}

# Doublons internes tranchés (une page = une seule carte) :
SUPPRESSIONS_EXTRA = [
    'Creatures et legendes|Cerbere (creature)',        # gardé en Mythologie grecque (art Hadès)
    'Tableaux celebres|Le Tres de Mayo',               # doublon des «Fusillades du 3 mai 1808»
    'Personnages de fiction celebres|Astroboy',        # doublon d'«Astro le Petit Robot»
]


def main():
    rt.load_cache()
    overrides = json.loads((ROOT / 'build' / 'overrides.json').read_text(encoding='utf-8'))
    tous = sorted({t for cands in ARBITRAGES.values() for t in cands})
    print(f'Validation de {len(tous)} candidats…')
    metas = rt.fetch_meta(tous)
    echecs = []
    for cle, cands in ARBITRAGES.items():
        choisi = None
        for t in cands:
            m = metas.get(t)
            if m and not m['disambig']:
                choisi = m['title']
                break
        if choisi:
            overrides[cle] = choisi
        else:
            echecs.append(f'{cle}: {cands}')
    (ROOT / 'build' / 'overrides.json').write_text(
        json.dumps(overrides, ensure_ascii=False, indent=1, sort_keys=True),
        encoding='utf-8')
    (ROOT / 'build' / 'suppressions_extra.json').write_text(
        json.dumps(SUPPRESSIONS_EXTRA, ensure_ascii=False, indent=1),
        encoding='utf-8')
    rt.save_cache(force=True)
    print(f'{len(ARBITRAGES) - len(echecs)}/{len(ARBITRAGES)} arbitrages appliqués, '
          f'{len(SUPPRESSIONS_EXTRA)} suppressions extra.')
    for e in echecs:
        print('  ⚠️ sans candidat valide :', e)


if __name__ == '__main__':
    main()
