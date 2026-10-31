import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { toast, ToastItem, GLOBAL_TOAST_DURATION } from '../utils/toastConfig';

export const GlobalToastContainer: React.FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, NodeJS.Timeout | number>>(new Map());

  const removeToast = (id: string) => {
    // Clear and delete timer to prevent memory leaks and duplicate execution
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  useEffect(() => {
    const unsubscribeAdd = toast.subscribe((newToast) => {
      setToasts((prev) => {
        // Prevent duplicate IDs
        const filtered = prev.filter((t) => t.id !== newToast.id);
        return [...filtered, newToast];
      });

      // Clear any existing timer for this ID
      const existingTimer = timersRef.current.get(newToast.id);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      // Schedule auto-dismissal after exactly duration (default 2000ms)
      const duration = newToast.duration ?? GLOBAL_TOAST_DURATION;
      const timer = setTimeout(() => {
        removeToast(newToast.id);
      }, duration);

      timersRef.current.set(newToast.id, timer);
    });

    const unsubscribeDismiss = toast.onDismiss((id) => {
      removeToast(id);
    });

    return () => {
      unsubscribeAdd();
      unsubscribeDismiss();
      // Clean up all pending timers on unmount
      timersRef.current.forEach((timer) => clearTimeout(timer));
      timersRef.current.clear();
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-6 right-6 z-[9999] max-w-md w-full sm:w-auto flex flex-col gap-2.5 pointer-events-none px-4 sm:px-0"
    >
      {toasts.map((item) => {
        const isSuccess = item.type === 'success';
        const isError = item.type === 'error';
        const isWarning = item.type === 'warning';

        return (
          <div
            key={item.id}
            role="alert"
            className={`pointer-events-auto p-4 rounded-2xl shadow-2xl border flex items-start gap-3 transition-all animate-in fade-in slide-in-from-bottom-5 duration-200 ${
              isSuccess
                ? 'bg-emerald-900 text-white border-emerald-700'
                : isError
                ? 'bg-rose-900 text-white border-rose-700'
                : isWarning
                ? 'bg-amber-900 text-white border-amber-700'
                : 'bg-slate-900 text-white border-slate-700'
            }`}
          >
            {/* Type Icon */}
            <div className="mt-0.5 shrink-0">
              {isSuccess && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
              {isError && <AlertCircle className="w-5 h-5 text-rose-400" />}
              {isWarning && <AlertTriangle className="w-5 h-5 text-amber-400" />}
              {!isSuccess && !isError && !isWarning && <Info className="w-5 h-5 text-sky-400" />}
            </div>

            {/* Content */}
            <div className="flex-1 space-y-0.5 text-xs">
              {item.title && <h4 className="font-bold text-sm leading-tight">{item.title}</h4>}
              <p className="opacity-95 leading-relaxed font-medium">{item.message}</p>
            </div>

            {/* Manual Close Button */}
            <button
              type="button"
              onClick={() => removeToast(item.id)}
              className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10 shrink-0 cursor-pointer transition-colors"
              title="Close notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
