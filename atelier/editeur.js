// Atelier — éditeur de cadrage : la photo ENTIÈRE sous un cadre 4:3 fixe
// (= exactement ce que la carte affiche). Glisser pour positionner, molette
// pour zoomer vers le curseur, pincement à deux doigts sur tactile.
// Le zoom minimal couvre toujours le cadre (jamais de bandes vides).

const RATIO = 4 / 3;          // cadre de l'illustration des cartes
export const EXPORT_FULL = [800, 600];
export const EXPORT_THUMB = [213, 160];

export class Editeur {
  constructor(conteneur, img, canvasApercu) {
    this.conteneur = conteneur;   // .ed-cadre-conteneur (le cadre = ses bords)
    this.img = img;               // <img> transformée en CSS
    this.apercu = canvasApercu;
    this.pointeurs = new Map();   // pincement : jusqu'à 2 pointeurs suivis
    this.s = 1; this.tx = 0; this.ty = 0;
    this.iw = 0; this.ih = 0;
    this._brancher();
  }

  /* ---------- chargement ---------- */

  chargerDepuisURL(url) {
    return new Promise((res, rej) => {
      const im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = () => { this._prendre(im); res(); };
      im.onerror = () => rej(new Error('image illisible : ' + url.slice(0, 80)));
      im.src = url;
    });
  }

  chargerDepuisBlob(blob) {
    return this.chargerDepuisURL(URL.createObjectURL(blob));
  }

  _prendre(im) {
    this.source = im;
    this.iw = im.naturalWidth; this.ih = im.naturalHeight;
    this.img.src = im.src;
    this.reset();
  }

  /* ---------- géométrie ---------- */

  get fw() { return this.conteneur.clientWidth; }
  get fh() { return this.conteneur.clientHeight; }
  get sMin() { return Math.max(this.fw / this.iw, this.fh / this.ih); }

  reset() {
    this.s = this.sMin;
    this.tx = (this.fw - this.iw * this.s) / 2;
    this.ty = (this.fh - this.ih * this.s) / 2;
    this._rendre();
  }

  _clamp() {
    this.s = Math.max(this.sMin, Math.min(this.s, this.sMin * 12));
    this.tx = Math.min(0, Math.max(this.fw - this.iw * this.s, this.tx));
    this.ty = Math.min(0, Math.max(this.fh - this.ih * this.s, this.ty));
  }

  _rendre() {
    this._clamp();
    this.img.style.transform = `translate(${this.tx}px, ${this.ty}px) scale(${this.s})`;
    this._rendreApercu();
  }

  zoomer(facteur, px = this.fw / 2, py = this.fh / 2) {
    const avant = this.s;
    this.s *= facteur;
    this._clamp();
    const reel = this.s / avant;
    this.tx = px - (px - this.tx) * reel;
    this.ty = py - (py - this.ty) * reel;
    this._rendre();
  }

  // rectangle recadré, en pixels de l'image source
  _rectSource() {
    return { x: -this.tx / this.s, y: -this.ty / this.s,
             w: this.fw / this.s, h: this.fh / this.s };
  }

  // cadrage normalisé persistable {cx, cy, w} (fractions de l'image)
  getCadrage() {
    const r = this._rectSource();
    return { cx: (r.x + r.w / 2) / this.iw, cy: (r.y + r.h / 2) / this.ih,
             w: r.w / this.iw };
  }

  setCadrage(c) {
    if (!c || !c.w) { this.reset(); return; }
    this.s = this.fw / (c.w * this.iw);
    const r = { w: this.fw / this.s, h: this.fh / this.s };
    this.tx = -(c.cx * this.iw - r.w / 2) * this.s;
    this.ty = -(c.cy * this.ih - r.h / 2) * this.s;
    this._rendre();
  }

  /* ---------- exports ---------- */

  _dessiner(canvas, [W, H]) {
    const r = this._rectSource();
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.source, r.x, r.y, r.w, r.h, 0, 0, W, H);
  }

  _versBlob(canvas, qualite) {
    return new Promise(res => canvas.toBlob(res, 'image/webp', qualite));
  }

  async exporter() {
    const c1 = document.createElement('canvas');
    this._dessiner(c1, EXPORT_FULL);
    const c2 = document.createElement('canvas');
    this._dessiner(c2, EXPORT_THUMB);
    return { full: await this._versBlob(c1, 0.9), thumb: await this._versBlob(c2, 0.82) };
  }

  // l'image source complète re-encodée (≤1600 px) pour images/originaux/
  async exporterOriginal() {
    const c = document.createElement('canvas');
    const k = Math.min(1, 1600 / Math.max(this.iw, this.ih));
    c.width = Math.round(this.iw * k); c.height = Math.round(this.ih * k);
    c.getContext('2d').drawImage(this.source, 0, 0, c.width, c.height);
    return this._versBlob(c, 0.92);
  }

  _rendreApercu() {
    if (!this.source || !this.apercu) return;
    this._dessiner(this.apercu, [this.apercu.width, this.apercu.height]);
  }

  /* ---------- interactions ---------- */

  _brancher() {
    const el = this.conteneur;
    el.addEventListener('pointerdown', (ev) => {
      el.setPointerCapture(ev.pointerId);
      this.pointeurs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      ev.preventDefault();
    });
    el.addEventListener('pointermove', (ev) => {
      const p = this.pointeurs.get(ev.pointerId);
      if (!p) return;
      const autres = [...this.pointeurs.entries()].filter(([id]) => id !== ev.pointerId);
      if (autres.length === 0) {
        this.tx += ev.clientX - p.x;
        this.ty += ev.clientY - p.y;
        this._rendre();
      } else {
        // pincement : zoom autour du milieu des deux doigts
        const q = autres[0][1];
        const dAvant = Math.hypot(p.x - q.x, p.y - q.y);
        const dApres = Math.hypot(ev.clientX - q.x, ev.clientY - q.y);
        const rect = el.getBoundingClientRect();
        const mx = (ev.clientX + q.x) / 2 - rect.left;
        const my = (ev.clientY + q.y) / 2 - rect.top;
        if (dAvant > 0) this.zoomer(dApres / dAvant, mx, my);
      }
      p.x = ev.clientX; p.y = ev.clientY;
      ev.preventDefault();
    });
    const fin = (ev) => this.pointeurs.delete(ev.pointerId);
    el.addEventListener('pointerup', fin);
    el.addEventListener('pointercancel', fin);
    el.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const rect = el.getBoundingClientRect();
      this.zoomer(ev.deltaY < 0 ? 1.1 : 1 / 1.1,
                  ev.clientX - rect.left, ev.clientY - rect.top);
    }, { passive: false });
  }
}
