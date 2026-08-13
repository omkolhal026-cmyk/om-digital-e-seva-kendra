import React, { useState } from 'react';
import {
  LayoutDashboard,
  UserPlus,
  RefreshCw,
  Award,
  FileSpreadsheet,
  Search,
  Users,
  Settings,
  History,
  UserCircle,
  LogOut,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  ShieldAlert,
  Bell,
  Contact,
  AlertCircle,
  Boxes,
  MessageCircle,
} from 'lucide-react';
import { UserRole, User } from '../types';

interface SidebarProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  userRole: UserRole;
  currentUser?: User | null;
  onLogout: () => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  userRole,
  currentUser,
  onLogout,
  isMobileOpen = false,
  onCloseMobile,
}) => {
  const isAdmin = userRole === 'admin';
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);

  // Define full menu items list according to specification
  const menuItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      roles: ['admin', 'operator'],
    },
    {
      id: 'registration',
      label: 'Registration',
      icon: UserPlus,
      roles: ['admin', 'operator'],
      badge: 'MBOCWW',
    },
    {
      id: 'renewal',
      label: 'Renewal',
      icon: RefreshCw,
      roles: ['admin', 'operator'],
    },
    {
      id: 'claim',
      label: 'Claim Management',
      icon: Award,
      roles: ['admin', 'operator'],
      badge: 'MBOCWW',
    },
    {
      id: 'pending-verification',
      label: 'Pending Verification',
      icon: AlertCircle,
      roles: ['admin', 'operator'],
      badge: 'Alert',
    },
    {
      id: 'material-distribution',
      label: 'Material Distribution',
      icon: Boxes,
      roles: ['admin', 'operator'],
      badge: 'भांडी/पेटी/बॅग',
    },
    {
      id: 'whatsapp-group-pending',
      label: 'WhatsApp Group Pending',
      icon: MessageCircle,
      roles: ['admin', 'operator'],
      badge: 'WhatsApp',
    },
    {
      id: 'master-excel-sync',
      label: 'Master Excel Sync',
      icon: FileSpreadsheet,
      roles: ['admin', 'operator'],
      badge: 'Sync',
    },
    {
      id: 'search',
      label: 'Universal Search',
      icon: Search,
      roles: ['admin', 'operator'],
    },
    {
      id: 'reports',
      label: 'Reports & Analytics',
      icon: FileSpreadsheet,
      roles: ['admin'], // Admin only according to specification
    },
    {
      id: 'user-management',
      label: 'User Management',
      icon: Users,
      roles: ['admin'], // Admin only
      badge: 'Admin',
    },
    {
      id: 'settings',
      label: 'Office Settings',
      icon: Settings,
      roles: ['admin'], // Admin only
    },
    {
      id: 'activity-log',
      label: 'Activity Log',
      icon: History,
      roles: ['admin'], // Admin only
    },
    {
      id: 'profile',
      label: 'My Profile',
      icon: UserCircle,
      roles: ['admin', 'operator'],
    },
  ];

  const filteredMenuItems = menuItems.filter((item) => {
    if (!item.roles.includes(userRole)) return false;
    if (userRole === 'admin') return true;
    if (item.id === 'registration') return currentUser?.permissions?.canSeeRegistrationEntry !== false;
    if (item.id === 'renewal') return currentUser?.permissions?.canSeeRenewalEntry !== false;
    if (item.id === 'claim') return currentUser?.permissions?.canSeeClaimEntry !== false;
    if (item.id === 'pending-verification') return currentUser?.permissions?.canSeePendingVerification !== false;
    if (item.id === 'master-excel-sync') return currentUser?.permissions?.canSeeMasterExcelSync !== false;
    if (item.id === 'material-distribution') return currentUser?.permissions?.canSeeMaterialDistribution !== false;
    if (item.id === 'whatsapp-group-pending') return currentUser?.permissions?.canSeeWhatsappGroup !== false;
    if (item.id === 'search') return currentUser?.permissions?.canSeeSearch !== false;
    return true;
  });

  const handleItemClick = (id: string) => {
    onSelectTab(id);
    if (onCloseMobile) onCloseMobile();
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-slate-950/80 backdrop-blur-sm md:hidden"
        />
      )}

      <aside
        className={`fixed md:static top-0 left-0 z-50 h-full bg-gradient-to-b from-[#0f172a] via-[#1e3a8a] to-[#0f172a] border-r border-blue-900/40 flex flex-col justify-between transition-all duration-300 shadow-xl relative ${
          isCollapsed ? 'md:w-20 w-64' : 'w-64'
        } ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Slide Collapse Button (Desktop) */}
        <button
          type="button"
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="hidden md:flex absolute -right-3 top-6 z-50 w-6 h-6 bg-blue-600 hover:bg-blue-500 text-white rounded-full items-center justify-center shadow-lg border border-blue-400 cursor-pointer transition-transform hover:scale-110"
          title={isCollapsed ? 'Expand Sidebar' : 'Collapse / Slide Sidebar'}
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>

        <div className="p-3 space-y-4 flex-1 overflow-y-auto overflow-x-hidden">
          {/* Header Role Banner */}
          {!isCollapsed ? (
            <div className="p-3 rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 shadow-inner">
              <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-blue-200/90 mb-1">
                <span>Access Level</span>
                <span className={`px-2 py-0.5 rounded-full ${isAdmin ? 'bg-amber-400/20 text-amber-300 border border-amber-400/30' : 'bg-emerald-400/20 text-emerald-300 border border-emerald-400/30'}`}>
                  {isAdmin ? 'Full Access' : 'Limited Access'}
                </span>
              </div>
              <div className="text-xs font-bold text-white flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-sky-300" />
                <span>{isAdmin ? 'Administrator Portal' : 'Operator Workstation'}</span>
              </div>
            </div>
          ) : (
            <div className="flex justify-center p-2 rounded-xl bg-white/10 text-sky-300" title={isAdmin ? 'Administrator Portal' : 'Operator Workstation'}>
              <Sparkles className="w-5 h-5" />
            </div>
          )}

          {/* Nav Links */}
          <nav className="space-y-1">
            {!isCollapsed && (
              <div className="px-3 text-[10px] font-bold text-blue-200/70 uppercase tracking-widest mb-2">
                Main Navigation
              </div>
            )}

            {filteredMenuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => handleItemClick(item.id)}
                  title={isCollapsed ? item.label : undefined}
                  className={`w-full py-2.5 px-3 rounded-xl font-medium text-xs flex items-center ${
                    isCollapsed ? 'justify-center' : 'justify-between'
                  } transition-all group ${
                    isActive
                      ? 'bg-white/20 text-white font-semibold border-l-4 border-sky-400 shadow-md backdrop-blur-md'
                      : 'text-blue-100/80 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 shrink-0 transition-colors ${isActive ? 'text-white' : 'text-blue-200/70 group-hover:text-sky-300'}`} />
                    {!isCollapsed && <span>{item.label}</span>}
                  </div>

                  {!isCollapsed && (
                    <div className="flex items-center gap-1.5">
                      {item.badge && (
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          isActive
                            ? 'bg-sky-400 text-blue-950'
                            : 'bg-white/10 text-sky-200 border border-white/10'
                        }`}>
                          {item.badge}
                        </span>
                      )}
                      {isActive && <ChevronRight className="w-3.5 h-3.5 text-sky-300" />}
                    </div>
                  )}
                </button>
              );
            })}
          </nav>

          {!isAdmin && !isCollapsed && (
            <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-[11px] text-blue-100/70 space-y-1">
              <div className="flex items-center gap-1.5 text-amber-300 font-semibold text-xs">
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Operator Scope</span>
              </div>
              <p className="text-blue-200/60 text-[10px]">
                User Management, Settings, Activity Logs, and Reports are restricted to Admin accounts.
              </p>
            </div>
          )}
        </div>

        {/* Sidebar Footer Logout */}
        <div className="p-3 border-t border-white/10 bg-black/20">
          <button
            onClick={onLogout}
            title={isCollapsed ? 'Sign Out System' : undefined}
            className={`w-full py-2.5 px-3 rounded-xl text-xs font-semibold text-rose-200 hover:text-white bg-rose-500/20 hover:bg-rose-600/30 border border-rose-400/30 transition-all flex items-center ${
              isCollapsed ? 'justify-center' : 'justify-center gap-2'
            }`}
          >
            <LogOut className="w-4 h-4" />
            {!isCollapsed && <span>Sign Out System</span>}
          </button>
        </div>
      </aside>
    </>
  );
};
