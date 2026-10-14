import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { SERVER_VERSION } from './server.js';

describe('createNotezServer', () => {
  it('reports the package version, not a hand-copied one', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'));
    expect(SERVER_VERSION).toBe(pkg.version);
  });
});
