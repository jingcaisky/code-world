import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('47.101.42.53', username='root', password='LVm.4fr,dx_TkWk', timeout=20, allow_agent=False, look_for_keys=False)
i, o, e = c.exec_command('uptime && free -m && docker --version 2>&1 || echo NO_DOCKER', timeout=15)
print((o.read()or b'').decode(errors='replace'))
c.close()
