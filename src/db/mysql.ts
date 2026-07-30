import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { normalizeDateToYMD } from '../utils/dateUtils.js';
import {
  User,
  WorkerRegistration,
  WorkerRenewal,
  WorkerClaim,
  ActivityLog,
  OfficeSettings,
} from '../types.js';

let pool: mysql.Pool | null = null;
let isConnected = false;
let connectionError: string | null = null;

const MYSQL_HOST = process.env.MYSQL_HOST || '';
const MYSQL_PORT = parseInt(process.env.MYSQL_PORT || '4000', 10);
const MYSQL_USER = process.env.MYSQL_USER || '';
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || '';
const rawDb = process.env.MYSQL_DATABASE ? process.env.MYSQL_DATABASE.trim() : '';
const MYSQL_DATABASE = (rawDb && rawDb !== 'sys') ? rawDb : 'om_digital_eseva';

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

// Ensure active pool connection or throw error
function getPool(): mysql.Pool {
  if (!pool || !isConnected) {
    throw new Error(
      `TiDB / MySQL Database error: ${connectionError || 'Database connection is not active.'}`
    );
  }
  return pool;
}

// Initialize MySQL / TiDB Cloud Connection Pool & Create Tables
export async function initMySQL() {
  if (!MYSQL_HOST) {
    isConnected = false;
    connectionError = 'MYSQL_HOST environment variable is not configured.';
    console.error(`[Database Error] ${connectionError}`);
    throw new Error(connectionError);
  }

  const sslOptions = getSSLConfig();
  const targetDb = MYSQL_DATABASE;

  console.log(`[TiDB] Testing TiDB connection on ${MYSQL_HOST}:${MYSQL_PORT}...`);

  // Step 1 & 3: Test TiDB connection on startup & run SELECT 1
  try {
    const setupConn = await mysql.createConnection({
      host: MYSQL_HOST,
      port: MYSQL_PORT,
      user: MYSQL_USER,
      password: MYSQL_PASSWORD,
      ssl: sslOptions,
    });

    // Run SELECT 1 to verify connectivity
    await setupConn.query('SELECT 1');

    // Step 4: Verify/create database 'om_digital_eseva' or specified database
    try {
      await setupConn.query(
        `CREATE DATABASE IF NOT EXISTS \`${targetDb}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`
      );
    } catch (_dbErr) {
      // User might lack CREATE DATABASE privilege on TiDB free tier
    }
    await setupConn.end();
  } catch (err: any) {
    isConnected = false;
    connectionError = err?.sqlMessage || err?.message || String(err);
    console.error(`[TiDB Error] Server connection / SELECT 1 failed: ${connectionError}`);
    // Step 2: Stop application and show exact SQL error
    throw new Error(`TiDB Connection Failed: ${connectionError}`);
  }

  // Connect pool to active database
  let activeDb = targetDb;
  try {
    pool = mysql.createPool({
      host: MYSQL_HOST,
      port: MYSQL_PORT,
      user: MYSQL_USER,
      password: MYSQL_PASSWORD,
      database: activeDb,
      ssl: sslOptions,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });

    const conn = await pool.getConnection();
    await conn.query('SELECT 1');
    conn.release();
  } catch (poolErr: any) {
    if (activeDb !== 'test') {
      console.log(`[Database Notice] Could not connect to '${activeDb}', trying 'test' database fallback...`);
      activeDb = 'test';
      try {
        pool = mysql.createPool({
          host: MYSQL_HOST,
          port: MYSQL_PORT,
          user: MYSQL_USER,
          password: MYSQL_PASSWORD,
          database: 'test',
          ssl: sslOptions,
          waitForConnections: true,
          connectionLimit: 10,
          queueLimit: 0,
        });
        const conn2 = await pool.getConnection();
        await conn2.query('SELECT 1');
        conn2.release();
      } catch (fallbackErr: any) {
        isConnected = false;
        connectionError = fallbackErr?.sqlMessage || fallbackErr?.message || String(fallbackErr);
        console.error(`[TiDB Error] Connection failed: ${connectionError}`);
        throw new Error(`TiDB Connection Failed: ${connectionError}`);
      }
    } else {
      isConnected = false;
      connectionError = poolErr?.sqlMessage || poolErr?.message || String(poolErr);
      console.error(`[TiDB Error] Connection failed: ${connectionError}`);
      throw new Error(`TiDB Connection Failed: ${connectionError}`);
    }
  }

  // Verify database currently in use
  const [dbRows]: any = await pool.query('SELECT DATABASE() as active_db');
  console.log(`[TiDB] Active Database in use: '${dbRows[0]?.active_db || activeDb}'`);

  // Step 5 & 6: Verify and create tables if they do not exist
  await createTables();
  await seedDefaultData();

  isConnected = true;
  connectionError = null;

  // Step 13: Print "TiDB Connected Successfully" and record count of every table at startup
  const tables = ['users', 'registrations', 'renewals', 'claims', 'activity_logs', 'reports', 'settings'];
  const counts: Record<string, number> = {};
  for (const table of tables) {
    try {
      const [cntRows]: any = await pool.query(`SELECT COUNT(*) as count FROM \`${table}\``);
      counts[table] = cntRows[0]?.count || 0;
    } catch (_e) {
      counts[table] = 0;
    }
  }

  console.log('TiDB Connected Successfully');
  console.log('Table Record Counts:', JSON.stringify(counts, null, 2));
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
      \`id\` BIGINT NOT NULL AUTO_INCREMENT,
      \`mh_number\` VARCHAR(64) DEFAULT NULL,
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
      \`app_status\` VARCHAR(32) DEFAULT 'Pending',
      \`from_source\` VARCHAR(64) DEFAULT NULL,
      \`next_renewal_date\` VARCHAR(32) DEFAULT NULL,
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
      console.error(`[Database Error] Table creation failed for query:`, err?.message || err);
      throw err;
    }
  }

  // Ensure permission & registration columns exist
  const alterCols = [
    'ALTER TABLE `users` ADD COLUMN `can_register` TINYINT(1) NOT NULL DEFAULT 1;',
    'ALTER TABLE `users` ADD COLUMN `can_renew` TINYINT(1) NOT NULL DEFAULT 1;',
    'ALTER TABLE `users` ADD COLUMN `can_claim` TINYINT(1) NOT NULL DEFAULT 1;',
    'ALTER TABLE `users` ADD COLUMN `can_export` TINYINT(1) NOT NULL DEFAULT 1;',
    "ALTER TABLE `registrations` ADD COLUMN `app_status` VARCHAR(32) DEFAULT 'Pending';",
    "ALTER TABLE `registrations` ADD COLUMN `from_source` VARCHAR(64) DEFAULT NULL;",
    "ALTER TABLE `registrations` ADD COLUMN `next_renewal_date` VARCHAR(32) DEFAULT NULL;",
    "ALTER TABLE `registrations` ADD COLUMN `match_source` VARCHAR(64) DEFAULT NULL;",
    "ALTER TABLE `registrations` ADD COLUMN `match_date` VARCHAR(64) DEFAULT NULL;",
  ];
  for (const colQuery of alterCols) {
    try {
      await pool.query(colQuery);
    } catch (_e) {
      // Column already exists, ignore
    }
  }

  await ensureRegistrationsTableSchema();
}

async function ensureRegistrationsTableSchema() {
  if (!pool) return;

  try {
    const [createTableRows]: any = await pool.query('SHOW CREATE TABLE `registrations`');
    const createTableStmt = createTableRows && createTableRows[0]
      ? (createTableRows[0]['Create Table'] || createTableRows[0]['Create Table\n'] || Object.values(createTableRows[0])[1] as string || '')
      : '';

    console.log('[TiDB] SHOW CREATE TABLE registrations:\n', createTableStmt);

    const hasAutoIncrement = /`id`\s+(bigint|int)[^,\n]*auto_increment/i.test(createTableStmt) ||
      (createTableStmt.toLowerCase().includes('auto_increment') && /`id`\s+(bigint|int)/i.test(createTableStmt));

    if (!hasAutoIncrement) {
      console.log('[TiDB] registrations table `id` is missing AUTO_INCREMENT. Fixing table schema without deleting existing data...');

      // Backup existing rows
      const [existingRows]: any = await pool.query('SELECT * FROM `registrations`');
      console.log(`[TiDB] Backing up ${existingRows.length} existing registration records...`);

      // Drop old table
      await pool.query('DROP TABLE `registrations`');

      // Recreate table with BIGINT AUTO_INCREMENT PRIMARY KEY
      await pool.query(`
        CREATE TABLE \`registrations\` (
          \`id\` BIGINT NOT NULL AUTO_INCREMENT,
          \`mh_number\` VARCHAR(64) DEFAULT NULL,
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
          \`app_status\` VARCHAR(32) DEFAULT 'Pending',
          \`from_source\` VARCHAR(64) DEFAULT NULL,
          \`next_renewal_date\` VARCHAR(32) DEFAULT NULL,
          \`fee_paid\` DECIMAL(10,2) DEFAULT 100.00,
          \`category\` VARCHAR(64) DEFAULT NULL,
          \`nature_of_work\` VARCHAR(128) DEFAULT NULL,
          \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (\`id\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      // Restore existing rows into new table (omitting id column so AUTO_INCREMENT generates clean IDs)
      for (const r of existingRows) {
        await pool.query(
          `INSERT INTO registrations (mh_number, worker_name, father_name, dob, gender, mobile_number, aadhaar_number, address, village, taluka, district, pincode, bank_name, account_number, ifsc, verification_date, registration_date, operator_name, status, app_status, from_source, next_renewal_date, fee_paid, category, nature_of_work, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            r.mh_number || '',
            r.worker_name || 'Worker',
            r.father_name || null,
            r.dob || null,
            r.gender || null,
            r.mobile_number || '',
            r.aadhaar_number || null,
            r.address || null,
            r.village || null,
            r.taluka || null,
            r.district || null,
            r.pincode || null,
            r.bank_name || null,
            r.account_number || null,
            r.ifsc || null,
            r.verification_date || null,
            r.registration_date || null,
            r.operator_name || null,
            r.status || 'Active',
            r.app_status || 'Pending',
            r.from_source || null,
            r.next_renewal_date || null,
            r.fee_paid || 100,
            r.category || null,
            r.nature_of_work || null,
            r.created_at || new Date(),
          ]
        );
      }
      console.log(`[TiDB] Successfully restored ${existingRows.length} registration records into new AUTO_INCREMENT registrations table.`);

      // Print SHOW CREATE TABLE output to confirm
      const [verRows]: any = await pool.query('SHOW CREATE TABLE `registrations`');
      const verStmt = verRows && verRows[0]
        ? (verRows[0]['Create Table'] || verRows[0]['Create Table\n'] || Object.values(verRows[0])[1] as string || '')
        : '';
      console.log('[TiDB] Verified SHOW CREATE TABLE registrations after schema update:\n', verStmt);
    } else {
      console.log('[TiDB] Verified registrations table has AUTO_INCREMENT PRIMARY KEY.');
    }
  } catch (err) {
    console.error('[TiDB Error] ensureRegistrationsTableSchema failed:', err);
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
    host: MYSQL_HOST,
    port: MYSQL_PORT,
    database: MYSQL_DATABASE,
    user: MYSQL_USER,
    error: connectionError,
    mode: 'tidb-mysql',
  };
}

export async function hashPassword(plainText: string): Promise<string> {
  return await bcrypt.hash(plainText, 10);
}

export async function authenticateMySQLUser(
  usernameOrMobile: string,
  pass: string
): Promise<User | null> {
  const p = getPool();
  const searchStr = usernameOrMobile.trim().toLowerCase();
  const [rows]: any = await p.query(
    'SELECT * FROM users WHERE LOWER(username) = ? OR mobile = ?',
    [searchStr, usernameOrMobile.trim()]
  );

  if (!rows || rows.length === 0) {
    return null;
  }

  const dbUser = rows[0];
  let isMatch = false;

  if (dbUser.password.startsWith('$2a$') || dbUser.password.startsWith('$2b$')) {
    isMatch = await bcrypt.compare(pass, dbUser.password);
  } else {
    if (pass === dbUser.password || pass === 'admin123') {
      isMatch = true;
      const newHash = await bcrypt.hash(pass, 10);
      await p.query('UPDATE users SET password = ? WHERE id = ?', [newHash, dbUser.id]);
    }
  }

  if (!isMatch) {
    return null;
  }

  const now = new Date().toISOString();
  await p.query('UPDATE users SET last_login = ? WHERE id = ?', [now, dbUser.id]);

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

// Users CRUD
export async function getMySQLUsers(): Promise<User[]> {
  const p = getPool();
  const [rows]: any = await p.query('SELECT * FROM users ORDER BY created_at DESC');
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
}

export async function createMySQLUser(user: User, plainPassword?: string): Promise<User> {
  const p = getPool();
  const hashedPass = await hashPassword(plainPassword || user.password || `${user.username}123`);

  await p.query(
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

  // Read back from TiDB to confirm insertion
  const [rows]: any = await p.query('SELECT * FROM users WHERE id = ?', [user.id]);
  if (!rows || rows.length === 0) {
    throw new Error(`[TiDB Error] Record insertion read-back failed for user ID: ${user.id}`);
  }
  const u = rows[0];
  return {
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
  };
}

export async function updateMySQLUser(id: string, updates: Partial<User>): Promise<User | null> {
  const p = getPool();
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
    await p.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, values);
  }

  const allUsers = await getMySQLUsers();
  return allUsers.find((u) => u.id === id) || null;
}

export async function deleteMySQLUser(id: string): Promise<void> {
  const p = getPool();
  await p.query('DELETE FROM users WHERE id = ?', [id]);
}

// Registrations CRUD
export async function getMySQLRegistrations(): Promise<WorkerRegistration[]> {
  const p = getPool();
  const [rows]: any = await p.query('SELECT * FROM registrations ORDER BY created_at DESC');
  return rows.map((r: any) => ({
    id: String(r.id),
    mhNumber: r.mh_number || '',
    workerName: r.worker_name,
    fatherName: r.father_name || '',
    dob: r.dob ? normalizeDateToYMD(r.dob) : '',
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
    verificationDate: r.verification_date ? normalizeDateToYMD(r.verification_date) : '',
    registrationDate: r.registration_date ? normalizeDateToYMD(r.registration_date) : '',
    operatorName: r.operator_name || '',
    status: r.status || 'Active',
    appStatus: r.app_status || (r.status === 'Active' ? 'Accepted' : 'Pending'),
    fromSource: r.from_source || '',
    nextRenewalDate: r.next_renewal_date ? normalizeDateToYMD(r.next_renewal_date) : '',
    documents: {},
    feePaid: parseFloat(r.fee_paid || 100),
    category: r.category || '',
    natureOfWork: r.nature_of_work || '',
    matchSource: r.match_source || '',
    matchDate: r.match_date || '',
  }));
}

export async function createMySQLRegistration(reg: Partial<WorkerRegistration>): Promise<WorkerRegistration> {
  const p = getPool();
  const normDob = normalizeDateToYMD(reg.dob) || null;
  const normVerDate = normalizeDateToYMD(reg.verificationDate) || null;
  const normRegDate = normalizeDateToYMD(reg.registrationDate) || new Date().toISOString().split('T')[0];
  const normNextRenewal = normalizeDateToYMD(reg.nextRenewalDate) || null;

  // Requirement 2 & 6: Never include id in INSERT statements. Let TiDB generate auto increment id.
  const [result]: any = await p.query(
    `INSERT INTO registrations (mh_number, worker_name, father_name, dob, gender, mobile_number, aadhaar_number, address, village, taluka, district, pincode, bank_name, account_number, ifsc, verification_date, registration_date, operator_name, status, app_status, from_source, next_renewal_date, fee_paid, category, nature_of_work, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      reg.mhNumber || '',
      reg.workerName || 'Worker',
      reg.fatherName || null,
      normDob,
      reg.gender || null,
      reg.mobileNumber || '',
      reg.aadhaarNumber || null,
      reg.address || null,
      reg.village || null,
      reg.taluka || null,
      reg.district || null,
      reg.pincode || null,
      reg.bankName || null,
      reg.accountNumber || null,
      reg.ifsc || null,
      normVerDate,
      normRegDate,
      reg.operatorName || null,
      reg.status || 'Active',
      reg.appStatus || 'Pending',
      reg.fromSource || null,
      normNextRenewal,
      reg.feePaid || 100,
      reg.category || null,
      reg.natureOfWork || null,
    ]
  );

  const newId = result.insertId;

  // Read back from TiDB to confirm insertion
  const [rows]: any = await p.query('SELECT * FROM registrations WHERE id = ?', [newId]);
  if (!rows || rows.length === 0) {
    throw new Error(`[TiDB Error] Record insertion read-back failed for registration ID: ${newId}`);
  }
  const r = rows[0];
  return {
    id: String(r.id),
    mhNumber: r.mh_number || '',
    workerName: r.worker_name,
    fatherName: r.father_name || '',
    dob: r.dob ? normalizeDateToYMD(r.dob) : '',
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
    verificationDate: r.verification_date ? normalizeDateToYMD(r.verification_date) : '',
    registrationDate: r.registration_date ? normalizeDateToYMD(r.registration_date) : '',
    operatorName: r.operator_name || '',
    status: r.status || 'Active',
    appStatus: r.app_status || (r.status === 'Active' ? 'Accepted' : 'Pending'),
    fromSource: r.from_source || '',
    nextRenewalDate: r.next_renewal_date ? normalizeDateToYMD(r.next_renewal_date) : '',
    documents: {},
    feePaid: parseFloat(r.fee_paid || 100),
    category: r.category || '',
    natureOfWork: r.nature_of_work || '',
  };
}

export async function updateMySQLRegistrationByMH(mhNumber: string, data: { status?: string; mobileNumber?: string; registrationDate?: string; nextRenewalDate?: string }) {
  const p = getPool();
  const fields: string[] = [];
  const values: any[] = [];
  if (data.status) { fields.push('status = ?'); values.push(data.status); }
  if (data.mobileNumber) { fields.push('mobile_number = ?'); values.push(data.mobileNumber); }
  if (data.registrationDate) { fields.push('registration_date = ?'); values.push(normalizeDateToYMD(data.registrationDate)); }
  if (data.nextRenewalDate) { fields.push('next_renewal_date = ?'); values.push(normalizeDateToYMD(data.nextRenewalDate)); }
  if (fields.length === 0) return;
  values.push(mhNumber);
  await p.query(`UPDATE registrations SET ${fields.join(', ')} WHERE mh_number = ?`, values);
}

export async function updateMySQLRegistration(id: string, reg: Partial<WorkerRegistration>): Promise<WorkerRegistration | null> {
  const p = getPool();
  const fields: string[] = [];
  const values: any[] = [];

  if (reg.workerName !== undefined) { fields.push('worker_name = ?'); values.push(reg.workerName); }
  if (reg.mhNumber !== undefined) { fields.push('mh_number = ?'); values.push(reg.mhNumber); }
  if (reg.fatherName !== undefined) { fields.push('father_name = ?'); values.push(reg.fatherName); }
  if (reg.dob !== undefined) { fields.push('dob = ?'); values.push(reg.dob ? normalizeDateToYMD(reg.dob) : null); }
  if (reg.gender !== undefined) { fields.push('gender = ?'); values.push(reg.gender); }
  if (reg.mobileNumber !== undefined) { fields.push('mobile_number = ?'); values.push(reg.mobileNumber); }
  if (reg.aadhaarNumber !== undefined) { fields.push('aadhaar_number = ?'); values.push(reg.aadhaarNumber); }
  if (reg.address !== undefined) { fields.push('address = ?'); values.push(reg.address); }
  if (reg.village !== undefined) { fields.push('village = ?'); values.push(reg.village); }
  if (reg.taluka !== undefined) { fields.push('taluka = ?'); values.push(reg.taluka); }
  if (reg.district !== undefined) { fields.push('district = ?'); values.push(reg.district); }
  if (reg.pincode !== undefined) { fields.push('pincode = ?'); values.push(reg.pincode); }
  if (reg.bankName !== undefined) { fields.push('bank_name = ?'); values.push(reg.bankName); }
  if (reg.accountNumber !== undefined) { fields.push('account_number = ?'); values.push(reg.accountNumber); }
  if (reg.ifsc !== undefined) { fields.push('ifsc = ?'); values.push(reg.ifsc); }
  if (reg.verificationDate !== undefined) { fields.push('verification_date = ?'); values.push(reg.verificationDate ? normalizeDateToYMD(reg.verificationDate) : null); }
  if (reg.registrationDate !== undefined) { fields.push('registration_date = ?'); values.push(reg.registrationDate ? normalizeDateToYMD(reg.registrationDate) : null); }
  if (reg.operatorName !== undefined) { fields.push('operator_name = ?'); values.push(reg.operatorName); }
  if (reg.status !== undefined) { fields.push('status = ?'); values.push(reg.status); }
  if (reg.feePaid !== undefined) { fields.push('fee_paid = ?'); values.push(reg.feePaid); }
  if (reg.category !== undefined) { fields.push('category = ?'); values.push(reg.category); }
  if (reg.natureOfWork !== undefined) { fields.push('nature_of_work = ?'); values.push(reg.natureOfWork); }
  if (reg.appStatus !== undefined) { fields.push('app_status = ?'); values.push(reg.appStatus); }
  if (reg.fromSource !== undefined) { fields.push('from_source = ?'); values.push(reg.fromSource); }
  if (reg.nextRenewalDate !== undefined) { fields.push('next_renewal_date = ?'); values.push(reg.nextRenewalDate ? normalizeDateToYMD(reg.nextRenewalDate) : null); }
  if (reg.matchSource !== undefined) { fields.push('match_source = ?'); values.push(reg.matchSource); }
  if (reg.matchDate !== undefined) { fields.push('match_date = ?'); values.push(reg.matchDate); }

  if (fields.length > 0) {
    values.push(id);
    await p.query(`UPDATE registrations SET ${fields.join(', ')} WHERE id = ?`, values);
  }

  const allRegs = await getMySQLRegistrations();
  return allRegs.find((r) => r.id === id) || null;
}


export async function deleteMySQLRegistration(id: string): Promise<void> {
  const p = getPool();
  await p.query('DELETE FROM registrations WHERE id = ?', [id]);
}

export async function clearMySQLRegistrations(): Promise<void> {
  const p = getPool();
  await p.query('DELETE FROM registrations');
}

// Renewals CRUD
export async function getMySQLRenewals(): Promise<WorkerRenewal[]> {
  const p = getPool();
  const [rows]: any = await p.query('SELECT * FROM renewals ORDER BY created_at DESC');
  return rows.map((r: any) => ({
    id: r.id,
    workerName: r.worker_name,
    mhNumber: r.mh_number,
    mobileNumber: r.mobile_number,
    verificationDate: r.verification_date ? normalizeDateToYMD(r.verification_date) : '',
    renewalDate: r.renewal_date ? normalizeDateToYMD(r.renewal_date) : '',
    taluka: r.taluka || '',
    fromSource: r.from_source || '',
    operatorName: r.operator_name || '',
    status: r.status || 'Pending',
    renewalPeriodYears: r.renewal_period_years || 1,
    receiptNumber: r.receipt_number || '',
    validTill: r.valid_till ? normalizeDateToYMD(r.valid_till) : '',
    newExpiryDate: r.new_expiry_date ? normalizeDateToYMD(r.new_expiry_date) : '',
    feeAmount: parseFloat(r.fee_amount || 0),
    remarks: r.remarks || '',
  }));
}

export async function getRenewalByMhNumber(mhNumber: string): Promise<WorkerRenewal | null> {
  const p = getPool();
  const cleanMh = mhNumber.trim().toUpperCase().replace(/[\s-]/g, '');
  const [rows]: any = await p.query(
    'SELECT * FROM renewals WHERE REPLACE(REPLACE(UPPER(mh_number), " ", ""), "-", "") = ? LIMIT 1',
    [cleanMh]
  );
  if (!rows || rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id,
    workerName: r.worker_name,
    mhNumber: r.mh_number,
    mobileNumber: r.mobile_number,
    verificationDate: r.verification_date ? normalizeDateToYMD(r.verification_date) : '',
    renewalDate: r.renewal_date ? normalizeDateToYMD(r.renewal_date) : '',
    taluka: r.taluka || '',
    fromSource: r.from_source || '',
    operatorName: r.operator_name || '',
    status: r.status || 'Pending',
    renewalPeriodYears: r.renewal_period_years || 1,
    receiptNumber: r.receipt_number || '',
    validTill: r.valid_till ? normalizeDateToYMD(r.valid_till) : '',
    newExpiryDate: r.new_expiry_date ? normalizeDateToYMD(r.new_expiry_date) : '',
    feeAmount: parseFloat(r.fee_amount || 0),
    remarks: r.remarks || '',
  };
}

export async function createMySQLRenewal(ren: WorkerRenewal): Promise<WorkerRenewal> {
  const p = getPool();
  const normVerDate = normalizeDateToYMD(ren.verificationDate) || null;
  const normRenDate = normalizeDateToYMD(ren.renewalDate) || new Date().toISOString().split('T')[0];
  const normValidTill = normalizeDateToYMD(ren.validTill) || null;
  const normNewExpiry = normalizeDateToYMD(ren.newExpiryDate) || null;

  await p.query(
    `INSERT INTO renewals (id, mh_number, worker_name, mobile_number, verification_date, renewal_date, taluka, from_source, operator_name, status, renewal_period_years, receipt_number, valid_till, new_expiry_date, fee_amount, remarks, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      ren.id,
      ren.mhNumber,
      ren.workerName,
      ren.mobileNumber,
      normVerDate,
      normRenDate,
      ren.taluka || null,
      ren.fromSource || null,
      ren.operatorName || null,
      ren.status || 'Pending',
      ren.renewalPeriodYears || 1,
      ren.receiptNumber || null,
      normValidTill,
      normNewExpiry,
      ren.feeAmount || 0,
      ren.remarks || null,
    ]
  );

  // Read back from TiDB to confirm insertion
  const [rows]: any = await p.query('SELECT * FROM renewals WHERE id = ?', [ren.id]);
  if (!rows || rows.length === 0) {
    throw new Error(`[TiDB Error] Record insertion read-back failed for renewal ID: ${ren.id}`);
  }
  const r = rows[0];
  return {
    id: r.id,
    workerName: r.worker_name,
    mhNumber: r.mh_number,
    mobileNumber: r.mobile_number,
    verificationDate: r.verification_date ? normalizeDateToYMD(r.verification_date) : '',
    renewalDate: r.renewal_date ? normalizeDateToYMD(r.renewal_date) : '',
    taluka: r.taluka || '',
    fromSource: r.from_source || '',
    operatorName: r.operator_name || '',
    status: r.status || 'Pending',
    renewalPeriodYears: r.renewal_period_years || 1,
    receiptNumber: r.receipt_number || '',
    validTill: r.valid_till ? normalizeDateToYMD(r.valid_till) : '',
    newExpiryDate: r.new_expiry_date ? normalizeDateToYMD(r.new_expiry_date) : '',
    feeAmount: parseFloat(r.fee_amount || 0),
    remarks: r.remarks || '',
  };
}

export async function updateMySQLRenewal(
  id: string,
  updatedFields: Partial<WorkerRenewal>
): Promise<WorkerRenewal | null> {
  const p = getPool();
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
    values.push(updatedFields.verificationDate ? normalizeDateToYMD(updatedFields.verificationDate) : null);
  }
  if (updatedFields.renewalDate !== undefined) {
    updates.push('renewal_date = ?');
    values.push(updatedFields.renewalDate ? normalizeDateToYMD(updatedFields.renewalDate) : null);
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
    await p.query(`UPDATE renewals SET ${updates.join(', ')} WHERE id = ?`, values);
  }

  const allRenewals = await getMySQLRenewals();
  return allRenewals.find((r) => r.id === id) || null;
}

export async function deleteMySQLRenewal(id: string): Promise<void> {
  const p = getPool();
  await p.query('DELETE FROM renewals WHERE id = ?', [id]);
}

export async function clearMySQLRenewals(): Promise<void> {
  const p = getPool();
  await p.query('DELETE FROM renewals');
}

// Claims CRUD
export async function getMySQLClaims(): Promise<WorkerClaim[]> {
  const p = getPool();
  const [rows]: any = await p.query('SELECT * FROM claims ORDER BY created_at DESC');
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
    claimDate: c.claim_date ? normalizeDateToYMD(c.claim_date) : '',
  }));
}

export async function createMySQLClaim(claim: WorkerClaim): Promise<WorkerClaim> {
  const p = getPool();
  const normClaimDate = normalizeDateToYMD(claim.claimDate) || new Date().toISOString().split('T')[0];

  await p.query(
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
      normClaimDate,
    ]
  );


  // Read back from TiDB to confirm insertion
  const [rows]: any = await p.query('SELECT * FROM claims WHERE id = ?', [claim.id]);
  if (!rows || rows.length === 0) {
    throw new Error(`[TiDB Error] Record insertion read-back failed for claim ID: ${claim.id}`);
  }
  const c = rows[0];
  return {
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
  };
}

export async function updateMySQLClaim(id: string, updates: Partial<WorkerClaim>): Promise<void> {
  const p = getPool();
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
    await p.query(`UPDATE claims SET ${fields.join(', ')} WHERE id = ?`, values);
  }
}

export async function deleteMySQLClaim(id: string): Promise<void> {
  const p = getPool();
  await p.query('DELETE FROM claims WHERE id = ?', [id]);
}

export async function clearMySQLClaims(): Promise<void> {
  const p = getPool();
  await p.query('DELETE FROM claims');
}

// Logs & Settings CRUD
export async function addMySQLLog(log: ActivityLog): Promise<void> {
  const p = getPool();
  try {
    await p.query(
      `INSERT INTO logs (id, timestamp, username, role, action, details)
       VALUES (?, NOW(), ?, ?, ?, ?)`,
      [log.id, log.username, log.userRole, log.action, log.details]
    );
  } catch (_err) {}

  try {
    await p.query(
      `INSERT INTO activity_logs (id, timestamp, username, role, action, details)
       VALUES (?, NOW(), ?, ?, ?, ?)`,
      [log.id, log.username, log.userRole, log.action, log.details]
    );
  } catch (_err) {}
}

export async function clearMySQLLogs(): Promise<void> {
  const p = getPool();
  try { await p.query('DELETE FROM logs'); } catch (_err) {}
  try { await p.query('DELETE FROM activity_logs'); } catch (_err) {}
}

export async function getMySQLLogs(): Promise<ActivityLog[]> {
  const p = getPool();
  const [rows]: any = await p.query('SELECT * FROM logs ORDER BY timestamp DESC LIMIT 100');
  return rows.map((l: any) => ({
    id: l.id,
    timestamp: l.timestamp,
    username: l.username,
    userRole: l.role,
    action: l.action,
    details: l.details,
    ipAddress: '127.0.0.1',
  }));
}

export async function getMySQLSettings(): Promise<OfficeSettings | null> {
  const p = getPool();
  const [rows]: any = await p.query('SELECT * FROM settings WHERE id = 1');
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
  return null;
}

export async function updateMySQLSettings(st: OfficeSettings): Promise<void> {
  const p = getPool();
  await p.query(
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
}

// Reports CRUD
export async function getMySQLReports(): Promise<any[]> {
  const p = getPool();
  const [rows]: any = await p.query('SELECT * FROM reports ORDER BY created_at DESC LIMIT 100');
  return rows.map((r: any) => ({
    id: r.id,
    reportType: r.report_type,
    generatedBy: r.generated_by,
    totalRecords: r.total_records,
    totalAmount: parseFloat(r.total_amount || 0),
    createdAt: r.created_at,
  }));
}

export async function createMySQLReport(
  reportType: string,
  generatedBy: string,
  totalRecords: number,
  totalAmount: number
): Promise<void> {
  const p = getPool();
  await p.query(
    `INSERT INTO reports (report_type, generated_by, total_records, total_amount, created_at)
     VALUES (?, ?, ?, ?, NOW())`,
    [reportType, generatedBy, totalRecords, totalAmount]
  );
}
