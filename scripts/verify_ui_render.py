"""
Verify and capture screenshots/DOM details of Superadmin and Agency pages rendering against real backend APIs.
"""
import time
import json
import os
from bson import ObjectId
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from motor.motor_asyncio import AsyncIOMotorClient
import asyncio
from app.utils.auth import create_access_token, get_password_hash

BACKEND_API = "http://127.0.0.1:5000/api"
FRONTEND_URL = "http://localhost:3000"
ARTIFACT_DIR = r"C:\Users\ramra\.gemini\antigravity\brain\26f43652-e02b-4c91-91cd-bb3a3f2f2290"

async def setup_users():
    client = AsyncIOMotorClient("mongodb://localhost:27017")
    db = client["whatsapp_saas_live"]
    
    # 1. Superadmin User
    admin_id = str(ObjectId())
    await db.users.delete_many({"email": "superadmin@platform.com"})
    await db.users.insert_one({
        "_id": ObjectId(admin_id),
        "email": "superadmin@platform.com",
        "name": "Platform Superadmin",
        "role": "superadmin",
        "status": "active"
    })
    superadmin_token = create_access_token({"id": admin_id, "sub": "superadmin@platform.com", "role": "superadmin", "tenantId": "platform_admin"})
    
    # 2. Agency & Agency User
    agency_id = str(ObjectId())
    agency_user_id = str(ObjectId())
    await db.agencies.delete_many({"name": "Black Angler Prime Agency"})
    await db.agencies.insert_one({
        "_id": ObjectId(agency_id),
        "name": "Black Angler Prime Agency",
        "contactEmail": "agency@prime.com",
        "revenueModel": "revenue_share",
        "status": "active"
    })
    await db.users.delete_many({"email": "agency@prime.com"})
    await db.users.insert_one({
        "_id": ObjectId(agency_user_id),
        "email": "agency@prime.com",
        "name": "Marcus Vance",
        "role": "agency_owner",
        "agencyId": agency_id,
        "status": "active"
    })
    agency_token = create_access_token({"id": agency_user_id, "sub": "agency@prime.com", "role": "agency_owner", "agencyId": agency_id, "tenantId": agency_id})
    
    # Seed 1 client tenant for this agency
    client_tenant_id = str(ObjectId())
    await db.tenants.delete_many({"name": "Solstice Cafe"})
    await db.tenants.insert_one({
        "_id": ObjectId(client_tenant_id),
        "name": "Solstice Cafe",
        "agencyId": agency_id,
        "enabledChannels": ["whatsapp", "gbp"],
        "plan": "growth",
        "status": "active"
    })
    
    # Seed 1 ledger entry
    await db.agency_billing_ledgers.delete_many({"agencyId": agency_id})
    await db.agency_billing_ledgers.insert_one({
        "agencyId": agency_id,
        "clientTenantId": client_tenant_id,
        "entryType": "revenue_share_commission",
        "amount": 450.0,
        "description": "August 2026 Revenue Share Commission (Solstice Cafe)",
        "status": "settled",
        "createdAt": "2026-08-31T23:59:59Z"
    })
    
    client.close()
    return superadmin_token, agency_token, agency_id

def main():
    superadmin_token, agency_token, agency_id = asyncio.run(setup_users())
    
    chrome_options = Options()
    chrome_options.add_argument("--headless=new")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--window-size=1920,1080")
    
    driver = webdriver.Chrome(options=chrome_options)
    driver.implicitly_wait(10)
    
    try:
        # ─────────────────────────────────────────────────────────────────────
        # Superadmin Page Render Verification
        # ─────────────────────────────────────────────────────────────────────
        driver.get(f"{FRONTEND_URL}/login")
        time.sleep(1)
        zustand_admin = json.dumps({"state": {"token": superadmin_token, "user": {"email": "superadmin@platform.com", "role": "superadmin"}}, "version": 0})
        driver.execute_script(f"""
            localStorage.setItem('wa_token', '{superadmin_token}');
            localStorage.setItem('wa_auth', JSON.stringify({zustand_admin}));
            document.cookie = 'wa_token={superadmin_token}; path=/; max-age=604800; SameSite=Lax';
        """)
        
        driver.get(f"{FRONTEND_URL}/superadmin")
        WebDriverWait(driver, 15).until(EC.presence_of_element_located((By.CLASS_NAME, "page-title")))
        time.sleep(4)  # Wait for React Query
        
        superadmin_screenshot = os.path.join(ARTIFACT_DIR, "superadmin_page_rendered.png")
        driver.save_screenshot(superadmin_screenshot)
        print(f"[SUPERADMIN] Rendered screenshot saved to {superadmin_screenshot}")
        
        superadmin_src = driver.page_source
        print(f"[SUPERADMIN] Page title found: {'Superadmin Control Plane' in superadmin_src}")
        print(f"[SUPERADMIN] Tenants table loaded: {'Alpha Corp Live' in superadmin_src or 'Solstice Cafe' in superadmin_src}")
        print(f"[SUPERADMIN] Channel badges present: {'WHATSAPP' in superadmin_src and 'GBP' in superadmin_src}")
        print(f"[SUPERADMIN] Impersonate buttons present: {'Impersonate' in superadmin_src}")
        
        # ─────────────────────────────────────────────────────────────────────
        # Agency Page Render Verification
        # ─────────────────────────────────────────────────────────────────────
        driver.delete_all_cookies()
        driver.get(f"{FRONTEND_URL}/")
        time.sleep(1)
        driver.execute_script("localStorage.clear();")
        
        zustand_agency = json.dumps({"state": {"token": agency_token, "user": {"email": "agency@prime.com", "role": "agency_owner", "agencyId": agency_id}}, "version": 0})
        driver.execute_script(f"""
            localStorage.setItem('wa_token', '{agency_token}');
            localStorage.setItem('wa_auth', JSON.stringify({zustand_agency}));
            document.cookie = 'wa_token={agency_token}; path=/; max-age=604800; SameSite=Lax';
        """)
        
        driver.get(f"{FRONTEND_URL}/agency")
        WebDriverWait(driver, 20).until(EC.presence_of_element_located((By.CLASS_NAME, "page-title")))
        time.sleep(4)  # Wait for React Query
        
        agency_screenshot = os.path.join(ARTIFACT_DIR, "agency_page_rendered.png")
        driver.save_screenshot(agency_screenshot)
        print(f"[AGENCY] Rendered screenshot saved to {agency_screenshot}")
        
        agency_src = driver.page_source
        print(f"[AGENCY] Page title found: {'Agency Workspace' in agency_src}")
        print(f"[AGENCY] Client 'Solstice Cafe' visible: {'Solstice Cafe' in agency_src}")
        print(f"[AGENCY] Provision Client button visible: {'Provision Client' in agency_src}")
        
        # Switch to Billing Ledger tab
        ledger_tab_btn = driver.find_element(By.XPATH, "//button[contains(text(), 'Billing Ledger')]")
        ledger_tab_btn.click()
        time.sleep(2)
        
        agency_ledger_screenshot = os.path.join(ARTIFACT_DIR, "agency_ledger_rendered.png")
        driver.save_screenshot(agency_ledger_screenshot)
        agency_ledger_src = driver.page_source
        print(f"[AGENCY LEDGER] Solstice Cafe commission found: {'August 2026 Revenue Share Commission' in agency_ledger_src}")
        print(f"[AGENCY LEDGER] +$450.00 credit found: {'450' in agency_ledger_src}")
        
    finally:
        driver.quit()

if __name__ == "__main__":
    main()
