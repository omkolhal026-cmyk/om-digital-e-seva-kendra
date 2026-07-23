import React, { useState } from 'react';
import { History, Search, Shield, Filter, Clock, FileText, Trash2 } from 'lucide-react';
import { ActivityLog } from '../types';

interface ActivityLogModuleProps {
  logs: ActivityLog[];
  onClearLogs?: () => void;
}

export const ActivityLogModule: React.FC<ActivityLogModuleProps> = ({ logs, onClearLogs }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.details.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.action.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesAction = !actionFilter || log.action === actionFilter;

    return matchesSearch && matchesAction;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2 mb-1">
            <History className="w-5 h-5 text-blue-700" />
            <span>System Security & Audit Activity Log</span>
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            Complete audit trail tracking logins, registration entries, renewals, claim approvals, and administrative actions
          </p>
        </div>

        {onClearLogs && (
          <button
            onClick={onClearLogs}
            className="flex items-center gap-2 px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition-all shadow-2xs hover:shadow-xs active:scale-95 cursor-pointer whitespace-nowrap self-start md:self-auto"
            title="Clear all activity log entries"
          >
            <Trash2 className="w-4 h-4 text-rose-600" />
            <span>लॉग स्पष्ट करा (Clear Logs)</span>
          </button>
        )}
      </div>

      {/* Filter Toolbar */}
      <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-2 relative">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search activity by Operator, detail text, or action..."
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-600 focus:bg-white"
          />
        </div>

        <div>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="w-full py-2 px-3 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-800 focus:outline-none focus:border-blue-600 focus:bg-white"
          >
            <option value="">All Action Types</option>
            <option value="LOGIN">LOGIN</option>
            <option value="LOGOUT">LOGOUT</option>
            <option value="REGISTRATION_CREATE">REGISTRATION_CREATE</option>
            <option value="RENEWAL_CREATE">RENEWAL_CREATE</option>
            <option value="CLAIM_SUBMIT">CLAIM_SUBMIT</option>
            <option value="SETTINGS_UPDATE">SETTINGS_UPDATE</option>
          </select>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-800">
            <thead className="bg-slate-100/80 text-slate-700 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
              <tr>
                <th className="p-3.5">Timestamp</th>
                <th className="p-3.5">Operator</th>
                <th className="p-3.5">Action Code</th>
                <th className="p-3.5">Activity Description</th>
                <th className="p-3.5">IP Address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="p-3.5 whitespace-nowrap text-slate-500 font-mono text-[11px]">
                    {new Date(log.timestamp).toLocaleString()}
                  </td>

                  <td className="p-3.5 whitespace-nowrap">
                    <div className="font-bold text-slate-900">{log.username}</div>
                    <div className="text-[10px] text-blue-700 font-bold capitalize">{log.userRole}</div>
                  </td>

                  <td className="p-3.5 whitespace-nowrap">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono border ${
                        log.action.includes('LOGIN')
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : log.action.includes('CREATE')
                          ? 'bg-blue-50 text-blue-800 border-blue-200'
                          : log.action.includes('CLAIM')
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : 'bg-indigo-50 text-indigo-800 border-indigo-200'
                      }`}
                    >
                      {log.action}
                    </span>
                  </td>

                  <td className="p-3.5 text-slate-800 font-medium">{log.details}</td>

                  <td className="p-3.5 whitespace-nowrap font-mono text-slate-500 text-[11px]">
                    {log.ipAddress}
                  </td>
                </tr>
              ))}

              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-500 text-xs">
                    No matching activity logs recorded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
