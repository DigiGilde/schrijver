<script lang="ts">
	import { enhance } from '$app/forms';
	import { tick } from 'svelte';
	import type { PageData } from './$types';
	import type { Resultaat } from './forms';

	type Props = { instellingen: PageData['instellingen']; resultaat: Resultaat | null };
	let { instellingen, resultaat }: Props = $props();

	/* nldd-switch-field does not take part in the form; the hidden fields below carry its state. */
	// svelte-ignore state_referenced_locally
	let mergen = $state(instellingen.mergenVanuitSchrijver);
	// svelte-ignore state_referenced_locally
	let vierOgen = $state(instellingen.vierOgen);
	let bewaren = $state(false);
	let formulier: HTMLFormElement | undefined = $state();
	let bewaarKnop: HTMLElement | undefined = $state();

	const fouten = $derived(resultaat?.fouten ?? {});
	const mag = (kind: 'gekoppeld' | 'op-naam') =>
		instellingen.identiteitToegestaan.includes(kind) || undefined;
	const aan = (event: Event) => (event as CustomEvent<{ checked: boolean }>).detail.checked;
</script>

<nldd-container gap="16">
	<nldd-title size="3" heading-level="2" text="Instellingen van de site"></nldd-title>
	<!-- One persistent live region: a banner inserted together with its text is not reliably announced. -->
	<p class="sr-only" role="status">{resultaat?.fout ?? resultaat?.melding ?? ''}</p>
	{#if resultaat?.fout}
		<nldd-banner variant="critical" text={resultaat.fout}></nldd-banner>
	{:else if resultaat?.melding}
		<nldd-banner variant="success" text={resultaat.melding}></nldd-banner>
	{/if}
	<nldd-form>
		<form
			method="post"
			action="?/instellingen"
			novalidate
			bind:this={formulier}
			use:enhance={() => {
				bewaren = true;
				return async ({ result, update }) => {
					// On success update() moves the focus to the body: the button takes it back after it.
					await update({ reset: false });
					bewaren = false;
					if (result.type === 'success') {
						await tick();
						bewaarKnop?.focus();
					}
					if (result.type === 'failure') {
						await tick();
						formulier?.querySelector<HTMLElement>('[invalid]')?.focus();
					}
				};
			}}
		>
			<nldd-form-field label="Naam">
				<nldd-text-field
					name="naam"
					value={instellingen.naam}
					required
					maxlength={100}
					invalid={fouten.naam ? true : undefined}
				></nldd-text-field>
				{#if fouten.naam}
					<nldd-form-field-help-text>{fouten.naam}</nldd-form-field-help-text>
				{/if}
			</nldd-form-field>
			<nldd-form-field label="Omschrijving" optional>
				<nldd-multi-line-text-field
					name="omschrijving"
					value={instellingen.omschrijving}
					rows={2}
					maxlength={300}
					invalid={fouten.omschrijving ? true : undefined}
				></nldd-multi-line-text-field>
				{#if fouten.omschrijving}
					<nldd-form-field-help-text>{fouten.omschrijving}</nldd-form-field-help-text>
				{/if}
			</nldd-form-field>
			<nldd-form-field label="Adres" optional>
				<nldd-text-field
					name="adres"
					type="url"
					value={instellingen.adres}
					invalid={fouten.adres ? true : undefined}
				></nldd-text-field>
				{#if fouten.adres}
					<nldd-form-field-help-text>{fouten.adres}</nldd-form-field-help-text>
				{/if}
				<nldd-form-field-help-text
					>Waar de site staat, zoals https://example.org.</nldd-form-field-help-text
				>
			</nldd-form-field>
			<nldd-form-field>
				<nldd-switch-field
					label="Samenvoegen in Schrijver"
					checked={mergen || undefined}
					onchange={(event: Event) => (mergen = aan(event))}
				></nldd-switch-field>
				<nldd-form-field-help-text
					>Aan: de redactie voegt een voorstel samen in Schrijver. Uit: dat gebeurt op GitHub.</nldd-form-field-help-text
				>
			</nldd-form-field>
			<input type="hidden" name="mergen" value={mergen ? 'aan' : 'uit'} />
			<nldd-form-field>
				<nldd-switch-field
					label="Vier ogen"
					checked={vierOgen || undefined}
					onchange={(event: Event) => (vierOgen = aan(event))}
				></nldd-switch-field>
				<nldd-form-field-help-text
					>Niemand voegt een eigen voorstel samen, behalve beheerders.</nldd-form-field-help-text
				>
			</nldd-form-field>
			<input type="hidden" name="vierOgen" value={vierOgen ? 'aan' : 'uit'} />
			<nldd-form-section
				text="Ondertekenen"
				supporting-text="Anoniem kan altijd. Wat mag hier nog meer?"
			>
				<nldd-form-field>
					<nldd-checkbox-field
						name="ondertekenen"
						value="gekoppeld"
						label="Gekoppeld aan GitHub"
						checked={mag('gekoppeld')}
					></nldd-checkbox-field>
				</nldd-form-field>
				<nldd-form-field>
					<nldd-checkbox-field
						name="ondertekenen"
						value="op-naam"
						label="Op naam"
						checked={mag('op-naam')}
					></nldd-checkbox-field>
				</nldd-form-field>
			</nldd-form-section>
			<nldd-form-actions>
				<nldd-button-group>
					<nldd-button
						bind:this={bewaarKnop}
						appearance="primary"
						type="submit"
						text="Bewaar"
						loading={bewaren || undefined}
					></nldd-button>
				</nldd-button-group>
			</nldd-form-actions>
		</form>
	</nldd-form>
</nldd-container>

<style>
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
