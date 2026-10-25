// Needs: npm install --no-save pngjs@7.0.0 jpeg-js@0.4.4
// Recolours Lily in the start-screen painting: golden hair -> purple,
// navy hat -> pink. Only touches pixels inside boxes around her head so the
// rainbow, trousers, horn and sky keep their colours.
// Usage: node recolour-splash.cjs <in.jpg> <out.jpg> <preview.png>
// The splash-lily.jpg recolour (25 Oct 2026) used HAIR_BOX=[210,318,548,570] and
// HAIR_SKIP=[[430,500,560,640],[470,468,545,535],[230,200,320,320]] as env vars.
const fs = require('fs');
const jpeg = require('jpeg-js');
const { PNG } = require('pngjs');
const [, , inPath, outPath, previewPath] = process.argv;
const img = jpeg.decode(fs.readFileSync(inPath), { useTArray: true });
const { width: w, height: h, data } = img;

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
const clamp01 = t => Math.min(1, Math.max(0, t));
const inBox = (x, y, [x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

const HAT_BOX = JSON.parse(process.env.HAT_BOX || '[280,200,580,450]');
const HAIR_BOX = JSON.parse(process.env.HAIR_BOX || '[210,290,570,570]');
const HAIR_SKIP = JSON.parse(process.env.HAIR_SKIP || '[[430,500,560,640]]');
const FACE_BOX = JSON.parse(process.env.FACE_BOX || '[375,330,532,470]');

let hat = 0, hair = 0;
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
  const i = (y * w + x) * 4;
  const r = data[i], g = data[i + 1], b = data[i + 2];
  const [hue, s, v] = rgb2hsv(r, g, b);

  if (inBox(x, y, HAT_BOX) && hue >= 200 && hue <= 265 && s >= 0.25) {
    // Navy is dark; the sky behind it is the same hue but bright. Fade the
    // change out between v 0.55 and 0.75 so edge pixels blend, sky stays blue.
    const weight = clamp01((0.75 - v) / 0.2);
    if (weight > 0) {
      const [nr, ng, nb] = hsv2rgb(330, Math.min(1, 0.5 + s * 0.3), Math.min(1, 0.45 + v * 0.9));
      data[i] = Math.round(r + (nr - r) * weight);
      data[i + 1] = Math.round(g + (ng - g) * weight);
      data[i + 2] = Math.round(b + (nb - b) * weight);
      hat++;
      continue;
    }
  }

  // Hair is strongly coloured; her skin and blush are the same orange family but
  // much paler. Inside the face area only strong colours count (redder oranges
  // only when very strong); outside it, pale yellow highlights count too.
  const inFace = inBox(x, y, FACE_BOX);
  const minS = inFace ? 0.45 : 0.3;
  const hairHue = (hue >= 24 && hue <= (inFace ? 58 : 66)) || (hue >= 12 && hue < 24 && s >= 0.65);
  if (inBox(x, y, HAIR_BOX) && !HAIR_SKIP.some(bx => inBox(x, y, bx)) && hairHue && s >= minS) {
    // Fade in over 0.15 of saturation so pale edges blend in
    const weight = clamp01((s - minS) / 0.15);
    const [nr, ng, nb] = hsv2rgb(285, Math.min(1, s * 0.85), v * 0.9);
    data[i] = Math.round(r + (nr - r) * weight);
    data[i + 1] = Math.round(g + (ng - g) * weight);
    data[i + 2] = Math.round(b + (nb - b) * weight);
    hair++;
  }
}
fs.writeFileSync(outPath, jpeg.encode({ data, width: w, height: h }, 92).data);

// Preview: the area around Lily, at full size
const [px0, py0, px1, py1] = [180, 180, 760, 720];
const pv = new PNG({ width: px1 - px0, height: py1 - py0 });
for (let y = py0; y < py1; y++) for (let x = px0; x < px1; x++) {
  const i = (y * w + x) * 4, o = ((y - py0) * pv.width + (x - px0)) * 4;
  pv.data[o] = data[i]; pv.data[o + 1] = data[i + 1]; pv.data[o + 2] = data[i + 2]; pv.data[o + 3] = 255;
}
fs.writeFileSync(previewPath, PNG.sync.write(pv));
console.log(`${w}x${h}: hat pixels ${hat}, hair pixels ${hair}`);
