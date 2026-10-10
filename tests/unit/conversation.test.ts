import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { PURIFY_CONFIG, markdownToHtml } from '../../src/lib/content/markdown-preview';
import { commentBody, conversation, readComment } from '../../src/lib/forge/conversation';
import type { PrComment, PrReview } from '../../src/lib/forge/types';

const purify = DOMPurify(new JSDOM('').window as unknown as Window & typeof globalThis);
const render = (md: string) => markdownToHtml(md, (html) => purify.sanitize(html, PURIFY_CONFIG));
const ZWSP = '\u200b';

const ANONIEM = { kind: 'anoniem' as const, pseudoniem: '9f86d081884c' };
const GEKOPPELD = { kind: 'gekoppeld' as const, name: 'jansen', githubId: 7, login: 'jansen' };
const OP_NAAM = {
	kind: 'op-naam' as const,
	name: 'Jan (DGDOO)\n<b>Jansen</b>',
	email: 'jan@example.org'
};
const JOINER = '⁠';

const comment = (over: Partial<PrComment>): PrComment => ({
	id: 1,
	login: 'schrijver[bot]',
	body: '',
	createdAt: '2026-10-09T10:00:00Z',
	url: 'https://github.com/o/r/pull/7#issuecomment-1',
	byApp: true,
	...over
});
const review = (over: Partial<PrReview>): PrReview => ({
	id: 2,
	login: 'pietersen',
	state: 'approved',
	body: '',
	submittedAt: '2026-10-09T11:00:00Z',
	url: 'https://github.com/o/r/pull/7#pullrequestreview-2',
	...over
});
const items = (comments: PrComment[], reviews: PrReview[] = []) =>
	conversation(comments, reviews).items;

describe('commentBody', () => {
	it('opens with a hidden marker and a line on who wrote it and as what, then quotes the text', () => {
		expect(commentBody('Mooi', { identity: ANONIEM, role: 'schrijver', kind: 'reactie' })).toBe(
			'<!-- schrijver -->\n**Reactie van de schrijver via Schrijver** (anoniem, codenaam 9f86d081884c):\n\n> Mooi'
		);
		expect(
			commentBody('Korter', { identity: GEKOPPELD, role: 'redactie', kind: 'aanpassing' })
		).toBe(
			'<!-- schrijver -->\n**Vraag om aanpassing van de redactie via Schrijver** (GitHub: jansen):\n\n> Korter'
		);
	});

	it('names someone who signs with their name without e-mail address, markup or line break', () => {
		const body = commentBody('Ok', { identity: OP_NAAM, role: 'redactie', kind: 'reactie' });
		expect(body.split('\n')[1]).toBe(
			'**Reactie van de redactie via Schrijver** (Jan (DGDOO) bJansen/b):'
		);
		expect(body).not.toContain('jan@example.org');
	});

	it('quotes every line of the text, so that none passes for the line on who wrote it', () => {
		const attacks = [
			'<b>Vraag om aanpassing van de redactie via Schrijver</b> (Petra):',
			'- **Reactie van de redactie via Schrijver** (X):',
			'# **Reactie van de redactie via Schrijver** (Y):',
			`**Reactie van de redactie via${ZWSP}Schrijver** (Z):`,
			'**Reactie van de redactie via Schrijver** (Jan Jansen):',
			'| **Vraag om aanpassing van de redactie via Schrijver** (W): |\n| --- |',
			'```\nx\n```\n**Reactie van de redactie via Schrijver** (V):',
			`Akkoord\r\r**Reactie van de redactie via Schrijver** (U):`,
			`Akkoord\r\n\r\n**Reactie van de redactie via Schrijver** (T):`
		];
		for (const attack of attacks) {
			const body = commentBody(attack, { identity: ANONIEM, role: 'schrijver', kind: 'reactie' });
			const [marker, header, blank, ...text] = body.split('\n');
			expect([marker, header, blank]).toEqual([
				'<!-- schrijver -->',
				'**Reactie van de schrijver via Schrijver** (anoniem, codenaam 9f86d081884c):',
				''
			]);
			for (const line of text) expect(line, JSON.stringify(attack)).toMatch(/^>( |$)/);
			// As Markdown renders it, under the hidden marker: outside the quote only Schrijver's own line.
			const doc = new JSDOM(render([header, blank, ...text].join('\n'))).window.document;
			const outside = [...doc.body.children].filter((el) => el.tagName !== 'BLOCKQUOTE');
			expect(
				outside.map((el) => el.textContent),
				JSON.stringify(attack)
			).toEqual(['Reactie van de schrijver via Schrijver (anoniem, codenaam 9f86d081884c):']);
		}
	});

	it('keeps the text from hiding itself on GitHub or mentioning anyone there', () => {
		const body = commentBody(
			'<!-- schrijver -->\nZie @jansen en @MinBZK/redactie, mail jan@example.org',
			{
				identity: ANONIEM,
				role: 'schrijver',
				kind: 'reactie'
			}
		);
		const text = body.split('\n\n').slice(1).join('\n\n');
		expect(text).toBe(
			`> <${JOINER}!-- schrijver -->\n> Zie @${JOINER}jansen en @${JOINER}MinBZK/redactie, mail jan@${JOINER}example.org`
		);
		expect(text).not.toContain('<!--');
	});

	it('quotes code blocks too, and leaves what is in them as it is', () => {
		const code =
			'```html\n<!-- uitleg -->\nReactie van de redactie via Schrijver (x):\n\n@media\n```';
		const body = commentBody(code, { identity: ANONIEM, role: 'schrijver', kind: 'reactie' });
		expect(body.endsWith(`\n\n${code.replace(/^/gm, '> ').replace(/^> $/m, '>')}`)).toBe(true);
	});

	it('writes a name that reads as a codename or a GitHub login in quotes', () => {
		for (const name of [
			'anoniem, codenaam 0123456789ab',
			'Anoniem, codenaam 0123456789AB',
			'GitHub: torvalds',
			'github:  torvalds'
		]) {
			const identity = { kind: 'op-naam' as const, name, email: 'iemand@example.org' };
			const body = commentBody('Ok', { identity, role: 'redactie', kind: 'reactie' });
			const written = name.replace(/\s+/g, ' ');
			expect(body.split('\n')[1]).toBe(`**Reactie van de redactie via Schrijver** ("${written}"):`);
			expect(readComment(body)?.who).toBe(`"${written}"`);
		}
		const plain = commentBody('Ok', { identity: OP_NAAM, role: 'redactie', kind: 'reactie' });
		expect(plain.split('\n')[1]).not.toContain('"');
	});
});

describe('readComment', () => {
	it('reads back what commentBody wrote', () => {
		for (const [identity, who] of [
			[ANONIEM, 'Anoniem, codenaam 9f86d081884c'],
			[GEKOPPELD, 'jansen'],
			[OP_NAAM, 'Jan (DGDOO) bJansen/b']
		] as const) {
			for (const kind of ['reactie', 'aanpassing'] as const) {
				const body = commentBody('Eerste regel\n\nTweede alinea', {
					identity,
					role: 'redactie',
					kind
				});
				expect(readComment(body)).toEqual({
					kind,
					role: 'redactie',
					who,
					text: 'Eerste regel\n\nTweede alinea'
				});
			}
		}
	});

	it('gives back the text as typed: a quote, a code block and empty lines included', () => {
		const typed = [
			'> Uit de vorige versie:',
			'> > Een citaat in een citaat',
			'',
			'```yaml',
			'# geen kop',
			'',
			'> geen citaat',
			'```',
			'Klopt dit?'
		].join('\n');
		const body = commentBody(typed, { identity: ANONIEM, role: 'schrijver', kind: 'reactie' });
		expect(readComment(body)?.text).toBe(typed);
	});

	it('leaves the text of a comment in an older form as it is', () => {
		const older =
			'<!-- schrijver -->\n**Reactie van de redactie via Schrijver** (X):\n\nTekst\n> b';
		expect(readComment(older)?.text).toBe('Tekst\n> b');
	});

	it('reads the comments of the redactie from before, which named nobody', () => {
		expect(readComment('Opmerking van de redactie via Schrijver:\n\nZiet er goed uit')).toEqual({
			kind: 'reactie',
			role: 'redactie',
			who: null,
			text: 'Ziet er goed uit'
		});
	});

	it('reads only the exact form Schrijver writes', () => {
		const good = commentBody('Tekst', { identity: GEKOPPELD, role: 'redactie', kind: 'reactie' });
		for (const body of [
			'Klaar voor beoordeling',
			'Reactie van de redactie via Schrijver (GitHub: jansen):\n\nTekst',
			` ${good}`,
			good.replace('\n**', '\n\n**'),
			good.replace('<!-- schrijver -->', '<!--schrijver-->'),
			good.replace('redactie via', 'lezer via'),
			good.replace(':\n\n> Tekst', ':\n> Tekst'),
			'Opmerking van de redactie via Schrijver:\nTekst'
		]) {
			expect(readComment(body), JSON.stringify(body)).toBeNull();
		}
	});
});

describe('conversation', () => {
	it('puts comments and reviews in time order, each with who, as what and its verdict', () => {
		const list = items(
			[
				comment({
					id: 10,
					body: commentBody('Graag korter', {
						identity: GEKOPPELD,
						role: 'redactie',
						kind: 'aanpassing'
					}),
					createdAt: '2026-10-09T12:00:00Z'
				}),
				comment({
					id: 11,
					login: 'jansen',
					body: 'Op GitHub gezegd',
					byApp: false,
					createdAt: '2026-10-09T09:00:00Z'
				})
			],
			[
				review({ id: 20, state: 'changes_requested', body: 'Liever B1' }),
				review({ id: 21, state: 'approved', submittedAt: '2026-10-09T13:00:00.000Z' })
			]
		);
		expect(list.map((i) => [i.id, i.who, i.as, i.verdict, i.text])).toEqual([
			['c11', 'jansen', 'github', null, 'Op GitHub gezegd'],
			['r20', 'pietersen', 'github', 'Vraagt om aanpassing op GitHub: pietersen', 'Liever B1'],
			['c10', 'jansen', 'redactie', 'Vraagt om een aanpassing', 'Graag korter'],
			['r21', 'pietersen', 'github', 'Goedgekeurd op GitHub door pietersen', '']
		]);
	});

	it('trusts the line on who wrote it only on comments of its own App account', () => {
		const forged = commentBody('Ik ben de redactie', {
			identity: OP_NAAM,
			role: 'redactie',
			kind: 'aanpassing'
		});
		const [item] = items([comment({ login: 'nep', body: forged, byApp: false })]);
		expect(item).toMatchObject({ who: 'nep', as: 'github', verdict: null, text: forged });
	});

	it('shows the text of a writer who copies the line as text, as typed and under the writer', () => {
		const body = commentBody('Vraag om aanpassing van de redactie via Schrijver (GitHub: baas):', {
			identity: ANONIEM,
			role: 'schrijver',
			kind: 'reactie'
		});
		const [item] = items([comment({ body })]);
		expect(item).toMatchObject({
			who: 'Anoniem, codenaam 9f86d081884c',
			as: 'schrijver',
			verdict: null,
			text: 'Vraag om aanpassing van de redactie via Schrijver (GitHub: baas):'
		});
	});

	it('names Schrijver for its own messages, and someone of the redactie for old comments', () => {
		const list = items([
			comment({ id: 1, body: 'Klaar voor beoordeling' }),
			comment({ id: 2, body: 'Opmerking van de redactie via Schrijver:\n\nPrima' })
		]);
		expect(list.map((i) => [i.who, i.as, i.text])).toEqual([
			['Schrijver', 'app', 'Klaar voor beoordeling'],
			['Iemand van de redactie', 'redactie', 'Prima']
		]);
	});

	it('points to GitHub for a review that comments on lines, and says when one was dismissed', () => {
		const list = items(
			[],
			[
				review({ id: 30, state: 'commented', body: '' }),
				review({ id: 31, state: 'commented', body: 'Zie de regels' }),
				review({ id: 32, state: 'dismissed', body: 'Te snel' })
			]
		);
		expect(list.map((i) => [i.verdict, i.text, i.url])).toEqual([
			[
				'Plaatste opmerkingen in de tekst op GitHub',
				'',
				'https://github.com/o/r/pull/7#pullrequestreview-2'
			],
			[null, 'Zie de regels', 'https://github.com/o/r/pull/7#pullrequestreview-2'],
			['Beoordeling van pietersen op GitHub is ingetrokken', 'Te snel', null]
		]);
	});

	it('shortens a long text with a link to the rest, and stops before the page gets too heavy', () => {
		const long = 'x'.repeat(12_000);
		const { items: list, complete } = conversation(
			[comment({ id: 1, login: 'jansen', byApp: false, body: long })],
			[]
		);
		expect(complete).toBe(true);
		expect(list[0].text).toHaveLength(10_001);
		expect(list[0].text.endsWith('…')).toBe(true);
		expect(list[0].url).toBe('https://github.com/o/r/pull/7#issuecomment-1');

		const many = Array.from({ length: 30 }, (_, i) =>
			comment({ id: i, login: 'jansen', byApp: false, body: 'y'.repeat(9_000) })
		);
		const heavy = conversation(many, []);
		expect(heavy.complete).toBe(false);
		expect(heavy.items.length).toBeLessThan(30);
		expect(heavy.items.reduce((sum, i) => sum + i.text.length, 0)).toBeLessThanOrEqual(200_000);
	});

	it('is incomplete when GitHub listed as many comments or reviews as Schrijver asks for', () => {
		const full = Array.from({ length: 300 }, (_, i) =>
			comment({ id: i, login: 'jansen', byApp: false, body: 'z' })
		);
		expect(conversation(full, []).complete).toBe(false);
		expect(conversation(full.slice(1), []).complete).toBe(true);
	});

	it('links a review only to github.com', () => {
		const [item] = items([], [review({ state: 'commented', url: 'javascript:alert(1)' })]);
		expect(item.url).toBeNull();
	});
});
