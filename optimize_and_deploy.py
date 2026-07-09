import paramiko
import time

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('120.26.144.55', username='root', password='LVm.4fr,dx_TkWk', timeout=20)

def run(cmd, t=60):
    print(f'\n>>> {cmd[:120]}')
    i, o, e = c.exec_command(cmd, timeout=t)
    out = (o.read() or b'').decode(errors='replace')
    err = (e.read() or b'').decode(errors='replace')
    if out.strip(): print(out[:2500])
    if err.strip(): print(f'STDERR: {err[:500]}')
    return out, err

# Step 1: Read current docker-compose.prod.yml
print('='*60)
print('STEP 1: Read prod compose')
print('='*60)
run('cat /root/multi_agent/docker-compose.prod.yml', 10)

c.close()
print('\n=== Read complete ===')
