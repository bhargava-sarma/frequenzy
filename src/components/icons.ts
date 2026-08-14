/**
 * Icon set — Tabler outline, per the design spec.
 *
 * Imported by subpath rather than from the package root on purpose: the root
 * entry re-exports ~5,700 icons, and Metro has no tree-shaking to remove what
 * we don't reference. Pulling each icon from its own module keeps only these
 * in the bundle.
 *
 * Filled variants are used ONLY for genuine filled states — a favorited heart
 * and the play triangle inside the accent circle. Everything else stays
 * outline so the stroke weight reads consistently.
 */

export { default as IconPlayerPlayFilled } from '@tabler/icons-react-native/IconPlayerPlayFilled';
export { default as IconPlayerPauseFilled } from '@tabler/icons-react-native/IconPlayerPauseFilled';
export { default as IconPlayerSkipBack } from '@tabler/icons-react-native/IconPlayerSkipBack';
export { default as IconPlayerSkipForward } from '@tabler/icons-react-native/IconPlayerSkipForward';
export { default as IconArrowsShuffle } from '@tabler/icons-react-native/IconArrowsShuffle';
export { default as IconRepeat } from '@tabler/icons-react-native/IconRepeat';

export { default as IconHeart } from '@tabler/icons-react-native/IconHeart';
export { default as IconHeartFilled } from '@tabler/icons-react-native/IconHeartFilled';
export { default as IconPlus } from '@tabler/icons-react-native/IconPlus';
export { default as IconDisc } from '@tabler/icons-react-native/IconDisc';
export { default as IconTrash } from '@tabler/icons-react-native/IconTrash';
export { default as IconPlaylistAdd } from '@tabler/icons-react-native/IconPlaylistAdd';

export { default as IconHome } from '@tabler/icons-react-native/IconHome';
export { default as IconSearch } from '@tabler/icons-react-native/IconSearch';
export { default as IconLibrary } from '@tabler/icons-react-native/IconLibrary';
export { default as IconPlaylist } from '@tabler/icons-react-native/IconPlaylist';
export { default as IconChevronRight } from '@tabler/icons-react-native/IconChevronRight';
export { default as IconSettings } from '@tabler/icons-react-native/IconSettings';
export { default as IconX } from '@tabler/icons-react-native/IconX';
export { default as IconMoon } from '@tabler/icons-react-native/IconMoon';
export { default as IconChevronDown } from '@tabler/icons-react-native/IconChevronDown';
export { default as IconMicrophone2 } from '@tabler/icons-react-native/IconMicrophone2';
