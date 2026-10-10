export type PendingImage = { path: string; base64: string };

/** Total of the images sent with one save; the server's body limit is sized to fit it. */
export const MAX_PENDING_IMAGE_BYTES = 10 * 1024 * 1024;
export const IMAGES_TOO_LARGE =
	'De afbeeldingen op deze pagina zijn samen groter dan 10 MB; verwijder er een paar of maak ze kleiner';

/** Decoded size of a base64 string, without decoding it. */
export function base64Bytes(base64: string): number {
	const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
	return Math.floor((base64.length * 3) / 4) - padding;
}

export const pendingBytes = (list: PendingImage[]): number =>
	list.reduce((sum, image) => sum + base64Bytes(image.base64), 0);

const fileName = (p: string) => p.slice(p.lastIndexOf('/') + 1);

/** The images whose file name still occurs in the text; removed ones are not committed. */
export function referenced(list: PendingImage[], body: string): PendingImage[] {
	return list.filter((image) => body.includes(fileName(image.path)));
}

function withSuffix(p: string, n: number): string {
	const dot = p.lastIndexOf('.');
	return dot > p.lastIndexOf('/') ? `${p.slice(0, dot)}-${n}${p.slice(dot)}` : `${p}-${n}`;
}

/** Renames an upload whose path is already pending in this session to name-2, name-3, ... */
export function uniqueImage<T extends { repoPath: string; markdownRef: string }>(
	list: PendingImage[],
	result: T
): T {
	const taken = new Set(list.map((i) => i.path));
	if (!taken.has(result.repoPath)) return result;
	let n = 2;
	while (taken.has(withSuffix(result.repoPath, n))) n++;
	return {
		...result,
		repoPath: withSuffix(result.repoPath, n),
		markdownRef: withSuffix(result.markdownRef, n)
	};
}

/** Adds an image, replacing an earlier one for the same repository path. */
export function addImage(list: PendingImage[], image: PendingImage): PendingImage[] {
	return [...list.filter((i) => i.path !== image.path), image];
}

/** Drops the images that were sent; images added while the save was running stay. */
export function withoutSent(list: PendingImage[], sent: PendingImage[]): PendingImage[] {
	return list.filter((i) => !sent.some((s) => s.path === i.path && s.base64 === i.base64));
}
