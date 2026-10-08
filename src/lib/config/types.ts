import { parse } from 'yaml';
import { z } from 'zod';

const ContentSchema = z.strictObject({
	pad: z.string(),
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

const ReviewSchema = z.strictObject({
	model: z.enum(['goedkeuring', 'direct']),
	'mergen-vanuit-schrijver': z.boolean().default(true),
	redactie: z.array(z.string()).default([])
});

const IdentiteitSchema = z.strictObject({
	toegestaan: z
		.array(z.enum(['anoniem', 'gekoppeld', 'op-naam']))
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

export const SiteConfigSchema = z
	.strictObject({
		id: z.string(),
		naam: z.string(),
		forge: z.literal('github'),
		repo: z.string(),
		standaardbranch: z.string(),
		concepten: z.enum(['openbaar', 'privé']).default('openbaar'),
		content: ContentSchema,
		review: ReviewSchema,
		identiteit: IdentiteitSchema.default({ toegestaan: ['anoniem', 'gekoppeld', 'op-naam'] }),
		preview: PreviewSchema,
		schrijfwijzer: z.string().optional()
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
	});

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
