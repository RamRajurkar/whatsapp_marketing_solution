import httpx
import json

def get_post_details():
    r = httpx.get('http://127.0.0.1:4040/api/requests/http', timeout=10)
    data = r.json()
    requests = data.get('requests', [])
    for req in requests:
        if req.get('request', {}).get('method') == 'POST':
            req_id = req.get('id')
            r_detail = httpx.get(f'http://127.0.0.1:4040/api/requests/http/{req_id}', timeout=10)
            detail = r_detail.json()
            raw_body = detail.get('request', {}).get('raw')
            print("Headers:")
            print(json.dumps(detail.get('request', {}).get('headers'), indent=2))
            print("\nBody:")
            print(raw_body)
            print("\nResponse Status:", detail.get('response', {}).get('status_code'))
            print("Response Body:", detail.get('response', {}).get('raw'))
            break

if __name__ == "__main__":
    get_post_details()
