import { Component, Fragment, type ComponentType, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { describeError, recordCrash } from '../data/crashLog';
import type { Palette } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';

/**
 * Keeps one broken surface from taking the app with it.
 *
 * Without a boundary, an error while rendering any component unmounts the
 * whole tree — on a phone, the app simply closes. With one around each
 * screen and each part of the player, the failure is contained to where it
 * happened: that surface shows what went wrong and offers a way out, and
 * everything else, including playback, carries on. The error is also written
 * to the crash log so it can be reported.
 */

interface BoundaryProps {
  /** Where this boundary sits, for the log: "Album", "player", "app". */
  scope: string;
  children: ReactNode;
  /** A second way out besides retrying — back, or close the player. */
  exit?: { label: string; onPress: () => void };
  /** Fills its parent (screens) rather than sizing to content. */
  fill?: boolean;
  /**
   * Renders nothing on error instead of the panel — for small pieces whose
   * absence is better than a full-size error card: the mini player, the
   * toast host. The error is still logged.
   */
  silent?: boolean;
}

interface BoundaryState {
  error: Error | null;
  /** Bumped by "Try again" so the children mount afresh. */
  attempt: number;
}

export class ErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { error: null, attempt: 0 };

  static getDerivedStateFromError(error: unknown): Partial<BoundaryState> {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    const { message, stack } = describeError(error);
    void recordCrash({
      scope: this.props.scope,
      message,
      stack,
      componentStack: info.componentStack ?? undefined,
      fatal: false,
    });
  }

  private retry = () => {
    this.setState((state) => ({ error: null, attempt: state.attempt + 1 }));
  };

  render() {
    const { error, attempt } = this.state;
    if (error && this.props.silent) return null;
    if (error) {
      return (
        <Fallback
          error={error}
          scope={this.props.scope}
          fill={this.props.fill ?? true}
          onRetry={this.retry}
          exit={this.props.exit}
        />
      );
    }
    // The key remounts the subtree on retry, so it starts from clean state
    // rather than re-rendering whatever state threw.
    if (this.props.silent) {
      // No wrapper: these children position themselves absolutely against
      // the parent (the toast host), and an extra view would become that
      // parent.
      return <Fragment key={attempt}>{this.props.children}</Fragment>;
    }
    if (this.props.fill === false) {
      return <View key={attempt}>{this.props.children}</View>;
    }
    return (
      <View key={attempt} style={styles.fill}>
        {this.props.children}
      </View>
    );
  }
}

function Fallback({
  error,
  scope,
  fill,
  onRetry,
  exit,
}: {
  error: Error;
  scope: string;
  fill: boolean;
  onRetry: () => void;
  exit?: { label: string; onPress: () => void };
}) {
  // Only plain components and a context read here: the fallback must not be
  // able to fail the way the thing it replaced did.
  const color = useTheme();
  const s = makeStyles(color);
  return (
    <View style={[s.root, fill && styles.fill]}>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.light} />
        <Text style={s.title}>Something went wrong here</Text>
        <Text style={s.body}>
          This part of the app hit an error and was stopped before it could close the rest. Playback is not
          affected. The details are saved in Settings → Diagnostics.
        </Text>
        <Text style={s.detail} numberOfLines={4} selectable>
          {`${scope}: ${error.message}`}
        </Text>
        <View style={s.keys}>
          <Pressable
            accessibilityRole="button"
            onPress={onRetry}
            style={({ pressed }) => [s.key, s.primary, pressed && styles.pressed]}
          >
            <Text style={[s.keyLabel, { color: color.accentInk }]}>TRY AGAIN</Text>
          </Pressable>
          {exit && (
            <Pressable
              accessibilityRole="button"
              onPress={exit.onPress}
              style={({ pressed }) => [s.key, pressed && styles.pressed]}
            >
              <Text style={s.keyLabel}>{exit.label.toUpperCase()}</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * Wraps a screen component in its own boundary. The fallback offers Back
 * when there is somewhere to go back to.
 */
export function withScreenBoundary<P extends object>(Screen: ComponentType<P>, scope: string): ComponentType<P> {
  function Bounded(props: P) {
    const navigation = (props as { navigation?: { canGoBack(): boolean; goBack(): void } }).navigation;
    const exit =
      navigation && navigation.canGoBack()
        ? { label: 'Back', onPress: () => navigation.goBack() }
        : undefined;
    return (
      <ErrorBoundary scope={scope} exit={exit}>
        <Screen {...props} />
      </ErrorBoundary>
    );
  }
  Bounded.displayName = `Bounded(${scope})`;
  return Bounded;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  pressed: { opacity: 0.6 },
});

const makeStyles = (color: Palette) =>
  StyleSheet.create({
    root: { backgroundColor: color.background, justifyContent: 'center' },
    content: { flexGrow: 1, justifyContent: 'center', padding: 24, paddingTop: 80 },
    light: { width: 10, height: 10, borderRadius: 5, backgroundColor: color.ledRed, marginBottom: 16 },
    title: { fontSize: 20, fontWeight: '700', color: color.label },
    body: { fontSize: 14, lineHeight: 20, color: color.labelSecondary, marginTop: 8 },
    detail: {
      fontSize: 12,
      lineHeight: 17,
      color: color.labelTertiary,
      marginTop: 16,
      fontFamily: 'monospace',
    },
    keys: { flexDirection: 'row', gap: 8, marginTop: 24 },
    key: {
      height: 44,
      paddingHorizontal: 18,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: color.border,
      backgroundColor: color.surfaceRaised,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primary: { backgroundColor: color.accent, borderColor: color.accent },
    keyLabel: { fontSize: 12, letterSpacing: 1.2, fontWeight: '700', color: color.label },
  });
