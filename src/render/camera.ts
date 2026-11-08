/** Screen-to-grid transform with eased movement. Scale is CSS pixels per grid cell. */
export class Camera {
  x = 0;
  y = 0;
  scale = 3;
  private tx = 0;
  private ty = 0;
  private ts = 3;
  vw = 1;
  vh = 1;
  gw = 1;
  gh = 1;
  minScale = 1;
  maxScale = 26;
  homeScale = 3;
  /** Screen edges covered by UI. The "centre" of the view is the centre of what is left. */
  private inL = 0;
  private inT = 0;
  private inR = 0;
  private inB = 0;

  setWorld(gw: number, gh: number): void {
    this.gw = gw;
    this.gh = gh;
    this.resize(this.vw, this.vh);
    this.home(true);
  }

  setInsets(l: number, t: number, r: number, b: number): void {
    this.inL = l;
    this.inT = t;
    this.inR = r;
    this.inB = b;
    this.resize(this.vw, this.vh);
  }

  private get offX(): number {
    return (this.inL - this.inR) / 2;
  }

  private get offY(): number {
    return (this.inT - this.inB) / 2;
  }

  resize(vw: number, vh: number): void {
    this.vw = Math.max(1, vw);
    this.vh = Math.max(1, vh);
    const fit = Math.min(this.vw / this.gw, this.vh / this.gh);
    const portrait = this.vh > this.vw * 1.15;
    // The outer ring of the map is open sea, so a little of it may safely sit under the HUD.
    const seaCells = 10;
    const usableW = this.vw - this.inL - this.inR;
    const usableH = this.vh - this.inT - this.inB;
    const inset = Math.min(usableW / this.gw, usableH / (this.gh - seaCells * 2));
    // Portrait starts wide enough to show your neighbours as well as your own land.
    this.homeScale = portrait ? (this.vh / this.gh) * 0.98 : Math.min(fit * 1.04, inset);
    this.minScale = fit * (portrait ? 1 : 0.8);
    this.clampTarget();
  }

  home(instant = false): void {
    this.ts = this.homeScale;
    this.tx = this.gw / 2 - this.offX / this.ts;
    this.ty = this.gh / 2 - this.offY / this.ts;
    this.clampTarget();
    if (instant) this.snap();
  }

  focus(gx: number, gy: number, scale?: number, instant = false): void {
    if (scale !== undefined) this.ts = Math.max(this.minScale, Math.min(this.maxScale, scale));
    this.tx = gx - this.offX / this.ts;
    this.ty = gy - this.offY / this.ts;
    this.clampTarget();
    if (instant) this.snap();
  }

  /** On a phone this flips between the close view and the whole world; elsewhere it just goes home. */
  toggleOverview(): void {
    const portrait = this.vh > this.vw * 1.15;
    if (portrait && this.ts >= this.homeScale * 0.95) {
      this.ts = this.minScale;
      this.tx = this.gw / 2 - this.offX / this.ts;
      this.ty = this.gh / 2 - this.offY / this.ts;
      this.clampTarget();
      return;
    }
    this.home();
  }

  /** Aim exactly here, ignoring the usual edge limits (used to frame the winner above a results panel). */
  pin(gx: number, gy: number, scale: number): void {
    this.ts = scale;
    this.tx = gx - this.offX / scale;
    this.ty = gy - this.offY / scale;
  }

  snap(): void {
    this.x = this.tx;
    this.y = this.ty;
    this.scale = this.ts;
  }

  panBy(dxPx: number, dyPx: number): void {
    this.tx -= dxPx / this.scale;
    this.ty -= dyPx / this.scale;
    this.clampTarget();
    this.x = this.tx;
    this.y = this.ty;
  }

  zoomAt(sx: number, sy: number, factor: number): void {
    const before = this.toGrid(sx, sy);
    const next = Math.max(this.minScale, Math.min(this.maxScale, this.ts * factor));
    this.ts = next;
    this.tx = before[0] - (sx - this.vw / 2) / next;
    this.ty = before[1] - (sy - this.vh / 2) / next;
    this.clampTarget();
  }

  private clampTarget(): void {
    const halfW = this.vw / 2 / this.ts;
    const halfH = this.vh / 2 / this.ts;
    const ox = this.offX / this.ts;
    const oy = this.offY / this.ts;
    // A map edge may rest against the HUD rather than the screen edge, so land near a coast can
    // always be brought into the clear part of the screen.
    // It locks to centre only when the whole map fits between the panels.
    const clearW = (this.vw - this.inL - this.inR) / this.ts;
    const clearH = (this.vh - this.inT - this.inB) / this.ts;
    this.tx = clearW >= this.gw ? this.gw / 2 - ox : Math.max(halfW - this.inL / this.ts, Math.min(this.gw - halfW + this.inR / this.ts, this.tx));
    this.ty = clearH >= this.gh ? this.gh / 2 - oy : Math.max(halfH - this.inT / this.ts, Math.min(this.gh - halfH + this.inB / this.ts, this.ty));
  }

  update(dt: number): void {
    const k = 1 - Math.exp(-dt * 12);
    this.x += (this.tx - this.x) * k;
    this.y += (this.ty - this.y) * k;
    this.scale += (this.ts - this.scale) * k;
  }

  toGrid(sx: number, sy: number): [number, number] {
    return [this.x + (sx - this.vw / 2) / this.scale, this.y + (sy - this.vh / 2) / this.scale];
  }

  toScreenX(gx: number): number {
    return (gx - this.x) * this.scale + this.vw / 2;
  }

  toScreenY(gy: number): number {
    return (gy - this.y) * this.scale + this.vh / 2;
  }
}
