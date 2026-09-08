import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  FileSpreadsheet,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Download,
  IndianRupee,
  Calendar,
  CheckCircle2,
  Clock,
  AlertCircle,
  TrendingUp,
  Receipt,
  Users,
  Settings as SettingsIcon,
  Trash2,
  Edit2,
  Phone,
  MessageCircle,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  ArrowRight,
  Info,
  DollarSign,
  PieChart,
  Layers,
  Building,
  Upload,
  UserCheck,
  Check,
  X,
} from 'lucide-react';
import {
  User,
  ClaimPaymentList,
  ClaimPaymentWorker,
  ClaimCommissionCollection,
  ClaimPaymentExpense,
  ClaimOfficerCommission,
  CommissionSettings,
  ClaimPaymentsDashboardStats,
} from '../types';

interface ClaimPaymentsModuleProps {
  currentUser: User | null;
}

export const ClaimPaymentsModule: React.FC<ClaimPaymentsModuleProps> = ({ currentUser }) => {
  const isSubAgent = currentUser?.role === 'sub_agent';
  const isAdmin = currentUser?.role === 'admin';

  // Sub-tabs: 'lists' | 'workers' | 'expenses' | 'officer' | 'reports' | 'settings'
  const [activeSubTab, setActiveSubTab] = useState<'lists' | 'workers' | 'expenses' | 'officer' | 'reports' | 'settings'>('lists');

  // Loading & Error states
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Core Data
  const [stats, setStats] = useState<ClaimPaymentsDashboardStats | null>(null);
  const [lists, setLists] = useState<ClaimPaymentList[]>([]);
  const [workers, setWorkers] = useState<ClaimPaymentWorker[]>([]);
  const [expenses, setExpenses] = useState<ClaimPaymentExpense[]>([]);
  const [officerCommissions, setOfficerCommissions] = useState<ClaimOfficerCommission[]>([]);
  const [commissionSettings, setCommissionSettings] = useState<CommissionSettings>({
    directWorkerCommissionRate: 10,
    defaultOfficerCommissionRate: 10,
    subAgentRates: [],
  });
  const [subAgentUsers, setSubAgentUsers] = useState<User[]>([]);

  // Filters for Workers View
  const [selectedListFilter, setSelectedListFilter] = useState<string>('all');
  const [workerStatusFilter, setWorkerStatusFilter] = useState<string>('all');
  const [workerTalukaFilter, setWorkerTalukaFilter] = useState<string>('all');
  const [workerSourceFilter, setWorkerSourceFilter] = useState<string>('all');
  const [workerSearchQuery, setWorkerSearchQuery] = useState<string>('');

  // Filters for Expenses View
  const [expenseListFilter, setExpenseListFilter] = useState<string>('all');
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState<string>('all');

  // Filters for Officer Commission View
  const [officerListFilter, setOfficerListFilter] = useState<string>('all');
  const [officerTalukaFilter, setOfficerTalukaFilter] = useState<string>('all');

  // Modals state
  const [showImportModal, setShowImportModal] = useState<boolean>(false);
  const [showAddListModal, setShowAddListModal] = useState<boolean>(false);
  const [showAddWorkerModal, setShowAddWorkerModal] = useState<boolean>(false);
  const [showCollectModal, setShowCollectModal] = useState<boolean>(false);
  const [showAddExpenseModal, setShowAddExpenseModal] = useState<boolean>(false);
  const [showPayOfficerModal, setShowPayOfficerModal] = useState<boolean>(false);
  const [selectedWorkerForPayment, setSelectedWorkerForPayment] = useState<ClaimPaymentWorker | null>(null);
  const [selectedOfficerForPayment, setSelectedOfficerForPayment] = useState<ClaimOfficerCommission | null>(null);
  const [selectedWorkerHistory, setSelectedWorkerHistory] = useState<ClaimPaymentWorker | null>(null);

  // Forms state
  const [newListForm, setNewListForm] = useState({
    listNumber: '',
    listDate: new Date().toISOString().split('T')[0],
    description: '',
  });

  const [newWorkerForm, setNewWorkerForm] = useState({
    listNumber: '',
    workerName: '',
    mhNumber: '',
    mobileNumber: '',
    taluka: 'Haveli',
    verificationDate: '',
    scheme1: 'Financial Assistance (Claim)',
    scheme2: '',
    claimAmount: 5000,
    sourceType: 'direct' as 'direct' | 'sub_agent',
    subAgentId: '',
    commissionRate: 10,
    notes: '',
  });

  const [collectPaymentForm, setCollectPaymentForm] = useState({
    receivedAmount: 0,
    paymentDate: new Date().toISOString().split('T')[0],
    paymentMode: 'Cash' as 'Cash' | 'PhonePe/UPI' | 'Bank Transfer' | 'Other',
    receiptNumber: '',
    notes: '',
  });

  const [newExpenseForm, setNewExpenseForm] = useState({
    listNumber: '',
    expenseDate: new Date().toISOString().split('T')[0],
    category: 'Tea' as 'Tea' | 'Travel' | 'Petrol' | 'Printing' | 'Stationery' | 'Office' | 'Staff' | 'Other',
    amount: 0,
    description: '',
    paymentMode: 'Cash' as 'Cash' | 'UPI' | 'Bank Transfer' | 'Other',
    remark: '',
  });

  const [payOfficerForm, setPayOfficerForm] = useState({
    paymentStatus: 'Paid' as 'Pending' | 'Paid',
    paymentDate: new Date().toISOString().split('T')[0],
    paymentMode: 'Bank Transfer' as 'Cash' | 'UPI' | 'Bank Transfer' | 'Other',
    referenceNumber: '',
    remark: '',
    officerCommissionRate: 10,
  });

  // Excel Import File State
  const [excelImportFile, setExcelImportFile] = useState<File | null>(null);
  const [excelImportListNumber, setExcelImportListNumber] = useState<string>('');
  const [excelImportListDate, setExcelImportListDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [excelImportRows, setExcelImportRows] = useState<any[]>([]);
  const [importStats, setImportStats] = useState<{ total: number; duplicates: number; ready: number } | null>(null);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getAuthHeaders = () => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (currentUser) {
      headers['x-user-id'] = currentUser.id;
      headers['x-user-username'] = currentUser.username;
    }
    return headers;
  };

  const showNotification = (msg: string, isError = false) => {
    if (isError) {
      setError(msg);
      setTimeout(() => setError(null), 5000);
    } else {
      setSuccessMessage(msg);
      setTimeout(() => setSuccessMessage(null), 4000);
    }
  };

  // Fetch Dashboard Stats
  const fetchStats = async () => {
    try {
      const res = await fetch('/api/claim-payments/stats', { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.success && data.stats) {
        setStats(data.stats);
      }
    } catch (err) {
      console.error('Error fetching claim payment stats:', err);
    }
  };

  // Fetch Settings
  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/claim-payments/settings', { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.success && data.settings) {
        setCommissionSettings(data.settings);
      }
    } catch (err) {
      console.error('Error fetching settings:', err);
    }
  };

  // Fetch Users for Sub-Agent dropdowns
  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users', { headers: getAuthHeaders() });
      const data = await res.json();
      if (Array.isArray(data)) {
        const subs = data.filter((u: User) => u.role === 'sub_agent');
        setSubAgentUsers(subs);
      }
    } catch (err) {
      console.error('Error fetching users:', err);
    }
  };

  // Fetch Payment Lists
  const fetchLists = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/claim-payments/lists', { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.success && Array.isArray(data.lists)) {
        setLists(data.lists);
      }
    } catch (err) {
      console.error('Error fetching payment lists:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch Workers
  const fetchWorkers = async (listNum?: string) => {
    try {
      setLoading(true);
      let url = '/api/claim-payments/workers';
      const params = new URLSearchParams();
      if (listNum && listNum !== 'all') params.append('listNumber', listNum);
      else if (selectedListFilter && selectedListFilter !== 'all') params.append('listNumber', selectedListFilter);
      if (workerStatusFilter !== 'all') params.append('status', workerStatusFilter);
      if (workerTalukaFilter !== 'all') params.append('taluka', workerTalukaFilter);
      if (workerSearchQuery) params.append('search', workerSearchQuery);

      if (params.toString()) url += `?${params.toString()}`;

      const res = await fetch(url, { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.success && Array.isArray(data.workers)) {
        setWorkers(data.workers);
      }
    } catch (err) {
      console.error('Error fetching workers:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch Expenses
  const fetchExpenses = async (listNum?: string) => {
    try {
      let url = '/api/claim-payments/expenses';
      if (listNum && listNum !== 'all') url += `?listNumber=${encodeURIComponent(listNum)}`;
      else if (expenseListFilter && expenseListFilter !== 'all') url += `?listNumber=${encodeURIComponent(expenseListFilter)}`;

      const res = await fetch(url, { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.success && Array.isArray(data.expenses)) {
        setExpenses(data.expenses);
      }
    } catch (err) {
      console.error('Error fetching expenses:', err);
    }
  };

  // Fetch Officer Commissions
  const fetchOfficerCommissions = async (listNum?: string) => {
    try {
      let url = '/api/claim-payments/officer-commissions';
      if (listNum && listNum !== 'all') url += `?listNumber=${encodeURIComponent(listNum)}`;
      else if (officerListFilter && officerListFilter !== 'all') url += `?listNumber=${encodeURIComponent(officerListFilter)}`;

      const res = await fetch(url, { headers: getAuthHeaders() });
      const data = await res.json();
      if (data.success && Array.isArray(data.officerCommissions)) {
        setOfficerCommissions(data.officerCommissions);
      }
    } catch (err) {
      console.error('Error fetching officer commissions:', err);
    }
  };

  // Refresh All
  const refreshAll = () => {
    fetchStats();
    fetchLists();
    fetchWorkers();
    fetchExpenses();
    fetchOfficerCommissions();
    fetchSettings();
  };

  useEffect(() => {
    fetchStats();
    fetchSettings();
    fetchUsers();
    fetchLists();
    fetchWorkers();
    fetchExpenses();
    fetchOfficerCommissions();
  }, []);

  // When filters change in workers tab
  useEffect(() => {
    if (activeSubTab === 'workers') {
      fetchWorkers();
    }
  }, [selectedListFilter, workerStatusFilter, workerTalukaFilter, workerSearchQuery, activeSubTab]);

  // When filter changes in expenses tab
  useEffect(() => {
    if (activeSubTab === 'expenses') {
      fetchExpenses();
    }
  }, [expenseListFilter, activeSubTab]);

  // When filter changes in officer commissions tab
  useEffect(() => {
    if (activeSubTab === 'officer') {
      fetchOfficerCommissions();
    }
  }, [officerListFilter, activeSubTab]);

  // Unique Talukas for filter
  const uniqueTalukas = useMemo(() => {
    const set = new Set<string>();
    workers.forEach((w) => {
      if (w.taluka) set.add(w.taluka);
    });
    return Array.from(set).sort();
  }, [workers]);

  // Filtered workers for display
  const displayedWorkers = useMemo(() => {
    return workers.filter((w) => {
      if (workerSourceFilter === 'direct' && w.sourceType !== 'direct') return false;
      if (workerSourceFilter === 'sub_agent' && w.sourceType !== 'sub_agent') return false;
      return true;
    });
  }, [workers, workerSourceFilter]);

  // ==========================================
  // HANDLERS FOR ACTIONS
  // ==========================================

  // Create Payment List
  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListForm.listNumber.trim()) {
      showNotification('Please enter List Number', true);
      return;
    }
    try {
      setLoading(true);
      const res = await fetch('/api/claim-payments/lists', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(newListForm),
      });
      const data = await res.json();
      if (data.success) {
        showNotification(`Payment List #${newListForm.listNumber} created successfully!`);
        setShowAddListModal(false);
        setNewListForm({
          listNumber: '',
          listDate: new Date().toISOString().split('T')[0],
          description: '',
        });
        refreshAll();
      } else {
        showNotification(data.error || 'Failed to create list', true);
      }
    } catch (err: any) {
      showNotification(err?.message || 'Network error', true);
    } finally {
      setLoading(false);
    }
  };

  // Delete Payment List
  const handleDeleteList = async (listNumber: string) => {
    if (!window.confirm(`Are you sure you want to delete Claim Payment List #${listNumber} and all its workers, collections, expenses, and officer commissions? This action cannot be undone.`)) {
      return;
    }
    try {
      setLoading(true);
      const res = await fetch(`/api/claim-payments/lists/${encodeURIComponent(listNumber)}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        showNotification(`List #${listNumber} deleted successfully.`);
        refreshAll();
      } else {
        showNotification(data.error || 'Failed to delete list', true);
      }
    } catch (err: any) {
      showNotification(err?.message || 'Network error', true);
    } finally {
      setLoading(false);
    }
  };

  // Open Collect Payment Modal
  const openCollectPayment = (worker: ClaimPaymentWorker) => {
    setSelectedWorkerForPayment(worker);
    setCollectPaymentForm({
      receivedAmount: worker.pendingCommission > 0 ? worker.pendingCommission : 0,
      paymentDate: new Date().toISOString().split('T')[0],
      paymentMode: 'Cash',
      receiptNumber: `REC-${Date.now().toString().slice(-6)}`,
      notes: '',
    });
    setShowCollectModal(true);
  };

  // Submit Collect Payment
  const handleSubmitCollectPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorkerForPayment) return;

    if (collectPaymentForm.receivedAmount <= 0) {
      showNotification('Received amount must be greater than 0', true);
      return;
    }

    try {
      setLoading(true);
      const payload = {
        workerPaymentId: selectedWorkerForPayment.id,
        listNumber: selectedWorkerForPayment.listNumber,
        workerName: selectedWorkerForPayment.workerName,
        mhNumber: selectedWorkerForPayment.mhNumber,
        receivedAmount: Number(collectPaymentForm.receivedAmount),
        paymentDate: collectPaymentForm.paymentDate,
        paymentMode: collectPaymentForm.paymentMode,
        receiptNumber: collectPaymentForm.receiptNumber,
        notes: collectPaymentForm.notes,
      };

      const res = await fetch('/api/claim-payments/collections', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        showNotification(`₹${collectPaymentForm.receivedAmount} collected from ${selectedWorkerForPayment.workerName}!`);
        setShowCollectModal(false);
        refreshAll();
      } else {
        showNotification(data.error || 'Failed to record payment', true);
      }
    } catch (err: any) {
      showNotification(err?.message || 'Network error', true);
    } finally {
      setLoading(false);
    }
  };

  // Create Expense
  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newExpenseForm.amount <= 0 || !newExpenseForm.description.trim()) {
      showNotification('Please enter a valid amount and description', true);
      return;
    }
    try {
      setLoading(true);
      const res = await fetch('/api/claim-payments/expenses', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          ...newExpenseForm,
          listNumber: newExpenseForm.listNumber === 'general' ? null : newExpenseForm.listNumber || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showNotification(`Expense of ₹${newExpenseForm.amount} added!`);
        setShowAddExpenseModal(false);
        setNewExpenseForm({
          listNumber: '',
          expenseDate: new Date().toISOString().split('T')[0],
          category: 'Tea',
          amount: 0,
          description: '',
          paymentMode: 'Cash',
          remark: '',
        });
        refreshAll();
      } else {
        showNotification(data.error || 'Failed to add expense', true);
      }
    } catch (err: any) {
      showNotification(err?.message || 'Network error', true);
    } finally {
      setLoading(false);
    }
  };

  // Delete Expense
  const handleDeleteExpense = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this expense record?')) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/claim-payments/expenses/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        showNotification('Expense deleted.');
        refreshAll();
      } else {
        showNotification(data.error || 'Failed to delete expense', true);
      }
    } catch (err: any) {
      showNotification(err?.message || 'Network error', true);
    } finally {
      setLoading(false);
    }
  };

  // Submit Officer Payment
  const handleSubmitOfficerPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOfficerForPayment) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/claim-payments/officer-commissions/${selectedOfficerForPayment.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(payOfficerForm),
      });
      const data = await res.json();
      if (data.success) {
        showNotification(`Officer commission for ${selectedOfficerForPayment.taluka} marked as ${payOfficerForm.paymentStatus}!`);
        setShowPayOfficerModal(false);
        refreshAll();
      } else {
        showNotification(data.error || 'Failed to update officer commission', true);
      }
    } catch (err: any) {
      showNotification(err?.message || 'Network error', true);
    } finally {
      setLoading(false);
    }
  };

  // Update Commission Settings
  const handleSaveCommissionSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const res = await fetch('/api/claim-payments/settings', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(commissionSettings),
      });
      const data = await res.json();
      if (data.success) {
        showNotification('Commission rates saved successfully! (Will apply to new imports)');
        setCommissionSettings(data.settings);
      } else {
        showNotification(data.error || 'Failed to save settings', true);
      }
    } catch (err: any) {
      showNotification(err?.message || 'Network error', true);
    } finally {
      setLoading(false);
    }
  };

  // WhatsApp Message Sender
  const sendWhatsAppReminder = (worker: ClaimPaymentWorker) => {
    const mobile = (worker.mobileNumber || '').replace(/\D/g, '');
    if (!mobile || mobile.length < 10) {
      alert(`No valid mobile number found for ${worker.workerName}`);
      return;
    }

    const cleanMobile = mobile.length === 10 ? `91${mobile}` : mobile;
    const msg = `*नमस्कार ${worker.workerName} जी,*\n\nआपल्या *महाराष्ट्र इमारत व इतर बांधकाम कामगार कल्याणकारी मंडळ* अंतर्गत क्लेम यादी क्र. *${worker.listNumber}* चे शासकीय अनुदान (₹${worker.claimAmount}) बँकेत जमा झाले आहे.\n\n*कमिशन तपशील:*\n- एकूण कमिशन: ₹${worker.commissionAmountSnapshot}\n- जमा रक्कम: ₹${worker.totalReceived}\n- शिल्लक कमिशन: *₹${worker.pendingCommission}*\n\nकृपया आपले उर्वरित कमिशन त्वरित जमा करावे ही नम्र विनंती.\n\n_संपर्क: ओंम डिजिटल ई-सेवा केंद्र (OM DIGITAL E-SEVA KENDRA)_`;

    const url = `https://wa.me/${cleanMobile}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  const sendWhatsAppReceipt = (worker: ClaimPaymentWorker) => {
    const mobile = (worker.mobileNumber || '').replace(/\D/g, '');
    if (!mobile || mobile.length < 10) {
      alert(`No valid mobile number found for ${worker.workerName}`);
      return;
    }

    const cleanMobile = mobile.length === 10 ? `91${mobile}` : mobile;
    const msg = `*पावती / पावती संदेश - OM DIGITAL E-SEVA KENDRA*\n\n*कामगार नाव:* ${worker.workerName}\n*MH नंबर:* ${worker.mhNumber}\n*क्लेम लिस्ट क्र.:* ${worker.listNumber}\n*क्लेम रक्कम:* ₹${worker.claimAmount}\n*जमा कमिशन:* ₹${worker.totalReceived}\n*शिल्लक:* ₹${worker.pendingCommission}\n*स्थिती:* ${worker.paymentStatus}\n\nधन्यवाद!`;

    const url = `https://wa.me/${cleanMobile}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  // ==========================================
  // EXCEL IMPORT PROCESSING
  // ==========================================

  const downloadDemoExcelTemplate = () => {
    try {
      const demoData = [
        {
          NAME: 'HARIBHAU BABAN GARE',
          MHNUMBER: 'MH131090014324',
          VERIFICATIONDATE: '08-07-2026',
          TALUKA: 'JUNNAR',
          'SCHEME 1': 'E01',
          'SCHEME 2': 'E01',
          'SCHEME 1 AMOUNT': 2500,
          'SCHEME 2 AMOUNT': 2500,
          TOTAL: 5000,
          FROM: 'OFFICE',
          'LIST.NO.': '593',
        },
        {
          NAME: 'LAKSHMI VIJAY NILI',
          MHNUMBER: 'MH131090008806',
          VERIFICATIONDATE: '08-07-2026',
          TALUKA: 'JUNNAR',
          'SCHEME 1': 'E01',
          'SCHEME 2': 'E01',
          'SCHEME 1 AMOUNT': 2500,
          'SCHEME 2 AMOUNT': 2500,
          TOTAL: 5000,
          FROM: 'OFFICE',
          'LIST.NO.': '593',
        },
        {
          NAME: 'Mangal Ramesh Gondhe',
          MHNUMBER: 'MH131090014293',
          VERIFICATIONDATE: '08-07-2026',
          TALUKA: 'JUNNAR',
          'SCHEME 1': 'E01',
          'SCHEME 2': 'E01',
          'SCHEME 1 AMOUNT': 2500,
          'SCHEME 2 AMOUNT': 2500,
          TOTAL: 5000,
          FROM: 'OFFICE',
          'LIST.NO.': '593',
        },
        {
          NAME: 'MIRA KHANDU KONDE',
          MHNUMBER: 'MH131090029248',
          VERIFICATIONDATE: '08-07-2026',
          TALUKA: 'JUNNAR',
          'SCHEME 1': 'E01',
          'SCHEME 2': 'E04',
          'SCHEME 1 AMOUNT': 5000,
          'SCHEME 2 AMOUNT': 20000,
          TOTAL: 25000,
          FROM: 'OFFICE',
          'LIST.NO.': '593',
        },
        {
          NAME: 'ranjit manohar waykar',
          MHNUMBER: 'MH131090015169',
          VERIFICATIONDATE: '08-07-2026',
          TALUKA: 'JUNNAR',
          'SCHEME 1': 'E06',
          'SCHEME 2': 'E03',
          'SCHEME 1 AMOUNT': 20000,
          'SCHEME 2 AMOUNT': 10000,
          TOTAL: 30000,
          FROM: 'OFFICE',
          'LIST.NO.': '593',
        },
        {
          NAME: 'Vimal Santosh Ghogare',
          MHNUMBER: 'MH131090004693',
          VERIFICATIONDATE: '08-07-2026',
          TALUKA: 'JUNNAR',
          'SCHEME 1': 'E04',
          'SCHEME 2': '0',
          'SCHEME 1 AMOUNT': 20000,
          'SCHEME 2 AMOUNT': 0,
          TOTAL: 20000,
          FROM: 'OM',
          'LIST.NO.': 'PENDING',
        },
        {
          NAME: 'PRATIBHA SANDIP SALUNKE',
          MHNUMBER: 'MH131090018673',
          VERIFICATIONDATE: '10-07-2026',
          TALUKA: 'JUNNAR',
          'SCHEME 1': 'E06',
          'SCHEME 2': 'E06',
          'SCHEME 1 AMOUNT': 20000,
          'SCHEME 2 AMOUNT': 20000,
          TOTAL: 40000,
          FROM: 'OM',
          'LIST.NO.': '593',
        },
        {
          NAME: 'SAVITA MANGESH LOKHANDE',
          MHNUMBER: 'MH131090028180',
          VERIFICATIONDATE: '10-07-2026',
          TALUKA: 'JUNNAR',
          'SCHEME 1': 'E04',
          'SCHEME 2': '0',
          'SCHEME 1 AMOUNT': 20000,
          'SCHEME 2 AMOUNT': 0,
          TOTAL: 20000,
          FROM: 'OFFICE',
          'LIST.NO.': '593',
        },
        {
          NAME: 'Chandrakant Vinayak Kedari',
          MHNUMBER: 'MH131090011350',
          VERIFICATIONDATE: '14-07-2026',
          TALUKA: 'JUNNAR',
          'SCHEME 1': 'E06',
          'SCHEME 2': '0',
          'SCHEME 1 AMOUNT': 25000,
          'SCHEME 2 AMOUNT': 0,
          TOTAL: 25000,
          FROM: '0',
          'LIST.NO.': '594',
        },
        {
          NAME: 'Chandrakant Vinayak Kedari',
          MHNUMBER: 'MH131090011350',
          VERIFICATIONDATE: '14-07-2026',
          TALUKA: 'JUNNAR',
          'SCHEME 1': 'E06',
          'SCHEME 2': '0',
          'SCHEME 1 AMOUNT': 25000,
          'SCHEME 2 AMOUNT': 0,
          TOTAL: 25000,
          FROM: 'OFFICE',
          'LIST.NO.': 'REJECT',
        },
      ];

      const ws = XLSX.utils.json_to_sheet(demoData);
      ws['!cols'] = [
        { wch: 28 }, // NAME
        { wch: 20 }, // MHNUMBER
        { wch: 18 }, // VERIFICATIONDATE
        { wch: 14 }, // TALUKA
        { wch: 12 }, // SCHEME 1
        { wch: 12 }, // SCHEME 2
        { wch: 18 }, // SCHEME 1 AMOUNT
        { wch: 18 }, // SCHEME 2 AMOUNT
        { wch: 14 }, // TOTAL
        { wch: 14 }, // FROM
        { wch: 14 }, // LIST.NO.
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Claim_Payments_Format');
      XLSX.writeFile(wb, 'Claim_Payments_Demo_Format.xlsx');
      showNotification('Demo Excel format template downloaded successfully!');
    } catch (err: any) {
      showNotification('Failed to download demo template: ' + err.message, true);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExcelImportFile(file);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const rawJson: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

        if (!rawJson || rawJson.length === 0) {
          showNotification('Excel sheet is empty!', true);
          return;
        }

        // Try to auto-detect List Number from header/row or file name
        let detectedListNumber = '';
        const fileNameMatch = file.name.match(/list\s*([0-9A-Za-z_-]+)/i);
        if (fileNameMatch && fileNameMatch[1]) {
          detectedListNumber = fileNameMatch[1];
        }

        // Map column headers intelligently:
        // Expected: NAME | MHNUMBER | VERIFICATIONDATE | TALUKA | SCHEME 1 | SCHEME 2 | SCHEME 1 AMOUNT | SCHEME 2 AMOUNT | TOTAL | FROM | LIST.NO.
        const parsedRows = rawJson
          .map((row: any) => {
            // Find keys in case-insensitive way
            const findVal = (...keys: string[]) => {
              for (const k of Object.keys(row)) {
                const cleanKey = k.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
                for (const target of keys) {
                  const cleanTarget = target.toLowerCase().replace(/[^a-z0-9]/g, '');
                  if (cleanKey === cleanTarget || cleanKey.includes(cleanTarget)) {
                    return row[k];
                  }
                }
              }
              return '';
            };

            const workerName = String(findVal('name', 'workername', 'beneficiary', 'labourname') || '').trim();
            const mhNumber = String(
              findVal('mhnumber', 'mh_number', 'registrationno', 'regno', 'workerid', 'mh') || ''
            )
              .trim()
              .toUpperCase();
            const verificationDate = String(
              findVal('verificationdate', 'verifydate', 'vdate', 'verification_date', 'date') || ''
            ).trim();
            const taluka = String(findVal('taluka', 'tahsil', 'taluk', 'block') || 'Junnar').trim();
            const scheme1 = String(findVal('scheme1', 'scheme_1', 'schemename', 'scheme') || 'E01').trim();
            const scheme2 = String(findVal('scheme2', 'scheme_2') || '').trim();

            const scheme1AmtVal = findVal('scheme1amount', 'scheme1_amount', 'scheme_1_amount', 'scheme1amt');
            const scheme2AmtVal = findVal('scheme2amount', 'scheme2_amount', 'scheme_2_amount', 'scheme2amt');
            const totalVal = findVal('total', 'totalamount', 'total_amount', 'amount', 'claimamount', 'amt', 'sanctionamount');

            const s1Amount = parseFloat(String(scheme1AmtVal).replace(/[^0-9.]/g, '')) || 0;
            const s2Amount = parseFloat(String(scheme2AmtVal).replace(/[^0-9.]/g, '')) || 0;
            let claimAmount = parseFloat(String(totalVal).replace(/[^0-9.]/g, '')) || 0;

            if (claimAmount === 0 && (s1Amount > 0 || s2Amount > 0)) {
              claimAmount = s1Amount + s2Amount;
            } else if (claimAmount === 0) {
              claimAmount = 5000;
            }

            const fromCol = String(
              findVal('from', 'source', 'fromsource', 'subagent', 'agent', 'sub_agent') || ''
            ).trim();
            const rowList = String(findVal('listno', 'listnumber', 'list', 'list_no', 'list_number', 'batch') || '').trim();
            const mobileNumber = String(findVal('mobile', 'phone', 'mobilenumber', 'contact') || '').trim();

            if (rowList && !detectedListNumber && rowList !== 'PENDING' && rowList !== 'REJECT') {
              detectedListNumber = rowList;
            }

            return {
              workerName,
              mhNumber,
              verificationDate,
              taluka: taluka || 'Junnar',
              scheme1: scheme1 || 'E01',
              scheme2,
              scheme1Amount: s1Amount,
              scheme2Amount: s2Amount,
              claimAmount,
              fromSource: fromCol || 'OFFICE',
              listNumber: rowList,
              mobileNumber,
              subAgentCol: fromCol,
            };
          })
          .filter((r) => r.workerName || r.mhNumber);

        if (detectedListNumber && !excelImportListNumber) {
          setExcelImportListNumber(detectedListNumber);
        } else if (!excelImportListNumber && parsedRows.length > 0 && parsedRows[0].listNumber) {
          setExcelImportListNumber(parsedRows[0].listNumber);
        }

        setExcelImportRows(parsedRows);
        setImportStats({
          total: parsedRows.length,
          duplicates: 0,
          ready: parsedRows.length,
        });
      } catch (err: any) {
        showNotification('Error parsing Excel file: ' + err.message, true);
      }
    };
    reader.readAsBinaryString(file);
  };

  const executeExcelImport = async () => {
    const defaultList = excelImportListNumber.trim() || 'General';
    if (excelImportRows.length === 0) {
      showNotification('No rows parsed from file', true);
      return;
    }

    try {
      setIsImporting(true);

      const workersPayload = excelImportRows.map((row) => {
        // Check if subagent matches any user
        const fromTag = (row.fromSource || row.subAgentCol || '').trim();
        const isOfficeOrDirect = !fromTag || fromTag.toUpperCase() === 'OFFICE' || fromTag === '0' || fromTag.toLowerCase() === 'direct';

        let matchedSubAgent = !isOfficeOrDirect
          ? subAgentUsers.find(
              (u) =>
                u.username.toLowerCase() === fromTag.toLowerCase() ||
                u.name.toLowerCase().includes(fromTag.toLowerCase())
            )
          : null;

        return {
          workerName: row.workerName,
          mhNumber: row.mhNumber,
          mobileNumber: row.mobileNumber,
          taluka: row.taluka,
          verificationDate: row.verificationDate,
          scheme1: row.scheme1,
          scheme2: row.scheme2,
          scheme1Amount: row.scheme1Amount,
          scheme2Amount: row.scheme2Amount,
          fromSource: row.fromSource,
          claimAmount: row.claimAmount,
          listNumber: row.listNumber || defaultList,
          sourceType: matchedSubAgent ? 'sub_agent' : isOfficeOrDirect ? 'direct' : 'sub_agent',
          subAgentId: matchedSubAgent?.id,
          subAgentName: matchedSubAgent?.name || (!isOfficeOrDirect ? fromTag : undefined),
        };
      });

      const res = await fetch('/api/claim-payments/import', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          listNumber: defaultList,
          listDate: excelImportListDate,
          workers: workersPayload,
        }),
      });

      const data = await res.json();
      if (data.success && data.result) {
        showNotification(
          `Import Successful! ${data.result.importedCount} workers added, ${data.result.duplicateCount} duplicate workers skipped.`
        );
        setShowImportModal(false);
        setExcelImportFile(null);
        setExcelImportRows([]);
        setExcelImportListNumber('');
        refreshAll();
      } else {
        showNotification(data.error || 'Import failed', true);
      }
    } catch (err: any) {
      showNotification(err?.message || 'Network error during import', true);
    } finally {
      setIsImporting(false);
    }
  };

  // Export Table to Excel
  const exportWorkersToExcel = () => {
    try {
      const exportData = displayedWorkers.map((w, idx) => ({
        'Sr No': idx + 1,
        'List No': w.listNumber,
        'Worker Name': w.workerName,
        'MH Number': w.mhNumber,
        'Mobile': w.mobileNumber || '',
        'Taluka': w.taluka,
        'Scheme 1': w.scheme1,
        'Scheme 2': w.scheme2 || '',
        'Claim Amount (₹)': w.claimAmount,
        'Source': w.sourceType === 'sub_agent' ? `Sub-Agent: ${w.subAgentName}` : 'Direct Worker',
        'Commission Rate (%)': w.commissionRateSnapshot,
        'Expected Commission (₹)': w.commissionAmountSnapshot,
        'Received Commission (₹)': w.totalReceived,
        'Pending Commission (₹)': w.pendingCommission,
        'Status': w.paymentStatus,
        'Verification Date': w.verificationDate || '',
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Workers Commission');
      XLSX.writeFile(wb, `Claim_Payments_Workers_${new Date().toISOString().split('T')[0]}.xlsx`);
      showNotification('Excel file exported successfully!');
    } catch (err: any) {
      showNotification('Export failed: ' + err.message, true);
    }
  };

  const exportListsToExcel = () => {
    try {
      const exportData = lists.map((l, idx) => ({
        'Sr No': idx + 1,
        'List Number': l.listNumber,
        'List Date': l.listDate,
        'Total Workers': l.totalWorkers,
        'Total Claim Amount (₹)': l.totalClaimAmount,
        'Expected Commission (₹)': l.totalCommissionExpected,
        'Collected Commission (₹)': l.totalCommissionCollected,
        'Pending Commission (₹)': l.totalCommissionPending,
        'Total Expenses (₹)': l.totalExpenses,
        'Officer Commission (₹)': l.totalOfficerCommission,
        'Net Profit / Balance (₹)': l.netBalance,
        'Status': l.status,
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Claim Lists Settlement');
      XLSX.writeFile(wb, `Claim_Payment_Lists_${new Date().toISOString().split('T')[0]}.xlsx`);
      showNotification('Lists report exported successfully!');
    } catch (err: any) {
      showNotification('Export failed: ' + err.message, true);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 rounded-2xl p-6 text-white shadow-xl border border-blue-800/40 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-300 border border-blue-400/30">
                GOVERNMENT CLAIMS & COMMISSION RECOVERY
              </span>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                Live TiDB Sync
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white flex items-center gap-3">
              <Receipt className="w-8 h-8 text-blue-400" />
              Claim Payments Module (शासकीय क्लेम कमिशन)
            </h1>
            <p className="text-blue-200/80 text-sm mt-1 max-w-2xl">
              Track Government Claim Lists, recover worker commissions, manage officer allocations, track office expenses & calculate net profits accurately.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={downloadDemoExcelTemplate}
              className="px-3.5 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-sm font-medium text-slate-200 flex items-center gap-2 transition"
              title="Download Demo Excel Template"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              Demo Excel Format
            </button>

            <button
              onClick={refreshAll}
              disabled={loading}
              className="px-3.5 py-2 rounded-xl bg-blue-800/60 hover:bg-blue-700/60 border border-blue-600/40 text-sm font-medium text-blue-100 flex items-center gap-2 transition"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>

            {!isSubAgent && (
              <>
                <button
                  onClick={() => setShowImportModal(true)}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm font-semibold text-white shadow-lg shadow-emerald-900/30 flex items-center gap-2 transition hover:scale-105"
                >
                  <Upload className="w-4 h-4" />
                  Import Claim Excel
                </button>

                <button
                  onClick={() => setShowAddListModal(true)}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-sm font-semibold text-white shadow-lg shadow-blue-900/30 flex items-center gap-2 transition hover:scale-105"
                >
                  <Plus className="w-4 h-4" />
                  New List No.
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Notifications Alert */}
      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-900/40 border border-emerald-500/50 text-emerald-200 flex items-center gap-3 animate-fadeIn">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-sm font-medium">{successMessage}</span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-red-900/40 border border-red-500/50 text-red-200 flex items-center gap-3 animate-fadeIn">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}

      {/* Top 7 Metric Cards (KPIs) */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {/* Card 1: Today's Collection */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">आजची वसुली</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <IndianRupee className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-xl font-bold text-white">
            ₹{stats?.todayCommission?.toLocaleString('en-IN') || 0}
          </div>
          <span className="text-[11px] text-emerald-400 font-medium">Today's Received</span>
        </div>

        {/* Card 2: Total Expected Commission */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">अपेक्षित कमिशन</span>
            <div className="w-7 h-7 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-xl font-bold text-blue-300">
            ₹{stats?.totalCommissionExpected?.toLocaleString('en-IN') || 0}
          </div>
          <span className="text-[11px] text-blue-400/80 font-medium">Expected Target</span>
        </div>

        {/* Card 3: Total Collected Commission */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">जमा कमिशन</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-xl font-bold text-emerald-400">
            ₹{stats?.totalCommissionCollected?.toLocaleString('en-IN') || 0}
          </div>
          <span className="text-[11px] text-emerald-400/80 font-medium">Total Received</span>
        </div>

        {/* Card 4: Total Pending Commission */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">शिल्लक कमिशन</span>
            <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-xl font-bold text-amber-400">
            ₹{stats?.totalCommissionPending?.toLocaleString('en-IN') || 0}
          </div>
          <span className="text-[11px] text-amber-400/80 font-medium">Pending to Collect</span>
        </div>

        {/* Card 5: Total Expenses */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">एकूण खर्च</span>
            <div className="w-7 h-7 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-xl font-bold text-rose-300">
            ₹{stats?.totalExpenses?.toLocaleString('en-IN') || 0}
          </div>
          <span className="text-[11px] text-rose-400/80 font-medium">Office & Travel</span>
        </div>

        {/* Card 6: Officer Commission */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">अधिकारी कमिशन</span>
            <div className="w-7 h-7 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center">
              <Building className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-xl font-bold text-purple-300">
            ₹{stats?.totalOfficerCommission?.toLocaleString('en-IN') || 0}
          </div>
          <span className="text-[11px] text-purple-400/80 font-medium">Taluka Officer (10%)</span>
        </div>

        {/* Card 7: Final Net Balance */}
        <div className="bg-gradient-to-br from-indigo-950 to-slate-900 border border-indigo-500/40 rounded-xl p-4 shadow-md relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs text-indigo-300 font-bold">निव्वळ शिल्लक / Profit</span>
            <div className="w-7 h-7 rounded-lg bg-indigo-500/30 text-indigo-300 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-xl font-black text-indigo-200">
            ₹{stats?.netBalance?.toLocaleString('en-IN') || 0}
          </div>
          <span className="text-[11px] text-indigo-300/80 font-medium">Net Settlement</span>
        </div>
      </div>

      {/* Navigation Sub-Tabs Bar */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-3 gap-2">
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-900/80 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveSubTab('lists')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 ${
              activeSubTab === 'lists'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            Payment Lists ({lists.length})
          </button>

          <button
            onClick={() => setActiveSubTab('workers')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 ${
              activeSubTab === 'workers'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Users className="w-4 h-4" />
            Worker Commission ({workers.length})
          </button>

          {!isSubAgent && (
            <>
              <button
                onClick={() => setActiveSubTab('expenses')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 ${
                  activeSubTab === 'expenses'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Receipt className="w-4 h-4" />
                Expenses ({expenses.length})
              </button>

              <button
                onClick={() => setActiveSubTab('officer')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 ${
                  activeSubTab === 'officer'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Building className="w-4 h-4" />
                Officer Commission ({officerCommissions.length})
              </button>
            </>
          )}

          <button
            onClick={() => setActiveSubTab('reports')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 ${
              activeSubTab === 'reports'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <PieChart className="w-4 h-4" />
            Reports & Settlement
          </button>

          {isAdmin && (
            <button
              onClick={() => setActiveSubTab('settings')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 ${
                activeSubTab === 'settings'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800'
              }`}
            >
              <SettingsIcon className="w-4 h-4" />
              Commission Settings
            </button>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SUB-TAB 1: PAYMENT LISTS */}
      {/* ========================================================================= */}
      {activeSubTab === 'lists' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
            <div>
              <h2 className="text-lg font-bold text-white">Government Claim Lists (शासकीय याद्या)</h2>
              <p className="text-xs text-slate-400">Manage all official claim lists received from government with auto settlement.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={exportListsToExcel}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium flex items-center gap-1.5 transition"
              >
                <Download className="w-3.5 h-3.5" />
                Export Lists
              </button>
            </div>
          </div>

          {lists.length === 0 ? (
            <div className="text-center py-16 bg-slate-900/40 rounded-2xl border border-dashed border-slate-800">
              <FileSpreadsheet className="w-12 h-12 text-slate-600 mx-auto mb-3" />
              <h3 className="text-base font-semibold text-slate-300">No Claim Payment Lists Added Yet</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                Import your Excel claim list or create a new List Number to start recovering commission.
              </p>
              {!isSubAgent && (
                <div className="mt-4 flex items-center justify-center gap-3">
                  <button
                    onClick={() => setShowImportModal(true)}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow transition"
                  >
                    Import Claim Excel
                  </button>
                  <button
                    onClick={() => setShowAddListModal(true)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg shadow transition"
                  >
                    Create List No
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {lists.map((list) => {
                const collectionPercent = list.totalCommissionExpected > 0
                  ? Math.min(100, Math.round((list.totalCommissionCollected / list.totalCommissionExpected) * 100))
                  : 0;

                return (
                  <div
                    key={list.listNumber}
                    className="bg-slate-900/90 border border-slate-800 hover:border-blue-700/60 transition-all rounded-xl p-5 flex flex-col justify-between shadow-lg relative group"
                  >
                    <div>
                      {/* Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-base font-bold text-white group-hover:text-blue-400 transition">
                              List #{list.listNumber}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                                list.status === 'Collection Completed'
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : list.status === 'Collection In Progress'
                                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                              }`}
                            >
                              {list.status}
                            </span>
                          </div>
                          <span className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                            <Calendar className="w-3 h-3 text-slate-500" />
                            Date: {list.listDate || 'N/A'}
                          </span>
                        </div>

                        {!isSubAgent && (
                          <button
                            onClick={() => handleDeleteList(list.listNumber)}
                            className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-950/40 rounded-lg transition"
                            title="Delete List"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      {/* Workers & Claim Amount */}
                      <div className="grid grid-cols-2 gap-2 mt-4 bg-slate-950/60 p-3 rounded-lg border border-slate-800/80">
                        <div>
                          <span className="text-[11px] text-slate-400">Total Workers</span>
                          <div className="text-sm font-bold text-white flex items-center gap-1 mt-0.5">
                            <Users className="w-3.5 h-3.5 text-blue-400" />
                            {list.totalWorkers} कामगार
                          </div>
                        </div>
                        <div>
                          <span className="text-[11px] text-slate-400">Claim Amount</span>
                          <div className="text-sm font-bold text-emerald-400 mt-0.5">
                            ₹{list.totalClaimAmount.toLocaleString('en-IN')}
                          </div>
                        </div>
                      </div>

                      {/* Commission Progress */}
                      <div className="mt-4 space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-slate-400 font-medium">Recovery Progress</span>
                          <span className="font-bold text-emerald-400">{collectionPercent}%</span>
                        </div>
                        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-500"
                            style={{ width: `${collectionPercent}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-400 pt-0.5">
                          <span>Rec: <strong className="text-emerald-300">₹{list.totalCommissionCollected}</strong></span>
                          <span>Pend: <strong className="text-amber-300">₹{list.totalCommissionPending}</strong></span>
                        </div>
                      </div>

                      {/* Settlement Calculations */}
                      <div className="mt-3.5 pt-3 border-t border-slate-800/80 space-y-1 text-xs">
                        <div className="flex items-center justify-between text-slate-400">
                          <span>Expenses:</span>
                          <span className="text-rose-400 font-semibold">₹{list.totalExpenses}</span>
                        </div>
                        <div className="flex items-center justify-between text-slate-400">
                          <span>Officer (10%):</span>
                          <span className="text-purple-400 font-semibold">₹{list.totalOfficerCommission}</span>
                        </div>
                        <div className="flex items-center justify-between text-slate-200 font-bold pt-1 border-t border-slate-800">
                          <span>Net Balance:</span>
                          <span className="text-emerald-400 font-black text-sm">₹{list.netBalance.toLocaleString('en-IN')}</span>
                        </div>
                      </div>
                    </div>

                    {/* Action Button */}
                    <div className="mt-4 pt-3 border-t border-slate-800 flex items-center gap-2">
                      <button
                        onClick={() => {
                          setSelectedListFilter(list.listNumber);
                          setActiveSubTab('workers');
                        }}
                        className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                      >
                        View Workers & Collect
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 2: WORKER COMMISSION */}
      {/* ========================================================================= */}
      {activeSubTab === 'workers' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              {/* Search input */}
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search by Worker Name, MH Number, Mobile..."
                  value={workerSearchQuery}
                  onChange={(e) => setWorkerSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-sm text-slate-200 rounded-lg pl-9 pr-4 py-2 focus:border-blue-500 focus:outline-none"
                />
                {workerSearchQuery && (
                  <button
                    onClick={() => setWorkerSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={exportWorkersToExcel}
                  className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium flex items-center gap-1.5 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export Excel
                </button>

                {!isSubAgent && (
                  <button
                    onClick={() => setShowAddWorkerModal(true)}
                    className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Single Worker
                  </button>
                )}
              </div>
            </div>

            {/* Filter Dropdowns */}
            <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-slate-800/80 text-xs">
              <span className="text-slate-400 font-medium flex items-center gap-1">
                <Filter className="w-3 h-3" /> Filters:
              </span>

              {/* Filter: List Number */}
              <select
                value={selectedListFilter}
                onChange={(e) => setSelectedListFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-slate-300 rounded-lg px-2.5 py-1.5 focus:border-blue-500 focus:outline-none"
              >
                <option value="all">All Lists ({lists.length})</option>
                {lists.map((l) => (
                  <option key={l.listNumber} value={l.listNumber}>
                    List #{l.listNumber} ({l.totalWorkers} workers)
                  </option>
                ))}
              </select>

              {/* Filter: Status */}
              <select
                value={workerStatusFilter}
                onChange={(e) => setWorkerStatusFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-slate-300 rounded-lg px-2.5 py-1.5 focus:border-blue-500 focus:outline-none"
              >
                <option value="all">All Payment Status</option>
                <option value="Pending">Pending (अपूर्ण)</option>
                <option value="Partially Paid">Partially Paid (काही जमा)</option>
                <option value="Paid">Paid (पूर्ण जमा)</option>
              </select>

              {/* Filter: Taluka */}
              <select
                value={workerTalukaFilter}
                onChange={(e) => setWorkerTalukaFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-slate-300 rounded-lg px-2.5 py-1.5 focus:border-blue-500 focus:outline-none"
              >
                <option value="all">All Talukas</option>
                {uniqueTalukas.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>

              {/* Filter: Source */}
              <select
                value={workerSourceFilter}
                onChange={(e) => setWorkerSourceFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-slate-300 rounded-lg px-2.5 py-1.5 focus:border-blue-500 focus:outline-none"
              >
                <option value="all">All Sources (Direct & Sub-Agent)</option>
                <option value="direct">Direct Worker Only</option>
                <option value="sub_agent">Sub-Agent Only</option>
              </select>

              {(selectedListFilter !== 'all' || workerStatusFilter !== 'all' || workerTalukaFilter !== 'all' || workerSourceFilter !== 'all' || workerSearchQuery) && (
                <button
                  onClick={() => {
                    setSelectedListFilter('all');
                    setWorkerStatusFilter('all');
                    setWorkerTalukaFilter('all');
                    setWorkerSourceFilter('all');
                    setWorkerSearchQuery('');
                  }}
                  className="text-blue-400 hover:text-blue-300 underline text-xs ml-auto"
                >
                  Clear Filters
                </button>
              )}
            </div>
          </div>

          {/* Workers Table */}
          <div className="bg-slate-900/90 rounded-xl border border-slate-800 overflow-hidden shadow-md">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/80 text-slate-400 uppercase font-semibold border-b border-slate-800 text-[11px]">
                  <tr>
                    <th className="py-3 px-3">List No</th>
                    <th className="py-3 px-3">Worker Name & MH No</th>
                    <th className="py-3 px-3">Taluka & Scheme</th>
                    <th className="py-3 px-3">Claim Amt</th>
                    <th className="py-3 px-3">Source & Rate</th>
                    <th className="py-3 px-3">Expected Comm</th>
                    <th className="py-3 px-3">Received</th>
                    <th className="py-3 px-3">Pending</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3 text-center">Actions / WhatsApp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {displayedWorkers.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-12 text-center text-slate-500">
                        No worker records match the selected filters.
                      </td>
                    </tr>
                  ) : (
                    displayedWorkers.map((worker) => (
                      <tr
                        key={worker.id}
                        className="hover:bg-slate-800/50 transition-colors"
                      >
                        {/* List No */}
                        <td className="py-3 px-3 font-semibold text-blue-400 whitespace-nowrap">
                          #{worker.listNumber}
                        </td>

                        {/* Worker Name & MH */}
                        <td className="py-3 px-3">
                          <div className="font-bold text-white text-sm">
                            {worker.workerName}
                          </div>
                          <div className="text-[11px] font-mono text-slate-400">
                            {worker.mhNumber}
                          </div>
                          {worker.mobileNumber && (
                            <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                              <Phone className="w-3 h-3 text-slate-500" />
                              <a href={`tel:${worker.mobileNumber}`} className="hover:text-blue-400 hover:underline">
                                {worker.mobileNumber}
                              </a>
                            </div>
                          )}
                        </td>

                        {/* Taluka & Scheme */}
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-medium">
                            {worker.taluka}
                          </span>
                          <div className="text-[11px] text-slate-400 mt-1 max-w-[150px] truncate" title={worker.scheme1}>
                            {worker.scheme1}
                          </div>
                        </td>

                        {/* Claim Amount */}
                        <td className="py-3 px-3 font-bold text-emerald-400 whitespace-nowrap">
                          ₹{worker.claimAmount.toLocaleString('en-IN')}
                        </td>

                        {/* Source & Rate */}
                        <td className="py-3 px-3">
                          {worker.sourceType === 'sub_agent' ? (
                            <div>
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                Sub-Agent: {worker.subAgentName || 'Agent'}
                              </span>
                              <div className="text-[10px] text-slate-400 mt-0.5">
                                Rate: {worker.commissionRateSnapshot}% (Snapshot)
                              </div>
                            </div>
                          ) : (
                            <div>
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                                Direct Worker
                              </span>
                              <div className="text-[10px] text-slate-400 mt-0.5">
                                Rate: {worker.commissionRateSnapshot}% (Snapshot)
                              </div>
                            </div>
                          )}
                        </td>

                        {/* Expected Comm */}
                        <td className="py-3 px-3 font-bold text-blue-300 whitespace-nowrap">
                          ₹{worker.commissionAmountSnapshot.toLocaleString('en-IN')}
                        </td>

                        {/* Received */}
                        <td className="py-3 px-3 font-bold text-emerald-400 whitespace-nowrap">
                          ₹{worker.totalReceived.toLocaleString('en-IN')}
                        </td>

                        {/* Pending */}
                        <td className="py-3 px-3 font-bold whitespace-nowrap">
                          <span className={worker.pendingCommission > 0 ? 'text-amber-400' : 'text-slate-500'}>
                            ₹{worker.pendingCommission.toLocaleString('en-IN')}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                              worker.paymentStatus === 'Paid'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : worker.paymentStatus === 'Partially Paid'
                                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            }`}
                          >
                            {worker.paymentStatus}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-3 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* Collect Payment Button */}
                            <button
                              onClick={() => openCollectPayment(worker)}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-semibold flex items-center gap-1 transition shadow"
                              title="Record Commission Payment"
                            >
                              <IndianRupee className="w-3 h-3" />
                              जमा करा
                            </button>

                            {/* WhatsApp Button */}
                            <button
                              onClick={() => sendWhatsAppReminder(worker)}
                              className="p-1.5 bg-emerald-700/60 hover:bg-emerald-600 text-emerald-100 rounded transition"
                              title="Send WhatsApp Reminder"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                            </button>

                            {/* Receipt Share Button */}
                            {worker.totalReceived > 0 && (
                              <button
                                onClick={() => sendWhatsAppReceipt(worker)}
                                className="p-1.5 bg-blue-700/60 hover:bg-blue-600 text-blue-100 rounded transition"
                                title="Send Payment Receipt on WhatsApp"
                              >
                                <Receipt className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 3: EXPENSES */}
      {/* ========================================================================= */}
      {activeSubTab === 'expenses' && !isSubAgent && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
            <div>
              <h2 className="text-lg font-bold text-white">Expenses (खर्च नोंद)</h2>
              <p className="text-xs text-slate-400">Record all office, travel, petrol, and printing expenses linked to claim lists or general.</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowAddExpenseModal(true)}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Expense (खर्च जोडा)
              </button>
            </div>
          </div>

          {/* Expenses Table */}
          <div className="bg-slate-900/90 rounded-xl border border-slate-800 overflow-hidden shadow-md">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/80 text-slate-400 uppercase font-semibold border-b border-slate-800 text-[11px]">
                  <tr>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Linked List</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Description</th>
                    <th className="py-3 px-4">Payment Mode</th>
                    <th className="py-3 px-4">Amount</th>
                    <th className="py-3 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {expenses.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-500">
                        No expenses recorded yet.
                      </td>
                    </tr>
                  ) : (
                    expenses.map((exp) => (
                      <tr key={exp.id} className="hover:bg-slate-800/50 transition-colors">
                        <td className="py-3 px-4 whitespace-nowrap text-slate-300 font-medium">
                          {exp.expenseDate}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          {exp.listNumber ? (
                            <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-semibold border border-blue-500/30">
                              List #{exp.listNumber}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                              General Office
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                            {exp.category}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-medium text-white max-w-xs">
                          {exp.description}
                          {exp.remark && <div className="text-[10px] text-slate-400">{exp.remark}</div>}
                        </td>
                        <td className="py-3 px-4 text-slate-400">
                          {exp.paymentMode}
                        </td>
                        <td className="py-3 px-4 font-bold text-rose-400 text-sm whitespace-nowrap">
                          ₹{exp.amount.toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => handleDeleteExpense(exp.id)}
                            className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-950/40 rounded transition"
                            title="Delete Expense"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 4: OFFICER COMMISSION */}
      {/* ========================================================================= */}
      {activeSubTab === 'officer' && !isSubAgent && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
            <div>
              <h2 className="text-lg font-bold text-white">Taluka Officer Commission (तालुका अधिकारी कमिशन)</h2>
              <p className="text-xs text-slate-400">Manage 10% (or custom rate) commission allocation for Taluka officers per claim list.</p>
            </div>
          </div>

          <div className="bg-slate-900/90 rounded-xl border border-slate-800 overflow-hidden shadow-md">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/80 text-slate-400 uppercase font-semibold border-b border-slate-800 text-[11px]">
                  <tr>
                    <th className="py-3 px-4">List No</th>
                    <th className="py-3 px-4">Taluka</th>
                    <th className="py-3 px-4">Total Claim Amount</th>
                    <th className="py-3 px-4">Officer Rate (%)</th>
                    <th className="py-3 px-4">Commission Amount</th>
                    <th className="py-3 px-4">Payment Status</th>
                    <th className="py-3 px-4">Payment Details</th>
                    <th className="py-3 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {officerCommissions.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-slate-500">
                        No officer commission records created yet. (These generate automatically when workers are imported to a list).
                      </td>
                    </tr>
                  ) : (
                    officerCommissions.map((oc) => (
                      <tr key={oc.id} className="hover:bg-slate-800/50 transition-colors">
                        <td className="py-3 px-4 font-bold text-blue-400">
                          #{oc.listNumber}
                        </td>
                        <td className="py-3 px-4 font-bold text-white text-sm">
                          {oc.taluka}
                        </td>
                        <td className="py-3 px-4 font-bold text-emerald-400">
                          ₹{oc.totalClaimAmount.toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-4 font-semibold text-slate-300">
                          {oc.officerCommissionRate}%
                        </td>
                        <td className="py-3 px-4 font-bold text-purple-400 text-sm">
                          ₹{oc.officerCommissionAmount.toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                              oc.paymentStatus === 'Paid'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            }`}
                          >
                            {oc.paymentStatus}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-400 text-[11px]">
                          {oc.paymentStatus === 'Paid' ? (
                            <div>
                              <span>Date: {oc.paymentDate || 'N/A'}</span>
                              {oc.referenceNumber && <div>Ref: {oc.referenceNumber}</div>}
                            </div>
                          ) : (
                            <span className="text-slate-500">Unpaid</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => {
                              setSelectedOfficerForPayment(oc);
                              setPayOfficerForm({
                                paymentStatus: oc.paymentStatus,
                                paymentDate: oc.paymentDate || new Date().toISOString().split('T')[0],
                                paymentMode: (oc.paymentMode as any) || 'Bank Transfer',
                                referenceNumber: oc.referenceNumber || '',
                                remark: oc.remark || '',
                                officerCommissionRate: oc.officerCommissionRate,
                              });
                              setShowPayOfficerModal(true);
                            }}
                            className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded text-[11px] font-semibold transition"
                          >
                            {oc.paymentStatus === 'Paid' ? 'Edit Details' : 'Mark as Paid'}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 5: REPORTS & SETTLEMENT */}
      {/* ========================================================================= */}
      {activeSubTab === 'reports' && (
        <div className="space-y-6">
          <div className="bg-slate-900/60 p-5 rounded-xl border border-slate-800">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <PieChart className="w-5 h-5 text-blue-400" />
              Comprehensive Financial Settlement & Net Profit Summary
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Real-time audit calculation: Commission Received - (Total Expenses + Officer Commission) = Net Office Profit.
            </p>

            {/* Formula Visual Box */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mt-4 text-center font-bold">
              <div className="bg-emerald-950/60 border border-emerald-800/60 p-4 rounded-xl">
                <span className="text-xs text-emerald-400 block mb-1">कमिशन वसुली (Collected)</span>
                <span className="text-xl text-emerald-300">₹{stats?.totalCommissionCollected?.toLocaleString('en-IN') || 0}</span>
              </div>
              <div className="flex items-center justify-center text-slate-500 text-2xl font-black md:col-span-1">-</div>
              <div className="bg-rose-950/60 border border-rose-800/60 p-4 rounded-xl">
                <span className="text-xs text-rose-400 block mb-1">एकूण खर्च (Expenses)</span>
                <span className="text-xl text-rose-300">₹{stats?.totalExpenses?.toLocaleString('en-IN') || 0}</span>
              </div>
              <div className="flex items-center justify-center text-slate-500 text-2xl font-black md:col-span-1">-</div>
              <div className="bg-purple-950/60 border border-purple-800/60 p-4 rounded-xl">
                <span className="text-xs text-purple-400 block mb-1">अधिकारी कमिशन (10%)</span>
                <span className="text-xl text-purple-300">₹{stats?.totalOfficerCommission?.toLocaleString('en-IN') || 0}</span>
              </div>
            </div>

            <div className="mt-4 p-4 bg-gradient-to-r from-indigo-900/40 to-blue-900/40 border border-indigo-500/40 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-xs text-indigo-300 font-bold uppercase tracking-wider">अंतिम निव्वळ नफा / Net Office Balance</span>
                <div className="text-2xl font-black text-white mt-0.5">
                  ₹{stats?.netBalance?.toLocaleString('en-IN') || 0}
                </div>
              </div>
              <button
                onClick={exportListsToExcel}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center gap-2 shadow"
              >
                <Download className="w-4 h-4" />
                Export Full Audit Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUB-TAB 6: COMMISSION SETTINGS */}
      {/* ========================================================================= */}
      {activeSubTab === 'settings' && isAdmin && (
        <div className="max-w-2xl bg-slate-900/80 p-6 rounded-2xl border border-slate-800 space-y-6">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <SettingsIcon className="w-5 h-5 text-blue-400" />
              Commission Percentage Rules & Snapshot Configuration
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Configure default commission rates for Direct Workers, Taluka Officers, and Sub-Agents.
            </p>
          </div>

          <div className="p-3.5 bg-blue-950/40 border border-blue-800/40 rounded-xl text-xs text-blue-300 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <div>
              <strong>Snapshot Rule Enforced:</strong> Updating these percentages will apply to <em>future list imports</em>. Historical claims already saved in database remain locked with their original rate snapshot.
            </div>
          </div>

          <form onSubmit={handleSaveCommissionSettings} className="space-y-4">
            {/* Direct Worker Default Rate */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Direct Worker Default Commission Rate (%)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={commissionSettings.directWorkerCommissionRate}
                  onChange={(e) =>
                    setCommissionSettings({
                      ...commissionSettings,
                      directWorkerCommissionRate: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                  required
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold">%</span>
              </div>
            </div>

            {/* Taluka Officer Default Rate */}
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Taluka Officer Default Commission Rate (%)
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={commissionSettings.defaultOfficerCommissionRate}
                  onChange={(e) =>
                    setCommissionSettings({
                      ...commissionSettings,
                      defaultOfficerCommissionRate: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                  required
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs font-bold">%</span>
              </div>
            </div>

            {/* Sub-Agent Specific Rates */}
            {subAgentUsers.length > 0 && (
              <div className="pt-3 border-t border-slate-800 space-y-3">
                <label className="block text-xs font-bold text-slate-200">
                  Sub-Agent Specific Commission Rates (%)
                </label>
                <div className="space-y-2">
                  {subAgentUsers.map((agent) => {
                    const existingRate =
                      commissionSettings.subAgentRates.find((r) => r.subAgentId === agent.id)?.commissionRate ?? 10;

                    return (
                      <div
                        key={agent.id}
                        className="flex items-center justify-between p-2.5 bg-slate-950 rounded-lg border border-slate-800"
                      >
                        <div>
                          <div className="text-xs font-semibold text-white">{agent.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">@{agent.username}</div>
                        </div>
                        <div className="flex items-center gap-1.5 w-28">
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            max="100"
                            value={existingRate}
                            onChange={(e) => {
                              const newRate = parseFloat(e.target.value) || 0;
                              const updated = commissionSettings.subAgentRates.filter((r) => r.subAgentId !== agent.id);
                              updated.push({
                                subAgentId: agent.id,
                                username: agent.username,
                                name: agent.name,
                                commissionRate: newRate,
                              });
                              setCommissionSettings({
                                ...commissionSettings,
                                subAgentRates: updated,
                              });
                            }}
                            className="w-full bg-slate-900 border border-slate-700 text-xs text-right text-white rounded px-2 py-1"
                          />
                          <span className="text-slate-500 text-xs font-bold">%</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="pt-4 flex justify-end">
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold shadow transition"
              >
                Save Commission Settings
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: EXCEL IMPORT */}
      {/* ========================================================================= */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full p-6 space-y-5 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Upload className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Import Government Claim Excel</h3>
                  <p className="text-xs text-slate-400">Intelligent column mapping with duplicate prevention & multi-list support</p>
                </div>
              </div>
              <button
                onClick={() => setShowImportModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {/* Template download banner */}
              <div className="p-3.5 bg-gradient-to-r from-blue-950/60 to-emerald-950/60 border border-blue-500/30 rounded-xl flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <span className="font-semibold text-blue-200 block text-xs">Need standard Excel structure? (डेमो एक्सेल फॉरमॅट)</span>
                  <span className="text-[11px] text-slate-400 block">Download the pre-formatted 11-column template with sample data.</span>
                </div>
                <button
                  type="button"
                  onClick={downloadDemoExcelTemplate}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shrink-0 shadow"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download Demo Excel (.xlsx)
                </button>
              </div>

              {/* List Info inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Default Government List Number</label>
                  <input
                    type="text"
                    placeholder="e.g. 593, 594, PENDING, or auto-detected"
                    value={excelImportListNumber}
                    onChange={(e) => setExcelImportListNumber(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-500 mt-0.5 block">If your Excel sheet has a `LIST.NO.` column, row-specific list numbers will be used automatically.</span>
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">List Release Date</label>
                  <input
                    type="date"
                    value={excelImportListDate}
                    onChange={(e) => setExcelImportListDate(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Supported Columns Guide */}
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 space-y-1.5 text-slate-400">
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-slate-300 text-[11px]">Exact Excel Column Headers:</div>
                  <span className="text-[10px] text-emerald-400">11 Standard Columns</span>
                </div>
                <div className="flex flex-wrap gap-1 font-mono text-[10px]">
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-blue-300 border border-slate-700">NAME</span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-blue-300 border border-slate-700">MHNUMBER</span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-blue-300 border border-slate-700">VERIFICATIONDATE</span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-blue-300 border border-slate-700">TALUKA</span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-blue-300 border border-slate-700">SCHEME 1</span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-blue-300 border border-slate-700">SCHEME 2</span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-emerald-300 border border-slate-700">SCHEME 1 AMOUNT</span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-emerald-300 border border-slate-700">SCHEME 2 AMOUNT</span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 border border-slate-700">TOTAL</span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-purple-300 border border-slate-700">FROM</span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-yellow-300 border border-slate-700">LIST.NO.</span>
                </div>
                <div className="text-[10px] text-slate-500">
                  Case-insensitive header matching. Skips duplicate MH Numbers within the same list automatically.
                </div>
              </div>

              {/* File Drop Area */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-700 hover:border-emerald-500 rounded-xl p-5 text-center cursor-pointer bg-slate-950/60 transition group"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <FileSpreadsheet className="w-8 h-8 text-emerald-400 mx-auto mb-1.5 group-hover:scale-110 transition" />
                <span className="text-sm font-semibold text-slate-200 block">
                  {excelImportFile ? excelImportFile.name : 'Click to select Claim Excel / CSV file'}
                </span>
                <span className="text-[11px] text-slate-500 mt-0.5 block">
                  {excelImportFile ? `${(excelImportFile.size / 1024).toFixed(1)} KB` : 'Supports standard .xlsx or .xls files'}
                </span>
              </div>

              {/* Preview Rows Summary & Table */}
              {importStats && excelImportRows.length > 0 && (
                <div className="space-y-2">
                  <div className="p-2.5 bg-emerald-950/40 border border-emerald-500/40 rounded-xl text-emerald-200 flex items-center justify-between font-medium text-xs">
                    <span>Found {importStats.total} valid worker rows ready to import.</span>
                    <span className="text-[10px] bg-emerald-500/20 px-2 py-0.5 rounded text-emerald-300 font-bold">Ready</span>
                  </div>

                  <div className="max-h-44 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950">
                    <table className="w-full text-left text-[11px]">
                      <thead className="bg-slate-900 text-slate-400 border-b border-slate-800 sticky top-0">
                        <tr>
                          <th className="px-2.5 py-1.5">#</th>
                          <th className="px-2.5 py-1.5">Worker Name</th>
                          <th className="px-2.5 py-1.5">MH Number</th>
                          <th className="px-2.5 py-1.5">Taluka</th>
                          <th className="px-2.5 py-1.5">Scheme 1 / 2</th>
                          <th className="px-2.5 py-1.5 text-right">Total (₹)</th>
                          <th className="px-2.5 py-1.5">From</th>
                          <th className="px-2.5 py-1.5">List No.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60 text-slate-300">
                        {excelImportRows.slice(0, 5).map((r, idx) => (
                          <tr key={idx} className="hover:bg-slate-900/50">
                            <td className="px-2.5 py-1.5 text-slate-500">{idx + 1}</td>
                            <td className="px-2.5 py-1.5 font-medium text-white">{r.workerName}</td>
                            <td className="px-2.5 py-1.5 font-mono text-[10px] text-blue-300">{r.mhNumber}</td>
                            <td className="px-2.5 py-1.5">{r.taluka}</td>
                            <td className="px-2.5 py-1.5 text-slate-400">
                              {r.scheme1} {r.scheme2 ? `+ ${r.scheme2}` : ''}
                            </td>
                            <td className="px-2.5 py-1.5 text-right font-semibold text-emerald-400">
                              ₹{r.claimAmount?.toLocaleString('en-IN')}
                            </td>
                            <td className="px-2.5 py-1.5">
                              <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-300">
                                {r.fromSource || 'OFFICE'}
                              </span>
                            </td>
                            <td className="px-2.5 py-1.5 font-mono text-[10px] text-yellow-400">
                              {r.listNumber || excelImportListNumber || 'General'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {excelImportRows.length > 5 && (
                    <div className="text-[10px] text-slate-500 text-center">
                      Showing first 5 of {excelImportRows.length} workers...
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowImportModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeExcelImport}
                disabled={isImporting || excelImportRows.length === 0}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-2 transition shadow"
              >
                {isImporting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                {isImporting ? 'Importing Workers...' : `Import ${excelImportRows.length} Workers`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: RECORD COMMISSION PAYMENT */}
      {/* ========================================================================= */}
      {showCollectModal && selectedWorkerForPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <IndianRupee className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Record Commission Payment</h3>
                  <p className="text-xs text-slate-400">कमिशन वसुली पावती नोंद</p>
                </div>
              </div>
              <button
                onClick={() => setShowCollectModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Worker Info Card */}
            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800/80 space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Worker:</span>
                <span className="font-bold text-white text-sm">{selectedWorkerForPayment.workerName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">MH Number:</span>
                <span className="font-mono text-slate-300">{selectedWorkerForPayment.mhNumber}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">List No:</span>
                <span className="font-semibold text-blue-400">#{selectedWorkerForPayment.listNumber}</span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-slate-800">
                <span className="text-slate-400">Expected Commission:</span>
                <span className="font-bold text-blue-300">₹{selectedWorkerForPayment.commissionAmountSnapshot}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Already Received:</span>
                <span className="font-bold text-emerald-400">₹{selectedWorkerForPayment.totalReceived}</span>
              </div>
              <div className="flex items-center justify-between font-bold text-amber-400">
                <span>Remaining Pending:</span>
                <span>₹{selectedWorkerForPayment.pendingCommission}</span>
              </div>
            </div>

            <form onSubmit={handleSubmitCollectPayment} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Amount Received (₹) *</label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={collectPaymentForm.receivedAmount}
                  onChange={(e) =>
                    setCollectPaymentForm({
                      ...collectPaymentForm,
                      receivedAmount: parseFloat(e.target.value) || 0,
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-800 text-white rounded-lg px-3 py-2 text-sm font-bold text-emerald-400 focus:border-emerald-500 focus:outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Payment Date</label>
                  <input
                    type="date"
                    value={collectPaymentForm.paymentDate}
                    onChange={(e) =>
                      setCollectPaymentForm({ ...collectPaymentForm, paymentDate: e.target.value })
                    }
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-lg px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Payment Mode</label>
                  <select
                    value={collectPaymentForm.paymentMode}
                    onChange={(e) =>
                      setCollectPaymentForm({ ...collectPaymentForm, paymentMode: e.target.value as any })
                    }
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-lg px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
                  >
                    <option value="Cash">Cash (रोख)</option>
                    <option value="PhonePe/UPI">PhonePe / Google Pay / UPI</option>
                    <option value="Bank Transfer">Bank Transfer (बँक ट्रान्सफर)</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Receipt / Ref No.</label>
                <input
                  type="text"
                  placeholder="e.g. REC-10492"
                  value={collectPaymentForm.receiptNumber}
                  onChange={(e) =>
                    setCollectPaymentForm({ ...collectPaymentForm, receiptNumber: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-800 text-white rounded-lg px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Remarks / Notes</label>
                <input
                  type="text"
                  placeholder="Optional payment notes..."
                  value={collectPaymentForm.notes}
                  onChange={(e) =>
                    setCollectPaymentForm({ ...collectPaymentForm, notes: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-800 text-white rounded-lg px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCollectModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow"
                >
                  <Check className="w-3.5 h-3.5" />
                  Confirm & Save Payment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: ADD EXPENSE */}
      {/* ========================================================================= */}
      {showAddExpenseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center">
                  <Receipt className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Add Office / Travel Expense</h3>
                  <p className="text-xs text-slate-400">खर्च नोंद करा</p>
                </div>
              </div>
              <button
                onClick={() => setShowAddExpenseModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateExpense} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Expense Date</label>
                  <input
                    type="date"
                    value={newExpenseForm.expenseDate}
                    onChange={(e) => setNewExpenseForm({ ...newExpenseForm, expenseDate: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-lg px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Link to List</label>
                  <select
                    value={newExpenseForm.listNumber}
                    onChange={(e) => setNewExpenseForm({ ...newExpenseForm, listNumber: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-lg px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">General Office Expense</option>
                    {lists.map((l) => (
                      <option key={l.listNumber} value={l.listNumber}>List #{l.listNumber}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Category</label>
                  <select
                    value={newExpenseForm.category}
                    onChange={(e) => setNewExpenseForm({ ...newExpenseForm, category: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-lg px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
                  >
                    <option value="Tea">Tea / Refreshment (चहा/नाश्ता)</option>
                    <option value="Travel">Travel (प्रवास)</option>
                    <option value="Petrol">Petrol (पेट्रोल)</option>
                    <option value="Printing">Printing / Xerox (झेरॉक्स/प्रिंट)</option>
                    <option value="Stationery">Stationery (स्टेशनरी)</option>
                    <option value="Office">Office Misc (कार्यालयीन)</option>
                    <option value="Staff">Staff (कर्मचारी)</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Amount (₹) *</label>
                  <input
                    type="number"
                    step="1"
                    min="1"
                    value={newExpenseForm.amount}
                    onChange={(e) => setNewExpenseForm({ ...newExpenseForm, amount: parseFloat(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-800 text-rose-400 font-bold rounded-lg px-3 py-2 text-xs focus:border-rose-500 focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Description *</label>
                <input
                  type="text"
                  placeholder="e.g. Haveli field visit travel & tea"
                  value={newExpenseForm.description}
                  onChange={(e) => setNewExpenseForm({ ...newExpenseForm, description: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 text-white rounded-lg px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddExpenseModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition shadow"
                >
                  Save Expense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: CREATE LIST NO. */}
      {/* ========================================================================= */}
      {showAddListModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Create New Claim List</h3>
                  <p className="text-xs text-slate-400">शासकीय यादी क्रमांक नोंदवा</p>
                </div>
              </div>
              <button
                onClick={() => setShowAddListModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateList} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">List Number *</label>
                <input
                  type="text"
                  placeholder="e.g. 108"
                  value={newListForm.listNumber}
                  onChange={(e) => setNewListForm({ ...newListForm, listNumber: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 text-white rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">List Date</label>
                <input
                  type="date"
                  value={newListForm.listDate}
                  onChange={(e) => setNewListForm({ ...newListForm, listDate: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 text-white rounded-lg px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Description / Notes</label>
                <textarea
                  rows={2}
                  placeholder="Optional list description..."
                  value={newListForm.description}
                  onChange={(e) => setNewListForm({ ...newListForm, description: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 text-white rounded-lg px-3 py-2 text-xs focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddListModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition shadow"
                >
                  Create List
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: PAY OFFICER COMMISSION */}
      {/* ========================================================================= */}
      {showPayOfficerModal && selectedOfficerForPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center">
                  <Building className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Officer Commission Settlement</h3>
                  <p className="text-xs text-slate-400">
                    {selectedOfficerForPayment.taluka} (List #{selectedOfficerForPayment.listNumber})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowPayOfficerModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-purple-950/40 border border-purple-800/40 rounded-xl space-y-1 text-xs">
              <div className="flex items-center justify-between text-slate-300">
                <span>Taluka:</span>
                <span className="font-bold text-white">{selectedOfficerForPayment.taluka}</span>
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span>Total Taluka Claim Amount:</span>
                <span className="font-bold text-emerald-400">₹{selectedOfficerForPayment.totalClaimAmount}</span>
              </div>
              <div className="flex items-center justify-between font-bold text-purple-300 text-sm pt-1 border-t border-purple-800/60">
                <span>Commission Amount:</span>
                <span>₹{selectedOfficerForPayment.officerCommissionAmount}</span>
              </div>
            </div>

            <form onSubmit={handleSubmitOfficerPayment} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Payment Status</label>
                <select
                  value={payOfficerForm.paymentStatus}
                  onChange={(e) => setPayOfficerForm({ ...payOfficerForm, paymentStatus: e.target.value as any })}
                  className="w-full bg-slate-950 border border-slate-800 text-white rounded-lg px-3 py-2 text-xs focus:border-purple-500 focus:outline-none"
                >
                  <option value="Paid">Paid (अदा केले)</option>
                  <option value="Pending">Pending (प्रलंबित)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Payment Date</label>
                  <input
                    type="date"
                    value={payOfficerForm.paymentDate}
                    onChange={(e) => setPayOfficerForm({ ...payOfficerForm, paymentDate: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-lg px-3 py-2 text-xs focus:border-purple-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Payment Mode</label>
                  <select
                    value={payOfficerForm.paymentMode}
                    onChange={(e) => setPayOfficerForm({ ...payOfficerForm, paymentMode: e.target.value as any })}
                    className="w-full bg-slate-950 border border-slate-800 text-white rounded-lg px-3 py-2 text-xs focus:border-purple-500 focus:outline-none"
                  >
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="UPI">UPI / GPay</option>
                    <option value="Cash">Cash</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Transaction Ref / UTR No.</label>
                <input
                  type="text"
                  placeholder="e.g. UTR30920492"
                  value={payOfficerForm.referenceNumber}
                  onChange={(e) => setPayOfficerForm({ ...payOfficerForm, referenceNumber: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 text-white rounded-lg px-3 py-2 text-xs focus:border-purple-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Remark</label>
                <input
                  type="text"
                  placeholder="e.g. Transferred to Taluka Officer account"
                  value={payOfficerForm.remark}
                  onChange={(e) => setPayOfficerForm({ ...payOfficerForm, remark: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 text-white rounded-lg px-3 py-2 text-xs focus:border-purple-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowPayOfficerModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-semibold transition shadow"
                >
                  Save Details
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
