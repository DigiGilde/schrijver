import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { fakeAssistantActive, fakeOutline, fakeSuggestion } from '$lib/assistant/fake';
import { OUTLINE_DESCRIPTION_MAX } from '$lib/assistant/shared';
import {
	AssistantUnavailable,
	DEFAULT_MODEL,
	outline,
	suggest,
	vlamClientFromEnv
} from '$lib/assistant/vlam';
import { UnknownSiteError } from '$lib/config/load';
import { getConfigStore } from '$lib/server/services';

const SiteId = z.string().min(1).max(100);
const Body = z.discriminatedUnion('action', [
	z.object({
		siteId: SiteId,
		action: z.enum(['korter', 'b1', 'actiever', 'kopjes', 'samenvatting', 'vrij']),
		text: z.string().min(1).max(20000),
		instruction: z.string().max(1000).optional()
	}),
	z.object({
		siteId: SiteId,
		action: z.literal('opzet'),
		text: z.string().min(1).max(OUTLINE_DESCRIPTION_MAX)
	})
]);

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ message: 'Niet ingelogd' }, { status: 401 });
	if (request.headers.get('x-requested-with') !== 'Schrijver') {
		return json({ message: 'Ongeldig verzoek' }, { status: 403 });
	}
	let raw: unknown;
	try {
		raw = await request.json();
	} catch {
		return json({ message: 'Ongeldig verzoek' }, { status: 400 });
	}
	const parsed = Body.safeParse(raw);
	if (
		!parsed.success ||
		(parsed.data.action === 'vrij' && !parsed.data.instruction?.trim()) ||
		(parsed.data.action === 'opzet' && !parsed.data.text.trim())
	) {
		return json({ message: 'Ongeldig verzoek' }, { status: 400 });
	}
	const req = parsed.data;
	let schrijfwijzer: string;
	try {
		schrijfwijzer = getConfigStore().schrijfwijzer(req.siteId);
	} catch (err) {
		if (err instanceof UnknownSiteError)
			return json({ message: 'Onbekende site' }, { status: 404 });
		throw err;
	}
	if (fakeAssistantActive()) {
		return json(req.action === 'opzet' ? fakeOutline(req) : fakeSuggestion(req));
	}
	try {
		const client = vlamClientFromEnv();
		return json(
			req.action === 'opzet'
				? await outline(client, DEFAULT_MODEL, schrijfwijzer, req)
				: await suggest(client, DEFAULT_MODEL, schrijfwijzer, req)
		);
	} catch (err) {
		if (err instanceof AssistantUnavailable) return json({ message: err.message }, { status: 503 });
		throw err;
	}
};
