import { createHmac } from 'node:crypto';

export type Identity =
	| { kind: 'anoniem'; pseudoniem: string }
	| { kind: 'gekoppeld'; name: string; githubId: number; login: string }
	| { kind: 'op-naam'; name: string; email: string };

export function pseudonym(secret: string, sub: string): string {
	if (!secret) throw new Error('pseudonym requires a non-empty secret');
	return createHmac('sha256', secret).update(sub).digest('hex').slice(0, 12);
}

const clean = (value: string) =>
	value
		.replace(/[\r\n<>]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

export function identityTrailer(id: Identity): string {
	switch (id.kind) {
		case 'anoniem':
			return `Schrijver-Auteur: ${id.pseudoniem}`;
		case 'gekoppeld':
			return `Co-authored-by: ${clean(id.name)} <${id.githubId}+${id.login}@users.noreply.github.com>`;
		case 'op-naam':
			return `Co-authored-by: ${clean(id.name)} <${clean(id.email)}>`;
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

/** Trailers from the last paragraph only, as git does: a line higher up in the message is text, not a trailer. */
export function trailersFromMessage(message: string): string[] {
	const paragraphs = message.replace(/\r\n/g, '\n').trimEnd().split(/\n\s*\n/);
	return (paragraphs.length > 1 ? paragraphs[paragraphs.length - 1] : '')
		.split('\n')
		.map((l) => l.trim())
		.filter((l) => l.startsWith('Schrijver-Auteur: ') || l.startsWith('Co-authored-by: '));
}
