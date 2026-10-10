import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { buildIconPack, type IconPack } from '$lib/content/mermaid-icons';

let pack: IconPack | undefined;

/**
 * The design system's public `./icon` export holds the icon names, not their SVG. The SVG lives in
 * the registry module next to it, which the package exports do not list, so it is loaded by path.
 * `require` loads these ES modules natively (Node 22.12 and later); in development an `import()`
 * would go through Vite's transform instead.
 */
function load(): IconPack {
	const require = createRequire(import.meta.url);
	const folder = dirname(require.resolve('@nldd/design-system/icon'));
	const { iconRegistry } = require(join(folder, 'icon-registry.js')) as {
		iconRegistry: Map<string, string>;
	};
	const { aliases } = require(join(folder, 'icon-aliases.js')) as {
		aliases: Record<string, string>;
	};
	return buildIconPack(iconRegistry, aliases);
}

export function nlddIconPack(): IconPack {
	pack ??= load();
	return pack;
}
