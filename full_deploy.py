import paramiko
import time

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('47.101.42.53', username='root', password='LVm.4fr,dx_TkWk', timeout=20, allow_agent=False, look_for_keys=False)

def run(cmd, t=120):
    print(f'\n>>> {cmd[:110]}')
    i, o, e = c.exec_command(cmd, timeout=t)
    out = (o.read() or b'').decode(errors='replace')
    err = (e.read() or b'').decode(errors='replace')
    if out.strip(): print(out[:2500])
    if err.strip(): print(f'ERR: {err[:400]}')
    return out

# Step 1: Install Docker + Git
print('='*60)
print('STEP 1/4: Install Docker & Git')
print('='*60)
run('yum install -y yum-utils git curl 2>&1 | tail -5 && '
    'yum-config-manager --add-repo https://mirrors.aliyun.com/docker-ce/linux/centos/docker-ce.repo 2>&1 | tail -2 && '
    'yum install -y docker-ce docker-ce-cli containerd.io 2>&1 | tail -3 && '
    '/usr/bin/systemctl enable --now docker && '
    'docker --version', 300)

# Docker Compose
print('\n--- Docker Compose ---')
run('mkdir -p /usr/local/lib/docker/cli-plugins && '
    'curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 -o /usr/local/lib/docker/cli-plugins/docker-compose && '
    'chmod +x /usr/local/lib/docker/cli-plugins/docker-compose && '
    'docker compose version', 180)

# Step 2: Clone project
print('\n' + '='*60)
print('STEP 2/4: Clone Project from GitHub')
print('='*60)
run('cd /root && rm -rf multi_agent 2>/dev/null; git clone https://github.com/jingcaisky/code-world.git multi_agent 2>&1 | tail -5 && ls /root/multi_agent/', 120)

# Step 3: Create .env
print('\n' + '='*60)
print('STEP 3/4: Create .env config')
print('='*60)
run("""
cd /root/multi_agent
SK=$(openssl rand -hex 32)
AK=$(openssl rand -hex 32)
DP=$(openssl rand -hex 16)
RP=$(openssl rand -hex 16)
FP=$(openssl rand -hex 16)
cat > backend/.env << ENVEOF
PROJECT_NAME=multi_agent
DEBUG=false
DB_ECHO=false
ENVIRONMENT=production
TIMEZONE=Asia/Shanghai
MODELS_CACHE_DIR=./models_cache
LOGFIRE_TOKEN=
LOGFIRE_SERVICE_NAME=multi_agent
LOGFIRE_ENVIRONMENT=production
POSTGRES_HOST=db
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=${DP}
POSTGRES_DB=multi_agent
SECRET_KEY=${SK}
ACCESS_TOKEN_EXPIRE_MINUTES=10080
ALGORITHM=HS256
API_KEY=${AK}
API_KEY_HEADER=X-API-Key
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=${RP}
REDIS_DB=0
RAG_DEFAULT_COLLECTION=documents
RAG_TOP_K=10
RAG_CHUNK_SIZE=512
RAG_CHUNK_OVERLAP=50
RAG_CHUNKING_STRATEGY=recursive
RAG_HYBRID_SEARCH=false
RAG_ENABLE_OCR=false
FLOWER_USER=admin
FLOWER_PASSWORD=${FP}
NEXT_PUBLIC_API_URL=http://47.101.42.53:8000
NEXT_PUBLIC_WS_URL=ws://47.101.42.53:8000
NEXT_PUBLIC_SITE_URL=http://47.101.42.53:3000
NEXT_PUBLIC_MAX_UPLOAD_SIZE_MB=50
NEXT_PUBLIC_OAUTH_PROVIDERS=google
NEXT_PUBLIC_RAG_ENABLED=true
DOMAIN=47.101.42.53
ENVEOF
echo "ENV ready"
grep "^POSTGRES" backend/.env | sed 's/=/: ***/'
""", 30)

c.close()
print('\n=== Phase 1 DONE ===\nNow running Phase 2 (build & start)...')

# Reconnect for long build
time.sleep(2)
c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('47.101.42.53', username='root', password='LVm.4fr,dx_TkWk', timeout=20, allow_agent=False, look_for_keys=False)

# Step 4: Build and Start
print('='*60)
print('STEP 4/4: Build & Start Services (this takes a while)')
print('='*60)
run('cd /root/multi_agent && docker compose --env-file backend/.env -f docker-compose.prod.yml build --no-cache 2>&1', 600)

print('\n--- Starting containers ---')
run('cd /root/multi_agent && docker compose --env-file backend/.env -f docker-compose.prod.yml up -d --force-recreate 2>&1', 120)

# Wait and check
print('\nWaiting 35s for startup...')
time.sleep(35)

print('='*60)
print('FINAL STATUS')
print('='*60)
run('docker ps --format "table {{.Names}}\\t{{.Status}}\\t{{.Ports}}"', 15)
run('ss -tlnp | grep -E ":(3000|8000) "', 10)
run('free -m', 10)
run('docker logs multi_agent_backend --tail 15 2>&1', 15)
run('docker logs multi_agent_frontend --tail 10 2>&1', 15)

c.close()
print('\n=== DEPLOY COMPLETE ===')
