import paramiko
import sys

def run(client, cmd):
    i, o, e = client.exec_command(cmd, timeout=20)
    return o.read().decode(), e.read().decode()

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('120.26.144.55', username='root', password='LVm.4fr,dx_TkWk', timeout=15)

print("=== backend/.env ===")
o, e = run(c, 'cat /root/multi_agent/backend/.env 2>/dev/null | head -50')
print(o or e or '(not found)')

print("\n=== docker compose files ===")
o, e = run(c, 'ls -la /root/multi_agent/docker-compose*.yml 2>/dev/null')
print(o or e)

print("\n=== frontend container info ===")
o, e = run(c, 'docker inspect multi_agent_frontend --format "{{.Config.Image}}" 2>&1; docker port multi_agent_frontend 2>&1')
print(o or e)

print("\n=== port mappings ===")  
o, e = run(c, 'docker ps --format "table {{.Names}}\t{{.Ports}}"')
print(o)

print("\n=== try to get actual error from backend ===")
try:
    i, o, e = c.exec_command('timeout 5 docker exec multi_agent_backend python -c "import sys; sys.path.insert(0,\"/app\"); from app.main import app" 2>&1', timeout=10)
    print((o.read() or e.read()).decode()[:1000] or '(no output)')
except Exception as ex:
    print(f'Timeout/error: {ex}')

c.close()
