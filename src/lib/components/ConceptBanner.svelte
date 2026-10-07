<script lang="ts">
	let {
		verouderd,
		onherstel,
		onweggooien
	}: { verouderd: boolean; onherstel: () => void; onweggooien: () => void } = $props();
</script>

<nldd-banner
	variant={verouderd ? 'warning' : 'accent'}
	text="Niet-opgeslagen concept gevonden"
	supporting-text={verouderd
		? 'De pagina is intussen gewijzigd; het concept is gebaseerd op een oudere versie'
		: undefined}
>
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<nldd-button slot="actions" appearance="primary" text="Herstellen" onclick={onherstel}
	></nldd-button>
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<nldd-button slot="actions" appearance="secondary" text="Weggooien" onclick={onweggooien}
	></nldd-button>
</nldd-banner>
