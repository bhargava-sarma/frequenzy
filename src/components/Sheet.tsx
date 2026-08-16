import { type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { SectionHeader } from './SectionHeader';
import { hairline, layout, motion, space, type } from '../theme/tokens';
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

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      {/* Tapping the scrim dismisses; the sheet itself swallows the press. */}
      <Animated.View entering={FadeIn.duration(motion.durationBase)} style={styles.scrimLayer}>
        <Pressable style={styles.scrim} onPress={onClose}>
          <Animated.View entering={FadeInDown.duration(motion.durationScreen)}>
            <Pressable style={styles.sheet} onPress={() => {}}>
              <SectionHeader title={title} count={detail} surface="panel" />
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
      backgroundColor: '#000000AA',
      justifyContent: 'flex-end',
      padding: space[3],
    },
    sheet: {
      backgroundColor: color.panel,
      borderRadius: layout.dockRadius,
      borderWidth: hairline,
      borderColor: color.panelLine,
      overflow: 'hidden',
      paddingBottom: space[3],
      // Never taller than most of the screen, so a long playlist list stays a
      // sheet rather than becoming a screen.
      maxHeight: '75%',
    },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: space[4],
      paddingHorizontal: layout.panelPadding,
      paddingVertical: space[4],
    },
    optionLine: { borderBottomWidth: hairline, borderBottomColor: color.panelLine },
    optionLabel: { ...type.body, color: color.textInverse, flexShrink: 1 },
    optionDetail: { ...type.numeral, color: color.textInverseSecondary },
    pressed: { opacity: 0.6 },
    disabled: { opacity: 0.4 },
    body: { paddingHorizontal: layout.panelPadding, paddingTop: space[3] },
  });
