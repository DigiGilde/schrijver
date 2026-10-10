/* Safe for the browser: the panel, the new-page form and the endpoint use the same values. */

export const AI_NOTICE =
	'Suggesties komen van een AI-taalmodel (VLAM). Je tekst gaat daarvoor naar VLAM: zet er geen persoonsgegevens of vertrouwelijke informatie in. Controleer elke suggestie zelf.';

export const OUTLINE_DESCRIPTION_MAX = 2000;

const OUTLINE_TITLE_MAX = 120;

/** The title on one line, cut by code point so an emoji is not split in two. */
export function outlineTitle(raw: string): string {
	return [...raw.replace(/\s+/g, ' ').trim()].slice(0, OUTLINE_TITLE_MAX).join('').trimEnd();
}
