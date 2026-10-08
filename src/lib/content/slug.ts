export function slugify(title: string, maxLength = Infinity): string {
	const slug = title
		.normalize('NFD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	if (slug.length <= maxLength) return slug;
	// A hyphen just past the limit means the cut falls between two words.
	const head = slug.slice(0, maxLength + 1);
	const hyphen = head.lastIndexOf('-');
	return hyphen === -1 ? slug.slice(0, maxLength) : head.slice(0, hyphen);
}
