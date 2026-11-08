import { type Progress, defaultProgress, sanitizeProgress } from '../core/progress';

const TOKEN_KEY = 'superiorityland.session';

export type SaveState = 'guest' | 'saving' | 'saved' | 'retrying';

export class AccountError extends Error {
  constructor(message: string, readonly status = 0) {
    super(message);
  }
}

/**
 * The player's account: who is logged in, their progress, and keeping it saved on the server.
 * Guests get the same progress object, held in memory only.
 */
export class Account {
  username: string | null = null;
  createdAt = 0;
  progress: Progress = defaultProgress();
  saveState: SaveState = 'guest';
  /** Guest XP that came along when this account was created, for a thank-you message. */
  carried = 0;
  lastSaved = 0;
  private listeners = new Set<() => void>();
  private saveTimer = 0;

  get signedIn(): boolean {
    return this.username !== null;
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  private get token(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }

  private set token(v: string | null) {
    try {
      if (v) localStorage.setItem(TOKEN_KEY, v);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      // Storage blocked: the player stays logged in for this visit only.
    }
  }

  private async api<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = this.token;
    let res: Response;
    try {
      res = await fetch(path, {
        ...init,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      });
    } catch {
      throw new AccountError('Cannot reach the game server. Check your connection and try again.');
    }
    let body: Record<string, unknown> = {};
    try {
      body = await res.json();
    } catch {
      // Not JSON: fall through to a generic message.
    }
    if (!res.ok) {
      const offline = res.status === 404 && !body.error;
      throw new AccountError(offline ? 'Accounts need the game server. Start it with "npm run server".' : String(body.error ?? `Server error (${res.status}).`), res.status);
    }
    return body as T;
  }

  private adopt(body: { username: string; createdAt: number; updatedAt?: number; progress: unknown; token?: string }): void {
    if (body.token) this.token = body.token;
    this.username = body.username;
    this.createdAt = body.createdAt;
    this.progress = sanitizeProgress(body.progress);
    this.saveState = 'saved';
    this.lastSaved = body.updatedAt ?? Date.now();
    this.emit();
  }

  /** Logs straight back in with the remembered session. */
  async restore(): Promise<'user' | 'none' | 'offline'> {
    if (!this.token) return 'none';
    try {
      this.adopt(await this.api('/api/me'));
      return 'user';
    } catch (e) {
      if (e instanceof AccountError && e.status === 401) {
        this.token = null;
        return 'none';
      }
      return 'offline';
    }
  }

  /** Creating an account keeps whatever a guest earned this visit. Returns the one-time recovery code. */
  async register(username: string, password: string): Promise<string> {
    const carry = this.progress.xp > 0 ? this.progress : undefined;
    const body = await this.api<{ username: string; createdAt: number; progress: unknown; token: string; recoveryCode: string }>('/api/register', { method: 'POST', body: JSON.stringify({ username, password, progress: carry }) });
    this.carried = carry?.xp ?? 0;
    this.adopt(body);
    return body.recoveryCode;
  }

  /** Sets a new password with the recovery code. Returns the replacement code. */
  async recover(username: string, code: string, password: string): Promise<string> {
    const body = await this.api<{ username: string; createdAt: number; progress: unknown; token: string; recoveryCode: string }>('/api/recover', { method: 'POST', body: JSON.stringify({ username, code, password }) });
    this.adopt(body);
    return body.recoveryCode;
  }

  async login(username: string, password: string): Promise<void> {
    this.adopt(await this.api('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) }));
  }

  async logout(): Promise<void> {
    window.clearTimeout(this.saveTimer);
    if (this.saveState === 'saving' || this.saveState === 'retrying') await this.flush();
    await this.api('/api/logout', { method: 'POST' }).catch(() => undefined);
    this.token = null;
    this.playAsGuest();
  }

  playAsGuest(): void {
    this.username = null;
    this.createdAt = 0;
    this.progress = defaultProgress();
    this.saveState = 'guest';
    this.emit();
  }

  /** Changes progress and saves it. */
  update(change: (p: Progress) => void): void {
    change(this.progress);
    this.progress = sanitizeProgress(this.progress);
    this.queueSave();
    this.emit();
  }

  setProgress(p: Progress): void {
    this.progress = sanitizeProgress(p);
    this.queueSave();
    this.emit();
  }

  private queueSave(): void {
    if (!this.signedIn) return;
    this.saveState = 'saving';
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => void this.flush(), 300);
  }

  /** Sends the latest progress. On failure it keeps trying, and says so on screen. */
  async flush(): Promise<boolean> {
    if (!this.signedIn) return false;
    window.clearTimeout(this.saveTimer);
    try {
      const r = await this.api<{ updatedAt: number }>('/api/progress', { method: 'PUT', body: JSON.stringify({ progress: this.progress }) });
      this.saveState = 'saved';
      this.lastSaved = r.updatedAt;
      this.emit();
      return true;
    } catch (e) {
      if (e instanceof AccountError && e.status === 401) {
        this.saveState = 'retrying';
        this.emit();
        return false;
      }
      this.saveState = 'retrying';
      this.emit();
      this.saveTimer = window.setTimeout(() => void this.flush(), 8000);
      return false;
    }
  }
}
