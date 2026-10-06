import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  FileSpreadsheet,
  Upload,
  CheckCircle2,
  Phone,
  MessageCircle,
  ExternalLink,
  Copy,
  Check,
  Search,
  Filter,
  RefreshCw,
  AlertCircle,
  XCircle,
  SkipForward,
  Download,
  Calendar,
  User as UserIcon,
  Clock,
  Trash2,
  ChevronDown,
  Info,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  HelpCircle,
  FileCheck,
  History,
  AlertTriangle,
  UserCheck,
  Users,
  Settings,
  ChevronRight,
  Eye,
  Send,
  Loader2,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  User as UserType,
  RenewalCheckBatch,
  RenewalCheckQueueItem,
  RenewalCheckBatchStats,
  RenewalVerificationStatus,
  RenewalCheckPreviewSummary,
  RenewalCheckPreviewItem,
  RenewalCheckWorkerHistory,
  RenewalCheckAuditRecord,
  WorkerRenewal,
} from '../types';
import { VERIFICATION_TALUKAS } from '../data/mockData';
import { TableSlideControls } from './TableSlideControls';
import { ClassicSlideSwitch } from './ClassicSlideSwitch';

interface RenewalVerificationModuleProps {
  currentUser: UserType | null;
  users?: UserType[];
  onRefreshRenewals?: () => void;
}

export const RenewalVerificationModule: React.FC<RenewalVerificationModuleProps> = ({
  currentUser,
  users = [],
  onRefreshRenewals,
}) => {
  // Batches & Selection
  const [batches, setBatches] = useState<RenewalCheckBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [isLoadingBatches, setIsLoadingBatches] = useState<boolean>(true);

  // Current Batch Data
  const [currentBatch, setCurrentBatch] = useState<RenewalCheckBatch | null>(null);
  const [stats, setStats] = useState<RenewalCheckBatchStats>({
    total: 0,
    pending: 0,
    renewed: 0,
    alreadyRenewed: 0,
    callPending: 0,
    rejected: 0,
    skipped: 0,
    completionPercentage: 0,
  });
  const [queueItems, setQueueItems] = useState<RenewalCheckQueueItem[]>([]);
  const [isLoadingQueue, setIsLoadingQueue] = useState<boolean>(false);

  // Filters & Search
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [operatorFilter, setOperatorFilter] = useState<string>('ALL');
  const [dateFilter, setDateFilter] = useState<string>('');

  // Double-Click Protection / Action Loading State (Rule I)
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // =========================================================================
  // 1. IMPORT & PREVIEW MODAL STATE (Rule B, L, M, K)
  // =========================================================================
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [importStep, setImportStep] = useState<'SELECT_FILE' | 'PREVIEW' | 'SAVING'>('SELECT_FILE');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isGeneratingPreview, setIsGeneratingPreview] = useState<boolean>(false);
  const [previewSummary, setPreviewSummary] = useState<RenewalCheckPreviewSummary | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [assignedOperatorForImport, setAssignedOperatorForImport] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queueTableContainerRef = useRef<HTMLDivElement>(null);

  // =========================================================================
  // 2. CUSTOMER PROCESSING & RENEWAL HISTORY MODAL STATE (Rule C, D, E, F)
  // =========================================================================
  const [activeQueueItem, setActiveQueueItem] = useState<RenewalCheckQueueItem | null>(null);
  const [workerHistory, setWorkerHistory] = useState<RenewalCheckWorkerHistory | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState<boolean>(false);
  const [processingSuccessInfo, setProcessingSuccessInfo] = useState<{
    message: string;
    nextPendingItemId?: number;
    duplicateWarning?: string;
  } | null>(null);

  // Form Fields inside Customer Processing Modal
  const [formRenewalFee, setFormRenewalFee] = useState<string>('');
  const [formRenewalYear, setFormRenewalYear] = useState<string>('');
  const [formReceiptNumber, setFormReceiptNumber] = useState<string>('');
  const [formTaluka, setFormTaluka] = useState<string>('');
  const [formVerificationDate, setFormVerificationDate] = useState<string>('');
  const [formNotes, setFormNotes] = useState<string>('');

  // Taluka options dropdown (using software's existing verification talukas)
  const talukaDropdownOptions = useMemo(() => {
    const list = [...VERIFICATION_TALUKAS];
    if (formTaluka && !list.includes(formTaluka)) {
      list.unshift(formTaluka);
    }
    return list;
  }, [formTaluka]);

  // =========================================================================
  // 3. AUDIT TRAIL MODAL (Rule T)
  // =========================================================================
  const [isAuditModalOpen, setIsAuditModalOpen] = useState<boolean>(false);
  const [auditLogs, setAuditLogs] = useState<RenewalCheckAuditRecord[]>([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState<boolean>(false);

  // =========================================================================
  // 4. WHATSAPP CONFIGURABLE TEMPLATE MODAL (Rule Q)
  // =========================================================================
  const [isWhatsAppConfigOpen, setIsWhatsAppConfigOpen] = useState<boolean>(false);
  const [whatsAppTemplate, setWhatsAppTemplate] = useState<string>(
    () =>
      localStorage.getItem('om_eseva_renewal_wa_template') ||
      `नमस्कार {workerName} जी,\n\n*ओम डिजिटल ई-सेवा केंद्राकडून महत्त्वाची सूचना:*\nआपले महाराष्ट्र इमारत व इतर बांधकाम कामगार कल्याणकारी मंडळ (BOCW) नोंदणी पुस्तक / नूतनीकरण (MH No: *{mhNumber}*) संपलेले किंवा इनॲक्टिव्ह दिसत आहे.\n\nशासनाचे पुढील आर्थिक लाभ, भांडी-पेटी संच, शैक्षणिक शिष्यवृत्ती व वैद्यकीय योजना अखंडित चालू ठेवण्यासाठी त्वरित आपले नूतनीकरण करून घ्यावे.\n\n📍 *ओम डिजिटल ई-सेवा केंद्र*\n📞 अधिक माहितीसाठी त्वरित कार्यालयाशी संपर्क साधा.`
  );

  // =========================================================================
  // 5. DELETE & BULK SELECTION STATES
  // =========================================================================
  const [selectedItemIds, setSelectedItemIds] = useState<Set<number>>(new Set());
  const [itemToDelete, setItemToDelete] = useState<RenewalCheckQueueItem | null>(null);
  const [isBulkDeleteModalOpen, setIsBulkDeleteModalOpen] = useState<boolean>(false);
  const [isBatchDeleteModalOpen, setIsBatchDeleteModalOpen] = useState<boolean>(false);
  const [batchToDelete, setBatchToDelete] = useState<RenewalCheckBatch | null>(null);
  const [isBatchManageModalOpen, setIsBatchManageModalOpen] = useState<boolean>(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState<boolean>(false);
  const [targetOperatorId, setTargetOperatorId] = useState<string>('');

  // UI Toast State
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  // Helper for auth headers (Rule V)
  const getAuthHeaders = (): Record<string, string> => {
    const token =
      localStorage.getItem('om_eseva_token') ||
      sessionStorage.getItem('om_eseva_token') ||
      localStorage.getItem('auth_token') ||
      sessionStorage.getItem('auth_token');

    const headers: Record<string, string> = {
      'x-user-id': currentUser?.id || 'usr-admin-1',
      'x-user-name': currentUser?.name || 'Staff Operator',
      'x-user-username': currentUser?.username || 'admin',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  };

  const safeFetchJson = async (res: Response) => {
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return await res.json();
    }
    const text = await res.text();
    if (text.includes('<!DOCTYPE') || text.includes('<!doctype') || text.includes('<html')) {
      if (res.status === 401) {
        throw new Error('अनधिकृत प्रवेश: कृपया पुन्हा लॉगिन करा (Session expired, please login again).');
      }
      if (res.status === 404) {
        throw new Error('API मार्ग सापडला नाही (Endpoint not found).');
      }
      throw new Error('सर्व्हरकडून अवैध प्रतिसाद आला (Server returned non-JSON).');
    }
    throw new Error(text || 'सर्व्हरकडून त्रुटी आली.');
  };

  // 1. Fetch batches list
  const loadBatches = async (preferBatchId?: string) => {
    setIsLoadingBatches(true);
    try {
      const res = await fetch('/api/renewal-check/batches', {
        headers: getAuthHeaders(),
      });
      const data = await safeFetchJson(res);
      if (data.success && Array.isArray(data.batches)) {
        setBatches(data.batches);
        if (preferBatchId) {
          setSelectedBatchId(preferBatchId);
        } else if (data.batches.length > 0 && !selectedBatchId) {
          setSelectedBatchId(data.batches[0].batchId);
        }
      }
    } catch (err) {
      console.error('Failed to load renewal check batches:', err);
    } finally {
      setIsLoadingBatches(false);
    }
  };

  // 2. Fetch queue items for selected batch
  const loadBatchDetails = async (
    batchId: string,
    status = filterStatus,
    search = searchQuery,
    opFilter = operatorFilter,
    date = dateFilter
  ) => {
    setIsLoadingQueue(true);
    try {
      const params = new URLSearchParams();
      if (status && status !== 'ALL') {
        params.append('status', status);
      }
      if (search && search.trim()) {
        params.append('search', search.trim());
      }
      if (opFilter && opFilter !== 'ALL') {
        params.append('assignedTo', opFilter);
      }
      if (date && date.trim()) {
        params.append('date', date.trim());
      }

      const res = await fetch(`/api/renewal-check/batch/${batchId}?${params.toString()}`, {
        headers: getAuthHeaders(),
      });
      const data = await safeFetchJson(res);
      if (data.success) {
        setCurrentBatch(data.batch);
        if (data.stats) setStats(data.stats);
        setQueueItems(data.items || []);
      }
    } catch (err) {
      console.error('Failed to load batch queue details:', err);
      showToast('बॅच तपशील लोड करण्यात अयशस्वी.');
    } finally {
      setIsLoadingQueue(false);
    }
  };

  useEffect(() => {
    loadBatches();
  }, []);

  useEffect(() => {
    if (selectedBatchId) {
      loadBatchDetails(selectedBatchId, filterStatus, searchQuery, operatorFilter, dateFilter);
    } else {
      setCurrentBatch(null);
      setQueueItems([]);
    }
  }, [selectedBatchId, filterStatus, operatorFilter, dateFilter]);

  // Handle Search submit
  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (selectedBatchId) {
      loadBatchDetails(selectedBatchId, filterStatus, searchQuery, operatorFilter, dateFilter);
    }
  };

  // Quick Copy MH Number
  const handleCopyMh = (item: RenewalCheckQueueItem) => {
    if (!item.mhNumber) return;
    const clean = item.mhNumber.trim();
    navigator.clipboard.writeText(clean).then(() => {
      setCopiedId(item.id);
      showToast(`📋 MH नंबर कॉपी झाला: ${clean}`);
      setTimeout(() => {
        setCopiedId((prev) => (prev === item.id ? null : prev));
      }, 2000);
    });
  };

  // Open Mahabocw portal in new tab (Rule R: Do not bypass CAPTCHA/OTP/login)
  const handleOpenPortal = (mhNumber: string) => {
    window.open('https://iwbms.mahabocw.in/', '_blank', 'noopener,noreferrer');
    showToast(`🔗 अधिकृत महामंडळ पोर्टल उघडले (${mhNumber})`);
  };

  // WhatsApp with configurable Marathi template (Rule Q)
  const handleSendWhatsApp = (item: RenewalCheckQueueItem) => {
    const rawMob = (item.mobileNumber || '').replace(/\D/g, '');
    const cleanMob = rawMob.length === 10 ? `91${rawMob}` : rawMob;

    if (!cleanMob || cleanMob.length < 10) {
      showToast('⚠️ Valid mobile number required. (कामगाराचा वैध मोबाईल क्रमांक उपलब्ध नाही)');
      return;
    }

    const message = whatsAppTemplate
      .replace(/{workerName}/g, item.workerName || 'कामगार')
      .replace(/{mhNumber}/g, item.mhNumber || '-')
      .replace(/{mobileNumber}/g, item.mobileNumber || '-');

    const url = `https://wa.me/${cleanMob}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    showToast(`💬 WhatsApp संदेश विंडो उघडली (${item.workerName})`);
  };

  // =========================================================================
  // IMPORT PREVIEW & CONFIRM WORKFLOW (Rule B, L, M, K)
  // =========================================================================
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setPreviewError(null);
    setIsGeneratingPreview(true);
    setImportStep('PREVIEW');

    try {
      // 1. Client-Side parse for robust cross-browser safety
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const firstSheetName = workbook.SheetNames[0];

      if (!firstSheetName) {
        throw new Error('निवडलेल्या एक्सेल फाईलमध्ये कोणतीही शीट आढळली नाही.');
      }

      const worksheet = workbook.Sheets[firstSheetName];
      const headerRows: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
      let rawRows: any[] = [];

      if (headerRows.length > 0) {
        const firstRow = headerRows[0] || [];
        const hasHeader = firstRow.some((cell) =>
          ['name', 'mh', 'worker', 'mobile', 'phone', 'नाव', 'नोंदणी'].some((h) =>
            String(cell).toLowerCase().includes(h)
          )
        );

        if (!hasHeader && firstRow.some((cell) => /^(MH|mh)[\s\-_]?[0-9]+/i.test(String(cell).trim()))) {
          // Headerless CSV or Excel - auto-map columns
          rawRows = headerRows.map((cols) => {
            let name = '';
            let mh = '';
            let mobile = '';
            for (const c of cols) {
              const str = String(c).replace(/[\t\r\n"']/g, '').trim();
              if (/^(MH|mh)[\s\-_]?[0-9]+/i.test(str)) {
                mh = str;
              } else if (str.replace(/\D/g, '').length === 10) {
                mobile = str.replace(/\D/g, '');
              } else if (str.length > 2 && isNaN(Number(str))) {
                name = str;
              }
            }
            return {
              'Worker Name': name,
              'MH Number': mh,
              'Mobile Number': mobile,
            };
          });
        } else {
          rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });
        }
      }

      if (!Array.isArray(rawRows) || rawRows.length === 0) {
        throw new Error('एक्सेल शीटमध्ये कोणतीही नोंद आढळली नाही. कृपया फाईल तपासा.');
      }

      // 2. Call backend preview API (Safe Excel Matching)
      const res = await fetch('/api/renewal-check/preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          filename: file.name,
          records: rawRows,
        }),
      });

      const data = await safeFetchJson(res);
      if (data.success && data.summary) {
        setPreviewSummary(data.summary);
      } else {
        throw new Error(data.error || 'प्रिव्ह्यू तयार करताना त्रुटी आली.');
      }
    } catch (err: any) {
      console.error('Import preview failed:', err);
      setPreviewError(err?.message || 'फाईल वाचताना त्रुटी आली. कृपया फॉरमॅट तपासा.');
    } finally {
      setIsGeneratingPreview(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!previewSummary || !previewSummary.previewItems) return;
    if (actionLoadingId === 'confirm_import') return; // Double click protection (Rule I)

    setActionLoadingId('confirm_import');
    setImportStep('SAVING');
    setPreviewError(null);

    const validItemsToImport = previewSummary.previewItems
      .filter((item) => item.isValid)
      .map((item) => ({
        workerName: item.workerName,
        mhNumber: item.mhNumber,
        mobileNumber: item.mobileNumber,
        suggestedStatus: item.suggestedStatus,
        matchStatus: item.matchStatus,
      }));

    if (validItemsToImport.length === 0) {
      setPreviewError('इम्पोर्ट करण्यासाठी कोणतेही वैध रेकॉर्ड उपलब्ध नाहीत.');
      setImportStep('PREVIEW');
      setActionLoadingId(null);
      return;
    }

    try {
      const assignedOpUser = users.find((u) => u.id === assignedOperatorForImport);

      const res = await fetch('/api/renewal-check/confirm-import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          filename: previewSummary.fileName,
          validItems: validItemsToImport,
          assignedTo: assignedOperatorForImport || undefined,
          assignedToName: assignedOpUser?.name || undefined,
        }),
      });

      const data = await safeFetchJson(res);
      if (data.success) {
        showToast(`🎉 बॅच ${data.batchId} यशस्वीरीत्या आयात झाली! (${data.totalRecords} नोंदी)`);
        setIsImportModalOpen(false);
        setPreviewSummary(null);
        setSelectedFile(null);
        setImportStep('SELECT_FILE');
        // Reload batches and select the new one
        await loadBatches(data.batchId);
      } else {
        throw new Error(data.error || 'इम्पोर्ट करताना त्रुटी आली.');
      }
    } catch (err: any) {
      console.error('Confirm import failed:', err);
      setPreviewError(err?.message || 'इम्पोर्ट कन्फर्म करताना त्रुटी आली.');
      setImportStep('PREVIEW');
    } finally {
      setActionLoadingId(null);
    }
  };

  // =========================================================================
  // CUSTOMER PROCESSING & RENEWAL HISTORY (Rule C, D, E, F)
  // =========================================================================
  const openCustomerProcessingModal = async (item: RenewalCheckQueueItem) => {
    setActiveQueueItem(item);
    setProcessingSuccessInfo(null);
    setIsLoadingHistory(true);

    // Default form fields (Verification Date, Fee, Taluka kept empty per user request)
    setFormRenewalFee('');
    setFormReceiptNumber(`VR-${Date.now().toString().slice(-6)}`);
    setFormVerificationDate('');
    setFormTaluka('');
    setFormNotes(item.operatorNotes || '');

    try {
      const res = await fetch(`/api/renewal-check/worker-history/${item.id}`, {
        headers: getAuthHeaders(),
      });
      const data = await safeFetchJson(res);
      if (data.success) {
        setWorkerHistory(data);
        if (data.nextRenewalYear) {
          setFormRenewalYear(data.nextRenewalYear);
        }
      }
    } catch (err) {
      console.error('Failed to load worker renewal history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Close Customer Processing Modal (Rule: Immediate close on success)
  const closeCustomerModal = () => {
    setActiveQueueItem(null);
    setWorkerHistory(null);
    setProcessingSuccessInfo(null);
    setFormNotes('');
  };

  // Perform Status Action (Renewed, Call Needed, Issue, Skip)
  const handleProcessAction = async (newStatus: RenewalVerificationStatus) => {
    if (!activeQueueItem) return;
    const actionKey = `action_${activeQueueItem.id}_${newStatus}`;
    if (actionLoadingId === actionKey) return; // Double-click protection (Rule I)

    setActionLoadingId(actionKey);

    const renewalDetails =
      newStatus === 'RENEWED'
        ? {
            feeAmount: formRenewalFee ? Number(formRenewalFee) : 50,
            renewalPeriodYears: 1, // Compulsory 1 year
            renewalYear: formRenewalYear || undefined,
            receiptNumber: formReceiptNumber || `VR-${Date.now().toString().slice(-6)}`,
            taluka: formTaluka || undefined,
            verificationDate: formVerificationDate || undefined,
          }
        : undefined;

    try {
      const res = await fetch(`/api/renewal-check/item/${activeQueueItem.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          status: newStatus,
          operatorNotes: formNotes.trim(),
          renewalDetails,
        }),
      });

      const data = await safeFetchJson(res);
      if (res.ok && data.success) {
        // 1. Immediately update parent queue table UI without requiring manual page reload
        if (data.updatedItem) {
          setQueueItems((prev) =>
            prev.map((r) => (r.id === activeQueueItem.id ? { ...r, ...data.updatedItem } : r))
          );
        }
        if (data.stats) {
          setStats(data.stats);
        }

        // 2. Trigger parent list refresh to ensure total counts and filters are updated
        if (selectedBatchId) {
          loadBatchDetails(selectedBatchId, filterStatus, searchQuery, operatorFilter, dateFilter);
        }
        if (onRefreshRenewals && newStatus === 'RENEWED') {
          onRefreshRenewals();
        }

        // 3. Display status feedback toast
        if (newStatus === 'RENEWED') {
          showToast(`✅ ${activeQueueItem.workerName} चे नूतनीकरण यशस्वीरीत्या नोंदवले!`);
        } else if (newStatus === 'ALREADY_RENEWED') {
          showToast(`📋 ${activeQueueItem.workerName} - आधीच नूतनीकरण झालेले (Already Renewed) नोंदवले.`);
        } else if (newStatus === 'CALL_PENDING') {
          showToast(`📞 ${activeQueueItem.workerName} - कॉल बाकी (Call Needed) नोंदवले.`);
        } else if (newStatus === 'ISSUE_REJECTED') {
          showToast(`❌ ${activeQueueItem.workerName} - अडचण / नाकारले नोंदवले.`);
        } else if (newStatus === 'SKIPPED') {
          showToast(`⏭️ ${activeQueueItem.workerName} - वगळले (Skipped).`);
        } else {
          showToast(`स्थिती अपडेट केली: ${newStatus}`);
        }

        // 4. Immediately trigger modal close function so popup disappears
        closeCustomerModal();
      } else {
        throw new Error(data.error || 'Failed to update status');
      }
    } catch (err: any) {
      console.error('Error updating queue item status:', err);
      showToast(`⚠️ त्रुटी: ${err?.message || 'कृपया पुन्हा प्रयत्न करा'}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  // Rule F: NEXT CUSTOMER Action
  const handleOpenNextCustomer = () => {
    if (processingSuccessInfo?.nextPendingItemId) {
      const nextItem = queueItems.find((q) => q.id === processingSuccessInfo.nextPendingItemId);
      if (nextItem) {
        openCustomerProcessingModal(nextItem);
        return;
      }
    }

    // Fallback: Find next pending in local queueItems
    const nextPending = queueItems.find(
      (q) => q.verificationStatus === 'PENDING' && q.id !== activeQueueItem?.id
    );
    if (nextPending) {
      openCustomerProcessingModal(nextPending);
    } else {
      showToast('🎉 या बॅचमधील सर्व कामगारांची तपासणी पूर्ण झाली आहे!');
      setActiveQueueItem(null);
      setWorkerHistory(null);
      setProcessingSuccessInfo(null);
    }
  };

  // Direct table row quick status update
  const handleQuickRowStatus = async (
    item: RenewalCheckQueueItem,
    status: RenewalVerificationStatus,
    notes?: string
  ) => {
    const actionKey = `quick_${item.id}_${status}`;
    if (actionLoadingId === actionKey) return; // Double-click protection (Rule I)
    setActionLoadingId(actionKey);

    try {
      const res = await fetch(`/api/renewal-check/item/${item.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          status,
          operatorNotes: notes || item.operatorNotes,
        }),
      });
      const data = await safeFetchJson(res);
      if (data.success) {
        setQueueItems((prev) =>
          prev.map((r) => (r.id === item.id ? { ...r, ...data.updatedItem } : r))
        );
        if (data.stats) setStats(data.stats);
        showToast(`स्थिती अपडेट केली: ${status}`);
        if (status === 'RENEWED' && onRefreshRenewals) onRefreshRenewals();
      }
    } catch (err: any) {
      console.error('Quick status update failed:', err);
      showToast('त्रुटी आली, कृपया पुन्हा प्रयत्न करा.');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Open Audit Log modal (Rule T)
  const openAuditLogs = async (queueItemId?: number) => {
    setIsAuditModalOpen(true);
    setIsLoadingAudit(true);
    try {
      const param = queueItemId ? `queueItemId=${queueItemId}` : `batchId=${selectedBatchId}`;
      const res = await fetch(`/api/renewal-check/audit?${param}`, {
        headers: getAuthHeaders(),
      });
      const data = await safeFetchJson(res);
      if (data.success && Array.isArray(data.auditLogs)) {
        setAuditLogs(data.auditLogs);
      }
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setIsLoadingAudit(false);
    }
  };

  // Handle Export (Rule S)
  const handleExport = (
    filterType: 'PENDING_CALL' | 'RENEWED' | 'ALREADY_RENEWED' | 'CALL_PENDING' | 'ISSUE_REJECTED' | 'ALL'
  ) => {
    if (!selectedBatchId) {
      showToast('कृपया प्रथम बॅच निवडा.');
      return;
    }
    const url = `/api/renewal-check/export/${selectedBatchId}?filter=${filterType}&format=xlsx`;
    window.open(url, '_blank');
    showToast('📥 एक्सेल रिपोर्ट डाउनलोड सुरू झाले...');
  };

  // Download Sample Demo Excel Format
  const handleDownloadSampleExcel = () => {
    try {
      const demoData = [
        {
          'Worker Name': 'Sarika Sumit Shinde',
          'MH Number': 'MH131100017033',
          'Mobile Number': '8087805716',
        },
        {
          'Worker Name': 'Savita Santosh Atkari',
          'MH Number': 'MH131080014081',
          'Mobile Number': '9975622863',
        },
        {
          'Worker Name': 'Shalu Vilas Kuchik',
          'MH Number': 'MH131090014474',
          'Mobile Number': '7498783364',
        },
        {
          'Worker Name': 'Shashikala Sanjay Korade',
          'MH Number': 'MH131090015235',
          'Mobile Number': '7498832150',
        },
        {
          'Worker Name': 'Shital Balu Bhor',
          'MH Number': 'MH131090014991',
          'Mobile Number': '7972433328',
        },
        {
          'Worker Name': 'Shubham Suresh Shelke',
          'MH Number': 'MH131100017978',
          'Mobile Number': '9370552710',
        },
        {
          'Worker Name': 'Suhbham Jalindar Hande',
          'MH Number': 'MH131090015044',
          'Mobile Number': '7030508019',
        },
        {
          'Worker Name': 'Surekha Santosh Kondhavale',
          'MH Number': 'MH131080013617',
          'Mobile Number': '9730824027',
        },
        {
          'Worker Name': 'Suvarna Mahendra Pawar',
          'MH Number': 'MH131090016980',
          'Mobile Number': '9356967849',
        },
        {
          'Worker Name': 'Swati Harish Chaskar',
          'MH Number': 'MH131090016469',
          'Mobile Number': '9665151299',
        },
      ];

      const worksheet = XLSX.utils.json_to_sheet(demoData);
      worksheet['!cols'] = [
        { wch: 32 }, // Worker Name
        { wch: 24 }, // MH Number
        { wch: 18 }, // Mobile Number
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Inactive Workers');
      XLSX.writeFile(workbook, 'demo_inactive_workers_renewal_format.xlsx');
      showToast('📥 नमुना डेमो एक्सेल फॉरमॅट डाऊनलोड झाला.');
    } catch (err: any) {
      console.error('Download sample excel failed:', err);
      showToast('नमुना फाईल डाऊनलोड करताना त्रुटी आली.');
    }
  };

  // =========================================================================
  // DELETE & BULK OPERATIONS HANDLERS
  // =========================================================================

  // 1. Delete single queue item
  const handleDeleteQueueItem = async (item: RenewalCheckQueueItem) => {
    setActionLoadingId(`delete_${item.id}`);
    try {
      const res = await fetch(`/api/renewal-check/item/${item.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const data = await safeFetchJson(res);
      if (data.success) {
        setQueueItems((prev) => prev.filter((r) => r.id !== item.id));
        if (data.stats) setStats(data.stats);
        setSelectedItemIds((prev) => {
          const next = new Set(prev);
          next.delete(item.id);
          return next;
        });
        showToast(`🗑️ कामगार '${item.workerName}' (${item.mhNumber}) ची नोंद रांगेतून हटवली गेली.`);
        setItemToDelete(null);

        // If currently open in customer modal, close or next
        if (activeQueueItem?.id === item.id) {
          setActiveQueueItem(null);
          setWorkerHistory(null);
          setProcessingSuccessInfo(null);
        }
      } else {
        throw new Error(data.error || 'Failed to delete item');
      }
    } catch (err: any) {
      console.error('Delete item failed:', err);
      showToast(`⚠️ नोंद हटवताना त्रुटी: ${err?.message || 'कृपया पुन्हा प्रयत्न करा'}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  // 2. Delete selected bulk items
  const handleDeleteBulkConfirmed = async () => {
    if (selectedItemIds.size === 0 || !selectedBatchId) return;
    setActionLoadingId('delete_bulk');
    try {
      const idsArray = Array.from(selectedItemIds);
      const res = await fetch('/api/renewal-check/items/delete-bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          batchId: selectedBatchId,
          ids: idsArray,
        }),
      });
      const data = await safeFetchJson(res);
      if (data.success) {
        const deletedSet = new Set(idsArray);
        setQueueItems((prev) => prev.filter((r) => !deletedSet.has(r.id)));
        if (data.stats) setStats(data.stats);
        setSelectedItemIds(new Set());
        setIsBulkDeleteModalOpen(false);
        showToast(`🗑️ ${data.deletedCount} नोंदी रांगेतून यशस्वीरीत्या हटवल्या.`);
      } else {
        throw new Error(data.error || 'Bulk delete failed');
      }
    } catch (err: any) {
      console.error('Bulk delete failed:', err);
      showToast(`⚠️ हटवताना त्रुटी: ${err?.message || 'कृपया पुन्हा प्रयत्न करा'}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  // 3. Initiate delete batch
  const handleDeleteBatch = (batchId: string) => {
    const found = batches.find((b) => b.batchId === batchId) || null;
    setBatchToDelete(found);
    setIsBatchDeleteModalOpen(true);
  };

  // Delete entire batch confirmed
  const handleDeleteBatchConfirmed = async () => {
    const targetId = batchToDelete?.batchId || selectedBatchId;
    if (!targetId) return;
    setActionLoadingId('delete_batch');
    try {
      const res = await fetch(`/api/renewal-check/batch/${targetId}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const data = await safeFetchJson(res);
      if (data.success) {
        showToast(`🗑️ संपूर्ण बॅच '${targetId}' यशस्वीरीत्या हटवली.`);
        setIsBatchDeleteModalOpen(false);
        setBatchToDelete(null);
        if (selectedBatchId === targetId) {
          setSelectedBatchId(null);
          setQueueItems([]);
          setStats({
            total: 0,
            pending: 0,
            renewed: 0,
            alreadyRenewed: 0,
            callPending: 0,
            rejected: 0,
            skipped: 0,
            completionPercentage: 0,
          });
        }
        await loadBatches();
      } else {
        throw new Error(data.error || 'Batch delete failed');
      }
    } catch (err: any) {
      console.error('Batch delete failed:', err);
      showToast(`⚠️ बॅच हटवताना त्रुटी: ${err?.message || 'कृपया पुन्हा प्रयत्न करा'}`);
    } finally {
      setActionLoadingId(null);
    }
  };

  // 4. Bulk assign to operator confirmed
  const handleBulkAssignConfirmed = async () => {
    if (selectedItemIds.size === 0 || !selectedBatchId || !targetOperatorId) return;
    setActionLoadingId('assign_bulk');
    try {
      const opUser = users.find((u) => u.id === targetOperatorId);
      const res = await fetch(`/api/renewal-check/batch/${selectedBatchId}/assign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          itemIds: Array.from(selectedItemIds),
          assignedTo: targetOperatorId,
          assignedToName: opUser?.name || 'Operator',
        }),
      });
      const data = await safeFetchJson(res);
      if (data.success) {
        setQueueItems((prev) =>
          prev.map((r) =>
            selectedItemIds.has(r.id)
              ? { ...r, assignedTo: targetOperatorId, assignedToName: opUser?.name || 'Operator' }
              : r
          )
        );
        setIsAssignModalOpen(false);
        setSelectedItemIds(new Set());
        showToast(`👤 ${data.assignedCount} नोंदी ${opUser?.name || 'ऑपरेटर'} यांना नियुक्त केल्या.`);
      } else {
        throw new Error(data.error || 'Assign failed');
      }
    } catch (err: any) {
      showToast('ऑपरेटर नियुक्त करताना त्रुटी आली.');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Toggle selection
  const handleToggleSelectItem = (id: number) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleToggleSelectAll = () => {
    if (selectedItemIds.size === queueItems.length) {
      setSelectedItemIds(new Set());
    } else {
      setSelectedItemIds(new Set(queueItems.map((q) => q.id)));
    }
  };

  // Status Badge Helper (Rule G)
  const renderStatusBadge = (status: RenewalVerificationStatus) => {
    switch (status) {
      case 'PENDING':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <Clock className="w-3 h-3 mr-1 text-amber-600 animate-pulse" />
            प्रलंबित (PENDING)
          </span>
        );
      case 'RENEWED':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-600" />
            नूतनीकरण पूर्ण (RENEWED)
          </span>
        );
      case 'ALREADY_RENEWED':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200">
            <CheckCircle2 className="w-3 h-3 mr-1 text-purple-600" />
            आधीच झालेले (ALREADY DONE)
          </span>
        );
      case 'CALL_PENDING':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <Phone className="w-3 h-3 mr-1 text-blue-600" />
            कॉल करणे बाकी (CALL)
          </span>
        );
      case 'ISSUE_REJECTED':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3 h-3 mr-1 text-rose-600" />
            अडचण / नाकारले (ISSUE)
          </span>
        );
      case 'SKIPPED':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-300">
            <SkipForward className="w-3 h-3 mr-1 text-slate-500" />
            वगळले (SKIPPED)
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 bg-slate-900 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center space-x-3 text-sm border border-slate-700 transition-all animate-bounce">
          <Info className="w-5 h-5 text-amber-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-6 rounded-2xl shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-600/30 border border-blue-400/30 rounded-xl backdrop-blur-md">
                <FileSpreadsheet className="w-7 h-7 text-blue-300" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
                  इनॲक्टिव्ह कामगार नूतनीकरण तपासणी व प्रक्रिया
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30 font-medium">
                    Work Queue
                  </span>
                </h1>
                <p className="text-sm text-blue-200/80">
                  Excel मधून इनॲक्टिव्ह फॉर्म्स तपासा, अधिकृत महामंडळ पोर्टलवर खात्री करा, आणि सुरक्षितपणे मुख्य नूतनीकरण प्रणालीमध्ये नोंदवा.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* WhatsApp Template Setting */}
            <button
              onClick={() => setIsWhatsAppConfigOpen(true)}
              className="px-3.5 py-2.5 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-xl border border-white/15 backdrop-blur-md transition-all flex items-center gap-2"
              title="WhatsApp संदेश मजकूर कॉन्फिगर करा"
            >
              <MessageCircle className="w-4 h-4 text-emerald-400" />
              WhatsApp मेसेज सेटिंग
            </button>

            {/* Audit Logs */}
            <button
              onClick={() => openAuditLogs()}
              className="px-3.5 py-2.5 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold rounded-xl border border-white/15 backdrop-blur-md transition-all flex items-center gap-2"
              title="ऑडिट लॉग्स पहा"
            >
              <History className="w-4 h-4 text-amber-300" />
              ऑडिट लॉग (Audit Trail)
            </button>

            {/* Demo Format Download */}
            <button
              onClick={handleDownloadSampleExcel}
              className="px-3.5 py-2.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 text-xs font-semibold rounded-xl border border-emerald-400/40 backdrop-blur-md transition-all flex items-center gap-2"
              title="नमुना एक्सेल फॉरमॅट डाऊनलोड करा"
            >
              <Download className="w-4 h-4 text-emerald-300" />
              डेमो फॉरमॅट (Sample Excel)
            </button>

            {/* New Excel Upload (Rule M) */}
            <button
              onClick={() => {
                setIsImportModalOpen(true);
                setImportStep('SELECT_FILE');
                setPreviewSummary(null);
                setSelectedFile(null);
                setPreviewError(null);
              }}
              className="px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-emerald-900/30 border border-emerald-400/30 transition-all flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              नवीन एक्सेल बॅच अपलोड करा
            </button>
          </div>
        </div>
      </div>

      {/* Batch Selection & Export Actions Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
            <FileSpreadsheet className="w-4 h-4 text-blue-600" />
            निवडलेली बॅच (Select Batch):
          </label>
          <div className="relative min-w-[280px]">
            <select
              value={selectedBatchId || ''}
              onChange={(e) => setSelectedBatchId(e.target.value)}
              className="w-full pl-3 pr-10 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm font-medium text-slate-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              disabled={isLoadingBatches}
            >
              {batches.length === 0 ? (
                <option value="">कोणतीही बॅच उपलब्ध नाही</option>
              ) : (
                batches.map((b) => (
                  <option key={b.batchId} value={b.batchId}>
                    {b.batchId} - {b.filename} ({b.totalRecords} नोंदी)
                  </option>
                ))
              )}
            </select>
          </div>

          <button
            onClick={() => {
              if (selectedBatchId) loadBatchDetails(selectedBatchId);
              loadBatches();
            }}
            className="p-2 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg border border-slate-200 transition-all"
            title="रिफ्रेश करा"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingQueue ? 'animate-spin text-blue-600' : ''}`} />
          </button>

          {currentUser?.role === 'admin' && selectedBatchId && (
            <button
              onClick={() => handleDeleteBatch(selectedBatchId)}
              className="px-2.5 py-1.5 text-rose-600 hover:text-white hover:bg-rose-600 bg-rose-50 rounded-lg border border-rose-200 transition-all flex items-center gap-1 text-xs font-semibold"
              title="सध्याची बॅच हटवा (Delete Current Batch)"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>बॅच हटवा</span>
            </button>
          )}

          {currentUser?.role === 'admin' && batches.length > 0 && (
            <button
              onClick={() => setIsBatchManageModalOpen(true)}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 transition-all flex items-center gap-1.5"
              title="सर्व बॅचेस व्यवस्थापन व डिलीट पर्याय"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600" />
              <span>सर्व बॅचेस ({batches.length})</span>
            </button>
          )}
        </div>

        {/* Exports Buttons (Rule 10) */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleExport('PENDING_CALL')}
            className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-semibold rounded-lg border border-amber-300 transition-all flex items-center gap-1.5"
            title="Download Pending / Follow-up List"
          >
            <Download className="w-3.5 h-3.5 text-amber-700" />
            <span>Download Pending / Follow-up List</span>
            <span className="text-[10px] bg-amber-200/80 px-1.5 py-0.2 rounded font-bold">
              {stats.pending + stats.callPending}
            </span>
          </button>

          <button
            onClick={() => handleExport('RENEWED')}
            className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-lg border border-emerald-300 transition-all flex items-center gap-1.5"
            title="Download Successfully Renewed List"
          >
            <Download className="w-3.5 h-3.5 text-emerald-700" />
            <span>Download Successfully Renewed List</span>
            <span className="text-[10px] bg-emerald-200/80 px-1.5 py-0.2 rounded font-bold">
              {stats.renewed}
            </span>
          </button>

          <button
            onClick={() => handleExport('ALREADY_RENEWED')}
            className="px-3 py-2 bg-purple-50 hover:bg-purple-100 text-purple-800 text-xs font-semibold rounded-lg border border-purple-300 transition-all flex items-center gap-1.5"
            title="Download Already Renewed List (आधीच नूतनीकरण झालेली यादी)"
          >
            <Download className="w-3.5 h-3.5 text-purple-700" />
            <span>Download Already Renewed List</span>
            <span className="text-[10px] bg-purple-200/80 px-1.5 py-0.2 rounded font-bold">
              {stats.alreadyRenewed || 0}
            </span>
          </button>

          <div className="relative group">
            <button className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 transition-all flex items-center gap-1.5">
              <span>इतर एक्सपोर्ट्स</span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
            </button>

            <div className="absolute right-0 top-full mt-1 w-64 bg-white rounded-xl shadow-xl border border-slate-200 py-1.5 z-30 hidden group-hover:block hover:block">
              <button
                onClick={() => handleExport('PENDING_CALL')}
                className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-blue-50 hover:text-blue-700 flex items-center justify-between"
              >
                <span>१. प्रलंबित व कॉल बाकी एक्सपोर्ट</span>
                <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                  {stats.pending + stats.callPending}
                </span>
              </button>
              <button
                onClick={() => handleExport('RENEWED')}
                className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 flex items-center justify-between"
              >
                <span>२. यशस्वी नूतनीकरण एक्सपोर्ट</span>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded">
                  {stats.renewed}
                </span>
              </button>
              <button
                onClick={() => handleExport('ALREADY_RENEWED')}
                className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-purple-50 hover:text-purple-700 flex items-center justify-between"
              >
                <span>३. आधीच नूतनीकरण झालेले एक्सपोर्ट</span>
                <span className="text-[10px] bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded">
                  {stats.alreadyRenewed || 0}
                </span>
              </button>
              <button
                onClick={() => handleExport('ISSUE_REJECTED')}
                className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-rose-50 hover:text-rose-700 flex items-center justify-between"
              >
                <span>४. अडचण / नाकारलेले एक्सपोर्ट</span>
                <span className="text-[10px] bg-rose-100 text-rose-800 px-1.5 py-0.5 rounded">
                  {stats.rejected}
                </span>
              </button>
              <div className="border-t border-slate-100 my-1" />
              <button
                onClick={() => handleExport('ALL')}
                className="w-full text-left px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-indigo-50 hover:text-indigo-700 flex items-center justify-between"
              >
                <span>५. संपूर्ण बॅच एक्सपोर्ट (Full Batch)</span>
                <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                  {stats.total}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Calculation Cards (Rule H) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <p className="text-[11px] font-semibold text-slate-500 uppercase">एकूण आयात (Total)</p>
          <p className="text-xl font-bold text-slate-800 mt-1">{stats.total}</p>
        </div>

        <div className="bg-emerald-50/50 p-3.5 rounded-xl border border-emerald-200 shadow-sm">
          <p className="text-[11px] font-semibold text-emerald-700 uppercase flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            नूतनीकरण पूर्ण
          </p>
          <p className="text-xl font-bold text-emerald-800 mt-1">{stats.renewed}</p>
        </div>

        <div className="bg-purple-50/60 p-3.5 rounded-xl border border-purple-200 shadow-sm">
          <p className="text-[11px] font-semibold text-purple-700 uppercase flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-purple-600" />
            आधीच झालेले
          </p>
          <p className="text-xl font-bold text-purple-900 mt-1">{stats.alreadyRenewed || 0}</p>
        </div>

        <div className="bg-blue-50/50 p-3.5 rounded-xl border border-blue-200 shadow-sm">
          <p className="text-[11px] font-semibold text-blue-700 uppercase flex items-center gap-1">
            <Phone className="w-3 h-3 text-blue-600" />
            कॉल करणे बाकी
          </p>
          <p className="text-xl font-bold text-blue-800 mt-1">{stats.callPending}</p>
        </div>

        <div className="bg-rose-50/50 p-3.5 rounded-xl border border-rose-200 shadow-sm">
          <p className="text-[11px] font-semibold text-rose-700 uppercase flex items-center gap-1">
            <XCircle className="w-3 h-3 text-rose-600" />
            पोर्टल अडचणी
          </p>
          <p className="text-xl font-bold text-rose-800 mt-1">{stats.rejected}</p>
        </div>

        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-300 shadow-sm">
          <p className="text-[11px] font-semibold text-slate-600 uppercase flex items-center gap-1">
            <SkipForward className="w-3 h-3 text-slate-500" />
            वगळलेले (Skipped)
          </p>
          <p className="text-xl font-bold text-slate-700 mt-1">{stats.skipped}</p>
        </div>

        <div className="bg-amber-50/50 p-3.5 rounded-xl border border-amber-200 shadow-sm">
          <p className="text-[11px] font-semibold text-amber-700 uppercase flex items-center gap-1">
            <Clock className="w-3 h-3 text-amber-600" />
            प्रलंबित (Pending)
          </p>
          <p className="text-xl font-bold text-amber-800 mt-1">{stats.pending}</p>
        </div>

        <div className="col-span-2 sm:col-span-1 bg-gradient-to-br from-indigo-50 to-blue-50 p-3.5 rounded-xl border border-indigo-200 shadow-sm">
          <p className="text-[11px] font-semibold text-indigo-700 uppercase">प्रगती (Completion)</p>
          <p className="text-xl font-bold text-indigo-900 mt-1">{stats.completionPercentage}%</p>
        </div>
      </div>

      {/* Progress Bar (Rule H) */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-600 mb-1.5">
          <span>तपासणी प्रगती (Renewal Verification Progress):</span>
          <span>{stats.completionPercentage}% पूर्ण ({stats.renewed + (stats.alreadyRenewed || 0) + stats.callPending + stats.rejected + stats.skipped} / {stats.total})</span>
        </div>
        <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden flex">
          <div
            className="bg-emerald-500 transition-all duration-500"
            style={{ width: `${stats.total > 0 ? (stats.renewed / stats.total) * 100 : 0}%` }}
            title={`Renewed: ${stats.renewed}`}
          />
          <div
            className="bg-purple-500 transition-all duration-500"
            style={{ width: `${stats.total > 0 ? ((stats.alreadyRenewed || 0) / stats.total) * 100 : 0}%` }}
            title={`Already Done: ${stats.alreadyRenewed || 0}`}
          />
          <div
            className="bg-blue-500 transition-all duration-500"
            style={{ width: `${stats.total > 0 ? (stats.callPending / stats.total) * 100 : 0}%` }}
            title={`Call Pending: ${stats.callPending}`}
          />
          <div
            className="bg-rose-500 transition-all duration-500"
            style={{ width: `${stats.total > 0 ? (stats.rejected / stats.total) * 100 : 0}%` }}
            title={`Issues: ${stats.rejected}`}
          />
          <div
            className="bg-slate-400 transition-all duration-500"
            style={{ width: `${stats.total > 0 ? (stats.skipped / stats.total) * 100 : 0}%` }}
            title={`Skipped: ${stats.skipped}`}
          />
        </div>
      </div>

      {/* Search & Filters Bar (Rule P, O) */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search */}
          <form onSubmit={handleSearchSubmit} className="flex-1 max-w-md relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="कामगार नाव, MH क्रमांक किंवा मोबाईल शोधा..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-10 py-2 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  if (selectedBatchId) loadBatchDetails(selectedBatchId, filterStatus, '');
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            )}
          </form>

          {/* Operator filter (Rule O) */}
          <div className="flex flex-wrap items-center gap-3">
            {currentUser?.role === 'admin' && (
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-slate-500" />
                <select
                  value={operatorFilter}
                  onChange={(e) => setOperatorFilter(e.target.value)}
                  className="text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 font-medium text-slate-700 focus:ring-2 focus:ring-blue-500"
                >
                  <option value="ALL">सर्व ऑपरेटर (All Operators)</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Date filter */}
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-500" />
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="text-xs bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-700 focus:ring-2 focus:ring-blue-500"
              />
              {dateFilter && (
                <button
                  type="button"
                  onClick={() => setDateFilter('')}
                  className="text-xs text-rose-500 font-semibold hover:underline"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Status Filter Tabs & Slide Buttons (Rule G) */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'ALL', label: 'सर्व नोंदी (All)', count: stats.total },
              { id: 'PENDING', label: 'प्रलंबित (Pending)', count: stats.pending, color: 'text-amber-700 bg-amber-50' },
              { id: 'RENEWED', label: 'नूतनीकरण पूर्ण (Renewed)', count: stats.renewed, color: 'text-emerald-700 bg-emerald-50' },
              { id: 'ALREADY_RENEWED', label: 'आधीच झालेले (Already Done)', count: stats.alreadyRenewed || 0, color: 'text-purple-700 bg-purple-50' },
              { id: 'CALL_PENDING', label: 'कॉल बाकी (Call Needed)', count: stats.callPending, color: 'text-blue-700 bg-blue-50' },
              { id: 'ISSUE_REJECTED', label: 'अडचण / नाकारले (Issues)', count: stats.rejected, color: 'text-rose-700 bg-rose-50' },
              { id: 'SKIPPED', label: 'वगळलेले (Skipped)', count: stats.skipped, color: 'text-slate-700 bg-slate-100' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilterStatus(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                  filterStatus === tab.id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                    filterStatus === tab.id ? 'bg-white/20 text-white' : tab.color || 'bg-slate-200 text-slate-700'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Quick Slide Switch Controls */}
          <div className="flex items-center gap-4 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
            <ClassicSlideSwitch
              checked={filterStatus === 'PENDING'}
              onChange={(checked) => setFilterStatus(checked ? 'PENDING' : 'ALL')}
              variant="amber"
              size="sm"
              label={<span className="text-[11px] font-bold text-slate-700">फक्त प्रलंबित</span>}
              title="Slide Switch: Filter Pending Only"
            />
            <ClassicSlideSwitch
              checked={filterStatus === 'ALREADY_RENEWED'}
              onChange={(checked) => setFilterStatus(checked ? 'ALREADY_RENEWED' : 'ALL')}
              variant="indigo"
              size="sm"
              label={<span className="text-[11px] font-bold text-purple-800">आधीच झालेले</span>}
              title="Slide Switch: Filter Already Renewed"
            />
          </div>
        </div>
      </div>

      {/* Bulk Selection Action Bar */}
      {selectedItemIds.size > 0 && (
        <div className="bg-gradient-to-r from-slate-900 to-blue-950 text-white px-4 py-3 rounded-xl shadow-lg border border-blue-800 flex flex-wrap items-center justify-between gap-3 animate-fadeIn">
          <div className="flex items-center gap-3">
            <span className="bg-blue-500/20 text-blue-300 border border-blue-400/30 text-xs px-2.5 py-1 rounded-full font-bold">
              {selectedItemIds.size} नोंदी निवडल्या आहेत
            </span>
            <span className="text-xs text-slate-300 hidden sm:inline">
              समूह कृती (Bulk Actions):
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {currentUser?.role === 'admin' && users.length > 0 && (
              <button
                onClick={() => setIsAssignModalOpen(true)}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>ऑपरेटर नियुक्त करा</span>
              </button>
            )}
            <button
              onClick={() => setIsBulkDeleteModalOpen(true)}
              className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm shadow-rose-950/30"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>निवडलेल्या नोंदी हटवा ({selectedItemIds.size})</span>
            </button>
            <button
              onClick={() => setSelectedItemIds(new Set())}
              className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-semibold transition-all border border-white/15"
            >
              निवड रद्द करा
            </button>
          </div>
        </div>
      )}

      {/* Main Work Queue Table (Rule U, G, P, O) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Quick Slide Header Controls */}
        <TableSlideControls
          onSlideLeft={() => queueTableContainerRef.current?.scrollBy({ left: -320, behavior: 'smooth' })}
          onSlideRight={() => queueTableContainerRef.current?.scrollBy({ left: 320, behavior: 'smooth' })}
          title="↔ Slide Table / माहिती सरकवा"
        />
        <div ref={queueTableContainerRef} className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
                <th className="py-3 px-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={queueItems.length > 0 && selectedItemIds.size === queueItems.length}
                    onChange={handleToggleSelectAll}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    title="सर्व निवडा / अननिवडा"
                  />
                </th>
                <th className="py-3 px-2 w-10 text-center">अ.क्र.</th>
                <th className="py-3 px-4">कामगाराचे नाव व मोबाईल</th>
                <th className="py-3 px-4">MH नोंदणी क्रमांक</th>
                <th className="py-3 px-4">कार्यालय डेटाबेस स्थिती</th>
                <th className="py-3 px-3">सध्याची स्थिती</th>
                <th className="py-3 px-3">ऑपरेटर टीप</th>
                <th className="py-3 px-3 text-center">पोर्टल व WhatsApp</th>
                <th className="py-3 px-4 text-center">कृती (Actions)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoadingQueue ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    <Loader2 className="w-7 h-7 text-blue-600 animate-spin mx-auto mb-2" />
                    नोंदी लोड होत आहेत, कृपया थांबा...
                  </td>
                </tr>
              ) : queueItems.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    या फिल्टर अंतर्गत कोणतीही नोंद आढळली नाही.
                  </td>
                </tr>
              ) : (
                queueItems.map((item, index) => {
                  const hasMobile = Boolean(item.mobileNumber && item.mobileNumber.replace(/\D/g, '').length >= 10);
                  const isProcessingThis = actionLoadingId?.startsWith(`quick_${item.id}`);

                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-blue-50/40 transition-colors ${
                        item.verificationStatus === 'RENEWED' ? 'bg-emerald-50/20' : ''
                      }`}
                    >
                      {/* Select Checkbox */}
                      <td className="py-3 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={selectedItemIds.has(item.id)}
                          onChange={() => handleToggleSelectItem(item.id)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                        />
                      </td>

                      {/* Sr No */}
                      <td className="py-3 px-2 text-center font-medium text-slate-500">
                        {index + 1}
                      </td>

                      {/* Worker Name & Mobile */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-800 text-sm">{item.workerName}</div>
                        <div className="text-slate-500 text-[11px] flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3 text-slate-400" />
                          {item.mobileNumber || 'मोबाईल नाही'}
                        </div>
                      </td>

                      {/* MH Number + Copy (Rule B) */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-blue-900 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                            {item.mhNumber}
                          </span>
                          <button
                            onClick={() => handleCopyMh(item)}
                            className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-100/50 rounded transition-all"
                            title="कॉपी करा"
                          >
                            {copiedId === item.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Office DB Match Info */}
                      <td className="py-3 px-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium border ${
                            item.existingInRenewals
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : item.existingInRegistrations
                              ? 'bg-blue-50 text-blue-800 border-blue-200'
                              : 'bg-slate-50 text-slate-600 border-slate-200'
                          }`}
                        >
                          {item.databaseMatchInfo || 'नवीन कामगार'}
                        </span>
                      </td>

                      {/* Verification Status Badge */}
                      <td className="py-3 px-3">
                        {renderStatusBadge(item.verificationStatus)}
                      </td>

                      {/* Operator Notes */}
                      <td className="py-3 px-3 max-w-[180px]">
                        <p className="text-slate-600 truncate text-[11px]">
                          {item.operatorNotes || '-'}
                        </p>
                        {item.processedByName && (
                          <p className="text-[10px] text-slate-400">
                            By: {item.processedByName}
                          </p>
                        )}
                      </td>

                      {/* Portal & WhatsApp Shortcuts (Rule Q, R) */}
                      <td className="py-3 px-3">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* Portal Button (Rule R) */}
                          <button
                            onClick={() => handleOpenPortal(item.mhNumber)}
                            className="p-1.5 bg-slate-100 hover:bg-blue-100 text-slate-700 hover:text-blue-700 rounded-lg border border-slate-200 transition-all flex items-center gap-1"
                            title="महामंडळ पोर्टल उघडा"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-semibold hidden lg:inline">पोर्टल</span>
                          </button>

                          {/* WhatsApp Button (Rule Q) */}
                          <button
                            onClick={() => handleSendWhatsApp(item)}
                            disabled={!hasMobile}
                            className={`p-1.5 rounded-lg border transition-all flex items-center gap-1 ${
                              hasMobile
                                ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-300'
                                : 'bg-slate-100 text-slate-300 border-slate-200 cursor-not-allowed opacity-60'
                            }`}
                            title={hasMobile ? 'WhatsApp संदेश पाठवा' : 'Valid mobile number required.'}
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            <span className="text-[10px] font-semibold hidden lg:inline">WhatsApp</span>
                          </button>
                        </div>
                      </td>

                      {/* Action Buttons (Rule E, C, I) */}
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* CHECK Customer Button */}
                          <button
                            onClick={() => openCustomerProcessingModal(item)}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xs shadow-sm transition-all flex items-center gap-1"
                            title="कामगार तपासा (CHECK)"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>CHECK</span>
                          </button>

                          {/* Quick Renewed Button */}
                          <button
                            onClick={() => openCustomerProcessingModal(item)}
                            disabled={isProcessingThis}
                            className="px-2 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 rounded-lg text-xs font-semibold transition-all"
                            title="नूतनीकरण पूर्ण नोंदवा"
                          >
                            ✓
                          </button>

                          {/* Quick Call Needed Button */}
                          <button
                            onClick={() => handleQuickRowStatus(item, 'CALL_PENDING', 'कॉल करणे आवश्यक')}
                            disabled={isProcessingThis}
                            className="px-2 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-300 rounded-lg text-xs font-semibold transition-all"
                            title="कॉल लिस्टमध्ये जोडा"
                          >
                            📞
                          </button>

                          {/* Quick Skip Button */}
                          <button
                            onClick={() => handleQuickRowStatus(item, 'SKIPPED', 'पुढील वेळेस तपासणी')}
                            disabled={isProcessingThis}
                            className="px-2 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 border border-slate-300 rounded-lg text-xs font-semibold transition-all"
                            title="वगळा (Skip)"
                          >
                            ⏭️
                          </button>

                          {/* Delete from Queue Button */}
                          <button
                            onClick={() => setItemToDelete(item)}
                            disabled={Boolean(actionLoadingId)}
                            className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 hover:text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold transition-all"
                            title="रांगेतून ही नोंद हटवा (Delete)"
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
        {/* Quick Slide Footer Controls */}
        <TableSlideControls
          onSlideLeft={() => queueTableContainerRef.current?.scrollBy({ left: -320, behavior: 'smooth' })}
          onSlideRight={() => queueTableContainerRef.current?.scrollBy({ left: 320, behavior: 'smooth' })}
          title="↔ Slide Table / माहिती सरकवा"
          className="border-t border-b-0"
        />
      </div>

      {/* ========================================================================= */}
      {/* 1. IMPORT & PREVIEW MODAL (Rule B, L, M, K) */}
      {/* ========================================================================= */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl my-8 overflow-hidden">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="w-6 h-6 text-blue-300" />
                <div>
                  <h3 className="text-lg font-bold">एक्सेल फाईल आयात व तपासणी प्रिव्ह्यू (Import Preview)</h3>
                  <p className="text-xs text-blue-200">
                    Safe Excel Matching: MH नंबर प्रथम पडताळणी, दुबार रेकॉर्ड शोध, व सुरक्षित वर्क क्यू
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="text-white/70 hover:text-white text-xl font-bold p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Step 1: Select File */}
              {importStep === 'SELECT_FILE' && (
                <div className="space-y-4">
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-blue-300 hover:border-blue-500 bg-blue-50/50 hover:bg-blue-50/80 rounded-2xl p-8 text-center cursor-pointer transition-all"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx, .xls, .csv"
                      onChange={handleFileSelect}
                      className="hidden"
                    />
                    <Upload className="w-12 h-12 text-blue-600 mx-auto mb-3 animate-pulse" />
                    <h4 className="text-base font-bold text-slate-800">
                      एक्सेल किंवा CSV फाईल निवडा किंवा ड्रॅग करा
                    </h4>
                    <p className="text-xs text-slate-500 mt-1">
                      कॉलम नावे: Worker Name, MH Number, Mobile Number इत्यादी (मराठी किंवा इंग्रजी)
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-3 mt-4">
                      <span className="px-4 py-2 bg-blue-600 text-white text-xs font-semibold rounded-xl shadow-md">
                        ब्राउझ करा (Browse File)
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadSampleExcel();
                        }}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>डेमो फॉरमॅट (.xlsx)</span>
                      </button>
                    </div>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 space-y-1">
                    <p className="font-bold flex items-center gap-1.5 text-amber-800">
                      <ShieldCheck className="w-4 h-4 text-amber-600" />
                      सुरक्षित एक्सेल मॅचिंग नियम (Safe Excel Matching Rules):
                    </p>
                    <ul className="list-disc pl-5 space-y-1 text-slate-700">
                      <li><strong>Primary Match:</strong> अचूक MH नोंदणी क्रमांक</li>
                      <li><strong>Supporting Match:</strong> अचूक मोबाईल क्रमांक</li>
                      <li><strong>Supporting Info:</strong> कामगाराचे नाव (नावावरून थेट जोडणी केली जाणार नाही)</li>
                      <li>एकाच MH क्रमांकासाठी एकापेक्षा जास्त नोंदी सापडल्यास मॅन्युअल तपासणीसाठी ध्वजांकित केले जाईल.</li>
                    </ul>
                  </div>
                </div>
              )}

              {/* Step 2: Generating Preview Spinner */}
              {isGeneratingPreview && (
                <div className="py-12 text-center space-y-3">
                  <Loader2 className="w-10 h-10 text-blue-600 animate-spin mx-auto" />
                  <h4 className="text-sm font-bold text-slate-800">एक्सेल डेटा तपासत आहे व प्रिव्ह्यू तयार करत आहे...</h4>
                  <p className="text-xs text-slate-500">MH क्रमांक पडताळणी, दुबार रेकॉर्ड शोध, व जुने नूतनीकरण डेटाबेस क्रॉस-रेफरन्स चालू आहे.</p>
                </div>
              )}

              {/* Step 3: Preview Screen (Rule M) */}
              {!isGeneratingPreview && previewSummary && (
                <div className="space-y-5">
                  {/* Summary Metric Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-center">
                      <p className="text-[11px] font-semibold text-slate-500">एकूण ओळी (Total Rows)</p>
                      <p className="text-lg font-bold text-slate-800">{previewSummary.totalRows}</p>
                    </div>
                    <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200 text-center">
                      <p className="text-[11px] font-semibold text-emerald-700">वैध ओळी (Valid Rows)</p>
                      <p className="text-lg font-bold text-emerald-800">{previewSummary.validRows}</p>
                    </div>
                    <div className="bg-amber-50 p-3 rounded-xl border border-amber-200 text-center">
                      <p className="text-[11px] font-semibold text-amber-700">शीटमधील दुबार (Duplicates)</p>
                      <p className="text-lg font-bold text-amber-800">{previewSummary.duplicateInSheetRows}</p>
                    </div>
                    <div className="bg-rose-50 p-3 rounded-xl border border-rose-200 text-center">
                      <p className="text-[11px] font-semibold text-rose-700">अवैध ओळी (Invalid Rows)</p>
                      <p className="text-lg font-bold text-rose-800">{previewSummary.invalidRows}</p>
                    </div>
                    <div className="bg-indigo-50 p-3 rounded-xl border border-indigo-200 text-center">
                      <p className="text-[11px] font-semibold text-indigo-700">पूर्वी आयात केलेले (Already In Queue)</p>
                      <p className="text-lg font-bold text-indigo-800">{previewSummary.alreadyInBatchRows}</p>
                    </div>
                  </div>

                  {/* Matching breakdown tags */}
                  <div className="flex flex-wrap gap-2 text-xs">
                    <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-lg font-semibold">
                      MH जुळले: {previewSummary.exactMhMatches}
                    </span>
                    <span className="px-2.5 py-1 bg-blue-100 text-blue-800 rounded-lg font-semibold">
                      मोबाईल जुळले: {previewSummary.mobileMatches}
                    </span>
                    {previewSummary.multipleMatches > 0 && (
                      <span className="px-2.5 py-1 bg-rose-100 text-rose-800 rounded-lg font-semibold flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        एकाधिक मॅच: {previewSummary.multipleMatches} (Manual review required)
                      </span>
                    )}
                    <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg font-semibold">
                      नवीन कामगार: {previewSummary.newWorkers}
                    </span>
                  </div>

                  {/* Operator Assignment selection before import (Rule O) */}
                  {currentUser?.role === 'admin' && users.length > 0 && (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-3">
                      <label className="text-xs font-bold text-slate-700 shrink-0">
                        ऑपरेटर नियुक्त करा (Assign to Operator):
                      </label>
                      <select
                        value={assignedOperatorForImport}
                        onChange={(e) => setAssignedOperatorForImport(e.target.value)}
                        className="text-xs bg-white border border-slate-300 rounded-lg px-3 py-1.5 font-medium text-slate-700 focus:ring-2 focus:ring-blue-500 flex-1 max-w-xs"
                      >
                        <option value="">कोणताही नाही (Unassigned)</option>
                        {users.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({u.role})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Preview Items Table */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-100 text-slate-700 sticky top-0 font-bold border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-3 w-10 text-center">#</th>
                          <th className="py-2.5 px-3">कामगाराचे नाव</th>
                          <th className="py-2.5 px-3">MH नंबर</th>
                          <th className="py-2.5 px-3">मोबाईल</th>
                          <th className="py-2.5 px-3">मॅच निकाल (Match Result)</th>
                          <th className="py-2.5 px-3 text-center">स्थिती</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {previewSummary.previewItems.slice(0, 100).map((row) => (
                          <tr key={row.rowNumber} className={!row.isValid ? 'bg-rose-50/40' : ''}>
                            <td className="py-2 px-3 text-center text-slate-500">{row.rowNumber}</td>
                            <td className="py-2 px-3 font-semibold text-slate-800">{row.workerName}</td>
                            <td className="py-2 px-3 font-mono font-bold text-blue-800">{row.mhNumber}</td>
                            <td className="py-2 px-3 text-slate-600">{row.mobileNumber || '-'}</td>
                            <td className="py-2 px-3 text-[11px] text-slate-600">
                              {row.matchDetails}
                            </td>
                            <td className="py-2 px-3 text-center">
                              {row.isValid ? (
                                <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                                  Valid
                                </span>
                              ) : (
                                <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-100 text-rose-800">
                                  Invalid
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {previewSummary.previewItems.length > 100 && (
                    <p className="text-[11px] text-slate-400 text-center">
                      (प्रिव्ह्यूमध्ये पहिले १०० रेकॉर्ड्स दाखवले आहेत. संपूर्ण {previewSummary.validRows} वैध रेकॉर्ड्स आयात केले जातील.)
                    </p>
                  )}

                  {/* Preview Error Banner */}
                  {previewError && (
                    <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{previewError}</span>
                    </div>
                  )}

                  {/* Confirmation Buttons (Rule I) */}
                  <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                    <button
                      onClick={() => {
                        setImportStep('SELECT_FILE');
                        setPreviewSummary(null);
                        setSelectedFile(null);
                      }}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl"
                    >
                      ← दुसरी फाईल निवडा
                    </button>

                    <button
                      onClick={handleConfirmImport}
                      disabled={actionLoadingId === 'confirm_import' || previewSummary.validRows === 0}
                      className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white text-sm font-bold rounded-xl shadow-lg shadow-emerald-900/20 transition-all flex items-center gap-2"
                    >
                      {actionLoadingId === 'confirm_import' ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>आयात होत आहे...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>CONFIRM IMPORT ({previewSummary.validRows} रेकॉर्ड्स सेव्ह करा)</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. CUSTOMER PROCESSING & RENEWAL HISTORY MODAL (Rule C, D, E, F) */}
      {/* ========================================================================= */}
      {activeQueueItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl my-6 overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <UserCheck className="w-6 h-6 text-emerald-400" />
                <div>
                  <h3 className="text-base sm:text-lg font-bold flex items-center gap-2">
                    {activeQueueItem.workerName}
                    <span className="font-mono text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-200 border border-blue-400/30">
                      {activeQueueItem.mhNumber}
                    </span>
                  </h3>
                  <p className="text-xs text-blue-200 flex items-center gap-2 mt-0.5">
                    <span>मोबाईल: {activeQueueItem.mobileNumber || '-'}</span>
                    <span>•</span>
                    <span>सध्याची स्थिती: {activeQueueItem.verificationStatus}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={closeCustomerModal}
                className="text-white/70 hover:text-white text-xl font-bold p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
              {/* SUCCESS BANNER & NEXT CUSTOMER WORKFLOW (Rule F) */}
              {processingSuccessInfo && (
                <div className="bg-emerald-50 border-2 border-emerald-400 rounded-2xl p-5 text-center space-y-3 animate-fadeIn">
                  <div className="w-12 h-12 bg-emerald-500 text-white rounded-full flex items-center justify-center mx-auto shadow-md shadow-emerald-200">
                    <Check className="w-7 h-7 stroke-[3]" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-emerald-900">
                      {processingSuccessInfo.message}
                    </h4>
                    {processingSuccessInfo.duplicateWarning && (
                      <p className="text-xs text-amber-700 mt-1 font-semibold">
                        {processingSuccessInfo.duplicateWarning}
                      </p>
                    )}
                  </div>

                  <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
                    {/* NEXT CUSTOMER BUTTON (Rule F) */}
                    <button
                      onClick={handleOpenNextCustomer}
                      className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-sm font-bold rounded-xl shadow-lg shadow-blue-900/20 transition-all flex items-center gap-2"
                    >
                      <span>NEXT CUSTOMER → (पुढील कामगार)</span>
                    </button>

                    <button
                      onClick={() => {
                        setActiveQueueItem(null);
                        setWorkerHistory(null);
                        setProcessingSuccessInfo(null);
                      }}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl"
                    >
                      रांगेत परत जा (Back to Queue)
                    </button>
                  </div>
                </div>
              )}

              {/* COMPARISON: EXCEL DATA vs EXISTING DATA (Rule 3) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. EXCEL DATA */}
                <div className="bg-blue-50/60 border border-blue-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-blue-200">
                    <h4 className="text-xs font-bold text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
                      <FileSpreadsheet className="w-4 h-4 text-blue-600" />
                      EXCEL DATA
                    </h4>
                    <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-semibold">
                      आयात माहिती
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div>
                      <span className="text-slate-500 block text-[11px]">Name (कामगार नाव):</span>
                      <span className="font-bold text-slate-800 text-sm">{activeQueueItem.workerName}</span>
                    </div>

                    <div>
                      <span className="text-slate-500 block text-[11px]">MH Number (नोंदणी क्रमांक):</span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="font-mono font-bold text-blue-900 bg-white px-2.5 py-1 rounded border border-blue-200">
                          {activeQueueItem.mhNumber}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyMh(activeQueueItem)}
                          className="p-1 text-slate-500 hover:text-blue-600 hover:bg-white rounded border border-slate-200 transition-all flex items-center gap-1 text-[11px]"
                          title="MH क्रमांक कॉपी करा"
                        >
                          {copiedId === activeQueueItem.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          <span>Copy</span>
                        </button>
                      </div>
                    </div>

                    <div>
                      <span className="text-slate-500 block text-[11px]">Mobile Number (मोबाईल):</span>
                      <span className="font-semibold text-slate-800">
                        {activeQueueItem.mobileNumber || 'मोबाईल नोंद नाही'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* 2. EXISTING DATA */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                      <UserCheck className="w-4 h-4 text-emerald-600" />
                      EXISTING DATA
                    </h4>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                        activeQueueItem.existingInRenewals || activeQueueItem.existingInRegistrations
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-slate-200 text-slate-700'
                      }`}
                    >
                      {activeQueueItem.databaseMatchInfo || 'नवीन कामगार'}
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div>
                      <span className="text-slate-500 block text-[11px]">Name (कार्यालय नाव):</span>
                      <span className="font-bold text-slate-800">
                        {workerHistory?.registrationDetails?.workerName ||
                          (activeQueueItem.existingInRenewals || activeQueueItem.existingInRegistrations
                            ? activeQueueItem.workerName
                            : 'डेटाबेसमध्ये नोंद नाही')}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-slate-500 block text-[11px]">MH Number:</span>
                        <span className="font-mono font-bold text-blue-900">
                          {activeQueueItem.mhNumber}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[11px]">Aadhaar:</span>
                        <span className="font-mono text-slate-700">
                          {workerHistory?.registrationDetails?.aadhaarNumber || '-'}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-slate-500 block text-[11px]">Mobile:</span>
                        <span className="font-medium text-slate-700">
                          {activeQueueItem.mobileNumber || '-'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[11px]">Current Status:</span>
                        <span className="font-bold text-emerald-700">
                          {workerHistory?.registrationDetails?.status || activeQueueItem.registrationStatus || 'ACTIVE'}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-200/60">
                      <div>
                        <span className="text-slate-500 block text-[11px]">Last Renewal Date:</span>
                        <span className="font-semibold text-slate-800">
                          {activeQueueItem.lastRenewalDate || workerHistory?.previousRenewals?.[0]?.renewalDate || '-'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[11px]">Next Renewal Date:</span>
                        <span className="font-semibold text-blue-700">
                          {activeQueueItem.nextRenewalYear || '-'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* SAFE MATCHING MISMATCH NOTICE (Rule 15) */}
              {workerHistory?.registrationDetails?.workerName &&
                activeQueueItem.workerName.trim().toLowerCase() !==
                  workerHistory.registrationDetails.workerName.trim().toLowerCase() && (
                  <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 flex items-start gap-2.5 text-xs text-amber-900">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">नावात तफावत आढळली (Name Mismatch Warning):</p>
                      <p>
                        MH क्रमांक जुळला आहे, परंतु Excel मधील नाव (<strong className="text-slate-900">{activeQueueItem.workerName}</strong>) आणि कार्यालय रेकॉर्डमधील नाव (<strong className="text-slate-900">{workerHistory.registrationDetails.workerName}</strong>) भिन्न दिसत आहे. कृपया पोर्टलवर खात्री करा.
                      </p>
                    </div>
                  </div>
                )}

              {/* OFFICIAL PORTAL ACTION (Rule 4, 5) */}
              <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-md">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-white/10 rounded-xl">
                    <ExternalLink className="w-5 h-5 text-blue-300" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-blue-200">
                      महामंडळ अधिकृत पोर्टलवर प्रत्यक्ष नूतनीकरण करा
                    </h4>
                    <p className="text-xs text-slate-200 mt-0.5">
                      1. Open Portal → 2. Complete Actual Renewal → 3. Return & Click 'RENEWED'
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleOpenPortal(activeQueueItem.mhNumber)}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold rounded-lg shadow-md transition-all flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>[ 🔗 Open Portal ]</span>
                </button>
              </div>

              {/* DUPLICATE RENEWAL PROTECTION WARNING (Rule D) */}
              {workerHistory?.isDuplicateForTargetYear && (
                <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-900 space-y-1">
                    <p className="font-bold text-sm text-amber-800">
                      Renewal already completed for this year.
                    </p>
                    <p>{workerHistory.duplicateWarningMessage}</p>
                    <p className="text-slate-600 text-[11px]">
                      या कामगाराची चालू वर्षाची नूतनीकरण नोंद आधीच अस्तित्वात आहे. पुन्हा duplicate नोंद तयार होणार नाही.
                    </p>
                  </div>
                </div>
              )}

              {/* WORKER RENEWAL HISTORY (Rule C: Show all previous yearly renewals without overwriting) */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <History className="w-4 h-4 text-blue-600" />
                    मागील नूतनीकरण इतिहास (Previous Renewal History)
                  </h4>
                  <span className="text-[11px] text-slate-500 font-semibold">
                    एकूण नोंदी: {workerHistory?.previousRenewals.length || 0}
                  </span>
                </div>

                {isLoadingHistory ? (
                  <div className="py-4 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                    इतिहास लोड होत आहे...
                  </div>
                ) : !workerHistory || workerHistory.previousRenewals.length === 0 ? (
                  <p className="text-xs text-slate-500 py-2 text-center bg-white rounded-lg border border-dashed border-slate-200">
                    कार्यालय डेटाबेसमध्ये आधीचे नूतनीकरण सापडले नाही (नवीन नोंद).
                  </p>
                ) : (
                  <div className="border border-slate-200 rounded-lg overflow-hidden bg-white max-h-48 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 text-slate-700 sticky top-0 font-semibold">
                        <tr>
                          <th className="py-2 px-3">नूतनीकरण वर्ष</th>
                          <th className="py-2 px-3">नूतनीकरण दिनांक</th>
                          <th className="py-2 px-3">मुदत (Valid Till)</th>
                          <th className="py-2 px-3">पावती क्रमांक</th>
                          <th className="py-2 px-3">शुल्क</th>
                          <th className="py-2 px-3">ऑपरेटर</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {workerHistory.previousRenewals.map((rn) => (
                          <tr key={rn.id} className="hover:bg-slate-50">
                            <td className="py-2 px-3 font-bold text-blue-900">{rn.renewalYear || '-'}</td>
                            <td className="py-2 px-3 text-slate-700">{rn.renewalDate || '-'}</td>
                            <td className="py-2 px-3 text-slate-700">{rn.validTill || rn.newExpiryDate || '-'}</td>
                            <td className="py-2 px-3 font-mono text-slate-600">{rn.receiptNumber || '-'}</td>
                            <td className="py-2 px-3 font-semibold text-emerald-700">₹{rn.feeAmount || 50}</td>
                            <td className="py-2 px-3 text-slate-600">{rn.operatorName || rn.createdBy || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* RENEWAL PROCESSING FORM (Rule E) */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  नूतनीकरण तपशील व प्रक्रिया (Renewal Processing Form)
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1">
                      नूतनीकरण आर्थिक वर्ष (Renewal Year):
                    </label>
                    <input
                      type="text"
                      value={formRenewalYear}
                      onChange={(e) => setFormRenewalYear(e.target.value)}
                      placeholder="उदा. 2026-27"
                      className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-bold text-blue-900"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1">
                      पडताळणी दिनांक (Verification Date):
                    </label>
                    <input
                      type="date"
                      value={formVerificationDate}
                      onChange={(e) => setFormVerificationDate(e.target.value)}
                      className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-semibold text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1">
                      नूतनीकरण शुल्क (Fee Amount ₹):
                    </label>
                    <input
                      type="number"
                      value={formRenewalFee}
                      onChange={(e) => setFormRenewalFee(e.target.value)}
                      placeholder="उदा. 50"
                      className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-bold text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-600 block mb-1">
                      पावती क्रमांक (Receipt Number):
                    </label>
                    <input
                      type="text"
                      value={formReceiptNumber}
                      onChange={(e) => setFormReceiptNumber(e.target.value)}
                      className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-slate-700"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="text-xs font-semibold text-slate-600 block mb-1">
                      तालुका (Verification Taluka):
                    </label>
                    <select
                      value={formTaluka}
                      onChange={(e) => setFormTaluka(e.target.value)}
                      className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-semibold text-slate-800"
                    >
                      <option value="">तालुका निवडा (Select Taluka)</option>
                      {talukaDropdownOptions.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">
                    ऑपरेटर शेरा / टिप्पणी (Operator Notes / Remarks):
                  </label>
                  <textarea
                    rows={2}
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="उदा. महामंडळ पोर्टलवर नूतनीकरण पावती तयार केली, ग्राहक पडताळणी पूर्ण..."
                    className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-slate-700"
                  />
                </div>
              </div>

              {/* ACTION BUTTONS (Rule E, I) */}
              <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100">
                {/* Shortcuts */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleOpenPortal(activeQueueItem.mhNumber)}
                    className="px-3 py-2 bg-slate-100 hover:bg-blue-50 text-blue-700 border border-slate-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>पोर्टल उघडा</span>
                  </button>

                  <button
                    onClick={() => handleSendWhatsApp(activeQueueItem)}
                    className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>WhatsApp</span>
                  </button>
                </div>

                {/* Status Trigger Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  {/* Delete from Queue */}
                  <button
                    type="button"
                    onClick={() => setItemToDelete(activeQueueItem)}
                    disabled={Boolean(actionLoadingId)}
                    className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 rounded-xl text-xs font-semibold transition-all flex items-center gap-1"
                    title="ही नोंद रांगेतून हटवा"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>नोंद हटवा</span>
                  </button>

                  {/* Skip */}
                  <button
                    onClick={() => handleProcessAction('SKIPPED')}
                    disabled={Boolean(actionLoadingId)}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl text-xs font-semibold transition-all"
                  >
                    वगळा (Skip)
                  </button>

                  {/* Issue / Rejected */}
                  <button
                    onClick={() => handleProcessAction('ISSUE_REJECTED')}
                    disabled={Boolean(actionLoadingId)}
                    className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 rounded-xl text-xs font-semibold transition-all flex items-center gap-1"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>अडचण / नाकारले</span>
                  </button>

                  {/* Call Needed */}
                  <button
                    onClick={() => handleProcessAction('CALL_PENDING')}
                    disabled={Boolean(actionLoadingId)}
                    className="px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-300 rounded-xl text-xs font-semibold transition-all flex items-center gap-1"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>कॉल करणे बाकी</span>
                  </button>

                  {/* Already Renewed (आधीच नूतनीकरण झालेले) */}
                  <button
                    type="button"
                    onClick={() => handleProcessAction('ALREADY_RENEWED')}
                    disabled={Boolean(actionLoadingId)}
                    className="px-3.5 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-300 rounded-xl text-xs font-semibold transition-all flex items-center gap-1 shadow-xs cursor-pointer"
                    title="या कामगाराचे नूतनीकरण आधीच झालेले आहे (Already Renewed)"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-purple-600" />
                    <span>📋 आधीच झालेले (Already Done)</span>
                  </button>

                  {/* RENEWED ACTION (Rule E: Primary action) */}
                  <button
                    onClick={() => handleProcessAction('RENEWED')}
                    disabled={Boolean(actionLoadingId)}
                    className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-900/20 transition-all flex items-center gap-1.5"
                  >
                    {actionLoadingId?.includes('RENEWED') ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>नोंदणी होत आहे...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        <span>✅ RENEWED (नूतनीकरण पूर्ण)</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. AUDIT TRAIL MODAL (Rule T) */}
      {/* ========================================================================= */}
      {isAuditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl my-6 overflow-hidden">
            <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <History className="w-6 h-6 text-amber-400" />
                <div>
                  <h3 className="text-base font-bold">तपासणी रांग ऑडिट ट्रेल (Audit Trail Log)</h3>
                  <p className="text-xs text-slate-300">
                    प्रत्येक स्थिती बदल, ऑपरेटर नाव, तारीख, वेळ आणि शेरा
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAuditModalOpen(false)}
                className="text-white/70 hover:text-white text-xl font-bold p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {isLoadingAudit ? (
                <div className="py-8 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                  ऑडिट लॉग्स लोड होत आहेत...
                </div>
              ) : auditLogs.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">कोणतेही ऑडिट रेकॉर्ड उपलब्ध नाहीत.</p>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">दिनांक व वेळ</th>
                        <th className="py-2.5 px-3">जुनी स्थिती → नवीन स्थिती</th>
                        <th className="py-2.5 px-3">बदलणारा ऑपरेटर</th>
                        <th className="py-2.5 px-3">टिप्पणी (Remarks)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {auditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 text-slate-500 font-mono text-[11px]">
                            {new Date(log.changedAt).toLocaleString('en-IN')}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-slate-800">
                            {log.oldStatus} → {log.newStatus}
                          </td>
                          <td className="py-2.5 px-3 text-slate-700 font-medium">
                            {log.changedByName || log.changedBy}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 text-[11px]">
                            {log.remarks || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. WHATSAPP CONFIGURABLE TEMPLATE MODAL (Rule Q) */}
      {/* ========================================================================= */}
      {isWhatsAppConfigOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-emerald-600" />
                WhatsApp मराठी संदेश साचा (Message Template)
              </h3>
              <button
                onClick={() => setIsWhatsAppConfigOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-slate-500">
                कामगाराला पाठवण्यात येणारा नूतनीकरण आठवण संदेश खालीलप्रमाणे सेट करू शकता. व्हेरिएबल्स: <code className="bg-slate-100 px-1 py-0.5 rounded">{'{workerName}'}</code>, <code className="bg-slate-100 px-1 py-0.5 rounded">{'{mhNumber}'}</code>, <code className="bg-slate-100 px-1 py-0.5 rounded">{'{mobileNumber}'}</code>
              </p>

              <textarea
                rows={9}
                value={whatsAppTemplate}
                onChange={(e) => setWhatsAppTemplate(e.target.value)}
                className="w-full text-xs font-mono p-3 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 text-slate-800"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setIsWhatsAppConfigOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl"
              >
                रद्द करा
              </button>
              <button
                onClick={() => {
                  localStorage.setItem('om_eseva_renewal_wa_template', whatsAppTemplate);
                  showToast('✅ WhatsApp मेसेज साचा सेव्ह केला गेला.');
                  setIsWhatsAppConfigOpen(false);
                }}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-md shadow-emerald-900/20"
              >
                साचा जतन करा (Save Template)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 5. DELETE SINGLE QUEUE ITEM CONFIRMATION MODAL */}
      {/* ========================================================================= */}
      {itemToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-600 pb-3 border-b border-slate-100">
              <div className="p-2.5 bg-rose-100 rounded-xl">
                <Trash2 className="w-6 h-6 text-rose-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">नोंद रांगेतून हटवायची आहे का?</h3>
                <p className="text-xs text-slate-500">Delete Queue Item Confirmation</p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">कामगार नाव:</span>
                <span className="font-bold text-slate-800">{itemToDelete.workerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">MH नोंदणी क्रमांक:</span>
                <span className="font-mono font-bold text-blue-900">{itemToDelete.mhNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">मोबाईल:</span>
                <span className="text-slate-700">{itemToDelete.mobileNumber || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">सध्याची स्थिती:</span>
                <span className="font-semibold text-slate-700">{itemToDelete.verificationStatus}</span>
              </div>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-800">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p>
                <strong>डेटा सुरक्षा नियम (Rule N):</strong> यामुळे मुख्य कामगार नोंदणी किंवा मागील नूतनीकरण डेटाबेस नष्ट होणार नाही. फक्त ही एक्सेल तपासणी रांगेतून काढली जाईल.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setItemToDelete(null)}
                disabled={Boolean(actionLoadingId)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-all"
              >
                रद्द करा (Cancel)
              </button>
              <button
                type="button"
                onClick={() => handleDeleteQueueItem(itemToDelete)}
                disabled={Boolean(actionLoadingId)}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shadow-md shadow-rose-950/20 transition-all flex items-center gap-1.5"
              >
                {actionLoadingId === `delete_${itemToDelete.id}` ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>हटवत आहे...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>होय, नोंद हटवा</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 6. BULK DELETE QUEUE ITEMS CONFIRMATION MODAL */}
      {/* ========================================================================= */}
      {isBulkDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-600 pb-3 border-b border-slate-100">
              <div className="p-2.5 bg-rose-100 rounded-xl">
                <Trash2 className="w-6 h-6 text-rose-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {selectedItemIds.size} नोंदी रांगेतून हटवायच्या आहेत का?
                </h3>
                <p className="text-xs text-slate-500">Bulk Delete Confirmation</p>
              </div>
            </div>

            <p className="text-xs text-slate-600">
              तुम्ही निवडलेल्या <strong className="text-slate-900">{selectedItemIds.size}</strong> नोंदी या तपासणी रांगेतून कायमच्या काढून टाकल्या जातील.
            </p>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-800">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p>
                <strong>डेटा सुरक्षा नियम (Rule N):</strong> यामुळे कार्यालयातील मुख्य कामगार नोंदणी किंवा नूतनीकरण डेटाबेसमधील मूळ रेकॉर्ड्स नष्ट होणार नाहीत.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsBulkDeleteModalOpen(false)}
                disabled={Boolean(actionLoadingId)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-all"
              >
                रद्द करा (Cancel)
              </button>
              <button
                type="button"
                onClick={handleDeleteBulkConfirmed}
                disabled={Boolean(actionLoadingId)}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shadow-md shadow-rose-950/20 transition-all flex items-center gap-1.5"
              >
                {actionLoadingId === 'delete_bulk' ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>हटवत आहे...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>होय, सर्व {selectedItemIds.size} नोंदी हटवा</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 7. DELETE BATCH CONFIRMATION MODAL */}
      {/* ========================================================================= */}
      {isBatchDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-600 pb-3 border-b border-slate-100">
              <div className="p-2.5 bg-rose-100 rounded-xl">
                <Trash2 className="w-6 h-6 text-rose-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">संपूर्ण बॅच हटवायची आहे का?</h3>
                <p className="text-xs text-slate-500">Delete Entire Batch</p>
              </div>
            </div>

            <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">बॅच क्रमांक:</span>
                <span className="font-mono font-bold text-blue-900">
                  {batchToDelete?.batchId || selectedBatchId}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">फाईलचे नाव:</span>
                <span className="font-medium text-slate-800 truncate max-w-[200px]">
                  {batchToDelete?.filename || 'Current Batch'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">एकूण नोंदी:</span>
                <span className="font-bold text-slate-800">
                  {batchToDelete?.totalRecords || stats.total}
                </span>
              </div>
            </div>

            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-800">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <p>
                <strong>सावधान:</strong> या बॅचमधील सर्व तपासणी रांग नोंदी कायमच्या हटवल्या जातील. मुख्य नोंदणी डेटाबेस किंवा आधीच पूर्ण झालेले नूतनीकरण सुरक्षित राहील.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsBatchDeleteModalOpen(false);
                  setBatchToDelete(null);
                }}
                disabled={Boolean(actionLoadingId)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-all"
              >
                रद्द करा (Cancel)
              </button>
              <button
                type="button"
                onClick={handleDeleteBatchConfirmed}
                disabled={Boolean(actionLoadingId)}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl shadow-md shadow-rose-950/20 transition-all flex items-center gap-1.5"
              >
                {actionLoadingId === 'delete_batch' ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>बॅच हटवत आहे...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>होय, संपूर्ण बॅच हटवा</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 8. BULK ASSIGN TO OPERATOR MODAL */}
      {/* ========================================================================= */}
      {isAssignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6 space-y-4">
            <div className="flex items-center gap-3 text-blue-600 pb-3 border-b border-slate-100">
              <div className="p-2.5 bg-blue-100 rounded-xl">
                <UserCheck className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">ऑपरेटर नियुक्त करा</h3>
                <p className="text-xs text-slate-500">Assign Selected Items to Operator</p>
              </div>
            </div>

            <p className="text-xs text-slate-600">
              निवडलेल्या <strong className="text-slate-900">{selectedItemIds.size}</strong> नोंदी खालील ऑपरेटरकडे सोपवा:
            </p>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                ऑपरेटर निवडा:
              </label>
              <select
                value={targetOperatorId}
                onChange={(e) => setTargetOperatorId(e.target.value)}
                className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-medium text-slate-800 focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- ऑपरेटर निवडा --</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role}) - {u.username}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsAssignModalOpen(false);
                  setTargetOperatorId('');
                }}
                disabled={Boolean(actionLoadingId)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl"
              >
                रद्द करा
              </button>
              <button
                type="button"
                onClick={handleBulkAssignConfirmed}
                disabled={Boolean(actionLoadingId) || !targetOperatorId}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-1.5"
              >
                {actionLoadingId === 'assign_bulk' ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>नियुक्त करत आहे...</span>
                  </>
                ) : (
                  <>
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>नियुक्त करा</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 9. MANAGE ALL BATCHES MODAL (Rule K) */}
      {/* ========================================================================= */}
      {isBatchManageModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="bg-gradient-to-r from-slate-900 to-blue-900 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="w-6 h-6 text-blue-300" />
                <div>
                  <h3 className="text-base font-bold">सर्व बॅचेस व्यवस्थापन (Manage All Batches)</h3>
                  <p className="text-xs text-blue-200">
                    पूर्वी आयात केलेल्या सर्व बॅचेस, रेकॉर्ड संख्या आणि बॅच डिलीट पर्याय
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsBatchManageModalOpen(false)}
                className="text-white/70 hover:text-white text-xl font-bold p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              {batches.length === 0 ? (
                <p className="text-center text-slate-500 py-8 text-xs">कोणतीही बॅच उपलब्ध नाही.</p>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-700 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3">बॅच आयडी</th>
                        <th className="py-2.5 px-3">फाईलचे नाव</th>
                        <th className="py-2.5 px-3">एकूण नोंदी</th>
                        <th className="py-2.5 px-3">आयात दिनांक</th>
                        <th className="py-2.5 px-3 text-center">कृती (Actions)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {batches.map((b) => (
                        <tr
                          key={b.batchId}
                          className={`hover:bg-blue-50/50 transition-colors ${
                            b.batchId === selectedBatchId ? 'bg-blue-50/60 font-semibold' : ''
                          }`}
                        >
                          <td className="py-2.5 px-3 font-mono text-blue-900 font-bold">
                            {b.batchId}
                            {b.batchId === selectedBatchId && (
                              <span className="ml-2 text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded-full font-normal">
                                सक्रिय (Active)
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-slate-800 truncate max-w-[200px]">
                            {b.filename}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-slate-700">
                            {b.totalRecords}
                          </td>
                          <td className="py-2.5 px-3 text-slate-500">
                            {b.createdAt ? new Date(b.createdAt).toLocaleDateString('en-IN') : '-'}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {b.batchId !== selectedBatchId && (
                                <button
                                  onClick={() => {
                                    setSelectedBatchId(b.batchId);
                                    setIsBatchManageModalOpen(false);
                                  }}
                                  className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold"
                                >
                                  उघडा
                                </button>
                              )}
                              {currentUser?.role === 'admin' && (
                                <button
                                  onClick={() => {
                                    setBatchToDelete(b);
                                    setIsBatchDeleteModalOpen(true);
                                  }}
                                  className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-lg text-xs font-semibold"
                                  title="बॅच हटवा"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setIsBatchManageModalOpen(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold rounded-xl"
              >
                बंद करा
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
