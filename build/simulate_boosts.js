// Harnais d'équilibrage — pilote les VRAIS moteurs de la Station (js/station-*.js)
// dans Node, avec des mocks minimes du navigateur. Mesure le boost moyen de
// chaque module sur 48h simulées selon plusieurs profils de joueur.
//
//   node build/simulate_boosts.js
//
// N'écrit rien : sert uniquement à calibrer les valeurs par défaut de config.js.

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.window = { addEventListener() {} };
globalThis.document = { addEventListener() {}, visibilityState: 'visible' };
globalThis.alert = () => {};

const { initM1, stepM1, boostM1, proximiteReelle } = await import('../js/station-m1.js');
const { initM2, stepM2, boostM2, reglerCurseurM2 } = await import('../js/station-m2.js');
const { config } = await import('../js/config.js');

const DT = 5;                 // s par pas
const DUREE = 48 * 3600;      // 48h simulées
const T0 = Date.now();

function simuler(nom, init, agir) {
  let etatSim = init(T0);
  let somme = 0, sommeMin = Infinity, sommeMax = 0, n = 0;
  for (let t = 0; t < DUREE; t += DT) {
    const simNow = T0 + t * 1000;
    agir(etatSim, t, simNow);
    etatSim.__step(etatSim, DT, simNow);
    const b = etatSim.__boost(etatSim);
    somme += b; n += 1;
    sommeMin = Math.min(sommeMin, b); sommeMax = Math.max(sommeMax, b);
  }
  return { nom, moyen: somme / n, min: sommeMin, max: sommeMax };
}

/* ------------------------------------------------ Module 1 */

function initSimM1(t0) {
  const m1 = initM1(t0);
  m1.__step = stepM1; m1.__boost = boostM1;
  return m1;
}

const scenariosM1 = [
  simuler('M1 passif (curseurs immobiles)', initSimM1, () => {}),

  simuler('M1 assidu (recadrage ~5×/jour + énergie gérée)', initSimM1, (m1, t) => {
    if (t % Math.round(4.8 * 3600) < DT) {   // 5 visites/jour
      // le joueur converge vers la cible au signal bruité (précision ~±10)
      for (const a of ['x', 'y', 'z']) m1.curseurs[a] = m1.cible[a] + (Math.random() - 0.5) * 20;
      // stratégie simple : consommer si la réserve est confortable, sinon générer
      m1.curseurEnergie = m1.energie > 4000 ? 60 : -100;
    }
  }),

  simuler('M1 optimal (recadrage 20 min, énergie agressive)', initSimM1, (m1, t) => {
    if (t % 1200 < DT) {
      for (const a of ['x', 'y', 'z']) m1.curseurs[a] = m1.cible[a] + (Math.random() - 0.5) * 6;
      m1.curseurEnergie = (proximiteReelle(m1) > 70 && m1.energie > 500) ? 100 : -100;
    }
  }),
];

/* ------------------------------------------------ Module 2 */

function initSimM2(t0) {
  const m2 = initM2(t0);
  m2.__step = stepM2; m2.__boost = boostM2;
  return m2;
}

const scenariosM2 = [
  simuler('M2 passif (34/33/33 sans retouche)', initSimM2, () => {}),

  simuler('M2 équilibre soutenu (30/30/40)', initSimM2, (m2, t) => {
    if (t === 0) m2.curseurs = { collecte: 30, traitement: 30, raffinage: 40 };
  }),

  simuler('M2 cycle accumulation 4h / raffinage fort 1h', initSimM2, (m2, t) => {
    const phase = t % (5 * 3600);
    if (phase < DT) m2.curseurs = { collecte: 55, traitement: 45, raffinage: 0 };
    if (phase >= 4 * 3600 && phase < 4 * 3600 + DT) {
      m2.curseurs = { collecte: 10, traitement: 20, raffinage: 70 };
    }
  }),
];

/* ------------------------------------------------ Module 3 (analytique) */
// Le boost M3 vient d'instances (intensité, durée) achetées avec le Capital
// de gains. Contribution moyenne journalière d'une conversion quotidienne m :
//   int = m·r·tauxInt·eInt ; dur = m·(1-r)·tauxDur·eDur
//   apport moyen = int × min(dur, 86400) / 86400
function apportM3(gainsParJour, tauxInt = 1.0, tauxDur = 1.0, r = 0.5) {
  const eInt = config.get('echelleIntensiteM3');
  const eDur = config.get('echelleDureeM3');
  const int = gainsParJour * r * tauxInt * eInt;
  const dur = gainsParJour * (1 - r) * tauxDur * eDur;
  return { int, durH: dur / 3600, apportMoyen: int * Math.min(dur, 86400) / 86400 };
}

const scenariosM3 = [
  ['M3 passif (500 sur Stable, dividendes seuls ≈2.5/j)', apportM3(2.5)],
  ['M3 actif (trading ≈15/j + dividendes ≈2.5/j)', apportM3(17.5)],
  ['M3 intense (30/j, cumulés 2 jours, taux favorables ×1.6)',
    (() => { const a = apportM3(60, 1.6, 1.6); return { ...a, apportMoyen: a.apportMoyen / 2 }; })()],
];

/* ------------------------------------------------ rapport */

const f = x => x.toFixed(2);
console.log(`Simulation ${DUREE / 3600}h, pas ${DT}s — valeurs de config actuelles\n`);
console.log('— Module 1 —');
for (const s of scenariosM1) console.log(`  ${s.nom}\n    boost moyen ×${f(s.moyen)} (min ×${f(s.min)}, max ×${f(s.max)})`);
console.log('— Module 2 —');
for (const s of scenariosM2) console.log(`  ${s.nom}\n    boost moyen ×${f(s.moyen)} (min ×${f(s.min)}, max ×${f(s.max)})`);
console.log('— Module 3 —');
for (const [nom, a] of scenariosM3) {
  console.log(`  ${nom}\n    +${f(a.int)} pendant ${f(a.durH)}h -> apport moyen +${f(a.apportMoyen)}`);
}
console.log('\n— Vitesse totale estimée (produit des moyens) —');
const total = (i) => scenariosM1[i].moyen * scenariosM2[i].moyen * (1 + scenariosM3[i][1].apportMoyen);
console.log(`  passif  : ×${f(total(0))}`);
console.log(`  assidu  : ×${f(total(1))}`);
console.log(`  intense : ×${f(total(2))}  (hors pics de boost M3)`);
