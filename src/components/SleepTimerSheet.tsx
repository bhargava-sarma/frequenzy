import { StyleSheet, View } from 'react-native';
import TrackPlayer from '@rntp/player';

import { DotText, Display } from './Display';
import { IconMoon, IconPlayerPlay, IconX } from './icons';
import { Label } from './Label';
import { Sheet, SheetRow } from './Sheet';
import { sleepLabel, useSleepTimer } from '../hooks/useSleepTimer';
import { getSettings } from '../store/useSettingsStore';
import { toast } from '../store/useToastStore';
import { layout, radius, space } from '../theme/tokens';
import { haptics } from '../utils/haptics';

/**
 * Sleep timer.
 *
 * The player counts down natively, so it keeps running with the JS runtime
 * asleep — the only way a sleep timer is any use. Timed options fade out
 * over the last few seconds (Settings → Playback), because music cutting to
 * silence mid-bar is startling in a way that defeats the point. "End of
 * track" is what you usually mean when something is already playing.
 */
const OPTIONS = [5, 15, 30, 45, 60, 90];

export function SleepTimerSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { state, refresh } = useSleepTimer();
  const label = sleepLabel(state);

  function set(action: () => void, message: string) {
    action();
    refresh();
    haptics.success();
    toast.show(message, { icon: 'moon' });
    onClose();
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Sleep timer" subtitle={label ? 'Running' : 'Off'}>
      <View style={styles.readoutWrap}>
        <Display style={styles.readout} radius={radius.md}>
          <Label tone="displayDim">Stops in</Label>
          <DotText size={36}>{label ?? '--:--'}</DotText>
        </Display>
      </View>

      {OPTIONS.map((minutes) => (
        <SheetRow
          key={minutes}
          icon={IconMoon}
          label={minutes < 60 ? `${minutes} minutes` : minutes === 60 ? '1 hour' : `${minutes / 60} hours`}
          onPress={() =>
            set(
              () =>
                TrackPlayer.sleepAfterTime(minutes * 60, {
                  fadeOutSeconds: Math.min(getSettings().sleepFade, minutes * 60),
                }),
              `Sleeping in ${minutes} min`,
            )
          }
        />
      ))}
      <SheetRow
        icon={IconPlayerPlay}
        label="End of this track"
        last={!state}
        onPress={() => set(() => TrackPlayer.sleepAfterMediaItemAtIndex(), 'Stopping after this track')}
      />
      {state && (
        <SheetRow
          icon={IconX}
          label="Turn off"
          tone="destructive"
          last
          onPress={() => set(() => TrackPlayer.cancelSleepTimer(), 'Sleep timer off')}
        />
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  readoutWrap: { paddingHorizontal: layout.panelPadding + space[1], paddingBottom: space[2] },
  readout: {
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
