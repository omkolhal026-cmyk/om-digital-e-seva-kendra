import React, { useState, useEffect } from 'react';
import {
  UserCircle,
  KeyRound,
  Phone,
  Mail,
  Shield,
  Check,
  Eye,
  EyeOff,
  AlertCircle,
  Loader2,
  Sparkles,
  User as UserIcon,
} from 'lucide-react';
import { User } from '../types';

interface ProfileModuleProps {
  currentUser: User;
  onUpdateProfile: (id: string, updated: Partial<User>) => Promise<void>;
}

export const ProfileModule: React.FC<ProfileModuleProps> = ({
  currentUser,
  onUpdateProfile,
}) => {
  const [name, setName] = useState(currentUser.name || '');
  const [mobile, setMobile] = useState(currentUser.mobile || '');
  const [email, setEmail] = useState(currentUser.email || '');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordSuccessMsg, setPasswordSuccessMsg] = useState('');
  const [passwordErrorMsg, setPasswordErrorMsg] = useState('');

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Sync state whenever currentUser changes
  useEffect(() => {
    setName(currentUser.name || '');
    setMobile(currentUser.mobile || '');
    setEmail(currentUser.email || '');
  }, [currentUser]);

  const handleUpdateInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg('');
    setErrorMsg('');

    const cleanName = name.trim();
    const cleanMobile = mobile.trim();
    const cleanEmail = email.trim();

    if (!cleanName) {
      setErrorMsg('कृपया पूर्ण नाव प्रविष्ट करा (Full name is required).');
      setSaving(false);
      return;
    }

    if (!cleanMobile || cleanMobile.length < 10) {
      setErrorMsg('कृपया वैध १० अंकी मोबाईल नंबर प्रविष्ट करा (Valid 10-digit mobile number required).');
      setSaving(false);
      return;
    }

    try {
      await onUpdateProfile(currentUser.id, {
        name: cleanName,
        mobile: cleanMobile,
        email: cleanEmail,
      });
      setMsg('प्रोफाइल माहिती यशस्वीरित्या सेव्ह झाली! (Profile updated successfully!)');
      setTimeout(() => setMsg(''), 4500);
    } catch (err: any) {
      setErrorMsg(err.message || 'प्रोफाइल अपडेट करताना अडचण आली (Failed to update profile)');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordErrorMsg('');
    setPasswordSuccessMsg('');

    if (!currentPassword) {
      setPasswordErrorMsg('कृपया सध्याचा चालू पासवर्ड प्रविष्ट करा (Please enter current password)');
      return;
    }

    if (!newPassword || newPassword.length < 4) {
      setPasswordErrorMsg('नवीन पासवर्ड किमान ४ अक्षरांचा असावा! (New password must be at least 4 characters)');
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordErrorMsg('नवीन पासवर्ड आणि कन्फर्म पासवर्ड मॅच होत नाही! (New passwords do not match!)');
      return;
    }

    setChangingPassword(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': currentUser.id,
          'x-user-username': currentUser.username,
        },
        body: JSON.stringify({
          userId: currentUser.id,
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'पासवर्ड बदलताना त्रुटी आली (Failed to update password)');
      }

      setPasswordSuccessMsg(data.message || 'पासवर्ड यशस्वीरित्या बदलला! (Password updated successfully!)');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordSuccessMsg(''), 6000);
    } catch (err: any) {
      setPasswordErrorMsg(err.message || 'पासवर्ड बदलताना त्रुटी आली');
    } finally {
      setChangingPassword(false);
    }
  };

  const initialLetter = (currentUser.name || currentUser.username || 'U').charAt(0).toUpperCase();

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Module Title Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs">
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2 mb-1">
          <UserCircle className="w-5 h-5 text-blue-700" />
          <span>My Profile & Account Settings</span>
        </h2>
        <p className="text-xs text-slate-500 font-medium">
          वैयक्तिक माहिती (नाव, मोबाईल, ईमेल) आणि सुरक्षित पासवर्ड व्यवस्थापन
        </p>
      </div>

      {/* Profile Overview Card (Clean Avatar with Initial Badge) */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-slate-900">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl brand-gradient text-white flex items-center justify-center font-extrabold text-2xl shadow-md border-2 border-white/90 select-none">
            {initialLetter}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-slate-900">{currentUser.name}</h3>
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Active
              </span>
            </div>
            <div className="text-xs font-mono text-blue-700 font-bold mt-0.5">
              @{currentUser.username}
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                currentUser.role === 'admin'
                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                  : currentUser.role === 'sub_agent'
                  ? 'bg-purple-50 text-purple-800 border-purple-200'
                  : 'bg-blue-50 text-blue-800 border-blue-200'
              }`}>
                {currentUser.role === 'admin' ? (
                  <Shield className="w-3 h-3 text-amber-600" />
                ) : currentUser.role === 'sub_agent' ? (
                  <Sparkles className="w-3 h-3 text-purple-600" />
                ) : (
                  <UserIcon className="w-3 h-3 text-blue-600" />
                )}
                Role: {currentUser.role}
              </span>

              {currentUser.mobile && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                  <Phone className="w-2.5 h-2.5 text-slate-500" />
                  {currentUser.mobile}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {msg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center gap-2 shadow-xs">
          <Check className="w-4 h-4 text-emerald-700 shrink-0" />
          <span>{msg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-bold flex items-center gap-2 shadow-xs">
          <AlertCircle className="w-4 h-4 text-rose-700 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Personal Info Form */}
      <form onSubmit={handleUpdateInfo} className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-4 text-slate-900">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <UserCircle className="w-4 h-4 text-blue-700" />
            <span>Personal Information (वैयक्तिक माहिती)</span>
          </h3>
          <span className="text-[11px] text-slate-500 font-medium">खातेदार माहिती अद्ययावत करा</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Full Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="उदा. Om (Admin)"
              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:bg-white focus:border-blue-600 focus:ring-1 focus:ring-blue-600 outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Mobile Number <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                maxLength={10}
                placeholder="उदा. 7741805766"
                className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 font-mono focus:bg-white focus:border-blue-600 focus:ring-1 focus:ring-blue-600 outline-none"
                required
              />
              <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Email Address (ईमेल पत्ता)
            </label>
            <div className="relative">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="उदा. omkolhal026@gmail.com"
                className="w-full pl-8 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:bg-white focus:border-blue-600 focus:ring-1 focus:ring-blue-600 outline-none"
              />
              <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end pt-3 border-t border-slate-100">
          <button
            type="submit"
            disabled={saving}
            className="py-2.5 px-6 rounded-xl brand-gradient hover:opacity-95 text-white font-bold text-xs shadow-xs flex items-center gap-2 cursor-pointer transition-all disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>सेव्ह होत आहे... (Saving...)</span>
              </>
            ) : (
              <span>Update Details (माहिती सेव्ह करा)</span>
            )}
          </button>
        </div>
      </form>

      {/* Change Password Form */}
      <form onSubmit={handleChangePassword} className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-4 text-slate-900">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-amber-600" />
            <span>Change Password (पासवर्ड बदला)</span>
          </h3>
          <span className="text-[11px] text-slate-500 font-medium">खात्याचा सुरक्षित पासवर्ड बदला</span>
        </div>

        {passwordSuccessMsg && (
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center gap-2 shadow-xs">
            <Check className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>{passwordSuccessMsg}</span>
          </div>
        )}

        {passwordErrorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-bold flex items-center gap-2 shadow-xs">
            <AlertCircle className="w-4 h-4 text-rose-700 shrink-0" />
            <span>{passwordErrorMsg}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Current Password <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showCurrentPassword ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="चालू पासवर्ड"
                className="w-full pl-3 pr-9 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:bg-white focus:border-blue-600 outline-none"
                required
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword((prev) => !prev)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                title={showCurrentPassword ? 'Hide' : 'Show'}
              >
                {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              New Password <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="किमान ४ अक्षरे"
                className="w-full pl-3 pr-9 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:bg-white focus:border-blue-600 outline-none"
                required
              />
              <button
                type="button"
                onClick={() => setShowNewPassword((prev) => !prev)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                title={showNewPassword ? 'Hide' : 'Show'}
              >
                {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Confirm New Password <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="नवीन पासवर्ड पुन्हा टाका"
                className="w-full pl-3 pr-9 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:bg-white focus:border-blue-600 outline-none"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                title={showConfirmPassword ? 'Hide' : 'Show'}
              >
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
          <p className="text-[11px] text-slate-400">
            पासवर्ड किमान ४ वर्णांचा असावा. तो कोणाशीही शेअर करू नका.
          </p>
          <button
            type="submit"
            disabled={changingPassword}
            className="py-2.5 px-5 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold text-xs shadow-xs flex items-center gap-2 cursor-pointer transition-all"
          >
            {changingPassword ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>अपडेट होत आहे... (Updating...)</span>
              </>
            ) : (
              <span>Update Security Password</span>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
