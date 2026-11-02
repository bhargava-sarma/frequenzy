import { useId } from 'react';

/**
 * A gradient or pattern id unique to this component instance.
 *
 * On Android each <Svg> has its own defs, so repeating "sheen" across
 * surfaces is harmless; in a browser, ids share one document and the first
 * definition wins for every reference. React's ids contain colons, which
 * break `url(#...)`, so they are stripped.
 */
export function useSvgId(prefix: string): string {
  const id = useId();
  return `${prefix}${id.replace(/[^a-zA-Z0-9_-]/g, '')}`;
}
