import { nationById } from '../core/nations';
import { DAILY_XP, MAX_LEVEL, type Reward, STAR_XP, TRACK, WEEKLY_XP, dailyChallenges, dailyFor, levelInfo, msToMidnight, msToNextWeek, owns, unseenRewards, weeklyChallenges, weeklyFor, xpAtLevel } from '../core/progress';
import type { Account } from '../game/account';
import { esc, fmtLeft, fmtNum, kindLabel, levelBadge, rewardArt, shortName, xpBar, xpText } from './progressUi';
import { icon } from './svg';

export interface PassActions {
  close(): void;
  /** Pick this nation or empire and return to the title screen. */
  playAs(id: string): void;
}

/** The 30-level reward track: what you have, what is next, and exactly how to get there. */
export class PassScreen {
  private selected = 1;
  /** On a phone the detail panel is a sheet that opens on a tap. */
  private sheet = false;
  private fresh = new Set<number>();
  private off: (() => void) | null = null;

  constructor(private root: HTMLElement, private account: Account, private actions: PassActions) {}

  open(focusLevel?: number): void {
    const p = this.account.progress;
    const info = levelInfo(p.xp);
    // NEW markers show for this visit, then the rewards count as seen.
    this.fresh = new Set(unseenRewards(p).map((r) => r.level));
    this.selected = focusLevel ?? (this.fresh.size ? Math.min(...this.fresh) : Math.min(MAX_LEVEL, info.level + 1));
    this.sheet = focusLevel !== undefined;
    if (p.seenLevel < info.level) this.account.update((q) => { q.seenLevel = info.level; });
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
    const p = this.account.progress;
    const info = levelInfo(p.xp);
    const toMax = Math.max(0, xpAtLevel(MAX_LEVEL) - p.xp);
    const scrollTop = this.root.querySelector('.scr')?.scrollTop ?? 0;
    this.root.innerHTML = `
      <div class="scr-back"></div>
      <div class="scr panel pass" role="dialog" aria-label="Battle Pass">
        <header class="scr-head">
          <h2><span class="ic">${icon('ticket')}</span>BATTLE PASS</h2>
          <button class="scr-x" aria-label="Close">${icon('close')}</button>
        </header>
        <div class="pass-top">
          ${levelBadge(info.level, 'big')}
          <div class="pass-prog">
            <div class="pp-row"><b>Level ${info.level} <span>of ${MAX_LEVEL}</span></b><span class="pp-xp">${xpText(info)}</span></div>
            ${xpBar(info, 'big')}
            <details class="pp-how"><summary>How to earn XP</summary><div class="pp-earn"><span>Every match:</span>
              <i>+100 for playing</i><i>+3 per 1% land</i><i>+4 per city</i><i>+30 per nation ended</i><i>+150 for a win</i><i>Match XP ×1.25 on Normal, ×1.5 on Hard</i><i class="hot">First match of the day: +100, up to +250 on a 7-day streak</i><i>Daily challenges +150</i><i>Weekly challenges +300 (running totals over the week)</i><i>Achievements +25 to +500</i>
            </div></details>
          </div>
          <div class="pass-total"><b>${fmtNum(p.xp)}</b><span>total XP</span><small>${info.max ? `Pass complete! ★${info.stars} Superior Stars` : `${fmtNum(toMax)} XP to Level 30`}</small><em>After Level 30, every ${fmtNum(STAR_XP)} XP earns a ★ Superior Star, shown next to your level everywhere.</em></div>
        </div>
        ${this.challenges()}
        <div class="pass-track">${TRACK.map((r) => this.card(r, info.level)).join('')}</div>
        <div class="pass-detail ${this.sheet ? 'open' : ''}">${this.detail(TRACK[this.selected - 1], info.level)}</div>
        <p class="pass-fine">You play against computer-controlled nations. Every reward is earned by playing, and nothing here is for sale.</p>
      </div>`;
    const scr = this.root.querySelector('.scr') as HTMLElement;
    scr.scrollTop = scrollTop;
    (this.root.querySelector('.scr-x') as HTMLElement).addEventListener('click', () => this.actions.close());
    (this.root.querySelector('.scr-back') as HTMLElement).addEventListener('click', () => this.actions.close());
    this.root.querySelectorAll<HTMLElement>('.rw').forEach((b) => b.addEventListener('click', () => {
      this.selected = Number(b.dataset.level);
      this.sheet = true;
      this.render();
    }));
    this.root.querySelector('.pd-act')?.addEventListener('click', () => this.act(TRACK[this.selected - 1]));
    this.root.querySelector('.pd-close')?.addEventListener('click', () => {
      this.sheet = false;
      this.render();
    });
    // On a phone, open with the next reward in view.
    if (window.innerWidth <= 760 && !scrollTop) this.root.querySelector('.rw.next')?.scrollIntoView({ block: 'center' });
  }

  /** Today's and this week's challenges, side by side. */
  private challenges(): string {
    const p = this.account.progress;
    const now = Date.now();
    const d = dailyFor(p, now);
    const w = weeklyFor(p, now);
    const row = (name: string, done: boolean, xp: number, count = '') => `<div class="ch-row ${done ? 'done' : ''}"><span class="dl-box">${done ? icon('check') : ''}</span><span class="dl-n">${esc(name)}${count ? ` <em>${count}</em>` : ''}</span><b>+${xp}</b></div>`;
    const day = dailyChallenges(d.day);
    const week = weeklyChallenges(w.week);
    return `
      <div class="pass-ch">
        <section><h4>${icon('flame')}Daily <em>${day.filter((c) => d.done.includes(c.id)).length}/3</em><span>New in ${fmtLeft(msToMidnight(now))}</span></h4>${day.map((c) => row(c.name, d.done.includes(c.id), DAILY_XP)).join('')}</section>
        <section class="wk"><h4>${icon('trophy')}Weekly <em>${week.filter((c) => w.done.includes(c.id)).length}/3</em><span>New in ${fmtLeft(msToNextWeek(now))}</span></h4>${week.map((c) => row(c.name, w.done.includes(c.id), WEEKLY_XP, `${Math.min(c.goal, w.prog[c.id] ?? 0)}/${c.goal}`)).join('')}</section>
      </div>`;
  }

  private card(r: Reward, level: number): string {
    const capstone = r.level === MAX_LEVEL;
    const got = r.level <= level;
    const next = r.level === level + 1;
    const state = got ? 'got' : next ? 'next' : 'locked';
    const equipped = this.isEquipped(r);
    return `
      <button class="rw ${state}${r.milestone ? ' ms' : ''}${this.fresh.has(r.level) ? ' fresh' : ''}${equipped ? ' inuse' : ''}${capstone ? ' cap' : ''}${this.selected === r.level ? ' sel' : ''}" data-level="${r.level}" aria-label="Level ${r.level}: ${esc(r.name)}">
        <span class="rw-lv">${r.level}</span>
        ${capstone ? '<span class="rw-grand">GRAND PRIZE</span>' : ''}
        <span class="rw-art">${rewardArt(r, 84, this.account.progress.equipped.ball)}</span>
        <span class="rw-name">${esc(shortName(r.name))}</span>
        <span class="rw-kind">${kindLabel(r)}</span>
        ${this.fresh.has(r.level) ? '<span class="rw-st new">NEW</span>' : got ? `<span class="rw-st got">${icon('check')}</span>` : `<span class="rw-st">${icon('lock')}</span>`}
        ${equipped ? '<span class="rw-use">IN USE</span>' : ''}
      </button>`;
  }

  private isEquipped(r: Reward): boolean {
    const e = this.account.progress.equipped;
    return (r.kind === 'ball' && e.ball === r.id) || (r.kind === 'skill' && e.skill === r.id) || (r.kind === 'title' && e.title === r.id) || (r.kind === 'frame' && e.frame === r.id);
  }

  private detail(r: Reward, level: number): string {
    const got = owns(this.account.progress, r.kind, r.id);
    const toGo = Math.max(0, xpAtLevel(r.level) - this.account.progress.xp);
    let action: string;
    if (!got) action = `<button class="big-btn pd-act" disabled>${icon('lock')} Reach Level ${r.level} · ${fmtNum(toGo)} XP to go</button>`;
    else if (this.isEquipped(r)) action = `<button class="big-btn pd-act" disabled>${icon('check')} ${r.kind === 'ball' ? 'Selected' : 'Equipped'}</button>`;
    else if (r.kind === 'ball') action = `<button class="play-btn pd-act">PLAY AS ${esc(nationById(r.id).name.toUpperCase())}</button>`;
    else action = `<button class="big-btn pd-act go">Equip</button>`;
    const n = r.kind === 'ball' ? nationById(r.id) : null;
    return `
      <div class="pd-art ${r.milestone ? 'ms' : ''} k-${r.kind}">${rewardArt(r, 132, this.account.progress.equipped.ball)}</div>
      <div class="pd-txt">
        <span class="pd-kind ${r.milestone ? 'ms' : ''}">Level ${r.level} · ${kindLabel(r)}</span>
        <h3>${esc(r.kind === 'frame' ? `${r.name} Frame` : r.name)}</h3>
        ${n ? `<p class="pd-motto">"${esc(n.motto)}"</p><p class="pd-desc"><b>${esc(n.perk.name)}:</b> ${esc(n.perk.desc)}. <span class="pd-note">Applies in your matches against computer nations.</span></p>` : `<p class="pd-desc">${esc(r.desc)}</p>`}
      </div>
      <div class="pd-go">${action}</div>
      <button class="pd-close" aria-label="Close">${icon('close')}</button>`;
  }

  private act(r: Reward): void {
    if (!owns(this.account.progress, r.kind, r.id) || this.isEquipped(r)) return;
    if (r.kind === 'ball') {
      this.account.update((p) => { p.equipped.ball = r.id; });
      this.actions.playAs(r.id);
      return;
    }
    this.account.update((p) => {
      if (r.kind === 'skill') p.equipped.skill = r.id;
      else if (r.kind === 'title') p.equipped.title = r.id;
      else if (r.kind === 'frame') p.equipped.frame = r.id;
    });
  }
}
