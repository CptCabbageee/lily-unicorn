import Phaser from 'phaser';
import { supabase, loadProgress } from '../lib/supabase';
import { nextColor, resetColors } from '../lib/colors';
import { POO_STYLES, loadPooStyle, makePooTextures, savePooStyle } from '../lib/poos';

type Difficulty = 'easy' | 'medium' | 'hard';

// The start-screen picture has Lily and the unicorn in its left third, so the
// poo picker and difficulty buttons sit in a column on the right, centred here.
const MENU_X = 730;

const SIGN_IN_ENABLED = false;

export class LoginScene extends Phaser.Scene {
  private loginFormEl: HTMLElement | null = null;

  constructor() {
    super({ key: 'LoginScene' });
  }

  preload(): void {
    this.load.image('splash', 'assets/splash-lily.jpg');
    this.load.image('poop',   'assets/poop.png');  // Classic poo, for the poo picker
  }

  create(): void {
    resetColors();
    makePooTextures(this);
    if (!this.registry.get('pooStyle')) this.registry.set('pooStyle', loadPooStyle());
    this.createBackground();
    this.createTitle();
    void this.checkSession();
  }

  // Remove the DOM overlay when this scene stops (e.g. on scene.start('PreloadScene'))
  shutdown(): void {
    this.removeLoginForm();
  }

  // ─── Background ───────────────────────────────────────────────────────────

  private createBackground(): void {
    this.add.rectangle(480, 270, 960, 540, 0x87ceeb);
    // Cover mode: scale so the image fills the full 960×540 canvas edge-to-edge
    const img = this.add.image(480, 270, 'splash');
    img.setScale(Math.max(960 / img.width, 540 / img.height));
    this.add.rectangle(480, 270, 960, 540, 0x000000, 0.22);
  }

  private createTitle(): void {
    const words = ["Lily's", 'Magical', 'Pooping', 'Unicorn'];
    const colors = ['#ff2222', '#ff66bb', '#ffee22', '#44aaff'];
    const gap = 10;
    const textObjs = words.map((word, i) =>
      this.add.text(-2000, 62, word, {
        fontSize: '54px',
        fontFamily: 'Schoolbell, cursive',
        color: colors[i % colors.length],
        stroke: '#000000',
        strokeThickness: 6,
        shadow: { offsetX: 2, offsetY: 3, color: '#000000', blur: 6, fill: true },
      }).setOrigin(0, 0.5).setDepth(5)
    );
    const reposition = () => {
      const totalW = textObjs.reduce((s, t) => s + t.width, 0) + gap * (words.length - 1);
      let x = (960 - totalW) / 2;
      textObjs.forEach(t => { t.setX(x); x += t.width + gap; });
    };
    reposition();
    this.time.delayedCall(150, reposition);
  }

  // ─── Auth flow ────────────────────────────────────────────────────────────

  private async checkSession(): Promise<void> {
    // Sign-in is switched off: the Supabase project is paused and the free plan
    // has no spare project slot to restore it, so everyone plays as a guest. Set SIGN_IN_ENABLED back
    // to true (and point .env.local at a live project) to bring logins back.
    if (!SIGN_IN_ENABLED) {
      this.registry.set('guestMode', true);
      this.registry.set('userId', null);
      this.showDifficultySelector();
      return;
    }

    // Fast paths — no async needed when we already know who the player is
    if (this.registry.get('guestMode')) {
      this.showDifficultySelector();
      return;
    }
    if (this.registry.get('userId')) {
      this.showDifficultySelector();
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        this.registry.set('userId', session.user.id);
        const progress = await loadProgress(session.user.id);
        if (progress) {
          this.registry.set('totalScore',   progress.total_score);
          this.registry.set('bestScore',    progress.best_score);
          this.registry.set('currentLevel', progress.current_level);
        }
        this.showDifficultySelector();
        return;
      }
    } catch {
      // Network error or Supabase unavailable — fall through to login form
    }

    this.showLoginForm();
  }

  // ─── Login form (plain DOM overlay, not Phaser DOM plugin) ────────────────

  private showLoginForm(): void {
    const wrap = document.createElement('div');
    wrap.id = 'login-overlay';
    wrap.style.cssText = `
      position: fixed;
      top: 0; left: 0;
      width: 100%; height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      pointer-events: none;
    `;

    const panel = document.createElement('div');
    panel.style.cssText = `
      background: rgba(255,255,255,0.15);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      padding: 28px 32px;
      border-radius: 20px;
      color: white;
      font-family: 'Bubblegum Sans', cursive;
      width: 340px;
      text-align: center;
      border: 1px solid rgba(255,255,255,0.3);
      box-shadow: 0 8px 40px rgba(0,0,0,0.5);
      pointer-events: auto;
    `;

    const inputStyle = `width:100%;padding:11px 12px;margin:5px 0;border-radius:10px;
      border:1px solid rgba(255,255,255,0.4);background:rgba(255,255,255,0.18);
      color:white;font-size:14px;font-family:'Bubblegum Sans',cursive;
      box-sizing:border-box;outline:none;`;
    const btnPink = `width:100%;padding:12px;margin:5px 0;border-radius:10px;border:none;
      background:linear-gradient(135deg,#f0186a,#e91e8c);color:white;cursor:pointer;
      font-size:16px;font-family:'Bubblegum Sans',cursive;font-weight:bold;
      box-shadow:0 4px 14px rgba(233,30,140,0.5);letter-spacing:0.5px;`;
    const btnPurple = `width:100%;padding:12px;margin:5px 0;border-radius:10px;border:none;
      background:linear-gradient(135deg,#7c3aed,#a855f7);color:white;cursor:pointer;
      font-size:16px;font-family:'Bubblegum Sans',cursive;font-weight:bold;
      box-shadow:0 4px 14px rgba(124,58,237,0.5);letter-spacing:0.5px;`;
    const btnGhost = `width:100%;padding:10px;margin:4px 0;border-radius:10px;
      border:1px solid rgba(255,255,255,0.35);background:rgba(255,255,255,0.1);
      color:rgba(255,255,255,0.85);cursor:pointer;font-size:14px;
      font-family:'Bubblegum Sans',cursive;`;
    const btnGuest = `width:100%;padding:9px;margin:4px 0;border-radius:10px;
      border:1px solid rgba(255,255,255,0.2);background:transparent;
      color:rgba(255,255,255,0.55);cursor:pointer;font-size:13px;
      font-family:'Bubblegum Sans',cursive;`;

    panel.innerHTML = `
      <h2 style="margin:0 0 16px;font-size:22px;font-family:'Schoolbell',cursive;
                 color:#fff;text-shadow:0 2px 8px rgba(0,0,0,0.6);letter-spacing:1px;">
        Sign In
      </h2>
      <input id="lsi-email" type="email" placeholder="Email" style="${inputStyle}" />
      <input id="lsi-pass" type="password" placeholder="Password" style="${inputStyle}" />
      <div id="lsi-err" style="color:#ffb3c6;font-size:12px;min-height:18px;margin:4px 0;text-shadow:0 1px 3px rgba(0,0,0,0.8);"></div>
      <button id="lsi-login" style="${btnPink}">Sign In</button>
      <button id="lsi-signup" style="${btnPurple}">Create Account</button>
      <hr style="border:none;border-top:1px solid rgba(255,255,255,0.2);margin:14px 0;" />
      <button id="lsi-google" style="${btnGhost}">🔗 Continue with Google</button>
      <button id="lsi-fb" style="${btnGhost}">📘 Facebook (setup required)</button>
      <button id="lsi-tw" style="${btnGhost}">𝕏 X / Twitter (setup required)</button>
      <hr style="border:none;border-top:1px solid rgba(255,255,255,0.2);margin:14px 0;" />
      <button id="lsi-guest" style="${btnGuest}">Play as Guest (no save)</button>
    `;

    wrap.appendChild(panel);
    document.body.appendChild(wrap);
    this.loginFormEl = wrap;

    const q = (id: string) => document.getElementById(id)!;
    const err  = () => q('lsi-err');
    const email = () => (q('lsi-email') as HTMLInputElement).value.trim();
    const pass  = () => (q('lsi-pass')  as HTMLInputElement).value;

    const friendlyError = (msg: string): string => {
      if (msg.toLowerCase().includes('failed to fetch') || msg.toLowerCase().includes('fetch')) {
        return 'Cannot reach Supabase — the project may be paused. Visit app.supabase.com to restore it, or Play as Guest.';
      }
      return msg;
    };

    q('lsi-login').addEventListener('click', async () => {
      err().textContent = '';
      if (!email()) { err().textContent = 'Please enter your email.'; return; }
      if (!pass())  { err().textContent = 'Please enter a password.'; return; }
      (q('lsi-login') as HTMLButtonElement).disabled = true;
      q('lsi-login').textContent = 'Signing in…';
      const { error } = await supabase.auth.signInWithPassword({ email: email(), password: pass() });
      if (error) {
        err().textContent = friendlyError(error.message);
        (q('lsi-login') as HTMLButtonElement).disabled = false;
        q('lsi-login').textContent = 'Sign In';
      } else {
        await this.onAuthSuccess();
      }
    });

    q('lsi-signup').addEventListener('click', async () => {
      err().textContent = '';
      if (!email()) { err().textContent = 'Please enter your email.'; return; }
      if (!pass())  { err().textContent = 'Please enter a password.'; return; }
      (q('lsi-signup') as HTMLButtonElement).disabled = true;
      q('lsi-signup').textContent = 'Creating…';
      const { error } = await supabase.auth.signUp({ email: email(), password: pass() });
      if (error) {
        err().textContent = friendlyError(error.message);
      } else {
        err().textContent = 'Check your email to confirm, then sign in.';
      }
      (q('lsi-signup') as HTMLButtonElement).disabled = false;
      q('lsi-signup').textContent = 'Create Account';
    });

    q('lsi-google').addEventListener('click', () => {
      void supabase.auth.signInWithOAuth({ provider: 'google' });
    });

    // TODO: Enable Facebook OAuth — register at developers.facebook.com,
    // enable in Supabase Dashboard, then change to: supabase.auth.signInWithOAuth({ provider: 'facebook' })
    q('lsi-fb').addEventListener('click', () => {
      err().textContent = 'Facebook OAuth not yet configured — see TODO in LoginScene.ts';
    });

    // TODO: Enable X/Twitter OAuth — register at developer.twitter.com,
    // enable in Supabase Dashboard, then change to: supabase.auth.signInWithOAuth({ provider: 'twitter' })
    q('lsi-tw').addEventListener('click', () => {
      err().textContent = 'X/Twitter OAuth not yet configured — see TODO in LoginScene.ts';
    });

    q('lsi-guest').addEventListener('click', () => {
      this.registry.set('guestMode', true);
      this.registry.set('userId', null);
      this.removeLoginForm();
      this.showDifficultySelector();
    });
  }

  private removeLoginForm(): void {
    if (this.loginFormEl && this.loginFormEl.parentNode) {
      this.loginFormEl.parentNode.removeChild(this.loginFormEl);
    }
    this.loginFormEl = null;
  }

  private async onAuthSuccess(): Promise<void> {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        this.registry.set('userId', session.user.id);
        const progress = await loadProgress(session.user.id);
        if (progress) {
          this.registry.set('totalScore',   progress.total_score);
          this.registry.set('bestScore',    progress.best_score);
          this.registry.set('currentLevel', progress.current_level);
        }
      }
    } catch {
      // Non-fatal — continue without saved progress
    }
    this.removeLoginForm();
    this.showDifficultySelector();
  }

  // ─── Difficulty selector (Phaser graphics, no DOM needed) ─────────────────

  // Row of poo styles above the difficulty pills. Tapping one picks it (it
  // doesn't start the game) and it's remembered for next time.
  private showPooPicker(): void {
    this.add.text(MENU_X, 140, 'PICK YOUR POO', {
      fontSize: '20px', fontFamily: 'Lilita One, cursive',
      color: nextColor(), stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(6);

    // 3 × 2 grid
    const size = 82, gap = 96, cols = 3, top = 196;
    const frames: Array<{ key: string; g: Phaser.GameObjects.Graphics }> = [];
    const refresh = () => {
      const chosen = this.registry.get('pooStyle') as string;
      frames.forEach(({ key, g }) => {
        const on = key === chosen;
        g.clear();
        g.fillStyle(on ? 0xff4f9a : 0x000000, on ? 0.85 : 0.45);
        g.fillRoundedRect(-size / 2, -size / 2, size, size, 16);
        g.lineStyle(on ? 4 : 1, on ? 0xffffff : 0xaaaaaa, 1);
        g.strokeRoundedRect(-size / 2, -size / 2, size, size, 16);
      });
    };

    POO_STYLES.forEach((style, i) => {
      const cx = MENU_X + ((i % cols) - (cols - 1) / 2) * gap;
      const cy = top + Math.floor(i / cols) * gap;
      const g = this.add.graphics().setPosition(cx, cy).setDepth(6);
      frames.push({ key: style.key, g });

      this.add.image(cx, cy - 8, style.key).setScale(0.48).setDepth(7);
      this.add.text(cx, cy + 30, style.name, {
        fontSize: '12px', fontFamily: 'Bubblegum Sans, cursive',
        color: '#ffffff', stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0.5).setDepth(8);

      this.add.rectangle(cx, cy, size, size, 0x000000, 0)
        .setDepth(8).setInteractive({ useHandCursor: true })
        .on('pointerdown', () => {
          this.registry.set('pooStyle', style.key);
          savePooStyle(style.key);
          refresh();
        });
    });
    refresh();
  }

  private showDifficultySelector(): void {
    const lastDiff = (this.registry.get('difficulty') as Difficulty | undefined) || 'easy';

    // SPACE = quick-start with previously used difficulty
    const spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    spaceKey.once('down', () => {
      this.registry.set('difficulty', lastDiff);
      this.scene.start('PreloadScene');
    });

    this.showPooPicker();

    this.add.text(MENU_X, 362, 'SELECT DIFFICULTY', {
      fontSize: '22px', fontFamily: 'Lilita One, cursive',
      color: nextColor(), stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setDepth(6);

    const diffLabel = lastDiff.toUpperCase();
    this.add.text(MENU_X, 508, `SPACE — start as ${diffLabel}  •  or tap a difficulty below`, {
      fontSize: '14px', fontFamily: 'Bubblegum Sans, cursive',
      color: '#ffdd88', stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(6);

    const diffs: Array<{ cx: number; label: string; desc: string; col: number; key: Difficulty }> = [
      { cx: MENU_X - 142, label: 'EASY',   desc: '200 px/s  •  2–3.5 s',   col: 0x1a8833, key: 'easy'   },
      { cx: MENU_X,       label: 'MEDIUM', desc: '600 px/s  •  1.2–2 s',   col: 0xcc7700, key: 'medium' },
      { cx: MENU_X + 142, label: 'HARD',   desc: '1200 px/s •  0.6–1 s',   col: 0xcc2222, key: 'hard'   },
    ];

    diffs.forEach(d => {
      const isSelected = d.key === lastDiff;
      const w = 132, h = 84, r = 16;
      const ly = 384, lx = d.cx - w / 2;

      // Rounded pill visual
      const g = this.add.graphics().setDepth(6).setAlpha(isSelected ? 1 : 0.38);
      g.fillStyle(d.col, 1);
      g.fillRoundedRect(lx, ly, w, h, r);
      g.lineStyle(isSelected ? 4 : 1, isSelected ? 0xffffff : 0xaaaaaa, 1);
      g.strokeRoundedRect(lx, ly, w, h, r);

      // Invisible interactive hitbox aligned over the pill
      const hit = this.add.rectangle(d.cx, ly + h / 2, w, h, 0x000000, 0)
        .setDepth(7).setInteractive({ useHandCursor: true });
      hit.on('pointerover', () => g.setAlpha(isSelected ? 1 : 0.72));
      hit.on('pointerout',  () => g.setAlpha(isSelected ? 1 : 0.38));
      hit.on('pointerdown', () => {
        this.registry.set('difficulty', d.key);
        this.scene.start('PreloadScene');
      });

      this.add.text(d.cx, ly + 24, d.label, {
        fontSize: '24px', fontFamily: 'Lilita One, cursive',
        color: isSelected ? '#ffffff' : '#aaaaaa', stroke: '#000000', strokeThickness: 4,
      }).setOrigin(0.5).setDepth(8);

      this.add.text(d.cx, ly + 52, d.desc, {
        fontSize: '11px', fontFamily: 'Bubblegum Sans, cursive',
        color: isSelected ? '#ffeecc' : '#777777',
      }).setOrigin(0.5).setDepth(8);

      if (isSelected) {
        this.add.text(d.cx, ly + 72, '▲ SELECTED', {
          fontSize: '10px', fontFamily: 'Bubblegum Sans, cursive', color: '#ffdd00',
        }).setOrigin(0.5).setDepth(8);
      }
    });
  }
}
