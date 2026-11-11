import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Artwork } from './Artwork';
import type { IconComponent } from './icons';
import { Label } from './Label';
import { useMotion } from '../theme/motion';
import { hairline, layout, radius, space, stroke, type, withAlpha } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { haptics } from '../utils/haptics';

/**
 * A bottom sheet for short, decisive choices.
 *
 * A solid panel that slides up from the bottom edge while the scrim fades
 * in, and leaves the same way — kept mounted until its exit has played,
 * since a native modal unmounted mid-animation simply vanishes. The header
 * is a drag handle: pull it down past a threshold, or flick, and the sheet
 * goes; short of that it springs back, and the scrim lightens under the
 * pull to say where it is headed.
 *
 * The body scrolls. A sheet is capped below the full height of the screen,
 * and on a short phone a long menu doesn't fit under that cap; clipped, its
 * last rows were simply unreachable. Content that fits never moves. The
 * scroll doesn't fight the drag, because only the header listens for that.
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
  const { timings, springs } = useMotion();

  /**
   * What the sheet shows is frozen the moment it is asked to close.
   *
   * Callers describe a sheet from state they clear on close — a target row,
   * a prompt's mode — so the same render that says "close" also empties the
   * title and the rows. Drawn live, the sheet spent its whole exit as a
   * blank sliver, or with "Rename playlist" turned into "New playlist" on
   * the way down. It leaves showing what it was showing.
   */
  const live = { title, subtitle, artworkUri, artworkRound, header, children };
  const lastShown = useRef(live);
  if (visible) lastShown.current = live;
  const shown = lastShown.current;

  // Starts unmounted even when visible: opening goes through claim().
  const [mounted, setMounted] = useState(false);
  /** 0 below the screen edge, 1 in place. */
  const progress = useSharedValue(0);
  const dragY = useSharedValue(0);
  /**
   * How far the sheet travels: its own height and a little over. A shared
   * value, written straight from layout, so the distance is exact on the
   * frame the rise begins and stays right when the content changes height
   * while the sheet is up — a track's details arriving, a warning replacing
   * a list.
   */
  const travel = useSharedValue(screenHeight);
  /**
   * The rise waits for the sheet's first layout, so it travels exactly its
   * own height. Started earlier, the distance would change mid-flight when
   * the measurement landed, and the sheet would visibly jump.
   */
  const pendingOpen = useRef(false);
  const laidOut = useRef(false);
  const [id] = useState(() => nextSheetId++);

  const finishClose = useCallback(() => {
    laidOut.current = false;
    setMounted(false);
    release(id);
    onClosed?.();
  }, [onClosed, id]);

  useEffect(() => {
    if (visible) {
      claim(id, () => {
        dragY.value = 0;
        setMounted(true);
        if (laidOut.current) progress.value = withTiming(1, timings.enter);
        else pendingOpen.current = true;
      });
    } else if (!mounted) {
      // Asked to close while still waiting for its turn.
      waiting.delete(id);
    } else {
      pendingOpen.current = false;
      progress.value = withTiming(0, timings.exit, (finished) => {
        if (finished) runOnJS(finishClose)();
      });
    }
    // `mounted` is read, not tracked: this reacts to the caller's intent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // A sheet unmounted while open (its screen went away) must not hold the
  // slot forever.
  useEffect(() => () => release(id), [id]);

  const pan = Gesture.Pan()
    .activeOffsetY(6)
    .onUpdate((event) => {
      // Downward only, with a little give upward so it doesn't feel nailed.
      dragY.value = event.translationY > 0 ? event.translationY : event.translationY * 0.15;
    })
    .onEnd((event, success) => {
      // `success` is false when the system took the gesture back; that is
      // not a decision to dismiss.
      if (success && (dragY.value > DISMISS_DISTANCE || event.velocityY > DISMISS_VELOCITY)) {
        runOnJS(onClose)();
        return;
      }
      dragY.value = withSpring(0, springs.settle);
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * travel.value + dragY.value }],
  }));
  const scrimStyle = useAnimatedStyle(() => ({
    opacity:
      progress.value *
      interpolate(dragY.value, [0, Math.max(1, travel.value)], [1, 0.35], Extrapolation.CLAMP),
  }));

  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      travel.value = Math.round(event.nativeEvent.layout.height) + 40;
      laidOut.current = true;
      if (pendingOpen.current) {
        pendingOpen.current = false;
        progress.value = withTiming(1, timings.enter);
      }
    },
    [progress, travel, timings],
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
              <GestureDetector gesture={pan}>
                <View style={styles.handleArea}>
                  <View style={styles.grabber} />
                  {shown.header ??
                    (shown.title != null && (
                      <View style={styles.header}>
                        {shown.artworkUri !== undefined && (
                          <Artwork uri={shown.artworkUri} size={48} round={shown.artworkRound} />
                        )}
                        <View style={styles.headerText}>
                          <Text style={styles.title} numberOfLines={2}>
                            {shown.title}
                          </Text>
                          {shown.subtitle ? (
                            <Text style={styles.subtitle} numberOfLines={1}>
                              {shown.subtitle}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    ))}
                </View>
              </GestureDetector>

              <ScrollView
                style={styles.content}
                contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, space[3]) + space[2] }}
                bounces={false}
                // A sheet with a text field has its keys right under it; the
                // first tap must press the key, not just lower the keyboard.
                keyboardShouldPersistTaps="handled"
              >
                {shown.children}
              </ScrollView>
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
  /** The final row of its group: drawn without the hairline beneath it. */
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
      overflow: 'hidden',
      marginBottom: space[2],
      backgroundColor: color.surface,
      borderWidth: stroke,
      borderColor: color.border,
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
    // Sized by what it holds, and allowed to shrink under the sheet's cap —
    // which is what turns too much content into a scroll rather than a clip.
    content: { flexGrow: 0, flexShrink: 1 },
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
