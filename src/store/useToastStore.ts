import { create } from 'zustand';

/**
 * Transient confirmations: "Added to queue", "Liked", "Couldn't reach the
 * server".
 *
 * Swipe actions and sheet rows act without leaving the screen, and an action
 * with no visible result reads as an action that didn't happen — so the most
 * common reason to swipe twice. One toast at a time: a newer one replaces
 * the current rather than stacking, because a stack of confirmations is a
 * log, not feedback.
 */

export type ToastTone = 'default' | 'success' | 'error';

export type ToastIcon =
  | 'check'
  | 'queue'
  | 'next'
  | 'heart'
  | 'heartOff'
  | 'playlist'
  | 'moon'
  | 'radio'
  | 'error'
  | 'info';

export interface ToastAction {
  label: string;
  onPress: () => void;
}

export interface Toast {
  id: number;
  message: string;
  detail?: string;
  tone: ToastTone;
  icon?: ToastIcon;
  action?: ToastAction;
  /** Milliseconds on screen. */
  duration: number;
}

interface ToastStore {
  current: Toast | null;
  show: (message: string, options?: Partial<Omit<Toast, 'id' | 'message'>>) => number;
  dismiss: (id?: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastStore>((set, get) => ({
  current: null,

  show: (message, options = {}) => {
    const id = nextId++;
    const tone = options.tone ?? 'default';
    set({
      current: {
        id,
        message,
        detail: options.detail,
        tone,
        icon: options.icon ?? (tone === 'error' ? 'error' : tone === 'success' ? 'check' : undefined),
        action: options.action,
        // Errors and anything with an action stay long enough to be read
        // and pressed; plain confirmations get out of the way.
        duration: options.duration ?? (tone === 'error' || options.action ? 4200 : 2400),
      },
    });
    return id;
  },

  dismiss: (id) => {
    const current = get().current;
    if (!current) return;
    if (id != null && current.id !== id) return;
    set({ current: null });
  },
}));

/** Callable from anywhere — stores, modules, worklet callbacks via runOnJS. */
export const toast = {
  show: (message: string, options?: Partial<Omit<Toast, 'id' | 'message'>>) =>
    useToastStore.getState().show(message, options),
  success: (message: string, options?: Partial<Omit<Toast, 'id' | 'message' | 'tone'>>) =>
    useToastStore.getState().show(message, { ...options, tone: 'success' }),
  error: (message: string, options?: Partial<Omit<Toast, 'id' | 'message' | 'tone'>>) =>
    useToastStore.getState().show(message, { ...options, tone: 'error' }),
  /**
   * Runs fire-and-forget work and says so if it fails.
   *
   * A key that starts playback kicks off a promise nobody awaits. Left bare,
   * a failure — the server out of reach, the player refusing a queue — is an
   * unhandled rejection: nothing plays and nothing says why, which reads as
   * a dead button. Pass `quiet` errors (a mix that found nothing, say) as
   * a class to be shown as information rather than as a fault.
   */
  guard: (work: Promise<unknown>, failure = "Couldn't play", quiet?: new (...args: never[]) => Error): void => {
    work.catch((error: unknown) => {
      if (quiet && error instanceof quiet) {
        useToastStore.getState().show(error.message, { icon: 'info' });
        return;
      }
      useToastStore.getState().show(failure, { tone: 'error', detail: errorMessage(error) });
    });
  },
};

/** A readable message from anything thrown. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    // Subsonic errors carry the endpoint for logs; the person needs the reason.
    const match = /Subsonic error \d+ on \w+: (.*)$/.exec(error.message);
    if (match) return match[1];
    if (/Could not reach the server/.test(error.message)) return 'Server unreachable';
    if (/Network request failed|Timed out after/.test(error.message)) return 'Server unreachable';
    return error.message;
  }
  return String(error);
}
