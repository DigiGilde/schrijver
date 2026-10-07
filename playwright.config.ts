import { defineConfig } from '@playwright/test';

const port = 4391;

export default defineConfig({
	testDir: 'tests/e2e',
	use: { baseURL: `http://localhost:${port}` },
	webServer: {
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
			ORIGIN: `http://localhost:${port}`
		}
	}
});
