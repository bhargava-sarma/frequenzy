import { memo, useCallback, useRef, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';

import { radius, type } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { haptics } from '../utils/haptics';

/**
 * An index strip down the right edge: touch a letter, or run a finger down
 * the strip, and the list jumps there — with a tick at each letter and the
 * current one held up in a bubble beside the finger, where the finger isn't
 * covering it.
 */
export interface AlphabetRailProps {
  letters: string[];
  onSelect: (letter: string) => void;
  /** Top/bottom inset so the rail clears headers and the dock. */
  top: number;
  bottom: number;
}

export const AlphabetRail = memo(function AlphabetRail({
  letters,
  onSelect,
  top,
  bottom,
}: AlphabetRailProps) {
  const color = useTheme();
  const [height, setHeight] = useState(0);
  const [active, setActive] = useState<string | null>(null);
  const lastIndex = useRef(-1);

  const pick = useCallback(
    (y: number) => {
      if (height <= 0 || letters.length === 0) return;
      const index = Math.min(letters.length - 1, Math.max(0, Math.floor((y / height) * letters.length)));
      if (index === lastIndex.current) return;
      lastIndex.current = index;
      haptics.tick();
      setActive(letters[index]);
      onSelect(letters[index]);
    },
    [height, letters, onSelect],
  );

  const end = useCallback(() => {
    lastIndex.current = -1;
    setActive(null);
  }, []);

  const pan = Gesture.Pan()
    .minDistance(0)
    .hitSlop({ left: 16, right: 8 })
    .onBegin((event) => runOnJS(pick)(event.y))
    .onUpdate((event) => runOnJS(pick)(event.y))
    .onFinalize(() => runOnJS(end)());

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setHeight(event.nativeEvent.layout.height);
  }, []);

  if (letters.length < 2) return null;

  return (
    <View pointerEvents="box-none" style={[styles.host, { top, bottom }]}>
      <GestureDetector gesture={pan}>
        <View style={styles.rail} onLayout={onLayout}>
          {letters.map((letter) => (
            <Text
              key={letter}
              style={[
                type.labelBold,
                styles.letter,
                { color: active === letter ? color.accent : color.labelSecondary },
              ]}
            >
              {letter}
            </Text>
          ))}
        </View>
      </GestureDetector>

      {active != null && (
        <View pointerEvents="none" style={styles.bubbleHost}>
          <View style={[styles.bubble, { backgroundColor: color.surfaceRaised, borderColor: color.border }]}>
            <Text style={[type.title1, { color: color.label }]}>{active}</Text>
          </View>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  host: { position: 'absolute', right: 0, width: 26, justifyContent: 'center' },
  rail: {
    flex: 1,
    maxHeight: 560,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  letter: { fontSize: 9.5, letterSpacing: 0, lineHeight: 12 },
  bubbleHost: {
    position: 'absolute',
    right: 56,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
  },
  bubble: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

/** The index letter for a name: A-Z, or # for anything else. */
export function indexLetter(name: string): string {
  const first = name.trim().charAt(0).toUpperCase();
  return first >= 'A' && first <= 'Z' ? first : '#';
}
