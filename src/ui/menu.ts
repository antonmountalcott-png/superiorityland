import type { Difficulty } from '../core/balance';
import { EMPIRES, NATIONS, type Nation, isEmpire, nationById } from '../core/nations';
import { DAILY_XP, WEEKLY_XP, dailyChallenges, dailyFor, firstMatchXp, levelInfo, msToMidnight, owns, unlockLevel, unseenRewards, weeklyChallenges, weeklyFor } from '../core/progress';
import { SKILLS, skillById } from '../core/skills';
import type { MapType } from '../core/worldgen';
import type { Account } from '../game/account';
import { type Expression, ballPortrait, drawBall } from '../render/ballArt';
import { avatar, esc, fmtLeft, fmtNum, levelBadge, titleName, xpBar, xpText } from './progressUi';
import { icon, inputWords } from './svg';

export interface MenuChoice {
  nation: Nation;
  bots: number;
  difficulty: Difficulty;
  map: MapType;
}

export interface MenuActions {
  play(c: MenuChoice): void;
  openPass(level?: number): void;
  openProfile(): void;
  openAuth(): void;
}

const STORE_KEY = 'superiorityland.choice';

const load = (): Partial<{ bots: number; difficulty: Difficulty; map: MapType }> => {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}');
  } catch {
    return {};
  }
};

const seg = <T extends string | number>(title: string, options: { v: T; label: string }[], current: T, onPick: (v: T) => void): HTMLElement => {
  const wrap = document.createElement('div');
  wrap.className = 'seg-wrap';
  wrap.innerHTML = `<label>${title}</label>`;
  const row = document.createElement('div');
  row.className = 'seg';
  for (const o of options) {
    const b = document.createElement('button');
    b.textContent = o.label;
    b.classList.toggle('on', o.v === current);
    b.addEventListener('click', () => {
      row.querySelectorAll('button').forEach((n) => n.classList.remove('on'));
      b.classList.add('on');
      onPick(o.v);
    });
    row.append(b);
  }
  wrap.append(row);
  return wrap;
};

/** The title screen doubles as setup: one screen and one click from landing to playing. */
export class Menu {
  readonly root: HTMLElement;
  private hero!: HTMLCanvasElement;
  private choice: MenuChoice;
  /** The ball on show. It can be a locked one being previewed; you can only play one you own. */
  private preview: Nation;
  private exprClock = 0;
  private expr: Expression = 'smug';
  private bounce = 0;
  private toastTimer = 0;

  constructor(root: HTMLElement, private account: Account, private actions: MenuActions) {
    this.root = root;
    const saved = load();
    const start = nationById(account.progress.equipped.ball);
    this.choice = { nation: start, bots: saved.bots ?? 11, difficulty: saved.difficulty ?? 'recruit', map: saved.map ?? 'continents' };
    this.preview = start;

    root.innerHTML = `
      <div class="acct-bar"></div>
      <div class="menu-inner">
        <div class="menu-toast hidden" role="status"></div>
        <header class="logo-wrap">
          <h1 class="logo"><span class="l1">SUPERIORITY</span><span class="l2">LAND<small>.io</small></span></h1>
          <p class="tagline">Every ball thinks its land is superior. Prove it.</p>
          <img class="kb k1" src="${ballPortrait(NATIONS[3], 180, 'angry')}" alt="" />
          <img class="kb k3" src="${ballPortrait(NATIONS[11], 180, 'angry')}" alt="" />
        </header>
        <section class="panel menu-panel">
          <div class="hero">
            <canvas class="hero-canvas"></canvas>
            <span class="hero-tag hidden"></span>
            <h2 class="hero-name"></h2>
            <p class="hero-motto"></p>
            <div class="daily"></div>
            <div class="hero-perk"></div>
          </div>
          <div class="pick">
            <div class="pick-title">CHOOSE YOUR NATION</div>
            <div class="nation-grid nations"></div>
            <div class="pick-title emp">PAST EMPIRES <span>unlock in the Battle Pass</span></div>
            <div class="nation-grid empires"></div>
            <div class="skill-row">
              <button class="skill-cur"></button>
            </div>
            <button class="set-toggle"><span class="set-sum"></span><span class="set-open">Change</span></button>
            <div class="settings hidden"></div>
            <button class="play-btn"></button>
            <p class="how">${inputWords('Tap the map to send your army. Grab land, grow, take over the world.')}</p>
          </div>
        </section>
      </div>
      <div class="skill-modal hidden" role="dialog" aria-label="Choose a special skill"><div class="sm-back"></div><div class="panel skill-list"></div></div>`;

    this.hero = root.querySelector('.hero-canvas') as HTMLCanvasElement;
    const addTiles = (grid: HTMLElement, list: Nation[]) => {
      for (const n of list) {
        const b = document.createElement('button');
        b.className = 'nation-btn';
        b.dataset.id = n.id;
        b.innerHTML = `<img src="${ballPortrait(n, 64, 'neutral')}" alt="" /><span class="nb-lock"></span>`;
        b.addEventListener('click', () => this.select(n));
        grid.append(b);
      }
    };
    addTiles(root.querySelector('.nations') as HTMLElement, NATIONS);
    addTiles(root.querySelector('.empires') as HTMLElement, EMPIRES);

    const settings = root.querySelector('.settings') as HTMLElement;
    settings.append(
      seg<number>('Rivals', [{ v: 7, label: '7' }, { v: 11, label: '11' }, { v: 15, label: '15' }], this.choice.bots, (v) => this.update({ bots: v })),
      seg<Difficulty>('Difficulty', [{ v: 'recruit', label: 'Easy' }, { v: 'general', label: 'Normal' }, { v: 'supreme', label: 'Hard' }], this.choice.difficulty, (v) => this.update({ difficulty: v })),
      seg<MapType>('World', [{ v: 'continents', label: 'Continents' }, { v: 'pangaea', label: 'Pangaea' }, { v: 'archipelago', label: 'Islands' }], this.choice.map, (v) => this.update({ map: v })),
    );

    // Settings stay folded behind a one-line summary: a new player only needs PLAY.
    (root.querySelector('.set-toggle') as HTMLElement).addEventListener('click', () => {
      const open = settings.classList.toggle('hidden');
      (root.querySelector('.set-toggle .set-open') as HTMLElement).textContent = open ? 'Change' : 'Done';
    });
    (root.querySelector('.skill-cur') as HTMLElement).addEventListener('click', () => this.skillModal(true));
    (root.querySelector('.sm-back') as HTMLElement).addEventListener('click', () => this.skillModal(false));
    (root.querySelector('.play-btn') as HTMLElement).addEventListener('click', () => {
      if (owns(this.account.progress, 'ball', this.preview.id)) this.actions.play(this.choice);
      else this.actions.openPass(unlockLevel('ball', this.preview.id));
    });
    this.refreshSummary();
    account.onChange(() => this.refresh());
    this.refresh();
    // Keep the countdown honest while the title screen sits open.
    window.setInterval(() => { if (this.visible) this.renderDaily(); }, 30000);
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.skillModal(false); });
  }

  private skillModal(open: boolean): void {
    (this.root.querySelector('.skill-modal') as HTMLElement).classList.toggle('hidden', !open);
    this.renderSkills();
  }

  /** Today's three challenges, what each is worth, and when new ones arrive. */
  private renderDaily(): void {
    const p = this.account.progress;
    const now = Date.now();
    const d = dailyFor(p, now);
    const list = dailyChallenges(d.day);
    const done = list.filter((c) => d.done.includes(c.id)).length;
    const w = weeklyFor(p, now);
    const wDone = weeklyChallenges(w.week).filter((c) => w.done.includes(c.id)).length;
    // Today's streak day: the one already paid, or the one the next match will pay.
    const day = d.first ? d.streak : d.streak + 1;
    const el = this.root.querySelector('.daily') as HTMLElement;
    el.innerHTML = `
      <div class="dl-head"><b>${icon('flame')}DAILY CHALLENGES <em>${done}/3</em></b><span>New in ${fmtLeft(msToMidnight(now))}</span></div>
      ${list.map((c) => `<div class="dl-row ${d.done.includes(c.id) ? 'done' : ''}"><span class="dl-box">${d.done.includes(c.id) ? icon('check') : ''}</span><span class="dl-n">${esc(c.name)}</span><b>+${DAILY_XP}</b></div>`).join('')}
      <div class="dl-bonus ${d.first ? 'done' : ''}"><span class="dl-tag">BONUS</span><span class="dl-n">First match today${day > 1 ? ` · day ${day} streak` : ''}<small>Day 1 +100, then +25 a day to +250 on day 7</small></span><b>${d.first ? icon('check') : `+${firstMatchXp(day)}`}</b></div>
      <button class="dl-week"><span>WEEKLY <em>${wDone}/3</em></span><span class="dl-n">Harder challenges, +${WEEKLY_XP} XP each</span><b>View ›</b></button>`;
    (el.querySelector('.dl-week') as HTMLElement).addEventListener('click', () => this.actions.openPass());
  }

  /** Re-reads the account: name, level, what is unlocked, what is equipped. */
  refresh(): void {
    const p = this.account.progress;
    const owned = owns(p, 'ball', this.choice.nation.id);
    if (!owned || this.choice.nation.id !== p.equipped.ball) {
      const eq = nationById(p.equipped.ball);
      this.choice.nation = eq;
      if (owns(p, 'ball', this.preview.id) || this.preview === this.choice.nation) this.preview = eq;
    }
    this.renderBar();
    this.root.querySelectorAll<HTMLElement>('.nation-btn').forEach((b) => {
      const id = b.dataset.id as string;
      const got = owns(p, 'ball', id);
      b.classList.toggle('locked', !got);
      b.title = got ? nationById(id).name : `${nationById(id).name}: unlocks at Level ${unlockLevel('ball', id)}`;
      b.setAttribute('aria-label', b.title);
      (b.querySelector('.nb-lock') as HTMLElement).innerHTML = got ? '' : `${icon('lock')}<b>${unlockLevel('ball', id)}</b>`;
    });
    this.renderSkills();
    this.renderDaily();
    this.showHero();
  }

  private renderBar(): void {
    const a = this.account;
    const p = a.progress;
    const info = levelInfo(p.xp);
    const fresh = unseenRewards(p).length;
    const bar = this.root.querySelector('.acct-bar') as HTMLElement;
    bar.innerHTML = `
      <button class="acct-chip" aria-label="Open profile">
        ${avatar(p.equipped.ball, p.equipped.frame, 46)}
        <span class="ac-txt"><b>${esc(a.username ?? 'Guest')}</b><small>${a.signedIn ? esc(titleName(p.equipped.title)) : 'Progress not saved'}</small><span class="ac-mini">${xpBar(info)}<em>${info.max ? `★${info.stars}` : `${fmtNum(info.into)}/${fmtNum(info.need)} XP`}</em></span></span>
        <span class="ac-lv">${levelBadge(info.level, '', info.stars)}<span class="ac-xp">${xpBar(info)}<small>${xpText(info)}</small></span></span>
        <span class="ac-go">${icon('user')}<span>Profile</span></span>
      </button>
      ${a.signedIn ? '' : `<button class="acct-make">${icon('user')}<span>Create account<small>to save progress</small></span></button>`}
      <button class="pass-btn" aria-label="Open Battle Pass">
        <span class="ic">${icon('ticket')}</span>
        <span class="pb-txt"><b><span class="pb-full">BATTLE </span>PASS</b><small>Level ${info.level} of 30${info.stars ? ` · ★${info.stars}` : ''}</small></span>
        ${fresh ? `<span class="pb-new">${fresh}<small>NEW</small></span>` : ''}
      </button>`;
    (bar.querySelector('.acct-chip') as HTMLElement).addEventListener('click', () => this.actions.openProfile());
    (bar.querySelector('.pass-btn') as HTMLElement).addEventListener('click', () => this.actions.openPass());
    bar.querySelector('.acct-make')?.addEventListener('click', () => this.actions.openAuth());
  }

  private renderSkills(): void {
    const p = this.account.progress;
    const cur = skillById(p.equipped.skill);
    const btn = this.root.querySelector('.skill-cur') as HTMLElement;
    btn.innerHTML = `
      <span class="sk-ic" style="background:${cur?.color ?? '#6a5fa8'}">${icon(cur?.icon ?? 'star')}</span>
      <span class="sk-txt"><small>SPECIAL SKILL</small><b>${cur ? esc(cur.name) : 'None'}</b><em>${cur ? esc(cur.desc) : 'Pick a skill to take into battle.'}</em></span>
      <span class="set-open">Change</span>`;
    const list = this.root.querySelector('.skill-list') as HTMLElement;
    const owned = SKILLS.filter((s) => owns(p, 'skill', s.id)).length;
    list.innerHTML = `<div class="sm-head"><h3>${icon('star')}Special skill</h3><button class="sm-x" aria-label="Close">${icon('close')}</button></div><p class="sm-sub">Take one into each match. It is a small, always-on bonus. You own ${owned} of ${SKILLS.length}; the rest unlock in the Battle Pass.</p><div class="sm-grid">` + SKILLS.map((s) => {
      const got = owns(p, 'skill', s.id);
      return `<button class="sk ${p.equipped.skill === s.id ? 'on' : ''} ${got ? '' : 'locked'}" data-id="${s.id}" ${got ? '' : 'disabled'} title="${esc(s.desc)}">
        <span class="sk-ic" style="background:${s.color}">${icon(s.icon)}</span><span class="sk-n"><b>${esc(s.name)}${got ? '' : ` <small>Level ${unlockLevel('skill', s.id)}</small>`}</b><span>${esc(s.desc)}</span></span>
        ${got ? (p.equipped.skill === s.id ? `<span class="sk-lock">${icon('check')}</span>` : '') : `<span class="sk-lock">${icon('lock')}</span>`}
      </button>`;
    }).join('') + '</div>';
    (list.querySelector('.sm-x') as HTMLElement).addEventListener('click', () => this.skillModal(false));
    list.querySelectorAll<HTMLButtonElement>('.sk:not(.locked)').forEach((b) => b.addEventListener('click', () => {
      this.account.update((q) => { q.equipped.skill = b.dataset.id as string; });
      this.skillModal(false);
    }));
  }

  private refreshSummary(): void {
    const el = this.root.querySelector('.set-sum');
    if (!el) return;
    const difficulty = { recruit: 'Easy', general: 'Normal', supreme: 'Hard' }[this.choice.difficulty];
    const world = { continents: 'Continents', pangaea: 'Pangaea', archipelago: 'Islands' }[this.choice.map];
    el.textContent = `${this.choice.bots} rivals • ${difficulty} • ${world}`;
  }

  /** Where the title UI sits, so the living map behind it can keep clear. */
  rects(): { x0: number; y0: number; x1: number; y1: number }[] {
    return ['.logo-wrap', '.menu-panel', '.acct-bar'].map((sel) => {
      const r = (this.root.querySelector(sel) as HTMLElement).getBoundingClientRect();
      return { x0: r.left - 30, y0: r.top - 10, x1: r.right + 30, y1: r.bottom + 10 };
    });
  }

  private update(p: Partial<MenuChoice>): void {
    Object.assign(this.choice, p);
    this.refreshSummary();
    try {
      const { bots, difficulty, map } = this.choice;
      localStorage.setItem(STORE_KEY, JSON.stringify({ bots, difficulty, map }));
    } catch {
      // Private browsing: settings just will not persist.
    }
  }

  /** Shows a ball. Owned ones become your pick; locked ones are a preview with the level that unlocks them. */
  select(n: Nation): void {
    this.preview = n;
    if (owns(this.account.progress, 'ball', n.id)) {
      this.choice.nation = n;
      if (this.account.progress.equipped.ball !== n.id) this.account.update((p) => { p.equipped.ball = n.id; });
    }
    this.bounce = 1;
    this.expr = 'happy';
    this.exprClock = 1.1;
    this.showHero();
  }

  private showHero(): void {
    const n = this.preview;
    const got = owns(this.account.progress, 'ball', n.id);
    this.root.querySelectorAll<HTMLElement>('.nation-btn').forEach((b) => b.classList.toggle('on', b.dataset.id === n.id));
    (this.root.querySelector('.hero-name') as HTMLElement).textContent = n.name;
    (this.root.querySelector('.hero-motto') as HTMLElement).textContent = `"${n.motto}"`;
    (this.root.querySelector('.hero-perk') as HTMLElement).innerHTML = `<b>${esc(n.perk.name)}</b><span>${esc(n.perk.desc)}</span><small>In matches against computer nations</small>`;
    const tag = this.root.querySelector('.hero-tag') as HTMLElement;
    tag.classList.toggle('hidden', !isEmpire(n.id) && got);
    tag.className = `hero-tag ${got ? '' : 'locked'} ${isEmpire(n.id) ? 'emp' : ''}${!isEmpire(n.id) && got ? ' hidden' : ''}`;
    tag.innerHTML = got ? 'PAST EMPIRE' : `${icon('lock')} ${isEmpire(n.id) ? 'EMPIRE · ' : ''}LEVEL ${unlockLevel('ball', n.id)}`;
    (this.root.querySelector('.hero') as HTMLElement).classList.toggle('locked', !got);
    const play = this.root.querySelector('.play-btn') as HTMLButtonElement;
    play.classList.toggle('locked', !got);
    play.innerHTML = got ? 'PLAY' : `<span class="pl-l">${icon('lock')} UNLOCKS AT LEVEL ${unlockLevel('ball', n.id)}</span><small>See it in the Battle Pass</small>`;
  }

  /** `more` is dropped on small screens, where the toast must stay one short line. */
  toast(text: string, more = ''): void {
    const t = this.root.querySelector('.menu-toast') as HTMLElement;
    t.innerHTML = `${icon('check')}<span>${esc(text)}${more ? `<span class="t-more"> ${esc(more)}</span>` : ''}</span>`;
    t.classList.remove('hidden');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => t.classList.add('hidden'), 3200);
  }

  setVisible(v: boolean): void {
    this.root.classList.toggle('hidden', !v);
  }

  get visible(): boolean {
    return !this.root.classList.contains('hidden');
  }

  animate(time: number, dt: number): void {
    const c = this.hero;
    const rect = c.getBoundingClientRect();
    if (rect.width === 0) return;
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.round(rect.width * scale);
    const H = Math.round(rect.height * scale);
    if (c.width !== W || c.height !== H) {
      c.width = W;
      c.height = H;
    }
    const ctx = c.getContext('2d') as CanvasRenderingContext2D;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    this.exprClock -= dt;
    if (this.exprClock <= 0) {
      const moods: Expression[] = ['smug', 'neutral', 'smug', 'happy', 'angry'];
      this.expr = moods[Math.floor(Math.random() * moods.length)];
      this.exprClock = 1.6 + Math.random() * 2.2;
    }
    this.bounce = Math.max(0, this.bounce - dt * 1.6);

    const r = Math.min(rect.width, rect.height) * 0.33;
    const cx = rect.width / 2;
    const cy = rect.height * 0.6;
    const breathe = Math.sin(time * 2.4) * 0.02;
    const b = Math.sin(this.bounce * Math.PI * 3) * this.bounce;
    const jump = Math.abs(b) * r * 0.42;
    drawBall(ctx, cx, cy - jump, r, this.preview, {
      expr: this.expr,
      lookX: Math.sin(time * 0.8) * 0.7,
      lookY: Math.cos(time * 0.53) * 0.3,
      blink: time % 3.7 < 0.13,
      squashX: 1 - breathe - b * 0.08,
      squashY: 1 + breathe + b * 0.08,
    });
  }
}
