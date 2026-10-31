import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  ChevronDown,
  UserPlus,
  Settings,
  X,
  Check,
  UserCheck,
  RefreshCw,
} from 'lucide-react';
import { ManagePersonsModal } from './ManagePersonsModal';

export interface FromSourceSelectProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  className?: string;
  id?: string;
  name?: string;
  currentUser?: { name?: string; role?: string; username?: string };
  moduleType?: 'registration' | 'renewal' | 'claim' | 'all';
}

export const FromSourceSelect: React.FC<FromSourceSelectProps> = ({
  value,
  onChange,
  label,
  placeholder = 'माध्यम / स्त्रोत निवडा किंवा टाइप करा (Select / Type From)...',
  required = false,
  disabled = false,
  error,
  className = '',
  id,
  name,
  currentUser,
  moduleType = 'all',
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [sources, setSources] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>(value || '');
  const [isManageModalOpen, setIsManageModalOpen] = useState<boolean>(false);

  // Quick Inline Add state
  const [isQuickAdding, setIsQuickAdding] = useState<boolean>(false);
  const [quickAddName, setQuickAddName] = useState<string>('');
  const [quickAddLoading, setQuickAddLoading] = useState<boolean>(false);
  const [quickAddError, setQuickAddError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const getAuthHeader = () => {
    const token =
      localStorage.getItem('om_eseva_token') ||
      sessionStorage.getItem('om_eseva_token') ||
      '';
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const fetchSources = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/from-sources?type=${moduleType}`, {
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setSources(data.filter(Boolean));
        }
      }
    } catch (err) {
      console.warn('[FromSourceSelect] Failed to load sources:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Sync internal search input with controlled prop value
  useEffect(() => {
    setSearchTerm(value || '');
  }, [value]);

  // Initial load
  useEffect(() => {
    fetchSources();
  }, [moduleType]);

  // Listen to global changes across the application
  useEffect(() => {
    const handleSourcesUpdated = (e: any) => {
      fetchSources();
      if (e?.detail?.name && e.detail.name !== value) {
        // If the updated name is the renamed version of current value, or freshly added
      }
    };

    window.addEventListener('from-sources-updated', handleSourcesUpdated);
    return () => {
      window.removeEventListener('from-sources-updated', handleSourcesUpdated);
    };
  }, [value]);

  // Handle Outside Click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setIsQuickAdding(false);
        setQuickAddError(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Filter sources based on query
  const filteredSources = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return sources;
    return sources.filter((s) => s.toLowerCase().includes(query));
  }, [sources, searchTerm]);

  const handleSelect = (selected: string) => {
    setSearchTerm(selected);
    onChange(selected);
    setIsOpen(false);
    setIsQuickAdding(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchTerm(val);
    onChange(val);
    if (!isOpen) setIsOpen(true);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSearchTerm('');
    onChange('');
    setIsOpen(false);
    inputRef.current?.focus();
  };

  // Quick Add New Person handler
  const handleQuickAdd = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const clean = quickAddName.trim().replace(/\s+/g, ' ');
    if (!clean) return;

    setQuickAddLoading(true);
    setQuickAddError(null);
    try {
      const res = await fetch('/api/persons', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({ name: clean }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'व्यक्ती जोडण्यात त्रुटी आली.');
      }

      setQuickAddName('');
      setIsQuickAdding(false);
      handleSelect(clean);
      await fetchSources();
      window.dispatchEvent(new CustomEvent('from-sources-updated', { detail: { name: clean } }));
    } catch (err: any) {
      setQuickAddError(err.message);
    } finally {
      setQuickAddLoading(false);
    }
  };

  return (
    <div ref={containerRef} className={`relative flex flex-col ${className}`}>
      {/* Label & Top Actions */}
      <div className="flex items-center justify-between mb-1">
        {label && (
          <label
            htmlFor={id}
            className="block text-xs font-bold text-slate-800 flex items-center gap-1.5"
          >
            <UserCheck className="w-3.5 h-3.5 text-blue-600" />
            <span>{label}</span>
            {required && <span className="text-rose-500">*</span>}
          </label>
        )}

        {/* Accessible Manage Persons Header Button */}
        <button
          type="button"
          onClick={() => setIsManageModalOpen(true)}
          className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 cursor-pointer transition-colors px-1.5 py-0.5 rounded hover:bg-blue-50"
          title="माध्यम / व्यक्ती व्यवस्थापित करा (Manage Persons)"
        >
          <Settings className="w-3 h-3 text-blue-600" />
          <span>व्यवस्थापन (Manage)</span>
        </button>
      </div>

      {/* Input Field with Dropdown Controls */}
      <div className="relative flex items-center">
        <input
          ref={inputRef}
          type="text"
          id={id}
          name={name}
          value={searchTerm}
          onChange={handleInputChange}
          onFocus={() => setIsOpen(true)}
          disabled={disabled}
          placeholder={placeholder}
          required={required}
          className={`w-full pl-3 pr-20 py-2 rounded-xl bg-slate-50 border text-xs font-semibold text-slate-900 transition-all focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            error ? 'border-rose-500 bg-rose-50/20 ring-1 ring-rose-300' : 'border-slate-300'
          } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
        />

        <div className="absolute right-2 flex items-center gap-1">
          {searchTerm && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-200 cursor-pointer"
              title="हटवा (Clear)"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Manage Icon directly inside control */}
          <button
            type="button"
            onClick={() => setIsManageModalOpen(true)}
            className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 cursor-pointer transition-colors"
            title="व्यक्ती व्यवस्थापन उघडा (Manage Persons)"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            disabled={disabled}
            className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200 cursor-pointer"
            title="यादी उघडा"
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180 text-blue-600' : ''}`} />
          </button>
        </div>
      </div>

      {error && <p className="text-[11px] font-bold text-rose-600 mt-1">{error}</p>}

      {/* Floating Suggestions Dropdown */}
      {isOpen && !disabled && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-64 overflow-y-auto divide-y divide-slate-100 text-xs py-1 animate-fade-in">
          {/* Header Bar */}
          <div className="px-3 py-1.5 bg-slate-50 flex items-center justify-between text-[11px] font-bold text-slate-500 sticky top-0 z-10 backdrop-blur-xs">
            <span>उपलब्ध व्यक्तींची नावे ({filteredSources.length})</span>
            <button
              type="button"
              onClick={() => setIsManageModalOpen(true)}
              className="text-blue-600 hover:underline flex items-center gap-1 font-bold"
            >
              <Settings className="w-3 h-3" />
              <span>Manage Persons</span>
            </button>
          </div>

          {/* Quick Add Option Inline */}
          {isQuickAdding ? (
            <div className="p-2 bg-blue-50/70 border-b border-blue-200 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={quickAddName}
                  onChange={(e) => setQuickAddName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      e.stopPropagation();
                      handleQuickAdd();
                    }
                  }}
                  placeholder="नवीन व्यक्तीचे नाव..."
                  autoFocus
                  className="w-full px-2 py-1 bg-white border border-blue-400 rounded-lg text-xs font-bold text-slate-900 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={(e) => handleQuickAdd(e)}
                  disabled={quickAddLoading || !quickAddName.trim()}
                  className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-lg text-[11px] shrink-0 flex items-center gap-1 cursor-pointer"
                >
                  {quickAddLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  <span>साठवा</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsQuickAdding(false)}
                  className="px-2 py-1 bg-slate-200 text-slate-700 rounded-lg text-[11px] font-bold hover:bg-slate-300 cursor-pointer"
                >
                  रद्द
                </button>
              </div>
              {quickAddError && (
                <p className="text-[10px] text-rose-600 font-bold">{quickAddError}</p>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setIsQuickAdding(true);
                setQuickAddName(searchTerm && !sources.includes(searchTerm) ? searchTerm : '');
              }}
              className="w-full text-left px-3 py-2 bg-blue-50/40 hover:bg-blue-100/60 text-blue-700 font-bold flex items-center gap-2 cursor-pointer transition-colors border-b border-slate-100"
            >
              <UserPlus className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span>+ Add New Person (नवीन व्यक्ती जोडा)</span>
            </button>
          )}

          {/* Suggestions List */}
          {filteredSources.length === 0 ? (
            <div className="px-3 py-4 text-center text-slate-400 space-y-1">
              <p className="text-xs font-semibold">"{searchTerm}" नावाचा स्त्रोत आढळला नाही.</p>
              <button
                type="button"
                onClick={() => {
                  setIsQuickAdding(true);
                  setQuickAddName(searchTerm);
                }}
                className="text-blue-600 hover:underline text-[11px] font-bold"
              >
                + "{searchTerm}" हे नवीन नाव म्हणून जोडा
              </button>
            </div>
          ) : (
            filteredSources.map((s) => {
              const isSelected = value?.trim().toLowerCase() === s.trim().toLowerCase();
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleSelect(s)}
                  className={`w-full text-left px-3 py-2 flex items-center justify-between cursor-pointer transition-colors ${
                    isSelected ? 'bg-blue-50 text-blue-900 font-bold' : 'hover:bg-slate-100 text-slate-800'
                  }`}
                >
                  <span className="truncate">{s}</span>
                  {isSelected && <span className="text-blue-600 text-[10px] font-bold">निवडले ✓</span>}
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
        currentUser={currentUser}
      />
    </div>
  );
};
