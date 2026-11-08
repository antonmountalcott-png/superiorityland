import type { FlagPattern, Hat, Nation } from '../core/nations';

export type Expression = 'neutral' | 'happy' | 'angry' | 'scared' | 'smug' | 'sad' | 'dead';

const INK = '#1b1530';

function paintFlag(ctx: CanvasRenderingContext2D, pattern: FlagPattern, c: string[], r: number): void {
  const a = c[0];
  const b = c[1] ?? '#ffffff';
  const d = c[2] ?? b;
  const s = r * 1.05;
  const rect = (x: number, y: number, w: number, h: number, col: string) => {
    ctx.fillStyle = col;
    ctx.fillRect(x, y, w, h);
  };
  rect(-s, -s, s * 2, s * 2, a);
  switch (pattern) {
    case 'hTri':
      rect(-s, -s / 3, s * 2, (s * 2) / 3, b);
      rect(-s, s / 3, s * 2, (s * 2) / 3, d);
      break;
    case 'vTri':
      rect(-s / 3, -s, (s * 2) / 3, s * 2, b);
      rect(s / 3, -s, (s * 2) / 3, s * 2, d);
      break;
    case 'hBi':
      rect(-s, 0, s * 2, s, b);
      break;
    case 'vBi':
      rect(0, -s, s, s * 2, b);
      break;
    case 'cross':
      rect(-s, -s * 0.2, s * 2, s * 0.4, b);
      rect(-s * 0.42, -s, s * 0.4, s * 2, b);
      if (c[2]) {
        rect(-s, -s * 0.08, s * 2, s * 0.16, d);
        rect(-s * 0.3, -s, s * 0.16, s * 2, d);
      }
      break;
    case 'saltire':
      ctx.strokeStyle = b;
      ctx.lineWidth = s * 0.42;
      ctx.beginPath();
      ctx.moveTo(-s, -s);
      ctx.lineTo(s, s);
      ctx.moveTo(s, -s);
      ctx.lineTo(-s, s);
      ctx.stroke();
      break;
    case 'disc':
      ctx.fillStyle = b;
      ctx.beginPath();
      ctx.arc(0, -s * 0.05, s * 0.62, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = d;
      ctx.beginPath();
      ctx.ellipse(-s * 0.3, s * 0.32, s * 0.2, s * 0.15, 0.4, 0, Math.PI * 2);
      ctx.ellipse(s * 0.34, s * 0.18, s * 0.13, s * 0.1, -0.3, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'star': {
      rect(-s, s * 0.46, s * 2, s * 0.6, d);
      ctx.fillStyle = b;
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const ang = -Math.PI / 2 + (i * Math.PI) / 5;
        const rad = i % 2 === 0 ? s * 0.56 : s * 0.24;
        const x = Math.cos(ang) * rad;
        const y = Math.sin(ang) * rad + s * 0.44;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'chevron':
      rect(-s, 0, s * 2, s, b);
      ctx.fillStyle = d;
      ctx.beginPath();
      ctx.moveTo(-s, -s);
      ctx.lineTo(s * 0.1, 0);
      ctx.lineTo(-s, s);
      ctx.closePath();
      ctx.fill();
      break;
    case 'diag':
      ctx.fillStyle = b;
      ctx.beginPath();
      ctx.moveTo(-s, s);
      ctx.lineTo(s, -s);
      ctx.lineTo(s, s);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = d;
      ctx.lineWidth = s * 0.36;
      ctx.beginPath();
      ctx.moveTo(-s, s);
      ctx.lineTo(s, -s);
      ctx.stroke();
      break;
    case 'sun':
      ctx.fillStyle = b;
      for (let i = 0; i < 12; i++) {
        const ang = (i * Math.PI) / 6;
        ctx.beginPath();
        ctx.moveTo(0, s * 0.3);
        ctx.lineTo(Math.cos(ang - 0.13) * s * 2, s * 0.3 + Math.sin(ang - 0.13) * s * 2);
        ctx.lineTo(Math.cos(ang + 0.13) * s * 2, s * 0.3 + Math.sin(ang + 0.13) * s * 2);
        ctx.closePath();
        ctx.fill();
      }
      break;
    case 'checker': {
      const n = 4;
      const cell = (s * 2) / n;
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          if ((x + y) % 2 === 0) rect(-s + x * cell, -s + y * cell, cell + 0.5, cell + 0.5, b);
        }
      }
      break;
    }
    case 'stripes': {
      const n = 6;
      const cell = (s * 2) / n;
      for (let i = 1; i < n; i += 2) rect(-s, -s + i * cell, s * 2, cell, b);
      break;
    }
    case 'canton':
      rect(-s, -s, s * 1.02, s * 0.98, b);
      ctx.fillStyle = d;
      for (const [x, y] of [[-0.68, -0.68], [-0.28, -0.68], [-0.68, -0.28], [-0.28, -0.28]]) {
        ctx.beginPath();
        ctx.arc(x * s, y * s, s * 0.11, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'ring':
      ctx.strokeStyle = b;
      ctx.lineWidth = s * 0.3;
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.62, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = d;
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.24, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'wave':
      ctx.strokeStyle = b;
      ctx.lineWidth = s * 0.2;
      for (let j = -1; j <= 1; j++) {
        ctx.beginPath();
        for (let x = -s; x <= s; x += s / 8) {
          const y = j * s * 0.56 + Math.sin((x / s) * 5) * s * 0.11;
          if (x === -s) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      break;
  }
}

function pill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, rad: number): void {
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function shape(ctx: CanvasRenderingContext2D, lw: number, fill: string, draw: () => void): void {
  ctx.beginPath();
  draw();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.strokeStyle = INK;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function paintHat(ctx: CanvasRenderingContext2D, hat: Hat, r: number, nation: Nation): void {
  const lw = r * 0.075;
  const main = nation.flag.colors[0];
  const alt = nation.flag.colors[1] ?? '#ffffff';
  const top = -r * 0.82;
  switch (hat) {
    case 'crown': {
      shape(ctx, lw, '#ffd23f', () => {
        const w = r * 0.72;
        const by = top + r * 0.08;
        const ty = by - r * 0.62;
        ctx.moveTo(-w, by);
        ctx.lineTo(-w * 1.08, ty + r * 0.08);
        ctx.lineTo(-w * 0.46, by - r * 0.3);
        ctx.lineTo(0, ty - r * 0.08);
        ctx.lineTo(w * 0.46, by - r * 0.3);
        ctx.lineTo(w * 1.08, ty + r * 0.08);
        ctx.lineTo(w, by);
        ctx.closePath();
      });
      ctx.fillStyle = '#e5383b';
      ctx.beginPath();
      ctx.arc(0, top - r * 0.18, r * 0.09, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#2f7ff0';
      ctx.beginPath();
      ctx.arc(-r * 0.42, top - r * 0.1, r * 0.06, 0, Math.PI * 2);
      ctx.arc(r * 0.42, top - r * 0.1, r * 0.06, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'chef':
      shape(ctx, lw, '#ffffff', () => {
        ctx.moveTo(-r * 0.46, top + r * 0.14);
        ctx.lineTo(-r * 0.46, top - r * 0.28);
        ctx.arc(-r * 0.44, top - r * 0.5, r * 0.3, Math.PI * 0.6, Math.PI * 1.75);
        ctx.arc(0, top - r * 0.72, r * 0.34, Math.PI * 1.1, Math.PI * 1.9);
        ctx.arc(r * 0.44, top - r * 0.5, r * 0.3, Math.PI * 1.25, Math.PI * 0.4);
        ctx.lineTo(r * 0.46, top + r * 0.14);
        ctx.closePath();
      });
      break;
    case 'horns':
      for (const side of [-1, 1]) {
        shape(ctx, lw, '#f6ead0', () => {
          const bx = side * r * 0.58;
          const by = -r * 0.66;
          ctx.moveTo(bx - side * r * 0.2, by + r * 0.1);
          ctx.quadraticCurveTo(side * r * 1.08, -r * 0.82, side * r * 1.02, -r * 1.34);
          ctx.quadraticCurveTo(side * r * 0.68, -r * 1.02, bx - side * r * 0.1, by - r * 0.18);
          ctx.closePath();
        });
      }
      break;
    case 'beret':
      shape(ctx, lw, '#2a2440', () => {
        ctx.ellipse(-r * 0.1, top + r * 0.02, r * 0.78, r * 0.32, -0.16, 0, Math.PI * 2);
      });
      ctx.lineCap = 'round';
      ctx.strokeStyle = INK;
      ctx.lineWidth = lw * 1.3;
      ctx.beginPath();
      ctx.moveTo(-r * 0.1, top - r * 0.28);
      ctx.lineTo(-r * 0.03, top - r * 0.44);
      ctx.stroke();
      break;
    case 'beanie':
      shape(ctx, lw, alt, () => {
        ctx.moveTo(-r * 0.76, top + r * 0.22);
        ctx.quadraticCurveTo(-r * 0.7, top - r * 0.6, 0, top - r * 0.6);
        ctx.quadraticCurveTo(r * 0.7, top - r * 0.6, r * 0.76, top + r * 0.22);
        ctx.closePath();
      });
      shape(ctx, lw, main, () => pill(ctx, -r * 0.84, top + r * 0.03, r * 1.68, r * 0.28, r * 0.13));
      shape(ctx, lw, main, () => ctx.arc(0, top - r * 0.68, r * 0.17, 0, Math.PI * 2));
      break;
    case 'sailor':
      shape(ctx, lw, '#ffffff', () => {
        ctx.moveTo(-r * 0.6, top + r * 0.16);
        ctx.lineTo(-r * 0.72, top - r * 0.14);
        ctx.quadraticCurveTo(0, top - r * 0.5, r * 0.72, top - r * 0.14);
        ctx.lineTo(r * 0.6, top + r * 0.16);
        ctx.closePath();
      });
      shape(ctx, lw, '#26315c', () => pill(ctx, -r * 0.64, top - r * 0.03, r * 1.28, r * 0.17, r * 0.05));
      break;
    case 'tophat':
      shape(ctx, lw, '#242033', () => ctx.rect(-r * 0.46, top - r * 0.82, r * 0.92, r * 0.92));
      shape(ctx, lw, main, () => ctx.rect(-r * 0.46, top - r * 0.14, r * 0.92, r * 0.22));
      shape(ctx, lw, '#242033', () => pill(ctx, -r * 0.8, top + r * 0.06, r * 1.6, r * 0.16, r * 0.08));
      break;
    case 'bowler':
      shape(ctx, lw, '#3a2f2a', () => {
        ctx.arc(0, top + r * 0.08, r * 0.54, Math.PI, 0);
        ctx.closePath();
      });
      shape(ctx, lw, '#3a2f2a', () => pill(ctx, -r * 0.8, top + r * 0.02, r * 1.6, r * 0.15, r * 0.075));
      break;
    case 'party':
      shape(ctx, lw, alt === '#ffffff' ? '#ffd23f' : alt, () => {
        ctx.moveTo(-r * 0.46, top + r * 0.15);
        ctx.lineTo(0, top - r * 0.95);
        ctx.lineTo(r * 0.46, top + r * 0.15);
        ctx.closePath();
      });
      ctx.fillStyle = '#2f7ff0';
      ctx.beginPath();
      ctx.arc(-r * 0.08, top - r * 0.1, r * 0.08, 0, Math.PI * 2);
      ctx.arc(r * 0.13, top - r * 0.38, r * 0.07, 0, Math.PI * 2);
      ctx.fill();
      shape(ctx, lw * 0.8, '#e5383b', () => ctx.arc(0, top - r * 0.98, r * 0.14, 0, Math.PI * 2));
      break;
    case 'cap':
      shape(ctx, lw, main, () => {
        ctx.arc(0, top + r * 0.14, r * 0.68, Math.PI, 0);
        ctx.closePath();
      });
      shape(ctx, lw, nation.flag.colors[2] ?? INK, () => pill(ctx, r * 0.1, top + r * 0.02, r * 1.0, r * 0.17, r * 0.08));
      break;
    case 'viking':
      for (const side of [-1, 1]) {
        shape(ctx, lw, '#fff5dc', () => {
          ctx.moveTo(side * r * 0.54, top + r * 0.02);
          ctx.quadraticCurveTo(side * r * 1.12, top - r * 0.02, side * r * 1.02, top - r * 0.62);
          ctx.quadraticCurveTo(side * r * 0.82, top - r * 0.3, side * r * 0.42, top - r * 0.26);
          ctx.closePath();
        });
      }
      shape(ctx, lw, '#9aa6b5', () => {
        ctx.arc(0, top + r * 0.14, r * 0.68, Math.PI, 0);
        ctx.closePath();
      });
      shape(ctx, lw, '#c9a35b', () => ctx.rect(-r * 0.09, top - r * 0.54, r * 0.18, r * 0.68));
      break;
    case 'tricorn':
      shape(ctx, lw, '#1f1c30', () => {
        ctx.moveTo(-r * 1.0, top + r * 0.2);
        ctx.quadraticCurveTo(-r * 0.5, top - r * 0.76, 0, top - r * 0.6);
        ctx.quadraticCurveTo(r * 0.5, top - r * 0.76, r * 1.0, top + r * 0.2);
        ctx.quadraticCurveTo(0, top - r * 0.06, -r * 1.0, top + r * 0.2);
        ctx.closePath();
      });
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(0, top - r * 0.24, r * 0.11, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'cowboy':
      shape(ctx, lw, '#9c6b3f', () => {
        ctx.moveTo(-r * 1.08, top - r * 0.14);
        ctx.quadraticCurveTo(-r * 0.6, top + r * 0.3, 0, top + r * 0.16);
        ctx.quadraticCurveTo(r * 0.6, top + r * 0.3, r * 1.08, top - r * 0.14);
        ctx.quadraticCurveTo(r * 0.6, top - r * 0.02, r * 0.48, top - r * 0.06);
        ctx.quadraticCurveTo(r * 0.44, top - r * 0.74, 0, top - r * 0.56);
        ctx.quadraticCurveTo(-r * 0.44, top - r * 0.74, -r * 0.48, top - r * 0.06);
        ctx.quadraticCurveTo(-r * 0.6, top - r * 0.02, -r * 1.08, top - r * 0.14);
        ctx.closePath();
      });
      break;
    case 'propeller':
      shape(ctx, lw, main, () => {
        ctx.arc(0, top + r * 0.14, r * 0.66, Math.PI, 0);
        ctx.closePath();
      });
      shape(ctx, lw, alt, () => {
        ctx.moveTo(-r * 0.66, top + r * 0.14);
        ctx.arc(0, top + r * 0.14, r * 0.66, Math.PI, Math.PI * 1.34);
        ctx.lineTo(0, top + r * 0.14);
        ctx.closePath();
      });
      ctx.lineWidth = lw;
      ctx.strokeStyle = INK;
      ctx.beginPath();
      ctx.moveTo(0, top - r * 0.5);
      ctx.lineTo(0, top - r * 0.76);
      ctx.stroke();
      shape(ctx, lw, '#ffd23f', () => ctx.ellipse(-r * 0.34, top - r * 0.76, r * 0.34, r * 0.1, 0, 0, Math.PI * 2));
      shape(ctx, lw, '#e5383b', () => ctx.ellipse(r * 0.34, top - r * 0.76, r * 0.34, r * 0.1, 0, 0, Math.PI * 2));
      break;
    case 'wizard':
      shape(ctx, lw, '#3b3180', () => {
        ctx.moveTo(-r * 0.56, top + r * 0.12);
        ctx.quadraticCurveTo(-r * 0.1, top - r * 0.6, r * 0.28, top - r * 1.15);
        ctx.quadraticCurveTo(r * 0.28, top - r * 0.5, r * 0.56, top + r * 0.12);
        ctx.closePath();
      });
      shape(ctx, lw, '#3b3180', () => pill(ctx, -r * 0.92, top + r * 0.04, r * 1.84, r * 0.17, r * 0.08));
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.arc(-r * 0.02, top - r * 0.26, r * 0.08, 0, Math.PI * 2);
      ctx.arc(r * 0.2, top - r * 0.6, r * 0.06, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'fedora':
      shape(ctx, lw, '#38404f', () => {
        ctx.moveTo(-r * 0.54, top + r * 0.1);
        ctx.lineTo(-r * 0.48, top - r * 0.46);
        ctx.quadraticCurveTo(0, top - r * 0.32, r * 0.48, top - r * 0.46);
        ctx.lineTo(r * 0.54, top + r * 0.1);
        ctx.closePath();
      });
      shape(ctx, lw, '#e7edf5', () => ctx.rect(-r * 0.53, top - r * 0.08, r * 1.06, r * 0.16));
      shape(ctx, lw, '#38404f', () => pill(ctx, -r * 0.92, top + r * 0.08, r * 1.84, r * 0.15, r * 0.07));
      break;
    case 'nemes': {
      // A striped royal headdress: a dome over the head with flaps falling past the cheeks.
      const gold = '#e9c24c';
      const blue = '#2a54b8';
      const stripes = (clip: () => void) => {
        ctx.save();
        ctx.beginPath();
        clip();
        ctx.clip();
        ctx.strokeStyle = blue;
        ctx.lineWidth = r * 0.075;
        for (let y = top - r * 0.8; y < top + r * 1.5; y += r * 0.17) {
          ctx.beginPath();
          ctx.moveTo(-r * 1.2, y);
          ctx.lineTo(r * 1.2, y);
          ctx.stroke();
        }
        ctx.restore();
      };
      for (const side of [-1, 1]) {
        const flap = () => {
          ctx.moveTo(side * r * 0.5, top + r * 0.12);
          ctx.lineTo(side * r * 1.06, top + r * 0.62);
          ctx.lineTo(side * r * 1.0, top + r * 1.34);
          ctx.lineTo(side * r * 0.74, top + r * 1.3);
          ctx.lineTo(side * r * 0.66, top + r * 0.62);
          ctx.closePath();
        };
        shape(ctx, lw, gold, flap);
        stripes(flap);
        ctx.beginPath();
        flap();
        ctx.lineWidth = lw;
        ctx.strokeStyle = INK;
        ctx.stroke();
      }
      const dome = () => {
        ctx.moveTo(-r * 0.78, top + r * 0.22);
        ctx.quadraticCurveTo(-r * 0.78, top - r * 0.62, 0, top - r * 0.66);
        ctx.quadraticCurveTo(r * 0.78, top - r * 0.62, r * 0.78, top + r * 0.22);
        ctx.closePath();
      };
      shape(ctx, lw, gold, dome);
      stripes(dome);
      ctx.beginPath();
      dome();
      ctx.lineWidth = lw;
      ctx.strokeStyle = INK;
      ctx.stroke();
      shape(ctx, lw, gold, () => pill(ctx, -r * 0.8, top + r * 0.08, r * 1.6, r * 0.18, r * 0.08));
      shape(ctx, lw * 0.8, '#e5383b', () => ctx.arc(0, top - r * 0.02, r * 0.1, 0, Math.PI * 2));
      break;
    }
    case 'spartan': {
      // A bronze helmet under a tall red crest.
      shape(ctx, lw, '#d63a32', () => {
        ctx.moveTo(-r * 0.7, top - r * 0.24);
        ctx.quadraticCurveTo(-r * 0.2, top - r * 1.32, r * 0.74, top - r * 0.3);
        ctx.quadraticCurveTo(0, top - r * 0.66, -r * 0.7, top - r * 0.24);
        ctx.closePath();
      });
      ctx.strokeStyle = '#8f1d18';
      ctx.lineWidth = r * 0.05;
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath();
        ctx.moveTo(i * r * 0.17, top - r * 0.6 + Math.abs(i) * r * 0.04);
        ctx.lineTo(i * r * 0.2, top - r * 0.9 + Math.abs(i) * r * 0.1);
        ctx.stroke();
      }
      shape(ctx, lw, '#d39b45', () => {
        ctx.arc(0, top + r * 0.2, r * 0.72, Math.PI, 0);
        ctx.closePath();
      });
      shape(ctx, lw, '#b77b2c', () => pill(ctx, -r * 0.76, top + r * 0.06, r * 1.52, r * 0.18, r * 0.08));
      break;
    }
    case 'laurel': {
      // A victor's wreath of leaves around the crown of the head.
      const leaf = (x: number, y: number, rot: number) => shape(ctx, lw * 0.8, '#5fae3d', () => ctx.ellipse(x, y, r * 0.2, r * 0.09, rot, 0, Math.PI * 2));
      for (const side of [-1, 1]) {
        for (let i = 0; i < 6; i++) {
          const a = Math.PI * (1.5 + side * (0.12 + i * 0.075));
          const x = Math.cos(a) * r * 0.86;
          const y = top + r * 0.28 + Math.sin(a) * r * 0.5;
          leaf(x, y, a + side * 0.9);
        }
      }
      shape(ctx, lw * 0.8, '#f2c84b', () => ctx.arc(0, top - r * 0.2, r * 0.1, 0, Math.PI * 2));
      break;
    }
    case 'furhat': {
      // A tall pointed cap over a thick fur brim.
      shape(ctx, lw, main, () => {
        ctx.moveTo(-r * 0.56, top + r * 0.06);
        ctx.quadraticCurveTo(-r * 0.4, top - r * 0.72, 0, top - r * 1.0);
        ctx.quadraticCurveTo(r * 0.4, top - r * 0.72, r * 0.56, top + r * 0.06);
        ctx.closePath();
      });
      shape(ctx, lw, '#e8d27a', () => ctx.arc(0, top - r * 1.02, r * 0.1, 0, Math.PI * 2));
      shape(ctx, lw, '#8a6a4a', () => pill(ctx, -r * 0.9, top - r * 0.1, r * 1.8, r * 0.34, r * 0.17));
      ctx.fillStyle = '#a8865f';
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath();
        ctx.arc(i * r * 0.24, top - r * 0.02, r * 0.07, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'bicorne':
      // A wide two-cornered hat worn sideways, with a cockade.
      shape(ctx, lw, '#1f1c30', () => {
        ctx.moveTo(-r * 1.14, top + r * 0.16);
        ctx.quadraticCurveTo(-r * 0.62, top - r * 0.56, 0, top - r * 0.68);
        ctx.quadraticCurveTo(r * 0.62, top - r * 0.56, r * 1.14, top + r * 0.16);
        ctx.quadraticCurveTo(0, top - r * 0.02, -r * 1.14, top + r * 0.16);
        ctx.closePath();
      });
      ctx.strokeStyle = '#d6b24a';
      ctx.lineWidth = r * 0.05;
      ctx.beginPath();
      ctx.moveTo(-r * 1.0, top + r * 0.1);
      ctx.quadraticCurveTo(0, top - r * 0.06, r * 1.0, top + r * 0.1);
      ctx.stroke();
      shape(ctx, lw * 0.8, '#f2c84b', () => ctx.arc(r * 0.36, top - r * 0.28, r * 0.17, 0, Math.PI * 2));
      shape(ctx, lw * 0.6, '#253f8f', () => ctx.arc(r * 0.36, top - r * 0.28, r * 0.11, 0, Math.PI * 2));
      ctx.fillStyle = '#f2c84b';
      ctx.beginPath();
      ctx.arc(r * 0.36, top - r * 0.28, r * 0.055, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'imperial': {
      // A grand closed crown: red velvet, gold arches, a cross-orb and jewels.
      shape(ctx, lw, '#c0182f', () => {
        ctx.arc(0, top + r * 0.1, r * 0.62, Math.PI, 0);
        ctx.closePath();
      });
      ctx.strokeStyle = INK;
      ctx.lineWidth = lw * 2.2;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * r * 0.66, top + r * 0.08);
        ctx.quadraticCurveTo(side * r * 0.5, top - r * 0.62, 0, top - r * 0.6);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(0, top + r * 0.06);
      ctx.lineTo(0, top - r * 0.58);
      ctx.stroke();
      ctx.strokeStyle = '#ffd23f';
      ctx.lineWidth = lw * 1.1;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * r * 0.66, top + r * 0.08);
        ctx.quadraticCurveTo(side * r * 0.5, top - r * 0.62, 0, top - r * 0.6);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(0, top + r * 0.06);
      ctx.lineTo(0, top - r * 0.58);
      ctx.stroke();
      shape(ctx, lw, '#ffd23f', () => ctx.arc(0, top - r * 0.68, r * 0.13, 0, Math.PI * 2));
      shape(ctx, lw * 0.8, '#ffd23f', () => {
        ctx.rect(-r * 0.035, top - r * 1.0, r * 0.07, r * 0.22);
        ctx.rect(-r * 0.11, top - r * 0.93, r * 0.22, r * 0.07);
      });
      shape(ctx, lw, '#ffd23f', () => pill(ctx, -r * 0.82, top - r * 0.02, r * 1.64, r * 0.26, r * 0.1));
      for (const [x, c] of [[-0.48, '#2f7ff0'], [0, '#e5383b'], [0.48, '#58d68d']] as const) {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(x * r, top + r * 0.11, r * 0.07, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
  }
}

/** Pre-renders the body: flag, shading, outline, hat. Eyes are drawn live so they can look around. */
function paintBody(ctx: CanvasRenderingContext2D, r: number, nation: Nation, withHat: boolean): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.clip();
  paintFlag(ctx, nation.flag.pattern, nation.flag.colors, r);

  // Sphere shading: soft shadow low right, glossy highlight high left.
  const shade = ctx.createRadialGradient(-r * 0.32, -r * 0.42, r * 0.1, 0, 0, r * 1.06);
  shade.addColorStop(0, 'rgba(255,255,255,0.32)');
  shade.addColorStop(0.42, 'rgba(255,255,255,0.03)');
  shade.addColorStop(0.72, 'rgba(25,15,55,0.1)');
  shade.addColorStop(1, 'rgba(25,15,55,0.46)');
  ctx.fillStyle = shade;
  ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.44)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.42, -r * 0.56, r * 0.26, r * 0.14, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.lineWidth = Math.max(1, r * 0.1);
  ctx.strokeStyle = INK;
  ctx.stroke();

  if (nation.acc === 'bowtie') {
    const by = r * 0.98;
    shape(ctx, r * 0.07, '#e5383b', () => {
      ctx.moveTo(0, by);
      ctx.lineTo(-r * 0.36, by - r * 0.2);
      ctx.lineTo(-r * 0.36, by + r * 0.2);
      ctx.closePath();
      ctx.moveTo(0, by);
      ctx.lineTo(r * 0.36, by - r * 0.2);
      ctx.lineTo(r * 0.36, by + r * 0.2);
      ctx.closePath();
    });
  }
  if (withHat) paintHat(ctx, nation.hat, r, nation);
}

const bodyCache = new Map<string, HTMLCanvasElement>();
const BODY_PAD = 2.7;

function bodySprite(nation: Nation, r: number, withHat: boolean): HTMLCanvasElement {
  const bucket = Math.max(6, Math.ceil(r / 4) * 4);
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  const key = `${nation.id}:${bucket}:${withHat ? 1 : 0}:${scale}`;
  let c = bodyCache.get(key);
  if (!c) {
    c = document.createElement('canvas');
    const size = Math.ceil(bucket * BODY_PAD * 2 * scale);
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d') as CanvasRenderingContext2D;
    ctx.scale(scale, scale);
    ctx.translate(bucket * BODY_PAD, bucket * BODY_PAD);
    paintBody(ctx, bucket, nation, withHat);
    bodyCache.set(key, c);
  }
  return c;
}

/** Each nation has its own eyes and resting mood, so faces differ as much as hats do. */
const FACES: Record<string, { w: number; h: number; sep: number; y: number; mood: Expression; odd?: number; cross?: boolean; tiny?: boolean }> = {
  superiorityland: { w: 0.3, h: 0.34, sep: 0.36, y: -0.08, mood: 'smug' },
  toastria: { w: 0.34, h: 0.42, sep: 0.38, y: -0.1, mood: 'neutral', tiny: true },
  mooland: { w: 0.28, h: 0.26, sep: 0.42, y: -0.06, mood: 'smug' },
  moustachia: { w: 0.26, h: 0.3, sep: 0.33, y: -0.14, mood: 'angry' },
  sockovia: { w: 0.32, h: 0.36, sep: 0.36, y: -0.04, mood: 'sad' },
  duckmark: { w: 0.26, h: 0.28, sep: 0.33, y: -0.14, mood: 'neutral' },
  pickleton: { w: 0.3, h: 0.3, sep: 0.37, y: -0.1, mood: 'smug' },
  waffleburg: { w: 0.25, h: 0.25, sep: 0.33, y: -0.12, mood: 'neutral', odd: 1.35 },
  llamadonia: { w: 0.32, h: 0.4, sep: 0.4, y: -0.08, mood: 'neutral', cross: true },
  turnipia: { w: 0.37, h: 0.44, sep: 0.41, y: -0.06, mood: 'neutral', odd: 0.74 },
  beanorra: { w: 0.3, h: 0.34, sep: 0.36, y: -0.08, mood: 'neutral' },
  fjordia: { w: 0.27, h: 0.3, sep: 0.38, y: -0.06, mood: 'angry' },
  krakenia: { w: 0.34, h: 0.36, sep: 0.36, y: -0.08, mood: 'angry' },
  bonkia: { w: 0.3, h: 0.34, sep: 0.36, y: -0.08, mood: 'neutral' },
  spudland: { w: 0.27, h: 0.29, sep: 0.33, y: -0.04, mood: 'sad' },
  salmonia: { w: 0.33, h: 0.4, sep: 0.4, y: -0.1, mood: 'neutral', tiny: true },
  pharaonia: { w: 0.28, h: 0.28, sep: 0.35, y: 0.02, mood: 'smug' },
  spartaca: { w: 0.26, h: 0.27, sep: 0.34, y: -0.02, mood: 'angry' },
  romanum: { w: 0.3, h: 0.34, sep: 0.37, y: -0.06, mood: 'smug', odd: 1.18 },
  khanate: { w: 0.29, h: 0.24, sep: 0.38, y: -0.02, mood: 'angry' },
  bonapartia: { w: 0.28, h: 0.33, sep: 0.35, y: -0.06, mood: 'angry', tiny: true },
  eternal: { w: 0.31, h: 0.35, sep: 0.36, y: -0.08, mood: 'smug' },
};

export function drawEyes(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  nation: Nation,
  mood: Expression,
  lookX = 0,
  lookY = 0,
  blink = false,
): void {
  const face = FACES[nation.id] ?? FACES.superiorityland;
  const expr: Expression = mood === 'neutral' ? face.mood : mood;
  const ey = cy + r * face.y;
  const sep = r * face.sep;
  const ew = r * face.w;
  const eh = expr === 'scared' ? r * (face.h + 0.04) : r * face.h;
  const lw = Math.max(0.8, r * 0.07);

  if (nation.acc === 'shades' && expr !== 'dead') {
    ctx.fillStyle = '#14101f';
    ctx.strokeStyle = INK;
    ctx.lineWidth = lw;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + s * sep, ey, ew * 1.14, eh * 0.78, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(cx - sep, ey - eh * 0.2);
    ctx.lineTo(cx + sep, ey - eh * 0.2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + s * sep - ew * 0.34, ey - eh * 0.26, ew * 0.26, eh * 0.14, -0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    for (const s of [-1, 1]) {
      const ex = cx + s * sep;
      if (expr === 'dead') {
        ctx.strokeStyle = INK;
        ctx.lineCap = 'round';
        ctx.lineWidth = lw * 1.4;
        ctx.beginPath();
        ctx.moveTo(ex - ew * 0.6, ey - eh * 0.5);
        ctx.lineTo(ex + ew * 0.6, ey + eh * 0.5);
        ctx.moveTo(ex + ew * 0.6, ey - eh * 0.5);
        ctx.lineTo(ex - ew * 0.6, ey + eh * 0.5);
        ctx.stroke();
        continue;
      }
      if (nation.acc === 'eyepatch' && s === 1) continue;
      ctx.beginPath();
      if (blink || expr === 'happy') {
        // Closed, upward-arched eyes read as joy at any size.
        ctx.strokeStyle = INK;
        ctx.lineCap = 'round';
        ctx.lineWidth = lw * 1.5;
        ctx.arc(ex, ey + eh * 0.18, ew * 0.72, Math.PI * 1.12, Math.PI * 1.88);
        ctx.stroke();
        continue;
      }
      const eyeK = s === 1 ? face.odd ?? 1 : 1;
      ctx.ellipse(ex, ey, ew * eyeK, eh * eyeK, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = lw;
      ctx.strokeStyle = INK;
      ctx.stroke();

      const pr = (expr === 'scared' || face.tiny ? ew * 0.34 : ew * 0.56) * eyeK;
      const px = ex + lookX * ew * 0.42 - (face.cross ? s * ew * 0.42 : 0);
      const py = ey + lookY * eh * 0.42 + (expr === 'sad' ? eh * 0.16 : 0);
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(px - pr * 0.32, py - pr * 0.34, pr * 0.28, 0, Math.PI * 2);
      ctx.fill();

      // Eyelids turn the same two circles into a whole range of moods.
      const flagTop = nation.flag.colors[0];
      if (expr === 'angry') {
        ctx.fillStyle = flagTop;
        ctx.beginPath();
        // The lid slopes down toward the nose: that is what reads as a scowl.
        ctx.moveTo(ex + s * ew * 1.25, ey - eh * 1.25);
        ctx.lineTo(ex - s * ew * 1.25, ey - eh * 1.25);
        ctx.lineTo(ex - s * ew * 1.25, ey - eh * 0.02);
        ctx.lineTo(ex + s * ew * 1.25, ey - eh * 0.86);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(ex + s * ew * 1.2, ey - eh * 0.9);
        ctx.lineTo(ex - s * ew * 1.15, ey - eh * 0.04);
        ctx.lineWidth = lw * 1.5;
        ctx.strokeStyle = INK;
        ctx.lineCap = 'round';
        ctx.stroke();
      } else if (expr === 'smug') {
        ctx.fillStyle = flagTop;
        ctx.beginPath();
        ctx.rect(ex - ew * 1.15, ey - eh * 1.2, ew * 2.3, eh * 1.08);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(ex - ew * 1.05, ey - eh * 0.1);
        ctx.lineTo(ex + ew * 1.05, ey - eh * 0.1);
        ctx.lineWidth = lw * 1.3;
        ctx.strokeStyle = INK;
        ctx.lineCap = 'round';
        ctx.stroke();
      } else if (expr === 'sad') {
        ctx.fillStyle = flagTop;
        ctx.beginPath();
        // The lid slopes up toward the nose: worried, not cross.
        ctx.moveTo(ex + s * ew * 1.25, ey - eh * 1.25);
        ctx.lineTo(ex - s * ew * 1.25, ey - eh * 1.25);
        ctx.lineTo(ex - s * ew * 1.25, ey - eh * 0.95);
        ctx.lineTo(ex + s * ew * 1.25, ey - eh * 0.1);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  if (nation.acc === 'monocle' && expr !== 'dead') {
    const ex = cx + sep;
    ctx.beginPath();
    ctx.arc(ex, ey, ew * 1.2, 0, Math.PI * 2);
    ctx.lineWidth = lw * 1.2;
    ctx.strokeStyle = '#ffd23f';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ex + ew * 0.86, ey + ew * 0.86);
    ctx.quadraticCurveTo(ex + ew * 1.5, ey + r * 0.5, ex + ew * 0.7, ey + r * 0.72);
    ctx.lineWidth = lw * 0.7;
    ctx.stroke();
  }
  if (nation.acc === 'eyepatch' && expr !== 'dead') {
    const ex = cx + sep;
    ctx.strokeStyle = INK;
    ctx.lineWidth = lw * 0.9;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.86, cy - r * 0.42);
    ctx.lineTo(ex + ew * 0.9, ey + eh * 0.1);
    ctx.stroke();
    ctx.fillStyle = '#17131f';
    ctx.beginPath();
    ctx.ellipse(ex, ey, ew * 1.02, eh * 0.96, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (nation.acc === 'moustache') {
    const my = cy + r * 0.34;
    ctx.fillStyle = INK;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cx, my - r * 0.06);
      ctx.quadraticCurveTo(cx + s * r * 0.3, my - r * 0.2, cx + s * r * 0.66, my - r * 0.14);
      ctx.quadraticCurveTo(cx + s * r * 0.44, my + r * 0.16, cx, my + r * 0.05);
      ctx.closePath();
      ctx.fill();
    }
  }
  if (expr === 'scared') {
    ctx.fillStyle = '#7fd4ff';
    ctx.beginPath();
    ctx.ellipse(cx + r * 0.8, cy - r * 0.4, r * 0.08, r * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

export interface BallOptions {
  expr?: Expression;
  lookX?: number;
  lookY?: number;
  blink?: boolean;
  squashX?: number;
  squashY?: number;
  hat?: boolean;
  shadow?: boolean;
}

export function drawBall(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, nation: Nation, o: BallOptions = {}): void {
  const sx = o.squashX ?? 1;
  const sy = o.squashY ?? 1;
  // (Sprites are cached per size bucket, so drawing thousands stays cheap.)
  if (o.shadow !== false) {
    ctx.fillStyle = 'rgba(15,10,35,0.3)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + r * 0.98, r * 0.86 * sx, r * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const sprite = bodySprite(nation, r, o.hat !== false);
  const size = r * BODY_PAD * 2;
  if (sx === 1 && sy === 1) {
    ctx.drawImage(sprite, cx - size / 2, cy - size / 2, size, size);
  } else {
    // Squash from the ground so the ball looks planted when it lands.
    const w = size * sx;
    const h = size * sy;
    ctx.drawImage(sprite, cx - w / 2, cy + r - (r + size / 2) * sy, w, h);
  }
  const eyeY = cy + r - r * sy;
  drawEyes(ctx, cx, eyeY, r * Math.min(sx, sy) * 0.98 + r * 0.02, nation, o.expr ?? 'neutral', o.lookX ?? 0, o.lookY ?? 0, o.blink);
}

const soldierCache = new Map<string, HTMLCanvasElement>();
/** Soldier sprite size and ball-centre height, in soldier radii. Room above is for the hat. */
export const SOLDIER_SPRITE = 4.6;
export const SOLDIER_TOP = 3.1;

/** Small infantry ball with a helmet: one sprite per nation so hundreds can be drawn cheaply. */
export function soldierSprite(nation: Nation, r: number): HTMLCanvasElement {
  const bucket = Math.max(4, Math.round(r));
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  const key = `${nation.id}:${bucket}:${scale}`;
  let c = soldierCache.get(key);
  if (!c) {
    c = document.createElement('canvas');
    const size = Math.ceil(bucket * SOLDIER_SPRITE * scale);
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d') as CanvasRenderingContext2D;
    ctx.scale(scale, scale);
    ctx.translate(bucket * (SOLDIER_SPRITE / 2), bucket * SOLDIER_TOP);
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, bucket, 0, Math.PI * 2);
    ctx.clip();
    paintFlag(ctx, nation.flag.pattern, nation.flag.colors, bucket);
    const shade = ctx.createRadialGradient(-bucket * 0.3, -bucket * 0.4, bucket * 0.1, 0, 0, bucket * 1.05);
    shade.addColorStop(0, 'rgba(255,255,255,0.3)');
    shade.addColorStop(0.7, 'rgba(25,15,55,0.08)');
    shade.addColorStop(1, 'rgba(25,15,55,0.46)');
    ctx.fillStyle = shade;
    ctx.fillRect(-bucket, -bucket, bucket * 2, bucket * 2);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(0, 0, bucket, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(0.9, bucket * 0.15);
    ctx.strokeStyle = INK;
    ctx.stroke();
    // Every soldier wears the national hat, so an army is recognisably that nation's army.
    paintHat(ctx, nation.hat, bucket, nation);
    // Determined little eyes.
    ctx.fillStyle = '#fff';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(s * bucket * 0.38, bucket * 0.16, bucket * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = INK;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(s * bucket * 0.38, bucket * 0.18, bucket * 0.17, 0, Math.PI * 2);
      ctx.fill();
    }
    soldierCache.set(key, c);
  }
  return c;
}

const portraitCache = new Map<string, string>();

/** A data-URL portrait for DOM UI. */
export function ballPortrait(nation: Nation, size: number, expr: Expression = 'neutral'): string {
  const key = `${nation.id}:${size}:${expr}`;
  let url = portraitCache.get(key);
  if (!url) {
    const c = document.createElement('canvas');
    const scale = 2;
    c.width = size * scale;
    c.height = size * scale;
    const ctx = c.getContext('2d') as CanvasRenderingContext2D;
    ctx.scale(scale, scale);
    const r = size * 0.34;
    drawBall(ctx, size / 2, size * 0.6, r, nation, { expr, shadow: false });
    url = c.toDataURL();
    portraitCache.set(key, url);
  }
  return url;
}
