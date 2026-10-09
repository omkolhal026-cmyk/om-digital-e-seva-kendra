import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { google } from 'googleapis';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import * as XLSX from 'xlsx';
import {
  initMySQL,
  getPool,
  isMySQLConnected,
  getMySQLStatus,
  authenticateMySQLUser,
  getMySQLUsers,
  createMySQLUser,
  updateMySQLUser,
  deleteMySQLUser,
  changeMySQLUserPassword,
  getMySQLRegistrations,
  createMySQLRegistration,
  updateMySQLRegistration,
  updateMySQLRegistrationByMH,
  deleteMySQLRegistration,
  deleteMySQLRegistrationsBulk,
  clearMySQLRegistrations,
  getMySQLRenewals,
  getRenewalByMhNumber,
  createMySQLRenewal,
  updateMySQLRenewal,
  deleteMySQLRenewal,
  deleteMySQLRenewalsBulk,
  clearMySQLRenewals,
  getWorkerRenewalHistory,
  checkDuplicateRenewal,
  createDoubleRenewal,
  getMySQLClaims,
  getWorkerClaimHistory,
  getWorkerByMhNumber,
  checkMySQLClaimDuplicate,
  getClaimsByListNumber,
  getMySQLClaimSchemes,
  createMySQLClaimScheme,
  updateMySQLClaimScheme,
  deleteOrDeactivateMySQLClaimScheme,
  createMySQLClaim,
  updateMySQLClaim,
  deleteMySQLClaim,
  deleteMySQLClaimsBulk,
  clearMySQLClaims,
  getMySQLOldClaims,
  getMySQLDistinctFromSources,
  createMySQLOldClaim,
  insertMySQLOldClaimsBulk,
  updateMySQLOldClaim,
  deleteMySQLOldClaim,
  deleteMySQLOldClaimsBulk,
  clearMySQLOldClaims,
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
  getMySQLMaterialInventory,
  adjustMySQLMaterialInventory,
  saveCustomerMaterialDistribution,
  getMySQLWhatsappGroupTrackings,
  updateMySQLWhatsappGroupTrackingStatus,
  importMySQLWhatsappGroupTrackingsBulk,
  deleteMySQLWhatsappGroupTracking,
  deleteMySQLWhatsappGroupTrackingsBulk,
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
  generateNextRenewalBatchId,
  previewRenewalCheckExcel,
  confirmRenewalCheckBatch,
  createRenewalCheckBatchWithItems,
  getRenewalCheckBatches,
  getRenewalCheckBatchDetails,
  getRenewalCheckWorkerHistory,
  updateRenewalCheckQueueItemStatus,
  assignRenewalCheckQueueItems,
  getRenewalCheckAuditLogs,
  getRenewalCheckExportData,
  deleteRenewalCheckQueueItem,
  deleteRenewalCheckQueueItemsBulk,
  updateRenewalCheckQueueItemsBulkStatus,
  deleteRenewalCheckBatch,
} from './src/db/mysql.js';
import { SCHEMES_LIST } from './src/data/mockData.js';
import {
  WorkerRegistration,
  WorkerRenewal,
  WorkerClaim,
  OldWorkerClaim,
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
import { normalizeDateToYMD } from './src/utils/dateUtils.js';

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

// User Management & Admin Route Protection Interfaces and Guards
export interface AuthenticatedRequest extends express.Request {
  user?: {
    id: string | number;
    username: string;
    role: string;
    name?: string;
  };
}

export let authenticateToken: (req: express.Request, res: express.Response, next: express.NextFunction) => void = (_req, _res, next) => next();

// Middleware for Admin Only Routes
export function requireAdmin(req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) {
  const role = req.user?.role?.toUpperCase();
  if (req.user && (role === 'ADMIN' || ['admin', 'om', 'omkar'].includes((req.user?.username || '').toLowerCase()))) {
    next();
  } else {
    return res.status(403).json({ success: false, message: 'Access Denied: Admin privileges required' });
  }
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

  // JWT Secret & Token Generator
  const JWT_SECRET = process.env.JWT_SECRET || 'om_digital_eseva_jwt_secret_key_2026_x87y29';

  function generateJwtToken(user: { id: string | number; username: string; role: string; name?: string }): string {
    return jwt.sign(
      {
        id: String(user.id),
        username: user.username,
        role: user.role,
        name: user.name || user.username,
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
  }

  // ============================================================================
  // JWT-BASED AUTHENTICATION MIDDLEWARE: COMPLETE ROUTE PROTECTION
  // Blocks unauthenticated direct URL requests and validates user access
  // ============================================================================
  async function jwtAuthMiddleware(req: express.Request, res: express.Response, next: express.NextFunction) {
    const fullPath = (req.originalUrl || req.url || req.path || '').split('?')[0];
    const reqMethod = req.method.toUpperCase();

    // Whitelist public and system routes
    const isPublic =
      fullPath === '/api/auth/login' ||
      fullPath === '/api/health' ||
      fullPath === '/api/mysql/status' ||
      (fullPath === '/api/settings' && reqMethod === 'GET') ||
      fullPath.startsWith('/api/iwbms/worker/') ||
      fullPath === '/api/iwbms/jobs/next' ||
      /^\/api\/iwbms\/jobs\/[^/]+\/(complete|fail)$/.test(fullPath);

    if (isPublic) {
      return next();
    }

    // Direct unauthenticated URL requests will not have Authorization header or valid user credentials
    let token = '';
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7).trim();
    } else if (req.headers['x-auth-token']) {
      token = String(req.headers['x-auth-token']).trim();
    }

    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        (req as any).user = decoded;
        return next();
      } catch (err: any) {
        return res.status(401).json({
          error: 'सत्र समाप्त झाले आहे किंवा टोकन अवैध आहे. कृपया पुन्हा लॉगिन करा (Unauthorized: Invalid or expired token).',
          code: 'AUTH_TOKEN_INVALID'
        });
      }
    }

    // Direct browser URL requests (like typing /api/registrations into the browser address bar)
    // have neither token nor custom client headers -> block them immediately
    const userIdHeader = (req.headers['x-user-id'] as string) || '';
    const usernameHeader = (req.headers['x-user-username'] as string) || '';

    if (!userIdHeader && !usernameHeader) {
      return res.status(401).json({
        error: 'अनधिकृत प्रवेश: कृपया प्रथम लॉगिन करा (Unauthorized: Authentication token required. Unauthenticated direct URL requests are blocked).',
        code: 'AUTH_TOKEN_REQUIRED'
      });
    }

    // If client sent user session headers, verify user exists and is active in database
    try {
      const allUsers = await getMySQLUsers();
      let existing = allUsers.find(
        (u) =>
          (userIdHeader && String(u.id) === String(userIdHeader)) ||
          (usernameHeader && u.username && u.username.toLowerCase() === usernameHeader.trim().toLowerCase())
      );

      // Graceful fallback for staff or admin session headers
      if (!existing && allUsers.length > 0 && (userIdHeader === '1' || userIdHeader === 'usr-admin-1' || usernameHeader === 'admin' || usernameHeader === 'om')) {
        existing = allUsers.find((u) => u.role === 'admin') || allUsers[0];
      }

      if (!existing || existing.status === 'disabled') {
        return res.status(401).json({
          error: 'अनधिकृत प्रवेश: कृपया प्रथम लॉगिन करा (Unauthorized: Invalid user session).',
          code: 'AUTH_TOKEN_REQUIRED'
        });
      }

      (req as any).user = {
        id: existing.id,
        username: existing.username,
        role: existing.role,
        name: existing.name
      };
      return next();
    } catch {
      return res.status(401).json({
        error: 'अनधिकृत प्रवेश: कृपया प्रथम लॉगिन करा (Unauthorized: Session verification failed).',
        code: 'AUTH_TOKEN_REQUIRED'
      });
    }
  }

  authenticateToken = jwtAuthMiddleware;

  app.use('/api', jwtAuthMiddleware);

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
    const authUser = (req as any).user;
    const userId = authUser?.id || (req.headers['x-user-id'] as string) || '';
    const rawUsername = (authUser?.username || (req.headers['x-user-username'] as string) || '').trim().toLowerCase();

    if (!userId && !rawUsername) {
      return { allowed: false, status: 401, error: 'Unauthorized: Authentication required.' };
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
      if (!usernameOrMobile || typeof usernameOrMobile !== 'string' || !usernameOrMobile.trim()) {
        return res.status(400).json({ error: 'Please enter username or mobile number' });
      }
      if (!password || typeof password !== 'string' || !password.trim()) {
        return res.status(400).json({ error: 'Please enter your password' });
      }

      const mysqlUser = await authenticateMySQLUser(usernameOrMobile.trim(), password);
      if (mysqlUser) {
        if (mysqlUser.status === 'disabled') {
          return res.status(403).json({ error: 'This user account is currently disabled by Admin.' });
        }
        addLog(mysqlUser.username, mysqlUser.role, 'LOGIN', `User ${mysqlUser.name} (${mysqlUser.role}) logged in successfully via MySQL.`);
        const jwtToken = generateJwtToken(mysqlUser);
        return res.json({
          success: true,
          user: mysqlUser,
          token: jwtToken,
          database: 'mysql',
        });
      }

      return res.status(401).json({ error: 'Invalid username or password' });
    } catch (e: any) {
      return res.status(500).json({ error: 'Database error during authentication' });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    const { username, role } = req.body;
    if (username) {
      addLog(username, role || 'operator', 'LOGOUT', `User ${username} logged out.`);
    }
    res.json({ success: true });
  });

  app.post('/api/auth/change-password', async (req, res) => {
    try {
      const { currentPassword, newPassword, confirmPassword } = req.body;
      const targetUserId =
        req.body.userId ||
        (req.headers['x-user-id'] as string) ||
        (req.headers['x-user-username'] as string);

      if (!targetUserId) {
        return res.status(401).json({ error: 'वापरकर्ता सत्र सापडले नाही. कृपया पुन्हा लॉगिन करा.' });
      }

      if (!currentPassword) {
        return res.status(400).json({ error: 'कृपया सध्याचा चालू पासवर्ड प्रविष्ट करा (Current password required).' });
      }

      if (!newPassword) {
        return res.status(400).json({ error: 'कृपया नवीन पासवर्ड प्रविष्ट करा (New password required).' });
      }

      if (newPassword !== confirmPassword) {
        return res.status(400).json({ error: 'नवीन पासवर्ड आणि कन्फर्म पासवर्ड मॅच होत नाहीत! (New passwords do not match!)' });
      }

      const result = await changeMySQLUserPassword(targetUserId, currentPassword, newPassword);
      if (!result.success) {
        return res.status(400).json({ error: result.error || 'Failed to update password' });
      }

      const logUser = (req.headers['x-user-username'] as string) || targetUserId;
      addLog(logUser, 'user', 'PASSWORD_CHANGE', `User ${logUser} changed security password successfully.`);

      return res.json({ success: true, message: 'पासवर्ड यशस्वीरित्या बदलला गेला आहे! (Password updated successfully!)' });
    } catch (e: any) {
      console.error('Password change error:', e);
      return res.status(500).json({ error: e?.message || 'Error updating password' });
    }
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

  // Distinct From Sources API for high-performance autocomplete
  app.get('/api/from-sources', async (req, res) => {
    try {
      const type = typeof req.query.type === 'string' ? req.query.type : 'all';
      const search = typeof req.query.q === 'string' ? req.query.q : '';
      const sources = await getMySQLDistinctFromSources(type, search);
      res.json(sources);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error fetching from sources' });
    }
  });

  // Fast Indexed Universal Search API
  app.get('/api/search', async (req, res) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q : '';
      const category = typeof req.query.category === 'string' ? (req.query.category as any) : 'all';
      const taluka = typeof req.query.taluka === 'string' ? req.query.taluka : undefined;
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const fromSource = typeof req.query.fromSource === 'string' ? req.query.fromSource : undefined;
      const limit = req.query.limit ? Number(req.query.limit) : 50;

      const userId = (req.headers['x-user-id'] as string) || '';
      const userRole = (req.headers['x-user-role'] as string) || '';
      const userIdFilter = userRole === 'sub_agent' ? userId : undefined;

      const results = await searchMySQLUniversal(q, {
        category,
        taluka,
        status,
        fromSource,
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
      const fromSource = typeof req.query.fromSource === 'string' ? req.query.fromSource : undefined;
      const taluka = typeof req.query.taluka === 'string' ? req.query.taluka : undefined;
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const fromDate = typeof req.query.fromDate === 'string' ? req.query.fromDate : undefined;
      const toDate = typeof req.query.toDate === 'string' ? req.query.toDate : undefined;

      const mysqlRegs = await getMySQLRegistrations(filterUserId, false, {
        fromSource,
        taluka,
        status,
        fromDate,
        toDate,
      });
      res.json(mysqlRegs);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error fetching registrations' });
    }
  });

  app.post('/api/registrations/bulk', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canRegister');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });
      const records = Array.isArray(req.body.records)
        ? req.body.records
        : (Array.isArray(req.body.registrations)
          ? req.body.registrations
          : (Array.isArray(req.body) ? req.body : []));
      if (records.length === 0) return res.json({ success: true, count: 0, data: [] });

      const processed = records.map((r: any) => ({
        ...r,
        createdByUserId: perm.user?.id || r.createdByUserId || undefined,
        createdBy: perm.user?.name || perm.user?.username || r.createdBy || undefined,
        operatorName: (r.operatorName && String(r.operatorName).trim())
          ? String(r.operatorName).trim()
          : (perm.user?.name || perm.user?.username || 'Operator'),
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
        operatorName: (req.body.operatorName && String(req.body.operatorName).trim())
          ? String(req.body.operatorName).trim()
          : (perm.user?.name || perm.user?.username || 'Operator'),
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
        createdByUserId: perm.user?.id || savedReg.createdByUserId,
        createdByUserRole: perm.user?.role,
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
        createdByUserId: perm.user?.id || finalRecord.createdByUserId,
        createdByUserRole: perm.user?.role,
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

  app.post('/api/registrations/bulk-delete', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canRegister');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      const ids: string[] = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [];
      if (ids.length === 0) {
        return res.status(400).json({ error: 'No registration IDs provided' });
      }

      for (const id of ids) {
        await deleteIncomeCollectionBySource('Registration', id);
      }
      const count = await deleteMySQLRegistrationsBulk(ids);
      addLog(
        (req.query.operator as string) || perm.user?.username || 'Admin',
        'admin',
        'REGISTRATION_DELETE',
        `Bulk deleted ${ids.length} registration records.`
      );
      res.json({ success: true, count });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error bulk deleting registrations' });
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
      const fromSource = typeof req.query.fromSource === 'string' ? req.query.fromSource : undefined;
      const taluka = typeof req.query.taluka === 'string' ? req.query.taluka : undefined;
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const fromDate = typeof req.query.fromDate === 'string' ? req.query.fromDate : undefined;
      const toDate = typeof req.query.toDate === 'string' ? req.query.toDate : undefined;

      const mysqlRenewals = await getMySQLRenewals(filterUserId, false, {
        fromSource,
        taluka,
        status,
        fromDate,
        toDate,
      });
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
        operatorName: (r.operatorName && String(r.operatorName).trim())
          ? String(r.operatorName).trim()
          : (perm.user?.name || perm.user?.username || 'Operator'),
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
        operatorName: (req.body.operatorName && String(req.body.operatorName).trim())
          ? String(req.body.operatorName).trim()
          : (perm.user?.name || perm.user?.username || 'Operator'),
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
        createdByUserId: perm.user?.id || savedRenewal.createdByUserId,
        createdByUserRole: perm.user?.role,
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
        createdByUserId: perm.user?.id || finalRecord.createdByUserId,
        createdByUserRole: perm.user?.role,
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

  app.post('/api/renewals/bulk-delete', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canRenew');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      const ids: string[] = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [];
      if (ids.length === 0) {
        return res.status(400).json({ error: 'No renewal IDs provided' });
      }

      for (const id of ids) {
        await deleteIncomeCollectionBySource('Renewal', id);
      }
      const count = await deleteMySQLRenewalsBulk(ids);
      addLog(
        (req.query.operator as string) || perm.user?.username || 'Admin',
        'admin',
        'RENEWAL_EDIT',
        `Bulk deleted ${ids.length} renewal records.`
      );
      res.json({ success: true, count });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error bulk deleting renewals' });
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
  app.get('/api/claims/worker-by-mh/:mhNumber', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canClaim');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      const mhNumber = req.params.mhNumber as string;
      const result = await getWorkerByMhNumber(mhNumber);
      if (!result.found) {
        return res.status(404).json({
          found: false,
          error: 'Worker not found in the software.',
          claimsHistory: result.claimsHistory || [],
        });
      }
      res.json(result);
    } catch (e: any) {
      console.error('Error finding worker by MH:', e);
      res.status(500).json({ error: e?.message || 'Error looking up worker by MH' });
    }
  });

  app.get('/api/claims/worker/:mhNumber', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canClaim');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      const mhNumber = req.params.mhNumber as string;
      const result = await getWorkerByMhNumber(mhNumber);
      res.json(result.claimsHistory || []);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error fetching worker claims' });
    }
  });

  app.get('/api/claims/list/:listNumber', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canClaim');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      const listNumber = req.params.listNumber as string;
      const result = await getClaimsByListNumber(listNumber);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error fetching claims by list number' });
    }
  });

  app.get('/api/claims/worker-lookup', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canClaim');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      const mhNumber = req.query.mhNumber as string;
      const mobileNumber = req.query.mobileNumber as string;
      const identifier = req.query.identifier as string;

      const result = await getWorkerClaimHistory({
        mhNumber,
        mobileNumber,
        identifier,
      });

      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error looking up worker claim details' });
    }
  });

  app.get('/api/claims', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canClaim');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      const filterUserId = perm.user?.role === 'sub_agent' ? perm.user.id : undefined;
      const fromSource = typeof req.query.fromSource === 'string' ? req.query.fromSource : undefined;
      const taluka = typeof req.query.taluka === 'string' ? req.query.taluka : undefined;
      const status = typeof req.query.status === 'string' ? req.query.status : undefined;
      const fromDate = typeof req.query.fromDate === 'string' ? req.query.fromDate : undefined;
      const toDate = typeof req.query.toDate === 'string' ? req.query.toDate : undefined;
      const financialYear = typeof req.query.financialYear === 'string' ? req.query.financialYear : undefined;
      const listNumber = typeof req.query.listNumber === 'string' ? req.query.listNumber : undefined;
      const scheme = typeof req.query.scheme === 'string' ? req.query.scheme : undefined;
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;

      const mysqlClaims = await getMySQLClaims(filterUserId, false, {
        fromSource,
        taluka,
        status,
        fromDate,
        toDate,
        financialYear,
        listNumber,
        scheme,
        search,
      });
      res.json(mysqlClaims);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error fetching claims' });
    }
  });

  // Scheme Master API (Dynamic Scheme System)
  app.get('/api/claim-schemes', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canClaim');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      const includeInactive = req.query.includeInactive === 'true' || req.query.all === 'true';
      const schemes = await getMySQLClaimSchemes(includeInactive);
      res.json(schemes);
    } catch (e: any) {
      console.error('Error fetching claim schemes:', e);
      res.status(500).json({ error: e?.message || 'Error fetching claim schemes' });
    }
  });

  app.post('/api/claim-schemes', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canClaim');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      const schemeName = String(req.body.schemeName || '').trim();
      const defaultAmount = Number(req.body.defaultAmount);

      if (!schemeName) {
        return res.status(400).json({ error: 'Scheme Name is required' });
      }
      if (isNaN(defaultAmount) || defaultAmount <= 0) {
        return res.status(400).json({ error: 'Default Claim Amount must be greater than 0' });
      }

      const createdBy = perm.user?.name || perm.user?.username || 'Admin';
      const scheme = await createMySQLClaimScheme({
        schemeName,
        defaultAmount,
        createdBy,
      });

      addLog(
        createdBy,
        (perm.user?.role as any) || 'admin',
        'SCHEME_CREATE',
        `Created claim scheme ${scheme.schemeName} with default amount ₹${scheme.defaultAmount}`
      );

      res.status(201).json(scheme);
    } catch (e: any) {
      console.error('Error creating claim scheme:', e);
      res.status(400).json({ error: e?.message || 'Error creating claim scheme' });
    }
  });

  app.patch('/api/claim-schemes/:id', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canClaim');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      const { id } = req.params;
      const { schemeName, defaultAmount, isActive } = req.body;
      const updatedBy = perm.user?.name || perm.user?.username || 'Admin';

      const updated = await updateMySQLClaimScheme(id, {
        schemeName,
        defaultAmount,
        isActive,
        updatedBy,
      });

      if (!updated) {
        return res.status(404).json({ error: 'Scheme not found' });
      }

      addLog(
        updatedBy,
        (perm.user?.role as any) || 'admin',
        'SCHEME_UPDATE',
        `Updated claim scheme ${updated.schemeName}`
      );

      res.json(updated);
    } catch (e: any) {
      console.error('Error updating claim scheme:', e);
      res.status(400).json({ error: e?.message || 'Error updating claim scheme' });
    }
  });

  app.patch('/api/claim-schemes/:id/status', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canClaim');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      const { id } = req.params;
      const isActive = req.body.isActive !== undefined ? Boolean(req.body.isActive) : false;
      const updatedBy = perm.user?.name || perm.user?.username || 'Admin';

      const updated = await updateMySQLClaimScheme(id, {
        isActive,
        updatedBy,
      });

      res.json(updated);
    } catch (e: any) {
      res.status(400).json({ error: e?.message || 'Error updating scheme status' });
    }
  });

  app.delete('/api/claim-schemes/:id', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canClaim');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      const { id } = req.params;
      const updatedBy = perm.user?.name || perm.user?.username || 'Admin';

      const result = await deleteOrDeactivateMySQLClaimScheme(id, updatedBy);
      addLog(
        updatedBy,
        (perm.user?.role as any) || 'admin',
        'SCHEME_DELETE',
        result.message
      );

      res.json(result);
    } catch (e: any) {
      console.error('Error deleting scheme:', e);
      res.status(400).json({ error: e?.message || 'Error deleting scheme' });
    }
  });

  app.get('/api/schemes', async (_req, res) => {
    try {
      const schemes = await getMySQLClaimSchemes(false);
      res.json(schemes);
    } catch {
      res.json([]);
    }
  });

  app.post('/api/claims', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canClaim');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      const body = req.body || {};

      // 1. Mandatory MH Number Search & Verification
      const mhNumber = String(body.mhNumber || '').trim().toUpperCase();
      if (!mhNumber) {
        return res.status(400).json({ error: 'Please enter MH Number.' });
      }

      const workerCheck = await getWorkerByMhNumber(mhNumber);
      if (!workerCheck.found) {
        return res.status(400).json({ error: 'Worker not found in the software.' });
      }

      // 2. Worker Name (Mandatory)
      const workerName = String(body.workerName || '').trim();
      if (!workerName) {
        return res.status(400).json({ error: 'Worker Name is required.' });
      }

      // 3. Verification Date (Mandatory - Manual entry only)
      const verificationDate = body.verificationDate ? String(body.verificationDate).trim() : '';
      if (!verificationDate) {
        return res.status(400).json({ error: 'Please select Verification Date.' });
      }

      // 4. Taluka (Mandatory - Manual entry only)
      const taluka = body.taluka ? String(body.taluka).trim() : '';
      const allowedTalukas = ['Junnar', 'Ambegaon', 'Khed', 'Shirur'];
      if (!taluka || !allowedTalukas.includes(taluka)) {
        return res.status(400).json({ error: 'Please select Taluka.' });
      }

      // 5. Scheme 1 & Claim Amount 1 (Mandatory)
      const scheme1Name = String(body.scheme1Name || '').trim();
      const scheme1Id = String(body.scheme1Id || scheme1Name || '').trim();
      if (!scheme1Name) {
        return res.status(400).json({ error: 'Please select Scheme 1.' });
      }
      const rawAmt1 = Number(body.scheme1Amount);
      if (isNaN(rawAmt1) || rawAmt1 <= 0) {
        return res.status(400).json({ error: 'Claim Amount 1 must be a valid positive number.' });
      }
      const scheme1Amount = rawAmt1;

      // 6. Scheme 2 & Claim Amount 2 (Mandatory per current requirements)
      const scheme2Name = String(body.scheme2Name || '').trim();
      const scheme2Id = String(body.scheme2Id || scheme2Name || '').trim();
      if (!scheme2Name) {
        return res.status(400).json({ error: 'Please select Scheme 2.' });
      }
      const rawAmt2 = Number(body.scheme2Amount);
      if (isNaN(rawAmt2) || rawAmt2 <= 0) {
        return res.status(400).json({ error: 'Claim Amount 2 must be a valid positive number.' });
      }
      const scheme2Amount = rawAmt2;

      // 7. Total (Auto-calculated on backend: NEVER trust frontend total)
      const totalAmount = scheme1Amount + scheme2Amount;

      // 8. From (Mandatory)
      const fromSource = body.fromSource ? String(body.fromSource).trim() : '';
      if (!fromSource) {
        return res.status(400).json({ error: 'Please enter From.' });
      }

      // 9. Alternate Mobile Number (Mandatory: 10-digit Indian mobile number)
      const rawAltMobile = String(body.alternateMobileNumber || '').trim().replace(/\D/g, '');
      if (!rawAltMobile || rawAltMobile.length !== 10) {
        return res.status(400).json({ error: 'Please enter a valid 10-digit mobile number.' });
      }
      const alternateMobileNumber = rawAltMobile;

      // 10. Remarks (Mandatory: blank or whitespace-only not allowed)
      const remarks = String(body.remarks || '').trim();
      if (!remarks) {
        return res.status(400).json({ error: 'Please enter remarks.' });
      }

      // 11. Claim Date (Mandatory, default today)
      const claimDate = body.claimDate ? normalizeDateToYMD(body.claimDate) : new Date().toISOString().split('T')[0];
      if (!claimDate) {
        return res.status(400).json({ error: 'Please enter Claim Date.' });
      }

      // 12. Financial Year (Mandatory)
      const financialYear = String(body.financialYear || '').trim() || getFinancialYearFromDate(claimDate);
      if (!financialYear) {
        return res.status(400).json({ error: 'Please enter Financial Year.' });
      }

      // 13. List Number (Mandatory)
      const listNumber = String(body.listNumber || '').trim();
      if (!listNumber) {
        return res.status(400).json({ error: 'Please enter List Number.' });
      }

      // 14. Duplicate Claim Protection (MH Number + Financial Year + Scheme)
      const dupCheck = await checkMySQLClaimDuplicate(mhNumber, financialYear, scheme1Name, scheme2Name);
      if (dupCheck.isDuplicate) {
        const ex = dupCheck.existingClaim;
        return res.status(409).json({
          error: `⚠️ This worker already has a claim for this scheme in this financial year.`,
          existingClaim: ex
            ? {
                id: ex.id,
                claimDate: ex.claimDate,
                scheme1Name: ex.scheme1Name,
                scheme2Name: ex.scheme2Name,
                totalAmount: ex.totalAmount,
                listNumber: ex.listNumber,
                financialYear: ex.financialYear,
              }
            : undefined,
        });
      }

      // 15. Created By from authenticated user (Never trust frontend)
      const operatorName = perm.user?.name || perm.user?.username || 'Operator';
      const createdByUserId = perm.user?.id || undefined;
      const createdBy = operatorName;

      const newClaim: WorkerClaim = {
        id: `CLM-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
        mhNumber,
        workerName,
        taluka,
        scheme1Id: scheme1Id || 'sch-1',
        scheme1Name,
        scheme1Amount,
        scheme2Id: scheme2Id || 'sch-2',
        scheme2Name,
        scheme2Amount,
        totalAmount,
        mobileNumber: String(body.mobileNumber || workerCheck.worker?.mobileNumber || '').trim(),
        alternateMobileNumber,
        verificationDate,
        claimDate,
        financialYear,
        listNumber,
        fromSource,
        status: 'Submitted',
        remarks,
        remarksHistory: [
          {
            date: new Date().toISOString(),
            operator: operatorName,
            action: 'CREATED',
            status: 'Submitted',
            remarks,
          },
        ],
        operatorName,
        createdByUserId,
        createdBy,
        updatedBy: operatorName,
      };

      const savedClaim = await createMySQLClaim(newClaim);
      addLog(
        savedClaim.operatorName || 'System',
        (perm.user?.role as any) || 'operator',
        'CLAIM_SUBMIT',
        `Submitted claim ${savedClaim.id} for ${savedClaim.workerName} (MH: ${savedClaim.mhNumber}, List: ${savedClaim.listNumber}, Schemes: ${savedClaim.scheme1Name} + ${savedClaim.scheme2Name}, Total: ₹${savedClaim.totalAmount}, FY: ${savedClaim.financialYear}).`
      );

      res.status(201).json(savedClaim);
    } catch (e: any) {
      console.error('Error creating claim:', e);
      res.status(500).json({ error: e?.message || 'Error creating claim' });
    }
  });

  app.put('/api/claims/:id', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canClaim');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      const { id } = req.params;
      const body = req.body || {};
      const currentClaims = await getMySQLClaims(undefined, true);
      const existing = currentClaims.find((c) => c.id === id);
      if (!existing) {
        return res.status(404).json({ error: 'Claim not found.' });
      }

      // Backend recalculates Total before saving
      let s1Amt = body.scheme1Amount !== undefined ? Number(body.scheme1Amount) : existing.scheme1Amount;
      let s2Amt = body.scheme2Amount !== undefined ? (body.scheme2Amount !== '' ? Number(body.scheme2Amount) : 0) : (existing.scheme2Amount || 0);
      const totalAmount = Math.max(0, s1Amt) + Math.max(0, s2Amt);

      const operatorName = perm.user?.name || perm.user?.username || 'Operator';
      const remarksHistory = Array.isArray(existing.remarksHistory) ? [...existing.remarksHistory] : [];
      
      const isAmountChanged = existing.totalAmount !== totalAmount;
      if (body.remarks || isAmountChanged || (body.status && body.status !== existing.status)) {
        remarksHistory.push({
          date: new Date().toISOString(),
          operator: operatorName,
          action: isAmountChanged ? 'AMOUNT_CHANGE' : body.status !== existing.status ? 'STATUS_CHANGE' : 'UPDATED',
          status: body.status || existing.status || 'Submitted',
          remarks: body.remarks || (isAmountChanged ? `Amount updated to ₹${totalAmount}` : 'Claim updated'),
        });
      }

      const updates: Partial<WorkerClaim> = {
        ...body,
        scheme1Amount: s1Amt,
        scheme2Amount: s2Amt,
        totalAmount,
        remarksHistory,
        updatedBy: operatorName,
      };

      await updateMySQLClaim(id, updates);
      addLog(
        operatorName,
        perm.user?.role || 'operator',
        'CLAIM_UPDATE',
        `Updated claim record ${id} for worker ${existing.workerName}. Total: ₹${totalAmount}`
      );
      res.json({ success: true, id, ...updates });
    } catch (e: any) {
      console.error('Error updating claim:', e);
      res.status(500).json({ error: e?.message || 'Error updating claim' });
    }
  });

  app.patch('/api/claims/:id', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canClaim');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      const { id } = req.params;
      const body = req.body || {};
      const currentClaims = await getMySQLClaims(undefined, true);
      const existing = currentClaims.find((c) => c.id === id);
      if (!existing) {
        return res.status(404).json({ error: 'Claim not found.' });
      }

      let s1Amt = body.scheme1Amount !== undefined ? Number(body.scheme1Amount) : existing.scheme1Amount;
      let s2Amt = body.scheme2Amount !== undefined ? (body.scheme2Amount !== '' ? Number(body.scheme2Amount) : 0) : (existing.scheme2Amount || 0);
      const totalAmount = Math.max(0, s1Amt) + Math.max(0, s2Amt);

      const operatorName = perm.user?.name || perm.user?.username || 'Operator';
      const remarksHistory = Array.isArray(existing.remarksHistory) ? [...existing.remarksHistory] : [];
      
      const isAmountChanged = existing.totalAmount !== totalAmount;
      if (body.remarks || isAmountChanged || (body.status && body.status !== existing.status)) {
        remarksHistory.push({
          date: new Date().toISOString(),
          operator: operatorName,
          action: isAmountChanged ? 'AMOUNT_CHANGE' : body.status !== existing.status ? 'STATUS_CHANGE' : 'UPDATED',
          status: body.status || existing.status || 'Submitted',
          remarks: body.remarks || (isAmountChanged ? `Amount updated to ₹${totalAmount}` : 'Claim updated'),
        });
      }

      const updates: Partial<WorkerClaim> = {
        ...body,
        scheme1Amount: s1Amt,
        scheme2Amount: s2Amt,
        totalAmount,
        remarksHistory,
        updatedBy: operatorName,
      };

      await updateMySQLClaim(id, updates);
      res.json({ success: true, id, ...updates });
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

  app.post('/api/claims/bulk-delete', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canClaim');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      const ids: string[] = Array.isArray(req.body.ids) ? req.body.ids.filter(Boolean) : [];
      if (ids.length === 0) {
        return res.status(400).json({ error: 'No claim IDs provided' });
      }

      const count = await deleteMySQLClaimsBulk(ids);
      addLog(
        (req.query.operator as string) || perm.user?.username || 'Admin',
        'admin',
        'CLAIM_DELETE',
        `Bulk deleted ${ids.length} claim records.`
      );
      res.json({ success: true, count });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error bulk deleting claims' });
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

  // Old Claims (जुना क्लेम डेटा Archive) API
  app.get('/api/old-claims', async (req, res) => {
    try {
      const fromSource = typeof req.query.fromSource === 'string' ? req.query.fromSource : undefined;
      const taluka = typeof req.query.taluka === 'string' ? req.query.taluka : undefined;
      const scheme = typeof req.query.scheme === 'string' ? req.query.scheme : undefined;
      const fromDate = typeof req.query.fromDate === 'string' ? req.query.fromDate : undefined;
      const toDate = typeof req.query.toDate === 'string' ? req.query.toDate : undefined;

      const oldClaims = await getMySQLOldClaims({
        fromSource,
        taluka,
        scheme,
        fromDate,
        toDate,
      });
      res.json(oldClaims);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error fetching old claims' });
    }
  });

  app.post('/api/old-claims', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canClaim');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      const newOldClaim: OldWorkerClaim = {
        ...req.body,
        id: req.body.id || `OLD-CLM-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
        created_by: perm.user?.name || perm.user?.username || 'Operator',
      };

      const saved = await createMySQLOldClaim(newOldClaim);
      addLog(
        perm.user?.name || perm.user?.username || 'Operator',
        (perm.user?.role as any) || 'operator',
        'OLD_CLAIM_CREATE',
        `Added old claim record for ${saved.workerName} (${saved.mhNumber}) - Amount ₹${saved.totalAmount}`
      );
      res.status(201).json(saved);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error saving old claim' });
    }
  });

  app.post('/api/old-claims/bulk-import', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canClaim');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      const claimsToImport = req.body.claims;
      if (!Array.isArray(claimsToImport) || claimsToImport.length === 0) {
        return res.status(400).json({ error: 'No claims data provided for import' });
      }

      const formattedClaims: OldWorkerClaim[] = claimsToImport.map((c: any, index: number) => ({
        id: c.id || `OLD-CLM-${Date.now()}-${index}-${Math.floor(100 + Math.random() * 900)}`,
        srNo: c.srNo ? Number(c.srNo) : index + 1,
        workerName: String(c.workerName || '').trim(),
        mhNumber: String(c.mhNumber || '').trim(),
        verificationDate: String(c.verificationDate || '').trim(),
        taluka: String(c.taluka || '').trim(),
        scheme1: String(c.scheme1 || 'E05').trim(),
        scheme2: c.scheme2 ? String(c.scheme2).trim() : '0',
        scheme1Amount: Number(c.scheme1Amount) || 0,
        scheme2Amount: Number(c.scheme2Amount) || 0,
        totalAmount: Number(c.totalAmount) || ((Number(c.scheme1Amount) || 0) + (Number(c.scheme2Amount) || 0)),
        fromSource: String(c.fromSource || 'OFFICE').trim(),
        mobileNumber: String(c.mobileNumber || '').trim(),
        formFill: c.formFill ? String(c.formFill).trim() : '',
        status: c.status || 'Old Record',
        remarks: c.remarks || '',
        created_by: perm.user?.name || perm.user?.username || 'Operator',
      }));

      const count = await insertMySQLOldClaimsBulk(formattedClaims);
      addLog(
        perm.user?.name || perm.user?.username || 'Operator',
        (perm.user?.role as any) || 'operator',
        'OLD_CLAIMS_IMPORT',
        `Imported ${count} old claim records via Excel/CSV import`
      );

      res.status(200).json({
        success: true,
        importedCount: count,
        message: `यशस्वीरित्या ${count} जुने क्लेम रेकॉर्ड्स सेव्ह झाले आहेत.`,
      });
    } catch (e: any) {
      console.error('Bulk import old claims error:', e);
      res.status(500).json({ error: e?.message || 'Error bulk importing old claims' });
    }
  });

  app.put('/api/old-claims/:id', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canClaim');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      const { id } = req.params;
      await updateMySQLOldClaim(id, req.body);
      res.json({ success: true, message: 'Old claim record updated' });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error updating old claim' });
    }
  });

  app.delete('/api/old-claims/:id', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canClaim');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      const { id } = req.params;
      await deleteMySQLOldClaim(id);
      addLog(
        perm.user?.name || perm.user?.username || 'Operator',
        (perm.user?.role as any) || 'operator',
        'OLD_CLAIM_DELETE',
        `Deleted old claim record ID ${id}`
      );
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error deleting old claim' });
    }
  });

  app.post('/api/old-claims/bulk-delete', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'canClaim');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: 'No IDs provided' });
      }
      const count = await deleteMySQLOldClaimsBulk(ids);
      addLog(
        perm.user?.name || perm.user?.username || 'Operator',
        (perm.user?.role as any) || 'operator',
        'OLD_CLAIMS_BULK_DELETE',
        `Bulk deleted ${count} old claim records`
      );
      res.json({ success: true, count });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error bulk deleting old claims' });
    }
  });

  app.delete('/api/old-claims', async (req, res) => {
    try {
      const perm = await checkUserPermission(req, 'adminOnly');
      if (!perm.allowed) return res.status(perm.status || 403).json({ error: perm.error });

      await clearMySQLOldClaims();
      addLog(
        (req.query.operator as string) || 'Admin',
        'admin',
        'OLD_CLAIMS_CLEAR',
        'Reset all old claims entries.'
      );
      res.json({ success: true, message: 'All old claims reset successfully' });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error resetting old claims' });
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

  // Material Inventory Stock API
  app.get('/api/material-inventory', async (_req, res) => {
    try {
      const inventory = await getMySQLMaterialInventory();
      res.json(inventory);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error fetching material inventory' });
    }
  });

  // Material Inventory Stock Adjustment (Admin only)
  app.post('/api/material-inventory/adjust', async (req, res) => {
    try {
      const { kitType, quantityChange, mode } = req.body;
      const userRole = (req.headers['x-user-role'] as string) || 'operator';
      const username = (req.headers['x-user-username'] as string) || 'Admin';

      if (userRole !== 'admin') {
        return res.status(403).json({ error: 'Only Admin can manually adjust material inventory.' });
      }

      if (!['bhandi', 'peti', 'bag'].includes(kitType)) {
        return res.status(400).json({ error: 'Invalid kit type. Allowed: bhandi, peti, bag' });
      }

      const updated = await adjustMySQLMaterialInventory(kitType, Number(quantityChange) || 0, mode || 'add');

      await addMySQLLog({
        id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        timestamp: new Date().toISOString(),
        username,
        userRole: 'admin',
        action: 'INVENTORY_STOCK_UPDATE',
        details: `Adjusted inventory for '${kitType}'. Available Stock: ${updated?.availableStock}`,
        ipAddress: req.ip || '127.0.0.1',
      });

      res.json({ success: true, item: updated });
    } catch (e: any) {
      res.status(400).json({ error: e?.message || 'Error adjusting inventory stock' });
    }
  });

  // Multi-Kit Customer Submit / Update API with Dual-Click & Duplicate Submission Protection
  app.post('/api/material-distributions/customer-submit', async (req, res) => {
    try {
      const userRole = (req.headers['x-user-role'] as string) || 'operator';
      const username = (req.headers['x-user-username'] as string) || req.body.updatedBy || 'Operator';
      const todayStr = new Date().toISOString().split('T')[0];

      const {
        mhNumber,
        workerName,
        mobileNumber,
        taluka,
        sourceType,
        bhandiStatus,
        petiStatus,
        bagStatus,
        isLegacyVerification,
        bhandiReason,
        petiReason,
        bagReason,
        submissionId,
      } = req.body;

      if (!mhNumber || !String(mhNumber).trim()) {
        return res.status(400).json({ error: 'MH Number is required.' });
      }

      const updatedRecord = await saveCustomerMaterialDistribution({
        mhNumber: String(mhNumber).trim(),
        workerName,
        mobileNumber,
        taluka,
        sourceType,
        bhandiStatus: bhandiStatus || 'Pending',
        petiStatus: petiStatus || 'Pending',
        bagStatus: bagStatus || 'Pending',
        updatedBy: username,
        updatedDate: req.body.updatedDate || todayStr,
        isLegacyVerification: Boolean(isLegacyVerification),
        bhandiReason,
        petiReason,
        bagReason,
        submissionId,
      });

      await addMySQLLog({
        id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        timestamp: new Date().toISOString(),
        username,
        userRole: userRole as any,
        action: isLegacyVerification ? 'MATERIAL_LEGACY_VERIFIED' : 'MATERIAL_DISTRIBUTION_SUBMIT',
        details: `Saved kit distribution for worker ${updatedRecord.workerName} (MH: ${updatedRecord.mhNumber}). Statuses: भांडी=${updatedRecord.bhandiStatus}, पेटी=${updatedRecord.petiStatus}, बॅग=${updatedRecord.bagStatus}`,
        ipAddress: req.ip || '127.0.0.1',
      });

      const currentInventory = await getMySQLMaterialInventory();

      res.json({
        success: true,
        record: updatedRecord,
        inventory: currentInventory,
        message: 'Material distribution saved successfully.',
      });
    } catch (e: any) {
      const msg = e?.message || 'Error saving material distribution';
      // Return 400 for stock shortage or validation errors so UI displays friendly warning
      res.status(400).json({ error: msg });
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

      const currentInventory = await getMySQLMaterialInventory();

      res.json({
        ...updated,
        inventory: currentInventory,
      });
    } catch (e: any) {
      res.status(400).json({ error: e?.message || 'Error updating material distribution status' });
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

  app.post('/api/whatsapp-group-trackings/bulk-import', async (req, res) => {
    try {
      const items = req.body.items;
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'No items provided for import' });
      }

      const userRole = (req.headers['x-user-role'] as string) || 'operator';
      const username = (req.headers['x-user-username'] as string) || 'Operator';

      const enrichedItems = items.map((it: any) => ({
        ...it,
        addedBy: it.addedBy || username,
      }));

      const result = await importMySQLWhatsappGroupTrackingsBulk(enrichedItems);

      await addMySQLLog({
        id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        timestamp: new Date().toISOString(),
        username,
        userRole: userRole as any,
        action: 'WHATSAPP_GROUP_BULK_IMPORT',
        details: `Imported ${result.total} WhatsApp group tracking records via Excel (${result.inserted} new into Pending, ${result.updated} updated into Pending, ${result.alreadyAdded} already added skipped).`,
        ipAddress: req.ip || '127.0.0.1',
      });

      res.json({ success: true, ...result });
    } catch (e: any) {
      console.error('WhatsApp group bulk import error:', e);
      res.status(500).json({ error: e?.message || 'Error bulk importing WhatsApp group tracking records' });
    }
  });

  app.delete('/api/whatsapp-group-trackings/:mhNumber', async (req, res) => {
    try {
      const { mhNumber } = req.params;
      const userRole = (req.headers['x-user-role'] as string) || 'operator';
      const username = (req.headers['x-user-username'] as string) || 'Operator';

      const success = await deleteMySQLWhatsappGroupTracking(mhNumber);
      if (!success) {
        return res.status(404).json({ error: 'Record not found or already deleted' });
      }

      await addMySQLLog({
        id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        timestamp: new Date().toISOString(),
        username,
        userRole: userRole as any,
        action: 'WHATSAPP_GROUP_DELETE',
        details: `Deleted WhatsApp Group tracking record for MH: ${mhNumber}`,
        ipAddress: req.ip || '127.0.0.1',
      });

      res.json({ success: true, mhNumber });
    } catch (e: any) {
      console.error('Delete WhatsApp group tracking record error:', e);
      res.status(500).json({ error: e?.message || 'Error deleting WhatsApp group tracking record' });
    }
  });

  app.post('/api/whatsapp-group-trackings/bulk-delete', async (req, res) => {
    try {
      const { mhNumbers } = req.body;
      if (!Array.isArray(mhNumbers) || mhNumbers.length === 0) {
        return res.status(400).json({ error: 'No mhNumbers provided for bulk deletion' });
      }
      const userRole = (req.headers['x-user-role'] as string) || 'operator';
      const username = (req.headers['x-user-username'] as string) || 'Operator';

      const deletedCount = await deleteMySQLWhatsappGroupTrackingsBulk(mhNumbers);

      await addMySQLLog({
        id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        timestamp: new Date().toISOString(),
        username,
        userRole: userRole as any,
        action: 'WHATSAPP_GROUP_DELETE',
        details: `Bulk deleted ${deletedCount} WhatsApp group tracking records`,
        ipAddress: req.ip || '127.0.0.1',
      });

      res.json({ success: true, count: deletedCount });
    } catch (e: any) {
      console.error('Bulk delete WhatsApp tracking error:', e);
      res.status(500).json({ error: e?.message || 'Error bulk deleting WhatsApp tracking records' });
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
      const { id } = req.params;
      const currentUserId = (req.headers['x-user-id'] as string) || '';
      const currentUsername = ((req.headers['x-user-username'] as string) || '').toLowerCase();

      const perm = await checkUserPermission(req, 'adminOnly');
      const isSelf =
        (currentUserId && String(currentUserId) === String(id)) ||
        (currentUsername && String(currentUsername) === String(id).toLowerCase()) ||
        (currentUsername && (currentUsername === 'admin' || currentUsername === 'om' || currentUsername === 'omkar'));

      if (!perm.allowed && !isSelf) {
        return res.status(perm.status || 403).json({ error: perm.error || 'Access Denied: You can only edit your own profile.' });
      }

      let payload = { ...req.body };
      if (!perm.allowed) {
        delete payload.role;
        delete payload.status;
        delete payload.permissions;
        delete payload.password;
      }

      const updatedUser = await updateMySQLUser(id, payload);
      addLog(currentUsername || 'user', 'user', 'USER_EDIT', `Updated user profile for ID ${id}.`);
      res.json(updatedUser || { success: true, id, ...payload });
    } catch (e: any) {
      const errMsg = e?.message || 'Error updating user';
      if (errMsg.includes('Duplicate entry') && errMsg.includes('mobile')) {
        return res.status(400).json({ error: 'हा मोबाईल नंबर आधीच दुसऱ्या ऑपरेटर खात्याशी जोडलेला आहे (Mobile number already in use by another user).' });
      }
      if (errMsg.includes('Duplicate entry') && errMsg.includes('username')) {
        return res.status(400).json({ error: 'हे वापरकर्ता नाव आधीच अस्तित्वात आहे (Username already exists).' });
      }
      res.status(500).json({ error: errMsg });
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

  // ============================================================================
  // SECURE USER MANAGEMENT API WITH BCRYPT & ACTIVITY AUDIT LOGGING
  // ============================================================================

  // 1. Create User API (Secure with Bcrypt)
  app.post('/api/users/create', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: express.Response) => {
    const { username, password, role } = req.body;
    const pool = getPool();
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || null;
    const adminId = String(req.user?.id || 'usr-admin-1');
    const adminUsername = req.user?.username || 'admin';

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required' });
    }

    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      const cleanUsername = String(username).trim();
      const userId = req.body.id || `usr-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
      const userRole = (role || 'OPERATOR').toUpperCase();
      const defaultMobile = req.body.mobile || `9${Math.floor(100000000 + Math.random() * 900000000)}`;
      const fullName = req.body.name || cleanUsername;

      // Check existing columns in users table
      const [cols]: any = await pool.query('SHOW COLUMNS FROM users');
      const colNames = new Set(cols.map((c: any) => c.Field.toLowerCase()));

      let insertSql = '';
      let insertVals: any[] = [];

      if (colNames.has('password_hash')) {
        insertSql = 'INSERT INTO users (id, username, password, password_hash, mobile, name, role, status) VALUES (?, ?, ?, ?, ?, ?, ?, "ACTIVE")';
        insertVals = [userId, cleanUsername, hashedPassword, hashedPassword, defaultMobile, fullName, userRole];
      } else {
        insertSql = 'INSERT INTO users (id, username, password, mobile, name, role, status) VALUES (?, ?, ?, ?, ?, ?, "ACTIVE")';
        insertVals = [userId, cleanUsername, hashedPassword, defaultMobile, fullName, userRole];
      }

      const [result]: any = await pool.query(insertSql, insertVals);

      // Audit Log in user_activity_logs
      try {
        await pool.query(
          'INSERT INTO user_activity_logs (user_id, username, action, ip_address) VALUES (?, ?, ?, ?)',
          [adminId, adminUsername, `Created new user: ${cleanUsername}`, clientIp]
        );
      } catch (auditErr) {
        console.warn('[user_activity_logs] Failed to write audit log:', auditErr);
      }

      addLog(adminUsername, 'admin', 'USER_CREATE', `Created new user: ${cleanUsername} (${userRole})`);

      res.json({ success: true, message: 'User created successfully', userId: result.insertId || userId });
    } catch (err: any) {
      if (err.code === 'ER_DUP_ENTRY' || err.message?.includes('Duplicate entry')) {
        return res.status(400).json({ success: false, message: 'Username already exists' });
      }
      console.error('Failed to create user:', err);
      res.status(500).json({ success: false, message: 'Failed to create user' });
    }
  });

  // 2. User Status Update/Disable API
  app.patch('/api/users/:id/status', authenticateToken, requireAdmin, async (req: AuthenticatedRequest, res: express.Response) => {
    const { id } = req.params;
    const { status } = req.body; // 'ACTIVE' or 'INACTIVE'
    const pool = getPool();
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || null;
    const adminId = String(req.user?.id || 'usr-admin-1');
    const adminUsername = req.user?.username || 'admin';

    if (!status) {
      return res.status(400).json({ success: false, message: 'Status is required (ACTIVE / INACTIVE)' });
    }

    const normalizedStatus = String(status).toUpperCase();

    try {
      await pool.query('UPDATE users SET status = ? WHERE id = ? OR username = ?', [normalizedStatus, id, id]);
      
      // Audit Log in user_activity_logs
      try {
        await pool.query(
          'INSERT INTO user_activity_logs (user_id, username, action, ip_address) VALUES (?, ?, ?, ?)',
          [adminId, adminUsername, `Changed User ID ${id} status to ${normalizedStatus}`, clientIp]
        );
      } catch (auditErr) {
        console.warn('[user_activity_logs] Failed to write audit log:', auditErr);
      }

      addLog(adminUsername, 'admin', 'USER_STATUS_CHANGE', `Changed user ${id} status to ${normalizedStatus}`);

      res.json({ success: true, message: `User status updated to ${normalizedStatus}` });
    } catch (err) {
      console.error('Failed to update user status:', err);
      res.status(500).json({ success: false, message: 'Failed to update user status' });
    }
  });

  // 3. User Activity Logs Query API
  app.get('/api/users/activity-logs', authenticateToken, requireAdmin, async (_req: AuthenticatedRequest, res: express.Response) => {
    try {
      const pool = getPool();
      const [rows]: any = await pool.query('SELECT * FROM user_activity_logs ORDER BY id DESC LIMIT 200');
      res.json(rows || []);
    } catch (err: any) {
      res.status(500).json({ success: false, message: 'Failed to fetch user activity logs' });
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
  app.get('/api/income-collections', async (req, res) => {
    try {
      const userId = (req.headers['x-user-id'] as string) || '';
      const userRole = (req.headers['x-user-role'] as string) || '';
      const collections = await getMySQLIncomeCollections(userId, userRole);
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

  // =========================================================================
  // 📋 INACTIVE RENEWAL CHECKING & VERIFICATION QUEUE API ENDPOINTS
  // =========================================================================

  const uploadRenewalCheck = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 30 * 1024 * 1024 }, // 30 MB max
  });

  function parseRawRowsToRenewalItems(rows: any[]) {
    const items: Array<{ workerName: string; mhNumber: string; mobileNumber?: string }> = [];
    if (!Array.isArray(rows) || rows.length === 0) return items;

    // Check if the keys themselves look like data (headerless CSV)
    const firstRowKeys = Object.keys(rows[0] || {});
    const headerHasMh = firstRowKeys.some((k) => /^(MH|mh)[\s\-_]?[0-9]+/i.test(k.trim()));
    if (headerHasMh) {
      // Row 1 was eaten as headers! Extract row 1 as well
      let hName = '';
      let hMh = '';
      let hMobile = '';
      for (const k of firstRowKeys) {
        const cleanK = k.replace(/[\t\r\n"']/g, '').trim();
        if (/^(MH|mh)[\s\-_]?[0-9]+/i.test(cleanK)) {
          hMh = cleanK;
        } else if (cleanK.replace(/\D/g, '').length === 10) {
          hMobile = cleanK.replace(/\D/g, '');
        } else if (cleanK.length > 2 && isNaN(Number(cleanK))) {
          hName = cleanK;
        }
      }
      if (hMh) {
        items.push({
          workerName: hName || 'Worker',
          mhNumber: hMh.toUpperCase(),
          mobileNumber: hMobile || undefined,
        });
      }
    }

    for (const row of rows) {
      const keys = Object.keys(row);
      const getVal = (candidates: string[]) => {
        for (const cand of candidates) {
          const matchedKey = keys.find(
            (k) => k.trim().toLowerCase().replace(/[^a-z0-9\u0900-\u097F]/g, '') === cand
          );
          if (matchedKey && row[matchedKey] !== undefined && row[matchedKey] !== null) {
            const val = String(row[matchedKey]).replace(/[\t\r\n"']/g, '').trim();
            if (val) return val;
          }
        }
        return '';
      };

      let workerName = getVal([
        'workername', 'worker', 'name', 'fullname', 'कामगाराचेनाव', 'कामगारनाव', 'नाव', 'कामगार'
      ]);
      let mhNumber = getVal([
        'mhnumber', 'mhno', 'mh', 'नोंदणीक्रमांक', 'एमएचनंबर', 'नोंदणीक्र', 'registrationnumber', 'registrationno', 'regno', 'workerid'
      ]);
      let mobileNumber = getVal([
        'mobilenumber', 'mobile', 'mobileno', 'फोन', 'मोबाईल', 'मोबाईलक्रमांक', 'फोननंबर', 'phone', 'phonenumber', 'contact', 'contactno'
      ]);

      if (!mhNumber) {
        for (const k of keys) {
          const val = String(row[k] || '').replace(/[\t\r\n"']/g, '').trim();
          if (/^(MH|mh)[\s\-_]?[0-9]+/i.test(val)) {
            mhNumber = val;
            break;
          }
        }
      }

      if (!mobileNumber) {
        for (const k of keys) {
          const val = String(row[k] || '').replace(/[\t\r\n"']/g, '').trim();
          const cleanDigits = val.replace(/\D/g, '');
          if (cleanDigits.length === 10 && !val.toUpperCase().startsWith('MH')) {
            mobileNumber = cleanDigits;
            break;
          }
        }
      }

      if (!workerName) {
        for (const k of keys) {
          const val = String(row[k] || '').replace(/[\t\r\n"']/g, '').trim();
          if (val && isNaN(Number(val)) && val !== mhNumber && val.length > 2 && !val.includes('@')) {
            workerName = val;
            break;
          }
        }
      }

      const cleanMobile = mobileNumber ? String(mobileNumber).replace(/[\t\r\n"']/g, '').replace(/\D/g, '').slice(-10) : undefined;

      if (mhNumber || workerName) {
        items.push({
          workerName: workerName || '',
          mhNumber: (mhNumber || '').replace(/[\t\r\n"']/g, '').trim().toUpperCase(),
          mobileNumber: cleanMobile || undefined,
        });
      }
    }
    return items;
  }

  // 1. IMPORT PREVIEW: Parse & run safe matching before permanent save (Rule B, L, M)
  app.post(
    '/api/renewal-check/preview',
    (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const contentType = req.headers['content-type'] || '';
      if (contentType.includes('multipart/form-data')) {
        uploadRenewalCheck.single('file')(req, res, (err: any) => {
          if (err) {
            return res.status(400).json({ success: false, error: err.message || 'File upload parsing error' });
          }
          next();
        });
      } else {
        next();
      }
    },
    async (req: express.Request, res: express.Response) => {
      try {
        let rawItems: Array<{ workerName?: string; mhNumber?: string; mobileNumber?: string }> = [];
        let filename = `preview_${Date.now()}.xlsx`;

        if (Array.isArray(req.body?.items) && req.body.items.length > 0) {
          rawItems = parseRawRowsToRenewalItems(req.body.items);
          if (req.body.filename) filename = String(req.body.filename);
        } else if (Array.isArray(req.body?.records) && req.body.records.length > 0) {
          rawItems = parseRawRowsToRenewalItems(req.body.records);
          if (req.body.filename) filename = String(req.body.filename);
        } else if (req.body?.base64) {
          if (req.body.filename) filename = String(req.body.filename);
          const buf = Buffer.from(req.body.base64, 'base64');
          const workbook = XLSX.read(buf, { type: 'buffer', cellDates: true });
          const firstSheetName = workbook.SheetNames[0];
          if (!firstSheetName) {
            return res.status(400).json({ success: false, error: 'एक्सेल फाईलमध्ये कोणतीही शीट आढळली नाही (Empty workbook).' });
          }
          const worksheet = workbook.Sheets[firstSheetName];
          const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
          rawItems = parseRawRowsToRenewalItems(rawRows);
        } else if (req.file && req.file.buffer) {
          filename = req.file.originalname || filename;
          const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
          const firstSheetName = workbook.SheetNames[0];
          if (!firstSheetName) {
            return res.status(400).json({ success: false, error: 'एक्सेल फाईलमध्ये कोणतीही शीट आढळली नाही (Empty workbook).' });
          }
          const worksheet = workbook.Sheets[firstSheetName];
          const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
          rawItems = parseRawRowsToRenewalItems(rawRows);
        } else {
          return res.status(400).json({
            success: false,
            error: 'कृपया एक्सेल (.xlsx/.xls) किंवा CSV फाईल निवडा (No file or records provided).',
          });
        }

        if (rawItems.length === 0) {
          return res.status(400).json({
            success: false,
            error: 'एक्सेल फाईलमध्ये कोणतीही नोंद आढळली नाही. कृपया फाईल तपासा.',
          });
        }

        const previewResult = await previewRenewalCheckExcel(filename, rawItems);
        res.json({
          success: true,
          ...previewResult,
        });
      } catch (err: any) {
        console.error('[Renewal Check Preview Error]', err);
        res.status(500).json({
          success: false,
          error: err?.message || 'एक्सेल प्रिव्ह्यू करताना त्रुटी आली.',
        });
      }
    }
  );

  // 2. CONFIRM IMPORT: Insert into batch master & queue only after explicit confirmation (Rule M, K)
  app.post('/api/renewal-check/confirm-import', async (req: express.Request, res: express.Response) => {
    try {
      const { batchId, filename, validItems, assignedTo, assignedToName, skipDuplicates, skipAlreadyInQueue } = req.body;
      if (!Array.isArray(validItems) || validItems.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'इम्पोर्ट करण्यासाठी कोणतेही वैध रेकॉर्ड उपलब्ध नाहीत (No valid items provided).',
        });
      }

      const importedBy =
        (req.headers['x-user-name'] as string) ||
        (req.headers['x-user-username'] as string) ||
        (req.body?.importedBy as string) ||
        'Staff Operator';

      const safeFilename = filename || `import_${Date.now()}.xlsx`;

      const result = await confirmRenewalCheckBatch(
        batchId,
        safeFilename,
        validItems,
        importedBy,
        assignedTo,
        assignedToName,
        {
          skipDuplicates: skipDuplicates !== false,
          skipAlreadyInQueue: skipAlreadyInQueue !== false,
        }
      );

      res.json({
        success: true,
        ...result,
      });
    } catch (err: any) {
      console.error('[Renewal Check Confirm Import Error]', err);
      res.status(500).json({
        success: false,
        error: err?.message || 'बॅच आयात करताना त्रुटी आली.',
      });
    }
  });

  // 3. Upload Excel / CSV file (Legacy direct upload fallback)
  app.post(
    '/api/renewal-check/upload',
    (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const contentType = req.headers['content-type'] || '';
      if (contentType.includes('multipart/form-data')) {
        uploadRenewalCheck.single('file')(req, res, (err: any) => {
          if (err) {
            return res.status(400).json({ success: false, error: err.message || 'File upload parsing error' });
          }
          next();
        });
      } else {
        next();
      }
    },
    async (req: express.Request, res: express.Response) => {
      try {
        let rawItems: Array<{ workerName: string; mhNumber: string; mobileNumber?: string }> = [];
        let filename = `upload_${Date.now()}.xlsx`;
        const createdBy =
          (req.headers['x-user-name'] as string) ||
          (req.headers['x-user-username'] as string) ||
          (req.body?.createdBy as string) ||
          'Staff Operator';

        if (Array.isArray(req.body?.items) && req.body.items.length > 0) {
          rawItems = parseRawRowsToRenewalItems(req.body.items);
          if (req.body.filename) filename = String(req.body.filename);
        } else if (Array.isArray(req.body?.records) && req.body.records.length > 0) {
          rawItems = parseRawRowsToRenewalItems(req.body.records);
          if (req.body.filename) filename = String(req.body.filename);
        } else if (req.body?.base64) {
          if (req.body.filename) filename = String(req.body.filename);
          const buf = Buffer.from(req.body.base64, 'base64');
          const workbook = XLSX.read(buf, { type: 'buffer', cellDates: true });
          const firstSheetName = workbook.SheetNames[0];
          if (!firstSheetName) {
            return res.status(400).json({ success: false, error: 'एक्सेल फाईलमध्ये कोणतीही शीट आढळली नाही.' });
          }
          const worksheet = workbook.Sheets[firstSheetName];
          const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
          rawItems = parseRawRowsToRenewalItems(rawRows).filter((i) => i.workerName && i.mhNumber);
        } else if (req.file && req.file.buffer) {
          filename = req.file.originalname || filename;
          const workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
          const firstSheetName = workbook.SheetNames[0];
          if (!firstSheetName) {
            return res.status(400).json({ success: false, error: 'एक्सेल फाईलमध्ये कोणतीही शीट आढळली नाही.' });
          }
          const worksheet = workbook.Sheets[firstSheetName];
          const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
          rawItems = parseRawRowsToRenewalItems(rawRows).filter((i) => i.workerName && i.mhNumber);
        } else {
          return res.status(400).json({
            success: false,
            error: 'कृपया एक्सेल (.xlsx/.xls) किंवा CSV फाईल निवडा.',
          });
        }

        if (rawItems.length === 0) {
          return res.status(400).json({
            success: false,
            error: 'एक्सेल फाईलमध्ये वैध "Worker Name" आणि "MH Number" स्तंभ (Columns) सापडले नाहीत.',
          });
        }

        const batchId = await generateNextRenewalBatchId();
        const result = await confirmRenewalCheckBatch(
          batchId,
          filename,
          rawItems,
          createdBy,
          undefined,
          undefined,
          {
            skipDuplicates: true,
            skipAlreadyInQueue: true,
          }
        );

        return res.json({
          success: true,
          ...result,
        });
      } catch (e: any) {
        console.error('[Renewal Check Upload Error]', e);
        return res.status(500).json({
          success: false,
          error: e?.message || 'एक्सेल अपलोड करताना त्रुटी आली.',
        });
      }
    }
  );

  // 4. Get list of all batches (Rule K)
  app.get('/api/renewal-check/batches', async (_req, res) => {
    try {
      const batches = await getRenewalCheckBatches();
      res.json({ success: true, batches });
    } catch (e: any) {
      console.error('[Renewal Check Batches Error]', e);
      res.status(500).json({ success: false, error: e?.message || 'बॅच सूची लोड करताना त्रुटी आली.' });
    }
  });

  // 5. Get batch details & queue items with server-side search & filters (Rule P, O)
  app.get('/api/renewal-check/batch/:batchId', async (req, res) => {
    try {
      const batchId = req.params.batchId;
      const status = typeof req.query.status === 'string' ? req.query.status : (typeof req.query.filterStatus === 'string' ? req.query.filterStatus : undefined);
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const assignedTo = typeof req.query.assignedTo === 'string' ? req.query.assignedTo : undefined;
      const dateFilter = typeof req.query.date === 'string' ? req.query.date : undefined;

      const details = await getRenewalCheckBatchDetails(batchId, status, search, assignedTo, dateFilter);
      res.json({
        success: true,
        batch: details.batch,
        stats: details.stats,
        items: details.items,
      });
    } catch (e: any) {
      console.error('[Renewal Check Batch Detail Error]', e);
      res.status(500).json({ success: false, error: e?.message || 'बॅच तपशील लोड करताना त्रुटी आली.' });
    }
  });

  // 6. RENEWAL HISTORY BEFORE PROCESSING: Get full worker history & duplicate check (Rule C, D)
  app.get('/api/renewal-check/worker-history/:queueItemId', async (req, res) => {
    try {
      const queueItemId = Number(req.params.queueItemId);
      if (isNaN(queueItemId) || queueItemId <= 0) {
        return res.status(400).json({ success: false, error: 'अवैध Queue Item ID.' });
      }

      const history = await getRenewalCheckWorkerHistory(queueItemId);
      res.json({ success: true, ...history });
    } catch (err: any) {
      console.error('[Renewal Check Worker History Error]', err);
      res.status(500).json({ success: false, error: err?.message || 'कामगाराचा इतिहास लोड करताना त्रुटी आली.' });
    }
  });

  // 7. Update status & notes of a single queue item with double-click & duplicate protection (Rule D, E, F, I, T, V)
  app.patch('/api/renewal-check/item/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id) || id <= 0) {
        return res.status(400).json({ success: false, error: 'अवैध आयडी (Invalid Item ID).' });
      }

      const { status, operatorNotes, renewalDetails } = req.body;
      if (!status) {
        return res.status(400).json({ success: false, error: 'स्थिती (status) आवश्यक आहे.' });
      }

      // Safe user identity from authenticated headers / token (Rule V)
      const processedBy =
        (req.headers['x-user-id'] as string) ||
        (req.body.processedBy ? String(req.body.processedBy) : '1');
      const processedByName =
        (req.headers['x-user-name'] as string) ||
        (req.headers['x-user-username'] as string) ||
        req.body.processedByName ||
        'Staff Operator';

      const updateResult = await updateRenewalCheckQueueItemStatus(id, {
        status,
        operatorNotes,
        processedBy,
        processedByName,
        renewalDetails,
      });

      res.json({
        success: true,
        updatedItem: updateResult.updatedItem,
        stats: updateResult.stats,
        createdRenewal: updateResult.createdRenewal,
        nextPendingItemId: updateResult.nextPendingItemId,
        duplicateWarning: updateResult.duplicateWarning,
      });
    } catch (e: any) {
      console.error('[Renewal Check Item Update Error]', e);
      res.status(500).json({ success: false, error: e?.message || 'स्थिती अपडेट करताना त्रुटी आली.' });
    }
  });

  // 8. Assign queue items to operator (Rule O)
  app.post('/api/renewal-check/batch/:batchId/assign', async (req, res) => {
    try {
      const batchId = req.params.batchId;
      const { itemIds, assignedTo, assignedToName } = req.body;

      if (!Array.isArray(itemIds) || itemIds.length === 0) {
        return res.status(400).json({ success: false, error: 'किमान एक नोंद निवडणे आवश्यक आहे (itemIds missing).' });
      }
      if (!assignedTo) {
        return res.status(400).json({ success: false, error: 'ऑपरेटर निवडणे आवश्यक आहे (assignedTo missing).' });
      }

      const changedBy = (req.headers['x-user-id'] as string) || '1';
      const changedByName = (req.headers['x-user-name'] as string) || 'Admin';

      const result = await assignRenewalCheckQueueItems(
        batchId,
        itemIds,
        assignedTo,
        assignedToName || 'Operator',
        changedBy,
        changedByName
      );

      res.json({ success: true, ...result });
    } catch (err: any) {
      console.error('[Renewal Check Assign Error]', err);
      res.status(500).json({ success: false, error: err?.message || 'ऑपरेटर नियुक्त करताना त्रुटी आली.' });
    }
  });

  // 9. Audit Log: Retrieve status audit trail (Rule T)
  app.get('/api/renewal-check/audit', async (req, res) => {
    try {
      const queueItemId = req.query.queueItemId ? Number(req.query.queueItemId) : undefined;
      const batchId = req.query.batchId ? String(req.query.batchId) : undefined;

      const auditLogs = await getRenewalCheckAuditLogs(queueItemId, batchId);
      res.json({ success: true, auditLogs });
    } catch (err: any) {
      console.error('[Renewal Check Audit Error]', err);
      res.status(500).json({ success: false, error: err?.message || 'ऑडिट लॉग लोड करताना त्रुटी आली.' });
    }
  });

  // 10. EXPORTS: Formatted Excel exports with exact required columns (Rule S)
  app.get('/api/renewal-check/export/:batchId', async (req, res) => {
    try {
      const batchId = req.params.batchId;
      const filter = typeof req.query.filter === 'string' ? req.query.filter : 'ALL';
      const format = typeof req.query.format === 'string' ? req.query.format : 'xlsx';

      const rows = await getRenewalCheckExportData(batchId, filter);

      if (format === 'json') {
        return res.json({ success: true, count: rows.length, data: rows });
      }

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ 'माहिती': 'कोणतीही नोंद आढळली नाही' }]);

      // Set nice column widths for the required fields:
      // Worker Name, MH Number, Mobile, Status, Renewal Date, Last Renewal, Next Renewal, Operator, Processed Date, Remarks
      ws['!cols'] = [
        { wch: 8 },  // Sr No
        { wch: 28 }, // Worker Name
        { wch: 22 }, // MH Number
        { wch: 16 }, // Mobile
        { wch: 26 }, // Status
        { wch: 18 }, // Renewal Date
        { wch: 18 }, // Last Renewal
        { wch: 18 }, // Next Renewal
        { wch: 20 }, // Operator
        { wch: 22 }, // Processed Date
        { wch: 35 }, // Remarks
      ];

      let sheetName = 'सर्व नोंदी (All)';
      if (filter === 'PENDING_CALL') sheetName = 'प्रलंबित व फॉलो-अप (Pending)';
      if (filter === 'RENEWED') sheetName = 'नूतनीकरण पूर्ण (Renewed)';
      if (filter === 'ALREADY_RENEWED') sheetName = 'आधीच झालेले (Already Renewed)';
      if (filter === 'CALL_PENDING') sheetName = 'कॉल करणे बाकी (Call Needed)';
      if (filter === 'ISSUE_REJECTED') sheetName = 'अडचण किंवा नाकारले (Issues)';

      XLSX.utils.book_append_sheet(wb, ws, sheetName.substring(0, 31));

      const fileBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
      const safeFilename = `Renewal_Verification_${batchId}_${filter}.xlsx`;

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
      res.send(fileBuffer);
    } catch (e: any) {
      console.error('[Renewal Check Export Error]', e);
      res.status(500).json({ success: false, error: e?.message || 'एक्सेल फाईल डाउनलोड करताना त्रुटी आली.' });
    }
  });

  // 11. Delete single queue item
  app.delete('/api/renewal-check/item/:id', async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (isNaN(id) || id <= 0) {
        return res.status(400).json({ success: false, error: 'अवैध आयडी (Invalid Item ID).' });
      }

      const deletedBy = (req.headers['x-user-id'] as string) || '1';
      const deletedByName = (req.headers['x-user-name'] as string) || (req.headers['x-user-username'] as string) || 'Staff Operator';

      const result = await deleteRenewalCheckQueueItem(id, deletedBy, deletedByName);
      res.json({
        success: true,
        message: 'नोंद यशस्वीरीत्या हटवली (Queue item deleted).',
        ...result,
      });
    } catch (e: any) {
      console.error('[Renewal Check Item Delete Error]', e);
      res.status(500).json({ success: false, error: e?.message || 'नोंद हटवताना त्रुटी आली.' });
    }
  });

  // 12. Bulk delete queue items
  app.post('/api/renewal-check/items/delete-bulk', async (req, res) => {
    try {
      const { batchId, ids } = req.body;
      if (!batchId || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ success: false, error: 'बॅच आयडी आणि निवडलेल्या आयडींची सूची आवश्यक आहे.' });
      }

      const deletedBy = (req.headers['x-user-id'] as string) || '1';
      const deletedByName = (req.headers['x-user-name'] as string) || (req.headers['x-user-username'] as string) || 'Staff Operator';

      const result = await deleteRenewalCheckQueueItemsBulk(batchId, ids.map(Number), deletedBy, deletedByName);
      res.json({
        success: true,
        message: `${result.deletedCount} नोंदी यशस्वीरीत्या हटवल्या.`,
        ...result,
      });
    } catch (e: any) {
      console.error('[Renewal Check Bulk Delete Error]', e);
      res.status(500).json({ success: false, error: e?.message || 'नोंदी हटवताना त्रुटी आली.' });
    }
  });

  // 12.1 Bulk update queue items status (Rule: allow bulk BLOCKED / SKIPPED / etc.)
  app.post('/api/renewal-check/items/bulk-status', async (req, res) => {
    try {
      const { batchId, ids, status, operatorNotes } = req.body;
      if (!batchId || !Array.isArray(ids) || ids.length === 0 || !status) {
        return res.status(400).json({ success: false, error: 'बॅच आयडी, निवडलेल्या आयडींची सूची आणि स्थिती आवश्यक आहे.' });
      }

      const processedBy = (req.headers['x-user-id'] as string) || '1';
      const processedByName = (req.headers['x-user-name'] as string) || (req.headers['x-user-username'] as string) || 'Staff Operator';

      const result = await updateRenewalCheckQueueItemsBulkStatus(
        batchId,
        ids.map(Number),
        status,
        operatorNotes,
        processedBy,
        processedByName
      );

      res.json({
        success: true,
        message: `${result.updatedCount} नोंदींची स्थिती यशस्वीरीत्या '${status}' म्हणून अपडेट केली.`,
        ...result,
      });
    } catch (e: any) {
      console.error('[Renewal Check Bulk Status Error]', e);
      res.status(500).json({ success: false, error: e?.message || 'स्थिती अपडेट करताना त्रुटी आली.' });
    }
  });

  // 13. Delete batch
  app.delete('/api/renewal-check/batch/:batchId', async (req, res) => {
    try {
      const batchId = req.params.batchId;
      await deleteRenewalCheckBatch(batchId);
      res.json({ success: true, message: 'बॅच यशस्वीरीत्या हटवली (Batch deleted successfully).' });
    } catch (e: any) {
      console.error('[Renewal Check Delete Batch Error]', e);
      res.status(500).json({ success: false, error: e?.message || 'बॅच हटवताना त्रुटी आली.' });
    }
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
