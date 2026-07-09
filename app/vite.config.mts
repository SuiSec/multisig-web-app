import path from 'path';
import react from '@vitejs/plugin-react-swc';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';

// A third-party dependency (@cetusprotocol/terminal) ships an
// `@import "https://fonts.googleapis.com/…Inter…"` inside its bundled CSS. We
// self-host our own fonts (Fontsource, see src/main.tsx) precisely to avoid any
// external font CDN — for privacy (no user-IP leak) and so a strict CSP /
// Walrus portal deploy doesn't break. Strip that remaining remote @import from
// the final CSS bundle so the whole app ships zero external font requests. The
// widget falls back to our --font-sans stack, which is fine.
function stripRemoteFontImports(): Plugin {
	return {
		name: 'strip-remote-font-imports',
		apply: 'build',
		generateBundle(_options, bundle) {
			const re =
				/@import\s*(?:url\()?\s*["']?https?:\/\/fonts\.(?:googleapis|gstatic)\.com[^;]*;/g;
			for (const file of Object.values(bundle)) {
				if (
					file.type === 'asset' &&
					file.fileName.endsWith('.css') &&
					typeof file.source === 'string' &&
					file.source.includes('fonts.g')
				) {
					file.source = file.source.replace(re, '');
				}
			}
		},
	};
}

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [
		react(),
		tailwindcss(),
		stripRemoteFontImports(),
	],
	resolve: {
		alias: {
			'@': path.resolve(__dirname, './src'),
			'@mysten/sagat': path.resolve(
				__dirname,
				'../sdk/src/index.ts',
			),
		},
	},
});
