import { WATER } from '../core/balance';
import type { Nation } from '../core/nations';
import type { World } from '../core/worldgen';
import type { Camera } from './camera';

const VERT = `#version 300 es
precision highp float;
uniform vec2 uView;
uniform vec3 uCam; // grid x, grid y, pixels per cell
out vec2 vGrid;
void main() {
  vec2 pos = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vec2 ndc = pos * 2.0 - 1.0;
  gl_Position = vec4(ndc, 0.0, 1.0);
  vec2 screen = vec2(pos.x, 1.0 - pos.y) * uView;
  vGrid = uCam.xy + (screen - uView * 0.5) / uCam.z;
}`;

const FRAG = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
in vec2 vGrid;
out vec4 outColor;
uniform sampler2D uLand;
uniform sampler2D uShore;
uniform sampler2D uOwner;
uniform sampler2D uPalette;
uniform vec2 uGrid;
uniform vec2 uView;
uniform float uTime;
uniform float uPx;
uniform int uHuman;
uniform int uHover;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}

vec3 water(float sd, vec2 g) {
  // Flat depth bands with wobbly edges, like a painted map, rather than an airbrushed glow.
  float d = -sd + (vnoise(g * 0.13) - 0.5) * 2.6;
  vec3 c = vec3(0.36, 0.77, 0.81);
  c = mix(c, vec3(0.20, 0.62, 0.76), smoothstep(2.6, 3.2, d));
  c = mix(c, vec3(0.13, 0.50, 0.71), smoothstep(6.2, 6.8, d));
  c = mix(c, vec3(0.10, 0.41, 0.64), smoothstep(11.5, 12.1, d));
  c = mix(c, vec3(0.085, 0.34, 0.57), smoothstep(19.0, 19.6, d));
  float n = vnoise(g * 0.035 + vec2(uTime * 0.012, 0.0)) * 0.6 + vnoise(g * 0.09 - vec2(0.0, uTime * 0.018)) * 0.4;
  c *= 0.975 + 0.05 * n;
  // Stylised wavelets drifting over open water.
  float wav = vnoise(g * vec2(0.17, 0.42) + vec2(uTime * 0.12, uTime * 0.04)) * 0.6 + vnoise(g * vec2(0.41, 0.97) - vec2(uTime * 0.09, 0.0)) * 0.4;
  c += vec3(0.03, 0.045, 0.05) * smoothstep(0.58, 0.82, wav);
  // Foam rings breathing outward from every coast.
  float wobble = vnoise(g * 0.22) * 3.2;
  float ring = sin(sd * 1.3 + uTime * 0.85 + wobble);
  float fade = smoothstep(-11.0, -1.6, sd);
  c = mix(c, vec3(0.86, 0.97, 1.0), smoothstep(0.84, 0.97, ring) * fade * 0.5);
  c = mix(c, vec3(0.95, 0.98, 0.95), smoothstep(-1.15, -0.3, sd) * 0.85);
  return c;
}

vec4 bspline(float t) {
  float t2 = t * t;
  float t3 = t2 * t;
  return vec4((1.0 - 3.0 * t + 3.0 * t2 - t3), (3.0 * t3 - 6.0 * t2 + 4.0), (-3.0 * t3 + 3.0 * t2 + 3.0 * t + 1.0), t3) / 6.0;
}

vec3 pal(int id) { return texelFetch(uPalette, ivec2(id, 0), 0).rgb; }

vec3 finish(vec3 c, vec2 g) {
  // Slow cloud shadows keep the map from looking static.
  float cloud = vnoise(g * 0.014 + vec2(uTime * 0.012, uTime * 0.005)) * 0.65 + vnoise(g * 0.033 - vec2(uTime * 0.01, 0.0)) * 0.35;
  c *= 1.0 - 0.06 * smoothstep(0.58, 0.8, cloud);
  vec2 q = gl_FragCoord.xy / uView - 0.5;
  c *= 1.0 - dot(q, q) * 0.34;
  return c;
}

void main() {
  vec2 g = vGrid;
  vec2 uv = g / uGrid;
  // Past the map edge the sea keeps deepening smoothly, so there is no visible boundary.
  vec2 outside = max(vec2(0.0), max(-g, g - uGrid));
  float sd = texture(uShore, clamp(uv, 0.0, 1.0)).r - length(outside);
  if (sd < -2.2) {
    outColor = vec4(finish(water(sd, g), g), 1.0);
    return;
  }

  vec3 land = texture(uLand, uv).rgb;
  ivec2 size = ivec2(uGrid);

  vec2 p = g - 0.5;
  vec2 fl = floor(p);
  ivec2 ip = ivec2(fl);
  vec2 f = p - fl;
  vec4 wx = bspline(f.x);
  vec4 wy = bspline(f.y);

  int ids[16];
  float ws[16];
  int n = 0;
  int first = -1;
  bool same = true;
  float heat = 0.0;
  float total = 0.0;
  for (int y = 0; y < 4; y++) {
    for (int x = 0; x < 4; x++) {
      ivec2 c = clamp(ip + ivec2(x - 1, y - 1), ivec2(0), size - 1);
      vec4 t = texelFetch(uOwner, c, 0);
      int id = int(t.r * 255.0 + 0.5);
      if (id == ${WATER}) continue;
      float wgt = wx[x] * wy[y];
      ids[n] = id;
      ws[n] = wgt;
      total += wgt;
      heat += t.g * wgt;
      if (first < 0) first = id;
      else if (id != first) same = false;
      n++;
    }
  }
  int best = first;
  int second = -1;
  float edge = 1.0;
  if (total > 0.0) heat /= total;
  if (!same) {
    float bw = 0.0;
    float sw = 0.0;
    for (int i = 0; i < n; i++) {
      bool dup = false;
      for (int j = 0; j < i; j++) if (ids[j] == ids[i]) { dup = true; break; }
      if (dup) continue;
      float acc = 0.0;
      for (int j = i; j < n; j++) if (ids[j] == ids[i]) acc += ws[j];
      if (acc > bw) { sw = bw; second = best; bw = acc; best = ids[i]; }
      else if (acc > sw) { sw = acc; second = ids[i]; }
    }
    edge = (bw - sw) / total;
  }

  vec3 col = land;
  if (best > 0) {
    vec3 fill = pal(best);
    float lum = dot(land, vec3(0.3, 0.59, 0.11));
    // Stretch contrast so forests, hills and peaks stay readable under a nation's colour.
    float relief = smoothstep(0.2, 0.92, lum);
    // Dark colours need a higher floor or forests go black; bright ones need more contrast or terrain washes out.
    float fillLum = dot(fill, vec3(0.3, 0.59, 0.11));
    float floorK = mix(0.72, 0.34, smoothstep(0.2, 0.6, fillLum));
    floorK = mix(floorK, 0.52, smoothstep(0.62, 0.82, fillLum));
    float gainK = mix(0.5, 1.0, smoothstep(0.2, 0.6, fillLum));
    gainK = mix(gainK, 0.72, smoothstep(0.62, 0.82, fillLum));
    vec3 tint = fill * (floorK + gainK * relief);
    // How far inside the territory are we? Eight probes make a soft band along the border.
    float inner = 0.0;
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.7853981;
      ivec2 c = clamp(ivec2(floor(g + vec2(cos(a), sin(a)) * 3.2)), ivec2(0), size - 1);
      int id = int(texelFetch(uOwner, c, 0).r * 255.0 + 0.5);
      if (id == best || id == ${WATER}) inner += 0.125;
    }
    // Those probes step cell by cell, which would show as stairs when zoomed in, so fade the band out.
    inner = mix(inner, 1.0, smoothstep(4.0, 9.0, uPx));
    float alpha = mix(0.92, 0.72, inner);
    if (best == uHover) tint = mix(tint, vec3(1.0), 0.14);
    col = mix(land, tint, alpha);
    col = mix(col, land, smoothstep(0.8, 0.97, lum) * 0.55);
  }

  if (!same && second >= 0) {
    float e0 = max(1.25 / uPx, 0.09);
    float line = 1.0 - smoothstep(e0 * 0.55, e0 * 1.2, edge);
    int edgeOwner = best > 0 ? best : second;
    vec3 lineCol = pal(edgeOwner) * 0.36;
    if (best > 0 && second > 0) lineCol = (pal(best) + pal(second)) * 0.14;
    if (best == uHuman || second == uHuman) lineCol = mix(lineCol, vec3(1.0, 0.97, 0.72), 0.92);
    else if (best == uHover || second == uHover) lineCol = mix(lineCol, vec3(1.0), 0.7);
    // A thin bright line in the owner's colour just inside the dark border makes crowded fronts readable.
    if (best > 0) {
      float bright = smoothstep(e0 * 1.05, e0 * 1.35, edge) * (1.0 - smoothstep(e0 * 1.6, e0 * 2.3, edge));
      col = mix(col, min(pal(best) * 1.4 + 0.12, vec3(1.0)), bright * 0.8);
    }
    col = mix(col, lineCol, line * 0.95);
  }

  // Freshly conquered ground flashes hot, then settles.
  col = mix(col, vec3(1.0, 0.95, 0.72), heat * 0.46);

  float landMask = smoothstep(-0.14, 0.14, sd);
  vec3 c = mix(water(sd, g), col, landMask);
  // Inked coastline.
  float ink = 1.0 - smoothstep(0.02, 0.1 + 0.6 / uPx, abs(sd));
  c = mix(c, vec3(0.13, 0.17, 0.24), ink * 0.72);

  outColor = vec4(finish(c, g), 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type) as WebGLShader;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(`Shader error: ${gl.getShaderInfoLog(s)}`);
  return s;
}

const hexToRgb = (hex: string): [number, number, number] => {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};

export class GLMap {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private texLand: WebGLTexture;
  private texShore: WebGLTexture;
  private texOwner: WebGLTexture;
  private texPalette: WebGLTexture;
  private grid = new Uint8Array(0);
  private gw = 0;
  private gh = 0;
  private hot = new Set<number>();
  private ownerDirty = false;
  dpr = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    if (!gl) throw new Error('WebGL2 is required');
    this.gl = gl;
    const prog = gl.createProgram() as WebGLProgram;
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`Link error: ${gl.getProgramInfoLog(prog)}`);
    this.prog = prog;
    for (const n of ['uLand', 'uShore', 'uOwner', 'uPalette', 'uGrid', 'uView', 'uCam', 'uTime', 'uPx', 'uHuman', 'uHover']) {
      this.u[n] = gl.getUniformLocation(prog, n);
    }
    this.texLand = gl.createTexture() as WebGLTexture;
    this.texShore = gl.createTexture() as WebGLTexture;
    this.texOwner = gl.createTexture() as WebGLTexture;
    this.texPalette = gl.createTexture() as WebGLTexture;
    gl.bindVertexArray(gl.createVertexArray());
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  }

  setWorld(world: World, land: HTMLCanvasElement): void {
    const { gl } = this;
    this.gw = world.w;
    this.gh = world.h;

    gl.bindTexture(gl.TEXTURE_2D, this.texLand);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, land);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.bindTexture(gl.TEXTURE_2D, this.texShore);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, world.w, world.h, 0, gl.RED, gl.FLOAT, world.shore);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    this.grid = new Uint8Array(world.w * world.h * 2);
    this.hot.clear();
    gl.bindTexture(gl.TEXTURE_2D, this.texOwner);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, world.w, world.h, 0, gl.RG, gl.UNSIGNED_BYTE, this.grid);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  setPalette(nations: Nation[]): void {
    const { gl } = this;
    const data = new Uint8Array(256 * 4);
    nations.forEach((n, i) => {
      const [r, g, b] = hexToRgb(n.fill);
      const k = (i + 1) * 4;
      data[k] = r;
      data[k + 1] = g;
      data[k + 2] = b;
      data[k + 3] = 255;
    });
    gl.bindTexture(gl.TEXTURE_2D, this.texPalette);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  }

  /** Load the whole owner grid, used when a new match starts. */
  loadOwners(owner: Uint8Array): void {
    for (let i = 0; i < owner.length; i++) {
      this.grid[i * 2] = owner[i];
      this.grid[i * 2 + 1] = 0;
    }
    this.hot.clear();
    this.ownerDirty = true;
  }

  applyChanges(cells: number[], owner: Uint8Array, flash: boolean): void {
    for (const c of cells) {
      this.grid[c * 2] = owner[c];
      if (flash) {
        this.grid[c * 2 + 1] = 255;
        this.hot.add(c);
      }
    }
    if (cells.length) this.ownerDirty = true;
  }

  private coolHeat(dt: number): void {
    if (this.hot.size === 0) return;
    const drop = Math.max(1, Math.round(dt * 260));
    for (const c of this.hot) {
      const v = this.grid[c * 2 + 1] - drop;
      if (v <= 0) {
        this.grid[c * 2 + 1] = 0;
        this.hot.delete(c);
      } else {
        this.grid[c * 2 + 1] = v;
      }
    }
    this.ownerDirty = true;
  }

  resize(cssW: number, cssH: number, dpr: number): void {
    this.dpr = dpr;
    const W = Math.round(cssW * dpr);
    const H = Math.round(cssH * dpr);
    if (this.canvas.width !== W || this.canvas.height !== H) {
      this.canvas.width = W;
      this.canvas.height = H;
    }
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
  }

  draw(cam: Camera, time: number, dt: number, human: number, hover: number): void {
    const { gl } = this;
    this.coolHeat(dt);
    if (this.ownerDirty) {
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.texOwner);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.gw, this.gh, gl.RG, gl.UNSIGNED_BYTE, this.grid);
      this.ownerDirty = false;
    }
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.prog);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texLand);
    gl.uniform1i(this.u.uLand, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.texShore);
    gl.uniform1i(this.u.uShore, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.texOwner);
    gl.uniform1i(this.u.uOwner, 2);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.texPalette);
    gl.uniform1i(this.u.uPalette, 3);
    gl.uniform2f(this.u.uGrid, this.gw, this.gh);
    gl.uniform2f(this.u.uView, this.canvas.width, this.canvas.height);
    gl.uniform3f(this.u.uCam, cam.x, cam.y, cam.scale * this.dpr);
    gl.uniform1f(this.u.uTime, time);
    gl.uniform1f(this.u.uPx, cam.scale * this.dpr);
    gl.uniform1i(this.u.uHuman, human);
    gl.uniform1i(this.u.uHover, hover);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
