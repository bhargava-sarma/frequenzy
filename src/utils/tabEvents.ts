/**
 * A one-signal bus between the tab bar and the search screen.
 *
 * React Navigation delivers `tabPress` to the component registered in the tab
 * navigator, which here is the search *stack* — not the screen inside it that
 * owns the text input. Threading a ref down through the navigator to reach it
 * is more machinery than one boolean signal deserves, so this carries it
 * instead.
 *
 * Deliberately not a general event emitter: one named signal, no payloads,
 * nothing to grow into a second messaging system.
 */

type Listener = () => void;

const listeners = new Set<Listener>();

/** Fired when Search is tapped while already the active tab. */
export function emitSearchRequested(): void {
  for (const listener of listeners) listener();
}

/** Returns an unsubscribe. */
export function onSearchRequested(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
