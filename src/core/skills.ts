import type { Mods } from './nations';

/** A special skill: one small, always-on bonus you equip before a match. Unlocked through the battle pass. */
export interface Skill {
  id: string;
  name: string;
  /** Exactly what it does, with the real number. */
  desc: string;
  icon: string;
  /** Tile colour, so each skill is recognisable at a glance. */
  color: string;
  apply(m: Mods): void;
}

export const SKILLS: Skill[] = [
  { id: 'lucky', name: 'Lucky Start', desc: 'Start the match with +150 gold.', icon: 'coin', color: '#c9902a', apply: (m) => { m.startGold += 150; } },
  { id: 'boots', name: 'Brisk Boots', desc: 'Your armies advance 10% faster.', icon: 'shoe', color: '#e2584a', apply: (m) => { m.attackSpeed *= 1.1; } },
  { id: 'skin', name: 'Thick Skin', desc: 'Your land is 10% harder to take.', icon: 'shield', color: '#3f79d8', apply: (m) => { m.defense *= 1.1; } },
  { id: 'tax', name: 'Tax Collector', desc: '+10% gold income.', icon: 'tophat', color: '#2f9e64', apply: (m) => { m.gold *= 1.1; } },
  { id: 'spurt', name: 'Growth Spurt', desc: 'Troops grow 8% faster.', icon: 'baby', color: '#e07ab8', apply: (m) => { m.growth *= 1.08; } },
  { id: 'walls', name: 'Cheap Walls', desc: 'Forts, barracks and markets cost 15% less.', icon: 'fort', color: '#8a7a6a', apply: (m) => { m.buildCost *= 0.85; } },
  { id: 'sea', name: 'Sea Legs', desc: 'Boats 30% faster, Airdrops 20% cheaper.', icon: 'boat', color: '#2aa7c9', apply: (m) => { m.boatSpeed *= 1.3; m.paraCost *= 0.8; } },
  { id: 'bang', name: 'Big Bang', desc: 'Big Boom 15% cheaper and 10% wider.', icon: 'bomb', color: '#e0702a', apply: (m) => { m.bombCost *= 0.85; m.bombRadius *= 1.1; } },
];

export const skillById = (id: string | null | undefined): Skill | undefined => SKILLS.find((s) => s.id === id);
