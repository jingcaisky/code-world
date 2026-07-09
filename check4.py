import paramiko
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('120.26.144.55', username='root', password='LVm.4fr,dx_TkWk', timeout=15)

cmds = [
    ('docker ps --format "{{.Names}}|{{.Ports}}"', 'Container ports'),
    ('cat /root/multi_agent/docker-compose.frontend.yml', 'Frontend compose'),
    ('docker exec multi_agent_backend ls /app/app/ 2>&1 | head -20', 'Backend app files'),
]
for cmd, desc in cmds:
    print(f'\n=== {desc} ===')
    try:
        i, o, e = c.exec_command(cmd, timeout=15)
        print((o.read() or b'').decode())
    except Exception as ex:
        print(f'Error: {ex}')
c.close()
print('\nDone')
