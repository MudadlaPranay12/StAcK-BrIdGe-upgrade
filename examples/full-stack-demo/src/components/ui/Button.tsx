import { type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../lib/utils';
import { Icon, type IconName } from './Icon';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps {
  variant?: Variant;
  size?: Size;
  block?: boolean;
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  className?: string;
  children?: ReactNode;
  type?: ButtonHTMLAttributes<HTMLButtonElement>['type'];
  onClick?: ButtonHTMLAttributes<HTMLButtonElement>['onClick'];
  disabled?: boolean;
  title?: string;
  'aria-label'?: string;
  form?: string;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  block = false,
  icon,
  iconRight,
  loading = false,
  className,
  children,
  type = 'button',
  onClick,
  disabled,
  title,
  form,
  ...aria
}: ButtonProps) {
  return (
    <button
      className={cx('btn', `btn--${variant}`, size !== 'md' && `btn--${size}`, block && 'btn--block', className)}
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      title={title}
      form={form}
      aria-label={aria['aria-label']}
    >
      {loading ? <span className="spinner" /> : icon ? <span className="btn__icon"><Icon name={icon} /></span> : null}
      {children}
      {iconRight ? <span className="btn__icon"><Icon name={iconRight} /></span> : null}
    </button>
  );
}

interface IconButtonProps {
  icon: IconName;
  label: string;
  variant?: 'default' | 'danger' | 'plain';
  size?: 'sm' | 'md';
  className?: string;
  onClick?: ButtonHTMLAttributes<HTMLButtonElement>['onClick'];
  disabled?: boolean;
  type?: ButtonHTMLAttributes<HTMLButtonElement>['type'];
}

export function IconButton({
  icon,
  label,
  variant = 'default',
  size = 'md',
  className,
  onClick,
  disabled,
  type = 'button',
}: IconButtonProps) {
  return (
    <button
      className={cx(
        'icon-button',
        size === 'sm' && 'icon-button--sm',
        variant === 'danger' && 'icon-button--danger',
        variant === 'plain' && 'icon-button--plain',
        className
      )}
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
    >
      <Icon name={icon} size={size === 'sm' ? 14 : 16} />
    </button>
  );
}
