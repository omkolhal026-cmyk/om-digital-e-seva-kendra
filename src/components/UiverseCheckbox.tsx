import React, { useId } from 'react';

export interface UiverseCheckboxProps {
  id?: string;
  name?: string;
  checked?: boolean;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  size?: number;
  className?: string;
  title?: string;
  'aria-label'?: string;
  label?: React.ReactNode;
}

export const UiverseCheckbox: React.FC<UiverseCheckboxProps> = ({
  id,
  name,
  checked = false,
  onChange,
  disabled = false,
  size = 22,
  className = '',
  title,
  'aria-label': ariaLabel,
  label,
}) => {
  const generatedId = useId();
  const inputId = id || `cb-${generatedId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const checkboxControl = (
    <div
      className={`checkbox-wrapper shrink-0 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      style={{ '--size': `${size}px` } as React.CSSProperties}
      title={title}
    >
      <input
        type="checkbox"
        id={inputId}
        name={name}
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        aria-label={ariaLabel || title}
      />
      <label htmlFor={inputId}>
        <div className="tick_mark" />
      </label>
    </div>
  );

  if (label) {
    return (
      <div className={`inline-flex items-center gap-2.5 ${className}`}>
        {checkboxControl}
        <label
          htmlFor={inputId}
          className={`cursor-pointer select-none ${
            disabled ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {label}
        </label>
      </div>
    );
  }

  return (
    <div className={`inline-flex items-center justify-center ${className}`}>
      {checkboxControl}
    </div>
  );
};
