-- =========================================================
-- Database Schema for Om Digital Seva Kendra (MySQL 8.0+)
-- =========================================================

CREATE DATABASE IF NOT EXISTS `om_seva_db` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `om_seva_db`;

-- ---------------------------------------------------------
-- 1. Users Table (Authentication & User Management)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id` VARCHAR(64) NOT NULL,
  `username` VARCHAR(64) NOT NULL UNIQUE,
  `password` VARCHAR(255) NOT NULL,
  `mobile` VARCHAR(20) NOT NULL UNIQUE,
  `name` VARCHAR(128) NOT NULL,
  `email` VARCHAR(128) DEFAULT NULL,
  `role` ENUM('admin', 'operator') NOT NULL DEFAULT 'operator',
  `status` ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
  `photo_url` TEXT DEFAULT NULL,
  `can_register` TINYINT(1) NOT NULL DEFAULT 1,
  `can_renew` TINYINT(1) NOT NULL DEFAULT 1,
  `can_claim` TINYINT(1) NOT NULL DEFAULT 1,
  `can_export` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_login` DATETIME DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_users_username` (`username`),
  INDEX `idx_users_mobile` (`mobile`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------
-- 2. New Registrations Table
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS `registrations` (
  `id` VARCHAR(64) NOT NULL,
  `mh_number` VARCHAR(64) NOT NULL,
  `worker_name` VARCHAR(128) NOT NULL,
  `father_name` VARCHAR(128) DEFAULT NULL,
  `dob` VARCHAR(20) DEFAULT NULL,
  `gender` VARCHAR(20) DEFAULT NULL,
  `mobile_number` VARCHAR(20) NOT NULL,
  `aadhaar_number` VARCHAR(20) DEFAULT NULL,
  `address` TEXT DEFAULT NULL,
  `village` VARCHAR(64) DEFAULT NULL,
  `taluka` VARCHAR(64) DEFAULT NULL,
  `district` VARCHAR(64) DEFAULT NULL,
  `pincode` VARCHAR(20) DEFAULT NULL,
  `bank_name` VARCHAR(128) DEFAULT NULL,
  `account_number` VARCHAR(64) DEFAULT NULL,
  `ifsc` VARCHAR(32) DEFAULT NULL,
  `verification_date` VARCHAR(32) DEFAULT NULL,
  `registration_date` VARCHAR(32) DEFAULT NULL,
  `operator_name` VARCHAR(128) DEFAULT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'Active',
  `fee_paid` DECIMAL(10,2) DEFAULT 100.00,
  `category` VARCHAR(64) DEFAULT NULL,
  `nature_of_work` VARCHAR(128) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_reg_mh_number` (`mh_number`),
  INDEX `idx_reg_mobile` (`mobile_number`),
  INDEX `idx_reg_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------
-- 3. Renewals Table
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS `renewals` (
  `id` VARCHAR(64) NOT NULL,
  `mh_number` VARCHAR(64) NOT NULL,
  `worker_name` VARCHAR(128) NOT NULL,
  `mobile_number` VARCHAR(20) NOT NULL,
  `verification_date` VARCHAR(32) DEFAULT NULL,
  `renewal_date` VARCHAR(32) DEFAULT NULL,
  `taluka` VARCHAR(64) DEFAULT NULL,
  `from_source` VARCHAR(64) DEFAULT NULL,
  `operator_name` VARCHAR(128) DEFAULT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'Completed',
  `renewal_period_years` INT NOT NULL DEFAULT 1,
  `receipt_number` VARCHAR(64) DEFAULT NULL,
  `valid_till` VARCHAR(32) DEFAULT NULL,
  `new_expiry_date` VARCHAR(32) DEFAULT NULL,
  `fee_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `remarks` TEXT DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_ren_mh_number` (`mh_number`),
  INDEX `idx_ren_mobile` (`mobile_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------
-- 4. Claims Table
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS `claims` (
  `id` VARCHAR(64) NOT NULL,
  `mh_number` VARCHAR(64) NOT NULL,
  `worker_name` VARCHAR(128) NOT NULL,
  `taluka` VARCHAR(64) DEFAULT NULL,
  `scheme1_id` VARCHAR(64) NOT NULL,
  `scheme1_name` VARCHAR(128) NOT NULL,
  `scheme1_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `scheme2_id` VARCHAR(64) DEFAULT NULL,
  `scheme2_name` VARCHAR(128) DEFAULT NULL,
  `scheme2_amount` DECIMAL(10,2) DEFAULT 0.00,
  `total_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `mobile_number` VARCHAR(20) NOT NULL,
  `operator_name` VARCHAR(128) DEFAULT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'Submitted',
  `remarks` TEXT DEFAULT NULL,
  `claim_date` VARCHAR(32) DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_claim_mh_number` (`mh_number`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------
-- 5. Reports Table (Saved & Exported Daily Reports)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS `reports` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `report_type` VARCHAR(64) NOT NULL,
  `generated_by` VARCHAR(128) NOT NULL,
  `total_records` INT NOT NULL DEFAULT 0,
  `total_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------
-- 6. Settings Table
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS `settings` (
  `id` INT NOT NULL DEFAULT 1,
  `office_name` VARCHAR(255) NOT NULL DEFAULT 'ओम डिजिटल ई-सेवा केंद्र & महा-ई-सेवा केंद्र',
  `office_logo` TEXT DEFAULT NULL,
  `office_address` TEXT DEFAULT NULL,
  `district_name` VARCHAR(128) DEFAULT 'कोल्हापूर',
  `contact_numbers` VARCHAR(128) DEFAULT '9876543210',
  `email` VARCHAR(128) DEFAULT 'support@omdigitaleseva.com',
  `registration_fee` DECIMAL(10,2) NOT NULL DEFAULT 50.00,
  `renewal_fee` DECIMAL(10,2) NOT NULL DEFAULT 30.00,
  `auto_approve_claims` TINYINT(1) NOT NULL DEFAULT 0,
  `theme_mode` VARCHAR(32) NOT NULL DEFAULT 'blue-gradient',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------
-- 7. Activity Logs Table
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS `activity_logs` (
  `id` VARCHAR(64) NOT NULL,
  `timestamp` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `username` VARCHAR(64) NOT NULL,
  `role` VARCHAR(32) NOT NULL,
  `action` VARCHAR(64) NOT NULL,
  `details` TEXT DEFAULT NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_logs_timestamp` (`timestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------
-- Default Initial Seed Data (Admin user: admin / admin123)
-- Password bcrypt hashes generated for standard demo users
-- ---------------------------------------------------------
INSERT INTO `users` (`id`, `username`, `password`, `mobile`, `name`, `email`, `role`, `status`, `photo_url`, `can_register`, `can_renew`, `can_claim`, `can_export`, `created_at`)
VALUES
('usr-admin-1', 'admin', '$2a$10$vY3P8n34q/V5P.fPqQ7eGuC80l2mDkZ70v9z5Y.3J2nL1G2mK3L4.', '9876543210', 'Omkar Kolhal (Admin)', 'admin@omdigitaleseva.com', 'admin', 'active', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80', 1, 1, 1, 1, NOW()),
('usr-op-1', 'operator1', '$2a$10$vY3P8n34q/V5P.fPqQ7eGuC80l2mDkZ70v9z5Y.3J2nL1G2mK3L4.', '9123456789', 'Rahul Shinde', 'rahul@omdigitaleseva.com', 'operator', 'active', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80', 1, 1, 1, 0, NOW())
ON DUPLICATE KEY UPDATE `username` = `username`;

INSERT INTO `settings` (`id`, `office_name`, `office_address`, `district_name`, `contact_numbers`, `email`, `registration_fee`, `renewal_fee`, `auto_approve_claims`, `theme_mode`)
VALUES (1, 'ओम डिजिटल ई-सेवा केंद्र & महा-ई-सेवा केंद्र', 'मुख्य रस्ता, जुना बस स्टँड जवळ, तालुका कोल्हापूर, जिल्हा कोल्हापूर - ४१६००१', 'कोल्हापूर', '9876543210', 'support@omdigitaleseva.com', 50.00, 30.00, 0, 'blue-gradient')
ON DUPLICATE KEY UPDATE `id` = 1;
