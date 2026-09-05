import { forwardRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Frosted } from './Frosted';
import { IconX } from './icons';
import { hairline, icon, layout, space, type } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';

/**
 * The app's search field, on the same frosted card as the dock.
 *
 * Shared rather than reimplemented per screen. It appears on Search and on
 * every detail screen now, and four copies of a text field would drift —
 * the clear button in particular, which is easy to leave out and whose
 * absence is only noticed when a field cannot be emptied.
 *
 * `children` sits below the input inside the same card, which is how Search
 * joins its scope tabs to the field: one control for one job, the way the
 * dock joins the mini-player to the nav.
 */
export interface SearchFieldProps {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  /** Rendered under the input, inside the same card. */
  children?: ReactNode;
  autoFocus?: boolean;
}

export const SearchField = forwardRef<TextInput, SearchFieldProps>(function SearchField(
  { value, onChangeText, placeholder, children, autoFocus = false },
  ref,
) {
  const color = useTheme();
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.wrap}>
      <Frosted style={styles.card}>
        <View style={styles.inputWrap}>
          <TextInput
            ref={ref}
            style={styles.input}
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={color.textInverseSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus={autoFocus}
            returnKeyType="search"
          />

          {/* Android has no built-in clear affordance — clearButtonMode is
              iOS-only, which is why a field without this cannot be emptied. */}
          {value.length > 0 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              hitSlop={space[3]}
              onPress={() => onChangeText('')}
              style={({ pressed }) => [styles.clear, pressed && styles.pressed]}
            >
              <IconX
                size={icon.sizeSmall}
                strokeWidth={icon.strokeWidth}
                color={color.textInverseSecondary}
              />
            </Pressable>
          )}
        </View>

        {children}
      </Frosted>
    </View>
  );
});

const makeStyles = (color: Palette) =>
  StyleSheet.create({
    wrap: { paddingHorizontal: layout.screenPadding, paddingBottom: space[4] },
    card: {
      borderRadius: layout.dockRadius,
      borderWidth: hairline,
      borderColor: color.panelLine,
      overflow: 'hidden',
      padding: space[2],
      gap: space[2],
    },
    inputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingRight: space[2],
    },
    input: {
      ...type.body,
      color: color.textInverse,
      flex: 1,
      height: 44,
      paddingHorizontal: space[3],
    },
    clear: { padding: space[1] },
    pressed: { opacity: 0.6 },
  });
