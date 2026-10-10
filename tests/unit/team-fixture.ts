import { IDENTITY_KINDS, type Role, type SettingsValues } from '../../src/lib/auth/team';
import { MemoryTeamStore } from '../../src/lib/auth/team-memory';
import { useTeamStore } from '../../src/lib/auth/team-store';
import type { SiteConfig } from '../../src/lib/config/types';
import { PREVIEW_SITES } from '../../src/lib/server/fake-mode';

/** Who is on which team: per site id, each sub with their role. */
export type Teams = Record<string, Record<string, Role>>;

/** A site of a test with its settings. */
export interface TestSite {
	siteId: string;
	values: SettingsValues;
}

/** The settings of a site in a test: the defaults, with these values changed. */
export const settingsOf = (siteId: string, values: Partial<SettingsValues> = {}): TestSite => ({
	siteId,
	values: {
		naam: siteId,
		omschrijving: null,
		adres: null,
		mergenVanuitSchrijver: true,
		vierOgen: true,
		identiteitToegestaan: [...IDENTITY_KINDS],
		...values
	}
});

/** A site of the local preview has the settings it has there; another one the defaults. */
const previewSettings = (site: SiteConfig): TestSite => {
	const preview = PREVIEW_SITES.find((p) => p.site.id === site.id);
	return preview ? { siteId: site.id, values: preview.settings } : settingsOf(site.id);
};

/**
 * Puts a fresh team store in memory in place, with these sites added and their settings, and these
 * people on their teams, each signed in once with an address no invitation is for.
 */
export async function useTeams(
	sites: (SiteConfig | TestSite)[],
	teams: Teams = {}
): Promise<MemoryTeamStore> {
	const team = new MemoryTeamStore();
	useTeamStore(team);
	for (const [i, entry] of sites.entries()) {
		const { siteId, values } = 'values' in entry ? entry : previewSettings(entry);
		const place =
			'values' in entry
				? { repoId: 9000 + i, repo: `test/${siteId}`, standaardbranch: 'main' }
				: { repoId: entry.repoId, repo: entry.repo, standaardbranch: entry.standaardbranch };
		await team.addSite({ id: siteId, ...place }, values, null, null);
	}
	for (const [siteId, members] of Object.entries(teams)) {
		for (const [sub, role] of Object.entries(members)) {
			const email = `${sub}@team.example`;
			await team.recordLogin({ sub, name: `Naam ${sub}`, email, emailVerified: true });
			await team.addByEmail(siteId, email, role, 'opzet');
		}
	}
	return team;
}
