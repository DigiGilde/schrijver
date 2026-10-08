import type { Mermaid } from 'mermaid';
import { ICON_PREFIX, type IconPack } from '$lib/content/mermaid-icons';
import type { ColourScheme, DiagramTokens } from '$lib/content/mermaid-look';

const DARK = '(prefers-color-scheme: dark)';

async function getJson<T>(url: string): Promise<T> {
	const res = await fetch(url, { headers: { 'X-Requested-With': 'Schrijver' } });
	if (!res.ok) throw new Error(`${url}: ${res.status}`);
	return (await res.json()) as T;
}

/** The scheme the design system draws in: `data-scheme` on the root wins over the system setting. */
export function colourScheme(): ColourScheme {
	const chosen = document.documentElement.dataset.scheme;
	if (chosen === 'light' || chosen === 'dark') return chosen;
	return matchMedia(DARK).matches ? 'dark' : 'light';
}

export function watchColourScheme(onchange: (scheme: ColourScheme) => void): () => void {
	const media = matchMedia(DARK);
	const update = () => onchange(colourScheme());
	media.addEventListener('change', update);
	const observer = new MutationObserver(update);
	observer.observe(document.documentElement, { attributeFilter: ['data-scheme'] });
	return () => {
		media.removeEventListener('change', update);
		observer.disconnect();
	};
}

let mermaid: Promise<Mermaid> | undefined;

/** Mermaid with the NLDD icons, which load with the first diagram that shows one. */
export function loadMermaid(): Promise<Mermaid> {
	mermaid ??= import('mermaid').then(({ default: instance }) => {
		instance.registerIconPacks([
			{ name: ICON_PREFIX, loader: () => getJson<IconPack>('/api/iconen') }
		]);
		return instance;
	});
	return mermaid;
}

const tokens = new Map<string, Promise<DiagramTokens>>();

/** The site's token colours; none when they cannot be fetched, so the diagram still renders. */
export function siteTokens(siteId: string): Promise<DiagramTokens> {
	let entry = tokens.get(siteId);
	if (!entry) {
		entry = getJson<{ tokens: DiagramTokens }>(
			`/api/sites/${encodeURIComponent(siteId)}/mermaid`
		).then(
			(body) => body.tokens,
			() => {
				tokens.delete(siteId);
				return {};
			}
		);
		tokens.set(siteId, entry);
	}
	return entry;
}
