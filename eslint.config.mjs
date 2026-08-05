// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/.angular/**',
      '**/node_modules/**',
      'docs/stitch_minimalist_white_ui_kit/**',
      'docs/Modulo IT.html',
      'apps/web/public/**',
      '**/*.config.js',
      '**/*.config.mjs',
      'scripts/**',
      'libs/shared/scripts/**',
    ],
  },

  eslint.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      // El proyecto prohíbe `any` sin justificación explícita (CLAUDE.md).
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
    },
  },

  // NestJS: `import type` rompe la inyección de dependencias.
  // Con `emitDecoratorMetadata`, TypeScript necesita el import de valor para
  // emitir `design:paramtypes`; si se convierte a import de tipo, el import
  // desaparece del JavaScript y Nest no puede resolver el constructor.
  {
    files: ['apps/api/**/*.ts', 'apps/worker/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },

  // Los scripts de siembra y migración son herramientas de línea de comandos:
  // informar por consola es precisamente lo que deben hacer.
  {
    files: ['**/seeds/**/*.ts', '**/migrations/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },

  // Tests: se permite el ruido propio de las utilidades de prueba.
  {
    files: ['**/*.spec.ts', '**/*.e2e.ts', 'apps/web/e2e/**/*.ts'],
    languageOptions: { globals: { ...globals.jest, ...globals.node } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },
);
