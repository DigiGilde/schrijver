<script lang="ts">
	let { readOnly }: { readOnly: { reason: string; message: string; githubUrl: string } } = $props();

	const tekst = {
		toml: 'De eigenschappen van deze pagina staan in TOML, dat Schrijver nog niet ondersteunt.',
		'yaml-error':
			'De eigenschappen van deze pagina bevatten een fout en kunnen niet veilig worden bewerkt.',
		unterminated: 'De eigenschappen van deze pagina zijn niet afgesloten met ---.'
	};
</script>

<nldd-banner
	variant="warning"
	text="Deze pagina kan niet in Schrijver worden bewerkt"
	supporting-text={`${tekst[readOnly.reason as keyof typeof tekst] ?? 'De eigenschappen van deze pagina kunnen niet worden gelezen.'} Je kunt het bestand wel bekijken en bewerken op GitHub.`}
>
	<nldd-text color="secondary" size="sm">{readOnly.message}</nldd-text>
	<nldd-button
		slot="actions"
		appearance="secondary"
		text="Bestand bekijken op GitHub"
		href={readOnly.githubUrl}
		target="_blank"
	></nldd-button>
</nldd-banner>
