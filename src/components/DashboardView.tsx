import React from 'react';
import {
  UserPlus,
  RefreshCw,
  Award,
  TrendingUp,
  Clock,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Users,
  Search,
  ScanText,
  ArrowUpRight,
  FileText,
  Sparkles,
  MapPin,
  ChevronRight,
} from 'lucide-react';
import { User, WorkerRegistration, WorkerRenewal, WorkerClaim, ActivityLog, DashboardStats } from '../types';

interface DashboardViewProps {
  currentUser: User;
  registrations: WorkerRegistration[];
  renewals: WorkerRenewal[];
  claims: WorkerClaim[];
  logs: ActivityLog[];
  onSelectTab: (tab: string) => void;
  onOpenOcrModal: () => void;
  onOpenSearch: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  currentUser,
  registrations,
  renewals,
  claims,
  logs,
  onSelectTab,
  onOpenOcrModal,
  onOpenSearch,
}) => {
  // Compute Stats
  const totalReg = registrations.length;
  const totalRen = renewals.length;
  const totalClm = claims.length;

  const todayStr = new Date().toISOString().split('T')[0];
  const dailyReg = registrations.filter((r) => r.registrationDate === todayStr).length;
  const dailyRen = renewals.filter((r) => r.renewalDate === todayStr).length;
  const dailyClm = claims.filter((c) => c.claimDate === todayStr).length;
  const dailyWorkCount = dailyReg + dailyRen + dailyClm;

  const pendingReg = registrations.filter((r) => r.status === 'Pending Verification').length;
  const pendingClm = claims.filter((c) => c.status === 'Submitted' || c.status === 'Under Scrutiny').length;
  const pendingWorkCount = pendingReg + pendingClm;

  const totalDisbursed = claims
    .filter((c) => c.status === 'Disbursed' || c.status === 'Approved')
    .reduce((sum, c) => sum + (c.totalAmount || 0), 0);

  // Taluka Wise Distribution
  const talukaCounts: Record<string, number> = {};
  registrations.forEach((r) => {
    const t = r.taluka || 'Unknown';
    talukaCounts[t] = (talukaCounts[t] || 0) + 1;
  });

  const maxTalukaCount = Math.max(...Object.values(talukaCounts), 1);

  return (
    <div className="space-y-6 pb-8">
      {/* Top Welcome Banner Card */}
      <div className="relative overflow-hidden rounded-3xl brand-gradient border border-blue-800/30 p-6 md:p-8 shadow-md text-white">
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 border border-white/20 text-white text-xs font-bold">
              <Sparkles className="w-3.5 h-3.5 text-sky-200" />
              <span>Official MBOCWW Board Portal • OM DIGITAL E-SEVA KENDRA</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white">
              Welcome back, {currentUser.name}! 👋
            </h1>
            <p className="text-xs md:text-sm text-blue-100/90 max-w-xl font-medium">
              Logged in as <span className="font-bold text-white capitalize underline decoration-sky-300 decoration-2">{currentUser.role}</span>. Manage worker registrations, multi-year renewals, and MBOCWW scheme claim disbursals efficiently.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => onSelectTab('registration')}
              className="py-2.5 px-4 rounded-xl bg-white text-blue-900 hover:bg-blue-50 font-bold text-xs shadow-md flex items-center gap-2 transition-all active:scale-95"
            >
              <UserPlus className="w-4 h-4 text-blue-700" />
              <span>New Registration</span>
            </button>

            <button
              onClick={onOpenOcrModal}
              className="py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/30 font-semibold text-xs flex items-center gap-2 transition-all"
            >
              <ScanText className="w-4 h-4 text-sky-200" />
              <span>AI PDF Scanner</span>
            </button>
          </div>
        </div>
      </div>

      {/* Primary Key Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Total Registrations */}
        <div
          onClick={() => onSelectTab('registration')}
          className="cursor-pointer group p-5 rounded-2xl bg-white border border-slate-200/90 hover:border-blue-400 transition-all shadow-xs hover:shadow-md relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50/50 rounded-full blur-xl group-hover:bg-blue-100/60 transition-all" />
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Registration</span>
            <div className="p-2.5 rounded-xl bg-blue-50 text-blue-700 border border-blue-200/60 group-hover:scale-110 transition-transform">
              <UserPlus className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl md:text-3xl font-extrabold text-[#1e3a8a] tracking-tight">
            {totalReg.toLocaleString('en-IN')}
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-1">
            <span className="text-emerald-600 font-bold flex items-center">
              <TrendingUp className="w-3 h-3 mr-0.5" /> +{dailyReg} Today
            </span>
            <span>• MBOCWW Worker Cards</span>
          </div>
        </div>

        {/* Total Renewals */}
        <div
          onClick={() => onSelectTab('renewal')}
          className="cursor-pointer group p-5 rounded-2xl bg-white border border-slate-200/90 hover:border-indigo-400 transition-all shadow-xs hover:shadow-md relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50/50 rounded-full blur-xl group-hover:bg-indigo-100/60 transition-all" />
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Renewal</span>
            <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200/60 group-hover:scale-110 transition-transform">
              <RefreshCw className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl md:text-3xl font-extrabold text-indigo-900 tracking-tight">
            {totalRen.toLocaleString('en-IN')}
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-1">
            <span className="text-indigo-600 font-bold">+{dailyRen} Today</span>
            <span>• Annual & 3-Yr Renewals</span>
          </div>
        </div>

        {/* Total Claims */}
        <div
          onClick={() => onSelectTab('claim')}
          className="cursor-pointer group p-5 rounded-2xl bg-white border border-slate-200/90 hover:border-amber-400 transition-all shadow-xs hover:shadow-md relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-50/50 rounded-full blur-xl group-hover:bg-amber-100/60 transition-all" />
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Claims</span>
            <div className="p-2.5 rounded-xl bg-amber-50 text-amber-700 border border-amber-200/60 group-hover:scale-110 transition-transform">
              <Award className="w-5 h-5" />
            </div>
          </div>
          <div className="text-2xl md:text-3xl font-extrabold text-amber-900 tracking-tight">
            {totalClm.toLocaleString('en-IN')}
          </div>
          <div className="mt-2 text-[11px] text-slate-500 flex items-center gap-1">
            <span className="text-amber-700 font-bold">₹{(totalDisbursed / 1000).toFixed(0)}k</span>
            <span>Total Sanctioned Aid</span>
          </div>
        </div>

        {/* Daily Work Summary */}
        <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Daily Work Summary</span>
            <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200/60">
              <Clock className="w-5 h-5" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-slate-900">{dailyWorkCount}</div>
            <div className="text-[11px] text-slate-500 font-medium">Total Work Completed Today</div>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-100 text-[10px] text-slate-500 flex justify-between font-medium">
            <span>System Status: <span className="text-emerald-600 font-bold">Live Online</span></span>
          </div>
        </div>
      </div>

      {/* Secondary Dashboard Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Taluka-wise Distribution Chart */}
        <div className="lg:col-span-2 p-6 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-blue-700" />
                <span>Taluka-Wise Registration Density</span>
              </h3>
              <p className="text-xs text-slate-500">Distribution of registered workers across district talukas</p>
            </div>

            <button
              onClick={() => onSelectTab('search')}
              className="text-xs font-bold text-blue-700 hover:text-blue-800 flex items-center gap-1"
            >
              <span>View All</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3 pt-2">
            {Object.entries(talukaCounts).map(([taluka, count]) => {
              const percent = Math.round((count / maxTalukaCount) * 100);
              return (
                <div key={taluka} className="space-y-1">
                  <div className="flex justify-between text-xs text-slate-700 font-semibold">
                    <span>Taluka {taluka}</span>
                    <span className="text-blue-700 font-bold">{count} Workers</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden border border-slate-200/50">
                    <div
                      className="bg-gradient-to-r from-blue-700 to-indigo-700 h-full rounded-full transition-all duration-500"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Quick Action Station & System Quick Links */}
        <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-4">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-blue-700" />
            <span>Quick Workstation Actions</span>
          </h3>

          <div className="space-y-2">
            <button
              onClick={() => onSelectTab('registration')}
              className="w-full p-3 rounded-xl bg-slate-50 hover:bg-blue-50/60 border border-slate-200/80 hover:border-blue-300 text-left transition-all flex items-center justify-between group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-100 text-blue-800">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 group-hover:text-blue-800">
                    Register New Worker
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Add worker details & documents
                  </div>
                </div>
              </div>
              <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-blue-700 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </button>

            <button
              onClick={() => onSelectTab('renewal')}
              className="w-full p-3 rounded-xl bg-slate-50 hover:bg-indigo-50/60 border border-slate-200/80 hover:border-indigo-300 text-left transition-all flex items-center justify-between group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-indigo-100 text-indigo-800">
                  <RefreshCw className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 group-hover:text-indigo-800">
                    Process Registration Renewal
                  </div>
                  <div className="text-[10px] text-slate-500">
                    1-Year & 3-Year MH renewal
                  </div>
                </div>
              </div>
              <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-700 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </button>

            <button
              onClick={() => onSelectTab('claim')}
              className="w-full p-3 rounded-xl bg-slate-50 hover:bg-amber-50/60 border border-slate-200/80 hover:border-amber-300 text-left transition-all flex items-center justify-between group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-100 text-amber-800">
                  <Award className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 group-hover:text-amber-800">
                    Apply MBOCWW Scheme Claim
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Marriage, Education, Tool Kits
                  </div>
                </div>
              </div>
              <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-amber-700 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </button>

            <button
              onClick={onOpenSearch}
              className="w-full p-3 rounded-xl bg-slate-50 hover:bg-emerald-50/60 border border-slate-200/80 hover:border-emerald-300 text-left transition-all flex items-center justify-between group"
            >
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-100 text-emerald-800">
                  <Search className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-bold text-slate-900 group-hover:text-emerald-800">
                    Universal Worker Lookup
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Search by MH No or Aadhaar
                  </div>
                </div>
              </div>
              <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-700 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Recent Activity Log */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Clock className="w-4 h-4 text-blue-700" />
            <span>Recent System Activities</span>
          </h3>
          {currentUser.role === 'admin' && (
            <button
              onClick={() => onSelectTab('activity-log')}
              className="text-xs font-bold text-blue-700 hover:text-blue-800"
            >
              Full Audit Log
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {logs.slice(0, 6).map((log) => (
            <div
              key={log.id}
              className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex items-start gap-3"
            >
              <div className="p-2 rounded-lg bg-blue-50 text-blue-700 mt-0.5">
                <FileText className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1">
                <div className="text-xs font-semibold text-slate-800">{log.details}</div>
                <div className="text-[10px] text-slate-500 mt-1 flex items-center justify-between font-medium">
                  <span>Operator: <span className="text-slate-700 font-bold">{log.username}</span></span>
                  <span>{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
