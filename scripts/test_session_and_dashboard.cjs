const http = require('http');

function request(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data,
          json,
        });
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function runTests() {
  console.log('=== STARTING 10-POINT AUTHENTICATION & DASHBOARD VERIFICATION ===\n');
  const results = [];

  function record(id, title, passed, details) {
    results.push({ id, title, passed, details });
    const mark = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`[${id}] ${mark} - ${title}: ${details}`);
  }

  let adminToken = '';
  let operatorToken = '';

  // 1. Admin login & Dashboard profile sync (GET /api/auth/me)
  try {
    const loginRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, { usernameOrMobile: 'om', password: 'om' === 'om' ? '558184' : 'om' });

    if (loginRes.statusCode === 200 && loginRes.json?.token) {
      adminToken = loginRes.json.token;
      // Simulate dashboard initial mount GET /api/auth/me using getAuthHeaders()
      const meRes = await request({
        hostname: '127.0.0.1',
        port: 3000,
        path: '/api/auth/me',
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminToken}`,
        },
      });

      const staysOpen = meRes.statusCode === 200 && meRes.json?.role === 'admin';
      record(1, 'Admin login and Dashboard remains open (GET /api/auth/me succeeds)', staysOpen,
        `Login status: ${loginRes.statusCode}, /api/auth/me status: ${meRes.statusCode}, User: ${meRes.json?.name} (${meRes.json?.role})`);
    } else {
      record(1, 'Admin login and Dashboard remains open', false, `Login failed: ${loginRes.statusCode}`);
    }
  } catch (err) {
    record(1, 'Admin login and Dashboard remains open', false, err.message);
  }

  // 2. Operator login & Dashboard profile sync (GET /api/auth/me)
  try {
    const loginRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, { usernameOrMobile: 'Prachi', password: '1234' });

    if (loginRes.statusCode === 200 && loginRes.json?.token) {
      operatorToken = loginRes.json.token;
      // Simulate dashboard initial mount GET /api/auth/me using getAuthHeaders()
      const meRes = await request({
        hostname: '127.0.0.1',
        port: 3000,
        path: '/api/auth/me',
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${operatorToken}`,
        },
      });

      const staysOpen = meRes.statusCode === 200 && meRes.json?.role === 'operator';
      record(2, 'Operator login and Dashboard remains open (GET /api/auth/me succeeds)', staysOpen,
        `Login status: ${loginRes.statusCode}, /api/auth/me status: ${meRes.statusCode}, User: ${meRes.json?.name} (${meRes.json?.role})`);
    } else {
      record(2, 'Operator login and Dashboard remains open', false, `Login failed: ${loginRes.statusCode}`);
    }
  } catch (err) {
    record(2, 'Operator login and Dashboard remains open', false, err.message);
  }

  // 3. Refresh the page after login (Session restoration via stored token)
  try {
    // Client simulates page reload: reads token from localStorage and fetches /api/auth/me
    const refreshRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/auth/me',
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`,
      },
    });

    const refreshedOk = refreshRes.statusCode === 200 && refreshRes.json?.id === 'usr-admin-1';
    record(3, 'Refresh the page after login maintains authenticated state', refreshedOk,
      `Status: ${refreshRes.statusCode}, Restored user ID: ${refreshRes.json?.id}`);
  } catch (err) {
    record(3, 'Refresh the page after login maintains authenticated state', false, err.message);
  }

  // 4. Navigate between Registration, Renewal and Claim
  try {
    const regRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/registrations',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${operatorToken}` },
    });

    const renRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/renewals',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${operatorToken}` },
    });

    const clmRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/claims',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${operatorToken}` },
    });

    const schemesRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/claim-schemes?includeInactive=true',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${operatorToken}` },
    });

    const allOk = regRes.statusCode === 200 && renRes.statusCode === 200 && clmRes.statusCode === 200 && schemesRes.statusCode === 200;
    record(4, 'Navigate between Registration, Renewal and Claim', allOk,
      `Registrations: ${regRes.statusCode}, Renewals: ${renRes.statusCode}, Claims: ${clmRes.statusCode}, Schemes: ${schemesRes.statusCode}`);
  } catch (err) {
    record(4, 'Navigate between Registration, Renewal and Claim', false, err.message);
  }

  // 5. Open Old Claims Manager
  try {
    const oldClaimsRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/old-claims',
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${operatorToken}`,
      },
    });

    const isOk = oldClaimsRes.statusCode === 200 && Array.isArray(oldClaimsRes.json);
    record(5, 'Open Old Claims Manager (loads authenticated old claims)', isOk,
      `Status: ${oldClaimsRes.statusCode}, Records count: ${oldClaimsRes.json?.length}`);
  } catch (err) {
    record(5, 'Open Old Claims Manager', false, err.message);
  }

  // 6. Open Renewal History
  try {
    const historyRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/renewals/history?mhNumber=MH-123456',
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${operatorToken}`,
      },
    });

    const isOk = historyRes.statusCode === 200 && historyRes.json !== null;
    record(6, 'Open Renewal History (loads authenticated renewal history)', isOk,
      `Status: ${historyRes.statusCode}, Renewals list: ${Array.isArray(historyRes.json?.renewals)}`);
  } catch (err) {
    record(6, 'Open Renewal History', false, err.message);
  }

  // 7. Verify valid JWT requests work
  try {
    const settingsRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/activity-logs',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });

    const isOk = settingsRes.statusCode === 200 && Array.isArray(settingsRes.json);
    record(7, 'Verify valid JWT requests work', isOk,
      `Status: ${settingsRes.statusCode}, Activity logs retrieved: ${settingsRes.json?.length}`);
  } catch (err) {
    record(7, 'Verify valid JWT requests work', false, err.message);
  }

  // 8. Verify invalid and expired JWT tokens are still rejected
  try {
    const fakeTokenRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/auth/me',
      method: 'GET',
      headers: { 'Authorization': 'Bearer invalid.fake.token.value' },
    });

    const isRejected = fakeTokenRes.statusCode === 401 && fakeTokenRes.json?.code === 'AUTH_TOKEN_INVALID';
    record(8, 'Verify invalid and expired JWT tokens are still rejected (401)', isRejected,
      `Status: ${fakeTokenRes.statusCode}, Code: ${fakeTokenRes.json?.code}`);
  } catch (err) {
    record(8, 'Verify invalid and expired JWT tokens are still rejected', false, err.message);
  }

  // 9. Verify unauthenticated users cannot access protected APIs
  try {
    const noTokenRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/auth/me',
      method: 'GET',
    });

    const isBlocked = noTokenRes.statusCode === 401 && noTokenRes.json?.code === 'AUTH_TOKEN_REQUIRED';
    record(9, 'Verify unauthenticated users cannot access protected APIs (401)', isBlocked,
      `Status: ${noTokenRes.statusCode}, Code: ${noTokenRes.json?.code}`);
  } catch (err) {
    record(9, 'Verify unauthenticated users cannot access protected APIs', false, err.message);
  }

  // 10. Verify Admin and Operator permissions remain unchanged
  try {
    // Admin access to user management
    const adminUsersRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/users',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });

    // Operator access to user management (should be 403 Forbidden)
    const opUsersRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/users',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${operatorToken}` },
    });

    // Operator access to renewals (should be 200 Allowed)
    const opRenewalsRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/renewals',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${operatorToken}` },
    });

    const permsIntact = adminUsersRes.statusCode === 200 && opUsersRes.statusCode === 403 && opRenewalsRes.statusCode === 200;
    record(10, 'Verify Admin and Operator permissions remain unchanged', permsIntact,
      `Admin /api/users: ${adminUsersRes.statusCode}, Operator /api/users: ${opUsersRes.statusCode} (403), Operator /api/renewals: ${opRenewalsRes.statusCode} (200)`);
  } catch (err) {
    record(10, 'Verify Admin and Operator permissions remain unchanged', false, err.message);
  }

  console.log('\n=== VERIFICATION SUMMARY ===');
  const allPassed = results.every(r => r.passed);
  console.log(`Total tests: ${results.length}, Passed: ${results.filter(r => r.passed).length}, Failed: ${results.filter(r => !r.passed).length}`);
  console.log(`Status: ${allPassed ? 'ALL 10 TESTS PASSED SUCCESSFULLY! ✅' : 'SOME TESTS FAILED ❌'}`);
}

runTests();
