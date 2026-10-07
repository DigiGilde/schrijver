import type { FormField } from '$lib/content/schema-form';
import type { PendingImage } from './pending-images';

export type Draft = {
	path: string;
	body: string;
	frontmatter: Record<string, unknown>;
	at: number;
	sha?: string | null;
	images?: PendingImage[];
};

const MAX_IMAGE_BASE64 = Math.ceil((5 * 1024 * 1024 * 4) / 3);

export function readDraft(key: string): Draft | null {
	try {
		const raw = localStorage.getItem(key);
		if (!raw) return null;
		const draft = JSON.parse(raw) as Draft;
		if (!(typeof draft?.body === 'string' && draft.frontmatter && typeof draft.at === 'number'))
			return null;
		if (!Array.isArray(draft.images)) draft.images = [];
		draft.images = draft.images.filter(
			(i) => typeof i?.path === 'string' && typeof i?.base64 === 'string'
		);
		return draft;
	} catch {
		return null;
	}
}

/** Returns false when the images could not be stored (the text still is, if possible). */
export function writeDraft(key: string, draft: Draft | null): boolean {
	try {
		if (!draft) {
			localStorage.removeItem(key);
			return true;
		}
		const images = (draft.images ?? []).filter((i) => i.base64.length <= MAX_IMAGE_BASE64);
		let complete = images.length === (draft.images ?? []).length;
		try {
			localStorage.setItem(key, JSON.stringify({ ...draft, images }));
		} catch {
			if (images.length) complete = false;
			localStorage.setItem(key, JSON.stringify({ ...draft, images: [] }));
		}
		return complete;
	} catch {
		return !draft?.images?.length;
	}
}

export function restoredValue(field: FormField, raw: unknown): unknown {
	if (field.def.type === 'ja-nee') return typeof raw === 'boolean' ? raw : null;
	if (field.def.type === 'paginaverwijzing' && field.def.meervoud)
		return Array.isArray(raw) ? raw : [];
	return raw ?? '';
}

/** Removes every unsaved draft from this browser, so the next person on a shared workstation sees none. */
export function clearAllDrafts(): void {
	try {
		const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i));
		for (const key of keys) if (key?.startsWith('schrijver:')) localStorage.removeItem(key);
	} catch {
		// storage unavailable: nothing to clear
	}
}
