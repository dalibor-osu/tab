import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
    { ignores: ['**/dist/**', '**/dist-ext/**', '**/dist-firefox/**', '**/node_modules/**', 'widgets/**'] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['src/ts/**/*.ts'],
        languageOptions: {
            globals: { ...globals.browser, BUILD_TARGET: 'readonly', BUILD_BROWSER: 'readonly' }
        },
        rules: {
            '@typescript-eslint/no-unused-vars': [
                'error',
                { args: 'after-used', caughtErrors: 'none', ignoreRestSiblings: true }
            ]
        }
    },
    {
        files: ['**/sw.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'script',
            globals: globals.serviceworker
        }
    },
    {
        files: ['**/tools/*.{js,mjs}'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: { ...globals.node, Bun: 'readonly' }
        }
    },
    {
        files: ['**/*.{js,mjs}'],
        rules: {
            'no-unused-vars': ['error', { args: 'after-used', caughtErrors: 'none', ignoreRestSiblings: true }]
        }
    },
    {
        rules: {
            curly: ['error', 'all'],
            eqeqeq: ['error', 'smart'],
            'no-var': 'error',
            'prefer-const': 'error',
            'no-empty': ['error', { allowEmptyCatch: true }],
            'no-eval': 'error',
            'no-implied-eval': 'error',
            'no-new-func': 'error',
            'no-script-url': 'error',
            'no-restricted-properties': [
                'error',
                { object: 'document', property: 'write', message: 'Deprecated: build DOM nodes or use srcdoc.' },
                { object: 'document', property: 'writeln', message: 'Deprecated: build DOM nodes or use srcdoc.' },
                { object: 'document', property: 'execCommand', message: 'Deprecated: use the Clipboard API.' }
            ]
        }
    },
    {
        files: ['src/ts/sandbox/runner.ts'],
        rules: { 'no-new-func': 'off' }
    }
];
