const fs = require('fs');
const path = require('path');

const OUTPUT = path.join(__dirname, '..', 'public', 'assets', 'splash.jpg');

const PROMPT = encodeURIComponent(
  'A young girl with long flowing golden curly hair, cute pretty face with big eyes and a happy smile, wearing a dark helmet with flames on top, hot pink jacket, bright yellow trousers, bright blue boots, purple gloves, riding a white unicorn with exactly four legs, a rainbow coloured mane and golden horn, clean perfect hooves, the unicorn is flying through the air above rolling green hills, a spectacular rainbow glitter trail streaming behind the unicorn, a large rainbow arc across a bright blue sky, fluffy white clouds, joyful magical children\'s book illustration style, vibrant saturated colours, dynamic action pose, sparkles and glitter everywhere, highly detailed beautiful art, no text, no watermark'
);

const NEGATIVE = encodeURIComponent(
  'extra legs, multiple legs, too many legs, deformed legs, deformed face, ugly face, distorted face, weird hooves, deformed hooves, cloven hooves, extra limbs, mutation, disfigured, bad anatomy, watermark, text, blurry'
);

const URL = `https://image.pollinations.ai/prompt/${PROMPT}?width=1792&height=1024&model=flux&nologo=true&negative=${NEGATIVE}&seed=7391`;

async function main() {
  console.log('Generating image via Pollinations.ai (may take 20-30s)…');

  const res = await fetch(URL);
  if (!res.ok) {
    console.error(`HTTP ${res.status}: ${await res.text()}`);
    process.exit(1);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(OUTPUT, buffer);

  const { size } = fs.statSync(OUTPUT);
  console.log(`✓ Saved to ${OUTPUT} (${(size / 1024).toFixed(1)} KB)`);
}

main().catch(e => { console.error(e); process.exit(1); });
