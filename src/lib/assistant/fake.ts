import { devBypassesAllowed } from '$lib/server/security';
import { outlineTitle } from './shared';
import type { Outline, OutlineRequest, SuggestRequest, Suggestion } from './vlam';

type Env = Record<string, string | undefined>;

/** The local preview without a VLAM address answers with marked test suggestions instead of an error. */
export function fakeAssistantActive(env: Env = process.env): boolean {
	return env.SCHRIJVER_FAKE_FORGE === '1' && devBypassesAllowed(env) && !env.VLAM_API_URL;
}

const MARK = 'Testantwoord, geen AI:';

/** The text up to the end of its first sentence, with any headings before it. */
function firstSentence(text: string): string {
	const end = /[.!?](?=\s|$)/.exec(text);
	return (end ? text.slice(0, end.index + 1) : text).trim();
}

const plain = (text: string) =>
	text
		.split('\n')
		.filter((line) => !/^\s*#/.test(line))
		.join(' ')
		.replace(/\s+/g, ' ')
		.trim();

function oneWordInCapitals(text: string): string | null {
	for (const match of text.matchAll(/\p{L}{4,}/gu)) {
		const upper = match[0].toLocaleUpperCase('nl');
		if (upper !== match[0]) {
			return text.slice(0, match.index) + upper + text.slice(match.index + match[0].length);
		}
	}
	return null;
}

export function fakeSuggestion(req: SuggestRequest): Suggestion {
	if (req.action === 'korter') {
		return {
			replacement: firstSentence(req.text),
			explanation: `${MARK} alleen de eerste zin blijft staan.`
		};
	}
	if (req.action === 'samenvatting') {
		return {
			replacement: firstSentence(plain(req.text)) || plain(req.text),
			explanation: `${MARK} de eerste zin van de tekst.`
		};
	}
	const changed = oneWordInCapitals(req.text);
	return changed === null
		? { replacement: req.text, explanation: `${MARK} er is geen woord om te veranderen.` }
		: { replacement: changed, explanation: `${MARK} één woord staat nu in hoofdletters.` };
}

export function fakeOutline(req: OutlineRequest): Outline {
	const beschrijving = req.text.replace(/\s+/g, ' ').trim();
	const zin = firstSentence(beschrijving)
		.replace(/[.!?]$/, '')
		.split(' ')
		.slice(0, 8)
		.join(' ');
	return {
		title: outlineTitle(zin.charAt(0).toLocaleUpperCase('nl') + zin.slice(1)),
		outline: [
			'## Waar gaat het over',
			beschrijving,
			'## Wat verandert er',
			'Testopzet: schrijf hier wat er verandert.',
			'## Meer weten',
			'Testopzet: schrijf hier waar de lezer meer vindt.'
		].join('\n\n'),
		explanation: `${MARK} de titel is het begin van je beschrijving, de opzet is een vast voorbeeld.`
	};
}
