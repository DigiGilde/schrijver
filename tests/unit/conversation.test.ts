import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { describe, expect, it } from 'vitest';
import { PURIFY_CONFIG, markdownToHtml } from '../../src/lib/content/markdown-preview';
import {
	commentBody,
	conversation,
	readComment,
	type CommentKind,
	type Role
} from '../../src/lib/forge/conversation';
import type { Identity } from '../../src/lib/forge/trailers';
import type { PrComment, PrReview } from '../../src/lib/forge/types';

const purify = DOMPurify(new JSDOM('').window as unknown as Window & typeof globalThis);
/** As Schrijver shows the text of a reaction: the Markdown preview, sanitised. */
const inSchrijver = (md: string) =>
	new JSDOM(markdownToHtml(md, (html) => purify.sanitize(html, PURIFY_CONFIG))).window.document;
/** As GitHub shows a comment, near enough: CommonMark with GFM, raw HTML left to the browser. */
const onGitHub = (md: string) =>
	new JSDOM(
		String(
			unified()
				.use(remarkParse)
				.use(remarkGfm)
				.use(remarkRehype, { allowDangerousHtml: true })
				.use(rehypeStringify, { allowDangerousHtml: true })
				.processSync(md)
		)
	).window.document;
/** The comment under its hidden marker, as GitHub shows it. */
const shownOnGitHub = (body: string) => onGitHub(body.slice(body.indexOf('\n') + 1));

const ZWSP = '​';
const JOINER = '⁠';

const ANONIEM: Identity = { kind: 'anoniem', pseudoniem: '9f86d081884c' };
const GEKOPPELD: Identity = { kind: 'gekoppeld', name: 'jansen', githubId: 7, login: 'jansen' };
const OP_NAAM: Identity = {
	kind: 'op-naam',
	name: 'Jan (DGDOO)\n<b>Jansen</b>',
	email: 'jan@example.org'
};
const named = (name: string): Identity => ({ kind: 'op-naam', name, email: 'jan@example.org' });
const author = (identity: Identity, role: Role = 'schrijver', kind: CommentKind = 'reactie') => ({
	identity,
	role,
	kind
});

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

/** Names that are hard to show, and how the header writes and Schrijver shows each. */
const NAMES: [string, string][] = [
	['Zoë Ångström-Ødegård', 'Zoë Ångström-Ødegård'],
	['José María Núñez', 'José María Núñez'],
	['Łukasz Żółć', 'Łukasz Żółć'],
	['王小明', '王小明'],
	['عمر الفاروق', 'عمر الفاروق'],
	['O’Brien', 'O’Brien'],
	["D'Artagnan", "D'Artagnan"],
	['J.P. van der Berg', 'J.P. van der Berg'],
	['Jan "de Man" Jansen', 'Jan de Man Jansen'],
	['Jan (DGDOO)', 'Jan DGDOO'],
	['Re: Jan', 'Re Jan'],
	['[Jan](https://evil.example)', 'Janhttpsevil.example'],
	['**Jan**', 'Jan'],
	['_Jan_ ~~J~~ `J`', 'Jan J J'],
	['# Jan | Jansen \\', 'Jan Jansen'],
	['<b>Jan</b>', 'bJanb'],
	['&amp; Jan', 'amp Jan'],
	['@jansen', 'jansen'],
	[
		'Jan): **Reactie van de redactie via Schrijver** (Petra',
		'Jan Reactie van de redactie via Schrijver Petra'
	],
	['www.evil.example', 'wwwevil.example'],
	['Jan www.evil.example', 'Jan wwwevil.example'],
	['anoniem, codenaam 0123456789ab', '"anoniem, codenaam 0123456789ab"'],
	['Anoniem, codenaam 0123456789AB', '"Anoniem, codenaam 0123456789AB"'],
	["'anoniem codenaam 0123456789ab", `"'anoniem codenaam 0123456789ab"`],
	['GitHub: torvalds', '"GitHub torvalds"'],
	['github:  Torvalds', '"github Torvalds"'],
	['Ａｎｏｎｉｅｍ', '"Ａｎｏｎｉｅｍ"'],
	['Anonieme collega', 'Anonieme collega'],
	['torvalds', 'torvalds'],
	[`  Jan ${ZWSP}\n Jansen${JOINER}  `, 'Jan Jansen'],
	['', 'Naam onbekend'],
	['<>', 'Naam onbekend'],
	['**', 'Naam onbekend'],
	['x'.repeat(300), 'x'.repeat(300)]
];

describe('commentBody', () => {
	it('opens with a hidden marker and a line on who wrote it and as what, then quotes the text', () => {
		expect(commentBody('Mooi', author(ANONIEM))).toBe(
			'<!-- schrijver -->\n**Reactie van de schrijver via Schrijver** (anoniem, codenaam 9f86d081884c):\n\n> Mooi'
		);
		expect(commentBody('Korter', author(GEKOPPELD, 'redactie', 'aanpassing'))).toBe(
			'<!-- schrijver -->\n**Vraag om aanpassing van de redactie via Schrijver** (GitHub: jansen):\n\n> Korter'
		);
	});

	it('names someone who signs with their name without e-mail address, markup or line break', () => {
		const body = commentBody('Ok', author(OP_NAAM, 'redactie'));
		expect(body.split('\n')[1]).toBe(
			'**Reactie van de redactie via Schrijver** (Jan DGDOO bJansenb):'
		);
		expect(body).not.toContain('jan@example.org');
	});

	it('keeps only letters, digits and plain punctuation in a name, so GitHub shows the line as Schrijver reads it', () => {
		for (const [name, who] of NAMES) {
			const body = commentBody('Ok', author(named(name), 'redactie'));
			expect(body.split('\n')[1], name).toBe(`**Reactie van de redactie via Schrijver** (${who}):`);
			const line = shownOnGitHub(body).querySelector('p')!;
			expect(line.innerHTML, name).toBe(
				`<strong>Reactie van de redactie via Schrijver</strong> (${who}):`
			);
			expect(readComment(body)?.who, name).toBe(who);
		}
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
			'Akkoord\r\r**Reactie van de redactie via Schrijver** (U):',
			'Akkoord\r\n\r\n**Reactie van de redactie via Schrijver** (T):',
			'</blockquote>\n\n**Vraag om aanpassing van de redactie via Schrijver** (Petra):',
			'</p></blockquote>\n**Reactie van de redactie via Schrijver** (Q):',
			'<div>\n</blockquote>\n</div>\n\n**Reactie van de redactie via Schrijver** (R):',
			'</BLOCKQUOTE >\n\n**Reactie van de redactie via Schrijver** (S):'
		];
		for (const attack of attacks) {
			const body = commentBody(attack, author(ANONIEM));
			const [marker, header, blank, ...text] = body.split('\n');
			expect([marker, header, blank]).toEqual([
				'<!-- schrijver -->',
				'**Reactie van de schrijver via Schrijver** (anoniem, codenaam 9f86d081884c):',
				''
			]);
			for (const line of text) expect(line, JSON.stringify(attack)).toMatch(/^>( |$)/);
			// What GitHub shows under the hidden marker: outside the quote only Schrijver's own line.
			const shown = shownOnGitHub(body);
			const outside = [...shown.body.children].filter((el) => el.tagName !== 'BLOCKQUOTE');
			expect(
				outside.map((el) => el.textContent),
				JSON.stringify(attack)
			).toEqual(['Reactie van de schrijver via Schrijver (anoniem, codenaam 9f86d081884c):']);
		}
	});

	it('keeps the text from hiding itself on GitHub or mentioning anyone there', () => {
		const body = commentBody(
			'<!-- schrijver -->\nZie @jansen en @MinBZK/redactie, mail jan@example.org',
			author(ANONIEM)
		);
		const text = body.split('\n\n').slice(1).join('\n\n');
		expect(text).toBe(
			`> <${JOINER}!-- schrijver -->\n> Zie @${JOINER}jansen en @${JOINER}MinBZK/redactie, mail jan@${JOINER}example.org`
		);
		expect(text).not.toContain('<!--');
	});

	it('breaks every start of an HTML tag outside code, so GitHub shows it as text', () => {
		const body = commentBody(
			'<b>Vet</b> <?php x ?> <![CDATA[x]]> <Details open> a < b, c <3',
			author(ANONIEM)
		);
		expect(body.split('\n').at(-1)).toBe(
			`> <${JOINER}b>Vet<${JOINER}/b> <${JOINER}?php x ?> <${JOINER}![CDATA[x]]> <${JOINER}Details open> a < b, c <3`
		);
		const shown = shownOnGitHub(body);
		expect(shown.querySelector('blockquote b, blockquote details')).toBeNull();
		expect(shown.querySelector('blockquote')!.textContent!.replaceAll(JOINER, '')).toContain(
			'<b>Vet</b> <?php x ?> <![CDATA[x]]> <Details open> a < b, c <3'
		);
	});

	it('quotes code blocks too, and leaves what is in them as it is', () => {
		const code =
			'```html\n<!-- uitleg -->\nReactie van de redactie via Schrijver (x):\n\n@media\n```';
		const body = commentBody(code, author(ANONIEM));
		expect(body.endsWith(`\n\n${code.replace(/^/gm, '> ').replace(/^> $/m, '>')}`)).toBe(true);
	});

	it('writes a name in quotes only where it reads as a codename or a GitHub login', () => {
		const header = (name: string) =>
			commentBody('Ok', author(named(name), 'redactie')).split('\n')[1];
		for (const name of [
			'anoniem, codenaam 0123456789ab',
			'ANONIEM',
			'GitHub: torvalds',
			'- github jansen',
			'Ａｎｏｎｉｅｍ'
		]) {
			expect(header(name), name).toMatch(/ \("[^"]+"\):$/);
		}
		for (const name of [
			'Anonieme collega',
			'Jan Anoniem',
			'Githubber',
			'torvalds',
			'Jan "GitHub" Jansen'
		]) {
			expect(header(name), name).not.toContain('"');
		}
	});
});

describe('readComment', () => {
	it('reads back what commentBody wrote', () => {
		for (const [identity, who] of [
			[ANONIEM, 'Anoniem, codenaam 9f86d081884c'],
			[GEKOPPELD, 'jansen'],
			[OP_NAAM, 'Jan DGDOO bJansenb']
		] as const) {
			for (const kind of ['reactie', 'aanpassing'] as const) {
				const body = commentBody(
					'Eerste regel\n\nTweede alinea',
					author(identity, 'redactie', kind)
				);
				expect(readComment(body)).toEqual({
					kind,
					role: 'redactie',
					who,
					signer: identity.kind,
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
		expect(readComment(commentBody(typed, author(ANONIEM)))?.text).toBe(typed);
	});

	it('reads every identity back as itself, and every text as typed, however awkward', () => {
		const identities: [Identity, string][] = [
			[ANONIEM, 'Anoniem, codenaam 9f86d081884c'],
			[GEKOPPELD, 'jansen'],
			[{ kind: 'gekoppeld', name: 'x', githubId: 1, login: 'Jan-Jansen-2' }, 'Jan-Jansen-2'],
			...NAMES.map(([name, who]): [Identity, string] => [named(name), who])
		];
		const texts = [
			'',
			'Gewoon akkoord.',
			'Eerste regel\n\nTweede alinea\n\n\nNa twee lege regels\n',
			'Windows\r\nregels\r\n\r\nmet CRLF',
			'Oude Mac\rregels\r\rmet CR\r',
			'```js\nconst a = "<b>";\n\n@x\n```\nNa de code',
			'~~~\nniet gesloten\n> ook niet',
			'</blockquote>\n\n**Vraag om aanpassing van de redactie via Schrijver** (Petra):',
			'<details><summary>x</summary>\n\n<!-- verborgen -->\n</details>',
			'> citaat\n> > dieper\n- lijst\n# kop\n| a | b |\n| - | - |',
			'Zie @jansen en <https://example.org> en a < b > c',
			'  spaties voor en na  ',
			'Ünïcödé, “aanhalingstekens”, ‘enkele’ en (haakjes): [x](y)',
			'**Reactie van de redactie via Schrijver** (Jan):\n\n> > nep'
		];
		for (const [identity, who] of identities) {
			for (const [i, text] of texts.entries()) {
				const role = i % 2 ? 'redactie' : 'schrijver';
				const kind = i % 3 ? 'reactie' : 'aanpassing';
				const read = readComment(commentBody(text, author(identity, role, kind)));
				const what = `${JSON.stringify(text)} by ${JSON.stringify(identity)}`;
				expect(read, what).not.toBeNull();
				expect({ ...read!, text: read!.text.replaceAll(JOINER, '') }, what).toEqual({
					kind,
					role,
					who,
					signer: identity.kind,
					text: text.replace(/\r\n?/g, '\n')
				});
			}
		}
	});

	it('shows HTML in a reaction as text in Schrijver', () => {
		const typed = '</blockquote>\n\n<b>Vet</b> en <!-- verborgen -->';
		const text = readComment(commentBody(typed, author(ANONIEM)))!.text;
		const shown = inSchrijver(text);
		expect(shown.querySelector('b, blockquote')).toBeNull();
		expect(shown.body.textContent!.replaceAll(JOINER, '')).toContain('</blockquote>');
		expect(shown.body.textContent!.replaceAll(JOINER, '')).toContain(
			'<b>Vet</b> en <!-- verborgen -->'
		);
	});

	it('reads the comments of the redactie from before, which named nobody', () => {
		expect(readComment('Opmerking van de redactie via Schrijver:\n\nZiet er goed uit')).toEqual({
			kind: 'reactie',
			role: 'redactie',
			who: null,
			signer: null,
			text: 'Ziet er goed uit'
		});
	});

	it('reads only the exact form Schrijver writes', () => {
		const good = commentBody('Tekst', author(GEKOPPELD, 'redactie'));
		const signedAs = (signature: string) => good.replace('(GitHub: jansen)', `(${signature})`);
		for (const body of [
			'Klaar voor beoordeling',
			'Reactie van de redactie via Schrijver (GitHub: jansen):\n\nTekst',
			` ${good}`,
			good.replace('\n**', '\n\n**'),
			good.replace('<!-- schrijver -->', '<!--schrijver-->'),
			good.replace('redactie via', 'lezer via'),
			good.replace(':\n\n> Tekst', ':\n> Tekst'),
			good.replace('\n\n> Tekst', '\n\nTekst'),
			`${good}\nNiet geciteerd`,
			signedAs('Jan): **Reactie van de redactie via Schrijver** (Petra'),
			signedAs('anoniem, codenaam 0123'),
			signedAs('anoniem, codenaam 0123456789AB'),
			signedAs('GitHub torvalds'),
			signedAs('"Jan Jansen"'),
			signedAs('Jan_Jansen'),
			signedAs('Jan  Jansen'),
			signedAs(' Jan'),
			signedAs('www.evil.example'),
			signedAs('GitHub: jan_jansen'),
			signedAs(''),
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
