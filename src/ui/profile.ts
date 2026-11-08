import { ACHIEVEMENTS, FRAMES, MAX_LEVEL, TIER_NAME, TITLES, achievementById, achievementTier, dailyFor, levelInfo, ownedBalls, owns, unlockLevel } from '../core/progress';
import { nationById } from '../core/nations';
import { skillById } from '../core/skills';
import { ballPortrait } from '../render/ballArt';
import { ALL_BALLS } from '../core/nations';
import type { Account } from '../game/account';
import { avatar, esc, fmtNum, fmtTime, levelBadge, medal, saveLine, titlePill, xpBar, xpText } from './progressUi';
import { icon } from './svg';

export interface ProfileActions {
  close(): void;
  logout(): void;
  createAccount(): void;
}


/** Who you are in this game: level, look, record and the achievements you chose to show off. */
export class ProfileScreen {
  private off: (() => void) | null = null;
  private note = '';

  constructor(private root: HTMLElement, private account: Account, private actions: ProfileActions) {}

  open(): void {
    this.note = '';
    this.root.classList.remove('hidden');
    this.render();
    this.off?.();
    this.off = this.account.onChange(() => this.render());
  }

  close(): void {
    this.off?.();
    this.off = null;
    this.root.classList.add('hidden');
    this.root.innerHTML = '';
  }

  private render(): void {
    const a = this.account;
    const p = a.progress;
    const info = levelInfo(p.xp);
    const s = p.stats;
    const earned = ACHIEVEMENTS.filter((x) => p.achievements[x.id]).length;
    const since = a.createdAt ? new Date(a.createdAt).toLocaleDateString([], { month: 'short', year: 'numeric' }) : '';
    const scrollTop = this.root.querySelector('.scr')?.scrollTop ?? 0;
    const winRate = s.matches ? Math.round((s.wins / s.matches) * 100) : 0;
    const show = p.equipped.showcase.map((id) => achievementById(id)).filter((x) => !!x);
    const streak = dailyFor(p, Date.now()).streak;
    const when = (id: string) => new Date(p.achievements[id]).toLocaleDateString([], { day: 'numeric', month: 'short' });
    this.root.innerHTML = `
      <div class="scr-back"></div>
      <div class="scr panel prof" role="dialog" aria-label="Profile">
        <header class="scr-head">
          <h2><span class="ic">${icon('user')}</span>PROFILE</h2>
          <span class="scr-tools">${a.signedIn ? `<button class="prof-out">${icon('logout')}<span>Log out</span></button>` : ''}<button class="scr-x" aria-label="Close">${icon('close')}</button></span>
        </header>
        <div class="prof-top">
          ${avatar(p.equipped.ball, p.equipped.frame, 132, 'prof-av')}
          <div class="prof-id">
            <h3>${esc(a.username ?? 'Guest')}</h3>
            ${titlePill(p.equipped.title, 'prof-title')}
            <div class="prof-lvl">${levelBadge(info.level, '', info.stars)}<div class="pl-bar">${xpBar(info)}<span>${xpText(info)}</span></div></div>
            <div class="prof-meta">${saveLine(a.saveState, a.lastSaved)}${since ? `<span>Playing since ${since}</span>` : ''}${streak > 1 ? `<span class="streak">${icon('flame')}${streak}-day streak</span>` : ''}${info.stars ? `<span class="stars">★ ${info.stars} Superior ${info.stars === 1 ? 'Star' : 'Stars'}</span>` : ''}</div>
          </div>
          <div class="prof-show">
            <b>SHOWCASE</b>
            <div class="ps-slots">
              ${[0, 1, 2].map((i) => {
                const x = show[i];
                return x
                  ? `<div class="ps-slot on m-${achievementTier(x)}">${medal(x)}<b>${esc(x.name)}</b><small>${esc(x.desc)}</small><em>Earned ${when(x.id)}</em></div>`
                  : `<div class="ps-slot"><span class="medal empty">${icon('star')}</span><span>${earned ? 'Pin one below' : 'Earn one to show it here'}</span></div>`;
              }).join('')}
            </div>
            <div class="prof-load">
              <span><img src="${ballPortrait(nationById(p.equipped.ball), 48, 'smug')}" alt="" /><span><small>PLAYING AS</small><b>${esc(nationById(p.equipped.ball).name)}</b></span></span>
              <span><i class="sk-ic" style="background:${skillById(p.equipped.skill)?.color ?? '#6a5fa8'}">${icon(skillById(p.equipped.skill)?.icon ?? 'star')}</i><span><small>SKILL</small><b>${esc(skillById(p.equipped.skill)?.name ?? 'None')}</b></span></span>
              <span><i class="sk-ic col">${icon('crown')}</i><span><small>COLLECTION</small><b>${ownedBalls(p).length} of ${ALL_BALLS.length}</b></span></span>
            </div>
          </div>
        </div>
        <div class="prof-stats">
          ${[
            [fmtNum(s.matches), s.matches === 1 ? 'Match' : 'Matches'], [fmtNum(s.wins), s.wins === 1 ? 'Win' : 'Wins'], [`${winRate}%`, 'Win rate'],
            [s.bestWinSec ? fmtTime(s.bestWinSec) : '-', 'Fastest win'], [fmtNum(s.kills), 'Nations ended'],
            [fmtNum(s.cities), 'Cities seized'], [`${s.peakLand.toFixed(0)}%`, 'Best land'], [`${ownedBalls(p).length}/${ALL_BALLS.length}`, 'Balls owned'],
          ].map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('')}
        </div>
        <div class="prof-cols">
          <section class="prof-ach">
            <div class="sec-h"><b>ACHIEVEMENTS</b><span>${earned} / ${ACHIEVEMENTS.length} earned · tap an earned one to pin it</span></div>
            ${this.note ? `<p class="prof-note">${esc(this.note)}</p>` : ''}
            <div class="ach-grid">${[...ACHIEVEMENTS].sort((m, n) => this.rank(m.id) - this.rank(n.id)).map((x) => {
              const got = !!p.achievements[x.id];
              const goal = x.goal?.(p);
              const pinned = p.equipped.showcase.includes(x.id);
              const bar = !got && goal && goal[1] > 1 ? `<span class="ach-bar"><i style="width:${Math.min(100, (goal[0] / goal[1]) * 100)}%"></i></span><span class="ach-cnt">${Math.min(goal[0], goal[1])}/${goal[1]}</span>` : '';
              return `<button class="ach ${got ? 'got' : ''} ${pinned ? 'pin' : ''}" data-id="${x.id}" ${got ? '' : 'disabled'}>
                ${medal(x)}
                <span class="ach-t"><b>${esc(x.name)}</b><span>${esc(x.desc)}</span>${bar}</span>
                <span class="ach-xp">${got ? `<span class="ax-st">${pinned ? 'PINNED' : icon('check')}</span><small>${when(x.id)}</small>` : `+${x.xp} XP<small>${TIER_NAME[achievementTier(x)]}</small>`}</span>
              </button>`;
            }).join('')}</div>
          </section>
          <section class="prof-look">
            <div class="look-prev">${avatar(p.equipped.ball, p.equipped.frame, 92)}<span>${titlePill(p.equipped.title)}<small>How others see you</small></span></div>
            <div class="sec-h"><b>TITLE</b></div>
            <div class="chips">${Object.keys(TITLES).map((id) => this.chip('title', id, TITLES[id])).join('')}</div>
            <div class="sec-h"><b>FRAME</b></div>
            <div class="chips">${Object.keys(FRAMES).map((id) => this.chip('frame', id, FRAMES[id])).join('')}</div>
            ${a.signedIn ? '' : `<div class="prof-acct"><button class="play-btn prof-make">CREATE ACCOUNT</button><p>Guests lose progress when they leave. An account keeps everything above.</p></div>`}
          </section>
        </div>
      </div>`;
    (this.root.querySelector('.scr') as HTMLElement).scrollTop = scrollTop;
    (this.root.querySelector('.scr-x') as HTMLElement).addEventListener('click', () => this.actions.close());
    (this.root.querySelector('.scr-back') as HTMLElement).addEventListener('click', () => this.actions.close());
    this.root.querySelector('.prof-out')?.addEventListener('click', () => this.actions.logout());
    this.root.querySelector('.prof-make')?.addEventListener('click', () => this.actions.createAccount());
    this.root.querySelectorAll<HTMLButtonElement>('.ach.got').forEach((b) => b.addEventListener('click', () => this.pin(b.dataset.id as string)));
    this.root.querySelectorAll<HTMLButtonElement>('.chip[data-kind]').forEach((b) => b.addEventListener('click', () => {
      const kind = b.dataset.kind as 'title' | 'frame';
      const id = b.dataset.id as string;
      if (!owns(this.account.progress, kind, id)) return;
      this.account.update((q) => {
        if (kind === 'title') q.equipped.title = id;
        else q.equipped.frame = id;
      });
    }));
  }

  private chip(kind: 'title' | 'frame', id: string, name: string): string {
    const p = this.account.progress;
    const got = owns(p, kind, id);
    const on = kind === 'title' ? p.equipped.title === id : p.equipped.frame === id;
    const lv = unlockLevel(kind, id);
    const label = kind === 'frame' ? `<span class="chip-fr fr-${id}"></span><span>${esc(name.replace(' Frame', ''))}</span>` : titlePill(id, 'chip-tp');
    return `<button class="chip k-${kind} ${on ? 'on' : ''} ${got ? '' : 'locked'}" data-kind="${kind}" data-id="${id}" ${got ? '' : 'disabled'} title="${got ? '' : `Unlocks at Level ${lv}`}">${label}${got ? (on ? `<span class="chip-on">${icon('check')}</span>` : '') : `<small>${icon('lock')}${lv > MAX_LEVEL ? '?' : lv}</small>`}</button>`;
  }

  /** Pinned first, then earned (newest first), then the rest in their usual order. */
  private rank(id: string): number {
    const p = this.account.progress;
    if (p.equipped.showcase.includes(id)) return -2e13 + p.equipped.showcase.indexOf(id);
    if (p.achievements[id]) return -p.achievements[id];
    return ACHIEVEMENTS.findIndex((a) => a.id === id);
  }

  private pin(id: string): void {
    const cur = this.account.progress.equipped.showcase;
    if (cur.includes(id)) {
      this.note = '';
      this.account.update((q) => { q.equipped.showcase = cur.filter((x) => x !== id); });
    } else if (cur.length >= 3) {
      this.note = 'Your showcase holds 3. Tap a pinned one to unpin it first.';
      this.render();
    } else {
      this.note = '';
      this.account.update((q) => { q.equipped.showcase = [...cur, id]; });
    }
  }
}
