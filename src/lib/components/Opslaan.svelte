<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onMount, tick } from 'svelte';
	import {
		IMAGES_TOO_LARGE,
		MAX_PENDING_IMAGE_BYTES,
		pendingBytes,
		referenced,
		type PendingImage
	} from '$lib/client/pending-images';
	import { inImageFolder, removedImages, type ImageConvention } from '$lib/content/image-refs';
	import { MERMAID_DESCR_MESSAGE, missingDescriptions } from '$lib/content/mermaid';

	type Nieuw = { soort: string | null; folder: string; title: string };
	type Snapshot = { body: string; frontmatter: Record<string, unknown>; changedKeys: string[] };
	type Fout = { message: string; detail?: string; fields?: Record<string, string> };
	type Conflict = { mine: string; theirs: string; sha: string };
	type Gebruik = { path: string; usedOn: { path: string; title: string }[]; deletable: boolean };
	/** A save waiting for an answer: the images that may go, and the ones other pages keep. */
	type Vraag = { paden: string[]; elders: Gebruik[]; overrideSha?: string };
	type Antwoord = { verwijderen: string[]; elders: Gebruik[] };

	let {
		siteId,
		repoPath,
		sha,
		branch,
		prNumber,
		nieuw,
		snapshot,
		tekst,
		images,
		onverstuurd,
		onbewaard,
		onovernemen,
		onbasis,
		onveldfouten,
		oneigenschappen = null,
		focusEditor,
		conventie,
		busy = $bindable(false),
		knoptekst = $bindable(),
		conflictOpen = $bindable(false),
		vraagOpen = $bindable(false)
	}: {
		siteId: string;
		repoPath: string;
		sha: string | null;
		branch: string | null;
		prNumber: number | null;
		nieuw: Nieuw | null;
		snapshot: () => Snapshot;
		tekst: string;
		images: () => PendingImage[];
		onverstuurd: (sent: PendingImage[]) => void;
		onbewaard: (saved: { sha: string; branch: string }) => void;
		onovernemen: (text: string) => void;
		onbasis: (sha: string) => void;
		/** Field errors from the server, so the form can mark the fields. */
		onveldfouten: (fields: Record<string, string>) => void;
		/** Opens the page properties; offered with field errors. */
		oneigenschappen?: (() => void) | null;
		/** Returns focus to the editor; with `false` a showing preview stays and takes it instead. */
		focusEditor: (wissel?: boolean) => void;
		/** Where the site keeps its images: only there does a save offer to delete one. */
		conventie: ImageConvention;
		busy?: boolean;
		knoptekst?: string;
		/** True while a conflict waits for a choice; another save would only meet it again. */
		conflictOpen?: boolean;
		/** True while the question about images no page uses any more waits for an answer. */
		vraagOpen?: boolean;
	} = $props();

	/* The props are the initial values of the editing session; later saves update them locally. */
	// svelte-ignore state_referenced_locally
	let baseSha = $state(sha);
	// svelte-ignore state_referenced_locally
	let huidigeBranch = $state(branch);
	// svelte-ignore state_referenced_locally
	let huidigPr = $state(prNumber);
	// svelte-ignore state_referenced_locally
	let nieuwePagina = $state(nieuw);
	let bewaard = $state<{ nummer: number; url: string; verwijderd: string[] } | null>(null);
	let fout = $state<Fout | null>(null);
	let conflict = $state<Conflict | null>(null);
	let mermaidFout = $state<string | null>(null);
	let vraag = $state<Vraag | null>(null);
	let aangevinkt = $state<string[]>([]);
	/* Images a save left in place because other pages use them, said after that save. */
	let elders = $state<Gebruik[]>([]);
	/* One persistent live region: a region inserted together with its text is not reliably announced. */
	let status = $state('');
	let foutBlok: HTMLElement | undefined = $state();
	let conflictKop: HTMLElement | undefined = $state();
	let vraagBlok: HTMLElement | undefined = $state();
	/* The page as the repository holds it: a save removes the images that drop out of this. */
	// svelte-ignore state_referenced_locally
	let basis = tekstVan(snapshot());

	const knopTekst = $derived(huidigPr ? 'Opslaan' : 'Concept bewaren');
	$effect.pre(() => {
		knoptekst = knopTekst;
	});
	$effect.pre(() => {
		conflictOpen = conflict !== null;
	});
	$effect.pre(() => {
		vraagOpen = vraag !== null;
	});

	const vraagTekst = $derived(
		(vraag?.paden.length ?? 0) > 1
			? 'Deze afbeeldingen staan nu op geen enkele pagina meer. Ook de bestanden verwijderen?'
			: 'Deze afbeelding staat nu op geen enkele pagina meer. Ook het bestand verwijderen?'
	);

	const naamVan = (pad: string) => pad.slice(pad.lastIndexOf('/') + 1);
	const opsomming = (namen: string[]) =>
		new Intl.ListFormat('nl', { type: 'conjunction' }).format(namen);
	const paginas = (afbeelding: Gebruik) =>
		opsomming(afbeelding.usedOn.map((pagina) => pagina.title));
	const blijftStaan = (afbeelding: Gebruik) => {
		const aantal = afbeelding.usedOn.length;
		return `${naamVan(afbeelding.path)} blijft staan: ook gebruikt op ${aantal} ${aantal === 1 ? 'pagina' : "pagina's"}`;
	};

	function tekstVan(snap: Snapshot): string {
		return `${snap.body}\n${JSON.stringify(snap.frontmatter)}`;
	}

	function duimnagel(pad: string): string {
		const query = new URLSearchParams({ pad });
		if (huidigeBranch) query.set('ref', huidigeBranch);
		return `/api/sites/${encodeURIComponent(siteId)}/bestand?${query}`;
	}

	/** The editor's address for the saved file on its proposal branch. */
	function voorstelAdres(pad: string, branch: string, pr: number): string {
		const root = conventie.content.pad.replace(/\/+$/, '');
		const binnen = root === '' ? pad : pad.slice(root.length + 1);
		const query = new URLSearchParams({ branch, pr: String(pr) });
		return `/sites/${siteId}/bewerken/${binnen.split('/').map(encodeURIComponent).join('/')}?${query}`;
	}

	/** Images this save drops that the repository holds, in a folder the site keeps images in. */
	function weggehaald(huidig: Snapshot): string[] {
		const nieuw = images().map((image) => image.path);
		return removedImages(basis, tekstVan(huidig), repoPath).filter(
			(pad) => !nieuw.includes(pad) && inImageFolder(conventie, pad)
		);
	}

	/** Without an answer nothing is offered: the files stay, as they would without the check. */
	async function gebruikVan(paden: string[]): Promise<Gebruik[]> {
		try {
			const res = await fetch(`/api/sites/${siteId}/afbeeldingsgebruik`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', 'X-Requested-With': 'Schrijver' },
				body: JSON.stringify({ path: repoPath, branch: huidigeBranch, images: paden.slice(0, 20) })
			});
			const result = await res.json().catch(() => null);
			return res.ok && Array.isArray(result?.images) ? result.images : [];
		} catch {
			return [];
		}
	}

	async function toon(element: () => HTMLElement | undefined) {
		await tick();
		element()?.focus();
	}

	/** With `antwoord` the question about images no page uses was answered: no second check. */
	export async function opslaan(overrideSha?: string, antwoord?: Antwoord) {
		if (busy) return;
		if (vraag) {
			void toon(() => vraagBlok);
			return;
		}
		const huidig = snapshot();
		const { body, frontmatter, changedKeys } = huidig;
		const zonder = missingDescriptions(body);
		if (zonder.length) {
			mermaidFout = `${MERMAID_DESCR_MESSAGE} (regel ${zonder.join(', ')})`;
			void toon(() => foutBlok);
			return;
		}
		mermaidFout = null;
		const sent = referenced(images(), body);
		if (pendingBytes(sent) > MAX_PENDING_IMAGE_BYTES) {
			fout = { message: IMAGES_TOO_LARGE };
			status = '';
			void toon(() => foutBlok);
			return;
		}
		busy = true;
		fout = null;
		conflict = null;
		elders = [];
		status = 'Bezig met bewaren';
		const weg = weggehaald(huidig);
		const verwijderen = antwoord?.verwijderen.filter((pad) => weg.includes(pad)) ?? [];
		let blijven = antwoord?.elders.filter((afbeelding) => weg.includes(afbeelding.path)) ?? [];
		if (!antwoord && weg.length > 0) {
			const gebruik = await gebruikVan(weg);
			blijven = gebruik.filter((afbeelding) => afbeelding.usedOn.length > 0);
			const vrij = gebruik.filter((afbeelding) => afbeelding.deletable);
			if (vrij.length > 0) {
				busy = false;
				status = '';
				aangevinkt = [];
				vraag = { paden: vrij.map((afbeelding) => afbeelding.path), elders: blijven, overrideSha };
				void toon(() => vraagBlok);
				return;
			}
		}
		try {
			const res = await fetch(`/api/sites/${siteId}/opslaan`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', 'X-Requested-With': 'Schrijver' },
				body: JSON.stringify({
					path: repoPath,
					body,
					frontmatter,
					changedKeys,
					baseSha: overrideSha ?? baseSha,
					branch: huidigeBranch,
					prNumber: huidigPr,
					images: sent,
					...(verwijderen.length > 0 ? { deletions: verwijderen } : {}),
					...(nieuwePagina ? { newPage: nieuwePagina } : {})
				})
			});
			const result = await res.json().catch(() => null);
			if (result?.ok) {
				baseSha = result.sha;
				huidigeBranch = result.branch;
				huidigPr = result.prNumber;
				nieuwePagina = null;
				repoPath = result.path;
				basis = tekstVan(huidig);
				const verwijderd = verwijderen.map(naamVan);
				bewaard = { nummer: result.prNumber, url: result.url, verwijderd };
				elders = blijven;
				const adres = voorstelAdres(result.path, result.branch, result.prNumber);
				// Not a shallow replaceState: SvelteKit would then still open the old address on Back.
				if (adres !== `${page.url.pathname}${page.url.search}`)
					void goto(adres, { replaceState: true, noScroll: true, keepFocus: true });
				onverstuurd(sent);
				onbewaard({ sha: result.sha, branch: result.branch });
				status = [
					`Concept bewaard als voorstel #${result.prNumber}`,
					...(verwijderd.length > 0 ? [`Ook verwijderd: ${opsomming(verwijderd)}`] : []),
					...blijven.map((afbeelding) => `${blijftStaan(afbeelding)} (${paginas(afbeelding)})`)
				].join('. ');
			} else if (result?.conflict) {
				conflict = result.conflict;
				status = '';
				void toon(() => conflictKop);
			} else {
				fout = result?.error ??
					// The server's body limit answers 413 without JSON.
					{ message: res.status === 413 ? IMAGES_TOO_LARGE : 'Opslaan is mislukt' };
			}
		} catch (e) {
			fout = { message: 'Opslaan is mislukt: geen verbinding', detail: String(e) };
		} finally {
			busy = false;
		}
		if (fout) {
			status = '';
			if (fout.fields) onveldfouten(fout.fields);
			void toon(() => foutBlok);
		}
	}

	function behoudMijn() {
		if (!conflict) return;
		const sha = conflict.sha;
		focusEditor();
		void opslaan(sha);
	}

	function neemOver() {
		if (!conflict) return;
		baseSha = conflict.sha;
		onbasis(conflict.sha);
		onovernemen(conflict.theirs);
		basis = tekstVan(snapshot());
		conflict = null;
		status = 'Hun versie overgenomen';
		focusEditor();
	}

	function vink(pad: string, aan: boolean) {
		aangevinkt = [...aangevinkt.filter((p) => p !== pad), ...(aan ? [pad] : [])];
	}

	function bewaar() {
		if (!vraag) return;
		const { elders: blijven, overrideSha } = vraag;
		const verwijderen = aangevinkt;
		vraag = null;
		aangevinkt = [];
		focusEditor(false);
		void opslaan(overrideSha, { verwijderen, elders: blijven });
	}

	function annuleer() {
		vraag = null;
		aangevinkt = [];
		focusEditor();
	}

	$effect(() => {
		void tekst;
		mermaidFout = null;
	});

	onMount(() => {
		const onkey = (e: KeyboardEvent) => {
			if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
				e.preventDefault();
				if (!conflict) void opslaan();
			}
		};
		window.addEventListener('keydown', onkey);
		return () => window.removeEventListener('keydown', onkey);
	});
</script>

<p class="sr-only" role="status">{status}</p>

<!-- Focus goes to a plain wrapper: a banner with tabindex -1 would take its own buttons out of the Tab order. -->
{#if mermaidFout}
	<div class="foutmelding" tabindex="-1" bind:this={foutBlok}>
		<nldd-banner variant="critical" text={mermaidFout}></nldd-banner>
	</div>
{/if}

{#if bewaard}
	<nldd-notification
		variant="success"
		text={`Concept bewaard als voorstel #${bewaard.nummer}`}
		supporting-text={bewaard.verwijderd.length > 0
			? `Ook verwijderd: ${opsomming(bewaard.verwijderd)}`
			: undefined}
		ondismiss={(event: Event) => {
			// Its own clock pauses while focus is inside, so only a dismiss from within had it.
			const hadFocus = (event.currentTarget as Element).matches(':focus-within');
			bewaard = null;
			if (hadFocus) focusEditor(false);
		}}
	>
		<nldd-button
			slot="actions"
			appearance="secondary"
			text="Open op GitHub"
			href={bewaard.url}
			target="_blank"
		></nldd-button>
		<nldd-button
			slot="actions"
			appearance="secondary"
			text="Bekijk voorstel"
			href={`/sites/${siteId}/voorstellen/${bewaard.nummer}`}
		></nldd-button>
	</nldd-notification>
{/if}

{#each elders as afbeelding (afbeelding.path)}
	<nldd-banner
		variant="neutral"
		text={blijftStaan(afbeelding)}
		supporting-text={paginas(afbeelding)}
	></nldd-banner>
{/each}

{#if vraag}
	<div class="vraag" role="group" aria-label={vraagTekst} tabindex="-1" bind:this={vraagBlok}>
		<nldd-box>
			<nldd-container padding="16">
				<nldd-inline-dialog text={vraagTekst} horizontal-alignment="left">
					<nldd-container gap="12">
						{#each vraag.paden as pad (pad)}
							<div class="bestand" role="group" aria-label={naamVan(pad)}>
								<nldd-image
									src={duimnagel(pad)}
									decorative
									width="48"
									aspect-ratio="1/1"
									shape="rounded"
								></nldd-image>
								<nldd-container gap="4">
									<nldd-text>{naamVan(pad)}</nldd-text>
									<nldd-checkbox-field
										label="Verwijder ook dit bestand"
										checked={aangevinkt.includes(pad) || undefined}
										onchange={(e: Event) =>
											vink(pad, (e as CustomEvent<{ checked: boolean }>).detail.checked)}
									></nldd-checkbox-field>
								</nldd-container>
							</div>
						{/each}
					</nldd-container>
					<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
					<nldd-button slot="actions" appearance="primary" text="Bewaar" onclick={bewaar}
					></nldd-button>
					<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
					<nldd-button slot="actions" appearance="secondary" text="Annuleer" onclick={annuleer}
					></nldd-button>
				</nldd-inline-dialog>
			</nldd-container>
		</nldd-box>
	</div>
{/if}

{#if fout}
	<div class="foutmelding" tabindex="-1" bind:this={foutBlok}>
		<nldd-banner variant="critical" text={fout.message}>
			{#if fout.fields}
				<nldd-rich-text>
					<ul>
						{#each Object.entries(fout.fields) as [veld, melding] (veld)}
							<li>{melding}</li>
						{/each}
					</ul>
				</nldd-rich-text>
				{#if oneigenschappen}
					<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
					<nldd-button
						slot="actions"
						appearance="secondary"
						text="Eigenschappen aanpassen"
						onclick={oneigenschappen}
					></nldd-button>
				{/if}
			{/if}
			{#if fout.detail}
				<details>
					<summary>Technische details</summary>
					<pre>{fout.detail}</pre>
				</details>
			{/if}
		</nldd-banner>
	</div>
{/if}

{#if conflict}
	<div class="conflict">
		<p role="alert" tabindex="-1" bind:this={conflictKop}>
			Deze pagina is intussen door iemand anders gewijzigd. Kies welke versie je wilt houden.
		</p>
		<div class="versies">
			<section aria-label="Mijn versie">
				<h3>Mijn versie</h3>
				<pre>{conflict.mine}</pre>
			</section>
			<section aria-label="Hun versie">
				<h3>Hun versie</h3>
				<pre>{conflict.theirs}</pre>
			</section>
		</div>
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<nldd-button appearance="primary" text="Mijn versie behouden" onclick={behoudMijn}
		></nldd-button>
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<nldd-button appearance="secondary" text="Hun versie overnemen" onclick={neemOver}
		></nldd-button>
	</div>
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
	/* The box and its button group take their width from outside; shrink-wrapped they collapse. */
	.vraag {
		align-self: stretch;
		max-width: 512px;
	}
	.bestand {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.bestand nldd-image {
		flex: none;
		width: 48px;
	}
	pre {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		margin: 0;
	}
	.versies {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
		gap: 16px;
	}
</style>
