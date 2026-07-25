import React, { useState } from 'react';
import {
  Award,
  Search,
  PlusCircle,
  Download,
  Printer,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  X,
  FileText,
  Filter,
  DollarSign,
  UserCheck,
  Building2,
  Edit,
} from 'lucide-react';
import { WorkerClaim, WorkerRegistration, Scheme, User } from '../types';
import { SCHEMES_LIST, MAHARASHTRA_TALUKAS } from '../data/mockData';

interface ClaimModuleProps {
  claims?: WorkerClaim[];
  registrations?: WorkerRegistration[];
  schemes?: Scheme[];
  currentUser?: User;
  onAddClaim?: (claim: Omit<WorkerClaim, 'id'>) => Promise<void>;
  onUpdateClaimStatus?: (id: string, status: WorkerClaim['status'], remarks?: string) => Promise<void>;
  onOpenPrintSlip?: (type: 'claim', data: any) => void;
  onResetClaims?: () => void;
}

export const ClaimModule: React.FC<ClaimModuleProps> = ({
  claims = [],
  registrations = [],
  schemes = SCHEMES_LIST,
  currentUser,
  onAddClaim,
  onUpdateClaimStatus,
  onOpenPrintSlip,
  onResetClaims,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingClaim, setEditingClaim] = useState<WorkerClaim | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Form State for new claim
  const [selectedMhNumber, setSelectedMhNumber] = useState('');
  const [workerName, setWorkerName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [taluka, setTaluka] = useState(MAHARASHTRA_TALUKAS[0] || 'Haveli');
  const [scheme1Id, setScheme1Id] = useState(schemes[0]?.id || '');
  const [scheme2Id, setScheme2Id] = useState('');
  const [remarks, setRemarks] = useState('');

  // Status edit state
  const [editStatus, setEditStatus] = useState<WorkerClaim['status']>('Submitted');
  const [editRemarks, setEditRemarks] = useState('');

  // Auto-fill worker details when MH number changes or worker selected
  const handleWorkerSelect = (mh: string) => {
    setSelectedMhNumber(mh);
    const reg = registrations.find(
      (r) => r.mhNumber.toLowerCase() === mh.toLowerCase() || r.id === mh
    );
    if (reg) {
      setWorkerName(reg.workerName);
      setMobileNumber(reg.mobileNumber);
      if (reg.taluka) setTaluka(reg.taluka);
    }
  };

  const scheme1 = schemes.find((s) => s.id === scheme1Id);
  const scheme2 = schemes.find((s) => s.id === scheme2Id);
  const scheme1Amount = scheme1 ? scheme1.amount : 0;
  const scheme2Amount = scheme2 ? scheme2.amount : 0;
  const totalAmount = scheme1Amount + scheme2Amount;

  const handleSubmitNewClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMhNumber || !workerName || !scheme1Id) {
      alert('कृपया कामगार MH नंबर, नाव आणि किमान एक योजना निवडा.');
      return;
    }

    if (!onAddClaim) return;

    setSubmitting(true);
    try {
      await onAddClaim({
        mhNumber: selectedMhNumber.toUpperCase(),
        workerName: workerName.trim(),
        mobileNumber: mobileNumber.trim(),
        taluka: taluka,
        scheme1Id: scheme1?.id || scheme1Id,
        scheme1Name: scheme1?.name || 'Selected Scheme 1',
        scheme1Amount: scheme1Amount,
        scheme2Id: scheme2 ? scheme2.id : undefined,
        scheme2Name: scheme2 ? scheme2.name : undefined,
        scheme2Amount: scheme2Amount > 0 ? scheme2Amount : undefined,
        totalAmount: totalAmount,
        operatorName: currentUser?.name || 'Operator',
        status: 'Submitted',
        remarks: remarks.trim() || 'Claim application submitted.',
        claimDate: new Date().toISOString().split('T')[0],
      });

      setIsAddModalOpen(false);
      // Reset form
      setSelectedMhNumber('');
      setWorkerName('');
      setMobileNumber('');
      setRemarks('');
    } catch (err: any) {
      alert(err.message || 'Error submitting claim.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateStatusSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClaim || !onUpdateClaimStatus) return;

    setSubmitting(true);
    try {
      await onUpdateClaimStatus(editingClaim.id, editStatus, editRemarks);
      setEditingClaim(null);
    } catch (err: any) {
      alert(err.message || 'Error updating claim status.');
    } finally {
      setSubmitting(false);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    if (!claims.length) return;
    const headers = ['Claim ID', 'MH Number', 'Worker Name', 'Mobile', 'Taluka', 'Scheme 1', 'Scheme 2', 'Total Amount', 'Status', 'Claim Date', 'Operator'];
    const rows = filteredClaims.map((c) => [
      c.id,
      c.mhNumber,
      `"${c.workerName}"`,
      c.mobileNumber,
      c.taluka,
      `"${c.scheme1Name}"`,
      `"${c.scheme2Name || ''}"`,
      c.totalAmount,
      c.status,
      c.claimDate,
      `"${c.operatorName}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `MBOCWW_Claims_Export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtering
  const filteredClaims = claims.filter((c) => {
    const matchesSearch =
      c.workerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.mhNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.mobileNumber.includes(searchTerm);

    const matchesStatus = statusFilter === 'All' || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: WorkerClaim['status']) => {
    switch (status) {
      case 'Approved':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'Disbursed':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'Under Scrutiny':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'Rejected':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-300';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-black text-slate-900 tracking-tight">
              Welfare Scheme Claim Management (योजना क्लेम व्यवस्थापन)
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200">
              {claims.length} Records
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            Process MBOCWW welfare scheme benefit claims, scrutinize documents, approve grants, and print disbursal slips.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="py-2.5 px-4 rounded-xl brand-gradient text-white font-bold text-xs shadow-md flex items-center gap-2 hover:opacity-95 transition-all cursor-pointer active:scale-95"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Apply Scheme Claim (नवीन क्लेम नोंदवा)</span>
          </button>

          {(currentUser?.role === 'admin' || currentUser?.permissions?.canExport) && (
            <button
              onClick={handleExportCSV}
              className="py-2.5 px-3.5 rounded-xl bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
            >
              <Download className="w-4 h-4 text-blue-700" />
              <span>Export CSV</span>
            </button>
          )}

          {currentUser?.role === 'admin' && onResetClaims && claims.length > 0 && (
            <button
              onClick={onResetClaims}
              className="py-2.5 px-3.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
              title="Reset all claims"
            >
              <Trash2 className="w-4 h-4 text-rose-600" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Status Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
          {['All', 'Submitted', 'Under Scrutiny', 'Approved', 'Disbursed', 'Rejected'].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                statusFilter === status
                  ? 'bg-blue-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {status}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search Worker, MH No, Claim ID..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:bg-white focus:border-blue-600"
          />
        </div>
      </div>

      {/* Claims List Table */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="px-4 py-3.5">Claim ID & Date</th>
                <th className="px-4 py-3.5">Worker & MH Number</th>
                <th className="px-4 py-3.5">Assigned Schemes</th>
                <th className="px-4 py-3.5">Benefit Amount</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {filteredClaims.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-slate-400">
                    <FileText className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                    <p className="font-semibold text-sm">कोणत्याही क्लेम नोंदी आढळल्या नाहीत.</p>
                    <p className="text-xs">No welfare claim records found matching criteria.</p>
                  </td>
                </tr>
              ) : (
                filteredClaims.map((claim) => (
                  <tr key={claim.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3.5">
                      <div className="font-bold text-slate-900">{claim.id}</div>
                      <div className="text-[11px] text-slate-500">{claim.claimDate}</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-bold text-slate-900">{claim.workerName}</div>
                      <div className="text-[11px] font-mono text-blue-700 font-semibold">{claim.mhNumber}</div>
                      <div className="text-[10px] text-slate-500">{claim.taluka} • 📱 {claim.mobileNumber}</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-slate-800">{claim.scheme1Name}</div>
                      {claim.scheme2Name && (
                        <div className="text-[11px] text-slate-500 mt-0.5">+ {claim.scheme2Name}</div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 font-bold text-emerald-700 text-sm">
                      ₹{claim.totalAmount.toLocaleString('en-IN')}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold border ${getStatusBadge(claim.status)}`}>
                        {claim.status}
                      </span>
                      {claim.remarks && (
                        <div className="text-[10px] text-slate-500 mt-1 truncate max-w-[150px]" title={claim.remarks}>
                          {claim.remarks}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => {
                            setEditingClaim(claim);
                            setEditStatus(claim.status);
                            setEditRemarks(claim.remarks || '');
                          }}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-blue-100 text-blue-700 border border-slate-200 transition-colors cursor-pointer"
                          title="Update Claim Status"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>

                        {onOpenPrintSlip && (
                          <button
                            onClick={() => onOpenPrintSlip('claim', claim)}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-emerald-100 text-emerald-700 border border-slate-200 transition-colors cursor-pointer"
                            title="Print Claim Receipt Slip"
                          >
                            <Printer className="w-3.5 h-3.5" />
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

      {/* New Claim Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200/90 rounded-3xl max-w-xl w-full p-6 shadow-2xl relative text-slate-900 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setIsAddModalOpen(false)}
              className="absolute top-5 right-5 p-2 rounded-xl bg-slate-100 text-slate-500 hover:text-slate-900 border border-slate-200 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-1">
              <Award className="w-5 h-5 text-blue-700" />
              <h3 className="text-lg font-extrabold text-slate-900">
                New Welfare Scheme Claim Application
              </h3>
            </div>
            <p className="text-xs text-slate-500 mb-5 font-medium">
              Select worker registration details and choose applicable MBOCWW welfare schemes.
            </p>

            <form onSubmit={handleSubmitNewClaim} className="space-y-4">
              {/* Select Registered Worker */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Worker MH Registration Number / Select Registered Worker *
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={selectedMhNumber}
                    onChange={(e) => handleWorkerSelect(e.target.value)}
                    placeholder="Enter MH Number e.g. MH-12-2026-10492"
                    className="flex-1 px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 font-mono focus:bg-white focus:border-blue-600"
                    required
                  />
                  {registrations.length > 0 && (
                    <select
                      onChange={(e) => handleWorkerSelect(e.target.value)}
                      className="w-44 px-2 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-800"
                    >
                      <option value="">-- Choose Worker --</option>
                      {registrations.map((r) => (
                        <option key={r.id} value={r.mhNumber}>
                          {r.workerName} ({r.mhNumber})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Worker Full Name *
                  </label>
                  <input
                    type="text"
                    value={workerName}
                    onChange={(e) => setWorkerName(e.target.value)}
                    placeholder="कामगाराचे संपूर्ण नाव"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:bg-white focus:border-blue-600"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Mobile Number *
                  </label>
                  <input
                    type="text"
                    value={mobileNumber}
                    onChange={(e) => setMobileNumber(e.target.value)}
                    placeholder="10 digits"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 font-mono focus:bg-white focus:border-blue-600"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Taluka / Tehsil *
                </label>
                <select
                  value={taluka}
                  onChange={(e) => setTaluka(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900"
                >
                  {MAHARASHTRA_TALUKAS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              {/* Scheme 1 Selection */}
              <div className="p-3.5 rounded-2xl bg-blue-50/60 border border-blue-200/80 space-y-2">
                <label className="block text-xs font-extrabold text-blue-900">
                  Primary Scheme Selection (प्रमुख योजना 1) *
                </label>
                <select
                  value={scheme1Id}
                  onChange={(e) => setScheme1Id(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs text-slate-900 font-semibold"
                  required
                >
                  {schemes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} — ₹{s.amount.toLocaleString('en-IN')} ({s.category})
                    </option>
                  ))}
                </select>
                {scheme1 && (
                  <p className="text-[11px] text-blue-800 font-medium">
                    {scheme1.description}
                  </p>
                )}
              </div>

              {/* Scheme 2 Selection (Optional) */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <label className="block text-xs font-bold text-slate-800">
                  Secondary Scheme Selection (दुय्यम योजना 2 - ऐच्छिक)
                </label>
                <select
                  value={scheme2Id}
                  onChange={(e) => setScheme2Id(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs text-slate-900"
                >
                  <option value="">-- No Second Scheme --</option>
                  {schemes
                    .filter((s) => s.id !== scheme1Id)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} — ₹{s.amount.toLocaleString('en-IN')} ({s.category})
                      </option>
                    ))}
                </select>
              </div>

              {/* Total Calculation Card */}
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-emerald-800">Total Approved Benefit Grant Amount</span>
                  <p className="text-[11px] text-emerald-600">Calculated automatically based on selected welfare schemes.</p>
                </div>
                <div className="text-xl font-extrabold text-emerald-800">
                  ₹{totalAmount.toLocaleString('en-IN')}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Application Remarks / Notes
                </label>
                <textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="e.g. All certificates verified by operator."
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="py-2.5 px-5 rounded-xl brand-gradient text-white text-xs font-bold shadow-md hover:opacity-95 transition-all cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'Submitting Claim...' : 'Submit Claim Application'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Claim Status Modal */}
      {editingClaim && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200/90 rounded-3xl max-w-md w-full p-6 shadow-2xl relative text-slate-900">
            <button
              onClick={() => setEditingClaim(null)}
              className="absolute top-5 right-5 p-2 rounded-xl bg-slate-100 text-slate-500 hover:text-slate-900 border border-slate-200 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-slate-900 mb-1">
              Update Claim Status ({editingClaim.id})
            </h3>
            <p className="text-xs text-slate-500 mb-4 font-medium">
              Worker: <span className="font-bold text-slate-800">{editingClaim.workerName}</span> ({editingClaim.mhNumber})
            </p>

            <form onSubmit={handleUpdateStatusSubmit} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Claim Status *
                </label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value as WorkerClaim['status'])}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold text-slate-900"
                >
                  <option value="Submitted">Submitted (प्रस्ताव सादर केला)</option>
                  <option value="Under Scrutiny">Under Scrutiny (कागदपत्रे तपासणी सुरु)</option>
                  <option value="Approved">Approved (प्रस्ताव मंजूर झाला)</option>
                  <option value="Disbursed">Disbursed (रक्कम बँक खात्यावर जमा झाली)</option>
                  <option value="Rejected">Rejected (प्रस्ताव अमान्य झाला)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Status Update Remarks / Reason
                </label>
                <textarea
                  value={editRemarks}
                  onChange={(e) => setEditRemarks(e.target.value)}
                  placeholder="Enter remarks for worker..."
                  rows={3}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingClaim(null)}
                  className="py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="py-2.5 px-5 rounded-xl brand-gradient text-white text-xs font-bold shadow-md hover:opacity-95 transition-all cursor-pointer disabled:opacity-50"
                >
                  {submitting ? 'Updating...' : 'Save Claim Status'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
