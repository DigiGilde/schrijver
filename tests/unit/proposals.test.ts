import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseSitesYaml } from '../../src/lib/config/types';
import { toProposal, previewUrl } from '../../src/lib/forge/proposals';
import type { PrSummary, PrFile } from '../../src/lib/forge/types';
import type { Identity } from '../../src/lib/forge/trailers';

const [digi, moza] = parseSitesYaml(readFileSync('tests/fixtures/config/sites.yaml', 'utf8'));
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
			'wijzigingen-gevraagd'
		);
		expect(toProposal(pr(), files, digi, MINE).status).toBe('ingestuurd');
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
