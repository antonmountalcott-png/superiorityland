import { EMPIRES, NATIONS, nationById } from '../core/nations';
import { ACHIEVEMENTS } from '../core/progress';
import { type Account, AccountError } from '../game/account';
import { ballPortrait } from '../render/ballArt';
import { esc } from './progressUi';
import { icon } from './svg';

type Mode = 'register' | 'login' | 'recover';
const NAME_RE = /^[A-Za-z0-9_]{3,16}$/;

/** Create an account, log in, or get back in with a recovery code. */
export class AuthScreen {
  private mode: Mode = 'register';
  private busy = false;
  private notice = '';

  constructor(private root: HTMLElement, private account: Account, private onDone: () => void) {}

  show(mode: Mode = 'register', notice = ''): void {
    this.mode = mode;
    this.notice = notice;
    const r = this.root;
    r.classList.remove('hidden');
    r.innerHTML = `
      <div class="auth-inner">
        <header class="logo-wrap auth-logo">
          <h1 class="logo"><span class="l1">SUPERIORITY</span><span class="l2">LAND<small>.io</small></span></h1>
        </header>
        <section class="panel auth-panel">
          <aside class="auth-hero">
            <div class="auth-balls">
              <img class="ab a1" src="${ballPortrait(nationById('pharaonia'), 150, 'smug')}" alt="" />
              <img class="ab a2" src="${ballPortrait(NATIONS[0], 170, 'happy')}" alt="" />
              <img class="ab a3" src="${ballPortrait(nationById('romanum'), 150, 'smug')}" alt="" />
            </div>
            <h2>Your empire, saved.</h2>
            <p class="auth-one">Free account. Level up, unlock empires, keep it all.</p>
            <ul class="auth-perks">
              <li><span class="ic">${icon('ticket')}</span><span><b>30-level Battle Pass</b> earned by playing</span></li>
              <li><span class="ic">${icon('crown')}</span><span><b>Unlock 6 past empires</b> and 8 more nations</span></li>
              <li><span class="ic">${icon('flame')}</span><span><b>3 new daily challenges</b> every day</span></li>
              <li><span class="ic">${icon('medal')}</span><span><b>${ACHIEVEMENTS.length} achievements</b> to show on your profile</span></li>
            </ul>
            <div class="auth-emp"><small>PAST EMPIRES TO UNLOCK</small><div>${EMPIRES.map((e) => `<img src="${ballPortrait(e, 64, 'smug')}" alt="${e.name}" title="${e.name}" />`).join('')}</div></div>
          </aside>
          <div class="auth-main"></div>
        </section>
      </div>`;
    this.renderForm();
  }

  private renderForm(): void {
    const main = this.root.querySelector('.auth-main') as HTMLElement;
    const recover = this.mode === 'recover';
    main.innerHTML = `
      <form class="auth-form" novalidate>
        ${recover
          ? `<div class="auth-sub"><button type="button" class="auth-back">${icon('logout')}<span>Back to log in</span></button><h3>Forgot your password?</h3><p>Use the recovery code you saved when you made your account, then choose a new password.</p></div>`
          : `<div class="auth-tabs" role="tablist">
              <button type="button" role="tab" data-mode="register">Create account</button>
              <button type="button" role="tab" data-mode="login">Log in</button>
            </div>`}
        ${this.notice ? `<p class="auth-notice">${esc(this.notice)}</p>` : ''}
        <label class="fld">
          <span>Username</span>
          <input name="username" autocomplete="username" maxlength="16" spellcheck="false" autocapitalize="off" />
        </label>
        <p class="fld-msg" data-for="username"></p>
        ${recover ? `<label class="fld"><span>Recovery code</span><input name="code" maxlength="24" spellcheck="false" autocapitalize="characters" placeholder="XXXX-XXXX-XXXX-XXXX" /></label><p class="fld-msg" data-for="code"></p>` : ''}
        <label class="fld">
          <span>${recover ? 'New password' : 'Password'}</span>
          <span class="pw"><input name="password" type="password" maxlength="128" /><button type="button" class="pw-eye" aria-label="Show password">${icon('eye')}</button></span>
        </label>
        <p class="fld-msg" data-for="password"></p>
        ${this.mode !== 'login' ? '<div class="pw-meter"><i></i><i></i><i></i><span>Password strength</span></div>' : ''}
        ${this.mode === 'login' ? '<button type="button" class="auth-forgot">Forgot password?</button>' : ''}
        <p class="auth-err" role="alert"></p>
        <button class="play-btn auth-go" type="submit"></button>
        ${recover ? '' : `<p class="auth-note"><span class="ic">${icon('check')}</span><span>You stay logged in on this device, and your progress saves after every match.</span></p>
        <button type="button" class="auth-guest">Play as guest <span>(progress is not saved)</span></button>`}
      </form>`;
    const r = this.root;
    r.querySelectorAll<HTMLButtonElement>('.auth-tabs button').forEach((b) => b.addEventListener('click', () => this.setMode(b.dataset.mode as Mode)));
    r.querySelector('.auth-forgot')?.addEventListener('click', () => this.setMode('recover'));
    r.querySelector('.auth-back')?.addEventListener('click', () => this.setMode('login'));
    const pass = this.input('password');
    const eye = r.querySelector('.pw-eye') as HTMLButtonElement;
    eye.addEventListener('click', () => {
      const show = pass.type === 'password';
      pass.type = show ? 'text' : 'password';
      eye.innerHTML = icon(show ? 'eyeOff' : 'eye');
      eye.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
    r.querySelectorAll('input').forEach((i) => i.addEventListener('input', () => this.check(false)));
    (r.querySelector('.auth-form') as HTMLFormElement).addEventListener('submit', (e) => {
      e.preventDefault();
      void this.submit();
    });
    r.querySelector('.auth-guest')?.addEventListener('click', () => {
      if (!this.account.signedIn && this.account.progress.xp === 0) this.account.playAsGuest();
      this.hide();
      this.onDone();
    });
    r.querySelectorAll<HTMLButtonElement>('.auth-tabs button').forEach((b) => {
      const on = b.dataset.mode === this.mode;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    });
    (r.querySelector('.auth-go') as HTMLElement).textContent = this.goLabel();
    pass.autocomplete = this.mode === 'login' ? 'current-password' : 'new-password';
    this.check(false);
  }

  private goLabel(busy = false): string {
    if (this.mode === 'register') return busy ? 'CREATING...' : 'CREATE ACCOUNT';
    if (this.mode === 'login') return busy ? 'LOGGING IN...' : 'LOG IN';
    return busy ? 'SAVING...' : 'SET NEW PASSWORD';
  }

  private input(name: string): HTMLInputElement {
    return this.root.querySelector(`input[name=${name}]`) as HTMLInputElement;
  }

  hide(): void {
    this.root.classList.add('hidden');
    this.root.innerHTML = '';
  }

  rects(): { x0: number; y0: number; x1: number; y1: number }[] {
    return ['.auth-logo', '.auth-panel'].map((sel) => {
      const r = (this.root.querySelector(sel) as HTMLElement | null)?.getBoundingClientRect();
      return r ? { x0: r.left - 30, y0: r.top - 10, x1: r.right + 30, y1: r.bottom + 10 } : { x0: 0, y0: 0, x1: 0, y1: 0 };
    });
  }

  get visible(): boolean {
    return !this.root.classList.contains('hidden');
  }

  private setMode(mode: Mode): void {
    const name = this.root.querySelector<HTMLInputElement>('input[name=username]')?.value ?? '';
    this.mode = mode;
    this.notice = '';
    this.renderForm();
    this.input('username').value = name;
    this.check(false);
  }

  /**
   * One message under each field, never a second copy elsewhere. While typing, a new account sees its rules
   * (green when met); on submit, the first field with a problem says what is wrong and gets the focus.
   */
  private check(strict: boolean): boolean {
    const uname = this.input('username').value.trim();
    const nameWhy = uname.length < 3 ? `Too short: ${uname.length} of at least 3 characters` : uname.length > 16 ? 'Too long: 16 characters at most' : 'Only letters, numbers and _ are allowed';
    const fields: { name: string; value: string; rule: string; why: string; ok: boolean; empty: string }[] = [
      { name: 'username', value: uname, rule: '3 to 16 letters, numbers or _', why: nameWhy, ok: NAME_RE.test(uname), empty: 'Enter your username.' },
    ];
    if (this.mode === 'recover') {
      const code = this.input('code').value.replace(/[^A-Za-z0-9]/g, '');
      fields.push({ name: 'code', value: code, rule: 'The 16-letter code from when you signed up', why: `That is ${code.length} of the 16 letters and numbers`, ok: code.length === 16, empty: 'Enter your recovery code.' });
    }
    const pw = this.input('password').value;
    fields.push({ name: 'password', value: pw, rule: 'At least 6 characters', why: `Too short: ${pw.length} of at least 6 characters`, ok: pw.length >= 6, empty: 'Enter a password.' });
    const showRules = this.mode !== 'login';
    let first: HTMLInputElement | null = null;
    for (const f of fields) {
      const msg = this.root.querySelector(`.fld-msg[data-for=${f.name}]`) as HTMLElement;
      const bad = strict && (!f.value || (showRules && !f.ok));
      msg.className = `fld-msg${bad ? ' bad' : showRules && f.ok ? ' ok' : ''}`;
      msg.textContent = bad ? (f.value ? f.why : f.empty) : showRules ? f.rule : '';
      this.input(f.name).classList.toggle('bad', bad);
      if (bad && !first) first = this.input(f.name);
    }
    // A password strength meter for new passwords.
    const meter = this.root.querySelector('.pw-meter') as HTMLElement | null;
    if (meter) {
      const score = !pw ? 0 : pw.length < 6 ? 1 : (pw.length >= 10 ? 1 : 0) + (/[a-z]/.test(pw) && /[A-Z]/.test(pw) ? 1 : 0) + (/\d/.test(pw) ? 1 : 0) + (/[^A-Za-z0-9]/.test(pw) ? 1 : 0) + 1;
      const level = score <= 1 ? 'weak' : score <= 3 ? 'ok' : 'strong';
      meter.className = `pw-meter ${pw ? level : ''}`;
      (meter.querySelector('span') as HTMLElement).textContent = !pw ? 'Password strength' : level === 'weak' ? 'Weak: try 10+ characters' : level === 'ok' ? 'OK: add numbers or symbols to make it strong' : 'Strong password';
    }
    first?.focus();
    return !first;
  }

  private async submit(): Promise<void> {
    if (this.busy) return;
    const err = this.root.querySelector('.auth-err') as HTMLElement;
    err.textContent = '';
    this.root.querySelector('.auth-notice')?.remove();
    if (!this.check(true)) return;
    this.busy = true;
    const go = this.root.querySelector('.auth-go') as HTMLButtonElement;
    go.disabled = true;
    go.textContent = this.goLabel(true);
    const name = this.input('username').value.trim();
    const pw = this.input('password').value;
    try {
      if (this.mode === 'register') this.showCode(await this.account.register(name, pw), 'new');
      else if (this.mode === 'recover') this.showCode(await this.account.recover(name, this.input('code').value, pw), 'recovered');
      else {
        await this.account.login(name, pw);
        this.hide();
        this.onDone();
      }
    } catch (e) {
      err.textContent = e instanceof AccountError ? e.message : 'Something went wrong. Please try again.';
      if (e instanceof AccountError && e.status === 401) for (const n of ['username', 'password', 'code']) this.root.querySelector(`input[name=${n}]`)?.classList.add('bad');
      go.disabled = false;
      go.textContent = this.goLabel();
    } finally {
      this.busy = false;
    }
  }

  /** The recovery code is shown once, right after it is made, with an obvious way to keep it. */
  private showCode(code: string, why: 'new' | 'recovered'): void {
    const main = this.root.querySelector('.auth-main') as HTMLElement;
    const carried = why === 'new' && this.account.carried > 0
      ? `<p class="auth-carry">${icon('check')}<span>Your ${this.account.carried.toLocaleString('en-US')} XP from playing as a guest is saved to <b>${esc(this.account.username ?? '')}</b>.</span></p>`
      : '';
    main.innerHTML = `
      <div class="auth-code">
        <h3>${why === 'new' ? `Welcome, ${esc(this.account.username ?? '')}!` : 'Password changed'}</h3>
        ${carried}
        <p>${why === 'new' ? 'This is your <b>recovery code</b>. If you ever forget your password, it is the only way back into your account.' : 'Your old recovery code no longer works. Here is your <b>new</b> one.'}</p>
        <div class="code-box"><code>${esc(code)}</code><button type="button" class="code-copy">${icon('cards')}<span>Copy</span></button></div>
        <p class="code-warn">We show it only once. Write it down or save it somewhere safe.</p>
        <label class="code-ack"><input type="checkbox" /><span>I have saved my recovery code</span></label>
        <button class="play-btn auth-done" disabled>CONTINUE</button>
      </div>`;
    const copy = main.querySelector('.code-copy') as HTMLButtonElement;
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(code);
        (copy.querySelector('span') as HTMLElement).textContent = 'Copied!';
      } catch {
        (copy.querySelector('span') as HTMLElement).textContent = 'Select and copy';
      }
    });
    const ack = main.querySelector('.code-ack input') as HTMLInputElement;
    const done = main.querySelector('.auth-done') as HTMLButtonElement;
    ack.addEventListener('change', () => { done.disabled = !ack.checked; });
    done.addEventListener('click', () => {
      this.hide();
      this.onDone();
    });
  }
}
