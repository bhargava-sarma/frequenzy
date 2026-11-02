/**
 * Icon set — Tabler, outline by default.
 *
 * Imported by subpath rather than from the package root on purpose: the root
 * entry re-exports ~5,700 icons and Metro has no tree-shaking, so pulling
 * each icon from its own module keeps only these in the bundle.
 *
 * Filled variants are used only for genuine filled states — a liked heart,
 * the play triangle on its key.
 */
import type { ComponentType } from 'react';

/** The props every icon here accepts. */
export interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export type IconComponent = ComponentType<IconProps>;

export { default as IconPlayerPlayFilled } from '@tabler/icons-react-native/IconPlayerPlayFilled';
export { default as IconPlayerPauseFilled } from '@tabler/icons-react-native/IconPlayerPauseFilled';
export { default as IconPlayerSkipBack } from '@tabler/icons-react-native/IconPlayerSkipBack';
export { default as IconPlayerSkipForward } from '@tabler/icons-react-native/IconPlayerSkipForward';
export { default as IconPlayerSkipBackFilled } from '@tabler/icons-react-native/IconPlayerSkipBackFilled';
export { default as IconPlayerSkipForwardFilled } from '@tabler/icons-react-native/IconPlayerSkipForwardFilled';
export { default as IconPlayerPlay } from '@tabler/icons-react-native/IconPlayerPlay';
export { default as IconArrowsShuffle } from '@tabler/icons-react-native/IconArrowsShuffle';
export { default as IconRepeat } from '@tabler/icons-react-native/IconRepeat';
export { default as IconRepeatOnce } from '@tabler/icons-react-native/IconRepeatOnce';
export { default as IconRewindBackward15 } from '@tabler/icons-react-native/IconRewindBackward15';
export { default as IconRewindForward15 } from '@tabler/icons-react-native/IconRewindForward15';

export { default as IconHeart } from '@tabler/icons-react-native/IconHeart';
export { default as IconHeartFilled } from '@tabler/icons-react-native/IconHeartFilled';
export { default as IconHeartBroken } from '@tabler/icons-react-native/IconHeartBroken';
export { default as IconPlus } from '@tabler/icons-react-native/IconPlus';
export { default as IconMinus } from '@tabler/icons-react-native/IconMinus';
export { default as IconDisc } from '@tabler/icons-react-native/IconDisc';
export { default as IconVinyl } from '@tabler/icons-react-native/IconVinyl';
export { default as IconDeviceAudioTape } from '@tabler/icons-react-native/IconDeviceAudioTape';
export { default as IconPhoto } from '@tabler/icons-react-native/IconPhoto';
export { default as IconTrash } from '@tabler/icons-react-native/IconTrash';
export { default as IconPlaylistAdd } from '@tabler/icons-react-native/IconPlaylistAdd';
export { default as IconPlaylist } from '@tabler/icons-react-native/IconPlaylist';
export { default as IconPlaylistX } from '@tabler/icons-react-native/IconPlaylistX';
export { default as IconListDetails } from '@tabler/icons-react-native/IconListDetails';
export { default as IconListNumbers } from '@tabler/icons-react-native/IconListNumbers';

export { default as IconHome } from '@tabler/icons-react-native/IconHome';
export { default as IconSearch } from '@tabler/icons-react-native/IconSearch';
export { default as IconLibrary } from '@tabler/icons-react-native/IconLibrary';
export { default as IconChevronRight } from '@tabler/icons-react-native/IconChevronRight';
export { default as IconChevronLeft } from '@tabler/icons-react-native/IconChevronLeft';
export { default as IconChevronDown } from '@tabler/icons-react-native/IconChevronDown';
export { default as IconChevronUp } from '@tabler/icons-react-native/IconChevronUp';
export { default as IconArrowRight } from '@tabler/icons-react-native/IconArrowRight';
export { default as IconArrowUp } from '@tabler/icons-react-native/IconArrowUp';
export { default as IconArrowDown } from '@tabler/icons-react-native/IconArrowDown';
export { default as IconArrowBarToDown } from '@tabler/icons-react-native/IconArrowBarToDown';
export { default as IconCornerDownRight } from '@tabler/icons-react-native/IconCornerDownRight';
export { default as IconSettings } from '@tabler/icons-react-native/IconSettings';
export { default as IconAdjustmentsHorizontal } from '@tabler/icons-react-native/IconAdjustmentsHorizontal';
export { default as IconX } from '@tabler/icons-react-native/IconX';
export { default as IconCheck } from '@tabler/icons-react-native/IconCheck';
export { default as IconMicrophone2 } from '@tabler/icons-react-native/IconMicrophone2';
export { default as IconDots } from '@tabler/icons-react-native/IconDots';
export { default as IconDotsVertical } from '@tabler/icons-react-native/IconDotsVertical';
export { default as IconPencil } from '@tabler/icons-react-native/IconPencil';
export { default as IconMoon } from '@tabler/icons-react-native/IconMoon';
export { default as IconGauge } from '@tabler/icons-react-native/IconGauge';
export { default as IconVolume } from '@tabler/icons-react-native/IconVolume';
export { default as IconInfoCircle } from '@tabler/icons-react-native/IconInfoCircle';
export { default as IconShare } from '@tabler/icons-react-native/IconShare';
export { default as IconRadio } from '@tabler/icons-react-native/IconRadio';
export { default as IconChartBar } from '@tabler/icons-react-native/IconChartBar';
export { default as IconHistory } from '@tabler/icons-react-native/IconHistory';
export { default as IconLayoutGrid } from '@tabler/icons-react-native/IconLayoutGrid';
export { default as IconLayoutList } from '@tabler/icons-react-native/IconLayoutList';
export { default as IconArrowsSort } from '@tabler/icons-react-native/IconArrowsSort';
export { default as IconUser } from '@tabler/icons-react-native/IconUser';
export { default as IconMusic } from '@tabler/icons-react-native/IconMusic';
export { default as IconCategory } from '@tabler/icons-react-native/IconCategory';
export { default as IconCalendar } from '@tabler/icons-react-native/IconCalendar';
export { default as IconClock } from '@tabler/icons-react-native/IconClock';
export { default as IconAlertTriangle } from '@tabler/icons-react-native/IconAlertTriangle';
export { default as IconWifi } from '@tabler/icons-react-native/IconWifi';
export { default as IconWorld } from '@tabler/icons-react-native/IconWorld';
export { default as IconCloudOff } from '@tabler/icons-react-native/IconCloudOff';
export { default as IconRefresh } from '@tabler/icons-react-native/IconRefresh';
export { default as IconLogout } from '@tabler/icons-react-native/IconLogout';
export { default as IconTextSize } from '@tabler/icons-react-native/IconTextSize';
export { default as IconLanguage } from '@tabler/icons-react-native/IconLanguage';
export { default as IconDice5 } from '@tabler/icons-react-native/IconDice5';
export { default as IconSparkles } from '@tabler/icons-react-native/IconSparkles';
export { default as IconBolt } from '@tabler/icons-react-native/IconBolt';
export { default as IconFlame } from '@tabler/icons-react-native/IconFlame';
export { default as IconCircleCheck } from '@tabler/icons-react-native/IconCircleCheck';
export { default as IconPalette } from '@tabler/icons-react-native/IconPalette';
export { default as IconHeadphones } from '@tabler/icons-react-native/IconHeadphones';
export { default as IconServer } from '@tabler/icons-react-native/IconServer';
export { default as IconDatabase } from '@tabler/icons-react-native/IconDatabase';
export { default as IconCopy } from '@tabler/icons-react-native/IconCopy';
export { default as IconLock } from '@tabler/icons-react-native/IconLock';
export { default as IconGripVertical } from '@tabler/icons-react-native/IconGripVertical';
export { default as IconTimeline } from '@tabler/icons-react-native/IconTimeline';
export { default as IconWaveSine } from '@tabler/icons-react-native/IconWaveSine';
export { default as IconAlbum } from '@tabler/icons-react-native/IconAlbum';
export { default as IconFilter } from '@tabler/icons-react-native/IconFilter';
export { default as IconTag } from '@tabler/icons-react-native/IconTag';
export { default as IconPinned } from '@tabler/icons-react-native/IconPinned';
export { default as IconPlugConnected } from '@tabler/icons-react-native/IconPlugConnected';
