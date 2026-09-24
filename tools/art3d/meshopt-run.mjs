// Offline subprocess boundary. No npm install or client runtime import.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cache = path.join(root, '.cache/art3d/meshoptimizer-0.25.0');
const lock = JSON.parse(fs.readFileSync(new URL('./meshoptimizer.lock.json', import.meta.url)));
const manifest = JSON.parse(fs.readFileSync(path.join(cache, 'integrity.json')));
if (JSON.stringify(manifest.lock) !== JSON.stringify(lock)) throw new Error('Run setup-meshoptimizer.py: stale lock');
for (const [name, sha] of Object.entries(lock.files)) {
  if (createHash('sha256').update(fs.readFileSync(path.join(cache, name))).digest('hex') !== sha) throw new Error(`Corrupt meshoptimizer: ${name}`);
}
const { MeshoptSimplifier } = await import(pathToFileURL(path.join(cache, 'meshopt_simplifier.module.js')));
await MeshoptSimplifier.ready;
let input = '';
for await (const chunk of process.stdin) input += chunk;
const request = JSON.parse(input);
const results = request.map(p => {
  const [indices, error] = MeshoptSimplifier.simplifyWithAttributes(
    new Uint32Array(p.indices), new Float32Array(p.positions), 3,
    new Float32Array(p.attributes), p.stride, p.weights, new Uint8Array(p.lock),
    p.target, p.maxError, []);
  return { indices: Array.from(indices), error };
});
process.stdout.write(JSON.stringify(results));
