#!/usr/bin/env python3
"""Provision only the approved AstraFile namespace, after read-only reconnaissance.

Run on the target Linux server as root with --host IP_OR_DNS --release COMMIT.
This script never installs Docker, adjusts firewall rules, or touches shared proxies.
"""
import argparse, base64, hashlib, ipaddress, json, os, pathlib, re, secrets, shlex, socket, subprocess, shutil

parser=argparse.ArgumentParser()
parser.add_argument('--host',required=True)
parser.add_argument('--release',required=True)
parser.add_argument('--https-port',type=int,default=18443)
parser.add_argument('--storage-port',type=int,default=18444)
parser.add_argument('--scope-reviewed',action='store_true',required=True)
args=parser.parse_args()
if os.name!='posix' or os.geteuid()!=0: raise SystemExit('Provisioning requires Linux root within the reviewed server scope.')
if not re.fullmatch(r'[a-zA-Z0-9.-]+',args.host): raise SystemExit('Invalid public host')
if not re.fullmatch(r'[a-zA-Z0-9._-]{6,80}',args.release): raise SystemExit('Invalid release identifier')
if not all(1024<p<65536 for p in [args.https_port,args.storage_port]) or args.https_port==args.storage_port: raise SystemExit('Choose two distinct high ports')
source=pathlib.Path(__file__).resolve().parent.parent
app=pathlib.Path('/opt/astrafile');data=pathlib.Path('/srv/astrafile');marker='AstraFileHost:v1:isolated-project'
for root in [app,data]:
    if root.is_symlink(): raise SystemExit(f'Refusing symlink {root}')
    if root.exists():
        if not (root/'.astrafile-owned').is_file() or (root/'.astrafile-owned').read_text()!=marker: raise SystemExit(f'{root} has no matching ownership marker; no modifications made')
        raise SystemExit('Existing AstraFile deployment: use the documented update procedure; secrets are never overwritten')
subprocess.run(['docker','info'],check=True,stdout=subprocess.DEVNULL)
def available_port(preferred,excluded):
    for port in range(preferred,min(preferred+1000,65536)):
        if port in excluded:continue
        try:
            with socket.socket() as probe:probe.bind(('0.0.0.0',port))
            return port
        except OSError:continue
    raise SystemExit('No unused project port found; existing listeners were not changed')
args.https_port=available_port(args.https_port,set())
args.storage_port=available_port(args.storage_port,{args.https_port})
if os.statvfs('/srv').f_bavail*os.statvfs('/srv').f_frsize<40*1024**3: raise SystemExit('At least 40 GiB free is required for initial deployment validation')
for root in [app,data]:
    root.mkdir(mode=0o750);(root/'.astrafile-owned').write_text(marker)
for directory in ['secrets','config','releases','tls']:(app/directory).mkdir(mode=0o750)
release_root=app/'releases'/args.release
shutil.copytree(source,release_root,ignore=shutil.ignore_patterns('.git','.env','.env.*','.secrets','.local','node_modules','output','test-results','playwright-report','dist'))
for directory in ['storage','postgres','redis','backups','proxy-logs','tmp']:
    target=data/directory;target.mkdir(mode=0o750);os.chown(target,10001,10001)
os.chown(data,0,10001)
token=lambda:secrets.token_hex(32)
db,redis,access,secret,bootstrap=token(),token(),secrets.token_hex(16),token(),token()
origin=f'https://{args.host}:{args.https_port}'
values={'NODE_ENV':'production','HOST':'0.0.0.0','PORT':'4000','APP_ORIGIN':origin,'DATABASE_URL':f'postgresql://astrafile:{db}@astrafile-postgres:5432/astrafile','REDIS_URL':f'redis://:{redis}@astrafile-redis:6379','S3_ENDPOINT':'http://astrafile-storage:8333','S3_METRICS_ENDPOINT':'http://astrafile-storage:9324/metrics','S3_PUBLIC_ENDPOINT':origin,'S3_BUCKET':'astrafile','S3_REGION':'us-east-1','S3_ACCESS_KEY':access,'S3_SECRET_KEY':secret,'COOKIE_SECRET':token(),'BOOTSTRAP_TOKEN_HASH':hashlib.sha256(bootstrap.encode()).hexdigest(),'STORAGE_DISK_PATH':'/data-check','TRUST_PROXY':'uniquelocal','BACKUP_ENABLED':'true','BACKUP_DIR':'/backups'}
for purpose in ['EMAIL_LOOKUP_KEYS','SHARE_LOOKUP_KEYS','FIELD_ENCRYPTION_KEYS','NETWORK_PRIVACY_KEYS','BACKUP_ENCRYPTION_KEYS']:
    values[purpose]=json.dumps({'active':'v1','keys':{'v1':base64.b64encode(secrets.token_bytes(32)).decode()}},separators=(',',':'))

def write_secret(name,value,gid=10001):
    target=app/'secrets'/name
    descriptor=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o640)
    with os.fdopen(descriptor,'w') as f:f.write(value)
    os.chown(target,0,gid)
write_secret('app.env','\n'.join(f'{k}={shlex.quote(v)}' for k,v in values.items())+'\n')
write_secret('bootstrap-token',bootstrap)
write_secret('db-password',db)
write_secret('redis.conf',f'bind 0.0.0.0\nprotected-mode yes\nrequirepass {redis}\nappendonly yes\nmaxmemory 192mb\nmaxmemory-policy noeviction\n')
# The storage image drops to seaweed UID/GID 1000 before reading this file.
write_secret('s3.json',json.dumps({'identities':[{'name':'astrafile','credentials':[{'accessKey':access,'secretKey':secret}],'actions':['Admin','Read','Write','List','Tagging']}]}),gid=1000)
(app/'config'/'nginx.conf').write_bytes((source/'infra/reverse-proxy/nginx.conf').read_bytes())
(app/'deployment.env').write_text(f'ASTRAFILE_RELEASE={args.release}\nAPP_ORIGIN={origin}\nASTRAFILE_HTTPS_PORT={args.https_port}\nASTRAFILE_STORAGE_PORT={args.storage_port}\n')
try:ipaddress.ip_address(args.host);san=f'IP:{args.host}'
except ValueError:san=f'DNS:{args.host}'
subprocess.run(['openssl','req','-x509','-newkey','rsa:3072','-sha256','-nodes','-days','90','-keyout',str(app/'tls/tls.key'),'-out',str(app/'tls/tls.crt'),'-subj',f'/CN={args.host}','-addext',f'subjectAltName={san}'],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
os.chmod(app/'tls/tls.key',0o600);os.chmod(app/'tls',0o700)
ledger={'source':str(release_root),'app':str(app),'data':str(data),'project':'astrafile','ports':[args.https_port,args.storage_port],'tls':'self-signed initial certificate; replace with a trusted certificate before general public launch','firewallChanges':[],'sharedProxyChanges':[],'services':['astrafile-api','astrafile-worker','astrafile-postgres','astrafile-redis','astrafile-storage','astrafile-proxy']}
(app/'change-ledger.json').write_text(json.dumps(ledger,indent=2))
print('AstraFile-owned directories and secrets created. No secrets were printed. Build and initialize using the deployment guide.')
