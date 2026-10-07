export type PendingImage = { path: string; base64: string };

/** Adds an image, replacing an earlier one for the same repository path. */
export function addImage(list: PendingImage[], image: PendingImage): PendingImage[] {
	return [...list.filter((i) => i.path !== image.path), image];
}

/** Drops the images that were sent; images added while the save was running stay. */
export function withoutSent(list: PendingImage[], sent: PendingImage[]): PendingImage[] {
	return list.filter((i) => !sent.some((s) => s.path === i.path && s.base64 === i.base64));
}
