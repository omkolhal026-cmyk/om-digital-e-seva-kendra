import React, { useId } from 'react';

export interface ClassicSlideSwitchProps {
  id?: string;
  name?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'emerald' | 'blue' | 'rose' | 'amber' | 'indigo';
  label?: React.ReactNode;
  labelPosition?: 'left' | 'right';
  activeText?: string;
  inactiveText?: string;
  showText?: boolean;
  title?: string;
  className?: string;
}

export const ClassicSlideSwitch: React.FC<ClassicSlideSwitchProps> = ({
  id,
  name,
  checked,
  onChange,
  disabled = false,
  size = 'md',
  variant = 'emerald',
  label,
  labelPosition = 'left',
  activeText,
  inactiveText,
  showText = false,
  title,
  className = '',
}) => {
  const generatedId = useId();
  const switchId = id || `classic-switch-${generatedId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

  const handleToggle = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.preventDefault();
    if (!disabled) {
      onChange(!checked);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Enter') {
      handleToggle(e);
    }
  };

  const statusDisplayText = checked ? activeText : inactiveText;

  const switchButton = (
    <div
      role="switch"
      aria-checked={checked}
      aria-label={typeof label === 'string' ? label : title || 'Slide switch'}
      tabIndex={disabled ? -1 : 0}
      id={switchId}
      onClick={handleToggle}
      onKeyDown={handleKeyDown}
      title={title}
      className={`classic-switch-track size-${size} variant-${variant} ${
        checked ? 'checked' : ''
      } ${disabled ? 'disabled' : ''}`}
    >
      <div className="classic-switch-thumb">
        <div className="classic-switch-grip">
          <span />
          <span />
          <span />
        </div>
      </div>
      {name && (
        <input
          type="checkbox"
          name={name}
          checked={checked}
          onChange={() => {}}
          tabIndex={-1}
          style={{ display: 'none' }}
          aria-hidden="true"
        />
      )}
    </div>
  );

  if (!label && !showText) {
    return <div className={`inline-flex items-center shrink-0 ${className}`}>{switchButton}</div>;
  }

  return (
    <div
      onClick={handleToggle}
      className={`inline-flex items-center gap-2 select-none shrink-0 ${
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
      } ${className}`}
      title={title}
    >
      {label && labelPosition === 'left' && (
        <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
          {label}
        </span>
      )}

      {switchButton}

      {label && labelPosition === 'right' && (
        <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
          {label}
        </span>
      )}

      {showText && statusDisplayText && (
        <span
          className={`text-[11px] font-extrabold tracking-wide uppercase transition-colors ${
            checked
              ? variant === 'emerald'
                ? 'text-emerald-700'
                : variant === 'rose'
                ? 'text-rose-700'
                : variant === 'amber'
                ? 'text-amber-800'
                : 'text-blue-700'
              : 'text-slate-500'
          }`}
        >
          {statusDisplayText}
        </span>
      )}
    </div>
  );
};
