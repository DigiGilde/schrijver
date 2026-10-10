import {
	IDENTITY_KINDS,
	seedFromConfig,
	type Role,
	type SettingsValues,
	type SiteSeed
} from '../../src/lib/auth/team';
import { MemoryTeamStore } from '../../src/lib/auth/team-memory';
import { useTeamStore } from '../../src/lib/auth/team-store';
import type { SiteConfig } from '../../src/lib/config/types';

/** Who is on which team: per site id, each sub with their role. */
export type Teams = Record<string, Record<string, Role>>;

/** The settings of a site in a test: the defaults, with these values changed. */
export const settingsOf = (siteId: string, values: Partial<SettingsValues> = {}): SiteSeed => ({
	siteId,
	values: {
		naam: siteId,
		omschrijving: null,
		adres: null,
		mergenVanuitSchrijver: true,
		vierOgen: true,
		identiteitToegestaan: [...IDENTITY_KINDS],
		...values
	},
	redactie: []
});

/**
 * Puts a fresh team store in memory in place, with these sites and their settings, and these people
 * on their teams, each signed in once with an address no invitation is for.
 */
export async function useTeams(
	sites: (SiteConfig | SiteSeed)[],
	teams: Teams = {}
): Promise<MemoryTeamStore> {
	const team = new MemoryTeamStore();
	useTeamStore(team);
	for (const site of sites) await team.seedSite('values' in site ? site : seedFromConfig(site));
	for (const [siteId, members] of Object.entries(teams)) {
		for (const [sub, role] of Object.entries(members)) {
			const email = `${sub}@team.example`;
			await team.recordLogin({ sub, name: `Naam ${sub}`, email, emailVerified: true });
			await team.addByEmail(siteId, email, role, 'opzet');
		}
	}
	return team;
}
