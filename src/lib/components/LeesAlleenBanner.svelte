<script lang="ts">
	let { readOnly }: { readOnly: { reason: string; message: string; githubUrl: string } } = $props();

	const tekst = {
		toml: 'Deze pagina gebruikt TOML-frontmatter, dat Schrijver nog niet ondersteunt.',
		'yaml-error':
			'De frontmatter van deze pagina bevat een fout en kan niet veilig worden bewerkt.',
		unterminated: 'De frontmatter van deze pagina is niet afgesloten met ---.'
	};
</script>

<nldd-banner
	variant="warning"
	text="Deze pagina kan niet in Schrijver worden bewerkt"
	supporting-text={`${tekst[readOnly.reason as keyof typeof tekst] ?? 'De frontmatter van deze pagina kan niet worden gelezen.'} Je kunt het bestand wel bekijken en bewerken op GitHub.`}
>
	<nldd-text color="secondary" size="sm">{readOnly.message}</nldd-text>
	<nldd-button
		slot="actions"
		appearance="secondary"
		text="Open op GitHub"
		href={readOnly.githubUrl}
		target="_blank"
	></nldd-button>
</nldd-banner>
