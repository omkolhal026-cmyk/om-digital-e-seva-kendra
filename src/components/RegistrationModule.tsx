import React, { useState, useRef } from 'react';
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
} from 'lucide-react';
import { WorkerRegistration, User } from '../types';
import { MAHARASHTRA_TALUKAS, VERIFICATION_TALUKAS } from '../data/mockData';
import { exportToCSV, printFormattedElement, formatDate, normalizeDateToYMD } from '../utils/exportUtils';

interface RegistrationModuleProps {
  registrations: WorkerRegistration[];
  currentUser: User;
  users?: User[];
  onAddRegistration: (reg: Omit<WorkerRegistration, 'id'>) => Promise<void>;
  onUpdateRegistration: (id: string, reg: Partial<WorkerRegistration>) => Promise<void>;
  onDeleteRegistration: (id: string) => Promise<void>;
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
  onUpdateRegistration,
  onDeleteRegistration,
  onOpenPrintSlip,
  onClearRegistrations,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTaluka, setSelectedTaluka] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedOperator, setSelectedOperator] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCustomOperator, setIsCustomOperator] = useState(false);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<{ id: string; name: string; mhNumber?: string } | null>(null);
  const [viewDetailsReg, setViewDetailsReg] = useState<WorkerRegistration | null>(null);

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
    const matchesFromDate = !fromDate || (r.registrationDate && r.registrationDate >= fromDate);
    const matchesToDate = !toDate || (r.registrationDate && r.registrationDate <= toDate);

    return matchesSearch && matchesTaluka && matchesStatus && matchesOperator && matchesFromDate && matchesToDate;
  });

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const tableContainerRef = useRef<HTMLDivElement | null>(null);
  const [importing, setImporting] = useState(false);

  const handleExcelImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet);

      if (!rawRows || rawRows.length === 0) {
        alert('एक्सेल फाईलमध्ये कोणताही डेटा सापडला नाही!');
        setImporting(false);
        return;
      }

      let importedCount = 0;
      for (const row of rawRows) {
        const getVal = (...keys: string[]) => {
          for (const k of keys) {
            const foundKey = Object.keys(row).find(
              (rk) => rk.toLowerCase().trim() === k.toLowerCase().trim() || rk.trim().includes(k)
            );
            if (foundKey && row[foundKey] !== undefined && row[foundKey] !== null) {
              return String(row[foundKey]).trim();
            }
          }
          return '';
        };

        const workerName = getVal('Worker Name', 'Name', 'नाव', 'कामगाराचे नाव', 'workerName');
        if (!workerName) continue;

        const mhNumber = getVal('MH Number', 'MH No', 'MH', 'एमएच नंबर', 'Registration No', 'mhNumber');
        const aadhaarNumber = getVal('Aadhaar Number', 'Aadhaar', 'आधार', 'आधार क्रमांक', 'aadhaarNumber');
        const mobileNumber = getVal('Mobile Number', 'Mobile', 'मोबाईल', 'मोबाईल नंबर', 'mobileNumber');
        const gender = (getVal('Gender', 'लिंग', 'gender') || 'Male') as any;
        const rawDob = getVal('Date of Birth', 'DOB', 'जन्म तारीख', 'dob');
        const dob = normalizeDateToYMD(rawDob) || '1990-01-01';
        const address = getVal('Address', 'पत्ता', 'address') || 'Village Address';
        const taluka = getVal('Taluka', 'तालुका', 'taluka') || 'Junnar';
        const district = getVal('District', 'जिल्हा', 'district') || 'Pune';
        const pincode = getVal('Pincode', 'पिनकोड', 'pincode') || '410502';
        const category = (getVal('Category', 'प्रवर्ग', 'category') || 'Open') as any;
        const maritalStatus = (getVal('Marital Status', 'वैवाहिक स्थिती', 'maritalStatus') || 'Married') as any;
        const workType = getVal('Work Type', 'कामाचे स्वरूप', 'workType') || 'Building Construction Worker';
        const rawRegDate = getVal('Registration Date', 'तारीख', 'दिनांक', 'registrationDate');
        const registrationDate = normalizeDateToYMD(rawRegDate) || new Date().toISOString().split('T')[0];
        const rawVerDate = getVal('Verification Date', 'पडताळणी तारीख', 'verificationDate');
        const verificationDate = normalizeDateToYMD(rawVerDate) || '';
        const fromSource = getVal('From', 'From Source', 'माध्यम', 'fromSource') || 'E-Seva Kendra';
        const statusVal = getVal('Status', 'स्थिती', 'status') || 'Active';

        const recordPayload: Omit<WorkerRegistration, 'id'> = {
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
          status: statusVal as any,
          appStatus: statusVal === 'Active' ? 'Accepted' : 'Pending',
          mhNumber: statusVal === 'Active' && mhNumber ? mhNumber.toUpperCase() : '',
          operatorName: currentUser.name,
          fromSource,
          nextRenewalDate: getVal('Next Renewal Date', 'पुढील नूतनीकरण तारीख') || '',
        };

        await onAddRegistration(recordPayload as any);
        importedCount++;
      }

      alert(`अभिनंदन! एक्सेल फाईलधून ${importedCount} कामगार नोंदी यशस्वीरित्या सिस्टीममध्ये इम्पोर्ट (सेव्ह) झाल्या आहेत.`);
    } catch (err: any) {
      alert('एक्सेल फाईल इम्पोर्ट करताना त्रुटी आली: ' + err.message);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
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
            <span>Worker Registration Entry (MBOCWW)</span>
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

          <button
            onClick={handleOpenAddModal}
            className="py-2 px-4 rounded-xl brand-gradient hover:opacity-95 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>New Registration Entry</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="md:col-span-2 relative">
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
          <div className="flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-blue-700" />
            <span className="font-semibold text-slate-600">तारीख फिल्टर (Date Filter):</span>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-300 text-xs text-slate-800 focus:bg-white focus:border-blue-600"
              title="From Date"
            />
            <span className="text-slate-400">ते</span>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-300 text-xs text-slate-800 focus:bg-white focus:border-blue-600"
              title="To Date"
            />
          </div>

          <div className="flex items-center gap-3">
            <span className="text-slate-500 font-medium">
              एकूण {registrations.length} पैकी <strong className="text-blue-900 font-black">{filteredRegs.length}</strong> नोंदी सापडल्या
            </span>
            {(searchTerm || selectedTaluka || selectedStatus || selectedOperator || fromDate || toDate) && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setSelectedTaluka('');
                  setSelectedStatus('');
                  setSelectedOperator('');
                  setFromDate('');
                  setToDate('');
                }}
                className="py-1 px-2.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold transition-all cursor-pointer"
              >
                फिल्टर रिसेट (Clear Filters)
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Registrations Table */}
      <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
        {/* Quick Slide Header Controls */}
        <div className="bg-slate-50/90 border-b border-slate-200 px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 text-slate-700 font-bold">
            <span className="text-[11px] bg-blue-100 text-blue-900 px-2 py-0.5 rounded-md border border-blue-200">
              ↔ Slide Table / माहिती सरकवा
            </span>
            <span className="hidden sm:inline text-slate-500 font-medium text-[11px]">
              (डावीकडे/उजवीकडे सरकवण्यासाठी खालील बटने वापरा)
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => tableContainerRef.current?.scrollBy({ left: -320, behavior: 'smooth' })}
              className="py-1 px-3 rounded-lg bg-white hover:bg-slate-100 active:scale-95 text-slate-800 border border-slate-300 font-bold text-xs flex items-center gap-1 shadow-xs cursor-pointer transition-all"
              title="Slide Left"
            >
              <ChevronLeft className="w-4 h-4 text-blue-700" />
              <span>◀ डावीकडे (Left)</span>
            </button>
            <button
              type="button"
              onClick={() => tableContainerRef.current?.scrollBy({ left: 320, behavior: 'smooth' })}
              className="py-1 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-xs flex items-center gap-1 shadow-xs cursor-pointer transition-all"
              title="Slide Right"
            >
              <span>उजवीकडे (Right) ▶</span>
              <ChevronRight className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>

        <div ref={tableContainerRef} className="overflow-x-auto max-h-[65vh] overflow-y-auto scroll-smooth">
          <table className="w-full text-left text-xs text-slate-800 border-collapse">
            <thead className="bg-slate-100/95 backdrop-blur-xs text-slate-700 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200 sticky top-0 z-20 shadow-2xs">
              <tr>
                <th className="p-3 sticky left-0 bg-slate-100 z-30 shadow-xs border-r border-slate-200/80 min-w-[140px]">
                  <div className="flex items-center gap-1 text-slate-800">
                    <Filter className="w-3 h-3 text-blue-600" />
                    <span>MH Reg No & ID</span>
                  </div>
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
                <th className="p-3 min-w-[110px]">
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
              {filteredRegs.map((reg) => (
                <tr key={reg.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-3.5 whitespace-nowrap sticky left-0 bg-white/95 backdrop-blur-xs z-10 border-r border-slate-200/60 shadow-xs">
                    {(reg.status === 'Active' || reg.appStatus === 'Accepted') && reg.mhNumber && !reg.mhNumber.startsWith('PENDING-') ? (
                      <div>
                        <div className="font-bold text-blue-700">{reg.mhNumber}</div>
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
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
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
                <div className="text-xs font-bold text-blue-700 font-mono">
                  MH Reg No: {viewDetailsReg.mhNumber || 'Pending'}
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

    </div>
  );
};

