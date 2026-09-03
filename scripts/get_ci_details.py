import httpx
import json

def get_details():
    headers = {"User-Agent": "CI-Reader", "Accept": "application/vnd.github+json"}
    run_url = "https://api.github.com/repos/RamRajurkar/whatsapp_marketing_solution/actions/runs/33771306657"
    jobs_url = "https://api.github.com/repos/RamRajurkar/whatsapp_marketing_solution/actions/runs/33771306657/jobs"
    
    r_run = httpx.get(run_url, headers=headers).json()
    r_jobs = httpx.get(jobs_url, headers=headers).json()
    
    print("=" * 70)
    print("GITHUB ACTIONS REAL RUN EVIDENCE")
    print("=" * 70)
    print(f"Workflow: {r_run.get('name')}")
    print(f"Run ID: {r_run.get('id')}")
    print(f"Run URL: {r_run.get('html_url')}")
    print(f"Triggered By: {r_run.get('event')} on branch '{r_run.get('head_branch')}'")
    print(f"Head Commit SHA: {r_run.get('head_sha')}")
    print(f"Status: {r_run.get('status')}")
    print(f"Conclusion: {r_run.get('conclusion')}")
    print(f"Started At: {r_run.get('run_started_at')}")
    print(f"Updated At: {r_run.get('updated_at')}")
    print("\nJob Execution Details:")
    
    for job in r_jobs.get("jobs", []):
        print(f"\nJob ID: {job.get('id')} - {job.get('name')}")
        print(f"Job URL: {job.get('html_url')}")
        print(f"Conclusion: {job.get('conclusion')}")
        print("Steps:")
        for step in job.get("steps", []):
            print(f"  [{step.get('conclusion', 'N/A').upper()}] {step.get('name')} (Elapsed: {step.get('started_at')} to {step.get('completed_at')})")
    print("=" * 70)

if __name__ == "__main__":
    get_details()
