// Minimal OIDC discovery for the e2e run: enough for openid-client to build an end-session URL.
import { createServer } from 'node:http';

const port = Number(process.env.FAKE_ISSUER_PORT ?? 4392);
const issuer = `http://localhost:${port}`;
const metadata = {
	issuer,
	authorization_endpoint: `${issuer}/auth`,
	token_endpoint: `${issuer}/token`,
	jwks_uri: `${issuer}/jwks`,
	end_session_endpoint: `${issuer}/logout`,
	response_types_supported: ['code'],
	subject_types_supported: ['public'],
	id_token_signing_alg_values_supported: ['RS256']
};

createServer((req, res) => {
	if (req.url === '/.well-known/openid-configuration') {
		res.writeHead(200, { 'content-type': 'application/json' });
		res.end(JSON.stringify(metadata));
		return;
	}
	res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
	res.end('<!doctype html><title>Fake issuer</title><p>Fake issuer</p>');
}).listen(port);
