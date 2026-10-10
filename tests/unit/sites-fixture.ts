import { readFileSync } from 'node:fs';
import {
	parseSchemaFile,
	parseSiteFile,
	type PageSchema,
	type Parsed,
	type SiteConfig
} from '../../src/lib/config/types';
import { PREVIEW_SITES } from '../../src/lib/server/fake-mode';

type Pilot = 'digi-handboek' | 'moza-site';

/** A file in `.schrijver/` of a fake repository. */
export const structureFile = (site: string, name: string) =>
	readFileSync(`tests/fixtures/sites/${site}/.schrijver/${name}`, 'utf8');

function valid<T>(parsed: Parsed<T>): T {
	if (!parsed.ok) throw new Error(parsed.errors.join('\n'));
	return parsed.value;
}

/** A pilot site as the app works with it: its place in the registry and its `.schrijver/site.yaml`. */
function pilot(id: Pilot): SiteConfig {
	const { site } = PREVIEW_SITES.find((p) => p.site.id === id)!;
	return {
		...valid(parseSiteFile(structureFile(id, 'site.yaml'))),
		id: site.id,
		repoId: site.repoId,
		repo: site.repo,
		standaardbranch: site.standaardbranch
	};
}

export const digi = pilot('digi-handboek');
export const moza = pilot('moza-site');

export const schemaOf = (id: Pilot): PageSchema =>
	valid(parseSchemaFile(structureFile(id, 'schema.yaml')));
