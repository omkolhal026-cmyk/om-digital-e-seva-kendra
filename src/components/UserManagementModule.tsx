import React, { useState } from 'react';
import { Users, UserPlus, Shield, KeyRound, Check, X, Lock, CheckCircle2, AlertCircle, Trash2 } from 'lucide-react';
import { User, UserRole } from '../types';

interface UserManagementModuleProps {
  users: User[];
  onAddUser: (user: Omit<User, 'id' | 'createdAt'>) => Promise<void>;
  onUpdateUser: (id: string, user: Partial<User>) => Promise<void>;
  onResetPassword: (id: string) => Promise<void>;
}

export const UserManagementModule: React.FC<UserManagementModuleProps> = ({
  users,
  onAddUser,
  onUpdateUser,
  onResetPassword,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    username: '',
    password: '',
    mobile: '',
    name: '',
    email: '',
    role: 'operator' as UserRole,
    status: 'active' as 'active' | 'disabled',
    permissions: {
      canRegister: true,
      canRenew: true,
      canClaim: true,
      canExport: false,
    },
  });

  const [submitting, setSubmitting] = useState(false);

  const handleOpenAdd = () => {
    setEditingUserId(null);
    setFormData({
      username: '',
      password: '',
      mobile: '',
      name: '',
      email: '',
      role: 'operator',
      status: 'active',
      permissions: {
        canRegister: true,
        canRenew: true,
        canClaim: true,
        canExport: false,
      },
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (u: User) => {
    setEditingUserId(u.id);
    setFormData({
      username: u.username,
      password: '',
      mobile: u.mobile,
      name: u.name,
      email: u.email,
      role: u.role,
      status: u.status,
      permissions: { ...u.permissions },
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.username || !formData.name || !formData.mobile) {
      alert('Username, Name, and Mobile are required.');
      return;
    }

    setSubmitting(true);
    try {
      if (editingUserId) {
        await onUpdateUser(editingUserId, formData);
      } else {
        await onAddUser(formData);
      }
      setIsModalOpen(false);
    } catch (err: any) {
      alert(err.message || 'Error saving user');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (user: User) => {
    const newStatus = user.status === 'active' ? 'disabled' : 'active';
    await onUpdateUser(user.id, { status: newStatus });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-700" />
            <span>Operator & User Management</span>
          </h2>
          <p className="text-xs text-slate-500 font-medium">
            Manage office operators, grant or restrict module permissions, and toggle access status
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="py-2.5 px-4 rounded-xl brand-gradient hover:opacity-95 text-white font-bold text-xs shadow-xs flex items-center gap-1.5"
        >
          <UserPlus className="w-4 h-4" />
          <span>Add New Operator</span>
        </button>
      </div>

      {/* Users List Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {users.map((u) => (
          <div
            key={u.id}
            className={`p-5 rounded-2xl border transition-all shadow-xs relative ${
              u.status === 'active'
                ? 'bg-white border-slate-200/90 hover:border-blue-600/50'
                : 'bg-slate-50 border-rose-200 opacity-80'
            }`}
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-3">
                <img
                  src={
                    u.photoUrl && u.photoUrl.trim() !== ''
                      ? u.photoUrl
                      : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'
                  }
                  alt={u.name}
                  referrerPolicy="no-referrer"
                  className="w-10 h-10 rounded-full object-cover border border-slate-200 shadow-xs"
                />
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">{u.name}</h3>
                  <div className="text-[11px] text-blue-700 font-mono">@{u.username}</div>
                </div>
              </div>

              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold capitalize border ${
                  u.role === 'admin'
                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                }`}
              >
                {u.role}
              </span>
            </div>

            <div className="space-y-1 text-xs text-slate-700 pt-2 border-t border-slate-100 font-medium">
              <div className="flex justify-between">
                <span className="text-slate-500">Mobile:</span>
                <span className="font-mono text-slate-900">{u.mobile}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Status:</span>
                <span
                  className={`font-bold capitalize ${
                    u.status === 'active' ? 'text-emerald-700' : 'text-rose-700'
                  }`}
                >
                  {u.status}
                </span>
              </div>
            </div>

            {/* Permission Badges */}
            <div className="mt-3 pt-3 border-t border-slate-100">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Assigned Permissions
              </div>
              <div className="flex flex-wrap gap-1">
                {u.permissions.canRegister && (
                  <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                    Register
                  </span>
                )}
                {u.permissions.canRenew && (
                  <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">
                    Renew
                  </span>
                )}
                {u.permissions.canClaim && (
                  <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                    Claim
                  </span>
                )}
                {u.permissions.canExport && (
                  <span className="px-2 py-0.5 rounded text-[9px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    Export
                  </span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
              <button
                onClick={() => handleToggleStatus(u)}
                className={`text-xs font-bold px-2.5 py-1 rounded-lg border transition-colors ${
                  u.status === 'active'
                    ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                }`}
              >
                {u.status === 'active' ? 'Disable Account' : 'Enable Account'}
              </button>

              <div className="flex gap-1">
                <button
                  onClick={() => onResetPassword(u.id)}
                  className="p-1.5 rounded-lg bg-slate-50 hover:bg-amber-100 text-amber-700 border border-slate-200 transition-colors"
                  title="Reset Password"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                </button>

                <button
                  onClick={() => handleOpenEdit(u)}
                  className="p-1.5 rounded-lg bg-slate-50 hover:bg-blue-100 text-blue-700 border border-slate-200 transition-colors"
                  title="Edit Operator Profile"
                >
                  <Shield className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add / Edit Operator Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200/90 rounded-3xl max-w-lg w-full p-6 shadow-2xl relative text-slate-900">
            <button
              onClick={() => setIsModalOpen(false)}
              className="absolute top-5 right-5 p-2 rounded-xl bg-slate-100 text-slate-500 hover:text-slate-900 border border-slate-200"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-slate-900 mb-1">
              {editingUserId ? 'Edit Operator Account' : 'Add New Operator Account'}
            </h3>
            <p className="text-xs text-slate-500 mb-5 font-medium">
              Set login credentials and assign custom module permissions.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Mahesh Patil"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:bg-white focus:border-blue-600"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Username
                  </label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    placeholder="e.g. operator4"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:bg-white focus:border-blue-600"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Mobile Number
                  </label>
                  <input
                    type="text"
                    value={formData.mobile}
                    onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                    placeholder="10 digits"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 font-mono focus:bg-white focus:border-blue-600"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Password (पासवर्ड)
                  </label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder={
                      editingUserId
                        ? 'Leave blank to keep same'
                        : formData.username
                        ? `${formData.username}123`
                        : 'Custom or auto'
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:bg-white focus:border-blue-600 font-mono"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    {editingUserId
                      ? 'खाली ठेवल्यास जुना पासवर्ड राहील'
                      : `डिफॉल्ट: ${formData.username || 'username'}123`}
                  </p>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Role Type
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:bg-white focus:border-blue-600"
                  >
                    <option value="operator">Operator (Limited Scope)</option>
                    <option value="admin">Admin (Full Access)</option>
                  </select>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-2">
                <div className="text-xs font-bold text-blue-800">Assign Allowed Module Permissions</div>
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-700 font-medium">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.permissions.canRegister}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          permissions: { ...formData.permissions, canRegister: e.target.checked },
                        })
                      }
                      className="rounded border-slate-300 text-blue-700 focus:ring-blue-500"
                    />
                    <span>Can Register Workers</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.permissions.canRenew}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          permissions: { ...formData.permissions, canRenew: e.target.checked },
                        })
                      }
                      className="rounded border-slate-300 text-blue-700 focus:ring-blue-500"
                    />
                    <span>Can Renew MBOCWW</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.permissions.canClaim}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          permissions: { ...formData.permissions, canClaim: e.target.checked },
                        })
                      }
                      className="rounded border-slate-300 text-blue-700 focus:ring-blue-500"
                    />
                    <span>Can Apply Claims</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.permissions.canExport}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          permissions: { ...formData.permissions, canExport: e.target.checked },
                        })
                      }
                      className="rounded border-slate-300 text-blue-700 focus:ring-blue-500"
                    />
                    <span>Can Export Data</span>
                  </label>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="py-2.5 px-6 rounded-xl brand-gradient hover:opacity-95 text-white text-xs font-bold shadow-xs"
                >
                  {submitting ? 'Saving...' : 'Save Operator Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
