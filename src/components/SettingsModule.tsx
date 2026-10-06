import React, { useState, useEffect } from 'react';
import {
  Settings,
  Building2,
  Phone,
  Mail,
  Download,
  Upload,
  Shield,
  Palette,
  Check,
  RefreshCw,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Copy,
  LogOut,
  Info,
  Camera,
} from 'lucide-react';
import { OfficeSettings } from '../types';
import {
  googleSignIn,
  getStoredAccessToken,
  setManualAccessToken,
  clearStoredAccessToken,
  getCurrentDomain,
  checkGoogleTokenStatus,
} from '../lib/googleAuth';

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
  const [domainError, setDomainError] = useState<string | null>(null);
  const [manualToken, setManualToken] = useState('');
  const [copiedDomain, setCopiedDomain] = useState(false);
  const [showManualInput, setShowManualInput] = useState(false);

  const currentDomain = getCurrentDomain();

  useEffect(() => {
    checkGoogleTokenStatus().then((status) => {
      setIsConnectedToGoogle(status.connected);
    });
  }, []);

  const handleCopyDomain = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(currentDomain);
      setCopiedDomain(true);
      setTimeout(() => setCopiedDomain(false), 3000);
    }
  };

  const handleSaveManualToken = async () => {
    if (!manualToken.trim()) {
      alert('कृपया वैध Google Access Token टाका.');
      return;
    }
    const ok = await setManualAccessToken(manualToken.trim());
    if (ok) {
      setIsConnectedToGoogle(true);
      setDomainError(null);
      setShowManualInput(false);
      setManualToken('');
      alert('Google Access Token यशस्वीरीत्या सेव्ह झाला! आता गुगल शीटमध्ये सिंक करू शकता.');
      await handleSyncSheets();
    } else {
      alert('Token सेव्ह करण्यात अडचण आली.');
    }
  };

  const handleDisconnectGoogle = async () => {
    await clearStoredAccessToken();
    setIsConnectedToGoogle(false);
    setDomainError(null);
    alert('Google खाते डिस्कनेक्ट झाले.');
  };

  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        alert('कृपया योग्य इमेज फाइल निवडा (PNG, JPG, JPEG, WebP).');
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        if (base64) {
          setFormData((prev) => ({ ...prev, officeLogo: base64 }));
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleResetLogo = () => {
    setFormData((prev) => ({
      ...prev,
      officeLogo: '/src/assets/images/om_digital_logo_1784806111546.jpg',
    }));
  };

  const handleConnectGoogle = async () => {
    setDomainError(null);
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
      console.error('Google Sign In caught:', err);
      if (err?.code === 'auth/unauthorized-domain' || err?.isUnauthorizedDomain) {
        setDomainError(err.message || 'Domain unauthorized');
        setShowManualInput(true);
      } else {
        alert('Google Sign-In Error: ' + (err?.message || 'Authentication failed'));
      }
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
          setDomainError(null);
        } catch (e: any) {
          if (e?.code === 'auth/unauthorized-domain' || e?.isUnauthorizedDomain) {
            setDomainError(e.message);
            setShowManualInput(true);
          } else {
            alert('साइन-इन झाले नाही: ' + e.message);
          }
          return;
        }
      } else {
        return;
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
        if (data.error?.includes('401') || data.error?.includes('invalid_grant')) {
          await clearStoredAccessToken();
          setIsConnectedToGoogle(false);
          alert('Google Access Token संपला आहे. कृपया पुन्हा साइन-इन करा.');
        } else {
          alert('गूगल शीट सिंक करताना त्रुटी आली: ' + (data.error || 'Unknown error'));
        }
      }
    } catch (err: any) {
      alert('नेटवर्क किंवा सर्व्हर त्रुटी: ' + (err?.message || err));
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
          Configure office identity header, automated claim rules, and database backup/restore
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

          {/* Office Logo Upload & Live Preview */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="relative group shrink-0">
              <img
                src={formData.officeLogo || '/src/assets/images/om_digital_logo_1784806111546.jpg'}
                alt="Office Logo"
                referrerPolicy="no-referrer"
                className="w-16 h-16 rounded-xl border border-slate-300 object-cover bg-white shadow-xs"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/src/assets/images/om_digital_logo_1784806111546.jpg';
                }}
              />
            </div>
            <div className="flex-1 space-y-1.5">
              <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-blue-600" />
                <span>कार्यालय लोगो (Office Logo)</span>
              </div>
              <p className="text-[11px] text-slate-500">
                हा लोगो वरच्या Navbar, Login Page आणि पावत्यांवर दिसेल. (PNG / JPG / WebP)
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <label className="py-1.5 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors">
                  <Upload className="w-3.5 h-3.5" />
                  <span>नवीन लोगो निवडा (Upload Logo)</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoFileChange}
                    className="hidden"
                  />
                </label>
                {formData.officeLogo && formData.officeLogo !== '/src/assets/images/om_digital_logo_1784806111546.jpg' && (
                  <button
                    type="button"
                    onClick={handleResetLogo}
                    className="py-1.5 px-2.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 font-medium text-xs transition-colors"
                  >
                    डीफॉल्ट लोगो ठेवा
                  </button>
                )}
              </div>
            </div>
          </div>

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

        {/* WhatsApp Reminder Template Settings */}
        <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-4 text-slate-900">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Phone className="w-4 h-4 text-emerald-600" />
            <span>WhatsApp Verification Reminder Template</span>
          </h3>
          <p className="text-xs text-slate-500">
            Customize the message sent to customers when requesting verification. Click variable badges below to insert variables into the message template.
          </p>

          <div className="space-y-2">
            <div className="flex flex-wrap gap-1.5 mb-2">
              {[
                '{{CUSTOMER_NAME}}',
                '{{MOBILE}}',
                '{{MH_NUMBER}}',
                '{{REGISTRATION_NUMBER}}',
                '{{VERIFICATION_DATE}}',
                '{{TALUKA}}',
                '{{STAFF_NAME}}',
              ].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => {
                    const current = formData.whatsappTemplate || `नमस्कार {{CUSTOMER_NAME}}जी,

आपल्या बांधकाम कामगार योजनेच्या अर्जाची पडताळणी (Verification) अद्याप बाकी आहे.

कृपया पडताळणीसाठी आवश्यक कागदपत्रांसह कार्यालयाशी संपर्क साधावा.

MH/Registration No.: {{MH_NUMBER}}
Verification Date: {{VERIFICATION_DATE}}

धन्यवाद.
OM Digital E-Seva Kendra`;
                    setFormData({ ...formData, whatsappTemplate: current + ' ' + v });
                  }}
                  className="px-2 py-1 rounded-md bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-[11px] text-emerald-800 font-mono font-bold transition-all"
                >
                  + {v}
                </button>
              ))}
            </div>

            <textarea
              rows={8}
              value={
                formData.whatsappTemplate ||
                `नमस्कार {{CUSTOMER_NAME}}जी,

आपल्या बांधकाम कामगार योजनेच्या अर्जाची पडताळणी (Verification) अद्याप बाकी आहे.

कृपया पडताळणीसाठी आवश्यक कागदपत्रांसह कार्यालयाशी संपर्क साधावा.

MH/Registration No.: {{MH_NUMBER}}
Verification Date: {{VERIFICATION_DATE}}

धन्यवाद.
OM Digital E-Seva Kendra`
              }
              onChange={(e) => setFormData({ ...formData, whatsappTemplate: e.target.value })}
              className="w-full p-3 rounded-xl bg-slate-50 border border-slate-300 text-xs text-slate-900 font-sans focus:bg-white focus:border-emerald-600 leading-relaxed"
              placeholder="Enter WhatsApp template message..."
            />
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
                  className="py-1.5 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-colors"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Google ने साइन-इन करा</span>
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="py-1 px-2.5 rounded-full bg-emerald-200/80 text-emerald-900 font-bold text-xs flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                    <span>साइन-इन एक्टिव्ह</span>
                  </span>
                  <button
                    type="button"
                    onClick={handleDisconnectGoogle}
                    className="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-50 text-slate-500 hover:text-rose-600 transition-colors"
                    title="Google खाते डिस्कनेक्ट करा"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={handleSyncSheets}
                disabled={syncing}
                className="py-1.5 px-3 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-xs flex items-center gap-1.5 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                <span>{syncing ? 'सिंक होत आहे...' : 'गुगल शीटमध्ये सेव्ह / सिंक करा'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowManualInput(!showManualInput)}
                className="py-1.5 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-xs flex items-center gap-1 transition-colors"
                title="मॅन्युअल Token किंवा डोमेन मदत"
              >
                <Info className="w-3.5 h-3.5 text-slate-500" />
                <span className="hidden sm:inline">मदत / Token</span>
              </button>
            </div>
          </div>

          {/* Domain Unauthorized / Manual Token Assistant Panel */}
          {(domainError || showManualInput) && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3 text-amber-950 mt-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs">
                  <p className="font-bold text-amber-900">
                    Google Sign-In डोमेन माहिती (Domain Authorization):
                  </p>
                  <p className="text-amber-800 leading-relaxed">
                    Firebase कडून <code className="bg-amber-100 px-1 py-0.5 rounded font-mono font-bold">auth/unauthorized-domain</code> एरर येत असल्यास, हे Cloud Run डोमेन Firebase Console मध्ये जोडलेले नाही.
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="font-semibold text-slate-700">चालू डोमेन:</span>
                    <code className="bg-white px-2 py-1 rounded border border-amber-300 font-mono text-[11px] text-slate-900 select-all">
                      {currentDomain}
                    </code>
                    <button
                      type="button"
                      onClick={handleCopyDomain}
                      className="py-1 px-2.5 rounded bg-white hover:bg-amber-100 border border-amber-300 text-amber-900 font-bold text-[11px] flex items-center gap-1 shadow-2xs transition-colors"
                    >
                      {copiedDomain ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedDomain ? 'कॉपी झाले!' : 'डोमेन कॉपी करा'}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Direct Manual Token Entry */}
              <div className="pt-2 border-t border-amber-200/80 space-y-2">
                <p className="text-xs font-bold text-amber-900">
                  पर्याय: थेट Google OAuth Access Token टाकून सिंक कनेक्ट करा:
                </p>
                <div className="flex flex-wrap sm:flex-nowrap gap-2">
                  <input
                    type="password"
                    placeholder="Google OAuth Access Token पेस्ट करा (उदा. ya29.a0...)"
                    value={manualToken}
                    onChange={(e) => setManualToken(e.target.value)}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleSaveManualToken}
                    className="py-1.5 px-4 rounded-lg bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs shrink-0 shadow-xs transition-colors"
                  >
                    Token सेव्ह करा
                  </button>
                </div>
              </div>

              <div className="pt-1 text-[11px] text-emerald-800 font-medium flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>
                  <strong>सुरक्षितता हमी:</strong> तुमचा सर्व डेटा (नोंदणी, नूतनीकरण, क्लेम, खर्च) आधीच TiDB Cloud / MySQL डेटाबेसमध्ये १००% कायमस्वरूपी सुरक्षित साठवला जात आहे. Google Sheet केवळ दुय्यम मिरर आहे.
                </span>
              </div>
            </div>
          )}

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
