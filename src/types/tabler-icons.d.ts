/**
 * Types for @tabler/icons-react-native subpath imports.
 *
 * The package ships per-icon declarations, but its exports map points at
 * `./dist/icons/*.d.ts` while the files actually live one level deeper at
 * `./dist/icons/icons/*.d.ts` — so TypeScript resolves the subpath to the
 * untyped .mjs and errors under noImplicitAny. Runtime is unaffected: the
 * .mjs files are exactly where the map says, so Metro resolves them fine.
 *
 * Declaring the prop shape here rather than pointing tsconfig `paths` into
 * the package's dist layout, since this depends only on the public API and
 * won't silently break if upstream reorganizes its build output.
 *
 * Mirrors the package's own IconProps. Importing from the package root would
 * type-check without this, but pulls all ~5,700 icons into the bundle.
 */
declare module '@tabler/icons-react-native/*' {
  import type { ForwardRefExoticComponent } from 'react';
  import type { ColorValue } from 'react-native';
  import type { SvgProps } from 'react-native-svg';

  export interface TablerIconProps extends SvgProps {
    size?: string | number;
    strokeWidth?: string | number;
    color?: ColorValue;
    title?: string;
  }

  const TablerIcon: ForwardRefExoticComponent<TablerIconProps>;
  export default TablerIcon;
}
