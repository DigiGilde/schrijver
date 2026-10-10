// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { markdownToHtml } from '../../src/lib/content/markdown-preview';

it('the default sanitiser works under a DOM and keeps nldd-code-viewer', () => {
	const html = markdownToHtml('```bash\nls\n```\n\n<img src=x onerror=alert(1)>');
	expect(html).toContain('<nldd-code-viewer language="bash">');
	expect(html).not.toContain('onerror');
});
