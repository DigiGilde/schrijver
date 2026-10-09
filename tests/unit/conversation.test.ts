import { describe, expect, it } from 'vitest';
import { commentBody, conversation, readComment } from '../../src/lib/forge/conversation';
import type { PrComment, PrReview } from '../../src/lib/forge/types';

const ANONIEM = { kind: 'anoniem' as const, pseudoniem: '9f86d081884c' };
const GEKOPPELD = { kind: 'gekoppeld' as const, name: 'jansen', githubId: 7, login: 'jansen' };
const OP_NAAM = { kind: 'op-naam' as const, name: 'Jan (DGDOO)\nJansen', email: 'jan@example.org' };

const comment = (over: Partial<PrComment>): PrComment => ({
	id: 1,
	login: 'schrijver[bot]',
	body: '',
	createdAt: '2026-10-09T10:00:00Z',
	viaApp: true,
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

describe('commentBody', () => {
	it('starts with who wrote it, as what and through Schrijver, as their identity choice allows', () => {
		expect(commentBody('Mooi', { identity: ANONIEM, role: 'schrijver', kind: 'reactie' })).toBe(
			'Reactie van de schrijver via Schrijver (anoniem, codenaam 9f86d081884c):\n\nMooi'
		);
		expect(
			commentBody('Korter', { identity: GEKOPPELD, role: 'redactie', kind: 'aanpassing' })
		).toBe('Vraag om aanpassing van de redactie via Schrijver (GitHub: jansen):\n\nKorter');
		expect(commentBody('Ok', { identity: OP_NAAM, role: 'redactie', kind: 'reactie' })).toBe(
			'Reactie van de redactie via Schrijver (Jan (DGDOO) Jansen):\n\nOk'
		);
	});

	it('never puts the e-mail address of someone who signs with their name in it', () => {
		const body = commentBody('Ok', { identity: OP_NAAM, role: 'redactie', kind: 'reactie' });
		expect(body).not.toContain('@');
	});
});

describe('readComment', () => {
	it('reads back what commentBody wrote', () => {
		for (const [identity, who] of [
			[ANONIEM, 'Anoniem, codenaam 9f86d081884c'],
			[GEKOPPELD, 'jansen'],
			[OP_NAAM, 'Jan (DGDOO) Jansen']
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

	it('reads nothing from a comment without that first line', () => {
		expect(readComment('Klaar voor beoordeling')).toBeNull();
		expect(readComment('Reactie van de lezer via Schrijver (x):\n\ny')).toBeNull();
	});
});

describe('conversation', () => {
	it('puts comments and reviews in time order, each with who, as what and its verdict', () => {
		const items = conversation(
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
					viaApp: false,
					createdAt: '2026-10-09T09:00:00Z'
				})
			],
			[
				review({ id: 20, state: 'changes_requested', body: 'Liever B1' }),
				review({ id: 21, state: 'approved', submittedAt: '2026-10-09T13:00:00.000Z' })
			]
		);
		expect(items).toEqual([
			{
				id: 'c11',
				who: 'jansen',
				as: 'github',
				at: '2026-10-09T09:00:00Z',
				verdict: null,
				text: 'Op GitHub gezegd',
				url: null
			},
			{
				id: 'r20',
				who: 'pietersen',
				as: 'github',
				at: '2026-10-09T11:00:00Z',
				verdict: 'Vraagt om aanpassing op GitHub: pietersen',
				text: 'Liever B1',
				url: null
			},
			{
				id: 'c10',
				who: 'jansen',
				as: 'redactie',
				at: '2026-10-09T12:00:00Z',
				verdict: 'Vraagt om een aanpassing',
				text: 'Graag korter',
				url: null
			},
			{
				id: 'r21',
				who: 'pietersen',
				as: 'github',
				at: '2026-10-09T13:00:00.000Z',
				verdict: 'Goedgekeurd op GitHub door pietersen',
				text: '',
				url: null
			}
		]);
	});

	it('trusts the first line only on comments of its own App', () => {
		const forged = commentBody('Ik ben de redactie', {
			identity: OP_NAAM,
			role: 'redactie',
			kind: 'aanpassing'
		});
		const [item] = conversation([comment({ login: 'nep', body: forged, viaApp: false })], []);
		expect(item).toMatchObject({ who: 'nep', as: 'github', verdict: null, text: forged });
	});

	it('names Schrijver for its own messages, and someone of the redactie for old comments', () => {
		const items = conversation(
			[
				comment({ id: 1, body: 'Klaar voor beoordeling' }),
				comment({ id: 2, body: 'Opmerking van de redactie via Schrijver:\n\nPrima' })
			],
			[]
		);
		expect(items.map((i) => [i.who, i.as, i.text])).toEqual([
			['Schrijver', 'app', 'Klaar voor beoordeling'],
			['Iemand van de redactie', 'redactie', 'Prima']
		]);
	});

	it('points to GitHub for a review that comments on lines, and says when one was dismissed', () => {
		const items = conversation(
			[],
			[
				review({ id: 30, state: 'commented', body: '' }),
				review({ id: 31, state: 'commented', body: 'Zie de regels' }),
				review({ id: 32, state: 'dismissed', body: 'Te snel' })
			]
		);
		expect(items.map((i) => [i.verdict, i.text, i.url])).toEqual([
			[
				'Plaatste opmerkingen in de tekst op GitHub',
				'',
				'https://github.com/o/r/pull/7#pullrequestreview-2'
			],
			[null, 'Zie de regels', 'https://github.com/o/r/pull/7#pullrequestreview-2'],
			['Beoordeling van pietersen op GitHub is ingetrokken', 'Te snel', null]
		]);
	});
});
