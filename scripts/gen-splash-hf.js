const fs = require('fs');
const path = require('path');

const API_KEY = process.env.HUGGINGFACE_API_KEY;
if (!API_KEY) { console.error('HUGGINGFACE_API_KEY not set in environment'); process.exit(1); }
const ENDPOINT = 'https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell';
const OUTPUT = path.join(__dirname, '..', 'public', 'assets', 'splash.jpg');

const PROMPT = 'A cheerful young girl with long flowing golden curly hair, wearing a plain riding helmet with large dramatic realistic fire flames blazing up from the top of the helmet, orange and yellow flames, hot pink jacket, bright yellow trousers, bright blue boots, purple gloves, NO horn on the girl, riding a white unicorn with a bright rainbow coloured mane in red orange yellow green blue purple stripes, golden horn on the unicorn only, side view, the unicorn is joyfully galloping through the sky, a spectacular rainbow glitter trail streaming behind, a beautiful rainbow arc across a bright blue sky, fluffy friendly white clouds, rolling green hills below, soft warm children\'s book illustration style, rounded friendly shapes, vibrant cheerful colours, sparkles and glitter, highly detailed, beautiful, joyful, no scary elements, bright and happy';

async function generate(attempt) {
  console.log(`Attempt ${attempt}/3 — calling Hugging Face FLUX.1-schnell…`);

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inputs: PROMPT,
      parameters: { width: 1792, height: 1024 },
    }),
  });

  if (res.status === 503) {
    const json = await res.json().catch(() => ({}));
    const wait = json.estimated_time ? Math.ceil(json.estimated_time) : 20;
    console.log(`Model loading — waiting ${wait}s before retry…`);
    await new Promise(r => setTimeout(r, wait * 1000));
    return null;
  }

  if (!res.ok) {
    const text = await res.text();
    console.error(`API error ${res.status}:`, text);
    process.exit(1);
  }

  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  let buffer = null;
  for (let i = 1; i <= 3; i++) {
    buffer = await generate(i);
    if (buffer) break;
    if (i === 3) { console.error('Model still loading after 3 attempts. Try again in a minute.'); process.exit(1); }
  }

  fs.writeFileSync(OUTPUT, buffer);
  const { size } = fs.statSync(OUTPUT);
  console.log(`✓ Saved to ${OUTPUT} (${(size / 1024).toFixed(1)} KB)`);
}

main().catch(e => { console.error(e); process.exit(1); });
