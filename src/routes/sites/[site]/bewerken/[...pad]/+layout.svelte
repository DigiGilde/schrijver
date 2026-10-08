<script lang="ts">
	import { page } from '$app/state';

	let { children } = $props();
</script>

<!--
	SvelteKit keeps the page component when only the file changes, and an editing session belongs to one
	file on one branch. Keyed on load data, not the URL: the replaceState after the first save keeps it.
-->
{#key `${page.data.site?.id}/${page.data.repoPath}@${page.data.branch ?? ''}`}
	{@render children()}
{/key}
