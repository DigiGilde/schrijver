<script lang="ts">
	import { tick } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import Diff from '$lib/components/Diff.svelte';
	import Pagina from '$lib/components/Pagina.svelte';
	import { markdownToHtml, previewImages } from '$lib/content/markdown-preview';
	import type { ConversationItem } from '$lib/forge/conversation';
	import { STEPS, momentText, type Action } from '$lib/forge/status';

	let { data } = $props();

	type Melding = { variant: 'success' | 'warning' | 'critical'; text: string; detail?: string };

	const ALS: Record<ConversationItem['as'], string> = {
		schrijver: 'Schrijver van dit voorstel',
		redactie: 'Redactie',
		github: 'Op GitHub',
		app: 'Automatisch bericht'
	};
	/* How someone signed comes from Schrijver, never from the name: a name can look like anything. */
	const ONDERTEKEND: Record<NonNullable<ConversationItem['signer']>, string> = {
		anoniem: 'anoniem',
		gekoppeld: 'gekoppeld aan GitHub',
		'op-naam': 'op naam'
	};

	let busy = $state(false);
	let melding = $state<Melding | null>(null);
	/* One persistent live region: a banner inserted together with its text is not reliably announced. */
	let status = $state('');
	let zin = $state<HTMLElement>();
	let veld = $state<HTMLElement>();
	let reactie = $state('');
	let soort = $state<'reactie' | 'aanpassing'>('reactie');
	let fout = $state<string | null>(null);
	let weergave = $state<Record<string, string>>({});
	let lijst = $state<HTMLElement>();

	const items = $derived(data.gesprek?.items ?? []);

	/*
	 * Rendered in the browser: the sanitiser needs a DOM. Until then the text shows as it is. Its
	 * headings come below the h2 of Gesprek.
	 */
	$effect(() => {
		weergave = Object.fromEntries(
			items.map((item) => [item.id, markdownToHtml(item.text, undefined, undefined, 2)])
		);
	});

	$effect(() => {
		void weergave;
		if (lijst) inNieuwTabblad(lijst);
	});

	/* A link in a reaction must not replace the page, where a reaction may be half written. */
	function inNieuwTabblad(root: HTMLElement) {
		for (const link of root.querySelectorAll<HTMLAnchorElement>(
			'.reactie a[href]:not([href^="#"]):not([target])'
		)) {
			link.target = '_blank';
			link.rel = 'noopener noreferrer';
			const melding = document.createElement('span');
			melding.className = 'sr-only';
			melding.textContent = ' (opent in nieuw tabblad)';
			link.append(melding);
		}
	}

	async function stuur(actie: string, gelukt: string, body: unknown = {}): Promise<boolean> {
		if (busy) return false;
		busy = true;
		melding = null;
		status = 'Bezig';
		let ok = false;
		try {
			const res = await fetch(
				`/api/sites/${data.site.id}/voorstellen/${data.proposal.number}/${actie}`,
				{
					method: 'POST',
					headers: { 'content-type': 'application/json', 'X-Requested-With': 'Schrijver' },
					body: JSON.stringify(body)
				}
			);
			const result = await res.json().catch(() => null);
			if (res.ok && result?.ok) {
				ok = true;
				// A warning may come with its own message: then what happened is not what was asked.
				melding = result.warning
					? { variant: 'warning', text: result.message ?? gelukt, detail: result.warning }
					: { variant: 'success', text: gelukt };
				await invalidateAll();
			} else {
				melding = {
					variant: 'critical',
					text: result?.message ?? 'De actie is mislukt',
					detail: result?.detail
				};
			}
		} catch (e) {
			melding = {
				variant: 'critical',
				text: 'De actie is mislukt: geen verbinding',
				detail: String(e)
			};
		} finally {
			busy = false;
			status = melding?.text ?? '';
		}
		return ok;
	}

	/* The buttons of a step disappear once it is taken: the focus goes to what is expected now. */
	async function zet(actie: string, gelukt: string, body: unknown = {}) {
		if (await stuur(actie, gelukt, body)) {
			await tick();
			zin?.focus();
		}
	}

	async function vraagOmAanpassing() {
		soort = 'aanpassing';
		fout = null;
		await tick();
		veld?.focus();
		status = 'Je reactie wordt een vraag om aanpassing. Schrijf wat er anders moet.';
	}

	async function terugNaarReactie(event: Event) {
		event.preventDefault();
		soort = 'reactie';
		fout = null;
		await tick();
		veld?.focus();
		status = 'Je reactie is weer een gewone reactie.';
	}

	async function plaats(event: SubmitEvent) {
		event.preventDefault();
		const aanpassing = soort === 'aanpassing';
		fout = reactie.trim()
			? null
			: aanpassing
				? 'Schrijf eerst wat er anders moet'
				: 'Schrijf eerst je reactie';
		if (fout) {
			status = fout;
			await tick();
			veld?.focus();
			return;
		}
		const gelukt = aanpassing
			? await stuur('aanpassing', 'Je vraag om aanpassing is geplaatst', { body: reactie })
			: await stuur('opmerking', 'Je reactie is geplaatst', { body: reactie });
		if (!gelukt) return;
		reactie = '';
		soort = 'reactie';
		if (aanpassing) {
			await tick();
			zin?.focus();
		}
	}

	const appearance = (actie: Action) => (actie === data.watNu.primary ? 'primary' : 'secondary');

	const images = (page: string) => ({
		before: previewImages({
			siteId: data.site.id,
			page,
			ref: null,
			voorstel: data.proposal.number,
			kant: 'voor',
			pending: []
		}),
		after: previewImages({
			siteId: data.site.id,
			page,
			ref: null,
			voorstel: data.proposal.number,
			pending: []
		})
	});
</script>

<svelte:head><title>{data.proposal.title} · {data.site.naam} · Schrijver</title></svelte:head>

{#snippet knop(actie: Action)}
	{#if actie === 'insturen'}
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<nldd-button
			appearance={appearance(actie)}
			text="Stuur in"
			loading={busy || undefined}
			onclick={() => zet('insturen', 'Het voorstel is ingestuurd')}
		></nldd-button>
	{:else if actie === 'verder-bewerken' && data.verderBewerken.length === 1}
		<nldd-button
			appearance={appearance(actie)}
			start-icon="pencil"
			text="Verder bewerken"
			href={data.verderBewerken[0].href}
		></nldd-button>
	{:else if actie === 'verder-bewerken'}
		<nldd-button
			appearance={appearance(actie)}
			start-icon="pencil"
			text="Verder bewerken"
			expandable
		>
			<nldd-menu slot="popup">
				{#each data.verderBewerken as link (link.page)}
					<nldd-menu-item text={link.titel} href={link.href}></nldd-menu-item>
				{/each}
			</nldd-menu>
		</nldd-button>
	{:else if actie === 'pagina-opnieuw-bewerken' && data.opnieuwBewerken.length === 1}
		<nldd-button
			appearance={appearance(actie)}
			start-icon="pencil"
			text="Pagina opnieuw bewerken"
			href={data.opnieuwBewerken[0].href}
		></nldd-button>
	{:else if actie === 'pagina-opnieuw-bewerken'}
		<nldd-button
			appearance={appearance(actie)}
			start-icon="pencil"
			text="Pagina opnieuw bewerken"
			expandable
		>
			<nldd-menu slot="popup">
				{#each data.opnieuwBewerken as link (link.page)}
					<nldd-menu-item text={link.titel} href={link.href}></nldd-menu-item>
				{/each}
			</nldd-menu>
		</nldd-button>
	{:else if actie === 'opnieuw-insturen'}
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<nldd-button
			appearance={appearance(actie)}
			text="Stuur opnieuw in"
			loading={busy || undefined}
			onclick={() => zet('opnieuw-insturen', 'Het voorstel is opnieuw ingestuurd')}
		></nldd-button>
	{:else if actie === 'samenvoegen'}
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<nldd-button
			appearance={appearance(actie)}
			text="Voeg samen"
			loading={busy || undefined}
			onclick={() => zet('mergen', 'Het voorstel is samengevoegd', { sha: data.headSha })}
		></nldd-button>
	{:else if actie === 'vraag-om-aanpassing'}
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<nldd-button appearance={appearance(actie)} text="Aanpassing vragen" onclick={vraagOmAanpassing}
		></nldd-button>
	{:else if actie === 'goedkeuren-op-github'}
		<nldd-button
			appearance={appearance(actie)}
			text="Goedkeuren op GitHub"
			href="{data.githubUrl}/files"
			target="_blank"
		></nldd-button>
	{:else if actie === 'beoordelen-op-github'}
		<nldd-button
			appearance={appearance(actie)}
			text="Beoordelen op GitHub"
			href="{data.githubUrl}/files"
			target="_blank"
		></nldd-button>
	{:else if actie === 'bekijk-de-site' && data.site.adres}
		<nldd-button
			appearance={appearance(actie)}
			text="Site bekijken"
			href={data.site.adres}
			target="_blank"
		></nldd-button>
	{/if}
{/snippet}

<Pagina
	titel={data.proposal.title}
	ondertitel={data.ondertitel}
	terug={{ href: data.terug, tekst: data.site.naam }}
>
	<nldd-container gap="16">
		<nldd-box>
			<nldd-container padding="24" sm-padding="16" gap="16">
				{#if data.stap}
					<nldd-step-bar accessible-label="Voortgang van dit voorstel">
						{#each STEPS as naam (naam)}
							<nldd-step-bar-item text={naam} status={naam === data.stap ? 'current' : undefined}
							></nldd-step-bar-item>
						{/each}
					</nldd-step-bar>
				{/if}
				<nldd-text class="zin" tabindex="-1" bind:this={zin}>{data.watNu.sentence}</nldd-text>
				{#if data.watNu.actions.length > 0 || data.voorbeeld?.stand === 'klaar'}
					<nldd-button-group>
						{#each data.watNu.actions as actie (actie)}
							{@render knop(actie)}
						{/each}
						{#if data.voorbeeld?.stand === 'klaar'}
							<nldd-button
								appearance="secondary"
								text="Voorbeeldsite bekijken"
								href={data.voorbeeld.url}
								target="_blank"
							></nldd-button>
						{/if}
					</nldd-button-group>
				{/if}
				{#if data.voorbeeld?.stand === 'bezig'}
					<nldd-text color="secondary">De voorbeeldsite wordt gebouwd</nldd-text>
				{:else if data.voorbeeld?.stand === 'mislukt'}
					<nldd-text color="secondary">De voorbeeldsite is niet gelukt</nldd-text>
				{/if}
				<nldd-link href="/help#voorstellen" size="sm" text="Uitleg over voorstellen"></nldd-link>
			</nldd-container>
		</nldd-box>

		<p class="sr-only" role="status">{status}</p>

		{#if melding}
			<nldd-banner variant={melding.variant} text={melding.text}>
				{#if melding.detail && melding.variant === 'critical'}
					<details>
						<summary>Technische details van GitHub</summary>
						<pre>{melding.detail}</pre>
					</details>
				{:else if melding.detail}
					<nldd-text>{melding.detail}</nldd-text>
				{/if}
			</nldd-banner>
		{/if}
	</nldd-container>

	{#snippet vervolg()}
		<nldd-simple-section>
			<nldd-title slot="header" size="3" heading-level="2" text="Wat er verandert"></nldd-title>
			<nldd-container gap="32">
				{#if data.fromFork}
					<nldd-text>
						De wijzigingen van dit voorstel staan buiten de repository van de site.
						<nldd-link
							href="{data.githubUrl}/files"
							target="_blank"
							text="Wijzigingen bekijken op GitHub"
						></nldd-link>
					</nldd-text>
				{:else if data.diffs.length === 0 && data.andereBestanden.length === 0}
					<nldd-text>Dit voorstel wijzigt geen pagina's.</nldd-text>
				{/if}
				{#each data.diffs as d (d.path)}
					<Diff
						path={d.path}
						titel={d.titel}
						before={d.before}
						after={d.after}
						source={d.source}
						status={d.status}
						teGroot={d.teGroot}
						githubUrl="{data.githubUrl}/files"
						images={images(d.path)}
					/>
				{/each}
				{#if data.nietVergeleken > 0}
					<nldd-text>
						{data.nietVergeleken === 1
							? 'Nog 1 pagina is hier niet vergeleken.'
							: `Nog ${data.nietVergeleken} pagina's zijn hier niet vergeleken.`}
						<nldd-link
							href="{data.githubUrl}/files"
							target="_blank"
							text="Pagina's bekijken op GitHub"
						></nldd-link>
					</nldd-text>
				{/if}
				{#if data.andereBestanden.length > 0}
					<nldd-text class="bestanden"
						>{data.diffs.length > 0 || data.fromFork ? 'Ook in dit voorstel' : 'In dit voorstel'}:
						{#each data.andereBestanden as f, i (i)}{i > 0 ? ', ' : ''}{f.soort}
							<nldd-link href="{data.githubUrl}/files" target="_blank" text={f.naam}></nldd-link>
							{f.status}{/each}{#if data.nogMeerBestanden > 0}, en nog {data.nogMeerBestanden}
							{data.nogMeerBestanden === 1 ? 'bestand' : 'bestanden'}{/if}.</nldd-text
					>
				{/if}
			</nldd-container>
		</nldd-simple-section>

		<nldd-simple-section>
			<nldd-title slot="header" size="3" heading-level="2" text="Gesprek"></nldd-title>
			<nldd-container gap="24">
				{#if data.gesprek === null}
					<nldd-text>
						Het gesprek kon niet worden geladen.
						<nldd-link href={data.githubUrl} target="_blank" text="Gesprek bekijken op GitHub"
						></nldd-link>
					</nldd-text>
				{:else if items.length === 0}
					<nldd-text color="secondary">Nog geen reacties.</nldd-text>
				{:else}
					<ol class="gesprek" bind:this={lijst}>
						{#each items as item (item.id)}
							<li>
								<nldd-container gap="8">
									<nldd-identity text={item.who}>
										<span slot="supporting-text"
											>{ALS[item.as]}{item.signer ? ` · ${ONDERTEKEND[item.signer]}` : ''} ·
											<time datetime={item.at}>{momentText(item.at)}</time></span
										>
									</nldd-identity>
									{#if item.verdict}
										<nldd-text weight="bold">{item.verdict}</nldd-text>
									{/if}
									{#if item.text && weergave[item.id]}
										<nldd-rich-text class="reactie" spacing="tight"
											>{@html weergave[item.id]}</nldd-rich-text
										>
									{:else if item.text}
										<nldd-text class="ruw">{item.text}</nldd-text>
									{/if}
									{#if item.url}
										<nldd-link
											href={item.url}
											target="_blank"
											size="sm"
											text={item.text.endsWith('…')
												? 'Rest van de reactie bekijken op GitHub'
												: 'Reactie bekijken op GitHub'}
										></nldd-link>
									{/if}
								</nldd-container>
							</li>
						{/each}
					</ol>
					{#if !data.gesprek.volledig}
						<nldd-text>
							Het gesprek is langer dan Schrijver hier toont.
							<nldd-link href={data.githubUrl} target="_blank" text="Gesprek bekijken op GitHub"
							></nldd-link>
						</nldd-text>
					{/if}
				{/if}

				{#if data.kanReageren}
					<nldd-form>
						<form id="reactie" onsubmit={plaats}>
							<nldd-form-field label="Je reactie">
								<nldd-multi-line-text-field
									bind:this={veld}
									rows="4"
									maxlength="5000"
									value={reactie}
									invalid={fout !== null || undefined}
									oninput={(e: Event) => {
										reactie = (e.currentTarget as HTMLInputElement).value;
										fout = null;
									}}
								></nldd-multi-line-text-field>
								{#if fout}
									<nldd-form-field-help-text>{fout}</nldd-form-field-help-text>
								{/if}
								{#if soort === 'aanpassing'}
									<nldd-form-field-help-text>
										{#if !fout}
											Schrijf wat er anders moet. De schrijver leest het hier en past het voorstel
											aan.
										{/if}
										<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
										<nldd-link
											href="#reactie"
											text="Maak er een gewone reactie van"
											onclick={terugNaarReactie}
										></nldd-link>
									</nldd-form-field-help-text>
								{/if}
							</nldd-form-field>
							<nldd-form-actions>
								<nldd-button-group>
									<nldd-button
										appearance={soort === 'aanpassing' ? 'primary' : 'secondary'}
										type="submit"
										text={soort === 'aanpassing' ? 'Vraag om aanpassing' : 'Plaats reactie'}
										loading={busy || undefined}
									></nldd-button>
								</nldd-button-group>
							</nldd-form-actions>
						</form>
					</nldd-form>
				{/if}

				<nldd-link
					href={data.githubUrl}
					target="_blank"
					size="sm"
					text="Voorstel bekijken op GitHub"
				></nldd-link>
			</nldd-container>
		</nldd-simple-section>
	{/snippet}
</Pagina>

<style>
	pre {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.sr-only,
	.reactie :global(.sr-only) {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	.gesprek {
		display: grid;
		gap: 24px;
		margin: 0;
		padding: 0;
		list-style: none;
	}
	.ruw {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.bestanden {
		overflow-wrap: anywhere;
	}
</style>
