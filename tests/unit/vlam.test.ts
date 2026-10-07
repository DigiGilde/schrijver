import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import OpenAI from 'openai';
import { suggest, AssistantUnavailable } from '../../src/lib/assistant/vlam';

vi.mock('../../src/lib/log', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

const url = 'http://vlam.test/v1/chat/completions';
const answer = (content: string) =>
	HttpResponse.json({
		id: 'x',
		object: 'chat.completion',
		created: 0,
		model: 'm',
		choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content } }],
		usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
	});

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const client = () => new OpenAI({ baseURL: 'http://vlam.test/v1', apiKey: 'k', maxRetries: 0 });
const req = { siteId: 'moza', action: 'korter' as const, text: 'Dit is een lange zin.' };

describe('suggest', () => {
	it('sends the text and no identity keys', async () => {
		let body = '';
		server.use(
			http.post(url, async ({ request }) => {
				body = await request.text();
				return answer('{"replacement":"Kort.","explanation":"Korter."}');
			})
		);
		await suggest(client(), 'm', 'Schrijfwijzer.', req);
		const keys = new Set<string>();
		JSON.parse(body, (k, v) => (keys.add(k), v));
		for (const k of ['email', 'name', 'sub', 'pseudoniem']) expect(keys.has(k)).toBe(false);
		expect(body).toContain('Dit is een lange zin.');
	});

	it('parses a JSON answer', async () => {
		server.use(http.post(url, () => answer('{"replacement":"Kort.","explanation":"Korter."}')));
		expect(await suggest(client(), 'm', '', req)).toEqual({
			replacement: 'Kort.',
			explanation: 'Korter.'
		});
	});

	it('parses a JSON object surrounded by prose', async () => {
		server.use(
			http.post(url, () =>
				answer('Hier is het: {"replacement":"A {b}","explanation":"Uitleg."} Succes!')
			)
		);
		expect((await suggest(client(), 'm', '', req)).replacement).toBe('A {b}');
	});

	it('retries without response_format when the gateway rejects it', async () => {
		let calls = 0;
		server.use(
			http.post(url, async ({ request }) => {
				calls++;
				const b = (await request.json()) as Record<string, unknown>;
				if (b.response_format)
					return HttpResponse.json(
						{ error: { message: 'response_format unsupported' } },
						{ status: 400 }
					);
				return answer('{"replacement":"x","explanation":"y"}');
			})
		);
		expect((await suggest(client(), 'm', '', req)).replacement).toBe('x');
		expect(calls).toBe(2);
	});

	it('rejects an unusable answer', async () => {
		server.use(http.post(url, () => answer('{"replacement":1}')));
		await expect(suggest(client(), 'm', '', req)).rejects.toThrow('Onbruikbaar antwoord van VLAM');
	});

	it('maps a 502 to AssistantUnavailable', async () => {
		server.use(http.post(url, () => new HttpResponse('bad gateway', { status: 502 })));
		await expect(suggest(client(), 'm', '', req)).rejects.toBeInstanceOf(AssistantUnavailable);
	});

	it('requires an instruction for vrij', async () => {
		await expect(suggest(client(), 'm', '', { ...req, action: 'vrij' })).rejects.toBeInstanceOf(
			RangeError
		);
	});
});
