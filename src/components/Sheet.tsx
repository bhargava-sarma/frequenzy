import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Artwork } from './Artwork';
import { Glass } from './Glass';
import type { IconComponent } from './icons';
import { Label } from './Label';
import { springs } from '../theme/motion';
import { hairline, layout, radius, space, type, withAlpha } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { haptics } from '../utils/haptics';

/**
 * A bottom sheet for short, decisive choices.
 *
 * It rises on a spring while the scrim fades in, and leaves the same way —
 * kept mounted until its exit has played, since a native modal unmounted
 * mid-animation simply vanishes. The header is a drag handle: pull it down
 * past a threshold, or flick, and the sheet goes; short of that it settles
 * back. Long content scrolls inside without fighting the drag, because only
 * the header listens.
 */
export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  /** Called once the exit animation has finished. */
  onClosed?: () => void;
  title?: string;
  subtitle?: string;
  /** Cover shown beside the title. */
  artworkUri?: string | null;
  artworkRound?: boolean;
  /** Replaces the default title block. */
  header?: ReactNode;
  children: ReactNode;
}

const DISMISS_DISTANCE = 110;
const DISMISS_VELOCITY = 900;
const EXIT = { duration: 210, easing: Easing.in(Easing.quad) };

/**
 * One sheet on screen at a time.
 *
 * A sheet that hands off to another (actions → add to playlist) closes as
 * the next one opens, and two native modals overlapping is a stack Android
 * doesn't always unwind cleanly. So a sheet asked to open while another is
 * still on screen — usually still playing its exit — waits for it to go.
 */
const onScreen = new Set<number>();
const waiting = new Map<number, () => void>();
let nextSheetId = 1;

function claim(id: number, open: () => void) {
  if (onScreen.size === 0 || onScreen.has(id)) {
    onScreen.add(id);
    open();
    return;
  }
  waiting.set(id, () => {
    onScreen.add(id);
    open();
  });
}

function release(id: number) {
  onScreen.delete(id);
  waiting.delete(id);
  if (onScreen.size > 0) return;
  const first = waiting.entries().next();
  if (first.done) return;
  waiting.delete(first.value[0]);
  first.value[1]();
}

export function Sheet({
  visible,
  onClose,
  onClosed,
  title,
  subtitle,
  artworkUri,
  artworkRound = false,
  header,
  children,
}: SheetProps) {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();

  // Starts unmounted even when visible: opening goes through claim().
  const [mounted, setMounted] = useState(false);
  const [sheetHeight, setSheetHeight] = useState(0);
  const progress = useSharedValue(0);
  const dragY = useSharedValue(0);
  /**
   * The rise waits for the sheet's first layout, so it travels exactly its
   * own height. Started earlier, the distance would change mid-flight when
   * the measurement landed, and the sheet would visibly jump.
   */
  const pendingOpen = useRef(false);
  const [id] = useState(() => nextSheetId++);

  const finishClose = useCallback(() => {
    setMounted(false);
    setSheetHeight(0);
    release(id);
    onClosed?.();
  }, [onClosed, id]);

  useEffect(() => {
    if (visible) {
      claim(id, () => {
        dragY.value = 0;
        setMounted(true);
        if (sheetHeight > 0) progress.value = withSpring(1, springs.gentle);
        else pendingOpen.current = true;
      });
    } else if (!mounted) {
      // Asked to close while still waiting for its turn.
      waiting.delete(id);
    } else {
      pendingOpen.current = false;
      progress.value = withTiming(0, EXIT, (finished) => {
        if (finished) runOnJS(finishClose)();
      });
    }
    // `mounted` is read, not tracked: this reacts to the caller's intent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // A sheet unmounted while open (its screen went away) must not hold the
  // slot forever.
  useEffect(() => () => release(id), [id]);

  const travel = sheetHeight > 0 ? sheetHeight + 40 : screenHeight;

  const pan = Gesture.Pan()
    .activeOffsetY(6)
    .onUpdate((event) => {
      // Downward only, with a little give upward so it doesn't feel nailed.
      dragY.value = event.translationY > 0 ? event.translationY : event.translationY * 0.15;
    })
    .onEnd((event) => {
      if (dragY.value > DISMISS_DISTANCE || event.velocityY > DISMISS_VELOCITY) {
        runOnJS(onClose)();
        return;
      }
      dragY.value = withSpring(0, springs.snappy);
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(progress.value, [0, 1], [travel, 0]) + dragY.value }],
  }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.value }));

  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      setSheetHeight(Math.round(event.nativeEvent.layout.height));
      if (pendingOpen.current) {
        pendingOpen.current = false;
        progress.value = withSpring(1, springs.gentle);
      }
    },
    [progress],
  );

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      {/* A modal is a separate window: gestures inside it need their own root. */}
      <GestureHandlerRootView style={styles.fill}>
        <KeyboardAvoidingView behavior="padding" style={styles.fill}>
          <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}>
            <Pressable
              style={styles.fill}
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
            />
          </Animated.View>

          <View style={styles.anchor} pointerEvents="box-none">
            <Animated.View
              onLayout={onLayout}
              style={[styles.sheet, { maxHeight: screenHeight * 0.86 }, sheetStyle]}
            >
              <Glass variant="prominent" blur shadow radius={radius.xxl} style={StyleSheet.absoluteFill} />

              <GestureDetector gesture={pan}>
                <View style={styles.handleArea}>
                  <View style={styles.grabber} />
                  {header ??
                    (title != null && (
                      <View style={styles.header}>
                        {artworkUri !== undefined && (
                          <Artwork uri={artworkUri} size={48} round={artworkRound} />
                        )}
                        <View style={styles.headerText}>
                          <Text style={styles.title} numberOfLines={2}>
                            {title}
                          </Text>
                          {subtitle ? (
                            <Text style={styles.subtitle} numberOfLines={1}>
                              {subtitle}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    ))}
                </View>
              </GestureDetector>

              <View style={[styles.content, { paddingBottom: Math.max(insets.bottom, space[3]) + space[2] }]}>
                {children}
              </View>
            </Animated.View>
          </View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

export interface SheetRowProps {
  label: string;
  icon?: IconComponent;
  detail?: string;
  onPress: () => void;
  tone?: 'default' | 'accent' | 'destructive';
  disabled?: boolean;
  /** Keeps the sheet open — e.g. a row that toggles. */
  last?: boolean;
  /** Trailing element instead of the detail text. */
  accessory?: ReactNode;
}

export const SheetRow = memo(function SheetRow({
  label,
  icon: Icon,
  detail,
  onPress,
  tone = 'default',
  disabled = false,
  last = false,
  accessory,
}: SheetRowProps) {
  const color = useTheme();
  const styles = useThemedStyles(makeStyles);
  const ink =
    tone === 'destructive' ? color.destructive : tone === 'accent' ? color.accent : color.label;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        haptics.tick();
        onPress();
      }}
      style={({ pressed }) => [
        styles.row,
        !last && styles.rowLine,
        pressed && { backgroundColor: withAlpha(color.label, 0.06) },
        disabled && styles.disabled,
      ]}
    >
      {Icon && (
        <View style={styles.rowIcon}>
          <Icon size={20} color={ink} strokeWidth={1.9} />
        </View>
      )}
      <Text style={[styles.rowLabel, { color: ink }]} numberOfLines={1}>
        {label}
      </Text>
      {accessory ??
        (detail != null && (
          <Label tone="tertiary" style={styles.rowDetail}>
            {detail}
          </Label>
        ))}
    </Pressable>
  );
});

/** Pads arbitrary content — a text field, a row of keys — to the sheet's gutter. */
export function SheetBody({ children }: { children: ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  return <View style={styles.body}>{children}</View>;
}

/** A mono caption between groups of rows. */
export function SheetSection({ label }: { label: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.section}>
      <Label tone="tertiary">{label}</Label>
    </View>
  );
}

const makeStyles = (color: Palette) =>
  StyleSheet.create({
    fill: { flex: 1 },
    scrim: { backgroundColor: withAlpha(color.scrim, color.mode === 'light' ? 0.32 : 0.55) },
    anchor: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: space[2] },
    sheet: {
      borderRadius: radius.xxl,
      borderBottomLeftRadius: radius.xxl,
      borderBottomRightRadius: radius.xxl,
      overflow: 'hidden',
      marginBottom: space[2],
    },
    handleArea: { paddingBottom: space[2] },
    grabber: {
      alignSelf: 'center',
      width: 38,
      height: 5,
      borderRadius: radius.full,
      backgroundColor: color.labelTertiary,
      marginTop: space[2],
      opacity: 0.7,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[3],
      paddingHorizontal: layout.panelPadding + space[1],
      paddingTop: space[3],
    },
    headerText: { flex: 1 },
    title: { ...type.title3, color: color.label },
    subtitle: { ...type.subhead, color: color.labelSecondary, marginTop: 2 },
    content: { flexShrink: 1 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[3],
      minHeight: 54,
      paddingHorizontal: layout.panelPadding + space[1],
    },
    rowLine: { borderBottomWidth: hairline, borderBottomColor: color.separator },
    rowIcon: { width: 24, alignItems: 'center' },
    rowLabel: { ...type.body, flex: 1 },
    // Shrinks before the label does: a long album name must not squeeze
    // "Go to album" out of its own row.
    rowDetail: { marginLeft: space[3], flexShrink: 1, maxWidth: '52%', textAlign: 'right' },
    disabled: { opacity: 0.4 },
    body: { paddingHorizontal: layout.panelPadding + space[1], paddingTop: space[2] },
    section: {
      paddingHorizontal: layout.panelPadding + space[1],
      paddingTop: space[4],
      paddingBottom: space[1],
    },
  });
