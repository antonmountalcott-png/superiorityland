/** All tunable numbers live here so balance passes never touch logic. */

export const TPS = 10;

/** Owner value for cells that can never be owned. */
export const WATER = 255;

export const Terrain = {
  Deep: 0,
  Shallow: 1,
  Sand: 2,
  Plains: 3,
  Desert: 4,
  Forest: 5,
  Hills: 6,
  Mountain: 7,
  River: 8,
} as const;
export type TerrainId = (typeof Terrain)[keyof typeof Terrain];

export const isLandTerrain = (t: number): boolean => t >= Terrain.Sand;

/** Troop cost multiplier per terrain. */
export const TERRAIN_COST = [0, 0, 1, 1, 1.2, 1.5, 2.1, 3.6, 2.2];
/** Chance per tick modifier for a wave advancing over this terrain. */
export const TERRAIN_SPEED = [0, 0, 1, 1, 0.85, 0.55, 0.38, 0.16, 0.28];
export const TERRAIN_NAME = ['Deep Sea', 'Shallows', 'Beach', 'Plains', 'Desert', 'Forest', 'Hills', 'Mountains', 'River'];

export const B = {
  // Troops
  START_TROOPS: 520,
  BASE_CAP: 900,
  CAP_PER_CELL: 2.6,
  CAP_PER_CITY: 450,
  GROWTH_RATE: 0.1,
  LAND_INCOME: 0.006,
  BASE_INCOME: 2.4,
  OVERCAP_DECAY: 0.02,

  // Combat
  NEUTRAL_COST: 0.9,
  ENEMY_BASE_COST: 1.0,
  ENEMY_DENSITY_COST: 1.0,
  DEFENDER_LOSS: 0.95,
  ADVANCE_CHANCE: 0.19,
  MAX_CELLS_PER_TICK: 240,
  AIM_FOCUS_CELLS: 42,
  CLASH_PER_TICK: 0.08,
  MIN_SEND: 8,

  // Economy
  BASE_GOLD: 1.6,
  GOLD_PER_1K_CELLS: 0.9,
  GOLD_PER_CITY: 1.0,
  GOLD_PER_MINE: 2.6,
  GOLD_PER_MARKET: 2.8,
  CITY_LOOT: 45,
  MINE_LOOT: 30,
  CAPITAL_TROOP_LOSS: 0.22,
  CAPITAL_GOLD_LOOT: 0.5,
  /** Ticks after losing a capital during which losing the relocated one costs nothing extra. */
  CAPITAL_PENALTY_GAP: 100,
  ELIMINATION_LOOT: 120,

  // Buildings
  COST_FORT: 110,
  COST_BARRACKS: 140,
  COST_MARKET: 90,
  COST_GROWTH: 1.3,
  BUILD_SPACING: 5,
  FORT_RADIUS: 11,
  FORT_MULT: 2.4,
  BARRACKS_CAP: 900,
  BARRACKS_INCOME: 5,

  // Strikes
  COST_BOMB: 220,
  COST_PARA: 130,
  STRIKE_COST_GROWTH: 1.15,
  BOMB_RADIUS: 11,
  BOMB_FLIGHT_TICKS: 16,
  BOMB_COOLDOWN: 120,
  /** A nation hit loses this multiple of the share of its land inside the blast, up to BOMB_MAX_SHARE. */
  BOMB_SHARE_MULT: 6,
  BOMB_MAX_SHARE: 0.34,
  /** Flattened land nobody has claimed goes back to its owner after this long. */
  BOMB_REGROW_TICKS: 300,
  PARA_FLIGHT_TICKS: 22,
  PARA_COOLDOWN: 100,
  PARA_LOSS: 0.25,

  // Boats
  BOAT_CELLS_PER_TICK: 1.3,
  BOAT_LOSS: 0.1,

  // Diplomacy
  TRUCE_TICKS: 450,
  TRUCE_ASK_COOLDOWN: 200,
  COST_BRIBE: 100,
  BRIBE_COST_GROWTH: 1.35,
  BRIBE_TROOPS: 0.45,
  COST_PEACE: 120,
  PEACE_COST_GROWTH: 1.3,

  // Flow
  WIN_SHARE: 0.65,
  CARD_MILESTONES: [0.03, 0.08, 0.15, 0.24, 0.35, 0.48],
  CARD_AUTOPICK_TICKS: 220,
  COLLAPSE_LAND: 5,
  COLLAPSE_TROOPS: 15,
  HISTORY_EVERY: 30,
} as const;

/** Bot difficulty multipliers. */
export const DIFFICULTY = {
  // `grace` makes bots look elsewhere before picking on the human, fading out by `GRACE_TICKS`.
  // `home` is a defence bonus for the human seat: beginners lose fewer early wars without being told so.
  recruit: { think: 2.0, send: 0.58, income: 0.68, smart: 0.35, grace: 1.8, home: 1.45 },
  general: { think: 1.2, send: 0.85, income: 0.9, smart: 0.65, grace: 0.8, home: 1.15 },
  supreme: { think: 0.8, send: 1.0, income: 1.05, smart: 1.0, grace: 0, home: 1 },
} as const;
export type Difficulty = keyof typeof DIFFICULTY;
export const GRACE_TICKS = 3000;
