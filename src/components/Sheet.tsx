import { type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Glass } from './Glass';
import { springs } from '../theme/motion';
import { hairline, layout, motion, radius, space, type } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';

/**
 * A bottom sheet for short, decisive choices.
 *
 * Extracted from the sleep timer once a second one was needed, and then a
 * third. Everything shared lives here — the scrim, the geometry, the rise —
 * so a new sheet is a list of rows rather than another modal to get right.
 *
 * The sheet rises while the scrim fades. Both together read as one movement;
 * fading the sheet in on the spot reads as a dialog appearing, which is the
 * heavier thing this is deliberately not.
 */

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  /** Right-hand text in the header, e.g. a count or a running total. */
  detail?: string;
  children: ReactNode;
}

export function Sheet({ visible, onClose, title, detail, children }: SheetProps) {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      {/* Tapping the scrim dismisses; the sheet itself swallows the press. */}
      <Animated.View
        entering={FadeIn.duration(motion.durationBase)}
        exiting={FadeOut.duration(motion.durationFast)}
        style={styles.scrimLayer}
      >
        <Pressable style={styles.scrim} onPress={onClose}>
          {/* The cap lives here, not on the sheet. A percentage resolves
              against the parent's height, and the sheet's parent was this
              wrapper — which is sized by its own content, so the cap either
              did nothing or clipped the sheet to less than its content and
              cut the last row in half. The scrim below has a real height. */}
          {/* Springs up from below rather than fading in place, so it reads
              as a card lifted into view — the same physics as the player. */}
          <Animated.View
            entering={SlideInDown.springify()
              .damping(springs.gentle.damping ?? 20)
              .stiffness(springs.gentle.stiffness ?? 180)}
            style={styles.riser}
          >
            <Pressable
              style={[styles.sheet, { paddingBottom: space[3] + insets.bottom }]}
              onPress={() => {}}
            >
              <Glass
                variant="prominent"
                shadow
                radius={radius.xl}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.grabber} />
              <View style={styles.header}>
                <Text style={styles.title} numberOfLines={1}>
                  {title}
                </Text>
                {detail != null && (
                  <Text style={styles.detail} numberOfLines={1}>
                    {detail}
                  </Text>
                )}
              </View>
              {children}
            </Pressable>
          </Animated.View>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

export interface SheetOptionProps {
  label: string;
  /** Secondary line, e.g. a track count. */
  detail?: string;
  onPress: () => void;
  /** Accents the label — for the one destructive or primary row. */
  emphasis?: boolean;
  last?: boolean;
  disabled?: boolean;
}

export function SheetOption({
  label,
  detail,
  onPress,
  emphasis = false,
  last = false,
  disabled = false,
}: SheetOptionProps) {
  const color = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        !last && styles.optionLine,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.optionLabel, emphasis && { color: color.accent }]} numberOfLines={1}>
        {label}
      </Text>
      {detail != null && <Text style={styles.optionDetail}>{detail}</Text>}
    </Pressable>
  );
}

/** Wraps arbitrary content — a text field, a row of buttons — in the sheet's padding. */
export function SheetBody({ children }: { children: ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  return <View style={styles.body}>{children}</View>;
}

const makeStyles = (color: Palette) =>
  StyleSheet.create({
    scrimLayer: { flex: 1 },
    scrim: {
      flex: 1,
      backgroundColor: color.scrim,
      justifyContent: 'flex-end',
      padding: space[3],
    },
    // Never taller than most of the screen, so a long playlist list stays a
    // sheet rather than becoming a screen. On the scrim's child because that
    // is the box with a height to take a percentage of.
    riser: { maxHeight: '75%' },
    sheet: {
      // Shrinks into the riser's cap, which is what gives a long list inside
      // a bounded height to scroll within instead of growing past the screen.
      flexShrink: 1,
      // The fill, rim and shadow all come from the Glass layer inside.
      borderRadius: radius.xl,
      overflow: 'hidden',
      // Bottom padding is applied inline, adding the gesture bar inset: the
      // sheet sits at the very bottom of the screen, so without it the last
      // row is under the system navigation.
    },
    grabber: {
      alignSelf: 'center',
      width: 36,
      height: 5,
      borderRadius: radius.full,
      backgroundColor: color.labelTertiary,
      marginTop: space[2],
    },
    header: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: space[3],
      paddingHorizontal: layout.panelPadding,
      paddingTop: space[3],
      paddingBottom: space[2],
    },
    title: { ...type.title3, color: color.label, flexShrink: 1 },
    detail: { ...type.subheadline, color: color.labelSecondary },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: space[4],
      paddingHorizontal: layout.panelPadding,
      paddingVertical: space[4],
    },
    optionLine: { borderBottomWidth: hairline, borderBottomColor: color.separator },
    optionLabel: { ...type.body, color: color.label, flexShrink: 1 },
    optionDetail: { ...type.numeral, color: color.labelSecondary },
    pressed: { opacity: 0.6 },
    disabled: { opacity: 0.4 },
    body: { paddingHorizontal: layout.panelPadding, paddingTop: space[3] },
  });
