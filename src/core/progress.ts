/**
 * Account progression: XP, the 30-level battle pass, unlocks and achievements.
 * Pure functions only, so the rules are unit-tested and behave the same everywhere.
 */
import type { Difficulty } from './balance';
import { ALL_BALLS, isEmpire, nationById } from './nations';
import { skillById } from './skills';
import type { MapType } from './worldgen';

export const MAX_LEVEL = 30;

/** XP needed to go from `level` to the next one. Early levels come in a match or two; later ones take two or three. */
export const xpToNext = (level: number): number => (level >= MAX_LEVEL ? 0 : Math.min(LEVEL_CAP_XP, 250 + 30 * (level - 1)));

/** No level costs more than this, so the end of the pass never turns into a wall. */
export const LEVEL_CAP_XP = 800;

/** After Level 30, every this much XP earns a Superior Star, so XP always counts for something. */
export const STAR_XP = 1500;

/** Total XP at which `level` is reached. */
export function xpAtLevel(level: number): number {
  let total = 0;
  for (let n = 1; n < Math.min(level, MAX_LEVEL); n++) total += xpToNext(n);
  return total;
}

export interface LevelInfo {
  level: number;
  /** Superior Stars earned after Level 30. */
  stars: number;
  /** XP earned inside the current level. */
  into: number;
  /** XP the current level needs in total (0 at max level). */
  need: number;
  max: boolean;
}

export function levelInfo(xp: number): LevelInfo {
  let level = 1;
  let rest = Math.max(0, Math.floor(xp));
  while (level < MAX_LEVEL && rest >= xpToNext(level)) {
    rest -= xpToNext(level);
    level++;
  }
  const max = level >= MAX_LEVEL;
  if (max) return { level, stars: Math.floor(rest / STAR_XP), into: rest % STAR_XP, need: STAR_XP, max };
  return { level, stars: 0, into: rest, need: xpToNext(level), max };
}

// ---- Rewards ------------------------------------------------------------------------------

export type RewardKind = 'ball' | 'skill' | 'title' | 'frame';

export interface Reward {
  level: number;
  kind: RewardKind;
  id: string;
  name: string;
  desc: string;
  /** Empire milestones get a gold card. */
  milestone?: boolean;
}

export const FRAMES: Record<string, string> = { none: 'No frame', bronze: 'Bronze Frame', silver: 'Silver Frame', gold: 'Gold Frame', rainbow: 'Rainbow Frame' };
export const DEFAULT_TITLE = 'recruit';
export const TITLES: Record<string, string> = {
  recruit: 'New Recruit',
  rookie: 'Rookie Ruler',
  bully: 'Border Bully',
  painter: 'Map Painter',
  emperor: 'Probably Emperor',
};

/** The eight nations everyone starts with. The other eight, and every empire, come from the pass. */
export const STARTER_BALLS = ['superiorityland', 'toastria', 'mooland', 'moustachia', 'sockovia', 'duckmark', 'pickleton', 'waffleburg'];

const ballReward = (level: number, id: string): Reward => {
  const n = nationById(id);
  const empire = isEmpire(id);
  return { level, kind: 'ball', id, name: n.name, desc: `${empire ? 'Past empire' : 'New nation'}. ${n.perk.name}: ${n.perk.desc}.`, milestone: empire };
};
const skillReward = (level: number, id: string): Reward => {
  const s = skillById(id);
  return { level, kind: 'skill', id, name: s?.name ?? id, desc: `Special skill. ${s?.desc ?? ''}` };
};
const titleReward = (level: number, id: string): Reward => ({ level, kind: 'title', id, name: TITLES[id], desc: 'A title shown under your name on your profile and the title screen.' });
const frameReward = (level: number, id: string): Reward => ({ level, kind: 'frame', id, name: FRAMES[id].replace(' Frame', ''), desc: 'A frame around your ball on your profile and the title screen.' });

export const TRACK: Reward[] = [
  skillReward(1, 'lucky'),
  titleReward(2, 'rookie'),
  ballReward(3, 'llamadonia'),
  skillReward(4, 'boots'),
  ballReward(5, 'pharaonia'),
  ballReward(6, 'turnipia'),
  frameReward(7, 'bronze'),
  skillReward(8, 'skin'),
  ballReward(9, 'beanorra'),
  ballReward(10, 'spartaca'),
  titleReward(11, 'bully'),
  ballReward(12, 'fjordia'),
  skillReward(13, 'tax'),
  frameReward(14, 'silver'),
  ballReward(15, 'romanum'),
  ballReward(16, 'krakenia'),
  skillReward(17, 'spurt'),
  titleReward(18, 'painter'),
  ballReward(19, 'bonkia'),
  ballReward(20, 'khanate'),
  skillReward(21, 'walls'),
  ballReward(22, 'spudland'),
  frameReward(23, 'gold'),
  skillReward(24, 'sea'),
  ballReward(25, 'bonapartia'),
  ballReward(26, 'salmonia'),
  titleReward(27, 'emperor'),
  skillReward(28, 'bang'),
  frameReward(29, 'rainbow'),
  ballReward(30, 'eternal'),
];

/** The level that unlocks an item, or 0 if everyone has it from the start. */
export function unlockLevel(kind: RewardKind, id: string): number {
  if (kind === 'ball' && STARTER_BALLS.includes(id)) return 0;
  if (kind === 'title' && id === DEFAULT_TITLE) return 0;
  if (kind === 'frame' && id === 'none') return 0;
  return TRACK.find((r) => r.kind === kind && r.id === id)?.level ?? Infinity;
}

export const owns = (p: Progress, kind: RewardKind, id: string): boolean => unlockLevel(kind, id) <= levelInfo(p.xp).level;

export const ownedBalls = (p: Progress): string[] => ALL_BALLS.filter((n) => owns(p, 'ball', n.id)).map((n) => n.id);

/** Rewards reached since the player last opened the pass. */
export const unseenRewards = (p: Progress): Reward[] => {
  const level = levelInfo(p.xp).level;
  return TRACK.filter((r) => r.level > p.seenLevel && r.level <= level);
};

// ---- Progress document --------------------------------------------------------------------

export interface Stats {
  matches: number;
  wins: number;
  kills: number;
  cities: number;
  booms: number;
  boats: number;
  podiums: number;
  /** Fastest win in seconds; 0 if none yet. */
  bestWinSec: number;
  /** Best peak land share ever, in percent. */
  peakLand: number;
  /** Wins by difficulty and by world type. */
  winsBy: Record<string, number>;
}

export interface Daily {
  /** Local date, YYYY-MM-DD. */
  day: string;
  /** Challenge ids finished today. */
  done: string[];
  /** True once today's first-match bonus has been paid. */
  first: boolean;
  /** Days in a row with at least one match. */
  streak: number;
}

export interface Weekly {
  /** The Monday that starts the week, YYYY-MM-DD. */
  week: string;
  done: string[];
  /** Running totals for this week's challenges. */
  prog: Record<string, number>;
}

export interface Progress {
  v: 1;
  xp: number;
  daily: Daily;
  weekly: Weekly;
  /** Achievement id to the time it was earned (ms). */
  achievements: Record<string, number>;
  equipped: { ball: string; skill: string | null; title: string; frame: string; showcase: string[] };
  stats: Stats;
  /** Highest level whose rewards the player has seen, for NEW markers. */
  seenLevel: number;
}

export const defaultProgress = (): Progress => ({
  v: 1,
  xp: 0,
  daily: { day: '', done: [], first: false, streak: 0 },
  weekly: { week: '', done: [], prog: {} },
  achievements: {},
  equipped: { ball: 'superiorityland', skill: 'lucky', title: DEFAULT_TITLE, frame: 'none', showcase: [] },
  stats: { matches: 0, wins: 0, kills: 0, cities: 0, booms: 0, boats: 0, podiums: 0, bestWinSec: 0, peakLand: 0, winsBy: {} },
  seenLevel: 1,
});

const num = (v: unknown, fallback = 0, max = 1e9): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(v, max) : fallback);

/** Accepts anything (a saved file, a server reply) and returns a valid document. Never throws. */
export function sanitizeProgress(raw: unknown): Progress {
  const d = defaultProgress();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Partial<Progress>;
  const p: Progress = { ...d, xp: Math.floor(num(r.xp)), seenLevel: Math.max(1, Math.floor(num(r.seenLevel, 1, MAX_LEVEL))) };
  if (r.achievements && typeof r.achievements === 'object') {
    for (const a of ACHIEVEMENTS) {
      const t = (r.achievements as Record<string, unknown>)[a.id];
      if (typeof t === 'number' && t > 0) p.achievements[a.id] = t;
    }
  }
  const dl = (r.daily ?? {}) as Partial<Daily>;
  if (typeof dl.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dl.day)) {
    p.daily = {
      day: dl.day,
      done: Array.isArray(dl.done) ? dl.done.filter((id): id is string => typeof id === 'string' && DAILY_POOL.some((c) => c.id === id)).slice(0, 3) : [],
      first: dl.first === true,
      streak: Math.floor(num(dl.streak, 0, 10000)),
    };
  }
  const wk = (r.weekly ?? {}) as Partial<Weekly>;
  if (typeof wk.week === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(wk.week)) {
    const prog: Record<string, number> = {};
    if (wk.prog && typeof wk.prog === 'object') for (const c of WEEKLY_POOL) prog[c.id] = Math.floor(num((wk.prog as Record<string, unknown>)[c.id], 0, 1e6));
    p.weekly = { week: wk.week, prog, done: Array.isArray(wk.done) ? wk.done.filter((id): id is string => typeof id === 'string' && WEEKLY_POOL.some((c) => c.id === id)).slice(0, 3) : [] };
  }
  const s = (r.stats ?? {}) as Partial<Stats>;
  p.stats = {
    matches: num(s.matches), wins: num(s.wins), kills: num(s.kills), cities: num(s.cities), booms: num(s.booms),
    boats: num(s.boats), podiums: num(s.podiums), bestWinSec: num(s.bestWinSec), peakLand: num(s.peakLand, 0, 100), winsBy: {},
  };
  if (s.winsBy && typeof s.winsBy === 'object') {
    for (const [k, v] of Object.entries(s.winsBy)) if (/^[a-z]{1,20}$/.test(k)) p.stats.winsBy[k] = num(v);
  }
  const e = (r.equipped ?? {}) as Partial<Progress['equipped']>;
  p.equipped = {
    ball: typeof e.ball === 'string' && owns(p, 'ball', e.ball) ? e.ball : d.equipped.ball,
    skill: e.skill === null ? null : typeof e.skill === 'string' && skillById(e.skill) && owns(p, 'skill', e.skill) ? e.skill : d.equipped.skill,
    title: typeof e.title === 'string' && TITLES[e.title] && owns(p, 'title', e.title) ? e.title : DEFAULT_TITLE,
    frame: typeof e.frame === 'string' && FRAMES[e.frame] && owns(p, 'frame', e.frame) ? e.frame : 'none',
    showcase: Array.isArray(e.showcase) ? e.showcase.filter((id): id is string => typeof id === 'string' && !!p.achievements[id]).slice(0, 3) : [],
  };
  return p;
}

// ---- Matches and XP -----------------------------------------------------------------------

export interface MatchReport {
  won: boolean;
  place: number;
  total: number;
  /** Peak land share, 0 to 1. */
  peakShare: number;
  cities: number;
  kills: number;
  booms: number;
  boats: number;
  seconds: number;
  difficulty: Difficulty;
  map: MapType;
  nation: string;
  forts: number;
  markets: number;
  cards: number;
  bribes: number;
  peaces: number;
}

export const DIFFICULTY_XP: Record<Difficulty, { mult: number; label: string }> = {
  recruit: { mult: 1, label: 'Easy' },
  general: { mult: 1.25, label: 'Normal' },
  supreme: { mult: 1.5, label: 'Hard' },
};

export interface XpLine { label: string; xp: number }
export interface XpBreakdown { lines: XpLine[]; subtotal: number; mult: number; multLabel: string; total: number }

export function matchXp(r: MatchReport): XpBreakdown {
  const lines: XpLine[] = [{ label: 'Played a match', xp: 100 }];
  const pct = Math.round(r.peakShare * 100);
  if (pct > 0) lines.push({ label: `Peak land ${pct}%`, xp: Math.min(195, pct * 3) });
  if (r.cities > 0) lines.push({ label: `${r.cities} ${r.cities === 1 ? 'city' : 'cities'} seized`, xp: r.cities * 4 });
  if (r.kills > 0) lines.push({ label: `${r.kills} ${r.kills === 1 ? 'nation' : 'nations'} ended`, xp: r.kills * 30 });
  if (r.won) lines.push({ label: 'Victory', xp: 150 });
  const subtotal = lines.reduce((s, l) => s + l.xp, 0);
  const { mult, label } = DIFFICULTY_XP[r.difficulty];
  return { lines, subtotal, mult, multLabel: `${label} ×${mult}`, total: Math.round(subtotal * mult) };
}

// ---- Achievements -------------------------------------------------------------------------

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  xp: number;
  icon: string;
  /** True once earned. `r` is the match just played, if any. */
  check(r: MatchReport | null, p: Progress): boolean;
  /** Lifetime progress toward the goal, for a progress bar. */
  goal?(p: Progress): [number, number];
}

const winsOn = (p: Progress, ...keys: string[]) => keys.filter((k) => (p.stats.winsBy[k] ?? 0) > 0).length;

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first', name: 'First Steps', desc: 'Finish your first match.', xp: 25, icon: 'flag', check: (_, p) => p.stats.matches >= 1, goal: (p) => [p.stats.matches, 1] },
  { id: 'blood', name: 'First Blood', desc: 'End a rival nation.', xp: 40, icon: 'sword', check: (_, p) => p.stats.kills >= 1, goal: (p) => [p.stats.kills, 1] },
  { id: 'victory', name: 'Victory!', desc: 'Win a match.', xp: 75, icon: 'trophy', check: (_, p) => p.stats.wins >= 1, goal: (p) => [p.stats.wins, 1] },
  { id: 'podium', name: 'Podium Finish', desc: 'Finish in the top 3.', xp: 40, icon: 'podium', check: (_, p) => p.stats.podiums >= 1, goal: (p) => [p.stats.podiums, 1] },
  { id: 'half', name: 'Half the World', desc: 'Hold 50% of the land at once.', xp: 75, icon: 'half', check: (r) => !!r && r.peakShare >= 0.5 },
  { id: 'speed', name: 'Speedrunner', desc: 'Win in under 4 minutes.', xp: 150, icon: 'bolt', check: (r) => !!r && r.won && r.seconds < 240 },
  { id: 'landlord', name: 'Landlord', desc: 'Seize 10 cities in one match.', xp: 60, icon: 'city', check: (r) => !!r && r.cities >= 10 },
  { id: 'serial', name: 'Serial Annexer', desc: 'End 4 nations in one match.', xp: 100, icon: 'flame', check: (r) => !!r && r.kills >= 4 },
  { id: 'kaboom', name: 'Kaboom', desc: 'Use Big Boom 3 times in one match.', xp: 60, icon: 'bomb', check: (r) => !!r && r.booms >= 3 },
  { id: 'admiral', name: 'Admiral', desc: 'Launch 5 boats in one match.', xp: 80, icon: 'boat', check: (r) => !!r && r.boats >= 5 },
  { id: 'fortress', name: 'Fortress Mind', desc: 'Own 4 forts at once.', xp: 80, icon: 'fort', check: (r) => !!r && r.forts >= 4 },
  { id: 'market', name: 'Market Day', desc: 'Own 4 markets at once.', xp: 80, icon: 'market', check: (r) => !!r && r.markets >= 4 },
  { id: 'cards', name: 'Card Shark', desc: 'Pick 6 upgrades in one match.', xp: 60, icon: 'cards', check: (r) => !!r && r.cards >= 6 },
  { id: 'diplomat', name: 'Diplomat', desc: 'Buy a truce, or pay a rival to attack.', xp: 60, icon: 'handshake', check: (r) => !!r && r.bribes + r.peaces >= 1 },
  { id: 'puppet', name: 'Puppet Master', desc: 'Pay rivals to attack twice in one match.', xp: 100, icon: 'coin', check: (r) => !!r && r.bribes >= 2 },
  { id: 'normal', name: 'Normal Person', desc: 'Win on Normal.', xp: 150, icon: 'shield', check: (_, p) => (p.stats.winsBy.general ?? 0) >= 1, goal: (p) => [p.stats.winsBy.general ?? 0, 1] },
  { id: 'hard', name: 'Hard Boiled', desc: 'Win on Hard.', xp: 250, icon: 'skull', check: (_, p) => (p.stats.winsBy.supreme ?? 0) >= 1, goal: (p) => [p.stats.winsBy.supreme ?? 0, 1] },
  { id: 'globe', name: 'Globetrotter', desc: 'Win on Continents, Pangaea and Islands.', xp: 200, icon: 'world', check: (_, p) => winsOn(p, 'continents', 'pangaea', 'archipelago') === 3, goal: (p) => [winsOn(p, 'continents', 'pangaea', 'archipelago'), 3] },
  { id: 'veteran', name: 'Veteran', desc: 'Play 10 matches.', xp: 150, icon: 'helmet', check: (_, p) => p.stats.matches >= 10, goal: (p) => [p.stats.matches, 10] },
  { id: 'champion', name: 'Champion', desc: 'Win 5 matches.', xp: 200, icon: 'crown', check: (_, p) => p.stats.wins >= 5, goal: (p) => [p.stats.wins, 5] },
  { id: 'warlord', name: 'Warlord', desc: 'End 25 nations in total.', xp: 200, icon: 'peak', check: (_, p) => p.stats.kills >= 25, goal: (p) => [p.stats.kills, 25] },
  { id: 'oldguard', name: 'Old Guard', desc: 'Play 50 matches.', xp: 400, icon: 'barracks', check: (_, p) => p.stats.matches >= 50, goal: (p) => [p.stats.matches, 50] },
  { id: 'dynasty', name: 'Dynasty', desc: 'Win 25 matches.', xp: 500, icon: 'heart', check: (_, p) => p.stats.wins >= 25, goal: (p) => [p.stats.wins, 25] },
  { id: 'conqueror', name: 'Conqueror', desc: 'End 100 nations in total.', xp: 500, icon: 'troops', check: (_, p) => p.stats.kills >= 100, goal: (p) => [p.stats.kills, 100] },
  { id: 'collector', name: 'Collector', desc: 'Own 12 nations or empires.', xp: 150, icon: 'star', check: (_, p) => ownedBalls(p).length >= 12, goal: (p) => [ownedBalls(p).length, 12] },
  { id: 'imperial', name: 'Imperial', desc: 'Unlock a past empire.', xp: 75, icon: 'chair', check: (_, p) => ownedBalls(p).some(isEmpire), goal: (p) => [ownedBalls(p).filter(isEmpire).length, 1] },
  { id: 'superior', name: 'Superior', desc: 'Reach Level 30.', xp: 300, icon: 'ticket', check: (_, p) => levelInfo(p.xp).level >= MAX_LEVEL, goal: (p) => [levelInfo(p.xp).level, MAX_LEVEL] },
];

export const achievementById = (id: string): Achievement | undefined => ACHIEVEMENTS.find((a) => a.id === id);

/** Medal colour by how hard the achievement is. */
export const achievementTier = (a: Achievement): 'bronze' | 'silver' | 'gold' => (a.xp >= 200 ? 'gold' : a.xp >= 100 ? 'silver' : 'bronze');
/** Not named after metals, so they can't be mixed up with the frames. */
export const TIER_NAME = { bronze: 'Common', silver: 'Rare', gold: 'Legendary' } as const;

// ---- Daily challenges -----------------------------------------------------------------------

export interface DailyChallenge { id: string; name: string; check(r: MatchReport): boolean }

export const DAILY_XP = 150;
export const FIRST_MATCH_XP = 100;
export const WEEKLY_XP = 300;

/** First match of the day: 100 XP, plus 25 for each day of the streak, up to 250 on day 7. */
export const firstMatchXp = (streak: number): number => FIRST_MATCH_XP + 25 * (Math.min(Math.max(streak, 1), 7) - 1);

export const DAILY_POOL: DailyChallenge[] = [
  { id: 'win', name: 'Win a match', check: (r) => r.won },
  { id: 'top3', name: 'Finish in the top 3', check: (r) => r.place <= 3 },
  { id: 'cities8', name: 'Seize 8 cities in one match', check: (r) => r.cities >= 8 },
  { id: 'kill2', name: 'End 2 nations in one match', check: (r) => r.kills >= 2 },
  { id: 'land30', name: 'Hold 30% of the land', check: (r) => r.peakShare >= 0.3 },
  { id: 'boom2', name: 'Use Big Boom twice in one match', check: (r) => r.booms >= 2 },
  { id: 'boat2', name: 'Launch 2 boats in one match', check: (r) => r.boats >= 2 },
  { id: 'normal', name: 'Finish a match on Normal or Hard', check: (r) => r.difficulty !== 'recruit' },
  { id: 'fort2', name: 'Own 2 forts at once', check: (r) => r.forts >= 2 },
  { id: 'market2', name: 'Own 2 markets at once', check: (r) => r.markets >= 2 },
  { id: 'cards4', name: 'Pick 4 upgrades in one match', check: (r) => r.cards >= 4 },
  { id: 'deal', name: 'Buy a truce or pay a rival to attack', check: (r) => r.bribes + r.peaces >= 1 },
];

/** A weekly challenge is a running total over the week, so it takes several matches. */
export interface WeeklyChallenge { id: string; name: string; goal: number; add(r: MatchReport): number }

export const WEEKLY_POOL: WeeklyChallenge[] = [
  { id: 'wwin', name: 'Win 3 matches', goal: 3, add: (r) => (r.won ? 1 : 0) },
  { id: 'wplay', name: 'Play 7 matches', goal: 7, add: () => 1 },
  { id: 'wkill', name: 'End 12 nations', goal: 12, add: (r) => r.kills },
  { id: 'wcity', name: 'Seize 50 cities', goal: 50, add: (r) => r.cities },
  { id: 'wboom', name: 'Use Big Boom 10 times', goal: 10, add: (r) => r.booms },
  { id: 'wboat', name: 'Launch 10 boats', goal: 10, add: (r) => r.boats },
  { id: 'wtop3', name: 'Finish in the top 3, 4 times', goal: 4, add: (r) => (r.place <= 3 ? 1 : 0) },
  { id: 'whard', name: 'Win 2 matches on Normal or Hard', goal: 2, add: (r) => (r.won && r.difficulty !== 'recruit' ? 1 : 0) },
];

/** Monday of the current local week. */
export function weekKey(now: number): string {
  const d = new Date(now);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return dayKey(d.getTime());
}

const pick3 = <T>(seed: string, pool: T[]): T[] => {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619) >>> 0;
  const rest = [...pool];
  const out: T[] = [];
  while (out.length < 3) {
    h = (Math.imul(h, 1103515245) + 12345) >>> 0;
    out.push(rest.splice(h % rest.length, 1)[0]);
  }
  return out;
};

export const weeklyChallenges = (week: string): WeeklyChallenge[] => pick3(`w${week}`, WEEKLY_POOL);

export function weeklyFor(p: Progress, now: number): Weekly {
  const week = weekKey(now);
  return p.weekly.week === week ? p.weekly : { week, done: [], prog: {} };
}

/** Milliseconds until next Monday, local time. */
export function msToNextWeek(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 7 - ((d.getDay() + 6) % 7));
  return d.getTime() - now;
}

/** The local calendar day, so challenges change at the player's own midnight. */
export function dayKey(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Today's three challenges. The same for everyone on the same day. */
export function dailyChallenges(day: string): DailyChallenge[] {
  let h = 2166136261;
  for (let i = 0; i < day.length; i++) h = Math.imul(h ^ day.charCodeAt(i), 16777619) >>> 0;
  const pool = [...DAILY_POOL];
  const out: DailyChallenge[] = [];
  while (out.length < 3) {
    h = (Math.imul(h, 1103515245) + 12345) >>> 0;
    out.push(pool.splice(h % pool.length, 1)[0]);
  }
  return out;
}

/** Today's daily state, rolled over if the stored day has passed. */
export function dailyFor(p: Progress, now: number): Daily {
  const day = dayKey(now);
  if (p.daily.day === day) return p.daily;
  const yesterday = dayKey(now - 864e5);
  return { day, done: [], first: false, streak: p.daily.day === yesterday ? p.daily.streak : 0 };
}

/** Milliseconds until the next local midnight. */
export function msToMidnight(now: number): number {
  const d = new Date(now);
  d.setHours(24, 0, 0, 0);
  return d.getTime() - now;
}

export interface MatchOutcome {
  progress: Progress;
  xp: XpBreakdown;
  /** First match of the day and daily challenges, paid on top of match XP. */
  bonuses: XpLine[];
  achievements: Achievement[];
  /** Match XP plus achievement XP. */
  gained: number;
  before: LevelInfo;
  after: LevelInfo;
  newRewards: Reward[];
}

/** Records one finished match. Returns a new document; the input is not changed. */
export function applyMatch(prev: Progress, r: MatchReport, now = Date.now()): MatchOutcome {
  const p = sanitizeProgress(JSON.parse(JSON.stringify(prev)));
  const before = levelInfo(p.xp);
  const s = p.stats;
  s.matches++;
  s.kills += r.kills;
  s.cities += r.cities;
  s.booms += r.booms;
  s.boats += r.boats;
  if (r.place <= 3) s.podiums++;
  s.peakLand = Math.max(s.peakLand, Math.round(r.peakShare * 1000) / 10);
  if (r.won) {
    s.wins++;
    s.winsBy[r.difficulty] = (s.winsBy[r.difficulty] ?? 0) + 1;
    s.winsBy[r.map] = (s.winsBy[r.map] ?? 0) + 1;
    // Whole seconds, rounded down, exactly as the results screen shows the time.
    const sec = Math.floor(r.seconds);
    s.bestWinSec = s.bestWinSec > 0 ? Math.min(s.bestWinSec, sec) : sec;
  }
  const xp = matchXp(r);
  p.xp += xp.total;
  const bonuses: XpLine[] = [];
  const daily = dailyFor(p, now);
  if (!daily.first) {
    daily.first = true;
    daily.streak += 1;
    bonuses.push({ label: daily.streak > 1 ? `First match today (day ${daily.streak} streak)` : 'First match today', xp: firstMatchXp(daily.streak) });
  }
  for (const c of dailyChallenges(daily.day)) {
    if (daily.done.includes(c.id) || !c.check(r)) continue;
    daily.done.push(c.id);
    bonuses.push({ label: `Daily: ${c.name}`, xp: DAILY_XP });
  }
  p.daily = daily;
  const weekly = weeklyFor(p, now);
  weekly.prog = { ...weekly.prog };
  for (const c of weeklyChallenges(weekly.week)) {
    if (weekly.done.includes(c.id)) continue;
    weekly.prog[c.id] = (weekly.prog[c.id] ?? 0) + c.add(r);
    if (weekly.prog[c.id] < c.goal) continue;
    weekly.done = [...weekly.done, c.id];
    bonuses.push({ label: `Weekly: ${c.name}`, xp: WEEKLY_XP });
  }
  p.weekly = weekly;
  for (const b of bonuses) p.xp += b.xp;
  const earned: Achievement[] = [];
  // Achievement XP can level you up, which can unlock collection achievements, so settle in a few passes.
  for (let pass = 0; pass < 3; pass++) {
    for (const a of ACHIEVEMENTS) {
      if (p.achievements[a.id] || !a.check(r, p)) continue;
      p.achievements[a.id] = now;
      p.xp += a.xp;
      earned.push(a);
    }
  }
  // Fill empty showcase slots with fresh achievements, so a new profile is never bare.
  for (const a of earned) if (p.equipped.showcase.length < 3 && !p.equipped.showcase.includes(a.id)) p.equipped.showcase.push(a.id);
  const after = levelInfo(p.xp);
  const newRewards = TRACK.filter((rw) => rw.level > before.level && rw.level <= after.level);
  // A new title or frame goes on straight away, so it is seen. The profile can change it back.
  for (const rw of newRewards) {
    if (rw.kind === 'title') p.equipped.title = rw.id;
    if (rw.kind === 'frame') p.equipped.frame = rw.id;
  }
  return { progress: p, xp, bonuses, achievements: earned, gained: p.xp - prev.xp, before, after, newRewards };
}
