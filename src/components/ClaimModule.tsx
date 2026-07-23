import React from 'react';
import { Award, Clock, Sparkles, AlertCircle } from 'lucide-react';
import { WorkerClaim, WorkerRegistration, Scheme, User } from '../types';

interface ClaimModuleProps {
  claims: WorkerClaim[];
  registrations: WorkerRegistration[];
  schemes: Scheme[];
  currentUser: User;
  onAddClaim: (claim: Omit<WorkerClaim, 'id'>) => Promise<void>;
  onUpdateClaimStatus: (id: string, status: WorkerClaim['status'], remarks?: string) => Promise<void>;
  onOpenPrintSlip: (type: 'claim', data: any) => void;
}

export const ClaimModule: React.FC<ClaimModuleProps> = () => {
  return (
    <div className="space-y-6 min-h-[70vh] flex flex-col items-center justify-center">
      <div className="bg-white border border-slate-200/90 rounded-3xl p-8 md:p-12 shadow-sm text-center max-w-xl w-full flex flex-col items-center">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-500/10 via-blue-500/10 to-indigo-500/10 border border-slate-200 flex items-center justify-center mb-6 shadow-inner relative">
          <Award className="w-10 h-10 text-blue-600" />
          <div className="absolute -top-1.5 -right-1.5 bg-amber-500 text-white rounded-full p-1 shadow-md">
            <Sparkles className="w-4 h-4" />
          </div>
        </div>

        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 mb-4">
          <Clock className="w-3.5 h-3.5" />
          <span>Feature Under Development</span>
        </span>

        <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 mb-3 tracking-tight">
          Claim Management Coming Soon
        </h2>

        <p className="text-sm text-slate-600 mb-6 leading-relaxed max-w-md">
          The Welfare Scheme Claim Management module is currently under active enhancement. Welfare assistance claim submissions, tracking, and disbursements will be available here shortly.
        </p>

        <div className="w-full bg-slate-50 border border-slate-200/80 rounded-2xl p-4 text-left flex items-start gap-3 text-xs text-slate-600">
          <AlertCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-slate-800">Note:</span> Worker Registration and Worker Renewal modules are fully active and operational.
          </div>
        </div>
      </div>
    </div>
  );
};
