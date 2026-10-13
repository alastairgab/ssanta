import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { Icon } from './icons';
import { copyToClipboard } from '../../utils/download';

// ---------------------------------------------------------------------------
// Layout primitives
// ---------------------------------------------------------------------------

export function Card({ children, className = '', as: As = 'section' }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article' }) {
  return <As className={`card p-5 sm:p-6 ${className}`}>{children}</As>;
}

export function SectionTitle({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-xl font-semibold text-pine-950">{title}</h2>
        {description ? <p className="mt-1 max-w-2xl text-sm text-pine-700">{description}</p> : null}
      </div>
      {action ? <div className="flex flex-wrap gap-2">{action}</div> : null}
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="break-words text-2xl font-semibold text-pine-950 sm:text-3xl">{title}</h1>
        {subtitle ? <div className="mt-1 text-sm text-pine-700">{subtitle}</div> : null}
      </div>
      {action ? <div className="flex flex-wrap gap-2">{action}</div> : null}
    </header>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border-2 border-dashed border-pine-200 px-6 py-10 text-center">
      {icon ? <div className="mb-3 text-4xl text-pine-400">{icon}</div> : null}
      <h3 className="text-lg font-semibold text-pine-900">{title}</h3>
      {children ? <div className="mt-1 max-w-md text-sm text-pine-700">{children}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

type Tone = 'info' | 'warning' | 'danger' | 'success';
const toneClasses: Record<Tone, string> = {
  info: 'bg-pine-50 text-pine-900 ring-pine-200',
  warning: 'bg-gold-100 text-pine-950 ring-gold-300',
  danger: 'bg-berry-50 text-berry-900 ring-berry-200',
  success: 'bg-pine-100 text-pine-900 ring-pine-300',
};

export function Callout({ tone = 'info', title, children, className = '' }: { tone?: Tone; title?: ReactNode; children?: ReactNode; className?: string }) {
  const IconC = tone === 'danger' || tone === 'warning' ? Icon.Alert : tone === 'success' ? Icon.Check : Icon.Info;
  return (
    <div className={`flex gap-3 rounded-xl p-4 text-sm ring-1 ring-inset ${toneClasses[tone]} ${className}`} role={tone === 'danger' ? 'alert' : undefined}>
      <IconC className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="min-w-0 space-y-1">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className="space-y-1 leading-relaxed">{children}</div> : null}
      </div>
    </div>
  );
}

export function Badge({ children, tone = 'neutral', title }: { children: ReactNode; tone?: 'neutral' | 'green' | 'red' | 'gold' | 'grey' | 'blue'; title?: string }) {
  const c = {
    neutral: 'bg-pine-100 text-pine-800',
    green: 'bg-pine-600 text-white',
    red: 'bg-berry-100 text-berry-800',
    gold: 'bg-gold-200 text-pine-950',
    grey: 'bg-gray-100 text-gray-700',
    blue: 'bg-sky-100 text-sky-900',
  }[tone];
  return (
    <span className={`badge ${c}`} title={title}>
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Form controls
// ---------------------------------------------------------------------------

export function Field({ label, hint, error, children, htmlFor, required }: { label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string; required?: boolean }) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>
        {label}
        {required ? <span className="text-berry-600" aria-hidden> *</span> : null}
      </label>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <p className="mt-1 text-xs font-medium text-berry-700" id={htmlFor ? `${htmlFor}-error` : undefined} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="hint" id={htmlFor ? `${htmlFor}-hint` : undefined}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function TextInput({ label, hint, error, required, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; hint?: ReactNode; error?: string | null }) {
  const autoId = useId();
  const id = props.id ?? autoId;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id} required={required}>
      <input
        {...props}
        id={id}
        required={required}
        className={`input ${props.className ?? ''}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
      />
    </Field>
  );
}

export function TextArea({ label, hint, error, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: ReactNode; hint?: ReactNode; error?: string | null }) {
  const autoId = useId();
  const id = props.id ?? autoId;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <textarea {...props} id={id} className={`input min-h-[88px] ${props.className ?? ''}`} aria-describedby={hint ? `${id}-hint` : undefined} />
    </Field>
  );
}

export function Select({ label, hint, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: ReactNode; hint?: ReactNode }) {
  const autoId = useId();
  const id = props.id ?? autoId;
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <select {...props} id={id} className={`input pr-8 ${props.className ?? ''}`}>
        {children}
      </select>
    </Field>
  );
}

export function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <button
        type="button"
        role="switch"
        id={id}
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${checked ? 'bg-pine-600' : 'bg-pine-200'} disabled:opacity-50`}
      >
        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
        <span className="sr-only">{checked ? 'On' : 'Off'}</span>
      </button>
      <label htmlFor={id} className="cursor-pointer text-sm">
        <span className="font-medium text-pine-950">{label}</span>
        {description ? <span className="mt-0.5 block text-pine-700">{description}</span> : null}
      </label>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal (native <dialog> gives focus trapping, Esc handling and inert background)
// ---------------------------------------------------------------------------

export function Modal({ open, onClose, title, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      if (typeof d.showModal === 'function') d.showModal();
      else d.setAttribute('open', '');
    } else if (!open && d.open) {
      if (typeof d.close === 'function') d.close();
      else d.removeAttribute('open');
    }
  }, [open]);
  const width = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' }[size];
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className={`w-[calc(100%-2rem)] ${width} rounded-2xl bg-white p-0 text-pine-950 shadow-2xl`}
    >
      {open ? (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-pine-100 px-5 py-4">
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            <button type="button" className="btn-ghost btn-sm -mr-2" onClick={onClose} aria-label="Close">
              <Icon.X className="h-5 w-5" />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer ? <div className="flex flex-wrap justify-end gap-2 border-t border-pine-100 px-5 py-3">{footer}</div> : null}
        </div>
      ) : null}
    </dialog>
  );
}

export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = 'Confirm',
  danger,
  onConfirm,
  onCancel,
  requireText,
  busy,
}: {
  open: boolean;
  title: ReactNode;
  children: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  requireText?: string;
  busy?: boolean;
}) {
  const [typed, setTyped] = useState('');
  useEffect(() => {
    if (!open) setTyped('');
  }, [open]);
  const blocked = Boolean(requireText) && typed.trim().toUpperCase() !== requireText!.toUpperCase();
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className={danger ? 'btn bg-berry-700 text-white hover:bg-berry-800' : 'btn-primary'} onClick={onConfirm} disabled={blocked || busy}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-pine-800">{children}</div>
      {requireText ? (
        <div className="mt-4">
          <TextInput label={`Type ${requireText} to confirm`} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </div>
      ) : null}
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Toasts
// ---------------------------------------------------------------------------

interface ToastMsg {
  id: number;
  text: string;
  tone: 'success' | 'error' | 'info';
}
const ToastCtx = createContext<(text: string, tone?: ToastMsg['tone']) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const push = useCallback((text: string, tone: ToastMsg['tone'] = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 7000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4" aria-live="polite" role="status">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto max-w-md rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${
              t.tone === 'error' ? 'bg-berry-700 text-white' : t.tone === 'info' ? 'bg-pine-900 text-white' : 'bg-pine-700 text-white'
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

export function CopyButton({ text, label = 'Copy', copiedLabel = 'Copied!', className = 'btn-secondary btn-sm', icon = true }: { text: string | (() => string | Promise<string>); label?: string; copiedLabel?: string; className?: string; icon?: boolean }) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        const value = typeof text === 'function' ? await text() : text;
        const ok = await copyToClipboard(value);
        if (ok) {
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        } else toast('Copy failed — select the text and copy it manually.', 'error');
      }}
    >
      {icon ? <Icon.Copy className="h-4 w-4" /> : null}
      <span aria-live="polite">{copied ? copiedLabel : label}</span>
    </button>
  );
}

export function Spinner({ label = 'Working…' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-pine-700" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-pine-300 border-t-pine-700" aria-hidden />
      {label}
    </span>
  );
}

export function useAsyncAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async <T,>(fn: () => Promise<T>, success?: string): Promise<T | undefined> => {
      setBusy(true);
      try {
        const r = await fn();
        if (success) toast(success);
        return r;
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Something went wrong.', 'error');
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    [toast],
  );
  return { busy, run };
}
