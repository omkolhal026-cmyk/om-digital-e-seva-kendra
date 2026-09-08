import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { google } from 'googleapis';
import bcrypt from 'bcryptjs';
import {
  initMySQL,
  isMySQLConnected,
  getMySQLStatus,
  authenticateMySQLUser,
  getMySQLUsers,
  createMySQLUser,
  updateMySQLUser,
  deleteMySQLUser,
  getMySQLRegistrations,
  createMySQLRegistration,
  updateMySQLRegistration,
  updateMySQLRegistrationByMH,
  deleteMySQLRegistration,
  clearMySQLRegistrations,
  getMySQLRenewals,
  getRenewalByMhNumber,
  createMySQLRenewal,
  updateMySQLRenewal,
  deleteMySQLRenewal,
  clearMySQLRenewals,
  getWorkerRenewalHistory,
  checkDuplicateRenewal,
  createDoubleRenewal,
  getMySQLClaims,
  createMySQLClaim,
  updateMySQLClaim,
  deleteMySQLClaim,
  clearMySQLClaims,
  getMySQLApprovals,
  createMySQLApproval,
  bulkCreateMySQLApprovals,
  updateMySQLApproval,
  deleteMySQLApproval,
  clearMySQLApprovals,
  addMySQLLog,
  getMySQLLogs,
  clearMySQLLogs,
  getMySQLSettings,
  updateMySQLSettings,
  getMySQLReports,
  createMySQLReport,
  getMySQLFollowups,
  createMySQLFollowup,
  completeMySQLFollowup,
  updateMySQLFollowup,
  deleteMySQLFollowup,
  getMySQLVerificationReminders,
  upsertMySQLVerificationReminder,
  getMySQLMaterialDistributions,
  updateMySQLMaterialStatus,
  getMySQLWhatsappGroupTrackings,
  updateMySQLWhatsappGroupTrackingStatus,
  hashPassword,
  createMySQLIwbmsJob,
  fetchNextPendingIwbmsJob,
  startIwbmsJob,
  completeIwbmsJob,
  failIwbmsJob,
  retryIwbmsJob,
  getMySQLIwbmsJobById,
  getLatestMySQLIwbmsJobByMh,
  listMySQLIwbmsJobs,
  recordWorkerHeartbeat,
  getWorkerHeartbeatStatus,
  getMySQLIwbmsJobCounts,
  createMySQLIwbmsBatchJobs,
  retryAllFailedIwbmsJobs,
  recoverStaleProcessingIwbmsJobs,
  getIwbmsCheckHistory,
  getMySQLSubAgentStats,
  getMySQLAllSubAgentsSummary,
  getMySQLSubAgentRegistrations,
  getMySQLSubAgentRenewals,
  getMySQLSubAgentClaims,
  getMySQLCommissionSettings,
  updateMySQLCommissionSettings,
  getMySQLClaimPaymentLists,
  getMySQLClaimPaymentListByNumber,
  createMySQLClaimPaymentList,
  updateMySQLClaimPaymentList,
  deleteMySQLClaimPaymentList,
  getMySQLClaimPaymentWorkers,
  getMySQLClaimPaymentWorkerById,
  updateMySQLClaimPaymentWorker,
  deleteMySQLClaimPaymentWorker,
  importMySQLClaimPaymentWorkers,
  addMySQLClaimCommissionCollection,
  deleteMySQLClaimCommissionCollection,
  getMySQLClaimCommissionCollections,
  getMySQLClaimPaymentExpenses,
  createMySQLClaimPaymentExpense,
  deleteMySQLClaimPaymentExpense,
  getMySQLClaimOfficerCommissions,
  updateMySQLClaimOfficerCommission,
  getMySQLClaimPaymentsDashboardStats,
  getMySQLIncomeCollections,
  syncIncomeCollectionRecord,
  deleteIncomeCollectionBySource,
  resetMySQLIncomeCollections,
  searchMySQLUniversal,
  getMySQLDashboardSummary,
  insertMySQLRegistrationsBulk,
  insertMySQLRenewalsBulk,
} from './src/db/mysql.js';
import { SCHEMES_LIST } from './src/data/mockData.js';
import {
  WorkerRegistration,
  WorkerRenewal,
  WorkerClaim,
  ApprovalRecord,
  ActivityLog,
  User,
  OfficeSettings,
  IwbmsResultStatus,
} from './src/types.js';
import {
  normalizeRenewalYear,
  getFinancialYearFromDate,
  getNextRenewalYear,
} from './src/utils/renewalYearUtils.js';

const __filename_val = typeof __filename !== 'undefined'
  ? __filename
  : (typeof import.meta !== 'undefined' && import.meta.url ? fileURLToPath(import.meta.url) : '');
const __dirname_val = typeof __dirname !== 'undefined'
  ? __dirname
  : path.dirname(__filename_val);

const SPREADSHEET_ID = '157MB8ZZaXOkOf8vde_3ofgyTr0rToCF70w0SUrvLIu8';
const PORT = 3000;
let savedGoogleAccessToken: string | null = null;

// Helper function to get Google Sheets client with OAuth access token or ADC fallback
function getSheetsClient(token?: string) {
  const activeToken = token || savedGoogleAccessToken;
  if (activeToken) {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: activeToken });
    return google.sheets({ version: 'v4', auth });
  }
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

// Append Registration row to Google Sheets
async function appendRegistrationToSheet(reg: WorkerRegistration, token?: string) {
  try {
    const activeToken = token || savedGoogleAccessToken;
    if (!activeToken) return;
    const sheets = getSheetsClient(activeToken);
    const values = [
      [
        'REGISTRATION',
        reg.id,
        reg.registrationDate,
        reg.verificationDate || '',
        reg.mhNumber,
        reg.workerName,
        reg.gender || '',
        reg.dob || '',
        reg.mobileNumber,
        reg.aadhaarNumber,
        reg.taluka,
        reg.address || '',
        reg.category || '',
        reg.natureOfWork || '',
        reg.feePaid,
        reg.status,
        reg.operatorName,
      ],
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values },
    });
    console.log(`[Google Sheets] Synced registration ${reg.id} to sheet.`);
  } catch (err: any) {
    console.log(`[Google Sheets Note]: Background sync skipped (${err?.message || err}). Record saved in MySQL.`);
  }
}

// Append Renewal row to Google Sheets
async function appendRenewalToSheet(ren: WorkerRenewal, token?: string) {
  try {
    const activeToken = token || savedGoogleAccessToken;
    if (!activeToken) return;
    const sheets = getSheetsClient(activeToken);
    const values = [
      [
        'RENEWAL',
        ren.id,
        ren.renewalDate,
        ren.verificationDate || '',
        ren.mhNumber,
        ren.workerName,
        '',
        '',
        ren.mobileNumber,
        '',
        ren.taluka,
        `Renewed ${ren.renewedYears || ren.renewalPeriodYears || 1} Yrs (Receipt: ${ren.receiptNumber || 'N/A'}, Expiry: ${ren.newExpiryDate || ren.validTill || ''})`,
        '',
        '',
        ren.feeAmount || 0,
        ren.status,
        ren.operatorName,
      ],
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: 'A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: { values },
    });
    console.log(`[Google Sheets] Synced renewal ${ren.id} to sheet.`);
  } catch (err: any) {
    console.log(`[Google Sheets Note]: Background sync skipped (${err?.message || err}). Record saved in MySQL.`);
  }
}

// Full Sync to Google Sheets from MySQL
async function syncAllToGoogleSheet(token?: string) {
  const sheets = getSheetsClient(token);
  const registrations = await getMySQLRegistrations();
  const renewals = await getMySQLRenewals();

  const headers = [
    'TYPE',
    'ID',
    'Registration / Renewal Date',
    'Verification Date',
    'MH Number',
    'Worker Name',
    'Gender',
    'DOB',
    'Mobile',
    'Aadhaar',
    'Taluka',
    'Address / Details',
    'Category',
    'Nature of Work',
    'Fee Paid (₹)',
    'Status',
    'Operator',
  ];

  const regRows = registrations.map(r => [
    'REGISTRATION',
    r.id,
    r.registrationDate,
    r.verificationDate || '',
    r.mhNumber,
    r.workerName,
    r.gender || '',
    r.dob || '',
    r.mobileNumber,
    r.aadhaarNumber,
    r.taluka,
    r.address || '',
    r.category || '',
    r.natureOfWork || '',
    r.feePaid,
    r.status,
    r.operatorName,
  ]);

  const renRows = renewals.map(r => [
    'RENEWAL',
    r.id,
    r.renewalDate,
    r.verificationDate || '',
    r.mhNumber,
    r.workerName,
    '',
    '',
    r.mobileNumber,
    '',
    r.taluka,
    `Renewed ${r.renewedYears || r.renewalPeriodYears || 1} Yrs (Receipt: ${r.receiptNumber || 'N/A'}, Expiry: ${r.newExpiryDate || r.validTill || ''})`,
    '',
    '',
    r.feeAmount || 0,
    r.status,
    r.operatorName,
  ]);

  const allValues = [headers, ...regRows, ...renRows];

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: 'A1',
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: allValues },
  });
}

function addLog(username: string, role: any, action: any, details: string, ip: string = '127.0.0.1') {
  const newLog: ActivityLog = {
    id: `log-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    timestamp: new Date().toISOString(),
    username,
    userRole: role,
    action,
    details,
    ipAddress: ip,
  };
  addMySQLLog(newLog).catch(console.error);
}

async function startServer() {
  try {
    await initMySQL();
  } catch (err: any) {
    console.error('====================================================');
    console.error('[FATAL DATABASE ERROR] Application stopped because TiDB connection failed:');
    console.error(err?.message || err);
    console.error('====================================================');
    process.exit(1);
  }

  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // Health check & status
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      app: 'OM DIGITAL E-SEVA KENDRA',
      mysql: getMySQLStatus(),
    });
  });

  app.get('/api/mysql/status', (_req, res) => {
    res.json(getMySQLStatus());
  });  // Auth Endpoints
  async function checkUserPermission(
    req: express.Request,
    requiredPerm:
      | 'canRegister'
      | 'canRenew'
      | 'canClaim'
      | 'canExport'
      | 'canSeeIwbmsChecker'
      | 'adminOnly'
      | 'canSeeSubAgentManagement'
      | 'canSeeClaimPayments'
      | 'canManageClaimPayments'
      | 'canManageCommissionSettings'
      | 'canManageExpenses'
      | 'canManageOfficerCommission'
      | 'canExportClaimPayments'
  ) {
    const userId = (req.headers['x-user-id'] as string) || '';
    const rawUsername = ((req.headers['x-user-username'] as string) || '').trim().toLowerCase();

    if (!userId && !rawUsername) {
      return { allowed: true };
    }

    const allUsers = await getMySQLUsers();
    let user = userId ? allUsers.find((u) => String(u.id) === String(userId)) : undefined;
    if (!user && rawUsername) {
      if (rawUsername === 'admin' || rawUsername === 'om' || rawUsername === 'omkar') {
        user = allUsers.find((u) => u.role === 'admin' || u.id === 'usr-admin-1');
      }
      if (!user) {
        user = allUsers.find((u) => u.username && u.username.toLowerCase() === rawUsername);
      }
    }

    // If user is recognized as primary admin or has role admin
    const isAdminUser = user && (user.role === 'admin' || ['admin', 'om', 'omkar'].includes((user.username || '').toLowerCase()));

    if (!user) {
      // If user header says admin or om
      if (
        rawUsername === 'admin' ||
        rawUsername === 'om' ||
        rawUsername === 'omkar' ||
        rawUsername.includes('admin') ||
        userId.toLowerCase().includes('admin')
      ) {
        const dbAdmin = allUsers.find((u) => u.role === 'admin' || u.id === 'usr-admin-1');
        return { allowed: true, user: dbAdmin || ({ id: userId || 'usr-admin-1', username: rawUsername || 'admin', role: 'admin' } as any) };
      }

      // If an operator was deleted or ID not in DB, but this is a general read endpoint (not adminOnly):
      if (requiredPerm !== 'adminOnly') {
        return { allowed: true, user: { id: userId, username: rawUsername || 'operator', role: 'operator' } as any };
      }
      return { allowed: false, status: 403, error: 'Access Denied: Admin role required for this operation.' };
    }

    if (user.status === 'disabled') {
      return { allowed: false, status: 403, error: 'This operator account is disabled by Admin.' };
    }

    if (isAdminUser || user.role === 'admin') {
      return { allowed: true, user };
    }

    if (requiredPerm === 'adminOnly') {
      return { allowed: false, status: 403, error: 'Access Denied: Admin role required for this operation.' };
    }

    if (requiredPerm === 'canSeeSubAgentManagement') {
      if (user.permissions?.canSeeSubAgentManagement) {
        return { allowed: true, user };
      }
      return { allowed: false, status: 403, error: 'Access Denied: You do not have permission for Sub-Agent Management.' };
    }

    if (requiredPerm === 'canManageCommissionSettings') {
      if (user.permissions?.canManageCommissionSettings) {
        return { allowed: true, user };
      }
      return { allowed: false, status: 403, error: 'Access Denied: Only Admin can modify Commission Settings.' };
    }

    // Sub-Agents permissions
    if (user.role === 'sub_agent') {
      if (requiredPerm === 'canRegister' || requiredPerm === 'canRenew' || requiredPerm === 'canClaim' || requiredPerm === 'canSeeClaimPayments' || requiredPerm === 'canManageClaimPayments') {
        return { allowed: true, user };
      }
      if (requiredPerm === 'canExport' || requiredPerm === 'canExportClaimPayments') {
        return (user.permissions?.canExport || user.permissions?.canExportClaimPayments)
          ? { allowed: true, user }
          : { allowed: false, status: 403, error: 'Access Denied: You do not have permission to export data.' };
      }
      return { allowed: false, status: 403, error: 'Access Denied for this module.' };
    }

    if (requiredPerm === 'canRegister' && !user.permissions?.canRegister) {
      return { allowed: false, status: 403, error: 'Access Denied: You do not have permission for Registration module.' };
    }

    if (requiredPerm === 'canRenew' && !user.permissions?.canRenew) {
      return { allowed: false, status: 403, error: 'Access Denied: You do not have permission for Renewal module.' };
    }

    if (requiredPerm === 'canClaim' && !user.permissions?.canClaim) {
      return { allowed: false, status: 403, error: 'Access Denied: You do not have permission for Claim Management module.' };
    }

    if (requiredPerm === 'canExport' && !user.permissions?.canExport) {
      return { allowed: false, status: 403, error: 'Access Denied: You do not have permission to export data.' };
    }

    if (requiredPerm === 'canSeeIwbmsChecker' && !user.permissions?.canSeeIwbmsChecker) {
      return { allowed: false, status: 403, error: 'Access Denied: You do not have permission for IWBMS Status Checker.' };
    }

    if (requiredPerm === 'canSeeClaimPayments' && user.permissions?.canSeeClaimPayments === false) {
      return { allowed: false, status: 403, error: 'Access Denied: You do not have permission for Claim Payments module.' };
    }

    if (requiredPerm === 'canManageClaimPayments' && user.permissions?.canManageClaimPayments === false) {
      return { allowed: false, status: 403, error: 'Access Denied: You do not have permission to manage Claim Payments.' };
    }

    if (requiredPerm === 'canManageExpenses' && user.permissions?.canManageExpenses === false) {
      return { allowed: false, status: 403, error: 'Access Denied: You do not have permission to manage Expenses.' };
    }

    if (requiredPerm === 'canManageOfficerCommission' && user.permissions?.canManageOfficerCommission === false) {
      return { allowed: false, status: 403, error: 'Access Denied: You do not have permission to manage Officer Commission.' };
    }

    if (requiredPerm === 'canExportClaimPayments' && user.permissions?.canExportClaimPayments === false) {
      return { allowed: false, status: 403, error: 'Access Denied: You do not have permission to export Claim Payments.' };
    }

    return { allowed: true, user };
  }

  app.get('/api/auth/me', async (req, res) => {
    try {
      const userId = (req.headers['x-user-id'] as string) || '';
      const username = ((req.headers['x-user-username'] as string) || '').trim().toLowerCase();

      if (!userId && !username) {
        return res.status(400).json({ error: 'User identification header missing' });
      }

      const allUsers = await getMySQLUsers();
      let user: any = null;

      // 1. If admin header, match primary admin account first
      if (
        username === 'admin' ||
        username === 'om' ||
        username === 'omkar' ||
        userId.toLowerCase().includes('admin')
      ) {
        user = allUsers.find((u) => u.role === 'admin' || u.id === 'usr-admin-1');
      }

      // 2. Match by exact ID
      if (!user && userId) {
        user = allUsers.find((u) => String(u.id) === String(userId));
      }

      // 3. Match by username
      if (!user && username) {
        user = allUsers.find((u) => u.username && u.username.toLowerCase() === username);
      }

      if (!user) {
        return res.status(404).json({ error: 'User session expired or user not found in database' });
      }

      if (user.status === 'disabled') {
        return res.status(403).json({ error: 'User account is disabled' });
      }

      res.json(user);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error fetching current user' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const { usernameOrMobile, password } = req.body;
      if (!usernameOrMobile || !password) {
        return res.status(400).json({ error: 'Username/Mobile and password are required' });
      }

      const mysqlUser = await authenticateMySQLUser(usernameOrMobile, password);
      if (mysqlUser) {
        if (mysqlUser.status === 'disabled') {
          return res.status(403).json({ error: 'This user account is currently disabled by Admin.' });
        }
        addLog(mysqlUser.username, mysqlUser.role, 'LOGIN', `User ${mysqlUser.name} (${mysqlUser.role}) logged in successfully via MySQL.`);
        return res.json({
          success: true,
          user: mysqlUser,
          token: `token_${mysqlUser.id}_${Date.now()}`,
          database: 'mysql',
        });
      }

      return res.status(401).json({ error: 'Invalid credentials or user account disabled.' });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || 'Database error during authentication' });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    const { username, role } = req.body;
    if (username) {
      addLog(username, role || 'operator', 'LOGOUT', `User ${username} logged out.`);
    }
    res.json({ success: true });
  });

  // Fast Aggregated Dashboard Stats API
  app.get('/api/dashboard/stats', async (req, res) => {
    try {
      const userId = (req.headers['x-user-id'] as string) || '';
      const userRole = (req.headers['x-user-role'] as string) || '';
      const userIdFilter = userRole === 'sub_agent' ? userId : undefined;
      const stats = await getMySQLDashboardSummary(userIdFilter);
      res.json(stats);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Dashboard stats error' });
    }
  });

  // Fast Indexed Universal Search API
  app.get('/api/search', async (req, res) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q : '';
      const category = typeof req.query.category === 'string' ? (req.query.category as any) : 'all';
      const taluka = typeof req.query.taluka === 'string' ? req.query.taluka : undefined;
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : 50;

      const userId = (req.headers['x-user-id'] as string) || '';
      const userRole = (req.headers['x-user-role'] as string) || '';
      const userIdFilter = userRole === 'sub_agent' ? userId : undefined;

      const results = await searchMySQLUniversal(q, {
        category,
        taluka,
        status,
        limit,
        userIdFilter,
      });
      res.json(results);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Search error' });
    }
  });

  // Registrations API
  app.get('/api/registrations', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canRegister');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      const filterUserId = perm.user?.role === 'sub_agent' ? perm.user.id : undefined;
      const mysqlRegs = await getMySQLRegistrations(filterUserId);
      res.json(mysqlRegs);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error fetching registrations' });
    }
  });

  app.post('/api/registrations/bulk', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canRegister');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });
      const records = Array.isArray(req.body.records) ? req.body.records : (Array.isArray(req.body) ? req.body : []);
      if (records.length === 0) return res.json({ success: true, count: 0, data: [] });

      const processed = records.map((r: any) => ({
        ...r,
        createdByUserId: perm.user?.id || r.createdByUserId || undefined,
        createdBy: perm.user?.name || perm.user?.username || r.createdBy || undefined,
        operatorName: perm.user?.name || perm.user?.username || r.operatorName || 'Operator',
      }));

      const inserted = await insertMySQLRegistrationsBulk(processed);
      res.json({ success: true, count: inserted.length, data: inserted });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Bulk registration error' });
    }
  });

  app.post('/api/registrations', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canRegister');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      const currentSettings = await getMySQLSettings();
      const bodyData = { ...req.body };
      delete bodyData.id;
      delete bodyData['Sr No'];
      delete bodyData['SR NO'];
      delete bodyData['ID'];

      const newRegData: WorkerRegistration = {
        ...bodyData,
        registrationDate: req.body.registrationDate || new Date().toISOString().split('T')[0],
        status: req.body.status || 'Active',
        feePaid: req.body.feePaid || currentSettings?.registrationFee || 100,
        paymentAmount: req.body.paymentAmount !== undefined && req.body.paymentAmount !== '' && !isNaN(Number(req.body.paymentAmount)) 
          ? Number(req.body.paymentAmount) 
          : (req.body.paymentMode === 'N/A' ? 0 : undefined),
        paymentMode: req.body.paymentMode === 'Online' ? 'Online' : (req.body.paymentMode === 'N/A' ? 'N/A' : 'Cash'),
        mhNumber: req.body.mhNumber || '',
        createdByUserId: perm.user?.id || req.body.createdByUserId || undefined,
        createdBy: perm.user?.name || perm.user?.username || req.body.createdBy || undefined,
        operatorName: perm.user?.name || perm.user?.username || req.body.operatorName || 'Operator',
      };

      const googleAccessToken = (req.headers['x-google-access-token'] as string) || req.body.googleAccessToken;
      if (googleAccessToken) {
        savedGoogleAccessToken = googleAccessToken;
      }

      const savedReg = await createMySQLRegistration(newRegData);
      appendRegistrationToSheet(savedReg, googleAccessToken);
      addLog(
        savedReg.operatorName || 'System',
        (perm.user?.role as any) || 'operator',
        'REGISTRATION_CREATE',
        `Registered worker ${savedReg.workerName} (${savedReg.mhNumber}) in Taluka ${savedReg.taluka}.${perm.user?.role === 'sub_agent' ? ' (Sub-Agent entry)' : ''}`
      );

      // Auto sync with Income Collection if amount is valid
      await syncIncomeCollectionRecord({
        sourceType: 'Registration',
        sourceId: String(savedReg.id),
        workerName: savedReg.workerName,
        mhNumber: savedReg.mhNumber || '',
        paymentDate: savedReg.registrationDate || new Date().toISOString().split('T')[0],
        paymentAmount: savedReg.paymentAmount,
        paymentMode: savedReg.paymentMode,
        operatorName: savedReg.operatorName || 'Operator',
        taluka: savedReg.taluka || '',
      });

      res.status(201).json(savedReg);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error creating registration' });
    }
  });

  app.put('/api/registrations/:id', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canRegister');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      const { id } = req.params;
      const updated = await updateMySQLRegistration(id, req.body);
      addLog(
        req.body.operatorName || 'Admin',
        'admin',
        'REGISTRATION_EDIT',
        `Updated registration record ${id}.`
      );

      const finalRecord = updated || { id, ...req.body };
      await syncIncomeCollectionRecord({
        sourceType: 'Registration',
        sourceId: String(id),
        workerName: finalRecord.workerName,
        mhNumber: finalRecord.mhNumber || '',
        paymentDate: finalRecord.registrationDate || new Date().toISOString().split('T')[0],
        paymentAmount: finalRecord.paymentAmount,
        paymentMode: finalRecord.paymentMode,
        operatorName: finalRecord.operatorName || 'Operator',
        taluka: finalRecord.taluka || '',
      });

      res.json(finalRecord);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error updating registration' });
    }
  });

  app.delete('/api/registrations/:id', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canRegister');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      const { id } = req.params;
      await deleteIncomeCollectionBySource('Registration', id);
      await deleteMySQLRegistration(id);
      addLog(
        (req.query.operator as string) || 'Admin',
        'admin',
        'REGISTRATION_DELETE',
        `Deleted registration ${id}.`
      );
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error deleting registration' });
    }
  });

  app.delete('/api/registrations', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'adminOnly');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      await clearMySQLRegistrations();
      addLog(
        (req.query.operator as string) || 'Admin',
        'admin',
        'REGISTRATION_CLEAR',
        'Cleared all registration entries.'
      );
      res.json({ success: true, message: 'All registrations cleared.' });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error clearing registrations' });
    }
  });

  // Renewals API
  app.get('/api/renewals/history', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canRenew');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      const mhNumber = req.query.mhNumber as string;
      const aadhaarNumber = req.query.aadhaarNumber as string;
      const mobileNumber = req.query.mobileNumber as string;
      const identifier = req.query.identifier as string;

      let searchMh = mhNumber;
      let searchAadhaar = aadhaarNumber;
      let searchMobile = mobileNumber;

      if (identifier && !searchMh && !searchAadhaar && !searchMobile) {
        const clean = identifier.trim();
        if (/^MH/i.test(clean)) {
          searchMh = clean;
        } else if (/^\d{12}$/.test(clean)) {
          searchAadhaar = clean;
        } else if (/^\d{10}$/.test(clean)) {
          searchMobile = clean;
        } else {
          searchMh = clean;
        }
      }

      const history = await getWorkerRenewalHistory({
        mhNumber: searchMh,
        aadhaarNumber: searchAadhaar,
        mobileNumber: searchMobile,
      });

      res.json(history);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error fetching renewal history' });
    }
  });

  app.get('/api/renewals', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canRenew');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      const filterUserId = perm.user?.role === 'sub_agent' ? perm.user.id : undefined;
      const mysqlRenewals = await getMySQLRenewals(filterUserId);
      res.json(mysqlRenewals);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error fetching renewals' });
    }
  });

  app.post('/api/renewals/bulk', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canRenew');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });
      const records = Array.isArray(req.body.records) ? req.body.records : (Array.isArray(req.body) ? req.body : []);
      if (records.length === 0) return res.json({ success: true, count: 0, data: [] });

      const processed = records.map((r: any) => ({
        ...r,
        createdByUserId: perm.user?.id || r.createdByUserId || undefined,
        createdBy: perm.user?.name || perm.user?.username || r.createdBy || undefined,
        operatorName: perm.user?.name || perm.user?.username || r.operatorName || 'Operator',
      }));

      const inserted = await insertMySQLRenewalsBulk(processed);
      res.json({ success: true, count: inserted.length, data: inserted });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Bulk renewal error' });
    }
  });

  app.post('/api/renewals', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canRenew');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      const rawMh = req.body.mhNumber ? String(req.body.mhNumber).trim() : '';
      const rawAadhaar = req.body.aadhaarNumber ? String(req.body.aadhaarNumber).trim() : '';
      const rawMobile = req.body.mobileNumber ? String(req.body.mobileNumber).trim() : '';

      const targetYear = req.body.renewalYear
        ? normalizeRenewalYear(req.body.renewalYear)
        : getFinancialYearFromDate(req.body.renewalDate);

      // Check duplicate renewal for targetYear (skip if allowDuplicate is confirmed)
      if ((rawMh || rawAadhaar || rawMobile) && !req.body.allowDuplicate && !req.body.forceSave) {
        const dupCheck = await checkDuplicateRenewal({
          mhNumber: rawMh,
          aadhaarNumber: rawAadhaar,
          mobileNumber: rawMobile,
          renewalYear: targetYear,
          excludeId: req.body.id || undefined,
        });

        if (dupCheck.isDuplicate) {
          return res.status(400).json({
            error: `This renewal year (${targetYear}) is already completed. (या कामगारासाठी ${targetYear} या वर्षाचे नूतनीकरण आधीच पूर्ण झाले आहे!)`,
            isDuplicate: true,
            existingRenewal: dupCheck.existingRenewal,
          });
        }
      }

      const currentSettings = await getMySQLSettings();
      const generateUniqueRenewalId = () => {
        const year = new Date().getFullYear();
        const ts = Date.now().toString(36).toUpperCase();
        const rnd = Math.random().toString(36).substring(2, 8).toUpperCase();
        return `REN-${year}-${ts}-${rnd}`;
      };

      const newRenewal: WorkerRenewal = {
        ...req.body,
        id: (req.body.id && typeof req.body.id === 'string' && req.body.id.trim().length > 0)
          ? req.body.id.trim()
          : generateUniqueRenewalId(),
        renewalDate: req.body.renewalDate || new Date().toISOString().split('T')[0],
        renewalYear: targetYear,
        aadhaarNumber: rawAadhaar || undefined,
        status: req.body.status || 'Pending',
        feeAmount: req.body.feeAmount || currentSettings?.renewalFee || 50,
        paymentAmount: req.body.paymentAmount !== undefined && req.body.paymentAmount !== '' && !isNaN(Number(req.body.paymentAmount)) 
          ? Number(req.body.paymentAmount) 
          : (req.body.paymentMode === 'N/A' ? 0 : undefined),
        paymentMode: req.body.paymentMode === 'Online' ? 'Online' : (req.body.paymentMode === 'N/A' ? 'N/A' : 'Cash'),
        createdByUserId: perm.user?.id || req.body.createdByUserId || undefined,
        createdBy: perm.user?.name || perm.user?.username || req.body.createdBy || undefined,
        operatorName: perm.user?.name || perm.user?.username || req.body.operatorName || 'Operator',
      };

      const googleAccessToken = (req.headers['x-google-access-token'] as string) || req.body.googleAccessToken;
      if (googleAccessToken) {
        savedGoogleAccessToken = googleAccessToken;
      }

      const savedRenewal = await createMySQLRenewal(newRenewal);
      appendRenewalToSheet(savedRenewal, googleAccessToken);
      addLog(
        savedRenewal.operatorName || 'System',
        (perm.user?.role as any) || 'operator',
        'RENEWAL_CREATE',
        `Processed renewal ${savedRenewal.id} (${savedRenewal.renewalYear}) for MH No: ${savedRenewal.mhNumber} (${savedRenewal.workerName}). Status: ${savedRenewal.status}${perm.user?.role === 'sub_agent' ? ' (Sub-Agent entry)' : ''}`
      );

      // Auto sync with Income Collection if amount is valid
      await syncIncomeCollectionRecord({
        sourceType: 'Renewal',
        sourceId: String(savedRenewal.id),
        workerName: savedRenewal.workerName,
        mhNumber: savedRenewal.mhNumber || '',
        paymentDate: savedRenewal.renewalDate || new Date().toISOString().split('T')[0],
        paymentAmount: savedRenewal.paymentAmount,
        paymentMode: savedRenewal.paymentMode,
        operatorName: savedRenewal.operatorName || 'Operator',
        taluka: savedRenewal.taluka || '',
      });

      res.status(201).json(savedRenewal);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error creating renewal' });
    }
  });

  app.put('/api/renewals/:id', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canRenew');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      const { id } = req.params;
      const updated = await updateMySQLRenewal(id, req.body);
      addLog(
        req.body.operatorName || 'Admin',
        'admin',
        'RENEWAL_EDIT',
        `Updated renewal record ${id}. Status set to: ${req.body.status || updated?.status}`
      );

      const finalRecord = updated || { id, ...req.body };
      await syncIncomeCollectionRecord({
        sourceType: 'Renewal',
        sourceId: String(id),
        workerName: finalRecord.workerName,
        mhNumber: finalRecord.mhNumber || '',
        paymentDate: finalRecord.renewalDate || new Date().toISOString().split('T')[0],
        paymentAmount: finalRecord.paymentAmount,
        paymentMode: finalRecord.paymentMode,
        operatorName: finalRecord.operatorName || 'Operator',
        taluka: finalRecord.taluka || '',
      });

      res.json(finalRecord);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error updating renewal' });
    }
  });

  app.delete('/api/renewals/:id', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canRenew');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      const { id } = req.params;
      await deleteIncomeCollectionBySource('Renewal', id);
      await deleteMySQLRenewal(id);
      addLog(
        (req.query.operator as string) || 'Admin',
        'admin',
        'RENEWAL_EDIT',
        `Deleted renewal record ${id}.`
      );
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error deleting renewal' });
    }
  });

  app.delete('/api/renewals', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'adminOnly');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      await clearMySQLRenewals();
      addLog(
        (req.query.operator as string) || 'Admin',
        'admin',
        'RENEWAL_CLEAR',
        'Cleared all renewal entries.'
      );
      res.json({ success: true, message: 'All renewals cleared.' });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error clearing renewals' });
    }
  });

  // Claims API
  app.get('/api/claims', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canClaim');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      const filterUserId = perm.user?.role === 'sub_agent' ? perm.user.id : undefined;
      const mysqlClaims = await getMySQLClaims(filterUserId);
      res.json(mysqlClaims);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error fetching claims' });
    }
  });

  app.get('/api/schemes', (_req, res) => {
    res.json(SCHEMES_LIST);
  });

  app.post('/api/claims', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canClaim');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      const currentSettings = await getMySQLSettings();
      const newClaim: WorkerClaim = {
        ...req.body,
        id: `CLM-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
        claimDate: req.body.claimDate || new Date().toISOString().split('T')[0],
        status: req.body.status || (currentSettings?.autoApproveClaims ? 'Approved' : 'Submitted'),
        createdByUserId: perm.user?.id || req.body.createdByUserId || undefined,
        createdBy: perm.user?.name || perm.user?.username || req.body.createdBy || undefined,
        operatorName: perm.user?.name || perm.user?.username || req.body.operatorName || 'Operator',
      };

      const savedClaim = await createMySQLClaim(newClaim);
      addLog(
        savedClaim.operatorName || 'System',
        (perm.user?.role as any) || 'operator',
        'CLAIM_SUBMIT',
        `Submitted claim ${savedClaim.id} for ${savedClaim.workerName} (Amount: ₹${savedClaim.totalAmount}).${perm.user?.role === 'sub_agent' ? ' (Sub-Agent entry)' : ''}`
      );

      res.status(201).json(savedClaim);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error creating claim' });
    }
  });

  app.put('/api/claims/:id', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canClaim');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      const { id } = req.params;
      await updateMySQLClaim(id, req.body);
      addLog(
        req.body.operatorName || perm.user?.username || 'Operator',
        perm.user?.role || 'operator',
        'CLAIM_UPDATE',
        `Updated claim record ${id}. Status: ${req.body.status}`
      );
      res.json({ success: true, id, ...req.body });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error updating claim' });
    }
  });

  app.delete('/api/claims/:id', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canClaim');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      const { id } = req.params;
      await deleteMySQLClaim(id);
      addLog(
        (req.query.operator as string) || 'Admin',
        'admin',
        'CLAIM_DELETE',
        `Deleted claim record ${id}.`
      );
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error deleting claim' });
    }
  });

  app.delete('/api/claims', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'adminOnly');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      await clearMySQLClaims();
      addLog(
        (req.query.operator as string) || 'Admin',
        'admin',
        'CLAIMS_CLEAR',
        'Reset all claims entries.'
      );
      res.json({ success: true, message: 'All claims reset successfully' });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error resetting claims' });
    }
  });

  // Follow-ups API
  app.get('/api/followups', async (req, res) => {
    try {
      const mysqlFollowups = await getMySQLFollowups();
      res.json(mysqlFollowups);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error fetching follow-ups' });
    }
  });

  app.post('/api/followups', async (req, res) => {
    try {
      const createdBy = req.body.createdBy || (req.headers['x-user-username'] as string) || 'Operator';
      const newFollowup = await createMySQLFollowup({
        ...req.body,
        createdBy,
      });
      addLog(
        createdBy,
        'operator',
        'FOLLOWUP_CREATE' as any,
        `Created follow-up for ${newFollowup.workerName || 'Worker'} on ${newFollowup.followupDate}`
      );
      res.status(201).json(newFollowup);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error creating follow-up' });
    }
  });

  app.put('/api/followups/:id/complete', async (req, res) => {
    try {
      const { id } = req.params;
      const completedBy = req.body.completedBy || (req.headers['x-user-username'] as string) || 'Operator';
      const completedDate = req.body.completedDate || new Date().toISOString().split('T')[0];
      const updated = await completeMySQLFollowup(id, completedBy, completedDate);

      // If next follow-up details provided, create next follow-up automatically
      if (req.body.nextFollowupDate && req.body.nextFollowupNote) {
        const nextFollowup = await createMySQLFollowup({
          module: updated?.module || req.body.module || 'General',
          recordId: updated?.recordId,
          mhNumber: updated?.mhNumber,
          workerName: updated?.workerName,
          mobileNumber: updated?.mobileNumber,
          followupDate: req.body.nextFollowupDate,
          followupTime: req.body.nextFollowupTime || '10:00',
          followupNote: req.body.nextFollowupNote,
          assignedUser: req.body.nextAssignedUser || completedBy,
          createdBy: completedBy,
          status: 'Pending',
        });
        if (updated) {
          await updateMySQLFollowup(updated.id, { nextFollowupId: nextFollowup.id });
        }
      }

      addLog(
        completedBy,
        'operator',
        'FOLLOWUP_COMPLETE' as any,
        `Completed follow-up #${id} for ${updated?.workerName || 'Worker'}`
      );
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error completing follow-up' });
    }
  });

  app.put('/api/followups/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const updated = await updateMySQLFollowup(id, req.body);
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error updating follow-up' });
    }
  });

  app.delete('/api/followups/:id', async (req, res) => {
    try {
      const { id } = req.params;
      await deleteMySQLFollowup(id);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error deleting follow-up' });
    }
  });

  // Verification Reminders API
  app.get('/api/verification-reminders', async (_req, res) => {
    try {
      const reminders = await getMySQLVerificationReminders();
      res.json(reminders);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error fetching verification reminders' });
    }
  });

  app.post('/api/verification-reminders', async (req, res) => {
    try {
      const updated = await upsertMySQLVerificationReminder(req.body);
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error saving verification reminder' });
    }
  });

  // Material Distribution API
  app.get('/api/material-distributions', async (_req, res) => {
    try {
      const records = await getMySQLMaterialDistributions();
      res.json(records);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error fetching material distributions' });
    }
  });

  app.put('/api/material-distributions/:id/status', async (req, res) => {
    try {
      const { id } = req.params;
      const { materialType, newStatus, updatedBy, updatedDate, reason } = req.body;
      const userRole = (req.headers['x-user-role'] as string) || 'operator';
      const username = (req.headers['x-user-username'] as string) || updatedBy || 'Operator';

      const updated = await updateMySQLMaterialStatus(
        id,
        materialType,
        newStatus,
        username,
        updatedDate || new Date().toISOString().split('T')[0],
        reason
      );

      if (!updated) {
        return res.status(404).json({ error: 'Material distribution record not found' });
      }

      await addMySQLLog({
        id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        timestamp: new Date().toISOString(),
        username,
        userRole: userRole as any,
        action: newStatus === 'Not Eligible' ? 'MATERIAL_ELIGIBILITY_UPDATE' : 'MATERIAL_DISTRIBUTION_UPDATE',
        details: `Material '${materialType}' status changed to '${newStatus}' for worker ${updated.workerName} (MH: ${updated.mhNumber}). Reason: ${reason || 'N/A'}`,
        ipAddress: req.ip || '127.0.0.1',
      });

      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error updating material distribution status' });
    }
  });

  // WhatsApp Group Tracking API
  app.get('/api/whatsapp-group-trackings', async (req, res) => {
    try {
      const records = await getMySQLWhatsappGroupTrackings();
      res.json(records);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error fetching WhatsApp group trackings' });
    }
  });

  app.put('/api/whatsapp-group-trackings/:mhNumber/status', async (req, res) => {
    try {
      const { mhNumber } = req.params;
      const { status, remark } = req.body;
      const userRole = (req.headers['x-user-role'] as string) || 'operator';
      const username = (req.headers['x-user-username'] as string) || 'Operator';

      const validStatus = status === 'Added' ? 'Added' : status === 'No WhatsApp' ? 'No WhatsApp' : 'Pending';

      const updated = await updateMySQLWhatsappGroupTrackingStatus(
        mhNumber,
        {
          status: validStatus,
          addedBy: username,
          remark: remark || ''
        }
      );

      if (!updated) {
        return res.status(404).json({ error: 'WhatsApp group tracking record not found' });
      }

      await addMySQLLog({
        id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        timestamp: new Date().toISOString(),
        username,
        userRole: userRole as any,
        action: 'WHATSAPP_GROUP_STATUS_UPDATE',
        details: `Changed WhatsApp Group status to '${validStatus}' for worker ${updated.workerName} (MH: ${updated.mhNumber}). Remark: ${remark || 'N/A'}`,
        ipAddress: req.ip || '127.0.0.1',
      });

      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error updating WhatsApp group tracking status' });
    }
  });

  // Approval List Management API (Admin only)
  app.get('/api/approvals', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'adminOnly');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      const records = await getMySQLApprovals();
      res.json(records);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error fetching approval lists' });
    }
  });

  app.post('/api/approvals', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'adminOnly');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      const record = await createMySQLApproval(req.body);
      addLog('admin', 'admin', 'APPROVAL_LIST_UPLOAD', `Created approval list entry for ${record.workerName} (List: ${record.listNumber})`);
      res.status(201).json(record);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error creating approval list entry' });
    }
  });

  app.post('/api/approvals/bulk', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'adminOnly');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      const { records } = req.body;
      if (!Array.isArray(records) || records.length === 0) {
        return res.status(400).json({ error: 'No records provided for bulk upload' });
      }

      const existingClaims = await getMySQLClaims();
      let matchedCount = 0;
      let updatedClaimsCount = 0;

      const processedRecords: Partial<ApprovalRecord>[] = [];

      for (const raw of records) {
        const mh = (raw.mhNumber || '').trim();
        const workerName = (raw.workerName || '').trim();
        let matchedClaim: WorkerClaim | undefined;

        // Priority 1: MH Number
        if (mh) {
          const cleanMH = mh.replace(/\s+/g, '').toUpperCase();
          matchedClaim = existingClaims.find(
            (c) => (c.mhNumber || '').replace(/\s+/g, '').toUpperCase() === cleanMH
          );
        }

        // Priority 2: Worker Full Name (if MH Number missing or not matched)
        if (!matchedClaim && workerName) {
          const normName = workerName.toLowerCase().replace(/[^a-z0-9]/g, '');
          matchedClaim = existingClaims.find((c) => {
            const cName = (c.workerName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            return cName && (cName === normName || cName.includes(normName) || normName.includes(cName));
          });
        }

        let claimId: string | undefined = undefined;
        if (matchedClaim) {
          matchedCount++;
          claimId = matchedClaim.id;

          // Update claim status in MySQL database to "Payment Released"
          await updateMySQLClaim(matchedClaim.id, {
            status: 'Payment Released',
            remarks: `Matched with Approval List ${raw.listNumber || ''} on ${raw.paymentDate || new Date().toISOString().split('T')[0]}`,
          }).catch((err) => console.error('Error updating matched claim:', err));

          updatedClaimsCount++;
        }

        processedRecords.push({
          ...raw,
          paymentStatus: raw.paymentStatus || 'Payment Released',
          claimId,
          commissionStatus: raw.commissionStatus || 'Pending',
          commissionAmount: raw.commissionAmount !== undefined ? parseFloat(raw.commissionAmount) : 0,
        });
      }

      const created = await bulkCreateMySQLApprovals(processedRecords);

      addLog(
        'admin',
        'admin',
        'APPROVAL_LIST_UPLOAD',
        `Uploaded ${created.length} approval list entries. Matched ${matchedCount} workers with existing claims (Updated status to Payment Released).`
      );

      res.json({
        success: true,
        totalUploaded: created.length,
        matchedCount,
        updatedClaimsCount,
        records: created,
      });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error processing bulk approval upload' });
    }
  });

  app.put('/api/approvals/:id', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'adminOnly');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      const { id } = req.params;
      const updated = await updateMySQLApproval(id, req.body);
      addLog('admin', 'admin', 'COMMISSION_UPDATE', `Updated approval/commission details for record ${id}`);
      res.json(updated || { id, ...req.body });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error updating approval record' });
    }
  });

  app.delete('/api/approvals/:id', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'adminOnly');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      const { id } = req.params;
      await deleteMySQLApproval(id);
      addLog('admin', 'admin', 'APPROVAL_LIST_DELETE', `Deleted approval list entry ${id}`);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error deleting approval record' });
    }
  });

  app.delete('/api/approvals', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'adminOnly');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      await clearMySQLApprovals();
      addLog('admin', 'admin', 'APPROVAL_LIST_DELETE', 'Cleared all approval list records.');
      res.json({ success: true, message: 'All approval list entries cleared.' });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error clearing approval lists' });
    }
  });

  // Sub-Agent Management & Reports API
  app.get('/api/sub-agents', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canSeeSubAgentManagement');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      const summaries = await getMySQLAllSubAgentsSummary();
      res.json(summaries);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error fetching sub-agents' });
    }
  });

  app.post('/api/sub-agents', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canSeeSubAgentManagement');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      const { username, password, name, mobile, email, status } = req.body;
      if (!username || !name || !mobile) {
        return res.status(400).json({ error: 'Username, Name, and Mobile are required.' });
      }

      const cleanUsername = username.trim().toLowerCase().replace(/\s+/g, '');
      const cleanMobile = mobile.trim();
      const cleanName = name.trim();

      const newSubAgent: User = {
        id: `usr-sa-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
        username: cleanUsername,
        name: cleanName,
        mobile: cleanMobile,
        email: email && email.trim() ? email.trim() : undefined,
        role: 'sub_agent',
        status: status || 'active',
        createdAt: new Date().toISOString(),
        permissions: {
          canRegister: true,
          canRenew: true,
          canClaim: true,
          canExport: Boolean(req.body.permissions?.canExport),
          canSeeSearch: true,
          canSeeRegistrationEntry: true,
          canSeeRenewalEntry: true,
          canSeeClaimEntry: true,
          canSeeSubAgentEntries: true,
          canSeeSubAgentManagement: false,
        },
      };

      const plainPassword = password && password.trim() ? password.trim() : `${cleanUsername}123`;
      const createdUser = await createMySQLUser(newSubAgent, plainPassword);

      addLog(
        perm.user?.username || 'Admin',
        'admin',
        'SUB_AGENT_CREATE',
        `Created new Sub-Agent: ${createdUser.name} (@${createdUser.username}, Mobile: ${createdUser.mobile})`
      );

      res.status(201).json(createdUser);
    } catch (e: any) {
      console.warn('[API Validation] POST /api/sub-agents failed:', e?.message || e);
      res.status(400).json({ error: e?.message || 'Error creating sub-agent account' });
    }
  });

  app.put('/api/sub-agents/:id', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canSeeSubAgentManagement');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      const { id } = req.params;
      const { name, mobile, email, status, permissions } = req.body;
      
      const updateData: Partial<User> = {};
      if (name !== undefined) updateData.name = name;
      if (mobile !== undefined) updateData.mobile = mobile;
      if (email !== undefined) updateData.email = email;
      if (status !== undefined) updateData.status = status;
      if (permissions !== undefined) updateData.permissions = permissions;

      const updated = await updateMySQLUser(id, updateData);
      addLog(
        perm.user?.username || 'Admin',
        'admin',
        'SUB_AGENT_EDIT',
        `Updated Sub-Agent ID ${id} (${name || ''})`
      );
      res.json(updated || { id, ...updateData });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error updating sub-agent' });
    }
  });

  app.post('/api/sub-agents/:id/reset-password', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canSeeSubAgentManagement');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      const { id } = req.params;
      const { newPassword } = req.body;
      const users = await getMySQLUsers();
      const user = users.find(u => u.id === id);
      if (!user) return res.status(404).json({ error: 'Sub-agent not found' });

      const targetPass = newPassword && newPassword.trim() ? newPassword.trim() : `${user.username}123`;
      await updateMySQLUser(id, { password: targetPass });
      addLog(
        perm.user?.username || 'Admin',
        'admin',
        'PASSWORD_RESET',
        `Reset password for Sub-Agent @${user.username}`
      );
      res.json({ success: true, message: `Password for @${user.username} has been reset successfully.` });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error resetting sub-agent password' });
    }
  });

  app.delete('/api/sub-agents/:id', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canSeeSubAgentManagement');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      const { id } = req.params;
      const users = await getMySQLUsers();
      const user = users.find(u => u.id === id);
      if (!user) return res.status(404).json({ error: 'Sub-agent not found' });

      await deleteMySQLUser(id);
      addLog(
        perm.user?.username || 'Admin',
        'admin',
        'SUB_AGENT_DELETE',
        `Deleted Sub-Agent: ${user.name} (@${user.username}, Mobile: ${user.mobile})`
      );
      res.json({ success: true, message: `Sub-agent @${user.username} deleted successfully.` });
    } catch (e: any) {
      console.error('[API Error] DELETE /api/sub-agents/:id failed:', e);
      res.status(500).json({ error: e?.message || 'Error deleting sub-agent' });
    }
  });

  app.get('/api/sub-agents/:id/stats', async (req, res) => {
    try {
      const { id } = req.params;
      const userId = (req.headers['x-user-id'] as string) || '';
      const stats = await getMySQLSubAgentStats(id);
      res.json(stats);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error fetching sub-agent stats' });
    }
  });

  app.get('/api/sub-agent-stats/me', async (req, res) => {
    try {
      const userId = (req.headers['x-user-id'] as string) || '';
      if (!userId) return res.status(401).json({ error: 'Not authenticated' });
      const stats = await getMySQLSubAgentStats(userId);
      res.json(stats);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error fetching user stats' });
    }
  });

  app.get('/api/sub-agent-entries', async (req, res) => {
    try {
      const userId = (req.headers['x-user-id'] as string) || '';
      const username = ((req.headers['x-user-username'] as string) || '').trim().toLowerCase();
      const users = await getMySQLUsers();
      const currentUser = users.find(
        (u) => (userId && u.id === userId) || (username && u.username && u.username.toLowerCase() === username)
      );

      if (!currentUser) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Sub-agents can only query their own entries
      let targetSubAgentId: string | undefined = undefined;
      if (currentUser.role === 'sub_agent') {
        targetSubAgentId = currentUser.id;
      } else if (currentUser.role === 'admin' || currentUser.permissions?.canSeeSubAgentManagement) {
        if (req.query.subAgentId && typeof req.query.subAgentId === 'string' && req.query.subAgentId !== 'all') {
          targetSubAgentId = req.query.subAgentId;
        } else {
          targetSubAgentId = 'all';
        }
      } else {
        return res.status(403).json({ error: 'Access Denied for Sub-Agent Entries' });
      }

      const [regs, rens, clms] = await Promise.all([
        getMySQLSubAgentRegistrations(targetSubAgentId),
        getMySQLSubAgentRenewals(targetSubAgentId),
        getMySQLSubAgentClaims(targetSubAgentId),
      ]);

      res.json({
        registrations: regs,
        renewals: rens,
        claims: clms,
      });
    } catch (e: any) {
      console.error('[API Error] GET /api/sub-agent-entries:', e);
      res.status(500).json({ error: e?.message || 'Error fetching sub-agent entries' });
    }
  });

  // User Management API
  app.get('/api/users', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'adminOnly');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      const mysqlUsers = await getMySQLUsers();
      res.json(mysqlUsers);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error fetching users' });
    }
  });

  app.post('/api/users', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'adminOnly');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      const newUser: User = {
        ...req.body,
        id: `usr-op-${Date.now()}`,
        status: 'active',
        createdAt: new Date().toISOString(),
        permissions: {
          canRegister: Boolean(req.body.permissions?.canRegister),
          canRenew: Boolean(req.body.permissions?.canRenew),
          canClaim: Boolean(req.body.permissions?.canClaim),
          canExport: Boolean(req.body.permissions?.canExport),
        },
      };

      await createMySQLUser(newUser, req.body.password);
      addLog('admin', 'admin', 'USER_CREATE', `Created new operator user account: ${newUser.username} (${newUser.name}).`);
      res.status(201).json(newUser);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error creating user' });
    }
  });

  app.put('/api/users/:id', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'adminOnly');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      const { id } = req.params;
      const updatedUser = await updateMySQLUser(id, req.body);
      addLog('admin', 'admin', 'USER_EDIT', `Updated user profile for ID ${id}.`);
      res.json(updatedUser || { success: true, id, ...req.body });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error updating user' });
    }
  });

  app.post('/api/users/:id/reset-password', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'adminOnly');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      const { id } = req.params;
      const users = await getMySQLUsers();
      const user = users.find(u => u.id === id);
      const defaultPass = user?.role === 'admin' ? 'admin123' : `${user?.username || 'operator'}123`;

      await updateMySQLUser(id, { password: defaultPass });
      addLog('admin', 'admin', 'PASSWORD_RESET', `Reset password for user ${user?.username || id}.`);
      res.json({ success: true, message: `Password has been reset to default.` });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error resetting password' });
    }
  });

  app.delete('/api/users/:id', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'adminOnly');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      const { id } = req.params;
      if (!id) {
        return res.status(400).json({ error: 'User ID is required' });
      }

      const allUsers = await getMySQLUsers();
      const targetUser = allUsers.find(
        (u) => String(u.id) === String(id) || (u.username && u.username.toLowerCase() === String(id).toLowerCase())
      );

      // Prevent deleting the primary admin account
      if (
        id === 'usr-admin-1' ||
        (targetUser && (targetUser.id === 'usr-admin-1' || (targetUser.role === 'admin' && targetUser.id === 'usr-admin-1')))
      ) {
        return res.status(400).json({ error: 'मुख्य अॅडमिन खाते हटवता येत नाही (Cannot delete primary admin account).' });
      }

      // Perform deletion from MySQL
      await deleteMySQLUser(id);
      if (targetUser && targetUser.id !== id) {
        await deleteMySQLUser(targetUser.id);
      }

      const adminUser = perm.user || allUsers.find((u) => u.role === 'admin') || { username: 'admin', name: 'Administrator' };
      addLog(
        adminUser.username || 'admin',
        adminUser.role || 'admin',
        'USER_DELETE',
        targetUser
          ? `Deleted operator account: "${targetUser.name}" (@${targetUser.username}, ID: ${targetUser.id}).`
          : `Deleted operator account ID: ${id}.`
      );

      res.json({
        success: true,
        message: targetUser
          ? `Operator ${targetUser.name} deleted successfully.`
          : 'Operator removed successfully.',
      });
    } catch (e: any) {
      console.error('[API Error] DELETE /api/users/:id failed:', e);
      res.status(500).json({ error: e?.message || 'Error deleting user' });
    }
  });

  // Settings API
  app.get('/api/settings', async (_req, res) => {
    try {
      const settings = await getMySQLSettings();
      if (!settings) {
        return res.status(404).json({ error: 'Settings not found in database' });
      }
      res.json(settings);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error fetching settings from database' });
    }
  });

  app.put('/api/settings', async (req, res) => {
    try {
      const isOnlyTemplate = Object.keys(req.body).length === 1 && req.body.whatsappTemplate !== undefined;
      if (!isOnlyTemplate) {
        const perm = await checkUserPermission(req, 'adminOnly');
        if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });
      }

      await updateMySQLSettings(req.body);
      const user = (req.headers['x-user-username'] as string) || 'admin';
      addLog(user, 'admin', 'SETTINGS_UPDATE', 'Updated Office Settings parameters.');
      const current = await getMySQLSettings();
      res.json(current || req.body);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error updating settings' });
    }
  });

  // Activity Logs API
  app.get('/api/activity-logs', async (_req, res) => {
    try {
      const logs = await getMySQLLogs();
      res.json(logs);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error fetching activity logs' });
    }
  });

  app.delete('/api/activity-logs', async (_req, res) => {
    try {
      await clearMySQLLogs();
      res.json({ success: true, message: 'All activity logs cleared.' });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error clearing activity logs' });
    }
  });

  // Reports API
  app.get('/api/reports', async (_req, res) => {
    try {
      const reports = await getMySQLReports();
      res.json(reports);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error fetching reports' });
    }
  });

  app.post('/api/reports', async (req, res) => {
    try {
      const { reportType, generatedBy, totalRecords, totalAmount } = req.body;
      await createMySQLReport(reportType, generatedBy, totalRecords, totalAmount);
      addLog(generatedBy || 'admin', 'admin', 'SETTINGS_UPDATE', `Generated ${reportType} report (${totalRecords} records).`);
      res.status(201).json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error saving report' });
    }
  });

  // Income Collections API
  app.get('/api/income-collections', async (_req, res) => {
    try {
      const collections = await getMySQLIncomeCollections();
      res.json(collections);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error fetching income collections' });
    }
  });

  app.post('/api/income-collections/reset', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'adminOnly');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      await resetMySQLIncomeCollections();
      addLog(
        (perm.user?.name as string) || (perm.user?.username as string) || 'Admin',
        'admin',
        'SETTINGS_UPDATE',
        'Reset Income Collection records table.'
      );
      res.json({ success: true, message: 'Income collection payment records reset successfully.' });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error resetting income collections' });
    }
  });

  // Google Tokens & Sheets Sync
  app.get('/api/google-token-status', (_req, res) => {
    res.json({
      connected: !!savedGoogleAccessToken,
      hasToken: !!savedGoogleAccessToken,
      spreadsheetId: SPREADSHEET_ID,
    });
  });

  app.post('/api/clear-google-token', (_req, res) => {
    savedGoogleAccessToken = '';
    res.json({ success: true, message: 'Google access token cleared from server.' });
  });

  app.post('/api/set-google-token', (req, res) => {
    const { token } = req.body;
    if (token) {
      savedGoogleAccessToken = token;
      return res.json({ success: true, message: 'Google Token saved on server.' });
    }
    return res.status(400).json({ error: 'No token provided' });
  });

  app.post('/api/sync-sheets', async (req, res) => {
    try {
      const googleAccessToken = (req.headers['x-google-access-token'] as string) || req.body?.googleAccessToken || savedGoogleAccessToken;
      if (googleAccessToken) {
        savedGoogleAccessToken = googleAccessToken;
      }
      await syncAllToGoogleSheet(googleAccessToken || undefined);
      addLog('admin', 'admin', 'SETTINGS_UPDATE', 'Synced all database records to Google Sheets.');
      res.json({ success: true, message: 'Google Sheets synchronization completed successfully.' });
    } catch (err: any) {
      const msg = err?.message || 'Unknown error';
      console.error('Error during Google Sheets sync:', msg);
      res.status(500).json({ error: 'Google Sheets sync failed: ' + msg });
    }
  });

  // Backup & Restore via MySQL
  app.get('/api/backup', async (_req, res) => {
    try {
      const [users, registrations, renewals, claims, logs, settings] = await Promise.all([
        getMySQLUsers(),
        getMySQLRegistrations(),
        getMySQLRenewals(),
        getMySQLClaims(),
        getMySQLLogs(),
        getMySQLSettings(),
      ]);

      const backupData = {
        timestamp: new Date().toISOString(),
        users,
        registrations,
        renewals,
        claims,
        logs,
        settings,
      };
      res.json(backupData);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error backing up database' });
    }
  });

  app.post('/api/restore', async (req, res) => {
    try {
      const { data } = req.body;
      if (!data) return res.status(400).json({ error: 'Invalid backup payload' });

      if (Array.isArray(data.registrations)) {
        for (const r of data.registrations) {
          await createMySQLRegistration(r).catch(() => {});
        }
      }
      if (Array.isArray(data.renewals)) {
        for (const ren of data.renewals) {
          await createMySQLRenewal(ren).catch(() => {});
        }
      }
      if (Array.isArray(data.claims)) {
        for (const clm of data.claims) {
          await createMySQLClaim(clm).catch(() => {});
        }
      }
      if (data.settings) {
        await updateMySQLSettings(data.settings).catch(() => {});
      }

      addLog('admin', 'admin', 'DATA_RESTORE', 'Restored system database from backup file.');
      res.json({ success: true, message: 'Database restored into MySQL successfully.' });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error restoring database' });
    }
  });

  // Live IWBMS Portal Search Proxy
  app.post('/api/verify-mh-live', async (req, res) => {
    const { mhNumber } = req.body;
    if (!mhNumber) {
      return res.status(400).json({ error: 'MH Number is required' });
    }

    const cleanMh = String(mhNumber).trim().toUpperCase().replace(/\s/g, '');

    try {
      // 1. Try hitting the IWBMS search endpoint directly or fetching the portal
      const targetUrl = 'https://iwbms.mahabocw.in/search-record';
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      // Attempt POST / GET search
      let status = 'Check';
      let details = 'Live Verification Check';
      let workerName = '';

      try {
        const fetchRes = await fetch(targetUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Referer': targetUrl,
          },
          body: new URLSearchParams({
            registration_no: cleanMh,
            reg_no: cleanMh,
            search: 'Search',
          }).toString(),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (fetchRes.ok) {
          const html = (await fetchRes.text()).toLowerCase();

          if (
            html.includes('no record found') ||
            html.includes('record not found') ||
            html.includes('नोंद सापडली नाही') ||
            html.includes('invalid registration')
          ) {
            status = 'Not Found';
            details = 'No Record Found on Mahabocw Portal';
          } else if (html.includes('active') && !html.includes('inactive')) {
            status = 'Active';
            details = 'Active (वैध नोंदणी - IWBMS Portal)';
          } else if (html.includes('inactive') || html.includes('expired') || html.includes('मुदत संपली')) {
            status = 'Inactive';
            details = 'Subscription: Inactive / Expired on Portal';
          } else if (html.includes('subscription') || html.includes('status')) {
            status = 'Active';
            details = 'Found on Portal';
          }
        }
      } catch (fetchErr: any) {
        // If external portal blocks direct server fetch (e.g. firewall/geoblock), fallback to local database and intelligent status check
        clearTimeout(timeoutId);
      }

      // If status is still 'Check', check local TiDB / MySQL database
      if (status === 'Check') {
        const regs = await getMySQLRegistrations();
        const foundReg = regs.find(
          (r) => r.mhNumber && r.mhNumber.trim().toUpperCase().replace(/\s/g, '') === cleanMh
        );

        if (foundReg) {
          if (foundReg.status === 'Active' || foundReg.status === 'Accepted') {
            status = 'Active';
            details = `Active in System Database (${foundReg.workerName})`;
            workerName = foundReg.workerName;
          } else if (foundReg.status === 'Expired' || foundReg.status === 'Rejected') {
            status = 'Inactive';
            details = `Status: ${foundReg.status} in System Database`;
            workerName = foundReg.workerName;
          }
        } else {
          const rens = await getMySQLRenewals();
          const foundRen = rens.find(
            (r) => r.mhNumber && r.mhNumber.trim().toUpperCase().replace(/\s/g, '') === cleanMh
          );
          if (foundRen) {
            status = 'Active';
            details = `Active in Renewal Database (${foundRen.workerName})`;
            workerName = foundRen.workerName;
          }
        }
      }

      // If still Check and format matches standard MH number
      if (status === 'Check') {
        if (!cleanMh.startsWith('MH') || cleanMh.length < 8) {
          status = 'Not Found';
          details = 'अवैध MH क्रमांक फॉरमॅट (Invalid Format)';
        } else {
          status = 'Check';
          details = 'Portal response pending. Please verify with Python Bot on Edge.';
        }
      }

      res.json({
        success: true,
        mhNumber: cleanMh,
        status,
        details,
        workerName,
        verifiedAt: new Date().toISOString(),
      });
    } catch (e: any) {
      res.status(500).json({
        success: false,
        status: 'Check',
        error: e?.message || 'Verification Error',
      });
    }
  });

  // ============================================================================
  // IWBMS STATUS CHECKER JOB QUEUE & SECURE WORKER API ROUTES (STEP 3)
  // ============================================================================

  // Helper middleware/guard for Local Python Worker authentication
  function authenticateWorkerToken(req: express.Request, res: express.Response, next: express.NextFunction) {
    const configuredToken = (process.env.IWBMS_WORKER_TOKEN || '').trim();
    const authHeader = (req.headers['authorization'] || '').trim();
    const tokenHeader = (req.headers['x-worker-token'] as string || '').trim();

    let providedToken = '';
    if (authHeader.startsWith('Bearer ')) {
      providedToken = authHeader.slice(7).trim();
    } else if (authHeader) {
      providedToken = authHeader;
    } else if (tokenHeader) {
      providedToken = tokenHeader;
    }

    // If IWBMS_WORKER_TOKEN is not configured in env, allow a default fallback secret or reject
    const expectedToken = configuredToken || 'iwbms_om_secret_token_2024';

    if (!providedToken || providedToken !== expectedToken) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized: Invalid or missing IWBMS Worker Token (Authorization: Bearer <token>)',
      });
    }

    next();
  }

  // 1. Worker Heartbeat API (Called periodically by Local Python Worker)
  app.post('/api/iwbms/worker/heartbeat', authenticateWorkerToken, (req, res) => {
    try {
      const { workerName, workerVersion, status, currentJobId, currentMhNumber } = req.body;
      const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';

      const updatedHeartbeat = recordWorkerHeartbeat({
        workerName: String(workerName || 'IWBMS-Python-Worker'),
        workerVersion: String(workerVersion || '1.0.0'),
        status: status || 'Idle',
        currentJobId: currentJobId ? Number(currentJobId) : undefined,
        currentMhNumber: currentMhNumber ? String(currentMhNumber) : undefined,
        ipAddress: clientIp,
      });

      res.status(200).json({
        success: true,
        heartbeat: updatedHeartbeat,
        serverTime: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to record worker heartbeat' });
    }
  });

  // 2. Get Worker Status (For Admin / Staff UI)
  app.get('/api/iwbms/worker/status', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canSeeIwbmsChecker');
      if (!perm.allowed) {
        return res.status(perm.status || 403).json({ error: perm.error });
      }

      const status = getWorkerHeartbeatStatus();
      res.status(200).json({ success: true, ...status });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to get worker status' });
    }
  });

  // 3. Create a Check Job (Staff/Admin with canSeeIwbmsChecker permission)
  app.post('/api/iwbms/jobs', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canSeeIwbmsChecker');
      if (!perm.allowed) {
        return res.status(perm.status || 403).json({ error: perm.error });
      }

      const { workerType, workerRecordId, mhNumber, createdBy } = req.body;
      if (!mhNumber) {
        return res.status(400).json({ success: false, error: 'mhNumber is required' });
      }

      const callerUser = perm.user ? perm.user.username : (createdBy || 'staff');

      const result = await createMySQLIwbmsJob({
        workerType: workerType || 'registration',
        workerRecordId: String(workerRecordId || ''),
        mhNumber: String(mhNumber),
        createdBy: callerUser,
      });

      if (!result.isDuplicate) {
        addLog(callerUser, perm.user?.role || 'operator', 'IWBMS_JOB_CREATE', `Enqueued IWBMS check job for MH: ${result.job.mhNumber} (ID: ${result.job.id})`);
      }

      res.status(200).json({
        success: true,
        job: result.job,
        isDuplicate: result.isDuplicate,
        message: result.isDuplicate
          ? 'Active job already exists for this MH Number'
          : 'New job created successfully',
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to create job' });
    }
  });

  // 4. Fetch Next Pending Job (Worker Token Protected)
  app.post('/api/iwbms/jobs/next', authenticateWorkerToken, async (_req, res) => {
    try {
      const job = await fetchNextPendingIwbmsJob();
      if (!job) {
        return res.status(200).json({ success: true, job: null, message: 'No pending jobs in queue' });
      }

      // Return only the minimum sanitized properties needed by the worker
      res.status(200).json({
        success: true,
        job: {
          id: job.id,
          workerType: job.workerType,
          workerRecordId: job.workerRecordId,
          mhNumber: job.mhNumber,
          createdAt: job.createdAt,
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to fetch next job' });
    }
  });

  // 5. Complete Job (Worker Token Protected, validates state and resultStatus)
  app.post('/api/iwbms/jobs/:id/complete', authenticateWorkerToken, async (req, res) => {
    try {
      const jobId = parseInt(req.params.id, 10);
      if (isNaN(jobId)) {
        return res.status(400).json({ success: false, error: 'Invalid Job ID' });
      }

      const { resultStatus } = req.body;
      const validStatuses: IwbmsResultStatus[] = ['Active', 'Inactive', 'Not Found', 'Check'];
      if (!resultStatus || !validStatuses.includes(resultStatus)) {
        return res.status(400).json({
          success: false,
          error: `Invalid resultStatus: "${resultStatus}". Allowed values: ${validStatuses.join(', ')}`,
        });
      }

      // Verify job exists
      const existingJob = await getMySQLIwbmsJobById(jobId);
      if (!existingJob) {
        return res.status(404).json({ success: false, error: `Job #${jobId} not found` });
      }

      // Ensure job is currently in Processing state
      if (existingJob.status !== 'Processing') {
        return res.status(400).json({
          success: false,
          error: `Cannot complete job in '${existingJob.status}' state. Job must be 'Processing'.`,
        });
      }

      const completedJob = await completeIwbmsJob(jobId, resultStatus);
      if (completedJob) {
        addLog('iwbms_worker', 'system', 'IWBMS_JOB_COMPLETE', `Completed IWBMS check for MH: ${completedJob.mhNumber} -> ${resultStatus} (Job ID: ${jobId})`);
      }

      res.status(200).json({ success: true, job: completedJob });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to complete job' });
    }
  });

  // 6. Fail Job (Worker Token Protected, validates state)
  app.post('/api/iwbms/jobs/:id/fail', authenticateWorkerToken, async (req, res) => {
    try {
      const jobId = parseInt(req.params.id, 10);
      if (isNaN(jobId)) {
        return res.status(400).json({ success: false, error: 'Invalid Job ID' });
      }

      const { errorMessage } = req.body;

      // Verify job exists
      const existingJob = await getMySQLIwbmsJobById(jobId);
      if (!existingJob) {
        return res.status(404).json({ success: false, error: `Job #${jobId} not found` });
      }

      if (existingJob.status !== 'Processing') {
        return res.status(400).json({
          success: false,
          error: `Cannot fail job in '${existingJob.status}' state. Job must be 'Processing'.`,
        });
      }

      const failedJob = await failIwbmsJob(jobId, errorMessage || 'Search failed or timed out');
      res.status(200).json({ success: true, job: failedJob });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to fail job' });
    }
  });

  // 7. Retry Job (Admin Only)
  app.post('/api/iwbms/jobs/:id/retry', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'adminOnly');
      if (!perm.allowed) {
        return res.status(perm.status || 403).json({ error: perm.error });
      }

      const jobId = parseInt(req.params.id, 10);
      if (isNaN(jobId)) {
        return res.status(400).json({ success: false, error: 'Invalid Job ID' });
      }

      const existingJob = await getMySQLIwbmsJobById(jobId);
      if (!existingJob) {
        return res.status(404).json({ success: false, error: 'Job not found' });
      }

      const job = await retryIwbmsJob(jobId);
      addLog(perm.user?.username || 'admin', 'admin', 'IWBMS_JOB_CREATE', `Retried IWBMS job #${jobId} for MH: ${existingJob.mhNumber}`);

      res.status(200).json({ success: true, job });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to retry job' });
    }
  });

  // 8. Overall Job Counts & Status Summary (Admin / Staff UI)
  app.get('/api/iwbms/jobs/status', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canSeeIwbmsChecker');
      if (!perm.allowed) {
        return res.status(perm.status || 403).json({ error: perm.error });
      }

      const counts = await getMySQLIwbmsJobCounts();
      const workerStatus = getWorkerHeartbeatStatus();

      res.status(200).json({
        success: true,
        counts,
        worker: workerStatus,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to get job status summary' });
    }
  });

  // 9. Get Single Job by ID (Staff / Admin)
  app.get('/api/iwbms/jobs/:id', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canSeeIwbmsChecker');
      if (!perm.allowed) {
        return res.status(perm.status || 403).json({ error: perm.error });
      }

      const jobId = parseInt(req.params.id, 10);
      const job = await getMySQLIwbmsJobById(jobId);
      if (!job) {
        return res.status(404).json({ success: false, error: 'Job not found' });
      }
      res.status(200).json({ success: true, job });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to get job' });
    }
  });

  // 10. Get Latest Job by MH Number (Staff / Admin)
  app.get('/api/iwbms/jobs/by-mh/:mhNumber', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canSeeIwbmsChecker');
      if (!perm.allowed) {
        return res.status(perm.status || 403).json({ error: perm.error });
      }

      const job = await getLatestMySQLIwbmsJobByMh(req.params.mhNumber);
      res.status(200).json({ success: true, job });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to get job by MH' });
    }
  });

  // 11. List Jobs with Filtering (Staff / Admin)
  app.get('/api/iwbms/jobs', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canSeeIwbmsChecker');
      if (!perm.allowed) {
        return res.status(perm.status || 403).json({ error: perm.error });
      }

      const status = req.query.status as any;
      const workerType = req.query.workerType as any;
      const mhNumber = req.query.mhNumber as string;
      const startDate = req.query.startDate as string;
      const endDate = req.query.endDate as string;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;

      const jobs = await listMySQLIwbmsJobs({ status, workerType, mhNumber, startDate, endDate, limit });
      res.status(200).json({ success: true, count: jobs.length, jobs });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to list jobs' });
    }
  });

  // 12. Batch Enqueue API (Staff / Admin with canSeeIwbmsChecker)
  app.post('/api/iwbms/batch', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canSeeIwbmsChecker');
      if (!perm.allowed) {
        return res.status(perm.status || 403).json({ error: perm.error });
      }

      const { records, createdBy } = req.body;
      if (!Array.isArray(records) || records.length === 0) {
        return res.status(400).json({ success: false, error: 'Records array is required and must not be empty' });
      }

      const caller = perm.user ? perm.user.username : (createdBy || 'staff');
      const stats = await createMySQLIwbmsBatchJobs(records, caller);

      addLog(
        caller,
        perm.user?.role || 'operator',
        'IWBMS_BATCH_ENQUEUE',
        `Batch enqueued ${stats.newJobs} IWBMS jobs (Total: ${stats.total}, Already Active: ${stats.alreadyQueued}, Invalid: ${stats.invalidMhNumbers})`
      );

      res.status(200).json({
        success: true,
        stats,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to batch enqueue jobs' });
    }
  });

  // 13. Retry All Failed Jobs (Admin Only)
  app.post('/api/iwbms/jobs/retry-all', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'adminOnly');
      if (!perm.allowed) {
        return res.status(perm.status || 403).json({ error: perm.error });
      }

      const retriedCount = await retryAllFailedIwbmsJobs();
      addLog(perm.user?.username || 'admin', 'admin', 'IWBMS_JOB_RETRY', `Retried all failed IWBMS jobs (${retriedCount} jobs re-queued)`);

      res.status(200).json({ success: true, retriedCount });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to retry failed jobs' });
    }
  });

  // 14. Recover Stale Processing Jobs (Admin Only)
  app.post('/api/iwbms/jobs/recover-stale', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'adminOnly');
      if (!perm.allowed) {
        return res.status(perm.status || 403).json({ error: perm.error });
      }

      const staleMinutes = req.body?.staleMinutes ? Number(req.body.staleMinutes) : 15;
      const recoveredCount = await recoverStaleProcessingIwbmsJobs(staleMinutes);

      res.status(200).json({ success: true, recoveredCount });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to recover stale jobs' });
    }
  });

  // 15. Get Verification History Log
  app.get('/api/iwbms/history', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canSeeIwbmsChecker');
      if (!perm.allowed) {
        return res.status(perm.status || 403).json({ error: perm.error });
      }

      const mhNumber = req.query.mhNumber as string;
      const workerType = req.query.workerType as string;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;

      const history = await getIwbmsCheckHistory({ mhNumber, workerType, limit });
      res.status(200).json({ success: true, history });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to fetch verification history' });
    }
  });

  // =========================================================================
  // CLAIM PAYMENTS MODULE API ENDPOINTS
  // =========================================================================

  // 1. Get Claim Payments Dashboard Key Stats
  app.get('/api/claim-payments/stats', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canSeeClaimPayments');
      if (!perm.allowed) {
        return res.status(perm.status || 403).json({ error: perm.error });
      }

      const subAgentId = perm.user?.role === 'sub_agent' ? perm.user.id : (req.query.subAgentId as string || undefined);
      const stats = await getMySQLClaimPaymentsDashboardStats(subAgentId);
      res.json({ success: true, stats });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to fetch claim payments stats' });
    }
  });

  // 2. Get Commission Settings
  app.get('/api/claim-payments/settings', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canSeeClaimPayments');
      if (!perm.allowed) {
        return res.status(perm.status || 403).json({ error: perm.error });
      }

      const settings = await getMySQLCommissionSettings();
      res.json({ success: true, settings });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to fetch commission settings' });
    }
  });

  // 3. Update Commission Settings (Admin Only)
  app.post('/api/claim-payments/settings', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canManageCommissionSettings');
      if (!perm.allowed) {
        return res.status(perm.status || 403).json({ error: perm.error });
      }

      const settings = await updateMySQLCommissionSettings(req.body);
      addLog(
        perm.user?.username || 'admin',
        perm.user?.role || 'admin',
        'SYSTEM_SETTINGS_UPDATE',
        `Updated Claim Payment Commission Settings (Direct: ${settings.directWorkerCommissionRate}%, Officer: ${settings.defaultOfficerCommissionRate}%)`
      );
      res.json({ success: true, settings });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to update commission settings' });
    }
  });

  // 4. Get Payment Lists
  app.get('/api/claim-payments/lists', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canSeeClaimPayments');
      if (!perm.allowed) {
        return res.status(perm.status || 403).json({ error: perm.error });
      }

      const subAgentId = perm.user?.role === 'sub_agent' ? perm.user.id : (req.query.subAgentId as string || undefined);
      const lists = await getMySQLClaimPaymentLists(subAgentId);
      res.json({ success: true, lists });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to fetch payment lists' });
    }
  });

  // 5. Create or Update Payment List
  app.post('/api/claim-payments/lists', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canManageClaimPayments');
      if (!perm.allowed) {
        return res.status(perm.status || 403).json({ error: perm.error });
      }

      const list = await createMySQLClaimPaymentList({
        ...req.body,
        createdByUserId: perm.user?.id,
        createdBy: perm.user?.name || perm.user?.username,
      });

      addLog(
        perm.user?.username || 'user',
        perm.user?.role || 'operator',
        'CLAIM_PAYMENT_LIST_CREATE',
        `Created/Updated Claim Payment List #${list.listNumber}`
      );

      res.json({ success: true, list });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to create payment list' });
    }
  });

  // 6. Update List Details / Status
  app.put('/api/claim-payments/lists/:listNumber', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canManageClaimPayments');
      if (!perm.allowed) {
        return res.status(perm.status || 403).json({ error: perm.error });
      }

      const list = await updateMySQLClaimPaymentList(req.params.listNumber, req.body);
      if (!list) {
        return res.status(404).json({ success: false, error: 'Payment list not found' });
      }

      addLog(
        perm.user?.username || 'user',
        perm.user?.role || 'operator',
        'CLAIM_PAYMENT_LIST_UPDATE',
        `Updated Claim Payment List #${req.params.listNumber} status to ${req.body.status || 'updated'}`
      );

      res.json({ success: true, list });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to update payment list' });
    }
  });

  // 7. Delete List
  app.delete('/api/claim-payments/lists/:listNumber', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canManageClaimPayments');
      if (!perm.allowed) {
        return res.status(perm.status || 403).json({ error: perm.error });
      }

      await deleteMySQLClaimPaymentList(req.params.listNumber);
      addLog(
        perm.user?.username || 'user',
        perm.user?.role || 'admin',
        'CLAIM_PAYMENT_LIST_DELETE',
        `Deleted Claim Payment List #${req.params.listNumber} and associated records`
      );

      res.json({ success: true, message: `List #${req.params.listNumber} deleted successfully` });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to delete payment list' });
    }
  });

  // 8. Get Claim Payment Workers with Filters
  app.get('/api/claim-payments/workers', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canSeeClaimPayments');
      if (!perm.allowed) {
        return res.status(perm.status || 403).json({ error: perm.error });
      }

      const subAgentId = perm.user?.role === 'sub_agent' ? perm.user.id : (req.query.subAgentId as string || undefined);
      const workers = await getMySQLClaimPaymentWorkers({
        listNumber: req.query.listNumber as string,
        subAgentId,
        search: req.query.search as string,
        status: req.query.status as string,
        taluka: req.query.taluka as string,
      });

      res.json({ success: true, workers, count: workers.length });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to fetch claim payment workers' });
    }
  });

  // 9. Get Single Worker details with collection installments
  app.get('/api/claim-payments/workers/:id', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canSeeClaimPayments');
      if (!perm.allowed) {
        return res.status(perm.status || 403).json({ error: perm.error });
      }

      const worker = await getMySQLClaimPaymentWorkerById(req.params.id);
      if (!worker) {
        return res.status(404).json({ success: false, error: 'Worker record not found' });
      }

      // Check sub-agent isolation
      if (perm.user?.role === 'sub_agent' && worker.subAgentId && worker.subAgentId !== perm.user.id) {
        return res.status(403).json({ success: false, error: 'Access denied: You can only view your own sub-agent workers' });
      }

      res.json({ success: true, worker });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to fetch worker details' });
    }
  });

  // 10. Update Worker details
  app.put('/api/claim-payments/workers/:id', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canManageClaimPayments');
      if (!perm.allowed) {
        return res.status(perm.status || 403).json({ error: perm.error });
      }

      const worker = await updateMySQLClaimPaymentWorker(req.params.id, req.body);
      if (!worker) {
        return res.status(404).json({ success: false, error: 'Worker record not found' });
      }

      addLog(
        perm.user?.username || 'user',
        perm.user?.role || 'operator',
        'CLAIM_PAYMENT_WORKER_UPDATE',
        `Updated Claim Payment Worker ${worker.workerName} (${worker.mhNumber})`
      );

      res.json({ success: true, worker });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to update worker' });
    }
  });

  // 11. Delete Worker
  app.delete('/api/claim-payments/workers/:id', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canManageClaimPayments');
      if (!perm.allowed) {
        return res.status(perm.status || 403).json({ error: perm.error });
      }

      await deleteMySQLClaimPaymentWorker(req.params.id);
      addLog(
        perm.user?.username || 'user',
        perm.user?.role || 'operator',
        'CLAIM_PAYMENT_WORKER_DELETE',
        `Deleted Claim Payment Worker ID ${req.params.id}`
      );

      res.json({ success: true, message: 'Worker record deleted successfully' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to delete worker' });
    }
  });

  // 12. Import Excel Claim List Workers
  app.post('/api/claim-payments/import', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canManageClaimPayments');
      if (!perm.allowed) {
        return res.status(perm.status || 403).json({ error: perm.error });
      }

      const { listNumber, listDate, workers } = req.body;
      if (!listNumber || !workers || !Array.isArray(workers) || workers.length === 0) {
        return res.status(400).json({ success: false, error: 'List Number and non-empty workers array are required' });
      }

      const result = await importMySQLClaimPaymentWorkers({
        listNumber,
        listDate,
        workers,
        createdByUserId: perm.user?.id,
        createdBy: perm.user?.name || perm.user?.username,
      });

      addLog(
        perm.user?.username || 'user',
        perm.user?.role || 'operator',
        'CLAIM_PAYMENT_IMPORT_EXCEL',
        `Imported List #${listNumber}: ${result.importedCount} workers added, ${result.duplicateCount} duplicates skipped`
      );

      res.json({ success: true, result });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to import workers' });
    }
  });

  // 13. Get Commission Collections
  app.get('/api/claim-payments/collections', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canSeeClaimPayments');
      if (!perm.allowed) {
        return res.status(perm.status || 403).json({ error: perm.error });
      }

      const collections = await getMySQLClaimCommissionCollections(
        req.query.workerPaymentId as string,
        req.query.listNumber as string
      );
      res.json({ success: true, collections });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to fetch collections' });
    }
  });

  // 14. Record a Commission Collection Payment
  app.post('/api/claim-payments/collections', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canManageClaimPayments');
      if (!perm.allowed) {
        return res.status(perm.status || 403).json({ error: perm.error });
      }

      const collection = await addMySQLClaimCommissionCollection({
        ...req.body,
        createdByUserId: perm.user?.id,
        createdBy: perm.user?.name || perm.user?.username,
      });

      addLog(
        perm.user?.username || 'user',
        perm.user?.role || 'operator',
        'CLAIM_COMMISSION_COLLECTION_ADD',
        `Collected ₹${collection.receivedAmount} commission from ${collection.workerName} (${collection.mhNumber}) for List #${collection.listNumber}`
      );

      res.json({ success: true, collection });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to record commission collection' });
    }
  });

  // 15. Delete Commission Collection
  app.delete('/api/claim-payments/collections/:id', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canManageClaimPayments');
      if (!perm.allowed) {
        return res.status(perm.status || 403).json({ error: perm.error });
      }

      await deleteMySQLClaimCommissionCollection(req.params.id);
      addLog(
        perm.user?.username || 'user',
        perm.user?.role || 'operator',
        'CLAIM_COMMISSION_COLLECTION_DELETE',
        `Deleted Commission Collection ID ${req.params.id}`
      );

      res.json({ success: true, message: 'Collection entry deleted successfully' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to delete collection entry' });
    }
  });

  // 16. Get Expenses
  app.get('/api/claim-payments/expenses', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canSeeClaimPayments');
      if (!perm.allowed) {
        return res.status(perm.status || 403).json({ error: perm.error });
      }

      const expenses = await getMySQLClaimPaymentExpenses(req.query.listNumber as string);
      res.json({ success: true, expenses });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to fetch expenses' });
    }
  });

  // 17. Create Expense
  app.post('/api/claim-payments/expenses', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canManageExpenses');
      if (!perm.allowed) {
        return res.status(perm.status || 403).json({ error: perm.error });
      }

      const expense = await createMySQLClaimPaymentExpense({
        ...req.body,
        createdByUserId: perm.user?.id,
        createdBy: perm.user?.name || perm.user?.username,
      });

      addLog(
        perm.user?.username || 'user',
        perm.user?.role || 'operator',
        'CLAIM_PAYMENT_EXPENSE_ADD',
        `Added Claim Payment Expense: ₹${expense.amount} (${expense.category} - ${expense.description})`
      );

      res.json({ success: true, expense });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to create expense' });
    }
  });

  // 18. Delete Expense
  app.delete('/api/claim-payments/expenses/:id', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canManageExpenses');
      if (!perm.allowed) {
        return res.status(perm.status || 403).json({ error: perm.error });
      }

      await deleteMySQLClaimPaymentExpense(req.params.id);
      addLog(
        perm.user?.username || 'user',
        perm.user?.role || 'operator',
        'CLAIM_PAYMENT_EXPENSE_DELETE',
        `Deleted Claim Payment Expense ID ${req.params.id}`
      );

      res.json({ success: true, message: 'Expense deleted successfully' });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to delete expense' });
    }
  });

  // 19. Get Officer Commissions
  app.get('/api/claim-payments/officer-commissions', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canSeeClaimPayments');
      if (!perm.allowed) {
        return res.status(perm.status || 403).json({ error: perm.error });
      }

      const officerCommissions = await getMySQLClaimOfficerCommissions(req.query.listNumber as string);
      res.json({ success: true, officerCommissions });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to fetch officer commissions' });
    }
  });

  // 20. Update Officer Commission
  app.put('/api/claim-payments/officer-commissions/:id', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canManageOfficerCommission');
      if (!perm.allowed) {
        return res.status(perm.status || 403).json({ error: perm.error });
      }

      const officerCommission = await updateMySQLClaimOfficerCommission(req.params.id, req.body);
      if (!officerCommission) {
        return res.status(404).json({ success: false, error: 'Officer commission record not found' });
      }

      addLog(
        perm.user?.username || 'user',
        perm.user?.role || 'operator',
        'CLAIM_OFFICER_COMMISSION_UPDATE',
        `Updated Officer Commission for ${officerCommission.taluka} (List #${officerCommission.listNumber}) to ${officerCommission.paymentStatus}`
      );

      res.json({ success: true, officerCommission });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err?.message || 'Failed to update officer commission' });
    }
  });

  // OCR Parse endpoint simulation
  app.post('/api/ocr-parse', (_req, res) => {
    const sampleNames = ['Sanjay Balu Jagtap', 'Ramesh Eknath Gaikwad', 'Anita Vittal Thorat', 'Prakash Kisan Babar'];
    const sampleTalukas = ['Haveli', 'Shirur', 'Khed', 'Baramati', 'Daund'];
    const randomName = sampleNames[Math.floor(Math.random() * sampleNames.length)];
    const randomTaluka = sampleTalukas[Math.floor(Math.random() * sampleTalukas.length)];

    res.json({
      success: true,
      extracted: {
        workerName: randomName,
        fatherName: `${randomName.split(' ')[1] || 'Balu'} ${randomName.split(' ')[2] || 'Jagtap'}`,
        dob: '1991-04-12',
        gender: randomName.startsWith('Anita') ? 'Female' : 'Male',
        aadhaarNumber: `${Math.floor(1000 + Math.random() * 9000)} ${Math.floor(1000 + Math.random() * 9000)} ${Math.floor(1000 + Math.random() * 9000)}`,
        mhNumber: `MH-12-2024-${Math.floor(100000 + Math.random() * 900000)}`,
        taluka: randomTaluka,
        district: 'Pune',
        bankName: 'State Bank of India',
        accountNumber: `30${Math.floor(100000000 + Math.random() * 900000000)}`,
        ifsc: 'SBIN0001420',
      },
      confidence: 0.96,
    });
  });

  // Serve Vite in dev / static in prod
  if (process.env.NODE_ENV !== 'production') {
    const isHmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: isHmrDisabled ? false : undefined,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`OM DIGITAL E-SEVA KENDRA server running on http://0.0.0.0:${PORT}`);
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[Server Warning] Port ${PORT} is in use.`);
    } else {
      console.error('[Server Error]', err);
    }
  });

  process.on('SIGTERM', () => {
    server.close(() => process.exit(0));
  });
}

startServer();
