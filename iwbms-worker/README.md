# OM Digital E-Seva Kendra - Local IWBMS Python Worker

This standalone Python worker runs on your local Windows PC. It communicates securely with your online OM Digital application via HTTPS API, performs real-time MH Number verifications on the official Mahabocw IWBMS portal (`https://iwbms.mahabocw.in/search-record`) using Microsoft Edge + Selenium, and updates the central database automatically.

---

## 1. System Requirements

- **Operating System**: Windows 10 or Windows 11
- **Browser**: Microsoft Edge (pre-installed on Windows)
- **Python**: Python 3.8 or higher ([Download Python](https://www.python.org/downloads/))
  - *Make sure to check "Add Python to PATH" during installation.*

---

## 2. Quick Setup & Installation

### Step 1: Open Terminal / Command Prompt
Open Command Prompt (`cmd`) or PowerShell in this folder:
```bash
cd iwbms-worker
```

### Step 2: Install Required Packages
Run:
```bash
pip install -r requirements.txt
```
*(Packages: `selenium`, `requests`, `python-dotenv`)*

### Step 3: Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
copy .env.example .env
```
Open `.env` in Notepad or any text editor and fill in your details:

```env
# URL of your online OM Digital software (Render / Custom Domain)
OM_DIGITAL_API_URL=https://your-app-name.onrender.com

# Dedicated Worker Secret Token (Must match IWBMS_WORKER_TOKEN on the server)
IWBMS_WORKER_TOKEN=your_secure_worker_token_here

# Worker Identity
WORKER_NAME=OM-DIGITAL-PC-EDGE-01
WORKER_VERSION=1.0.0

# Delays & Timeouts (Seconds)
CHECK_DELAY_SECONDS=2
POLL_INTERVAL_SECONDS=3
PAGE_TIMEOUT_SECONDS=20
HEARTBEAT_INTERVAL_SECONDS=20
```

---

## 3. Testing the Connection (Diagnostic Mode)

Before launching the browser, verify that your API URL and Token are working:

```bash
python iwbms_worker.py --test-api
```

### Expected Output:
```text
=================================================================
   OM DIGITAL IWBMS WORKER - API DIAGNOSTIC TEST
=================================================================
API Target URL : https://your-app-name.onrender.com
Worker Token   : iwb...024
Worker Name    : OM-DIGITAL-PC-EDGE-01 (v1.0.0)
=================================================================

[1/3] Testing Worker Heartbeat (POST /api/iwbms/worker/heartbeat)...
      [PASS] Heartbeat accepted successfully by OM Digital server.

[2/3] Testing Queue Retrieval (POST /api/iwbms/jobs/next)...
      [PASS] Queue accessible! (0 pending jobs).

[3/3] Testing Health & Server Reachability...
      [PASS] Server health check response: 200 OK

=================================================================
   [SUCCESS] ALL API DIAGNOSTIC CHECKS PASSED!
=================================================================
```

---

## 4. Running the Live Worker

To start automated queue processing:

```bash
python iwbms_worker.py
```

### What happens when the worker runs:
1. Microsoft Edge browser opens automatically.
2. The bot navigates to `https://iwbms.mahabocw.in/search-record`.
3. It polls the server queue for pending MH numbers.
4. When a staff member queues an MH number in the web software, the bot:
   - Types the MH number into the IWBMS search box.
   - Clicks the search button.
   - Extracts and verifies subscription status (**Active**, **Inactive**, **Not Found**, or **Check**).
   - Reports the verified status back to your online database via API.
5. It pauses for `CHECK_DELAY_SECONDS` (2s default) and fetches the next job.

---

## 5. Stopping the Worker Safely

Press `Ctrl + C` in the Command Prompt window:
- The worker will complete its current action safely.
- It will send an `Offline` status heartbeat to the server.
- The Microsoft Edge browser will close automatically.

---

## 6. Troubleshooting & Common Errors

| Error | Cause | Solution |
| :--- | :--- | :--- |
| **`Unauthorized (401)`** | `IWBMS_WORKER_TOKEN` in `.env` does not match the server's environment variable. | Check and correct the token in your `.env` file. |
| **`Connection Refused / Failed to connect`** | Server URL is incorrect or server is sleeping. | Verify `OM_DIGITAL_API_URL` in `.env` is accessible in your browser. |
| **`Selenium / WebDriver Error`** | Microsoft Edge browser is out of date. | Update Microsoft Edge via `edge://settings/help`. Selenium 4+ manages drivers automatically. |
| **`Captcha / Human Verification on Portal`** | Government portal triggered temporary verification. | The worker will safely mark the job as `Check` and continue with the next job. |
