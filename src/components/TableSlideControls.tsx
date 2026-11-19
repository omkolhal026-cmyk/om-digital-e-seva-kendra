import React from 'react';
import { ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react';

export interface TableSlideControlsProps {
  onSlideLeft: () => void;
  onSlideRight: () => void;
  title?: string;
  subtitle?: string;
  className?: string;
}

export const TableSlideControls: React.FC<TableSlideControlsProps> = ({
  onSlideLeft,
  onSlideRight,
  title = '↔ Slide Table / माहिती सरकवा',
  subtitle = '(डावीकडे / उजवीकडे सरकवण्यासाठी खालील बटने वापरा)',
  className = '',
}) => {
  return (
    <div
      className={`bg-slate-50/95 border-b border-slate-200 px-4 py-2 flex flex-wrap items-center justify-between gap-2.5 text-xs ${className}`}
    >
      <div className="flex items-center gap-2 text-slate-800">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold bg-blue-100 text-blue-900 px-2.5 py-1 rounded-md border border-blue-200/90 shadow-2xs">
          <SlidersHorizontal className="w-3.5 h-3.5 text-blue-700" />
          <span>{title}</span>
        </span>
        {subtitle && (
          <span className="hidden sm:inline text-slate-500 font-medium text-[11px]">
            {subtitle}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onSlideLeft}
          className="classic-slide-btn classic-slide-btn-left"
          title="Slide Table Left / डावीकडे सरकवा"
        >
          <ChevronLeft className="w-4 h-4 text-blue-700 shrink-0" />
          <span>◀ डावीकडे (Left)</span>
        </button>

        <button
          type="button"
          onClick={onSlideRight}
          className="classic-slide-btn classic-slide-btn-right"
          title="Slide Table Right / उजवीकडे सरकवा"
        >
          <span>उजवीकडे (Right) ▶</span>
          <ChevronRight className="w-4 h-4 text-white shrink-0" />
        </button>
      </div>
    </div>
  );
};
