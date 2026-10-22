import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, X, ChevronDown, UserCheck, Settings, UserPlus } from 'lucide-react';
import { ManagePersonsModal } from './ManagePersonsModal';

export interface FromSourceFilterSelectProps {
  value: string;
  onChange: (value: string) => void;
  options?: string[];
  moduleType?: 'registration' | 'renewal' | 'claim' | 'old_claim' | 'material' | 'whatsapp' | 'all';
  placeholder?: string;
  label?: string;
  className?: string;
  id?: string;
}

export const FromSourceFilterSelect: React.FC<FromSourceFilterSelectProps> = ({
  value,
  onChange,
  options = [],
  moduleType = 'all',
  placeholder = 'स्त्रोत शोधा (Search From)...',
  label,
  className = '',
  id,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [backendSources, setBackendSources] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState(value || '');
  const [isManageModalOpen, setIsManageModalOpen] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Synchronize internal text with controlled value
  useEffect(() => {
    setSearchTerm(value || '');
  }, [value]);

  const getAuthHeader = () => {
    const token =
      localStorage.getItem('om_eseva_token') ||
      sessionStorage.getItem('om_eseva_token') ||
      '';
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const fetchSources = () => {
    fetch(`/api/from-sources?type=${moduleType}`, {
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Network response error');
        return res.json();
      })
      .then((data) => {
        if (Array.isArray(data)) {
          setBackendSources(data.filter(Boolean));
        }
      })
      .catch((err) => {
        console.warn('[FromSourceFilterSelect] Unable to fetch distinct sources:', err?.message || err);
      });
  };

  // Fetch distinct From sources from backend on mount or moduleType change
  useEffect(() => {
    fetchSources();
  }, [moduleType]);

  // Listen to global person update events
  useEffect(() => {
    const handleGlobalUpdate = () => {
      fetchSources();
    };
    window.addEventListener('from-sources-updated', handleGlobalUpdate);
    return () => {
      window.removeEventListener('from-sources-updated', handleGlobalUpdate);
    };
  }, []);

  // Combine options from props and backend without duplicates
  const allDistinctSources = useMemo(() => {
    const set = new Set<string>();
    options.forEach((opt) => {
      const clean = opt?.trim();
      if (clean) set.add(clean);
    });
    backendSources.forEach((src) => {
      const clean = src?.trim();
      if (clean) set.add(clean);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [options, backendSources]);

  // Filter options based on user's current search term
  const filteredOptions = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return allDistinctSources;
    return allDistinctSources.filter((src) => src.toLowerCase().includes(query));
  }, [allDistinctSources, searchTerm]);

  // Handle outside click to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchTerm(val);
    onChange(val);
    if (!isOpen) setIsOpen(true);
  };

  const handleSelectOption = (opt: string) => {
    setSearchTerm(opt);
    onChange(opt);
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSearchTerm('');
    onChange('');
    setIsOpen(false);
    inputRef.current?.focus();
  };

  return (
    <div ref={containerRef} className={`relative flex flex-col ${className}`} id={id}>
      <div className="flex items-center justify-between mb-1">
        {label && (
          <label className="block text-[11px] font-bold text-slate-600 flex items-center gap-1">
            <UserCheck className="w-3 h-3 text-blue-600" />
            <span>{label}</span>
          </label>
        )}
      </div>

      <div className="relative flex items-center">
        <Search className="w-3.5 h-3.5 absolute left-2.5 text-slate-400 pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={searchTerm}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          title="From स्त्रोत फिल्टर: नाव टाइप करा किंवा यादीमधून निवडा"
          className="w-full pl-8 pr-16 py-1.5 text-xs bg-slate-50 hover:bg-white focus:bg-white text-slate-900 border border-slate-300 rounded-xl focus:border-blue-600 focus:outline-none transition-all placeholder:text-slate-400 font-medium"
        />

        <div className="absolute right-1.5 flex items-center gap-0.5">
          {searchTerm && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
              title="फिल्टर काढा (Clear From Filter)"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsManageModalOpen(true)}
            className="p-1 rounded hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors cursor-pointer"
            title="व्यक्ती व्यवस्थापन उघडा (Manage Persons)"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            className="p-1 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
            title="स्त्रोत यादी उघडा"
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180 text-blue-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Floating Suggestions Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-xl max-h-56 overflow-y-auto divide-y divide-slate-100 text-xs py-1">
          <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between bg-slate-50/80 sticky top-0 backdrop-blur-xs">
            <span>उपलब्ध स्त्रोत ({filteredOptions.length})</span>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                setIsManageModalOpen(true);
              }}
              className="text-blue-600 hover:underline flex items-center gap-1 normal-case font-bold cursor-pointer"
            >
              <Settings className="w-3 h-3" />
              <span>Manage Persons</span>
            </button>
          </div>

          {/* Reset / All Option */}
          {searchTerm && (
            <button
              type="button"
              onClick={() => handleSelectOption('')}
              className="w-full text-left px-3 py-1.5 hover:bg-rose-50 text-rose-700 font-bold flex items-center justify-between cursor-pointer transition-colors"
            >
              <span>सर्व स्त्रोत (Clear / All From Sources)</span>
              <X className="w-3 h-3 text-rose-500" />
            </button>
          )}

          {filteredOptions.length === 0 ? (
            <div className="px-3 py-3 text-center text-slate-400 text-xs">
              <span>"{searchTerm}" नावाचा कोणताही स्त्रोत आढळला नाही</span>
            </div>
          ) : (
            filteredOptions.map((opt) => {
              const isSelected = value?.trim().toLowerCase() === opt.trim().toLowerCase();
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => handleSelectOption(opt)}
                  className={`w-full text-left px-3 py-1.5 flex items-center justify-between cursor-pointer transition-colors ${
                    isSelected ? 'bg-blue-50 text-blue-900 font-bold' : 'hover:bg-slate-100 text-slate-800'
                  }`}
                >
                  <span className="truncate">{opt}</span>
                  {isSelected && <span className="text-blue-600 text-[10px] font-bold ml-1">निवडले ✓</span>}
                </button>
              );
            })
          )}
        </div>
      )}

      {/* Global Manage Persons Modal */}
      <ManagePersonsModal
        isOpen={isManageModalOpen}
        onClose={() => setIsManageModalOpen(false)}
        onPersonUpdated={(updatedName) => {
          fetchSources();
          if (updatedName) {
            onChange(updatedName);
            setSearchTerm(updatedName);
          }
        }}
      />
    </div>
  );
};
