<script lang="ts">
	import type { FormField } from '$lib/content/schema-form';

	type Props = { fields: FormField[]; onchange: (fields: FormField[]) => void; disabled?: boolean };
	let { fields, onchange, disabled = false }: Props = $props();

	function set(index: number, value: unknown) {
		onchange(fields.map((field, i) => (i === index ? { ...field, value, error: null } : field)));
	}

	const detailValue = (event: Event) =>
		(event as CustomEvent<{ value?: unknown }>).detail?.value ??
		(event.target as HTMLInputElement).value;
	const asText = (value: unknown) =>
		Array.isArray(value) ? value.join(', ') : String(value ?? '');
	const asDate = (value: unknown) =>
		value instanceof Date ? value.toISOString().slice(0, 10) : asText(value);
	const toList = (value: unknown) =>
		String(value)
			.split(',')
			.map((part) => part.trim())
			.filter(Boolean);
	const label = (field: FormField) => field.def.label ?? field.key;
</script>

{#if fields.length > 0}
	<nldd-form>
		<form onsubmit={(event) => event.preventDefault()}>
			{#each fields as field, index (field.key)}
				{#if field.def.type === 'ja-nee'}
					<nldd-form-field>
						<nldd-checkbox-field
							label={label(field)}
							checked={field.value === true || undefined}
							invalid={field.error !== null || undefined}
							disabled={disabled || undefined}
							onchange={(event: Event) =>
								set(index, (event as CustomEvent<{ checked: boolean }>).detail.checked)}
						></nldd-checkbox-field>
						{#if field.def.hulp}
							<nldd-form-field-help-text>{field.def.hulp}</nldd-form-field-help-text>
						{/if}
						{#if field.error}
							<nldd-form-field-help-text>{field.error}</nldd-form-field-help-text>
						{/if}
					</nldd-form-field>
				{:else}
					<nldd-form-field
						label={label(field)}
						supporting-label={field.def.type === 'paginaverwijzing'
							? (field.def.hulp ??
								(field.def.meervoud
									? "Paden naar pagina's, gescheiden door komma's"
									: 'Pad naar een pagina, bijvoorbeeld kennis/privacy.md'))
							: field.def.hulp}
						optional={!field.def.verplicht || undefined}
					>
						{#if field.def.type === 'getal'}
							<nldd-number-field
								value={field.value === '' ? undefined : Number(field.value)}
								invalid={field.error !== null || undefined}
								disabled={disabled || undefined}
								oninput={(event: Event) => set(index, detailValue(event))}
							></nldd-number-field>
						{:else if field.def.type === 'datum'}
							<nldd-date-field
								value={asDate(field.value)}
								invalid={field.error !== null || undefined}
								disabled={disabled || undefined}
								oninput={(event: Event) => set(index, detailValue(event))}
							></nldd-date-field>
						{:else}
							<nldd-text-field
								value={asText(field.value)}
								invalid={field.error !== null || undefined}
								disabled={disabled || undefined}
								oninput={field.def.meervoud
									? undefined
									: (event: Event) => set(index, detailValue(event))}
								onchange={field.def.meervoud
									? (event: Event) => set(index, toList(detailValue(event)))
									: undefined}
							></nldd-text-field>
						{/if}
						{#if field.error}
							<nldd-form-field-help-text>{field.error}</nldd-form-field-help-text>
						{/if}
					</nldd-form-field>
				{/if}
			{/each}
		</form>
	</nldd-form>
{/if}
