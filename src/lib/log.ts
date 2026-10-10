type Fields = Record<string, unknown>;
const write = (level: 'info' | 'warn' | 'error', event: string, fields: Fields = {}) =>
	process.stdout.write(
		JSON.stringify({ t: new Date().toISOString(), level, event, ...fields }) + '\n'
	);
export const log = {
	info: (e: string, f?: Fields) => write('info', e, f),
	warn: (e: string, f?: Fields) => write('warn', e, f),
	error: (e: string, f?: Fields) => write('error', e, f)
};

/** What may be logged about an error: its kind and status, never its message (it can carry request data). */
export function errorFields(err: unknown): Fields {
	if (!(err instanceof Error)) return { error: typeof err };
	const { code, status } = err as { code?: unknown; status?: unknown };
	return {
		error: err.name,
		...(typeof code === 'string' ? { code } : {}),
		...(typeof status === 'number' ? { status } : {})
	};
}
