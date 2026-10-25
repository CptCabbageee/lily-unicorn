import Phaser from 'phaser';

// Poo styles the player can pick on the start screen. 'poop' is the original
// poop.png; the rest are drawn in code here. Every drawn texture matches
// poop.png's layout: 128 px square, centred, with the poo's visible bottom at
// y = 112 (48 px below centre), so landing and hit sizes work the same.

export interface PooStyle {
  key: string;
  name: string;
}

export const POO_STYLES: PooStyle[] = [
  { key: 'poop',          name: 'Classic' },
  { key: 'poop-rainbow',  name: 'Rainbow' },
  { key: 'poop-icecream', name: 'Ice Cream' },
  { key: 'poop-happy',    name: 'Happy' },
  { key: 'poop-gold',     name: 'Sparkle Gold' },
  { key: 'poop-heart',    name: 'Love Heart' },
];

const STORAGE_KEY = 'lily-unicorn.pooStyle';
const SIZE = 128;
const BOTTOM = 112;

export function loadPooStyle(): string {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && POO_STYLES.some(s => s.key === saved)) return saved;
  } catch { /* storage blocked — fall back to the default */ }
  return 'poop';
}

export function savePooStyle(key: string): void {
  try { window.localStorage.setItem(STORAGE_KEY, key); } catch { /* not remembered, still used this session */ }
}

export function makePooTextures(scene: Phaser.Scene): void {
  const draw = (key: string, paint: (g: Phaser.GameObjects.Graphics) => void) => {
    if (scene.textures.exists(key)) return;
    const g = scene.add.graphics();
    paint(g);
    g.generateTexture(key, SIZE, SIZE);
    g.destroy();
  };

  draw('poop-rainbow', g => {
    swirl(g, [0xff3b3b, 0xff9a1f, 0xffe23b], 0x7a1f1f);
    // Blue and purple tip curl
    tip(g, 0x3b8bff, 0x7a1f1f);
    g.fillStyle(0xb44bff, 1);
    g.fillCircle(64, 31, 6);
    sparkles(g, [[26, 50], [104, 62], [98, 30]], 0xffffff);
  });

  draw('poop-icecream', g => {
    swirl(g, [0xff8fc7, 0xffa8d4, 0xffc2e1], 0xc2457f);
    // Sprinkles
    const sprinkleColours = [0xff3b3b, 0x3bb8ff, 0xffe23b, 0x5ad65a, 0xffffff, 0xb44bff];
    const sprinkles: Array<[number, number, number]> = [
      [38, 92, 0.4], [58, 100, -0.5], [82, 94, 0.8], [96, 98, -0.2], [48, 76, -0.7],
      [70, 72, 0.3], [86, 78, -0.9], [56, 58, 0.6], [74, 56, -0.4], [30, 100, -1.0],
    ];
    sprinkles.forEach(([x, y, a], i) => {
      const dx = Math.cos(a) * 4, dy = Math.sin(a) * 4;
      g.lineStyle(4, sprinkleColours[i % sprinkleColours.length], 1);
      g.lineBetween(x - dx, y - dy, x + dx, y + dy);
    });
    // Cherry on top
    g.lineStyle(3, 0x3a7d2a, 1);
    g.lineBetween(66, 32, 74, 20);
    g.fillStyle(0xe0102f, 1);
    g.fillCircle(64, 36, 9);
    g.fillStyle(0xffffff, 0.8);
    g.fillCircle(61, 33, 3);
  });

  draw('poop-happy', g => {
    swirl(g, [0xa86bff, 0xb987ff, 0xcaa3ff], 0x5a2a9a);
    tip(g, 0xcaa3ff, 0x5a2a9a);
    // Big shiny eyes
    [50, 78].forEach(x => {
      g.fillStyle(0xffffff, 1);
      g.fillCircle(x, 76, 9);
      g.fillStyle(0x222222, 1);
      g.fillCircle(x + 1, 77, 6);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(x + 3, 74, 2.5);
    });
    // Rosy cheeks
    g.fillStyle(0xff7eb3, 0.85);
    g.fillEllipse(38, 92, 12, 7);
    g.fillEllipse(90, 92, 12, 7);
    // Smile
    g.lineStyle(3, 0x222222, 1);
    g.beginPath();
    g.arc(64, 90, 9, 0.15 * Math.PI, 0.85 * Math.PI, false);
    g.strokePath();
  });

  draw('poop-gold', g => {
    swirl(g, [0xf5b400, 0xffcc2e, 0xffdf6b], 0x9a6a00);
    // Star on top
    star(g, 64, 30, 13, 6, 0xfff4a8, 0x9a6a00);
    sparkles(g, [[30, 64], [100, 70], [44, 98], [88, 50], [106, 98]], 0xffffff);
  });

  draw('poop-heart', g => {
    // Heart: two lobes and a point, with its point on the bottom line
    const heart = (scale: number, colour: number) => {
      const cx = 64, top = BOTTOM - 84 * scale;
      g.fillStyle(colour, 1);
      g.fillCircle(cx - 21 * scale, top + 24 * scale, 25 * scale);
      g.fillCircle(cx + 21 * scale, top + 24 * scale, 25 * scale);
      g.fillTriangle(
        cx - 45 * scale, top + 32 * scale,
        cx + 45 * scale, top + 32 * scale,
        cx, BOTTOM,
      );
    };
    heart(1, 0xc2185b);
    heart(0.9, 0xff4f9a);
    // Shine
    g.fillStyle(0xffffff, 0.75);
    g.fillEllipse(44, 44, 14, 9);
    sparkles(g, [[100, 34], [24, 36]], 0xffffff);
  });
}

// Three stacked tiers, widest at the bottom, sitting on the bottom line
function swirl(g: Phaser.GameObjects.Graphics, colours: [number, number, number], outline: number): void {
  const tiers: Array<[number, number, number]> = [
    // centre y, width, height
    [BOTTOM - 16, 96, 32],
    [BOTTOM - 40, 76, 28],
    [BOTTOM - 61, 54, 24],
  ];
  tiers.forEach(([cy, w, h], i) => {
    g.fillStyle(outline, 1);
    g.fillEllipse(64, cy, w + 4, h + 4);
    g.fillStyle(colours[i], 1);
    g.fillEllipse(64, cy, w, h);
    // Soft highlight along the top of each tier
    g.fillStyle(0xffffff, 0.3);
    g.fillEllipse(56, cy - h / 4, w * 0.5, h * 0.3);
  });
}

// Little curl at the very top of a swirl
function tip(g: Phaser.GameObjects.Graphics, colour: number, outline: number): void {
  g.fillStyle(outline, 1);
  g.fillTriangle(50, 44, 80, 44, 68, 22);
  g.fillStyle(colour, 1);
  g.fillTriangle(53, 42, 77, 42, 67, 25);
}

function star(
  g: Phaser.GameObjects.Graphics, cx: number, cy: number,
  outer: number, inner: number, colour: number, outline: number,
): void {
  const points = (r1: number, r2: number) => {
    const pts: Phaser.Math.Vector2[] = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? r1 : r2;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      pts.push(new Phaser.Math.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
    }
    return pts;
  };
  g.fillStyle(outline, 1);
  g.fillPoints(points(outer + 3, inner + 2), true);
  g.fillStyle(colour, 1);
  g.fillPoints(points(outer, inner), true);
}

// Four-point twinkles
function sparkles(g: Phaser.GameObjects.Graphics, at: Array<[number, number]>, colour: number): void {
  g.fillStyle(colour, 0.95);
  at.forEach(([x, y]) => {
    g.fillTriangle(x - 2, y, x + 2, y, x, y - 8);
    g.fillTriangle(x - 2, y, x + 2, y, x, y + 8);
    g.fillTriangle(x, y - 2, x, y + 2, x - 8, y);
    g.fillTriangle(x, y - 2, x, y + 2, x + 8, y);
  });
}
