import { useEffect, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { Keycap, KeyRow } from './Keycap';
import { Sheet, SheetBody } from './Sheet';
import { radius, space, type } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';

/**
 * A sheet that asks for one line of text — naming or renaming a playlist,
 * writing its description.
 */
export interface PromptSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  placeholder: string;
  initialValue?: string;
  confirmLabel: string;
  /** Resolves when done; the sheet stays open, busy, until it does. */
  onConfirm: (value: string) => Promise<void> | void;
  /** Allow submitting an empty value (e.g. clearing a description). */
  allowEmpty?: boolean;
  multiline?: boolean;
}

export function PromptSheet({
  visible,
  onClose,
  title,
  placeholder,
  initialValue = '',
  confirmLabel,
  onConfirm,
  allowEmpty = false,
  multiline = false,
}: PromptSheetProps) {
  const color = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [value, setValue] = useState(initialValue);
  const [busy, setBusy] = useState(false);

  // Fresh each time it opens, so a cancelled edit never reappears.
  useEffect(() => {
    if (visible) {
      setValue(initialValue);
      setBusy(false);
    }
  }, [visible, initialValue]);

  const canSubmit = !busy && (allowEmpty || value.trim().length > 0);

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    try {
      await onConfirm(value.trim());
      onClose();
    } catch {
      // The caller has already said what went wrong; staying open keeps
      // what was typed so it can be tried again.
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <SheetBody>
        <TextInput
          style={[styles.input, multiline && styles.multiline]}
          value={value}
          onChangeText={setValue}
          placeholder={placeholder}
          placeholderTextColor={color.labelTertiary}
          selectionColor={color.accent}
          cursorColor={color.accent}
          autoFocus
          multiline={multiline}
          returnKeyType={multiline ? 'default' : 'done'}
          onSubmitEditing={multiline ? undefined : () => void submit()}
        />
        <View style={styles.actions}>
          <KeyRow>
            <Keycap label="Cancel" variant="secondary" flex onPress={onClose} />
            <Keycap
              label={confirmLabel}
              variant="primary"
              flex
              busy={busy}
              disabled={!canSubmit}
              onPress={() => void submit()}
            />
          </KeyRow>
        </View>
      </SheetBody>
    </Sheet>
  );
}

const makeStyles = (color: Palette) =>
  StyleSheet.create({
    input: {
      ...type.body,
      color: color.label,
      height: 50,
      paddingHorizontal: space[4],
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: color.border,
      backgroundColor: color.surfaceSunken,
    },
    multiline: { height: 110, paddingTop: space[3], textAlignVertical: 'top' },
    actions: { marginTop: space[4], marginBottom: space[2] },
  });
