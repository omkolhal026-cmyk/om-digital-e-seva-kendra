const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const outputPath = path.join(__dirname, '../public/Login_System_Technical_Report.pdf');

// Ensure public directory exists
const publicDir = path.join(__dirname, '../public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

const doc = new PDFDocument({
  size: 'A4',
  margins: { top: 45, bottom: 45, left: 45, right: 45 },
  bufferPages: true,
});

const writeStream = fs.createWriteStream(outputPath);
doc.pipe(writeStream);

// Styling helpers
const primaryColor = '#1e3a8a'; // Deep blue
const secondaryColor = '#0f766e'; // Teal
const darkTextColor = '#1e293b'; // Slate 800
const mutedTextColor = '#64748b'; // Slate 500
const redColor = '#be123c'; // Rose 700
const bgBoxColor = '#f8fafc'; // Slate 50
const borderColor = '#cbd5e1'; // Slate 300

function addHeader(title, subtitle) {
  doc.rect(45, 40, 505, 55).fill('#0f172a');
  doc.fillColor('#ffffff').fontSize(16).font('Helvetica-Bold').text(title, 55, 50);
  doc.fillColor('#94a3b8').fontSize(10).font('Helvetica').text(subtitle, 55, 72);
  doc.y = 110;
}

function addSectionTitle(title) {
  if (doc.y > 700) doc.addPage();
  doc.moveDown(0.8);
  doc.fillColor(primaryColor).fontSize(13).font('Helvetica-Bold').text(title);
  doc.strokeColor(primaryColor).lineWidth(1.2).moveTo(45, doc.y + 2).lineTo(550, doc.y + 2).stroke();
  doc.moveDown(0.6);
}

function addSubSectionTitle(title) {
  if (doc.y > 720) doc.addPage();
  doc.moveDown(0.4);
  doc.fillColor(secondaryColor).fontSize(10.5).font('Helvetica-Bold').text(title);
  doc.moveDown(0.3);
}

function addParagraph(text) {
  if (doc.y > 730) doc.addPage();
  doc.fillColor(darkTextColor).fontSize(9).font('Helvetica').lineGap(2.5).text(text);
  doc.moveDown(0.3);
}

function addBullet(label, text) {
  if (doc.y > 730) doc.addPage();
  doc.fillColor(darkTextColor).fontSize(9).font('Helvetica-Bold').text(`• ${label}: `, { continued: true });
  doc.font('Helvetica').text(text);
  doc.moveDown(0.2);
}

function addCodeBlock(code) {
  const lines = code.trim().split('\n');
  const height = Math.min(lines.length * 11 + 12, 280);
  if (doc.y + height > 750) doc.addPage();

  const startY = doc.y;
  doc.rect(45, startY, 505, height).fillAndStroke('#f1f5f9', '#cbd5e1');
  doc.fillColor('#0f172a').fontSize(7.5).font('Courier').lineGap(1.5);
  doc.text(code.trim(), 52, startY + 6, { width: 490 });
  doc.y = startY + height + 8;
}

function addCalloutBox(title, text, type = 'info') {
  if (doc.y > 700) doc.addPage();
  const startY = doc.y;
  const isDanger = type === 'danger';
  const boxBg = isDanger ? '#fff1f2' : '#f0fdf4';
  const boxBorder = isDanger ? '#fda4af' : '#86efac';
  const textCol = isDanger ? '#9f1239' : '#166534';

  doc.rect(45, startY, 505, 45).fillAndStroke(boxBg, boxBorder);
  doc.fillColor(textCol).fontSize(9).font('Helvetica-Bold').text(title, 55, startY + 7);
  doc.fillColor(darkTextColor).fontSize(8.5).font('Helvetica').text(text, 55, startY + 22, { width: 485 });
  doc.y = startY + 52;
}

// ==========================================
// PAGE 1: TITLE & EXECUTIVE SUMMARY
// ==========================================
addHeader('OM DIGITAL E-SEVA KENDRA', 'Authentication & Login System Technical Audit Report | Date: 2026-10-29');

addCalloutBox(
  'CONFIDENTIAL & SENSITIVE — INTERNAL AUDIT ONLY',
  'This document details the complete technical architecture, endpoints, database schemas, and confirmed bugs in the OM Digital E-Seva Kendra login system. Passwords, hashes, and API keys are redacted for security.',
  'info'
);

addSectionTitle('1. Executive Summary & Architecture Overview');
addParagraph(
  'The OM Digital E-Seva Kendra software uses a decoupled client-server architecture. Authentication is managed via a Node.js/Express backend connected to a TiDB Cloud MySQL database, issuing 7-day HMAC-SHA256 JWT tokens. The client is a React Single Page Application (SPA) with role-based routing (Admin, Operator, Sub-Agent) and granular feature permissions.'
);

addBullet('Database Engine', 'TiDB Cloud (MySQL v8.0 compatible, AWS Asia-Southeast1 cluster)');
addBullet('Frontend Framework', 'React 19 + TypeScript + Tailwind CSS');
addBullet('Backend Runtime', 'Express 4.21 on Node.js with tsx compiler');
addBullet('Session Strategy', 'Dual Token Architecture: JWT Bearer Tokens (7-day validity) + Fallback User Identity Headers');
addBullet('Password Hashing', 'Bcrypt with 10 salt rounds (with automatic legacy hash upgrade on login)');

addSectionTitle('2. Frontend Login Flow & Implementation');
addSubSectionTitle('2.1 Primary Login Component (/src/components/LoginPage.tsx)');
addParagraph(
  'The login form captures either a Username or Mobile Number along with the Password. On submission, it executes a POST request to /api/auth/login. On success, it persists the JWT token and notifies the root App component.'
);

addCodeBlock(`// Login Submission in LoginPage.tsx
const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  const inputVal = usernameOrMobile.trim();
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernameOrMobile: inputVal, password: password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Invalid credentials');
  if (data.token) localStorage.setItem('om_eseva_token', data.token);
  localStorage.setItem('mbocw_last_login_time', new Date().toISOString());
  onLoginSuccess(data.user, true);
};`);

addSubSectionTitle('2.2 State Management & Route Protection (/src/App.tsx)');
addParagraph(
  'The root component initializes currentUser from storage (sessionStorage or localStorage). When currentUser is null, it unconditionally returns <LoginPage />. Once logged in, it mounts <Navbar />, <Sidebar />, and the active dashboard tab matching the user role.'
);

// ==========================================
// PAGE 2: BACKEND AUTHENTICATION
// ==========================================
doc.addPage();
addSectionTitle('3. Backend Authentication & API Layer');

addSubSectionTitle('3.1 Global Authentication Middleware (/server.ts - jwtAuthMiddleware)');
addParagraph(
  'All routes under /api are intercepted by jwtAuthMiddleware. It enforces token validation, whitelists public routes (/api/auth/login, /api/health, etc.), and validates user activity status in MySQL.'
);

addCodeBlock(`// JWT & Session Guard in server.ts
async function jwtAuthMiddleware(req, res, next) {
  const fullPath = (req.originalUrl || req.path || '').split('?')[0];
  if (isPublicRoute(fullPath)) return next();

  let token = '';
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7).trim();
  }

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.user = decoded;
      return next();
    } catch (err) {
      return res.status(401).json({ error: 'Session expired. Please login again.', code: 'AUTH_TOKEN_INVALID' });
    }
  }

  // Fallback: Verify x-user-id / x-user-username headers against MySQL database
  const userIdHeader = req.headers['x-user-id'];
  const allUsers = await getMySQLUsers();
  const existing = allUsers.find(u => String(u.id) === String(userIdHeader));
  if (!existing || existing.status === 'disabled') {
    return res.status(401).json({ error: 'Unauthorized: Invalid user session', code: 'AUTH_TOKEN_REQUIRED' });
  }
  req.user = existing;
  return next();
}`);

addSubSectionTitle('3.2 Login Endpoint (/server.ts - POST /api/auth/login)');
addParagraph(
  'Receives { usernameOrMobile, password }. Invokes authenticateMySQLUser(). Verifies user status is not disabled, logs the LOGIN event to user_activity_logs, signs a 7-day JWT token, and returns user payload.'
);

addSubSectionTitle('3.3 Role Authorization Guard (requireAdmin)');
addParagraph(
  'Guards administrative endpoints (/api/users, /api/settings, /api/activity-logs). Checks if req.user.role.toUpperCase() === "ADMIN" or username matches system admins (om, admin).'
);

// ==========================================
// PAGE 3: DATABASE SCHEMA & QUERY LOGIC
// ==========================================
doc.addPage();
addSectionTitle('4. Database Schema & Query Logic');

addSubSectionTitle('4.1 Users Table Definition (TiDB Cloud MySQL)');
addParagraph(
  'The users table stores core credentials and granular permission toggles for operators and agents.'
);

addCodeBlock(`CREATE TABLE IF NOT EXISTS \`users\` (
  \`id\` VARCHAR(64) NOT NULL PRIMARY KEY,
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
  \`last_login\` DATETIME DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;`);

addSubSectionTitle('4.2 Query & Password Verification (/src/db/mysql.ts)');
addParagraph(
  'authenticateMySQLUser queries by username (case-insensitive) or exact mobile. It checks bcrypt.compare(password, storedPassword). If legacy unhashed plain password matches, it transparently hashes it with bcrypt and updates the database.'
);

addCodeBlock(`// Query execution in mysql.ts
const [rows] = await p.query(
  \`SELECT * FROM users WHERE LOWER(username) = ? OR mobile = ?\`,
  [searchStr, cleanMobile]
);
for (const dbUser of rows) {
  let isMatch = false;
  if (dbUser.password.startsWith('$2a$') || dbUser.password.startsWith('$2b$')) {
    isMatch = await bcrypt.compare(pass, dbUser.password);
  } else {
    isMatch = (pass === dbUser.password);
    if (isMatch) {
      const newHash = await bcrypt.hash(pass, 10);
      await p.query('UPDATE users SET password = ? WHERE id = ?', [newHash, dbUser.id]);
    }
  }
  if (isMatch) return mapDbUser(dbUser);
}`);

// ==========================================
// PAGE 4: CONFIRMED BUGS & RECOMMENDED FIXES
// ==========================================
doc.addPage();
addSectionTitle('5. Confirmed Bugs & Security Vulnerabilities');

addCalloutBox(
  'CRITICAL BUG 1: Session Verification Omits Authorization Header',
  'In src/App.tsx line 280, the mount verification call to /api/auth/me only sends x-user-id and x-user-username, but omits Authorization: Bearer <token>. Because /api/auth/me is not in the jwtAuthMiddleware public whitelist, any delay or lookup failure causes HTTP 401, triggering handleLogout() and logging users out randomly on page refresh.',
  'danger'
);

addCalloutBox(
  'CRITICAL BUG 2: Role and Status Casing Discrepancies',
  'MySQL schema sets role DEFAULT "OPERATOR" and status DEFAULT "ACTIVE" (uppercase). In React (App.tsx), code strictly checks currentUser.role === "admin" and status === "active" (lowercase). Any uppercase record silently breaks admin menus and falsely evaluates as disabled.',
  'danger'
);

addCalloutBox(
  'BUG 3: Strict Mobile Format Matching Fails on Standard Inputs',
  'In mysql.ts line 1666, cleanMobile is compared directly against the database string without normalizing spaces, country code (+91), or leading zeros. Users typing standard formatted numbers (+91 XXXXX XXXXX) fail login despite correct passwords.',
  'danger'
);

addCalloutBox(
  'BUG 4: Token Storage Desynchronization',
  'LoginPage.tsx unconditionally writes the JWT token to localStorage, while App.tsx writes user profile to sessionStorage if Remember Me is not selected. Closing the browser clears the user session but leaves a stale JWT token in localStorage.',
  'danger'
);

addSectionTitle('6. Actionable Fixes & Recommendations');

addBullet(
  'Fix Session Sync Header in App.tsx',
  'Change fetch("/api/auth/me", { headers: ... }) to use headers: getAuthHeaders(), ensuring Bearer JWT token is always supplied.'
);
addBullet(
  'Normalize Roles & Status to Lowercase',
  'In mysql.ts (authenticateMySQLUser & getMySQLUsers), ensure role.toLowerCase() and status.toLowerCase() are always returned so frontend role checks never fail.'
);
addBullet(
  'Normalize Mobile Numbers on Query',
  'Clean input mobile with cleanMobile.replace(/\\D/g, "").slice(-10) to match 10-digit Indian numbers regardless of prefix.'
);
addBullet(
  'Synchronize Token Storage',
  'Write token to sessionStorage when Remember Me is false, and to localStorage when true, matching user session lifecycle.'
);
addBullet(
  'Implement Refresh Token Endpoint',
  'Add a token refresh mechanism so active users are not logged out abruptly after 7 days.'
);

doc.moveDown(1.5);
doc.strokeColor(borderColor).lineWidth(1).moveTo(45, doc.y).lineTo(550, doc.y).stroke();
doc.moveDown(0.5);
doc.fillColor(mutedTextColor).fontSize(8).font('Helvetica').text(
  'Generated by OM Digital E-Seva Kendra Security Audit Engine | Document Hash: SEC-AUTH-2026-AUDIT | Page [1-4]',
  { align: 'center' }
);

doc.end();

writeStream.on('finish', () => {
  console.log('PDF successfully generated at: ' + outputPath);
});
