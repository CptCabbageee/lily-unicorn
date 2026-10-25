import Phaser from 'phaser';
import { upsertProgress } from '../lib/supabase';
import { nextColor, resetColors, LILY_PALETTE } from '../lib/colors';

interface CloudLayer {
  sprites: Phaser.GameObjects.Image[];
  speed: number;
}

type TreeType = 'small' | 'medium' | 'big';

interface ObstacleData {
  sprite: Phaser.Physics.Arcade.Image;
  type: TreeType;
  points: number;
}

type Difficulty = 'easy' | 'medium' | 'hard';

interface DifficultyConfig {
  baseSpeed: number;
  baseAccel: number;
  accelGrowth: number;
  maxSpeed: number;
  spawnMin: number;
  spawnMax: number;
}

const DIFFICULTY_CONFIGS: Record<Difficulty, DifficultyConfig> = {
  easy:   { baseSpeed: 200,  baseAccel: 1,  accelGrowth: 0, maxSpeed: 1200, spawnMin: 2000, spawnMax: 3500 },
  medium: { baseSpeed: 600,  baseAccel: 3,  accelGrowth: 0, maxSpeed: 2000, spawnMin: 1200, spawnMax: 2000 },
  hard:   { baseSpeed: 1200, baseAccel: 12, accelGrowth: 0, maxSpeed: 3000, spawnMin: 600,  spawnMax: 1000 },
};

export class GameScene extends Phaser.Scene {
  // World
  private scrollSpeed = 200;
  private elapsedTime = 0;
  private baseSpeed = 200;
  private baseAccel = 1;
  private accelGrowth = 0;
  private maxSpeed = 1200;
  private spawnMin = 2000;
  private spawnMax = 3500;

  private groundGroup!: Phaser.Physics.Arcade.StaticGroup;
  private groundTiles: Phaser.Physics.Arcade.Image[] = [];
  private cloudLayers: CloudLayer[] = [];

  // Player
  private unicorn!: Phaser.Physics.Arcade.Sprite;
  private lily!: Phaser.GameObjects.Image;
  private isGrounded = false;

  // Jump — mutable so jump upgrades can raise it
  private jumpVelocity = -650;
  private jumpInitialVelocity = -650;
  private jumpPoopFired = false;
  private isJumping = false;

  // Camera zoom — game world only; HUD stays fixed on a second camera
  private uiCamera: Phaser.Cameras.Scene2D.Camera | null = null;
  private currentZoom = 1.0;

  // Poop — base values modified by upgrades
  private poopGroup!: Phaser.Physics.Arcade.Group;
  private poopCooldown = 0;
  private basePoopCooldown = 0.35;
  private poopFwdSpeed = 300;
  private explosionUpgradeMult = 1;
  private isChargingPoop = false;
  private chargeStartTime = 0;
  private landedPoops = new Set<Phaser.Physics.Arcade.Image>();

  // Obstacles
  private obstacles: ObstacleData[] = [];
  private nextObstacleTime = 0;

  // Input
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private spaceKey!: Phaser.Input.Keyboard.Key;

  // Score / UI
  private score = 0;
  private scoreTimer = 0;
  private scoreText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private upgradeBtn!: Phaser.GameObjects.Text;
  private isGameOver = false;
  private isPaused = false;
  private upgradeMenuOpen = false;
  private gameOverContainer!: Phaser.GameObjects.Container;
  private pauseOverlay!: Phaser.GameObjects.Container;

  // Levelling & upgrades
  private currentLevel = 1;
  private totalScoreAtRunStart = 0;
  private bestScore = 0;
  private upgradePoints = 0;
  private upgrades: Record<'unicorn'|'jump'|'speed'|'fireRate'|'blastRadius', number> =
    { unicorn: 0, jump: 0, speed: 0, fireRate: 0, blastRadius: 0 };
  private readonly MAX_UPGRADE = 100;

  // Ground constants
  private readonly GROUND_Y = 508;
  private readonly GROUND_H = 32;
  private readonly TILE_W = 64;

  constructor() {
    super({ key: 'GameScene' });
  }

  create(): void {
    resetColors();
    this.isGameOver = false;
    this.score = 0;
    this.scoreTimer = 0;
    this.elapsedTime = 0;
    this.obstacles = [];
    this.isGrounded = false;
    this.isChargingPoop = false;
    this.poopCooldown = 0;
    this.isPaused = false;
    this.isJumping = false;
    this.jumpPoopFired = false;
    this.landedPoops = new Set();
    this.currentZoom = 1.0;

    const diff = (this.registry.get('difficulty') as Difficulty) || 'easy';
    this.applyDifficulty(diff);
    this.loadLocalProgress();

    this.createClouds();
    this.createGround();
    this.createUnicorn();
    this.createPoopGroup();
    this.createInput();
    this.createUI();
    this.setupCameras();

    this.scheduleNextObstacle();
  }

  // ─── Difficulty ───────────────────────────────────────────────────────────

  private applyDifficulty(diff: Difficulty): void {
    const cfg = DIFFICULTY_CONFIGS[diff];
    this.baseSpeed    = cfg.baseSpeed;
    this.baseAccel    = cfg.baseAccel;
    this.accelGrowth  = cfg.accelGrowth;
    this.maxSpeed     = cfg.maxSpeed;
    this.spawnMin     = cfg.spawnMin;
    this.spawnMax     = cfg.spawnMax;
    this.scrollSpeed  = cfg.baseSpeed;
  }

  // ─── Progress ─────────────────────────────────────────────────────────────

  private loadLocalProgress(): void {
    this.totalScoreAtRunStart = parseInt(localStorage.getItem('unicorn_totalScore') || '0');
    this.bestScore            = parseInt(localStorage.getItem('unicorn_bestScore')  || '0');
    this.currentLevel         = Math.floor(this.totalScoreAtRunStart / 100) + 1;
    this.upgradePoints        = parseInt(localStorage.getItem('unicorn_upgradePoints') || '0');

    try {
      const saved = JSON.parse(localStorage.getItem('unicorn_upgrades') || '{}');
      this.upgrades = { unicorn: 0, jump: 0, speed: 0, fireRate: 0, blastRadius: 0, ...saved };
    } catch { /* ignore */ }

    const regTotal = this.registry.get('totalScore') as number | undefined;
    const regBest  = this.registry.get('bestScore')  as number | undefined;
    const regLevel = this.registry.get('currentLevel') as number | undefined;
    if (regTotal !== undefined) {
      this.totalScoreAtRunStart = regTotal;
      this.bestScore            = regBest ?? this.bestScore;
      this.currentLevel         = regLevel ?? this.currentLevel;
    }

    this.applyAllUpgrades();
  }

  private saveProgress(): void {
    const newTotal = this.totalScoreAtRunStart + this.score;
    const newLevel = Math.floor(newTotal / 100) + 1;
    const newBest  = Math.max(this.bestScore, this.score);

    localStorage.setItem('unicorn_totalScore',    String(newTotal));
    localStorage.setItem('unicorn_level',         String(newLevel));
    localStorage.setItem('unicorn_bestScore',     String(newBest));
    localStorage.setItem('unicorn_upgradePoints', String(this.upgradePoints));
    localStorage.setItem('unicorn_upgrades',      JSON.stringify(this.upgrades));

    this.registry.set('totalScore',   newTotal);
    this.registry.set('bestScore',    newBest);
    this.registry.set('currentLevel', newLevel);

    const userId = this.registry.get('userId') as string | null;
    if (userId) {
      void upsertProgress({ user_id: userId, current_level: newLevel, total_score: newTotal, best_score: newBest });
    }
  }

  // Apply all upgrade effects from saved state
  private applyAllUpgrades(): void {
    this.jumpVelocity        = -650 - this.upgrades.jump * 40;
    this.poopFwdSpeed        = 300  + this.upgrades.unicorn * 50;
    this.basePoopCooldown    = Math.max(0.35 - this.upgrades.fireRate * 0.04, 0.1);
    this.explosionUpgradeMult = 1   + this.upgrades.blastRadius * 0.4;
    // Speed upgrade: extra base scroll speed added in applyDifficulty via registry
    if (this.upgrades.speed > 0) {
      this.baseSpeed    += this.upgrades.speed * 60;
      this.scrollSpeed   = this.baseSpeed;
    }
  }

  // ─── Camera ───────────────────────────────────────────────────────────────

  private setupCameras(): void {
    // Objects with depth ≥ 9 are HUD — split them onto a fixed UI camera so the
    // main-camera zoom only affects the game world, not the score/level/title.
    const allObjects = this.children.list as Phaser.GameObjects.GameObject[];
    const hud   = allObjects.filter(o => ((o as { depth?: number }).depth ?? 0) >= 9);
    const world = allObjects.filter(o => ((o as { depth?: number }).depth ?? 0) <  9);

    this.uiCamera = this.cameras.add(0, 0, 960, 540, false, 'ui');
    this.uiCamera.transparent = true;  // render HUD on top — don't clear the canvas first
    this.uiCamera.ignore(world);       // UI cam never sees game-world objects
    this.cameras.main.ignore(hud);     // Main cam never sees HUD objects

    this.cameras.main.setZoom(1.0);
  }

  // The camera sits at zoom=1, zooms out in tryJump() so the jump stays in view,
  // and zooms back to 1 on landing in checkGrounded().

  // ─── Setup ────────────────────────────────────────────────────────────────

  private createClouds(): void {
    const speedFactors = [0.3, 0.5, 0.7];
    const yRanges: [number, number][] = [[-120, 60], [40, 160], [100, 240]];
    this.cloudLayers = speedFactors.map((factor, i) => {
      const sprites: Phaser.GameObjects.Image[] = [];
      for (let c = 0; c < 8; c++) {
        const x = (4000 / 8) * c + Phaser.Math.Between(0, 400);
        const y = Phaser.Math.Between(yRanges[i][0], yRanges[i][1]);
        sprites.push(
          this.add.image(x, y, 'cloud').setScale(0.6 + i * 0.2).setAlpha(0.8 - i * 0.15)
        );
      }
      return { sprites, speed: this.scrollSpeed * factor };
    });
  }

  private createGround(): void {
    this.groundGroup = this.physics.add.staticGroup();
    this.groundTiles = [];
    const tilesNeeded = Math.ceil(960 / this.TILE_W) + 2;
    for (let i = 0; i < tilesNeeded; i++) {
      const tile = this.groundGroup.create(
        i * this.TILE_W + this.TILE_W / 2,
        this.GROUND_Y + this.GROUND_H / 2,
        'ground'
      ) as Phaser.Physics.Arcade.Image;
      this.groundTiles.push(tile);
    }
  }

  private createUnicorn(): void {
    if (!this.anims.exists('unicorn-run')) {
      this.anims.create({
        key: 'unicorn-run',
        frames: this.anims.generateFrameNumbers('unicorn', { start: 0, end: 5 }),
        frameRate: 10,
        repeat: -1,
      });
    }
    this.unicorn = this.physics.add.sprite(160, this.GROUND_Y + 18, 'unicorn');
    this.unicorn.setOrigin(0.5, 1);
    this.unicorn.setGravityY(0);
    this.unicorn.setScale(3);
    this.unicorn.setCollideWorldBounds(true);
    (this.unicorn.body as Phaser.Physics.Arcade.Body).setOffset(0, -6);
    this.unicorn.setDepth(4);
    this.unicorn.play('unicorn-run');

    // Lily depth 6 > unicorn depth 4 — she renders in front.
    // y-offset 80 places her legs at the saddle level (≈45 % down the unicorn body);
    // x-offset 10 sits her slightly back of centre for a natural riding position.
    this.lily = this.add.image(this.unicorn.x + 5, this.unicorn.y - 84, 'lily');
    this.lily.setOrigin(0.5, 1);
    this.lily.setScale(2.55);
    this.lily.setDepth(6);

    this.physics.add.collider(this.unicorn, this.groundGroup, () => {
      this.isGrounded = true;
    });
  }

  private createPoopGroup(): void {
    this.poopGroup = this.physics.add.group();
  }

  private createInput(): void {
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    const pKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.P);
    const escKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    pKey.on('down', () => this.togglePause());
    escKey.on('down', () => this.togglePause());

    // Touch: every tap fires jump/poop regardless of screen half. Charging is keyboard-only.
    this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
      if (ptr.x < 50 && ptr.y < 50) return;
      if (this.isPaused) return;
      if (this.isGameOver) { this.restartGame(); return; }
      this.handleJumpOrPoop();
    });
  }

  private createUI(): void {
    const txt = (x: number, y: number, t: string, size: string, ox: number, oy: number) =>
      this.add.text(x, y, t, {
        fontSize: size, fontFamily: 'Bubblegum Sans, cursive',
        color: nextColor(), stroke: '#000000', strokeThickness: 4,
      }).setOrigin(ox, oy).setDepth(10).setScrollFactor(0);

    // Score — top right
    this.scoreText = txt(940, 14, 'Score: 0', '22px', 1, 0);

    // Level — directly under score, same right-alignment
    this.levelText = txt(940, 40, `Level ${this.currentLevel}`, '18px', 1, 0);

    // Gold upgrade button with rounded pill background
    const upgBg = this.add.graphics().setDepth(10).setScrollFactor(0);
    upgBg.fillStyle(0x33200a, 1);
    upgBg.fillRoundedRect(14, 63, 138, 28, 10);
    this.upgradeBtn = this.add.text(83, 77, '⚡ UPGRADE', {
      fontSize: '15px',
      fontFamily: 'Bubblegum Sans, cursive',
      color: '#ffd700',
      stroke: '#7a4800',
      strokeThickness: 3,
    }).setOrigin(0.5, 0.5).setDepth(11).setScrollFactor(0)
      .setInteractive({ useHandCursor: true })
      .setAlpha(0.4);
    this.upgradeBtn.on('pointerdown', () => {
      if (this.upgradePoints > 0 && !this.isGameOver) this.showUpgradeMenu();
    });
    this.upgradeBtn.on('pointerover', () => { if (this.upgradePoints > 0) this.upgradeBtn.setAlpha(0.85); });
    this.upgradeBtn.on('pointerout',  () => this.upgradeBtn.setAlpha(this.upgradePoints > 0 ? 1 : 0.4));
    this.refreshUpgradeButton();

    // Game over overlay
    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.55);
    overlay.fillRect(0, 0, 960, 540);
    overlay.fillStyle(0x110022, 0.92);
    overlay.fillRoundedRect(240, 160, 480, 260, 28);
    const goText = this.add.text(480, 200, 'GAME OVER', {
      fontSize: '64px', fontFamily: 'Lilita One, cursive',
      color: nextColor(), stroke: '#000000', strokeThickness: 6,
    }).setOrigin(0.5);
    const finalTxt = this.add.text(480, 285, '', {
      fontSize: '26px', fontFamily: 'Bubblegum Sans, cursive',
      color: nextColor(), stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setName('finalScore');
    const levelTxt = this.add.text(480, 325, '', {
      fontSize: '20px', fontFamily: 'Bubblegum Sans, cursive',
      color: nextColor(), stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setName('finalLevel');
    const restartTxt = this.add.text(480, 380, 'Tap or press SPACE to continue', {
      fontSize: '20px', fontFamily: 'Bubblegum Sans, cursive',
      color: nextColor(), stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5);

    this.gameOverContainer = this.add.container(0, 0, [overlay, goText, finalTxt, levelTxt, restartTxt]);
    this.gameOverContainer.setDepth(20).setVisible(false).setScrollFactor(0);

    this.createTitleBar();
    this.createPauseButton();
    this.createPauseOverlay();
  }

  private createTitleBar(): void {
    this.add.rectangle(480, 20, 960, 40, 0x000000, 0.35).setDepth(9).setScrollFactor(0);
    const hy = 20;
    const hg = this.add.graphics().setDepth(11).setScrollFactor(0);
    const hx = 24;
    hg.fillStyle(0xff69b4, 1); hg.fillCircle(hx - 5, hy - 2, 6);
    hg.fillStyle(0x9966ff, 1); hg.fillCircle(hx - 6, hy + 3, 5);
    hg.fillStyle(0x00ccff, 1); hg.fillCircle(hx - 4, hy + 8, 4);
    hg.fillStyle(0xfffff5, 1); hg.fillEllipse(hx + 4, hy + 2, 18, 16);
    hg.fillStyle(0xff69b4, 1); hg.fillTriangle(hx, hy - 4, hx + 5, hy - 4, hx + 2, hy - 13);
    hg.fillStyle(0xffdd00, 1); hg.fillTriangle(hx, hy - 4, hx + 5, hy - 4, hx + 2, hy - 10);
    hg.fillStyle(0x3a1a6a, 1); hg.fillCircle(hx + 6, hy, 2.5);
    hg.fillStyle(0xffffff, 1); hg.fillCircle(hx + 6.5, hy - 0.5, 1);
    hg.fillStyle(0xff88aa, 0.4); hg.fillCircle(hx + 6, hy + 4, 3.5);

    const defs = [
      { t: "Lily's",  c: nextColor() },
      { t: 'Magical', c: nextColor() },
      { t: 'Pooping', c: nextColor() },
      { t: 'Unicorn', c: nextColor() },
    ];
    const gap = 6;
    const textObjs = defs.map(d =>
      this.add.text(-1000, hy, d.t, {
        fontSize: '20px', fontFamily: 'Lilita One, cursive',
        color: d.c, stroke: '#000000', strokeThickness: 3,
      }).setOrigin(0, 0.5).setDepth(11).setScrollFactor(0)
    );
    const reposition = () => {
      const totalW = textObjs.reduce((s, t) => s + t.width, 0) + gap * (defs.length - 1);
      let x = (960 - totalW) / 2;
      textObjs.forEach(t => { t.setX(x); x += t.width + gap; });
    };
    reposition();
    this.time.delayedCall(150, reposition);
  }

  private createPauseButton(): void {
    const btn = this.add.text(20, 16, '⏸', {
      fontSize: '22px', fontFamily: 'Bubblegum Sans, cursive',
      color: '#ffffff', stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0, 0).setDepth(10).setScrollFactor(0).setInteractive({ useHandCursor: true });
    btn.on('pointerdown', () => this.togglePause());
    btn.on('pointerover', () => btn.setAlpha(0.6));
    btn.on('pointerout',  () => btn.setAlpha(1));
  }

  private createPauseOverlay(): void {
    // Full-screen dimmer + rounded card
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.55);
    bg.fillRect(0, 0, 960, 540);
    bg.fillStyle(0x000033, 0.9);
    bg.fillRoundedRect(280, 190, 400, 160, 24);
    const pausedText = this.add.text(480, 230, 'PAUSED', {
      fontSize: '64px', fontFamily: 'Bubblegum Sans, cursive',
      color: nextColor(), stroke: '#000000', strokeThickness: 6,
    }).setOrigin(0.5);
    const resumeText = this.add.text(480, 315, 'Tap ⏸  or press P / ESC to resume', {
      fontSize: '20px', fontFamily: 'Bubblegum Sans, cursive',
      color: nextColor(), stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5);
    this.pauseOverlay = this.add.container(0, 0, [bg, pausedText, resumeText]);
    this.pauseOverlay.setDepth(15).setVisible(false).setScrollFactor(0);
  }

  private togglePause(): void {
    if (this.isGameOver) return;
    if (this.isPaused) {
      this.pauseOverlay.setVisible(false);
      this.resumeWithCountdown();
    } else {
      this.isPaused = true;
      this.pauseOverlay.setVisible(true);
      this.physics.pause();
      this.tweens.pauseAll();
      this.time.paused = true;
      this.unicorn.anims.pause();
    }
  }

  private resumeWithCountdown(): void {
    let n = 3;
    const cntTxt = this.add.text(480, 270, '3', {
      fontSize: '96px', fontFamily: 'Lilita One, cursive',
      color: '#ffdd00', stroke: '#000000', strokeThickness: 8,
    }).setOrigin(0.5).setDepth(50).setScrollFactor(0);
    this.cameras.main.ignore(cntTxt);

    const tick = () => {
      if (!this.sys?.isActive()) return;
      n--;
      if (n > 0) {
        cntTxt.setText(String(n));
        window.setTimeout(tick, 1000);
      } else {
        cntTxt.setText('GO!');
        this.physics.resume();
        this.tweens.resumeAll();
        this.time.paused = false;
        this.unicorn.anims.resume();
        this.isPaused = false;
        this.upgradeMenuOpen = false;
        window.setTimeout(() => { if (cntTxt?.active) cntTxt.destroy(); }, 500);
      }
    };
    window.setTimeout(tick, 1000);
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  update(_time: number, delta: number): void {
    if (this.isGameOver || this.isPaused) return;
    const dt = delta / 1000;
    this.updateTimers(dt);
    this.scrollWorld(dt);
    this.handleInput();
    this.checkAutoPoopFire();
    this.recycleGround();
    this.updateObstacles();
    this.cleanupPoops();
    this.scrollLandedPoops(dt);
    this.updateCloudLayers(dt);
    this.checkGrounded();
    // Pin the bottom of the ground to the bottom of the view. Phaser zooms around
    // the camera's centre, so the visible bottom edge is scrollY + 270 + 270/zoom.
    const zoom = this.cameras.main.zoom;
    this.cameras.main.setScroll(this.cameras.main.scrollX, (this.GROUND_Y + this.GROUND_H) - 270 - 270 / zoom);
    // Keep Lily glued to the unicorn's back (saddle ≈ 129 px above unicorn feet at 3× scale)
    this.lily.setPosition(this.unicorn.x + 5, this.unicorn.y - 84);
  }

  private updateTimers(dt: number): void {
    this.scoreTimer += dt;
    if (this.scoreTimer >= 1) {
      this.scoreTimer -= 1;
      this.addScore(1);
    }

    this.elapsedTime += dt;
    const t = this.elapsedTime;
    this.scrollSpeed = Math.min(
      this.baseSpeed + this.baseAccel * t + 0.5 * this.accelGrowth * t * t,
      this.maxSpeed,
    );
    const factors = [0.3, 0.5, 0.7];
    this.cloudLayers.forEach((layer, i) => { layer.speed = this.scrollSpeed * factors[i]; });

    if (this.poopCooldown > 0) this.poopCooldown -= dt;
  }

  private scrollWorld(dt: number): void {
    const dx = this.scrollSpeed * dt;
    this.groundTiles.forEach(tile => {
      tile.x -= dx;
      (tile.body as Phaser.Physics.Arcade.StaticBody).reset(tile.x, tile.y);
    });
  }

  private recycleGround(): void {
    for (const tile of this.groundTiles) {
      if (tile.x < -this.TILE_W) {
        const rightEdge = Math.max(...this.groundTiles.map(t => t.x));
        tile.x = rightEdge + this.TILE_W;
        (tile.body as Phaser.Physics.Arcade.StaticBody).reset(tile.x, tile.y);
      }
    }
  }

  private updateCloudLayers(dt: number): void {
    const viewRight = 960 / this.cameras.main.zoom;
    this.cloudLayers.forEach(layer => {
      layer.sprites.forEach(cloud => {
        cloud.x -= layer.speed * dt;
        if (cloud.x < -200) {
          cloud.x = viewRight + Phaser.Math.Between(0, 400);
          cloud.y = Phaser.Math.Between(-120, 240);
        }
      });
    });
  }

  private handleInput(): void {
    const jumpPressed =
      Phaser.Input.Keyboard.JustDown(this.spaceKey) ||
      Phaser.Input.Keyboard.JustDown(this.cursors.up!);
    if (jumpPressed) this.handleJumpOrPoop();

    if (this.cursors.down!.isDown && !this.isChargingPoop && this.poopCooldown <= 0) {
      this.isChargingPoop = true;
      this.chargeStartTime = this.time.now;
    }
    if (!this.cursors.down!.isDown && this.isChargingPoop) {
      this.fireChargedPoop();
    }
  }

  private handleJumpOrPoop(): void {
    if (this.isGrounded) {
      this.tryJump();
    } else if (this.poopCooldown <= 0) {
      this.spawnJumpPoop();
      this.poopCooldown = this.basePoopCooldown;
    }
  }

  private tryJump(): void {
    try {
      console.log('[Jump] started — velocity:', this.jumpVelocity, 'grounded:', this.isGrounded);
      this.unicorn.setVelocityY(this.jumpVelocity);
      this.isGrounded = false;
      this.jumpInitialVelocity = this.jumpVelocity;
      this.jumpPoopFired = false;
      this.isJumping = true;
      const jumpHeight = (this.jumpVelocity * this.jumpVelocity) / (2 * 800);
      const maxApexY = this.unicorn.y - jumpHeight;
      // Use 2× jump height as sky margin so requiredZoom is always < 1 (genuine
      // zoom-out), scaling naturally with jump upgrades. The viewport-top gate was
      // removed because it never fired for normal jump heights (apex stays in view).
      const visibleWorldHeight = (this.GROUND_Y + this.GROUND_H) - (maxApexY - jumpHeight * 2);
      const requiredZoom = Math.max(540 / visibleWorldHeight, 0.35);
      if (requiredZoom < this.currentZoom - 0.01) {
        this.currentZoom = requiredZoom;
        this.tweens.killTweensOf(this.cameras.main);
        this.tweens.add({ targets: this.cameras.main, zoom: requiredZoom, duration: 400, ease: 'Sine.easeOut' });
      }
    } catch (e) {
      console.error('[Jump] tryJump error:', e);
    }
  }

  // Fire poop when upward velocity drops to 25% of initial jump velocity
  private checkAutoPoopFire(): void {
    try {
      if (!this.isJumping || this.jumpPoopFired || this.isGrounded) return;
      const body = this.unicorn.body as Phaser.Physics.Arcade.Body;
      const threshold = this.jumpInitialVelocity * 0.25;
      if (body.velocity.y >= threshold) {
        console.log('[Jump] apex reached — poop fired, vy:', body.velocity.y.toFixed(1));
        this.spawnJumpPoop();
        this.jumpPoopFired = true;
      }
    } catch (e) {
      console.error('[Jump] checkAutoPoopFire error:', e);
    }
  }

  private spawnJumpPoop(): void {
    try {
      if (this.isGameOver) return;
      console.log('[Jump] spawning poop');
      const poop = this.poopGroup.create(
        this.unicorn.x - 75,
        this.unicorn.y - 100,
        'poop'
      ) as Phaser.Physics.Arcade.Image;
      poop.setScale(0.75);
      (poop.body as Phaser.Physics.Arcade.Body).setSize(96, 96);
      poop.setVelocity(this.poopFwdSpeed, 120);
      poop.setDepth(5);
      this.uiCamera?.ignore(poop);
      this.addPoopAnimations(poop, 0.75);
      this.addRainbowTrail(poop);
      this.registerPoopColliders(poop);
      console.log('[Jump] poop spawned OK');
    } catch (e) {
      console.error('[Jump] spawnJumpPoop error:', e);
    }
  }

  private fireChargedPoop(): void {
    this.isChargingPoop = false;
    if (this.poopCooldown > 0) return;
    this.poopCooldown = this.basePoopCooldown * 4;

    const charge = Math.min((this.time.now - this.chargeStartTime) / 600, 1);
    const speed = 350 + charge * 200;

    const poop = this.poopGroup.create(
      this.unicorn.x - 75,
      this.unicorn.y - 80,
      'poop'
    ) as Phaser.Physics.Arcade.Image;
    // Charged poop is 2× regular 3× size
    poop.setScale(1.5);
    (poop.body as Phaser.Physics.Arcade.Body).setSize(192, 192);
    poop.setVelocity(speed * 0.75, 80);
    poop.setDepth(5);
    (poop as Phaser.Physics.Arcade.Image & { isCharged: boolean }).isCharged = true;
    this.uiCamera?.ignore(poop);
    this.addPoopAnimations(poop, 1.5);
    this.addPoopTrail(poop);
    this.registerPoopColliders(poop);
  }

  private registerPoopColliders(poop: Phaser.Physics.Arcade.Image): void {
    this.physics.add.collider(poop, this.groundGroup, () => {
      if (!poop.active || this.landedPoops.has(poop)) return;
      this.tweens.killTweensOf(poop);
      const typed = poop as Phaser.Physics.Arcade.Image & { trailEmitter?: Phaser.GameObjects.Particles.ParticleEmitter };
      if (typed.trailEmitter) {
        typed.trailEmitter.stop();
        this.time.delayedCall(400, () => typed.trailEmitter?.destroy());
      }
      poop.setAngle(0);
      this.physics.world.disable(poop);
      // Keep origin (0.5, 0.5) — poop.png fills its canvas so body bottom = visual bottom
      this.landedPoops.add(poop);
    });

    this.obstacles.forEach(obs => {
      this.physics.add.overlap(poop, obs.sprite, () => { this.hitObstacle(poop, obs); });
    });
  }

  private addPoopAnimations(poop: Phaser.Physics.Arcade.Image, baseScale: number): void {
    this.tweens.add({ targets: poop, angle: '+=360', duration: 800, repeat: -1 });
    this.tweens.add({
      targets: poop,
      scale: { from: baseScale * 0.88, to: baseScale * 1.12 },
      duration: 350, yoyo: true, repeat: -1,
    });
  }

  private addRainbowTrail(poop: Phaser.Physics.Arcade.Image): void {
    const colours = [0xff0000, 0xff6600, 0xffff00, 0x00ff88, 0x00aaff, 0xaa00ff, 0xff00cc, 0xffffff];
    // Start at poop position so the first-frame burst doesn't appear at (0,0) = top-left
    const emitter = this.add.particles(poop.x, poop.y, 'sparkle', {
      follow: poop, lifespan: 500, speed: { min: 30, max: 100 },
      scale: { start: 1.2, end: 0 }, alpha: { start: 1, end: 0 },
      tint: colours, quantity: 5, frequency: 20,
      blendMode: Phaser.BlendModes.ADD, angle: { min: 0, max: 360 },
    });
    this.uiCamera?.ignore(emitter);
    (poop as Phaser.Physics.Arcade.Image & { trailEmitter: Phaser.GameObjects.Particles.ParticleEmitter }).trailEmitter = emitter;
  }

  private addPoopTrail(poop: Phaser.Physics.Arcade.Image): void {
    const colours = [0xff0000, 0xff8800, 0xffff00, 0x00cc00, 0x0066ff, 0x6600cc, 0xcc00cc];
    const emitter = this.add.particles(poop.x, poop.y, 'poop', {
      follow: poop, lifespan: 400, speed: { min: 10, max: 40 },
      scale: { start: 0.6, end: 0 }, alpha: { start: 0.8, end: 0 },
      tint: colours, quantity: 2, frequency: 30,
      blendMode: Phaser.BlendModes.ADD,
    });
    this.uiCamera?.ignore(emitter);
    (poop as Phaser.Physics.Arcade.Image & { trailEmitter: Phaser.GameObjects.Particles.ParticleEmitter }).trailEmitter = emitter;
  }

  private checkGrounded(): void {
    const body = this.unicorn.body as Phaser.Physics.Arcade.Body;
    if (body.blocked.down && body.velocity.y >= 0) {
      if (this.isJumping) {
        console.log('[Jump] landing');
        // Zoom back in after the jump's zoom-out
        if (this.currentZoom < 1) {
          this.currentZoom = 1;
          this.tweens.killTweensOf(this.cameras.main);
          this.tweens.add({ targets: this.cameras.main, zoom: 1, duration: 400, ease: 'Sine.easeInOut' });
        }
      }
      this.isGrounded = true;
      this.isJumping = false;
      this.jumpPoopFired = false;
    } else if (!body.blocked.down) {
      this.isGrounded = false;
    }
  }

  private cleanupPoops(): void {
    (this.poopGroup.getChildren() as Phaser.Physics.Arcade.Image[]).forEach(p => {
      if (p.x > 1100 || p.y > 600 || p.x < -50) {
        this.landedPoops.delete(p);
        this.destroyPoop(p);
      }
    });
  }

  private scrollLandedPoops(dt: number): void {
    this.landedPoops.forEach(p => {
      if (!p.active) { this.landedPoops.delete(p); return; }
      p.x -= this.scrollSpeed * dt;
    });
  }

  private destroyPoop(poop: Phaser.Physics.Arcade.Image): void {
    this.tweens.killTweensOf(poop);
    const typed = poop as Phaser.Physics.Arcade.Image & { trailEmitter?: Phaser.GameObjects.Particles.ParticleEmitter };
    if (typed.trailEmitter) {
      typed.trailEmitter.stop();
      this.time.delayedCall(500, () => typed.trailEmitter?.destroy());
    }
    poop.destroy();
  }

  // ─── Scoring / Levelling ──────────────────────────────────────────────────

  private addScore(points: number): void {
    this.score += points;
    this.scoreText.setText(`Score: ${this.score}`);
    this.checkLevelUp();
  }

  private checkLevelUp(): void {
    const runningTotal = this.totalScoreAtRunStart + this.score;
    const newLevel = Math.floor(runningTotal / 100) + 1;
    if (newLevel > this.currentLevel) {
      this.currentLevel = newLevel;
      this.levelText.setText(`Level ${this.currentLevel}`);
      this.showLevelUpFlash();
      // Award one upgrade point every 5 levels
      if (this.currentLevel % 5 === 0) {
        this.upgradePoints++;
        this.refreshUpgradeButton();
      }
    }
  }

  private refreshUpgradeButton(): void {
    if (!this.upgradeBtn) return;
    const pts = this.upgradePoints;
    this.upgradeBtn.setText(`⚡ UPGRADE${pts > 0 ? ` (${pts})` : ''}`);
    this.upgradeBtn.setAlpha(pts > 0 ? 1 : 0.4);
    if (pts > 0) {
      this.tweens.killTweensOf(this.upgradeBtn);
      this.tweens.add({
        targets: this.upgradeBtn,
        scaleX: { from: 1, to: 1.12 }, scaleY: { from: 1, to: 1.12 },
        duration: 400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
    } else {
      this.tweens.killTweensOf(this.upgradeBtn);
      this.upgradeBtn.setScale(1);
    }
  }

  private showLevelUpFlash(): void {
    const col = LILY_PALETTE[this.currentLevel % LILY_PALETTE.length];
    const txt = this.add.text(480, 270, 'LEVEL UP!', {
      fontSize: '72px',
      fontFamily: 'Lilita One, cursive',
      color: col,
      stroke: '#000000',
      strokeThickness: 8,
    }).setOrigin(0.5).setDepth(25).setScrollFactor(0).setScale(0);
    // Created after setupCameras() — must explicitly exclude from main (world) camera
    this.cameras.main.ignore(txt);

    this.tweens.add({
      targets: txt,
      scale: { from: 0, to: 1.2 },
      duration: 300,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: txt,
          alpha: { from: 1, to: 0 },
          delay: 700,
          duration: 400,
          onComplete: () => txt.destroy(),
        });
      },
    });
  }

  // ─── Obstacles ────────────────────────────────────────────────────────────

  private scheduleNextObstacle(): void {
    const delay = Phaser.Math.Between(this.spawnMin, this.spawnMax);
    this.nextObstacleTime = this.time.now + delay;
  }

  private updateObstacles(): void {
    if (this.time.now >= this.nextObstacleTime) {
      this.spawnObstacle();
      this.scheduleNextObstacle();
    }
    const dt = this.game.loop.delta / 1000;
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obs = this.obstacles[i];
      if (!obs.sprite.active) { this.obstacles.splice(i, 1); continue; }
      obs.sprite.x -= this.scrollSpeed * dt;
      (obs.sprite.body as Phaser.Physics.Arcade.Body).reset(obs.sprite.x, obs.sprite.y);
      if (obs.sprite.x < -200) {
        obs.sprite.destroy();
        this.obstacles.splice(i, 1);
      }
    }
  }

  private spawnObstacle(): void {
    const roll = Math.random();
    let type: TreeType;
    if (roll < 0.60)      type = 'small';
    else if (roll < 0.90) type = 'medium';
    else                  type = 'big';

    // Trees at 2.25× original pixel size. Oval-style hit boxes:
    //   – narrower than canopy (graze-safe), centered horizontally
    //   – small/medium bH < 351 → jumpable; big bH ≥ 351 → cannot be jumped
    // SINK=25 accounts for the 2.25× scaled transparent bottom-padding so trunks sit on ground.
    const bigDisplayH = Phaser.Math.Between(270, 450);
    const configs: Record<TreeType, { key: string; dW: number; dH: number; bW: number; bH: number; points: number }> = {
      small:  { key: 'tree-small',  dW: 108, dH: 144,         bW: 65,  bH: 120, points: 10 },
      medium: { key: 'tree-medium', dW: 144, dH: 216,         bW: 86,  bH: 175, points: 20 },
      big:    { key: 'tree-big',    dW: 216, dH: bigDisplayH, bW: 130, bH: 360, points: 50 },
    };
    const cfg = configs[type];

    const SINK = 25;
    const obs = this.physics.add.image(1020, this.GROUND_Y + SINK, cfg.key) as Phaser.Physics.Arcade.Image;
    obs.setOrigin(0.5, 1);
    obs.setDisplaySize(cfg.dW, cfg.dH);
    obs.setImmovable(true);
    obs.setGravityY(-800);

    const body = obs.body as Phaser.Physics.Arcade.Body;
    body.setSize(cfg.bW, cfg.bH, false);
    // Centre body horizontally; align body.bottom to GROUND_Y.
    body.setOffset(
      (cfg.dW - cfg.bW) / 2,
      cfg.dH - cfg.bH - SINK,
    );

    this.uiCamera?.ignore(obs);
    const data: ObstacleData = { sprite: obs, type, points: cfg.points };
    this.obstacles.push(data);

    this.physics.add.collider(this.unicorn, obs, () => { this.triggerGameOver(); });

    const poops = this.poopGroup.getChildren() as Phaser.Physics.Arcade.Image[];
    poops.forEach(p => {
      this.physics.add.overlap(p, obs, () => { this.hitObstacle(p, data); });
    });
  }

  // ─── Hit / Explosion ──────────────────────────────────────────────────────

  private hitObstacle(poop: Phaser.Physics.Arcade.Image, obs: ObstacleData): void {
    if (!obs.sprite.active || !poop.active) return;

    const x = obs.sprite.x;
    const y = obs.sprite.y - obs.sprite.displayHeight * 0.5;
    const charged = (poop as Phaser.Physics.Arcade.Image & { isCharged?: boolean }).isCharged === true;

    this.obstacles = this.obstacles.filter(o => o !== obs);
    this.destroyPoop(poop);
    this.addScore(obs.points);

    obs.sprite.destroy(); // immediate — no fade delay
    this.spawnExplosion(x, y, charged);
    this.spawnRainbow(x, this.GROUND_Y);
  }

  private spawnExplosion(x: number, y: number, charged = false): void {
    const rainbow = [0xff00cc, 0xaa00ff, 0x00aaff, 0x00ee44, 0xffee00, 0xff6600, 0xff0000];
    const sludge  = [0x5c3a1e, 0x3a6b2a, 0x8b6914, 0x2d5a1b, 0x7a4510];
    const allColors = [...rainbow, ...sludge];

    // Charged poops 2×; blast radius upgrade adds further multiplier
    const m = (charged ? 2 : 1) * this.explosionUpgradeMult;

    const burst = this.add.particles(x, y, 'sparkle', {
      lifespan: 800,
      speed: { min: 80 * m, max: 360 * m },
      scale: { start: 2.0 * m, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: allColors,
      gravityY: 300,
      blendMode: Phaser.BlendModes.ADD,
      angle: { min: 0, max: 360 },
      maxParticles: 55 * m,
    });
    burst.explode(55 * m, x, y);
    this.uiCamera?.ignore(burst);
    this.time.delayedCall(1000, () => { if (burst.active) burst.destroy(); });

    const glitter = this.add.particles(x, y, 'sparkle', {
      lifespan: 350,
      speed: { min: 50 * m, max: 220 * m },
      scale: { start: 0.6 * m, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: 0xffffff,
      gravityY: 80,
      blendMode: Phaser.BlendModes.ADD,
      angle: { min: 0, max: 360 },
      maxParticles: 28 * m,
    });
    glitter.explode(28 * m, x, y);
    this.uiCamera?.ignore(glitter);
    this.time.delayedCall(500, () => { if (glitter.active) glitter.destroy(); });

    // Poop confetti — rainbow poop chunks arcing outward
    const confetti = this.add.particles(x, y, 'poop', {
      lifespan: 900,
      speed: { min: 60 * m, max: 240 * m },
      scale: { start: 0.35 * m, end: 0.05 },
      alpha: { start: 1, end: 0 },
      tint: rainbow,
      gravityY: 420,
      angle: { min: -40, max: 220 },
      maxParticles: 18 * m,
    });
    confetti.explode(18 * m, x, y);
    this.uiCamera?.ignore(confetti);
    this.time.delayedCall(1100, () => { if (confetti.active) confetti.destroy(); });
  }

  private spawnRainbow(x: number, groundY: number): void {
    const rainbowColors = [0xcc00ee, 0x4422cc, 0x0088ff, 0x00cc00, 0xffee00, 0xff8800, 0xff0000];
    const outerR = 130;
    const lineW  = 7;

    // Arc graphics centred at (x, groundY) — upper semicircle arches upward
    const g = this.add.graphics();
    g.setDepth(3.5).setPosition(x, groundY).setScale(0);
    this.uiCamera?.ignore(g);
    rainbowColors.forEach((color, i) => {
      const r = outerR - i * lineW;
      g.lineStyle(lineW + 1, color, 0.92);
      g.beginPath();
      g.arc(0, 0, r, Math.PI, 0, true); // upper semicircle (left → top → right)
      g.strokePath();
    });

    // Cloud at the apex of the arc
    const cloudG = this.add.graphics();
    cloudG.setDepth(4).setPosition(x, groundY - outerR).setAlpha(0).setScale(0);
    this.uiCamera?.ignore(cloudG);
    cloudG.fillStyle(0xffffff, 0.92);
    cloudG.fillEllipse(0, 0, 80, 40);
    cloudG.fillEllipse(-24, -14, 50, 34);
    cloudG.fillEllipse(26, -12, 56, 30);
    cloudG.fillEllipse(0, -20, 48, 34);

    // Phase 1: arc pops in from ground
    this.tweens.add({
      targets: g, scale: 1, duration: 350, ease: 'Back.easeOut',
      onComplete: () => {
        // Phase 2: cloud forms at apex
        this.tweens.add({
          targets: cloudG, alpha: 1, scale: 1,
          duration: 320, ease: 'Back.easeOut',
        });
        // Phase 3: arc rises toward cloud and fades
        this.tweens.add({
          targets: g,
          y: groundY - outerR, // base of arc floats up to where apex started
          alpha: 0,
          delay: 380,
          duration: 750,
          ease: 'Sine.easeIn',
          onComplete: () => { if (g.active) g.destroy(); },
        });
        // Phase 4: cloud puffs out then fades
        this.tweens.add({
          targets: cloudG,
          scaleX: 1.6, scaleY: 0.6, alpha: 0,
          delay: 900,
          duration: 500,
          ease: 'Sine.easeIn',
          onComplete: () => { if (cloudG.active) cloudG.destroy(); },
        });
      },
    });
  }

  // ─── Upgrade Menu ─────────────────────────────────────────────────────────

  private showUpgradeMenu(): void {
    if (this.upgradeMenuOpen) return;
    this.upgradeMenuOpen = true;
    this.isPaused = true;  // gate update() so world scrolling stops
    this.physics.pause();
    this.tweens.pauseAll();
    this.time.paused = true;
    this.unicorn.anims.pause();

    const overlay = this.add.rectangle(480, 270, 960, 540, 0x000011, 0.88).setDepth(40).setScrollFactor(0);

    const title = this.add.text(480, 80, '⚡ CHOOSE AN UPGRADE ⚡', {
      fontSize: '30px', fontFamily: 'Lilita One, cursive',
      color: '#ffd700', stroke: '#7a4800', strokeThickness: 5,
    }).setOrigin(0.5).setDepth(41).setScrollFactor(0);

    type UpgradeKey = 'unicorn'|'jump'|'speed'|'fireRate'|'blastRadius';
    const defs: Array<{ key: UpgradeKey; emoji: string; name: string; desc: string; warn?: string; color: number }> = [
      { key: 'unicorn',    emoji: '🦄', name: 'Poop Speed',   desc: '+50 px/s poop velocity',              color: 0x9966ff },
      { key: 'jump',       emoji: '🦘', name: 'Jump Boost',   desc: '+40 px/s jump height',                color: 0x00aaff },
      { key: 'speed',      emoji: '⚡', name: 'Speed Rush',   desc: '+60 px/s world speed', warn: '⚠️ Harder!', color: 0xff6600 },
      { key: 'fireRate',   emoji: '💩', name: 'Rapid Fire',   desc: 'Poop cooldown −0.04s',                color: 0x44cc44 },
      { key: 'blastRadius',emoji: '💥', name: 'Blast Radius', desc: 'Explosion ×0.4 bigger',               color: 0xff3355 },
    ];

    const pillW = 158, pillH = 170, gap = 12;
    const totalW = defs.length * pillW + (defs.length - 1) * gap;
    const startX = (960 - totalW) / 2 + pillW / 2;
    const pillY = 310;

    const items: Phaser.GameObjects.GameObject[] = [overlay, title];

    defs.forEach((d, i) => {
      const cx = startX + i * (pillW + gap);
      const tier = this.upgrades[d.key];
      const maxed = tier >= this.MAX_UPGRADE;
      const baseAlpha = maxed ? 0.4 : 1;

      const pillG = this.add.graphics().setDepth(41).setAlpha(baseAlpha).setScrollFactor(0);
      pillG.fillStyle(d.color, 0.25);
      pillG.fillRoundedRect(cx - pillW / 2, pillY - pillH / 2, pillW, pillH, 16);
      pillG.lineStyle(3, d.color, 1);
      pillG.strokeRoundedRect(cx - pillW / 2, pillY - pillH / 2, pillW, pillH, 16);

      const emojiTxt = this.add.text(cx, pillY - 55, d.emoji,
        { fontSize: '32px' }).setOrigin(0.5).setDepth(42).setAlpha(baseAlpha).setScrollFactor(0);
      const nameTxt = this.add.text(cx, pillY - 15, d.name,
        { fontSize: '15px', fontFamily: 'Bubblegum Sans, cursive', color: '#ffffff', stroke: '#000', strokeThickness: 3 })
        .setOrigin(0.5).setDepth(42).setAlpha(baseAlpha).setScrollFactor(0);
      const descTxt = this.add.text(cx, pillY + 12, d.desc,
        { fontSize: '12px', fontFamily: 'Bubblegum Sans, cursive', color: '#cccccc' })
        .setOrigin(0.5).setDepth(42).setAlpha(baseAlpha).setScrollFactor(0);
      const tierTxt = this.add.text(cx, pillY + 34, `Tier ${tier}/${this.MAX_UPGRADE}`,
        { fontSize: '12px', fontFamily: 'Bubblegum Sans, cursive', color: '#ffdd88' })
        .setOrigin(0.5).setDepth(42).setAlpha(baseAlpha).setScrollFactor(0);

      if (d.warn) {
        const warnTxt = this.add.text(cx, pillY + 54, d.warn,
          { fontSize: '11px', fontFamily: 'Bubblegum Sans, cursive', color: '#ff8800' })
          .setOrigin(0.5).setDepth(42).setScrollFactor(0);
        items.push(warnTxt);
      }

      // Whole pill is the clickable hit area
      const hit = this.add.rectangle(cx, pillY, pillW - 2, pillH - 2, 0x000000, 0)
        .setDepth(43).setScrollFactor(0);
      if (!maxed) {
        hit.setInteractive({ useHandCursor: true });
        hit.on('pointerover', () => pillG.setAlpha(0.75));
        hit.on('pointerout',  () => pillG.setAlpha(baseAlpha));
        hit.on('pointerdown', () => {
          this.applyUpgrade(d.key);
          container.destroy();
          this.resumeWithCountdown();
        });

        // Button label inside pill for visual affordance
        const btnG = this.add.graphics().setDepth(42).setScrollFactor(0);
        btnG.fillStyle(d.color, 0.9);
        btnG.fillRoundedRect(cx - (pillW - 20) / 2, pillY + 58, pillW - 20, 28, 10);
        const btnTxt = this.add.text(cx, pillY + 72, 'UPGRADE',
          { fontSize: '13px', fontFamily: 'Bubblegum Sans, cursive', color: '#ffffff', stroke: '#000', strokeThickness: 2 })
          .setOrigin(0.5).setDepth(43).setScrollFactor(0);
        items.push(btnG, btnTxt);
      }

      items.push(hit, pillG, emojiTxt, nameTxt, descTxt, tierTxt);
    });

    const closeBtn = this.add.text(480, 470, 'CLOSE (no upgrade)',
      { fontSize: '16px', fontFamily: 'Bubblegum Sans, cursive', color: '#888888', stroke: '#000', strokeThickness: 2 })
      .setOrigin(0.5).setDepth(42).setScrollFactor(0).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => {
      container.destroy();
      this.resumeWithCountdown();
    });
    items.push(closeBtn);

    const container = this.add.container(0, 0, items).setScrollFactor(0).setDepth(40);
    // All items are HUD-layer objects created after setupCameras — exclude from the world camera
    this.cameras.main.ignore(items);
    this.cameras.main.ignore(container);
  }

  private applyUpgrade(key: 'unicorn'|'jump'|'speed'|'fireRate'|'blastRadius'): void {
    if (this.upgrades[key] >= this.MAX_UPGRADE) return;
    this.upgrades[key]++;
    this.upgradePoints--;
    this.applyAllUpgrades();
    this.refreshUpgradeButton();
    localStorage.setItem('unicorn_upgradePoints', String(this.upgradePoints));
    localStorage.setItem('unicorn_upgrades', JSON.stringify(this.upgrades));
  }

  // ─── Game Over / Restart ──────────────────────────────────────────────────

  private triggerGameOver(): void {
    if (this.isGameOver) return;
    this.isGameOver = true;

    this.unicorn.setVelocity(0, 0);
    this.unicorn.setGravityY(-800);

    this.saveProgress();

    const finalTxt = this.gameOverContainer.getByName('finalScore') as Phaser.GameObjects.Text;
    const levelTxt = this.gameOverContainer.getByName('finalLevel')  as Phaser.GameObjects.Text;
    finalTxt.setText(`Score: ${this.score}  •  Best: ${Math.max(this.bestScore, this.score)}`);
    levelTxt.setText(`Level ${this.currentLevel}`);
    this.gameOverContainer.setVisible(true);

    // Both SPACE and tap go to difficulty selection (LoginScene shows the picker immediately)
    this.input.keyboard!.once('keydown-SPACE', () => this.restartGame());
  }

  private restartGame(): void {
    this.scene.start('LoginScene');
  }
}
