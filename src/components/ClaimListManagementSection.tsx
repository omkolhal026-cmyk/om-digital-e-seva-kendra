import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  Layers,
  FileSpreadsheet,
  Users,
  CheckCircle2,
  Search,
  Filter,
  Download,
  ChevronRight,
  ArrowLeft,
  Calendar,
  Building2,
  Phone,
  FileText,
  Copy,
  Check,
  RotateCcw,
  Eye,
  SlidersHorizontal,
  Clock,
  ExternalLink,
  ShieldCheck,
  AlertCircle,
  X,
  IndianRupee,
  Wallet,
  MapPin,
  Plus,
  Trash2,
} from 'lucide-react';
import { WorkerClaim } from '../types';
import { formatDate, normalizeDateToYMD } from '../utils/exportUtils';
import { getClaimFinancials, formatClaimExcelRow } from '../utils/claimFinancials';
import { toast } from '../utils/toastConfig';
import {
  CustomerCommissionManagementPanel,
  COMMISSION_STORAGE_KEY,
  CustomerCommissionItem,
} from './CustomerCommissionManagementPanel';
import { AdhikariCommissionManagementPanel } from './AdhikariCommissionManagementPanel';
import { FromSourceFilterSelect } from './FromSourceFilterSelect';

const LIST_PAYMENT_COMPLETE_STORAGE_KEY = 'OM_DIGITAL_LIST_PAYMENT_COMPLETE_V1';

interface ClaimListManagementSectionProps {
  claims: WorkerClaim[];
  onOpenPrintSlip?: (type: 'claim', data: any) => void;
  onRefreshClaims?: () => void;
  currentUser?: { name?: string; role?: string; username?: string };
}

export const ClaimListManagementSection: React.FC<ClaimListManagementSectionProps> = ({
  claims,
  onOpenPrintSlip,
  onRefreshClaims,
  currentUser,
}) => {
  // Navigation: currently selected list for drill-down view (null = all lists summary/cards view)
  const [selectedListNumber, setSelectedListNumber] = useState<string | null>(null);

  // Customer Commission Management Navigation (null = not in commission management)
  const [activeCommissionListNumber, setActiveCommissionListNumber] = useState<string | null>(null);

  // Adhikari Commission Management Navigation (null = not in adhikari commission management)
  const [activeAdhikariListNumber, setActiveAdhikariListNumber] = useState<string | null>(null);

  // Search & Filter state (all 7 work simultaneously)
  const [listNumberSearch, setListNumberSearch] = useState('');
  const [workerNameSearch, setWorkerNameSearch] = useState('');
  const [mhNumberSearch, setMhNumberSearch] = useState('');
  const [talukaFilter, setTalukaFilter] = useState('All');
  const [verificationDateFilter, setVerificationDateFilter] = useState('');
  const [claimStatusFilter, setClaimStatusFilter] = useState('All');
  const [fromSourceFilter, setFromSourceFilter] = useState('');

  // Copy feedback state
  const [copiedMh, setCopiedMh] = useState<string | null>(null);

  // Pagination for Details View
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 50;

  // Taluka Wise Approved Claims Modal
  const [selectedTalukaApprovedModal, setSelectedTalukaApprovedModal] = useState<string | null>(null);
  const [talukaModalSearch, setTalukaModalSearch] = useState<string>('');

  // --------------------------------------------------------------------------
  // LIST PAYMENT COMPLETE STATE & STORAGE
  // --------------------------------------------------------------------------
  const [completedListsMap, setCompletedListsMap] = useState<{ [listNumber: string]: boolean }>({});
  const [confirmCompleteList, setConfirmCompleteList] = useState<{
    listNumber: string;
    totalWorkers: number;
    totalSchemeAmount: number;
    totalCommission: number;
    totalReceived: number;
    totalPending: number;
  } | null>(null);
  const [pendingWarningList, setPendingWarningList] = useState<{
    listNumber: string;
    totalWorkers: number;
    totalCommission: number;
    totalReceived: number;
    totalPending: number;
    pendingWorkers: { name: string; mh: string; pending: number; total: number; received: number }[];
  } | null>(null);
  const [detailsCompleteListNumber, setDetailsCompleteListNumber] = useState<string | null>(null);

  // --------------------------------------------------------------------------
  // GOVERNMENT LIST DIRECTORY MANUAL LIST DATE STATE & PERSISTENCE
  // --------------------------------------------------------------------------
  const [savedListsMap, setSavedListsMap] = useState<Record<string, { listDate?: string }>>({});
  const [createListModalOpen, setCreateListModalOpen] = useState(false);
  const [newListNumberInput, setNewListNumberInput] = useState('');
  const [newListDateInput, setNewListDateInput] = useState(''); // Strictly manual, NOT auto-filled with today's date
  const [isSavingList, setIsSavingList] = useState(false);
  const [listModalError, setListModalError] = useState<string | null>(null);

  const [editListModalOpen, setEditListModalOpen] = useState(false);
  const [editingListNumber, setEditingListNumber] = useState('');
  const [editListDateInput, setEditListDateInput] = useState('');

  // Helper for auth headers
  const getAuthHeaders = (): Record<string, string> => {
    const token =
      localStorage.getItem('om_eseva_token') ||
      sessionStorage.getItem('om_eseva_token') ||
      '';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (currentUser?.username) headers['x-user-username'] = currentUser.username;
    else headers['x-user-username'] = 'admin';
    return headers;
  };

  // Load completed lists map from Database (with local cache fallback)
  React.useEffect(() => {
    const fetchCompletedLists = async () => {
      try {
        const res = await fetch('/api/claim-list-payment-status', {
          headers: getAuthHeaders(),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.success && data.completedLists) {
          setCompletedListsMap(data.completedLists);
          try {
            localStorage.setItem(LIST_PAYMENT_COMPLETE_STORAGE_KEY, JSON.stringify(data.completedLists));
          } catch (_) {}
          return;
        }
      } catch (err) {
        console.warn('Could not fetch completed lists from database, using local cache:', err);
      }

      // Local fallback if offline
      try {
        const raw = localStorage.getItem(LIST_PAYMENT_COMPLETE_STORAGE_KEY);
        if (raw) setCompletedListsMap(JSON.parse(raw));
      } catch (e) {
        console.error('Failed reading list payment complete status', e);
      }
    };

    fetchCompletedLists();
  }, []);

  // Fetch saved government lists from Database
  const fetchSavedLists = React.useCallback(async () => {
    try {
      const res = await fetch('/api/claim-payments/lists', {
        headers: getAuthHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success && Array.isArray(data.lists)) {
        const map: Record<string, { listDate?: string }> = {};
        data.lists.forEach((l: any) => {
          if (l.listNumber) {
            map[String(l.listNumber).trim()] = {
              listDate: l.listDate ? normalizeDateToYMD(l.listDate) : '',
            };
          }
        });
        setSavedListsMap(map);
      }
    } catch (err) {
      console.warn('Could not fetch saved lists from database:', err);
    }
  }, []);

  React.useEffect(() => {
    fetchSavedLists();
  }, [fetchSavedLists]);

  const handleOpenCreateListModal = () => {
    setNewListNumberInput('');
    setNewListDateInput(''); // Do NOT automatically fill today's date
    setListModalError(null);
    setCreateListModalOpen(true);
  };

  const handleSaveNewList = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNum = newListNumberInput.trim();
    if (!cleanNum) {
      setListModalError('कृपया शासकीय यादी क्रमांक प्रविष्ट करा (Please enter List Number).');
      return;
    }
    setIsSavingList(true);
    setListModalError(null);
    try {
      const normDate = newListDateInput ? normalizeDateToYMD(newListDateInput) : '';
      const res = await fetch('/api/claim-payments/lists', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          listNumber: cleanNum,
          listDate: normDate,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'यादी जतन करताना त्रुटी आली.');
      }
      setSavedListsMap((prev) => ({
        ...prev,
        [cleanNum]: { listDate: normDate },
      }));
      setCreateListModalOpen(false);
      setNewListNumberInput('');
      setNewListDateInput('');
      toast.show({ type: 'success', message: `शासकीय यादी क्र. ${cleanNum} यशस्वीरीत्या तयार केली!` });
      await fetchSavedLists();
      if (onRefreshClaims) onRefreshClaims();
    } catch (err: any) {
      setListModalError(err.message || 'Error creating Government List');
    } finally {
      setIsSavingList(false);
    }
  };

  const handleOpenEditListModal = (listNum: string, currentSavedDate?: string) => {
    setEditingListNumber(listNum);
    const norm = currentSavedDate ? normalizeDateToYMD(currentSavedDate) : '';
    setEditListDateInput(norm);
    setListModalError(null);
    setEditListModalOpen(true);
  };

  const handleSaveEditList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingListNumber) return;
    setIsSavingList(true);
    setListModalError(null);
    try {
      const normDate = editListDateInput ? normalizeDateToYMD(editListDateInput) : '';
      const res = await fetch(`/api/claim-payments/lists/${encodeURIComponent(editingListNumber)}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          listNumber: editingListNumber,
          listDate: normDate,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'यादी तारीख अपडेट करताना त्रुटी आली.');
      }
      setSavedListsMap((prev) => ({
        ...prev,
        [editingListNumber]: { listDate: normDate },
      }));
      setEditListModalOpen(false);
      toast.show({ type: 'success', message: `यादी क्र. ${editingListNumber} ची तारीख अपडेट केली!` });
      await fetchSavedLists();
      if (onRefreshClaims) onRefreshClaims();
    } catch (err: any) {
      setListModalError(err.message || 'Error updating List Date');
    } finally {
      setIsSavingList(false);
    }
  };

  // --------------------------------------------------------------------------
  // GOVERNMENT LIST DIRECTORY DELETE FUNCTIONALITY WITH LINKED RECORD PROTECTION
  // --------------------------------------------------------------------------
  const [deleteTargetList, setDeleteTargetList] = useState<{
    listNumber: string;
    claimsCount: number;
  } | null>(null);
  const [isCheckingDelete, setIsCheckingDelete] = useState(false);
  const [isDeletingList, setIsDeletingList] = useState(false);
  const [deleteBlockedInfo, setDeleteBlockedInfo] = useState<{
    listNumber: string;
    reason: string;
    linkedDetails: any;
  } | null>(null);

  const handlePromptDeleteList = async (listNumber: string, claimsCount: number) => {
    // 1. Quick client-side check if claims exist
    if (claimsCount > 0) {
      setDeleteBlockedInfo({
        listNumber,
        reason: `या शासकीय यादीमध्ये ${claimsCount} कामगार क्लेम्स (Worker Claims) समाविष्ट आहेत. डेटाचे नुकसान टाळण्यासाठी ज्या यादीत क्लेम्स आहेत ती यादी डिलीट करता येत नाही. प्रथम सर्व क्लेम्स इतर यादीत हलवा किंवा काढा.`,
        linkedDetails: { linkedClaimsCount: claimsCount },
      });
      return;
    }

    // 2. Server-side check for linked payment workers, commissions, or expenses
    setIsCheckingDelete(true);
    try {
      const res = await fetch(`/api/claim-payments/lists/${encodeURIComponent(listNumber)}/check-delete`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        if (!data.canDelete) {
          setDeleteBlockedInfo({
            listNumber,
            reason: data.reason || 'Cannot delete list: linked records exist.',
            linkedDetails: data,
          });
          return;
        }
      }
      // Allowed to prompt confirmation modal
      setDeleteTargetList({ listNumber, claimsCount });
    } catch (err: any) {
      console.warn('Error checking list deletability:', err);
      // Fallback: allow prompt, backend DELETE endpoint will strictly re-verify
      setDeleteTargetList({ listNumber, claimsCount });
    } finally {
      setIsCheckingDelete(false);
    }
  };

  const handleConfirmDeleteList = async () => {
    if (!deleteTargetList) return;
    const { listNumber } = deleteTargetList;
    setIsDeletingList(true);
    try {
      const res = await fetch(`/api/claim-payments/lists/${encodeURIComponent(listNumber)}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'यादी डिलीट करताना त्रुटी आली.');
      }

      setSavedListsMap((prev) => {
        const next = { ...prev };
        delete next[listNumber];
        return next;
      });

      setDeleteTargetList(null);
      toast.show({
        type: 'success',
        message: `शासकीय यादी क्र. ${listNumber} यशस्वीरीत्या डिलीट केली! (List #${listNumber} deleted successfully)`,
      });

      await fetchSavedLists();
      if (onRefreshClaims) onRefreshClaims();
    } catch (err: any) {
      toast.show({
        type: 'error',
        message: err.message || 'यादी डिलीट करणे अयशस्वी झाले (Failed to delete list).',
      });
    } finally {
      setIsDeletingList(false);
    }
  };

  // Compute live Commission Summary for a given List Number
  const getListCommissionSummary = (listNum: string, groupClaims: WorkerClaim[]) => {
    let commMap: { [claimId: string]: CustomerCommissionItem } = {};
    try {
      const raw = localStorage.getItem(COMMISSION_STORAGE_KEY);
      if (raw) commMap = JSON.parse(raw);
    } catch (e) {
      console.error('Failed reading customer commission store', e);
    }

    let totalSchemeAmount = 0;
    let totalCommission = 0;
    let totalReceived = 0;
    let totalPending = 0;
    const pendingWorkers: { name: string; mh: string; pending: number; total: number; received: number }[] = [];
    const customerDetails: {
      customerName: string;
      mhNumber: string;
      mobileNumber: string;
      verificationDate: string;
      scheme1Name: string;
      scheme1Amount: number;
      scheme1Status: string;
      scheme1ApprovedAmount: number;
      scheme2Name: string;
      scheme2Amount: number;
      scheme2Status: string;
      scheme2ApprovedAmount: number;
      totalClaimAmount: number;
      totalSchemeAmount: number;
      totalCommission: number;
      commissionReceived: number;
      commissionPending: number;
      paymentStatus: string;
      receivingAccounts: string;
      collections: any[];
    }[] = [];

    groupClaims.forEach((c) => {
      const fin = getClaimFinancials(c);
      const s1Amt = fin.scheme1OriginalAmount;
      const s2Amt = fin.scheme2OriginalAmount;
      const sTot = fin.totalApprovedAmount;
      totalSchemeAmount += sTot;

      const commItem = commMap[c.id];
      const cTotal = commItem ? Number(commItem.totalCommission || 0) : 0;
      const cRec = commItem ? Number(commItem.commissionReceived || 0) : 0;
      const cPending = commItem ? Number(commItem.commissionPending || 0) : Math.max(0, cTotal - cRec);
      const cStatus = commItem ? commItem.paymentStatus : (cTotal > 0 && cRec >= cTotal ? 'Paid' : cRec > 0 ? 'Partially Paid' : 'Pending');
      const cCollections = commItem ? (commItem.collections || []) : [];

      const accs = Array.from(new Set(cCollections.map((col) => col.receivingAccount).filter(Boolean)));
      const accStr = accs.length > 0 ? accs.join(' | ') : '-';

      totalCommission += cTotal;
      totalReceived += cRec;
      totalPending += cPending;

      // Pending if commissionPending > 0 OR if commission was not yet manually set on an approved claim (total == 0 and rec == 0 and sTot > 0)
      if (cPending > 0 || (cTotal === 0 && cRec === 0 && sTot > 0)) {
        pendingWorkers.push({
          name: c.workerName,
          mh: c.mhNumber,
          pending: cPending,
          total: cTotal,
          received: cRec,
        });
      }

      customerDetails.push({
        customerName: c.workerName,
        mhNumber: c.mhNumber,
        mobileNumber: c.mobileNumber || '-',
        verificationDate: c.verificationDate ? formatDate(c.verificationDate) : '-',
        scheme1Name: c.scheme1Name || '-',
        scheme1Amount: s1Amt,
        scheme1Status: fin.scheme1Status,
        scheme1ApprovedAmount: fin.scheme1ApprovedAmount,
        scheme2Name: c.scheme2Name || '-',
        scheme2Amount: s2Amt,
        scheme2Status: fin.scheme2Status,
        scheme2ApprovedAmount: fin.scheme2ApprovedAmount,
        totalClaimAmount: fin.totalClaimAmount,
        totalSchemeAmount: sTot,
        totalCommission: cTotal,
        commissionReceived: cRec,
        commissionPending: cPending,
        paymentStatus: cStatus,
        receivingAccounts: accStr,
        collections: cCollections,
      });
    });

    // List is fully paid ONLY IF all workers have 0 pending and totalCommission was actually set (>0)
    const isFullyPaid = groupClaims.length > 0 && pendingWorkers.length === 0 && totalPending === 0 && totalCommission > 0;
    // Marked complete is valid only if isFullyPaid
    const isMarkedComplete = Boolean(completedListsMap[listNum]) && isFullyPaid;

    return {
      totalWorkers: groupClaims.length,
      totalSchemeAmount,
      totalCommission,
      totalReceived,
      totalPending,
      pendingWorkers,
      customerDetails,
      isFullyPaid,
      isMarkedComplete,
    };
  };

  // Action Click: List Payment Complete
  const handleListPaymentCompleteClick = (listNum: string, groupClaims: WorkerClaim[]) => {
    const summary = getListCommissionSummary(listNum, groupClaims);

    // Rule 2: एकाही ग्राहकाचे Commission Pending बाकी असल्यास List Complete करू नका.
    if (summary.pendingWorkers.length > 0 || summary.totalPending > 0 || summary.totalCommission === 0) {
      setPendingWarningList({
        listNumber: listNum,
        totalWorkers: summary.totalWorkers,
        totalCommission: summary.totalCommission,
        totalReceived: summary.totalReceived,
        totalPending: summary.totalPending,
        pendingWorkers: summary.pendingWorkers,
      });
      return;
    }

    // Rule 3: सर्व ग्राहकांचे Commission पूर्ण जमा झाले असल्यास Confirmation Popup दाखवा
    setConfirmCompleteList({
      listNumber: listNum,
      totalWorkers: summary.totalWorkers,
      totalSchemeAmount: summary.totalSchemeAmount,
      totalCommission: summary.totalCommission,
      totalReceived: summary.totalReceived,
      totalPending: summary.totalPending,
    });
  };

  // Confirm Mark as Complete
  const handleConfirmMarkComplete = async (listNum: string) => {
    const updated = { ...completedListsMap, [listNum]: true };
    setCompletedListsMap(updated);
    try {
      localStorage.setItem(LIST_PAYMENT_COMPLETE_STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed saving list payment complete status', e);
    }

    // Persist to Database
    try {
      await fetch('/api/claim-list-payment-status', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          listNumber: listNum,
          isCompleted: true,
          markedBy: currentUser?.name || currentUser?.username || 'Admin / Operator',
        }),
      });
    } catch (dbErr) {
      console.error('Failed persisting list payment complete status to database:', dbErr);
    }

    toast.show({
      type: 'success',
      message: `यादी क्र. ${listNum} चे पेमेंट स्टेटस 'PAYMENT COMPLETE' म्हणून Database मध्ये यशस्वीरीत्या जतन केले!`,
    });
    setConfirmCompleteList(null);
  };

  // Export Completed List Details to Excel
  const handleExportCompletedListDetails = (listNum: string, summary: ReturnType<typeof getListCommissionSummary>) => {
    try {
      const wb = XLSX.utils.book_new();
      const rows = summary.customerDetails.map((c, idx) => ({
        'Sr No': idx + 1,
        'Customer Name': c.customerName,
        'MH Number': c.mhNumber,
        'Mobile Number': c.mobileNumber,
        'Scheme 1 Name': c.scheme1Name,
        'Scheme 1 Original Amount': Number(c.scheme1Amount || 0),
        'Scheme 1 Approval Status': c.scheme1Status,
        'Scheme 1 Approved Amount': Number(c.scheme1ApprovedAmount || 0),
        'Scheme 2 Name': c.scheme2Name,
        'Scheme 2 Original Amount': Number(c.scheme2Amount || 0),
        'Scheme 2 Approval Status': c.scheme2Name !== '-' ? c.scheme2Status : '-',
        'Scheme 2 Approved Amount': Number(c.scheme2ApprovedAmount || 0),
        'Total Claim Amount': Number(c.totalClaimAmount || 0),
        'Total Approved Amount': Number(c.totalSchemeAmount || 0),
        'Government List Number': listNum,
        'Verification Date': c.verificationDate,
        'Total Commission': Number(c.totalCommission || 0),
        'Commission Received': Number(c.commissionReceived || 0),
        'Commission Pending': Number(c.commissionPending || 0),
        'Payment Status': c.paymentStatus,
        'Receiving Account': c.receivingAccounts,
        'Total Installments': c.collections.length,
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, `List_${listNum}_Details`);

      // Detailed transactions
      const transRows: any[] = [];
      let trSr = 1;
      summary.customerDetails.forEach((c) => {
        c.collections.forEach((col: any, cIdx: number) => {
          transRows.push({
            'अ.क्र.': trSr++,
            'ग्राहकाचे नाव': c.customerName,
            'MH Number': c.mhNumber,
            'हप्ता क्र.': cIdx + 1,
            'तारीख': formatDate(col.date),
            'जमा रक्कम (₹)': col.amount,
            'जमा खाते (Receiving Account)': col.receivingAccount,
            'नोंदणीकर्ता': col.collectedBy || '-',
          });
        });
      });

      if (transRows.length > 0) {
        const wsTrans = XLSX.utils.json_to_sheet(transRows);
        XLSX.utils.book_append_sheet(wb, wsTrans, 'Collection_History');
      }

      XLSX.writeFile(wb, `OM_DIGITAL_List_${listNum}_Payment_Complete_Details.xlsx`);
      toast.show({ type: 'success', message: `यादी क्र. ${listNum} चे पेमेंट विवरण एक्सेलमध्ये डाऊनलोड झाले!` });
    } catch (e) {
      console.error(e);
      toast.show({ type: 'error', message: 'एक्सेल डाऊनलोड करताना त्रुटी आली.' });
    }
  };

  // Extract unique taluka choices from claims
  const talukaOptions = useMemo(() => {
    const set = new Set<string>();
    claims.forEach((c) => {
      if (c.taluka && c.taluka.trim()) {
        set.add(c.taluka.trim());
      }
    });
    // Ensure default common talukas are included if present
    ['Junnar', 'Ambegaon', 'Khed', 'Shirur'].forEach((t) => set.add(t));
    return Array.from(set).sort();
  }, [claims]);

  // Extract unique status choices
  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    claims.forEach((c) => {
      if (c.status) set.add(c.status);
    });
    return ['All', 'Approved', 'Pending', 'Under Scrutiny', 'Disbursed', 'Rejected', ...Array.from(set).filter(s => !['Approved', 'Pending', 'Under Scrutiny', 'Disbursed', 'Rejected'].includes(s))];
  }, [claims]);

  // Helper: check if a claim matches current active filters
  const matchesFilters = (claim: WorkerClaim) => {
    // 1. List Number Search
    if (listNumberSearch.trim()) {
      const q = listNumberSearch.trim().toLowerCase();
      const listVal = String(claim.listNumber || '').toLowerCase();
      if (!listVal.includes(q)) return false;
    }

    // 2. Worker Name Search
    if (workerNameSearch.trim()) {
      const q = workerNameSearch.trim().toLowerCase();
      const nameVal = String(claim.workerName || '').toLowerCase();
      if (!nameVal.includes(q)) return false;
    }

    // 3. MH Number Search
    if (mhNumberSearch.trim()) {
      const q = mhNumberSearch.trim().toLowerCase();
      const mhVal = String(claim.mhNumber || '').toLowerCase();
      if (!mhVal.includes(q)) return false;
    }

    // 4. Taluka Filter
    if (talukaFilter !== 'All') {
      if (claim.taluka !== talukaFilter) return false;
    }

    // 5. Verification Date Filter
    if (verificationDateFilter.trim()) {
      const dateVal = String(claim.verificationDate || '').slice(0, 10);
      if (dateVal !== verificationDateFilter) return false;
    }

    // 6. Claim Status Filter
    if (claimStatusFilter !== 'All') {
      const statusLower = String(claim.status || '').toLowerCase();
      const filterLower = claimStatusFilter.toLowerCase();
      if (statusLower !== filterLower) return false;
    }

    // 7. From Source Filter (स्त्रोत)
    if (fromSourceFilter && fromSourceFilter !== 'All') {
      const claimSource = (claim.fromSource || '').trim().toLowerCase();
      const filterSource = fromSourceFilter.trim().toLowerCase();
      if (claimSource !== filterSource) return false;
    }

    return true;
  };

  // --------------------------------------------------------------------------
  // AUTOMATIC LIST CREATION & GROUPING
  // Every claim with a listNumber is grouped. No fake/dummy claims created.
  // Claims without listNumber are counted as "Pending List Allocation".
  // --------------------------------------------------------------------------
  interface ListGroup {
    listNumber: string;
    listDate?: string;
    claims: WorkerClaim[];
    totalWorkers: number;
    totalGovtAmount: number;
    talukas: string[];
    statuses: { [key: string]: number };
    approvedCount: number;
    statusSummary: string;
  }

  const { listGroups, unassignedClaims, overallMetrics } = useMemo(() => {
    const groupsMap = new Map<string, WorkerClaim[]>();
    const unassigned: WorkerClaim[] = [];

    claims.forEach((claim) => {
      const listNum = (claim.listNumber || '').trim();
      if (listNum) {
        if (!groupsMap.has(listNum)) {
          groupsMap.set(listNum, []);
        }
        groupsMap.get(listNum)!.push(claim);
      } else {
        unassigned.push(claim);
      }
    });

    const groups: ListGroup[] = [];

    groupsMap.forEach((groupClaims, listNumber) => {
      let totalAmount = 0;
      let approvedCount = 0;
      const talukaSet = new Set<string>();
      const statuses: { [key: string]: number } = {};
      let latestDate: string | undefined = undefined;

      groupClaims.forEach((c) => {
        const fin = getClaimFinancials(c);
        totalAmount += fin.totalApprovedAmount;
        const st = c.status || 'Pending';
        statuses[st] = (statuses[st] || 0) + 1;
        if (st.toLowerCase() === 'approved' || st.toLowerCase() === 'disbursed') {
          approvedCount++;
        }
        if (c.taluka) talukaSet.add(c.taluka.trim());
      });

      // Overall status label
      let statusSummary = 'Approved';
      if (approvedCount === groupClaims.length) {
        statusSummary = 'Approved';
      } else if (approvedCount === 0) {
        statusSummary = 'In Process';
      } else {
        statusSummary = `Partially Approved (${approvedCount}/${groupClaims.length})`;
      }

      // Manual List Date strictly from saved database record (No automatic derivation)
      const manualDate = savedListsMap[listNumber]?.listDate || undefined;

      groups.push({
        listNumber,
        listDate: manualDate,
        claims: groupClaims,
        totalWorkers: groupClaims.length,
        totalGovtAmount: totalAmount,
        talukas: Array.from(talukaSet),
        statuses,
        approvedCount,
        statusSummary,
      });
    });

    // Also include any created Government Lists from database that do not have claims attached yet
    Object.keys(savedListsMap).forEach((listNum) => {
      const cleanNum = listNum.trim();
      if (cleanNum && !groupsMap.has(cleanNum)) {
        groups.push({
          listNumber: cleanNum,
          listDate: savedListsMap[cleanNum]?.listDate || undefined,
          claims: [],
          totalWorkers: 0,
          totalGovtAmount: 0,
          talukas: [],
          statuses: {},
          approvedCount: 0,
          statusSummary: 'Approved',
        });
      }
    });

    // Sort list groups naturally (e.g., numeric where possible or alphabetical)
    groups.sort((a, b) => {
      const numA = parseInt(a.listNumber.replace(/\D/g, ''), 10);
      const numB = parseInt(b.listNumber.replace(/\D/g, ''), 10);
      if (!isNaN(numA) && !isNaN(numB)) {
        return numB - numA; // newest/highest list first
      }
      return a.listNumber.localeCompare(b.listNumber);
    });

    // 4 Dashboard Metrics across all grouped lists
    const totalLists = groups.length;
    let totalWorkers = 0;
    let totalGovtAmount = 0;

    // Deduplicated Approved claims across all lists
    const approvedClaimsList: WorkerClaim[] = [];
    const seenApprovedIds = new Set<string>();

    groups.forEach((g) => {
      totalWorkers += g.totalWorkers;
      totalGovtAmount += g.totalGovtAmount;
      g.claims.forEach((c) => {
        const st = (c.status || '').trim().toLowerCase();
        // Strict exclusion of pending and rejected claims
        if (st === 'approved' || st === 'disbursed' || st === 'payment released') {
          const idKey = c.id || `${c.mhNumber}_${c.listNumber || ''}_${c.scheme1Id || ''}`;
          if (!seenApprovedIds.has(idKey)) {
            seenApprovedIds.add(idKey);
            approvedClaimsList.push(c);
          }
        }
      });
    });

    const totalApproved = approvedClaimsList.length;

    // 4 Target Talukas: Junnar, Ambegaon, Khed, Shirur
    const talukaApprovedMap: Record<'Junnar' | 'Ambegaon' | 'Khed' | 'Shirur', WorkerClaim[]> = {
      Junnar: [],
      Ambegaon: [],
      Khed: [],
      Shirur: [],
    };

    approvedClaimsList.forEach((c) => {
      const cTaluka = (c.taluka || '').trim().toLowerCase();
      if (cTaluka === 'junnar' || cTaluka.includes('junnar') || cTaluka.includes('जुन्नर')) {
        talukaApprovedMap['Junnar'].push(c);
      } else if (cTaluka === 'ambegaon' || cTaluka.includes('ambegaon') || cTaluka.includes('आंबेगाव')) {
        talukaApprovedMap['Ambegaon'].push(c);
      } else if (cTaluka === 'khed' || cTaluka.includes('khed') || cTaluka.includes('खेड')) {
        talukaApprovedMap['Khed'].push(c);
      } else if (cTaluka === 'shirur' || cTaluka.includes('shirur') || cTaluka.includes('शिरूर') || cTaluka.includes('शिरुर')) {
        talukaApprovedMap['Shirur'].push(c);
      }
    });

    // Total Amount: sum of Approved Scheme amounts only for all Approved Claims
    let totalApprovedAmount = 0;
    approvedClaimsList.forEach((c) => {
      const fin = getClaimFinancials(c);
      totalApprovedAmount += fin.totalApprovedAmount;
    });

    return {
      listGroups: groups,
      unassignedClaims: unassigned,
      overallMetrics: {
        totalLists,
        totalWorkers,
        totalApproved,
        talukaApprovedMap,
        totalApprovedAmount,
        approvedClaimsList,
        totalGovtAmount,
      },
    };
  }, [claims, savedListsMap]);

  // Filtered List Groups for the main dashboard view
  const filteredListGroups = useMemo(() => {
    return listGroups
      .map((g) => {
        // filter claims inside this group
        const matchingClaims = g.claims.filter(matchesFilters);
        return {
          ...g,
          matchingClaims,
        };
      })
      .filter((g) => {
        // If searching specifically by list number, ensure match
        if (listNumberSearch.trim()) {
          const q = listNumberSearch.trim().toLowerCase();
          if (!g.listNumber.toLowerCase().includes(q)) return false;
        }
        // If worker/MH/status/taluka/source filters are applied, only show groups with matching claims
        const isWorkerFilterActive =
          workerNameSearch.trim() ||
          mhNumberSearch.trim() ||
          talukaFilter !== 'All' ||
          verificationDateFilter.trim() ||
          claimStatusFilter !== 'All' ||
          (fromSourceFilter && fromSourceFilter !== 'All');

        if (isWorkerFilterActive) {
          return g.matchingClaims.length > 0;
        }
        return true;
      });
  }, [
    listGroups,
    listNumberSearch,
    workerNameSearch,
    mhNumberSearch,
    talukaFilter,
    verificationDateFilter,
    claimStatusFilter,
    fromSourceFilter,
  ]);

  // Selected List data for drilldown view
  const selectedGroup = useMemo(() => {
    if (!selectedListNumber) return null;
    return listGroups.find((g) => g.listNumber === selectedListNumber) || null;
  }, [listGroups, selectedListNumber]);

  // Filtered claims inside the selected list
  const selectedListFilteredClaims = useMemo(() => {
    if (!selectedGroup) return [];
    return selectedGroup.claims.filter(matchesFilters);
  }, [selectedGroup, listNumberSearch, workerNameSearch, mhNumberSearch, talukaFilter, verificationDateFilter, claimStatusFilter, fromSourceFilter]);

  // Paginated records for selected list table
  const totalPages = Math.max(1, Math.ceil(selectedListFilteredClaims.length / pageSize));
  const paginatedClaims = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return selectedListFilteredClaims.slice(start, start + pageSize);
  }, [selectedListFilteredClaims, currentPage, pageSize]);

  // Taluka Modal Approved Claims
  const modalApprovedClaims = useMemo(() => {
    if (!selectedTalukaApprovedModal) return [];
    let base: WorkerClaim[] = [];
    if (selectedTalukaApprovedModal === 'ALL') {
      base = overallMetrics.approvedClaimsList;
    } else if (
      selectedTalukaApprovedModal === 'Junnar' ||
      selectedTalukaApprovedModal === 'Ambegaon' ||
      selectedTalukaApprovedModal === 'Khed' ||
      selectedTalukaApprovedModal === 'Shirur'
    ) {
      base = overallMetrics.talukaApprovedMap[selectedTalukaApprovedModal] || [];
    } else {
      base = overallMetrics.approvedClaimsList.filter(
        (c) => (c.taluka || '').toLowerCase() === selectedTalukaApprovedModal.toLowerCase()
      );
    }

    if (!talukaModalSearch.trim()) return base;
    const q = talukaModalSearch.trim().toLowerCase();
    return base.filter((c) => {
      return (
        (c.workerName || '').toLowerCase().includes(q) ||
        (c.mhNumber || '').toLowerCase().includes(q) ||
        (c.listNumber || '').toLowerCase().includes(q) ||
        (c.scheme1Name || '').toLowerCase().includes(q) ||
        (c.scheme2Name || '').toLowerCase().includes(q) ||
        (c.taluka || '').toLowerCase().includes(q) ||
        (c.fromSource || '').toLowerCase().includes(q)
      );
    });
  }, [selectedTalukaApprovedModal, overallMetrics, talukaModalSearch]);

  const modalApprovedTotalAmount = useMemo(() => {
    return modalApprovedClaims.reduce((sum, c) => {
      return sum + getClaimFinancials(c).totalApprovedAmount;
    }, 0);
  }, [modalApprovedClaims]);

  const handleExportTalukaExcel = () => {
    if (modalApprovedClaims.length === 0) {
      toast.show({ type: 'warning', message: 'डाऊनलोड करण्यासाठी कोणतेही मंजूर क्लेम नाहीत.' });
      return;
    }
    const rows = modalApprovedClaims.map((c, idx) => formatClaimForExcel(c, idx));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = columnWidths;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Approved_Claims');
    const fileName = `${selectedTalukaApprovedModal || 'Taluka'}_Approved_Claims_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, fileName);
    toast.show({ type: 'success', message: `${fileName} यशस्वीरित्या डाऊनलोड झाली.` });
  };

  // Reset all filters
  const handleResetFilters = () => {
    setListNumberSearch('');
    setWorkerNameSearch('');
    setMhNumberSearch('');
    setTalukaFilter('All');
    setVerificationDateFilter('');
    setClaimStatusFilter('All');
    setFromSourceFilter('');
    setCurrentPage(1);
    toast.show({
      type: 'info',
      message: 'सर्व फिल्टर्स रीसेट केले आहेत.',
    });
  };

  const hasActiveFilters = Boolean(
    listNumberSearch.trim() ||
      workerNameSearch.trim() ||
      mhNumberSearch.trim() ||
      talukaFilter !== 'All' ||
      verificationDateFilter.trim() ||
      claimStatusFilter !== 'All' ||
      (fromSourceFilter && fromSourceFilter !== 'All')
  );

  // Copy MH to clipboard
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
  // EXCEL (.XLSX) EXPORT IMPLEMENTATIONS (ALL 14+ INDIVIDUAL SCHEME COLUMNS)
  // --------------------------------------------------------------------------
  const formatClaimForExcel = (c: WorkerClaim, index: number) => {
    const fin = getClaimFinancials(c);
    return {
      'अ.क्र. (Sr No)': index + 1,
      'कामगाराचे नाव (Worker Name)': c.workerName || '',
      'MH क्रमांक (MH Number)': c.mhNumber || '',
      'मोबाईल नंबर (Mobile Number)': c.mobileNumber || '',
      'तालुका (Taluka)': c.taluka || '',
      'पडताळणी तारीख (Verification Date)': c.verificationDate ? formatDate(c.verificationDate) : (c.claimDate ? formatDate(c.claimDate) : '-'),
      'योजना १ (Scheme 1)': c.scheme1Name || '',
      'योजना १ मूळ रक्कम (Scheme 1 Original Amount ₹)': fin.scheme1OriginalAmount,
      'योजना १ स्थिती (Scheme 1 Status)': fin.scheme1Status,
      'योजना १ मंजूर रक्कम (Scheme 1 Approved Amount ₹)': fin.scheme1ApprovedAmount,
      'योजना २ (Scheme 2)': c.scheme2Name || '-',
      'योजना २ मूळ रक्कम (Scheme 2 Original Amount ₹)': fin.scheme2OriginalAmount,
      'योजना २ स्थिती (Scheme 2 Status)': c.scheme2Name ? fin.scheme2Status : '-',
      'योजना २ मंजूर रक्कम (Scheme 2 Approved Amount ₹)': fin.scheme2ApprovedAmount,
      'एकूण क्लेम रक्कम (Total Claim Amount ₹)': fin.totalClaimAmount,
      'एकूण मंजूर रक्कम (Total Approved Amount ₹)': fin.totalApprovedAmount,
      'क्लेम स्थिती (Claim Status)': c.status || 'Pending',
      'शासकीय यादी क्र. (Government List Number)': c.listNumber || 'Unassigned',
      'FROM (स्त्रोत)': c.fromSource || '',
    };
  };

  const columnWidths = [
    { wch: 8 },  // Sr No
    { wch: 28 }, // Worker Name
    { wch: 18 }, // MH Number
    { wch: 16 }, // Mobile
    { wch: 14 }, // Taluka
    { wch: 16 }, // Verification Date
    { wch: 26 }, // Scheme 1
    { wch: 18 }, // Scheme 1 Orig
    { wch: 16 }, // Scheme 1 Status
    { wch: 18 }, // Scheme 1 Approved
    { wch: 26 }, // Scheme 2
    { wch: 18 }, // Scheme 2 Orig
    { wch: 16 }, // Scheme 2 Status
    { wch: 18 }, // Scheme 2 Approved
    { wch: 18 }, // Total Claim
    { wch: 18 }, // Total Approved
    { wch: 16 }, // Claim Status
    { wch: 16 }, // List Number
    { wch: 18 }, // FROM
  ];

  // 1. Full List Export (Summary + All Workers)
  const handleExportFullList = () => {
    try {
      const wb = XLSX.utils.book_new();

      // Sheet 1: Summary of all lists
      const summaryRows = listGroups.map((g, idx) => ({
        'अ.क्र.': idx + 1,
        'यादी क्रमांक (List No)': g.listNumber,
        'यादी तारीख (List Date)': g.listDate ? formatDate(g.listDate) : '-',
        'एकूण कामगार (Workers)': g.totalWorkers,
        'एकूण शासकीय मदत रक्कम (Total Amount ₹)': g.totalGovtAmount,
        'तालुके (Talukas)': g.talukas.join(', ') || '-',
        'स्थिती (Status)': g.statusSummary,
      }));
      const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
      wsSummary['!cols'] = [
        { wch: 8 },
        { wch: 16 },
        { wch: 16 },
        { wch: 16 },
        { wch: 22 },
        { wch: 25 },
        { wch: 20 },
      ];
      XLSX.utils.book_append_sheet(wb, wsSummary, 'यादी सारांश (List Summary)');

      // Sheet 2: All Workers across all lists (with exact 13 columns)
      const allWorkersRows: any[] = [];
      let counter = 1;
      listGroups.forEach((g) => {
        g.claims.forEach((c) => {
          allWorkersRows.push(formatClaimForExcel(c, counter - 1));
          counter++;
        });
      });
      const wsWorkers = XLSX.utils.json_to_sheet(allWorkersRows);
      wsWorkers['!cols'] = columnWidths;
      XLSX.utils.book_append_sheet(wb, wsWorkers, 'सर्व कामगार (All Workers)');

      const today = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `OM_DIGITAL_Claim_Lists_Full_${today}.xlsx`);

      toast.show({
        type: 'success',
        message: 'सर्व याद्यांचा संपूर्ण एक्सेल रिपोर्ट (.xlsx) यशस्वीरित्या डाऊनलोड झाला!',
      });
    } catch (err: any) {
      console.error('Export full list failed:', err);
      toast.show({
        type: 'error',
        message: 'एक्सेल डाऊनलोड करताना त्रुटी आली.',
      });
    }
  };

  // 2. Selected List Export (All Workers of currently opened list)
  const handleExportSelectedList = () => {
    if (!selectedGroup) return;
    try {
      const wb = XLSX.utils.book_new();
      const rows = selectedGroup.claims.map((c, idx) => formatClaimForExcel(c, idx));
      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = columnWidths;
      XLSX.utils.book_append_sheet(wb, ws, `List_${selectedGroup.listNumber}`);

      const today = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(
        wb,
        `OM_DIGITAL_List_${selectedGroup.listNumber}_Workers_${today}.xlsx`
      );

      toast.show({
        type: 'success',
        message: `यादी क्र. ${selectedGroup.listNumber} चा एक्सेल रिपोर्ट (.xlsx) डाऊनलोड झाला!`,
      });
    } catch (err: any) {
      console.error('Export selected list failed:', err);
      toast.show({
        type: 'error',
        message: 'एक्सेल डाऊनलोड करताना त्रुटी आली.',
      });
    }
  };

  // 3. Filtered Records Export
  const handleExportFilteredRecords = () => {
    try {
      const recordsToExport = selectedGroup
        ? selectedListFilteredClaims
        : claims.filter(matchesFilters).filter((c) => (c.listNumber || '').trim());

      if (recordsToExport.length === 0) {
        toast.show({
          type: 'warning',
          message: 'फिल्टर केलेला कोणताही रेकॉर्ड सापडला नाही.',
        });
        return;
      }

      const wb = XLSX.utils.book_new();
      const rows = recordsToExport.map((c, idx) => formatClaimForExcel(c, idx));
      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = columnWidths;
      XLSX.utils.book_append_sheet(wb, ws, 'Filtered_Claims');

      const today = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `OM_DIGITAL_Filtered_Claims_${today}.xlsx`);

      toast.show({
        type: 'success',
        message: `एकूण ${recordsToExport.length} फिल्टर केलेले रेकॉर्ड्स एक्सेलमध्ये डाऊनलोड झाले!`,
      });
    } catch (err: any) {
      console.error('Export filtered failed:', err);
      toast.show({
        type: 'error',
        message: 'एक्सेल डाऊनलोड करताना त्रुटी आली.',
      });
    }
  };

  // Customer Commission Management: If activeCommissionListNumber is set, render CustomerCommissionManagementPanel
  if (activeCommissionListNumber) {
    return (
      <CustomerCommissionManagementPanel
        listNumber={activeCommissionListNumber}
        claims={claims}
        onBackToLists={() => setActiveCommissionListNumber(null)}
        currentUser={currentUser}
      />
    );
  }

  // Adhikari Commission Management: If activeAdhikariListNumber is set, render AdhikariCommissionManagementPanel
  if (activeAdhikariListNumber) {
    return (
      <AdhikariCommissionManagementPanel
        listNumber={activeAdhikariListNumber}
        claims={claims}
        onBackToLists={() => setActiveAdhikariListNumber(null)}
        currentUser={currentUser}
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* ==================================================================== */}
      {/* SECTION HEADER & BRANDING                                             */}
      {/* ==================================================================== */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white rounded-3xl p-6 sm:p-7 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-3 py-1 rounded-full bg-blue-400/20 text-blue-200 text-xs font-black tracking-wide border border-blue-300/30">
                SECTION 2 • CLAIM LIST MANAGEMENT
              </span>
              <span className="px-3 py-1 rounded-full bg-emerald-400/20 text-emerald-200 text-xs font-bold border border-emerald-300/30 flex items-center gap-1">
                <Wallet className="w-3.5 h-3.5" />
                Customer Commission Management
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-3">
              <Layers className="w-8 h-8 text-cyan-400" />
              <span>शासकीय यादी व्यवस्थापन (Claim List Management)</span>
            </h1>
            <p className="text-blue-100/80 text-xs sm:text-sm mt-1 max-w-2xl font-medium">
              OM DIGITAL E-SEVA KENDRA • क्लेम मंजुरीनंतर लिस्ट नंबरनुसार सर्व कामगारांची स्वयंचलित यादी,
              शासकीय मदत रक्कम पडताळणी व संपूर्ण १३-कॉलम एक्सेल रिपोर्टिंग.
            </p>
          </div>

          {/* Quick Actions & Excel Dropdown */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportFullList}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition flex items-center gap-2 cursor-pointer"
              title="Export all lists and workers to Excel (.xlsx)"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-100" />
              <span>सर्व लिस्ट एक्सेल (.xlsx)</span>
            </button>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleExportFilteredRecords}
                className="px-3.5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-md transition flex items-center gap-2 cursor-pointer"
                title="Export filtered records to Excel"
              >
                <Download className="w-4 h-4" />
                <span>फिल्टर डेटा (.xlsx)</span>
              </button>
            )}

            {onRefreshClaims && (
              <button
                type="button"
                onClick={onRefreshClaims}
                className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 transition cursor-pointer"
                title="Refresh Claims"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 2. LIST MANAGEMENT DASHBOARD: 4 SUMMARY CARDS                        */}
      {/* ==================================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: TOTAL LIST */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 shadow-xs hover:border-blue-400 transition flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              TOTAL LIST (एकूण लिस्ट)
            </span>
            <span className="text-2xl sm:text-3xl font-black text-blue-900 font-mono mt-1 block">
              {overallMetrics.totalLists}
            </span>
            <span className="text-[10px] text-slate-400 font-medium mt-0.5 block">
              तयार शासकीय याद्या
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200 text-blue-900 flex items-center justify-center shrink-0">
            <Layers className="w-6 h-6 text-blue-900" />
          </div>
        </div>

        {/* Card 2: TOTAL APPROVED CLAIMS */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 shadow-xs hover:border-emerald-400 transition flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              TOTAL APPROVED CLAIMS (एकूण मंजूर क्लेम)
            </span>
            <span className="text-2xl sm:text-3xl font-black text-emerald-900 font-mono mt-1 block">
              {overallMetrics.totalApproved}
            </span>
            <span className="text-[10px] text-emerald-600 font-semibold mt-0.5 block">
              शासकीय मंजुरी पूर्ण झालेले क्लेम्स
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-6 h-6 text-emerald-700" />
          </div>
        </div>

        {/* Card 3: TALUKA WISE CLAIM (IN NUMBER) */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 shadow-xs hover:border-purple-400 transition flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                TALUKA WISE CLAIM (IN NUMBER)
              </span>
              <span className="text-[10px] text-purple-700 font-semibold mt-0.5 block">
                तालुकानिहाय मंजूर क्लेम (क्लिक करून यादी पहा)
              </span>
            </div>
            <div className="w-9 h-9 rounded-xl bg-purple-50 border border-purple-200 text-purple-900 flex items-center justify-center shrink-0">
              <MapPin className="w-4 h-4 text-purple-700" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5 mt-2.5">
            {(['Junnar', 'Ambegaon', 'Khed', 'Shirur'] as const).map((t) => {
              const count = overallMetrics.talukaApprovedMap[t]?.length || 0;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setSelectedTalukaApprovedModal(t);
                    setTalukaModalSearch('');
                  }}
                  className="flex items-center justify-between px-2.5 py-1.5 rounded-xl bg-purple-50/70 hover:bg-purple-100 hover:border-purple-300 border border-purple-200/80 transition cursor-pointer group text-left"
                  title={`${t} चे मंजूर क्लेम पाहण्यासाठी क्लिक करा`}
                >
                  <span className="text-[11px] font-bold text-slate-700 group-hover:text-purple-900">
                    {t}
                  </span>
                  <span className="text-xs font-black text-purple-900 bg-white px-1.5 py-0.5 rounded-md border border-purple-200 shadow-2xs font-mono">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="text-[10px] text-slate-400 font-medium mt-2 flex items-center justify-between pt-1 border-t border-slate-100">
            <span>उदा. Junnar – {overallMetrics.talukaApprovedMap['Junnar']?.length || 0}</span>
            <button
              type="button"
              onClick={() => {
                setSelectedTalukaApprovedModal('ALL');
                setTalukaModalSearch('');
              }}
              className="text-purple-700 font-bold hover:underline cursor-pointer flex items-center gap-0.5"
            >
              <span>सर्व ({overallMetrics.totalApproved})</span>
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Card 4: TOTAL AMOUNT */}
        <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 shadow-xs hover:border-amber-400 transition flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              TOTAL AMOUNT (एकूण रक्कम)
            </span>
            <span className="text-2xl sm:text-3xl font-black text-amber-950 font-mono mt-1 block">
              ₹{overallMetrics.totalApprovedAmount.toLocaleString('en-IN')}
            </span>
            <span className="text-[10px] text-amber-700 font-semibold mt-0.5 block">
              Scheme 1 + Scheme 2 एकूण रक्कम
            </span>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 flex items-center justify-center shrink-0">
            <IndianRupee className="w-6 h-6 text-amber-700" />
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 5. SEARCH & FILTERS BAR (6 INTEGRATED FILTERS)                       */}
      {/* ==================================================================== */}
      <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-sm space-y-4">
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
                <span>फिल्टर रीसेट करा</span>
              </button>
            )}
            <span className="text-[11px] font-medium text-slate-500">
              एकूण सापडलेले: <strong className="text-slate-800 font-bold">{filteredListGroups.length}</strong> याद्या
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-3">
          {/* 1. List Number Search */}
          <div>
            <label className="text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1 block">
              1. List Number (लिस्ट नं.)
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3 pointer-events-none" />
              <input
                type="text"
                value={listNumberSearch}
                onChange={(e) => {
                  setListNumberSearch(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="उदा. 578"
                className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-300 font-bold text-xs text-slate-800 focus:bg-white focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition"
              />
            </div>
          </div>

          {/* 2. Worker Name Search */}
          <div>
            <label className="text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1 block">
              2. Worker Name (कामगार नाव)
            </label>
            <input
              type="text"
              value={workerNameSearch}
              onChange={(e) => {
                setWorkerNameSearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="कामगाराचे नाव शोधा"
              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 font-medium text-xs text-slate-800 focus:bg-white focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition"
            />
          </div>

          {/* 3. MH Number Search */}
          <div>
            <label className="text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1 block">
              3. MH Number (MH क्रमांक)
            </label>
            <input
              type="text"
              value={mhNumberSearch}
              onChange={(e) => {
                setMhNumberSearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="उदा. MH14..."
              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 font-mono font-bold text-xs text-slate-800 focus:bg-white focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition"
            />
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
              <option value="All">सर्व तालुके (All)</option>
              {talukaOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          {/* 5. Verification Date Filter */}
          <div>
            <label className="text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1 block">
              5. Verification Date
            </label>
            <input
              type="date"
              value={verificationDateFilter}
              onChange={(e) => {
                setVerificationDateFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 font-medium text-xs text-slate-800 focus:bg-white focus:border-blue-600 transition cursor-pointer"
            />
          </div>

          {/* 6. Claim Status Filter */}
          <div>
            <label className="text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1 block">
              6. Status (स्थिती)
            </label>
            <select
              value={claimStatusFilter}
              onChange={(e) => {
                setClaimStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 font-bold text-xs text-slate-800 focus:bg-white focus:border-blue-600 transition cursor-pointer"
            >
              {statusOptions.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>

          {/* 7. FROM Filter (स्त्रोत) */}
          <div>
            <FromSourceFilterSelect
              value={fromSourceFilter}
              onChange={(val) => {
                setFromSourceFilter(val);
                setCurrentPage(1);
              }}
              label="7. FROM (स्त्रोत)"
              id="claim-list-from-source-filter"
            />
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* CONDITIONAL VIEW: DRILL-DOWN (LIST DETAILS) OR MAIN LISTS TABLE     */}
      {/* ==================================================================== */}

      {selectedGroup ? (
        /* ================================================================== */
        /* 4. LIST DETAILS SCREEN (13 EXACT COLUMNS)                          */
        /* ================================================================== */
        <div className="bg-white rounded-3xl border border-slate-200 shadow-md p-5 sm:p-7 space-y-6">
          {/* Header Banner for Selected List */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-5">
            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={() => {
                  setSelectedListNumber(null);
                  setCurrentPage(1);
                }}
                className="p-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer shrink-0 mt-1"
                title="सर्व याद्यांकडे परत जा (Back to All Lists)"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-slate-500 uppercase">
                    शासकीय यादी तपशील •
                  </span>
                  <span className="px-3 py-1 rounded-xl bg-blue-100 text-blue-900 font-black text-sm font-mono border border-blue-200">
                    यादी क्र: {selectedGroup.listNumber}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleOpenEditListModal(selectedGroup.listNumber, selectedGroup.listDate)}
                    className="text-xs text-slate-600 hover:text-blue-900 flex items-center gap-1 font-medium bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-xl border border-slate-200 transition cursor-pointer"
                    title="यादी तारीख बदला (Edit List Date)"
                  >
                    <Calendar className="w-3.5 h-3.5 text-slate-500" />
                    <span>{selectedGroup.listDate ? formatDate(selectedGroup.listDate) : 'तारीख जोडा (Set Date)'}</span>
                  </button>
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 mt-1">
                  यादी क्र. {selectedGroup.listNumber} मधील कामगार माहिती
                </h2>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  एकूण कामगार: <strong className="text-slate-800">{selectedGroup.totalWorkers}</strong> | एकूण शासकीय मदत: <strong className="text-emerald-700 font-mono">₹{selectedGroup.totalGovtAmount.toLocaleString('en-IN')}</strong> | प्रमुख तालुके: <strong className="text-slate-800">{selectedGroup.talukas.join(', ') || '-'}</strong>
                </p>
              </div>
            </div>

            {/* Actions for this list */}
            <div className="flex items-center gap-2 flex-wrap">
              {(() => {
                const selSummary = getListCommissionSummary(selectedGroup.listNumber, selectedGroup.claims);
                return (
                  <>
                    <button
                      type="button"
                      onClick={() => setDetailsCompleteListNumber(selectedGroup.listNumber)}
                      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition cursor-pointer border shadow-xs ${
                        selSummary.isMarkedComplete
                          ? 'bg-emerald-100 text-emerald-900 border-emerald-300 hover:bg-emerald-200'
                          : 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200'
                      }`}
                      title="कमिशन पेमेंट विवरण पहा"
                    >
                      {selSummary.isMarkedComplete ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                          <span>PAYMENT COMPLETE</span>
                        </>
                      ) : (
                        <>
                          <Clock className="w-3.5 h-3.5 text-amber-700" />
                          <span>PAYMENT PENDING</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleListPaymentCompleteClick(selectedGroup.listNumber, selectedGroup.claims)}
                      className={`px-3.5 py-2.5 rounded-xl font-bold text-xs shadow-sm transition flex items-center gap-1.5 cursor-pointer ${
                        selSummary.isMarkedComplete
                          ? 'bg-emerald-800 hover:bg-emerald-700 text-white'
                          : 'bg-indigo-700 hover:bg-indigo-600 text-white'
                      }`}
                      title="या यादीचे कमिशन पेमेंट तपासणी व पूर्ण मार्क करा"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>List Payment Complete</span>
                    </button>
                  </>
                );
              })()}

              <button
                type="button"
                onClick={() => setActiveCommissionListNumber(selectedGroup.listNumber)}
                className="px-4 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs shadow-sm transition flex items-center gap-2 cursor-pointer"
                title="ग्राहक कमिशन व्यवस्थापन उघडा"
              >
                <IndianRupee className="w-4 h-4 text-emerald-100" />
                <span>Customer Commission Management</span>
              </button>

              {/* Adhikari Commission Management - Only visible when Payment Status is PAYMENT COMPLETE */}
              {(() => {
                const selSummary = getListCommissionSummary(selectedGroup.listNumber, selectedGroup.claims);
                if (!selSummary.isMarkedComplete) return null;
                return (
                  <button
                    type="button"
                    onClick={() => setActiveAdhikariListNumber(selectedGroup.listNumber)}
                    className="px-4 py-2.5 rounded-xl bg-purple-700 hover:bg-purple-600 text-white font-bold text-xs shadow-sm transition flex items-center gap-2 cursor-pointer"
                    title="तालुका अधिकारी कमिशन व्यवस्थापन उघडा (Taluka-wise Total Entry)"
                  >
                    <Building2 className="w-4 h-4 text-purple-200" />
                    <span>Adhikari Commission Management</span>
                  </button>
                );
              })()}

              <button
                type="button"
                onClick={handleExportSelectedList}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-sm transition flex items-center gap-2 cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-100" />
                <span>ही यादी डाऊनलोड करा (.xlsx)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedListNumber(null);
                  setCurrentPage(1);
                }}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
              >
                बंद करा (Close)
              </button>
            </div>
          </div>

          {/* 13-Columns Table */}
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs font-bold text-slate-600">
              <span>
                दाखवत आहे: {selectedListFilteredClaims.length} पैकी {(currentPage - 1) * pageSize + 1}-
                {Math.min(currentPage * pageSize, selectedListFilteredClaims.length)} नोंदी
              </span>
              {hasActiveFilters && (
                <span className="text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                  फिल्टर्स लागू आहेत
                </span>
              )}
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-inner">
              <table className="w-full text-left text-xs border-collapse min-w-[1200px]">
                <thead>
                  <tr className="bg-slate-800 text-white font-bold text-[11px] uppercase tracking-wider">
                    <th className="py-3 px-3 w-12 text-center">१. अ.क्र.</th>
                    <th className="py-3 px-3">२. कामगाराचे नाव</th>
                    <th className="py-3 px-3">३. MH Number</th>
                    <th className="py-3 px-3">४. मोबाईल</th>
                    <th className="py-3 px-3">५. तालुका</th>
                    <th className="py-3 px-3">६. पडताळणी तारीख</th>
                    <th className="py-3 px-3">७. योजना १</th>
                    <th className="py-3 px-3 text-right">८. योजना १ रक्कम</th>
                    <th className="py-3 px-3">९. योजना २</th>
                    <th className="py-3 px-3 text-right">१०. योजना २ रक्कम</th>
                    <th className="py-3 px-3 text-right text-emerald-300">११. एकूण रक्कम</th>
                    <th className="py-3 px-3 text-center">१२. स्थिती</th>
                    <th className="py-3 px-3 text-center">१३. लिस्ट नंबर</th>
                    <th className="py-3 px-3">१४. FROM (स्त्रोत)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white font-medium">
                  {paginatedClaims.length === 0 ? (
                    <tr>
                      <td colSpan={14} className="py-12 text-center text-slate-400">
                        <FileText className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                        <p className="text-sm font-bold text-slate-600">
                          या यादीत फिल्टरशी जुळणारा कोणताही कामगार आढळला नाही.
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          कृपया वर दिलेले फिल्टर्स तपासा किंवा रीसेट करा.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    paginatedClaims.map((claim, idx) => {
                      const serialNo = (currentPage - 1) * pageSize + idx + 1;
                      const isApproved =
                        claim.status?.toLowerCase() === 'approved' ||
                        claim.status?.toLowerCase() === 'disbursed';
                      const fin = getClaimFinancials(claim);

                      return (
                        <tr
                          key={claim.id || `${claim.mhNumber}-${idx}`}
                          className="hover:bg-blue-50/50 transition"
                        >
                          {/* 1. Serial Number */}
                          <td className="py-3 px-3 text-center text-slate-400 font-mono font-bold">
                            {serialNo}
                          </td>

                          {/* 2. Worker Name */}
                          <td className="py-3 px-3 font-bold text-slate-900">
                            <div className="flex items-center gap-1.5">
                              <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-600 font-bold text-[10px] flex items-center justify-center shrink-0">
                                {claim.workerName?.charAt(0) || 'W'}
                              </span>
                              <span>{claim.workerName}</span>
                            </div>
                          </td>

                          {/* 3. MH Number */}
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1">
                              <span className="font-mono font-bold text-blue-900 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                                {claim.mhNumber}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleCopyMh(claim.mhNumber)}
                                className="p-1 text-slate-400 hover:text-blue-700 transition cursor-pointer"
                                title="कॉपी करा"
                              >
                                {copiedMh === claim.mhNumber ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            </div>
                          </td>

                          {/* 4. Mobile Number */}
                          <td className="py-3 px-3">
                            {claim.mobileNumber ? (
                              <a
                                href={`tel:${claim.mobileNumber}`}
                                className="font-mono text-slate-700 hover:text-blue-700 flex items-center gap-1"
                              >
                                <Phone className="w-3 h-3 text-slate-400" />
                                <span>{claim.mobileNumber}</span>
                              </a>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>

                          {/* 5. Taluka */}
                          <td className="py-3 px-3">
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold text-[11px] border border-slate-200">
                              {claim.taluka || '-'}
                            </span>
                          </td>

                          {/* 6. Verification Date */}
                          <td className="py-3 px-3 text-slate-600">
                            {claim.verificationDate ? formatDate(claim.verificationDate) : '-'}
                          </td>

                          {/* 7. Scheme 1 */}
                          <td className="py-3 px-3 font-medium text-slate-800">
                            <div>{claim.scheme1Name || '-'}</div>
                            {isApproved && (
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md inline-flex items-center gap-1 mt-0.5 ${
                                  fin.scheme1Status === 'Approved'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : fin.scheme1Status === 'Review Required'
                                    ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                    : 'bg-rose-50 text-rose-700 border border-rose-200'
                                }`}
                              >
                                {fin.scheme1Status === 'Approved'
                                  ? '● मंजूर'
                                  : fin.scheme1Status === 'Review Required'
                                  ? '● पडताळणी बाकी'
                                  : '● नामंजूर (₹0)'}
                              </span>
                            )}
                          </td>

                          {/* 8. Scheme 1 Amount */}
                          <td className="py-3 px-3 text-right font-mono text-slate-700 font-semibold">
                            ₹{Number(claim.scheme1Amount || 0).toLocaleString('en-IN')}
                          </td>

                          {/* 9. Scheme 2 */}
                          <td className="py-3 px-3 font-medium text-slate-600">
                            {claim.scheme2Name ? (
                              <div>
                                <div>{claim.scheme2Name}</div>
                                {isApproved && (
                                  <span
                                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md inline-flex items-center gap-1 mt-0.5 ${
                                      fin.scheme2Status === 'Approved'
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                        : fin.scheme2Status === 'Review Required'
                                        ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                                    }`}
                                  >
                                    {fin.scheme2Status === 'Approved'
                                      ? '● मंजूर'
                                      : fin.scheme2Status === 'Review Required'
                                      ? '● पडताळणी बाकी'
                                      : '● नामंजूर (₹0)'}
                                  </span>
                                )}
                              </div>
                            ) : (
                              '-'
                            )}
                          </td>

                          {/* 10. Scheme 2 Amount */}
                          <td className="py-3 px-3 text-right font-mono text-slate-600">
                            {claim.scheme2Amount ? `₹${Number(claim.scheme2Amount).toLocaleString('en-IN')}` : '-'}
                          </td>

                          {/* 11. Total Amount */}
                          <td className="py-3 px-3 text-right font-mono font-black text-emerald-700 text-sm whitespace-nowrap">
                            <div>
                              ₹{(isApproved ? fin.totalApprovedAmount : Number(claim.totalAmount || 0)).toLocaleString('en-IN')}
                            </div>
                            {isApproved && fin.totalApprovedAmount !== fin.totalClaimAmount && (
                              <div className="text-[10px] text-slate-400 font-normal line-through">
                                एकूण: ₹{fin.totalClaimAmount.toLocaleString('en-IN')}
                              </div>
                            )}
                          </td>

                          {/* 12. Claim Status */}
                          <td className="py-3 px-3 text-center">
                            <span
                              className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider inline-block ${
                                isApproved
                                  ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                  : claim.status?.toLowerCase() === 'rejected'
                                  ? 'bg-rose-100 text-rose-900 border border-rose-300'
                                  : 'bg-amber-100 text-amber-900 border border-amber-300'
                              }`}
                            >
                              {claim.status || 'Pending'}
                            </span>
                          </td>

                          {/* 13. List Number */}
                          <td className="py-3 px-3 text-center">
                            <span className="font-mono font-black text-xs px-2.5 py-1 rounded-lg bg-blue-50 text-blue-900 border border-blue-200 inline-block">
                              {claim.listNumber || 'Unassigned'}
                            </span>
                          </td>

                          {/* 14. FROM */}
                          <td className="py-3 px-3">
                            {claim.fromSource ? (
                              <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 font-semibold text-[11px] border border-purple-200 inline-block whitespace-nowrap">
                                {claim.fromSource}
                              </span>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
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
          </div>
        </div>
      ) : (
        /* ================================================================== */
        /* 3. LIST NUMBER TABLE & CARDS SCREEN                                */
        /* ================================================================== */
        <div className="space-y-6">
          {/* Main List Table */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 sm:p-6 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-900" />
                  <span>शासकीय लिस्ट नंबर यादी (Government List Directory)</span>
                </h2>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  कोणत्याही लिस्टवर क्लिक करून त्यातील सर्व कामगारांची संपूर्ण १३-कॉलम माहिती उघडा.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
                  एकूण {filteredListGroups.length} याद्या उपलब्ध
                </span>
                <button
                  type="button"
                  onClick={handleOpenCreateListModal}
                  className="px-3.5 py-1.5 rounded-xl bg-blue-900 hover:bg-blue-800 text-white font-bold text-xs shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                  title="नवीन शासकीय यादी तयार करा (Create New Government List)"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New List</span>
                </button>
              </div>
            </div>

            {filteredListGroups.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <Layers className="w-12 h-12 mx-auto text-slate-300 mb-2" />
                <p className="text-base font-bold text-slate-700">कोणतीही यादी सापडली नाही</p>
                <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                  {hasActiveFilters
                    ? 'आपण लावलेल्या फिल्टरशी जुळणारी कोणतीही यादी नाही. कृपया फिल्टर्स तपासा.'
                    : 'अद्याप कोणत्याही क्लेमला लिस्ट नंबर देण्यात आलेला नाही. Claim Approved करताना लिस्ट नंबर दिल्यास तो येथे आपोआप दिसेल.'}
                </p>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="mt-4 px-4 py-2 bg-blue-900 text-white rounded-xl text-xs font-bold cursor-pointer hover:bg-blue-800 transition"
                  >
                    सर्व फिल्टर काढा
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-700 font-bold text-[11px] uppercase border-b border-slate-200">
                      <th className="py-3.5 px-4 w-12 text-center">#</th>
                      <th className="py-3.5 px-4">List Number (यादी क्र.)</th>
                      <th className="py-3.5 px-4">List Date (तारीख)</th>
                      <th className="py-3.5 px-4 text-center">Total Workers (एकूण कामगार)</th>
                      <th className="py-3.5 px-4 text-right">Total Govt Amount (रक्कम)</th>
                      <th className="py-3.5 px-4">Taluka (तालुके)</th>
                      <th className="py-3.5 px-4">FROM (स्त्रोत)</th>
                      <th className="py-3.5 px-4 text-center">Claim Status (स्थिती)</th>
                      <th className="py-3.5 px-4 text-center">Payment Status (कमिशन स्थिती)</th>
                      <th className="py-3.5 px-4 text-center">Action (कृती)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {filteredListGroups.map((group, index) => {
                      const commSummary = getListCommissionSummary(group.listNumber, group.claims);

                      return (
                        <tr
                          key={group.listNumber}
                          onClick={() => {
                            setSelectedListNumber(group.listNumber);
                            setCurrentPage(1);
                          }}
                          className="hover:bg-blue-50/60 transition cursor-pointer group"
                        >
                          {/* Index */}
                          <td className="py-3.5 px-4 text-center text-slate-400 font-mono font-bold">
                            {index + 1}
                          </td>

                          {/* List Number */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2">
                              <span className="w-8 h-8 rounded-xl bg-blue-100 text-blue-950 font-black font-mono flex items-center justify-center border border-blue-200 group-hover:bg-blue-900 group-hover:text-white transition">
                                <FileText className="w-4 h-4" />
                              </span>
                              <div>
                                <span className="font-mono font-black text-sm text-blue-900 group-hover:text-blue-950">
                                  {group.listNumber}
                                </span>
                                <span className="text-[10px] text-slate-400 block font-medium">
                                  शासकीय यादी क्र.
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* List Date */}
                          <td
                            className="py-3.5 px-4 text-slate-600 font-medium"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleOpenEditListModal(group.listNumber, group.listDate);
                            }}
                            title="यादी तारीख बदलण्यासाठी क्लिक करा (Click to edit List Date)"
                          >
                            {group.listDate ? (
                              <span className="flex items-center gap-1 hover:text-blue-900">
                                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                {formatDate(group.listDate)}
                              </span>
                            ) : (
                              <span className="text-slate-400 hover:text-blue-700 cursor-pointer flex items-center gap-1">
                                <span>-</span>
                              </span>
                            )}
                          </td>

                          {/* Total Workers */}
                          <td className="py-3.5 px-4 text-center">
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-sky-50 text-sky-900 border border-sky-200 font-bold font-mono text-xs">
                              <Users className="w-3.5 h-3.5 text-sky-700" />
                              {group.totalWorkers} कामगार
                            </span>
                          </td>

                          {/* Total Govt Amount */}
                          <td className="py-3.5 px-4 text-right">
                            <span className="font-mono font-black text-sm text-emerald-800">
                              ₹{group.totalGovtAmount.toLocaleString('en-IN')}
                            </span>
                          </td>

                          {/* Taluka */}
                          <td className="py-3.5 px-4">
                            <div className="flex flex-wrap gap-1 max-w-xs">
                              {group.talukas.length > 0 ? (
                                group.talukas.map((t) => (
                                  <span
                                    key={t}
                                    className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-bold border border-slate-200"
                                  >
                                    {t}
                                  </span>
                                ))
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </div>
                          </td>

                          {/* FROM (स्त्रोत) */}
                          <td className="py-3.5 px-4">
                            {(() => {
                              const sources = Array.from(
                                new Set(group.claims.map((c) => (c.fromSource || '').trim()).filter(Boolean))
                              );
                              return sources.length > 0 ? (
                                <div className="flex flex-wrap gap-1 max-w-[140px]">
                                  {sources.map((s) => (
                                    <span
                                      key={s}
                                      className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 text-[10px] font-bold border border-purple-200"
                                    >
                                      {s}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-slate-400">-</span>
                              );
                            })()}
                          </td>

                          {/* Claim Status */}
                          <td className="py-3.5 px-4 text-center">
                            <span
                              className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider inline-block ${
                                group.approvedCount === group.totalWorkers
                                  ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                  : group.approvedCount > 0
                                  ? 'bg-blue-100 text-blue-900 border border-blue-300'
                                  : 'bg-amber-100 text-amber-900 border border-amber-300'
                              }`}
                            >
                              {group.statusSummary}
                            </span>
                          </td>

                          {/* Payment Status (Customer Commission Collection) */}
                          <td className="py-3.5 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                            {commSummary.isMarkedComplete ? (
                              <button
                                type="button"
                                onClick={() => setDetailsCompleteListNumber(group.listNumber)}
                                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border border-emerald-300 transition shadow-xs cursor-pointer"
                                title="PAYMENT COMPLETE - संपूर्ण कमिशन तपशील पाहण्यासाठी क्लिक करा"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                                <span>PAYMENT COMPLETE</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setDetailsCompleteListNumber(group.listNumber)}
                                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 transition shadow-xs cursor-pointer"
                                title="PAYMENT PENDING - संपूर्ण कमिशन तपशील पाहण्यासाठी क्लिक करा"
                              >
                                <Clock className="w-3.5 h-3.5 text-amber-700" />
                                <span>PAYMENT PENDING</span>
                              </button>
                            )}
                          </td>

                          {/* Action Buttons: View Details, Customer Commission Management, List Payment Complete */}
                          <td className="py-3.5 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5 flex-wrap">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedListNumber(group.listNumber);
                                  setCurrentPage(1);
                                }}
                                className="px-3 py-1.5 rounded-xl bg-blue-900 hover:bg-blue-800 text-white font-bold text-xs shadow-xs transition flex items-center gap-1 cursor-pointer"
                                title="यादीतील सर्व कामगार पहा"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>View Details</span>
                              </button>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenEditListModal(group.listNumber, group.listDate);
                                }}
                                className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs shadow-xs transition flex items-center gap-1 cursor-pointer"
                                title="यादी तारीख बदला (Edit List Date)"
                              >
                                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                                <span>Edit Date</span>
                              </button>

                              {/* Action Option 2 - Customer Commission Management */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveCommissionListNumber(group.listNumber);
                                }}
                                className="px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs shadow-xs transition flex items-center gap-1 cursor-pointer"
                                title="या यादीसाठी ग्राहक कमिशन व्यवस्थापन उघडा"
                              >
                                <IndianRupee className="w-3.5 h-3.5" />
                                <span>Customer Commission Management</span>
                              </button>

                              {/* Action Option 3 - Adhikari Commission Management (Hidden when Payment Pending, Visible ONLY when Payment Complete) */}
                              {commSummary.isMarkedComplete && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveAdhikariListNumber(group.listNumber);
                                  }}
                                  className="px-3 py-1.5 rounded-xl bg-purple-700 hover:bg-purple-600 text-white font-bold text-xs shadow-xs transition flex items-center gap-1 cursor-pointer"
                                  title="या यादीसाठी तालुका अधिकारी कमिशन व्यवस्थापन उघडा"
                                >
                                  <Building2 className="w-3.5 h-3.5" />
                                  <span>Adhikari Commission Management</span>
                                </button>
                              )}

                              {/* Action Option 3 - List Payment Complete */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleListPaymentCompleteClick(group.listNumber, group.claims);
                                }}
                                className={`px-3 py-1.5 rounded-xl font-bold text-xs shadow-xs transition flex items-center gap-1.5 cursor-pointer ${
                                  commSummary.isMarkedComplete
                                    ? 'bg-emerald-800 hover:bg-emerald-700 text-white border border-emerald-600'
                                    : 'bg-indigo-700 hover:bg-indigo-600 text-white'
                                }`}
                                title="List Payment Complete: कमिशन पेमेंट तपासणी व पूर्ण मार्क करा"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>List Payment Complete</span>
                              </button>

                              {/* Action Option 4 - Delete Government List */}
                              <button
                                type="button"
                                disabled={isCheckingDelete}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePromptDeleteList(group.listNumber, group.claims.length);
                                }}
                                className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs shadow-xs transition flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                title="शासकीय यादी डिलीट करा (Delete Government List)"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                                <span>Delete</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Unassigned Claims Notice (if any claims exist without a list number) */}
          {unassignedClaims.length > 0 && (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 border border-amber-300 text-amber-900 flex items-center justify-center shrink-0">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-black text-amber-950 uppercase tracking-wider">
                    लिस्ट नंबर वाटप प्रलंबित क्लेम्स (Pending List Allocation)
                  </h4>
                  <p className="text-xs text-amber-800 font-medium mt-0.5">
                    एकूण <strong className="font-bold">{unassignedClaims.length}</strong> क्लेम्स अद्याप कोणत्याही लिस्ट नंबरला जोडलेले नाहीत. Claim Entry किंवा Approval करताना लिस्ट नंबर टाकल्यास ते येथे आपोआप समाविष्ट होतील.
                  </p>
                </div>
              </div>
              <span className="text-xs font-mono font-bold text-amber-900 bg-amber-200/60 px-3 py-1.5 rounded-xl self-start sm:self-auto shrink-0">
                {unassignedClaims.length} क्लेम
              </span>
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 1: CONFIRMATION POPUP (LIST PAYMENT COMPLETE)                  */}
      {/* ==================================================================== */}
      {confirmCompleteList && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-5 animate-in fade-in duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5 text-emerald-700" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    List Payment Complete पुष्टी
                  </h3>
                  <p className="text-xs text-slate-500">
                    यादी क्र. {confirmCompleteList.listNumber}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConfirmCompleteList(null)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Prompt's Exact Required Marathi Confirmation Message */}
            <div className="p-4 rounded-2xl bg-emerald-50/80 border border-emerald-200 space-y-2">
              <p className="text-sm font-bold text-emerald-950 leading-relaxed">
                "या List मधील सर्व ग्राहकांचे Commission पूर्ण जमा झाले आहे. ही List Complete म्हणून Mark करायची आहे का?"
              </p>
            </div>

            {/* Balances Rollup */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] text-slate-500 font-bold block uppercase">एकूण ग्राहक</span>
                <span className="font-mono font-black text-slate-900 text-sm">{confirmCompleteList.totalWorkers} कामगार</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] text-slate-500 font-bold block uppercase">एकूण शासकीय मदत</span>
                <span className="font-mono font-black text-cyan-900 text-sm">₹{confirmCompleteList.totalSchemeAmount.toLocaleString('en-IN')}</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] text-slate-500 font-bold block uppercase">एकूण कमिशन</span>
                <span className="font-mono font-black text-blue-900 text-sm">₹{confirmCompleteList.totalCommission.toLocaleString('en-IN')}</span>
              </div>
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                <span className="text-[10px] text-emerald-700 font-bold block uppercase">जमा कमिशन (100%)</span>
                <span className="font-mono font-black text-emerald-800 text-sm">₹{confirmCompleteList.totalReceived.toLocaleString('en-IN')}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setConfirmCompleteList(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
              >
                Cancel (रद्द करा)
              </button>
              <button
                type="button"
                onClick={() => handleConfirmMarkComplete(confirmCompleteList.listNumber)}
                className="px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs shadow-md transition flex items-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirm – Mark as Complete</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 2: PENDING COMMISSION WARNING POPUP                             */}
      {/* ==================================================================== */}
      {pendingWarningList && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-4 animate-in fade-in duration-150 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-amber-700" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    कमिशन येणे बाकी आहे (Payment Pending)
                  </h3>
                  <p className="text-xs text-slate-500">
                    यादी क्र. {pendingWarningList.listNumber}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPendingWarningList(null)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-950 text-xs font-medium space-y-1">
              <p className="font-bold text-sm text-amber-900">
                ही List 'Complete' म्हणून Mark करता येणार नाही!
              </p>
              <p>
                नियम: सर्व ग्राहकांचे Commission Pending ₹0 असल्यासच ती List Complete Mark केली जाऊ शकते. या यादीमध्ये अद्याप <strong>{pendingWarningList.pendingWorkers.length}</strong> ग्राहकांचे एकूण <strong>₹{pendingWarningList.totalPending.toLocaleString('en-IN')}</strong> कमिशन येणे बाकी आहे किंवा ठरवणे शिल्लक आहे.
              </p>
            </div>

            {/* Summary Numbers */}
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-[10px] text-slate-400 block font-bold uppercase">ठरवलेले कमिशन</span>
                <span className="font-mono font-black text-slate-900">₹{pendingWarningList.totalCommission.toLocaleString('en-IN')}</span>
              </div>
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                <span className="text-[10px] text-emerald-700 block font-bold uppercase">जमा झालेले</span>
                <span className="font-mono font-black text-emerald-800">₹{pendingWarningList.totalReceived.toLocaleString('en-IN')}</span>
              </div>
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                <span className="text-[10px] text-amber-700 block font-bold uppercase">येणे बाकी</span>
                <span className="font-mono font-black text-amber-900">₹{pendingWarningList.totalPending.toLocaleString('en-IN')}</span>
              </div>
            </div>

            {/* Pending Workers Table */}
            <div className="space-y-2">
              <h4 className="text-xs font-black text-slate-700 uppercase tracking-wider">
                बाकी असलेले ग्राहक ({pendingWarningList.pendingWorkers.length}):
              </h4>
              <div className="overflow-x-auto rounded-2xl border border-slate-200 max-h-48 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 font-bold text-slate-700 text-[10px] uppercase">
                    <tr>
                      <th className="py-2 px-3">ग्राहकाचे नाव</th>
                      <th className="py-2 px-3">MH Number</th>
                      <th className="py-2 px-3 text-right">ठरवलेले कमिशन</th>
                      <th className="py-2 px-3 text-right">जमा</th>
                      <th className="py-2 px-3 text-right text-amber-800">बाकी</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium">
                    {pendingWarningList.pendingWorkers.map((pw, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-bold text-slate-900">{pw.name}</td>
                        <td className="py-2 px-3 font-mono text-slate-600">{pw.mh}</td>
                        <td className="py-2 px-3 text-right font-mono text-slate-700">₹{pw.total.toLocaleString('en-IN')}</td>
                        <td className="py-2 px-3 text-right font-mono text-emerald-700">₹{pw.received.toLocaleString('en-IN')}</td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-amber-700">
                          {pw.total === 0 && pw.received === 0 ? (
                            <span className="text-[10px] text-amber-700 italic">कमिशन ठरवणे बाकी</span>
                          ) : (
                            `₹${pw.pending.toLocaleString('en-IN')}`
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setPendingWarningList(null)}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
              >
                बंद करा (Close)
              </button>
              <button
                type="button"
                onClick={() => {
                  const lNum = pendingWarningList.listNumber;
                  setPendingWarningList(null);
                  setActiveCommissionListNumber(lNum);
                }}
                className="px-5 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs shadow-md transition flex items-center gap-1.5 cursor-pointer"
              >
                <IndianRupee className="w-4 h-4" />
                <span>कमिशन जमा करा (Open Commission Mgmt)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL 3: COMPLETED LIST DETAILS MODAL (ALL FIELDS AS SPECIFIED)       */}
      {/* ==================================================================== */}
      {detailsCompleteListNumber && (() => {
        const grp = listGroups.find((g) => g.listNumber === detailsCompleteListNumber);
        if (!grp) return null;
        const summary = getListCommissionSummary(grp.listNumber, grp.claims);

        return (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-5xl w-full p-6 sm:p-7 space-y-5 animate-in fade-in duration-150 max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-center">
                    <ShieldCheck className="w-6 h-6 text-emerald-700" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg font-black text-slate-900">
                        यादी क्र. {grp.listNumber} - संपूर्ण पेमेंट व कमिशन विवरण
                      </h3>
                      {summary.isMarkedComplete ? (
                        <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-900 border border-emerald-300 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                          PAYMENT COMPLETE
                        </span>
                      ) : (
                        <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-amber-700" />
                          PAYMENT PENDING
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                      शासकीय योजना मदत रक्कम, मॅन्युअल कमिशन नोंद, जमा खाते (Receiving Account) आणि वसुली इतिहास तपशील.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleExportCompletedListDetails(grp.listNumber, summary)}
                    className="px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-100" />
                    <span>एक्सेल डाऊनलोड (.xlsx)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDetailsCompleteListNumber(null)}
                    className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* 6 Summary Metric Cards as specified in Rule 5 */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-center text-xs">
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">1. Total Customers</span>
                  <span className="font-mono font-black text-slate-900 text-lg block mt-0.5">{summary.totalWorkers}</span>
                  <span className="text-[10px] text-slate-400">एकूण ग्राहक</span>
                </div>
                <div className="p-3.5 rounded-2xl bg-cyan-50 border border-cyan-200">
                  <span className="text-[10px] text-cyan-800 font-bold uppercase block">2. Total Scheme Amt</span>
                  <span className="font-mono font-black text-cyan-950 text-lg block mt-0.5">₹{summary.totalSchemeAmount.toLocaleString('en-IN')}</span>
                  <span className="text-[10px] text-cyan-700">शासकीय मदत</span>
                </div>
                <div className="p-3.5 rounded-2xl bg-blue-50 border border-blue-200">
                  <span className="text-[10px] text-blue-800 font-bold uppercase block">3. Total Commission</span>
                  <span className="font-mono font-black text-blue-950 text-lg block mt-0.5">₹{summary.totalCommission.toLocaleString('en-IN')}</span>
                  <span className="text-[10px] text-blue-700">ठरवलेले कमिशन</span>
                </div>
                <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200">
                  <span className="text-[10px] text-emerald-800 font-bold uppercase block">4. Comm Received</span>
                  <span className="font-mono font-black text-emerald-950 text-lg block mt-0.5">₹{summary.totalReceived.toLocaleString('en-IN')}</span>
                  <span className="text-[10px] text-emerald-700">एकूण जमा</span>
                </div>
                <div className={`p-3.5 rounded-2xl border ${summary.totalPending === 0 ? 'bg-slate-50 border-slate-200 text-slate-800' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
                  <span className="text-[10px] font-bold uppercase block opacity-70">5. Comm Pending</span>
                  <span className="font-mono font-black text-lg block mt-0.5">₹{summary.totalPending.toLocaleString('en-IN')}</span>
                  <span className="text-[10px] opacity-70">{summary.totalPending === 0 ? 'शिल्लक नाही (Nil)' : 'येणे बाकी'}</span>
                </div>
                <div className="p-3.5 rounded-2xl bg-indigo-50 border border-indigo-200">
                  <span className="text-[10px] text-indigo-800 font-bold uppercase block">6. Status</span>
                  <span className="font-black text-xs block mt-1">
                    {summary.isMarkedComplete ? 'PAYMENT COMPLETE' : 'PAYMENT PENDING'}
                  </span>
                  <span className="text-[10px] text-indigo-700">पेमेंट स्थिती</span>
                </div>
              </div>

              {/* Full Customer Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                    प्रत्येक ग्राहकाचा तपशील (Customer Details with Receiving Account & History):
                  </h4>
                  <span className="text-xs text-slate-500 font-medium">
                    {summary.customerDetails.length} नोंदी
                  </span>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-inner max-h-80 overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse min-w-[950px]">
                    <thead className="bg-slate-800 text-white font-bold text-[10px] uppercase tracking-wider sticky top-0 z-10">
                      <tr>
                        <th className="py-2.5 px-3 text-center">#</th>
                        <th className="py-2.5 px-3">ग्राहकाचे नाव (Customer Name)</th>
                        <th className="py-2.5 px-3">MH Number</th>
                        <th className="py-2.5 px-3">योजना १ व रक्कम</th>
                        <th className="py-2.5 px-3">योजना २ व रक्कम</th>
                        <th className="py-2.5 px-3 text-right">Total Scheme Amt</th>
                        <th className="py-2.5 px-3 text-right">Total Comm</th>
                        <th className="py-2.5 px-3 text-right text-emerald-300">Comm Received</th>
                        <th className="py-2.5 px-3 text-right text-amber-300">Comm Pending</th>
                        <th className="py-2.5 px-3">Receiving Account (जमा खाते)</th>
                        <th className="py-2.5 px-3 text-center">Collection History</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white font-medium">
                      {summary.customerDetails.map((cd, cIdx) => (
                        <tr key={cIdx} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 text-center text-slate-400 font-mono font-bold">{cIdx + 1}</td>
                          <td className="py-2.5 px-3 font-bold text-slate-900">{cd.customerName}</td>
                          <td className="py-2.5 px-3 font-mono font-bold text-blue-900">{cd.mhNumber}</td>
                          <td className="py-2.5 px-3 text-slate-700">
                            <div>{cd.scheme1Name} (₹{cd.scheme1Amount.toLocaleString('en-IN')})</div>
                            <span className={`text-[10px] font-bold ${cd.scheme1Status === 'Approved' ? 'text-emerald-700' : cd.scheme1Status === 'Review Required' ? 'text-amber-700' : 'text-rose-700'}`}>
                              ● {cd.scheme1Status}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-600">
                            {cd.scheme2Amount > 0 ? (
                              <div>
                                <div>{cd.scheme2Name} (₹{cd.scheme2Amount.toLocaleString('en-IN')})</div>
                                <span className={`text-[10px] font-bold ${cd.scheme2Status === 'Approved' ? 'text-emerald-700' : cd.scheme2Status === 'Review Required' ? 'text-amber-700' : 'text-rose-700'}`}>
                                  ● {cd.scheme2Status}
                                </span>
                              </div>
                            ) : '-'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-cyan-900">
                            <div>₹{cd.totalSchemeAmount.toLocaleString('en-IN')}</div>
                            {cd.totalSchemeAmount !== cd.totalClaimAmount && (
                              <div className="text-[10px] text-slate-400 font-normal line-through">
                                ₹{cd.totalClaimAmount.toLocaleString('en-IN')}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                            ₹{cd.totalCommission.toLocaleString('en-IN')}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700">
                            ₹{cd.commissionReceived.toLocaleString('en-IN')}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-black text-amber-700">
                            ₹{cd.commissionPending.toLocaleString('en-IN')}
                          </td>
                          <td className="py-2.5 px-3 text-slate-800 font-medium">
                            {cd.receivingAccounts}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {cd.collections.length > 0 ? (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-bold">
                                {cd.collections.length} हप्ते जमा
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[10px]">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Footer Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const lNum = grp.listNumber;
                      setDetailsCompleteListNumber(null);
                      setActiveCommissionListNumber(lNum);
                    }}
                    className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <IndianRupee className="w-4 h-4" />
                    <span>Customer Commission Management उघडा</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setDetailsCompleteListNumber(null)}
                  className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
                >
                  बंद करा (Close)
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ==================================================================== */}
      {/* TALUKA-WISE APPROVED CLAIMS MODAL POPUP                              */}
      {/* ==================================================================== */}
      {selectedTalukaApprovedModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-5xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden my-auto">
            {/* Modal Header */}
            <div className="p-4 sm:p-6 bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 text-white flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center shrink-0">
                    <MapPin className="w-5 h-5 text-purple-300" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-black tracking-tight flex items-center gap-2">
                      <span>{selectedTalukaApprovedModal === 'ALL' ? 'सर्व तालुके' : `${selectedTalukaApprovedModal} तालुका`}</span>
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-500/30 text-purple-200 border border-purple-400/30">
                        मंजूर क्लेम्स (Approved Claims)
                      </span>
                    </h3>
                    <p className="text-[11px] text-purple-200/80 mt-0.5">
                      शासकीय यादीमध्ये समाविष्ट असलेल्या मंजूर व वितरित क्लेम्सची सविस्तर यादी
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedTalukaApprovedModal(null)}
                  className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white flex items-center justify-center transition cursor-pointer shrink-0"
                  title="बंद करा (Close)"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Taluka Switcher Tabs */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1 no-scrollbar">
                {(['ALL', 'Junnar', 'Ambegaon', 'Khed', 'Shirur'] as const).map((t) => {
                  const isActive = selectedTalukaApprovedModal === t;
                  const count =
                    t === 'ALL'
                      ? overallMetrics.totalApproved
                      : overallMetrics.talukaApprovedMap[t]?.length || 0;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => {
                        setSelectedTalukaApprovedModal(t);
                        setTalukaModalSearch('');
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                        isActive
                          ? 'bg-white text-purple-950 shadow-sm'
                          : 'bg-white/10 text-purple-200 hover:bg-white/20'
                      }`}
                    >
                      <span>{t === 'ALL' ? 'सर्व तालुके' : t}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono ${
                          isActive
                            ? 'bg-purple-100 text-purple-900 font-black'
                            : 'bg-black/20 text-white'
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Quick Stats Ribbon & Search Bar */}
            <div className="p-4 sm:p-5 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 shadow-2xs">
                  एकूण मंजूर क्लेम्स:{' '}
                  <span className="text-emerald-700 font-black font-mono ml-1">
                    {modalApprovedClaims.length}
                  </span>
                </div>
                <div className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700 shadow-2xs">
                  एकूण रक्कम:{' '}
                  <span className="text-amber-700 font-black font-mono ml-1">
                    ₹{modalApprovedTotalAmount.toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1 sm:w-72">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={talukaModalSearch}
                    onChange={(e) => setTalukaModalSearch(e.target.value)}
                    placeholder="नाव, MH नंबर, यादी क्र. किंवा योजना..."
                    className="w-full pl-9 pr-8 py-2 rounded-xl bg-white border border-slate-200 text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500 transition"
                  />
                  {talukaModalSearch && (
                    <button
                      type="button"
                      onClick={() => setTalukaModalSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleExportTalukaExcel}
                  className="px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs shadow-xs transition flex items-center gap-1.5 cursor-pointer shrink-0"
                  title="या क्लेम्सची एक्सेल फाइल डाऊनलोड करा"
                >
                  <Download className="w-4 h-4" />
                  <span className="hidden sm:inline">Excel डाऊनलोड</span>
                </button>
              </div>
            </div>

            {/* Scrollable Table Area */}
            <div className="flex-1 overflow-auto p-4 sm:p-5 max-h-[55vh]">
              {modalApprovedClaims.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-slate-500 space-y-2">
                  <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-400">
                    <MapPin className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-bold text-slate-700">
                    कोणतेही मंजूर क्लेम आढळले नाहीत
                  </p>
                  <p className="text-xs text-slate-400">
                    {talukaModalSearch
                      ? 'दिलेल्या शोधानुसार कोणताही रेकॉर्ड सापडला नाही.'
                      : 'या तालुक्यामध्ये अद्याप कोणतेही मंजूर (Approved) क्लेम्स नाहीत.'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-2xs">
                  <table className="w-full text-left text-xs border-collapse bg-white">
                    <thead className="bg-slate-100/80 text-slate-600 font-bold border-b border-slate-200 uppercase text-[10px] tracking-wider sticky top-0 z-10 backdrop-blur-xs">
                      <tr>
                        <th className="py-2.5 px-3 text-center w-12">अ.क्र.</th>
                        <th className="py-2.5 px-3">कामगाराचे नाव (Customer Name)</th>
                        <th className="py-2.5 px-3 font-mono">MH नंबर</th>
                        <th className="py-2.5 px-3">तालुका</th>
                        <th className="py-2.5 px-3">यादी क्रमांक</th>
                        <th className="py-2.5 px-3">पडताळणी तारीख</th>
                        <th className="py-2.5 px-3">योजना १ व रक्कम</th>
                        <th className="py-2.5 px-3">योजना २ व रक्कम</th>
                        <th className="py-2.5 px-3 text-right">एकूण रक्कम</th>
                        <th className="py-2.5 px-3">FROM</th>
                        <th className="py-2.5 px-3 text-center">स्थिती</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {modalApprovedClaims.map((claim, idx) => {
                        const s1 = Number(claim.scheme1Amount || 0);
                        const s2 = Number(claim.scheme2Amount || 0);
                        const tot = (s1 + s2 > 0) ? (s1 + s2) : Number(claim.totalAmount || 0);
                        return (
                          <tr key={claim.id || `${claim.mhNumber}-${idx}`} className="hover:bg-purple-50/40 transition">
                            <td className="py-2.5 px-3 text-center font-bold text-slate-400">
                              {idx + 1}
                            </td>
                            <td className="py-2.5 px-3 font-bold text-slate-900">
                              {claim.workerName}
                            </td>
                            <td className="py-2.5 px-3 font-mono font-bold text-blue-900">
                              {claim.mhNumber}
                            </td>
                            <td className="py-2.5 px-3">
                              <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-800 border border-purple-200/80 font-bold text-[11px]">
                                {claim.taluka || '-'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 font-mono font-black text-slate-800">
                              {claim.listNumber ? `यादी #${claim.listNumber}` : '-'}
                            </td>
                            <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">
                              {formatDate(claim.verificationDate || claim.claimDate) || '-'}
                            </td>
                            <td className="py-2.5 px-3">
                              <div className="font-semibold text-slate-800 text-[11px]">{claim.scheme1Name || '-'}</div>
                              {s1 > 0 && (
                                <div className="text-[10px] font-mono text-emerald-700 font-bold">₹{s1.toLocaleString('en-IN')}</div>
                              )}
                            </td>
                            <td className="py-2.5 px-3">
                              {claim.scheme2Name ? (
                                <>
                                  <div className="font-semibold text-slate-800 text-[11px]">{claim.scheme2Name}</div>
                                  {s2 > 0 && (
                                    <div className="text-[10px] font-mono text-emerald-700 font-bold">₹{s2.toLocaleString('en-IN')}</div>
                                  )}
                                </>
                              ) : (
                                <span className="text-slate-400 text-[10px]">-</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-black font-mono text-emerald-800">
                              ₹{tot.toLocaleString('en-IN')}
                            </td>
                            <td className="py-2.5 px-3">
                              {claim.fromSource ? (
                                <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-800 border border-indigo-200/80 font-bold text-[10px]">
                                  {claim.fromSource}
                                </span>
                              ) : (
                                <span className="text-slate-400 text-[10px]">-</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-bold">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                {claim.status || 'Approved'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs text-slate-500 font-medium">
                एकूण <strong className="text-slate-800">{modalApprovedClaims.length}</strong> मंजूर क्लेम्स दाखवत आहे.
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const talukaToFilter = selectedTalukaApprovedModal === 'ALL' ? 'All' : selectedTalukaApprovedModal;
                    setTalukaFilter(talukaToFilter);
                    setClaimStatusFilter('Approved');
                    setSelectedTalukaApprovedModal(null);
                    toast.show({
                      type: 'info',
                      message: `${talukaToFilter === 'All' ? 'सर्व' : talukaToFilter} तालुक्याचे मंजूर क्लेम्स मुख्य टेबलमध्ये फिल्टर केले.`,
                    });
                  }}
                  className="px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-600 text-white font-bold text-xs shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Filter className="w-3.5 h-3.5" />
                  <span>मुख्य टेबलमध्ये फिल्टर करा</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedTalukaApprovedModal(null)}
                  className="px-5 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs transition cursor-pointer"
                >
                  बंद करा (Close)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CREATE NEW GOVERNMENT LIST */}
      {createListModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4 animate-in fade-in duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-200 text-blue-900 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-blue-900" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    नवीन शासकीय यादी (New Government List)
                  </h3>
                  <p className="text-xs text-slate-500">
                    शासकीय यादी क्रमांक आणि यादी तारीख नोंदवा
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCreateListModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {listModalError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{listModalError}</span>
              </div>
            )}

            <form onSubmit={handleSaveNewList} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  शासकीय यादी क्रमांक (Government List Number) *
                </label>
                <input
                  type="text"
                  placeholder="उदा. 601 किंवा 602"
                  value={newListNumberInput}
                  onChange={(e) => setNewListNumberInput(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  यादी तारीख (List Date)
                </label>
                <input
                  type="date"
                  value={newListDateInput}
                  onChange={(e) => setNewListDateInput(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white cursor-pointer"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  तारीख मॅन्युअली निवडा (Manual date selection). आजची तारीख आपोआप भरली जात नाही.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCreateListModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
                >
                  रद्द करा (Cancel)
                </button>
                <button
                  type="submit"
                  disabled={isSavingList}
                  className="px-4 py-2 rounded-xl bg-blue-900 hover:bg-blue-800 text-white font-bold text-xs shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSavingList ? 'जतन होत आहे...' : 'जतन करा (Save List)'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT GOVERNMENT LIST DATE */}
      {editListModalOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4 animate-in fade-in duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-amber-700" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    यादी तारीख बदला (Edit List Date)
                  </h3>
                  <p className="text-xs text-slate-500 font-mono font-bold">
                    यादी क्र. {editingListNumber}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditListModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {listModalError && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{listModalError}</span>
              </div>
            )}

            <form onSubmit={handleSaveEditList} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-500 font-bold mb-1">
                  शासकीय यादी क्रमांक (Government List Number)
                </label>
                <input
                  type="text"
                  value={editingListNumber}
                  disabled
                  className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-600 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-bold mb-1">
                  यादी तारीख (List Date)
                </label>
                <input
                  type="date"
                  value={editListDateInput}
                  onChange={(e) => setEditListDateInput(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:border-blue-600 focus:bg-white cursor-pointer"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  सध्याची जतन केलेली तारीख दाखवली आहे. तारीख बदला किंवा नवीन तारीख निवडा.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditListModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
                >
                  रद्द करा (Cancel)
                </button>
                <button
                  type="submit"
                  disabled={isSavingList}
                  className="px-4 py-2 rounded-xl bg-blue-900 hover:bg-blue-800 text-white font-bold text-xs shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSavingList ? 'जतन होत आहे...' : 'जतन करा (Save Changes)'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRM DELETE GOVERNMENT LIST */}
      {deleteTargetList && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4 animate-in fade-in duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 flex items-center justify-center">
                  <Trash2 className="w-5 h-5 text-rose-600" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    शासकीय यादी डिलीट करा (Delete Government List)
                  </h3>
                  <p className="text-xs text-slate-500 font-mono font-bold">
                    यादी क्र. #{deleteTargetList.listNumber}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDeleteTargetList(null)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-700">
              <p className="text-sm font-bold text-slate-900">
                Are you sure you want to delete this Government List?
              </p>
              <p className="text-slate-600 leading-relaxed">
                तुम्हाला खात्री आहे का की तुम्ही शासकीय यादी क्र. <span className="font-mono font-black text-slate-900">#{deleteTargetList.listNumber}</span> डेटाबेसमधून डिलीट करू इच्छिता?
              </p>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-[11px] font-medium leading-relaxed">
                ही क्रिया पूर्ववत करता येणार नाही. जर Cancel केले तर कोणतीही नोंद बदलली जाणार नाही.
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                disabled={isDeletingList}
                onClick={() => setDeleteTargetList(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingList}
                onClick={handleConfirmDeleteList}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeletingList ? 'डिलीट होत आहे...' : 'Confirm Delete'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: BLOCKED DELETION EXPLANATION (PREVENT ORPHANED RECORDS) */}
      {deleteBlockedInfo && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-4 animate-in fade-in duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    यादी डिलीट करता येत नाही (Cannot Delete List)
                  </h3>
                  <p className="text-xs text-slate-500 font-mono font-bold">
                    यादी क्र. #{deleteBlockedInfo.listNumber}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDeleteBlockedInfo(null)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-rose-900">
                <p className="font-bold text-sm mb-1">सुरक्षा सूचना (Safety Protection Active)</p>
                <p className="leading-relaxed">{deleteBlockedInfo.reason}</p>
              </div>

              {deleteBlockedInfo.linkedDetails && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-2">
                  <p className="font-bold text-slate-700">संबंधित नोंदी तपशील (Linked Records Summary):</p>
                  <ul className="list-disc list-inside space-y-1 text-slate-600">
                    {Boolean(deleteBlockedInfo.linkedDetails.linkedClaimsCount) && (
                      <li>नोंदणीकृत क्लेम्स (Linked Claims): <strong className="text-slate-900">{deleteBlockedInfo.linkedDetails.linkedClaimsCount}</strong></li>
                    )}
                    {Boolean(deleteBlockedInfo.linkedDetails.paymentWorkersCount) && (
                      <li>पेमेंट कामगार (Payment Workers): <strong className="text-slate-900">{deleteBlockedInfo.linkedDetails.paymentWorkersCount}</strong></li>
                    )}
                    {Boolean(deleteBlockedInfo.linkedDetails.collectionsCount) && (
                      <li>ग्राहक कमिशन पावत्या (Customer Collections): <strong className="text-slate-900">{deleteBlockedInfo.linkedDetails.collectionsCount}</strong></li>
                    )}
                    {Boolean(deleteBlockedInfo.linkedDetails.officerCommissionsCount) && (
                      <li>अधिकारी कमिशन (Officer Commissions): <strong className="text-slate-900">{deleteBlockedInfo.linkedDetails.officerCommissionsCount}</strong></li>
                    )}
                    {Boolean(deleteBlockedInfo.linkedDetails.expensesCount) && (
                      <li>यादी खर्च नोंदी (Expenses): <strong className="text-slate-900">{deleteBlockedInfo.linkedDetails.expensesCount}</strong></li>
                    )}
                  </ul>
                </div>
              )}

              <p className="text-slate-500 text-[11px] leading-relaxed">
                टीप: पेमेंट किंवा कमिशन नोंदी अनाथ (orphaned) होण्यापासून रोखण्यासाठी ही सुरक्षा तपासणी आवश्यक आहे.
              </p>
            </div>

            <div className="flex items-center justify-end pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteBlockedInfo(null)}
                className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition cursor-pointer"
              >
                समजले (Close)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
