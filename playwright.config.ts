import { defineConfig } from '@playwright/test';

const port = 4391;
const issuerPort = 4392;

export default defineConfig({
	testDir: 'tests/e2e',
	use: { baseURL: `http://localhost:${port}` },
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
				GITHUB_CONFIG_REPO: 'example/config',
				GITHUB_APP_CLIENT_ID: 'Iv1.e2e',
				OIDC_DISCOVERY_URL: `http://localhost:${issuerPort}/.well-known/openid-configuration`,
				OIDC_CLIENT_ID: 'schrijver-e2e',
				OIDC_CLIENT_SECRET: 'e2e',
				ORIGIN: `http://localhost:${port}`
			}
		}
	]
});
