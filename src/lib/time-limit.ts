/** How long a page waits for GitHub's answer on someone's rights to a site, before it counts as no. */
export const RIGHTS_WAIT_MS = 2000;

export class TimeLimitError extends Error {
	constructor() {
		super('no answer in time');
		this.name = 'TimeLimitError';
	}
}

/** What `work` gives, or a TimeLimitError once it takes longer than `ms`; a later answer is dropped. */
export function inTime<T>(work: Promise<T>, ms: number): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const late = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new TimeLimitError()), ms);
	});
	return Promise.race([work, late]).finally(() => clearTimeout(timer));
}
