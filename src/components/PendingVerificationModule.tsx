import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  Send,
  Filter,
  Search,
  Calendar,
  UserCheck,
  Building2,
  Clock,
  CheckCircle2,
  Phone,
  MessageSquare,
  Sparkles,
  Settings,
  RefreshCw,
  FileText,
  Tag,
  X,
  ExternalLink,
  ShieldAlert,
  User,
  MapPin,
  Flame,
  CreditCard,
  Sliders,
  Check,
  Zap,
} from 'lucide-react';
import {
  WorkerRegistration,
  WorkerRenewal,
  WorkerClaim,
  VerificationReminder,
  User as UserType,
  OfficeSettings,
} from '../types';
import { formatDate } from '../utils/exportUtils';

interface PendingVerificationModuleProps {
  registrations: WorkerRegistration[];
  renewals?: WorkerRenewal[];
  claims: WorkerClaim[];
  reminders: VerificationReminder[];
  currentUser: UserType;
  users: UserType[];
  settings: OfficeSettings;
  onUpdateReminder: (reminder: VerificationReminder) => Promise<void>;
  onUpdateRegistrationStatus?: (id: string, status: string) => Promise<void>;
  onUpdateRenewalStatus?: (id: string, status: string) => Promise<void>;
  onUpdateClaimStatus?: (id: string, status: string) => Promise<void>;
  onUpdateSettings?: (newSettings: Partial<OfficeSettings>) => Promise<void>;
}

export interface UnifiedPendingItem {
  id: string;
  module: 'Registration' | 'Renewal' | 'Claim';
  customerName: string;
  mobileNumber: string;
  aadhaarNumber: string;
  mhNumber: string;
  verificationDate: string;
  currentStatus: string;
  assignedStaff: string;
  taluka: string;
  reminderInfo?: VerificationReminder;
  originalRecord: WorkerRegistration | WorkerRenewal | WorkerClaim;
}

const DEFAULT_TEMPLATE = `नमस्कार {{CUSTOMER_NAME}}जी,

आपल्या बांधकाम कामगार योजनेच्या अर्जाची पडताळणी (Verification) अद्याप बाकी आहे.

कृपया पडताळणीसाठी आवश्यक कागदपत्रांसह कार्यालयाशी संपर्क साधावा.

Aadhaar No.: {{AADHAAR_NUMBER}}
MH/Registration No.: {{MH_NUMBER}}
Verification Date: {{VERIFICATION_DATE}}

धन्यवाद.
OM Digital E-Seva Kendra`;

export const PendingVerificationModule: React.FC<PendingVerificationModuleProps> = ({
  registrations,
  renewals = [],
  claims,
  reminders,
  currentUser,
  users,
  settings,
  onUpdateReminder,
  onUpdateRegistrationStatus,
  onUpdateRenewalStatus,
  onUpdateClaimStatus,
  onUpdateSettings,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [timeFilter, setTimeFilter] = useState<'all' | 'today' | 'tomorrow' | 'overdue' | 'this-week' | 'custom'>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [staffFilter, setStaffFilter] = useState<string>('all');
  const [talukaFilter, setTalukaFilter] = useState<string>('all');
  const [moduleFilter, setModuleFilter] = useState<'all' | 'Registration' | 'Renewal' | 'Claim'>('all');
  const [reminderStatusFilter, setReminderStatusFilter] = useState<string>('all');

  // Interactive slide switch state for quick view toggles
  const [onlyOverdueSlide, setOnlyOverdueSlide] = useState(false);
  const [maskAadhaarSlide, setMaskAadhaarSlide] = useState(false);

  // Modal states
  const [activeWhatsAppModalItem, setActiveWhatsAppModalItem] = useState<UnifiedPendingItem | null>(null);
  const [generatedMessage, setGeneratedMessage] = useState('');
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateText, setTemplateText] = useState(settings?.whatsappTemplate || DEFAULT_TEMPLATE);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [loggingAction, setLoggingAction] = useState(false);

  // Status edit modal
  const [editingItem, setEditingItem] = useState<UnifiedPendingItem | null>(null);
  const [newStatus, setNewStatus] = useState('');

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const tomorrowStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }, []);

  // Combine and permissions-check pending verification records
  const allPendingItems = useMemo<UnifiedPendingItem[]>(() => {
    const list: UnifiedPendingItem[] = [];

    // Map registrations by mhNumber for fast lookup of Aadhaar numbers
    const regByMh = new Map<string, WorkerRegistration>();
    registrations.forEach((r) => {
      if (r.mhNumber) regByMh.set(r.mhNumber.trim(), r);
    });

    // 1. Check Registration permissions
    const canSeeReg = currentUser.role === 'admin' || currentUser.permissions?.canRegister;
    if (canSeeReg) {
      registrations.forEach((reg) => {
        const isPending =
          reg.status === 'Pending Verification' ||
          reg.status === 'Pending' ||
          reg.appStatus === 'Pending';
        if (isPending) {
          const rInfo = reminders.find(
            (r) => r.module === 'Registration' && String(r.recordId) === String(reg.id)
          );
          list.push({
            id: String(reg.id),
            module: 'Registration',
            customerName: reg.workerName,
            mobileNumber: reg.mobileNumber || 'N/A',
            aadhaarNumber: reg.aadhaarNumber || 'N/A',
            mhNumber: reg.mhNumber || 'N/A',
            verificationDate: reg.verificationDate || reg.registrationDate || todayStr,
            currentStatus: reg.status,
            assignedStaff: reg.operatorName || 'System',
            taluka: reg.taluka || 'Unassigned',
            reminderInfo: rInfo,
            originalRecord: reg,
          });
        }
      });
    }

    // 2. Check Renewal permissions (NEW)
    const canSeeRen = currentUser.role === 'admin' || currentUser.permissions?.canRenew;
    if (canSeeRen && renewals) {
      renewals.forEach((ren) => {
        const isPending =
          ren.status === 'Pending' ||
          (ren.status as string) === 'Pending Verification';
        if (isPending) {
          const rInfo = reminders.find(
            (r) => r.module === 'Renewal' && String(r.recordId) === String(ren.id)
          );
          const matchedReg = ren.mhNumber ? regByMh.get(ren.mhNumber.trim()) : undefined;
          list.push({
            id: String(ren.id),
            module: 'Renewal',
            customerName: ren.workerName,
            mobileNumber: ren.mobileNumber || matchedReg?.mobileNumber || 'N/A',
            aadhaarNumber: matchedReg?.aadhaarNumber || 'N/A',
            mhNumber: ren.mhNumber || 'N/A',
            verificationDate: ren.verificationDate || ren.renewalDate || todayStr,
            currentStatus: ren.status,
            assignedStaff: ren.operatorName || 'System',
            taluka: ren.taluka || matchedReg?.taluka || 'Unassigned',
            reminderInfo: rInfo,
            originalRecord: ren,
          });
        }
      });
    }

    // 3. Check Claim permissions
    const canSeeClm = currentUser.role === 'admin' || currentUser.permissions?.canClaim;
    if (canSeeClm) {
      claims.forEach((clm) => {
        const isPending =
          (clm.status as string) === 'Submitted' ||
          (clm.status as string) === 'Under Scrutiny' ||
          (clm.status as string) === 'Pending';
        if (isPending) {
          const rInfo = reminders.find(
            (r) => r.module === 'Claim' && String(r.recordId) === String(clm.id)
          );
          const matchedReg = clm.mhNumber ? regByMh.get(clm.mhNumber.trim()) : undefined;
          list.push({
            id: String(clm.id),
            module: 'Claim',
            customerName: clm.workerName,
            mobileNumber: clm.mobileNumber || matchedReg?.mobileNumber || 'N/A',
            aadhaarNumber: matchedReg?.aadhaarNumber || 'N/A',
            mhNumber: clm.mhNumber || 'N/A',
            verificationDate: clm.claimDate || todayStr,
            currentStatus: clm.status,
            assignedStaff: clm.operatorName || 'System',
            taluka: clm.taluka || matchedReg?.taluka || 'Unassigned',
            reminderInfo: rInfo,
            originalRecord: clm,
          });
        }
      });
    }

    return list;
  }, [registrations, renewals, claims, reminders, currentUser, todayStr]);

  // Extract unique Talukas & Staff for filter dropdowns
  const availableTalukas = useMemo(() => {
    const set = new Set<string>();
    allPendingItems.forEach((i) => {
      if (i.taluka) set.add(i.taluka);
    });
    return Array.from(set).sort();
  }, [allPendingItems]);

  const availableStaff = useMemo(() => {
    const set = new Set<string>();
    allPendingItems.forEach((i) => {
      if (i.assignedStaff) set.add(i.assignedStaff);
    });
    return Array.from(set).sort();
  }, [allPendingItems]);

  // Filtered List
  const filteredItems = useMemo(() => {
    return allPendingItems.filter((item) => {
      // Slide switch filter for Overdue
      if (onlyOverdueSlide) {
        if (!item.verificationDate || item.verificationDate >= todayStr) return false;
      }

      // Module filter
      if (moduleFilter !== 'all' && item.module !== moduleFilter) return false;

      // Staff filter
      if (staffFilter !== 'all' && item.assignedStaff !== staffFilter) return false;

      // Taluka filter
      if (talukaFilter !== 'all' && item.taluka !== talukaFilter) return false;

      // Reminder Status filter
      if (reminderStatusFilter !== 'all') {
        const st = item.reminderInfo?.reminderStatus || 'Reminder Not Sent';
        if (reminderStatusFilter === 'sent' && st !== 'Reminder Sent') return false;
        if (reminderStatusFilter === 'not-sent' && st !== 'Reminder Not Sent') return false;
        if (reminderStatusFilter === 'prepared' && st !== 'Opened/Prepared') return false;
      }

      // Time filter
      const vDate = item.verificationDate;
      if (timeFilter === 'today') {
        if (vDate !== todayStr) return false;
      } else if (timeFilter === 'tomorrow') {
        if (vDate !== tomorrowStr) return false;
      } else if (timeFilter === 'overdue') {
        if (!vDate || vDate >= todayStr) return false;
      } else if (timeFilter === 'this-week') {
        const todayDate = new Date();
        const itemDate = new Date(vDate);
        const diffTime = Math.abs(todayDate.getTime() - itemDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays > 7) return false;
      } else if (timeFilter === 'custom') {
        if (customStartDate && vDate < customStartDate) return false;
        if (customEndDate && vDate > customEndDate) return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = item.customerName.toLowerCase().includes(q);
        const matchMobile = item.mobileNumber.toLowerCase().includes(q);
        const matchMh = item.mhNumber.toLowerCase().includes(q);
        const matchAadhaar = item.aadhaarNumber.toLowerCase().includes(q);
        if (!matchName && !matchMobile && !matchMh && !matchAadhaar) return false;
      }

      return true;
    });
  }, [
    allPendingItems,
    onlyOverdueSlide,
    moduleFilter,
    staffFilter,
    talukaFilter,
    reminderStatusFilter,
    timeFilter,
    customStartDate,
    customEndDate,
    searchQuery,
    todayStr,
    tomorrowStr,
  ]);

  // Statistics
  const totalPending = allPendingItems.length;
  const overdueCount = useMemo(
    () => allPendingItems.filter((i) => i.verificationDate && i.verificationDate < todayStr).length,
    [allPendingItems, todayStr]
  );
  const regCount = useMemo(
    () => allPendingItems.filter((i) => i.module === 'Registration').length,
    [allPendingItems]
  );
  const renewalCount = useMemo(
    () => allPendingItems.filter((i) => i.module === 'Renewal').length,
    [allPendingItems]
  );
  const claimCount = useMemo(
    () => allPendingItems.filter((i) => i.module === 'Claim').length,
    [allPendingItems]
  );
  const remindersSentTotal = useMemo(
    () =>
      allPendingItems.filter((i) => i.reminderInfo?.reminderStatus === 'Reminder Sent').length,
    [allPendingItems]
  );

  // Helper to compile WhatsApp message
  const prepareWhatsAppMessage = (item: UnifiedPendingItem) => {
    let tpl = settings?.whatsappTemplate || DEFAULT_TEMPLATE;
    tpl = tpl.replace(/\{\{CUSTOMER_NAME\}\}/g, item.customerName || '');
    tpl = tpl.replace(/\{\{MOBILE\}\}/g, item.mobileNumber || '');
    tpl = tpl.replace(/\{\{AADHAAR_NUMBER\}\}/g, item.aadhaarNumber || 'N/A');
    tpl = tpl.replace(/\{\{MH_NUMBER\}\}/g, item.mhNumber || '');
    tpl = tpl.replace(/\{\{REGISTRATION_NUMBER\}\}/g, item.mhNumber || item.id);
    tpl = tpl.replace(/\{\{VERIFICATION_DATE\}\}/g, item.verificationDate ? formatDate(item.verificationDate) : 'N/A');
    tpl = tpl.replace(/\{\{TALUKA\}\}/g, item.taluka || 'N/A');
    tpl = tpl.replace(/\{\{STAFF_NAME\}\}/g, item.assignedStaff || currentUser.name || 'OM Digital');
    return tpl;
  };

  // Format phone number for wa.me
  const formatPhoneNumber = (num: string) => {
    let cleaned = num.replace(/\D/g, '');
    if (cleaned.length === 10) {
      cleaned = '91' + cleaned;
    }
    return cleaned;
  };

  // Format Aadhaar display (without spaces, e.g., 123456789012 or masked)
  const formatAadhaarDisplay = (num: string, mask: boolean) => {
    if (!num || num === 'N/A') return 'N/A';
    const cleaned = num.replace(/\s+/g, '');
    if (mask) {
      const digits = cleaned.replace(/\D/g, '');
      if (digits.length === 12) {
        return `XXXXXXXX${digits.slice(8)}`;
      }
    }
    return cleaned;
  };

  // Trigger WhatsApp send
  const handleOpenWhatsApp = (item: UnifiedPendingItem) => {
    const msg = prepareWhatsAppMessage(item);
    const phone = formatPhoneNumber(item.mobileNumber);
    const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;

    // Open WhatsApp in new tab
    window.open(waUrl, '_blank');

    // Show logging prompt modal in app
    setActiveWhatsAppModalItem(item);
    setGeneratedMessage(msg);
  };

  // Save Reminder Log
  const handleSaveReminderLog = async (
    statusType: 'Reminder Sent' | 'Opened/Prepared'
  ) => {
    if (!activeWhatsAppModalItem) return;
    setLoggingAction(true);
    try {
      const currentCount = activeWhatsAppModalItem.reminderInfo?.reminderCount || 0;
      await onUpdateReminder({
        id: activeWhatsAppModalItem.reminderInfo?.id,
        module: activeWhatsAppModalItem.module,
        recordId: activeWhatsAppModalItem.id,
        reminderStatus: statusType,
        lastReminderDate: todayStr,
        reminderSentBy: currentUser.name || currentUser.username,
        reminderCount: currentCount + 1,
      });

      setActiveWhatsAppModalItem(null);
    } catch (err: any) {
      alert('Error updating reminder log: ' + (err?.message || 'Failed'));
    } finally {
      setLoggingAction(false);
    }
  };

  // Save Template Settings
  const handleSaveTemplate = async () => {
    if (!onUpdateSettings) return;
    setSavingTemplate(true);
    try {
      await onUpdateSettings({ whatsappTemplate: templateText });
      setShowTemplateModal(false);
      alert('WhatsApp message template saved successfully!');
    } catch (err: any) {
      alert('Error saving template: ' + (err?.message || 'Failed'));
    } finally {
      setSavingTemplate(false);
    }
  };

  // Update Record Status
  const handleSaveRecordStatus = async () => {
    if (!editingItem || !newStatus) return;
    try {
      if (editingItem.module === 'Registration' && onUpdateRegistrationStatus) {
        await onUpdateRegistrationStatus(editingItem.id, newStatus);
      } else if (editingItem.module === 'Renewal' && onUpdateRenewalStatus) {
        await onUpdateRenewalStatus(editingItem.id, newStatus);
      } else if (editingItem.module === 'Claim' && onUpdateClaimStatus) {
        await onUpdateClaimStatus(editingItem.id, newStatus);
      }
      setEditingItem(null);
      alert('Verification status updated successfully!');
    } catch (err: any) {
      alert('Error updating status: ' + err.message);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-red-900 via-slate-900 to-blue-900 border border-red-700/30 p-6 md:p-8 text-white shadow-lg">
        <div className="absolute top-0 right-0 w-96 h-96 bg-red-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/20 border border-red-400/30 text-red-200 text-xs font-bold">
              <Flame className="w-4 h-4 text-red-400 animate-pulse" />
              <span>Pending Verification Center (Reg + Renewal + Claims)</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
              <span>🔴 Verification Queue & WhatsApp Reminders</span>
            </h1>
            <p className="text-xs md:text-sm text-slate-200 max-w-2xl font-medium leading-relaxed">
              Monitor worker registrations, renewals, and claims requiring document verification. Filter by overdue status, taluka, staff, or Aadhaar card number, and launch instant pre-filled WhatsApp reminders.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {currentUser.role === 'admin' && (
              <button
                onClick={() => {
                  setTemplateText(settings?.whatsappTemplate || DEFAULT_TEMPLATE);
                  setShowTemplateModal(true);
                }}
                className="py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/30 font-bold text-xs flex items-center gap-2 transition-all shadow-xs"
              >
                <Settings className="w-4 h-4 text-emerald-400" />
                <span>Edit Message Template</span>
              </button>
            )}

            <div className="px-4 py-2 rounded-xl bg-white/15 border border-white/20 text-white font-mono text-xs font-bold">
              Total Queue: {totalPending} Records
            </div>
          </div>
        </div>
      </div>

      {/* Metric Cards Row */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {/* Card 1: Total Pending */}
        <div
          onClick={() => {
            setModuleFilter('all');
            setTimeFilter('all');
            setOnlyOverdueSlide(false);
          }}
          className="cursor-pointer p-4 rounded-2xl bg-white border border-slate-200 hover:border-red-400 transition-all shadow-xs hover:shadow-md space-y-1.5"
        >
          <div className="flex items-center justify-between text-slate-500 text-[11px] font-bold uppercase">
            <span>Total Queue</span>
            <AlertTriangle className="w-4 h-4 text-red-600" />
          </div>
          <div className="text-2xl font-black text-slate-900">{totalPending}</div>
          <div className="text-[10px] text-slate-500">Require Verification</div>
        </div>

        {/* Card 2: Overdue */}
        <div
          onClick={() => {
            setTimeFilter('overdue');
            setOnlyOverdueSlide(true);
          }}
          className={`cursor-pointer p-4 rounded-2xl border transition-all shadow-xs hover:shadow-md space-y-1.5 ${
            overdueCount > 0
              ? 'bg-red-50/80 border-red-300 hover:border-red-500'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center justify-between text-red-700 text-[11px] font-bold uppercase">
            <span>⚠️ Overdue</span>
            <Flame className="w-4 h-4 text-red-600" />
          </div>
          <div className="text-2xl font-black text-red-700">{overdueCount}</div>
          <div className="text-[10px] text-red-600/80 font-semibold">Date Past Due</div>
        </div>

        {/* Card 3: Registrations */}
        <div
          onClick={() => setModuleFilter('Registration')}
          className={`cursor-pointer p-4 rounded-2xl border transition-all shadow-xs hover:shadow-md space-y-1.5 ${
            moduleFilter === 'Registration'
              ? 'bg-sky-50 border-sky-400 ring-2 ring-sky-300'
              : 'bg-white border-slate-200 hover:border-sky-300'
          }`}
        >
          <div className="flex items-center justify-between text-sky-700 text-[11px] font-bold uppercase">
            <span>Pending Reg.</span>
            <UserCheck className="w-4 h-4 text-sky-600" />
          </div>
          <div className="text-2xl font-black text-sky-900">{regCount}</div>
          <div className="text-[10px] text-slate-500">New Applications</div>
        </div>

        {/* Card 4: Renewals (NEW) */}
        <div
          onClick={() => setModuleFilter('Renewal')}
          className={`cursor-pointer p-4 rounded-2xl border transition-all shadow-xs hover:shadow-md space-y-1.5 ${
            moduleFilter === 'Renewal'
              ? 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-300'
              : 'bg-white border-slate-200 hover:border-emerald-300'
          }`}
        >
          <div className="flex items-center justify-between text-emerald-700 text-[11px] font-bold uppercase">
            <span>Pending Ren.</span>
            <RefreshCw className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-900">{renewalCount}</div>
          <div className="text-[10px] text-slate-500">Yearly Renewal</div>
        </div>

        {/* Card 5: Claims */}
        <div
          onClick={() => setModuleFilter('Claim')}
          className={`cursor-pointer p-4 rounded-2xl border transition-all shadow-xs hover:shadow-md space-y-1.5 ${
            moduleFilter === 'Claim'
              ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-300'
              : 'bg-white border-slate-200 hover:border-amber-300'
          }`}
        >
          <div className="flex items-center justify-between text-amber-700 text-[11px] font-bold uppercase">
            <span>Pending Claims</span>
            <FileText className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-amber-900">{claimCount}</div>
          <div className="text-[10px] text-slate-500">Under Scrutiny</div>
        </div>

        {/* Card 6: Reminders Sent */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-1.5">
          <div className="flex items-center justify-between text-indigo-700 text-[11px] font-bold uppercase">
            <span>WhatsApp Sent</span>
            <MessageSquare className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-2xl font-black text-indigo-800">{remindersSentTotal}</div>
          <div className="text-[10px] text-slate-500">Confirmed Contacted</div>
        </div>
      </div>

      {/* Segmented Slide Button Bar for Module Selection (REQUIREMENT 3: Slide Button) */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          
          {/* SLIDE SWITCH BUTTONS for Module Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-600 flex items-center gap-1.5 mr-1 shrink-0">
              <Sliders className="w-4 h-4 text-blue-600" />
              <span>Module Slide Switch:</span>
            </span>

            {/* Segmented sliding toggle container */}
            <div className="relative flex items-center p-1 bg-slate-100 rounded-2xl border border-slate-200 shadow-inner w-full md:w-auto overflow-x-auto">
              {/* All */}
              <button
                type="button"
                onClick={() => setModuleFilter('all')}
                className={`relative z-10 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-1.5 ${
                  moduleFilter === 'all'
                    ? 'bg-slate-900 text-white shadow-md scale-102'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>All Modules</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  moduleFilter === 'all' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                }`}>
                  {totalPending}
                </span>
              </button>

              {/* Registration */}
              <button
                type="button"
                onClick={() => setModuleFilter('Registration')}
                className={`relative z-10 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-1.5 ${
                  moduleFilter === 'Registration'
                    ? 'bg-sky-600 text-white shadow-md scale-102'
                    : 'text-slate-600 hover:text-sky-700'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5" />
                <span>Registration</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  moduleFilter === 'Registration' ? 'bg-white/20 text-white' : 'bg-sky-100 text-sky-800'
                }`}>
                  {regCount}
                </span>
              </button>

              {/* Renewal */}
              <button
                type="button"
                onClick={() => setModuleFilter('Renewal')}
                className={`relative z-10 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-1.5 ${
                  moduleFilter === 'Renewal'
                    ? 'bg-emerald-600 text-white shadow-md scale-102'
                    : 'text-slate-600 hover:text-emerald-700'
                }`}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Renewal</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  moduleFilter === 'Renewal' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'
                }`}>
                  {renewalCount}
                </span>
              </button>

              {/* Claim */}
              <button
                type="button"
                onClick={() => setModuleFilter('Claim')}
                className={`relative z-10 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all duration-200 flex items-center gap-1.5 ${
                  moduleFilter === 'Claim'
                    ? 'bg-amber-600 text-white shadow-md scale-102'
                    : 'text-slate-600 hover:text-amber-700'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Claims</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  moduleFilter === 'Claim' ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'
                }`}>
                  {claimCount}
                </span>
              </button>
            </div>
          </div>

          {/* Additional Slide Toggle Switches (Overdue & Aadhaar Masking) */}
          <div className="flex flex-wrap items-center gap-4 border-t lg:border-t-0 border-slate-100 pt-3 lg:pt-0">
            {/* Slide Switch 1: Overdue Only */}
            <label className="inline-flex items-center cursor-pointer gap-2 select-none">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                <Flame className="w-3.5 h-3.5 text-red-600" /> Overdue Only
              </span>
              <div
                onClick={() => setOnlyOverdueSlide(!onlyOverdueSlide)}
                className={`relative w-11 h-6 rounded-full transition-colors duration-200 ease-in-out cursor-pointer p-0.5 ${
                  onlyOverdueSlide ? 'bg-red-600' : 'bg-slate-300'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform duration-200 ease-in-out flex items-center justify-center text-[10px] font-black ${
                    onlyOverdueSlide ? 'translate-x-5 text-red-600' : 'translate-x-0 text-slate-400'
                  }`}
                >
                  {onlyOverdueSlide ? <Check className="w-3 h-3 stroke-[3]" /> : ''}
                </div>
              </div>
            </label>

            {/* Slide Switch 2: Mask Aadhaar */}
            <label className="inline-flex items-center cursor-pointer gap-2 select-none">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                <CreditCard className="w-3.5 h-3.5 text-blue-600" /> Mask Aadhaar
              </span>
              <div
                onClick={() => setMaskAadhaarSlide(!maskAadhaarSlide)}
                className={`relative w-11 h-6 rounded-full transition-colors duration-200 ease-in-out cursor-pointer p-0.5 ${
                  maskAadhaarSlide ? 'bg-blue-600' : 'bg-slate-300'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform duration-200 ease-in-out flex items-center justify-center text-[10px] font-black ${
                    maskAadhaarSlide ? 'translate-x-5 text-blue-600' : 'translate-x-0 text-slate-400'
                  }`}
                >
                  {maskAadhaarSlide ? <Check className="w-3 h-3 stroke-[3]" /> : ''}
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* Date & Search Control Row */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-3 border-t border-slate-100">
          {/* Time Filter Buttons */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-slate-500 mr-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" /> Date Range:
            </span>

            <button
              onClick={() => {
                setTimeFilter('all');
                setOnlyOverdueSlide(false);
              }}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                timeFilter === 'all' && !onlyOverdueSlide
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              All Time
            </button>

            <button
              onClick={() => {
                setTimeFilter('today');
                setOnlyOverdueSlide(false);
              }}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                timeFilter === 'today'
                  ? 'bg-blue-700 text-white shadow-xs'
                  : 'bg-blue-50 text-blue-800 hover:bg-blue-100'
              }`}
            >
              Today
            </button>

            <button
              onClick={() => {
                setTimeFilter('tomorrow');
                setOnlyOverdueSlide(false);
              }}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                timeFilter === 'tomorrow'
                  ? 'bg-emerald-700 text-white shadow-xs'
                  : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
              }`}
            >
              Tomorrow
            </button>

            <button
              onClick={() => {
                setTimeFilter('overdue');
                setOnlyOverdueSlide(true);
              }}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                timeFilter === 'overdue' || onlyOverdueSlide
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'bg-red-50 text-red-700 hover:bg-red-100'
              }`}
            >
              🔴 Overdue
            </button>

            <button
              onClick={() => {
                setTimeFilter('this-week');
                setOnlyOverdueSlide(false);
              }}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                timeFilter === 'this-week'
                  ? 'bg-indigo-700 text-white shadow-xs'
                  : 'bg-indigo-50 text-indigo-800 hover:bg-indigo-100'
              }`}
            >
              This Week
            </button>

            <button
              onClick={() => {
                setTimeFilter('custom');
                setOnlyOverdueSlide(false);
              }}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                timeFilter === 'custom'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              Custom Range
            </button>
          </div>

          {/* Search Box */}
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search Name, Mobile, Aadhaar, MH No..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:bg-white focus:border-blue-600 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Custom Date Range Picker */}
        {timeFilter === 'custom' && (
          <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
            <span className="font-bold text-slate-700">From Verification Date:</span>
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="px-2.5 py-1 rounded-lg border border-slate-300 text-xs"
            />
            <span className="font-bold text-slate-700">To:</span>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="px-2.5 py-1 rounded-lg border border-slate-300 text-xs"
            />
          </div>
        )}

        {/* Dropdown Filters */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-2 border-t border-slate-100 text-xs">
          {/* Taluka Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Taluka Filter</label>
            <select
              value={talukaFilter}
              onChange={(e) => setTalukaFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 font-semibold"
            >
              <option value="all">All Talukas ({availableTalukas.length})</option>
              {availableTalukas.map((t) => (
                <option key={t} value={t}>
                  Taluka: {t}
                </option>
              ))}
            </select>
          </div>

          {/* Staff Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">Assigned Staff</label>
            <select
              value={staffFilter}
              onChange={(e) => setStaffFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 font-semibold"
            >
              <option value="all">All Staff ({availableStaff.length})</option>
              {availableStaff.map((s) => (
                <option key={s} value={s}>
                  Staff: {s}
                </option>
              ))}
            </select>
          </div>

          {/* Reminder Status Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">WhatsApp Reminder Status</label>
            <select
              value={reminderStatusFilter}
              onChange={(e) => setReminderStatusFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 font-semibold"
            >
              <option value="all">All Reminder Statuses</option>
              <option value="not-sent">Reminder Not Sent</option>
              <option value="sent">Reminder Sent</option>
              <option value="prepared">Opened / Prepared</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Table List */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-200/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
              Pending Verification List
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-red-100 text-red-800 text-[11px] font-bold">
              {filteredItems.length} Records
            </span>
          </div>

          <div className="text-xs text-slate-500 font-medium hidden md:block">
            Click green WhatsApp button to launch pre-filled reminder
          </div>
        </div>

        {filteredItems.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
            <h3 className="text-base font-bold text-slate-800">No Pending Verification Records</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              All registrations, renewals, and claims matching your active filter criteria are verified!
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/70 border-b border-slate-200 text-[11px] uppercase font-bold text-slate-600">
                  <th className="p-3">Customer Name</th>
                  <th className="p-3">Aadhaar Card No.</th>
                  <th className="p-3">Mobile Number</th>
                  <th className="p-3">MH / Reg. Number</th>
                  <th className="p-3">Module</th>
                  <th className="p-3">Verification Date</th>
                  <th className="p-3">Current Status</th>
                  <th className="p-3">Assigned Staff</th>
                  <th className="p-3">Reminder Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredItems.map((item) => {
                  const isOverdue =
                    item.verificationDate && item.verificationDate < todayStr;
                  const remStatus = item.reminderInfo?.reminderStatus || 'Reminder Not Sent';
                  const remCount = item.reminderInfo?.reminderCount || 0;
                  const lastRemDate = item.reminderInfo?.lastReminderDate;

                  return (
                    <tr
                      key={`${item.module}-${item.id}`}
                      className={`hover:bg-slate-50 transition-colors ${
                        isOverdue ? 'bg-red-50/30' : ''
                      }`}
                    >
                      {/* Customer Name */}
                      <td className="p-3 font-bold text-slate-900">
                        <div className="flex items-center gap-1.5">
                          {isOverdue && (
                            <span className="w-2 h-2 rounded-full bg-red-600 shrink-0" title="Overdue Verification" />
                          )}
                          <span>{item.customerName}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-normal">
                          Taluka: {item.taluka}
                        </div>
                      </td>

                      {/* Aadhaar Card Number (REQUIREMENT 2: Aadhaar Card Column) */}
                      <td className="p-3 font-mono">
                        {item.aadhaarNumber && item.aadhaarNumber !== 'N/A' ? (
                          <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 border border-slate-300 text-slate-800 font-bold text-[11px]">
                            <CreditCard className="w-3 h-3 text-slate-500" />
                            <span>{formatAadhaarDisplay(item.aadhaarNumber, maskAadhaarSlide)}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">N/A</span>
                        )}
                      </td>

                      {/* Mobile Number */}
                      <td className="p-3 font-mono font-semibold text-slate-800">
                        <a
                          href={`tel:${item.mobileNumber}`}
                          className="hover:text-blue-700 flex items-center gap-1"
                        >
                          <Phone className="w-3 h-3 text-slate-400" />
                          <span>{item.mobileNumber}</span>
                        </a>
                      </td>

                      {/* MH Number / Registration Number */}
                      <td className="p-3 font-mono text-slate-700">
                        {item.mhNumber !== 'N/A' ? (
                          <span className="px-2 py-0.5 rounded-md bg-blue-50 border border-blue-200 text-blue-900 font-bold text-[11px]">
                            {item.mhNumber}
                          </span>
                        ) : (
                          <span className="text-slate-400">ID: {item.id}</span>
                        )}
                      </td>

                      {/* Module */}
                      <td className="p-3">
                        {item.module === 'Registration' ? (
                          <span className="px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 text-[10px] font-bold">
                            Registration
                          </span>
                        ) : item.module === 'Renewal' ? (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                            Renewal
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold">
                            Claim
                          </span>
                        )}
                      </td>

                      {/* Verification Date */}
                      <td className="p-3 font-medium">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span className={isOverdue ? 'text-red-700 font-extrabold' : 'text-slate-800'}>
                            {formatDate(item.verificationDate)}
                          </span>
                        </div>
                        {isOverdue && (
                          <span className="inline-block mt-0.5 px-1.5 py-0.2 text-[9px] font-black uppercase rounded-sm bg-red-600 text-white">
                            OVERDUE
                          </span>
                        )}
                      </td>

                      {/* Current Status */}
                      <td className="p-3">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 border border-slate-300 text-slate-800 font-semibold text-[10px]">
                          {item.currentStatus}
                        </span>
                      </td>

                      {/* Assigned Staff */}
                      <td className="p-3 text-slate-700 font-medium">
                        <div className="flex items-center gap-1">
                          <User className="w-3 h-3 text-slate-400" />
                          <span>{item.assignedStaff}</span>
                        </div>
                      </td>

                      {/* Reminder Status */}
                      <td className="p-3">
                        {remStatus === 'Reminder Sent' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-bold border border-emerald-300">
                            <CheckCircle2 className="w-3 h-3" /> Reminder Sent ({remCount})
                          </span>
                        ) : remStatus === 'Opened/Prepared' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-100 text-sky-800 text-[10px] font-bold border border-sky-300">
                            <Clock className="w-3 h-3" /> Opened/Prepared ({remCount})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-medium border border-slate-200">
                            Reminder Not Sent
                          </span>
                        )}
                        {lastRemDate && (
                          <div className="text-[9px] text-slate-400 mt-0.5">
                            Last: {formatDate(lastRemDate)}
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {/* Green WhatsApp Reminder Button */}
                          <button
                            onClick={() => handleOpenWhatsApp(item)}
                            className="py-1.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-all active:scale-95"
                            title="Open pre-filled WhatsApp link"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>WhatsApp Reminder</span>
                          </button>

                          {/* Quick Edit Status Option */}
                          <button
                            onClick={() => {
                              setEditingItem(item);
                              setNewStatus(item.currentStatus);
                            }}
                            className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-600 transition-all"
                            title="Update status"
                          >
                            <Settings className="w-3.5 h-3.5" />
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

      {/* WhatsApp Logging Modal (Prompts after opening wa.me) */}
      {activeWhatsAppModalItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4 border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-100 text-emerald-800">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    WhatsApp Chat Launched
                  </h3>
                  <p className="text-xs text-slate-500">
                    Customer: <span className="font-bold text-slate-800">{activeWhatsAppModalItem.customerName}</span> ({activeWhatsAppModalItem.mobileNumber})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveWhatsAppModalItem(null)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
              <span className="font-bold text-slate-700 block">Pre-filled WhatsApp Message:</span>
              <p className="text-slate-600 whitespace-pre-wrap font-sans leading-relaxed text-[11px] max-h-36 overflow-y-auto p-2 bg-white rounded-lg border border-slate-200">
                {generatedMessage}
              </p>
            </div>

            <p className="text-xs text-slate-600 font-medium">
              A new browser window was opened with the wa.me link. Please confirm your action to update the reminder history log:
            </p>

            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={() => handleSaveReminderLog('Reminder Sent')}
                disabled={loggingAction}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition-all"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Mark as "Reminder Sent"</span>
              </button>

              <button
                onClick={() => handleSaveReminderLog('Opened/Prepared')}
                disabled={loggingAction}
                className="w-full py-2.5 px-4 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all"
              >
                <Clock className="w-4 h-4" />
                <span>Mark as "Opened / Prepared"</span>
              </button>

              <button
                onClick={() => setActiveWhatsAppModalItem(null)}
                className="w-full py-2 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-all"
              >
                Cancel / Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Template Modal */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl space-y-4 border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-emerald-600" />
                <h3 className="text-base font-extrabold text-slate-900">
                  Edit WhatsApp Reminder Message Template
                </h3>
              </div>
              <button
                onClick={() => setShowTemplateModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Available dynamic variables: Click any tag below to insert into template text.
            </p>

            <div className="flex flex-wrap gap-1.5">
              {[
                '{{CUSTOMER_NAME}}',
                '{{MOBILE}}',
                '{{AADHAAR_NUMBER}}',
                '{{MH_NUMBER}}',
                '{{REGISTRATION_NUMBER}}',
                '{{VERIFICATION_DATE}}',
                '{{TALUKA}}',
                '{{STAFF_NAME}}',
              ].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setTemplateText((prev) => prev + ' ' + v)}
                  className="px-2 py-1 rounded-md bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-[11px] text-emerald-800 font-mono font-bold"
                >
                  + {v}
                </button>
              ))}
            </div>

            <textarea
              rows={9}
              value={templateText}
              onChange={(e) => setTemplateText(e.target.value)}
              className="w-full p-3 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 font-sans focus:bg-white focus:border-emerald-600 leading-relaxed"
            />

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowTemplateModal(false)}
                className="py-2 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTemplate}
                disabled={savingTemplate}
                className="py-2 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs"
              >
                {savingTemplate ? 'Saving...' : 'Save Template'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Status Modal */}
      {editingItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-200">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">
                Update Status for {editingItem.customerName} ({editingItem.module})
              </h3>
              <button onClick={() => setEditingItem(null)}>
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Select New Status:
              </label>
              {editingItem.module === 'Registration' ? (
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="w-full p-2 rounded-xl border border-slate-300 text-xs font-semibold"
                >
                  <option value="Active">Active / Verified</option>
                  <option value="Pending Verification">Pending Verification</option>
                  <option value="Pending">Pending</option>
                  <option value="Rejected">Rejected</option>
                </select>
              ) : editingItem.module === 'Renewal' ? (
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="w-full p-2 rounded-xl border border-slate-300 text-xs font-semibold"
                >
                  <option value="Active">Active / Completed</option>
                  <option value="Pending">Pending</option>
                  <option value="Rejected">Rejected</option>
                </select>
              ) : (
                <select
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                  className="w-full p-2 rounded-xl border border-slate-300 text-xs font-semibold"
                >
                  <option value="Submitted">Submitted</option>
                  <option value="Under Scrutiny">Under Scrutiny</option>
                  <option value="Approved">Approved</option>
                  <option value="Disbursed">Disbursed</option>
                  <option value="Rejected">Rejected</option>
                </select>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setEditingItem(null)}
                className="py-2 px-4 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveRecordStatus}
                className="py-2 px-4 rounded-xl bg-blue-700 text-white text-xs font-bold shadow-xs"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
