/** An Iconify icon set, the form Mermaid's `registerIconPacks` loads. */
export interface IconPack {
	prefix: string;
	width: number;
	height: number;
	icons: Record<string, { body: string; width?: number; height?: number }>;
	aliases: Record<string, { parent: string }>;
}

export const ICON_PREFIX = 'nldd';

const SIZE = 24;
const SVG = /^\s*<svg\b([^>]*)>([\s\S]*)<\/svg>\s*$/;
const VIEW_BOX = /\bviewBox="0 0 ([\d.]+) ([\d.]+)"/;

/**
 * Turns the design system's icons (name to SVG markup) and their aliases into an Iconify set, so a
 * diagram can show `A@{ icon: "nldd:bell" }`. Iconify wants the inside of each `<svg>`; an icon
 * drawn on another grid than the set's 24 keeps its own size.
 */
export function buildIconPack(
	registry: Iterable<[string, string]>,
	aliases: Record<string, string>
): IconPack {
	const icons: IconPack['icons'] = {};
	for (const [name, svg] of registry) {
		const match = SVG.exec(svg);
		if (!match) continue;
		const icon: IconPack['icons'][string] = { body: match[2].trim() };
		const box = VIEW_BOX.exec(match[1]);
		if (box && (Number(box[1]) !== SIZE || Number(box[2]) !== SIZE)) {
			icon.width = Number(box[1]);
			icon.height = Number(box[2]);
		}
		icons[name] = icon;
	}
	const links: IconPack['aliases'] = {};
	for (const [alias, parent] of Object.entries(aliases)) {
		if (Object.hasOwn(icons, parent) && !Object.hasOwn(icons, alias)) links[alias] = { parent };
	}
	return { prefix: ICON_PREFIX, width: SIZE, height: SIZE, icons, aliases: links };
}
