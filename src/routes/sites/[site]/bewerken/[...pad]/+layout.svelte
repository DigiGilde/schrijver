<script lang="ts">
	import { page } from '$app/state';

	let { children } = $props();
</script>

<!--
	SvelteKit keeps the page component when only the file changes, and an editing session belongs to one
	file on one branch. Keyed on load data, not the URL: the first save moves to the proposal's address
	without loading, which keeps the key.
-->
{#key `${page.data.site?.id}/${page.data.repoPath}@${page.data.branch ?? ''}`}
	{@render children()}
{/key}
