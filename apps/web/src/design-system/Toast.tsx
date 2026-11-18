import { X } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { LayersMark } from './printer';

interface Toast {
  id: number;
  title: string;
  detail?: string;
  tone: 'success' | 'error';
}

interface ToastApi {
  success: (title: string, detail?: string) => void;
  error: (title: string, detail?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);
const DURATION_MS = 5000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback(
    (id: number) => setToasts((all) => all.filter((t) => t.id !== id)),
    [],
  );

  const push = useCallback(
    (tone: Toast['tone'], title: string, detail?: string) => {
      const id = nextId.current++;
      setToasts((all) => [...all.slice(-2), { id, title, tone, ...(detail && { detail }) }]);
      window.setTimeout(() => dismiss(id), DURATION_MS);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (title, detail) => push('success', title, detail),
      error: (title, detail) => push('error', title, detail),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-center gap-2 md:right-6 md:left-auto md:items-end"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.tone === 'error' ? 'alert' : 'status'}
            className="pointer-events-auto flex w-full max-w-md items-center gap-4 rounded-[18px] bg-ink px-5 py-4 text-white shadow-[var(--shadow-pop)] motion-safe:animate-fade-in"
          >
            {toast.tone === 'success' ? (
              <LayersMark />
            ) : (
              <span aria-hidden="true" className="h-9 w-1.5 rounded-full bg-hot" />
            )}
            <div className="flex flex-1 flex-col gap-0.5">
              <strong className="text-[15px]">{toast.title}</strong>
              {toast.detail && (
                <span className="figure text-[13px] text-[#c3ced2]">{toast.detail}</span>
              )}
            </div>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismiss(toast.id)}
              className="grid size-9 place-items-center rounded-full text-[#c3ced2] hover:bg-[#2a3d45] hover:text-white"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}
