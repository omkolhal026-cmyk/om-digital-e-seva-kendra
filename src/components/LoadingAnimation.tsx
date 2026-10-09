import React from 'react';

export interface LoadingAnimationProps {
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  text?: string;
  subText?: string;
  variant?: 'orbital' | 'wave' | 'compact';
  color?: 'blue' | 'teal' | 'indigo' | 'emerald';
  className?: string;
}

/**
 * Modern High-Fidelity Loading Animation Component (Uiverse.io Style)
 * Featuring 3D Multi-Ring Quantum Orbital Rotation, Glowing Core, and Wave Pulse
 */
export const LoadingAnimation: React.FC<LoadingAnimationProps> = ({
  size = 'md',
  text,
  subText,
  variant = 'orbital',
  color = 'blue',
  className = '',
}) => {
  // Dimensions based on size
  const orbitalSizes = {
    xs: 'w-5 h-5',
    sm: 'w-7 h-7',
    md: 'w-11 h-11',
    lg: 'w-14 h-14',
    xl: 'w-18 h-18',
  };

  const coreSizes = {
    xs: 'w-1.5 h-1.5',
    sm: 'w-2 h-2',
    md: 'w-2.5 h-2.5',
    lg: 'w-3.5 h-3.5',
    xl: 'w-4.5 h-4.5',
  };

  const textSizes = {
    xs: 'text-[11px]',
    sm: 'text-xs',
    md: 'text-sm font-bold',
    lg: 'text-base font-extrabold',
    xl: 'text-lg font-black',
  };

  // Color schemes for rings
  const colorTheme = {
    blue: {
      outer: 'border-t-blue-600 border-r-cyan-400',
      middle: 'border-b-indigo-600 border-l-sky-400',
      inner: 'border-t-emerald-500 border-b-cyan-400',
      core: 'from-blue-600 to-cyan-400',
      glow: 'shadow-blue-500/50',
      text: 'text-blue-900',
    },
    teal: {
      outer: 'border-t-teal-600 border-r-emerald-400',
      middle: 'border-b-cyan-600 border-l-teal-300',
      inner: 'border-t-blue-500 border-b-emerald-400',
      core: 'from-teal-600 to-emerald-400',
      glow: 'shadow-teal-500/50',
      text: 'text-teal-900',
    },
    indigo: {
      outer: 'border-t-indigo-600 border-r-purple-400',
      middle: 'border-b-blue-600 border-l-indigo-300',
      inner: 'border-t-cyan-500 border-b-purple-400',
      core: 'from-indigo-600 to-purple-400',
      glow: 'shadow-indigo-500/50',
      text: 'text-indigo-900',
    },
    emerald: {
      outer: 'border-t-emerald-600 border-r-teal-400',
      middle: 'border-b-green-600 border-l-emerald-300',
      inner: 'border-t-cyan-500 border-b-teal-400',
      core: 'from-emerald-600 to-teal-400',
      glow: 'shadow-emerald-500/50',
      text: 'text-emerald-900',
    },
  }[color];

  if (variant === 'wave') {
    return (
      <div className={`flex flex-col items-center justify-center gap-3 p-4 ${className}`}>
        <div className="uiverse-wave-loader">
          <div className="uiverse-wave-dot" />
          <div className="uiverse-wave-dot" />
          <div className="uiverse-wave-dot" />
          <div className="uiverse-wave-dot" />
        </div>
        {text && (
          <p className={`${textSizes[size]} ${colorTheme.text} tracking-wide text-center animate-pulse`}>
            {text}
          </p>
        )}
        {subText && (
          <p className="text-[11px] text-slate-400 font-medium text-center">
            {subText}
          </p>
        )}
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <span className={`inline-flex items-center gap-2 ${className}`}>
        <span className="button-spinner" aria-hidden="true" />
        {text && <span className={colorTheme.text}>{text}</span>}
      </span>
    );
  }

  // Default Orbital 3D Quantum Loader
  return (
    <div className={`flex flex-col items-center justify-center gap-3 p-4 select-none ${className}`}>
      <div className={`uiverse-orbital-loader ${orbitalSizes[size]}`}>
        {/* Outer Ring */}
        <div className={`ring-outer ${colorTheme.outer}`} />
        {/* Middle Ring */}
        <div className={`ring-middle ${colorTheme.middle}`} />
        {/* Inner Ring */}
        <div className={`ring-inner ${colorTheme.inner}`} />
        {/* Pulsating Glowing Core Dot */}
        <div className={`core-dot bg-gradient-to-tr ${colorTheme.core} ${coreSizes[size]} ${colorTheme.glow}`} />
      </div>

      {text && (
        <p className={`${textSizes[size]} ${colorTheme.text} tracking-wide text-center font-bold flex items-center gap-1.5`}>
          <span>{text}</span>
        </p>
      )}

      {subText && (
        <p className="text-[11px] text-slate-400 font-medium text-center max-w-xs">
          {subText}
        </p>
      )}
    </div>
  );
};

export default LoadingAnimation;
