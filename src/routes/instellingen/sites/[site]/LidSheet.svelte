<script lang="ts">
	import { enhance } from '$app/forms';
	import type { Visibility } from '$lib/auth/team';
	import { pageReady } from '$lib/client/page-ready.svelte';
	import type { PageData } from './$types';

	type Lid = PageData['leden'][number];
	type Props = {
		/** The name of the site, as its settings have it. */
		site: string;
		/** Who sees the site now. */
		zichtbaarheid: Visibility;
		/** Whether its repository is public, as Schrijver last read it. */
		openbaar: boolean | null;
		/** After a removal the member's row is gone; the page puts the focus elsewhere. */
		onverwijderd: () => void;
	};
	let { site, zichtbaarheid, openbaar, onverwijderd }: Props = $props();

	/* The sheet holds a title bar with a collapse anchor. */
	const pagina = pageReady();

	let lid = $state<Lid | null>(null);
	let open = $state(false);
	let ronde = $state(0);
	let fout = $state<string | null>(null);
	let bewaren = $state(false);
	let weghalen = $state(false);
	let bevestigen = $state(false);
	let verwijderd = false;
	let verwijderForm: HTMLFormElement | undefined = $state();

	const naam = $derived(lid ? (lid.naam ?? lid.email ?? 'Naam onbekend') : '');
	const datum = new Intl.DateTimeFormat('nl-NL', {
		day: 'numeric',
		month: 'long',
		year: 'numeric',
		timeZone: 'Europe/Amsterdam'
	});
	const over = $derived(
		lid
			? [lid.naam ? lid.email : null, `in het team sinds ${datum.format(new Date(lid.sinds))}`]
					.filter(Boolean)
					.join(' · ')
			: ''
	);

	/** Opens the sheet for this member, with their current role and no old message. */
	export function toon(gekozen: Lid) {
		lid = gekozen;
		fout = null;
		verwijderd = false;
		ronde += 1;
		open = true;
	}

	function gesloten() {
		open = false;
		if (verwijderd) {
			verwijderd = false;
			onverwijderd();
		}
	}

	/** What leaving the team means for this member, on this site. */
	const gevolg = $derived.by(() => {
		if (!lid) return '';
		const jij = lid.jij;
		if (zichtbaarheid === 'team') {
			const ziet = jij ? `Je ziet ${site} dan niet meer` : `${naam} ziet ${site} dan niet meer`;
			if (openbaar !== false) return `${ziet} in Schrijver.`;
			return `${ziet} in Schrijver, tenzij ${jij ? 'je' : 'die'} de repository op GitHub mag lezen.`;
		}
		if (lid.rol === 'bijdrager') {
			return `${jij ? 'Je kunt' : `${naam} kan`} dan nog steeds voorstellen maken, zoals iedereen die inlogt.`;
		}
		return jij
			? `Je beslist dan niet meer over voorstellen van ${site}, tenzij je schrijfrechten hebt op de repository op GitHub.`
			: `${naam} beslist dan niet meer over voorstellen van ${site}, tenzij die schrijfrechten heeft op de repository op GitHub.`;
	});

	function haalWeg() {
		bevestigen = false;
		verwijderForm?.requestSubmit();
	}

	/** A sheet belongs in the document root, outside the panes of the application shell. */
	function naarDocument(node: HTMLElement) {
		document.body.append(node);
		return () => node.remove();
	}
</script>

{#if pagina.ready}
	<nldd-sheet
		placement="right"
		width="480px"
		open={open || undefined}
		onclose={gesloten}
		{@attach naarDocument}
	>
		<nldd-page>
			<nldd-top-title-bar
				slot="header"
				text={naam}
				dismiss-text="Annuleer"
				collapse-anchor="lid-titel"
			></nldd-top-title-bar>
			<nldd-simple-section>
				<nldd-title
					id="lid-titel"
					slot="header"
					size="2"
					heading-level="1"
					text={naam}
					supporting-text={over}
				></nldd-title>
				<nldd-container gap="32">
					<p class="sr-only" role="status">{fout ?? ''}</p>
					{#if fout}
						<nldd-banner variant="critical" text={fout}></nldd-banner>
					{/if}
					{#if lid}
						{#key ronde}
							<nldd-form>
								<form
									method="post"
									action="?/rol"
									use:enhance={() => {
										bewaren = true;
										fout = null;
										return async ({ result, update }) => {
											await update({ reset: false });
											bewaren = false;
											if (result.type === 'success') open = false;
											else if (result.type === 'failure') {
												fout = String(result.data?.fout ?? 'Dat is niet gelukt.');
											}
										};
									}}
								>
									<input type="hidden" name="sleutel" value={lid.sleutel} />
									<nldd-form-field label="Rol">
										<nldd-radio-button-group name="rol" required>
											<nldd-radio-button-field
												value="bijdrager"
												label="Bijdrager: maakt voorstellen, beslist er niet over"
												checked={lid.rol === 'bijdrager' || undefined}
											></nldd-radio-button-field>
											<nldd-radio-button-field
												value="redactie"
												label="Redactie: beslist over voorstellen"
												checked={lid.rol === 'redactie' || undefined}
											></nldd-radio-button-field>
											<nldd-radio-button-field
												value="beheerder"
												label="Beheerder: beslist over voorstellen en beheert het team en de instellingen"
												checked={lid.rol === 'beheerder' || undefined}
											></nldd-radio-button-field>
										</nldd-radio-button-group>
										{#if zichtbaarheid === 'iedereen'}
											<nldd-form-field-help-text
												>Op deze site kan iedereen die inlogt al voorstellen maken.</nldd-form-field-help-text
											>
										{/if}
									</nldd-form-field>
									<nldd-form-actions>
										<nldd-button-group>
											<nldd-button
												appearance="primary"
												type="submit"
												text="Bewaar"
												loading={bewaren || undefined}
											></nldd-button>
										</nldd-button-group>
									</nldd-form-actions>
								</form>
							</nldd-form>

							<nldd-box background="critical">
								<nldd-container padding="16" gap="8">
									<nldd-title size="5" heading-level="2" text="Uit het team halen"></nldd-title>
									<nldd-rich-text>
										<p>{gevolg}</p>
									</nldd-rich-text>
									<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
									<nldd-button
										appearance="destructive"
										text="Haal uit het team"
										loading={weghalen || undefined}
										onclick={() => (bevestigen = true)}
									></nldd-button>
								</nldd-container>
							</nldd-box>
							<form
								method="post"
								action="?/verwijderen"
								hidden
								bind:this={verwijderForm}
								use:enhance={() => {
									weghalen = true;
									fout = null;
									return async ({ result, update }) => {
										await update({ reset: false });
										weghalen = false;
										if (result.type === 'success') {
											verwijderd = true;
											open = false;
										} else if (result.type === 'failure') {
											fout = String(result.data?.fout ?? 'Dat is niet gelukt.');
										}
									};
								}}
							>
								<input type="hidden" name="sleutel" value={lid.sleutel} />
							</form>
						{/key}
					{/if}
				</nldd-container>
			</nldd-simple-section>
		</nldd-page>
	</nldd-sheet>

	<nldd-modal-dialog
		variant="alert"
		text={lid?.jij ? 'Haal jezelf uit het team?' : `Haal ${naam} uit het team?`}
		supporting-text={lid?.jij
			? 'Een andere beheerder kan je later weer toevoegen.'
			: `Je kunt ${naam} later weer toevoegen.`}
		open={bevestigen || undefined}
		onclose={() => (bevestigen = false)}
		{@attach naarDocument}
	>
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<nldd-button
			slot="actions"
			appearance="primary"
			text="Houd in het team"
			onclick={() => (bevestigen = false)}
		></nldd-button>
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<nldd-button slot="actions" appearance="destructive" text="Haal uit het team" onclick={haalWeg}
		></nldd-button>
	</nldd-modal-dialog>
{/if}

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
