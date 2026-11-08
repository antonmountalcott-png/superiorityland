import { B, Terrain, WATER } from '../core/balance';
import { BARKS, LINES, type Nation } from '../core/nations';
import type { Attack, Game, GameEvent, Player } from '../core/sim';
import { type Expression, SOLDIER_SPRITE, SOLDIER_TOP, drawBall, soldierSprite } from './ballArt';
import type { Camera } from './camera';
import { buildingSprite, capitalSprite, citySprite, mineSprite } from './icons';

const FONT = '"Lilita One", "Trebuchet MS", sans-serif';
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

/** Smallest on-screen leader ball. Set per layout: short landscape screens need smaller balls. */
let ballFloor = 19;
const leaderRadius = (r: number, scale: number) => Math.max(ballFloor, Math.min(46, r * (scale / 3.4) * 2.1));
const soldierRadius = (scale: number) => Math.max(7.8, Math.min(12, scale * 1.5));

export const fmt = (n: number): string => {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  // Always round down, so every readout of the same number agrees.
  if (n >= 10000) return `${Math.floor(n / 1000)}k`;
  if (n >= 1000) return `${(Math.floor(n / 100) / 10).toFixed(1)}k`;
  return `${Math.round(n)}`;
};

interface Soldier { x: number; y: number; vx: number; vy: number; life: number; max: number; nation: Nation; phase: number; flip: boolean; clash: boolean }
interface Particle { x: number; y: number; vx: number; vy: number; g: number; life: number; max: number; r: number; color: string; kind: 'dot' | 'smoke' | 'star' | 'spark' | 'ball' | 'puff'; nation?: Nation; rot?: number }
interface Ring { x: number; y: number; r0: number; r1: number; life: number; max: number; color: string; lw: number }
interface Scorch { x: number; y: number; r: number; life: number; max: number; pts: number[]; rocks: { a: number; d: number; s: number }[] }
/** A defeated leader's last moment: launched skyward, spinning, waving a white flag. */
interface Fall { x: number; y: number; vx: number; vy: number; rot: number; vr: number; r: number; nation: Nation; life: number }
interface Floater { x: number; y: number; text: string; color: string; life: number; max: number; size: number; word?: boolean }
interface Bubble { player: number; text: string; life: number; max: number }
interface Flash { x: number; y: number; r: number; life: number; max: number }
interface Confetti { x: number; y: number; vx: number; vy: number; rot: number; vr: number; w: number; h: number; color: string }
export interface Rect { x0: number; y0: number; x1: number; y1: number }

interface Leader {
  x: number; y: number; tx: number; ty: number; r: number; alive: boolean;
  lastLand: number; bounce: number; hurt: number; expr: Expression; lookX: number; lookY: number;
  blink: number; nextBlink: number; happy: number; visible: boolean; wobble: number;
}

export interface HoverInfo {
  mode: 'send' | 'fort' | 'barracks' | 'market' | 'bomb' | 'para';
  gx: number;
  gy: number;
  valid: boolean;
  label: string;
  sublabel?: string;
  radius?: number;
  from?: [number, number];
  danger?: boolean;
}

export class Overlay {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private soldiers: Soldier[] = [];
  private particles: Particle[] = [];
  private rings: Ring[] = [];
  private scorches: Scorch[] = [];
  private floaters: Floater[] = [];
  private bubbles: Bubble[] = [];
  private flashes: Flash[] = [];
  private confetti: Confetti[] = [];
  private spotLabel: Rect | null = null;
  /** True while an announcement is up. */
  hush = false;
  private falls: Fall[] = [];
  private crowd = new Map<string, number>();
  private viewScale = 3;
  private confettiOn = true;
  markerText = 'Good spot!';
  private whiteFlash = 0;
  private titleDone = false;
  private nextWord = 0;
  private nextFortNote = 0;
  private labelBoxes: Rect[] = [];
  private faceBoxes: Rect[] = [];
  private pillBoxes: Rect[] = [];
  private spot: { p: number; t: number; title: string; sub: string; colors: string[] } | null = null;
  private recentLines: string[] = [];
  private game: Game | null = null;
  private humanId = 0;
  /** UI panels map text must stay clear of, in screen pixels. */
  obstacles: Rect[] = [];
  /** Suggested capital spot, shown while choosing. */
  marker: { gx: number; gy: number } | null = null;
  private leaders = new Map<number, Leader>();
  private interiorClock = 0;
  private spawnAcc = 0;
  shake = 0;
  private dpr = 1;
  private coarse: Int16Array | null = null;
  time = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  }

  resize(w: number, h: number, dpr: number): void {
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
  }

  reset(): void {
    this.soldiers = [];
    this.particles = [];
    this.rings = [];
    this.scorches = [];
    this.floaters = [];
    this.bubbles = [];
    this.flashes = [];
    this.confetti = [];
    this.falls = [];
    this.whiteFlash = 0;
    this.labelBoxes = [];
    this.spot = null;
    this.marker = null;
    this.leaders.clear();
    this.interiorClock = 0;
    this.coarse = null;
  }

  // ---- Reacting to the simulation ---------------------------------------------------------

  /** `voice` lets a nation answer in its own words rather than from the shared pool. */
  say(player: number, lines: readonly string[], chance = 1, voice = false): void {
    if (Math.random() > chance) return;
    if (this.bubbles.some((b) => b.player === player)) return;
    if (this.bubbles.length >= 2) {
      if (player !== this.humanId) return;
      this.bubbles.shift();
    }
    const nation = this.game?.players[player]?.nation;
    const own = voice && nation ? BARKS[nation.id] : undefined;
    const pool = own && Math.random() < 0.55 ? own : lines;
    let text = pick(pool);
    for (let i = 0; i < 6 && this.recentLines.includes(text); i++) text = pick(pool);
    this.recentLines.push(text);
    if (this.recentLines.length > 16) this.recentLines.shift();
    this.bubbles.push({ player, text, life: 3.2, max: 3.2 });
  }

  floatText(gx: number, gy: number, text: string, color = '#ffe27a', size = 18): void {
    // Rise from above any nearby label rather than printing over it.
    let y = gy;
    for (const l of this.leaders.values()) {
      if (Math.abs(l.x - gx) < 16 && Math.abs(l.y - gy) < 12) y = Math.min(y, l.y - l.r * 0.8 - 9);
    }
    this.floaters.push({ x: gx, y, text, color, life: 1.6, max: 1.6, size });
  }

  /** The end-of-match moment: crowned winner, confetti, full undimmed world. */
  celebrate(p: number, title: string, sub: string, colors: string[], confetti = true): void {
    this.confettiOn = confetti;
    this.titleDone = false;
    this.spot = { p, t: 0, title, sub, colors };
    // The match is over: clear the battlefield chatter so the moment stands alone.
    this.floaters = [];
    this.bubbles = [];
  }

  /** The results panel has arrived, so its headline takes over from the one on the map. */
  endCelebrationTitle(): void {
    this.titleDone = true;
  }

  handleEvents(events: GameEvent[], game: Game, human: number): void {
    this.game = game;
    this.humanId = human;
    const { w } = game;
    const X = (c: number) => (c % w) + 0.5;
    const Y = (c: number) => ((c / w) | 0) + 0.5;
    for (const e of events) {
      switch (e.t) {
        case 'attackStart':
          if (e.target !== 0 && (e.p === human || e.target === human)) this.say(e.p, LINES.attack, 0.7, true);
          else if (e.target !== 0) this.say(e.p, LINES.attack, 0.1, true);
          break;
        case 'attacked': {
          const l = this.leaders.get(e.p);
          if (l) l.hurt = 1.4;
          this.say(e.p, LINES.attacked, e.p === human ? 0 : 0.26, true);
          break;
        }
        case 'poi': {
          const poi = game.world.pois[e.poi];
          this.burst(X(poi.cell), Y(poi.cell), 12, '#ffd23f', 'star');
          this.rings.push({ x: X(poi.cell), y: Y(poi.cell), r0: 1, r1: 9, life: 0.6, max: 0.6, color: '#ffe27a', lw: 3 });
          if (e.p === human) {
            this.floatText(X(poi.cell), Y(poi.cell) - 3, `+${e.loot} gold`, '#ffe27a', 20);
            this.say(e.p, LINES.city, 0.5);
          }
          const l = this.leaders.get(e.p);
          if (l) l.happy = 1.6;
          break;
        }
        case 'capital': {
          const cx = X(e.cell);
          const cy = Y(e.cell);
          this.boom(cx, cy, 7, game.players[e.prev]?.nation.fill ?? '#fff');
          this.burst(cx, cy, 26, '#ffd23f', 'star');
          this.rings.push({ x: cx, y: cy, r0: 2, r1: 26, life: 0.9, max: 0.9, color: '#ffe27a', lw: 6 });
          // One at a time: when capitals fall together, the same headline twice is just noise.
          if (!this.floaters.some((f) => f.text === 'CAPITAL TAKEN!')) {
            this.floatText(cx, cy - 7, 'CAPITAL TAKEN!', '#ffe27a', 24);
            this.floaters[this.floaters.length - 1].word = true;
          }
          if (e.p > 0) this.say(e.p, LINES.capital, 0.8);
          this.say(e.prev, LINES.capitalLost, 0.8);
          const l = this.leaders.get(e.prev);
          if (l) l.hurt = 2.2;
          break;
        }
        case 'eliminated': {
          const l = this.leaders.get(e.p);
          if (l) {
            l.alive = false;
            const fallen = game.players[e.p].nation;
            this.boom(l.x, l.y, 10, fallen.fill);
            this.burst(l.x, l.y, 26, fallen.fill, 'star');
            this.rings.push({ x: l.x, y: l.y, r0: 1, r1: 28, life: 0.9, max: 0.9, color: '#ffffff', lw: 6 });
            this.falls.push({ x: l.x, y: l.y, vx: rnd(-7, 7), vy: -26, rot: 0, vr: rnd(3, 6) * (Math.random() < 0.5 ? -1 : 1), r: l.r, nation: fallen, life: 1.7 });
          }
          break;
        }
        case 'bombHit':
          this.boom(X(e.cell), Y(e.cell), e.radius * 1.5, '#ff9a3d', e.victim > 0 ? game.players[e.victim].nation : undefined);
          this.addCrater(X(e.cell), Y(e.cell), e.radius * 1.05);
          this.shake = Math.max(this.shake, e.p === human ? 16 : 5);
          if (e.p === human) this.whiteFlash = 0.28;
          if (e.p === human) {
            if (e.kills >= 1) this.floatText(X(e.cell), Y(e.cell) - e.radius * 1.5, `-${fmt(e.kills)} troops${e.cells > 0 ? `, -${e.cells} land` : ''}`, '#ff8a7a', 34);
            else if (e.cells > 0) this.floatText(X(e.cell), Y(e.cell) - e.radius * 1.5, `-${e.cells} land`, '#ff8a7a', 34);
            else this.floatText(X(e.cell), Y(e.cell) - e.radius * 1.9, 'Missed!', '#ffffff', 20);
          }
          break;
        case 'strike':
          this.say(e.p, e.kind === 'bomb' ? LINES.boom : LINES.para, e.p === human ? 0.7 : 0.15);
          break;
        case 'boatLaunch':
          this.say(e.p, LINES.boat, e.p === human ? 0.6 : 0.08);
          break;
        case 'boatLand':
        case 'paraLand':
          this.burst(X(e.cell), Y(e.cell), 14, game.players[e.p].nation.fill, 'dot');
          this.rings.push({ x: X(e.cell), y: Y(e.cell), r0: 1, r1: 8, life: 0.5, max: 0.5, color: '#ffffff', lw: 3 });
          break;
        case 'built':
          this.burst(X(e.cell), Y(e.cell), 10, '#ffffff', 'smoke');
          this.rings.push({ x: X(e.cell), y: Y(e.cell), r0: 1, r1: 6, life: 0.45, max: 0.45, color: '#ffffff', lw: 2.5 });
          break;
        case 'razed':
          this.burst(X(e.cell), Y(e.cell), 16, '#c9c3b6', 'smoke');
          break;
        case 'truceYes':
          this.say(e.p, LINES.truceYes);
          break;
        case 'truceNo':
          this.say(e.p, LINES.truceNo);
          break;
        case 'victory':
          this.say(e.p, LINES.win);
          break;
      }
    }
  }

  ageCraters(seconds: number): void {
    for (const s of this.scorches) s.life -= seconds;
  }

  addCrater(x: number, y: number, r: number): void {
    const world = this.game?.world;
    const onLand = (gx: number, gy: number) => {
      if (!world) return true;
      const c = Math.floor(gx) + Math.floor(gy) * world.w;
      return c >= 0 && c < world.terrain.length && world.terrain[c] >= Terrain.Sand;
    };
    if (!onLand(x, y)) return;
    // Walk each spoke outward and stop at the coast, so a crater never hangs over the sea.
    const pts = Array.from({ length: 15 }, (_, j) => {
      const ang = (j / 15) * Math.PI * 2;
      const want = rnd(0.84, 1.14);
      let k = 0.1;
      while (k < want && onLand(x + Math.cos(ang) * r * (k + 0.06), y + Math.sin(ang) * r * (k + 0.06) * 0.8)) k += 0.06;
      return Math.max(0.1, k);
    });
    const rocks = Array.from({ length: 9 }, () => ({ a: Math.random() * Math.PI * 2, d: rnd(1.02, 1.36), s: rnd(0.05, 0.11) }))
      .filter((rock) => onLand(x + Math.cos(rock.a) * r * rock.d, y + Math.sin(rock.a) * r * rock.d * 0.8));
    this.scorches.push({ x, y, r, life: 55, max: 55, pts, rocks });
  }

  /** What happens when two soldiers meet. Variety is the point: dust, sparks, a flung ball, or a word. */
  private impact(x: number, y: number, nation: Nation): void {
    if (this.particles.length > 720) return;
    const roll = Math.random();
    if (roll < 0.36) {
      for (let i = 0; i < 3; i++) this.particles.push({ x, y, vx: rnd(-6, 6), vy: rnd(-6, -1), g: -1, life: rnd(0.25, 0.45), max: 0.45, r: rnd(0.7, 1.3), color: nation.fill, kind: 'smoke' });
    } else if (roll < 0.74) {
      const n = 5;
      const start = Math.random() * 6;
      for (let i = 0; i < n; i++) {
        const a = start + (i / n) * Math.PI * 2;
        const s = rnd(14, 26);
        this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 8, life: rnd(0.14, 0.26), max: 0.26, r: 1, color: i % 2 ? '#fff3c4' : '#ffa53d', kind: 'spark' });
      }
    } else if (roll < 0.9) {
      this.particles.push({ x, y, vx: rnd(-10, 10), vy: rnd(-24, -14), g: 46, life: 0.8, max: 0.8, r: 1, color: '#fff', kind: 'ball', nation, rot: Math.random() * 6 });
    } else if (this.time > this.nextWord && this.floaters.filter((f) => f.word).length < 3 && !this.floaters.some((f) => Math.hypot(f.x - x, f.y - y) * this.viewScale < 150)) {
      // Comic words stay rare and well apart, so each one reads rather than smudging into a crowd.
      this.nextWord = this.time + 0.42;
      this.floaters.push({ x, y: y - 1.5, text: pick(['BONK!', 'POW!', 'OOF!', 'WHAM!', 'BOP!', 'THUD!']), color: pick(['#ffffff', '#ffe27a', '#ffb14d']), life: 0.7, max: 0.7, size: rnd(19, 27), word: true });
    }
  }

  burst(x: number, y: number, n: number, color: string, kind: Particle['kind']): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rnd(4, kind === 'smoke' ? 10 : 24);
      this.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (kind === 'smoke' ? 3 : 8), g: kind === 'smoke' ? -2 : 34,
        life: rnd(0.4, 0.95), max: 0.95, r: rnd(1.5, kind === 'smoke' ? 5.5 : 3.2), color, kind,
      });
    }
  }

  boom(x: number, y: number, radius: number, color: string, victim?: Nation): void {
    // Layers: a brief flash, then a rolling smoke ring, thrown debris and soldiers sent flying.
    this.flashes.push({ x, y, r: radius * 1.5, life: 0.3, max: 0.3 });
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2 + rnd(-0.12, 0.12);
      const s = radius * rnd(1.1, 1.7);
      this.particles.push({ x: x + Math.cos(a) * radius * 0.35, y: y + Math.sin(a) * radius * 0.28, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.8 - 3, g: -6, life: rnd(0.8, 1.5), max: 1.5, r: rnd(radius * 0.13, radius * 0.24), color: pick(['#7b7480', '#918a93', '#a89fa3']), kind: 'puff' });
    }
    // The fire at the heart of it, burning out as the smoke rolls away.
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = radius * rnd(0.3, 0.9);
      this.particles.push({ x: x + Math.cos(a) * radius * 0.12, y: y + Math.sin(a) * radius * 0.1, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.8 - 2, g: -5, life: rnd(0.4, 0.8), max: 0.8, r: rnd(radius * 0.1, radius * 0.2), color: pick(['#ff6a24', '#ffa02e', '#ffd23f']), kind: 'puff' });
    }
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = radius * rnd(1.6, 3.2);
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 10, g: 40, life: rnd(0.6, 1.1), max: 1.1, r: rnd(1, 2.2), color: pick(['#6a4a35', '#8a7768', '#3b2a28']), kind: 'dot' });
    }
    if (victim) {
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI / 2 + rnd(-1.2, 1.2);
        const s = radius * rnd(1.6, 3);
        this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 42, life: 1.2, max: 1.2, r: 1, color: '#fff', kind: 'ball', nation: victim, rot: Math.random() * 6 });
      }
    }
    this.rings.push({ x, y, r0: radius * 0.2, r1: radius * 2.2, life: 0.7, max: 0.7, color: '#fff3c4', lw: 9 });
    this.rings.push({ x, y, r0: radius * 0.1, r1: radius * 1.35, life: 0.42, max: 0.42, color, lw: 15 });
    for (let i = 0; i < 70; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = rnd(0.3, 1) * radius * 3.4;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 4, g: 18, life: rnd(0.45, 1.1), max: 1.1, r: rnd(1.4, 3.8), color: pick(['#ffd23f', '#ff9a3d', '#ff5a3c', '#fff3c4']), kind: 'dot' });
    }
  }

  // ---- Per frame --------------------------------------------------------------------------

  private computeInterior(game: Game): void {
    // A coarse distance transform finds the deepest point of each territory for its label.
    const { w, h, owner } = game;
    const S = 5;
    const cw = Math.floor(w / S);
    const ch = Math.floor(h / S);
    if (!this.coarse || this.coarse.length !== cw * ch) this.coarse = new Int16Array(cw * ch);
    const d = this.coarse;
    const own = new Uint8Array(cw * ch);
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) own[x + y * cw] = owner[x * S + 2 + (y * S + 2) * w];
    }
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const i = x + y * cw;
        const o = own[i];
        if (x === 0 || y === 0) {
          d[i] = 0;
          continue;
        }
        const l = own[i - 1] === o ? d[i - 1] + 1 : 0;
        const u = own[i - cw] === o ? d[i - cw] + 1 : 0;
        d[i] = Math.min(l, u);
      }
    }
    const best = new Int16Array(game.nPlayers);
    const bestI = new Int32Array(game.nPlayers).fill(-1);
    for (let y = ch - 1; y >= 0; y--) {
      for (let x = cw - 1; x >= 0; x--) {
        const i = x + y * cw;
        const o = own[i];
        if (x === cw - 1 || y === ch - 1) d[i] = 0;
        else {
          const rr = own[i + 1] === o ? d[i + 1] + 1 : 0;
          const dd = own[i + cw] === o ? d[i + cw] + 1 : 0;
          d[i] = Math.min(d[i], rr, dd);
        }
        if (o !== 0 && o !== WATER && o < game.nPlayers && d[i] >= best[o]) {
          best[o] = d[i];
          bestI[o] = i;
        }
      }
    }
    for (let p = 1; p < game.nPlayers; p++) {
      const pl = game.players[p];
      if (!pl.alive) continue;
      let l = this.leaders.get(p);
      let tx: number;
      let ty: number;
      if (bestI[p] >= 0) {
        tx = (bestI[p] % cw) * S + S / 2;
        ty = ((bestI[p] / cw) | 0) * S + S / 2;
      } else if (pl.capital >= 0) {
        tx = pl.capital % w;
        ty = (pl.capital / w) | 0;
      } else continue;
      if (!l) {
        l = {
          x: tx, y: ty, tx, ty, r: 8, alive: true, lastLand: pl.land, bounce: 0, hurt: 0, expr: 'neutral',
          lookX: 0, lookY: 0, blink: 0, nextBlink: rnd(1, 5), happy: 0, visible: true, wobble: Math.random() * 6,
        };
        this.leaders.set(p, l);
      }
      l.tx = tx;
      l.ty = ty;
    }
  }

  private spawnSoldiers(game: Game, dt: number, cam: Camera): void {
    this.spawnAcc += dt;
    if (this.spawnAcc < 0.05) return;
    this.spawnAcc = 0;
    // Fewer soldiers on small screens: a crowd reads as life, a solid mass hides the map.
    if (this.soldiers.length > (cam.vw < 761 || cam.vh < 500 ? 150 : 400)) return;
    this.crowd.clear();
    for (const s of this.soldiers) {
      const k = `${Math.floor(cam.toScreenX(s.x) / 80)}:${Math.floor(cam.toScreenY(s.y) / 80)}`;
      this.crowd.set(k, (this.crowd.get(k) ?? 0) + 1);
    }
    const { w, owner } = game;
    for (const a of game.attacks) {
      if (a.frontier.length === 0) continue;
      const intensity = Math.min(a.target === 0 ? 2 : 4, (a.target === 0 ? 0.6 : 1.2) + Math.log10(1 + a.troops) * 0.55);
      const count = Math.floor(intensity + Math.random());
      for (let i = 0; i < count; i++) this.spawnSoldierAt(game, a, w, owner, cam);
    }
  }

  private spawnSoldierAt(game: Game, a: Attack, w: number, owner: Uint8Array, cam: Camera): void {
    const c = a.frontier[Math.floor(Math.random() * a.frontier.length)];
    const fx = (c % w) + 0.5;
    const fy = ((c / w) | 0) + 0.5;
    const halfW = cam.vw / 2 / cam.scale + 8;
    const halfH = cam.vh / 2 / cam.scale + 8;
    if (Math.abs(fx - cam.x) > halfW || Math.abs(fy - cam.y) > halfH) return;
    let dx = 0;
    let dy = 0;
    if (owner[c - 1] === a.owner) dx += 1;
    if (owner[c + 1] === a.owner) dx -= 1;
    if (owner[c - w] === a.owner) dy += 1;
    if (owner[c + w] === a.owner) dy -= 1;
    const len = Math.hypot(dx, dy);
    if (len === 0) return;
    dx /= len;
    dy /= len;
    // A patch of screen only holds so many soldiers. The war pill carries the true army size.
    const bucket = `${Math.floor(cam.toScreenX(fx) / 80)}:${Math.floor(cam.toScreenY(fy) / 80)}`;
    if ((this.crowd.get(bucket) ?? 0) >= 8) return;
    this.crowd.set(bucket, (this.crowd.get(bucket) ?? 0) + 1);
    const run = rnd(4, 9);
    const speed = rnd(5, 8);
    const life = run / speed;
    const att = game.players[a.owner].nation;
    this.soldiers.push({
      x: fx - dx * run + rnd(-1.4, 1.4), y: fy - dy * run + rnd(-1.4, 1.4), vx: dx * speed, vy: dy * speed,
      life, max: life, nation: att, phase: Math.random() * 6, flip: dx < 0, clash: a.target !== 0,
    });
    if (a.target !== 0 && game.players[a.target].troops >= 2 && Math.random() < 0.55) {
      const def = game.players[a.target].nation;
      this.soldiers.push({
        x: fx + dx * run + rnd(-1.4, 1.4), y: fy + dy * run + rnd(-1.4, 1.4), vx: -dx * speed, vy: -dy * speed,
        life, max: life, nation: def, phase: Math.random() * 6, flip: dx > 0, clash: true,
      });
    }
  }

  private updateLeaders(game: Game, dt: number): void {
    this.interiorClock -= dt;
    if (this.interiorClock <= 0) {
      this.computeInterior(game);
      this.interiorClock = 0.5;
    }
    for (const [p, l] of this.leaders) {
      const pl = game.players[p];
      if (!pl.alive) {
        this.leaders.delete(p);
        continue;
      }
      const k = 1 - Math.exp(-dt * 2.2);
      l.x += (l.tx - l.x) * k;
      l.y += (l.ty - l.y) * k;
      if (pl.land > l.lastLand + 2) l.bounce = Math.min(1, l.bounce + dt * 3.5);
      l.lastLand = pl.land;
      l.bounce = Math.max(0, l.bounce - dt * 1.3);
      l.hurt = Math.max(0, l.hurt - dt);
      l.happy = Math.max(0, l.happy - dt);
      l.blink = Math.max(0, l.blink - dt);
      l.nextBlink -= dt;
      if (l.nextBlink <= 0) {
        l.blink = 0.13;
        l.nextBlink = rnd(2, 6);
      }

      // Mood is real game state, so a glance at a face tells you how that nation is doing.
      const fill = pl.troops / Math.max(1, game.capOf(pl));
      let expr: Expression = 'neutral';
      if (this.spot?.p === p) l.happy = 1;
      if (l.hurt > 0) expr = fill < 0.3 ? 'scared' : 'angry';
      else if (l.happy > 0 || l.bounce > 0.3) expr = 'happy';
      else if (fill > 0.8) expr = 'smug';
      else if (fill < 0.12) expr = 'sad';
      else if (game.landShare(pl) > 0.2) expr = 'smug';
      l.expr = expr;

      // Eyes track whatever this nation is attacking.
      let tx = 0;
      let ty = 0;
      for (const a of game.attacks) {
        if (a.owner === p && a.aim >= 0) {
          tx = (a.aim % game.w) - l.x;
          ty = ((a.aim / game.w) | 0) - l.y;
          break;
        }
      }
      const m = Math.hypot(tx, ty) || 1;
      const k2 = 1 - Math.exp(-dt * 6);
      l.lookX += ((tx ? tx / m : 0) - l.lookX) * k2;
      l.lookY += ((ty ? ty / m : 0) - l.lookY) * k2;
      const landR = Math.sqrt(pl.land);
      l.r = Math.max(4.5, Math.min(13, 3.2 + landR * 0.1));
    }
  }

  draw(game: Game | null, cam: Camera, dt: number, time: number, human: number, hover: HoverInfo | null, showLabels = true): void {
    this.time = time;
    const { ctx } = this;
    ballFloor = cam.vh < 500 ? 11 : cam.vw < 761 ? 15 : 19;
    this.viewScale = cam.scale;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, cam.vw, cam.vh);
    if (!game) return;

    this.shake = Math.max(0, this.shake - dt * 30);
    const sx = this.shake > 0 ? rnd(-this.shake, this.shake) : 0;
    const sy = this.shake > 0 ? rnd(-this.shake, this.shake) : 0;
    ctx.translate(sx, sy);

    // No swarms behind the title screen: it should read as a calm world, not visual noise.
    if (game.phase === 'play' && showLabels) this.spawnSoldiers(game, dt, cam);
    this.updateLeaders(game, dt);

    const X = (g: number) => cam.toScreenX(g);
    const Y = (g: number) => cam.toScreenY(g);

    this.drawScorches(cam, dt);
    this.drawStructures(game, cam, X, Y);
    if (game.phase === 'play' && showLabels) this.drawFronts(game, cam, human, X, Y, time);
    if (game.phase === 'play') this.drawArrows(game, cam, human, X, Y, time);
    this.drawSoldiers(cam, dt, X, Y);
    this.drawBoats(game, cam, X, Y, time);
    this.drawStrikes(game, cam, X, Y);
    this.drawParticles(cam, dt, X, Y);
    this.drawLeaders(game, cam, human, X, Y, time, dt, showLabels);
    // War pills go above troops and balls, so nothing can cover the score of a fight.
    if (game.phase === 'play' && showLabels) this.drawWarPills(game, cam, human, X, Y);
    this.drawFalls(cam, dt, X, Y);
    if (showLabels) this.drawBubbles(game, cam, dt, X, Y);
    if (this.marker) this.drawMarker(cam, X, Y, time);
    if (hover) this.drawHover(cam, hover, X, Y, time);
    // Event text goes above the cursor tooltip, so a tooltip can never hide a big moment.
    this.drawFloaters(cam, dt, X, Y);
    this.drawCelebration(cam, dt);
    this.drawDanger(game, cam, human, X, Y, time);
    if (this.whiteFlash > 0) {
      ctx.fillStyle = `rgba(255,250,235,${this.whiteFlash})`;
      ctx.fillRect(-30, -30, cam.vw + 60, cam.vh + 60);
      this.whiteFlash = Math.max(0, this.whiteFlash - dt * 1.6);
    }
  }

  private drawFalls(cam: Camera, dt: number, X: (g: number) => number, Y: (g: number) => number): void {
    const { ctx } = this;
    for (let i = this.falls.length - 1; i >= 0; i--) {
      const f = this.falls[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.falls.splice(i, 1);
        continue;
      }
      f.vy += 44 * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.rot += f.vr * dt;
      const r = leaderRadius(f.r, cam.scale);
      ctx.save();
      ctx.globalAlpha = Math.min(1, f.life * 2);
      ctx.translate(X(f.x), Y(f.y));
      ctx.rotate(f.rot);
      // The white flag of surrender.
      ctx.strokeStyle = '#1b1530';
      ctx.lineWidth = Math.max(2, r * 0.1);
      ctx.beginPath();
      ctx.moveTo(r * 0.72, -r * 0.72);
      ctx.lineTo(r * 1.5, -r * 1.5);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(r * 1.5, -r * 1.5);
      ctx.lineTo(r * 2.3, -r * 1.44);
      ctx.lineTo(r * 1.46, -r * 0.92);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      drawBall(ctx, 0, 0, r, f.nation, { expr: 'dead', shadow: false, hat: false });
      ctx.restore();
    }
  }

  private drawScorches(cam: Camera, dt: number): void {
    const { ctx } = this;
    for (let i = this.scorches.length - 1; i >= 0; i--) {
      const s = this.scorches[i];
      s.life -= dt;
      if (s.life <= 0) {
        this.scorches.splice(i, 1);
        continue;
      }
      // A drawn crater, in the same inked style as everything else on the map. It fades in under the smoke.
      const a = Math.min(1, s.life / 4, (s.max - s.life) / 0.7);
      const x = cam.toScreenX(s.x);
      const y = cam.toScreenY(s.y);
      const r = s.r * cam.scale;
      const blob = (scale: number) => {
        ctx.beginPath();
        s.pts.forEach((k, j) => {
          const ang = (j / s.pts.length) * Math.PI * 2;
          const px = x + Math.cos(ang) * r * k * scale;
          const py = y + Math.sin(ang) * r * k * scale * 0.8;
          if (j === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.closePath();
      };
      ctx.globalAlpha = a;
      ctx.lineJoin = 'round';
      blob(1);
      ctx.fillStyle = 'rgba(40,24,30,0.36)';
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, cam.scale * 0.5);
      ctx.strokeStyle = '#1b1530';
      ctx.stroke();
      blob(0.68);
      ctx.fillStyle = 'rgba(30,18,26,0.5)';
      ctx.fill();
      blob(0.38);
      ctx.fillStyle = 'rgba(20,12,20,0.72)';
      ctx.fill();
      ctx.fillStyle = '#8a7768';
      ctx.strokeStyle = '#1b1530';
      ctx.lineWidth = 1.2;
      for (const rock of s.rocks) {
        ctx.beginPath();
        ctx.arc(x + Math.cos(rock.a) * r * rock.d, y + Math.sin(rock.a) * r * rock.d * 0.8, Math.max(1.5, r * rock.s), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  private drawStructures(game: Game, cam: Camera, X: (g: number) => number, Y: (g: number) => number): void {
    const { ctx } = this;
    const { w, owner, world } = game;
    const size = Math.max(14, Math.min(58, cam.scale * 6.4));
    const city = citySprite();
    const mine = mineSprite();
    // Scenery fades out from under a nation's name, so labels stay readable.
    const alphaAt = (sx: number, sy: number) => (this.labelBoxes.some((b) => sx > b.x0 - 10 && sx < b.x1 + 10 && sy > b.y0 - 2 && sy < b.y1 + 16) ? 0.2 : 1);
    for (const poi of world.pois) {
      const gx = (poi.cell % w) + 0.5;
      const gy = ((poi.cell / w) | 0) + 0.5;
      const sx = X(gx);
      const sy = Y(gy);
      if (sx < -60 || sy < -60 || sx > cam.vw + 60 || sy > cam.vh + 60) continue;
      const s = poi.kind === 'city' ? size : size * 0.82;
      ctx.globalAlpha = alphaAt(sx, sy);
      ctx.drawImage(poi.kind === 'city' ? city : mine, sx - s / 2, sy - s * 0.82, s, s);
      const o = owner[poi.cell];
      if (o !== 0 && o !== WATER) {
        // A little owner pennant so prizes read as captured.
        const fx = sx + s * 0.38;
        const fy = sy - s * 0.62;
        ctx.fillStyle = '#1b1530';
        ctx.fillRect(fx - 1, fy, 2, s * 0.32);
        ctx.fillStyle = game.players[o].nation.fill;
        ctx.beginPath();
        ctx.moveTo(fx + 1, fy);
        ctx.lineTo(fx + s * 0.26, fy + s * 0.07);
        ctx.lineTo(fx + 1, fy + s * 0.15);
        ctx.closePath();
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#1b1530';
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    for (const b of game.buildings.values()) {
      const sx = X((b.cell % w) + 0.5);
      const sy = Y(((b.cell / w) | 0) + 0.5);
      if (sx < -60 || sy < -60 || sx > cam.vw + 60 || sy > cam.vh + 60) continue;
      const s = size * 0.95;
      if (b.kind === 'fort' && b.owner === this.humanId) {
        // The zone your fort protects, faintly. Everyone else's would only clutter the map.
        ctx.save();
        ctx.globalAlpha = 0.4;
        ctx.setLineDash([5, 6]);
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(sx, sy, B.FORT_RADIUS * cam.scale, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      ctx.globalAlpha = alphaAt(sx, sy);
      ctx.drawImage(buildingSprite(b.kind, game.players[b.owner].nation.fill), sx - s / 2, sy - s * 0.82, s, s);
      ctx.globalAlpha = 1;
    }
    for (let p = 1; p < game.nPlayers; p++) {
      const pl = game.players[p];
      if (!pl.alive || pl.capital < 0) continue;
      const sx = X((pl.capital % w) + 0.5);
      const sy = Y(((pl.capital / w) | 0) + 0.5);
      if (sx < -60 || sy < -60 || sx > cam.vw + 60 || sy > cam.vh + 60) continue;
      const s = size * 1.25;
      ctx.globalAlpha = alphaAt(sx, sy);
      ctx.drawImage(capitalSprite(pl.nation.fill), sx - s / 2, sy - s * 0.86, s, s);
      ctx.globalAlpha = 1;
    }
  }

  private drawArrows(game: Game, cam: Camera, human: number, X: (g: number) => number, Y: (g: number) => number, time: number): void {
    if (human <= 0) return;
    const { w } = game;
    const leader = this.leaders.get(human);
    if (!leader) return;
    for (const a of game.attacks) {
      if (a.owner !== human || a.aim < 0) continue;
      const tx = X((a.aim % w) + 0.5);
      const ty = Y(((a.aim / w) | 0) + 0.5);
      // Start from the frontier cell closest to the aim, so the arrow shows the push itself.
      let best = a.frontier[0];
      let bestD = Infinity;
      for (let i = 0; i < a.frontier.length; i += 3) {
        const c = a.frontier[i];
        const d = ((c % w) - (a.aim % w)) ** 2 + (((c / w) | 0) - ((a.aim / w) | 0)) ** 2;
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      if (best === undefined || bestD < 16) continue;
      const fx = X((best % w) + 0.5);
      const fy = Y(((best / w) | 0) + 0.5);
      this.arrow(fx, fy, tx, ty, time, a.target === 0 ? '#fff6c8' : '#ffd9d0');
    }
  }

  private arrow(x0: number, y0: number, x1: number, y1: number, time: number, color: string): void {
    const { ctx } = this;
    const ang = Math.atan2(y1 - y0, x1 - x0);
    const headX = x1 - Math.cos(ang) * 4;
    const headY = y1 - Math.sin(ang) * 4;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.setLineDash([9, 10]);
    ctx.lineDashOffset = -time * 34;
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(27,21,48,0.65)';
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(headX, headY);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(headX, headY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(27,21,48,0.85)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - Math.cos(ang - 0.5) * 16, y1 - Math.sin(ang - 0.5) * 16);
    ctx.lineTo(x1 - Math.cos(ang + 0.5) * 16, y1 - Math.sin(ang + 0.5) * 16);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private drawSoldiers(cam: Camera, dt: number, X: (g: number) => number, Y: (g: number) => number): void {
    const { ctx } = this;
    const r = soldierRadius(cam.scale);
    this.soldiers.sort((a, b) => a.y - b.y);
    let w = 0;
    for (let i = 0; i < this.soldiers.length; i++) {
      const s = this.soldiers[i];
      s.life -= dt;
      if (s.life <= 0) {
        if (s.clash && Math.random() < 0.92) this.impact(s.x, s.y, s.nation);
        else if (Math.random() < 0.3) this.particles.push({ x: s.x, y: s.y, vx: rnd(-2, 2), vy: rnd(-3, -1), g: -2, life: 0.4, max: 0.4, r: 1.8, color: '#e8e0cc', kind: 'smoke' });
        continue;
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      const sx = X(s.x);
      const sy = Y(s.y);
      this.soldiers[w++] = s;
      if (sx < -20 || sy < -20 || sx > cam.vw + 20 || sy > cam.vh + 20) continue;
      const hop = Math.abs(Math.sin(this.time * 11 + s.phase)) * r * 0.62;
      const alpha = Math.min(1, s.life * 6, (s.max - s.life) * 8);
      // A name always wins over the crowd passing it.
      const overName = this.labelBoxes.some((b) => sx > b.x0 - 6 && sx < b.x1 + 6 && sy > b.y0 - 6 && sy < b.y1 + 10);
      ctx.globalAlpha = overName ? alpha * 0.32 : alpha;
      ctx.fillStyle = 'rgba(15,10,35,0.28)';
      ctx.beginPath();
      ctx.ellipse(sx, sy + r * 0.9, r * 0.72, r * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
      const sprite = soldierSprite(s.nation, r);
      const size = r * SOLDIER_SPRITE;
      ctx.drawImage(sprite, sx - size / 2, sy - r * SOLDIER_TOP - hop, size, size);
      ctx.globalAlpha = 1;
    }
    this.soldiers.length = w;
  }

  private drawBoats(game: Game, cam: Camera, X: (g: number) => number, Y: (g: number) => number, time: number): void {
    const { ctx } = this;
    const { w } = game;
    const r = Math.max(8, Math.min(14, cam.scale * 1.8));
    for (const b of game.boats) {
      const i = Math.min(b.path.length - 2, Math.floor(b.pos));
      const f = b.pos - i;
      const c0 = b.path[i];
      const c1 = b.path[i + 1];
      const gx = (c0 % w) * (1 - f) + (c1 % w) * f + 0.5;
      const gy = ((c0 / w) | 0) * (1 - f) + ((c1 / w) | 0) * f + 0.5;
      const sx = X(gx);
      const sy = Y(gy);
      if (sx < -40 || sy < -40 || sx > cam.vw + 40 || sy > cam.vh + 40) continue;

      // Your own boat's remaining route, as a faint dotted line. Bots' routes are only noise.
      if (b.owner === this.humanId) {
      ctx.save();
      ctx.setLineDash([3, 7]);
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      const underUi = (px: number, py: number) => this.obstacles.some((o) => px > o.x0 && px < o.x1 && py > o.y0 && py < o.y1);
      let pen = true;
      for (let k = i + 1; k < b.path.length; k += 4) {
        const px = X((b.path[k] % w) + 0.5);
        const py = Y(((b.path[k] / w) | 0) + 0.5);
        // The route lifts the pen under UI panels rather than running behind them.
        if (underUi(px, py)) {
          pen = false;
          continue;
        }
        if (pen) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
        pen = true;
      }
      ctx.stroke();
      ctx.restore();
      }
      if (this.obstacles.some((o) => sx > o.x0 && sx < o.x1 && sy > o.y0 && sy < o.y1)) continue;

      const bob = Math.sin(time * 4 + b.id) * r * 0.1;
      const nation = game.players[b.owner].nation;
      ctx.fillStyle = '#fff6e0';
      ctx.strokeStyle = '#1b1530';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx + r * 0.95, sy - r * 2.5 + bob);
      ctx.lineTo(sx + r * 2.1, sy - r * 0.3 + bob);
      ctx.lineTo(sx + r * 0.95, sy - r * 0.3 + bob);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      drawBall(ctx, sx - r * 0.2, sy - r * 0.9 + bob, r, nation, { expr: 'happy', shadow: false });
      ctx.fillStyle = '#7a4d2b';
      ctx.strokeStyle = '#1b1530';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx - r * 1.65, sy - r * 0.15 + bob);
      ctx.lineTo(sx + r * 1.65, sy - r * 0.15 + bob);
      ctx.lineTo(sx + r * 1.0, sy + r * 0.62 + bob);
      ctx.lineTo(sx - r * 1.0, sy + r * 0.62 + bob);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      this.label(fmt(b.troops), sx, sy + r * 1.5 + bob, 13, '#ffffff');
    }
  }

  private drawStrikes(game: Game, cam: Camera, X: (g: number) => number, Y: (g: number) => number): void {
    const { ctx } = this;
    const { w } = game;
    for (const s of game.strikes) {
      const t = Math.min(1, (game.tick - s.t0) / Math.max(1, s.t1 - s.t0));
      const fx = (s.from % w) + 0.5;
      const fy = ((s.from / w) | 0) + 0.5;
      const tx = (s.to % w) + 0.5;
      const ty = ((s.to / w) | 0) + 0.5;
      const gx = fx + (tx - fx) * t;
      const gy = fy + (ty - fy) * t;
      const arc = Math.sin(t * Math.PI) * Math.min(40, Math.hypot(tx - fx, ty - fy) * 0.32);
      const sx = X(gx);
      const sy = Y(gy) - arc * cam.scale;

      // Target marker.
      const rx = X(tx);
      const ry = Y(ty);
      const pulse = 1 + Math.sin(this.time * 12) * 0.08;
      const rad = (s.kind === 'bomb' ? s.radius : 4) * cam.scale * pulse;
      ctx.strokeStyle = s.kind === 'bomb' ? 'rgba(255,70,50,0.9)' : 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([7, 6]);
      ctx.beginPath();
      ctx.arc(rx, ry, rad, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      if (s.kind === 'bomb') {
        const r = Math.max(5, cam.scale * 1.5);
        ctx.fillStyle = '#25212e';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        if (Math.random() < 0.8) this.particles.push({ x: gx, y: gy - arc, vx: rnd(-2, 2), vy: rnd(-2, 2), g: -1, life: 0.5, max: 0.5, r: rnd(1, 2.2), color: '#ffb24d', kind: 'smoke' });
      } else {
        const r = Math.max(5.5, cam.scale * 1.5);
        const nation = game.players[s.owner].nation;
        // Parachute canopy above the ball.
        ctx.fillStyle = '#fff6e0';
        ctx.strokeStyle = '#1b1530';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(sx, sy - r * 2.3, r * 1.9, Math.PI, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(sx - r * 1.9, sy - r * 2.3);
        ctx.lineTo(sx - r * 0.6, sy - r * 0.8);
        ctx.moveTo(sx + r * 1.9, sy - r * 2.3);
        ctx.lineTo(sx + r * 0.6, sy - r * 0.8);
        ctx.stroke();
        drawBall(ctx, sx, sy, r, nation, { expr: 'happy', shadow: false, hat: false });
      }
    }
  }

  private drawParticles(cam: Camera, dt: number, X: (g: number) => number, Y: (g: number) => number): void {
    const { ctx } = this;
    let w = 0;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      this.particles[w++] = p;
      const sx = X(p.x);
      const sy = Y(p.y);
      const a = Math.min(1, p.life / (p.max * 0.5));
      if (p.kind === 'puff') continue;
      ctx.globalAlpha = p.kind === 'smoke' ? a * 0.55 : a;
      ctx.fillStyle = p.color;
      // Sparks and dots stay small however far you zoom in; only smoke should grow with the view.
      const raw = p.r * ((p.kind === 'smoke' ? cam.scale : Math.max(cam.scale, 6)) * 0.4 + 0.4);
      const r = p.kind === 'smoke' ? raw : Math.min(raw, 7);
      if (p.kind === 'spark') {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(2.6, cam.scale * 0.5);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx - p.vx * Math.max(cam.scale, 9) * 0.05, sy - p.vy * Math.max(cam.scale, 9) * 0.05);
        ctx.stroke();
      } else if (p.kind === 'ball' && p.nation) {
        // A soldier sent flying.
        p.rot = (p.rot ?? 0) + dt * 13;
        const br = soldierRadius(cam.scale);
        const size = br * SOLDIER_SPRITE;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(p.rot);
        ctx.drawImage(soldierSprite(p.nation, br), -size / 2, -br * SOLDIER_TOP, size, size);
        ctx.restore();
      } else if (p.kind === 'star') {
        ctx.beginPath();
        ctx.moveTo(sx, sy - r * 1.6);
        ctx.lineTo(sx + r * 0.5, sy - r * 0.5);
        ctx.lineTo(sx + r * 1.6, sy);
        ctx.lineTo(sx + r * 0.5, sy + r * 0.5);
        ctx.lineTo(sx, sy + r * 1.6);
        ctx.lineTo(sx - r * 0.5, sy + r * 0.5);
        ctx.lineTo(sx - r * 1.6, sy);
        ctx.lineTo(sx - r * 0.5, sy - r * 0.5);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(sx, sy, p.kind === 'smoke' ? r * (1.6 - a * 0.6) : r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    this.particles.length = w;
    ctx.globalAlpha = 1;

    // Smoke and fire as a single inked cloud: all the outlines first, then every fill over them, so
    // only the cloud's outer edge keeps a line. Then a flat lit and shaded layer, cel style.
    const puffs = this.particles.filter((p) => p.kind === 'puff').map((p) => {
      // Puffs shrink away at the end of their life rather than fading, which suits flat cartoon art.
      const fade = Math.min(1, (p.life / p.max) * 3.5);
      return { p, sx: X(p.x), sy: Y(p.y), r: p.r * cam.scale * (1.25 - (p.life / p.max) * 0.5) * fade };
    });
    if (puffs.length) {
      ctx.fillStyle = '#3a3140';
      for (const q of puffs) {
        ctx.beginPath();
        ctx.arc(q.sx, q.sy, q.r + Math.min(3, q.r * 0.14), 0, Math.PI * 2);
        ctx.fill();
      }
      for (const q of puffs) {
        ctx.fillStyle = q.p.color;
        ctx.beginPath();
        ctx.arc(q.sx, q.sy, q.r, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const q of puffs) {
        const fire = q.p.color === '#ff6a24' || q.p.color === '#ffa02e' || q.p.color === '#ffd23f';
        ctx.fillStyle = fire ? '#fff0b0' : '#c9c1c2';
        ctx.beginPath();
        ctx.arc(q.sx - q.r * 0.26, q.sy - q.r * 0.3, q.r * 0.46, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.flashes.splice(i, 1);
        continue;
      }
      // A bold cartoon fireball: stacked spiky bursts with a white-hot core.
      const t = 1 - f.life / f.max;
      const fx = X(f.x);
      const fy = Y(f.y);
      // Small bursts stay small, so a capital's burst doesn't cover the capital it is celebrating.
      const fr = Math.max(f.r > 12 ? 74 : 30, f.r * cam.scale * 1.25) * (0.35 + 0.75 * Math.min(1, t * 4));
      ctx.globalAlpha = t < 0.55 ? 1 : 1 - (t - 0.55) / 0.45;
      const spikes = (rad: number, color: string, seed: number, ink: boolean) => {
        const n = 18;
        ctx.beginPath();
        for (let k = 0; k < n; k++) {
          const ang = (k / n) * Math.PI * 2 + seed;
          const rr = k % 2 ? rad * 0.66 : rad * (0.92 + 0.14 * Math.sin(k * 7.3 + seed));
          const px = fx + Math.cos(ang) * rr;
          const py = fy + Math.sin(ang) * rr;
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        if (ink) {
          ctx.lineWidth = 3;
          ctx.lineJoin = 'round';
          ctx.strokeStyle = '#1b1530';
          ctx.stroke();
        }
      };
      spikes(fr, '#e5381f', 0.3, true);
      spikes(fr * 0.76, '#ff8a1f', 1.1, false);
      spikes(fr * 0.52, '#ffd23f', 0.7, false);
      spikes(fr * 0.28, '#fffbe6', 1.9, false);
      ctx.globalAlpha = 1;
    }

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) {
        this.rings.splice(i, 1);
        continue;
      }
      const t = 1 - r.life / r.max;
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.lw * (1 - t * 0.6);
      ctx.beginPath();
      ctx.arc(X(r.x), Y(r.y), (r.r0 + (r.r1 - r.r0) * (1 - (1 - t) * (1 - t))) * cam.scale, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private dangerTag(text: string, x: number, y: number, size: number): void {
    const { ctx } = this;
    const fs = Math.min(13.5, Math.max(10.5, size * 0.82));
    ctx.font = `900 ${fs}px Nunito, "Trebuchet MS", sans-serif`;
    const w = ctx.measureText(text).width + 12;
    const h = fs + 7;
    ctx.fillStyle = '#c41f2e';
    ctx.strokeStyle = '#1b1530';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h / 2, w, h, 6);
    ctx.fill();
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, x, y + 0.5);
  }

  label(text: string, x: number, y: number, size: number, color: string): void {
    const { ctx } = this;
    ctx.font = size < 17 ? `900 ${size}px Nunito, "Trebuchet MS", sans-serif` : `${size}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = size < 18 ? 2.6 : size * 0.26;
    ctx.strokeStyle = 'rgba(20,14,40,0.92)';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  private drawLeaders(game: Game, cam: Camera, human: number, X: (g: number) => number, Y: (g: number) => number, time: number, dt: number, showNames: boolean): void {
    const { ctx } = this;
    const placed: { x0: number; y0: number; x1: number; y1: number }[] = [];
    const order = [...this.leaders.entries()].sort((a, b) => {
      if (a[0] === human) return -1;
      if (b[0] === human) return 1;
      return game.players[b[0]].land - game.players[a[0]].land;
    });
    const items: { p: number; l: Leader; pl: Player; r: number; sx: number; sy: number; showName: boolean; showTroops: boolean; size: number; labelDx: number; compact: boolean }[] = [];
    const placedFaces: Rect[] = [];
    for (const [p, l] of order) {
      const pl = game.players[p];
      const r = leaderRadius(l.r, cam.scale);
      let sx = X(l.x);
      let sy = Y(l.y);
      l.visible = sx > -70 && sy > -70 && sx < cam.vw + 70 && sy < cam.vh + 70;
      if (!l.visible) continue;
      // A ball at the screen edge slides along it whole, keeping its name beside it.
      if (showNames && !this.spot) {
        const topSafe = cam.vw < 761 ? 128 : cam.vh < 500 ? 22 : 6;
        const bottomSafe = cam.vw < 761 ? 178 : cam.vh < 500 ? 62 : 128;
        sx = Math.max(r + 8, Math.min(cam.vw - r - 8, sx));
        sy = Math.max(topSafe + r * 1.7, Math.min(cam.vh - bottomSafe - r - 44, sy));
      }
      // A nation's ball and name step out from under a HUD panel instead of being cut in half.
      if (showNames && !this.spot) {
        const labelH = r + 58;
        for (let tries = 0; tries < 3; tries++) {
          const halfW = Math.max(r, pl.nation.name.length * (cam.vw < 761 ? 3.8 : 5) + 6);
          const o = this.obstacles.find((b) => sx - halfW < b.x1 && sx + halfW > b.x0 && sy - r * 1.7 < b.y1 && sy + labelH > b.y0);
          if (!o) break;
          const moves: [number, number][] = [[o.x1 + halfW - sx, 0], [o.x0 - halfW - sx, 0], [0, o.y1 + r * 1.7 - sy], [0, o.y0 - labelH - sy]];
          moves.sort((a, b) => Math.abs(a[0]) + Math.abs(a[1]) - Math.abs(b[0]) - Math.abs(b[1]));
          const m = moves.find(([dx, dy]) => sx + dx > halfW && sx + dx < cam.vw - halfW && sy + dy > r * 1.7 && sy + dy < cam.vh - labelH);
          if (!m) break;
          sx += m[0];
          sy += m[1];
        }
      }
      if (showNames && !this.spot) {
        for (let tries = 0; tries < 3; tries++) {
          const hit = placedFaces.find((f) => sx - r < f.x1 && sx + r > f.x0 && sy - r * 1.7 < f.y1 && sy + r > f.y0);
          if (!hit) break;
          const right = hit.x1 + r + 2;
          const left = hit.x0 - r - 2;
          const wantRight = sx >= (hit.x0 + hit.x1) / 2;
          sx = wantRight ? (right < cam.vw - r - 8 ? right : left) : (left > r + 8 ? left : right);
        }
      }
      const size = cam.vh < 500 ? Math.max(10, Math.min(12.5, r * 0.66)) : cam.vw < 761 ? Math.max(12, Math.min(15, r * 0.6)) : Math.max(15, Math.min(23, r * 0.78));
      const nameW = pl.nation.name.length * size * 0.56;
      // Only names compete for space. A name that would clash shifts sideways before it gives up.
      const nameBox = (dx: number): Rect => ({ x0: sx + dx - nameW / 2, y0: sy + r, x1: sx + dx + nameW / 2, y1: sy + r + size * 2.3 });
      const nameFree = (dx: number) => {
        const nb = nameBox(dx);
        const hit = (b: Rect) => nb.x0 < b.x1 && nb.x1 > b.x0 && nb.y0 < b.y1 && nb.y1 > b.y0;
        return !placed.some(hit) && !placedFaces.some(hit);
      };
      const shift = [0, nameW * 0.55, -nameW * 0.55, nameW * 0.95, -nameW * 0.95].find(nameFree);
      // On the title screen, keep balls away from the logo and the panel.
      const inObstacle = (x0: number, y0: number, x1: number, y1: number) => this.obstacles.some((o) => x0 < o.x1 && x1 > o.x0 && y0 < o.y1 && y1 > o.y0);
      if (!showNames && inObstacle(sx - r * 1.2, sy - r * 2.2, sx + r * 1.2, sy + r * 1.2)) continue;
      // During the victory title, everything but the winner clears out of the way.
      if (this.spot && this.spot.p !== p && !this.titleDone && sy < cam.vh * 0.32 && Math.abs(sx - cam.vw / 2) < cam.vw * 0.3) continue;
      const labelDx = shift ?? 0;
      const compact = shift === undefined && p !== human;
      placedFaces.push({ x0: sx - r, y0: sy - r * 1.7, x1: sx + r, y1: sy + r });
      const showName = showNames && (!this.spot || this.spot.p === p);
      if (showName && !compact) placed.push(nameBox(labelDx));
      items.push({ p, l, pl, r, sx, sy, showName, showTroops: showName, size, labelDx, compact });
    }
    this.labelBoxes = items.filter((it) => it.showName).map((it) => {
      const half = (it.pl.nation.name.length * it.size * 0.56) / 2;
      return { x0: it.sx + it.labelDx - half, y0: it.sy + it.r, x1: it.sx + it.labelDx + half, y1: it.sy + it.r + it.size * 2.3 };
    });
    this.faceBoxes = items.map((it) => ({ x0: it.sx - it.r, y0: it.sy - it.r * 1.7, x1: it.sx + it.r, y1: it.sy + it.r }));
    items.sort((a, b) => a.sy - b.sy);
    // Balls first, names second: a name is never buried under a neighbouring ball.
    for (const it of items) {
      const { l, pl, sx, sy } = it;
      let r = it.r;
      if (this.spot?.p === it.p) {
        // The winner swells up over warm rays that fade out to nothing.
        this.spot.t += dt;
        const grow = Math.min(1, this.spot.t / 0.5);
        // Once a phone's results panel is up there is only a strip of map left, so the ball settles smaller.
        const peak = this.titleDone && cam.vw < 761 ? 40 : Math.min(cam.vh * 0.13, cam.vw * 0.15, 110);
        r = r + (peak - r) * grow * (2 - grow);
        it.r = r;
        const R = r * 3.1;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(time * 0.35);
        ctx.globalCompositeOperation = 'screen';
        const glow = ctx.createRadialGradient(0, 0, r * 0.7, 0, 0, R);
        glow.addColorStop(0, 'rgba(255,232,150,0.78)');
        glow.addColorStop(1, 'rgba(255,224,130,0)');
        ctx.fillStyle = glow;
        for (let i = 0; i < 12; i++) {
          ctx.rotate(Math.PI / 6);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(-r * 0.46, -R);
          ctx.lineTo(r * 0.46, -R);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }
      const bounce = Math.sin(l.bounce * Math.PI * 3) * l.bounce;
      const breathe = Math.sin(time * 2.2 + l.wobble) * 0.018;
      const squashY = 1 + breathe + bounce * 0.12;
      const squashX = 1 - breathe - bounce * 0.1;
      const jump = Math.abs(Math.sin(time * 7 + l.wobble)) * bounce * r * 0.5;
      const shakeX = l.hurt > 0 ? Math.sin(time * 40) * r * 0.06 : 0;
      drawBall(ctx, sx + shakeX, sy - jump, r, pl.nation, {
        expr: l.expr, lookX: l.lookX, lookY: l.lookY, blink: l.blink > 0, squashX, squashY,
      });
      ctx.globalAlpha = 1;
    }
    for (const it of items) {
      if (!it.showName) continue;
      const big = this.spot?.p === it.p ? 1.5 : 1;
      const size = it.size * big;
      if (it.compact) {
        if (it.pl.troops < 2) this.dangerTag('Collapsing!', it.sx, it.sy + it.r + size * 0.62, size);
        else this.label(fmt(it.pl.troops), it.sx, it.sy + it.r + size * 0.62, size * 0.92, '#ffffff');
        continue;
      }
      let y = it.sy + it.r + size * 0.62;
      // A ball near the screen edge keeps its full name on screen.
      const half = it.pl.nation.name.length * size * 0.29 + 5;
      const lx = Math.max(half, Math.min(cam.vw - half, it.sx + it.labelDx));
      if (this.spot?.p === it.p) this.spotLabel = { x0: lx - half, y0: y - size, x1: lx + half, y1: y + size * 1.7 };
      this.label(it.pl.nation.name, lx, y, size, it.p === human ? '#ffe27a' : '#ffffff');
      y += size * 0.98;
      // A nation with no troops left is about to fall, and says so.
      if (it.pl.troops < 2 && it.p !== human) this.dangerTag('Collapsing!', lx, y + 1, size);
      else this.label(fmt(it.pl.troops), lx, y, size * 0.98, '#ffffff');
    }
  }

  private drawFloaters(cam: Camera, dt: number, X: (g: number) => number, Y: (g: number) => number): void {
    // Each piece of event text gets its own space: oldest stays put, newer ones step clear of it.
    const placed: Rect[] = [];
    for (let i = 0; i < this.floaters.length; i++) {
      const f = this.floaters[i];
      f.life -= dt;
      if (f.life <= 0) {
        this.floaters.splice(i, 1);
        i--;
        continue;
      }
      f.y -= (dt * 18) / cam.scale;
      const halfW = f.text.length * f.size * 0.3 + 6;
      const fx = Math.max(halfW, Math.min(cam.vw - halfW, X(f.x)));
      const topLine = cam.vw < 761 ? 116 : cam.vh < 500 ? 48 : 102;
      if (f.word && Y(f.y) < topLine) continue;
      let fy = Math.max(topLine, Y(f.y));
      const rectAt = (y: number): Rect => ({ x0: fx - halfW, y0: y - f.size * 0.6, x1: fx + halfW, y1: y + f.size * 0.6 });
      const zones = [...placed, ...this.obstacles, ...this.labelBoxes, ...this.pillBoxes, ...this.faceBoxes];
      let blocked = false;
      // Droppable text barely moves, so it stays tied to where it happened; real news can travel further.
      for (let tries = 0; tries < (f.word ? 2 : 7); tries++) {
        const r = rectAt(fy);
        const clash = zones.find((o) => r.x0 < o.x1 && r.x1 > o.x0 && r.y0 < o.y1 && r.y1 > o.y0);
        blocked = !!clash;
        if (!clash) break;
        fy = clash.y1 + f.size * 0.62;
      }
      // A comic word with nowhere to go is simply skipped. Real news always gets drawn.
      if (blocked && f.word) continue;
      placed.push(rectAt(fy));
      this.ctx.globalAlpha = Math.min(1, f.life * 5);
      this.label(f.text, fx, fy, f.size, f.color);
      this.ctx.globalAlpha = 1;
    }
  }

  private drawBubbles(game: Game, cam: Camera, dt: number, X: (g: number) => number, Y: (g: number) => number): void {
    const { ctx } = this;
    const drawn: Rect[] = [];
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      b.life -= dt;
      const l = this.leaders.get(b.player);
      if (b.life <= 0 || !l) {
        this.bubbles.splice(i, 1);
        continue;
      }
      const r = leaderRadius(l.r, cam.scale);
      const hatRoom = r * 1.75;
      const ax = X(l.x) + r * 0.25;
      const ay = Y(l.y) - hatRoom;
      if (this.hush || ax < -100 || ay < -60 || ax > cam.vw + 100 || ay > cam.vh + 60) continue;
      // Keep bubbles to the open map: a line hidden behind a panel is worse than no line.
      ctx.font = `800 13.5px Nunito, "Trebuchet MS", sans-serif`;
      const boxW = ctx.measureText(b.text).width + 18;
      if (cam.vw < 761 && boxW > cam.vw * 0.62) continue;
      const boxL = Math.max(6, Math.min(cam.vw - boxW - 6, ax - boxW * 0.32));
      const boxT = Math.max(6, ay - 34);
      const box: Rect = { x0: boxL - 2, y0: boxT - 2, x1: boxL + boxW + 2, y1: boxT + 36 };
      const hitsBox = (o: Rect) => box.x0 < o.x1 && box.x1 > o.x0 && box.y0 < o.y1 && box.y1 > o.y0;
      if (this.obstacles.some(hitsBox) || this.labelBoxes.some(hitsBox) || this.pillBoxes.some(hitsBox)) continue;
      if (drawn.some((o) => Math.abs((o.x0 + o.x1) / 2 - (box.x0 + box.x1) / 2) < 300 && Math.abs(o.y0 - box.y0) < 150)) continue;
      // Do not talk over someone else's face.
      let onFace = false;
      for (const [other, o] of this.leaders) {
        if (other === b.player || !o.visible) continue;
        const or = leaderRadius(o.r, cam.scale);
        const ox = X(o.x);
        const oy = Y(o.y);
        if (hitsBox({ x0: ox - or, y0: oy - or * 1.5, x1: ox + or, y1: oy + or })) {
          onFace = true;
          break;
        }
      }
      if (onFace) continue;
      drawn.push(box);
      const age = b.max - b.life;
      const pop = Math.min(1, age / 0.14);
      const scale = pop < 1 ? 0.6 + pop * 0.5 : 1;
      const alpha = Math.min(1, b.life * 3);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `800 13.5px Nunito, "Trebuchet MS", sans-serif`;
      const tw = ctx.measureText(b.text).width;
      const W = tw + 18;
      const H = 26;
      const left = Math.max(6, Math.min(cam.vw - W - 6, ax - W * 0.32));
      const top = Math.max(6, ay - H - 8);
      ctx.translate(left + W * 0.3, top + H);
      ctx.scale(scale, scale);
      ctx.translate(-(left + W * 0.3), -(top + H));
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#1b1530';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(left, top, W, H, 10);
      ctx.fill();
      ctx.stroke();
      const tailX = Math.max(left + 10, Math.min(left + W - 14, ax - 5));
      ctx.beginPath();
      ctx.moveTo(tailX, top + H - 1.5);
      ctx.lineTo(tailX + 5, top + H + 8);
      ctx.lineTo(tailX + 11, top + H - 1.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(tailX + 1.5, top + H - 4, 8, 3.2);
      ctx.fillStyle = '#1b1530';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.text, left + 9, top + H / 2 + 0.5);
      ctx.restore();
    }
    void game;
  }

  private drawHover(cam: Camera, h: HoverInfo, X: (g: number) => number, Y: (g: number) => number, time: number): void {
    const { ctx } = this;
    const sx = X(h.gx);
    const sy = Y(h.gy);
    const good = h.danger ? '#ff6b5e' : '#ffe27a';
    const color = h.valid ? good : '#ff5a4d';
    if (h.mode === 'send') {
      if (h.valid && h.from) this.arrow(X(h.from[0]), Y(h.from[1]), sx, sy, time, color);
    } else {
      const rad = (h.radius ?? 3) * cam.scale;
      ctx.save();
      ctx.lineWidth = 3;
      ctx.strokeStyle = color;
      ctx.fillStyle = h.valid ? (h.danger ? 'rgba(255,90,70,0.2)' : 'rgba(255,240,170,0.18)') : 'rgba(255,60,50,0.16)';
      ctx.setLineDash([9, 7]);
      ctx.lineDashOffset = -time * 24;
      ctx.beginPath();
      ctx.arc(sx, sy, rad, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
    if (h.label) {
      ctx.save();
      ctx.font = `800 14px Nunito, "Trebuchet MS", sans-serif`;
      const w1 = ctx.measureText(h.label).width;
      ctx.font = `700 12px Nunito, "Trebuchet MS", sans-serif`;
      const w2 = h.sublabel ? ctx.measureText(h.sublabel).width : 0;
      const W = Math.max(w1, w2) + 20;
      const H = h.sublabel ? 44 : 28;
      // Try each side of the cursor and take the first that covers no face, name or panel.
      const blockers = [...this.labelBoxes, ...this.faceBoxes, ...this.obstacles, ...this.pillBoxes];
      const slots: [number, number][] = [[sx + 18, sy - H - 12], [sx - W - 18, sy - H - 12], [sx + 18, sy + 18], [sx - W - 18, sy + 18], [sx + 18, sy - H - 64], [sx - W - 18, sy - H - 64], [sx + 18, sy + 70], [sx - W - 18, sy + 70]];
      const clamped = slots.map(([x, y]): [number, number] => [Math.max(16, Math.min(cam.vw - W - 16, x)), Math.max(16, Math.min(cam.vh - H - 16, y))]);
      const free = clamped.find(([x, y]) => !blockers.some((o) => x < o.x1 && x + W > o.x0 && y < o.y1 && y + H > o.y0));
      const [px, py] = free ?? clamped[0];
      ctx.fillStyle = 'rgba(20,16,44,0.94)';
      ctx.strokeStyle = h.valid ? 'rgba(255,255,255,0.32)' : '#ff5a4d';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(px, py, W, H, 9);
      ctx.fill();
      ctx.stroke();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.font = `800 14px Nunito, "Trebuchet MS", sans-serif`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(h.label, px + 10, py + (h.sublabel ? 15 : H / 2 + 0.5));
      if (h.sublabel) {
        ctx.font = `700 12px Nunito, "Trebuchet MS", sans-serif`;
        ctx.fillStyle = '#aebcd6';
        ctx.fillText(h.sublabel, px + 10, py + 32);
      }
      ctx.restore();
    }
  }

  private glowCache = new Map<string, HTMLCanvasElement>();

  private glow(color: string): HTMLCanvasElement {
    let c = this.glowCache.get(color);
    if (!c) {
      c = document.createElement('canvas');
      c.width = 64;
      c.height = 64;
      const x = c.getContext('2d') as CanvasRenderingContext2D;
      const g = x.createRadialGradient(32, 32, 2, 32, 32, 32);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g;
      x.fillRect(0, 0, 64, 64);
      this.glowCache.set(color, c);
    }
    return c;
  }

  /** A glow along every active front so fights read at full-map zoom. Red means your land is being taken. */
  private drawFronts(game: Game, cam: Camera, human: number, X: (g: number) => number, Y: (g: number) => number, time: number): void {
    const { ctx } = this;
    const { w } = game;
    const small = cam.vw < 761 || cam.vh < 500;
    const size = small ? Math.min(40, Math.max(16, cam.scale * 5)) : Math.min(58, Math.max(26, cam.scale * 7));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const a of game.attacks) {
      const n = a.frontier.length;
      if (n === 0 || a.target === 0 && a.owner !== human) continue;
      const danger = a.target === human;
      const mine = a.owner === human;
      // On a small screen only your own fights glow; other wars would just hide the map.
      if (small && !danger && !mine) continue;
      // The glow takes the attacker's colour, so a front says who is pushing. Red always means it's you being hit.
      const sprite = this.glow(danger ? '#ff2c1e' : a.target === 0 ? 'rgba(255,214,90,0.85)' : game.players[a.owner].nation.fill);
      const samples = a.target === 0 ? 12 : 26;
      const stride = Math.max(1, Math.floor(n / samples));
      ctx.globalAlpha = (danger ? 0.85 : a.target === 0 ? 0.35 : 0.5) * (0.72 + 0.28 * Math.sin(time * 7 + a.id));
      for (let i = 0; i < n; i += stride) {
        const c = a.frontier[i];
        const sx = X((c % w) + 0.5);
        const sy = Y(((c / w) | 0) + 0.5);
        if (sx < -40 || sy < -40 || sx > cam.vw + 40 || sy > cam.vh + 40) continue;
        ctx.drawImage(sprite, sx - size / 2, sy - size / 2, size, size);
        // Call out a fort stopping an attack, so the player sees the building doing its job.
        if (a.target !== 0 && (danger || mine) && time > this.nextFortNote && game.fort[c] === a.target) {
          this.nextFortNote = time + 2.2;
          this.floaters.push({ x: (c % w) + 0.5, y: ((c / w) | 0) - 2, text: 'Fort holds!', color: '#a9ddff', life: 1.2, max: 1.2, size: 19, word: true });
        }
      }
    }
    ctx.restore();

  }

  /** A war pill on each front: who is fighting whom, the army's size, and who has the upper hand. */
  private drawWarPills(game: Game, cam: Camera, human: number, X: (g: number) => number, Y: (g: number) => number): void {
    const { ctx } = this;
    const { w } = game;
    const mine = (a: Attack) => (a.owner === human || a.target === human ? 1 : 0);
    const wars = game.attacks.filter((a) => a.target !== 0 && a.frontier.length > 0).sort((a, b) => mine(b) - mine(a) || b.troops - a.troops);
    const pills: Rect[] = [];
    this.pillBoxes = [];
    const small = cam.vw < 761 || cam.vh < 500;
    const baseW = small ? 124 : 138;
    const H = small ? 24 : 28;
    const faceR = small ? 7.5 : 9.5;
    const maxPills = small ? 2 : 3;
    for (const a of wars) {
      if (pills.length >= maxPills && !mine(a)) continue;
      const W = game.players[a.target].troops < 2 ? baseW + 26 : baseW;
      const stride = Math.max(1, Math.floor(a.frontier.length / 16));
      let mx = 0;
      let my = 0;
      let count = 0;
      for (let i = 0; i < a.frontier.length; i += stride) {
        mx += a.frontier[i] % w;
        my += (a.frontier[i] / w) | 0;
        count++;
      }
      const sx = X(mx / count + 0.5);
      const baseY = Y(my / count + 0.5);
      if (sx < W / 2 || baseY < H || sx > cam.vw - W / 2 || baseY > cam.vh - H) continue;
      const boxAt = (y: number): Rect => ({ x0: sx - W / 2 - 3, y0: y - H / 2 - 3, x1: sx + W / 2 + 3, y1: y + H / 2 + 3 });
      const clear = (d: number) => {
        const b = boxAt(baseY + d);
        const hit = (o: Rect) => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0;
        return !pills.some(hit) && !this.obstacles.some(hit) && !this.labelBoxes.some(hit) && !this.faceBoxes.some(hit);
      };
      // Your wars get their pill first. A pill slides off a face or name; with no clear space it waits.
      const offset = [0, -34, 34, -62, 62].find(clear);
      if (offset === undefined) continue;
      const sy = baseY + offset;
      const box = boxAt(sy);
      pills.push(box);
      this.pillBoxes.push(box);
      const att = game.players[a.owner];
      const def = game.players[a.target];
      const onUs = a.target === human;
      ctx.fillStyle = 'rgba(20,16,44,0.94)';
      ctx.strokeStyle = onUs ? '#ff4638' : '#1b1530';
      ctx.lineWidth = onUs ? 3 : 2.5;
      ctx.beginPath();
      ctx.roundRect(sx - W / 2, sy - H / 2, W, H, H / 2);
      ctx.fill();
      ctx.stroke();
      const barX = sx - W / 2 + faceR * 2.8;
      const barW = W - faceR * 5.6;
      const share = Math.max(0.08, Math.min(0.92, a.troops / Math.max(1, a.troops + def.troops)));
      ctx.fillStyle = def.nation.fill;
      ctx.fillRect(barX, sy + 2, barW, 5);
      ctx.fillStyle = att.nation.fill;
      ctx.fillRect(barX, sy + 2, barW * share, 5);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.strokeRect(barX, sy + 2, barW, 5);
      // Each side's strength beside its own face: the attacking army, and everyone defending.
      const fontSize = small ? 10.5 : 12;
      ctx.textAlign = 'center';
      const noArmy = def.troops < 2;
      this.label(fmt(a.troops), barX + barW * (noArmy ? 0.2 : 0.24), sy - 5, fontSize, '#ffffff');
      // An empty home army is news, not a zero: this nation has nothing left to defend with.
      if (noArmy) this.label('NO ARMY', barX + barW * 0.76, sy - 5, small ? 8.5 : 9.5, '#ffc9c2');
      else this.label(fmt(def.troops), barX + barW * 0.76, sy - 5, fontSize, '#ffffff');
      // The arrow points from the attacker to the defender.
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      const ax = noArmy ? sx - 5 : sx + 1;
      ctx.moveTo(ax + 4, sy - 5);
      ctx.lineTo(ax - 4, sy - 9.5);
      ctx.lineTo(ax - 4, sy - 0.5);
      ctx.closePath();
      ctx.fill();
      for (const [n, fx] of [[att.nation, sx - W / 2 + faceR + 2], [def.nation, sx + W / 2 - faceR - 2]] as const) {
        const size = faceR * SOLDIER_SPRITE;
        ctx.drawImage(soldierSprite(n, faceR), fx - size / 2, sy - faceR * SOLDIER_TOP, size, size);
      }
    }
  }

  /** A badge on each attack against you. It sticks to the screen edge if the fight is out of view. */
  private drawDanger(game: Game, cam: Camera, human: number, X: (g: number) => number, Y: (g: number) => number, time: number): void {
    if (human <= 0 || this.spot) return;
    const { ctx } = this;
    const { w } = game;
    for (const a of game.attacks) {
      if (a.target !== human || a.frontier.length === 0) continue;
      let mx = 0;
      let my = 0;
      const stride = Math.max(1, Math.floor(a.frontier.length / 20));
      let count = 0;
      for (let i = 0; i < a.frontier.length; i += stride) {
        mx += a.frontier[i] % w;
        my += (a.frontier[i] / w) | 0;
        count++;
      }
      const sx = X(mx / count + 0.5);
      const sy = Y(my / count + 0.5);
      const m = 26;
      const top = 96;
      const bottom = cam.vh - 130;
      const cx = Math.max(m, Math.min(cam.vw - m, sx));
      const cy = Math.max(top, Math.min(bottom, sy));
      const off = cx !== sx || cy !== sy;
      // On screen, the red-edged war pill already says this. The badge is for fights you cannot see.
      if (!off) continue;
      const pulse = 1 + Math.sin(time * 8 + a.id) * 0.09;
      const r = 14 * pulse;
      if (off) {
        const ang = Math.atan2(sy - cy, sx - cx);
        ctx.fillStyle = '#ff4638';
        ctx.strokeStyle = '#1b1530';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * (r + 13), cy + Math.sin(ang) * (r + 13));
        ctx.lineTo(cx + Math.cos(ang + 0.7) * r, cy + Math.sin(ang + 0.7) * r);
        ctx.lineTo(cx + Math.cos(ang - 0.7) * r, cy + Math.sin(ang - 0.7) * r);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.fillStyle = '#ff4638';
      ctx.strokeStyle = '#1b1530';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      this.label('!', cx, cy + 0.5, 20, '#ffffff');
    }
  }

  private drawMarker(cam: Camera, X: (g: number) => number, Y: (g: number) => number, time: number): void {
    const m = this.marker;
    if (!m) return;
    const { ctx } = this;
    const sx = X(m.gx);
    const sy = Y(m.gy);
    for (let i = 0; i < 2; i++) {
      const t = (time * 0.7 + i * 0.5) % 1;
      ctx.globalAlpha = 1 - t;
      ctx.strokeStyle = '#ffe27a';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(sx, sy, 8 + t * Math.max(30, cam.scale * 9), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const hop = Math.abs(Math.sin(time * 3.4)) * 11;
    ctx.fillStyle = '#ffd23f';
    ctx.strokeStyle = '#1b1530';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(sx, sy - 6 - hop);
    ctx.lineTo(sx - 13, sy - 24 - hop);
    ctx.lineTo(sx - 5, sy - 24 - hop);
    ctx.lineTo(sx - 5, sy - 40 - hop);
    ctx.lineTo(sx + 5, sy - 40 - hop);
    ctx.lineTo(sx + 5, sy - 24 - hop);
    ctx.lineTo(sx + 13, sy - 24 - hop);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    this.label(this.markerText, Math.max(62, Math.min(cam.vw - 62, sx)), sy - 54 - hop, 19, '#ffe27a');
  }

  private drawCelebration(cam: Camera, dt: number): void {
    const { ctx } = this;
    const s = this.spot;
    if (s) {
      // Pour confetti for the first few seconds, then let it drift off the screen.
      if (s.t < 5 && this.confettiOn) {
        const n = Math.ceil(dt * 150);
        for (let i = 0; i < n && this.confetti.length < 420; i++) {
          this.confetti.push({
            x: Math.random() * cam.vw, y: -16, vx: rnd(-40, 40), vy: rnd(120, 300), rot: Math.random() * 6, vr: rnd(-7, 7),
            w: rnd(6, 11), h: rnd(9, 16), color: pick(s.colors),
          });
        }
      }
    }
    let w = 0;
    for (let i = 0; i < this.confetti.length; i++) {
      const c = this.confetti[i];
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.rot += c.vr * dt;
      if (c.y > cam.vh + 20) continue;
      this.confetti[w++] = c;
      const sl = this.spotLabel;
      if (s && sl && c.x > sl.x0 && c.x < sl.x1 && c.y > sl.y0 && c.y < sl.y1) continue;
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rot);
      ctx.fillStyle = c.color;
      ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h * Math.abs(Math.cos(c.rot * 2)));
      ctx.restore();
    }
    this.confetti.length = w;
    if (s && !this.titleDone) {
      const size = Math.max(34, Math.min(84, cam.vw * 0.075));
      const y = Math.max(60, cam.vh * 0.14);
      const a = Math.min(1, s.t / 0.25);
      ctx.globalAlpha = a;
      this.label(s.title, cam.vw / 2, y, size, '#ffd23f');
      if (s.sub) this.label(s.sub, cam.vw / 2, y + size * 0.82, Math.max(16, size * 0.34), '#ffffff');
      ctx.globalAlpha = 1;
    }
  }

  /** Where a nation's ball currently stands, in grid cells. */
  leaderPos(p: number): [number, number] | null {
    const l = this.leaders.get(p);
    return l ? [l.x, l.y] : null;
  }

  /** Leader whose ball is under a screen point, so tapping a ball opens diplomacy rather than attacking. */
  leaderAt(cam: Camera, sx: number, sy: number): number {
    for (const [p, l] of this.leaders) {
      if (!l.visible) continue;
      const r = leaderRadius(l.r, cam.scale);
      const dx = cam.toScreenX(l.x) - sx;
      const dy = cam.toScreenY(l.y) - sy;
      if (dx * dx + dy * dy < (r + 5) * (r + 5)) return p;
    }
    return -1;
  }
}

export const BUILD_RADIUS = B.BUILD_SPACING;
