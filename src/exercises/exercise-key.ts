// The one rule that turns a name into what is stored (design §10.1). Every
// stored key and group name was made by these functions as they are now, so
// changing one is a data migration; the golden test pins them.

// Code points, as PostgreSQL's char_length counts them, not UTF-16 units.
export function codePointLength(s: string): number {
  return Array.from(s).length;
}

export function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, ' ');
}

// NFKC, then trim, then collapse inner whitespace, then lower-case.
export function exerciseKey(name: string): string {
  return collapseWhitespace(name.normalize('NFKC').trim()).toLowerCase();
}

// The same steps, written out rather than aliased: the two rules make
// different stored data, so a change to one must not silently change the other.
export function muscleGroupName(name: string): string {
  return collapseWhitespace(name.normalize('NFKC').trim()).toLowerCase();
}
