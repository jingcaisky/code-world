import os
import secrets
import sys
import tarfile
import tempfile
import time
import paramiko

# Remote Server Details
HOST = '120.26.144.55'
PORT = 22
USER = 'root'
PASSWORD = 'LVm.4fr,dx_TkWk'
REMOTE_DIR = '/root/multi_agent'

def safe_print(text):
    try:
        sys.stdout.write(text)
        sys.stdout.flush()
    except UnicodeEncodeError:
        encoding = sys.stdout.encoding or 'utf-8'
        sys.stdout.write(text.encode(encoding, errors='replace').decode(encoding))
        sys.stdout.flush()

def create_tarball(source_dir, output_path):
    print("[PACK] Packing project files...")
    exclude_dirs = {
        '.git', 'node_modules', '.next', '.venv', '__pycache__', 
        '.gemini', '.agents', '.pytest_cache', 'models_cache'
    }
    with tarfile.open(output_path, "w:gz") as tar:
        for root, dirs, files in os.walk(source_dir):
            # Exclude unwanted directories
            dirs[:] = [d for d in dirs if d not in exclude_dirs]
            for file in files:
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, source_dir)
                # Skip environment files and the deployment script itself
                if rel_path.startswith('.env') or 'deploy.py' in rel_path or 'multi_agent.tar.gz' in rel_path:
                    continue
                tar.add(full_path, arcname=rel_path)
    print(f"[OK] Project packed successfully into {output_path}")

def upload_and_deploy():
    local_dir = os.path.dirname(os.path.abspath(__file__))
    temp_tar = tempfile.mktemp(suffix=".tar.gz")
    create_tarball(local_dir, temp_tar)
    
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    print(f"[SSH] Connecting to remote server {HOST}:{PORT}...")
    ssh.connect(HOST, port=PORT, username=USER, password=PASSWORD)
    
    # Open SFTP
    sftp = ssh.open_sftp()
    
    # Ensure remote directory exists
    print("[DIR] Preparing remote directory...")
    ssh.exec_command(f"mkdir -p {REMOTE_DIR}")
    
    # Upload tarball
    remote_tar = f"{REMOTE_DIR}/multi_agent.tar.gz"
    print(f"[SFTP] Uploading archive to {remote_tar}...")
    sftp.put(temp_tar, remote_tar)
    sftp.close()
    
    # Cleanup local temp tar
    if os.path.exists(temp_tar):
        os.remove(temp_tar)
        
    print("[SSH] Extracting archive on remote server...")
    stdin, stdout, stderr = ssh.exec_command(f"tar -xzf {remote_tar} -C {REMOTE_DIR} && rm {remote_tar}")
    exit_status = stdout.channel.recv_exit_status()
    if exit_status != 0:
        print(f"[ERROR] Failed to extract archive: {stderr.read().decode()}")
        sys.exit(1)
        
    # Generate production environment secrets
    print("[CONFIG] Generating production environment variables...")
    postgres_password = secrets.token_hex(16)
    redis_password = secrets.token_hex(16)
    secret_key = secrets.token_hex(32)
    api_key = secrets.token_hex(32)
    
    # Read backend/.env.example as base config
    local_env_example = os.path.join(local_dir, "backend", ".env.example")
    with open(local_env_example, "r", encoding="utf-8") as f:
        env_content = f.read()
        
    # Modify variables for production
    prod_env = []
    for line in env_content.splitlines():
        if line.startswith("DEBUG="):
            prod_env.append("DEBUG=false")
        elif line.startswith("ENVIRONMENT="):
            prod_env.append("ENVIRONMENT=production")
        elif line.startswith("POSTGRES_HOST="):
            prod_env.append("POSTGRES_HOST=db")
        elif line.startswith("POSTGRES_PASSWORD="):
            prod_env.append(f"POSTGRES_PASSWORD={postgres_password}")
        elif line.startswith("REDIS_HOST="):
            prod_env.append("REDIS_HOST=redis")
        elif line.startswith("REDIS_PASSWORD="):
            prod_env.append(f"REDIS_PASSWORD={redis_password}")
        elif line.startswith("SECRET_KEY="):
            prod_env.append(f"SECRET_KEY={secret_key}")
        elif line.startswith("API_KEY="):
            prod_env.append(f"API_KEY={api_key}")
        elif line.startswith("CELERY_BROKER_URL="):
            prod_env.append(f"CELERY_BROKER_URL=redis://:{redis_password}@redis:6379/0")
        elif line.startswith("CELERY_RESULT_BACKEND="):
            prod_env.append(f"CELERY_RESULT_BACKEND=redis://:{redis_password}@redis:6379/0")
        elif line.startswith("CORS_ORIGINS="):
            prod_env.append(f'CORS_ORIGINS=["http://{HOST}:3000"]')
        elif line.startswith("DOMAIN="):
            prod_env.append(f"DOMAIN={HOST}")
        else:
            prod_env.append(line)
            
    # Add frontend Next.js environment build args
    prod_env.append("\n# === Frontend Build Arguments ===")
    prod_env.append(f"NEXT_PUBLIC_API_URL=http://{HOST}:8000")
    prod_env.append(f"NEXT_PUBLIC_WS_URL=ws://{HOST}:8000")
    prod_env.append(f"NEXT_PUBLIC_SITE_URL=http://{HOST}:3000")
    prod_env.append(f"NEXT_PUBLIC_RAG_ENABLED=true")
    
    # Write to temp local file, upload to backend/.env
    temp_env = tempfile.mktemp()
    with open(temp_env, "w", encoding="utf-8") as f:
        f.write("\n".join(prod_env))
        
    sftp = ssh.open_sftp()
    sftp.put(temp_env, f"{REMOTE_DIR}/backend/.env")
    sftp.close()
    if os.path.exists(temp_env):
        os.remove(temp_env)
        
    print("[DOCKER] Deploying via Docker Compose (building images on ECS)...")
    # Pull down existing and run up with build
    cmd = (
        f"cd {REMOTE_DIR} && "
        f"docker compose --env-file backend/.env -f docker-compose.prod.yml down && "
        f"docker compose --env-file backend/.env -f docker-compose.prod.yml up -d --build"
    )
    stdin, stdout, stderr = ssh.exec_command(cmd)
    
    # Read stdout in real-time
    while True:
        line = stdout.readline()
        if not line:
            break
        safe_print(line)
        
    exit_status = stdout.channel.recv_exit_status()
    if exit_status != 0:
        print("[ERROR] Docker Compose deployment failed!")
        print(stderr.read().decode())
        sys.exit(1)
        
    print("[WAIT] Waiting 15 seconds for services to initialize and DB to become healthy...")
    time.sleep(15)
    
    print("[MIGRATE] Running database migrations...")
    migrate_cmd = (
        f"cd {REMOTE_DIR} && "
        f"docker compose --env-file backend/.env -f docker-compose.prod.yml exec -T app "
        f"multi_agent db upgrade"
    )
    stdin, stdout, stderr = ssh.exec_command(migrate_cmd)
    while True:
        line = stdout.readline()
        if not line:
            break
        safe_print(line)
    exit_status = stdout.channel.recv_exit_status()
    if exit_status != 0:
        print("[ERROR] Database migrations failed!")
        print(stderr.read().decode())
        sys.exit(1)
        
    print("[ADMIN] Seeding first admin account (admin@multi-agent.local / admin123)...")
    admin_cmd = (
        f"cd {REMOTE_DIR} && "
        f"docker compose --env-file backend/.env -f docker-compose.prod.yml exec -T app "
        f"multi_agent user create --email admin@multi-agent.local --password admin123 --superuser"
    )
    stdin, stdout, stderr = ssh.exec_command(admin_cmd)
    while True:
        line = stdout.readline()
        if not line:
            break
        safe_print(line)
    exit_status = stdout.channel.recv_exit_status()
    if exit_status != 0:
        # Check if it failed because user already exists, which is acceptable
        err_msg = stderr.read().decode()
        if "already exists" in err_msg or "AlreadyExistsError" in err_msg:
            print("[INFO] Admin user already exists. Skipping creation.")
        else:
            print("[ERROR] Seeding admin account failed!")
            print(err_msg)
            sys.exit(1)
        
    print("\n" + "="*50)
    print("DEPLOYMENT SUCCESSFUL!")
    print(f"Frontend URL: http://{HOST}:3000")
    print(f"Backend API URL: http://{HOST}:8000")
    print("Admin account details:")
    print("   Email: admin@multi-agent.local")
    print("   Password: admin123")
    print("="*50)
    
    ssh.close()

if __name__ == '__main__':
    upload_and_deploy()
