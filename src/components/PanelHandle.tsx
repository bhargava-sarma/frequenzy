import { createContext, useContext, type ReactNode } from 'react';
import { GestureDetector, type PanGesture } from 'react-native-gesture-handler';

/**
 * The drag-to-dismiss gesture of the panel a component sits in.
 *
 * Panels hold scrolling lists, so the drag can't cover the whole panel —
 * pulling a list back to its top would close it. The panel's header wraps
 * itself in this instead (see PanelHandle), and only it drags.
 */
export const PanelDragContext = createContext<PanGesture | null>(null);

/** Makes its children the drag handle of the enclosing panel, if any. */
export function PanelHandle({ children }: { children: ReactNode }) {
  const gesture = useContext(PanelDragContext);
  if (!gesture) return <>{children}</>;
  return <GestureDetector gesture={gesture}>{children}</GestureDetector>;
}

