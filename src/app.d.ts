import type { Session } from '$lib/auth/session';
import type { UserPrefs } from '$lib/auth/users';

// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			user: { session: Session; prefs: UserPrefs } | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
