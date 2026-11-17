const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FAIL: JWT_SECRET not found in environment.');
  process.exit(1);
}

const BASE_URL = 'http://localhost:3000';

async function runTests() {
  console.log('====================================================');
  console.log('CRITICAL SECURITY VERIFICATION SUITE');
  console.log('Testing Admin Authentication Bypass & JWT Secret Fixes');
  console.log('====================================================\n');

  let passedCount = 0;
  let totalTests = 9;

  // 1. Login with Operator Credentials (Prachi / 1234)
  console.log('--- TEST 1: Login with valid Operator credentials ---');
  const opLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernameOrMobile: 'Prachi', password: '1234' }),
  });
  const opLoginData = await opLoginRes.json();
  if (opLoginRes.status === 200 && opLoginData.token && opLoginData.user?.role === 'operator') {
    console.log('✅ PASS: Operator login successful. Received valid JWT and role: operator.');
    passedCount++;
  } else {
    console.error('❌ FAIL: Operator login failed:', opLoginRes.status, opLoginData);
  }
  const operatorToken = opLoginData.token;

  // 2. Generate valid Admin JWT token using JWT_SECRET
  console.log('\n--- TEST 2: Verify valid Admin token authenticity ---');
  const adminToken = jwt.sign(
    { id: 'usr-admin-1', username: 'om', role: 'admin', name: 'Om (Admin)' },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  const adminMeRes = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const adminMeData = await adminMeRes.json();
  if (adminMeRes.status === 200 && adminMeData.role === 'admin' && adminMeData.username === 'om') {
    console.log('✅ PASS: Valid Admin JWT verified against MySQL database. Role: admin.');
    passedCount++;
  } else {
    console.error('❌ FAIL: Admin session verification failed:', adminMeRes.status, adminMeData);
  }

  // 3. Access protected APIs without a JWT
  console.log('\n--- TEST 3: Access protected APIs without a JWT ---');
  const noTokenRes = await fetch(`${BASE_URL}/api/registrations`);
  const noTokenData = await noTokenRes.json();
  if (noTokenRes.status === 401 && noTokenData.code === 'AUTH_TOKEN_REQUIRED') {
    console.log('✅ PASS: Unauthenticated request correctly rejected with HTTP 401 (AUTH_TOKEN_REQUIRED).');
    passedCount++;
  } else {
    console.error('❌ FAIL: Unauthenticated request was NOT blocked with 401:', noTokenRes.status, noTokenData);
  }

  // 4. Access protected APIs using an invalid JWT (tampered signature)
  console.log('\n--- TEST 4: Access protected APIs using an invalid/tampered JWT ---');
  const invalidToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6InVzci1hZG1pbi0xIiwicm9sZSI6ImFkbWluIn0.FAKE_SIGNATURE_TAMPERED_12345';
  const invalidRes = await fetch(`${BASE_URL}/api/registrations`, {
    headers: { Authorization: `Bearer ${invalidToken}` },
  });
  const invalidData = await invalidRes.json();
  if (invalidRes.status === 401 && invalidData.code === 'AUTH_TOKEN_INVALID') {
    console.log('✅ PASS: Tampered/invalid JWT correctly rejected with HTTP 401 (AUTH_TOKEN_INVALID).');
    passedCount++;
  } else {
    console.error('❌ FAIL: Invalid JWT was NOT blocked with 401:', invalidRes.status, invalidData);
  }

  // 5. Access protected APIs using an expired JWT
  console.log('\n--- TEST 5: Access protected APIs using an expired JWT ---');
  const expiredToken = jwt.sign(
    { id: 'usr-admin-1', username: 'om', role: 'admin' },
    JWT_SECRET,
    { expiresIn: '-10s' } // Expired 10 seconds ago
  );
  const expiredRes = await fetch(`${BASE_URL}/api/registrations`, {
    headers: { Authorization: `Bearer ${expiredToken}` },
  });
  const expiredData = await expiredRes.json();
  if (expiredRes.status === 401 && expiredData.code === 'AUTH_TOKEN_INVALID') {
    console.log('✅ PASS: Expired JWT correctly rejected with HTTP 401 (AUTH_TOKEN_INVALID).');
    passedCount++;
  } else {
    console.error('❌ FAIL: Expired JWT was NOT blocked with 401:', expiredRes.status, expiredData);
  }

  // 6. Try sending x-user-username: admin without a valid JWT
  console.log('\n--- TEST 6: Try sending x-user-username: admin without a valid JWT ---');
  const spoofHeaderRes = await fetch(`${BASE_URL}/api/users`, {
    headers: {
      'x-user-username': 'admin',
      'Content-Type': 'application/json',
    },
  });
  const spoofHeaderData = await spoofHeaderRes.json();
  if (spoofHeaderRes.status === 401) {
    console.log('✅ PASS: Header spoofing "x-user-username: admin" blocked with HTTP 401. Privilege escalation eliminated.');
    passedCount++;
  } else {
    console.error('❌ FAIL: Header spoofing was NOT blocked! Status:', spoofHeaderRes.status, spoofHeaderData);
  }

  // 7. Try sending x-user-id with an Admin ID without a valid JWT
  console.log('\n--- TEST 7: Try sending x-user-id: usr-admin-1 without a valid JWT ---');
  const spoofIdRes = await fetch(`${BASE_URL}/api/users`, {
    headers: {
      'x-user-id': 'usr-admin-1',
      'Content-Type': 'application/json',
    },
  });
  const spoofIdData = await spoofIdRes.json();
  if (spoofIdRes.status === 401) {
    console.log('✅ PASS: Header spoofing "x-user-id: usr-admin-1" blocked with HTTP 401.');
    passedCount++;
  } else {
    console.error('❌ FAIL: ID header spoofing was NOT blocked! Status:', spoofIdRes.status, spoofIdData);
  }

  // 8. Verify that an Operator CANNOT access Admin-only APIs
  console.log('\n--- TEST 8: Verify that an Operator cannot access Admin-only APIs ---');
  const opAdminReqRes = await fetch(`${BASE_URL}/api/users`, {
    headers: { Authorization: `Bearer ${operatorToken}` },
  });
  const opAdminReqData = await opAdminReqRes.json();
  if (opAdminReqRes.status === 403) {
    console.log('✅ PASS: Operator access to Admin-only API (/api/users) correctly blocked with HTTP 403 Forbidden.');
    passedCount++;
  } else {
    console.error('❌ FAIL: Operator was NOT blocked with 403 from admin API! Status:', opAdminReqRes.status, opAdminReqData);
  }

  // 9. Verify that normal Registration, Renewal and Claim workflows still work
  console.log('\n--- TEST 9: Verify normal Operator workflows still work (Registration / Renewal / Claim) ---');
  const regRes = await fetch(`${BASE_URL}/api/registrations?limit=5`, {
    headers: { Authorization: `Bearer ${operatorToken}` },
  });
  const renRes = await fetch(`${BASE_URL}/api/renewals?limit=5`, {
    headers: { Authorization: `Bearer ${operatorToken}` },
  });
  const clmRes = await fetch(`${BASE_URL}/api/claims?limit=5`, {
    headers: { Authorization: `Bearer ${operatorToken}` },
  });

  const regOk = regRes.status === 200;
  const renOk = renRes.status === 200;
  const clmOk = clmRes.status === 200;

  if (regOk && renOk && clmOk) {
    console.log('✅ PASS: Operator can access permitted workflows (Registrations: 200, Renewals: 200, Claims: 200).');
    passedCount++;
  } else {
    console.error('❌ FAIL: Workflows broken for authorized operator:', { reg: regRes.status, ren: renRes.status, clm: clmRes.status });
  }

  console.log('\n====================================================');
  console.log(`TEST RESULTS: ${passedCount} / ${totalTests} TESTS PASSED`);
  console.log('====================================================');

  if (passedCount === totalTests) {
    console.log('ALL SECURITY VERIFICATIONS COMPLETED SUCCESSFULLY!');
    process.exit(0);
  } else {
    console.error(`FAILED: ${totalTests - passedCount} test(s) failed.`);
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
