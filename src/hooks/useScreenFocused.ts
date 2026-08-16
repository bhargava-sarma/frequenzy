import { useContext } from 'react';
import { NavigationContext, useIsFocused } from '@react-navigation/native';

/**
 * Whether the surrounding screen is on show — tolerating not being in one.
 *
 * `useIsFocused` throws outside a navigator, and the player is an overlay
 * above the navigator rather than a screen inside it. Components shared
 * between the two need an answer either way, so this reads the navigation
 * context first and only asks about focus when there is a screen to ask
 * about. With no screen there is nothing to be unfocused from, so the answer
 * is yes: an overlay is visible whenever it is mounted.
 *
 * Both hooks are called unconditionally, as the rules of hooks require —
 * useIsFocused is safe to call once the context is known to exist, and the
 * context's presence cannot change for a given component.
 */
export function useScreenFocused(): boolean {
  const navigation = useContext(NavigationContext);
  const focused = useIsFocusedSafely(navigation != null);
  return navigation == null ? true : focused;
}

/**
 * Calls useIsFocused only when there is a navigator to consult.
 *
 * Split out so the conditional lives in one place, and so the throw it exists
 * to avoid cannot creep back in via a future caller.
 */
function useIsFocusedSafely(hasNavigator: boolean): boolean {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return hasNavigator ? useIsFocused() : true;
}
