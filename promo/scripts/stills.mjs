// Renders preview stills at the given frames (with the facecam area outlined) into out/stills/.
// Usage: node scripts/stills.mjs 40 120 600
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import path from 'node:path';

const frames = process.argv.slice(2).map(Number);
const serveUrl = await bundle({ entryPoint: path.resolve('src/index.ts') });
const inputProps = { showSafeZone: true, music: false };
const composition = await selectComposition({ serveUrl, id: 'DocketDemo', inputProps });
for (const frame of frames) {
  const output = `out/stills/f${String(frame).padStart(4, '0')}.png`;
  await renderStill({ composition, serveUrl, output, frame, inputProps, scale: 0.5 });
  console.log(output);
}
