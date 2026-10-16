import { useRef, useState, type ReactNode } from 'react';
import { cx } from '../../lib/utils';
import { useEscape, useOnClickOutside } from '../../lib/hooks';
import { Icon, type IconName } from './Icon';
import { Button, IconButton } from './Button';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({ open, onClose, title, subtitle, size = 'md', children, footer }: ModalProps) {
  useEscape(onClose, open);
  if (!open) return null;
  return (
    <div className="overlay-root" role="dialog" aria-modal="true">
      <div className="overlay-backdrop" onClick={onClose} />
      <div className={cx('modal', size === 'sm' && 'modal--sm', size === 'lg' && 'modal--lg')}>
        <div className="modal-header">
          <div className="stack grow">
            <h2 className="modal-title">{title}</h2>
            {subtitle ? <span className="card-subtitle">{subtitle}</span> : null}
          </div>
          <IconButton icon="close" label="Close dialog" variant="plain" onClick={onClose} />
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-footer">{footer}</div> : null}
      </div>
    </div>
  );
}

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  size?: 'md' | 'wide';
  children: ReactNode;
  footer?: ReactNode;
}

export function Drawer({ open, onClose, title, subtitle, size = 'md', children, footer }: DrawerProps) {
  useEscape(onClose, open);
  if (!open) return null;
  return (
    <div className="overlay-root" role="dialog" aria-modal="true">
      <div className="overlay-backdrop" onClick={onClose} />
      <aside className={cx('drawer', size === 'wide' && 'drawer--wide')}>
        <div className="drawer-header">
          <div className="stack grow">
            <h2 className="modal-title">{title}</h2>
            {subtitle ? <span className="card-subtitle">{subtitle}</span> : null}
          </div>
          <IconButton icon="close" label="Close panel" variant="plain" onClick={onClose} />
        </div>
        <div className="drawer-body">{children}</div>
        {footer ? <div className="drawer-footer">{footer}</div> : null}
      </aside>
    </div>
  );
}

interface DropdownProps {
  trigger: ReactNode;
  children: ReactNode;
  align?: 'left' | 'right';
}

export function Dropdown({ trigger, children, align = 'right' }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useOnClickOutside(ref, () => setOpen(false), open);
  useEscape(() => setOpen(false), open);

  return (
    <div className="dropdown" ref={ref}>
      <div onClick={() => setOpen((value) => !value)}>{trigger}</div>
      {open ? <div className={cx('dropdown-menu', align === 'left' && 'dropdown-menu--left')}>{children}</div> : null}
    </div>
  );
}

export function DropdownItem({
  icon,
  danger,
  onClick,
  children,
}: {
  icon?: IconName;
  danger?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button className={cx('dropdown-item', danger && 'dropdown-item--danger')} type="button" onClick={onClick}>
      {icon ? <Icon name={icon} size={15} /> : null}
      {children}
    </button>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  title: ReactNode;
  message: ReactNode;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Confirm', tone = 'danger', busy, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button variant={tone} onClick={onConfirm} loading={busy}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="muted">{message}</p>
    </Modal>
  );
}
