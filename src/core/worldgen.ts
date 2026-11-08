import { Terrain, isLandTerrain } from './balance';
import { Rng } from './rng';

export type MapType = 'continents' | 'pangaea' | 'archipelago';

export interface Poi {
  id: number;
  kind: 'city' | 'mine';
  cell: number;
  name: string;
}

export interface World {
  w: number;
  h: number;
  seed: number;
  type: MapType;
  terrain: Uint8Array;
  elevation: Float32Array;
  moisture: Float32Array;
  /** Signed distance to the coast in cells: positive on land. */
  shore: Float32Array;
  /** Connected land region id per cell, -1 on water. */
  landmass: Int16Array;
  landmassSizes: number[];
  landCells: number;
  pois: Poi[];
  rivers: number[][];
}

const CITY_A = ['Butter', 'Grump', 'Snoot', 'Wobble', 'Noodle', 'Pompous', 'Crumb', 'Sprocket', 'Pudding', 'Smug', 'Dumpling', 'Mumble', 'Fizz', 'Biscuit', 'Tumble', 'Gravy'];
const CITY_B = ['ton', 'ville', 'burg', ' Heights', 'shire', ' Falls', 'mouth', 'grad', ' Bay', 'stead', 'polis', ' Hollow'];

function makeNoise(seed: number) {
  const rng = new Rng(seed);
  const size = 256;
  const table = new Float32Array(size * size);
  for (let i = 0; i < table.length; i++) table[i] = rng.next();
  return (x: number, y: number): number => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    const u = fx * fx * (3 - 2 * fx);
    const v = fy * fy * (3 - 2 * fy);
    const at = (a: number, b: number) => table[(a & 255) + (b & 255) * size];
    const top = at(xi, yi) * (1 - u) + at(xi + 1, yi) * u;
    const bot = at(xi, yi + 1) * (1 - u) + at(xi + 1, yi + 1) * u;
    return top * (1 - v) + bot * v;
  };
}

function fbm(n: (x: number, y: number) => number, x: number, y: number, octaves: number): number {
  let amp = 0.5;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += n(x * freq, y * freq) * amp;
    norm += amp;
    amp *= 0.52;
    freq *= 2.03;
  }
  return sum / norm;
}

const percentile = (arr: number[], p: number): number => {
  const sorted = arr.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
};

/** Two-pass chamfer distance transform: distance from every cell to the nearest `seed` cell. */
function distanceTo(w: number, h: number, isSeed: (i: number) => boolean): Float32Array {
  const d = new Float32Array(w * h);
  const INF = 1e6;
  for (let i = 0; i < d.length; i++) d[i] = isSeed(i) ? 0 : INF;
  const D = 1;
  const E = Math.SQRT2;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = x + y * w;
      d[i] = Math.min(d[i], d[i - 1] + D, d[i - w] + D, d[i - w - 1] + E, d[i - w + 1] + E);
    }
  }
  for (let y = h - 2; y > 0; y--) {
    for (let x = w - 2; x > 0; x--) {
      const i = x + y * w;
      d[i] = Math.min(d[i], d[i + 1] + D, d[i + w] + D, d[i + w + 1] + E, d[i + w - 1] + E);
    }
  }
  // The passes skip the outermost ring; continue the gradient out to it so the edge is not infinite.
  for (let x = 0; x < w; x++) {
    d[x] = d[x + w] + D;
    d[x + (h - 1) * w] = d[x + (h - 2) * w] + D;
  }
  for (let y = 0; y < h; y++) {
    d[y * w] = d[1 + y * w] + D;
    d[w - 1 + y * w] = d[w - 2 + y * w] + D;
  }
  return d;
}

export function generateWorld(seed: number, type: MapType = 'continents', w = 480, h = 300): World {
  const rng = new Rng(seed);
  const nA = makeNoise(rng.int(1e9));
  const nB = makeNoise(rng.int(1e9));
  const nC = makeNoise(rng.int(1e9));
  const nM = makeNoise(rng.int(1e9));

  const size = w * h;
  const raw = new Float32Array(size);
  const moisture = new Float32Array(size);

  // Continent mass: gaussian blobs placed per map type.
  const blobs: { x: number; y: number; rx: number; ry: number; a: number }[] = [];
  if (type === 'pangaea') {
    blobs.push({ x: 0, y: 0, rx: 0.86, ry: 0.84, a: 1.15 });
    for (let i = 0; i < 3; i++) blobs.push({ x: rng.range(-0.55, 0.55), y: rng.range(-0.5, 0.5), rx: 0.42, ry: 0.42, a: 0.32 });
  } else if (type === 'continents') {
    const angle = rng.range(0, Math.PI * 2);
    const cx = Math.cos(angle) * 0.46;
    const cy = Math.sin(angle) * 0.34;
    blobs.push({ x: cx, y: cy, rx: 0.56, ry: 0.62, a: 1 });
    blobs.push({ x: -cx, y: -cy, rx: 0.56, ry: 0.62, a: 1 });
    blobs.push({ x: cy, y: -cx * 0.6, rx: 0.3, ry: 0.32, a: 0.72 });
  } else {
    const count = 7;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rng.range(-0.3, 0.3);
      const r = i === 0 ? 0 : rng.range(0.42, 0.72);
      blobs.push({ x: Math.cos(a) * r, y: Math.sin(a) * r * 0.86, rx: rng.range(0.26, 0.36), ry: rng.range(0.28, 0.4), a: 1 });
    }
  }

  const channel = type === 'pangaea' ? 0 : type === 'continents' ? 0.3 : 0.24;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x / w) * 2 - 1;
      const ny = (y / h) * 2 - 1;
      const sx = x * 0.012;
      const sy = y * 0.012;
      // Domain warp gives organic coastlines rather than noise blobs.
      const wx = (fbm(nB, sx + 3.1, sy + 7.7, 3) - 0.5) * 0.46;
      const wy = (fbm(nC, sx + 9.2, sy + 1.3, 3) - 0.5) * 0.46;
      const base = fbm(nA, sx + wx * 3, sy + wy * 3, 5);
      let mass = 0;
      let near1 = Infinity;
      let near2 = Infinity;
      for (const b of blobs) {
        const dx = (nx + wx - b.x) / b.rx;
        const dy = (ny + wy - b.y) / b.ry;
        const d2 = dx * dx + dy * dy;
        mass = Math.max(mass, b.a * Math.exp(-d2));
        const d = Math.sqrt(d2);
        if (d < near1) {
          near2 = near1;
          near1 = d;
        } else if (d < near2) {
          near2 = d;
        }
      }
      // Ridged noise forms mountain chains, which act as natural walls.
      const ridgeN = fbm(nC, sx * 1.35 + 40, sy * 1.35 + 11, 4);
      const ridge = 1 - Math.abs(ridgeN * 2 - 1);
      const r = Math.pow(ridge, 6) * 0.3 * Math.min(1, mass * 1.5);
      const edge = Math.min(1, Math.min(x, w - 1 - x, y, h - 1 - y) / 22);
      // Separate land masses: sink a strait wherever a cell is about equally close to two of them.
      // Without this, noise bridges every gap and all maps come out as one continent.
      let strait = 1;
      if (channel > 0 && near2 !== Infinity) {
        const gap = (near2 - near1) / channel;
        strait = gap >= 1 ? 1 : gap * gap * (3 - 2 * gap);
      }
      raw[x + y * w] = (base * 0.5 + mass * 0.72 + r) * edge * strait;
      moisture[x + y * w] = fbm(nM, x * 0.016 + 5, y * 0.016 + 5, 4);
    }
  }

  const landTarget = type === 'pangaea' ? 0.56 : type === 'continents' ? 0.5 : 0.4;
  const sample: number[] = [];
  for (let i = 0; i < size; i += 7) sample.push(raw[i]);
  const sea = percentile(sample, 1 - landTarget);

  const terrain = new Uint8Array(size);
  const elevation = new Float32Array(size);
  let maxE = sea + 1e-3;
  for (let i = 0; i < size; i++) if (raw[i] > maxE) maxE = raw[i];
  for (let i = 0; i < size; i++) {
    elevation[i] = (raw[i] - sea) / (maxE - sea);
    terrain[i] = elevation[i] > 0 ? Terrain.Plains : Terrain.Deep;
  }
  for (let x = 0; x < w; x++) {
    terrain[x] = terrain[x + (h - 1) * w] = Terrain.Deep;
    terrain[x + w] = terrain[x + (h - 2) * w] = Terrain.Deep;
  }
  for (let y = 0; y < h; y++) {
    terrain[y * w] = terrain[w - 1 + y * w] = Terrain.Deep;
    terrain[1 + y * w] = terrain[w - 2 + y * w] = Terrain.Deep;
  }

  // Flood fill both land and water regions; drop tiny islands and fill tiny ponds.
  const floodRegions = (matches: (i: number) => boolean): number[][] => {
    const seen = new Uint8Array(size);
    const regions: number[][] = [];
    const stack: number[] = [];
    for (let i = 0; i < size; i++) {
      if (seen[i] || !matches(i)) continue;
      const cells: number[] = [];
      stack.push(i);
      seen[i] = 1;
      while (stack.length) {
        const c = stack.pop() as number;
        cells.push(c);
        for (const n of [c - 1, c + 1, c - w, c + w]) {
          if (n >= 0 && n < size && !seen[n] && matches(n)) {
            seen[n] = 1;
            stack.push(n);
          }
        }
      }
      regions.push(cells);
    }
    return regions;
  };

  for (const region of floodRegions((i) => isLandTerrain(terrain[i]))) {
    if (region.length < 70) for (const c of region) terrain[c] = Terrain.Deep;
  }
  for (const region of floodRegions((i) => !isLandTerrain(terrain[i]))) {
    if (region.length < 40) for (const c of region) terrain[c] = Terrain.Plains;
  }

  // Terrain classes by percentile so every seed has a similar mix.
  const landE: number[] = [];
  const landM: number[] = [];
  for (let i = 0; i < size; i++) {
    if (isLandTerrain(terrain[i])) {
      landE.push(elevation[i]);
      landM.push(moisture[i]);
    }
  }
  const eHills = percentile(landE, 0.72);
  const eMountain = percentile(landE, 0.9);
  const mForest = percentile(landM, 0.66);
  const mDesert = percentile(landM, 0.13);

  for (let i = 0; i < size; i++) {
    if (!isLandTerrain(terrain[i])) continue;
    const e = elevation[i];
    if (e >= eMountain) terrain[i] = Terrain.Mountain;
    else if (e >= eHills) terrain[i] = Terrain.Hills;
    else if (moisture[i] >= mForest) terrain[i] = Terrain.Forest;
    else if (moisture[i] <= mDesert) terrain[i] = Terrain.Desert;
    else terrain[i] = Terrain.Plains;
  }

  // Rivers run downhill from high ground; crossing one is slow, so they make soft borders.
  const rivers: number[][] = [];
  const high: number[] = [];
  for (let i = 0; i < size; i++) if (terrain[i] === Terrain.Hills) high.push(i);
  const riverCount = type === 'archipelago' ? 5 : 11;
  for (let r = 0; r < riverCount * 3 && rivers.length < riverCount && high.length; r++) {
    let c = rng.pick(high);
    const path: number[] = [c];
    const seen = new Set<number>([c]);
    let reached = false;
    for (let step = 0; step < 240; step++) {
      let best = -1;
      let bestE = Infinity;
      for (const n of [c - 1, c + 1, c - w, c + w]) {
        if (seen.has(n)) continue;
        const score = (isLandTerrain(terrain[n]) ? elevation[n] : -1) + rng.next() * 0.02;
        if (score < bestE) {
          bestE = score;
          best = n;
        }
      }
      if (best < 0) break;
      c = best;
      seen.add(c);
      path.push(c);
      if (!isLandTerrain(terrain[c])) {
        reached = true;
        break;
      }
    }
    const startCell = path[0];
    const endCell = path[path.length - 1];
    const directDist = Math.hypot((startCell % w) - (endCell % w), ((startCell / w) | 0) - ((endCell / w) | 0));
    if (reached && path.length >= 22 && path.length <= directDist * 2.1) {
      rivers.push(path);
      for (const cell of path) {
        if (isLandTerrain(terrain[cell]) && terrain[cell] !== Terrain.Mountain) terrain[cell] = Terrain.River;
      }
    }
  }

  // Beaches.
  for (let i = w; i < size - w; i++) {
    const t = terrain[i];
    if (t === Terrain.Plains || t === Terrain.Forest || t === Terrain.Desert) {
      if (!isLandTerrain(terrain[i - 1]) || !isLandTerrain(terrain[i + 1]) || !isLandTerrain(terrain[i - w]) || !isLandTerrain(terrain[i + w])) {
        terrain[i] = Terrain.Sand;
      }
    }
  }

  // Final landmass ids (rivers are land, so they do not split regions).
  const landmass = new Int16Array(size).fill(-1);
  const landmassSizes: number[] = [];
  let landCells = 0;
  for (const region of floodRegions((i) => isLandTerrain(terrain[i]))) {
    const id = landmassSizes.length;
    landmassSizes.push(region.length);
    landCells += region.length;
    for (const c of region) landmass[c] = id;
  }

  // Signed distance to coast, softened so the shader draws smooth shorelines.
  const toWater = distanceTo(w, h, (i) => !isLandTerrain(terrain[i]));
  const toLand = distanceTo(w, h, (i) => isLandTerrain(terrain[i]));
  const sdRaw = new Float32Array(size);
  for (let i = 0; i < size; i++) sdRaw[i] = isLandTerrain(terrain[i]) ? toWater[i] - 0.5 : -(toLand[i] - 0.5);
  const shore = new Float32Array(size);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) {
        shore[x + y * w] = sdRaw[x + y * w];
        continue;
      }
      const i = x + y * w;
      shore[i] = (sdRaw[i] * 4 + (sdRaw[i - 1] + sdRaw[i + 1] + sdRaw[i - w] + sdRaw[i + w]) * 2 +
        sdRaw[i - w - 1] + sdRaw[i - w + 1] + sdRaw[i + w - 1] + sdRaw[i + w + 1]) / 16;
    }
  }

  // Shallows for boats' visuals and terrain lookups.
  for (let i = 0; i < size; i++) if (!isLandTerrain(terrain[i]) && toLand[i] < 5) terrain[i] = Terrain.Shallow;

  // Points of interest.
  const pois: Poi[] = [];
  const dist2 = (a: number, b: number) => {
    const ax = a % w, ay = (a / w) | 0, bx = b % w, by = (b / w) | 0;
    return (ax - bx) ** 2 + (ay - by) ** 2;
  };
  const place = (kind: Poi['kind'], count: number, minDist: number, ok: (i: number) => boolean) => {
    let placed = 0;
    for (let tries = 0; tries < 8000 && placed < count; tries++) {
      const c = rng.int(size);
      if (!isLandTerrain(terrain[c]) || !ok(c) || toWater[c] < 3) continue;
      if (landmassSizes[landmass[c]] < 180) continue;
      if (pois.some((p) => dist2(p.cell, c) < minDist * minDist)) continue;
      const name = kind === 'city' ? `${rng.pick(CITY_A)}${rng.pick(CITY_B)}` : 'Gold Mine';
      pois.push({ id: pois.length, kind, cell: c, name });
      placed++;
    }
  };
  const area = (w * h) / 144000;
  place('city', Math.round(20 * area), 25, (i) => terrain[i] === Terrain.Plains || terrain[i] === Terrain.Desert);
  place('mine', Math.round(12 * area), 26, (i) => terrain[i] === Terrain.Hills);

  return { w, h, seed, type, terrain, elevation, moisture, shore, landmass, landmassSizes, landCells, pois, rivers };
}

/** Well-separated starting positions, biased toward open ground on sizeable landmasses. */
export function pickSpawns(world: World, count: number, rng: Rng, taken: number[] = []): number[] {
  const { w, h, terrain, landmass, landmassSizes } = world;
  const good: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if ((terrain[i] === Terrain.Plains || terrain[i] === Terrain.Forest || terrain[i] === Terrain.Desert) &&
      landmassSizes[landmass[i]] >= 400 && world.shore[i] > 3) good.push(i);
  }
  const chosen: number[] = [...taken];
  const out: number[] = [];
  const d2 = (a: number, b: number) => ((a % w) - (b % w)) ** 2 + (((a / w) | 0) - ((b / w) | 0)) ** 2;
  for (let n = 0; n < count && good.length; n++) {
    let best = good[rng.int(good.length)];
    let bestD = -1;
    for (let t = 0; t < 40; t++) {
      const c = good[rng.int(good.length)];
      let m = Infinity;
      for (const o of chosen) m = Math.min(m, d2(c, o));
      if (m > bestD) {
        bestD = m;
        best = c;
      }
    }
    chosen.push(best);
    out.push(best);
  }
  return out;
}
