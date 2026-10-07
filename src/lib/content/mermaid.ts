export interface MermaidBlock {
	start: number;
	end: number;
	hasAccDescr: boolean;
	hasAccTitle: boolean;
}

export const MERMAID_DESCR_MESSAGE = 'Elk Mermaid-diagram heeft een beschrijving (accDescr) nodig';

const OPEN = /^ {0,3}(`{3,})([^`]*)$/;
const CLOSE = /^ {0,3}(`{3,})\s*$/;
const MERMAID_INFO = /^mermaid(\s*\{.*\})?$/;
const ACC_DESCR = /^\s*accDescr\s*[:{]/;
const ACC_TITLE = /^\s*accTitle\s*[:{]/;

interface Fence {
	start: number;
	end: number;
	line: number;
	mermaid: boolean;
	content: string[];
}

// Scans every backtick fence, so mermaid text inside another fence is not reported.
function scanFences(body: string): Fence[] {
	const fences: Fence[] = [];
	let open: (Omit<Fence, 'end'> & { ticks: number }) | null = null;
	let pos = 0;
	let line = 0;
	for (;;) {
		const nl = body.indexOf('\n', pos);
		const lineEnd = nl === -1 ? body.length : nl;
		const text = body.slice(pos, lineEnd).replace(/\r$/, '');
		line++;
		if (open === null) {
			const m = OPEN.exec(text);
			if (m) {
				open = {
					start: pos,
					line,
					ticks: m[1].length,
					mermaid: MERMAID_INFO.test(m[2].trim()),
					content: []
				};
			}
		} else {
			const m = CLOSE.exec(text);
			if (m && m[1].length === open.ticks) {
				fences.push({ start: open.start, line: open.line, mermaid: open.mermaid, content: open.content, end: pos + text.length });
				open = null;
			} else {
				open.content.push(text);
			}
		}
		if (nl === -1) break;
		pos = nl + 1;
	}
	if (open !== null) {
		fences.push({ start: open.start, line: open.line, mermaid: open.mermaid, content: open.content, end: body.length });
	}
	return fences;
}

export function findMermaidBlocks(body: string): MermaidBlock[] {
	return scanFences(body)
		.filter((f) => f.mermaid)
		.map((f) => ({
			start: f.start,
			end: f.end,
			hasAccDescr: f.content.some((l) => ACC_DESCR.test(l)),
			hasAccTitle: f.content.some((l) => ACC_TITLE.test(l))
		}));
}

export function mermaidScaffold(): string {
	return '```mermaid\nflowchart LR\n  accTitle: Titel van het diagram\n  accDescr: Beschrijf hier in een zin wat het diagram laat zien\n  A[Start] --> B[Einde]\n```\n';
}

export function missingDescriptions(body: string): number[] {
	return scanFences(body)
		.filter((f) => f.mermaid && !f.content.some((l) => ACC_DESCR.test(l)))
		.map((f) => f.line);
}
