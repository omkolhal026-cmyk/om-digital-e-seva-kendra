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
} from 'lucide-react';
import { WorkerClaim, ClaimScheme, WorkerRegistration, User } from '../types';
import { exportToCSV, formatDate } from '../utils/exportUtils';
import { getFinancialYearFromDate } from '../utils/renewalYearUtils';
import { OldClaimsManager } from './OldClaimsManager';
import { FromSourceFilterSelect } from './FromSourceFilterSelect';
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
  onUpdateClaimStatus?: (id: string, status: WorkerClaim['status'], remarks?: string) => Promise<void>;
  onDeleteClaim?: (id: string) => Promise<void>;
  onDeleteClaimsBulk?: (ids: string[]) => Promise<void>;
  onOpenPrintSlip?: (type: 'claim', data: any) => void;
  onResetClaims?: () => void;
}

export const ClaimModule: React.FC<ClaimModuleProps> = ({
  claims = [],
  registrations = [],
  currentUser,
  users = [],
  onAddClaim,
  onDeleteClaim,
  onDeleteClaimsBulk,
  onOpenPrintSlip,
  onResetClaims,
}) => {
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'claims' | 'new-claim' | 'list-view' | 'scheme-master' | 'old-claims'>('claims');

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

  // History / Audit Modal
  const [viewHistoryClaim, setViewHistoryClaim] = useState<WorkerClaim | null>(null);

  // Edit Existing Claim Modal (NO status dropdown, with warning on amount modification)
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
  // 10. From
  const [formFromSource, setFormFromSource] = useState('OFFICE');
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
  const [isSubmittingClaim, setIsSubmittingClaim] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [successToast, setSuccessToast] = useState<string | null>(null);

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
        // AUTO-FILL ONLY: Worker Name & Mobile Number
        setFormWorkerName(data.worker.workerName || '');
        setFormMhNumber(data.worker.mhNumber || targetMh);
        setFormMobileNumber(data.worker.mobileNumber || '');

        // VERIFICATION DATE & TALUKA MUST REMAIN BLANK (MANUAL ONLY)
        setFormVerificationDate('');
        setFormTaluka('');

        // Store past claims history sorted newest first
        setWorkerClaimHistory(data.claimsHistory || []);

        // Clear field error for MH Number
        setFormErrors((prev) => {
          const next = { ...prev };
          delete next.mhNumber;
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
  const handleSelectMultipleMatch = (match: { id: string; workerName: string; mhNumber: string; mobileNumber: string }) => {
    setIsWorkerVerified(true);
    setFormWorkerName(match.workerName);
    setFormMhNumber(match.mhNumber);
    setFormMobileNumber(match.mobileNumber);
    setMultipleMatches([]);
    setFormVerificationDate('');
    setFormTaluka('');
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
    const matchedScheme = activeSchemes.find((s) => s.schemeName === selectedName);
    if (matchedScheme) {
      setFormClaimAmount2(String(matchedScheme.defaultAmount));
    } else {
      setFormClaimAmount2('');
    }
    // Check for duplicate in current FY
    checkDuplicateClaimWarning(formMhNumber, formFinancialYear, formScheme1Name, selectedName);
  };

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

    // 1. Worker MH search verification
    if (!isWorkerVerified || !formMhNumber.trim()) {
      errors.mhNumber = 'Please search and verify worker MH Number.';
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

    // 5. Scheme 1 & Claim Amount 1
    if (!formScheme1Name.trim()) {
      errors.scheme1Name = 'Please select Scheme 1.';
    }
    const amt1 = Number(formClaimAmount1);
    if (isNaN(amt1) || amt1 <= 0) {
      errors.claimAmount1 = 'Claim Amount 1 must be greater than 0.';
    }

    // 6. Scheme 2 & Claim Amount 2 (Mandatory per current requirements)
    if (!formScheme2Name.trim()) {
      errors.scheme2Name = 'Please select Scheme 2.';
    }
    const amt2 = Number(formClaimAmount2);
    if (isNaN(amt2) || amt2 <= 0) {
      errors.claimAmount2 = 'Claim Amount 2 must be greater than 0.';
    }

    // 7. From
    if (!formFromSource || !formFromSource.trim()) {
      errors.fromSource = 'Please enter From.';
    }

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

    // 12. List Number
    if (!formListNumber || !formListNumber.trim()) {
      errors.listNumber = 'Please enter List Number.';
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
        scheme2Name: formScheme2Name.trim(),
        scheme2Amount: amt2,
        fromSource: formFromSource.trim(),
        alternateMobileNumber: cleanAltMobile,
        mobileNumber: formMobileNumber.trim(),
        remarks: formRemarks.trim(),
        claimDate: formClaimDate.trim(),
        financialYear: formFinancialYear.trim(),
        listNumber: formListNumber.trim(),
        // Note: status is set to 'Submitted' on the backend, NO status dropdown in UI
      };

      if (onAddClaim) {
        await onAddClaim(claimPayload);
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
      }

      setSuccessToast(`कामगार "${formWorkerName}" यांचा क्लेम अर्ज (List No: ${formListNumber}) यशस्वीरित्या जतन झाला.`);

      // Reset form
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
      setFormRemarks('');
      setFormListNumber('');
      setIsWorkerVerified(false);
      setWorkerClaimHistory([]);
      setFormErrors({});
      setDuplicateWarning(null);

      // Navigate back to claims list
      setTimeout(() => {
        setActiveTab('claims');
      }, 1200);
    } catch (err: any) {
      console.error('Error submitting claim:', err);
      setFormErrors({ submit: err.message || 'Error submitting claim. Please verify fields and try again.' });
    } finally {
      setIsSubmittingClaim(false);
    }
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
  // EDIT CLAIM MODAL (PROTECT AMOUNT MODIFICATIONS & NO STATUS DROPDOWN)
  // --------------------------------------------------------------------------
  const handleOpenEditClaim = (claim: WorkerClaim) => {
    setEditingClaim(claim);
    setEditForm({
      scheme1Name: claim.scheme1Name || '',
      scheme1Amount: String(claim.scheme1Amount || ''),
      scheme2Name: claim.scheme2Name || '',
      scheme2Amount: String(claim.scheme2Amount || ''),
      verificationDate: claim.verificationDate || '',
      taluka: claim.taluka || '',
      fromSource: claim.fromSource || '',
      alternateMobileNumber: claim.alternateMobileNumber || '',
      listNumber: claim.listNumber || '',
      remarks: claim.remarks || '',
    });
    setEditAmountWarning(null);
  };

  const handleSaveEditClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClaim || !editForm) return;

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
          fromSource: editForm.fromSource,
          alternateMobileNumber: editForm.alternateMobileNumber,
          listNumber: editForm.listNumber,
          remarks: editForm.remarks,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update claim');

      setSuccessToast(`क्लेम नोंद ${editingClaim.id} यशस्वीरित्या अद्ययावत केली.`);
      setEditingClaim(null);
      // reload or window event
      window.dispatchEvent(new Event('refreshClaims'));
    } catch (err: any) {
      alert(err.message || 'Error updating claim');
    } finally {
      setIsSavingEdit(false);
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

      // Date range filter
      if (fromDate && claim.claimDate && claim.claimDate < fromDate) {
        return false;
      }
      if (toDate && claim.claimDate && claim.claimDate > toDate) {
        return false;
      }

      return true;
    });
  }, [
    claims,
    searchTerm,
    talukaFilter,
    fromSourceFilter,
    financialYearFilter,
    schemeFilter,
    listNumberFilter,
    fromDate,
    toDate,
  ]);

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
    const dataToExport = filteredClaims.map((c, idx) => ({
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
      'List Number': c.listNumber || '',
      'Claim Date': c.claimDate,
      'Created By': c.createdBy || c.operatorName || '',
      'Remarks': c.remarks || '',
    }));

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
            {/* SECTION 1: WORKER SEARCH — MH NUMBER ONLY (PICK WORKER REMOVED)*/}
            {/* ============================================================== */}
            <div className="p-5 rounded-2xl bg-gradient-to-r from-blue-50/80 to-cyan-50/60 border border-blue-200 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <label className="text-xs font-black text-blue-950 flex items-center gap-1.5">
                  <Search className="w-4 h-4 text-blue-800" />
                  <span>Worker MH Number Search / Auto-Fill *</span>
                </label>
                {isSearchingWorker && (
                  <span className="text-[11px] font-bold text-blue-700 flex items-center gap-1">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> शोधत आहे...
                  </span>
                )}
                {isWorkerVerified && (
                  <span className="text-[11px] font-bold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full border border-emerald-300 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
                    <span>कामगार डेटा सापडला (Worker Matched)</span>
                  </span>
                )}
              </div>

              {/* SEARCH INPUT BAR */}
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={searchMhInput}
                    onChange={(e) => {
                      setSearchMhInput(e.target.value.toUpperCase());
                      setWorkerNotFoundMessage(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSearchWorkerByMh();
                      }
                    }}
                    placeholder="कामगार MH नंबर टाका e.g. MH12202610492"
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

              {/* WORKER NOT FOUND ERROR DISPLAY */}
              {workerNotFoundMessage && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-900 text-xs font-bold flex items-center gap-2">
                  <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{workerNotFoundMessage}</span>
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
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <UserIcon className="w-4 h-4 text-slate-600" />
                <span>कामगार व तपासणी तपशील (Worker & Verification Details)</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* 1. Worker Name (Auto-filled) */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    1. Worker Name (कामगाराचे नाव) *
                  </label>
                  <input
                    type="text"
                    value={formWorkerName}
                    onChange={(e) => setFormWorkerName(e.target.value)}
                    placeholder="MH शोधल्यानंतर आपोआप येईल (Auto-filled)"
                    className={`w-full px-3.5 py-2.5 rounded-xl bg-white border text-xs font-bold text-slate-900 ${
                      formErrors.workerName ? 'border-rose-500 ring-2 ring-rose-200' : 'border-slate-300'
                    }`}
                    required
                  />
                  {formErrors.workerName && (
                    <p className="text-[10px] font-bold text-rose-600 mt-0.5">{formErrors.workerName}</p>
                  )}
                </div>

                {/* 2. MH Number */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    2. MH Number (नोंदणी क्र.) *
                  </label>
                  <input
                    type="text"
                    value={formMhNumber}
                    readOnly
                    placeholder="e.g. MH12202610492"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 border border-slate-300 text-xs font-mono font-bold text-slate-800 uppercase cursor-not-allowed"
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
                    Mobile Number (कामगार मोबाईल - Auto)
                  </label>
                  <input
                    type="text"
                    value={formMobileNumber}
                    onChange={(e) => setFormMobileNumber(e.target.value)}
                    placeholder="10 अंकी मोबाईल"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-100 border border-slate-300 text-xs font-mono font-bold text-slate-800"
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

                {/* 10. From (Mandatory) */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-800 mb-1">
                    10. From (अर्ज कोठून आला) *
                  </label>
                  <input
                    type="text"
                    value={formFromSource}
                    onChange={(e) => {
                      setFormFromSource(e.target.value);
                      setFormErrors((prev) => {
                        const n = { ...prev };
                        delete n.fromSource;
                        return n;
                      });
                    }}
                    placeholder="e.g. OFFICE, AGENT, DIRECT"
                    className={`w-full px-3.5 py-2 rounded-xl bg-white border text-xs font-bold text-slate-900 ${
                      formErrors.fromSource ? 'border-rose-500 ring-2 ring-rose-200' : 'border-slate-300'
                    }`}
                    required
                  />
                  {formErrors.fromSource && (
                    <p className="text-[10px] font-bold text-rose-600 mt-1">{formErrors.fromSource}</p>
                  )}
                </div>
              </div>
            </div>

            {/* ============================================================== */}
            {/* SECTION 3: SCHEME 1 & SCHEME 2 (DYNAMIC SCHEME MASTER)         */}
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

              {/* SCHEME 1 & AMOUNT 1 */}
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

              {/* SCHEME 2 & AMOUNT 2 (MANDATORY) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 bg-white p-3.5 rounded-xl border border-slate-200">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-blue-950 mb-1 flex items-center justify-between">
                    <span>7. Scheme 2 (दुसरी योजना 2) *</span>
                    <span className="text-[10px] font-semibold text-rose-600">(आवश्यक - Mandatory)</span>
                  </label>
                  <select
                    value={formScheme2Name}
                    onChange={(e) => handleScheme2Select(e.target.value)}
                    className={`w-full px-3.5 py-2.5 rounded-xl bg-white border text-xs font-bold text-slate-900 cursor-pointer ${
                      formErrors.scheme2Name ? 'border-rose-500 ring-2 ring-rose-200' : 'border-slate-300'
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
                  {formErrors.scheme2Name && (
                    <p className="text-[10px] font-bold text-rose-600 mt-1">{formErrors.scheme2Name}</p>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-800 mb-1">
                    8. Claim Amount 2 (रक्कम ₹) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-500">₹</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={formClaimAmount2}
                      onChange={(e) => setFormClaimAmount2(e.target.value)}
                      placeholder="0"
                      className={`w-full pl-7 pr-3 py-2.5 rounded-xl bg-white border text-xs font-mono font-bold text-slate-900 ${
                        formErrors.claimAmount2 ? 'border-rose-500 ring-2 ring-rose-200' : 'border-slate-300'
                      }`}
                      required
                    />
                  </div>
                  {formErrors.claimAmount2 && (
                    <p className="text-[10px] font-bold text-rose-600 mt-1">{formErrors.claimAmount2}</p>
                  )}
                </div>
              </div>

              {/* 9. TOTAL AUTO-CALCULATION DISPLAY */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-600 text-white flex items-center justify-between shadow-md">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider block opacity-90">
                    9. Total Claim Amount (एकूण क्लेम रक्कम - Auto Calculated)
                  </span>
                  <p className="text-[11px] opacity-80 font-medium">
                    Formula: Scheme 1 (₹{parsedAmount1.toLocaleString('en-IN')}) + Scheme 2 (₹{parsedAmount2.toLocaleString('en-IN')})
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

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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

                {/* 15. List Number */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-800 mb-1">
                    15. List Number (शासकीय यादी क्र.) *
                  </label>
                  <input
                    type="text"
                    value={formListNumber}
                    onChange={(e) => {
                      setFormListNumber(e.target.value);
                      setFormErrors((prev) => {
                        const n = { ...prev };
                        delete n.listNumber;
                        return n;
                      });
                    }}
                    placeholder="उदा. 578"
                    className={`w-full px-3.5 py-2.5 rounded-xl bg-white border text-xs font-bold text-slate-900 ${
                      formErrors.listNumber ? 'border-rose-500 ring-2 ring-rose-200' : 'border-slate-300'
                    }`}
                    required
                  />
                  {formErrors.listNumber && (
                    <p className="text-[10px] font-bold text-rose-600 mt-1">{formErrors.listNumber}</p>
                  )}
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
                  placeholder="उदा. कागदपत्रे तपासली, दोन्ही योजनांचे अर्ज जोडले."
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

            {/* SUBMIT BUTTON WITH DOUBLE SUBMIT PROTECTION */}
            <div className="pt-2 flex items-center justify-between flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setActiveTab('claims')}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-300 cursor-pointer"
              >
                रद्द करा (Cancel)
              </button>

              <button
                type="submit"
                disabled={isSubmittingClaim || !isWorkerVerified || Boolean(duplicateWarning)}
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
          {isWorkerVerified && (
            <div className="mt-8 border-t border-slate-200 pt-6 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <History className="w-4 h-4 text-blue-800" />
                  <span>
                    कामगाराचा मागील क्लेम इतिहास (Previous Claim History for {formMhNumber})
                  </span>
                </h3>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                  एकूण {workerClaimHistory.length} नोंदी
                </span>
              </div>

              {workerClaimHistory.length === 0 ? (
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
                      {workerClaimHistory.map((h, i) => (
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
      {activeTab === 'scheme-master' && (
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
                    min="1"
                    step="100"
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
      {activeTab === 'list-view' && (
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

          {/* SEARCH & FILTERS CONTROLS */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              {/* FREE SEARCH BAR */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  placeholder="शोधा: कामगाराचे नाव, MH नंबर, मोबाईल किंवा लिस्ट नंबर..."
                  className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-700"
                />
              </div>

              {/* ACTION TOOLBAR: EXPORT / BULK DELETE */}
              <div className="flex items-center gap-2">
                {selectedIds.size > 0 && (
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
                    <span>निवडलेले हटवा ({selectedIds.size})</span>
                  </button>
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

            {/* FILTER DROPDOWNS BAR */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-1 text-xs">
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

              {/* List Number filter */}
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

              {/* Clear filters button */}
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setTalukaFilter('');
                    setFromSourceFilter('');
                    setFinancialYearFilter('All');
                    setSchemeFilter('All');
                    setListNumberFilter('');
                    setFromDate('');
                    setToDate('');
                    setCurrentPage(1);
                  }}
                  className="w-full py-1.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-bold transition text-center cursor-pointer"
                >
                  फिल्टर क्लिअर करा (Clear)
                </button>
              </div>
            </div>
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
                    <th className="py-3 px-4 min-w-[100px]">Financial Year</th>
                    <th className="py-3 px-4 min-w-[100px]">List Number</th>
                    <th className="py-3 px-4 min-w-[110px]">Claim Date</th>
                    <th className="py-3 px-4 min-w-[120px]">Created By</th>
                    <th className="py-3 px-4 text-right min-w-[140px]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {filteredClaims.length === 0 ? (
                    <tr>
                      <td colSpan={16} className="text-center py-12 text-slate-400">
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

                          {/* List Number */}
                          <td className="py-3 px-4 font-mono font-bold text-blue-950">
                            {claim.listNumber || '-'}
                          </td>

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

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">List Number</label>
                  <input
                    type="text"
                    value={editForm.listNumber}
                    onChange={(e) => setEditForm((prev: any) => ({ ...prev, listNumber: e.target.value }))}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Alt Mobile</label>
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
                  min="1"
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
    </div>
  );
};
