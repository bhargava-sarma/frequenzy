import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

/**
 * Where real blur comes from, and who is allowed to use it.
 *
 * On Android, expo-blur blurs nothing by itself. A BlurView with
 * blurMethod 'dimezisBlurViewSdk31Plus' blurs the content of a BlurTargetView
 * it is pointed at through `blurTarget`, and with no target it silently falls
 * back to a flat tint — which is all the dock has ever been. The library
 * underneath (Dimezis BlurView 3.1) records the target's children into a
 * RenderNode and draws a blurred copy of that node inside the BlurView, so:
 *
 *   - A BlurView must never sit inside the target it blurs. Its own drawing
 *     would become part of the snapshot it is drawing — a render-node cycle.
 *   - Targets may nest, and a BlurView inside one target may blur another.
 *
 * This module turns those two rules into structure rather than something
 * every screen must remember:
 *
 *   - <BlurTarget> wraps content that can be blurred. Everything rendered
 *     inside it is told there is no target, so a Glass inside it can only
 *     ever fake its glass.
 *   - <GlassStage> pairs content with an overlay: the content goes into a
 *     target, the overlay is rendered as its sibling and told about it. A
 *     navigation bar over a list is the case it exists for.
 *   - Named targets let a surface outside a navigator's screens — the tab bar
 *     — point at the screen the navigator is showing.
 *
 * Glass reads useBlurTarget(); it never needs to know which of these supplied
 * the answer.
 */

/**
 * Resolved once at module load. The native module cannot appear during a
 * session — only a new binary changes the answer — so a JS-only update
 * against an older build keeps working and simply never blurs.
 */
const HAS_NATIVE_BLUR = requireOptionalNativeModule('ExpoBlur') != null;

const ANDROID_API = Platform.OS === 'android' ? Number(Platform.Version) : 0;

/**
 * Whether real blur can render at all on this device.
 *
 * Android below 31 is excluded here rather than left to expo-blur's own
 * fallback: that fallback paints a grey of its own on top of our tint, and
 * the RenderScript path it would otherwise use is slow enough to cost frames
 * on exactly the older phones that can least afford it.
 */
export const realBlurSupported =
  HAS_NATIVE_BLUR && (Platform.OS === 'ios' || (Platform.OS === 'android' && ANDROID_API >= 31));

/** iOS blurs whatever is behind a view without being told what that is. */
export const blurNeedsTarget = Platform.OS === 'android';

type TargetViewComponent = React.ComponentType<{
  ref?: React.Ref<View>;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  collapsable?: boolean;
}>;

/**
 * Required lazily, and only when the native side is actually present.
 *
 * expo-blur resolves its native view managers at import time, so a static
 * import would reach for components this binary may not have. Requiring it
 * behind the check means a build without blur never loads the module at all.
 *
 * Chosen once for the whole session: swapping a target between a native view
 * and a plain View would remount everything inside it, which for a tab is the
 * whole navigation stack.
 */
const TargetView: TargetViewComponent = realBlurSupported
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('expo-blur').BlurTargetView as TargetViewComponent)
  : (View as unknown as TargetViewComponent);

export interface ResolvedBlurTarget {
  ref: RefObject<View | null>;
  /**
   * Identity of the target. expo-blur only re-resolves its target when the
   * ref object changes, so Glass keys its BlurView on this to remount when a
   * surface is pointed somewhere new.
   */
  id: string;
}

/** Null means "no blur target reachable from here" — fake the glass. */
const TargetContext = createContext<ResolvedBlurTarget | null>(null);

/** The blur target a Glass here may blur, or null. */
export function useBlurTarget(): ResolvedBlurTarget | null {
  return useContext(TargetContext);
}

// ---------------------------------------------------------------------------
// Named targets
// ---------------------------------------------------------------------------

interface Registry {
  /** Names whose target view is mounted, mapped to their ref. */
  ready: Record<string, RefObject<View | null>>;
  setReady: (name: string, ref: RefObject<View | null> | null) => void;
}

const RegistryContext = createContext<Registry | null>(null);

/**
 * Holds the named blur targets. Mounted once at the app root.
 *
 * Readiness lives in state rather than only in refs because a BlurView must
 * not mount before its target does: expo-blur reads the target's native
 * handle once, on mount, and never looks again for the same ref object.
 */
export function GlassProvider({ children }: { children: ReactNode }) {
  const [ready, setReadyState] = useState<Record<string, RefObject<View | null>>>({});

  const setReady = useCallback((name: string, ref: RefObject<View | null> | null) => {
    setReadyState((current) => {
      if (ref) {
        if (current[name] === ref) return current;
        return { ...current, [name]: ref };
      }
      if (!(name in current)) return current;
      const { [name]: _removed, ...rest } = current;
      return rest;
    });
  }, []);

  const value = useMemo<Registry>(() => ({ ready, setReady }), [ready, setReady]);

  return <RegistryContext.Provider value={value}>{children}</RegistryContext.Provider>;
}

export interface BlurTargetProps {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /**
   * Registers this target under a name, for surfaces outside this subtree to
   * find through <BlurTargetScope>. Omit for a purely local target.
   */
  name?: string;
}

/**
 * Content that glass elsewhere may blur.
 *
 * Renders a plain View where real blur is unavailable, so wrapping content in
 * one is always safe. Children are cut off from any outer target: nothing
 * inside a target may blur it, and nothing here can tell whether an outer
 * target contains this one, so the only safe answer inside is "fake it".
 */
export function BlurTarget({ children, style, name }: BlurTargetProps) {
  const registry = useContext(RegistryContext);
  const ref = useRef<View | null>(null);
  const setReady = registry?.setReady;

  const attach = useCallback(
    (node: View | null) => {
      ref.current = node;
      if (name && setReady) setReady(name, node ? ref : null);
    },
    [name, setReady],
  );

  return (
    <TargetView ref={attach} style={style} collapsable={false}>
      <TargetContext.Provider value={null}>{children}</TargetContext.Provider>
    </TargetView>
  );
}

/**
 * Points glass in this subtree at a named target.
 *
 * Renders no view of its own, so it can wrap an absolutely positioned bar
 * without affecting its layout. Until the named target has mounted — a lazy
 * tab that has never been visited — glass here fakes it.
 */
export function BlurTargetScope({ name, children }: { name: string; children: ReactNode }) {
  const registry = useContext(RegistryContext);
  const ref = registry?.ready[name];

  const value = useMemo<ResolvedBlurTarget | null>(
    () => (ref ? { ref, id: name } : null),
    [ref, name],
  );

  return <TargetContext.Provider value={value}>{children}</TargetContext.Provider>;
}

// ---------------------------------------------------------------------------
// Local stage
// ---------------------------------------------------------------------------

let stageCounter = 0;

export interface GlassStageProps {
  /** Blurrable content — the list, the ambient background. */
  children?: ReactNode;
  /**
   * Rendered on top of the content as its sibling. Glass here with `blur`
   * really blurs the content. Position it yourself (usually absolute).
   */
  overlay?: ReactNode;
  /** Outer container. Usually `{ flex: 1 }` plus the screen background. */
  style?: StyleProp<ViewStyle>;
  /** Style of the target wrapping `children`. Defaults to filling the stage. */
  contentStyle?: StyleProp<ViewStyle>;
}

/**
 * Content plus the glass that floats over it, wired so the glass can blur it.
 *
 *   <GlassStage style={styles.root} overlay={<GlassNavBar ... />}>
 *     <AmbientBackground />
 *     <Animated.FlatList ... />
 *   </GlassStage>
 */
export function GlassStage({ children, overlay, style, contentStyle }: GlassStageProps) {
  const ref = useRef<View | null>(null);
  const [mounted, setMounted] = useState(false);
  const [id] = useState(() => `stage-${++stageCounter}`);

  const attach = useCallback((node: View | null) => {
    ref.current = node;
    setMounted(node != null);
  }, []);

  const target = useMemo<ResolvedBlurTarget | null>(
    () => (mounted ? { ref, id } : null),
    [mounted, id],
  );

  return (
    <View style={style}>
      <TargetView ref={attach} style={contentStyle ?? StyleSheet.absoluteFill} collapsable={false}>
        <TargetContext.Provider value={null}>{children}</TargetContext.Provider>
      </TargetView>
      <TargetContext.Provider value={target}>{overlay}</TargetContext.Provider>
    </View>
  );
}
