import { forwardRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Glass } from './Glass';
import { IconSearch, IconX } from './icons';
import { layout, radius, space, type } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { haptics } from '../utils/haptics';

/**
 * The app's search field: a glass capsule with a glyph and a clear key.
 *
 * Shared rather than reimplemented per screen — it appears on Search and as
 * the filter on every long list, and the clear button in particular is easy
 * to leave out and only missed when a field can't be emptied (Android has no
 * built-in one). `children` sits under the input inside the same capsule.
 */
export interface SearchFieldProps {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  children?: ReactNode;
  autoFocus?: boolean;
  onSubmitEditing?: () => void;
  /** Drop the screen gutter, for fields inside padded containers. */
  inset?: boolean;
}

export const SearchField = forwardRef<TextInput, SearchFieldProps>(function SearchField(
  { value, onChangeText, placeholder, children, autoFocus = false, onSubmitEditing, inset = true },
  ref,
) {
  const color = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={inset && styles.wrap}>
      <View style={styles.card}>
        <Glass variant="regular" blur radius={radius.lg} style={StyleSheet.absoluteFill} />
        <View style={styles.inputRow}>
          <IconSearch size={18} color={color.labelSecondary} strokeWidth={2} />
          <TextInput
            ref={ref}
            style={styles.input}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={color.labelTertiary}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus={autoFocus}
            returnKeyType="search"
            selectionColor={color.accent}
            cursorColor={color.accent}
            onSubmitEditing={onSubmitEditing}
          />
          {value.length > 0 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear"
              hitSlop={12}
              onPress={() => {
                haptics.tick();
                onChangeText('');
              }}
              style={({ pressed }) => [styles.clear, pressed && styles.pressed]}
            >
              <IconX size={14} color={color.background} strokeWidth={3} />
            </Pressable>
          )}
        </View>
        {children}
      </View>
    </View>
  );
});

const makeStyles = (color: Palette) =>
  StyleSheet.create({
    wrap: { paddingHorizontal: layout.screenPadding, paddingBottom: space[3] },
    card: { borderRadius: radius.lg },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingLeft: space[3] + 2,
      paddingRight: space[3],
      gap: space[2],
    },
    input: {
      ...type.body,
      color: color.label,
      flex: 1,
      height: 46,
      paddingVertical: 0,
    },
    clear: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: color.labelTertiary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: { opacity: 0.6 },
  });
