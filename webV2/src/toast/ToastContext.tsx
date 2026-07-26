import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

// Tier B corner (webV2-2, PLAN_WEBV2_TARGETS.md): an async success toast — appears some time
// after the triggering action resolves and disappears on its own a few seconds later, with no
// user interaction in between. A selector that only checks "is this in the DOM right now" will
// race it; tflw's auto-wait needs to catch it appearing *and* tolerate it vanishing again.
const AUTO_DISMISS_MS = 2500;

interface Toast {
  id: number;
  message: string;
  kind: 'success' | 'error';
}

interface ToastState {
  show: (message: string, kind?: Toast['kind']) => void;
}

const ToastContext = createContext<ToastState | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const show = useCallback((message: string, kind: Toast['kind'] = 'success') => {
    const id = nextId.current++;
    setToasts((current) => [...current, { id, message, kind }]);
    setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id));
    }, AUTO_DISMISS_MS);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="toast-viewport" aria-live="polite">
        {toasts.map((t) => (
          <p key={t.id} role="status" className={`toast toast-${t.kind}`}>
            {t.message}
          </p>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastState {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
