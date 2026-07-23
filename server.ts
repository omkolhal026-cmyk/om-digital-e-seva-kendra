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
  deleteMySQLRegistration,
  clearMySQLRegistrations,
  getMySQLRenewals,
  createMySQLRenewal,
  deleteMySQLRenewal,
  clearMySQLRenewals,
  getMySQLClaims,
  createMySQLClaim,
  deleteMySQLClaim,
  clearMySQLClaims,
  addMySQLLog,
  getMySQLLogs,
  clearMySQLLogs,
  getMySQLSettings,
  updateMySQLSettings,
  getMySQLReports,
  createMySQLReport,
  hashPassword,
} from './src/db/mysql.js';
import { SCHEMES_LIST } from './src/data/mockData.js';
import {
  WorkerRegistration,
  WorkerRenewal,
  WorkerClaim,
  ActivityLog,
  User,
  OfficeSettings,
} from './src/types.js';

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
  await initMySQL();

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
  });

  // Auth Endpoints
  app.post('/api/auth/login', async (req, res) => {
    const { usernameOrMobile, password } = req.body;
    if (!usernameOrMobile || !password) {
      return res.status(400).json({ error: 'Username/Mobile and password are required' });
    }

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

    return res.status(401).json({ error: 'Invalid credentials or user account disabled.' });
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
    try {
      const mysqlRegs = await getMySQLRegistrations();
      res.json(mysqlRegs);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error fetching registrations' });
    }
  });

  app.post('/api/registrations', async (req, res) => {
    try {
      const currentSettings = await getMySQLSettings();
      const newReg: WorkerRegistration = {
        ...req.body,
        id: `REG-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
        registrationDate: req.body.registrationDate || new Date().toISOString().split('T')[0],
        status: req.body.status || 'Active',
        feePaid: req.body.feePaid || currentSettings?.registrationFee || 100,
      };

      if (!newReg.mhNumber) {
        newReg.mhNumber = `MH-12-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;
      }

      const googleAccessToken = (req.headers['x-google-access-token'] as string) || req.body.googleAccessToken;
      if (googleAccessToken) {
        savedGoogleAccessToken = googleAccessToken;
      }

      await createMySQLRegistration(newReg);
      appendRegistrationToSheet(newReg, googleAccessToken);
      addLog(
        req.body.operatorName || 'System',
        'operator',
        'REGISTRATION_CREATE',
        `Registered worker ${newReg.workerName} (${newReg.mhNumber}) in Taluka ${newReg.taluka}.`
      );

      res.status(201).json(newReg);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error creating registration' });
    }
  });

  app.put('/api/registrations/:id', async (req, res) => {
    try {
      const { id } = req.params;
      await updateMySQLRegistration(id, req.body);
      addLog(
        req.body.operatorName || 'Admin',
        'admin',
        'REGISTRATION_EDIT',
        `Updated registration record ${id}.`
      );
      res.json({ success: true, id, ...req.body });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error updating registration' });
    }
  });

  app.delete('/api/registrations/:id', async (req, res) => {
    try {
      const { id } = req.params;
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
  app.get('/api/renewals', async (_req, res) => {
    try {
      const mysqlRenewals = await getMySQLRenewals();
      res.json(mysqlRenewals);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error fetching renewals' });
    }
  });

  app.post('/api/renewals', async (req, res) => {
    try {
      const currentSettings = await getMySQLSettings();
      const newRenewal: WorkerRenewal = {
        ...req.body,
        id: `REN-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
        renewalDate: req.body.renewalDate || new Date().toISOString().split('T')[0],
        status: req.body.status || 'Completed',
        feeAmount: req.body.feeAmount || currentSettings?.renewalFee || 50,
      };

      const googleAccessToken = (req.headers['x-google-access-token'] as string) || req.body.googleAccessToken;
      if (googleAccessToken) {
        savedGoogleAccessToken = googleAccessToken;
      }

      await createMySQLRenewal(newRenewal);
      appendRenewalToSheet(newRenewal, googleAccessToken);
      addLog(
        newRenewal.operatorName || 'System',
        'operator',
        'RENEWAL_CREATE',
        `Processed renewal ${newRenewal.id} for MH No: ${newRenewal.mhNumber} (${newRenewal.workerName}).`
      );

      res.status(201).json(newRenewal);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error creating renewal' });
    }
  });

  app.delete('/api/renewals/:id', async (req, res) => {
    try {
      const { id } = req.params;
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
  app.get('/api/claims', async (_req, res) => {
    try {
      const mysqlClaims = await getMySQLClaims();
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
      const currentSettings = await getMySQLSettings();
      const newClaim: WorkerClaim = {
        ...req.body,
        id: `CLM-${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`,
        claimDate: req.body.claimDate || new Date().toISOString().split('T')[0],
        status: req.body.status || (currentSettings?.autoApproveClaims ? 'Approved' : 'Submitted'),
      };

      await createMySQLClaim(newClaim);
      addLog(
        newClaim.operatorName || 'System',
        'operator',
        'CLAIM_SUBMIT',
        `Submitted claim ${newClaim.id} for ${newClaim.workerName} (Amount: ₹${newClaim.totalAmount}).`
      );

      res.status(201).json(newClaim);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error creating claim' });
    }
  });

  app.delete('/api/claims/:id', async (req, res) => {
    try {
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

  // User Management API
  app.get('/api/users', async (_req, res) => {
    try {
      const mysqlUsers = await getMySQLUsers();
      res.json(mysqlUsers);
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error fetching users' });
    }
  });

  app.post('/api/users', async (req, res) => {
    try {
      const newUser: User = {
        ...req.body,
        id: `usr-op-${Date.now()}`,
        status: 'active',
        createdAt: new Date().toISOString(),
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
      await updateMySQLUser(id, req.body);
      addLog('admin', 'admin', 'USER_EDIT', `Updated user profile for ID ${id}.`);
      res.json({ success: true, id, ...req.body });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error updating user' });
    }
  });

  app.post('/api/users/:id/reset-password', async (req, res) => {
    try {
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
      const { id } = req.params;
      await deleteMySQLUser(id);
      addLog('admin', 'admin', 'USER_DELETE', `Deleted user account ID ${id}.`);
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error deleting user' });
    }
  });

  // Settings API
  app.get('/api/settings', async (_req, res) => {
    try {
      const settings = await getMySQLSettings();
      res.json(settings || {
        officeName: 'OM DIGITAL E-SEVA KENDRA',
        officeLogo: '/src/assets/images/om_digital_logo_1784806111546.jpg',
        officeAddress: 'Shop No. 12, Main Market Yard, Wagholi, Pune',
        districtName: 'Pune',
        contactNumbers: '+91 98765 43210',
        email: 'support@omdigitaleseva.com',
        registrationFee: 100,
        renewalFee: 50,
        autoApproveClaims: false,
        themeMode: 'blue-gradient',
      });
    } catch (e: any) {
      res.status(500).json({ error: e?.message || 'Error fetching settings' });
    }
  });

  app.put('/api/settings', async (req, res) => {
    try {
      await updateMySQLSettings(req.body);
      addLog('admin', 'admin', 'SETTINGS_UPDATE', 'Updated Office Settings parameters.');
      res.json(req.body);
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

  // Google Tokens & Sheets Sync
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
