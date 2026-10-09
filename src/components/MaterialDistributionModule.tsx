import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Package,
  Boxes,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Download,
  Filter,
  RefreshCw,
  AlertTriangle,
  User as UserIcon,
  Phone,
  MapPin,
  Shield,
  FileSpreadsheet,
  Undo2,
  Info,
  Gift,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  MoveHorizontal,
  Plus,
  Layers,
  ShieldCheck,
  Check,
  Loader2,
  Settings,
  LayoutGrid,
  Table as TableIcon,
  Calendar,
  CreditCard,
  Copy,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { MaterialDistributionRecord, MaterialStatus, MaterialInventoryRecord, User } from '../types';
import { ClassicSlideSwitch } from './ClassicSlideSwitch';
import { LoadingAnimation } from './LoadingAnimation';

interface MaterialDistributionModuleProps {
  currentUser: User;
  onRefreshData?: () => void;
}

type TabType = 'bhandi_pending' | 'peti_pending' | 'bag_pending' | 'legacy_unverified' | 'given' | 'not_eligible' | 'all';

// Slide Switch Button Component for Material Status
interface SlideSwitchProps {
  status: MaterialStatus;
  disabled?: boolean;
  onToggle: (newStatus: 'Pending' | 'Given') => void;
  labelPending?: string;
  labelGiven?: string;
}

const SlideSwitch: React.FC<SlideSwitchProps> = ({
  status,
  disabled = false,
  onToggle,
  labelPending = 'Pending',
  labelGiven = 'Given',
}) => {
  const isGiven = status === 'Given';
  const isNotEligible = status === 'Not Eligible';

  if (isNotEligible) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-800 border border-rose-200">
        <XCircle className="w-3 h-3 text-rose-600" />
        Not Eligible
      </span>
    );
  }

  return (
    <ClassicSlideSwitch
      checked={isGiven}
      disabled={disabled}
      onChange={() => onToggle(isGiven ? 'Pending' : 'Given')}
      size="sm"
      variant="emerald"
      showText={true}
      activeText={labelGiven}
      inactiveText={labelPending}
      title="Slide Switch: Click or slide to change status"
    />
  );
};

export const MaterialDistributionModule: React.FC<MaterialDistributionModuleProps> = ({
  currentUser,
}) => {
  const [records, setRecords] = useState<MaterialDistributionRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  // Table container ref for horizontal data sliding
  const tableRef = useRef<HTMLDivElement>(null);
  const [slideProgress, setSlideProgress] = useState<number>(0);

  const scrollData = (offset: number) => {
    if (tableRef.current) {
      tableRef.current.scrollBy({ left: offset, behavior: 'smooth' });
    }
  };

  const handleTableScroll = () => {
    if (tableRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = tableRef.current;
      const maxScroll = scrollWidth - clientWidth;
      if (maxScroll > 0) {
        setSlideProgress(Math.round((scrollLeft / maxScroll) * 100));
      } else {
        setSlideProgress(0);
      }
    }
  };

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setSlideProgress(val);
    if (tableRef.current) {
      const { scrollWidth, clientWidth } = tableRef.current;
      const maxScroll = scrollWidth - clientWidth;
      tableRef.current.scrollLeft = (val / 100) * maxScroll;
    }
  };

  // Active filter tab
  const [activeTab, setActiveTab] = useState<TabType>('bhandi_pending');

  // Search and Filter fields
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTaluka, setSelectedTaluka] = useState<string>('');
  const [selectedSourceType, setSelectedSourceType] = useState<string>(''); // '' | 'Registration' | 'Renewal'
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [copiedMh, setCopiedMh] = useState<string>('');

  // Modal State for Mark Not Eligible
  const [notEligibleModalItem, setNotEligibleModalItem] = useState<{
    record: MaterialDistributionRecord;
    materialType: 'bhandi' | 'peti' | 'bag' | 'all';
  } | null>(null);

  const [notEligibleReason, setNotEligibleReason] = useState<string>('Not eligible for material');
  const [customRemark, setCustomRemark] = useState<string>('');
  const [updatedBy, setUpdatedBy] = useState<string>(currentUser.name || currentUser.username || 'Staff');
  const [updatedDate, setUpdatedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Material Inventory Stock Tracking (भांडी, पेटी, बॅग)
  const [inventory, setInventory] = useState<MaterialInventoryRecord[]>([
    { kitType: 'bhandi', kitName: 'भांडी (Cooking Utensils)', availableStock: 100, totalDistributed: 0 },
    { kitType: 'peti', kitName: 'पेटी (Trunk Box)', availableStock: 100, totalDistributed: 0 },
    { kitType: 'bag', kitName: 'बॅग (Safety Gear Bag)', availableStock: 100, totalDistributed: 0 },
  ]);

  // Customer Kit Distribution Modal State with Double-Click Protection
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<MaterialDistributionRecord | null>(null);
  const [customerMhQuery, setCustomerMhQuery] = useState('');
  const [formBhandi, setFormBhandi] = useState(false);
  const [formPeti, setFormPeti] = useState(false);
  const [formBag, setFormBag] = useState(false);
  const [formUpdatedBy, setFormUpdatedBy] = useState(currentUser.name || currentUser.username || 'Staff');
  const [formUpdatedDate, setFormUpdatedDate] = useState(new Date().toISOString().split('T')[0]);
  const [formRemark, setFormRemark] = useState('');
  const [formError, setFormError] = useState('');

  // 17. DOUBLE-CLICK / DUPLICATE SUBMISSION PROTECTION STATES
  // 'idle' | 'saving' | 'submitted'
  const [submissionStatus, setSubmissionStatus] = useState<'idle' | 'saving' | 'submitted'>('idle');

  // Fetch material inventory
  const fetchInventory = async () => {
    try {
      const res = await fetch('/api/material-inventory', {
        headers: {
          'x-user-username': currentUser.username,
          'x-user-role': currentUser.role,
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setInventory(data);
        }
      }
    } catch (_e) {}
  };

  // Fetch material distribution records from server
  const fetchRecords = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/material-distributions', {
        headers: {
          'x-user-username': currentUser.username,
          'x-user-role': currentUser.role,
        },
      });
      if (!res.ok) {
        throw new Error('Failed to fetch material distribution data');
      }
      const data = await res.json();
      if (Array.isArray(data)) {
        setRecords(data);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error loading material distribution data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
    fetchInventory();
  }, []);

  // Stock helpers
  const bhandiStock = useMemo(() => inventory.find((i) => i.kitType === 'bhandi')?.availableStock ?? 0, [inventory]);
  const petiStock = useMemo(() => inventory.find((i) => i.kitType === 'peti')?.availableStock ?? 0, [inventory]);
  const bagStock = useMemo(() => inventory.find((i) => i.kitType === 'bag')?.availableStock ?? 0, [inventory]);

  const bhandiDistributed = useMemo(() => inventory.find((i) => i.kitType === 'bhandi')?.totalDistributed ?? 0, [inventory]);
  const petiDistributed = useMemo(() => inventory.find((i) => i.kitType === 'peti')?.totalDistributed ?? 0, [inventory]);
  const bagDistributed = useMemo(() => inventory.find((i) => i.kitType === 'bag')?.totalDistributed ?? 0, [inventory]);

  // Calculate counts
  const bhandiPendingCount = useMemo(
    () => records.filter((r) => r.bhandiStatus === 'Pending').length,
    [records]
  );
  const petiPendingCount = useMemo(
    () => records.filter((r) => r.petiStatus === 'Pending').length,
    [records]
  );
  const bagPendingCount = useMemo(
    () => records.filter((r) => r.bagStatus === 'Pending').length,
    [records]
  );
  const legacyCount = useMemo(
    () => records.filter((r) => r.isLegacyRecord).length,
    [records]
  );
  const givenCount = useMemo(
    () =>
      records.filter(
        (r) =>
          r.bhandiStatus === 'Given' ||
          r.petiStatus === 'Given' ||
          r.bagStatus === 'Given'
      ).length,
    [records]
  );
  const notEligibleCount = useMemo(
    () =>
      records.filter(
        (r) =>
          r.bhandiStatus === 'Not Eligible' ||
          r.petiStatus === 'Not Eligible' ||
          r.bagStatus === 'Not Eligible'
      ).length,
    [records]
  );

  // Unique Talukas for dropdown
  const uniqueTalukas = useMemo(() => {
    const set = new Set<string>();
    records.forEach((r) => {
      if (r.taluka) set.add(r.taluka.trim());
    });
    return Array.from(set).sort();
  }, [records]);

  // Filter records based on active tab and search criteria
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      // 1. Tab level filter
      if (activeTab === 'bhandi_pending') {
        if (r.bhandiStatus !== 'Pending') return false;
      } else if (activeTab === 'peti_pending') {
        if (r.petiStatus !== 'Pending') return false;
      } else if (activeTab === 'bag_pending') {
        if (r.bagStatus !== 'Pending') return false;
      } else if (activeTab === 'legacy_unverified') {
        if (!r.isLegacyRecord) return false;
      } else if (activeTab === 'given') {
        if (
          r.bhandiStatus !== 'Given' &&
          r.petiStatus !== 'Given' &&
          r.bagStatus !== 'Given'
        )
          return false;
      } else if (activeTab === 'not_eligible') {
        if (
          r.bhandiStatus !== 'Not Eligible' &&
          r.petiStatus !== 'Not Eligible' &&
          r.bagStatus !== 'Not Eligible'
        )
          return false;
      }

      // 2. Taluka filter
      if (selectedTaluka && r.taluka !== selectedTaluka) {
        return false;
      }

      // 2b. Source Type filter (New / Renewal)
      if (selectedSourceType && r.sourceType !== selectedSourceType) {
        return false;
      }

      // 3. Search query filter (Name, MH Number, Mobile)
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchesName = r.workerName.toLowerCase().includes(q);
        const matchesMH = r.mhNumber.toLowerCase().includes(q);
        const matchesMobile = r.mobileNumber.toLowerCase().includes(q);
        const matchesTaluka = r.taluka.toLowerCase().includes(q);

        if (!matchesName && !matchesMH && !matchesMobile && !matchesTaluka) {
          return false;
        }
      }

      return true;
    });
  }, [records, activeTab, selectedTaluka, selectedSourceType, searchQuery]);

  // Open Customer Kit Distribution Modal
  const openCustomerDistributionModal = (record?: MaterialDistributionRecord) => {
    if (record) {
      setSelectedCustomer(record);
      setCustomerMhQuery(record.mhNumber);
      setFormBhandi(record.bhandiStatus === 'Given');
      setFormPeti(record.petiStatus === 'Given');
      setFormBag(record.bagStatus === 'Given');
    } else {
      setSelectedCustomer(null);
      setCustomerMhQuery('');
      setFormBhandi(false);
      setFormPeti(false);
      setFormBag(false);
    }
    setFormUpdatedBy(currentUser.name || currentUser.username || 'Staff');
    setFormUpdatedDate(new Date().toISOString().split('T')[0]);
    setFormRemark('');
    setFormError('');
    setSubmissionStatus('idle');
    setCustomerModalOpen(true);
  };

  // 17. Handle Customer Kit Submit / Update with Double-Click & Duplicate Protection
  const handleSubmitCustomerDistribution = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    // Prevent any duplicate click while already saving or submitted
    if (submissionStatus === 'saving' || submissionStatus === 'submitted') {
      return;
    }

    const targetMh = (selectedCustomer?.mhNumber || customerMhQuery).trim().toUpperCase();
    if (!targetMh) {
      setFormError('कृपया वैध MH नंबर टाका किंवा कामगार निवडा (Please provide valid MH Number)');
      return;
    }

    // 1. Disable immediately on the FIRST click and show loading spinner / "Saving..." state
    setSubmissionStatus('saving');
    setFormError('');

    const submissionId = `sub_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    try {
      const res = await fetch('/api/material-distributions/customer-submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-username': currentUser.username,
          'x-user-role': currentUser.role,
        },
        body: JSON.stringify({
          mhNumber: targetMh,
          workerName: selectedCustomer?.workerName || targetMh,
          mobileNumber: selectedCustomer?.mobileNumber || '',
          taluka: selectedCustomer?.taluka || '',
          sourceType: selectedCustomer?.sourceType || 'Registration',
          bhandiStatus: formBhandi ? 'Given' : 'Pending',
          petiStatus: formPeti ? 'Given' : 'Pending',
          bagStatus: formBag ? 'Given' : 'Pending',
          updatedBy: formUpdatedBy,
          updatedDate: formUpdatedDate,
          isLegacyVerification: Boolean(selectedCustomer?.isLegacyRecord),
          bhandiReason: formRemark,
          petiReason: formRemark,
          bagReason: formRemark,
          submissionId,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error || 'Failed to submit material distribution');
      }

      const resData = await res.json();
      const updatedRecord: MaterialDistributionRecord = resData.record;

      if (updatedRecord && updatedRecord.id) {
        setRecords((prev) => {
          const idx = prev.findIndex((r) => r.mhNumber === updatedRecord.mhNumber || r.id === updatedRecord.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = updatedRecord;
            return next;
          }
          return [updatedRecord, ...prev];
        });
      }

      if (Array.isArray(resData.inventory)) {
        setInventory(resData.inventory);
      } else {
        fetchInventory();
      }

      // 2. Transition to SUBMITTED ✓ state
      setSubmissionStatus('submitted');
      setSuccessMsg(`यशस्वी: ${targetMh} साठी किट वाटप जतन झाले! ✓`);
      setTimeout(() => setSuccessMsg(''), 4000);

      // Close modal smoothly after brief success display
      setTimeout(() => {
        setCustomerModalOpen(false);
        setSubmissionStatus('idle');
      }, 1200);
    } catch (err: any) {
      // 3. Re-enable button on error so operator can retry
      setSubmissionStatus('idle');
      setFormError(err?.message || 'Error occurred while saving distribution.');
    }
  };

  // Handle Mark as Given
  const handleMarkAsGiven = async (
    record: MaterialDistributionRecord,
    materialType: 'bhandi' | 'peti' | 'bag'
  ) => {
    if (isSubmitting) return;

    const materialNameMap = {
      bhandi: 'भांडी',
      peti: 'पेटी',
      bag: 'बॅग',
    };

    setIsSubmitting(true);
    const previousRecords = [...records];
    const todayStr = new Date().toISOString().split('T')[0];
    const updaterName = currentUser.name || currentUser.username || 'Staff';

    // Optimistic UI update
    setRecords((prev) =>
      prev.map((r) => {
        if (r.id !== record.id) return r;
        return {
          ...r,
          [`${materialType}Status`]: 'Given',
          [`${materialType}GivenDate`]: todayStr,
          [`${materialType}GivenBy`]: updaterName,
          [`${materialType}NotEligibleReason`]: undefined,
        };
      })
    );

    try {
      setErrorMsg('');
      const res = await fetch(`/api/material-distributions/${record.id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-username': currentUser.username,
          'x-user-role': currentUser.role,
        },
        body: JSON.stringify({
          materialType,
          newStatus: 'Given',
          updatedBy: updaterName,
          updatedDate: todayStr,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData?.error || 'Failed to update material status');
      }

      const updatedRecord: MaterialDistributionRecord = await res.json();
      if (updatedRecord && updatedRecord.id) {
        setRecords((prev) =>
          prev.map((r) => (r.id === updatedRecord.id ? updatedRecord : r))
        );
      }

      fetchInventory();

      setSuccessMsg(
        `Successfully marked ${materialNameMap[materialType]} as GIVEN for ${record.workerName}`
      );
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: any) {
      setRecords(previousRecords);
      setErrorMsg(err?.message || 'Error marking material as Given');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Not Eligible Modal
  const openNotEligibleModal = (
    record: MaterialDistributionRecord,
    materialType: 'bhandi' | 'peti' | 'bag' | 'all'
  ) => {
    setNotEligibleModalItem({ record, materialType });
    setNotEligibleReason('Not eligible for material');
    setCustomRemark('');
    setUpdatedBy(currentUser.name || currentUser.username || 'Staff');
    setUpdatedDate(new Date().toISOString().split('T')[0]);
  };

  // Submit Mark Not Eligible
  const handleConfirmNotEligible = async () => {
    if (!notEligibleModalItem) return;

    if (notEligibleReason === 'Other' && !customRemark.trim()) {
      setErrorMsg('Please enter a remark when selecting "Other" as the reason.');
      return;
    }

    const finalReason =
      notEligibleReason === 'Other'
        ? `Other: ${customRemark.trim()}`
        : notEligibleReason;

    const targetRecord = notEligibleModalItem.record;
    const matType = notEligibleModalItem.materialType;
    const previousRecords = [...records];

    // Optimistic UI update
    setRecords((prev) =>
      prev.map((r) => {
        if (r.id !== targetRecord.id) return r;
        const updated = { ...r };
        if (matType === 'all' || matType === 'bhandi') {
          updated.bhandiStatus = 'Not Eligible';
          updated.bhandiNotEligibleReason = finalReason;
        }
        if (matType === 'all' || matType === 'peti') {
          updated.petiStatus = 'Not Eligible';
          updated.petiNotEligibleReason = finalReason;
        }
        if (matType === 'all' || matType === 'bag') {
          updated.bagStatus = 'Not Eligible';
          updated.bagNotEligibleReason = finalReason;
        }
        return updated;
      })
    );

    try {
      setIsSubmitting(true);
      setErrorMsg('');

      const res = await fetch(
        `/api/material-distributions/${targetRecord.id}/status`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'x-user-username': currentUser.username,
            'x-user-role': currentUser.role,
          },
          body: JSON.stringify({
            materialType: matType,
            newStatus: 'Not Eligible',
            updatedBy,
            updatedDate,
            reason: finalReason,
          }),
        }
      );

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData?.error || 'Failed to update eligibility status');
      }

      const updatedRecord: MaterialDistributionRecord = await res.json();
      if (updatedRecord && updatedRecord.id) {
        setRecords((prev) =>
          prev.map((r) => (r.id === updatedRecord.id ? updatedRecord : r))
        );
      }

      setSuccessMsg(
        `Worker ${targetRecord.workerName} marked as NOT ELIGIBLE.`
      );
      setTimeout(() => setSuccessMsg(''), 4000);
      setNotEligibleModalItem(null);
    } catch (err: any) {
      setRecords(previousRecords);
      setErrorMsg(err?.message || 'Error updating eligibility status');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Admin Revert Not Eligible -> Pending
  const handleRevertToPending = async (
    record: MaterialDistributionRecord,
    materialType: 'bhandi' | 'peti' | 'bag' | 'all'
  ) => {
    if (currentUser.role !== 'admin') {
      setErrorMsg('Only Admin can revert status back to Pending.');
      return;
    }

    const previousRecords = [...records];

    // Optimistic UI update
    setRecords((prev) =>
      prev.map((r) => {
        if (r.id !== record.id) return r;
        const updated = { ...r };
        if (materialType === 'all' || materialType === 'bhandi') {
          updated.bhandiStatus = 'Pending';
          updated.bhandiGivenDate = undefined;
          updated.bhandiGivenBy = undefined;
          updated.bhandiNotEligibleReason = undefined;
        }
        if (materialType === 'all' || materialType === 'peti') {
          updated.petiStatus = 'Pending';
          updated.petiGivenDate = undefined;
          updated.petiGivenBy = undefined;
          updated.petiNotEligibleReason = undefined;
        }
        if (materialType === 'all' || materialType === 'bag') {
          updated.bagStatus = 'Pending';
          updated.bagGivenDate = undefined;
          updated.bagGivenBy = undefined;
          updated.bagNotEligibleReason = undefined;
        }
        return updated;
      })
    );

    try {
      setErrorMsg('');
      const res = await fetch(`/api/material-distributions/${record.id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-user-username': currentUser.username,
          'x-user-role': currentUser.role,
        },
        body: JSON.stringify({
          materialType,
          newStatus: 'Pending',
          updatedBy: currentUser.name || currentUser.username,
          updatedDate: new Date().toISOString().split('T')[0],
          reason: 'Reverted back to Pending by Admin',
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData?.error || 'Failed to revert status');
      }

      const updatedRecord: MaterialDistributionRecord = await res.json();
      if (updatedRecord && updatedRecord.id) {
        setRecords((prev) =>
          prev.map((r) => (r.id === updatedRecord.id ? updatedRecord : r))
        );
      }

      setSuccessMsg(
        `Reverted material status back to PENDING for ${record.workerName}`
      );
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: any) {
      setRecords(previousRecords);
      setErrorMsg(err?.message || 'Error reverting status to Pending');
    }
  };

  // FEATURE 14: Export Currently Filtered Records to Excel
  const handleExportExcel = () => {
    if (filteredRecords.length === 0) {
      setErrorMsg('No records match the current filters to export.');
      return;
    }

    const getGivenDateStr = (r: MaterialDistributionRecord) => {
      if (activeTab === 'bhandi_pending') return r.bhandiGivenDate || '-';
      if (activeTab === 'peti_pending') return r.petiGivenDate || '-';
      if (activeTab === 'bag_pending') return r.bagGivenDate || '-';
      
      const parts: string[] = [];
      if (r.bhandiGivenDate) parts.push(`भांडी: ${r.bhandiGivenDate}`);
      if (r.petiGivenDate) parts.push(`पेटी: ${r.petiGivenDate}`);
      if (r.bagGivenDate) parts.push(`बॅग: ${r.bagGivenDate}`);
      return parts.length > 0 ? parts.join(' | ') : '-';
    };

    const getGivenByStr = (r: MaterialDistributionRecord) => {
      if (activeTab === 'bhandi_pending') return r.bhandiGivenBy || '-';
      if (activeTab === 'peti_pending') return r.petiGivenBy || '-';
      if (activeTab === 'bag_pending') return r.bagGivenBy || '-';

      const parts: string[] = [];
      if (r.bhandiGivenBy) parts.push(`भांडी: ${r.bhandiGivenBy}`);
      if (r.petiGivenBy) parts.push(`पेटी: ${r.petiGivenBy}`);
      if (r.bagGivenBy) parts.push(`बॅग: ${r.bagGivenBy}`);
      return parts.length > 0 ? parts.join(' | ') : '-';
    };

    const excelData = filteredRecords.map((r) => ({
      'Full Name': r.workerName,
      'MH Number': r.mhNumber,
      'Mobile Number': r.mobileNumber,
      'Taluka': r.taluka || '-',
      'भांडी Status': r.bhandiStatus,
      'पेटी Status': r.petiStatus,
      'बॅग Status': r.bagStatus,
      'Legacy Record': r.isLegacyRecord ? 'Yes (जुनी नोंद)' : 'No',
      'Given Date': getGivenDateStr(r),
      'Given By': getGivenByStr(r),
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();

    const sheetTitleMap: Record<TabType, string> = {
      bhandi_pending: 'Bhandi_Pending',
      peti_pending: 'Peti_Pending',
      bag_pending: 'Bag_Pending',
      legacy_unverified: 'Legacy_Unverified',
      given: 'Given_List',
      not_eligible: 'Not_Eligible',
      all: 'Material_Distribution_All',
    };

    const sheetName = sheetTitleMap[activeTab] || 'Material_Distribution';
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    const dateStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(
      workbook,
      `Material_Distribution_${sheetName}_${dateStr}.xlsx`
    );
  };

  const getStatusBadge = (status: MaterialStatus) => {
    switch (status) {
      case 'Given':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            Given
          </span>
        );
      case 'Not Eligible':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-100 text-rose-800 border border-rose-200">
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
            Not Eligible
          </span>
        );
      case 'Pending':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            Pending
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-teal-800 via-emerald-800 to-indigo-900 rounded-2xl p-6 text-white shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="p-3 bg-white/10 backdrop-blur-md rounded-xl border border-white/20">
              <Boxes className="w-7 h-7 text-teal-200" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">
                Material Distribution Module
              </h1>
              <p className="text-xs text-teal-100 mt-1">
                Active Workers Equipment Distribution (भांडी, पेटी, बॅग) • Only Active Workers with valid MH numbers • Data Slide & Excel Exports
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => openCustomerDistributionModal()}
              className="px-4 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
              title="Open Kit Distribution Form"
            >
              <Plus className="w-4 h-4" />
              <span>नवीन किट नोंद (Add Kit Record)</span>
            </button>
            <button
              onClick={handleExportExcel}
              className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white font-semibold text-xs rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
              title="Export filtered records to Excel"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-100" />
              Export Excel ({filteredRecords.length})
            </button>
            <button
              onClick={() => {
                fetchRecords();
              }}
              disabled={loading}
              className="p-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl backdrop-blur-md transition-all border border-white/20 cursor-pointer disabled:opacity-50"
              title="Refresh Records"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-xs flex items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button
            onClick={() => setErrorMsg('')}
            className="text-rose-500 hover:text-rose-700 font-bold"
          >
            ×
          </button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs flex items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button
            onClick={() => setSuccessMsg('')}
            className="text-emerald-500 hover:text-emerald-700 font-bold"
          >
            ×
          </button>
        </div>
      )}

      {/* FEATURE 11: Material-Wise Pending Tabs & Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 space-y-4">
        {/* Navigation Tabs */}
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3">
          <button
            onClick={() => setActiveTab('bhandi_pending')}
            className={`px-4 py-2.5 rounded-xl font-semibold text-xs transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'bhandi_pending'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Gift className="w-4 h-4" />
            <span>भांडी Pending</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                activeTab === 'bhandi_pending'
                  ? 'bg-white/20 text-white'
                  : 'bg-teal-100 text-teal-800'
              }`}
            >
              {bhandiPendingCount}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('peti_pending')}
            className={`px-4 py-2.5 rounded-xl font-semibold text-xs transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'peti_pending'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Boxes className="w-4 h-4" />
            <span>पेटी Pending</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                activeTab === 'peti_pending'
                  ? 'bg-white/20 text-white'
                  : 'bg-teal-100 text-teal-800'
              }`}
            >
              {petiPendingCount}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('bag_pending')}
            className={`px-4 py-2.5 rounded-xl font-semibold text-xs transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'bag_pending'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>बॅग Pending</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                activeTab === 'bag_pending'
                  ? 'bg-white/20 text-white'
                  : 'bg-teal-100 text-teal-800'
              }`}
            >
              {bagPendingCount}
            </span>
          </button>

          {/* 19. LEGACY RECORD FILTER TAB */}
          <button
            onClick={() => setActiveTab('legacy_unverified')}
            className={`px-4 py-2.5 rounded-xl font-semibold text-xs transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'legacy_unverified'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span>जुने अन-व्हेरिफाईड (Legacy)</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                activeTab === 'legacy_unverified'
                  ? 'bg-white/20 text-white'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {legacyCount}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('given')}
            className={`px-4 py-2.5 rounded-xl font-semibold text-xs transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'given'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Given List</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                activeTab === 'given'
                  ? 'bg-white/20 text-white'
                  : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {givenCount}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('not_eligible')}
            className={`px-4 py-2.5 rounded-xl font-semibold text-xs transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'not_eligible'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <XCircle className="w-4 h-4" />
            <span>Not Eligible List</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                activeTab === 'not_eligible'
                  ? 'bg-white/20 text-white'
                  : 'bg-rose-100 text-rose-800'
              }`}
            >
              {notEligibleCount}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('all')}
            className={`px-4 py-2.5 rounded-xl font-semibold text-xs transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'all'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <span>All Records ({records.length})</span>
          </button>
        </div>

        {/* Search & Filter Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by Name, MH Number, Mobile..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-teal-500 focus:bg-white outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ×
              </button>
            )}
          </div>

          <div>
            <select
              value={selectedTaluka}
              onChange={(e) => setSelectedTaluka(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-teal-500 focus:bg-white outline-none cursor-pointer"
            >
              <option value="">All Talukas</option>
              {uniqueTalukas.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={selectedSourceType}
              onChange={(e) => setSelectedSourceType(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-teal-500 focus:bg-white outline-none cursor-pointer font-medium text-slate-700"
            >
              <option value="">All Types (New & Renewal)</option>
              <option value="Registration">New / नवीन नोंदणी</option>
              <option value="Renewal">Renewal / नूतनीकरण</option>
            </select>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500 px-1">
            <span>
              Showing <strong className="text-slate-800">{filteredRecords.length}</strong> records
            </span>
            {(searchQuery || selectedTaluka || selectedSourceType) && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setSelectedTaluka('');
                  setSelectedSourceType('');
                }}
                className="text-teal-600 hover:text-teal-800 text-xs font-semibold underline cursor-pointer"
              >
                Reset Filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Records Table Container with Data Slide controls */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden space-y-0">
        {/* View Mode & Slide Controls Bar */}
        <div className="px-4 py-2.5 bg-slate-50/95 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* View Mode Toggle: Cards vs Table */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold text-slate-500 mr-0.5">दृश्य (View):</span>
            <div className="flex items-center bg-white p-0.5 rounded-xl border border-slate-200 shadow-2xs">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-teal-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
                title="कार्ड्स व्ह्यू (Cards view)"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>कार्ड्स (Cards)</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-teal-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
                title="तक्ता व्ह्यू (Table view)"
              >
                <TableIcon className="w-3.5 h-3.5" />
                <span>तक्ता (Table)</span>
              </button>
            </div>

            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-teal-800 bg-teal-50 border border-teal-200/80 px-2.5 py-1 rounded-lg font-medium">
              <Info className="w-3 h-3 text-teal-600 shrink-0" />
              <span>कार्डवर क्लिक करा व किट वाटप चेकबॉक्स (भांडी, पेटी, बॅग) भरा</span>
            </span>
          </div>

          {/* Table Slide Controls only when table mode active */}
          {viewMode === 'table' ? (
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => scrollData(-320)}
                className="classic-slide-btn classic-slide-btn-left"
                title="Slide Table Left / डावीकडे सरकवा"
              >
                <ChevronLeft className="w-4 h-4 text-blue-700 shrink-0" />
                <span>◀ डावीकडे (Left)</span>
              </button>

              <button
                type="button"
                onClick={() => scrollData(320)}
                className="classic-slide-btn classic-slide-btn-right"
                title="Slide Table Right / उजवीकडे सरकवा"
              >
                <span>उजवीकडे (Right) ▶</span>
                <ChevronRight className="w-4 h-4 text-white shrink-0" />
              </button>
            </div>
          ) : (
            <div className="text-[11px] text-slate-500 font-medium">
              एकूण: <strong className="text-slate-800 font-bold">{filteredRecords.length}</strong> कामगार
            </div>
          )}
        </div>

        {loading ? (
          <div className="p-16 text-center text-slate-500 flex flex-col items-center justify-center">
            <LoadingAnimation
              size="lg"
              color="teal"
              text="माहिती लोड होत आहे..."
              subText="कृपया थोडा वेळ प्रतीक्षा करा, रेकॉर्ड्स डेटाबेसमधून सुरक्षितपणे लोड होत आहेत."
            />
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="p-12 text-center text-slate-500 space-y-2">
            <Boxes className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="text-sm font-semibold text-slate-700">No Records Found</p>
            <p className="text-xs text-slate-400">
              {searchQuery || selectedTaluka
                ? 'Try adjusting your search criteria or filters.'
                : 'No workers matching the selected material category status.'}
            </p>
          </div>
        ) : viewMode === 'grid' ? (
          /* Cards Grid View (exact layout from screenshot) */
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 bg-slate-50/40">
            {filteredRecords.map((r) => {
              const isLegacy = Boolean(r.isLegacyRecord);
              const allGiven = r.bhandiStatus === 'Given' && r.petiStatus === 'Given' && r.bagStatus === 'Given';
              const anyGiven = r.bhandiStatus === 'Given' || r.petiStatus === 'Given' || r.bagStatus === 'Given';

              return (
                <div
                  key={r.id}
                  onClick={() => openCustomerDistributionModal(r)}
                  className={`p-5 rounded-2xl bg-white border cursor-pointer transition-all shadow-xs hover:shadow-md group relative overflow-hidden flex flex-col justify-between ${
                    isLegacy
                      ? 'border-amber-300 hover:border-amber-500 bg-gradient-to-b from-amber-50/15 to-white'
                      : 'border-slate-200/90 hover:border-blue-600/50'
                  }`}
                >
                  <div>
                    {/* Header: Type Badge & Status (exact match to screenshot) */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border bg-blue-50 text-blue-700 border-blue-200">
                        <UserIcon className="w-3 h-3" />
                        <span>{r.sourceType === 'Registration' ? 'Registration' : 'Renewal'}</span>
                      </span>

                      <div className="flex items-center gap-1.5">
                        {isLegacy ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold border bg-amber-50 text-amber-800 border-amber-300 flex items-center gap-1" title="जुनी नोंद - किट माहिती प्रत्यक्ष पडताळा">
                            <AlertTriangle className="w-3 h-3 text-amber-600" />
                            <span>Pending Verification</span>
                          </span>
                        ) : allGiven ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold border bg-emerald-50 text-emerald-800 border-emerald-300 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>सर्व किट वाटप (Given)</span>
                          </span>
                        ) : anyGiven ? (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold border bg-sky-50 text-sky-800 border-sky-300 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-sky-600" />
                            <span>आंशिक वाटप (Partial)</span>
                          </span>
                        ) : (
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold border bg-amber-50 text-amber-800 border-amber-200 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-amber-600" />
                            <span>Pending Verification</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Worker Name in Bold Uppercase */}
                    <h3 className="font-extrabold text-slate-900 text-base group-hover:text-blue-700 transition-colors uppercase tracking-tight leading-snug">
                      {r.workerName}
                    </h3>

                    {/* MH Number in Dark Blue Monospace */}
                    <div className="text-xs font-mono font-bold text-blue-700 mt-0.5 flex items-center justify-between gap-1">
                      <span>MH No: {r.mhNumber || 'Pending'}</span>
                      {r.mhNumber && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(r.mhNumber);
                            setCopiedMh(r.mhNumber);
                            setTimeout(() => setCopiedMh(''), 2000);
                          }}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-sans font-bold flex items-center gap-1 border transition-all cursor-pointer ${
                            copiedMh === r.mhNumber
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                              : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
                          }`}
                          title="Copy MH Number"
                        >
                          {copiedMh === r.mhNumber ? (
                            <>
                              <Check className="w-2.5 h-2.5 text-emerald-600 stroke-[3]" />
                              <span>Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-2.5 h-2.5 text-slate-500" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    {/* Details 2-Column Grid (exact match to screenshot) */}
                    <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs text-slate-600 font-medium">
                      <div className="flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{r.mobileNumber || 'N/A'}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{r.taluka || 'N/A'}</span>
                      </div>
                      <div className="flex items-center gap-1.5 col-span-2">
                        <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>Date: {r.updatedAt ? new Date(r.updatedAt).toLocaleDateString('en-GB') : (r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-GB') : '02-10-2026')}</span>
                      </div>
                      <div className="flex items-center gap-1.5 col-span-2 text-slate-700 font-mono">
                        <CreditCard className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>Source: <strong className="font-semibold text-slate-800">{r.sourceType}</strong></span>
                      </div>
                    </div>

                    {/* Kit Checkbox Status Pills (भांडी, पेटी, बॅग) */}
                    <div className="mt-3 p-2 bg-slate-50 rounded-xl border border-slate-200/80 grid grid-cols-3 gap-1.5 text-[11px]">
                      <div className={`flex items-center justify-center gap-1 font-bold py-1 px-1.5 rounded-lg border ${r.bhandiStatus === 'Given' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-white text-slate-600 border-slate-200'}`}>
                        {r.bhandiStatus === 'Given' ? <Check className="w-3 h-3 text-emerald-600 stroke-[3]" /> : <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />}
                        <span>भांडी</span>
                      </div>
                      <div className={`flex items-center justify-center gap-1 font-bold py-1 px-1.5 rounded-lg border ${r.petiStatus === 'Given' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-white text-slate-600 border-slate-200'}`}>
                        {r.petiStatus === 'Given' ? <Check className="w-3 h-3 text-emerald-600 stroke-[3]" /> : <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />}
                        <span>पेटी</span>
                      </div>
                      <div className={`flex items-center justify-center gap-1 font-bold py-1 px-1.5 rounded-lg border ${r.bagStatus === 'Given' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-white text-slate-600 border-slate-200'}`}>
                        {r.bagStatus === 'Given' ? <Check className="w-3 h-3 text-emerald-600 stroke-[3]" /> : <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />}
                        <span>बॅग</span>
                      </div>
                    </div>
                  </div>

                  {/* Card Footer Actions */}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                    <span className="text-blue-700 font-bold group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
                      <span>{isLegacy ? 'Verify Kits' : 'View Docket'}</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </span>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openCustomerDistributionModal(r);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-800 font-bold text-[11px] flex items-center gap-1 border border-teal-300 shadow-2xs transition-colors cursor-pointer"
                      title="किट वाटप चेकबॉक्स उघडा"
                    >
                      <Boxes className="w-3 h-3 text-teal-700" />
                      <span>☑ किट निवडा</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div
            ref={tableRef}
            onScroll={handleTableScroll}
            className="overflow-x-auto scrollbar-thin scrollbar-thumb-teal-300"
          >
            <table className="w-full text-left text-xs border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                  <th className="py-3.5 px-4">Worker Name</th>
                  <th className="py-3.5 px-4">MH Number</th>
                  <th className="py-3.5 px-4">Mobile</th>
                  <th className="py-3.5 px-4">Taluka</th>
                  <th className="py-3.5 px-4">Source</th>
                  <th className="py-3.5 px-4 text-center">भांडी</th>
                  <th className="py-3.5 px-4 text-center">पेटी</th>
                  <th className="py-3.5 px-4 text-center">बॅग</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredRecords.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-slate-900">
                      <div className="flex flex-col items-start gap-1">
                        <span className="font-bold">{r.workerName}</span>
                        {r.isLegacyRecord && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                            <AlertTriangle className="w-3 h-3 text-amber-600 shrink-0" />
                            जुनी नोंद (Legacy)
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-mono font-medium text-teal-700">
                      <div className="flex items-center gap-1.5">
                        <span>{r.mhNumber}</span>
                        {r.mhNumber && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigator.clipboard.writeText(r.mhNumber);
                              setCopiedMh(r.mhNumber);
                              setTimeout(() => setCopiedMh(''), 2000);
                            }}
                            className={`p-1 rounded text-[10px] flex items-center transition-colors cursor-pointer ${
                              copiedMh === r.mhNumber
                                ? 'text-emerald-700 bg-emerald-50'
                                : 'text-slate-400 hover:text-teal-700 hover:bg-slate-100'
                            }`}
                            title="Copy MH Number"
                          >
                            {copiedMh === r.mhNumber ? (
                              <Check className="w-3 h-3 text-emerald-600 stroke-[3]" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-slate-600">{r.mobileNumber || '-'}</td>
                    <td className="py-3.5 px-4 text-slate-600">{r.taluka || '-'}</td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                          r.sourceType === 'Registration'
                            ? 'bg-sky-50 text-sky-700 border-sky-200'
                            : 'bg-purple-50 text-purple-700 border-purple-200'
                        }`}
                      >
                        {r.sourceType === 'Registration' ? 'New (नवीन)' : 'Renewal (नूतनीकरण)'}
                      </span>
                    </td>

                    {/* भांडी Status */}
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <SlideSwitch
                          status={r.bhandiStatus}
                          disabled={isSubmitting}
                          onToggle={(newStatus) => {
                            if (newStatus === 'Given') {
                              handleMarkAsGiven(r, 'bhandi');
                            } else if (currentUser.role === 'admin') {
                              handleRevertToPending(r, 'bhandi');
                            } else {
                              setErrorMsg('Only Admin can revert Given status back to Pending.');
                            }
                          }}
                        />
                        {r.bhandiGivenDate && (
                          <span className="text-[10px] text-slate-400">
                            {r.bhandiGivenDate}
                          </span>
                        )}
                        {r.bhandiNotEligibleReason && (
                          <span className="text-[10px] text-rose-500 font-medium max-w-[120px] truncate" title={r.bhandiNotEligibleReason}>
                            {r.bhandiNotEligibleReason}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* पेटी Status */}
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <SlideSwitch
                          status={r.petiStatus}
                          disabled={isSubmitting}
                          onToggle={(newStatus) => {
                            if (newStatus === 'Given') {
                              handleMarkAsGiven(r, 'peti');
                            } else if (currentUser.role === 'admin') {
                              handleRevertToPending(r, 'peti');
                            } else {
                              setErrorMsg('Only Admin can revert Given status back to Pending.');
                            }
                          }}
                        />
                        {r.petiGivenDate && (
                          <span className="text-[10px] text-slate-400">
                            {r.petiGivenDate}
                          </span>
                        )}
                        {r.petiNotEligibleReason && (
                          <span className="text-[10px] text-rose-500 font-medium max-w-[120px] truncate" title={r.petiNotEligibleReason}>
                            {r.petiNotEligibleReason}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* बॅग Status */}
                    <td className="py-3.5 px-4 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <SlideSwitch
                          status={r.bagStatus}
                          disabled={isSubmitting}
                          onToggle={(newStatus) => {
                            if (newStatus === 'Given') {
                              handleMarkAsGiven(r, 'bag');
                            } else if (currentUser.role === 'admin') {
                              handleRevertToPending(r, 'bag');
                            } else {
                              setErrorMsg('Only Admin can revert Given status back to Pending.');
                            }
                          }}
                        />
                        {r.bagGivenDate && (
                          <span className="text-[10px] text-slate-400">
                            {r.bagGivenDate}
                          </span>
                        )}
                        {r.bagNotEligibleReason && (
                          <span className="text-[10px] text-rose-500 font-medium max-w-[120px] truncate" title={r.bagNotEligibleReason}>
                            {r.bagNotEligibleReason}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Actions Column */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Always visible: Customer Kit Distribution / Legacy Verification button */}
                        <button
                          onClick={() => openCustomerDistributionModal(r)}
                          disabled={isSubmitting}
                          className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg shadow-2xs transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50 ${
                            r.isLegacyRecord
                              ? 'bg-amber-600 hover:bg-amber-700 text-white'
                              : 'bg-teal-700 hover:bg-teal-800 text-white'
                          }`}
                          title={r.isLegacyRecord ? 'Verify individual kits for this legacy customer' : 'Open Kit Distribution Form'}
                        >
                          <Boxes className="w-3 h-3" />
                          <span>{r.isLegacyRecord ? 'किट तपासा' : 'किट वाटप'}</span>
                        </button>

                        {/* If viewing Bhandi Pending tab */}
                        {activeTab === 'bhandi_pending' && (
                          <>
                            <button
                              onClick={() => handleMarkAsGiven(r, 'bhandi')}
                              disabled={isSubmitting}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold rounded-lg shadow-2xs transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              Mark Given
                            </button>
                            <button
                              onClick={() => openNotEligibleModal(r, 'bhandi')}
                              disabled={isSubmitting}
                              className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-semibold rounded-lg border border-rose-200 transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <XCircle className="w-3 h-3 text-rose-600" />
                              Not Eligible
                            </button>
                          </>
                        )}

                        {/* If viewing Peti Pending tab */}
                        {activeTab === 'peti_pending' && (
                          <>
                            <button
                              onClick={() => handleMarkAsGiven(r, 'peti')}
                              disabled={isSubmitting}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold rounded-lg shadow-2xs transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              Mark Given
                            </button>
                            <button
                              onClick={() => openNotEligibleModal(r, 'peti')}
                              disabled={isSubmitting}
                              className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-semibold rounded-lg border border-rose-200 transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <XCircle className="w-3 h-3 text-rose-600" />
                              Not Eligible
                            </button>
                          </>
                        )}

                        {/* If viewing Bag Pending tab */}
                        {activeTab === 'bag_pending' && (
                          <>
                            <button
                              onClick={() => handleMarkAsGiven(r, 'bag')}
                              disabled={isSubmitting}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold rounded-lg shadow-2xs transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              Mark Given
                            </button>
                            <button
                              onClick={() => openNotEligibleModal(r, 'bag')}
                              disabled={isSubmitting}
                              className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-semibold rounded-lg border border-rose-200 transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <XCircle className="w-3 h-3 text-rose-600" />
                              Not Eligible
                            </button>
                          </>
                        )}

                        {/* If viewing Not Eligible tab */}
                        {activeTab === 'not_eligible' && (
                          <div className="flex items-center gap-1.5">
                            {currentUser.role === 'admin' ? (
                              <button
                                onClick={() => handleRevertToPending(r, 'all')}
                                disabled={isSubmitting}
                                className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 text-[11px] font-semibold rounded-lg border border-amber-200 transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                title="Admin only: Revert status back to Pending"
                              >
                                <Undo2 className="w-3 h-3 text-amber-600" />
                                Revert to Pending
                              </button>
                            ) : (
                              <span className="text-[11px] text-slate-400 italic">
                                Admin action required
                              </span>
                            )}
                          </div>
                        )}

                        {/* Generic / All tab actions */}
                        {(activeTab === 'given' || activeTab === 'all') && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => openNotEligibleModal(r, 'all')}
                              disabled={isSubmitting}
                              className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold rounded-lg transition-all flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <XCircle className="w-3 h-3 text-slate-500" />
                              Mark Not Eligible
                            </button>
                          </div>
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

      {/* FEATURE 20: NOT ELIGIBLE MODAL */}
      {notEligibleModalItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden space-y-4 p-6">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <XCircle className="w-5 h-5 text-rose-600" />
                  Mark Worker as Not Eligible
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Worker will be removed from Pending lists while preserving record history.
                </p>
              </div>
              <button
                onClick={() => setNotEligibleModalItem(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {/* Worker Info Card */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                <div className="font-bold text-slate-800">
                  {notEligibleModalItem.record.workerName}
                </div>
                <div className="text-slate-500 font-mono">
                  MH Number: <strong className="text-teal-700">{notEligibleModalItem.record.mhNumber}</strong>
                </div>
                <div className="text-slate-500">
                  Taluka: {notEligibleModalItem.record.taluka || '-'} | Mobile: {notEligibleModalItem.record.mobileNumber}
                </div>
              </div>

              {/* Material Choice */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Target Material
                </label>
                <select
                  value={notEligibleModalItem.materialType}
                  onChange={(e) =>
                    setNotEligibleModalItem({
                      ...notEligibleModalItem,
                      materialType: e.target.value as any,
                    })
                  }
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-rose-500 outline-none cursor-pointer"
                >
                  <option value="bhandi">भांडी (Cooking Utensils)</option>
                  <option value="peti">पेटी (Trunk Box)</option>
                  <option value="bag">बॅग (Safety Gear Bag)</option>
                  <option value="all">All Materials (भांडी, पेटी, बॅग)</option>
                </select>
              </div>

              {/* Reason Selection */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Reason for Ineligibility <span className="text-rose-500">*</span>
                </label>
                <select
                  value={notEligibleReason}
                  onChange={(e) => setNotEligibleReason(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-rose-500 outline-none cursor-pointer"
                >
                  <option value="Not eligible for material">Not eligible for material</option>
                  <option value="Already received from another source">Already received from another source</option>
                  <option value="Other">Other (Requires Remark)</option>
                </select>
              </div>

              {/* Manual Remark if Other */}
              {notEligibleReason === 'Other' && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Manual Remark <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Enter specific reason..."
                    value={customRemark}
                    onChange={(e) => setCustomRemark(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-rose-500 outline-none"
                  />
                </div>
              )}

              {/* Updated By */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Updated By <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={updatedBy}
                  onChange={(e) => setUpdatedBy(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-rose-500 outline-none"
                />
              </div>

              {/* Updated Date */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Updated Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={updatedDate}
                  onChange={(e) => setUpdatedDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-rose-500 outline-none"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setNotEligibleModalItem(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmNotEligible}
                disabled={isSubmitting}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <XCircle className="w-3.5 h-3.5" />
                )}
                Confirm Not Eligible
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 17, 18, 19. CUSTOMER KIT DISTRIBUTION MODAL WITH DOUBLE-CLICK PROTECTION */}
      {customerModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden space-y-4 p-6">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Boxes className="w-5 h-5 text-teal-600" />
                  {selectedCustomer?.isLegacyRecord
                    ? '⚠️ जुनी नोंद किट पडताळणी (Legacy Kit Verification)'
                    : selectedCustomer
                    ? 'कामगार किट वाटप संपादन (Update Kit Distribution)'
                    : 'नवीन कामगार किट वाटप (Submit Kit Distribution)'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  कामगाराने अर्ज केलेले किंवा मिळालेले साहित्य (भांडी, पेटी, बॅग) चिन्हांकित करा.
                </p>
              </div>
              <button
                onClick={() => {
                  if (submissionStatus !== 'saving') {
                    setCustomerModalOpen(false);
                  }
                }}
                disabled={submissionStatus === 'saving'}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm cursor-pointer disabled:opacity-30"
              >
                ✕
              </button>
            </div>

            {/* Form Error Alert */}
            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-2 shadow-xs">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Legacy Record Warning Notice */}
            {selectedCustomer?.isLegacyRecord && (
              <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl text-amber-900 text-xs space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-amber-800">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  जुनी नोंद पडताळणी (Legacy Customer Record):
                </div>
                <p className="text-[11px] text-amber-800/90 leading-relaxed">
                  या जुन्या नोंदीत आधी कोणते किट मिळाले याची स्वतंत्र माहिती उपलब्ध नव्हती. <strong>सर्व 3 किट आपोआप प्राप्त मानले जात नाहीत.</strong> प्रत्यक्षात जे किट मिळाले आहेत तेच खाली सिलेक्ट करा. जुना डेटा सुरक्षित राहील.
                </p>
              </div>
            )}

            <form onSubmit={handleSubmitCustomerDistribution} className="space-y-4 text-xs">
              {/* Customer Selector / MH Number Input */}
              {selectedCustomer ? (
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-extrabold text-slate-800 text-sm uppercase truncate">{selectedCustomer.workerName}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="font-mono font-bold px-2 py-0.5 bg-teal-100 text-teal-800 rounded-md text-[11px]">
                        {selectedCustomer.mhNumber}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(selectedCustomer.mhNumber);
                          setCopiedMh(selectedCustomer.mhNumber);
                          setTimeout(() => setCopiedMh(''), 2000);
                        }}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold flex items-center gap-1 border transition-all cursor-pointer shadow-2xs active:scale-95 ${
                          copiedMh === selectedCustomer.mhNumber
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                        }`}
                        title="Copy MH Number"
                      >
                        {copiedMh === selectedCustomer.mhNumber ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600 stroke-[3]" />
                            <span>Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3 text-slate-500" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="text-slate-500 text-[11px] flex items-center gap-3">
                    <span>तालुका: <strong>{selectedCustomer.taluka || '-'}</strong></span>
                    <span>मोबाईल: <strong>{selectedCustomer.mobileNumber || '-'}</strong></span>
                    <span>प्रकार: <strong>{selectedCustomer.sourceType}</strong></span>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    MH Number निवडा किंवा टाका <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="उदा. MH14-2024-..."
                    value={customerMhQuery}
                    onChange={(e) => {
                      const val = e.target.value.toUpperCase();
                      setCustomerMhQuery(val);
                      const matched = records.find((r) => r.mhNumber.toUpperCase() === val);
                      if (matched) {
                        setSelectedCustomer(matched);
                        setFormBhandi(matched.bhandiStatus === 'Given');
                        setFormPeti(matched.petiStatus === 'Given');
                        setFormBag(matched.bagStatus === 'Given');
                      }
                    }}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs focus:ring-2 focus:ring-teal-500 outline-none"
                  />
                  <span className="text-[10px] text-slate-400 mt-0.5 block">
                    सक्रिय कामगाराचा MH नंबर टाका.
                  </span>
                </div>
              )}

              {/* 18. KIT SELECTION CHECKBOXES */}
              <div className="space-y-2">
                <label className="block font-bold text-slate-700">
                  अर्ज केलेले / मिळालेले किट निवडा (Select Kits Applied / Received) <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-1 gap-2">
                  {/* Kit 1: भांडी */}
                  <label
                    className={`flex items-center justify-between p-3.5 rounded-xl border transition-all cursor-pointer ${
                      formBhandi
                        ? 'bg-teal-50/70 border-teal-300 ring-1 ring-teal-400'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={formBhandi}
                        onChange={(e) => setFormBhandi(e.target.checked)}
                        disabled={submissionStatus === 'saving'}
                        className="w-4 h-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500 cursor-pointer"
                      />
                      <div>
                        <div className="font-bold text-slate-800 flex items-center gap-2">
                          <span>1. भांडी (Cooking Utensils)</span>
                          {selectedCustomer?.bhandiStatus === 'Given' && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] bg-emerald-100 text-emerald-800 font-semibold">
                              आधीच दिले ✓
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-500">
                          स्टील भांडी संच (Cooking utensils set)
                        </span>
                      </div>
                    </div>
                  </label>

                  {/* Kit 2: पेटी */}
                  <label
                    className={`flex items-center justify-between p-3.5 rounded-xl border transition-all cursor-pointer ${
                      formPeti
                        ? 'bg-indigo-50/70 border-indigo-300 ring-1 ring-indigo-400'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={formPeti}
                        onChange={(e) => setFormPeti(e.target.checked)}
                        disabled={submissionStatus === 'saving'}
                        className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 cursor-pointer"
                      />
                      <div>
                        <div className="font-bold text-slate-800 flex items-center gap-2">
                          <span>2. पेटी (Trunk Box)</span>
                          {selectedCustomer?.petiStatus === 'Given' && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] bg-emerald-100 text-emerald-800 font-semibold">
                              आधीच दिले ✓
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-500">
                          स्टील पेटी / ट्रंक बॉक्स (Metal Trunk Box)
                        </span>
                      </div>
                    </div>
                  </label>

                  {/* Kit 3: बॅग */}
                  <label
                    className={`flex items-center justify-between p-3.5 rounded-xl border transition-all cursor-pointer ${
                      formBag
                        ? 'bg-amber-50/70 border-amber-300 ring-1 ring-amber-400'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={formBag}
                        onChange={(e) => setFormBag(e.target.checked)}
                        disabled={submissionStatus === 'saving'}
                        className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500 cursor-pointer"
                      />
                      <div>
                        <div className="font-bold text-slate-800 flex items-center gap-2">
                          <span>3. बॅग (Safety Gear Bag)</span>
                          {selectedCustomer?.bagStatus === 'Given' && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] bg-emerald-100 text-emerald-800 font-semibold">
                              आधीच दिले ✓
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-slate-500">
                          सुरक्षा साहित्य व किट बॅग (Safety Kit Bag)
                        </span>
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Updated By & Date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    ऑपरेटर नाव (Updated By)
                  </label>
                  <input
                    type="text"
                    value={formUpdatedBy}
                    onChange={(e) => setFormUpdatedBy(e.target.value)}
                    disabled={submissionStatus === 'saving'}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    वितरण तारीख (Date)
                  </label>
                  <input
                    type="date"
                    value={formUpdatedDate}
                    onChange={(e) => setFormUpdatedDate(e.target.value)}
                    disabled={submissionStatus === 'saving'}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none"
                  />
                </div>
              </div>

              {/* 17. BUTTON ACTIONS WITH DOUBLE-CLICK & DUPLICATE PROTECTION */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setCustomerModalOpen(false)}
                  disabled={submissionStatus === 'saving'}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-all cursor-pointer disabled:opacity-50"
                >
                  रद्द करा (Cancel)
                </button>

                {/* 17. SUBMIT / UPDATE BUTTON WITH DOUBLE CLICK PROTECTION */}
                <button
                  type="submit"
                  disabled={submissionStatus === 'saving' || submissionStatus === 'submitted'}
                  className={`px-5 py-2.5 rounded-xl font-bold text-xs shadow-md transition-all flex items-center gap-2 cursor-pointer ${
                    submissionStatus === 'submitted'
                      ? 'bg-emerald-600 text-white cursor-default shadow-emerald-200'
                      : submissionStatus === 'saving'
                      ? 'bg-amber-600 text-white opacity-80 cursor-not-allowed'
                      : 'bg-teal-600 hover:bg-teal-700 active:scale-98 text-white'
                  }`}
                >
                  {submissionStatus === 'saving' ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>⏳ SAVING...</span>
                    </>
                  ) : submissionStatus === 'submitted' ? (
                    <>
                      <Check className="w-4 h-4 text-white stroke-[3]" />
                      <span>SUBMITTED ✓</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-teal-100" />
                      <span>{selectedCustomer ? 'UPDATE' : 'SUBMIT'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
