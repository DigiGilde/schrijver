import { spawn } from 'node:child_process';

const port = 4393;
const env = {
	...process.env,
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
};

function run(command, args, options = {}) {
	return new Promise((resolve) => {
		const child = spawn(command, args, { stdio: 'inherit', env, ...options });
		child.on('exit', (code) => resolve(code ?? 1));
	});
}

if ((await run('npm', ['run', 'build'])) !== 0) process.exit(1);

const server = spawn('node', ['build'], { stdio: 'inherit', env });
let code = 1;
try {
	let up = false;
	for (let i = 0; i < 60 && !up; i++) {
		try {
			up = (await fetch(`http://localhost:${port}/healthz`)).ok;
		} catch {
			await new Promise((r) => setTimeout(r, 500));
		}
	}
	if (!up) throw new Error('server did not start');
	code = await run('npx', ['pa11y-ci', '--config', '.pa11yci']);
} finally {
	server.kill();
}
process.exit(code);
