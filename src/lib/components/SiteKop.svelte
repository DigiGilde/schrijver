<script lang="ts">
	import { proposalsTab } from '$lib/forge/status';

	type Tab = 'paginas' | 'voorstellen' | 'over';
	let {
		site,
		huidig,
		wachtend = null
	}: {
		site: { id: string; adres: string | null };
		huidig: Tab;
		/** Proposals waiting for the editors; null for anyone who is not editorial. */
		wachtend?: number | null;
	} = $props();

	const voorstellen = $derived(proposalsTab(wachtend));
	let breedte = $state(0);
	/* The tab bar truncates rather than wraps: below this width the last tab takes its short name. */
	const kort = $derived(breedte > 0 && breedte < 360);
	const adresTekst = (adres: string) => {
		try {
			const url = new URL(adres);
			return (url.host + url.pathname).replace(/\/$/, '');
		} catch {
			return adres;
		}
	};

	/* nldd-tab-bar-item has no accessible-label, so the name goes on the link it renders. */
	function toegankelijkeNaam(item: HTMLElement, naam: string | null) {
		let huidige = naam;
		const zet = async () => {
			await customElements.whenDefined('nldd-tab-bar-item');
			await (item as HTMLElement & { updateComplete?: Promise<unknown> }).updateComplete;
			const link = item.shadowRoot?.querySelector('a');
			if (!link) return;
			if (huidige) link.setAttribute('aria-label', huidige);
			else link.removeAttribute('aria-label');
		};
		void zet();
		return {
			update(naam: string | null) {
				huidige = naam;
				void zet();
			}
		};
	}
</script>

<div class="kop" bind:clientWidth={breedte}>
	<nldd-tab-bar navigation accessible-label="Onderdelen van de site">
		<nldd-tab-bar-item
			text="Pagina's"
			href="/sites/{site.id}"
			current={huidig === 'paginas' || undefined}
		></nldd-tab-bar-item>
		<nldd-tab-bar-item
			text={voorstellen.text}
			href="/sites/{site.id}/voorstellen{wachtend ? '?filter=beoordelen' : ''}"
			current={huidig === 'voorstellen' || undefined}
			use:toegankelijkeNaam={voorstellen.label}
		></nldd-tab-bar-item>
		<nldd-tab-bar-item
			text={kort ? 'Over' : 'Over deze site'}
			href="/sites/{site.id}/over"
			current={huidig === 'over' || undefined}
		></nldd-tab-bar-item>
	</nldd-tab-bar>
	{#if site.adres}
		<nldd-link
			href={site.adres}
			target="_blank"
			end-icon="external-link"
			text={adresTekst(site.adres)}
		></nldd-link>
	{/if}
</div>

<style>
	.kop {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
	}
</style>
