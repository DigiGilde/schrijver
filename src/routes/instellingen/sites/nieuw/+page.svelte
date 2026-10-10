<script lang="ts">
	import { enhance } from '$app/forms';
	import { afterNavigate } from '$app/navigation';
	import { tick } from 'svelte';
	import Pagina from '$lib/components/Pagina.svelte';
	import type { NewSiteField, NewSiteValues, Weigering } from './nieuwe-site';

	let { data, form } = $props();

	const DOCS = 'https://github.com/DigiGilde/schrijver/blob/main/docs/een-site-aansluiten.md';

	const resultaat = $derived(
		(form ?? null) as {
			weigering?: Weigering;
			fouten?: Partial<Record<NewSiteField, string>>;
			waarden?: NewSiteValues;
		} | null
	);
	const weigering = $derived(resultaat?.weigering ?? (data.stap === 1 ? data.weigering : null));
	const fouten = $derived(resultaat?.fouten ?? {});
	const waarden = $derived(resultaat?.waarden ?? (data.stap === 2 ? data.voorstel : null));

	/** Why the repository cannot become a site, in one sentence. */
	function zin(w: Weigering): string {
		switch (w.soort) {
			case 'vorm':
				return 'Een repository schrijf je als eigenaar/naam, zoals DigiGilde/handboek.';
			case 'niet-geinstalleerd':
				return `De Schrijver-app staat niet op ${w.repo}.`;
			case 'onbereikbaar':
				return 'Schrijver kon GitHub niet bereiken.';
			case 'al-aangesloten':
				return `${w.repo} hoort al bij de site ${w.site.naam}.`;
			case 'veranderd':
				return `${w.repo} is veranderd sinds de controle.`;
			case 'klopt-niet':
				return w.zonderMap
					? `${w.repo} heeft nog geen map .schrijver.`
					: `De structuur in .schrijver van ${w.repo} klopt niet.`;
		}
	}
	const kop = $derived(weigering ? zin(weigering) : '');
	const melding = $derived(
		kop ||
			(Object.keys(fouten).length > 0
				? 'Niet alles klopt. Kijk de velden met een melding na.'
				: data.stap === 2
					? `${data.repo} kan een site worden. Vul de gegevens van de site in.`
					: '')
	);

	let repoVeld: HTMLElement | undefined = $state();
	let uitleg: HTMLElement | undefined = $state();
	let stapKop: HTMLElement | undefined = $state();
	const voorbeeldId = $derived(data.stap === 2 ? data.voorstel.id : '');
	let formulier: HTMLFormElement | undefined = $state();
	let bezig = $state(false);
	let keuze = $state<'ik' | 'collega'>('ik');
	let zichtbaar = $state<'iedereen' | 'team'>('iedereen');
	$effect(() => {
		keuze = waarden?.beheerder ?? 'ik';
		zichtbaar = waarden?.zichtbaarheid ?? 'iedereen';
	});

	afterNavigate(async ({ type }) => {
		if (type !== 'form') return;
		await tick();
		if (data.stap === 2) stapKop?.focus();
		else if (weigering && weigering.soort !== 'vorm') uitleg?.focus();
		else repoVeld?.focus();
	});

	const gekozen = (event: Event) =>
		(keuze =
			(event as CustomEvent<{ value: string }>).detail.value === 'collega' ? 'collega' : 'ik');
	const gekozenZichtbaar = (event: Event) =>
		(zichtbaar =
			(event as CustomEvent<{ value: string }>).detail.value === 'team' ? 'team' : 'iedereen');
</script>

<svelte:head><title>Site toevoegen · Schrijver</title></svelte:head>

<Pagina titel="Site toevoegen" terug={{ href: '/instellingen', tekst: 'Instellingen' }}>
	<nldd-container gap="32">
		<nldd-step-bar accessible-label="Stappen van Site toevoegen">
			<nldd-step-bar-item
				text="Repository"
				status={data.stap === 1 ? 'current' : undefined}
				href={data.stap === 2 ? '/instellingen/sites/nieuw' : undefined}
			></nldd-step-bar-item>
			<nldd-step-bar-item
				text="Gegevens van de site"
				status={data.stap === 2 ? 'current' : undefined}
			></nldd-step-bar-item>
		</nldd-step-bar>

		<!-- One persistent live region: a banner inserted together with its text is not reliably announced. -->
		<p class="sr-only" role="status">{melding}</p>

		{#if weigering && weigering.soort !== 'vorm'}
			<div class="kop" tabindex="-1" bind:this={uitleg}>
				<nldd-container gap="12">
					<nldd-banner variant="critical" text={kop}></nldd-banner>
					<nldd-rich-text>
						{#if weigering.soort === 'niet-geinstalleerd'}
							<p>
								Of die repository bestaat niet. Installeer de Schrijver-app op de repository en kies
								daar deze repository. Controleer hem daarna hier opnieuw.
							</p>
							{#if weigering.installeren}
								<p><a href={weigering.installeren}>Schrijver-app installeren op GitHub</a></p>
							{/if}
						{:else if weigering.soort === 'onbereikbaar'}
							<p>Probeer het over een paar minuten opnieuw.</p>
						{:else if weigering.soort === 'al-aangesloten'}
							<p>
								Een repository hoort bij één site. Het team en de instellingen van die site regel je
								bij <a href="/instellingen/sites/{encodeURIComponent(weigering.site.id)}"
									>Beheer van {weigering.site.naam}</a
								>.
							</p>
						{:else if weigering.soort === 'veranderd'}
							<p>
								Onder deze naam staat nu een andere repository op GitHub. Kijk de gegevens hieronder
								opnieuw na.
							</p>
						{:else if weigering.soort === 'klopt-niet'}
							{#if !weigering.zonderMap}
								<ul>
									{#each weigering.fouten as fout, i (i)}
										<li>{fout}</li>
									{/each}
								</ul>
							{/if}
							<p>
								Wat er in .schrijver hoort, lees je in de uitleg op GitHub. De structuur wijzig je
								met een voorstel in de repository.
							</p>
							<p><a href={DOCS}>Uitleg over .schrijver bekijken op GitHub</a></p>
						{/if}
					</nldd-rich-text>
				</nldd-container>
			</div>
		{/if}

		{#if data.stap === 1}
			<nldd-text>
				Een site in Schrijver is een repository op GitHub met de map .schrijver erin. Schrijver
				kijkt of de Schrijver-app op de repository staat en of de structuur in .schrijver klopt.
			</nldd-text>
			<nldd-form>
				<form method="get" novalidate>
					<nldd-form-field label="Repository op GitHub">
						<nldd-text-field
							bind:this={repoVeld}
							name="repo"
							value={data.repo}
							autocomplete="off"
							no-spellcheck
							required
							invalid={weigering?.soort === 'vorm' || undefined}
						></nldd-text-field>
						{#if weigering?.soort === 'vorm'}
							<nldd-form-field-help-text>{kop}</nldd-form-field-help-text>
						{/if}
						<nldd-form-field-help-text
							>Eigenaar en naam, zoals DigiGilde/handboek.</nldd-form-field-help-text
						>
					</nldd-form-field>
					<nldd-form-actions>
						<nldd-button-group>
							<nldd-button appearance="primary" type="submit" text="Controleer repository"
							></nldd-button>
						</nldd-button-group>
					</nldd-form-actions>
				</form>
			</nldd-form>
		{:else if waarden}
			<nldd-container gap="8">
				<div class="kop" tabindex="-1" bind:this={stapKop}>
					<nldd-title size="3" heading-level="2" text="Gegevens van de site"></nldd-title>
				</div>
				<nldd-text>
					De Schrijver-app staat op {data.repo} en de structuur in .schrijver klopt. Schrijver werkt op
					de standaardbranch {data.branch}.
				</nldd-text>
			</nldd-container>
			<nldd-form>
				<form
					method="post"
					action="?repo={encodeURIComponent(data.repo)}&/toevoegen"
					novalidate
					bind:this={formulier}
					use:enhance={() => {
						bezig = true;
						return async ({ result, update }) => {
							await update({ reset: false });
							bezig = false;
							if (result.type === 'failure') {
								await tick();
								formulier?.querySelector<HTMLElement>('[invalid]')?.focus();
							}
						};
					}}
				>
					<input type="hidden" name="repo" value={data.repo} />
					<input type="hidden" name="repoId" value={data.repoId} />
					<nldd-form-field label="Naam in het adres">
						<nldd-text-field
							name="id"
							value={waarden.id}
							autocomplete="off"
							no-spellcheck
							required
							maxlength={50}
							invalid={fouten.id ? true : undefined}
						></nldd-text-field>
						{#if fouten.id}
							<nldd-form-field-help-text>{fouten.id}</nldd-form-field-help-text>
						{/if}
						<nldd-form-field-help-text
							>Staat in de adressen van Schrijver, zoals /sites/{voorbeeldId}. Kleine letters,
							cijfers en streepjes.</nldd-form-field-help-text
						>
					</nldd-form-field>
					<nldd-form-field label="Naam">
						<nldd-text-field
							name="naam"
							value={waarden.naam}
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
							value={waarden.omschrijving}
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
							value={waarden.adres}
							invalid={fouten.adres ? true : undefined}
						></nldd-text-field>
						{#if fouten.adres}
							<nldd-form-field-help-text>{fouten.adres}</nldd-form-field-help-text>
						{/if}
						<nldd-form-field-help-text
							>Waar de site staat, zoals https://example.org.</nldd-form-field-help-text
						>
					</nldd-form-field>
					<nldd-form-field label="Zichtbaar voor">
						{#if data.stap === 2 && data.openbaar}
							<nldd-radio-button-group
								name="zichtbaarheid"
								required
								invalid={fouten.zichtbaarheid ? true : undefined}
								onchange={gekozenZichtbaar}
							>
								<nldd-radio-button-field
									value="iedereen"
									label="Iedereen die inlogt"
									checked={zichtbaar === 'iedereen' || undefined}
								></nldd-radio-button-field>
								<nldd-radio-button-field
									value="team"
									label="Alleen het team"
									checked={zichtbaar === 'team' || undefined}
								></nldd-radio-button-field>
							</nldd-radio-button-group>
							{#if fouten.zichtbaarheid}
								<nldd-form-field-help-text>{fouten.zichtbaarheid}</nldd-form-field-help-text>
							{/if}
							<nldd-form-field-help-text
								>Het team zijn de beheerders, de redactie en de bijdragers. Op GitHub blijft de
								repository openbaar.</nldd-form-field-help-text
							>
						{:else}
							<nldd-text>Alleen het team</nldd-text>
							<nldd-form-field-help-text
								>{data.repo} is niet openbaar op GitHub. Daarom ziet alleen het team de site, en wie de
								repository op GitHub mag lezen.</nldd-form-field-help-text
							>
						{/if}
					</nldd-form-field>
					<nldd-form-field label="Eerste beheerder">
						<nldd-radio-button-group name="beheerder" required onchange={gekozen}>
							<nldd-radio-button-field value="ik" label="Ik" checked={keuze === 'ik' || undefined}
							></nldd-radio-button-field>
							<nldd-radio-button-field
								value="collega"
								label="Een collega"
								checked={keuze === 'collega' || undefined}
							></nldd-radio-button-field>
						</nldd-radio-button-group>
						<nldd-form-field-help-text
							>De beheerder regelt het team en de instellingen van de site.{data.stap === 2 &&
							(!data.openbaar || zichtbaar === 'team')
								? ' Alleen het team ziet de site: de beheerder voegt de anderen toe.'
								: ''}</nldd-form-field-help-text
						>
					</nldd-form-field>
					{#if keuze === 'collega'}
						<nldd-form-field label="E-mailadres van je collega">
							<nldd-text-field
								name="email"
								type="email"
								value={waarden.email}
								autocomplete="off"
								no-spellcheck
								required
								invalid={fouten.email ? true : undefined}
							></nldd-text-field>
							{#if fouten.email}
								<nldd-form-field-help-text>{fouten.email}</nldd-form-field-help-text>
							{/if}
							<nldd-form-field-help-text
								>{!data.openbaar || zichtbaar === 'team'
									? 'Een collega die al eens heeft ingelogd bij Schrijver: die wordt meteen beheerder.'
									: 'Wie met dit adres inlogt, wordt beheerder.'} Schrijver stuurt geen e-mail: laat het
								je collega zelf weten.</nldd-form-field-help-text
							>
						</nldd-form-field>
					{/if}
					<nldd-text size="sm" color="secondary">
						Een site begint met samenvoegen in Schrijver aan, vier ogen aan en elke manier van
						ondertekenen. Dat wijzig je daarna bij Beheer van de site.
					</nldd-text>
					<nldd-form-actions>
						<nldd-button-group>
							<nldd-button
								appearance="primary"
								type="submit"
								text="Voeg site toe"
								loading={bezig || undefined}
							></nldd-button>
						</nldd-button-group>
					</nldd-form-actions>
				</form>
			</nldd-form>
		{/if}
	</nldd-container>
</Pagina>

<style>
	.kop:focus {
		outline: none;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>
