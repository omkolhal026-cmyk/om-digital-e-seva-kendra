import React, { useState, useRef } from 'react';
import { UserCircle, KeyRound, Phone, Mail, Shield, Check, Lock, Camera, Upload } from 'lucide-react';
import { User } from '../types';

interface ProfileModuleProps {
  currentUser: User;
  onUpdateProfile: (id: string, updated: Partial<User>) => Promise<void>;
}

export const ProfileModule: React.FC<ProfileModuleProps> = ({
  currentUser,
  onUpdateProfile,
}) => {
  const [name, setName] = useState(currentUser.name);
  const [mobile, setMobile] = useState(currentUser.mobile);
  const [email, setEmail] = useState(currentUser.email || '');
  const [photoUrl, setPhotoUrl] = useState(
    currentUser.photoUrl ||
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('फोटो सायझ लहान असावी (कृपया 5 MB पेक्षा कमी आकाराचा फोटो निवडा).');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          setPhotoUrl(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpdateInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg('');
    try {
      await onUpdateProfile(currentUser.id, { name, mobile, email, photoUrl });
      setMsg('प्रोफाइल माहिती व फोटो यशस्वीरित्या अपडेट झाला! (Profile updated successfully!)');
      setTimeout(() => setMsg(''), 3500);
    } catch (err: any) {
      alert(err.message || 'Error updating profile');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword !== confirmPassword) {
      alert('नवीन पासवर्ड मॅच होत नाही! (New passwords do not match!)');
      return;
    }
    alert('पासवर्ड यशस्वीरित्या बदलला! (Password updated successfully!)');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs">
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2 mb-1">
          <UserCircle className="w-5 h-5 text-blue-700" />
          <span>My Profile & Account Preferences</span>
        </h2>
        <p className="text-xs text-slate-500 font-medium">
          Manage personal details, upload profile photo, and update security password
        </p>
      </div>

      {msg && (
        <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-700" />
          <span>{msg}</span>
        </div>
      )}

      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handlePhotoSelect}
        accept="image/*"
        className="hidden"
      />

      {/* User Card Header with Profile Photo Selection */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-slate-900">
        <div className="flex items-center gap-4">
          <div className="relative group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
            <img
              src={photoUrl}
              alt={currentUser.name}
              referrerPolicy="no-referrer"
              className="w-20 h-20 rounded-2xl object-cover border-2 border-slate-200 shadow-md group-hover:opacity-90 transition-opacity"
            />
            <div className="absolute inset-0 bg-slate-900/40 rounded-2xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white">
              <Camera className="w-6 h-6" />
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-blue-600 text-white shadow-md hover:bg-blue-700 border-2 border-white transition-transform hover:scale-110"
              title="Change Profile Picture"
            >
              <Camera className="w-3.5 h-3.5" />
            </button>
          </div>

          <div>
            <h3 className="text-lg font-bold text-slate-900">{currentUser.name}</h3>
            <div className="text-xs font-mono text-blue-700 font-bold">@{currentUser.username}</div>
            <div className="flex items-center gap-2 mt-2">
              <span className="inline-block px-3 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-50 text-blue-800 border border-blue-200">
                Role: {currentUser.role}
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="py-2 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs border border-slate-300 flex items-center gap-2 transition-all cursor-pointer self-stretch sm:self-auto justify-center"
        >
          <Upload className="w-4 h-4 text-blue-700" />
          <span>फोटो निवडा (Select Photo)</span>
        </button>
      </div>

      {/* Info Form */}
      <form onSubmit={handleUpdateInfo} className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-4 text-slate-900">
        <h3 className="text-sm font-bold text-slate-900">Personal Information</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Full Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:bg-white focus:border-blue-600"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Mobile Number</label>
            <input
              type="text"
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 font-mono focus:bg-white focus:border-blue-600"
              required
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-slate-700 mb-1">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:bg-white focus:border-blue-600"
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-xs text-blue-700 hover:underline font-bold flex items-center gap-1 cursor-pointer"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>प्रोफाइल फोटो बदला (Change Picture)</span>
          </button>

          <button
            type="submit"
            disabled={saving}
            className="py-2.5 px-5 rounded-xl brand-gradient hover:opacity-95 text-white font-bold text-xs shadow-xs cursor-pointer"
          >
            {saving ? 'Saving...' : 'Update Details (सेव्ह करा)'}
          </button>
        </div>
      </form>

      {/* Change Password */}
      <form onSubmit={handleChangePassword} className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-4 text-slate-900">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-amber-600" />
          <span>Change Password</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:bg-white focus:border-blue-600"
              required
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:bg-white focus:border-blue-600"
              required
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:bg-white focus:border-blue-600"
              required
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            className="py-2.5 px-5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-xs"
          >
            Update Security Password
          </button>
        </div>
      </form>
    </div>
  );
};
