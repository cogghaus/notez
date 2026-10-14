import js from '@eslint/js'
import tsPlugin from '@typescript-eslint/eslint-plugin'

// Flat config (ESLint 9). Same house style as frontend/eslint.config.js: eslint recommended plus
// typescript-eslint recommended, no extra rule tuning. The `--ext` CLI flag no longer exists in
// flat-config ESLint, so the npm scripts lint `src` directly (config `files` selects .ts).
export default [
  { ignores: ['dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tsPlugin.configs['flat/recommended'],
]
