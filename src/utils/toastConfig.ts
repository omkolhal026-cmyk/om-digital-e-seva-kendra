/**
 * Centralized Global Toast Notification Configuration & Event Bus
 * All Toast Notifications across the entire software dismiss automatically after exactly 2000ms (2 seconds).
 */

export const GLOBAL_TOAST_DURATION = 2000; // 2 seconds (2000 milliseconds)

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;
}

type ToastListener = (toast: ToastItem) => void;
type DismissListener = (id: string) => void;

const listeners = new Set<ToastListener>();
const dismissListeners = new Set<DismissListener>();

export const toast = {
  duration: GLOBAL_TOAST_DURATION,

  show: (options: {
    type?: ToastType;
    title?: string;
    message: string;
    duration?: number;
  }): string => {
    const id =
      'toast-' + Math.random().toString(36).substring(2, 9) + '-' + Date.now().toString(36);
    const item: ToastItem = {
      id,
      type: options.type || 'info',
      title: options.title,
      message: options.message,
      duration: options.duration ?? GLOBAL_TOAST_DURATION,
    };
    listeners.forEach((listener) => {
      try {
        listener(item);
      } catch (err) {
        console.error('Toast listener error:', err);
      }
    });
    return id;
  },

  success: (message: string, title?: string, duration?: number): string => {
    return toast.show({ type: 'success', message, title, duration });
  },

  error: (message: string, title?: string, duration?: number): string => {
    return toast.show({ type: 'error', message, title, duration });
  },

  warning: (message: string, title?: string, duration?: number): string => {
    return toast.show({ type: 'warning', message, title, duration });
  },

  info: (message: string, title?: string, duration?: number): string => {
    return toast.show({ type: 'info', message, title, duration });
  },

  dismiss: (id: string) => {
    dismissListeners.forEach((listener) => {
      try {
        listener(id);
      } catch (err) {
        console.error('Toast dismiss listener error:', err);
      }
    });
  },

  subscribe: (listener: ToastListener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  onDismiss: (listener: DismissListener) => {
    dismissListeners.add(listener);
    return () => {
      dismissListeners.delete(listener);
    };
  },
};

// Also attach to window for easy debugging or global invocation
if (typeof window !== 'undefined') {
  (window as any).toast = toast;
}
