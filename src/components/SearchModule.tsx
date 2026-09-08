import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  UserCheck,
  Shield,
  Phone,
  CreditCard,
  Calendar,
  Award,
  RefreshCw,
  Eye,
  X,
  MapPin,
  Printer,
  FileText,
  DollarSign,
  CheckCircle2,
  Clock,
  AlertCircle,
  Filter,
  Copy,
  AlertTriangle,
  Layers,
  Users,
  Info,
  Check,
  ChevronRight,
  Trash2,
  Sparkles,
  CheckCheck,
  AlertOctagon,
  ArrowRight,
} from 'lucide-react';
import { WorkerRegistration, WorkerRenewal, WorkerClaim, User } from '../types';
import { MAHARASHTRA_TALUKAS } from '../data/mockData';
import { formatDate } from '../utils/exportUtils';

interface SearchModuleProps {
  registrations: WorkerRegistration[];
  renewals: WorkerRenewal[];
  claims: WorkerClaim[];
  currentUser?: User | null;
  onOpenPrintSlip: (type: 'registration' | 'renewal' | 'claim', data: any) => void;
  onDeleteRegistration?: (id: string) => Promise<void>;
  onDeleteRenewal?: (id: string) => Promise<void>;
  onDeleteClaim?: (id: string) => Promise<void>;
}

export type SearchCategory = 'all' | 'registration' | 'renewal' | 'claim' | 'duplicate';
export type DuplicateCriterion = 'all' | 'aadhaar' | 'mhNumber' | 'mobile' | 'name';

export interface SearchResultItem {
  id: string;
  type: 'registration' | 'renewal' | 'claim';
  title: string;
  subTitle: string;
  mhNumber: string;
  workerName: string;
  mobileNumber: string;
  taluka: string;
  date: string;
  status: string;
  raw: WorkerRegistration | WorkerRenewal | WorkerClaim;
  duplicateInfo?: {
    isDuplicate: boolean;
    reasons: string[];
    matchValues: { [key in DuplicateCriterion]?: string };
    totalMatches: number;
  };
}

export interface DuplicateCluster {
  id: string;
  criterion: 'aadhaar' | 'mhNumber' | 'mobile' | 'name';
  criterionLabel: string;
  criterionSubtext: string;
  matchKey: string;
  matchDisplayValue: string;
  items: SearchResultItem[];
}

export const SearchModule: React.FC<SearchModuleProps> = ({
  registrations,
  renewals,
  claims,
  currentUser,
  onOpenPrintSlip,
  onDeleteRegistration,
  onDeleteRenewal,
  onDeleteClaim,
}) => {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<SearchCategory>('all');
  const [selectedResult, setSelectedResult] = useState<SearchResultItem | null>(null);
  const [selectedTaluka, setSelectedTaluka] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Duplicate specific filters & selection state
  const [duplicateCriterion, setDuplicateCriterion] = useState<DuplicateCriterion>('all');
  const [selectedDuplicateClusterId, setSelectedDuplicateClusterId] = useState<string | null>(null);
  const [primarySelections, setPrimarySelections] = useState<Record<string, string>>({});
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Modal confirmation state
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    title: string;
    primaryItem?: SearchResultItem;
    itemsToDelete: SearchResultItem[];
    clusterId?: string;
  } | null>(null);

  // Debounce search query to prevent high CPU load on every keystroke
  const [debouncedQuery, setDebouncedQuery] = useState(query);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(query);
    }, 200);
    return () => clearTimeout(handler);
  }, [query]);

  const [searchPage, setSearchPage] = useState(1);
  const searchPageSize = 48; // Responsive 1, 2, 3 column grid

  const q = debouncedQuery.trim().toLowerCase();
  const cleanQ = q.replace(/\s/g, '');

  const matchesCommonFilters = (
    itemTaluka?: string,
    itemStatus?: string,
    itemDate?: string
  ) => {
    if (selectedTaluka && itemTaluka !== selectedTaluka) return false;
    if (selectedStatus) {
      const s = itemStatus?.toLowerCase() || '';
      const sel = selectedStatus.toLowerCase();
      if (sel === 'active') {
        if (!(s === 'active' || s === 'accepted' || s === 'approved' || s === 'disbursed')) return false;
      } else if (sel === 'pending') {
        if (!(s === 'pending' || s === 'pending verification' || s === 'submitted' || s === 'under scrutiny')) return false;
      } else if (s !== sel) {
        return false;
      }
    }
    if (fromDate && itemDate && itemDate < fromDate) return false;
    if (toDate && itemDate && itemDate > toDate) return false;
    return true;
  };

  // 1. Build all raw items
  const allRegistrationsItems: SearchResultItem[] = useMemo(() => {
    return registrations.map((r) => ({
      id: r.id,
      type: 'registration' as const,
      title: r.workerName,
      subTitle: `MH No: ${r.status === 'Active' && r.mhNumber && !r.mhNumber.startsWith('PENDING-') ? r.mhNumber : 'Pending'}`,
      mhNumber: r.mhNumber || '',
      workerName: r.workerName || '',
      mobileNumber: r.mobileNumber || '',
      taluka: r.taluka || '',
      date: r.registrationDate || '',
      status: r.status || 'Pending',
      raw: r,
    }));
  }, [registrations]);

  const allRenewalsItems: SearchResultItem[] = useMemo(() => {
    return renewals.map((ren) => ({
      id: ren.id,
      type: 'renewal' as const,
      title: ren.workerName,
      subTitle: `Renewal ID: ${ren.id} (${ren.renewalPeriodYears} Yrs)`,
      mhNumber: ren.mhNumber || '',
      workerName: ren.workerName || '',
      mobileNumber: ren.mobileNumber || '',
      taluka: ren.taluka || '',
      date: ren.renewalDate || '',
      status: ren.status || 'Active',
      raw: ren,
    }));
  }, [renewals]);

  const allClaimsItems: SearchResultItem[] = useMemo(() => {
    return claims.map((clm) => ({
      id: clm.id,
      type: 'claim' as const,
      title: clm.workerName,
      subTitle: `Claim ID: ${clm.id} (₹${clm.totalAmount?.toLocaleString('en-IN') || 0})`,
      mhNumber: clm.mhNumber || '',
      workerName: clm.workerName || '',
      mobileNumber: clm.mobileNumber || '',
      taluka: clm.taluka || '',
      date: clm.claimDate || '',
      status: clm.status || 'Submitted',
      raw: clm,
    }));
  }, [claims]);

  // 2. DUPLICATE DETECTION ENGINE across Registrations
  const { duplicateClusters, duplicateInfoMap, duplicateCounts } = useMemo(() => {
    const aadhaarGroups = new Map<string, SearchResultItem[]>();
    const mhGroups = new Map<string, SearchResultItem[]>();
    const mobileGroups = new Map<string, SearchResultItem[]>();
    const nameGroups = new Map<string, SearchResultItem[]>();

    allRegistrationsItems.forEach((item) => {
      const reg = item.raw as WorkerRegistration;

      // Clean Aadhaar (12 digits)
      const rawAadhaar = (reg.aadhaarNumber || '').replace(/\D/g, '');
      if (rawAadhaar.length >= 10) {
        if (!aadhaarGroups.has(rawAadhaar)) aadhaarGroups.set(rawAadhaar, []);
        aadhaarGroups.get(rawAadhaar)!.push(item);
      }

      // Clean MH Number (Valid MH formats)
      const rawMh = (reg.mhNumber || '').trim().toUpperCase();
      if (
        rawMh &&
        !rawMh.startsWith('PENDING-') &&
        rawMh !== 'NA' &&
        rawMh !== 'N/A' &&
        rawMh.length >= 4
      ) {
        if (!mhGroups.has(rawMh)) mhGroups.set(rawMh, []);
        mhGroups.get(rawMh)!.push(item);
      }

      // Clean Mobile (10 digits)
      const rawMobile = (reg.mobileNumber || '').replace(/\D/g, '');
      if (rawMobile.length === 10 && rawMobile !== '0000000000' && rawMobile !== '9999999999') {
        if (!mobileGroups.has(rawMobile)) mobileGroups.set(rawMobile, []);
        mobileGroups.get(rawMobile)!.push(item);
      }

      // Clean Name (lowercase, no spaces, min 4 chars)
      const rawName = (reg.workerName || '').trim().toLowerCase().replace(/\s+/g, ' ');
      if (rawName.length >= 4) {
        if (!nameGroups.has(rawName)) nameGroups.set(rawName, []);
        nameGroups.get(rawName)!.push(item);
      }
    });

    const clusters: DuplicateCluster[] = [];
    const itemMap = new Map<
      string,
      { isDuplicate: boolean; reasons: string[]; matchValues: { [key in DuplicateCriterion]?: string }; totalMatches: number }
    >();

    let aadhaarDupCount = 0;
    let mhDupCount = 0;
    let mobileDupCount = 0;
    let nameDupCount = 0;

    // Helper to register cluster and track items
    const recordCluster = (
      criterion: 'aadhaar' | 'mhNumber' | 'mobile' | 'name',
      criterionLabel: string,
      criterionSubtext: string,
      matchKey: string,
      matchDisplayValue: string,
      items: SearchResultItem[]
    ) => {
      if (items.length <= 1) return;

      clusters.push({
        id: `${criterion}-${matchKey}`,
        criterion,
        criterionLabel,
        criterionSubtext,
        matchKey,
        matchDisplayValue,
        items,
      });

      items.forEach((it) => {
        const existing = itemMap.get(it.id) || {
          isDuplicate: true,
          reasons: [],
          matchValues: {},
          totalMatches: 0,
        };
        if (!existing.reasons.includes(criterionLabel)) {
          existing.reasons.push(criterionLabel);
        }
        existing.matchValues[criterion] = matchDisplayValue;
        existing.totalMatches = Math.max(existing.totalMatches, items.length);
        itemMap.set(it.id, existing);
      });
    };

    // Build Aadhaar Clusters
    aadhaarGroups.forEach((items, cleanAadhaar) => {
      if (items.length > 1) {
        aadhaarDupCount++;
        const formattedAadhaar = cleanAadhaar.replace(/(\d{4})(\d{4})(\d{4})/, '$1 $2 $3');
        recordCluster(
          'aadhaar',
          'समान आधार क्रमांक (Same Aadhaar)',
          `या आधार क्रमांकावर ${items.length} नोंदी आढळल्या आहेत`,
          cleanAadhaar,
          formattedAadhaar,
          items
        );
      }
    });

    // Build MH Number Clusters
    mhGroups.forEach((items, cleanMh) => {
      if (items.length > 1) {
        mhDupCount++;
        recordCluster(
          'mhNumber',
          'समान MH नंबर (Same MH Number)',
          `एकाच MH नोंदणी क्रमांकावर ${items.length} स्वतंत्र नोंदी आढळल्या`,
          cleanMh,
          cleanMh,
          items
        );
      }
    });

    // Build Mobile Number Clusters
    mobileGroups.forEach((items, cleanMobile) => {
      if (items.length > 1) {
        mobileDupCount++;
        recordCluster(
          'mobile',
          'समान मोबाईल क्रमांक (Same Mobile)',
          `एकाच मोबाईल नंबरवर ${items.length} नोंदी नोंदवल्या आहेत`,
          cleanMobile,
          cleanMobile,
          items
        );
      }
    });

    // Build Name Clusters
    nameGroups.forEach((items, cleanName) => {
      if (items.length > 1) {
        nameDupCount++;
        recordCluster(
          'name',
          'समान कामगार नाव (Same Worker Name)',
          `एकसारख्या नावावर ${items.length} स्वतंत्र नोंदी नोंदवल्या आहेत`,
          cleanName,
          items[0].workerName,
          items
        );
      }
    });

    return {
      duplicateClusters: clusters,
      duplicateInfoMap: itemMap,
      duplicateCounts: {
        totalClusters: clusters.length,
        totalAffectedRecords: itemMap.size,
        totalAadhaarClusters: aadhaarDupCount,
        totalMhClusters: mhDupCount,
        totalMobileClusters: mobileDupCount,
        totalNameClusters: nameDupCount,
      },
    };
  }, [allRegistrationsItems]);

  // Enrich items with duplicate indicators
  const enrichedRegistrations = useMemo(() => {
    return allRegistrationsItems.map((item) => ({
      ...item,
      duplicateInfo: duplicateInfoMap.get(item.id),
    }));
  }, [allRegistrationsItems, duplicateInfoMap]);

  // Helper to get or calculate the chosen primary record for a cluster
  const getClusterPrimaryItemId = (cluster: DuplicateCluster): string => {
    if (primarySelections[cluster.id]) {
      const exists = cluster.items.some((i) => i.id === primarySelections[cluster.id]);
      if (exists) return primarySelections[cluster.id];
    }
    // Intelligent heuristic to pick default best entry:
    // 1. Active / Approved status
    // 2. Has verification date
    // 3. Has real MH Number
    // 4. Latest registration date
    const sorted = [...cluster.items].sort((a, b) => {
      const aReg = a.raw as WorkerRegistration;
      const bReg = b.raw as WorkerRegistration;

      const aActive = a.status === 'Active' || a.status === 'Approved' ? 1 : 0;
      const bActive = b.status === 'Active' || b.status === 'Approved' ? 1 : 0;
      if (bActive !== aActive) return bActive - aActive;

      const aVer = aReg?.verificationDate ? 1 : 0;
      const bVer = bReg?.verificationDate ? 1 : 0;
      if (bVer !== aVer) return bVer - aVer;

      const aMh = a.mhNumber && !a.mhNumber.startsWith('PENDING-') ? 1 : 0;
      const bMh = b.mhNumber && !b.mhNumber.startsWith('PENDING-') ? 1 : 0;
      if (bMh !== aMh) return bMh - aMh;

      return new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime();
    });
    return sorted[0]?.id || cluster.items[0]?.id;
  };

  // Trigger Confirmation for Single Item Delete
  const handleInitiateSingleDelete = (item: SearchResultItem) => {
    setDeleteConfirmation({
      isOpen: true,
      title: 'नोंद कायमची हटवा (Delete Entry)',
      itemsToDelete: [item],
    });
  };

  // Trigger Confirmation for Cluster Batch Resolve
  const handleInitiateClusterResolve = (cluster: DuplicateCluster) => {
    const primaryId = getClusterPrimaryItemId(cluster);
    const primaryItem = cluster.items.find((i) => i.id === primaryId);
    const itemsToDelete = cluster.items.filter((i) => i.id !== primaryId);

    if (!primaryItem || itemsToDelete.length === 0) return;

    setDeleteConfirmation({
      isOpen: true,
      title: 'डबल नोंद निवारण: निवडलेली मुख्य नोंद ठेवा आणि इतर सर्व हटवा',
      primaryItem,
      itemsToDelete,
      clusterId: cluster.id,
    });
  };

  // Execute deletion confirmed by user
  const handleExecuteDeletion = async () => {
    if (!deleteConfirmation) return;
    const { primaryItem, itemsToDelete, clusterId } = deleteConfirmation;

    setIsDeletingId(clusterId || itemsToDelete[0]?.id || 'deleting');
    try {
      for (const item of itemsToDelete) {
        if (item.type === 'registration' && onDeleteRegistration) {
          await onDeleteRegistration(item.id);
        } else if (item.type === 'renewal' && onDeleteRenewal) {
          await onDeleteRenewal(item.id);
        } else if (item.type === 'claim' && onDeleteClaim) {
          await onDeleteClaim(item.id);
        }
      }

      if (selectedResult && itemsToDelete.some((it) => it.id === selectedResult.id)) {
        setSelectedResult(null);
      }

      setToastMessage({
        type: 'success',
        text: primaryItem
          ? `यशस्वी! मुख्य नोंद (${primaryItem.workerName} - ${primaryItem.mhNumber || primaryItem.id}) सुरक्षित ठेवली असून इतर ${itemsToDelete.length} डबल नोंदी डेटाबेसमधून कायमच्या हटवण्यात आल्या.`
          : `नोंद (${itemsToDelete[0]?.workerName}) यशस्वीरित्या हटवण्यात आली.`,
      });
      setTimeout(() => setToastMessage(null), 5000);
    } catch (err: any) {
      setToastMessage({
        type: 'error',
        text: `नोंद हटवताना त्रुटी: ${err?.message || 'Failed to delete'}`,
      });
      setTimeout(() => setToastMessage(null), 5000);
    } finally {
      setIsDeletingId(null);
      setDeleteConfirmation(null);
    }
  };

  // Filtered Duplicate Clusters
  const filteredDuplicateClusters = useMemo(() => {
    return duplicateClusters.filter((cluster) => {
      // 1. Match criterion filter
      if (duplicateCriterion !== 'all' && cluster.criterion !== duplicateCriterion) {
        return false;
      }

      // 2. Match selected cluster ID if targeted
      if (selectedDuplicateClusterId && cluster.id !== selectedDuplicateClusterId) {
        return false;
      }

      // 3. Match Search Query
      if (cleanQ) {
        const matchClusterKey = cluster.matchKey.toLowerCase().replace(/\s/g, '').includes(cleanQ);
        const matchClusterVal = cluster.matchDisplayValue.toLowerCase().replace(/\s/g, '').includes(cleanQ);
        const matchInsideItems = cluster.items.some((item) => {
          const wName = item.workerName.toLowerCase().replace(/\s/g, '');
          const wMh = item.mhNumber.toLowerCase().replace(/\s/g, '');
          const wMob = item.mobileNumber.replace(/\D/g, '');
          const wId = item.id.toLowerCase().replace(/\s/g, '');
          const reg = item.raw as WorkerRegistration;
          const wAadhaar = (reg.aadhaarNumber || '').replace(/\D/g, '');
          return (
            wName.includes(cleanQ) ||
            wMh.includes(cleanQ) ||
            wMob.includes(cleanQ) ||
            wAadhaar.includes(cleanQ) ||
            wId.includes(cleanQ)
          );
        });

        if (!matchClusterKey && !matchClusterVal && !matchInsideItems) {
          return false;
        }
      }

      // 4. Match common taluka/status/date filter
      if (selectedTaluka || selectedStatus || fromDate || toDate) {
        const hasMatchingItem = cluster.items.some((it) =>
          matchesCommonFilters(it.taluka, it.status, it.date)
        );
        if (!hasMatchingItem) return false;
      }

      return true;
    });
  }, [
    duplicateClusters,
    duplicateCriterion,
    selectedDuplicateClusterId,
    cleanQ,
    selectedTaluka,
    selectedStatus,
    fromDate,
    toDate,
  ]);

  // Standard Multi-Source Search Results
  const results = useMemo(() => {
    let pool: SearchResultItem[] = [];

    if (activeCategory === 'all') {
      pool = [...enrichedRegistrations, ...allRenewalsItems, ...allClaimsItems];
    } else if (activeCategory === 'registration') {
      pool = enrichedRegistrations;
    } else if (activeCategory === 'renewal') {
      pool = allRenewalsItems;
    } else if (activeCategory === 'claim') {
      pool = allClaimsItems;
    }

    return pool.filter((item) => {
      // 1. Common Filters
      if (!matchesCommonFilters(item.taluka, item.status, item.date)) {
        return false;
      }

      // 2. Query Match
      if (!cleanQ) return true;

      const titleMatch = item.title.toLowerCase().replace(/\s/g, '').includes(cleanQ);
      const subTitleMatch = item.subTitle.toLowerCase().replace(/\s/g, '').includes(cleanQ);
      const mhMatch = item.mhNumber.toLowerCase().replace(/\s/g, '').includes(cleanQ);
      const workerNameMatch = item.workerName.toLowerCase().replace(/\s/g, '').includes(cleanQ);
      const mobileMatch = item.mobileNumber.replace(/\D/g, '').includes(cleanQ);
      const talukaMatch = item.taluka.toLowerCase().includes(q);
      const idMatch = item.id.toLowerCase().replace(/\s/g, '').includes(cleanQ);

      let aadhaarMatch = false;
      if (item.type === 'registration') {
        const reg = item.raw as WorkerRegistration;
        aadhaarMatch = (reg.aadhaarNumber || '').replace(/\D/g, '').includes(cleanQ);
      }

      return (
        titleMatch ||
        subTitleMatch ||
        mhMatch ||
        workerNameMatch ||
        mobileMatch ||
        talukaMatch ||
        idMatch ||
        aadhaarMatch
      );
    });
  }, [
    activeCategory,
    enrichedRegistrations,
    allRenewalsItems,
    allClaimsItems,
    cleanQ,
    q,
    selectedTaluka,
    selectedStatus,
    fromDate,
    toDate,
  ]);

  useEffect(() => {
    setSearchPage(1);
  }, [cleanQ, activeCategory, selectedTaluka, selectedStatus, fromDate, toDate]);

  const totalSearchPages = Math.max(1, Math.ceil(results.length / searchPageSize));
  const paginatedResults = useMemo(() => {
    const start = (searchPage - 1) * searchPageSize;
    return results.slice(start, start + searchPageSize);
  }, [results, searchPage, searchPageSize]);

  // Get Linked Data for Modal Dossier
  const selectedMhNumber = selectedResult?.mhNumber?.trim().toUpperCase();

  const linkedRegistrations = useMemo(() => {
    if (!selectedMhNumber || selectedMhNumber.startsWith('PENDING-')) return [];
    return registrations.filter(
      (r) => r.mhNumber && r.mhNumber.trim().toUpperCase() === selectedMhNumber
    );
  }, [selectedMhNumber, registrations]);

  const linkedRenewals = useMemo(() => {
    if (!selectedMhNumber || selectedMhNumber.startsWith('PENDING-')) return [];
    return renewals.filter(
      (r) => r.mhNumber && r.mhNumber.trim().toUpperCase() === selectedMhNumber
    );
  }, [selectedMhNumber, renewals]);

  const linkedClaims = useMemo(() => {
    if (!selectedMhNumber || selectedMhNumber.startsWith('PENDING-')) return [];
    return claims.filter(
      (c) => c.mhNumber && c.mhNumber.trim().toUpperCase() === selectedMhNumber
    );
  }, [selectedMhNumber, claims]);

  const getTypeBadge = (type: SearchResultItem['type']) => {
    switch (type) {
      case 'registration':
        return {
          label: 'Registration',
          bg: 'bg-blue-50 text-blue-700 border-blue-200',
          icon: UserCheck,
        };
      case 'renewal':
        return {
          label: 'Renewal Record',
          bg: 'bg-purple-50 text-purple-700 border-purple-200',
          icon: RefreshCw,
        };
      case 'claim':
        return {
          label: 'Welfare Claim',
          bg: 'bg-amber-50 text-amber-700 border-amber-200',
          icon: Award,
        };
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'Active':
      case 'Approved':
      case 'Disbursed':
      case 'Completed':
        return 'bg-emerald-50 text-emerald-800 border-emerald-200';
      case 'Under Scrutiny':
      case 'Submitted':
      case 'Pending':
      case 'Pending Verification':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'Rejected':
      case 'Inactive':
      case 'Expired':
        return 'bg-rose-50 text-rose-800 border-rose-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-300';
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed bottom-6 right-6 z-50 p-4 rounded-2xl shadow-xl flex items-center gap-3 border text-sm font-bold animate-in fade-in slide-in-from-bottom-5 duration-300 max-w-md ${
            toastMessage.type === 'success'
              ? 'bg-emerald-900 text-emerald-50 border-emerald-600'
              : 'bg-rose-900 text-rose-50 border-rose-600'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-300 shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-rose-300 shrink-0" />
          )}
          <span className="flex-1">{toastMessage.text}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="p-1 hover:bg-white/10 rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header & Big Search Bar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
              <Search className="w-5 h-5 text-blue-700" />
              <span>Universal Search Engine (सार्वत्रिक शोध प्रणाली)</span>
            </h2>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Search across Registrations, Renewals, Scheme Claims, and Detect / Resolve Double Entries.
            </p>
          </div>

          {/* Quick Duplicate Alert Banner / Trigger Button */}
          {duplicateCounts.totalClusters > 0 && (
            <button
              onClick={() => {
                setActiveCategory('duplicate');
                setSelectedDuplicateClusterId(null);
              }}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all flex items-center gap-2 cursor-pointer shadow-xs ${
                activeCategory === 'duplicate'
                  ? 'bg-amber-500 text-white border-amber-600 shadow-md ring-2 ring-amber-400/40'
                  : 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100 hover:border-amber-400'
              }`}
            >
              <AlertTriangle className="w-4 h-4 text-amber-600 group-hover:text-amber-700" />
              <span>डबल नोंदी आढळल्या (Double Entries):</span>
              <span className="px-2 py-0.5 rounded-full bg-amber-600 text-white font-extrabold text-[11px]">
                {duplicateCounts.totalAffectedRecords} नोंदी ({duplicateCounts.totalClusters} गट)
              </span>
            </button>
          )}
        </div>

        {/* Search Bar Input */}
        <div className="relative">
          <Search className="w-5 h-5 absolute left-4 top-3.5 text-blue-700" />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (selectedDuplicateClusterId) setSelectedDuplicateClusterId(null);
            }}
            placeholder="Search MH Number, Worker Name, Mobile, Aadhaar, Claim ID, or Renewal ID..."
            className="w-full pl-12 pr-10 py-3 rounded-2xl bg-slate-50 border border-slate-300 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white shadow-xs font-medium"
            autoFocus
          />
          {query && (
            <button
              onClick={() => {
                setQuery('');
                if (selectedDuplicateClusterId) setSelectedDuplicateClusterId(null);
              }}
              className="absolute right-3.5 top-3.5 p-1 rounded-full text-slate-400 hover:text-slate-600 bg-slate-200/60 hover:bg-slate-200 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Multi-Criteria Filters Toolbar */}
        <div className="p-3 bg-slate-50/80 rounded-2xl border border-slate-200/80 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 text-xs">
          {/* Taluka Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center gap-1">
              <MapPin className="w-3 h-3 text-blue-600" />
              <span>तालुका (Taluka Filter):</span>
            </label>
            <select
              value={selectedTaluka}
              onChange={(e) => setSelectedTaluka(e.target.value)}
              className="w-full p-2 rounded-xl bg-white border border-slate-300 text-slate-900 font-medium focus:outline-none focus:border-blue-600"
            >
              <option value="">सर्व तालुके (All Talukas)</option>
              {MAHARASHTRA_TALUKAS.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center gap-1">
              <Filter className="w-3 h-3 text-blue-600" />
              <span>स्थिती (Status Filter):</span>
            </label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full p-2 rounded-xl bg-white border border-slate-300 text-slate-900 font-medium focus:outline-none focus:border-blue-600"
            >
              <option value="">सर्व स्थिती (All Statuses)</option>
              <option value="Active">Active / स्वीकृत</option>
              <option value="Pending">Pending / प्रलंबित</option>
            </select>
          </div>

          {/* From Date Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center gap-1">
              <Calendar className="w-3 h-3 text-blue-600" />
              <span>पासून दिनांक (From Date):</span>
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full p-2 rounded-xl bg-white border border-slate-300 text-slate-900 font-medium focus:outline-none focus:border-blue-600"
            />
          </div>

          {/* To Date Filter */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center gap-1">
              <Calendar className="w-3 h-3 text-blue-600" />
              <span>पर्यंत दिनांक (To Date):</span>
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full p-2 rounded-xl bg-white border border-slate-300 text-slate-900 font-medium focus:outline-none focus:border-blue-600"
            />
          </div>
        </div>

        {/* Clear Filters Indicator */}
        {(query || selectedTaluka || selectedStatus || fromDate || toDate || selectedDuplicateClusterId) && (
          <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100 flex-wrap gap-2">
            <span className="text-slate-500 font-medium flex items-center gap-1">
              <Filter className="w-3.5 h-3.5 text-blue-600" />
              <span>फिल्टर्स सक्रिय आहेत.</span>
            </span>
            <button
              onClick={() => {
                setQuery('');
                setSelectedTaluka('');
                setSelectedStatus('');
                setFromDate('');
                setToDate('');
                setSelectedDuplicateClusterId(null);
              }}
              className="text-blue-700 font-bold hover:underline flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              <span>सर्व फिल्टर्स रीसेट करा (Reset Filters)</span>
            </button>
          </div>
        )}

        {/* Category Switcher Tabs */}
        <div className="flex items-center gap-2 pt-2 border-t border-slate-200/80 overflow-x-auto">
          <button
            onClick={() => {
              setActiveCategory('all');
              setSelectedDuplicateClusterId(null);
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeCategory === 'all'
                ? 'bg-blue-700 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>All Records (सर्व नोंदी)</span>
            <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-black/10">
              {allRegistrationsItems.length + allRenewalsItems.length + allClaimsItems.length}
            </span>
          </button>

          <button
            onClick={() => {
              setActiveCategory('registration');
              setSelectedDuplicateClusterId(null);
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeCategory === 'registration'
                ? 'bg-blue-700 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <UserCheck className="w-3.5 h-3.5" />
            <span>Registrations (नोंदणी)</span>
            <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-black/10">
              {allRegistrationsItems.length}
            </span>
          </button>

          <button
            onClick={() => {
              setActiveCategory('renewal');
              setSelectedDuplicateClusterId(null);
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeCategory === 'renewal'
                ? 'bg-purple-700 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Renewals (नूतनीकरण)</span>
            <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-black/10">
              {allRenewalsItems.length}
            </span>
          </button>

          <button
            onClick={() => {
              setActiveCategory('claim');
              setSelectedDuplicateClusterId(null);
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeCategory === 'claim'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            <span>Claims (योजना)</span>
            <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-black/10">
              {allClaimsItems.length}
            </span>
          </button>

          {/* ⚠️ DEDICATED DOUBLE / DUPLICATE ENTRIES TAB */}
          <button
            onClick={() => {
              setActiveCategory('duplicate');
              setSelectedDuplicateClusterId(null);
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap border ${
              activeCategory === 'duplicate'
                ? 'bg-amber-600 text-white border-amber-700 shadow-xs'
                : 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-700" />
            <span>डबल नोंदी (Double Entries)</span>
            <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-amber-700 text-white font-extrabold">
              {duplicateCounts.totalAffectedRecords}
            </span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ⚠️ DEDICATED DOUBLE / DUPLICATE ENTRIES VIEW WITH RESOLVER */}
      {/* ========================================================================= */}
      {activeCategory === 'duplicate' && (
        <div className="space-y-5">
          {/* Duplicate Filtering Toolbar & Summary Metrics */}
          <div className="bg-gradient-to-r from-amber-50 via-amber-100/60 to-orange-50 p-5 rounded-2xl border-2 border-amber-300 shadow-xs space-y-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-amber-950 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-amber-700" />
                  <span>डबल / डुप्लिकेट नोंद शोध व निवारण (Duplicate Entries Resolver)</span>
                </h3>
                <p className="text-xs text-amber-900/90 font-medium mt-0.5">
                  येथे योग्य/बरोबर नोंद (Primary Record) निवडा आणि इतर सर्व डबल नोंदी एका क्लिकवर हटवा (Delete Duplicate Entries).
                </p>
              </div>

              {/* Duplicate Quick Stats */}
              <div className="flex items-center gap-2 text-xs font-bold flex-wrap">
                <div className="bg-white/90 border border-amber-300 px-3 py-1.5 rounded-xl text-amber-900 shadow-2xs">
                  एकूण गट: <span className="text-amber-950 font-black">{filteredDuplicateClusters.length}</span>
                </div>
                <div className="bg-white/90 border border-amber-300 px-3 py-1.5 rounded-xl text-amber-900 shadow-2xs">
                  एकूण डबल नोंदी: <span className="text-amber-950 font-black">
                    {filteredDuplicateClusters.reduce((acc, c) => acc + c.items.length, 0)}
                  </span>
                </div>
              </div>
            </div>

            {/* Choose / Filter Criteria (डबल नोंद कशावरून शोधायची ते निवडा) */}
            <div className="pt-3 border-t border-amber-200/80 space-y-2">
              <label className="block text-xs font-extrabold text-amber-950">
                डबल नोंद निकष निवडा (Choose Duplicate Match Criteria):
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    setDuplicateCriterion('all');
                    setSelectedDuplicateClusterId(null);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                    duplicateCriterion === 'all'
                      ? 'bg-amber-600 text-white border-amber-700 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>सर्व डबल नोंदी (All Types)</span>
                  <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-black/10">
                    {duplicateCounts.totalClusters}
                  </span>
                </button>

                <button
                  onClick={() => {
                    setDuplicateCriterion('aadhaar');
                    setSelectedDuplicateClusterId(null);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                    duplicateCriterion === 'aadhaar'
                      ? 'bg-amber-600 text-white border-amber-700 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <CreditCard className="w-3.5 h-3.5 text-blue-600" />
                  <span>समान आधार क्रमांक (Same Aadhaar)</span>
                  <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-blue-100 text-blue-800 font-bold">
                    {duplicateCounts.totalAadhaarClusters} गट
                  </span>
                </button>

                <button
                  onClick={() => {
                    setDuplicateCriterion('mhNumber');
                    setSelectedDuplicateClusterId(null);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                    duplicateCriterion === 'mhNumber'
                      ? 'bg-amber-600 text-white border-amber-700 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <Shield className="w-3.5 h-3.5 text-purple-600" />
                  <span>समान MH नंबर (Same MH No)</span>
                  <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-purple-100 text-purple-800 font-bold">
                    {duplicateCounts.totalMhClusters} गट
                  </span>
                </button>

                <button
                  onClick={() => {
                    setDuplicateCriterion('mobile');
                    setSelectedDuplicateClusterId(null);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                    duplicateCriterion === 'mobile'
                      ? 'bg-amber-600 text-white border-amber-700 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <Phone className="w-3.5 h-3.5 text-emerald-600" />
                  <span>समान मोबाईल नंबर (Same Mobile)</span>
                  <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-emerald-100 text-emerald-800 font-bold">
                    {duplicateCounts.totalMobileClusters} गट
                  </span>
                </button>

                <button
                  onClick={() => {
                    setDuplicateCriterion('name');
                    setSelectedDuplicateClusterId(null);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                    duplicateCriterion === 'name'
                      ? 'bg-amber-600 text-white border-amber-700 shadow-xs'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <Users className="w-3.5 h-3.5 text-slate-600" />
                  <span>समान नाव (Same Name)</span>
                  <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-slate-200 text-slate-800 font-bold">
                    {duplicateCounts.totalNameClusters} गट
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* DUPLICATE CLUSTERS LIST */}
          <div className="space-y-6">
            {filteredDuplicateClusters.map((cluster, idx) => {
              const primaryItemId = getClusterPrimaryItemId(cluster);
              const primaryItem = cluster.items.find((i) => i.id === primaryItemId);
              const duplicateItemsCount = cluster.items.length - 1;

              return (
                <div
                  key={cluster.id}
                  className="bg-white rounded-3xl border-2 border-amber-200 shadow-sm overflow-hidden transition-all hover:border-amber-400"
                >
                  {/* Cluster Header */}
                  <div className="bg-gradient-to-r from-amber-100/90 via-amber-50 to-orange-50 px-5 py-3.5 border-b border-amber-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="w-7 h-7 rounded-xl bg-amber-600 text-white text-xs font-black flex items-center justify-center shadow-2xs">
                        #{idx + 1}
                      </span>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-black text-amber-950 uppercase tracking-wide">
                            {cluster.criterionLabel} :
                          </span>
                          <span className="font-mono font-black text-sm text-blue-900 bg-white/90 px-2.5 py-0.5 rounded-lg border border-amber-300 shadow-2xs">
                            {cluster.matchDisplayValue}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-200 text-amber-900 border border-amber-300">
                            {cluster.items.length} नोंदी (Duplicates)
                          </span>
                        </div>
                        <p className="text-[11px] text-amber-800 font-medium mt-0.5">
                          {cluster.criterionSubtext}
                        </p>
                      </div>
                    </div>

                    {/* Batch Resolve Action in Cluster Header */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => handleInitiateClusterResolve(cluster)}
                        disabled={isDeletingId === cluster.id}
                        className="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-xs cursor-pointer border border-emerald-700 transition-all active:scale-95 disabled:opacity-50"
                        title="निवडलेली नोंद ठेवून इतर सर्व डुप्लिकेट हटवा"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-emerald-200" />
                        <span>
                          {isDeletingId === cluster.id
                            ? 'हटवत आहे...'
                            : `निवडलेली नोंद ठेवा व इतर (${duplicateItemsCount}) हटवा`}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Cluster Guidance & Selection Help Strip */}
                  <div className="px-5 py-2.5 bg-amber-50/60 border-b border-amber-200/70 flex flex-col sm:flex-row sm:items-center sm:justify-between text-xs text-amber-950 gap-2">
                    <div className="flex items-center gap-2">
                      <Info className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>
                        <strong>मार्गदर्शक:</strong> खालीलपैकी जी नोंद <strong>बरोबर/अचूक</strong> आहे तिच्यावर{' '}
                        <span className="text-emerald-700 font-bold">"ही नोंद ठेवा (Select to Keep)"</span> निवडा. इतर नोंदी{' '}
                        <span className="text-rose-700 font-bold">"हटवा (Delete)"</span> बटनाने काढून टाका.
                      </span>
                    </div>
                    {primaryItem && (
                      <div className="text-[11px] font-bold text-emerald-800 bg-emerald-100/80 px-2.5 py-1 rounded-lg border border-emerald-300 shrink-0">
                        ठेवली जाणारी मुख्य नोंद: <span className="font-black font-mono">{primaryItem.mhNumber || primaryItem.id}</span> ({primaryItem.workerName})
                      </div>
                    )}
                  </div>

                  {/* Duplicate Items Grid inside this cluster */}
                  <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 bg-slate-50/40">
                    {cluster.items.map((item, itemIdx) => {
                      const reg = item.raw as WorkerRegistration;
                      const isVerified = Boolean(reg.verificationDate);
                      const isPrimary = item.id === primaryItemId;

                      return (
                        <div
                          key={item.id}
                          className={`p-4 rounded-2xl transition-all shadow-2xs flex flex-col justify-between group relative ${
                            isPrimary
                              ? 'bg-emerald-50/40 border-2 border-emerald-500 shadow-md ring-2 ring-emerald-500/20'
                              : 'bg-white border-2 border-rose-200 hover:border-rose-300'
                          }`}
                        >
                          <div>
                            {/* Primary Selection Pill on Top */}
                            <div className="flex items-center justify-between gap-2 mb-3">
                              {isPrimary ? (
                                <div className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-extrabold text-[11px] flex items-center gap-1.5 shadow-2xs">
                                  <Check className="w-3.5 h-3.5 stroke-[3]" />
                                  <span>मुख्य नोंद म्हणून निवडली (TO BE KEPT)</span>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPrimarySelections((prev) => ({
                                      ...prev,
                                      [cluster.id]: item.id,
                                    }));
                                  }}
                                  className="px-2.5 py-1 rounded-lg bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 border border-slate-300 hover:border-emerald-500 font-bold text-[11px] flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
                                >
                                  <div className="w-3 h-3 rounded-full border border-slate-400" />
                                  <span>ही बरोबर नोंद निवडा (Select as Primary)</span>
                                </button>
                              )}

                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getStatusBadgeClass(item.status)}`}>
                                {item.status}
                              </span>
                            </div>

                            {/* Worker Name & MH */}
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <span className="text-[10px] font-black uppercase text-slate-500">
                                  नोंद #{itemIdx + 1} (ID: {item.id})
                                </span>
                                <h4 className="font-black text-slate-900 text-sm group-hover:text-blue-700 transition-colors">
                                  {item.workerName}
                                </h4>
                                <div className="text-[11px] font-bold font-mono text-blue-700 mt-0.5">
                                  MH No: {item.mhNumber && !item.mhNumber.startsWith('PENDING-') ? item.mhNumber : 'Pending'}
                                </div>
                              </div>
                            </div>

                            {/* Details Comparison Table */}
                            <div className="mt-3 pt-2.5 border-t border-slate-200/80 space-y-1 text-xs text-slate-700 font-medium">
                              <div className="flex justify-between">
                                <span className="text-slate-500">Aadhaar:</span>
                                <span className="font-mono font-bold text-slate-900">
                                  {reg.aadhaarNumber?.replace(/\s+/g, '') || 'N/A'}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-500">Mobile:</span>
                                <span className="font-mono text-slate-900">{item.mobileNumber || 'N/A'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-500">Taluka:</span>
                                <span className="text-slate-900 font-semibold">{item.taluka || 'N/A'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-slate-500">Reg. Date:</span>
                                <span className="text-slate-900 font-bold">{formatDate(item.date)}</span>
                              </div>
                              {reg.verificationDate && (
                                <div className="flex justify-between text-amber-900 font-bold">
                                  <span>पडताळणी तारीख:</span>
                                  <span>{formatDate(reg.verificationDate)}</span>
                                </div>
                              )}
                              <div className="flex justify-between">
                                <span className="text-slate-500">Operator:</span>
                                <span className="text-slate-700 font-semibold">{reg.operatorName || 'System'}</span>
                              </div>
                            </div>
                          </div>

                          {/* Action Buttons for this card */}
                          <div className="mt-4 pt-3 border-t border-slate-200/80 flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => setSelectedResult(item)}
                                className="text-[11px] font-bold text-blue-700 hover:text-blue-900 flex items-center gap-1 cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Docket</span>
                              </button>

                              <button
                                onClick={() => onOpenPrintSlip('registration', item.raw)}
                                className="px-2 py-0.8 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-[10px] flex items-center gap-1 border border-blue-200 cursor-pointer"
                                title="स्लिप प्रिंट करा"
                              >
                                <Printer className="w-3 h-3" />
                                <span>Print</span>
                              </button>
                            </div>

                            {/* Direct Delete Button for this single card */}
                            <button
                              onClick={() => handleInitiateSingleDelete(item)}
                              className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-[11px] flex items-center gap-1 cursor-pointer transition-colors"
                              title="ही नोंद कायमची हटवा"
                            >
                              <Trash2 className="w-3 h-3 text-rose-600" />
                              <span>नोंद हटवा</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {filteredDuplicateClusters.length === 0 && (
              <div className="p-12 text-center text-slate-500 bg-white rounded-3xl border border-slate-200/90 shadow-xs">
                <CheckCircle2 className="w-12 h-12 mx-auto mb-2 text-emerald-500" />
                <h4 className="font-bold text-slate-800 text-base">कोणतीही डबल नोंद आढळली नाही!</h4>
                <p className="text-xs text-slate-500 mt-1">
                  निवडलेल्या निकषांनुसार किंवा शोध परिणामांमध्ये एकही डुप्लिकेट नोंद सापडलेली नाही.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 📋 STANDARD SEARCH RESULTS (ALL / REGISTRATION / RENEWAL / CLAIM) */}
      {/* ========================================================================= */}
      {activeCategory !== 'duplicate' && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginatedResults.map((item) => {
              const typeBadge = getTypeBadge(item.type);
              const TypeIcon = typeBadge.icon;
              const isDup = Boolean(item.duplicateInfo?.isDuplicate);

            return (
              <div
                key={`${item.type}-${item.id}`}
                onClick={() => setSelectedResult(item)}
                className={`p-5 rounded-2xl bg-white border cursor-pointer transition-all shadow-xs hover:shadow-md group relative overflow-hidden flex flex-col justify-between ${
                  isDup
                    ? 'border-amber-300 hover:border-amber-500 bg-gradient-to-b from-amber-50/20 to-white'
                    : 'border-slate-200/90 hover:border-blue-600/50'
                }`}
              >
                <div>
                  {/* Header: Type Badge & Status */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${typeBadge.bg}`}>
                      <TypeIcon className="w-3 h-3" />
                      <span>{typeBadge.label}</span>
                    </span>

                    <div className="flex items-center gap-1.5">
                      {isDup && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveCategory('duplicate');
                            // If there's an aadhaar cluster, pick it
                            const reg = item.raw as WorkerRegistration;
                            const cleanAadhaar = (reg.aadhaarNumber || '').replace(/\D/g, '');
                            if (cleanAadhaar) {
                              setDuplicateCriterion('aadhaar');
                            }
                          }}
                          className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1 hover:bg-amber-200 transition-colors"
                          title="डबल नोंद तपासा व तुलना करा"
                        >
                          <AlertTriangle className="w-3 h-3 text-amber-700" />
                          <span>Double ({item.duplicateInfo?.totalMatches}x)</span>
                        </button>
                      )}

                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${getStatusBadgeClass(item.status)}`}>
                        {item.status}
                      </span>
                    </div>
                  </div>

                  {/* Title & MH */}
                  <h3 className="font-extrabold text-slate-900 text-base group-hover:text-blue-700 transition-colors">
                    {item.workerName}
                  </h3>

                  <div className="text-xs font-mono font-bold text-blue-700 mt-0.5">
                    {item.subTitle}
                  </div>

                  {/* Details Grid */}
                  <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs text-slate-600 font-medium">
                    <div className="flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      <span>{item.mobileNumber || 'N/A'}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      <span>{item.taluka || 'N/A'}</span>
                    </div>
                    <div className="flex items-center gap-1.5 col-span-2">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>Date: {formatDate(item.date)}</span>
                    </div>

                    {/* Show Aadhaar if Registration */}
                    {item.type === 'registration' && (
                      <div className="flex items-center gap-1.5 col-span-2 text-slate-800 font-mono">
                        <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                        <span>Aadhaar: {(item.raw as WorkerRegistration).aadhaarNumber?.replace(/\s+/g, '') || 'N/A'}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="text-blue-700 font-bold group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
                    <span>View Docket</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </span>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenPrintSlip(item.type, item.raw);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] flex items-center gap-1 border border-slate-300"
                      title="प्रिंट स्लिप"
                    >
                      <Printer className="w-3 h-3" />
                      <span>Print</span>
                    </button>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleInitiateSingleDelete(item);
                      }}
                      className="p-1 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors"
                      title="नोंद हटवा"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {results.length === 0 && (
            <div className="col-span-full p-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200/90 shadow-xs">
              <AlertCircle className="w-12 h-12 mx-auto mb-2 text-slate-300" />
              <h4 className="font-bold text-slate-700 text-base">कोणतेही परिणाम सापडले नाहीत!</h4>
              <p className="text-xs text-slate-500 mt-1">
                कृपया वेगळा शोध शब्द, MH क्रमांक किंवा तारीख फिल्टर वापरून पहा.
              </p>
            </div>
          )}
        </div>

        {/* Pagination Bar for Search Results */}
        {results.length > 0 && totalSearchPages > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs text-xs text-slate-600">
            <div>
              दाखवत आहे{' '}
              <strong className="text-slate-900 font-bold">
                {(searchPage - 1) * searchPageSize + 1}
              </strong>{' '}
              ते{' '}
              <strong className="text-slate-900 font-bold">
                {Math.min(searchPage * searchPageSize, results.length)}
              </strong>{' '}
              (एकूण <strong className="text-blue-900 font-bold">{results.length}</strong> परिणाम)
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setSearchPage((p) => Math.max(1, p - 1))}
                disabled={searchPage === 1}
                className="p-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                title="मागील पान"
              >
                <ChevronRight className="w-4 h-4 rotate-180" />
              </button>

              <span className="px-2 font-bold text-slate-800">
                पान {searchPage} / {totalSearchPages}
              </span>

              <button
                onClick={() => setSearchPage((p) => Math.min(totalSearchPages, p + 1))}
                disabled={searchPage === totalSearchPages}
                className="p-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
                title="पुढील पान"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </>
    )}

      {/* ========================================================================= */}
      {/* 🛑 MODAL: PERMANENT DELETION CONFIRMATION */}
      {/* ========================================================================= */}
      {deleteConfirmation?.isOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                <AlertOctagon className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-black text-slate-900 text-base">
                  {deleteConfirmation.title}
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  ही कृती पूर्ववत करता येणार नाही. (This action cannot be undone).
                </p>
              </div>
            </div>

            {/* Primary Item (To be Kept) */}
            {deleteConfirmation.primaryItem && (
              <div className="p-3.5 bg-emerald-50 rounded-2xl border border-emerald-200 space-y-1 text-xs">
                <div className="text-emerald-900 font-black flex items-center gap-1.5 uppercase tracking-wide text-[10px]">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>सुरक्षित ठेवली जाणारी मुख्य नोंद (Record to be KEPT):</span>
                </div>
                <div className="font-bold text-slate-900 text-sm">
                  {deleteConfirmation.primaryItem.workerName}
                </div>
                <div className="flex items-center gap-2 font-mono text-slate-700 text-[11px]">
                  <span>MH: {deleteConfirmation.primaryItem.mhNumber || 'Pending'}</span>
                  <span>•</span>
                  <span>ID: {deleteConfirmation.primaryItem.id}</span>
                  <span>•</span>
                  <span className="font-bold text-emerald-700">{deleteConfirmation.primaryItem.status}</span>
                </div>
              </div>
            )}

            {/* Items To Be Deleted */}
            <div className="space-y-2">
              <label className="text-[11px] font-black text-rose-900 uppercase tracking-wide block">
                कायमच्या हटवल्या जाणाऱ्या डबल नोंदी ({deleteConfirmation.itemsToDelete.length}):
              </label>
              <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                {deleteConfirmation.itemsToDelete.map((item) => (
                  <div
                    key={item.id}
                    className="p-2.5 rounded-xl bg-rose-50/70 border border-rose-200 text-xs flex items-center justify-between"
                  >
                    <div>
                      <div className="font-bold text-slate-900">{item.workerName}</div>
                      <div className="text-[11px] text-slate-600 font-mono">
                        MH: {item.mhNumber || 'Pending'} • ID: {item.id} • {formatDate(item.date)}
                      </div>
                    </div>
                    <span className="text-[10px] font-extrabold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-md">
                      नष्ट होईल
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Confirm Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeleteConfirmation(null)}
                disabled={Boolean(isDeletingId)}
                className="px-4 py-2 rounded-xl text-slate-700 bg-slate-100 hover:bg-slate-200 font-bold text-xs cursor-pointer disabled:opacity-50"
              >
                रद्द करा (Cancel)
              </button>
              <button
                type="button"
                onClick={handleExecuteDeletion}
                disabled={Boolean(isDeletingId)}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>
                  {isDeletingId ? 'हटवत आहे...' : 'होय, कायमचे हटवा (Confirm Delete)'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 📄 MODAL: WORKER DOSSIER / FULL DETAILS */}
      {/* ========================================================================= */}
      {selectedResult && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-blue-50 text-blue-700 border border-blue-200">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                    Comprehensive Worker Dossier
                  </span>
                  <h3 className="text-lg font-black text-slate-900">
                    {selectedResult.workerName}
                  </h3>
                  <div className="text-xs font-mono font-bold text-blue-700">
                    MH Number: {selectedMhNumber || 'Pending'} (ID: {selectedResult.id})
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedResult(null)}
                className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* DUPLICATE BANNER IN DOCKET IF APPLICABLE */}
            {selectedResult.duplicateInfo?.isDuplicate && (
              <div className="mb-5 p-3.5 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-950 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs">
                  <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0" />
                  <div>
                    <strong className="font-extrabold">डबल नोंद सूचना:</strong> या कामगाराच्या इतर {selectedResult.duplicateInfo.totalMatches - 1} डबल नोंदी आढळल्या आहेत.
                  </div>
                </div>
                <button
                  onClick={() => {
                    setSelectedResult(null);
                    setActiveCategory('duplicate');
                  }}
                  className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shrink-0 cursor-pointer shadow-2xs"
                >
                  डबल नोंदींचे निवारण करा
                </button>
              </div>
            )}

            {/* HIGHLIGHTED VERIFICATION DATE BANNER */}
            {selectedResult.type === 'registration' && (selectedResult.raw as WorkerRegistration).verificationDate && (
              <div className="mb-5 p-3.5 rounded-2xl bg-gradient-to-r from-amber-100 via-amber-50 to-amber-100 border-2 border-amber-400 text-amber-950 shadow-xs flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-amber-500 text-white rounded-xl shadow-xs">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-amber-800 font-extrabold flex items-center gap-1">
                      <span>Verification Date (तपासणी / पडताळणी तारीख)</span>
                    </div>
                    <div className="text-base font-black font-mono text-amber-950 mt-0.5">
                      {formatDate((selectedResult.raw as WorkerRegistration).verificationDate)}
                    </div>
                  </div>
                </div>
                <span className="px-3 py-1 rounded-full bg-amber-300 text-amber-950 text-xs font-black border border-amber-400 shadow-2xs">VERIFIED</span>
              </div>
            )}

            {selectedResult.type === 'renewal' && (selectedResult.raw as WorkerRenewal).verificationDate && (
              <div className="mb-5 p-3.5 rounded-2xl bg-gradient-to-r from-amber-100 via-amber-50 to-amber-100 border-2 border-amber-400 text-amber-950 shadow-xs flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-amber-500 text-white rounded-xl shadow-xs">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-wider text-amber-800 font-extrabold flex items-center gap-1">
                      <span>Verification Date (तपासणी / पडताळणी तारीख)</span>
                    </div>
                    <div className="text-base font-black font-mono text-amber-950 mt-0.5">
                      {formatDate((selectedResult.raw as WorkerRenewal).verificationDate)}
                    </div>
                  </div>
                </div>
                <span className="px-3 py-1 rounded-full bg-amber-300 text-amber-950 text-xs font-black border border-amber-400 shadow-2xs">VERIFIED</span>
              </div>
            )}

            {/* Item Specific Card */}
            {selectedResult.type === 'registration' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs mb-6">
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-slate-800">
                  <div className="font-bold text-blue-800 flex items-center gap-1.5 mb-2">
                    <UserCheck className="w-4 h-4" />
                    <span>Worker Info</span>
                  </div>
                  <div><span className="text-slate-500 font-medium">Worker Name:</span> <span className="font-semibold">{selectedResult.workerName}</span></div>
                  <div><span className="text-slate-500 font-medium">Mobile:</span> <span className="font-mono font-semibold">{selectedResult.mobileNumber}</span></div>
                  <div><span className="text-slate-500 font-medium">Aadhaar:</span> <span className="font-mono font-semibold">{(selectedResult.raw as WorkerRegistration).aadhaarNumber?.replace(/\s+/g, '')}</span></div>
                  {(selectedResult.raw as WorkerRegistration).dob && <div><span className="text-slate-500 font-medium">DOB:</span> <span className="font-mono font-semibold">{formatDate((selectedResult.raw as WorkerRegistration).dob)}</span></div>}
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2 text-slate-800">
                  <div className="font-bold text-emerald-800 flex items-center gap-1.5 mb-2">
                    <MapPin className="w-4 h-4" />
                    <span>Registration Details</span>
                  </div>
                  <div><span className="text-slate-500 font-medium">Taluka:</span> <span className="font-semibold">{selectedResult.taluka}</span></div>
                  <div><span className="text-slate-500 font-medium">Reg Date:</span> <span className="font-semibold">{formatDate((selectedResult.raw as WorkerRegistration).registrationDate)}</span></div>
                  <div><span className="text-slate-500 font-medium">Next Renewal:</span> <span className="font-semibold">{formatDate((selectedResult.raw as WorkerRegistration).nextRenewalDate)}</span></div>
                  <div><span className="text-slate-500 font-medium">Operator:</span> <span className="font-semibold">{(selectedResult.raw as WorkerRegistration).operatorName}</span></div>
                </div>
              </div>
            )}

            {selectedResult.type === 'renewal' && (
              <div className="p-4 rounded-2xl bg-purple-50/60 border border-purple-200 text-xs mb-6 space-y-2">
                <div className="font-bold text-purple-900 flex items-center gap-1.5 mb-1">
                  <RefreshCw className="w-4 h-4 text-purple-700" />
                  <span>Renewal Record Details</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-slate-800">
                  <div><span className="text-slate-500">Renewal ID:</span> <span className="font-mono font-bold">{selectedResult.id}</span></div>
                  <div><span className="text-slate-500">Period:</span> <span className="font-bold text-purple-800">{(selectedResult.raw as WorkerRenewal).renewalPeriodYears} Year(s)</span></div>
                  <div><span className="text-slate-500">Fee Amount:</span> <span className="font-bold text-emerald-700">₹{(selectedResult.raw as WorkerRenewal).feeAmount}</span></div>
                  <div><span className="text-slate-500">Renewal Date:</span> <span className="font-bold text-slate-900">{formatDate((selectedResult.raw as WorkerRenewal).renewalDate)}</span></div>
                  <div><span className="text-slate-500">New Valid Till:</span> <span className="font-bold text-emerald-800">{formatDate((selectedResult.raw as WorkerRenewal).validTill)}</span></div>
                  <div><span className="text-slate-500">Receipt No:</span> <span className="font-semibold">{(selectedResult.raw as WorkerRenewal).receiptNumber || 'N/A'}</span></div>
                  <div><span className="text-slate-500">Processed By:</span> <span className="font-semibold">{(selectedResult.raw as WorkerRenewal).operatorName}</span></div>
                </div>
              </div>
            )}

            {selectedResult.type === 'claim' && (
              <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200 text-xs mb-6 space-y-2">
                <div className="font-bold text-amber-900 flex items-center gap-1.5 mb-1">
                  <Award className="w-4 h-4 text-amber-700" />
                  <span>Welfare Scheme Claim Details</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-slate-800">
                  <div><span className="text-slate-500">Claim ID:</span> <span className="font-mono font-bold">{selectedResult.id}</span></div>
                  <div><span className="text-slate-500">Status:</span> <span className="font-bold text-amber-800">{selectedResult.status}</span></div>
                  <div className="col-span-2"><span className="text-slate-500">Scheme 1:</span> <span className="font-bold text-slate-900">{(selectedResult.raw as WorkerClaim).scheme1Name}</span> (₹{(selectedResult.raw as WorkerClaim).scheme1Amount})</div>
                  {(selectedResult.raw as WorkerClaim).scheme2Name && (
                    <div className="col-span-2"><span className="text-slate-500">Scheme 2:</span> <span className="font-bold text-slate-900">{(selectedResult.raw as WorkerClaim).scheme2Name}</span> (₹{(selectedResult.raw as WorkerClaim).scheme2Amount})</div>
                  )}
                  <div><span className="text-slate-500">Total Benefit Amount:</span> <span className="font-extrabold text-emerald-700 text-sm">₹{(selectedResult.raw as WorkerClaim).totalAmount.toLocaleString('en-IN')}</span></div>
                  <div><span className="text-slate-500">Application Date:</span> <span className="font-semibold">{formatDate(selectedResult.date)}</span></div>
                  <div className="col-span-2"><span className="text-slate-500">Remarks:</span> <span className="font-medium text-slate-700">{(selectedResult.raw as WorkerClaim).remarks || 'N/A'}</span></div>
                </div>
              </div>
            )}

            {/* Linked Worker Dossier Summary */}
            <div className="border-t border-slate-200 pt-4 space-y-4">
              <h4 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-700" />
                <span>Complete Worker Portfolio & History (MH: {selectedMhNumber || 'N/A'})</span>
              </h4>

              {/* Linked Renewals */}
              <div>
                <div className="text-[11px] font-bold text-slate-600 mb-1.5 flex items-center gap-1">
                  <RefreshCw className="w-3.5 h-3.5 text-purple-600" />
                  <span>Renewals ({linkedRenewals.length})</span>
                </div>
                {linkedRenewals.length > 0 ? (
                  <div className="space-y-1.5">
                    {linkedRenewals.map((r) => (
                      <div key={r.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex justify-between text-xs">
                        <div>
                          <span className="font-bold text-slate-900">{r.id}</span> • {r.renewalPeriodYears} Year Renewal ({formatDate(r.renewalDate)})
                        </div>
                        <span className="font-bold text-emerald-700">₹{r.feeAmount} Paid</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400">No renewals recorded for this worker.</p>
                )}
              </div>

              {/* Linked Claims */}
              <div>
                <div className="text-[11px] font-bold text-slate-600 mb-1.5 flex items-center gap-1">
                  <Award className="w-3.5 h-3.5 text-amber-600" />
                  <span>Scheme Claims ({linkedClaims.length})</span>
                </div>
                {linkedClaims.length > 0 ? (
                  <div className="space-y-1.5">
                    {linkedClaims.map((c) => (
                      <div key={c.id} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex justify-between text-xs">
                        <div>
                          <span className="font-bold text-slate-900">{c.scheme1Name}</span> ({c.status})
                        </div>
                        <span className="font-extrabold text-amber-700">₹{c.totalAmount.toLocaleString('en-IN')}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400">No scheme claims submitted for this worker.</p>
                )}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex justify-between items-center gap-2 pt-4 mt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={() => {
                  const toDelete = selectedResult;
                  setSelectedResult(null);
                  handleInitiateSingleDelete(toDelete);
                }}
                className="py-2 px-3.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>ही नोंद हटवा (Delete Record)</span>
              </button>

              <button
                onClick={() => onOpenPrintSlip(selectedResult.type, selectedResult.raw)}
                className="py-2.5 px-5 rounded-xl brand-gradient hover:opacity-95 text-white font-bold text-xs shadow-md flex items-center gap-2 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Print {selectedResult.type.toUpperCase()} Slip / Voucher</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
