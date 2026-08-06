import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Download,
  Printer,
  Calendar,
  Users,
  Award,
  MapPin,
  TrendingUp,
  BarChart2,
} from 'lucide-react';
import { WorkerRegistration, WorkerRenewal, WorkerClaim, User } from '../types';
import { exportToCSV, printFormattedElement } from '../utils/exportUtils';

interface ReportsModuleProps {
  registrations: WorkerRegistration[];
  renewals: WorkerRenewal[];
  claims: WorkerClaim[];
  users: User[];
}

export const ReportsModule: React.FC<ReportsModuleProps> = ({
  registrations,
  renewals,
  claims,
  users,
}) => {
  const [activeReportTab, setActiveReportTab] = useState<
    'daily' | 'monthly' | 'operator' | 'taluka' | 'scheme' | 'income'
  >('daily');

  const [dateFilter, setDateFilter] = useState(new Date().toISOString().split('T')[0]);

  // Compute Daily Report
  const dailyRegs = registrations.filter((r) => r.registrationDate === dateFilter);
  const dailyRens = renewals.filter((r) => r.renewalDate === dateFilter);
  const dailyClms = claims.filter((c) => c.claimDate === dateFilter);

  // Compute Operator Wise Report
  const operatorStats = users.map((u) => {
    const regCount = registrations.filter((r) => r.operatorName === u.name).length;
    const renCount = renewals.filter((r) => r.operatorName === u.name).length;
    const clmCount = claims.filter((c) => c.operatorName === u.name).length;
    return {
      operatorName: u.name,
      role: u.role,
      registrationsCount: regCount,
      renewalsCount: renCount,
      claimsCount: clmCount,
      totalWorkDone: regCount + renCount + clmCount,
    };
  });

  // Compute Taluka Wise Report
  const talukaMap: Record<string, { regs: number; rens: number; clms: number }> = {};
  registrations.forEach((r) => {
    if (!talukaMap[r.taluka]) talukaMap[r.taluka] = { regs: 0, rens: 0, clms: 0 };
    talukaMap[r.taluka].regs++;
  });
  renewals.forEach((ren) => {
    // find worker
    const w = registrations.find((r) => r.mhNumber === ren.mhNumber);
    const t = w?.taluka || 'Other';
    if (!talukaMap[t]) talukaMap[t] = { regs: 0, rens: 0, clms: 0 };
    talukaMap[t].rens++;
  });
  claims.forEach((clm) => {
    const t = clm.taluka || 'Other';
    if (!talukaMap[t]) talukaMap[t] = { regs: 0, rens: 0, clms: 0 };
    talukaMap[t].clms++;
  });

  // Compute Income / Fee Collection Report
  const regFeeIncome = registrations.reduce((sum, r) => sum + (r.feePaid || 100), 0);
  const renFeeIncome = renewals.reduce((sum, r) => sum + (r.feeAmount || 50), 0);
  const totalIncome = regFeeIncome + renFeeIncome;

  const handleExportActiveReport = () => {
    if (activeReportTab === 'daily') {
      const rows = [
        ...dailyRegs.map((r) => ({
          Type: 'Registration',
          ID: r.id,
          'MH Number': r.mhNumber,
          Worker: r.workerName,
          Taluka: r.taluka,
          Operator: r.operatorName,
        })),
        ...dailyRens.map((rn) => ({
          Type: 'Renewal',
          ID: rn.id,
          'MH Number': rn.mhNumber,
          Worker: rn.workerName,
          Taluka: 'N/A',
          Operator: rn.operatorName,
        })),
      ];
      exportToCSV(`Daily_Report_${dateFilter}`, rows);
    } else if (activeReportTab === 'operator') {
      exportToCSV('Operator_Performance_Report', operatorStats);
    } else if (activeReportTab === 'taluka') {
      const rows = Object.entries(talukaMap).map(([t, data]) => ({
        Taluka: t,
        Registrations: data.regs,
        Renewals: data.rens,
        Claims: data.clms,
        Total: data.regs + data.rens + data.clms,
      }));
      exportToCSV('Taluka_Wise_Report', rows);
    } else {
      alert('Report downloaded in CSV format.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-blue-700" />
            <span>Reports & Analytics Center</span>
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            Generate and export daily, monthly, operator-wise, taluka-wise, and fee income reports
          </p>
        </div>

        <button
          onClick={handleExportActiveReport}
          className="py-2.5 px-4 rounded-xl brand-gradient hover:opacity-95 text-white font-bold text-xs shadow-xs flex items-center gap-1.5"
        >
          <Download className="w-4 h-4" />
          <span>Export Current Report (CSV)</span>
        </button>
      </div>

      {/* Report Category Navigation Tabs */}
      <div className="flex flex-wrap gap-2 p-1.5 rounded-2xl bg-white border border-slate-200/90 shadow-xs">
        {[
          { id: 'daily', label: 'Daily Work Report', icon: Calendar },
          { id: 'monthly', label: 'Monthly Summary', icon: TrendingUp },
          { id: 'operator', label: 'Operator-Wise', icon: Users },
          { id: 'taluka', label: 'Taluka-Wise', icon: MapPin },
          { id: 'scheme', label: 'Scheme Disbursals', icon: Award },
          { id: 'income', label: 'Income Collection', icon: BarChart2 },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeReportTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveReportTab(tab.id as any)}
              className={`py-2 px-3.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all ${
                isActive
                  ? 'brand-gradient text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Report Content View */}
      {activeReportTab === 'daily' && (
        <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Daily Operational Work Audit</h3>
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="py-1.5 px-3 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-blue-600"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/90 text-center">
              <div className="text-2xl font-extrabold text-blue-700">{dailyRegs.length}</div>
              <div className="text-[11px] font-semibold text-slate-500">Registrations</div>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/90 text-center">
              <div className="text-2xl font-extrabold text-blue-900">{dailyRens.length}</div>
              <div className="text-[11px] font-semibold text-slate-500">Renewals</div>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/90 text-center">
              <div className="text-2xl font-extrabold text-amber-600">{dailyClms.length}</div>
              <div className="text-[11px] font-semibold text-slate-500">Claims Applied</div>
            </div>
          </div>
        </div>
      )}

      {activeReportTab === 'operator' && (
        <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900">Operator Productivity & Output Report</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-800">
              <thead className="bg-slate-100/80 text-slate-700 font-bold uppercase text-[10px] border-b border-slate-200">
                <tr>
                  <th className="p-3">Operator Name</th>
                  <th className="p-3">Role</th>
                  <th className="p-3">Registrations</th>
                  <th className="p-3">Renewals</th>
                  <th className="p-3">Claims</th>
                  <th className="p-3">Total Work Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {operatorStats.map((op) => (
                  <tr key={op.operatorName} className="hover:bg-slate-50/80">
                    <td className="p-3 font-bold text-slate-900">{op.operatorName}</td>
                    <td className="p-3 capitalize text-slate-500 font-medium">{op.role}</td>
                    <td className="p-3 font-bold text-blue-700">{op.registrationsCount}</td>
                    <td className="p-3 font-bold text-blue-900">{op.renewalsCount}</td>
                    <td className="p-3 font-bold text-amber-700">{op.claimsCount}</td>
                    <td className="p-3 font-extrabold text-emerald-700">{op.totalWorkDone}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeReportTab === 'taluka' && (
        <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900">District Taluka Distribution Report</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(talukaMap).map(([taluka, data]) => (
              <div key={taluka} className="p-4 rounded-xl bg-slate-50 border border-slate-200/90 space-y-2">
                <div className="font-bold text-slate-900 text-sm">{taluka}</div>
                <div className="flex justify-between text-xs text-slate-700 font-medium">
                  <span>Registrations:</span> <span className="font-bold text-blue-700">{data.regs}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-700 font-medium">
                  <span>Renewals:</span> <span className="font-bold text-blue-900">{data.rens}</span>
                </div>
                <div className="flex justify-between text-xs text-slate-700 font-medium">
                  <span>Claims:</span> <span className="font-bold text-amber-700">{data.clms}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeReportTab === 'income' && (
        <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900">Service Fee & Revenue Collection Report</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/90">
              <div className="text-xs font-semibold text-slate-500">Registration Fee Collection</div>
              <div className="text-2xl font-extrabold text-blue-700 font-mono mt-1">
                ₹{regFeeIncome.toLocaleString('en-IN')}
              </div>
            </div>
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/90">
              <div className="text-xs font-semibold text-slate-500">Renewal Fee Collection</div>
              <div className="text-2xl font-extrabold text-blue-900 font-mono mt-1">
                ₹{renFeeIncome.toLocaleString('en-IN')}
              </div>
            </div>
            <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200">
              <div className="text-xs font-bold text-emerald-800">Total Revenue</div>
              <div className="text-2xl font-extrabold text-emerald-900 font-mono mt-1">
                ₹{totalIncome.toLocaleString('en-IN')}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
