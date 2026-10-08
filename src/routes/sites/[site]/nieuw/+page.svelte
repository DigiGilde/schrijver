<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import Pagina from '$lib/components/Pagina.svelte';
	import { AI_NOTICE, OUTLINE_DESCRIPTION_MAX } from '$lib/assistant/shared';
	import { readDraft, writeDraft } from '$lib/client/draft';
	import { draftKey, filePreview, startFrontmatter, startText, templateFor } from './new-page';

	let { data, form } = $props();

	// svelte-ignore state_referenced_locally
	let soort = $state(data.options[0].naam ?? '');
	// svelte-ignore state_referenced_locally
	let map = $state('');
	// svelte-ignore state_referenced_locally
	let titel = $state(form?.titel ?? '');
	let beschrijving = $state('');
	let beschrijvingLeeg = $state(false);
	let beschrijvingVeld: HTMLElement | undefined = $state();
	let opzet = $state<string | null>(null);
	let uitleg = $state('');
	let bezig = $state(false);
	let melding = $state('');
	let mislukt = $state(false);

	const option = $derived(data.options.find((o) => (o.naam ?? '') === soort) ?? data.options[0]);
	const gekozenMap = $derived(
		option.fixed ?? (option.folders.includes(map) ? map : (option.folders[0] ?? ''))
	);
	const bestand = $derived.by(() => {
		try {
			return (
				filePreview(data.schema, option.naam, gekozenMap, titel, data.today) ??
				'de naam komt uit de titel'
			);
		} catch {
			return null;
		}
	});

	async function maakOpzet() {
		if (bezig) return;
		const text = beschrijving.trim();
		if (!text) {
			beschrijvingLeeg = true;
			beschrijvingVeld?.focus();
			return;
		}
		bezig = true;
		mislukt = false;
		melding = 'Bezig met een opzet...';
		try {
			const res = await fetch('/api/assistent', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'Schrijver' },
				body: JSON.stringify({ siteId: data.site.id, action: 'opzet', text })
			});
			const result = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(result.message ?? 'De schrijfhulp is niet beschikbaar');
			titel = result.title;
			opzet = result.outline;
			uitleg = result.explanation;
			melding = 'Titel en opzet staan klaar. Controleer ze voordat je de pagina maakt.';
		} catch (e) {
			mislukt = true;
			melding = e instanceof Error ? e.message : 'De schrijfhulp is niet beschikbaar';
		} finally {
			bezig = false;
		}
	}

	/** Hands the outline to the editor as the page's unsaved draft in this browser. */
	function bewaarOpzet(location: string, outline: string): string | null {
		const doel = new URL(location, window.location.href);
		const begin = `/sites/${data.site.id}/bewerken/`;
		if (!doel.pathname.startsWith(begin)) return null;
		const path = doel.pathname.slice(begin.length).split('/').map(decodeURIComponent).join('/');
		const key = draftKey(data.site.id, path);
		if (readDraft(key)) {
			return 'Voor deze pagina staat al een niet-bewaard concept in deze browser. Kies een andere titel, of maak de opzet leeg om dat concept te openen.';
		}
		const title = doel.searchParams.get('titel') ?? '';
		writeDraft(key, {
			path,
			body: startText(templateFor(data.schema, doel.searchParams.get('soort')), title, outline),
			frontmatter: startFrontmatter(data.schema, title),
			at: Date.now(),
			sha: null,
			images: []
		});
		return readDraft(key)
			? null
			: 'De opzet kon niet in deze browser worden bewaard. Kopieer hem, of maak het veld leeg om zonder opzet verder te gaan.';
	}

	const verstuur: SubmitFunction = () => {
		return async ({ result, update }) => {
			if (result.type === 'redirect' && opzet?.trim()) {
				const probleem = bewaarOpzet(result.location, opzet);
				if (probleem) {
					mislukt = true;
					melding = probleem;
					return;
				}
			}
			await update();
		};
	};
</script>

<svelte:head><title>Nieuwe pagina · {data.site.naam} · Schrijver</title></svelte:head>

<Pagina titel="Nieuwe pagina" terug={{ href: `/sites/${data.site.id}`, tekst: data.site.naam }}>
	<nldd-container max-width="720px" gap="16">
		{#if form?.error}
			<nldd-banner variant="critical" text={form.error}></nldd-banner>
		{/if}

		<nldd-form>
			<form method="POST" use:enhance={verstuur}>
				{#if data.options[0].naam !== null}
					<nldd-form-field label="Soort">
						<nldd-dropdown>
							<select name="soort" bind:value={soort}>
								{#each data.options as o (o.naam)}
									<option value={o.naam}>{o.naam}</option>
								{/each}
							</select>
						</nldd-dropdown>
					</nldd-form-field>
				{/if}
				{#if option.fixed === null && option.folders.length > 0}
					<nldd-form-field label="Map">
						<nldd-dropdown>
							<!-- nldd-dropdown stops the select's change event and sends its own; input still bubbles. -->
							<select name="map" value={gekozenMap} oninput={(e) => (map = e.currentTarget.value)}>
								{#each option.folders as f (f)}
									<option value={f}>{f}</option>
								{/each}
							</select>
						</nldd-dropdown>
					</nldd-form-field>
				{:else if option.fixed !== null}
					<input type="hidden" name="map" value={option.fixed} />
				{/if}
				<nldd-form-field label="Titel">
					<nldd-text-field
						name="titel"
						required
						value={titel}
						invalid={form?.veld === 'titel' || undefined}
						oninput={(e: Event) => (titel = (e.target as HTMLInputElement).value)}
					></nldd-text-field>
					{#if form?.veld === 'titel'}
						<nldd-form-field-help-text>{form.error}</nldd-form-field-help-text>
					{/if}
					{#if bestand}
						<nldd-form-field-help-text>Bestand: {bestand}</nldd-form-field-help-text>
					{/if}
				</nldd-form-field>
				<nldd-form-field label="Of beschrijf wat je wilt schrijven" optional>
					<nldd-multi-line-text-field
						bind:this={beschrijvingVeld}
						rows={3}
						maxlength={OUTLINE_DESCRIPTION_MAX}
						value={beschrijving}
						invalid={beschrijvingLeeg || undefined}
						oninput={(e: Event) => {
							beschrijving = (e.target as HTMLTextAreaElement).value;
							beschrijvingLeeg = false;
						}}
					></nldd-multi-line-text-field>
					{#if beschrijvingLeeg}
						<nldd-form-field-help-text
							>Een beschrijving is nodig voor een opzet</nldd-form-field-help-text
						>
					{/if}
					<nldd-form-field-help-text>{AI_NOTICE}</nldd-form-field-help-text>
				</nldd-form-field>
				<nldd-container gap="8">
					<nldd-button-group>
						<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
						<nldd-button
							appearance="secondary"
							type="button"
							text="Maak een opzet"
							loading={bezig || undefined}
							onclick={maakOpzet}
						></nldd-button>
					</nldd-button-group>
					<nldd-text size="sm" color={mislukt ? 'critical' : 'secondary'} role="status"
						>{melding}</nldd-text
					>
				</nldd-container>
				{#if opzet !== null}
					<nldd-form-field label="Opzet">
						<nldd-multi-line-text-field
							rows={12}
							value={opzet}
							oninput={(e: Event) => (opzet = (e.target as HTMLTextAreaElement).value)}
						></nldd-multi-line-text-field>
						<nldd-form-field-help-text>{uitleg}</nldd-form-field-help-text>
					</nldd-form-field>
				{/if}
				{#if opzet?.trim()}
					<input type="hidden" name="opzet" value="1" />
				{/if}
				<nldd-form-actions>
					<nldd-button-group>
						<nldd-button appearance="primary" type="submit" text="Pagina maken"></nldd-button>
					</nldd-button-group>
				</nldd-form-actions>
			</form>
		</nldd-form>
	</nldd-container>
</Pagina>
