import paramiko

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('47.101.42.53', username='root', password='LVm.4fr,dx_TkWk', timeout=20, allow_agent=False, look_for_keys=False)

# Install Docker Compose plugin + Git + Clone
cmds = '''
mkdir -p /usr/local/lib/docker/cli-plugins
curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 -o /usr/local/lib/docker/cli-plugins/docker-compose
chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
docker compose version
'''
i, o, e = c.exec_command(cmds, timeout=180)
print((o.read() or b'').decode(errors='replace'))
print((e.read() or b'').decode(errors='replace'))
c.close()
