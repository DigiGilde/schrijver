import { onMount } from 'svelte';

/**
 * After server rendering the design system upgrades elements in definition order: a title bar
 * upgrades before its nldd-page, and one with a collapse anchor then finds no scroll target. Such a
 * bar is only rendered once `ready` is true, when nldd-page is defined.
 */
export function pageReady(): { readonly ready: boolean } {
	let ready = $state(false);
	onMount(() => {
		void customElements.whenDefined('nldd-page').then(() => (ready = true));
	});
	return {
		get ready() {
			return ready;
		}
	};
}
