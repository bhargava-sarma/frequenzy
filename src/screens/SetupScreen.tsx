import { useRef, useState, type RefObject } from 'react';
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiError, NoReachableServerError } from '../api/errors';
import { ConfigError, type ServerConfig } from '../api/config';
import { Appear } from '../components/Appear';
import { DotText, Display } from '../components/Display';
import { GridPaper } from '../components/GridPaper';
import { IconPlugConnected, IconServer } from '../components/icons';
import { Keycap } from '../components/Keycap';
import { Label } from '../components/Label';
import { Led } from '../components/Led';
import { Panel } from '../components/Panel';
import { useServerStore, verifyServerConfig } from '../store/useServerStore';
import { layout, radius, space, type } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { haptics } from '../utils/haptics';

/**
 * First launch: point the app at a server.
 *
 * One server, reachable at up to two addresses — the copy says so, because
 * two URL fields could read as two servers. Credentials are verified against
 * the live server before anything is saved: saving first would strand the
 * app in a "ready" state that can't load anything.
 */
export function SetupScreen() {
  const color = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const saveConfig = useServerStore((state) => state.saveConfig);

  const [nickname, setNickname] = useState('');
  const [localUrl, setLocalUrl] = useState('');
  const [remoteUrl, setRemoteUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<string[]>([]);

  // The keyboard's own key walks the form, field to field, and connects from
  // the last — five fields is a lot of reaching up to tap the next one.
  const localRef = useRef<TextInput>(null);
  const remoteRef = useRef<TextInput>(null);
  const usernameRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const canSubmit =
    !busy && username.trim().length > 0 && password.length > 0 && (localUrl.trim().length > 0 || remoteUrl.trim().length > 0);

  async function connect(config?: ServerConfig) {
    setBusy(true);
    setError(null);
    setDetail([]);

    const candidate: ServerConfig = config ?? {
      nickname: nickname.trim() || undefined,
      localUrl: localUrl.trim() || undefined,
      remoteUrl: remoteUrl.trim() || undefined,
      username: username.trim(),
      password,
    };

    try {
      // The proven connection is handed over so the app's client starts warm.
      const connection = await verifyServerConfig(candidate);
      haptics.success();
      await saveConfig(candidate, connection);
    } catch (err) {
      haptics.error();
      if (err instanceof ApiError && err.isAuthError) {
        setError('Navidrome rejected these credentials.');
        setDetail(['The server answered, so the address is right — check the username and password.']);
      } else if (err instanceof NoReachableServerError) {
        setError('Could not reach the server.');
        setDetail(err.attempts.map((attempt) => `${attempt.url} — ${attempt.error}`));
      } else if (err instanceof ConfigError) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior="padding">
      <GridPaper />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space[6], paddingBottom: insets.bottom + space[6] }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Display style={styles.hero}>
          <View style={styles.heroTop}>
            <Label tone="displayDim">Portable lossless player</Label>
            <Led color={busy ? color.ledAmber : error ? color.ledRed : color.ledGreen} size={8} busy={busy} />
          </View>
          <DotText size={52} color={color.accent}>
            FQ-1
          </DotText>
          <Text style={styles.heroTitle}>Frequenzy</Text>
          <Text style={styles.heroCopy}>
            Connect to your Navidrome server. Music streams as the original file — never transcoded.
          </Text>
        </Display>

        <Panel label="01 — Server" style={styles.panel}>
          <Text style={styles.intro}>
            One server, reachable at up to two addresses. The local one is tried first; the remote one takes over
            when you're away.
          </Text>
          <Field
            label="Name"
            optional
            value={nickname}
            onChangeText={setNickname}
            placeholder="Home"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => localRef.current?.focus()}
          />
          <Field
            inputRef={localRef}
            label="Local address"
            value={localUrl}
            onChangeText={setLocalUrl}
            placeholder="http://192.168.1.10:4533"
            keyboardType="url"
            hint="Used on your home network."
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => remoteRef.current?.focus()}
          />
          <Field
            inputRef={remoteRef}
            label="Remote address"
            optional
            value={remoteUrl}
            onChangeText={setRemoteUrl}
            placeholder="http://100.64.0.1:4533"
            keyboardType="url"
            hint="Used when away — Tailscale, a VPN or a domain."
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => usernameRef.current?.focus()}
          />
        </Panel>

        <Panel label="02 — Login" style={styles.panel}>
          <Text style={styles.intro}>The same account works at both addresses.</Text>
          <Field
            inputRef={usernameRef}
            label="Username"
            value={username}
            onChangeText={setUsername}
            autoComplete="username"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />
          <Field
            inputRef={passwordRef}
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            autoComplete="current-password"
            onSubmitEditing={() => canSubmit && void connect()}
            returnKeyType="go"
            accessory={
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                hitSlop={10}
                onPress={() => setShowPassword((value) => !value)}
              >
                <Label tone="accent" bold>
                  {showPassword ? 'Hide' : 'Show'}
                </Label>
              </Pressable>
            }
          />
        </Panel>

        {error && (
          // Keyed on the message, so a second failure with a different cause
          // arrives as news rather than as the same box with new words.
          <Appear key={error} style={styles.error}>
            <Led color={color.ledRed} size={8} />
            <View style={styles.errorText}>
              <Text style={[type.headline, { color: color.label }]}>{error}</Text>
              {detail.map((line) => (
                <Text key={line} style={styles.errorDetail}>
                  {line}
                </Text>
              ))}
            </View>
          </Appear>
        )}

        <Keycap
          label={busy ? 'Connecting' : 'Connect'}
          icon={IconPlugConnected}
          variant="primary"
          size="lg"
          busy={busy}
          disabled={!canSubmit}
          onPress={() => void connect()}
          style={styles.connect}
        />

        {/* Navidrome's own public demo, with the credentials it publishes on
            navidrome.org — not a secret, and not anyone's private server. */}
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() =>
            void connect({
              nickname: 'Demo',
              remoteUrl: 'https://demo.navidrome.org',
              username: 'demo',
              password: 'demo',
            })
          }
          style={({ pressed }) => [styles.demo, pressed && styles.pressed]}
        >
          <IconServer size={16} color={color.labelSecondary} strokeWidth={2} />
          <Label tone="secondary">No server? Try the public demo</Label>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

interface FieldProps extends React.ComponentProps<typeof TextInput> {
  label: string;
  optional?: boolean;
  hint?: string;
  accessory?: React.ReactNode;
  /** So the field before this one can pass focus on. */
  inputRef?: RefObject<TextInput | null>;
}

function Field({ label, optional, hint, accessory, style, inputRef, ...inputProps }: FieldProps) {
  const color = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <View style={styles.fieldHeader}>
        <Label tone="secondary" bold>
          {label}
        </Label>
        {optional && <Label tone="tertiary">Optional</Label>}
      </View>
      <View style={[styles.inputWrap, focused && { borderColor: color.accent }]}>
        <TextInput
          ref={inputRef}
          style={[styles.input, style]}
          placeholderTextColor={color.labelTertiary}
          selectionColor={color.accent}
          cursorColor={color.accent}
          autoCapitalize="none"
          autoCorrect={false}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...inputProps}
        />
        {accessory}
      </View>
      {hint && <Text style={styles.fieldHint}>{hint}</Text>}
    </View>
  );
}

const makeStyles = (color: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: color.background },
    content: { paddingHorizontal: layout.screenPadding, gap: space[3] },
    hero: { padding: space[5], gap: space[1], borderRadius: radius.xl },
    heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space[2] },
    heroTitle: { ...type.title1, color: color.displayInk, marginTop: space[1] },
    heroCopy: { ...type.footnote, color: color.displayDim, lineHeight: 18, marginTop: space[1] },
    panel: {},
    intro: { ...type.footnote, color: color.labelSecondary, lineHeight: 18, marginBottom: space[4] },
    field: { marginBottom: space[4] },
    fieldHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space[2] },
    inputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space[2],
      borderWidth: 1,
      borderColor: color.border,
      borderRadius: radius.md,
      backgroundColor: color.surfaceSunken,
      paddingRight: space[3],
    },
    input: { ...type.body, color: color.label, flex: 1, height: 48, paddingHorizontal: space[3] },
    fieldHint: { ...type.footnote, color: color.labelSecondary, marginTop: space[1] },
    error: {
      flexDirection: 'row',
      gap: space[3],
      padding: space[4],
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: color.destructive,
      backgroundColor: color.surface,
    },
    errorText: { flex: 1, gap: space[1] },
    errorDetail: { ...type.mono, fontSize: 11, color: color.labelSecondary, lineHeight: 16 },
    connect: { marginTop: space[2] },
    demo: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space[2],
      paddingVertical: space[4],
    },
    pressed: { opacity: 0.6 },
  });
