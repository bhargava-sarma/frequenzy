import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
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
import { useServerStore, verifyServerConfig } from '../store/useServerStore';
import { color, hairline, layout, radius, space, type } from '../theme/tokens';

/**
 * First-launch server setup.
 *
 * Presents ONE server with two candidate addresses, matching how the client
 * models it. Two URL fields could read as "two servers", so the copy is
 * explicit that this is a single library reachable two ways and that the
 * credentials below apply to both.
 *
 * Credentials are verified against the live server before being persisted —
 * saving first would strand the user in a state the app considers "ready" but
 * that cannot load anything.
 */
export function SetupScreen() {
  const insets = useSafeAreaInsets();
  const saveConfig = useServerStore((state) => state.saveConfig);

  const [nickname, setNickname] = useState('');
  const [localUrl, setLocalUrl] = useState('');
  const [remoteUrl, setRemoteUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<string[]>([]);

  const canSubmit =
    !busy &&
    username.trim().length > 0 &&
    password.length > 0 &&
    (localUrl.trim().length > 0 || remoteUrl.trim().length > 0);

  async function handleConnect() {
    setBusy(true);
    setError(null);
    setDetail([]);

    const config: ServerConfig = {
      nickname: nickname.trim() || undefined,
      localUrl: localUrl.trim() || undefined,
      remoteUrl: remoteUrl.trim() || undefined,
      username: username.trim(),
      password,
    };

    try {
      // Hand the proven connection to the store so the app's client starts
      // warm rather than re-probing an address we just confirmed.
      const connection = await verifyServerConfig(config);
      await saveConfig(config, connection);
      // No navigation needed — the root switches on store status.
    } catch (err) {
      if (err instanceof ApiError && err.isAuthError) {
        setError('Navidrome rejected these credentials.');
        setDetail(['The server answered, so the addresses are right — check the username and password.']);
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
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space[6], paddingBottom: insets.bottom + space[6] },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Text style={styles.sectionLabel}>Server</Text>
        <Text style={styles.intro}>
          One Navidrome server, reachable at up to two addresses. The app tries the local
          address first and falls back to the remote one automatically.
        </Text>

        <Field
          label="Nickname"
          optional
          value={nickname}
          onChangeText={setNickname}
          placeholder="Home"
        />

        <Field
          label="Local address"
          value={localUrl}
          onChangeText={setLocalUrl}
          placeholder="http://192.168.1.10:4533"
          keyboardType="url"
          hint="Used on home Wi-Fi."
        />

        <Field
          label="Remote address"
          optional
          value={remoteUrl}
          onChangeText={setRemoteUrl}
          placeholder="http://100.x.y.z:4533"
          keyboardType="url"
          hint="Used when away. Can be added later."
        />

        <Text style={[styles.sectionLabel, styles.sectionSpaced]}>Login</Text>
        <Text style={styles.intro}>The same credentials apply to both addresses.</Text>

        <Field
          label="Username"
          value={username}
          onChangeText={setUsername}
          autoComplete="username"
        />

        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
        />

        {error && (
          <View style={styles.errorBlock}>
            <Text style={styles.errorText}>{error}</Text>
            {detail.map((line) => (
              <Text key={line} style={styles.errorDetail}>
                {line}
              </Text>
            ))}
          </View>
        )}

        <Pressable
          style={({ pressed }) => [
            styles.button,
            !canSubmit && styles.buttonDisabled,
            pressed && canSubmit && styles.buttonPressed,
          ]}
          onPress={handleConnect}
          disabled={!canSubmit}
        >
          {busy ? (
            <ActivityIndicator color={color.accentInk} />
          ) : (
            <Text style={styles.buttonText}>Connect</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

interface FieldProps extends React.ComponentProps<typeof TextInput> {
  label: string;
  optional?: boolean;
  hint?: string;
}

function Field({ label, optional, hint, style, ...inputProps }: FieldProps) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldHeader}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {optional && <Text style={styles.fieldOptional}>Optional</Text>}
      </View>
      <TextInput
        style={[styles.input, style]}
        placeholderTextColor={color.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        {...inputProps}
      />
      {hint && <Text style={styles.fieldHint}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.paper },
  // Vertical padding is applied inline from safe-area insets.
  content: { paddingHorizontal: layout.screenPadding },

  sectionLabel: { ...type.label, color: color.textSecondary },
  sectionSpaced: { marginTop: space[6] },
  intro: {
    ...type.meta,
    color: color.textSecondary,
    marginTop: space[2],
    marginBottom: space[4],
    lineHeight: 18,
  },

  field: { marginBottom: space[4] },
  fieldHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fieldLabel: { ...type.body, color: color.textPrimary },
  fieldOptional: { ...type.meta, color: color.textSecondary },
  input: {
    ...type.body,
    color: color.textPrimary,
    borderWidth: hairline,
    borderColor: color.paperLine,
    borderRadius: radius.sm,
    paddingHorizontal: space[3],
    height: 44,
    marginTop: space[2],
    backgroundColor: color.paper,
  },
  fieldHint: { ...type.meta, color: color.textSecondary, marginTop: space[1] },

  errorBlock: {
    borderLeftWidth: 2,
    borderLeftColor: color.accent,
    paddingLeft: space[3],
    marginBottom: space[4],
  },
  errorText: { ...type.body, color: color.accent },
  errorDetail: { ...type.meta, color: color.textSecondary, marginTop: space[1] },

  button: {
    height: 48,
    borderRadius: radius.sm,
    backgroundColor: color.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space[2],
  },
  buttonDisabled: { backgroundColor: color.paperDim },
  buttonPressed: { opacity: 0.8 },
  buttonText: { ...type.body, color: color.accentInk },
});
