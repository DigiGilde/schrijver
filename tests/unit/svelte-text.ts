import { parse } from 'svelte/compiler';

/** A value reads as text for a colleague when it has a space in it, or a capital first. */
const readsAsText = (value: string) => /\s/.test(value.trim()) || /^\p{Lu}/u.test(value.trim());

/** Type syntax holds no text; the wrappers around a value do. */
const TYPE_SYNTAX = /^TS(?!AsExpression$|SatisfiesExpression$|NonNullExpression$)/;

/**
 * Every string of a .svelte source that a colleague can read, from its syntax tree: the text of the
 * template, the text-like values of attributes, and the text-like strings of expressions and scripts.
 */
export function visibleStrings(source: string): string[] {
	const found: string[] = [];
	const add = (value: string) => {
		if (value.trim() && readsAsText(value)) found.push(value);
	};
	const visit = (node: unknown, key = ''): void => {
		if (Array.isArray(node)) return node.forEach((child) => visit(child, key));
		if (!node || typeof node !== 'object') return;
		const { type } = node as { type?: string };
		if (typeof type === 'string') {
			if (TYPE_SYNTAX.test(type) || type === 'ImportDeclaration') return;
			const tree = node as Record<string, unknown>;
			if (type === 'Text' && key !== 'value') {
				if (typeof tree.data === 'string' && tree.data.trim()) found.push(tree.data);
				return;
			}
			if (type === 'Text') return add(String(tree.data));
			if (type === 'Literal') {
				if (typeof tree.value === 'string') add(tree.value);
				return;
			}
			if (type === 'TemplateElement') {
				return add(String((tree.value as { cooked?: string }).cooked ?? ''));
			}
			if (type === 'Property' && !tree.computed) return visit(tree.value, 'value');
		}
		for (const [name, child] of Object.entries(node)) {
			if (['loc', 'start', 'end', 'css', 'comments'].includes(name)) continue;
			visit(child, name);
		}
	};
	visit(parse(source, { modern: true }));
	return found;
}
