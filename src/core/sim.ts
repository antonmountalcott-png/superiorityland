import { B, DIFFICULTY, type Difficulty, TERRAIN_COST, TERRAIN_SPEED, TPS, Terrain, WATER, isLandTerrain } from './balance';
import { CARDS, cardById } from './cards';
import { type Mods, type Nation, defaultMods } from './nations';
import { Rng } from './rng';
import type { World } from './worldgen';
import { aiThink } from './ai';

export type BuildingKind = 'fort' | 'barracks' | 'market';

export interface Building {
  id: number;
  kind: BuildingKind;
  cell: number;
  owner: number;
}

export interface Attack {
  id: number;
  owner: number;
  target: number;
  troops: number;
  frontier: number[];
  pending: number[];
  set: Set<number>;
  aim: number;
  started: number;
}

export interface Boat {
  id: number;
  owner: number;
  troops: number;
  path: number[];
  pos: number;
  aim: number;
}

export interface Strike {
  id: number;
  kind: 'bomb' | 'para';
  owner: number;
  from: number;
  to: number;
  t0: number;
  t1: number;
  troops: number;
  radius: number;
}

export interface AiBrain {
  aggression: number;
  minFill: number;
  econ: number;
  turtle: number;
  nextThink: number;
  grudge: number;
}

export interface PlayerStats {
  peakLand: number;
  cellsTaken: number;
  citiesTaken: number;
  kills: number;
  bombs: number;
  boats: number;
}

export interface Player {
  id: number;
  nation: Nation;
  isHuman: boolean;
  alive: boolean;
  troops: number;
  gold: number;
  land: number;
  capital: number;
  cities: number;
  mines: number;
  forts: number;
  barracks: number;
  markets: number;
  bombsUsed: number;
  parasUsed: number;
  bribesUsed: number;
  peacesUsed: number;
  capitalLostAt: number;
  bombReady: number;
  paraReady: number;
  mods: Mods;
  cards: string[];
  cardOffer: string[] | null;
  cardOfferTick: number;
  milestone: number;
  truces: Map<number, number>;
  truceAsk: Map<number, number>;
  ai: AiBrain | null;
  stats: PlayerStats;
  eliminatedAt: number;
  place: number;
}

export type Command =
  | { t: 'send'; p: number; cell: number; pct: number }
  | { t: 'build'; p: number; kind: BuildingKind; cell: number }
  | { t: 'bomb'; p: number; cell: number }
  | { t: 'para'; p: number; cell: number; pct: number }
  | { t: 'card'; p: number; id: string }
  | { t: 'truce'; p: number; other: number }
  | { t: 'truceReply'; p: number; other: number; accept: boolean }
  | { t: 'bribe'; p: number; other: number; target?: number }
  | { t: 'peace'; p: number; other: number };

export type GameEvent =
  | { t: 'attackStart'; p: number; target: number; cell: number; troops: number }
  | { t: 'attackEnd'; p: number; target: number }
  | { t: 'attacked'; p: number; by: number; cell: number }
  | { t: 'poi'; p: number; prev: number; poi: number; loot: number }
  | { t: 'capital'; p: number; prev: number; cell: number; newCapital: number }
  | { t: 'eliminated'; p: number; by: number; place: number }
  | { t: 'boatLaunch'; p: number; boat: number }
  | { t: 'boatLand'; p: number; cell: number }
  | { t: 'boatSunk'; p: number; cell: number }
  | { t: 'strike'; p: number; kind: 'bomb' | 'para'; to: number }
  | { t: 'bombHit'; p: number; cell: number; radius: number; cells: number; kills: number; victim: number }
  | { t: 'paraLand'; p: number; cell: number }
  | { t: 'built'; p: number; kind: BuildingKind; cell: number }
  | { t: 'razed'; p: number; by: number; kind: BuildingKind; cell: number }
  | { t: 'cardOffer'; p: number }
  | { t: 'cardPicked'; p: number; id: string }
  | { t: 'truceAsked'; p: number; other: number }
  | { t: 'truceYes'; p: number; other: number }
  | { t: 'truceNo'; p: number; other: number }
  | { t: 'truceEnd'; p: number; other: number }
  | { t: 'bribed'; p: number; other: number; target: number }
  | { t: 'reject'; p: number; reason: string }
  | { t: 'victory'; p: number };

export interface GameConfig {
  humanNation?: Nation;
  /** Extra modifiers for the human seat, applied after the nation perk (an equipped special skill). */
  humanBoost?: (m: Mods) => void;
  bots: Nation[];
  difficulty: Difficulty;
  seed: number;
  /** Lets the human seat be driven by bot logic (capture script and balance runs). */
  autoHuman?: boolean;
}

export type OrderKind = 'expand' | 'attack' | 'boat' | 'none';

export interface OrderPreview {
  kind: OrderKind;
  target: number;
  reason?: string;
  blocked?: 'truce' | 'own' | 'water' | 'unreachable' | 'dead';
}

const FOUR = (w: number) => [-1, 1, -w, w];

export class Game {
  readonly world: World;
  readonly rng: Rng;
  readonly w: number;
  readonly h: number;
  readonly owner: Uint8Array;
  readonly fort: Uint8Array;
  readonly buildingAt: Int32Array;
  readonly poiAt: Int16Array;
  readonly players: Player[] = [];
  readonly attacks: Attack[] = [];
  readonly boats: Boat[] = [];
  readonly strikes: Strike[] = [];
  readonly buildings = new Map<number, Building>();
  readonly adj: Int32Array;
  readonly adjSample: Int32Array;
  readonly presence: Int32Array;
  readonly attackIndex: (Attack | null)[];
  readonly history: { tick: number; share: number[] }[] = [];
  readonly nPlayers: number;
  readonly difficulty: Difficulty;
  readonly autoHuman: boolean;
  private readonly humanBoost?: (m: Mods) => void;

  phase: 'spawn' | 'play' | 'over' = 'spawn';
  tick = 0;
  winner = -1;
  events: GameEvent[] = [];
  dirty: number[] = [];
  neutralLeft: number;

  private queue: Command[] = [];
  private nextId = 1;
  private alivePlaces: number;
  private readonly four: number[];

  constructor(world: World, cfg: GameConfig) {
    this.world = world;
    this.w = world.w;
    this.h = world.h;
    this.rng = new Rng(cfg.seed ^ 0x51ed270b);
    this.difficulty = cfg.difficulty;
    this.autoHuman = !!cfg.autoHuman;
    this.humanBoost = cfg.humanBoost;
    this.four = FOUR(world.w);
    const size = world.w * world.h;
    this.owner = new Uint8Array(size);
    this.fort = new Uint8Array(size);
    this.buildingAt = new Int32Array(size).fill(-1);
    this.poiAt = new Int16Array(size).fill(-1);
    for (let i = 0; i < size; i++) if (!isLandTerrain(world.terrain[i])) this.owner[i] = WATER;
    for (const poi of world.pois) this.poiAt[poi.cell] = poi.id;
    this.neutralLeft = world.landCells;

    // Seat 0 is the neutral placeholder so player ids can index owner values directly.
    const nations: { n: Nation; human: boolean }[] = [];
    if (cfg.humanNation) nations.push({ n: cfg.humanNation, human: true });
    for (const n of cfg.bots) nations.push({ n, human: false });
    this.nPlayers = nations.length + 1;
    this.alivePlaces = nations.length;
    this.players.push(this.makePlayer(0, nations[0].n, false));
    nations.forEach((entry, i) => this.players.push(this.makePlayer(i + 1, entry.n, entry.human)));
    this.players[0].alive = false;

    const n = this.nPlayers;
    this.adj = new Int32Array(n * n);
    this.adjSample = new Int32Array(n * n).fill(-1);
    this.presence = new Int32Array(n * Math.max(1, world.landmassSizes.length));
    this.attackIndex = new Array(n * n).fill(null);
  }

  private makePlayer(id: number, nation: Nation, isHuman: boolean): Player {
    const mods = defaultMods();
    nation.perk.apply(mods);
    if (isHuman) this.humanBoost?.(mods);
    const ai: AiBrain | null = isHuman && !this.autoHuman ? null : {
      aggression: this.rng.range(0.35, 1),
      minFill: this.rng.range(0.34, 0.6),
      econ: this.rng.range(0.2, 1),
      turtle: this.rng.range(0.1, 1),
      nextThink: this.rng.int(20) + 5,
      grudge: 0,
    };
    const d = DIFFICULTY[this.difficulty];
    if (isHuman) mods.defense *= d.home;
    else mods.growth *= d.income;
    return {
      id, nation, isHuman, alive: true, troops: B.START_TROOPS * mods.startTroops, gold: 40 + mods.startGold, land: 0,
      capital: -1, cities: 0, mines: 0, forts: 0, barracks: 0, markets: 0, bombsUsed: 0, parasUsed: 0, bribesUsed: 0, peacesUsed: 0, capitalLostAt: -1000,
      bombReady: 0, paraReady: 0, mods, cards: [], cardOffer: null, cardOfferTick: 0, milestone: 0,
      truces: new Map(), truceAsk: new Map(), ai,
      stats: { peakLand: 0, cellsTaken: 0, citiesTaken: 0, kills: 0, bombs: 0, boats: 0 },
      eliminatedAt: -1, place: 0,
    };
  }

  // ---- Setup ------------------------------------------------------------------------------

  /** Plant a nation's capital with a small starting blob. */
  spawn(p: number, cell: number): boolean {
    const pl = this.players[p];
    if (!pl || pl.capital >= 0) return false;
    if (!isLandTerrain(this.world.terrain[cell])) return false;
    const { w } = this;
    const cx = cell % w;
    const cy = (cell / w) | 0;
    const R = 5;
    for (let y = -R; y <= R; y++) {
      for (let x = -R; x <= R; x++) {
        if (x * x + y * y > R * R + 2) continue;
        const c = cx + x + (cy + y) * w;
        if (c < 0 || c >= this.owner.length) continue;
        if (this.owner[c] === 0) this.setOwner(c, p, p);
      }
    }
    if (this.owner[cell] !== p) this.setOwner(cell, p, p);
    pl.capital = cell;
    return true;
  }

  start(): void {
    this.phase = 'play';
    this.recomputeAdjacency();
    this.recordHistory();
  }

  queueCommand(c: Command): void {
    this.queue.push(c);
  }

  // ---- Derived values ---------------------------------------------------------------------

  capOf(p: Player): number {
    return (B.BASE_CAP + p.land * B.CAP_PER_CELL + p.cities * B.CAP_PER_CITY + p.barracks * B.BARRACKS_CAP) * p.mods.cap;
  }

  growthOf(p: Player): number {
    const cap = this.capOf(p);
    if (p.troops > cap) return -(p.troops - cap) * B.OVERCAP_DECAY * TPS;
    const logistic = B.GROWTH_RATE * p.troops * (1 - p.troops / cap);
    return (logistic + p.land * B.LAND_INCOME + B.BASE_INCOME + p.barracks * B.BARRACKS_INCOME) * p.mods.growth;
  }

  goldRateOf(p: Player): number {
    const rate = B.BASE_GOLD + (p.land / 1000) * B.GOLD_PER_1K_CELLS + p.cities * B.GOLD_PER_CITY * p.mods.cityGold +
      p.mines * B.GOLD_PER_MINE + p.markets * B.GOLD_PER_MARKET;
    const peace = p.mods.peaceGold > 0 && p.truces.size > 0 ? 1 + p.mods.peaceGold : 1;
    return rate * p.mods.gold * peace;
  }

  buildCost(p: Player, kind: BuildingKind): number {
    const base = kind === 'fort' ? B.COST_FORT : kind === 'barracks' ? B.COST_BARRACKS : B.COST_MARKET;
    const count = kind === 'fort' ? p.forts : kind === 'barracks' ? p.barracks : p.markets;
    return Math.round(base * Math.pow(B.COST_GROWTH, count) * p.mods.buildCost);
  }

  bombCost(p: Player): number {
    return Math.round(B.COST_BOMB * Math.pow(B.STRIKE_COST_GROWTH, p.bombsUsed) * p.mods.bombCost);
  }

  paraCost(p: Player): number {
    return Math.round(B.COST_PARA * Math.pow(B.STRIKE_COST_GROWTH, p.parasUsed) * p.mods.paraCost);
  }

  landShare(p: Player): number {
    return p.land / this.world.landCells;
  }

  inTruce(a: number, b: number): boolean {
    return (this.players[a]?.truces.get(b) ?? -1) > this.tick;
  }

  hasContact(a: number, b: number): boolean {
    return this.adj[a * this.nPlayers + b] > 0;
  }

  contactCell(a: number, b: number): number {
    return this.adjSample[a * this.nPlayers + b];
  }

  attackOf(owner: number, target: number): Attack | null {
    return this.attackIndex[owner * this.nPlayers + target];
  }

  /** Decide what a tap on `cell` would do, shared by the UI preview and the real command. */
  previewOrder(p: number, cell: number): OrderPreview {
    const pl = this.players[p];
    if (!pl || !pl.alive) return { kind: 'none', target: -1, blocked: 'dead' };
    const o = this.owner[cell];
    if (o === WATER) return { kind: 'none', target: -1, blocked: 'water' };
    if (o === p) return { kind: 'none', target: p, blocked: 'own' };
    if (o !== 0 && this.inTruce(p, o)) return { kind: 'none', target: o, blocked: 'truce' };

    const lm = this.world.landmass[cell];
    const present = lm >= 0 && this.presence[p * this.world.landmassSizes.length + lm] > 0;
    if (!present) return { kind: 'boat', target: o };

    if (o !== 0 && this.touchesPlayer(p, o)) return { kind: 'attack', target: o };
    if (o === 0 && this.touchesPlayer(p, 0)) return { kind: 'expand', target: 0 };
    // Same landmass but no direct border: march across neutral ground toward it.
    if (this.touchesPlayer(p, 0)) return { kind: 'expand', target: 0 };
    return { kind: 'boat', target: o };
  }

  private touchesPlayer(a: number, b: number): boolean {
    return this.adj[a * this.nPlayers + b] > 0 || this.attackIndex[a * this.nPlayers + b] !== null;
  }

  // ---- Tick -------------------------------------------------------------------------------

  step(): void {
    if (this.phase !== 'play') return;
    this.tick++;

    const q = this.queue;
    this.queue = [];
    for (const c of q) this.apply(c);
    this.regrowScars();

    for (let i = 1; i < this.nPlayers; i++) {
      const p = this.players[i];
      if (!p.alive) continue;
      p.troops = Math.max(0, p.troops + this.growthOf(p) / TPS);
      p.gold += this.goldRateOf(p) / TPS;
      for (const [other, until] of p.truces) {
        if (until <= this.tick) {
          p.truces.delete(other);
          if (other > i) this.events.push({ t: 'truceEnd', p: i, other });
        }
      }
    }

    for (let i = this.attacks.length - 1; i > 0; i--) {
      const j = this.rng.int(i + 1);
      const tmp = this.attacks[i];
      this.attacks[i] = this.attacks[j];
      this.attacks[j] = tmp;
    }
    for (const a of this.attacks.slice()) this.stepAttack(a);

    this.stepBoats();
    this.stepStrikes();

    if (this.tick % 5 === 0) this.recomputeAdjacency();
    if (this.tick % 3 === 0) this.checkPlayers();

    for (let i = 1; i < this.nPlayers; i++) {
      const p = this.players[i];
      if (!p.alive) continue;
      if (p.ai && this.tick >= p.ai.nextThink) {
        const d = DIFFICULTY[this.difficulty];
        const rate = p.isHuman ? 1 : d.think;
        p.ai.nextThink = this.tick + Math.round(this.rng.range(14, 30) * rate);
        aiThink(this, p);
      }
      if (p.cardOffer && this.tick - p.cardOfferTick > B.CARD_AUTOPICK_TICKS) {
        this.pickCard(p, this.rng.pick(p.cardOffer));
      }
    }

    if (this.tick % B.HISTORY_EVERY === 0) this.recordHistory();
  }

  private recordHistory(): void {
    this.history.push({ tick: this.tick, share: this.players.map((p) => p.land / this.world.landCells) });
  }

  private apply(c: Command): void {
    const p = this.players[c.p];
    if (!p || !p.alive) return;
    switch (c.t) {
      case 'send': this.cmdSend(p, c.cell, c.pct); break;
      case 'build': this.cmdBuild(p, c.kind, c.cell); break;
      case 'bomb': this.cmdBomb(p, c.cell); break;
      case 'para': this.cmdPara(p, c.cell, c.pct); break;
      case 'card': if (p.cardOffer?.includes(c.id)) this.pickCard(p, c.id); break;
      case 'truce': this.cmdTruce(p, c.other); break;
      case 'truceReply': this.truceReply(p, c.other, c.accept); break;
      case 'bribe': this.cmdBribe(p, c.other, c.target); break;
      case 'peace': this.cmdPeace(p, c.other); break;
    }
  }

  private reject(p: Player, reason: string): void {
    this.events.push({ t: 'reject', p: p.id, reason });
  }

  // ---- Commands ---------------------------------------------------------------------------

  private cmdSend(p: Player, cell: number, pct: number): void {
    const order = this.previewOrder(p.id, cell);
    if (order.kind === 'none') {
      if (order.blocked === 'truce') this.reject(p, 'You have a truce with them');
      return;
    }
    const troops = p.troops * Math.min(1, Math.max(0, pct));
    if (troops < B.MIN_SEND) {
      this.reject(p, 'Not enough troops');
      return;
    }
    if (order.kind === 'boat') {
      this.launchBoat(p, cell, troops);
      return;
    }
    p.troops -= troops;
    this.launchAttack(p, order.target, troops, cell);
  }

  launchAttack(p: Player, target: number, troops: number, aim: number): void {
    const key = p.id * this.nPlayers + target;
    const existing = this.attackIndex[key];
    if (existing) {
      existing.troops += troops;
      existing.aim = aim;
      return;
    }
    const a: Attack = {
      id: this.nextId++, owner: p.id, target, troops, frontier: [], pending: [],
      set: new Set(), aim, started: this.tick,
    };
    const { owner, four } = this;
    const size = owner.length;
    for (let c = 0; c < size; c++) {
      if (owner[c] !== target) continue;
      if (owner[c + four[0]] === p.id || owner[c + four[1]] === p.id || owner[c + four[2]] === p.id || owner[c + four[3]] === p.id) {
        a.frontier.push(c);
        a.set.add(c);
      }
    }
    if (a.frontier.length === 0) {
      p.troops += troops;
      return;
    }
    this.attacks.push(a);
    this.attackIndex[key] = a;
    this.events.push({ t: 'attackStart', p: p.id, target, cell: aim, troops });
    if (target !== 0) this.events.push({ t: 'attacked', p: target, by: p.id, cell: aim });
  }

  private endAttack(a: Attack, refund: boolean): void {
    const idx = this.attacks.indexOf(a);
    if (idx >= 0) this.attacks.splice(idx, 1);
    this.attackIndex[a.owner * this.nPlayers + a.target] = null;
    if (refund && a.troops > 0) this.players[a.owner].troops += a.troops;
    a.troops = 0;
    this.events.push({ t: 'attackEnd', p: a.owner, target: a.target });
  }

  private launchBoat(p: Player, cell: number, troops: number): void {
    const path = this.findSeaRoute(p.id, cell);
    if (!path) {
      this.reject(p, 'No route over water');
      return;
    }
    p.troops -= troops;
    const boat: Boat = { id: this.nextId++, owner: p.id, troops: troops * (1 - B.BOAT_LOSS * p.mods.boatLoss), path, pos: 0, aim: cell };
    this.boats.push(boat);
    p.stats.boats++;
    this.events.push({ t: 'boatLaunch', p: p.id, boat: boat.id });
  }

  /** BFS over water from the target shore back to any water cell touching the player's land. */
  findSeaRoute(p: number, target: number): number[] | null {
    const { w, owner } = this;
    const size = owner.length;
    const prev = new Int32Array(size).fill(-1);
    const queue: number[] = [];
    const landing = new Int32Array(size).fill(-1);
    // Seed from water around the land near the target: walk outward from target to the nearest shore.
    const seen = new Uint8Array(size);
    const search: number[] = [target];
    seen[target] = 1;
    let head = 0;
    let found = 0;
    while (head < search.length && found < 240 && head < 6000) {
      const c = search[head++];
      for (const d of this.four) {
        const n = c + d;
        if (n < 0 || n >= size || seen[n]) continue;
        seen[n] = 1;
        if (owner[n] === WATER) {
          prev[n] = n;
          landing[n] = c;
          queue.push(n);
          found++;
        } else {
          search.push(n);
        }
      }
    }
    if (queue.length === 0) return null;
    let qh = 0;
    while (qh < queue.length) {
      const c = queue[qh++];
      for (const d of this.four) {
        const n = c + d;
        if (n < 0 || n >= size) continue;
        if (owner[n] === p) {
          const path: number[] = [];
          let cur = c;
          while (prev[cur] !== cur) {
            path.push(cur);
            cur = prev[cur];
          }
          path.push(cur);
          path.push(landing[cur]);
          return path;
        }
        if (owner[n] === WATER && prev[n] < 0) {
          prev[n] = c;
          landing[n] = landing[c];
          queue.push(n);
        }
      }
    }
    void w;
    return null;
  }

  private cmdBuild(p: Player, kind: BuildingKind, cell: number): void {
    const why = this.canBuild(p, kind, cell);
    if (why) {
      this.reject(p, why);
      return;
    }
    p.gold -= this.buildCost(p, kind);
    const b: Building = { id: this.nextId++, kind, cell, owner: p.id };
    this.buildings.set(b.id, b);
    this.buildingAt[cell] = b.id;
    if (kind === 'fort') {
      p.forts++;
      this.stampFort(b.cell, p.id);
    } else if (kind === 'barracks') p.barracks++;
    else p.markets++;
    this.events.push({ t: 'built', p: p.id, kind, cell });
  }

  /** Returns a reason it is not allowed, or null when it is. */
  canBuild(p: Player, kind: BuildingKind, cell: number): string | null {
    if (this.owner[cell] !== p.id) return 'Build on your own land';
    if (this.world.terrain[cell] === Terrain.Mountain || this.world.terrain[cell] === Terrain.River) return 'Too rugged to build here';
    if (p.gold < this.buildCost(p, kind)) return 'Not enough gold';
    if (this.buildingAt[cell] >= 0 || this.poiAt[cell] >= 0) return 'Too close to another building';
    const { w } = this;
    const cx = cell % w;
    const cy = (cell / w) | 0;
    for (const b of this.buildings.values()) {
      const dx = (b.cell % w) - cx;
      const dy = ((b.cell / w) | 0) - cy;
      if (dx * dx + dy * dy < B.BUILD_SPACING * B.BUILD_SPACING) return 'Too close to another building';
    }
    return null;
  }

  private stampFort(cell: number, owner: number): void {
    const { w } = this;
    const cx = cell % w;
    const cy = (cell / w) | 0;
    const R = B.FORT_RADIUS;
    for (let y = -R; y <= R; y++) {
      for (let x = -R; x <= R; x++) {
        if (x * x + y * y > R * R) continue;
        const nx = cx + x;
        const ny = cy + y;
        if (nx < 0 || ny < 0 || nx >= w || ny >= this.h) continue;
        this.fort[nx + ny * w] = owner;
      }
    }
  }

  private cmdBomb(p: Player, cell: number): void {
    if (this.tick < p.bombReady) return this.reject(p, 'Big Boom is still reloading');
    const cost = this.bombCost(p);
    if (p.gold < cost) return this.reject(p, 'Not enough gold');
    p.gold -= cost;
    p.bombsUsed++;
    p.stats.bombs++;
    p.bombReady = this.tick + B.BOMB_COOLDOWN;
    this.strikes.push({
      id: this.nextId++, kind: 'bomb', owner: p.id, from: p.capital, to: cell, t0: this.tick,
      t1: this.tick + B.BOMB_FLIGHT_TICKS, troops: 0, radius: B.BOMB_RADIUS * p.mods.bombRadius,
    });
    this.events.push({ t: 'strike', p: p.id, kind: 'bomb', to: cell });
  }

  private cmdPara(p: Player, cell: number, pct: number): void {
    if (this.tick < p.paraReady) return this.reject(p, 'Airdrop is still reloading');
    const o = this.owner[cell];
    if (o === WATER) return this.reject(p, 'Pick a spot on land');
    if (o === p.id) return this.reject(p, 'Pick land you do not own');
    if (o !== 0 && this.inTruce(p.id, o)) return this.reject(p, 'You have a truce with them');
    const cost = this.paraCost(p);
    if (p.gold < cost) return this.reject(p, 'Not enough gold');
    const troops = p.troops * Math.min(1, Math.max(0, pct));
    if (troops < B.MIN_SEND) return this.reject(p, 'Not enough troops');
    p.gold -= cost;
    p.troops -= troops;
    p.parasUsed++;
    p.paraReady = this.tick + B.PARA_COOLDOWN;
    this.strikes.push({
      id: this.nextId++, kind: 'para', owner: p.id, from: p.capital, to: cell, t0: this.tick,
      t1: this.tick + B.PARA_FLIGHT_TICKS, troops: troops * (1 - B.PARA_LOSS * p.mods.paraLoss), radius: 0,
    });
    this.events.push({ t: 'strike', p: p.id, kind: 'para', to: cell });
  }

  private cmdTruce(p: Player, other: number): void {
    const o = this.players[other];
    if (!o || !o.alive || other === p.id) return;
    if (this.inTruce(p.id, other)) return;
    if ((p.truceAsk.get(other) ?? -1) > this.tick) return this.reject(p, 'They are tired of hearing from you');
    p.truceAsk.set(other, this.tick + B.TRUCE_ASK_COOLDOWN);
    this.events.push({ t: 'truceAsked', p: p.id, other });
    if (o.isHuman && !o.ai) return;

    // Bots accept when the war is not worth it: they are weaker, or already busy elsewhere.
    const ratio = o.troops / Math.max(1, p.troops);
    const landRatio = o.land / Math.max(1, p.land);
    let busy = 0;
    for (const a of this.attacks) if (a.target === o.id && a.owner !== p.id) busy++;
    const smart = DIFFICULTY[this.difficulty].smart;
    const chance = 0.55 - (ratio - 1) * 0.45 * smart - (landRatio - 1) * 0.15 * smart + busy * 0.2;
    this.truceReply(o, p.id, this.rng.next() < chance);
  }

  private truceReply(p: Player, other: number, accept: boolean): void {
    if (!accept) {
      this.events.push({ t: 'truceNo', p: p.id, other });
      return;
    }
    const until = this.tick + B.TRUCE_TICKS;
    p.truces.set(other, until);
    this.players[other].truces.set(p.id, until);
    for (const [a, b] of [[p.id, other], [other, p.id]]) {
      const atk = this.attackOf(a, b);
      if (atk) this.endAttack(atk, true);
    }
    this.events.push({ t: 'truceYes', p: p.id, other });
  }

  bribeCost(p: Player): number {
    return Math.round(B.COST_BRIBE * Math.pow(B.BRIBE_COST_GROWTH, p.bribesUsed));
  }

  /** Who a bribed nation could turn on, biggest first, never the one paying. */
  bribeTargets(payer: number, other: number): Player[] {
    const out: Player[] = [];
    for (let i = 1; i < this.nPlayers; i++) {
      if (i === payer || i === other) continue;
      const q = this.players[i];
      if (q.alive && this.hasContact(other, i) && !this.inTruce(other, i)) out.push(q);
    }
    return out.sort((a, b) => b.land - a.land);
  }

  bribeTarget(payer: number, other: number): Player | null {
    return this.bribeTargets(payer, other)[0] ?? null;
  }

  peaceCost(p: Player): number {
    return Math.round(B.COST_PEACE * Math.pow(B.PEACE_COST_GROWTH, p.peacesUsed));
  }

  /** Peace for gold: a guaranteed truce, unlike asking nicely. */
  private cmdPeace(p: Player, other: number): void {
    const o = this.players[other];
    if (!o || !o.alive || !o.ai || other === p.id || this.inTruce(p.id, other)) return;
    const cost = this.peaceCost(p);
    if (p.gold < cost) return this.reject(p, 'Not enough gold');
    p.gold -= cost;
    p.peacesUsed++;
    this.truceReply(o, p.id, true);
  }

  private cmdBribe(p: Player, other: number, wanted?: number): void {
    const o = this.players[other];
    if (!o || !o.alive || !o.ai || other === p.id) return;
    const options = this.bribeTargets(p.id, other);
    const target = options.find((q) => q.id === wanted) ?? options[0];
    if (!target) return this.reject(p, 'They have nobody else to attack');
    const cost = this.bribeCost(p);
    if (p.gold < cost) return this.reject(p, 'Not enough gold');
    p.gold -= cost;
    p.bribesUsed++;
    const troops = o.troops * B.BRIBE_TROOPS;
    o.troops -= troops;
    o.ai.grudge = target.id;
    this.launchAttack(o, target.id, troops, this.contactCell(other, target.id));
    this.events.push({ t: 'bribed', p: p.id, other, target: target.id });
  }

  private pickCard(p: Player, id: string): void {
    const card = cardById(id);
    card.apply(p.mods);
    p.cards.push(id);
    p.cardOffer = null;
    this.events.push({ t: 'cardPicked', p: p.id, id });
  }

  // ---- Attacks ----------------------------------------------------------------------------

  private cellCost(a: Attack, c: number): number {
    const me = this.players[a.owner];
    const t = this.world.terrain[c];
    const terrain = 1 + (TERRAIN_COST[t] - 1) * (1 - Math.min(1, me.mods.terrainEase));
    if (a.target === 0) return (B.NEUTRAL_COST * terrain) / Math.sqrt(me.mods.attackPower);
    const def = this.players[a.target];
    const density = def.troops / Math.max(1, def.land);
    let mult = def.mods.defense;
    if (this.fort[c] === a.target) mult *= B.FORT_MULT * def.mods.fortPower;
    if (def.mods.lastStand > 0 && def.troops < this.capOf(def) * 0.3) mult *= 2;
    return ((B.ENEMY_BASE_COST + density * B.ENEMY_DENSITY_COST) * terrain * mult) / me.mods.attackPower;
  }

  private touches(c: number, p: number): boolean {
    const o = this.owner;
    const f = this.four;
    return o[c + f[0]] === p || o[c + f[1]] === p || o[c + f[2]] === p || o[c + f[3]] === p;
  }

  private stepAttack(a: Attack): void {
    const me = this.players[a.owner];
    if (!me.alive) {
      this.endAttack(a, false);
      return;
    }
    if (a.target !== 0 && !this.players[a.target].alive) {
      // Target fell: anything it held is neutral now. Roll onward rather than wasting troops.
      this.endAttack(a, true);
      return;
    }

    // Opposing armies grind each other down before either can advance.
    if (a.target !== 0) {
      const rev = this.attackOf(a.target, a.owner);
      if (rev && rev.troops > 0 && a.troops > 0) {
        const bite = Math.min(a.troops, rev.troops, Math.max(4, Math.min(a.troops, rev.troops) * B.CLASH_PER_TICK));
        a.troops -= bite;
        rev.troops -= bite;
      }
    }

    const { w, world, owner, rng } = this;
    const fr = a.frontier;
    const baseChance = B.ADVANCE_CHANCE * me.mods.attackSpeed;
    const ease = Math.min(1, me.mods.terrainEase);
    const ax = a.aim >= 0 ? a.aim % w : 0;
    const ay = a.aim >= 0 ? (a.aim / w) | 0 : 0;

    let minD = Infinity;
    if (a.aim >= 0) {
      for (let i = 0; i < fr.length; i++) {
        const c = fr[i];
        const dx = (c % w) - ax;
        const dy = ((c / w) | 0) - ay;
        const d = dx * dx + dy * dy;
        if (d < minD) minD = d;
      }
      minD = Math.sqrt(minD);
    }

    let keep = 0;
    let captured = 0;
    let broke = false;
    for (let i = 0; i < fr.length; i++) {
      const c = fr[i];
      if (owner[c] !== a.target || !this.touches(c, a.owner)) {
        a.set.delete(c);
        continue;
      }
      if (broke || captured >= B.MAX_CELLS_PER_TICK) {
        fr[keep++] = c;
        continue;
      }
      const tSpeed = TERRAIN_SPEED[world.terrain[c]];
      let chance = baseChance * (tSpeed + (1 - tSpeed) * ease);
      // Pockets the wave has flowed around get mopped up, so fronts stay clean rather than speckled.
      const nearby = (owner[c - 1] === a.owner ? 1 : 0) + (owner[c + 1] === a.owner ? 1 : 0) + (owner[c - w] === a.owner ? 1 : 0) + (owner[c + w] === a.owner ? 1 : 0);
      if (nearby >= 3) chance = Math.max(chance * 3, 0.6);
      if (a.aim >= 0) {
        const dx = (c % w) - ax;
        const dy = ((c / w) | 0) - ay;
        const rel = Math.sqrt(dx * dx + dy * dy) - minD;
        const focus = 1.5 - rel / B.AIM_FOCUS_CELLS;
        chance *= focus < 0.12 ? 0.12 : focus;
      }
      if (rng.next() >= chance) {
        fr[keep++] = c;
        continue;
      }
      const cost = this.cellCost(a, c);
      if (a.troops < cost) {
        broke = true;
        fr[keep++] = c;
        continue;
      }
      a.troops -= cost;
      if (a.target !== 0) {
        const def = this.players[a.target];
        def.troops = Math.max(0, def.troops - cost * B.DEFENDER_LOSS * me.mods.attackPower / def.mods.defense);
        me.gold += me.mods.loot;
      }
      a.set.delete(c);
      this.takeCell(c, a);
      captured++;
    }
    fr.length = keep;
    if (a.pending.length) {
      for (const n of a.pending) fr.push(n);
      a.pending.length = 0;
    }

    if (fr.length === 0) {
      this.endAttack(a, true);
    } else if (broke || a.troops < 1) {
      this.endAttack(a, true);
    }
  }

  private takeCell(c: number, a: Attack): void {
    const prev = this.owner[c];
    this.setOwner(c, a.owner, a.owner);
    this.players[a.owner].stats.cellsTaken++;
    const { owner, four, nPlayers } = this;
    for (let k = 0; k < 4; k++) {
      const n = c + four[k];
      const o = owner[n];
      if (o === WATER || o === a.owner) continue;
      const atk = this.attackIndex[a.owner * nPlayers + o];
      if (atk && !atk.set.has(n)) {
        atk.set.add(n);
        atk.pending.push(n);
      }
    }
    // The defender's own counter-attack can now reach the newly lost cell.
    if (prev !== 0) {
      const counter = this.attackIndex[prev * nPlayers + a.owner];
      if (counter && !counter.set.has(c)) {
        counter.set.add(c);
        counter.pending.push(c);
      }
    }
  }

  private scars: { at: number; cells: { c: number; o: number }[] }[] = [];
  private regrowing = false;

  setOwner(c: number, next: number, by: number): void {
    const prev = this.owner[c];
    if (prev === next || prev === WATER) return;
    this.owner[c] = next;
    this.dirty.push(c);
    const lm = this.world.landmass[c];
    const nLm = this.world.landmassSizes.length;
    if (prev !== 0) {
      this.players[prev].land--;
      this.presence[prev * nLm + lm]--;
    } else {
      this.neutralLeft--;
    }
    if (next !== 0) {
      const p = this.players[next];
      p.land++;
      this.presence[next * nLm + lm]++;
      if (p.land > p.stats.peakLand) p.stats.peakLand = p.land;
    } else {
      this.neutralLeft++;
    }

    const bid = this.buildingAt[c];
    if (bid >= 0) this.razeBuilding(bid, by);

    const poiId = this.poiAt[c];
    if (poiId >= 0) this.transferPoi(poiId, prev, next);

    if (prev !== 0 && this.players[prev].capital === c) this.loseCapital(prev, next, c);
  }

  /** Land a Boom flattened heals back to its owner, from the edges in, unless someone claimed it first. */
  private regrowScars(): void {
    const { w } = this;
    const { owner } = this;
    while (this.scars.length && this.scars[0].at <= this.tick) {
      const scar = this.scars.shift() as { at: number; cells: { c: number; o: number }[] };
      this.regrowing = true;
      let pending = scar.cells.filter((k) => owner[k.c] === 0 && this.players[k.o].alive);
      for (let pass = 0; pass < 24 && pending.length; pass++) {
        const rest: { c: number; o: number }[] = [];
        for (const k of pending) {
          const touching = owner[k.c - 1] === k.o || owner[k.c + 1] === k.o || owner[k.c - w] === k.o || owner[k.c + w] === k.o;
          if (touching) this.setOwner(k.c, k.o, k.o);
          else rest.push(k);
        }
        if (rest.length === pending.length) break;
        pending = rest;
      }
      this.regrowing = false;
    }
  }

  private razeBuilding(id: number, by: number): void {
    const b = this.buildings.get(id);
    if (!b) return;
    this.buildings.delete(id);
    this.buildingAt[b.cell] = -1;
    const p = this.players[b.owner];
    if (b.kind === 'fort') {
      p.forts--;
      this.fort.fill(0);
      for (const other of this.buildings.values()) if (other.kind === 'fort') this.stampFort(other.cell, other.owner);
    } else if (b.kind === 'barracks') p.barracks--;
    else p.markets--;
    this.events.push({ t: 'razed', p: b.owner, by, kind: b.kind, cell: b.cell });
  }

  private transferPoi(id: number, prev: number, next: number): void {
    const poi = this.world.pois[id];
    const isCity = poi.kind === 'city';
    if (prev !== 0) {
      if (isCity) this.players[prev].cities--;
      else this.players[prev].mines--;
    }
    if (next !== 0) {
      const p = this.players[next];
      if (isCity) p.cities++;
      else p.mines++;
      // Getting your own bombed city back is not a conquest, so it pays nothing and isn't news.
      if (this.regrowing) return;
      const loot = isCity ? B.CITY_LOOT : B.MINE_LOOT;
      p.gold += loot;
      if (isCity) p.stats.citiesTaken++;
      this.events.push({ t: 'poi', p: next, prev, poi: id, loot });
    }
  }

  private loseCapital(prev: number, by: number, cell: number): void {
    const p = this.players[prev];
    // One disaster, one penalty. A capital relocated into land that is still falling (a blast, a fast
    // wave) must not be "lost" again and again, or a single hit can erase a whole army.
    const fresh = this.tick - p.capitalLostAt > B.CAPITAL_PENALTY_GAP;
    if (fresh) {
      p.capitalLostAt = this.tick;
      p.troops *= 1 - B.CAPITAL_TROOP_LOSS;
      if (by !== 0) {
        const taker = this.players[by];
        const loot = p.gold * B.CAPITAL_GOLD_LOOT;
        taker.gold += loot;
        p.gold -= loot;
      }
    }
    // Relocate to the first remaining city, otherwise any owned cell.
    let next = -1;
    for (const poi of this.world.pois) {
      if (poi.kind === 'city' && this.owner[poi.cell] === prev) {
        next = poi.cell;
        break;
      }
    }
    if (next < 0) {
      const { owner } = this;
      const start = this.rng.int(owner.length);
      for (let i = 0; i < owner.length; i++) {
        const c = (start + i) % owner.length;
        if (owner[c] === prev) {
          next = c;
          break;
        }
      }
    }
    p.capital = next;
    if (fresh) this.events.push({ t: 'capital', p: by, prev, cell, newCapital: next });
  }

  // ---- Boats and strikes ------------------------------------------------------------------

  private stepBoats(): void {
    for (let i = this.boats.length - 1; i >= 0; i--) {
      const b = this.boats[i];
      const pl = this.players[b.owner];
      if (!pl.alive) {
        this.boats.splice(i, 1);
        continue;
      }
      b.pos += B.BOAT_CELLS_PER_TICK * pl.mods.boatSpeed;
      if (b.pos >= b.path.length - 1) {
        const land = b.path[b.path.length - 1];
        this.boats.splice(i, 1);
        this.beachhead(pl, land, b.troops, b.aim);
        this.events.push({ t: 'boatLand', p: b.owner, cell: land });
      }
    }
  }

  private stepStrikes(): void {
    for (let i = this.strikes.length - 1; i >= 0; i--) {
      const s = this.strikes[i];
      if (this.tick < s.t1) continue;
      this.strikes.splice(i, 1);
      const pl = this.players[s.owner];
      if (s.kind === 'bomb') this.detonate(pl, s);
      else if (pl.alive) {
        this.beachhead(pl, s.to, s.troops, s.to);
        this.events.push({ t: 'paraLand', p: s.owner, cell: s.to });
      }
    }
  }

  private beachhead(p: Player, cell: number, troops: number, aim: number): void {
    const o = this.owner[cell];
    if (o === p.id) {
      p.troops += troops;
      return;
    }
    if (o === WATER || (o !== 0 && this.inTruce(p.id, o))) {
      p.troops += troops;
      return;
    }
    this.setOwner(cell, p.id, p.id);
    this.launchAttack(p, o, troops, aim);
    // Same-landmass neutral ground around the beachhead is fair game for the same wave.
    this.recomputeAdjacency();
  }

  private detonate(p: Player, s: Strike): void {
    const { w, owner } = this;
    const cx = s.to % w;
    const cy = (s.to / w) | 0;
    const R = s.radius;
    const IR = Math.ceil(R);
    let cells = 0;
    let kills = 0;
    const touched = new Map<number, number>();
    const landBefore = new Map<number, number>();
    const scarred: { c: number; o: number }[] = [];
    for (let y = -IR; y <= IR; y++) {
      for (let x = -IR; x <= IR; x++) {
        const d2 = x * x + y * y;
        if (d2 > R * R) continue;
        const c = cx + x + (cy + y) * w;
        if (c < 0 || c >= owner.length) continue;
        const o = owner[c];
        if (o === WATER || o === 0 || o === p.id) continue;
        if (this.inTruce(p.id, o)) continue;
        if (!landBefore.has(o)) landBefore.set(o, this.players[o].land);
        touched.set(o, (touched.get(o) ?? 0) + 1);
        // The blast centre is flattened to neutral; the rim only loses troops.
        if (d2 <= R * R * 0.55) {
          scarred.push({ c, o });
          this.setOwner(c, 0, p.id);
          cells++;
        }
      }
    }
    // Damage scales with how much of the nation was caught, so a good hit always matters.
    for (const [o, hit] of touched) {
      const def = this.players[o];
      const share = Math.min(B.BOMB_MAX_SHARE, (hit / Math.max(1, landBefore.get(o) ?? 1)) * B.BOMB_SHARE_MULT);
      const kill = def.troops * share;
      def.troops -= kill;
      kills += kill;
    }
    let victim = 0;
    let most = 0;
    for (const [o, hit] of touched) {
      if (hit > most) {
        most = hit;
        victim = o;
      }
    }
    if (scarred.length) this.scars.push({ at: this.tick + B.BOMB_REGROW_TICKS, cells: scarred });
    this.events.push({ t: 'bombHit', p: p.id, cell: s.to, radius: R, cells, kills, victim });
    for (const o of touched.keys()) this.events.push({ t: 'attacked', p: o, by: p.id, cell: s.to });
  }

  // ---- Bookkeeping ------------------------------------------------------------------------

  recomputeAdjacency(): void {
    const { w, h, owner, adj, adjSample, nPlayers: n } = this;
    adj.fill(0);
    adjSample.fill(-1);
    let k = 0;
    const size = w * h;
    for (let c = 0; c < size - w; c++) {
      const a = owner[c];
      if (a === WATER) continue;
      const b1 = owner[c + 1];
      if (b1 !== a && b1 !== WATER) {
        adj[a * n + b1]++;
        adj[b1 * n + a]++;
        k = (k + 1) & 7;
        if (adjSample[a * n + b1] < 0 || k === 0) adjSample[a * n + b1] = c + 1;
        if (adjSample[b1 * n + a] < 0 || k === 0) adjSample[b1 * n + a] = c;
      }
      const b2 = owner[c + w];
      if (b2 !== a && b2 !== WATER) {
        adj[a * n + b2]++;
        adj[b2 * n + a]++;
        k = (k + 1) & 7;
        if (adjSample[a * n + b2] < 0 || k === 0) adjSample[a * n + b2] = c + w;
        if (adjSample[b2 * n + a] < 0 || k === 0) adjSample[b2 * n + a] = c;
      }
    }
  }

  private checkPlayers(): void {
    let alive = 0;
    let last = -1;
    const total = this.world.landCells;
    for (let i = 1; i < this.nPlayers; i++) {
      const p = this.players[i];
      if (!p.alive) continue;
      if (p.land === 0 || (p.land < B.COLLAPSE_LAND && p.troops < B.COLLAPSE_TROOPS)) {
        this.eliminate(p);
        continue;
      }
      alive++;
      last = i;

      const share = p.land / total;
      if (p.milestone < B.CARD_MILESTONES.length && !p.cardOffer && share >= B.CARD_MILESTONES[p.milestone]) {
        p.milestone++;
        const pool = CARDS.filter((c) => !p.cards.includes(c.id));
        this.rng.shuffle(pool);
        // One real gamble on the table, and otherwise different kinds of card, so each pick is a decision.
        const offer = pool.filter((c) => c.tag === 'gamble').slice(0, 1);
        for (const c of pool) {
          if (offer.length < 3 && !offer.some((o) => o.tag === c.tag)) offer.push(c);
        }
        for (const c of pool) {
          if (offer.length < 3 && !offer.includes(c)) offer.push(c);
        }
        p.cardOffer = offer.map((c) => c.id);
        p.cardOfferTick = this.tick;
        this.events.push({ t: 'cardOffer', p: p.id });
      }
    }

    let topLand = 0;
    let top = -1;
    for (let i = 1; i < this.nPlayers; i++) {
      const p = this.players[i];
      if (p.alive && p.land > topLand) {
        topLand = p.land;
        top = i;
      }
    }
    if (alive === 1) this.finish(last);
    else if (top > 0 && topLand / total >= B.WIN_SHARE) this.finish(top);
  }

  private eliminate(p: Player): void {
    p.alive = false;
    p.eliminatedAt = this.tick;
    p.place = this.alivePlaces--;
    const { owner } = this;
    // Anything left reverts to neutral. Credit the strongest attacker for the kill.
    let by = 0;
    let bestTroops = -1;
    for (const a of this.attacks) {
      if (a.target === p.id && a.troops > bestTroops) {
        bestTroops = a.troops;
        by = a.owner;
      }
    }
    for (let c = 0; c < owner.length; c++) if (owner[c] === p.id) this.setOwner(c, 0, by);
    for (const a of this.attacks.slice()) {
      if (a.owner === p.id) this.endAttack(a, false);
      else if (a.target === p.id) this.endAttack(a, true);
    }
    if (by !== 0) {
      const killer = this.players[by];
      killer.stats.kills++;
      killer.gold += B.ELIMINATION_LOOT + p.gold * 0.5;
    }
    p.gold = 0;
    p.troops = 0;
    p.cardOffer = null;
    this.events.push({ t: 'eliminated', p: p.id, by, place: p.place });
  }

  private finish(winner: number): void {
    this.winner = winner;
    this.phase = 'over';
    this.players[winner].place = 1;
    let place = 2;
    const rest = this.players.slice(1).filter((p) => p.alive && p.id !== winner).sort((a, b) => b.land - a.land);
    for (const p of rest) p.place = place++;
    this.recordHistory();
    this.events.push({ t: 'victory', p: winner });
  }

  takeEvents(): GameEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  takeDirty(): number[] {
    const d = this.dirty;
    this.dirty = [];
    return d;
  }

  /** Rank by land, used by the leaderboard. */
  ranking(): Player[] {
    return this.players.slice(1).filter((p) => p.alive).sort((a, b) => b.land - a.land || b.troops - a.troops);
  }
}
