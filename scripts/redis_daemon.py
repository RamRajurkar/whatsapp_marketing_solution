import sys
from fakeredis import TcpFakeServer

def run():
    print("[REDIS DAEMON] Starting Redis Server on 127.0.0.1:6379...")
    server = TcpFakeServer(('127.0.0.1', 6379))
    print("[REDIS DAEMON] Redis Server is listening on 127.0.0.1:6379 (Ready for connections).")
    sys.stdout.flush()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("[REDIS DAEMON] Shutting down Redis server...")
        server.server_close()

if __name__ == '__main__':
    run()
