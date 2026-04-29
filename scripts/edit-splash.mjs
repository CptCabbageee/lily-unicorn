// One-shot script: edit public/assets/splash.jpg via Stability AI and save result.
// Usage: node scripts/edit-splash.mjs
import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root      = path.join(__dirname, '..');

// ── Load .env ──────────────────────────────────────────────────────────────
const envLines = fs.readFileSync(path.join(root, '.env'), 'utf8').split('\n');
const env = Object.fromEntries(
  envLines
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()]; })
);
const API_KEY = env.VITE_STABILITY_API_KEY;
if (!API_KEY) throw new Error('VITE_STABILITY_API_KEY missing from .env');

// ── Load image ─────────────────────────────────────────────────────────────
const imgPath  = path.join(root, 'public', 'assets', 'splash.jpg');
const imgBuf   = fs.readFileSync(imgPath);
const imgBlob  = new Blob([imgBuf], { type: 'image/jpeg' });

// ── Build request ──────────────────────────────────────────────────────────
const PROMPT = [
  'change the boots to bright cobalt blue,',
  'make the trousers vivid bright yellow,',
  'make the rainbow poop trail much larger and more spectacular with more glitter and sparkle,',
  'have the rainbow ending in clouds near the bottom of the screen,',
  'ensure that clouds display beneath the title',
].join(' ');

const NEG = 'dark, ugly, distorted, blurry';

const form = new FormData();
form.append('init_image',              imgBlob, 'splash.jpg');
form.append('init_image_mode',         'IMAGE_STRENGTH');
form.append('image_strength',          '0.5');
form.append('text_prompts[0][text]',   PROMPT);
form.append('text_prompts[0][weight]', '1');
form.append('text_prompts[1][text]',   NEG);
form.append('text_prompts[1][weight]', '-1');
form.append('cfg_scale',               '7');
form.append('steps',                   '40');
form.append('samples',                 '1');

// ── Call API ───────────────────────────────────────────────────────────────
const ENGINE = 'stable-diffusion-xl-1024-v1-0';
const url    = `https://api.stability.ai/v1/generation/${ENGINE}/image-to-image`;

console.log('Calling Stability AI image-to-image…');
const res = await fetch(url, {
  method:  'POST',
  headers: { Accept: 'application/json', Authorization: `Bearer ${API_KEY}` },
  body:    form,
});

if (!res.ok) {
  const text = await res.text();
  throw new Error(`Stability AI ${res.status}: ${text}`);
}

const data     = await res.json();
const artifact = data.artifacts?.[0];
if (!artifact) throw new Error('No artifact returned');
if (artifact.finishReason !== 'SUCCESS')
  throw new Error(`Generation failed: ${artifact.finishReason}`);

// ── Save result ────────────────────────────────────────────────────────────
const outPath = path.join(root, 'public', 'assets', 'splash-edited.png');
fs.writeFileSync(outPath, Buffer.from(artifact.base64, 'base64'));
console.log(`✓ Saved ${outPath}`);
