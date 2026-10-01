import { useEffect, useRef, type ButtonHTMLAttributes, type ComponentProps, type ReactNode } from 'react';
import { RiCloseLine, RiLoader4Line } from '@remixicon/react';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
export { cx };

/** 디자인 토큰 아이콘 크기 (Remixicon) — --icon-sm/md/lg */
export const ICON = { sm: 16, md: 20, lg: 24 } as const;

/** 디자인 토큰 컨트롤 높이 스케일 — --control-height-* */
export type ControlSize = 'xs' | 'sm' | 'md' | 'lg';

// Tailwind가 클래스를 찾을 수 있도록 전체 이름으로 적는다
const BTN_SIZE: Record<ControlSize, string> = {
  xs: 'h-(--control-height-xs) px-(--control-pad-x-btn-xs) text-xs gap-1',
  sm: 'h-(--control-height-sm) px-(--control-pad-x-btn-sm) text-sm gap-1.5',
  md: 'h-(--control-height-md) px-(--control-pad-x-btn-md) text-sm gap-2',
  lg: 'h-(--control-height-lg) px-(--control-pad-x-btn-lg) text-base gap-2',
};
const ICON_BTN_SIZE: Record<ControlSize, string> = {
  xs: 'size-(--control-height-xs)',
  sm: 'size-(--control-height-sm)',
  md: 'size-(--control-height-md)',
  lg: 'size-(--control-height-lg)',
};
const INPUT_SIZE: Record<ControlSize, string> = {
  xs: 'h-(--control-height-xs) px-(--control-pad-x-input-xs) text-xs',
  sm: 'h-(--control-height-sm) px-(--control-pad-x-input-sm) text-sm',
  md: 'h-(--control-height-md) px-(--control-pad-x-input-md) text-sm',
  lg: 'h-(--control-height-lg) px-(--control-pad-x-input-lg) text-base',
};

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const BTN_VARIANT: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-hover active:bg-brand-strong',
  secondary: 'border border-line-strong bg-surface-0 text-fg hover:bg-surface-1',
  ghost: 'text-fg-2 hover:bg-surface-2 hover:text-fg',
  danger: 'bg-state-danger text-white hover:opacity-90',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: ControlSize }) {
  return (
    <button
      {...props}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-sm font-medium whitespace-nowrap transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-40',
        BTN_SIZE[size],
        BTN_VARIANT[variant],
        className,
      )}
    />
  );
}

export function IconButton({
  label,
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: ControlSize }) {
  return (
    <button
      aria-label={label}
      title={label}
      {...props}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-sm text-fg-muted transition-colors',
        'hover:bg-surface-2 hover:text-fg disabled:opacity-40',
        ICON_BTN_SIZE[size],
        className,
      )}
    />
  );
}

const FIELD_BASE = cx(
  'w-full rounded-sm border border-line-strong bg-surface-0 text-fg outline-none transition-colors',
  'placeholder:text-fg-muted hover:border-fg-muted',
  'focus:border-brand focus-visible:outline-none focus:ring-2 focus:ring-brand/20',
  'disabled:cursor-not-allowed disabled:bg-surface-1 disabled:text-fg-disabled',
);

/** 입력창 — 기본 크기 sm (35px) */
export function Input({
  size = 'sm',
  className,
  ...props
}: Omit<ComponentProps<'input'>, 'size'> & { size?: ControlSize }) {
  return <input {...props} className={cx(FIELD_BASE, INPUT_SIZE[size], className)} />;
}

/** 선택 상자 — 기본 크기 sm (35px) */
export function Select({
  size = 'sm',
  className,
  ...props
}: Omit<ComponentProps<'select'>, 'size'> & { size?: ControlSize }) {
  return <select {...props} className={cx(FIELD_BASE, INPUT_SIZE[size], 'w-auto cursor-pointer pr-8', className)} />;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-fg">{label}</span>
      {children}
      {hint && <span className="block text-xs font-normal text-fg-muted">{hint}</span>}
    </label>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cx(
        'z-(--z-modal) m-auto w-[calc(100%-2rem)] rounded-sm border border-line bg-elevated p-0 text-fg shadow-lg',
        'backdrop:bg-overlay',
        wide ? 'max-w-2xl' : 'max-w-md',
      )}
    >
      {open && (
        <div className="flex max-h-[85dvh] flex-col">
          <div className="flex items-center justify-between border-b border-line py-2 pr-2 pl-5">
            <h2 className="text-base font-semibold">{title}</h2>
            <IconButton label="닫기" onClick={onClose}>
              <RiCloseLine size={ICON.md} />
            </IconButton>
          </div>
          <div className="overflow-y-auto p-5">{children}</div>
        </div>
      )}
    </dialog>
  );
}

export function Spinner({ size = ICON.sm, className }: { size?: number; className?: string }) {
  return <RiLoader4Line size={size} className={cx('inline-block animate-spin', className)} aria-hidden />;
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="tint-danger rounded-sm px-3 py-2 text-sm text-state-danger">{children}</p>;
}

export function SuccessText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="tint-success rounded-sm px-3 py-2 text-sm text-state-success">{children}</p>;
}
