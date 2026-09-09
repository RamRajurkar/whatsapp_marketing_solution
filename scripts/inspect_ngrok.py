import httpx
import json

def check():
    r = httpx.get('http://127.0.0.1:4040/api/requests/http', timeout=10)
    data = r.json()
    requests = data.get('requests', [])
    print(f"Total requests caught by ngrok: {len(requests)}")
    for req in requests:
        method = req.get('request', {}).get('method')
        uri = req.get('request', {}).get('uri')
        status = req.get('response', {}).get('status_code')
        start = req.get('start')
        print(f"[{start}] {method} {uri} -> Status: {status}")

if __name__ == "__main__":
    check()
