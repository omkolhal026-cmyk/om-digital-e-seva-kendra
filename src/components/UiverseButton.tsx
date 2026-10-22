import React from 'react';

export interface UiverseButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'white' | 'glass' | 'blue' | 'emerald';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * Uiverse.io Floating Ripple Pill Button (by cssbuttons-io)
 * Features tactile float on hover (translateY -3px), expanding ripple aura (scaleX 1.4, scaleY 1.6),
 * and press depth (translateY -1px).
 */
export const UiverseButton: React.FC<UiverseButtonProps> = ({
  variant = 'white',
  size = 'md',
  icon,
  children,
  className = '',
  type = 'button',
  ...props
}) => {
  const variantClass = {
    white: 'btn-white',
    glass: 'btn-glass',
    blue: 'btn-blue',
    emerald: 'btn-emerald',
  }[variant];

  const sizeClass = {
    sm: 'btn-sm',
    md: 'btn-md',
    lg: 'btn-lg',
  }[size];

  return (
    <button
      type={type}
      className={`btn ${variantClass} ${sizeClass} ${className}`}
      {...props}
    >
      {icon && <span className="inline-flex items-center shrink-0">{icon}</span>}
      <span>{children}</span>
    </button>
  );
};

export default UiverseButton;
