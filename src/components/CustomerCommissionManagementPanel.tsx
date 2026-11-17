import React, { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  IndianRupee,
  CheckCircle2,
  Clock,
  AlertCircle,
  Search,
  Filter,
  Download,
  ArrowLeft,
  FileSpreadsheet,
  Calendar,
  Phone,
  Copy,
  Check,
  History,
  Edit3,
  ShieldCheck,
  PlusCircle,
  Building2,
  RotateCcw,
  Wallet,
  X,
  CreditCard,
  Users,
  Settings,
  Trash2,
  Plus,
  AlertTriangle,
  Layers,
} from 'lucide-react';
import { WorkerClaim } from '../types';
import { formatDate } from '../utils/exportUtils';
import { getClaimFinancials } from '../utils/claimFinancials';
import { toast } from '../utils/toastConfig';
import { FromSourceFilterSelect } from './FromSourceFilterSelect';

// ----------------------------------------------------------------------------
// TYPES & INTERFACES FOR CUSTOMER COMMISSION MANAGEMENT
// ----------------------------------------------------------------------------

export type CommissionPaymentStatus = 'Paid' | 'Partially Paid' | 'Pending';

export interface ReceivingAccountItem {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
}

export type FollowUpStatusOption = 'Called' | 'No Answer' | 'Will Pay' | 'Paid' | 'Contact Later' | string;

export interface FollowUpStatusMasterItem {
  id: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
  createdBy?: string | null;
}

export interface CustomerCommissionFollowupRecord {
  id: string;
  claimId: string;
  listNumber: string;
  mhNumber: string;
  customerName: string;
  statusId?: string | null;
  followUpStatus: string;
  followUpDate: string;
  nextFollowUpDate?: string | null;
  remarks?: string | null;
  updatedByUserId?: string | null;
  updatedBy: string;
  updatedAt: string;
}

const DEFAULT_FOLLOWUP_STATUS_ITEMS: FollowUpStatusMasterItem[] = [
  { id: 'ccfs_called', name: 'Called', isDefault: true, isActive: true, sortOrder: 1 },
  { id: 'ccfs_no_answer', name: 'No Answer', isDefault: true, isActive: true, sortOrder: 2 },
  { id: 'ccfs_will_pay', name: 'Will Pay', isDefault: true, isActive: true, sortOrder: 3 },
  { id: 'ccfs_paid', name: 'Paid', isDefault: true, isActive: true, sortOrder: 4 },
  { id: 'ccfs_contact_later', name: 'Contact Later', isDefault: true, isActive: true, sortOrder: 5 },
];

const getCommissionAuthHeaders = (): Record<string, string> => {
  const token =
    localStorage.getItem('om_eseva_token') ||
    sessionStorage.getItem('om_eseva_token') ||
    localStorage.getItem('token') ||
    '';
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

export interface CommissionCollectionRecord {
  id: string;
  date: string;
  amount: number;
  receivingAccount: string;
  collectedBy: string;
  createdAt: string;
  followUpStatus?: string;
  followUpDate?: string;
}

export interface AccountCollectionEntry {
  collectionId: string;
  date: string;
  amount: number;
  receivingAccount: string;
  collectedBy: string;
  createdAt: string;
  customerName: string;
  mhNumber: string;
  mobileNumber: string;
  listNumber: string;
  claimId: string;
}

export interface AccountSummaryItem {
  accountName: string;
  accountId?: string;
  isActive: boolean;
  totalAmount: number;
  totalEntries: number;
  entries: AccountCollectionEntry[];
}

export interface CustomerCommissionItem {
  claimId: string;
  customerName: string;
  mhNumber: string;
  mobileNumber: string;
  taluka: string;
  listNumber: string;
  verificationDate?: string;
  claimDate?: string;
  scheme1Name: string;
  scheme1Amount: number;
  scheme1Status?: string;
  scheme1ApprovedAmount?: number;
  scheme2Name: string;
  scheme2Amount: number;
  scheme2Status?: string;
  scheme2ApprovedAmount?: number;
  totalSchemeAmount: number;
  totalApprovedAmount?: number;
  totalCommission: number; // Manually entered by Admin/Operator
  commissionReceived: number; // Automatic sum of collection records
  commissionPending: number; // Total Commission - Commission Received
  paymentStatus: CommissionPaymentStatus;
  collections: CommissionCollectionRecord[];
  updatedAt: string;
  updatedBy: string;
  followUpStatus?: FollowUpStatusOption | string;
  followUpDate?: string; // YYYY-MM-DD
  nextFollowUpDate?: string; // YYYY-MM-DD
  followUpRemarks?: string;
  fromSource?: string;
}

interface CustomerCommissionManagementPanelProps {
  listNumber: string;
  claims: WorkerClaim[];
  onBackToLists: () => void;
  currentUser?: { name?: string; role?: string; username?: string };
}

export const COMMISSION_STORAGE_KEY = 'OM_DIGITAL_CUSTOMER_COMMISSION_V3';
const STORAGE_KEY = COMMISSION_STORAGE_KEY;
const ACCOUNTS_STORAGE_KEY = 'OM_DIGITAL_RECEIVING_ACCOUNTS_V2';

const DEFAULT_RECEIVING_ACCOUNTS: ReceivingAccountItem[] = [
  { id: 'acc_1', name: 'Cash in Hand (दुकान रोख गल्ला)', isActive: true, createdAt: '2026-01-01' },
  { id: 'acc_2', name: 'Shop PhonePe / GPay (QR Code / UPI)', isActive: true, createdAt: '2026-01-01' },
  { id: 'acc_3', name: 'OM Digital Current A/c - HDFC Bank', isActive: true, createdAt: '2026-01-01' },
  { id: 'acc_4', name: 'State Bank of India (SBI)', isActive: true, createdAt: '2026-01-01' },
  { id: 'acc_5', name: 'Bank of Maharashtra (BOM)', isActive: true, createdAt: '2026-01-01' },
];

export const CustomerCommissionManagementPanel: React.FC<CustomerCommissionManagementPanelProps> = ({
  listNumber,
  claims,
  onBackToLists,
  currentUser,
}) => {
  // Scope State: Defaults strictly to listNumber. Allows switching to 'ALL' (All Lists) or other lists.
  const [activeListScope, setActiveListScope] = useState<string>(listNumber);

  useEffect(() => {
    setActiveListScope(listNumber);
  }, [listNumber]);

  // Unique list numbers available
  const availableListNumbers = useMemo(() => {
    const set = new Set<string>();
    if (listNumber && listNumber.trim()) set.add(listNumber.trim());
    claims.forEach((c) => {
      if (c.listNumber && c.listNumber.trim()) {
        set.add(c.listNumber.trim());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [claims, listNumber]);

  // Claims scoped according to activeListScope
  const scopedClaims = useMemo(() => {
    if (activeListScope === 'ALL') {
      return claims.filter((c) => Boolean((c.listNumber || '').trim()));
    }
    return claims.filter((c) => (c.listNumber || '').trim() === activeListScope.trim());
  }, [claims, activeListScope]);

  // Persistent storage state for Customer Commission records
  const [commissionMap, setCommissionMap] = useState<{ [claimId: string]: CustomerCommissionItem }>({});
  const [isInitialized, setIsInitialized] = useState(false);

  // Receiving Accounts State (Add, Edit, Delete / Deactivate with persistence)
  const [accounts, setAccounts] = useState<ReceivingAccountItem[]>([]);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [newAccountInput, setNewAccountInput] = useState('');
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [editingAccountName, setEditingAccountName] = useState('');
  const [accountDeleteConfirm, setAccountDeleteConfirm] = useState<ReceivingAccountItem | null>(null);

  // Account Details Modal State (Feature 2: Click to view details)
  const [selectedAccountForDetails, setSelectedAccountForDetails] = useState<AccountSummaryItem | null>(null);
  const [accountDetailsSearch, setAccountDetailsSearch] = useState('');

  // Search & Filters
  const [customerSearch, setCustomerSearch] = useState('');
  const [mhSearch, setMhSearch] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<'All' | CommissionPaymentStatus>('All');
  const [talukaFilter, setTalukaFilter] = useState('All');
  const [fromSourceFilter, setFromSourceFilter] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  // Active Modals
  const [editingCommissionCustomer, setEditingCommissionCustomer] = useState<CustomerCommissionItem | null>(null);
  const [newTotalCommissionInput, setNewTotalCommissionInput] = useState('');

  // Record Collection Form State (Date, Amount Received, Receiving Account, Follow-up Status, Follow-up Date)
  const [collectingCustomer, setCollectingCustomer] = useState<CustomerCommissionItem | null>(null);
  const [collectDate, setCollectDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [collectAmount, setCollectAmount] = useState('');
  const [collectAccount, setCollectAccount] = useState('');
  const [collectFollowUpStatus, setCollectFollowUpStatus] = useState<string>('');
  const [collectFollowUpDate, setCollectFollowUpDate] = useState<string>('');
  const [collectNextFollowUpDate, setCollectNextFollowUpDate] = useState<string>('');
  const [collectFollowUpRemarks, setCollectFollowUpRemarks] = useState<string>('');
  const [isSavingFollowup, setIsSavingFollowup] = useState(false);

  // Follow-up Status Master & Persistent DB History
  const [followupStatuses, setFollowupStatuses] = useState<FollowUpStatusMasterItem[]>(DEFAULT_FOLLOWUP_STATUS_ITEMS);
  const [followupsByClaim, setFollowupsByClaim] = useState<Record<string, CustomerCommissionFollowupRecord[]>>({});
  const [isFollowupStatusModalOpen, setIsFollowupStatusModalOpen] = useState(false);
  const [newFollowupStatusInput, setNewFollowupStatusInput] = useState('');
  const [editingFollowupStatusId, setEditingFollowupStatusId] = useState<string | null>(null);
  const [editingFollowupStatusName, setEditingFollowupStatusName] = useState('');
  const [followupStatusDeleteConfirm, setFollowupStatusDeleteConfirm] = useState<FollowUpStatusMasterItem | null>(null);
  const [isSavingFollowupStatus, setIsSavingFollowupStatus] = useState(false);

  const canManageFollowupStatuses =
    !currentUser?.role ||
    String(currentUser.role).toLowerCase() === 'admin' ||
    String(currentUser.role).toLowerCase() === 'operator';

  // Collection History Modal
  const [viewHistoryCustomer, setViewHistoryCustomer] = useState<CustomerCommissionItem | null>(null);

  // Copy MH feedback
  const [copiedMh, setCopiedMh] = useState<string | null>(null);

  // --------------------------------------------------------------------------
  // 0. LOAD & MANAGE FOLLOW-UP STATUSES & HISTORY FROM MYSQL DATABASE
  // --------------------------------------------------------------------------
  const fetchFollowupStatuses = async () => {
    try {
      const res = await fetch('/api/customer-commission/followup-statuses', {
        headers: getCommissionAuthHeaders(),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setFollowupStatuses(data);
      }
    } catch (e) {
      console.error('Failed loading follow-up statuses:', e);
    }
  };

  const fetchFollowupHistory = async (scope: string) => {
    try {
      const qs = scope && scope !== 'ALL' ? `?listNumber=${encodeURIComponent(scope)}` : '';
      const res = await fetch(`/api/customer-commission/followups${qs}`, {
        headers: getCommissionAuthHeaders(),
      });
      if (!res.ok) return;
      const rows: CustomerCommissionFollowupRecord[] = await res.json();
      if (!Array.isArray(rows)) return;
      const grouped: Record<string, CustomerCommissionFollowupRecord[]> = {};
      rows.forEach((r) => {
        if (!grouped[r.claimId]) grouped[r.claimId] = [];
        grouped[r.claimId].push(r);
      });
      setFollowupsByClaim(grouped);
    } catch (e) {
      console.error('Failed loading follow-up history:', e);
    }
  };

  useEffect(() => {
    fetchFollowupStatuses();
  }, []);

  useEffect(() => {
    fetchFollowupHistory(activeListScope);
  }, [activeListScope]);

  const handleAddFollowupStatus = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newFollowupStatusInput.trim();
    if (!trimmed) {
      toast.show({ type: 'error', message: 'कृपया Follow-up स्थितीचे नाव प्रविष्ट करा.' });
      return;
    }
    if (followupStatuses.some((s) => s.name.toLowerCase() === trimmed.toLowerCase() && s.isActive)) {
      toast.show({ type: 'warning', message: 'ही Follow-up स्थिती आधीच अस्तित्वात आहे.' });
      return;
    }
    setIsSavingFollowupStatus(true);
    try {
      const res = await fetch('/api/customer-commission/followup-statuses', {
        method: 'POST',
        headers: getCommissionAuthHeaders(),
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.show({ type: 'error', message: data?.error || 'स्थिती जोडताना त्रुटी आली.' });
        return;
      }
      await fetchFollowupStatuses();
      setNewFollowupStatusInput('');
      setCollectFollowUpStatus(data.name);
      toast.show({ type: 'success', message: `नवीन Follow-up स्थिती '${data.name}' जोडली गेली!` });
    } catch (err) {
      console.error(err);
      toast.show({ type: 'error', message: 'नेटवर्क त्रुटी: स्थिती सेव्ह करता आली नाही.' });
    } finally {
      setIsSavingFollowupStatus(false);
    }
  };

  const handleSaveEditFollowupStatus = async (id: string) => {
    const trimmed = editingFollowupStatusName.trim();
    if (!trimmed) {
      toast.show({ type: 'error', message: 'स्थितीचे नाव रिकामे असू शकत नाही.' });
      return;
    }
    if (followupStatuses.some((s) => s.id !== id && s.name.toLowerCase() === trimmed.toLowerCase())) {
      toast.show({ type: 'warning', message: 'या नावाची दुसरी Follow-up स्थिती आधीच आहे.' });
      return;
    }
    const oldItem = followupStatuses.find((s) => s.id === id);
    setIsSavingFollowupStatus(true);
    try {
      const res = await fetch(`/api/customer-commission/followup-statuses/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: getCommissionAuthHeaders(),
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.show({ type: 'error', message: data?.error || 'स्थितीचे नाव बदलताना त्रुटी आली.' });
        return;
      }
      await fetchFollowupStatuses();
      if (oldItem && collectFollowUpStatus === oldItem.name) {
        setCollectFollowUpStatus(data.name);
      }
      setEditingFollowupStatusId(null);
      setEditingFollowupStatusName('');
      toast.show({ type: 'success', message: 'Follow-up स्थिती यशस्वीरित्या अद्ययावत झाली!' });
    } catch (err) {
      console.error(err);
      toast.show({ type: 'error', message: 'नेटवर्क त्रुटी: स्थिती अद्ययावत करता आली नाही.' });
    } finally {
      setIsSavingFollowupStatus(false);
    }
  };

  const handleConfirmDeleteFollowupStatus = async () => {
    if (!followupStatusDeleteConfirm) return;
    const target = followupStatusDeleteConfirm;
    setIsSavingFollowupStatus(true);
    try {
      const res = await fetch(`/api/customer-commission/followup-statuses/${encodeURIComponent(target.id)}`, {
        method: 'DELETE',
        headers: getCommissionAuthHeaders(),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.show({ type: 'error', message: data?.error || 'स्थिती हटवताना त्रुटी आली.' });
        return;
      }
      await fetchFollowupStatuses();
      if (collectFollowUpStatus === target.name) {
        setCollectFollowUpStatus('');
      }
      toast.show({
        type: data.action === 'deactivated' ? 'info' : 'success',
        message:
          data.action === 'deactivated'
            ? `'${target.name}' आधीच्या इतिहासात वापरली असल्याने सुरक्षितपणे निष्क्रिय (Deactivate) केली गेली. जुना इतिहास अबाधित राहील.`
            : `'${target.name}' Follow-up स्थिती कायमची हटवली गेली.`,
      });
      setFollowupStatusDeleteConfirm(null);
    } catch (err) {
      console.error(err);
      toast.show({ type: 'error', message: 'नेटवर्क त्रुटी: स्थिती हटवता आली नाही.' });
    } finally {
      setIsSavingFollowupStatus(false);
    }
  };

  // --------------------------------------------------------------------------
  // 1. LOAD & SYNC RECEIVING ACCOUNTS
  // --------------------------------------------------------------------------
  useEffect(() => {
    let loadedAccounts: ReceivingAccountItem[] = DEFAULT_RECEIVING_ACCOUNTS;
    try {
      const raw = localStorage.getItem(ACCOUNTS_STORAGE_KEY);
      if (raw) {
        loadedAccounts = JSON.parse(raw);
      } else {
        localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(DEFAULT_RECEIVING_ACCOUNTS));
      }
    } catch (e) {
      console.error('Failed reading accounts from localStorage', e);
    }
    setAccounts(loadedAccounts);
    // Strict requirement: No automatic account selection. Receiving Account remains empty ('') by default.
  }, []);

  const saveAccountsToStorage = (updatedAccounts: ReceivingAccountItem[]) => {
    setAccounts(updatedAccounts);
    try {
      localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(updatedAccounts));
    } catch (e) {
      console.error('Failed saving accounts to localStorage', e);
    }
  };

  // Add Account handler
  const handleAddAccount = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newAccountInput.trim();
    if (!trimmed) {
      toast.show({ type: 'error', message: 'कृपया खात्याचे नाव प्रविष्ट करा.' });
      return;
    }
    // Prevent duplicate account names
    if (accounts.some((a) => a.name.toLowerCase() === trimmed.toLowerCase())) {
      toast.show({ type: 'warning', message: 'या नावाचे खाते आधीच अस्तित्वात आहे.' });
      return;
    }

    const newAcc: ReceivingAccountItem = {
      id: `acc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: trimmed,
      isActive: true,
      createdAt: new Date().toISOString().slice(0, 10),
    };

    const updated = [...accounts, newAcc];
    saveAccountsToStorage(updated);
    setNewAccountInput('');
    setCollectAccount(trimmed);
    toast.show({ type: 'success', message: `नवीन खाते '${trimmed}' जोडले गेले!` });
  };

  // Edit Account handler
  const handleSaveEditAccount = (id: string) => {
    const trimmed = editingAccountName.trim();
    if (!trimmed) {
      toast.show({ type: 'error', message: 'खात्याचे नाव रिकामे असू शकत नाही.' });
      return;
    }
    if (accounts.some((a) => a.id !== id && a.name.toLowerCase() === trimmed.toLowerCase())) {
      toast.show({ type: 'warning', message: 'या नावाचे दुसरे खाते आधीच आहे.' });
      return;
    }

    const updated = accounts.map((a) => (a.id === id ? { ...a, name: trimmed } : a));
    saveAccountsToStorage(updated);
    setEditingAccountId(null);
    setEditingAccountName('');
    toast.show({ type: 'success', message: 'खात्याचे नाव यशस्वीरित्या बदलले!' });
  };

  // Delete / Deactivate Account handler
  const handleConfirmDeleteAccount = () => {
    if (!accountDeleteConfirm) return;
    const toDeleteId = accountDeleteConfirm.id;
    const toDeleteName = accountDeleteConfirm.name;

    // Filter out or mark deactivated
    const updated = accounts.filter((a) => a.id !== toDeleteId);
    saveAccountsToStorage(updated);

    // Reset dropdown selection if deleted account was selected
    if (collectAccount === toDeleteName) {
      setCollectAccount('');
    }

    toast.show({
      type: 'info',
      message: `'${toDeleteName}' खाते यशस्वीरित्या हटवले. आधीचे रेकॉर्ड सुरक्षित राहतील.`,
    });
    setAccountDeleteConfirm(null);
  };

  // --------------------------------------------------------------------------
  // 2. LOAD & INITIALIZE COMMISSION DATA FROM LOCALSTORAGE
  // --------------------------------------------------------------------------
  useEffect(() => {
    let savedStore: { [claimId: string]: CustomerCommissionItem } = {};
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        savedStore = JSON.parse(raw);
      }
    } catch (e) {
      console.error('Failed reading commission data from localStorage', e);
    }

    const newMap: { [claimId: string]: CustomerCommissionItem } = { ...savedStore };
    let hasNewKeys = false;

    claims.forEach((claim) => {
      const cListNumber = (claim.listNumber || listNumber || '').trim();
      const fin = getClaimFinancials(claim);
      const s1Name = claim.scheme1Name || '-';
      const s1Amt = fin.scheme1OriginalAmount;
      const s2Name = claim.scheme2Name || '-';
      const s2Amt = fin.scheme2OriginalAmount;
      const totalSchemeAmt = fin.totalClaimAmount;
      const totalApprovedAmt = fin.totalApprovedAmount;

      if (!newMap[claim.id]) {
        // Strictly Manual Entry: Total Commission starts at 0 without any auto default.
        // Admin / Operator enters the exact commission manually per customer.
        const defaultTotal = 0;
        const defaultRec = 0;
        const defaultStatus: CommissionPaymentStatus = 'Pending';
        const demoCollections: CommissionCollectionRecord[] = [];
        const pendingAmt = 0;

        newMap[claim.id] = {
          claimId: claim.id,
          customerName: claim.workerName,
          mhNumber: claim.mhNumber,
          mobileNumber: claim.mobileNumber || '',
          taluka: claim.taluka || '',
          listNumber: cListNumber,
          verificationDate: claim.verificationDate,
          claimDate: claim.claimDate,
          scheme1Name: s1Name,
          scheme1Amount: s1Amt,
          scheme1Status: fin.scheme1Status,
          scheme1ApprovedAmount: fin.scheme1ApprovedAmount,
          scheme2Name: s2Name,
          scheme2Amount: s2Amt,
          scheme2Status: fin.scheme2Status,
          scheme2ApprovedAmount: fin.scheme2ApprovedAmount,
          totalSchemeAmount: totalSchemeAmt,
          totalApprovedAmount: totalApprovedAmt,
          totalCommission: defaultTotal,
          commissionReceived: defaultRec,
          commissionPending: pendingAmt,
          paymentStatus: defaultStatus,
          collections: demoCollections,
          fromSource: claim.fromSource || '',
          updatedAt: new Date().toISOString(),
          updatedBy: 'System',
        };
        hasNewKeys = true;
      } else {
        // Ensure scheme amounts & list number remain synchronized with claim entry
        const existing = newMap[claim.id];
        if (claim.fromSource && existing.fromSource !== claim.fromSource) {
          existing.fromSource = claim.fromSource;
          hasNewKeys = true;
        }
        if (
          existing.scheme1Status !== fin.scheme1Status ||
          existing.scheme1ApprovedAmount !== fin.scheme1ApprovedAmount ||
          existing.scheme2Status !== fin.scheme2Status ||
          existing.scheme2ApprovedAmount !== fin.scheme2ApprovedAmount ||
          existing.totalApprovedAmount !== totalApprovedAmt
        ) {
          existing.scheme1Status = fin.scheme1Status;
          existing.scheme1ApprovedAmount = fin.scheme1ApprovedAmount;
          existing.scheme2Status = fin.scheme2Status;
          existing.scheme2ApprovedAmount = fin.scheme2ApprovedAmount;
          existing.totalApprovedAmount = totalApprovedAmt;
          hasNewKeys = true;
        }

        if (
          existing.scheme1Name !== s1Name ||
          existing.scheme1Amount !== s1Amt ||
          existing.scheme2Name !== s2Name ||
          existing.scheme2Amount !== s2Amt ||
          (claim.listNumber && existing.listNumber !== claim.listNumber)
        ) {
          existing.scheme1Name = s1Name;
          existing.scheme1Amount = s1Amt;
          existing.scheme2Name = s2Name;
          existing.scheme2Amount = s2Amt;
          if (claim.listNumber) existing.listNumber = claim.listNumber;
          existing.totalSchemeAmount = totalSchemeAmt;
          hasNewKeys = true;
        }
      }
    });

    if (hasNewKeys) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newMap));
      } catch (e) {
        console.error('Error saving commission map to localStorage', e);
      }
    }

    setCommissionMap(newMap);
    setIsInitialized(true);
  }, [claims, listNumber]);

  // Save to storage helper
  const saveMapToStorage = (updated: { [claimId: string]: CustomerCommissionItem }) => {
    setCommissionMap(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed saving to localStorage', e);
    }
  };

  // List of all customer commission items for current active scope (Selected List or All Lists)
  const allListItems: CustomerCommissionItem[] = useMemo(() => {
    if (!isInitialized) return [];
    return scopedClaims
      .map((c) => {
        const item = commissionMap[c.id];
        if (!item) return null;
        const dbHistory = followupsByClaim[c.id];
        if (dbHistory && dbHistory.length > 0) {
          const latest = dbHistory[0];
          return {
            ...item,
            followUpStatus: latest.followUpStatus,
            followUpDate: latest.followUpDate,
            nextFollowUpDate: latest.nextFollowUpDate || undefined,
            followUpRemarks: latest.remarks || undefined,
          };
        }
        return item;
      })
      .filter((item): item is CustomerCommissionItem => Boolean(item));
  }, [scopedClaims, commissionMap, followupsByClaim, isInitialized]);

  // Derived unique Talukas
  const uniqueTalukas = useMemo(() => {
    const set = new Set<string>();
    allListItems.forEach((item) => {
      if (item.taluka) set.add(item.taluka);
    });
    ['Junnar', 'Ambegaon', 'Khed', 'Shirur'].forEach((t) => set.add(t));
    return Array.from(set).sort();
  }, [allListItems]);

  // --------------------------------------------------------------------------
  // FEATURE 1: DASHBOARD – एकूण Commission हिशोब (LIVE SUMMARY CARDS)
  // --------------------------------------------------------------------------
  const dashboardMetrics = useMemo(() => {
    let totalCommission = 0;
    let totalReceived = 0;
    let fullyPaidCount = 0;
    let pendingCount = 0;

    allListItems.forEach((item) => {
      const comm = Number(item.totalCommission || 0);
      totalCommission += comm;

      // Calculation: Total Received = सर्व Collection Entries ची बेरीज
      let rec = 0;
      if (item.collections && Array.isArray(item.collections) && item.collections.length > 0) {
        item.collections.forEach((c) => {
          rec += Number(c.amount || 0);
        });
      } else {
        rec = Number(item.commissionReceived || 0);
      }
      totalReceived += rec;

      // Fully Paid vs Pending
      if (comm > 0 && rec >= comm) {
        fullyPaidCount++;
      } else {
        pendingCount++;
      }
    });

    // Calculation: Total Pending = Total Commission − Total Received
    const totalPending = Math.max(0, totalCommission - totalReceived);

    return {
      totalCommission,
      totalReceived,
      totalPending,
      totalCustomers: allListItems.length,
      fullyPaidCustomers: fullyPaidCount,
      pendingCustomers: pendingCount,
    };
  }, [allListItems]);

  // --------------------------------------------------------------------------
  // FEATURE 2: RECEIVING ACCOUNT-WISE COLLECTION SUMMARY
  // --------------------------------------------------------------------------
  const accountWiseSummary = useMemo(() => {
    const summaryMap = new Map<string, AccountSummaryItem>();

    // 1. Seed with all currently defined accounts
    accounts.forEach((acc) => {
      summaryMap.set(acc.name.trim().toLowerCase(), {
        accountName: acc.name,
        accountId: acc.id,
        isActive: acc.isActive,
        totalAmount: 0,
        totalEntries: 0,
        entries: [],
      });
    });

    // 2. Aggregate from collections (guarantee: एकाच Collection ची रक्कम दोनदा मोजली जाऊ नये)
    const seenCollectionKeys = new Set<string>();

    allListItems.forEach((cust) => {
      if (cust.collections && Array.isArray(cust.collections)) {
        cust.collections.forEach((col) => {
          const uniqueKey = col.id || `${cust.claimId}_${col.date}_${col.amount}_${col.receivingAccount}`;
          if (seenCollectionKeys.has(uniqueKey)) return;
          seenCollectionKeys.add(uniqueKey);

          const rawAcc = (col.receivingAccount || 'अनिर्दिष्ट खाते').trim();
          const lookupKey = rawAcc.toLowerCase();

          let accItem = summaryMap.get(lookupKey);
          if (!accItem) {
            // Preserves historical account names even if renamed or deactivated
            accItem = {
              accountName: rawAcc,
              accountId: `hist_${lookupKey}`,
              isActive: false,
              totalAmount: 0,
              totalEntries: 0,
              entries: [],
            };
            summaryMap.set(lookupKey, accItem);
          }

          const amt = Number(col.amount || 0);
          accItem.totalAmount += amt;
          accItem.totalEntries += 1;
          accItem.entries.push({
            collectionId: col.id,
            date: col.date,
            amount: amt,
            receivingAccount: rawAcc,
            collectedBy: col.collectedBy || 'Admin / Operator',
            createdAt: col.createdAt || col.date,
            customerName: cust.customerName,
            mhNumber: cust.mhNumber,
            mobileNumber: cust.mobileNumber || '',
            listNumber: cust.listNumber,
            claimId: cust.claimId,
          });
        });
      }
    });

    return Array.from(summaryMap.values()).sort((a, b) => {
      if (b.totalAmount !== a.totalAmount) {
        return b.totalAmount - a.totalAmount;
      }
      return b.totalEntries - a.totalEntries;
    });
  }, [accounts, allListItems]);

  // --------------------------------------------------------------------------
  // SEARCH & FILTERED ITEMS
  // --------------------------------------------------------------------------
  const filteredItems = useMemo(() => {
    return allListItems.filter((item) => {
      // 1. Customer Name Search
      if (customerSearch.trim()) {
        const q = customerSearch.trim().toLowerCase();
        if (!item.customerName.toLowerCase().includes(q)) return false;
      }

      // 2. MH Number Search
      if (mhSearch.trim()) {
        const q = mhSearch.trim().toLowerCase();
        if (!item.mhNumber.toLowerCase().includes(q)) return false;
      }

      // 3. Payment Status Filter
      if (paymentStatusFilter !== 'All') {
        if (item.paymentStatus !== paymentStatusFilter) return false;
      }

      // 4. Taluka Filter
      if (talukaFilter !== 'All') {
        if (item.taluka !== talukaFilter) return false;
      }

      // 5. From Source Filter (स्त्रोत)
      if (fromSourceFilter && fromSourceFilter !== 'All') {
        const itemSource = (item.fromSource || '').trim().toLowerCase();
        const filterSource = fromSourceFilter.trim().toLowerCase();
        if (itemSource !== filterSource) return false;
      }

      return true;
    });
  }, [
    allListItems,
    customerSearch,
    mhSearch,
    paymentStatusFilter,
    talukaFilter,
    fromSourceFilter,
  ]);

  // Paginated records
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, currentPage, pageSize]);

  // Reset Filters
  const handleResetFilters = () => {
    setCustomerSearch('');
    setMhSearch('');
    setPaymentStatusFilter('All');
    setTalukaFilter('All');
    setFromSourceFilter('');
    setCurrentPage(1);
    toast.show({
      type: 'info',
      message: 'सर्व फिल्टर्स रीसेट केले आहेत.',
    });
  };

  const hasActiveFilters = Boolean(
    customerSearch.trim() ||
      mhSearch.trim() ||
      paymentStatusFilter !== 'All' ||
      talukaFilter !== 'All' ||
      (fromSourceFilter && fromSourceFilter !== 'All')
  );

  // Copy MH
  const handleCopyMh = (mh: string) => {
    if (!mh) return;
    navigator.clipboard.writeText(mh);
    setCopiedMh(mh);
    toast.show({
      type: 'success',
      message: `MH क्रमांक कॉपी केला: ${mh}`,
    });
    setTimeout(() => setCopiedMh(null), 2000);
  };

  // --------------------------------------------------------------------------
  // ACTIONS & HANDLERS
  // --------------------------------------------------------------------------

  // 1. Save Total Commission Edit (Manual Entry by Admin / Operator)
  const handleSaveTotalCommission = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCommissionCustomer) return;

    const newTotal = parseFloat(newTotalCommissionInput || '0');
    if (isNaN(newTotal) || newTotal < 0) {
      toast.show({ type: 'error', message: 'कृपया वैध कमिशन रक्कम प्रविष्ट करा.' });
      return;
    }

    const matchedClaimForValidation = claims.find((c) => c.id === editingCommissionCustomer.claimId);
    const eligibleApprovedAmt = matchedClaimForValidation
      ? getClaimFinancials(matchedClaimForValidation).totalApprovedAmount
      : Number(editingCommissionCustomer.totalApprovedAmount ?? 0);
    if (eligibleApprovedAmt <= 0 && newTotal > 0 && Number(editingCommissionCustomer.totalCommission || 0) === 0) {
      toast.show({
        type: 'warning',
        message: 'नामंजूर किंवा पडताळणी बाकी (₹0 Approved) योजनांवर नवीन कमिशन आकारता येत नाही.',
      });
      return;
    }

    const currentRec = Number(editingCommissionCustomer.commissionReceived || 0);
    const newPending = Math.max(0, newTotal - currentRec);

    let newStatus: CommissionPaymentStatus = 'Pending';
    if (newTotal > 0 && currentRec >= newTotal) {
      newStatus = 'Paid';
    } else if (currentRec > 0) {
      newStatus = 'Partially Paid';
    }

    const updatedItem: CustomerCommissionItem = {
      ...editingCommissionCustomer,
      totalCommission: newTotal,
      commissionPending: newPending,
      paymentStatus: newStatus,
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser?.name || currentUser?.username || 'Admin / Operator',
    };

    const newStore = {
      ...commissionMap,
      [editingCommissionCustomer.claimId]: updatedItem,
    };

    saveMapToStorage(newStore);
    toast.show({
      type: 'success',
      message: `${editingCommissionCustomer.customerName} चे एकूण कमिशन ₹${newTotal.toLocaleString('en-IN')} सेव्ह झाले!`,
    });
    setEditingCommissionCustomer(null);
  };

  // 2. Save Collection Entry (Date, Amount Received, Receiving Account, plus optional Follow-up log)
  const handleSaveCollection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!collectingCustomer) return;

    const amt = parseFloat(collectAmount || '0');
    if (isNaN(amt) || amt <= 0) {
      toast.show({ type: 'error', message: 'कृपया जमा केलेली योग्य रक्कम प्रविष्ट करा.' });
      return;
    }

    if (!collectAccount || !collectAccount.trim()) {
      toast.show({ type: 'error', message: 'कृपया जमा केलेले खाते निवडा.' });
      return;
    }

    const effectiveFollowUpDate =
      collectFollowUpDate && collectFollowUpDate.trim()
        ? collectFollowUpDate.trim()
        : new Date().toISOString().slice(0, 10);

    const currentRec = Number(collectingCustomer.commissionReceived || 0);
    let totalComm = Number(collectingCustomer.totalCommission || 0);
    const newRec = currentRec + amt;
    if (totalComm === 0) {
      totalComm = newRec;
    }
    const newPending = Math.max(0, totalComm - newRec);

    let newStatus: CommissionPaymentStatus = 'Partially Paid';
    if (totalComm > 0 && newRec >= totalComm) {
      newStatus = 'Paid';
    } else if (newRec === 0) {
      newStatus = 'Pending';
    }

    // Save individual collection record
    const newCollectionItem: CommissionCollectionRecord = {
      id: `col_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      date: collectDate,
      amount: amt,
      receivingAccount: collectAccount,
      collectedBy: currentUser?.name || currentUser?.username || 'Admin / Operator',
      createdAt: new Date().toISOString(),
      followUpStatus: collectFollowUpStatus || undefined,
      followUpDate: collectFollowUpStatus ? effectiveFollowUpDate : undefined,
    };

    const finalFollowUpStatus = collectFollowUpStatus || collectingCustomer.followUpStatus || undefined;
    const finalFollowUpDate = collectFollowUpStatus ? effectiveFollowUpDate : collectingCustomer.followUpDate;
    const finalNextDate =
      collectFollowUpStatus === 'Contact Later' && collectNextFollowUpDate
        ? collectNextFollowUpDate
        : collectFollowUpStatus
        ? undefined
        : collectingCustomer.nextFollowUpDate;

    const updatedItem: CustomerCommissionItem = {
      ...collectingCustomer,
      totalCommission: totalComm,
      commissionReceived: newRec,
      commissionPending: newPending,
      paymentStatus: newStatus,
      collections: [newCollectionItem, ...(collectingCustomer.collections || [])],
      followUpStatus: finalFollowUpStatus,
      followUpDate: finalFollowUpDate,
      nextFollowUpDate: finalNextDate,
      followUpRemarks: collectFollowUpStatus
        ? collectFollowUpRemarks.trim() || undefined
        : collectingCustomer.followUpRemarks,
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser?.name || currentUser?.username || 'Admin / Operator',
    };

    const newStore = {
      ...commissionMap,
      [collectingCustomer.claimId]: updatedItem,
    };

    saveMapToStorage(newStore);

    // If user also picked a Follow-up Status while collecting commission, persist it to DB too
    if (collectFollowUpStatus && collectFollowUpStatus.trim()) {
      try {
        const matchedStatus = followupStatuses.find(
          (s) => s.name.toLowerCase() === collectFollowUpStatus.trim().toLowerCase()
        );
        const fRes = await fetch('/api/customer-commission/followups', {
          method: 'POST',
          headers: getCommissionAuthHeaders(),
          body: JSON.stringify({
            claimId: collectingCustomer.claimId,
            listNumber: collectingCustomer.listNumber,
            mhNumber: collectingCustomer.mhNumber,
            customerName: collectingCustomer.customerName,
            statusId: matchedStatus?.id || null,
            followUpStatus: collectFollowUpStatus.trim(),
            followUpDate: effectiveFollowUpDate,
            nextFollowUpDate:
              collectFollowUpStatus === 'Contact Later' && collectNextFollowUpDate
                ? collectNextFollowUpDate
                : null,
            remarks: collectFollowUpRemarks.trim() || null,
          }),
        });
        if (fRes.ok) {
          const savedRow: CustomerCommissionFollowupRecord = await fRes.json();
          setFollowupsByClaim((prev) => ({
            ...prev,
            [collectingCustomer.claimId]: [savedRow, ...(prev[collectingCustomer.claimId] || [])],
          }));
        }
      } catch (err) {
        console.error('Optional follow-up save during collection failed:', err);
      }
    }

    toast.show({
      type: 'success',
      message: `${collectingCustomer.customerName} कडून ₹${amt.toLocaleString('en-IN')} कमिशन जमा झाले!`,
    });
    setCollectingCustomer(null);
    setCollectAccount('');
    setCollectAmount('');
    setCollectFollowUpStatus('');
    setCollectFollowUpDate('');
    setCollectNextFollowUpDate('');
    setCollectFollowUpRemarks('');
  };

  // 3. Save Follow-up Only (Strictly independent of Amount Received / Receiving Account / Collections)
  const handleSaveFollowUpOnly = async () => {
    if (!collectingCustomer || isSavingFollowup) return;

    if (!collectFollowUpStatus || !collectFollowUpStatus.trim()) {
      toast.show({ type: 'warning', message: 'कृपया Follow-up स्थिती निवडा.' });
      return;
    }

    const followUpDateToSave =
      collectFollowUpDate && collectFollowUpDate.trim()
        ? collectFollowUpDate.trim()
        : new Date().toISOString().slice(0, 10);

    const nextFollowUpDateToSave =
      collectFollowUpStatus === 'Contact Later' && collectNextFollowUpDate.trim()
        ? collectNextFollowUpDate.trim()
        : null;

    const remarksToSave = collectFollowUpRemarks.trim() || null;
    const matchedStatus = followupStatuses.find(
      (s) => s.name.toLowerCase() === collectFollowUpStatus.trim().toLowerCase()
    );

    setIsSavingFollowup(true);
    try {
      const res = await fetch('/api/customer-commission/followups', {
        method: 'POST',
        headers: getCommissionAuthHeaders(),
        body: JSON.stringify({
          claimId: collectingCustomer.claimId,
          listNumber: collectingCustomer.listNumber,
          mhNumber: collectingCustomer.mhNumber,
          customerName: collectingCustomer.customerName,
          statusId: matchedStatus?.id || null,
          followUpStatus: collectFollowUpStatus.trim(),
          followUpDate: followUpDateToSave,
          nextFollowUpDate: nextFollowUpDateToSave,
          remarks: remarksToSave,
        }),
      });

      const savedData = await res.json();
      if (!res.ok) {
        toast.show({ type: 'error', message: savedData?.error || 'Follow-up सेव्ह करताना त्रुटी आली.' });
        return;
      }

      const savedRecord = savedData as CustomerCommissionFollowupRecord;

      // Update DB-backed follow-up history map immediately (append-only at index 0)
      setFollowupsByClaim((prev) => {
        const existing = prev[collectingCustomer.claimId] || [];
        const deduped = existing.filter((r) => r.id !== savedRecord.id);
        return {
          ...prev,
          [collectingCustomer.claimId]: [savedRecord, ...deduped],
        };
      });

      // Mirror follow-up fields in commissionMap WITHOUT altering any amounts, balances, or collections
      const updatedItem: CustomerCommissionItem = {
        ...collectingCustomer,
        followUpStatus: savedRecord.followUpStatus,
        followUpDate: savedRecord.followUpDate,
        nextFollowUpDate: savedRecord.nextFollowUpDate || undefined,
        followUpRemarks: savedRecord.remarks || undefined,
        updatedAt: savedRecord.updatedAt || new Date().toISOString(),
        updatedBy: savedRecord.updatedBy || currentUser?.name || currentUser?.username || 'Admin / Operator',
      };

      const newStore = {
        ...commissionMap,
        [collectingCustomer.claimId]: updatedItem,
      };
      saveMapToStorage(newStore);

      toast.show({
        type: 'success',
        message: `${collectingCustomer.customerName} साठी Follow-up स्थिती '${savedRecord.followUpStatus}' (${formatDate(savedRecord.followUpDate)}) यशस्वीरित्या सेव्ह झाली!`,
      });

      setCollectingCustomer(null);
      setCollectAccount('');
      setCollectAmount('');
      setCollectFollowUpStatus('');
      setCollectFollowUpDate('');
      setCollectNextFollowUpDate('');
      setCollectFollowUpRemarks('');
    } catch (err) {
      console.error('Error saving follow-up:', err);
      toast.show({ type: 'error', message: 'नेटवर्क त्रुटी: Follow-up माहिती सेव्ह करता आली नाही.' });
    } finally {
      setIsSavingFollowup(false);
    }
  };

  // --------------------------------------------------------------------------
  // EXCEL (.XLSX) EXPORT (INCLUDES RECEIVING ACCOUNT & COMPLETE COLLECTION HISTORY)
  // --------------------------------------------------------------------------
  const getReceivingAccountsSummary = (item: CustomerCommissionItem): string => {
    if (!item.collections || item.collections.length === 0) {
      return '-';
    }
    const accounts = Array.from(new Set(item.collections.map((c) => c.receivingAccount).filter(Boolean)));
    if (accounts.length === 0) return '-';
    if (accounts.length === 1) return accounts[0];
    return accounts.join(' | ');
  };

  const getCollectionBreakdownText = (item: CustomerCommissionItem): string => {
    if (!item.collections || item.collections.length === 0) {
      return '-';
    }
    return item.collections
      .map(
        (c, idx) =>
          `हप्ता ${idx + 1}: ₹${Number(c.amount || 0).toLocaleString('en-IN')} (${formatDate(c.date)}) [खाते: ${c.receivingAccount}]`
      )
      .join('; ');
  };

  const formatItemForExcel = (item: CustomerCommissionItem, index: number) => ({
    '१. अ.क्र. (Sr No)': index + 1,
    '२. ग्राहकाचे नाव (Customer Name)': item.customerName,
    '३. MH क्रमांक (MH Number)': item.mhNumber,
    '४. यादी क्रमांक (List Number)': item.listNumber,
    '५. योजना १ नाव (Scheme 1 Name)': item.scheme1Name || '-',
    '६. योजना १ मूळ रक्कम (Scheme 1 Original Amount ₹)': Number(item.scheme1Amount || 0),
    '७. योजना १ स्थिती (Scheme 1 Status)': item.scheme1Status || 'Approved',
    '८. योजना १ मंजूर रक्कम (Scheme 1 Approved Amount ₹)': Number(item.scheme1ApprovedAmount !== undefined ? item.scheme1ApprovedAmount : item.scheme1Amount || 0),
    '९. योजना २ नाव (Scheme 2 Name)': item.scheme2Name || '-',
    '१०. योजना २ मूळ रक्कम (Scheme 2 Original Amount ₹)': Number(item.scheme2Amount || 0),
    '११. योजना २ स्थिती (Scheme 2 Status)': item.scheme2Name && item.scheme2Name !== '-' ? (item.scheme2Status || 'Approved') : '-',
    '१२. योजना २ मंजूर रक्कम (Scheme 2 Approved Amount ₹)': Number(item.scheme2ApprovedAmount !== undefined ? item.scheme2ApprovedAmount : (item.scheme2Amount || 0)),
    '१३. एकूण क्लेम रक्कम (Total Claim Amount ₹)': Number(item.totalSchemeAmount || 0),
    '१४. एकूण मंजूर रक्कम (Total Approved Amount ₹)': Number(item.totalApprovedAmount !== undefined ? item.totalApprovedAmount : (item.totalSchemeAmount || 0)),
    '१५. एकूण कमिशन (Total Commission ₹)': Number(item.totalCommission || 0),
    '१६. जमा कमिशन (Commission Received ₹)': Number(item.commissionReceived || 0),
    '१७. बाकी कमिशन (Commission Pending ₹)': Number(item.commissionPending || 0),
    '१८. पेमेंट स्थिती (Payment Status)': item.paymentStatus,
    '१९. जमा खाते (Receiving Account)': getReceivingAccountsSummary(item),
    '२०. हप्तेनिहाय जमा तपशील (Collection Breakdown)': getCollectionBreakdownText(item),
    '२१. Follow-up Status': item.followUpStatus || '-',
    '२२. Follow-up Date': item.followUpDate ? formatDate(item.followUpDate) : '-',
    '२३. FROM (स्त्रोत)': item.fromSource || '',
    '२४. Next Follow-up Date': item.nextFollowUpDate ? formatDate(item.nextFollowUpDate) : '-',
    '२५. Follow-up Remarks': item.followUpRemarks || '-',
  });

  const generateCollectionEntriesRows = (items: CustomerCommissionItem[]) => {
    const rows: any[] = [];
    let sr = 1;
    items.forEach((item) => {
      if (item.collections && item.collections.length > 0) {
        item.collections.forEach((col, idx) => {
          rows.push({
            'अ.क्र. (Sr No)': sr++,
            'ग्राहकाचे नाव (Customer Name)': item.customerName,
            'MH क्रमांक (MH Number)': item.mhNumber,
            'यादी क्रमांक (List Number)': item.listNumber,
            'हप्ता क्रमांक (Installment No)': idx + 1,
            'जमा तारीख (Collection Date)': formatDate(col.date),
            'जमा रक्कम (Amount Received ₹)': Number(col.amount || 0),
            'जमा खाते (Receiving Account)': col.receivingAccount || '-',
            'नोंदणीकर्ता (Collected By)': col.collectedBy || 'Admin / Operator',
            'एकूण ठरवलेले कमिशन (Total Commission ₹)': Number(item.totalCommission || 0),
            'शिल्लक बाकी (Remaining Pending ₹)': Number(item.commissionPending || 0),
            'पेमेंट स्थिती (Payment Status)': item.paymentStatus,
            'Follow-up Status': col.followUpStatus || item.followUpStatus || '-',
            'Follow-up Date': (col.followUpDate || item.followUpDate) ? formatDate(col.followUpDate || item.followUpDate!) : '-',
          });
        });
      }
    });
    return rows;
  };

  const excelCols = [
    { wch: 8 },  // 1. Sr No
    { wch: 28 }, // 2. Customer Name
    { wch: 18 }, // 3. MH Number
    { wch: 14 }, // 4. List Number
    { wch: 24 }, // 5. Scheme 1 Name
    { wch: 16 }, // 6. Scheme 1 Amount
    { wch: 24 }, // 7. Scheme 2 Name
    { wch: 16 }, // 8. Scheme 2 Amount
    { wch: 20 }, // 9. Total Scheme Amount
    { wch: 18 }, // 10. Total Commission
    { wch: 18 }, // 11. Commission Received
    { wch: 18 }, // 12. Commission Pending
    { wch: 16 }, // 13. Payment Status
    { wch: 32 }, // 14. Receiving Account
    { wch: 50 }, // 15. Collection Breakdown
    { wch: 20 }, // 16. Follow-up Status
    { wch: 18 }, // 17. Follow-up Date
  ];

  const collectionDetailCols = [
    { wch: 8 },  // Sr No
    { wch: 28 }, // Customer Name
    { wch: 18 }, // MH Number
    { wch: 14 }, // List Number
    { wch: 14 }, // Installment No
    { wch: 16 }, // Collection Date
    { wch: 18 }, // Amount Received
    { wch: 35 }, // Receiving Account
    { wch: 20 }, // Collected By
    { wch: 18 }, // Total Commission
    { wch: 18 }, // Pending
    { wch: 16 }, // Payment Status
  ];

  // 1. Export Selected List
  const handleExportSelectedList = () => {
    try {
      const wb = XLSX.utils.book_new();
      const rows = allListItems.map((item, idx) => formatItemForExcel(item, idx));
      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = excelCols;
      XLSX.utils.book_append_sheet(wb, ws, `List_${listNumber}_Commission`);

      // Add detailed collection ledger sheet if there are collections
      const detailedRows = generateCollectionEntriesRows(allListItems);
      if (detailedRows.length > 0) {
        const wsDetails = XLSX.utils.json_to_sheet(detailedRows);
        wsDetails['!cols'] = collectionDetailCols;
        XLSX.utils.book_append_sheet(wb, wsDetails, 'Collection_Transactions');
      }

      const today = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `OM_DIGITAL_Customer_Commission_List_${listNumber}_${today}.xlsx`);
      toast.show({
        type: 'success',
        message: `यादी क्र. ${listNumber} चा कमिशन व जमा खाते रिपोर्ट (.xlsx) डाऊनलोड झाला!`,
      });
    } catch (e) {
      console.error(e);
      toast.show({ type: 'error', message: 'एक्सेल डाऊनलोड करताना त्रुटी आली.' });
    }
  };

  // 2. Export Filtered Records
  const handleExportFiltered = () => {
    try {
      if (filteredItems.length === 0) {
        toast.show({ type: 'warning', message: 'फिल्टर केलेला कोणताही रेकॉर्ड सापडला नाही.' });
        return;
      }
      const wb = XLSX.utils.book_new();
      const rows = filteredItems.map((item, idx) => formatItemForExcel(item, idx));
      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = excelCols;
      XLSX.utils.book_append_sheet(wb, ws, 'Filtered_Commission');

      const detailedRows = generateCollectionEntriesRows(filteredItems);
      if (detailedRows.length > 0) {
        const wsDetails = XLSX.utils.json_to_sheet(detailedRows);
        wsDetails['!cols'] = collectionDetailCols;
        XLSX.utils.book_append_sheet(wb, wsDetails, 'Filtered_Collections');
      }

      const today = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `OM_DIGITAL_Filtered_Commission_List_${listNumber}_${today}.xlsx`);
      toast.show({
        type: 'success',
        message: `एकूण ${filteredItems.length} फिल्टर केलेले रेकॉर्ड्स (जमा खात्यासह) डाऊनलोड झाले!`,
      });
    } catch (e) {
      console.error(e);
      toast.show({ type: 'error', message: 'एक्सेल डाऊनलोड करताना त्रुटी आली.' });
    }
  };

  // 3. Export All Customers Across All Lists
  const handleExportAllCustomers = () => {
    try {
      let savedStore: { [claimId: string]: CustomerCommissionItem } = {};
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) savedStore = JSON.parse(raw);
      } catch (e) {
        console.error(e);
      }

      const validClaims = claims.filter(
        (c) => Boolean((c.listNumber || '').trim()) && c.status === 'Approved'
      );

      if (validClaims.length === 0) {
        toast.show({ type: 'warning', message: 'कोणताही मंजूर ग्राहक रेकॉर्ड सापडला नाही.' });
        return;
      }

      const allCustomerItems: CustomerCommissionItem[] = validClaims.map((claim) => {
        const fin = getClaimFinancials(claim);
        const existing = savedStore[claim.id];
        const totalComm = existing ? Number(existing.totalCommission || 0) : 0;
        const commRec = existing ? Number(existing.commissionReceived || 0) : 0;
        const commPend = Math.max(0, totalComm - commRec);
        let pStat: CommissionPaymentStatus = existing?.paymentStatus || 'Pending';
        if (totalComm > 0 && commRec >= totalComm) pStat = 'Paid';
        else if (commRec > 0) pStat = 'Partially Paid';

        const dbLatest = followupsByClaim[claim.id]?.[0];
        return {
          ...(existing || {}),
          claimId: claim.id,
          customerName: claim.workerName,
          mhNumber: claim.mhNumber,
          mobileNumber: claim.mobileNumber || '',
          taluka: claim.taluka || '',
          fromSource: claim.fromSource || existing?.fromSource || '',
          listNumber: claim.listNumber,
          verificationDate: claim.verificationDate,
          claimDate: claim.claimDate,
          scheme1Name: claim.scheme1Name || '-',
          scheme1Amount: fin.scheme1OriginalAmount,
          scheme1Status: fin.scheme1Status,
          scheme1ApprovedAmount: fin.scheme1ApprovedAmount,
          scheme2Name: claim.scheme2Name || '-',
          scheme2Amount: fin.scheme2OriginalAmount,
          scheme2Status: fin.scheme2Status,
          scheme2ApprovedAmount: fin.scheme2ApprovedAmount,
          totalSchemeAmount: fin.totalClaimAmount,
          totalApprovedAmount: fin.totalApprovedAmount,
          totalCommission: totalComm,
          commissionReceived: commRec,
          commissionPending: commPend,
          paymentStatus: pStat,
          collections: existing?.collections || [],
          followUpStatus: dbLatest?.followUpStatus || existing?.followUpStatus,
          followUpDate: dbLatest?.followUpDate || existing?.followUpDate,
          nextFollowUpDate: dbLatest?.nextFollowUpDate || existing?.nextFollowUpDate,
          followUpRemarks: dbLatest?.remarks || existing?.followUpRemarks,
          updatedAt: dbLatest?.updatedAt || existing?.updatedAt || new Date().toISOString(),
          updatedBy: dbLatest?.updatedBy || existing?.updatedBy || 'System',
        };
      });

      const wb = XLSX.utils.book_new();
      const rows = allCustomerItems.map((item, idx) => formatItemForExcel(item, idx));
      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = excelCols;
      XLSX.utils.book_append_sheet(wb, ws, 'All_Customers_Commission');

      const detailedRows = generateCollectionEntriesRows(allCustomerItems);
      if (detailedRows.length > 0) {
        const wsDetails = XLSX.utils.json_to_sheet(detailedRows);
        wsDetails['!cols'] = collectionDetailCols;
        XLSX.utils.book_append_sheet(wb, wsDetails, 'All_Collection_Entries');
      }

      const today = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `OM_DIGITAL_All_Customers_Commission_${today}.xlsx`);
      toast.show({
        type: 'success',
        message: `सर्व याद्यांमधील एकूण ${allCustomerItems.length} ग्राहकांचा कमिशन व जमा खाते रिपोर्ट (.xlsx) डाऊनलोड झाला!`,
      });
    } catch (e) {
      console.error(e);
      toast.show({ type: 'error', message: 'सर्व ग्राहकांचा एक्सेल डाऊनलोड करताना त्रुटी आली.' });
    }
  };

  // 4. Export Individual Customer Collection History
  const handleExportIndividualHistory = (customer: CustomerCommissionItem) => {
    try {
      if (!customer.collections || customer.collections.length === 0) {
        toast.show({ type: 'warning', message: 'या ग्राहकाची कोणतीही कमिशन जमा नोंद उपलब्ध नाही.' });
        return;
      }

      const wb = XLSX.utils.book_new();

      // Sheet 1: Customer Overview
      const summaryRow = [
        {
          'ग्राहकाचे नाव (Customer Name)': customer.customerName,
          'MH क्रमांक (MH Number)': customer.mhNumber,
          'मोबाईल (Mobile)': customer.mobileNumber || '-',
          'यादी क्रमांक (List Number)': customer.listNumber,
          'एकूण कमिशन (Total Commission ₹)': Number(customer.totalCommission || 0),
          'एकूण जमा कमिशन (Received ₹)': Number(customer.commissionReceived || 0),
          'शिल्लक बाकी (Pending ₹)': Number(customer.commissionPending || 0),
          'पेमेंट स्थिती (Payment Status)': customer.paymentStatus,
          'एकूण हप्ते (Total Installments)': customer.collections.length,
        },
      ];
      const wsSummary = XLSX.utils.json_to_sheet(summaryRow);
      XLSX.utils.book_append_sheet(wb, wsSummary, 'Customer_Summary');

      // Sheet 2: Collection Transactions
      const historyRows = customer.collections.map((col, idx) => ({
        'हप्ता क्रमांक (Installment No)': idx + 1,
        'जमा तारीख (Collection Date)': formatDate(col.date),
        'जमा रक्कम (Amount Received ₹)': Number(col.amount || 0),
        'जमा खाते (Receiving Account)': col.receivingAccount || '-',
        'नोंदणीकर्ता (Collected By)': col.collectedBy || 'Admin / Operator',
        'नोंद वेळ (Recorded At)': col.createdAt ? new Date(col.createdAt).toLocaleString('en-IN') : '-',
      }));

      const wsHistory = XLSX.utils.json_to_sheet(historyRows);
      wsHistory['!cols'] = [
        { wch: 14 }, // Installment No
        { wch: 16 }, // Date
        { wch: 18 }, // Amount
        { wch: 35 }, // Receiving Account
        { wch: 20 }, // Collected By
        { wch: 22 }, // Recorded At
      ];
      XLSX.utils.book_append_sheet(wb, wsHistory, 'Collection_Ledger');

      const today = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `OM_DIGITAL_History_${customer.mhNumber}_${today}.xlsx`);
      toast.show({
        type: 'success',
        message: `${customer.customerName} यांचा कमिशन वसुली इतिहास (.xlsx) डाऊनलोड झाला!`,
      });
    } catch (e) {
      console.error(e);
      toast.show({ type: 'error', message: 'वैयक्तिक इतिहास डाऊनलोड करताना त्रुटी आली.' });
    }
  };

  // 5. Export Account Ledger (.xlsx) for Feature 2
  const handleExportAccountLedger = (accItem: AccountSummaryItem) => {
    try {
      if (!accItem.entries || accItem.entries.length === 0) {
        toast.show({ type: 'warning', message: 'या खात्यात कोणतीही जमा नोंद उपलब्ध नाही.' });
        return;
      }

      const wb = XLSX.utils.book_new();

      // Sheet 1: Account Summary
      const overview = [
        {
          'खात्याचे नाव (Account Name)': accItem.accountName,
          'एकूण जमा कमिशन (Total Collection ₹)': accItem.totalAmount,
          'एकूण जमा नोंदी (Total Entries)': accItem.totalEntries,
          'यादी व्याप्ती (List Scope)': activeListScope === 'ALL' ? 'सर्व याद्या (All Lists)' : `यादी क्र. ${activeListScope}`,
          'तारीख (Generated Date)': new Date().toLocaleDateString('en-IN'),
        },
      ];
      const wsOverview = XLSX.utils.json_to_sheet(overview);
      XLSX.utils.book_append_sheet(wb, wsOverview, 'Account_Overview');

      // Sheet 2: Collection Transactions
      const rows = accItem.entries.map((entry, idx) => ({
        '१. अ.क्र. (Sr No)': idx + 1,
        '२. जमा तारीख (Collection Date)': formatDate(entry.date),
        '३. ग्राहकाचे नाव (Customer Name)': entry.customerName,
        '४. MH क्रमांक (MH Number)': entry.mhNumber,
        '५. मोबाईल (Mobile)': entry.mobileNumber || '-',
        '६. यादी क्रमांक (List Number)': entry.listNumber,
        '७. जमा रक्कम (Amount Received ₹)': Number(entry.amount || 0),
        '८. जमा खाते (Receiving Account)': entry.receivingAccount,
        '९. नोंदणीकर्ता (Collected By)': entry.collectedBy,
      }));

      const wsLedger = XLSX.utils.json_to_sheet(rows);
      wsLedger['!cols'] = [
        { wch: 8 },  // Sr No
        { wch: 16 }, // Date
        { wch: 28 }, // Customer Name
        { wch: 18 }, // MH Number
        { wch: 14 }, // Mobile
        { wch: 14 }, // List Number
        { wch: 18 }, // Amount Received
        { wch: 32 }, // Receiving Account
        { wch: 20 }, // Collected By
      ];
      XLSX.utils.book_append_sheet(wb, wsLedger, 'Collection_Ledger');

      const cleanName = accItem.accountName.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20);
      const today = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `OM_DIGITAL_Account_${cleanName}_${today}.xlsx`);
      toast.show({
        type: 'success',
        message: `'${accItem.accountName}' चे संपूर्ण लेजर (.xlsx) डाऊनलोड झाले!`,
      });
    } catch (e) {
      console.error(e);
      toast.show({ type: 'error', message: 'खाते लेजर डाऊनलोड करताना त्रुटी आली.' });
    }
  };

  // Helper for Payment Status badge styling
  const getPaymentStatusBadge = (st: CommissionPaymentStatus) => {
    switch (st) {
      case 'Paid':
        return 'bg-emerald-100 text-emerald-900 border-emerald-300';
      case 'Partially Paid':
        return 'bg-blue-100 text-blue-900 border-blue-300';
      case 'Pending':
      default:
        return 'bg-amber-100 text-amber-900 border-amber-300';
    }
  };

  return (
    <div className="space-y-6">
      {/* ==================================================================== */}
      {/* 1. TOP HEADER & BRANDING                                             */}
      {/* ==================================================================== */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-950 text-white rounded-3xl p-6 sm:p-7 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={onBackToLists}
              className="p-2.5 rounded-2xl bg-white/10 hover:bg-white/20 text-white border border-white/20 transition cursor-pointer shrink-0 mt-1"
              title="मागे यादी व्यवस्थापनाकडे जा (Back to Claim List Management)"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="px-3 py-1 rounded-full bg-cyan-400/20 text-cyan-200 text-xs font-black tracking-wide border border-cyan-300/30">
                  OM DIGITAL E-SEVA KENDRA
                </span>
                <span className="px-3 py-1 rounded-xl bg-blue-500 text-white font-mono font-black text-xs">
                  यादी क्र: {listNumber}
                </span>
                <span className="px-3 py-1 rounded-full bg-emerald-400/20 text-emerald-200 text-xs font-bold border border-emerald-300/30 flex items-center gap-1">
                  <Wallet className="w-3.5 h-3.5" />
                  Customer Commission Management
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-3">
                <IndianRupee className="w-8 h-8 text-cyan-300" />
                <span>ग्राहक कमिशन व्यवस्थापन (Customer Commission Management)</span>
              </h1>
              <p className="text-blue-100/80 text-xs sm:text-sm mt-1 max-w-3xl font-medium">
                यादी क्र. <strong className="text-white font-bold">{listNumber}</strong> मधील ग्राहकांचे योजनानिहाय तपशील, मॅन्युअल कमिशन नोंद, हप्ते संकलन व खाते व्यवस्थापन (Receiving Account Management).
              </p>
            </div>
          </div>

          {/* Export Actions & Manage Accounts */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsAccountModalOpen(true)}
              className="px-3.5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs shadow-md transition flex items-center gap-2 border border-slate-700 cursor-pointer"
              title="जमा खाती व्यवस्थापन (Add, Edit, Delete Receiving Accounts)"
            >
              <Settings className="w-4 h-4 text-cyan-300" />
              <span>खाती व्यवस्थापन (Accounts)</span>
            </button>

            <button
              type="button"
              onClick={handleExportSelectedList}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition flex items-center gap-2 cursor-pointer"
              title="यादी क्र. {listNumber} चा संपूर्ण कमिशन व जमा खाते रिपोर्ट (.xlsx) डाऊनलोड करा"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-100" />
              <span>यादी क्र. {listNumber} एक्सेल (.xlsx)</span>
            </button>

            <button
              type="button"
              onClick={handleExportAllCustomers}
              className="px-3.5 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-600 text-white font-bold text-xs shadow-md transition flex items-center gap-2 cursor-pointer"
              title="सर्व याद्यांमधील सर्व ग्राहकांचा कमिशन व जमा खाते रिपोर्ट (.xlsx) डाऊनलोड करा"
            >
              <FileSpreadsheet className="w-4 h-4 text-teal-200" />
              <span>सर्व ग्राहक एक्सेल (All Lists)</span>
            </button>

            <button
              type="button"
              onClick={handleExportFiltered}
              className={`px-3.5 py-2.5 rounded-xl text-white font-bold text-xs shadow-md transition flex items-center gap-1.5 cursor-pointer ${
                hasActiveFilters ? 'bg-purple-600 hover:bg-purple-500' : 'bg-slate-800/90 hover:bg-slate-700 text-slate-300'
              }`}
              title="सध्या फिल्टर केलेला डेटा (.xlsx) डाऊनलोड करा"
            >
              <Download className="w-4 h-4" />
              <span>फिल्टर डेटा (.xlsx)</span>
            </button>

            <button
              type="button"
              onClick={onBackToLists}
              className="px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition border border-white/20 cursor-pointer"
            >
              यादी व्यवस्थापन (Close)
            </button>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* SCOPE SELECTOR: SELECTED LIST VS ALL LISTS                           */}
      {/* ==================================================================== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-white border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs font-black text-slate-800 uppercase tracking-wider">
            <Layers className="w-4 h-4 text-blue-900" />
            <span>हिशोब व्याप्ती (Scope):</span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => {
                setActiveListScope(listNumber);
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                activeListScope === listNumber
                  ? 'bg-blue-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <span>फक्त यादी क्र. {listNumber}</span>
              {activeListScope === listNumber && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse" />
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveListScope('ALL');
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                activeListScope === 'ALL'
                  ? 'bg-blue-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <span>सर्व याद्या एकत्रित (All Lists)</span>
              {activeListScope === 'ALL' && (
                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse" />
              )}
            </button>

            {availableListNumbers.length > 1 && (
              <select
                value={activeListScope}
                onChange={(e) => {
                  setActiveListScope(e.target.value);
                  setCurrentPage(1);
                }}
                className="px-2.5 py-1.5 rounded-xl bg-slate-100 border border-slate-300 text-xs font-bold text-slate-800 cursor-pointer focus:bg-white focus:border-blue-600 transition"
              >
                <option value={listNumber}>यादी क्र. {listNumber}</option>
                <option value="ALL">सर्व याद्या एकत्रित (All Lists)</option>
                {availableListNumbers
                  .filter((l) => l !== listNumber)
                  .map((l) => (
                    <option key={l} value={l}>
                      यादी क्र. {l}
                    </option>
                  ))}
              </select>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-600 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
            {activeListScope === 'ALL' ? (
              <>सर्व याद्या: <strong className="text-blue-950 font-black">{allListItems.length}</strong> ग्राहक</>
            ) : (
              <>यादी क्र. {activeListScope}: <strong className="text-blue-950 font-black">{allListItems.length}</strong> ग्राहक</>
            )}
          </span>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* FEATURE 1: DASHBOARD – एकूण COMMISSION हिशोब (6 SUMMARY CARDS)        */}
      {/* ==================================================================== */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {/* 1. Total Commission – सर्व ग्राहकांचे एकूण ठरवलेले Commission */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50/40 border border-blue-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-blue-900 uppercase tracking-wider block">
              1. Total Commission
            </span>
            <IndianRupee className="w-4 h-4 text-blue-700" />
          </div>
          <span className="text-xl sm:text-2xl font-black text-blue-950 font-mono mt-1">
            ₹{dashboardMetrics.totalCommission.toLocaleString('en-IN')}
          </span>
          <span className="text-[10px] text-blue-700 font-semibold mt-1">
            सर्व ग्राहकांचे एकूण ठरवलेले Commission
          </span>
        </div>

        {/* 2. Total Received – ग्राहकांकडून आतापर्यंत जमा झालेले एकूण Commission */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50/40 border border-emerald-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-emerald-900 uppercase tracking-wider block">
              2. Total Received
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-700" />
          </div>
          <span className="text-xl sm:text-2xl font-black text-emerald-950 font-mono mt-1">
            ₹{dashboardMetrics.totalReceived.toLocaleString('en-IN')}
          </span>
          <span className="text-[10px] text-emerald-700 font-semibold mt-1">
            ग्राहकांकडून जमा झालेले एकूण Commission
          </span>
        </div>

        {/* 3. Total Pending – अजून जमा व्हायचे एकूण Commission (Total Commission − Total Received) */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50/40 border border-amber-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-amber-900 uppercase tracking-wider block">
              3. Total Pending
            </span>
            <Clock className="w-4 h-4 text-amber-700" />
          </div>
          <span className="text-xl sm:text-2xl font-black text-amber-950 font-mono mt-1">
            ₹{dashboardMetrics.totalPending.toLocaleString('en-IN')}
          </span>
          <span className="text-[10px] text-amber-700 font-semibold mt-1">
            अजून जमा व्हायचे एकूण Commission
          </span>
        </div>

        {/* 4. Total Customers – एकूण ग्राहक */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-slate-700 uppercase tracking-wider block">
              4. Total Customers
            </span>
            <Users className="w-4 h-4 text-slate-500" />
          </div>
          <span className="text-2xl sm:text-3xl font-black text-slate-900 font-mono mt-1">
            {dashboardMetrics.totalCustomers}
          </span>
          <span className="text-[10px] text-slate-500 font-semibold mt-1">
            एकूण ग्राहक ({activeListScope === 'ALL' ? 'सर्व याद्या' : `यादी ${activeListScope}`})
          </span>
        </div>

        {/* 5. Fully Paid Customers – पूर्ण Commission जमा झालेले ग्राहक */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-sky-50 to-blue-50/40 border border-sky-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-sky-900 uppercase tracking-wider block">
              5. Fully Paid Customers
            </span>
            <ShieldCheck className="w-4 h-4 text-sky-700" />
          </div>
          <span className="text-2xl sm:text-3xl font-black text-sky-950 font-mono mt-1">
            {dashboardMetrics.fullyPaidCustomers}
          </span>
          <span className="text-[10px] text-sky-700 font-semibold mt-1">
            पूर्ण Commission जमा झालेले ग्राहक
          </span>
        </div>

        {/* 6. Pending Customers – Commission बाकी असलेले ग्राहक */}
        <div className="p-4 rounded-2xl bg-gradient-to-br from-rose-50 to-pink-50/40 border border-rose-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black text-rose-900 uppercase tracking-wider block">
              6. Pending Customers
            </span>
            <AlertCircle className="w-4 h-4 text-rose-700" />
          </div>
          <span className="text-2xl sm:text-3xl font-black text-rose-950 font-mono mt-1">
            {dashboardMetrics.pendingCustomers}
          </span>
          <span className="text-[10px] text-rose-700 font-semibold mt-1">
            Commission बाकी असलेले ग्राहक
          </span>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* FEATURE 2: RECEIVING ACCOUNT-WISE COLLECTION SUMMARY                 */}
      {/* ==================================================================== */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 flex items-center justify-center shrink-0">
              <Building2 className="w-5 h-5 text-blue-900" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm sm:text-base font-black text-slate-900">
                  Account-wise Collection Summary (खातेनिहाय वसुली सारांश)
                </h3>
                <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-900 text-[10px] font-bold">
                  {accountWiseSummary.length} खाती
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                प्रत्येक Receiving Account मध्ये प्रत्यक्ष जमा झालेली एकूण रक्कम व नोंदी. तपशील पाहण्यासाठी कोणत्याही खात्यावर क्लिक करा.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsAccountModalOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition flex items-center gap-1.5 cursor-pointer border border-slate-300"
              title="जमा खाती व्यवस्थापन (Add, Edit, Deactivate Receiving Accounts)"
            >
              <Settings className="w-3.5 h-3.5 text-slate-600" />
              <span>खाती व्यवस्थापन (Manage Accounts)</span>
            </button>
          </div>
        </div>

        {/* Account Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          {accountWiseSummary.map((accItem) => {
            const hasCollections = accItem.totalAmount > 0;
            const isCash = accItem.accountName.toLowerCase().includes('cash') || accItem.accountName.includes('गल्ला');
            const isUPI =
              accItem.accountName.toLowerCase().includes('qr') ||
              accItem.accountName.toLowerCase().includes('upi') ||
              accItem.accountName.toLowerCase().includes('phonepe') ||
              accItem.accountName.toLowerCase().includes('gpay');

            return (
              <div
                key={accItem.accountName}
                onClick={() => {
                  setSelectedAccountForDetails(accItem);
                  setAccountDetailsSearch('');
                }}
                className={`p-4 rounded-2xl border transition-all cursor-pointer group flex flex-col justify-between select-none ${
                  hasCollections
                    ? 'bg-gradient-to-br from-white to-slate-50 border-slate-200 hover:border-blue-400 hover:shadow-md'
                    : 'bg-slate-50/60 border-slate-200/80 hover:bg-white hover:border-slate-300 opacity-90'
                }`}
                title="या खात्यामधील सर्व जमा नोंदी पाहण्यासाठी क्लिक करा"
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                        isCash
                          ? 'bg-emerald-100 text-emerald-800'
                          : isUPI
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-blue-100 text-blue-900'
                      }`}
                    >
                      {isCash ? (
                        <Wallet className="w-4 h-4" />
                      ) : isUPI ? (
                        <CreditCard className="w-4 h-4" />
                      ) : (
                        <Building2 className="w-4 h-4" />
                      )}
                    </div>
                    {hasCollections ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                        {accItem.totalEntries} नोंदी
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-200/70 text-slate-500">
                        ० नोंदी
                      </span>
                    )}
                  </div>

                  <h4 className="text-xs font-black text-slate-900 group-hover:text-blue-900 transition line-clamp-1">
                    {accItem.accountName}
                  </h4>
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-end justify-between">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold block">
                      एकूण जमा
                    </span>
                    <span
                      className={`text-base font-black font-mono ${
                        hasCollections ? 'text-emerald-700' : 'text-slate-400'
                      }`}
                    >
                      ₹{accItem.totalAmount.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <span className="text-[11px] font-bold text-blue-700 group-hover:translate-x-0.5 transition-transform">
                    तपशील →
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 3. SEARCH & FILTERS BAR                                              */}
      {/* ==================================================================== */}
      <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-blue-900" />
            <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider">
              Search & Filters (शोध व फिल्टर पर्याय)
            </h2>
          </div>
          <div className="flex items-center gap-3">
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="text-xs font-bold text-red-600 hover:text-red-700 flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>फिल्टर्स काढा (Reset)</span>
              </button>
            )}
            <span className="text-[11px] font-medium text-slate-500">
              एकूण निकाल: <strong className="text-slate-800 font-bold">{filteredItems.length}</strong> ग्राहक
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* 1. Customer Name Search */}
          <div>
            <label className="text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1 block">
              1. Customer Name (ग्राहक नाव)
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3 pointer-events-none" />
              <input
                type="text"
                value={customerSearch}
                onChange={(e) => {
                  setCustomerSearch(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="ग्राहकाचे नाव शोधा..."
                className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-300 font-medium text-xs text-slate-800 focus:bg-white focus:border-blue-600 transition"
              />
            </div>
          </div>

          {/* 2. MH Number Search */}
          <div>
            <label className="text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1 block">
              2. MH Number (MH क्रमांक)
            </label>
            <input
              type="text"
              value={mhSearch}
              onChange={(e) => {
                setMhSearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="उदा. MH14..."
              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 font-mono font-bold text-xs text-slate-800 focus:bg-white focus:border-blue-600 transition"
            />
          </div>

          {/* 3. Payment Status Filter */}
          <div>
            <label className="text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1 block">
              3. Payment Status (पेमेंट स्थिती)
            </label>
            <select
              value={paymentStatusFilter}
              onChange={(e) => {
                setPaymentStatusFilter(e.target.value as any);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 font-bold text-xs text-slate-800 focus:bg-white focus:border-blue-600 transition cursor-pointer"
            >
              <option value="All">सर्व स्थिती (All Status)</option>
              <option value="Pending">Pending (बाकी)</option>
              <option value="Partially Paid">Partially Paid (अंशता जमा)</option>
              <option value="Paid">Paid (पूर्ण जमा)</option>
            </select>
          </div>

          {/* 4. Taluka Filter */}
          <div>
            <label className="text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1 block">
              4. Taluka (तालुका)
            </label>
            <select
              value={talukaFilter}
              onChange={(e) => {
                setTalukaFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 font-bold text-xs text-slate-800 focus:bg-white focus:border-blue-600 transition cursor-pointer"
            >
              <option value="All">सर्व तालुके (All Talukas)</option>
              {uniqueTalukas.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* 5. FROM Filter (स्त्रोत) */}
          <div>
            <FromSourceFilterSelect
              value={fromSourceFilter}
              onChange={(val) => {
                setFromSourceFilter(val);
                setCurrentPage(1);
              }}
              label="5. FROM (स्त्रोत)"
              id="customer-commission-from-source-filter"
            />
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 4. CUSTOMER COMMISSION TABLE (14 EXACT COLUMNS)                      */}
      {/* ==================================================================== */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-md p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onBackToLists}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-blue-50 text-slate-800 hover:text-blue-900 font-bold text-xs border border-slate-300 hover:border-blue-300 transition shadow-xs cursor-pointer group"
              title="मागे यादी व्यवस्थापनाकडे जा (Back to Claim List Management)"
            >
              <ArrowLeft className="w-4 h-4 text-slate-600 group-hover:-translate-x-0.5 transition-transform" />
              <span>← Back (मागे जा)</span>
            </button>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
                <Wallet className="w-5 h-5 text-blue-900" />
                <span>Customer Commission Table (ग्राहक कमिशन व योजना विवरण)</span>
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                यादी क्र. <strong className="text-blue-950 font-bold font-mono">{listNumber}</strong> | योजना रकमा Claim Entry मधून स्वयंचलित लोड होतात; कमिशन रक्कम मॅन्युअली ठरवली जाते.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={onBackToLists}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-900 hover:bg-blue-800 text-white font-bold text-xs transition shadow-xs cursor-pointer"
              title="मागे यादी व्यवस्थापनाकडे जा"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Lists</span>
            </button>
            <span className="text-xs font-bold text-slate-600 bg-blue-50 px-3 py-1.5 rounded-xl border border-blue-200">
              दाखवत आहे: {filteredItems.length} पैकी {(currentPage - 1) * pageSize + 1}-
              {Math.min(currentPage * pageSize, filteredItems.length)} ग्राहक
            </span>
          </div>
        </div>

        {/* 14 Columns Table */}
        <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-inner">
          <table className="w-full text-left text-xs border-collapse min-w-[1450px]">
            <thead>
              <tr className="bg-slate-900 text-white font-bold text-[10px] uppercase tracking-wider">
                <th className="py-3 px-3 w-12 text-center">१. अ.क्र.</th>
                <th className="py-3 px-3">२. Customer Name</th>
                <th className="py-3 px-3">३. MH Number</th>
                <th className="py-3 px-3 text-center">४. List No.</th>
                <th className="py-3 px-3">५. FROM (स्त्रोत)</th>
                <th className="py-3 px-3">६. Scheme 1</th>
                <th className="py-3 px-3 text-right">७. Scheme 1 Amount</th>
                <th className="py-3 px-3">८. Scheme 2</th>
                <th className="py-3 px-3 text-right">९. Scheme 2 Amount</th>
                <th className="py-3 px-3 text-right text-cyan-300">१०. Total Scheme Amount</th>
                <th className="py-3 px-3 text-right text-blue-200">११. Total Commission</th>
                <th className="py-3 px-3 text-right text-emerald-300">१२. Commission Received</th>
                <th className="py-3 px-3 text-right text-amber-300">१३. Commission Pending</th>
                <th className="py-3 px-3 text-center">१४. Payment Status</th>
                <th className="py-3 px-3 text-center">१५. Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white font-medium">
              {paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={15} className="py-12 text-center text-slate-400">
                    <Wallet className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                    <p className="text-sm font-bold text-slate-600">
                      कोणतीही ग्राहक कमिशन नोंद सापडली नाही.
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      कृपया वर दिलेले शोध किंवा फिल्टर पर्याय तपासा.
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedItems.map((item, idx) => {
                  const serialNo = (currentPage - 1) * pageSize + idx + 1;

                  return (
                    <tr
                      key={item.claimId}
                      className="hover:bg-blue-50/50 transition group"
                    >
                      {/* 1. Serial Number */}
                      <td className="py-3 px-3 text-center text-slate-400 font-mono font-bold">
                        {serialNo}
                      </td>

                      {/* 2. Customer Name */}
                      <td className="py-3 px-3 font-bold text-slate-900">
                        <div className="flex items-center gap-1.5">
                          <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 font-bold text-[10px] flex items-center justify-center shrink-0">
                            {item.customerName?.charAt(0) || 'C'}
                          </span>
                          <div>
                            <span>{item.customerName}</span>
                            {item.mobileNumber && (
                              <span className="text-[10px] text-slate-400 block font-normal font-mono">
                                {item.mobileNumber}
                              </span>
                            )}
                            {item.followUpStatus && (
                              <div className="flex flex-wrap items-center gap-1 mt-1">
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                                    item.followUpStatus === 'Paid'
                                      ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                                      : item.followUpStatus === 'Will Pay'
                                      ? 'bg-teal-50 text-teal-900 border-teal-200'
                                      : item.followUpStatus === 'Contact Later'
                                      ? 'bg-purple-50 text-purple-900 border-purple-200'
                                      : item.followUpStatus === 'Called'
                                      ? 'bg-blue-50 text-blue-900 border-blue-200'
                                      : item.followUpStatus === 'No Answer'
                                      ? 'bg-rose-50 text-rose-900 border-rose-200'
                                      : 'bg-amber-50 text-amber-900 border-amber-200'
                                  }`}
                                  title={`Follow-up: ${item.followUpStatus}${item.followUpDate ? ` (${formatDate(item.followUpDate)})` : ''}${item.nextFollowUpDate ? ` | Next: ${formatDate(item.nextFollowUpDate)}` : ''}${item.followUpRemarks ? ` | ${item.followUpRemarks}` : ''}`}
                                >
                                  <Phone className="w-2.5 h-2.5" />
                                  <span>{item.followUpStatus}</span>
                                  {item.followUpDate && (
                                    <span className="font-mono font-bold">({formatDate(item.followUpDate)})</span>
                                  )}
                                  {item.followUpStatus === 'Contact Later' && item.nextFollowUpDate && (
                                    <span className="font-mono font-bold text-purple-800">
                                      → {formatDate(item.nextFollowUpDate)}
                                    </span>
                                  )}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* 3. MH Number */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1">
                          <span className="font-mono font-bold text-blue-900 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                            {item.mhNumber}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyMh(item.mhNumber)}
                            className="p-1 text-slate-400 hover:text-blue-700 transition cursor-pointer"
                            title="कॉपी करा"
                          >
                            {copiedMh === item.mhNumber ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* 4. List Number */}
                      <td className="py-3 px-3 text-center">
                        <span className="font-mono font-black text-xs px-2 py-0.5 rounded-md bg-blue-50 text-blue-900 border border-blue-200">
                          {item.listNumber}
                        </span>
                      </td>

                      {/* 5. FROM */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        {item.fromSource ? (
                          <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 font-semibold text-xs border border-purple-200 inline-block">
                            {item.fromSource}
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      {/* 6. Scheme 1 Name */}
                      <td className="py-3 px-3 text-slate-700 max-w-[160px]" title={item.scheme1Name}>
                        <div className="truncate">{item.scheme1Name || '-'}</div>
                        {item.scheme1Status && (
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded inline-flex items-center mt-0.5 ${
                              item.scheme1Status === 'Approved'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : item.scheme1Status === 'Review Required'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}
                          >
                            {item.scheme1Status === 'Approved' ? '● मंजूर' : item.scheme1Status === 'Review Required' ? '● पडताळणी बाकी' : '● नामंजूर (₹0)'}
                          </span>
                        )}
                      </td>

                      {/* 6. Scheme 1 Amount */}
                      <td className="py-3 px-3 text-right font-mono text-slate-700">
                        <div>₹{item.scheme1Amount.toLocaleString('en-IN')}</div>
                        {item.scheme1Status && item.scheme1Status !== 'Approved' && (
                          <div className="text-[10px] text-rose-600 font-bold">मंजूर: ₹0</div>
                        )}
                      </td>

                      {/* 7. Scheme 2 Name */}
                      <td className="py-3 px-3 text-slate-600 max-w-[160px]" title={item.scheme2Name}>
                        <div className="truncate">{item.scheme2Name || '-'}</div>
                        {item.scheme2Name && item.scheme2Name !== '-' && item.scheme2Status && (
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded inline-flex items-center mt-0.5 ${
                              item.scheme2Status === 'Approved'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : item.scheme2Status === 'Review Required'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}
                          >
                            {item.scheme2Status === 'Approved' ? '● मंजूर' : item.scheme2Status === 'Review Required' ? '● पडताळणी बाकी' : '● नामंजूर (₹0)'}
                          </span>
                        )}
                      </td>

                      {/* 8. Scheme 2 Amount */}
                      <td className="py-3 px-3 text-right font-mono text-slate-600">
                        {item.scheme2Amount > 0 ? (
                          <div>
                            <div>₹{item.scheme2Amount.toLocaleString('en-IN')}</div>
                            {item.scheme2Status && item.scheme2Status !== 'Approved' && (
                              <div className="text-[10px] text-rose-600 font-bold">मंजूर: ₹0</div>
                            )}
                          </div>
                        ) : '-'}
                      </td>

                      {/* 9. Total Scheme Amount */}
                      <td className="py-3 px-3 text-right font-mono font-bold text-cyan-900 bg-cyan-50/40 whitespace-nowrap">
                        <div>₹{(item.totalApprovedAmount ?? item.totalSchemeAmount).toLocaleString('en-IN')}</div>
                        {item.totalApprovedAmount !== undefined && item.totalApprovedAmount !== item.totalSchemeAmount && (
                          <div className="text-[10px] text-slate-400 font-normal line-through">
                            मूळ: ₹{item.totalSchemeAmount.toLocaleString('en-IN')}
                          </div>
                        )}
                      </td>

                      {/* 10. Total Commission (100% Manual Entry by Admin/Operator) */}
                      <td className="py-3 px-3 text-right font-mono bg-blue-50/30">
                        {item.totalCommission > 0 ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="font-black text-slate-900 text-sm">
                              ₹{item.totalCommission.toLocaleString('en-IN')}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingCommissionCustomer(item);
                                setNewTotalCommissionInput(String(item.totalCommission));
                              }}
                              className="p-1 rounded text-slate-400 hover:text-blue-700 hover:bg-blue-100 transition cursor-pointer"
                              title="एकूण कमिशन बदला (Edit Commission)"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingCommissionCustomer(item);
                                setNewTotalCommissionInput('');
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 hover:border-amber-400 shadow-xs transition cursor-pointer"
                              title="कमिशन मॅन्युअली प्रविष्ट करा (Enter Commission Manually)"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-amber-700" />
                              <span>+ कमिशन ठरवा</span>
                            </button>
                          </div>
                        )}
                      </td>

                      {/* 11. Commission Received */}
                      <td className="py-3 px-3 text-right font-mono font-bold text-emerald-700 bg-emerald-50/30">
                        ₹{item.commissionReceived.toLocaleString('en-IN')}
                      </td>

                      {/* 12. Commission Pending (Formula: Total - Received) */}
                      <td className="py-3 px-3 text-right font-mono font-black text-amber-700 bg-amber-50/30">
                        ₹{item.commissionPending.toLocaleString('en-IN')}
                      </td>

                      {/* 13. Payment Status */}
                      <td className="py-3 px-3 text-center">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider inline-block border ${getPaymentStatusBadge(
                            item.paymentStatus
                          )}`}
                        >
                          {item.paymentStatus}
                        </span>
                      </td>

                      {/* 14. Action */}
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* + Collect Button */}
                          <button
                            type="button"
                            onClick={() => {
                              const dbLatest = followupsByClaim[item.claimId]?.[0];
                              setCollectingCustomer(item);
                              setCollectDate(new Date().toISOString().slice(0, 10));
                              setCollectAmount(item.commissionPending > 0 ? String(item.commissionPending) : '');
                              setCollectAccount(''); // Strict: No auto-selection. Always empty on open.
                              setCollectFollowUpStatus(dbLatest?.followUpStatus || item.followUpStatus || '');
                              setCollectFollowUpDate(
                                dbLatest?.followUpDate || item.followUpDate || new Date().toISOString().slice(0, 10)
                              );
                              setCollectNextFollowUpDate(
                                dbLatest?.nextFollowUpDate || item.nextFollowUpDate || ''
                              );
                              setCollectFollowUpRemarks(
                                dbLatest?.remarks || item.followUpRemarks || ''
                              );
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-[11px] shadow-xs transition flex items-center gap-1 cursor-pointer"
                            title="कमिशन रक्कम जमा करा (+ Collect)"
                          >
                            <PlusCircle className="w-3 h-3" />
                            <span>जमा करा</span>
                          </button>

                          {/* Edit Commission Button */}
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCommissionCustomer(item);
                              setNewTotalCommissionInput(item.totalCommission > 0 ? String(item.totalCommission) : '');
                            }}
                            className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 transition cursor-pointer"
                            title="कमिशन ठरवा / बदला (Edit Commission)"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          {/* View Collection History */}
                          <button
                            type="button"
                            onClick={() => setViewHistoryCustomer(item)}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
                            title="वसुली इतिहास पहा (View Collection History)"
                          >
                            <History className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-slate-500 font-medium">
              पान {currentPage} / {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-bold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer hover:bg-slate-50"
              >
                मागे (Prev)
              </button>
              <button
                type="button"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-bold text-slate-700 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer hover:bg-slate-50"
              >
                पुढे (Next)
              </button>
            </div>
          </div>
        )}

        {/* Bottom Back Button & Navigation Toolbar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <button
            type="button"
            onClick={onBackToLists}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs shadow-md transition cursor-pointer hover:scale-105"
            title="मागे यादी व्यवस्थापनाकडे जा (Back to Claim List Management)"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>← मागे जा (Back to Claim List Management)</span>
          </button>

          <span className="text-xs text-slate-500 font-medium">
            यादी क्र. <strong className="text-blue-950 font-bold font-mono">{listNumber}</strong> | एकूण {filteredItems.length} ग्राहक नोंद
          </span>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* MODAL 1: EDIT / SET TOTAL COMMISSION (MANUAL ENTRY)                  */}
      {/* ==================================================================== */}
      {editingCommissionCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4 animate-in fade-in duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-200 text-blue-900 flex items-center justify-center">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    एकूण कमिशन ठरवा (Manual Commission Entry)
                  </h3>
                  <p className="text-xs text-slate-500">
                    {editingCommissionCustomer.customerName} ({editingCommissionCustomer.mhNumber})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingCommissionCustomer(null)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTotalCommission} className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">एकूण शासकीय योजना रक्कम:</span>
                  <span className="font-mono font-bold text-cyan-900">
                    ₹{(() => {
                      const matchedClaim = claims.find((c) => c.id === editingCommissionCustomer.claimId);
                      const approvedAmt = matchedClaim
                        ? getClaimFinancials(matchedClaim).totalApprovedAmount
                        : Number(editingCommissionCustomer.totalApprovedAmount ?? 0);
                      return approvedAmt.toLocaleString('en-IN');
                    })()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">आधीचे ठरवलेले कमिशन:</span>
                  <span className="font-mono font-bold text-slate-800">
                    {editingCommissionCustomer.totalCommission > 0
                      ? `₹${editingCommissionCustomer.totalCommission.toLocaleString('en-IN')}`
                      : 'अद्याप ठरवलेले नाही (मॅन्युअली ठरवा)'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">आतापर्यंत जमा रक्कम:</span>
                  <span className="font-mono font-bold text-emerald-700">
                    ₹{editingCommissionCustomer.commissionReceived.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              <div>
                <label className="text-xs font-black text-slate-700 uppercase tracking-wider mb-1 block">
                  एकूण कमिशन रक्कम (Total Commission ₹) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-slate-400 font-bold">₹</span>
                  <input
                    type="number"
                    value={newTotalCommissionInput}
                    onChange={(e) => setNewTotalCommissionInput(e.target.value)}
                    placeholder="उदा. 1500 किंवा 2000"
                    className="w-full pl-8 pr-3 py-2.5 rounded-xl bg-white border border-slate-300 font-mono font-black text-sm text-slate-900 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition"
                    required
                    autoFocus
                  />
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  नोंद: कोणतेही कमिशन स्वयंचलित (Auto) लागू होत नाही. प्रत्येक ग्राहकाचे कमिशन कामाच्या स्वरूपानुसार Admin/Operator स्वतः मॅन्युअली ठरवू शकतात.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingCommissionCustomer(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
                >
                  रद्द करा (Cancel)
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-blue-900 hover:bg-blue-800 text-white font-bold text-xs shadow-md transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>कमिशन सेव्ह करा</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 2: RECORD COLLECTION FORM                                      */}
      {/* STRICT: ONLY 1. Collection Date, 2. Amount Received, 3. Receiving Acc */}
      {/* PAYMENT MODE & REMARKS ARE COMPLETELY REMOVED AS REQUESTED           */}
      {/* ==================================================================== */}
      {collectingCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4 animate-in fade-in duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-center">
                  <PlusCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    कमिशन रक्कम जमा करा (Record Collection)
                  </h3>
                  <p className="text-xs text-slate-500">
                    {collectingCustomer.customerName} ({collectingCustomer.mhNumber})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCollectingCustomer(null);
                  setCollectAccount('');
                  setCollectAmount('');
                  setCollectFollowUpStatus('');
                  setCollectFollowUpDate('');
                  setCollectNextFollowUpDate('');
                  setCollectFollowUpRemarks('');
                }}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Current Balance Summary Banner */}
            <div className="grid grid-cols-3 gap-2 p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-center text-xs">
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">
                  एकूण कमिशन
                </span>
                <span className="font-mono font-black text-blue-950 text-sm">
                  ₹{collectingCustomer.totalCommission.toLocaleString('en-IN')}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">
                  आतापर्यंत जमा
                </span>
                <span className="font-mono font-black text-emerald-700 text-sm">
                  ₹{collectingCustomer.commissionReceived.toLocaleString('en-IN')}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">
                  येणे बाकी
                </span>
                <span className="font-mono font-black text-amber-700 text-sm">
                  ₹{collectingCustomer.commissionPending.toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            {/* FORM: ONLY 3 FIELDS (NO PAYMENT MODE, NO REMARKS) */}
            <form onSubmit={handleSaveCollection} className="space-y-4">
              {/* Field 1: Collection Date */}
              <div>
                <label className="text-xs font-black text-slate-700 uppercase tracking-wider mb-1 block">
                  १. जमा तारीख (Collection Date) *
                </label>
                <div className="relative">
                  <input
                    type="date"
                    value={collectDate}
                    onChange={(e) => setCollectDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-medium text-xs text-slate-800 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition cursor-pointer"
                    required
                  />
                </div>
              </div>

              {/* Field 2: Amount Received */}
              <div>
                <label className="text-xs font-black text-slate-700 uppercase tracking-wider mb-1 block">
                  २. जमा रक्कम (Amount Received ₹) *
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-slate-400 font-bold text-sm">₹</span>
                  <input
                    type="number"
                    value={collectAmount}
                    onChange={(e) => setCollectAmount(e.target.value)}
                    placeholder="उदा. 1000"
                    className="w-full pl-8 pr-3.5 py-2.5 rounded-xl bg-white border border-emerald-300 font-mono font-black text-sm text-slate-900 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition"
                    required
                  />
                </div>
              </div>

              {/* Field 3: Receiving Account Dropdown with Management Option */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-black text-slate-700 uppercase tracking-wider block">
                    ३. जमा खाते (Receiving Account) *
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsAccountModalOpen(true)}
                    className="text-[11px] font-bold text-blue-700 hover:text-blue-900 flex items-center gap-1 cursor-pointer"
                  >
                    <Settings className="w-3 h-3" />
                    <span>खाती जोडा/बदला</span>
                  </button>
                </div>

                <select
                  value={collectAccount}
                  onChange={(e) => {
                    if (e.target.value === '__add_new__') {
                      setIsAccountModalOpen(true);
                    } else {
                      setCollectAccount(e.target.value);
                    }
                  }}
                  className={`w-full px-3.5 py-2.5 rounded-xl bg-white border font-medium text-xs transition cursor-pointer ${
                    !collectAccount
                      ? 'border-amber-400 text-slate-500 bg-amber-50/20'
                      : 'border-slate-300 text-slate-900 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600'
                  }`}
                  required
                >
                  <option value="" disabled hidden>
                    खाते निवडा
                  </option>
                  <option value="">-- खाते निवडा --</option>
                  {accounts
                    .filter((a) => a.isActive || a.name === collectAccount)
                    .map((acc) => (
                      <option key={acc.id} value={acc.name} className="text-slate-900 font-medium">
                        {acc.name}
                      </option>
                    ))}
                  <option value="__add_new__" className="font-bold text-blue-700">
                    + नवीन खाते जोडा (Add New Account)...
                  </option>
                </select>
                {!collectAccount ? (
                  <span className="text-[11px] text-amber-700 font-semibold mt-1 block">
                    * आवश्यक: कृपया वरील ड्रॉपडाऊनमधून जमा खाते निवडा.
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    (नोंद केल्याने कोणताही बँक किंवा कॅश बॅलन्स आपोआप बदलत नाही).
                  </span>
                )}
              </div>

              {/* Field 4: Follow-up Status Dropdown + Manage Status + Date + Next Date + Remarks + Save Follow-up */}
              <div className="p-3.5 rounded-2xl bg-slate-50/80 border border-slate-200 space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-black text-slate-700 uppercase tracking-wider block">
                      ४. Follow-up Status (फॉलो-अप स्थिती)
                    </label>
                    {canManageFollowupStatuses && (
                      <button
                        type="button"
                        onClick={() => setIsFollowupStatusModalOpen(true)}
                        className="text-[11px] font-bold text-blue-700 hover:text-blue-900 flex items-center gap-1 cursor-pointer"
                        title="Custom Follow-up Status जोडा, बदला किंवा हटवा"
                      >
                        <Settings className="w-3 h-3" />
                        <span>Manage Status (स्थिती व्यवस्था)</span>
                      </button>
                    )}
                  </div>
                  <select
                    value={collectFollowUpStatus}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCollectFollowUpStatus(val);
                      if (!collectFollowUpDate) {
                        setCollectFollowUpDate(new Date().toISOString().slice(0, 10));
                      }
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-bold text-xs text-slate-800 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 transition cursor-pointer"
                  >
                    <option value="">-- Follow-up स्थिती निवडा (ऐच्छिक) --</option>
                    {followupStatuses
                      .filter((s) => s.isActive)
                      .map((st) => (
                        <option key={st.id} value={st.name} className="text-slate-900 font-semibold">
                          {st.name === 'Called'
                            ? 'Called (कॉल केला)'
                            : st.name === 'No Answer'
                            ? 'No Answer (उत्तर नाही / उचलला नाही)'
                            : st.name === 'Will Pay'
                            ? 'Will Pay (पेमेंट करतील)'
                            : st.name === 'Paid'
                            ? 'Paid (पेमेंट झाले)'
                            : st.name === 'Contact Later'
                            ? 'Contact Later (नंतर संपर्क करा)'
                            : st.name}
                        </option>
                      ))}
                    {collectFollowUpStatus &&
                      !followupStatuses.some(
                        (s) => s.isActive && s.name.toLowerCase() === collectFollowUpStatus.toLowerCase()
                      ) && (
                        <option value={collectFollowUpStatus}>
                          {collectFollowUpStatus} (Saved)
                        </option>
                      )}
                  </select>
                </div>

                {/* Follow-up Date (Always editable when logging follow-up; never auto-overwritten) */}
                <div>
                  <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider mb-1 block">
                    Follow-up तारीख (Follow-up Date)
                  </label>
                  <input
                    type="date"
                    value={collectFollowUpDate}
                    onChange={(e) => setCollectFollowUpDate(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-white border border-slate-300 font-bold text-xs text-slate-800 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition cursor-pointer"
                  />
                </div>

                {/* Conditional Next Follow-up Date when Contact Later is selected */}
                {collectFollowUpStatus === 'Contact Later' && (
                  <div className="p-3 rounded-xl bg-purple-50/90 border border-purple-200 space-y-1.5 animate-in fade-in duration-150">
                    <label className="text-[11px] font-black text-purple-950 uppercase tracking-wider block">
                      पुढील Follow-up तारीख (Next Follow-up Date)
                    </label>
                    <input
                      type="date"
                      value={collectNextFollowUpDate}
                      onChange={(e) => setCollectNextFollowUpDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-white border border-purple-300 font-bold text-xs text-purple-950 focus:border-purple-600 focus:ring-1 focus:ring-purple-600 transition cursor-pointer"
                    />
                    <p className="text-[10px] text-purple-800 font-medium">
                      * ही तारीख कायमस्वरूपी जतन राहील (जमा तारीख बदलणार नाही).
                    </p>
                  </div>
                )}

                {/* Follow-up Remarks */}
                <div>
                  <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider mb-1 block">
                    Follow-up शेरा / टीप (Remarks)
                  </label>
                  <textarea
                    rows={2}
                    value={collectFollowUpRemarks}
                    onChange={(e) => setCollectFollowUpRemarks(e.target.value)}
                    placeholder="ग्राहकासोबत झालेल्या संभाषणाची टीप लिहा (ऐच्छिक)..."
                    className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 font-medium text-xs text-slate-800 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition resize-none"
                  />
                </div>

                {/* Separate Save Follow-up Button (Works independently regardless of Amount Received or Receiving Account) */}
                {collectFollowUpStatus && (
                  <div className="pt-1 flex items-center justify-between gap-2">
                    <span className="text-[10px] text-slate-500">
                      फक्त Follow-up सेव्ह केल्यास जमा रक्कम बदलणार नाही.
                    </span>
                    <button
                      type="button"
                      disabled={isSavingFollowup}
                      onClick={handleSaveFollowUpOnly}
                      className="px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-600 disabled:opacity-60 text-white font-bold text-xs shadow-sm transition flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                      title="जमा रक्कम किंवा खात्याशिवाय फक्त Follow-up स्थिती सेव्ह करा"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>{isSavingFollowup ? 'सेव्ह होत आहे...' : 'Follow-up सेव्ह करा'}</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Live Preview of New Pending Balance */}
              {parseFloat(collectAmount || '0') > 0 && (
                <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs flex justify-between items-center font-mono">
                  <span className="text-emerald-950 font-bold font-sans">जमा नंतर शिल्लक बाकी:</span>
                  <span className="font-black text-emerald-950 text-sm">
                    ₹{Math.max(
                      0,
                      collectingCustomer.totalCommission -
                        (collectingCustomer.commissionReceived + parseFloat(collectAmount || '0'))
                    ).toLocaleString('en-IN')}
                  </span>
                </div>
              )}

              {/* Form Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setCollectingCustomer(null);
                    setCollectAccount('');
                    setCollectAmount('');
                    setCollectFollowUpStatus('');
                    setCollectFollowUpDate('');
                    setCollectNextFollowUpDate('');
                    setCollectFollowUpRemarks('');
                  }}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer w-full sm:w-auto text-center"
                >
                  रद्द करा (Cancel)
                </button>

                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer w-full sm:w-auto"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>कमिशन जमा करा</span>
                </button>
              </div>
            </form>

            {/* Follow-up History Inside Record Collection Popup */}
            {(followupsByClaim[collectingCustomer.claimId]?.length || 0) > 0 && (
              <div className="pt-3 border-t border-slate-200 space-y-2">
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-purple-700" />
                  <span>मागील Follow-up इतिहास ({followupsByClaim[collectingCustomer.claimId].length})</span>
                </h4>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {followupsByClaim[collectingCustomer.claimId].map((fh) => (
                    <div
                      key={fh.id}
                      className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                          {fh.followUpStatus}
                        </span>
                        <span className="font-mono font-bold text-slate-600">
                          {formatDate(fh.followUpDate)}
                        </span>
                      </div>
                      {fh.nextFollowUpDate && (
                        <div className="text-[10px] font-bold text-purple-800">
                          पुढील Follow-up: {formatDate(fh.nextFollowUpDate)}
                        </div>
                      )}
                      {fh.remarks && (
                        <p className="text-slate-700 text-[11px] leading-snug">{fh.remarks}</p>
                      )}
                      <div className="flex items-center justify-between text-[10px] text-slate-400">
                        <span>Updated By: {fh.updatedBy}</span>
                        <span>{new Date(fh.updatedAt).toLocaleString('en-IN')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 3B: MANAGE FOLLOW-UP STATUSES (ADD, EDIT, SAFE DELETE)         */}
      {/* ==================================================================== */}
      {isFollowupStatusModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-5 animate-in zoom-in-95 duration-150 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-2xl bg-purple-50 border border-purple-200 text-purple-900 flex items-center justify-center">
                  <Settings className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    Follow-up स्थिती व्यवस्थापन (Manage Statuses)
                  </h3>
                  <p className="text-xs text-slate-500">
                    नवीन कस्टम स्थिती जोडा, नाव बदला (Edit) किंवा हटवा (Delete).
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsFollowupStatusModalOpen(false);
                  setEditingFollowupStatusId(null);
                  setFollowupStatusDeleteConfirm(null);
                }}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Add Custom Status Section */}
            <form onSubmit={handleAddFollowupStatus} className="space-y-2 p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
              <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block">
                + नवीन कस्टम Follow-up स्थिती जोडा
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newFollowupStatusInput}
                  onChange={(e) => setNewFollowupStatusInput(e.target.value)}
                  placeholder="उदा. Switched Off / Requested Callback..."
                  className="flex-1 px-3 py-2 rounded-xl bg-white border border-slate-300 font-medium text-xs text-slate-800 focus:border-purple-600 transition"
                />
                <button
                  type="submit"
                  disabled={isSavingFollowupStatus}
                  className="px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-600 disabled:opacity-60 text-white font-bold text-xs shadow-xs transition flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>जोडा</span>
                </button>
              </div>
            </form>

            {/* Existing Statuses List */}
            <div className="space-y-2">
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                उपलब्ध स्थिती ({followupStatuses.length})
              </h4>

              <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden bg-white">
                {followupStatuses.map((st) => (
                  <div key={st.id} className="p-3 flex items-center justify-between gap-2 hover:bg-slate-50">
                    {editingFollowupStatusId === st.id ? (
                      <div className="flex-1 flex items-center gap-2">
                        <input
                          type="text"
                          value={editingFollowupStatusName}
                          onChange={(e) => setEditingFollowupStatusName(e.target.value)}
                          className="flex-1 px-3 py-1.5 rounded-lg border border-blue-400 text-xs font-bold text-slate-800"
                        />
                        <button
                          type="button"
                          disabled={isSavingFollowupStatus}
                          onClick={() => handleSaveEditFollowupStatus(st.id)}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-700 text-white font-bold text-xs cursor-pointer"
                        >
                          सेव्ह
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingFollowupStatusId(null)}
                          className="px-2 py-1.5 rounded-lg bg-slate-200 text-slate-700 text-xs cursor-pointer"
                        >
                          रद्द
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4 text-slate-400" />
                          <span className="text-xs font-bold text-slate-800">{st.name}</span>
                          {st.isDefault ? (
                            <span className="text-[10px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 font-semibold">
                              Default
                            </span>
                          ) : (
                            <span className="text-[10px] text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200 font-semibold">
                              Custom
                            </span>
                          )}
                        </div>

                        {!st.isDefault && (
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingFollowupStatusId(st.id);
                                setEditingFollowupStatusName(st.name);
                              }}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-blue-700 hover:bg-blue-50 transition cursor-pointer"
                              title="नाव बदला"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setFollowupStatusDeleteConfirm(st)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-700 hover:bg-rose-50 transition cursor-pointer"
                              title="स्थिती हटवा"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Delete Confirmation Box */}
            {followupStatusDeleteConfirm && (
              <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 space-y-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="text-xs font-black text-rose-950 uppercase">
                      स्थिती हटवण्याची पुष्टी (Confirm Delete Status)
                    </h5>
                    <p className="text-xs text-rose-800 mt-0.5">
                      आपण खरोखर <strong>'{followupStatusDeleteConfirm.name}'</strong> ही स्थिती हटवू इच्छिता का?
                      (जर ही स्थिती आधीच्या Follow-up इतिहासात वापरली असेल तर जुना इतिहास जतन राहून ती फक्त निष्क्रिय केली जाईल).
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setFollowupStatusDeleteConfirm(null)}
                    className="px-3 py-1.5 rounded-lg bg-white border border-rose-200 text-xs font-bold text-slate-700 cursor-pointer"
                  >
                    रद्द करा
                  </button>
                  <button
                    type="button"
                    disabled={isSavingFollowupStatus}
                    onClick={handleConfirmDeleteFollowupStatus}
                    className="px-4 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-600 text-white font-bold text-xs shadow-xs cursor-pointer"
                  >
                    होय, हटवा
                  </button>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setIsFollowupStatusModalOpen(false);
                  setEditingFollowupStatusId(null);
                  setFollowupStatusDeleteConfirm(null);
                }}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
              >
                पूर्ण झाले (Done)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 3: RECEIVING ACCOUNT DROPDOWN MANAGEMENT                       */}
      {/* (ADD, EDIT, DELETE / DEACTIVATE WITH PERMISSION & PERSISTENCE)      */}
      {/* ==================================================================== */}
      {isAccountModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-5 animate-in zoom-in-95 duration-150 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-200 text-blue-900 flex items-center justify-center">
                  <Settings className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    जमा खाती व्यवस्थापन (Receiving Account Management)
                  </h3>
                  <p className="text-xs text-slate-500">
                    नवीन खाते जोडा, नाव बदला (Edit) किंवा नको असलेले खाते हटवा (Delete).
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsAccountModalOpen(false);
                  setEditingAccountId(null);
                  setAccountDeleteConfirm(null);
                }}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Add Account Section */}
            <form onSubmit={handleAddAccount} className="space-y-2 p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
              <label className="text-[11px] font-black text-slate-700 uppercase tracking-wider block">
                + नवीन खाते जोडा (Add New Account)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newAccountInput}
                  onChange={(e) => setNewAccountInput(e.target.value)}
                  placeholder="उदा. Shop UPI QR / ICICI Bank..."
                  className="flex-1 px-3 py-2 rounded-xl bg-white border border-slate-300 font-medium text-xs text-slate-800 focus:border-blue-600 transition"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-900 hover:bg-blue-800 text-white font-bold text-xs shadow-xs transition flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>जोडा</span>
                </button>
              </div>
            </form>

            {/* Existing Accounts List */}
            <div className="space-y-2">
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                उपलब्ध खाती ({accounts.length})
              </h4>

              <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden bg-white">
                {accounts.map((acc) => (
                  <div key={acc.id} className="p-3 flex items-center justify-between gap-2 hover:bg-slate-50">
                    {editingAccountId === acc.id ? (
                      <div className="flex-1 flex items-center gap-2">
                        <input
                          type="text"
                          value={editingAccountName}
                          onChange={(e) => setEditingAccountName(e.target.value)}
                          className="flex-1 px-3 py-1.5 rounded-lg border border-blue-400 text-xs font-bold text-slate-800"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveEditAccount(acc.id)}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-700 text-white font-bold text-xs cursor-pointer"
                        >
                          सेव्ह
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingAccountId(null)}
                          className="px-2 py-1.5 rounded-lg bg-slate-200 text-slate-700 text-xs cursor-pointer"
                        >
                          रद्द
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-slate-400" />
                          <span className="text-xs font-bold text-slate-800">{acc.name}</span>
                          {!acc.isActive && (
                            <span className="text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                              निष्क्रिय (Inactive)
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {/* Edit Button */}
                          <button
                            type="button"
                            onClick={() => {
                              setEditingAccountId(acc.id);
                              setEditingAccountName(acc.name);
                            }}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-blue-700 hover:bg-blue-50 transition cursor-pointer"
                            title="नाव बदला"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete Button */}
                          <button
                            type="button"
                            onClick={() => setAccountDeleteConfirm(acc)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-700 hover:bg-rose-50 transition cursor-pointer"
                            title="खाते हटवा"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Delete Confirmation Popup */}
            {accountDeleteConfirm && (
              <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 space-y-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div>
                    <h5 className="text-xs font-black text-rose-950 uppercase">
                      खाते हटवण्याची पुष्टी (Confirm Account Deletion)
                    </h5>
                    <p className="text-xs text-rose-800 mt-0.5">
                      आपण खरोखर <strong>'{accountDeleteConfirm.name}'</strong> हे खाते हटवू इच्छिता का?
                      (आधीच्या जमा नोंदी सुरक्षित राहतील).
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setAccountDeleteConfirm(null)}
                    className="px-3 py-1.5 rounded-lg bg-white border border-rose-200 text-xs font-bold text-slate-700 cursor-pointer"
                  >
                    रद्द करा
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmDeleteAccount}
                    className="px-4 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-600 text-white font-bold text-xs shadow-xs cursor-pointer"
                  >
                    होय, हटवा
                  </button>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setIsAccountModalOpen(false);
                  setEditingAccountId(null);
                  setAccountDeleteConfirm(null);
                }}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
              >
                पूर्ण झाले (Done)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 4: COLLECTION HISTORY (STRICT: DATE, AMOUNT, RECEIVING ACC)    */}
      {/* ==================================================================== */}
      {viewHistoryCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-xl w-full p-6 space-y-5 animate-in fade-in duration-150 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-900 flex items-center justify-center">
                  <History className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    कमिशन वसुली इतिहास (Collection History)
                  </h3>
                  <p className="text-xs text-slate-500">
                    {viewHistoryCustomer.customerName} • MH: {viewHistoryCustomer.mhNumber} • List No: {viewHistoryCustomer.listNumber}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewHistoryCustomer(null)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Balances */}
            <div className="grid grid-cols-3 gap-2 p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-center text-xs">
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">
                  एकूण कमिशन
                </span>
                <span className="font-mono font-black text-blue-950 text-sm">
                  ₹{viewHistoryCustomer.totalCommission.toLocaleString('en-IN')}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">
                  जमा झालेली रक्कम
                </span>
                <span className="font-mono font-black text-emerald-700 text-sm">
                  ₹{viewHistoryCustomer.commissionReceived.toLocaleString('en-IN')}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-bold block">
                  शिल्लक बाकी
                </span>
                <span className="font-mono font-black text-amber-700 text-sm">
                  ₹{viewHistoryCustomer.commissionPending.toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            {/* Section 6 Collection History: Date, Amount Received, Receiving Account */}
            <div className="space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Wallet className="w-4 h-4 text-emerald-700" />
                  <span>हप्तेनिहाय जमा नोंदी (Collections Records)</span>
                </h4>
                {viewHistoryCustomer.collections && viewHistoryCustomer.collections.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleExportIndividualHistory(viewHistoryCustomer)}
                    className="px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                    title="या ग्राहकाचा वसुली इतिहास एक्सेलमध्ये डाऊनलोड करा"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-100" />
                    <span>इतिहास एक्सेल (.xlsx)</span>
                  </button>
                )}
              </div>

              {(!viewHistoryCustomer.collections || viewHistoryCustomer.collections.length === 0) ? (
                <p className="text-xs text-slate-400 italic p-4 bg-slate-50 rounded-xl text-center">
                  कोणतीही जमा रक्कम नोंदवलेली नाही.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 text-slate-700 font-bold text-[10px] uppercase">
                      <tr>
                        <th className="py-2.5 px-3">१. जमा तारीख</th>
                        <th className="py-2.5 px-3 text-right">२. जमा रक्कम</th>
                        <th className="py-2.5 px-3">३. जमा खाते (Receiving Account)</th>
                        <th className="py-2.5 px-3">४. नोंदणीकर्ता</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {viewHistoryCustomer.collections.map((col) => (
                        <tr key={col.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 text-slate-600 font-mono">
                            {formatDate(col.date)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">
                            ₹{col.amount.toLocaleString('en-IN')}
                          </td>
                          <td className="py-2.5 px-3 text-slate-800 font-semibold">
                            {col.receivingAccount}
                          </td>
                          <td className="py-2.5 px-3 text-slate-500">
                            {col.collectedBy}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Follow-up History Section inside Collection History Modal */}
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Phone className="w-4 h-4 text-purple-700" />
                <span>Follow-up इतिहास (Follow-up History)</span>
              </h4>

              {(followupsByClaim[viewHistoryCustomer.claimId]?.length || 0) === 0 ? (
                <p className="text-xs text-slate-400 italic p-4 bg-slate-50 rounded-xl text-center">
                  कोणताही Follow-up इतिहास नोंदवलेला नाही.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 text-slate-700 font-bold text-[10px] uppercase">
                      <tr>
                        <th className="py-2.5 px-3">Follow-up Date</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">Next Date</th>
                        <th className="py-2.5 px-3">Remarks</th>
                        <th className="py-2.5 px-3">Updated By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {followupsByClaim[viewHistoryCustomer.claimId].map((fh) => (
                        <tr key={fh.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 text-slate-700 font-mono whitespace-nowrap">
                            {formatDate(fh.followUpDate)}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-slate-900">
                            {fh.followUpStatus}
                          </td>
                          <td className="py-2.5 px-3 text-purple-800 font-mono whitespace-nowrap">
                            {fh.nextFollowUpDate ? formatDate(fh.nextFollowUpDate) : '-'}
                          </td>
                          <td className="py-2.5 px-3 text-slate-700">
                            {fh.remarks || '-'}
                          </td>
                          <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                            <div>{fh.updatedBy}</div>
                            <div className="text-[10px] text-slate-400">
                              {new Date(fh.updatedAt).toLocaleString('en-IN')}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              {viewHistoryCustomer.collections && viewHistoryCustomer.collections.length > 0 ? (
                <button
                  type="button"
                  onClick={() => handleExportIndividualHistory(viewHistoryCustomer)}
                  className="px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                  title="या ग्राहकाचा संपूर्ण वसुली इतिहास एक्सेलमध्ये डाऊनलोड करा"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-100" />
                  <span>इतिहास एक्सेल (.xlsx)</span>
                </button>
              ) : <div />}

              <button
                type="button"
                onClick={() => setViewHistoryCustomer(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
              >
                बंद करा (Close)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* FEATURE 2 MODAL: ACCOUNT COLLECTION DETAILS MODAL (CLICK ON ACCOUNT)  */}
      {/* ==================================================================== */}
      {selectedAccountForDetails && (() => {
        const q = accountDetailsSearch.trim().toLowerCase();
        const filteredEntries = selectedAccountForDetails.entries.filter((entry) => {
          if (!q) return true;
          return (
            entry.customerName.toLowerCase().includes(q) ||
            entry.mhNumber.toLowerCase().includes(q) ||
            entry.listNumber.toLowerCase().includes(q) ||
            entry.date.includes(q) ||
            entry.collectedBy.toLowerCase().includes(q)
          );
        });

        const totalFilteredAmount = filteredEntries.reduce((sum, e) => sum + Number(e.amount || 0), 0);

        return (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-4xl w-full p-6 space-y-4 animate-in fade-in duration-150 max-h-[90vh] overflow-y-auto flex flex-col">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-blue-50 border border-blue-200 text-blue-900 flex items-center justify-center shrink-0">
                    <Building2 className="w-6 h-6 text-blue-900" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base sm:text-lg font-black text-slate-900">
                        {selectedAccountForDetails.accountName}
                      </h3>
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 text-xs font-black font-mono">
                        एकूण जमा: ₹{selectedAccountForDetails.totalAmount.toLocaleString('en-IN')}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-bold">
                        {selectedAccountForDetails.totalEntries} नोंदी
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      या खात्यामध्ये प्रत्यक्ष जमा झालेल्या सर्व कमिशन वसुली नोंदी (Collection Ledger)
                      {activeListScope === 'ALL' ? ' • सर्व याद्या (All Lists)' : ` • यादी क्र. ${activeListScope}`}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedAccountForDetails(null)}
                  className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition cursor-pointer self-start sm:self-auto"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Search & Actions Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                  <input
                    type="text"
                    value={accountDetailsSearch}
                    onChange={(e) => setAccountDetailsSearch(e.target.value)}
                    placeholder="ग्राहक नाव, MH क्रमांक किंवा यादी क्र. शोधा..."
                    className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-300 font-medium text-xs text-slate-800 focus:bg-white focus:border-blue-600 transition"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => handleExportAccountLedger(selectedAccountForDetails)}
                  className="px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs shadow-xs transition flex items-center gap-1.5 cursor-pointer shrink-0"
                  title="या खात्याचे संपूर्ण लेजर एक्सेलमध्ये (.xlsx) डाऊनलोड करा"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-100" />
                  <span>खाते लेजर एक्सेल (.xlsx)</span>
                </button>
              </div>

              {/* Entries Table */}
              <div className="overflow-x-auto rounded-2xl border border-slate-200 flex-1 max-h-96 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 text-slate-700 font-bold text-[10px] uppercase sticky top-0 z-10 border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3 w-10 text-center">#</th>
                      <th className="py-2.5 px-3">Collection Date (तारीख)</th>
                      <th className="py-2.5 px-3">Customer Name (नाव)</th>
                      <th className="py-2.5 px-3">MH Number</th>
                      <th className="py-2.5 px-3 text-center">List No</th>
                      <th className="py-2.5 px-3 text-right">Amount Received (रक्कम ₹)</th>
                      <th className="py-2.5 px-3">Collected By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {filteredEntries.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-400 text-xs">
                          {selectedAccountForDetails.entries.length === 0
                            ? 'या खात्यामध्ये अद्याप कोणतीही कमिशन जमा नोंद झालेली नाही.'
                            : 'शोध निकषांशी जुळणारी कोणतीही नोंद सापडली नाही.'}
                        </td>
                      </tr>
                    ) : (
                      filteredEntries.map((entry, idx) => (
                        <tr key={entry.collectionId || idx} className="hover:bg-slate-50 transition">
                          <td className="py-2.5 px-3 text-center font-mono text-slate-400 text-[11px]">
                            {idx + 1}
                          </td>
                          <td className="py-2.5 px-3 font-medium text-slate-800">
                            {formatDate(entry.date)}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-slate-900">
                            {entry.customerName}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-blue-900">
                            {entry.mhNumber}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-700">
                            {entry.listNumber}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-black text-emerald-700">
                            ₹{entry.amount.toLocaleString('en-IN')}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 text-[11px]">
                            {entry.collectedBy}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Footer */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-100">
                <span className="text-xs font-medium text-slate-500">
                  दाखवत आहे: <strong className="text-slate-800 font-bold">{filteredEntries.length}</strong> नोंदी | एकूण रक्कम:{' '}
                  <strong className="text-emerald-700 font-mono font-black">₹{totalFilteredAmount.toLocaleString('en-IN')}</strong>
                </span>

                <button
                  type="button"
                  onClick={() => setSelectedAccountForDetails(null)}
                  className="px-5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
                >
                  बंद करा (Close)
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
