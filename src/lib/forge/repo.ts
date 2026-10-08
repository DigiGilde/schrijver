/** GitHub repository names are case-insensitive; config is typed by hand, GitHub returns canonical casing. */
export const repoKey = (name: string): string => name.toLowerCase();

export const sameRepo = (a: string, b: string): boolean => repoKey(a) === repoKey(b);
