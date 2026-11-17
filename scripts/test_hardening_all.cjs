const http = require('http');

function request(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {}
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
  console.log('=== STARTING 15-POINT SECURITY HARDENING VERIFICATION ===\n');
  const results = [];

  // Helper to record
  function record(id, title, passed, details) {
    results.push({ id, title, passed, details });
    const mark = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`[${id}] ${mark} - ${title}: ${details}`);
  }

  // 15. Check Login for Admin and Operator
  let adminToken = '';
  let operatorToken = '';

  try {
    const adminLoginRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, { usernameOrMobile: 'om', password: '558184' });

    if (adminLoginRes.statusCode === 200 && adminLoginRes.json?.token) {
      adminToken = adminLoginRes.json.token;
    }

    const opLoginRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, { usernameOrMobile: 'Prachi', password: '1234' });

    if (opLoginRes.statusCode === 200 && opLoginRes.json?.token) {
      operatorToken = opLoginRes.json.token;
    }

    record(15, 'Existing Admin and Operator login continues to work',
      Boolean(adminToken && operatorToken),
      `Admin logged in: ${Boolean(adminToken)}, Operator logged in: ${Boolean(operatorToken)}`
    );
  } catch (err) {
    record(15, 'Existing Admin and Operator login continues to work', false, err.message);
  }

  // 1. Public user cannot download Audit PDF (401)
  try {
    const res = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/audit-report-pdf',
      method: 'GET',
    });
    record(1, 'Public user cannot download Audit PDF (401)', res.statusCode === 401, `Status: ${res.statusCode}`);
  } catch (err) {
    record(1, 'Public user cannot download Audit PDF (401)', false, err.message);
  }

  // 2. Admin can download Audit PDF (200)
  try {
    const res = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/audit-report-pdf',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });
    const isPdf = res.headers['content-type']?.includes('application/pdf');
    record(2, 'Admin can download Audit PDF (200)', res.statusCode === 200 && isPdf, `Status: ${res.statusCode}, Content-Type: ${res.headers['content-type']}`);
  } catch (err) {
    record(2, 'Admin can download Audit PDF (200)', false, err.message);
  }

  // 3. Operator cannot download Audit PDF (403)
  try {
    const res = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/audit-report-pdf',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${operatorToken}` },
    });
    record(3, 'Operator cannot download Audit PDF (403)', res.statusCode === 403, `Status: ${res.statusCode}`);
  } catch (err) {
    record(3, 'Operator cannot download Audit PDF (403)', false, err.message);
  }

  // 4. Public user cannot access Login Technical PDF (401)
  try {
    const res = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/login-report-pdf',
      method: 'GET',
    });
    record(4, 'Public user cannot access Login Technical PDF (401)', res.statusCode === 401, `Status: ${res.statusCode}`);
  } catch (err) {
    record(4, 'Public user cannot access Login Technical PDF (401)', false, err.message);
  }

  // 5. Admin can access Login Technical PDF (200)
  try {
    const res = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/login-report-pdf',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });
    const isPdf = res.headers['content-type']?.includes('application/pdf');
    record(5, 'Admin can access Login Technical PDF (200)', res.statusCode === 200 && isPdf, `Status: ${res.statusCode}, Content-Type: ${res.headers['content-type']}`);
  } catch (err) {
    record(5, 'Admin can access Login Technical PDF (200)', false, err.message);
  }

  // 6. Public health endpoint does not reveal database infrastructure
  try {
    const res = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/health',
      method: 'GET',
    });
    const j = res.json || {};
    const hasHost = Boolean(j.host || j.mysql?.host || JSON.stringify(j).includes('aws.tidbcloud.com'));
    const hasUser = Boolean(j.user || j.mysql?.user || JSON.stringify(j).includes('46iKNrh8ZXkYknm'));
    const hasPort = Boolean(j.port || j.mysql?.port || JSON.stringify(j).includes('4000'));
    const isSafe = res.statusCode === 200 && j.status === 'ok' && j.database?.connected === true && !hasHost && !hasUser && !hasPort;
    record(6, 'Public health endpoint does not reveal database infrastructure', isSafe, `Body: ${JSON.stringify(j)}`);
  } catch (err) {
    record(6, 'Public health endpoint does not reveal database infrastructure', false, err.message);
  }

  // 7. Public user cannot access MySQL status (401)
  try {
    const res = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/mysql/status',
      method: 'GET',
    });
    record(7, 'Public user cannot access MySQL status (401)', res.statusCode === 401, `Status: ${res.statusCode}`);
  } catch (err) {
    record(7, 'Public user cannot access MySQL status (401)', false, err.message);
  }

  // 8. Admin can access MySQL status (200)
  try {
    const res = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/mysql/status',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });
    record(8, 'Admin can access MySQL status (200)', res.statusCode === 200 && res.json?.connected === true, `Status: ${res.statusCode}, Connected: ${res.json?.connected}`);
  } catch (err) {
    record(8, 'Admin can access MySQL status (200)', false, err.message);
  }

  // 9. Public user cannot access From Sources (401)
  try {
    const res = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/from-sources',
      method: 'GET',
    });
    record(9, 'Public user cannot access From Sources (401)', res.statusCode === 401, `Status: ${res.statusCode}`);
  } catch (err) {
    record(9, 'Public user cannot access From Sources (401)', false, err.message);
  }

  // 10. Admin and Operator can access From Sources after login (200)
  try {
    const adminSources = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/from-sources',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${adminToken}` },
    });
    const opSources = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/from-sources',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${operatorToken}` },
    });
    const bothOk = adminSources.statusCode === 200 && opSources.statusCode === 200 && Array.isArray(adminSources.json) && Array.isArray(opSources.json);
    record(10, 'Admin and Operator can access From Sources after login (200)', bothOk, `Admin status: ${adminSources.statusCode}, Op status: ${opSources.statusCode}`);
  } catch (err) {
    record(10, 'Admin and Operator can access From Sources after login (200)', false, err.message);
  }

  // 11. Worker requests without valid worker token receive 401
  try {
    const noTokenRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/iwbms/worker/heartbeat',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }, { workerName: 'test' });

    const badTokenRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/iwbms/worker/heartbeat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer wrong_token_value_xyz',
      },
    }, { workerName: 'test' });

    // Also check the old fallback token is now rejected
    const oldFallbackRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/iwbms/worker/heartbeat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer iwbms_om_secret_token_2024',
      },
    }, { workerName: 'test' });

    const blocked = noTokenRes.statusCode === 401 && badTokenRes.statusCode === 401 && oldFallbackRes.statusCode === 401;
    record(11, 'Worker requests without valid worker token receive 401', blocked, `NoToken: ${noTokenRes.statusCode}, BadToken: ${badTokenRes.statusCode}, OldFallback: ${oldFallbackRes.statusCode}`);
  } catch (err) {
    record(11, 'Worker requests without valid worker token receive 401', false, err.message);
  }

  // 12. Valid worker token works (200)
  const validWorkerToken = process.env.IWBMS_WORKER_TOKEN || 'iwbms_prod_worker_token_secure_98x72a41';
  try {
    const validWorkerRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/iwbms/worker/heartbeat',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${validWorkerToken}`,
      },
    }, { workerName: 'LocalPythonWorker', workerVersion: '1.2.0', status: 'Idle' });

    record(12, 'Valid worker token works (200)', validWorkerRes.statusCode === 200 && validWorkerRes.json?.success === true, `Status: ${validWorkerRes.statusCode}, Body: ${JSON.stringify(validWorkerRes.json)}`);
  } catch (err) {
    record(12, 'Valid worker token works (200)', false, err.message);
  }

  // 13. Existing IWBMS automation routes continue to work
  try {
    const nextJobRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/iwbms/jobs/next',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${validWorkerToken}`,
      },
    }, { workerName: 'LocalPythonWorker' });

    const isOk = nextJobRes.statusCode === 200 && typeof nextJobRes.json?.success === 'boolean';
    record(13, 'Existing IWBMS automation routes continue to work', isOk, `Status: ${nextJobRes.statusCode}, HasJob: ${Boolean(nextJobRes.json?.job)}`);
  } catch (err) {
    record(13, 'Existing IWBMS automation routes continue to work', false, err.message);
  }

  // 14. Public Settings GET continues to work (200, sanitized)
  try {
    const settingsRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/api/settings',
      method: 'GET',
    });

    const s = settingsRes.json || {};
    const allowedKeys = new Set([
      'officeName', 'officeAddress', 'districtName', 'contactNumbers', 'email',
      'registrationFee', 'renewalFee', 'themeMode', 'officeLogo'
    ]);
    const returnedKeys = Object.keys(s);
    const hasOnlyAllowed = returnedKeys.every(k => allowedKeys.has(k));
    const hasRequired = Boolean(s.officeName && s.registrationFee !== undefined);

    record(14, 'Public Settings GET continues to work (200, sanitized)',
      settingsRes.statusCode === 200 && hasOnlyAllowed && hasRequired,
      `Status: ${settingsRes.statusCode}, Fields: ${returnedKeys.join(', ')}`
    );
  } catch (err) {
    record(14, 'Public Settings GET continues to work (200, sanitized)', false, err.message);
  }

  // 16. Static file redirect guards
  try {
    const staticAuditRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/Complete_Software_Technical_Audit_Report.pdf',
      method: 'GET',
    });
    const staticLoginRes = await request({
      hostname: '127.0.0.1',
      port: 3000,
      path: '/Login_System_Technical_Report.pdf',
      method: 'GET',
    });
    const isRedirect = (staticAuditRes.statusCode === 302 || staticAuditRes.statusCode === 301) &&
                       (staticLoginRes.statusCode === 302 || staticLoginRes.statusCode === 301);
    record(16, 'Direct static PDF URLs redirected to authenticated endpoints', isRedirect,
      `Audit redirect: ${staticAuditRes.statusCode} -> ${staticAuditRes.headers.location}, Login redirect: ${staticLoginRes.statusCode} -> ${staticLoginRes.headers.location}`);
  } catch (err) {
    record(16, 'Direct static PDF URLs redirected to authenticated endpoints', false, err.message);
  }

  console.log('\n=== VERIFICATION SUMMARY ===');
  const allPassed = results.every(r => r.passed);
  console.log(`Total tests: ${results.length}, Passed: ${results.filter(r => r.passed).length}, Failed: ${results.filter(r => !r.passed).length}`);
  console.log(`Status: ${allPassed ? 'ALL TESTS PASSED SUCCESSFULLY! ✅' : 'SOME TESTS FAILED ❌'}`);
}

runTests();
