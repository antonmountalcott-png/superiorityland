import type { Mods } from './nations';

export interface Card {
  id: string;
  name: string;
  desc: string;
  icon: string;
  tag: 'attack' | 'defend' | 'grow' | 'gold' | 'special' | 'gamble';
  apply: (m: Mods) => void;
}

/** Doctrine cards: each is one plain sentence, each visibly changes how you should play. */
export const CARDS: Card[] = [
  { id: 'thunder', name: 'Rolling Thunder', desc: 'Armies advance 35% faster.', icon: 'bolt', tag: 'attack', apply: (m) => { m.attackSpeed *= 1.35; } },
  { id: 'bayonets', name: 'Pointy Sticks', desc: 'Attacks are 22% stronger.', icon: 'sword', tag: 'attack', apply: (m) => { m.attackPower *= 1.22; } },
  { id: 'goats', name: 'Mountain Goats', desc: 'Terrain slows and costs you far less.', icon: 'peak', tag: 'attack', apply: (m) => { m.terrainEase = Math.max(m.terrainEase, 0) + 0.45; } },
  { id: 'trench', name: 'Trench Enthusiasts', desc: 'Your land is 30% harder to take.', icon: 'shield', tag: 'defend', apply: (m) => { m.defense *= 1.3; } },
  { id: 'knockoff', name: 'Fort Knockoff', desc: 'Forts are 45% tougher and buildings 25% cheaper.', icon: 'fort', tag: 'defend', apply: (m) => { m.fortPower *= 1.45; m.buildCost *= 0.75; } },
  { id: 'laststand', name: 'Cornered Ball', desc: 'Below 30% troops, your defence doubles.', icon: 'heart', tag: 'defend', apply: (m) => { m.lastStand = 1; } },
  { id: 'babyboom', name: 'Baby Boom', desc: 'Troops grow 25% faster.', icon: 'baby', tag: 'grow', apply: (m) => { m.growth *= 1.25; } },
  { id: 'bunks', name: 'Bunk Beds', desc: 'Troop cap +25%.', icon: 'bed', tag: 'grow', apply: (m) => { m.cap *= 1.25; } },
  { id: 'hats', name: 'Hat Tax', desc: 'Gold income +40%.', icon: 'tophat', tag: 'gold', apply: (m) => { m.gold *= 1.4; } },
  { id: 'cities', name: 'Tourist Traps', desc: 'Cities pay 3x gold.', icon: 'city', tag: 'gold', apply: (m) => { m.cityGold *= 3; } },
  { id: 'bigstick', name: 'Bigger Boom', desc: 'Big Boom is 40% wider and 25% cheaper.', icon: 'bomb', tag: 'special', apply: (m) => { m.bombRadius *= 1.4; m.bombCost *= 0.75; } },
  { id: 'looters', name: 'Finders Keepers', desc: 'Every bit of enemy land you take pays you gold.', icon: 'bag', tag: 'gold', apply: (m) => { m.loot += 0.14; } },
  { id: 'peace', name: 'Peace Dividend', desc: 'Gold income doubles during any truce.', icon: 'handshake', tag: 'gold', apply: (m) => { m.peaceGold += 1; } },
  { id: 'glass', name: 'All Gas, No Brakes', desc: 'Attacks 35% stronger, but defence 25% weaker.', icon: 'flame', tag: 'gamble', apply: (m) => { m.attackPower *= 1.35; m.defense *= 0.75; } },
  { id: 'conscripts', name: 'Everybody Enlists', desc: 'Troops grow 40% faster, but attack 15% weaker.', icon: 'helmet', tag: 'gamble', apply: (m) => { m.growth *= 1.4; m.attackPower *= 0.85; } },
  { id: 'treasury', name: 'Sell the Furniture', desc: 'Gold income +70%, but troop cap 15% lower.', icon: 'chair', tag: 'gamble', apply: (m) => { m.gold *= 1.7; m.cap *= 0.85; } },
  { id: 'sprint', name: 'No Time for Lunch', desc: 'Armies 50% faster, but troops grow 15% slower.', icon: 'shoe', tag: 'gamble', apply: (m) => { m.attackSpeed *= 1.5; m.growth *= 0.85; } },
  { id: 'bathtubs', name: 'Navy of Bathtubs', desc: 'Boats 50% faster, Airdrops 30% cheaper.', icon: 'boat', tag: 'special', apply: (m) => { m.boatSpeed *= 1.5; m.paraCost *= 0.7; } },
];

export const cardById = (id: string): Card => CARDS.find((c) => c.id === id) ?? CARDS[0];
