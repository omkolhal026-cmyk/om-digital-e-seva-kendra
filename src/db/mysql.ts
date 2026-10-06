import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { normalizeDateToYMD } from '../utils/dateUtils.js';
import {
  normalizeRenewalYear,
  getFinancialYearFromDate,
  getNextRenewalYear,
  compareRenewalYearsDesc,
} from '../utils/renewalYearUtils.js';
import {
  User,
  UserPermissions,
  WorkerRegistration,
  WorkerRenewal,
  WorkerClaim,
  OldWorkerClaim,
  ApprovalRecord,
  ActivityLog,
  OfficeSettings,
  WorkerFollowup,
  VerificationReminder,
  MaterialDistributionRecord,
  MaterialInventoryRecord,
  WhatsappGroupTrackingRecord,
  IwbmsCheckJob,
  IwbmsWorkerType,
  IwbmsJobStatus,
  IwbmsResultStatus,
  IwbmsWorkerHeartbeat,
  IwbmsJobCounts,
  IwbmsCheckHistory,
  SubAgentStats,
  SubAgentUserSummary,
  ClaimPaymentList,
  ClaimPaymentListStatus,
  ClaimPaymentWorker,
  ClaimCommissionCollection,
  ClaimPaymentExpense,
  ClaimOfficerCommission,
  CommissionSettings,
  SubAgentCommissionConfig,
  ClaimPaymentsDashboardStats,
  IncomeCollectionRecord,
  RenewalCheckBatch,
  RenewalCheckQueueItem,
  RenewalVerificationStatus,
  RenewalCheckBatchStats,
  RenewalCheckPreviewItem,
  RenewalCheckPreviewSummary,
  RenewalCheckWorkerHistory,
  RenewalCheckAuditRecord,
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
export function getPool(): mysql.Pool {
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
      connectionLimit: 15,
      maxIdle: 10,
      idleTimeout: 60000,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
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
      \`password_hash\` VARCHAR(255) DEFAULT NULL,
      \`mobile\` VARCHAR(20) NOT NULL UNIQUE,
      \`name\` VARCHAR(128) NOT NULL,
      \`email\` VARCHAR(128) DEFAULT NULL,
      \`role\` VARCHAR(32) NOT NULL DEFAULT 'OPERATOR',
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
      \`photo_url\` MEDIUMTEXT DEFAULT NULL,
      \`can_register\` TINYINT(1) NOT NULL DEFAULT 1,
      \`can_renew\` TINYINT(1) NOT NULL DEFAULT 1,
      \`can_claim\` TINYINT(1) NOT NULL DEFAULT 1,
      \`can_export\` TINYINT(1) NOT NULL DEFAULT 1,
      \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`last_login\` DATETIME DEFAULT NULL,
      PRIMARY KEY (\`id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    `CREATE TABLE IF NOT EXISTS \`user_activity_logs\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`user_id\` VARCHAR(64) NOT NULL,
      \`username\` VARCHAR(100) NOT NULL,
      \`action\` VARCHAR(255) NOT NULL,
      \`ip_address\` VARCHAR(50) DEFAULT NULL,
      \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
      \`payment_amount\` DECIMAL(10,2) DEFAULT NULL,
      \`payment_mode\` VARCHAR(32) DEFAULT 'Cash',
      \`category\` VARCHAR(64) DEFAULT NULL,
      \`nature_of_work\` VARCHAR(128) DEFAULT NULL,
      \`created_by_user_id\` VARCHAR(64) DEFAULT NULL,
      \`created_by\` VARCHAR(128) DEFAULT NULL,
      \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`),
      INDEX \`idx_reg_mh_number\` (\`mh_number\`),
      INDEX \`idx_reg_status\` (\`status\`),
      INDEX \`idx_reg_mh_status\` (\`mh_number\`, \`status\`)
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
      \`payment_amount\` DECIMAL(10,2) DEFAULT NULL,
      \`payment_mode\` VARCHAR(32) DEFAULT 'Cash',
      \`remarks\` TEXT DEFAULT NULL,
      \`created_by_user_id\` VARCHAR(64) DEFAULT NULL,
      \`created_by\` VARCHAR(128) DEFAULT NULL,
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
      \`created_by_user_id\` VARCHAR(64) DEFAULT NULL,
      \`created_by\` VARCHAR(128) DEFAULT NULL,
      \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (\`id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    `CREATE TABLE IF NOT EXISTS \`old_claims\` (
      \`id\` VARCHAR(64) NOT NULL,
      \`sr_no\` INT DEFAULT NULL,
      \`worker_name\` VARCHAR(128) NOT NULL,
      \`mh_number\` VARCHAR(64) NOT NULL,
      \`verification_date\` VARCHAR(32) DEFAULT NULL,
      \`taluka\` VARCHAR(64) DEFAULT NULL,
      \`scheme1\` VARCHAR(64) DEFAULT NULL,
      \`scheme2\` VARCHAR(64) DEFAULT NULL,
      \`scheme1_amount\` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      \`scheme2_amount\` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      \`total_amount\` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      \`from_source\` VARCHAR(64) DEFAULT 'OFFICE',
      \`mobile_number\` VARCHAR(20) DEFAULT NULL,
      \`form_fill\` VARCHAR(64) DEFAULT NULL,
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'Old Record',
      \`remarks\` TEXT DEFAULT NULL,
      \`created_by\` VARCHAR(128) DEFAULT NULL,
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
      \`is_legacy_record\` TINYINT(1) NOT NULL DEFAULT 0,
      \`legacy_verified_at\` DATETIME DEFAULT NULL,
      \`legacy_verified_by\` VARCHAR(128) DEFAULT NULL,
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

    `CREATE TABLE IF NOT EXISTS \`material_inventory\` (
      \`kit_type\` VARCHAR(32) NOT NULL PRIMARY KEY,
      \`kit_name\` VARCHAR(64) NOT NULL,
      \`available_stock\` INT NOT NULL DEFAULT 100,
      \`total_distributed\` INT NOT NULL DEFAULT 0,
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

    `CREATE TABLE IF NOT EXISTS \`iwbms_check_jobs\` (
      \`id\` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`worker_type\` VARCHAR(32) NOT NULL DEFAULT 'registration',
      \`worker_record_id\` VARCHAR(100) NOT NULL,
      \`mh_number\` VARCHAR(100) NOT NULL,
      \`status\` VARCHAR(30) NOT NULL DEFAULT 'Pending',
      \`result_status\` VARCHAR(30) DEFAULT NULL,
      \`created_by\` VARCHAR(100) DEFAULT NULL,
      \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`started_at\` DATETIME DEFAULT NULL,
      \`completed_at\` DATETIME DEFAULT NULL,
      \`retry_count\` INT NOT NULL DEFAULT 0,
      \`error_message\` TEXT DEFAULT NULL,
      \`last_checked_at\` DATETIME DEFAULT NULL,
      INDEX \`idx_iwbms_mh_number\` (\`mh_number\`),
      INDEX \`idx_iwbms_status\` (\`status\`),
      INDEX \`idx_iwbms_worker_type\` (\`worker_type\`),
      INDEX \`idx_iwbms_worker_record\` (\`worker_record_id\`),
      INDEX \`idx_iwbms_created_at\` (\`created_at\`),
      INDEX \`idx_iwbms_queue_lookup\` (\`status\`, \`created_at\`),
      INDEX \`idx_iwbms_active_mh\` (\`mh_number\`, \`status\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    `CREATE TABLE IF NOT EXISTS \`iwbms_check_history\` (
      \`id\` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`job_id\` BIGINT DEFAULT NULL,
      \`worker_type\` VARCHAR(32) NOT NULL DEFAULT 'registration',
      \`worker_record_id\` VARCHAR(100) NOT NULL,
      \`mh_number\` VARCHAR(100) NOT NULL,
      \`previous_status\` VARCHAR(32) DEFAULT NULL,
      \`new_status\` VARCHAR(32) NOT NULL,
      \`checked_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`worker_name\` VARCHAR(128) DEFAULT NULL,
      \`details\` TEXT DEFAULT NULL,
      INDEX \`idx_history_mh\` (\`mh_number\`),
      INDEX \`idx_history_job\` (\`job_id\`),
      INDEX \`idx_history_type_record\` (\`worker_type\`, \`worker_record_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    `CREATE TABLE IF NOT EXISTS \`claim_payment_lists\` (
      \`id\` VARCHAR(64) NOT NULL PRIMARY KEY,
      \`list_number\` VARCHAR(64) NOT NULL UNIQUE,
      \`list_date\` VARCHAR(32) NOT NULL,
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'Payment Pending',
      \`notes\` TEXT DEFAULT NULL,
      \`created_by_user_id\` VARCHAR(64) DEFAULT NULL,
      \`created_by\` VARCHAR(128) DEFAULT NULL,
      \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX \`idx_list_number\` (\`list_number\`),
      INDEX \`idx_list_status\` (\`status\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    `CREATE TABLE IF NOT EXISTS \`claim_payment_workers\` (
      \`id\` VARCHAR(64) NOT NULL PRIMARY KEY,
      \`list_id\` VARCHAR(64) DEFAULT NULL,
      \`list_number\` VARCHAR(64) NOT NULL,
      \`worker_name\` VARCHAR(128) NOT NULL,
      \`mh_number\` VARCHAR(64) NOT NULL,
      \`verification_date\` VARCHAR(32) DEFAULT NULL,
      \`taluka\` VARCHAR(64) DEFAULT NULL,
      \`scheme1\` VARCHAR(128) DEFAULT NULL,
      \`scheme2\` VARCHAR(128) DEFAULT NULL,
      \`claim_amount\` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      \`source_type\` VARCHAR(32) NOT NULL DEFAULT 'direct',
      \`sub_agent_id\` VARCHAR(64) DEFAULT NULL,
      \`sub_agent_name\` VARCHAR(128) DEFAULT NULL,
      \`commission_rate_snapshot\` DECIMAL(6,2) NOT NULL DEFAULT 10.00,
      \`commission_amount_snapshot\` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      \`total_received\` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      \`payment_status\` VARCHAR(32) NOT NULL DEFAULT 'Pending',
      \`last_payment_date\` VARCHAR(32) DEFAULT NULL,
      \`notes\` TEXT DEFAULT NULL,
      \`created_by_user_id\` VARCHAR(64) DEFAULT NULL,
      \`created_by\` VARCHAR(128) DEFAULT NULL,
      \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY \`idx_list_mh\` (\`list_number\`, \`mh_number\`),
      INDEX \`idx_worker_list_num\` (\`list_number\`),
      INDEX \`idx_worker_mh\` (\`mh_number\`),
      INDEX \`idx_worker_taluka\` (\`taluka\`),
      INDEX \`idx_worker_payment_status\` (\`payment_status\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    `CREATE TABLE IF NOT EXISTS \`claim_commission_collections\` (
      \`id\` VARCHAR(64) NOT NULL PRIMARY KEY,
      \`worker_payment_id\` VARCHAR(64) NOT NULL,
      \`list_number\` VARCHAR(64) NOT NULL,
      \`mh_number\` VARCHAR(64) NOT NULL,
      \`worker_name\` VARCHAR(128) NOT NULL,
      \`received_amount\` DECIMAL(12,2) NOT NULL,
      \`payment_date\` VARCHAR(32) NOT NULL,
      \`payment_mode\` VARCHAR(32) NOT NULL DEFAULT 'Cash',
      \`reference_number\` VARCHAR(128) DEFAULT NULL,
      \`remark\` TEXT DEFAULT NULL,
      \`created_by_user_id\` VARCHAR(64) DEFAULT NULL,
      \`created_by\` VARCHAR(128) DEFAULT NULL,
      \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX \`idx_coll_worker_id\` (\`worker_payment_id\`),
      INDEX \`idx_coll_list_num\` (\`list_number\`),
      INDEX \`idx_coll_mh\` (\`mh_number\`),
      INDEX \`idx_coll_date\` (\`payment_date\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    `CREATE TABLE IF NOT EXISTS \`claim_payment_expenses\` (
      \`id\` VARCHAR(64) NOT NULL PRIMARY KEY,
      \`list_number\` VARCHAR(64) DEFAULT NULL,
      \`expense_date\` VARCHAR(32) NOT NULL,
      \`category\` VARCHAR(64) NOT NULL,
      \`amount\` DECIMAL(12,2) NOT NULL,
      \`description\` TEXT DEFAULT NULL,
      \`payment_mode\` VARCHAR(32) NOT NULL DEFAULT 'Cash',
      \`remark\` TEXT DEFAULT NULL,
      \`created_by_user_id\` VARCHAR(64) DEFAULT NULL,
      \`created_by\` VARCHAR(128) DEFAULT NULL,
      \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX \`idx_exp_list_num\` (\`list_number\`),
      INDEX \`idx_exp_date\` (\`expense_date\`),
      INDEX \`idx_exp_category\` (\`category\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    `CREATE TABLE IF NOT EXISTS \`claim_officer_commissions\` (
      \`id\` VARCHAR(64) NOT NULL PRIMARY KEY,
      \`list_number\` VARCHAR(64) NOT NULL,
      \`taluka\` VARCHAR(64) NOT NULL,
      \`total_claim_amount\` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      \`officer_commission_rate\` DECIMAL(6,2) NOT NULL DEFAULT 10.00,
      \`officer_commission_amount\` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
      \`payment_status\` VARCHAR(32) NOT NULL DEFAULT 'Pending',
      \`payment_date\` VARCHAR(32) DEFAULT NULL,
      \`payment_mode\` VARCHAR(32) DEFAULT NULL,
      \`reference_number\` VARCHAR(128) DEFAULT NULL,
      \`remark\` TEXT DEFAULT NULL,
      \`created_by_user_id\` VARCHAR(64) DEFAULT NULL,
      \`created_by\` VARCHAR(128) DEFAULT NULL,
      \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY \`idx_list_taluka\` (\`list_number\`, \`taluka\`),
      INDEX \`idx_officer_list\` (\`list_number\`),
      INDEX \`idx_officer_taluka\` (\`taluka\`),
      INDEX \`idx_officer_status\` (\`payment_status\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    `CREATE TABLE IF NOT EXISTS \`commission_settings\` (
      \`id\` INT NOT NULL PRIMARY KEY DEFAULT 1,
      \`direct_worker_commission_rate\` DECIMAL(6,2) NOT NULL DEFAULT 10.00,
      \`default_officer_commission_rate\` DECIMAL(6,2) NOT NULL DEFAULT 10.00,
      \`sub_agent_rates\` LONGTEXT DEFAULT NULL,
      \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    `CREATE TABLE IF NOT EXISTS \`income_collections\` (
      \`id\` VARCHAR(64) NOT NULL PRIMARY KEY,
      \`source_type\` VARCHAR(32) NOT NULL,
      \`source_id\` VARCHAR(64) NOT NULL,
      \`worker_name\` VARCHAR(128) NOT NULL,
      \`mh_number\` VARCHAR(64) DEFAULT NULL,
      \`payment_date\` VARCHAR(32) NOT NULL,
      \`payment_amount\` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      \`payment_mode\` VARCHAR(32) NOT NULL DEFAULT 'Cash',
      \`operator_name\` VARCHAR(128) DEFAULT NULL,
      \`taluka\` VARCHAR(64) DEFAULT NULL,
      \`created_by_user_id\` VARCHAR(64) DEFAULT NULL,
      \`created_by_role\` VARCHAR(32) DEFAULT NULL,
      \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY \`idx_income_source\` (\`source_type\`, \`source_id\`),
      INDEX \`idx_income_date\` (\`payment_date\`),
      INDEX \`idx_income_mode\` (\`payment_mode\`),
      INDEX \`idx_income_created_user\` (\`created_by_user_id\`),
      INDEX \`idx_income_created_role\` (\`created_by_role\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    `CREATE TABLE IF NOT EXISTS \`renewal_check_batch\` (
      \`batch_id\` VARCHAR(50) NOT NULL PRIMARY KEY,
      \`filename\` VARCHAR(255) NOT NULL,
      \`total_records\` INT NOT NULL DEFAULT 0,
      \`created_by\` VARCHAR(100) DEFAULT NULL,
      \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX \`idx_rcb_created\` (\`created_at\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    `CREATE TABLE IF NOT EXISTS \`renewal_check_queue\` (
      \`id\` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`batch_id\` VARCHAR(50) NOT NULL,
      \`worker_name\` VARCHAR(150) NOT NULL,
      \`mh_number\` VARCHAR(100) NOT NULL,
      \`mobile_number\` VARCHAR(20) DEFAULT NULL,
      \`verification_status\` VARCHAR(32) NOT NULL DEFAULT 'PENDING',
      \`operator_notes\` TEXT DEFAULT NULL,
      \`processed_by\` VARCHAR(100) DEFAULT NULL,
      \`processed_by_name\` VARCHAR(150) DEFAULT NULL,
      \`processed_at\` DATETIME DEFAULT NULL,
      \`match_status\` VARCHAR(64) DEFAULT 'EXACT_MH_MATCH',
      \`matched_worker_id\` VARCHAR(64) DEFAULT NULL,
      \`assigned_to\` VARCHAR(100) DEFAULT NULL,
      \`assigned_to_name\` VARCHAR(150) DEFAULT NULL,
      \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX \`idx_batch_status\` (\`batch_id\`, \`verification_status\`),
      INDEX \`idx_rcq_mh\` (\`mh_number\`),
      INDEX \`idx_rcq_assigned\` (\`assigned_to\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`,

    `CREATE TABLE IF NOT EXISTS \`renewal_check_audit_log\` (
      \`id\` INT AUTO_INCREMENT PRIMARY KEY,
      \`queue_item_id\` INT NOT NULL,
      \`batch_id\` VARCHAR(50) NOT NULL,
      \`old_status\` VARCHAR(32) NOT NULL,
      \`new_status\` VARCHAR(32) NOT NULL,
      \`changed_by\` VARCHAR(100) NOT NULL,
      \`changed_by_name\` VARCHAR(150) DEFAULT NULL,
      \`changed_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`remarks\` TEXT DEFAULT NULL,
      INDEX \`idx_rca_queue\` (\`queue_item_id\`),
      INDEX \`idx_rca_batch\` (\`batch_id\`)
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
    "ALTER TABLE `users` MODIFY COLUMN `role` ENUM('admin', 'operator', 'sub_agent') NOT NULL DEFAULT 'operator';",
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
    'ALTER TABLE `users` ADD COLUMN `can_see_iwbms_checker` TINYINT(1) NOT NULL DEFAULT 1;',
    'ALTER TABLE `users` ADD COLUMN `can_see_sub_agent_entries` TINYINT(1) NOT NULL DEFAULT 0;',
    'ALTER TABLE `users` ADD COLUMN `can_see_sub_agent_management` TINYINT(1) NOT NULL DEFAULT 0;',
    'ALTER TABLE `users` ADD COLUMN `can_see_claim_payments` TINYINT(1) NOT NULL DEFAULT 1;',
    'ALTER TABLE `users` ADD COLUMN `can_manage_claim_payments` TINYINT(1) NOT NULL DEFAULT 1;',
    'ALTER TABLE `users` ADD COLUMN `can_manage_commission_settings` TINYINT(1) NOT NULL DEFAULT 0;',
    'ALTER TABLE `users` ADD COLUMN `can_manage_expenses` TINYINT(1) NOT NULL DEFAULT 1;',
    'ALTER TABLE `users` ADD COLUMN `can_manage_officer_commission` TINYINT(1) NOT NULL DEFAULT 1;',
    'ALTER TABLE `users` ADD COLUMN `can_export_claim_payments` TINYINT(1) NOT NULL DEFAULT 1;',
    "ALTER TABLE `registrations` ADD COLUMN `created_by_user_id` VARCHAR(64) DEFAULT NULL;",
    "ALTER TABLE `registrations` ADD COLUMN `created_by` VARCHAR(128) DEFAULT NULL;",
    "ALTER TABLE `registrations` ADD COLUMN `app_status` VARCHAR(32) DEFAULT 'Pending';",
    "ALTER TABLE `registrations` ADD COLUMN `from_source` VARCHAR(64) DEFAULT NULL;",
    "ALTER TABLE `registrations` ADD COLUMN `next_renewal_date` VARCHAR(32) DEFAULT NULL;",
    "ALTER TABLE `registrations` ADD COLUMN `match_source` VARCHAR(64) DEFAULT NULL;",
    "ALTER TABLE `registrations` ADD COLUMN `match_date` VARCHAR(64) DEFAULT NULL;",
    "ALTER TABLE `registrations` ADD COLUMN `iwbms_status` VARCHAR(32) DEFAULT NULL;",
    "ALTER TABLE `registrations` ADD COLUMN `iwbms_last_checked` DATETIME DEFAULT NULL;",
    "ALTER TABLE `registrations` ADD COLUMN `iwbms_check_started_at` DATETIME DEFAULT NULL;",
    "ALTER TABLE `registrations` ADD COLUMN `iwbms_check_completed_at` DATETIME DEFAULT NULL;",
    "ALTER TABLE `registrations` ADD COLUMN `iwbms_error` TEXT DEFAULT NULL;",
    "ALTER TABLE `renewals` ADD COLUMN `created_by_user_id` VARCHAR(64) DEFAULT NULL;",
    "ALTER TABLE `renewals` ADD COLUMN `created_by` VARCHAR(128) DEFAULT NULL;",
    "ALTER TABLE `renewals` ADD COLUMN `iwbms_status` VARCHAR(32) DEFAULT NULL;",
    "ALTER TABLE `renewals` ADD COLUMN `iwbms_last_checked` DATETIME DEFAULT NULL;",
    "ALTER TABLE `renewals` ADD COLUMN `iwbms_check_started_at` DATETIME DEFAULT NULL;",
    "ALTER TABLE `renewals` ADD COLUMN `iwbms_check_completed_at` DATETIME DEFAULT NULL;",
    "ALTER TABLE `renewals` ADD COLUMN `iwbms_error` TEXT DEFAULT NULL;",
    "ALTER TABLE `claims` ADD COLUMN `created_by_user_id` VARCHAR(64) DEFAULT NULL;",
    "ALTER TABLE `claims` ADD COLUMN `created_by` VARCHAR(128) DEFAULT NULL;",
    "ALTER TABLE `claims` ADD COLUMN `iwbms_status` VARCHAR(32) DEFAULT NULL;",
    "ALTER TABLE `claims` ADD COLUMN `iwbms_last_checked` DATETIME DEFAULT NULL;",
    "ALTER TABLE `claims` ADD COLUMN `iwbms_check_started_at` DATETIME DEFAULT NULL;",
    "ALTER TABLE `claims` ADD COLUMN `iwbms_check_completed_at` DATETIME DEFAULT NULL;",
    "ALTER TABLE `claims` ADD COLUMN `iwbms_error` TEXT DEFAULT NULL;",
    "ALTER TABLE `claims` ADD COLUMN `from_source` VARCHAR(64) DEFAULT NULL;",
    "ALTER TABLE `settings` ADD COLUMN `whatsapp_template` TEXT DEFAULT NULL;",
    "ALTER TABLE `settings` MODIFY COLUMN `office_logo` LONGTEXT;",
    "ALTER TABLE `claim_payment_workers` ADD COLUMN `scheme1_amount` DECIMAL(12,2) DEFAULT 0.00;",
    "ALTER TABLE `claim_payment_workers` ADD COLUMN `scheme2_amount` DECIMAL(12,2) DEFAULT 0.00;",
    "ALTER TABLE `claim_payment_workers` ADD COLUMN `from_source` VARCHAR(128) DEFAULT NULL;",
    "ALTER TABLE `claim_payment_workers` ADD COLUMN `mobile_number` VARCHAR(20) DEFAULT NULL;",
    "ALTER TABLE `registrations` ADD COLUMN `payment_amount` DECIMAL(10,2) DEFAULT NULL;",
    "ALTER TABLE `registrations` ADD COLUMN `payment_mode` VARCHAR(32) DEFAULT 'Cash';",
    "ALTER TABLE `renewals` ADD COLUMN `payment_amount` DECIMAL(10,2) DEFAULT NULL;",
    "ALTER TABLE `renewals` ADD COLUMN `payment_mode` VARCHAR(32) DEFAULT 'Cash';",
    "ALTER TABLE `renewals` ADD COLUMN `renewal_year` VARCHAR(32) DEFAULT NULL;",
    "ALTER TABLE `renewals` ADD COLUMN `aadhaar_number` VARCHAR(20) DEFAULT NULL;",
    "ALTER TABLE `income_collections` ADD COLUMN `created_by_user_id` VARCHAR(64) DEFAULT NULL;",
    "ALTER TABLE `income_collections` ADD COLUMN `created_by_role` VARCHAR(32) DEFAULT NULL;",
  ];
  for (const colQuery of alterCols) {
    try {
      await pool.query(colQuery);
    } catch (_e) {
      // Column already exists, ignore
    }
  }

  try {
    // Synchronize legacy fee_paid / fee_amount with payment_amount / payment_mode
    await pool.query("UPDATE `registrations` SET `fee_paid` = 0 WHERE `payment_mode` = 'N/A' OR `payment_amount` = 0");
    await pool.query("UPDATE `registrations` SET `fee_paid` = `payment_amount` WHERE `payment_amount` IS NOT NULL AND `payment_mode` != 'N/A'");
    await pool.query("UPDATE `renewals` SET `fee_amount` = 0 WHERE `payment_mode` = 'N/A' OR `payment_amount` = 0");
    await pool.query("UPDATE `renewals` SET `fee_amount` = `payment_amount` WHERE `payment_amount` IS NOT NULL AND `payment_mode` != 'N/A'");

    // Sync created_by_user_id and created_by_role to income_collections
    await pool.query(`
      UPDATE \`income_collections\` ic
      JOIN \`registrations\` r ON ic.source_type = 'Registration' AND ic.source_id = r.id
      LEFT JOIN \`users\` u ON r.created_by_user_id = u.id
      SET ic.created_by_user_id = r.created_by_user_id, ic.created_by_role = COALESCE(u.role, 'operator')
      WHERE ic.created_by_user_id IS NULL AND r.created_by_user_id IS NOT NULL
    `);
    await pool.query(`
      UPDATE \`income_collections\` ic
      JOIN \`renewals\` r ON ic.source_type = 'Renewal' AND ic.source_id = r.id
      LEFT JOIN \`users\` u ON r.created_by_user_id = u.id
      SET ic.created_by_user_id = r.created_by_user_id, ic.created_by_role = COALESCE(u.role, 'operator')
      WHERE ic.created_by_user_id IS NULL AND r.created_by_user_id IS NOT NULL
    `);
  } catch (_e) {
    // Ignore migration sync errors
  }

  await ensureDatabaseIndexes();
  await ensureRegistrationsTableSchema();
  await ensureUsersTableSchema();
  await ensureMaterialDistributionsAndInventorySchema();
  await ensureRenewalVerificationTablesSchema();
}

export async function ensureDatabaseIndexes(targetPool?: mysql.Pool) {
  const p = targetPool || pool;
  if (!p) return;
  const indexStatements = [
    'CREATE INDEX idx_reg_mh ON registrations (mh_number)',
    'CREATE INDEX idx_reg_mobile ON registrations (mobile_number)',
    'CREATE INDEX idx_reg_aadhaar ON registrations (aadhaar_number)',
    'CREATE INDEX idx_reg_name ON registrations (worker_name)',
    'CREATE INDEX idx_reg_taluka ON registrations (taluka)',
    'CREATE INDEX idx_reg_status ON registrations (status)',
    'CREATE INDEX idx_reg_app_status ON registrations (app_status)',
    'CREATE INDEX idx_reg_created_at ON registrations (created_at)',
    'CREATE INDEX idx_reg_created_by_user ON registrations (created_by_user_id)',
    'CREATE INDEX idx_reg_date ON registrations (registration_date)',
    
    'CREATE INDEX idx_ren_mh ON renewals (mh_number)',
    'CREATE INDEX idx_ren_mobile ON renewals (mobile_number)',
    'CREATE INDEX idx_ren_name ON renewals (worker_name)',
    'CREATE INDEX idx_ren_taluka ON renewals (taluka)',
    'CREATE INDEX idx_ren_status ON renewals (status)',
    'CREATE INDEX idx_ren_created_at ON renewals (created_at)',
    'CREATE INDEX idx_ren_created_by_user ON renewals (created_by_user_id)',
    'CREATE INDEX idx_ren_date ON renewals (renewal_date)',
    'CREATE INDEX idx_ren_year ON renewals (renewal_year)',
    'CREATE INDEX idx_ren_aadhaar ON renewals (aadhaar_number)',
    
    'CREATE INDEX idx_clm_mh ON claims (mh_number)',
    'CREATE INDEX idx_clm_mobile ON claims (mobile_number)',
    'CREATE INDEX idx_clm_name ON claims (worker_name)',
    'CREATE INDEX idx_clm_taluka ON claims (taluka)',
    'CREATE INDEX idx_clm_status ON claims (status)',
    'CREATE INDEX idx_clm_created_at ON claims (created_at)',
    'CREATE INDEX idx_clm_created_by_user ON claims (created_by_user_id)',
    'CREATE INDEX idx_clm_date ON claims (claim_date)',
    
    'CREATE INDEX idx_app_list_num ON approval_lists (list_number)',
    'CREATE INDEX idx_app_mh ON approval_lists (mh_number)',
    'CREATE INDEX idx_app_worker_name ON approval_lists (worker_name)',
    'CREATE INDEX idx_app_payment_status ON approval_lists (payment_status)',

    'CREATE INDEX idx_income_taluka ON income_collections (taluka)',
    'CREATE INDEX idx_income_worker ON income_collections (worker_name)',

    'CREATE INDEX idx_logs_timestamp ON logs (timestamp)',
    'CREATE INDEX idx_logs_username ON logs (username)',

    'CREATE INDEX idx_followups_mh ON followups (mh_number)',
    'CREATE INDEX idx_followups_status ON followups (status)',
    'CREATE INDEX idx_followups_module ON followups (module)',

    'CREATE INDEX idx_cpw_name ON claim_payment_workers (worker_name)',
    'CREATE INDEX idx_cpw_mobile ON claim_payment_workers (mobile_number)',
    'CREATE INDEX idx_mat_legacy ON material_distributions (is_legacy_record)',
    'CREATE INDEX idx_mat_mh ON material_distributions (mh_number)'
  ];

  for (const sql of indexStatements) {
    try {
      await p.query(sql);
    } catch (_e) {
      // index already exists or table not ready, safely continue
    }
  }
}

async function ensureUsersTableSchema() {
  if (!pool) return;
  try {
    const [cols]: any = await pool.query('SHOW COLUMNS FROM `users`');
    const existingCols = new Set(cols.map((c: any) => c.Field.toLowerCase()));

    // Make sure role column supports 'sub_agent'
    try {
      await pool.query("ALTER TABLE `users` MODIFY COLUMN `role` VARCHAR(32) NOT NULL DEFAULT 'operator'");
    } catch (_e) {}

    // Make sure status column supports 'ACTIVE', 'INACTIVE', 'active' and 'disabled'
    try {
      await pool.query("ALTER TABLE `users` MODIFY COLUMN `status` VARCHAR(32) NOT NULL DEFAULT 'ACTIVE'");
    } catch (_e) {}

    // Ensure user_activity_logs table exists
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS \`user_activity_logs\` (
          \`id\` INT AUTO_INCREMENT PRIMARY KEY,
          \`user_id\` VARCHAR(64) NOT NULL,
          \`username\` VARCHAR(100) NOT NULL,
          \`action\` VARCHAR(255) NOT NULL,
          \`ip_address\` VARCHAR(50) DEFAULT NULL,
          \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
    } catch (_e) {}

    const requiredCols = [
      { name: 'password_hash', ddl: 'ADD COLUMN `password_hash` VARCHAR(255) DEFAULT NULL' },
      { name: 'can_register', ddl: 'ADD COLUMN `can_register` TINYINT(1) NOT NULL DEFAULT 1' },
      { name: 'can_renew', ddl: 'ADD COLUMN `can_renew` TINYINT(1) NOT NULL DEFAULT 1' },
      { name: 'can_claim', ddl: 'ADD COLUMN `can_claim` TINYINT(1) NOT NULL DEFAULT 1' },
      { name: 'can_export', ddl: 'ADD COLUMN `can_export` TINYINT(1) NOT NULL DEFAULT 1' },
      { name: 'can_see_search', ddl: 'ADD COLUMN `can_see_search` TINYINT(1) NOT NULL DEFAULT 1' },
      { name: 'can_see_claim_entry', ddl: 'ADD COLUMN `can_see_claim_entry` TINYINT(1) NOT NULL DEFAULT 1' },
      { name: 'can_see_registration_entry', ddl: 'ADD COLUMN `can_see_registration_entry` TINYINT(1) NOT NULL DEFAULT 1' },
      { name: 'can_see_renewal_entry', ddl: 'ADD COLUMN `can_see_renewal_entry` TINYINT(1) NOT NULL DEFAULT 1' },
      { name: 'can_see_master_excel_sync', ddl: 'ADD COLUMN `can_see_master_excel_sync` TINYINT(1) NOT NULL DEFAULT 1' },
      { name: 'can_see_pending_verification', ddl: 'ADD COLUMN `can_see_pending_verification` TINYINT(1) NOT NULL DEFAULT 1' },
      { name: 'can_see_material_distribution', ddl: 'ADD COLUMN `can_see_material_distribution` TINYINT(1) NOT NULL DEFAULT 1' },
      { name: 'can_see_whatsapp_group', ddl: 'ADD COLUMN `can_see_whatsapp_group` TINYINT(1) NOT NULL DEFAULT 1' },
      { name: 'can_see_iwbms_checker', ddl: 'ADD COLUMN `can_see_iwbms_checker` TINYINT(1) NOT NULL DEFAULT 1' },
      { name: 'can_see_sub_agent_entries', ddl: 'ADD COLUMN `can_see_sub_agent_entries` TINYINT(1) NOT NULL DEFAULT 0' },
      { name: 'can_see_sub_agent_management', ddl: 'ADD COLUMN `can_see_sub_agent_management` TINYINT(1) NOT NULL DEFAULT 0' },
      { name: 'can_see_claim_payments', ddl: 'ADD COLUMN `can_see_claim_payments` TINYINT(1) NOT NULL DEFAULT 1' },
      { name: 'can_manage_claim_payments', ddl: 'ADD COLUMN `can_manage_claim_payments` TINYINT(1) NOT NULL DEFAULT 1' },
      { name: 'can_manage_commission_settings', ddl: 'ADD COLUMN `can_manage_commission_settings` TINYINT(1) NOT NULL DEFAULT 0' },
      { name: 'can_manage_expenses', ddl: 'ADD COLUMN `can_manage_expenses` TINYINT(1) NOT NULL DEFAULT 1' },
      { name: 'can_manage_officer_commission', ddl: 'ADD COLUMN `can_manage_officer_commission` TINYINT(1) NOT NULL DEFAULT 1' },
      { name: 'can_export_claim_payments', ddl: 'ADD COLUMN `can_export_claim_payments` TINYINT(1) NOT NULL DEFAULT 1' },
    ];

    for (const col of requiredCols) {
      if (!existingCols.has(col.name.toLowerCase())) {
        try {
          await pool.query(`ALTER TABLE \`users\` ${col.ddl}`);
          console.log(`[TiDB] Added column ${col.name} to users table.`);
        } catch (err: any) {
          console.warn(`[TiDB] Failed to add column ${col.name} to users:`, err?.message || err);
        }
      }
    }
    console.log('[TiDB] Verified users table schema.');
  } catch (err) {
    console.error('[TiDB Error] ensureUsersTableSchema failed:', err);
  }
}

async function ensureMaterialDistributionsAndInventorySchema() {
  if (!pool) return;
  try {
    // 1. Ensure material_inventory table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`material_inventory\` (
        \`kit_type\` VARCHAR(32) NOT NULL PRIMARY KEY,
        \`kit_name\` VARCHAR(64) NOT NULL,
        \`available_stock\` INT NOT NULL DEFAULT 100,
        \`total_distributed\` INT NOT NULL DEFAULT 0,
        \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 2. Ensure default initial kits exist
    await pool.query(`
      INSERT INTO \`material_inventory\` (\`kit_type\`, \`kit_name\`, \`available_stock\`, \`total_distributed\`)
      VALUES
        ('bhandi', 'भांडी (Cooking Utensils)', 100, 0),
        ('peti', 'पेटी (Trunk Box)', 100, 0),
        ('bag', 'बॅग (Safety Gear Bag)', 100, 0)
      ON DUPLICATE KEY UPDATE \`kit_name\` = VALUES(\`kit_name\`);
    `);

    // 3. Ensure material_distributions columns for legacy tagging
    const [cols]: any = await pool.query('SHOW COLUMNS FROM `material_distributions`');
    const existingCols = new Set(cols.map((c: any) => c.Field.toLowerCase()));

    if (!existingCols.has('is_legacy_record')) {
      try {
        await pool.query('ALTER TABLE `material_distributions` ADD COLUMN `is_legacy_record` TINYINT(1) NOT NULL DEFAULT 0');
        console.log('[TiDB] Added column is_legacy_record to material_distributions.');
      } catch (_e) {}
    }

    if (!existingCols.has('legacy_verified_at')) {
      try {
        await pool.query('ALTER TABLE `material_distributions` ADD COLUMN `legacy_verified_at` DATETIME DEFAULT NULL');
        console.log('[TiDB] Added column legacy_verified_at to material_distributions.');
      } catch (_e) {}
    }

    if (!existingCols.has('legacy_verified_by')) {
      try {
        await pool.query('ALTER TABLE `material_distributions` ADD COLUMN `legacy_verified_by` VARCHAR(128) DEFAULT NULL');
        console.log('[TiDB] Added column legacy_verified_by to material_distributions.');
      } catch (_e) {}
    }

    // 4. Default existing records without individual kit distribution details as legacy records
    // Do NOT automatically assume old records received all 3 kits!
    try {
      await pool.query(`
        UPDATE \`material_distributions\`
        SET \`is_legacy_record\` = 1
        WHERE \`is_legacy_record\` = 0
          AND \`legacy_verified_at\` IS NULL
          AND \`bhandi_given_date\` IS NULL
          AND \`peti_given_date\` IS NULL
          AND \`bag_given_date\` IS NULL
      `);
    } catch (_e) {}

    console.log('[TiDB] Verified material_distributions and material_inventory schema.');
  } catch (err) {
    console.error('[TiDB Error] ensureMaterialDistributionsAndInventorySchema failed:', err);
  }
}

async function ensureRenewalVerificationTablesSchema() {
  if (!pool) return;
  try {
    // 1. Ensure renewal_check_batch columns
    try {
      const [bCols]: any = await pool.query('SHOW COLUMNS FROM `renewal_check_batch`');
      const existingBatchCols = new Set(bCols.map((c: any) => c.Field.toLowerCase()));

      if (!existingBatchCols.has('file_name')) {
        await pool.query('ALTER TABLE `renewal_check_batch` ADD COLUMN `file_name` VARCHAR(255) NULL').catch(() => {});
      }
      if (!existingBatchCols.has('imported_by')) {
        await pool.query('ALTER TABLE `renewal_check_batch` ADD COLUMN `imported_by` VARCHAR(100) NULL').catch(() => {});
      }
      if (!existingBatchCols.has('imported_at')) {
        await pool.query('ALTER TABLE `renewal_check_batch` ADD COLUMN `imported_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP').catch(() => {});
      }
      if (!existingBatchCols.has('renewed_count')) {
        await pool.query('ALTER TABLE `renewal_check_batch` ADD COLUMN `renewed_count` INT NOT NULL DEFAULT 0').catch(() => {});
      }
      if (!existingBatchCols.has('call_pending_count')) {
        await pool.query('ALTER TABLE `renewal_check_batch` ADD COLUMN `call_pending_count` INT NOT NULL DEFAULT 0').catch(() => {});
      }
      if (!existingBatchCols.has('issue_count')) {
        await pool.query('ALTER TABLE `renewal_check_batch` ADD COLUMN `issue_count` INT NOT NULL DEFAULT 0').catch(() => {});
      }
      if (!existingBatchCols.has('skipped_count')) {
        await pool.query('ALTER TABLE `renewal_check_batch` ADD COLUMN `skipped_count` INT NOT NULL DEFAULT 0').catch(() => {});
      }
      if (!existingBatchCols.has('pending_count')) {
        await pool.query('ALTER TABLE `renewal_check_batch` ADD COLUMN `pending_count` INT NOT NULL DEFAULT 0').catch(() => {});
      }
      if (!existingBatchCols.has('already_renewed_count')) {
        await pool.query('ALTER TABLE `renewal_check_batch` ADD COLUMN `already_renewed_count` INT NOT NULL DEFAULT 0').catch(() => {});
      }
      if (!existingBatchCols.has('status')) {
        await pool.query('ALTER TABLE `renewal_check_batch` ADD COLUMN `status` VARCHAR(32) NOT NULL DEFAULT \'ACTIVE\'').catch(() => {});
      }
    } catch (_e) {}

    // 2. Ensure renewal_check_queue columns
    try {
      await pool.query("ALTER TABLE `renewal_check_queue` MODIFY COLUMN `verification_status` VARCHAR(32) NOT NULL DEFAULT 'PENDING'").catch(() => {});
      const [qCols]: any = await pool.query('SHOW COLUMNS FROM `renewal_check_queue`');
      const existingQueueCols = new Set(qCols.map((c: any) => c.Field.toLowerCase()));

      if (!existingQueueCols.has('match_status')) {
        await pool.query('ALTER TABLE `renewal_check_queue` ADD COLUMN `match_status` VARCHAR(64) DEFAULT \'EXACT_MH_MATCH\'').catch(() => {});
      }
      if (!existingQueueCols.has('matched_worker_id')) {
        await pool.query('ALTER TABLE `renewal_check_queue` ADD COLUMN `matched_worker_id` VARCHAR(64) NULL').catch(() => {});
      }
      if (!existingQueueCols.has('assigned_to')) {
        await pool.query('ALTER TABLE `renewal_check_queue` ADD COLUMN `assigned_to` VARCHAR(100) NULL').catch(() => {});
      }
      if (!existingQueueCols.has('assigned_to_name')) {
        await pool.query('ALTER TABLE `renewal_check_queue` ADD COLUMN `assigned_to_name` VARCHAR(150) NULL').catch(() => {});
      }
      if (!existingQueueCols.has('processed_by')) {
        await pool.query('ALTER TABLE `renewal_check_queue` ADD COLUMN `processed_by` VARCHAR(100) NULL').catch(() => {});
      }
      if (!existingQueueCols.has('processed_by_name')) {
        await pool.query('ALTER TABLE `renewal_check_queue` ADD COLUMN `processed_by_name` VARCHAR(150) NULL').catch(() => {});
      }
      if (!existingQueueCols.has('processed_at')) {
        await pool.query('ALTER TABLE `renewal_check_queue` ADD COLUMN `processed_at` DATETIME NULL').catch(() => {});
      }
    } catch (_e) {}

    // 3. Ensure renewal_check_audit_log table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`renewal_check_audit_log\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`queue_item_id\` INT NOT NULL,
        \`batch_id\` VARCHAR(50) NOT NULL,
        \`old_status\` VARCHAR(32) NOT NULL,
        \`new_status\` VARCHAR(32) NOT NULL,
        \`changed_by\` VARCHAR(100) NOT NULL,
        \`changed_by_name\` VARCHAR(150) DEFAULT NULL,
        \`changed_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`remarks\` TEXT DEFAULT NULL,
        INDEX \`idx_rca_queue\` (\`queue_item_id\`),
        INDEX \`idx_rca_batch\` (\`batch_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `).catch(() => {});
  } catch (err) {
    console.error('[TiDB Error] ensureRenewalVerificationTablesSchema failed:', err);
  }
}

async function ensureRegistrationsTableSchema() {
  if (!pool) return;

  try {
    const [createTableRows]: any = await pool.query('SHOW CREATE TABLE `registrations`');
    const createTableStmt = createTableRows && createTableRows[0]
      ? (createTableRows[0]['Create Table'] || createTableRows[0]['Create Table\n'] || Object.values(createTableRows[0])[1] as string || '')
      : '';

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

      console.log('[TiDB] Successfully verified registrations table schema update.');
    } else {
      console.log('[TiDB] Verified registrations table has AUTO_INCREMENT PRIMARY KEY.');
    }

    // Ensure database indexes for mh_number and status (prevents race condition delays & optimizes lookups)
    try {
      const [indexRows]: any = await pool.query('SHOW INDEX FROM `registrations`');
      const indexNames = new Set(indexRows.map((r: any) => r.Key_name));
      if (!indexNames.has('idx_reg_mh_number')) {
        await pool.query('CREATE INDEX idx_reg_mh_number ON `registrations` (`mh_number`)');
        console.log('[TiDB] Created index idx_reg_mh_number on registrations table.');
      }
      if (!indexNames.has('idx_reg_status')) {
        await pool.query('CREATE INDEX idx_reg_status ON `registrations` (`status`)');
        console.log('[TiDB] Created index idx_reg_status on registrations table.');
      }
      if (!indexNames.has('idx_reg_mh_status')) {
        await pool.query('CREATE INDEX idx_reg_mh_status ON `registrations` (`mh_number`, `status`)');
        console.log('[TiDB] Created composite index idx_reg_mh_status on registrations table.');
      }
    } catch (idxErr) {
      console.warn('[TiDB] Notice while checking registration indexes:', idxErr);
    }
  } catch (err) {
    console.error('[TiDB Error] ensureRegistrationsTableSchema failed:', err);
  }
}

async function seedDefaultData() {
  if (!pool) return;

  try {
    const [rows]: any = await pool.query(
      "SELECT * FROM users WHERE id = 'usr-admin-1' OR role = 'admin' OR username IN ('admin', 'om')"
    );
    const hashedOmPass = await bcrypt.hash('558184', 10);
    if (!rows || rows.length === 0) {
      await pool.query(
        `INSERT INTO users (id, username, password, mobile, name, email, role, status, photo_url, can_register, can_renew, can_claim, can_export, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 1, 1, NOW())`,
        [
          'usr-admin-1',
          'om',
          hashedOmPass,
          '7741805766',
          'Om (Admin)',
          'omkolhal026@gmail.com',
          'admin',
          'active',
          null,
        ]
      );
    } else {
      // Sync the existing admin record to Om's details without resetting changed passwords
      if (!rows[0].password) {
        await pool.query(
          `UPDATE users SET username = 'om', password = ?, mobile = '7741805766', name = 'Om (Admin)', email = 'omkolhal026@gmail.com', role = 'admin', status = 'active' WHERE id = ? OR role = 'admin'`,
          [hashedOmPass, rows[0].id]
        );
      } else {
        await pool.query(
          `UPDATE users SET username = 'om', mobile = '7741805766', name = 'Om (Admin)', email = 'omkolhal026@gmail.com', role = 'admin', status = 'active' WHERE id = ? OR role = 'admin'`,
          [rows[0].id]
        );
      }
    }
  } catch (err: any) {
    console.log(`[Database Notice] User seed notice (${err?.message || err}).`);
  }

  try {
    const [opRows]: any = await pool.query("SELECT * FROM users WHERE role = 'operator' OR id = 'usr-op-1' OR username = 'Prachi'");
    if (!opRows || opRows.length === 0) {
      const hashedOpPass = await bcrypt.hash('operator123', 10);
      await pool.query(
        `INSERT INTO users (id, username, password, mobile, name, email, role, status, photo_url, can_register, can_renew, can_claim, can_export, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, 1, 0, NOW())`,
        [
          'usr-op-1',
          'Prachi',
          hashedOpPass,
          '7558783299',
          'Prachi (Operator)',
          'prachi@omdigitaleseva.com',
          'operator',
          'active',
          null,
        ]
      );
    }
  } catch (err: any) {
    console.log(`[Database Notice] Operator seed notice (${err?.message || err}).`);
  }

  // Remove any demo or extra accounts that are not authorized in User Management / Sub-Agent Management
  try {
    await pool.query(
      "DELETE FROM users WHERE username IN ('subagent1', 'operator2', 'operator3', 'operator1') AND id != 'usr-op-1' OR id IN ('usr-sa-demo-1', 'usr-op-2', 'usr-op-3') OR name LIKE '%Sub-Agent Demo%'"
    );
  } catch (err: any) {
    // Ignore cleanup error if already deleted
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
  if (!usernameOrMobile || typeof usernameOrMobile !== 'string' || !usernameOrMobile.trim()) {
    return null;
  }
  if (!pass || typeof pass !== 'string' || !pass.trim()) {
    return null;
  }

  const p = getPool();
  const searchStr = usernameOrMobile.trim().toLowerCase();
  const cleanMobile = usernameOrMobile.trim();

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
      canSeeIwbmsChecker: dbUser.can_see_iwbms_checker !== undefined ? Boolean(dbUser.can_see_iwbms_checker) : true,
      canSeeSubAgentEntries: dbUser.can_see_sub_agent_entries !== undefined ? Boolean(dbUser.can_see_sub_agent_entries) : (dbUser.role === 'admin'),
      canSeeSubAgentManagement: dbUser.can_see_sub_agent_management !== undefined ? Boolean(dbUser.can_see_sub_agent_management) : (dbUser.role === 'admin'),
      canSeeClaimPayments: dbUser.can_see_claim_payments !== undefined ? Boolean(dbUser.can_see_claim_payments) : true,
      canManageClaimPayments: dbUser.can_manage_claim_payments !== undefined ? Boolean(dbUser.can_manage_claim_payments) : true,
      canManageCommissionSettings: dbUser.can_manage_commission_settings !== undefined ? Boolean(dbUser.can_manage_commission_settings) : (dbUser.role === 'admin'),
      canManageExpenses: dbUser.can_manage_expenses !== undefined ? Boolean(dbUser.can_manage_expenses) : true,
      canManageOfficerCommission: dbUser.can_manage_officer_commission !== undefined ? Boolean(dbUser.can_manage_officer_commission) : true,
      canExportClaimPayments: dbUser.can_export_claim_payments !== undefined ? Boolean(dbUser.can_export_claim_payments) : true,
    };
  }

  // Find user by exact login identifier: username (case-insensitive) or mobile number
  const [rows]: any = await p.query(
    `SELECT * FROM users 
     WHERE LOWER(username) = ? 
        OR mobile = ?`,
    [searchStr, cleanMobile]
  );

  if (!rows || rows.length === 0) {
    return null;
  }

  for (const dbUser of rows) {
    if (!dbUser.password) {
      continue;
    }

    let isMatch = false;

    // Secure verification: compare entered password against stored bcrypt hash
    if (dbUser.password.startsWith('$2a$') || dbUser.password.startsWith('$2b$')) {
      isMatch = await bcrypt.compare(pass, dbUser.password);
    } else {
      // Legacy unhashed safety check only if legacy record exists, then immediately upgrade to bcrypt hash
      isMatch = (pass === dbUser.password);
      if (isMatch) {
        const newHash = await bcrypt.hash(pass, 10);
        await p.query('UPDATE users SET password = ? WHERE id = ?', [newHash, dbUser.id]);
      }
    }

    if (isMatch) {
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
        permissions: mapDbUserPermissions(dbUser),
        createdAt: dbUser.created_at,
        lastLogin: now,
      };
    }
  }

  return null;
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
      canSeeIwbmsChecker: u.can_see_iwbms_checker !== undefined ? Boolean(u.can_see_iwbms_checker) : true,
      canSeeSubAgentEntries: u.can_see_sub_agent_entries !== undefined ? Boolean(u.can_see_sub_agent_entries) : (u.role === 'admin'),
      canSeeSubAgentManagement: u.can_see_sub_agent_management !== undefined ? Boolean(u.can_see_sub_agent_management) : (u.role === 'admin'),
      canSeeClaimPayments: u.can_see_claim_payments !== undefined ? Boolean(u.can_see_claim_payments) : true,
      canManageClaimPayments: u.can_manage_claim_payments !== undefined ? Boolean(u.can_manage_claim_payments) : true,
      canManageCommissionSettings: u.can_manage_commission_settings !== undefined ? Boolean(u.can_manage_commission_settings) : (u.role === 'admin'),
      canManageExpenses: u.can_manage_expenses !== undefined ? Boolean(u.can_manage_expenses) : true,
      canManageOfficerCommission: u.can_manage_officer_commission !== undefined ? Boolean(u.can_manage_officer_commission) : true,
      canExportClaimPayments: u.can_export_claim_payments !== undefined ? Boolean(u.can_export_claim_payments) : true,
    },
    createdAt: u.created_at,
    lastLogin: u.last_login,
  }));
}

export async function createMySQLUser(user: User, plainPassword?: string): Promise<User> {
  const p = getPool();
  const rawUsername = (user.username || '').trim().toLowerCase();
  const rawMobile = (user.mobile || '').trim();
  const rawName = (user.name || '').trim() || rawUsername;

  // Validate duplicate username or mobile before insertion
  const [existing]: any = await p.query(
    'SELECT id, username, mobile FROM users WHERE LOWER(username) = ? OR mobile = ?',
    [rawUsername, rawMobile]
  );
  if (existing && existing.length > 0) {
    if (existing.some((e: any) => (e.username || '').toLowerCase() === rawUsername)) {
      throw new Error(`युझरनेम @${rawUsername} आधीपासूनच वापरात आहे (Username @${rawUsername} is already taken). कृपया दुसरे युझरनेम निवडा.`);
    }
    if (existing.some((e: any) => (e.mobile || '').trim() === rawMobile)) {
      throw new Error(`मोबाईल नंबर ${rawMobile} आधीच दुसऱ्या खात्यासाठी नोंदणीकृत आहे (Mobile ${rawMobile} is already registered).`);
    }
  }

  const hashedPass = await hashPassword(plainPassword || user.password || `${rawUsername}123`);
  const perm = (user.permissions || {}) as Partial<UserPermissions>;

  // Check columns currently present in `users` table
  const [colRows]: any = await p.query('SHOW COLUMNS FROM `users`');
  const cols = new Set(colRows.map((c: any) => c.Field.toLowerCase()));

  const fieldNames: string[] = ['id', 'username', 'password', 'mobile', 'name', 'email', 'role', 'status', 'photo_url'];
  const fieldPlaceholders: string[] = ['?', '?', '?', '?', '?', '?', '?', '?', '?'];
  const fieldValues: any[] = [
    user.id || `usr-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
    rawUsername,
    hashedPass,
    rawMobile,
    rawName,
    user.email ? user.email.trim() : null,
    user.role || 'sub_agent',
    user.status || 'active',
    user.photoUrl || null,
  ];

  const permissionMapping: { col: string; val: boolean }[] = [
    { col: 'can_register', val: perm.canRegister !== false },
    { col: 'can_renew', val: perm.canRenew !== false },
    { col: 'can_claim', val: perm.canClaim !== false },
    { col: 'can_export', val: perm.canExport === true },
    { col: 'can_see_search', val: perm.canSeeSearch !== false },
    { col: 'can_see_claim_entry', val: perm.canSeeClaimEntry !== false },
    { col: 'can_see_registration_entry', val: perm.canSeeRegistrationEntry !== false },
    { col: 'can_see_renewal_entry', val: perm.canSeeRenewalEntry !== false },
    { col: 'can_see_master_excel_sync', val: perm.canSeeMasterExcelSync !== false },
    { col: 'can_see_pending_verification', val: perm.canSeePendingVerification !== false },
    { col: 'can_see_material_distribution', val: perm.canSeeMaterialDistribution !== false },
    { col: 'can_see_whatsapp_group', val: perm.canSeeWhatsappGroup !== false },
    { col: 'can_see_iwbms_checker', val: perm.canSeeIwbmsChecker !== false },
    { col: 'can_see_sub_agent_entries', val: perm.canSeeSubAgentEntries === true },
    { col: 'can_see_sub_agent_management', val: perm.canSeeSubAgentManagement === true },
    { col: 'can_see_claim_payments', val: perm.canSeeClaimPayments !== false },
    { col: 'can_manage_claim_payments', val: perm.canManageClaimPayments !== false },
    { col: 'can_manage_commission_settings', val: perm.canManageCommissionSettings === true },
    { col: 'can_manage_expenses', val: perm.canManageExpenses !== false },
    { col: 'can_manage_officer_commission', val: perm.canManageOfficerCommission !== false },
    { col: 'can_export_claim_payments', val: perm.canExportClaimPayments !== false },
  ];

  for (const pMap of permissionMapping) {
    if (cols.has(pMap.col.toLowerCase())) {
      fieldNames.push(pMap.col);
      fieldPlaceholders.push('?');
      fieldValues.push(pMap.val ? 1 : 0);
    }
  }

  if (cols.has('created_at')) {
    fieldNames.push('created_at');
    fieldPlaceholders.push('NOW()');
  }

  const insertSql = `INSERT INTO users (${fieldNames.map((f) => `\`${f}\``).join(', ')}) VALUES (${fieldPlaceholders.join(', ')})`;
  await p.query(insertSql, fieldValues);

  // Read back from TiDB to confirm insertion
  const [rows]: any = await p.query('SELECT * FROM users WHERE id = ?', [fieldValues[0]]);
  if (!rows || rows.length === 0) {
    throw new Error(`[TiDB Error] Record insertion read-back failed for user ID: ${fieldValues[0]}`);
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
      canSeeIwbmsChecker: u.can_see_iwbms_checker !== undefined ? Boolean(u.can_see_iwbms_checker) : true,
      canSeeSubAgentEntries: u.can_see_sub_agent_entries !== undefined ? Boolean(u.can_see_sub_agent_entries) : false,
      canSeeSubAgentManagement: u.can_see_sub_agent_management !== undefined ? Boolean(u.can_see_sub_agent_management) : false,
      canSeeClaimPayments: u.can_see_claim_payments !== undefined ? Boolean(u.can_see_claim_payments) : true,
      canManageClaimPayments: u.can_manage_claim_payments !== undefined ? Boolean(u.can_manage_claim_payments) : true,
      canManageCommissionSettings: u.can_manage_commission_settings !== undefined ? Boolean(u.can_manage_commission_settings) : (u.role === 'admin'),
      canManageExpenses: u.can_manage_expenses !== undefined ? Boolean(u.can_manage_expenses) : true,
      canManageOfficerCommission: u.can_manage_officer_commission !== undefined ? Boolean(u.can_manage_officer_commission) : true,
      canExportClaimPayments: u.can_export_claim_payments !== undefined ? Boolean(u.can_export_claim_payments) : true,
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
    if (perm.canSeeIwbmsChecker !== undefined) { fields.push('can_see_iwbms_checker = ?'); values.push(perm.canSeeIwbmsChecker ? 1 : 0); }
    if (perm.canSeeSubAgentEntries !== undefined) { fields.push('can_see_sub_agent_entries = ?'); values.push(perm.canSeeSubAgentEntries ? 1 : 0); }
    if (perm.canSeeSubAgentManagement !== undefined) { fields.push('can_see_sub_agent_management = ?'); values.push(perm.canSeeSubAgentManagement ? 1 : 0); }
    if (perm.canSeeClaimPayments !== undefined) { fields.push('can_see_claim_payments = ?'); values.push(perm.canSeeClaimPayments ? 1 : 0); }
    if (perm.canManageClaimPayments !== undefined) { fields.push('can_manage_claim_payments = ?'); values.push(perm.canManageClaimPayments ? 1 : 0); }
    if (perm.canManageCommissionSettings !== undefined) { fields.push('can_manage_commission_settings = ?'); values.push(perm.canManageCommissionSettings ? 1 : 0); }
    if (perm.canManageExpenses !== undefined) { fields.push('can_manage_expenses = ?'); values.push(perm.canManageExpenses ? 1 : 0); }
    if (perm.canManageOfficerCommission !== undefined) { fields.push('can_manage_officer_commission = ?'); values.push(perm.canManageOfficerCommission ? 1 : 0); }
    if (perm.canExportClaimPayments !== undefined) { fields.push('can_export_claim_payments = ?'); values.push(perm.canExportClaimPayments ? 1 : 0); }
  }

  if (fields.length > 0) {
    values.push(id, id);
    await p.query(`UPDATE users SET ${fields.join(', ')} WHERE id = ? OR username = ?`, values);
  }

  const allUsers = await getMySQLUsers();
  return (
    allUsers.find(
      (u) =>
        u.id === id ||
        (u.username && u.username.toLowerCase() === id.toLowerCase())
    ) || null
  );
}

export async function deleteMySQLUser(id: string): Promise<void> {
  const p = getPool();
  await p.query('DELETE FROM users WHERE id = ? OR username = ?', [id, id]);
}

export async function changeMySQLUserPassword(
  userIdOrUsername: string,
  currentPass: string,
  newPass: string
): Promise<{ success: boolean; error?: string }> {
  const p = getPool();
  const searchStr = (userIdOrUsername || '').trim();
  if (!searchStr) {
    return { success: false, error: 'वापरकर्ता ओळख माहिती आढळली नाही (User identification missing)' };
  }

  const [rows]: any = await p.query(
    'SELECT * FROM users WHERE id = ? OR username = ? OR LOWER(username) = ? OR mobile = ?',
    [searchStr, searchStr, searchStr.toLowerCase(), searchStr]
  );

  if (!rows || rows.length === 0) {
    return { success: false, error: 'वापरकर्ता खाते सापडले नाही (User account not found)' };
  }

  const dbUser = rows[0];
  let isMatch = false;

  if (dbUser.password && (dbUser.password.startsWith('$2a$') || dbUser.password.startsWith('$2b$'))) {
    isMatch = await bcrypt.compare(currentPass, dbUser.password);
  } else {
    isMatch = (currentPass === dbUser.password);
  }

  if (!isMatch) {
    return { success: false, error: 'सध्याचा चालू पासवर्ड चुकीचा आहे! (Current password is incorrect!)' };
  }

  if (!newPass || newPass.trim().length < 4) {
    return { success: false, error: 'नवीन पासवर्ड किमान ४ अक्षरांचा असावा! (New password must be at least 4 characters!)' };
  }

  const newHash = await hashPassword(newPass.trim());
  await p.query('UPDATE users SET password = ? WHERE id = ?', [newHash, dbUser.id]);
  return { success: true };
}

export function mapRegistrationRow(r: any): WorkerRegistration {
  const paymentMode = (r.payment_mode as 'Cash' | 'Online' | 'N/A') || 'Cash';
  const rawPaymentAmt = r.payment_amount !== null && r.payment_amount !== undefined ? parseFloat(r.payment_amount) : undefined;
  const effFeePaid = paymentMode === 'N/A'
    ? 0
    : (rawPaymentAmt !== undefined ? rawPaymentAmt : parseFloat(r.fee_paid !== null && r.fee_paid !== undefined ? r.fee_paid : 0));

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
    feePaid: effFeePaid,
    category: r.category || '',
    natureOfWork: r.nature_of_work || '',
    matchSource: r.match_source || '',
    matchDate: r.match_date || '',
    createdByUserId: r.created_by_user_id || undefined,
    createdBy: r.created_by || undefined,
    paymentAmount: paymentMode === 'N/A' ? 0 : (rawPaymentAmt !== undefined ? rawPaymentAmt : effFeePaid),
    paymentMode: paymentMode,
    iwbmsStatus: r.iwbms_status || undefined,
    iwbmsLastChecked: r.iwbms_last_checked ? new Date(r.iwbms_last_checked).toISOString() : undefined,
    iwbmsCheckStartedAt: r.iwbms_check_started_at ? new Date(r.iwbms_check_started_at).toISOString() : undefined,
    iwbmsCheckCompletedAt: r.iwbms_check_completed_at ? new Date(r.iwbms_check_completed_at).toISOString() : undefined,
    iwbmsError: r.iwbms_error || undefined,
  };
}

// Registrations CRUD
export async function getMySQLRegistrations(
  userIdFilter?: string,
  includeSubAgents: boolean = false,
  filters?: { fromSource?: string; taluka?: string; status?: string; fromDate?: string; toDate?: string }
): Promise<WorkerRegistration[]> {
  const p = getPool();
  const whereParts: string[] = [];
  const params: any[] = [];

  if (userIdFilter) {
    whereParts.push('r.created_by_user_id = ?');
    params.push(userIdFilter);
  } else if (!includeSubAgents) {
    whereParts.push('(u.role IS NULL OR u.role != "sub_agent")');
  }

  if (filters?.fromSource?.trim()) {
    whereParts.push('r.from_source LIKE ?');
    params.push(`%${filters.fromSource.trim()}%`);
  }
  if (filters?.taluka?.trim()) {
    whereParts.push('r.taluka = ?');
    params.push(filters.taluka.trim());
  }
  if (filters?.status?.trim()) {
    whereParts.push('r.status = ?');
    params.push(filters.status.trim());
  }
  if (filters?.fromDate?.trim()) {
    whereParts.push('r.registration_date >= ?');
    params.push(filters.fromDate.trim());
  }
  if (filters?.toDate?.trim()) {
    whereParts.push('r.registration_date <= ?');
    params.push(filters.toDate.trim());
  }

  const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';
  const query = `
    SELECT r.* FROM registrations r
    LEFT JOIN users u ON r.created_by_user_id = u.id
    ${whereClause}
    ORDER BY r.created_at DESC
  `;

  const [rows]: any = await p.query(query, params);
  return rows.map((r: any) => mapRegistrationRow(r));
}

/**
 * Returns strictly registrations created by Sub-Agents (role = 'sub_agent').
 * If subAgentId is specified, filters by that specific Sub-Agent ID.
 * If subAgentId is 'all' or undefined, returns ALL Sub-Agent registrations.
 */
export async function getMySQLSubAgentRegistrations(subAgentId?: string): Promise<WorkerRegistration[]> {
  const p = getPool();
  let query = '';
  const params: any[] = [];

  if (subAgentId && subAgentId !== 'all') {
    query = `
      SELECT r.* FROM registrations r
      INNER JOIN users u ON r.created_by_user_id = u.id
      WHERE u.role = 'sub_agent' AND r.created_by_user_id = ?
      ORDER BY r.created_at DESC
    `;
    params.push(subAgentId);
  } else {
    query = `
      SELECT r.* FROM registrations r
      INNER JOIN users u ON r.created_by_user_id = u.id
      WHERE u.role = 'sub_agent'
      ORDER BY r.created_at DESC
    `;
  }
  const [rows]: any = await p.query(query, params);
  return rows.map((r: any) => mapRegistrationRow(r));
}

export async function createMySQLRegistration(reg: Partial<WorkerRegistration>): Promise<WorkerRegistration> {
  const p = getPool();
  const normDob = normalizeDateToYMD(reg.dob) || null;
  const normVerDate = normalizeDateToYMD(reg.verificationDate) || null;
  const normRegDate = normalizeDateToYMD(reg.registrationDate) || new Date().toISOString().split('T')[0];
  const normNextRenewal = normalizeDateToYMD(reg.nextRenewalDate) || null;

  // Requirement 2 & 6: Never include id in INSERT statements. Let TiDB generate auto increment id.
  const [result]: any = await p.query(
    `INSERT INTO registrations (mh_number, worker_name, father_name, dob, gender, mobile_number, aadhaar_number, address, village, taluka, district, pincode, bank_name, account_number, ifsc, verification_date, registration_date, operator_name, status, app_status, from_source, next_renewal_date, fee_paid, category, nature_of_work, payment_amount, payment_mode, created_by_user_id, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
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
      reg.paymentMode === 'N/A' ? 0 : (reg.paymentAmount !== undefined && reg.paymentAmount !== null && !isNaN(Number(reg.paymentAmount)) ? Number(reg.paymentAmount) : (reg.feePaid !== undefined ? Number(reg.feePaid) : 100)),
      reg.category || null,
      reg.natureOfWork || null,
      reg.paymentMode === 'N/A' ? 0 : (reg.paymentAmount !== undefined && reg.paymentAmount !== null && !isNaN(Number(reg.paymentAmount)) ? Number(reg.paymentAmount) : null),
      reg.paymentMode || (reg.paymentAmount === 0 ? 'N/A' : 'Cash'),
      reg.createdByUserId || null,
      reg.createdBy || null,
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
    createdByUserId: r.created_by_user_id || undefined,
    createdBy: r.created_by || undefined,
    paymentAmount: r.payment_amount !== null && r.payment_amount !== undefined ? parseFloat(r.payment_amount) : undefined,
    paymentMode: (r.payment_mode as 'Cash' | 'Online' | 'N/A') || 'Cash',
  };
}

export async function updateMySQLRegistrationByMH(mhNumber: string, data: { status?: string; mobileNumber?: string; registrationDate?: string; nextRenewalDate?: string }) {
  const p = getPool();
  const conn = await p.getConnection();
  try {
    await conn.beginTransaction();

    // Pessimistic transaction lock: SELECT ... FOR UPDATE prevents concurrent operator conflict
    const [existingRows]: any = await conn.query('SELECT id FROM registrations WHERE mh_number = ? FOR UPDATE', [mhNumber]);
    if (!existingRows || existingRows.length === 0) {
      await conn.rollback();
      conn.release();
      return;
    }

    const fields: string[] = [];
    const values: any[] = [];
    if (data.status) { fields.push('status = ?'); values.push(data.status); }
    if (data.mobileNumber) { fields.push('mobile_number = ?'); values.push(data.mobileNumber); }
    if (data.registrationDate) { fields.push('registration_date = ?'); values.push(normalizeDateToYMD(data.registrationDate)); }
    if (data.nextRenewalDate) { fields.push('next_renewal_date = ?'); values.push(normalizeDateToYMD(data.nextRenewalDate)); }
    if (fields.length > 0) {
      values.push(mhNumber);
      await conn.query(`UPDATE registrations SET ${fields.join(', ')} WHERE mh_number = ?`, values);
    }

    await conn.commit();
    conn.release();
  } catch (err) {
    await conn.rollback();
    conn.release();
    throw err;
  }
}

export async function updateMySQLRegistration(id: string, reg: Partial<WorkerRegistration>): Promise<WorkerRegistration | null> {
  const p = getPool();
  const conn = await p.getConnection();

  try {
    await conn.beginTransaction();

    // Pessimistic transaction lock: SELECT ... FOR UPDATE
    // Ensures only one operator can lock and modify this registration record at a time,
    // avoiding race conditions and overwrite conflicts.
    const [existingRows]: any = await conn.query('SELECT * FROM registrations WHERE id = ? FOR UPDATE', [id]);
    if (!existingRows || existingRows.length === 0) {
      await conn.rollback();
      conn.release();
      return null;
    }

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
    if (reg.feePaid !== undefined) { 
      fields.push('fee_paid = ?'); 
      values.push(reg.paymentMode === 'N/A' ? 0 : reg.feePaid); 
    } else if (reg.paymentAmount !== undefined) {
      fields.push('fee_paid = ?');
      values.push(reg.paymentMode === 'N/A' ? 0 : Number(reg.paymentAmount));
    } else if (reg.paymentMode === 'N/A') {
      fields.push('fee_paid = ?');
      values.push(0);
    }
    if (reg.category !== undefined) { fields.push('category = ?'); values.push(reg.category); }
    if (reg.natureOfWork !== undefined) { fields.push('nature_of_work = ?'); values.push(reg.natureOfWork); }
    if (reg.appStatus !== undefined) { fields.push('app_status = ?'); values.push(reg.appStatus); }
    if (reg.fromSource !== undefined) { fields.push('from_source = ?'); values.push(reg.fromSource); }
    if (reg.nextRenewalDate !== undefined) { fields.push('next_renewal_date = ?'); values.push(reg.nextRenewalDate ? normalizeDateToYMD(reg.nextRenewalDate) : null); }
    if (reg.matchSource !== undefined) { fields.push('match_source = ?'); values.push(reg.matchSource); }
    if (reg.matchDate !== undefined) { fields.push('match_date = ?'); values.push(reg.matchDate); }
    if (reg.paymentAmount !== undefined) { 
      fields.push('payment_amount = ?'); 
      values.push(reg.paymentMode === 'N/A' ? 0 : (reg.paymentAmount !== null && !isNaN(Number(reg.paymentAmount)) ? Number(reg.paymentAmount) : null)); 
    } else if (reg.paymentMode === 'N/A') {
      fields.push('payment_amount = ?');
      values.push(0);
    }
    if (reg.paymentMode !== undefined) { fields.push('payment_mode = ?'); values.push(reg.paymentMode || 'Cash'); }

    if (fields.length > 0) {
      values.push(id);
      await conn.query(`UPDATE registrations SET ${fields.join(', ')} WHERE id = ?`, values);
    }

    const [rows]: any = await conn.query('SELECT * FROM registrations WHERE id = ?', [id]);
    await conn.commit();
    conn.release();

    return rows && rows.length > 0 ? mapRegistrationRow(rows[0]) : null;
  } catch (err) {
    await conn.rollback();
    conn.release();
    throw err;
  }
}


export async function deleteMySQLRegistration(id: string): Promise<void> {
  const p = getPool();
  await p.query('DELETE FROM registrations WHERE id = ?', [id]);
}

export async function deleteMySQLRegistrationsBulk(ids: string[]): Promise<number> {
  if (!ids || ids.length === 0) return 0;
  const p = getPool();
  const [result]: any = await p.query('DELETE FROM registrations WHERE id IN (?)', [ids]);
  return result?.affectedRows || 0;
}

export async function clearMySQLRegistrations(): Promise<void> {
  const p = getPool();
  await p.query('DELETE FROM registrations');
}

export function mapRenewalRow(r: any): WorkerRenewal {
  const paymentMode = (r.payment_mode as 'Cash' | 'Online' | 'N/A') || 'Cash';
  const rawPaymentAmt = r.payment_amount !== null && r.payment_amount !== undefined ? parseFloat(r.payment_amount) : undefined;
  const effFeeAmount = paymentMode === 'N/A'
    ? 0
    : (rawPaymentAmt !== undefined ? rawPaymentAmt : parseFloat(r.fee_amount !== null && r.fee_amount !== undefined ? r.fee_amount : 0));

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
    feeAmount: effFeeAmount,
    paymentAmount: paymentMode === 'N/A' ? 0 : (rawPaymentAmt !== undefined ? rawPaymentAmt : effFeeAmount),
    paymentMode: paymentMode,
    remarks: r.remarks || '',
    createdByUserId: r.created_by_user_id || undefined,
    createdBy: r.created_by || undefined,
    iwbmsStatus: r.iwbms_status || undefined,
    iwbmsLastChecked: r.iwbms_last_checked ? new Date(r.iwbms_last_checked).toISOString() : undefined,
    iwbmsCheckStartedAt: r.iwbms_check_started_at ? new Date(r.iwbms_check_started_at).toISOString() : undefined,
    iwbmsCheckCompletedAt: r.iwbms_check_completed_at ? new Date(r.iwbms_check_completed_at).toISOString() : undefined,
    iwbmsError: r.iwbms_error || undefined,
    renewalYear: r.renewal_year ? normalizeRenewalYear(r.renewal_year) : getFinancialYearFromDate(r.renewal_date || r.verification_date || r.created_at),
    aadhaarNumber: r.aadhaar_number || '',
  };
}

// Renewals CRUD
export async function getMySQLRenewals(
  userIdFilter?: string,
  includeSubAgents: boolean = false,
  filters?: { fromSource?: string; taluka?: string; status?: string; fromDate?: string; toDate?: string }
): Promise<WorkerRenewal[]> {
  const p = getPool();
  const whereParts: string[] = [];
  const params: any[] = [];

  if (userIdFilter) {
    whereParts.push('r.created_by_user_id = ?');
    params.push(userIdFilter);
  } else if (!includeSubAgents) {
    whereParts.push('(u.role IS NULL OR u.role != "sub_agent")');
  }

  if (filters?.fromSource?.trim()) {
    whereParts.push('r.from_source LIKE ?');
    params.push(`%${filters.fromSource.trim()}%`);
  }
  if (filters?.taluka?.trim()) {
    whereParts.push('r.taluka = ?');
    params.push(filters.taluka.trim());
  }
  if (filters?.status?.trim()) {
    whereParts.push('r.status = ?');
    params.push(filters.status.trim());
  }
  if (filters?.fromDate?.trim()) {
    whereParts.push('r.renewal_date >= ?');
    params.push(filters.fromDate.trim());
  }
  if (filters?.toDate?.trim()) {
    whereParts.push('r.renewal_date <= ?');
    params.push(filters.toDate.trim());
  }

  const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';
  const query = `
    SELECT r.* FROM renewals r
    LEFT JOIN users u ON r.created_by_user_id = u.id
    ${whereClause}
    ORDER BY r.created_at DESC
  `;

  const [rows]: any = await p.query(query, params);
  return rows.map((r: any) => mapRenewalRow(r));
}

/**
 * Returns strictly renewals created by Sub-Agents (role = 'sub_agent').
 * If subAgentId is specified, filters by that specific Sub-Agent ID.
 * If subAgentId is 'all' or undefined, returns ALL Sub-Agent renewals.
 */
export async function getMySQLSubAgentRenewals(subAgentId?: string): Promise<WorkerRenewal[]> {
  const p = getPool();
  let query = '';
  const params: any[] = [];

  if (subAgentId && subAgentId !== 'all') {
    query = `
      SELECT r.* FROM renewals r
      INNER JOIN users u ON r.created_by_user_id = u.id
      WHERE u.role = 'sub_agent' AND r.created_by_user_id = ?
      ORDER BY r.created_at DESC
    `;
    params.push(subAgentId);
  } else {
    query = `
      SELECT r.* FROM renewals r
      INNER JOIN users u ON r.created_by_user_id = u.id
      WHERE u.role = 'sub_agent'
      ORDER BY r.created_at DESC
    `;
  }
  const [rows]: any = await p.query(query, params);
  return rows.map((r: any) => mapRenewalRow(r));
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
    createdByUserId: r.created_by_user_id || undefined,
    createdBy: r.created_by || undefined,
  };
}

export async function createMySQLRenewal(ren: WorkerRenewal): Promise<WorkerRenewal> {
  const p = getPool();
  const normVerDate = normalizeDateToYMD(ren.verificationDate) || null;
  const normRenDate = normalizeDateToYMD(ren.renewalDate) || new Date().toISOString().split('T')[0];
  const normValidTill = normalizeDateToYMD(ren.validTill) || null;
  const normNewExpiry = normalizeDateToYMD(ren.newExpiryDate) || null;
  const targetYear = ren.renewalYear
    ? normalizeRenewalYear(ren.renewalYear)
    : getFinancialYearFromDate(ren.renewalDate || ren.verificationDate);
  const cleanAadhaar = ren.aadhaarNumber ? ren.aadhaarNumber.trim().replace(/\D/g, '') : null;

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
        `INSERT INTO renewals (
          id, mh_number, worker_name, mobile_number, verification_date, renewal_date,
          taluka, from_source, operator_name, status, renewal_period_years, receipt_number,
          valid_till, new_expiry_date, fee_amount, remarks, payment_amount, payment_mode,
          created_by_user_id, created_by, renewal_year, aadhaar_number, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
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
          ren.paymentMode === 'N/A' ? 0 : (ren.paymentAmount !== undefined && ren.paymentAmount !== null && !isNaN(Number(ren.paymentAmount)) ? Number(ren.paymentAmount) : (ren.feeAmount !== undefined ? Number(ren.feeAmount) : 0)),
          ren.remarks || null,
          ren.paymentMode === 'N/A' ? 0 : (ren.paymentAmount !== undefined && ren.paymentAmount !== null && !isNaN(Number(ren.paymentAmount)) ? Number(ren.paymentAmount) : null),
          ren.paymentMode || (ren.paymentAmount === 0 ? 'N/A' : 'Cash'),
          ren.createdByUserId || null,
          ren.createdBy || null,
          targetYear,
          cleanAadhaar,
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
  return mapRenewalRow(rows[0]);
}

export async function updateMySQLRenewal(
  id: string,
  updatedFields: Partial<WorkerRenewal>
): Promise<WorkerRenewal | null> {
  const p = getPool();
  const conn = await p.getConnection();

  try {
    await conn.beginTransaction();

    // Pessimistic transaction lock: SELECT ... FOR UPDATE prevents concurrent operator conflict
    const [existingRows]: any = await conn.query('SELECT * FROM renewals WHERE id = ? FOR UPDATE', [id]);
    if (!existingRows || existingRows.length === 0) {
      await conn.rollback();
      conn.release();
      return null;
    }

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
      values.push(updatedFields.paymentMode === 'N/A' ? 0 : updatedFields.feeAmount);
    } else if (updatedFields.paymentAmount !== undefined) {
      updates.push('fee_amount = ?');
      values.push(updatedFields.paymentMode === 'N/A' ? 0 : Number(updatedFields.paymentAmount));
    } else if (updatedFields.paymentMode === 'N/A') {
      updates.push('fee_amount = ?');
      values.push(0);
    }
    if (updatedFields.remarks !== undefined) {
      updates.push('remarks = ?');
      values.push(updatedFields.remarks);
    }
    if (updatedFields.paymentAmount !== undefined) {
      updates.push('payment_amount = ?');
      values.push(updatedFields.paymentMode === 'N/A' ? 0 : (updatedFields.paymentAmount !== null && !isNaN(Number(updatedFields.paymentAmount)) ? Number(updatedFields.paymentAmount) : null));
    } else if (updatedFields.paymentMode === 'N/A') {
      updates.push('payment_amount = ?');
      values.push(0);
    }
    if (updatedFields.paymentMode !== undefined) {
      updates.push('payment_mode = ?');
      values.push(updatedFields.paymentMode || 'Cash');
    }
    if (updatedFields.renewalYear !== undefined) {
      updates.push('renewal_year = ?');
      values.push(normalizeRenewalYear(updatedFields.renewalYear));
    }
    if (updatedFields.aadhaarNumber !== undefined) {
      updates.push('aadhaar_number = ?');
      values.push(updatedFields.aadhaarNumber.trim().replace(/\D/g, ''));
    }

    if (updates.length > 0) {
      values.push(id);
      await conn.query(`UPDATE renewals SET ${updates.join(', ')} WHERE id = ?`, values);
    }

    const [rows]: any = await conn.query('SELECT * FROM renewals WHERE id = ?', [id]);
    await conn.commit();
    conn.release();

    return rows && rows.length > 0 ? mapRenewalRow(rows[0]) : null;
  } catch (err) {
    await conn.rollback();
    conn.release();
    throw err;
  }
}

export interface WorkerRenewalHistoryResult {
  worker: {
    workerName: string;
    mhNumber: string;
    mobileNumber: string;
    aadhaarNumber: string;
    taluka: string;
    fromSource: string;
    registrationDate?: string;
  } | null;
  renewals: WorkerRenewal[];
  lastRenewalYear: string | null;
  nextRenewalYear: string;
}

/**
 * Fetches the complete renewal history for a worker based on MH Number, Aadhaar Number, or Mobile Number.
 * Sorted newest first by renewalYear and renewalDate.
 */
export async function getWorkerRenewalHistory(options: {
  mhNumber?: string;
  aadhaarNumber?: string;
  mobileNumber?: string;
}): Promise<WorkerRenewalHistoryResult> {
  const p = getPool();
  const rawMh = options.mhNumber ? String(options.mhNumber).trim() : '';
  const cleanMh = rawMh.toUpperCase().replace(/[\s-]/g, '');
  const cleanAadhaar = options.aadhaarNumber ? String(options.aadhaarNumber).trim().replace(/\D/g, '') : '';
  const cleanMobile = options.mobileNumber ? String(options.mobileNumber).trim().replace(/\D/g, '') : '';

  const currentFY = getFinancialYearFromDate(new Date());

  if (!cleanMh && !cleanAadhaar && !cleanMobile) {
    return {
      worker: null,
      renewals: [],
      lastRenewalYear: null,
      nextRenewalYear: currentFY,
    };
  }

  // 1. Try to find the worker in registrations to get complete canonical info
  let matchedReg: any = null;
  if (cleanMh && cleanMh.length >= 6) {
    const [regs]: any = await p.query(
      'SELECT * FROM registrations WHERE REPLACE(REPLACE(UPPER(mh_number), " ", ""), "-", "") = ? LIMIT 1',
      [cleanMh]
    );
    if (regs && regs.length > 0) matchedReg = regs[0];
  }

  if (!matchedReg && cleanAadhaar && cleanAadhaar.length >= 10) {
    const [regs]: any = await p.query(
      'SELECT * FROM registrations WHERE REPLACE(aadhaar_number, " ", "") = ? LIMIT 1',
      [cleanAadhaar]
    );
    if (regs && regs.length > 0) matchedReg = regs[0];
  }

  if (!matchedReg && cleanMobile && cleanMobile.length === 10) {
    const [regs]: any = await p.query(
      'SELECT * FROM registrations WHERE RIGHT(REPLACE(mobile_number, " ", ""), 10) = ? LIMIT 1',
      [cleanMobile]
    );
    if (regs && regs.length > 0) matchedReg = regs[0];
  }

  // Identifiers for querying renewals
  const searchMh = cleanMh || (matchedReg?.mh_number ? matchedReg.mh_number.toUpperCase().replace(/[\s-]/g, '') : '');
  const searchAadhaar = cleanAadhaar || (matchedReg?.aadhaar_number ? String(matchedReg.aadhaar_number).replace(/\D/g, '') : '');
  const searchMobile = cleanMobile || (matchedReg?.mobile_number ? String(matchedReg.mobile_number).replace(/\D/g, '') : '');

  const conditions: string[] = [];
  const params: any[] = [];

  if (searchMh) {
    conditions.push('REPLACE(REPLACE(UPPER(mh_number), " ", ""), "-", "") = ?');
    params.push(searchMh);
  }
  if (searchAadhaar && searchAadhaar.length >= 10) {
    conditions.push('REPLACE(aadhaar_number, " ", "") = ?');
    params.push(searchAadhaar);
  }
  if (searchMobile && searchMobile.length === 10) {
    conditions.push('RIGHT(REPLACE(mobile_number, " ", ""), 10) = ?');
    params.push(searchMobile);
  }

  let renewalsList: WorkerRenewal[] = [];
  if (conditions.length > 0) {
    const query = `
      SELECT * FROM renewals
      WHERE ${conditions.join(' OR ')}
      ORDER BY created_at DESC
    `;
    const [rows]: any = await p.query(query, params);
    const seenIds = new Set<string>();
    for (const r of rows) {
      if (!seenIds.has(r.id)) {
        seenIds.add(r.id);
        renewalsList.push(mapRenewalRow(r));
      }
    }
  }

  // Sort newest first by renewalYear and date
  renewalsList.sort((a, b) => {
    const yearComp = compareRenewalYearsDesc(a.renewalYear, b.renewalYear);
    if (yearComp !== 0) return yearComp;
    const dateA = a.renewalDate || a.createdAt || '';
    const dateB = b.renewalDate || b.createdAt || '';
    return dateB.localeCompare(dateA);
  });

  // Calculate lastRenewalYear and nextRenewalYear
  let lastRenewalYear: string | null = null;
  if (renewalsList.length > 0) {
    for (const ren of renewalsList) {
      if (ren.renewalYear) {
        lastRenewalYear = ren.renewalYear;
        break;
      }
    }
  }

  const nextRenewalYear = getNextRenewalYear(lastRenewalYear);

  const workerInfo = matchedReg ? {
    workerName: matchedReg.worker_name,
    mhNumber: matchedReg.mh_number,
    mobileNumber: matchedReg.mobile_number,
    aadhaarNumber: matchedReg.aadhaar_number || '',
    taluka: matchedReg.taluka || '',
    fromSource: matchedReg.from_source || '',
    registrationDate: matchedReg.registration_date ? normalizeDateToYMD(matchedReg.registration_date) : '',
  } : renewalsList.length > 0 ? {
    workerName: renewalsList[0].workerName,
    mhNumber: renewalsList[0].mhNumber,
    mobileNumber: renewalsList[0].mobileNumber,
    aadhaarNumber: renewalsList[0].aadhaarNumber || searchAadhaar,
    taluka: renewalsList[0].taluka || '',
    fromSource: renewalsList[0].fromSource || '',
  } : null;

  return {
    worker: workerInfo,
    renewals: renewalsList,
    lastRenewalYear,
    nextRenewalYear,
  };
}

/**
 * Checks if a renewal already exists for the given worker in the specified renewal year.
 */
export async function checkDuplicateRenewal(options: {
  mhNumber?: string;
  aadhaarNumber?: string;
  mobileNumber?: string;
  renewalYear: string;
  excludeId?: string;
}): Promise<{ isDuplicate: boolean; existingRenewal: WorkerRenewal | null }> {
  const targetYear = normalizeRenewalYear(options.renewalYear);
  if (!targetYear) return { isDuplicate: false, existingRenewal: null };

  const history = await getWorkerRenewalHistory({
    mhNumber: options.mhNumber,
    aadhaarNumber: options.aadhaarNumber,
    mobileNumber: options.mobileNumber,
  });

  for (const ren of history.renewals) {
    if (options.excludeId && ren.id === options.excludeId) {
      continue;
    }
    const renYear = normalizeRenewalYear(ren.renewalYear);
    if (renYear === targetYear) {
      return { isDuplicate: true, existingRenewal: ren };
    }
  }

  return { isDuplicate: false, existingRenewal: null };
}

/**
 * Creates two separate yearly renewal records for Double Renewal (e.g. 2025-26 and 2026-27).
 * Each year is saved as an independent permanent record.
 */
export async function createDoubleRenewal(ren: WorkerRenewal): Promise<{ renewal1: WorkerRenewal; renewal2: WorkerRenewal }> {
  const year1 = ren.renewalYear ? normalizeRenewalYear(ren.renewalYear) : getFinancialYearFromDate(ren.renewalDate);
  const year2 = getNextRenewalYear(year1);

  const ren1: WorkerRenewal = {
    ...ren,
    renewalYear: year1,
    renewalPeriodYears: 1,
  };

  const ren2: WorkerRenewal = {
    ...ren,
    id: undefined as any,
    renewalYear: year2,
    renewalPeriodYears: 1,
  };

  const created1 = await createMySQLRenewal(ren1);
  const created2 = await createMySQLRenewal(ren2);

  return { renewal1: created1, renewal2: created2 };
}

export async function deleteMySQLRenewal(id: string): Promise<void> {
  const p = getPool();
  await p.query('DELETE FROM renewals WHERE id = ?', [id]);
}

export async function deleteMySQLRenewalsBulk(ids: string[]): Promise<number> {
  if (!ids || ids.length === 0) return 0;
  const p = getPool();
  const [result]: any = await p.query('DELETE FROM renewals WHERE id IN (?)', [ids]);
  return result?.affectedRows || 0;
}

export async function clearMySQLRenewals(): Promise<void> {
  const p = getPool();
  await p.query('DELETE FROM renewals');
}

export function mapClaimRow(c: any): WorkerClaim {
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
    claimDate: c.claim_date ? normalizeDateToYMD(c.claim_date) : '',
    fromSource: c.from_source || c.reg_from_source || undefined,
    createdByUserId: c.created_by_user_id || undefined,
    createdBy: c.created_by || undefined,
    iwbmsStatus: c.iwbms_status || undefined,
    iwbmsLastChecked: c.iwbms_last_checked ? new Date(c.iwbms_last_checked).toISOString() : undefined,
    iwbmsCheckStartedAt: c.iwbms_check_started_at ? new Date(c.iwbms_check_started_at).toISOString() : undefined,
    iwbmsCheckCompletedAt: c.iwbms_check_completed_at ? new Date(c.iwbms_check_completed_at).toISOString() : undefined,
    iwbmsError: c.iwbms_error || undefined,
  };
}

// Claims CRUD
export async function getMySQLClaims(
  userIdFilter?: string,
  includeSubAgents: boolean = false,
  filters?: { fromSource?: string; taluka?: string; status?: string; fromDate?: string; toDate?: string }
): Promise<WorkerClaim[]> {
  const p = getPool();
  const whereParts: string[] = [];
  const params: any[] = [];

  if (userIdFilter) {
    whereParts.push('c.created_by_user_id = ?');
    params.push(userIdFilter);
  } else if (!includeSubAgents) {
    whereParts.push('(u.role IS NULL OR u.role != "sub_agent")');
  }

  if (filters?.fromSource?.trim()) {
    whereParts.push('(c.from_source LIKE ? OR r.from_source LIKE ?)');
    const term = `%${filters.fromSource.trim()}%`;
    params.push(term, term);
  }
  if (filters?.taluka?.trim()) {
    whereParts.push('c.taluka = ?');
    params.push(filters.taluka.trim());
  }
  if (filters?.status?.trim() && filters.status !== 'All') {
    whereParts.push('c.status = ?');
    params.push(filters.status.trim());
  }
  if (filters?.fromDate?.trim()) {
    whereParts.push('c.claim_date >= ?');
    params.push(filters.fromDate.trim());
  }
  if (filters?.toDate?.trim()) {
    whereParts.push('c.claim_date <= ?');
    params.push(filters.toDate.trim());
  }

  const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';
  const query = `
    SELECT c.*, r.from_source AS reg_from_source FROM claims c
    LEFT JOIN users u ON c.created_by_user_id = u.id
    LEFT JOIN registrations r ON c.mh_number = r.mh_number
    ${whereClause}
    ORDER BY c.created_at DESC
  `;

  const [rows]: any = await p.query(query, params);
  return rows.map((c: any) => mapClaimRow(c));
}

/**
 * Returns strictly claims created by Sub-Agents (role = 'sub_agent').
 * If subAgentId is specified, filters by that specific Sub-Agent ID.
 * If subAgentId is 'all' or undefined, returns ALL Sub-Agent claims.
 */
export async function getMySQLSubAgentClaims(subAgentId?: string): Promise<WorkerClaim[]> {
  const p = getPool();
  let query = '';
  const params: any[] = [];

  if (subAgentId && subAgentId !== 'all') {
    query = `
      SELECT c.* FROM claims c
      INNER JOIN users u ON c.created_by_user_id = u.id
      WHERE u.role = 'sub_agent' AND c.created_by_user_id = ?
      ORDER BY c.created_at DESC
    `;
    params.push(subAgentId);
  } else {
    query = `
      SELECT c.* FROM claims c
      INNER JOIN users u ON c.created_by_user_id = u.id
      WHERE u.role = 'sub_agent'
      ORDER BY c.created_at DESC
    `;
  }
  const [rows]: any = await p.query(query, params);
  return rows.map((c: any) => mapClaimRow(c));
}

export async function createMySQLClaim(claim: WorkerClaim): Promise<WorkerClaim> {
  const p = getPool();
  const normClaimDate = normalizeDateToYMD(claim.claimDate) || new Date().toISOString().split('T')[0];

  await p.query(
    `INSERT INTO claims (id, mh_number, worker_name, taluka, scheme1_id, scheme1_name, scheme1_amount, scheme2_id, scheme2_name, scheme2_amount, total_amount, mobile_number, operator_name, status, remarks, claim_date, from_source, created_by_user_id, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
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
      claim.fromSource || null,
      claim.createdByUserId || null,
      claim.createdBy || null,
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
    createdByUserId: c.created_by_user_id || undefined,
    createdBy: c.created_by || undefined,
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

export async function deleteMySQLClaimsBulk(ids: string[]): Promise<number> {
  if (!ids || ids.length === 0) return 0;
  const p = getPool();
  const [result]: any = await p.query('DELETE FROM claims WHERE id IN (?)', [ids]);
  return result?.affectedRows || 0;
}

export async function clearMySQLClaims(): Promise<void> {
  const p = getPool();
  await p.query('DELETE FROM claims');
}

// Old Claims (जुना क्लेम डेटा Archive) CRUD
function mapOldClaimRow(row: any): OldWorkerClaim {
  return {
    id: row.id,
    srNo: row.sr_no ? Number(row.sr_no) : undefined,
    workerName: row.worker_name || '',
    mhNumber: row.mh_number || '',
    verificationDate: row.verification_date || '',
    taluka: row.taluka || '',
    scheme1: row.scheme1 || '',
    scheme2: row.scheme2 || '',
    scheme1Amount: parseFloat(row.scheme1_amount || 0),
    scheme2Amount: row.scheme2_amount ? parseFloat(row.scheme2_amount) : 0,
    totalAmount: parseFloat(row.total_amount || 0),
    fromSource: row.from_source || 'OFFICE',
    mobileNumber: row.mobile_number || '',
    formFill: row.form_fill || '',
    status: row.status || 'Old Record',
    remarks: row.remarks || '',
    createdBy: row.created_by || '',
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : '',
  };
}

export async function getMySQLOldClaims(filters?: {
  fromSource?: string;
  taluka?: string;
  scheme?: string;
  fromDate?: string;
  toDate?: string;
}): Promise<OldWorkerClaim[]> {
  const p = getPool();
  try {
    const whereParts: string[] = [];
    const params: any[] = [];

    if (filters?.fromSource?.trim()) {
      whereParts.push('from_source LIKE ?');
      params.push(`%${filters.fromSource.trim()}%`);
    }
    if (filters?.taluka?.trim()) {
      whereParts.push('taluka = ?');
      params.push(filters.taluka.trim());
    }
    if (filters?.scheme?.trim()) {
      whereParts.push('(scheme1 = ? OR scheme2 = ?)');
      params.push(filters.scheme.trim(), filters.scheme.trim());
    }
    if (filters?.fromDate?.trim()) {
      whereParts.push('verification_date >= ?');
      params.push(filters.fromDate.trim());
    }
    if (filters?.toDate?.trim()) {
      whereParts.push('verification_date <= ?');
      params.push(filters.toDate.trim());
    }

    const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';
    const [rows]: any = await p.query(`SELECT * FROM old_claims ${whereClause} ORDER BY sr_no ASC, created_at DESC`, params);
    return rows.map((r: any) => mapOldClaimRow(r));
  } catch (err: any) {
    console.error('Error fetching old claims:', err);
    return [];
  }
}

/**
 * Fetches distinct From source names across tables for searchable autocomplete.
 * Does not load entire tables into memory.
 */
export async function getMySQLDistinctFromSources(type: string = 'all', search: string = ''): Promise<string[]> {
  const p = getPool();
  const q = search?.trim();
  const likeParam = `%${q}%`;

  try {
    let query = '';
    const params: any[] = [];

    if (type === 'registration') {
      query = `SELECT DISTINCT TRIM(from_source) AS val FROM registrations WHERE from_source IS NOT NULL AND TRIM(from_source) != '' ${q ? 'AND from_source LIKE ?' : ''} ORDER BY val ASC LIMIT 200`;
      if (q) params.push(likeParam);
    } else if (type === 'renewal') {
      query = `SELECT DISTINCT TRIM(from_source) AS val FROM renewals WHERE from_source IS NOT NULL AND TRIM(from_source) != '' ${q ? 'AND from_source LIKE ?' : ''} ORDER BY val ASC LIMIT 200`;
      if (q) params.push(likeParam);
    } else if (type === 'claim') {
      query = `
        SELECT DISTINCT TRIM(val) AS val FROM (
          SELECT from_source AS val FROM claims WHERE from_source IS NOT NULL AND TRIM(from_source) != ''
          UNION
          SELECT r.from_source AS val FROM registrations r INNER JOIN claims c ON r.mh_number = c.mh_number WHERE r.from_source IS NOT NULL AND TRIM(r.from_source) != ''
        ) t ${q ? 'WHERE val LIKE ?' : ''} ORDER BY val ASC LIMIT 200
      `;
      if (q) params.push(likeParam);
    } else if (type === 'old_claim') {
      query = `SELECT DISTINCT TRIM(from_source) AS val FROM old_claims WHERE from_source IS NOT NULL AND TRIM(from_source) != '' ${q ? 'AND from_source LIKE ?' : ''} ORDER BY val ASC LIMIT 200`;
      if (q) params.push(likeParam);
    } else {
      query = `
        SELECT DISTINCT TRIM(val) AS val FROM (
          SELECT from_source AS val FROM registrations WHERE from_source IS NOT NULL AND TRIM(from_source) != ''
          UNION
          SELECT from_source AS val FROM renewals WHERE from_source IS NOT NULL AND TRIM(from_source) != ''
          UNION
          SELECT from_source AS val FROM claims WHERE from_source IS NOT NULL AND TRIM(from_source) != ''
          UNION
          SELECT from_source AS val FROM old_claims WHERE from_source IS NOT NULL AND TRIM(from_source) != ''
          UNION
          SELECT from_source AS val FROM claim_payment_workers WHERE from_source IS NOT NULL AND TRIM(from_source) != ''
        ) all_src ${q ? 'WHERE val LIKE ?' : ''} ORDER BY val ASC LIMIT 200
      `;
      if (q) params.push(likeParam);
    }

    const [rows]: any = await p.query(query, params);
    const results: string[] = (rows || []).map((r: any) => r.val).filter(Boolean);
    return Array.from(new Set(results)).sort();
  } catch (err: any) {
    console.error('Error fetching distinct from sources:', err);
    return [];
  }
}

export async function createMySQLOldClaim(claim: OldWorkerClaim): Promise<OldWorkerClaim> {
  const p = getPool();
  await p.query(
    `INSERT INTO old_claims (id, sr_no, worker_name, mh_number, verification_date, taluka, scheme1, scheme2, scheme1_amount, scheme2_amount, total_amount, from_source, mobile_number, form_fill, status, remarks, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      claim.id,
      claim.srNo || null,
      claim.workerName,
      claim.mhNumber,
      claim.verificationDate || '',
      claim.taluka || '',
      claim.scheme1 || '',
      claim.scheme2 || null,
      claim.scheme1Amount || 0,
      claim.scheme2Amount || 0,
      claim.totalAmount || 0,
      claim.fromSource || 'OFFICE',
      claim.mobileNumber || '',
      claim.formFill || null,
      claim.status || 'Old Record',
      claim.remarks || null,
      claim.createdBy || null,
    ]
  );
  return claim;
}

export async function insertMySQLOldClaimsBulk(claims: OldWorkerClaim[]): Promise<number> {
  if (!claims || claims.length === 0) return 0;
  const p = getPool();
  let count = 0;
  const chunkSize = 50;
  for (let i = 0; i < claims.length; i += chunkSize) {
    const chunk = claims.slice(i, i + chunkSize);
    const values: any[] = [];
    const placeholders: string[] = [];
    for (const c of chunk) {
      placeholders.push('(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())');
      values.push(
        c.id,
        c.srNo || null,
        c.workerName,
        c.mhNumber,
        c.verificationDate || '',
        c.taluka || '',
        c.scheme1 || '',
        c.scheme2 || null,
        c.scheme1Amount || 0,
        c.scheme2Amount || 0,
        c.totalAmount || 0,
        c.fromSource || 'OFFICE',
        c.mobileNumber || '',
        c.formFill || null,
        c.status || 'Old Record',
        c.remarks || null,
        c.createdBy || null,
      );
    }
    await p.query(
      `INSERT INTO old_claims (id, sr_no, worker_name, mh_number, verification_date, taluka, scheme1, scheme2, scheme1_amount, scheme2_amount, total_amount, from_source, mobile_number, form_fill, status, remarks, created_by, created_at)
       VALUES ${placeholders.join(', ')}
       ON DUPLICATE KEY UPDATE
         worker_name = VALUES(worker_name),
         verification_date = VALUES(verification_date),
         taluka = VALUES(taluka),
         scheme1 = VALUES(scheme1),
         scheme2 = VALUES(scheme2),
         scheme1_amount = VALUES(scheme1_amount),
         scheme2_amount = VALUES(scheme2_amount),
         total_amount = VALUES(total_amount),
         from_source = VALUES(from_source),
         mobile_number = VALUES(mobile_number),
         form_fill = VALUES(form_fill)`,
      values
    );
    count += chunk.length;
  }
  return count;
}

export async function updateMySQLOldClaim(id: string, updates: Partial<OldWorkerClaim>): Promise<void> {
  const p = getPool();
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.workerName !== undefined) { fields.push('worker_name = ?'); values.push(updates.workerName); }
  if (updates.mhNumber !== undefined) { fields.push('mh_number = ?'); values.push(updates.mhNumber); }
  if (updates.verificationDate !== undefined) { fields.push('verification_date = ?'); values.push(updates.verificationDate); }
  if (updates.taluka !== undefined) { fields.push('taluka = ?'); values.push(updates.taluka); }
  if (updates.scheme1 !== undefined) { fields.push('scheme1 = ?'); values.push(updates.scheme1); }
  if (updates.scheme2 !== undefined) { fields.push('scheme2 = ?'); values.push(updates.scheme2); }
  if (updates.scheme1Amount !== undefined) { fields.push('scheme1_amount = ?'); values.push(updates.scheme1Amount); }
  if (updates.scheme2Amount !== undefined) { fields.push('scheme2_amount = ?'); values.push(updates.scheme2Amount); }
  if (updates.totalAmount !== undefined) { fields.push('total_amount = ?'); values.push(updates.totalAmount); }
  if (updates.fromSource !== undefined) { fields.push('from_source = ?'); values.push(updates.fromSource); }
  if (updates.mobileNumber !== undefined) { fields.push('mobile_number = ?'); values.push(updates.mobileNumber); }
  if (updates.formFill !== undefined) { fields.push('form_fill = ?'); values.push(updates.formFill); }
  if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
  if (updates.remarks !== undefined) { fields.push('remarks = ?'); values.push(updates.remarks); }

  if (fields.length > 0) {
    values.push(id);
    await p.query(`UPDATE old_claims SET ${fields.join(', ')} WHERE id = ?`, values);
  }
}

export async function deleteMySQLOldClaim(id: string): Promise<void> {
  const p = getPool();
  await p.query('DELETE FROM old_claims WHERE id = ?', [id]);
}

export async function deleteMySQLOldClaimsBulk(ids: string[]): Promise<number> {
  if (!ids || ids.length === 0) return 0;
  const p = getPool();
  const [result]: any = await p.query('DELETE FROM old_claims WHERE id IN (?)', [ids]);
  return result?.affectedRows || 0;
}

export async function clearMySQLOldClaims(): Promise<void> {
  const p = getPool();
  await p.query('DELETE FROM old_claims');
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

let cachedSettings: OfficeSettings | null = null;

export async function getMySQLSettings(): Promise<OfficeSettings | null> {
  if (cachedSettings) return cachedSettings;
  const p = getPool();
  const [rows]: any = await p.query('SELECT * FROM settings WHERE id = 1');
  if (rows && rows.length > 0) {
    const s = rows[0];
    cachedSettings = {
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
    return cachedSettings;
  }
  return null;
}

export async function updateMySQLSettings(st: OfficeSettings): Promise<void> {
  cachedSettings = null;
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
  cachedSettings = { ...st };
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
    isLegacyRecord: Boolean(r.is_legacy_record),
    legacyVerifiedAt: r.legacy_verified_at ? new Date(r.legacy_verified_at).toISOString() : undefined,
    legacyVerifiedBy: r.legacy_verified_by || undefined,

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
let lastMaterialSyncTime = 0;
export async function syncMaterialDistributionsWithWorkers(force = false): Promise<void> {
  try {
    const now = Date.now();
    if (!force && now - lastMaterialSyncTime < 30000) {
      return;
    }
    lastMaterialSyncTime = now;

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
        // Create new record with default 'Pending' statuses and mark as legacy record for manual verification
        const id = `mat_${mh.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`;
        await p.query(
          `INSERT INTO material_distributions (id, mh_number, worker_name, mobile_number, taluka, source_type, is_legacy_record, bhandi_status, peti_status, bag_status)
           VALUES (?, ?, ?, ?, ?, ?, 1, 'Pending', 'Pending', 'Pending')`,
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

// Fetch current material inventory stock for all 3 kits (भांडी, पेटी, बॅग)
export async function getMySQLMaterialInventory(): Promise<MaterialInventoryRecord[]> {
  try {
    const p = getPool();
    const [rows]: any = await p.query('SELECT * FROM material_inventory ORDER BY kit_type ASC');
    if (!rows || rows.length === 0) {
      await p.query(`
        INSERT INTO \`material_inventory\` (\`kit_type\`, \`kit_name\`, \`available_stock\`, \`total_distributed\`)
        VALUES
          ('bhandi', 'भांडी (Cooking Utensils)', 100, 0),
          ('peti', 'पेटी (Trunk Box)', 100, 0),
          ('bag', 'बॅग (Safety Gear Bag)', 100, 0)
        ON DUPLICATE KEY UPDATE \`kit_name\` = VALUES(\`kit_name\`);
      `);
      const [seeded]: any = await p.query('SELECT * FROM material_inventory ORDER BY kit_type ASC');
      return (seeded || []).map((r: any) => ({
        kitType: r.kit_type,
        kitName: r.kit_name,
        availableStock: Number(r.available_stock),
        totalDistributed: Number(r.total_distributed),
        updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : undefined,
      }));
    }
    return rows.map((r: any) => ({
      kitType: r.kit_type,
      kitName: r.kit_name,
      availableStock: Number(r.available_stock),
      totalDistributed: Number(r.total_distributed),
      updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : undefined,
    }));
  } catch (err) {
    console.error('Error fetching material inventory from MySQL:', err);
    return [
      { kitType: 'bhandi', kitName: 'भांडी (Cooking Utensils)', availableStock: 100, totalDistributed: 0 },
      { kitType: 'peti', kitName: 'पेटी (Trunk Box)', availableStock: 100, totalDistributed: 0 },
      { kitType: 'bag', kitName: 'बॅग (Safety Gear Bag)', availableStock: 100, totalDistributed: 0 },
    ];
  }
}

// Admin Stock Adjustment / Stock Replenishment
export async function adjustMySQLMaterialInventory(
  kitType: 'bhandi' | 'peti' | 'bag',
  quantityChange: number,
  mode: 'add' | 'set' = 'add'
): Promise<MaterialInventoryRecord | null> {
  const p = getPool();
  const conn = await p.getConnection();
  try {
    await conn.beginTransaction();
    const [rows]: any = await conn.query('SELECT * FROM material_inventory WHERE kit_type = ? FOR UPDATE', [kitType]);
    if (!rows || rows.length === 0) {
      await conn.rollback();
      return null;
    }
    const current = rows[0];
    const newStock = mode === 'set' ? quantityChange : Number(current.available_stock) + quantityChange;
    if (newStock < 0) {
      throw new Error(`उल्लंघन: उपलब्ध स्टॉक 0 पेक्षा कमी असू शकत नाही (Stock cannot be negative).`);
    }
    await conn.query('UPDATE material_inventory SET available_stock = ? WHERE kit_type = ?', [newStock, kitType]);
    await conn.commit();

    const [updated]: any = await p.query('SELECT * FROM material_inventory WHERE kit_type = ?', [kitType]);
    return {
      kitType: updated[0].kit_type,
      kitName: updated[0].kit_name,
      availableStock: Number(updated[0].available_stock),
      totalDistributed: Number(updated[0].total_distributed),
      updatedAt: updated[0].updated_at ? new Date(updated[0].updated_at).toISOString() : undefined,
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// Update status of a specific material or all materials for a record
// Includes pessimistic transaction lock (FOR UPDATE), atomic inventory deduction/restoration, and legacy verification handling
export async function updateMySQLMaterialStatus(
  id: string,
  materialType: 'bhandi' | 'peti' | 'bag' | 'all',
  newStatus: 'Pending' | 'Given' | 'Not Eligible',
  updatedBy: string,
  updatedDate: string,
  reason?: string
): Promise<MaterialDistributionRecord | null> {
  const p = getPool();
  const conn = await p.getConnection();

  try {
    await conn.beginTransaction();

    // Pessimistic row-lock on material distribution record
    const [existingRows]: any = await conn.query(
      'SELECT * FROM material_distributions WHERE id = ? OR mh_number = ? FOR UPDATE',
      [id, id]
    );
    if (!existingRows || existingRows.length === 0) {
      await conn.rollback();
      return null;
    }
    const target = existingRows[0];

    const materialsToUpdate: ('bhandi' | 'peti' | 'bag')[] =
      materialType === 'all' ? ['bhandi', 'peti', 'bag'] : [materialType];

    for (const mat of materialsToUpdate) {
      const oldStatus = target[`${mat}_status`] || 'Pending';

      // Inventory Adjustment Rules:
      // 1. NOT RECEIVED/PENDING -> RECEIVED/GIVEN: Deduct exactly 1 from stock, increase distributed
      // 2. RECEIVED/GIVEN -> NOT RECEIVED/PENDING: Safely restore 1 to stock, decrease distributed
      // 3. Same status or already received: Do NOT deduct stock again!
      if (oldStatus !== 'Given' && newStatus === 'Given') {
        const [invRows]: any = await conn.query(
          'SELECT * FROM material_inventory WHERE kit_type = ? FOR UPDATE',
          [mat]
        );
        if (invRows && invRows.length > 0) {
          await conn.query(
            'UPDATE material_inventory SET available_stock = GREATEST(0, available_stock - 1), total_distributed = total_distributed + 1 WHERE kit_type = ?',
            [mat]
          );
        }
      } else if (oldStatus === 'Given' && newStatus !== 'Given') {
        await conn.query(
          'UPDATE material_inventory SET available_stock = available_stock + 1, total_distributed = GREATEST(0, total_distributed - 1) WHERE kit_type = ?',
          [mat]
        );
      }

      let givenDateVal: string | null = null;
      let givenByVal: string | null = null;
      let notEligibleReasonVal: string | null = null;

      if (newStatus === 'Given') {
        givenDateVal = updatedDate;
        givenByVal = updatedBy;
      } else if (newStatus === 'Not Eligible') {
        notEligibleReasonVal = reason || 'Not eligible for material';
      } else if (newStatus === 'Pending') {
        givenDateVal = null;
        givenByVal = null;
        notEligibleReasonVal = null;
      }

      await conn.query(
        `UPDATE material_distributions
         SET \`${mat}_status\` = ?,
             \`${mat}_given_date\` = ?,
             \`${mat}_given_by\` = ?,
             \`${mat}_not_eligible_reason\` = ?,
             \`${mat}_updated_by\` = ?,
             \`${mat}_updated_date\` = ?,
             is_legacy_record = 0,
             legacy_verified_at = COALESCE(legacy_verified_at, NOW()),
             legacy_verified_by = COALESCE(legacy_verified_by, ?)
         WHERE id = ?`,
        [newStatus, givenDateVal, givenByVal, notEligibleReasonVal, updatedBy, updatedDate, updatedBy, target.id]
      );
    }

    await conn.commit();

    const [refetched]: any = await p.query('SELECT * FROM material_distributions WHERE id = ?', [target.id]);
    return refetched && refetched.length > 0 ? mapRowToMaterialDistribution(refetched[0]) : null;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// In-memory idempotency deduplication cache for dual-submission protection
const recentKitSubmissionsCache = new Map<string, { timestamp: number; result: MaterialDistributionRecord }>();

// Clean up cache entries older than 30 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of recentKitSubmissionsCache.entries()) {
    if (now - val.timestamp > 30000) {
      recentKitSubmissionsCache.delete(key);
    }
  }
}, 15000);

export interface SaveCustomerKitDistributionInput {
  mhNumber: string;
  workerName?: string;
  mobileNumber?: string;
  taluka?: string;
  sourceType?: 'Registration' | 'Renewal';
  bhandiStatus: 'Pending' | 'Given' | 'Not Eligible';
  petiStatus: 'Pending' | 'Given' | 'Not Eligible';
  bagStatus: 'Pending' | 'Given' | 'Not Eligible';
  updatedBy: string;
  updatedDate: string;
  isLegacyVerification?: boolean;
  bhandiReason?: string;
  petiReason?: string;
  bagReason?: string;
  submissionId?: string;
}

// Atomically save or update a customer's kit distribution record
// Includes:
// 1. Dual-click & duplicate request idempotency protection
// 2. Pessimistic row locking (SELECT ... FOR UPDATE)
// 3. Separate stock deduction per kit:
//    - भांडी (bhandi)
//    - पेटी (peti)
//    - बॅग (bag)
//    - Decreases stock by exactly 1 only for newly received kits
//    - Never deducts stock again for already received kits
//    - Restores stock safely if changed back to pending
//    - Never allows stock to become negative (< 0)
// 4. Legacy record tagging & resolution
export async function saveCustomerMaterialDistribution(
  input: SaveCustomerKitDistributionInput
): Promise<MaterialDistributionRecord> {
  const cleanMH = String(input.mhNumber || '').trim().toUpperCase();
  if (!cleanMH) {
    throw new Error('Valid MH Number is required.');
  }

  // Dual-submission deduplication check
  const idempotencyKey = input.submissionId
    ? `${cleanMH}_${input.submissionId}`
    : `${cleanMH}_${input.bhandiStatus}_${input.petiStatus}_${input.bagStatus}`;

  const cached = recentKitSubmissionsCache.get(idempotencyKey);
  if (cached && Date.now() - cached.timestamp < 10000) {
    // If exact same request arrived within 10 seconds, safely return cached result without duplicate inventory deduction
    return cached.result;
  }

  const p = getPool();
  const conn = await p.getConnection();

  try {
    await conn.beginTransaction();

    // 1. Lock existing record if present, or create placeholder inside transaction
    const [existingRows]: any = await conn.query(
      'SELECT * FROM material_distributions WHERE mh_number = ? FOR UPDATE',
      [cleanMH]
    );

    let targetId = '';
    let targetRow: any = null;

    if (!existingRows || existingRows.length === 0) {
      targetId = `mat_${cleanMH.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`;
      await conn.query(
        `INSERT INTO material_distributions (id, mh_number, worker_name, mobile_number, taluka, source_type, is_legacy_record, bhandi_status, peti_status, bag_status)
         VALUES (?, ?, ?, ?, ?, ?, 0, 'Pending', 'Pending', 'Pending')`,
        [
          targetId,
          cleanMH,
          input.workerName || cleanMH,
          input.mobileNumber || '',
          input.taluka || '',
          input.sourceType || 'Registration',
        ]
      );
      const [newRow]: any = await conn.query('SELECT * FROM material_distributions WHERE id = ? FOR UPDATE', [targetId]);
      targetRow = newRow[0];
    } else {
      targetRow = existingRows[0];
      targetId = targetRow.id;
    }

    const kits: ('bhandi' | 'peti' | 'bag')[] = ['bhandi', 'peti', 'bag'];

    for (const kit of kits) {
      const oldStatus: 'Pending' | 'Given' | 'Not Eligible' = targetRow[`${kit}_status`] || 'Pending';
      const targetStatus: 'Pending' | 'Given' | 'Not Eligible' =
        kit === 'bhandi' ? input.bhandiStatus : kit === 'peti' ? input.petiStatus : input.bagStatus;

      // Stock Deduction Logic:
      // When a kit changes from NOT RECEIVED/PENDING -> RECEIVED/GIVEN:
      // Deduct exactly 1 from that kit's available stock
      if (oldStatus !== 'Given' && targetStatus === 'Given') {
        const [invRows]: any = await conn.query(
          'SELECT * FROM material_inventory WHERE kit_type = ? FOR UPDATE',
          [kit]
        );
        if (!invRows || invRows.length === 0) {
          // Initialize inventory row
          const kitName = kit === 'bhandi' ? 'भांडी (Cooking Utensils)' : kit === 'peti' ? 'पेटी (Trunk Box)' : 'बॅग (Safety Gear Bag)';
          await conn.query(
            'INSERT INTO material_inventory (kit_type, kit_name, available_stock, total_distributed) VALUES (?, ?, 99, 1)',
            [kit, kitName]
          );
        } else {
          await conn.query(
            'UPDATE material_inventory SET available_stock = GREATEST(0, available_stock - 1), total_distributed = total_distributed + 1 WHERE kit_type = ?',
            [kit]
          );
        }
      } else if (oldStatus === 'Given' && targetStatus !== 'Given') {
        // Stock Restoration Logic:
        // If a previously received kit is changed back to pending/not eligible, restore stock safely
        await conn.query(
          'UPDATE material_inventory SET available_stock = available_stock + 1, total_distributed = GREATEST(0, total_distributed - 1) WHERE kit_type = ?',
          [kit]
        );
      }
      // If already 'Given' and submitted again as 'Given' -> ZERO stock deduction!
    }

    // Set timestamps and details
    const bhandiGivenDate = input.bhandiStatus === 'Given' ? input.updatedDate : null;
    const bhandiGivenBy = input.bhandiStatus === 'Given' ? input.updatedBy : null;
    const bhandiReason = input.bhandiStatus === 'Not Eligible' ? input.bhandiReason || 'Not Eligible' : null;

    const petiGivenDate = input.petiStatus === 'Given' ? input.updatedDate : null;
    const petiGivenBy = input.petiStatus === 'Given' ? input.updatedBy : null;
    const petiReason = input.petiStatus === 'Not Eligible' ? input.petiReason || 'Not Eligible' : null;

    const bagGivenDate = input.bagStatus === 'Given' ? input.updatedDate : null;
    const bagGivenBy = input.bagStatus === 'Given' ? input.updatedBy : null;
    const bagReason = input.bagStatus === 'Not Eligible' ? input.bagReason || 'Not Eligible' : null;

    // Resolve legacy status upon manual operator verification and save
    const wasLegacy = Boolean(targetRow.is_legacy_record);
    const isLegacy = 0;
    const legacyVerifiedAt = wasLegacy ? new Date() : (targetRow.legacy_verified_at || null);
    const legacyVerifiedBy = wasLegacy ? input.updatedBy : (targetRow.legacy_verified_by || null);

    await conn.query(
      `UPDATE material_distributions
       SET worker_name = COALESCE(?, worker_name),
           mobile_number = COALESCE(?, mobile_number),
           taluka = COALESCE(?, taluka),
           source_type = COALESCE(?, source_type),
           bhandi_status = ?,
           bhandi_given_date = ?,
           bhandi_given_by = ?,
           bhandi_not_eligible_reason = ?,
           bhandi_updated_by = ?,
           bhandi_updated_date = ?,
           peti_status = ?,
           peti_given_date = ?,
           peti_given_by = ?,
           peti_not_eligible_reason = ?,
           peti_updated_by = ?,
           peti_updated_date = ?,
           bag_status = ?,
           bag_given_date = ?,
           bag_given_by = ?,
           bag_not_eligible_reason = ?,
           bag_updated_by = ?,
           bag_updated_date = ?,
           is_legacy_record = ?,
           legacy_verified_at = ?,
           legacy_verified_by = ?
       WHERE id = ?`,
      [
        input.workerName || null,
        input.mobileNumber || null,
        input.taluka || null,
        input.sourceType || null,
        input.bhandiStatus,
        bhandiGivenDate,
        bhandiGivenBy,
        bhandiReason,
        input.updatedBy,
        input.updatedDate,
        input.petiStatus,
        petiGivenDate,
        petiGivenBy,
        petiReason,
        input.updatedBy,
        input.updatedDate,
        input.bagStatus,
        bagGivenDate,
        bagGivenBy,
        bagReason,
        input.updatedBy,
        input.updatedDate,
        isLegacy,
        legacyVerifiedAt,
        legacyVerifiedBy,
        targetId,
      ]
    );

    await conn.commit();

    const [refetched]: any = await p.query('SELECT * FROM material_distributions WHERE id = ?', [targetId]);
    const finalRecord = mapRowToMaterialDistribution(refetched[0]);

    // Store in idempotency cache
    recentKitSubmissionsCache.set(idempotencyKey, {
      timestamp: Date.now(),
      result: finalRecord,
    });

    return finalRecord;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

function mapRowToWhatsappGroupTracking(r: any): WhatsappGroupTrackingRecord {
  let status: 'Pending' | 'Added' | 'No WhatsApp' = 'Pending';
  if (r.status === 'Added') status = 'Added';
  else if (r.status === 'No WhatsApp' || r.status === 'Not on WhatsApp' || r.status === 'NoWhatsapp') status = 'No WhatsApp';

  return {
    mhNumber: r.mh_number,
    workerName: r.worker_name,
    mobileNumber: r.mobile_number || '',
    taluka: r.taluka || '',
    sourceType: r.source_type === 'Renewal' ? 'Renewal' : 'Registration',
    activeDate: r.active_date || '',
    status,
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
        const isAct = st === 'ACTIVE' || st === 'COMPLETED';
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
  updates: { status: 'Added' | 'Pending' | 'No WhatsApp'; addedBy?: string; remark?: string }
): Promise<WhatsappGroupTrackingRecord | null> {
  try {
    const p = getPool();
    const mh = String(mhNumber).trim().toUpperCase();
    const nowStr = new Date().toISOString().split('T')[0];

    const addedDate = updates.status === 'Pending' ? null : nowStr;
    const addedBy = updates.status === 'Pending' ? null : (updates.addedBy || null);
    const remark = updates.status === 'Pending' ? null : (updates.remark || null);

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

// ============================================================================
// IWBMS STATUS CHECKER JOB QUEUE HELPERS (STEP 2)
// ============================================================================

/**
 * Normalizes an MH Number:
 * - Trims whitespace
 * - Removes internal whitespace formatting variations while preserving characters
 * - Converts to uppercase
 */
export function normalizeMhNumberForIwbms(rawMh: string | null | undefined): string {
  if (!rawMh) return '';
  return String(rawMh).trim().toUpperCase().replace(/\s+/g, '');
}

/**
 * Maps raw database row from iwbms_check_jobs to typed IwbmsCheckJob object
 */
function mapRowToIwbmsJob(row: any): IwbmsCheckJob {
  return {
    id: Number(row.id),
    workerType: row.worker_type as IwbmsWorkerType,
    workerRecordId: String(row.worker_record_id || ''),
    mhNumber: String(row.mh_number || ''),
    status: row.status as IwbmsJobStatus,
    resultStatus: row.result_status ? (row.result_status as IwbmsResultStatus) : undefined,
    createdBy: row.created_by || undefined,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    startedAt: row.started_at ? new Date(row.started_at).toISOString() : undefined,
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : undefined,
    retryCount: Number(row.retry_count || 0),
    errorMessage: row.error_message || undefined,
    lastCheckedAt: row.last_checked_at ? new Date(row.last_checked_at).toISOString() : undefined,
  };
}

/**
 * Creates an IWBMS Check Job with duplicate protection:
 * - If a job for the same normalized MH number is already 'Pending' or 'Processing',
 *   it returns that existing job without creating a duplicate.
 * - Otherwise, creates a new job with status 'Pending'.
 */
export async function createMySQLIwbmsJob(params: {
  workerType: IwbmsWorkerType;
  workerRecordId: string;
  mhNumber: string;
  createdBy?: string;
}): Promise<{ job: IwbmsCheckJob; isDuplicate: boolean }> {
  const p = getPool();
  const normalizedMh = normalizeMhNumberForIwbms(params.mhNumber);

  if (!normalizedMh || normalizedMh.length < 4) {
    throw new Error('MH Number is invalid or missing.');
  }

  // 1. Check for existing active job (Pending or Processing)
  const [existingActive]: any = await p.query(
    `SELECT * FROM iwbms_check_jobs 
     WHERE mh_number = ? AND status IN ('Pending', 'Processing') 
     ORDER BY id DESC LIMIT 1`,
    [normalizedMh]
  );

  if (existingActive && existingActive.length > 0) {
    return {
      job: mapRowToIwbmsJob(existingActive[0]),
      isDuplicate: true,
    };
  }

  // 2. Create new Pending job
  const [result]: any = await p.query(
    `INSERT INTO iwbms_check_jobs 
     (worker_type, worker_record_id, mh_number, status, created_by, retry_count)
     VALUES (?, ?, ?, 'Pending', ?, 0)`,
    [
      params.workerType || 'registration',
      String(params.workerRecordId || ''),
      normalizedMh,
      params.createdBy || 'system',
    ]
  );

  const newId = result.insertId;
  const [newRows]: any = await p.query('SELECT * FROM iwbms_check_jobs WHERE id = ?', [newId]);

  return {
    job: mapRowToIwbmsJob(newRows[0]),
    isDuplicate: false,
  };
}

/**
 * Safely fetches and locks the next 'Pending' job for the Python/Worker runner.
 * Atomically marks status to 'Processing' with started_at timestamp.
 */
export async function fetchNextPendingIwbmsJob(): Promise<IwbmsCheckJob | null> {
  const p = getPool();
  const conn = await p.getConnection();

  try {
    await conn.beginTransaction();

    // Select the oldest pending job with FOR UPDATE lock
    const [rows]: any = await conn.query(
      `SELECT * FROM iwbms_check_jobs 
       WHERE status = 'Pending' 
       ORDER BY id ASC LIMIT 1 
       FOR UPDATE`
    );

    if (!rows || rows.length === 0) {
      await conn.commit();
      conn.release();
      return null;
    }

    const job = rows[0];
    const now = new Date();

    // Mark as Processing
    await conn.query(
      `UPDATE iwbms_check_jobs 
       SET status = 'Processing', started_at = ? 
       WHERE id = ?`,
      [now, job.id]
    );

    await conn.commit();
    conn.release();

    return {
      ...mapRowToIwbmsJob(job),
      status: 'Processing',
      startedAt: now.toISOString(),
    };
  } catch (err) {
    await conn.rollback();
    conn.release();
    throw err;
  }
}

/**
 * Marks a job as 'Processing' with started_at timestamp.
 */
export async function startIwbmsJob(jobId: number): Promise<IwbmsCheckJob | null> {
  const p = getPool();
  const now = new Date();

  await p.query(
    `UPDATE iwbms_check_jobs 
     SET status = 'Processing', started_at = ? 
     WHERE id = ?`,
    [now, jobId]
  );

  const [rows]: any = await p.query('SELECT * FROM iwbms_check_jobs WHERE id = ?', [jobId]);
  if (rows && rows.length > 0) {
    const job = mapRowToIwbmsJob(rows[0]);
    // Synchronize check start timestamp to source table
    try {
      if (job.workerType === 'registration') {
        await p.query('UPDATE registrations SET iwbms_check_started_at = NOW() WHERE id = ?', [job.workerRecordId]);
      } else if (job.workerType === 'renewal') {
        await p.query('UPDATE renewals SET iwbms_check_started_at = NOW() WHERE id = ?', [job.workerRecordId]);
      } else if (job.workerType === 'claim') {
        await p.query('UPDATE claims SET iwbms_check_started_at = NOW() WHERE id = ?', [job.workerRecordId]);
      }
    } catch (syncErr) {
      console.warn(`[IWBMS] Start timestamp sync warning for job #${jobId}:`, syncErr);
    }
    return job;
  }
  return null;
}

/**
 * Marks a job as 'Completed' with the verified result_status ('Active' | 'Inactive' | 'Not Found' | 'Check').
 * Automatically syncs the verified result to the respective source table and logs history.
 */
export async function completeIwbmsJob(
  jobId: number,
  resultStatus: IwbmsResultStatus,
  workerName?: string
): Promise<IwbmsCheckJob | null> {
  const p = getPool();
  const now = new Date();

  await p.query(
    `UPDATE iwbms_check_jobs 
     SET status = 'Completed', result_status = ?, completed_at = ?, last_checked_at = ?, error_message = NULL 
     WHERE id = ?`,
    [resultStatus, now, now, jobId]
  );

  const [rows]: any = await p.query('SELECT * FROM iwbms_check_jobs WHERE id = ?', [jobId]);
  if (rows && rows.length > 0) {
    const job = mapRowToIwbmsJob(rows[0]);

    // Synchronize verification result to target table
    try {
      let previousStatus: string | null = null;
      if (job.workerType === 'registration') {
        const [prev]: any = await p.query('SELECT iwbms_status FROM registrations WHERE id = ?', [job.workerRecordId]);
        if (prev && prev.length > 0) previousStatus = prev[0].iwbms_status || null;

        await p.query(
          `UPDATE registrations 
           SET iwbms_status = ?, iwbms_last_checked = NOW(), iwbms_check_completed_at = NOW(), iwbms_error = NULL 
           WHERE id = ?`,
          [resultStatus, job.workerRecordId]
        );
      } else if (job.workerType === 'renewal') {
        const [prev]: any = await p.query('SELECT iwbms_status FROM renewals WHERE id = ?', [job.workerRecordId]);
        if (prev && prev.length > 0) previousStatus = prev[0].iwbms_status || null;

        await p.query(
          `UPDATE renewals 
           SET iwbms_status = ?, iwbms_last_checked = NOW(), iwbms_check_completed_at = NOW(), iwbms_error = NULL 
           WHERE id = ?`,
          [resultStatus, job.workerRecordId]
        );
      } else if (job.workerType === 'claim') {
        const [prev]: any = await p.query('SELECT iwbms_status FROM claims WHERE id = ?', [job.workerRecordId]);
        if (prev && prev.length > 0) previousStatus = prev[0].iwbms_status || null;

        await p.query(
          `UPDATE claims 
           SET iwbms_status = ?, iwbms_last_checked = NOW(), iwbms_check_completed_at = NOW(), iwbms_error = NULL 
           WHERE id = ?`,
          [resultStatus, job.workerRecordId]
        );
      }

      // Record to history
      await p.query(
        `INSERT INTO iwbms_check_history (job_id, worker_type, worker_record_id, mh_number, previous_status, new_status, checked_at, worker_name, details)
         VALUES (?, ?, ?, ?, ?, ?, NOW(), ?, ?)`,
        [
          jobId,
          job.workerType,
          job.workerRecordId,
          job.mhNumber,
          previousStatus,
          resultStatus,
          workerName || 'IWBMS-Python-Worker',
          `Verified status '${resultStatus}' via IWBMS worker`,
        ]
      );
    } catch (syncErr) {
      console.error(`[IWBMS] Failed to auto-sync result to source record for job #${jobId}:`, syncErr);
    }

    return job;
  }
  return null;
}

/**
 * Marks a job as 'Failed' with the error message and increments retry_count.
 */
export async function failIwbmsJob(
  jobId: number,
  errorMessage: string
): Promise<IwbmsCheckJob | null> {
  const p = getPool();

  await p.query(
    `UPDATE iwbms_check_jobs 
     SET status = 'Failed', error_message = ?, retry_count = retry_count + 1 
     WHERE id = ?`,
    [errorMessage, jobId]
  );

  const [rows]: any = await p.query('SELECT * FROM iwbms_check_jobs WHERE id = ?', [jobId]);
  if (rows && rows.length > 0) {
    const job = mapRowToIwbmsJob(rows[0]);
    try {
      if (job.workerType === 'registration') {
        await p.query('UPDATE registrations SET iwbms_error = ?, iwbms_last_checked = NOW() WHERE id = ?', [errorMessage, job.workerRecordId]);
      } else if (job.workerType === 'renewal') {
        await p.query('UPDATE renewals SET iwbms_error = ?, iwbms_last_checked = NOW() WHERE id = ?', [errorMessage, job.workerRecordId]);
      } else if (job.workerType === 'claim') {
        await p.query('UPDATE claims SET iwbms_error = ?, iwbms_last_checked = NOW() WHERE id = ?', [errorMessage, job.workerRecordId]);
      }
    } catch (syncErr) {
      console.warn(`[IWBMS] Fail sync warning for job #${jobId}:`, syncErr);
    }
    return job;
  }
  return null;
}

/**
 * Retries a 'Failed' or 'Completed' job by setting its status back to 'Pending'.
 */
export async function retryIwbmsJob(jobId: number): Promise<IwbmsCheckJob | null> {
  const p = getPool();

  await p.query(
    `UPDATE iwbms_check_jobs 
     SET status = 'Pending', error_message = NULL, started_at = NULL, completed_at = NULL 
     WHERE id = ?`,
    [jobId]
  );

  const [rows]: any = await p.query('SELECT * FROM iwbms_check_jobs WHERE id = ?', [jobId]);
  if (rows && rows.length > 0) {
    return mapRowToIwbmsJob(rows[0]);
  }
  return null;
}

/**
 * Retries ALL failed IWBMS jobs in bulk (Admin only).
 */
export async function retryAllFailedIwbmsJobs(): Promise<number> {
  const p = getPool();
  const [result]: any = await p.query(
    `UPDATE iwbms_check_jobs 
     SET status = 'Pending', error_message = NULL, started_at = NULL, completed_at = NULL 
     WHERE status = 'Failed'`
  );
  return result.affectedRows || 0;
}

/**
 * Recovers stale processing jobs (e.g., worker crashed or timed out after 15 minutes).
 */
export async function recoverStaleProcessingIwbmsJobs(staleMinutes = 15): Promise<number> {
  const p = getPool();
  const [result]: any = await p.query(
    `UPDATE iwbms_check_jobs 
     SET status = 'Pending', started_at = NULL 
     WHERE status = 'Processing' AND (started_at IS NULL OR started_at < (NOW() - INTERVAL ? MINUTE))`,
    [staleMinutes]
  );
  return result.affectedRows || 0;
}

/**
 * Batch enqueues multiple worker records into the IWBMS job queue.
 * Performs duplicate checking against currently Active (Pending or Processing) jobs.
 */
export async function createMySQLIwbmsBatchJobs(
  records: Array<{ workerType: IwbmsWorkerType; workerRecordId: string; mhNumber: string }>,
  createdBy = 'system'
): Promise<{
  newJobs: number;
  alreadyQueued: number;
  invalidMhNumbers: number;
  total: number;
  jobIds: number[];
}> {
  const p = getPool();
  let newJobs = 0;
  let alreadyQueued = 0;
  let invalidMhNumbers = 0;
  const jobIds: number[] = [];

  for (const item of records) {
    const rawMh = (item.mhNumber || '').trim();
    const cleanMh = normalizeMhNumberForIwbms(rawMh);

    if (!cleanMh || cleanMh.length < 3) {
      invalidMhNumbers++;
      continue;
    }

    // Check if an active job (Pending or Processing) already exists for this exact record or MH
    const [existing]: any = await p.query(
      `SELECT id FROM iwbms_check_jobs 
       WHERE (mh_number = ? OR (worker_type = ? AND worker_record_id = ?)) 
         AND status IN ('Pending', 'Processing') 
       LIMIT 1`,
      [cleanMh, item.workerType, item.workerRecordId]
    );

    if (existing && existing.length > 0) {
      alreadyQueued++;
      continue;
    }

    const [res]: any = await p.query(
      `INSERT INTO iwbms_check_jobs (worker_type, worker_record_id, mh_number, status, created_by, created_at)
       VALUES (?, ?, ?, 'Pending', ?, NOW())`,
      [item.workerType, item.workerRecordId, cleanMh, createdBy]
    );

    if (res && res.insertId) {
      newJobs++;
      jobIds.push(res.insertId);
    }
  }

  return {
    newJobs,
    alreadyQueued,
    invalidMhNumbers,
    total: records.length,
    jobIds,
  };
}

/**
 * Fetches IWBMS verification history log
 */
export async function getIwbmsCheckHistory(filter?: {
  mhNumber?: string;
  workerType?: string;
  limit?: number;
}): Promise<IwbmsCheckHistory[]> {
  const p = getPool();
  let sql = 'SELECT * FROM iwbms_check_history WHERE 1=1';
  const params: any[] = [];

  if (filter?.mhNumber) {
    sql += ' AND mh_number LIKE ?';
    params.push(`%${normalizeMhNumberForIwbms(filter.mhNumber)}%`);
  }
  if (filter?.workerType) {
    sql += ' AND worker_type = ?';
    params.push(filter.workerType);
  }

  sql += ' ORDER BY id DESC LIMIT ?';
  params.push(filter?.limit || 100);

  const [rows]: any = await p.query(sql, params);
  return (rows || []).map((r: any) => ({
    id: r.id,
    jobId: r.job_id,
    workerType: r.worker_type as IwbmsWorkerType,
    workerRecordId: r.worker_record_id,
    mhNumber: r.mh_number,
    previousStatus: r.previous_status || undefined,
    newStatus: r.new_status as IwbmsResultStatus,
    checkedAt: r.checked_at ? new Date(r.checked_at).toISOString() : new Date().toISOString(),
    workerName: r.worker_name || undefined,
    details: r.details || undefined,
  }));
}

/**
 * Retrieves an IWBMS job by ID.
 */
export async function getMySQLIwbmsJobById(jobId: number): Promise<IwbmsCheckJob | null> {
  const p = getPool();
  const [rows]: any = await p.query('SELECT * FROM iwbms_check_jobs WHERE id = ?', [jobId]);
  if (rows && rows.length > 0) {
    return mapRowToIwbmsJob(rows[0]);
  }
  return null;
}

/**
 * Retrieves the latest IWBMS job for a given MH Number.
 */
export async function getLatestMySQLIwbmsJobByMh(mhNumber: string): Promise<IwbmsCheckJob | null> {
  const p = getPool();
  const normalizedMh = normalizeMhNumberForIwbms(mhNumber);
  const [rows]: any = await p.query(
    'SELECT * FROM iwbms_check_jobs WHERE mh_number = ? ORDER BY id DESC LIMIT 1',
    [normalizedMh]
  );
  if (rows && rows.length > 0) {
    return mapRowToIwbmsJob(rows[0]);
  }
  return null;
}

/**
 * Lists IWBMS check jobs with optional filtering.
 */
export async function listMySQLIwbmsJobs(filter?: {
  status?: IwbmsJobStatus;
  workerType?: IwbmsWorkerType;
  mhNumber?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
}): Promise<IwbmsCheckJob[]> {
  const p = getPool();
  let sql = 'SELECT * FROM iwbms_check_jobs WHERE 1=1';
  const params: any[] = [];

  if (filter?.status) {
    sql += ' AND status = ?';
    params.push(filter.status);
  }
  if (filter?.workerType) {
    sql += ' AND worker_type = ?';
    params.push(filter.workerType);
  }
  if (filter?.mhNumber) {
    sql += ' AND mh_number LIKE ?';
    params.push(`%${normalizeMhNumberForIwbms(filter.mhNumber)}%`);
  }
  if (filter?.startDate) {
    sql += ' AND created_at >= ?';
    params.push(`${filter.startDate} 00:00:00`);
  }
  if (filter?.endDate) {
    sql += ' AND created_at <= ?';
    params.push(`${filter.endDate} 23:59:59`);
  }

  sql += ' ORDER BY id DESC LIMIT ?';
  params.push(filter?.limit || 50);

  const [rows]: any = await p.query(sql, params);
  return (rows || []).map(mapRowToIwbmsJob);
}

/**
 * In-memory / fast heartbeat tracker for the Local Python Worker
 */
let latestWorkerHeartbeat: IwbmsWorkerHeartbeat | null = null;

export function recordWorkerHeartbeat(heartbeat: {
  workerName: string;
  workerVersion: string;
  status: 'Online' | 'Idle' | 'Processing' | 'Offline';
  currentJobId?: number;
  currentMhNumber?: string;
  ipAddress?: string;
}): IwbmsWorkerHeartbeat {
  latestWorkerHeartbeat = {
    workerName: heartbeat.workerName || 'IWBMS-Python-Worker',
    workerVersion: heartbeat.workerVersion || '1.0.0',
    status: heartbeat.status || 'Idle',
    currentJobId: heartbeat.currentJobId,
    currentMhNumber: heartbeat.currentMhNumber,
    lastSeen: new Date().toISOString(),
    ipAddress: heartbeat.ipAddress,
  };
  return latestWorkerHeartbeat;
}

export function getWorkerHeartbeatStatus(): {
  worker: IwbmsWorkerHeartbeat | null;
  isOnline: boolean;
  secondsSinceLastSeen: number | null;
} {
  if (!latestWorkerHeartbeat) {
    return { worker: null, isOnline: false, secondsSinceLastSeen: null };
  }

  const now = Date.now();
  const lastSeenMs = new Date(latestWorkerHeartbeat.lastSeen).getTime();
  const diffSeconds = Math.max(0, Math.floor((now - lastSeenMs) / 1000));

  // If heartbeat is older than 60 seconds, consider it Offline
  const isOnline = diffSeconds <= 60 && latestWorkerHeartbeat.status !== 'Offline';

  return {
    worker: {
      ...latestWorkerHeartbeat,
      status: isOnline ? latestWorkerHeartbeat.status : 'Offline',
    },
    isOnline,
    secondsSinceLastSeen: diffSeconds,
  };
}

/**
 * Aggregates statistics / counts for IWBMS jobs
 */
export async function getMySQLIwbmsJobCounts(): Promise<IwbmsJobCounts> {
  const p = getPool();
  const [rows]: any = await p.query(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status = 'Processing' THEN 1 ELSE 0 END) AS processing,
      SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN status = 'Failed' THEN 1 ELSE 0 END) AS failed,
      SUM(CASE WHEN result_status = 'Active' THEN 1 ELSE 0 END) AS active_results,
      SUM(CASE WHEN result_status = 'Inactive' THEN 1 ELSE 0 END) AS inactive_results,
      SUM(CASE WHEN result_status = 'Not Found' THEN 1 ELSE 0 END) AS not_found_results,
      SUM(CASE WHEN result_status = 'Check' THEN 1 ELSE 0 END) AS check_results
    FROM iwbms_check_jobs
  `);

  const r = rows && rows[0] ? rows[0] : {};

  return {
    total: Number(r.total || 0),
    pending: Number(r.pending || 0),
    processing: Number(r.processing || 0),
    completed: Number(r.completed || 0),
    failed: Number(r.failed || 0),
    activeResults: Number(r.active_results || 0),
    inactiveResults: Number(r.inactive_results || 0),
    notFoundResults: Number(r.not_found_results || 0),
    checkResults: Number(r.check_results || 0),
  };
}

/**
 * Get Sub-Agent stats for a specific user ID
 */
export async function getMySQLSubAgentStats(userId: string): Promise<SubAgentStats> {
  const p = getPool();
  const todayStr = new Date().toISOString().split('T')[0];
  const currentMonthStr = todayStr.substring(0, 7); // 'YYYY-MM'

  const [regRows]: any = await p.query(
    `SELECT 
      COUNT(*) AS total,
      SUM(CASE WHEN app_status = 'Pending' OR status = 'Pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN app_status = 'Accepted' OR status = 'Active' THEN 1 ELSE 0 END) AS approved,
      SUM(CASE WHEN app_status = 'Rejected' OR status = 'Rejected' THEN 1 ELSE 0 END) AS rejected,
      SUM(CASE WHEN registration_date LIKE ? OR verification_date LIKE ? THEN 1 ELSE 0 END) AS today_count,
      SUM(CASE WHEN registration_date LIKE ? OR verification_date LIKE ? THEN 1 ELSE 0 END) AS month_count,
      COALESCE(SUM(CASE WHEN payment_mode = 'N/A' THEN 0 WHEN payment_amount IS NOT NULL THEN payment_amount ELSE fee_paid END), 0) AS total_fees,
      COALESCE(SUM(CASE WHEN registration_date LIKE ? OR verification_date LIKE ? THEN (CASE WHEN payment_mode = 'N/A' THEN 0 WHEN payment_amount IS NOT NULL THEN payment_amount ELSE fee_paid END) ELSE 0 END), 0) AS today_fees
     FROM registrations WHERE created_by_user_id = ?`,
    [`${todayStr}%`, `${todayStr}%`, `${currentMonthStr}%`, `${currentMonthStr}%`, `${todayStr}%`, `${todayStr}%`, userId]
  );
  const [renRows]: any = await p.query(
    `SELECT 
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status = 'Completed' OR status = 'Approved' THEN 1 ELSE 0 END) AS approved,
      SUM(CASE WHEN status = 'Rejected' THEN 1 ELSE 0 END) AS rejected,
      SUM(CASE WHEN renewal_date LIKE ? OR verification_date LIKE ? THEN 1 ELSE 0 END) AS today_count,
      SUM(CASE WHEN renewal_date LIKE ? OR verification_date LIKE ? THEN 1 ELSE 0 END) AS month_count,
      COALESCE(SUM(CASE WHEN payment_mode = 'N/A' THEN 0 WHEN payment_amount IS NOT NULL THEN payment_amount ELSE fee_amount END), 0) AS total_fees,
      COALESCE(SUM(CASE WHEN renewal_date LIKE ? OR verification_date LIKE ? THEN (CASE WHEN payment_mode = 'N/A' THEN 0 WHEN payment_amount IS NOT NULL THEN payment_amount ELSE fee_amount END) ELSE 0 END), 0) AS today_fees
     FROM renewals WHERE created_by_user_id = ?`,
    [`${todayStr}%`, `${todayStr}%`, `${currentMonthStr}%`, `${currentMonthStr}%`, `${todayStr}%`, `${todayStr}%`, userId]
  );
  const [clmRows]: any = await p.query(
    `SELECT 
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'Submitted' OR status = 'Pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status = 'Approved' OR status = 'Completed' THEN 1 ELSE 0 END) AS approved,
      SUM(CASE WHEN status = 'Rejected' THEN 1 ELSE 0 END) AS rejected,
      SUM(CASE WHEN claim_date LIKE ? THEN 1 ELSE 0 END) AS today_count,
      SUM(CASE WHEN claim_date LIKE ? THEN 1 ELSE 0 END) AS month_count,
      COALESCE(SUM(total_amount), 0) AS total_amount,
      COALESCE(SUM(CASE WHEN claim_date LIKE ? THEN total_amount ELSE 0 END), 0) AS today_amount
     FROM claims WHERE created_by_user_id = ?`,
    [`${todayStr}%`, `${currentMonthStr}%`, `${todayStr}%`, userId]
  );

  const reg = regRows[0] || {};
  const ren = renRows[0] || {};
  const clm = clmRows[0] || {};

  const totalRegs = Number(reg.total || 0);
  const totalRens = Number(ren.total || 0);
  const totalClms = Number(clm.total || 0);

  const pendingRegs = Number(reg.pending || 0);
  const pendingRens = Number(ren.pending || 0);
  const pendingClms = Number(clm.pending || 0);

  const approvedRegs = Number(reg.approved || 0);
  const approvedRens = Number(ren.approved || 0);
  const approvedClms = Number(clm.approved || 0);

  const rejectedRegs = Number(reg.rejected || 0);
  const rejectedRens = Number(ren.rejected || 0);
  const rejectedClms = Number(clm.rejected || 0);

  const todayRegs = Number(reg.today_count || 0);
  const todayRens = Number(ren.today_count || 0);
  const todayClms = Number(clm.today_count || 0);

  const monthRegs = Number(reg.month_count || 0);
  const monthRens = Number(ren.month_count || 0);
  const monthClms = Number(clm.month_count || 0);

  const totalColl = Number(reg.total_fees || 0) + Number(ren.total_fees || 0);
  const todayColl = Number(reg.today_fees || 0) + Number(ren.today_fees || 0);

  return {
    totalRegistrations: totalRegs,
    totalRenewals: totalRens,
    totalClaims: totalClms,
    totalEntries: totalRegs + totalRens + totalClms,
    pendingEntries: pendingRegs + pendingRens + pendingClms,
    approvedEntries: approvedRegs + approvedRens + approvedClms,
    rejectedEntries: rejectedRegs + rejectedRens + rejectedClms,
    todayRegistrations: todayRegs,
    todayRenewals: todayRens,
    todayClaims: todayClms,
    todayEntries: todayRegs + todayRens + todayClms,
    monthRegistrations: monthRegs,
    monthRenewals: monthRens,
    monthClaims: monthClms,
    monthEntries: monthRegs + monthRens + monthClms,
    totalCollection: totalColl,
    todayCollection: todayColl,
  };
}

/**
 * Get Sub-Agent users summary for Admin Sub-Agent Management
 */
export async function getMySQLAllSubAgentsSummary(): Promise<SubAgentUserSummary[]> {
  const p = getPool();
  const [users]: any = await p.query("SELECT * FROM users WHERE role = 'sub_agent' ORDER BY created_at DESC");
  
  const summaries: SubAgentUserSummary[] = [];

  for (const u of users) {
    const stats = await getMySQLSubAgentStats(u.id);
    const parsedPerms: UserPermissions = {
      canRegister: u.can_register !== undefined ? Boolean(u.can_register) : true,
      canRenew: u.can_renew !== undefined ? Boolean(u.can_renew) : true,
      canClaim: u.can_claim !== undefined ? Boolean(u.can_claim) : true,
      canExport: u.can_export !== undefined ? Boolean(u.can_export) : false,
      canSeeSearch: u.can_see_search !== undefined ? Boolean(u.can_see_search) : true,
      canSeeClaimEntry: u.can_see_claim_entry !== undefined ? Boolean(u.can_see_claim_entry) : true,
      canSeeRegistrationEntry: u.can_see_registration_entry !== undefined ? Boolean(u.can_see_registration_entry) : true,
      canSeeRenewalEntry: u.can_see_renewal_entry !== undefined ? Boolean(u.can_see_renewal_entry) : true,
      canSeeMasterExcelSync: u.can_see_master_excel_sync !== undefined ? Boolean(u.can_see_master_excel_sync) : false,
      canSeePendingVerification: u.can_see_pending_verification !== undefined ? Boolean(u.can_see_pending_verification) : false,
      canSeeMaterialDistribution: u.can_see_material_distribution !== undefined ? Boolean(u.can_see_material_distribution) : false,
      canSeeWhatsappGroup: u.can_see_whatsapp_group !== undefined ? Boolean(u.can_see_whatsapp_group) : false,
      canSeeIwbmsChecker: u.can_see_iwbms_checker !== undefined ? Boolean(u.can_see_iwbms_checker) : false,
      canSeeSubAgentEntries: true,
      canSeeSubAgentManagement: false,
    };

    summaries.push({
      id: u.id,
      username: u.username,
      name: u.name,
      mobile: u.mobile,
      email: u.email || undefined,
      role: 'sub_agent',
      status: u.status,
      permissions: parsedPerms,
      createdAt: u.created_at,
      lastLogin: u.last_login || undefined,
      stats,
    });
  }

  return summaries;
}

// -------------------------------------------------------------
// CLAIM PAYMENTS DATABASE OPERATIONS
// -------------------------------------------------------------

/**
 * Get Commission Settings (Direct Worker %, Default Officer %, Sub-Agent rates)
 */
export async function getMySQLCommissionSettings(): Promise<CommissionSettings> {
  const p = getPool();
  try {
    const [rows]: any = await p.query('SELECT * FROM commission_settings WHERE id = 1');
    if (rows && rows.length > 0) {
      const r = rows[0];
      let subAgentRates: SubAgentCommissionConfig[] = [];
      try {
        if (r.sub_agent_rates) {
          subAgentRates = JSON.parse(r.sub_agent_rates);
        }
      } catch (_e) {
        subAgentRates = [];
      }
      return {
        directWorkerCommissionRate: parseFloat(r.direct_worker_commission_rate || '10.00'),
        defaultOfficerCommissionRate: parseFloat(r.default_officer_commission_rate || '10.00'),
        subAgentRates,
        updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : undefined,
      };
    }
  } catch (err) {
    console.error('Error fetching commission settings:', err);
  }

  // Default initial settings
  return {
    directWorkerCommissionRate: 10.00,
    defaultOfficerCommissionRate: 10.00,
    subAgentRates: [],
  };
}

/**
 * Update Commission Settings
 */
export async function updateMySQLCommissionSettings(settings: CommissionSettings): Promise<CommissionSettings> {
  const p = getPool();
  const directRate = Number(settings.directWorkerCommissionRate || 10);
  const officerRate = Number(settings.defaultOfficerCommissionRate || 10);
  const subAgentRatesJson = JSON.stringify(settings.subAgentRates || []);

  await p.query(
    `INSERT INTO commission_settings (id, direct_worker_commission_rate, default_officer_commission_rate, sub_agent_rates, updated_at)
     VALUES (1, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       direct_worker_commission_rate = VALUES(direct_worker_commission_rate),
       default_officer_commission_rate = VALUES(default_officer_commission_rate),
       sub_agent_rates = VALUES(sub_agent_rates),
       updated_at = NOW()`,
    [directRate, officerRate, subAgentRatesJson]
  );

  return await getMySQLCommissionSettings();
}

/**
 * Get all Claim Payment Lists with real-time aggregated metrics
 */
export async function getMySQLClaimPaymentLists(subAgentId?: string): Promise<ClaimPaymentList[]> {
  const p = getPool();

  // If subAgentId is provided, only return lists that have workers for that subAgent
  let listsQuery = 'SELECT * FROM claim_payment_lists ORDER BY created_at DESC';
  const params: any[] = [];

  if (subAgentId) {
    listsQuery = `
      SELECT DISTINCT l.* FROM claim_payment_lists l
      INNER JOIN claim_payment_workers w ON l.list_number = w.list_number
      WHERE w.sub_agent_id = ?
      ORDER BY l.created_at DESC
    `;
    params.push(subAgentId);
  }

  const [listRows]: any = await p.query(listsQuery, params);
  const results: ClaimPaymentList[] = [];

  for (const l of listRows) {
    const listNum = l.list_number;

    // Worker metrics
    let workerSql = 'SELECT * FROM claim_payment_workers WHERE list_number = ?';
    const workerParams: any[] = [listNum];
    if (subAgentId) {
      workerSql += ' AND sub_agent_id = ?';
      workerParams.push(subAgentId);
    }
    const [workers]: any = await p.query(workerSql, workerParams);

    const totalWorkers = workers.length;
    let totalClaimAmount = 0;
    let totalCommissionExpected = 0;
    let commissionReceived = 0;
    const talukaSet = new Set<string>();

    for (const w of workers) {
      totalClaimAmount += parseFloat(w.claim_amount || 0);
      totalCommissionExpected += parseFloat(w.commission_amount_snapshot || 0);
      commissionReceived += parseFloat(w.total_received || 0);
      if (w.taluka && w.taluka.trim()) {
        talukaSet.add(w.taluka.trim());
      }
    }

    const commissionPending = Math.max(0, totalCommissionExpected - commissionReceived);

    // List Expenses
    const [expRows]: any = await p.query('SELECT COALESCE(SUM(amount), 0) AS total_expense FROM claim_payment_expenses WHERE list_number = ?', [listNum]);
    const totalExpense = parseFloat(expRows[0]?.total_expense || 0);

    // Officer Commission
    const [offRows]: any = await p.query('SELECT COALESCE(SUM(officer_commission_amount), 0) AS total_officer FROM claim_officer_commissions WHERE list_number = ?', [listNum]);
    const officerCommission = parseFloat(offRows[0]?.total_officer || 0);

    const netBalance = commissionReceived - totalExpense - officerCommission;

    results.push({
      id: l.id,
      listNumber: l.list_number,
      listDate: l.list_date ? normalizeDateToYMD(l.list_date) : '',
      status: (l.status as ClaimPaymentListStatus) || 'Payment Pending',
      notes: l.notes || '',
      createdByUserId: l.created_by_user_id || undefined,
      createdBy: l.created_by || undefined,
      createdAt: l.created_at ? new Date(l.created_at).toISOString() : new Date().toISOString(),
      updatedAt: l.updated_at ? new Date(l.updated_at).toISOString() : undefined,
      totalWorkers,
      totalClaimAmount,
      totalCommissionExpected,
      commissionReceived,
      commissionPending,
      totalExpense,
      officerCommission,
      netBalance,
      talukas: Array.from(talukaSet),
    });
  }

  return results;
}

/**
 * Get a single Claim Payment List by list number
 */
export async function getMySQLClaimPaymentListByNumber(listNumber: string): Promise<ClaimPaymentList | null> {
  const p = getPool();
  const [rows]: any = await p.query('SELECT * FROM claim_payment_lists WHERE list_number = ?', [listNumber]);
  if (!rows || rows.length === 0) return null;

  const lists = await getMySQLClaimPaymentLists();
  return lists.find((l) => l.listNumber === listNumber) || null;
}

/**
 * Create or update a Claim Payment List
 */
export async function createMySQLClaimPaymentList(item: Partial<ClaimPaymentList>): Promise<ClaimPaymentList> {
  const p = getPool();
  const listNum = (item.listNumber || '').trim();
  if (!listNum) {
    throw new Error('List Number is required');
  }

  const id = item.id || `CPL-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
  const normListDate = normalizeDateToYMD(item.listDate) || new Date().toISOString().split('T')[0];

  await p.query(
    `INSERT INTO claim_payment_lists (id, list_number, list_date, status, notes, created_by_user_id, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       list_date = VALUES(list_date),
       status = VALUES(status),
       notes = VALUES(notes),
       updated_at = NOW()`,
    [
      id,
      listNum,
      normListDate,
      item.status || 'Payment Pending',
      item.notes || null,
      item.createdByUserId || null,
      item.createdBy || null,
    ]
  );

  return (await getMySQLClaimPaymentListByNumber(listNum))!;
}

/**
 * Update Claim Payment List status / notes
 */
export async function updateMySQLClaimPaymentList(listNumber: string, updates: Partial<ClaimPaymentList>): Promise<ClaimPaymentList | null> {
  const p = getPool();
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
  if (updates.listDate !== undefined) { fields.push('list_date = ?'); values.push(normalizeDateToYMD(updates.listDate)); }
  if (updates.notes !== undefined) { fields.push('notes = ?'); values.push(updates.notes); }

  if (fields.length > 0) {
    values.push(listNumber);
    await p.query(`UPDATE claim_payment_lists SET ${fields.join(', ')}, updated_at = NOW() WHERE list_number = ?`, values);
  }

  return await getMySQLClaimPaymentListByNumber(listNumber);
}

/**
 * Delete a Claim Payment List and all associated workers, collections, expenses, and officer commissions
 */
export async function deleteMySQLClaimPaymentList(listNumber: string): Promise<void> {
  const p = getPool();
  await p.query('DELETE FROM claim_commission_collections WHERE list_number = ?', [listNumber]);
  await p.query('DELETE FROM claim_payment_workers WHERE list_number = ?', [listNumber]);
  await p.query('DELETE FROM claim_payment_expenses WHERE list_number = ?', [listNumber]);
  await p.query('DELETE FROM claim_officer_commissions WHERE list_number = ?', [listNumber]);
  await p.query('DELETE FROM claim_payment_lists WHERE list_number = ?', [listNumber]);
}

/**
 * Map worker database row to ClaimPaymentWorker
 */
function mapClaimPaymentWorkerRow(w: any): ClaimPaymentWorker {
  const claimAmt = parseFloat(w.claim_amount || 0);
  const commSnapshotAmt = parseFloat(w.commission_amount_snapshot || 0);
  const totalRec = parseFloat(w.total_received || 0);
  const pending = Math.max(0, commSnapshotAmt - totalRec);

  return {
    id: w.id,
    listId: w.list_id || undefined,
    listNumber: w.list_number,
    workerName: w.worker_name,
    mhNumber: w.mh_number,
    mobileNumber: w.mobile_number || undefined,
    verificationDate: w.verification_date ? normalizeDateToYMD(w.verification_date) : '',
    taluka: w.taluka || '',
    scheme1: w.scheme1 || '',
    scheme2: w.scheme2 || undefined,
    scheme1Amount: parseFloat(w.scheme1_amount || 0),
    scheme2Amount: parseFloat(w.scheme2_amount || 0),
    fromSource: w.from_source || undefined,
    claimAmount: claimAmt,
    sourceType: (w.source_type as 'direct' | 'sub_agent') || 'direct',
    subAgentId: w.sub_agent_id || undefined,
    subAgentName: w.sub_agent_name || undefined,
    commissionRateSnapshot: parseFloat(w.commission_rate_snapshot || 10.00),
    commissionAmountSnapshot: commSnapshotAmt,
    totalReceived: totalRec,
    pendingCommission: pending,
    paymentStatus: (w.payment_status as 'Pending' | 'Partially Paid' | 'Paid') || 'Pending',
    lastPaymentDate: w.last_payment_date ? normalizeDateToYMD(w.last_payment_date) : undefined,
    notes: w.notes || undefined,
    createdByUserId: w.created_by_user_id || undefined,
    createdBy: w.created_by || undefined,
    createdAt: w.created_at ? new Date(w.created_at).toISOString() : new Date().toISOString(),
    updatedAt: w.updated_at ? new Date(w.updated_at).toISOString() : undefined,
  };
}

/**
 * Get Claim Payment Workers with optional filters
 */
export async function getMySQLClaimPaymentWorkers(filters: {
  listNumber?: string;
  subAgentId?: string;
  search?: string;
  status?: string;
  taluka?: string;
} = {}): Promise<ClaimPaymentWorker[]> {
  const p = getPool();
  let query = 'SELECT * FROM claim_payment_workers WHERE 1=1';
  const params: any[] = [];

  if (filters.listNumber && filters.listNumber !== 'all') {
    query += ' AND list_number = ?';
    params.push(filters.listNumber.trim());
  }

  if (filters.subAgentId && filters.subAgentId !== 'all') {
    query += ' AND sub_agent_id = ?';
    params.push(filters.subAgentId);
  }

  if (filters.taluka && filters.taluka !== 'all') {
    query += ' AND LOWER(taluka) = ?';
    params.push(filters.taluka.trim().toLowerCase());
  }

  if (filters.status && filters.status !== 'all') {
    query += ' AND payment_status = ?';
    params.push(filters.status);
  }

  if (filters.search && filters.search.trim()) {
    const s = `%${filters.search.trim().toLowerCase()}%`;
    query += ' AND (LOWER(worker_name) LIKE ? OR LOWER(mh_number) LIKE ? OR LOWER(list_number) LIKE ? OR LOWER(taluka) LIKE ?)';
    params.push(s, s, s, s);
  }

  query += ' ORDER BY created_at DESC, list_number ASC';
  const [rows]: any = await p.query(query, params);

  return rows.map((r: any) => mapClaimPaymentWorkerRow(r));
}

/**
 * Get worker by ID with all payment collection history
 */
export async function getMySQLClaimPaymentWorkerById(id: string): Promise<ClaimPaymentWorker | null> {
  const p = getPool();
  const [rows]: any = await p.query('SELECT * FROM claim_payment_workers WHERE id = ?', [id]);
  if (!rows || rows.length === 0) return null;

  const worker = mapClaimPaymentWorkerRow(rows[0]);
  const [colRows]: any = await p.query(
    'SELECT * FROM claim_commission_collections WHERE worker_payment_id = ? ORDER BY payment_date DESC, created_at DESC',
    [id]
  );
  worker.collections = colRows.map((c: any) => ({
    id: c.id,
    workerPaymentId: c.worker_payment_id,
    listNumber: c.list_number,
    mhNumber: c.mh_number,
    workerName: c.worker_name,
    receivedAmount: parseFloat(c.received_amount || 0),
    paymentDate: c.payment_date ? normalizeDateToYMD(c.payment_date) : '',
    paymentMode: c.payment_mode || 'Cash',
    referenceNumber: c.reference_number || undefined,
    remark: c.remark || undefined,
    createdByUserId: c.created_by_user_id || undefined,
    createdBy: c.created_by || undefined,
    createdAt: c.created_at ? new Date(c.created_at).toISOString() : new Date().toISOString(),
  }));

  return worker;
}

/**
 * Update worker details or notes
 */
export async function updateMySQLClaimPaymentWorker(id: string, updates: Partial<ClaimPaymentWorker>): Promise<ClaimPaymentWorker | null> {
  const p = getPool();
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.workerName !== undefined) { fields.push('worker_name = ?'); values.push(updates.workerName); }
  if (updates.mhNumber !== undefined) { fields.push('mh_number = ?'); values.push(updates.mhNumber); }
  if (updates.mobileNumber !== undefined) { fields.push('mobile_number = ?'); values.push(updates.mobileNumber); }
  if (updates.taluka !== undefined) { fields.push('taluka = ?'); values.push(updates.taluka); }
  if (updates.verificationDate !== undefined) { fields.push('verification_date = ?'); values.push(normalizeDateToYMD(updates.verificationDate)); }
  if (updates.scheme1 !== undefined) { fields.push('scheme1 = ?'); values.push(updates.scheme1); }
  if (updates.scheme2 !== undefined) { fields.push('scheme2 = ?'); values.push(updates.scheme2); }
  if (updates.scheme1Amount !== undefined) { fields.push('scheme1_amount = ?'); values.push(updates.scheme1Amount); }
  if (updates.scheme2Amount !== undefined) { fields.push('scheme2_amount = ?'); values.push(updates.scheme2Amount); }
  if (updates.fromSource !== undefined) { fields.push('from_source = ?'); values.push(updates.fromSource); }
  if (updates.claimAmount !== undefined) {
    fields.push('claim_amount = ?');
    values.push(updates.claimAmount);
    // Recalculate snapshot amount if rate exists
    if (updates.commissionRateSnapshot !== undefined) {
      fields.push('commission_rate_snapshot = ?');
      values.push(updates.commissionRateSnapshot);
      fields.push('commission_amount_snapshot = ?');
      values.push(Math.round((updates.claimAmount * (updates.commissionRateSnapshot / 100)) * 100) / 100);
    }
  }
  if (updates.notes !== undefined) { fields.push('notes = ?'); values.push(updates.notes); }

  if (fields.length > 0) {
    values.push(id);
    await p.query(`UPDATE claim_payment_workers SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`, values);
  }

  return await getMySQLClaimPaymentWorkerById(id);
}

/**
 * Delete a single worker from Claim Payments
 */
export async function deleteMySQLClaimPaymentWorker(id: string): Promise<void> {
  const p = getPool();
  await p.query('DELETE FROM claim_commission_collections WHERE worker_payment_id = ?', [id]);
  await p.query('DELETE FROM claim_payment_workers WHERE id = ?', [id]);
}

/**
 * Import Claim Payment Workers with intelligent header mapping and duplicate prevention
 */
export async function importMySQLClaimPaymentWorkers(params: {
  listNumber: string;
  listDate?: string;
  workers: Array<{
    name?: string;
    workerName?: string;
    mhNumber: string;
    mobileNumber?: string;
    verificationDate?: string;
    taluka?: string;
    scheme1?: string;
    scheme2?: string;
    scheme1Amount?: number;
    scheme2Amount?: number;
    fromSource?: string;
    amount?: number;
    claimAmount?: number;
    listNumber?: string;
    sourceType?: 'direct' | 'sub_agent';
    subAgentId?: string;
    subAgentName?: string;
    customCommissionRate?: number;
  }>;
  createdByUserId?: string;
  createdBy?: string;
}): Promise<{
  listNumber: string;
  totalProvided: number;
  importedCount: number;
  duplicateCount: number;
  duplicates: Array<{ mhNumber: string; name: string }>;
}> {
  const p = getPool();
  const defaultListNum = (params.listNumber || 'General').trim();
  const listDate = normalizeDateToYMD(params.listDate) || new Date().toISOString().split('T')[0];

  // 1. Fetch commission settings for snapshot rules
  const settings = await getMySQLCommissionSettings();
  const directDefaultRate = Number(settings.directWorkerCommissionRate || 10.00);
  const officerDefaultRate = Number(settings.defaultOfficerCommissionRate || 10.00);

  // Build a fast lookup for sub-agent commission rates
  const subAgentRateMap = new Map<string, number>();
  for (const sa of settings.subAgentRates) {
    if (sa.subAgentId) subAgentRateMap.set(sa.subAgentId, sa.commissionRate);
    if (sa.username) subAgentRateMap.set(sa.username.toLowerCase(), sa.commissionRate);
  }

  // Find all distinct lists in this batch
  const distinctLists = new Set<string>();
  distinctLists.add(defaultListNum);
  for (const w of params.workers) {
    const rowList = (w.listNumber || '').trim();
    if (rowList) distinctLists.add(rowList);
  }

  // Ensure each list exists in claim_payment_lists
  for (const lNum of distinctLists) {
    await createMySQLClaimPaymentList({
      listNumber: lNum,
      listDate,
      status: 'Payment Pending',
      createdByUserId: params.createdByUserId,
      createdBy: params.createdBy,
    });
  }

  // Find existing workers for these lists to prevent duplicate insertion
  const existingMHSetByList = new Map<string, Set<string>>();
  for (const lNum of distinctLists) {
    const [existingRows]: any = await p.query(
      'SELECT mh_number, worker_name FROM claim_payment_workers WHERE list_number = ?',
      [lNum]
    );
    const mSet = new Set<string>(existingRows.map((r: any) => (r.mh_number || '').trim().toUpperCase()));
    existingMHSetByList.set(lNum, mSet);
  }

  let importedCount = 0;
  let duplicateCount = 0;
  const duplicates: Array<{ mhNumber: string; name: string }> = [];

  for (const w of params.workers) {
    const rawMh = (w.mhNumber || '').trim().toUpperCase();
    const rawName = (w.workerName || w.name || '').trim();
    if (!rawMh || !rawName) continue;

    const rowListNum = (w.listNumber || '').trim() || defaultListNum;
    const existingMHSet = existingMHSetByList.get(rowListNum) || new Set<string>();

    if (existingMHSet.has(rawMh)) {
      duplicateCount++;
      duplicates.push({ mhNumber: rawMh, name: rawName });
      continue;
    }

    const s1Amt = Number(w.scheme1Amount || 0);
    const s2Amt = Number(w.scheme2Amount || 0);
    let claimAmt = Number(w.claimAmount || w.amount || 0);
    if (claimAmt === 0 && (s1Amt > 0 || s2Amt > 0)) {
      claimAmt = s1Amt + s2Amt;
    }

    const sourceType = w.sourceType === 'sub_agent' ? 'sub_agent' : 'direct';

    // Calculate commission snapshot percentage
    let commRate = directDefaultRate;
    if (w.customCommissionRate !== undefined && !isNaN(w.customCommissionRate)) {
      commRate = Number(w.customCommissionRate);
    } else if (sourceType === 'sub_agent' && w.subAgentId && subAgentRateMap.has(w.subAgentId)) {
      commRate = subAgentRateMap.get(w.subAgentId)!;
    }

    const commSnapshotAmt = Math.round((claimAmt * (commRate / 100)) * 100) / 100;
    const workerId = `CPW-${Date.now()}-${Math.floor(100 + Math.random() * 900)}-${importedCount}`;
    const normVerDate = w.verificationDate ? normalizeDateToYMD(w.verificationDate) : null;
    const cleanTaluka = (w.taluka || '').trim() || 'General';

    await p.query(
      `INSERT INTO claim_payment_workers
       (id, list_number, worker_name, mh_number, mobile_number, verification_date, taluka, scheme1, scheme2, scheme1_amount, scheme2_amount, from_source, claim_amount, source_type, sub_agent_id, sub_agent_name, commission_rate_snapshot, commission_amount_snapshot, total_received, payment_status, created_by_user_id, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0.00, 'Pending', ?, ?, NOW())`,
      [
        workerId,
        rowListNum,
        rawName,
        rawMh,
        w.mobileNumber || null,
        normVerDate,
        cleanTaluka,
        w.scheme1 || 'Scheme 1',
        w.scheme2 || null,
        s1Amt,
        s2Amt,
        w.fromSource || null,
        claimAmt,
        sourceType,
        w.subAgentId || null,
        w.subAgentName || null,
        commRate,
        commSnapshotAmt,
        params.createdByUserId || null,
        params.createdBy || null,
      ]
    );

    existingMHSet.add(rawMh);
    existingMHSetByList.set(rowListNum, existingMHSet);
    importedCount++;
  }

  // Update or Insert Taluka-wise Officer Commissions for all touched lists
  for (const lNum of distinctLists) {
    const [talukaTotals]: any = await p.query(
      `SELECT taluka, COALESCE(SUM(claim_amount), 0) AS total_claim_amount
       FROM claim_payment_workers
       WHERE list_number = ?
       GROUP BY taluka`,
      [lNum]
    );

    for (const tRow of talukaTotals) {
      const talukaName = tRow.taluka || 'General';
      const totalClaimAmt = parseFloat(tRow.total_claim_amount || 0);
      const officerCommAmt = Math.round((totalClaimAmt * (officerDefaultRate / 100)) * 100) / 100;
      const officerCommId = `OFF-${lNum}-${talukaName.replace(/\s+/g, '_')}`;

      await p.query(
        `INSERT INTO claim_officer_commissions
         (id, list_number, taluka, total_claim_amount, officer_commission_rate, officer_commission_amount, payment_status, created_by_user_id, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'Pending', ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
           total_claim_amount = VALUES(total_claim_amount),
           officer_commission_amount = ROUND(VALUES(total_claim_amount) * (officer_commission_rate / 100), 2),
           updated_at = NOW()`,
        [
          officerCommId,
          lNum,
          talukaName,
          totalClaimAmt,
          officerDefaultRate,
          officerCommAmt,
          params.createdByUserId || null,
          params.createdBy || null,
        ]
      );
    }
  }

  return {
    listNumber: defaultListNum,
    totalProvided: params.workers.length,
    importedCount,
    duplicateCount,
    duplicates,
  };
}

/**
 * Record a commission collection installment for a worker
 */
export async function addMySQLClaimCommissionCollection(collection: Partial<ClaimCommissionCollection>): Promise<ClaimCommissionCollection> {
  const p = getPool();
  const workerPaymentId = (collection.workerPaymentId || '').trim();
  const receivedAmount = Number(collection.receivedAmount || 0);

  if (!workerPaymentId) throw new Error('Worker Payment ID is required');
  if (receivedAmount <= 0) throw new Error('Received amount must be greater than 0');

  // Verify worker exists
  const [workerRows]: any = await p.query('SELECT * FROM claim_payment_workers WHERE id = ?', [workerPaymentId]);
  if (!workerRows || workerRows.length === 0) {
    throw new Error(`Claim payment worker with ID ${workerPaymentId} not found`);
  }
  const worker = workerRows[0];

  const collectionId = collection.id || `CPC-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
  const normPayDate = normalizeDateToYMD(collection.paymentDate) || new Date().toISOString().split('T')[0];

  // Insert collection record
  await p.query(
    `INSERT INTO claim_commission_collections
     (id, worker_payment_id, list_number, mh_number, worker_name, received_amount, payment_date, payment_mode, reference_number, remark, created_by_user_id, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      collectionId,
      workerPaymentId,
      worker.list_number,
      worker.mh_number,
      worker.worker_name,
      receivedAmount,
      normPayDate,
      collection.paymentMode || 'Cash',
      collection.referenceNumber || null,
      collection.remark || null,
      collection.createdByUserId || null,
      collection.createdBy || null,
    ]
  );

  // Recalculate total_received for this worker
  const [sumRows]: any = await p.query(
    'SELECT COALESCE(SUM(received_amount), 0) AS total_rec FROM claim_commission_collections WHERE worker_payment_id = ?',
    [workerPaymentId]
  );
  const newTotalReceived = parseFloat(sumRows[0]?.total_rec || 0);
  const snapshotExpected = parseFloat(worker.commission_amount_snapshot || 0);

  let newStatus: 'Pending' | 'Partially Paid' | 'Paid' = 'Pending';
  if (newTotalReceived >= snapshotExpected && snapshotExpected > 0) {
    newStatus = 'Paid';
  } else if (newTotalReceived > 0) {
    newStatus = 'Partially Paid';
  }

  await p.query(
    `UPDATE claim_payment_workers
     SET total_received = ?, payment_status = ?, last_payment_date = ?, updated_at = NOW()
     WHERE id = ?`,
    [newTotalReceived, newStatus, normPayDate, workerPaymentId]
  );

  // Update List status if all workers are paid
  const listNum = worker.list_number;
  const [unpaidRows]: any = await p.query(
    `SELECT COUNT(*) AS unpaid_count FROM claim_payment_workers WHERE list_number = ? AND payment_status != 'Paid'`,
    [listNum]
  );
  const unpaidCount = Number(unpaidRows[0]?.unpaid_count || 0);

  if (unpaidCount === 0) {
    await p.query(`UPDATE claim_payment_lists SET status = 'Collection Completed', updated_at = NOW() WHERE list_number = ?`, [listNum]);
  } else if (newTotalReceived > 0) {
    await p.query(
      `UPDATE claim_payment_lists SET status = 'Collection In Progress', updated_at = NOW() WHERE list_number = ? AND status = 'Payment Pending'`,
      [listNum]
    );
  }

  return {
    id: collectionId,
    workerPaymentId,
    listNumber: worker.list_number,
    mhNumber: worker.mh_number,
    workerName: worker.worker_name,
    receivedAmount,
    paymentDate: normPayDate,
    paymentMode: collection.paymentMode || 'Cash',
    referenceNumber: collection.referenceNumber || undefined,
    remark: collection.remark || undefined,
    createdByUserId: collection.createdByUserId || undefined,
    createdBy: collection.createdBy || undefined,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Delete a commission collection entry and update worker status
 */
export async function deleteMySQLClaimCommissionCollection(id: string): Promise<void> {
  const p = getPool();
  const [colRows]: any = await p.query('SELECT * FROM claim_commission_collections WHERE id = ?', [id]);
  if (!colRows || colRows.length === 0) return;
  const col = colRows[0];
  const workerPaymentId = col.worker_payment_id;

  await p.query('DELETE FROM claim_commission_collections WHERE id = ?', [id]);

  // Recalculate worker
  const [sumRows]: any = await p.query(
    'SELECT COALESCE(SUM(received_amount), 0) AS total_rec, MAX(payment_date) AS last_date FROM claim_commission_collections WHERE worker_payment_id = ?',
    [workerPaymentId]
  );
  const newTotalReceived = parseFloat(sumRows[0]?.total_rec || 0);
  const lastDate = sumRows[0]?.last_date ? normalizeDateToYMD(sumRows[0].last_date) : null;

  const [workerRows]: any = await p.query('SELECT commission_amount_snapshot FROM claim_payment_workers WHERE id = ?', [workerPaymentId]);
  const snapshotExpected = parseFloat(workerRows[0]?.commission_amount_snapshot || 0);

  let newStatus: 'Pending' | 'Partially Paid' | 'Paid' = 'Pending';
  if (newTotalReceived >= snapshotExpected && snapshotExpected > 0) {
    newStatus = 'Paid';
  } else if (newTotalReceived > 0) {
    newStatus = 'Partially Paid';
  }

  await p.query(
    `UPDATE claim_payment_workers
     SET total_received = ?, payment_status = ?, last_payment_date = ?, updated_at = NOW()
     WHERE id = ?`,
    [newTotalReceived, newStatus, lastDate, workerPaymentId]
  );
}

/**
 * Get Commission Collections with optional filters
 */
export async function getMySQLClaimCommissionCollections(workerPaymentId?: string, listNumber?: string): Promise<ClaimCommissionCollection[]> {
  const p = getPool();
  let query = 'SELECT * FROM claim_commission_collections WHERE 1=1';
  const params: any[] = [];

  if (workerPaymentId) {
    query += ' AND worker_payment_id = ?';
    params.push(workerPaymentId);
  }
  if (listNumber && listNumber !== 'all') {
    query += ' AND list_number = ?';
    params.push(listNumber);
  }

  query += ' ORDER BY payment_date DESC, created_at DESC';
  const [rows]: any = await p.query(query, params);

  return rows.map((c: any) => ({
    id: c.id,
    workerPaymentId: c.worker_payment_id,
    listNumber: c.list_number,
    mhNumber: c.mh_number,
    workerName: c.worker_name,
    receivedAmount: parseFloat(c.received_amount || 0),
    paymentDate: c.payment_date ? normalizeDateToYMD(c.payment_date) : '',
    paymentMode: c.payment_mode || 'Cash',
    referenceNumber: c.reference_number || undefined,
    remark: c.remark || undefined,
    createdByUserId: c.created_by_user_id || undefined,
    createdBy: c.created_by || undefined,
    createdAt: c.created_at ? new Date(c.created_at).toISOString() : new Date().toISOString(),
  }));
}

/**
 * Get Claim Payment Expenses
 */
export async function getMySQLClaimPaymentExpenses(listNumber?: string): Promise<ClaimPaymentExpense[]> {
  const p = getPool();
  let query = 'SELECT * FROM claim_payment_expenses WHERE 1=1';
  const params: any[] = [];

  if (listNumber && listNumber !== 'all') {
    query += ' AND list_number = ?';
    params.push(listNumber);
  }

  query += ' ORDER BY expense_date DESC, created_at DESC';
  const [rows]: any = await p.query(query, params);

  return rows.map((e: any) => ({
    id: e.id,
    listNumber: e.list_number || null,
    expenseDate: e.expense_date ? normalizeDateToYMD(e.expense_date) : '',
    category: e.category || 'Other',
    amount: parseFloat(e.amount || 0),
    description: e.description || '',
    paymentMode: e.payment_mode || 'Cash',
    remark: e.remark || undefined,
    createdByUserId: e.created_by_user_id || undefined,
    createdBy: e.created_by || undefined,
    createdAt: e.created_at ? new Date(e.created_at).toISOString() : new Date().toISOString(),
  }));
}

/**
 * Create a Claim Payment Expense
 */
export async function createMySQLClaimPaymentExpense(expense: Partial<ClaimPaymentExpense>): Promise<ClaimPaymentExpense> {
  const p = getPool();
  const id = expense.id || `EXP-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`;
  const normDate = normalizeDateToYMD(expense.expenseDate) || new Date().toISOString().split('T')[0];
  const amt = Number(expense.amount || 0);

  if (amt <= 0) throw new Error('Expense amount must be greater than 0');

  await p.query(
    `INSERT INTO claim_payment_expenses
     (id, list_number, expense_date, category, amount, description, payment_mode, remark, created_by_user_id, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      id,
      expense.listNumber || null,
      normDate,
      expense.category || 'Other',
      amt,
      expense.description || '',
      expense.paymentMode || 'Cash',
      expense.remark || null,
      expense.createdByUserId || null,
      expense.createdBy || null,
    ]
  );

  return {
    id,
    listNumber: expense.listNumber || null,
    expenseDate: normDate,
    category: expense.category || 'Other',
    amount: amt,
    description: expense.description || '',
    paymentMode: expense.paymentMode || 'Cash',
    remark: expense.remark || undefined,
    createdByUserId: expense.createdByUserId || undefined,
    createdBy: expense.createdBy || undefined,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Delete a Claim Payment Expense
 */
export async function deleteMySQLClaimPaymentExpense(id: string): Promise<void> {
  const p = getPool();
  await p.query('DELETE FROM claim_payment_expenses WHERE id = ?', [id]);
}

/**
 * Get Officer Commissions with optional listNumber filter
 */
export async function getMySQLClaimOfficerCommissions(listNumber?: string): Promise<ClaimOfficerCommission[]> {
  const p = getPool();
  let query = 'SELECT * FROM claim_officer_commissions WHERE 1=1';
  const params: any[] = [];

  if (listNumber && listNumber !== 'all') {
    query += ' AND list_number = ?';
    params.push(listNumber);
  }

  query += ' ORDER BY list_number DESC, taluka ASC';
  const [rows]: any = await p.query(query, params);

  return rows.map((o: any) => ({
    id: o.id,
    listNumber: o.list_number,
    taluka: o.taluka,
    totalClaimAmount: parseFloat(o.total_claim_amount || 0),
    officerCommissionRate: parseFloat(o.officer_commission_rate || 10.00),
    officerCommissionAmount: parseFloat(o.officer_commission_amount || 0),
    paymentStatus: (o.payment_status as 'Pending' | 'Paid') || 'Pending',
    paymentDate: o.payment_date ? normalizeDateToYMD(o.payment_date) : undefined,
    paymentMode: o.payment_mode || undefined,
    referenceNumber: o.reference_number || undefined,
    remark: o.remark || undefined,
    createdByUserId: o.created_by_user_id || undefined,
    createdBy: o.created_by || undefined,
    createdAt: o.created_at ? new Date(o.created_at).toISOString() : new Date().toISOString(),
    updatedAt: o.updated_at ? new Date(o.updated_at).toISOString() : undefined,
  }));
}

/**
 * Update Officer Commission details / payment tracking
 */
export async function updateMySQLClaimOfficerCommission(id: string, updates: Partial<ClaimOfficerCommission>): Promise<ClaimOfficerCommission | null> {
  const p = getPool();
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.officerCommissionRate !== undefined) {
    fields.push('officer_commission_rate = ?');
    values.push(updates.officerCommissionRate);
    fields.push('officer_commission_amount = ROUND(total_claim_amount * (? / 100), 2)');
    values.push(updates.officerCommissionRate);
  }
  if (updates.paymentStatus !== undefined) { fields.push('payment_status = ?'); values.push(updates.paymentStatus); }
  if (updates.paymentDate !== undefined) { fields.push('payment_date = ?'); values.push(updates.paymentDate ? normalizeDateToYMD(updates.paymentDate) : null); }
  if (updates.paymentMode !== undefined) { fields.push('payment_mode = ?'); values.push(updates.paymentMode); }
  if (updates.referenceNumber !== undefined) { fields.push('reference_number = ?'); values.push(updates.referenceNumber); }
  if (updates.remark !== undefined) { fields.push('remark = ?'); values.push(updates.remark); }

  if (fields.length > 0) {
    values.push(id);
    await p.query(`UPDATE claim_officer_commissions SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`, values);
  }

  const [rows]: any = await p.query('SELECT * FROM claim_officer_commissions WHERE id = ?', [id]);
  if (!rows || rows.length === 0) return null;
  const o = rows[0];
  return {
    id: o.id,
    listNumber: o.list_number,
    taluka: o.taluka,
    totalClaimAmount: parseFloat(o.total_claim_amount || 0),
    officerCommissionRate: parseFloat(o.officer_commission_rate || 10.00),
    officerCommissionAmount: parseFloat(o.officer_commission_amount || 0),
    paymentStatus: (o.payment_status as 'Pending' | 'Paid') || 'Pending',
    paymentDate: o.payment_date ? normalizeDateToYMD(o.payment_date) : undefined,
    paymentMode: o.payment_mode || undefined,
    referenceNumber: o.reference_number || undefined,
    remark: o.remark || undefined,
    createdByUserId: o.created_by_user_id || undefined,
    createdBy: o.created_by || undefined,
    createdAt: o.created_at ? new Date(o.created_at).toISOString() : new Date().toISOString(),
    updatedAt: o.updated_at ? new Date(o.updated_at).toISOString() : undefined,
  };
}

/**
 * Get Claim Payments Dashboard Key Statistics
 */
export async function getMySQLClaimPaymentsDashboardStats(subAgentId?: string): Promise<ClaimPaymentsDashboardStats> {
  const p = getPool();
  const todayStr = new Date().toISOString().split('T')[0];
  const monthStr = todayStr.substring(0, 7); // 'YYYY-MM'

  let workerWhere = 'WHERE 1=1';
  let collWhere = 'WHERE 1=1';
  let listWhere = 'WHERE 1=1';
  const workerParams: any[] = [];
  const collParams: any[] = [];

  if (subAgentId) {
    workerWhere += ' AND sub_agent_id = ?';
    workerParams.push(subAgentId);
    collWhere += ' AND worker_payment_id IN (SELECT id FROM claim_payment_workers WHERE sub_agent_id = ?)';
    collParams.push(subAgentId);
    listWhere += ' WHERE list_number IN (SELECT list_number FROM claim_payment_workers WHERE sub_agent_id = ?)';
  }

  // Today collection
  const [todayRows]: any = await p.query(
    `SELECT COALESCE(SUM(received_amount), 0) AS today_coll FROM claim_commission_collections ${collWhere} AND payment_date = ?`,
    [...collParams, todayStr]
  );
  const todayCommission = parseFloat(todayRows[0]?.today_coll || 0);

  // Month collection
  const [monthRows]: any = await p.query(
    `SELECT COALESCE(SUM(received_amount), 0) AS month_coll FROM claim_commission_collections ${collWhere} AND payment_date LIKE ?`,
    [...collParams, `${monthStr}%`]
  );
  const thisMonthCommission = parseFloat(monthRows[0]?.month_coll || 0);

  // Total Expected & Collected
  const [workerRows]: any = await p.query(
    `SELECT 
       COALESCE(SUM(commission_amount_snapshot), 0) AS total_expected,
       COALESCE(SUM(total_received), 0) AS total_collected,
       SUM(CASE WHEN payment_status != 'Paid' THEN 1 ELSE 0 END) AS pending_workers
     FROM claim_payment_workers ${workerWhere}`,
    workerParams
  );
  const totalCommissionExpected = parseFloat(workerRows[0]?.total_expected || 0);
  const totalCommissionCollected = parseFloat(workerRows[0]?.total_collected || 0);
  const pendingWorkerCollections = Number(workerRows[0]?.pending_workers || 0);
  const totalCommissionPending = Math.max(0, totalCommissionExpected - totalCommissionCollected);

  // Total Expenses
  let totalExpenses = 0;
  if (!subAgentId) {
    const [expRows]: any = await p.query('SELECT COALESCE(SUM(amount), 0) AS total_exp FROM claim_payment_expenses');
    totalExpenses = parseFloat(expRows[0]?.total_exp || 0);
  }

  // Total Officer Commission
  let totalOfficerCommission = 0;
  if (!subAgentId) {
    const [offRows]: any = await p.query('SELECT COALESCE(SUM(officer_commission_amount), 0) AS total_officer FROM claim_officer_commissions');
    totalOfficerCommission = parseFloat(offRows[0]?.total_officer || 0);
  }

  const netBalance = totalCommissionCollected - totalExpenses - totalOfficerCommission;

  // Active / Completed Lists
  const [listRows]: any = await p.query(
    `SELECT 
       SUM(CASE WHEN status != 'Collection Completed' THEN 1 ELSE 0 END) AS active_lists,
       SUM(CASE WHEN status = 'Collection Completed' THEN 1 ELSE 0 END) AS completed_lists
     FROM claim_payment_lists ${subAgentId ? listWhere : ''}`,
    subAgentId ? [subAgentId] : []
  );
  const activePaymentLists = Number(listRows[0]?.active_lists || 0);
  const completedLists = Number(listRows[0]?.completed_lists || 0);

  return {
    todayCommission,
    thisMonthCommission,
    totalCommissionExpected,
    totalCommissionCollected,
    totalCommissionPending,
    totalExpenses,
    totalOfficerCommission,
    netBalance,
    activePaymentLists,
    completedLists,
    pendingWorkerCollections,
  };
}

let inMemoryIncomeCollections: IncomeCollectionRecord[] = [];

function mapIncomeCollectionRow(row: any): IncomeCollectionRecord {
  return {
    id: String(row.id),
    sourceType: (row.source_type as any) || 'Registration',
    sourceId: String(row.source_id),
    workerName: String(row.worker_name || ''),
    mhNumber: String(row.mh_number || ''),
    paymentDate: row.payment_date ? normalizeDateToYMD(row.payment_date) : '',
    paymentAmount: row.payment_amount !== null && row.payment_amount !== undefined ? Number(row.payment_amount) : 0,
    paymentMode: (row.payment_mode as any) || 'Cash',
    operatorName: String(row.operator_name || ''),
    taluka: String(row.taluka || ''),
    createdByUserId: row.created_by_user_id || undefined,
    createdByUserRole: row.created_by_role || undefined,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : undefined,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : undefined,
  };
}

export async function getMySQLIncomeCollections(userIdFilter?: string, userRole?: string): Promise<IncomeCollectionRecord[]> {
  if (!isConnected || !pool) {
    let list = [...inMemoryIncomeCollections];
    if (userRole === 'sub_agent') {
      list = list.filter((c) => c.createdByUserId === userIdFilter);
    } else {
      list = list.filter((c) => c.createdByUserRole !== 'sub_agent');
    }
    return list.sort((a, b) => (b.paymentDate || '').localeCompare(a.paymentDate || ''));
  }
  const p = getPool();
  try {
    let query = 'SELECT * FROM income_collections WHERE 1=1';
    const params: any[] = [];
    if (userRole === 'sub_agent' && userIdFilter) {
      query += ' AND created_by_user_id = ?';
      params.push(userIdFilter);
    } else {
      query += ' AND (created_by_role IS NULL OR created_by_role != "sub_agent")';
    }
    query += ' ORDER BY payment_date DESC, created_at DESC';
    const [rows]: any = await p.query(query, params);
    return (rows || []).map(mapIncomeCollectionRow);
  } catch (err: any) {
    console.error('[Database Error] Failed to get income collections:', err?.message || err);
    return [...inMemoryIncomeCollections];
  }
}

export async function syncIncomeCollectionRecord(item: {
  sourceType: 'Registration' | 'Renewal';
  sourceId: string;
  workerName: string;
  mhNumber?: string;
  paymentDate: string;
  paymentAmount?: number | null;
  paymentMode?: 'Cash' | 'Online' | 'N/A' | string;
  operatorName?: string;
  taluka?: string;
  createdByUserId?: string;
  createdByUserRole?: string;
}): Promise<void> {
  const amt = Number(item.paymentAmount);
  const isValidAmount = !isNaN(amt) && amt > 0;
  const isEligibleMode = item.paymentMode === 'Cash' || item.paymentMode === 'Online';

  // If amount is 0, missing, or mode is N/A: remove from income collections
  if (!isValidAmount || !isEligibleMode) {
    await deleteIncomeCollectionBySource(item.sourceType, item.sourceId);
    return;
  }

  const uniqueId = `INC-${item.sourceType.toUpperCase().slice(0, 3)}-${item.sourceId}`;
  const paymentDate = item.paymentDate ? normalizeDateToYMD(item.paymentDate) : new Date().toISOString().split('T')[0];
  const mode = item.paymentMode === 'Online' ? 'Online' : 'Cash';

  let resolvedRole = item.createdByUserRole;
  if (!resolvedRole && item.createdByUserId && pool) {
    try {
      const [uRows]: any = await pool.query('SELECT role FROM users WHERE id = ?', [item.createdByUserId]);
      if (uRows && uRows[0]?.role) {
        resolvedRole = uRows[0].role;
      }
    } catch (_e) {}
  }

  if (!isConnected || !pool) {
    const existingIndex = inMemoryIncomeCollections.findIndex(
      (c) => c.sourceType === item.sourceType && c.sourceId === String(item.sourceId)
    );
    const newRecord: IncomeCollectionRecord = {
      id: uniqueId,
      sourceType: item.sourceType,
      sourceId: String(item.sourceId),
      workerName: item.workerName || 'Worker',
      mhNumber: item.mhNumber || '',
      paymentDate,
      paymentAmount: amt,
      paymentMode: mode,
      operatorName: item.operatorName || 'Operator',
      taluka: item.taluka || '',
      createdByUserId: item.createdByUserId,
      createdByUserRole: resolvedRole,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (existingIndex >= 0) {
      inMemoryIncomeCollections[existingIndex] = newRecord;
    } else {
      inMemoryIncomeCollections.unshift(newRecord);
    }
    return;
  }

  const p = getPool();
  try {
    await p.query(
      `INSERT INTO income_collections (
        id, source_type, source_id, worker_name, mh_number, payment_date, payment_amount, payment_mode, operator_name, taluka, created_by_user_id, created_by_role
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        worker_name = VALUES(worker_name),
        mh_number = VALUES(mh_number),
        payment_date = VALUES(payment_date),
        payment_amount = VALUES(payment_amount),
        payment_mode = VALUES(payment_mode),
        operator_name = VALUES(operator_name),
        taluka = VALUES(taluka),
        created_by_user_id = COALESCE(VALUES(created_by_user_id), created_by_user_id),
        created_by_role = COALESCE(VALUES(created_by_role), created_by_role),
        updated_at = CURRENT_TIMESTAMP`,
      [
        uniqueId,
        item.sourceType,
        String(item.sourceId),
        item.workerName || 'Worker',
        item.mhNumber || '',
        paymentDate,
        amt,
        mode,
        item.operatorName || 'Operator',
        item.taluka || '',
        item.createdByUserId || null,
        resolvedRole || null,
      ]
    );
  } catch (err: any) {
    console.error('[IncomeCollection] Failed to sync record:', err?.message || err);
  }
}

export async function deleteIncomeCollectionBySource(
  sourceType: 'Registration' | 'Renewal',
  sourceId: string
): Promise<void> {
  inMemoryIncomeCollections = inMemoryIncomeCollections.filter(
    (c) => !(c.sourceType === sourceType && c.sourceId === String(sourceId))
  );

  if (!isConnected || !pool) return;

  const p = getPool();
  try {
    await p.query('DELETE FROM income_collections WHERE source_type = ? AND source_id = ?', [
      sourceType,
      String(sourceId),
    ]);
  } catch (err: any) {
    console.error('[IncomeCollection] Failed to delete record by source:', err?.message || err);
  }
}

export async function resetMySQLIncomeCollections(): Promise<void> {
  inMemoryIncomeCollections = [];

  if (!isConnected || !pool) return;

  const p = getPool();
  try {
    // ONLY resets income_collections table. Registrations, renewals, claims, users, etc are 100% untouched!
    await p.query('TRUNCATE TABLE income_collections');
  } catch (err: any) {
    console.error('[IncomeCollection] Failed to truncate income_collections, trying DELETE:', err?.message || err);
    try {
      await p.query('DELETE FROM income_collections');
    } catch (delErr: any) {
      console.error('[IncomeCollection] DELETE failed:', delErr?.message || delErr);
      throw delErr;
    }
  }
}

export interface UniversalSearchResult {
  registrations: WorkerRegistration[];
  renewals: WorkerRenewal[];
  claims: WorkerClaim[];
  totalMatches: number;
}

export async function searchMySQLUniversal(
  searchQuery: string,
  options: {
    category?: 'all' | 'registration' | 'renewal' | 'claim';
    taluka?: string;
    status?: string;
    fromSource?: string;
    limit?: number;
    userIdFilter?: string;
  } = {}
): Promise<UniversalSearchResult> {
  const p = getPool();
  const q = (searchQuery || '').trim();
  const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 200);
  const results: UniversalSearchResult = {
    registrations: [],
    renewals: [],
    claims: [],
    totalMatches: 0,
  };

  if (!q && !options.taluka && !options.status && !options.fromSource) {
    return results;
  }

  const category = options.category || 'all';
  const cleanQ = q.replace(/\s+/g, '');
  const searchPattern = `%${cleanQ || q}%`;
  const prefixPattern = `${cleanQ || q}%`;

  const buildConditions = (tableAlias: string, hasAadhaar: boolean = false) => {
    const whereParts: string[] = [];
    const params: any[] = [];

    if (q) {
      if (hasAadhaar) {
        whereParts.push(`(
          ${tableAlias}.mh_number LIKE ? OR
          ${tableAlias}.worker_name LIKE ? OR
          ${tableAlias}.mobile_number LIKE ? OR
          ${tableAlias}.aadhaar_number LIKE ?
        )`);
        params.push(prefixPattern, searchPattern, prefixPattern, prefixPattern);
      } else {
        whereParts.push(`(
          ${tableAlias}.mh_number LIKE ? OR
          ${tableAlias}.worker_name LIKE ? OR
          ${tableAlias}.mobile_number LIKE ?
        )`);
        params.push(prefixPattern, searchPattern, prefixPattern);
      }
    }

    if (options.fromSource?.trim()) {
      whereParts.push(`${tableAlias}.from_source LIKE ?`);
      params.push(`%${options.fromSource.trim()}%`);
    }

    if (options.taluka) {
      whereParts.push(`${tableAlias}.taluka = ?`);
      params.push(options.taluka);
    }

    if (options.status) {
      whereParts.push(`${tableAlias}.status = ?`);
      params.push(options.status);
    }

    if (options.userIdFilter) {
      whereParts.push(`${tableAlias}.created_by_user_id = ?`);
      params.push(options.userIdFilter);
    }

    const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';
    return { whereClause, params };
  };

  const tasks: Promise<any>[] = [];

  if (category === 'all' || category === 'registration') {
    tasks.push(
      (async () => {
        try {
          const { whereClause, params } = buildConditions('r', true);
          const subAgentFilter = options.userIdFilter ? '' : ' AND (u.role IS NULL OR u.role != "sub_agent")';
          const finalWhere = whereClause ? `${whereClause}${subAgentFilter}` : (options.userIdFilter ? '' : 'WHERE (u.role IS NULL OR u.role != "sub_agent")');
          const query = `
            SELECT r.* FROM registrations r
            LEFT JOIN users u ON r.created_by_user_id = u.id
            ${finalWhere}
            ORDER BY r.created_at DESC
            LIMIT ?
          `;
          const [rows]: any = await p.query(query, [...params, limit]);
          results.registrations = (rows || []).map(mapRegistrationRow);
        } catch (e: any) {
          console.error('[Search] registrations search error:', e?.message || e);
        }
      })()
    );
  }

  if (category === 'all' || category === 'renewal') {
    tasks.push(
      (async () => {
        try {
          const { whereClause, params } = buildConditions('r', false);
          const subAgentFilter = options.userIdFilter ? '' : ' AND (u.role IS NULL OR u.role != "sub_agent")';
          const finalWhere = whereClause ? `${whereClause}${subAgentFilter}` : (options.userIdFilter ? '' : 'WHERE (u.role IS NULL OR u.role != "sub_agent")');
          const query = `
            SELECT r.* FROM renewals r
            LEFT JOIN users u ON r.created_by_user_id = u.id
            ${finalWhere}
            ORDER BY r.created_at DESC
            LIMIT ?
          `;
          const [rows]: any = await p.query(query, [...params, limit]);
          results.renewals = (rows || []).map(mapRenewalRow);
        } catch (e: any) {
          console.error('[Search] renewals search error:', e?.message || e);
        }
      })()
    );
  }

  if (category === 'all' || category === 'claim') {
    tasks.push(
      (async () => {
        try {
          const { whereClause, params } = buildConditions('c', false);
          const subAgentFilter = options.userIdFilter ? '' : ' AND (u.role IS NULL OR u.role != "sub_agent")';
          const finalWhere = whereClause ? `${whereClause}${subAgentFilter}` : (options.userIdFilter ? '' : 'WHERE (u.role IS NULL OR u.role != "sub_agent")');
          const query = `
            SELECT c.* FROM claims c
            LEFT JOIN users u ON c.created_by_user_id = u.id
            ${finalWhere}
            ORDER BY c.created_at DESC
            LIMIT ?
          `;
          const [rows]: any = await p.query(query, [...params, limit]);
          results.claims = (rows || []).map(mapClaimRow);
        } catch (e: any) {
          console.error('[Search] claims search error:', e?.message || e);
        }
      })()
    );
  }

  await Promise.all(tasks);
  results.totalMatches =
    results.registrations.length + results.renewals.length + results.claims.length;
  return results;
}

export interface DashboardSummaryStats {
  totalReg: number;
  totalRen: number;
  totalClm: number;
  dailyReg: number;
  dailyRen: number;
  dailyClm: number;
  dailyWorkCount: number;
  pendingReg: number;
  pendingClm: number;
  pendingWorkCount: number;
  totalDisbursed: number;
  todayIncome: {
    total: number;
    cash: number;
    online: number;
  };
  talukaCounts: Record<string, number>;
}

export async function getMySQLDashboardSummary(userIdFilter?: string): Promise<DashboardSummaryStats> {
  const p = getPool();
  const todayStr = new Date().toISOString().split('T')[0];

  const userClauseReg = userIdFilter ? 'AND r.created_by_user_id = ?' : 'AND (u.role IS NULL OR u.role != "sub_agent")';
  const userClauseRen = userIdFilter ? 'AND r.created_by_user_id = ?' : 'AND (u.role IS NULL OR u.role != "sub_agent")';
  const userClauseClm = userIdFilter ? 'AND c.created_by_user_id = ?' : 'AND (u.role IS NULL OR u.role != "sub_agent")';
  const userParams = userIdFilter ? [userIdFilter] : [];

  const [
    [regRows],
    [renRows],
    [clmRows],
    [incomeRows],
    [talukaRows]
  ]: any = await Promise.all([
    p.query(`
      SELECT 
        COUNT(*) as total,
        COALESCE(SUM(CASE WHEN r.registration_date = ? THEN 1 ELSE 0 END), 0) as daily,
        COALESCE(SUM(CASE WHEN r.status = 'Pending Verification' OR r.status = 'Pending' THEN 1 ELSE 0 END), 0) as pending
      FROM registrations r
      LEFT JOIN users u ON r.created_by_user_id = u.id
      WHERE 1=1 ${userClauseReg}
    `, [todayStr, ...userParams]),

    p.query(`
      SELECT 
        COUNT(*) as total,
        COALESCE(SUM(CASE WHEN r.renewal_date = ? THEN 1 ELSE 0 END), 0) as daily
      FROM renewals r
      LEFT JOIN users u ON r.created_by_user_id = u.id
      WHERE 1=1 ${userClauseRen}
    `, [todayStr, ...userParams]),

    p.query(`
      SELECT 
        COUNT(*) as total,
        COALESCE(SUM(CASE WHEN c.claim_date = ? THEN 1 ELSE 0 END), 0) as daily,
        COALESCE(SUM(CASE WHEN c.status = 'Submitted' OR c.status = 'Under Scrutiny' THEN 1 ELSE 0 END), 0) as pending,
        COALESCE(SUM(CASE WHEN c.status = 'Disbursed' OR c.status = 'Approved' THEN c.total_amount ELSE 0 END), 0) as totalDisbursed
      FROM claims c
      LEFT JOIN users u ON c.created_by_user_id = u.id
      WHERE 1=1 ${userClauseClm}
    `, [todayStr, ...userParams]),

    p.query(`
      SELECT payment_mode, COALESCE(SUM(payment_amount), 0) as total
      FROM income_collections
      WHERE payment_date = ? ${userIdFilter ? 'AND created_by_user_id = ?' : 'AND (created_by_role IS NULL OR created_by_role != "sub_agent")'}
      GROUP BY payment_mode
    `, userIdFilter ? [todayStr, userIdFilter] : [todayStr]),

    p.query(`
      SELECT COALESCE(r.taluka, 'Unknown') as taluka, COUNT(*) as count
      FROM registrations r
      LEFT JOIN users u ON r.created_by_user_id = u.id
      WHERE 1=1 ${userClauseReg}
      GROUP BY r.taluka
    `, userParams)
  ]);

  let todayCash = 0;
  let todayOnline = 0;
  for (const row of incomeRows || []) {
    if (row.payment_mode === 'Cash') todayCash += Number(row.total) || 0;
    else if (row.payment_mode === 'Online') todayOnline += Number(row.total) || 0;
  }

  const talukaCounts: Record<string, number> = {};
  for (const row of talukaRows || []) {
    talukaCounts[row.taluka || 'Unknown'] = Number(row.count) || 0;
  }

  const totalReg = Number(regRows?.[0]?.total) || 0;
  const totalRen = Number(renRows?.[0]?.total) || 0;
  const totalClm = Number(clmRows?.[0]?.total) || 0;
  const dailyReg = Number(regRows?.[0]?.daily) || 0;
  const dailyRen = Number(renRows?.[0]?.daily) || 0;
  const dailyClm = Number(clmRows?.[0]?.daily) || 0;
  const pendingReg = Number(regRows?.[0]?.pending) || 0;
  const pendingClm = Number(clmRows?.[0]?.pending) || 0;
  const totalDisbursed = Number(clmRows?.[0]?.totalDisbursed) || 0;

  return {
    totalReg,
    totalRen,
    totalClm,
    dailyReg,
    dailyRen,
    dailyClm,
    dailyWorkCount: dailyReg + dailyRen + dailyClm,
    pendingReg,
    pendingClm,
    pendingWorkCount: pendingReg + pendingClm,
    totalDisbursed,
    todayIncome: {
      total: todayCash + todayOnline,
      cash: todayCash,
      online: todayOnline,
    },
    talukaCounts,
  };
}

export async function insertMySQLRegistrationsBulk(records: WorkerRegistration[]): Promise<WorkerRegistration[]> {
  if (!records || records.length === 0) return [];
  const p = getPool();
  const chunkSize = 100;
  const insertedResults: WorkerRegistration[] = [];

  for (let i = 0; i < records.length; i += chunkSize) {
    const chunk = records.slice(i, i + chunkSize);
    const placeholders: string[] = [];
    const values: any[] = [];

    for (const r of chunk) {
      placeholders.push('(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      values.push(
        r.mhNumber || '',
        r.workerName || 'Worker',
        r.fatherName || null,
        r.dob || null,
        r.gender || null,
        r.mobileNumber || '',
        r.aadhaarNumber || null,
        r.address || null,
        r.village || null,
        r.taluka || null,
        r.district || null,
        r.pincode || null,
        r.bankName || null,
        r.accountNumber || null,
        r.ifsc || null,
        r.verificationDate || null,
        r.registrationDate || new Date().toISOString().split('T')[0],
        r.operatorName || null,
        r.status || 'Active',
        r.appStatus || 'Pending',
        r.fromSource || null,
        r.nextRenewalDate || null,
        r.feePaid || 100,
        r.category || null,
        r.natureOfWork || null,
        r.createdByUserId || null,
        r.createdBy || null,
        r.paymentAmount !== undefined && r.paymentAmount !== null ? r.paymentAmount : null,
        r.paymentMode || 'Cash',
        r.iwbmsStatus || null,
        (r as any).createdAt ? new Date((r as any).createdAt) : new Date()
      );
    }

    const hasExplicitIds = chunk.some((r) => !!r.id);

    if (hasExplicitIds) {
      const placeholders: string[] = [];
      const values: any[] = [];
      for (const r of chunk) {
        placeholders.push(
          '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        values.push(
          r.id ? Number(r.id) || null : null,
          r.mhNumber || '',
          r.workerName || 'Worker',
          r.fatherName || null,
          r.dob || null,
          r.gender || null,
          r.mobileNumber || '',
          r.aadhaarNumber || null,
          r.address || null,
          r.village || null,
          r.taluka || null,
          r.district || null,
          r.pincode || null,
          r.bankName || null,
          r.accountNumber || null,
          r.ifsc || null,
          r.verificationDate || null,
          r.registrationDate || new Date().toISOString().split('T')[0],
          r.operatorName || null,
          r.status || 'Active',
          r.appStatus || 'Pending',
          r.fromSource || null,
          r.nextRenewalDate || null,
          r.feePaid || 100,
          r.category || null,
          r.natureOfWork || null,
          r.createdByUserId || null,
          r.createdBy || null,
          r.paymentAmount !== undefined && r.paymentAmount !== null ? r.paymentAmount : null,
          r.paymentMode || 'Cash',
          r.iwbmsStatus || null,
          (r as any).createdAt ? new Date((r as any).createdAt) : new Date()
        );
      }

      const sql = `
        INSERT INTO registrations (
          id, mh_number, worker_name, father_name, dob, gender, mobile_number, aadhaar_number,
          address, village, taluka, district, pincode, bank_name, account_number, ifsc,
          verification_date, registration_date, operator_name, status, app_status, from_source,
          next_renewal_date, fee_paid, category, nature_of_work, created_by_user_id, created_by,
          payment_amount, payment_mode, iwbms_status, created_at
        ) VALUES ${placeholders.join(', ')}
        ON DUPLICATE KEY UPDATE
          worker_name = VALUES(worker_name),
          mh_number = COALESCE(NULLIF(VALUES(mh_number), ''), registrations.mh_number),
          mobile_number = VALUES(mobile_number),
          aadhaar_number = VALUES(aadhaar_number),
          taluka = VALUES(taluka),
          registration_date = VALUES(registration_date),
          verification_date = VALUES(verification_date),
          from_source = VALUES(from_source),
          operator_name = VALUES(operator_name),
          status = VALUES(status),
          app_status = VALUES(app_status),
          next_renewal_date = VALUES(next_renewal_date)
      `;

      await p.query(sql, values);
      for (const r of chunk) {
        insertedResults.push(r);
      }
    } else {
      const placeholders: string[] = [];
      const values: any[] = [];
      for (const r of chunk) {
        placeholders.push(
          '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        values.push(
          r.mhNumber || '',
          r.workerName || 'Worker',
          r.fatherName || null,
          r.dob || null,
          r.gender || null,
          r.mobileNumber || '',
          r.aadhaarNumber || null,
          r.address || null,
          r.village || null,
          r.taluka || null,
          r.district || null,
          r.pincode || null,
          r.bankName || null,
          r.accountNumber || null,
          r.ifsc || null,
          r.verificationDate || null,
          r.registrationDate || new Date().toISOString().split('T')[0],
          r.operatorName || null,
          r.status || 'Active',
          r.appStatus || 'Pending',
          r.fromSource || null,
          r.nextRenewalDate || null,
          r.feePaid || 100,
          r.category || null,
          r.natureOfWork || null,
          r.createdByUserId || null,
          r.createdBy || null,
          r.paymentAmount !== undefined && r.paymentAmount !== null ? r.paymentAmount : null,
          r.paymentMode || 'Cash',
          r.iwbmsStatus || null,
          (r as any).createdAt ? new Date((r as any).createdAt) : new Date()
        );
      }

      const sql = `
        INSERT INTO registrations (
          mh_number, worker_name, father_name, dob, gender, mobile_number, aadhaar_number,
          address, village, taluka, district, pincode, bank_name, account_number, ifsc,
          verification_date, registration_date, operator_name, status, app_status, from_source,
          next_renewal_date, fee_paid, category, nature_of_work, created_by_user_id, created_by,
          payment_amount, payment_mode, iwbms_status, created_at
        ) VALUES ${placeholders.join(', ')}
      `;

      const [result]: any = await p.query(sql, values);
      const firstId = result?.insertId ? Number(result.insertId) : Date.now();
      for (let idx = 0; idx < chunk.length; idx++) {
        insertedResults.push({
          ...chunk[idx],
          id: String(firstId + idx),
        });
      }
    }
  }

  return insertedResults;
}

export async function insertMySQLRenewalsBulk(records: WorkerRenewal[]): Promise<WorkerRenewal[]> {
  if (!records || records.length === 0) return [];
  const p = getPool();
  const chunkSize = 100;
  const insertedResults: WorkerRenewal[] = [];

  for (let i = 0; i < records.length; i += chunkSize) {
    const chunk = records.slice(i, i + chunkSize);
    const placeholders: string[] = [];
    const values: any[] = [];

    for (const r of chunk) {
      placeholders.push('(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
      values.push(
        r.id,
        r.mhNumber || '',
        r.workerName || 'Worker',
        r.mobileNumber || '',
        r.verificationDate || null,
        r.renewalDate || new Date().toISOString().split('T')[0],
        r.taluka || null,
        r.fromSource || null,
        r.operatorName || null,
        r.status || 'Pending',
        r.renewalPeriodYears || 1,
        r.receiptNumber || null,
        r.validTill || null,
        r.newExpiryDate || null,
        r.feeAmount || 50,
        r.paymentAmount !== undefined && r.paymentAmount !== null ? r.paymentAmount : null,
        r.paymentMode || 'Cash',
        r.remarks || null,
        r.createdByUserId || null,
        r.createdBy || null,
        (r as any).createdAt ? new Date((r as any).createdAt) : new Date()
      );
      insertedResults.push(r);
    }

    const sql = `
      INSERT INTO renewals (
        id, mh_number, worker_name, mobile_number, verification_date, renewal_date,
        taluka, from_source, operator_name, status, renewal_period_years, receipt_number,
        valid_till, new_expiry_date, fee_amount, payment_amount, payment_mode, remarks,
        created_by_user_id, created_by, created_at
      ) VALUES ${placeholders.join(', ')}
    `;

    await p.query(sql, values);
  }

  return insertedResults;
}

// =========================================================================
// 🚀 INACTIVE RENEWAL CHECKING & VERIFICATION QUEUE ENGINE
// =========================================================================

/**
 * Generates unique sequential batch ID in format RC-YYYYMMDD-001
 */
export async function generateNextRenewalBatchId(): Promise<string> {
  const p = getPool();
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const prefix = `RC-${yyyy}${mm}${dd}-`;

  try {
    const [rows]: any = await p.query(
      `SELECT batch_id FROM renewal_check_batch WHERE batch_id LIKE ? ORDER BY batch_id DESC LIMIT 1`,
      [`${prefix}%`]
    );

    if (Array.isArray(rows) && rows.length > 0 && rows[0].batch_id) {
      const lastId = String(rows[0].batch_id);
      const parts = lastId.split('-');
      const lastNum = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastNum)) {
        const nextNum = String(lastNum + 1).padStart(3, '0');
        return `${prefix}${nextNum}`;
      }
    }
  } catch (_e) {}

  return `${prefix}001`;
}

/**
 * Preview Excel file records before saving permanently.
 * Safe Excel Matching Rule:
 * 1. Exact MH Number = PRIMARY MATCH
 * 2. Exact Mobile Number = SUPPORTING MATCH
 * 3. Name = SUPPORTING INFORMATION ONLY (Name alone must NEVER automatically link)
 * If multiple possible matches are found -> Status = ISSUE_REJECTED / NEEDS_REVIEW
 * "Multiple possible matches found. Manual verification required."
 */
export async function previewRenewalCheckExcel(
  fileName: string,
  rawRows: Array<{ workerName?: string; mhNumber?: string; mobileNumber?: string }>
): Promise<{
  summary: RenewalCheckPreviewSummary;
  previewItems: RenewalCheckPreviewItem[];
}> {
  const p = getPool();
  const previewItems: RenewalCheckPreviewItem[] = [];

  // Track counts within the sheet
  const mhCountsInSheet = new Map<string, number>();
  const normalizedRows: Array<{
    rowNumber: number;
    workerName: string;
    mhNumber: string;
    mobileNumber: string;
    isValid: boolean;
    validationError?: string;
  }> = [];

  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    const workerName = (row.workerName || '').trim();
    const mhNumber = (row.mhNumber || '').trim().toUpperCase();
    const mobileNumber = (row.mobileNumber || '').trim().replace(/\D/g, '').slice(-10);

    let isValid = true;
    let validationError: string | undefined = undefined;

    if (!workerName && !mhNumber) {
      isValid = false;
      validationError = 'कामगार नाव आणि MH क्रमांक दोन्ही गहाळ आहेत (Missing Name & MH Number).';
    } else if (!workerName) {
      isValid = false;
      validationError = 'कामगाराचे नाव गहाळ आहे (Worker Name missing).';
    } else if (!mhNumber) {
      isValid = false;
      validationError = 'MH नोंदणी क्रमांक गहाळ आहे (MH Number missing).';
    }

    if (isValid && mhNumber) {
      const c = (mhCountsInSheet.get(mhNumber) || 0) + 1;
      mhCountsInSheet.set(mhNumber, c);
    }

    normalizedRows.push({
      rowNumber: i + 1,
      workerName,
      mhNumber,
      mobileNumber,
      isValid,
      validationError,
    });
  }

  // Check which MH numbers already exist in previous batches / queue
  const distinctMhList = Array.from(
    new Set(normalizedRows.filter((r) => r.isValid && r.mhNumber).map((r) => r.mhNumber))
  );

  const existingInBatchMh = new Set<string>();
  const registrationsByMh = new Map<string, Array<{ id: string; workerName: string; mobileNumber: string; status: string; taluka?: string }>>();
  const renewalsByMh = new Map<string, Array<{ id: string; renewalDate: string; renewalYear?: string; validTill?: string; newExpiryDate?: string }>>();

  const chunkSize = 400;
  for (let i = 0; i < distinctMhList.length; i += chunkSize) {
    const chunk = distinctMhList.slice(i, i + chunkSize);
    const placeholders = chunk.map(() => '?').join(',');

    try {
      // 1. Check if already in renewal_check_queue
      const [queueRows]: any = await p.query(
        `SELECT DISTINCT UPPER(mh_number) as mh FROM renewal_check_queue WHERE UPPER(mh_number) IN (${placeholders})`,
        chunk
      );
      if (Array.isArray(queueRows)) {
        queueRows.forEach((r) => {
          if (r.mh) existingInBatchMh.add(r.mh.toUpperCase());
        });
      }

      // 2. Fetch registrations for primary MH match
      const [regRows]: any = await p.query(
        `SELECT id, worker_name as workerName, UPPER(mh_number) as mh, mobile_number as mobileNumber, status, taluka
         FROM registrations WHERE UPPER(mh_number) IN (${placeholders})`,
        chunk
      );
      if (Array.isArray(regRows)) {
        regRows.forEach((r) => {
          const list = registrationsByMh.get(r.mh) || [];
          list.push({
            id: String(r.id),
            workerName: r.workerName,
            mobileNumber: r.mobileNumber || '',
            status: r.status || 'Active',
            taluka: r.taluka,
          });
          registrationsByMh.set(r.mh, list);
        });
      }

      // 3. Fetch renewals for primary MH match
      const [renRows]: any = await p.query(
        `SELECT id, UPPER(mh_number) as mh, renewal_date as renewalDate, renewal_year as renewalYear, valid_till as validTill, new_expiry_date as newExpiryDate
         FROM renewals WHERE UPPER(mh_number) IN (${placeholders}) ORDER BY renewal_date DESC`,
        chunk
      );
      if (Array.isArray(renRows)) {
        renRows.forEach((r) => {
          const list = renewalsByMh.get(r.mh) || [];
          list.push({
            id: String(r.id),
            renewalDate: r.renewalDate ? normalizeDateToYMD(r.renewalDate) : '',
            renewalYear: r.renewalYear ? normalizeRenewalYear(r.renewalYear) : undefined,
            validTill: r.validTill ? normalizeDateToYMD(r.validTill) : '',
            newExpiryDate: r.newExpiryDate ? normalizeDateToYMD(r.newExpiryDate) : '',
          });
          renewalsByMh.set(r.mh, list);
        });
      }
    } catch (err) {
      console.warn('[Renewal Check Preview] Database cross-ref error:', err);
    }
  }

  const currentFY = getFinancialYearFromDate(new Date());
  let validRowsCount = 0;
  let duplicateInSheetRowsCount = 0;
  let invalidRowsCount = 0;
  let alreadyInBatchRowsCount = 0;
  let exactMhMatchesCount = 0;
  let mobileMatchesCount = 0;
  let multipleMatchesCount = 0;
  let newWorkersCount = 0;

  for (const row of normalizedRows) {
    if (!row.isValid) {
      invalidRowsCount++;
      previewItems.push({
        rowNumber: row.rowNumber,
        workerName: row.workerName || 'अवैध / रिकामे नाव',
        mhNumber: row.mhNumber || 'अवैध MH क्रमांक',
        mobileNumber: row.mobileNumber,
        isValid: false,
        validationError: row.validationError,
        isDuplicateInSheet: false,
        isAlreadyInBatch: false,
        matchStatus: 'INVALID',
        matchDetails: row.validationError || 'अवैध रेकॉर्ड',
        suggestedStatus: 'ISSUE_REJECTED',
      });
      continue;
    }

    validRowsCount++;
    const isDuplicateInSheet = (mhCountsInSheet.get(row.mhNumber) || 0) > 1;
    if (isDuplicateInSheet) duplicateInSheetRowsCount++;

    const isAlreadyInBatch = existingInBatchMh.has(row.mhNumber);
    if (isAlreadyInBatch) alreadyInBatchRowsCount++;

    const regMatches = registrationsByMh.get(row.mhNumber) || [];
    const renMatches = renewalsByMh.get(row.mhNumber) || [];

    let matchStatus: RenewalCheckPreviewItem['matchStatus'] = 'NEW_WORKER';
    let matchedWorkerName: string | undefined = undefined;
    let matchedRegistrationStatus: string | undefined = undefined;
    let matchDetails = 'कार्यालय डेटाबेसमध्ये नोंद नाही (नवीन कामगार)';
    let suggestedStatus: RenewalVerificationStatus = 'PENDING';

    const latestRenewal = renMatches.length > 0 ? renMatches[0] : undefined;
    const lastRenewalDate = latestRenewal?.renewalDate;
    const lastRenewalYear = latestRenewal?.renewalYear || (lastRenewalDate ? getFinancialYearFromDate(lastRenewalDate) : undefined);
    const nextRenewalYear = lastRenewalYear ? getNextRenewalYear(lastRenewalYear) : currentFY;

    // SAFE EXCEL MATCHING EVALUATION:
    if (regMatches.length > 1) {
      // Multiple records found with same MH Number!
      matchStatus = 'MULTIPLE_MATCHES';
      multipleMatchesCount++;
      suggestedStatus = 'ISSUE_REJECTED';
      matchDetails = 'एकाच MH क्रमांकाशी एकापेक्षा जास्त नोंदी सापडल्या. मॅन्युअल पडताळणी आवश्यक. (Multiple possible matches found. Manual verification required.)';
    } else if (regMatches.length === 1) {
      const reg = regMatches[0];
      matchedWorkerName = reg.workerName;
      matchedRegistrationStatus = reg.status;

      // Check mobile match for supporting information
      const cleanRegMob = (reg.mobileNumber || '').replace(/\D/g, '').slice(-10);
      const cleanRowMob = row.mobileNumber;

      if (cleanRowMob && cleanRegMob && cleanRowMob === cleanRegMob) {
        matchStatus = 'MOBILE_SUPPORT_MATCH';
        mobileMatchesCount++;
        exactMhMatchesCount++;
        matchDetails = `MH क्रमांक व मोबाईल दोन्ही जुळले (${reg.workerName} - ${reg.status})`;
      } else {
        matchStatus = 'EXACT_MH_MATCH';
        exactMhMatchesCount++;
        matchDetails = `MH क्रमांक जुळला (${reg.workerName} - ${reg.status})`;
      }
    } else if (renMatches.length > 0) {
      // Found in renewals table
      matchStatus = 'EXACT_MH_MATCH';
      exactMhMatchesCount++;
      matchDetails = `आधीचे नूतनीकरण सापडले (शेवटचे नूतनीकरण: ${lastRenewalDate || '-'})`;
    } else {
      matchStatus = 'NEW_WORKER';
      newWorkersCount++;
      matchDetails = 'कार्यालय डेटाबेसमध्ये नोंद नाही (नवीन कामगार)';
    }

    // Check if worker already has renewal for current target year
    const hasRenewalForCurrentYear = renMatches.some(
      (rn) => rn.renewalYear === currentFY || (rn.newExpiryDate && rn.newExpiryDate > new Date().toISOString().split('T')[0])
    );
    if (hasRenewalForCurrentYear) {
      matchDetails += ` ⚠️ चालू आर्थिक वर्षाचे (${currentFY}) नूतनीकरण आधीच पूर्ण झाले आहे!`;
    }

    previewItems.push({
      rowNumber: row.rowNumber,
      workerName: row.workerName,
      mhNumber: row.mhNumber,
      mobileNumber: row.mobileNumber,
      isValid: true,
      isDuplicateInSheet,
      isAlreadyInBatch,
      matchStatus,
      matchedWorkerName,
      matchedRegistrationStatus,
      lastRenewalDate,
      lastRenewalYear,
      nextRenewalYear,
      matchDetails,
      suggestedStatus,
    });
  }

  const summary: RenewalCheckPreviewSummary = {
    fileName,
    totalRows: rawRows.length,
    validRows: validRowsCount,
    duplicateInSheetRows: duplicateInSheetRowsCount,
    invalidRows: invalidRowsCount,
    alreadyInBatchRows: alreadyInBatchRowsCount,
    exactMhMatches: exactMhMatchesCount,
    mobileMatches: mobileMatchesCount,
    multipleMatches: multipleMatchesCount,
    newWorkers: newWorkersCount,
    previewItems,
  };

  return { summary, previewItems };
}

/**
 * Confirm and insert imported batch into database.
 * Stores in renewal_check_batch and renewal_check_queue.
 * Adds audit log.
 */
export async function confirmRenewalCheckBatch(
  batchIdInput: string | undefined,
  filename: string,
  validItems: Array<{
    workerName: string;
    mhNumber: string;
    mobileNumber?: string;
    matchStatus?: string;
    suggestedStatus?: RenewalVerificationStatus;
  }>,
  importedBy?: string,
  assignedTo?: string,
  assignedToName?: string
): Promise<{
  batchId: string;
  filename: string;
  totalRecords: number;
  stats: RenewalCheckBatchStats;
}> {
  const p = getPool();

  const batchId =
    batchIdInput && batchIdInput.startsWith('RC-')
      ? batchIdInput
      : await generateNextRenewalBatchId();

  const totalRecords = validItems.length;
  if (totalRecords === 0) {
    throw new Error('इम्पोर्ट करण्यासाठी कोणतेही वैध रेकॉर्ड उपलब्ध नाहीत (No valid items to import).');
  }

  // 1. Insert into renewal_check_batch
  await p.query(
    `INSERT INTO renewal_check_batch (
      batch_id, filename, file_name, imported_by, imported_at,
      total_records, renewed_count, call_pending_count, issue_count,
      skipped_count, pending_count, status, created_by, created_at
    ) VALUES (?, ?, ?, ?, NOW(), ?, 0, 0, 0, 0, ?, 'ACTIVE', ?, NOW())
    ON DUPLICATE KEY UPDATE
      filename = VALUES(filename),
      file_name = VALUES(file_name),
      total_records = VALUES(total_records),
      pending_count = VALUES(pending_count)`,
    [
      batchId,
      filename,
      filename,
      importedBy || 'Staff Operator',
      totalRecords,
      totalRecords,
      importedBy || 'Staff Operator',
    ]
  );

  // 2. Insert items into renewal_check_queue in chunks
  const chunkSize = 500;
  for (let i = 0; i < validItems.length; i += chunkSize) {
    const chunk = validItems.slice(i, i + chunkSize);
    const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, NOW())').join(', ');
    const values: any[] = [];

    chunk.forEach((item) => {
      const status: RenewalVerificationStatus = item.suggestedStatus || 'PENDING';
      values.push(
        batchId,
        item.workerName.trim(),
        item.mhNumber.trim().toUpperCase(),
        item.mobileNumber ? item.mobileNumber.trim().replace(/\D/g, '').slice(-10) : null,
        status,
        item.matchStatus || 'EXACT_MH_MATCH',
        assignedTo || null,
        assignedToName || null
      );
    });

    await p.query(
      `INSERT INTO renewal_check_queue (
        batch_id, worker_name, mh_number, mobile_number,
        verification_status, match_status, assigned_to, assigned_to_name, created_at
      ) VALUES ${placeholders}`,
      values
    );
  }

  // 3. Insert initial audit log for batch creation
  await p.query(
    `INSERT INTO renewal_check_audit_log (
      queue_item_id, batch_id, old_status, new_status, changed_by, changed_by_name, changed_at, remarks
    ) VALUES (?, ?, ?, ?, ?, ?, NOW(), ?)`,
    [
      0,
      batchId,
      'NONE',
      'BATCH_CREATED',
      importedBy || 'Staff',
      importedBy || 'Staff Operator',
      `एक्सेल फाईल '${filename}' मधून ${totalRecords} कामगार इनॲक्टिव्ह तपासणी रांगेत आयात केले (Batch imported).`,
    ]
  ).catch(() => {});

  const stats: RenewalCheckBatchStats = {
    total: totalRecords,
    pending: totalRecords,
    renewed: 0,
    alreadyRenewed: 0,
    callPending: 0,
    rejected: 0,
    skipped: 0,
    completionPercentage: 0,
  };

  return {
    batchId,
    filename,
    totalRecords,
    stats,
  };
}

/**
 * Backward-compatible alias for existing upload flow
 */
export async function createRenewalCheckBatchWithItems(
  batchId: string,
  filename: string,
  rawItems: Array<{ workerName: string; mhNumber: string; mobileNumber?: string }>,
  createdBy?: string
) {
  const cleanedItems = rawItems
    .map((item) => ({
      workerName: (item.workerName || '').trim(),
      mhNumber: (item.mhNumber || '').trim().toUpperCase(),
      mobileNumber: (item.mobileNumber || '').trim().replace(/\D/g, '').slice(-10),
    }))
    .filter((item) => item.workerName.length > 0 && item.mhNumber.length > 0);

  const result = await confirmRenewalCheckBatch(batchId, filename, cleanedItems, createdBy);

  return {
    ...result,
    sheetDuplicatesCount: 0,
    existingInDbCount: 0,
  };
}

/**
 * Get list of all batches with real-time stats
 */
export async function getRenewalCheckBatches(): Promise<RenewalCheckBatch[]> {
  const p = getPool();
  const [rows]: any = await p.query(
    `SELECT 
       b.batch_id as batchId,
       COALESCE(b.file_name, b.filename) as filename,
       b.total_records as totalRecords,
       COALESCE(b.imported_by, b.created_by) as createdBy,
       COALESCE(b.imported_at, b.created_at) as createdAt,
       b.status as batchStatus,
       COUNT(q.id) as actualTotal,
       SUM(CASE WHEN q.verification_status = 'PENDING' THEN 1 ELSE 0 END) as pendingCount,
       SUM(CASE WHEN q.verification_status = 'RENEWED' THEN 1 ELSE 0 END) as renewedCount,
       SUM(CASE WHEN q.verification_status = 'ALREADY_RENEWED' THEN 1 ELSE 0 END) as alreadyRenewedCount,
       SUM(CASE WHEN q.verification_status = 'CALL_PENDING' THEN 1 ELSE 0 END) as callPendingCount,
       SUM(CASE WHEN q.verification_status = 'ISSUE_REJECTED' THEN 1 ELSE 0 END) as rejectedCount,
       SUM(CASE WHEN q.verification_status = 'SKIPPED' THEN 1 ELSE 0 END) as skippedCount
     FROM renewal_check_batch b
     LEFT JOIN renewal_check_queue q ON b.batch_id = q.batch_id
     GROUP BY b.batch_id, b.filename, b.file_name, b.total_records, b.imported_by, b.created_by, b.imported_at, b.created_at, b.status
     ORDER BY COALESCE(b.imported_at, b.created_at) DESC
     LIMIT 100`
  );

  if (!Array.isArray(rows)) return [];

  return rows.map((r: any) => {
    const total = Number(r.actualTotal || r.totalRecords || 0);
    const renewed = Number(r.renewedCount || 0);
    const alreadyRenewed = Number(r.alreadyRenewedCount || 0);
    const callPending = Number(r.callPendingCount || 0);
    const rejected = Number(r.rejectedCount || 0);
    const skipped = Number(r.skippedCount || 0);
    const pending = Number(r.pendingCount || 0);
    const processed = renewed + alreadyRenewed + callPending + rejected + skipped;
    const completionPercentage = total > 0 ? Math.round((processed / total) * 100) : 0;

    return {
      batchId: r.batchId,
      filename: r.filename,
      totalRecords: total,
      renewedCount: renewed,
      alreadyRenewedCount: alreadyRenewed,
      callPendingCount: callPending,
      issueCount: rejected,
      skippedCount: skipped,
      pendingCount: pending,
      status: r.batchStatus || 'ACTIVE',
      createdBy: r.createdBy || 'Staff Operator',
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
      stats: {
        total,
        pending,
        renewed,
        alreadyRenewed,
        callPending,
        rejected,
        skipped,
        completionPercentage,
      },
    };
  });
}

/**
 * Get batch details, stats, and queue items with server-side filters
 */
export async function getRenewalCheckBatchDetails(
  batchId: string,
  filterStatus?: string,
  search?: string,
  assignedTo?: string,
  dateFilter?: string
): Promise<{
  batch: RenewalCheckBatch | null;
  stats: RenewalCheckBatchStats;
  items: RenewalCheckQueueItem[];
}> {
  const p = getPool();

  // 1. Get batch metadata
  const [bRows]: any = await p.query(
    `SELECT batch_id as batchId, COALESCE(file_name, filename) as filename, total_records as totalRecords,
            COALESCE(imported_by, created_by) as createdBy, COALESCE(imported_at, created_at) as createdAt, status
     FROM renewal_check_batch WHERE batch_id = ?`,
    [batchId]
  );

  const batchMeta = Array.isArray(bRows) && bRows.length > 0 ? bRows[0] : null;

  // 2. Get batch aggregated statistics
  const [sRows]: any = await p.query(
    `SELECT 
       COUNT(id) as total,
       SUM(CASE WHEN verification_status = 'PENDING' THEN 1 ELSE 0 END) as pending,
       SUM(CASE WHEN verification_status = 'RENEWED' THEN 1 ELSE 0 END) as renewed,
       SUM(CASE WHEN verification_status = 'ALREADY_RENEWED' THEN 1 ELSE 0 END) as alreadyRenewed,
       SUM(CASE WHEN verification_status = 'CALL_PENDING' THEN 1 ELSE 0 END) as callPending,
       SUM(CASE WHEN verification_status = 'ISSUE_REJECTED' THEN 1 ELSE 0 END) as rejected,
       SUM(CASE WHEN verification_status = 'SKIPPED' THEN 1 ELSE 0 END) as skipped
     FROM renewal_check_queue WHERE batch_id = ?`,
    [batchId]
  );

  const statRow = sRows && sRows[0] ? sRows[0] : {};
  const total = Number(statRow.total || 0);
  const renewed = Number(statRow.renewed || 0);
  const alreadyRenewed = Number(statRow.alreadyRenewed || 0);
  const callPending = Number(statRow.callPending || 0);
  const rejected = Number(statRow.rejected || 0);
  const skipped = Number(statRow.skipped || 0);
  const pending = Number(statRow.pending || 0);
  const processed = renewed + alreadyRenewed + callPending + rejected + skipped;
  const completionPercentage = total > 0 ? Math.round((processed / total) * 100) : 0;

  const stats: RenewalCheckBatchStats = {
    total,
    pending,
    renewed,
    alreadyRenewed,
    callPending,
    rejected,
    skipped,
    completionPercentage,
  };

  // 3. Query items with filters
  let query = `
    SELECT 
      id, batch_id as batchId, worker_name as workerName, mh_number as mhNumber,
      mobile_number as mobileNumber, verification_status as verificationStatus,
      operator_notes as operatorNotes, match_status as matchStatus,
      matched_worker_id as matchedWorkerId, assigned_to as assignedTo,
      assigned_to_name as assignedToName, processed_by as processedBy,
      processed_by_name as processedByName, processed_at as processedAt,
      created_at as createdAt
    FROM renewal_check_queue
    WHERE batch_id = ?
  `;
  const params: any[] = [batchId];

  if (filterStatus && filterStatus !== 'ALL') {
    query += ` AND verification_status = ?`;
    params.push(filterStatus);
  }

  if (search && search.trim()) {
    const s = `%${search.trim()}%`;
    query += ` AND (worker_name LIKE ? OR mh_number LIKE ? OR mobile_number LIKE ?)`;
    params.push(s, s, s);
  }

  if (assignedTo && assignedTo.trim() && assignedTo !== 'ALL') {
    query += ` AND assigned_to = ?`;
    params.push(assignedTo.trim());
  }

  if (dateFilter && dateFilter.trim()) {
    query += ` AND DATE(created_at) = ?`;
    params.push(dateFilter.trim());
  }

  query += ` ORDER BY id ASC LIMIT 2500`;

  const [iRows]: any = await p.query(query, params);
  const items: RenewalCheckQueueItem[] = [];

  if (Array.isArray(iRows) && iRows.length > 0) {
    const mhList = Array.from(new Set(iRows.map((r) => (r.mhNumber || '').trim().toUpperCase())));
    const regMap = new Map<string, { status: string; taluka?: string }>();
    const renMap = new Map<string, { lastRenewalDate: string; validTill?: string; renewalYear?: string }>();

    if (mhList.length > 0) {
      const chunkSize = 500;
      for (let i = 0; i < mhList.length; i += chunkSize) {
        const chunk = mhList.slice(i, i + chunkSize);
        const placeholders = chunk.map(() => '?').join(',');

        try {
          const [rRows]: any = await p.query(
            `SELECT UPPER(mh_number) as mh, status, taluka FROM registrations WHERE UPPER(mh_number) IN (${placeholders})`,
            chunk
          );
          if (Array.isArray(rRows)) {
            rRows.forEach((r) => {
              if (r.mh) regMap.set(r.mh, { status: r.status, taluka: r.taluka });
            });
          }

          const [rnRows]: any = await p.query(
            `SELECT UPPER(mh_number) as mh, renewal_date, valid_till, renewal_year FROM renewals WHERE UPPER(mh_number) IN (${placeholders}) ORDER BY renewal_date DESC`,
            chunk
          );
          if (Array.isArray(rnRows)) {
            rnRows.forEach((r) => {
              if (r.mh && !renMap.has(r.mh)) {
                renMap.set(r.mh, {
                  lastRenewalDate: r.renewal_date ? normalizeDateToYMD(r.renewal_date) : '',
                  validTill: r.valid_till ? normalizeDateToYMD(r.valid_till) : '',
                  renewalYear: r.renewal_year ? normalizeRenewalYear(r.renewal_year) : undefined,
                });
              }
            });
          }
        } catch (e) {
          console.warn('[Renewal Check] Cross-reference query warning:', e);
        }
      }
    }

    const currentFY = getFinancialYearFromDate(new Date());

    iRows.forEach((r: any) => {
      const mhClean = (r.mhNumber || '').trim().toUpperCase();
      const reg = regMap.get(mhClean);
      const ren = renMap.get(mhClean);

      let databaseMatchInfo = 'नवीन (Not in Office DB)';
      if (ren) {
        databaseMatchInfo = `आधीचे नूतनीकरण: ${ren.lastRenewalDate || '-'}`;
      } else if (reg) {
        databaseMatchInfo = `नोंदणीकृत (${reg.status || 'Active'})`;
      }

      const lastRenewalYear = ren?.renewalYear || (ren?.lastRenewalDate ? getFinancialYearFromDate(ren.lastRenewalDate) : undefined);
      const nextRenewalYear = lastRenewalYear ? getNextRenewalYear(lastRenewalYear) : currentFY;

      items.push({
        id: Number(r.id),
        batchId: r.batchId,
        workerName: r.workerName,
        mhNumber: r.mhNumber,
        mobileNumber: r.mobileNumber || '',
        verificationStatus: r.verificationStatus,
        operatorNotes: r.operatorNotes || '',
        matchStatus: r.matchStatus || 'EXACT_MH_MATCH',
        matchedWorkerId: r.matchedWorkerId || undefined,
        assignedTo: r.assignedTo || undefined,
        assignedToName: r.assignedToName || undefined,
        processedBy: r.processedBy || '',
        processedByName: r.processedByName || '',
        processedAt: r.processedAt ? new Date(r.processedAt).toISOString() : undefined,
        createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
        existingInRegistrations: Boolean(reg),
        existingInRenewals: Boolean(ren),
        registrationStatus: reg?.status,
        lastRenewalDate: ren?.lastRenewalDate,
        lastRenewalYear,
        nextRenewalYear,
        databaseMatchInfo,
      });
    });
  }

  const batch: RenewalCheckBatch | null = batchMeta
    ? {
        batchId: batchMeta.batchId,
        filename: batchMeta.filename,
        totalRecords: total,
        renewedCount: renewed,
        callPendingCount: callPending,
        issueCount: rejected,
        skippedCount: skipped,
        pendingCount: pending,
        status: batchMeta.status || 'ACTIVE',
        createdBy: batchMeta.createdBy || 'Staff Operator',
        createdAt: batchMeta.createdAt ? new Date(batchMeta.createdAt).toISOString() : new Date().toISOString(),
        stats,
      }
    : null;

  return {
    batch,
    stats,
    items,
  };
}

/**
 * Get comprehensive worker renewal history and registration details before processing.
 * Checks for duplicate renewal for target year.
 */
export async function getRenewalCheckWorkerHistory(
  queueItemId: number
): Promise<RenewalCheckWorkerHistory> {
  const p = getPool();

  const [qRows]: any = await p.query(
    `SELECT * FROM renewal_check_queue WHERE id = ?`,
    [queueItemId]
  );

  if (!qRows || qRows.length === 0) {
    throw new Error(`Queue item #${queueItemId} सापडला नाही (Item not found).`);
  }

  const item = qRows[0];
  const cleanMh = String(item.mh_number || '').trim().toUpperCase();

  // 1. Fetch worker registration details
  const [regRows]: any = await p.query(
    `SELECT worker_name, father_name, taluka, district, status, registration_date, aadhaar_number, mobile_number
     FROM registrations WHERE UPPER(mh_number) = ? LIMIT 1`,
    [cleanMh]
  );
  const reg = Array.isArray(regRows) && regRows.length > 0 ? regRows[0] : null;

  // 2. Fetch all previous yearly renewals (DO NOT DELETE OR OVERWRITE)
  const [renRows]: any = await p.query(
    `SELECT * FROM renewals WHERE UPPER(mh_number) = ? ORDER BY renewal_date DESC`,
    [cleanMh]
  );
  const previousRenewals: WorkerRenewal[] = Array.isArray(renRows)
    ? renRows.map((r) => mapRenewalRow(r))
    : [];

  // Determine last and next renewal years
  const latestRen = previousRenewals.length > 0 ? previousRenewals[0] : null;
  const lastRenewalDate = latestRen?.renewalDate;
  const lastRenewalYear = latestRen?.renewalYear || (lastRenewalDate ? getFinancialYearFromDate(lastRenewalDate) : undefined);
  const currentFY = getFinancialYearFromDate(new Date());
  const nextRenewalYear = lastRenewalYear ? getNextRenewalYear(lastRenewalYear) : currentFY;

  // Check duplicate protection for current target year
  let isDuplicateForTargetYear = false;
  let duplicateWarningMessage: string | undefined = undefined;

  const targetCheckYear = nextRenewalYear || currentFY;
  const existingRenForYear = previousRenewals.find(
    (rn) => rn.renewalYear === targetCheckYear || rn.renewalYear === currentFY
  );

  if (existingRenForYear) {
    isDuplicateForTargetYear = true;
    duplicateWarningMessage = `या कामगाराचे आर्थिक वर्ष ${existingRenForYear.renewalYear || currentFY} चे नूतनीकरण आधीच पूर्ण झाले आहे (Renewal already completed for this year). दुबार नूतनीकरण करता येणार नाही.`;
  }

  return {
    queueItemId,
    workerName: item.worker_name,
    mhNumber: item.mh_number,
    mobileNumber: item.mobile_number || undefined,
    currentStatus: item.verification_status,
    operatorNotes: item.operator_notes || undefined,
    registrationDetails: reg
      ? {
          workerName: reg.worker_name,
          fatherName: reg.father_name,
          taluka: reg.taluka,
          district: reg.district,
          status: reg.status,
          registrationDate: reg.registration_date ? normalizeDateToYMD(reg.registration_date) : undefined,
          aadhaarNumber: reg.aadhaar_number,
        }
      : null,
    lastRenewalDate,
    lastRenewalYear,
    nextRenewalYear,
    isDuplicateForTargetYear,
    duplicateWarningMessage,
    previousRenewals,
  };
}

/**
 * Update queue item status with complete safety checks:
 * 1. Safe worker identification using MH number
 * 2. Checks existing renewal history
 * 3. Prevents duplicate renewals for the same renewal year
 * 4. Saves audit log
 * 5. Returns next pending customer ID for NEXT CUSTOMER workflow
 */
export async function updateRenewalCheckQueueItemStatus(
  id: number,
  input: {
    status: RenewalVerificationStatus;
    operatorNotes?: string;
    processedBy?: string;
    processedByName?: string;
    renewalDetails?: {
      feeAmount?: number;
      renewalPeriodYears?: number;
      renewalYear?: string;
      receiptNumber?: string;
      validTill?: string;
      taluka?: string;
      verificationDate?: string;
    };
  }
): Promise<{
  updatedItem: RenewalCheckQueueItem;
  stats: RenewalCheckBatchStats;
  createdRenewal?: WorkerRenewal;
  nextPendingItemId?: number;
  duplicateWarning?: string;
}> {
  const p = getPool();

  // 1. Get current queue record
  const [rows]: any = await p.query(
    `SELECT * FROM renewal_check_queue WHERE id = ?`,
    [id]
  );

  if (!rows || rows.length === 0) {
    throw new Error(`Queue item #${id} सापडला नाही (Queue item not found).`);
  }

  const current = rows[0];
  const oldStatus = current.verification_status;
  const newStatus = input.status;
  const operatorNotes = input.operatorNotes !== undefined ? input.operatorNotes : current.operator_notes;
  const processedBy = input.processedBy || current.processed_by || '1';
  const processedByName = input.processedByName || current.processed_by_name || 'Staff Operator';
  const cleanMh = String(current.mh_number || '').trim().toUpperCase();

  let createdRenewal: WorkerRenewal | undefined = undefined;
  let duplicateWarning: string | undefined = undefined;

  // 2. Action: [✅ RENEWED]
  if (newStatus === 'RENEWED') {
    // Determine target renewal year
    const todayStr = new Date().toISOString().split('T')[0];
    const currentFY = getFinancialYearFromDate(todayStr);
    const targetRenewalYear = input.renewalDetails?.renewalYear
      ? normalizeRenewalYear(input.renewalDetails.renewalYear)
      : currentFY;

    // Check duplicate renewal protection (Rule D & E)
    const [existingRenRows]: any = await p.query(
      `SELECT id, renewal_date, renewal_year, receipt_number FROM renewals
       WHERE UPPER(mh_number) = ? AND (renewal_year = ? OR renewal_year = ?)
       LIMIT 1`,
      [cleanMh, targetRenewalYear, currentFY]
    );

    if (Array.isArray(existingRenRows) && existingRenRows.length > 0) {
      // DUPLICATE DETECTED: DO NOT create second Renewal record in database!
      duplicateWarning = `Renewal already completed for this year (${targetRenewalYear}).`;
      console.warn(`[Renewal Check Safe Rule] Worker ${cleanMh} already has renewal for year ${targetRenewalYear}. Skipping duplicate insert.`);
    } else {
      // Safe creation: Reuse existing Renewal DB logic
      const [regRows]: any = await p.query(
        `SELECT taluka, registration_date, aadhaar_number, mobile_number FROM registrations WHERE UPPER(mh_number) = ? LIMIT 1`,
        [cleanMh]
      );
      const regMatch = regRows && regRows[0] ? regRows[0] : null;

      const targetTaluka = input.renewalDetails?.taluka || regMatch?.taluka || 'Junnar';
      const renewalFee = input.renewalDetails?.feeAmount !== undefined ? input.renewalDetails.feeAmount : 50;
      const renewalPeriod = 1; // Compulsory 1 year
      const receiptNo = input.renewalDetails?.receiptNumber || `VR-${Date.now().toString().slice(-6)}`;
      const verificationDate = input.renewalDetails?.verificationDate || todayStr;

      try {
        createdRenewal = await createMySQLRenewal({
          id: '',
          workerName: current.worker_name,
          mhNumber: current.mh_number,
          mobileNumber: current.mobile_number || regMatch?.mobile_number || '',
          verificationDate: verificationDate,
          renewalDate: verificationDate,
          renewalYear: targetRenewalYear,
          taluka: targetTaluka,
          fromSource: 'Renewal Verification Check',
          operatorName: processedByName,
          status: 'Pending', // Pending as requested: will be active after Excel sync
          renewalPeriodYears: renewalPeriod,
          receiptNumber: receiptNo,
          feeAmount: renewalFee,
          paymentAmount: renewalFee,
          paymentMode: 'Cash',
          remarks: operatorNotes
            ? `[Batch ${current.batch_id}] ${operatorNotes}`
            : `Verified & renewed via Inactive Renewal Verification Queue (Batch ${current.batch_id})`,
          createdByUserId: processedBy,
          createdBy: processedByName,
          aadhaarNumber: regMatch?.aadhaar_number || undefined,
        });

        // Log to activity logs
        await addMySQLLog({
          id: `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: new Date().toISOString(),
          username: processedByName,
          userRole: 'operator',
          action: 'RENEWAL_VERIFICATION_RENEWED',
          details: `कामगार ${current.worker_name} (${current.mh_number}) चे इनॲक्टिव्ह तपासणी बॅचमधून नूतनीकरण यशस्वीरीत्या नोंदवले (Year: ${targetRenewalYear}).`,
          ipAddress: '127.0.0.1',
        }).catch(() => {});
      } catch (renewalErr: any) {
        console.error('[Renewal Verification] Failed to create renewal entry:', renewalErr);
        throw new Error(`नूतनीकरण नोंद करताना त्रुटी आली: ${renewalErr?.message || 'DB Error'}`);
      }
    }
  }

  // 3. Update queue record
  await p.query(
    `UPDATE renewal_check_queue
     SET verification_status = ?,
         operator_notes = ?,
         processed_by = ?,
         processed_by_name = ?,
         processed_at = NOW()
     WHERE id = ?`,
    [newStatus, operatorNotes, processedBy, processedByName, id]
  );

  // 4. Save Audit Log (Rule T: For every status change store queue item ID, old status, new status, changed by, changed at, remarks)
  await p.query(
    `INSERT INTO renewal_check_audit_log (
      queue_item_id, batch_id, old_status, new_status, changed_by, changed_by_name, changed_at, remarks
    ) VALUES (?, ?, ?, ?, ?, ?, NOW(), ?)`,
    [
      id,
      current.batch_id,
      oldStatus,
      newStatus,
      processedBy,
      processedByName,
      duplicateWarning ? `${operatorNotes || ''} (${duplicateWarning})` : operatorNotes,
    ]
  ).catch((e) => console.warn('[Audit Log Error]', e));

  // 5. Update batch counters
  await p.query(
    `UPDATE renewal_check_batch b
     SET
       renewed_count = (SELECT COUNT(id) FROM renewal_check_queue WHERE batch_id = b.batch_id AND verification_status = 'RENEWED'),
       already_renewed_count = (SELECT COUNT(id) FROM renewal_check_queue WHERE batch_id = b.batch_id AND verification_status = 'ALREADY_RENEWED'),
       call_pending_count = (SELECT COUNT(id) FROM renewal_check_queue WHERE batch_id = b.batch_id AND verification_status = 'CALL_PENDING'),
       issue_count = (SELECT COUNT(id) FROM renewal_check_queue WHERE batch_id = b.batch_id AND verification_status = 'ISSUE_REJECTED'),
       skipped_count = (SELECT COUNT(id) FROM renewal_check_queue WHERE batch_id = b.batch_id AND verification_status = 'SKIPPED'),
       pending_count = (SELECT COUNT(id) FROM renewal_check_queue WHERE batch_id = b.batch_id AND verification_status = 'PENDING')
     WHERE batch_id = ?`,
    [current.batch_id]
  ).catch(() => {});

  // 6. Fetch updated batch stats
  const [sRows]: any = await p.query(
    `SELECT 
       COUNT(id) as total,
       SUM(CASE WHEN verification_status = 'PENDING' THEN 1 ELSE 0 END) as pending,
       SUM(CASE WHEN verification_status = 'RENEWED' THEN 1 ELSE 0 END) as renewed,
       SUM(CASE WHEN verification_status = 'ALREADY_RENEWED' THEN 1 ELSE 0 END) as alreadyRenewed,
       SUM(CASE WHEN verification_status = 'CALL_PENDING' THEN 1 ELSE 0 END) as callPending,
       SUM(CASE WHEN verification_status = 'ISSUE_REJECTED' THEN 1 ELSE 0 END) as rejected,
       SUM(CASE WHEN verification_status = 'SKIPPED' THEN 1 ELSE 0 END) as skipped
     FROM renewal_check_queue WHERE batch_id = ?`,
    [current.batch_id]
  );

  const statRow = sRows && sRows[0] ? sRows[0] : {};
  const total = Number(statRow.total || 0);
  const renewedCount = Number(statRow.renewed || 0);
  const alreadyRenewedCount = Number(statRow.alreadyRenewed || 0);
  const callPendingCount = Number(statRow.callPending || 0);
  const rejectedCount = Number(statRow.rejected || 0);
  const skippedCount = Number(statRow.skipped || 0);
  const pendingCount = Number(statRow.pending || 0);
  const processed = renewedCount + alreadyRenewedCount + callPendingCount + rejectedCount + skippedCount;
  const completionPercentage = total > 0 ? Math.round((processed / total) * 100) : 0;

  const stats: RenewalCheckBatchStats = {
    total,
    pending: pendingCount,
    renewed: renewedCount,
    alreadyRenewed: alreadyRenewedCount,
    callPending: callPendingCount,
    rejected: rejectedCount,
    skipped: skippedCount,
    completionPercentage,
  };

  // 7. Find next pending customer for NEXT CUSTOMER workflow (Rule F)
  let nextPendingItemId: number | undefined = undefined;
  const [nextRows]: any = await p.query(
    `SELECT id FROM renewal_check_queue
     WHERE batch_id = ? AND verification_status = 'PENDING' AND id != ?
     ORDER BY id ASC LIMIT 1`,
    [current.batch_id, id]
  );
  if (Array.isArray(nextRows) && nextRows.length > 0) {
    nextPendingItemId = Number(nextRows[0].id);
  }

  const updatedItem: RenewalCheckQueueItem = {
    id,
    batchId: current.batch_id,
    workerName: current.worker_name,
    mhNumber: current.mh_number,
    mobileNumber: current.mobile_number || '',
    verificationStatus: newStatus,
    operatorNotes,
    matchStatus: current.match_status,
    matchedWorkerId: current.matched_worker_id,
    assignedTo: current.assigned_to,
    assignedToName: current.assigned_to_name,
    processedBy,
    processedByName,
    processedAt: new Date().toISOString(),
    createdAt: current.created_at ? new Date(current.created_at).toISOString() : new Date().toISOString(),
  };

  return {
    updatedItem,
    stats,
    createdRenewal,
    nextPendingItemId,
    duplicateWarning,
  };
}

/**
 * Assign queue records to an operator (Rule O)
 */
export async function assignRenewalCheckQueueItems(
  batchId: string,
  itemIds: number[],
  assignedTo: string,
  assignedToName: string,
  changedBy: string,
  changedByName: string
): Promise<{ assignedCount: number }> {
  const p = getPool();
  if (itemIds.length === 0) return { assignedCount: 0 };

  const placeholders = itemIds.map(() => '?').join(',');
  await p.query(
    `UPDATE renewal_check_queue
     SET assigned_to = ?, assigned_to_name = ?
     WHERE batch_id = ? AND id IN (${placeholders})`,
    [assignedTo, assignedToName, batchId, ...itemIds]
  );

  // Add audit logs
  for (const itemId of itemIds) {
    await p.query(
      `INSERT INTO renewal_check_audit_log (
        queue_item_id, batch_id, old_status, new_status, changed_by, changed_by_name, changed_at, remarks
      ) VALUES (?, ?, 'ASSIGNMENT', 'ASSIGNMENT', ?, ?, NOW(), ?)`,
      [itemId, batchId, changedBy, changedByName, `ऑपरेटर नियुक्त केला: ${assignedToName}`]
    ).catch(() => {});
  }

  return { assignedCount: itemIds.length };
}

/**
 * Get audit logs for a queue item or entire batch (Rule T)
 */
export async function getRenewalCheckAuditLogs(
  queueItemId?: number,
  batchId?: string
): Promise<RenewalCheckAuditRecord[]> {
  const p = getPool();
  let query = `
    SELECT id, queue_item_id as queueItemId, batch_id as batchId,
           old_status as oldStatus, new_status as newStatus,
           changed_by as changedBy, changed_by_name as changedByName,
           changed_at as changedAt, remarks
    FROM renewal_check_audit_log
    WHERE 1=1
  `;
  const params: any[] = [];

  if (queueItemId && queueItemId > 0) {
    query += ` AND queue_item_id = ?`;
    params.push(queueItemId);
  } else if (batchId) {
    query += ` AND batch_id = ?`;
    params.push(batchId);
  }

  query += ` ORDER BY id DESC LIMIT 500`;

  const [rows]: any = await p.query(query, params);
  if (!Array.isArray(rows)) return [];

  return rows.map((r: any) => ({
    id: Number(r.id),
    queueItemId: Number(r.queueItemId),
    batchId: r.batchId,
    oldStatus: r.oldStatus,
    newStatus: r.newStatus,
    changedBy: r.changedBy,
    changedByName: r.changedByName,
    changedAt: r.changedAt ? new Date(r.changedAt).toISOString() : new Date().toISOString(),
    remarks: r.remarks,
  }));
}

/**
 * Export data formatted exactly as required by Rule S:
 * Worker Name, MH Number, Mobile, Status, Renewal Date, Last Renewal, Next Renewal, Operator, Processed Date, Remarks
 */
export async function getRenewalCheckExportData(
  batchId: string,
  filter?: string
): Promise<Array<Record<string, any>>> {
  const p = getPool();
  let query = `
    SELECT 
      q.id, q.batch_id, q.worker_name, q.mh_number, q.mobile_number,
      q.verification_status, q.operator_notes, q.processed_by_name,
      q.processed_at, q.created_at, b.filename, b.file_name
    FROM renewal_check_queue q
    LEFT JOIN renewal_check_batch b ON q.batch_id = b.batch_id
    WHERE q.batch_id = ?
  `;
  const params: any[] = [batchId];

  if (filter === 'PENDING_CALL') {
    query += ` AND q.verification_status IN ('PENDING', 'CALL_PENDING')`;
  } else if (filter === 'RENEWED') {
    query += ` AND q.verification_status = 'RENEWED'`;
  } else if (filter === 'ALREADY_RENEWED') {
    query += ` AND q.verification_status = 'ALREADY_RENEWED'`;
  } else if (filter === 'CALL_PENDING') {
    query += ` AND q.verification_status = 'CALL_PENDING'`;
  } else if (filter === 'ISSUE_REJECTED') {
    query += ` AND q.verification_status = 'ISSUE_REJECTED'`;
  }

  query += ` ORDER BY q.id ASC`;

  const [rows]: any = await p.query(query, params);
  if (!Array.isArray(rows) || rows.length === 0) return [];

  // Cross-reference with renewals to populate Renewal Date, Last Renewal, Next Renewal
  const mhList = Array.from(new Set(rows.map((r) => String(r.mh_number || '').trim().toUpperCase())));
  const renMap = new Map<string, { lastRenewalDate?: string; nextRenewalDate?: string; renewalDate?: string }>();

  if (mhList.length > 0) {
    const chunkSize = 400;
    for (let i = 0; i < mhList.length; i += chunkSize) {
      const chunk = mhList.slice(i, i + chunkSize);
      const placeholders = chunk.map(() => '?').join(',');
      try {
        const [renRows]: any = await p.query(
          `SELECT UPPER(mh_number) as mh, renewal_date, valid_till, new_expiry_date
           FROM renewals WHERE UPPER(mh_number) IN (${placeholders}) ORDER BY renewal_date DESC`,
          chunk
        );
        if (Array.isArray(renRows)) {
          renRows.forEach((r) => {
            if (r.mh && !renMap.has(r.mh)) {
              renMap.set(r.mh, {
                renewalDate: r.renewal_date ? normalizeDateToYMD(r.renewal_date) : undefined,
                lastRenewalDate: r.renewal_date ? normalizeDateToYMD(r.renewal_date) : undefined,
                nextRenewalDate: r.new_expiry_date ? normalizeDateToYMD(r.new_expiry_date) : (r.valid_till ? normalizeDateToYMD(r.valid_till) : undefined),
              });
            }
          });
        }
      } catch (_e) {}
    }
  }

  return rows.map((r, index) => {
    let statusLabel = r.verification_status;
    if (r.verification_status === 'PENDING') statusLabel = 'प्रलंबित (PENDING)';
    if (r.verification_status === 'RENEWED') statusLabel = 'नूतनीकरण पूर्ण (RENEWED)';
    if (r.verification_status === 'ALREADY_RENEWED') statusLabel = 'आधीच नूतनीकरण झालेले (ALREADY RENEWED)';
    if (r.verification_status === 'CALL_PENDING') statusLabel = 'कॉल करणे बाकी (CALL NEEDED)';
    if (r.verification_status === 'ISSUE_REJECTED') statusLabel = 'अडचण / नाकारले (ISSUE / REJECTED)';
    if (r.verification_status === 'SKIPPED') statusLabel = 'वगळले (SKIPPED)';

    const ren = renMap.get(String(r.mh_number || '').trim().toUpperCase());

    return {
      'अ.क्र. (Sr No)': index + 1,
      'कामगाराचे नाव (Worker Name)': r.worker_name,
      'एमएच नंबर (MH Number)': r.mh_number,
      'मोबाईल नंबर (Mobile)': r.mobile_number || '-',
      'स्थिती (Status)': statusLabel,
      'नूतनीकरण दिनांक (Renewal Date)': ren?.renewalDate || (r.verification_status === 'RENEWED' && r.processed_at ? normalizeDateToYMD(r.processed_at) : '-'),
      'मागील नूतनीकरण (Last Renewal)': ren?.lastRenewalDate || '-',
      'पुढील नूतनीकरण (Next Renewal)': ren?.nextRenewalDate || '-',
      'ऑपरेटर (Operator)': r.processed_by_name || '-',
      'तपासणी दिनांक (Processed Date)': r.processed_at
        ? new Date(r.processed_at).toLocaleString('en-IN')
        : '-',
      'शेरा / टिप्पणी (Remarks)': r.operator_notes || '-',
    };
  });
}

/**
 * Delete a single queue item from renewal_check_queue
 */
export async function deleteRenewalCheckQueueItem(
  id: number,
  deletedBy?: string,
  deletedByName?: string
): Promise<{ success: boolean; batchId: string; stats: RenewalCheckBatchStats }> {
  const p = getPool();

  const [rows]: any = await p.query(
    `SELECT * FROM renewal_check_queue WHERE id = ?`,
    [id]
  );

  if (!rows || rows.length === 0) {
    throw new Error(`Queue item #${id} सापडला नाही.`);
  }

  const item = rows[0];
  const batchId = item.batch_id;

  // 1. Delete item
  await p.query(`DELETE FROM renewal_check_queue WHERE id = ?`, [id]);

  // 2. Add audit log
  await p.query(
    `INSERT INTO renewal_check_audit_log (
      queue_item_id, batch_id, old_status, new_status, changed_by, changed_by_name, changed_at, remarks
    ) VALUES (?, ?, ?, 'DELETED', ?, ?, NOW(), ?)`,
    [
      id,
      batchId,
      item.verification_status,
      deletedBy || '1',
      deletedByName || 'Operator',
      `कामगार ${item.worker_name} (${item.mh_number}) रांगेतून हटवला (Record deleted from queue).`,
    ]
  ).catch(() => {});

  // 3. Update batch counters
  await p.query(
    `UPDATE renewal_check_batch b
     SET
       total_records = (SELECT COUNT(id) FROM renewal_check_queue WHERE batch_id = b.batch_id),
       renewed_count = (SELECT COUNT(id) FROM renewal_check_queue WHERE batch_id = b.batch_id AND verification_status = 'RENEWED'),
       already_renewed_count = (SELECT COUNT(id) FROM renewal_check_queue WHERE batch_id = b.batch_id AND verification_status = 'ALREADY_RENEWED'),
       call_pending_count = (SELECT COUNT(id) FROM renewal_check_queue WHERE batch_id = b.batch_id AND verification_status = 'CALL_PENDING'),
       issue_count = (SELECT COUNT(id) FROM renewal_check_queue WHERE batch_id = b.batch_id AND verification_status = 'ISSUE_REJECTED'),
       skipped_count = (SELECT COUNT(id) FROM renewal_check_queue WHERE batch_id = b.batch_id AND verification_status = 'SKIPPED'),
       pending_count = (SELECT COUNT(id) FROM renewal_check_queue WHERE batch_id = b.batch_id AND verification_status = 'PENDING')
     WHERE batch_id = ?`,
    [batchId]
  ).catch(() => {});

  // 4. Return updated stats
  const [sRows]: any = await p.query(
    `SELECT 
       COUNT(id) as total,
       SUM(CASE WHEN verification_status = 'PENDING' THEN 1 ELSE 0 END) as pending,
       SUM(CASE WHEN verification_status = 'RENEWED' THEN 1 ELSE 0 END) as renewed,
       SUM(CASE WHEN verification_status = 'ALREADY_RENEWED' THEN 1 ELSE 0 END) as alreadyRenewed,
       SUM(CASE WHEN verification_status = 'CALL_PENDING' THEN 1 ELSE 0 END) as callPending,
       SUM(CASE WHEN verification_status = 'ISSUE_REJECTED' THEN 1 ELSE 0 END) as rejected,
       SUM(CASE WHEN verification_status = 'SKIPPED' THEN 1 ELSE 0 END) as skipped
     FROM renewal_check_queue WHERE batch_id = ?`,
    [batchId]
  );

  const statRow = sRows && sRows[0] ? sRows[0] : {};
  const total = Number(statRow.total || 0);
  const renewedCount = Number(statRow.renewed || 0);
  const alreadyRenewedCount = Number(statRow.alreadyRenewed || 0);
  const callPendingCount = Number(statRow.callPending || 0);
  const rejectedCount = Number(statRow.rejected || 0);
  const skippedCount = Number(statRow.skipped || 0);
  const pendingCount = Number(statRow.pending || 0);
  const processed = renewedCount + alreadyRenewedCount + callPendingCount + rejectedCount + skippedCount;
  const completionPercentage = total > 0 ? Math.round((processed / total) * 100) : 0;

  const stats: RenewalCheckBatchStats = {
    total,
    pending: pendingCount,
    renewed: renewedCount,
    alreadyRenewed: alreadyRenewedCount,
    callPending: callPendingCount,
    rejected: rejectedCount,
    skipped: skippedCount,
    completionPercentage,
  };

  return { success: true, batchId, stats };
}

/**
 * Bulk delete queue items
 */
export async function deleteRenewalCheckQueueItemsBulk(
  batchId: string,
  ids: number[],
  deletedBy?: string,
  deletedByName?: string
): Promise<{ success: boolean; deletedCount: number; stats: RenewalCheckBatchStats }> {
  const p = getPool();
  if (ids.length === 0) {
    throw new Error('कोणतीही नोंद निवडलेली नाही.');
  }

  const placeholders = ids.map(() => '?').join(',');
  const [result]: any = await p.query(
    `DELETE FROM renewal_check_queue WHERE batch_id = ? AND id IN (${placeholders})`,
    [batchId, ...ids]
  );

  const deletedCount = result?.affectedRows ? Number(result.affectedRows) : ids.length;

  // Add audit log
  await p.query(
    `INSERT INTO renewal_check_audit_log (
      queue_item_id, batch_id, old_status, new_status, changed_by, changed_by_name, changed_at, remarks
    ) VALUES (0, ?, 'MULTIPLE', 'BULK_DELETED', ?, ?, NOW(), ?)`,
    [
      batchId,
      deletedBy || '1',
      deletedByName || 'Operator',
      `${deletedCount} कामगार नोंदी रांगेतून एकाच वेळी हटवल्या (Bulk deleted).`,
    ]
  ).catch(() => {});

  // Update batch counters
  await p.query(
    `UPDATE renewal_check_batch b
     SET
       total_records = (SELECT COUNT(id) FROM renewal_check_queue WHERE batch_id = b.batch_id),
       renewed_count = (SELECT COUNT(id) FROM renewal_check_queue WHERE batch_id = b.batch_id AND verification_status = 'RENEWED'),
       already_renewed_count = (SELECT COUNT(id) FROM renewal_check_queue WHERE batch_id = b.batch_id AND verification_status = 'ALREADY_RENEWED'),
       call_pending_count = (SELECT COUNT(id) FROM renewal_check_queue WHERE batch_id = b.batch_id AND verification_status = 'CALL_PENDING'),
       issue_count = (SELECT COUNT(id) FROM renewal_check_queue WHERE batch_id = b.batch_id AND verification_status = 'ISSUE_REJECTED'),
       skipped_count = (SELECT COUNT(id) FROM renewal_check_queue WHERE batch_id = b.batch_id AND verification_status = 'SKIPPED'),
       pending_count = (SELECT COUNT(id) FROM renewal_check_queue WHERE batch_id = b.batch_id AND verification_status = 'PENDING')
     WHERE batch_id = ?`,
    [batchId]
  ).catch(() => {});

  // Return updated stats
  const [sRows]: any = await p.query(
    `SELECT 
       COUNT(id) as total,
       SUM(CASE WHEN verification_status = 'PENDING' THEN 1 ELSE 0 END) as pending,
       SUM(CASE WHEN verification_status = 'RENEWED' THEN 1 ELSE 0 END) as renewed,
       SUM(CASE WHEN verification_status = 'ALREADY_RENEWED' THEN 1 ELSE 0 END) as alreadyRenewed,
       SUM(CASE WHEN verification_status = 'CALL_PENDING' THEN 1 ELSE 0 END) as callPending,
       SUM(CASE WHEN verification_status = 'ISSUE_REJECTED' THEN 1 ELSE 0 END) as rejected,
       SUM(CASE WHEN verification_status = 'SKIPPED' THEN 1 ELSE 0 END) as skipped
     FROM renewal_check_queue WHERE batch_id = ?`,
    [batchId]
  );

  const statRow = sRows && sRows[0] ? sRows[0] : {};
  const total = Number(statRow.total || 0);
  const renewedCount = Number(statRow.renewed || 0);
  const alreadyRenewedCount = Number(statRow.alreadyRenewed || 0);
  const callPendingCount = Number(statRow.callPending || 0);
  const rejectedCount = Number(statRow.rejected || 0);
  const skippedCount = Number(statRow.skipped || 0);
  const pendingCount = Number(statRow.pending || 0);
  const processed = renewedCount + alreadyRenewedCount + callPendingCount + rejectedCount + skippedCount;
  const completionPercentage = total > 0 ? Math.round((processed / total) * 100) : 0;

  const stats: RenewalCheckBatchStats = {
    total,
    pending: pendingCount,
    renewed: renewedCount,
    alreadyRenewed: alreadyRenewedCount,
    callPending: callPendingCount,
    rejected: rejectedCount,
    skipped: skippedCount,
    completionPercentage,
  };

  return { success: true, deletedCount, stats };
}

/**
 * Delete batch and associated queue items & audit logs
 */
export async function deleteRenewalCheckBatch(batchId: string): Promise<boolean> {
  const p = getPool();
  await p.query(`DELETE FROM renewal_check_audit_log WHERE batch_id = ?`, [batchId]);
  await p.query(`DELETE FROM renewal_check_queue WHERE batch_id = ?`, [batchId]);
  await p.query(`DELETE FROM renewal_check_batch WHERE batch_id = ?`, [batchId]);
  return true;
}




