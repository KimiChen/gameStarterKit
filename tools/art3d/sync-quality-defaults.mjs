import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const qualitySource = 'apps/Cocos/assets/resources/stage3d/data/quality.json';
export const qualityOutput = 'apps/client/src/logic/scene3d/qualityDefaults.generated.ts';
export function renderQualityDefaults(data) {
  return `// Generated from ${qualitySource}. Do not edit.\n`
    + '// Refresh: node tools/art3d/sync-quality-defaults.mjs, then npm run sync:client.\n'
    + `export const defaultQualityData: unknown = ${JSON.stringify(data, null, 4)};\n`;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const output = renderQualityDefaults(JSON.parse(fs.readFileSync(path.join(root, qualitySource), 'utf8')));
  if (process.argv.includes('--check')) {
    if (fs.readFileSync(path.join(root, qualityOutput), 'utf8') !== output) throw new Error('Stage3D quality defaults are stale');
  } else fs.writeFileSync(path.join(root, qualityOutput), output);
}
