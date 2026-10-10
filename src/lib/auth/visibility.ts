import type { Visibility } from './team';

/** Who sees a site: as its settings say, but only its team while its repository is not known to be public. */
export const whoSees = (isPublic: boolean | null, setting: Visibility): Visibility =>
	isPublic === true ? setting : 'team';
