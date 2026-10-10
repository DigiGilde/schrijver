/** A site's public address as it reads in text: host and path, without scheme, query, fragment or closing slash. */
export function addressText(address: string): string {
	try {
		const url = new URL(address);
		return (url.host + url.pathname).replace(/\/$/, '');
	} catch {
		return address;
	}
}

/** Whether a value is an address on the web: http or https, with a host. */
export function isWebAddress(value: string): boolean {
	try {
		const url = new URL(value);
		return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname !== '';
	} catch {
		return false;
	}
}
