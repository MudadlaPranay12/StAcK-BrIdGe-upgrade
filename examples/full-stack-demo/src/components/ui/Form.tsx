import { type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cx } from '../../lib/utils';
import { Icon } from './Icon';

interface FieldProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  htmlFor?: string;
  full?: boolean;
  className?: string;
  children: ReactNode;
}

export function Field({ label, hint, error, required, htmlFor, full, className, children }: FieldProps) {
  return (
    <div className={cx('field', full && 'field-full', className)}>
      {label ? (
        <label className="field-label" htmlFor={htmlFor}>
          {label}
          {required ? <span className="field-required">required</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <span className="field-error">
          <Icon name="alert" size={12} />
          {error}
        </span>
      ) : hint ? (
        <span className="field-hint">{hint}</span>
      ) : null}
    </div>
  );
}

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  inputSize?: 'sm' | 'md';
}

export function TextInput({ invalid, inputSize = 'md', className, ...rest }: TextInputProps) {
  return <input className={cx('input', inputSize === 'sm' && 'input--sm', invalid && 'is-invalid', className)} {...rest} />;
}

interface SelectInputProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export function SelectInput({ invalid, className, children, ...rest }: SelectInputProps) {
  return (
    <select className={cx('select', invalid && 'is-invalid', className)} {...rest}>
      {children}
    </select>
  );
}

interface TextareaInputProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export function TextareaInput({ invalid, className, ...rest }: TextareaInputProps) {
  return <textarea className={cx('textarea', invalid && 'is-invalid', className)} {...rest} />;
}

interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  'aria-label'?: string;
}

export function SearchBox({ value, onChange, placeholder = 'Search…', className, ...aria }: SearchBoxProps) {
  return (
    <div className={cx('search-box', className)}>
      <span className="search-box__icon">
        <Icon name="search" size={15} />
      </span>
      <input
        className="input"
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={aria['aria-label'] ?? placeholder}
      />
      {value ? (
        <button className="search-box__clear icon-button icon-button--sm icon-button--plain" type="button" onClick={() => onChange('')} aria-label="Clear search">
          <Icon name="close" size={14} />
        </button>
      ) : null}
    </div>
  );
}

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  id?: string;
}

export function Switch({ checked, onChange, label, id }: SwitchProps) {
  return (
    <label className="switch" htmlFor={id}>
      <input id={id} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="switch-track">
        <span className="switch-thumb" />
      </span>
      <span className="checkbox-text">{label}</span>
    </label>
  );
}

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  id?: string;
}

export function Checkbox({ checked, onChange, label, id }: CheckboxProps) {
  return (
    <label className="checkbox" htmlFor={id}>
      <input id={id} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="checkbox-text">{label}</span>
    </label>
  );
}
