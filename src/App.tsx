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
import { MasterExcelSyncModule } from './components/MasterExcelSyncModule';
import { PendingVerificationModule } from './components/PendingVerificationModule';
import { PrintSlipModal } from './components/PrintSlipModal';
import { FutureFeaturesModal } from './components/FutureFeaturesModal';

import {
  User,
  WorkerRegistration,
  WorkerRenewal,
  WorkerClaim,
  WorkerFollowup,
  VerificationReminder,
  ActivityLog,
  OfficeSettings,
  Scheme,
} from './types';
import {
  INITIAL_SETTINGS,
  SCHEMES_LIST,
} from './data/mockData';

import { getStoredAccessToken } from './lib/googleAuth';

export default function App() {
  // Current logged in user (null = show Login page)
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const sessionSaved = sessionStorage.getItem('om_eseva_user');
      if (sessionSaved) return JSON.parse(sessionSaved);
      const localSaved = localStorage.getItem('om_eseva_user');
      return localSaved ? JSON.parse(localSaved) : null;
    } catch {
      sessionStorage.removeItem('om_eseva_user');
      localStorage.removeItem('om_eseva_user');
      return null;
    }
  });

  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Core Data Stores (loaded exclusively from TiDB / MySQL database)
  const [users, setUsers] = useState<User[]>([]);
  const [registrations, setRegistrations] = useState<WorkerRegistration[]>([]);
  const [renewals, setRenewals] = useState<WorkerRenewal[]>([]);
  const [claims, setClaims] = useState<WorkerClaim[]>([]);
  const [followups, setFollowups] = useState<WorkerFollowup[]>([]);
  const [reminders, setReminders] = useState<VerificationReminder[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [settings, setSettings] = useState<OfficeSettings>(INITIAL_SETTINGS);
  const [schemes, setSchemes] = useState<Scheme[]>(SCHEMES_LIST);
  const [customerHistoryQuery, setCustomerHistoryQuery] = useState<string>('');

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

  const loadRegistrations = () => {
    if (!currentUser) return;
    const headers = getAuthHeaders();
    if (currentUser.role === 'admin' || currentUser.permissions?.canRegister) {
      fetch('/api/registrations', { headers })
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) setRegistrations(data);
        })
        .catch(() => {});
    }
  };

  const loadRenewals = () => {
    if (!currentUser) return;
    const headers = getAuthHeaders();
    if (currentUser.role === 'admin' || currentUser.permissions?.canRenew) {
      fetch('/api/renewals', { headers })
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) setRenewals(data);
        })
        .catch(() => {});
    }
  };

  const loadClaims = () => {
    if (!currentUser) return;
    const headers = getAuthHeaders();
    if (currentUser.role === 'admin' || currentUser.permissions?.canClaim) {
      fetch('/api/claims', { headers })
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) setClaims(data);
        })
        .catch(() => {});
    }
  };

  const loadReminders = () => {
    if (!currentUser) return;
    const headers = getAuthHeaders();
    fetch('/api/verification-reminders', { headers })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setReminders(data);
      })
      .catch(() => {});
  };

  const handleUpdateReminder = async (item: VerificationReminder) => {
    try {
      const res = await fetch('/api/verification-reminders', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(item),
      });
      const updated = await res.json();
      if (res.ok) {
        setReminders((prev) => {
          const idx = prev.findIndex((r) => r.id === updated.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = updated;
            return next;
          }
          return [updated, ...prev];
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadFollowups = () => {
    if (!currentUser) return;
    const headers = getAuthHeaders();
    fetch('/api/followups', { headers })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setFollowups(data);
      })
      .catch(() => {});
  };

  const handleAddFollowup = async (data: Partial<WorkerFollowup>) => {
    try {
      const res = await fetch('/api/followups', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(data),
      });
      const created = await res.json();
      if (res.ok) {
        setFollowups((prev) => [created, ...prev]);
      } else {
        alert(created.error || 'Failed to create follow-up');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCompleteFollowup = async (
    id: string,
    completedBy: string,
    completedDate?: string,
    nextFollowupData?: Partial<WorkerFollowup>
  ) => {
    try {
      const res = await fetch(`/api/followups/${id}/complete`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          completedBy,
          completedDate,
          ...(nextFollowupData
            ? {
                nextFollowupDate: (nextFollowupData as any).nextFollowupDate,
                nextFollowupTime: (nextFollowupData as any).nextFollowupTime,
                nextFollowupNote: (nextFollowupData as any).nextFollowupNote,
                nextAssignedUser: (nextFollowupData as any).nextAssignedUser,
              }
            : {}),
        }),
      });
      const updated = await res.json();
      if (res.ok) {
        loadFollowups();
      } else {
        alert(updated.error || 'Failed to complete follow-up');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleUpdateFollowup = async (id: string, updates: Partial<WorkerFollowup>) => {
    try {
      const res = await fetch(`/api/followups/${id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(updates),
      });
      const updated = await res.json();
      if (res.ok) {
        setFollowups((prev) => prev.map((f) => (f.id === id ? updated : f)));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteFollowup = async (id: string) => {
    try {
      const res = await fetch(`/api/followups/${id}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        setFollowups((prev) => prev.filter((f) => f.id !== id));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleOpenCustomerHistory = (query: string) => {
    setCustomerHistoryQuery(query);
    setActiveTab('customer-history');
  };

  // Fetch initial data & sync permissions from server APIs
  useEffect(() => {
    if (!currentUser) return;

    const headers = getAuthHeaders();

    // Sync current user profile and permissions directly from MySQL database
    fetch('/api/auth/me', {
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': currentUser.id,
        'x-user-username': currentUser.username,
      },
    })
      .then((res) => {
        if (res.status === 403) {
          handleLogout();
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (data && data.id && !data.error) {
          setCurrentUser(data);
          if (localStorage.getItem('om_eseva_user')) {
            localStorage.setItem('om_eseva_user', JSON.stringify(data));
          } else {
            sessionStorage.setItem('om_eseva_user', JSON.stringify(data));
          }
        }
      })
      .catch(() => {});

    loadRegistrations();
    loadRenewals();
    loadClaims();
    loadFollowups();
    loadReminders();

    // Fetch Admin-only datasets
    if (currentUser.role === 'admin') {
      fetch('/api/users', { headers })
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) setUsers(data);
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
  const handleLoginSuccess = (user: User, rememberMe: boolean = false) => {
    setCurrentUser(user);
    if (rememberMe) {
      localStorage.setItem('om_eseva_user', JSON.stringify(user));
      sessionStorage.removeItem('om_eseva_user');
    } else {
      sessionStorage.setItem('om_eseva_user', JSON.stringify(user));
      localStorage.removeItem('om_eseva_user');
    }
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
    sessionStorage.removeItem('om_eseva_user');
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
        body: JSON.stringify(updatedFields),
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
          currentUser={currentUser}
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
                users={users}
                onAddRegistration={handleAddRegistration}
                onUpdateRegistration={handleUpdateRegistration}
                onDeleteRegistration={handleDeleteRegistration}
                onOpenPrintSlip={(type, data) => setPrintModalInfo({ type, data })}
                onClearRegistrations={currentUser.role === 'admin' ? handleClearRegistrations : undefined}
              />
            )}

            {activeTab === 'pending-verification' && (
              <PendingVerificationModule
                registrations={registrations}
                renewals={renewals}
                claims={claims}
                reminders={reminders}
                currentUser={currentUser}
                users={users}
                settings={settings}
                onUpdateReminder={handleUpdateReminder}
                onUpdateRegistrationStatus={async (id, status) => {
                  await handleUpdateRegistration(id, { status: status as any, appStatus: status as any });
                  loadRegistrations();
                }}
                onUpdateRenewalStatus={async (id, status) => {
                  await handleUpdateRenewal(id, { status: status as any });
                  loadRenewals();
                }}
                onUpdateClaimStatus={async (id, status) => {
                  await handleUpdateClaimStatus(id, status as any);
                  loadClaims();
                }}
                onUpdateSettings={handleUpdateSettings}
              />
            )}

            {activeTab === 'master-excel-sync' && (
              <MasterExcelSyncModule
                currentUser={currentUser}
                registrations={registrations}
                renewals={renewals}
                onRefreshRegistrations={loadRegistrations}
                onRefreshRenewals={loadRenewals}
              />
            )}

            {activeTab === 'renewal' && (
              <RenewalModule
                renewals={renewals}
                registrations={registrations}
                currentUser={currentUser}
                users={users}
                onAddRenewal={handleAddRenewal}
                onUpdateRenewal={handleUpdateRenewal}
                onDeleteRenewal={handleDeleteRenewal}
                onOpenPrintSlip={(type, data) => setPrintModalInfo({ type, data })}
                onClearRenewals={currentUser.role === 'admin' ? handleClearRenewals : undefined}
              />
            )}

            {activeTab === 'claim' && (
              <ClaimModule
                claims={claims}
                registrations={registrations}
                schemes={schemes}
                currentUser={currentUser}
                users={users}
                onAddClaim={handleAddClaim}
                onUpdateClaimStatus={handleUpdateClaimStatus}
                onOpenPrintSlip={(type, data) => setPrintModalInfo({ type, data })}
                onResetClaims={currentUser.role === 'admin' ? handleResetClaims : undefined}
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
              <ActivityLogModule logs={logs} currentUser={currentUser} onClearLogs={handleClearLogs} />
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
