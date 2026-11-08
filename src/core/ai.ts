import { B, DIFFICULTY, GRACE_TICKS, TERRAIN_COST, Terrain, WATER } from './balance';
import { cardById } from './cards';
import type { BuildingKind, Game, Player } from './sim';

/** Bots use exactly the same commands as the human, so nothing here can cheat the rules. */
export function aiThink(g: Game, p: Player): void {
  const ai = p.ai;
  if (!ai) return;
  const diff = DIFFICULTY[g.difficulty];

  // The human seat always chooses its own cards, even when bot logic is driving it.
  if (p.cardOffer && !p.isHuman) {
    g.queueCommand({ t: 'card', p: p.id, id: chooseCard(g, p) });
  }

  answerHumanSituations(g, p);
  spendGold(g, p);

  const cap = g.capOf(p);
  const fill = p.troops / cap;
  if (fill < ai.minFill) return;

  const n = g.nPlayers;
  const neutralBorder = g.adj[p.id * n + 0];
  const canExpand = neutralBorder > 0 && g.neutralLeft > 0;

  // Rank neighbours: weak, thinly spread targets are attractive.
  let best: Player | null = null;
  let bestScore = -Infinity;
  for (let i = 1; i < n; i++) {
    if (i === p.id) continue;
    const q = g.players[i];
    if (!q.alive || g.adj[p.id * n + i] === 0 || g.inTruce(p.id, i)) continue;
    const ratio = p.troops / Math.max(1, q.troops);
    const density = q.troops / Math.max(1, q.land);
    // New players get breathing room: bots prefer other targets early on, except on Supreme.
    const grace = q.isHuman ? diff.grace * Math.max(0, 1 - g.tick / GRACE_TICKS) : 0;
    const score = ratio * (0.6 + ai.aggression) - density * 0.14 * diff.smart +
      (q.land / Math.max(1, p.land)) * 0.25 + (q.id === ai.grudge ? 0.5 : 0) + g.rng.next() * 0.4 - grace;
    if (score > bestScore) {
      bestScore = score;
      best = q;
    }
  }

  // Out of free land at home while other shores are still open: sail rather than wait.
  if (!canExpand && g.neutralLeft / g.world.landCells > 0.04 && g.rng.next() < 0.5) {
    const target = pickOverseasTarget(g, p, true);
    if (target >= 0) {
      g.queueCommand({ t: 'send', p: p.id, cell: target, pct: 0.42 * diff.send });
      return;
    }
  }

  const expandFirst = canExpand && (g.neutralLeft / g.world.landCells > 0.2 || !best || g.rng.next() < 0.6);
  if (expandFirst) {
    const pct = (0.28 + ai.aggression * 0.22) * diff.send;
    g.queueCommand({ t: 'send', p: p.id, cell: pickExpansionAim(g, p), pct });
    return;
  }

  if (best) {
    const ratio = p.troops / Math.max(1, best.troops);
    const threshold = 1.25 - ai.aggression * 0.75;
    if (ratio >= threshold || g.rng.next() < 0.08 * ai.aggression) {
      const pct = (0.35 + ai.aggression * 0.3) * diff.send;
      const aim = g.rng.next() < 0.35 * diff.smart && best.capital >= 0 ? best.capital : g.contactCell(p.id, best.id);
      if (aim >= 0) g.queueCommand({ t: 'send', p: p.id, cell: aim, pct });
      return;
    }
  }

  // Boxed in, or nothing worth attacking nearby: look overseas.
  if (!canExpand && fill > 0.5 && g.rng.next() < 0.6) {
    const target = pickOverseasTarget(g, p, false);
    if (target >= 0) g.queueCommand({ t: 'send', p: p.id, cell: target, pct: 0.35 * diff.send });
  }
}

function chooseCard(g: Game, p: Player): string {
  const ai = p.ai;
  const offer = p.cardOffer as string[];
  if (!ai) return offer[0];
  let best = offer[0];
  let bestScore = -Infinity;
  for (const id of offer) {
    const tag = cardById(id).tag;
    const w = tag === 'attack' ? ai.aggression : tag === 'defend' ? ai.turtle : tag === 'gold' ? ai.econ : tag === 'grow' ? 0.7 : 0.45;
    const score = w + g.rng.next() * 0.4;
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return best;
}

function answerHumanSituations(g: Game, p: Player): void {
  const ai = p.ai;
  if (!ai) return;
  // Track who is hurting us so bots feel like they hold a grudge.
  for (const a of g.attacks) {
    if (a.target === p.id) {
      ai.grudge = a.owner;
      break;
    }
  }
  // Under heavy pressure, sometimes ask a stronger neighbour for peace.
  if (ai.grudge > 0 && g.rng.next() < 0.03) {
    const foe = g.players[ai.grudge];
    if (foe.alive && foe.troops > p.troops * 1.3 && !g.inTruce(p.id, foe.id) && !p.isHuman) {
      g.queueCommand({ t: 'truce', p: p.id, other: foe.id });
    }
  }
}

function spendGold(g: Game, p: Player): void {
  const ai = p.ai;
  if (!ai) return;
  const diff = DIFFICULTY[g.difficulty];
  if (g.rng.next() > 0.55 + 0.4 * diff.smart) return;

  const wantMarket = p.markets < 1 + Math.floor(ai.econ * 3) && p.land > 300;
  const wantBarracks = p.barracks < 1 + Math.floor(p.land / 1600);
  const threat = strongestNeighbour(g, p);
  const wantFort = threat !== null && p.forts < 1 + Math.floor(ai.turtle * 3) && threat.troops > p.troops * 0.75;

  const tryBuild = (kind: BuildingKind, cell: number): boolean => {
    if (cell < 0 || p.gold < g.buildCost(p, kind)) return false;
    if (g.canBuild(p, kind, cell)) return false;
    g.queueCommand({ t: 'build', p: p.id, kind, cell });
    return true;
  };

  if (wantFort && threat) {
    const near = g.contactCell(threat.id, p.id);
    if (near >= 0 && tryBuild('fort', stepInland(g, p, near))) return;
  }
  if (wantMarket && tryBuild('market', randomOwnCell(g, p))) return;
  if (wantBarracks && tryBuild('barracks', randomOwnCell(g, p))) return;

  // Strikes for bots with spare gold.
  // Big Boom hits hard, so on easier settings bots mostly aim it at each other rather than at the human.
  const sparesHuman = threat?.isHuman && g.rng.next() < diff.grace;
  if (threat && !sparesHuman && p.gold > g.bombCost(p) + 40 && g.tick >= p.bombReady && g.rng.next() < 0.35 * diff.smart + 0.05) {
    const cell = bombTarget(g, p, threat);
    if (cell >= 0) g.queueCommand({ t: 'bomb', p: p.id, cell });
    return;
  }
  // Late game: airdrop behind a strong neighbour's lines.
  if (threat && p.gold > g.paraCost(p) + 120 && g.tick >= p.paraReady && p.troops / g.capOf(p) > 0.55 && g.rng.next() < 0.1 * diff.smart) {
    if (threat.capital >= 0) g.queueCommand({ t: 'para', p: p.id, cell: threat.capital, pct: 0.3 });
  }
}

function strongestNeighbour(g: Game, p: Player): Player | null {
  let best: Player | null = null;
  for (let i = 1; i < g.nPlayers; i++) {
    if (i === p.id) continue;
    const q = g.players[i];
    if (q.alive && g.adj[p.id * g.nPlayers + i] > 0 && (!best || q.troops > best.troops)) best = q;
  }
  return best;
}

function bombTarget(g: Game, p: Player, threat: Player): number {
  // Prefer the enemy's forts, then the front line.
  for (const b of g.buildings.values()) {
    if (b.owner === threat.id && b.kind === 'fort') return b.cell;
  }
  return g.contactCell(p.id, threat.id);
}

function stepInland(g: Game, p: Player, cell: number): number {
  // Walk a few cells from the border into our own land so the fort survives the first wave.
  const { w, owner } = g;
  let c = cell;
  for (let i = 0; i < 6; i++) {
    let moved = false;
    for (const d of [-1, 1, -w, w]) {
      const n = c + d;
      if (owner[n] !== p.id) continue;
      const dx = (n % w) - (cell % w);
      const dy = ((n / w) | 0) - ((cell / w) | 0);
      const cx = (c % w) - (cell % w);
      const cy = ((c / w) | 0) - ((cell / w) | 0);
      if (dx * dx + dy * dy > cx * cx + cy * cy) {
        c = n;
        moved = true;
        break;
      }
    }
    if (!moved) break;
  }
  return owner[c] === p.id ? c : -1;
}

function randomOwnCell(g: Game, p: Player): number {
  const { owner, world } = g;
  for (let i = 0; i < 40; i++) {
    const c = g.rng.int(owner.length);
    if (owner[c] === p.id && world.terrain[c] !== Terrain.Mountain && world.terrain[c] !== Terrain.River) return c;
  }
  return -1;
}

function pickExpansionAim(g: Game, p: Player): number {
  // Head for an unclaimed prize if one is close; otherwise push toward open ground.
  const sample = g.contactCell(p.id, 0);
  const { w, owner, world } = g;
  const sx = sample % w;
  const sy = (sample / w) | 0;
  let best = sample;
  let bestD = Infinity;
  for (const poi of world.pois) {
    if (owner[poi.cell] !== 0) continue;
    const d = ((poi.cell % w) - sx) ** 2 + (((poi.cell / w) | 0) - sy) ** 2;
    if (d < bestD && d < 90 * 90) {
      bestD = d;
      best = poi.cell;
    }
  }
  if (bestD === Infinity) {
    const cost = TERRAIN_COST[world.terrain[best]];
    if (cost > 2.5 && g.rng.next() < 0.5) return g.contactCell(p.id, 0);
  }
  return best;
}

function pickOverseasTarget(g: Game, p: Player, neutralOnly: boolean): number {
  const { owner, world } = g;
  const nLm = world.landmassSizes.length;
  // Land is under half the map and overseas land less, so sample generously.
  for (let i = 0; i < 160; i++) {
    const c = g.rng.int(owner.length);
    const o = owner[c];
    if (o === WATER || o === p.id) continue;
    if (neutralOnly && o !== 0) continue;
    const lm = world.landmass[c];
    if (lm < 0 || g.presence[p.id * nLm + lm] > 0) continue;
    if (o !== 0 && g.inTruce(p.id, o)) continue;
    return c;
  }
  return -1;
}

export const AI_BUILD_REASON = B.BUILD_SPACING;
