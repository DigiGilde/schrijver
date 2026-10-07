import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),
	kit: {
		adapter: adapter(),
		// script-src: SvelteKit's inline hydration script is blocked by a bare 'self';
		// mode 'auto' adds a nonce (SSR) or hash (prerendered) for it. Keep these
		// directives identical to CSP in src/lib/server/security.ts, which covers
		// responses SvelteKit does not render (API, redirects, errors).
		csp: {
			mode: 'auto',
			directives: {
				'default-src': ['self'],
				'script-src': ['self'],
				'style-src': ['self', 'unsafe-inline'],
				'img-src': ['self', 'data:', 'blob:', 'https://raw.githubusercontent.com'],
				'connect-src': ['self'],
				'frame-ancestors': ['none'],
				'base-uri': ['none'],
				'form-action': ['self']
			}
		}
	}
};

export default config;
