"""
Live End-to-End Headless Selenium Browser Multi-Tenant UI Isolation Test Suite.
1. Seeds Tenant Alpha and Tenant Beta data (Customers & GMB Reviews) via the live backend API (http://127.0.0.1:5000/api).
2. Uses real headless Chrome WebDriver to navigate to the live running Next.js frontend (http://localhost:3000).
3. Authenticates as Tenant Alpha and asserts that real DOM renders Tenant Alpha data.
4. Switches session to Tenant Beta and asserts that Tenant Alpha data is 100% absent from the rendered DOM.
"""

import pytest
import time
import json
import httpx
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

BACKEND_API = "http://127.0.0.1:5000/api"
FRONTEND_URL = "http://localhost:3000"

@pytest.fixture(scope="module")
def browser():
    chrome_options = Options()
    chrome_options.add_argument("--headless=new")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--window-size=1920,1080")

    driver = webdriver.Chrome(options=chrome_options)
    driver.implicitly_wait(10)
    yield driver
    driver.quit()

@pytest.fixture(scope="module")
def seeded_tenants():
    """Seed Tenant Alpha and Tenant Beta with Customers and GMB Reviews via the actual live API endpoints."""
    with httpx.Client(base_url=BACKEND_API, timeout=10.0) as client:
        # 1. Register / Login Tenant Alpha with 'whatsapp' and 'gbp' enabled
        client.post("/auth/register", json={
            "email": "admin_alpha_live_ui@test.com",
            "password": "Password123!",
            "restaurantName": "Alpha Corp Live",
            "tenantName": "Alpha Corp Live",
            "enabledChannels": ["whatsapp", "gbp"]
        })
        login_a = client.post("/auth/login", json={"email": "admin_alpha_live_ui@test.com", "password": "Password123!"})
        data_a = login_a.json()
        token_a = data_a["token"]
        user_a = data_a["user"]

        # 2. Register / Login Tenant Beta with 'whatsapp' and 'gbp' enabled
        client.post("/auth/register", json={
            "email": "admin_beta_live_ui@test.com",
            "password": "Password123!",
            "restaurantName": "Beta Corp Live",
            "tenantName": "Beta Corp Live",
            "enabledChannels": ["whatsapp", "gbp"]
        })
        login_b = client.post("/auth/login", json={"email": "admin_beta_live_ui@test.com", "password": "Password123!"})
        data_b = login_b.json()
        token_b = data_b["token"]
        user_b = data_b["user"]

        # 3. Seed real Customer for Tenant Alpha via API
        client.post("/customers", json={
            "name": "Alpha Live Real Customer",
            "phone": "919811111111"
        }, headers={"Authorization": f"Bearer {token_a}"})

        # 4. Seed real Customer for Tenant Beta via API
        client.post("/customers", json={
            "name": "Beta Live Real Customer",
            "phone": "919822222222"
        }, headers={"Authorization": f"Bearer {token_b}"})

        # 5. Seed real GMB Review for Tenant Alpha via API
        client.post("/gmb/reviews", json={
            "locationId": "loc_alpha_store",
            "reviewerName": "Sneha Patel - Alpha Review",
            "starRating": 5,
            "comment": "Outstanding service at Alpha flagship store!"
        }, headers={"Authorization": f"Bearer {token_a}"})

        # 6. Seed real GMB Review for Tenant Beta via API
        client.post("/gmb/reviews", json={
            "locationId": "loc_beta_store",
            "reviewerName": "Karan Johar - Beta Review",
            "starRating": 4,
            "comment": "Pleasant fabric shopping experience at Beta boutique!"
        }, headers={"Authorization": f"Bearer {token_b}"})

        return {
            "alpha": {
                "token": token_a,
                "user": user_a,
                "customerName": "Alpha Live Real Customer",
                "reviewAuthor": "Sneha Patel - Alpha Review"
            },
            "beta": {
                "token": token_b,
                "user": user_b,
                "customerName": "Beta Live Real Customer",
                "reviewAuthor": "Karan Johar - Beta Review"
            }
        }

def test_real_browser_customer_isolation_flow(browser, seeded_tenants):
    """
    Executes real UI navigation against the live running Next.js application:
    1. Authenticate as Tenant Alpha in browser.
    2. Navigate to /customers and assert Alpha customer is visible in real rendered DOM.
    3. Switch session to Tenant Beta in browser.
    4. Navigate to /customers and assert Beta customer is visible, and Alpha customer is NOT present.
    """
    # ── Step 1: Set session as Tenant Alpha ───────────────────────────────────
    browser.get(f"{FRONTEND_URL}/login")
    time.sleep(1)

    alpha_token = seeded_tenants["alpha"]["token"]
    alpha_user = seeded_tenants["alpha"]["user"]
    zustand_alpha = json.dumps({"state": {"token": alpha_token, "user": alpha_user}, "version": 0})

    browser.execute_script(f"""
        localStorage.setItem('wa_token', '{alpha_token}');
        localStorage.setItem('wa_auth', JSON.stringify({zustand_alpha}));
        document.cookie = 'wa_token={alpha_token}; path=/; max-age=604800; SameSite=Lax';
    """)

    # ── Step 2: Navigate to real Customers page as Tenant Alpha ───────────────
    browser.get(f"{FRONTEND_URL}/customers")
    WebDriverWait(browser, 10).until(EC.presence_of_element_located((By.CLASS_NAME, "page-title")))
    time.sleep(2)  # Wait for React Query table fetch & render

    page_source_alpha = browser.page_source
    assert "Alpha Live Real Customer" in page_source_alpha, "Tenant Alpha customer must be rendered for Alpha session"
    assert "Beta Live Real Customer" not in page_source_alpha, "Tenant Beta customer must NOT appear in Alpha session"

    # ── Step 3: Switch session to Tenant Beta ─────────────────────────────────
    browser.get(f"{FRONTEND_URL}/login")
    time.sleep(1)
    browser.execute_script("""
        localStorage.clear();
        document.cookie = 'wa_token=; path=/; max-age=0; SameSite=Lax';
    """)

    beta_token = seeded_tenants["beta"]["token"]
    beta_user = seeded_tenants["beta"]["user"]
    zustand_beta = json.dumps({"state": {"token": beta_token, "user": beta_user}, "version": 0})

    browser.execute_script(f"""
        localStorage.setItem('wa_token', '{beta_token}');
        localStorage.setItem('wa_auth', JSON.stringify({zustand_beta}));
        document.cookie = 'wa_token={beta_token}; path=/; max-age=604800; SameSite=Lax';
    """)

    # ── Step 4: Navigate to real Customers page as Tenant Beta ────────────────
    browser.get(f"{FRONTEND_URL}/customers")
    WebDriverWait(browser, 10).until(EC.presence_of_element_located((By.CLASS_NAME, "page-title")))
    time.sleep(2)  # Wait for React Query table fetch & render

    page_source_beta = browser.page_source
    assert "Beta Live Real Customer" in page_source_beta, "Tenant Beta customer must be rendered for Beta session"
    assert "Alpha Live Real Customer" not in page_source_beta, "Tenant Alpha customer must NEVER leak into Beta session"


def test_gmb_reviews_ui_isolation(browser, seeded_tenants):
    """
    Executes real headless Chrome UI navigation against Next.js Google Reviews page:
    1. Authenticate as Tenant Alpha in browser.
    2. Navigate to /reviews and assert Alpha review is visible in real rendered DOM.
    3. Assert Beta review is 100% absent.
    4. Switch session to Tenant Beta in browser.
    5. Navigate to /reviews and assert Beta review is visible in real rendered DOM.
    6. Assert Alpha review is 100% absent from Beta DOM.
    """
    # ── Step 1: Set session as Tenant Alpha ───────────────────────────────────
    browser.get(f"{FRONTEND_URL}/login")
    time.sleep(1)

    alpha_token = seeded_tenants["alpha"]["token"]
    alpha_user = seeded_tenants["alpha"]["user"]
    zustand_alpha = json.dumps({"state": {"token": alpha_token, "user": alpha_user}, "version": 0})

    browser.execute_script(f"""
        localStorage.setItem('wa_token', '{alpha_token}');
        localStorage.setItem('wa_auth', JSON.stringify({zustand_alpha}));
        document.cookie = 'wa_token={alpha_token}; path=/; max-age=604800; SameSite=Lax';
    """)

    # ── Step 2: Navigate to real GMB Reviews page as Tenant Alpha ─────────────
    browser.get(f"{FRONTEND_URL}/reviews")
    WebDriverWait(browser, 10).until(EC.presence_of_element_located((By.CLASS_NAME, "page-title")))
    time.sleep(2)  # Wait for React Query fetch & render

    page_source_alpha = browser.page_source
    assert "Sneha Patel - Alpha Review" in page_source_alpha, "Tenant Alpha review must be rendered for Alpha session"
    assert "Karan Johar - Beta Review" not in page_source_alpha, "Tenant Beta review must NOT appear in Alpha session"

    # ── Step 3: Switch session to Tenant Beta ─────────────────────────────────
    browser.get(f"{FRONTEND_URL}/login")
    time.sleep(1)
    browser.execute_script("""
        localStorage.clear();
        document.cookie = 'wa_token=; path=/; max-age=0; SameSite=Lax';
    """)

    beta_token = seeded_tenants["beta"]["token"]
    beta_user = seeded_tenants["beta"]["user"]
    zustand_beta = json.dumps({"state": {"token": beta_token, "user": beta_user}, "version": 0})

    browser.execute_script(f"""
        localStorage.setItem('wa_token', '{beta_token}');
        localStorage.setItem('wa_auth', JSON.stringify({zustand_beta}));
        document.cookie = 'wa_token={beta_token}; path=/; max-age=604800; SameSite=Lax';
    """)

    # ── Step 4: Navigate to real GMB Reviews page as Tenant Beta ──────────────
    browser.get(f"{FRONTEND_URL}/reviews")
    WebDriverWait(browser, 10).until(EC.presence_of_element_located((By.CLASS_NAME, "page-title")))
    time.sleep(2)  # Wait for React Query fetch & render

    page_source_beta = browser.page_source
    assert "Karan Johar - Beta Review" in page_source_beta, "Tenant Beta review must be rendered for Beta session"
    assert "Sneha Patel - Alpha Review" not in page_source_beta, "Tenant Alpha review must NEVER leak into Beta session"
