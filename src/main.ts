import Phaser from 'phaser';
import { LoginScene } from './scenes/LoginScene';
import { PreloadScene } from './scenes/PreloadScene';
import { GameScene } from './scenes/GameScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 960,
  height: 540,
  backgroundColor: '#87CEEB',
  pixelArt: true,
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 800 },
      debug: false,
    },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [LoginScene, PreloadScene, GameScene],
};

// Destroy any stale game left over from Vite HMR before creating a new one.
// Without this, each hot-reload appends a fresh Phaser canvas on top of the old one.
declare global { interface Window { __phaserGame?: Phaser.Game } }

if (window.__phaserGame) {
  window.__phaserGame.destroy(true);
  window.__phaserGame = undefined;
}

const game = new Phaser.Game(config);
window.__phaserGame = game;

// Tell Vite to destroy the game cleanly when this module is about to be replaced.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    game.destroy(true);
    window.__phaserGame = undefined;
  });
}
