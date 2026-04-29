const BASE_URL = 'https://api.stability.ai';
const ENGINE   = 'stable-diffusion-xl-1024-v1-0';

function getApiKey(): string {
  const key = (import.meta as { env?: Record<string, string> }).env?.VITE_STABILITY_API_KEY;
  if (!key) throw new Error('VITE_STABILITY_API_KEY is not set in .env');
  return key;
}

async function extractArtifact(response: Response): Promise<Blob> {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Stability AI ${response.status}: ${text}`);
  }
  const data = await response.json() as {
    artifacts: Array<{ base64: string; finishReason: string }>;
  };
  const artifact = data.artifacts?.[0];
  if (!artifact) throw new Error('No artifact in Stability AI response');
  if (artifact.finishReason !== 'SUCCESS')
    throw new Error(`Generation failed: ${artifact.finishReason}`);
  const binary = atob(artifact.base64);
  const bytes  = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new Blob([bytes], { type: 'image/png' });
}

/** Generate an image from a text prompt via SDXL. */
export async function generateImage(
  prompt:         string,
  negativePrompt: string,
  width:          number,
  height:         number,
): Promise<Blob> {
  const response = await fetch(`${BASE_URL}/v1/generation/${ENGINE}/text-to-image`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept:          'application/json',
      Authorization:   `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify({
      text_prompts: [
        { text: prompt,         weight:  1 },
        { text: negativePrompt, weight: -1 },
      ],
      cfg_scale: 7,
      height,
      width,
      steps:   30,
      samples: 1,
    }),
  });
  return extractArtifact(response);
}

/**
 * Edit an existing image with a prompt.
 * Pass maskBlob to inpaint a specific region (white = repaint, black = keep).
 * Pass null to edit the whole image using image-to-image.
 */
export async function editImage(
  imageBlob:      Blob,
  maskBlob:       Blob | null,
  prompt:         string,
  negativePrompt: string,
): Promise<Blob> {
  const form = new FormData();
  form.append('init_image', imageBlob);
  form.append('text_prompts[0][text]',   prompt);
  form.append('text_prompts[0][weight]', '1');
  form.append('text_prompts[1][text]',   negativePrompt);
  form.append('text_prompts[1][weight]', '-1');
  form.append('cfg_scale', '7');
  form.append('steps',     '30');
  form.append('samples',   '1');

  let url: string;
  if (maskBlob) {
    url = `${BASE_URL}/v1/generation/${ENGINE}/image-to-image/masking`;
    form.append('mask_image',  maskBlob);
    form.append('mask_source', 'MASK_IMAGE_WHITE');
  } else {
    url = `${BASE_URL}/v1/generation/${ENGINE}/image-to-image`;
    form.append('init_image_mode', 'IMAGE_STRENGTH');
    form.append('image_strength',  '0.5');
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Accept:        'application/json',
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: form,
  });
  return extractArtifact(response);
}

/**
 * Save a generated image Blob.
 * Browser: triggers a file download.
 * Node.js: writes directly to public/assets/<filename>.
 */
export async function saveGeneratedAsset(blob: Blob, filename: string): Promise<void> {
  if (typeof window !== 'undefined') {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } else {
    // Node.js — dynamic import so Vite does not try to bundle `fs`
    const { writeFileSync } = await import(/* @vite-ignore */ 'node:fs');
    const { join }          = await import(/* @vite-ignore */ 'node:path');
    const buffer = Buffer.from(await blob.arrayBuffer());
    writeFileSync(join('public', 'assets', filename), buffer);
    console.log(`Saved public/assets/${filename}`);
  }
}
