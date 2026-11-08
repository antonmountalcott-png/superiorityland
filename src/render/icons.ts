/** Small map sprites (cities, buildings) drawn once to canvases, shared between map and UI. */
import type { BuildingKind } from '../core/sim';

const INK = '#1b1530';
const cache = new Map<string, HTMLCanvasElement>();

function sprite(key: string, draw: (ctx: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  let c = cache.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d') as CanvasRenderingContext2D;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    draw(ctx);
    cache.set(key, c);
  }
  return c;
}

const poly = (ctx: CanvasRenderingContext2D, fill: string, pts: number[], lw = 4) => {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.strokeStyle = INK;
  ctx.stroke();
};

const groundShadow = (ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) => {
  ctx.fillStyle = 'rgba(15,10,35,0.28)';
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
};

function house(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, roof: string): void {
  poly(ctx, '#f7ecd0', [x, y, x + w, y, x + w, y - h, x, y - h]);
  poly(ctx, roof, [x - 5, y - h, x + w / 2, y - h - w * 0.62, x + w + 5, y - h]);
  ctx.fillStyle = '#6f89a8';
  ctx.fillRect(x + w * 0.32, y - h * 0.72, w * 0.36, h * 0.36);
}

export const citySprite = (): HTMLCanvasElement => sprite('city', (ctx) => {
  groundShadow(ctx, 64, 108, 52, 11);
  house(ctx, 16, 104, 34, 32, '#c95a4b');
  house(ctx, 76, 106, 36, 30, '#4d7fc4');
  poly(ctx, '#eadcb6', [44, 104, 84, 104, 84, 50, 44, 50]);
  poly(ctx, '#d9a13a', [38, 50, 64, 18, 90, 50]);
  ctx.fillStyle = '#6f89a8';
  ctx.fillRect(55, 62, 18, 16);
  ctx.fillStyle = INK;
  ctx.fillRect(58, 88, 12, 16);
});

export const mineSprite = (): HTMLCanvasElement => sprite('mine', (ctx) => {
  groundShadow(ctx, 64, 106, 52, 11);
  poly(ctx, '#8c8279', [14, 104, 34, 56, 58, 40, 88, 50, 114, 104]);
  poly(ctx, '#2b2432', [42, 104, 44, 72, 64, 62, 84, 72, 86, 104]);
  ctx.fillStyle = '#ffd23f';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  for (const [x, y, r] of [[30, 90, 7], [100, 92, 7], [70, 44, 6], [46, 58, 5]] as const) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
});

export const capitalSprite = (color: string): HTMLCanvasElement => sprite(`capital:${color}`, (ctx) => {
  groundShadow(ctx, 64, 112, 56, 10);
  const stone = '#e4dcc9';
  poly(ctx, stone, [20, 108, 108, 108, 108, 66, 20, 66]);
  // Battlements along the wall.
  for (let x = 20; x < 104; x += 19) poly(ctx, stone, [x, 66, x + 11, 66, x + 11, 56, x, 56], 3.5);
  poly(ctx, stone, [44, 108, 84, 108, 84, 40, 44, 40]);
  for (let x = 44; x < 80; x += 15) poly(ctx, stone, [x, 40, x + 10, 40, x + 10, 30, x, 30], 3.5);
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.moveTo(54, 108);
  ctx.lineTo(54, 88);
  ctx.arc(64, 88, 10, Math.PI, 0);
  ctx.lineTo(74, 108);
  ctx.closePath();
  ctx.fill();
  // Pole and pennant in the owner's colour.
  ctx.lineWidth = 4;
  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.moveTo(64, 30);
  ctx.lineTo(64, 4);
  ctx.stroke();
  poly(ctx, color, [66, 5, 98, 13, 66, 22], 3.5);
});

const fortSprite = (color: string) => sprite(`fort:${color}`, (ctx) => {
  groundShadow(ctx, 64, 110, 44, 9);
  const stone = '#c9c3b6';
  poly(ctx, stone, [32, 108, 96, 108, 90, 44, 38, 44]);
  for (let i = 0; i < 3; i++) {
    const x = 34 + i * 23;
    poly(ctx, stone, [x, 44, x + 14, 44, x + 14, 30, x, 30], 4);
  }
  ctx.fillStyle = INK;
  ctx.fillRect(58, 58, 12, 22);
  ctx.fillStyle = color;
  ctx.fillRect(36, 88, 56, 12);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  ctx.strokeRect(36, 88, 56, 12);
});

const barracksSprite = (color: string) => sprite(`barracks:${color}`, (ctx) => {
  groundShadow(ctx, 64, 110, 50, 9);
  poly(ctx, '#7d8a5a', [14, 106, 64, 36, 114, 106]);
  poly(ctx, '#5f6c44', [64, 36, 114, 106, 74, 106]);
  poly(ctx, INK, [52, 106, 64, 70, 76, 106]);
  ctx.lineWidth = 4;
  ctx.strokeStyle = INK;
  ctx.beginPath();
  ctx.moveTo(64, 36);
  ctx.lineTo(64, 12);
  ctx.stroke();
  poly(ctx, color, [66, 12, 92, 20, 66, 28], 3.5);
});

const marketSprite = (color: string) => sprite(`market:${color}`, (ctx) => {
  groundShadow(ctx, 64, 110, 50, 9);
  poly(ctx, '#d6a36a', [24, 106, 104, 106, 104, 64, 24, 64]);
  ctx.fillStyle = '#ffd23f';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 3;
  for (const x of [42, 64, 86]) {
    ctx.beginPath();
    ctx.arc(x, 88, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  // Striped awning.
  const n = 5;
  const w = 96 / n;
  for (let i = 0; i < n; i++) {
    poly(ctx, i % 2 === 0 ? color : '#fff6e0', [16 + i * w, 64, 16 + (i + 1) * w, 64, 26 + (i + 1) * (76 / n), 34, 26 + i * (76 / n), 34], 3.5);
  }
});

export function buildingSprite(kind: BuildingKind, color: string): HTMLCanvasElement {
  if (kind === 'fort') return fortSprite(color);
  if (kind === 'barracks') return barracksSprite(color);
  return marketSprite(color);
}
