// Generates a new 1344×768 landscape splash screen via Stability AI text-to-image.
// Usage: node scripts/generate-splash.mjs
import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root      = path.join(__dirname, '..');

// Load .env
const env = Object.fromEntries(
  fs.readFileSync(path.join(root, '.env'), 'utf8').split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const [k, ...v] = l.split('='); return [k.trim(), v.join('=').trim()]; })
);
const API_KEY = env.VITE_STABILITY_API_KEY;
if (!API_KEY) throw new Error('VITE_STABILITY_API_KEY missing from .env');

const PROMPT = [
  'A young girl named Lily with long wavy blonde hair wearing a bright pink jacket,',
  'vivid yellow trousers, cobalt blue boots, and a blue helmet with a flame on top,',
  'riding a majestic white unicorn with a rainbow-coloured mane galloping through the sky.',
  'Behind the unicorn streams a spectacular glittering rainbow poop trail full of sparkles.',
  'In the background a bold vibrant full rainbow arc starts from the upper right of the image,',
  'curves high across the bright sky-blue sky, and descends on the left side ending softly',
  'in large fluffy white clouds near the bottom of the image.',
  'Additional fluffy white clouds dot the sky and sit along the bottom edge.',
  'Bright cheerful cartoon illustration style, game splash screen art,',
  'vivid saturated colours, clean linework, wide landscape composition.',
].join(' ');

const NEGATIVE = [
  'dark, gloomy, ugly, distorted, blurry, low quality, deformed,',
  'portrait, vertical, square, text, watermark, signature.',
].join(' ');

console.log('Generating 1344×768 splash image…');
const res = await fetch(
  'https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept:          'application/json',
      Authorization:   `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      text_prompts: [
        { text: PROMPT,    weight:  1 },
        { text: NEGATIVE,  weight: -1 },
      ],
      cfg_scale: 8,
      width:   1344,
      height:   768,
      steps:    40,
      samples:   1,
    }),
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
