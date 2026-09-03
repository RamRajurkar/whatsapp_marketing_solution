import httpx
import json
import time
import sys

RUNS_URL = "https://api.github.com/repos/RamRajurkar/whatsapp_marketing_solution/actions/runs"

def monitor_run():
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "CI-Monitor"
    }
    
    with httpx.Client(headers=headers, timeout=20) as client:
        r = client.get(RUNS_URL)
        if r.status_code != 200:
            print(f"Error fetching runs: {r.status_code}")
            return
        runs = r.json().get("workflow_runs", [])
        if not runs:
            print("No runs found.")
            return
        
        latest = runs[0]
        run_id = latest["id"]
        run_url = latest["html_url"]
        print(f"Tracking Run ID: {run_id}")
        print(f"Run URL: {run_url}")
        
        while True:
            r = client.get(f"https://api.github.com/repos/RamRajurkar/whatsapp_marketing_solution/actions/runs/{run_id}")
            run_data = r.json()
            status = run_data.get("status")
            conclusion = run_data.get("conclusion")
            print(f"[{time.strftime('%X')}] Status: {status} | Conclusion: {conclusion}")
            
            if status == "completed":
                break
            time.sleep(10)
        
        # Fetch jobs and step logs
        jobs_r = client.get(f"https://api.github.com/repos/RamRajurkar/whatsapp_marketing_solution/actions/runs/{run_id}/jobs")
        jobs_data = jobs_r.json().get("jobs", [])
        for job in jobs_data:
            print(f"\nJob: {job.get('name')} - Conclusion: {job.get('conclusion')}")
            for step in job.get("steps", []):
                print(f"  Step: {step.get('name')} - Status: {step.get('status')} - Conclusion: {step.get('conclusion')}")

if __name__ == "__main__":
    monitor_run()
