import { createHmac } from 'node:crypto';

export type Identity =
	| { kind: 'anoniem'; pseudoniem: string }
	| { kind: 'gekoppeld'; name: string; githubId: number; login: string }
	| { kind: 'op-naam'; name: string; email: string };

export function pseudonym(secret: string, sub: string): string {
	return createHmac('sha256', secret).update(sub).digest('hex').slice(0, 12);
}

export function identityTrailer(id: Identity): string {
	switch (id.kind) {
		case 'anoniem':
			return `Schrijver-Auteur: ${id.pseudoniem}`;
		case 'gekoppeld':
			return `Co-authored-by: ${id.name} <${id.githubId}+${id.login}@users.noreply.github.com>`;
		case 'op-naam':
			return `Co-authored-by: ${id.name} <${id.email}>`;
	}
}

export function commitMessage(summary: string, id: Identity): string {
	return `${summary}\n\n${identityTrailer(id)}`;
}

export function identityFromPrBody(body: string): string | null {
	for (const raw of body.split('\n')) {
		const line = raw.trim();
		if (line.startsWith('Schrijver-Auteur: ') || line.startsWith('Co-authored-by: ')) {
			return line;
		}
	}
	return null;
}

export function trailersFromMessage(message: string): string[] {
	return message
		.split('\n')
		.map((l) => l.trim())
		.filter((l) => l.startsWith('Schrijver-Auteur: ') || l.startsWith('Co-authored-by: '));
}
