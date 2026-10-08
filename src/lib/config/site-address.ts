/** A site's public address as it reads in text: host and path, without scheme, query, fragment or closing slash. */
export function addressText(address: string): string {
	try {
		const url = new URL(address);
		return (url.host + url.pathname).replace(/\/$/, '');
	} catch {
		return address;
	}
}
