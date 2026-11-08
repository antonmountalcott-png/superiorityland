/** Small pieces shared by the title screen, battle pass, profile and results. */
import { nationById } from '../core/nations';
import { type Achievement, FRAMES, type LevelInfo, type Reward, TITLES, achievementTier, levelInfo } from '../core/progress';
import { skillById } from '../core/skills';
import { ballPortrait } from '../render/ballArt';
import { icon } from './svg';

export const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

export const fmtNum = (n: number): string => Math.round(n).toLocaleString('en-US');

/** Whole seconds, rounded down: the one rule for every match time in the game. */
export const fmtTime = (sec: number): string => {
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export const levelBadge = (level: number, cls = '', stars = 0): string => `<span class="lvl-badge ${cls}"><small>LV</small>${level}${stars ? `<em class="lv-stars">★${stars}</em>` : ''}</span>`;

/** A tile name without a type word the tile already shows ("Romanum Empire" on an EMPIRE tile). */
export const shortName = (name: string): string => name.replace(/ Empire$/, '');

export function xpBar(info: LevelInfo, cls = ''): string {
  const pct = Math.round((info.into / info.need) * 100);
  return `<div class="xpbar ${cls}${info.max ? ' star' : ''}"><i style="width:${pct}%"></i></div>`;
}

/** "320 / 375 XP to Level 12", or progress to the next Superior Star once the pass is done. */
export const xpText = (info: LevelInfo): string =>
  info.max ? `${info.stars ? `★${info.stars} · ` : ''}${fmtNum(info.into)} / ${fmtNum(info.need)} XP to next Superior Star` : `${fmtNum(info.into)} / ${fmtNum(info.need)} XP to Level ${info.level + 1}`;

export const levelOf = (xp: number): LevelInfo => levelInfo(xp);

/** A ball in a profile frame. */
export const avatar = (ballId: string, frame: string, size: number, cls = ''): string =>
  `<span class="avatar fr-${frame} ${cls}" style="--av:${size}px"><span class="av-in"><img src="${ballPortrait(nationById(ballId), Math.round(size * 1.3), 'smug')}" alt="" /></span></span>`;

export const KIND_LABEL: Record<Reward['kind'], string> = { ball: 'Nation', skill: 'Skill', title: 'Title', frame: 'Frame' };

/** A title, drawn as the actual name plate it puts on your profile. */
const TITLE_ICON: Record<string, string> = { recruit: 'helmet', rookie: 'star', bully: 'sword', painter: 'flag', emperor: 'crown' };
export const titlePill = (id: string, cls = ''): string => `<span class="title-pill t-${id} ${cls}"><i>${icon(TITLE_ICON[id] ?? 'star')}</i>${esc(TITLES[id] ?? TITLES.recruit)}</span>`;

/** The picture for a reward. Frames are shown on the player's own ball, titles as the real name plate. */
export function rewardArt(r: Reward, size: number, ballId = 'superiorityland'): string {
  if (r.kind === 'ball') return `<img class="rw-ball" src="${ballPortrait(nationById(r.id), size, r.milestone ? 'smug' : 'happy')}" alt="" />`;
  if (r.kind === 'skill') return `<span class="rw-icon skill" style="background:${skillById(r.id)?.color ?? '#6a5fa8'}">${icon(skillById(r.id)?.icon ?? 'star')}</span>`;
  if (r.kind === 'frame') return avatar(ballId, r.id, Math.round(size * 0.66), 'rw-av');
  return titlePill(r.id, 'rw-tp');
}

export const kindLabel = (r: Reward): string => (r.kind === 'ball' && r.milestone ? 'Empire' : KIND_LABEL[r.kind]);

export const titleName = (id: string): string => TITLES[id] ?? TITLES.recruit;
export const frameName = (id: string): string => FRAMES[id] ?? FRAMES.none;

/** An achievement medal in its tier colour. */
export const medal = (a: Achievement, cls = ''): string => `<span class="medal m-${achievementTier(a)} ${cls}">${icon(a.icon)}</span>`;

/** Little "saved" line, so the player can always see that progress is safe. */
export function saveLine(state: string, lastSaved: number): string {
  if (state === 'guest') return `<span class="save-st guest">${icon('user')} Guest: progress is not saved</span>`;
  if (state === 'saving') return `<span class="save-st saving"><i class="spin"></i> Saving to your account...</span>`;
  if (state === 'retrying') return `<span class="save-st retry">Can't reach the server. Will keep trying to save.</span>`;
  const t = lastSaved ? new Date(lastSaved).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
  return `<span class="save-st ok">${icon('check')}<span>Saved to your account${t ? ` <b>at ${t.replace(' ', ' ')}</b>` : ''}</span></span>`;
}

/** "5h 12m" until something resets. */
export const fmtLeft = (ms: number): string => {
  const m = Math.max(1, Math.round(ms / 60000));
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
};
