// Atelier Images — orchestrateur : grille, filtres, sélection multiple,
// notes, éditeur de cadrage et flux d'enregistrement vers GitHub.

import { getToken, setToken, testerToken, getFichierTexte, putFichier,
         supprimerFichier, commitLot, getSha, blobVersBase64, enfiler,
         surFileChangee, reessayerErreurs, DEPOT } from './github.js';
import { Editeur } from './editeur.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const TAGS = ['hors-sujet', 'mauvaise qualité', 'style incohérent',
              'mauvaise page liée', 'recadrer', 'supprimer la carte'];

const RARETES = ['commune', 'rare', 'epique', 'mythique', 'legendaire'];
const COULEUR_RARETE = { commune: '#8a93a6', rare: '#4aa8ff', epique: '#b05cff',
                         mythique: '#ff5cd0', legendaire: '#ffd166' };

function slugifier(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Mutation sérialisée d'un fichier data/<col>.json : relecture fraîche
// (sha + contenu) DANS le job, application, écriture — un conflit relance
// le job entier, donc jamais d'écrasement entre appareils.
function jobModifierCollection(colSlug, message, muter) {
  enfiler(message, async () => {
    const chemin = `data/${colSlug}.json`;
    const { texte, sha } = await getFichierTexte(chemin);
    const d = JSON.parse(texte);
    muter(d);
    await putFichier(chemin,
      btoa(unescape(encodeURIComponent(JSON.stringify(d)))), message, sha);
  });
}

let collections = [];          // [{slug, nom, cartes:[...]}]
let parId = new Map();
let sourcesImages = {};
let notes = { version: 1, statuts: {}, cadrages: {}, notes: [] };
let notesSha = null;
let selection = new Set();
let modeSelection = false;
let carteEnEdition = null;
let editeur = null;
let remplacementEnCours = false;
// aperçus locaux (blob) des cartes éditées cette session : la grille les
// utilise en priorité, sans attendre la republication GitHub Pages
const apercusLocaux = {};
// les fichiers fraîchement committés sont servis IMMÉDIATEMENT par raw
// (Pages met ~1 min à republier)
const RAW = `https://raw.githubusercontent.com/${DEPOT}/main/`;

const $ = s => document.querySelector(s);

/* ================= chargement ================= */

async function demarrer() {
  surFileChangee(majBadgeEnvoi);
  brancherOnglets();
  rendreConfig();
  if (!getToken()) { afficherVue('config'); }

  const bust = `?v=${Date.now()}`;
  const index = await (await fetch('data/collections.json' + bust)).json();
  const fichiers = await Promise.all(index.collections.map(c =>
    fetch(c.fichier + bust).then(r => r.json())));
  collections = fichiers.map(f => ({ slug: f.slug, nom: f.collection, cartes: f.cartes }));
  for (const col of collections) for (const c of col.cartes) parId.set(c.id, c);
  try {
    sourcesImages = await (await fetch('build/images_sources.json' + bust)).json();
  } catch { sourcesImages = {}; }
  try {
    const { texte, sha } = getToken()
      ? await getFichierTexte('build/notes_atelier.json')
      : { texte: await (await fetch('build/notes_atelier.json' + bust)).text(), sha: null };
    if (texte) notes = { ...notes, ...JSON.parse(texte) };
    notesSha = sha;
  } catch { /* première utilisation */ }

  remplirFiltres();
  rendreGrille();
  rendreNotes();
  brancherEditeur();
  brancherSelection();
}

/* ================= vues / entête ================= */

function afficherVue(nom) {
  for (const b of document.querySelectorAll('#onglets button')) {
    b.classList.toggle('actif', b.dataset.vue === nom);
  }
  for (const v of document.querySelectorAll('.vue')) {
    v.classList.toggle('visible', v.id === `vue-${nom}`);
  }
}

function brancherOnglets() {
  for (const b of document.querySelectorAll('#onglets button')) {
    b.addEventListener('click', () => afficherVue(b.dataset.vue));
  }
}

function majBadgeEnvoi({ enAttente, erreurs }) {
  const el = $('#badge-envoi');
  el.hidden = enAttente === 0 && erreurs === 0;
  el.textContent = erreurs ? `⚠ ${erreurs} échec(s) — réessayer` : `⬆ ${enAttente} envoi(s)…`;
  el.classList.toggle('erreur', erreurs > 0);
  el.onclick = erreurs ? reessayerErreurs : null;
}

/* ================= grille ================= */

function statutDe(id) {
  if (notes.cadrages[id]) return 'editee';
  return notes.statuts[id] || '';
}

function aUneNote(id) {
  return notes.notes.some(n => n.statut === 'ouverte' && n.images.includes(id));
}

function remplirFiltres() {
  $('#f-collection').innerHTML = '<option value="">Toutes les collections</option>' +
    collections.map(c => `<option value="${c.slug}">${esc(c.nom)}</option>`).join('');
  const sources = [...new Set(Object.values(sourcesImages).map(v => v.source))].sort();
  $('#f-source').innerHTML = '<option value="">Toutes les sources</option>' +
    sources.map(s => `<option>${esc(s)}</option>`).join('');
  for (const id of ['f-collection', 'f-source', 'f-statut', 'f-texte']) {
    $('#' + id).addEventListener('input', rendreGrille);
  }
}

function carteVisible(carte) {
  const fc = $('#f-collection').value, fs = $('#f-source').value;
  const ft = $('#f-statut').value, fq = $('#f-texte').value.trim().toLowerCase();
  if (fs && (sourcesImages[carte.id]?.source || '?') !== fs) return false;
  if (fq && !carte.nom.toLowerCase().includes(fq)) return false;
  const st = statutDe(carte.id);
  if (ft === 'revoir' && st !== 'revoir') return false;
  if (ft === 'ok' && st !== 'ok') return false;
  if (ft === 'editee' && st !== 'editee') return false;
  if (ft === 'note' && !aUneNote(carte.id)) return false;
  if (ft === 'aucun' && (st || aUneNote(carte.id))) return false;
  return true;
}

function rendreGrille() {
  const fc = $('#f-collection').value;
  const conteneur = $('#vue-grille');
  const parts = [];
  let total = 0;
  const sommaire = [];
  for (const col of collections) {
    if (fc && col.slug !== fc) continue;
    const visibles = col.cartes.filter(carteVisible);
    if (!visibles.length) continue;
    total += visibles.length;
    sommaire.push(`<a href="#col-${col.slug}">${esc(col.nom)} (${visibles.length})</a>`);
    parts.push(`<h2 id="col-${col.slug}">${esc(col.nom)} <small>${visibles.length}</small></h2>
      <div class="grille">` + visibles.map(c => {
        const st = statutDe(c.id);
        const pastille = { revoir: '⚠', ok: '✓', editee: '✂' }[st] || '';
        const note = aUneNote(c.id) ? '<span class="v-note">📝</span>' : '';
        const sel = selection.has(c.id) ? ' selectionnee' : '';
        const cad = notes.cadrages[c.id];
        const src = apercusLocaux[c.id]
          || (cad ? `${RAW}${c.thumbUrl}?v=${cad.editeLe}` : c.thumbUrl);
        return `<div class="vignette${sel}" data-id="${esc(c.id)}"
                     style="--rar:${COULEUR_RARETE[c.rarete]}">
          <img src="${esc(src)}" loading="lazy" alt="">
          <button class="v-statut ${st}" data-statut="${esc(c.id)}" title="statut">${pastille || '·'}</button>
          ${note}
          <div class="v-nom">${esc(c.nom)}</div>
          <div class="v-source"><b class="v-rarete">${esc(c.rarete)}</b> ·
            ${esc(sourcesImages[c.id]?.source || '?')}</div>
        </div>`;
      }).join('') + '</div>');
  }
  conteneur.innerHTML =
    `<nav class="sommaire">${sommaire.join('')}</nav>
     <p class="doux">${total} carte(s) affichée(s)</p>` + parts.join('');

  conteneur.onclick = (ev) => {
    const btnStatut = ev.target.closest('[data-statut]');
    if (btnStatut) {
      const id = btnStatut.dataset.statut;
      const suite = { '': 'revoir', revoir: 'ok', ok: '' };
      const st = notes.statuts[id] || '';
      if (suite[st] === '') delete notes.statuts[id];
      else notes.statuts[id] = suite[st] ?? 'revoir';
      planifierSauvegardeNotes();
      rendreGrille();
      return;
    }
    const vignette = ev.target.closest('.vignette');
    if (!vignette) return;
    const id = vignette.dataset.id;
    if (modeSelection) {
      if (selection.has(id)) selection.delete(id); else selection.add(id);
      vignette.classList.toggle('selectionnee');
      $('#nb-selection').textContent = `${selection.size} sélectionnée(s)`;
    } else {
      ouvrirEditeur(parId.get(id));
    }
  };
}

/* ================= sélection multiple + notes groupées ================= */

function brancherSelection() {
  $('#btn-selection').addEventListener('click', () => {
    modeSelection = !modeSelection;
    selection.clear();
    $('#barre-selection').hidden = !modeSelection;
    $('#btn-selection').classList.toggle('btn-primaire', modeSelection);
    $('#nb-selection').textContent = '0 sélectionnée(s)';
    rendreGrille();
  });
  $('#btn-selection-fin').addEventListener('click', () => $('#btn-selection').click());
  $('#btn-note-creer').addEventListener('click', () => {
    if (!selection.size) return alert('Sélectionne au moins une image.');
    modaleNote([...selection]);
  });
  $('#btn-note-ajouter').addEventListener('click', () => {
    if (!selection.size) return alert('Sélectionne au moins une image.');
    modaleAjoutNote([...selection]);
  });
}

function modaleNote(ids, noteExistante = null) {
  const n = noteExistante;
  ouvrirModale(`
    <h3>${n ? 'Modifier la note' : `Nouvelle note (${ids.length} image(s))`}</h3>
    <div class="tags">${TAGS.map(t => `<label><input type="checkbox" value="${t}"
      ${n?.tags.includes(t) ? 'checked' : ''}> ${t}</label>`).join('')}</div>
    <textarea id="m-texte" rows="4" placeholder="Remarques pour Claude…">${esc(n?.texte || '')}</textarea>
    <div class="m-boutons">
      <button class="btn btn-primaire" id="m-ok">Enregistrer</button>
      <button class="btn btn-discret" id="m-annuler">Annuler</button>
    </div>`);
  $('#m-ok').onclick = () => {
    const tags = [...document.querySelectorAll('#modale .tags input:checked')].map(i => i.value);
    const texte = $('#m-texte').value.trim();
    if (!tags.length && !texte) return alert('Note vide.');
    if (n) { n.tags = tags; n.texte = texte; n.majLe = Date.now(); }
    else notes.notes.push({ id: 'n' + Date.now(), tags, texte, images: [...new Set(ids)],
                            statut: 'ouverte', creeLe: Date.now(), majLe: Date.now() });
    planifierSauvegardeNotes();
    fermerModale(); rendreNotes(); rendreGrille();
    if (modeSelection) $('#btn-selection').click();
  };
  $('#m-annuler').onclick = fermerModale;
}

function modaleAjoutNote(ids) {
  const ouvertes = notes.notes.filter(n => n.statut === 'ouverte');
  if (!ouvertes.length) return modaleNote(ids);
  ouvrirModale(`
    <h3>Ajouter ${ids.length} image(s) à une note</h3>
    <div class="liste-choix">${ouvertes.map(n => `
      <button class="btn choix-note" data-note="${n.id}">
        ${esc((n.texte || n.tags.join(', ')).slice(0, 80))}
        <small>${n.images.length} image(s)</small></button>`).join('')}</div>
    <div class="m-boutons"><button class="btn btn-discret" id="m-annuler">Annuler</button></div>`);
  for (const b of document.querySelectorAll('.choix-note')) {
    b.onclick = () => {
      const n = notes.notes.find(x => x.id === b.dataset.note);
      n.images = [...new Set([...n.images, ...ids])];
      n.majLe = Date.now();
      planifierSauvegardeNotes();
      fermerModale(); rendreNotes(); rendreGrille();
      if (modeSelection) $('#btn-selection').click();
    };
  }
  $('#m-annuler').onclick = fermerModale;
}

/* ================= écran Notes ================= */

function rendreNotes() {
  const ouvertes = notes.notes.filter(n => n.statut === 'ouverte');
  $('#nb-notes').textContent = ouvertes.length ? `(${ouvertes.length})` : '';
  const bloc = n => `
    <div class="note ${n.statut}">
      <div class="note-tags">${n.tags.map(t => `<span>${esc(t)}</span>`).join('')}
        <small>${new Date(n.creeLe).toLocaleDateString('fr-FR')} · ${n.statut}</small></div>
      <p>${esc(n.texte) || '<i>(tags seulement)</i>'}</p>
      <div class="note-images">${n.images.map(id => {
        const c = parId.get(id);
        return c ? `<img src="${esc(c.thumbUrl)}" title="${esc(c.nom)}" data-ouvrir="${esc(id)}">` : '';
      }).join('')}</div>
      <div class="m-boutons">
        <button class="btn btn-discret" data-modifier="${n.id}">Modifier</button>
        <button class="btn btn-discret" data-basculer="${n.id}">
          ${n.statut === 'ouverte' ? 'Marquer traitée' : 'Rouvrir'}</button>
        <button class="btn btn-discret" data-supprimer="${n.id}">Supprimer</button>
      </div>
    </div>`;
  $('#vue-notes').innerHTML = notes.notes.length
    ? [...notes.notes].sort((a, b) => (a.statut === 'ouverte' ? 0 : 1) - (b.statut === 'ouverte' ? 0 : 1)
        || b.majLe - a.majLe).map(bloc).join('')
    : '<p class="doux" style="padding:20px">Aucune note. Sélectionne des images dans la grille ou ouvre une carte pour en créer.</p>';

  $('#vue-notes').onclick = (ev) => {
    const t = ev.target;
    if (t.dataset.ouvrir) { afficherVue('grille'); ouvrirEditeur(parId.get(t.dataset.ouvrir)); }
    const n = notes.notes.find(x => x.id === (t.dataset.modifier || t.dataset.basculer || t.dataset.supprimer));
    if (!n) return;
    if (t.dataset.modifier) modaleNote(n.images, n);
    if (t.dataset.basculer) {
      n.statut = n.statut === 'ouverte' ? 'traitee' : 'ouverte';
      n.majLe = Date.now();
      planifierSauvegardeNotes(); rendreNotes();
    }
    if (t.dataset.supprimer && confirm('Supprimer cette note ?')) {
      notes.notes = notes.notes.filter(x => x !== n);
      planifierSauvegardeNotes(); rendreNotes(); rendreGrille();
    }
  };
}

/* ================= éditeur ================= */

function brancherEditeur() {
  editeur = new Editeur($('#ed-conteneur'), $('#ed-image'), $('#ed-canvas-apercu'));
  $('#ed-fermer').addEventListener('click', fermerEditeur);
  $('#ed-f-enregistrer').addEventListener('click', enregistrerFiche);
  $('#ed-f-supprimer').addEventListener('click', supprimerCarte);
  $('#btn-nouvelle').addEventListener('click', modaleNouvelleCarte);
  $('#ed-copier').addEventListener('click', async () => {
    if (!carteEnEdition) return;
    await navigator.clipboard.writeText(carteEnEdition.nom);
    const b = $('#ed-copier');
    b.textContent = '✓';
    setTimeout(() => { b.textContent = '📋'; }, 1200);
  });
  $('#ed-plus').addEventListener('click', () => editeur.zoomer(1.2));
  $('#ed-moins').addEventListener('click', () => editeur.zoomer(1 / 1.2));
  $('#ed-reset').addEventListener('click', () => editeur.reset());
  $('#ed-enregistrer').addEventListener('click', enregistrerCadrage);
  $('#ed-note').addEventListener('click', () => carteEnEdition && modaleNote([carteEnEdition.id]));
  $('#ed-remplacer').addEventListener('click', modaleRemplacement);
  $('#ed-fichier').addEventListener('change', async () => {
    const f = $('#ed-fichier').files[0];
    if (f) { await chargerRemplacement(f); $('#ed-fichier').value = ''; }
  });
  // coller une image n'importe où dans l'éditeur
  document.addEventListener('paste', async (ev) => {
    if ($('#editeur').hidden) return;
    // dans un champ de saisie (fiche, notes…), le collage reste normal
    if (ev.target.closest('input, textarea, select, [contenteditable]')) return;
    const item = [...(ev.clipboardData?.items || [])].find(i => i.type.startsWith('image/'));
    if (item) { ev.preventDefault(); await chargerRemplacement(item.getAsFile()); return; }
    const texte = ev.clipboardData?.getData('text');
    if (texte && /^https?:\/\//.test(texte.trim())) {
      ev.preventDefault();
      await chargerRemplacementURL(texte.trim());
    }
  });
  // glisser-déposer un fichier
  const ed = $('#editeur');
  ed.addEventListener('dragover', ev => ev.preventDefault());
  ed.addEventListener('drop', async (ev) => {
    ev.preventDefault();
    const f = ev.dataTransfer?.files?.[0];
    if (f && f.type.startsWith('image/')) await chargerRemplacement(f);
  });
}

function cheminsDe(carte) {
  const [col, slug] = [carte.id.split('_', 1)[0], carte.id.split('_').slice(1).join('_')];
  return {
    orig: `images/originaux/${col}/${slug}.webp`,
    full: `images/full/${col}/${slug}.webp`,
    thumb: `images/thumbs/${col}/${slug}.webp`,
  };
}

async function ouvrirEditeur(carte) {
  carteEnEdition = carte;
  remplacementEnCours = false;
  $('#ed-nom').textContent = carte.nom;
  $('#ed-infos').textContent = ` ${carte.collection} · image : ${sourcesImages[carte.id]?.source || '?'}`;
  // fiche éditable
  $('#ed-f-nom').value = carte.nom;
  $('#ed-f-lien').value = carte.lienWikipedia || '';
  $('#ed-f-rarete').innerHTML = RARETES.map(r =>
    `<option value="${r}" ${r === carte.rarete ? 'selected' : ''}>${r}</option>`).join('');
  $('#editeur').hidden = false;
  if (carte._nouvelle) {
    // carte fraîchement créée : pas encore d'image -> proposer d'en coller une
    editeur.source = null;
    $('#ed-image').removeAttribute('src');
    modaleRemplacement();
    return;
  }
  const cad = notes.cadrages[carte.id];
  // ordre : original (raw = frais immédiatement) puis full (raw) puis full
  // relatif — jamais d'échec juste parce que Pages n'a pas fini de republier
  const sources = [];
  if (cad?.original) sources.push(RAW + cheminsDe(carte).orig);
  sources.push(RAW + carte.imageUrl, carte.imageUrl);
  let chargee = false;
  for (const s of sources) {
    try {
      await editeur.chargerDepuisURL(s + `?v=${Date.now()}`);
      chargee = true;
      break;
    } catch { /* source suivante */ }
  }
  if (!chargee) { alert('Impossible de charger l’image de cette carte.'); return; }
  if (cad) editeur.setCadrage(cad);
}

function fermerEditeur() {
  $('#editeur').hidden = true;
  carteEnEdition = null;
}

function modaleRemplacement() {
  ouvrirModale(`
    <h3>Remplacer l'image</h3>
    <p class="doux">Trois moyens :</p>
    <input type="url" id="m-url" placeholder="Coller l'URL d'une image puis Entrée…">
    <p class="doux">— ou colle une image (Ctrl+V) n'importe où dans l'éditeur —</p>
    <div class="m-boutons">
      <button class="btn" id="m-fichier">📁 Choisir un fichier…</button>
      <button class="btn btn-discret" id="m-annuler">Annuler</button>
    </div>`);
  $('#m-url').addEventListener('keydown', async (ev) => {
    if (ev.key === 'Enter' && $('#m-url').value.trim()) {
      fermerModale();
      await chargerRemplacementURL($('#m-url').value.trim());
    }
  });
  $('#m-fichier').onclick = () => { fermerModale(); $('#ed-fichier').click(); };
  $('#m-annuler').onclick = fermerModale;
}

async function chargerRemplacementURL(url) {
  // tentative directe (si le serveur accepte CORS), sinon proxy weserv
  const candidates = [url,
    'https://images.weserv.nl/?url=' + encodeURIComponent(url.replace(/^https?:\/\//, '')) + '&w=1600'];
  for (const u of candidates) {
    try { await editeur.chargerDepuisURL(u); remplacementEnCours = true; return; }
    catch { /* essaie le suivant */ }
  }
  alert('Impossible de charger cette URL (essaie de coller l’image elle-même avec Ctrl+V).');
}

async function chargerRemplacement(blob) {
  await editeur.chargerDepuisBlob(blob);
  remplacementEnCours = true;
}

/* ---------- fiche : rareté / nom / lien / suppression / création ---------- */

function colSlugDe(carte) { return carte.id.split('_', 1)[0]; }

function enregistrerFiche() {
  if (!carteEnEdition) return;
  if (!getToken()) { alert('Configure ton token GitHub (onglet ⚙).'); return; }
  const carte = carteEnEdition;
  const nom = $('#ed-f-nom').value.trim();
  const lien = $('#ed-f-lien').value.trim();
  const rarete = $('#ed-f-rarete').value;
  if (!nom) { alert('Le nom ne peut pas être vide.'); return; }
  if (lien && !/^https?:\/\//.test(lien)) { alert('Le lien doit être une URL complète.'); return; }
  // maj locale immédiate
  carte.nom = nom; carte.lienWikipedia = lien; carte.rarete = rarete;
  jobModifierCollection(colSlugDe(carte), `Atelier : fiche ${carte.id}`, (d) => {
    const c = d.cartes.find(x => x.id === carte.id);
    if (!c) throw new Error(`carte ${carte.id} introuvable dans le fichier`);
    c.nom = nom; c.lienWikipedia = lien; c.rarete = rarete;
  });
  $('#ed-nom').textContent = nom;
  rendreGrille();
}

function supprimerCarte() {
  if (!carteEnEdition) return;
  if (!getToken()) { alert('Configure ton token GitHub (onglet ⚙).'); return; }
  const carte = carteEnEdition;
  if (!confirm(`Supprimer définitivement « ${carte.nom} » de ${carte.collection} ?`)) return;
  const colSlug = colSlugDe(carte);
  // maj locale immédiate
  const col = collections.find(c => c.slug === colSlug);
  col.cartes = col.cartes.filter(c => c.id !== carte.id);
  parId.delete(carte.id);
  delete notes.statuts[carte.id];
  delete notes.cadrages[carte.id];
  planifierSauvegardeNotes();
  jobModifierCollection(colSlug, `Atelier : suppression ${carte.id}`, (d) => {
    d.cartes = d.cartes.filter(c => c.id !== carte.id);
  });
  const ch = cheminsDe(carte);
  enfiler(`images de ${carte.nom} (suppression)`, async () => {
    // un seul commit de suppression pour les fichiers existants
    const fichiers = [];
    for (const p of [ch.thumb, ch.full, ch.orig]) {
      if (await getSha(p)) fichiers.push({ chemin: p, base64: null });
    }
    if (fichiers.length) {
      await commitLot(fichiers, `Atelier : suppression images ${carte.id}`);
    }
  });
  fermerEditeur();
  rendreGrille();
}

function modaleNouvelleCarte() {
  if (!getToken()) { alert('Configure ton token GitHub (onglet ⚙).'); return; }
  const preselection = $('#f-collection').value;
  ouvrirModale(`
    <h3>Nouvelle carte</h3>
    <label class="doux">Collection</label>
    <select id="m-col">${collections.map(c =>
      `<option value="${c.slug}" ${c.slug === preselection ? 'selected' : ''}>${esc(c.nom)}</option>`).join('')}</select>
    <input id="m-nom" placeholder="Nom de la carte">
    <input id="m-lien" type="url" placeholder="Lien Wikipédia (https://…)">
    <label class="doux">Rareté</label>
    <select id="m-rarete">${RARETES.map(r => `<option>${r}</option>`).join('')}</select>
    <input id="m-pv" type="number" placeholder="PV (20-340)" value="120" min="1">
    <div class="m-boutons">
      <button class="btn btn-primaire" id="m-creer">Créer puis choisir l'image</button>
      <button class="btn btn-discret" id="m-annuler">Annuler</button>
    </div>`);
  $('#m-annuler').onclick = fermerModale;
  $('#m-creer').onclick = () => {
    const colSlug = $('#m-col').value;
    const nom = $('#m-nom').value.trim();
    const lien = $('#m-lien').value.trim();
    const rarete = $('#m-rarete').value;
    const pv = Math.max(1, Math.round(Number($('#m-pv').value) || 120));
    if (!nom) { alert('Il faut un nom.'); return; }
    const col = collections.find(c => c.slug === colSlug);
    let slug = slugifier(nom) || 'carte';
    while (parId.has(`${colSlug}_${slug}`)) slug += '-b';
    const carte = {
      id: `${colSlug}_${slug}`, nom, titrePage: nom,
      imageUrl: `images/full/${colSlug}/${slug}.webp`,
      thumbUrl: `images/thumbs/${colSlug}/${slug}.webp`,
      description: '', collection: col.nom, rarete, pv,
      lienWikipedia: lien, pageviews: 0,
      numero: Math.max(0, ...col.cartes.map(c => c.numero || 0)) + 1,
      _nouvelle: true,
    };
    col.cartes.push(carte);
    parId.set(carte.id, carte);
    const { _nouvelle, ...carteProre } = carte;
    jobModifierCollection(colSlug, `Atelier : création ${carte.id}`, (d) => {
      if (!d.cartes.some(c => c.id === carte.id)) d.cartes.push(carteProre);
    });
    fermerModale();
    rendreGrille();
    ouvrirEditeur(carte);   // enchaîne sur le choix de l'image
  };
}

/* ---------- enregistrement (file GitHub) ---------- */

async function enregistrerCadrage() {
  if (!carteEnEdition) return;
  if (!getToken()) { alert('Configure ton token GitHub (onglet ⚙) avant d’enregistrer.'); return; }
  if (!editeur.source) { alert('Choisis d’abord une image (🔄 Remplacer).'); return; }
  delete carteEnEdition._nouvelle;
  const carte = carteEnEdition;
  const chemins = cheminsDe(carte);
  const cadrage = editeur.getCadrage();
  const remplacement = remplacementEnCours;
  const dejaOriginal = !!notes.cadrages[carte.id]?.original;

  const { full, thumb } = await editeur.exporter();
  const blobOriginal = (remplacement || !dejaOriginal)
    ? (remplacement ? await editeur.exporterOriginal()
                    : await (await fetch(RAW + carte.imageUrl + `?v=${Date.now()}`)
                             .catch(() => fetch(carte.imageUrl))).blob())
    : null;

  // aperçu local : la grille l'affichera tant que la session est ouverte,
  // sans attendre la republication GitHub Pages
  apercusLocaux[carte.id] = URL.createObjectURL(thumb);

  notes.cadrages[carte.id] = { ...cadrage, original: true, editeLe: Date.now() };
  planifierSauvegardeNotes();
  rendreGrille();

  // UN SEUL commit pour original+full+vignette : un build Pages au lieu de 3
  enfiler(`images ${carte.nom}`, async () => {
    const fichiers = [
      { chemin: chemins.full, base64: await blobVersBase64(full) },
      { chemin: chemins.thumb, base64: await blobVersBase64(thumb) },
    ];
    if (blobOriginal) {
      fichiers.unshift({ chemin: chemins.orig,
                         base64: await blobVersBase64(blobOriginal) });
    }
    await commitLot(fichiers, `Atelier : ${carte.id}`);
  });
  fermerEditeur();
}

/* ---------- sauvegarde des notes/statuts/cadrages ---------- */

let minuterieNotes = null;
function planifierSauvegardeNotes() {
  clearTimeout(minuterieNotes);
  minuterieNotes = setTimeout(() => {
    if (!getToken()) return;
    enfiler('notes_atelier.json', async () => {
      try {
        notesSha = await putFichier('build/notes_atelier.json',
          btoa(unescape(encodeURIComponent(JSON.stringify(notes, null, 1)))),
          'Atelier : notes/statuts/cadrages', notesSha ?? undefined);
      } catch (e) {
        if (String(e.message).includes('CONFLIT')) {
          // fusion basique : on repart du distant et on ré-applique le local
          const { texte, sha } = await getFichierTexte('build/notes_atelier.json');
          const distant = texte ? JSON.parse(texte) : {};
          notes = {
            ...distant, ...notes,
            statuts: { ...(distant.statuts || {}), ...notes.statuts },
            cadrages: { ...(distant.cadrages || {}), ...notes.cadrages },
            notes: fusionnerNotes(distant.notes || [], notes.notes),
          };
          notesSha = await putFichier('build/notes_atelier.json',
            btoa(unescape(encodeURIComponent(JSON.stringify(notes, null, 1)))),
            'Atelier : notes (fusion)', sha ?? undefined);
        } else throw e;
      }
    });
  }, 1200);
}

function fusionnerNotes(a, b) {
  const parIdNote = new Map();
  for (const n of [...a, ...b]) {
    const existant = parIdNote.get(n.id);
    if (!existant || n.majLe >= existant.majLe) parIdNote.set(n.id, n);
  }
  return [...parIdNote.values()];
}

/* ================= modale + config ================= */

function ouvrirModale(html) { $('#modale-boite').innerHTML = html; $('#modale').hidden = false; }
function fermerModale() { $('#modale').hidden = true; }
$('#modale').addEventListener('click', ev => { if (ev.target.id === 'modale') fermerModale(); });

function rendreConfig() {
  const ok = !!getToken();
  $('#vue-config').innerHTML = `
    <div class="panneau">
      <h3>Connexion GitHub</h3>
      <p class="doux">L'atelier écrit directement dans le dépôt <b>${DEPOT}</b>.
      Il faut un token « personnel (classic) » avec la portée <b>repo</b> :
      github.com → Settings → Developer settings → Personal access tokens →
      Generate new token (classic). Le token reste sur CET appareil.</p>
      <input type="password" id="cfg-token" placeholder="ghp_…" value="${ok ? '••••••••' : ''}">
      <div class="m-boutons">
        <button class="btn btn-primaire" id="cfg-ok">Enregistrer et tester</button>
        ${ok ? '<button class="btn btn-danger" id="cfg-deco">Déconnecter cet appareil</button>' : ''}
      </div>
      <p id="cfg-etat" class="doux">${ok ? '🟢 token enregistré' : '🔴 aucun token — lecture seule'}</p>
      <h3>Mode d'emploi</h3>
      <p class="doux">1. <b>Grille</b> : repère les intrus, filtre par source
      (« bing » d'abord), pastille ⚠/✓ pour suivre ta progression.<br>
      2. <b>Clic sur une image</b> : glisse-la sous le cadre, zoome à la
      molette ou au pincement, Enregistrer — la carte est republiée (~1 min).<br>
      3. <b>Remplacer</b> : colle une URL, une image (Ctrl+V) ou un fichier.<br>
      4. <b>Notes</b> : sélection multiple → note commune pour Claude, qui les
      traitera en batch (« traite les notes de l'atelier »).</p>
    </div>`;
  $('#cfg-ok').onclick = async () => {
    const v = $('#cfg-token').value.trim();
    if (v && !v.startsWith('•')) setToken(v);
    $('#cfg-etat').textContent = '… test en cours';
    $('#cfg-etat').textContent = (await testerToken().catch(() => false))
      ? '🟢 token valide — écriture activée' : '🔴 token invalide';
  };
  $('#cfg-deco')?.addEventListener('click', () => { setToken(''); rendreConfig(); });
}

demarrer();
