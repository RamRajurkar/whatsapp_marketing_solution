import httpx
from typing import Optional

_client: Optional[httpx.AsyncClient] = None

def get_http_client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(
            timeout=30.0,
            limits=httpx.Limits(max_connections=50, max_keepalive_connections=20)
        )
    return _client

async def close_http_client():
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None
