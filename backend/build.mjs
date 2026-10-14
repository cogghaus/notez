import { build } from 'esbuild';
import { readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

// Collect all .ts source files (excluding tests)
function getSourceFiles(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      getSourceFiles(fullPath, files);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts') && !entry.endsWith('.spec.ts')) {
      files.push(fullPath);
    }
  }
  return files;
}

const entryPoints = getSourceFiles('src');

await build({
  entryPoints,
  outdir: 'dist',
  platform: 'node',
  target: 'node24',
  format: 'esm',
  sourcemap: true,
  // Preserve directory structure (don't bundle)
  bundle: false,
  // Keep .js extension for ESM imports
  outExtension: { '.js': '.js' },
});

console.log(`Built ${entryPoints.length} files to dist/`);
