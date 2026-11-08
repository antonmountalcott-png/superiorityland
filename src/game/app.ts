import { Sfx } from '../audio/sfx';
import { B, TERRAIN_COST, TERRAIN_NAME, TPS, Terrain, WATER } from '../core/balance';
import { cardById } from '../core/cards';
import { nationById } from '../core/nations';
import { type MatchOutcome, type MatchReport, applyMatch, owns } from '../core/progress';
import { skillById } from '../core/skills';
import { autoSpawnCell, createMatch } from '../core/setup';
import type { BuildingKind, Game, GameEvent } from '../core/sim';
import { Camera } from '../render/camera';
import { GLMap } from '../render/glMap';
import { type HoverInfo, Overlay, fmt } from '../render/overlay';
import { paintLand } from '../render/terrainPainter';
import { type ActionMode, Hud } from '../ui/hud';
import { Menu, type MenuChoice } from '../ui/menu';
import { AuthScreen } from '../ui/auth';
import { PassScreen } from '../ui/pass';
import { ProfileScreen } from '../ui/profile';
import { saveLine } from '../ui/progressUi';
import { showResults } from '../ui/results';
import { inputWords } from '../ui/svg';
import { Account } from './account';

const SPEEDS = [1, 2, 3];
type Phase = 'menu' | 'spawn' | 'play' | 'over';
type Screen = 'menu' | 'game' | 'results';

const TIPS_KEY = 'superiorityland.tips';
const loadTips = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(TIPS_KEY) ?? '[]');
  } catch {
    return [];
  }
};

export class App {
  readonly gl: GLMap;
  readonly overlay: Overlay;
  readonly cam = new Camera();
  readonly hud: Hud;
  readonly menu: Menu;
  readonly sfx = new Sfx();
  readonly resultsEl: HTMLElement;
  readonly account = new Account();
  readonly auth: AuthScreen;
  readonly pass: PassScreen;
  readonly profile: ProfileScreen;
  /** The match whose XP has been awarded, so watching to the end never pays twice. */
  private awardedGame: Game | null = null;
  lastOutcome: MatchOutcome | null = null;

  game: Game | null = null;
  phase: Phase = 'menu';
  human = 0;
  mode: ActionMode = 'send';
  pct = 0.5;
  speedIdx = 0;
  paused = false;
  soundOn = true;

  private last = 0;
  private acc = 0;
  private time = 0;
  private hudClock = 0;
  private pointer: { x: number; y: number } | null = null;
  private pointers = new Map<number, { x: number; y: number }>();
  private dragged = false;
  private downAt = { x: 0, y: 0 };
  private pinchDist = 0;
  private touchUsed = false;
  /** Tips show once ever, not once a match: a returning player should not be taught again. */
  private tutorialSeen = new Set<string>(loadTips());
  private sends = 0;
  private coachUntilTick = 0;
  private coachOn = false;
  private coachShownTick = 0;
  private coachKey = '';
  private screen: Screen = 'menu';
  private obstacleClock = 0;
  suggested = -1;
  lastCard: HTMLCanvasElement | null = null;
  private lastChoice: MenuChoice | null = null;
  private resultShown = false;
  private spectating = false;
  private lastLand = 0;
  readonly seedOverride: number | null;
  readonly autoHuman: boolean;
  lastBoomTick = -1;
  private hoverMuteUntil = 0;

  constructor() {
    const params = new URLSearchParams(location.search);
    this.seedOverride = params.has('seed') ? Number(params.get('seed')) : null;
    this.autoHuman = params.get('auto') === '1';

    this.gl = new GLMap(document.getElementById('map') as HTMLCanvasElement);
    this.overlay = new Overlay(document.getElementById('fx') as HTMLCanvasElement);
    this.resultsEl = document.getElementById('results') as HTMLElement;
    this.hud = new Hud(document.getElementById('hud') as HTMLElement, {
      setPct: (p) => { this.pct = p; this.sfx.click(); },
      setMode: (m) => this.setMode(this.mode === m ? 'send' : m),
      pickCard: (id) => {
        this.game?.queueCommand({ t: 'card', p: this.human, id });
        this.sfx.card();
      },
      askTruce: (o) => {
        this.game?.queueCommand({ t: 'truce', p: this.human, other: o });
        this.sfx.click();
      },
      buyPeace: (o) => {
        this.game?.queueCommand({ t: 'peace', p: this.human, other: o });
        this.sfx.coin();
      },
      bribe: (o, target) => {
        this.game?.queueCommand({ t: 'bribe', p: this.human, other: o, target });
        this.sfx.coin();
      },
      replyTruce: (o, a) => this.game?.queueCommand({ t: 'truceReply', p: this.human, other: o, accept: a }),
      focusPlayer: (id) => this.focusPlayer(id),
      togglePause: () => this.togglePause(),
      cycleSpeed: () => { this.speedIdx = (this.speedIdx + 1) % SPEEDS.length; this.sfx.click(); },
      toggleSound: () => {
        this.soundOn = !this.soundOn;
        this.sfx.enabled = this.soundOn;
        this.sfx.click();
      },
      zoom: (f) => this.cam.zoomAt(this.cam.vw / 2, this.cam.vh / 2, f),
      home: () => this.cam.toggleOverview(),
      dismissCoach: () => this.clearCoach(),
    });
    this.menu = new Menu(document.getElementById('menu') as HTMLElement, this.account, {
      play: (c) => this.startMatch(c),
      openPass: (level) => this.openPass(level),
      openProfile: () => this.openProfile(),
      openAuth: () => this.auth.show('register'),
    });
    this.auth = new AuthScreen(document.getElementById('auth') as HTMLElement, this.account, () => this.afterAuth());
    const screenEl = document.getElementById('screen') as HTMLElement;
    this.pass = new PassScreen(screenEl, this.account, {
      close: () => this.pass.close(),
      playAs: () => {
        this.pass.close();
        // From the results screen, go back to the title so the new pick is right there under PLAY.
        if (this.screen === 'results') this.startDemo();
      },
    });
    this.profile = new ProfileScreen(screenEl, this.account, {
      close: () => this.profile.close(),
      logout: () => void this.logout(),
      createAccount: () => {
        this.profile.close();
        this.auth.show('register');
      },
    });

    this.bindInput();
    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.startDemo();
    this.hud.setVisible(false);
    requestAnimationFrame((t) => {
      this.last = t;
      this.frame(t);
    });
  }

  /** Logs a returning player straight in. Everyone else sees the account screen first. */
  async boot(): Promise<void> {
    this.menu.setVisible(false);
    const r = await this.account.restore();
    if (r === 'user') {
      this.menu.setVisible(true);
      this.menu.toast(`Welcome back, ${this.account.username}!`, "You're logged in.");
      return;
    }
    if (r === 'offline') this.auth.show('login', "Can't reach the game server right now, so you can't log in. You can still play as a guest.");
    else this.auth.show('register');
  }

  private afterAuth(): void {
    if (this.screen === 'menu' && this.phase === 'menu') this.menu.setVisible(true);
    if (this.account.signedIn) this.menu.toast(`Logged in as ${this.account.username}.`, 'Progress saves automatically.');
  }

  private async logout(): Promise<void> {
    await this.account.logout();
    this.profile.close();
    if (this.screen !== 'menu' || this.phase !== 'menu') this.startDemo();
    this.menu.setVisible(false);
    this.auth.show('login', 'You have logged out. Your progress is safe in your account.');
  }

  openPass(level?: number): void {
    this.profile.close();
    this.pass.open(level);
  }

  openProfile(): void {
    this.pass.close();
    this.profile.open();
  }

  private get titleUp(): boolean {
    return this.menu.visible || this.auth.visible;
  }

  // ---- Sizing -----------------------------------------------------------------------------

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.gl.resize(w, h, dpr);
    this.overlay.resize(w, h, dpr);
    this.cam.resize(w, h);
    this.applyInsets();
  }

  /** Tell the camera which screen edges are covered by UI, so "centre" means the visible centre. */
  private applyInsets(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const phone = w < 761;
    const short = h < 500;
    if (this.screen === 'results' && !phone && !short) this.cam.setInsets(0, 0, Math.min(660, w * 0.5), 0);
    else if (this.screen === 'results' && phone) this.cam.setInsets(0, 0, 0, Math.round(h * 0.76));
    else if (this.screen === 'game') {
      if (phone) this.cam.setInsets(0, 112, 0, 168);
      else if (short) this.cam.setInsets(0, 34, 0, 64);
      else this.cam.setInsets(0, 84, 0, 128);
      if (this.phase === 'spawn') this.cam.setInsets(0, 0, 0, 0);
    } else this.cam.setInsets(0, 0, 0, 0);
  }

  private setScreen(s: Screen): void {
    this.screen = s;
    this.applyInsets();
    this.cam.home();
  }

  private terrainScale(): number {
    return Math.min(window.innerWidth, window.innerHeight) < 700 ? 4 : 5;
  }

  // ---- Match lifecycle --------------------------------------------------------------------

  private loadGame(game: Game): void {
    this.game = game;
    this.overlay.reset();
    const land = paintLand(game.world, this.terrainScale());
    this.gl.setWorld(game.world, land);
    this.gl.setPalette(game.players.slice(1).map((p) => p.nation));
    game.takeDirty();
    game.takeEvents();
    this.gl.loadOwners(game.owner);
    this.cam.setWorld(game.w, game.h);
    this.acc = 0;
  }

  startDemo(): void {
    const seed = this.seedOverride ?? Math.floor(Math.random() * 1e9);
    const game = createMatch({ seed, map: 'continents', difficulty: 'general', bots: 13 });
    this.human = 0;
    this.phase = 'menu';
    this.screen = 'menu';
    this.applyInsets();
    this.loadGame(game);
    game.start();
    // Skip the empty opening so the title screen already shows a world at war.
    for (let i = 0; i < 620; i++) game.step();
    game.takeEvents();
    this.gl.loadOwners(game.owner);
    game.takeDirty();
    this.menu.setVisible(!this.auth.visible);
    this.hud.setVisible(false);
    this.resultsEl.classList.add('hidden');
  }

  startMatch(choice: MenuChoice): void {
    // Only a ball you own can take the field.
    if (!owns(this.account.progress, 'ball', choice.nation.id)) choice = { ...choice, nation: nationById(this.account.progress.equipped.ball) };
    this.lastChoice = choice;
    this.pass.close();
    this.profile.close();
    const skill = skillById(this.account.progress.equipped.skill);
    this.sfx.unlock();
    this.sfx.click();
    const seed = this.seedOverride ?? Math.floor(Math.random() * 1e9);
    const game = createMatch({
      seed, map: choice.map, difficulty: choice.difficulty, bots: choice.bots,
      humanNation: choice.nation, autoHuman: this.autoHuman,
      humanBoost: skill ? (m) => skill.apply(m) : undefined,
    });
    this.human = 1;
    this.phase = 'spawn';
    this.mode = 'send';
    this.pct = 0.5;
    this.paused = false;
    this.speedIdx = 0;
    this.sends = 0;
    this.resultShown = false;
    this.spectating = false;
    this.lastLand = 0;
    this.coachOn = false;
    this.screen = 'game';
    this.applyInsets();
    this.loadGame(game);
    this.menu.setVisible(false);
    this.resultsEl.classList.add('hidden');
    this.hud.setGame(game, 1);
    this.hud.setVisible(true);
    this.hud.setSpawnPhase(true);
    // Point at a good spot so nobody has to work out where to start.
    this.suggested = autoSpawnCell(game, seed);
    const sg = this.suggested;
    this.overlay.markerText = 'Good spot!';
    this.overlay.marker = { gx: (sg % game.w) + 0.5, gy: ((sg / game.w) | 0) + 0.5 };
    // On a phone, open on the suggested corner of the world, at a size where faces can be read.
    // Filling the screen's height means no bands of empty ocean. Dragging shows the rest.
    if (this.cam.vh > this.cam.vw * 1.15) {
      // Frame the land around the suggested spot, not the sea beyond it.
      const lm = game.world.landmass[sg];
      let sumX = 0;
      let sumY = 0;
      let cells = 0;
      for (let i = 0; i < game.world.landmass.length; i += 3) {
        if (game.world.landmass[i] === lm) {
          sumX += i % game.w;
          sumY += (i / game.w) | 0;
          cells++;
        }
      }
      const gx = (sg % game.w) * 0.55 + (sumX / Math.max(1, cells)) * 0.45;
      const gy = ((sg / game.w) | 0) * 0.4 + (sumY / Math.max(1, cells)) * 0.6;
      this.cam.focus(gx, gy, (this.cam.vh / game.h) * 1.3, true);
    }
    this.hud.coach('spawn', '<b>Welcome, leader!</b> Tap where your capital should go. The arrow marks a good spot.' + (this.cam.vh > this.cam.vw * 1.15 ? ' Drag to look around.' : ''));
    this.coachOn = true;
    this.coachUntilTick = Infinity;
  }

  private plantCapital(cell: number): void {
    const g = this.game;
    if (!g || !this.spawnAllowed(cell)) {
      this.hud.toast('Pick open land, away from other nations');
      this.sfx.error();
      return;
    }
    this.overlay.marker = null;
    g.spawn(this.human, cell);
    g.start();
    this.phase = 'play';
    this.applyInsets();
    this.hud.setSpawnPhase(false);
    this.gl.applyChanges(g.takeDirty(), g.owner, true);
    this.lastLand = g.players[this.human].land;
    this.sfx.build();
    this.hud.banner('GO!', 'Conquer the world');
    const portrait = this.cam.vh > this.cam.vw * 1.15;
    if (portrait) this.cam.focus(cell % g.w, (cell / g.w) | 0, this.cam.homeScale);
    else this.cam.home();
    this.clearCoach();
    // Point at somewhere specific to tap: the first move should never need working out.
    const near = g.contactCell(this.human, 0);
    if (near >= 0) {
      const nx = near % g.w;
      const ny = (near / g.w) | 0;
      const cx = cell % g.w;
      const cy = (cell / g.w) | 0;
      const len = Math.hypot(nx - cx, ny - cy) || 1;
      this.overlay.markerText = inputWords('Tap here!');
      this.overlay.marker = { gx: nx + ((nx - cx) / len) * 9, gy: ny + ((ny - cy) / len) * 9 };
    }
    this.hud.coach('expand', '<b>Tap nearby land</b> to send your army and claim it.');
    this.coachOn = true;
    this.coachUntilTick = Infinity;
  }

  private spawnAllowed(cell: number): boolean {
    const g = this.game;
    if (!g || g.owner[cell] !== 0) return false;
    const t = g.world.terrain[cell];
    if (t === Terrain.Mountain) return false;
    const { w } = g;
    for (let i = 1; i < g.nPlayers; i++) {
      const c = g.players[i].capital;
      if (c < 0) continue;
      const d = ((c % w) - (cell % w)) ** 2 + (((c / w) | 0) - ((cell / w) | 0)) ** 2;
      if (d < 14 * 14) return false;
    }
    return true;
  }

  private setMode(m: ActionMode): void {
    this.mode = m;
    this.sfx.click();
  }

  private togglePause(): void {
    if (this.phase !== 'play') return;
    this.paused = !this.paused;
    this.sfx.click();
  }

  private focusPlayer(id: number): void {
    this.hud.openPopover(id);
    const g = this.game;
    if (!g) return;
    const cap = g.players[id].capital;
    if (cap >= 0 && this.cam.scale > this.cam.homeScale * 1.2) this.cam.focus(cap % g.w, (cap / g.w) | 0);
  }

  // ---- Input ------------------------------------------------------------------------------

  private cellAt(sx: number, sy: number): number {
    const g = this.game;
    if (!g) return -1;
    const [gx, gy] = this.cam.toGrid(sx, sy);
    const x = Math.floor(gx);
    const y = Math.floor(gy);
    if (x < 0 || y < 0 || x >= g.w || y >= g.h) return -1;
    return x + y * g.w;
  }

  private bindInput(): void {
    const el = this.overlay.canvas;
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.downAt = { x: e.clientX, y: e.clientY };
      this.dragged = false;
      this.touchUsed = e.pointerType === 'touch';
      if (this.pointers.size === 2) this.pinchDist = this.pinchSpan();
      this.sfx.unlock();
    });
    el.addEventListener('pointermove', (e) => {
      this.pointer = e.pointerType === 'touch' ? null : { x: e.clientX, y: e.clientY };
      const prev = this.pointers.get(e.pointerId);
      if (!prev) return;
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      prev.x = e.clientX;
      prev.y = e.clientY;
      if (this.pointers.size === 2) {
        const span = this.pinchSpan();
        if (this.pinchDist > 0) {
          const [a, b] = [...this.pointers.values()];
          this.cam.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, span / this.pinchDist);
        }
        this.pinchDist = span;
        this.dragged = true;
        return;
      }
      if (Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) > 7) this.dragged = true;
      if (this.dragged) this.cam.panBy(dx, dy);
    });
    const up = (e: PointerEvent) => {
      const wasDown = this.pointers.delete(e.pointerId);
      if (!wasDown) return;
      if (e.type === 'pointerup' && !this.dragged && this.pointers.size === 0 && e.button === 0) this.tap(e.clientX, e.clientY);
      if (this.pointers.size < 2) this.pinchDist = 0;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', () => { this.pointer = null; });
    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.mode !== 'send') this.mode = 'send';
      else if (this.phase === 'play') {
        const cell = this.cellAt(e.clientX, e.clientY);
        const g = this.game;
        if (g && cell >= 0 && g.owner[cell] > 0 && g.owner[cell] !== WATER && g.owner[cell] !== this.human) this.hud.openPopover(g.owner[cell]);
      }
    });
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.cam.zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0014));
    }, { passive: false });

    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
      if (e.key === 'Escape' && !document.getElementById('screen')?.classList.contains('hidden')) {
        this.pass.close();
        this.profile.close();
        return;
      }
      if (this.phase !== 'play') return;
      const pcts = [0.1, 0.25, 0.5, 0.75, 1];
      if (e.key >= '1' && e.key <= '5') {
        this.pct = pcts[Number(e.key) - 1];
      } else if (e.key === 'Escape') {
        this.mode = 'send';
        this.hud.closePopover();
      } else if (e.key === ' ') {
        e.preventDefault();
        this.togglePause();
      } else {
        const keys: Record<string, ActionMode> = { q: 'fort', w: 'barracks', e: 'market', r: 'bomb', t: 'para' };
        const m = keys[e.key.toLowerCase()];
        if (m) this.setMode(this.mode === m ? 'send' : m);
      }
    });
  }

  private pinchSpan(): number {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  private tap(sx: number, sy: number): void {
    const g = this.game;
    if (!g) return;
    this.hud.closePopover();
    const cell = this.cellAt(sx, sy);
    if (this.phase === 'spawn') {
      if (cell >= 0) this.plantCapital(cell);
      return;
    }
    if (this.phase !== 'play' || this.paused) return;
    const me = g.players[this.human];
    if (!me || !me.alive) return;

    if (this.mode === 'send') {
      const leader = this.overlay.leaderAt(this.cam, sx, sy);
      if (leader > 0 && leader !== this.human) {
        this.hud.openPopover(leader);
        this.sfx.click();
        return;
      }
    }
    if (cell < 0) return;

    switch (this.mode) {
      case 'send': {
        const order = g.previewOrder(this.human, cell);
        if (order.kind === 'none') {
          if (order.blocked === 'truce') {
            this.hud.toast('You have a truce with them');
            this.sfx.error();
          }
          return;
        }
        g.queueCommand({ t: 'send', p: this.human, cell, pct: this.pct });
        this.sends++;
        this.sfx.send();
        this.onSent();
        break;
      }
      case 'bomb':
        g.queueCommand({ t: 'bomb', p: this.human, cell });
        this.mode = 'send';
        this.afterAction();
        break;
      case 'para':
        g.queueCommand({ t: 'para', p: this.human, cell, pct: this.pct });
        this.mode = 'send';
        this.afterAction();
        break;
      default: {
        const kind = this.mode as BuildingKind;
        const why = g.canBuild(me, kind, cell);
        if (why) {
          this.hud.toast(why);
          this.sfx.error();
          return;
        }
        g.queueCommand({ t: 'build', p: this.human, kind, cell });
        this.mode = 'send';
        this.afterAction();
      }
    }
  }

  // ---- Tutorial ---------------------------------------------------------------------------

  private onSent(): void {
    if (this.coachUntilTick === Infinity) this.clearCoach();
    this.overlay.marker = null;
    this.afterAction();
    const self = this.game?.players[this.human];
    if (self && self.land < 400) this.showTip('send', '<b>Your army is marching!</b> SEND ARMY sets how many troops each tap sends. More grabs more land, but leaves home weaker.');
  }

  /** Doing something retires the tip on screen: once a player is acting, it has done its job. */
  private afterAction(): void {
    const g = this.game;
    if (g && this.coachOn && this.coachUntilTick !== Infinity && g.tick > this.coachShownTick + 2 * TPS) this.clearCoach();
  }

  private clearCoach(): void {
    this.coachOn = false;
    this.coachUntilTick = 0;
    this.hud.coach('', null);
  }

  /** At most one tip at a time, each shown once, gone after 8 seconds of play. */
  private showTip(key: string, html: string, ticks = 7 * TPS): void {
    if (this.tutorialSeen.has(key) || this.coachOn || this.hud.busy) return;
    this.coachShownTick = this.game?.tick ?? 0;
    this.tutorialSeen.add(key);
    try {
      localStorage.setItem(TIPS_KEY, JSON.stringify([...this.tutorialSeen]));
    } catch {
      // Private browsing: tips may simply repeat next visit.
    }
    this.hud.coach(key, html);
    this.coachKey = key;
    this.coachOn = true;
    // Phones have less map to spare, so tips leave sooner there.
    this.coachUntilTick = (this.game?.tick ?? 0) + (window.innerWidth < 761 ? Math.min(ticks, 6 * TPS) : ticks);
  }

  private updateTutorial(g: Game): void {
    const me = g.players[this.human];
    if (!me.alive) {
      if (this.coachOn) this.clearCoach();
      return;
    }
    // A decision on screen takes priority over any tip.
    if (this.coachOn && this.coachUntilTick !== Infinity && this.hud.busy) this.clearCoach();
    // Anything pointing at the first move retires once that move is plainly behind us.
    if (me.land > 150) this.overlay.marker = null;
    if (this.coachOn && this.coachUntilTick === Infinity && me.land > 150) this.clearCoach();
    if (this.coachOn && g.tick > this.coachUntilTick) this.clearCoach();
    // Tips must stay true: "Big Boom is ready" goes the moment the gold is spent.
    if (this.coachOn && this.coachKey === 'strike' && (me.gold < g.bombCost(me) || g.tick < me.bombReady)) this.clearCoach();
    if (this.coachOn) return;
    // Lessons belong to the opening. Past it, nobody needs a tutorial on top of a war.
    if (g.landShare(me) > 0.15) return;

    if (me.land > 30 && g.tick > 60) {
      this.showTip('growth', '<b>Keep troops in the green zone.</b> They grow fastest there. Too full and growth slows, so send them out!');
    }
    if (this.coachOn) return;
    if (me.gold >= 90 && me.land > 120) {
      this.showTip('gold', '<b>You have gold!</b> A Market earns more. Barracks hold more troops. Pick one below, then tap your land.');
    } else if (this.tutorialSeen.has('enemy') && g.attacks.some((a) => a.target !== 0)) {
      this.showTip('pills', '<b>War tags</b> show each side of a fight, and the bar shows who is ahead. NO ARMY means they have nothing left.');
    } else if (this.hasEnemyContact(g)) {
      this.showTip('enemy', '<b>Neighbours!</b> Tap their land to attack. Big nations with few troops fall fast. <b>Tap their ball</b> to talk.');
    } else if (g.world.landmassSizes.length > 1 && !g.hasContact(this.human, 0) && g.neutralLeft > 0) {
      this.showTip('boat', '<b>Out of room?</b> Tap land across the sea and your army sails there by boat.');
    }
    if (this.coachOn) return;
    if (me.gold >= g.bombCost(me) && g.tick >= me.bombReady) {
      this.showTip('strike', '<b>Big Boom is ready.</b> Blast a stubborn front, or Airdrop troops behind enemy lines.');
    } else if (g.tick > 500) {
      this.showTip('terrain', '<b>Terrain matters.</b> Mountains and rivers are slow and costly, so they make great walls.');
    }
  }

  private hasEnemyContact(g: Game): boolean {
    for (let i = 1; i < g.nPlayers; i++) if (i !== this.human && g.players[i].alive && g.hasContact(this.human, i)) return true;
    return false;
  }

  // ---- Events -----------------------------------------------------------------------------

  private processEvents(events: GameEvent[], silent = false): void {
    const g = this.game;
    if (!g) return;
    // The world behind the title screen stays quiet: no blasts or puffs competing with the logo.
    if (this.phase === 'menu') return;
    if (!silent) this.overlay.handleEvents(events, g, this.human);
    const me = this.human;
    for (const e of events) {
      switch (e.t) {
        case 'reject':
          if (e.p === me && !silent) {
            this.hud.toast(e.reason);
            this.sfx.error();
          }
          break;
        case 'poi':
          if (e.p === me && !silent) {
            const poi = g.world.pois[e.poi];
            this.hud.feed(poi.kind === 'city' ? `You took ${poi.name}! +${e.loot} gold` : `Gold mine captured! +${e.loot} gold`, g.players[me], 'good');
            this.sfx.coin();
          } else if (e.prev === me && !silent) {
            this.hud.feed(`${g.players[e.p].nation.name} took ${g.world.pois[e.poi].name}`, g.players[e.p], 'bad');
          }
          break;
        case 'attacked':
          if (e.p === me && !silent && e.by > 0) {
            this.hud.feed(`${g.players[e.by].nation.name} is attacking you!`, g.players[e.by], 'bad');
            this.sfx.alarm();
          }
          break;
        case 'capital':
          if (silent) break;
          if (e.prev === me && e.p > 0) {
            this.clearCoach();
            this.hud.capitalBanner(g.players[e.p], g.players[me], 'CAPITAL LOST!', `${g.players[e.p].nation.name} took your capital, and your troops and gold with it`);
            this.sfx.alarm();
          } else if (e.p === me) {
            this.clearCoach();
            {
              const taken = g.players[e.prev];
              const self = g.players[me];
              const show = () => this.hud.capitalBanner(self, taken, 'CAPITAL SEIZED!', `You took the capital of ${taken.nation.name}!`);
              if (this.time < this.hoverMuteUntil) window.setTimeout(show, 1200);
              else show();
            }
            this.sfx.win();
          } else if (e.p > 0) {
            this.hud.feed(`${g.players[e.p].nation.name} seized the capital of ${g.players[e.prev].nation.name}`, g.players[e.p]);
          }
          break;
        case 'eliminated':
          if (e.p === me) {
            if (!silent) this.sfx.lose();
            this.onHumanOut();
          } else if (!silent) {
            this.hud.dropFeed(`${g.players[e.p].nation.name} is attacking`);
            const by = e.by > 0 ? g.players[e.by].nation.name : 'history';
            this.hud.feed(`${g.players[e.p].nation.name} was wiped out by ${by}`, g.players[e.p]);
            if (e.by === me) {
              this.hud.banner('NATION ENDED!', g.players[e.p].nation.name, 1800);
              this.sfx.coin();
            }
          }
          break;
        case 'bombHit':
          if (e.p === me) {
            this.lastBoomTick = g.tick;
            // Nothing sits on top of your own explosion.
            this.hoverMuteUntil = this.time + 1.6;
            if (!silent) this.hud.clearBanner();
          }
          if (!silent) this.sfx.boom();
          break;
        case 'strike':
          if (!silent && e.p === me) this.sfx.whoosh();
          break;
        case 'built':
          if (e.p === me && !silent) this.sfx.build();
          break;
        case 'cardOffer':
          if (e.p === me && !silent) this.sfx.card();
          break;
        case 'cardPicked':
          if (e.p === me && !silent) this.hud.feed(`New upgrade: ${cardById(e.id).name}`, g.players[me], 'good');
          break;
        case 'truceAsked':
          if (e.other === me && !silent) {
            this.clearCoach();
            this.hud.showTruceAsk(g.players[e.p]);
          }
          break;
        case 'bribed':
          if (e.p === me && !silent) this.hud.feed(`You paid ${g.players[e.other].nation.name} to attack ${g.players[e.target].nation.name}`, g.players[e.other], 'good');
          else if (e.target === me && !silent) this.hud.feed(`Someone paid ${g.players[e.other].nation.name} to attack you!`, g.players[e.other], 'bad');
          break;
        case 'truceYes':
          if (!silent && (e.other === me || e.p === me)) this.hud.feed(`Truce with ${g.players[e.p === me ? e.other : e.p].nation.name}`, g.players[e.p === me ? e.other : e.p], 'good');
          break;
        case 'truceNo':
          if (e.other === me && !silent) {
            const them = g.players[e.p];
            const why = them.troops > g.players[me].troops ? 'they think they can beat you' : 'they do not trust you yet';
            this.hud.feed(`${them.nation.name} refused: ${why}`, them, 'bad');
          }
          break;
        case 'truceEnd':
          if (!silent && (e.p === me || e.other === me)) this.hud.feed(`Your truce with ${g.players[e.p === me ? e.other : e.p].nation.name} ended`, g.players[e.p === me ? e.other : e.p]);
          break;
        case 'victory':
          this.phase = 'over';
          this.overlay.marker = null;
          this.clearCoach();
          if (e.p === me) this.sfx.win();
          else this.sfx.lose();
          // Give the moment room: the whole world, the winner crowned, before any panel appears.
          this.hud.setVisible(false);
          this.resultsEl.classList.add('hidden');
          this.mode = 'send';
          this.setScreen('menu');
          this.overlay.handleEvents([], g, me);
          this.overlay.celebrate(
            e.p,
            e.p === me ? 'VICTORY!' : `${g.players[e.p].nation.name.toUpperCase()} WINS!`,
            e.p === me ? `${g.players[e.p].nation.name} rules the world` : 'The world has a new owner. Sadly, not you.',
            [...g.players[e.p].nation.flag.colors, '#ffd23f', '#ffffff'],
            e.p === me,
          );
          window.setTimeout(() => this.showEnd(), 3000);
          break;
      }
    }
  }

  private onHumanOut(): void {
    if (this.resultShown) return;
    window.setTimeout(() => this.showEnd(), 900);
  }

  private showEnd(): void {
    const g = this.game;
    if (!g || this.phase === 'menu') return;
    if (this.resultShown && g.phase !== 'over') return;
    if (this.spectating && g.phase !== 'over') return;
    this.resultShown = true;
    this.clearCoach();
    this.hud.setVisible(false);
    this.setScreen('results');
    this.overlay.endCelebrationTitle();
    // On a phone the map sits above the panel, so bring the champion into that space.
    if (window.innerWidth < 761 && g.winner > 0) {
      const pos = this.overlay.leaderPos(g.winner);
      if (pos) this.cam.pin(pos[0], pos[1], this.cam.homeScale);
    }
    let animate = false;
    if (this.awardedGame !== g) {
      this.awardedGame = g;
      const out = applyMatch(this.account.progress, this.buildReport(g));
      this.lastOutcome = out;
      this.account.setProgress(out.progress);
      animate = true;
      if (out.after.level > out.before.level) window.setTimeout(() => this.sfx.win(), 1300);
    }
    const account = this.account;
    const outcome = this.lastOutcome;
    showResults(this.resultsEl, g, this.human, {
      progress: outcome ? {
        outcome,
        animate,
        ball: g.players[this.human].nation.id,
        get signedIn() { return account.signedIn; },
        saveHtml: () => saveLine(account.saveState, account.lastSaved),
        onSaveChange: (fn) => account.onChange(fn),
        openPass: (level) => this.openPass(level),
        createAccount: () => this.auth.show('register', 'Create an account and the XP from this match comes with you.'),
        playAs: (id) => {
          this.account.update((q) => { q.equipped.ball = id; });
          this.resultsEl.classList.add('hidden');
          if (this.lastChoice) this.startMatch({ ...this.lastChoice, nation: nationById(id) });
        },
      } : undefined,
      snapshot: () => this.snapshotWorld(),
      onCard: (c) => { this.lastCard = c; },
      again: () => {
        this.resultsEl.classList.add('hidden');
        if (this.lastChoice) this.startMatch({ ...this.lastChoice, nation: nationById(this.account.progress.equipped.ball) });
      },
      menu: () => {
        this.startDemo();
        // One more chance for a guest to keep what they earned.
        if (!this.account.signedIn && this.account.progress.xp > 0) {
          this.menu.setVisible(false);
          this.auth.show('register', `Before you go: create a free account to keep your ${this.account.progress.xp.toLocaleString('en-US')} XP and everything it unlocked.`);
        }
      },
      spectate: () => {
        this.spectating = true;
        this.resultsEl.classList.add('hidden');
        this.hud.setVisible(true);
        this.setScreen('game');
      },
    });
  }

  private buildReport(g: Game): MatchReport {
    const me = g.players[this.human];
    const won = g.winner === this.human;
    const place = won ? 1 : me.place || g.ranking().indexOf(me) + 1;
    const ended = me.alive || won ? g.tick : me.eliminatedAt;
    return {
      won, place, total: g.nPlayers - 1, peakShare: me.stats.peakLand / g.world.landCells,
      cities: me.stats.citiesTaken, kills: me.stats.kills, booms: me.stats.bombs, boats: me.stats.boats,
      seconds: ended / TPS, difficulty: this.lastChoice?.difficulty ?? 'recruit', map: this.lastChoice?.map ?? 'continents',
      nation: me.nation.id, forts: me.forts, markets: me.markets, cards: me.cards.length, bribes: me.bribesUsed, peaces: me.peacesUsed,
    };
  }

  /** Renders the whole world without UI insets into a fresh canvas, for the share card. */
  private snapshotWorld(): HTMLCanvasElement | null {
    const g = this.game;
    if (!g) return null;
    const { cam } = this;
    const keep = { x: cam.x, y: cam.y, scale: cam.scale };
    cam.setInsets(0, 0, 0, 0);
    cam.home(true);
    this.gl.draw(cam, this.time, 0, this.human, -1);
    const c = document.createElement('canvas');
    c.width = this.gl.canvas.width;
    c.height = this.gl.canvas.height;
    const ctx = c.getContext('2d') as CanvasRenderingContext2D;
    ctx.drawImage(this.gl.canvas, 0, 0);
    this.applyInsets();
    cam.home(true);
    cam.x = keep.x;
    cam.y = keep.y;
    cam.scale = keep.scale;
    return c;
  }

  // ---- Hover preview ----------------------------------------------------------------------

  private computeHover(g: Game): HoverInfo | null {
    if (!this.pointer || this.time < this.hoverMuteUntil) return null;
    const { x, y } = this.pointer;
    const cell = this.cellAt(x, y);
    if (cell < 0) return null;
    const [gx, gy] = this.cam.toGrid(x, y);
    if (this.phase === 'spawn') {
      const ok = this.spawnAllowed(cell);
      return { mode: 'fort', gx, gy, valid: ok, label: ok ? 'Plant your capital here' : 'Too close to a rival, or not open land', radius: 5 };
    }
    if (this.phase !== 'play') return null;
    const me = g.players[this.human];
    if (!me.alive) return null;

    if (this.mode === 'fort' || this.mode === 'barracks' || this.mode === 'market') {
      const why = g.canBuild(me, this.mode, cell);
      const names = { fort: 'Fort', barracks: 'Barracks', market: 'Market' };
      return { mode: this.mode, gx, gy, valid: !why, label: why ?? `Place ${names[this.mode]}`, radius: this.mode === 'fort' ? 11 : 2.5 };
    }
    if (this.mode === 'bomb') {
      const can = g.tick >= me.bombReady && me.gold >= g.bombCost(me);
      return { mode: 'bomb', gx, gy, valid: can, danger: true, label: can ? 'Fire Big Boom' : 'Not ready', radius: B.BOMB_RADIUS * me.mods.bombRadius };
    }
    if (this.mode === 'para') {
      const o = g.owner[cell];
      const can = g.tick >= me.paraReady && me.gold >= g.paraCost(me) && o !== WATER && o !== this.human;
      return { mode: 'para', gx, gy, valid: can, label: can ? `Airdrop ${fmt(me.troops * this.pct)} troops` : 'Cannot drop here', radius: 4 };
    }

    if (this.overlay.leaderAt(this.cam, x, y) > 0 && this.overlay.leaderAt(this.cam, x, y) !== this.human) {
      const id = this.overlay.leaderAt(this.cam, x, y);
      return { mode: 'send', gx, gy, valid: true, label: g.players[id].nation.name, sublabel: 'Click to talk' };
    }

    const order = g.previewOrder(this.human, cell);
    if (order.kind === 'none') return null;
    const send = me.troops * this.pct;
    const tid = g.world.terrain[cell];
    const terrainName = TERRAIN_NAME[tid];
    // Say what the ground will do to the attack, so terrain is a decision and not scenery.
    const terrainCost = TERRAIN_COST[tid];
    const terrainNote = terrainCost > 1.1 ? `${terrainName}: slow, costs ${terrainCost.toFixed(1)}x the troops` : `${terrainName}: easy going`;
    const from = this.nearestBorder(g, cell);
    if (order.kind === 'expand') {
      const poi = g.poiAt[cell] >= 0 ? g.world.pois[g.poiAt[cell]] : null;
      return { mode: 'send', gx, gy, valid: true, from, label: `Send ${fmt(send)} troops`, sublabel: poi ? `Claim ${poi.name}` : terrainNote };
    }
    if (order.kind === 'boat') {
      const who = order.target > 0 ? g.players[order.target].nation.name : 'open land';
      return { mode: 'send', gx, gy, valid: true, label: `Boat: ${fmt(send)} troops`, sublabel: `Sail to ${who}` };
    }
    const foe = g.players[order.target];
    // A concrete forecast from the same costs the simulation uses, not a vague adjective.
    const density = foe.troops / Math.max(1, foe.land);
    const cellCost = ((B.ENEMY_BASE_COST + density * B.ENEMY_DENSITY_COST) * terrainCost * foe.mods.defense) / me.mods.attackPower;
    const cells = send / cellCost;
    const landPct = (cells / g.world.landCells) * 100;
    const read = cells >= foe.land ? 'You can overrun them' : (landPct < 1 ? 'Takes under 1% of the land' : `Takes about ${Math.round(landPct)}% of the land`);
    const groundNote = g.fort[cell] === order.target ? 'Fort nearby: attacking here costs 2.4x more' : terrainCost > 1.1 ? terrainNote : '';
    return { mode: 'send', gx, gy, valid: true, from, danger: true, label: `Attack ${foe.nation.name}: ${fmt(send)}`, sublabel: `${read}. They have ${fmt(foe.troops)}.${groundNote ? ` ${groundNote}` : ''}` };
  }

  private nearestBorder(g: Game, cell: number): [number, number] | undefined {
    // The arrow starts from your closest land, so it never strides across half the map.
    const { w } = g;
    const x0 = cell % w;
    const y0 = (cell / w) | 0;
    for (let r = 3; r <= 120; r += 3) {
      const steps = Math.min(32, 8 + r);
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2;
        const x = Math.round(x0 + Math.cos(a) * r);
        const y = Math.round(y0 + Math.sin(a) * r);
        if (x < 0 || x >= w || y < 0) continue;
        const k = y * w + x;
        if (k < g.owner.length && g.owner[k] === this.human) return [x + 0.5, y + 0.5];
      }
    }
    const o = g.owner[cell];
    const c = g.contactCell(this.human, o === WATER ? 0 : o);
    if (c < 0) return undefined;
    return [(c % w) + 0.5, ((c / w) | 0) + 0.5];
  }

  // ---- Frame ------------------------------------------------------------------------------

  private frame = (now: number): void => {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    const g = this.game;

    if (g) {
      if (g.phase === 'play' && !this.paused) {
        this.acc += dt * (this.phase === 'menu' ? 1 : SPEEDS[this.speedIdx]);
        let steps = 0;
        while (this.acc >= 1 / TPS && steps < 8) {
          g.step();
          this.acc -= 1 / TPS;
          steps++;
        }
        if (steps === 8) this.acc = 0;
      }
      const events = g.takeEvents();
      if (events.length) this.processEvents(events);
      const dirty = g.takeDirty();
      if (dirty.length) {
        this.gl.applyChanges(dirty, g.owner, true);
        if (this.phase === 'play') {
          const land = g.players[this.human].land;
          if (land > this.lastLand) this.sfx.capture();
          this.lastLand = land;
        }
      }
      if (this.phase === 'menu' && g.phase === 'over') this.startDemo();
    }

    const game = this.game;
    this.cam.update(dt);
    const hover = game && this.phase !== 'menu' && !this.touchUsed ? this.computeHover(game) : null;
    const hoverId = hover && game && this.pointer ? (() => {
      const c = this.cellAt(this.pointer.x, this.pointer.y);
      const o = c >= 0 ? game.owner[c] : 0;
      return o !== WATER && o !== this.human ? o : -1;
    })() : -1;
    this.gl.draw(this.cam, this.time, dt, this.human > 0 ? this.human : -1, hoverId);
    this.overlay.draw(game, this.cam, dt, this.time, this.human, hover, !this.titleUp);
    this.obstacleClock -= dt;
    if (this.obstacleClock <= 0) {
      this.obstacleClock = 0.3;
      this.overlay.obstacles = this.auth.visible ? this.auth.rects() : this.menu.visible ? this.menu.rects() : this.hud.panelRects();
      this.overlay.hush = !this.titleUp && this.hud.bannerUp;
    }

    this.hudClock -= dt;
    if (this.phase !== 'menu' && game) {
      // Every frame: an army coming home can move troop counts by thousands in one tick, and the
      // panel must never disagree with the map.
      this.hud.update(this.mode, this.pct, SPEEDS[this.speedIdx], this.paused, this.soundOn);
      if (this.hudClock <= 0) {
        this.hudClock = 0.12;
        if (this.phase === 'play') this.updateTutorial(game);
      }
    }
    if (this.menu.visible) this.menu.animate(this.time, dt);

    requestAnimationFrame(this.frame);
  };

  // ---- Automation hooks (capture script only) ---------------------------------------------

  /** Advances the real simulation quickly. Used to reach later game stages for screenshots. */
  fastForward(ticks: number, until?: (g: Game) => boolean): void {
    const g = this.game;
    if (!g) return;
    for (let i = 0; i < ticks && g.phase === 'play'; i++) {
      g.step();
      const ev = g.takeEvents();
      this.processEvents(ev, true);
      for (const e of ev) if (e.t === 'bombHit' && e.cells > 0) this.overlay.addCrater((e.cell % g.w) + 0.5, ((e.cell / g.w) | 0) + 0.5, e.radius * 1.05);
      this.overlay.ageCraters(1 / TPS);
      // Tips run on game time, so they keep their real order while the clock is skipped forward.
      if (i % 20 === 0 && this.phase === 'play') this.updateTutorial(g);
      if (until?.(g)) break;
    }
    this.gl.applyChanges(g.takeDirty(), g.owner, false);
    this.lastLand = g.players[this.human]?.land ?? 0;
  }

  autoSpawn(): number {
    return this.suggested;
  }
}
