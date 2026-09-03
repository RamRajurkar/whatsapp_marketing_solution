"""
Automated Progress Document Updater.
Parses pytest test run results and updates the test result table in TENANT_MIGRATION_PROGRESS.md.
"""

import sys
import os
import re
from datetime import datetime, timezone

PROGRESS_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "TENANT_MIGRATION_PROGRESS.md")

def update_test_status(suite_name: str, status: str, details: str = ""):
    if not os.path.exists(PROGRESS_FILE):
        print(f"Error: {PROGRESS_FILE} not found.")
        return

    with open(PROGRESS_FILE, "r", encoding="utf-8") as f:
        content = f.read()

    now_str = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    status_badge = f"✅ PASSED ({now_str})" if status.lower() == "passed" else f"❌ FAILED ({now_str})"

    # Regex search for table rows
    pattern = re.compile(rf"(\|\s*\*\*{re.escape(suite_name)}\*\*\s*\|[^|]*\|[^|]*\|\s*)([^|]*)(\s*\|)", re.MULTILINE)
    
    if pattern.search(content):
        new_content = pattern.sub(rf"\g<1>{status_badge}\g<3>", content)
        with open(PROGRESS_FILE, "w", encoding="utf-8") as f:
            f.write(new_content)
        print(f"Updated status for '{suite_name}' to '{status_badge}' in {PROGRESS_FILE}")
    else:
        print(f"Suite '{suite_name}' not found in progress document table.")

if __name__ == "__main__":
    if len(sys.argv) >= 3:
        suite = sys.argv[1]
        stat = sys.argv[2]
        det = sys.argv[3] if len(sys.argv) > 3 else ""
        update_test_status(suite, stat, det)
    else:
        print("Usage: python update_progress_doc.py <suite_name> <passed|failed> [details]")
