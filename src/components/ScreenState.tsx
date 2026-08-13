import { StyleSheet, Text, View } from 'react-native';

import { Button } from './Button';
import { color, layout, space, type } from '../theme/tokens';

/**
 * Loading, empty and error states.
 *
 * Deliberately typographic rather than a spinner. The spec asks for states
 * that respect the design language, and a centred Material spinner is exactly
 * the generic look the whole design is avoiding — a tracked-out label reads as
 * a status readout on a panel, which is the intent.
 */

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <View style={styles.root}>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

export function EmptyState({ label, hint }: { label: string; hint?: string }) {
  return (
    <View style={styles.root}>
      <Text style={styles.label}>{label}</Text>
      {hint != null && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.root}>
      <Text style={[styles.label, styles.errorLabel]}>Something went wrong</Text>
      <Text style={styles.hint}>{message}</Text>
      {onRetry && (
        <View style={styles.action}>
          <Button label="Try again" onPress={onRetry} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: layout.screenPadding,
    paddingVertical: space[6],
  },
  label: { ...type.label, color: color.textSecondary },
  errorLabel: { color: color.accent },
  hint: {
    ...type.meta,
    color: color.textSecondary,
    marginTop: space[3],
    textAlign: 'center',
    lineHeight: 18,
  },
  action: { marginTop: space[5] },
});
