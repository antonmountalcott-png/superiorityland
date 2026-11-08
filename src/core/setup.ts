import type { Difficulty } from './balance';
import { colorDistance } from './color';
import { type Mods, NATIONS, type Nation } from './nations';
import { Rng } from './rng';
import { Game } from './sim';
import { type MapType, generateWorld, pickSpawns } from './worldgen';

export interface MatchOptions {
  seed: number;
  map: MapType;
  difficulty: Difficulty;
  bots: number;
  humanNation?: Nation;
  autoHuman?: boolean;
  /** An equipped special skill, applied to the human seat only. */
  humanBoost?: (m: Mods) => void;
}

/** Two nations closer than this in OKLab (x100) would be hard to tell apart on the map. */
const MIN_COLOR_GAP = 13;

/** Builds a world and a game with all bot capitals planted. The human seat (id 1) spawns separately. */
export function createMatch(opts: MatchOptions): Game {
  const world = generateWorld(opts.seed, opts.map);
  const rng = new Rng(opts.seed ^ 0x2a7f13);
  const human = opts.humanNation;
  // A bot that would look like you sits this match out, so your land is always unmistakable.
  const pool = rng.shuffle(NATIONS.filter((n) => n.id !== human?.id && (!human || colorDistance(n.fill, human.fill) >= MIN_COLOR_GAP)));
  const bots = pool.slice(0, Math.min(opts.bots, pool.length));
  const game = new Game(world, {
    humanNation: opts.humanNation,
    bots,
    difficulty: opts.difficulty,
    seed: opts.seed,
    autoHuman: opts.autoHuman,
    humanBoost: opts.humanBoost,
  });
  const firstBot = opts.humanNation ? 2 : 1;
  const spawns = pickSpawns(world, bots.length, rng);
  spawns.forEach((cell, i) => game.spawn(firstBot + i, cell));
  return game;
}

/** Choose a sensible spot for a seat that has not picked one (auto spawn or timeout). */
export function autoSpawnCell(game: Game, seed: number): number {
  const taken = game.players.slice(1).filter((p) => p.capital >= 0).map((p) => p.capital);
  const [cell] = pickSpawns(game.world, 1, new Rng(seed ^ 0x77aa11), taken);
  return cell;
}
