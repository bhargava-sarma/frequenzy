import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

/**
 * The "this one is playing" mark: three level bars in place of a track
 * number. Raised while playing, low while paused, so a paused row still says
 * where you are.
 *
 * It holds still. It is an indicator, not a meter — nothing here listens to
 * the audio — and a row that jiggles for the whole length of a song is
 * motion with nothing to say.
 */
export interface PlayingBarsProps {
  playing: boolean;
  color: string;
  size?: number;
}

const PLAYING = [0.55, 1, 0.75];
const PAUSED = [0.3, 0.3, 0.3];

export const PlayingBars = memo(function PlayingBars({ playing, color, size = 14 }: PlayingBarsProps) {
  const barWidth = Math.max(2, Math.round(size / 5));
  const levels = playing ? PLAYING : PAUSED;

  return (
    <View style={[styles.root, { height: size, gap: barWidth * 0.6 }]}>
      {levels.map((level, index) => (
        <View
          key={index}
          style={{
            width: barWidth,
            height: Math.max(barWidth, Math.round(size * level)),
            borderRadius: barWidth / 2,
            backgroundColor: color,
          }}
        />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'flex-end' },
});
