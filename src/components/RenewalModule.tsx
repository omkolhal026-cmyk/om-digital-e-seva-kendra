import React, { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  RefreshCw,
  Search,
  Plus,
  Printer,
  Download,
  X,
  CheckCircle2,
  Clock,
  Edit,
  Trash2,
  RotateCcw,
  Save,
  Check,
  UserCheck,
  Filter,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  Eye,
  Calendar,
  AlertCircle,
  CheckSquare,
  AlertTriangle,
  ArrowLeftRight,
  Copy,
} from 'lucide-react';
import { WorkerRenewal, WorkerRegistration, User } from '../types';
import { VERIFICATION_TALUKAS } from '../data/mockData';
import { FromSourceFilterSelect } from './FromSourceFilterSelect';
import { UiverseCheckbox } from './UiverseCheckbox';
import { TableSlideControls } from './TableSlideControls';
import { UiverseButton } from './UiverseButton';
import {
  exportToCSV,
  formatDate,
  normalizeDateToYMD,
  formatDateWithMarathi,
  swapDateAndMonth,
  parseExcelDateStrict,
  DateParseOptions,
} from '../utils/exportUtils';
import {
  normalizeRenewalYear,
  getFinancialYearFromDate,
  getNextRenewalYear,
  compareRenewalYearsDesc,
} from '../utils/renewalYearUtils';

interface RenewalModuleProps {
  renewals: WorkerRenewal[];
  registrations: WorkerRegistration[];
  currentUser: User;
  users?: User[];
  onAddRenewal: (ren: Omit<WorkerRenewal, 'id'>) => Promise<void>;
  onAddRenewalsBulk?: (ren: Omit<WorkerRenewal, 'id'>[]) => Promise<any>;
  onUpdateRenewal?: (id: string, updatedFields: Partial<WorkerRenewal>) => Promise<void>;
  onDeleteRenewal?: (id: string) => Promise<void>;
  onDeleteRenewalsBulk?: (ids: string[]) => Promise<void>;
  onOpenPrintSlip: (type: 'renewal', data: any) => void;
  onClearRenewals?: () => void;
}

export const RenewalModule: React.FC<RenewalModuleProps> = ({
  renewals,
  registrations,
  currentUser,
  users = [],
  onAddRenewal,
  onAddRenewalsBulk,
  onUpdateRenewal,
  onDeleteRenewal,
  onDeleteRenewalsBulk,
  onOpenPrintSlip,
  onClearRenewals,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [talukaFilter, setTalukaFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [operatorFilter, setOperatorFilter] = useState('');
  const [fromSourceFilter, setFromSourceFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCustomOperator, setIsCustomOperator] = useState(false);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<{ id: string; name: string } | null>(null);
  const [viewDetailsRen, setViewDetailsRen] = useState<WorkerRenewal | null>(null);
  const [copiedMh, setCopiedMh] = useState<string | null>(null);

  const handleCopyMh = (mh: string) => {
    if (!mh) return;
    const clean = mh.trim();
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(clean).catch(() => {});
    }
    setCopiedMh(clean);
    setTimeout(() => {
      setCopiedMh((prev) => (prev === clean ? null : prev));
    }, 2000);
  };
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteModal, setBulkDeleteModal] = useState<{
    isOpen: boolean;
    ids: string[];
    title: string;
    description: string;
    sampleNames: string[];
  } | null>(null);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  const operatorOptions = React.useMemo(() => {
    const list = new Set<string>();
    if (currentUser?.name) list.add(currentUser.name);
    if (users && users.length > 0) {
      users.forEach((u) => {
        if (u.name) list.add(u.name);
      });
    }
    renewals.forEach((r) => {
      if (r.operatorName) list.add(r.operatorName);
    });
    return Array.from(list).filter(Boolean).sort();
  }, [users, currentUser?.name, renewals]);

  const getTodayDate = () => new Date().toISOString().split('T')[0];

  const defaultFormData = {
    workerName: '',
    mhNumber: '',
    aadhaarNumber: '',
    mobileNumber: '',
    verificationDate: '',
    renewalDate: getTodayDate(),
    renewalYear: '',
    taluka: '',
    fromSource: '',
    operatorName: currentUser.name,
    status: 'Pending' as 'Pending' | 'Active',
    paymentAmount: undefined as number | undefined,
    paymentMode: 'Cash' as 'Cash' | 'Online' | 'N/A',
  };

  const [formData, setFormData] = useState(defaultFormData);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Renewal History & Worker Search States
  const [workerHistory, setWorkerHistory] = useState<WorkerRenewal[]>([]);
  const [lastRenewalYear, setLastRenewalYear] = useState<string | null>(null);
  const [nextRenewalYear, setNextRenewalYear] = useState<string>('');
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [quickSearchInput, setQuickSearchInput] = useState('');
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  // Available Renewal Years (dynamic list based on current financial year)
  const availableRenewalYears = React.useMemo(() => {
    const currentFY = getFinancialYearFromDate(new Date());
    const currentStart = parseInt(currentFY.slice(0, 4), 10) || new Date().getFullYear();
    const years: string[] = [];
    for (let y = currentStart - 3; y <= currentStart + 5; y++) {
      const endShort = String((y + 1) % 100).padStart(2, '0');
      years.push(`${y}-${endShort}`);
    }
    if (nextRenewalYear && !years.includes(nextRenewalYear)) {
      years.push(nextRenewalYear);
    }
    if (formData.renewalYear && !years.includes(formData.renewalYear)) {
      years.push(formData.renewalYear);
    }
    return years.sort(compareRenewalYearsDesc).reverse(); // chronological order
  }, [nextRenewalYear, formData.renewalYear]);

  // Fetch worker renewal history from backend API
  const fetchWorkerHistory = async (params: {
    mhNumber?: string;
    aadhaarNumber?: string;
    mobileNumber?: string;
    identifier?: string;
  }) => {
    const mh = params.mhNumber?.trim();
    const aadhaar = params.aadhaarNumber?.trim();
    const mobile = params.mobileNumber?.trim();
    const ident = params.identifier?.trim();

    if (!mh && !aadhaar && !mobile && !ident) return;

    setIsLoadingHistory(true);
    try {
      const query = new URLSearchParams();
      if (mh) query.set('mhNumber', mh);
      if (aadhaar) query.set('aadhaarNumber', aadhaar);
      if (mobile) query.set('mobileNumber', mobile);
      if (ident) query.set('identifier', ident);

      const res = await fetch(`/api/renewals/history?${query.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const historyList: WorkerRenewal[] = Array.isArray(data.renewals) ? data.renewals : [];
        setWorkerHistory(historyList);
        setLastRenewalYear(data.lastRenewalYear || null);
        setNextRenewalYear(data.nextRenewalYear || '');

        // Auto-fill worker details and auto-select next eligible renewal year
        if (data.worker) {
          setFormData((prev) => ({
            ...prev,
            workerName: data.worker.workerName || prev.workerName,
            mhNumber: data.worker.mhNumber || prev.mhNumber,
            aadhaarNumber: data.worker.aadhaarNumber || prev.aadhaarNumber,
            mobileNumber: data.worker.mobileNumber || prev.mobileNumber,
            taluka: VERIFICATION_TALUKAS.includes(data.worker.taluka) ? data.worker.taluka : prev.taluka,
            fromSource: data.worker.fromSource || prev.fromSource,
            verificationDate: prev.verificationDate || data.worker.verificationDate || '',
            renewalYear: editingId ? prev.renewalYear : (data.nextRenewalYear || prev.renewalYear || getFinancialYearFromDate(new Date())),
          }));
        } else if (data.nextRenewalYear && !editingId) {
          setFormData((prev) => ({
            ...prev,
            renewalYear: data.nextRenewalYear,
          }));
        }
      }
    } catch (err) {
      console.error('Error fetching worker renewal history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Duplicate Renewal Protection Warning
  useEffect(() => {
    if (!formData.renewalYear) {
      setDuplicateWarning(null);
      return;
    }
    const norm = normalizeRenewalYear(formData.renewalYear);
    const isDup = workerHistory.some(
      (h) =>
        normalizeRenewalYear(h.renewalYear || getFinancialYearFromDate(h.renewalDate)) === norm &&
        h.id !== editingId
    );
    if (isDup) {
      setDuplicateWarning(
        `This renewal year (${formData.renewalYear}) is already completed. (या कामगारासाठी ${formData.renewalYear} चे नूतनीकरण आधीच पूर्ण झाले आहे!)`
      );
      return;
    }

    setDuplicateWarning(null);
  }, [formData.renewalYear, workerHistory, editingId]);

  // Quick search button / enter trigger
  const handleQuickSearchWorker = (val?: string) => {
    const term = (val !== undefined ? val : quickSearchInput).trim();
    if (!term) return;

    // Instant client-side registrations check for zero-lag autofill
    const cleanTerm = term.toUpperCase().replace(/[\s-]/g, '');
    const cleanDigits = term.replace(/\D/g, '');
    const matched = registrations.find(
      (r) =>
        r.mhNumber.toUpperCase().replace(/[\s-]/g, '') === cleanTerm ||
        (r.aadhaarNumber && r.aadhaarNumber.replace(/\D/g, '') === cleanDigits) ||
        r.mobileNumber === cleanDigits
    );
    if (matched) {
      setFormData((prev) => ({
        ...prev,
        workerName: matched.workerName || prev.workerName,
        mhNumber: matched.mhNumber || prev.mhNumber,
        aadhaarNumber: matched.aadhaarNumber || prev.aadhaarNumber,
        mobileNumber: matched.mobileNumber || prev.mobileNumber,
        taluka: VERIFICATION_TALUKAS.includes(matched.taluka) ? matched.taluka : prev.taluka,
        fromSource: matched.fromSource || prev.fromSource,
        verificationDate: prev.verificationDate || matched.verificationDate || '',
      }));
    }

    fetchWorkerHistory({ identifier: term });
  };

  // Auto-fill from registration records when typing MH Number
  const handleMhLookup = (value: string) => {
    let upper = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    let formatted = upper;

    if (upper.startsWith('MH')) {
      const digits = upper.slice(2).replace(/\D/g, '').slice(0, 12);
      formatted = 'MH' + digits;
    } else if (/^\d/.test(upper)) {
      const digits = upper.replace(/\D/g, '').slice(0, 12);
      formatted = 'MH' + digits;
    } else {
      formatted = upper.slice(0, 14);
    }

    setFormData((prev) => ({ ...prev, mhNumber: formatted }));

    const clean = formatted.trim().toUpperCase().replace(/[\s-]/g, '');
    if (clean.length >= 8) {
      const matched = registrations.find(
        (r) => r.mhNumber.toUpperCase().replace(/[\s-]/g, '') === clean
      );
      if (matched) {
        setFormData((prev) => ({
          ...prev,
          workerName: matched.workerName || prev.workerName,
          mhNumber: matched.mhNumber || prev.mhNumber,
          aadhaarNumber: matched.aadhaarNumber || prev.aadhaarNumber,
          mobileNumber: matched.mobileNumber || prev.mobileNumber,
          taluka: VERIFICATION_TALUKAS.includes(matched.taluka) ? matched.taluka : prev.taluka,
          fromSource: matched.fromSource || prev.fromSource,
          verificationDate: prev.verificationDate || matched.verificationDate || '',
        }));
      }

      if (clean.length === 14) {
        fetchWorkerHistory({ mhNumber: formatted });
      }
    }
  };

  // Auto-lookup when typing Aadhaar Number
  const handleAadhaarLookup = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 12);
    setFormData((prev) => ({ ...prev, aadhaarNumber: digits }));

    if (digits.length === 12) {
      const matched = registrations.find(
        (r) => r.aadhaarNumber && r.aadhaarNumber.replace(/\D/g, '') === digits
      );
      if (matched) {
        setFormData((prev) => ({
          ...prev,
          workerName: matched.workerName || prev.workerName,
          mhNumber: matched.mhNumber || prev.mhNumber,
          mobileNumber: matched.mobileNumber || prev.mobileNumber,
          taluka: VERIFICATION_TALUKAS.includes(matched.taluka) ? matched.taluka : prev.taluka,
          fromSource: matched.fromSource || prev.fromSource,
          verificationDate: prev.verificationDate || matched.verificationDate || '',
        }));
      }
      fetchWorkerHistory({ aadhaarNumber: digits });
    }
  };

  // Auto-lookup when typing Mobile Number
  const handleMobileLookup = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 10);
    setFormData((prev) => ({ ...prev, mobileNumber: digits }));

    if (digits.length === 10) {
      const matched = registrations.find((r) => r.mobileNumber === digits);
      if (matched) {
        setFormData((prev) => ({
          ...prev,
          workerName: matched.workerName || prev.workerName,
          mhNumber: matched.mhNumber || prev.mhNumber,
          aadhaarNumber: matched.aadhaarNumber || prev.aadhaarNumber,
          taluka: VERIFICATION_TALUKAS.includes(matched.taluka) ? matched.taluka : prev.taluka,
          fromSource: matched.fromSource || prev.fromSource,
          verificationDate: prev.verificationDate || matched.verificationDate || '',
        }));
      }
      if (!formData.mhNumber) {
        fetchWorkerHistory({ mobileNumber: digits });
      }
    }
  };

  const handleReset = () => {
    setFormData({
      ...defaultFormData,
      verificationDate: '',
      renewalDate: getTodayDate(),
      renewalYear: getFinancialYearFromDate(new Date()),
      taluka: '',
      operatorName: currentUser.name,
    });
    setValidationErrors({});
    setWorkerHistory([]);
    setLastRenewalYear(null);
    setNextRenewalYear('');
    setQuickSearchInput('');
    setDuplicateWarning(null);
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    // 1. Full Name Required
    if (!formData.workerName.trim()) {
      errors.workerName = 'Full Name is required';
    }

    // 2. MH Registration Number Required (Must start with "MH" + Exactly 12 Digits = 14 chars total)
    const mhClean = formData.mhNumber.trim().toUpperCase().replace(/[\s-]/g, '');
    const mhDigits = mhClean.replace(/^MH/i, '').replace(/\D/g, '');
    const mhRegex = /^MH\d{12}$/;
    if (!formData.mhNumber.trim()) {
      errors.mhNumber = 'MH Registration Number is required';
    } else if (mhDigits.length !== 12 || !mhRegex.test(mhClean)) {
      errors.mhNumber = 'MH Registration Number must have EXACTLY 12 digits after MH (e.g. MH123456789012)';
    }

    // 3. Aadhaar Number (Optional or 12 digits)
    if (formData.aadhaarNumber && formData.aadhaarNumber.trim().length > 0) {
      const aClean = formData.aadhaarNumber.trim().replace(/\D/g, '');
      if (aClean.length !== 12) {
        errors.aadhaarNumber = 'Aadhaar Number must be exactly 12 digits';
      }
    }

    // 4. Mobile Number Required (Numeric Only, Exactly 10 Digits)
    const mobileClean = formData.mobileNumber.trim();
    if (!mobileClean) {
      errors.mobileNumber = 'Mobile Number is required';
    } else if (!/^\d{10}$/.test(mobileClean)) {
      errors.mobileNumber = 'Mobile Number must be exactly 10 digits';
    }

    // 5. Verification Date Required
    if (!formData.verificationDate) {
      errors.verificationDate = 'Verification Date is required';
    }

    // 6. Verification Taluka Required
    if (!formData.taluka) {
      errors.taluka = 'Verification Taluka is required';
    }

    // 7. From Required
    if (!formData.fromSource.trim()) {
      errors.fromSource = 'From field is required';
    }

    // 8. Renewal Year Required
    if (!formData.renewalYear) {
      errors.renewalYear = 'Renewal Year is required';
    } else {
      // Duplicate Renewal Check
      const norm = normalizeRenewalYear(formData.renewalYear);
      const isDup = workerHistory.some(
        (h) =>
          normalizeRenewalYear(h.renewalYear || getFinancialYearFromDate(h.renewalDate)) === norm &&
          h.id !== editingId
      );
      if (isDup) {
        const confirmSave = window.confirm(
          `या कामगारासाठी ${formData.renewalYear} चे नूतनीकरण आधीच पूर्ण झालेले आहे.\nतरीही तुम्हाला ही नोंद सेव्ह करायची आहे का? (This renewal year is already completed. Do you still want to proceed?)`
        );
        if (!confirmSave) {
          errors.renewalYear = `This renewal year (${formData.renewalYear}) is already completed. (या कामगारासाठी ${formData.renewalYear} चे नूतनीकरण आधीच पूर्ण झाले आहे!)`;
        }
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async (
    targetStatus?: 'Pending' | 'Active',
    shouldPrintAfterSave: boolean = false
  ) => {
    if (!validate()) return;

    const finalStatus = targetStatus || formData.status;
    const norm = normalizeRenewalYear(formData.renewalYear);
    const isDup = workerHistory.some(
      (h) =>
        normalizeRenewalYear(h.renewalYear || getFinancialYearFromDate(h.renewalDate)) === norm &&
        h.id !== editingId
    );

    const effPaymentAmount = formData.paymentMode === 'N/A'
      ? 0
      : (formData.paymentAmount !== undefined && formData.paymentAmount !== null && !isNaN(Number(formData.paymentAmount)) 
          ? Number(formData.paymentAmount) 
          : ((formData as any).feeAmount ? Number((formData as any).feeAmount) : 50));

    const payload: Omit<WorkerRenewal, 'id'> & { allowDuplicate?: boolean } = {
      workerName: formData.workerName.trim(),
      mhNumber: formData.mhNumber.trim().toUpperCase(),
      aadhaarNumber: formData.aadhaarNumber?.trim() || undefined,
      mobileNumber: formData.mobileNumber.trim(),
      verificationDate: formData.verificationDate,
      renewalDate: formData.renewalDate || getTodayDate(),
      renewalYear: formData.renewalYear || getFinancialYearFromDate(formData.renewalDate),
      taluka: formData.taluka,
      fromSource: formData.fromSource.trim(),
      operatorName: formData.operatorName || currentUser.name,
      status: finalStatus,
      feeAmount: effPaymentAmount,
      paymentAmount: effPaymentAmount,
      paymentMode: formData.paymentMode || 'Cash',
      allowDuplicate: isDup,
      createdByUserId: currentUser.id,
      createdBy: currentUser.name || currentUser.username,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setSubmitting(true);
    try {
      if (editingId && onUpdateRenewal) {
        await onUpdateRenewal(editingId, payload);
        if (shouldPrintAfterSave) {
          onOpenPrintSlip('renewal', { id: editingId, ...payload });
        }
      } else {
        await onAddRenewal(payload);
        if (shouldPrintAfterSave) {
          onOpenPrintSlip('renewal', payload);
        }
      }
      setIsModalOpen(false);
      handleReset();
      setEditingId(null);
    } catch (err: any) {
      alert(err.message || 'Error saving renewal record');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (id: string, name: string) => {
    setDeleteConfirmItem({ id, name });
  };

  const handleEdit = (ren: WorkerRenewal) => {
    setEditingId(ren.id);
    const existingYear = ren.renewalYear || getFinancialYearFromDate(ren.renewalDate);
    setFormData({
      workerName: ren.workerName,
      mhNumber: ren.mhNumber,
      aadhaarNumber: ren.aadhaarNumber || '',
      mobileNumber: ren.mobileNumber,
      verificationDate: ren.verificationDate,
      renewalDate: ren.renewalDate || getTodayDate(),
      renewalYear: existingYear,
      taluka: ren.taluka || 'Junnar',
      fromSource: ren.fromSource || '',
      operatorName: ren.operatorName || currentUser.name,
      status: ren.status === 'Active' ? 'Active' : 'Pending',
      paymentAmount: ren.paymentAmount,
      paymentMode: ren.paymentMode || 'Cash',
    });
    setValidationErrors({});
    setIsModalOpen(true);
    // Fetch history for this worker
    fetchWorkerHistory({ mhNumber: ren.mhNumber });
  };

  const openNewModal = () => {
    setEditingId(null);
    handleReset();
    setIsModalOpen(true);
  };

  const uniqueOperators = Array.from(
    new Set(renewals.map((r) => r.operatorName).filter(Boolean))
  ).sort();

  const fromSourceOptions = React.useMemo(() => {
    const set = new Set<string>();
    renewals.forEach((r) => {
      if (r.fromSource?.trim()) set.add(r.fromSource.trim());
    });
    return Array.from(set).sort();
  }, [renewals]);

  // Filtered List
  const filteredRenewals = renewals.filter((r) => {
    const matchesSearch =
      r.workerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.mhNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.mobileNumber.includes(searchTerm) ||
      (r.fromSource && r.fromSource.toLowerCase().includes(searchTerm.toLowerCase())) ||
      r.id.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesTaluka = !talukaFilter || r.taluka === talukaFilter;
    const matchesStatus = !statusFilter || r.status === statusFilter;
    const matchesOperator = !operatorFilter || r.operatorName === operatorFilter;
    const matchesFromSource =
      !fromSourceFilter ||
      Boolean(r.fromSource && r.fromSource.toLowerCase().includes(fromSourceFilter.trim().toLowerCase()));
    const matchesFromDate = !fromDate || (r.renewalDate && r.renewalDate >= fromDate);
    const matchesToDate = !toDate || (r.renewalDate && r.renewalDate <= toDate);

    return matchesSearch && matchesTaluka && matchesStatus && matchesOperator && matchesFromSource && matchesFromDate && matchesToDate;
  });

  // Reset page when filter inputs change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, talukaFilter, statusFilter, operatorFilter, fromSourceFilter, fromDate, toDate]);

  const totalPages = Math.max(1, Math.ceil(filteredRenewals.length / (pageSize === -1 ? filteredRenewals.length || 1 : pageSize)));
  const paginatedRenewals = React.useMemo(() => {
    if (pageSize === -1) return filteredRenewals;
    const start = (currentPage - 1) * pageSize;
    return filteredRenewals.slice(start, start + pageSize);
  }, [filteredRenewals, currentPage, pageSize]);

  // Bulk Selection and Delete Handlers
  const toggleSelectId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const isAllCurrentPageSelected =
    paginatedRenewals.length > 0 && paginatedRenewals.every((r) => selectedIds.has(r.id));

  const toggleSelectCurrentPage = () => {
    if (isAllCurrentPageSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        paginatedRenewals.forEach((r) => next.delete(r.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        paginatedRenewals.forEach((r) => next.add(r.id));
        return next;
      });
    }
  };

  const selectAllFiltered = () => {
    setSelectedIds(new Set(filteredRenewals.map((r) => r.id)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const openDeleteSelectedModal = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const selectedItems = renewals.filter((r) => selectedIds.has(r.id));
    const sampleNames = selectedItems.slice(0, 4).map((r) => `${r.workerName} (${r.mhNumber || r.id})`);
    setBulkDeleteModal({
      isOpen: true,
      ids,
      title: `निवडलेले ${ids.length} नूतनीकरण फॉर्म डिलीट करा (Delete Selected Renewals)`,
      description: `तुम्हाला खरोखर निवडलेले ${ids.length} नूतनीकरण फॉर्म डेटाबेसमधून कायमचे डिलीट करायचे आहेत का?`,
      sampleNames,
    });
  };

  const openDeleteFilteredModal = () => {
    const ids = filteredRenewals.map((r) => r.id);
    if (ids.length === 0) return;
    const sampleNames = filteredRenewals.slice(0, 4).map((r) => `${r.workerName} (${r.mhNumber || r.id})`);
    setBulkDeleteModal({
      isOpen: true,
      ids,
      title: `सर्व फिल्टर केलेले ${ids.length} नूतनीकरण फॉर्म डिलीट करा (Delete All Filtered Renewals)`,
      description: `सध्या फिल्टर केलेले सर्व ${ids.length} नूतनीकरण फॉर्म कायमचे डिलीट करायचे आहेत का?`,
      sampleNames,
    });
  };

  const handleExecuteBulkDelete = async () => {
    if (!bulkDeleteModal || bulkDeleteModal.ids.length === 0) return;
    setIsBulkDeleting(true);
    try {
      if (onDeleteRenewalsBulk) {
        await onDeleteRenewalsBulk(bulkDeleteModal.ids);
      } else if (onDeleteRenewal) {
        for (const id of bulkDeleteModal.ids) {
          await onDeleteRenewal(id);
        }
      }
      setSelectedIds((prev) => {
        const next = new Set(prev);
        bulkDeleteModal.ids.forEach((id) => next.delete(id));
        return next;
      });
      setBulkDeleteModal(null);
    } catch (err: any) {
      alert(err?.message || 'नूतनीकरण डिलीट करण्यात अडचण आली.');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const renFileInputRef = useRef<HTMLInputElement | null>(null);
  const renTableContainerRef = useRef<HTMLDivElement | null>(null);
  const [renImporting, setRenImporting] = useState(false);

  // Renewal Excel Import Preview & Date Configuration Modal State
  const [renExcelImportModal, setRenExcelImportModal] = useState<{
    isOpen: boolean;
    fileName: string;
    rawRows: Record<string, any>[];
    preferFormat: 'DMY' | 'MDY';
    swapDayMonth: boolean;
  }>({
    isOpen: false,
    fileName: '',
    rawRows: [],
    preferFormat: 'DMY',
    swapDayMonth: false,
  });

  // Swap Dates Modal for selected renewals
  const [renSwapDatesModalOpen, setRenSwapDatesModalOpen] = useState(false);
  const [renSwappingDates, setRenSwappingDates] = useState(false);

  const buildParsedRenewalRecords = (rawRows: Record<string, any>[], options: DateParseOptions) => {
    const parsedRecords: Omit<WorkerRenewal, 'id'>[] = [];
    for (const row of rawRows) {
      const getVal = (...keys: string[]) => {
        const rowKeys = Object.keys(row);
        for (const k of keys) {
          const targetNorm = k.toLowerCase().replace(/[^a-z0-9\u0900-\u097F]/g, '');
          const foundKey = rowKeys.find((rk) => {
            const rkClean = rk.toLowerCase().trim();
            const kClean = k.toLowerCase().trim();
            if (rkClean === kClean || rkClean.includes(kClean)) return true;
            const rkNorm = rk.toLowerCase().replace(/[^a-z0-9\u0900-\u097F]/g, '');
            return targetNorm.length >= 3 && (rkNorm === targetNorm || rkNorm.includes(targetNorm));
          });
          if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null) {
            const val = String(row[foundKey]).trim();
            if (val) return val;
          }
        }
        return '';
      };

      const workerName = getVal('Worker Name', 'Full Name', 'Name', 'नाव', 'कामगाराचे नाव', 'workerName');
      if (!workerName) continue;

      const mhNumber = getVal('MH Registration Number', 'MH Number', 'MH No', 'MH', 'एमएच नंबर', 'Registration No', 'mhNumber');
      const mobileNumber = getVal('Mobile Number', 'Mobile', 'मोबाईल', 'mobileNumber');

      const rawVerDate = getVal('Verification Date', 'पडताळणी तारीख', 'verificationDate');
      const verDateRes = parseExcelDateStrict(rawVerDate, options);
      if (rawVerDate && !verDateRes.valid && !verDateRes.isBlank) {
        // Block row with genuinely invalid date
        continue;
      }
      const verificationDate = verDateRes.valid ? verDateRes.ymd : '';

      const rawRenDate = getVal('Renewal Date', 'नूतनीकरण तारीख', 'renewalDate');
      const renDateRes = parseExcelDateStrict(rawRenDate, options);
      if (rawRenDate && !renDateRes.valid && !renDateRes.isBlank) {
        // Block row with genuinely invalid date
        continue;
      }
      const renewalDate = renDateRes.valid ? renDateRes.ymd : getTodayDate();

      const taluka = getVal('Verification Taluka', 'Taluka', 'तालुका', 'taluka') || 'Junnar';
      const fromSource = getVal('From', 'माध्यम', 'fromSource') || 'E-Seva Kendra';
      const statusVal = getVal('Renewal Status', 'Status', 'स्थिती', 'status') || 'Active';
      const aadhaarNumber = getVal('Aadhaar Number', 'Aadhaar', 'आधार', 'आधार क्रमांक', 'aadhaarNumber');
      const renewalYear = getVal('Renewal Year', 'Year', 'वर्ष', 'renewalYear');
      const receiptNumber = getVal('Receipt Number', 'पावती क्रमांक', 'receiptNumber', 'Receipt No', 'Receipt');

      // Keep 'Form Filled' exactly as present in the imported Excel (do not change or overwrite)
      const formFilledBy = getVal(
        'Form Filled By',
        'Form Filled',
        'FormFilledBy',
        'FormFilled',
        'Form Fill By',
        'Form Fill',
        'Form Bharla',
        'फॉर्म भरला',
        'फॉर्म भरणाऱ्याचे नाव',
        'फॉर्म भरल्याचे नाव',
        'फॉर्म भरले',
        'फॉर्म भरणार',
        'Filled By',
        'FilledBy',
        'Entered By',
        'Created By',
        'Done By',
        'Operator Name',
        'Operator',
        'ऑपरेटरचे नाव',
        'ऑपरेटर नाव',
        'ऑपरेटर',
        'Agent Name',
        'Agent',
        'सब एजंट',
        'Sub Agent',
        'SubAgent',
        'operatorName',
        'operator',
        'form_filled_by',
        'form_filled'
      );

      const recordPayload: Omit<WorkerRenewal, 'id'> = {
        workerName,
        mhNumber: mhNumber ? mhNumber.toUpperCase() : `MH${Date.now().toString().slice(-10)}`,
        mobileNumber: mobileNumber.replace(/\D/g, '').slice(0, 10) || '9876543210',
        aadhaarNumber: aadhaarNumber ? aadhaarNumber.replace(/\D/g, '').slice(0, 12) : undefined,
        renewalYear: renewalYear || undefined,
        receiptNumber: receiptNumber || undefined,
        verificationDate,
        renewalDate,
        taluka,
        fromSource,
        operatorName: formFilledBy || currentUser.name,
        status: statusVal as any,
        feeAmount: 100,
      };

      parsedRecords.push(recordPayload);
    }
    return parsedRecords;
  };

  const handleExcelImportRenewals = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, {
        raw: false,
        dateNF: 'dd-mm-yyyy',
        defval: '',
      });

      if (!rawRows || rawRows.length === 0) {
        alert('एक्सेल फाईलमध्ये कोणताही डेटा सापडला नाही!');
        return;
      }

      setRenExcelImportModal({
        isOpen: true,
        fileName: file.name,
        rawRows,
        preferFormat: 'DMY',
        swapDayMonth: false,
      });
    } catch (err: any) {
      alert('एक्सेल फाईल वाचताना त्रुटी आली: ' + err.message);
    } finally {
      if (renFileInputRef.current) renFileInputRef.current.value = '';
    }
  };

  const handleConfirmRenExcelImport = async () => {
    if (!renExcelImportModal.rawRows || renExcelImportModal.rawRows.length === 0) return;
    setRenImporting(true);
    try {
      const options: DateParseOptions = {
        preferFormat: renExcelImportModal.preferFormat,
        swapDayMonth: renExcelImportModal.swapDayMonth,
      };
      const parsedRecords = buildParsedRenewalRecords(renExcelImportModal.rawRows, options);

      let importedCount = 0;
      if (onAddRenewalsBulk) {
        const batchSize = 100;
        for (let i = 0; i < parsedRecords.length; i += batchSize) {
          const batch = parsedRecords.slice(i, i + batchSize);
          await onAddRenewalsBulk(batch);
          importedCount += batch.length;
        }
      } else {
        for (const rec of parsedRecords) {
          await onAddRenewal(rec);
          importedCount++;
        }
      }

      alert(`अभिनंदन! एक्सेल फाईलमधून ${importedCount} नूतनीकरण नोंदी अचूक तारखांसह यशस्वीरित्या सेव्ह झाल्या आहेत.`);
      setRenExcelImportModal({ isOpen: false, fileName: '', rawRows: [], preferFormat: 'DMY', swapDayMonth: false });
    } catch (err: any) {
      alert('एक्सेल फाईल इम्पोर्ट करताना त्रुटी आली: ' + err.message);
    } finally {
      setRenImporting(false);
    }
  };

  const handleConfirmSwapSelectedRenDates = async () => {
    if (!onUpdateRenewal) {
      alert('नूतनीकरण अपडेट करण्याची सुविधा उपलब्ध नाही.');
      return;
    }
    setRenSwappingDates(true);
    try {
      const selectedList = renewals.filter((r) => selectedIds.has(r.id));
      let swappedCount = 0;
      for (const ren of selectedList) {
        const newRenDate = ren.renewalDate ? swapDateAndMonth(ren.renewalDate) : '';
        const newVerDate = ren.verificationDate ? swapDateAndMonth(ren.verificationDate) : '';

        const updates: Partial<WorkerRenewal> = {};
        if (newRenDate && newRenDate !== ren.renewalDate) {
          updates.renewalDate = newRenDate;
        }
        if (newVerDate && newVerDate !== ren.verificationDate) {
          updates.verificationDate = newVerDate;
        }

        if (Object.keys(updates).length > 0) {
          await onUpdateRenewal(ren.id, updates);
          swappedCount++;
        }
      }
      alert(`यशस्वी! ${swappedCount} नूतनीकरण नोंदींमधील तारीख आणि महिना (Day ⇄ Month) अदलाबदल करण्यात आला आहे.`);
      setRenSwapDatesModalOpen(false);
      setSelectedIds(new Set());
    } catch (err: any) {
      alert('तारखा बदलताना त्रुटी आली: ' + err.message);
    } finally {
      setRenSwappingDates(false);
    }
  };

  const handleExportCSV = () => {
    const exportRows = filteredRenewals.map((r, index) => ({
      'Sr. No.': index + 1,
      'Full Name': r.workerName,
      'MH Registration Number': r.mhNumber,
      'Mobile Number': r.mobileNumber,
      'Verification Date': r.verificationDate,
      'Renewal Date': r.renewalDate,
      'Verification Taluka': r.taluka,
      From: r.fromSource,
      'Form Filled By': r.operatorName,
      'Renewal Status': r.status,
    }));
    exportToCSV('MBOCWW_Worker_Renewals', exportRows);
  };

  return (
    <div className="space-y-6">
      {/* Hidden File Input for Excel Import */}
      <input
        type="file"
        ref={renFileInputRef}
        onChange={handleExcelImportRenewals}
        accept=".xlsx, .xls, .csv"
        className="hidden"
      />

      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-blue-700" />
            <span>Worker Renewal</span>
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            Verification and renewal entry for Junnar, Ambegaon, Khed & Shirur talukas
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => renFileInputRef.current?.click()}
            disabled={renImporting}
            className="py-2 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
            <span>{renImporting ? 'इम्पोर्ट होत आहे...' : 'Import Excel / CSV'}</span>
          </button>

          {(currentUser?.role === 'admin' || currentUser?.permissions?.canExport) && (
            <button
              onClick={handleExportCSV}
              className="py-2 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
            >
              <Download className="w-4 h-4 text-blue-700" />
              <span>Export CSV</span>
            </button>
          )}

          {currentUser.role === 'admin' && onClearRenewals && renewals.length > 0 && (
            <button
              onClick={onClearRenewals}
              className="py-2 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95"
              title="Clear all worker renewals"
            >
              <Trash2 className="w-4 h-4 text-rose-600" />
              <span>सर्व नूतनीकरण हटवा (Clear All)</span>
            </button>
          )}

          <UiverseButton
            onClick={openNewModal}
            variant="blue"
            size="sm"
            icon={<Plus className="w-4 h-4" />}
          >
            New Worker Renewal
          </UiverseButton>
        </div>
      </div>

      {/* Search Toolbar & Filters */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="lg:col-span-2 relative">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by Full Name, MH Registration Number, Mobile..."
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white"
            />
          </div>

          <div>
            <FromSourceFilterSelect
              value={fromSourceFilter}
              onChange={setFromSourceFilter}
              options={fromSourceOptions}
              moduleType="renewal"
              placeholder="सर्व स्त्रोत (All From)..."
            />
          </div>

          {/* Taluka Filter */}
          <div>
            <select
              value={talukaFilter}
              onChange={(e) => setTalukaFilter(e.target.value)}
              className="w-full py-2 px-3 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white"
            >
              <option value="">All Verification Talukas (सर्व तालुके)</option>
              {VERIFICATION_TALUKAS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full py-2 px-3 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white"
            >
              <option value="">All Renewal Statuses (सर्व स्थिती)</option>
              <option value="Pending">🟡 Pending (प्रलंबित)</option>
              <option value="Active">🟢 Active (स्वीकृत)</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 text-xs">
          <div className="flex items-center flex-wrap gap-2">
            <div className="flex items-center gap-1.5 font-bold text-slate-700">
              <Calendar className="w-4 h-4 text-blue-700" />
              <span>नूतनीकरण तारीख (Renewal Date):</span>
            </div>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="px-2 py-1 rounded bg-slate-50 border border-slate-300 text-xs text-slate-800 focus:bg-white focus:border-blue-600"
            />
            <span className="text-slate-400">ते</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="px-2 py-1 rounded bg-slate-50 border border-slate-300 text-xs text-slate-800 focus:bg-white focus:border-blue-600"
            />
          </div>

          <div className="flex items-center flex-wrap gap-2">
            <span className="text-slate-500 font-medium">
              एकूण {renewals.length} पैकी <strong className="text-blue-900 font-black">{filteredRenewals.length}</strong> नूतनीकरण नोंदी सापडल्या
            </span>
            {(searchTerm || talukaFilter || statusFilter || operatorFilter || fromSourceFilter || fromDate || toDate) && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setTalukaFilter('');
                    setStatusFilter('');
                    setOperatorFilter('');
                    setFromSourceFilter('');
                    setFromDate('');
                    setToDate('');
                  }}
                  className="py-1 px-2.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition-all cursor-pointer"
                >
                  फिल्टर रिसेट (Clear Filters)
                </button>
                {filteredRenewals.length > 0 && (
                  <button
                    type="button"
                    onClick={openDeleteFilteredModal}
                    className="py-1 px-3 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                    title="सध्या फिल्टर केलेले सर्व नूतनीकरण फॉर्म डिलीट करा"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>फिल्टर केलेले सर्व ({filteredRenewals.length}) डिलीट करा</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Renewal List Table */}
      <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
        {/* Bulk Selection Actions Bar */}
        {selectedIds.size > 0 && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-200 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-600 text-white font-black text-xs shadow-xs">
                <CheckSquare className="w-3.5 h-3.5" />
                <span>{selectedIds.size} नूतनीकरण निवडले</span>
              </span>
              {selectedIds.size < filteredRenewals.length && (
                <button
                  type="button"
                  onClick={selectAllFiltered}
                  className="text-blue-700 hover:text-blue-900 font-bold underline cursor-pointer ml-1"
                >
                  सर्व {filteredRenewals.length} फिल्टर केलेले नूतनीकरण निवडा (Select All Filtered)
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={clearSelection}
                className="py-1.5 px-3 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold cursor-pointer transition-all"
              >
                निवड रद्द करा (Deselect)
              </button>
              {onUpdateRenewal && (
                <button
                  type="button"
                  onClick={() => setRenSwapDatesModalOpen(true)}
                  className="py-1.5 px-3.5 rounded-lg bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-bold shadow-xs cursor-pointer flex items-center gap-1.5 transition-all"
                  title="निवडलेल्या नूतनीकरण नोंदींमधील तारीख आणि महिना (Day ⇄ Month) अदलाबदल करा"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>तारीख ⇄ महिना बदला (Swap Date/Month)</span>
                </button>
              )}
              <button
                type="button"
                onClick={openDeleteSelectedModal}
                className="py-1.5 px-3.5 rounded-lg bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-bold shadow-xs cursor-pointer flex items-center gap-1.5 transition-all"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>निवडलेले {selectedIds.size} फॉर्म डिलीट करा</span>
              </button>
            </div>
          </div>
        )}

        {/* Quick Slide Header Controls */}
        <TableSlideControls
          onSlideLeft={() => renTableContainerRef.current?.scrollBy({ left: -320, behavior: 'smooth' })}
          onSlideRight={() => renTableContainerRef.current?.scrollBy({ left: 320, behavior: 'smooth' })}
          title="↔ Slide Table / माहिती सरकवा"
          subtitle="(डावीकडे / उजवीकडे सरकवण्यासाठी खालील बटने वापरा)"
        />

        <div ref={renTableContainerRef} className="overflow-x-auto max-h-[65vh] overflow-y-auto scroll-smooth">
          <table className="w-full text-left text-xs text-slate-800 border-collapse">
            <thead className="bg-slate-100/95 backdrop-blur-xs text-slate-700 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200 sticky top-0 z-20 shadow-2xs">
              <tr>
                <th className="p-3 w-10 text-center sticky left-0 bg-slate-100 z-30 border-r border-slate-200/80">
                  <div className="flex items-center justify-center">
                    <UiverseCheckbox
                      size={18}
                      checked={isAllCurrentPageSelected}
                      onChange={toggleSelectCurrentPage}
                      title={isAllCurrentPageSelected ? "या पानावरील सर्व निवड रद्द करा" : "या पानावरील सर्व निवडा"}
                      id="renewal-header-select-all"
                    />
                  </div>
                </th>
                <th className="p-3 w-12 text-center sticky left-10 bg-slate-100 z-30 border-r border-slate-200/80">Sr. No.</th>
                <th className="p-3 sticky left-[88px] bg-slate-100 z-30 shadow-xs border-r border-slate-200/80 min-w-[150px]">
                  <span>Full Name</span>
                </th>
                <th className="p-3 min-w-[140px]">
                  <span>MH Reg Number</span>
                </th>
                <th className="p-3 min-w-[120px]">Mobile Number</th>
                <th className="p-3 min-w-[120px]">
                  <span>Verification Date</span>
                </th>
                <th className="p-3 min-w-[130px]">
                  <span>Renewal Date</span>
                </th>
                <th className="p-3 min-w-[110px]">Renewal Year</th>
                <th className="p-3 min-w-[140px]">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1 text-slate-800">
                      <Filter className="w-3 h-3 text-blue-600" />
                      <span>Verification Taluka</span>
                    </div>
                    <select
                      value={talukaFilter}
                      onChange={(e) => setTalukaFilter(e.target.value)}
                      className="w-full text-[10px] font-semibold normal-case py-0.5 px-1 bg-white border border-slate-300 rounded focus:border-blue-600 focus:outline-none cursor-pointer"
                    >
                      <option value="">सर्व तालुके (All)</option>
                      {VERIFICATION_TALUKAS.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </th>
                <th className="p-3 min-w-[100px]">From</th>
                <th className="p-3 min-w-[130px]">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1 text-slate-800">
                      <Filter className="w-3 h-3 text-blue-600" />
                      <span>Form Filled By</span>
                    </div>
                    <select
                      value={operatorFilter}
                      onChange={(e) => setOperatorFilter(e.target.value)}
                      className="w-full text-[10px] font-semibold normal-case py-0.5 px-1 bg-white border border-slate-300 rounded focus:border-blue-600 focus:outline-none cursor-pointer"
                    >
                      <option value="">सर्व ऑपरेटर (All)</option>
                      {uniqueOperators.map((op) => (
                        <option key={op} value={op}>{op}</option>
                      ))}
                    </select>
                  </div>
                </th>
                <th className="p-3 min-w-[130px]">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1 text-slate-800">
                      <Filter className="w-3 h-3 text-blue-600" />
                      <span>Renewal Status</span>
                    </div>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="w-full text-[10px] font-semibold normal-case py-0.5 px-1 bg-white border border-slate-300 rounded focus:border-blue-600 focus:outline-none cursor-pointer"
                    >
                      <option value="">सर्व स्थिती (All)</option>
                      <option value="Active">Active (सक्रिय)</option>
                      <option value="Pending">Pending (प्रलंबित)</option>
                    </select>
                  </div>
                </th>
                <th className="p-3 text-right sticky right-0 bg-slate-100 z-30 shadow-xs border-l border-slate-200/80">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedRenewals.map((ren, index) => {
                const isPending = ren.status === 'Pending';
                const isActive = ren.status === 'Active';

                return (
                  <tr key={ren.id} className={`hover:bg-slate-50/80 transition-colors ${selectedIds.has(ren.id) ? 'bg-blue-50/60' : ''}`}>
                    <td className="p-3 text-center sticky left-0 bg-white/95 backdrop-blur-xs z-10 border-r border-slate-200/60">
                      <div className="flex items-center justify-center">
                        <UiverseCheckbox
                          size={18}
                          checked={selectedIds.has(ren.id)}
                          onChange={() => toggleSelectId(ren.id)}
                          id={`renewal-row-${ren.id}`}
                        />
                      </div>
                    </td>
                    <td className="p-3.5 text-center font-bold text-slate-500 sticky left-10 bg-white/95 backdrop-blur-xs z-10 border-r border-slate-200/60">
                      {(pageSize === -1 ? 0 : (currentPage - 1) * pageSize) + index + 1}
                    </td>
                    <td className="p-3.5 sticky left-[88px] bg-white/95 backdrop-blur-xs z-10 border-r border-slate-200/60 shadow-xs min-w-[160px]">
                      <div className="font-bold text-slate-900">{ren.workerName}</div>
                    </td>
                    <td className="p-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 font-bold text-blue-700 font-mono">
                        <span>{ren.mhNumber}</span>
                        {ren.mhNumber && !ren.mhNumber.startsWith('PENDING-') && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyMh(ren.mhNumber);
                            }}
                            className={`p-1 rounded border transition-all cursor-pointer ${
                              copiedMh === ren.mhNumber
                                ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                                : 'bg-slate-50 hover:bg-blue-100 text-slate-500 hover:text-blue-700 border-slate-200'
                            }`}
                            title="MH नंबर कॉपी करा (Copy MH Number)"
                          >
                            {copiedMh === ren.mhNumber ? (
                              <Check className="w-3 h-3 text-emerald-600 stroke-[3]" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="p-3.5 font-medium text-slate-800 whitespace-nowrap">{ren.mobileNumber}</td>
                    <td className="p-3.5 whitespace-nowrap">
                      <span className="px-2 py-0.5 bg-amber-100/90 text-amber-950 font-black border border-amber-300/90 rounded text-[11px] font-mono shadow-2xs">
                        {formatDate(ren.verificationDate)}
                      </span>
                    </td>
                    <td className="p-3.5 text-slate-700 font-medium whitespace-nowrap font-mono">{formatDate(ren.renewalDate)}</td>
                    <td className="p-3.5 whitespace-nowrap">
                      <span className="px-2 py-0.5 bg-blue-100/90 text-blue-950 font-bold border border-blue-300 rounded text-[11px] font-mono">
                        {ren.renewalYear || getFinancialYearFromDate(ren.renewalDate)}
                      </span>
                    </td>
                    <td className="p-3.5 whitespace-nowrap">
                      <span className="font-bold text-slate-800">{ren.taluka}</span>
                    </td>
                    <td className="p-3.5 text-slate-700 font-medium whitespace-nowrap">{ren.fromSource || '-'}</td>
                    <td className="p-3.5 text-slate-600 font-medium whitespace-nowrap">{ren.operatorName}</td>
                    <td className="p-3.5 whitespace-nowrap">
                      {isPending && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                          <span>🟡</span>
                          <span>Pending</span>
                        </span>
                      )}
                      {isActive && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                          <span>🟢</span>
                          <span>Active</span>
                        </span>
                      )}
                    </td>
                    <td className="p-3.5 text-right sticky right-0 bg-white/95 backdrop-blur-xs z-10 border-l border-slate-200/60 shadow-xs whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* View Details Button */}
                        <button
                          onClick={() => setViewDetailsRen(ren)}
                          className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 transition-colors cursor-pointer"
                          title="View Details (तपशील पहा)"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        {/* Print Button */}
                        <button
                          onClick={() => onOpenPrintSlip('renewal', ren)}
                          className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition-colors cursor-pointer"
                          title="Print Renewal Slip"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>

                        {/* Edit Button */}
                        <button
                          onClick={() => handleEdit(ren)}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-colors cursor-pointer"
                          title="Edit Renewal"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>

                        {/* Delete Button */}
                        <button
                          onClick={() => handleDelete(ren.id, ren.workerName)}
                          className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 transition-colors cursor-pointer"
                          title="Delete Record"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredRenewals.length === 0 && (
                <tr>
                  <td colSpan={11} className="p-8 text-center text-slate-500 text-xs">
                    No matching renewal records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {filteredRenewals.length > 0 && (
          <div className="bg-slate-50 border-t border-slate-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
            <div className="flex items-center gap-2 font-medium">
              <span>
                दाखवत आहे{' '}
                <strong className="text-slate-900 font-bold">
                  {pageSize === -1 ? 1 : Math.min((currentPage - 1) * pageSize + 1, filteredRenewals.length)}
                </strong>{' '}
                ते{' '}
                <strong className="text-slate-900 font-bold">
                  {pageSize === -1 ? filteredRenewals.length : Math.min(currentPage * pageSize, filteredRenewals.length)}
                </strong>{' '}
                (एकूण <strong className="text-blue-900 font-bold">{filteredRenewals.length}</strong> नोंदी)
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-slate-500 font-medium">प्रति पान (Per page):</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="bg-white border border-slate-300 text-slate-800 font-semibold py-1 px-2 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                >
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                  <option value={250}>250</option>
                  <option value={-1}>सर्व (All)</option>
                </select>
              </div>

              {pageSize !== -1 && totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="p-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                    title="मागील पान (Previous)"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  <span className="px-2 font-bold text-slate-800">
                    पान {currentPage} / {totalPages}
                  </span>

                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="p-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                    title="पुढील पान (Next)"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Renewal Modal (Create / Edit Form) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200/90 rounded-3xl max-w-2xl w-full p-6 shadow-2xl relative text-slate-900 my-8">
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              className="absolute top-5 right-5 p-2 rounded-xl bg-slate-100 text-slate-500 hover:text-slate-900 border border-slate-200 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="mb-6">
              <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-blue-700" />
                <span>{editingId ? 'Edit Worker Renewal' : 'Worker Renewal Form'}</span>
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Enter worker verification details for Junnar, Ambegaon, Khed & Shirur talukas
              </p>
            </div>

            <form onSubmit={(e) => e.preventDefault()} className="space-y-5">
              {/* Quick Worker Search Bar */}
              <div className="p-3.5 rounded-2xl bg-blue-50/70 border border-blue-200/90 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black uppercase tracking-wider text-blue-950 flex items-center gap-1.5">
                    <Search className="w-3.5 h-3.5 text-blue-700" />
                    <span>Worker Search / कामगार शोधा</span>
                  </label>
                  <span className="text-[10px] font-semibold text-blue-800">
                    MH Number / Aadhaar (12 अंक) / Mobile (10 अंक)
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={quickSearchInput}
                      onChange={(e) => setQuickSearchInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleQuickSearchWorker();
                        }
                      }}
                      placeholder="MH123456789012 / आधार नंबर / मोबाईल नंबर टाका..."
                      className="w-full pl-3 pr-8 py-2 rounded-xl bg-white border border-blue-300 text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-500"
                    />
                    {quickSearchInput && (
                      <button
                        type="button"
                        onClick={() => setQuickSearchInput('')}
                        className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-700"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={isLoadingHistory || !quickSearchInput.trim()}
                    onClick={() => handleQuickSearchWorker()}
                    className="py-2 px-4 rounded-xl bg-blue-700 hover:bg-blue-800 active:scale-95 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs disabled:opacity-50 cursor-pointer shrink-0"
                  >
                    {isLoadingHistory ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Search className="w-3.5 h-3.5" />
                    )}
                    <span>शोधा (Search)</span>
                  </button>
                </div>
              </div>

              {/* 1. Worker Details Section */}
              <div className="space-y-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 bg-slate-100 py-1 px-2.5 rounded-lg w-fit">
                  1. Worker Details (कामगाराचे तपशील)
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {/* Worker Name */}
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Full Name (कामगाराचे पूर्ण नाव) *
                    </label>
                    <input
                      type="text"
                      value={formData.workerName}
                      onChange={(e) => {
                        setFormData({ ...formData, workerName: e.target.value });
                        if (validationErrors.workerName) {
                          setValidationErrors({ ...validationErrors, workerName: '' });
                        }
                      }}
                      placeholder="Enter Worker Full Name"
                      className={`w-full px-3.5 py-2 rounded-xl bg-slate-50 border ${
                        validationErrors.workerName ? 'border-red-500 bg-red-50/20' : 'border-slate-300'
                      } text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white`}
                    />
                    {validationErrors.workerName && (
                      <p className="text-[11px] text-red-600 mt-1 font-semibold">
                        {validationErrors.workerName}
                      </p>
                    )}
                  </div>

                  {/* MH Registration Number */}
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      MH Registration Number (नोंदणी क्रमांक) *
                    </label>
                    <input
                      type="text"
                      maxLength={14}
                      value={formData.mhNumber}
                      onChange={(e) => {
                        handleMhLookup(e.target.value);
                        if (validationErrors.mhNumber) {
                          setValidationErrors({ ...validationErrors, mhNumber: '' });
                        }
                      }}
                      placeholder="e.g. MH123456789012"
                      className={`w-full px-3.5 py-2 rounded-xl bg-slate-50 border ${
                        validationErrors.mhNumber ? 'border-red-500 bg-red-50/20' : 'border-slate-300'
                      } text-xs font-mono font-bold text-blue-900 uppercase focus:outline-none focus:border-blue-600 focus:bg-white`}
                    />
                    <p className="text-[10px] text-slate-500 mt-0.5">Format: MH + 12 Digits</p>
                    {validationErrors.mhNumber && (
                      <p className="text-[11px] text-red-600 mt-0.5 font-semibold">
                        {validationErrors.mhNumber}
                      </p>
                    )}
                  </div>

                  {/* Aadhaar Number */}
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Aadhaar Number (आधार क्रमांक)
                    </label>
                    <input
                      type="text"
                      maxLength={12}
                      value={formData.aadhaarNumber || ''}
                      onChange={(e) => {
                        handleAadhaarLookup(e.target.value);
                        if (validationErrors.aadhaarNumber) {
                          setValidationErrors({ ...validationErrors, aadhaarNumber: '' });
                        }
                      }}
                      placeholder="12 Digit Aadhaar Number"
                      className={`w-full px-3.5 py-2 rounded-xl bg-slate-50 border ${
                        validationErrors.aadhaarNumber ? 'border-red-500 bg-red-50/20' : 'border-slate-300'
                      } text-xs font-mono font-semibold text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white`}
                    />
                    {validationErrors.aadhaarNumber && (
                      <p className="text-[11px] text-red-600 mt-1 font-semibold">
                        {validationErrors.aadhaarNumber}
                      </p>
                    )}
                  </div>

                  {/* Mobile Number */}
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Mobile Number (मोबाईल क्रमांक) *
                    </label>
                    <input
                      type="text"
                      maxLength={10}
                      value={formData.mobileNumber}
                      onChange={(e) => {
                        handleMobileLookup(e.target.value);
                        if (validationErrors.mobileNumber) {
                          setValidationErrors({ ...validationErrors, mobileNumber: '' });
                        }
                      }}
                      placeholder="10 Digit Mobile Number"
                      className={`w-full px-3.5 py-2 rounded-xl bg-slate-50 border ${
                        validationErrors.mobileNumber ? 'border-red-500 bg-red-50/20' : 'border-slate-300'
                      } text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white`}
                    />
                    {validationErrors.mobileNumber && (
                      <p className="text-[11px] text-red-600 mt-1 font-semibold">
                        {validationErrors.mobileNumber}
                      </p>
                    )}
                  </div>

                  {/* Verification Taluka */}
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Verification Taluka (तालुका) *
                    </label>
                    <select
                      value={formData.taluka}
                      onChange={(e) => {
                        setFormData({ ...formData, taluka: e.target.value });
                        if (validationErrors.taluka) {
                          setValidationErrors({ ...validationErrors, taluka: '' });
                        }
                      }}
                      className={`w-full px-3.5 py-2 rounded-xl bg-slate-50 border ${
                        validationErrors.taluka ? 'border-red-500 bg-red-50/20' : 'border-slate-300'
                      } text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white`}
                    >
                      <option value="">Select Verification Taluka</option>
                      {VERIFICATION_TALUKAS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                    {validationErrors.taluka && (
                      <p className="text-[11px] text-red-600 mt-1 font-semibold">
                        {validationErrors.taluka}
                      </p>
                    )}
                  </div>

                  {/* From */}
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      From (माध्यम / केंद्र) *
                    </label>
                    <input
                      type="text"
                      value={formData.fromSource}
                      onChange={(e) => {
                        setFormData({ ...formData, fromSource: e.target.value });
                        if (validationErrors.fromSource) {
                          setValidationErrors({ ...validationErrors, fromSource: '' });
                        }
                      }}
                      placeholder="e.g. E-Seva Kendra / Direct"
                      className={`w-full px-3.5 py-2 rounded-xl bg-slate-50 border ${
                        validationErrors.fromSource ? 'border-red-500 bg-red-50/20' : 'border-slate-300'
                      } text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white`}
                    />
                    {validationErrors.fromSource && (
                      <p className="text-[11px] text-red-600 mt-1 font-semibold">
                        {validationErrors.fromSource}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* 2. Renewal Details Section */}
              <div className="space-y-3 pt-2">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 bg-slate-100 py-1 px-2.5 rounded-lg w-fit">
                  2. Renewal Details (नूतनीकरण तपशील)
                </h4>

                {/* Last Renewal & Next Renewal Badges */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-2xl bg-gradient-to-r from-blue-50/80 via-indigo-50/60 to-blue-50/80 border border-blue-200">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-blue-600 text-white shadow-2xs shrink-0">
                      <Clock className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600 block">
                        Last Renewal (शेवटचे नूतनीकरण)
                      </span>
                      <div className="text-sm font-black font-mono mt-0.5">
                        {lastRenewalYear ? (
                          <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-950 border border-blue-300">
                            {lastRenewalYear}
                          </span>
                        ) : (
                          <span className="text-slate-500 font-normal italic text-xs">
                            None / नवीन नोंदणी
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-emerald-600 text-white shadow-2xs shrink-0">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 block">
                        Next Renewal (पुढील पात्र वर्ष)
                      </span>
                      <div className="text-sm font-black font-mono mt-0.5">
                        <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-950 border border-emerald-300">
                          {nextRenewalYear || getNextRenewalYear(lastRenewalYear || '')}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {/* Renewal Date */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-xs font-bold text-slate-800">
                        Renewal Date (नूतनीकरण तारीख)
                      </label>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, renewalDate: getTodayDate() })}
                        className="text-[10px] text-blue-700 hover:text-blue-900 font-bold underline cursor-pointer"
                      >
                        Auto Today
                      </button>
                    </div>
                    <input
                      type="date"
                      value={formData.renewalDate || ''}
                      onChange={(e) => setFormData({ ...formData, renewalDate: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
                    />
                  </div>

                  {/* Verification Date * (Preserving existing behavior) */}
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Verification Date (तपासणी तारीख) *
                    </label>
                    <input
                      type="date"
                      value={formData.verificationDate}
                      onChange={(e) => {
                        setFormData({ ...formData, verificationDate: e.target.value });
                        if (validationErrors.verificationDate) {
                          setValidationErrors({ ...validationErrors, verificationDate: '' });
                        }
                      }}
                      className={`w-full px-3.5 py-2 rounded-xl bg-slate-50 border ${
                        validationErrors.verificationDate ? 'border-red-500 bg-red-50/20' : 'border-slate-300'
                      } text-xs font-medium text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white`}
                    />
                    {validationErrors.verificationDate && (
                      <p className="text-[11px] text-red-600 mt-1 font-semibold">
                        {validationErrors.verificationDate}
                      </p>
                    )}
                  </div>

                  {/* Renewal Year (Auto-selected to next eligible, editable dropdown) */}
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Renewal Year (नूतनीकरण वर्ष) *
                    </label>
                    <select
                      value={formData.renewalYear}
                      onChange={(e) => {
                        setFormData({ ...formData, renewalYear: e.target.value });
                        if (validationErrors.renewalYear) {
                          setValidationErrors({ ...validationErrors, renewalYear: '' });
                        }
                      }}
                      className={`w-full px-3.5 py-2 rounded-xl bg-slate-50 border ${
                        validationErrors.renewalYear ? 'border-red-500 bg-red-50/20' : 'border-slate-300'
                      } text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white`}
                    >
                      <option value="">-- निवडा (Select Renewal Year) --</option>
                      {availableRenewalYears.map((yr) => {
                        const isDone = workerHistory.some(
                          (h) =>
                            normalizeRenewalYear(h.renewalYear || getFinancialYearFromDate(h.renewalDate)) === yr &&
                            h.id !== editingId
                        );
                        const isNext = yr === (nextRenewalYear || getNextRenewalYear(lastRenewalYear || ''));
                        return (
                          <option key={yr} value={yr}>
                            {yr} {isDone ? '✓ (Completed / आधीच पूर्ण)' : isNext ? '★ (Next Eligible / पुढील वर्ष)' : ''}
                          </option>
                        );
                      })}
                    </select>
                    {validationErrors.renewalYear && (
                      <p className="text-[11px] text-red-600 mt-1 font-semibold">
                        {validationErrors.renewalYear}
                      </p>
                    )}
                  </div>

                  {/* Form Filled By */}
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Form Filled By (ऑपरेटरचे नाव) *
                    </label>
                    {currentUser.role === 'admin' ? (
                      <div className="space-y-1.5">
                        <select
                          value={isCustomOperator ? '__custom__' : (formData.operatorName || currentUser.name)}
                          onChange={(e) => {
                            if (e.target.value === '__custom__') {
                              setIsCustomOperator(true);
                              setFormData({ ...formData, operatorName: '' });
                            } else {
                              setIsCustomOperator(false);
                              setFormData({ ...formData, operatorName: e.target.value });
                            }
                          }}
                          className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold text-slate-900 focus:border-blue-600 focus:bg-white"
                        >
                          <option value="">-- ऑपरेटर निवडा (Select Operator) --</option>
                          {operatorOptions.map((op) => (
                            <option key={op} value={op}>
                              {op}
                            </option>
                          ))}
                          <option value="__custom__">➕ इतर नवीन नाव टाईप करा</option>
                        </select>
                        {isCustomOperator && (
                          <input
                            type="text"
                            value={formData.operatorName}
                            onChange={(e) => setFormData({ ...formData, operatorName: e.target.value })}
                            placeholder="ऑपरेटरचे नाव टाईप करा..."
                            className="w-full px-3.5 py-2 rounded-xl bg-blue-50/50 border border-blue-400 text-xs font-bold text-blue-900 focus:border-blue-600 focus:bg-white"
                            autoFocus
                            required
                          />
                        )}
                      </div>
                    ) : (
                      <input
                        type="text"
                        value={formData.operatorName || currentUser.name}
                        readOnly
                        className="w-full px-3.5 py-2 rounded-xl bg-slate-100 border border-slate-300 text-xs font-bold text-slate-700 cursor-not-allowed"
                      />
                    )}
                  </div>
                </div>

                {/* Duplicate Renewal Protection Warning Alert */}
                {duplicateWarning && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-xs font-bold flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{duplicateWarning}</span>
                  </div>
                )}

                {/* Renewal Status Options */}
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-2">
                    Renewal Status
                  </label>
                  <div className="flex items-center gap-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="renewalStatus"
                        value="Pending"
                        checked={formData.status === 'Pending'}
                        onChange={() => setFormData({ ...formData, status: 'Pending' })}
                        className="w-4 h-4 text-amber-600 focus:ring-amber-500"
                      />
                      <span className="text-xs font-bold text-amber-900 flex items-center gap-1">
                        <span>🟡</span> Pending
                      </span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="renewalStatus"
                        value="Active"
                        checked={formData.status === 'Active'}
                        onChange={() => setFormData({ ...formData, status: 'Active' })}
                        className="w-4 h-4 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="text-xs font-bold text-emerald-900 flex items-center gap-1">
                        <span>🟢</span> Active
                      </span>
                    </label>
                  </div>
                </div>

                {/* PAYMENT SECTION */}
                <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <h5 className="text-xs font-black uppercase tracking-wider text-slate-800">
                      Payment Details (फी व रक्कम)
                    </h5>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                    <div>
                      <label className="block text-xs font-bold text-slate-800 mb-1">
                        Payment Amount (₹) *
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={formData.paymentAmount !== undefined && formData.paymentAmount !== null ? formData.paymentAmount : ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFormData({
                            ...formData,
                            paymentAmount: val === '' ? undefined : parseFloat(val),
                          });
                          if (validationErrors.paymentAmount && val !== '') {
                            setValidationErrors((prev) => {
                              const copy = { ...prev };
                              delete copy.paymentAmount;
                              return copy;
                            });
                          }
                        }}
                        placeholder="Enter amount (e.g. 50, 100)"
                        className={`w-full px-3.5 py-2 rounded-xl bg-white border ${
                          validationErrors.paymentAmount
                            ? 'border-rose-400 focus:border-rose-600'
                            : 'border-slate-300 focus:border-blue-600'
                        } text-xs font-bold text-slate-900 focus:bg-white`}
                      />
                      {validationErrors.paymentAmount && (
                        <p className="text-rose-600 text-[11px] font-semibold mt-1">
                          {validationErrors.paymentAmount}
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-800 mb-1">
                        Payment Mode (पेमेंट पद्धत)
                      </label>
                      <div className="flex items-center gap-4 pt-1">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="renPaymentMode"
                            value="Cash"
                            checked={(formData.paymentMode || 'Cash') === 'Cash'}
                            onChange={() => setFormData({ ...formData, paymentMode: 'Cash' })}
                            className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-xs font-bold text-slate-800">Cash</span>
                        </label>

                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="renPaymentMode"
                            value="Online"
                            checked={formData.paymentMode === 'Online'}
                            onChange={() => setFormData({ ...formData, paymentMode: 'Online' })}
                            className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-xs font-bold text-slate-800">Online</span>
                        </label>

                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="renPaymentMode"
                            value="N/A"
                            checked={formData.paymentMode === 'N/A'}
                            onChange={() => {
                              setFormData({ ...formData, paymentMode: 'N/A', paymentAmount: 0 });
                              if (validationErrors.paymentAmount) {
                                setValidationErrors((prev) => {
                                  const copy = { ...prev };
                                  delete copy.paymentAmount;
                                  return copy;
                                });
                              }
                            }}
                            className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-xs font-bold text-slate-800">N/A</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. Previous Renewal History Table Section */}
              <div className="pt-3 border-t border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-blue-700" />
                    <span>Previous Renewal History (मागील नूतनीकरण इतिहास)</span>
                  </h4>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-900 border border-blue-200">
                    एकूण {workerHistory.length} नोंदी
                  </span>
                </div>

                {isLoadingHistory ? (
                  <div className="py-4 text-center text-xs text-slate-500 flex items-center justify-center gap-2 bg-slate-50 rounded-xl border border-slate-200">
                    <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                    <span>नूतनीकरण इतिहास तपासत आहे... (Loading renewal history...)</span>
                  </div>
                ) : workerHistory.length === 0 ? (
                  <div className="py-3.5 text-center text-xs text-slate-500 bg-slate-50 rounded-xl border border-slate-200">
                    या कामगाराचा कोणताही मागील नूतनीकरण इतिहास आढळला नाही. (No previous renewal history found).
                  </div>
                ) : (
                  <div className="overflow-x-auto max-h-52 rounded-xl border border-slate-200 shadow-2xs">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-100 text-slate-700 font-bold text-[10px] uppercase border-b border-slate-200 sticky top-0">
                        <tr>
                          <th className="p-2.5 whitespace-nowrap">Renewal Year</th>
                          <th className="p-2.5 whitespace-nowrap">Renewal Date</th>
                          <th className="p-2.5 whitespace-nowrap">MH Number</th>
                          <th className="p-2.5 whitespace-nowrap">Payment Amount</th>
                          <th className="p-2.5 whitespace-nowrap">Payment Mode</th>
                          <th className="p-2.5 whitespace-nowrap">Created By</th>
                          <th className="p-2.5 whitespace-nowrap">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 bg-white">
                        {workerHistory.map((h, i) => (
                          <tr key={h.id || i} className="hover:bg-slate-50/80 transition-colors">
                            <td className="p-2.5 font-bold font-mono text-blue-950 whitespace-nowrap">
                              <span className="px-2 py-0.5 rounded bg-blue-100/90 text-blue-950 font-bold border border-blue-200">
                                {h.renewalYear || getFinancialYearFromDate(h.renewalDate)}
                              </span>
                            </td>
                            <td className="p-2.5 font-mono text-slate-700 whitespace-nowrap">
                              {formatDate(h.renewalDate)}
                            </td>
                            <td className="p-2.5 font-mono font-bold text-slate-800 whitespace-nowrap">
                              {h.mhNumber}
                            </td>
                            <td className="p-2.5 font-bold text-emerald-700 whitespace-nowrap">
                              {h.paymentAmount !== undefined ? `₹${h.paymentAmount}` : 'N/A'}
                            </td>
                            <td className="p-2.5 text-slate-700 whitespace-nowrap">
                              {h.paymentMode || 'Cash'}
                            </td>
                            <td className="p-2.5 text-slate-600 whitespace-nowrap">
                              {h.createdBy || h.operatorName || 'System'}
                            </td>
                            <td className="p-2.5 whitespace-nowrap">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                  h.status === 'Active'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {h.status || 'Pending'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Form Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-4 border-t border-slate-200">
                <div className="flex items-center gap-2">
                  {/* Reset Button */}
                  <button
                    type="button"
                    onClick={handleReset}
                    className="py-2.5 px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-300 flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset</span>
                  </button>

                  {/* Cancel Button */}
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="py-2.5 px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-300 flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Cancel</span>
                  </button>

                  {editingId && (
                    <button
                      type="button"
                      onClick={() => {
                        const targetId = editingId;
                        const targetName = formData.workerName;
                        setIsModalOpen(false);
                        setDeleteConfirmItem({ id: targetId, name: targetName });
                      }}
                      className="py-2.5 px-3.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold border border-rose-300 flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                      <span>Delete Record</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {/* Save Button (Green) */}
                  <button
                    type="button"
                    disabled={submitting || Boolean(duplicateWarning)}
                    onClick={() => handleSave(formData.status, false)}
                    className="py-2.5 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save Renewal</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CUSTOM DELETE CONFIRMATION MODAL */}
      {deleteConfirmItem && (
        <div className="fixed inset-0 z-[100] bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-rose-200 rounded-3xl max-w-md w-full p-6 shadow-2xl relative text-slate-900 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-rose-100 border border-rose-200 flex items-center justify-center text-rose-600 font-bold shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-slate-900">
                  नूतनीकरण नोंद डिलीट करा? (Delete Renewal)
                </h3>
                <p className="text-xs text-rose-700 font-bold">
                  ⚠️ सावधान! हे रेकॉर्ड कायमचे हटवले जाईल.
                </p>
              </div>
            </div>

            <div className="bg-rose-50/70 border border-rose-100 rounded-2xl p-3.5 text-xs text-slate-700 space-y-1">
              <div>
                <span className="font-semibold text-slate-500">Worker Name:</span>{' '}
                <span className="font-bold text-slate-900">{deleteConfirmItem.name}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteConfirmItem(null)}
                className="py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-300 transition-all cursor-pointer"
              >
                रद्द करा (Cancel)
              </button>
              <button
                type="button"
                onClick={async () => {
                  const id = deleteConfirmItem.id;
                  setDeleteConfirmItem(null);
                  if (onDeleteRenewal) {
                    await onDeleteRenewal(id);
                  }
                }}
                className="py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>होय, डिलीट करा (Delete)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BULK DELETE CONFIRMATION MODAL */}
      {bulkDeleteModal && (
        <div className="fixed inset-0 z-[100] bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200/90 rounded-2xl max-w-md w-full p-6 shadow-2xl relative text-slate-900 space-y-4">
            <button
              onClick={() => !isBulkDeleting && setBulkDeleteModal(null)}
              disabled={isBulkDeleting}
              className="absolute top-4 right-4 p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 cursor-pointer disabled:opacity-50"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-rose-100 text-rose-700">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {bulkDeleteModal.title}
                </h3>
                <p className="text-xs text-rose-600 font-semibold">
                  सावधान: ही कृती कायमस्वरूपी आहे (Irreversible Action)
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              {bulkDeleteModal.description}
            </p>

            {bulkDeleteModal.sampleNames && bulkDeleteModal.sampleNames.length > 0 && (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
                <div className="font-bold text-slate-700 text-[11px] uppercase tracking-wider">
                  डिलीट होणाऱ्या नोंदींचा नमुना (Sample Records):
                </div>
                <ul className="list-disc list-inside text-slate-600 space-y-0.5">
                  {bulkDeleteModal.sampleNames.map((s, idx) => (
                    <li key={idx} className="truncate font-medium">{s}</li>
                  ))}
                  {bulkDeleteModal.ids.length > bulkDeleteModal.sampleNames.length && (
                    <li className="text-slate-400 italic list-none pt-0.5">
                      ...आणि इतर {bulkDeleteModal.ids.length - bulkDeleteModal.sampleNames.length} नोंदी
                    </li>
                  )}
                </ul>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setBulkDeleteModal(null)}
                disabled={isBulkDeleting}
                className="py-2 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-300 transition-all cursor-pointer disabled:opacity-50"
              >
                रद्द करा (Cancel)
              </button>
              <button
                type="button"
                onClick={handleExecuteBulkDelete}
                disabled={isBulkDeleting}
                className="py-2 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-95 text-white text-xs font-bold shadow-md transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                {isBulkDeleting ? (
                  <>
                    <span className="button-spinner" />
                    <span>डिलीट होत आहे...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    <span>होय, कायमचे डिलीट करा ({bulkDeleteModal.ids.length})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW RENEWAL DETAILS MODAL WITH HIGHLIGHTED VERIFICATION DATE */}
      {viewDetailsRen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200/90 rounded-3xl max-w-xl w-full p-6 shadow-2xl relative text-slate-900 space-y-4 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setViewDetailsRen(null)}
              className="absolute top-5 right-5 p-2 rounded-xl bg-slate-100 text-slate-500 hover:text-slate-900 border border-slate-200 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 border-b border-slate-200 pb-3">
              <div className="p-3 rounded-2xl bg-blue-50 text-blue-800 border border-blue-200">
                <Eye className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900">{viewDetailsRen.workerName}</h3>
                <div className="text-xs font-bold text-blue-700 font-mono">
                  MH Reg No: {viewDetailsRen.mhNumber}
                </div>
              </div>
            </div>

            {/* HIGHLIGHTED VERIFICATION DATE */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-100 via-amber-50 to-amber-100 border-2 border-amber-400 text-amber-950 shadow-sm flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-500 text-white rounded-xl shadow-xs">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-amber-800 font-extrabold flex items-center gap-1">
                    <span>Verification Date (तपासणी / पडताळणी तारीख)</span>
                  </div>
                  <div className="text-base font-black font-mono text-amber-950 mt-0.5">
                    {formatDate(viewDetailsRen.verificationDate)}
                  </div>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full bg-amber-300 text-amber-950 text-xs font-black border border-amber-400 shadow-2xs">
                {viewDetailsRen.verificationDate ? 'VERIFIED' : 'PENDING'}
              </span>
            </div>

            {/* Details Grid */}
            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <div><span className="text-slate-500 font-medium">Renewal ID:</span> <span className="font-mono font-bold text-slate-900">{viewDetailsRen.id}</span></div>
              <div><span className="text-slate-500 font-medium">Mobile Number:</span> <span className="font-mono font-bold text-slate-900">{viewDetailsRen.mobileNumber}</span></div>
              <div><span className="text-slate-500 font-medium">Taluka:</span> <span className="font-bold text-slate-900">{viewDetailsRen.taluka}</span></div>
              <div><span className="text-slate-500 font-medium">Renewal Date:</span> <span className="font-bold text-slate-900">{formatDate(viewDetailsRen.renewalDate)}</span></div>
              <div><span className="text-slate-500 font-medium">Renewal Year:</span> <span className="font-bold text-blue-900 font-mono px-2 py-0.5 rounded bg-blue-100 border border-blue-200">{viewDetailsRen.renewalYear || getFinancialYearFromDate(viewDetailsRen.renewalDate)}</span></div>
              <div><span className="text-slate-500 font-medium">Fee Paid:</span> <span className="font-bold text-emerald-700">₹{viewDetailsRen.feeAmount || 50}</span></div>
              <div><span className="text-slate-500 font-medium">Source:</span> <span className="font-semibold text-slate-800">{viewDetailsRen.fromSource || '-'}</span></div>
              <div><span className="text-slate-500 font-medium">Filled By:</span> <span className="font-semibold text-slate-800">{viewDetailsRen.operatorName}</span></div>
              <div><span className="text-slate-500 font-medium">Status:</span> <span className="font-semibold text-slate-800">{viewDetailsRen.status}</span></div>
              {viewDetailsRen.paymentAmount !== undefined && (
                <div><span className="text-slate-500 font-medium">Payment:</span> <span className="font-bold text-slate-900">₹{viewDetailsRen.paymentAmount} ({viewDetailsRen.paymentMode || 'Cash'})</span></div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setViewDetailsRen(null)}
                className="py-2.5 px-5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs border border-slate-300 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RENEWAL EXCEL IMPORT PREVIEW & DATE CONFIGURATION MODAL */}
      {renExcelImportModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200/90 rounded-3xl max-w-3xl w-full p-6 shadow-2xl relative text-slate-900 space-y-5 max-h-[92vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-slate-200 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-emerald-100 text-emerald-800 border border-emerald-300">
                  <FileSpreadsheet className="w-6 h-6 text-emerald-700" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">
                    नूतनीकरण Excel डेटा इम्पोर्ट - पूर्वावलोकन आणि तारीख सेटिंग्ज
                  </h3>
                  <p className="text-xs text-slate-600 font-medium mt-0.5">
                    फाईल: <span className="font-bold text-slate-800">{renExcelImportModal.fileName}</span> • एकूण नोंदी:{' '}
                    <span className="font-bold text-emerald-700">{renExcelImportModal.rawRows.length}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setRenExcelImportModal({ isOpen: false, fileName: '', rawRows: [], preferFormat: 'DMY', swapDayMonth: false })}
                disabled={renImporting}
                className="p-2 rounded-xl bg-slate-100 text-slate-500 hover:text-slate-900 border border-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Date Preservation Guarantee Banner */}
            <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-blue-50 border border-emerald-300 rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span className="text-xs font-black text-emerald-950 uppercase tracking-wide">
                  एक्सेल तारीख संरक्षण हमी (Excel Date Preservation Guarantee)
                </span>
                <span className="ml-auto text-[11px] font-bold bg-emerald-100 text-emerald-800 px-2.5 py-0.5 rounded-full border border-emerald-300">
                  भारतीय पद्धत: DD/MM/YYYY
                </span>
              </div>
              <p className="text-xs text-slate-700 leading-relaxed">
                एक्सेल फाईल मधील तारीख <strong>जशी आहे तशीच</strong> (उदा. <span className="font-mono font-bold text-emerald-800">15/08/2025</span> किंवा <span className="font-mono font-bold text-emerald-800">07/09/2025</span>) प्रणालीमध्ये साठवली जाते. दिवस आणि महिना उलट-सुलट केला जात नाही (07/09/2025 हे ७ सप्टेंबर २०२५ म्हणूनच राहील).
              </p>
            </div>

            {/* Live Data Preview Table (Excel Date -> Imported Date) */}
            <div>
              <div className="text-xs font-bold text-slate-800 mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-blue-600" />
                  तारीख पडताळणी पूर्वावलोकन (Date Verification Preview):
                </span>
                <span className="text-[11px] text-slate-600 font-mono">
                  Excel Date <span className="text-blue-600 font-bold">→</span> Imported Date
                </span>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-bold">
                      <th className="p-2.5 w-12 text-center">अ.क्र.</th>
                      <th className="p-2.5">कामगाराचे नाव</th>
                      <th className="p-2.5 font-mono text-slate-700">Excel Date</th>
                      <th className="p-2.5 text-center text-slate-400">→</th>
                      <th className="p-2.5 font-mono text-emerald-800">Imported Date</th>
                      <th className="p-2.5">मराठी महिना पडताळणी</th>
                      <th className="p-2.5 text-center">स्थिती (Status)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {renExcelImportModal.rawRows.slice(0, 8).map((row, idx) => {
                      const getRowVal = (...keys: string[]) => {
                        const rowKeys = Object.keys(row);
                        for (const k of keys) {
                          const targetNorm = k.toLowerCase().replace(/[^a-z0-9\u0900-\u097F]/g, '');
                          const foundKey = rowKeys.find((rk) => {
                            const rkClean = rk.toLowerCase().trim();
                            const kClean = k.toLowerCase().trim();
                            if (rkClean === kClean || rkClean.includes(kClean)) return true;
                            const rkNorm = rk.toLowerCase().replace(/[^a-z0-9\u0900-\u097F]/g, '');
                            return targetNorm.length >= 3 && (rkNorm === targetNorm || rkNorm.includes(targetNorm));
                          });
                          if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null) {
                            return String(row[foundKey]).trim();
                          }
                        }
                        return '';
                      };

                      const name = getRowVal('Worker Name', 'Full Name', 'Name', 'नाव', 'कामगाराचे नाव', 'workerName') || 'Worker ' + (idx + 1);
                      const rawRen = getRowVal('Renewal Date', 'नूतनीकरण तारीख', 'renewalDate');
                      const dateResult = parseExcelDateStrict(rawRen);

                      return (
                        <tr key={idx} className="hover:bg-blue-50/50 transition-colors">
                          <td className="p-2.5 text-center font-mono text-slate-500 font-bold">{idx + 1}</td>
                          <td className="p-2.5 font-bold text-slate-900">{name}</td>
                          <td className="p-2.5 font-mono text-slate-700 bg-slate-50 font-semibold">
                            {rawRen || '-'}
                          </td>
                          <td className="p-2.5 text-center text-blue-600 font-bold">→</td>
                          <td className="p-2.5 font-mono font-bold text-emerald-700 bg-emerald-50/40">
                            {dateResult.valid ? dateResult.display : (dateResult.isBlank ? '-' : 'Invalid Date')}
                          </td>
                          <td className="p-2.5 text-slate-700 font-medium">
                            {dateResult.valid ? dateResult.marathiDisplay : (dateResult.isBlank ? '-' : 'अवैध तारीख')}
                          </td>
                          <td className="p-2.5 text-center">
                            {dateResult.valid || dateResult.isBlank ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md border border-emerald-300">
                                <Check className="w-3 h-3" /> Valid
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-md border border-rose-300">
                                <AlertTriangle className="w-3 h-3" /> Invalid/Ambiguous Date – Please Check
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setRenExcelImportModal({ isOpen: false, fileName: '', rawRows: [], preferFormat: 'DMY', swapDayMonth: false })}
                disabled={renImporting}
                className="py-2.5 px-5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs border border-slate-300 cursor-pointer transition-all"
              >
                रद्द करा (Cancel)
              </button>
              <button
                type="button"
                onClick={handleConfirmRenExcelImport}
                disabled={renImporting}
                className="py-2.5 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md cursor-pointer flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
              >
                {renImporting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>इम्पोर्ट प्रक्रिया सुरू आहे...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>सर्व {renExcelImportModal.rawRows.length} नोंदी अचूक तारखांसह इम्पोर्ट करा</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RENEWAL SWAP SELECTED DATES MODAL */}
      {renSwapDatesModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200/90 rounded-3xl max-w-xl w-full p-6 shadow-2xl relative text-slate-900 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-amber-100 text-amber-800 border border-amber-300">
                  <RefreshCw className="w-6 h-6 text-amber-700" />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">
                    तारीख आणि महिना अदलाबदल करा (Swap Date ⇄ Month)
                  </h3>
                  <p className="text-xs text-slate-600 font-medium">
                    निवडलेल्या <span className="font-bold text-amber-700">{selectedIds.size}</span> नूतनीकरण नोंदी
                  </p>
                </div>
              </div>
              <button
                onClick={() => setRenSwapDatesModalOpen(false)}
                disabled={renSwappingDates}
                className="p-2 rounded-xl bg-slate-100 text-slate-500 hover:text-slate-900 border border-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-950 space-y-1.5">
              <div className="font-bold flex items-center gap-1.5 text-amber-900">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                <span>या क्रियेमुळे काय होईल?</span>
              </div>
              <p>
                निवडलेल्या नूतनीकरण नोंदींमधील ज्या तारखांमध्ये दिवस (Day) आणि महिना (Month) दोन्ही १२ किंवा त्यापेक्षा कमी आहेत,
                त्यांचा दिवस आणि महिना उलट-सुलट केला जाईल. (उदा. <strong>04/09 ➔ 09/04</strong> किंवा <strong>09/04 ➔ 04/09</strong>).
              </p>
            </div>

            {/* Preview of selected rows that will change */}
            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-700">बदल होणाऱ्या नोंदींचे पूर्वावलोकन:</div>
              <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100 text-xs">
                {renewals
                  .filter((r) => selectedIds.has(r.id))
                  .slice(0, 10)
                  .map((r) => {
                    const originalRenDate = r.renewalDate;
                    const swappedRenDate = r.renewalDate ? swapDateAndMonth(r.renewalDate) : '';
                    const originalVerDate = r.verificationDate;
                    const swappedVerDate = r.verificationDate ? swapDateAndMonth(r.verificationDate) : '';

                    return (
                      <div key={r.id} className="p-2.5 bg-slate-50 hover:bg-white flex flex-col gap-1">
                        <div className="font-bold text-slate-900 flex items-center justify-between">
                          <span>{r.workerName}</span>
                          <span className="font-mono text-[11px] text-blue-700">{r.mhNumber || 'Pending'}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-[11px]">
                          <div>
                            <span className="text-slate-500">नूतनीकरण: </span>
                            <span className="line-through text-slate-400 mr-1">{formatDate(originalRenDate)}</span>
                            <span className="font-bold text-emerald-700 font-mono">
                              ➔ {formatDateWithMarathi(swappedRenDate)}
                            </span>
                          </div>
                          {originalVerDate && (
                            <div>
                              <span className="text-slate-500">पडताळणी: </span>
                              <span className="line-through text-slate-400 mr-1">{formatDate(originalVerDate)}</span>
                              <span className="font-bold text-blue-700 font-mono">
                                ➔ {formatDateWithMarathi(swappedVerDate)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* Buttons */}
            <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setRenSwapDatesModalOpen(false)}
                disabled={renSwappingDates}
                className="py-2 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs border border-slate-300 cursor-pointer"
              >
                रद्द करा
              </button>
              <button
                type="button"
                onClick={handleConfirmSwapSelectedRenDates}
                disabled={renSwappingDates}
                className="py-2 px-5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-md cursor-pointer flex items-center gap-2 active:scale-95 disabled:opacity-50"
              >
                {renSwappingDates ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>तारखा बदलत आहेत...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>होय, तारीख आणि महिना बदला</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
