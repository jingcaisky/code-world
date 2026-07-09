import paramiko
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('120.26.144.55', username='root', password='LVm.4fr,dx_TkWk', timeout=15)
i, o, e = c.exec_command('docker images --format "{{.Repository}}:{{.Tag}} {{.Size}}" | grep multi_agent', timeout=10)
print((o.read() or b'').decode() or 'No images found')
i, o, e = c.exec_command('docker ps -a', timeout=10)
print('\nAll containers:', (o.read() or b'').decode())
c.close()
