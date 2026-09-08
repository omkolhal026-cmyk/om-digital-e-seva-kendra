import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Bot,
  RefreshCw,
  Play,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Clock,
  Layers,
  Search,
  Filter,
  Copy,
  Check,
  AlertTriangle,
  Server,
  Activity,
  Calendar,
  ChevronRight,
  ShieldCheck,
  AlertCircle,
  FileText,
  UserPlus,
  Award,
  Database,
  Eye,
  History,
  Radio,
  ExternalLink,
} from 'lucide-react';
import {
  User,
  IwbmsCheckJob,
  IwbmsWorkerHeartbeat,
  IwbmsJobCounts,
  IwbmsWorkerType,
  IwbmsJobStatus,
  IwbmsResultStatus,
  IwbmsCheckHistory,
  WorkerRegistration,
  WorkerRenewal,
  WorkerClaim,
} from '../types';

interface IwbmsCheckerModuleProps {
  currentUser: User | null;
  registrations?: WorkerRegistration[];
  renewals?: WorkerRenewal[];
  claims?: WorkerClaim[];
  onRefreshRegistrations?: () => void;
  onRefreshRenewals?: () => void;
  onRefreshClaims?: () => void;
}

export const IwbmsCheckerModule: React.FC<IwbmsCheckerModuleProps> = ({
  currentUser,
  registrations = [],
  renewals = [],
  claims = [],
  onRefreshRegistrations,
  onRefreshRenewals,
  onRefreshClaims,
}) => {
  const isAdmin = currentUser?.role === 'admin';

  // State
  const [activeView, setActiveView] = useState<'queue' | 'history'>('queue');
  const [jobs, setJobs] = useState<IwbmsCheckJob[]>([]);
  const [historyLogs, setHistoryLogs] = useState<IwbmsCheckHistory[]>([]);
  const [counts, setCounts] = useState<IwbmsJobCounts>({
    total: 0,
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    activeResults: 0,
    inactiveResults: 0,
    notFoundResults: 0,
    checkResults: 0,
  });
  const [workerStatus, setWorkerStatus] = useState<IwbmsWorkerHeartbeat | null>(null);
  const [workerConnected, setWorkerConnected] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);
  const [copiedMh, setCopiedMh] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [searchMh, setSearchMh] = useState<string>('');
  const [historySearchMh, setHistorySearchMh] = useState<string>('');

  // Quick single enqueue
  const [quickMh, setQuickMh] = useState<string>('');
  const [quickType, setQuickType] = useState<IwbmsWorkerType>('direct');
  const [quickSubmitting, setQuickSubmitting] = useState<boolean>(false);

  // Batch modal
  const [isBatchModalOpen, setIsBatchModalOpen] = useState<boolean>(false);
  const [batchSource, setBatchSource] = useState<'registrations' | 'renewals' | 'claims' | 'custom'>('registrations');
  const [batchCustomText, setBatchCustomText] = useState<string>('');
  const [batchSubmitting, setBatchSubmitting] = useState<boolean>(false);
  const [batchResult, setBatchResult] = useState<{
    total: number;
    newJobs: number;
    alreadyQueued: number;
    invalidMhNumbers: number;
  } | null>(null);

  // Selected Job for Details Modal
  const [selectedJob, setSelectedJob] = useState<IwbmsCheckJob | null>(null);
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showNotification = (text: string, type: 'success' | 'error' = 'success') => {
    setActionMessage({ text, type });
    setTimeout(() => setActionMessage(null), 4000);
  };

  const getAuthHeaders = useCallback(() => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (currentUser) {
      headers['x-user-id'] = currentUser.id;
      headers['x-user-username'] = currentUser.username;
    }
    return headers;
  }, [currentUser]);

  // Fetch summary & worker status
  const fetchStatusSummary = useCallback(async () => {
    try {
      const res = await fetch('/api/iwbms/jobs/status', { headers: getAuthHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      if (data.success) {
        setCounts(data.counts || {
          total: 0,
          pending: 0,
          processing: 0,
          completed: 0,
          failed: 0,
          activeResults: 0,
          inactiveResults: 0,
          notFoundResults: 0,
          checkResults: 0,
        });
        if (data.worker) {
          setWorkerConnected(Boolean(data.worker.connected));
          setWorkerStatus(data.worker.heartbeat || null);
        }
      }
    } catch {
      // ignore
    }
  }, [getAuthHeaders]);

  // Fetch jobs
  const fetchJobs = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter !== 'ALL') params.append('status', statusFilter);
      if (typeFilter !== 'ALL') params.append('workerType', typeFilter);
      if (searchMh.trim()) params.append('mhNumber', searchMh.trim());
      params.append('limit', '100');

      const res = await fetch(`/api/iwbms/jobs?${params.toString()}`, { headers: getAuthHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      if (data.success && Array.isArray(data.jobs)) {
        setJobs(data.jobs);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter, searchMh, getAuthHeaders]);

  // Fetch History Logs
  const fetchHistory = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (historySearchMh.trim()) params.append('mhNumber', historySearchMh.trim());
      params.append('limit', '100');

      const res = await fetch(`/api/iwbms/history?${params.toString()}`, { headers: getAuthHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      if (data.success && Array.isArray(data.history)) {
        setHistoryLogs(data.history);
      }
    } catch {
      // ignore
    }
  }, [historySearchMh, getAuthHeaders]);

  // Initial load
  useEffect(() => {
    fetchStatusSummary();
    fetchJobs();
    fetchHistory();
  }, [fetchStatusSummary, fetchJobs, fetchHistory]);

  // Polling interval
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchStatusSummary();
      if (activeView === 'queue') {
        fetchJobs();
      } else {
        fetchHistory();
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [autoRefresh, activeView, fetchStatusSummary, fetchJobs, fetchHistory]);

  // Handle Quick Enqueue
  const handleQuickEnqueue = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanMh = quickMh.trim().toUpperCase().replace(/\s/g, '');
    if (!cleanMh) {
      showNotification('Please enter a valid MH Number', 'error');
      return;
    }

    setQuickSubmitting(true);
    try {
      const res = await fetch('/api/iwbms/jobs', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          workerType: quickType,
          workerRecordId: `QUICK-${Date.now()}`,
          mhNumber: cleanMh,
          createdBy: currentUser?.username || 'staff',
        }),
      });

      const data = await res.json();
      if (data.success) {
        if (data.isDuplicate) {
          showNotification(`MH ${cleanMh} is already in queue or processing.`, 'error');
        } else {
          showNotification(`Job #${data.job?.id} enqueued for ${cleanMh}!`, 'success');
          setQuickMh('');
          fetchStatusSummary();
          fetchJobs();
        }
      } else {
        showNotification(data.error || 'Failed to enqueue job', 'error');
      }
    } catch (err: any) {
      showNotification(err?.message || 'Network error', 'error');
    } finally {
      setQuickSubmitting(false);
    }
  };

  // Handle Retry Single Job
  const handleRetryJob = async (jobId: number) => {
    try {
      const res = await fetch(`/api/iwbms/jobs/${jobId}/retry`, {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        showNotification(`Job #${jobId} re-queued successfully!`, 'success');
        fetchStatusSummary();
        fetchJobs();
      } else {
        showNotification(data.error || 'Failed to retry job', 'error');
      }
    } catch (err: any) {
      showNotification(err?.message || 'Network error', 'error');
    }
  };

  // Handle Retry All Failed Jobs
  const handleRetryAllFailed = async () => {
    if (!window.confirm('Re-queue all failed IWBMS verification jobs?')) return;
    try {
      const res = await fetch('/api/iwbms/jobs/retry-all', {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        showNotification(`Re-queued ${data.retriedCount} failed jobs!`, 'success');
        fetchStatusSummary();
        fetchJobs();
      } else {
        showNotification(data.error || 'Failed to retry all', 'error');
      }
    } catch (err: any) {
      showNotification(err?.message || 'Network error', 'error');
    }
  };

  // Handle Recover Stale Jobs
  const handleRecoverStale = async () => {
    try {
      const res = await fetch('/api/iwbms/jobs/recover-stale', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ staleMinutes: 10 }),
      });
      const data = await res.json();
      if (data.success) {
        showNotification(`Recovered ${data.recoveredCount} stale jobs back to Pending.`, 'success');
        fetchStatusSummary();
        fetchJobs();
      } else {
        showNotification(data.error || 'Failed to recover jobs', 'error');
      }
    } catch (err: any) {
      showNotification(err?.message || 'Network error', 'error');
    }
  };

  // Batch items preview count
  const batchCandidateItems = useMemo(() => {
    if (batchSource === 'registrations') {
      return registrations
        .filter((r) => r.mhNumber && r.mhNumber.trim() !== '')
        .map((r) => ({
          workerType: 'registration' as IwbmsWorkerType,
          workerRecordId: r.id,
          mhNumber: r.mhNumber!,
        }));
    }
    if (batchSource === 'renewals') {
      return renewals
        .filter((r) => r.mhNumber && r.mhNumber.trim() !== '')
        .map((r) => ({
          workerType: 'renewal' as IwbmsWorkerType,
          workerRecordId: r.id,
          mhNumber: r.mhNumber,
        }));
    }
    if (batchSource === 'claims') {
      return claims
        .filter((c) => c.mhNumber && c.mhNumber.trim() !== '')
        .map((c) => ({
          workerType: 'claim' as IwbmsWorkerType,
          workerRecordId: c.id,
          mhNumber: c.mhNumber,
        }));
    }
    if (batchSource === 'custom') {
      const lines = batchCustomText
        .split(/[\n,;]+/)
        .map((s) => s.trim().toUpperCase().replace(/\s/g, ''))
        .filter((s) => s.length > 3);
      return lines.map((mh, idx) => ({
        workerType: 'direct' as IwbmsWorkerType,
        workerRecordId: `CUSTOM-${idx + 1}-${Date.now()}`,
        mhNumber: mh,
      }));
    }
    return [];
  }, [batchSource, batchCustomText, registrations, renewals, claims]);

  // Handle Batch Enqueue Submit
  const handleBatchEnqueueSubmit = async () => {
    if (batchCandidateItems.length === 0) {
      showNotification('No valid records to enqueue', 'error');
      return;
    }

    setBatchSubmitting(true);
    setBatchResult(null);
    try {
      const res = await fetch('/api/iwbms/batch', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          records: batchCandidateItems,
          createdBy: currentUser?.username || 'staff',
        }),
      });

      const data = await res.json();
      if (data.success && data.stats) {
        setBatchResult(data.stats);
        showNotification(`Batch Enqueued: ${data.stats.newJobs} new jobs added!`, 'success');
        fetchStatusSummary();
        fetchJobs();
        if (onRefreshRegistrations) onRefreshRegistrations();
        if (onRefreshRenewals) onRefreshRenewals();
        if (onRefreshClaims) onRefreshClaims();
      } else {
        showNotification(data.error || 'Batch enqueue failed', 'error');
      }
    } catch (err: any) {
      showNotification(err?.message || 'Network error', 'error');
    } finally {
      setBatchSubmitting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMh(text);
    setTimeout(() => setCopiedMh(null), 2000);
  };

  // Helper for Result Status Badge
  const renderResultBadge = (result?: IwbmsResultStatus) => {
    if (!result) {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
          Pending Check
        </span>
      );
    }

    switch (result) {
      case 'Active':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-300">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            Active (वैध)
          </span>
        );
      case 'Inactive':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-300">
            <XCircle className="w-3 h-3 text-rose-600" />
            Inactive (अवैध/कालबाह्य)
          </span>
        );
      case 'Not Found':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-300">
            <AlertCircle className="w-3 h-3 text-slate-500" />
            Not Found (नोंद नाही)
          </span>
        );
      case 'Check':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-300">
            <Clock className="w-3 h-3 text-amber-600" />
            Check (तपासा)
          </span>
        );
    }
  };

  // Helper for Job Status Badge
  const renderJobStatusBadge = (status: IwbmsJobStatus) => {
    switch (status) {
      case 'Pending':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
            <Clock className="w-3 h-3 text-amber-600 animate-pulse" />
            Pending Queue
          </span>
        );
      case 'Processing':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-sky-50 text-sky-800 border border-sky-300">
            <RefreshCw className="w-3 h-3 text-sky-600 animate-spin" />
            Processing
          </span>
        );
      case 'Completed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            Completed
          </span>
        );
      case 'Failed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-800 border border-rose-200">
            <AlertTriangle className="w-3 h-3 text-rose-600" />
            Failed
          </span>
        );
    }
  };

  // Helper for Worker Type Badge
  const renderTypeBadge = (type: IwbmsWorkerType) => {
    switch (type) {
      case 'registration':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
            <UserPlus className="w-2.5 h-2.5" />
            Registration
          </span>
        );
      case 'renewal':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
            <RefreshCw className="w-2.5 h-2.5" />
            Renewal
          </span>
        );
      case 'claim':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
            <Award className="w-2.5 h-2.5" />
            Claim
          </span>
        );
      case 'direct':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
            <Search className="w-2.5 h-2.5" />
            Direct
          </span>
        );
    }
  };

  // Worker status color and text
  const workerStatusInfo = useMemo(() => {
    if (!workerConnected || !workerStatus) {
      return {
        label: 'Offline',
        dotClass: 'bg-rose-500 ring-rose-300',
        badgeBg: 'bg-rose-50 text-rose-800 border-rose-200',
        description: 'No active Windows Python worker connected or heartbeat timed out (>60s).',
      };
    }
    if (workerStatus.status === 'Processing') {
      return {
        label: 'Processing Job',
        dotClass: 'bg-amber-500 ring-amber-300 animate-ping',
        badgeBg: 'bg-amber-50 text-amber-800 border-amber-200',
        description: `Currently verifying MH ${workerStatus.currentMhNumber || ''} (Job #${workerStatus.currentJobId || ''})`,
      };
    }
    if (workerStatus.status === 'Idle' || workerStatus.status === 'Online') {
      return {
        label: 'Connected & Idle',
        dotClass: 'bg-emerald-500 ring-emerald-300',
        badgeBg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
        description: 'Ready to receive pending verification jobs from queue.',
      };
    }
    return {
      label: 'Offline',
      dotClass: 'bg-slate-400 ring-slate-200',
      badgeBg: 'bg-slate-100 text-slate-700 border-slate-200',
      description: 'Worker status unknown',
    };
  }, [workerConnected, workerStatus]);

  return (
    <div id="iwbms-checker-module" className="space-y-5">
      {/* Toast notification */}
      {actionMessage && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-2xl shadow-xl border text-sm font-semibold flex items-center gap-2 transition-all ${
            actionMessage.type === 'success'
              ? 'bg-emerald-900 text-emerald-100 border-emerald-700'
              : 'bg-rose-900 text-rose-100 border-rose-700'
          }`}
        >
          {actionMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400" />
          )}
          <span>{actionMessage.text}</span>
        </div>
      )}

      {/* Top Banner & Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-blue-50 text-blue-700 border border-blue-100">
              <Bot className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">IWBMS STATUS CHECKER</h1>
              <p className="text-xs text-slate-500 font-medium">
                Automated Mahabocw Portal Verification Queue & Local Edge/Selenium Worker Sync
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          {/* Auto Refresh Toggle */}
          <button
            type="button"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition-colors ${
              autoRefresh
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                : 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
            }`}
            title="Auto refresh every 4 seconds"
          >
            <Radio className={`w-3.5 h-3.5 ${autoRefresh ? 'text-emerald-600 animate-pulse' : 'text-slate-400'}`} />
            <span>Auto Refresh: {autoRefresh ? 'ON' : 'OFF'}</span>
          </button>

          {/* Manual Refresh */}
          <button
            type="button"
            onClick={() => {
              fetchStatusSummary();
              if (activeView === 'queue') fetchJobs();
              else fetchHistory();
            }}
            disabled={loading}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 transition-colors"
            title="Refresh now"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
          </button>

          {/* Batch Enqueue Button */}
          <button
            type="button"
            onClick={() => {
              setBatchResult(null);
              setIsBatchModalOpen(true);
            }}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition-colors"
          >
            <Layers className="w-4 h-4" />
            <span>Batch Enqueue</span>
          </button>

          {/* Admin Maintenance Buttons */}
          {isAdmin && (
            <>
              <button
                type="button"
                onClick={handleRetryAllFailed}
                className="px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold border border-amber-200 shadow-xs flex items-center gap-1.5 transition-colors"
                title="Retry all failed jobs"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Retry Failed</span>
              </button>

              <button
                type="button"
                onClick={handleRecoverStale}
                className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-300 shadow-xs flex items-center gap-1.5 transition-colors"
                title="Recover jobs stuck in Processing > 10m"
              >
                <Activity className="w-3.5 h-3.5 text-slate-500" />
                <span>Recover Stale</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* 1. Worker Status Card */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-blue-950 p-5 rounded-2xl text-white shadow-md border border-slate-700">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="p-3 rounded-2xl bg-white/10 border border-white/15 backdrop-blur-sm">
              <Server className="w-6 h-6 text-sky-300" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 mb-1">
                <span className="text-xs uppercase tracking-widest text-slate-300 font-bold">
                  Windows Python Worker
                </span>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold border ${workerStatusInfo.badgeBg}`}>
                  <span className={`w-2 h-2 rounded-full ${workerStatusInfo.dotClass}`} />
                  {workerStatusInfo.label}
                </span>
              </div>
              <p className="text-xs text-slate-300 font-medium">
                {workerStatusInfo.description}
              </p>
            </div>
          </div>

          {/* Worker Telemetry stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white/5 p-3 rounded-xl border border-white/10 text-xs">
            <div>
              <div className="text-[10px] text-slate-400 font-bold uppercase">Worker ID</div>
              <div className="font-semibold text-white truncate max-w-[120px]">
                {workerStatus?.workerName || 'IWBMS-Worker'}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 font-bold uppercase">Version</div>
              <div className="font-semibold text-sky-300 font-mono">
                v{workerStatus?.workerVersion || '1.0.0'}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 font-bold uppercase">Last Heartbeat</div>
              <div className="font-semibold text-emerald-300">
                {workerStatus?.lastSeen
                  ? new Date(workerStatus.lastSeen).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                  : 'Never'}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 font-bold uppercase">Active Task</div>
              <div className="font-semibold text-amber-300 font-mono truncate max-w-[130px]">
                {workerStatus?.currentMhNumber ? `${workerStatus.currentMhNumber}` : 'None'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Queue Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Total */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Total Queue</span>
            <Layers className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-black text-slate-900">{counts.total}</div>
          <div className="text-[11px] text-slate-400 mt-1">All registered jobs</div>
        </div>

        {/* Pending */}
        <div className="bg-amber-50/70 p-4 rounded-2xl border border-amber-200/80 shadow-xs">
          <div className="flex items-center justify-between text-amber-800 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Pending</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-black text-amber-900">{counts.pending}</div>
          <div className="text-[11px] text-amber-700 font-medium mt-1">Awaiting worker pickup</div>
        </div>

        {/* Processing */}
        <div className="bg-sky-50/70 p-4 rounded-2xl border border-sky-200/80 shadow-xs">
          <div className="flex items-center justify-between text-sky-800 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Processing</span>
            <RefreshCw className="w-4 h-4 text-sky-600 animate-spin" />
          </div>
          <div className="text-2xl font-black text-sky-900">{counts.processing}</div>
          <div className="text-[11px] text-sky-700 font-medium mt-1">In Selenium browser</div>
        </div>

        {/* Completed */}
        <div className="bg-emerald-50/70 p-4 rounded-2xl border border-emerald-200/80 shadow-xs">
          <div className="flex items-center justify-between text-emerald-800 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Completed</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-black text-emerald-900">{counts.completed}</div>
          <div className="text-[11px] text-emerald-700 font-medium mt-1">Verified & synced</div>
        </div>

        {/* Failed */}
        <div className="bg-rose-50/70 p-4 rounded-2xl border border-rose-200/80 shadow-xs col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-rose-800 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Failed</span>
            <AlertTriangle className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-black text-rose-900">{counts.failed}</div>
          <div className="text-[11px] text-rose-700 font-medium mt-1">Errors or timeouts</div>
        </div>
      </div>

      {/* Result Breakdown Strip */}
      <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="font-bold text-slate-700 flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-blue-600" />
          <span>IWBMS Verification Results Breakdown:</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 font-bold flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-600" />
            Active: {counts.activeResults}
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-rose-100 text-rose-800 font-bold flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-rose-600" />
            Inactive: {counts.inactiveResults}
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-slate-200 text-slate-800 font-bold flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-slate-500" />
            Not Found: {counts.notFoundResults}
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-800 font-bold flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-amber-600" />
            Check: {counts.checkResults}
          </span>
        </div>
      </div>

      {/* Quick Single MH Enqueue Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <form onSubmit={handleQuickEnqueue} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700 whitespace-nowrap">
            <Play className="w-4 h-4 text-blue-600" />
            <span>Quick Check MH:</span>
          </div>

          <input
            type="text"
            placeholder="e.g. MH1220240012345 or MH-14-..."
            value={quickMh}
            onChange={(e) => setQuickMh(e.target.value)}
            className="flex-1 px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-mono uppercase focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />

          <select
            value={quickType}
            onChange={(e) => setQuickType(e.target.value as IwbmsWorkerType)}
            className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 bg-white"
          >
            <option value="direct">Direct Search</option>
            <option value="registration">Registration</option>
            <option value="renewal">Renewal</option>
            <option value="claim">Claim</option>
          </select>

          <button
            type="submit"
            disabled={quickSubmitting || !quickMh.trim()}
            className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition-colors"
          >
            {quickSubmitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            <span>Enqueue Job</span>
          </button>
        </form>
      </div>

      {/* View Switcher Tabs */}
      <div className="flex border-b border-slate-200 gap-4 text-sm font-bold">
        <button
          type="button"
          onClick={() => setActiveView('queue')}
          className={`pb-2.5 px-2 flex items-center gap-2 border-b-2 transition-colors ${
            activeView === 'queue'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Live Queue ({jobs.length})</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveView('history');
            fetchHistory();
          }}
          className={`pb-2.5 px-2 flex items-center gap-2 border-b-2 transition-colors ${
            activeView === 'history'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Verification Audit Log ({historyLogs.length})</span>
        </button>
      </div>

      {/* TAB 1: LIVE QUEUE VIEW */}
      {activeView === 'queue' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {/* Filters Row */}
          <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 text-xs font-bold text-slate-600">
                <Filter className="w-3.5 h-3.5" />
                <span>Filters:</span>
              </div>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 bg-white"
              >
                <option value="ALL">All Statuses</option>
                <option value="Pending">Pending</option>
                <option value="Processing">Processing</option>
                <option value="Completed">Completed</option>
                <option value="Failed">Failed</option>
              </select>

              {/* Type Filter */}
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 bg-white"
              >
                <option value="ALL">All Sources</option>
                <option value="registration">Registration</option>
                <option value="renewal">Renewal</option>
                <option value="claim">Claim</option>
                <option value="direct">Direct</option>
              </select>
            </div>

            {/* Search MH */}
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search MH number..."
                value={searchMh}
                onChange={(e) => setSearchMh(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 text-xs font-mono uppercase focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100/75 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                  <th className="py-3 px-4 w-14"># ID</th>
                  <th className="py-3 px-4">Source Type</th>
                  <th className="py-3 px-4">MH Number</th>
                  <th className="py-3 px-4">Queue Status</th>
                  <th className="py-3 px-4">IWBMS Result</th>
                  <th className="py-3 px-4">Attempts</th>
                  <th className="py-3 px-4">Created / Checked</th>
                  <th className="py-3 px-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {jobs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-400 font-medium">
                      {loading ? (
                        <div className="flex items-center justify-center gap-2">
                          <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                          <span>Loading jobs from queue...</span>
                        </div>
                      ) : (
                        <div>
                          <Bot className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                          <p>No jobs found matching the selected filter criteria.</p>
                          <p className="text-[11px] text-slate-400 mt-1">
                            Click "Batch Enqueue" or "Quick Check MH" to add records to verification queue.
                          </p>
                        </div>
                      )}
                    </td>
                  </tr>
                ) : (
                  jobs.map((job) => (
                    <tr key={job.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-slate-500">#{job.id}</td>

                      <td className="py-3 px-4">
                        <div className="space-y-0.5">
                          {renderTypeBadge(job.workerType)}
                          {job.workerRecordId && (
                            <div className="text-[10px] text-slate-400 font-mono truncate max-w-[110px]">
                              {job.workerRecordId}
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-slate-900">{job.mhNumber}</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(job.mhNumber)}
                            className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                            title="Copy MH number"
                          >
                            {copiedMh === job.mhNumber ? (
                              <Check className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </td>

                      <td className="py-3 px-4">{renderJobStatusBadge(job.status)}</td>

                      <td className="py-3 px-4">{renderResultBadge(job.resultStatus)}</td>

                      <td className="py-3 px-4 font-mono text-slate-600">{job.retryCount || 0}</td>

                      <td className="py-3 px-4">
                        <div className="text-[11px] text-slate-700">
                          {job.createdAt ? new Date(job.createdAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                        </div>
                        {job.lastCheckedAt && (
                          <div className="text-[10px] text-emerald-700 font-medium">
                            Done: {new Date(job.lastCheckedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          {/* Details Button */}
                          <button
                            type="button"
                            onClick={() => setSelectedJob(job)}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-700 border border-slate-200 transition-colors"
                            title="View Job Details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {/* Retry button (Admin only or on failed) */}
                          {isAdmin && (job.status === 'Failed' || job.status === 'Completed') && (
                            <button
                              type="button"
                              onClick={() => handleRetryJob(job.id)}
                              className="p-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 transition-colors"
                              title="Re-queue this job"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: HISTORY & AUDIT LOG VIEW */}
      {activeView === 'history' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {/* History Search Header */}
          <div className="p-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <History className="w-4 h-4 text-blue-600" />
              <span>Portal Verification History & Sync Audit Logs</span>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search MH in audit logs..."
                value={historySearchMh}
                onChange={(e) => setHistorySearchMh(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-300 text-xs font-mono uppercase focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100/75 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider">
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">MH Number</th>
                  <th className="py-3 px-4">Source</th>
                  <th className="py-3 px-4">Previous Status</th>
                  <th className="py-3 px-4">Verified Result</th>
                  <th className="py-3 px-4">Verified By</th>
                  <th className="py-3 px-4">Details / Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {historyLogs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-slate-400 font-medium">
                      No verification history logs found.
                    </td>
                  </tr>
                ) : (
                  historyLogs.map((h) => (
                    <tr key={h.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 text-slate-600 font-mono">
                        {h.checkedAt ? new Date(h.checkedAt).toLocaleString() : '—'}
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-900">{h.mhNumber}</td>
                      <td className="py-3 px-4">{renderTypeBadge(h.workerType)}</td>
                      <td className="py-3 px-4 text-slate-500">{h.previousStatus || 'None'}</td>
                      <td className="py-3 px-4">{renderResultBadge(h.newStatus as any)}</td>
                      <td className="py-3 px-4 font-mono text-slate-600">{h.workerName || 'IWBMS-Worker'}</td>
                      <td className="py-3 px-4 text-slate-600 max-w-xs truncate">{h.details || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* BATCH ENQUEUE MODAL */}
      {isBatchModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 relative text-slate-900 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-blue-50 text-blue-700">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">Batch Enqueue IWBMS Jobs</h3>
                  <p className="text-xs text-slate-500">Bulk verify registration, renewal, or claim records</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsBatchModalOpen(false)}
                className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500"
              >
                ✕
              </button>
            </div>

            {/* Select Source */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700">Select Source Collection:</label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setBatchSource('registrations')}
                  className={`p-3 rounded-xl border text-left font-semibold transition-all ${
                    batchSource === 'registrations'
                      ? 'bg-blue-50 border-blue-500 text-blue-900 shadow-xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <UserPlus className="w-4 h-4 text-blue-600" />
                    <span>Registrations</span>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {registrations.filter((r) => r.mhNumber).length} records available
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setBatchSource('renewals')}
                  className={`p-3 rounded-xl border text-left font-semibold transition-all ${
                    batchSource === 'renewals'
                      ? 'bg-indigo-50 border-indigo-500 text-indigo-900 shadow-xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <RefreshCw className="w-4 h-4 text-indigo-600" />
                    <span>Renewals</span>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {renewals.filter((r) => r.mhNumber).length} records available
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setBatchSource('claims')}
                  className={`p-3 rounded-xl border text-left font-semibold transition-all ${
                    batchSource === 'claims'
                      ? 'bg-purple-50 border-purple-500 text-purple-900 shadow-xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <Award className="w-4 h-4 text-purple-600" />
                    <span>Claims</span>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {claims.filter((c) => c.mhNumber).length} records available
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setBatchSource('custom')}
                  className={`p-3 rounded-xl border text-left font-semibold transition-all ${
                    batchSource === 'custom'
                      ? 'bg-slate-100 border-slate-500 text-slate-900 shadow-xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <FileText className="w-4 h-4 text-slate-600" />
                    <span>Custom List</span>
                  </div>
                  <div className="text-[11px] text-slate-500">Paste MH numbers</div>
                </button>
              </div>
            </div>

            {/* Custom textarea if selected */}
            {batchSource === 'custom' && (
              <div className="space-y-1">
                <label className="block text-xs font-bold text-slate-700">
                  Paste MH Numbers (separated by commas or new lines):
                </label>
                <textarea
                  rows={4}
                  value={batchCustomText}
                  onChange={(e) => setBatchCustomText(e.target.value)}
                  placeholder="MH122024000123&#10;MH122024000124&#10;MH142023009988"
                  className="w-full p-3 rounded-xl border border-slate-300 font-mono text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            )}

            {/* Summary preview */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs flex items-center justify-between">
              <span className="text-slate-600 font-medium">Eligible records found:</span>
              <span className="font-bold text-slate-900 bg-white px-2.5 py-1 rounded-lg border border-slate-300">
                {batchCandidateItems.length} records
              </span>
            </div>

            {/* Result message */}
            {batchResult && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 space-y-1">
                <div className="font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Batch Submission Complete:</span>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-1 text-center font-semibold">
                  <div className="bg-white p-1.5 rounded-lg border border-emerald-100">
                    <span className="text-emerald-700 font-bold">{batchResult.newJobs}</span> New
                  </div>
                  <div className="bg-white p-1.5 rounded-lg border border-emerald-100">
                    <span className="text-slate-600 font-bold">{batchResult.alreadyQueued}</span> In Queue
                  </div>
                  <div className="bg-white p-1.5 rounded-lg border border-emerald-100">
                    <span className="text-rose-600 font-bold">{batchResult.invalidMhNumbers}</span> Invalid
                  </div>
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsBatchModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
              >
                Close
              </button>

              <button
                type="button"
                disabled={batchSubmitting || batchCandidateItems.length === 0}
                onClick={handleBatchEnqueueSubmit}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
              >
                {batchSubmitting ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                <span>Enqueue {batchCandidateItems.length} Records</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* JOB DETAILS MODAL */}
      {selectedJob && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 relative text-slate-900 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-base text-slate-900">Job #{selectedJob.id} Details</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedJob(null)}
                className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2.5 text-xs text-slate-700">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500 font-medium">MH Number:</span>
                <span className="font-mono font-bold text-slate-900">{selectedJob.mhNumber}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Source Type:</span>
                <span>{renderTypeBadge(selectedJob.workerType)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Record ID:</span>
                <span className="font-mono">{selectedJob.workerRecordId || 'N/A'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Queue Status:</span>
                <span>{renderJobStatusBadge(selectedJob.status)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500 font-medium">IWBMS Result:</span>
                <span>{renderResultBadge(selectedJob.resultStatus)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Retry Attempts:</span>
                <span className="font-mono font-bold">{selectedJob.retryCount || 0}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500 font-medium">Created By / At:</span>
                <span className="text-slate-800">
                  {selectedJob.createdBy || 'staff'} ({new Date(selectedJob.createdAt).toLocaleString()})
                </span>
              </div>
              {selectedJob.startedAt && (
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500 font-medium">Started At:</span>
                  <span className="text-slate-800">{new Date(selectedJob.startedAt).toLocaleTimeString()}</span>
                </div>
              )}
              {selectedJob.completedAt && (
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500 font-medium">Completed At:</span>
                  <span className="text-emerald-700 font-bold">{new Date(selectedJob.completedAt).toLocaleString()}</span>
                </div>
              )}
              {selectedJob.errorMessage && (
                <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 text-rose-800 mt-2">
                  <div className="font-bold text-[11px] mb-0.5">Error Details:</div>
                  <div className="font-mono text-[10px]">{selectedJob.errorMessage}</div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    handleRetryJob(selectedJob.id);
                    setSelectedJob(null);
                  }}
                  className="px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold border border-amber-200 flex items-center gap-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Re-queue Job</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedJob(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
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
