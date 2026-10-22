import React, { useState, useRef, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  Award,
  Search,
  PlusCircle,
  Download,
  Printer,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  X,
  FileText,
  Filter,
  DollarSign,
  UserCheck,
  Building2,
  Edit,
  Calendar,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  AlertTriangle,
  FileSpreadsheet,
  Upload,
  Copy,
  Check,
  ShieldCheck,
  Phone,
  User as UserIcon,
  MapPin,
  RefreshCw,
  ExternalLink,
  History,
  Layers,
  Sparkles,
  Plus,
  ListFilter,
  SlidersHorizontal,
  Eye,
  FileSearch,
  Edit3,
  RotateCcw,
} from 'lucide-react';
import { WorkerClaim, ClaimScheme, WorkerRegistration, User } from '../types';
import { exportToCSV, formatDate } from '../utils/exportUtils';
import { getFinancialYearFromDate } from '../utils/renewalYearUtils';
import { OldClaimsManager } from './OldClaimsManager';
import { FromSourceFilterSelect } from './FromSourceFilterSelect';
import { FromSourceSelect } from './FromSourceSelect';
import { UiverseCheckbox } from './UiverseCheckbox';
import { TableSlideControls } from './TableSlideControls';

// Allowed Taluka choices for Maharashtra Building & Other Construction Workers
const TALUKA_OPTIONS = ['Junnar', 'Ambegaon', 'Khed', 'Shirur'] as const;

interface ClaimModuleProps {
  claims?: WorkerClaim[];
  registrations?: WorkerRegistration[];
  schemes?: any[];
  currentUser?: User;
  users?: User[];
  onAddClaim?: (claim: Omit<WorkerClaim, 'id'>) => Promise<any>;
  onUpdateClaimStatus?: (id: string, status: WorkerClaim['status'], remarks?: string, listNumber?: string) => Promise<void>;
  onDeleteClaim?: (id: string) => Promise<void>;
  onDeleteClaimsBulk?: (ids: string[]) => Promise<void>;
  onOpenPrintSlip?: (type: 'claim', data: any) => void;
  onResetClaims?: () => void;
  onRefreshClaims?: () => void;
}

export const ClaimModule: React.FC<ClaimModuleProps> = ({
  claims = [],
  registrations = [],
  currentUser,
  users = [],
  onAddClaim,
  onUpdateClaimStatus,
  onDeleteClaim,
  onDeleteClaimsBulk,
  onOpenPrintSlip,
  onResetClaims,
  onRefreshClaims,
}) => {
  // Role check: Only admin can access List Number and Scheme Master
  const isAdmin = Boolean(
    currentUser && (currentUser.role === 'admin' || String(currentUser.role).toLowerCase() === 'admin')
  );

  // Navigation tabs (defaults to claims)
  const [activeTab, setActiveTab] = useState<'claims' | 'new-claim' | 'list-view' | 'scheme-master' | 'old-claims'>('claims');

  // Protect Admin-only tabs: automatically redirect operators / sub-agents to claims list
  useEffect(() => {
    if (!isAdmin && (activeTab === 'list-view' || activeTab === 'scheme-master')) {
      setActiveTab('claims');
    }
  }, [isAdmin, activeTab]);

  // Dynamic Scheme Master State
  const [claimSchemes, setClaimSchemes] = useState<ClaimScheme[]>([]);
  const [isLoadingSchemes, setIsLoadingSchemes] = useState(false);
  const [schemeError, setSchemeError] = useState<string | null>(null);

  // Scheme Master Management (Admin)
  const [newSchemeName, setNewSchemeName] = useState('');
  const [newSchemeDefaultAmount, setNewSchemeDefaultAmount] = useState('');
  const [isAddingScheme, setIsAddingScheme] = useState(false);
  const [editingScheme, setEditingScheme] = useState<ClaimScheme | null>(null);
  const [editSchemeName, setEditSchemeName] = useState('');
  const [editSchemeAmount, setEditSchemeAmount] = useState('');
  const [isUpdatingScheme, setIsUpdatingScheme] = useState(false);

  // Search & Filters for Claims List
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Pending' | 'Approved' | 'Rejected'>('All');
  const [talukaFilter, setTalukaFilter] = useState<string>('');
  const [fromSourceFilter, setFromSourceFilter] = useState<string>('');
  const [financialYearFilter, setFinancialYearFilter] = useState<string>('All');
  const [schemeFilter, setSchemeFilter] = useState<string>('All');
  const [listNumberFilter, setListNumberFilter] = useState<string>('');
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Selection & Modals
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<{ id: string; name: string; claimId: string } | null>(null);
  const [bulkDeleteModal, setBulkDeleteModal] = useState<{ isOpen: boolean; ids: string[]; count: number } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Approve Claim Modal State (When Approve is clicked, prompt/enable List Number)
  const [approvingClaim, setApprovingClaim] = useState<WorkerClaim | null>(null);
  const [approveListNumber, setApproveListNumber] = useState('');
  const [approveRemarks, setApproveRemarks] = useState('');
  const [approveError, setApproveError] = useState<string | null>(null);
  const [isSubmittingApprove, setIsSubmittingApprove] = useState(false);

  // Reject Claim Modal State
  const [rejectingClaim, setRejectingClaim] = useState<WorkerClaim | null>(null);
  const [rejectRemarks, setRejectRemarks] = useState('');
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [isSubmittingReject, setIsSubmittingReject] = useState(false);

  // Bulk Approve Modal State
  const [isBulkApproveModalOpen, setIsBulkApproveModalOpen] = useState(false);
  const [bulkApproveListNumber, setBulkApproveListNumber] = useState('');
  const [bulkApproveRemarks, setBulkApproveRemarks] = useState('');
  const [bulkApproveError, setBulkApproveError] = useState<string | null>(null);
  const [isSubmittingBulkApprove, setIsSubmittingBulkApprove] = useState(false);

  // History / Audit Modal
  const [viewHistoryClaim, setViewHistoryClaim] = useState<WorkerClaim | null>(null);

  // Edit Existing Claim Modal
  const [editingClaim, setEditingClaim] = useState<WorkerClaim | null>(null);
  const [editForm, setEditForm] = useState<{
    scheme1Name: string;
    scheme1Amount: string;
    scheme2Name: string;
    scheme2Amount: string;
    verificationDate: string;
    taluka: string;
    fromSource: string;
    alternateMobileNumber: string;
    status: 'Pending' | 'Approved' | 'Rejected';
    listNumber: string;
    remarks: string;
  } | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editAmountWarning, setEditAmountWarning] = useState<string | null>(null);

  // Clipboard feedback
  const [copiedMh, setCopiedMh] = useState<string | null>(null);
  const claimTableRef = useRef<HTMLDivElement>(null);

  // --------------------------------------------------------------------------
  // CLAIM ENTRY FORM STATE (STRICT REQUIREMENT: NO CLAIM STATUS DROPDOWN)
  // --------------------------------------------------------------------------
  const [searchMhInput, setSearchMhInput] = useState('');
  const [isSearchingWorker, setIsSearchingWorker] = useState(false);
  const [workerNotFoundMessage, setWorkerNotFoundMessage] = useState<string | null>(null);
  const [isWorkerVerified, setIsWorkerVerified] = useState(false);
  const [workerClaimHistory, setWorkerClaimHistory] = useState<WorkerClaim[]>([]);
  const [multipleMatches, setMultipleMatches] = useState<Array<{ id: string; workerName: string; mhNumber: string; mobileNumber: string; sourceType: string }>>([]);

  // Form Fields:
  // 1. Worker Name (Auto-filled on search)
  const [formWorkerName, setFormWorkerName] = useState('');
  // 2. MH Number (Auto-filled on search)
  const [formMhNumber, setFormMhNumber] = useState('');
  // 3. Verification Date (MANUAL ONLY: initial empty, placeholder '-- Select Verification Date --')
  const [formVerificationDate, setFormVerificationDate] = useState('');
  // 4. Taluka (MANUAL ONLY: initial empty, placeholder '-- Select Taluka --')
  const [formTaluka, setFormTaluka] = useState('');
  // 5. Scheme 1 (Dynamic Scheme Master)
  const [formScheme1Name, setFormScheme1Name] = useState('');
  // 6. Claim Amount 1
  const [formClaimAmount1, setFormClaimAmount1] = useState('');
  // 7. Scheme 2 (Dynamic Scheme Master, Mandatory)
  const [formScheme2Name, setFormScheme2Name] = useState('');
  // 8. Claim Amount 2
  const [formClaimAmount2, setFormClaimAmount2] = useState('');
  // 9. Total (Auto-calculated formula: Amount 1 + Amount 2)
  // 10. From (MANUAL ONLY: initial empty, placeholder 'Enter From')
  const [formFromSource, setFormFromSource] = useState('');
  // 11. Alternate Mobile Number (10 digits)
  const [formAltMobileNumber, setFormAltMobileNumber] = useState('');
  // Mobile Number (Worker contact, auto-filled from worker)
  const [formMobileNumber, setFormMobileNumber] = useState('');
  // 12. Remarks (Mandatory, non-whitespace)
  const [formRemarks, setFormRemarks] = useState('');
  // 13. Claim Date (Mandatory, defaults to today)
  const [formClaimDate, setFormClaimDate] = useState(() => new Date().toISOString().split('T')[0]);
  // 14. Financial Year (Mandatory, dynamic)
  const [formFinancialYear, setFormFinancialYear] = useState(() => getFinancialYearFromDate(new Date()));
  // 15. List Number (Mandatory)
  const [formListNumber, setFormListNumber] = useState('');

  // Duplicate Claim Warning
  const [duplicateWarning, setDuplicateWarning] = useState<{
    message: string;
    existing?: {
      claimDate?: string;
      scheme1Name?: string;
      scheme2Name?: string;
      totalAmount?: number;
      listNumber?: string;
      financialYear?: string;
    };
  } | null>(null);

  // Submission State & Field-Level Errors
  const [isManualEntry, setIsManualEntry] = useState(false);
  const [isSubmittingClaim, setIsSubmittingClaim] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [lastCreatedClaim, setLastCreatedClaim] = useState<WorkerClaim | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // --------------------------------------------------------------------------
  // LIST NUMBER VIEW STATE
  // --------------------------------------------------------------------------
  const [listSearchNumber, setListSearchNumber] = useState('');
  const [searchedListData, setSearchedListData] = useState<{
    listNumber: string;
    totalWorkers: number;
    totalClaimAmount: number;
    claims: WorkerClaim[];
  } | null>(null);
  const [isLoadingListSearch, setIsLoadingListSearch] = useState(false);

  // Helper to get auth headers
  const getAuthHeaders = (): Record<string, string> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const token = localStorage.getItem('token');
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (currentUser?.id) headers['x-user-id'] = currentUser.id;
    if (currentUser?.username) headers['x-user-username'] = currentUser.username;
    if (currentUser?.role) headers['x-user-role'] = currentUser.role;
    return headers;
  };

  // --------------------------------------------------------------------------
  // FETCH SCHEMES FROM SCHEME MASTER
  // --------------------------------------------------------------------------
  const loadSchemes = async () => {
    setIsLoadingSchemes(true);
    setSchemeError(null);
    try {
      const res = await fetch('/api/claim-schemes?includeInactive=true', {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setClaimSchemes(data);
        }
      } else {
        const err = await res.json().catch(() => ({}));
        setSchemeError(err.error || 'Failed to load schemes');
      }
    } catch (err: any) {
      console.error('Error fetching claim schemes:', err);
      setSchemeError('Error fetching claim schemes from server.');
    } finally {
      setIsLoadingSchemes(false);
    }
  };

  useEffect(() => {
    loadSchemes();
  }, []);

  // Active schemes available for new claims
  const activeSchemes = useMemo(() => {
    return claimSchemes.filter((s) => s.isActive);
  }, [claimSchemes]);

  // Recalculate Financial Year when Claim Date changes
  useEffect(() => {
    if (formClaimDate) {
      setFormFinancialYear(getFinancialYearFromDate(formClaimDate));
    }
  }, [formClaimDate]);

  // Auto Total Calculation: Amount 1 + Amount 2
  const parsedAmount1 = useMemo(() => {
    const val = parseFloat(formClaimAmount1);
    return isNaN(val) || val <= 0 ? 0 : val;
  }, [formClaimAmount1]);

  const parsedAmount2 = useMemo(() => {
    const val = parseFloat(formClaimAmount2);
    return isNaN(val) || val <= 0 ? 0 : val;
  }, [formClaimAmount2]);

  const formTotalAmount = parsedAmount1 + parsedAmount2;

  // --------------------------------------------------------------------------
  // WORKER MH NUMBER SEARCH HANDLER
  // AUTO-FILL ONLY: Worker Name, Mobile Number
  // DO NOT AUTO-FILL: Verification Date, Taluka, Scheme, Amounts, From, Alt Mobile, Remarks, FY, List No
  // --------------------------------------------------------------------------
  const handleSearchWorkerByMh = async (mhToSearch?: string) => {
    const targetMh = (mhToSearch || searchMhInput).trim().toUpperCase();
    if (!targetMh) {
      setWorkerNotFoundMessage('कृपया वैध MH नंबर टाका (Please enter an MH Number).');
      return;
    }

    setIsSearchingWorker(true);
    setWorkerNotFoundMessage(null);
    setMultipleMatches([]);
    setDuplicateWarning(null);

    try {
      const res = await fetch(`/api/claims/worker-by-mh/${encodeURIComponent(targetMh)}`, {
        headers: getAuthHeaders(),
      });

      if (res.status === 404) {
        setWorkerNotFoundMessage('Worker not found in the software.');
        setIsWorkerVerified(false);
        setFormWorkerName('');
        setFormMhNumber('');
        setFormMobileNumber('');
        setWorkerClaimHistory([]);
        return;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setWorkerNotFoundMessage(err.error || 'Worker not found in the software.');
        setIsWorkerVerified(false);
        return;
      }

      const data = await res.json();

      // Check for multiple matches
      if (data.multipleMatches && data.multipleMatches.length > 1) {
        setMultipleMatches(data.multipleMatches);
        setIsWorkerVerified(false);
        setWorkerClaimHistory(data.claimsHistory || []);
        return;
      }

      if (data.found && data.worker) {
        // EXACT SINGLE MATCH
        setIsWorkerVerified(true);
        // AUTO-FILL: Worker Name, Mobile Number, and Assigned From
        setFormWorkerName(data.worker.workerName || '');
        setFormMhNumber(data.worker.mhNumber || targetMh);
        setFormMobileNumber(data.worker.mobileNumber || '');
        setFormFromSource(data.worker.fromSource || 'OFFICE');

        // VERIFICATION DATE & TALUKA MUST REMAIN BLANK (MANUAL ONLY)
        setFormVerificationDate('');
        setFormTaluka('');

        // Store past claims history sorted newest first
        setWorkerClaimHistory(data.claimsHistory || []);

        // Clear field error for MH Number and fromSource
        setFormErrors((prev) => {
          const next = { ...prev };
          delete next.mhNumber;
          delete next.fromSource;
          return next;
        });
      } else {
        setWorkerNotFoundMessage('Worker not found in the software.');
        setIsWorkerVerified(false);
      }
    } catch (err: any) {
      console.error('Error during MH search:', err);
      setWorkerNotFoundMessage('Worker not found in the software.');
      setIsWorkerVerified(false);
    } finally {
      setIsSearchingWorker(false);
    }
  };

  // Select one of multiple matches
  const handleSelectMultipleMatch = (match: { id: string; workerName: string; mhNumber: string; mobileNumber: string; fromSource?: string }) => {
    setIsWorkerVerified(true);
    setFormWorkerName(match.workerName);
    setFormMhNumber(match.mhNumber);
    setFormMobileNumber(match.mobileNumber);
    setFormFromSource(match.fromSource || 'OFFICE');
    setMultipleMatches([]);
    setFormVerificationDate('');
    setFormTaluka('');
    setFormErrors((prev) => {
      const next = { ...prev };
      delete next.mhNumber;
      delete next.fromSource;
      return next;
    });
  };

  // --------------------------------------------------------------------------
  // SCHEME SELECTION HANDLERS
  // Automatically loads default amount from Scheme Master
  // --------------------------------------------------------------------------
  const handleScheme1Select = (selectedName: string) => {
    setFormScheme1Name(selectedName);
    const matchedScheme = activeSchemes.find((s) => s.schemeName === selectedName);
    if (matchedScheme) {
      setFormClaimAmount1(String(matchedScheme.defaultAmount));
    } else {
      setFormClaimAmount1('');
    }
    // Check for duplicate in current FY
    checkDuplicateClaimWarning(formMhNumber, formFinancialYear, selectedName, formScheme2Name);
  };

  const handleScheme2Select = (selectedName: string) => {
    setFormScheme2Name(selectedName);
    if (!selectedName) {
      setFormClaimAmount2('');
      setFormErrors((prev) => {
        const next = { ...prev };
        delete next.scheme2Name;
        delete next.claimAmount2;
        return next;
      });
      checkDuplicateClaimWarning(formMhNumber, formFinancialYear, formScheme1Name, '');
      return;
    }
    const matchedScheme = activeSchemes.find((s) => s.schemeName === selectedName);
    if (matchedScheme) {
      setFormClaimAmount2(String(matchedScheme.defaultAmount));
    } else {
      setFormClaimAmount2('');
    }
    // Check for duplicate in current FY
    checkDuplicateClaimWarning(formMhNumber, formFinancialYear, formScheme1Name, selectedName);
  };

  // Merge workerClaimHistory from server with in-memory claims for this MH number
  const displayedWorkerHistory = useMemo(() => {
    const targetMh = (formMhNumber || searchMhInput).trim().toUpperCase().replace(/[\s-]/g, '');
    if (!targetMh) return workerClaimHistory;

    const inMemoryMatches = claims.filter(
      (c) => (c.mhNumber || '').trim().toUpperCase().replace(/[\s-]/g, '') === targetMh
    );

    const map = new Map<string, WorkerClaim>();
    workerClaimHistory.forEach((c) => {
      if (c && c.id) map.set(c.id, c);
    });
    inMemoryMatches.forEach((c) => {
      if (c && c.id) map.set(c.id, c);
    });

    return Array.from(map.values()).sort(
      (a, b) => new Date(b.claimDate).getTime() - new Date(a.claimDate).getTime()
    );
  }, [formMhNumber, searchMhInput, workerClaimHistory, claims]);

  // Real-time Duplicate Claim Check
  const checkDuplicateClaimWarning = (
    mh: string,
    fy: string,
    s1: string,
    s2: string
  ) => {
    if (!mh || !fy || (!s1 && !s2)) {
      setDuplicateWarning(null);
      return;
    }

    const cleanMh = mh.trim().toUpperCase().replace(/[\s-]/g, '');
    const cleanFy = fy.trim();
    const cleanS1 = s1.trim().toLowerCase();
    const cleanS2 = s2.trim().toLowerCase();

    const existingMatch = claims.find((c) => {
      const cMh = c.mhNumber.toUpperCase().replace(/[\s-]/g, '');
      const cFy = c.financialYear || getFinancialYearFromDate(c.claimDate);
      if (cMh !== cleanMh || cFy !== cleanFy) return false;

      const exS1 = (c.scheme1Name || '').trim().toLowerCase();
      const exS2 = (c.scheme2Name || '').trim().toLowerCase();

      return (
        (cleanS1 && (cleanS1 === exS1 || (exS2 && cleanS1 === exS2))) ||
        (cleanS2 && (cleanS2 === exS1 || (exS2 && cleanS2 === exS2)))
      );
    });

    if (existingMatch) {
      setDuplicateWarning({
        message: '⚠️ This worker already has a claim for this scheme in this financial year.',
        existing: {
          claimDate: existingMatch.claimDate,
          scheme1Name: existingMatch.scheme1Name,
          scheme2Name: existingMatch.scheme2Name,
          totalAmount: existingMatch.totalAmount,
          listNumber: existingMatch.listNumber,
          financialYear: existingMatch.financialYear,
        },
      });
    } else {
      setDuplicateWarning(null);
    }
  };

  // --------------------------------------------------------------------------
  // CLAIM FORM SUBMISSION (VALIDATE ALL 15 MANDATORY FIELDS & DOUBLE CLICK SHIELD)
  // --------------------------------------------------------------------------
  const handleSubmitNewClaim = async (e: React.FormEvent) => {
    e.preventDefault();

    const errors: Record<string, string> = {};

    // 1. Worker MH search verification (or direct manual entry)
    if (!isManualEntry && (!isWorkerVerified || !formMhNumber.trim())) {
      errors.mhNumber = 'Please search and verify worker MH Number or switch to Manual Entry mode.';
    } else if (isManualEntry && !formMhNumber.trim()) {
      errors.mhNumber = 'Please enter Worker MH Number.';
    }

    // 2. Worker Name
    if (!formWorkerName.trim()) {
      errors.workerName = 'Worker Name is required.';
    }

    // 3. Verification Date (Mandatory, manual entry only)
    if (!formVerificationDate || !formVerificationDate.trim()) {
      errors.verificationDate = 'Please select Verification Date.';
    }

    // 4. Taluka (Mandatory, manual selection only)
    if (!formTaluka || !TALUKA_OPTIONS.includes(formTaluka as any)) {
      errors.taluka = 'Please select Taluka.';
    }

    // 5. Scheme 1 & Claim Amount 1 (Mandatory)
    if (!formScheme1Name.trim()) {
      errors.scheme1Name = 'Please select Scheme 1.';
    }
    const amt1 = Number(formClaimAmount1);
    if (isNaN(amt1) || amt1 <= 0) {
      errors.claimAmount1 = 'Claim Amount 1 must be greater than 0.';
    }

    // 6. Scheme 2 & Claim Amount 2 (Optional: workers can apply for 1 or 2 schemes)
    let amt2 = 0;
    if (formScheme2Name.trim()) {
      const parsed2 = Number(formClaimAmount2);
      if (isNaN(parsed2) || parsed2 <= 0) {
        errors.claimAmount2 = 'Claim Amount 2 must be greater than 0 when Scheme 2 is selected.';
      } else {
        amt2 = parsed2;
      }
    }

    // 7. From (Automatically snapshot worker's assigned From)
    const effectiveFromSource = (formFromSource && formFromSource.trim()) || 'OFFICE';

    // 8. Alternate Mobile Number (10 digits)
    const cleanAltMobile = formAltMobileNumber.trim().replace(/\D/g, '');
    if (!cleanAltMobile || cleanAltMobile.length !== 10) {
      errors.alternateMobileNumber = 'Please enter a valid 10-digit mobile number.';
    }

    // 9. Remarks (Mandatory, non-whitespace)
    if (!formRemarks || !formRemarks.trim()) {
      errors.remarks = 'Please enter remarks.';
    }

    // 10. Claim Date
    if (!formClaimDate || !formClaimDate.trim()) {
      errors.claimDate = 'Please enter Claim Date.';
    }

    // 11. Financial Year
    if (!formFinancialYear || !formFinancialYear.trim()) {
      errors.financialYear = 'Please enter Financial Year.';
    }

    // Check Duplicate
    if (duplicateWarning) {
      errors.duplicate = duplicateWarning.message;
    }

    setFormErrors(errors);

    if (Object.keys(errors).length > 0) {
      return;
    }

    // DOUBLE CLICK SHIELD: Immediately disable button
    setIsSubmittingClaim(true);

    try {
      const claimPayload: any = {
        workerName: formWorkerName.trim(),
        mhNumber: formMhNumber.trim().toUpperCase(),
        verificationDate: formVerificationDate.trim(),
        taluka: formTaluka.trim(),
        scheme1Name: formScheme1Name.trim(),
        scheme1Amount: amt1,
        scheme2Name: formScheme2Name.trim() || undefined,
        scheme2Amount: amt2,
        fromSource: formFromSource.trim(),
        alternateMobileNumber: cleanAltMobile,
        mobileNumber: formMobileNumber.trim(),
        remarks: formRemarks.trim(),
        claimDate: formClaimDate.trim(),
        financialYear: formFinancialYear.trim(),
        status: 'Pending',
        listNumber: '',
        isManualEntry: isManualEntry,
      };

      let savedRecord: WorkerClaim | null = null;
      if (onAddClaim) {
        savedRecord = await onAddClaim(claimPayload);
      } else {
        const res = await fetch('/api/claims', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify(claimPayload),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to submit claim');
        }
        savedRecord = await res.json();
      }

      const finalClaim = savedRecord || {
        id: `CLM-${Date.now()}`,
        ...claimPayload,
        totalAmount: amt1 + amt2,
      };

      setLastCreatedClaim(finalClaim);
      const savedName = formWorkerName.trim();
      setSuccessToast(`कामगार "${savedName}" यांचा क्लेम अर्ज (प्रलंबित / Pending) यशस्वीरित्या जतन झाला. फॉर्म पुढील नोंदीसाठी क्लिअर झाला आहे.`);

      // --------------------------------------------------------------------------
      // AUTO-CLEAR ALL FORM DATA IMMEDIATELY FOR NEXT WORKER ENTRY
      // --------------------------------------------------------------------------
      setSearchMhInput('');
      setFormWorkerName('');
      setFormMhNumber('');
      setFormMobileNumber('');
      setFormVerificationDate('');
      setFormTaluka('');
      setFormScheme1Name('');
      setFormClaimAmount1('');
      setFormScheme2Name('');
      setFormClaimAmount2('');
      setFormAltMobileNumber('');
      setFormFromSource('');
      setFormRemarks('');
      setFormListNumber('');
      setFormClaimDate(new Date().toISOString().split('T')[0]);
      setFormFinancialYear(getFinancialYearFromDate(new Date()));
      setIsWorkerVerified(false);
      setIsManualEntry(false);
      setWorkerClaimHistory([]);
      setFormErrors({});
      setDuplicateWarning(null);
      setWorkerNotFoundMessage(null);
      setMultipleMatches([]);

      // Auto-focus search input for next worker entry
      setTimeout(() => {
        if (searchInputRef.current) {
          searchInputRef.current.focus();
        }
      }, 150);

      // Refresh list in background
      window.dispatchEvent(new Event('refreshClaims'));
      if (onRefreshClaims) onRefreshClaims();
    } catch (err: any) {
      console.error('Error submitting claim:', err);
      setFormErrors({ submit: err.message || 'Error submitting claim. Please verify fields and try again.' });
    } finally {
      setIsSubmittingClaim(false);
    }
  };

  // Helper to cleanly reset form for next worker
  const handleResetClaimForm = () => {
    setSearchMhInput('');
    setFormWorkerName('');
    setFormMhNumber('');
    setFormMobileNumber('');
    setFormVerificationDate('');
    setFormTaluka('');
    setFormScheme1Name('');
    setFormClaimAmount1('');
    setFormScheme2Name('');
    setFormClaimAmount2('');
    setFormAltMobileNumber('');
    setFormFromSource('');
    setFormRemarks('');
    setFormListNumber('');
    setFormClaimDate(new Date().toISOString().split('T')[0]);
    setFormFinancialYear(getFinancialYearFromDate(new Date()));
    setIsWorkerVerified(false);
    setIsManualEntry(false);
    setWorkerClaimHistory([]);
    setFormErrors({});
    setDuplicateWarning(null);
    setWorkerNotFoundMessage(null);
    setMultipleMatches([]);
    setSuccessToast(null);
    setTimeout(() => {
      if (searchInputRef.current) {
        searchInputRef.current.focus();
      }
    }, 100);
  };

  // --------------------------------------------------------------------------
  // SCHEME MASTER CRUD (ADMIN)
  // --------------------------------------------------------------------------
  const handleAddScheme = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newSchemeName.trim();
    const amount = Number(newSchemeDefaultAmount);

    if (!name) {
      alert('कृपया योजनेचे नाव टाका (Scheme Name is required)');
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      alert('कृपया ० पेक्षा जास्त रक्कम टाका (Default Amount must be > 0)');
      return;
    }

    setIsAddingScheme(true);
    try {
      const res = await fetch('/api/claim-schemes', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ schemeName: name, defaultAmount: amount }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to add scheme');
      }

      setNewSchemeName('');
      setNewSchemeDefaultAmount('');
      setSuccessToast(`योजना "${data.schemeName}" (₹${data.defaultAmount}) यशस्वीरित्या जोडली.`);
      await loadSchemes();
    } catch (err: any) {
      alert(err.message || 'Error creating scheme');
    } finally {
      setIsAddingScheme(false);
    }
  };

  const handleUpdateScheme = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingScheme) return;
    const name = editSchemeName.trim();
    const amount = Number(editSchemeAmount);

    if (!name) {
      alert('Scheme name cannot be empty');
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      alert('Amount must be greater than 0');
      return;
    }

    setIsUpdatingScheme(true);
    try {
      const res = await fetch(`/api/claim-schemes/${editingScheme.id}`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ schemeName: name, defaultAmount: amount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update scheme');

      setEditingScheme(null);
      setSuccessToast(`योजना "${name}" यशस्वीरित्या अद्ययावत झाली.`);
      await loadSchemes();
    } catch (err: any) {
      alert(err.message || 'Error updating scheme');
    } finally {
      setIsUpdatingScheme(false);
    }
  };

  const handleToggleSchemeStatus = async (scheme: ClaimScheme) => {
    const actionLabel = scheme.isActive ? 'Deactivate (निष्क्रिय करा)' : 'Activate (सक्रिय करा)';
    if (!confirm(`तुम्हाला खात्री आहे का? "${scheme.schemeName}" योजना ${actionLabel}?`)) return;

    try {
      const res = await fetch(`/api/claim-schemes/${scheme.id}/status`, {
        method: 'PATCH',
        headers: getAuthHeaders(),
        body: JSON.stringify({ isActive: !scheme.isActive }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to toggle scheme status');

      await loadSchemes();
    } catch (err: any) {
      alert(err.message || 'Error updating scheme status');
    }
  };

  const handleDeleteScheme = async (scheme: ClaimScheme) => {
    if (!confirm(`तुम्हाला "${scheme.schemeName}" ही योजना काढायची आहे का? (टीप: जुन्या क्लेममध्ये वापरलेली असल्यास ही फक्त निष्क्रिय केली जाईल).`)) return;

    try {
      const res = await fetch(`/api/claim-schemes/${scheme.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete scheme');

      setSuccessToast(data.message || 'Scheme processed.');
      await loadSchemes();
    } catch (err: any) {
      alert(err.message || 'Error processing scheme deletion');
    }
  };

  // --------------------------------------------------------------------------
  // LIST NUMBER VIEW SEARCH
  // --------------------------------------------------------------------------
  const handleSearchListNumber = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = listSearchNumber.trim();
    if (!query) return;

    setIsLoadingListSearch(true);
    try {
      const res = await fetch(`/api/claims/list/${encodeURIComponent(query)}`, {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        setSearchedListData(data);
      } else {
        const matching = claims.filter((c) => c.listNumber && c.listNumber.trim().toLowerCase() === query.toLowerCase());
        const totalAmount = matching.reduce((sum, c) => sum + (c.totalAmount || 0), 0);
        setSearchedListData({
          listNumber: query,
          totalWorkers: matching.length,
          totalClaimAmount: totalAmount,
          claims: matching,
        });
      }
    } catch (err) {
      console.error('Error searching list number:', err);
    } finally {
      setIsLoadingListSearch(false);
    }
  };

  // --------------------------------------------------------------------------
  // EDIT CLAIM MODAL & APPROVAL / REJECTION ACTIONS
  // --------------------------------------------------------------------------
  const handleOpenEditClaim = (claim: WorkerClaim) => {
    setEditingClaim(claim);
    const initialStatus: 'Pending' | 'Approved' | 'Rejected' =
      claim.status === 'Approved' ? 'Approved' :
      claim.status === 'Rejected' ? 'Rejected' : 'Pending';

    setEditForm({
      scheme1Name: claim.scheme1Name || '',
      scheme1Amount: String(claim.scheme1Amount || ''),
      scheme2Name: claim.scheme2Name || '',
      scheme2Amount: String(claim.scheme2Amount || ''),
      verificationDate: claim.verificationDate || '',
      taluka: claim.taluka || '',
      fromSource: claim.fromSource || '',
      alternateMobileNumber: claim.alternateMobileNumber || '',
      status: initialStatus,
      listNumber: claim.listNumber || '',
      remarks: claim.remarks || '',
    });
    setEditAmountWarning(null);
  };

  const handleSaveEditClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClaim || !editForm) return;

    if (!editForm.fromSource || !editForm.fromSource.trim()) {
      alert('Please enter From.');
      return;
    }

    if (editForm.status === 'Approved' && !editForm.listNumber.trim()) {
      alert('⚠️ फॉर्म मंजूर (Approved) करताना शासकीय यादी क्रमांक (List Number) प्रविष्ट करणे अनिवार्य आहे.');
      return;
    }

    const s1Amt = Number(editForm.scheme1Amount);
    const s2Amt = Number(editForm.scheme2Amount);
    const newTotal = s1Amt + s2Amt;

    const isAmountChanged = newTotal !== editingClaim.totalAmount;
    if (isAmountChanged && !confirm(`⚠️ Claim Amount Modification Warning:\nमूळ रक्कम ₹${editingClaim.totalAmount} वरून बदलून ₹${newTotal} केली जात आहे. हा बदल हिस्ट्रीमध्ये नोंदवला जाईल. पुढे जायचे का?`)) {
      return;
    }

    setIsSavingEdit(true);
    try {
      const res = await fetch(`/api/claims/${editingClaim.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          scheme1Name: editForm.scheme1Name,
          scheme1Amount: s1Amt,
          scheme2Name: editForm.scheme2Name,
          scheme2Amount: s2Amt,
          verificationDate: editForm.verificationDate,
          taluka: editForm.taluka,
          fromSource: editForm.fromSource.trim(),
          alternateMobileNumber: editForm.alternateMobileNumber,
          status: editForm.status,
          listNumber: editForm.status === 'Approved' ? editForm.listNumber.trim() : '',
          remarks: editForm.remarks,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update claim');

      setSuccessToast(`क्लेम नोंद ${editingClaim.id} यशस्वीरित्या अद्ययावत केली.`);
      setEditingClaim(null);
      window.dispatchEvent(new Event('refreshClaims'));
      if (onRefreshClaims) onRefreshClaims();
    } catch (err: any) {
      alert(err.message || 'Error updating claim');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Open Approve Modal (Prompt for List Number)
  const handleOpenApproveModal = (claim: WorkerClaim) => {
    setApprovingClaim(claim);
    setApproveListNumber(claim.listNumber || '');
    setApproveRemarks('');
    setApproveError(null);
  };

  const handleConfirmApprove = async () => {
    if (!approvingClaim) return;
    const cleanListNum = approveListNumber.trim();
    if (!cleanListNum) {
      setApproveError('कृपया शासकीय यादी क्रमांक (List Number) प्रविष्ट करा.');
      return;
    }

    setIsSubmittingApprove(true);
    setApproveError(null);
    try {
      if (onUpdateClaimStatus) {
        await onUpdateClaimStatus(
          approvingClaim.id,
          'Approved',
          approveRemarks.trim() || `शासकीय यादी क्र. ${cleanListNum} मध्ये मंजूर`,
          cleanListNum
        );
      } else {
        const res = await fetch(`/api/claims/${approvingClaim.id}`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            status: 'Approved',
            listNumber: cleanListNum,
            remarks: approveRemarks.trim() || `शासकीय यादी क्र. ${cleanListNum} मध्ये मंजूर`,
            operatorName: currentUser?.name,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Failed to approve claim');
        }
      }

      setSuccessToast(`कामगार "${approvingClaim.workerName}" यांचा क्लेम मंजूर झाला आणि यादी क्र. ${cleanListNum} यशस्वीरित्या जोडला.`);
      setApprovingClaim(null);
      window.dispatchEvent(new Event('refreshClaims'));
      if (onRefreshClaims) onRefreshClaims();
    } catch (err: any) {
      setApproveError(err.message || 'Error approving claim');
    } finally {
      setIsSubmittingApprove(false);
    }
  };

  // Open Reject Modal
  const handleOpenRejectModal = (claim: WorkerClaim) => {
    setRejectingClaim(claim);
    setRejectRemarks('');
    setRejectError(null);
  };

  const handleConfirmReject = async () => {
    if (!rejectingClaim) return;
    const cleanRemarks = rejectRemarks.trim();
    if (!cleanRemarks) {
      setRejectError('कृपया नामंजूर करण्याचे कारण (शेरा) प्रविष्ट करा.');
      return;
    }

    setIsSubmittingReject(true);
    setRejectError(null);
    try {
      if (onUpdateClaimStatus) {
        await onUpdateClaimStatus(rejectingClaim.id, 'Rejected', cleanRemarks);
      } else {
        const res = await fetch(`/api/claims/${rejectingClaim.id}`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            status: 'Rejected',
            remarks: cleanRemarks,
            operatorName: currentUser?.name,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Failed to reject claim');
        }
      }

      setSuccessToast(`कामगार "${rejectingClaim.workerName}" यांचा क्लेम नामंजूर केला.`);
      setRejectingClaim(null);
      window.dispatchEvent(new Event('refreshClaims'));
      if (onRefreshClaims) onRefreshClaims();
    } catch (err: any) {
      setRejectError(err.message || 'Error rejecting claim');
    } finally {
      setIsSubmittingReject(false);
    }
  };

  // Reset to Pending
  const handleConfirmResetPending = async (claim: WorkerClaim) => {
    try {
      if (onUpdateClaimStatus) {
        await onUpdateClaimStatus(claim.id, 'Pending', 'स्थिती प्रलंबित (Pending) केली');
      } else {
        await fetch(`/api/claims/${claim.id}`, {
          method: 'PUT',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            status: 'Pending',
            remarks: 'स्थिती प्रलंबित (Pending) केली',
            operatorName: currentUser?.name,
          }),
        });
      }
      setSuccessToast(`कामगार "${claim.workerName}" यांचा क्लेम प्रलंबित (Pending) केला.`);
      window.dispatchEvent(new Event('refreshClaims'));
      if (onRefreshClaims) onRefreshClaims();
    } catch (err: any) {
      alert(err.message || 'Error updating status');
    }
  };

  // Bulk Approve Selected Claims
  const handleConfirmBulkApprove = async () => {
    const cleanListNum = bulkApproveListNumber.trim();
    if (!cleanListNum) {
      setBulkApproveError('कृपया शासकीय यादी क्रमांक (List Number) प्रविष्ट करा.');
      return;
    }
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    setIsSubmittingBulkApprove(true);
    setBulkApproveError(null);
    try {
      const res = await fetch('/api/claims/bulk-status', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          ids,
          status: 'Approved',
          listNumber: cleanListNum,
          remarks: bulkApproveRemarks.trim() || `शासकीय यादी क्र. ${cleanListNum} मध्ये मंजूर`,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to bulk approve claims');
      }

      setSuccessToast(`निवडलेले ${ids.length} क्लेम अर्ज यादी क्र. ${cleanListNum} मध्ये यशस्वीरीत्या मंजूर झाले.`);
      setIsBulkApproveModalOpen(false);
      setSelectedIds(new Set());
      window.dispatchEvent(new Event('refreshClaims'));
      if (onRefreshClaims) onRefreshClaims();
    } catch (err: any) {
      setBulkApproveError(err.message || 'Error updating claims');
    } finally {
      setIsSubmittingBulkApprove(false);
    }
  };

  // --------------------------------------------------------------------------
  // CLAIMS FILTERING & SEARCH
  // --------------------------------------------------------------------------
  const filteredClaims = useMemo(() => {
    return claims.filter((claim) => {
      // Free text search: Worker Name, MH Number, Mobile Number, List Number
      if (searchTerm.trim()) {
        const q = searchTerm.trim().toLowerCase();
        const matchesName = (claim.workerName || '').toLowerCase().includes(q);
        const matchesMh = (claim.mhNumber || '').toLowerCase().includes(q);
        const matchesMobile = (claim.mobileNumber || '').includes(q);
        const matchesAltMobile = (claim.alternateMobileNumber || '').includes(q);
        const matchesList = (claim.listNumber || '').toLowerCase().includes(q);
        if (!matchesName && !matchesMh && !matchesMobile && !matchesAltMobile && !matchesList) {
          return false;
        }
      }

      // Taluka filter
      if (talukaFilter && claim.taluka !== talukaFilter) {
        return false;
      }

      // From Source filter
      if (fromSourceFilter && claim.fromSource !== fromSourceFilter) {
        return false;
      }

      // Financial Year filter
      if (financialYearFilter !== 'All') {
        const fy = claim.financialYear || getFinancialYearFromDate(claim.claimDate);
        if (fy !== financialYearFilter) return false;
      }

      // Scheme filter
      if (schemeFilter !== 'All') {
        const hasScheme =
          claim.scheme1Name === schemeFilter ||
          claim.scheme2Name === schemeFilter;
        if (!hasScheme) return false;
      }

      // List Number filter
      if (listNumberFilter.trim()) {
        const ln = listNumberFilter.trim().toLowerCase();
        if (!(claim.listNumber || '').toLowerCase().includes(ln)) {
          return false;
        }
      }

      // Status filter
      if (statusFilter !== 'All') {
        if (statusFilter === 'Pending') {
          const isPending =
            claim.status === 'Pending' ||
            claim.status === 'Submitted' ||
            claim.status === 'Under Scrutiny' ||
            !claim.status ||
            (claim.status as string) === 'DRAFT';
          if (!isPending) return false;
        } else if (statusFilter === 'Approved') {
          if (claim.status !== 'Approved') return false;
        } else if (statusFilter === 'Rejected') {
          if (claim.status !== 'Rejected') return false;
        }
      }

      // Date range filter
      if (fromDate) {
        const cDate = (claim.claimDate || '').slice(0, 10);
        if (!cDate || cDate < fromDate) {
          return false;
        }
      }
      if (toDate) {
        const cDate = (claim.claimDate || '').slice(0, 10);
        if (!cDate || cDate > toDate) {
          return false;
        }
      }

      return true;
    });
  }, [
    claims,
    searchTerm,
    statusFilter,
    talukaFilter,
    fromSourceFilter,
    financialYearFilter,
    schemeFilter,
    listNumberFilter,
    fromDate,
    toDate,
  ]);

  // Quick Date Range Preset Helpers
  const handleApplyDatePreset = (preset: 'today' | 'last7' | 'thisMonth' | 'thisFY' | 'clear') => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    if (preset === 'today') {
      setFromDate(todayStr);
      setToDate(todayStr);
    } else if (preset === 'last7') {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      setFromDate(d.toISOString().split('T')[0]);
      setToDate(todayStr);
    } else if (preset === 'thisMonth') {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      const y = firstDay.getFullYear();
      const m = String(firstDay.getMonth() + 1).padStart(2, '0');
      setFromDate(`${y}-${m}-01`);
      setToDate(todayStr);
    } else if (preset === 'thisFY') {
      const month = today.getMonth(); // 0-indexed: 0=Jan, 3=Apr
      const year = today.getFullYear();
      const startYear = month >= 3 ? year : year - 1;
      setFromDate(`${startYear}-04-01`);
      setToDate(`${startYear + 1}-03-31`);
    } else if (preset === 'clear') {
      setFromDate('');
      setToDate('');
    }
    setCurrentPage(1);
  };

  const isAnyFilterActive = Boolean(
    statusFilter !== 'All' ||
    fromDate ||
    toDate ||
    searchTerm.trim() ||
    talukaFilter ||
    fromSourceFilter ||
    financialYearFilter !== 'All' ||
    schemeFilter !== 'All' ||
    listNumberFilter.trim()
  );

  const handleResetAllFilters = () => {
    setSearchTerm('');
    setStatusFilter('All');
    setTalukaFilter('');
    setFromSourceFilter('');
    setFinancialYearFilter('All');
    setSchemeFilter('All');
    setListNumberFilter('');
    setFromDate('');
    setToDate('');
    setCurrentPage(1);
  };

  // Status Counts
  const pendingCount = useMemo(
    () =>
      claims.filter(
        (c) =>
          c.status === 'Pending' ||
          c.status === 'Submitted' ||
          c.status === 'Under Scrutiny' ||
          !c.status ||
          (c.status as string) === 'DRAFT'
      ).length,
    [claims]
  );
  const approvedCount = useMemo(
    () => claims.filter((c) => c.status === 'Approved').length,
    [claims]
  );
  const rejectedCount = useMemo(
    () => claims.filter((c) => c.status === 'Rejected').length,
    [claims]
  );

  // Existing distinct List Numbers (for quick suggestion when approving)
  const existingListNumbers = useMemo(() => {
    const set = new Set<string>();
    claims.forEach((c) => {
      if (c.listNumber && c.listNumber.trim()) {
        set.add(c.listNumber.trim());
      }
    });
    return Array.from(set).sort();
  }, [claims]);

  // Pagination
  const totalPages = pageSize === -1 ? 1 : Math.ceil(filteredClaims.length / pageSize);
  const paginatedClaims = useMemo(() => {
    if (pageSize === -1) return filteredClaims;
    const start = (currentPage - 1) * pageSize;
    return filteredClaims.slice(start, start + pageSize);
  }, [filteredClaims, currentPage, pageSize]);

  // Financial Year Options
  const financialYearOptions = useMemo(() => {
    const set = new Set<string>();
    const currentFY = getFinancialYearFromDate(new Date());
    set.add(currentFY);
    claims.forEach((c) => {
      const fy = c.financialYear || getFinancialYearFromDate(c.claimDate);
      if (fy) set.add(fy);
    });
    return Array.from(set).sort().reverse();
  }, [claims]);

  // Distinct Talukas for Filter
  const availableTalukas = useMemo(() => {
    return Array.from(new Set([...TALUKA_OPTIONS, ...claims.map((c) => c.taluka).filter(Boolean)])).sort();
  }, [claims]);

  // Summary Metrics
  const summaryMetrics = useMemo(() => {
    const totalCount = filteredClaims.length;
    const totalAmount = filteredClaims.reduce((sum, c) => sum + (c.totalAmount || 0), 0);

    const now = new Date();
    const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const thisMonthClaims = filteredClaims.filter((c) => (c.claimDate || '').startsWith(currentMonthStr));
    const thisMonthAmount = thisMonthClaims.reduce((sum, c) => sum + (c.totalAmount || 0), 0);

    return {
      totalCount,
      totalAmount,
      thisMonthCount: thisMonthClaims.length,
      thisMonthAmount,
    };
  }, [filteredClaims]);

  // Copy MH Helper
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

  // Multi-selection
  const isAllCurrentPageSelected =
    paginatedClaims.length > 0 && paginatedClaims.every((c) => selectedIds.has(c.id));

  const toggleSelectCurrentPage = () => {
    const next = new Set(selectedIds);
    if (isAllCurrentPageSelected) {
      paginatedClaims.forEach((c) => next.delete(c.id));
    } else {
      paginatedClaims.forEach((c) => next.add(c.id));
    }
    setSelectedIds(next);
  };

  const toggleSelectId = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  // Bulk Delete
  const handleExecuteBulkDelete = async () => {
    if (!bulkDeleteModal) return;
    setIsDeleting(true);
    try {
      if (onDeleteClaimsBulk) {
        await onDeleteClaimsBulk(bulkDeleteModal.ids);
      } else {
        const res = await fetch('/api/claims/bulk-delete', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ ids: bulkDeleteModal.ids }),
        });
        if (!res.ok) throw new Error('Bulk delete failed');
      }
      setSelectedIds(new Set());
      setBulkDeleteModal(null);
      setSuccessToast(`${bulkDeleteModal.count} क्लेम नोंदी यशस्वीरित्या हटवल्या.`);
    } catch (err: any) {
      alert(err.message || 'Error deleting claims');
    } finally {
      setIsDeleting(false);
    }
  };

  // Single Delete
  const handleExecuteSingleDelete = async () => {
    if (!deleteConfirmItem) return;
    setIsDeleting(true);
    try {
      if (onDeleteClaim) {
        await onDeleteClaim(deleteConfirmItem.id);
      } else {
        const res = await fetch(`/api/claims/${deleteConfirmItem.id}`, {
          method: 'DELETE',
          headers: getAuthHeaders(),
        });
        if (!res.ok) throw new Error('Failed to delete claim');
      }
      setDeleteConfirmItem(null);
      setSuccessToast(`नोंद "${deleteConfirmItem.name}" यशस्वीरित्या हटवली.`);
    } catch (err: any) {
      alert(err.message || 'Error deleting claim');
    } finally {
      setIsDeleting(false);
    }
  };

  // Export filtered claims to Excel
  const handleExportClaimsToExcel = () => {
    if (filteredClaims.length === 0) {
      alert('कोणत्याही नोंदी उपलब्ध नाहीत.');
      return;
    }
    const dataToExport = filteredClaims.map((c, idx) => {
      const row: any = {
        'Sr. No': idx + 1,
        'Claim ID': c.id,
        'Worker Name': c.workerName,
        'MH Number': c.mhNumber,
        'Mobile Number': c.mobileNumber,
        'Alternate Mobile': c.alternateMobileNumber || '',
        'Verification Date': c.verificationDate || '',
        'Taluka': c.taluka,
        'Scheme 1': c.scheme1Name,
        'Amount 1 (₹)': c.scheme1Amount,
        'Scheme 2': c.scheme2Name || '',
        'Amount 2 (₹)': c.scheme2Amount || 0,
        'Total Amount (₹)': c.totalAmount,
        'From Source': c.fromSource || '',
        'Financial Year': c.financialYear || '',
      };
      if (isAdmin) {
        row['List Number'] = c.listNumber || '';
      }
      row['Claim Date'] = c.claimDate;
      row['Created By'] = c.createdBy || c.operatorName || '';
      row['Remarks'] = c.remarks || '';
      return row;
    });

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Claims');
    XLSX.writeFile(wb, `Welfare_Claims_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // --------------------------------------------------------------------------
  // RENDER COMPONENT
  // --------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      {/* SUCCESS TOAST BANNER */}
      {successToast && (
        <div className="fixed top-5 right-5 z-50 p-4 rounded-2xl bg-emerald-900 text-white shadow-2xl flex items-center gap-3 border border-emerald-600 animate-in slide-in-from-top duration-300">
          <CheckCircle2 className="w-5 h-5 text-emerald-300 shrink-0" />
          <span className="text-xs font-bold">{successToast}</span>
          <button
            type="button"
            onClick={() => setSuccessToast(null)}
            className="p-1 hover:bg-emerald-800 rounded-lg text-white/80"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* HEADER & TOP CONTROLS */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-blue-900 text-white shadow-xs">
              <Award className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                <span>Claim Management (कल्याणकारी योजना क्लेम)</span>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-900">
                  ERP Module
                </span>
              </h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                इमारत व इतर बांधकाम कामगार कल्याणकारी योजनांचे क्लेम अर्ज, योजना मास्टर व लिस्ट नंबर व्यवस्थापन
              </p>
            </div>
          </div>
        </div>

        {/* PRIMARY ACTION BUTTONS */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveTab('new-claim');
              // Clear previous search and errors
              setWorkerNotFoundMessage(null);
            }}
            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-xs cursor-pointer ${
              activeTab === 'new-claim'
                ? 'bg-blue-900 text-white shadow-md'
                : 'bg-blue-800 hover:bg-blue-900 text-white'
            }`}
          >
            <PlusCircle className="w-4 h-4 text-cyan-300" />
            <span>नवीन क्लेम नोंदणी (New Claim Entry)</span>
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => setActiveTab('list-view')}
              className={`px-3.5 py-2.5 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'list-view'
                  ? 'bg-blue-50 text-blue-900 border-blue-400 font-black'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300'
              }`}
            >
              <FileSearch className="w-4 h-4 text-blue-700" />
              <span>लिस्ट नंबरनुसार पहा (List Search)</span>
            </button>
          )}

          {isAdmin && (
            <button
              type="button"
              onClick={() => setActiveTab('scheme-master')}
              className={`px-3.5 py-2.5 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'scheme-master'
                  ? 'bg-purple-50 text-purple-900 border-purple-400 font-black'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300'
              }`}
              title="Dynamic Scheme Master for Admin"
            >
              <SlidersHorizontal className="w-4 h-4 text-purple-700" />
              <span>योजना मास्टर (Scheme Master)</span>
            </button>
          )}
        </div>
      </div>

      {/* NAVIGATION TABS BAR */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto text-xs font-bold">
        <button
          type="button"
          onClick={() => setActiveTab('claims')}
          className={`px-4 py-2 rounded-xl transition cursor-pointer flex items-center gap-2 ${
            activeTab === 'claims'
              ? 'bg-blue-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Award className="w-4 h-4" />
          <span>सर्व क्लेम यादी (Active Claims: {claims.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('new-claim')}
          className={`px-4 py-2 rounded-xl transition cursor-pointer flex items-center gap-2 ${
            activeTab === 'new-claim'
              ? 'bg-blue-900 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <PlusCircle className="w-4 h-4" />
          <span>नवीन क्लेम अर्ज (New Claim Form)</span>
        </button>

        {isAdmin && (
          <button
            type="button"
            onClick={() => setActiveTab('list-view')}
            className={`px-4 py-2 rounded-xl transition cursor-pointer flex items-center gap-2 ${
              activeTab === 'list-view'
                ? 'bg-blue-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>गव्हर्नमेंट लिस्ट नंबर व्ह्यू (List Number)</span>
          </button>
        )}

        {isAdmin && (
          <button
            type="button"
            onClick={() => setActiveTab('scheme-master')}
            className={`px-4 py-2 rounded-xl transition cursor-pointer flex items-center gap-2 ${
              activeTab === 'scheme-master'
                ? 'bg-purple-900 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>योजना मास्टर (Scheme Master: {claimSchemes.length})</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => setActiveTab('old-claims')}
          className={`px-4 py-2 rounded-xl transition cursor-pointer flex items-center gap-2 ${
            activeTab === 'old-claims'
              ? 'bg-slate-800 text-white shadow-xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <History className="w-4 h-4" />
          <span>जुना क्लेम डेटा (Old Claims Archive)</span>
        </button>
      </div>

      {/* ==================================================================== */}
      {/* TAB 1: NEW CLAIM ENTRY FORM                                          */}
      {/* ==================================================================== */}
      {activeTab === 'new-claim' && (
        <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-7 shadow-lg space-y-6 max-w-4xl mx-auto">
          <div className="border-b border-slate-100 pb-4 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Award className="w-5 h-5 text-blue-900" />
                <span>Welfare Scheme Claim Entry Form (नवीन क्लेम अर्ज)</span>
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                सर्व आवश्यक फील्ड (*) मॅन्युअली तपासा व भरा. Total आपोआप मोजले जाईल.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('claims')}
              className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
            >
              ← यादीकडे परत जा
            </button>
          </div>

          {/* LAST CREATED CLAIM SUCCESS & INSTANT PRINT SLIP BANNER */}
          {lastCreatedClaim && (
            <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-emerald-50 via-teal-50 to-green-50 border-2 border-emerald-400 text-emerald-950 space-y-3 shadow-md animate-in fade-in">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 font-black text-sm text-emerald-900">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span>क्लेम अर्ज यशस्वीरित्या जतन झाला! (फॉर्म नवीन नोंदीसाठी ऑटो-क्लिअर झाला आहे)</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {onOpenPrintSlip && (
                    <button
                      type="button"
                      onClick={() => onOpenPrintSlip('claim', lastCreatedClaim)}
                      className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      <Printer className="w-4 h-4" />
                      <span>पावती प्रिंट करा (Print Slip)</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setLastCreatedClaim(null);
                      setSuccessToast(null);
                      handleResetClaimForm();
                    }}
                    className="px-3.5 py-2 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <PlusCircle className="w-4 h-4 text-cyan-300" />
                    <span>पुढील क्लेम करा (Next Entry)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLastCreatedClaim(null);
                      setSuccessToast(null);
                    }}
                    className="p-2 bg-white/80 hover:bg-white text-slate-600 hover:text-slate-900 border border-emerald-300 rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer shadow-xs"
                    title="सूचना बंद करा"
                  >
                    <X className="w-4 h-4" />
                    <span>बंद करा</span>
                  </button>
                </div>
              </div>
              <div className="bg-white/90 p-3 rounded-xl border border-emerald-200 text-xs flex flex-wrap gap-x-5 gap-y-1.5">
                <span><strong>कामगार नाव:</strong> {lastCreatedClaim.workerName}</span>
                <span><strong>MH नंबर:</strong> <span className="font-mono font-bold text-blue-900">{lastCreatedClaim.mhNumber}</span></span>
                <span><strong>योजना 1:</strong> {lastCreatedClaim.scheme1Name} (₹{lastCreatedClaim.scheme1Amount?.toLocaleString('en-IN')})</span>
                {lastCreatedClaim.scheme2Name && (
                  <span><strong>योजना 2:</strong> {lastCreatedClaim.scheme2Name} (₹{lastCreatedClaim.scheme2Amount?.toLocaleString('en-IN')})</span>
                )}
                <span><strong>एकूण रक्कम:</strong> <strong className="text-emerald-800 font-mono font-black text-sm">₹{(lastCreatedClaim.totalAmount || 0).toLocaleString('en-IN')}</strong></span>
                <span><strong>तपासणी दिनांक:</strong> {formatDate(lastCreatedClaim.verificationDate)}</span>
                <span><strong>तालुका:</strong> {lastCreatedClaim.taluka}</span>
                <span><strong>स्थिती:</strong> <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold text-[10px] border border-amber-300">{lastCreatedClaim.status}</span></span>
              </div>
            </div>
          )}

          {/* DUPLICATE CLAIM DETECTED WARNING BANNER */}
          {duplicateWarning && (
            <div className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-400 text-amber-950 space-y-2 animate-in fade-in">
              <div className="flex items-center gap-2 font-black text-xs text-amber-900">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                <span>{duplicateWarning.message}</span>
              </div>
              {duplicateWarning.existing && (
                <div className="text-[11px] bg-white/80 p-2.5 rounded-xl border border-amber-200 flex flex-wrap gap-x-4 gap-y-1">
                  <span><strong>Claim Date:</strong> {formatDate(duplicateWarning.existing.claimDate)}</span>
                  <span><strong>Scheme:</strong> {duplicateWarning.existing.scheme1Name} {duplicateWarning.existing.scheme2Name ? `+ ${duplicateWarning.existing.scheme2Name}` : ''}</span>
                  <span><strong>Amount:</strong> ₹{(duplicateWarning.existing.totalAmount || 0).toLocaleString('en-IN')}</span>
                  <span><strong>List No:</strong> {duplicateWarning.existing.listNumber || '-'}</span>
                  <span><strong>Financial Year:</strong> {duplicateWarning.existing.financialYear || '-'}</span>
                </div>
              )}
            </div>
          )}

          {/* GENERAL SUBMISSION ERROR */}
          {formErrors.submit && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-300 text-rose-900 text-xs font-bold flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
              <span>{formErrors.submit}</span>
            </div>
          )}

          <form onSubmit={handleSubmitNewClaim} className="space-y-6">
            {/* ============================================================== */}
            {/* SECTION 1: WORKER SEARCH / MANUAL CLAIM ENTRY MODE TOGGLE      */}
            {/* ============================================================== */}
            <div className="p-5 rounded-2xl bg-gradient-to-r from-blue-50/80 to-cyan-50/60 border border-blue-200 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <label className="text-xs font-black text-blue-950 flex items-center gap-1.5">
                  <Search className="w-4 h-4 text-blue-800" />
                  <span>कामगार शोध व नोंदणी पद्धत (Worker Search / Manual Mode) *</span>
                </label>

                {/* MODE TOGGLE BUTTON */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const nextMode = !isManualEntry;
                      setIsManualEntry(nextMode);
                      if (nextMode) {
                        if (searchMhInput.trim() && !formMhNumber) {
                          setFormMhNumber(searchMhInput.trim().toUpperCase());
                        }
                        setWorkerNotFoundMessage(null);
                      }
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 cursor-pointer shadow-xs ${
                      isManualEntry
                        ? 'bg-amber-500 text-white border-amber-600 hover:bg-amber-600'
                        : 'bg-white text-blue-900 border-blue-300 hover:bg-blue-50'
                    }`}
                  >
                    {isManualEntry ? (
                      <>
                        <Search className="w-3.5 h-3.5" />
                        <span>🔍 शोध मोड वापरा (Search Mode)</span>
                      </>
                    ) : (
                      <>
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>✍️ थेट मॅन्युअल नोंद करा (Manual Entry Mode)</span>
                      </>
                    )}
                  </button>

                  {isSearchingWorker && (
                    <span className="text-[11px] font-bold text-blue-700 flex items-center gap-1">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" /> शोधत आहे...
                    </span>
                  )}
                  {isWorkerVerified && !isManualEntry && (
                    <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-300 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
                      <span>कामगार डेटा सापडला (Worker Matched)</span>
                    </span>
                  )}
                </div>
              </div>

              {/* MANUAL MODE ACTIVE NOTICE */}
              {isManualEntry && (
                <div className="p-3 bg-amber-100/90 border border-amber-300 rounded-xl flex items-center justify-between flex-wrap gap-2 text-xs text-amber-950 font-bold">
                  <div className="flex items-center gap-2">
                    <span className="flex h-2.5 w-2.5 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-600"></span>
                    </span>
                    <span>
                      मॅन्युअल नोंदणी मोड सक्रिय — ज्या कामगाराची आधी सॉफ्टवेअरमध्ये नोंद नाही, त्यांचा थेट MH नंबर, नाव व तपशील भरून क्लेम नोंदवता येईल.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsManualEntry(false)}
                    className="text-[11px] text-amber-900 hover:text-amber-950 underline cursor-pointer"
                  >
                    शोध मोडवर परत जा
                  </button>
                </div>
              )}

              {/* SEARCH INPUT BAR */}
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchMhInput}
                    onChange={(e) => {
                      const val = e.target.value.toUpperCase();
                      setSearchMhInput(val);
                      setWorkerNotFoundMessage(null);
                      if (isManualEntry && !formMhNumber) {
                        setFormMhNumber(val);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSearchWorkerByMh();
                      }
                    }}
                    placeholder="कामगार MH नंबरने शोध घ्या e.g. MH12202610492"
                    className={`w-full px-4 py-2.5 rounded-xl bg-white border font-mono font-bold text-xs uppercase tracking-wider focus:outline-none ${
                      formErrors.mhNumber
                        ? 'border-rose-500 ring-2 ring-rose-200'
                        : 'border-blue-300 focus:border-blue-700 focus:ring-2 focus:ring-blue-100'
                    }`}
                    autoFocus
                  />
                  {searchMhInput && (
                    <button
                      type="button"
                      onClick={() => setSearchMhInput('')}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handleSearchWorkerByMh()}
                  disabled={isSearchingWorker || !searchMhInput.trim()}
                  className="px-5 py-2.5 bg-blue-900 hover:bg-blue-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Search className="w-4 h-4" />
                  <span>🔍 SEARCH</span>
                </button>
              </div>

              {formErrors.mhNumber && (
                <p className="text-[11px] font-bold text-rose-600 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> {formErrors.mhNumber}
                </p>
              )}

              {/* WORKER NOT FOUND ERROR DISPLAY WITH ONE-CLICK MANUAL CLAIM PROMPT */}
              {workerNotFoundMessage && (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 text-xs font-bold space-y-2.5">
                  <div className="flex items-center gap-2">
                    <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>कामगार सॉफ्टवेअरमध्ये सापडला नाही (Worker not found in software).</span>
                  </div>
                  <div className="pt-1 flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => {
                        setIsManualEntry(true);
                        const targetMh = searchMhInput.trim().toUpperCase();
                        setFormMhNumber(targetMh);
                        setWorkerNotFoundMessage(null);
                        setFormErrors((prev) => {
                          const next = { ...prev };
                          delete next.mhNumber;
                          return next;
                        });
                        checkDuplicateClaimWarning(targetMh, formFinancialYear, formScheme1Name, formScheme2Name);
                      }}
                      className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Edit3 className="w-4 h-4" />
                      <span>✍️ या कामगाराची थेट मॅन्युअल क्लेम नोंदणी करा (Register Claim Manually for {searchMhInput.trim().toUpperCase()})</span>
                    </button>
                  </div>
                </div>
              )}

              {/* MULTIPLE MATCHES PROTECTIVE CHOOSER */}
              {multipleMatches.length > 1 && (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 space-y-2">
                  <div className="text-xs font-black flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-700" />
                    <span>या MH नंबरसाठी एकापेक्षा जास्त नोंदी आढळल्या (Choose Exact Record):</span>
                  </div>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {multipleMatches.map((m) => (
                      <div
                        key={m.id}
                        onClick={() => handleSelectMultipleMatch(m)}
                        className="p-2 rounded-lg bg-white border border-amber-200 hover:border-amber-400 hover:bg-amber-100/50 flex items-center justify-between text-xs cursor-pointer"
                      >
                        <div>
                          <strong className="text-slate-900">{m.workerName}</strong>
                          <span className="text-slate-500 font-mono text-[11px] ml-2">({m.mhNumber})</span>
                          <span className="text-[10px] text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded ml-2">
                            {m.sourceType}
                          </span>
                        </div>
                        <span className="text-[11px] font-bold text-amber-800">निवडा (Select) →</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ============================================================== */}
            {/* SECTION 2: WORKER DETAILS & MANUAL VERIFICATION DATE & TALUKA  */}
            {/* ============================================================== */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <UserIcon className="w-4 h-4 text-slate-600" />
                  <span>कामगार व तपासणी तपशील (Worker & Verification Details)</span>
                </h3>
                {isManualEntry && (
                  <span className="text-[11px] font-bold text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-full border border-amber-300">
                    मॅन्युअल इनपुट मोड
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* 1. Worker Name */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    1. Worker Name (कामगाराचे नाव) *
                  </label>
                  <input
                    type="text"
                    value={formWorkerName}
                    onChange={(e) => {
                      setFormWorkerName(e.target.value);
                      setFormErrors((prev) => {
                        const n = { ...prev };
                        delete n.workerName;
                        return n;
                      });
                    }}
                    placeholder={isManualEntry ? "कामगाराचे पूर्ण नाव टाईप करा (Type Worker Name)" : "MH शोधल्यानंतर आपोआप येईल (Auto-filled)"}
                    className={`w-full px-3.5 py-2.5 rounded-xl bg-white border text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-100 ${
                      formErrors.workerName ? 'border-rose-500 ring-2 ring-rose-200' : 'border-slate-300 focus:border-blue-600'
                    }`}
                    required
                  />
                  {formErrors.workerName && (
                    <p className="text-[10px] font-bold text-rose-600 mt-0.5">{formErrors.workerName}</p>
                  )}
                </div>

                {/* 2. MH Number */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1 flex items-center justify-between">
                    <span>2. MH Number (नोंदणी क्र.) *</span>
                    {isManualEntry && (
                      <span className="text-[10px] font-bold text-amber-700">(मॅन्युअल इनपुट)</span>
                    )}
                  </label>
                  <input
                    type="text"
                    value={formMhNumber}
                    readOnly={!isManualEntry}
                    onChange={(e) => {
                      if (!isManualEntry) return;
                      const val = e.target.value.toUpperCase();
                      setFormMhNumber(val);
                      setFormErrors((prev) => {
                        const n = { ...prev };
                        delete n.mhNumber;
                        return n;
                      });
                      checkDuplicateClaimWarning(val, formFinancialYear, formScheme1Name, formScheme2Name);
                    }}
                    placeholder="e.g. MH12202610492"
                    className={`w-full px-3.5 py-2.5 rounded-xl border text-xs font-mono font-bold uppercase ${
                      isManualEntry
                        ? 'bg-white border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 text-slate-900'
                        : 'bg-slate-100 border-slate-300 text-slate-800 cursor-not-allowed'
                    } ${formErrors.mhNumber ? 'border-rose-500 ring-2 ring-rose-200' : ''}`}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* 3. Verification Date (MANUAL ONLY: INITIAL EMPTY) */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-800 mb-1 flex items-center justify-between">
                    <span>3. Verification Date (तपासणी दिनांक) *</span>
                    <span className="text-[10px] font-semibold text-rose-600">(मॅन्युअल निवड आवश्यक)</span>
                  </label>
                  <input
                    type="date"
                    value={formVerificationDate}
                    onChange={(e) => {
                      setFormVerificationDate(e.target.value);
                      setFormErrors((prev) => {
                        const n = { ...prev };
                        delete n.verificationDate;
                        return n;
                      });
                    }}
                    className={`w-full px-3.5 py-2.5 rounded-xl bg-white border text-xs font-bold text-slate-900 focus:outline-none ${
                      formErrors.verificationDate
                        ? 'border-rose-500 ring-2 ring-rose-200'
                        : 'border-slate-300 focus:border-blue-600'
                    }`}
                    required
                  />
                  {formErrors.verificationDate && (
                    <p className="text-[10px] font-bold text-rose-600 mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> {formErrors.verificationDate}
                    </p>
                  )}
                </div>

                {/* 4. Taluka (MANUAL ONLY: INITIAL EMPTY) */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-800 mb-1 flex items-center justify-between">
                    <span>4. Taluka (तालुका) *</span>
                    <span className="text-[10px] font-semibold text-rose-600">(मॅन्युअल निवड आवश्यक)</span>
                  </label>
                  <select
                    value={formTaluka}
                    onChange={(e) => {
                      setFormTaluka(e.target.value);
                      setFormErrors((prev) => {
                        const n = { ...prev };
                        delete n.taluka;
                        return n;
                      });
                    }}
                    className={`w-full px-3.5 py-2.5 rounded-xl bg-white border text-xs font-bold text-slate-900 focus:outline-none cursor-pointer ${
                      formErrors.taluka
                        ? 'border-rose-500 ring-2 ring-rose-200'
                        : 'border-slate-300 focus:border-blue-600'
                    }`}
                    required
                  >
                    <option value="">-- Select Taluka --</option>
                    {TALUKA_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  {formErrors.taluka && (
                    <p className="text-[10px] font-bold text-rose-600 mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> {formErrors.taluka}
                    </p>
                  )}
                </div>
              </div>

              {/* Mobile, Alt Mobile & From Source */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Mobile Number (कामगार मोबाईल {isManualEntry ? '- मॅन्युअल' : '- Auto'})
                  </label>
                  <input
                    type="tel"
                    maxLength={10}
                    value={formMobileNumber}
                    onChange={(e) => setFormMobileNumber(e.target.value.replace(/\D/g, ''))}
                    placeholder="10 अंकी मोबाईल"
                    className={`w-full px-3.5 py-2 rounded-xl border text-xs font-mono font-bold text-slate-800 ${
                      isManualEntry ? 'bg-white border-slate-300 focus:border-blue-600' : 'bg-slate-100 border-slate-300'
                    }`}
                  />
                </div>

                {/* 11. Alternate Mobile Number (Mandatory) */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-800 mb-1">
                    11. Alternate Mobile Number *
                  </label>
                  <input
                    type="tel"
                    maxLength={10}
                    value={formAltMobileNumber}
                    onChange={(e) => {
                      setFormAltMobileNumber(e.target.value.replace(/\D/g, ''));
                      setFormErrors((prev) => {
                        const n = { ...prev };
                        delete n.alternateMobileNumber;
                        return n;
                      });
                    }}
                    placeholder="10 अंकी पर्यायी नंबर"
                    className={`w-full px-3.5 py-2 rounded-xl bg-white border text-xs font-mono font-bold text-slate-900 ${
                      formErrors.alternateMobileNumber
                        ? 'border-rose-500 ring-2 ring-rose-200'
                        : 'border-slate-300 focus:border-blue-600'
                    }`}
                    required
                  />
                  {formErrors.alternateMobileNumber && (
                    <p className="text-[10px] font-bold text-rose-600 mt-1">
                      {formErrors.alternateMobileNumber}
                    </p>
                  )}
                </div>

                {/* 10. From (Mandatory / Auto-Assigned) */}
                <div>
                  <FromSourceSelect
                    id="claim-fromSource"
                    name="fromSource"
                    label="From (माध्यम / स्त्रोत)"
                    value={formFromSource}
                    onChange={(val) => {
                      setFormFromSource(val);
                      if (formErrors.fromSource) {
                        setFormErrors((prev) => {
                          const n = { ...prev };
                          delete n.fromSource;
                          return n;
                        });
                      }
                    }}
                    placeholder="Enter From"
                    required
                    error={formErrors.fromSource}
                    currentUser={currentUser}
                    moduleType="claim"
                  />
                </div>
              </div>
            </div>

            {/* ============================================================== */}
            {/* SECTION 3: SCHEME 1 & SCHEME 2 (SCHEME 2 IS OPTIONAL)          */}
            {/* ============================================================== */}
            <div className="p-4 rounded-2xl bg-blue-50/50 border border-blue-200 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-blue-950 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-blue-700" />
                  <span>योजना निवड व रक्कम (Schemes & Default Amounts from Master)</span>
                </h3>
                {activeSchemes.length === 0 && (
                  <span className="text-[11px] text-amber-700 font-bold bg-amber-100 px-2.5 py-0.5 rounded-full border border-amber-300">
                    योजना मास्टर रिकामे आहे. Admin ने योजना जोडाव्यात.
                  </span>
                )}
              </div>

              {/* SCHEME 1 & AMOUNT 1 (MANDATORY) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 bg-white p-3.5 rounded-xl border border-slate-200">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-blue-950 mb-1">
                    5. Scheme 1 (प्रमुख योजना 1) *
                  </label>
                  <select
                    value={formScheme1Name}
                    onChange={(e) => handleScheme1Select(e.target.value)}
                    className={`w-full px-3.5 py-2.5 rounded-xl bg-white border text-xs font-bold text-slate-900 cursor-pointer ${
                      formErrors.scheme1Name ? 'border-rose-500 ring-2 ring-rose-200' : 'border-slate-300'
                    }`}
                    required
                  >
                    <option value="">[ Select Scheme ▼ ]</option>
                    {activeSchemes.map((s) => (
                      <option key={s.id} value={s.schemeName}>
                        {s.schemeName} → ₹{s.defaultAmount.toLocaleString('en-IN')}
                      </option>
                    ))}
                  </select>
                  {formErrors.scheme1Name && (
                    <p className="text-[10px] font-bold text-rose-600 mt-1">{formErrors.scheme1Name}</p>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-800 mb-1">
                    6. Claim Amount 1 (रक्कम ₹) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-500">₹</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={formClaimAmount1}
                      onChange={(e) => setFormClaimAmount1(e.target.value)}
                      placeholder="0"
                      className={`w-full pl-7 pr-3 py-2.5 rounded-xl bg-white border text-xs font-mono font-bold text-slate-900 ${
                        formErrors.claimAmount1 ? 'border-rose-500 ring-2 ring-rose-200' : 'border-slate-300'
                      }`}
                      required
                    />
                  </div>
                  {formErrors.claimAmount1 && (
                    <p className="text-[10px] font-bold text-rose-600 mt-1">{formErrors.claimAmount1}</p>
                  )}
                </div>
              </div>

              {/* SCHEME 2 & AMOUNT 2 (OPTIONAL) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 bg-white p-3.5 rounded-xl border border-slate-200">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-blue-950 mb-1 flex items-center justify-between">
                    <span>7. Scheme 2 (दुसरी योजना 2)</span>
                    <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">(ऐच्छिक - Optional)</span>
                  </label>
                  <select
                    value={formScheme2Name}
                    onChange={(e) => handleScheme2Select(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-900 cursor-pointer"
                  >
                    <option value="">-- कोणतीही नाही (None / No Second Scheme) --</option>
                    {activeSchemes.map((s) => (
                      <option key={s.id} value={s.schemeName}>
                        {s.schemeName} → ₹{s.defaultAmount.toLocaleString('en-IN')}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-800 mb-1">
                    8. Claim Amount 2 (रक्कम ₹)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-500">₹</span>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      disabled={!formScheme2Name.trim()}
                      value={formClaimAmount2}
                      onChange={(e) => setFormClaimAmount2(e.target.value)}
                      placeholder="0"
                      className={`w-full pl-7 pr-3 py-2.5 rounded-xl border text-xs font-mono font-bold ${
                        !formScheme2Name.trim()
                          ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                          : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    />
                  </div>
                </div>
              </div>

              {/* 9. TOTAL AUTO-CALCULATION DISPLAY */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white flex items-center justify-between shadow-md">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider block opacity-90">
                    9. Total Claim Amount (एकूण क्लेम रक्कम - Auto Calculated)
                  </span>
                  <p className="text-[11px] opacity-80 font-medium">
                    Formula: Scheme 1 (₹{parsedAmount1.toLocaleString('en-IN')}) {formScheme2Name ? `+ Scheme 2 (₹${parsedAmount2.toLocaleString('en-IN')})` : ''}
                  </p>
                </div>
                <div className="text-2xl font-black font-mono">
                  ₹{formTotalAmount.toLocaleString('en-IN')}
                </div>
              </div>
            </div>

            {/* ============================================================== */}
            {/* SECTION 4: DATES, LIST NUMBER, FY & REMARKS                   */}
            {/* ============================================================== */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-slate-600" />
                <span>कार्यालयीन व यादी तपशील (List, Date & Remarks)</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* 13. Claim Date (Default today) */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-800 mb-1">
                    13. Claim Date (अर्ज नोंदणी दिनांक) *
                  </label>
                  <input
                    type="date"
                    value={formClaimDate}
                    onChange={(e) => setFormClaimDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-900"
                    required
                  />
                </div>

                {/* 14. Financial Year */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-800 mb-1">
                    14. Financial Year (आर्थिक वर्ष) *
                  </label>
                  <input
                    type="text"
                    value={formFinancialYear}
                    onChange={(e) => setFormFinancialYear(e.target.value)}
                    placeholder="e.g. 2025-26"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-xs font-mono font-bold text-blue-900"
                    required
                  />
                  {formErrors.financialYear && (
                    <p className="text-[10px] font-bold text-rose-600 mt-1">{formErrors.financialYear}</p>
                  )}
                </div>

                {/* Notice: Status is Pending until Approved */}
                <div className="sm:col-span-2 p-3 bg-amber-50/80 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
                  <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">नोंद:</span> नवीन क्लेम अर्ज सुरुवातीला <strong className="font-bold text-amber-950">"प्रलंबित (Pending)"</strong> म्हणून नोंदवला जाईल.
                    {isAdmin ? (
                      <span> शासकीय मंजुरी आल्यावर यादीमधून Admin कडून <strong className="font-bold text-emerald-800">"मंजूर करा (Approve)"</strong> वर क्लिक केल्यावरच <strong className="font-bold text-blue-900">शासकीय यादी क्रमांक (List Number)</strong> पर्याय उपलब्ध होईल.</span>
                    ) : (
                      <span> कार्यालयीन मंजुरी व शासकीय प्रक्रियेनंतर अर्जाची पुढील स्थिती Admin कडून अद्ययावत केली जाईल.</span>
                    )}
                  </div>
                </div>
              </div>

              {/* 12. Remarks (Mandatory) */}
              <div>
                <label className="block text-[11px] font-bold text-slate-800 mb-1">
                  12. Remarks (शेरा / टिप्पणी) *
                </label>
                <textarea
                  rows={2}
                  value={formRemarks}
                  onChange={(e) => {
                    setFormRemarks(e.target.value);
                    setFormErrors((prev) => {
                      const n = { ...prev };
                      delete n.remarks;
                      return n;
                    });
                  }}
                  placeholder="उदा. कागदपत्रे तपासली, योजना अर्ज जोडले."
                  className={`w-full px-3.5 py-2.5 rounded-xl bg-white border text-xs text-slate-900 ${
                    formErrors.remarks ? 'border-rose-500 ring-2 ring-rose-200' : 'border-slate-300'
                  }`}
                  required
                />
                {formErrors.remarks && (
                  <p className="text-[10px] font-bold text-rose-600 mt-1">{formErrors.remarks}</p>
                )}
              </div>
            </div>

            {/* SUBMIT BUTTON WITH DOUBLE SUBMIT PROTECTION & MANUAL RESET */}
            <div className="pt-2 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('claims')}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-300 cursor-pointer"
                >
                  रद्द करा (Cancel)
                </button>
                <button
                  type="button"
                  onClick={handleResetClaimForm}
                  className="px-4 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold border border-amber-300 cursor-pointer flex items-center gap-1.5"
                  title="सर्व फॉर्म रिकामे करा"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>फॉर्म क्लिअर करा (Clear Form)</span>
                </button>
              </div>

              <button
                type="submit"
                disabled={isSubmittingClaim || (!isManualEntry && !isWorkerVerified) || (isManualEntry && (!formMhNumber.trim() || !formWorkerName.trim())) || Boolean(duplicateWarning)}
                className="px-7 py-3 bg-blue-900 hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-900/20 transition flex items-center gap-2 cursor-pointer"
              >
                {isSubmittingClaim ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-cyan-300" />
                    <span>जतन होत आहे (Saving...)...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                    <span>क्लेम अर्ज सबमिट करा (Submit Claim)</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* ============================================================== */}
          {/* WORKER PREVIOUS CLAIM HISTORY TABLE (DISPLAYED BELOW FORM)     */}
          {/* ============================================================== */}
          {(isWorkerVerified || (isManualEntry && formMhNumber.trim().length > 0)) && (
            <div className="mt-8 border-t border-slate-200 pt-6 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <History className="w-4 h-4 text-blue-800" />
                  <span>
                    कामगाराचा मागील क्लेम इतिहास (Previous Claim History for {formMhNumber || searchMhInput})
                  </span>
                </h3>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                  एकूण {displayedWorkerHistory.length} नोंदी
                </span>
              </div>

              {displayedWorkerHistory.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500">
                  या कामगाराचा कोणताही मागील क्लेम आढळला नाही. हा पहिला अर्ज आहे.
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px]">
                      <tr>
                        <th className="py-2.5 px-3">#</th>
                        <th className="py-2.5 px-3">Claim Date</th>
                        <th className="py-2.5 px-3">Ver. Date</th>
                        <th className="py-2.5 px-3">FY</th>
                        <th className="py-2.5 px-3">Taluka</th>
                        <th className="py-2.5 px-3">Scheme 1</th>
                        <th className="py-2.5 px-3">Amount 1</th>
                        <th className="py-2.5 px-3">Scheme 2</th>
                        <th className="py-2.5 px-3">Amount 2</th>
                        <th className="py-2.5 px-3 font-bold text-emerald-800">Total</th>
                        <th className="py-2.5 px-3">List No</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {displayedWorkerHistory.map((h, i) => (
                        <tr key={h.id || i} className="hover:bg-slate-50">
                          <td className="py-2 px-3 text-slate-400 font-mono text-[11px]">{i + 1}</td>
                          <td className="py-2 px-3 font-semibold text-slate-800">{formatDate(h.claimDate)}</td>
                          <td className="py-2 px-3 text-slate-600">{formatDate(h.verificationDate) || '-'}</td>
                          <td className="py-2 px-3 font-mono font-bold text-blue-900">{h.financialYear || '-'}</td>
                          <td className="py-2 px-3 text-slate-700">{h.taluka || '-'}</td>
                          <td className="py-2 px-3 font-medium text-slate-800">{h.scheme1Name}</td>
                          <td className="py-2 px-3 font-mono">₹{h.scheme1Amount?.toLocaleString('en-IN')}</td>
                          <td className="py-2 px-3 text-slate-600">{h.scheme2Name || '-'}</td>
                          <td className="py-2 px-3 font-mono">{h.scheme2Amount ? `₹${h.scheme2Amount.toLocaleString('en-IN')}` : '-'}</td>
                          <td className="py-2 px-3 font-mono font-bold text-emerald-700">₹{h.totalAmount?.toLocaleString('en-IN')}</td>
                          <td className="py-2 px-3 font-mono text-slate-800">{h.listNumber || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 2: SCHEME MASTER MANAGEMENT (DYNAMIC SCHEME MASTER)             */}
      {/* ==================================================================== */}
      {activeTab === 'scheme-master' && isAdmin && (
        <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-7 shadow-lg space-y-6 max-w-4xl mx-auto">
          <div className="border-b border-slate-100 pb-4 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <SlidersHorizontal className="w-5 h-5 text-purple-700" />
                <span>Dynamic Scheme Master (कल्याणकारी योजना मास्टर व्यवस्थापन)</span>
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                नवीन क्लेम अर्जांसाठी योजना व डीफॉल्ट रक्कम व्यवस्थापित करा. जुन्या क्लेमची मूळ रक्कम सुरक्षित राहते.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('claims')}
              className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
            >
              ← क्लेम यादीकडे जा
            </button>
          </div>

          {/* ADD NEW SCHEME FORM */}
          <div className="p-4 rounded-2xl bg-purple-50/70 border border-purple-200 space-y-3">
            <h3 className="text-xs font-black text-purple-950 uppercase tracking-wider flex items-center gap-1.5">
              <PlusCircle className="w-4 h-4 text-purple-700" />
              <span>नवीन योजना जोडा (Add New Scheme)</span>
            </h3>

            <form onSubmit={handleAddScheme} className="flex flex-col sm:flex-row gap-3 items-end">
              <div className="flex-1 w-full">
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Scheme Name (योजनेचे नाव) *
                </label>
                <input
                  type="text"
                  value={newSchemeName}
                  onChange={(e) => setNewSchemeName(e.target.value)}
                  placeholder="उदा. E01 किंवा विवाह सहाय्य योजना"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-purple-300 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-200"
                  required
                />
              </div>

              <div className="w-full sm:w-48">
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Default Claim Amount (रक्कम ₹) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-500">₹</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={newSchemeDefaultAmount}
                    onChange={(e) => setNewSchemeDefaultAmount(e.target.value)}
                    placeholder="5000"
                    className="w-full pl-7 pr-3 py-2.5 rounded-xl bg-white border border-purple-300 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-200"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isAddingScheme || !newSchemeName.trim()}
                className="w-full sm:w-auto px-5 py-2.5 bg-purple-900 hover:bg-purple-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
              >
                {isAddingScheme ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                <span>+ ADD SCHEME</span>
              </button>
            </form>
          </div>

          {/* SAVED SCHEMES TABLE */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                उपलब्ध योजना यादी (Saved Schemes List: {claimSchemes.length})
              </h3>
              <button
                type="button"
                onClick={loadSchemes}
                className="text-xs text-purple-700 font-bold hover:underline flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" /> रीफ्रेश करा
              </button>
            </div>

            {claimSchemes.length === 0 ? (
              <div className="p-8 rounded-2xl bg-slate-50 border border-slate-200 text-center space-y-2">
                <SlidersHorizontal className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs font-bold text-slate-600">अद्याप कोणतीही योजना जोडलेली नाही.</p>
                <p className="text-[11px] text-slate-400">वरील फॉर्ममधून Admin ने योजना जोडाव्यात (e.g. E01 → ₹5000).</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="py-3 px-4 w-12 text-center">#</th>
                      <th className="py-3 px-4 min-w-[200px]">Scheme Name (योजना)</th>
                      <th className="py-3 px-4 min-w-[150px]">Default Amount (डीफॉल्ट रक्कम)</th>
                      <th className="py-3 px-4 min-w-[120px]">Status (स्थिती)</th>
                      <th className="py-3 px-4 text-right min-w-[160px]">Actions (कारवाई)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white font-medium">
                    {claimSchemes.map((s, idx) => (
                      <tr key={s.id} className="hover:bg-slate-50/80">
                        <td className="py-3 px-4 text-center font-mono text-slate-400">{idx + 1}</td>
                        <td className="py-3 px-4 font-bold text-slate-900">{s.schemeName}</td>
                        <td className="py-3 px-4 font-mono font-bold text-emerald-700 text-sm">
                          ₹{s.defaultAmount.toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                              s.isActive
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-slate-100 text-slate-500 border-slate-300'
                            }`}
                          >
                            {s.isActive ? 'Active (सक्रिय)' : 'Deactivated (निष्क्रिय)'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingScheme(s);
                                setEditSchemeName(s.schemeName);
                                setEditSchemeAmount(String(s.defaultAmount));
                              }}
                              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleSchemeStatus(s)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition border ${
                                s.isActive
                                  ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200'
                                  : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200'
                              }`}
                            >
                              {s.isActive ? 'Deactivate' : 'Activate'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteScheme(s)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded"
                              title="Delete or Deactivate"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 3: LIST NUMBER SEARCH VIEW (LIST NO: 578)                         */}
      {/* ==================================================================== */}
      {activeTab === 'list-view' && isAdmin && (
        <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-7 shadow-lg space-y-6 max-w-4xl mx-auto">
          <div className="border-b border-slate-100 pb-4">
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <FileSearch className="w-5 h-5 text-blue-900" />
              <span>Government List Number Search (शासकीय लिस्ट नंबरनुसार शोधा)</span>
            </h2>
            <p className="text-xs text-slate-500 font-medium">
              विशिष्ट लिस्ट नंबर (उदा. 578) टाकून त्या यादीतील एकूण कामगार, एकूण क्लेम रक्कम व सर्व क्लेम पहा.
            </p>
          </div>

          <form onSubmit={handleSearchListNumber} className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={listSearchNumber}
                onChange={(e) => setListSearchNumber(e.target.value)}
                placeholder="लिस्ट नंबर टाका e.g. 578"
                className="w-full px-4 py-2.5 rounded-xl bg-white border border-slate-300 font-bold text-xs focus:ring-2 focus:ring-blue-100 focus:border-blue-700"
                required
              />
            </div>
            <button
              type="submit"
              disabled={isLoadingListSearch || !listSearchNumber.trim()}
              className="px-6 py-2.5 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs font-bold shadow-xs transition flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              {isLoadingListSearch ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              <span>शोधा (Search List)</span>
            </button>
          </form>

          {searchedListData && (
            <div className="space-y-4 pt-2">
              {/* SUMMARY CARDS FOR THIS LIST */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200">
                  <span className="text-[11px] font-bold text-blue-800 uppercase tracking-wider block">
                    List Number (यादी क्र.)
                  </span>
                  <span className="text-xl font-black text-blue-950 font-mono">
                    {searchedListData.listNumber}
                  </span>
                </div>

                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200">
                  <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider block">
                    Total Workers (एकूण कामगार)
                  </span>
                  <span className="text-xl font-black text-emerald-950 font-mono">
                    {searchedListData.totalWorkers}
                  </span>
                </div>

                <div className="p-4 rounded-2xl bg-purple-50 border border-purple-200">
                  <span className="text-[11px] font-bold text-purple-800 uppercase tracking-wider block">
                    Total Claim Amount (एकूण रक्कम)
                  </span>
                  <span className="text-xl font-black text-purple-950 font-mono">
                    ₹{searchedListData.totalClaimAmount.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              {/* LIST CLAIMS TABLE */}
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 text-slate-700 font-bold uppercase text-[10px]">
                    <tr>
                      <th className="py-2.5 px-3">#</th>
                      <th className="py-2.5 px-3">Worker Name</th>
                      <th className="py-2.5 px-3">MH Number</th>
                      <th className="py-2.5 px-3">Taluka</th>
                      <th className="py-2.5 px-3">Scheme 1</th>
                      <th className="py-2.5 px-3">Scheme 2</th>
                      <th className="py-2.5 px-3 font-bold text-emerald-800">Total</th>
                      <th className="py-2.5 px-3">Claim Date</th>
                      <th className="py-2.5 px-3">Created By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white font-medium">
                    {searchedListData.claims.map((c, i) => (
                      <tr key={c.id || i} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 text-slate-400 font-mono">{i + 1}</td>
                        <td className="py-2.5 px-3 font-bold text-slate-900">{c.workerName}</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-blue-900">{c.mhNumber}</td>
                        <td className="py-2.5 px-3 text-slate-700">{c.taluka}</td>
                        <td className="py-2.5 px-3">{c.scheme1Name} (₹{c.scheme1Amount})</td>
                        <td className="py-2.5 px-3">{c.scheme2Name ? `${c.scheme2Name} (₹${c.scheme2Amount})` : '-'}</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-emerald-700">₹{c.totalAmount.toLocaleString('en-IN')}</td>
                        <td className="py-2.5 px-3">{formatDate(c.claimDate)}</td>
                        <td className="py-2.5 px-3 text-slate-500">{c.createdBy || c.operatorName || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* TAB 4: OLD CLAIMS ARCHIVE MANAGER (INTEGRATED & PRESERVED)          */}
      {/* ==================================================================== */}
      {activeTab === 'old-claims' && (
        <OldClaimsManager currentUser={currentUser} />
      )}

      {/* ==================================================================== */}
      {/* TAB 5: ACTIVE CLAIMS LIST (TABLE NO CLAIM STATUS COLUMN)              */}
      {/* ==================================================================== */}
      {activeTab === 'claims' && (
        <div className="space-y-4">
          {/* SUMMARY METRIC CARDS */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Total Claims (एकूण क्लेम)
                </span>
                <span className="text-xl sm:text-2xl font-black text-slate-900 font-mono">
                  {summaryMetrics.totalCount.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-blue-50 text-blue-700">
                <FileText className="w-5 h-5" />
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Total Amount (एकूण रक्कम)
                </span>
                <span className="text-xl sm:text-2xl font-black text-emerald-700 font-mono">
                  ₹{summaryMetrics.totalAmount.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-700">
                <DollarSign className="w-5 h-5" />
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  This Month Claims (चालू महिना)
                </span>
                <span className="text-xl sm:text-2xl font-black text-blue-900 font-mono">
                  {summaryMetrics.thisMonthCount.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-purple-50 text-purple-700">
                <Calendar className="w-5 h-5" />
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  This Month Amount (चालू महिना रक्कम)
                </span>
                <span className="text-xl sm:text-2xl font-black text-purple-800 font-mono">
                  ₹{summaryMetrics.thisMonthAmount.toLocaleString('en-IN')}
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-purple-50 text-purple-700">
                <Sparkles className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* ============================================================== */}
          {/* QUICK FILTER BAR (STATUS & DATE RANGE FOR HIGH VOLUME CLAIMS) */}
          {/* ============================================================== */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4">
            {/* Header: Quick Filter Bar Title & Live Results Stats */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-900 flex items-center justify-center shrink-0">
                  <Filter className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <span>Quick Filter Bar (द्रुत फिल्टर पट्टी)</span>
                    <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-bold">
                      High Volume
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    स्थिती (Status) व तारीख (Date Range) नुसार जलद शोध घ्या व व्यवस्थापन करा.
                  </p>
                </div>
              </div>

              {/* Matching Count & Amount Badge */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></span>
                  <span>
                    सापडले: <strong className="font-mono font-black text-blue-900">{filteredClaims.length}</strong> / {claims.length} क्लेम
                  </span>
                </span>
                <span className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold font-mono">
                  एकूण: ₹{summaryMetrics.totalAmount.toLocaleString('en-IN')}
                </span>
                {isAnyFilterActive && (
                  <button
                    type="button"
                    onClick={handleResetAllFilters}
                    className="px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition flex items-center gap-1 cursor-pointer shadow-2xs"
                    title="सर्व फिल्टर रीसेट करा"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>रीसेट (Clear All)</span>
                  </button>
                )}
              </div>
            </div>

            {/* Quick Filter Section 1: STATUS FILTER BUTTONS */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <span className="text-[11px] font-bold text-slate-600 uppercase tracking-wider shrink-0 min-w-[70px]">
                स्थिती (Status):
              </span>
              <div className="flex flex-wrap items-center gap-2 flex-1">
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter('All');
                    setCurrentPage(1);
                  }}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    statusFilter === 'All'
                      ? 'bg-slate-900 text-white shadow-sm ring-2 ring-slate-400'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>सर्व (All: {claims.length})</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter('Pending');
                    setCurrentPage(1);
                  }}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    statusFilter === 'Pending'
                      ? 'bg-amber-500 text-white shadow-sm ring-2 ring-amber-300'
                      : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  <span>⏳ प्रलंबित (Pending: {pendingCount})</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter('Approved');
                    setCurrentPage(1);
                  }}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    statusFilter === 'Approved'
                      ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-300'
                      : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>✓ मंजूर (Approved: {approvedCount})</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter('Rejected');
                    setCurrentPage(1);
                  }}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    statusFilter === 'Rejected'
                      ? 'bg-rose-600 text-white shadow-sm ring-2 ring-rose-300'
                      : 'bg-rose-50 hover:bg-rose-100 text-rose-900 border border-rose-300'
                  }`}
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>✕ नामंजूर (Rejected: {rejectedCount})</span>
                </button>
              </div>
            </div>

            {/* Quick Filter Section 2: DATE RANGE FILTER WITH PRESETS */}
            <div className="p-3 sm:p-3.5 rounded-xl bg-gradient-to-r from-blue-50/70 to-indigo-50/50 border border-blue-200/80 flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs">
              {/* Date Inputs */}
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="flex items-center gap-1.5 font-bold text-blue-950">
                  <Calendar className="w-4 h-4 text-blue-700 shrink-0" />
                  <span>तारीख (Date Range):</span>
                </div>

                <div className="flex items-center gap-1.5">
                  <label className="text-[11px] font-bold text-slate-600">पासून:</label>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => {
                      setFromDate(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="px-2.5 py-1.5 bg-white border border-blue-300 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-200 shadow-2xs"
                  />
                </div>

                <div className="flex items-center gap-1.5">
                  <label className="text-[11px] font-bold text-slate-600">पर्यंत:</label>
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => {
                      setToDate(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="px-2.5 py-1.5 bg-white border border-blue-300 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-200 shadow-2xs"
                  />
                </div>

                {(fromDate || toDate) && (
                  <button
                    type="button"
                    onClick={() => handleApplyDatePreset('clear')}
                    className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-white rounded-lg border border-transparent hover:border-rose-200 transition"
                    title="तारीख फिल्टर क्लिअर करा"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[10px] font-bold text-blue-900/70 uppercase tracking-wider mr-1">
                  द्रुत निवड:
                </span>
                <button
                  type="button"
                  onClick={() => handleApplyDatePreset('today')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition border cursor-pointer ${
                    fromDate === new Date().toISOString().split('T')[0] && toDate === new Date().toISOString().split('T')[0]
                      ? 'bg-blue-900 text-white border-blue-900 shadow-xs'
                      : 'bg-white hover:bg-blue-100 text-blue-950 border-blue-200'
                  }`}
                >
                  आज (Today)
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyDatePreset('last7')}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white hover:bg-blue-100 text-blue-950 border border-blue-200 transition cursor-pointer"
                >
                  गेले ७ दिवस
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyDatePreset('thisMonth')}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white hover:bg-blue-100 text-blue-950 border border-blue-200 transition cursor-pointer"
                >
                  चालू महिना
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyDatePreset('thisFY')}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white hover:bg-blue-100 text-blue-950 border border-blue-200 transition cursor-pointer"
                >
                  चालू वर्ष (FY)
                </button>
                {(fromDate || toDate) && (
                  <button
                    type="button"
                    onClick={() => handleApplyDatePreset('clear')}
                    className="px-2 py-1 rounded-lg text-[11px] font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition cursor-pointer"
                  >
                    तारीख हटवा
                  </button>
                )}
              </div>
            </div>

            {/* Quick Filter Section 3: SEARCH BAR & ACTION TOOLBAR */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-1">
              {/* Universal Search Bar */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder={isAdmin ? "शोधा: कामगाराचे नाव, MH नंबर, मोबाईल किंवा लिस्ट नंबर..." : "शोधा: कामगाराचे नाव, MH नंबर, किंवा मोबाईल..."}
                  className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-700"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchTerm('');
                      setCurrentPage(1);
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* ACTION TOOLBAR: EXPORT / BULK APPROVE / BULK DELETE */}
              <div className="flex items-center gap-2">
                {selectedIds.size > 0 && (
                  <>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => {
                          setIsBulkApproveModalOpen(true);
                          setBulkApproveListNumber('');
                          setBulkApproveRemarks('');
                          setBulkApproveError(null);
                        }}
                        className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                        title="निवडलेले सर्व क्लेम एकाच यादीमध्ये मंजूर करा"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>मंजूर करा ({selectedIds.size})</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() =>
                        setBulkDeleteModal({
                          isOpen: true,
                          ids: Array.from(selectedIds),
                          count: selectedIds.size,
                        })
                      }
                      className="px-3 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>हटवा ({selectedIds.size})</span>
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={handleExportClaimsToExcel}
                  className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 shadow-xs cursor-pointer"
                  title="Export filtered claims to Excel"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Excel Export</span>
                </button>
              </div>
            </div>

            {/* Quick Filter Section 4: ADVANCED DROPDOWNS BAR */}
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2.5 pt-1 text-xs">
              {/* Taluka filter */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-0.5">तालुका (Taluka):</label>
                <select
                  value={talukaFilter}
                  onChange={(e) => {
                    setTalukaFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800"
                >
                  <option value="">सर्व तालुके (All)</option>
                  {availableTalukas.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              {/* Financial Year filter */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-0.5">आर्थिक वर्ष (FY):</label>
                <select
                  value={financialYearFilter}
                  onChange={(e) => {
                    setFinancialYearFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800"
                >
                  <option value="All">सर्व आर्थिक वर्षे (All FY)</option>
                  {financialYearOptions.map((fy) => (
                    <option key={fy} value={fy}>
                      {fy}
                    </option>
                  ))}
                </select>
              </div>

              {/* Scheme filter */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 mb-0.5">योजना (Scheme):</label>
                <select
                  value={schemeFilter}
                  onChange={(e) => {
                    setSchemeFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800"
                >
                  <option value="All">सर्व योजना (All Schemes)</option>
                  {claimSchemes.map((s) => (
                    <option key={s.id} value={s.schemeName}>
                      {s.schemeName}
                    </option>
                  ))}
                </select>
              </div>

              {/* List Number filter (Admin Only) */}
              {isAdmin && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-0.5">लिस्ट क्र. (List No):</label>
                  <input
                    type="text"
                    value={listNumberFilter}
                    onChange={(e) => {
                      setListNumberFilter(e.target.value);
                      setCurrentPage(1);
                    }}
                    placeholder="उदा. 578"
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800"
                  />
                </div>
              )}

              {/* Clear filters button */}
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={handleResetAllFilters}
                  className="w-full py-1.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold transition text-center cursor-pointer flex items-center justify-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>फिल्टर क्लिअर करा</span>
                </button>
              </div>
            </div>

            {/* Quick Filter Section 5: ACTIVE FILTER CHIPS (HIGH-VOLUME FEEDBACK) */}
            {isAnyFilterActive && (
              <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-100 text-xs">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">
                  सक्रिय फिल्टर्स:
                </span>

                {statusFilter !== 'All' && (
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                    statusFilter === 'Pending'
                      ? 'bg-amber-100 text-amber-900 border-amber-300'
                      : statusFilter === 'Approved'
                      ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                      : 'bg-rose-100 text-rose-900 border-rose-300'
                  }`}>
                    <span>स्थिती: {statusFilter}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setStatusFilter('All');
                        setCurrentPage(1);
                      }}
                      className="hover:text-rose-700 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}

                {(fromDate || toDate) && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-900 text-[11px] font-bold border border-blue-300">
                    <Calendar className="w-3 h-3 text-blue-700" />
                    <span>
                      {fromDate ? formatDate(fromDate) : 'आरंभ'} ते {toDate ? formatDate(toDate) : 'आज'}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleApplyDatePreset('clear')}
                      className="hover:text-rose-700 cursor-pointer ml-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}

                {talukaFilter && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-800 text-[11px] font-bold border border-slate-300">
                    <span>तालुका: {talukaFilter}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setTalukaFilter('');
                        setCurrentPage(1);
                      }}
                      className="hover:text-rose-700 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}

                {financialYearFilter !== 'All' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-800 text-[11px] font-bold border border-slate-300">
                    <span>FY: {financialYearFilter}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setFinancialYearFilter('All');
                        setCurrentPage(1);
                      }}
                      className="hover:text-rose-700 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}

                {schemeFilter !== 'All' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-800 text-[11px] font-bold border border-slate-300">
                    <span>योजना: {schemeFilter}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setSchemeFilter('All');
                        setCurrentPage(1);
                      }}
                      className="hover:text-rose-700 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}

                {listNumberFilter.trim() && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-900 text-[11px] font-bold border border-blue-300">
                    <span>यादी क्र: {listNumberFilter}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setListNumberFilter('');
                        setCurrentPage(1);
                      }}
                      className="hover:text-rose-700 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}

                {searchTerm.trim() && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-800 text-[11px] font-bold border border-slate-300">
                    <span>शोध: "{searchTerm}"</span>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchTerm('');
                        setCurrentPage(1);
                      }}
                      className="hover:text-rose-700 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                )}

                <button
                  type="button"
                  onClick={handleResetAllFilters}
                  className="text-[11px] text-rose-600 hover:text-rose-800 underline font-bold ml-1 cursor-pointer"
                >
                  सर्व क्लिअर करा
                </button>
              </div>
            )}
          </div>

          {/* ================================================================ */}
          {/* CLAIMS TABLE (REQUIREMENT 36: NO CLAIM STATUS COLUMN)            */}
          {/* ================================================================ */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <TableSlideControls
              onSlideLeft={() => {
                if (claimTableRef.current) {
                  claimTableRef.current.scrollBy({ left: -300, behavior: 'smooth' });
                }
              }}
              onSlideRight={() => {
                if (claimTableRef.current) {
                  claimTableRef.current.scrollBy({ left: 300, behavior: 'smooth' });
                }
              }}
              title="↔ Slide Table / माहिती सरकवा"
            />

            <div ref={claimTableRef} className="overflow-x-auto scroll-smooth">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider text-[10px]">
                  <tr>
                    <th className="py-3 px-3 w-10 text-center">
                      <div className="flex items-center justify-center">
                        <UiverseCheckbox
                          size={18}
                          checked={isAllCurrentPageSelected}
                          onChange={toggleSelectCurrentPage}
                          title={isAllCurrentPageSelected ? 'Deselect All' : 'Select All'}
                          id="claim-header-select-all"
                        />
                      </div>
                    </th>
                    <th className="py-3 px-3 w-12 text-center">Sr.</th>
                    <th className="py-3 px-4 min-w-[180px]">Worker Name</th>
                    <th className="py-3 px-4 min-w-[150px]">MH Number</th>
                    <th className="py-3 px-4 min-w-[120px]">Verification Date</th>
                    <th className="py-3 px-4 min-w-[110px]">Taluka</th>
                    <th className="py-3 px-4 min-w-[150px]">Scheme 1</th>
                    <th className="py-3 px-4 min-w-[110px]">Amount 1</th>
                    <th className="py-3 px-4 min-w-[150px]">Scheme 2</th>
                    <th className="py-3 px-4 min-w-[110px]">Amount 2</th>
                    <th className="py-3 px-4 min-w-[120px] font-black text-emerald-800">Total</th>
                    <th className="py-3 px-4 min-w-[95px]">Financial Year</th>
                    <th className="py-3 px-4 min-w-[130px]">Status (स्थिती)</th>
                    {isAdmin && <th className="py-3 px-4 min-w-[110px]">List Number</th>}
                    <th className="py-3 px-4 min-w-[110px]">Claim Date</th>
                    <th className="py-3 px-4 min-w-[120px]">Created By</th>
                    <th className="py-3 px-4 text-right min-w-[180px]">Actions (कृती)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredClaims.length === 0 ? (
                    <tr>
                      <td colSpan={isAdmin ? 17 : 16} className="text-center py-12 text-slate-400">
                        <FileText className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                        <p className="font-semibold text-sm">कोणतेही क्लेम रेकॉर्ड आढळले नाहीत.</p>
                        <p className="text-xs">No welfare claim records found matching criteria.</p>
                      </td>
                    </tr>
                  ) : (
                    paginatedClaims.map((claim, idx) => {
                      const absoluteIndex =
                        pageSize === -1 ? idx + 1 : (currentPage - 1) * pageSize + idx + 1;
                      const fy = claim.financialYear || getFinancialYearFromDate(claim.claimDate);

                      return (
                        <tr
                          key={claim.id}
                          className={`hover:bg-slate-50/80 transition-colors ${
                            selectedIds.has(claim.id) ? 'bg-blue-50/60' : ''
                          }`}
                        >
                          {/* Checkbox */}
                          <td className="py-3 px-3 text-center">
                            <div className="flex items-center justify-center">
                              <UiverseCheckbox
                                size={18}
                                checked={selectedIds.has(claim.id)}
                                onChange={() => toggleSelectId(claim.id)}
                                id={`claim-row-${claim.id}`}
                              />
                            </div>
                          </td>

                          {/* Sr */}
                          <td className="py-3 px-3 text-center font-mono text-slate-400">{absoluteIndex}</td>

                          {/* Worker Name */}
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-900">{claim.workerName}</div>
                            {claim.mobileNumber && (
                              <div className="text-[10px] text-slate-500 font-mono">
                                📱 {claim.mobileNumber}
                                {claim.alternateMobileNumber ? ` / ${claim.alternateMobileNumber}` : ''}
                              </div>
                            )}
                          </td>

                          {/* MH Number with copy button */}
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5 font-mono font-bold text-blue-900">
                              <span>{claim.mhNumber}</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCopyMh(claim.mhNumber);
                                }}
                                className={`p-1 rounded border transition cursor-pointer ${
                                  copiedMh === claim.mhNumber
                                    ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                                    : 'bg-slate-50 hover:bg-blue-50 text-slate-400 hover:text-blue-700 border-slate-200'
                                }`}
                                title="Copy MH Number"
                              >
                                {copiedMh === claim.mhNumber ? (
                                  <Check className="w-3 h-3 text-emerald-600 stroke-[3]" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                          </td>

                          {/* Verification Date */}
                          <td className="py-3 px-4 text-slate-700">
                            {formatDate(claim.verificationDate) || (
                              <span className="text-slate-400 italic">-</span>
                            )}
                          </td>

                          {/* Taluka */}
                          <td className="py-3 px-4 font-semibold text-slate-800">
                            {claim.taluka || '-'}
                          </td>

                          {/* Scheme 1 */}
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-900">{claim.scheme1Name}</div>
                          </td>

                          {/* Amount 1 */}
                          <td className="py-3 px-4 font-mono font-semibold text-slate-800">
                            ₹{claim.scheme1Amount?.toLocaleString('en-IN')}
                          </td>

                          {/* Scheme 2 */}
                          <td className="py-3 px-4 text-slate-700">
                            {claim.scheme2Name || <span className="text-slate-400">-</span>}
                          </td>

                          {/* Amount 2 */}
                          <td className="py-3 px-4 font-mono text-slate-800">
                            {claim.scheme2Amount ? `₹${claim.scheme2Amount?.toLocaleString('en-IN')}` : '-'}
                          </td>

                          {/* Total */}
                          <td className="py-3 px-4 font-mono font-black text-emerald-700 text-sm whitespace-nowrap">
                            ₹{claim.totalAmount?.toLocaleString('en-IN')}
                          </td>

                          {/* Financial Year */}
                          <td className="py-3 px-4 font-mono text-slate-700">
                            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-bold text-[11px]">
                              {fy}
                            </span>
                          </td>

                          {/* Status */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            {claim.status === 'Approved' ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-xs">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                <span>मंजूर (Approved)</span>
                              </span>
                            ) : claim.status === 'Rejected' ? (
                              <span
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-300 shadow-xs"
                                title={claim.remarks ? `शेरा: ${claim.remarks}` : 'नामंजूर'}
                              >
                                <XCircle className="w-3.5 h-3.5 text-rose-600" />
                                <span>नामंजूर (Rejected)</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300 shadow-xs">
                                <Clock className="w-3.5 h-3.5 text-amber-600" />
                                <span>प्रलंबित (Pending)</span>
                              </span>
                            )}
                          </td>

                          {/* List Number (Admin Only) */}
                          {isAdmin && (
                            <td className="py-3 px-4 font-mono font-bold whitespace-nowrap">
                              {claim.status === 'Approved' ? (
                                claim.listNumber ? (
                                  <span className="px-2 py-0.5 rounded bg-blue-50 border border-blue-300 text-blue-900 font-bold text-xs inline-block">
                                    #{claim.listNumber}
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenApproveModal(claim)}
                                    className="text-xs text-blue-700 hover:text-blue-900 underline font-bold flex items-center gap-1 cursor-pointer"
                                    title="यादी क्रमांक जोडा"
                                  >
                                    <Plus className="w-3 h-3" /> यादी क्र. टाका
                                  </button>
                                )
                              ) : (
                                <span className="text-slate-400 font-mono text-xs italic">-</span>
                              )}
                            </td>
                          )}

                          {/* Claim Date */}
                          <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                            {formatDate(claim.claimDate)}
                          </td>

                          {/* Created By */}
                          <td className="py-3 px-4 text-slate-600 text-[11px]">
                            {claim.createdBy || claim.operatorName || '-'}
                          </td>

                          {/* Actions */}
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Admin-only Approval / Rejection / Status Change */}
                              {isAdmin && (
                                <>
                                  {/* Quick Approve Button (Prompts for List Number) */}
                                  {claim.status !== 'Approved' && (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenApproveModal(claim)}
                                      className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer shadow-xs"
                                      title="मंजूर करा आणि यादी क्रमांक जोडा"
                                    >
                                      <CheckCircle2 className="w-3.5 h-3.5" />
                                      <span>मंजूर करा</span>
                                    </button>
                                  )}

                                  {/* Quick Reject Button */}
                                  {claim.status !== 'Rejected' && (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenRejectModal(claim)}
                                      className="px-2 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                                      title="नामंजूर करा"
                                    >
                                      <XCircle className="w-3.5 h-3.5" />
                                      <span>नाकारा</span>
                                    </button>
                                  )}

                                  {/* Approved: Option to edit List Number (Admin Only) */}
                                  {claim.status === 'Approved' && (
                                    <button
                                      type="button"
                                      onClick={() => handleOpenApproveModal(claim)}
                                      className="px-2 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                                      title="यादी क्रमांक संपादित करा"
                                    >
                                      <Edit className="w-3 h-3" />
                                      <span>यादी क्र. बदला</span>
                                    </button>
                                  )}

                                  {/* Reset to Pending button if already approved/rejected */}
                                  {(claim.status === 'Approved' || claim.status === 'Rejected') && (
                                    <button
                                      type="button"
                                      onClick={() => handleConfirmResetPending(claim)}
                                      className="p-1.5 rounded-lg bg-slate-100 hover:bg-amber-100 text-amber-700 border border-slate-200 transition cursor-pointer"
                                      title="पुन्हा प्रलंबित (Pending) करा"
                                    >
                                      <Clock className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </>
                              )}

                              {/* Audit & Remarks History */}
                              {claim.remarksHistory && claim.remarksHistory.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => setViewHistoryClaim(claim)}
                                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-purple-100 text-purple-700 border border-slate-200 transition cursor-pointer"
                                  title="View Remarks & Change History"
                                >
                                  <History className="w-3.5 h-3.5" />
                                </button>
                              )}

                              {/* Print Slip */}
                              {onOpenPrintSlip && (
                                <button
                                  type="button"
                                  onClick={() => onOpenPrintSlip('claim', claim)}
                                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-emerald-100 text-emerald-700 border border-slate-200 transition cursor-pointer"
                                  title="Print Claim Receipt"
                                >
                                  <Printer className="w-3.5 h-3.5" />
                                </button>
                              )}

                              {/* Edit Claim */}
                              <button
                                type="button"
                                onClick={() => handleOpenEditClaim(claim)}
                                className="p-1.5 rounded-lg bg-slate-100 hover:bg-blue-100 text-blue-700 border border-slate-200 transition cursor-pointer"
                                title="Edit Claim Details"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>

                              {/* Delete Claim */}
                              <button
                                type="button"
                                onClick={() =>
                                  setDeleteConfirmItem({
                                    id: claim.id,
                                    name: claim.workerName,
                                    claimId: claim.id,
                                  })
                                }
                                className="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-100 text-rose-600 border border-slate-200 transition cursor-pointer"
                                title="Delete Claim"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
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

            {/* PAGINATION CONTROLS */}
            {filteredClaims.length > 0 && (
              <div className="bg-slate-50 border-t border-slate-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
                <div className="font-medium">
                  दाखवत आहे{' '}
                  <strong className="text-slate-900 font-bold">
                    {pageSize === -1 ? 1 : Math.min((currentPage - 1) * pageSize + 1, filteredClaims.length)}
                  </strong>{' '}
                  ते{' '}
                  <strong className="text-slate-900 font-bold">
                    {pageSize === -1 ? filteredClaims.length : Math.min(currentPage * pageSize, filteredClaims.length)}
                  </strong>{' '}
                  (एकूण <strong className="text-blue-900 font-bold">{filteredClaims.length}</strong> क्लेम)
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500">प्रति पान:</span>
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="bg-white border border-slate-300 rounded-lg py-1 px-2 text-xs font-bold"
                    >
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={-1}>All (सर्व)</option>
                    </select>
                  </div>

                  {pageSize !== -1 && totalPages > 1 && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="p-1.5 rounded-lg border border-slate-300 bg-white disabled:opacity-40"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <span className="px-2 font-bold text-slate-800">
                        पान {currentPage} / {totalPages}
                      </span>
                      <button
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="p-1.5 rounded-lg border border-slate-300 bg-white disabled:opacity-40"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 1: EDIT CLAIM DETAILS (NO STATUS DROPDOWN)                     */}
      {/* ==================================================================== */}
      {editingClaim && editForm && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl relative space-y-4 max-h-[90vh] overflow-y-auto">
            <button
              type="button"
              onClick={() => setEditingClaim(null)}
              className="absolute top-5 right-5 p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500"
            >
              <X className="w-5 h-5" />
            </button>

            <div>
              <h3 className="text-base font-black text-slate-900">
                Edit Claim Details ({editingClaim.id})
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Worker: <strong className="text-slate-800">{editingClaim.workerName}</strong> ({editingClaim.mhNumber})
              </p>
            </div>

            <form onSubmit={handleSaveEditClaim} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Scheme 1</label>
                  <select
                    value={editForm.scheme1Name}
                    onChange={(e) => {
                      const name = e.target.value;
                      const s = activeSchemes.find((sch) => sch.schemeName === name);
                      setEditForm((prev: any) => ({
                        ...prev,
                        scheme1Name: name,
                        scheme1Amount: s ? String(s.defaultAmount) : prev.scheme1Amount,
                      }));
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold"
                  >
                    {activeSchemes.map((s) => (
                      <option key={s.id} value={s.schemeName}>
                        {s.schemeName} (₹{s.defaultAmount})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Amount 1 (₹)</label>
                  <input
                    type="number"
                    value={editForm.scheme1Amount}
                    onChange={(e) => setEditForm((prev: any) => ({ ...prev, scheme1Amount: e.target.value }))}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Scheme 2</label>
                  <select
                    value={editForm.scheme2Name}
                    onChange={(e) => {
                      const name = e.target.value;
                      const s = activeSchemes.find((sch) => sch.schemeName === name);
                      setEditForm((prev: any) => ({
                        ...prev,
                        scheme2Name: name,
                        scheme2Amount: s ? String(s.defaultAmount) : prev.scheme2Amount,
                      }));
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold"
                  >
                    <option value="">-- No Scheme 2 --</option>
                    {activeSchemes.map((s) => (
                      <option key={s.id} value={s.schemeName}>
                        {s.schemeName} (₹{s.defaultAmount})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Amount 2 (₹)</label>
                  <input
                    type="number"
                    value={editForm.scheme2Amount}
                    onChange={(e) => setEditForm((prev: any) => ({ ...prev, scheme2Amount: e.target.value }))}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Verification Date</label>
                  <input
                    type="date"
                    value={editForm.verificationDate}
                    onChange={(e) => setEditForm((prev: any) => ({ ...prev, verificationDate: e.target.value }))}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Taluka</label>
                  <select
                    value={editForm.taluka}
                    onChange={(e) => setEditForm((prev: any) => ({ ...prev, taluka: e.target.value }))}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold"
                  >
                    {TALUKA_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* STATUS & LIST NUMBER: ADMIN ONLY */}
              {isAdmin ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      फॉर्म स्थिती (Form Status)
                    </label>
                    <select
                      value={editForm.status}
                      onChange={(e) => {
                        const st = e.target.value as 'Pending' | 'Approved' | 'Rejected';
                        setEditForm((prev: any) => ({
                          ...prev,
                          status: st,
                          listNumber: st === 'Approved' ? prev.listNumber : '',
                        }));
                      }}
                      className={`w-full px-3 py-2 rounded-xl text-xs font-bold border ${
                        editForm.status === 'Approved'
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                          : editForm.status === 'Rejected'
                          ? 'bg-rose-50 border-rose-300 text-rose-900'
                          : 'bg-amber-50 border-amber-300 text-amber-900'
                      }`}
                    >
                      <option value="Pending">⏳ प्रलंबित (Pending)</option>
                      <option value="Approved">✓ मंजूर (Approved)</option>
                      <option value="Rejected">✕ नामंजूर (Rejected)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      शासकीय यादी क्र. (List Number)
                      {editForm.status === 'Approved' && <span className="text-rose-500 font-bold ml-1">*</span>}
                    </label>
                    {editForm.status === 'Approved' ? (
                      <div>
                        <input
                          type="text"
                          value={editForm.listNumber}
                          onChange={(e) => setEditForm((prev: any) => ({ ...prev, listNumber: e.target.value }))}
                          placeholder="उदा. 578"
                          className="w-full px-3 py-2 bg-white border-2 border-emerald-500 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                          required
                        />
                        <p className="text-[10px] text-emerald-700 font-bold mt-1">✓ फॉर्म मंजूर आहे — यादी क्रमांक टाका.</p>
                      </div>
                    ) : (
                      <div>
                        <input
                          type="text"
                          disabled
                          value=""
                          placeholder="फॉर्म मंजूर झाल्यावर सुरू होईल"
                          className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-mono text-slate-400 cursor-not-allowed"
                        />
                        <p className="text-[10px] text-amber-700 font-bold mt-1">🔒 फॉर्म मंजूर (Approve) केल्यावरच यादी क्र. सुरू होईल.</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    फॉर्म स्थिती (Form Status)
                  </label>
                  <div className="py-1">
                    <span className={`px-3 py-1.5 rounded-xl text-xs font-bold border inline-flex items-center gap-1.5 ${
                      editForm.status === 'Approved'
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                        : editForm.status === 'Rejected'
                        ? 'bg-rose-50 border-rose-300 text-rose-900'
                        : 'bg-amber-50 border-amber-300 text-amber-900'
                    }`}>
                      {editForm.status === 'Approved' ? '✓ मंजूर (Approved)' : editForm.status === 'Rejected' ? '✕ नामंजूर (Rejected)' : '⏳ प्रलंबित (Pending)'}
                    </span>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <FromSourceSelect
                    id="claim-edit-fromSource"
                    name="fromSource"
                    label="From (माध्यम / स्त्रोत)"
                    value={editForm.fromSource}
                    onChange={(val) => setEditForm((prev: any) => ({ ...prev, fromSource: val }))}
                    placeholder="Enter From"
                    required
                    currentUser={currentUser}
                    moduleType="claim"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Alt Mobile (10 digits)</label>
                  <input
                    type="tel"
                    maxLength={10}
                    value={editForm.alternateMobileNumber}
                    onChange={(e) => setEditForm((prev: any) => ({ ...prev, alternateMobileNumber: e.target.value }))}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Remarks</label>
                <textarea
                  rows={2}
                  value={editForm.remarks}
                  onChange={(e) => setEditForm((prev: any) => ({ ...prev, remarks: e.target.value }))}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingClaim(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
                >
                  रद्द करा (Cancel)
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="px-5 py-2 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5"
                >
                  {isSavingEdit ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>बदल सेव्ह करा (Save Changes)</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 2: EDIT SCHEME MASTER (ADMIN)                                  */}
      {/* ==================================================================== */}
      {editingScheme && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl relative space-y-4">
            <button
              type="button"
              onClick={() => setEditingScheme(null)}
              className="absolute top-5 right-5 p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-black text-slate-900">Edit Scheme ({editingScheme.schemeName})</h3>

            <form onSubmit={handleUpdateScheme} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Scheme Name *</label>
                <input
                  type="text"
                  value={editSchemeName}
                  onChange={(e) => setEditSchemeName(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Default Amount (₹) *</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={editSchemeAmount}
                  onChange={(e) => setEditSchemeAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900"
                  required
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingScheme(null)}
                  className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingScheme}
                  className="px-5 py-2 bg-purple-900 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5"
                >
                  {isUpdatingScheme ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
                  <span>Save Scheme</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 3: REMARKS & AUDIT HISTORY                                     */}
      {/* ==================================================================== */}
      {viewHistoryClaim && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl relative space-y-4">
            <button
              type="button"
              onClick={() => setViewHistoryClaim(null)}
              className="absolute top-5 right-5 p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-purple-700" />
              <h3 className="text-base font-black text-slate-900">
                Remarks & Audit History ({viewHistoryClaim.id})
              </h3>
            </div>
            <p className="text-xs text-slate-500 font-medium">
              Worker: <strong className="text-slate-800">{viewHistoryClaim.workerName}</strong> ({viewHistoryClaim.mhNumber})
            </p>

            <div className="max-h-72 overflow-y-auto space-y-2.5 pr-1">
              {viewHistoryClaim.remarksHistory && viewHistoryClaim.remarksHistory.length > 0 ? (
                viewHistoryClaim.remarksHistory.map((h, i) => (
                  <div key={i} className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-purple-900">{h.action}</span>
                      <span className="text-slate-400">{new Date(h.date).toLocaleString('en-IN')}</span>
                    </div>
                    <p className="text-slate-800 font-medium">"{h.remarks || 'No remarks recorded.'}"</p>
                    <div className="text-[10px] text-slate-400">By: {h.operator}</div>
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-slate-400 text-xs">कोणताही इतिहास उपलब्ध नाही.</div>
              )}
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setViewHistoryClaim(null)}
                className="py-2 px-4 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold"
              >
                बंद करा (Close)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 4: DELETE CONFIRMATION                                         */}
      {/* ==================================================================== */}
      {deleteConfirmItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl relative space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-base font-black text-slate-900">क्लेम नोंद कायमची हटवायची आहे का?</h3>
              <p className="text-xs text-slate-500">
                कामगार: <strong className="text-slate-800">{deleteConfirmItem.name}</strong> ({deleteConfirmItem.claimId})
              </p>
              <p className="text-[11px] text-rose-600 font-bold">हा बदल परत करता येणार नाही (Permanent Action).</p>
            </div>

            <div className="flex justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmItem(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
              >
                रद्द करा (Cancel)
              </button>
              <button
                type="button"
                onClick={handleExecuteSingleDelete}
                disabled={isDeleting}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md disabled:opacity-50 flex items-center gap-1.5"
              >
                {isDeleting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                <span>होय, हटवा (Yes, Delete)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 5: BULK DELETE CONFIRMATION                                    */}
      {/* ==================================================================== */}
      {bulkDeleteModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl relative space-y-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-black text-slate-900">
                निवडलेल्या {bulkDeleteModal.count} क्लेम नोंदी हटवायच्या आहेत का?
              </h3>
              <p className="text-xs text-slate-500">
                या सर्व नोंदी कायमच्या काढून टाकल्या जातील.
              </p>
            </div>

            <div className="flex justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setBulkDeleteModal(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
              >
                रद्द करा (Cancel)
              </button>
              <button
                type="button"
                onClick={handleExecuteBulkDelete}
                disabled={isDeleting}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md disabled:opacity-50 flex items-center gap-1.5"
              >
                {isDeleting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                <span>होय, सर्व हटवा (Delete All)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 6: APPROVE CLAIM MODAL (ENABLES LIST NUMBER INPUT) - ADMIN ONLY */}
      {/* ==================================================================== */}
      {isAdmin && approvingClaim && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl relative space-y-4 animate-in fade-in zoom-in-95">
            <button
              type="button"
              onClick={() => setApprovingClaim(null)}
              className="absolute top-5 right-5 p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">
                  क्लेम अर्ज मंजूर करा (Approve Claim Form)
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  शासकीय यादी क्रमांक (List Number) प्रविष्ट करून अर्ज मंजूर करा.
                </p>
              </div>
            </div>

            {/* Worker Summary Card */}
            <div className="p-3.5 rounded-2xl bg-emerald-50/60 border border-emerald-200 text-xs space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="font-bold text-slate-900 text-sm">{approvingClaim.workerName}</span>
                <span className="font-mono font-bold text-blue-900 bg-white px-2 py-0.5 rounded border border-blue-200">
                  {approvingClaim.mhNumber}
                </span>
              </div>
              <div className="text-slate-600 flex justify-between">
                <span>
                  योजना: <strong>{approvingClaim.scheme1Name}</strong>
                  {approvingClaim.scheme2Name ? ` + ${approvingClaim.scheme2Name}` : ''}
                </span>
                <span className="font-black text-emerald-700 font-mono">
                  ₹{approvingClaim.totalAmount?.toLocaleString('en-IN')}
                </span>
              </div>
            </div>

            {approveError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{approveError}</span>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleConfirmApprove();
              }}
              className="space-y-4"
            >
              {/* List Number Input */}
              <div>
                <label className="block text-xs font-bold text-slate-900 mb-1">
                  शासकीय यादी क्रमांक (Government List Number) *
                </label>
                <input
                  type="text"
                  autoFocus
                  value={approveListNumber}
                  onChange={(e) => setApproveListNumber(e.target.value)}
                  placeholder="उदा. 578 किंवा 612"
                  className="w-full px-3.5 py-2.5 bg-white border-2 border-emerald-500 rounded-xl text-sm font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  required
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  हा फॉर्म मंजूर केल्यावर सदर यादी क्रमांकामध्ये जोडला जाईल.
                </p>

                {/* Quick List Number suggestions */}
                {existingListNumbers.length > 0 && (
                  <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-slate-500 font-bold">अलीकडील यादी क्र.:</span>
                    {existingListNumbers.slice(0, 6).map((ln) => (
                      <button
                        key={ln}
                        type="button"
                        onClick={() => setApproveListNumber(ln)}
                        className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-lg border transition cursor-pointer ${
                          approveListNumber === ln
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-slate-100 hover:bg-emerald-50 text-slate-700 border-slate-200'
                        }`}
                      >
                        #{ln}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Remarks / शेरा */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  मंजुरी शेरा / टिप्पणी (Approval Remarks - ऐच्छिक)
                </label>
                <textarea
                  rows={2}
                  value={approveRemarks}
                  onChange={(e) => setApproveRemarks(e.target.value)}
                  placeholder="उदा. शासकीय यादी क्र. 578 मध्ये मंजूर"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setApprovingClaim(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
                >
                  रद्द करा (Cancel)
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingApprove}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingApprove ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>मंजूर करा आणि यादी जोडा (Approve & Save)</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 7: REJECT CLAIM MODAL                                          */}
      {/* ==================================================================== */}
      {rejectingClaim && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl relative space-y-4 animate-in fade-in zoom-in-95">
            <button
              type="button"
              onClick={() => setRejectingClaim(null)}
              className="absolute top-5 right-5 p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <XCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">
                  क्लेम अर्ज नामंजूर करा (Reject Claim)
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  कामगाराचा क्लेम अर्ज नाकारण्यासाठी कारण प्रविष्ट करा.
                </p>
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-rose-50/60 border border-rose-200 text-xs">
              <span className="font-bold text-slate-900">{rejectingClaim.workerName}</span>{' '}
              <span className="font-mono text-slate-600">({rejectingClaim.mhNumber})</span>
            </div>

            {rejectError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{rejectError}</span>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleConfirmReject();
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-bold text-slate-900 mb-1">
                  नामंजूर करण्याचे कारण / शेरा (Rejection Reason) *
                </label>
                <textarea
                  rows={3}
                  autoFocus
                  value={rejectRemarks}
                  onChange={(e) => setRejectRemarks(e.target.value)}
                  placeholder="उदा. कागदपत्रे अपूर्ण आहेत / बँक पासबुक अस्पष्ट आहे / मंडळ नियमानुसार अपात्र."
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-200 focus:border-rose-500"
                  required
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setRejectingClaim(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
                >
                  रद्द करा (Cancel)
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReject}
                  className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingReject ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <XCircle className="w-4 h-4" />
                  )}
                  <span>नामंजूर करा (Confirm Reject)</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 8: BULK APPROVE MODAL (BATCH ASSIGN LIST NUMBER) - ADMIN ONLY */}
      {/* ==================================================================== */}
      {isAdmin && isBulkApproveModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl relative space-y-4 animate-in fade-in zoom-in-95">
            <button
              type="button"
              onClick={() => setIsBulkApproveModalOpen(false)}
              className="absolute top-5 right-5 p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">
                  निवडलेले {selectedIds.size} क्लेम अर्ज मंजूर करा (Bulk Approve)
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  निवडलेले सर्व अर्ज एकाच शासकीय यादी क्रमांकामध्ये (List Number) मंजूर केले जातील.
                </p>
              </div>
            </div>

            {bulkApproveError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{bulkApproveError}</span>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleConfirmBulkApprove();
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-bold text-slate-900 mb-1">
                  शासकीय यादी क्रमांक (Government List Number) *
                </label>
                <input
                  type="text"
                  autoFocus
                  value={bulkApproveListNumber}
                  onChange={(e) => setBulkApproveListNumber(e.target.value)}
                  placeholder="उदा. 578"
                  className="w-full px-3.5 py-2.5 bg-white border-2 border-emerald-500 rounded-xl text-sm font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-200"
                  required
                />
                {existingListNumbers.length > 0 && (
                  <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-slate-500 font-bold">अलीकडील यादी क्र.:</span>
                    {existingListNumbers.slice(0, 6).map((ln) => (
                      <button
                        key={ln}
                        type="button"
                        onClick={() => setBulkApproveListNumber(ln)}
                        className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-lg border transition cursor-pointer ${
                          bulkApproveListNumber === ln
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-slate-100 hover:bg-emerald-50 text-slate-700 border-slate-200'
                        }`}
                      >
                        #{ln}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  शेरा / टिप्पणी (Optional Remarks)
                </label>
                <textarea
                  rows={2}
                  value={bulkApproveRemarks}
                  onChange={(e) => setBulkApproveRemarks(e.target.value)}
                  placeholder="उदा. यादी क्र. 578 अंतर्गत मंजूर"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsBulkApproveModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
                >
                  रद्द करा (Cancel)
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingBulkApprove}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md transition flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingBulkApprove ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4" />
                  )}
                  <span>सर्व {selectedIds.size} अर्ज मंजूर करा (Confirm Bulk Approve)</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
