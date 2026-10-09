import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  MessageCircle,
  CheckCircle2,
  Clock,
  Search,
  Download,
  Upload,
  FileSpreadsheet,
  AlertCircle,
  RefreshCw,
  UserCheck,
  ChevronLeft,
  ChevronRight,
  X,
  Send,
  Users,
  ShieldCheck,
  PhoneOff,
  MessageSquareOff,
  Edit3,
  RotateCcw,
  Check,
  Info,
  HelpCircle,
  FileText,
  Trash2,
} from 'lucide-react';
import { WhatsappGroupTrackingRecord, User, WhatsappGroupStatus } from '../types';
import * as XLSX from 'xlsx';
import { TableSlideControls } from './TableSlideControls';
import { LoadingAnimation } from './LoadingAnimation';

interface WhatsappGroupPendingModuleProps {
  currentUser?: User | null;
  onRefreshData?: () => void;
}

export const WhatsappGroupPendingModule: React.FC<WhatsappGroupPendingModuleProps> = ({
  currentUser,
}) => {
  const [records, setRecords] = useState<WhatsappGroupTrackingRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSourceType, setSelectedSourceType] = useState<string>(''); // '' | 'Registration' | 'Renewal'
  const [statusFilter, setStatusFilter] = useState<WhatsappGroupStatus | 'All'>('Pending');

  // Modal State for Updating Status (Added / No WhatsApp / Pending)
  const [selectedRecordForModal, setSelectedRecordForModal] = useState<WhatsappGroupTrackingRecord | null>(null);
  const [modalTargetStatus, setModalTargetStatus] = useState<WhatsappGroupStatus>('Added');
  const [modalRemark, setModalRemark] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Delete Modals & Batch Selection State
  const [recordToDelete, setRecordToDelete] = useState<WhatsappGroupTrackingRecord | null>(null);
  const [selectedMhsForBatch, setSelectedMhsForBatch] = useState<Set<string>>(new Set());
  const [isBatchDeleteModalOpen, setIsBatchDeleteModalOpen] = useState<boolean>(false);

  // In-App Toast State
  const [toast, setToast] = useState<{
    type: 'success' | 'error' | 'info';
    title: string;
    message?: string;
  } | null>(null);

  const showToast = (type: 'success' | 'error' | 'info', title: string, message?: string) => {
    setToast({ type, title, message });
    setTimeout(() => {
      setToast((curr) => (curr?.title === title ? null : curr));
    }, 5500);
  };

  // Excel Import State
  const [isImportModalOpen, setIsImportModalOpen] = useState<boolean>(false);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [importFileName, setImportFileName] = useState<string>('');
  const [importPreviewRows, setImportPreviewRows] = useState<Array<{
    workerName: string;
    mhNumber: string;
    mobileNumber: string;
    taluka?: string;
    excelStatus?: string;
    status: WhatsappGroupStatus;
    remark?: string;
    isValidMh: boolean;
    isDuplicateInFile?: boolean;
    isAlreadyAdded?: boolean;
  }>>([]);
  const [importStatusMode, setImportStatusMode] = useState<'Pending' | 'Added' | 'No WhatsApp'>('Pending');
  const [importCustomRemark, setImportCustomRemark] = useState<string>('Imported via Excel (Pending Verification)');
  const [previewSearch, setPreviewSearch] = useState<string>('');
  const [importSummary, setImportSummary] = useState<{
    total: number;
    valid: number;
    invalid: number;
    duplicates: number;
    alreadyAdded: number;
    readyToImport: number;
  } | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Horizontal scroll ref
  const tableContainerRef = useRef<HTMLDivElement>(null);

  const fetchRecords = async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (currentUser) {
        headers['x-user-id'] = currentUser.id;
        headers['x-user-username'] = currentUser.username;
        headers['x-user-role'] = currentUser.role;
      }

      const res = await fetch('/api/whatsapp-group-trackings', { headers });
      if (!res.ok) {
        throw new Error('Failed to fetch WhatsApp group tracking records');
      }
      const data = await res.json();
      if (Array.isArray(data)) {
        setRecords(data);
      }
    } catch (err: any) {
      console.error('Error loading WhatsApp group trackings:', err);
      setError(err?.message || 'Failed to load records');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, [currentUser]);

  // Summary Counts
  const stats = useMemo(() => {
    const total = records.length;
    const pending = records.filter((r) => r.status === 'Pending').length;
    const added = records.filter((r) => r.status === 'Added').length;
    const noWhatsapp = records.filter((r) => r.status === 'No WhatsApp').length;
    const newRegPending = records.filter((r) => r.status === 'Pending' && r.sourceType === 'Registration').length;
    const renewalPending = records.filter((r) => r.status === 'Pending' && r.sourceType === 'Renewal').length;

    return { total, pending, added, noWhatsapp, newRegPending, renewalPending };
  }, [records]);

  // Filtered Records
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      // 1. Status Filter
      if (statusFilter !== 'All' && r.status !== statusFilter) {
        return false;
      }

      // 2. Source Type Filter
      if (selectedSourceType && r.sourceType !== selectedSourceType) {
        return false;
      }

      // 3. Search Query (Name, MH Number, Mobile Number, Remark)
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const nameMatch = r.workerName?.toLowerCase().includes(q);
        const mhMatch = r.mhNumber?.toLowerCase().includes(q);
        const mobileMatch = r.mobileNumber?.toLowerCase().includes(q);
        const remarkMatch = r.remark?.toLowerCase().includes(q);
        return nameMatch || mhMatch || mobileMatch || remarkMatch;
      }

      return true;
    });
  }, [records, statusFilter, selectedSourceType, searchQuery]);

  // Open Modal for status update
  const handleOpenStatusModal = (record: WhatsappGroupTrackingRecord, initialStatus: WhatsappGroupStatus = 'Added') => {
    setSelectedRecordForModal(record);
    setModalTargetStatus(initialStatus);
    setModalRemark(record.remark || (initialStatus === 'No WhatsApp' ? 'नंबर व्हॉट्सअ‍ॅपवर नाही (No WhatsApp)' : ''));
  };

  // Submit Status Update
  const handleSaveStatus = async (statusToSet?: WhatsappGroupStatus) => {
    if (!selectedRecordForModal) return;
    const targetStatus = statusToSet || modalTargetStatus;
    setIsSubmitting(true);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (currentUser) {
        headers['x-user-id'] = currentUser.id;
        headers['x-user-username'] = currentUser.username;
        headers['x-user-role'] = currentUser.role;
      }

      const res = await fetch(`/api/whatsapp-group-trackings/${encodeURIComponent(selectedRecordForModal.mhNumber)}/status`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          status: targetStatus,
          remark: modalRemark.trim(),
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to update WhatsApp group status');
      }

      const updatedRecord = await res.json();

      // Optimistic local state update
      setRecords((prev) =>
        prev.map((r) => (r.mhNumber === updatedRecord.mhNumber ? updatedRecord : r))
      );

      showToast(
        'success',
        'स्थिती अद्ययावत झाली (Status Updated)',
        `कामगार "${selectedRecordForModal.workerName}" ची स्थिती '${targetStatus}' म्हणून सेव्ह केली.`
      );

      // Close modal & reset
      setSelectedRecordForModal(null);
      setModalRemark('');
    } catch (err: any) {
      showToast('error', 'स्थिती अद्ययावत करताना त्रुटी आली', err.message || 'An error occurred while updating status.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Export to Excel
  const handleExportExcel = () => {
    const exportData = filteredRecords.map((r, index) => ({
      'Sr No': index + 1,
      'Name': r.workerName,
      'MH_Number': r.mhNumber,
      'Mobile_Number': r.mobileNumber || '-',
      'Source Type': r.sourceType === 'Registration' ? 'New Registration' : 'Renewal',
      'WhatsApp Group Status': r.status,
      'Updated Date': r.addedDate || '-',
      'Updated By': r.addedBy || '-',
      'Remark': r.remark || '-',
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'WhatsApp Group Tracking');
    
    const fileName = `WhatsApp_Group_${statusFilter}_List_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  // Download Sample Template for Import
  const handleDownloadSampleExcel = () => {
    const sampleRows = [
      {
        Name: 'SAVITA DIPAK WAYAL',
        MH_Number: 'MH131090014303',
        Mobile_Number: '7709904845',
        Status: 'Added',
        Remark: 'MH-09 WhatsApp Group',
      },
      {
        Name: 'RAMESH SURESH NLAWADE',
        MH_Number: 'MH131650028441',
        Mobile_Number: '9890643729',
        Status: 'Added',
        Remark: 'Joined WhatsApp Group',
      },
      {
        Name: 'SHOBHA SHANKAR SHINDE',
        MH_Number: 'MH131080022637',
        Mobile_Number: '9404325072',
        Status: 'Pending',
        Remark: '',
      },
      {
        Name: 'MANGESH BHAGUJI OZAEKAR',
        MH_Number: 'MH131080021768',
        Mobile_Number: '8446782080',
        Status: 'No WhatsApp',
        Remark: 'साधा फोन / Keypad Phone',
      },
      {
        Name: 'dilip pandurang padwal',
        MH_Number: 'MH131080000660',
        Mobile_Number: '7397801221',
        Status: 'Added',
        Remark: 'Joined WhatsApp Group',
      },
    ];

    const ws = XLSX.utils.json_to_sheet(sampleRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'WhatsApp_Group_Workers');
    XLSX.writeFile(wb, 'WhatsApp_Group_Import_Format_Sample.xlsx');
  };

  // Parse Uploaded Excel or CSV File
  const parseExcelFile = (file: File) => {
    if (!file) return;

    setImportFileName(file.name);
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawJson: any[] = XLSX.utils.sheet_to_json(worksheet);

        if (!rawJson || rawJson.length === 0) {
          showToast('error', 'रिकामी फाईल (Empty File)', 'निवडलेल्या एक्सेल फाईलमध्ये कोणताही डेटा आढळला नाही.');
          return;
        }

        const parsedRows: Array<{
          workerName: string;
          mhNumber: string;
          mobileNumber: string;
          taluka?: string;
          excelStatus?: string;
          status: WhatsappGroupStatus;
          remark?: string;
          isValidMh: boolean;
          isDuplicateInFile?: boolean;
          isAlreadyAdded?: boolean;
        }> = [];

        const seenMh = new Set<string>();
        let validCount = 0;
        let invalidCount = 0;
        let duplicateCount = 0;
        let alreadyAddedCount = 0;

        rawJson.forEach((row: any) => {
          const keys = Object.keys(row);
          const findVal = (possibleHeaders: string[]): string => {
            for (const h of possibleHeaders) {
              const cleanH = h.toLowerCase().replace(/[^a-z0-9]/g, '');
              const matchedKey = keys.find(
                (k) => k.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanH
              );
              if (matchedKey && row[matchedKey] !== undefined && row[matchedKey] !== null) {
                return String(row[matchedKey]).trim();
              }
            }
            return '';
          };

          const name = findVal(['name', 'workername', 'fullname', 'kamgarnav', 'kamgar_nav', 'kamgar', 'कामगाराचेनाव', 'नाव', 'beneficiaryname', 'worker']);
          const rawMh = findVal(['mhnumber', 'mh_number', 'mhno', 'mh_no', 'registrationno', 'registration_no', 'regno', 'reg_no', 'नोंदणीक्रमांक', 'एमएचनंबर', 'mh']);
          const rawMobile = findVal(['mobilenumber', 'mobile_number', 'mobileno', 'mobile_no', 'phone', 'contact', 'मोबाईलनंबर', 'मोबाईल', 'phone_number', 'contact_no', 'mobile']);
          const rawTaluka = findVal(['taluka', 'taluk', 'तालुका', 'block']);
          const statusCol = findVal(['status', 'whatsappstatus', 'whatsapp_status', 'groupstatus', 'group_status', 'whatsapp', 'स्थिती', 'स्टेटस']).toLowerCase();
          const remarkCol = findVal(['remark', 'remarks', 'शेरा', 'रिमार्क', 'note']);

          // Clean MH Number: uppercase, remove all internal spaces
          const mhNumber = rawMh.replace(/\s+/g, '').toUpperCase();
          const isValidMh = Boolean(mhNumber && mhNumber.length >= 6 && !mhNumber.startsWith('PENDING'));

          // Clean Mobile: digits only, take last 10 digits
          const cleanDigits = rawMobile.replace(/\D/g, '');
          const mobile = cleanDigits.length > 10 ? cleanDigits.slice(-10) : cleanDigits;

          // Check if this worker or phone is ALREADY in 'Added' status in existing records
          const isAlreadyAdded = records.some((existing) => {
            if (existing.status !== 'Added') return false;
            const matchMh = isValidMh && existing.mhNumber && existing.mhNumber.toUpperCase() === mhNumber;
            const matchMobile = Boolean(mobile && mobile.length >= 10 && existing.mobileNumber && existing.mobileNumber.slice(-10) === mobile);
            return matchMh || matchMobile;
          });

          if (isAlreadyAdded) {
            alreadyAddedCount++;
          }

          let isDuplicate = false;
          if (isValidMh) {
            if (seenMh.has(mhNumber)) {
              isDuplicate = true;
              duplicateCount++;
            } else {
              seenMh.add(mhNumber);
            }
            validCount++;
          } else {
            invalidCount++;
          }

          parsedRows.push({
            workerName: name || (isValidMh ? 'Worker' : '-'),
            mhNumber: mhNumber,
            mobileNumber: mobile,
            taluka: rawTaluka || '',
            excelStatus: statusCol || undefined,
            status: isAlreadyAdded ? 'Added' : 'Pending', // Put into Pending for manual check if not already added
            remark: remarkCol || undefined,
            isValidMh,
            isDuplicateInFile: isDuplicate,
            isAlreadyAdded,
          });
        });

        setImportPreviewRows(parsedRows);
        setImportSummary({
          total: rawJson.length,
          valid: validCount,
          invalid: invalidCount,
          duplicates: duplicateCount,
          alreadyAdded: alreadyAddedCount,
          readyToImport: Math.max(0, validCount - alreadyAddedCount),
        });
        setIsImportModalOpen(true);
      } catch (err: any) {
        console.error('Error reading Excel file:', err);
        showToast('error', 'फाईल वाचताना त्रुटी (File Error)', 'एक्सेल फाईल वाचताना त्रुटी आली. कृपया योग्य फॉरमॅटमधील फाईल निवडा.');
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };

    reader.readAsArrayBuffer(file);
  };

  // Parse Uploaded Excel File event
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseExcelFile(file);
  };

  // Submit Bulk Import to Server - Put into Pending, Skip already added!
  const handleExecuteImport = async () => {
    const rowsToImport = importPreviewRows.filter((r) => r.isValidMh && !r.isAlreadyAdded);
    if (rowsToImport.length === 0) {
      if ((importSummary?.alreadyAdded || 0) > 0) {
        showToast(
          'info',
          'सर्व नंबर आधीच जोडलेले आहेत',
          `या फाईलमधील सर्व (${importSummary?.alreadyAdded}) नंबर आधीच ग्रुपमध्ये जोडलेले (Added) आहेत. त्यामुळे नवीन नोंद आयात करण्याची आवश्यकता नाही.`
        );
      } else {
        showToast('error', 'नोंदी सापडल्या नाहीत', 'आयात करण्यासाठी एकही वैध MH क्रमांक सापडला नाही.');
      }
      return;
    }

    setIsImporting(true);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (currentUser) {
        headers['x-user-id'] = currentUser.id;
        headers['x-user-username'] = currentUser.username;
        headers['x-user-role'] = currentUser.role;
      }

      const payloadItems = rowsToImport.map((r) => {
        const finalRemark = r.remark || importCustomRemark.trim() || 'Imported via Excel (Pending Verification)';

        return {
          workerName: r.workerName,
          mhNumber: r.mhNumber,
          mobileNumber: r.mobileNumber,
          taluka: r.taluka || '',
          status: 'Pending', // Put in Pending so manual check can happen!
          remark: finalRemark,
          addedBy: currentUser?.username || 'Operator',
        };
      });

      const res = await fetch('/api/whatsapp-group-trackings/bulk-import', {
        method: 'POST',
        headers,
        body: JSON.stringify({ items: payloadItems }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to import WhatsApp records');
      }

      const result = await res.json();
      const alreadyAddedTotal = result.alreadyAdded || importSummary?.alreadyAdded || 0;
      const alreadyAddedMsg = alreadyAddedTotal > 0
        ? ` (${alreadyAddedTotal} नंबर आधीच जोडलेले असल्याने सुरक्षितपणे वगळले आहेत)`
        : '';

      showToast(
        'success',
        'आयात यशस्वी झाली! (Import Successful)',
        `एकूण ${result.inserted + result.updated} नोंदी मॅन्युअल पडताळणीसाठी 'Pending' मध्ये आयात झाल्या.${alreadyAddedMsg}`
      );

      setIsImportModalOpen(false);
      setImportPreviewRows([]);
      setImportSummary(null);
      setImportFileName('');
      await fetchRecords(true);
    } catch (err: any) {
      console.error('Import submit error:', err);
      showToast('error', 'आयात करताना त्रुटी आली', err.message || 'Error occurred while saving imported records.');
    } finally {
      setIsImporting(false);
    }
  };

  // Open single delete confirmation modal
  const handleDeleteRecord = (record: WhatsappGroupTrackingRecord) => {
    setRecordToDelete(record);
  };

  // Confirm Single Delete Execution
  const handleConfirmDeleteSingle = async () => {
    if (!recordToDelete) return;

    setIsDeleting(true);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (currentUser) {
        headers['x-user-id'] = currentUser.id;
        headers['x-user-username'] = currentUser.username;
        headers['x-user-role'] = currentUser.role;
      }

      const res = await fetch(`/api/whatsapp-group-trackings/${encodeURIComponent(recordToDelete.mhNumber)}`, {
        method: 'DELETE',
        headers,
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to delete WhatsApp record');
      }

      // Optimistically remove from state
      setRecords((prev) => prev.filter((r) => r.mhNumber !== recordToDelete.mhNumber));
      setSelectedMhsForBatch((prev) => {
        const next = new Set(prev);
        next.delete(recordToDelete.mhNumber);
        return next;
      });

      if (selectedRecordForModal?.mhNumber === recordToDelete.mhNumber) {
        setSelectedRecordForModal(null);
      }

      showToast(
        'success',
        'नोंद हटवली (Record Deleted)',
        `कामगार "${recordToDelete.workerName}" (MH: ${recordToDelete.mhNumber}) ही नोंद यशस्वीरित्या हटवली.`
      );
      setRecordToDelete(null);
    } catch (err: any) {
      console.error('Delete error:', err);
      showToast('error', 'हटवताना त्रुटी आली', err?.message || 'Error occurred while deleting record');
    } finally {
      setIsDeleting(false);
    }
  };

  // Confirm Batch Delete Execution
  const handleConfirmBatchDelete = async () => {
    if (selectedMhsForBatch.size === 0) return;

    setIsDeleting(true);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (currentUser) {
        headers['x-user-id'] = currentUser.id;
        headers['x-user-username'] = currentUser.username;
        headers['x-user-role'] = currentUser.role;
      }

      const mhList = Array.from(selectedMhsForBatch);
      const res = await fetch('/api/whatsapp-group-trackings/bulk-delete', {
        method: 'POST',
        headers,
        body: JSON.stringify({ mhNumbers: mhList }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to bulk delete WhatsApp records');
      }

      const result = await res.json();
      const count = result.count || mhList.length;

      setRecords((prev) => prev.filter((r) => !selectedMhsForBatch.has(r.mhNumber)));
      setSelectedMhsForBatch(new Set());
      setIsBatchDeleteModalOpen(false);

      showToast(
        'success',
        'एकत्रित नोंदी हटवल्या (Bulk Deleted)',
        `एकूण ${count} नोंदी व्हॉट्सअ‍ॅप ग्रुप ट्रॅकिंगमधून यशस्वीरित्या हटवण्यात आल्या.`
      );
    } catch (err: any) {
      console.error('Bulk delete error:', err);
      showToast('error', 'एकत्रित हटवताना त्रुटी आली', err?.message || 'Error occurred while deleting records');
    } finally {
      setIsDeleting(false);
    }
  };

  // Selection toggle helpers
  const handleToggleSelectAll = () => {
    if (selectedMhsForBatch.size === filteredRecords.length && filteredRecords.length > 0) {
      setSelectedMhsForBatch(new Set());
    } else {
      setSelectedMhsForBatch(new Set(filteredRecords.map((r) => r.mhNumber)));
    }
  };

  const handleToggleSelectOne = (mhNumber: string) => {
    setSelectedMhsForBatch((prev) => {
      const next = new Set(prev);
      if (next.has(mhNumber)) {
        next.delete(mhNumber);
      } else {
        next.add(mhNumber);
      }
      return next;
    });
  };

  // Data Slide controls
  const handleScrollLeft = () => {
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollBy({ left: -300, behavior: 'smooth' });
    }
  };

  const handleScrollRight = () => {
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollBy({ left: 300, behavior: 'smooth' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Module Header Banner */}
      <div className="bg-gradient-to-r from-emerald-700 via-teal-700 to-emerald-900 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-white/5 skew-x-12 pointer-events-none" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-inner">
              <MessageCircle className="w-8 h-8 text-emerald-200" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-400/30 text-emerald-100 border border-emerald-300/30">
                  Active Workers Only
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-teal-400/30 text-teal-100 border border-teal-300/30">
                  Valid MH Number
                </span>
              </div>
              <h1 className="text-2xl font-black tracking-tight mt-1 text-white">
                WhatsApp Group Tracking (व्हॉट्सअ‍ॅप ग्रुप ट्रॅकिंग)
              </h1>
              <p className="text-xs text-emerald-100 mt-1 max-w-2xl">
                Track and manage WhatsApp Group addition for Active workers. Mark as Group Added or No WhatsApp (नंबर व्हॉट्सअ‍ॅपवर नाही).
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => fetchRecords(true)}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold backdrop-blur-md border border-white/20 transition cursor-pointer"
              title="Refresh Records"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>

            {/* Sample Format Download Button */}
            <button
              onClick={handleDownloadSampleExcel}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-emerald-200 hover:text-white text-xs font-semibold backdrop-blur-md border border-emerald-400/30 transition cursor-pointer"
              title="Download Sample Format Excel (नमुना फॉरमॅट डाऊनलोड करा)"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-300" />
              <span>Sample Format</span>
            </button>

            {/* Import Excel Button */}
            <button
              onClick={() => {
                setIsImportModalOpen(true);
                if (fileInputRef.current) fileInputRef.current.value = '';
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs shadow-lg shadow-amber-950/20 transition cursor-pointer"
              title="Excel Import (एक्सेल आयात)"
            >
              <Upload className="w-4 h-4 text-slate-950" />
              <span>Import Excel</span>
            </button>

            {/* Export Excel Button */}
            <button
              onClick={handleExportExcel}
              disabled={filteredRecords.length === 0}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-950/20 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4" />
              <span>Export Excel</span>
            </button>

            {/* Hidden File Input */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx, .xls, .csv"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Active Workers Eligible */}
        <div
          onClick={() => setStatusFilter('All')}
          className={`p-4 rounded-2xl border transition cursor-pointer ${
            statusFilter === 'All'
              ? 'bg-slate-900 text-white border-slate-900 shadow-md ring-2 ring-slate-700/50'
              : 'bg-white border-slate-200/80 hover:border-slate-300 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-xs font-semibold uppercase tracking-wider ${statusFilter === 'All' ? 'text-slate-300' : 'text-slate-500'}`}>
                Total Active Workers
              </p>
              <h3 className={`text-2xl font-black mt-1 ${statusFilter === 'All' ? 'text-white' : 'text-slate-800'}`}>{stats.total}</h3>
              <p className={`text-[11px] mt-0.5 ${statusFilter === 'All' ? 'text-slate-300' : 'text-slate-400'}`}>With valid MH Number</p>
            </div>
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${statusFilter === 'All' ? 'bg-white/10 text-white' : 'bg-slate-100 text-slate-700'}`}>
              <Users className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* WhatsApp Group Pending */}
        <div
          onClick={() => setStatusFilter('Pending')}
          className={`p-4 rounded-2xl border transition cursor-pointer ${
            statusFilter === 'Pending'
              ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-400/40 shadow-sm'
              : 'bg-white border-slate-200/80 hover:border-amber-200 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider">WhatsApp Pending</p>
              <h3 className="text-2xl font-black text-amber-900 mt-1">{stats.pending}</h3>
              <p className="text-[11px] text-amber-600 mt-0.5">
                New: {stats.newRegPending} • Ren: {stats.renewalPending}
              </p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* WhatsApp Group Added */}
        <div
          onClick={() => setStatusFilter('Added')}
          className={`p-4 rounded-2xl border transition cursor-pointer ${
            statusFilter === 'Added'
              ? 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-400/40 shadow-sm'
              : 'bg-white border-slate-200/80 hover:border-emerald-200 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider">Group Added</p>
              <h3 className="text-2xl font-black text-emerald-900 mt-1">{stats.added}</h3>
              <p className="text-[11px] text-emerald-600 mt-0.5">Joined WhatsApp Group</p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* No WhatsApp Option Card */}
        <div
          onClick={() => setStatusFilter('No WhatsApp')}
          className={`p-4 rounded-2xl border transition cursor-pointer ${
            statusFilter === 'No WhatsApp'
              ? 'bg-rose-50 border-rose-400 ring-2 ring-rose-400/40 shadow-sm'
              : 'bg-white border-slate-200/80 hover:border-rose-200 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-rose-700 uppercase tracking-wider">No WhatsApp</p>
              <h3 className="text-2xl font-black text-rose-900 mt-1">{stats.noWhatsapp}</h3>
              <p className="text-[11px] text-rose-600 mt-0.5">व्हॉट्सअ‍ॅपवर नाही / साधा फोन</p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center">
              <PhoneOff className="w-5 h-5" />
            </div>
          </div>
        </div>
      </div>

      {/* Search, Filter & Segmented Tabs Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm space-y-3">
        {/* Status Segmented Pill Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl w-full sm:w-auto overflow-x-auto">
            <button
              onClick={() => setStatusFilter('Pending')}
              className={`flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition cursor-pointer ${
                statusFilter === 'Pending'
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Pending ({stats.pending})</span>
            </button>
            <button
              onClick={() => setStatusFilter('Added')}
              className={`flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition cursor-pointer ${
                statusFilter === 'Added'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Added ({stats.added})</span>
            </button>
            <button
              onClick={() => setStatusFilter('No WhatsApp')}
              className={`flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition cursor-pointer ${
                statusFilter === 'No WhatsApp'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <PhoneOff className="w-3.5 h-3.5" />
              <span>No WhatsApp ({stats.noWhatsapp})</span>
            </button>
            <button
              onClick={() => setStatusFilter('All')}
              className={`flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition cursor-pointer ${
                statusFilter === 'All'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>All ({stats.total})</span>
            </button>
          </div>

          {/* Data Slide Controls */}
          <div className="flex items-center gap-1.5 ml-auto" title="Table Horizontal Slide">
            <button
              onClick={handleScrollLeft}
              className="classic-slide-btn classic-slide-btn-left text-[11px] py-1 px-2.5"
              title="Slide Left / डावीकडे सरकवा"
            >
              <ChevronLeft className="w-3.5 h-3.5 text-blue-700" />
              <span>◀ Left</span>
            </button>
            <button
              onClick={handleScrollRight}
              className="classic-slide-btn classic-slide-btn-right text-[11px] py-1 px-2.5"
              title="Slide Right / उजवीकडे सरकवा"
            >
              <span>Right ▶</span>
              <ChevronRight className="w-3.5 h-3.5 text-white" />
            </button>
          </div>
        </div>

        {/* Search & Source Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Search Field */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Name, MH Number, Mobile, Remark..."
              className="w-full pl-10 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:bg-white outline-none font-medium placeholder:text-slate-400"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Source Type Filter (Registration / Renewal) */}
          <div>
            <select
              value={selectedSourceType}
              onChange={(e) => setSelectedSourceType(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:bg-white outline-none cursor-pointer font-medium text-slate-700"
            >
              <option value="">All Types (New & Renewal)</option>
              <option value="Registration">New Registration (नवीन नोंदणी)</option>
              <option value="Renewal">Renewal (नूतनीकरण)</option>
            </select>
          </div>

          {/* Clear Filters */}
          <div className="flex items-center justify-end">
            {(searchQuery || selectedSourceType || statusFilter !== 'Pending') && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSelectedSourceType('');
                  setStatusFilter('Pending');
                }}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Filters</span>
              </button>
            )}
          </div>
        </div>

        {/* Active Filters Summary */}
        <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100">
          <div>
            Showing <strong className="text-slate-800">{filteredRecords.length}</strong> workers
            {statusFilter === 'Pending' && <span className="ml-1 text-amber-600 font-semibold">(Pending WhatsApp Group)</span>}
            {statusFilter === 'Added' && <span className="ml-1 text-emerald-600 font-semibold">(Added to WhatsApp Group)</span>}
            {statusFilter === 'No WhatsApp' && <span className="ml-1 text-rose-600 font-semibold">(Not on WhatsApp / व्हॉट्सअ‍ॅपवर नाही)</span>}
          </div>
          <div className="text-[11px] text-slate-400">
            MH Number is the unique identifier • Updates sync automatically
          </div>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-16 text-center">
            <LoadingAnimation
              size="lg"
              color="emerald"
              text="WhatsApp ग्रुप नोंदी लोड होत आहेत..."
              subText="Loading WhatsApp Group records..."
            />
          </div>
        ) : error ? (
          <div className="p-12 text-center space-y-2">
            <p className="text-sm font-semibold text-rose-600">{error}</p>
            <button
              onClick={() => fetchRecords()}
              className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg"
            >
              Try Again
            </button>
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <MessageCircle className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-slate-700">No matching workers found</p>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              No workers match the current filter criteria ({statusFilter}).
            </p>
          </div>
        ) : (
          <>
            <TableSlideControls
              onSlideLeft={handleScrollLeft}
              onSlideRight={handleScrollRight}
              title="↔ Slide Table / माहिती सरकवा"
              subtitle="(डावीकडे / उजवीकडे सरकवण्यासाठी खालील बटने वापरा)"
            />
            {/* Batch Action Toolbar */}
            {selectedMhsForBatch.size > 0 && (
              <div className="bg-rose-50 border-b border-rose-200 px-4 py-2.5 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-rose-900">
                  <span className="w-5 h-5 rounded-full bg-rose-600 text-white flex items-center justify-center text-[10px] font-bold">
                    {selectedMhsForBatch.size}
                  </span>
                  <span>नोंदी निवडल्या आहेत (Records Selected)</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsBatchDeleteModalOpen(true)}
                    className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>निवडलेल्या {selectedMhsForBatch.size} नोंदी हटवा (Delete Selected)</span>
                  </button>
                  <button
                    onClick={() => setSelectedMhsForBatch(new Set())}
                    className="px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 text-xs font-medium rounded-xl border border-slate-200 transition cursor-pointer"
                  >
                    निवड रद्द करा (Clear)
                  </button>
                </div>
              </div>
            )}
            <div
              ref={tableContainerRef}
              className="overflow-x-auto scroll-smooth scrollbar-thin scrollbar-thumb-slate-200"
            >
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200/80 text-slate-500 font-bold uppercase tracking-wider">
                  <th className="py-3.5 px-3 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={filteredRecords.length > 0 && selectedMhsForBatch.size === filteredRecords.length}
                      onChange={handleToggleSelectAll}
                      className="rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer w-4 h-4"
                      title="Select All Records"
                    />
                  </th>
                  <th className="py-3.5 px-3 w-10 text-center">#</th>
                  <th className="py-3.5 px-4 min-w-[180px]">Full Name</th>
                  <th className="py-3.5 px-4 min-w-[140px]">MH Number</th>
                  <th className="py-3.5 px-4 min-w-[120px]">Mobile Number</th>
                  <th className="py-3.5 px-4 min-w-[130px]">Source</th>
                  <th className="py-3.5 px-4 min-w-[170px]">WhatsApp Status</th>
                  <th className="py-3.5 px-4 min-w-[220px] text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRecords.map((r, idx) => (
                  <tr
                    key={r.mhNumber}
                    className={`transition-colors ${
                      selectedMhsForBatch.has(r.mhNumber) ? 'bg-rose-50/40' : 'hover:bg-slate-50/80'
                    }`}
                  >
                    <td className="py-3.5 px-3 text-center">
                      <input
                        type="checkbox"
                        checked={selectedMhsForBatch.has(r.mhNumber)}
                        onChange={() => handleToggleSelectOne(r.mhNumber)}
                        className="rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer w-4 h-4"
                      />
                    </td>
                    <td className="py-3.5 px-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                    
                    {/* Full Name */}
                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs shrink-0">
                          {r.workerName ? r.workerName.charAt(0).toUpperCase() : 'W'}
                        </div>
                        <div>
                          <span className="truncate max-w-[200px] block" title={r.workerName}>
                            {r.workerName}
                          </span>
                          {r.taluka && (
                            <span className="text-[10px] text-slate-400 font-normal">
                              {r.taluka}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* MH Number */}
                    <td className="py-3.5 px-4 font-mono font-bold text-slate-800">
                      <span className="px-2 py-1 bg-slate-100 border border-slate-200 rounded-md text-[11px] text-slate-800">
                        {r.mhNumber}
                      </span>
                    </td>

                    {/* Mobile Number */}
                    <td className="py-3.5 px-4 text-slate-600 font-mono font-medium">
                      {r.mobileNumber ? (
                        <a
                          href={`tel:${r.mobileNumber}`}
                          className="hover:text-emerald-600 underline decoration-slate-300"
                        >
                          {r.mobileNumber}
                        </a>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>

                    {/* Source */}
                    <td className="py-3.5 px-4">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                          r.sourceType === 'Registration'
                            ? 'bg-sky-50 text-sky-700 border-sky-200'
                            : 'bg-purple-50 text-purple-700 border-purple-200'
                        }`}
                      >
                        {r.sourceType === 'Registration' ? 'New Registration' : 'Renewal'}
                      </span>
                    </td>

                    {/* WhatsApp Status Badge */}
                    <td className="py-3.5 px-4">
                      {r.status === 'Added' ? (
                        <div className="space-y-0.5">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Added to Group</span>
                          </span>
                          {r.addedDate && (
                            <p className="text-[10px] text-slate-400 font-medium pl-1">
                              {r.addedDate} {r.addedBy ? `by ${r.addedBy}` : ''}
                            </p>
                          )}
                          {r.remark && (
                            <p className="text-[10px] text-slate-500 italic pl-1 truncate max-w-[160px]" title={r.remark}>
                              "{r.remark}"
                            </p>
                          )}
                        </div>
                      ) : r.status === 'No WhatsApp' ? (
                        <div className="space-y-0.5">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                            <PhoneOff className="w-3.5 h-3.5 text-rose-600" />
                            <span>No WhatsApp (नाही)</span>
                          </span>
                          {r.addedDate && (
                            <p className="text-[10px] text-slate-400 font-medium pl-1">
                              {r.addedDate} {r.addedBy ? `by ${r.addedBy}` : ''}
                            </p>
                          )}
                          {r.remark && (
                            <p className="text-[10px] text-rose-700/80 italic pl-1 truncate max-w-[160px]" title={r.remark}>
                              "{r.remark}"
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                          <Clock className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
                          <span>Pending</span>
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {r.status === 'Pending' ? (
                          <>
                            {/* Add to Group Button */}
                            <button
                              onClick={() => handleOpenStatusModal(r, 'Added')}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer"
                              title="Mark as Added to WhatsApp Group"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>☑ Added</span>
                            </button>

                            {/* No WhatsApp Quick Button */}
                            <button
                              onClick={() => handleOpenStatusModal(r, 'No WhatsApp')}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition cursor-pointer"
                              title="Mark as No WhatsApp / Not on WhatsApp"
                            >
                              <PhoneOff className="w-3.5 h-3.5 text-rose-600" />
                              <span>🚫 No WhatsApp</span>
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => handleOpenStatusModal(r, r.status)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-[11px] font-bold transition cursor-pointer"
                            title="Edit Status / Change Remark"
                          >
                            <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                            <span>Edit Status</span>
                          </button>
                        )}

                        {/* Delete Button */}
                        <button
                          onClick={() => handleDeleteRecord(r)}
                          disabled={isDeleting}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-slate-50 hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-slate-200 hover:border-rose-200 rounded-xl text-xs font-bold transition cursor-pointer"
                          title="Delete Record (नोंद कायमची हटवा)"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>

      {/* Modal: Update WhatsApp Group Status (Added / No WhatsApp / Pending) */}
      {selectedRecordForModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 relative animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => setSelectedRecordForModal(null)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                modalTargetStatus === 'Added'
                  ? 'bg-emerald-100 text-emerald-700'
                  : modalTargetStatus === 'No WhatsApp'
                  ? 'bg-rose-100 text-rose-700'
                  : 'bg-amber-100 text-amber-700'
              }`}>
                {modalTargetStatus === 'Added' ? (
                  <MessageCircle className="w-6 h-6" />
                ) : modalTargetStatus === 'No WhatsApp' ? (
                  <PhoneOff className="w-6 h-6" />
                ) : (
                  <Clock className="w-6 h-6" />
                )}
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  WhatsApp Group Tracking Status
                </h3>
                <p className="text-xs text-slate-500">
                  व्हॉट्सअ‍ॅप ग्रुप किंवा स्टेटसची नोंद करा
                </p>
              </div>
            </div>

            {/* Worker summary box */}
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Worker Name:</span>
                <span className="font-bold text-slate-800">{selectedRecordForModal.workerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">MH Number:</span>
                <span className="font-mono font-bold text-emerald-700">{selectedRecordForModal.mhNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Mobile:</span>
                <span className="font-mono text-slate-700">{selectedRecordForModal.mobileNumber || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Source:</span>
                <span className="font-semibold text-slate-700">
                  {selectedRecordForModal.sourceType === 'Registration' ? 'New Registration' : 'Renewal'}
                </span>
              </div>
            </div>

            {/* Status Selector Options */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">
                Select Status / स्टेटस निवडा:
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setModalTargetStatus('Added');
                    if (!modalRemark || modalRemark.includes('व्हॉट्सअ‍ॅपवर नाही')) {
                      setModalRemark('Added to MH-09 WhatsApp Group');
                    }
                  }}
                  className={`p-2 rounded-xl text-xs font-bold border flex flex-col items-center gap-1 transition cursor-pointer ${
                    modalTargetStatus === 'Added'
                      ? 'bg-emerald-50 border-emerald-500 text-emerald-800 ring-2 ring-emerald-300'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Added</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setModalTargetStatus('No WhatsApp');
                    if (!modalRemark || modalRemark.includes('Added to')) {
                      setModalRemark('नंबर व्हॉट्सअ‍ॅपवर नाही (No WhatsApp)');
                    }
                  }}
                  className={`p-2 rounded-xl text-xs font-bold border flex flex-col items-center gap-1 transition cursor-pointer ${
                    modalTargetStatus === 'No WhatsApp'
                      ? 'bg-rose-50 border-rose-500 text-rose-800 ring-2 ring-rose-300'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <PhoneOff className="w-4 h-4 text-rose-600" />
                  <span>No WhatsApp</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setModalTargetStatus('Pending');
                    setModalRemark('');
                  }}
                  className={`p-2 rounded-xl text-xs font-bold border flex flex-col items-center gap-1 transition cursor-pointer ${
                    modalTargetStatus === 'Pending'
                      ? 'bg-amber-50 border-amber-500 text-amber-800 ring-2 ring-amber-300'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <Clock className="w-4 h-4 text-amber-600" />
                  <span>Pending</span>
                </button>
              </div>
            </div>

            {/* Quick remark suggestion chips */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">
                Remark / रिमार्क (Optional)
              </label>
              <div className="flex flex-wrap gap-1 text-[11px]">
                {[
                  'नंबर व्हॉट्सअ‍ॅपवर नाही',
                  'साधा फोन / कीपॅड (Keypad)',
                  'चुकीचा नंबर (Invalid No)',
                  'Added to MH-09 Group',
                  'Group Link sent via SMS',
                ].map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => setModalRemark(chip)}
                    className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-md transition cursor-pointer"
                  >
                    + {chip}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={modalRemark}
                onChange={(e) => setModalRemark(e.target.value)}
                placeholder="e.g. Added to MH-09 Group / नंबर व्हॉट्सअ‍ॅपवर नाही / साधा फोन"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:bg-white outline-none font-medium text-slate-800"
              />
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  const toDelete = selectedRecordForModal;
                  setSelectedRecordForModal(null);
                  if (toDelete) setRecordToDelete(toDelete);
                }}
                disabled={isDeleting || isSubmitting}
                className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
                title="Delete this record from tracking"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                <span>Delete (हटवा)</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedRecordForModal(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  Cancel
                </button>
              
                {modalTargetStatus === 'No WhatsApp' ? (
                  <button
                    type="button"
                    onClick={() => handleSaveStatus('No WhatsApp')}
                    disabled={isSubmitting}
                    className="flex items-center gap-1.5 px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-md shadow-rose-900/20 transition cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <PhoneOff className="w-4 h-4" />
                    )}
                    <span>Confirm No WhatsApp (व्हॉट्सअ‍ॅपवर नाही)</span>
                  </button>
                ) : modalTargetStatus === 'Pending' ? (
                  <button
                    type="button"
                    onClick={() => handleSaveStatus('Pending')}
                    disabled={isSubmitting}
                    className="flex items-center gap-1.5 px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-md shadow-amber-900/20 transition cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <RotateCcw className="w-4 h-4" />
                    )}
                    <span>Revert to Pending</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSaveStatus('Added')}
                    disabled={isSubmitting}
                    className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-900/20 transition cursor-pointer disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4" />
                    )}
                    <span>Confirm Added (ग्रुपमध्ये जोडले)</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Delete Confirmation (Single Record) */}
      {recordToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  नोंद कायमची हटवायची का?
                </h3>
                <p className="text-xs text-slate-500">
                  Delete Record from WhatsApp Tracking
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-rose-50/60 border border-rose-100 rounded-xl space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">कामगाराचे नाव:</span>
                <span className="font-bold text-slate-800">{recordToDelete.workerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">MH नंबर:</span>
                <span className="font-mono font-bold text-rose-700">{recordToDelete.mhNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">मोबाईल नंबर:</span>
                <span className="font-mono text-slate-700">{recordToDelete.mobileNumber || '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">स्थिती (Status):</span>
                <span className="font-semibold text-slate-800">{recordToDelete.status}</span>
              </div>
            </div>

            <p className="text-xs text-rose-700 font-medium">
              ⚠️ इशारा: ही नोंद व्हॉट्सअ‍ॅप ग्रुप ट्रॅकिंगमधून कायमची हटवली जाईल. ही कृती पूर्ववत करता येणार नाही.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setRecordToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                रद्द करा (Cancel)
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteSingle}
                disabled={isDeleting}
                className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-md shadow-rose-900/20 transition cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                <span>होय, नोंद हटवा (Yes, Delete)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Batch Delete Confirmation */}
      {isBatchDeleteModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  निवडलेल्या {selectedMhsForBatch.size} नोंदी हटवायच्या का?
                </h3>
                <p className="text-xs text-slate-500">
                  Bulk Delete Selected Records
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-rose-50/60 border border-rose-100 rounded-xl space-y-1 text-xs">
              <p className="text-slate-700">
                तुम्ही निवडलेल्या एकूण <strong className="text-rose-700 font-bold">{selectedMhsForBatch.size}</strong> नोंदी व्हॉट्सअ‍ॅप ग्रुप ट्रॅकिंगमधून कायमच्या हटवल्या जातील.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsBatchDeleteModalOpen(false)}
                disabled={isDeleting}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                रद्द करा (Cancel)
              </button>
              <button
                type="button"
                onClick={handleConfirmBatchDelete}
                disabled={isDeleting}
                className="flex items-center gap-1.5 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold shadow-md shadow-rose-900/20 transition cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                <span>होय, सर्व {selectedMhsForBatch.size} नोंदी हटवा</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Excel Bulk Import for WhatsApp Group Tracking */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 my-8 flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-emerald-800 via-teal-800 to-slate-900 text-white p-5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-300" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>WhatsApp Group - Excel Data Import</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 font-medium">
                      एक्सेल आयात
                    </span>
                  </h3>
                  <p className="text-xs text-emerald-100/80 mt-0.5">
                    Name, MH_Number, Mobile_Number फॉरमॅटमधील एक्सेल फाईल थेट अपलोड करा
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsImportModalOpen(false);
                  setImportPreviewRows([]);
                  setImportSummary(null);
                  setImportFileName('');
                  setPreviewSearch('');
                }}
                className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {/* No File Selected Yet - Show Upload Area & Format Guide */}
              {importPreviewRows.length === 0 ? (
                <div className="space-y-4">
                  {/* Drag and Drop Zone */}
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDraggingOver(true);
                    }}
                    onDragLeave={() => setIsDraggingOver(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setIsDraggingOver(false);
                      const droppedFile = e.dataTransfer.files?.[0];
                      if (droppedFile) parseExcelFile(droppedFile);
                    }}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                      isDraggingOver
                        ? 'border-emerald-500 bg-emerald-50/80'
                        : 'border-emerald-300/80 hover:border-emerald-500 bg-emerald-50/40 hover:bg-emerald-50/60'
                    }`}
                  >
                    <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto mb-3 shadow-inner">
                      <Upload className="w-7 h-7 animate-bounce" />
                    </div>
                    <h4 className="text-base font-bold text-slate-800">
                      येथे एक्सेल किंवा CSV फाईल निवडा किंवा ड्रॅग करा (Click to Upload or Drag & Drop)
                    </h4>
                    <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                      समर्थित फॉरमॅट: .xlsx, .xls, .csv • कॉलम नावे: Name, MH_Number, Mobile_Number इत्यादी (इंग्रजी किंवा मराठी)
                    </p>

                    <div className="flex flex-wrap items-center justify-center gap-3 mt-5">
                      <span className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md transition cursor-pointer flex items-center gap-1.5">
                        <Upload className="w-3.5 h-3.5" />
                        <span>ब्राउझ करा (Browse File)</span>
                      </span>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadSampleExcel();
                        }}
                        className="px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl border border-slate-300 shadow-xs transition cursor-pointer flex items-center gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5 text-emerald-600" />
                        <span>डेमो फॉरमॅट डाऊनलोड करा (.xlsx)</span>
                      </button>
                    </div>
                  </div>

                  {/* Format Guidelines Box */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h5 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                        <span>नमुना एक्सेल फॉरमॅट (Expected Excel Format):</span>
                      </h5>
                      <span className="text-[11px] text-slate-500">
                        ५ नमुना नोंदींसह तयार केलेले फॉरमॅट
                      </span>
                    </div>

                    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                      <table className="w-full text-[11px] text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                            <th className="py-2 px-3">#</th>
                            <th className="py-2 px-3">Name (नाव)</th>
                            <th className="py-2 px-3">MH_Number (नोंदणी क्र.)</th>
                            <th className="py-2 px-3">Mobile_Number (मोबाईल)</th>
                            <th className="py-2 px-3">Status (स्थिती)</th>
                            <th className="py-2 px-3">Remark (शेरा)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-slate-600 font-medium">
                          <tr>
                            <td className="py-1.5 px-3 font-mono">1</td>
                            <td className="py-1.5 px-3 font-bold text-slate-800">SAVITA DIPAK WAYAL</td>
                            <td className="py-1.5 px-3 font-mono text-emerald-700 font-bold">MH131090014303</td>
                            <td className="py-1.5 px-3 font-mono">7709904845</td>
                            <td className="py-1.5 px-3 text-emerald-600 font-semibold">Added</td>
                            <td className="py-1.5 px-3 text-slate-400">MH-09 WhatsApp Group</td>
                          </tr>
                          <tr>
                            <td className="py-1.5 px-3 font-mono">2</td>
                            <td className="py-1.5 px-3 font-bold text-slate-800">RAMESH SURESH NLAWADE</td>
                            <td className="py-1.5 px-3 font-mono text-emerald-700 font-bold">MH131650028441</td>
                            <td className="py-1.5 px-3 font-mono">9890643729</td>
                            <td className="py-1.5 px-3 text-emerald-600 font-semibold">Added</td>
                            <td className="py-1.5 px-3 text-slate-400">Joined WhatsApp Group</td>
                          </tr>
                          <tr>
                            <td className="py-1.5 px-3 font-mono">3</td>
                            <td className="py-1.5 px-3 font-bold text-slate-800">SHOBHA SHANKAR SHINDE</td>
                            <td className="py-1.5 px-3 font-mono text-emerald-700 font-bold">MH131080022637</td>
                            <td className="py-1.5 px-3 font-mono">9404325072</td>
                            <td className="py-1.5 px-3 text-amber-600 font-semibold">Pending</td>
                            <td className="py-1.5 px-3 text-slate-400">-</td>
                          </tr>
                          <tr>
                            <td className="py-1.5 px-3 font-mono">4</td>
                            <td className="py-1.5 px-3 font-bold text-slate-800">MANGESH BHAGUJI OZAEKAR</td>
                            <td className="py-1.5 px-3 font-mono text-emerald-700 font-bold">MH131080021768</td>
                            <td className="py-1.5 px-3 font-mono">8446782080</td>
                            <td className="py-1.5 px-3 text-rose-600 font-semibold">No WhatsApp</td>
                            <td className="py-1.5 px-3 text-slate-400">साधा फोन / Keypad</td>
                          </tr>
                          <tr>
                            <td className="py-1.5 px-3 font-mono">5</td>
                            <td className="py-1.5 px-3 font-bold text-slate-800">dilip pandurang padwal</td>
                            <td className="py-1.5 px-3 font-mono text-emerald-700 font-bold">MH131080000660</td>
                            <td className="py-1.5 px-3 font-mono">7397801221</td>
                            <td className="py-1.5 px-3 text-emerald-600 font-semibold">Added</td>
                            <td className="py-1.5 px-3 text-slate-400">Joined WhatsApp Group</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    <div className="flex items-start gap-2 text-[11px] text-amber-800 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                      <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <strong>टीप:</strong> MH नंबर ही मुख्य ओळख (Unique ID) आहे. अस्तित्वात असलेल्या कामगारांची माहिती सुरक्षित ठेवली जाईल आणि फक्त व्हॉट्सअ‍ॅप ग्रुप स्थिती व मोबाईल नंबर अद्ययावत केले जातील.
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* File Loaded - Show Preview and Import Options */
                <div className="space-y-4">
                  {/* File Info Bar */}
                  <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                        <FileSpreadsheet className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900 truncate max-w-xs" title={importFileName}>
                            {importFileName}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700">
                            एकूण {importSummary?.total} नोंदी
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-1 text-[11px]">
                          <span className="text-amber-800 font-bold bg-amber-100 px-2 py-0.5 rounded-md border border-amber-200 flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-amber-600" />
                            {importSummary?.readyToImport || 0} Pending मध्ये आयात होणार (Manual Check)
                          </span>
                          <span className="text-emerald-800 font-bold bg-emerald-100 px-2 py-0.5 rounded-md border border-emerald-300 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            {importSummary?.alreadyAdded || 0} आधीच जोडलेले (Already Added - वगळले जातील)
                          </span>
                          {(importSummary?.invalid || 0) > 0 && (
                            <span className="text-rose-600 font-medium bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                              • {importSummary?.invalid} वगळल्या जातील (Missing MH)
                            </span>
                          )}
                          {(importSummary?.duplicates || 0) > 0 && (
                            <span className="text-slate-600 font-medium">
                              • {importSummary?.duplicates} दुबार MH
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold transition cursor-pointer"
                      >
                        दुसरी फाईल निवडा
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadSampleExcel}
                        className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1"
                      >
                        <Download className="w-3 h-3" />
                        <span>डेमो फॉरमॅट</span>
                      </button>
                    </div>
                  </div>

                  {/* Manual Verification Rule Banner */}
                  <div className="bg-amber-50/90 border border-amber-200 rounded-xl p-3 text-xs text-amber-900 flex items-start gap-2.5">
                    <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <p className="font-bold text-amber-900">
                        मॅन्युअल पडताळणी नियम (Manual Verification Rule):
                      </p>
                      <p className="text-amber-800 text-[11px] leading-relaxed">
                        १. सर्व नवीन नोंदी <strong>'Pending'</strong> मध्ये आयात केल्या जातील, जेणेकरून ऑपरेटर त्यांची मॅन्युअल पडताळणी करू शकेल.
                        <br />
                        २. ज्या कामगारांचे नंबर आधीच <strong>'Added' (ग्रुपमध्ये जोडलेले)</strong> आहेत, ते सुरक्षितपणे वगळले जातील (पुन्हा आयात केले जाणार नाहीत).
                      </p>
                    </div>
                  </div>

                  {/* Custom Remark Field */}
                  <div className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                    <label className="text-xs font-semibold text-slate-700 shrink-0">
                      शेरा / रिमार्क:
                    </label>
                    <input
                      type="text"
                      value={importCustomRemark}
                      onChange={(e) => setImportCustomRemark(e.target.value)}
                      placeholder="उदा. Imported via Excel (Pending Verification)"
                      className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>

                  {/* Search Preview Rows */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="relative flex-1 max-w-sm">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={previewSearch}
                        onChange={(e) => setPreviewSearch(e.target.value)}
                        placeholder="प्रिव्ह्यू शोधा (नाव, MH नंबर, मोबाईल)..."
                        className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium outline-none focus:bg-white focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>
                    <span className="text-[11px] text-slate-500 font-medium">
                      आयात होणाऱ्या नोंदी: <strong className="text-amber-700 font-bold">{importSummary?.readyToImport || 0}</strong>
                    </span>
                  </div>

                  {/* Preview Table */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[300px] overflow-y-auto bg-white shadow-inner">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10 text-slate-500 uppercase text-[10px] font-bold">
                        <tr>
                          <th className="py-2.5 px-3 w-10 text-center">#</th>
                          <th className="py-2.5 px-3 min-w-[160px]">कामगाराचे नाव (Name)</th>
                          <th className="py-2.5 px-3 min-w-[140px]">MH नंबर</th>
                          <th className="py-2.5 px-3 min-w-[110px]">मोबाईल नंबर</th>
                          <th className="py-2.5 px-3 min-w-[150px]">स्थिती (Status)</th>
                          <th className="py-2.5 px-3 text-right min-w-[120px]">पडताळणी / कारवाई</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {importPreviewRows
                          .filter((r) => {
                            if (!previewSearch.trim()) return true;
                            const q = previewSearch.trim().toLowerCase();
                            return (
                              r.workerName.toLowerCase().includes(q) ||
                              r.mhNumber.toLowerCase().includes(q) ||
                              r.mobileNumber.toLowerCase().includes(q)
                            );
                          })
                          .slice(0, 150)
                          .map((r, idx) => {
                            return (
                              <tr
                                key={`${r.mhNumber}-${idx}`}
                                className={`transition-colors ${
                                  r.isAlreadyAdded
                                    ? 'bg-emerald-50/40 hover:bg-emerald-50/70'
                                    : !r.isValidMh
                                    ? 'bg-rose-50/40 hover:bg-rose-50/70 text-slate-400'
                                    : 'hover:bg-slate-50/80'
                                }`}
                              >
                                <td className="py-2 px-3 text-center text-slate-400 font-mono text-[11px]">
                                  {idx + 1}
                                </td>
                                <td className="py-2 px-3 font-semibold text-slate-800">
                                  {r.workerName}
                                  {r.taluka && (
                                    <span className="block text-[10px] font-normal text-slate-400">
                                      {r.taluka}
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 px-3 font-mono font-bold">
                                  {r.isValidMh ? (
                                    <span className="px-2 py-0.5 bg-slate-100 rounded text-slate-800 text-[11px]">
                                      {r.mhNumber}
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 bg-rose-100 text-rose-700 rounded text-[11px] font-medium">
                                      अवैध / रिकामे (Invalid)
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 px-3 font-mono text-slate-600">
                                  {r.mobileNumber ? (
                                    r.mobileNumber
                                  ) : (
                                    <span className="text-slate-400">-</span>
                                  )}
                                </td>
                                <td className="py-2 px-3">
                                  {r.isAlreadyAdded ? (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                      <span>आधीच जोडलेले (Already Added)</span>
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                                      <Clock className="w-3 h-3 text-amber-600" />
                                      <span>Pending (मॅन्युअल तपासणी)</span>
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 px-3 text-right">
                                  {r.isAlreadyAdded ? (
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                                      <ShieldCheck className="w-3 h-3 text-amber-600" />
                                      <span>वगळले जाईल (Skip)</span>
                                    </span>
                                  ) : r.isValidMh ? (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                      <Check className="w-3 h-3" />
                                      <span>Pending मध्ये आयात</span>
                                    </span>
                                  ) : (
                                    <span className="text-[11px] font-medium text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                                      वगळले जाईल (अवैध)
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>

                  {importPreviewRows.length > 150 && (
                    <p className="text-[11px] text-slate-400 text-center">
                      (प्रिव्ह्यूमध्ये पहिले १५० रेकॉर्ड दाखवले आहेत • आयात करताना सर्व वैध नोंदी सेव्ह केल्या जातील)
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIsImportModalOpen(false);
                  setImportPreviewRows([]);
                  setImportSummary(null);
                  setImportFileName('');
                  setPreviewSearch('');
                }}
                className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl text-xs font-semibold transition cursor-pointer"
              >
                रद्द करा (Cancel)
              </button>

              <div className="flex items-center gap-2">
                {importPreviewRows.length > 0 && (
                  <button
                    type="button"
                    onClick={handleExecuteImport}
                    disabled={isImporting || (importSummary?.readyToImport || 0) === 0}
                    className="flex items-center gap-1.5 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-900/20 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isImporting ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Upload className="w-4 h-4" />
                    )}
                    <span>
                      {isImporting
                        ? 'आयात चालू आहे...'
                        : (importSummary?.readyToImport || 0) > 0
                        ? `डेटा Pending मध्ये आयात करा (${importSummary?.readyToImport} नोंदी)`
                        : 'सर्व नंबर आधीच जोडलेले आहेत (कोणतीही नोंद आयात होणार नाही)'}
                    </span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Toast Notification Banner */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md animate-in slide-in-from-bottom-5 duration-300">
          <div
            className={`p-4 rounded-2xl shadow-2xl border flex items-start gap-3 ${
              toast.type === 'success'
                ? 'bg-emerald-900 text-white border-emerald-700'
                : toast.type === 'error'
                ? 'bg-rose-900 text-white border-rose-700'
                : 'bg-slate-900 text-white border-slate-700'
            }`}
          >
            <div className="mt-0.5 shrink-0">
              {toast.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              ) : toast.type === 'error' ? (
                <AlertCircle className="w-5 h-5 text-rose-400" />
              ) : (
                <Info className="w-5 h-5 text-sky-400" />
              )}
            </div>
            <div className="flex-1 space-y-0.5 text-xs">
              <h4 className="font-bold text-sm">{toast.title}</h4>
              {toast.message && <p className="opacity-90 leading-relaxed">{toast.message}</p>}
            </div>
            <button
              onClick={() => setToast(null)}
              className="text-white/60 hover:text-white p-1 rounded-lg hover:bg-white/10 shrink-0 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

