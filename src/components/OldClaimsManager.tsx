import React, { useState, useEffect, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  FileSpreadsheet,
  Upload,
  Download,
  PlusCircle,
  Search,
  Filter,
  Trash2,
  Edit,
  CheckCircle2,
  AlertCircle,
  X,
  FileText,
  Calendar,
  Building2,
  ArrowUpDown,
  RefreshCw,
  CheckSquare,
  Printer,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ShieldCheck,
  Phone,
  Layers,
} from 'lucide-react';
import { OldWorkerClaim, User } from '../types';
import { MAHARASHTRA_TALUKAS } from '../data/mockData';
import { FromSourceFilterSelect } from './FromSourceFilterSelect';
import { UiverseCheckbox } from './UiverseCheckbox';
import { TableSlideControls } from './TableSlideControls';

interface OldClaimsManagerProps {
  currentUser?: User;
  onOpenPrintSlip?: (type: 'claim', data: any) => void;
}

const LOCAL_STORAGE_KEY = 'mbocww_old_claims_records';

export const OldClaimsManager: React.FC<OldClaimsManagerProps> = ({
  currentUser,
  onOpenPrintSlip,
}) => {
  const [oldClaims, setOldClaims] = useState<OldWorkerClaim[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [talukaFilter, setTalukaFilter] = useState('');
  const [fromSourceFilter, setFromSourceFilter] = useState('');
  const [schemeFilter, setSchemeFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const oldClaimsTableRef = useRef<HTMLDivElement>(null);

  // Modals & Menus
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [editingClaim, setEditingClaim] = useState<OldWorkerClaim | null>(null);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<{ id: string; name: string } | null>(null);

  // Bulk Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // Import State
  const [importFile, setImportFile] = useState<File | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [importMode, setImportMode] = useState<'file' | 'paste'>('file');
  const [previewRows, setPreviewRows] = useState<OldWorkerClaim[]>([]);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form State for Add / Edit
  const [formData, setFormData] = useState({
    srNo: '',
    workerName: '',
    mhNumber: '',
    verificationDate: new Date().toISOString().split('T')[0],
    taluka: MAHARASHTRA_TALUKAS[0] || 'Ambegaon',
    scheme1: 'E05',
    scheme2: '0',
    scheme1Amount: '60000',
    scheme2Amount: '0',
    totalAmount: '60000',
    fromSource: 'OFFICE',
    mobileNumber: '',
    formFill: '',
    remarks: '',
  });

  // Auth headers helper
  const getAuthHeaders = (): Record<string, string> => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  // Load Old Claims from Server with LocalStorage Fallback
  const fetchOldClaims = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/old-claims', {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setOldClaims(data);
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(data));
          setLoading(false);
          return;
        }
      }
    } catch (e) {
      console.warn('Could not fetch old claims from server, trying localStorage fallback', e);
    }

    // Fallback
    try {
      const local = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (local) {
        const parsed = JSON.parse(local);
        if (Array.isArray(parsed)) {
          setOldClaims(parsed);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOldClaims();
  }, []);

  // Update total amount automatically when scheme 1 or 2 amounts change
  const handleAmountChange = (s1: string, s2: string) => {
    const amt1 = parseFloat(s1) || 0;
    const amt2 = parseFloat(s2) || 0;
    setFormData((prev) => ({
      ...prev,
      scheme1Amount: s1,
      scheme2Amount: s2,
      totalAmount: String(amt1 + amt2),
    }));
  };

  // Filtered Claims
  const filteredClaims = useMemo(() => {
    return oldClaims.filter((claim) => {
      if (searchTerm) {
        const term = searchTerm.toLowerCase().trim();
        const matchName = (claim.workerName || '').toLowerCase().includes(term);
        const matchMh = (claim.mhNumber || '').toLowerCase().includes(term);
        const matchMobile = (claim.mobileNumber || '').includes(term);
        const matchTaluka = (claim.taluka || '').toLowerCase().includes(term);
        const matchScheme = (claim.scheme1 || '').toLowerCase().includes(term) || (claim.scheme2 || '').toLowerCase().includes(term);
        const matchFrom = (claim.fromSource || '').toLowerCase().includes(term);
        if (!matchName && !matchMh && !matchMobile && !matchTaluka && !matchScheme && !matchFrom) {
          return false;
        }
      }

      if (talukaFilter && (claim.taluka || '').toLowerCase() !== talukaFilter.toLowerCase()) {
        return false;
      }

      if (fromSourceFilter && !(claim.fromSource || '').toLowerCase().includes(fromSourceFilter.trim().toLowerCase())) {
        return false;
      }

      if (schemeFilter) {
        const s = schemeFilter.toLowerCase();
        if ((claim.scheme1 || '').toLowerCase() !== s && (claim.scheme2 || '').toLowerCase() !== s) {
          return false;
        }
      }

      if (fromDate || toDate) {
        const vDate = claim.verificationDate || '';
        // normalize format DD-MM-YYYY or YYYY-MM-DD
        let formattedDate = vDate;
        if (vDate.includes('-')) {
          const parts = vDate.split('-');
          if (parts[0].length === 2 && parts[2].length === 4) {
            // DD-MM-YYYY to YYYY-MM-DD
            formattedDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
          }
        }
        if (fromDate && formattedDate < fromDate) return false;
        if (toDate && formattedDate > toDate) return false;
      }

      return true;
    });
  }, [oldClaims, searchTerm, talukaFilter, fromSourceFilter, schemeFilter, fromDate, toDate]);

  // Pagination
  const totalPages = pageSize === -1 ? 1 : Math.ceil(filteredClaims.length / pageSize);
  const paginatedClaims = useMemo(() => {
    if (pageSize === -1) return filteredClaims;
    const start = (currentPage - 1) * pageSize;
    return filteredClaims.slice(start, start + pageSize);
  }, [filteredClaims, currentPage, pageSize]);

  // Distinct Talukas, FromSources, Schemes
  const talukaList = useMemo(() => {
    const set = new Set<string>();
    oldClaims.forEach((c) => {
      if (c.taluka) set.add(c.taluka);
    });
    MAHARASHTRA_TALUKAS.forEach((t) => set.add(t));
    return Array.from(set).sort();
  }, [oldClaims]);

  const fromSourceList = useMemo(() => {
    const set = new Set<string>(['OFFICE']);
    oldClaims.forEach((c) => {
      if (c.fromSource) set.add(c.fromSource);
    });
    return Array.from(set).sort();
  }, [oldClaims]);

  const schemeList = useMemo(() => {
    const set = new Set<string>(['E05', 'E03', 'E01', 'E02', 'E04']);
    oldClaims.forEach((c) => {
      if (c.scheme1) set.add(c.scheme1);
      if (c.scheme2 && c.scheme2 !== '0') set.add(c.scheme2);
    });
    return Array.from(set).sort();
  }, [oldClaims]);

  // Overall Statistics
  const stats = useMemo(() => {
    const totalCount = filteredClaims.length;
    const totalAmount = filteredClaims.reduce((sum, c) => sum + (c.totalAmount || 0), 0);
    const scheme1Total = filteredClaims.reduce((sum, c) => sum + (c.scheme1Amount || 0), 0);
    const officeCount = filteredClaims.filter((c) => (c.fromSource || '').toUpperCase() === 'OFFICE').length;
    return {
      totalCount,
      totalAmount,
      scheme1Total,
      officeCount,
    };
  }, [filteredClaims]);

  // Bulk Selection Handlers
  const toggleSelectId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isAllCurrentPageSelected = paginatedClaims.length > 0 && paginatedClaims.every((c) => selectedIds.has(c.id));

  const toggleSelectCurrentPage = () => {
    if (isAllCurrentPageSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        paginatedClaims.forEach((c) => next.delete(c.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        paginatedClaims.forEach((c) => next.add(c.id));
        return next;
      });
    }
  };

  const selectAllFiltered = () => {
    const next = new Set(selectedIds);
    filteredClaims.forEach((c) => next.add(c.id));
    setSelectedIds(next);
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  // Bulk Delete
  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!window.confirm(`तुम्हाला खरोखर निवडलेले ${ids.length} जुने क्लेम रेकॉर्ड्स डिलीट करायचे आहेत का?`)) {
      return;
    }

    setIsBulkDeleting(true);
    try {
      const res = await fetch('/api/old-claims/bulk-delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ ids }),
      });
      if (res.ok) {
        const idSet = new Set(ids);
        const updated = oldClaims.filter((c) => !idSet.has(c.id));
        setOldClaims(updated);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
        setSelectedIds(new Set());
      } else {
        alert('डिलीट करताना त्रुटी आली.');
      }
    } catch (e) {
      console.error(e);
      // fallback delete locally
      const idSet = new Set(ids);
      const updated = oldClaims.filter((c) => !idSet.has(c.id));
      setOldClaims(updated);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
      setSelectedIds(new Set());
    } finally {
      setIsBulkDeleting(false);
    }
  };

  // Delete Single Claim
  const handleDeleteSingle = async (id: string) => {
    try {
      const res = await fetch(`/api/old-claims/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const updated = oldClaims.filter((c) => c.id !== id);
        setOldClaims(updated);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
      }
    } catch (e) {
      console.error(e);
      const updated = oldClaims.filter((c) => c.id !== id);
      setOldClaims(updated);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
    } finally {
      setDeleteConfirmItem(null);
    }
  };

  // Reset All Old Claims
  const handleResetAll = async () => {
    if (!window.confirm('सावधान! सर्व जुना क्लेम डेटा (Old Claims Archive) कायमचा नष्ट होईल. तुम्हाला खरोखर सर्व जुना डेटा रीसेट करायचा आहे का?')) {
      return;
    }
    try {
      await fetch('/api/old-claims', {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      setOldClaims([]);
      localStorage.removeItem(LOCAL_STORAGE_KEY);
      setSelectedIds(new Set());
      alert('सर्व जुना क्लेम डेटा यशस्वीरित्या रीसेट करण्यात आला आहे.');
    } catch (e) {
      console.error(e);
      setOldClaims([]);
      localStorage.removeItem(LOCAL_STORAGE_KEY);
      alert('डेटा रीसेट करण्यात आला.');
    }
  };

  // Helper to get claims for export
  const getClaimsForExport = (target: 'filtered' | 'selected' | 'all' = 'filtered') => {
    if (target === 'selected') {
      return oldClaims.filter((c) => selectedIds.has(c.id));
    }
    if (target === 'all') {
      return oldClaims;
    }
    return filteredClaims;
  };

  const formatExportRow = (c: OldWorkerClaim, index: number) => ({
    'SR.NO': c.srNo || index + 1,
    'NAME': c.workerName,
    'MHNUMBER': c.mhNumber,
    'VERIFICATIONDATE': c.verificationDate,
    'TALUKA': c.taluka,
    'SCHEME 1': c.scheme1,
    'SCHEME 2': c.scheme2 || '0',
    'SCHEME 1 AMOUNT': c.scheme1Amount,
    'SCHEME 2 AMOUNT': c.scheme2Amount || 0,
    'TOTAL': c.totalAmount,
    'FROM': c.fromSource || 'OFFICE',
    'MOBILE NUMBER': c.mobileNumber || '0',
    'FORM FILL': c.formFill || '',
    'STATUS': c.status || 'Old Record',
    'REMARKS': c.remarks || '',
  });

  // Export to Excel (.xlsx)
  const handleExportExcel = (target: 'filtered' | 'selected' | 'all' = 'filtered') => {
    const records = getClaimsForExport(target);
    if (records.length === 0) {
      alert('एक्सपोर्ट करण्यासाठी कोणताही डेटा उपलब्ध नाही.');
      return;
    }

    const rows = records.map((c, index) => formatExportRow(c, index));
    const worksheet = XLSX.utils.json_to_sheet(rows);

    // Auto calculate column widths
    const columnWidths = [
      { wch: 8 },  // SR.NO
      { wch: 32 }, // NAME
      { wch: 22 }, // MHNUMBER
      { wch: 18 }, // VERIFICATIONDATE
      { wch: 16 }, // TALUKA
      { wch: 12 }, // SCHEME 1
      { wch: 12 }, // SCHEME 2
      { wch: 18 }, // SCHEME 1 AMOUNT
      { wch: 18 }, // SCHEME 2 AMOUNT
      { wch: 16 }, // TOTAL
      { wch: 14 }, // FROM
      { wch: 16 }, // MOBILE NUMBER
      { wch: 16 }, // FORM FILL
      { wch: 14 }, // STATUS
      { wch: 22 }, // REMARKS
    ];
    worksheet['!cols'] = columnWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Old_Claims_Archive');
    const dateStr = new Date().toISOString().slice(0, 10);
    const suffix = target === 'selected' ? `Selected_${records.length}` : target === 'all' ? `All_${records.length}` : `Filtered_${records.length}`;
    XLSX.writeFile(workbook, `MBOCWW_Old_Claims_${suffix}_${dateStr}.xlsx`);
    setIsExportMenuOpen(false);
  };

  // Export to CSV (.csv)
  const handleExportCSV = (target: 'filtered' | 'selected' | 'all' = 'filtered') => {
    const records = getClaimsForExport(target);
    if (records.length === 0) {
      alert('एक्सपोर्ट करण्यासाठी कोणताही डेटा उपलब्ध नाही.');
      return;
    }

    const rows = records.map((c, index) => formatExportRow(c, index));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Old_Claims_Archive');
    const dateStr = new Date().toISOString().slice(0, 10);
    const suffix = target === 'selected' ? `Selected_${records.length}` : target === 'all' ? `All_${records.length}` : `Filtered_${records.length}`;
    XLSX.writeFile(workbook, `MBOCWW_Old_Claims_${suffix}_${dateStr}.csv`, { bookType: 'csv' });
    setIsExportMenuOpen(false);
  };

  // Download Sample Template matching user's image exactly
  const handleDownloadSampleTemplate = () => {
    const sampleData = [
      {
        'SR.NO': 1,
        'NAME': 'SUREKHA BALASAHEB NAWALE',
        'MHNUMBER': 'MH131080020138',
        'VERIFICATIONDATE': '16-12-2025',
        'TALUKA': 'AMBEGAON',
        'SCHEME 1': 'E05',
        'SCHEME 2': '0',
        'SCHEME 1 AMOUNT': 60000,
        'SCHEME 2 AMOUNT': 0,
        'TOTAL': 60000,
        'FROM': 'OFFICE',
        'MOBILE NUMBER': '0',
        'FORM FILL': '',
      },
      {
        'SR.NO': 2,
        'NAME': 'ROHINI ARUN KUTAL',
        'MHNUMBER': 'MH131080021728',
        'VERIFICATIONDATE': '01-01-2026',
        'TALUKA': 'AMBEGAON',
        'SCHEME 1': 'E05',
        'SCHEME 2': '0',
        'SCHEME 1 AMOUNT': 60000,
        'SCHEME 2 AMOUNT': 0,
        'TOTAL': 60000,
        'FROM': 'OFFICE',
        'MOBILE NUMBER': '0',
        'FORM FILL': '',
      },
      {
        'SR.NO': 3,
        'NAME': 'BHAGWAN BALASAHEB GAWADE',
        'MHNUMBER': 'MH131080020248',
        'VERIFICATIONDATE': '13-01-2026',
        'TALUKA': 'AMBEGAON',
        'SCHEME 1': 'E05',
        'SCHEME 2': '0',
        'SCHEME 1 AMOUNT': 60000,
        'SCHEME 2 AMOUNT': 0,
        'TOTAL': 60000,
        'FROM': 'OFFICE',
        'MOBILE NUMBER': '0',
        'FORM FILL': '',
      },
      {
        'SR.NO': 4,
        'NAME': 'pratiksha sandip ghadge',
        'MHNUMBER': 'MH131090024851',
        'VERIFICATIONDATE': '12-01-2026',
        'TALUKA': 'JUNNAR',
        'SCHEME 1': 'E03',
        'SCHEME 2': '0',
        'SCHEME 1 AMOUNT': 10000,
        'SCHEME 2 AMOUNT': 0,
        'TOTAL': 10000,
        'FROM': 'OFFICE',
        'MOBILE NUMBER': '9561440929',
        'FORM FILL': '',
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sample_Old_Claims');
    XLSX.writeFile(workbook, 'Old_Claims_Import_Template.xlsx');
  };

  // Helper to parse dates gracefully
  const parseFlexibleDate = (raw: any): string => {
    if (!raw) return '';
    if (typeof raw === 'number') {
      // Excel serial date number
      try {
        const date = new Date(Math.round((raw - 25569) * 86400 * 1000));
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}-${month}-${year}`;
      } catch (e) {
        return String(raw);
      }
    }
    const str = String(raw).trim();
    return str;
  };

  // Parse raw row data into OldWorkerClaim format
  const parseRowToOldClaim = (row: any, index: number): OldWorkerClaim | null => {
    // Normalise column keys (lowercase without spaces, dots, underscores)
    const normKeys: Record<string, string> = {};
    for (const key of Object.keys(row)) {
      const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
      normKeys[cleanKey] = key;
    }

    const getVal = (possibleKeys: string[]): any => {
      for (const pk of possibleKeys) {
        const clean = pk.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (normKeys[clean]) {
          const val = row[normKeys[clean]];
          if (val !== undefined && val !== null) return val;
        }
      }
      return undefined;
    };

    const workerName = String(getVal(['name', 'workername', 'worker_name', 'kamgarnav', 'कामगाराचे नाव']) || '').trim();
    const mhNumber = String(getVal(['mhnumber', 'mh_number', 'mhno', 'mh_no', 'नोंदणी क्रमांक']) || '').trim().toUpperCase();

    if (!workerName && !mhNumber) {
      return null;
    }

    const rawSrNo = getVal(['srno', 'sr_no', 'sno', 'क्रमांक']);
    const srNo = rawSrNo ? Number(rawSrNo) : index + 1;

    const rawDate = getVal(['verificationdate', 'verification_date', 'verificationda', 'date', 'claimdate', 'पडताळणी तारीख']);
    const verificationDate = parseFlexibleDate(rawDate);

    const taluka = String(getVal(['taluka', 'तालुका']) || 'Ambegaon').trim();

    // Look for Scheme 1 and Scheme 2
    // Note in image: there were two SCHEME columns or SCHEME 1 / SCHEME 2
    let scheme1 = '';
    let scheme2 = '0';

    // Check all keys in the row
    const schemeKeys = Object.keys(row).filter((k) => k.toLowerCase().includes('scheme') && !k.toLowerCase().includes('amount'));
    if (schemeKeys.length > 0) {
      scheme1 = String(row[schemeKeys[0]] || 'E05').trim();
      if (schemeKeys.length > 1) {
        scheme2 = String(row[schemeKeys[1]] || '0').trim();
      }
    }
    if (!scheme1) {
      scheme1 = String(getVal(['scheme1', 'scheme_1', 'schemecode', 'scheme']) || 'E05').trim();
      scheme2 = String(getVal(['scheme2', 'scheme_2']) || '0').trim();
    }

    const rawAmt1 = getVal(['scheme1amount', 'scheme_1_amount', 'scheme1amt', 'schemeamount1', 'रक्कम१']);
    const rawAmt2 = getVal(['scheme2amount', 'scheme_2_amount', 'scheme2amt', 'schemeamount2', 'रक्कम२']);
    const rawTotal = getVal(['total', 'totalamount', 'total_amount', 'एकूण रक्कम']);

    const cleanNum = (val: any): number => {
      if (val === undefined || val === null || val === '') return 0;
      const numStr = String(val).replace(/,/g, '').trim();
      const n = parseFloat(numStr);
      return isNaN(n) ? 0 : n;
    };

    const scheme1Amount = cleanNum(rawAmt1);
    const scheme2Amount = cleanNum(rawAmt2);
    let totalAmount = cleanNum(rawTotal);
    if (totalAmount === 0 && (scheme1Amount > 0 || scheme2Amount > 0)) {
      totalAmount = scheme1Amount + scheme2Amount;
    }

    const fromSource = String(getVal(['from', 'source', 'fromsource', 'office']) || 'OFFICE').trim() || 'OFFICE';
    const rawMobile = getVal(['mobilenumber', 'mobile_number', 'mobile', 'phone', 'मोबाईल']);
    const mobileNumber = rawMobile ? String(rawMobile).trim() : '0';

    const formFill = String(getVal(['formfill', 'form_fill', 'formfillby', 'operator']) || '').trim();

    return {
      id: `OLD-CLM-${Date.now()}-${index}-${Math.floor(100 + Math.random() * 900)}`,
      srNo,
      workerName: workerName || 'Unknown Worker',
      mhNumber: mhNumber || 'N/A',
      verificationDate: verificationDate || new Date().toISOString().split('T')[0],
      taluka: taluka || 'Ambegaon',
      scheme1: scheme1 || 'E05',
      scheme2: scheme2 || '0',
      scheme1Amount,
      scheme2Amount,
      totalAmount,
      fromSource,
      mobileNumber: mobileNumber || '0',
      formFill,
      status: 'Old Record',
      remarks: 'Imported from Old Records Archive',
    };
  };

  // Handle File Upload & Parse
  const handleFileUpload = (file: File) => {
    setImportFile(file);
    setImportErrors([]);
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const buffer = e.target?.result;
        const workbook = XLSX.read(buffer, { type: 'binary', raw: false });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawJson: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        if (!rawJson || rawJson.length === 0) {
          setImportErrors(['निवडलेल्या फाईलमध्ये कोणताही डेटा आढळला नाही. कृपया वैध फाईल निवडा.']);
          setPreviewRows([]);
          return;
        }

        const parsed: OldWorkerClaim[] = [];
        rawJson.forEach((row, idx) => {
          const claim = parseRowToOldClaim(row, idx);
          if (claim) {
            parsed.push(claim);
          }
        });

        if (parsed.length === 0) {
          setImportErrors(['फाईलमधून कॉलम मॅच होऊ शकले नाहीत. कृपया सॅम्पल टेम्पलेट तपासून पहा.']);
        }

        setPreviewRows(parsed);
      } catch (err: any) {
        console.error('File parsing error:', err);
        setImportErrors([`फाईल वाचताना अडचण आली: ${err?.message || 'अज्ञात त्रुटी'}`]);
        setPreviewRows([]);
      }
    };

    reader.readAsBinaryString(file);
  };

  // Handle Paste Text parse
  const handleParsePastedText = () => {
    if (!pasteText.trim()) {
      setImportErrors(['कृपया एक्सेल किंवा स्प्रेडशीटमधून कॉपी केलेला डेटा बॉक्समध्ये पेस्ट करा.']);
      return;
    }

    setImportErrors([]);
    try {
      const lines = pasteText.trim().split(/\r?\n/);
      if (lines.length === 0) {
        setImportErrors(['पेस्ट केलेल्या डेटामध्ये ओळी आढळल्या नाहीत.']);
        return;
      }

      // First line may be header or data
      const delimiter = lines[0].includes('\t') ? '\t' : ',';
      const headers = lines[0].split(delimiter).map((h) => h.trim().replace(/^"|"$/g, ''));

      // Check if first line is header
      const isHeader = headers.some((h) =>
        ['name', 'worker', 'mh', 'mhnumber', 'taluka', 'scheme', 'amount', 'total', 'sr'].some((k) =>
          h.toLowerCase().includes(k)
        )
      );

      const dataLines = isHeader ? lines.slice(1) : lines;
      const parsed: OldWorkerClaim[] = [];

      dataLines.forEach((line, idx) => {
        if (!line.trim()) return;
        const cols = line.split(delimiter).map((c) => c.trim().replace(/^"|"$/g, ''));

        let rowObj: Record<string, any> = {};
        if (isHeader) {
          headers.forEach((h, hIdx) => {
            rowObj[h] = cols[hIdx] || '';
          });
        } else {
          // If no header, assign in order from image:
          // SR.NO, NAME, MHNUMBER, VERIFICATIONDATE, TALUKA, SCHEME 1, SCHEME 2, SCHEME 1 AMOUNT, SCHEME 2 AMOUNT, TOTAL, FROM, MOBILE NUMBER, FORM FILL
          rowObj = {
            'sr_no': cols[0] || '',
            'name': cols[1] || '',
            'mhnumber': cols[2] || '',
            'verificationdate': cols[3] || '',
            'taluka': cols[4] || '',
            'scheme1': cols[5] || '',
            'scheme2': cols[6] || '',
            'scheme1amount': cols[7] || '',
            'scheme2amount': cols[8] || '',
            'total': cols[9] || '',
            'from': cols[10] || '',
            'mobilenumber': cols[11] || '',
            'formfill': cols[12] || '',
          };
        }

        const claim = parseRowToOldClaim(rowObj, idx);
        if (claim) {
          parsed.push(claim);
        }
      });

      if (parsed.length === 0) {
        setImportErrors(['पेस्ट केलेल्या डेटामधून नोंदी ओळखता आल्या नाहीत. कृपया डेटा फॉरमॅट तपासा.']);
      }

      setPreviewRows(parsed);
    } catch (err: any) {
      setImportErrors([`पेस्ट डेटा वाचताना त्रुटी: ${err?.message || 'अज्ञात त्रुटी'}`]);
    }
  };

  // Submit Bulk Import
  const handleConfirmImport = async () => {
    if (previewRows.length === 0) return;
    setIsImporting(true);

    try {
      const res = await fetch('/api/old-claims/bulk-import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ claims: previewRows }),
      });

      if (res.ok) {
        const result = await res.json();
        alert(`अभिनंदन! ${result.importedCount || previewRows.length} जुन्या क्लेम नोंदी यशस्वीरित्या जुना डेटा नोंदवहीत इम्पोर्ट झाल्या आहेत.`);
        // Reload
        await fetchOldClaims();
        setIsImportModalOpen(false);
        setPreviewRows([]);
        setImportFile(null);
        setPasteText('');
      } else {
        const err = await res.json();
        alert(err?.error || 'इम्पोर्ट करताना त्रुटी आली.');
      }
    } catch (e: any) {
      console.warn('Backend import failed, storing locally', e);
      // LocalStorage fallback
      const updated = [...previewRows, ...oldClaims];
      setOldClaims(updated);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
      alert(`अभिनंदन! ${previewRows.length} जुन्या क्लेम नोंदी स्थानिक नोंदवहीत यशस्वीरित्या इम्पोर्ट झाल्या आहेत.`);
      setIsImportModalOpen(false);
      setPreviewRows([]);
      setImportFile(null);
      setPasteText('');
    } finally {
      setIsImporting(false);
    }
  };

  // Handle Save Manual Add / Edit
  const handleSaveClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.workerName.trim() || !formData.mhNumber.trim()) {
      alert('कृपया कामगाराचे नाव आणि MH क्रमांक भरा.');
      return;
    }

    const payload: OldWorkerClaim = {
      id: editingClaim ? editingClaim.id : `OLD-CLM-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
      srNo: formData.srNo ? Number(formData.srNo) : oldClaims.length + 1,
      workerName: formData.workerName.trim(),
      mhNumber: formData.mhNumber.trim().toUpperCase(),
      verificationDate: formData.verificationDate.trim(),
      taluka: formData.taluka.trim(),
      scheme1: formData.scheme1.trim() || 'E05',
      scheme2: formData.scheme2.trim() || '0',
      scheme1Amount: parseFloat(formData.scheme1Amount) || 0,
      scheme2Amount: parseFloat(formData.scheme2Amount) || 0,
      totalAmount: parseFloat(formData.totalAmount) || 0,
      fromSource: formData.fromSource.trim() || 'OFFICE',
      mobileNumber: formData.mobileNumber.trim() || '0',
      formFill: formData.formFill.trim(),
      status: 'Old Record',
      remarks: formData.remarks.trim(),
    };

    try {
      if (editingClaim) {
        const res = await fetch(`/api/old-claims/${editingClaim.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
          },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const updated = oldClaims.map((c) => (c.id === editingClaim.id ? payload : c));
          setOldClaims(updated);
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
        }
      } else {
        const res = await fetch('/api/old-claims', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
          },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const saved = await res.json();
          const updated = [saved, ...oldClaims];
          setOldClaims(updated);
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
        }
      }
    } catch (err) {
      console.warn('Server save failed, using local update', err);
      if (editingClaim) {
        const updated = oldClaims.map((c) => (c.id === editingClaim.id ? payload : c));
        setOldClaims(updated);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
      } else {
        const updated = [payload, ...oldClaims];
        setOldClaims(updated);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
      }
    } finally {
      setIsAddModalOpen(false);
      setEditingClaim(null);
    }
  };

  const openEditModal = (claim: OldWorkerClaim) => {
    setEditingClaim(claim);
    setFormData({
      srNo: claim.srNo ? String(claim.srNo) : '',
      workerName: claim.workerName,
      mhNumber: claim.mhNumber,
      verificationDate: claim.verificationDate,
      taluka: claim.taluka,
      scheme1: claim.scheme1,
      scheme2: claim.scheme2 || '0',
      scheme1Amount: String(claim.scheme1Amount || 0),
      scheme2Amount: String(claim.scheme2Amount || 0),
      totalAmount: String(claim.totalAmount || 0),
      fromSource: claim.fromSource || 'OFFICE',
      mobileNumber: claim.mobileNumber || '',
      formFill: claim.formFill || '',
      remarks: claim.remarks || '',
    });
    setIsAddModalOpen(true);
  };

  const openNewModal = () => {
    setEditingClaim(null);
    setFormData({
      srNo: String(oldClaims.length + 1),
      workerName: '',
      mhNumber: '',
      verificationDate: new Date().toISOString().split('T')[0],
      taluka: MAHARASHTRA_TALUKAS[0] || 'Ambegaon',
      scheme1: 'E05',
      scheme2: '0',
      scheme1Amount: '60000',
      scheme2Amount: '0',
      totalAmount: '60000',
      fromSource: 'OFFICE',
      mobileNumber: '',
      formFill: '',
      remarks: '',
    });
    setIsAddModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Information Banner Explaining Isolation */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 rounded-2xl p-5 text-white shadow-md border border-blue-800">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="p-3 rounded-xl bg-blue-600/60 border border-blue-400/40 text-blue-100 flex-shrink-0">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-black text-white tracking-tight">
                  जुना क्लेम डेटा नोंदवही (Old Claims Archive & Offline Registry)
                </h3>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-400/40">
                  स्वतंत्र डेटाबेस (Isolated Data)
                </span>
              </div>
              <p className="text-xs text-blue-100/80 mt-1 font-medium max-w-3xl">
                हा विभाग तुमच्या पूर्वीच्या ऑफलाईन किंवा एक्सेल क्लेम नोंदी स्वतंत्र साठवण्यासाठी आहे. यामुळे नवीन चालू क्लेम, दैनिक पडताळणी व अहवाल अजिबात बाधित होणार नाहीत.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap self-end md:self-center">
            {/* Export Dropdown Menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                className="py-2.5 px-4 rounded-xl bg-blue-700 hover:bg-blue-600 active:scale-95 text-white font-bold text-xs border border-blue-400/50 flex items-center gap-2 shadow-xs transition-all cursor-pointer"
                title="जुना क्लेम डेटा एक्सेल (.xlsx) किंवा CSV मध्ये एक्सपोर्ट करा"
              >
                <Download className="w-4 h-4 text-emerald-300" />
                <span>एक्सेल / CSV एक्सपोर्ट (Export)</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${isExportMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {isExportMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setIsExportMenuOpen(false)}
                  />
                  <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-slate-200 py-2 z-40 text-slate-800 text-xs animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-3.5 py-2 text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100 flex items-center justify-between">
                      <span>एक्सपोर्ट फॉरमॅट निवडा</span>
                      <span className="text-emerald-700 font-bold">
                        {selectedIds.size > 0 ? `${selectedIds.size} निवडलेले` : `${filteredClaims.length} नोंदी`}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleExportExcel(selectedIds.size > 0 ? 'selected' : 'filtered')}
                      className="w-full px-3.5 py-2.5 text-left hover:bg-emerald-50/60 flex items-center gap-3 font-bold text-slate-800 cursor-pointer transition-colors"
                    >
                      <div className="p-2 rounded-lg bg-emerald-100 text-emerald-800">
                        <FileSpreadsheet className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-bold text-slate-900">एक्सेल फाईल (.xlsx)</div>
                        <div className="text-[10px] text-slate-500 font-normal">
                          {selectedIds.size > 0
                            ? `निवडलेले ${selectedIds.size} रेकॉर्ड्स एक्सेलमध्ये डाऊनलोड करा`
                            : `फिल्टर केलेले ${filteredClaims.length} रेकॉर्ड्स डाऊनलोड करा`}
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleExportCSV(selectedIds.size > 0 ? 'selected' : 'filtered')}
                      className="w-full px-3.5 py-2.5 text-left hover:bg-blue-50/60 flex items-center gap-3 font-bold text-slate-800 cursor-pointer transition-colors"
                    >
                      <div className="p-2 rounded-lg bg-blue-100 text-blue-800">
                        <FileText className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-bold text-slate-900">CSV फाईल (.csv)</div>
                        <div className="text-[10px] text-slate-500 font-normal">
                          कॉमा सेपरेटेड व्हॅल्यू (Standard CSV)
                        </div>
                      </div>
                    </button>

                    {selectedIds.size > 0 && (
                      <button
                        type="button"
                        onClick={() => handleExportExcel('all')}
                        className="w-full px-3.5 py-2 text-left hover:bg-slate-50 flex items-center gap-3 font-semibold text-slate-700 border-t border-slate-100 cursor-pointer transition-colors"
                      >
                        <div className="p-2 rounded-lg bg-slate-100 text-slate-700">
                          <Download className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-bold text-slate-800">सर्व {oldClaims.length} रेकॉर्ड्स (.xlsx)</div>
                          <div className="text-[10px] text-slate-500 font-normal">
                            निवडीव्यतिरिक्त संपूर्ण जुना डेटा एक्सपोर्ट करा
                          </div>
                        </div>
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>

            <button
              onClick={() => {
                setPreviewRows([]);
                setImportErrors([]);
                setImportFile(null);
                setPasteText('');
                setIsImportModalOpen(true);
              }}
              className="py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs flex items-center gap-2 shadow-sm transition-all cursor-pointer"
              title="एक्सेल किंवा CSV फाईलमधून डेटा इम्पोर्ट करा"
            >
              <Upload className="w-4 h-4" />
              <span>इम्पोर्ट एक्सेल / CSV (Import Data)</span>
            </button>

            <button
              onClick={openNewModal}
              className="py-2.5 px-3.5 rounded-xl bg-blue-800/80 hover:bg-blue-700 active:scale-95 text-white font-semibold text-xs border border-blue-500/40 flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>+ जुना क्लेम जोडा</span>
            </button>
          </div>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">एकूण जुने क्लेम (Total)</div>
          <div className="text-2xl font-black text-slate-900 mt-1">{stats.totalCount}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">साठवलेल्या एकूण नोंदी</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">एकूण क्लेम रक्कम (Total ₹)</div>
          <div className="text-2xl font-black text-emerald-700 mt-1">₹{stats.totalAmount.toLocaleString('en-IN')}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">मंजूर / वितरित लाभ रक्कम</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">योजना १ रक्कम (Scheme 1)</div>
          <div className="text-2xl font-black text-blue-900 mt-1">₹{stats.scheme1Total.toLocaleString('en-IN')}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">मुख्य योजना वितरण</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs">
          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">ऑफिस नोंदी (From Office)</div>
          <div className="text-2xl font-black text-indigo-900 mt-1">{stats.officeCount}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">कार्यालयीन नोंदी</div>
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 w-full lg:w-auto flex-wrap">
            {/* Search Input */}
            <div className="relative flex-1 sm:w-80">
              <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search Name, MH Number, Mobile, Scheme, Taluka..."
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:bg-white focus:border-blue-600 focus:outline-none"
              />
            </div>

            {/* Taluka Filter */}
            <select
              value={talukaFilter}
              onChange={(e) => setTalukaFilter(e.target.value)}
              className="py-2 px-3 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-800 focus:bg-white focus:border-blue-600 focus:outline-none"
            >
              <option value="">सर्व तालुके (All Talukas)</option>
              {talukaList.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            {/* Scheme Filter */}
            <select
              value={schemeFilter}
              onChange={(e) => setSchemeFilter(e.target.value)}
              className="py-2 px-3 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-800 focus:bg-white focus:border-blue-600 focus:outline-none"
            >
              <option value="">सर्व योजना (All Schemes)</option>
              {schemeList.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>

            {/* From Source Filter */}
            <div className="min-w-[180px]">
              <FromSourceFilterSelect
                value={fromSourceFilter}
                onChange={setFromSourceFilter}
                options={fromSourceList}
                moduleType="claim"
                placeholder="सर्व स्त्रोत (From Source)"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 self-end lg:self-center flex-wrap">
            <button
              onClick={() => handleExportExcel('filtered')}
              className="py-2 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
              title="फिल्टर केलेला डेटा एक्सेल फाईलमध्ये (.xlsx) एक्सपोर्ट करा"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-white" />
              <span>Export Excel (.xlsx)</span>
            </button>

            <button
              onClick={() => handleExportCSV('filtered')}
              className="py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs border border-slate-300 flex items-center gap-1.5 transition-all cursor-pointer"
              title="फिल्टर केलेला डेटा CSV मध्ये (.csv) एक्सपोर्ट करा"
            >
              <FileText className="w-3.5 h-3.5 text-blue-700" />
              <span>Export CSV</span>
            </button>

            {currentUser?.role === 'admin' && oldClaims.length > 0 && (
              <button
                onClick={handleResetAll}
                className="py-2 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold text-xs border border-rose-200 flex items-center gap-1 transition-all cursor-pointer"
                title="सर्व जुना क्लेम डेटा रिसेट करा"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Reset All</span>
              </button>
            )}
          </div>
        </div>

        {/* Date Filter row */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 text-xs">
          <div className="flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-blue-700" />
            <span className="font-semibold text-slate-600">पडताळणी तारीख (Verification Date):</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-300 text-xs text-slate-800 focus:bg-white focus:border-blue-600"
            />
            <span className="text-slate-400">ते</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-300 text-xs text-slate-800 focus:bg-white focus:border-blue-600"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-medium">
              एकूण {oldClaims.length} पैकी <strong className="text-blue-900 font-black">{filteredClaims.length}</strong> नोंदी
            </span>
            {(searchTerm || talukaFilter || fromSourceFilter || schemeFilter || fromDate || toDate) && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setTalukaFilter('');
                  setFromSourceFilter('');
                  setSchemeFilter('');
                  setFromDate('');
                  setToDate('');
                }}
                className="py-1 px-2.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition-all cursor-pointer"
              >
                फिल्टर रिसेट (Clear)
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        {/* Bulk Selection Bar */}
        {selectedIds.size > 0 && (
          <div className="bg-blue-50 border-b border-blue-200 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-600 text-white font-black text-xs shadow-xs">
                <CheckSquare className="w-3.5 h-3.5" />
                <span>{selectedIds.size} नोंदी निवडल्या</span>
              </span>
              {selectedIds.size < filteredClaims.length && (
                <button
                  type="button"
                  onClick={selectAllFiltered}
                  className="text-blue-700 hover:text-blue-900 font-bold underline cursor-pointer ml-1"
                >
                  सर्व {filteredClaims.length} फिल्टर केलेल्या नोंदी निवडा
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleExportExcel('selected')}
                className="py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer flex items-center gap-1.5 shadow-2xs"
                title="निवडलेला डेटा एक्सेलमध्ये एक्सपोर्ट करा"
              >
                <Download className="w-3.5 h-3.5" />
                <span>निवडलेले {selectedIds.size} एक्सपोर्ट (.xlsx)</span>
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="py-1.5 px-3 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold cursor-pointer"
              >
                निवड रद्द करा (Deselect)
              </button>
              <button
                type="button"
                onClick={handleBulkDelete}
                disabled={isBulkDeleting}
                className="py-1.5 px-3.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>निवडलेले {selectedIds.size} रेकॉर्ड्स डिलीट करा</span>
              </button>
            </div>
          </div>
        )}

        {/* Quick Slide Header Controls */}
        <TableSlideControls
          onSlideLeft={() => oldClaimsTableRef.current?.scrollBy({ left: -320, behavior: 'smooth' })}
          onSlideRight={() => oldClaimsTableRef.current?.scrollBy({ left: 320, behavior: 'smooth' })}
          title="↔ Slide Table / माहिती सरकवा"
          subtitle="(डावीकडे / उजवीकडे सरकवण्यासाठी खालील बटने वापरा)"
        />

        <div ref={oldClaimsTableRef} className="overflow-x-auto scroll-smooth">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-900 text-white font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-3 py-3 w-10 text-center">
                  <div className="flex items-center justify-center">
                    <UiverseCheckbox
                      size={18}
                      checked={isAllCurrentPageSelected}
                      onChange={toggleSelectCurrentPage}
                      title={isAllCurrentPageSelected ? 'सर्व निवड रद्द करा' : 'या पानावरील सर्व निवडा'}
                      id="old-claims-header-select-all"
                    />
                  </div>
                </th>
                <th className="px-3 py-3 w-12 text-center">SR.NO</th>
                <th className="px-4 py-3 min-w-[180px]">NAME (कामगाराचे नाव)</th>
                <th className="px-4 py-3 min-w-[150px]">MHNUMBER</th>
                <th className="px-4 py-3 min-w-[130px]">VERIFICATION DATE</th>
                <th className="px-4 py-3 min-w-[120px]">TALUKA</th>
                <th className="px-3 py-3 min-w-[80px] text-center">SCHEME 1</th>
                <th className="px-3 py-3 min-w-[80px] text-center">SCHEME 2</th>
                <th className="px-4 py-3 min-w-[110px] text-right">SCHEME 1 AMT</th>
                <th className="px-4 py-3 min-w-[110px] text-right">SCHEME 2 AMT</th>
                <th className="px-4 py-3 min-w-[110px] text-right">TOTAL</th>
                <th className="px-4 py-3 min-w-[100px] text-center">FROM</th>
                <th className="px-4 py-3 min-w-[110px]">MOBILE NUMBER</th>
                <th className="px-4 py-3 min-w-[100px]">FORM FILL</th>
                <th className="px-4 py-3 text-right min-w-[90px]">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {filteredClaims.length === 0 ? (
                <tr>
                  <td colSpan={15} className="text-center py-12 text-slate-400">
                    <FileText className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-sm">कोणत्याही जुन्या क्लेम नोंदी आढळल्या नाहीत.</p>
                    <p className="text-xs mt-1 text-slate-500">
                      एक्सेल फाईल अपलोड करण्यासाठी वर दिलेल्या <strong>'इम्पोर्ट एक्सेल / CSV'</strong> बटणावर क्लिक करा.
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedClaims.map((claim, idx) => (
                  <tr
                    key={claim.id}
                    className={`hover:bg-slate-50/90 transition-colors ${
                      selectedIds.has(claim.id) ? 'bg-blue-50/70' : ''
                    }`}
                  >
                    <td className="px-3 py-3 text-center">
                      <div className="flex items-center justify-center">
                        <UiverseCheckbox
                          size={18}
                          checked={selectedIds.has(claim.id)}
                          onChange={() => toggleSelectId(claim.id)}
                          id={`old-claim-row-${claim.id}`}
                        />
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center font-bold text-slate-500">
                      {claim.srNo || (currentPage - 1) * pageSize + idx + 1}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-bold text-slate-900 uppercase tracking-tight">{claim.workerName}</div>
                      {claim.remarks && <div className="text-[10px] text-slate-400">{claim.remarks}</div>}
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-blue-800 text-[11px]">
                      {claim.mhNumber}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-700 whitespace-nowrap">
                      {claim.verificationDate}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-800 uppercase text-[11px]">
                      {claim.taluka}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-900 font-extrabold text-[11px]">
                        {claim.scheme1 || 'E05'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-bold text-[11px]">
                        {claim.scheme2 || '0'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-800">
                      ₹{claim.scheme1Amount.toLocaleString('en-IN')}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-500">
                      ₹{(claim.scheme2Amount || 0).toLocaleString('en-IN')}
                    </td>
                    <td className="px-4 py-3 text-right font-black text-emerald-700 text-sm whitespace-nowrap">
                      ₹{claim.totalAmount.toLocaleString('en-IN')}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-50 text-amber-900 border border-amber-200">
                        {claim.fromSource || 'OFFICE'}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-700 text-[11px]">
                      {claim.mobileNumber && claim.mobileNumber !== '0' ? (
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3 text-emerald-600" />
                          <span>{claim.mobileNumber}</span>
                        </span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600 text-[11px]">
                      {claim.formFill || '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditModal(claim)}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-blue-100 text-blue-700 border border-slate-200 transition-colors cursor-pointer"
                          title="Edit Old Claim Record"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmItem({ id: claim.id, name: claim.workerName })}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-100 text-rose-600 border border-slate-200 transition-colors cursor-pointer"
                          title="Delete Record"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {filteredClaims.length > 0 && (
          <div className="bg-slate-50 border-t border-slate-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
            <div className="flex items-center gap-2 font-medium">
              <span>
                दाखवत आहे{' '}
                <strong className="text-slate-900 font-bold">
                  {pageSize === -1 ? 1 : Math.min((currentPage - 1) * pageSize + 1, filteredClaims.length)}
                </strong>{' '}
                ते{' '}
                <strong className="text-slate-900 font-bold">
                  {pageSize === -1 ? filteredClaims.length : Math.min(currentPage * pageSize, filteredClaims.length)}
                </strong>{' '}
                (एकूण {filteredClaims.length})
              </span>

              <span className="text-slate-300">|</span>

              <div className="flex items-center gap-1">
                <span>प्रति पान:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="py-0.5 px-2 rounded border border-slate-300 bg-white text-xs font-semibold cursor-pointer"
                >
                  <option value="25">25</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                  <option value="200">200</option>
                  <option value="-1">सर्व (All)</option>
                </select>
              </div>
            </div>

            {pageSize !== -1 && totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-2 font-bold text-slate-700">
                  पान {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Import Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full border border-slate-200 shadow-2xl overflow-hidden my-6">
            <div className="bg-gradient-to-r from-blue-900 to-indigo-900 px-6 py-4 flex items-center justify-between text-white">
              <div className="flex items-center gap-2.5">
                <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="text-base font-black tracking-tight">
                    जुना क्लेम डेटा इम्पोर्ट (Import Old Claims Excel / CSV)
                  </h3>
                  <p className="text-xs text-blue-200">
                    तुमच्या कॉम्प्युटरमधील एक्सेल फाईल किंवा कॉपी केलेला डेटा जुन्या नोंदवहीत साठवा
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="p-1 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Top Mode Tabs and Sample Download */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setImportMode('file')}
                    className={`py-1.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      importMode === 'file'
                        ? 'bg-blue-900 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    📁 फाईल अपलोड (Upload File)
                  </button>
                  <button
                    type="button"
                    onClick={() => setImportMode('paste')}
                    className={`py-1.5 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      importMode === 'paste'
                        ? 'bg-blue-900 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    📋 डेटा पेस्ट करा (Paste from Excel)
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleDownloadSampleTemplate}
                  className="py-1.5 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-700" />
                  <span>सॅम्पल एक्सेल फॉरमॅट डाऊनलोड (Download Template)</span>
                </button>
              </div>

              {/* Error messages */}
              {importErrors.length > 0 && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 space-y-1">
                  {importErrors.map((err, i) => (
                    <div key={i} className="flex items-start gap-1.5 font-medium">
                      <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
                      <span>{err}</span>
                    </div>
                  ))}
                </div>
              )}

              {importMode === 'file' ? (
                <div>
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                        handleFileUpload(e.dataTransfer.files[0]);
                      }
                    }}
                    className="border-2 border-dashed border-slate-300 hover:border-blue-600 rounded-2xl p-8 text-center bg-slate-50/50 hover:bg-blue-50/30 transition-all cursor-pointer"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx, .xls, .csv"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          handleFileUpload(e.target.files[0]);
                        }
                      }}
                      className="hidden"
                    />
                    <Upload className="w-10 h-10 mx-auto text-blue-600 mb-3" />
                    <p className="text-sm font-bold text-slate-800">
                      {importFile ? importFile.name : 'एक्सेल किंवा CSV फाईल येथे ड्रॅग करा किंवा निवडा'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      सपोर्टेड फॉरमॅट: .xlsx, .xls, .csv (माहिती आपोआप ओळखून मॅप केली जाईल)
                    </p>
                    {importFile && (
                      <span className="inline-block mt-3 px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-lg border border-emerald-300">
                        ✓ फाईल निवडली: {importFile.name} ({(importFile.size / 1024).toFixed(1)} KB)
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-slate-600">
                    तुमच्या एक्सेल शीटमधील ओळी कॉपी करून खालील बॉक्समध्ये पेस्ट करा आणि 'डेटा तपासा' बटण दाबा:
                  </p>
                  <textarea
                    rows={6}
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    placeholder="SR.NO	NAME	MHNUMBER	VERIFICATIONDATE	TALUKA	SCHEME 1	SCHEME 2	SCHEME 1 AMOUNT	SCHEME 2 AMOUNT	TOTAL	FROM	MOBILE NUMBER	FORM FILL..."
                    className="w-full p-3 rounded-xl bg-slate-50 border border-slate-300 text-xs font-mono text-slate-800 focus:bg-white focus:border-blue-600 focus:outline-none"
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleParsePastedText}
                      className="py-2 px-4 rounded-xl bg-blue-900 hover:bg-blue-800 text-white font-bold text-xs cursor-pointer shadow-xs"
                    >
                      डेटा तपासा (Parse Data)
                    </button>
                  </div>
                </div>
              )}

              {/* Preview Table */}
              {previewRows.length > 0 && (
                <div className="space-y-3 pt-3 border-t border-slate-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-900 font-black text-xs border border-emerald-300">
                        ✓ {previewRows.length} नोंदी तयार आहेत
                      </span>
                      <span className="text-xs text-slate-500 font-semibold">
                        एकूण रक्कम:{' '}
                        <strong className="text-emerald-700">
                          ₹{previewRows.reduce((s, c) => s + c.totalAmount, 0).toLocaleString('en-IN')}
                        </strong>
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400">खाली पहिली १० रेकॉर्ड्सची तपासणी दिलेली आहे</span>
                  </div>

                  <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-xl overflow-x-auto text-[11px]">
                    <table className="w-full text-left text-slate-700">
                      <thead className="bg-slate-100 font-bold uppercase text-[10px] text-slate-600 sticky top-0">
                        <tr>
                          <th className="p-2">SR</th>
                          <th className="p-2">Name</th>
                          <th className="p-2">MH Number</th>
                          <th className="p-2">Date</th>
                          <th className="p-2">Taluka</th>
                          <th className="p-2">Scheme 1</th>
                          <th className="p-2">Total</th>
                          <th className="p-2">From</th>
                          <th className="p-2">Mobile</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {previewRows.slice(0, 10).map((row, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="p-2 font-bold">{row.srNo || i + 1}</td>
                            <td className="p-2 font-semibold text-slate-900">{row.workerName}</td>
                            <td className="p-2 font-mono text-blue-700">{row.mhNumber}</td>
                            <td className="p-2 whitespace-nowrap">{row.verificationDate}</td>
                            <td className="p-2">{row.taluka}</td>
                            <td className="p-2">{row.scheme1}</td>
                            <td className="p-2 font-bold text-emerald-700">₹{row.totalAmount.toLocaleString('en-IN')}</td>
                            <td className="p-2">{row.fromSource}</td>
                            <td className="p-2 font-mono">{row.mobileNumber}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-slate-50 px-6 py-4 flex items-center justify-between border-t border-slate-200">
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="py-2 px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold text-xs cursor-pointer"
              >
                रद्द करा (Cancel)
              </button>

              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={previewRows.length === 0 || isImporting}
                className="py-2.5 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black text-xs shadow-md flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed transition-all"
              >
                {isImporting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>इम्पोर्ट होत आहे...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>सर्व {previewRows.length} नोंदी इम्पोर्ट करा (Confirm Import)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Add / Edit Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full border border-slate-200 shadow-2xl overflow-hidden my-6">
            <div className="bg-slate-900 px-6 py-4 flex items-center justify-between text-white">
              <h3 className="text-base font-black tracking-tight">
                {editingClaim ? 'जुना क्लेम रेकॉर्ड दुरुस्त करा (Edit Old Claim)' : 'नवीन जुना क्लेम जोडा (Add Old Claim)'}
              </h3>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded-lg hover:bg-white/20 text-white/80 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveClaim} className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">SR. NO (अनुक्रमांक)</label>
                  <input
                    type="number"
                    value={formData.srNo}
                    onChange={(e) => setFormData({ ...formData, srNo: e.target.value })}
                    className="w-full p-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 font-bold"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">पडताळणी तारीख (Verification Date) *</label>
                  <input
                    type="text"
                    value={formData.verificationDate}
                    onChange={(e) => setFormData({ ...formData, verificationDate: e.target.value })}
                    placeholder="उदा. 16-12-2025"
                    className="w-full p-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">कामगाराचे नाव (Worker Name) *</label>
                <input
                  type="text"
                  value={formData.workerName}
                  onChange={(e) => setFormData({ ...formData, workerName: e.target.value })}
                  placeholder="उदा. SUREKHA BALASAHEB NAWALE"
                  className="w-full p-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 uppercase font-bold"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">MH नोंदणी क्र. (MH Number) *</label>
                  <input
                    type="text"
                    value={formData.mhNumber}
                    onChange={(e) => setFormData({ ...formData, mhNumber: e.target.value })}
                    placeholder="उदा. MH131080020138"
                    className="w-full p-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-mono font-bold text-blue-900"
                    required
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">तालुका (Taluka) *</label>
                  <input
                    type="text"
                    value={formData.taluka}
                    onChange={(e) => setFormData({ ...formData, taluka: e.target.value })}
                    placeholder="उदा. AMBEGAON / JUNNAR"
                    className="w-full p-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 uppercase font-bold"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">योजना १ कोड (Scheme 1)</label>
                  <input
                    type="text"
                    value={formData.scheme1}
                    onChange={(e) => setFormData({ ...formData, scheme1: e.target.value })}
                    placeholder="उदा. E05 किंवा E03"
                    className="w-full p-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">योजना २ कोड (Scheme 2)</label>
                  <input
                    type="text"
                    value={formData.scheme2}
                    onChange={(e) => setFormData({ ...formData, scheme2: e.target.value })}
                    placeholder="उदा. 0"
                    className="w-full p-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">योजना १ रक्कम (₹)</label>
                  <input
                    type="number"
                    value={formData.scheme1Amount}
                    onChange={(e) => handleAmountChange(e.target.value, formData.scheme2Amount)}
                    className="w-full p-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold text-slate-800"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">योजना २ रक्कम (₹)</label>
                  <input
                    type="number"
                    value={formData.scheme2Amount}
                    onChange={(e) => handleAmountChange(formData.scheme1Amount, e.target.value)}
                    className="w-full p-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold text-slate-800"
                  />
                </div>

                <div>
                  <label className="font-bold text-emerald-800 block mb-1">एकूण रक्कम (Total ₹) *</label>
                  <input
                    type="number"
                    value={formData.totalAmount}
                    onChange={(e) => setFormData({ ...formData, totalAmount: e.target.value })}
                    className="w-full p-2 rounded-xl bg-emerald-50 border border-emerald-300 text-xs font-black text-emerald-800"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">स्त्रोत (From)</label>
                  <input
                    type="text"
                    value={formData.fromSource}
                    onChange={(e) => setFormData({ ...formData, fromSource: e.target.value })}
                    placeholder="उदा. OFFICE"
                    className="w-full p-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold uppercase"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">मोबाईल क्र. (Mobile)</label>
                  <input
                    type="text"
                    value={formData.mobileNumber}
                    onChange={(e) => setFormData({ ...formData, mobileNumber: e.target.value })}
                    placeholder="उदा. 9561440929 किंवा 0"
                    className="w-full p-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1">फॉर्म भरला (Form Fill)</label>
                  <input
                    type="text"
                    value={formData.formFill}
                    onChange={(e) => setFormData({ ...formData, formFill: e.target.value })}
                    placeholder="ऑपरेटरचे नाव"
                    className="w-full p-2 rounded-xl bg-slate-50 border border-slate-300 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">टिप्पणी / शेरा (Remarks)</label>
                <input
                  type="text"
                  value={formData.remarks}
                  onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                  placeholder="उदा. ऑफलाईन रजिस्टर पृष्ठ क्र."
                  className="w-full p-2 rounded-xl bg-slate-50 border border-slate-300 text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="py-2 px-4 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold cursor-pointer"
                >
                  रद्द करा
                </button>
                <button
                  type="submit"
                  className="py-2 px-5 rounded-xl bg-blue-900 hover:bg-blue-800 text-white font-black cursor-pointer shadow-xs"
                >
                  {editingClaim ? 'बदल सेव्ह करा' : 'दाखल करा (Save Claim)'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 p-6 space-y-4 shadow-xl">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 rounded-xl bg-rose-100">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-black text-slate-900 text-base">जुना क्लेम रेकॉर्ड डिलीट करा?</h4>
                <p className="text-xs text-slate-500">हा रेकॉर्ड जुन्या डेटाबेसमधून काढला जाईल.</p>
              </div>
            </div>
            <p className="text-xs font-semibold text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-200">
              कामगाराचे नाव: <strong className="text-slate-900">{deleteConfirmItem.name}</strong>
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmItem(null)}
                className="py-1.5 px-3.5 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold cursor-pointer"
              >
                रद्द करा
              </button>
              <button
                type="button"
                onClick={() => handleDeleteSingle(deleteConfirmItem.id)}
                className="py-1.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer shadow-xs"
              >
                कायमचे डिलीट करा
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
