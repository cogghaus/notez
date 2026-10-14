import { readFileSync } from 'fs';

/**
 * Backend version, read once at startup from backend/package.json.
 * Resolves the same from src/lib (tsx, vitest) and dist/lib (the image copies
 * package.json to /app/backend/package.json beside dist/).
 */
export const APP_VERSION: string = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf-8')
).version;
