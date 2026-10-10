import { describe, expect, it } from 'vitest';
import { fakeAssistantActive, fakeOutline, fakeSuggestion } from '../../src/lib/assistant/fake';

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

describe('fakeOutline', () => {
	const description = 'een pagina over de koffieautomaat. Waar staat hij en hoe werkt hij?';

	it('takes the title from the start of the description', () => {
		expect(fakeOutline({ siteId: 's', text: description }).title).toBe(
			'Een pagina over de koffieautomaat'
		);
		expect(
			fakeOutline({ siteId: 's', text: 'een twee drie vier vijf zes zeven acht negen tien' }).title
		).toBe('Een twee drie vier vijf zes zeven acht');
	});
	it('caps the title at 120 characters, as the real assistant does', () => {
		const text = Array(8).fill('Koffieautomaatonderhoudsprocedure').join(' ');
		expect(fakeOutline({ siteId: 's', text }).title).toBe(text.slice(0, 120));
	});
	it('returns a Markdown outline without a title heading, marked as a test', () => {
		const result = fakeOutline({ siteId: 's', text: description });
		expect(result.outline).toMatch(/^## Waar gaat het over\n\neen pagina over de koffieautomaat\./);
		expect(result.outline).not.toMatch(/^# /m);
		expect(result.explanation).toMatch(/^Testantwoord, geen AI: /);
	});
});
