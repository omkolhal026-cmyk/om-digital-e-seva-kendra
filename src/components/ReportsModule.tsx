import React, { useState, useEffect } from 'react';
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
  RefreshCw,
  RotateCcw,
  IndianRupee,
  Wallet,
} from 'lucide-react';
import { WorkerRegistration, WorkerRenewal, WorkerClaim, User, IncomeCollectionRecord } from '../types';
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

  // Income Collection State (Live Payments after Reset)
  const [incomeCollections, setIncomeCollections] = useState<IncomeCollectionRecord[]>([]);
  const [loadingIncome, setLoadingIncome] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [incomeDateFilter, setIncomeDateFilter] = useState('');
  const [incomeModeFilter, setIncomeModeFilter] = useState<'All' | 'Cash' | 'Online'>('All');

  const fetchIncomeCollections = async () => {
    setLoadingIncome(true);
    try {
      const res = await fetch('/api/income-collections');
      if (res.ok) {
        const data = await res.json();
        setIncomeCollections(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to fetch income collections:', err);
    } finally {
      setLoadingIncome(false);
    }
  };

  useEffect(() => {
    fetchIncomeCollections();
  }, []);

  useEffect(() => {
    if (activeReportTab === 'income' || activeReportTab === 'daily') {
      fetchIncomeCollections();
    }
  }, [activeReportTab]);

  const handleResetIncomeCollection = async () => {
    setResetting(true);
    try {
      const res = await fetch('/api/income-collections/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        setIncomeCollections([]);
        setShowResetConfirm(false);
        alert('Income Collection records have been reset successfully. Existing registration, renewal, claim, and user records remain completely untouched.');
      } else {
        const err = await res.json().catch(() => ({ error: 'Failed' }));
        alert(err.error || 'Failed to reset income collections.');
      }
    } catch (err: any) {
      alert(err?.message || 'Error connecting to server.');
    } finally {
      setResetting(false);
    }
  };

  // Compute Daily Report Operations
  const dailyRegs = registrations.filter((r) => r.registrationDate === dateFilter);
  const dailyRens = renewals.filter((r) => r.renewalDate === dateFilter);
  const dailyClms = claims.filter((c) => c.claimDate === dateFilter);

  // Compute Daily Income (from Income Collections on dateFilter + any live registration/renewal with fee)
  const dailyIncomeRecords = incomeCollections.filter((item) => item.paymentDate === dateFilter);

  // Build O(1) lookup map for income collections
  const dailyIncomeMap = React.useMemo(() => {
    const map = new Map<string, IncomeCollectionRecord>();
    for (const item of dailyIncomeRecords) {
      map.set(`${item.sourceType}:${item.sourceId}`, item);
    }
    return map;
  }, [dailyIncomeRecords]);

  const allIncomeMap = React.useMemo(() => {
    const map = new Map<string, IncomeCollectionRecord>();
    for (const item of incomeCollections) {
      map.set(`${item.sourceType}:${item.sourceId}`, item);
    }
    return map;
  }, [incomeCollections]);

  const getRecordIncome = (
    sourceType: 'Registration' | 'Renewal',
    sourceId: string | number,
    fallbackAmount?: number,
    fallbackMode?: string
  ) => {
    const key = `${sourceType}:${sourceId}`;
    const direct = dailyIncomeMap.get(key);
    if (direct) {
      return {
        amount: Number(direct.paymentAmount) || 0,
        mode: direct.paymentMode || 'N/A',
      };
    }
    const anyDate = allIncomeMap.get(key);
    if (anyDate && anyDate.paymentDate === dateFilter) {
      return {
        amount: Number(anyDate.paymentAmount) || 0,
        mode: anyDate.paymentMode || 'N/A',
      };
    }
    if (fallbackAmount && (fallbackMode === 'Cash' || fallbackMode === 'Online')) {
      return {
        amount: Number(fallbackAmount) || 0,
        mode: fallbackMode,
      };
    }
    return {
      amount: 0,
      mode: 'N/A',
    };
  };

  // Combine daily registrations and renewals income for dateFilter
  const unlinkedRegs = dailyRegs.filter(
    (r) =>
      (r.paymentMode === 'Cash' || r.paymentMode === 'Online') &&
      Number(r.paymentAmount) > 0 &&
      !dailyIncomeMap.has(`Registration:${r.id}`)
  );
  const unlinkedRens = dailyRens.filter(
    (r) =>
      (r.paymentMode === 'Cash' || r.paymentMode === 'Online') &&
      Number(r.paymentAmount) > 0 &&
      !dailyIncomeMap.has(`Renewal:${r.id}`)
  );

  const effectiveDailyIncomes = [
    ...dailyIncomeRecords,
    ...unlinkedRegs.map((r) => ({
      id: `SYNC-REG-${r.id}`,
      sourceType: 'Registration' as const,
      sourceId: String(r.id),
      workerName: r.workerName,
      mhNumber: r.mhNumber || '',
      paymentDate: r.registrationDate || dateFilter,
      paymentAmount: Number(r.paymentAmount),
      paymentMode: r.paymentMode as 'Cash' | 'Online',
      operatorName: r.operatorName || '',
      taluka: r.taluka || '',
      createdAt: '',
      updatedAt: '',
    })),
    ...unlinkedRens.map((r) => ({
      id: `SYNC-REN-${r.id}`,
      sourceType: 'Renewal' as const,
      sourceId: String(r.id),
      workerName: r.workerName,
      mhNumber: r.mhNumber || '',
      paymentDate: r.renewalDate || dateFilter,
      paymentAmount: Number(r.paymentAmount),
      paymentMode: r.paymentMode as 'Cash' | 'Online',
      operatorName: r.operatorName || '',
      taluka: r.taluka || '',
      createdAt: '',
      updatedAt: '',
    })),
  ];

  const dailyTotalIncome = effectiveDailyIncomes.reduce((sum, r) => sum + (Number(r.paymentAmount) || 0), 0);
  const dailyCashIncome = effectiveDailyIncomes
    .filter((r) => r.paymentMode === 'Cash')
    .reduce((sum, r) => sum + (Number(r.paymentAmount) || 0), 0);
  const dailyOnlineIncome = effectiveDailyIncomes
    .filter((r) => r.paymentMode === 'Online')
    .reduce((sum, r) => sum + (Number(r.paymentAmount) || 0), 0);
  const dailyRegIncome = effectiveDailyIncomes
    .filter((r) => r.sourceType === 'Registration')
    .reduce((sum, r) => sum + (Number(r.paymentAmount) || 0), 0);
  const dailyRenIncome = effectiveDailyIncomes
    .filter((r) => r.sourceType === 'Renewal')
    .reduce((sum, r) => sum + (Number(r.paymentAmount) || 0), 0);

  // Daily Work & Income Itemized Operations
  const dailyCombinedItems = [
    ...dailyRegs.map((r) => {
      const inc = getRecordIncome('Registration', r.id, r.paymentAmount, r.paymentMode);
      return {
        key: `reg-${r.id}`,
        id: String(r.id),
        type: 'Registration' as const,
        workerName: r.workerName,
        identifier: r.mhNumber || String(r.id),
        taluka: r.taluka || '-',
        operatorName: r.operatorName || '-',
        paymentAmount: inc.amount,
        paymentMode: inc.mode,
        status: r.status,
      };
    }),
    ...dailyRens.map((rn) => {
      const inc = getRecordIncome('Renewal', rn.id, rn.paymentAmount, rn.paymentMode);
      return {
        key: `ren-${rn.id}`,
        id: String(rn.id),
        type: 'Renewal' as const,
        workerName: rn.workerName,
        identifier: rn.mhNumber,
        taluka: rn.taluka || '-',
        operatorName: rn.operatorName || '-',
        paymentAmount: inc.amount,
        paymentMode: inc.mode,
        status: rn.status,
      };
    }),
    ...dailyClms.map((c) => ({
      key: `clm-${c.id}`,
      id: String(c.id),
      type: 'Claim' as const,
      workerName: c.workerName,
      identifier: c.id,
      taluka: c.taluka || '-',
      operatorName: c.operatorName || '-',
      paymentAmount: 0,
      paymentMode: 'N/A' as const,
      status: c.status,
    })),
  ];

  // Compute Operator Wise Report (Optimized O(N) frequency counts)
  const operatorStats = React.useMemo(() => {
    const regCountByOp = new Map<string, number>();
    for (const r of registrations) {
      if (r.operatorName) regCountByOp.set(r.operatorName, (regCountByOp.get(r.operatorName) || 0) + 1);
    }
    const renCountByOp = new Map<string, number>();
    for (const r of renewals) {
      if (r.operatorName) renCountByOp.set(r.operatorName, (renCountByOp.get(r.operatorName) || 0) + 1);
    }
    const clmCountByOp = new Map<string, number>();
    for (const c of claims) {
      if (c.operatorName) clmCountByOp.set(c.operatorName, (clmCountByOp.get(c.operatorName) || 0) + 1);
    }

    return users.map((u) => {
      const regCount = regCountByOp.get(u.name) || 0;
      const renCount = renCountByOp.get(u.name) || 0;
      const clmCount = clmCountByOp.get(u.name) || 0;
      return {
        operatorName: u.name,
        role: u.role,
        registrationsCount: regCount,
        renewalsCount: renCount,
        claimsCount: clmCount,
        totalWorkDone: regCount + renCount + clmCount,
      };
    });
  }, [users, registrations, renewals, claims]);

  // Compute Taluka Wise Report (Optimized O(N) index mapping)
  const talukaMap = React.useMemo(() => {
    const map: Record<string, { regs: number; rens: number; clms: number }> = {};
    const regTalukaByMh = new Map<string, string>();

    for (const r of registrations) {
      const t = r.taluka || 'Other';
      if (!map[t]) map[t] = { regs: 0, rens: 0, clms: 0 };
      map[t].regs++;
      if (r.mhNumber) {
        regTalukaByMh.set(r.mhNumber.trim().toUpperCase(), t);
      }
    }

    for (const ren of renewals) {
      const renMh = ren.mhNumber ? ren.mhNumber.trim().toUpperCase() : '';
      const t = (renMh && regTalukaByMh.get(renMh)) || ren.taluka || 'Other';
      if (!map[t]) map[t] = { regs: 0, rens: 0, clms: 0 };
      map[t].rens++;
    }

    for (const clm of claims) {
      const t = clm.taluka || 'Other';
      if (!map[t]) map[t] = { regs: 0, rens: 0, clms: 0 };
      map[t].clms++;
    }

    return map;
  }, [registrations, renewals, claims]);

  // Compute Income / Fee Collection Report (Computed strictly from live Income Collection records after reset)
  const filteredIncome = incomeCollections.filter((item) => {
    if (incomeDateFilter && item.paymentDate !== incomeDateFilter) return false;
    if (incomeModeFilter !== 'All' && item.paymentMode !== incomeModeFilter) return false;
    return true;
  });

  const regFeeIncome = filteredIncome
    .filter((r) => r.sourceType === 'Registration')
    .reduce((sum, r) => sum + (Number(r.paymentAmount) || 0), 0);

  const renFeeIncome = filteredIncome
    .filter((r) => r.sourceType === 'Renewal')
    .reduce((sum, r) => sum + (Number(r.paymentAmount) || 0), 0);

  const totalIncome = regFeeIncome + renFeeIncome;

  const cashIncome = filteredIncome
    .filter((r) => r.paymentMode === 'Cash')
    .reduce((sum, r) => sum + (Number(r.paymentAmount) || 0), 0);

  const onlineIncome = filteredIncome
    .filter((r) => r.paymentMode === 'Online')
    .reduce((sum, r) => sum + (Number(r.paymentAmount) || 0), 0);

  const handleExportActiveReport = () => {
    if (activeReportTab === 'daily') {
      const rows: any[] = dailyCombinedItems.map((item) => ({
        Date: dateFilter,
        Type: item.type,
        'Worker Name': item.workerName,
        'Identifier / MH No': item.identifier,
        Taluka: item.taluka,
        Operator: item.operatorName,
        'Payment Mode': item.paymentMode,
        'Income Collected (₹)': item.paymentAmount,
        Status: item.status,
      }));
      // Append summary row
      rows.push({
        Date: dateFilter,
        Type: 'SUMMARY TOTALS',
        'Worker Name': `Total Work: ${dailyCombinedItems.length} tasks`,
        'Identifier / MH No': `Reg: ${dailyRegs.length} | Ren: ${dailyRens.length} | Clm: ${dailyClms.length}`,
        Taluka: `Reg Fee: ₹${dailyRegIncome} | Ren Fee: ₹${dailyRenIncome}`,
        Operator: `Cash: ₹${dailyCashIncome} | Online: ₹${dailyOnlineIncome}`,
        'Payment Mode': 'TOTAL DAILY INCOME',
        'Income Collected (₹)': dailyTotalIncome,
        Status: 'COMPLETED',
      });
      exportToCSV(`Daily_Work_and_Income_Report_${dateFilter}`, rows);
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
    } else if (activeReportTab === 'income') {
      const rows = filteredIncome.map((item) => ({
        'Payment ID': item.id,
        'Source Type': item.sourceType,
        'Source ID': item.sourceId,
        'Worker Name': item.workerName,
        'MH Number': item.mhNumber || 'N/A',
        'Payment Date': item.paymentDate,
        'Payment Amount (₹)': item.paymentAmount,
        'Payment Mode': item.paymentMode,
        'Operator': item.operatorName || 'N/A',
        'Taluka': item.taluka || 'N/A',
      }));
      exportToCSV(`Income_Collection_Report_${incomeDateFilter || new Date().toISOString().split('T')[0]}`, rows);
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
        <div id="daily-work-report-content" className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span>Daily Operational Work & Income Audit</span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  दैनिक कार्य व उत्पन्न
                </span>
              </h3>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Comprehensive audit of worker registrations, renewals, claims, and daily fee revenue collected on {dateFilter}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setDateFilter(new Date().toISOString().split('T')[0])}
                className="px-2.5 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
              >
                Today
              </button>

              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="py-1.5 px-3 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:outline-none focus:border-blue-600 font-medium"
              />

              <button
                type="button"
                onClick={() => printFormattedElement('daily-work-report-content', `Daily_Work_and_Income_Report_${dateFilter}`)}
                className="py-1.5 px-3 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Print Daily Report"
              >
                <Printer className="w-3.5 h-3.5 text-slate-500" />
                <span>Print</span>
              </button>
            </div>
          </div>

          {/* 4 Summary Metric Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-blue-50/50 border border-blue-100">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-blue-900">Registrations</span>
                <Users className="w-4 h-4 text-blue-600" />
              </div>
              <div className="text-2xl font-extrabold text-blue-900 font-mono mt-2">{dailyRegs.length}</div>
              <div className="text-[11px] text-blue-700/90 font-medium mt-1">
                Fee: ₹{dailyRegIncome.toLocaleString('en-IN')}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-indigo-900">Renewals</span>
                <RefreshCw className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="text-2xl font-extrabold text-indigo-900 font-mono mt-2">{dailyRens.length}</div>
              <div className="text-[11px] text-indigo-700/90 font-medium mt-1">
                Fee: ₹{dailyRenIncome.toLocaleString('en-IN')}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-amber-50/50 border border-amber-100">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-900">Claims Applied</span>
                <Award className="w-4 h-4 text-amber-600" />
              </div>
              <div className="text-2xl font-extrabold text-amber-900 font-mono mt-2">{dailyClms.length}</div>
              <div className="text-[11px] text-amber-700/90 font-medium mt-1">
                MBOCWW Benefit Claims
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-900">Daily Income (दैनिक उत्पन्न)</span>
                <IndianRupee className="w-4 h-4 text-emerald-700" />
              </div>
              <div className="text-2xl font-extrabold text-emerald-900 font-mono mt-2">
                ₹{dailyTotalIncome.toLocaleString('en-IN')}
              </div>
              <div className="text-[11px] text-emerald-700 font-semibold mt-1 flex items-center gap-1.5 flex-wrap">
                <span>Cash: ₹{dailyCashIncome.toLocaleString('en-IN')}</span>
                <span>•</span>
                <span>Online: ₹{dailyOnlineIncome.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>

          {/* Daily Income Collection Detail Banner */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-wrap items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-2">
              <Wallet className="w-4 h-4 text-emerald-600" />
              <span className="font-bold text-slate-800">Payment Breakdown for {dateFilter}:</span>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs font-medium">
              <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700">
                💵 Cash: <strong className="text-amber-800 font-mono">₹{dailyCashIncome.toLocaleString('en-IN')}</strong>
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700">
                💳 Online: <strong className="text-emerald-700 font-mono">₹{dailyOnlineIncome.toLocaleString('en-IN')}</strong>
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700">
                📋 Reg Fee: <strong className="text-blue-700 font-mono">₹{dailyRegIncome.toLocaleString('en-IN')}</strong>
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700">
                🔄 Ren Fee: <strong className="text-indigo-700 font-mono">₹{dailyRenIncome.toLocaleString('en-IN')}</strong>
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-emerald-100 border border-emerald-300 text-emerald-900 font-bold">
                💰 Total Income: <strong className="font-mono font-extrabold">₹{dailyTotalIncome.toLocaleString('en-IN')}</strong>
              </span>
            </div>
          </div>

          {/* Itemized Operations & Payment Audit Table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700 uppercase tracking-wider">
                Work Operations & Payment Records ({dailyCombinedItems.length})
              </span>
              <span className="text-slate-500 font-medium">
                Total Daily Income: <strong className="text-emerald-700 font-mono">₹{dailyTotalIncome.toLocaleString('en-IN')}</strong>
              </span>
            </div>

            <div className="border border-slate-200/90 rounded-xl overflow-hidden">
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100/90 text-slate-600 border-b border-slate-200 sticky top-0 z-10">
                      <th className="py-2.5 px-3 font-bold">#</th>
                      <th className="py-2.5 px-3 font-bold">Type</th>
                      <th className="py-2.5 px-3 font-bold">Worker Name</th>
                      <th className="py-2.5 px-3 font-bold">MH / Reg ID</th>
                      <th className="py-2.5 px-3 font-bold">Taluka</th>
                      <th className="py-2.5 px-3 font-bold">Operator</th>
                      <th className="py-2.5 px-3 font-bold">Payment Mode</th>
                      <th className="py-2.5 px-3 font-bold text-right">Income (₹)</th>
                      <th className="py-2.5 px-3 font-bold">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {dailyCombinedItems.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="py-8 text-center text-slate-400">
                          <div className="space-y-1">
                            <p className="font-semibold text-slate-600">No operational records or payments logged on {dateFilter}.</p>
                            <p className="text-[11px] text-slate-400">
                              Any registration, renewal, or claim completed on this date will appear here along with collected income.
                            </p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      dailyCombinedItems.map((item, idx) => (
                        <tr key={item.key} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-2 px-3 font-mono text-slate-400">{idx + 1}</td>
                          <td className="py-2 px-3 whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                item.type === 'Registration'
                                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                  : item.type === 'Renewal'
                                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                                  : 'bg-amber-50 text-amber-700 border border-amber-200'
                              }`}
                            >
                              {item.type}
                            </span>
                          </td>
                          <td className="py-2 px-3 font-semibold text-slate-900 whitespace-nowrap">{item.workerName}</td>
                          <td className="py-2 px-3 font-mono text-slate-600 whitespace-nowrap">{item.identifier}</td>
                          <td className="py-2 px-3 text-slate-600 whitespace-nowrap">{item.taluka}</td>
                          <td className="py-2 px-3 text-slate-600 whitespace-nowrap">{item.operatorName}</td>
                          <td className="py-2 px-3 whitespace-nowrap">
                            {item.paymentMode === 'Cash' && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                Cash
                              </span>
                            )}
                            {item.paymentMode === 'Online' && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                Online
                              </span>
                            )}
                            {item.paymentMode === 'N/A' && (
                              <span className="text-slate-400 text-[11px]">-</span>
                            )}
                          </td>
                          <td className="py-2 px-3 font-mono font-bold text-right whitespace-nowrap">
                            {item.paymentAmount > 0 ? (
                              <span className="text-emerald-700">₹{item.paymentAmount.toLocaleString('en-IN')}</span>
                            ) : (
                              <span className="text-slate-400">₹0</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-slate-600 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700">
                              {item.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {dailyCombinedItems.length > 0 && (
                    <tfoot>
                      <tr className="bg-slate-50 font-bold text-slate-800 border-t border-slate-200">
                        <td colSpan={6} className="py-2 px-3 text-right">
                          Total Operations: {dailyCombinedItems.length} | Cash: ₹{dailyCashIncome.toLocaleString('en-IN')} | Online: ₹{dailyOnlineIncome.toLocaleString('en-IN')}
                        </td>
                        <td className="py-2 px-3 text-right text-xs uppercase font-bold text-slate-600">
                          Total Daily Income:
                        </td>
                        <td className="py-2 px-3 font-mono text-emerald-800 font-extrabold text-right">
                          ₹{dailyTotalIncome.toLocaleString('en-IN')}
                        </td>
                        <td className="py-2 px-3"></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
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
        <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span>Service Fee & Revenue Collection Report</span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                  New Payments Tracked Live
                </span>
              </h3>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Tracks payments from newly created and updated Registrations and Renewals after the reset.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={fetchIncomeCollections}
                disabled={loadingIncome}
                className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Refresh income collection list"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingIncome ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>

              <button
                type="button"
                onClick={() => setShowResetConfirm(true)}
                className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Reset Income Collection payment records only"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Income Records</span>
              </button>
            </div>
          </div>

          {/* 3 Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/90">
              <div className="text-xs font-semibold text-slate-500">Registration Fee Collection</div>
              <div className="text-2xl font-extrabold text-blue-700 font-mono mt-1">
                ₹{regFeeIncome.toLocaleString('en-IN')}
              </div>
              <div className="text-[11px] text-slate-400 mt-1 font-medium">
                {filteredIncome.filter((r) => r.sourceType === 'Registration').length} Registration payment(s)
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200/90">
              <div className="text-xs font-semibold text-slate-500">Renewal Fee Collection</div>
              <div className="text-2xl font-extrabold text-blue-900 font-mono mt-1">
                ₹{renFeeIncome.toLocaleString('en-IN')}
              </div>
              <div className="text-[11px] text-slate-400 mt-1 font-medium">
                {filteredIncome.filter((r) => r.sourceType === 'Renewal').length} Renewal payment(s)
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200">
              <div className="text-xs font-bold text-emerald-800">Total Revenue</div>
              <div className="text-2xl font-extrabold text-emerald-900 font-mono mt-1">
                ₹{totalIncome.toLocaleString('en-IN')}
              </div>
              <div className="text-[11px] text-emerald-700 mt-1 font-medium flex items-center gap-2">
                <span>Cash: ₹{cashIncome.toLocaleString('en-IN')}</span>
                <span>•</span>
                <span>Online: ₹{onlineIncome.toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-50/80 rounded-xl border border-slate-200/80 text-xs">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-600">Filter Date:</span>
                <input
                  type="date"
                  value={incomeDateFilter}
                  onChange={(e) => setIncomeDateFilter(e.target.value)}
                  className="px-2.5 py-1 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                {incomeDateFilter && (
                  <button
                    type="button"
                    onClick={() => setIncomeDateFilter('')}
                    className="text-slate-400 hover:text-slate-600 underline text-[11px] cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5 ml-2">
                <span className="font-semibold text-slate-600">Mode:</span>
                {(['All', 'Cash', 'Online'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setIncomeModeFilter(mode)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      incomeModeFilter === mode
                        ? 'bg-blue-700 text-white font-semibold shadow-xs'
                        : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            <div className="text-xs text-slate-500 font-medium">
              Showing <span className="font-bold text-slate-800">{filteredIncome.length}</span> payment records
            </div>
          </div>

          {/* Income Payments Table */}
          <div className="border border-slate-200/90 rounded-xl overflow-hidden">
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/90 text-slate-600 border-b border-slate-200 sticky top-0 z-10">
                    <th className="py-2.5 px-3 font-bold">Date</th>
                    <th className="py-2.5 px-3 font-bold">Type</th>
                    <th className="py-2.5 px-3 font-bold">Worker Name</th>
                    <th className="py-2.5 px-3 font-bold">MH Number</th>
                    <th className="py-2.5 px-3 font-bold">Taluka</th>
                    <th className="py-2.5 px-3 font-bold">Payment Mode</th>
                    <th className="py-2.5 px-3 font-bold text-right">Amount (₹)</th>
                    <th className="py-2.5 px-3 font-bold">Operator</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredIncome.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        {loadingIncome ? (
                          <span>Loading income collection records...</span>
                        ) : (
                          <div className="space-y-1">
                            <p className="font-semibold text-slate-600">No income payment records found.</p>
                            <p className="text-[11px] text-slate-400">
                              Income Collection has started fresh. When a new Registration or Renewal is created with a payment (Cash/Online), it will automatically appear here.
                            </p>
                          </div>
                        )}
                      </td>
                    </tr>
                  ) : (
                    filteredIncome.map((rec) => (
                      <tr key={rec.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2 px-3 font-mono text-slate-600 whitespace-nowrap">{rec.paymentDate || '-'}</td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              rec.sourceType === 'Registration'
                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                            }`}
                          >
                            {rec.sourceType}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-semibold text-slate-900 whitespace-nowrap">{rec.workerName}</td>
                        <td className="py-2 px-3 font-mono text-slate-600 whitespace-nowrap">{rec.mhNumber || '-'}</td>
                        <td className="py-2 px-3 text-slate-600 whitespace-nowrap">{rec.taluka || '-'}</td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              rec.paymentMode === 'Online'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                            }`}
                          >
                            {rec.paymentMode}
                          </span>
                        </td>
                        <td className="py-2 px-3 font-mono font-bold text-slate-900 text-right whitespace-nowrap">
                          ₹{Number(rec.paymentAmount).toLocaleString('en-IN')}
                        </td>
                        <td className="py-2 px-3 text-slate-600 whitespace-nowrap">{rec.operatorName || '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Reset Confirmation Modal */}
          {showResetConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
              <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-rose-50 text-rose-600 rounded-xl">
                    <RotateCcw className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-slate-900">Reset Income Collection Only?</h4>
                    <p className="text-xs text-slate-500 mt-0.5">This operation resets payment tracking records only.</p>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
                  <p className="font-bold">⚠️ Safe Reset Guarantee:</p>
                  <p>• Only Income Collection payment entries will be cleared.</p>
                  <p>• Registrations, Renewals, Claims, Users, and Sub-Agents will <strong>NOT</strong> be deleted or altered.</p>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowResetConfirm(false)}
                    disabled={resetting}
                    className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleResetIncomeCollection}
                    disabled={resetting}
                    className="px-4 py-2 text-xs font-bold rounded-xl bg-rose-600 text-white hover:bg-rose-700 shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {resetting ? 'Resetting...' : 'Confirm Reset'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
