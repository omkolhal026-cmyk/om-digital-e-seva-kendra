import React, { useState, useEffect } from 'react';
import { Clock, Shield, User as UserIcon, LogOut, Search, ScanText, Sparkles, Bell, HelpCircle, Menu } from 'lucide-react';
import { User, OfficeSettings } from '../types';

interface NavbarProps {
  currentUser: User;
  settings: OfficeSettings;
  onLogout: () => void;
  onOpenSearch: () => void;
  onOpenOcrModal?: () => void;
  toggleSidebarMobile?: () => void;
  onSelectTab: (tab: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  settings,
  onLogout,
  onOpenSearch,
  onOpenOcrModal,
  toggleSidebarMobile,
  onSelectTab,
}) => {
  const [time, setTime] = useState<string>('');
  const [date, setDate] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        })
      );
      setDate(
        now.toLocaleDateString('en-IN', {
          weekday: 'short',
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })
      );
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="sticky top-0 z-30 w-full bg-white/90 backdrop-blur-md border-b border-slate-200/90 px-4 py-2.5 flex items-center justify-between text-slate-800 shadow-xs">
      
      {/* Left: Branding & Mobile Toggle */}
      <div className="flex items-center gap-3">
        {toggleSidebarMobile && (
          <button
            onClick={toggleSidebarMobile}
            className="md:hidden p-2 rounded-xl bg-slate-100 text-slate-600 hover:text-slate-900 border border-slate-200"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

        <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => onSelectTab('dashboard')}>
          {settings.officeLogo && settings.officeLogo.trim() !== '' ? (
            <img
              src={settings.officeLogo}
              alt="Logo"
              referrerPolicy="no-referrer"
              className="w-9 h-9 rounded-xl border border-slate-200 object-cover bg-slate-50 shadow-xs"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          ) : null}
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-sm font-extrabold text-slate-900 tracking-tight uppercase">
                {settings.officeName}
              </h1>
              <span className="hidden lg:inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                e-Seva Kendra
              </span>
            </div>
            <p className="text-[11px] text-slate-500 hidden sm:block font-medium">
              {settings.districtName} District Portal • MBOCWW Board ERP
            </p>
          </div>
        </div>
      </div>

      {/* Middle: Universal Search & OCR Tool Launcher */}
      <div className="hidden md:flex items-center gap-2 max-w-md w-full mx-4">
        <button
          onClick={onOpenSearch}
          className="flex-1 py-1.5 px-3 rounded-xl bg-slate-50 border border-slate-200/90 text-slate-500 text-xs flex items-center justify-between hover:border-blue-400 hover:text-slate-800 hover:bg-white transition-all shadow-xs"
        >
          <div className="flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-blue-600" />
            <span>Search MH No, Aadhaar, Mobile, Worker Name...</span>
          </div>
          <kbd className="px-1.5 py-0.5 rounded text-[10px] bg-slate-200/80 text-slate-600 font-mono border border-slate-300/60">
            Ctrl+K
          </kbd>
        </button>

        {onOpenOcrModal && (
          <button
            onClick={onOpenOcrModal}
            className="py-1.5 px-3 rounded-xl bg-gradient-to-r from-blue-700 to-indigo-800 hover:from-blue-800 hover:to-indigo-900 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs"
            title="AI PDF OCR Document Auto-Parser"
          >
            <ScanText className="w-3.5 h-3.5 text-sky-200" />
            <span className="hidden xl:inline">AI OCR Scan</span>
          </button>
        )}
      </div>

      {/* Right: Clock & User Profile */}
      <div className="flex items-center gap-3">
        
        {/* Live Date Time Clock */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-xl bg-slate-100/90 border border-slate-200 text-xs text-slate-700 font-mono">
          <Clock className="w-3.5 h-3.5 text-blue-700" />
          <div className="flex flex-col text-right leading-tight text-[11px]">
            <span className="font-bold text-slate-900">{time}</span>
            <span className="text-[10px] text-slate-500">{date}</span>
          </div>
        </div>

        {/* Role Badge */}
        <div className={`px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 border ${
          currentUser.role === 'admin'
            ? 'bg-amber-50 text-amber-800 border-amber-200'
            : 'bg-emerald-50 text-emerald-800 border-emerald-200'
        }`}>
          {currentUser.role === 'admin' ? (
            <Shield className="w-3.5 h-3.5 text-amber-600" />
          ) : (
            <UserIcon className="w-3.5 h-3.5 text-emerald-600" />
          )}
          <span className="capitalize">{currentUser.role}</span>
        </div>

        {/* Profile Dropdown / Logout button */}
        <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
          <button
            onClick={() => onSelectTab('profile')}
            className="p-1 rounded-xl hover:bg-slate-100 transition-all flex items-center gap-2 text-left"
            title="View Profile"
          >
            <img
              src={
                currentUser.photoUrl && currentUser.photoUrl.trim() !== ''
                  ? currentUser.photoUrl
                  : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'
              }
              alt={currentUser.name}
              referrerPolicy="no-referrer"
              className="w-8 h-8 rounded-full border border-slate-300 object-cover shadow-xs"
            />
            <div className="hidden lg:block">
              <div className="text-xs font-bold text-slate-900 truncate max-w-[110px]">
                {currentUser.name}
              </div>
              <div className="text-[10px] text-slate-500 truncate max-w-[110px]">
                {currentUser.username}
              </div>
            </div>
          </button>

          <button
            onClick={onLogout}
            className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-all"
            title="Logout System"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
