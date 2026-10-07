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
