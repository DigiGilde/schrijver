import { describe, expect, it } from 'vitest';
import { fakeAssistantActive, fakeSuggestion } from '../../src/lib/assistant/fake';

const preview = { NODE_ENV: 'development', SCHRIJVER_FAKE_FORGE: '1' };
const text = '# Over ons\n\nWij maken websites. Dat doen we samen.\n';

describe('fakeAssistantActive', () => {
	it('answers in the local preview without a VLAM address', () => {
		expect(fakeAssistantActive(preview)).toBe(true);
		expect(fakeAssistantActive({ ...preview, NODE_ENV: 'test' })).toBe(true);
	});
	it('leaves a configured VLAM address alone', () => {
		expect(fakeAssistantActive({ ...preview, VLAM_API_URL: 'http://localhost:11434' })).toBe(false);
	});
	it('never answers in production or outside the fake forge', () => {
		expect(fakeAssistantActive({ ...preview, NODE_ENV: 'production' })).toBe(false);
		expect(fakeAssistantActive({ SCHRIJVER_FAKE_FORGE: '1' })).toBe(false);
		expect(fakeAssistantActive({ NODE_ENV: 'development' })).toBe(false);
		expect(fakeAssistantActive({ ...preview, SCHRIJVER_FAKE_FORGE: 'true' })).toBe(false);
	});
});

describe('fakeSuggestion', () => {
	const ask = (action: Parameters<typeof fakeSuggestion>[0]['action'], t = text) =>
		fakeSuggestion({ siteId: 's', action, text: t });

	it('marks every answer as a test answer', () => {
		for (const action of ['korter', 'b1', 'actiever', 'kopjes', 'samenvatting', 'vrij'] as const) {
			expect(ask(action).explanation).toMatch(/^Testantwoord, geen AI: /);
		}
	});
	it('keeps the first sentence for Korter, with the heading before it', () => {
		expect(ask('korter').replacement).toBe('# Over ons\n\nWij maken websites.');
	});
	it('gives the first sentence of the text, without headings, for Samenvatting', () => {
		expect(ask('samenvatting').replacement).toBe('Wij maken websites.');
	});
	it('changes one word for the other actions', () => {
		expect(ask('b1').replacement).toBe('# OVER ons\n\nWij maken websites. Dat doen we samen.\n');
		expect(ask('vrij', 'NLDD en VLAM, maar ook teksten.').replacement).toBe(
			'NLDD en VLAM, MAAR ook teksten.'
		);
	});
	it('is deterministic and leaves a text without a word to change as it is', () => {
		expect(ask('actiever')).toEqual(ask('actiever'));
		expect(ask('kopjes', 'API 123').replacement).toBe('API 123');
	});
});
