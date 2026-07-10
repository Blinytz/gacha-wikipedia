// Atelier — accès au dépôt via l'API GitHub Contents (CORS ouvert).
// Toutes les écritures passent par une file séquentielle avec retries :
// aucun cadrage ne se perd en silence.

export const DEPOT = 'Blinytz/gacha-wikipedia';
export const BRANCHE = 'main';
const API = `https://api.github.com/repos/${DEPOT}/contents/`;
const CLE_TOKEN = 'atelierTokenGitHub';

export function getToken() { return localStorage.getItem(CLE_TOKEN) || ''; }
export function setToken(t) {
  if (t) localStorage.setItem(CLE_TOKEN, t.trim());
  else localStorage.removeItem(CLE_TOKEN);
}

function entetes() {
  return {
    'Authorization': `Bearer ${getToken()}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

export async function testerToken() {
  const r = await fetch(`https://api.github.com/repos/${DEPOT}`, { headers: entetes() });
  return r.ok;
}

// sha actuel d'un fichier (null s'il n'existe pas)
export async function getSha(chemin) {
  const r = await fetch(API + chemin + `?ref=${BRANCHE}&t=${Date.now()}`,
                        { headers: entetes(), cache: 'no-store' });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GET ${chemin} : HTTP ${r.status}`);
  return (await r.json()).sha;
}

// contenu texte + sha d'un fichier (pour notes_atelier.json)
export async function getFichierTexte(chemin) {
  const r = await fetch(API + chemin + `?ref=${BRANCHE}&t=${Date.now()}`,
                        { headers: entetes(), cache: 'no-store' });
  if (r.status === 404) return { texte: null, sha: null };
  if (!r.ok) throw new Error(`GET ${chemin} : HTTP ${r.status}`);
  const j = await r.json();
  const bin = atob(j.content.replace(/\n/g, ''));
  const octets = Uint8Array.from(bin, c => c.charCodeAt(0));
  return { texte: new TextDecoder().decode(octets), sha: j.sha };
}

// écrit (crée ou remplace) un fichier ; gère le sha automatiquement
export async function putFichier(chemin, base64, message, shaConnu) {
  const sha = shaConnu !== undefined ? shaConnu : await getSha(chemin);
  const r = await fetch(API + chemin, {
    method: 'PUT', headers: entetes(),
    body: JSON.stringify({ message, content: base64, branch: BRANCHE,
                           ...(sha ? { sha } : {}) }),
  });
  if (r.status === 409 || r.status === 422) throw new Error('CONFLIT');
  if (!r.ok) throw new Error(`PUT ${chemin} : HTTP ${r.status}`);
  return (await r.json()).content.sha;
}

// Commit GROUPÉ de plusieurs fichiers en une seule révision (API Git Data) :
// indispensable pour ne pas déclencher un build GitHub Pages par fichier.
// fichiers : [{ chemin, base64 }] — base64 null = suppression du fichier.
export async function commitLot(fichiers, message) {
  const h = entetes();
  const base = 'https://api.github.com/repos/' + DEPOT;
  const refJ = await (await fetch(`${base}/git/ref/heads/${BRANCHE}`,
                                  { headers: h, cache: 'no-store' })).json();
  const shaParent = refJ.object.sha;
  const commitJ = await (await fetch(`${base}/git/commits/${shaParent}`,
                                     { headers: h })).json();
  const arbre = [];
  for (const f of fichiers) {
    if (f.base64 === null) {
      arbre.push({ path: f.chemin, mode: '100644', type: 'blob', sha: null });
    } else {
      const blobR = await fetch(`${base}/git/blobs`, {
        method: 'POST', headers: h,
        body: JSON.stringify({ content: f.base64, encoding: 'base64' }) });
      if (!blobR.ok) throw new Error(`blob ${f.chemin} : HTTP ${blobR.status}`);
      arbre.push({ path: f.chemin, mode: '100644', type: 'blob',
                   sha: (await blobR.json()).sha });
    }
  }
  const treeR = await fetch(`${base}/git/trees`, {
    method: 'POST', headers: h,
    body: JSON.stringify({ base_tree: commitJ.tree.sha, tree: arbre }) });
  if (!treeR.ok) throw new Error(`tree : HTTP ${treeR.status}`);
  const commitR = await fetch(`${base}/git/commits`, {
    method: 'POST', headers: h,
    body: JSON.stringify({ message, tree: (await treeR.json()).sha,
                           parents: [shaParent] }) });
  if (!commitR.ok) throw new Error(`commit : HTTP ${commitR.status}`);
  const majR = await fetch(`${base}/git/refs/heads/${BRANCHE}`, {
    method: 'PATCH', headers: h,
    body: JSON.stringify({ sha: (await commitR.json()).sha, force: false }) });
  if (majR.status === 422) throw new Error('CONFLIT');   // la branche a bougé -> retry
  if (!majR.ok) throw new Error(`maj ref : HTTP ${majR.status}`);
}

// suppression (best-effort : silencieux si le fichier n'existe pas)
export async function supprimerFichier(chemin, message) {
  const sha = await getSha(chemin);
  if (!sha) return;
  const r = await fetch(API + chemin, {
    method: 'DELETE', headers: entetes(),
    body: JSON.stringify({ message, sha, branch: BRANCHE }),
  });
  if (!r.ok && r.status !== 404) throw new Error(`DELETE ${chemin} : HTTP ${r.status}`);
}

export function blobVersBase64(blob) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result.split(',')[1]);
    fr.onerror = rej;
    fr.readAsDataURL(blob);
  });
}

/* ---------------- file d'envoi ---------------- */

const file = [];
let enCours = false;
let surChangement = null;   // callback UI

export function surFileChangee(cb) { surChangement = cb; }

function notifier() {
  surChangement?.({
    enAttente: file.length + (enCours ? 1 : 0),
    erreurs: file.filter(j => j.erreur).length,
  });
}

export function enfiler(label, run) {
  file.push({ label, run, essais: 0, erreur: false });
  notifier();
  pomper();
}

async function pomper() {
  if (enCours) return;
  const job = file.find(j => !j.erreur);
  if (!job) { notifier(); return; }
  enCours = true;
  notifier();
  try {
    await job.run();
    file.splice(file.indexOf(job), 1);
  } catch (e) {
    job.essais += 1;
    if (job.essais >= 3) {
      job.erreur = true;
      console.error(`Échec définitif « ${job.label} » :`, e);
    } else {
      await new Promise(r => setTimeout(r, 1500 * job.essais));
    }
  }
  enCours = false;
  notifier();
  if (file.some(j => !j.erreur)) pomper();
}

export function reessayerErreurs() {
  for (const j of file) { j.erreur = false; j.essais = 0; }
  pomper();
}

window.addEventListener('beforeunload', (ev) => {
  if (file.length || enCours) {
    ev.preventDefault();
    ev.returnValue = 'Des envois sont en cours — quitter perdrait des modifications.';
  }
});
