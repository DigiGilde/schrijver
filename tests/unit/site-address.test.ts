import { describe, expect, it } from 'vitest';
import { addressText } from '../../src/lib/config/site-address';

describe('addressText', () => {
	it('leaves the host and the path, without the scheme and the closing slash', () => {
		expect(addressText('https://digihandboek.rijks.app/')).toBe('digihandboek.rijks.app');
		expect(addressText('http://example.org/team/')).toBe('example.org/team');
		expect(addressText('https://example.org/a/b')).toBe('example.org/a/b');
	});

	it('drops a query and a fragment', () => {
		expect(addressText('https://example.org/team/?utm=1#top')).toBe('example.org/team');
		expect(addressText('https://example.org?utm=1')).toBe('example.org');
	});

	it('keeps a port that is not the default one', () => {
		expect(addressText('http://localhost:8080/site/')).toBe('localhost:8080/site');
	});

	it('gives back what is not an address as it is', () => {
		expect(addressText('geen adres')).toBe('geen adres');
	});
});
