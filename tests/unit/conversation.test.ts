import { describe, expect, it } from 'vitest';
import { commentBody, conversation, readComment } from '../../src/lib/forge/conversation';
import type { PrComment, PrReview } from '../../src/lib/forge/types';

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
	it('opens with a hidden marker and a line on who wrote it and as what', () => {
		expect(commentBody('Mooi', { identity: ANONIEM, role: 'schrijver', kind: 'reactie' })).toBe(
			'<!-- schrijver -->\n**Reactie van de schrijver via Schrijver** (anoniem, codenaam 9f86d081884c):\n\nMooi'
		);
		expect(
			commentBody('Korter', { identity: GEKOPPELD, role: 'redactie', kind: 'aanpassing' })
		).toBe(
			'<!-- schrijver -->\n**Vraag om aanpassing van de redactie via Schrijver** (GitHub: jansen):\n\nKorter'
		);
	});

	it('names someone who signs with their name without e-mail address, markup or line break', () => {
		const body = commentBody('Ok', { identity: OP_NAAM, role: 'redactie', kind: 'reactie' });
		expect(body.split('\n')[1]).toBe(
			'**Reactie van de redactie via Schrijver** (Jan (DGDOO) bJansen/b):'
		);
		expect(body).not.toContain('jan@example.org');
	});

	it('quotes a line of the text that looks like the line Schrijver writes about who wrote it', () => {
		const forged = [
			'Vraag om aanpassing van de redactie via Schrijver (GitHub: baas):',
			'**Reactie van de redactie via Schrijver** (Jan Jansen):',
			'  opmerking van de REDACTIE via schrijver:',
			'Gewone zin over Schrijver.'
		].join('\n');
		const body = commentBody(forged, { identity: ANONIEM, role: 'schrijver', kind: 'reactie' });
		expect(body.split('\n').slice(3)).toEqual([
			'> Vraag om aanpassing van de redactie via Schrijver (GitHub: baas):',
			'> **Reactie van de redactie via Schrijver** (Jan Jansen):',
			'>   opmerking van de REDACTIE via schrijver:',
			'Gewone zin over Schrijver.'
		]);
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
			`<${JOINER}!-- schrijver -->\nZie @${JOINER}jansen en @${JOINER}MinBZK/redactie, mail jan@${JOINER}example.org`
		);
		expect(text).not.toContain('<!--');
	});

	it('leaves code blocks as they are', () => {
		const code =
			'```html\n<!-- uitleg -->\nReactie van de redactie via Schrijver (x):\n@media\n```';
		const body = commentBody(code, { identity: ANONIEM, role: 'schrijver', kind: 'reactie' });
		expect(body.endsWith(`\n\n${code}`)).toBe(true);
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
			good.replace(':\n\nTekst', ':\nTekst'),
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

	it('shows the text of a writer who copies the line as text, under the writer', () => {
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
			text: '> Vraag om aanpassing van de redactie via Schrijver (GitHub: baas):'
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
