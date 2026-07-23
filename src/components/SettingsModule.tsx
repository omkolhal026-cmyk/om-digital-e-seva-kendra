import React, { useState } from 'react';
import { Settings, Building2, Phone, Mail, Download, Upload, Shield, Palette, Check, RefreshCw, KeyRound, CheckCircle2 } from 'lucide-react';
import { OfficeSettings } from '../types';
import { googleSignIn, getStoredAccessToken } from '../lib/googleAuth';

interface SettingsModuleProps {
  settings: OfficeSettings;
  onUpdateSettings: (newSettings: Partial<OfficeSettings>) => Promise<void>;
  onBackupDatabase: () => void;
  onRestoreDatabase: (file: File) => Promise<void>;
}

export const SettingsModule: React.FC<SettingsModuleProps> = ({
  settings,
  onUpdateSettings,
  onBackupDatabase,
  onRestoreDatabase,
}) => {
  const [formData, setFormData] = useState({ ...settings });
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [isConnectedToGoogle, setIsConnectedToGoogle] = useState(() => !!getStoredAccessToken());

  const handleConnectGoogle = async () => {
    try {
      const authResult = await googleSignIn();
      const token = authResult?.accessToken;
      if (token) {
        await fetch('/api/set-google-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
      }
      setIsConnectedToGoogle(true);
      alert('गूगल अकाउंट कनेक्ट झाले! सर्व डेटा आता गुगल शीटमध्ये सेव्ह होत आहे.');
      await handleSyncSheets();
    } catch (err: any) {
      alert('Google Sign-In Error: ' + (err?.message || 'Authentication failed'));
    }
  };

  const handleSyncSheets = async () => {
    let token = getStoredAccessToken();
    if (!token) {
      if (confirm('गुगल शीटमध्ये डेटा सेव्ह करण्यासाठी एकदा Google साइन-इन आवश्यक आहे. आता साइन-इन करायचे का?')) {
        try {
          const res = await googleSignIn();
          token = res?.accessToken || null;
          setIsConnectedToGoogle(true);
        } catch (e: any) {
          alert('साइन-इन झाले नाही: ' + e.message);
          return;
        }
      }
    }

    if (token) {
      await fetch('/api/set-google-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
    }

    setSyncing(true);
    try {
      const res = await fetch('/api/sync-sheets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-google-access-token': token || '',
        },
      });
      const data = await res.json();
      if (data.success) {
        alert('गूगल शीटमध्ये सर्व नोंदी (रजिस्ट्रेशन व नूतनीकरण) यशस्वीरित्या सेव्ह झाल्या आहेत!');
      } else {
        alert('गूगल शीट सिंक करताना त्रुटी आली: ' + (data.error || 'Unknown error'));
      }
    } catch (err: any) {
      alert('नेटवर्क किंवा सर्व्हर त्रुटी: ' + err.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMsg('');
    try {
      await onUpdateSettings(formData);
      setSuccessMsg('Office settings updated successfully!');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err: any) {
      alert(err.message || 'Error updating settings');
    } finally {
      setSaving(false);
    }
  };

  const handleFileRestoreChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (confirm('Are you sure you want to restore the database from this JSON backup? Existing data will be overwritten.')) {
        await onRestoreDatabase(file);
        alert('Database restored successfully!');
      }
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs">
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2 mb-1">
          <Settings className="w-5 h-5 text-blue-700" />
          <span>Office Parameters & System Settings</span>
        </h2>
        <p className="text-xs text-slate-500 font-medium">
          Configure office identity header, default fee structure, automated claim rules, and database backup/restore
        </p>
      </div>

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-700" />
          <span>{successMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Office Identity */}
        <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-4 text-slate-900">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-blue-700" />
            <span>Office Branding & Information</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Office Name
              </label>
              <input
                type="text"
                value={formData.officeName}
                onChange={(e) => setFormData({ ...formData, officeName: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:bg-white focus:border-blue-600"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                District Name
              </label>
              <input
                type="text"
                value={formData.districtName}
                onChange={(e) => setFormData({ ...formData, districtName: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:bg-white focus:border-blue-600"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Office Full Address
              </label>
              <input
                type="text"
                value={formData.officeAddress}
                onChange={(e) => setFormData({ ...formData, officeAddress: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:bg-white focus:border-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Contact Phone Numbers
              </label>
              <input
                type="text"
                value={formData.contactNumbers}
                onChange={(e) => setFormData({ ...formData, contactNumbers: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:bg-white focus:border-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Support Email
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 focus:bg-white focus:border-blue-600"
              />
            </div>
          </div>
        </div>

        {/* Fees Structure */}
        <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-4 text-slate-900">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-700" />
            <span>Service Fee Structure & Auto-Approval</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Worker Registration Fee (₹)
              </label>
              <input
                type="number"
                value={formData.registrationFee}
                onChange={(e) => setFormData({ ...formData, registrationFee: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 font-mono focus:bg-white focus:border-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Annual Renewal Fee (₹)
              </label>
              <input
                type="number"
                value={formData.renewalFee}
                onChange={(e) => setFormData({ ...formData, renewalFee: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 font-mono focus:bg-white focus:border-blue-600"
              />
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="py-2.5 px-6 rounded-xl brand-gradient hover:opacity-95 text-white font-bold text-xs shadow-xs"
          >
            {saving ? 'Saving...' : 'Save Office Settings'}
          </button>
        </div>
      </form>

      {/* Database Backup & Restore Section */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-4 text-slate-900">
        <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
          <Download className="w-4 h-4 text-amber-600" />
          <span>System Backup, Restore & Google Sheets Sync</span>
        </h3>
        <p className="text-xs text-slate-500 font-medium">
          Your data is automatically saved in your <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-800 font-mono">TiDB Cloud / MySQL Database</code> and synced to your connected Google Sheet.
        </p>

        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-950 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="font-bold text-slate-900 text-sm">गुगल शीट कनेक्टेड:</span>{' '}
              <a
                href="https://docs.google.com/spreadsheets/d/157MB8ZZaXOkOf8vde_3ofgyTr0rToCF70w0SUrvLIu8/edit?usp=sharing"
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-blue-700 font-bold hover:text-blue-800 ml-1 text-xs"
              >
                157MB8ZZaXOkOf8vde_3ofgyTr0rToCF70w0SUrvLIu8 (पहा)
              </a>
            </div>

            <div className="flex items-center gap-2">
              {!isConnectedToGoogle ? (
                <button
                  type="button"
                  onClick={handleConnectGoogle}
                  className="py-1.5 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Google ने साइन-इन करा</span>
                </button>
              ) : (
                <span className="py-1 px-2.5 rounded-full bg-emerald-200/80 text-emerald-900 font-bold text-xs flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                  <span>साइन-इन एक्टिव्ह</span>
                </span>
              )}

              <button
                type="button"
                onClick={handleSyncSheets}
                disabled={syncing}
                className="py-1.5 px-3 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-xs flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                <span>{syncing ? 'सिंक होत आहे...' : 'गुगल शीटमध्ये सेव्ह / सिंक करा'}</span>
              </button>
            </div>
          </div>
          <p className="text-slate-600 font-medium">
            टीप: नवीन नोंदी तुमच्या TiDB Cloud / MySQL डेटाबेसवर (<code className="bg-emerald-100/70 px-1 py-0.5 rounded text-emerald-900 font-mono">MySQL Database</code>) कायमस्वरूपी सुरक्षित राहतात. गुगल शीटमध्ये सेव्ह करण्यासाठी वरील बटणावर क्लिक करा.
          </p>
        </div>

        <div className="flex flex-wrap gap-3 pt-2">
          <button
            type="button"
            onClick={onBackupDatabase}
            className="py-2.5 px-4 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-300 text-blue-700 text-xs font-bold flex items-center gap-2 shadow-xs"
          >
            <Download className="w-4 h-4" />
            <span>Download Database Backup (JSON)</span>
          </button>

          <label className="py-2.5 px-4 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-300 text-emerald-800 text-xs font-bold flex items-center gap-2 cursor-pointer shadow-xs">
            <Upload className="w-4 h-4" />
            <span>Restore From JSON File</span>
            <input
              type="file"
              accept=".json"
              onChange={handleFileRestoreChange}
              className="hidden"
            />
          </label>
        </div>
      </div>
    </div>
  );
};
