#!/usr/bin/env python3
"""Install only the explicit, user-approved IP challenge routing exception."""
import argparse,hashlib,ipaddress,pathlib,subprocess
parser=argparse.ArgumentParser()
parser.add_argument('--host',required=True,help='Public IP address for this deployment')
args=parser.parse_args()
public_ip=str(ipaddress.ip_address(args.host))
app=pathlib.Path('/opt/astrafile');data=pathlib.Path('/srv/astrafile')
marker='AstraFileHost:v1:isolated-project'
for root in [app,data]:
    if root.is_symlink() or (root/'.astrafile-owned').read_text()!=marker:raise SystemExit('Unverified AstraFile scope')
target=pathlib.Path('/etc/nginx/conf.d/astrafile-acme.conf')
if target.exists() or target.is_symlink():raise SystemExit('ACME route already exists; inspect before updating')
source=pathlib.Path(__file__).resolve().parent.parent/'infra/reverse-proxy/astrafile-acme.conf'
old={str(p):hashlib.sha256(p.read_bytes()).hexdigest() for p in pathlib.Path('/etc/nginx/sites-enabled').glob('*') if p.is_file()}
(data/'acme/.well-known/acme-challenge').mkdir(parents=True,mode=0o755)
# Permit path traversal only; storage/backups retain their restrictive child modes.
data.chmod(0o751)
for name in ['acme','acme/.well-known','acme/.well-known/acme-challenge']:(data/name).chmod(0o755)
for name in ['acme-config','acme-work','acme-logs']:(app/name).mkdir(mode=0o700)
with target.open('xb') as out:out.write(source.read_text().replace('__PUBLIC_IP__',public_ip).encode())
try:subprocess.run(['nginx','-t'],check=True)
except Exception:
    target.unlink();raise
subprocess.run(['systemctl','reload','nginx'],check=True)
assert all(hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()==digest for p,digest in old.items())
(data/'acme/.well-known/acme-challenge/astrafile-routing-verification').write_text('AstraFile isolated ACME route\n')
print('Installed approved IP-only ACME route; graceful reload succeeded; existing vhost hashes unchanged.')
