// Refines splash-new.png via image-to-image: rainbow unicorn mane + fire helmet.
// Usage: node scripts/refine-splash.mjs
import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root      = path.join(__dirname, '..');

const env = Object.fromEntries(
  fs.readFileSync(path.join(root, '.env'), 'utf8').split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()]; })
);
const API_KEY = env.VITE_STABILITY_API_KEY;
if (!API_KEY) throw new Error('VITE_STABILITY_API_KEY missing');

const imgBuf  = fs.readFileSync(path.join(root, 'public', 'assets', 'splash-new.png'));
const imgBlob = new Blob([imgBuf], { type: 'image/png' });

const PROMPT = [
  'Cartoon girl Lily with long blonde hair riding a white unicorn.',
  'The unicorn has a long flowing mane with vivid clearly-visible rainbow colour stripes:',
  'red, orange, yellow, green, blue, purple — each stripe distinct and bright.',
  'The girl wears a blue helmet with tall bright orange and yellow fire flames',
  'shooting upward from the top of the helmet — the fire must be clearly visible.',
  'A large bold rainbow arc fills the background sky, curving from one side to the other',
  'and ending in big fluffy white clouds near the bottom of the image.',
  'Behind the unicorn a spectacular glittering sparkly rainbow poop trail.',
  'Bright sky-blue sky, cheerful cartoon game splash art, vivid saturated colours, landscape.',
].join(' ');

const NEGATIVE = [
  'plain white mane, grey mane, yellow mane, single-colour mane,',
  'no fire, no flames on helmet, helmet without fire,',
  'dark, blurry, distorted, deformed, text, watermark.',
].join(' ');

const form = new FormData();
form.append('init_image',              imgBlob, 'splash-new.png');
form.append('init_image_mode',         'IMAGE_STRENGTH');
form.append('image_strength',          '0.6');
form.append('text_prompts[0][text]',   PROMPT);
form.append('text_prompts[0][weight]', '1');
form.append('text_prompts[1][text]',   NEGATIVE);
form.append('text_prompts[1][weight]', '-1');
form.append('cfg_scale',               '9');
form.append('steps',                   '40');
form.append('samples',                 '1');

console.log('Refining splash (rainbow mane + fire helmet)…');
const res = await fetch(
  'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/image-to-image',
  {
    method:  'POST',
    headers: { Accept: 'application/json', Authorization: `Bearer ${API_KEY}` },
    body:    form,
  }
);

if (!res.ok) {
  const text = await res.text();
  throw new Error(`Stability AI ${res.status}: ${text}`);
}

const data     = await res.json();
const artifact = data.artifacts?.[0];
if (!artifact) throw new Error('No artifact returned');
if (artifact.finishReason !== 'SUCCESS')
  throw new Error(`Generation failed: ${artifact.finishReason}`);

const outPath = path.join(root, 'public', 'assets', 'splash-new.png');
fs.writeFileSync(outPath, Buffer.from(artifact.base64, 'base64'));
console.log(`✓ Saved ${outPath}`);
