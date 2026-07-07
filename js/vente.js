// Vente de doublons depuis le détail d'une carte (branchement du hook de
// l'écran Collection). Module séparé pour éviter tout cycle d'imports.

import { etat } from './etat.js';
import { tauxActuel, vendreDoublon } from './eclats.js';
import { definirDetailOptions } from './ecran-collection.js';
import { formaterNombre, confirmer } from './ui.js';

definirDetailOptions((carte, surMaj) => {
  const qte = etat.cartes[carte.id] || 0;
  if (qte < 2) return {};
  return {
    actions: `
      <div class="panneau-vente">
        <button class="btn btn-vendre">◆ Vendre un doublon —
          ${formaterNombre(Math.round(carte.pv * tauxActuel()))} Éclats
          <small>(${carte.pv} PV × taux ${tauxActuel().toFixed(2)})</small></button>
        <p class="note-vente">Le taux fluctue : consulte la courbe dans les
        Réglages avant de vendre. Le dernier exemplaire n'est jamais vendable.</p>
      </div>`,
    brancherActions(overlay, fermer) {
      overlay.querySelector('.btn-vendre').addEventListener('click', () => {
        // Taux relu au moment du clic : c'est le montant réellement crédité.
        const taux = tauxActuel();
        const montant = Math.round(carte.pv * taux);
        if (!confirmer(`Vendre un doublon de « ${carte.nom} » au taux ×${taux.toFixed(2)} pour ${formaterNombre(montant)} Éclats ?`)) return;
        if (vendreDoublon(carte) === null) return;
        document.dispatchEvent(new CustomEvent('gacha:eclats-changes'));
        fermer();
        surMaj?.();
      });
    },
  };
});
