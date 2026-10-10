import { parse } from 'yaml';
import { z } from 'zod';

const ContentSchema = z.strictObject({
	pad: z.string().transform((p) => p.replace(/\/+$/, '')),
	patroon: z.string(),
	schema: z.string(),
	uitsluiten: z.array(z.string()).optional(),
	afbeeldingen: z
		.strictObject({
			pad: z.string(),
			verwijzing: z.literal('relatief')
		})
		.optional()
});

/** Said of every field that only gives a site its first settings in Schrijver. */
const STARTING_VALUE = 'a starting value: once the site has its settings in Schrijver, those apply';

const ReviewSchema = z.strictObject({
	model: z.enum(['goedkeuring', 'direct']),
	'mergen-vanuit-schrijver': z
		.boolean({ error: `must be true or false (${STARTING_VALUE})` })
		.default(true),
	'vier-ogen': z.boolean({ error: `must be true or false (${STARTING_VALUE})` }).default(true),
	redactie: z
		.array(z.string(), {
			error: 'must be a list of e-mail addresses (invited once, when the site gets its settings)'
		})
		.default([])
});

const IdentiteitSchema = z.strictObject({
	toegestaan: z
		.array(
			z.enum(['anoniem', 'gekoppeld', 'op-naam'], {
				error: `must be anoniem, gekoppeld or op-naam (${STARTING_VALUE})`
			})
		)
		.default(['anoniem', 'gekoppeld', 'op-naam'])
});

const PreviewSchema = z
	.strictObject({
		soort: z.enum(['bij-push', 'bij-label', 'geen']),
		label: z.string().optional(),
		url: z.string().optional()
	})
	.superRefine((p, ctx) => {
		if (p.soort === 'bij-label' && !p.label) {
			ctx.addIssue({
				code: 'custom',
				path: ['label'],
				message: 'label is required when soort is bij-label'
			});
		}
		if (p.soort !== 'geen') {
			if (!p.url) {
				ctx.addIssue({
					code: 'custom',
					path: ['url'],
					message: 'url is required unless soort is geen'
				});
			} else if (!p.url.includes('{nummer}')) {
				ctx.addIssue({ code: 'custom', path: ['url'], message: 'url must contain {nummer}' });
			}
		}
	});

// Hex only: a colour goes into a Mermaid `classDef`, where a comma would end the declaration.
const KleurSchema = z
	.string()
	.regex(/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i, 'must be a hex colour such as #f0f7ff');

const MermaidSchema = z.strictObject({
	tokens: z.record(
		z.string().regex(/^--[\w-]+$/, 'must be a custom property name such as --color-text'),
		z.strictObject({ licht: KleurSchema, donker: KleurSchema })
	)
});

export const SiteConfigSchema = z
	.strictObject({
		id: z.string(),
		naam: z.string({ error: `must be text (${STARTING_VALUE})` }).optional(),
		omschrijving: z.string({ error: `must be text (${STARTING_VALUE})` }).optional(),
		adres: z
			.url({
				protocol: /^https?$/,
				error: `must be a web address such as https://example.org (${STARTING_VALUE})`
			})
			.optional(),
		forge: z.literal('github'),
		repo: z.string(),
		standaardbranch: z.string(),
		concepten: z.enum(['openbaar', 'privé']).default('openbaar'),
		content: ContentSchema,
		review: ReviewSchema,
		identiteit: IdentiteitSchema.default({ toegestaan: ['anoniem', 'gekoppeld', 'op-naam'] }),
		preview: PreviewSchema,
		schrijfwijzer: z.string().optional(),
		mermaid: MermaidSchema.optional()
	})
	.superRefine((site, ctx) => {
		if (site.concepten === 'privé') {
			ctx.addIssue({
				code: 'custom',
				path: ['concepten'],
				message: 'concepten: privé wordt nog niet ondersteund'
			});
		}
		if (site.review.model === 'direct') {
			ctx.addIssue({
				code: 'custom',
				path: ['review', 'model'],
				message: 'review.model: direct wordt nog niet ondersteund'
			});
		}
	})
	.transform(({ naam, omschrijving, adres, review, identiteit, ...site }) => ({
		...site,
		/** Only read for a site that has no settings in Schrijver yet. */
		seed: {
			naam: naam || site.id,
			omschrijving: omschrijving ?? null,
			adres: adres ?? null,
			mergenVanuitSchrijver: review['mergen-vanuit-schrijver'],
			vierOgen: review['vier-ogen'],
			identiteitToegestaan: identiteit.toegestaan,
			/** The addresses that get the first invitations to the redactie. */
			redactie: review.redactie
		}
	}));

export const SitesFileSchema = z.array(SiteConfigSchema);

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

const NieuwePaginaSchema = z.union([
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
]);

export const PageSchemaSchema = z.strictObject({
	titel: z.union([z.literal('uit-h1'), z.string().startsWith('veld:')]),
	velden: z.record(z.string(), FieldDefSchema),
	'nieuwe-pagina': NieuwePaginaSchema
});

export type SiteConfig = z.infer<typeof SiteConfigSchema>;
export type SitesFile = SiteConfig[];
export type PageSchema = z.infer<typeof PageSchemaSchema>;
export type FieldDef = PageSchema['velden'][string];

export function parseSitesYaml(text: string): SitesFile {
	return SitesFileSchema.parse(parse(text));
}

export function parseSchemaYaml(text: string): PageSchema {
	return PageSchemaSchema.parse(parse(text));
}
