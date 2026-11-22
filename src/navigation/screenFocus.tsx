import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useIsFocused } from '@react-navigation/native';

/**
 * Whether the screen a component sits in is the one on display.
 *
 * Tabs and stacks keep every visited screen mounted, so without this a
 * screen three pushes back still ran its level bars and repainted its
 * colour wash whenever the track changed — work nobody could see, taken
 * from the screen that is visible. Things that move or paint for their own
 * sake check this and hold still while their screen is out of view.
 *
 * Defaults to true outside navigation (the player overlay, sheets).
 */
const ScreenFocusContext = createContext(true);

export function useScreenFocused(): boolean {
  return useContext(ScreenFocusContext);
}

/**
 * Provides focus for a screen. Losing focus is reported a moment late, so a
 * screen sliding away under the next one keeps its paint for the length of
 * the transition; gaining it is immediate.
 */
export function ScreenFocusProvider({ children, lingerMs = 500 }: { children: ReactNode; lingerMs?: number }) {
  const focused = useIsFocused();
  const [visible, setVisible] = useState(focused);

  useEffect(() => {
    if (focused) {
      setVisible(true);
      return;
    }
    const timer = setTimeout(() => setVisible(false), lingerMs);
    return () => clearTimeout(timer);
  }, [focused, lingerMs]);

  return <ScreenFocusContext.Provider value={focused || visible}>{children}</ScreenFocusContext.Provider>;
}
