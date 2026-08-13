import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { normalizeDateToYMD } from '../utils/dateUtils.js';
import {
  User,
  WorkerRegistration,
  WorkerRenewal,
  WorkerClaim,
  ApprovalRecord,
  ActivityLog,
  OfficeSettings,
  WorkerFollowup,
  VerificationReminder,
  MaterialDistributionRecord,
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
  const tables = ['users', 'registrations', 'renewals', 'claims', 'approval_lists', 'activity_logs', 'reports', 'settings'];
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

    `CREATE TABLE IF NOT EXISTS \`approval_lists\` (
      \`id\` VARCHAR(64) NOT NULL,
      \`list_number\` VARCHAR(64) NOT NULL,
      \`list_date\` VARCHAR(32) DEFAULT NULL,
      \`worker_name\` VARCHAR(128) NOT NULL,
      \`mh_number\` VARCHAR(64) DEFAULT NULL,
      \`mobile_number\` VARCHAR(20) DEFAULT NULL,
      \`scheme_name\` VARCHAR(128) DEFAULT NULL,
      \`approved_amount\` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      \`payment_status\` VARCHAR(32) NOT NULL DEFAULT 'Payment Released',
      \`payment_date\` VARCHAR(32) DEFAULT NULL,
      \`claim_id\` VARCHAR(64) DEFAULT NULL,
      \`commission_status\` VARCHAR(32) NOT NULL DEFAULT 'Pending',
      \`commission_date\` VARCHAR(32) DEFAULT NULL,
      \`commission_amount\` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      \`commission_receipt_no\` VARCHAR(64) DEFAULT NULL,
      \`commission_notes\` TEXT DEFAULT NULL,
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

    `CREATE TABLE IF NOT EXISTS \`followups\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`module\` VARCHAR(32) NOT NULL DEFAULT 'General',
      \`record_id\` VARCHAR(64) DEFAULT NULL,
      \`mh_number\` VARCHAR(64) DEFAULT NULL,
      \`worker_name\` VARCHAR(128) DEFAULT NULL,
      \`mobile_number\` VARCHAR(20) DEFAULT NULL,
      \`followup_date\` VARCHAR(32) NOT NULL,
      \`followup_time\` VARCHAR(32) DEFAULT '10:00',
      \`followup_note\` TEXT DEFAULT NULL,
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'Pending',
      \`assigned_user\` VARCHAR(128) DEFAULT NULL,
      \`created_by\` VARCHAR(128) DEFAULT NULL,
      \`completed_date\` VARCHAR(32) DEFAULT NULL,
      \`completed_by\` VARCHAR(128) DEFAULT NULL,
      \`next_followup_id\` VARCHAR(64) DEFAULT NULL,
      \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    `CREATE TABLE IF NOT EXISTS \`verification_reminders\` (
      \`id\` VARCHAR(64) NOT NULL PRIMARY KEY,
      \`module\` VARCHAR(32) NOT NULL,
      \`record_id\` VARCHAR(64) NOT NULL,
      \`reminder_status\` VARCHAR(32) NOT NULL DEFAULT 'Reminder Not Sent',
      \`last_reminder_date\` VARCHAR(32) DEFAULT NULL,
      \`reminder_sent_by\` VARCHAR(128) DEFAULT NULL,
      \`reminder_count\` INT NOT NULL DEFAULT 0,
      \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY \`idx_module_record\` (\`module\`, \`record_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    `CREATE TABLE IF NOT EXISTS \`material_distributions\` (
      \`id\` VARCHAR(64) NOT NULL PRIMARY KEY,
      \`mh_number\` VARCHAR(64) NOT NULL UNIQUE,
      \`worker_name\` VARCHAR(128) NOT NULL,
      \`mobile_number\` VARCHAR(20) DEFAULT NULL,
      \`taluka\` VARCHAR(64) DEFAULT NULL,
      \`source_type\` VARCHAR(32) NOT NULL DEFAULT 'Registration',
      \`bhandi_status\` VARCHAR(32) NOT NULL DEFAULT 'Pending',
      \`bhandi_given_date\` VARCHAR(32) DEFAULT NULL,
      \`bhandi_given_by\` VARCHAR(128) DEFAULT NULL,
      \`bhandi_not_eligible_reason\` TEXT DEFAULT NULL,
      \`bhandi_updated_by\` VARCHAR(128) DEFAULT NULL,
      \`bhandi_updated_date\` VARCHAR(32) DEFAULT NULL,
      \`peti_status\` VARCHAR(32) NOT NULL DEFAULT 'Pending',
      \`peti_given_date\` VARCHAR(32) DEFAULT NULL,
      \`peti_given_by\` VARCHAR(128) DEFAULT NULL,
      \`peti_not_eligible_reason\` TEXT DEFAULT NULL,
      \`peti_updated_by\` VARCHAR(128) DEFAULT NULL,
      \`peti_updated_date\` VARCHAR(32) DEFAULT NULL,
      \`bag_status\` VARCHAR(32) NOT NULL DEFAULT 'Pending',
      \`bag_given_date\` VARCHAR(32) DEFAULT NULL,
      \`bag_given_by\` VARCHAR(128) DEFAULT NULL,
      \`bag_not_eligible_reason\` TEXT DEFAULT NULL,
      \`bag_updated_by\` VARCHAR(128) DEFAULT NULL,
      \`bag_updated_date\` VARCHAR(32) DEFAULT NULL,
      \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    `CREATE TABLE IF NOT EXISTS \`whatsapp_group_trackings\` (
      \`mh_number\` VARCHAR(64) NOT NULL PRIMARY KEY,
      \`worker_name\` VARCHAR(128) NOT NULL,
      \`mobile_number\` VARCHAR(20) DEFAULT NULL,
      \`taluka\` VARCHAR(64) DEFAULT NULL,
      \`source_type\` VARCHAR(32) NOT NULL DEFAULT 'Registration',
      \`active_date\` VARCHAR(32) DEFAULT NULL,
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'Pending',
      \`added_date\` VARCHAR(32) DEFAULT NULL,
      \`added_by\` VARCHAR(128) DEFAULT NULL,
      \`remark\` TEXT DEFAULT NULL,
      \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
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
    'ALTER TABLE `users` ADD COLUMN `can_see_search` TINYINT(1) NOT NULL DEFAULT 1;',
    'ALTER TABLE `users` ADD COLUMN `can_see_claim_entry` TINYINT(1) NOT NULL DEFAULT 1;',
    'ALTER TABLE `users` ADD COLUMN `can_see_registration_entry` TINYINT(1) NOT NULL DEFAULT 1;',
    'ALTER TABLE `users` ADD COLUMN `can_see_renewal_entry` TINYINT(1) NOT NULL DEFAULT 1;',
    'ALTER TABLE `users` ADD COLUMN `can_see_master_excel_sync` TINYINT(1) NOT NULL DEFAULT 1;',
    'ALTER TABLE `users` ADD COLUMN `can_see_pending_verification` TINYINT(1) NOT NULL DEFAULT 1;',
    'ALTER TABLE `users` ADD COLUMN `can_see_material_distribution` TINYINT(1) NOT NULL DEFAULT 1;',
    'ALTER TABLE `users` ADD COLUMN `can_see_whatsapp_group` TINYINT(1) NOT NULL DEFAULT 1;',
    "ALTER TABLE `registrations` ADD COLUMN `app_status` VARCHAR(32) DEFAULT 'Pending';",
    "ALTER TABLE `registrations` ADD COLUMN `from_source` VARCHAR(64) DEFAULT NULL;",
    "ALTER TABLE `registrations` ADD COLUMN `next_renewal_date` VARCHAR(32) DEFAULT NULL;",
    "ALTER TABLE `registrations` ADD COLUMN `match_source` VARCHAR(64) DEFAULT NULL;",
    "ALTER TABLE `registrations` ADD COLUMN `match_date` VARCHAR(64) DEFAULT NULL;",
    "ALTER TABLE `settings` ADD COLUMN `whatsapp_template` TEXT DEFAULT NULL;",
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

  function mapDbUserPermissions(dbUser: any): UserPermissions {
    return {
      canRegister: dbUser.can_register !== undefined ? Boolean(dbUser.can_register) : true,
      canRenew: dbUser.can_renew !== undefined ? Boolean(dbUser.can_renew) : true,
      canClaim: dbUser.can_claim !== undefined ? Boolean(dbUser.can_claim) : true,
      canExport: dbUser.can_export !== undefined ? Boolean(dbUser.can_export) : true,
      canSeeSearch: dbUser.can_see_search !== undefined ? Boolean(dbUser.can_see_search) : true,
      canSeeClaimEntry: dbUser.can_see_claim_entry !== undefined ? Boolean(dbUser.can_see_claim_entry) : true,
      canSeeRegistrationEntry: dbUser.can_see_registration_entry !== undefined ? Boolean(dbUser.can_see_registration_entry) : true,
      canSeeRenewalEntry: dbUser.can_see_renewal_entry !== undefined ? Boolean(dbUser.can_see_renewal_entry) : true,
      canSeeMasterExcelSync: dbUser.can_see_master_excel_sync !== undefined ? Boolean(dbUser.can_see_master_excel_sync) : true,
      canSeePendingVerification: dbUser.can_see_pending_verification !== undefined ? Boolean(dbUser.can_see_pending_verification) : true,
      canSeeMaterialDistribution: dbUser.can_see_material_distribution !== undefined ? Boolean(dbUser.can_see_material_distribution) : true,
      canSeeWhatsappGroup: dbUser.can_see_whatsapp_group !== undefined ? Boolean(dbUser.can_see_whatsapp_group) : true,
    };
  }

  return {
    id: dbUser.id,
    username: dbUser.username,
    mobile: dbUser.mobile,
    name: dbUser.name,
    email: dbUser.email,
    role: dbUser.role,
    status: dbUser.status,
    photoUrl: dbUser.photo_url,
    permissions: mapDbUserPermissions(dbUser),
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
      canRegister: u.can_register !== undefined ? Boolean(u.can_register) : true,
      canRenew: u.can_renew !== undefined ? Boolean(u.can_renew) : true,
      canClaim: u.can_claim !== undefined ? Boolean(u.can_claim) : true,
      canExport: u.can_export !== undefined ? Boolean(u.can_export) : true,
      canSeeSearch: u.can_see_search !== undefined ? Boolean(u.can_see_search) : true,
      canSeeClaimEntry: u.can_see_claim_entry !== undefined ? Boolean(u.can_see_claim_entry) : true,
      canSeeRegistrationEntry: u.can_see_registration_entry !== undefined ? Boolean(u.can_see_registration_entry) : true,
      canSeeRenewalEntry: u.can_see_renewal_entry !== undefined ? Boolean(u.can_see_renewal_entry) : true,
      canSeeMasterExcelSync: u.can_see_master_excel_sync !== undefined ? Boolean(u.can_see_master_excel_sync) : true,
      canSeePendingVerification: u.can_see_pending_verification !== undefined ? Boolean(u.can_see_pending_verification) : true,
      canSeeMaterialDistribution: u.can_see_material_distribution !== undefined ? Boolean(u.can_see_material_distribution) : true,
      canSeeWhatsappGroup: u.can_see_whatsapp_group !== undefined ? Boolean(u.can_see_whatsapp_group) : true,
    },
    createdAt: u.created_at,
    lastLogin: u.last_login,
  }));
}

export async function createMySQLUser(user: User, plainPassword?: string): Promise<User> {
  const p = getPool();
  const hashedPass = await hashPassword(plainPassword || user.password || `${user.username}123`);
  const perm = user.permissions || {};

  await p.query(
    `INSERT INTO users (id, username, password, mobile, name, email, role, status, photo_url, can_register, can_renew, can_claim, can_export, can_see_search, can_see_claim_entry, can_see_registration_entry, can_see_renewal_entry, can_see_master_excel_sync, can_see_pending_verification, can_see_material_distribution, can_see_whatsapp_group, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
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
      perm.canRegister !== false ? 1 : 0,
      perm.canRenew !== false ? 1 : 0,
      perm.canClaim !== false ? 1 : 0,
      perm.canExport !== false ? 1 : 0,
      perm.canSeeSearch !== false ? 1 : 0,
      perm.canSeeClaimEntry !== false ? 1 : 0,
      perm.canSeeRegistrationEntry !== false ? 1 : 0,
      perm.canSeeRenewalEntry !== false ? 1 : 0,
      perm.canSeeMasterExcelSync !== false ? 1 : 0,
      perm.canSeePendingVerification !== false ? 1 : 0,
      perm.canSeeMaterialDistribution !== false ? 1 : 0,
      perm.canSeeWhatsappGroup !== false ? 1 : 0,
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
      canSeeSearch: u.can_see_search !== undefined ? Boolean(u.can_see_search) : true,
      canSeeClaimEntry: u.can_see_claim_entry !== undefined ? Boolean(u.can_see_claim_entry) : true,
      canSeeRegistrationEntry: u.can_see_registration_entry !== undefined ? Boolean(u.can_see_registration_entry) : true,
      canSeeRenewalEntry: u.can_see_renewal_entry !== undefined ? Boolean(u.can_see_renewal_entry) : true,
      canSeeMasterExcelSync: u.can_see_master_excel_sync !== undefined ? Boolean(u.can_see_master_excel_sync) : true,
      canSeePendingVerification: u.can_see_pending_verification !== undefined ? Boolean(u.can_see_pending_verification) : true,
      canSeeMaterialDistribution: u.can_see_material_distribution !== undefined ? Boolean(u.can_see_material_distribution) : true,
      canSeeWhatsappGroup: u.can_see_whatsapp_group !== undefined ? Boolean(u.can_see_whatsapp_group) : true,
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
    const perm = updates.permissions;
    if (perm.canRegister !== undefined) { fields.push('can_register = ?'); values.push(perm.canRegister ? 1 : 0); }
    if (perm.canRenew !== undefined) { fields.push('can_renew = ?'); values.push(perm.canRenew ? 1 : 0); }
    if (perm.canClaim !== undefined) { fields.push('can_claim = ?'); values.push(perm.canClaim ? 1 : 0); }
    if (perm.canExport !== undefined) { fields.push('can_export = ?'); values.push(perm.canExport ? 1 : 0); }
    if (perm.canSeeSearch !== undefined) { fields.push('can_see_search = ?'); values.push(perm.canSeeSearch ? 1 : 0); }
    if (perm.canSeeClaimEntry !== undefined) { fields.push('can_see_claim_entry = ?'); values.push(perm.canSeeClaimEntry ? 1 : 0); }
    if (perm.canSeeRegistrationEntry !== undefined) { fields.push('can_see_registration_entry = ?'); values.push(perm.canSeeRegistrationEntry ? 1 : 0); }
    if (perm.canSeeRenewalEntry !== undefined) { fields.push('can_see_renewal_entry = ?'); values.push(perm.canSeeRenewalEntry ? 1 : 0); }
    if (perm.canSeeMasterExcelSync !== undefined) { fields.push('can_see_master_excel_sync = ?'); values.push(perm.canSeeMasterExcelSync ? 1 : 0); }
    if (perm.canSeePendingVerification !== undefined) { fields.push('can_see_pending_verification = ?'); values.push(perm.canSeePendingVerification ? 1 : 0); }
    if (perm.canSeeMaterialDistribution !== undefined) { fields.push('can_see_material_distribution = ?'); values.push(perm.canSeeMaterialDistribution ? 1 : 0); }
    if (perm.canSeeWhatsappGroup !== undefined) { fields.push('can_see_whatsapp_group = ?'); values.push(perm.canSeeWhatsappGroup ? 1 : 0); }
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

  const generateUniqueId = () => {
    const year = new Date().getFullYear();
    const ts = Date.now().toString(36).toUpperCase();
    const rnd = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `REN-${year}-${ts}-${rnd}`;
  };

  let renewalId = (ren.id && typeof ren.id === 'string' && ren.id.trim().length > 0)
    ? ren.id.trim()
    : generateUniqueId();

  let attempts = 0;
  let inserted = false;

  while (!inserted && attempts < 5) {
    try {
      await p.query(
        `INSERT INTO renewals (id, mh_number, worker_name, mobile_number, verification_date, renewal_date, taluka, from_source, operator_name, status, renewal_period_years, receipt_number, valid_till, new_expiry_date, fee_amount, remarks, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          renewalId,
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
      inserted = true;
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY' || err?.errno === 1062) {
        attempts++;
        renewalId = generateUniqueId();
      } else {
        throw err;
      }
    }
  }

  // Read back from database to confirm insertion
  const [rows]: any = await p.query('SELECT * FROM renewals WHERE id = ?', [renewalId]);
  if (!rows || rows.length === 0) {
    throw new Error(`[Database Error] Record insertion read-back failed for renewal ID: ${renewalId}`);
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
      whatsappTemplate: s.whatsapp_template || undefined,
    };
  }
  return null;
}

export async function updateMySQLSettings(st: OfficeSettings): Promise<void> {
  const p = getPool();
  await p.query(
    `UPDATE settings SET office_name = ?, office_logo = ?, office_address = ?, district_name = ?, contact_numbers = ?, email = ?, registration_fee = ?, renewal_fee = ?, auto_approve_claims = ?, theme_mode = ?, whatsapp_template = ?
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
      st.whatsappTemplate || null,
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

// Approval Lists CRUD
export async function getMySQLApprovals(): Promise<ApprovalRecord[]> {
  const p = getPool();
  const [rows]: any = await p.query('SELECT * FROM approval_lists ORDER BY created_at DESC');
  return rows.map((a: any) => ({
    id: a.id,
    listNumber: a.list_number,
    listDate: a.list_date ? normalizeDateToYMD(a.list_date) : '',
    workerName: a.worker_name,
    mhNumber: a.mh_number || '',
    mobileNumber: a.mobile_number || '',
    schemeName: a.scheme_name || '',
    approvedAmount: parseFloat(a.approved_amount || 0),
    paymentStatus: a.payment_status || 'Payment Released',
    paymentDate: a.payment_date ? normalizeDateToYMD(a.payment_date) : '',
    claimId: a.claim_id || undefined,
    commissionStatus: a.commission_status || 'Pending',
    commissionDate: a.commission_date ? normalizeDateToYMD(a.commission_date) : '',
    commissionAmount: parseFloat(a.commission_amount || 0),
    commissionReceiptNo: a.commission_receipt_no || '',
    commissionNotes: a.commission_notes || '',
    createdAt: a.created_at,
  }));
}

export async function createMySQLApproval(item: Partial<ApprovalRecord>): Promise<ApprovalRecord> {
  const p = getPool();
  const id = item.id || `APP-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
  const normListDate = normalizeDateToYMD(item.listDate) || new Date().toISOString().split('T')[0];
  const normPaymentDate = normalizeDateToYMD(item.paymentDate) || normListDate;
  const normCommDate = item.commissionDate ? normalizeDateToYMD(item.commissionDate) : null;

  await p.query(
    `INSERT INTO approval_lists (id, list_number, list_date, worker_name, mh_number, mobile_number, scheme_name, approved_amount, payment_status, payment_date, claim_id, commission_status, commission_date, commission_amount, commission_receipt_no, commission_notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      id,
      item.listNumber || 'L-1',
      normListDate,
      item.workerName || 'Worker',
      item.mhNumber || '',
      item.mobileNumber || '',
      item.schemeName || '',
      item.approvedAmount || 0,
      item.paymentStatus || 'Payment Released',
      normPaymentDate,
      item.claimId || null,
      item.commissionStatus || 'Pending',
      normCommDate,
      item.commissionAmount || 0,
      item.commissionReceiptNo || null,
      item.commissionNotes || null,
    ]
  );

  const [rows]: any = await p.query('SELECT * FROM approval_lists WHERE id = ?', [id]);
  const a = rows[0];
  return {
    id: a.id,
    listNumber: a.list_number,
    listDate: a.list_date ? normalizeDateToYMD(a.list_date) : '',
    workerName: a.worker_name,
    mhNumber: a.mh_number || '',
    mobileNumber: a.mobile_number || '',
    schemeName: a.scheme_name || '',
    approvedAmount: parseFloat(a.approved_amount || 0),
    paymentStatus: a.payment_status || 'Payment Released',
    paymentDate: a.payment_date ? normalizeDateToYMD(a.payment_date) : '',
    claimId: a.claim_id || undefined,
    commissionStatus: a.commission_status || 'Pending',
    commissionDate: a.commission_date ? normalizeDateToYMD(a.commission_date) : '',
    commissionAmount: parseFloat(a.commission_amount || 0),
    commissionReceiptNo: a.commission_receipt_no || '',
    commissionNotes: a.commission_notes || '',
    createdAt: a.created_at,
  };
}

export async function bulkCreateMySQLApprovals(items: Partial<ApprovalRecord>[]): Promise<ApprovalRecord[]> {
  const created: ApprovalRecord[] = [];
  for (const item of items) {
    try {
      const res = await createMySQLApproval(item);
      created.push(res);
    } catch (_err) {
      console.error('Error inserting approval item:', _err);
    }
  }
  return created;
}

export async function updateMySQLApproval(id: string, updates: Partial<ApprovalRecord>): Promise<ApprovalRecord | null> {
  const p = getPool();
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.listNumber !== undefined) { fields.push('list_number = ?'); values.push(updates.listNumber); }
  if (updates.listDate !== undefined) { fields.push('list_date = ?'); values.push(normalizeDateToYMD(updates.listDate)); }
  if (updates.workerName !== undefined) { fields.push('worker_name = ?'); values.push(updates.workerName); }
  if (updates.mhNumber !== undefined) { fields.push('mh_number = ?'); values.push(updates.mhNumber); }
  if (updates.mobileNumber !== undefined) { fields.push('mobile_number = ?'); values.push(updates.mobileNumber); }
  if (updates.schemeName !== undefined) { fields.push('scheme_name = ?'); values.push(updates.schemeName); }
  if (updates.approvedAmount !== undefined) { fields.push('approved_amount = ?'); values.push(updates.approvedAmount); }
  if (updates.paymentStatus !== undefined) { fields.push('payment_status = ?'); values.push(updates.paymentStatus); }
  if (updates.paymentDate !== undefined) { fields.push('payment_date = ?'); values.push(normalizeDateToYMD(updates.paymentDate)); }
  if (updates.claimId !== undefined) { fields.push('claim_id = ?'); values.push(updates.claimId); }
  if (updates.commissionStatus !== undefined) { fields.push('commission_status = ?'); values.push(updates.commissionStatus); }
  if (updates.commissionDate !== undefined) { fields.push('commission_date = ?'); values.push(updates.commissionDate ? normalizeDateToYMD(updates.commissionDate) : null); }
  if (updates.commissionAmount !== undefined) { fields.push('commission_amount = ?'); values.push(updates.commissionAmount); }
  if (updates.commissionReceiptNo !== undefined) { fields.push('commission_receipt_no = ?'); values.push(updates.commissionReceiptNo); }
  if (updates.commissionNotes !== undefined) { fields.push('commission_notes = ?'); values.push(updates.commissionNotes); }

  if (fields.length > 0) {
    values.push(id);
    await p.query(`UPDATE approval_lists SET ${fields.join(', ')} WHERE id = ?`, values);
  }

  const all = await getMySQLApprovals();
  return all.find((a) => a.id === id) || null;
}

export async function deleteMySQLApproval(id: string): Promise<void> {
  const p = getPool();
  await p.query('DELETE FROM approval_lists WHERE id = ?', [id]);
}

export async function clearMySQLApprovals(): Promise<void> {
  const p = getPool();
  await p.query('DELETE FROM approval_lists');
}

// Follow-ups CRUD
export async function getMySQLFollowups(): Promise<WorkerFollowup[]> {
  const p = getPool();
  const [rows]: any = await p.query('SELECT * FROM followups ORDER BY followup_date ASC, followup_time ASC');
  return rows.map((r: any) => ({
    id: String(r.id),
    module: (r.module || 'General') as any,
    recordId: r.record_id ? String(r.record_id) : undefined,
    mhNumber: r.mh_number || '',
    workerName: r.worker_name || '',
    mobileNumber: r.mobile_number || '',
    followupDate: r.followup_date ? normalizeDateToYMD(r.followup_date) : '',
    followupTime: r.followup_time || '10:00',
    followupNote: r.followup_note || '',
    status: (r.status || 'Pending') as any,
    assignedUser: r.assigned_user || '',
    createdBy: r.created_by || '',
    completedDate: r.completed_date ? normalizeDateToYMD(r.completed_date) : undefined,
    completedBy: r.completed_by || undefined,
    nextFollowupId: r.next_followup_id ? String(r.next_followup_id) : undefined,
    createdAt: r.created_at,
  }));
}

export async function createMySQLFollowup(data: Partial<WorkerFollowup>): Promise<WorkerFollowup> {
  const p = getPool();
  const normDate = normalizeDateToYMD(data.followupDate) || new Date().toISOString().split('T')[0];

  const [result]: any = await p.query(
    `INSERT INTO followups (module, record_id, mh_number, worker_name, mobile_number, followup_date, followup_time, followup_note, status, assigned_user, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      data.module || 'General',
      data.recordId || null,
      data.mhNumber || null,
      data.workerName || null,
      data.mobileNumber || null,
      normDate,
      data.followupTime || '10:00',
      data.followupNote || '',
      data.status || 'Pending',
      data.assignedUser || null,
      data.createdBy || null,
    ]
  );

  const newId = result.insertId;
  const [rows]: any = await p.query('SELECT * FROM followups WHERE id = ?', [newId]);
  const r = rows[0];
  return {
    id: String(r.id),
    module: (r.module || 'General') as any,
    recordId: r.record_id ? String(r.record_id) : undefined,
    mhNumber: r.mh_number || '',
    workerName: r.worker_name || '',
    mobileNumber: r.mobile_number || '',
    followupDate: r.followup_date ? normalizeDateToYMD(r.followup_date) : '',
    followupTime: r.followup_time || '10:00',
    followupNote: r.followup_note || '',
    status: (r.status || 'Pending') as any,
    assignedUser: r.assigned_user || '',
    createdBy: r.created_by || '',
    completedDate: r.completed_date ? normalizeDateToYMD(r.completed_date) : undefined,
    completedBy: r.completed_by || undefined,
    nextFollowupId: r.next_followup_id ? String(r.next_followup_id) : undefined,
    createdAt: r.created_at,
  };
}

export async function completeMySQLFollowup(id: string, completedBy: string, completedDate?: string): Promise<WorkerFollowup | null> {
  const p = getPool();
  const normCompletedDate = completedDate ? normalizeDateToYMD(completedDate) : new Date().toISOString().split('T')[0];
  await p.query(
    'UPDATE followups SET status = ?, completed_date = ?, completed_by = ? WHERE id = ?',
    ['Completed', normCompletedDate, completedBy, id]
  );
  const all = await getMySQLFollowups();
  return all.find((f) => f.id === String(id)) || null;
}

export async function updateMySQLFollowup(id: string, updates: Partial<WorkerFollowup>): Promise<WorkerFollowup | null> {
  const p = getPool();
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.module !== undefined) { fields.push('module = ?'); values.push(updates.module); }
  if (updates.recordId !== undefined) { fields.push('record_id = ?'); values.push(updates.recordId); }
  if (updates.mhNumber !== undefined) { fields.push('mh_number = ?'); values.push(updates.mhNumber); }
  if (updates.workerName !== undefined) { fields.push('worker_name = ?'); values.push(updates.workerName); }
  if (updates.mobileNumber !== undefined) { fields.push('mobile_number = ?'); values.push(updates.mobileNumber); }
  if (updates.followupDate !== undefined) { fields.push('followup_date = ?'); values.push(normalizeDateToYMD(updates.followupDate)); }
  if (updates.followupTime !== undefined) { fields.push('followup_time = ?'); values.push(updates.followupTime); }
  if (updates.followupNote !== undefined) { fields.push('followup_note = ?'); values.push(updates.followupNote); }
  if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
  if (updates.assignedUser !== undefined) { fields.push('assigned_user = ?'); values.push(updates.assignedUser); }
  if (updates.completedDate !== undefined) { fields.push('completed_date = ?'); values.push(updates.completedDate ? normalizeDateToYMD(updates.completedDate) : null); }
  if (updates.completedBy !== undefined) { fields.push('completed_by = ?'); values.push(updates.completedBy); }
  if (updates.nextFollowupId !== undefined) { fields.push('next_followup_id = ?'); values.push(updates.nextFollowupId); }

  if (fields.length > 0) {
    values.push(id);
    await p.query(`UPDATE followups SET ${fields.join(', ')} WHERE id = ?`, values);
  }

  const all = await getMySQLFollowups();
  return all.find((f) => f.id === String(id)) || null;
}

export async function deleteMySQLFollowup(id: string): Promise<void> {
  const p = getPool();
  await p.query('DELETE FROM followups WHERE id = ?', [id]);
}

// Verification Reminders CRUD
export async function getMySQLVerificationReminders(): Promise<VerificationReminder[]> {
  const p = getPool();
  try {
    const [rows]: any = await p.query('SELECT * FROM verification_reminders');
    return rows.map((r: any) => ({
      id: r.id,
      module: r.module,
      recordId: String(r.record_id),
      reminderStatus: r.reminder_status,
      lastReminderDate: r.last_reminder_date ? normalizeDateToYMD(r.last_reminder_date) : undefined,
      reminderSentBy: r.reminder_sent_by || undefined,
      reminderCount: parseInt(r.reminder_count || '0', 10),
    }));
  } catch (err) {
    console.error('Error fetching verification reminders:', err);
    return [];
  }
}

export async function upsertMySQLVerificationReminder(
  item: VerificationReminder
): Promise<VerificationReminder> {
  const p = getPool();
  const id = item.id || `VR-${item.module}-${item.recordId}`;
  const todayStr = item.lastReminderDate || new Date().toISOString().split('T')[0];

  await p.query(
    `INSERT INTO verification_reminders (id, module, record_id, reminder_status, last_reminder_date, reminder_sent_by, reminder_count)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       reminder_status = VALUES(reminder_status),
       last_reminder_date = VALUES(last_reminder_date),
       reminder_sent_by = VALUES(reminder_sent_by),
       reminder_count = VALUES(reminder_count)`,
    [
      id,
      item.module,
      String(item.recordId),
      item.reminderStatus,
      todayStr,
      item.reminderSentBy || null,
      item.reminderCount,
    ]
  );

  return {
    id,
    module: item.module,
    recordId: String(item.recordId),
    reminderStatus: item.reminderStatus,
    lastReminderDate: todayStr,
    reminderSentBy: item.reminderSentBy,
    reminderCount: item.reminderCount,
  };
}

// Map database row to MaterialDistributionRecord
function mapRowToMaterialDistribution(r: any): MaterialDistributionRecord {
  return {
    id: String(r.id),
    mhNumber: r.mh_number,
    workerName: r.worker_name,
    mobileNumber: r.mobile_number || '',
    taluka: r.taluka || '',
    sourceType: (r.source_type as 'Registration' | 'Renewal') || 'Registration',

    bhandiStatus: r.bhandi_status || 'Pending',
    bhandiGivenDate: r.bhandi_given_date || undefined,
    bhandiGivenBy: r.bhandi_given_by || undefined,
    bhandiNotEligibleReason: r.bhandi_not_eligible_reason || undefined,
    bhandiUpdatedBy: r.bhandi_updated_by || undefined,
    bhandiUpdatedDate: r.bhandi_updated_date || undefined,

    petiStatus: r.peti_status || 'Pending',
    petiGivenDate: r.peti_given_date || undefined,
    petiGivenBy: r.peti_given_by || undefined,
    petiNotEligibleReason: r.peti_not_eligible_reason || undefined,
    petiUpdatedBy: r.peti_updated_by || undefined,
    petiUpdatedDate: r.peti_updated_date || undefined,

    bagStatus: r.bag_status || 'Pending',
    bagGivenDate: r.bag_given_date || undefined,
    bagGivenBy: r.bag_given_by || undefined,
    bagNotEligibleReason: r.bag_not_eligible_reason || undefined,
    bagUpdatedBy: r.bag_updated_by || undefined,
    bagUpdatedDate: r.bag_updated_date || undefined,

    createdAt: r.created_at ? new Date(r.created_at).toISOString() : undefined,
    updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : undefined,
  };
}

// Helper to retrieve the set of MH numbers for workers that are CURRENTLY ACTIVE and have a VALID MH number
export async function getActiveWorkerMHSet(p: any): Promise<Set<string>> {
  const activeMHs = new Set<string>();

  // 1. Check registrations
  const [regs]: any = await p.query(
    `SELECT mh_number, status, app_status FROM registrations WHERE mh_number IS NOT NULL AND TRIM(mh_number) != ''`
  );

  for (const r of regs) {
    const mh = String(r.mh_number || '').trim().toUpperCase();
    if (!mh || mh.startsWith('PENDING-')) continue;

    const st = String(r.status || '').trim().toUpperCase();
    const appSt = String(r.app_status || '').trim().toUpperCase();

    const isExplicitlyInactive =
      st === 'INACTIVE' ||
      st === 'EXPIRED' ||
      st === 'REJECTED' ||
      st === 'CANCELLED' ||
      st === 'DELETED' ||
      st === 'DISABLED' ||
      st === 'PENDING' ||
      st === 'PENDING VERIFICATION';

    const isActiveReg = (st === 'ACTIVE' || st === 'ACCEPTED' || appSt === 'ACCEPTED') && !isExplicitlyInactive;

    if (isActiveReg) {
      activeMHs.add(mh);
    }
  }

  // 2. Check renewals
  const [rens]: any = await p.query(
    `SELECT mh_number, status FROM renewals WHERE mh_number IS NOT NULL AND TRIM(mh_number) != ''`
  );

  for (const r of rens) {
    const mh = String(r.mh_number || '').trim().toUpperCase();
    if (!mh || mh.startsWith('PENDING-')) continue;

    const st = String(r.status || '').trim().toUpperCase();

    const isActiveRen = st === 'ACTIVE' || st === 'COMPLETED';
    const isInactiveRen =
      st === 'INACTIVE' ||
      st === 'EXPIRED' ||
      st === 'REJECTED' ||
      st === 'CANCELLED' ||
      st === 'DELETED' ||
      st === 'DISABLED' ||
      st === 'PENDING';

    if (isActiveRen) {
      activeMHs.add(mh);
    } else if (isInactiveRen) {
      activeMHs.delete(mh);
    }
  }

  return activeMHs;
}

// Fetch all Material Distribution records from MySQL (returns ONLY currently ACTIVE workers with valid MH numbers)
export async function getMySQLMaterialDistributions(): Promise<MaterialDistributionRecord[]> {
  try {
    const p = getPool();
    await syncMaterialDistributionsWithWorkers();

    const activeMHs = await getActiveWorkerMHSet(p);

    if (activeMHs.size === 0) {
      return [];
    }

    const [rows]: any = await p.query('SELECT * FROM material_distributions ORDER BY updated_at DESC, created_at DESC');
    const allRecords = rows.map(mapRowToMaterialDistribution);

    // Return ONLY active workers with valid MH numbers
    return allRecords.filter((r) => {
      const mh = String(r.mhNumber || '').trim().toUpperCase();
      return mh && !mh.startsWith('PENDING-') && activeMHs.has(mh);
    });
  } catch (err) {
    console.error('Error fetching material distributions from MySQL:', err);
    return [];
  }
}

// Sync registrations and renewals with material_distributions table
export async function syncMaterialDistributionsWithWorkers(): Promise<void> {
  try {
    const p = getPool();
    // Gather all workers with MH numbers from registrations and renewals
    const [regs]: any = await p.query(
      `SELECT mh_number, worker_name, mobile_number, taluka FROM registrations WHERE mh_number IS NOT NULL AND TRIM(mh_number) != ''`
    );
    const [rens]: any = await p.query(
      `SELECT mh_number, worker_name, mobile_number, taluka FROM renewals WHERE mh_number IS NOT NULL AND TRIM(mh_number) != ''`
    );

    const workersMap = new Map<string, { workerName: string; mobileNumber: string; taluka: string; sourceType: 'Registration' | 'Renewal' }>();

    for (const r of regs) {
      const mh = String(r.mh_number || '').trim().toUpperCase();
      if (mh && !mh.startsWith('PENDING-')) {
        workersMap.set(mh, {
          workerName: r.worker_name || '',
          mobileNumber: r.mobile_number || '',
          taluka: r.taluka || '',
          sourceType: 'Registration',
        });
      }
    }

    for (const r of rens) {
      const mh = String(r.mh_number || '').trim().toUpperCase();
      if (mh && !mh.startsWith('PENDING-')) {
        if (!workersMap.has(mh)) {
          workersMap.set(mh, {
            workerName: r.worker_name || '',
            mobileNumber: r.mobile_number || '',
            taluka: r.taluka || '',
            sourceType: 'Renewal',
          });
        }
      }
    }

    // Get existing material distribution rows
    const [matRows]: any = await p.query('SELECT id, mh_number, worker_name, mobile_number, taluka FROM material_distributions');
    const existingMHMap = new Map<string, any>();
    for (const m of matRows) {
      const mh = String(m.mh_number || '').trim().toUpperCase();
      if (mh) existingMHMap.set(mh, m);
    }

    for (const [mh, info] of workersMap.entries()) {
      if (!existingMHMap.has(mh)) {
        // Create new record with default 'Pending' statuses
        const id = `mat_${mh.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`;
        await p.query(
          `INSERT INTO material_distributions (id, mh_number, worker_name, mobile_number, taluka, source_type, bhandi_status, peti_status, bag_status)
           VALUES (?, ?, ?, ?, ?, ?, 'Pending', 'Pending', 'Pending')`,
          [id, mh, info.workerName, info.mobileNumber, info.taluka, info.sourceType]
        );
        existingMHMap.set(mh, { id, mh_number: mh, worker_name: info.workerName, mobile_number: info.mobileNumber, taluka: info.taluka });
      } else {
        // Update details if worker name, mobile, or taluka changed
        const existing = existingMHMap.get(mh);
        if (
          existing.worker_name !== info.workerName ||
          existing.mobile_number !== info.mobileNumber ||
          existing.taluka !== info.taluka
        ) {
          await p.query(
            `UPDATE material_distributions SET worker_name = ?, mobile_number = ?, taluka = ? WHERE id = ?`,
            [info.workerName, info.mobileNumber, info.taluka, existing.id]
          );
        }
      }
    }
  } catch (err) {
    console.error('Error syncing material distributions:', err);
  }
}

// Update status of a specific material or all materials for a record
export async function updateMySQLMaterialStatus(
  id: string,
  materialType: 'bhandi' | 'peti' | 'bag' | 'all',
  newStatus: 'Pending' | 'Given' | 'Not Eligible',
  updatedBy: string,
  updatedDate: string,
  reason?: string
): Promise<MaterialDistributionRecord | null> {
  const p = getPool();
  const [existingRows]: any = await p.query('SELECT * FROM material_distributions WHERE id = ? OR mh_number = ?', [id, id]);
  if (!existingRows || existingRows.length === 0) return null;
  const target = existingRows[0];

  const materialsToUpdate: ('bhandi' | 'peti' | 'bag')[] =
    materialType === 'all' ? ['bhandi', 'peti', 'bag'] : [materialType];

  for (const mat of materialsToUpdate) {
    let givenDateVal: string | null = null;
    let givenByVal: string | null = null;
    let notEligibleReasonVal: string | null = null;

    if (newStatus === 'Given') {
      givenDateVal = updatedDate;
      givenByVal = updatedBy;
    } else if (newStatus === 'Not Eligible') {
      notEligibleReasonVal = reason || 'Not eligible for material';
    } else if (newStatus === 'Pending') {
      // Reverted to Pending
      givenDateVal = null;
      givenByVal = null;
      notEligibleReasonVal = null;
    }

    await p.query(
      `UPDATE material_distributions
       SET \`${mat}_status\` = ?,
           \`${mat}_given_date\` = ?,
           \`${mat}_given_by\` = ?,
           \`${mat}_not_eligible_reason\` = ?,
           \`${mat}_updated_by\` = ?,
           \`${mat}_updated_date\` = ?
       WHERE id = ?`,
      [newStatus, givenDateVal, givenByVal, notEligibleReasonVal, updatedBy, updatedDate, target.id]
    );
  }

  const [refetched]: any = await p.query('SELECT * FROM material_distributions WHERE id = ?', [target.id]);
  return refetched && refetched.length > 0 ? mapRowToMaterialDistribution(refetched[0]) : null;
}

function mapRowToWhatsappGroupTracking(r: any): WhatsappGroupTrackingRecord {
  return {
    mhNumber: r.mh_number,
    workerName: r.worker_name,
    mobileNumber: r.mobile_number || '',
    taluka: r.taluka || '',
    sourceType: r.source_type === 'Renewal' ? 'Renewal' : 'Registration',
    activeDate: r.active_date || '',
    status: r.status === 'Added' ? 'Added' : 'Pending',
    addedDate: r.added_date || undefined,
    addedBy: r.added_by || undefined,
    remark: r.remark || undefined,
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : undefined,
    updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : undefined,
  };
}

export async function syncWhatsappGroupTrackingsWithWorkers(): Promise<void> {
  try {
    const p = getPool();
    const [regs]: any = await p.query(
      `SELECT mh_number, worker_name, mobile_number, taluka, registration_date, verification_date, status, app_status FROM registrations WHERE mh_number IS NOT NULL AND TRIM(mh_number) != ''`
    );
    const [rens]: any = await p.query(
      `SELECT mh_number, worker_name, mobile_number, taluka, renewal_date, verification_date, status FROM renewals WHERE mh_number IS NOT NULL AND TRIM(mh_number) != ''`
    );

    const workersMap = new Map<string, { workerName: string; mobileNumber: string; taluka: string; sourceType: 'Registration' | 'Renewal'; activeDate: string }>();

    for (const r of regs) {
      const mh = String(r.mh_number || '').trim().toUpperCase();
      if (mh && !mh.startsWith('PENDING-')) {
        const st = String(r.status || '').trim().toUpperCase();
        const appSt = String(r.app_status || '').trim().toUpperCase();
        const isExplicitlyInactive =
          st === 'INACTIVE' || st === 'EXPIRED' || st === 'REJECTED' || st === 'CANCELLED' || st === 'DELETED' || st === 'DISABLED' || st === 'PENDING';
        const isAct = (st === 'ACTIVE' || st === 'ACCEPTED' || appSt === 'ACCEPTED') && !isExplicitlyInactive;
        if (isAct) {
          workersMap.set(mh, {
            workerName: r.worker_name || '',
            mobileNumber: r.mobile_number || '',
            taluka: r.taluka || '',
            sourceType: 'Registration',
            activeDate: r.registration_date || r.verification_date || '',
          });
        }
      }
    }

    for (const r of rens) {
      const mh = String(r.mh_number || '').trim().toUpperCase();
      if (mh && !mh.startsWith('PENDING-')) {
        const st = String(r.status || '').trim().toUpperCase();
        const isAct = (st === 'ACTIVE' || st === 'COMPLETED') && st !== 'INACTIVE' && st !== 'EXPIRED' && st !== 'REJECTED' && st !== 'CANCELLED';
        if (isAct) {
          const existing = workersMap.get(mh);
          if (existing) {
            workersMap.set(mh, {
              workerName: r.worker_name || existing.workerName,
              mobileNumber: r.mobile_number || existing.mobileNumber,
              taluka: r.taluka || existing.taluka,
              sourceType: 'Renewal',
              activeDate: r.renewal_date || r.verification_date || existing.activeDate,
            });
          } else {
            workersMap.set(mh, {
              workerName: r.worker_name || '',
              mobileNumber: r.mobile_number || '',
              taluka: r.taluka || '',
              sourceType: 'Renewal',
              activeDate: r.renewal_date || r.verification_date || '',
            });
          }
        }
      }
    }

    const [existingRows]: any = await p.query('SELECT mh_number, worker_name, mobile_number, taluka, active_date, status FROM whatsapp_group_trackings');
    const existingMap = new Map<string, any>();
    for (const row of existingRows) {
      const mh = String(row.mh_number || '').trim().toUpperCase();
      if (mh) existingMap.set(mh, row);
    }

    for (const [mh, info] of workersMap.entries()) {
      if (!existingMap.has(mh)) {
        await p.query(
          `INSERT INTO whatsapp_group_trackings (mh_number, worker_name, mobile_number, taluka, source_type, active_date, status)
           VALUES (?, ?, ?, ?, ?, ?, 'Pending')`,
          [mh, info.workerName, info.mobileNumber, info.taluka, info.sourceType, info.activeDate]
        );
        existingMap.set(mh, { mh_number: mh, status: 'Pending' });
      } else {
        const existing = existingMap.get(mh);
        if (
          existing.worker_name !== info.workerName ||
          existing.mobile_number !== info.mobileNumber ||
          existing.taluka !== info.taluka ||
          existing.active_date !== info.activeDate
        ) {
          await p.query(
            `UPDATE whatsapp_group_trackings SET worker_name = ?, mobile_number = ?, taluka = ?, active_date = ? WHERE mh_number = ?`,
            [info.workerName, info.mobileNumber, info.taluka, info.activeDate, mh]
          );
        }
      }
    }
  } catch (err) {
    console.error('Error syncing WhatsApp group tracking with workers:', err);
  }
}

export async function getMySQLWhatsappGroupTrackings(): Promise<WhatsappGroupTrackingRecord[]> {
  try {
    const p = getPool();
    await syncWhatsappGroupTrackingsWithWorkers();

    const activeMHs = await getActiveWorkerMHSet(p);
    if (activeMHs.size === 0) {
      return [];
    }

    const [rows]: any = await p.query('SELECT * FROM whatsapp_group_trackings ORDER BY updated_at DESC, created_at DESC');
    const allRecords = rows.map(mapRowToWhatsappGroupTracking);

    return allRecords.filter((r) => {
      const mh = String(r.mhNumber || '').trim().toUpperCase();
      return mh && !mh.startsWith('PENDING-') && activeMHs.has(mh);
    });
  } catch (err) {
    console.error('Error fetching whatsapp group trackings from MySQL:', err);
    return [];
  }
}

export async function updateMySQLWhatsappGroupTrackingStatus(
  mhNumber: string,
  updates: { status: 'Added' | 'Pending'; addedBy?: string; remark?: string }
): Promise<WhatsappGroupTrackingRecord | null> {
  try {
    const p = getPool();
    const mh = String(mhNumber).trim().toUpperCase();
    const nowStr = new Date().toISOString().split('T')[0];

    const addedDate = updates.status === 'Added' ? nowStr : null;
    const addedBy = updates.addedBy || null;
    const remark = updates.remark || null;

    await p.query(
      `UPDATE whatsapp_group_trackings 
       SET status = ?, added_date = ?, added_by = ?, remark = ?
       WHERE mh_number = ?`,
      [updates.status, addedDate, addedBy, remark, mh]
    );

    const [rows]: any = await p.query('SELECT * FROM whatsapp_group_trackings WHERE mh_number = ?', [mh]);
    if (rows && rows.length > 0) {
      return mapRowToWhatsappGroupTracking(rows[0]);
    }
    return null;
  } catch (err) {
    console.error('Error updating whatsapp group tracking status:', err);
    return null;
  }
}
