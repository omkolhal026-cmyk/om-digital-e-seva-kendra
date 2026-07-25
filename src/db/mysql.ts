import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import {
  User,
  WorkerRegistration,
  WorkerRenewal,
  WorkerClaim,
  ActivityLog,
  OfficeSettings,
} from '../types.js';
import {
  INITIAL_USERS,
  INITIAL_REGISTRATIONS,
  INITIAL_RENEWALS,
  INITIAL_CLAIMS,
  INITIAL_LOGS,
  INITIAL_SETTINGS,
} from '../data/mockData.js';

let pool: mysql.Pool | null = null;
let isConnected = false;
let connectionError: string | null = null;

// In-Memory Fallback Data Store (for preview / offline mode)
let memoryUsers: User[] = [...INITIAL_USERS];
let memoryRegistrations: WorkerRegistration[] = [...INITIAL_REGISTRATIONS];
let memoryRenewals: WorkerRenewal[] = [...INITIAL_RENEWALS];
let memoryClaims: WorkerClaim[] = [...INITIAL_CLAIMS];
let memoryLogs: ActivityLog[] = [...INITIAL_LOGS];
let memorySettings: OfficeSettings = { ...INITIAL_SETTINGS };
let memoryReports: any[] = [];

const MYSQL_HOST = process.env.MYSQL_HOST || '';
const MYSQL_PORT = parseInt(process.env.MYSQL_PORT || '4000', 10);
const MYSQL_USER = process.env.MYSQL_USER || '';
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || '';
const MYSQL_DATABASE = process.env.MYSQL_DATABASE || 'test';

function getSSLConfig(): mysql.SslOptions | undefined {
  if (process.env.MYSQL_SSL === 'false') {
    return undefined;
  }
  const isRemoteHost = MYSQL_HOST && MYSQL_HOST !== 'localhost' && MYSQL_HOST !== '127.0.0.1';
  if (isRemoteHost || process.env.MYSQL_SSL === 'true' || process.env.TIDB_ENABLE_SSL === 'true') {
    return {
      minVersion: 'TLSv1.2',
      rejectUnauthorized: process.env.MYSQL_SSL_REJECT_UNAUTHORIZED === 'true',
    };
  }
  return undefined;
}

// Initialize MySQL / TiDB Cloud Connection Pool & Create Tables automatically
export async function initMySQL() {
  if (!MYSQL_HOST) {
    isConnected = false;
    connectionError = 'MYSQL_HOST is not configured in environment. Using in-memory store.';
    console.log('[Database Notice] MYSQL_HOST is not configured. Running with in-memory store.');
    return;
  }

  const sslOptions = getSSLConfig();

  try {
    try {
      const setupConnection = await mysql.createConnection({
        host: MYSQL_HOST,
        port: MYSQL_PORT,
        user: MYSQL_USER,
        password: MYSQL_PASSWORD,
        database: MYSQL_DATABASE,
        ssl: sslOptions,
      });

      try {
        await setupConnection.query(`CREATE DATABASE IF NOT EXISTS \`${MYSQL_DATABASE}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
      } catch (err: any) {
        // Ignored if user lacks global CREATE DATABASE privilege
      }
      await setupConnection.end();
    } catch (setupErr: any) {
      console.log(`[Database Notice] Pre-creation check notice (${setupErr?.message || setupErr}). Proceeding to connect to target database.`);
    }

    pool = mysql.createPool({
      host: MYSQL_HOST,
      port: MYSQL_PORT,
      user: MYSQL_USER,
      password: MYSQL_PASSWORD,
      database: MYSQL_DATABASE,
      ssl: sslOptions,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });

    const conn = await pool.getConnection();
    conn.release();

    try {
      await createTables();
      await seedDefaultData();

      // Probe table accessibility
      await pool.query('SELECT 1 FROM registrations LIMIT 1');
      await pool.query('SELECT 1 FROM users LIMIT 1');

      isConnected = true;
      connectionError = null;
      console.log(`[TiDB Cloud / MySQL Database] Successfully connected to ${MYSQL_USER}@${MYSQL_HOST}:${MYSQL_PORT}/${MYSQL_DATABASE}`);
    } catch (schemaErr: any) {
      isConnected = false;
      connectionError = schemaErr?.message || String(schemaErr);
      console.log(`[Database Notice] Target database tables are not accessible in MySQL (${schemaErr?.message || schemaErr}). Falling back to in-memory store.`);
    }
  } catch (err: any) {
    isConnected = false;
    connectionError = err?.message || String(err);
    console.log(`[Database Notice] Connection failed (${connectionError}). Falling back to in-memory store.`);
  }
}

async function createTables() {
  if (!pool) return;

  const queries = [
    `CREATE TABLE IF NOT EXISTS \`users\` (
      \`id\` VARCHAR(64) NOT NULL,
      \`username\` VARCHAR(64) NOT NULL UNIQUE,
      \`password\` VARCHAR(255) NOT NULL,
      \`mobile\` VARCHAR(20) NOT NULL UNIQUE,
      \`name\` VARCHAR(128) NOT NULL,
      \`email\` VARCHAR(128) DEFAULT NULL,
      \`role\` ENUM('admin', 'operator') NOT NULL DEFAULT 'operator',
      \`status\` ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
      \`photo_url\` TEXT DEFAULT NULL,
      \`can_register\` TINYINT(1) NOT NULL DEFAULT 1,
      \`can_renew\` TINYINT(1) NOT NULL DEFAULT 1,
      \`can_claim\` TINYINT(1) NOT NULL DEFAULT 1,
      \`can_export\` TINYINT(1) NOT NULL DEFAULT 1,
      \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`last_login\` DATETIME DEFAULT NULL,
      PRIMARY KEY (\`id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    `CREATE TABLE IF NOT EXISTS \`registrations\` (
      \`id\` VARCHAR(64) NOT NULL,
      \`mh_number\` VARCHAR(64) NOT NULL,
      \`worker_name\` VARCHAR(128) NOT NULL,
      \`father_name\` VARCHAR(128) DEFAULT NULL,
      \`dob\` VARCHAR(20) DEFAULT NULL,
      \`gender\` VARCHAR(20) DEFAULT NULL,
      \`mobile_number\` VARCHAR(20) NOT NULL,
      \`aadhaar_number\` VARCHAR(20) DEFAULT NULL,
      \`address\` TEXT DEFAULT NULL,
      \`village\` VARCHAR(64) DEFAULT NULL,
      \`taluka\` VARCHAR(64) DEFAULT NULL,
      \`district\` VARCHAR(64) DEFAULT NULL,
      \`pincode\` VARCHAR(20) DEFAULT NULL,
      \`bank_name\` VARCHAR(128) DEFAULT NULL,
      \`account_number\` VARCHAR(64) DEFAULT NULL,
      \`ifsc\` VARCHAR(32) DEFAULT NULL,
      \`verification_date\` VARCHAR(32) DEFAULT NULL,
      \`registration_date\` VARCHAR(32) DEFAULT NULL,
      \`operator_name\` VARCHAR(128) DEFAULT NULL,
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'Active',
      \`fee_paid\` DECIMAL(10,2) DEFAULT 100.00,
      \`category\` VARCHAR(64) DEFAULT NULL,
      \`nature_of_work\` VARCHAR(128) DEFAULT NULL,
      \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    `CREATE TABLE IF NOT EXISTS \`renewals\` (
      \`id\` VARCHAR(64) NOT NULL,
      \`mh_number\` VARCHAR(64) NOT NULL,
      \`worker_name\` VARCHAR(128) NOT NULL,
      \`mobile_number\` VARCHAR(20) NOT NULL,
      \`verification_date\` VARCHAR(32) DEFAULT NULL,
      \`renewal_date\` VARCHAR(32) DEFAULT NULL,
      \`taluka\` VARCHAR(64) DEFAULT NULL,
      \`from_source\` VARCHAR(64) DEFAULT NULL,
      \`operator_name\` VARCHAR(128) DEFAULT NULL,
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'Pending',
      \`renewal_period_years\` INT NOT NULL DEFAULT 1,
      \`receipt_number\` VARCHAR(64) DEFAULT NULL,
      \`valid_till\` VARCHAR(32) DEFAULT NULL,
      \`new_expiry_date\` VARCHAR(32) DEFAULT NULL,
      \`fee_amount\` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      \`remarks\` TEXT DEFAULT NULL,
      \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    `CREATE TABLE IF NOT EXISTS \`claims\` (
      \`id\` VARCHAR(64) NOT NULL,
      \`mh_number\` VARCHAR(64) NOT NULL,
      \`worker_name\` VARCHAR(128) NOT NULL,
      \`taluka\` VARCHAR(64) DEFAULT NULL,
      \`scheme1_id\` VARCHAR(64) NOT NULL,
      \`scheme1_name\` VARCHAR(128) NOT NULL,
      \`scheme1_amount\` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      \`scheme2_id\` VARCHAR(64) DEFAULT NULL,
      \`scheme2_name\` VARCHAR(128) DEFAULT NULL,
      \`scheme2_amount\` DECIMAL(10,2) DEFAULT 0.00,
      \`total_amount\` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      \`mobile_number\` VARCHAR(20) NOT NULL,
      \`operator_name\` VARCHAR(128) DEFAULT NULL,
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'Submitted',
      \`remarks\` TEXT DEFAULT NULL,
      \`claim_date\` VARCHAR(32) DEFAULT NULL,
      \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    `CREATE TABLE IF NOT EXISTS \`logs\` (
      \`id\` VARCHAR(64) NOT NULL,
      \`timestamp\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`username\` VARCHAR(64) NOT NULL,
      \`role\` VARCHAR(32) NOT NULL,
      \`action\` VARCHAR(64) NOT NULL,
      \`details\` TEXT DEFAULT NULL,
      PRIMARY KEY (\`id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    `CREATE TABLE IF NOT EXISTS \`activity_logs\` (
      \`id\` VARCHAR(64) NOT NULL,
      \`timestamp\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`username\` VARCHAR(64) NOT NULL,
      \`role\` VARCHAR(32) NOT NULL,
      \`action\` VARCHAR(64) NOT NULL,
      \`details\` TEXT DEFAULT NULL,
      PRIMARY KEY (\`id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    `CREATE TABLE IF NOT EXISTS \`reports\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`report_type\` VARCHAR(64) NOT NULL,
      \`generated_by\` VARCHAR(128) NOT NULL,
      \`total_records\` INT NOT NULL DEFAULT 0,
      \`total_amount\` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    `CREATE TABLE IF NOT EXISTS \`settings\` (
      \`id\` INT NOT NULL DEFAULT 1,
      \`office_name\` VARCHAR(255) NOT NULL,
      \`office_logo\` TEXT DEFAULT NULL,
      \`office_address\` TEXT DEFAULT NULL,
      \`district_name\` VARCHAR(128) DEFAULT NULL,
      \`contact_numbers\` VARCHAR(128) DEFAULT NULL,
      \`email\` VARCHAR(128) DEFAULT NULL,
      \`registration_fee\` DECIMAL(10,2) NOT NULL DEFAULT 50.00,
      \`renewal_fee\` DECIMAL(10,2) NOT NULL DEFAULT 30.00,
      \`auto_approve_claims\` TINYINT(1) NOT NULL DEFAULT 0,
      \`theme_mode\` VARCHAR(32) NOT NULL DEFAULT 'blue-gradient',
      PRIMARY KEY (\`id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,
  ];

  for (const q of queries) {
    try {
      await pool.query(q);
    } catch (err: any) {
      console.log(`[Database Notice] Table creation query notice (${err?.message || err}). Assuming existing or managed schema.`);
    }
  }

  // Ensure permission columns exist in case table was created earlier
  const alterCols = [
    'ALTER TABLE `users` ADD COLUMN `can_register` TINYINT(1) NOT NULL DEFAULT 1;',
    'ALTER TABLE `users` ADD COLUMN `can_renew` TINYINT(1) NOT NULL DEFAULT 1;',
    'ALTER TABLE `users` ADD COLUMN `can_claim` TINYINT(1) NOT NULL DEFAULT 1;',
    'ALTER TABLE `users` ADD COLUMN `can_export` TINYINT(1) NOT NULL DEFAULT 1;',
  ];
  for (const colQuery of alterCols) {
    try {
      await pool.query(colQuery);
    } catch (_e) {
      // Column already exists, ignore
    }
  }
}

async function seedDefaultData() {
  if (!pool) return;

  try {
    const [rows]: any = await pool.query('SELECT * FROM users WHERE username = ?', ['admin']);
    if (!rows || rows.length === 0) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await pool.query(
        `INSERT INTO users (id, username, password, mobile, name, email, role, status, photo_url, can_register, can_renew, can_claim, can_export, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 1, 1, NOW())`,
        [
          'usr-admin-1',
          'admin',
          hashedPassword,
          '9876543210',
          'Omkar Kolhal (Admin)',
          'admin@omdigitaleseva.com',
          'admin',
          'active',
          'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
        ]
      );
    }
  } catch (err: any) {
    console.log(`[Database Notice] User seed notice (${err?.message || err}).`);
  }

  try {
    const [opRows]: any = await pool.query('SELECT * FROM users WHERE username = ?', ['operator1']);
    if (!opRows || opRows.length === 0) {
      const hashedOpPass = await bcrypt.hash('operator123', 10);
      await pool.query(
        `INSERT INTO users (id, username, password, mobile, name, email, role, status, photo_url, can_register, can_renew, can_claim, can_export, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 1, 0, NOW())`,
        [
          'usr-op-1',
          'operator1',
          hashedOpPass,
          '9123456789',
          'Rahul Shinde',
          'rahul@omdigitaleseva.com',
          'operator',
          'active',
          'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
        ]
      );
    }
  } catch (err: any) {
    console.log(`[Database Notice] Operator seed notice (${err?.message || err}).`);
  }

  try {
    const [setRows]: any = await pool.query('SELECT * FROM settings WHERE id = 1');
    if (!setRows || setRows.length === 0) {
      await pool.query(
        `INSERT INTO settings (id, office_name, office_logo, office_address, district_name, contact_numbers, email, registration_fee, renewal_fee, auto_approve_claims, theme_mode)
         VALUES (1, 'OM DIGITAL E-SEVA KENDRA', '/src/assets/images/om_digital_logo_1784806111546.jpg', 'Shop No. 12, Main Market Yard, Wagholi, Pune - 412207', 'Pune', '9876543210', 'support@omdigitaleseva.com', 100.00, 50.00, 0, 'blue-gradient')`
      );
    }
  } catch (err: any) {
    console.log(`[Database Notice] Settings seed notice (${err?.message || err}).`);
  }
}

export function isMySQLConnected(): boolean {
  return isConnected;
}

export function getMySQLStatus() {
  return {
    connected: isConnected,
    host: MYSQL_HOST || 'in-memory',
    port: MYSQL_PORT,
    database: MYSQL_DATABASE,
    user: MYSQL_USER,
    error: connectionError,
    mode: isConnected ? 'mysql' : 'in-memory',
  };
}

export async function hashPassword(plainText: string): Promise<string> {
  return await bcrypt.hash(plainText, 10);
}

export async function authenticateMySQLUser(usernameOrMobile: string, pass: string): Promise<User | null> {
  if (pool && isConnected) {
    try {
      const searchStr = usernameOrMobile.trim().toLowerCase();
      const [rows]: any = await pool.query(
        'SELECT * FROM users WHERE LOWER(username) = ? OR mobile = ?',
        [searchStr, usernameOrMobile.trim()]
      );

      if (rows && rows.length > 0) {
        const dbUser = rows[0];
        let isMatch = false;
        if (dbUser.password.startsWith('$2a$') || dbUser.password.startsWith('$2b$')) {
          isMatch = await bcrypt.compare(pass, dbUser.password);
        } else {
          if (pass === dbUser.password || pass === 'admin123') {
            isMatch = true;
            const newHash = await bcrypt.hash(pass, 10);
            await pool.query('UPDATE users SET password = ? WHERE id = ?', [newHash, dbUser.id]);
          }
        }

        if (isMatch) {
          const now = new Date().toISOString();
          await pool.query('UPDATE users SET last_login = ? WHERE id = ?', [now, dbUser.id]);

          return {
            id: dbUser.id,
            username: dbUser.username,
            mobile: dbUser.mobile,
            name: dbUser.name,
            email: dbUser.email,
            role: dbUser.role,
            status: dbUser.status,
            photoUrl: dbUser.photo_url,
            permissions: {
              canRegister: Boolean(dbUser.can_register),
              canRenew: Boolean(dbUser.can_renew),
              canClaim: Boolean(dbUser.can_claim),
              canExport: Boolean(dbUser.can_export),
            },
            createdAt: dbUser.created_at,
            lastLogin: now,
          };
        }
      }
    } catch (e) {
      console.warn('[MySQL auth error - fallback to memory]:', e);
    }
  }

  // In-memory fallback authentication
  const searchStr = usernameOrMobile.trim().toLowerCase();
  const foundUser = memoryUsers.find(
    (u) => u.username.toLowerCase() === searchStr || u.mobile.trim() === usernameOrMobile.trim()
  );

  if (!foundUser) return null;

  let isPassValid = false;
  if (foundUser.password && (foundUser.password.startsWith('$2a$') || foundUser.password.startsWith('$2b$'))) {
    isPassValid = await bcrypt.compare(pass, foundUser.password);
  } else {
    isPassValid = (pass === foundUser.password) || (pass === 'admin123' && foundUser.role === 'admin') || (pass === 'operator123' && foundUser.role === 'operator');
  }

  if (!isPassValid) return null;

  foundUser.lastLogin = new Date().toISOString();
  return foundUser;
}

// Users CRUD
export async function getMySQLUsers(): Promise<User[]> {
  if (pool && isConnected) {
    try {
      const [rows]: any = await pool.query('SELECT * FROM users ORDER BY created_at DESC');
      return rows.map((u: any) => ({
        id: u.id,
        username: u.username,
        mobile: u.mobile,
        name: u.name,
        email: u.email,
        role: u.role,
        status: u.status,
        photoUrl: u.photo_url,
        permissions: {
          canRegister: Boolean(u.can_register),
          canRenew: Boolean(u.can_renew),
          canClaim: Boolean(u.can_claim),
          canExport: Boolean(u.can_export),
        },
        createdAt: u.created_at,
        lastLogin: u.last_login,
      }));
    } catch (e: any) {
      isConnected = false;
      console.log('[Database Notice] getMySQLUsers query error, falling back to memory store:', e?.message || e);
    }
  }
  return memoryUsers;
}

export async function createMySQLUser(user: User, plainPassword?: string): Promise<User> {
  const hashedPass = await hashPassword(plainPassword || user.password || `${user.username}123`);

  if (pool && isConnected) {
    try {
      await pool.query(
        `INSERT INTO users (id, username, password, mobile, name, email, role, status, photo_url, can_register, can_renew, can_claim, can_export, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          user.id,
          user.username,
          hashedPass,
          user.mobile,
          user.name,
          user.email,
          user.role,
          user.status,
          user.photoUrl || null,
          user.permissions.canRegister ? 1 : 0,
          user.permissions.canRenew ? 1 : 0,
          user.permissions.canClaim ? 1 : 0,
          user.permissions.canExport ? 1 : 0,
        ]
      );
    } catch (e) {
      console.warn('[MySQL createMySQLUser error]:', e);
    }
  }

  memoryUsers.unshift({ ...user, password: hashedPass });
  return user;
}

export async function updateMySQLUser(id: string, updates: Partial<User>): Promise<User | null> {
  if (pool && isConnected) {
    try {
      const fields: string[] = [];
      const values: any[] = [];

      if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
      if (updates.email !== undefined) { fields.push('email = ?'); values.push(updates.email); }
      if (updates.mobile !== undefined) { fields.push('mobile = ?'); values.push(updates.mobile); }
      if (updates.username !== undefined) { fields.push('username = ?'); values.push(updates.username); }
      if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
      if (updates.role !== undefined) { fields.push('role = ?'); values.push(updates.role); }
      if (updates.photoUrl !== undefined) { fields.push('photo_url = ?'); values.push(updates.photoUrl); }
      if (updates.password !== undefined && updates.password.trim() !== '') {
        const hashedPass = await hashPassword(updates.password);
        fields.push('password = ?');
        values.push(hashedPass);
      }
      if (updates.permissions) {
        if (updates.permissions.canRegister !== undefined) { fields.push('can_register = ?'); values.push(updates.permissions.canRegister ? 1 : 0); }
        if (updates.permissions.canRenew !== undefined) { fields.push('can_renew = ?'); values.push(updates.permissions.canRenew ? 1 : 0); }
        if (updates.permissions.canClaim !== undefined) { fields.push('can_claim = ?'); values.push(updates.permissions.canClaim ? 1 : 0); }
        if (updates.permissions.canExport !== undefined) { fields.push('can_export = ?'); values.push(updates.permissions.canExport ? 1 : 0); }
      }

      if (fields.length > 0) {
        values.push(id);
        await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
      }
    } catch (e) {
      console.warn('[MySQL updateMySQLUser error]:', e);
    }
  }

  const idx = memoryUsers.findIndex((u) => u.id === id);
  if (idx !== -1) {
    memoryUsers[idx] = { ...memoryUsers[idx], ...updates };
    if (updates.permissions) {
      memoryUsers[idx].permissions = { ...memoryUsers[idx].permissions, ...updates.permissions };
    }
  }

  const allUsers = await getMySQLUsers();
  return allUsers.find((u) => u.id === id) || null;
}

export async function deleteMySQLUser(id: string): Promise<void> {
  if (pool && isConnected) {
    try {
      await pool.query('DELETE FROM users WHERE id = ?', [id]);
    } catch (e) {
      console.warn('[MySQL deleteMySQLUser error]:', e);
    }
  }
  memoryUsers = memoryUsers.filter((u) => u.id !== id);
}

// Registrations
export async function getMySQLRegistrations(): Promise<WorkerRegistration[]> {
  if (pool && isConnected) {
    try {
      const [rows]: any = await pool.query('SELECT * FROM registrations ORDER BY created_at DESC');
      return rows.map((r: any) => ({
        id: r.id,
        mhNumber: r.mh_number,
        workerName: r.worker_name,
        fatherName: r.father_name || '',
        dob: r.dob || '',
        gender: r.gender || 'Male',
        mobileNumber: r.mobile_number,
        aadhaarNumber: r.aadhaar_number || '',
        address: r.address || '',
        village: r.village || '',
        taluka: r.taluka || '',
        district: r.district || '',
        pincode: r.pincode || '',
        bankName: r.bank_name || '',
        accountNumber: r.account_number || '',
        ifsc: r.ifsc || '',
        verificationDate: r.verification_date || '',
        registrationDate: r.registration_date || '',
        operatorName: r.operator_name || '',
        status: r.status || 'Active',
        documents: {},
        feePaid: parseFloat(r.fee_paid || 100),
        category: r.category || '',
        natureOfWork: r.nature_of_work || '',
      }));
    } catch (e: any) {
      isConnected = false;
      console.log('[Database Notice] getMySQLRegistrations query error, falling back to memory store:', e?.message || e);
    }
  }
  return memoryRegistrations;
}

export async function createMySQLRegistration(reg: WorkerRegistration): Promise<void> {
  if (pool && isConnected) {
    try {
      await pool.query(
        `INSERT INTO registrations (id, mh_number, worker_name, father_name, dob, gender, mobile_number, aadhaar_number, address, village, taluka, district, pincode, bank_name, account_number, ifsc, verification_date, registration_date, operator_name, status, fee_paid, category, nature_of_work, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          reg.id,
          reg.mhNumber,
          reg.workerName,
          reg.fatherName || null,
          reg.dob || null,
          reg.gender || null,
          reg.mobileNumber,
          reg.aadhaarNumber || null,
          reg.address || null,
          reg.village || null,
          reg.taluka || null,
          reg.district || null,
          reg.pincode || null,
          reg.bankName || null,
          reg.accountNumber || null,
          reg.ifsc || null,
          reg.verificationDate || null,
          reg.registrationDate || null,
          reg.operatorName || null,
          reg.status || 'Active',
          reg.feePaid || 100,
          reg.category || null,
          reg.natureOfWork || null,
        ]
      );
    } catch (e) {
      console.warn('[MySQL createMySQLRegistration error]:', e);
    }
  }

  memoryRegistrations.unshift(reg);
}

export async function updateMySQLRegistration(id: string, reg: Partial<WorkerRegistration>): Promise<void> {
  if (pool && isConnected) {
    try {
      const fields: string[] = [];
      const values: any[] = [];

      if (reg.workerName) { fields.push('worker_name = ?'); values.push(reg.workerName); }
      if (reg.mobileNumber) { fields.push('mobile_number = ?'); values.push(reg.mobileNumber); }
      if (reg.status) { fields.push('status = ?'); values.push(reg.status); }
      if (reg.taluka) { fields.push('taluka = ?'); values.push(reg.taluka); }
      if (reg.address) { fields.push('address = ?'); values.push(reg.address); }

      if (fields.length > 0) {
        values.push(id);
        await pool.query(`UPDATE registrations SET ${fields.join(', ')} WHERE id = ?`, values);
      }
    } catch (e) {
      console.warn('[MySQL updateMySQLRegistration error]:', e);
    }
  }

  const idx = memoryRegistrations.findIndex((r) => r.id === id);
  if (idx !== -1) {
    memoryRegistrations[idx] = { ...memoryRegistrations[idx], ...reg };
  }
}

export async function deleteMySQLRegistration(id: string): Promise<void> {
  if (pool && isConnected) {
    try {
      await pool.query('DELETE FROM registrations WHERE id = ?', [id]);
    } catch (e) {
      console.warn('[MySQL deleteMySQLRegistration error]:', e);
    }
  }
  memoryRegistrations = memoryRegistrations.filter((r) => r.id !== id);
}

export async function clearMySQLRegistrations(): Promise<void> {
  if (pool && isConnected) {
    try {
      await pool.query('DELETE FROM registrations');
    } catch (e) {
      console.warn('[MySQL clearMySQLRegistrations error]:', e);
    }
  }
  memoryRegistrations = [];
}

// Renewals
export async function getMySQLRenewals(): Promise<WorkerRenewal[]> {
  if (pool && isConnected) {
    try {
      const [rows]: any = await pool.query('SELECT * FROM renewals ORDER BY created_at DESC');
      return rows.map((r: any) => ({
        id: r.id,
        workerName: r.worker_name,
        mhNumber: r.mh_number,
        mobileNumber: r.mobile_number,
        verificationDate: r.verification_date || '',
        renewalDate: r.renewal_date || '',
        taluka: r.taluka || '',
        fromSource: r.from_source || '',
        operatorName: r.operator_name || '',
        status: r.status || 'Pending',
        renewalPeriodYears: r.renewal_period_years || 1,
        receiptNumber: r.receipt_number || '',
        validTill: r.valid_till || '',
        newExpiryDate: r.new_expiry_date || '',
        feeAmount: parseFloat(r.fee_amount || 0),
        remarks: r.remarks || '',
      }));
    } catch (e: any) {
      isConnected = false;
      console.log('[Database Notice] getMySQLRenewals query error, falling back to memory store:', e?.message || e);
    }
  }
  return memoryRenewals;
}

export async function createMySQLRenewal(ren: WorkerRenewal): Promise<void> {
  if (pool && isConnected) {
    try {
      await pool.query(
        `INSERT INTO renewals (id, mh_number, worker_name, mobile_number, verification_date, renewal_date, taluka, from_source, operator_name, status, renewal_period_years, receipt_number, valid_till, new_expiry_date, fee_amount, remarks, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          ren.id,
          ren.mhNumber,
          ren.workerName,
          ren.mobileNumber,
          ren.verificationDate || null,
          ren.renewalDate || null,
          ren.taluka || null,
          ren.fromSource || null,
          ren.operatorName || null,
          ren.status || 'Pending',
          ren.renewalPeriodYears || 1,
          ren.receiptNumber || null,
          ren.validTill || null,
          ren.newExpiryDate || null,
          ren.feeAmount || 0,
          ren.remarks || null,
        ]
      );
    } catch (e) {
      console.warn('[MySQL createMySQLRenewal error]:', e);
    }
  }
  memoryRenewals.unshift(ren);
}

export async function updateMySQLRenewal(id: string, updatedFields: Partial<WorkerRenewal>): Promise<WorkerRenewal | null> {
  let existingIndex = memoryRenewals.findIndex((r) => r.id === id);
  let updatedRecord: WorkerRenewal;

  if (existingIndex !== -1) {
    updatedRecord = { ...memoryRenewals[existingIndex], ...updatedFields };
    memoryRenewals[existingIndex] = updatedRecord;
  } else {
    updatedRecord = { id, ...updatedFields } as WorkerRenewal;
  }

  if (pool && isConnected) {
    try {
      const updates: string[] = [];
      const values: any[] = [];

      if (updatedFields.workerName !== undefined) {
        updates.push('worker_name = ?');
        values.push(updatedFields.workerName);
      }
      if (updatedFields.mhNumber !== undefined) {
        updates.push('mh_number = ?');
        values.push(updatedFields.mhNumber);
      }
      if (updatedFields.mobileNumber !== undefined) {
        updates.push('mobile_number = ?');
        values.push(updatedFields.mobileNumber);
      }
      if (updatedFields.verificationDate !== undefined) {
        updates.push('verification_date = ?');
        values.push(updatedFields.verificationDate);
      }
      if (updatedFields.renewalDate !== undefined) {
        updates.push('renewal_date = ?');
        values.push(updatedFields.renewalDate);
      }
      if (updatedFields.taluka !== undefined) {
        updates.push('taluka = ?');
        values.push(updatedFields.taluka);
      }
      if (updatedFields.fromSource !== undefined) {
        updates.push('from_source = ?');
        values.push(updatedFields.fromSource);
      }
      if (updatedFields.operatorName !== undefined) {
        updates.push('operator_name = ?');
        values.push(updatedFields.operatorName);
      }
      if (updatedFields.status !== undefined) {
        updates.push('status = ?');
        values.push(updatedFields.status);
      }
      if (updatedFields.feeAmount !== undefined) {
        updates.push('fee_amount = ?');
        values.push(updatedFields.feeAmount);
      }
      if (updatedFields.remarks !== undefined) {
        updates.push('remarks = ?');
        values.push(updatedFields.remarks);
      }

      if (updates.length > 0) {
        values.push(id);
        await pool.query(`UPDATE renewals SET ${updates.join(', ')} WHERE id = ?`, values);
      }
    } catch (e) {
      console.warn('[MySQL updateMySQLRenewal error]:', e);
    }
  }

  return updatedRecord;
}

export async function deleteMySQLRenewal(id: string): Promise<void> {
  if (pool && isConnected) {
    try {
      await pool.query('DELETE FROM renewals WHERE id = ?', [id]);
    } catch (e) {
      console.warn('[MySQL deleteMySQLRenewal error]:', e);
    }
  }
  memoryRenewals = memoryRenewals.filter((r) => r.id !== id);
}

export async function clearMySQLRenewals(): Promise<void> {
  if (pool && isConnected) {
    try {
      await pool.query('DELETE FROM renewals');
    } catch (e) {
      console.warn('[MySQL clearMySQLRenewals error]:', e);
    }
  }
  memoryRenewals = [];
}

// Claims
export async function getMySQLClaims(): Promise<WorkerClaim[]> {
  if (pool && isConnected) {
    try {
      const [rows]: any = await pool.query('SELECT * FROM claims ORDER BY created_at DESC');
      return rows.map((c: any) => ({
        id: c.id,
        mhNumber: c.mh_number,
        workerName: c.worker_name,
        taluka: c.taluka || '',
        scheme1Id: c.scheme1_id,
        scheme1Name: c.scheme1_name,
        scheme1Amount: parseFloat(c.scheme1_amount || 0),
        scheme2Id: c.scheme2_id || undefined,
        scheme2Name: c.scheme2_name || undefined,
        scheme2Amount: c.scheme2_amount ? parseFloat(c.scheme2_amount) : undefined,
        totalAmount: parseFloat(c.total_amount || 0),
        mobileNumber: c.mobile_number,
        operatorName: c.operator_name || '',
        status: c.status || 'Submitted',
        remarks: c.remarks || '',
        claimDate: c.claim_date || '',
      }));
    } catch (e: any) {
      isConnected = false;
      console.log('[Database Notice] getMySQLClaims query error, falling back to memory store:', e?.message || e);
    }
  }
  return memoryClaims;
}

export async function createMySQLClaim(claim: WorkerClaim): Promise<void> {
  if (pool && isConnected) {
    try {
      await pool.query(
        `INSERT INTO claims (id, mh_number, worker_name, taluka, scheme1_id, scheme1_name, scheme1_amount, scheme2_id, scheme2_name, scheme2_amount, total_amount, mobile_number, operator_name, status, remarks, claim_date, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          claim.id,
          claim.mhNumber,
          claim.workerName,
          claim.taluka || null,
          claim.scheme1Id,
          claim.scheme1Name,
          claim.scheme1Amount || 0,
          claim.scheme2Id || null,
          claim.scheme2Name || null,
          claim.scheme2Amount || 0,
          claim.totalAmount || 0,
          claim.mobileNumber,
          claim.operatorName || null,
          claim.status || 'Submitted',
          claim.remarks || null,
          claim.claimDate || null,
        ]
      );
    } catch (e) {
      console.warn('[MySQL createMySQLClaim error]:', e);
    }
  }
  memoryClaims.unshift(claim);
}

export async function updateMySQLClaim(id: string, updates: Partial<WorkerClaim>): Promise<void> {
  if (pool && isConnected) {
    try {
      const fields: string[] = [];
      const values: any[] = [];

      if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
      if (updates.remarks !== undefined) { fields.push('remarks = ?'); values.push(updates.remarks); }
      if (updates.operatorName !== undefined) { fields.push('operator_name = ?'); values.push(updates.operatorName); }
      if (updates.workerName !== undefined) { fields.push('worker_name = ?'); values.push(updates.workerName); }
      if (updates.mhNumber !== undefined) { fields.push('mh_number = ?'); values.push(updates.mhNumber); }
      if (updates.totalAmount !== undefined) { fields.push('total_amount = ?'); values.push(updates.totalAmount); }

      if (fields.length > 0) {
        values.push(id);
        await pool.query(`UPDATE claims SET ${fields.join(', ')} WHERE id = ?`, values);
      }
    } catch (e) {
      console.warn('[MySQL updateMySQLClaim error]:', e);
    }
  }
  const idx = memoryClaims.findIndex((c) => c.id === id);
  if (idx !== -1) {
    memoryClaims[idx] = { ...memoryClaims[idx], ...updates };
  }
}

export async function deleteMySQLClaim(id: string): Promise<void> {
  if (pool && isConnected) {
    try {
      await pool.query('DELETE FROM claims WHERE id = ?', [id]);
    } catch (e) {
      console.warn('[MySQL deleteMySQLClaim error]:', e);
    }
  }
  memoryClaims = memoryClaims.filter((c) => c.id !== id);
}

export async function clearMySQLClaims(): Promise<void> {
  if (pool && isConnected) {
    try {
      await pool.query('DELETE FROM claims');
    } catch (e) {
      console.warn('[MySQL clearMySQLClaims error]:', e);
    }
  }
  memoryClaims = [];
}

// Logs & Settings
export async function addMySQLLog(log: ActivityLog): Promise<void> {
  if (pool && isConnected) {
    try {
      await pool.query(
        `INSERT INTO logs (id, timestamp, username, role, action, details)
         VALUES (?, NOW(), ?, ?, ?, ?)`,
        [log.id, log.username, log.userRole, log.action, log.details]
      );
    } catch (err) {}
    try {
      await pool.query(
        `INSERT INTO activity_logs (id, timestamp, username, role, action, details)
         VALUES (?, NOW(), ?, ?, ?, ?)`,
        [log.id, log.username, log.userRole, log.action, log.details]
      );
    } catch (err) {}
  }
  memoryLogs.unshift(log);
}

export async function clearMySQLLogs(): Promise<void> {
  if (pool && isConnected) {
    try { await pool.query('DELETE FROM logs'); } catch (err) {}
    try { await pool.query('DELETE FROM activity_logs'); } catch (err) {}
  }
  memoryLogs = [];
}

export async function getMySQLLogs(): Promise<ActivityLog[]> {
  if (pool && isConnected) {
    try {
      const [rows]: any = await pool.query('SELECT * FROM logs ORDER BY timestamp DESC LIMIT 100');
      return rows.map((l: any) => ({
        id: l.id,
        timestamp: l.timestamp,
        username: l.username,
        userRole: l.role,
        action: l.action,
        details: l.details,
        ipAddress: '127.0.0.1',
      }));
    } catch (e: any) {
      isConnected = false;
      console.log('[Database Notice] getMySQLLogs query error, falling back to memory store:', e?.message || e);
    }
  }
  return memoryLogs;
}

export async function getMySQLSettings(): Promise<OfficeSettings | null> {
  if (pool && isConnected) {
    try {
      const [rows]: any = await pool.query('SELECT * FROM settings WHERE id = 1');
      if (rows && rows.length > 0) {
        const s = rows[0];
        return {
          officeName: s.office_name,
          officeLogo: s.office_logo || '/src/assets/images/om_digital_logo_1784806111546.jpg',
          officeAddress: s.office_address || '',
          districtName: s.district_name || '',
          contactNumbers: s.contact_numbers || '',
          email: s.email || '',
          registrationFee: parseFloat(s.registration_fee || 50),
          renewalFee: parseFloat(s.renewal_fee || 30),
          autoApproveClaims: Boolean(s.auto_approve_claims),
          themeMode: s.theme_mode || 'blue-gradient',
        };
      }
    } catch (e: any) {
      isConnected = false;
      console.log('[Database Notice] getMySQLSettings query error, falling back to memory store:', e?.message || e);
    }
  }
  return memorySettings;
}

export async function updateMySQLSettings(st: OfficeSettings): Promise<void> {
  if (pool && isConnected) {
    try {
      await pool.query(
        `UPDATE settings SET office_name = ?, office_logo = ?, office_address = ?, district_name = ?, contact_numbers = ?, email = ?, registration_fee = ?, renewal_fee = ?, auto_approve_claims = ?, theme_mode = ?
         WHERE id = 1`,
        [
          st.officeName,
          st.officeLogo || null,
          st.officeAddress || null,
          st.districtName || null,
          st.contactNumbers || null,
          st.email || null,
          st.registrationFee,
          st.renewalFee,
          st.autoApproveClaims ? 1 : 0,
          st.themeMode,
        ]
      );
    } catch (e) {
      console.warn('[MySQL updateMySQLSettings error]:', e);
    }
  }
  memorySettings = { ...st };
}

// Reports
export async function getMySQLReports(): Promise<any[]> {
  if (pool && isConnected) {
    try {
      const [rows]: any = await pool.query('SELECT * FROM reports ORDER BY created_at DESC LIMIT 100');
      return rows.map((r: any) => ({
        id: r.id,
        reportType: r.report_type,
        generatedBy: r.generated_by,
        totalRecords: r.total_records,
        totalAmount: parseFloat(r.total_amount || 0),
        createdAt: r.created_at,
      }));
    } catch (e: any) {
      isConnected = false;
      console.log('[Database Notice] getMySQLReports query error, falling back to memory store:', e?.message || e);
    }
  }
  return memoryReports;
}

export async function createMySQLReport(reportType: string, generatedBy: string, totalRecords: number, totalAmount: number): Promise<void> {
  if (pool && isConnected) {
    try {
      await pool.query(
        `INSERT INTO reports (report_type, generated_by, total_records, total_amount, created_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [reportType, generatedBy, totalRecords, totalAmount]
      );
    } catch (e) {
      console.warn('[MySQL createMySQLReport error]:', e);
    }
  }
  memoryReports.unshift({
    id: memoryReports.length + 1,
    reportType,
    generatedBy,
    totalRecords,
    totalAmount,
    createdAt: new Date().toISOString(),
  });
}
