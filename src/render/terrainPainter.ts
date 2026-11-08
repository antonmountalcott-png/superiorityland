import { Terrain, isLandTerrain } from '../core/balance';
import { Rng } from '../core/rng';
import type { World } from '../core/worldgen';

type RGB = [number, number, number];

// Muted, parchment-leaning land so saturated nation colours always read on top of it.
const LAND_COLORS: Record<number, RGB> = {
  [Terrain.Deep]: [214, 205, 160],
  [Terrain.Shallow]: [214, 205, 160],
  [Terrain.Sand]: [240, 225, 174],
  [Terrain.Plains]: [197, 208, 142],
  [Terrain.Desert]: [232, 210, 148],
  [Terrain.Forest]: [150, 180, 118],
  [Terrain.Hills]: [190, 178, 134],
  [Terrain.Mountain]: [152, 146, 142],
  [Terrain.River]: [176, 198, 142],
};

const hash = (x: number, y: number): number => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

/** Paints the land layer. Water is drawn live by the shader, so this only has to look right on land. */
export function paintLand(world: World, scale: number): HTMLCanvasElement {
  const { w, h, terrain, elevation, moisture } = world;
  const W = w * scale;
  const H = h * scale;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;

  // Per-cell colour, softened so terrain classes melt into each other.
  const size = w * h;
  let r = new Float32Array(size);
  let g = new Float32Array(size);
  let b = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const c = LAND_COLORS[terrain[i]];
    const tone = (moisture[i] - 0.5) * 34;
    r[i] = c[0] - tone * 0.6;
    g[i] = c[1] + tone * 0.2;
    b[i] = c[2] - tone * 0.4;
  }
  for (let pass = 0; pass < 2; pass++) {
    const r2 = new Float32Array(size);
    const g2 = new Float32Array(size);
    const b2 = new Float32Array(size);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = x + y * w;
        const l = x > 0 ? i - 1 : i;
        const rr = x < w - 1 ? i + 1 : i;
        const u = y > 0 ? i - w : i;
        const d = y < h - 1 ? i + w : i;
        r2[i] = (r[i] * 2 + r[l] + r[rr] + r[u] + r[d]) / 6;
        g2[i] = (g[i] * 2 + g[l] + g[rr] + g[u] + g[d]) / 6;
        b2[i] = (b[i] * 2 + b[l] + b[rr] + b[u] + b[d]) / 6;
      }
    }
    r = r2;
    g = g2;
    b = b2;
  }

  // Tiled grain, far cheaper than evaluating noise per pixel.
  const grainSize = 256;
  const grain = new Float32Array(grainSize * grainSize);
  for (let i = 0; i < grain.length; i++) grain[i] = hash(i % grainSize, (i / grainSize) | 0) - 0.5;

  const slopes = new Float32Array(size);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = x + y * w;
      slopes[i] = (elevation[i - 1] - elevation[i + 1] + elevation[i - w] - elevation[i + w]) * 0.5;
    }
  }

  const image = ctx.createImageData(W, H);
  const data = image.data;
  const inv = 1 / scale;
  for (let py = 0; py < H; py++) {
    const gy = (py + 0.5) * inv - 0.5;
    const y0 = Math.max(0, Math.min(h - 2, Math.floor(gy)));
    const fy = gy - y0;
    for (let px = 0; px < W; px++) {
      const gx = (px + 0.5) * inv - 0.5;
      const x0 = Math.max(0, Math.min(w - 2, Math.floor(gx)));
      const fx = gx - x0;
      const a = x0 + y0 * w;
      const bi = a + 1;
      const ci = a + w;
      const di = ci + 1;
      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;

      // Hillshade lit from the upper left, from slopes interpolated between cells (so no grid shows).
      const slope = slopes[a] * w00 + slopes[bi] * w10 + slopes[ci] * w01 + slopes[di] * w11;
      let shade = 1 + Math.max(-0.22, Math.min(0.22, slope * 3.6));

      const gr = grain[(px & 255) + (py & 255) * grainSize];
      // Smooth large-scale variation (a block-sampled version showed as a mosaic when zoomed in).
      const blotch = (Math.sin(px * 0.011 + Math.sin(py * 0.007) * 2.1) + Math.sin(py * 0.017 + px * 0.005)) * 0.25;
      shade *= 1 + gr * 0.025 + blotch * 0.06;

      const k = (py * W + px) * 4;
      data[k] = (r[a] * w00 + r[bi] * w10 + r[ci] * w01 + r[di] * w11) * shade;
      data[k + 1] = (g[a] * w00 + g[bi] * w10 + g[ci] * w01 + g[di] * w11) * shade;
      data[k + 2] = (b[a] * w00 + b[bi] * w10 + b[ci] * w01 + b[di] * w11) * shade;
      data[k + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);

  ctx.save();
  ctx.scale(scale, scale);
  const rng = new Rng(world.seed ^ 0x3c6ef372);
  paintRivers(ctx, world);
  paintScatter(ctx, world, rng);
  ctx.restore();
  return canvas;
}

function paintRivers(ctx: CanvasRenderingContext2D, world: World): void {
  const { w } = world;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const tracePath = (path: number[]) => {
    ctx.beginPath();
    const pts: [number, number][] = [];
    for (let i = 0; i < path.length; i += 2) pts.push([(path[i] % w) + 0.5, ((path[i] / w) | 0) + 0.5]);
    pts.push([(path[path.length - 1] % w) + 0.5, ((path[path.length - 1] / w) | 0) + 0.5]);
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2;
      const my = (pts[i][1] + pts[i + 1][1]) / 2;
      ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
    }
    ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
  };
  for (const path of world.rivers) {
    tracePath(path);
    ctx.strokeStyle = 'rgba(70,92,84,0.55)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    tracePath(path);
    ctx.strokeStyle = '#6cc0d8';
    ctx.lineWidth = 0.95;
    ctx.stroke();
  }
}

function paintScatter(ctx: CanvasRenderingContext2D, world: World, rng: Rng): void {
  const { w, h, terrain, moisture } = world;
  // Draw back to front so nearer scenery overlaps what is behind it.
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      const i = x + y * w;
      const t = terrain[i];
      if (!isLandTerrain(t)) continue;
      const roll = rng.next();
      const jx = x + rng.next();
      const jy = y + rng.next();
      if (t === Terrain.Forest && roll < 0.42) {
        if (moisture[i] > 0.56 || rng.next() < 0.5) conifer(ctx, jx, jy, 1.5 + rng.next() * 0.9);
        else roundTree(ctx, jx, jy, 1.1 + rng.next() * 0.6);
      } else if (t === Terrain.Mountain && roll < 0.04) {
        // Lone peaks, twin peaks and low crags, so a range never reads as one repeated stamp.
        const kind = rng.next();
        const s = 3.4 + rng.next() * 4.8;
        if (kind < 0.3) {
          peak(ctx, jx, jy, s, rng);
        } else if (kind < 0.55) {
          peak(ctx, jx - s * 0.42, jy - 0.3, s * 0.72, rng);
          peak(ctx, jx + s * 0.2, jy, s, rng);
        } else if (kind < 0.82) {
          crag(ctx, jx, jy, s * 1.1, rng);
        } else {
          ridge(ctx, jx, jy, s * 1.25, rng);
        }
      } else if (t === Terrain.Hills && roll < 0.05) {
        hill(ctx, jx, jy, 2.4 + rng.next() * 1.8);
      } else if (t === Terrain.Desert && roll < 0.035) {
        dune(ctx, jx, jy, 2.2 + rng.next() * 2);
      } else if (t === Terrain.Desert && roll < 0.04) {
        cactus(ctx, jx, jy);
      } else if (t === Terrain.Plains && roll < 0.018) {
        tuft(ctx, jx, jy);
      } else if (t === Terrain.Plains && roll < 0.024) {
        roundTree(ctx, jx, jy, 0.9 + rng.next() * 0.4);
      }
    }
  }
}

function conifer(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.fillStyle = 'rgba(30,50,40,0.22)';
  ctx.beginPath();
  ctx.ellipse(x + s * 0.18, y + 0.15, s * 0.5, s * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#4f7f52';
  ctx.beginPath();
  ctx.moveTo(x, y - s * 1.35);
  ctx.lineTo(x + s * 0.55, y);
  ctx.lineTo(x - s * 0.55, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#6a9c62';
  ctx.beginPath();
  ctx.moveTo(x, y - s * 1.35);
  ctx.lineTo(x - s * 0.55, y);
  ctx.lineTo(x - s * 0.04, y);
  ctx.closePath();
  ctx.fill();
}

function roundTree(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.fillStyle = 'rgba(30,50,40,0.22)';
  ctx.beginPath();
  ctx.ellipse(x + s * 0.2, y + 0.1, s * 0.7, s * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#6f5a3c';
  ctx.fillRect(x - s * 0.1, y - s * 0.55, s * 0.2, s * 0.55);
  ctx.fillStyle = '#5d9558';
  ctx.beginPath();
  ctx.arc(x, y - s * 0.85, s * 0.62, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#7fb56b';
  ctx.beginPath();
  ctx.arc(x - s * 0.17, y - s * 1.0, s * 0.34, 0, Math.PI * 2);
  ctx.fill();
}

function peak(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, rng: Rng): void {
  // Lopsided tips and varied widths, so no two peaks share a silhouette.
  const half = s * (0.52 + rng.next() * 0.42);
  const tipX = x + (rng.next() - 0.5) * s * 0.55;
  const tipY = y - s * 1.08;
  ctx.fillStyle = 'rgba(38,36,50,0.28)';
  ctx.beginPath();
  ctx.ellipse(x + s * 0.14, y + 0.25, half * 1.04, s * 0.17, 0, 0, Math.PI * 2);
  ctx.fill();
  // Shaded right face, then the lit left face on top.
  ctx.fillStyle = '#6f6b6e';
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(x + half, y);
  ctx.lineTo(x - half, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#a8a29c';
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(x - half, y);
  ctx.lineTo(x - half * 0.1, y);
  ctx.lineTo(tipX + s * 0.06, tipY + s * 0.44);
  ctx.closePath();
  ctx.fill();
  // Snow cap with a jagged lower edge.
  const capY = tipY + s * 0.36;
  const capW = half * 0.42;
  ctx.fillStyle = '#fbfbf6';
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(tipX + capW, capY);
  ctx.lineTo(tipX + capW * 0.45, capY - s * 0.08);
  ctx.lineTo(tipX + capW * 0.08, capY + s * 0.07);
  ctx.lineTo(tipX - capW * 0.35, capY - s * 0.06);
  ctx.lineTo(tipX - capW, capY);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(38,36,50,0.55)';
  ctx.lineWidth = Math.max(0.1, s * 0.04);
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x - half, y);
  ctx.lineTo(tipX, tipY);
  ctx.lineTo(x + half, y);
  ctx.stroke();
}

/** A jagged crag with a broken double summit. */
function crag(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, rng: Rng): void {
  const w = s * (0.7 + rng.next() * 0.3);
  const a = -0.34 + rng.next() * 0.2;
  const b = 0.2 + rng.next() * 0.25;
  const tipA: [number, number] = [x + a * s, y - s * (1 + rng.next() * 0.2)];
  const notch: [number, number] = [x + (a + b) * 0.5 * s, y - s * 0.62];
  const tipB: [number, number] = [x + b * s, y - s * (0.72 + rng.next() * 0.16)];
  ctx.fillStyle = 'rgba(38,36,50,0.28)';
  ctx.beginPath();
  ctx.ellipse(x + s * 0.12, y + 0.25, w * 1.02, s * 0.15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#6a666b';
  ctx.beginPath();
  ctx.moveTo(x - w, y);
  ctx.lineTo(tipA[0], tipA[1]);
  ctx.lineTo(notch[0], notch[1]);
  ctx.lineTo(tipB[0], tipB[1]);
  ctx.lineTo(x + w, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#aca69f';
  ctx.beginPath();
  ctx.moveTo(x - w, y);
  ctx.lineTo(tipA[0], tipA[1]);
  ctx.lineTo(tipA[0] + s * 0.1, y - s * 0.48);
  ctx.lineTo(x - w * 0.2, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fbfbf6';
  ctx.beginPath();
  ctx.moveTo(tipA[0], tipA[1]);
  ctx.lineTo(tipA[0] + s * 0.16, tipA[1] + s * 0.26);
  ctx.lineTo(tipA[0] + s * 0.03, tipA[1] + s * 0.2);
  ctx.lineTo(tipA[0] - s * 0.14, tipA[1] + s * 0.28);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(38,36,50,0.55)';
  ctx.lineWidth = Math.max(0.1, s * 0.04);
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x - w, y);
  ctx.lineTo(tipA[0], tipA[1]);
  ctx.lineTo(notch[0], notch[1]);
  ctx.lineTo(tipB[0], tipB[1]);
  ctx.lineTo(x + w, y);
  ctx.stroke();
}

/** A long, low, snowless ridge, so a range has foothills as well as summits. */
function ridge(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, rng: Rng): void {
  const w = s * (0.95 + rng.next() * 0.35);
  const h = s * (0.42 + rng.next() * 0.16);
  const crest = (rng.next() - 0.5) * w * 0.5;
  ctx.fillStyle = 'rgba(38,36,50,0.24)';
  ctx.beginPath();
  ctx.ellipse(x + s * 0.1, y + 0.2, w, s * 0.13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#7b7671';
  ctx.beginPath();
  ctx.moveTo(x - w, y);
  ctx.quadraticCurveTo(x + crest - w * 0.25, y - h * 1.5, x + crest, y - h);
  ctx.quadraticCurveTo(x + crest + w * 0.3, y - h * 0.86, x + w, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#a39d95';
  ctx.beginPath();
  ctx.moveTo(x - w, y);
  ctx.quadraticCurveTo(x + crest - w * 0.25, y - h * 1.5, x + crest, y - h);
  ctx.lineTo(x + crest - w * 0.1, y);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(38,36,50,0.5)';
  ctx.lineWidth = Math.max(0.1, s * 0.035);
  ctx.beginPath();
  ctx.moveTo(x - w, y);
  ctx.quadraticCurveTo(x + crest - w * 0.25, y - h * 1.5, x + crest, y - h);
  ctx.quadraticCurveTo(x + crest + w * 0.3, y - h * 0.86, x + w, y);
  ctx.stroke();
}

function hill(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.fillStyle = 'rgba(60,50,30,0.2)';
  ctx.beginPath();
  ctx.ellipse(x + s * 0.1, y + 0.1, s * 0.74, s * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#b3a378';
  ctx.beginPath();
  ctx.moveTo(x - s * 0.7, y);
  ctx.quadraticCurveTo(x, y - s * 0.9, x + s * 0.7, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#cdbd90';
  ctx.beginPath();
  ctx.moveTo(x - s * 0.7, y);
  ctx.quadraticCurveTo(x - s * 0.2, y - s * 0.86, x + s * 0.05, y - s * 0.42);
  ctx.quadraticCurveTo(x - s * 0.2, y - s * 0.3, x - s * 0.3, y);
  ctx.closePath();
  ctx.fill();
}

function dune(ctx: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  ctx.strokeStyle = 'rgba(150,115,60,0.5)';
  ctx.lineWidth = 0.22;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - s * 0.6, y);
  ctx.quadraticCurveTo(x, y - s * 0.34, x + s * 0.6, y);
  ctx.stroke();
}

function cactus(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.strokeStyle = '#5c8a54';
  ctx.lineWidth = 0.34;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - 1.3);
  ctx.moveTo(x, y - 0.6);
  ctx.lineTo(x - 0.45, y - 0.8);
  ctx.lineTo(x - 0.45, y - 1.1);
  ctx.moveTo(x, y - 0.8);
  ctx.lineTo(x + 0.45, y - 1);
  ctx.lineTo(x + 0.45, y - 1.25);
  ctx.stroke();
}

function tuft(ctx: CanvasRenderingContext2D, x: number, y: number): void {
  ctx.strokeStyle = 'rgba(90,120,70,0.55)';
  ctx.lineWidth = 0.14;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - 0.25, y - 0.45);
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - 0.55);
  ctx.moveTo(x, y);
  ctx.lineTo(x + 0.25, y - 0.45);
  ctx.stroke();
}
