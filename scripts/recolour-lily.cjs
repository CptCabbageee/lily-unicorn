// Needs: npm install --no-save pngjs@7.0.0 jpeg-js@0.4.4
// Recolours the Lily sprite: golden hair -> purple, navy/blue hat -> pink.
// Usage: node recolour-lily.cjs <in.png> <out.png> <preview.png>
const fs = require('fs');
const { PNG } = require('pngjs');
const [, , inPath, outPath, previewPath] = process.argv;
const png = PNG.sync.read(fs.readFileSync(inPath));
const { width: w, height: h, data } = png;

function rgb2hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let hue = 0;
  if (d) {
    if (max === r) hue = ((g - b) / d) % 6;
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue *= 60; if (hue < 0) hue += 360;
  }
  return [hue, max ? d / max : 0, max];
}
function hsv2rgb(hue, s, v) {
  const c = v * s, x = c * (1 - Math.abs(((hue / 60) % 2) - 1)), m = v - c;
  const [r, g, b] = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x]
    : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x];
  return [r + m, g + m, b + m].map(t => Math.round(Math.min(1, Math.max(0, t)) * 255));
}

let hair = 0, hat = 0;
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  const i = (y * w + x) * 4;
  if (data[i + 3] < 20) continue;
  const [hue, s, v] = rgb2hsv(data[i], data[i + 1], data[i + 2]);

  // Hat: blues/navies above the face (the flame feather sits above row 13,
  // the boots are below row 45, both stay as they are)
  const inHatRows = y >= 13 && y <= 25;
  const inEyes = x >= 13 && x <= 22 && y >= 24;  // her blue eyes stay blue
  if (inHatRows && !inEyes && hue >= 200 && hue <= 260 && s >= 0.3) {
    // Navy is very dark; lift it so it reads as pink, not maroon
    const nv = Math.min(1, 0.45 + v * 0.9);
    const ns = Math.min(1, 0.45 + s * 0.35);
    [data[i], data[i + 1], data[i + 2]] = hsv2rgb(330, ns, nv);
    hat++;
    continue;
  }

  // Hair: golds and oranges, but not the trousers (x 10-25 from row 42) or the
  // flame (above row 14), which use similar yellows
  const inTrousers = x >= 10 && x <= 25 && y >= 42;
  const inFlame = x <= 18 && y <= 18;  // the flame feather's orange base
  if (y >= 14 && !inTrousers && !inFlame && hue >= 28 && hue <= 50 && s >= 0.25) {
    // Gold -> purple, keeping each pixel's light/dark so the shading survives
    [data[i], data[i + 1], data[i + 2]] = hsv2rgb(280, Math.min(1, s * 0.85), Math.min(1, v * 0.95));
    hair++;
  }
}
fs.writeFileSync(outPath, PNG.sync.write(png));

// 8x nearest-neighbour preview, old and new side by side, for checking by eye
const S = 8;
const orig = PNG.sync.read(fs.readFileSync(inPath));
const prev = new PNG({ width: w * S * 2 + 16, height: h * S });
prev.data.fill(0);
for (let y = 0; y < prev.height; y++) for (let x = 0; x < prev.width; x++) {
  const o = (y * prev.width + x) * 4;
  prev.data[o] = 135; prev.data[o + 1] = 206; prev.data[o + 2] = 235; prev.data[o + 3] = 255;
}
[[orig.data, 0], [data, w * S + 16]].forEach(([src, ox]) => {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (src[i + 3] < 20) continue;
    for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) {
      const o = ((y * S + dy) * prev.width + ox + x * S + dx) * 4;
      prev.data[o] = src[i]; prev.data[o + 1] = src[i + 1]; prev.data[o + 2] = src[i + 2];
    }
  }
});
fs.writeFileSync(previewPath, PNG.sync.write(prev));
console.log(`hair pixels ${hair}, hat pixels ${hat}`);
