import { TPS } from '../core/balance';
import type { Game, Player } from '../core/sim';
import { cardById } from '../core/cards';
import { ballPortrait, drawBall } from '../render/ballArt';
import { type MatchOutcome, TRACK, dailyChallenges, weeklyChallenges, xpAtLevel } from '../core/progress';
import { KIND_LABEL } from './progressUi';
import { nationById } from '../core/nations';
import { esc, fmtNum, kindLabel, levelBadge, medal, rewardArt, shortName } from './progressUi';
import { icon } from './svg';

export interface ResultActions {
  again(): void;
  menu(): void;
  spectate?(): void;
  /** A clean picture of the final world, used for the share card. */
  snapshot(): HTMLCanvasElement | null;
  onCard?(card: HTMLCanvasElement): void;
  progress?: ResultProgress;
}

const STAR = '\u2605';

/** What this match did for the player's account. */
export interface ResultProgress {
  outcome: MatchOutcome;
  /** The player's ball, to show new frames on. */
  ball: string;
  /** Play the fill-up only the first time these results are shown. */
  animate: boolean;
  signedIn: boolean;
  saveHtml(): string;
  onSaveChange(fn: () => void): () => void;
  openPass(level?: number): void;
  createAccount(): void;
  /** Equip a newly unlocked nation or empire and start a match with it. */
  playAs(id: string): void;
}

function xpCard(pr: ResultProgress): string {
  const o = pr.outcome;
  const up = o.after.level > o.before.level;
  const chips = [
    ...o.xp.lines.map((l) => `<i>${esc(l.label)} <b>+${l.xp}</b></i>`),
    o.xp.mult !== 1 ? `<i class="mult">${esc(o.xp.multLabel)} = <b>${fmtNum(o.xp.total)}</b></i>` : '',
    ...o.bonuses.map((b) => `<i class="bonus">${esc(b.label)} <b>+${b.xp}</b></i>`),
    o.achievements.length ? `<i class="achx">${o.achievements.length} ${o.achievements.length === 1 ? 'achievement' : 'achievements'} <b>+${fmtNum(o.achievements.reduce((s, a) => s + a.xp, 0))}</b></i>` : '',
  ].join('');
  const bonusXp = o.bonuses.reduce((s, b) => s + b.xp, 0);
  const achSum = o.achievements.reduce((s, a) => s + a.xp, 0);
  const sum = [`Match ${fmtNum(o.xp.total)}`, bonusXp ? `Bonuses ${fmtNum(bonusXp)}` : '', achSum ? `Achievements ${fmtNum(achSum)}` : ''].filter(Boolean);
  const next = TRACK[o.after.level];
  const p = o.progress;
  const dDone = dailyChallenges(p.daily.day).filter((c) => p.daily.done.includes(c.id)).length;
  const wDone = weeklyChallenges(p.weekly.week).filter((c) => p.weekly.done.includes(c.id)).length;
  const nextLine = `<div class="xp-nextup">${next ? `<span>${icon('ticket')}Next: <b>${esc(next.name)}</b> ${next.milestone ? 'empire' : KIND_LABEL[next.kind].toLowerCase()} at Level ${next.level} · ${fmtNum(Math.max(0, xpAtLevel(next.level) - p.xp))} XP to go</span>` : ''}<span class="xn-ch">Daily ${dDone}/3 · Weekly ${wDone}/3</span></div>`;
  // The best new ball gets a big card of its own; everything else is a small one.
  const hero = [...o.newRewards].reverse().find((r) => r.kind === 'ball' && r.milestone) ?? [...o.newRewards].reverse().find((r) => r.kind === 'ball');
  const heroCard = hero ? (() => {
    const n = nationById(hero.id);
    return `<div class="unl-hero ${hero.milestone ? 'ms' : ''}"><span class="uh-art">${rewardArt(hero, 120, pr.ball)}</span><span class="uh-t"><small>${hero.milestone ? 'PAST EMPIRE UNLOCKED' : 'NEW NATION UNLOCKED'}</small><b>${esc(n.name)}</b><span>${esc(n.perk.name)}: ${esc(n.perk.desc)}</span></span><button class="play-btn uh-play" data-id="${hero.id}">PLAY AS ${esc(shortName(n.name).toUpperCase())}</button></div>`;
  })() : '';
  const rewards = o.newRewards.filter((r) => r !== hero).map((r) => `
    <button class="unl ${r.milestone ? 'ms' : ''}" data-level="${r.level}">
      <span class="unl-art">${rewardArt(r, 60, pr.ball)}</span>
      <span class="unl-t"><small>${r.milestone ? 'EMPIRE UNLOCKED' : `NEW ${kindLabel(r).toUpperCase()}`}</small><b>${esc(r.name)}</b></span>
    </button>`).join('');
  const achXp = o.achievements.reduce((s, a) => s + a.xp, 0);
  const SHOW = window.innerWidth < 761 ? 3 : 12;
  const ach = o.achievements.length ? `<span class="ach-h">${o.achievements.length === 1 ? 'NEW ACHIEVEMENT' : `${o.achievements.length} NEW ACHIEVEMENTS`} <b>+${fmtNum(achXp)} XP</b></span>${o.achievements.map((a, i) => `<span class="ach-pop${i >= SHOW ? ' more' : ''}">${medal(a)}<b>${esc(a.name)}</b><em>+${a.xp}</em></span>`).join('')}${o.achievements.length > SHOW ? `<button class="ach-all">+${o.achievements.length - SHOW} more ▾</button>` : ''}` : '';
  return `
    <div class="xp-card ${up ? 'up' : ''}">
      ${pr.signedIn ? '' : `<div class="guest-save"><span>${icon('user')}<b>This ${fmtNum(p.xp)} XP${o.newRewards.length ? ` and ${o.newRewards.length} ${o.newRewards.length === 1 ? 'reward' : 'rewards'}` : ''} will be lost when you leave.</b> A free account keeps it, and takes 10 seconds.</span><button class="play-btn gs-go">SAVE MY PROGRESS</button></div>`}
      <div class="xp-top">
        <b class="xp-gain">+<span class="xp-count">${pr.animate ? 0 : fmtNum(o.gained)}</span> XP</b>
        <div class="xp-lines">${chips}${sum.length > 1 ? `<span class="xp-sum">${sum.join(' + ')} = <b>${fmtNum(o.gained)} XP</b></span>` : ''}</div>
      </div>
      <div class="xp-row">${levelBadge(pr.animate ? o.before.level : o.after.level, 'xp-lv')}<div class="xpbar big"><i></i><s class="gain"></s></div><span class="xp-next"></span></div>
      ${nextLine}
      ${up ? `<div class="lvl-up"><div class="lu-head"><b>LEVEL ${o.before.level}<span class="lu-arrow">${icon('arrow')}</span>${o.after.level}!</b><span>${o.newRewards.length} new ${o.newRewards.length === 1 ? 'reward' : 'rewards'}</span><button class="xp-pass">Open Battle Pass</button></div>${heroCard}${rewards ? `<div class="unl-row ${o.newRewards.length - (hero ? 1 : 0) > 4 ? 'many' : ''}">${rewards}</div>` : ''}</div>` : ''}
      ${ach ? `<div class="ach-row">${ach}</div>` : ''}
      <div class="xp-save">${pr.signedIn ? pr.saveHtml() : `<span class="save-st guest">${icon('user')} Guest: this XP is lost when you leave.</span><button class="xp-make">Create account to keep it</button>`}</div>
    </div>`;
}

/** Fills the bar from where you were to where you are now, rolling over at each level up. */
function animateXp(root: HTMLElement, pr: ResultProgress): void {
  const o = pr.outcome;
  const bar = root.querySelector('.xp-card .xpbar i') as HTMLElement;
  const next = root.querySelector('.xp-next') as HTMLElement;
  const badge = root.querySelector('.xp-lv') as HTMLElement;
  const count = root.querySelector('.xp-count') as HTMLElement;
  const pct = (into: number, need: number, max: boolean) => (max ? 100 : (into / need) * 100);
  const label = (lv: number, into: number, need: number, max: boolean) => (max ? `${fmtNum(into)} / ${fmtNum(need)} XP to next ${STAR}` : `${fmtNum(into)} / ${fmtNum(need)} XP to Level ${lv + 1}`);
  const gain = root.querySelector('.xp-card .xpbar .gain') as HTMLElement;
  const finish = () => {
    bar.style.transition = 'none';
    bar.style.width = `${pct(o.after.into, o.after.need, o.after.max)}%`;
    // The part of the bar this match filled, in a lighter colour.
    const from = o.after.level === o.before.level ? pct(o.before.into, o.before.need, o.before.max) : 0;
    const to = pct(o.after.into, o.after.need, o.after.max);
    gain.style.left = `${from}%`;
    gain.style.width = `${Math.max(0, to - from)}%`;
    badge.innerHTML = `<small>LV</small>${o.after.level}`;
    next.textContent = label(o.after.level, o.after.into, o.after.need, o.after.max);
    count.textContent = fmtNum(o.gained);
  };
  if (!pr.animate) {
    finish();
    return;
  }
  bar.style.transition = 'none';
  bar.style.width = `${pct(o.before.into, o.before.need, o.before.max)}%`;
  next.textContent = label(o.before.level, o.before.into, o.before.need, o.before.max);
  const t0 = performance.now();
  const tick = (t: number) => {
    const k = Math.min(1, (t - t0) / 1300);
    count.textContent = fmtNum(o.gained * (1 - (1 - k) ** 3));
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  window.setTimeout(() => {
    bar.style.transition = 'width 0.9s cubic-bezier(0.3, 0.8, 0.4, 1)';
    if (o.after.level === o.before.level) {
      bar.style.width = `${pct(o.after.into, o.after.need, o.after.max)}%`;
      window.setTimeout(finish, 950);
      return;
    }
    bar.style.width = '100%';
    window.setTimeout(() => {
      badge.classList.add('lv-pop');
      badge.innerHTML = `<small>LV</small>${o.after.level}`;
      bar.style.transition = 'none';
      bar.style.width = '0%';
      requestAnimationFrame(() => requestAnimationFrame(() => {
        bar.style.transition = 'width 0.7s cubic-bezier(0.3, 0.8, 0.4, 1)';
        bar.style.width = `${pct(o.after.into, o.after.need, o.after.max)}%`;
        window.setTimeout(finish, 750);
      }));
      root.querySelector('.lvl-up')?.classList.add('show');
    }, 950);
  }, 350);
}

const fmtTime = (ticks: number) => {
  const s = Math.floor(ticks / TPS);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

const WIN_LINES = ['Superior. As predicted.', 'The world is yours. Please wipe your feet.', 'History will be written by you. In crayon.', 'Everyone agrees you are the best now. They have to.'];
const LOSE_LINES = ['Your flag has been repurposed as a tablecloth.', 'Annexed. It happens to the best of balls.', 'Your nation is now a fun fact.', 'Your anthem is now a ringtone in another country.'];

/** A funny title earned from how the match actually went. */
export function earnedTitle(game: Game, human: number, won: boolean): string {
  const me = game.players[human];
  const peak = me.stats.peakLand / game.world.landCells;
  const minutes = (me.alive || won ? game.tick : me.eliminatedAt) / TPS / 60;
  // The title names how you won, so two wins don't feel the same.
  if (won && me.stats.kills >= 4) return 'Professional Annexer';
  if (won && me.stats.bombs >= 5) return 'Chief Explosions Officer';
  if (won && me.stats.boats >= 7) return 'Grand Admiral of Bathtubs';
  if (won && me.markets >= 6) return 'Chairman of Everything';
  if (won && me.forts >= 6) return 'Wall Enthusiast';
  if (won && me.stats.citiesTaken >= 15) return 'Landlord of the World';
  if (won && me.barracks >= 12) return 'Bunk Bed Baron';
  if (won && minutes < 3.5) return 'Speedrun Emperor';
  if (won) return 'Accidental Emperor';
  if (me.stats.bombs >= 4) return 'Enthusiastic Demolitionist';
  if (me.stats.boats >= 4) return 'Admiral of Bathtubs';
  if (me.stats.citiesTaken >= 6) return 'Landlord of Too Much';
  if (peak >= 0.25) return 'Almost Emperor';
  if (me.stats.kills >= 1) return 'Took Someone With Them';
  if (minutes < 2) return 'Brief Historical Footnote';
  return 'Respectable Speed Bump';
}

/** Dark nation colours get lifted so their line stands out from the dark chart panel (at least 3:1). */
function lineColor(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  let [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const lum = (v: number) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const panelLum = 0.012;
  for (let i = 0; i < 12; i++) {
    const l = 0.2126 * lum(r) + 0.7152 * lum(g) + 0.0722 * lum(b);
    if ((l + 0.05) / (panelLum + 0.05) >= 3.2) break;
    r += (255 - r) * 0.14;
    g += (255 - g) * 0.14;
    b += (255 - b) * 0.14;
  }
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

/** Land share over time. You and the top rivals get colour and a direct label; everyone else recedes. */
function chart(game: Game, human: number): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'chart';
  const hist = game.history;
  // On a phone the chart is drawn smaller in chart units, so its text comes out larger on screen.
  const narrow = window.innerWidth < 761;
  const W = narrow ? 430 : 640;
  const H = narrow ? 190 : 200;
  const pad = { l: 40, r: narrow ? 104 : 128, t: 10, b: 24 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;

  let maxShare = 0.2;
  for (const h of hist) for (const v of h.share) if (v > maxShare) maxShare = v;
  maxShare = Math.min(1, Math.ceil(maxShare * 5) / 5);
  const lastTick = hist[hist.length - 1]?.tick || 1;
  const x = (t: number) => pad.l + (t / lastTick) * iw;
  const y = (v: number) => pad.t + ih - (v / maxShare) * ih;

  const peak = (p: Player) => Math.max(...hist.map((h) => h.share[p.id] ?? 0));
  const highlighted = game.players.slice(1).sort((a, b) => peak(b) - peak(a)).slice(0, 3);
  if (!highlighted.some((p) => p.id === human)) highlighted.push(game.players[human]);
  const others = game.players.slice(1).filter((p) => !highlighted.includes(p));
  const path = (p: Player) => hist.map((h, i) => `${i === 0 ? 'M' : 'L'}${x(h.tick).toFixed(1)} ${y(h.share[p.id] ?? 0).toFixed(1)}`).join('');

  let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Land share over time for each nation">`;
  for (let v = 0; v <= maxShare + 1e-6; v += 0.2) {
    svg += `<line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${pad.l - 7}" y="${y(v) + 4}" text-anchor="end">${Math.round(v * 100)}%</text>`;
  }
  const minutes = lastTick / TPS / 60;
  const step = minutes > 8 ? 2 : 1;
  for (let m = 0; m <= minutes; m += step) {
    svg += `<text class="ax" x="${x(m * 60 * TPS)}" y="${H - 6}" text-anchor="middle">${m}m</text>`;
  }
  for (const p of others) svg += `<path class="line-other" d="${path(p)}"/>`;
  for (const p of highlighted) svg += `<path class="line-main${p.id === human ? ' me' : ''}" stroke="${lineColor(p.nation.fill)}" d="${path(p)}"/>`;

  // Direct labels at each line's end, nudged apart so they never collide.
  const labels = highlighted.map((p) => ({ p, y: y(hist[hist.length - 1].share[p.id] ?? 0) + 4 })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < labels.length; i++) if (labels[i].y - labels[i - 1].y < 15) labels[i].y = labels[i - 1].y + 15;
  const over = labels.length ? labels[labels.length - 1].y - (H - pad.b + 4) : 0;
  if (over > 0) labels.forEach((l) => { l.y -= over; });
  for (const l of labels) {
    const name = l.p.id === human ? 'You' : l.p.nation.name;
    const short = name.length > 14 ? `${name.slice(0, 13)}…` : name;
    svg += `<circle cx="${W - pad.r + 10}" cy="${l.y - 4}" r="4.5" fill="${lineColor(l.p.nation.fill)}"/><text class="end${l.p.id === human ? ' me' : ''}" x="${W - pad.r + 19}" y="${l.y}">${short}</text>`;
  }
  svg += `<line class="cross hidden" y1="${pad.t}" y2="${H - pad.b}"/></svg>`;
  wrap.innerHTML = `<div class="chart-title">Land share over time</div>${svg}<div class="chart-tip hidden"></div>`;

  // Hover crosshair with exact values; the numbers stay available without crowding the plot.
  const svgEl = wrap.querySelector('svg') as SVGSVGElement;
  const cross = wrap.querySelector('.cross') as SVGLineElement;
  const tip = wrap.querySelector('.chart-tip') as HTMLElement;
  svgEl.addEventListener('pointermove', (ev) => {
    const rect = svgEl.getBoundingClientRect();
    const sx = ((ev.clientX - rect.left) / rect.width) * W;
    if (sx < pad.l || sx > W - pad.r) {
      cross.classList.add('hidden');
      tip.classList.add('hidden');
      return;
    }
    const t = ((sx - pad.l) / iw) * lastTick;
    let idx = 0;
    for (let i = 0; i < hist.length; i++) if (Math.abs(hist[i].tick - t) < Math.abs(hist[idx].tick - t)) idx = i;
    const h = hist[idx];
    cross.setAttribute('x1', `${x(h.tick)}`);
    cross.setAttribute('x2', `${x(h.tick)}`);
    cross.classList.remove('hidden');
    tip.classList.remove('hidden');
    const rows = highlighted.slice().sort((a, b) => (h.share[b.id] ?? 0) - (h.share[a.id] ?? 0)).map((p) =>
      `<div><i style="background:${lineColor(p.nation.fill)}"></i>${p.id === human ? 'You' : p.nation.name}<b>${((h.share[p.id] ?? 0) * 100).toFixed(1)}%</b></div>`).join('');
    tip.innerHTML = `<em>${fmtTime(h.tick)}</em>${rows}`;
    tip.style.left = `${Math.min(rect.width - 170, Math.max(0, ev.clientX - rect.left + 12))}px`;
  });
  svgEl.addEventListener('pointerleave', () => {
    cross.classList.add('hidden');
    tip.classList.add('hidden');
  });
  return wrap;
}

/** Builds the 1200x630 image people post: a bright world, a big ball, the earned title, and a dig at a rival. */
function makeShareCard(game: Game, human: number, won: boolean, place: number, title: string, line: string, endedAt: number, map: HTMLCanvasElement | null): HTMLCanvasElement {
  const W = 1200;
  const H = 630;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  const me = game.players[human];

  ctx.fillStyle = '#134a7a';
  ctx.fillRect(0, 0, W, H);
  if (map) {
    const k = Math.max(W / map.width, H / map.height);
    const dw = map.width * k;
    const dh = map.height * k;
    ctx.drawImage(map, (W - dw) / 2, (H - dh) / 2, dw, dh);
  }
  // Only a light wash where text sits: the bright world is the card's best asset.
  const wash = ctx.createLinearGradient(0, 0, W * 0.72, 0);
  wash.addColorStop(0, 'rgba(27,21,48,0.56)');
  wash.addColorStop(1, 'rgba(27,21,48,0)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, W, H);

  const display = '"Lilita One", "Trebuchet MS", sans-serif';
  const text = (s: string, x: number, y: number, size: number, fill: string, stroke = 8) => {
    ctx.font = `${size}px ${display}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.lineWidth = stroke;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1b1530';
    ctx.strokeText(s, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(s, x, y);
  };
  const wrapped = (s: string, x: number, y: number, maxW: number, lh: number, size: number, fill: string): number => {
    ctx.font = `${size}px ${display}`;
    let cur = '';
    let yy = y;
    for (const word of s.split(' ')) {
      const next = cur ? `${cur} ${word}` : word;
      if (ctx.measureText(next).width > maxW && cur) {
        text(cur, x, yy, size, fill, 6);
        ctx.font = `${size}px ${display}`;
        cur = word;
        yy += lh;
      } else cur = next;
    }
    text(cur, x, yy, size, fill, 6);
    return yy;
  };

  // The mascot, at about half the card's height.
  drawBall(ctx, 176, 356, 128, me.nation, { expr: won ? 'happy' : 'dead' });

  text(won ? 'VICTORY!' : 'ANNEXED!', 330, 104, 84, won ? '#ffd23f' : '#ffffff', 13);
  text(title, 332, 168, 50, '#7fd4ff', 10);
  wrapped(line, 334, 222, 800, 36, 30, '#ffffff');

  const stats = [
    [`#${place}`, `of ${game.nPlayers - 1}`],
    [`${(me.stats.peakLand / game.world.landCells * 100).toFixed(0)}%`, 'peak land'],
    [fmtTime(endedAt), 'match time'],
  ];
  stats.forEach(([big, small], i) => {
    const x = 334 + i * 158;
    ctx.fillStyle = 'rgba(27,21,48,0.86)';
    ctx.beginPath();
    ctx.roundRect(x, 318, 146, 92, 14);
    ctx.fill();
    text(big, x + 14, 366, 42, '#ffffff', 5);
    text(small, x + 14, 396, 21, '#cfc7ee', 4);
  });

  // The taunt: name the rival, and show them looking sorry for themselves.
  const peak = (p: Player) => Math.max(...game.history.map((h) => h.share[p.id] ?? 0));
  const others = game.players.slice(1).filter((p) => p.id !== human);
  const rival = won ? others.sort((a, b) => peak(b) - peak(a))[0] : (game.winner > 0 ? game.players[game.winner] : others.sort((a, b) => b.land - a.land)[0]);
  if (rival) {
    const gag = won ? `${rival.nation.name} never recovered.` : `${rival.nation.name} says thanks for the land.`;
    drawBall(ctx, 92, 556, 44, rival.nation, { expr: won ? 'sad' : 'smug' });
    ctx.font = `30px ${display}`;
    const tw = ctx.measureText(gag).width;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#1b1530';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(150, 526, tw + 32, 56, 16);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#1b1530';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(gag, 166, 555);
  }

  text(won ? `Can you beat ${fmtTime(endedAt)}?` : 'Can you do better?', 800, 524, 40, '#ffffff', 8);
  text('SUPERIORITYLAND', 800, 580, 42, '#ffd23f', 9);
  ctx.font = `42px ${display}`;
  const logoW = ctx.measureText('SUPERIORITYLAND').width;
  text('.io', 800 + logoW + 3, 580, 32, '#7fd4ff', 7);
  return c;
}

async function shareCard(card: HTMLCanvasElement, summary: string): Promise<'shared' | 'saved' | 'cancelled'> {
  const blob = await new Promise<Blob | null>((res) => card.toBlob(res, 'image/png'));
  if (!blob) return 'cancelled';
  const file = new File([blob], 'superiorityland-result.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Superiorityland.io', text: summary });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return 'saved';
}

/** The choices that shaped this run, so the screen shows consequences and not only numbers. */
function buildSummary(me: Player): string {
  const cards = me.cards.map((id) => {
    const c = cardById(id);
    return `<span class="bs-card" title="${c.desc}"><span class="ic">${icon(c.icon)}</span>${c.name}</span>`;
  }).join('');
  const built = [
    me.forts ? `${me.forts} ${plural(me.forts, 'fort', 'forts')}` : '',
    me.barracks ? `${me.barracks} barracks` : '',
    me.markets ? `${me.markets} ${plural(me.markets, 'market', 'markets')}` : '',
    me.stats.bombs ? `${me.stats.bombs} ${plural(me.stats.bombs, 'boom', 'booms')}` : '',
    me.stats.boats ? `${me.stats.boats} ${plural(me.stats.boats, 'boat', 'boats')}` : '',
  ].filter(Boolean).join(' \u2022 ');
  if (!cards && !built) return '';
  return `<div class="build-sum"><b>Your strategy</b>${cards ? `<div class="bs-row">${cards}</div>` : ''}${built ? `<div class="bs-built">${built}</div>` : ''}</div>`;
}

export function showResults(root: HTMLElement, game: Game, human: number, actions: ResultActions): void {
  const me = game.players[human];
  const won = game.winner === human;
  const final = game.phase === 'over';
  const place = won ? 1 : me.place || game.ranking().indexOf(me) + 1;
  const total = game.nPlayers - 1;
  const lines = won ? WIN_LINES : LOSE_LINES;
  const line = lines[Math.floor(Math.random() * lines.length)];
  const winner = final && game.winner > 0 ? game.players[game.winner] : null;
  const endedAt = me.alive || won ? game.tick : me.eliminatedAt;
  const title = earnedTitle(game, human, won);

  root.classList.remove('hidden');
  root.innerHTML = `
    <div class="panel res ${won ? 'won' : 'lost'}">
      <div class="res-body">
      <div class="res-left">
        <div class="res-ball">
          ${won && me.nation.hat !== 'crown' ? `<span class="res-crown">${icon('crown')}</span>` : ''}
          <img src="${ballPortrait(me.nation, 220, won ? 'happy' : 'dead')}" alt="" />
        </div>
        <div class="res-txt">
          <h2>${won ? 'VICTORY!' : 'ANNEXED!'}</h2>
          <div class="res-title"><small>MATCH AWARD</small>${title}</div>
          <p class="res-line">${line}</p>
          <div class="res-place">Finished <b>#${place}</b> of ${total}</div>
          ${!won && winner ? `<p class="res-winner"><img src="${ballPortrait(winner.nation, 44, 'smug')}" alt="" />${winner.nation.name} took the world.</p>` : ''}
        </div>
      </div>
      ${actions.progress ? xpCard(actions.progress) : ''}
      <div class="res-right">
        <div class="stat-row">
          <div class="stat"><b>${(me.stats.peakLand / game.world.landCells * 100).toFixed(1)}%</b><span>Peak land</span></div>
          <div class="stat"><b>${me.stats.citiesTaken}</b><span>${plural(me.stats.citiesTaken, 'City', 'Cities')} seized</span></div>
          <div class="stat"><b>${me.stats.kills}</b><span>${plural(me.stats.kills, 'Nation', 'Nations')} you ended</span></div>
          <div class="stat"><b>${fmtTime(endedAt)}</b><span>Time</span></div>
        </div>
        <div class="res-chart"></div>
        ${buildSummary(me)}
      </div>
      </div>
        <div class="res-btns">
          <button class="play-btn res-again">PLAY AGAIN</button>
          <button class="big-btn share res-share"><span class="ic">${icon('share')}</span><span class="res-share-t">Share result</span></button>
          ${!final && actions.spectate ? '<button class="big-btn res-spec">Keep watching</button>' : ''}
          <button class="big-btn res-menu">Main menu</button>
        </div>
    </div>`;
  (root.querySelector('.res-chart') as HTMLElement).append(chart(game, human));
  const pr = actions.progress;
  if (pr) {
    animateXp(root, pr);
    if (!pr.animate) root.querySelector('.lvl-up')?.classList.add('show');
    root.querySelector('.xp-pass')?.addEventListener('click', () => pr.openPass(pr.outcome.newRewards[0]?.level));
    root.querySelectorAll<HTMLElement>('.unl').forEach((b) => b.addEventListener('click', () => pr.openPass(Number(b.dataset.level))));
    root.querySelector('.xp-make')?.addEventListener('click', () => pr.createAccount());
    root.querySelector('.gs-go')?.addEventListener('click', () => pr.createAccount());
    root.querySelector('.uh-play')?.addEventListener('click', (e) => pr.playAs((e.currentTarget as HTMLElement).dataset.id as string));
    root.querySelector('.ach-all')?.addEventListener('click', (e) => {
      root.querySelector('.ach-row')?.classList.add('open');
      (e.currentTarget as HTMLElement).remove();
    });
    const save = root.querySelector('.xp-save') as HTMLElement;
    const off = pr.onSaveChange(() => {
      if (!root.contains(save)) {
        off();
        return;
      }
      if (pr.signedIn || save.querySelector('.save-st.ok, .save-st.saving')) save.innerHTML = pr.saveHtml();
    });
  }
  (root.querySelector('.res-again') as HTMLElement).addEventListener('click', actions.again);
  (root.querySelector('.res-menu') as HTMLElement).addEventListener('click', actions.menu);
  root.querySelector('.res-spec')?.addEventListener('click', () => actions.spectate?.());
  const shareBtn = root.querySelector('.res-share') as HTMLButtonElement;
  shareBtn.addEventListener('click', async () => {
    const card = makeShareCard(game, human, won, place, title, line, endedAt, actions.snapshot());
    actions.onCard?.(card);
    const label = shareBtn.querySelector('.res-share-t') as HTMLElement;
    const outcome = await shareCard(card, `${won ? 'I took over the world' : 'I got annexed'} as ${me.nation.name} in Superiorityland.io. Title earned: ${title}.`);
    if (outcome !== 'cancelled') label.textContent = outcome === 'shared' ? 'Shared!' : 'Image saved!';
  });
}
