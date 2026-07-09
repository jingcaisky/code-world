import paramiko
import time

c = paramiko.SSHClient()
c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
c.connect('120.26.144.55', username='root', password='LVm.4fr,dx_TkWk', timeout=20)

def run(cmd, t=30):
    print(f'>>> {cmd[:100]}')
    i, o, e = c.exec_command(cmd, timeout=t)
    out = (o.read() or b'').decode(errors='replace')
    err = (e.read() or b'').decode(errors='replace')
    if out.strip(): print(out[:2000])
    if err.strip(): print(f'ERR: {err[:300]}')

# Step 1: Check .env exists
print('=== Check .env ===')
run('cat /root/multi_agent/backend/.env | head -5', 10)

# Step 2: Apply optimized docker-compose.prod.yml
print('\n=== Apply optimized config ===')
run("""
cd /root/multi_agent
cat > docker-compose.prod.yml << 'COMPEOF'
# Production configuration (optimized for 2vCPU/4GB)
services:

  app:
    build:
      context: ./backend
      dockerfile: Dockerfile
    image: multi_agent_backend:dev
    container_name: multi_agent_backend
    volumes:
      - media_data:/app/media
      - ./emails:/app/emails:ro
    env_file:
      - ./backend/.env
    environment:
      - DEBUG=false
      - ENVIRONMENT=production
      - POSTGRES_HOST=db
      - REDIS_HOST=redis
      - CELERY_BROKER_URL=redis://:${REDIS_PASSWORD}@redis:6379/0
      - CELERY_RESULT_BACKEND=redis://:${REDIS_PASSWORD}@redis:6379/0
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 2
    networks:
      - backend-internal
    ports:
      - "8000:8000"
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    deploy:
      resources:
        limits:
          cpus: '0.75'
          memory: 384M
        reservations:
          cpus: '0.25'
          memory: 128M

  db:
    image: postgres:16-alpine
    container_name: multi_agent_db
    environment:
      - POSTGRES_USER=${POSTGRES_USER:-postgres}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - POSTGRES_DB=${POSTGRES_DB:-multi_agent}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - backend-internal
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-postgres}"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M

  redis:
    image: redis:7-alpine
    container_name: multi_agent_redis
    command: redis-server --requirepass ${REDIS_PASSWORD:?REDIS_PASSWORD is required}
    volumes:
      - redis_data:/data
    networks:
      - backend-internal
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    deploy:
      resources:
        limits:
          cpus: '0.25'
          memory: 128M

  celery_worker:
    image: multi_agent_backend:dev
    volumes:
      - media_data:/app/media
      - ./emails:/app/emails:ro
    command: celery -A app.worker.celery_app worker --loglevel=warning --concurrency=1
    env_file:
      - ./backend/.env
    environment:
      - DEBUG=false
      - REDIS_HOST=redis
      - CELERY_BROKER_URL=redis://:${REDIS_PASSWORD}@redis:6379/0
      - CELERY_RESULT_BACKEND=redis://:${REDIS_PASSWORD}@redis:6379/0
    networks:
      - backend-internal
    depends_on:
      app:
        condition: service_started
      redis:
        condition: service_healthy
      db:
        condition: service_healthy
    restart: unless-stopped
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 256M
        reservations:
          cpus: '0.25'
          memory: 128M

  celery_beat:
    image: multi_agent_backend:dev
    container_name: multi_agent_celery_beat
    command: celery -A app.worker.celery_app beat --loglevel=warning
    env_file:
      - ./backend/.env
    environment:
      - DEBUG=false
      - REDIS_HOST=redis
      - CELERY_BROKER_URL=redis://:${REDIS_PASSWORD}@redis:6379/0
      - CELERY_RESULT_BACKEND=redis://:${REDIS_PASSWORD}@redis:6379/0
    networks:
      - backend-internal
    depends_on:
      app:
        condition: service_started
      redis:
        condition: service_healthy
    restart: unless-stopped
    deploy:
      resources:
        limits:
          cpus: '0.125'
          memory: 64M

  flower:
    image: multi_agent_backend:dev
    container_name: multi_agent_flower
    command: celery -A app.worker.celery_app flower --port=5555
    env_file:
      - ./backend/.env
    environment:
      - DEBUG=false
      - REDIS_HOST=redis
      - CELERY_BROKER_URL=redis://:${REDIS_PASSWORD}@redis:6379/0
      - CELERY_RESULT_BACKEND=redis://:${REDIS_PASSWORD}@redis:6379/0
      - FLOWER_BASIC_AUTH=${FLOWER_USER:-admin}:${FLOWER_PASSWORD:?FLOWER_PASSWORD is required}
    networks:
      - backend-internal
    ports:
      - "5555:5555"
    depends_on:
      app:
        condition: service_started
      redis:
        condition: service_healthy
    restart: unless-stopped
    deploy:
      resources:
        limits:
          cpus: '0.125'
          memory: 64M

  frontend:
    image: multi_agent_frontend:dev
    build:
      context: ./frontend
      dockerfile: Dockerfile
      args:
        - NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL:-http://120.26.144.55:8000}
        - NEXT_PUBLIC_WS_URL=${NEXT_PUBLIC_WS_URL:-ws://120.26.144.55:8000}
        - NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL:-http://120.26.144.55:3000}
        - NEXT_PUBLIC_MAX_UPLOAD_SIZE_MB=50
        - NEXT_PUBLIC_OAUTH_PROVIDERS=google
        - NEXT_PUBLIC_RAG_ENABLED=true
    container_name: multi_agent_frontend
    environment:
      - NODE_ENV=production
      - BACKEND_URL=http://app:8000
      - BACKEND_WS_URL=ws://app:8000
    networks:
      - backend-internal
    ports:
      - "3000:3000"
    depends_on:
      - app
    restart: unless-stopped
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 256M

networks:
  backend-internal:
    driver: bridge

volumes:
  media_data:
  postgres_data:
  redis_data:
COMPEOF
echo 'Config written'
""", 15)

# Step 3: Build and start
print('\n=== Build images ===')
run('cd /root/multi_agent && docker compose --env-file backend/.env -f docker-compose.prod.yml build --no-cache 2>&1', 300)

print('\n=== Start services ===')
run('cd /root/multi_agent && docker compose --env-file backend/.env -f docker-compose.prod.yml up -d --force-recreate 2>&1', 120)

# Step 4: Wait and check
print('\nWaiting 30s...')
time.sleep(30)

print('\n=== Status ===')
run('docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"', 10)

print('\n=== Backend log (last 20) ===')
run('docker logs multi_agent_backend --tail 20 2>&1', 10)

print('\n=== Memory ===')
run('free -m', 10)

c.close()
print('\n=== DONE ===')
