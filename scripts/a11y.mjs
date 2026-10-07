import { spawn } from 'node:child_process';

const port = 4393;
const baseEnv = { ...process.env, PORT: String(port) };
// Development mode enables the fake forge and the test session cookie.
const serverEnv = {
	...baseEnv,
	NODE_ENV: 'development',
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

const children = new Set();
for (const signal of ['SIGINT', 'SIGTERM']) {
	process.on(signal, () => {
		for (const child of children) child.kill();
		process.exit(1);
	});
}

function track(child) {
	children.add(child);
	child.on('exit', () => children.delete(child));
	return child;
}

function run(command, args, env) {
	return new Promise((resolve) => {
		const child = track(spawn(command, args, { stdio: 'inherit', env }));
		child.on('exit', (code) => resolve(code ?? 1));
	});
}

// Build as production: a development NODE_ENV would build the Lit dev bundle.
const buildEnv = { ...baseEnv };
delete buildEnv.NODE_ENV;
if ((await run('npm', ['run', 'build'], buildEnv)) !== 0) process.exit(1);

const server = track(spawn('node', ['build'], { stdio: 'inherit', env: serverEnv }));

let code = 1;
try {
	let up = false;
	for (let i = 0; i < 60 && !up; i++) {
		try {
			up = (await fetch(`http://localhost:${port}/healthz`)).ok;
		} catch {
			// not listening yet
		}
		if (!up) await new Promise((r) => setTimeout(r, 500));
	}
	if (!up) throw new Error('server did not start');
	code = await run('npx', ['pa11y-ci', '--config', '.pa11yci'], baseEnv);
} finally {
	server.kill();
}
process.exit(code);
