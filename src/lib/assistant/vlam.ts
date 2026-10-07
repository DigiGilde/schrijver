import OpenAI from 'openai';
import { log } from '$lib/log';

export type Action = 'korter' | 'b1' | 'actiever' | 'kopjes' | 'samenvatting' | 'vrij';
export interface SuggestRequest {
	siteId: string;
	action: Action;
	text: string;
	instruction?: string;
}
export interface Suggestion {
	replacement: string;
	explanation: string;
}

export class AssistantUnavailable extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'AssistantUnavailable';
	}
}

export const DEFAULT_MODEL = process.env.VLAM_MODEL || 'vlam-llm-large-prepaid';

export function vlamClientFromEnv(): OpenAI {
	return new OpenAI({
		baseURL: process.env.VLAM_API_URL + '/v1',
		apiKey: process.env.VLAM_KEY_PREPAID
	});
}

const SYSTEM_RULES =
	'Je antwoordt uitsluitend met JSON {"replacement": string, "explanation": string}. ' +
	'Verander alleen wat gevraagd is. ' +
	'Behoud Markdown-opmaak, links, codeblokken en frontmatter letterlijk.';

const INSTRUCTIONS: Record<Exclude<Action, 'vrij'>, string> = {
	korter: 'Maak deze tekst korter zonder betekenis te verliezen.',
	b1: 'Herschrijf deze tekst op taalniveau B1: korte zinnen, gewone woorden, actieve vorm.',
	actiever: 'Herschrijf deze tekst in de actieve vorm.',
	kopjes: 'Stel tussenkopjes voor en voeg ze als Markdown-koppen in.',
	samenvatting: 'Vat deze tekst samen in een of twee zinnen, geschikt als description.'
};

const UNUSABLE = 'Onbruikbaar antwoord van VLAM';

function firstJsonObject(text: string): string | null {
	for (let start = text.indexOf('{'); start !== -1; start = text.indexOf('{', start + 1)) {
		let depth = 0;
		let inString = false;
		for (let i = start; i < text.length; i++) {
			const c = text[i];
			if (inString) {
				if (c === '\\') i++;
				else if (c === '"') inString = false;
			} else if (c === '"') inString = true;
			else if (c === '{') depth++;
			else if (c === '}' && --depth === 0) {
				const candidate = text.slice(start, i + 1);
				try {
					JSON.parse(candidate);
					return candidate;
				} catch {
					break;
				}
			}
		}
	}
	return null;
}

function parse(content: string): Suggestion {
	let value: unknown;
	try {
		value = JSON.parse(content);
	} catch {
		const block = firstJsonObject(content);
		if (!block) throw new AssistantUnavailable(UNUSABLE);
		value = JSON.parse(block);
	}
	const o = value as Record<string, unknown> | null;
	if (!o || typeof o.replacement !== 'string' || typeof o.explanation !== 'string') {
		throw new AssistantUnavailable(UNUSABLE);
	}
	return { replacement: o.replacement, explanation: o.explanation };
}

export async function suggest(
	client: OpenAI,
	model: string,
	schrijfwijzer: string,
	req: SuggestRequest
): Promise<Suggestion> {
	let instruction: string;
	if (req.action === 'vrij') {
		if (!req.instruction?.trim()) throw new RangeError('instruction is required for action vrij');
		instruction = req.instruction.trim();
	} else {
		instruction = INSTRUCTIONS[req.action];
	}
	const params = {
		model,
		messages: [
			{
				role: 'system' as const,
				content: (schrijfwijzer ? schrijfwijzer + '\n\n' : '') + SYSTEM_RULES
			},
			{ role: 'user' as const, content: `${instruction}\n\n${req.text}` }
		]
	};

	let completion: OpenAI.Chat.Completions.ChatCompletion;
	try {
		try {
			completion = await client.chat.completions.create({
				...params,
				response_format: { type: 'json_object' }
			});
		} catch (err) {
			if (
				err instanceof OpenAI.APIError &&
				err.status === 400 &&
				/response_format/i.test(err.message)
			) {
				completion = await client.chat.completions.create(params);
			} else {
				throw err;
			}
		}
	} catch (err) {
		throw new AssistantUnavailable('VLAM is niet bereikbaar');
	}

	log.info('assistant.request', {
		site: req.siteId,
		action: req.action,
		promptTokens: completion.usage?.prompt_tokens,
		completionTokens: completion.usage?.completion_tokens
	});
	return parse(completion.choices[0]?.message?.content ?? '');
}
