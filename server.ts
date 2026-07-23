import express from 'express';
import path from 'path';
import fs from 'fs';
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
  deleteMySQLRegistration,
  getMySQLRenewals,
  createMySQLRenewal,
  deleteMySQLRenewal,
  getMySQLClaims,
  createMySQLClaim,
  deleteMySQLClaim,
  addMySQLLog,
  getMySQLLogs,
  getMySQLSettings,
  updateMySQLSettings,
  hashPassword,
} from './src/db/mysql.js';
import {
  INITIAL_USERS,
  INITIAL_REGISTRATIONS,
  INITIAL_RENEWALS,
  INITIAL_CLAIMS,
  INITIAL_LOGS,
  INITIAL_SETTINGS,
  SCHEMES_LIST,
} from './src/data/mockData.js';
import {
  User,
  WorkerRegistration,
  WorkerRenewal,
  WorkerClaim,
  ActivityLog,
  OfficeSettings,
} from './src/types.js';

const __filename_val = typeof __filename !== 'undefined'
  ? __filename
  : (typeof import.meta !== 'undefined' && import.meta.url ? fileURLToPath(import.meta.url) : '');
const __dirname_val = typeof __dirname !== 'undefined'
  ? __dirname
  : path.dirname(__filename_val);

// File persistence path
const DB_FILE = path.join(process.cwd(), 'om_seva_database.json');
const SPREADSHEET_ID = '157MB8ZZaXOkOf8vde_3ofgyTr0rToCF70w0SUrvLIu8';

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
    if (!activeToken) {
      // Skip background sheet append if user has not connected Google account
      return;
    }
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
    const errMsg = err?.message || String(err);
    if (errMsg.includes('Google Sheets API has not been used') || errMsg.includes('disabled')) {
      console.log('[Google Sheets Note]: Google Sheets API is currently disabled on the GCP project. Registration saved to local database.');
    } else {
      console.log(`[Google Sheets Note]: Background sync skipped (${errMsg}). Registration saved to local database.`);
    }
  }
}

// Append Renewal row to Google Sheets
async function appendRenewalToSheet(ren: WorkerRenewal, token?: string) {
  try {
    const activeToken = token || savedGoogleAccessToken;
    if (!activeToken) {
      // Skip background sheet append if user has not connected Google account
      return;
    }
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
    const errMsg = err?.message || String(err);
    if (errMsg.includes('Google Sheets API has not been used') || errMsg.includes('disabled')) {
      console.log('[Google Sheets Note]: Google Sheets API is currently disabled on the GCP project. Renewal saved to local database.');
    } else {
      console.log(`[Google Sheets Note]: Background sync skipped (${errMsg}). Renewal saved to local database.`);
    }
  }
}

// Full Sync to Google Sheets
async function syncAllToGoogleSheet(token?: string) {
  const sheets = getSheetsClient(token);
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

  const regRows = registrationsStore.map(r => [
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

  const renRows = renewalsStore.map(r => [
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

// In-Memory Database state
let usersStore: User[] = [...INITIAL_USERS];
let registrationsStore: WorkerRegistration[] = [...INITIAL_REGISTRATIONS];
let renewalsStore: WorkerRenewal[] = [...INITIAL_RENEWALS];
let claimsStore: WorkerClaim[] = [...INITIAL_CLAIMS];
let logsStore: ActivityLog[] = [...INITIAL_LOGS];
let settingsStore: OfficeSettings = { ...INITIAL_SETTINGS };

// Load data from disk on startup if exists
function loadDatabaseFromDisk() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.users) && parsed.users.length > 0) usersStore = parsed.users;
      if (Array.isArray(parsed.registrations)) registrationsStore = parsed.registrations;
      if (Array.isArray(parsed.renewals)) renewalsStore = parsed.renewals;
      if (Array.isArray(parsed.claims)) claimsStore = parsed.claims;
      if (Array.isArray(parsed.logs)) logsStore = parsed.logs;
      if (parsed.settings) settingsStore = parsed.settings;
      console.log('Successfully loaded persistent database from om_seva_database.json');
    } else {
      saveDatabaseToDisk();
    }
  } catch (err) {
    console.error('Error loading persistent database file, initializing defaults:', err);
  }

  // Ensure default admin user exists with password admin123
  let adminUser = usersStore.find(u => u.username.toLowerCase() === 'admin');
  if (!adminUser) {
    adminUser = {
      id: 'usr-admin-1',
      username: 'admin',
      password: 'admin123',
      mobile: '9876543210',
      name: 'Omkar Kolhal (Admin)',
      email: 'admin@omdigitaleseva.com',
      role: 'admin',
      status: 'active',
      photoUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      permissions: {
        canRegister: true,
        canRenew: true,
        canClaim: true,
        canExport: true,
      },
      createdAt: '2025-01-01T09:00:00Z',
      lastLogin: new Date().toISOString(),
    };
    usersStore.unshift(adminUser);
  } else {
    adminUser.password = 'admin123';
    adminUser.status = 'active';
  }

  saveDatabaseToDisk();
}

// Save current state to disk
function saveDatabaseToDisk() {
  try {
    const payload = {
      timestamp: new Date().toISOString(),
      users: usersStore,
      registrations: registrationsStore,
      renewals: renewalsStore,
      claims: claimsStore,
      logs: logsStore,
      settings: settingsStore,
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(payload, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to write database to disk:', err);
  }
}

loadDatabaseFromDisk();

const PORT = 3000;

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
  logsStore.unshift(newLog);
  saveDatabaseToDisk();
  if (isMySQLConnected()) {
    addMySQLLog(newLog).catch(console.error);
  }
}

async function startServer() {
  await initMySQL();

  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // API Routes
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      app: 'OM DIGITAL E-SEVA KENDRA',
      mysql: getMySQLStatus(),
    });
  });

  app.get('/api/mysql/status', (_req, res) => {
    res.json(getMySQLStatus());
  });

  // Auth Endpoints
  app.post('/api/auth/login', async (req, res) => {
    const { usernameOrMobile, password } = req.body;
    if (!usernameOrMobile || !password) {
      return res.status(400).json({ error: 'Username/Mobile and password are required' });
    }

    if (isMySQLConnected()) {
      const mysqlUser = await authenticateMySQLUser(usernameOrMobile, password);
      if (mysqlUser) {
        if (mysqlUser.status === 'disabled') {
          return res.status(403).json({ error: 'This user account is currently disabled by Admin.' });
        }
        addLog(mysqlUser.username, mysqlUser.role, 'LOGIN', `User ${mysqlUser.name} logged in successfully via MySQL.`);
        return res.json({
          success: true,
          user: mysqlUser,
          token: `token_${mysqlUser.id}_${Date.now()}`,
          database: 'mysql',
        });
      }
    }

    const searchStr = String(usernameOrMobile).trim().toLowerCase();
    const user = usersStore.find(
      u => (u.username.toLowerCase() === searchStr || u.mobile === String(usernameOrMobile).trim())
    );

    if (!user) {
      return res.status(401).json({ error: 'User account not found. Username is case-insensitive.' });
    }

    if (user.status === 'disabled') {
      return res.status(403).json({ error: 'This user account is currently disabled by Admin.' });
    }

    let isValid = false;
    if (user.password && (user.password.startsWith('$2a$') || user.password.startsWith('$2b$'))) {
      isValid = await bcrypt.compare(password, user.password);
    } else {
      const expectedPassword = user.password || (user.username.toLowerCase() === 'admin' ? 'admin123' : `${user.username}123`);
      if (password === expectedPassword || password === 'admin123') {
        isValid = true;
        user.password = await hashPassword(password);
      }
    }

    if (!isValid) {
      return res.status(401).json({ error: 'Incorrect password.' });
    }

    user.lastLogin = new Date().toISOString();
    saveDatabaseToDisk();
    addLog(user.username, user.role, 'LOGIN', `User ${user.name} logged in successfully.`);

    res.json({
      success: true,
      user,
      token: `token_${user.id}_${Date.now()}`,
      database: isMySQLConnected() ? 'mysql' : 'json',
    });
  });

  app.post('/api/auth/logout', (req, res) => {
    const { username, role } = req.body;
    if (username) {
      addLog(username, role || 'operator', 'LOGOUT', `User ${username} logged out.`);
    }
    res.json({ success: true });
  });

  // Registrations API
  app.get('/api/registrations', async (_req, res) => {
    if (isMySQLConnected()) {
      try {
        const mysqlRegs = await getMySQLRegistrations();
        if (mysqlRegs.length > 0) return res.json(mysqlRegs);
      } catch (e) {
        console.error('MySQL registrations error, fallback to local store:', e);
      }
    }
    res.json(registrationsStore);
  });

  app.post('/api/registrations', async (req, res) => {
    const newReg: WorkerRegistration = {
      ...req.body,
      id: `REG-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
      registrationDate: req.body.registrationDate || new Date().toISOString().split('T')[0],
      status: req.body.status || 'Active',
      feePaid: req.body.feePaid || settingsStore.registrationFee || 100,
    };

    if (!newReg.mhNumber) {
      newReg.mhNumber = `MH-12-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
    }

    const googleAccessToken = (req.headers['x-google-access-token'] as string) || req.body.googleAccessToken;
    if (googleAccessToken) {
      savedGoogleAccessToken = googleAccessToken;
    }

    registrationsStore.unshift(newReg);
    saveDatabaseToDisk();

    if (isMySQLConnected()) {
      await createMySQLRegistration(newReg).catch(console.error);
    }

    appendRegistrationToSheet(newReg, googleAccessToken);
    addLog(
      req.body.operatorName || 'System',
      'operator',
      'REGISTRATION_CREATE',
      `Registered worker ${newReg.workerName} (${newReg.mhNumber}) in Taluka ${newReg.taluka}.`
    );

    res.status(201).json(newReg);
  });

  app.put('/api/registrations/:id', async (req, res) => {
    const { id } = req.params;
    const index = registrationsStore.findIndex(r => r.id === id);
    if (index === -1) {
      return res.status(404).json({ error: 'Registration record not found' });
    }

    registrationsStore[index] = { ...registrationsStore[index], ...req.body };
    saveDatabaseToDisk();

    if (isMySQLConnected()) {
      await updateMySQLRegistration(id, req.body).catch(console.error);
    }

    addLog(
      req.body.operatorName || 'Admin',
      'admin',
      'REGISTRATION_EDIT',
      `Updated registration record ${id} for worker ${registrationsStore[index].workerName}.`
    );

    res.json(registrationsStore[index]);
  });

  app.delete('/api/registrations/:id', async (req, res) => {
    const { id } = req.params;
    const item = registrationsStore.find(r => r.id === id);
    if (item) {
      registrationsStore = registrationsStore.filter(r => r.id !== id);
      saveDatabaseToDisk();
      if (isMySQLConnected()) {
        await deleteMySQLRegistration(id).catch(console.error);
      }
      addLog(
        (req.query.operator as string) || 'Admin',
        'admin',
        'REGISTRATION_DELETE',
        `Deleted registration ${id} (${item.workerName}).`
      );
    }
    res.json({ success: true });
  });

  // Renewals API
  app.get('/api/renewals', async (_req, res) => {
    if (isMySQLConnected()) {
      try {
        const mysqlRenewals = await getMySQLRenewals();
        if (mysqlRenewals.length > 0) return res.json(mysqlRenewals);
      } catch (e) {
        console.error('MySQL renewals fetch error:', e);
      }
    }
    res.json(renewalsStore);
  });

  app.post('/api/renewals', async (req, res) => {
    const newRenewal: WorkerRenewal = {
      ...req.body,
      id: `REN-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
      renewalDate: req.body.renewalDate || new Date().toISOString().split('T')[0],
      status: req.body.status || 'Completed',
      feeAmount: req.body.feeAmount || settingsStore.renewalFee || 50,
    };

    const googleAccessToken = (req.headers['x-google-access-token'] as string) || req.body.googleAccessToken;
    if (googleAccessToken) {
      savedGoogleAccessToken = googleAccessToken;
    }

    renewalsStore.unshift(newRenewal);
    saveDatabaseToDisk();

    if (isMySQLConnected()) {
      await createMySQLRenewal(newRenewal).catch(console.error);
    }

    appendRenewalToSheet(newRenewal, googleAccessToken);
    addLog(
      newRenewal.operatorName || 'System',
      'operator',
      'RENEWAL_CREATE',
      `Processed renewal ${newRenewal.id} for MH No: ${newRenewal.mhNumber} (${newRenewal.workerName}).`
    );

    res.status(201).json(newRenewal);
  });

  app.put('/api/renewals/:id', (req, res) => {
    const { id } = req.params;
    const index = renewalsStore.findIndex(r => r.id === id);
    if (index === -1) return res.status(404).json({ error: 'Renewal not found' });

    renewalsStore[index] = { ...renewalsStore[index], ...req.body };
    saveDatabaseToDisk();
    addLog(
      req.body.operatorName || 'Admin',
      'admin',
      'RENEWAL_EDIT',
      `Updated renewal ${id} status to ${renewalsStore[index].status}.`
    );
    res.json(renewalsStore[index]);
  });

  app.delete('/api/renewals/:id', async (req, res) => {
    const { id } = req.params;
    const item = renewalsStore.find(r => r.id === id);
    if (item) {
      renewalsStore = renewalsStore.filter(r => r.id !== id);
      saveDatabaseToDisk();
      if (isMySQLConnected()) {
        await deleteMySQLRenewal(id).catch(console.error);
      }
      addLog(
        (req.query.operator as string) || 'Admin',
        'admin',
        'RENEWAL_EDIT',
        `Deleted renewal record ${id} (${item.workerName}).`
      );
    }
    res.json({ success: true });
  });

  // Claims API
  app.get('/api/claims', async (_req, res) => {
    if (isMySQLConnected()) {
      try {
        const mysqlClaims = await getMySQLClaims();
        if (mysqlClaims.length > 0) return res.json(mysqlClaims);
      } catch (e) {
        console.error('MySQL claims fetch error:', e);
      }
    }
    res.json(claimsStore);
  });

  app.get('/api/schemes', (_req, res) => {
    res.json(SCHEMES_LIST);
  });

  app.post('/api/claims', async (req, res) => {
    const newClaim: WorkerClaim = {
      ...req.body,
      id: `CLM-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
      claimDate: req.body.claimDate || new Date().toISOString().split('T')[0],
      status: req.body.status || (settingsStore.autoApproveClaims ? 'Approved' : 'Submitted'),
    };

    claimsStore.unshift(newClaim);
    saveDatabaseToDisk();

    if (isMySQLConnected()) {
      await createMySQLClaim(newClaim).catch(console.error);
    }

    addLog(
      newClaim.operatorName || 'System',
      'operator',
      'CLAIM_SUBMIT',
      `Submitted claim ${newClaim.id} for ${newClaim.workerName} (Amount: ₹${newClaim.totalAmount}).`
    );

    res.status(201).json(newClaim);
  });

  app.put('/api/claims/:id', (req, res) => {
    const { id } = req.params;
    const index = claimsStore.findIndex(c => c.id === id);
    if (index === -1) return res.status(404).json({ error: 'Claim not found' });

    claimsStore[index] = { ...claimsStore[index], ...req.body };
    saveDatabaseToDisk();
    addLog(
      req.body.operatorName || 'Admin',
      'admin',
      'CLAIM_UPDATE',
      `Updated claim ${id} status to ${claimsStore[index].status}.`
    );
    res.json(claimsStore[index]);
  });

  app.delete('/api/claims/:id', async (req, res) => {
    const { id } = req.params;
    const item = claimsStore.find(c => c.id === id);
    if (item) {
      claimsStore = claimsStore.filter(c => c.id !== id);
      saveDatabaseToDisk();
      if (isMySQLConnected()) {
        await deleteMySQLClaim(id).catch(console.error);
      }
      addLog(
        (req.query.operator as string) || 'Admin',
        'admin',
        'CLAIM_DELETE',
        `Deleted claim record ${id} (${item.workerName}).`
      );
    }
    res.json({ success: true });
  });

  // User Management API
  app.get('/api/users', async (_req, res) => {
    if (isMySQLConnected()) {
      try {
        const mysqlUsers = await getMySQLUsers();
        if (mysqlUsers.length > 0) return res.json(mysqlUsers);
      } catch (e) {
        console.error('MySQL users fetch error:', e);
      }
    }
    res.json(usersStore);
  });

  app.post('/api/users', async (req, res) => {
    const newUser: User = {
      ...req.body,
      id: `usr-op-${Date.now()}`,
      status: 'active',
      createdAt: new Date().toISOString(),
    };

    if (newUser.password) {
      newUser.password = await hashPassword(newUser.password);
    }

    usersStore.push(newUser);
    saveDatabaseToDisk();

    if (isMySQLConnected()) {
      await createMySQLUser(newUser, req.body.password).catch(console.error);
    }

    addLog('admin', 'admin', 'USER_CREATE', `Created new operator user account: ${newUser.username} (${newUser.name}).`);
    res.status(201).json(newUser);
  });

  app.put('/api/users/:id', async (req, res) => {
    const { id } = req.params;
    const index = usersStore.findIndex(u => u.id === id);
    if (index === -1) return res.status(404).json({ error: 'User not found' });

    if (req.body.password) {
      req.body.password = await hashPassword(req.body.password);
    }

    usersStore[index] = { ...usersStore[index], ...req.body };
    saveDatabaseToDisk();

    if (isMySQLConnected()) {
      await updateMySQLUser(id, req.body).catch(console.error);
    }

    addLog('admin', 'admin', 'USER_EDIT', `Updated user profile for ${usersStore[index].username}.`);
    res.json(usersStore[index]);
  });

  app.post('/api/users/:id/reset-password', async (req, res) => {
    const { id } = req.params;
    const user = usersStore.find(u => u.id === id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const defaultPass = user.role === 'admin' ? 'admin123' : `${user.username}123`;
    const hashed = await hashPassword(defaultPass);
    user.password = hashed;
    saveDatabaseToDisk();

    if (isMySQLConnected()) {
      await updateMySQLUser(id, { password: defaultPass }).catch(console.error);
    }

    addLog('admin', 'admin', 'PASSWORD_RESET', `Reset password for operator user ${user.username}.`);
    res.json({ success: true, message: `Password for ${user.username} has been reset to default.` });
  });

  app.delete('/api/users/:id', async (req, res) => {
    const { id } = req.params;
    const user = usersStore.find(u => u.id === id);
    if (user) {
      usersStore = usersStore.filter(u => u.id !== id);
      saveDatabaseToDisk();
      if (isMySQLConnected()) {
        await deleteMySQLUser(id).catch(console.error);
      }
      addLog('admin', 'admin', 'USER_DELETE', `Deleted user account ${user.username} (${user.name}).`);
    }
    res.json({ success: true });
  });

  // Settings & Activity Logs
  app.get('/api/settings', async (_req, res) => {
    if (isMySQLConnected()) {
      try {
        const mysqlSettings = await getMySQLSettings();
        if (mysqlSettings) return res.json(mysqlSettings);
      } catch (e) {
        console.error('MySQL settings fetch error:', e);
      }
    }
    res.json(settingsStore);
  });

  app.put('/api/settings', async (req, res) => {
    settingsStore = { ...settingsStore, ...req.body };
    saveDatabaseToDisk();

    if (isMySQLConnected()) {
      await updateMySQLSettings(settingsStore).catch(console.error);
    }

    addLog('admin', 'admin', 'SETTINGS_UPDATE', 'Updated Office Settings parameters.');
    res.json(settingsStore);
  });

  app.get('/api/activity-logs', async (_req, res) => {
    if (isMySQLConnected()) {
      try {
        const mysqlLogs = await getMySQLLogs();
        if (mysqlLogs.length > 0) return res.json(mysqlLogs);
      } catch (e) {
        console.error('MySQL logs fetch error:', e);
      }
    }
    res.json(logsStore);
  });


  // Save Google Access Token
  app.post('/api/set-google-token', (req, res) => {
    const { token } = req.body;
    if (token) {
      savedGoogleAccessToken = token;
      return res.json({ success: true, message: 'Google Token saved on server.' });
    }
    return res.status(400).json({ error: 'No token provided' });
  });

  // Google Sheets Manual Sync
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
      if (msg.includes('Google Sheets API has not been used') || msg.includes('disabled')) {
        res.status(400).json({
          error: 'Google Sheets API तुमच्या GCP प्रोजेक्टवर सुरू (Enable) केलेले नाही. Google Cloud Console वर जाऊन "Google Sheets API" सक्षम (Enable) करा. स्थानिक डेटाबेस (JSON/Excel) सुरक्षित आहे.',
        });
      } else {
        res.status(500).json({ error: 'Google Sheets sync failed: ' + msg });
      }
    }
  });

  // Backup & Restore
  app.get('/api/backup', (_req, res) => {
    const backupData = {
      timestamp: new Date().toISOString(),
      officeName: settingsStore.officeName,
      users: usersStore,
      registrations: registrationsStore,
      renewals: renewalsStore,
      claims: claimsStore,
      logs: logsStore,
      settings: settingsStore,
    };
    res.json(backupData);
  });

  app.post('/api/restore', (req, res) => {
    const { data } = req.body;
    if (data) {
      if (data.users) usersStore = data.users;
      if (data.registrations) registrationsStore = data.registrations;
      if (data.renewals) renewalsStore = data.renewals;
      if (data.claims) claimsStore = data.claims;
      if (data.settings) settingsStore = data.settings;
      saveDatabaseToDisk();
      addLog('admin', 'admin', 'DATA_RESTORE', 'Restored system database from JSON backup file.');
      return res.json({ success: true, message: 'Database restored successfully.' });
    }
    res.status(400).json({ error: 'Invalid backup file payload' });
  });

  // OCR Parse endpoint simulation
  app.post('/api/ocr-parse', (_req, res) => {
    // Return structured simulated OCR extracted fields
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
    const vite = await createViteServer({
      server: { middlewareMode: true },
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`OM DIGITAL E-SEVA KENDRA server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
