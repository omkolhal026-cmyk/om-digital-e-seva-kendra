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
  CalendarDays,
  CheckCircle2,
  XCircle,
  Plus,
  Trash2,
  Edit2,
  Clock,
  Shield,
  Coffee,
  HeartHandshake,
  Sparkles,
  Lock,
  Unlock,
  Eye,
  FileDown,
  Search,
  AlertCircle,
  Receipt,
} from 'lucide-react';
import {
  WorkerRegistration,
  WorkerRenewal,
  WorkerClaim,
  User,
  IncomeCollectionRecord,
  StaffAttendanceRecord,
  StaffSalaryRecord,
  AttendanceStatus,
} from '../types';
import { exportToCSV, printFormattedElement } from '../utils/exportUtils';

interface ReportsModuleProps {
  registrations: WorkerRegistration[];
  renewals: WorkerRenewal[];
  claims: WorkerClaim[];
  users: User[];
  currentUser?: User | null;
}

export const ReportsModule: React.FC<ReportsModuleProps> = ({
  registrations,
  renewals,
  claims,
  users,
  currentUser,
}) => {
  const [activeReportTab, setActiveReportTab] = useState<
    'daily' | 'monthly' | 'operator' | 'taluka' | 'scheme' | 'income' | 'staff-attendance' | 'staff-salaries'
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
      const headers: Record<string, string> = {};
      if (currentUser) {
        headers['x-user-id'] = currentUser.id;
        headers['x-user-role'] = currentUser.role;
      }
      const res = await fetch('/api/income-collections', { headers });
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

  // Staff Attendance State
  const [staffAttendanceList, setStaffAttendanceList] = useState<StaffAttendanceRecord[]>([]);
  const [loadingAttendance, setLoadingAttendance] = useState(false);
  const [attendanceDateFilter, setAttendanceDateFilter] = useState(new Date().toISOString().split('T')[0]);
  const [attendanceUserFilter, setAttendanceUserFilter] = useState('all');
  const [showMarkAttendanceModal, setShowMarkAttendanceModal] = useState(false);
  const [editingAttendanceId, setEditingAttendanceId] = useState<string | null>(null);
  const [attendanceFormData, setAttendanceFormData] = useState({
    userId: '',
    username: '',
    date: new Date().toISOString().split('T')[0],
    status: 'Present' as AttendanceStatus,
    inTime: '09:30',
    outTime: '18:30',
    notes: '',
  });

  // Staff Salary State
  const [staffSalariesList, setStaffSalariesList] = useState<StaffSalaryRecord[]>([]);
  const [loadingSalaries, setLoadingSalaries] = useState(false);
  const [salaryMonthFilter, setSalaryMonthFilter] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [salaryUserFilter, setSalaryUserFilter] = useState('all');
  const [salaryStatusFilter, setSalaryStatusFilter] = useState('all');
  const [salarySearchQuery, setSalarySearchQuery] = useState('');
  const [generatingPayroll, setGeneratingPayroll] = useState(false);
  const [finalizingPayroll, setFinalizingPayroll] = useState(false);
  const [showFinalizeConfirmModal, setShowFinalizeConfirmModal] = useState(false);

  // Breakdown Modal State
  const [showBreakdownModal, setShowBreakdownModal] = useState(false);
  const [selectedSalaryRecord, setSelectedSalaryRecord] = useState<StaffSalaryRecord | null>(null);
  const [selectedRecordPayments, setSelectedRecordPayments] = useState<any[]>([]);
  const [selectedRecordLogs, setSelectedRecordLogs] = useState<any[]>([]);
  const [loadingRecordDetails, setLoadingRecordDetails] = useState(false);

  // Payment Recording State
  const [showRecordPaymentModal, setShowRecordPaymentModal] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  const [paymentFormData, setPaymentFormData] = useState({
    salaryId: '',
    userId: '',
    username: '',
    monthYear: '',
    amount: 0,
    paymentDate: new Date().toISOString().split('T')[0],
    paymentMode: 'Bank Transfer' as 'Bank Transfer' | 'Cash' | 'Online' | 'Cheque',
    referenceNo: '',
    notes: '',
  });

  // Salary Adjustment State
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
  const [savingAdjustment, setSavingAdjustment] = useState(false);
  const [adjustmentFormData, setAdjustmentFormData] = useState({
    salaryId: '',
    username: '',
    adjustmentAmount: 0,
    reason: '',
  });

  const [showSalaryModal, setShowSalaryModal] = useState(false);
  const [editingSalaryId, setEditingSalaryId] = useState<string | null>(null);
  const [salaryFormData, setSalaryFormData] = useState({
    userId: '',
    username: '',
    monthYear: new Date().toISOString().slice(0, 7),
    monthlySalary: 15000,
    deductions: 0,
    paidAmount: 15000,
    remainingBalance: 0,
    paymentStatus: 'Paid' as 'Paid' | 'Partial' | 'Pending',
    paymentDate: new Date().toISOString().split('T')[0],
    paymentMode: 'Cash',
    notes: '',
  });

  const getAuthHeaders = (): Record<string, string> => {
    const token = localStorage.getItem('om_eseva_token') || sessionStorage.getItem('om_eseva_token') || '';
    const headers: Record<string, string> = {
      'x-user-id': currentUser?.id || '',
      'x-user-role': currentUser?.role || 'admin',
      'x-user-username': currentUser?.username || 'Admin',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  };

  const fetchStaffAttendance = async () => {
    setLoadingAttendance(true);
    try {
      const headers = getAuthHeaders();
      let url = '/api/staff-attendance?';
      if (attendanceUserFilter !== 'all') {
        url += `userId=${attendanceUserFilter}&`;
      }
      if (attendanceDateFilter) {
        url += `startDate=${attendanceDateFilter}&endDate=${attendanceDateFilter}&`;
      }
      const res = await fetch(url, { headers });
      if (res.ok) {
        const data = await res.json();
        setStaffAttendanceList(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to fetch attendance:', err);
    } finally {
      setLoadingAttendance(false);
    }
  };

  const fetchStaffSalaries = async () => {
    setLoadingSalaries(true);
    try {
      const headers = getAuthHeaders();
      let url = `/api/staff-salaries?monthYear=${salaryMonthFilter}`;
      if (salaryUserFilter !== 'all') {
        url += `&userId=${salaryUserFilter}`;
      }
      const res = await fetch(url, { headers });
      if (res.ok) {
        const data = await res.json();
        setStaffSalariesList(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to fetch staff salaries:', err);
    } finally {
      setLoadingSalaries(false);
    }
  };

  useEffect(() => {
    if (activeReportTab === 'staff-attendance') {
      fetchStaffAttendance();
    } else if (activeReportTab === 'staff-salaries') {
      fetchStaffSalaries();
    }
  }, [activeReportTab, attendanceDateFilter, attendanceUserFilter, salaryMonthFilter, salaryUserFilter]);

  const handleSaveAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const targetUser = users.find((u) => u.id === attendanceFormData.userId);
      const username = targetUser ? targetUser.name || targetUser.username : attendanceFormData.username;
      const headers = {
        ...getAuthHeaders(),
        'Content-Type': 'application/json',
      };
      const res = await fetch('/api/staff-attendance', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          id: editingAttendanceId || undefined,
          userId: attendanceFormData.userId,
          username,
          date: attendanceFormData.date,
          status: attendanceFormData.status,
          inTime: attendanceFormData.inTime,
          outTime: attendanceFormData.outTime,
          notes: attendanceFormData.notes,
        }),
      });
      if (res.ok) {
        setShowMarkAttendanceModal(false);
        setEditingAttendanceId(null);
        fetchStaffAttendance();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Failed to save attendance');
      }
    } catch (err: any) {
      alert(err?.message || 'Error connecting to server');
    }
  };

  const handleDeleteAttendance = async (id: string) => {
    if (!window.confirm('ही उपस्थिती नोंद हटवायची आहे का? (Delete this attendance record?)')) return;
    try {
      const headers = getAuthHeaders();
      const res = await fetch(`/api/staff-attendance/${id}`, {
        method: 'DELETE',
        headers,
      });
      if (res.ok) {
        fetchStaffAttendance();
      }
    } catch (err: any) {
      alert(err?.message || 'Failed to delete attendance record');
    }
  };

  const handleSaveSalary = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const targetUser = users.find((u) => u.id === salaryFormData.userId);
      const username = targetUser ? targetUser.name || targetUser.username : salaryFormData.username;
      const monthlySalary = Number(salaryFormData.monthlySalary) || 0;
      const deductions = Number(salaryFormData.deductions) || 0;
      const paidAmount = Number(salaryFormData.paidAmount) || 0;
      const remainingBalance = monthlySalary - deductions - paidAmount;
      const paymentStatus = remainingBalance <= 0 ? 'Paid' : paidAmount > 0 ? 'Partial' : 'Pending';

      const headers = {
        ...getAuthHeaders(),
        'Content-Type': 'application/json',
      };
      const res = await fetch('/api/staff-salaries', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          id: editingSalaryId || undefined,
          userId: salaryFormData.userId,
          username,
          monthYear: salaryFormData.monthYear,
          monthlySalary,
          deductions,
          paidAmount,
          remainingBalance,
          paymentStatus,
          paymentDate: salaryFormData.paymentDate,
          paymentMode: salaryFormData.paymentMode,
          notes: salaryFormData.notes,
        }),
      });
      if (res.ok) {
        setShowSalaryModal(false);
        setEditingSalaryId(null);
        fetchStaffSalaries();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Failed to save salary record');
      }
    } catch (err: any) {
      alert(err?.message || 'Error saving salary record');
    }
  };

  const handleDeleteSalary = async (id: string) => {
    if (!window.confirm('हे वेतन पत्रक हटवायचे आहे का? (Delete this salary record?)')) return;
    try {
      const headers = getAuthHeaders();
      const res = await fetch(`/api/staff-salaries/${id}`, {
        method: 'DELETE',
        headers,
      });
      if (res.ok) {
        fetchStaffSalaries();
      }
    } catch (err: any) {
      alert(err?.message || 'Failed to delete salary record');
    }
  };

  const handleGeneratePayroll = async () => {
    setGeneratingPayroll(true);
    try {
      const headers = {
        ...getAuthHeaders(),
        'Content-Type': 'application/json',
      };
      const res = await fetch('/api/staff-salaries/generate', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          monthYear: salaryMonthFilter,
          defaultMonthlySalary: 15000,
          perDayDeductionRate: 500,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        await fetchStaffSalaries();
        alert(`महिनाअखेर वेतन गणना यशस्वीपणे पूर्ण झाली! ${data.count || 0} कर्मचाऱ्यांचे वेतन पत्रक तयार/अद्ययावत केले.`);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to generate month-end payroll');
      }
    } catch (e: any) {
      alert(e?.message || 'Error generating payroll');
    } finally {
      setGeneratingPayroll(false);
    }
  };

  const handleFinalizePayroll = async () => {
    setFinalizingPayroll(true);
    try {
      const headers = {
        ...getAuthHeaders(),
        'Content-Type': 'application/json',
      };
      const res = await fetch('/api/staff-salaries/finalize', {
        method: 'POST',
        headers,
        body: JSON.stringify({ monthYear: salaryMonthFilter }),
      });
      if (res.ok) {
        setShowFinalizeConfirmModal(false);
        await fetchStaffSalaries();
        alert(`${salaryMonthFilter} चे सर्व वेतन पत्रक अंतिम करून लॉक करण्यात आले आहे.`);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to finalize payroll');
      }
    } catch (e: any) {
      alert(e?.message || 'Error finalizing payroll');
    } finally {
      setFinalizingPayroll(false);
    }
  };

  const handleOpenBreakdown = async (rec: StaffSalaryRecord) => {
    setSelectedSalaryRecord(rec);
    setShowBreakdownModal(true);
    setLoadingRecordDetails(true);
    try {
      const headers = getAuthHeaders();
      const [payRes, logRes] = await Promise.all([
        fetch(`/api/staff-salary-payments?salaryId=${rec.id}`, { headers }),
        fetch(`/api/staff-payroll-audit-logs?salaryId=${rec.id}`, { headers }),
      ]);
      if (payRes.ok) {
        const pData = await payRes.json();
        setSelectedRecordPayments(Array.isArray(pData) ? pData : []);
      }
      if (logRes.ok) {
        const lData = await logRes.json();
        setSelectedRecordLogs(Array.isArray(lData) ? lData : []);
      }
    } catch (e) {
      console.error('Error fetching breakdown details:', e);
    } finally {
      setLoadingRecordDetails(false);
    }
  };

  const handleOpenRecordPayment = (rec: StaffSalaryRecord) => {
    setPaymentFormData({
      salaryId: rec.id,
      userId: rec.userId,
      username: rec.username,
      monthYear: rec.monthYear,
      amount: rec.remainingBalance > 0 ? rec.remainingBalance : 0,
      paymentDate: new Date().toISOString().split('T')[0],
      paymentMode: 'Bank Transfer',
      referenceNo: '',
      notes: '',
    });
    setShowRecordPaymentModal(true);
  };

  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (paymentFormData.amount <= 0) {
      alert('कृपया वैध रक्कम टाका (Amount must be greater than 0)');
      return;
    }
    setSavingPayment(true);
    try {
      const headers = {
        ...getAuthHeaders(),
        'Content-Type': 'application/json',
      };
      const res = await fetch('/api/staff-salary-payments', {
        method: 'POST',
        headers,
        body: JSON.stringify(paymentFormData),
      });
      if (res.ok) {
        setShowRecordPaymentModal(false);
        await fetchStaffSalaries();
        alert('वेतन वितरण नोंद यशस्वीपणे सेव्ह करण्यात आली.');
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to record payment');
      }
    } catch (e: any) {
      alert(e?.message || 'Error recording payment');
    } finally {
      setSavingPayment(false);
    }
  };

  const handleDeletePayment = async (paymentId: string) => {
    if (!window.confirm('हे पेमेंट हटवायचे आहे का? (Delete this payment voucher?)')) return;
    try {
      const headers = getAuthHeaders();
      const res = await fetch(`/api/staff-salary-payments/${paymentId}`, {
        method: 'DELETE',
        headers,
      });
      if (res.ok) {
        if (selectedSalaryRecord) {
          handleOpenBreakdown(selectedSalaryRecord);
        }
        await fetchStaffSalaries();
      }
    } catch (e: any) {
      alert(e?.message || 'Failed to delete payment');
    }
  };

  const handleOpenAdjustment = (rec: StaffSalaryRecord) => {
    setAdjustmentFormData({
      salaryId: rec.id,
      username: rec.username,
      adjustmentAmount: 0,
      reason: '',
    });
    setShowAdjustmentModal(true);
  };

  const handleSubmitAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustmentFormData.reason.trim()) {
      alert('दुरुस्तीचे कारण (Reason) अनिवार्य आहे.');
      return;
    }
    setSavingAdjustment(true);
    try {
      const headers = {
        ...getAuthHeaders(),
        'Content-Type': 'application/json',
      };
      const res = await fetch('/api/staff-salaries/adjust', {
        method: 'POST',
        headers,
        body: JSON.stringify(adjustmentFormData),
      });
      if (res.ok) {
        setShowAdjustmentModal(false);
        await fetchStaffSalaries();
        alert('वेतन दुरुस्ती यशस्वीपणे जतन करण्यात आली.');
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || 'Failed to adjust salary');
      }
    } catch (e: any) {
      alert(e?.message || 'Error adjusting salary');
    } finally {
      setSavingAdjustment(false);
    }
  };

  const handleDownloadSalaryExcel = () => {
    fetch(`/api/staff-salaries/export-excel?monthYear=${salaryMonthFilter}`, {
      headers: getAuthHeaders(),
    })
      .then((res) => {
        if (!res.ok) throw new Error('Download failed');
        return res.blob();
      })
      .then((blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `OM_Digital_ESeva_Staff_Salary_${salaryMonthFilter}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
      })
      .catch((err) => {
        console.error('Excel download error:', err);
        const rows = staffSalariesList.map((item) => ({
          'कर्मचारी नाव': item.username,
          'महिना': item.monthYear,
          'मूळ वेतन (₹)': item.monthlySalary,
          'उपस्थित दिवस': item.presentDays,
          'कपात दिवस': item.deductionDays,
          'कपात रक्कम (₹)': item.absenceDeductionAmount || item.deductions,
          'अंतिम वेतन (₹)': item.finalSalary,
          'अदा वेतन (₹)': item.paidAmount,
          'शिल्लक (₹)': item.remainingBalance,
          'पेरोल स्थिती': item.payrollStatus || item.paymentStatus,
        }));
        exportToCSV(`Staff_Salary_Register_${salaryMonthFilter}`, rows);
      });
  };

  const handlePrintSalaryReport = () => {
    printFormattedElement(
      'salary-report-printable',
      `OM Digital E-Seva Kendra - Staff Salary Sheet (${salaryMonthFilter})`
    );
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
    } else if (activeReportTab === 'staff-attendance') {
      const rows = staffAttendanceList.map((item) => ({
        Date: item.date,
        'Staff Name': item.username,
        Status: item.status,
        'In Time': item.inTime || 'N/A',
        'Out Time': item.outTime || 'N/A',
        Notes: item.notes || '',
        'Marked By': item.markedBy || 'Admin',
      }));
      exportToCSV(`Staff_Attendance_Report_${attendanceDateFilter || 'All'}`, rows);
    } else if (activeReportTab === 'staff-salaries') {
      const rows = staffSalariesList.map((item) => ({
        'Staff Name': item.username,
        'Month-Year': item.monthYear,
        'Monthly Salary (₹)': item.monthlySalary,
        'Deductions (₹)': item.deductions,
        'Paid Amount (₹)': item.paidAmount,
        'Remaining Balance (₹)': item.remainingBalance,
        'Payment Status': item.paymentStatus,
        'Payment Date': item.paymentDate || 'N/A',
        'Payment Mode': item.paymentMode || 'Cash',
        Notes: item.notes || '',
      }));
      exportToCSV(`Staff_Salary_Register_${salaryMonthFilter}`, rows);
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
          { id: 'staff-attendance', label: 'Staff Attendance', icon: CalendarDays },
          { id: 'staff-salaries', label: 'Salary Management', icon: Wallet },
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

      {/* Staff Attendance Management Tab */}
      {activeReportTab === 'staff-attendance' && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-blue-700" />
                <span>कर्मचारी उपस्थिती व्यवस्थापन (Staff Attendance Management)</span>
              </h3>
              <p className="text-xs text-slate-500">
                अॅडमिनद्वारे कर्मचाऱ्यांची दैनिक उपस्थिती नोंदवणे, तपासणे व अहवाल पाहणे
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div>
                <label className="text-[10px] font-semibold text-slate-500 block">तारीख (Date)</label>
                <input
                  type="date"
                  value={attendanceDateFilter}
                  onChange={(e) => setAttendanceDateFilter(e.target.value)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-blue-500 bg-slate-50"
                />
              </div>

              <div>
                <label className="text-[10px] font-semibold text-slate-500 block">कर्मचारी (Staff)</label>
                <select
                  value={attendanceUserFilter}
                  onChange={(e) => setAttendanceUserFilter(e.target.value)}
                  className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-blue-500 bg-slate-50"
                >
                  <option value="all">सर्व कर्मचारी (All Staff)</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name || u.username} ({u.role})
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-3.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={fetchStaffAttendance}
                  className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100"
                  title="Refresh"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingAttendance ? 'animate-spin' : ''}`} />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setEditingAttendanceId(null);
                    setAttendanceFormData({
                      userId: users[0]?.id || '',
                      username: users[0]?.name || users[0]?.username || '',
                      date: attendanceDateFilter || new Date().toISOString().split('T')[0],
                      status: 'Present',
                      inTime: '09:30',
                      outTime: '18:30',
                      notes: '',
                    });
                    setShowMarkAttendanceModal(true);
                  }}
                  className="px-4 py-2 rounded-xl brand-gradient text-white text-xs font-bold shadow-xs flex items-center gap-1.5 hover:opacity-95"
                >
                  <Plus className="w-4 h-4" />
                  <span>उपस्थिती नोंदवा (Mark Attendance)</span>
                </button>
              </div>
            </div>
          </div>

          {/* Quick Stats Badges */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="p-3 rounded-xl bg-white border border-slate-200/90 shadow-2xs">
              <div className="text-[10px] font-bold text-slate-500 uppercase">एकूण नोंदी (Total)</div>
              <div className="text-lg font-black text-slate-900 mt-1">{staffAttendanceList.length}</div>
            </div>
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 shadow-2xs">
              <div className="text-[10px] font-bold text-emerald-800 uppercase">उपस्थित (Present)</div>
              <div className="text-lg font-black text-emerald-700 mt-1">
                {staffAttendanceList.filter((a) => a.status === 'Present').length}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 shadow-2xs">
              <div className="text-[10px] font-bold text-rose-800 uppercase">गैरहजर (Absent)</div>
              <div className="text-lg font-black text-rose-700 mt-1">
                {staffAttendanceList.filter((a) => a.status === 'Absent').length}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 shadow-2xs">
              <div className="text-[10px] font-bold text-amber-800 uppercase">अर्धा दिवस (Half Day)</div>
              <div className="text-lg font-black text-amber-700 mt-1">
                {staffAttendanceList.filter((a) => a.status === 'Half Day').length}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-purple-50 border border-purple-200 shadow-2xs">
              <div className="text-[10px] font-bold text-purple-800 uppercase">सुट्टी व रविवार (Holiday/SUN)</div>
              <div className="text-lg font-black text-purple-700 mt-1">
                {staffAttendanceList.filter((a) => a.status === 'Office Holiday' || a.status === 'Sunday' || a.status === 'Compensatory Off').length}
              </div>
            </div>
          </div>

          {/* Attendance Records Table */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 uppercase font-bold text-[10px]">
                  <tr>
                    <th className="py-3 px-4">तारीख (Date)</th>
                    <th className="py-3 px-4">कर्मचारी नाव (Staff Name)</th>
                    <th className="py-3 px-4 text-center">स्थिती (Status)</th>
                    <th className="py-3 px-4">आगमन वेळ (In)</th>
                    <th className="py-3 px-4">निर्गमन वेळ (Out)</th>
                    <th className="py-3 px-4">नोंद / शेरा (Notes)</th>
                    <th className="py-3 px-4">नोंदकर्ता (Marked By)</th>
                    <th className="py-3 px-4 text-right">कृती (Actions)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {staffAttendanceList.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400">
                        या तारखेसाठी कोणतीही उपस्थिती नोंद आढळली नाही. (+ उपस्थिती नोंदवा वर क्लिक करून नोंद करा).
                      </td>
                    </tr>
                  ) : (
                    staffAttendanceList.map((rec) => (
                      <tr key={rec.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 px-4 font-mono font-semibold text-slate-900">{rec.date}</td>
                        <td className="py-2.5 px-4 font-bold text-slate-800">{rec.username}</td>
                        <td className="py-2.5 px-4 text-center">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                              rec.status === 'Present'
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                : rec.status === 'Absent'
                                ? 'bg-rose-100 text-rose-800 border-rose-300'
                                : rec.status === 'Half Day'
                                ? 'bg-amber-100 text-amber-800 border-amber-300'
                                : rec.status === 'Paid Leave'
                                ? 'bg-indigo-100 text-indigo-800 border-indigo-300'
                                : rec.status === 'Office Holiday'
                                ? 'bg-purple-100 text-purple-800 border-purple-300'
                                : 'bg-slate-100 text-slate-700 border-slate-300'
                            }`}
                          >
                            {rec.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 font-mono text-slate-600">{rec.inTime || '-'}</td>
                        <td className="py-2.5 px-4 font-mono text-slate-600">{rec.outTime || '-'}</td>
                        <td className="py-2.5 px-4 text-slate-600 truncate max-w-[200px]">{rec.notes || '-'}</td>
                        <td className="py-2.5 px-4 text-slate-500 text-[11px]">{rec.markedBy || 'Admin'}</td>
                        <td className="py-2.5 px-4 text-right space-x-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingAttendanceId(rec.id);
                              setAttendanceFormData({
                                userId: rec.userId,
                                username: rec.username,
                                date: rec.date,
                                status: rec.status,
                                inTime: rec.inTime || '09:30',
                                outTime: rec.outTime || '18:30',
                                notes: rec.notes || '',
                              });
                              setShowMarkAttendanceModal(true);
                            }}
                            className="p-1 text-blue-600 hover:text-blue-800"
                            title="Edit"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteAttendance(rec.id)}
                            className="p-1 text-rose-600 hover:text-rose-800"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mark / Edit Attendance Modal */}
          {showMarkAttendanceModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
              <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h4 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-blue-600" />
                    <span>{editingAttendanceId ? 'उपस्थिती बदला (Edit Attendance)' : 'उपस्थिती नोंदवा (Mark Attendance)'}</span>
                  </h4>
                  <button
                    onClick={() => setShowMarkAttendanceModal(false)}
                    className="p-1 text-slate-400 hover:text-slate-600"
                  >
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleSaveAttendance} className="space-y-3">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">कर्मचारी निवडा (Staff Member) *</label>
                    <select
                      required
                      value={attendanceFormData.userId}
                      onChange={(e) => {
                        const sel = users.find((u) => u.id === e.target.value);
                        setAttendanceFormData({
                          ...attendanceFormData,
                          userId: e.target.value,
                          username: sel ? sel.name || sel.username : '',
                        });
                      }}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                      <option value="">-- कर्मचारी निवडा --</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name || u.username} ({u.role})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">तारीख (Date) *</label>
                      <input
                        type="date"
                        required
                        value={attendanceFormData.date}
                        onChange={(e) => setAttendanceFormData({ ...attendanceFormData, date: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-blue-500 bg-white"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">स्थिती (Status) *</label>
                      <select
                        required
                        value={attendanceFormData.status}
                        onChange={(e) =>
                          setAttendanceFormData({ ...attendanceFormData, status: e.target.value as AttendanceStatus })
                        }
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-blue-500 bg-white"
                      >
                        <option value="Present">Present (उपस्थित)</option>
                        <option value="Absent">Absent (गैरहजर)</option>
                        <option value="Half Day">Half Day (अर्धा दिवस)</option>
                        <option value="Sunday">Sunday (रविवार सुट्टी)</option>
                        <option value="Compensatory Off">Compensatory Off (बदली सुट्टी)</option>
                        <option value="Office Holiday">Office Holiday (कार्यालयीन सुट्टी)</option>
                        {attendanceFormData.status === 'Paid Leave' && (
                          <option value="Paid Leave" disabled>
                            Paid Leave (ऐतिहासिक नोंद - Historical)
                          </option>
                        )}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">आगमन वेळ (In Time)</label>
                      <input
                        type="time"
                        value={attendanceFormData.inTime}
                        onChange={(e) => setAttendanceFormData({ ...attendanceFormData, inTime: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-blue-500 bg-white"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">निर्गमन वेळ (Out Time)</label>
                      <input
                        type="time"
                        value={attendanceFormData.outTime}
                        onChange={(e) => setAttendanceFormData({ ...attendanceFormData, outTime: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-blue-500 bg-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">शेरा / टीप (Notes)</label>
                    <input
                      type="text"
                      placeholder="उदा. वेळेवर उपस्थित / विशेष कामगिरी"
                      value={attendanceFormData.notes}
                      onChange={(e) => setAttendanceFormData({ ...attendanceFormData, notes: e.target.value })}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setShowMarkAttendanceModal(false)}
                      className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 hover:bg-slate-100"
                    >
                      रद्द करा (Cancel)
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 text-xs font-bold rounded-xl brand-gradient text-white shadow-xs hover:opacity-95"
                    >
                      जतन करा (Save Attendance)
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Staff Salary Management / Month-End Salary Report Tab */}
      {activeReportTab === 'staff-salaries' && (
        <div className="space-y-4">
          {/* Top Control Bar */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-blue-100 text-blue-700">
                  <Wallet className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    महिनाअखेर वेतन गणना व अहवाल (Month-End Salary System)
                  </h3>
                  <p className="text-xs text-slate-500">
                    निश्चित ३०-दिवसीय वेतन आधार (₹१५,०००) • अनधिकृत गैरहजर कपात दर ₹५००/दिवस • रविवार व सुट्टी कपातमुक्त
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={generatingPayroll}
                onClick={handleGeneratePayroll}
                className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all disabled:opacity-50"
                title="हजेरीपटावरून स्वयंचलित महिनाअखेर वेतन गणना करा"
              >
                <Sparkles className={`w-4 h-4 ${generatingPayroll ? 'animate-spin' : ''}`} />
                <span>{generatingPayroll ? 'गणना चालू आहे...' : 'वेतन गणना करा (Auto-Calculate)'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowFinalizeConfirmModal(true)}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all"
                title="चालू महिन्याचे वेतन अंतिम व लॉक करा"
              >
                <Lock className="w-4 h-4 text-amber-400" />
                <span>वेतन लॉक करा (Finalize)</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadSalaryExcel}
                className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all"
                title="Excel (.xlsx) फॉरमॅटमध्ये संपूर्ण अहवाल डाउनलोड करा"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Excel Export</span>
              </button>

              <button
                type="button"
                onClick={handlePrintSalaryReport}
                className="px-3 py-2 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold shadow-2xs flex items-center gap-1.5 transition-all"
                title="वेतन अहवाल प्रिंट / PDF करा"
              >
                <Printer className="w-4 h-4" />
                <span>प्रिंट (Print)</span>
              </button>

              <button
                type="button"
                onClick={fetchStaffSalaries}
                className="p-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100"
                title="रीफ्रेश करा"
              >
                <RefreshCw className={`w-4 h-4 ${loadingSalaries ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-slate-500" />
              <label className="font-bold text-slate-700">महिना:</label>
              <input
                type="month"
                value={salaryMonthFilter}
                onChange={(e) => setSalaryMonthFilter(e.target.value)}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <Users className="w-4 h-4 text-slate-500" />
              <label className="font-bold text-slate-700">कर्मचारी:</label>
              <select
                value={salaryUserFilter}
                onChange={(e) => setSalaryUserFilter(e.target.value)}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="all">सर्व कर्मचारी (All)</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name || u.username} ({u.role})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <label className="font-bold text-slate-700">स्थिती:</label>
              <select
                value={salaryStatusFilter}
                onChange={(e) => setSalaryStatusFilter(e.target.value)}
                className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="all">सर्व स्थिती (All Status)</option>
                <option value="Draft">Draft (मसुदा)</option>
                <option value="Finalized">Finalized (अंतिम)</option>
                <option value="Partially Paid">Partially Paid (अंशतः अदा)</option>
                <option value="Paid">Paid (पूर्ण अदा)</option>
              </select>
            </div>

            <div className="flex-1 min-w-[180px] relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="कर्मचारी नावाने शोधा..."
                value={salarySearchQuery}
                onChange={(e) => setSalarySearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-blue-500 bg-white"
              />
            </div>
          </div>

          {/* Salary Summary Cards */}
          {(() => {
            const filteredSalaries = staffSalariesList.filter((s) => {
              if (salaryStatusFilter !== 'all') {
                const stat = s.payrollStatus || s.paymentStatus;
                if (stat !== salaryStatusFilter) return false;
              }
              if (salarySearchQuery.trim()) {
                const q = salarySearchQuery.toLowerCase();
                if (!s.username?.toLowerCase().includes(q)) return false;
              }
              return true;
            });

            const totalPayable = filteredSalaries.reduce(
              (sum, s) => sum + (Number(s.finalSalary) || Number(s.monthlySalary) - Number(s.deductions) || 0),
              0
            );
            const totalDeductions = filteredSalaries.reduce(
              (sum, s) => sum + (Number(s.absenceDeductionAmount) || Number(s.deductions) || 0),
              0
            );
            const totalPaid = filteredSalaries.reduce((sum, s) => sum + (Number(s.paidAmount) || 0), 0);
            const totalBalance = filteredSalaries.reduce((sum, s) => sum + (Number(s.remainingBalance) || 0), 0);

            return (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3.5 rounded-xl bg-white border border-slate-200/90 shadow-2xs">
                    <div className="text-[10px] font-bold text-slate-500 uppercase">एकूण देय वेतन (Payable)</div>
                    <div className="text-lg font-black text-slate-900 mt-1 flex items-center">
                      <IndianRupee className="w-4 h-4 text-slate-500" />
                      {totalPayable.toLocaleString('en-IN')}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{filteredSalaries.length} कर्मचारी नोंदी</div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 shadow-2xs">
                    <div className="text-[10px] font-bold text-rose-800 uppercase">एकूण गैरहजर कपात (Absence Ded.)</div>
                    <div className="text-lg font-black text-rose-700 mt-1 flex items-center">
                      <IndianRupee className="w-4 h-4 text-rose-500" />
                      {totalDeductions.toLocaleString('en-IN')}
                    </div>
                    <div className="text-[10px] text-rose-600 mt-0.5">दर: ₹५०० प्रति गैरहजर दिवस</div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 shadow-2xs">
                    <div className="text-[10px] font-bold text-emerald-800 uppercase">वितरित रक्कम (Disbursed)</div>
                    <div className="text-lg font-black text-emerald-700 mt-1 flex items-center">
                      <IndianRupee className="w-4 h-4 text-emerald-500" />
                      {totalPaid.toLocaleString('en-IN')}
                    </div>
                    <div className="text-[10px] text-emerald-600 mt-0.5">नोंदवलेले प्रत्यक्ष पेमेंट</div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 shadow-2xs">
                    <div className="text-[10px] font-bold text-blue-800 uppercase">शिल्लक बाकी (Balance Due)</div>
                    <div className="text-lg font-black text-blue-800 mt-1 flex items-center">
                      <IndianRupee className="w-4 h-4 text-blue-500" />
                      {totalBalance.toLocaleString('en-IN')}
                    </div>
                    <div className="text-[10px] text-blue-600 mt-0.5">देय बाकी रक्कम</div>
                  </div>
                </div>

                {/* Printable Container & Table */}
                <div id="salary-report-printable" className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
                  {/* Printable Header only visible during print */}
                  <div className="hidden print:block p-4 border-b border-slate-300">
                    <div className="text-center">
                      <h2 className="text-lg font-bold">ओम डिजिटल ई-सेवा केंद्र (OM DIGITAL E-SEVA KENDRA)</h2>
                      <p className="text-xs text-slate-600">कर्मचारी महिनाअखेर वेतन अहवाल (Staff Month-End Salary Sheet)</p>
                      <p className="text-xs font-bold text-slate-800">महिना: {salaryMonthFilter} • निश्चित ३० दिवस वेतन आधार</p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 uppercase font-bold text-[10px]">
                        <tr>
                          <th className="py-3 px-3">कर्मचारी नाव</th>
                          <th className="py-3 px-2 text-right">मूळ वेतन</th>
                          <th className="py-3 px-2 text-center">हजर दिवस</th>
                          <th className="py-3 px-2 text-center">कपात दिवस</th>
                          <th className="py-3 px-2 text-right">कपात (₹)</th>
                          <th className="py-3 px-2 text-right">दुरुस्ती / वाढ</th>
                          <th className="py-3 px-3 text-right">अंतिम देय वेतन</th>
                          <th className="py-3 px-2 text-right">वितरित रक्कम</th>
                          <th className="py-3 px-3 text-right">शिल्लक बाकी</th>
                          <th className="py-3 px-2 text-center">स्थिती</th>
                          <th className="py-3 px-3 text-right print:hidden">कृती (Actions)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredSalaries.length === 0 ? (
                          <tr>
                            <td colSpan={11} className="py-8 text-center text-slate-400">
                              {loadingSalaries
                                ? 'वेतन नोंदी लोड होत आहेत...'
                                : 'या महिन्यासाठी कोणतीही वेतन नोंद आढळली नाही. वर दिलेल्या "वेतन गणना करा (Auto-Calculate)" बटनावर क्लिक करा.'}
                            </td>
                          </tr>
                        ) : (
                          filteredSalaries.map((rec) => {
                            const finalSal = Number(rec.finalSalary) || Math.max(0, Number(rec.monthlySalary) - Number(rec.deductions));
                            const balance = Number(rec.remainingBalance) || Math.max(0, finalSal - Number(rec.paidAmount));
                            const status = rec.payrollStatus || (balance <= 0 && rec.paidAmount > 0 ? 'Paid' : rec.paidAmount > 0 ? 'Partially Paid' : 'Draft');

                            return (
                              <tr key={rec.id} className="hover:bg-slate-50/80 transition-colors">
                                <td className="py-2.5 px-3">
                                  <div className="font-bold text-slate-900">{rec.username}</div>
                                  <div className="text-[10px] text-slate-400">{rec.monthYear}</div>
                                </td>
                                <td className="py-2.5 px-2 font-mono font-bold text-slate-800 text-right">
                                  ₹{Number(rec.monthlySalary || 15000).toLocaleString('en-IN')}
                                </td>
                                <td className="py-2.5 px-2 text-center">
                                  <span className="font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded text-[11px]">
                                    {rec.presentDays ?? '—'}
                                  </span>
                                </td>
                                <td className="py-2.5 px-2 text-center">
                                  <span className={`font-bold px-1.5 py-0.5 rounded text-[11px] ${
                                    (rec.deductionDays || 0) > 0 ? 'text-rose-700 bg-rose-50' : 'text-slate-400'
                                  }`}>
                                    {rec.deductionDays ?? 0}
                                  </span>
                                </td>
                                <td className="py-2.5 px-2 font-mono text-rose-700 text-right font-semibold">
                                  ₹{Number(rec.absenceDeductionAmount || rec.deductions || 0).toLocaleString('en-IN')}
                                </td>
                                <td className="py-2.5 px-2 font-mono text-right text-[11px]">
                                  {rec.adjustmentAmount !== 0 && rec.adjustmentAmount !== undefined ? (
                                    <span className={rec.adjustmentAmount > 0 ? 'text-emerald-700 font-bold' : 'text-rose-700 font-bold'}>
                                      {rec.adjustmentAmount > 0 ? `+₹${rec.adjustmentAmount}` : `-₹${Math.abs(rec.adjustmentAmount)}`}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">—</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 font-mono font-bold text-blue-900 text-right text-sm">
                                  ₹{finalSal.toLocaleString('en-IN')}
                                </td>
                                <td className="py-2.5 px-2 font-mono font-bold text-emerald-700 text-right">
                                  ₹{Number(rec.paidAmount || 0).toLocaleString('en-IN')}
                                </td>
                                <td className="py-2.5 px-3 font-mono font-bold text-right">
                                  <span className={balance > 0 ? 'text-rose-700' : 'text-slate-500'}>
                                    ₹{balance.toLocaleString('en-IN')}
                                  </span>
                                </td>
                                <td className="py-2.5 px-2 text-center">
                                  <span
                                    className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                                      status === 'Paid'
                                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                        : status === 'Partially Paid'
                                        ? 'bg-amber-100 text-amber-800 border-amber-300'
                                        : status === 'Finalized'
                                        ? 'bg-blue-100 text-blue-800 border-blue-300'
                                        : 'bg-slate-100 text-slate-700 border-slate-300'
                                    }`}
                                  >
                                    {status}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-right space-x-1.5 whitespace-nowrap print:hidden">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenBreakdown(rec)}
                                    className="p-1.5 rounded-lg text-blue-600 hover:bg-blue-50 hover:text-blue-800 transition-colors"
                                    title="तपशीलवार ब्रेकडाउन व हजेरी स्नॅपशॉट पहा (View Breakdown)"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleOpenRecordPayment(rec)}
                                    className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 hover:text-emerald-800 transition-colors"
                                    title="वेतन वितरण नोंदवा (Record Payment)"
                                  >
                                    <Receipt className="w-4 h-4" />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleOpenAdjustment(rec)}
                                    className="p-1.5 rounded-lg text-amber-600 hover:bg-amber-50 hover:text-amber-800 transition-colors"
                                    title="अधिकृत दुरुस्ती नोंदवा (Adjust Salary)"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleDeleteSalary(rec.id)}
                                    className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 hover:text-rose-800 transition-colors"
                                    title="नोंद हटवा (Delete)"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            );
          })()}

          {/* 1. Detailed Salary Breakdown Modal */}
          {showBreakdownModal && selectedSalaryRecord && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
              <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <span className="p-2 rounded-xl bg-blue-100 text-blue-700">
                      <Eye className="w-5 h-5" />
                    </span>
                    <div>
                      <h4 className="text-base font-bold text-slate-900">
                        {selectedSalaryRecord.username} — वेतन ब्रेकडाउन व हजेरी स्नॅपशॉट
                      </h4>
                      <p className="text-xs text-slate-500">
                        महिना: {selectedSalaryRecord.monthYear} • स्थिती: <strong>{selectedSalaryRecord.payrollStatus || selectedSalaryRecord.paymentStatus}</strong>
                      </p>
                    </div>
                  </div>
                  <button onClick={() => setShowBreakdownModal(false)} className="p-1 text-slate-400 hover:text-slate-600">
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>

                {/* Fixed Formula & Rules Display */}
                <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl space-y-2 text-xs">
                  <div className="flex items-center justify-between font-bold text-blue-900">
                    <span>निश्चित ३० दिवस वेतन सूत्र (Fixed 30-Day Salary Basis):</span>
                    <span className="bg-blue-200 text-blue-900 px-2 py-0.5 rounded text-[11px]">
                      दैनिक कपात दर: ₹५००
                    </span>
                  </div>
                  <div className="font-mono text-sm font-bold text-blue-950 bg-white p-2 rounded border border-blue-100">
                    अंतिम देय = ₹१५,००० − ({selectedSalaryRecord.deductionDays ?? 0} गैरहजर × ₹५००)
                    {selectedSalaryRecord.adjustmentAmount !== 0 && selectedSalaryRecord.adjustmentAmount !== undefined
                      ? ` ${selectedSalaryRecord.adjustmentAmount > 0 ? `+ ₹${selectedSalaryRecord.adjustmentAmount}` : `− ₹${Math.abs(selectedSalaryRecord.adjustmentAmount)}`}`
                      : ''}
                    {' = '}
                    <span className="text-emerald-700 font-black">
                      ₹{Number(selectedSalaryRecord.finalSalary || 15000).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600">
                    * रविवार (Sundays), शासकीय/कार्यालयीन सुट्ट्या (Holidays) व बदली सुट्टी (Comp Off) यांवर <strong>कोणताही पगार कपात होत नाही (Paid Days)</strong>.
                  </p>
                </div>

                {/* Attendance Counts Matrix */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="text-[10px] text-slate-500 font-medium">उपस्थित दिवस (Present)</div>
                    <div className="text-base font-bold text-emerald-700 mt-0.5">{selectedSalaryRecord.presentDays ?? 0} दिवस</div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200">
                    <div className="text-[10px] text-rose-600 font-medium">कपात गैरहजर दिवस</div>
                    <div className="text-base font-bold text-rose-700 mt-0.5">{selectedSalaryRecord.deductionDays ?? 0} दिवस</div>
                    <div className="text-[9px] text-rose-500">₹{selectedSalaryRecord.absenceDeductionAmount ?? 0} कपात</div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="text-[10px] text-slate-500 font-medium">रविवार (Sundays)</div>
                    <div className="text-base font-bold text-slate-800 mt-0.5">{selectedSalaryRecord.sundayDays ?? 0} दिवस</div>
                    <div className="text-[9px] text-emerald-600">कपातमुक्त (Paid)</div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-purple-50 border border-purple-200">
                    <div className="text-[10px] text-purple-700 font-medium">सुट्ट्या व बदली सुट्टी (Holidays & Off)</div>
                    <div className="text-base font-bold text-purple-800 mt-0.5">
                      {(selectedSalaryRecord.holidayDays || 0) + (selectedSalaryRecord.paidLeaveDays || 0) + (selectedSalaryRecord.compensatoryOffDays || 0)} दिवस
                    </div>
                    <div className="text-[9px] text-emerald-600">कपातमुक्त (Paid)</div>
                  </div>
                </div>

                {/* Financial Summary */}
                <div className="grid grid-cols-3 gap-3 p-3 bg-slate-100 rounded-xl text-xs">
                  <div>
                    <div className="text-[10px] text-slate-500 font-semibold">अंतिम देय वेतन</div>
                    <div className="text-base font-black text-slate-900 mt-0.5">
                      ₹{Number(selectedSalaryRecord.finalSalary || 15000).toLocaleString('en-IN')}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] text-emerald-700 font-semibold">अदा केलेले वेतन</div>
                    <div className="text-base font-black text-emerald-700 mt-0.5">
                      ₹{Number(selectedSalaryRecord.paidAmount || 0).toLocaleString('en-IN')}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] text-blue-700 font-semibold">शिल्लक बाकी (Balance)</div>
                    <div className="text-base font-black text-blue-800 mt-0.5">
                      ₹{Number(selectedSalaryRecord.remainingBalance || 0).toLocaleString('en-IN')}
                    </div>
                  </div>
                </div>

                {/* Adjustment Notes if any */}
                {selectedSalaryRecord.adjustmentReason && (
                  <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900">
                    <strong>दुरुस्ती नोंद (Adjustment Details):</strong> {selectedSalaryRecord.adjustmentReason} (₹{selectedSalaryRecord.adjustmentAmount})
                  </div>
                )}

                {/* Payment Vouchers Table */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h5 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Receipt className="w-4 h-4 text-emerald-600" />
                      <span>प्रत्यक्ष वेतन वितरण नोंदी (Payment Vouchers)</span>
                    </h5>
                    <button
                      type="button"
                      onClick={() => handleOpenRecordPayment(selectedSalaryRecord)}
                      className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      + नवीन पेमेंट नोंदवा
                    </button>
                  </div>

                  {loadingRecordDetails ? (
                    <div className="text-center py-4 text-xs text-slate-400">माहिती लोड होत आहे...</div>
                  ) : selectedRecordPayments.length === 0 ? (
                    <div className="p-3 bg-slate-50 border border-dashed border-slate-200 rounded-lg text-center text-xs text-slate-400">
                      कोणतीही पेमेंट नोंद नाही.
                    </div>
                  ) : (
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 text-slate-600 text-[10px] uppercase font-bold border-b border-slate-200">
                          <tr>
                            <th className="py-2 px-3">तारीख</th>
                            <th className="py-2 px-3">मोड</th>
                            <th className="py-2 px-3">संदर्भ क्र.</th>
                            <th className="py-2 px-3 text-right">रक्कम</th>
                            <th className="py-2 px-3">नोंदवणारे</th>
                            <th className="py-2 px-2 text-right">कृती</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {selectedRecordPayments.map((p) => (
                            <tr key={p.id} className="hover:bg-slate-50/60">
                              <td className="py-2 px-3 text-slate-700 font-medium">{String(p.paymentDate).slice(0, 10)}</td>
                              <td className="py-2 px-3 text-slate-800">{p.paymentMode}</td>
                              <td className="py-2 px-3 font-mono text-slate-500 text-[11px]">{p.referenceNo || '—'}</td>
                              <td className="py-2 px-3 font-mono font-bold text-emerald-700 text-right">
                                ₹{Number(p.amount).toLocaleString('en-IN')}
                              </td>
                              <td className="py-2 px-3 text-slate-500 text-[10px]">{p.recordedBy}</td>
                              <td className="py-2 px-2 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleDeletePayment(p.id)}
                                  className="text-rose-600 hover:text-rose-800 p-1"
                                  title="पेमेंट हटवा"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Audit Logs Trail */}
                {selectedRecordLogs.length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-slate-100">
                    <h5 className="text-[11px] font-bold text-slate-700">ऑडिट ट्रेल (Audit Trail):</h5>
                    <div className="space-y-1 max-h-32 overflow-y-auto text-[10px] text-slate-600">
                      {selectedRecordLogs.map((log) => (
                        <div key={log.id} className="p-1.5 rounded bg-slate-50 border border-slate-100 flex items-start justify-between">
                          <div>
                            <strong>{log.action}:</strong> {log.details}
                          </div>
                          <div className="text-slate-400 shrink-0 ml-2">
                            {log.performedBy} • {String(log.createdAt).slice(0, 16)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-end pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowBreakdownModal(false)}
                    className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700"
                  >
                    बंद करा (Close)
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 2. Record Payment Modal */}
          {showRecordPaymentModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
              <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h4 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Receipt className="w-5 h-5 text-emerald-600" />
                    <span>वेतन वितरण नोंदवा (Record Payment)</span>
                  </h4>
                  <button onClick={() => setShowRecordPaymentModal(false)} className="p-1 text-slate-400 hover:text-slate-600">
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleSubmitPayment} className="space-y-3 text-xs">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">कर्मचारी:</label>
                    <div className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold text-slate-800">
                      {paymentFormData.username} ({paymentFormData.monthYear})
                    </div>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">वितरित रक्कम (Payment Amount ₹) *</label>
                    <input
                      type="number"
                      min="1"
                      required
                      value={paymentFormData.amount}
                      onChange={(e) => setPaymentFormData({ ...paymentFormData, amount: Number(e.target.value) || 0 })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono font-bold text-emerald-700 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">पेमेंट मोड *</label>
                      <select
                        value={paymentFormData.paymentMode}
                        onChange={(e) => setPaymentFormData({ ...paymentFormData, paymentMode: e.target.value as any })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 bg-white"
                      >
                        <option value="Bank Transfer">Bank Transfer (NEFT/RTGS)</option>
                        <option value="Online">Online (UPI / GPay / PhonePe)</option>
                        <option value="Cash">Cash (रोख)</option>
                        <option value="Cheque">Cheque</option>
                      </select>
                    </div>

                    <div>
                      <label className="font-bold text-slate-700 block mb-1">पेमेंट तारीख *</label>
                      <input
                        type="date"
                        required
                        value={paymentFormData.paymentDate}
                        onChange={(e) => setPaymentFormData({ ...paymentFormData, paymentDate: e.target.value })}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 bg-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">संदर्भ क्र. / UTR / Transaction No.</label>
                    <input
                      type="text"
                      placeholder="उदा. UTR12345678 / Cheque No."
                      value={paymentFormData.referenceNo}
                      onChange={(e) => setPaymentFormData({ ...paymentFormData, referenceNo: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 bg-white font-mono"
                    />
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">शेरा / टीप (Notes)</label>
                    <input
                      type="text"
                      placeholder="उदा. पूर्ण वेतन बँक खात्यात वर्ग केले"
                      value={paymentFormData.notes}
                      onChange={(e) => setPaymentFormData({ ...paymentFormData, notes: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-emerald-500 bg-white"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setShowRecordPaymentModal(false)}
                      className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 hover:bg-slate-100"
                    >
                      रद्द करा
                    </button>
                    <button
                      type="submit"
                      disabled={savingPayment}
                      className="px-5 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs disabled:opacity-50"
                    >
                      {savingPayment ? 'जतन होत आहे...' : 'पेमेंट जतन करा'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* 3. Salary Adjustment Modal */}
          {showAdjustmentModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
              <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h4 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Edit2 className="w-5 h-5 text-amber-600" />
                    <span>अधिकृत वेतन दुरुस्ती (Salary Adjustment)</span>
                  </h4>
                  <button onClick={() => setShowAdjustmentModal(false)} className="p-1 text-slate-400 hover:text-slate-600">
                    <XCircle className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleSubmitAdjustment} className="space-y-3 text-xs">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">कर्मचारी:</label>
                    <div className="px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-bold text-slate-800">
                      {adjustmentFormData.username}
                    </div>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">समायोजन रक्कम (Adjustment ₹) *</label>
                    <input
                      type="number"
                      required
                      placeholder="उदा. 500 (वाढ) किंवा -500 (कपात)"
                      value={adjustmentFormData.adjustmentAmount}
                      onChange={(e) => setAdjustmentFormData({ ...adjustmentFormData, adjustmentAmount: Number(e.target.value) || 0 })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono font-bold focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                    />
                    <p className="text-[10px] text-slate-400 mt-0.5">वेतन वाढीसाठी धन रक्कम (+) व कपातीसाठी ऋण रक्कम (-) टाका.</p>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 block mb-1">दुरुस्तीचे अनिवार्य कारण (Mandatory Reason) *</label>
                    <textarea
                      required
                      rows={3}
                      placeholder="उदा. ओव्हरटाईम भत्ता मंजूर / विशेष हजेरी मंजुरी"
                      value={adjustmentFormData.reason}
                      onChange={(e) => setAdjustmentFormData({ ...adjustmentFormData, reason: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-amber-500 bg-white"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setShowAdjustmentModal(false)}
                      className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 hover:bg-slate-100"
                    >
                      रद्द करा
                    </button>
                    <button
                      type="submit"
                      disabled={savingAdjustment}
                      className="px-5 py-2 text-xs font-bold rounded-xl bg-amber-600 hover:bg-amber-700 text-white shadow-xs disabled:opacity-50"
                    >
                      {savingAdjustment ? 'जतन होत आहे...' : 'दुरुस्ती जतन करा'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* 4. Finalize & Lock Payroll Confirmation Modal */}
          {showFinalizeConfirmModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4">
              <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-full bg-amber-100 text-amber-700 shrink-0">
                    <Lock className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-slate-900">वेतन अंतिम व लॉक करा?</h4>
                    <p className="text-xs text-slate-500">{salaryMonthFilter} महिना</p>
                  </div>
                </div>

                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
                  <p className="font-bold">महत्त्वाची सूचना:</p>
                  <p>वेतन अंतिम (Finalize) केल्यानंतर हजेरी स्नॅपशॉट लॉक होईल आणि अपघाती बदल टाळले जातील.</p>
                  <p>त्यानंतर कोणताही बदल करायचा असल्यास केवळ अधिकृत कारणासह "समायोजन (Adjustment)" करता येईल.</p>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowFinalizeConfirmModal(false)}
                    className="px-4 py-2 text-xs font-semibold rounded-xl text-slate-600 hover:bg-slate-100"
                  >
                    रद्द करा
                  </button>
                  <button
                    type="button"
                    disabled={finalizingPayroll}
                    onClick={handleFinalizePayroll}
                    className="px-5 py-2 text-xs font-bold rounded-xl bg-slate-900 hover:bg-black text-white shadow-xs disabled:opacity-50"
                  >
                    {finalizingPayroll ? 'लॉक होत आहे...' : 'होय, वेतन लॉक करा'}
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
