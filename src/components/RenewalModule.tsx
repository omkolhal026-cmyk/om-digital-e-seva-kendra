import React, { useState, useRef } from 'react';
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
} from 'lucide-react';
import { WorkerRenewal, WorkerRegistration, User } from '../types';
import { exportToCSV } from '../utils/exportUtils';

interface RenewalModuleProps {
  renewals: WorkerRenewal[];
  registrations: WorkerRegistration[];
  currentUser: User;
  onAddRenewal: (ren: Omit<WorkerRenewal, 'id'>) => Promise<void>;
  onUpdateRenewal?: (id: string, updatedFields: Partial<WorkerRenewal>) => Promise<void>;
  onDeleteRenewal?: (id: string) => Promise<void>;
  onOpenPrintSlip: (type: 'renewal', data: any) => void;
}

const VERIFICATION_TALUKAS = ['Junnar', 'Ambegaon', 'Khed', 'Shirur'];

export const RenewalModule: React.FC<RenewalModuleProps> = ({
  renewals,
  registrations,
  currentUser,
  onAddRenewal,
  onUpdateRenewal,
  onDeleteRenewal,
  onOpenPrintSlip,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [talukaFilter, setTalukaFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<{ id: string; name: string } | null>(null);

  const getTodayDate = () => new Date().toISOString().split('T')[0];

  const defaultFormData = {
    workerName: '',
    mhNumber: '',
    mobileNumber: '',
    verificationDate: '',
    renewalDate: getTodayDate(),
    taluka: '',
    fromSource: '',
    operatorName: currentUser.name,
    status: 'Pending' as 'Pending' | 'Active',
    acceptedDate: '',
    acceptedBy: '',
  };

  const [formData, setFormData] = useState(defaultFormData);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Auto-fill from registration records when typing MH Number or Mobile
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

    const clean = formatted.trim();
    if (clean.length >= 8) {
      const matched = registrations.find(
        (r) =>
          r.mhNumber.toUpperCase().replace(/[\s-]/g, '') === clean.toUpperCase() ||
          r.mobileNumber === value.trim()
      );
      if (matched) {
        setFormData((prev) => ({
          ...prev,
          workerName: matched.workerName || prev.workerName,
          mhNumber: matched.mhNumber || prev.mhNumber,
          mobileNumber: matched.mobileNumber || prev.mobileNumber,
          taluka: VERIFICATION_TALUKAS.includes(matched.taluka) ? matched.taluka : prev.taluka,
          fromSource: matched.fromSource || prev.fromSource,
        }));
      }
    }
  };

  const handleReset = () => {
    setFormData({
      ...defaultFormData,
      verificationDate: '',
      renewalDate: getTodayDate(),
      taluka: '',
      operatorName: currentUser.name,
    });
    setValidationErrors({});
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

    // 3. Mobile Number Required (Numeric Only, Exactly 10 Digits)
    const mobileClean = formData.mobileNumber.trim();
    if (!mobileClean) {
      errors.mobileNumber = 'Mobile Number is required';
    } else if (!/^\d{10}$/.test(mobileClean)) {
      errors.mobileNumber = 'Mobile Number must be exactly 10 digits';
    }

    // 4. Verification Date Required
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

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = async (
    targetStatus?: 'Pending' | 'Active',
    shouldPrintAfterSave: boolean = false
  ) => {
    if (!validate()) return;

    const finalStatus = targetStatus || formData.status;
    const isActivating = finalStatus === 'Active';

    const payload: Omit<WorkerRenewal, 'id'> = {
      workerName: formData.workerName.trim(),
      mhNumber: formData.mhNumber.trim().toUpperCase(),
      mobileNumber: formData.mobileNumber.trim(),
      verificationDate: formData.verificationDate,
      renewalDate: formData.renewalDate || getTodayDate(),
      taluka: formData.taluka,
      fromSource: formData.fromSource.trim(),
      operatorName: currentUser.name,
      status: finalStatus,
      acceptedDate: isActivating ? formData.acceptedDate || getTodayDate() : formData.acceptedDate,
      acceptedBy: isActivating ? formData.acceptedBy || currentUser.name : formData.acceptedBy,
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

  const handleQuickAccept = async (ren: WorkerRenewal) => {
    if (!onUpdateRenewal) return;
    try {
      await onUpdateRenewal(ren.id, {
        status: 'Active',
        acceptedDate: getTodayDate(),
        acceptedBy: currentUser.name,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = (id: string, name: string) => {
    setDeleteConfirmItem({ id, name });
  };

  const handleEdit = (ren: WorkerRenewal) => {
    setEditingId(ren.id);
    setFormData({
      workerName: ren.workerName,
      mhNumber: ren.mhNumber,
      mobileNumber: ren.mobileNumber,
      verificationDate: ren.verificationDate,
      renewalDate: ren.renewalDate || getTodayDate(),
      taluka: ren.taluka || 'Junnar',
      fromSource: ren.fromSource || '',
      operatorName: ren.operatorName || currentUser.name,
      status: ren.status === 'Active' ? 'Active' : 'Pending',
      acceptedDate: ren.acceptedDate || '',
      acceptedBy: ren.acceptedBy || '',
    });
    setValidationErrors({});
    setIsModalOpen(true);
  };

  const openNewModal = () => {
    setEditingId(null);
    handleReset();
    setIsModalOpen(true);
  };

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

    return matchesSearch && matchesTaluka && matchesStatus;
  });

  const renFileInputRef = useRef<HTMLInputElement | null>(null);
  const renTableContainerRef = useRef<HTMLDivElement | null>(null);
  const [renImporting, setRenImporting] = useState(false);

  const handleExcelImportRenewals = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setRenImporting(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rawRows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet);

      if (!rawRows || rawRows.length === 0) {
        alert('एक्सेल फाईलमध्ये कोणताही डेटा सापडला नाही!');
        setRenImporting(false);
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

        const workerName = getVal('Worker Name', 'Full Name', 'Name', 'नाव', 'कामगाराचे नाव', 'workerName');
        if (!workerName) continue;

        const mhNumber = getVal('MH Registration Number', 'MH Number', 'MH No', 'MH', 'एमएच नंबर', 'mhNumber');
        const mobileNumber = getVal('Mobile Number', 'Mobile', 'मोबाईल', 'mobileNumber');
        const verificationDate = getVal('Verification Date', 'पडताळणी तारीख', 'verificationDate') || '';
        const renewalDate = getVal('Renewal Date', 'नूतनीकरण तारीख', 'renewalDate') || getTodayDate();
        const taluka = getVal('Verification Taluka', 'Taluka', 'तालुका', 'taluka') || 'Junnar';
        const fromSource = getVal('From', 'माध्यम', 'fromSource') || 'E-Seva Kendra';
        const statusVal = getVal('Renewal Status', 'Status', 'स्थिती', 'status') || 'Active';

        const recordPayload: Omit<WorkerRenewal, 'id'> = {
          workerName,
          mhNumber: mhNumber ? mhNumber.toUpperCase() : `MH${Date.now().toString().slice(-10)}`,
          mobileNumber: mobileNumber.replace(/\D/g, '').slice(0, 10) || '9876543210',
          verificationDate,
          renewalDate,
          taluka,
          fromSource,
          operatorName: currentUser.name,
          status: statusVal as any,
          feeAmount: 100,
        };

        await onAddRenewal(recordPayload);
        importedCount++;
      }

      alert(`अभिनंदन! एक्सेल फाईलधून ${importedCount} नूतनीकरण नोंदी यशस्वीरित्या सिस्टीममध्ये इम्पोर्ट (सेव्ह) झाल्या आहेत.`);
    } catch (err: any) {
      alert('एक्सेल फाईल इम्पोर्ट करताना त्रुटी आली: ' + err.message);
    } finally {
      setRenImporting(false);
      if (renFileInputRef.current) renFileInputRef.current.value = '';
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
      'Accepted Date': r.acceptedDate || '-',
      'Accepted By': r.acceptedBy || '-',
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

          <button
            onClick={handleExportCSV}
            className="py-2 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs"
          >
            <Download className="w-4 h-4 text-blue-700" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={openNewModal}
            className="py-2 px-4 rounded-xl brand-gradient hover:opacity-95 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>New Worker Renewal</span>
          </button>
        </div>
      </div>

      {/* Search Toolbar & Filters */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by Full Name, MH Registration Number, Mobile..."
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white"
          />
        </div>

        {/* Taluka Filter */}
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={talukaFilter}
            onChange={(e) => setTalukaFilter(e.target.value)}
            className="py-2 px-3 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white"
          >
            <option value="">All Verification Talukas</option>
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
            className="py-2 px-3 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white"
          >
            <option value="">All Renewal Statuses</option>
            <option value="Pending">🟡 Pending</option>
            <option value="Active">🟢 Active</option>
          </select>
        </div>
      </div>

      {/* Renewal List Table */}
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
              onClick={() => renTableContainerRef.current?.scrollBy({ left: -320, behavior: 'smooth' })}
              className="py-1 px-3 rounded-lg bg-white hover:bg-slate-100 active:scale-95 text-slate-800 border border-slate-300 font-bold text-xs flex items-center gap-1 shadow-xs cursor-pointer transition-all"
              title="Slide Left"
            >
              <ChevronLeft className="w-4 h-4 text-blue-700" />
              <span>◀ डावीकडे (Left)</span>
            </button>
            <button
              type="button"
              onClick={() => renTableContainerRef.current?.scrollBy({ left: 320, behavior: 'smooth' })}
              className="py-1 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-xs flex items-center gap-1 shadow-xs cursor-pointer transition-all"
              title="Slide Right"
            >
              <span>उजवीकडे (Right) ▶</span>
              <ChevronRight className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>

        <div ref={renTableContainerRef} className="overflow-x-auto max-h-[65vh] overflow-y-auto scroll-smooth">
          <table className="w-full text-left text-xs text-slate-800 border-collapse">
            <thead className="bg-slate-100/95 backdrop-blur-xs text-slate-700 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200 sticky top-0 z-20 shadow-2xs">
              <tr>
                <th className="p-3.5 w-12 text-center sticky left-0 bg-slate-100 z-30 border-r border-slate-200/80">Sr. No.</th>
                <th className="p-3.5 sticky left-12 bg-slate-100 z-30 shadow-xs border-r border-slate-200/80">Full Name</th>
                <th className="p-3.5">MH Registration Number</th>
                <th className="p-3.5">Mobile Number</th>
                <th className="p-3.5">Verification Date</th>
                <th className="p-3.5">Renewal Date</th>
                <th className="p-3.5">Verification Taluka</th>
                <th className="p-3.5">From</th>
                <th className="p-3.5">Form Filled By</th>
                <th className="p-3.5">Renewal Status</th>
                <th className="p-3.5 text-right sticky right-0 bg-slate-100 z-30 shadow-xs border-l border-slate-200/80">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRenewals.map((ren, index) => {
                const isPending = ren.status === 'Pending';
                const isActive = ren.status === 'Active';

                return (
                  <tr key={ren.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="p-3.5 text-center font-bold text-slate-500 sticky left-0 bg-white/95 backdrop-blur-xs z-10 border-r border-slate-200/60">{index + 1}</td>
                    <td className="p-3.5 sticky left-12 bg-white/95 backdrop-blur-xs z-10 border-r border-slate-200/60 shadow-xs min-w-[160px]">
                      <div className="font-bold text-slate-900">{ren.workerName}</div>
                      {ren.acceptedBy && (
                        <div className="text-[10px] text-slate-500">
                          Accepted by: {ren.acceptedBy} ({ren.acceptedDate})
                        </div>
                      )}
                    </td>
                    <td className="p-3.5 font-bold text-blue-700 font-mono whitespace-nowrap">{ren.mhNumber}</td>
                    <td className="p-3.5 font-medium text-slate-800 whitespace-nowrap">{ren.mobileNumber}</td>
                    <td className="p-3.5 text-slate-600 font-medium whitespace-nowrap">{ren.verificationDate}</td>
                    <td className="p-3.5 text-slate-600 font-medium whitespace-nowrap">{ren.renewalDate}</td>
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
                        {/* Quick Accept button for pending records */}
                        {isPending && (
                          <button
                            onClick={() => handleQuickAccept(ren)}
                            className="py-1 px-2.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-[11px] font-bold flex items-center gap-1 transition-colors"
                            title="Accept Renewal"
                          >
                            <Check className="w-3.5 h-3.5 text-emerald-700" />
                            <span>Accept</span>
                          </button>
                        )}

                        {/* Print Button */}
                        <button
                          onClick={() => onOpenPrintSlip('renewal', ren)}
                          className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition-colors"
                          title="Print Renewal Slip"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>

                        {/* Edit Button */}
                        <button
                          onClick={() => handleEdit(ren)}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-colors"
                          title="Edit Renewal"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>

                        {/* Delete Button */}
                        <button
                          onClick={() => handleDelete(ren.id, ren.workerName)}
                          className="p-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 transition-colors"
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

            <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
              {/* Grid 2 Column Form */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. Full Name * */}
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    1. Full Name *
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

                {/* 2. MH Registration Number * */}
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    2. MH Registration Number *
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

                {/* 3. Mobile Number * */}
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    3. Mobile Number *
                  </label>
                  <input
                    type="text"
                    maxLength={10}
                    value={formData.mobileNumber}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      setFormData({ ...formData, mobileNumber: val });
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

                {/* 4. Verification Date * */}
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    4. Verification Date *
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

                {/* 5. Renewal Date (Auto Fill - Read Only) */}
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    5. Renewal Date
                  </label>
                  <input
                    type="date"
                    value={formData.renewalDate}
                    readOnly
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-100 border border-slate-300 text-xs font-bold text-slate-700 cursor-not-allowed"
                  />
                  <p className="text-[10px] text-slate-500 mt-0.5">Auto Fill (Today's Date)</p>
                </div>

                {/* 6. Verification Taluka * */}
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    6. Verification Taluka *
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

                {/* 7. From * */}
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    7. From *
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
                    placeholder="Type source"
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

                {/* 8. Form Filled By (Auto Fill - Read Only) */}
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    8. Form Filled By
                  </label>
                  <input
                    type="text"
                    value={formData.operatorName}
                    readOnly
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-100 border border-slate-300 text-xs font-bold text-slate-700 cursor-not-allowed"
                  />
                  <p className="text-[10px] text-slate-500 mt-0.5">Auto Fill (Logged-in User)</p>
                </div>
              </div>

              {/* Renewal Status Options */}
              <div className="pt-3 border-t border-slate-200">
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

                {formData.status === 'Active' && (
                  <div className="mt-2.5 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-900 flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-emerald-700 flex-shrink-0" />
                    <span>
                      Renewal will be saved as <b>Active</b> with Accepted Date = <b>{getTodayDate()}</b> and Accepted By = <b>{currentUser.name}</b>.
                    </span>
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
                    className="py-2.5 px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-300 flex items-center gap-1.5 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset</span>
                  </button>

                  {/* Cancel Button */}
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="py-2.5 px-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-300 flex items-center gap-1.5 transition-colors"
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
                    disabled={submitting}
                    onClick={() => handleSave(formData.status, false)}
                    className="py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save</span>
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
    </div>
  );
};
