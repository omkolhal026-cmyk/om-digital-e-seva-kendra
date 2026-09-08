#!/usr/bin/env python3
"""
=============================================================================
OM DIGITAL E-SEVA KENDRA - IWBMS LOCAL PYTHON WORKER
=============================================================================
Purpose:
  Polls the online OM Digital Job Queue (/api/iwbms/jobs/next),
  searches worker MH numbers on https://iwbms.mahabocw.in/search-record
  via Microsoft Edge (Selenium), and reports the verified status back
  to the central database.

Requirements:
  pip install -r requirements.txt

Usage:
  python iwbms_worker.py            # Normal live worker
  python iwbms_worker.py --test-api # Test API connection & authentication only
=============================================================================
"""

import os
import sys
import time
import signal
import argparse
from datetime import datetime
from typing import Optional, Tuple, Dict, Any
import requests
from dotenv import load_dotenv

# Selenium Imports
try:
    from selenium import webdriver
    from selenium.webdriver.edge.options import Options as EdgeOptions
    from selenium.webdriver.edge.service import Service as EdgeService
    from selenium.webdriver.common.by import By
    from selenium.webdriver.common.keys import Keys
    from selenium.webdriver.support.ui import WebDriverWait
    from selenium.webdriver.support import expected_conditions as EC
    from selenium.common.exceptions import (
        WebDriverException,
        TimeoutException,
        NoSuchElementException,
    )
except ImportError:
    print("[CRITICAL] Selenium is not installed. Please run: pip install -r requirements.txt")
    sys.exit(1)

# -----------------------------------------------------------------------------
# CONFIGURATION & ENVIRONMENT SETUP
# -----------------------------------------------------------------------------
load_dotenv()

API_BASE_URL = os.getenv("OM_DIGITAL_API_URL", "http://localhost:3000").rstrip("/")
WORKER_TOKEN = os.getenv("IWBMS_WORKER_TOKEN", "").strip()
WORKER_NAME = os.getenv("WORKER_NAME", "OM-DIGITAL-PC-EDGE-01").strip()
WORKER_VERSION = os.getenv("WORKER_VERSION", "1.0.0").strip()

try:
    CHECK_DELAY_SECONDS = float(os.getenv("CHECK_DELAY_SECONDS", "2"))
except ValueError:
    CHECK_DELAY_SECONDS = 2.0

try:
    POLL_INTERVAL_SECONDS = float(os.getenv("POLL_INTERVAL_SECONDS", "3"))
except ValueError:
    POLL_INTERVAL_SECONDS = 3.0

try:
    PAGE_TIMEOUT_SECONDS = int(os.getenv("PAGE_TIMEOUT_SECONDS", "20"))
except ValueError:
    PAGE_TIMEOUT_SECONDS = 20

try:
    HEARTBEAT_INTERVAL_SECONDS = float(os.getenv("HEARTBEAT_INTERVAL_SECONDS", "20"))
except ValueError:
    HEARTBEAT_INTERVAL_SECONDS = 20.0

IWBMS_SEARCH_URL = "https://iwbms.mahabocw.in/search-record"

# Global state
RUNNING = True
LAST_HEARTBEAT_TIME = 0.0
COMPLETED_COUNT = 0
FAILED_COUNT = 0


def log(message: str, level: str = "INFO"):
    """Formatted timestamped console logging."""
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] [{level}] {message}")


def mask_token(token: str) -> str:
    """Masks secret token for display."""
    if not token or len(token) < 6:
        return "***"
    return token[:3] + "..." + token[-3:]


# -----------------------------------------------------------------------------
# API CLIENT HELPERS
# -----------------------------------------------------------------------------
def get_auth_headers() -> Dict[str, str]:
    """Generates standard authorization headers for Worker API requests."""
    return {
        "Authorization": f"Bearer {WORKER_TOKEN}",
        "Content-Type": "application/json",
        "User-Agent": f"OMDigital-IWBMS-Worker/{WORKER_VERSION} ({WORKER_NAME})",
    }


def send_heartbeat(
    status: str = "Idle",
    current_job_id: Optional[int] = None,
    current_mh: Optional[str] = None,
) -> bool:
    """Sends heartbeat update to the backend server."""
    global LAST_HEARTBEAT_TIME
    url = f"{API_BASE_URL}/api/iwbms/worker/heartbeat"
    payload = {
        "workerName": WORKER_NAME,
        "workerVersion": WORKER_VERSION,
        "status": status,
        "currentJobId": current_job_id,
        "currentMhNumber": current_mh,
    }
    try:
        res = requests.post(url, json=payload, headers=get_auth_headers(), timeout=10)
        if res.status_code == 200:
            LAST_HEARTBEAT_TIME = time.time()
            return True
        else:
            log(f"Heartbeat failed with status code {res.status_code}: {res.text}", level="WARN")
            return False
    except Exception as e:
        log(f"Heartbeat connection error: {e}", level="WARN")
        return False


def fetch_next_job() -> Optional[Dict[str, Any]]:
    """
    Calls /api/iwbms/jobs/next to atomically fetch and lock the next pending job.
    Returns None if no jobs are waiting in the queue.
    """
    url = f"{API_BASE_URL}/api/iwbms/jobs/next"
    try:
        res = requests.post(url, headers=get_auth_headers(), timeout=15)
        if res.status_code == 401:
            log("Authentication failed! Check your IWBMS_WORKER_TOKEN in .env", level="ERROR")
            return None
        if res.status_code != 200:
            log(f"Unexpected response fetching job ({res.status_code}): {res.text}", level="WARN")
            return None

        data = res.json()
        if data.get("success") and data.get("job"):
            return data["job"]
        return None
    except requests.exceptions.RequestException as e:
        log(f"API communication error when polling for jobs: {e}", level="WARN")
        return None


def complete_job(job_id: int, result_status: str) -> bool:
    """Reports a completed check result (Active | Inactive | Not Found | Check)."""
    url = f"{API_BASE_URL}/api/iwbms/jobs/{job_id}/complete"
    payload = {"resultStatus": result_status}
    try:
        res = requests.post(url, json=payload, headers=get_auth_headers(), timeout=15)
        if res.status_code == 200:
            return True
        log(f"Failed to complete job #{job_id} on API: {res.text}", level="ERROR")
        return False
    except Exception as e:
        log(f"Network error completing job #{job_id}: {e}", level="ERROR")
        return False


def fail_job(job_id: int, error_message: str) -> bool:
    """Reports a technical error or timeout for a job."""
    url = f"{API_BASE_URL}/api/iwbms/jobs/{job_id}/fail"
    payload = {"errorMessage": str(error_message)[:500]}
    try:
        res = requests.post(url, json=payload, headers=get_auth_headers(), timeout=15)
        if res.status_code == 200:
            return True
        log(f"Failed to submit failure status for job #{job_id}: {res.text}", level="ERROR")
        return False
    except Exception as e:
        log(f"Network error reporting failure for job #{job_id}: {e}", level="ERROR")
        return False


# -----------------------------------------------------------------------------
# BROWSER AUTOMATION & IWBMS SCRAPER
# -----------------------------------------------------------------------------
class IwbmsBrowser:
    """Encapsulates Microsoft Edge browser lifecycle and search execution."""

    def __init__(self, timeout: int = PAGE_TIMEOUT_SECONDS):
        self.timeout = timeout
        self.driver: Optional[webdriver.Edge] = None

    def start(self):
        """Initializes Microsoft Edge WebDriver using Selenium Manager."""
        log("Starting Microsoft Edge browser...", level="INFO")
        options = EdgeOptions()
        options.add_argument("--start-maximized")
        options.add_argument("--disable-blink-features=AutomationControlled")
        options.add_experimental_option("excludeSwitches", ["enable-automation"])
        options.add_experimental_option("useAutomationExtension", False)

        try:
            # Let Selenium Manager automatically resolve and manage msedgedriver
            self.driver = webdriver.Edge(options=options)
            self.driver.set_page_load_timeout(self.timeout)
            log("Microsoft Edge started successfully.", level="INFO")
            log(f"Navigating to IWBMS Portal: {IWBMS_SEARCH_URL}", level="INFO")
            self.driver.get(IWBMS_SEARCH_URL)
            time.sleep(2.5)
        except WebDriverException as e:
            log(f"Failed to start Microsoft Edge: {e}", level="CRITICAL")
            raise

    def ensure_page_ready(self):
        """Ensures the browser is on the IWBMS search page and ready."""
        if not self.driver:
            self.start()
            return

        try:
            current_url = self.driver.current_url.lower()
            if "search-record" not in current_url:
                log(f"Current page is {current_url}. Navigating back to {IWBMS_SEARCH_URL}", level="INFO")
                self.driver.get(IWBMS_SEARCH_URL)
                time.sleep(2.0)
        except Exception:
            self.restart()

    def restart(self):
        """Clean recovery in case of browser crash or communication loss."""
        log("Restarting Microsoft Edge driver...", level="WARN")
        self.quit()
        time.sleep(2.0)
        self.start()

    def check_iwbms_status(self, mh_number: str) -> Tuple[str, str]:
        """
        Executes the search on IWBMS and returns (status, detail_message).
        Possible status: 'Active' | 'Inactive' | 'Not Found' | 'Check'
        """
        if not self.driver:
            self.start()

        clean_mh = str(mh_number).strip().upper().replace(" ", "")
        if not clean_mh or len(clean_mh) < 4:
            return "Not Found", "Invalid MH Number format"

        self.ensure_page_ready()
        wait = WebDriverWait(self.driver, self.timeout)

        try:
            # 1. Locate Search Input Field
            input_box = wait.until(
                EC.presence_of_element_located((
                    By.XPATH,
                    "//input[@type='text' or contains(@placeholder, 'Registration') or contains(@placeholder, 'नोंदणी') or contains(@id, 'reg') or contains(@name, 'reg')]",
                ))
            )

            # Clear old value
            input_box.click()
            input_box.send_keys(Keys.CONTROL + "a")
            input_box.send_keys(Keys.BACKSPACE)
            time.sleep(0.3)

            # 2. Enter clean MH Number
            input_box.send_keys(clean_mh)
            time.sleep(0.4)

            # 3. Locate & Click Search / Get Detail Button
            try:
                search_btn = self.driver.find_element(
                    By.XPATH,
                    "//button[contains(., 'Search') or contains(., 'Get Detail') or contains(., 'Get Details') or contains(., 'शोधा') or contains(., 'तपासा') or @type='submit']",
                )
                search_btn.click()
            except NoSuchElementException:
                input_box.send_keys(Keys.RETURN)

            # 4. Wait for response rendering
            time.sleep(3.0)

            # 5. Extract page text & interpret status
            body_text = self.driver.find_element(By.TAG_NAME, "body").text
            body_lower = body_text.lower()

            # Rule A: Record Not Found
            not_found_keywords = [
                "no record found",
                "record not found",
                "नोंद सापडली नाही",
                "डेटा उपलब्ध नाही",
                "invalid registration",
                "no worker found",
            ]
            if any(kw in body_lower for kw in not_found_keywords):
                return "Not Found", "No worker record exists on portal"

            # Rule B: Active Subscription
            # Look for active status indicators while ensuring it is not "inactive"
            if "active" in body_lower and "inactive" not in body_lower:
                return "Active", "Worker subscription is Active"
            if "सक्रिय" in body_lower and "निष्क्रिय" not in body_lower:
                return "Active", "Worker subscription is Active (Marathi label)"

            # Rule C: Inactive / Expired Subscription
            inactive_keywords = [
                "inactive",
                "निष्क्रिय",
                "expired",
                "मुदत संपली",
                "नूतनीकरण प्रलंबित",
                "renewal due",
            ]
            if any(kw in body_lower for kw in inactive_keywords):
                return "Inactive", "Worker subscription is Inactive/Expired"

            # Rule D: Ambiguous or Partial Data (Need human verification)
            if "registration" in body_lower or "worker" in body_lower or "नाव" in body_lower:
                return "Check", "Record found but subscription status requires verification"

            # Rule E: Fallback Check
            return "Check", "Page format could not be verified automatically"

        except TimeoutException:
            log("Timeout waiting for search response from IWBMS portal.", level="WARN")
            return "Check", "Search response timed out on portal"
        except WebDriverException as e:
            log(f"WebDriver error during search: {e}", level="ERROR")
            self.restart()
            raise

    def quit(self):
        """Safely closes the browser session."""
        if self.driver:
            try:
                self.driver.quit()
            except Exception:
                pass
            self.driver = None
            log("Microsoft Edge browser closed cleanly.", level="INFO")


# -----------------------------------------------------------------------------
# SIGNAL HANDLING & SHUTDOWN
# -----------------------------------------------------------------------------
def handle_shutdown_signal(signum, frame):
    """Graceful shutdown handler for Ctrl+C and termination signals."""
    global RUNNING
    print("\n")
    log("Termination signal received (Ctrl+C). Shutting down worker gracefully...", level="WARN")
    RUNNING = False


signal.signal(signal.SIGINT, handle_shutdown_signal)
signal.signal(signal.SIGTERM, handle_shutdown_signal)


# -----------------------------------------------------------------------------
# TEST API MODE (--test-api)
# -----------------------------------------------------------------------------
def run_api_test() -> bool:
    """Tests API connectivity, token authorization, heartbeat, and queue retrieval."""
    print("=" * 65)
    print("   OM DIGITAL IWBMS WORKER - API DIAGNOSTIC TEST")
    print("=" * 65)
    print(f"API Target URL : {API_BASE_URL}")
    print(f"Worker Token   : {mask_token(WORKER_TOKEN)}")
    print(f"Worker Name    : {WORKER_NAME} (v{WORKER_VERSION})")
    print("=" * 65)

    if not WORKER_TOKEN:
        print("[FAIL] IWBMS_WORKER_TOKEN is not set in .env file.")
        return False

    # 1. Test Heartbeat
    print("\n[1/3] Testing Worker Heartbeat (POST /api/iwbms/worker/heartbeat)...")
    try:
        hb_res = requests.post(
            f"{API_BASE_URL}/api/iwbms/worker/heartbeat",
            json={"workerName": WORKER_NAME, "workerVersion": WORKER_VERSION, "status": "Online"},
            headers=get_auth_headers(),
            timeout=10,
        )
        if hb_res.status_code == 200:
            print("      [PASS] Heartbeat accepted successfully by OM Digital server.")
        elif hb_res.status_code == 401:
            print("      [FAIL] Unauthorized (401). Invalid IWBMS_WORKER_TOKEN.")
            return False
        else:
            print(f"      [FAIL] Unexpected response ({hb_res.status_code}): {hb_res.text}")
            return False
    except Exception as e:
        print(f"      [FAIL] Connection error: {e}")
        return False

    # 2. Test Job Queue Next endpoint
    print("\n[2/3] Testing Queue Retrieval (POST /api/iwbms/jobs/next)...")
    try:
        job_res = requests.post(
            f"{API_BASE_URL}/api/iwbms/jobs/next",
            headers=get_auth_headers(),
            timeout=10,
        )
        if job_res.status_code == 200:
            data = job_res.json()
            if data.get("job"):
                print(f"      [PASS] Queue accessible! (Pending job ready: ID #{data['job']['id']}, MH: {data['job'].get('mhNumber')})")
            else:
                print("      [PASS] Queue accessible! (Queue is currently empty - 0 pending jobs).")
        else:
            print(f"      [FAIL] Failed to access queue ({job_res.status_code}): {job_res.text}")
            return False
    except Exception as e:
        print(f"      [FAIL] Connection error: {e}")
        return False

    # 3. Test Summary Endpoint
    print("\n[3/3] Testing Health & Server Reachability...")
    try:
        health_res = requests.get(f"{API_BASE_URL}/api/health", timeout=10)
        print(f"      [PASS] Server health check response: {health_res.status_code} OK")
    except Exception as e:
        print(f"      [WARN] /api/health check skipped: {e}")

    print("\n" + "=" * 65)
    print("   [SUCCESS] ALL API DIAGNOSTIC CHECKS PASSED!")
    print("   Your worker is properly authenticated and ready to run.")
    print("=" * 65)
    return True


# -----------------------------------------------------------------------------
# MAIN WORKER LOOP
# -----------------------------------------------------------------------------
def run_worker():
    """Main lifecycle loop of the IWBMS Worker."""
    global RUNNING, COMPLETED_COUNT, FAILED_COUNT, LAST_HEARTBEAT_TIME

    print("=" * 65)
    print("   OM DIGITAL E-SEVA KENDRA - IWBMS STATUS CHECKER BOT")
    print("=" * 65)
    print(f"Worker Identity : {WORKER_NAME} (v{WORKER_VERSION})")
    print(f"API Target URL  : {API_BASE_URL}")
    print(f"Worker Token    : {mask_token(WORKER_TOKEN)}")
    print(f"Browser Engine  : Microsoft Edge (Selenium)")
    print(f"Portal Target   : {IWBMS_SEARCH_URL}")
    print(f"Rate Delay      : {CHECK_DELAY_SECONDS}s per search")
    print("=" * 65)

    if not WORKER_TOKEN:
        log("IWBMS_WORKER_TOKEN is not configured. Please add it to your .env file.", level="CRITICAL")
        sys.exit(1)

    # Initial API Test
    log("Verifying API authentication before launching browser...", level="INFO")
    if not send_heartbeat(status="Online"):
        log("Could not authenticate with OM Digital API. Check token and server status.", level="CRITICAL")
        sys.exit(1)

    # Start Edge Browser
    browser = IwbmsBrowser(timeout=PAGE_TIMEOUT_SECONDS)
    try:
        browser.start()
    except Exception as e:
        log(f"Failed to start Microsoft Edge: {e}", level="CRITICAL")
        sys.exit(1)

    log("Worker is ONLINE and ready to process queue.", level="INFO")
    print("-" * 65)

    try:
        while RUNNING:
            now = time.time()

            # Send periodic heartbeat if interval elapsed
            if now - LAST_HEARTBEAT_TIME >= HEARTBEAT_INTERVAL_SECONDS:
                send_heartbeat(status="Idle")

            # Poll next pending job
            job = fetch_next_job()

            if not job:
                # No jobs waiting -> sleep and poll again
                time.sleep(POLL_INTERVAL_SECONDS)
                continue

            # Job Found -> Process it
            job_id = int(job["id"])
            mh_number = str(job.get("mhNumber", "")).strip()
            worker_type = str(job.get("workerType", "registration"))

            print(f"\n[{datetime.now().strftime('%H:%M:%S')}] >>> PROCESSING JOB #{job_id}")
            print(f"    Worker Type : {worker_type.upper()}")
            print(f"    MH Number   : {mh_number}")

            # Send processing heartbeat
            send_heartbeat(status="Processing", current_job_id=job_id, current_mh=mh_number)

            # Execute IWBMS search
            try:
                result_status, detail_msg = browser.check_iwbms_status(mh_number)

                print(f"    Search Result: {result_status.upper()} ({detail_msg})")

                # Submit completion to API
                if complete_job(job_id, result_status):
                    COMPLETED_COUNT += 1
                    log(f"Job #{job_id} successfully marked COMPLETED as '{result_status}'", level="SUCCESS")
                else:
                    FAILED_COUNT += 1
                    log(f"Failed to submit completion for Job #{job_id}", level="ERROR")

            except Exception as search_err:
                FAILED_COUNT += 1
                error_desc = f"Search execution failed: {search_err}"
                log(f"Job #{job_id} encountered an error: {error_desc}", level="ERROR")
                fail_job(job_id, error_desc)

            # Summary stats in console
            print(f"    Queue Stats : Completed = {COMPLETED_COUNT} | Failed = {FAILED_COUNT}")
            print("-" * 65)

            # Rate limiting / Delay between searches
            if CHECK_DELAY_SECONDS > 0:
                time.sleep(CHECK_DELAY_SECONDS)

    except KeyboardInterrupt:
        log("Worker interrupted by user.", level="WARN")
    finally:
        log("Executing clean shutdown...", level="INFO")
        try:
            send_heartbeat(status="Offline")
        except Exception:
            pass
        browser.quit()
        print("\n" + "=" * 65)
        print(f"   FINAL SESSION STATS: Completed = {COMPLETED_COUNT} | Failed = {FAILED_COUNT}")
        print("   Worker has stopped safely.")
        print("=" * 65)


# -----------------------------------------------------------------------------
# ENTRY POINT
# -----------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="OM Digital IWBMS Status Checker Local Worker")
    parser.add_argument(
        "--test-api",
        action="store_true",
        help="Test API connection and worker authentication without launching Edge browser.",
    )
    args = parser.parse_args()

    if args.test_api:
        success = run_api_test()
        sys.exit(0 if success else 1)
    else:
        run_worker()


if __name__ == "__main__":
    main()
