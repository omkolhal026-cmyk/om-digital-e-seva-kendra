import React, { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  UserPlus,
  Search,
  Filter,
  Printer,
  Download,
  Edit,
  Trash2,
  FileText,
  Upload,
  Camera,
  X,
  CheckCircle2,
  Eye,
  Plus,
  Building2,
  Phone,
  CreditCard,
  MapPin,
  Calendar,
  RotateCcw,
  Check,
  AlertTriangle,
  Clock,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  RefreshCw,
  ArrowLeftRight,
  Copy,
} from 'lucide-react';
import { WorkerRegistration, User } from '../types';
import { MAHARASHTRA_TALUKAS, VERIFICATION_TALUKAS } from '../data/mockData';
import { FromSourceFilterSelect } from './FromSourceFilterSelect';
import { UiverseCheckbox } from './UiverseCheckbox';
import { TableSlideControls } from './TableSlideControls';
import { UiverseButton } from './UiverseButton';
import {
  exportToCSV,
  printFormattedElement,
  formatDate,
  normalizeDateToYMD,
  formatDateWithMarathi,
  canSwapDateMonth,
  swapDateAndMonth,
  parseExcelDateStrict,
  type DateParseOptions,
} from '../utils/exportUtils';

interface RegistrationModuleProps {
  registrations: WorkerRegistration[];
  currentUser: User;
  users?: User[];
  onAddRegistration: (reg: Omit<WorkerRegistration, 'id'>) => Promise<void>;
  onAddRegistrationsBulk?: (regs: Omit<WorkerRegistration, 'id'>[]) => Promise<any>;
  onUpdateRegistration: (id: string, reg: Partial<WorkerRegistration>) => Promise<void>;
  onDeleteRegistration: (id: string) => Promise<void>;
  onDeleteRegistrationsBulk?: (ids: string[]) => Promise<void>;
  onOpenPrintSlip: (type: 'registration', data: any) => void;
  onClearRegistrations?: () => void;
}

const SOURCE_OPTIONS = [
  'E-Seva Kendra',
  'Gram Panchayat',
  'CSC Center',
  'MahaOnline',
  'Direct Application',
  'Mukkadam / Agent',
  'Other Office',
];

const defaultNextYearDate = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().split('T')[0];
};

export const RegistrationModule: React.FC<RegistrationModuleProps> = ({
  registrations,
  currentUser,
  users = [],
  onAddRegistration,
  onAddRegistrationsBulk,
  onUpdateRegistration,
  onDeleteRegistration,
  onDeleteRegistrationsBulk,
  onOpenPrintSlip,
  onClearRegistrations,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTaluka, setSelectedTaluka] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedOperator, setSelectedOperator] = useState('');
  const [fromSourceFilter, setFromSourceFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCustomOperator, setIsCustomOperator] = useState(false);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<{ id: string; name: string; mhNumber?: string } | null>(null);
  const [viewDetailsReg, setViewDetailsReg] = useState<WorkerRegistration | null>(null);
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
    registrations.forEach((r) => {
      if (r.operatorName) list.add(r.operatorName);
    });
    return Array.from(list).filter(Boolean).sort();
  }, [users, currentUser?.name, registrations]);

  const getInitialFormData = () => ({
    workerName: '',
    aadhaarNumber: '',
    mobileNumber: '',
    taluka: '',
    registrationDate: new Date().toISOString().split('T')[0],
    fromSource: '',
    operatorName: currentUser.name,
    appStatus: 'Pending' as 'Pending' | 'Accepted',
    mhNumber: '',
    nextRenewalDate: '',
    fatherName: '',
    dob: '',
    gender: 'Male' as 'Male' | 'Female' | 'Other',
    address: '',
    village: '',
    district: '',
    pincode: '',
    bankName: '',
    accountNumber: '',
    ifsc: '',
    verificationDate: '',
    feePaid: 100,
    paymentAmount: undefined as number | undefined,
    paymentMode: 'Cash' as 'Cash' | 'Online' | 'N/A',
    documents: {
      photo: '',
      aadhaarCard: '',
      passbook: '',
      otherDoc: '',
    },
  });

  // Form State
  const [formData, setFormData] = useState(getInitialFormData());
  const [formSubmitting, setFormSubmitting] = useState(false);

  const handleOpenAddModal = () => {
    setEditingId(null);
    setFormData(getInitialFormData());
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (reg: WorkerRegistration) => {
    setEditingId(reg.id);
    const isAccepted = reg.status === 'Active' || reg.status === 'Accepted' || reg.appStatus === 'Accepted';
    setFormData({
      workerName: reg.workerName || '',
      aadhaarNumber: reg.aadhaarNumber || '',
      mobileNumber: reg.mobileNumber || '',
      taluka: reg.taluka || 'Junnar',
      registrationDate: reg.registrationDate || new Date().toISOString().split('T')[0],
      fromSource: reg.fromSource || '',
      operatorName: reg.operatorName || currentUser.name,
      appStatus: isAccepted ? 'Accepted' : 'Pending',
      mhNumber: reg.mhNumber || '',
      nextRenewalDate: reg.nextRenewalDate || '',
      fatherName: reg.fatherName || '',
      dob: reg.dob || '',
      gender: (reg.gender as 'Male' | 'Female' | 'Other') || 'Male',
      address: reg.address || '',
      village: reg.village || '',
      district: reg.district || '',
      pincode: reg.pincode || '',
      bankName: reg.bankName || '',
      accountNumber: reg.accountNumber || '',
      ifsc: reg.ifsc || '',
      verificationDate: reg.verificationDate || new Date().toISOString().split('T')[0],
      feePaid: reg.feePaid || 100,
      paymentAmount: reg.paymentAmount,
      paymentMode: reg.paymentMode || 'Cash',
      documents: {
        photo: reg.documents?.photo || '',
        aadhaarCard: reg.documents?.aadhaarCard || '',
        passbook: reg.documents?.passbook || '',
        otherDoc: reg.documents?.otherDoc || '',
      },
    });
    setIsModalOpen(true);
  };

  // Duplicate validations
  const rawAadhaar = formData.aadhaarNumber.replace(/\D/g, '');
  const isDuplicateAadhaar =
    rawAadhaar.length === 12 &&
    registrations.some(
      (r) => r.id !== editingId && r.aadhaarNumber.replace(/\D/g, '') === rawAadhaar
    );

  const cleanMh = formData.mhNumber.trim();
  const isDuplicateMh =
    formData.appStatus === 'Accepted' &&
    cleanMh.length > 0 &&
    registrations.some(
      (r) => r.id !== editingId && r.mhNumber.toLowerCase().trim() === cleanMh.toLowerCase()
    );

  const handleResetForm = () => {
    setFormData(getInitialFormData());
  };

  const handleProcessSubmit = async (e?: React.FormEvent, andPrint = false) => {
    if (e) e.preventDefault();

    if (!formData.workerName.trim()) {
      alert('Full Name is required.');
      return;
    }

    if (rawAadhaar.length !== 12) {
      alert('Aadhaar Number must be exactly 12 digits.');
      return;
    }

    if (isDuplicateAadhaar) {
      alert('Duplicate Aadhaar Number detected! An entry with this Aadhaar already exists.');
      return;
    }

    const rawMobile = formData.mobileNumber.replace(/\D/g, '');
    if (rawMobile.length !== 10) {
      alert('Mobile Number must be exactly 10 digits.');
      return;
    }

    if (formData.appStatus === 'Accepted') {
      const cleanMhVal = formData.mhNumber.trim().toUpperCase();
      const mhDigits = cleanMhVal.replace(/^MH/i, '').replace(/\D/g, '');
      if (!formData.mhNumber.trim()) {
        alert('MH Registration Number is required when status is Accepted.');
        return;
      }
      if (mhDigits.length !== 12 || !/^MH\d{12}$/.test(cleanMhVal)) {
        alert('MH Registration Number must have EXACTLY 12 digits after MH (e.g. MH123456789012). Neither less nor more.');
        return;
      }
      if (isDuplicateMh) {
        alert('Duplicate MH Registration Number detected! Enter a unique MH Number.');
        return;
      }
      if (!formData.nextRenewalDate) {
        alert('Next Renewal Date is required.');
        return;
      }
    }

    setFormSubmitting(true);
    try {
      const statusMapped = formData.appStatus === 'Accepted' ? 'Active' : 'Pending Verification';
      const finalMhNumber = formData.appStatus === 'Accepted' ? formData.mhNumber.trim().toUpperCase() : '';

      const effPaymentAmount = formData.paymentMode === 'N/A'
        ? 0
        : (formData.paymentAmount !== undefined && formData.paymentAmount !== null && !isNaN(Number(formData.paymentAmount)) 
            ? Number(formData.paymentAmount) 
            : (Number(formData.feePaid) || 100));

      const recordPayload: Omit<WorkerRegistration, 'id'> = {
        ...formData,
        workerName: formData.workerName.trim(),
        aadhaarNumber: formData.aadhaarNumber,
        mobileNumber: formData.mobileNumber,
        mhNumber: finalMhNumber,
        status: statusMapped as any,
        appStatus: formData.appStatus,
        operatorName: formData.operatorName || currentUser.name,
        fromSource: formData.fromSource,
        nextRenewalDate: formData.nextRenewalDate,
        feePaid: effPaymentAmount,
        paymentAmount: effPaymentAmount,
        paymentMode: formData.paymentMode || 'Cash',
        createdByUserId: currentUser.id,
        createdBy: currentUser.name || currentUser.username,
      };

      let savedRecord: WorkerRegistration;

      if (editingId) {
        await onUpdateRegistration(editingId, recordPayload);
        savedRecord = { id: editingId, ...recordPayload } as WorkerRegistration;
      } else {
        const newId = `WRK-${Date.now().toString().slice(-5)}`;
        await onAddRegistration(recordPayload as any);
        savedRecord = { id: newId, ...recordPayload } as WorkerRegistration;
      }

      setIsModalOpen(false);

      if (andPrint) {
        onOpenPrintSlip('registration', savedRecord);
      }
    } catch (err: any) {
      alert(err.message || 'Error saving worker registration.');
    } finally {
      setFormSubmitting(false);
    }
  };

  // Format Aadhaar Number without spaces: 123456789012
  const handleAadhaarChange = (val: string) => {
    const raw = val.replace(/\D/g, '').slice(0, 12);
    setFormData({ ...formData, aadhaarNumber: raw });
  };

  const uniqueOperators = Array.from(
    new Set(registrations.map((r) => r.operatorName).filter(Boolean))
  ).sort();

  const fromSourceOptions = React.useMemo(() => {
    const set = new Set<string>();
    registrations.forEach((r) => {
      if (r.fromSource?.trim()) set.add(r.fromSource.trim());
    });
    return Array.from(set).sort();
  }, [registrations]);

  // Filter Registrations
  const filteredRegs = registrations.filter((r) => {
    const matchesSearch =
      r.workerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.mhNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.aadhaarNumber.includes(searchTerm) ||
      r.mobileNumber.includes(searchTerm) ||
      r.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.village && r.village.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesTaluka = !selectedTaluka || r.taluka === selectedTaluka;
    const matchesStatus =
      !selectedStatus ||
      r.status === selectedStatus ||
      (selectedStatus === 'Active' && r.status === 'Accepted') ||
      (selectedStatus === 'Pending' && (r.status === 'Pending Verification' || r.status === 'Pending'));
    const matchesOperator = !selectedOperator || r.operatorName === selectedOperator;
    const matchesFromSource =
      !fromSourceFilter ||
      Boolean(r.fromSource && r.fromSource.toLowerCase().includes(fromSourceFilter.trim().toLowerCase()));
    const matchesFromDate = !fromDate || (r.registrationDate && r.registrationDate >= fromDate);
    const matchesToDate = !toDate || (r.registrationDate && r.registrationDate <= toDate);

    return matchesSearch && matchesTaluka && matchesStatus && matchesOperator && matchesFromSource && matchesFromDate && matchesToDate;
  });

  // Reset page when filter inputs change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedTaluka, selectedStatus, selectedOperator, fromSourceFilter, fromDate, toDate]);

  const totalPages = Math.max(1, Math.ceil(filteredRegs.length / (pageSize === -1 ? filteredRegs.length || 1 : pageSize)));
  const paginatedRegs = React.useMemo(() => {
    if (pageSize === -1) return filteredRegs;
    const start = (currentPage - 1) * pageSize;
    return filteredRegs.slice(start, start + pageSize);
  }, [filteredRegs, currentPage, pageSize]);

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
    paginatedRegs.length > 0 && paginatedRegs.every((r) => selectedIds.has(r.id));

  const toggleSelectCurrentPage = () => {
    if (isAllCurrentPageSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        paginatedRegs.forEach((r) => next.delete(r.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        paginatedRegs.forEach((r) => next.add(r.id));
        return next;
      });
    }
  };

  const selectAllFiltered = () => {
    setSelectedIds(new Set(filteredRegs.map((r) => r.id)));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const openDeleteSelectedModal = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const selectedItems = registrations.filter((r) => selectedIds.has(r.id));
    const sampleNames = selectedItems.slice(0, 4).map((r) => `${r.workerName} (${r.mhNumber || r.id})`);
    setBulkDeleteModal({
      isOpen: true,
      ids,
      title: `निवडलेले ${ids.length} फॉर्म डिलीट करा (Delete Selected Forms)`,
      description: `तुम्हाला खरोखर निवडलेले ${ids.length} नोंदणी फॉर्म डेटाबेसमधून कायमचे डिलीट करायचे आहेत का?`,
      sampleNames,
    });
  };

  const openDeleteFilteredModal = () => {
    const ids = filteredRegs.map((r) => r.id);
    if (ids.length === 0) return;
    const sampleNames = filteredRegs.slice(0, 4).map((r) => `${r.workerName} (${r.mhNumber || r.id})`);
    setBulkDeleteModal({
      isOpen: true,
      ids,
      title: `सर्व फिल्टर केलेले ${ids.length} फॉर्म डिलीट करा (Delete All Filtered Forms)`,
      description: `सध्या फिल्टर केलेले सर्व ${ids.length} नोंदणी फॉर्म कायमचे डिलीट करायचे आहेत का?`,
      sampleNames,
    });
  };

  const handleExecuteBulkDelete = async () => {
    if (!bulkDeleteModal || bulkDeleteModal.ids.length === 0) return;
    setIsBulkDeleting(true);
    try {
      if (onDeleteRegistrationsBulk) {
        await onDeleteRegistrationsBulk(bulkDeleteModal.ids);
      } else {
        for (const id of bulkDeleteModal.ids) {
          await onDeleteRegistration(id);
        }
      }
      setSelectedIds((prev) => {
        const next = new Set(prev);
        bulkDeleteModal.ids.forEach((id) => next.delete(id));
        return next;
      });
      setBulkDeleteModal(null);
    } catch (err: any) {
      alert(err?.message || 'नोंदणी डिलीट करण्यात अडचण आली.');
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const [importing, setImporting] = useState(false);

  // Excel Import Preview & Date Configuration Modal State
  const [excelImportModal, setExcelImportModal] = useState<{
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

  // Swap Dates Modal for selected registrations
  const [swapDatesModalOpen, setSwapDatesModalOpen] = useState(false);
  const [swappingDates, setSwappingDates] = useState(false);

  const buildParsedRecords = (rawRows: Record<string, any>[], options?: DateParseOptions): (Omit<WorkerRegistration, 'id'> & { id?: string })[] => {
    const parsedRecords: (Omit<WorkerRegistration, 'id'> & { id?: string })[] = [];
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

      const rawRegId = getVal('Registration ID', 'RegistrationId', 'Reg ID', 'RegID', 'ID', 'अनुक्रमांक');
      const workerName = getVal('Worker Name', 'Name', 'नाव', 'कामगाराचे नाव', 'workerName');
      if (!workerName) continue;

      const mhNumber = getVal('MH Number', 'MH No', 'MH', 'एमएच नंबर', 'Registration No', 'mhNumber');
      const aadhaarNumber = getVal('Aadhaar Number', 'Aadhaar', 'आधार', 'आधार क्रमांक', 'aadhaarNumber');
      const mobileNumber = getVal('Mobile Number', 'Mobile', 'मोबाईल', 'मोबाईल नंबर', 'mobileNumber');
      const gender = (getVal('Gender', 'लिंग', 'gender') || 'Male') as any;

      // Strict Date Parsing: check for invalid/ambiguous dates (don't reject blank/dash)
      const rawDob = getVal('Date of Birth', 'DOB', 'जन्म तारीख', 'dob');
      const dobRes = parseExcelDateStrict(rawDob, options);
      if (rawDob && !dobRes.valid && !dobRes.isBlank) {
        // Block row with genuinely invalid date
        continue;
      }
      const dob = dobRes.valid ? dobRes.ymd : '1990-01-01';

      const address = getVal('Address', 'पत्ता', 'address') || 'Village Address';
      const taluka = getVal('Taluka', 'तालुका', 'taluka') || 'Junnar';
      const district = getVal('District', 'जिल्हा', 'district') || 'Pune';
      const pincode = getVal('Pincode', 'पिनकोड', 'pincode') || '410502';
      const category = (getVal('Category', 'प्रवर्ग', 'category') || 'Open') as any;
      const maritalStatus = (getVal('Marital Status', 'वैवाहिक स्थिती', 'maritalStatus') || 'Married') as any;
      const workType = getVal('Work Type', 'कामाचे स्वरूप', 'workType') || 'Building Construction Worker';

      const rawRegDate = getVal('Registration Date', 'RegistrationDate', 'तारीख', 'दिनांक', 'नोंदणी तारीख', 'नोंदणी दिनांक', 'registrationDate');
      const regDateRes = parseExcelDateStrict(rawRegDate, options);
      if (rawRegDate && !regDateRes.valid && !regDateRes.isBlank) {
        // Block row with genuinely invalid date
        continue;
      }
      const registrationDate = regDateRes.valid ? regDateRes.ymd : new Date().toISOString().split('T')[0];

      const rawVerDate = getVal('Verification Date', 'VerificationDate', 'पडताळणी तारीख', 'पडताळणी दिनांक', 'वेरिफिकेशन तारीख', 'verificationDate');
      const verDateRes = parseExcelDateStrict(rawVerDate, options);
      if (rawVerDate && !verDateRes.valid && !verDateRes.isBlank) {
        // Block row with genuinely invalid date
        continue;
      }
      const verificationDate = verDateRes.valid ? verDateRes.ymd : '';

      const fromSource = getVal('From', 'From Source', 'Source', 'माध्यम', 'स्रोत', 'fromSource') || 'E-Seva Kendra';
      const rawStatus = getVal('Status', 'स्थिती', 'status') || 'Pending Verification';
      const normalizedStatus = (rawStatus.toLowerCase().includes('pending') || rawStatus.toLowerCase().includes('verification'))
        ? 'Pending Verification'
        : (rawStatus.toLowerCase().includes('active') || rawStatus.toLowerCase().includes('accepted') ? 'Active' : rawStatus);

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

      const rawNextRen = getVal('Next Renewal Date', 'NextRenewalDate', 'पुढील नूतनीकरण तारीख', 'नूतनीकरण तारीख');
      const nextRenRes = parseExcelDateStrict(rawNextRen, options);
      const nextRenewalDate = nextRenRes.valid ? nextRenRes.ymd : '';

      const recordPayload: Omit<WorkerRegistration, 'id'> & { id?: string } = {
        ...(rawRegId ? { id: String(rawRegId).trim() } : {}),
        registrationDate,
        verificationDate,
        workerName,
        fatherName: getVal('Father Name', 'पती/वडिलांचे नाव') || 'S/o ' + workerName,
        aadhaarNumber: aadhaarNumber.replace(/\D/g, '').slice(0, 12) || '123456789012',
        mobileNumber: mobileNumber.replace(/\D/g, '').slice(0, 10) || '9876543210',
        gender,
        dob,
        category,
        address,
        village: getVal('Village', 'गाव') || taluka,
        taluka,
        district,
        pincode,
        natureOfWork: workType,
        bankName: getVal('Bank Name', 'बँकेचे नाव') || 'State Bank of India',
        accountNumber: getVal('Account Number', 'खाते क्रमांक') || '1234567890',
        ifsc: getVal('IFSC', 'आयएफएससी') || 'SBIN0001234',
        feePaid: 100,
        documents: { photo: '', aadhaarCard: '', passbook: '', otherDoc: '' },
        status: normalizedStatus as any,
        appStatus: (normalizedStatus === 'Active' || normalizedStatus === 'Accepted') ? 'Accepted' : 'Pending',
        mhNumber: mhNumber ? mhNumber.trim().toUpperCase() : '',
        operatorName: formFilledBy || currentUser.name,
        fromSource,
        nextRenewalDate,
      };

      parsedRecords.push(recordPayload as any);
    }
    return parsedRecords;
  };

  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
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

      setExcelImportModal({
        isOpen: true,
        fileName: file.name,
        rawRows,
        preferFormat: 'DMY',
        swapDayMonth: false,
      });
    } catch (err: any) {
      alert('एक्सेल फाईल वाचताना त्रुटी आली: ' + err.message);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirmExcelImport = async () => {
    if (!excelImportModal.rawRows || excelImportModal.rawRows.length === 0) return;
    setImporting(true);
    try {
      const options: DateParseOptions = {
        preferFormat: excelImportModal.preferFormat,
        swapDayMonth: excelImportModal.swapDayMonth,
      };
      const parsedRecords = buildParsedRecords(excelImportModal.rawRows, options);

      let importedCount = 0;
      if (onAddRegistrationsBulk) {
        const batchSize = 100;
        for (let i = 0; i < parsedRecords.length; i += batchSize) {
          const batch = parsedRecords.slice(i, i + batchSize);
          await onAddRegistrationsBulk(batch);
          importedCount += batch.length;
        }
      } else {
        for (const rec of parsedRecords) {
          await onAddRegistration(rec as any);
          importedCount++;
        }
      }

      alert(`अभिनंदन! एक्सेल फाईलमधून ${importedCount} कामगार नोंदी अचूक तारखांसह यशस्वीरित्या सेव्ह झाल्या आहेत.`);
      setExcelImportModal({ isOpen: false, fileName: '', rawRows: [], preferFormat: 'DMY', swapDayMonth: false });
    } catch (err: any) {
      alert('एक्सेल फाईल इम्पोर्ट करताना त्रुटी आली: ' + err.message);
    } finally {
      setImporting(false);
    }
  };

  const handleConfirmSwapSelectedDates = async () => {
    setSwappingDates(true);
    try {
      const selectedList = registrations.filter((r) => selectedIds.has(r.id));
      let swappedCount = 0;
      for (const reg of selectedList) {
        const newRegDate = reg.registrationDate ? swapDateAndMonth(reg.registrationDate) : '';
        const newVerDate = reg.verificationDate ? swapDateAndMonth(reg.verificationDate) : '';
        const newDob = reg.dob ? swapDateAndMonth(reg.dob) : '';

        const updates: Partial<WorkerRegistration> = {};
        if (newRegDate && newRegDate !== reg.registrationDate) {
          updates.registrationDate = newRegDate;
        }
        if (newVerDate && newVerDate !== reg.verificationDate) {
          updates.verificationDate = newVerDate;
        }
        if (newDob && newDob !== reg.dob) {
          updates.dob = newDob;
        }

        if (Object.keys(updates).length > 0) {
          await onUpdateRegistration(reg.id, updates);
          swappedCount++;
        }
      }
      alert(`यशस्वी! ${swappedCount} नोंदींमधील तारीख आणि महिना (Day ⇄ Month) अदलाबदल करण्यात आला आहे.`);
      setSwapDatesModalOpen(false);
      setSelectedIds(new Set());
    } catch (err: any) {
      alert('तारखा बदलताना त्रुटी आली: ' + err.message);
    } finally {
      setSwappingDates(false);
    }
  };

  const handleExportCSV = () => {
    const exportRows = filteredRegs.map((r) => ({
      'Registration ID': r.id,
      'MH Number': r.mhNumber,
      'Worker Name': r.workerName,
      'Mobile': r.mobileNumber,
      'Aadhaar Number': r.aadhaarNumber,
      'Taluka': r.taluka,
      'Registration Date': r.registrationDate,
      'Verification Date': r.verificationDate || '',
      'From': r.fromSource || 'E-Seva Kendra',
      'Operator': r.operatorName,
      'Status': r.status,
      'Next Renewal Date': r.nextRenewalDate || '-',
    }));
    exportToCSV('MBOCWW_Worker_Registrations', exportRows);
  };

  return (
    <div className="space-y-6">
      {/* Hidden File Input for Excel Import */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleExcelImport}
        accept=".xlsx, .xls, .csv"
        className="hidden"
      />

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-blue-700" />
            <span>कामगार नोंदणी अर्ज (Worker Registration Entry)</span>
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            Register new construction workers, set application statuses, manage MH numbers & print slips
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="py-2 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
            <span>{importing ? 'इम्पोर्ट होत आहे...' : 'Import Excel / CSV'}</span>
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

          {currentUser.role === 'admin' && onClearRegistrations && registrations.length > 0 && (
            <button
              onClick={onClearRegistrations}
              className="py-2 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95"
              title="Clear all worker registrations"
            >
              <Trash2 className="w-4 h-4 text-rose-600" />
              <span>सर्व नोंदणी हटवा (Clear All)</span>
            </button>
          )}

          <UiverseButton
            onClick={handleOpenAddModal}
            variant="blue"
            size="sm"
            icon={<Plus className="w-4 h-4" />}
          >
            New Registration Entry
          </UiverseButton>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="lg:col-span-2 relative">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search Worker Name, MH No, Aadhaar, Mobile, Village..."
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white"
            />
          </div>

          <div>
            <FromSourceFilterSelect
              value={fromSourceFilter}
              onChange={setFromSourceFilter}
              options={fromSourceOptions}
              moduleType="registration"
              placeholder="सर्व स्त्रोत (All From)..."
            />
          </div>

          <div>
            <select
              value={selectedTaluka}
              onChange={(e) => setSelectedTaluka(e.target.value)}
              className="w-full py-2 px-3 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white"
            >
              <option value="">All Talukas (सर्व तालुके)</option>
              {MAHARASHTRA_TALUKAS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full py-2 px-3 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white"
            >
              <option value="">All Application Statuses (सर्व स्थिती)</option>
              <option value="Active">Active (सक्रिय / स्वीकृत)</option>
              <option value="Pending">Pending (प्रलंबित)</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 text-xs">
          <div className="flex items-center flex-wrap gap-2">
            <div className="flex items-center gap-1.5 font-bold text-slate-700">
              <Calendar className="w-4 h-4 text-blue-700" />
              <span>नोंदणी तारीख (Reg Date):</span>
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
              एकूण {registrations.length} पैकी <strong className="text-blue-900 font-black">{filteredRegs.length}</strong> नोंदी सापडल्या
            </span>
            {(searchTerm || selectedTaluka || selectedStatus || selectedOperator || fromSourceFilter || fromDate || toDate) && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setSelectedTaluka('');
                    setSelectedStatus('');
                    setSelectedOperator('');
                    setFromSourceFilter('');
                    setFromDate('');
                    setToDate('');
                  }}
                  className="py-1 px-2.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition-all cursor-pointer"
                >
                  फिल्टर रिसेट (Clear Filters)
                </button>
                {filteredRegs.length > 0 && (
                  <button
                    type="button"
                    onClick={openDeleteFilteredModal}
                    className="py-1 px-3 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-xs"
                    title="सध्या फिल्टर केलेले सर्व फॉर्म डिलीट करा"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>फिल्टर केलेले सर्व ({filteredRegs.length}) डिलीट करा</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Registrations Table */}
      <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
        {/* Bulk Selection Actions Bar */}
        {selectedIds.size > 0 && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-200 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-600 text-white font-black text-xs shadow-xs">
                <CheckSquare className="w-3.5 h-3.5" />
                <span>{selectedIds.size} फॉर्म निवडले</span>
              </span>
              {selectedIds.size < filteredRegs.length && (
                <button
                  type="button"
                  onClick={selectAllFiltered}
                  className="text-blue-700 hover:text-blue-900 font-bold underline cursor-pointer ml-1"
                >
                  सर्व {filteredRegs.length} फिल्टर केलेले फॉर्म निवडा (Select All Filtered)
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
              <button
                type="button"
                onClick={() => setSwapDatesModalOpen(true)}
                className="py-1.5 px-3.5 rounded-lg bg-amber-600 hover:bg-amber-700 active:scale-95 text-white font-bold shadow-xs cursor-pointer flex items-center gap-1.5 transition-all"
                title="निवडलेल्या नोंदींमधील तारीख आणि महिना (Day ⇄ Month) अदलाबदल करा"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>तारीख ⇄ महिना बदला (Swap Date/Month)</span>
              </button>
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
          onSlideLeft={() => tableContainerRef.current?.scrollBy({ left: -320, behavior: 'smooth' })}
          onSlideRight={() => tableContainerRef.current?.scrollBy({ left: 320, behavior: 'smooth' })}
          title="↔ Slide Table / माहिती सरकवा"
          subtitle="(डावीकडे / उजवीकडे सरकवण्यासाठी खालील बटने वापरा)"
        />

        <div ref={tableContainerRef} className="overflow-x-auto max-h-[65vh] overflow-y-auto scroll-smooth">
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
                      id="reg-header-select-all"
                    />
                  </div>
                </th>
                <th className="p-3 sticky left-10 bg-slate-100 z-30 shadow-xs border-r border-slate-200/80 min-w-[140px]">
                  <span>MH Reg No & ID</span>
                </th>
                <th className="p-3 min-w-[150px]">
                  <span>Worker Name</span>
                </th>
                <th className="p-3 min-w-[140px]">
                  <span>Aadhaar & Mobile</span>
                </th>
                <th className="p-3 min-w-[150px]">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1 text-slate-800">
                      <Filter className="w-3 h-3 text-blue-600" />
                      <span>Taluka & Source</span>
                    </div>
                    <select
                      value={selectedTaluka}
                      onChange={(e) => setSelectedTaluka(e.target.value)}
                      className="w-full text-[10px] font-semibold normal-case py-0.5 px-1 bg-white border border-slate-300 rounded focus:border-blue-600 focus:outline-none cursor-pointer"
                    >
                      <option value="">सर्व तालुके (All)</option>
                      {VERIFICATION_TALUKAS.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </th>
                <th className="p-3 min-w-[130px]">
                  <span>Reg Date</span>
                </th>
                <th className="p-3 min-w-[130px]">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1 text-slate-800">
                      <Filter className="w-3 h-3 text-blue-600" />
                      <span>Filled By</span>
                    </div>
                    <select
                      value={selectedOperator}
                      onChange={(e) => setSelectedOperator(e.target.value)}
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
                      <span>Status</span>
                    </div>
                    <select
                      value={selectedStatus}
                      onChange={(e) => setSelectedStatus(e.target.value)}
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
              {paginatedRegs.map((reg) => (
                <tr key={reg.id} className={`hover:bg-slate-50/80 transition-colors ${selectedIds.has(reg.id) ? 'bg-blue-50/60' : ''}`}>
                  <td className="p-3 text-center sticky left-0 bg-white/95 backdrop-blur-xs z-10 border-r border-slate-200/60">
                    <div className="flex items-center justify-center">
                      <UiverseCheckbox
                        size={18}
                        checked={selectedIds.has(reg.id)}
                        onChange={() => toggleSelectId(reg.id)}
                        id={`reg-row-${reg.id}`}
                      />
                    </div>
                  </td>
                  <td className="p-3.5 whitespace-nowrap sticky left-10 bg-white/95 backdrop-blur-xs z-10 border-r border-slate-200/60 shadow-xs">
                    {(reg.status === 'Active' || reg.appStatus === 'Accepted') && reg.mhNumber && !reg.mhNumber.startsWith('PENDING-') ? (
                      <div>
                        <div className="flex items-center gap-1.5 font-bold text-blue-700 font-mono">
                          <span>{reg.mhNumber}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyMh(reg.mhNumber);
                            }}
                            className={`p-1 rounded border transition-all cursor-pointer ${
                              copiedMh === reg.mhNumber
                                ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                                : 'bg-slate-50 hover:bg-blue-100 text-slate-500 hover:text-blue-700 border-slate-200'
                            }`}
                            title="MH नंबर कॉपी करा (Copy MH Number)"
                          >
                            {copiedMh === reg.mhNumber ? (
                              <Check className="w-3 h-3 text-emerald-600 stroke-[3]" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                        {reg.matchSource && (
                          <div className="text-[9px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.2 rounded w-max mt-0.5">
                            {reg.matchSource}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-[10px] font-bold text-amber-600 bg-amber-50/80 border border-amber-200/80 px-2 py-0.5 rounded-md w-max">
                        Pending
                      </div>
                    )}
                    <div className="text-[10px] text-slate-400 font-mono">{reg.id}</div>
                  </td>

                  <td className="p-3.5 min-w-[160px]">
                    <div className="font-bold text-slate-900">{reg.workerName}</div>
                    {reg.nextRenewalDate && (
                      <div className="text-[10px] text-slate-500 font-medium">
                        Next Renewal: {formatDate(reg.nextRenewalDate)}
                      </div>
                    )}
                  </td>

                  <td className="p-3.5 whitespace-nowrap">
                    <div className="font-mono text-slate-800 font-medium">{reg.aadhaarNumber?.replace(/\s+/g, '')}</div>
                    <div className="text-[10px] text-slate-500 font-medium">{reg.mobileNumber}</div>
                  </td>

                  <td className="p-3.5 whitespace-nowrap">
                    <div className="text-slate-900 font-bold">{reg.taluka}</div>
                    <div className="text-[10px] text-slate-500 font-medium">
                      From: {reg.fromSource || '-'}
                    </div>
                  </td>

                  <td className="p-3.5 whitespace-nowrap text-slate-700 font-mono text-[11px]">
                    <div>Reg: {formatDate(reg.registrationDate)}</div>
                    {reg.verificationDate && (
                      <div className="mt-1 px-1.5 py-0.5 bg-amber-100/90 text-amber-950 font-black border border-amber-300/90 rounded text-[10px] w-max flex items-center gap-1 shadow-2xs">
                        <span>Verif: {formatDate(reg.verificationDate)}</span>
                      </div>
                    )}
                  </td>

                  <td className="p-3.5 whitespace-nowrap text-slate-600 text-[11px] font-medium">
                    {reg.operatorName}
                  </td>

                  <td className="p-3.5 whitespace-nowrap">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1 w-fit ${
                        reg.status === 'Active' || reg.appStatus === 'Accepted'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-amber-50 text-amber-800 border-amber-200'
                      }`}
                    >
                      {reg.status === 'Active' || reg.appStatus === 'Accepted' ? (
                        <>
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                          <span>Accepted</span>
                        </>
                      ) : (
                        <>
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                          <span>Pending</span>
                        </>
                      )}
                    </span>
                  </td>

                  <td className="p-3.5 whitespace-nowrap text-right space-x-1 sticky right-0 bg-white/95 backdrop-blur-xs z-10 border-l border-slate-200/60 shadow-xs">
                    <button
                      onClick={() => setViewDetailsReg(reg)}
                      className="p-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 transition-colors cursor-pointer"
                      title="View Details (तपशील पहा)"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => onOpenPrintSlip('registration', reg)}
                      className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition-colors cursor-pointer"
                      title="Print Worker Card / Slip"
                    >
                      <Printer className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => handleOpenEditModal(reg)}
                      className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-colors cursor-pointer"
                      title="Edit Record"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => setDeleteConfirmItem({ id: reg.id, name: reg.workerName, mhNumber: reg.mhNumber })}
                      className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition-colors cursor-pointer"
                      title="Delete Registration (हटवा)"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}

              {filteredRegs.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-500 text-xs">
                    No matching worker registration records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {filteredRegs.length > 0 && (
          <div className="bg-slate-50 border-t border-slate-200 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
            <div className="flex items-center gap-2 font-medium">
              <span>
                दाखवत आहे{' '}
                <strong className="text-slate-900 font-bold">
                  {pageSize === -1 ? 1 : Math.min((currentPage - 1) * pageSize + 1, filteredRegs.length)}
                </strong>{' '}
                ते{' '}
                <strong className="text-slate-900 font-bold">
                  {pageSize === -1 ? filteredRegs.length : Math.min(currentPage * pageSize, filteredRegs.length)}
                </strong>{' '}
                (एकूण <strong className="text-blue-900 font-bold">{filteredRegs.length}</strong> नोंदी)
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

      {/* Add / Edit Registration Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white border border-slate-200/90 rounded-3xl max-w-2xl w-full p-6 shadow-2xl relative my-8 text-slate-900 space-y-5">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-5 right-5 p-2 rounded-xl bg-slate-100 text-slate-500 hover:text-slate-900 border border-slate-200"
              title="Close Modal"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Title Header */}
            <div className="border-b border-slate-200 pb-3">
              <div className="text-xs font-mono font-bold text-blue-700 tracking-wider uppercase mb-1">
                ==========================
              </div>
              <h3 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-blue-700" />
                <span>NEW REGISTRATION</span>
              </h3>
              <div className="text-xs font-mono font-bold text-blue-700 tracking-wider uppercase mt-1">
                ==========================
              </div>
            </div>

            <form onSubmit={(e) => handleProcessSubmit(e, false)} className="space-y-6">
              {/* BASIC DETAILS SECTION */}
              <div className="space-y-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 bg-slate-100 py-1 px-2.5 rounded-lg w-fit">
                  Basic Details
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {/* 1. Full Name * */}
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      1. Full Name *
                    </label>
                    <input
                      type="text"
                      value={formData.workerName}
                      onChange={(e) => setFormData({ ...formData, workerName: e.target.value })}
                      placeholder="Enter worker full name"
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-medium text-slate-900 focus:border-blue-600 focus:bg-white"
                      required
                    />
                  </div>

                  {/* 2. Aadhaar Number * */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-xs font-bold text-slate-800">
                        2. Aadhaar Number *
                      </label>
                      <span className="text-[10px] text-slate-500 font-semibold">12 Digits</span>
                    </div>
                    <input
                      type="text"
                      value={formData.aadhaarNumber}
                      onChange={(e) => handleAadhaarChange(e.target.value)}
                      placeholder="12 digit Aadhaar"
                      className={`w-full px-3.5 py-2 rounded-xl bg-slate-50 border text-xs font-mono text-slate-900 focus:bg-white ${
                        isDuplicateAadhaar
                          ? 'border-rose-500 bg-rose-50 focus:border-rose-600'
                          : 'border-slate-300 focus:border-blue-600'
                      }`}
                      required
                    />
                    {isDuplicateAadhaar && (
                      <div className="text-[10px] text-rose-700 font-bold mt-1 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3 text-rose-600" />
                        <span>Duplicate Aadhaar! Record already exists.</span>
                      </div>
                    )}
                  </div>

                  {/* 3. Mobile Number * */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-xs font-bold text-slate-800">
                        3. Mobile Number *
                      </label>
                      <span className="text-[10px] text-slate-500 font-semibold">10 Digits</span>
                    </div>
                    <input
                      type="text"
                      maxLength={10}
                      value={formData.mobileNumber}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          mobileNumber: e.target.value.replace(/\D/g, '').slice(0, 10),
                        })
                      }
                      placeholder="10 digit mobile number"
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-mono text-slate-900 focus:border-blue-600 focus:bg-white"
                      required
                    />
                  </div>

                  {/* 4. Verification Taluka * */}
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      4. Verification Taluka *
                    </label>
                    <select
                      value={formData.taluka}
                      onChange={(e) => setFormData({ ...formData, taluka: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold text-slate-900 focus:border-blue-600 focus:bg-white"
                      required
                    >
                      <option value="">Select Verification Taluka</option>
                      {VERIFICATION_TALUKAS.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* 5. Registration Date */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-xs font-bold text-slate-800">
                        5. Registration Date / नोंदणी तारीख
                      </label>
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, registrationDate: new Date().toISOString().split('T')[0] })}
                        className="text-[10px] text-blue-700 hover:text-blue-900 font-bold underline cursor-pointer"
                        title="आजची तारीख सेट करा"
                      >
                        Auto Today (आजची तारीख)
                      </button>
                    </div>
                    <input
                      type="date"
                      value={formData.registrationDate || ''}
                      onChange={(e) => setFormData({ ...formData, registrationDate: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-mono font-bold text-slate-900 focus:border-blue-600 focus:bg-white"
                      title="नोंदणी तारीख (आवश्यकतेनुसार बदलू शकता)"
                    />
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      आजची तारीख आपोआप येईल, आवश्यक असल्यास बदलू शकता (Editable).
                    </p>
                  </div>

                  {/* 6. Verification Date / पडताळणी तारीख */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-xs font-bold text-slate-800">
                        6. Verification Date / पडताळणी तारीख
                      </label>
                    </div>
                    <input
                      type="date"
                      value={formData.verificationDate || ''}
                      onChange={(e) => setFormData({ ...formData, verificationDate: e.target.value })}
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-mono font-bold text-slate-900 focus:border-blue-600 focus:bg-white"
                    />
                  </div>

                  {/* 7. From * */}
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      7. From *
                    </label>
                    <input
                      type="text"
                      value={formData.fromSource}
                      onChange={(e) => setFormData({ ...formData, fromSource: e.target.value })}
                      placeholder="Enter location / source"
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-medium text-slate-900 focus:border-blue-600 focus:bg-white"
                      required
                    />
                  </div>

                  {/* 8. Form Filled By */}
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="block text-xs font-bold text-slate-800">
                        8. Form Filled By (ऑपरेटरचे नाव) *
                      </label>
                      <span className="text-[10px] text-blue-700 font-bold">
                        {currentUser.role === 'admin' ? 'Admin Select Dropdown' : 'Auto Fill (Logged Operator)'}
                      </span>
                    </div>
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
                          <option value="__custom__">➕ इतर नवीन नाव टाईप करा (Type Custom Name)</option>
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
                        className="w-full px-3.5 py-2 rounded-xl bg-slate-100 border border-slate-300 text-xs font-bold text-slate-800 cursor-not-allowed"
                        readOnly
                      />
                    )}
                  </div>
                </div>
              </div>

              <div className="border-t border-dashed border-slate-300"></div>

              {/* APPLICATION STATUS SECTION */}
              <div className="space-y-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 bg-slate-100 py-1 px-2.5 rounded-lg w-fit">
                  Application Status
                </h4>

                <div className="flex flex-wrap items-center gap-4 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                  <label className="flex items-center gap-2 cursor-pointer p-2 rounded-xl hover:bg-white transition-all">
                    <input
                      type="radio"
                      name="appStatus"
                      value="Pending"
                      checked={formData.appStatus === 'Pending'}
                      onChange={() => setFormData({ ...formData, appStatus: 'Pending' })}
                      className="w-4 h-4 text-amber-500 focus:ring-amber-400"
                    />
                    <span className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
                      <span>🟡</span>
                      <span>Pending</span>
                    </span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer p-2 rounded-xl hover:bg-white transition-all">
                    <input
                      type="radio"
                      name="appStatus"
                      value="Accepted"
                      checked={formData.appStatus === 'Accepted'}
                      onChange={() => setFormData({ ...formData, appStatus: 'Accepted' })}
                      className="w-4 h-4 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="text-xs font-bold text-emerald-800 flex items-center gap-1.5">
                      <span>🟢</span>
                      <span>Accepted</span>
                    </span>
                  </label>

                  <span className="text-[11px] text-slate-500 font-medium italic ml-auto">
                    (Default : Pending)
                  </span>
                </div>
              </div>

              {/* IF ACCEPTED CONDITIONAL SECTION */}
              {formData.appStatus === 'Accepted' && (
                <>
                  <div className="border-t border-dashed border-slate-300"></div>
                  <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200/90 space-y-3">
                    <h4 className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                      <span>If Accepted</span>
                    </h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                      {/* MH Registration Number (Manual Entry) */}
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="block text-xs font-bold text-slate-800">
                            MH Registration Number *
                          </label>
                          <span className="text-[10px] text-blue-800 font-bold">Format: MH123456789012</span>
                        </div>
                        <input
                          type="text"
                          maxLength={14}
                          value={formData.mhNumber}
                          onChange={(e) => {
                            let clean = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
                            let formatted = clean;
                            if (clean.startsWith('MH')) {
                              const digits = clean.slice(2).replace(/\D/g, '').slice(0, 12);
                              formatted = 'MH' + digits;
                            } else if (/^\d/.test(clean)) {
                              const digits = clean.replace(/\D/g, '').slice(0, 12);
                              formatted = 'MH' + digits;
                            } else {
                              formatted = clean.slice(0, 14);
                            }
                            setFormData({ ...formData, mhNumber: formatted });
                          }}
                          placeholder="e.g. MH123456789012"
                          className={`w-full px-3.5 py-2 rounded-xl bg-white border text-xs font-mono font-bold text-slate-900 focus:border-blue-600 ${
                            isDuplicateMh ? 'border-rose-500 bg-rose-50' : 'border-slate-300'
                          }`}
                          required={formData.appStatus === 'Accepted'}
                        />
                        {isDuplicateMh && (
                          <div className="text-[10px] text-rose-700 font-bold mt-1 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3 text-rose-600" />
                            <span>MH Registration Number already exists!</span>
                          </div>
                        )}
                      </div>

                      {/* Next Renewal Date * */}
                      <div>
                        <label className="block text-xs font-bold text-slate-800 mb-1">
                          Next Renewal Date (नूतनीकरण तारीख - Manual) *
                        </label>
                        <input
                          type="date"
                          value={formData.nextRenewalDate}
                          onChange={(e) =>
                            setFormData({ ...formData, nextRenewalDate: e.target.value })
                          }
                          className="w-full px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-xs font-mono font-bold text-slate-900 focus:border-blue-600"
                          required={formData.appStatus === 'Accepted'}
                        />
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <span className="text-[10px] text-slate-500 font-medium">तारीख निवडा:</span>
                          <button
                            type="button"
                            onClick={() => {
                              const base = formData.registrationDate ? new Date(formData.registrationDate) : new Date();
                              base.setFullYear(base.getFullYear() + 1);
                              setFormData({ ...formData, nextRenewalDate: base.toISOString().split('T')[0] });
                            }}
                            className="px-2 py-0.5 text-[10px] font-bold bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 rounded-md transition-colors cursor-pointer"
                          >
                            +१ वर्ष
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const base = formData.registrationDate ? new Date(formData.registrationDate) : new Date();
                              base.setFullYear(base.getFullYear() + 3);
                              setFormData({ ...formData, nextRenewalDate: base.toISOString().split('T')[0] });
                            }}
                            className="px-2 py-0.5 text-[10px] font-bold bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 rounded-md transition-colors cursor-pointer"
                          >
                            +३ वर्षे
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const base = formData.registrationDate ? new Date(formData.registrationDate) : new Date();
                              base.setFullYear(base.getFullYear() + 5);
                              setFormData({ ...formData, nextRenewalDate: base.toISOString().split('T')[0] });
                            }}
                            className="px-2 py-0.5 text-[10px] font-bold bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 rounded-md transition-colors cursor-pointer"
                          >
                            +५ वर्षे
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              <div className="border-t border-dashed border-slate-300"></div>

              {/* PAYMENT SECTION */}
              <div className="space-y-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 bg-slate-100 py-1 px-2.5 rounded-lg w-fit">
                  PAYMENT
                </h4>

                <div className="bg-slate-50/70 p-3.5 rounded-2xl border border-slate-200 space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-800 mb-1">
                      Amount (₹)
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
                      }}
                      placeholder="Enter amount"
                      className="w-full max-w-xs px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-900 focus:border-blue-600 focus:bg-white"
                    />
                  </div>

                  <div className="pt-1">
                    <div className="flex items-center gap-6">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="regPaymentMode"
                          value="Cash"
                          checked={(formData.paymentMode || 'Cash') === 'Cash'}
                          onChange={() => setFormData({ ...formData, paymentMode: 'Cash' })}
                          className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-xs font-bold text-slate-800">Cash</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="regPaymentMode"
                          value="Online"
                          checked={formData.paymentMode === 'Online'}
                          onChange={() => setFormData({ ...formData, paymentMode: 'Online' })}
                          className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-xs font-bold text-slate-800">Online</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="regPaymentMode"
                          value="N/A"
                          checked={formData.paymentMode === 'N/A'}
                          onChange={() => setFormData({ ...formData, paymentMode: 'N/A', paymentAmount: 0 })}
                          className="w-4 h-4 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-xs font-bold text-slate-800">N/A</span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-200"></div>

              {/* BUTTONS SECTION */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-300 flex items-center gap-1.5 transition-all"
                  >
                    <X className="w-4 h-4 text-slate-600" />
                    <span>Cancel</span>
                  </button>

                  {editingId && (
                    <button
                      type="button"
                      onClick={() => {
                        const targetId = editingId;
                        const targetName = formData.workerName;
                        const targetMh = formData.mhNumber;
                        setIsModalOpen(false);
                        setDeleteConfirmItem({ id: targetId, name: targetName, mhNumber: targetMh });
                      }}
                      className="py-2.5 px-4 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold border border-rose-300 flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4 text-rose-600" />
                      <span>Delete Record</span>
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleResetForm}
                    className="py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold border border-slate-300 flex items-center gap-1.5 transition-all"
                  >
                    <RotateCcw className="w-4 h-4 text-slate-600" />
                    <span>Reset</span>
                  </button>


                  <button
                    type="submit"
                    disabled={formSubmitting || isDuplicateAadhaar || isDuplicateMh}
                    className="py-2.5 px-6 rounded-xl brand-gradient hover:opacity-95 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" />
                    <span>{formSubmitting ? 'Saving...' : 'Save'}</span>
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
                  रेकॉर्ड डिलीट करा? (Delete Registration)
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
              {deleteConfirmItem.mhNumber && (
                <div>
                  <span className="font-semibold text-slate-500">MH Reg No:</span>{' '}
                  <span className="font-bold text-blue-700 font-mono">{deleteConfirmItem.mhNumber}</span>
                </div>
              )}
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
                  await onDeleteRegistration(id);
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

      {/* VIEW WORKER DETAILS MODAL WITH HIGHLIGHTED VERIFICATION DATE */}
      {viewDetailsReg && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200/90 rounded-3xl max-w-xl w-full p-6 shadow-2xl relative text-slate-900 space-y-4 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setViewDetailsReg(null)}
              className="absolute top-5 right-5 p-2 rounded-xl bg-slate-100 text-slate-500 hover:text-slate-900 border border-slate-200 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 border-b border-slate-200 pb-3">
              <div className="p-3 rounded-2xl bg-blue-50 text-blue-800 border border-blue-200">
                <Eye className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900">{viewDetailsReg.workerName}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-xs font-bold text-blue-800 font-mono">
                    <span>MH: {viewDetailsReg.mhNumber || 'Pending'}</span>
                    {viewDetailsReg.mhNumber && !viewDetailsReg.mhNumber.startsWith('PENDING-') && (
                      <button
                        type="button"
                        onClick={() => handleCopyMh(viewDetailsReg.mhNumber)}
                        className={`ml-1 px-1.5 py-0.5 rounded border text-[10px] font-sans font-extrabold flex items-center gap-1 transition-all cursor-pointer ${
                          copiedMh === viewDetailsReg.mhNumber
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-white hover:bg-blue-100 text-blue-700 border-blue-300'
                        }`}
                        title="MH नंबर कॉपी करा (Copy MH Number)"
                      >
                        {copiedMh === viewDetailsReg.mhNumber ? (
                          <>
                            <Check className="w-3 h-3 stroke-[3]" />
                            <span>Copied ✓</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
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
                    {formatDate(viewDetailsReg.verificationDate)}
                  </div>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full bg-amber-300 text-amber-950 text-xs font-black border border-amber-400 shadow-2xs">
                {viewDetailsReg.verificationDate ? 'VERIFIED' : 'PENDING'}
              </span>
            </div>

            {/* Full Details Grid */}
            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <div><span className="text-slate-500 font-medium">System ID:</span> <span className="font-mono font-bold text-slate-900">{viewDetailsReg.id}</span></div>
              <div><span className="text-slate-500 font-medium">Mobile Number:</span> <span className="font-mono font-bold text-slate-900">{viewDetailsReg.mobileNumber}</span></div>
              <div><span className="text-slate-500 font-medium">Aadhaar Number:</span> <span className="font-mono font-bold text-slate-900">{viewDetailsReg.aadhaarNumber?.replace(/\s+/g, '')}</span></div>
              <div><span className="text-slate-500 font-medium">Taluka:</span> <span className="font-bold text-slate-900">{viewDetailsReg.taluka}</span></div>
              <div><span className="text-slate-500 font-medium">Registration Date:</span> <span className="font-bold text-slate-900">{formatDate(viewDetailsReg.registrationDate)}</span></div>
              <div><span className="text-slate-500 font-medium">Next Renewal Date:</span> <span className="font-bold text-slate-900">{formatDate(viewDetailsReg.nextRenewalDate)}</span></div>
              <div><span className="text-slate-500 font-medium">Application Source:</span> <span className="font-semibold text-slate-800">{viewDetailsReg.fromSource || '-'}</span></div>
              <div><span className="text-slate-500 font-medium">Filled By:</span> <span className="font-semibold text-slate-800">{viewDetailsReg.operatorName}</span></div>
              {viewDetailsReg.dob && <div><span className="text-slate-500 font-medium">Date of Birth:</span> <span className="font-semibold text-slate-800">{formatDate(viewDetailsReg.dob)}</span></div>}
              {viewDetailsReg.gender && <div><span className="text-slate-500 font-medium">Gender:</span> <span className="font-semibold text-slate-800">{viewDetailsReg.gender}</span></div>}
              {viewDetailsReg.bankName && <div><span className="text-slate-500 font-medium">Bank Name:</span> <span className="font-semibold text-slate-800">{viewDetailsReg.bankName}</span></div>}
              {viewDetailsReg.accountNumber && <div><span className="text-slate-500 font-medium">Account No:</span> <span className="font-mono font-semibold text-slate-800">{viewDetailsReg.accountNumber}</span></div>}
              {viewDetailsReg.paymentAmount !== undefined && (
                <div><span className="text-slate-500 font-medium">Payment:</span> <span className="font-bold text-slate-900">₹{viewDetailsReg.paymentAmount} ({viewDetailsReg.paymentMode || 'Cash'})</span></div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setViewDetailsReg(null)}
                className="py-2.5 px-5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs border border-slate-300 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EXCEL IMPORT PREVIEW & DATE CONFIGURATION MODAL */}
      {excelImportModal.isOpen && (
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
                    Excel डेटा इम्पोर्ट - पूर्वावलोकन आणि तारीख सेटिंग्ज
                  </h3>
                  <p className="text-xs text-slate-600 font-medium mt-0.5">
                    फाईल: <span className="font-bold text-slate-800">{excelImportModal.fileName}</span> • एकूण नोंदी:{' '}
                    <span className="font-bold text-emerald-700">{excelImportModal.rawRows.length}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setExcelImportModal({ isOpen: false, fileName: '', rawRows: [], preferFormat: 'DMY', swapDayMonth: false })}
                disabled={importing}
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
                  भारतीय तारीख स्वरूप: <strong className="text-emerald-700">DD-MM-YYYY</strong>
                </span>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs max-h-72 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-slate-100 z-10">
                    <tr className="border-b border-slate-200 text-slate-700 font-bold">
                      <th className="p-2.5 w-10 text-center">अ.क्र.</th>
                      <th className="p-2.5">ID</th>
                      <th className="p-2.5">कामगाराचे नाव</th>
                      <th className="p-2.5">नोंदणी तारीख (Reg Date)</th>
                      <th className="p-2.5">पडताळणी तारीख (Ver Date)</th>
                      <th className="p-2.5">माध्यम / ऑपरेटर</th>
                      <th className="p-2.5 text-center">स्थिती</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 bg-white">
                    {excelImportModal.rawRows.slice(0, 10).map((row, idx) => {
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

                      const regId = getRowVal('Registration ID', 'RegistrationId', 'Reg ID', 'RegID', 'ID', 'अनुक्रमांक');
                      const name = getRowVal('Worker Name', 'Name', 'नाव', 'कामगाराचे नाव', 'workerName') || 'Worker ' + (idx + 1);
                      const rawReg = getRowVal('Registration Date', 'RegistrationDate', 'तारीख', 'दिनांक', 'registrationDate');
                      const regRes = parseExcelDateStrict(rawReg);
                      const rawVer = getRowVal('Verification Date', 'VerificationDate', 'पडताळणी तारीख', 'verificationDate');
                      const verRes = parseExcelDateStrict(rawVer);
                      const fromSrc = getRowVal('From', 'From Source', 'माध्यम');
                      const opName = getRowVal('Operator', 'Operator Name', 'Form Filled By');
                      const statusVal = getRowVal('Status', 'स्थिती') || 'Pending Verification';

                      return (
                        <tr key={idx} className="hover:bg-blue-50/40 transition-colors">
                          <td className="p-2.5 text-center font-mono text-slate-500 font-bold">{idx + 1}</td>
                          <td className="p-2.5 font-mono text-slate-600 font-semibold">{regId || '-'}</td>
                          <td className="p-2.5 font-bold text-slate-900 whitespace-nowrap">{name}</td>
                          <td className="p-2.5">
                            <div className="font-mono font-bold text-emerald-800">
                              {regRes.valid ? regRes.display : (regRes.isBlank ? '-' : 'Invalid Date')}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {regRes.valid ? regRes.marathiDisplay.split('(')[1]?.replace(')', '') : ''}
                            </div>
                          </td>
                          <td className="p-2.5">
                            <div className="font-mono font-bold text-blue-800">
                              {verRes.valid ? verRes.display : (verRes.isBlank ? '-' : 'Invalid Date')}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              {verRes.valid ? verRes.marathiDisplay.split('(')[1]?.replace(')', '') : ''}
                            </div>
                          </td>
                          <td className="p-2.5 text-slate-600 text-[11px]">
                            {fromSrc ? <span className="font-semibold text-slate-800">{fromSrc}</span> : '-'}
                            {opName ? <div className="text-slate-500 text-[10px]">{opName}</div> : null}
                          </td>
                          <td className="p-2.5 text-center">
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md border border-amber-200">
                              {statusVal}
                            </span>
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
                onClick={() => setExcelImportModal({ isOpen: false, fileName: '', rawRows: [], preferFormat: 'DMY', swapDayMonth: false })}
                disabled={importing}
                className="py-2.5 px-5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs border border-slate-300 cursor-pointer transition-all"
              >
                रद्द करा (Cancel)
              </button>
              <button
                type="button"
                onClick={handleConfirmExcelImport}
                disabled={importing}
                className="py-2.5 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md cursor-pointer flex items-center gap-2 transition-all active:scale-95 disabled:opacity-50"
              >
                {importing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>इम्पोर्ट प्रक्रिया सुरू आहे...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>सर्व {excelImportModal.rawRows.length} नोंदी अचूक तारखांसह इम्पोर्ट करा</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SWAP SELECTED DATES MODAL */}
      {swapDatesModalOpen && (
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
                    निवडलेल्या <span className="font-bold text-amber-700">{selectedIds.size}</span> कामगार नोंदी
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSwapDatesModalOpen(false)}
                disabled={swappingDates}
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
                निवडलेल्या नोंदींमधील ज्या तारखांमध्ये दिवस (Day) आणि महिना (Month) दोन्ही १२ किंवा त्यापेक्षा कमी आहेत,
                त्यांचा दिवस आणि महिना उलट-सुलट केला जाईल. (उदा. <strong>04/09 ➔ 09/04</strong> किंवा <strong>09/04 ➔ 04/09</strong>).
              </p>
            </div>

            {/* Preview of selected rows that will change */}
            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-700">बदल होणाऱ्या नोंदींचे पूर्वावलोकन:</div>
              <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100 text-xs">
                {registrations
                  .filter((r) => selectedIds.has(r.id))
                  .slice(0, 10)
                  .map((r) => {
                    const originalRegDate = r.registrationDate;
                    const swappedRegDate = swapDateAndMonth(r.registrationDate);
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
                            <span className="text-slate-500">नोंदणी: </span>
                            <span className="line-through text-slate-400 mr-1">{formatDate(originalRegDate)}</span>
                            <span className="font-bold text-emerald-700 font-mono">
                              ➔ {formatDateWithMarathi(swappedRegDate)}
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
                onClick={() => setSwapDatesModalOpen(false)}
                disabled={swappingDates}
                className="py-2 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs border border-slate-300 cursor-pointer"
              >
                रद्द करा
              </button>
              <button
                type="button"
                onClick={handleConfirmSwapSelectedDates}
                disabled={swappingDates}
                className="py-2 px-5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-md cursor-pointer flex items-center gap-2 active:scale-95 disabled:opacity-50"
              >
                {swappingDates ? (
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

