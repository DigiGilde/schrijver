import { parse, YAMLParseError } from 'yaml';
import { z } from 'zod';
import { isWebAddress } from './site-address';

/** A folder in the repository, written from its root: no leading slash, no `..`. */
const RepoPath = z
	.string()
	.refine(
		(p) => !p.startsWith('/') && !p.includes('\\') && !p.split('/').includes('..'),
		'moet een map in de repository zijn, zonder / vooraan en zonder ..'
	);

const ContentSchema = z.strictObject({
	pad: RepoPath.transform((p) => p.replace(/\/+$/, '')),
	patroon: z.string(),
	uitsluiten: z.array(z.string()).optional(),
	afbeeldingen: z
		.strictObject({
			pad: RepoPath,
			verwijzing: z.literal('relatief')
		})
		.optional()
});

const PreviewSchema = z
	.strictObject({
		soort: z.enum(['bij-push', 'bij-label', 'geen']),
		label: z.string().optional(),
		url: z.string().optional()
	})
	.superRefine((p, ctx) => {
		if (p.soort === 'bij-label' && !p.label) {
			ctx.addIssue({ code: 'custom', path: ['label'], message: 'is nodig bij soort: bij-label' });
		}
		if (p.soort === 'geen') return;
		if (!p.url) {
			ctx.addIssue({ code: 'custom', path: ['url'], message: 'is nodig, behalve bij soort: geen' });
		} else if (!p.url.includes('{nummer}')) {
			ctx.addIssue({ code: 'custom', path: ['url'], message: 'moet {nummer} bevatten' });
		} else if (!isWebAddress(p.url.replaceAll('{nummer}', '1'))) {
			ctx.addIssue({
				code: 'custom',
				path: ['url'],
				message: 'moet een webadres zijn dat begint met https:// of http://'
			});
		}
	});

// Hex only: a colour goes into a Mermaid `classDef`, where a comma would end the declaration.
const KleurSchema = z
	.string()
	.regex(/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i, 'moet een hexkleur zijn, zoals #f0f7ff');

const MermaidSchema = z.strictObject({
	tokens: z.record(
		z.string().regex(/^--[\w-]+$/, 'moet de naam van een custom property zijn, zoals --color-text'),
		z.strictObject({ licht: KleurSchema, donker: KleurSchema })
	)
});

/** `.schrijver/site.yaml`: how the site is built. Who works on it and how is set in Schrijver. */
export const SiteFileSchema = z
	.strictObject({
		concepten: z.enum(['openbaar', 'privé']).default('openbaar'),
		content: ContentSchema,
		preview: PreviewSchema,
		mermaid: MermaidSchema.optional()
	})
	.superRefine((site, ctx) => {
		if (site.concepten === 'privé') {
			ctx.addIssue({
				code: 'custom',
				path: ['concepten'],
				message: 'privé wordt nog niet ondersteund'
			});
		}
	});

const FieldDefSchema = z.strictObject({
	type: z.enum(['tekst', 'getal', 'ja-nee', 'datum', 'paginaverwijzing']),
	label: z.string().optional(),
	hulp: z.string().optional(),
	verplicht: z.boolean().default(false),
	verborgen: z.boolean().default(false),
	meervoud: z.boolean().optional(),
	max: z.number().optional(),
	'alleen-in': z.array(z.string()).optional()
});

const NieuwePaginaSchema = z.union(
	[
		z.strictObject({
			mappen: z.array(z.string()),
			bestandsnaam: z.literal('uit-titel').optional(),
			sjabloon: z.string().optional()
		}),
		z.strictObject({
			soorten: z.array(
				z.strictObject({
					naam: z.string(),
					map: z.string().optional(),
					mappen: z.array(z.string()).optional(),
					bestandsnaam: z.string().optional(),
					velden: z.array(z.string()).optional(),
					sjabloon: z.string().optional()
				})
			)
		})
	],
	{ error: 'moet mappen hebben, of soorten met elk een naam' }
);

/** `.schrijver/schema.yaml`: the fields of a page and where new pages go. */
const TITEL = 'moet uit-h1 zijn, of veld: met de naam van een veld, zoals veld:title';

export const PageSchemaSchema = z.strictObject({
	// Zod reports the option that came furthest, so each option carries the message.
	titel: z.union(
		[z.literal('uit-h1', { error: TITEL }), z.string({ error: TITEL }).startsWith('veld:', TITEL)],
		{ error: TITEL }
	),
	velden: z.record(z.string(), FieldDefSchema),
	'nieuwe-pagina': NieuwePaginaSchema
});

export type SiteStructure = z.output<typeof SiteFileSchema>;
export type PageSchema = z.output<typeof PageSchemaSchema>;
export type FieldDef = PageSchema['velden'][string];

/** A site as the app works with it: its place on GitHub, from the registry, and its structure. */
export type SiteConfig = SiteStructure & {
	id: string;
	/** GitHub's numeric id of the repository. */
	repoId: number;
	/** owner/name, as GitHub last gave it. */
	repo: string;
	standaardbranch: string;
};

/** What a file gives: its value, or what is wrong with it, field by field, in Dutch. */
export type Parsed<T> = { ok: true; value: T } | { ok: false; errors: string[] };

const SETTINGS =
	'Je stelt het in bij Beheer van de site in Schrijver, onder Instellingen van de site.';
const TEAM = 'Het team stel je in bij Beheer van de site in Schrijver.';
const GITHUB = 'Schrijver weet van GitHub welke repository en welke standaardbranch het is.';

/** Fields of the old central configuration, and where each is set now. */
const MOVED: Record<string, string> = {
	id: 'Het kenmerk van de site kies je in Schrijver, bij Site toevoegen.',
	naam: SETTINGS,
	omschrijving: SETTINGS,
	adres: SETTINGS,
	review: 'Samenvoegen, vier ogen en de redactie stel je in bij Beheer van de site in Schrijver.',
	identiteit: 'Ondertekenen stel je in bij Beheer van de site in Schrijver.',
	team: TEAM,
	redactie: TEAM,
	forge: GITHUB,
	repo: GITHUB,
	standaardbranch: GITHUB,
	schrijfwijzer: 'De schrijfwijzer staat in .schrijver/schrijfwijzer.md.'
};

const moved = (field: string, where: string) =>
	`${field}: hoort niet meer in dit bestand. ${where}`;

const TYPES: Record<string, string> = {
	string: 'moet tekst zijn',
	number: 'moet een getal zijn',
	boolean: 'moet true of false zijn',
	array: 'moet een lijst zijn',
	object: 'moet een blok met velden zijn',
	record: 'moet een blok met velden zijn'
};

/** Zod's own messages in Dutch; the messages the schemas give themselves come first. */
const dutch: z.core.$ZodErrorMap = (issue) => {
	switch (issue.code) {
		case 'invalid_type':
			return issue.input === undefined || issue.input === null
				? 'ontbreekt'
				: (TYPES[issue.expected] ?? 'heeft niet de goede vorm');
		case 'invalid_value':
			return issue.values.length === 1
				? `moet ${String(issue.values[0])} zijn`
				: `moet een van deze waarden zijn: ${issue.values.map(String).join(', ')}`;
		case 'unrecognized_keys':
			return 'is geen veld dat Schrijver kent';
		default:
			return 'klopt niet';
	}
};

const pathText = (path: readonly PropertyKey[]) => path.map(String).join('.');

function zodErrors(error: z.ZodError): string[] {
	return error.issues.flatMap((issue) => {
		if (issue.code === 'unrecognized_keys') {
			return issue.keys.map((key) => `${pathText([...issue.path, key])}: ${issue.message}`);
		}
		// A key of a record that does not fit carries its own message one level down.
		const message =
			issue.code === 'invalid_key' ? (issue.issues[0]?.message ?? issue.message) : issue.message;
		return [[pathText(issue.path), message].filter(Boolean).join(': ')];
	});
}

const isBlock = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/** YAML as plain data, or what is wrong with it. The parser refuses aliases that expand without bound. */
function yaml(text: string): Parsed<unknown> {
	try {
		return { ok: true, value: parse(text) };
	} catch (e) {
		const line = e instanceof YAMLParseError ? e.linePos?.[0]?.line : undefined;
		return { ok: false, errors: [`geen geldige YAML${line ? ` (regel ${line})` : ''}`] };
	}
}

function validate<S extends z.ZodType>(schema: S, value: unknown): Parsed<z.output<S>> {
	if (!isBlock(value)) return { ok: false, errors: ['is leeg, of geen blok met velden'] };
	const result = schema.safeParse(value, { error: dutch });
	return result.success
		? { ok: true, value: result.data }
		: { ok: false, errors: zodErrors(result.error) };
}

/** Reads `.schrijver/site.yaml`. A field that moved to Schrijver is named, with where it is set now. */
export function parseSiteFile(text: string): Parsed<SiteStructure> {
	const data = yaml(text);
	if (!data.ok) return data;
	if (!isBlock(data.value)) return validate(SiteFileSchema, data.value);
	const rest = { ...data.value };
	const errors: string[] = [];
	for (const [field, where] of Object.entries(MOVED)) {
		if (!Object.hasOwn(rest, field)) continue;
		errors.push(moved(field, where));
		delete rest[field];
	}
	if (isBlock(rest.content) && Object.hasOwn(rest.content, 'schema')) {
		errors.push(moved('content.schema', 'Het schema staat in .schrijver/schema.yaml.'));
		const content = { ...rest.content };
		delete content.schema;
		rest.content = content;
	}
	const result = validate(SiteFileSchema, rest);
	if (result.ok && errors.length === 0) return result;
	return { ok: false, errors: [...errors, ...(result.ok ? [] : result.errors)] };
}

/** Reads `.schrijver/schema.yaml`. */
export function parseSchemaFile(text: string): Parsed<PageSchema> {
	const data = yaml(text);
	return data.ok ? validate(PageSchemaSchema, data.value) : data;
}
