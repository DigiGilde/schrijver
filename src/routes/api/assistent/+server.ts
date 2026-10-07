import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import {
	AssistantUnavailable,
	DEFAULT_MODEL,
	suggest,
	vlamClientFromEnv
} from '$lib/assistant/vlam';
import { getConfigStore } from '$lib/server/services';

const Body = z.object({
	siteId: z.string().min(1).max(100),
	action: z.enum(['korter', 'b1', 'actiever', 'kopjes', 'samenvatting', 'vrij']),
	text: z.string().min(1).max(20000),
	instruction: z.string().max(1000).optional()
});

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
	if (!parsed.success || (parsed.data.action === 'vrij' && !parsed.data.instruction?.trim())) {
		return json({ message: 'Ongeldig verzoek' }, { status: 400 });
	}
	const req = parsed.data;
	let schrijfwijzer: string;
	try {
		schrijfwijzer = getConfigStore().schrijfwijzer(req.siteId);
	} catch {
		return json({ message: 'Onbekende site' }, { status: 404 });
	}
	try {
		return json(await suggest(vlamClientFromEnv(), DEFAULT_MODEL, schrijfwijzer, req));
	} catch (err) {
		if (err instanceof AssistantUnavailable) return json({ message: err.message }, { status: 503 });
		throw err;
	}
};
