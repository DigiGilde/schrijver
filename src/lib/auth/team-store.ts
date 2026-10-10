import { errorFields, log } from '$lib/log';
import type { Session } from './session';
import type { SiteSettings, TeamStore } from './team';
import { MemoryTeamStore } from './team-memory';
import { createTeamStore } from './team-postgres';
import { client, MemoryUsersStore, useUsersStore } from './users';

let store: TeamStore | undefined;

export function teamStore(): TeamStore {
	return (store ??= createTeamStore(client()));
}

export function useTeamStore(next: TeamStore | undefined): void {
	store = next;
}

let memory: { users: MemoryUsersStore; team: MemoryTeamStore } | undefined;

/** The local preview and the test session: people and preferences in memory, without a database. */
export function useMemoryStores(): { users: MemoryUsersStore; team: MemoryTeamStore } {
	if (!memory) {
		const users = new MemoryUsersStore();
		memory = { users, team: new MemoryTeamStore({ users }) };
	}
	useUsersStore(memory.users);
	useTeamStore(memory.team);
	return memory;
}

/**
 * The settings of a site: naam, omschrijving, adres, merging, four eyes and the ways to sign. A site
 * gets them when it is added, so none is an error.
 */
export async function siteSettings(
	site: { id: string },
	team: TeamStore = teamStore()
): Promise<SiteSettings> {
	const found = await team.settings(site.id);
	if (!found) throw new Error(`no settings for site ${site.id}`);
	return found;
}

/**
 * Notes that Schrijver committed to a proposal for this user. A failure is only logged: the commit is
 * made, and four eyes still reads its signature.
 */
export async function recordWriter(siteId: string, number: number, sub: string): Promise<void> {
	try {
		await teamStore().recordWriter(siteId, number, sub);
	} catch (err) {
		log.warn('proposal.writer_not_recorded', { site: siteId, pr: number, ...errorFields(err) });
	}
}

/**
 * Who Schrijver recorded as writing in a proposal, the first first: an empty list when nobody is
 * recorded, null when the record cannot be read, which four eyes takes as cannot tell.
 */
export async function recordedWriters(siteId: string, number: number): Promise<string[] | null> {
	try {
		return await teamStore().writers(siteId, number);
	} catch (err) {
		log.warn('proposal.writers_failed', { site: siteId, pr: number, ...errorFields(err) });
		return null;
	}
}

/**
 * Forgets who wrote in a proposal Schrijver merged. A failure is only logged: the merge is done, and
 * GitHub's event on the closed pull request or the daily retention deletes the record later.
 */
export async function forgetWriters(siteId: string, number: number): Promise<void> {
	try {
		await teamStore().forgetWriters(siteId, number);
	} catch (err) {
		log.warn('proposal.writers_not_forgotten', { site: siteId, pr: number, ...errorFields(err) });
	}
}

/** At every login: the profile, and the invitations for the verified address become memberships. */
export async function recordLogin(session: Session): Promise<void> {
	const claimed = await teamStore().recordLogin({
		sub: session.sub,
		name: session.name,
		email: session.email,
		emailVerified: session.emailVerified
	});
	for (const { siteId, role } of claimed)
		log.info('team.invitation_claimed', { site: siteId, role });
}

const DAY_MS = 24 * 3600_000;
let retentionTimer: ReturnType<typeof setInterval> | undefined;

/** Runs the retention now and then once a day. */
export function startRetention(): void {
	if (retentionTimer) return;
	const run = () =>
		Promise.resolve()
			.then(() => teamStore().retention())
			.then(
				(result) => log.info('team.retention', { ...result }),
				(err) => log.error('team.retention_failed', errorFields(err))
			);
	void run();
	retentionTimer = setInterval(run, DAY_MS);
	retentionTimer.unref?.();
}

export function stopRetention(): void {
	if (retentionTimer) clearInterval(retentionTimer);
	retentionTimer = undefined;
}
