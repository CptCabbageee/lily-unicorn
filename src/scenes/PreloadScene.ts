import Phaser from 'phaser';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: 'PreloadScene' });
  }

  preload(): void {
    this.load.spritesheet('unicorn', 'assets/unicorn-run.png', { frameWidth: 62, frameHeight: 68 });
    this.load.image('poop',        'assets/poop.png');
    this.load.image('tree-small',  'assets/tree-small.png');
    this.load.image('tree-medium', 'assets/tree-medium.png');
    this.load.image('tree-big',    'assets/tree-big.png');
    this.load.image('lily',        'assets/lily.png');
  }

  create(): void {
    this.makeGround();
    this.makeCloud();
    this.makeSparkle();
    this.scene.start('GameScene');
  }

  private makeGround(): void {
    if (this.textures.exists('ground')) return;
    const rt = this.add.renderTexture(0, 0, 64, 32).setVisible(false);
    const g = this.add.graphics();
    g.fillStyle(0x228b22, 1); g.fillRect(0, 0, 64, 32);
    g.fillStyle(0x33aa33, 1); g.fillRect(0, 0, 64, 8);
    g.fillStyle(0x1a6b1a, 1); g.fillRect(0, 28, 64, 4);
    rt.draw(g);
    rt.saveTexture('ground');
    g.destroy(); rt.destroy();
  }

  private makeCloud(): void {
    if (this.textures.exists('cloud')) return;
    const rt = this.add.renderTexture(0, 0, 120, 60).setVisible(false);
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 0.85);
    g.fillEllipse(60, 40, 100, 40);
    g.fillEllipse(40, 32, 60, 44);
    g.fillEllipse(80, 28, 70, 48);
    g.fillEllipse(60, 20, 80, 44);
    rt.draw(g);
    rt.saveTexture('cloud');
    g.destroy(); rt.destroy();
  }

  private makeSparkle(): void {
    if (this.textures.exists('sparkle')) return;
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillCircle(4, 4, 4);
    g.generateTexture('sparkle', 8, 8);
    g.destroy();
  }
}
