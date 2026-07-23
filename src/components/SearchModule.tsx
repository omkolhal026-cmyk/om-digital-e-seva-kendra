import React, { useState } from 'react';
import { Search, UserCheck, Shield, Phone, CreditCard, Calendar, Award, RefreshCw, Eye, X, MapPin } from 'lucide-react';
import { WorkerRegistration, WorkerRenewal, WorkerClaim } from '../types';

interface SearchModuleProps {
  registrations: WorkerRegistration[];
  renewals: WorkerRenewal[];
  claims: WorkerClaim[];
  onOpenPrintSlip: (type: 'registration' | 'renewal' | 'claim', data: any) => void;
}

export const SearchModule: React.FC<SearchModuleProps> = ({
  registrations,
  renewals,
  claims,
  onOpenPrintSlip,
}) => {
  const [query, setQuery] = useState('');
  const [selectedWorker, setSelectedWorker] = useState<WorkerRegistration | null>(null);

  const filtered = registrations.filter((r) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (
      r.workerName.toLowerCase().includes(q) ||
      r.mhNumber.toLowerCase().includes(q) ||
      r.mobileNumber.includes(q) ||
      r.aadhaarNumber.replace(/\s/g, '').includes(q.replace(/\s/g, '')) ||
      r.id.toLowerCase().includes(q)
    );
  });

  // Find linked records for modal
  const workerRenewals = selectedWorker
    ? renewals.filter((ren) => ren.mhNumber === selectedWorker.mhNumber)
    : [];
  const workerClaims = selectedWorker
    ? claims.filter((clm) => clm.mhNumber === selectedWorker.mhNumber)
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs">
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2 mb-1">
          <Search className="w-5 h-5 text-blue-700" />
          <span>Universal MBOCWW Worker Search Engine</span>
        </h2>
        <p className="text-xs text-slate-500 font-medium">
          Search workers instantly by MH Registration Number, Aadhaar Card No, Mobile Number, or Full Name.
        </p>

        {/* Big Search Bar */}
        <div className="mt-4 relative">
          <Search className="w-5 h-5 absolute left-4 top-3.5 text-blue-700" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type MH Number (e.g. MH-12-2024-001001), Aadhaar Number, Mobile, or Name..."
            className="w-full pl-12 pr-4 py-3 rounded-2xl bg-slate-50 border border-slate-300 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white shadow-xs font-medium"
            autoFocus
          />
        </div>
      </div>

      {/* Results Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((worker) => (
          <div
            key={worker.id}
            onClick={() => setSelectedWorker(worker)}
            className="p-5 rounded-2xl bg-white border border-slate-200/90 hover:border-blue-600/50 cursor-pointer transition-all shadow-xs hover:shadow-md group relative overflow-hidden"
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-3">
                <img
                  src={
                    worker.documents?.photo && worker.documents.photo.trim() !== ''
                      ? worker.documents.photo
                      : 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80'
                  }
                  alt={worker.workerName}
                  referrerPolicy="no-referrer"
                  className="w-12 h-12 rounded-xl object-cover border border-slate-200 shadow-xs"
                />
                <div>
                  <h3 className="font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
                    {worker.workerName}
                  </h3>
                  <div className="text-[11px] font-bold text-blue-700 font-mono">
                    {worker.status === 'Active' && worker.mhNumber && !worker.mhNumber.startsWith('PENDING-')
                      ? worker.mhNumber
                      : 'Pending'}
                  </div>
                </div>
              </div>

              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                  worker.status === 'Active'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-amber-50 text-amber-800 border-amber-200'
                }`}
              >
                {worker.status}
              </span>
            </div>

            <div className="space-y-1.5 text-xs text-slate-700 pt-2 border-t border-slate-100 font-medium">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Mobile:</span>
                <span className="font-mono text-slate-900">{worker.mobileNumber}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Aadhaar:</span>
                <span className="font-mono text-slate-900">{worker.aadhaarNumber}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Taluka:</span>
                <span className="text-slate-900 font-bold">{worker.taluka}</span>
              </div>
            </div>

            <div className="mt-3 pt-2 flex items-center justify-between text-[11px] text-blue-700 font-bold">
              <span>View Full Worker Docket</span>
              <Eye className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="col-span-full p-12 text-center text-slate-500 bg-white rounded-2xl border border-slate-200/90 shadow-xs">
            No MBOCWW worker records match your search criteria.
          </div>
        )}
      </div>

      {/* Comprehensive Worker Docket Modal */}
      {selectedWorker && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200/90 rounded-3xl max-w-3xl w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto text-slate-900">
            <button
              onClick={() => setSelectedWorker(null)}
              className="absolute top-5 right-5 p-2 rounded-xl bg-slate-100 text-slate-500 hover:text-slate-900 border border-slate-200"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Header info */}
            <div className="flex items-center gap-4 mb-6 pb-4 border-b border-slate-200">
              <img
                src={
                  selectedWorker.documents?.photo && selectedWorker.documents.photo.trim() !== ''
                    ? selectedWorker.documents.photo
                    : 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80'
                }
                alt={selectedWorker.workerName}
                referrerPolicy="no-referrer"
                className="w-16 h-16 rounded-2xl object-cover border-2 border-slate-200 shadow-xs"
              />
              <div>
                <h3 className="text-xl font-bold text-slate-900">{selectedWorker.workerName}</h3>
                <div className="text-xs font-bold text-blue-700 font-mono">
                  MH Registration No:{' '}
                  {selectedWorker.status === 'Active' && selectedWorker.mhNumber && !selectedWorker.mhNumber.startsWith('PENDING-')
                    ? selectedWorker.mhNumber
                    : 'Pending Verification'}
                </div>
                <div className="text-xs text-slate-500 font-medium mt-1">
                  Registration ID: {selectedWorker.id} • Registered on {selectedWorker.registrationDate}
                </div>
              </div>
            </div>

            {/* Grid details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs mb-6">
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-2 text-slate-800">
                <div className="font-bold text-blue-800 flex items-center gap-1.5 mb-2">
                  <UserCheck className="w-4 h-4" />
                  <span>Personal & Location Details</span>
                </div>
                <div><span className="text-slate-500 font-medium">Father/Husband:</span> <span className="font-semibold">{selectedWorker.fatherName}</span></div>
                <div><span className="text-slate-500 font-medium">DOB & Gender:</span> <span className="font-semibold">{selectedWorker.dob} ({selectedWorker.gender})</span></div>
                <div><span className="text-slate-500 font-medium">Mobile:</span> <span className="font-mono font-semibold">{selectedWorker.mobileNumber}</span></div>
                <div><span className="text-slate-500 font-medium">Aadhaar:</span> <span className="font-mono font-semibold">{selectedWorker.aadhaarNumber}</span></div>
                <div><span className="text-slate-500 font-medium">Address:</span> <span className="font-semibold">{selectedWorker.address}, {selectedWorker.village}</span></div>
                <div><span className="text-slate-500 font-medium">Taluka & District:</span> <span className="font-semibold">{selectedWorker.taluka}, {selectedWorker.district} - {selectedWorker.pincode}</span></div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-2 text-slate-800">
                <div className="font-bold text-emerald-800 flex items-center gap-1.5 mb-2">
                  <CreditCard className="w-4 h-4" />
                  <span>Bank & Verification Info</span>
                </div>
                <div><span className="text-slate-500 font-medium">Bank Name:</span> <span className="font-semibold">{selectedWorker.bankName}</span></div>
                <div><span className="text-slate-500 font-medium">Account No:</span> <span className="font-mono font-semibold">{selectedWorker.accountNumber}</span></div>
                <div><span className="text-slate-500 font-medium">IFSC Code:</span> <span className="font-mono font-semibold">{selectedWorker.ifsc}</span></div>
                <div><span className="text-slate-500 font-medium">Operator:</span> <span className="font-semibold">{selectedWorker.operatorName}</span></div>
                <div><span className="text-slate-500 font-medium">Status:</span> <span className="font-bold text-emerald-700">{selectedWorker.status}</span></div>
              </div>
            </div>

            {/* Linked Renewals */}
            <div className="mb-6 space-y-2">
              <h4 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-blue-700" />
                <span>Linked Registration Renewals ({workerRenewals.length})</span>
              </h4>
              {workerRenewals.length > 0 ? (
                <div className="space-y-2">
                  {workerRenewals.map((r) => (
                    <div
                      key={r.id}
                      className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-bold text-slate-900">{r.id} • {r.renewalPeriodYears} Year Renewal</div>
                        <div className="text-[10px] text-slate-500 font-medium">Valid Till: {r.validTill}</div>
                      </div>
                      <span className="px-2.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        ₹{r.feeAmount} Paid
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">No renewals processed yet for this worker.</p>
              )}
            </div>

            {/* Linked Claims */}
            <div className="mb-6 space-y-2">
              <h4 className="text-xs font-bold text-slate-900 flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-600" />
                <span>MBOCWW Scheme Claims ({workerClaims.length})</span>
              </h4>
              {workerClaims.length > 0 ? (
                <div className="space-y-2">
                  {workerClaims.map((c) => (
                    <div
                      key={c.id}
                      className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-bold text-slate-900">{c.scheme1Name}</div>
                        <div className="text-[10px] text-slate-500 font-medium">Claim ID: {c.id} • Status: {c.status}</div>
                      </div>
                      <span className="font-mono font-bold text-amber-800">
                        ₹{c.totalAmount.toLocaleString('en-IN')}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500">No scheme claim applications submitted yet.</p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                onClick={() => onOpenPrintSlip('registration', selectedWorker)}
                className="py-2 px-4 rounded-xl brand-gradient hover:opacity-95 text-white font-bold text-xs shadow-xs"
              >
                Print Worker Card / Slip
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
