import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import TrackPlayer from '@rntp/player';

import { Chip, ChipRow } from './Chip';
import { Label } from './Label';
import { Sheet } from './Sheet';
import { Slider } from './Slider';
import { usePlayerStore } from '../store/usePlayerStore';
import { layout, space } from '../theme/tokens';

/**
 * Speed and level.
 *
 * Volume here is the player's own gain, under the system volume — useful
 * for evening out a quiet master without touching the phone's level.
 * Speed is kept to 0.5–2×: past that, music stops being music.
 */
const SPEEDS = [0.75, 1, 1.25, 1.5, 2];

export function PlayerToolsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const speed = usePlayerStore((state) => state.speed);
  const setSpeed = usePlayerStore((state) => state.setSpeed);
  const [volume, setVolumeState] = useState(1);

  useEffect(() => {
    if (!visible) return;
    try {
      setVolumeState(TrackPlayer.getVolume());
    } catch {
      setVolumeState(1);
    }
  }, [visible]);

  return (
    <Sheet visible={visible} onClose={onClose} title="Playback" subtitle="Speed and level">
      <View style={styles.body}>
        <Label tone="tertiary">Presets</Label>
      </View>
      <ChipRow contentStyle={styles.chips}>
        {SPEEDS.map((value) => (
          <Chip
            key={value}
            label={`${value}×`}
            selected={Math.abs(speed - value) < 0.001}
            onPress={() => setSpeed(value)}
          />
        ))}
      </ChipRow>
      <View style={styles.body}>
        <Slider
          label="Speed"
          value={speed}
          min={0.5}
          max={2}
          step={0.05}
          readout={`${speed.toFixed(2)}×`}
          onChange={setSpeed}
        />
        <Slider
          label="Volume"
          value={volume}
          min={0}
          max={1}
          step={0.05}
          readout={`${Math.round(volume * 100)}%`}
          onChange={(value) => {
            setVolumeState(value);
            TrackPlayer.setVolume(value);
          }}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: layout.panelPadding + space[1], paddingTop: space[2] },
  chips: { paddingHorizontal: layout.panelPadding + space[1], paddingVertical: space[2] },
});
