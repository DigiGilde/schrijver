import { defineConfig } from '@playwright/test';

const port = Number(process.env.E2E_PORT ?? 4391);
const issuerPort = port + 1;
// These change the settings or the team of a site for everyone, so they run after the other specs.
const SITE_CHANGES = /(beheer|samenvoegen-op-github)\.spec\.ts$/;

export default defineConfig({
	testDir: 'tests/e2e',
	use: { baseURL: `http://localhost:${port}` },
	projects: [
		{ name: 'app', testIgnore: SITE_CHANGES },
		{ name: 'site-wijzigen', testMatch: SITE_CHANGES, dependencies: ['app'] }
	],
	webServer: [
		{
			command: `node tests/e2e/fake-issuer.mjs`,
			url: `http://localhost:${issuerPort}/.well-known/openid-configuration`,
			reuseExistingServer: false,
			env: { FAKE_ISSUER_PORT: String(issuerPort) }
		},
		{
			command: `npx vite dev --port ${port} --strictPort`,
			url: `http://localhost:${port}/healthz`,
			reuseExistingServer: false,
			timeout: 180_000,
			env: {
				NODE_ENV: 'development',
				PORT: String(port),
				SCHRIJVER_FAKE_FORGE: '1',
				SCHRIJVER_NIEUWE_VOORSTELLEN_PER_UUR: '1000',
				SCHRIJVER_BEHEERDERS: 'platform',
				SCHRIJVER_TEST_SESSION: JSON.stringify({
					sub: 'test',
					name: 'Test Gebruiker',
					email: 'test@example.org',
					emailVerified: true,
					organisation: null,
					exp: 9999999999999
				}),
				PSEUDONYM_SECRET: 'e2e-pseudonym-secret',
				SESSION_SECRET: 'e2e-session-secret-e2e-session-secret',
				GITHUB_APP_CLIENT_ID: 'Iv1.e2e',
				OIDC_DISCOVERY_URL: `http://localhost:${issuerPort}/.well-known/openid-configuration`,
				OIDC_CLIENT_ID: 'schrijver-e2e',
				OIDC_CLIENT_SECRET: 'e2e',
				ORIGIN: `http://localhost:${port}`
			}
		}
	]
});
