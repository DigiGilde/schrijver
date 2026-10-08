<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import Diff from '$lib/components/Diff.svelte';

	let { data } = $props();

	type Melding = { variant: 'success' | 'warning' | 'critical'; text: string; detail?: string };

	const STATUS: Record<string, { text: string; color: string }> = {
		concept: { text: 'Concept', color: 'neutral' },
		ingestuurd: { text: 'Ingestuurd', color: 'accent' },
		goedgekeurd: { text: 'Goedgekeurd', color: 'success' },
		'wijzigingen-gevraagd': { text: 'Wijzigingen gevraagd', color: 'warning' },
		samengevoegd: { text: 'Samengevoegd', color: 'success' },
		gesloten: { text: 'Gesloten', color: 'neutral' }
	};
	const BESTAND: Record<string, string> = {
		added: 'toegevoegd',
		modified: 'gewijzigd',
		removed: 'verwijderd'
	};
	const CHECKS: Record<string, string> = {
		none: 'Geen controles',
		pending: 'Het voorbeeld wordt gebouwd',
		success: 'Het voorbeeld is gebouwd',
		failure: 'Het bouwen van het voorbeeld is mislukt'
	};

	let busy = $state(false);
	let melding = $state<Melding | null>(null);
	let opmerking = $state('');
	let opmerkingFout = $state<string | null>(null);
	/* One persistent live region: a banner inserted together with its text is not reliably announced. */
	let status = $state('');

	async function stuur(actie: string, gelukt: string, body: unknown = {}) {
		if (busy) return;
		busy = true;
		melding = null;
		status = 'Bezig';
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
				melding = result.warning
					? { variant: 'warning', text: gelukt, detail: result.warning }
					: { variant: 'success', text: gelukt };
				if (actie === 'opmerking') opmerking = '';
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
	}
</script>

<svelte:head><title>{data.proposal.title} - Schrijver</title></svelte:head>

<nldd-simple-section>
	<nldd-container gap="24">
		<nldd-link
			href="/sites/{data.site.id}"
			start-icon="arrow-left"
			text="Terug naar {data.site.naam}"
		></nldd-link>

		<nldd-title size="1" heading-level="1" text={data.proposal.title}></nldd-title>

		<nldd-container layout="wrap" gap="12" vertical-alignment="center">
			<nldd-badge
				text={STATUS[data.proposal.status].text}
				color={STATUS[data.proposal.status].color}
			></nldd-badge>
			{#if data.viaGithub}<nldd-tag text="Via GitHub"></nldd-tag>{/if}
			<nldd-text color="secondary">{CHECKS[data.proposal.checks]}</nldd-text>
			{#if data.proposal.previewUrl}
				<nldd-link href={data.proposal.previewUrl} target="_blank" text="Bekijk het voorbeeld"
				></nldd-link>
			{/if}
			<nldd-link href={data.githubUrl} target="_blank" text="Bekijk op GitHub"></nldd-link>
		</nldd-container>

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

		{#if data.canSendIn || data.canMerge || data.verderBewerken.length > 0}
			<section aria-label="Acties">
				<nldd-container layout="wrap" gap="12" vertical-alignment="center">
					{#each data.verderBewerken as link (link.page)}
						<nldd-link
							size="md"
							href={link.href}
							start-icon="pencil"
							text={data.verderBewerken.length === 1
								? 'Verder bewerken'
								: `Verder bewerken: ${link.page.slice(link.page.lastIndexOf('/') + 1)}`}
						></nldd-link>
					{/each}
					{#if data.canSendIn}
						<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
						<nldd-button
							appearance="primary"
							text="Insturen"
							loading={busy || undefined}
							onclick={() => stuur('insturen', 'Het voorstel is ingestuurd')}
						></nldd-button>
					{/if}
					{#if data.canMerge}
						<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
						<nldd-button
							appearance="primary"
							text="Samenvoegen"
							loading={busy || undefined}
							onclick={() => stuur('mergen', 'Het voorstel is samengevoegd', { sha: data.headSha })}
						></nldd-button>
					{/if}
				</nldd-container>
			</section>
		{/if}

		{#if data.notMergeable && !melding}
			<nldd-banner
				variant="warning"
				text="Dit voorstel kan niet automatisch worden samengevoegd; de pagina is intussen op de hoofdbranch gewijzigd"
			></nldd-banner>
		{/if}

		{#if data.canComment || data.canMerge}
			<nldd-link href="{data.githubUrl}/files" target="_blank" text="Beoordelen op GitHub"
			></nldd-link>
		{/if}

		{#if data.proposal.status === 'ingestuurd' || data.proposal.status === 'goedgekeurd' || data.proposal.status === 'wijzigingen-gevraagd'}
			<nldd-text color="secondary">
				Terug naar concept zetten kan niet vanuit Schrijver. Doe dat op GitHub via "Convert to
				draft".
			</nldd-text>
		{/if}

		{#if data.canComment}
			<form
				onsubmit={(e) => {
					e.preventDefault();
					opmerkingFout = opmerking.trim() ? null : 'Schrijf eerst een opmerking';
					if (opmerkingFout) {
						status = opmerkingFout;
						return;
					}
					void stuur('opmerking', 'Je opmerking is geplaatst', { body: opmerking });
				}}
			>
				<nldd-form-field label="Opmerking">
					<nldd-multi-line-text-field
						rows="4"
						maxlength="5000"
						value={opmerking}
						invalid={opmerkingFout !== null || undefined}
						oninput={(e: Event) => {
							opmerking = (e.currentTarget as HTMLInputElement).value;
							opmerkingFout = null;
						}}
					></nldd-multi-line-text-field>
					{#if opmerkingFout}
						<nldd-form-field-help-text>{opmerkingFout}</nldd-form-field-help-text>
					{/if}
				</nldd-form-field>
				<nldd-button
					appearance="secondary"
					type="submit"
					text="Opmerking plaatsen"
					loading={busy || undefined}
				></nldd-button>
			</form>
		{/if}

		<section aria-label="Wijzigingen">
			<nldd-title size="3" heading-level="2" text="Wijzigingen"></nldd-title>
			{#if data.changedFiles.length > 0}
				<table class="bestanden">
					<caption>Alle gewijzigde bestanden</caption>
					<thead>
						<tr><th scope="col">Bestand</th><th scope="col">Status</th></tr>
					</thead>
					<tbody>
						{#each data.changedFiles as f (f.path)}
							<tr>
								<td>
									{f.path}
									{#if f.kind !== 'pagina'}
										<br /><nldd-link
											href="{data.githubUrl}/files"
											target="_blank"
											text="Bestand gewijzigd, bekijk op GitHub"
										></nldd-link>
									{/if}
								</td>
								<td>{BESTAND[f.status]}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
			{#if data.fromFork}
				<nldd-text>Dit voorstel komt uit een fork. Beoordeel de wijzigingen op GitHub.</nldd-text>
			{:else if data.diffs.length === 0}
				<nldd-text>Dit voorstel wijzigt geen pagina's.</nldd-text>
			{:else}
				<nldd-container gap="32">
					{#each data.diffs as d (d.path)}
						<Diff path={d.path} before={d.before} after={d.after} source={d.source} />
					{/each}
				</nldd-container>
			{/if}
		</section>
	</nldd-container>
</nldd-simple-section>

<style>
	pre {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
	.bestanden {
		border-collapse: collapse;
		margin-block: 12px;
	}
	.bestanden caption {
		text-align: start;
		font-weight: bold;
	}
	.bestanden th,
	.bestanden td {
		text-align: start;
		padding: 4px 12px 4px 0;
		overflow-wrap: anywhere;
		vertical-align: top;
	}
	form {
		display: grid;
		gap: 8px;
		max-width: 40rem;
	}
</style>
