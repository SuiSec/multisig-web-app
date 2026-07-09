import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';

// Flat ESLint config for the React + Vite app. The repo root's config lints the
// SDK (with its Mysten license-header rule); the app is its own code with a
// single-line SPDX header, so it gets this dedicated React-oriented config.
export default [
	{
		ignores: ['dist', 'node_modules', 'src/vite-env.d.ts'],
	},
	{
		files: ['**/*.ts', '**/*.tsx'],
		languageOptions: {
			parser: typescriptParser,
			ecmaVersion: 2020,
			sourceType: 'module',
			globals: { ...globals.browser },
			parserOptions: {
				ecmaFeatures: { jsx: true },
			},
		},
		plugins: {
			'@typescript-eslint': typescript,
			'react-hooks': reactHooks,
			'react-refresh': reactRefresh,
		},
		rules: {
			...typescript.configs.recommended.rules,
			...reactHooks.configs['recommended-latest'].rules,
			// Allow the underscore-prefixed "destructure to intentionally omit"
			// idiom (e.g. `const { x: _drop, ...rest } = obj`).
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					varsIgnorePattern: '^_',
					argsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_',
				},
			],
			// react-hooks v7 ships preview "compiler" rules that flag idiomatic
			// code — the next-themes mounted pattern (setState in a mount effect)
			// and useMemo(namedFn, deps). Keep rules-of-hooks + exhaustive-deps;
			// drop just these two so idiomatic patterns pass.
			'react-hooks/set-state-in-effect': 'off',
			'react-hooks/use-memo': 'off',
			'react-refresh/only-export-components': [
				'warn',
				{ allowConstantExport: true },
			],
		},
	},
];
