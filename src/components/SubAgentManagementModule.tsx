import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  Search,
  KeyRound,
  Shield,
  Phone,
  Mail,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Clock,
  TrendingUp,
  FileSpreadsheet,
  RefreshCw,
  Award,
  Eye,
  Edit2,
  Lock,
  Layers,
  Sparkles,
  ChevronRight,
  Filter,
  UserCheck,
  UserX,
  Trash2,
} from 'lucide-react';
import { User, SubAgentUserSummary, SubAgentStats } from '../types';
import { SubAgentEntriesModule } from './SubAgentEntriesModule';

interface SubAgentManagementModuleProps {
  currentUser: User | null;
  onViewSubAgentEntries?: (subAgentId?: string) => void;
  onOpenPrintSlip?: (type: 'registration' | 'renewal' | 'claim', data: any) => void;
}

export const SubAgentManagementModule: React.FC<SubAgentManagementModuleProps> = ({
  currentUser,
  onViewSubAgentEntries,
  onOpenPrintSlip,
}) => {
  const [activeMainTab, setActiveMainTab] = useState<'accounts' | 'entries'>('accounts');
  const [entriesSubAgentFilter, setEntriesSubAgentFilter] = useState<string>('all');

  const [subAgents, setSubAgents] = useState<SubAgentUserSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled'>('all');

  // Modal States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isResetPasswordModalOpen, setIsResetPasswordModalOpen] = useState(false);
  const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingSubAgent, setDeletingSubAgent] = useState<SubAgentUserSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedSubAgent, setSelectedSubAgent] = useState<SubAgentUserSummary | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);

  // Form State for Add / Edit
  const [formData, setFormData] = useState({
    username: '',
    name: '',
    mobile: '',
    email: '',
    password: '',
    status: 'active' as 'active' | 'disabled',
  });
  const [newCustomPassword, setNewCustomPassword] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  const getAuthHeaders = () => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (currentUser) {
      headers['x-user-id'] = currentUser.id;
      headers['x-user-username'] = currentUser.username;
    }
    return headers;
  };

  const loadSubAgents = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sub-agents', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setSubAgents(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to load sub-agents:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSubAgents();
  }, []);

  const handleOpenAdd = () => {
    setModalError(null);
    setFormData({
      username: '',
      name: '',
      mobile: '',
      email: '',
      password: '',
      status: 'active',
    });
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (agent: SubAgentUserSummary) => {
    setModalError(null);
    setSelectedSubAgent(agent);
    setFormData({
      username: agent.username,
      name: agent.name,
      mobile: agent.mobile,
      email: agent.email || '',
      password: '',
      status: agent.status,
    });
    setIsEditModalOpen(true);
  };

  const handleOpenResetPassword = (agent: SubAgentUserSummary) => {
    setModalError(null);
    setSelectedSubAgent(agent);
    setNewCustomPassword(`${agent.username}123`);
    setIsResetPasswordModalOpen(true);
  };

  const handleOpenStatsModal = (agent: SubAgentUserSummary) => {
    setSelectedSubAgent(agent);
    setIsStatsModalOpen(true);
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    
    const cleanUsername = (formData.username || '').trim().toLowerCase().replace(/\s+/g, '');
    const cleanName = (formData.name || '').trim();
    const cleanMobile = (formData.mobile || '').trim();

    if (!cleanUsername) {
      setModalError('कृपया युझरनेम (Username) प्रविष्ट करा.');
      return;
    }
    if (!cleanName) {
      setModalError('कृपया सब-एजंटचे पूर्ण नाव (Full Name) प्रविष्ट करा.');
      return;
    }
    if (!cleanMobile || cleanMobile.length < 10) {
      setModalError('कृपया वैध १० अंकी मोबाईल नंबर (10-digit mobile) प्रविष्ट करा.');
      return;
    }

    setFormSubmitting(true);
    try {
      const res = await fetch('/api/sub-agents', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          ...formData,
          username: cleanUsername,
          name: cleanName,
          mobile: cleanMobile,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setIsAddModalOpen(false);
        setActionSuccessMessage(`नवीन सब-एजंट @${cleanUsername} (${cleanName}) यशस्वीरीत्या तयार करण्यात आला!`);
        setTimeout(() => setActionSuccessMessage(null), 5000);
        await loadSubAgents();
      } else {
        setModalError(data.error || 'सब-एजंट तयार करण्यात त्रुटी आली. कृपया पुन्हा प्रयत्न करा.');
      }
    } catch (err: any) {
      console.error(err);
      setModalError(err?.message || 'सब-एजंट तयार करण्यात त्रुटी आली.');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    if (!selectedSubAgent) return;

    const cleanName = (formData.name || '').trim();
    const cleanMobile = (formData.mobile || '').trim();

    if (!cleanName) {
      setModalError('कृपया नाव प्रविष्ट करा.');
      return;
    }
    if (!cleanMobile || cleanMobile.length < 10) {
      setModalError('कृपया १० अंकी मोबाईल नंबर प्रविष्ट करा.');
      return;
    }

    setFormSubmitting(true);
    try {
      const res = await fetch(`/api/sub-agents/${selectedSubAgent.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          name: cleanName,
          mobile: cleanMobile,
          email: formData.email,
          status: formData.status,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setIsEditModalOpen(false);
        setActionSuccessMessage(`सब-एजंट ${cleanName} ची माहिती अद्ययावत केली!`);
        setTimeout(() => setActionSuccessMessage(null), 4000);
        await loadSubAgents();
      } else {
        setModalError(data.error || 'सब-एजंट माहिती अपडेट करण्यात त्रुटी आली.');
      }
    } catch (err: any) {
      console.error(err);
      setModalError(err?.message || 'Error updating sub-agent.');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    if (!selectedSubAgent) return;

    if (!newCustomPassword || newCustomPassword.trim().length < 4) {
      setModalError('पासवर्ड किमान ४ अक्षरांचा असणे आवश्यक आहे.');
      return;
    }

    setFormSubmitting(true);
    try {
      const res = await fetch(`/api/sub-agents/${selectedSubAgent.id}/reset-password`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ newPassword: newCustomPassword.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setIsResetPasswordModalOpen(false);
        setActionSuccessMessage(`@${selectedSubAgent.username} चा पासवर्ड बदलण्यात आला: ${newCustomPassword.trim()}`);
        setTimeout(() => setActionSuccessMessage(null), 6000);
      } else {
        setModalError(data.error || 'पासवर्ड रिसेट करण्यात अडचण आली.');
      }
    } catch (err: any) {
      console.error(err);
      setModalError(err?.message || 'Error resetting password.');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleToggleStatus = async (agent: SubAgentUserSummary) => {
    const nextStatus = agent.status === 'active' ? 'disabled' : 'active';
    try {
      const res = await fetch(`/api/sub-agents/${agent.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.ok) {
        setSubAgents((prev) =>
          prev.map((a) => (a.id === agent.id ? { ...a, status: nextStatus } : a))
        );
        setActionSuccessMessage(`सब-एजंट @${agent.username} चे खाते ${nextStatus === 'active' ? 'सुरू (Active)' : 'बंद (Disabled)'} करण्यात आले.`);
        setTimeout(() => setActionSuccessMessage(null), 4000);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenDelete = (agent: SubAgentUserSummary) => {
    setDeletingSubAgent(agent);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deletingSubAgent) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/sub-agents/${deletingSubAgent.id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (res.ok) {
        setIsDeleteModalOpen(false);
        setSubAgents((prev) => prev.filter((a) => a.id !== deletingSubAgent.id));
        setActionSuccessMessage(`सब-एजंट @${deletingSubAgent.username} (${deletingSubAgent.name}) चे खाते डिलीट करण्यात आले.`);
        setTimeout(() => setActionSuccessMessage(null), 5000);
        setDeletingSubAgent(null);
      } else {
        alert(data.error || 'सब-एजंट डिलीट करण्यात त्रुटी आली.');
      }
    } catch (err) {
      console.error(err);
      alert('सब-एजंट डिलीट करण्यात त्रुटी आली.');
    } finally {
      setIsDeleting(false);
    }
  };

  // Filtered List
  const filteredSubAgents = subAgents.filter((agent) => {
    const matchesSearch =
      agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.mobile.includes(searchQuery);
    const matchesStatus =
      statusFilter === 'all' ? true : agent.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // KPI Calculations
  const totalSubAgentsCount = subAgents.length;
  const activeSubAgentsCount = subAgents.filter((a) => a.status === 'active').length;
  const totalRegistrations = subAgents.reduce((acc, a) => acc + (a.stats?.totalRegistrations || 0), 0);
  const totalRenewals = subAgents.reduce((acc, a) => acc + (a.stats?.totalRenewals || 0), 0);
  const totalClaims = subAgents.reduce((acc, a) => acc + (a.stats?.totalClaims || 0), 0);
  const totalEntries = totalRegistrations + totalRenewals + totalClaims;
  const totalFeesCollected = subAgents.reduce((acc, a) => acc + (a.stats?.totalCollection || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white shadow-lg">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-sky-300 uppercase tracking-wider mb-1">
            <Sparkles className="w-4 h-4" />
            <span>Admin Control Panel</span>
          </div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">
            Sub-Agent Management (सब-एजंट व्यवस्थापन)
          </h1>
          <p className="text-xs md:text-sm text-blue-200/80 mt-0.5">
            Create, manage accounts, reset passwords, and monitor worker registration & renewal output from Sub-Agents.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={loadSubAgents}
            className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-all text-xs flex items-center gap-1.5 cursor-pointer"
            title="Refresh List"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            type="button"
            onClick={handleOpenAdd}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-sky-400 to-blue-500 hover:from-sky-300 hover:to-blue-400 text-blue-950 font-bold text-xs shadow-md transition-all flex items-center gap-2 active:scale-95 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>New Sub-Agent (नवीन सब-एजंट)</span>
          </button>
        </div>
      </div>

      {/* Main Tab Navigation inside Sub-Agent Management */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-2 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveMainTab('accounts')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeMainTab === 'accounts'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Sub-Agent Accounts (खाती व यादी)</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                activeMainTab === 'accounts'
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-200 text-slate-700'
              }`}
            >
              {subAgents.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setEntriesSubAgentFilter('all');
              setActiveMainTab('entries');
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeMainTab === 'entries'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Sub-Agent Entries (सब-एजंट नोंदी)</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                activeMainTab === 'entries'
                  ? 'bg-white/20 text-white'
                  : 'bg-blue-100 text-blue-800'
              }`}
            >
              {totalEntries}
            </span>
          </button>
        </div>

        {activeMainTab === 'entries' && entriesSubAgentFilter !== 'all' && (
          <div className="flex items-center gap-2 px-3 py-1 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 font-medium">
            <span>Filtered for:</span>
            <strong className="font-bold">
              {subAgents.find((a) => a.id === entriesSubAgentFilter)?.name || `@${entriesSubAgentFilter}`}
            </strong>
            <button
              type="button"
              onClick={() => setEntriesSubAgentFilter('all')}
              className="text-amber-700 hover:text-amber-950 font-bold ml-1 cursor-pointer underline text-[11px]"
            >
              Show All
            </button>
          </div>
        )}
      </div>

      {/* TAB 2: Sub-Agent Entries View */}
      {activeMainTab === 'entries' && (
        <div className="animate-fade-in">
          <SubAgentEntriesModule
            currentUser={currentUser}
            initialSubAgentFilter={entriesSubAgentFilter}
            onOpenPrintSlip={onOpenPrintSlip}
          />
        </div>
      )}

      {/* TAB 1: Sub-Agent Accounts Directory View */}
      {activeMainTab === 'accounts' && (
        <div className="space-y-6 animate-fade-in">
          {/* Success Notification Alert */}
          {actionSuccessMessage && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-semibold flex items-center gap-2 shadow-sm animate-fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{actionSuccessMessage}</span>
            </div>
          )}

          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Total Sub-Agents
              </div>
              <div className="text-2xl font-black text-slate-900">{totalSubAgentsCount}</div>
              <div className="text-[10px] text-emerald-600 font-semibold mt-1 flex items-center gap-1">
                <UserCheck className="w-3 h-3" /> {activeSubAgentsCount} Active
              </div>
            </div>

            <div
              onClick={() => {
                setEntriesSubAgentFilter('all');
                setActiveMainTab('entries');
              }}
              className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm hover:border-blue-300 hover:bg-blue-50/20 cursor-pointer transition-all"
              title="Click to view all Sub-Agent entries"
            >
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Total Entries
              </div>
              <div className="text-2xl font-black text-blue-700">{totalEntries}</div>
              <div className="text-[10px] text-blue-600 font-semibold mt-1 flex items-center gap-1">
                <span>View Entries</span>
                <ChevronRight className="w-3 h-3" />
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Registrations
              </div>
              <div className="text-2xl font-black text-purple-700">{totalRegistrations}</div>
              <div className="text-[10px] text-purple-600 font-semibold mt-1">नवीन कामगार नोंदणी</div>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Renewals
              </div>
              <div className="text-2xl font-black text-indigo-700">{totalRenewals}</div>
              <div className="text-[10px] text-indigo-600 font-semibold mt-1">नूतनीकरण नोंदी</div>
            </div>

            <div className="p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                Claims
              </div>
              <div className="text-2xl font-black text-amber-700">{totalClaims}</div>
              <div className="text-[10px] text-amber-600 font-semibold mt-1">योजना क्लेम नोंदी</div>
            </div>
          </div>

          {/* Filter & Search Bar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 rounded-2xl bg-white border border-slate-200/80 shadow-sm">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search sub-agent name, username, or mobile..."
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 focus:bg-white focus:border-blue-600 outline-none"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl text-xs">
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                    statusFilter === 'all'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All ({subAgents.length})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('active')}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                    statusFilter === 'active'
                      ? 'bg-white text-emerald-700 shadow-xs'
                      : 'text-slate-600 hover:text-emerald-700'
                  }`}
                >
                  Active ({activeSubAgentsCount})
                </button>
                <button
                  type="button"
                  onClick={() => setStatusFilter('disabled')}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                    statusFilter === 'disabled'
                      ? 'bg-white text-rose-700 shadow-xs'
                      : 'text-slate-600 hover:text-rose-700'
                  }`}
                >
                  Disabled ({subAgents.length - activeSubAgentsCount})
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  setEntriesSubAgentFilter('all');
                  setActiveMainTab('entries');
                }}
                className="px-3 py-2 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs border border-blue-200 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>All Sub-Agent Entries</span>
              </button>
            </div>
          </div>

      {/* Sub-Agents Grid / Cards */}
      {loading ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200/80">
          <RefreshCw className="w-6 h-6 text-blue-600 animate-spin mx-auto mb-2" />
          <div className="text-xs font-semibold text-slate-600">Loading Sub-Agent directory...</div>
        </div>
      ) : filteredSubAgents.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200/80">
          <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <div className="text-sm font-bold text-slate-700">No Sub-Agents Found</div>
          <p className="text-xs text-slate-500 mt-1">
            {searchQuery
              ? 'No sub-agents match your search term.'
              : 'You have not added any Sub-Agent accounts yet.'}
          </p>
          {!searchQuery && (
            <button
              type="button"
              onClick={handleOpenAdd}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-500 transition-all inline-flex items-center gap-1.5"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Create First Sub-Agent</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSubAgents.map((agent) => {
            const stats = agent.stats || {
              totalRegistrations: 0,
              totalRenewals: 0,
              totalClaims: 0,
              totalEntries: 0,
              pendingEntries: 0,
              approvedEntries: 0,
              rejectedEntries: 0,
              todayRegistrations: 0,
              todayRenewals: 0,
              todayClaims: 0,
              todayEntries: 0,
              totalCollection: 0,
              todayCollection: 0,
            };

            return (
              <div
                key={agent.id}
                className={`p-4 rounded-2xl bg-white border transition-all duration-200 shadow-sm hover:shadow-md flex flex-col justify-between ${
                  agent.status === 'active' ? 'border-slate-200/90' : 'border-rose-200 bg-rose-50/20'
                }`}
              >
                <div>
                  {/* Card Header: Avatar, Name, Status */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-700 text-white flex items-center justify-center font-bold text-sm shadow-sm shrink-0">
                        {agent.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-slate-900 leading-tight">
                          {agent.name}
                        </h3>
                        <div className="text-xs text-slate-500 font-mono flex items-center gap-1">
                          <span>@{agent.username}</span>
                          <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            Sub-Agent
                          </span>
                        </div>
                      </div>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        agent.status === 'active'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}
                    >
                      {agent.status}
                    </span>
                  </div>

                  {/* Contact Info */}
                  <div className="mt-3.5 space-y-1 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                    <div className="flex items-center gap-2">
                      <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="font-mono text-slate-800 font-medium">{agent.mobile}</span>
                    </div>
                    {agent.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate text-slate-700">{agent.email}</span>
                      </div>
                    )}
                  </div>

                  {/* Quick Metrics Breakdown */}
                  <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
                    <div className="p-2 rounded-xl bg-purple-50/60 border border-purple-100">
                      <div className="text-[10px] font-bold text-purple-700">Regs (नोंदणी)</div>
                      <div className="text-base font-black text-purple-900">{stats.totalRegistrations}</div>
                    </div>
                    <div className="p-2 rounded-xl bg-indigo-50/60 border border-indigo-100">
                      <div className="text-[10px] font-bold text-indigo-700">Renewals</div>
                      <div className="text-base font-black text-indigo-900">{stats.totalRenewals}</div>
                    </div>
                    <div className="p-2 rounded-xl bg-amber-50/60 border border-amber-100">
                      <div className="text-[10px] font-bold text-amber-700">Claims</div>
                      <div className="text-base font-black text-amber-900">{stats.totalClaims}</div>
                    </div>
                  </div>

                  {/* Summary Bar */}
                  <div className="mt-2.5 flex items-center justify-between text-[11px] font-medium text-slate-600 px-1">
                    <span>
                      Total Entries: <strong className="text-slate-900 font-bold">{stats.totalEntries}</strong>
                    </span>
                    <span>
                      Collection: <strong className="text-emerald-700 font-bold">₹{stats.totalCollection || 0}</strong>
                    </span>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setEntriesSubAgentFilter(agent.id);
                      setActiveMainTab('entries');
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold text-xs transition-colors flex items-center gap-1 cursor-pointer"
                    title="View all records submitted by this sub-agent"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>View Entries</span>
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleOpenStatsModal(agent)}
                      className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 transition-colors cursor-pointer"
                      title="View Detailed Analytics & Performance"
                    >
                      <TrendingUp className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenResetPassword(agent)}
                      className="p-1.5 rounded-lg bg-slate-50 hover:bg-amber-50 text-amber-700 border border-slate-200 transition-colors cursor-pointer"
                      title="Reset Sub-Agent Password"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenEdit(agent)}
                      className="p-1.5 rounded-lg bg-slate-50 hover:bg-blue-50 text-blue-700 border border-slate-200 transition-colors cursor-pointer"
                      title="Edit Sub-Agent Details"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleStatus(agent)}
                      className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                        agent.status === 'active'
                          ? 'bg-slate-50 hover:bg-rose-50 text-rose-600 border-slate-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                      }`}
                      title={agent.status === 'active' ? 'Disable Account' : 'Enable Account'}
                    >
                      {agent.status === 'active' ? (
                        <UserX className="w-3.5 h-3.5" />
                      ) : (
                        <UserCheck className="w-3.5 h-3.5" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenDelete(agent)}
                      className="p-1.5 rounded-lg bg-slate-50 hover:bg-rose-100 text-rose-600 hover:text-rose-700 border border-slate-200 hover:border-rose-300 transition-colors cursor-pointer"
                      title="Delete Sub-Agent Account (सब-एजंट डिलीट करा)"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
        </div>
      )}

      {/* MODAL 1: Add New Sub-Agent */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 bg-gradient-to-r from-blue-900 to-indigo-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-sky-400" />
                <h2 className="text-sm font-bold">Add New Sub-Agent (नवीन सब-एजंट)</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-white/70 hover:text-white text-lg font-bold px-2 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="p-5 space-y-4">
              {modalError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center justify-between gap-2">
                  <span>{modalError}</span>
                  <button type="button" onClick={() => setModalError(null)} className="text-rose-500 hover:text-rose-800 font-bold">✕</button>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Sub-Agent Full Name (पूर्ण नाव) *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => {
                    setFormData({ ...formData, name: e.target.value });
                    if (modalError) setModalError(null);
                  }}
                  placeholder="e.g. Rahul Sharma"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:bg-white focus:border-blue-600 outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Username (लॉगिन नाव) *
                  </label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => {
                      setFormData({ ...formData, username: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') });
                      if (modalError) setModalError(null);
                    }}
                    placeholder="e.g. rahul_agent"
                    className={`w-full px-3 py-2 rounded-xl bg-slate-50 border text-xs text-slate-900 font-mono focus:bg-white outline-none ${
                      formData.username && (['om', 'admin', 'omkar'].includes(formData.username) || subAgents.some(a => a.username.toLowerCase() === formData.username.toLowerCase()))
                        ? 'border-rose-400 bg-rose-50/50 focus:border-rose-600'
                        : 'border-slate-300 focus:border-blue-600'
                    }`}
                    required
                  />
                  {formData.username && (['om', 'admin', 'omkar'].includes(formData.username) || subAgents.some(a => a.username.toLowerCase() === formData.username.toLowerCase())) && (
                    <p className="text-[10px] text-rose-600 font-semibold mt-1">
                      ⚠️ हे युझरनेम आधीपासूनच वापरात आहे (Already taken)
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Mobile Number (मोबाईल) *
                  </label>
                  <input
                    type="text"
                    value={formData.mobile}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                      setFormData({ ...formData, mobile: val });
                      if (modalError) setModalError(null);
                    }}
                    placeholder="10 digit number"
                    className={`w-full px-3 py-2 rounded-xl bg-slate-50 border text-xs text-slate-900 font-mono focus:bg-white outline-none ${
                      formData.mobile && formData.mobile.length === 10 && subAgents.some(a => a.mobile === formData.mobile)
                        ? 'border-amber-400 bg-amber-50/50 focus:border-amber-600'
                        : 'border-slate-300 focus:border-blue-600'
                    }`}
                    required
                  />
                  {formData.mobile && formData.mobile.length === 10 && subAgents.some(a => a.mobile === formData.mobile) && (
                    <p className="text-[10px] text-amber-600 font-semibold mt-1">
                      ⚠️ हा नंबर आधीच नोंदणीकृत आहे (Already registered)
                    </p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Email Address (पर्यायी ईमेल)
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => {
                    setFormData({ ...formData, email: e.target.value });
                    if (modalError) setModalError(null);
                  }}
                  placeholder="agent@example.com"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:bg-white focus:border-blue-600 outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700">
                    Password (पासवर्ड)
                  </label>
                  {formData.username && (
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, password: `${formData.username}123` })}
                      className="text-[10px] text-blue-600 font-bold hover:underline"
                    >
                      Set as {formData.username}123
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  value={formData.password}
                  onChange={(e) => {
                    setFormData({ ...formData, password: e.target.value });
                    if (modalError) setModalError(null);
                  }}
                  placeholder={formData.username ? `${formData.username}123` : 'Default: username123'}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 font-mono focus:bg-white focus:border-blue-600 outline-none"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Leave blank to automatically use{' '}
                  <code className="bg-slate-100 px-1 py-0.5 rounded font-bold">
                    {formData.username || 'username'}123
                  </code>
                </p>
              </div>

              <div className="p-3 bg-blue-50/70 rounded-xl border border-blue-200 text-xs text-blue-800 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-blue-600" />
                  <span>Sub-Agent Scope & Permissions</span>
                </div>
                <p className="text-[11px] text-blue-700">
                  Sub-agents can create registrations, renewals, and claims. They will ONLY see their own submitted entries. They cannot access system settings or other agents&apos; records.
                </p>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-sm transition-all"
                >
                  {formSubmitting ? 'Creating...' : 'Create Sub-Agent Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Edit Sub-Agent */}
      {isEditModalOpen && selectedSubAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 bg-gradient-to-r from-blue-900 to-indigo-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-sky-400" />
                <h2 className="text-sm font-bold">Edit Sub-Agent ({selectedSubAgent.username})</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="text-white/70 hover:text-white text-lg font-bold px-2 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-5 space-y-4">
              {modalError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center justify-between gap-2">
                  <span>{modalError}</span>
                  <button type="button" onClick={() => setModalError(null)} className="text-rose-500 hover:text-rose-800 font-bold">✕</button>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Full Name (पूर्ण नाव) *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => {
                    setFormData({ ...formData, name: e.target.value });
                    if (modalError) setModalError(null);
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:bg-white focus:border-blue-600 outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Mobile Number *
                  </label>
                  <input
                    type="text"
                    value={formData.mobile}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 10);
                      setFormData({ ...formData, mobile: val });
                      if (modalError) setModalError(null);
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 font-mono focus:bg-white focus:border-blue-600 outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Account Status
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:bg-white focus:border-blue-600 outline-none"
                  >
                    <option value="active">Active (सक्रिय)</option>
                    <option value="disabled">Disabled (बंद)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => {
                    setFormData({ ...formData, email: e.target.value });
                    if (modalError) setModalError(null);
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:bg-white focus:border-blue-600 outline-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-sm transition-all"
                >
                  {formSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Reset Password */}
      {isResetPasswordModalOpen && selectedSubAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 bg-gradient-to-r from-amber-600 to-orange-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-amber-200" />
                <h2 className="text-sm font-bold">Reset Password (@{selectedSubAgent.username})</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsResetPasswordModalOpen(false)}
                className="text-white/70 hover:text-white text-lg font-bold px-2 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleResetPasswordSubmit} className="p-5 space-y-4">
              {modalError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center justify-between gap-2">
                  <span>{modalError}</span>
                  <button type="button" onClick={() => setModalError(null)} className="text-rose-500 hover:text-rose-800 font-bold">✕</button>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  New Password (नवीन पासवर्ड)
                </label>
                <input
                  type="text"
                  value={newCustomPassword}
                  onChange={(e) => {
                    setNewCustomPassword(e.target.value);
                    if (modalError) setModalError(null);
                  }}
                  placeholder="Enter new password"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 font-mono focus:bg-white focus:border-amber-600 outline-none"
                  required
                />
              </div>

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900">
                <p className="font-medium">
                  Provide this new password to Sub-Agent <strong>{selectedSubAgent.name}</strong> so they can log in.
                </p>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsResetPasswordModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs shadow-sm transition-all"
                >
                  {formSubmitting ? 'Updating...' : 'Set Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Detailed Performance & Stats */}
      {isStatsModalOpen && selectedSubAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 bg-gradient-to-r from-blue-900 to-indigo-900 text-white flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-sky-400" />
                  <span>Performance Stats: {selectedSubAgent.name}</span>
                </h2>
                <div className="text-xs text-blue-200 font-mono">@{selectedSubAgent.username} • Mobile: {selectedSubAgent.mobile}</div>
              </div>
              <button
                type="button"
                onClick={() => setIsStatsModalOpen(false)}
                className="text-white/70 hover:text-white text-lg font-bold px-2 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              {/* Overall Totals */}
              <div>
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Overall Lifetime Submission Metrics
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="p-3 rounded-xl bg-purple-50 border border-purple-100 text-center">
                    <div className="text-[10px] font-bold text-purple-700">Registrations</div>
                    <div className="text-xl font-black text-purple-900">{selectedSubAgent.stats?.totalRegistrations || 0}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-100 text-center">
                    <div className="text-[10px] font-bold text-indigo-700">Renewals</div>
                    <div className="text-xl font-black text-indigo-900">{selectedSubAgent.stats?.totalRenewals || 0}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-100 text-center">
                    <div className="text-[10px] font-bold text-amber-700">Claims</div>
                    <div className="text-xl font-black text-amber-900">{selectedSubAgent.stats?.totalClaims || 0}</div>
                  </div>
                  <div className="p-3 rounded-xl bg-blue-50 border border-blue-100 text-center">
                    <div className="text-[10px] font-bold text-blue-700">Total Entries</div>
                    <div className="text-xl font-black text-blue-900">{selectedSubAgent.stats?.totalEntries || 0}</div>
                  </div>
                </div>
              </div>

              {/* Today & Monthly Breakdown */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-2">
                    <Clock className="w-3.5 h-3.5 text-blue-600" />
                    <span>Today&apos;s Output (आजची कामगिरी)</span>
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between text-slate-600">
                      <span>Registrations:</span>
                      <strong className="text-slate-900">{selectedSubAgent.stats?.todayRegistrations || 0}</strong>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Renewals:</span>
                      <strong className="text-slate-900">{selectedSubAgent.stats?.todayRenewals || 0}</strong>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Claims:</span>
                      <strong className="text-slate-900">{selectedSubAgent.stats?.todayClaims || 0}</strong>
                    </div>
                    <div className="pt-1.5 border-t border-slate-200 flex justify-between font-bold text-blue-800">
                      <span>Today Entries:</span>
                      <span>{selectedSubAgent.stats?.todayEntries || 0}</span>
                    </div>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mb-2">
                    <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Monthly & Financial (चालू महिना)</span>
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between text-slate-600">
                      <span>Month Entries:</span>
                      <strong className="text-slate-900">{selectedSubAgent.stats?.monthEntries || 0}</strong>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Today Collection:</span>
                      <strong className="text-emerald-700">₹{selectedSubAgent.stats?.todayCollection || 0}</strong>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>Total Collection:</span>
                      <strong className="text-emerald-700">₹{selectedSubAgent.stats?.totalCollection || 0}</strong>
                    </div>
                    <div className="pt-1.5 border-t border-slate-200 flex justify-between text-slate-500 text-[10px]">
                      <span>Account Created:</span>
                      <span>{selectedSubAgent.createdAt ? new Date(selectedSubAgent.createdAt).toLocaleDateString('en-IN') : 'N/A'}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Status breakdown */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-xs font-bold text-slate-700 mb-2">Approval Status Breakdown</div>
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="p-2 rounded-lg bg-amber-50 text-amber-800 border border-amber-200">
                    <div className="text-[10px] font-bold">Pending</div>
                    <div className="text-base font-bold">{selectedSubAgent.stats?.pendingEntries || 0}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200">
                    <div className="text-[10px] font-bold">Approved / Active</div>
                    <div className="text-base font-bold">{selectedSubAgent.stats?.approvedEntries || 0}</div>
                  </div>
                  <div className="p-2 rounded-lg bg-rose-50 text-rose-800 border border-rose-200">
                    <div className="text-[10px] font-bold">Rejected</div>
                    <div className="text-base font-bold">{selectedSubAgent.stats?.rejectedEntries || 0}</div>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setIsStatsModalOpen(false);
                    setEntriesSubAgentFilter(selectedSubAgent.id);
                    setActiveMainTab('entries');
                  }}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>View All Submitted Entries</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsStatsModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: Delete Sub-Agent Confirmation */}
      {isDeleteModalOpen && deletingSubAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 bg-gradient-to-r from-rose-800 to-rose-950 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-rose-700 flex items-center justify-center text-white">
                  <Trash2 className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold">Delete Sub-Agent (सब-एजंट डिलीट करा)</h2>
                  <p className="text-[10px] text-rose-200">कायमस्वरूपी खाते हटवा (Permanent Removal)</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!isDeleting) {
                    setIsDeleteModalOpen(false);
                    setDeletingSubAgent(null);
                  }
                }}
                className="text-white/70 hover:text-white text-lg font-bold px-2 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="p-4 rounded-xl bg-rose-50 border border-rose-200">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-rose-900 leading-relaxed">
                    <p className="font-bold mb-1">
                      तुम्हाला हा सब-एजंट खरोखर डिलीट करायचा आहे का?
                    </p>
                    <p className="text-rose-700">
                      हे खाते हटवल्यानंतर हा सब-एजंट प्रणालीमध्ये पुन्हा लॉगिन करू शकणार नाही.
                    </p>
                  </div>
                </div>
              </div>

              {/* Sub-Agent Details Card */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                <div className="flex justify-between items-center py-1 border-b border-slate-200/80">
                  <span className="text-slate-500">Name (नाव):</span>
                  <span className="font-bold text-slate-800">{deletingSubAgent.name}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-200/80">
                  <span className="text-slate-500">Username (युझरनेम):</span>
                  <span className="font-mono font-bold text-blue-700">@{deletingSubAgent.username}</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-200/80">
                  <span className="text-slate-500">Mobile (मोबाईल):</span>
                  <span className="font-mono text-slate-700">{deletingSubAgent.mobile}</span>
                </div>
                <div className="flex justify-between items-center py-1">
                  <span className="text-slate-500">Total Entries (नोंदी):</span>
                  <span className="font-bold text-slate-900">{deletingSubAgent.stats?.totalEntries || 0}</span>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => {
                    setIsDeleteModalOpen(false);
                    setDeletingSubAgent(null);
                  }}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-100 cursor-pointer disabled:opacity-50"
                >
                  रद्द करा (Cancel)
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleConfirmDelete}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isDeleting ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>हटवत आहे...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>होय, डिलीट करा (Delete)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
