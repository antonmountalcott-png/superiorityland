/** Every nation in the game is fictional and original to this project. */

export type FlagPattern =
  | 'hTri' | 'vTri' | 'hBi' | 'vBi' | 'cross' | 'saltire' | 'disc' | 'star'
  | 'chevron' | 'diag' | 'sun' | 'checker' | 'stripes' | 'canton' | 'ring' | 'wave';

export type Hat =
  | 'crown' | 'chef' | 'horns' | 'beret' | 'beanie' | 'sailor' | 'tophat' | 'bowler'
  | 'party' | 'cap' | 'viking' | 'tricorn' | 'cowboy' | 'propeller' | 'wizard' | 'fedora'
  | 'nemes' | 'spartan' | 'laurel' | 'furhat' | 'bicorne' | 'imperial';

export type Accessory = 'monocle' | 'moustache' | 'shades' | 'bowtie' | 'eyepatch' | 'none';

export interface Mods {
  attackPower: number;
  attackSpeed: number;
  defense: number;
  growth: number;
  gold: number;
  cap: number;
  boatSpeed: number;
  boatLoss: number;
  terrainEase: number;
  bombCost: number;
  bombRadius: number;
  buildCost: number;
  fortPower: number;
  paraLoss: number;
  paraCost: number;
  lastStand: number;
  startTroops: number;
  cityGold: number;
  /** Gold earned per enemy cell taken. */
  loot: number;
  /** Extra gold income fraction while at least one truce is running. */
  peaceGold: number;
  /** Gold in the treasury on the first tick. */
  startGold: number;
}

export const defaultMods = (): Mods => ({
  attackPower: 1,
  attackSpeed: 1,
  defense: 1,
  growth: 1,
  gold: 1,
  cap: 1,
  boatSpeed: 1,
  boatLoss: 1,
  terrainEase: 0,
  bombCost: 1,
  bombRadius: 1,
  buildCost: 1,
  fortPower: 1,
  paraLoss: 1,
  paraCost: 1,
  lastStand: 0,
  startTroops: 1,
  cityGold: 1,
  loot: 0,
  peaceGold: 0,
  startGold: 0,
});

export interface Perk {
  name: string;
  desc: string;
  apply: (m: Mods) => void;
}

export interface Nation {
  id: string;
  name: string;
  /** Territory colour. Chosen to stay distinct across a full lobby. */
  fill: string;
  flag: { pattern: FlagPattern; colors: string[] };
  hat: Hat;
  acc: Accessory;
  motto: string;
  perk: Perk;
}

export const NATIONS: Nation[] = [
  {
    id: 'superiorityland', name: 'Superiorityland', fill: '#8a4dff',
    flag: { pattern: 'star', colors: ['#7a3ff0', '#ffd23f', '#5a23c8'] },
    hat: 'crown', acc: 'monocle', motto: 'We are better. We checked.',
    perk: { name: 'Inherent Superiority', desc: '+7% attack, defence, growth and gold', apply: (m) => {
      m.attackPower *= 1.07; m.defense *= 1.07; m.growth *= 1.07; m.gold *= 1.07;
    } },
  },
  {
    id: 'toastria', name: 'Toastria', fill: '#f09a32',
    flag: { pattern: 'hTri', colors: ['#f09a32', '#fff1cf', '#b9591a'] },
    hat: 'chef', acc: 'none', motto: 'Crispy on the outside. Also inside.',
    perk: { name: 'Golden Crust', desc: '+35% gold income', apply: (m) => { m.gold *= 1.35; } },
  },
  {
    id: 'mooland', name: 'Mooland', fill: '#1f9a2e',
    flag: { pattern: 'disc', colors: ['#1f9a2e', '#ffffff', '#1f1f1f'] },
    hat: 'horns', acc: 'bowtie', motto: 'Grass is greener here. We ate the rest.',
    perk: { name: 'Plenty of Calves', desc: '+15% troop growth', apply: (m) => { m.growth *= 1.15; } },
  },
  {
    id: 'moustachia', name: 'Moustachia', fill: '#e8323e',
    flag: { pattern: 'hBi', colors: ['#e8323e', '#ffffff'] },
    hat: 'beret', acc: 'moustache', motto: 'Fear the whiskers.',
    perk: { name: 'Menacing Whiskers', desc: '+18% attack power', apply: (m) => { m.attackPower *= 1.18; } },
  },
  {
    id: 'sockovia', name: 'Sockovia', fill: '#2f62ea',
    flag: { pattern: 'stripes', colors: ['#2f62ea', '#ffffff'] },
    hat: 'beanie', acc: 'none', motto: 'Warm feet. Cold shoulder.',
    perk: { name: 'Cozy Walls', desc: '+25% defence', apply: (m) => { m.defense *= 1.25; } },
  },
  {
    id: 'duckmark', name: 'Duckmark', fill: '#e0d030',
    flag: { pattern: 'cross', colors: ['#e0d030', '#26231c', '#ff8a00'] },
    hat: 'sailor', acc: 'none', motto: 'Water off our backs.',
    perk: { name: 'Natural Swimmers', desc: 'Boats 60% faster and lose no troops', apply: (m) => {
      m.boatSpeed *= 1.6; m.boatLoss = 0;
    } },
  },
  {
    id: 'pickleton', name: 'Pickleton', fill: '#8fcf2c',
    flag: { pattern: 'vBi', colors: ['#8fcf2c', '#3d5a00'] },
    hat: 'tophat', acc: 'monocle', motto: 'Kind of a big dill.',
    perk: { name: 'Sure Footed', desc: 'Terrain slows and costs you 50% less', apply: (m) => { m.terrainEase = 0.5; } },
  },
  {
    id: 'waffleburg', name: 'Waffleburg', fill: '#8a4216',
    flag: { pattern: 'checker', colors: ['#8a4216', '#7d4c20'] },
    hat: 'bowler', acc: 'moustache', motto: 'Our logistics have pockets.',
    perk: { name: 'Grid Logistics', desc: 'Armies advance 28% faster', apply: (m) => { m.attackSpeed *= 1.28; } },
  },
  {
    id: 'llamadonia', name: 'Llamadonia', fill: '#e08fd0',
    flag: { pattern: 'chevron', colors: ['#e08fd0', '#ffffff', '#b8246f'] },
    hat: 'party', acc: 'none', motto: 'We spit first.',
    perk: { name: 'Long Range Spit', desc: 'Big Boom costs 35% less', apply: (m) => { m.bombCost *= 0.65; } },
  },
  {
    id: 'turnipia', name: 'Turnipia', fill: '#cc37c2',
    flag: { pattern: 'vTri', colors: ['#cc37c2', '#ffffff', '#7bc043'] },
    hat: 'cap', acc: 'none', motto: 'Root for us.',
    perk: { name: 'Thrifty Builders', desc: 'Buildings cost 30% less', apply: (m) => { m.buildCost *= 0.7; } },
  },
  {
    id: 'beanorra', name: 'Beanorra', fill: '#78e2a6',
    flag: { pattern: 'ring', colors: ['#78e2a6', '#ffffff', '#07705b'] },
    hat: 'propeller', acc: 'shades', motto: 'Full of beans and it shows.',
    perk: { name: 'Full of Beans', desc: 'Start with 70% more troops', apply: (m) => { m.startTroops *= 1.7; } },
  },
  {
    id: 'fjordia', name: 'Grand Fjordia', fill: '#5aa8ea',
    flag: { pattern: 'saltire', colors: ['#5aa8ea', '#ffffff'] },
    hat: 'viking', acc: 'none', motto: 'We arrive by sky. Surprise.',
    perk: { name: 'Air Cavalry', desc: 'Airdrops are cheaper and lose no troops', apply: (m) => {
      m.paraLoss = 0; m.paraCost *= 0.7;
    } },
  },
  {
    id: 'krakenia', name: 'Krakenia', fill: '#14707e',
    flag: { pattern: 'wave', colors: ['#14707e', '#bdf2ee'] },
    hat: 'tricorn', acc: 'eyepatch', motto: 'Arrr. Also, hello.',
    perk: { name: 'Sea Legs', desc: 'Boats 30% faster, +10% attack', apply: (m) => {
      m.boatSpeed *= 1.3; m.attackPower *= 1.1;
    } },
  },
  {
    id: 'bonkia', name: 'Bonkia', fill: '#94187f',
    flag: { pattern: 'diag', colors: ['#94187f', '#e7edf5', '#39424f'] },
    hat: 'fedora', acc: 'shades', motto: 'Bonk first. Diplomacy never.',
    perk: { name: 'Bonk Doctrine', desc: '+10% attack, +10% defence', apply: (m) => {
      m.attackPower *= 1.1; m.defense *= 1.1;
    } },
  },
  {
    id: 'spudland', name: 'Spudland', fill: '#9a5a6a',
    flag: { pattern: 'canton', colors: ['#9a5a6a', '#f0c98a', '#ffffff'] },
    hat: 'cowboy', acc: 'bowtie', motto: 'Hard to mash.',
    perk: { name: 'Deep Roots', desc: 'Troop cap +22%', apply: (m) => { m.cap *= 1.22; } },
  },
  {
    id: 'salmonia', name: 'Salmonia', fill: '#ff8f8f',
    flag: { pattern: 'sun', colors: ['#ff8f8f', '#ffc98a'] },
    hat: 'wizard', acc: 'none', motto: 'Always upstream. On principle.',
    perk: { name: 'Upstream', desc: '+7% growth, armies 12% faster', apply: (m) => {
      m.growth *= 1.07; m.attackSpeed *= 1.12;
    } },
  },
];

/**
 * Past empires, unlocked through the battle pass. Playful, original takes on history: no real flags or modern states.
 * Only the player can be an empire; bots always use the 16 balanced nations above.
 */
export const EMPIRES: Nation[] = [
  {
    id: 'pharaonia', name: 'Pharaonia', fill: '#d8a93b',
    flag: { pattern: 'hTri', colors: ['#d8a93b', '#2a54b8', '#f4e3b0'] },
    hat: 'nemes', acc: 'none', motto: 'Pyramid scheme? It is just a pyramid.',
    perk: { name: 'Pyramid Builders', desc: 'Cities pay 80% more gold, buildings 15% cheaper', apply: (m) => {
      m.cityGold *= 1.8; m.buildCost *= 0.85;
    } },
  },
  {
    id: 'spartaca', name: 'Spartaca', fill: '#b8322a',
    flag: { pattern: 'chevron', colors: ['#b8322a', '#f2d27a', '#5a0a17'] },
    hat: 'spartan', acc: 'none', motto: 'This is Spartaca. Mind the step.',
    perk: { name: 'Phalanx', desc: '+22% defence, +8% attack', apply: (m) => { m.defense *= 1.22; m.attackPower *= 1.08; } },
  },
  {
    id: 'romanum', name: 'Romanum Empire', fill: '#7b2d8b',
    flag: { pattern: 'disc', colors: ['#7b2d8b', '#f2c84b', '#4a1456'] },
    hat: 'laurel', acc: 'none', motto: 'All roads lead to us. We built them.',
    perk: { name: 'All Roads', desc: 'Armies advance 20% faster, +8% attack', apply: (m) => { m.attackSpeed *= 1.2; m.attackPower *= 1.08; } },
  },
  {
    id: 'khanate', name: 'Great Khanate', fill: '#4f7aa3',
    flag: { pattern: 'sun', colors: ['#4f7aa3', '#e8d27a'] },
    hat: 'furhat', acc: 'none', motto: 'We do not knock. We gallop.',
    perk: { name: 'Endless Steppe', desc: 'Armies 30% faster, terrain slows you 25% less', apply: (m) => {
      m.attackSpeed *= 1.3; m.terrainEase = Math.max(m.terrainEase, 0.25);
    } },
  },
  {
    id: 'bonapartia', name: 'Bonapartia', fill: '#253f8f',
    flag: { pattern: 'star', colors: ['#253f8f', '#f2c84b', '#16285e'] },
    hat: 'bicorne', acc: 'none', motto: 'Short temper. Long borders.',
    perk: { name: 'Grand Battery', desc: '+14% attack, Big Boom 25% cheaper', apply: (m) => { m.attackPower *= 1.14; m.bombCost *= 0.75; } },
  },
  {
    id: 'eternal', name: 'Eternal Superiority', fill: '#f0c02c',
    flag: { pattern: 'star', colors: ['#f0c02c', '#7a3ff0', '#b8860b'] },
    hat: 'imperial', acc: 'monocle', motto: 'Level 30. We checked twice.',
    perk: { name: 'Eternal Glory', desc: '+10% attack, defence, growth and gold', apply: (m) => {
      m.attackPower *= 1.1; m.defense *= 1.1; m.growth *= 1.1; m.gold *= 1.1;
    } },
  },
];

/** Every ball a player can pick: the 16 nations, then the empires. */
export const ALL_BALLS: Nation[] = [...NATIONS, ...EMPIRES];

export const isEmpire = (id: string): boolean => EMPIRES.some((n) => n.id === id);

export const nationById = (id: string): Nation => ALL_BALLS.find((n) => n.id === id) ?? NATIONS[0];

/** All lines are original. Picked at random by the renderer, never by the simulation. */
export const LINES = {
  attack: [
    'Border? What border?', 'Surprise annexation!', 'I come in peace. And pieces.', 'This is mine now.',
    'Your land looks better with me on it.', 'Is called "friendly visit".', 'Hold my flag.', 'Roll out!',
  ],
  attacked: [
    'Hey! Rude!', 'Why you roll on my lawn?', 'Strongly worded letter incoming!', 'This is unacceptable!',
    'I was using that!', 'Get off my land!', 'Excuse you!',
  ],
  city: ['Nice town. Mine.', 'I will rename it after me.', 'Taxes start now.', 'Cozy. I keep.'],
  capital: ['Your palace has my stuff in it now.', 'New throne, who dis?', 'Knock knock.'],
  capitalLost: ['My good chair!', 'That was load-bearing!', 'We move. Temporarily. Forever.'],
  truceYes: ['Fine. For now.', 'Pinky swear. No pinkies.', 'Deal. Do not make it weird.', 'Peace! ...for a bit.'],
  truceNo: ['Ha! No.', 'Truce? Never heard of her.', 'I think not.', 'Ask me never.'],
  eliminated: ['Tell my flag I love it.', 'I regret nothing. Mostly.', 'I was just resting anyway.', 'Unsubscribe.'],
  win: ['Superior. As predicted.', 'Told you.', 'I accept this world.'],
  boom: ['Big boom!', 'Oops. On purpose.', 'Fire in the hole!'],
  boat: ['Ahoy, future subjects!', 'Land ho!', 'Row harder!'],
  para: ['Geronimoooo!', 'Knock from above!', 'I can see your house!'],
};

/** Every nation gets its own voice, so the same jokes do not come round every match. */
export const BARKS: Record<string, string[]> = {
  superiorityland: ['I have checked. I am better.', 'Sorry, was that yours? It is improved now.', 'Kneel. It is good for posture.', 'My monocle has seen your defences. It laughed.'],
  toastria: ['You are toast. It is our whole thing.', 'Butter side up, boys!', 'Pop goes the border!', 'I smell burning. It is you.'],
  mooland: ['Moo. That means surrender.', 'This field is occupied. By me. Chewing.', 'Udderly mine.', 'We came for the grass.'],
  moustachia: ['The whiskers demand tribute!', 'I twirl, you tremble.', 'Bristle formation!', 'Nobody shaves my borders.'],
  sockovia: ['Prepare to be darned.', 'I lost one sock here. I am taking everything.', 'Knit and conquer.', 'Toes first, lads.'],
  duckmark: ['Quack means no.', 'Water off my back. Land off yours.', 'Get in line. In a row. Like ducklings.', 'I have bread and I am not afraid to use it.'],
  pickleton: ['You are in a pickle now.', 'Big dill coming through.', 'Relish the moment.', 'Brine time.'],
  waffleburg: ['Your land has too few squares.', 'Syrup logistics are excellent.', 'I will fill your every pocket.', 'Breakfast is served. You are breakfast.'],
  llamadonia: ['Ptoo!', 'Say that to my face. I dare you. Ptoo.', 'Party is at your house now.', 'I brought hats and violence.'],
  turnipia: ['Turnip for the books!', 'Root and branch, baby.', 'Nobody expects the turnip.', 'We grow on you. Literally.'],
  beanorra: ['Too many beans. Must invade.', 'I have not slept since the beans.', 'Vibrating with purpose.', 'Spill? I never spill.'],
  fjordia: ['Skål and goodbye.', 'Your coast looks raidable.', 'From above! Like weather!', 'We brought an axe to the picnic.'],
  krakenia: ['Arrr. Your land. My land. Arrr.', 'Release me. I am already released.', 'Eye patch sees all. Well, half.', 'Tentacles are coming. Metaphorically.'],
  bonkia: ['Bonk.', 'Diplomacy is a long word for bonk.', 'You have been selected for bonking.', 'I do not negotiate. I bonk.'],
  spudland: ['Hard to mash, friend.', 'Yeehaw, but quietly.', 'Eyes everywhere. Potato joke.', 'We are in it for the long boil.'],
  salmonia: ['Upstream! Always upstream!', 'I go against the flow and also you.', 'Spawning a new province.', 'Do not make me leap.'],
  pharaonia: ['Bow before the pointy building.', 'Your border is now a tomb. Sorry.', 'I have a pyramid for this.', 'Walk like you mean it.'],
  spartaca: ['Tonight we dine in your capital!', 'Phalanx! Shuffle forward!', 'Our shields are not for show.', 'Come and take it. Actually, we will.'],
  romanum: ['Veni, vidi, annexed.', 'Et tu, neighbour?', 'Building a road through your living room.', 'Bread, circuses, your land.'],
  khanate: ['Gallop! Gallop!', 'The steppe says hello.', 'We go very far, very fast.', 'Your walls are adorable.'],
  bonapartia: ['I am not short. The map is big.', 'Artillery says hello!', 'Hand in coat. Plan in hand.', 'An army marches on its stomach. Yours is lunch.'],
  eternal: ['Level 30. Bow.', 'I have checked forever. Still better.', 'Superiority, but shinier.', 'History ended. I won it.'],
};