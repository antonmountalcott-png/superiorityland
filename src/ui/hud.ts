import { B, TPS } from '../core/balance';
import { cardById } from '../core/cards';
import type { BuildingKind, Game, Player } from '../core/sim';
import { ballPortrait } from '../render/ballArt';
import { fmt } from '../render/overlay';
import { icon, inputWords } from './svg';

export type ActionMode = 'send' | BuildingKind | 'bomb' | 'para';

export interface HudCallbacks {
  setPct(p: number): void;
  setMode(m: ActionMode): void;
  pickCard(id: string): void;
  askTruce(other: number): void;
  bribe(other: number, target: number): void;
  buyPeace(other: number): void;
  replyTruce(other: number, accept: boolean): void;
  focusPlayer(id: number): void;
  togglePause(): void;
  cycleSpeed(): void;
  toggleSound(): void;
  zoom(f: number): void;
  home(): void;
  dismissCoach(): void;
}

const ACTIONS: { id: Exclude<ActionMode, 'send'>; name: string; key: string; desc: string; sub: string }[] = [
  { id: 'fort', name: 'Fort', key: 'Q', desc: 'Land around it is 2.4x harder to take.', sub: 'Defends land' },
  { id: 'barracks', name: 'Barracks', key: 'W', desc: 'More troop capacity and steady recruits.', sub: 'More troops' },
  { id: 'market', name: 'Market', key: 'E', desc: 'Earns extra gold every second.', sub: 'More gold' },
  { id: 'bomb', name: 'Big Boom', key: 'R', desc: 'Blast any spot: kills troops and flattens land.', sub: 'Blast a spot' },
  { id: 'para', name: 'Airdrop', key: 'T', desc: 'Drop your army anywhere, behind enemy lines.', sub: 'Land anywhere' },
];

const PCTS = [10, 25, 50, 75, 100];

/** Small shares keep a decimal so the caption agrees with the rest of the HUD. */
const leadDigits = (share: number) => (share < 0.1 ? 1 : 0);

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

const setText = (e: HTMLElement, v: string) => {
  if (e.textContent !== v) e.textContent = v;
};

interface LbRow { row: HTMLElement; rank: HTMLElement; img: HTMLImageElement; name: HTMLElement; share: HTMLElement; troops: HTMLElement; truce: HTMLElement; id: number }

export class Hud {
  readonly root: HTMLElement;
  private cb: HudCallbacks;
  private game: Game | null = null;
  private human = 1;

  private portrait!: HTMLImageElement;
  private pName!: HTMLElement;
  private pRank!: HTMLElement;
  private pTroops!: HTMLElement;
  private pCap!: HTMLElement;
  private fillBar!: HTMLElement;
  private fillTip!: HTMLElement;
  private pGold!: HTMLElement;
  private pGoldRate!: HTMLElement;
  private pLand!: HTMLElement;
  private cardsOwned!: HTMLElement;

  private domA!: HTMLElement;
  private domB!: HTMLElement;
  private headA!: HTMLImageElement;
  private headB!: HTMLImageElement;
  private domLabel!: HTMLElement;

  private lb!: HTMLElement;
  private lbRows: LbRow[] = [];
  private lbMore!: HTMLElement;
  private feedEl!: HTMLElement;

  private chips: HTMLButtonElement[] = [];
  private sendValue!: HTMLElement;
  private actionBtns = new Map<string, { btn: HTMLButtonElement; cost: HTMLElement; cd: HTMLElement; cdText: HTMLElement; prog: HTMLElement }>();
  private litActions: string[] = [];
  private modeHint!: HTMLElement;

  private tray!: HTMLElement;
  private trayKey = '';
  private trayTimer!: HTMLElement;

  private popover!: HTMLElement;
  private popPlayer = -1;
  private popStats!: HTMLElement;
  private popBtn!: HTMLButtonElement;
  private popBribes: HTMLButtonElement[] = [];
  private barEl!: HTMLElement;
  private actionsOpen = false;
  private strikesOpen = false;
  private tipShort!: HTMLElement;

  private coachEl!: HTMLElement;
  private coachText!: HTMLElement;
  private coachKey = '';

  private toastEl!: HTMLElement;
  private toastTimer = 0;
  private bannerEl!: HTMLElement;
  private askEl!: HTMLElement;
  private askFrom = -1;
  private askTimer = 0;

  private pauseBtn!: HTMLButtonElement;
  private speedBtn!: HTMLButtonElement;
  private soundBtn!: HTMLButtonElement;
  private pausedEl!: HTMLElement;

  constructor(root: HTMLElement, cb: HudCallbacks) {
    this.root = root;
    this.cb = cb;
    this.build();
  }

  private build(): void {
    const r = this.root;

    // Your nation
    const card = el('div', 'panel pcard');
    card.innerHTML = `
      <img class="pc-face" alt="" />
      <div class="pc-body">
        <div class="pc-top"><span class="pc-name"></span><span class="pc-rank"></span></div>
        <div class="pc-troops"><span class="ic">${icon('troops')}</span><b class="pc-tv">0</b><span class="pc-cap"></span></div>
        <div class="fill" title="Troops grow fastest while this bar is in the green zone">
          <div class="fill-bar"></div><div class="fill-sweet"><span>Troops grow fastest in the green zone</span></div>
        </div>
        <div class="pc-tip"></div>
        <div class="pc-eco">
          <span class="ic">${icon('gold')}</span><b class="pc-gold">0</b><span class="pc-rate"></span>
          <span class="pc-short"></span>
          <span class="pc-land"></span>
        </div>
        <div class="pc-cards"></div>
      </div>`;
    this.portrait = card.querySelector('.pc-face') as HTMLImageElement;
    this.pName = card.querySelector('.pc-name') as HTMLElement;
    this.pRank = card.querySelector('.pc-rank') as HTMLElement;
    this.pTroops = card.querySelector('.pc-tv') as HTMLElement;
    this.pCap = card.querySelector('.pc-cap') as HTMLElement;
    this.fillBar = card.querySelector('.fill-bar') as HTMLElement;
    this.fillTip = card.querySelector('.pc-tip') as HTMLElement;
    this.pGold = card.querySelector('.pc-gold') as HTMLElement;
    this.pGoldRate = card.querySelector('.pc-rate') as HTMLElement;
    this.pLand = card.querySelector('.pc-land') as HTMLElement;
    this.tipShort = card.querySelector('.pc-short') as HTMLElement;
    this.cardsOwned = card.querySelector('.pc-cards') as HTMLElement;
    r.append(card);

    // Who is winning
    const dom = el('div', 'dom');
    // A race to the WIN line: only the leader and you, each measured from zero, so the marker can be trusted.
    dom.innerHTML = `<div class="dom-bar"><div class="dom-fill a"></div><div class="dom-fill b"></div><div class="dom-goal" style="left:${B.WIN_SHARE * 100}%"><span>WIN</span></div><img class="dom-head a" alt="" /><img class="dom-head b" alt="" /></div><div class="dom-label"></div>`;
    this.domA = dom.querySelector('.dom-fill.a') as HTMLElement;
    this.domB = dom.querySelector('.dom-fill.b') as HTMLElement;
    this.headA = dom.querySelector('.dom-head.a') as HTMLImageElement;
    this.headB = dom.querySelector('.dom-head.b') as HTMLImageElement;
    this.domLabel = dom.querySelector('.dom-label') as HTMLElement;
    r.append(dom);

    this.lb = el('div', 'panel lb');
    r.append(this.lb);

    this.feedEl = el('div', 'feed');
    r.append(this.feedEl);

    // Action bar
    const bar = el('div', 'panel bar basic');
    this.barEl = bar;
    const send = el('div', 'send');
    send.innerHTML = `<div class="send-head"><span>SEND ARMY</span><b class="send-val"></b></div>`;
    this.sendValue = send.querySelector('.send-val') as HTMLElement;
    const chips = el('div', 'chips');
    PCTS.forEach((p, i) => {
      const b = el('button', 'chip', `${p}%`);
      b.title = `Send ${p}% of your troops (key ${i + 1})`;
      b.addEventListener('click', () => this.cb.setPct(p / 100));
      chips.append(b);
      this.chips.push(b);
    });
    send.append(chips);
    bar.append(send);

    const acts = el('div', 'actions');
    for (const a of ACTIONS) {
      const b = el('button', 'act');
      b.innerHTML = `
        <span class="act-ic">${icon(a.id)}</span>
        <span class="act-name">${a.name}</span>
        <span class="act-sub">${a.sub}</span>
        <span class="act-cost"><span class="ic">${icon('gold')}</span><b></b></span>
        <span class="act-cd"></span>
        <span class="act-cdt"></span>
        <span class="act-prog"><i></i></span>
        <span class="act-key">${a.key}</span>
        <span class="tip"><b>${a.name}</b>${a.desc}</span>`;
      b.addEventListener('click', () => this.cb.setMode(a.id));
      acts.append(b);
      this.actionBtns.set(a.id, { btn: b, cost: b.querySelector('.act-cost b') as HTMLElement, cd: b.querySelector('.act-cd') as HTMLElement, cdText: b.querySelector('.act-cdt') as HTMLElement, prog: b.querySelector('.act-prog i') as HTMLElement });
    }
    bar.append(acts);
    r.append(bar);

    this.modeHint = el('div', 'modehint');
    r.append(this.modeHint);

    // Corner controls
    const ctrl = el('div', 'ctrl');
    const more = el('button', 'ctl ctl-more', icon('menu'));
    more.setAttribute('aria-label', 'Game controls');
    more.addEventListener('click', () => ctrl.classList.toggle('open'));
    ctrl.append(more);
    const mk = (ic: string, title: string, fn: () => void) => {
      const b = el('button', 'ctl', icon(ic));
      b.title = title;
      b.setAttribute('aria-label', title);
      b.addEventListener('click', fn);
      ctrl.append(b);
      return b;
    };
    mk('plus', 'Zoom in', () => this.cb.zoom(1.4));
    mk('minus', 'Zoom out', () => this.cb.zoom(1 / 1.4));
    const world = mk('world', 'Show whole map', () => this.cb.home());
    world.classList.add('ctl-world');
    world.insertAdjacentHTML('beforeend', '<span class="ctl-cap">World</span>');
    this.speedBtn = mk('play', 'Game speed', () => this.cb.cycleSpeed());
    this.speedBtn.classList.add('ctl-speed');
    this.speedBtn.innerHTML = '1x';
    this.pauseBtn = mk('pause', 'Pause (Space)', () => this.cb.togglePause());
    this.soundBtn = mk('soundOn', 'Sound', () => this.cb.toggleSound());
    r.append(ctrl);

    // Doctrine cards
    this.tray = el('div', 'tray hidden');
    r.append(this.tray);

    // Nation popover
    this.popover = el('div', 'panel pop hidden');
    r.append(this.popover);

    // Coach
    this.coachEl = el('div', 'coach hidden');
    this.coachEl.innerHTML = `<img class="coach-face" alt="" /><div class="coach-text"></div><span class="coach-x" aria-hidden="true">${icon('closeDark')}</span>`;
    this.coachText = this.coachEl.querySelector('.coach-text') as HTMLElement;
    this.coachEl.addEventListener('click', () => this.cb.dismissCoach());
    r.append(this.coachEl);

    this.toastEl = el('div', 'toast hidden');
    r.append(this.toastEl);
    this.bannerEl = el('div', 'banner hidden');
    r.append(this.bannerEl);

    this.askEl = el('div', 'panel ask hidden');
    r.append(this.askEl);

    this.pausedEl = el('div', 'paused hidden', 'PAUSED');
    r.append(this.pausedEl);
  }

  setGame(game: Game, human: number): void {
    this.game = game;
    this.human = human;
    const me = game.players[human];
    // Buildings and strikes stay out of the way until the player has land and gold to use them.
    this.actionsOpen = false;
    this.strikesOpen = false;
    this.barEl.classList.add('basic');
    this.portrait.src = ballPortrait(me.nation, 96, 'smug');
    (this.coachEl.querySelector('.coach-face') as HTMLImageElement).src = ballPortrait(me.nation, 96, 'happy');
    setText(this.pName, me.nation.name);

    this.lb.innerHTML = `<div class="lb-title"><span>LEADERBOARD</span><span class="lb-col t">Troops</span><span class="lb-col l">Land</span></div>`;
    this.lbRows = [];
    for (let i = 1; i < game.nPlayers; i++) {
      const row = el('button', 'lb-row');
      row.innerHTML = `<span class="lb-rank"></span><img alt="" /><span class="lb-name"></span><span class="lb-truce">${icon('handshake')}</span><span class="lb-troops"></span><b class="lb-share"></b>`;
      const entry: LbRow = {
        row, rank: row.querySelector('.lb-rank') as HTMLElement, img: row.querySelector('img') as HTMLImageElement,
        name: row.querySelector('.lb-name') as HTMLElement, share: row.querySelector('.lb-share') as HTMLElement,
        troops: row.querySelector('.lb-troops') as HTMLElement, truce: row.querySelector('.lb-truce') as HTMLElement, id: -1,
      };
      row.addEventListener('click', () => {
        if (entry.id > 0) this.cb.focusPlayer(entry.id);
      });
      this.lb.append(row);
      this.lbRows.push(entry);
    }
    this.lbMore = el('div', 'lb-more');
    this.lb.append(this.lbMore);
    this.feedEl.innerHTML = '';
    this.closePopover();
    this.trayKey = '';
    this.tray.classList.add('hidden');
    this.askEl.classList.add('hidden');
    this.askFrom = -1;
    this.pausedEl.classList.add('hidden');
  }

  setVisible(v: boolean): void {
    this.root.classList.toggle('hidden', !v);
  }

  setSpawnPhase(v: boolean): void {
    this.root.classList.toggle('spawning', v);
  }

  update(mode: ActionMode, pct: number, speed: number, paused: boolean, soundOn: boolean): void {
    const g = this.game;
    if (!g) return;
    const me = g.players[this.human];
    const cap = g.capOf(me);
    const fill = me.troops / cap;

    const rank = g.ranking();
    const myRank = rank.indexOf(me) + 1;
    setText(this.pRank, me.alive ? `#${myRank} of ${rank.length}` : 'Annexed');
    setText(this.pTroops, Math.round(me.troops).toLocaleString('en-US'));
    setText(this.pCap, `/ ${fmt(cap)}`);
    this.fillBar.style.width = `${Math.min(100, fill * 100)}%`;
    const growth = g.growthOf(me);
    let tip: string;
    let state: string;
    if (fill < 0.28) { tip = `Growing slowly: +${fmt(growth)} troops/s`; state = 'low'; }
    else if (fill < 0.72) { tip = `Growing fastest: +${fmt(growth)} troops/s`; state = 'good'; }
    else if (fill <= 1) { tip = 'Growth slowing: attack now!'; state = fill < 0.93 ? 'warn' : 'full'; }
    else { tip = 'Over capacity: troops are deserting!'; state = 'full'; }
    setText(this.fillTip, tip);
    setText(this.tipShort, { low: 'Growing slowly', good: 'Growing fastest', warn: 'Slowing: attack!', full: 'Attack now!' }[state] ?? '');
    this.tipShort.dataset.state = state;
    if (!this.actionsOpen && (me.land > 110 || me.gold >= 100)) {
      this.actionsOpen = true;
      this.barEl.classList.remove('basic');
    }
    this.fillTip.dataset.state = state;
    this.fillBar.dataset.state = state;
    setText(this.pGold, Math.floor(me.gold).toLocaleString('en-US'));
    setText(this.pGoldRate, `+${g.goldRateOf(me).toFixed(1)}/s`);
    setText(this.pLand, `${(g.landShare(me) * 100).toFixed(1)}% land`);

    const owned = me.cards.join(',');
    if (this.cardsOwned.dataset.k !== owned) {
      this.cardsOwned.dataset.k = owned;
      this.cardsOwned.innerHTML = me.cards.map((id) => {
        const c = cardById(id);
        return `<span class="pc-card" title="${c.name}: ${c.desc}">${icon(c.icon)}</span>`;
      }).join('');
    }

    const leader = rank[0];
    if (leader) {
      const second = leader === me ? rank[1] : me;
      const setRacer = (bar: HTMLElement, head: HTMLImageElement, p: Player | undefined) => {
        const share = p ? g.landShare(p) * 100 : 0;
        bar.style.width = `${share}%`;
        bar.style.background = p ? p.nation.fill : 'transparent';
        head.style.left = `${Math.max(1.8, share)}%`;
        head.style.display = p ? '' : 'none';
        if (p && head.dataset.id !== p.nation.id) {
          head.dataset.id = p.nation.id;
          head.src = ballPortrait(p.nation, 44, 'neutral');
        }
      };
      setRacer(this.domA, this.headA, leader);
      setRacer(this.domB, this.headB, second && second.alive ? second : undefined);
      const share = g.landShare(leader);
      const lead = (share * 100).toFixed(leadDigits(share));
      const phone = window.innerWidth < 761;
      const text = phone
        ? `Get ${B.WIN_SHARE * 100}% land to win`
        : leader === me
          ? `You lead with ${lead}%. Reach ${B.WIN_SHARE * 100}% to win`
          : `${leader.nation.name} leads with ${lead}%. First to ${B.WIN_SHARE * 100}% wins`;
      setText(this.domLabel, text);
      // On a phone, the goal only needs saying at the start: after that the WIN marker carries it.
      this.domLabel.classList.toggle('settled', g.tick > 300 || !this.coachEl.classList.contains('hidden'));
    }

    // Leaderboard: top seven, plus you if you fell below that.
    const shown: Player[] = rank.slice(0, 7);
    if (me.alive && !shown.includes(me)) shown[shown.length - 1] = me;
    this.lbRows.forEach((row, i) => {
      const p = shown[i];
      if (!p) {
        row.row.style.display = 'none';
        row.id = -1;
        return;
      }
      row.row.style.display = '';
      if (row.id !== p.id) {
        row.id = p.id;
        row.img.src = ballPortrait(p.nation, 44, 'neutral');
        setText(row.name, p === me ? 'You' : p.nation.name);
        row.row.classList.toggle('me', p === me);
        row.row.style.setProperty('--c', p.nation.fill);
      }
      setText(row.rank, `${rank.indexOf(p) + 1}`);
      setText(row.share, `${(g.landShare(p) * 100).toFixed(1)}%`);
      setText(row.troops, fmt(p.troops));
      // A truce icon takes the rank's slot, so it never squeezes the nation's name.
      const truce = p !== me && g.inTruce(me.id, p.id);
      row.truce.style.display = truce ? '' : 'none';
      row.rank.style.display = truce ? 'none' : '';
    });

    const hiddenCount = rank.length - shown.length;
    setText(this.lbMore, hiddenCount > 0 ? `+${hiddenCount} more ${hiddenCount === 1 ? 'nation' : 'nations'}` : '');

    // Send chips
    this.chips.forEach((c, i) => c.classList.toggle('on', Math.abs(PCTS[i] / 100 - pct) < 0.001));
    setText(this.sendValue, fmt(me.troops * pct));

    // Actions
    for (const a of ACTIONS) {
      const ui = this.actionBtns.get(a.id);
      if (!ui) continue;
      let cost: number;
      let ready = 0;
      let cooldown = 1;
      if (a.id === 'bomb') {
        cost = g.bombCost(me);
        ready = me.bombReady;
        cooldown = B.BOMB_COOLDOWN;
      } else if (a.id === 'para') {
        cost = g.paraCost(me);
        ready = me.paraReady;
        cooldown = B.PARA_COOLDOWN;
      } else cost = g.buildCost(me, a.id);
      setText(ui.cost, Math.round(cost).toLocaleString('en-US'));
      const left = Math.max(0, ready - g.tick);
      if ((a.id === 'bomb' || a.id === 'para') && !this.strikesOpen && me.gold >= cost * 0.75) this.strikesOpen = true;
      ui.btn.classList.toggle('later', (a.id === 'bomb' || a.id === 'para') && !this.strikesOpen);
      ui.btn.classList.toggle('cant', me.gold < cost || left > 0 || !me.alive);
      ui.btn.classList.toggle('cooling', left > 0);
      ui.prog.style.width = me.gold < cost ? `${Math.min(100, (me.gold / cost) * 100)}%` : '0';
      // Reloading says so, in seconds, so it can't be mistaken for being short of gold.
      setText(ui.cdText, left > 0 ? `${Math.ceil(left / TPS)}s` : '');
      const usable = me.gold >= cost && left === 0 && me.alive;
      ui.btn.classList.toggle('lit', usable && (this.litActions.includes(a.id)));
      ui.btn.classList.toggle('on', mode === a.id);
      ui.cd.style.height = left > 0 ? `${(left / cooldown) * 100}%` : '0';
    }

    const hints: Partial<Record<ActionMode, string>> = {
      fort: 'Tap your land to place it',
      barracks: 'Tap your land to place it',
      market: 'Tap your land to place it',
      bomb: 'Tap the spot to hit',
      para: `Tap where ${fmt(me.troops * pct)} troops should land`,
    };
    const hint = hints[mode];
    this.modeHint.classList.toggle('hidden', !hint);
    if (hint) {
      const def = ACTIONS.find((a) => a.id === mode);
      setText(this.modeHint, inputWords(`${def?.name}: ${def?.desc} ${hint}.`));
    }

    this.speedBtn.textContent = `${speed}x`;
    this.pauseBtn.innerHTML = icon(paused ? 'play' : 'pause');
    this.soundBtn.innerHTML = icon(soundOn ? 'soundOn' : 'soundOff');
    this.pausedEl.classList.toggle('hidden', !paused);

    this.updateTray(me, g);
    this.updatePopover();

    if (this.askFrom > 0 && performance.now() > this.askTimer) {
      this.askEl.classList.add('hidden');
      this.askFrom = -1;
    }
  }

  private updateTray(me: Player, g: Game): void {
    const offer = me.cardOffer;
    const key = offer ? offer.join(',') + me.milestone : '';
    if (key !== this.trayKey) {
      this.trayKey = key;
      this.tray.classList.toggle('hidden', !offer);
      if (offer) {
        this.tray.innerHTML = `<div class="tray-head"><b>Your nation has grown!</b><span>Pick an upgrade. It picks itself when the bar runs out.</span></div><div class="tray-cards"></div><div class="tray-time"><i></i></div>`;
        const list = this.tray.querySelector('.tray-cards') as HTMLElement;
        for (const id of offer) {
          const c = cardById(id);
          const b = el('button', `gcard tag-${c.tag}`);
          b.innerHTML = `<span class="gc-tag">${c.tag}</span><span class="gc-ic">${icon(c.icon)}</span><b>${c.name}</b><span class="gc-desc">${c.desc}</span>`;
          b.addEventListener('click', () => this.cb.pickCard(id));
          list.append(b);
        }
        this.trayTimer = this.tray.querySelector('.tray-time i') as HTMLElement;
      }
    }
    if (offer && this.trayTimer) {
      const left = 1 - (g.tick - me.cardOfferTick) / B.CARD_AUTOPICK_TICKS;
      this.trayTimer.style.width = `${Math.max(0, left) * 100}%`;
    }
  }

  openPopover(id: number): void {
    const g = this.game;
    if (!g) return;
    const p = g.players[id];
    if (!p || id === this.human) return;
    this.popPlayer = id;
    this.popover.classList.remove('hidden');
    this.popover.innerHTML = `
      <button class="pop-x" aria-label="Close">${icon('close')}</button>
      <div class="pop-head">
        <img src="${ballPortrait(p.nation, 96, 'neutral')}" alt="" />
        <div><h3>${p.nation.name}</h3><em>"${p.nation.motto}"</em></div>
      </div>
      <div class="pop-perk"><b>${p.nation.perk.name}</b> ${p.nation.perk.desc}</div>
      <div class="pop-stats"></div>
      <button class="big-btn pop-truce"><span class="ic">${icon('handshake')}</span><span class="pop-truce-t">Ask for truce</span></button>
      <button class="big-btn alt pop-peace"><span class="ic">${icon('gold')}</span><span class="pop-peace-t"></span></button>
      <button class="big-btn alt pop-bribe"><span class="ic">${icon('gold')}</span><span class="pop-bribe-t"></span></button>
      <button class="big-btn alt pop-bribe"><span class="ic">${icon('gold')}</span><span class="pop-bribe-t"></span></button>`;
    this.popStats = this.popover.querySelector('.pop-stats') as HTMLElement;
    this.popBtn = this.popover.querySelector('.pop-truce') as HTMLButtonElement;
    (this.popover.querySelector('.pop-x') as HTMLElement).addEventListener('click', () => this.closePopover());
    this.popBtn.addEventListener('click', () => this.cb.askTruce(id));
    (this.popover.querySelector('.pop-peace') as HTMLElement).addEventListener('click', () => this.cb.buyPeace(id));
    this.popBribes = [...this.popover.querySelectorAll('.pop-bribe')] as HTMLButtonElement[];
    for (const b of this.popBribes) b.addEventListener('click', () => this.cb.bribe(id, Number(b.dataset.target)));
    this.updatePopover();
  }

  closePopover(): void {
    this.popPlayer = -1;
    this.popover.classList.add('hidden');
  }

  private updatePopover(): void {
    const g = this.game;
    if (!g || this.popPlayer < 0) return;
    const p = g.players[this.popPlayer];
    const me = g.players[this.human];
    if (!p.alive) {
      this.closePopover();
      return;
    }
    const ratio = p.troops / Math.max(1, me.troops);
    const mood = ratio > 1.6 ? 'Much stronger than you' : ratio > 1.1 ? 'Stronger than you' : ratio > 0.8 ? 'About your strength' : ratio > 0.45 ? 'Weaker than you' : 'Much weaker than you';
    const density = p.troops / Math.max(1, p.land);
    const myDensity = me.troops / Math.max(1, me.land);
    const spread = density < myDensity * 0.7 ? 'Spread thin: cheap to attack' : density > myDensity * 1.4 ? 'Dug in: expensive to attack' : 'Average defences';
    const html = `
      <div><span>Land</span><b>${(g.landShare(p) * 100).toFixed(1)}%</b></div>
      <div><span>Troops</span><b>${fmt(p.troops)}</b></div>
      <div><span>Cities</span><b>${p.cities}</b></div>
      <p class="pop-read">${mood}. ${spread}.</p>`;
    if (this.popStats.dataset.k !== html) {
      this.popStats.dataset.k = html;
      this.popStats.innerHTML = html;
    }
    const inTruce = g.inTruce(me.id, p.id);
    const askUntil = me.truceAsk.get(p.id) ?? -1;
    const t = this.popBtn.querySelector('.pop-truce-t') as HTMLElement;
    if (inTruce) {
      const left = ((me.truces.get(p.id) ?? g.tick) - g.tick) / TPS;
      setText(t, `Truce: ${Math.ceil(left)}s left`);
      this.popBtn.disabled = true;
    } else if (askUntil > g.tick) {
      setText(t, `Ask again in ${Math.ceil((askUntil - g.tick) / TPS)}s`);
      this.popBtn.disabled = true;
    } else {
      setText(t, 'Ask for truce');
      this.popBtn.disabled = !me.alive;
    }
    // Bribe: pay this nation to turn on a rival it borders. The player picks which one.
    const peaceBtn = this.popover.querySelector('.pop-peace') as HTMLButtonElement;
    const peaceCost = g.peaceCost(me);
    setText(peaceBtn.querySelector('.pop-peace-t') as HTMLElement, `Buy a truce: ${peaceCost} gold (always accepted)`);
    peaceBtn.disabled = inTruce || me.gold < peaceCost || !me.alive;
    const options = g.bribeTargets(me.id, p.id).slice(0, 2);
    const cost = g.bribeCost(me);
    this.popBribes.forEach((b, i) => {
      const t = options[i];
      b.style.display = t ? '' : 'none';
      if (!t) return;
      b.dataset.target = String(t.id);
      setText(b.querySelector('.pop-bribe-t') as HTMLElement, `Pay them ${cost} gold to attack ${t.nation.name}`);
      b.disabled = me.gold < cost || !me.alive;
    });
  }

  coach(key: string, text: string | null): void {
    if (key === this.coachKey) return;
    this.coachKey = key;
    this.coachEl.classList.toggle('hidden', !text);
    if (text) this.coachText.innerHTML = inputWords(text);
    // The growth tip points at the bar it is talking about.
    this.fillBar.parentElement?.classList.toggle('pulse', key === 'growth');
    // Light up the buttons a tip is talking about, so it points at something rather than just describing it.
    const lit: Record<string, string[]> = { gold: ['market', 'barracks'], strike: ['bomb', 'para'] };
    this.litActions = lit[key] ?? [];
    this.chips.forEach((c) => c.classList.toggle('lit', key === 'send'));
    this.coachEl.classList.remove('pop-in');
    void this.coachEl.offsetWidth;
    this.coachEl.classList.add('pop-in');
  }

  clearBanner(): void {
    this.bannerEl.classList.add('hidden');
  }

  /** An announcement is on screen, so speech bubbles should wait rather than slide under it. */
  get bannerUp(): boolean {
    return !this.bannerEl.classList.contains('hidden');
  }

  dropFeed(prefix: string): void {
    for (const n of [...this.feedEl.children]) if (n.textContent?.startsWith(prefix)) n.remove();
  }

  /** True while the player is mid-decision, when a tutorial tip would only get in the way. */
  get busy(): boolean {
    const me = this.game?.players[this.human];
    return !!me?.cardOffer || this.askFrom > 0 || this.popPlayer > 0 || !this.modeHint.classList.contains('hidden');
  }

  capitalBanner(att: Player, def: Player, title: string, sub: string): void {
    this.bannerEl.innerHTML = `<div class="bn-row"><img src="${ballPortrait(att.nation, 96, 'happy')}" alt="" /><b>${title}</b><img src="${ballPortrait(def.nation, 96, 'scared')}" alt="" /></div><span>${sub}</span>`;
    this.bannerEl.classList.remove('hidden', 'show');
    void this.bannerEl.offsetWidth;
    this.bannerEl.classList.add('show');
    window.setTimeout(() => this.bannerEl.classList.add('hidden'), 2000);
  }

  /** Rectangles of the visible panels, so map text can stay out from under them. */
  panelRects(): { x0: number; y0: number; x1: number; y1: number }[] {
    const out: { x0: number; y0: number; x1: number; y1: number }[] = [];
    const selector = `.panel, .dom, .feed-item, .coach, .tray, .modehint, .ctl, .toast${window.innerWidth < 761 ? '' : ', .dom-label'}`;
    this.root.querySelectorAll(selector).forEach((n) => {
      const r = (n as HTMLElement).getBoundingClientRect();
      if (r.width > 0 && r.height > 0) out.push({ x0: r.left, y0: r.top, x1: r.right, y1: r.bottom });
    });
    return out;
  }

  toast(text: string): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.remove('hidden');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.add('hidden'), 1800);
  }

  banner(text: string, sub = '', ms = 1700): void {
    this.bannerEl.innerHTML = `<b>${text}</b>${sub ? `<span>${sub}</span>` : ''}`;
    this.bannerEl.classList.remove('hidden', 'show');
    void this.bannerEl.offsetWidth;
    this.bannerEl.classList.add('show');
    window.setTimeout(() => this.bannerEl.classList.add('hidden'), ms);
  }

  feed(text: string, p?: Player, tone: 'bad' | 'good' | '' = ''): void {
    // The same news twice adds nothing.
    for (const n of this.feedEl.children) if (n.textContent === text) return;
    const item = el('div', `feed-item ${tone}`);
    if (p) {
      const img = el('img');
      img.src = ballPortrait(p.nation, 44, tone === 'bad' ? 'angry' : 'neutral');
      img.alt = '';
      item.append(img);
    }
    const span = el('span');
    span.textContent = text;
    item.append(span);
    this.feedEl.append(item);
    while (this.feedEl.children.length > 2) this.feedEl.firstElementChild?.remove();
    window.setTimeout(() => item.classList.add('fade'), 7000);
    window.setTimeout(() => item.remove(), 7600);
  }

  showTruceAsk(from: Player): void {
    this.askFrom = from.id;
    this.askTimer = performance.now() + 9000;
    this.askEl.classList.remove('hidden');
    this.askEl.innerHTML = `
      <img src="${ballPortrait(from.nation, 96, 'scared')}" alt="" />
      <div><b>${from.nation.name}</b> asks for a truce</div>
      <button class="mini yes">Accept</button><button class="mini no">Refuse</button>`;
    (this.askEl.querySelector('.yes') as HTMLElement).addEventListener('click', () => {
      this.cb.replyTruce(from.id, true);
      this.askEl.classList.add('hidden');
      this.askFrom = -1;
    });
    (this.askEl.querySelector('.no') as HTMLElement).addEventListener('click', () => {
      this.cb.replyTruce(from.id, false);
      this.askEl.classList.add('hidden');
      this.askFrom = -1;
    });
  }
}
