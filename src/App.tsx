import React, { useState, useEffect } from 'react';
import { LoginPage } from './components/LoginPage';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { RegistrationModule } from './components/RegistrationModule';
import { RenewalModule } from './components/RenewalModule';
import { ClaimModule } from './components/ClaimModule';
import { SearchModule } from './components/SearchModule';
import { ReportsModule } from './components/ReportsModule';
import { UserManagementModule } from './components/UserManagementModule';
import { SettingsModule } from './components/SettingsModule';
import { ActivityLogModule } from './components/ActivityLogModule';
import { ProfileModule } from './components/ProfileModule';
import { PrintSlipModal } from './components/PrintSlipModal';
import { FutureFeaturesModal } from './components/FutureFeaturesModal';

import {
  User,
  WorkerRegistration,
  WorkerRenewal,
  WorkerClaim,
  ActivityLog,
  OfficeSettings,
  Scheme,
} from './types';
import {
  INITIAL_USERS,
  INITIAL_REGISTRATIONS,
  INITIAL_RENEWALS,
  INITIAL_CLAIMS,
  INITIAL_LOGS,
  INITIAL_SETTINGS,
  SCHEMES_LIST,
} from './data/mockData';

import { getStoredAccessToken } from './lib/googleAuth';

export default function App() {
  // Current logged in user (null = show Login page)
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem('om_eseva_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      localStorage.removeItem('om_eseva_user');
      return null;
    }
  });

  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Core Data Stores
  const [users, setUsers] = useState<User[]>(INITIAL_USERS);
  const [registrations, setRegistrations] = useState<WorkerRegistration[]>(INITIAL_REGISTRATIONS);
  const [renewals, setRenewals] = useState<WorkerRenewal[]>(INITIAL_RENEWALS);
  const [claims, setClaims] = useState<WorkerClaim[]>(INITIAL_CLAIMS);
  const [logs, setLogs] = useState<ActivityLog[]>(INITIAL_LOGS);
  const [settings, setSettings] = useState<OfficeSettings>(INITIAL_SETTINGS);
  const [schemes, setSchemes] = useState<Scheme[]>(SCHEMES_LIST);

  // Modals state
  const [printModalInfo, setPrintModalInfo] = useState<{
    type: 'registration' | 'renewal' | 'claim';
    data: any;
  } | null>(null);

  const [isOcrModalOpen, setIsOcrModalOpen] = useState(false);

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

  // Fetch initial data & sync permissions from server APIs
  useEffect(() => {
    if (!currentUser) return;

    const headers = getAuthHeaders();

    // Sync current user profile and permissions directly from MySQL database
    fetch('/api/auth/me', { headers })
      .then((res) => res.json())
      .then((data) => {
        if (data && data.id && !data.error) {
          setCurrentUser(data);
          localStorage.setItem('om_eseva_user', JSON.stringify(data));
        } else if (data?.error?.includes('disabled') || data?.error?.includes('not found')) {
          handleLogout();
        }
      })
      .catch(() => {});

    // Fetch Registrations if Admin or Operator with Registration permission
    if (currentUser.role === 'admin' || currentUser.permissions?.canRegister) {
      fetch('/api/registrations', { headers })
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) setRegistrations(data);
        })
        .catch(() => {});
    }

    // Fetch Renewals if Admin or Operator with Renewal permission
    if (currentUser.role === 'admin' || currentUser.permissions?.canRenew) {
      fetch('/api/renewals', { headers })
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) setRenewals(data);
        })
        .catch(() => {});
    }

    // Fetch Claims if Admin or Operator with Claim permission
    if (currentUser.role === 'admin' || currentUser.permissions?.canClaim) {
      fetch('/api/claims', { headers })
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) setClaims(data);
        })
        .catch(() => {});
    }

    // Fetch Admin-only datasets
    if (currentUser.role === 'admin') {
      fetch('/api/users', { headers })
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data) && data.length > 0) setUsers(data);
        })
        .catch(() => {});

      fetch('/api/activity-logs', { headers })
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) setLogs(data);
        })
        .catch(() => {});
    }

    fetch('/api/settings', { headers })
      .then((res) => res.json())
      .then((data) => {
        if (data && data.officeName) setSettings(data);
      })
      .catch(() => {});
  }, [currentUser?.id]);

  // Login & Logout Handlers
  const handleLoginSuccess = (user: User) => {
    setCurrentUser(user);
    localStorage.setItem('om_eseva_user', JSON.stringify(user));
    setActiveTab('dashboard');
  };

  const handleLogout = () => {
    if (currentUser) {
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ username: currentUser.username, role: currentUser.role }),
      }).catch(() => {});
    }

    setCurrentUser(null);
    localStorage.removeItem('om_eseva_user');
  };

  // Registration CRUD
  const handleAddRegistration = async (newRegData: Omit<WorkerRegistration, 'id'>) => {
    try {
      const token = getStoredAccessToken();
      const res = await fetch('/api/registrations', {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'x-google-access-token': token || '',
        },
        body: JSON.stringify(newRegData),
      });
      const created = await res.json();
      if (res.ok) {
        setRegistrations((prev) => [created, ...prev]);
      } else {
        alert(created.error || 'Failed to add registration');
        throw new Error(created.error || 'Failed to add registration');
      }
    } catch (err) {
      console.error(err);
      throw err;
    }
  };

  const handleUpdateRegistration = async (id: string, updatedFields: Partial<WorkerRegistration>) => {
    try {
      const res = await fetch(`/api/registrations/${id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ ...updatedFields, operatorName: currentUser?.name }),
      });
      const updated = await res.json();
      if (res.ok) {
        setRegistrations((prev) => prev.map((r) => (r.id === id ? updated : r)));
      } else {
        alert(updated.error || 'Failed to update registration');
        throw new Error(updated.error || 'Failed to update registration');
      }
    } catch (err) {
      console.error(err);
      throw err;
    }
  };

  const handleDeleteRegistration = async (id: string) => {
    try {
      const res = await fetch(`/api/registrations/${id}?operator=${currentUser?.username}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        setRegistrations((prev) => prev.filter((r) => r.id !== id));
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete registration');
        throw new Error(data.error || 'Failed to delete registration');
      }
    } catch (err) {
      console.error(err);
      throw err;
    }
  };

  // Renewal CRUD
  const handleAddRenewal = async (newRenData: Omit<WorkerRenewal, 'id'>) => {
    try {
      const token = getStoredAccessToken();
      const res = await fetch('/api/renewals', {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'x-google-access-token': token || '',
        },
        body: JSON.stringify(newRenData),
      });
      const created = await res.json();
      if (res.ok) {
        setRenewals((prev) => [created, ...prev]);
      } else {
        alert(created.error || 'Failed to add renewal');
        throw new Error(created.error || 'Failed to add renewal');
      }
    } catch (err) {
      console.error(err);
      throw err;
    }
  };

  const handleUpdateRenewal = async (id: string, updatedFields: Partial<WorkerRenewal>) => {
    try {
      const res = await fetch(`/api/renewals/${id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ ...updatedFields, updatedAt: new Date().toISOString() }),
      });
      const updated = await res.json();
      if (res.ok) {
        setRenewals((prev) => prev.map((r) => (r.id === id ? updated : r)));
      } else {
        alert(updated.error || 'Failed to update renewal status');
        throw new Error(updated.error || 'Failed to update renewal status');
      }
    } catch (err) {
      console.error(err);
      throw err;
    }
  };

  const handleDeleteRenewal = async (id: string) => {
    try {
      const res = await fetch(`/api/renewals/${id}?operator=${currentUser?.username}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        setRenewals((prev) => prev.filter((r) => r.id !== id));
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to delete renewal');
        throw new Error(data.error || 'Failed to delete renewal');
      }
    } catch (err) {
      console.error(err);
      throw err;
    }
  };

  // Claim CRUD
  const handleAddClaim = async (newClaimData: Omit<WorkerClaim, 'id'>) => {
    try {
      const res = await fetch('/api/claims', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(newClaimData),
      });
      const created = await res.json();
      if (res.ok) {
        setClaims((prev) => [created, ...prev]);
      } else {
        alert(created.error || 'Failed to create claim');
        throw new Error(created.error || 'Failed to create claim');
      }
    } catch (err) {
      console.error(err);
      throw err;
    }
  };

  const handleUpdateClaimStatus = async (id: string, status: WorkerClaim['status'], remarks?: string) => {
    try {
      const res = await fetch(`/api/claims/${id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ status, remarks, operatorName: currentUser?.name }),
      });
      const updated = await res.json();
      if (res.ok) {
        setClaims((prev) => prev.map((c) => (c.id === id ? updated : c)));
      } else {
        alert(updated.error || 'Failed to update claim status');
        throw new Error(updated.error || 'Failed to update claim status');
      }
    } catch (err) {
      console.error(err);
      throw err;
    }
  };

  const handleResetClaims = async () => {
    if (!window.confirm('तुम्हाला सर्व क्लेम नोंदी रीसेट करायच्या आहेत का? (Are you sure you want to reset all claims data to 0?)')) {
      return;
    }
    try {
      await fetch('/api/claims', { method: 'DELETE', headers: getAuthHeaders() });
      setClaims([]);
    } catch (err) {
      console.error(err);
    }
  };

  const handleClearRegistrations = async () => {
    if (!window.confirm('तुम्हाला नोंदणी मधील सर्व नोंदी हटवायच्या आहेत का? (Are you sure you want to clear all registration entries?)')) {
      return;
    }
    try {
      await fetch('/api/registrations', { method: 'DELETE', headers: getAuthHeaders() });
      setRegistrations([]);
    } catch (err) {
      console.error(err);
    }
  };

  const handleClearRenewals = async () => {
    if (!window.confirm('तुम्हाला नूतनीकरण मधील सर्व नोंदी हटवायच्या आहेत का? (Are you sure you want to clear all renewal entries?)')) {
      return;
    }
    try {
      await fetch('/api/renewals', { method: 'DELETE', headers: getAuthHeaders() });
      setRenewals([]);
    } catch (err) {
      console.error(err);
    }
  };

  const handleClearLogs = async () => {
    if (!window.confirm('तुम्हाला सर्व अॅक्टिव्हिटी लॉग्स हटवायचे आहेत का? (Are you sure you want to clear all activity logs?)')) {
      return;
    }
    try {
      await fetch('/api/activity-logs', { method: 'DELETE', headers: getAuthHeaders() });
      setLogs([]);
    } catch (err) {
      console.error(err);
    }
  };

  // User Management
  const handleAddUser = async (newUserData: Omit<User, 'id' | 'createdAt'>) => {
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(newUserData),
      });
      const created = await res.json();
      if (res.ok) {
        setUsers((prev) => [...prev, created]);
      } else {
        alert(created.error || 'Failed to create user');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateUser = async (id: string, updatedFields: Partial<User>) => {
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(updatedFields),
      });
      const updated = await res.json();
      if (res.ok) {
        setUsers((prev) => prev.map((u) => (u.id === id ? updated : u)));
        if (currentUser && currentUser.id === id) {
          setCurrentUser(updated);
          localStorage.setItem('om_eseva_user', JSON.stringify(updated));
        }
      } else {
        alert(updated.error || 'Failed to update user');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleResetPassword = async (id: string) => {
    try {
      const res = await fetch(`/api/users/${id}/reset-password`, { method: 'POST', headers: getAuthHeaders() });
      const data = await res.json();
      alert(data.message || 'Password reset successfully');
    } catch (err) {
      console.error(err);
    }
  };

  // Settings
  const handleUpdateSettings = async (newSettings: Partial<OfficeSettings>) => {
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings),
      });
      const updated = await res.json();
      setSettings(updated);
    } catch (err) {
      console.error(err);
    }
  };

  // Backup & Restore
  const handleBackupDatabase = () => {
    window.open('/api/backup', '_blank');
  };

  const handleRestoreDatabase = async (file: File) => {
    const text = await file.text();
    try {
      const parsed = JSON.parse(text);
      const res = await fetch('/api/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: parsed }),
      });
      if (res.ok) {
        window.location.reload();
      }
    } catch (e) {
      alert('Invalid JSON file format');
    }
  };

  // If user is not logged in, render single Login Page
  if (!currentUser) {
    return (
      <LoginPage
        onLoginSuccess={handleLoginSuccess}
        officeLogo={settings.officeLogo}
        officeName={settings.officeName}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* Top Navigation Bar */}
      <Navbar
        currentUser={currentUser}
        settings={settings}
        onLogout={handleLogout}
        onOpenSearch={() => setActiveTab('search')}
        onOpenOcrModal={() => setIsOcrModalOpen(true)}
        toggleSidebarMobile={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
        onSelectTab={(tab) => setActiveTab(tab)}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          activeTab={activeTab}
          onSelectTab={(tab) => setActiveTab(tab)}
          userRole={currentUser.role}
          onLogout={handleLogout}
          isMobileOpen={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
        />

        {/* Main Content View Container */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 bg-gradient-to-br from-slate-50 via-slate-100/80 to-blue-50/30">
          <div className="max-w-7xl mx-auto">
            {activeTab === 'dashboard' && (
              <DashboardView
                currentUser={currentUser}
                registrations={registrations}
                renewals={renewals}
                claims={claims}
                logs={logs}
                onSelectTab={(tab) => setActiveTab(tab)}
                onOpenOcrModal={() => setIsOcrModalOpen(true)}
                onOpenSearch={() => setActiveTab('search')}
              />
            )}

            {activeTab === 'registration' && (
              <RegistrationModule
                registrations={registrations}
                currentUser={currentUser}
                onAddRegistration={handleAddRegistration}
                onUpdateRegistration={handleUpdateRegistration}
                onDeleteRegistration={handleDeleteRegistration}
                onOpenPrintSlip={(type, data) => setPrintModalInfo({ type, data })}
                onClearRegistrations={handleClearRegistrations}
              />
            )}

            {activeTab === 'renewal' && (
              <RenewalModule
                renewals={renewals}
                registrations={registrations}
                currentUser={currentUser}
                onAddRenewal={handleAddRenewal}
                onUpdateRenewal={handleUpdateRenewal}
                onDeleteRenewal={handleDeleteRenewal}
                onOpenPrintSlip={(type, data) => setPrintModalInfo({ type, data })}
                onClearRenewals={handleClearRenewals}
              />
            )}

            {activeTab === 'claim' && (
              <ClaimModule
                claims={claims}
                registrations={registrations}
                schemes={schemes}
                currentUser={currentUser}
                onAddClaim={handleAddClaim}
                onUpdateClaimStatus={handleUpdateClaimStatus}
                onOpenPrintSlip={(type, data) => setPrintModalInfo({ type, data })}
                onResetClaims={handleResetClaims}
              />
            )}

            {activeTab === 'search' && (
              <SearchModule
                registrations={registrations}
                renewals={renewals}
                claims={claims}
                onOpenPrintSlip={(type, data) => setPrintModalInfo({ type, data })}
              />
            )}

            {activeTab === 'reports' && currentUser.role === 'admin' && (
              <ReportsModule
                registrations={registrations}
                renewals={renewals}
                claims={claims}
                users={users}
              />
            )}

            {activeTab === 'user-management' && currentUser.role === 'admin' && (
              <UserManagementModule
                users={users}
                onAddUser={handleAddUser}
                onUpdateUser={handleUpdateUser}
                onResetPassword={handleResetPassword}
              />
            )}

            {activeTab === 'settings' && currentUser.role === 'admin' && (
              <SettingsModule
                settings={settings}
                onUpdateSettings={handleUpdateSettings}
                onBackupDatabase={handleBackupDatabase}
                onRestoreDatabase={handleRestoreDatabase}
              />
            )}

            {activeTab === 'activity-log' && currentUser.role === 'admin' && (
              <ActivityLogModule logs={logs} onClearLogs={handleClearLogs} />
            )}

            {activeTab === 'profile' && (
              <ProfileModule
                currentUser={currentUser}
                onUpdateProfile={async (id, fields) => {
                  await handleUpdateUser(id, fields);
                  setCurrentUser((prev) => (prev ? { ...prev, ...fields } : null));
                }}
              />
            )}
          </div>
        </main>
      </div>

      {/* Print Slip Modal */}
      {printModalInfo && (
        <PrintSlipModal
          type={printModalInfo.type}
          data={printModalInfo.data}
          settings={settings}
          onClose={() => setPrintModalInfo(null)}
        />
      )}

      {/* AI OCR & Utility Modal */}
      {isOcrModalOpen && (
        <FutureFeaturesModal onClose={() => setIsOcrModalOpen(false)} />
      )}
    </div>
  );
}
