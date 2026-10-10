import postgres from 'postgres';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export interface UserPrefs {
	sub: string;
	identity: 'anoniem' | 'gekoppeld' | 'op-naam';
	githubLogin: string | null;
	githubId: number | null;
	onboarded: boolean;
}

export interface UsersStore {
	getPrefs(sub: string): Promise<UserPrefs>;
	savePrefs(p: UserPrefs): Promise<void>;
	listLinkedLogins(limit: number): Promise<string[]>;
}

const defaults = (sub: string): UserPrefs => ({
	sub,
	identity: 'anoniem',
	githubLogin: null,
	githubId: null,
	onboarded: false
});

export class MemoryUsersStore implements UsersStore {
	private rows = new Map<string, UserPrefs>();
	async getPrefs(sub: string) {
		return { ...(this.rows.get(sub) ?? defaults(sub)) };
	}
	async savePrefs(p: UserPrefs) {
		this.rows.set(p.sub, { ...p });
	}
	async listLinkedLogins(limit: number) {
		return [...this.rows.values()]
			.flatMap((r) => (r.githubLogin ? [r.githubLogin] : []))
			.slice(0, limit);
	}
	forget(sub: string) {
		this.rows.delete(sub);
	}
}

export function createUsersStore(sql: postgres.Sql): UsersStore {
	return {
		async getPrefs(sub) {
			const rows = await sql<
				{
					identity: UserPrefs['identity'];
					github_login: string | null;
					github_id: string | number | null;
					onboarded: boolean;
				}[]
			>`select identity, github_login, github_id, onboarded from user_prefs where sub = ${sub}`;
			const r = rows[0];
			if (!r) return defaults(sub);
			return {
				sub,
				identity: r.identity,
				githubLogin: r.github_login,
				githubId: r.github_id === null ? null : Number(r.github_id),
				onboarded: r.onboarded
			};
		},
		async savePrefs(p) {
			await sql`
				insert into user_prefs (sub, identity, github_login, github_id, onboarded, updated_at)
				values (${p.sub}, ${p.identity}, ${p.githubLogin}, ${p.githubId}, ${p.onboarded}, now())
				on conflict (sub) do update set
					identity = excluded.identity,
					github_login = excluded.github_login,
					github_id = excluded.github_id,
					onboarded = excluded.onboarded,
					updated_at = now()`;
		},
		async listLinkedLogins(limit) {
			const rows = await sql<{ github_login: string }[]>`
				select github_login from user_prefs
				where github_login is not null order by updated_at desc limit ${limit}`;
			return rows.map((r) => r.github_login);
		}
	};
}

let sql: postgres.Sql | undefined;
let store: UsersStore | undefined;

export function client(): postgres.Sql {
	if (!sql) {
		const url = process.env.DATABASE_SERVER_FULL;
		if (!url) throw new Error('DATABASE_SERVER_FULL is not set');
		sql = postgres(url);
	}
	return sql;
}

function realStore(): UsersStore {
	return (store ??= createUsersStore(client()));
}

/** Dev and test sessions only: keeps preferences in memory, so settings save without a database. */
export function useUsersStore(next: UsersStore): void {
	store = next;
}

export const getPrefs = (sub: string) => realStore().getPrefs(sub);
export const savePrefs = (p: UserPrefs) => realStore().savePrefs(p);
export const listLinkedLogins = (limit: number) => realStore().listLinkedLogins(limit);

export async function applySchema(): Promise<void> {
	const ddl = await readFile(resolve(process.cwd(), 'db/schema.sql'), 'utf8');
	await client().unsafe(ddl);
}
