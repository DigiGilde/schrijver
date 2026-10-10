import { describe, it, expect } from 'vitest';
import { ADJUSTMENT_LABEL, toProposal, previewUrl } from '../../src/lib/forge/proposals';
import type { PrSummary, PrFile } from '../../src/lib/forge/types';
import type { Identity } from '../../src/lib/forge/trailers';
import { digi, moza } from './sites-fixture';

const TRAILER = 'Schrijver-Auteur: abcdef012345';
const MINE: Identity[] = [{ kind: 'anoniem', pseudoniem: 'abcdef012345' }];

function pr(over: Partial<PrSummary> = {}): PrSummary {
	return {
		number: 7,
		title: 'Titel',
		body: `Tekst\n\n${TRAILER}`,
		draft: false,
		state: 'open',
		headRef: 'schrijver/x',
		headSha: 'abc1234',
		headRepo: 'o/r',
		baseRef: 'main',
		url: 'https://github.com/o/r/pull/7',
		labels: [],
		updatedAt: '2026-10-07T10:00:00Z',
		mergeable: true,
		reviewState: 'none',
		checks: 'success',
		...over
	};
}

const files: PrFile[] = [
	{ path: 'docs/b.md', status: 'modified' },
	{ path: 'docs/a.md', status: 'added' },
	{ path: 'README.md', status: 'modified' },
	{ path: 'docs/img.png', status: 'added' }
];

describe('toProposal', () => {
	it('maps draft to concept', () => {
		expect(toProposal(pr({ draft: true }), files, digi, MINE).status).toBe('concept');
	});

	it('treats a draft with the sent-in marker as ingestuurd', () => {
		const sent = pr({ draft: true, body: `Tekst\n\n${TRAILER}\n\nSchrijver-Status: ingestuurd` });
		expect(toProposal(sent, files, digi, MINE).status).toBe('ingestuurd');
	});

	it('maps ready and approved to goedgekeurd', () => {
		expect(toProposal(pr({ reviewState: 'approved' }), files, digi, MINE).status).toBe(
			'goedgekeurd'
		);
	});

	it('maps changes_requested and plain ready', () => {
		expect(toProposal(pr({ reviewState: 'changes_requested' }), files, digi, MINE).status).toBe(
			'aanpassing-gevraagd'
		);
		expect(toProposal(pr(), files, digi, MINE).status).toBe('ingestuurd');
	});

	it('reads the label that Schrijver sets as a request for an adjustment, over an approval', () => {
		expect(ADJUSTMENT_LABEL).toBe('aanpassing gevraagd');
		for (const reviewState of ['none', 'approved'] as const) {
			const labelled = pr({ reviewState, labels: ['preview', ADJUSTMENT_LABEL] });
			expect(toProposal(labelled, files, digi, MINE).status).toBe('aanpassing-gevraagd');
		}
		const concept = pr({ draft: true, labels: [ADJUSTMENT_LABEL] });
		expect(toProposal(concept, files, digi, MINE).status).toBe('concept');
		expect(toProposal(pr({ labels: ['preview'] }), files, digi, MINE).status).toBe('ingestuurd');
	});

	it('maps merged and closed', () => {
		expect(toProposal(pr({ state: 'merged' }), files, digi, MINE).status).toBe('samengevoegd');
		expect(toProposal(pr({ state: 'closed' }), files, digi, MINE).status).toBe('gesloten');
	});

	it('keeps an outside PR without trailer, not mine and not via Schrijver', () => {
		const p = toProposal(pr({ body: 'Handmatig' }), files, digi, MINE);
		expect(p.viaSchrijver).toBe(false);
		expect(p.mine).toBe(false);
	});

	it('flags mine only for the own trailer', () => {
		expect(toProposal(pr(), files, digi, MINE).mine).toBe(true);
		const other = toProposal(
			pr({ body: 'x\n\nSchrijver-Auteur: 111111111111' }),
			files,
			digi,
			MINE
		);
		expect(other.mine).toBe(false);
		expect(other.viaSchrijver).toBe(true);
	});

	it('lists sorted markdown pages under the content path', () => {
		expect(toProposal(pr(), files, digi, MINE).pages).toEqual(['docs/a.md', 'docs/b.md']);
	});

	it('copies title, url, checks and updatedAt', () => {
		const p = toProposal(pr({ checks: 'pending' }), files, digi, MINE);
		expect(p).toMatchObject({
			number: 7,
			title: 'Titel',
			url: 'https://github.com/o/r/pull/7',
			checks: 'pending',
			updatedAt: '2026-10-07T10:00:00Z'
		});
	});
});

describe('previewUrl', () => {
	it('substitutes {nummer} for bij-push', () => {
		const url = previewUrl(digi, pr());
		expect(url).toBe(digi.preview.url!.replace('{nummer}', '7'));
		expect(url).not.toContain('{nummer}');
	});

	it('replaces every {nummer} placeholder', () => {
		const site = {
			...digi,
			preview: { soort: 'bij-push' as const, url: 'https://x/{nummer}/pr-{nummer}/' }
		};
		const url = previewUrl(site, pr());
		expect(url).toBe('https://x/7/pr-7/');
		expect(url).not.toContain('{nummer}');
	});

	it('is null for bij-push without url', () => {
		const site = { ...digi, preview: { soort: 'bij-push' as const } };
		expect(previewUrl(site, pr())).toBeNull();
	});

	it('bij-label needs the label', () => {
		expect(previewUrl(moza, pr())).toBeNull();
		expect(previewUrl(moza, pr({ labels: ['preview'] }))).toBe(
			moza.preview.url!.replace('{nummer}', '7')
		);
	});

	it('is null when not open', () => {
		expect(previewUrl(digi, pr({ state: 'merged' }))).toBeNull();
		expect(previewUrl(digi, pr({ state: 'closed' }))).toBeNull();
	});

	it('is null for geen', () => {
		const site = { ...digi, preview: { soort: 'geen' as const } };
		expect(previewUrl(site, pr())).toBeNull();
	});
});

describe('verderBewerken', () => {
	const own = (over: Partial<PrSummary> = {}) =>
		pr({ headRef: 'schrijver/digi-handboek/a-bcde', headRepo: digi.repo, ...over });

	it('links every page of an open Schrijver proposal into the editor on its branch', () => {
		const links = toProposal(own(), files, digi, MINE).verderBewerken;
		expect(links).toEqual([
			{
				page: 'docs/a.md',
				href: '/sites/digi-handboek/bewerken/a.md?branch=schrijver%2Fdigi-handboek%2Fa-bcde&pr=7'
			},
			{
				page: 'docs/b.md',
				href: '/sites/digi-handboek/bewerken/b.md?branch=schrijver%2Fdigi-handboek%2Fa-bcde&pr=7'
			}
		]);
	});

	it('accepts a head repository that differs only in casing', () => {
		const links = toProposal(own({ headRepo: digi.repo.toUpperCase() }), files, digi, MINE);
		expect(links.verderBewerken).toHaveLength(2);
	});

	it('skips removed pages', () => {
		const removed: PrFile[] = [{ path: 'docs/weg.md', status: 'removed' }];
		expect(toProposal(own(), removed, digi, MINE).verderBewerken).toEqual([]);
	});

	it('offers nothing for closed, foreign-branch, fork or other-base proposals', () => {
		for (const over of [
			{ state: 'closed' as const },
			{ state: 'merged' as const },
			{ headRef: 'feature/x' },
			{ headRef: 'schrijver/moza-site/a-bcde' },
			{ headRepo: 'fork/handboek' },
			{ baseRef: 'dev' }
		]) {
			expect(toProposal(own(over), files, digi, MINE).verderBewerken).toEqual([]);
		}
	});
});
