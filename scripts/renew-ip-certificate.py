#!/usr/bin/env python3
"""Renew AstraFile's IP certificate and reload only its own data-plane proxy."""
import argparse,hashlib,pathlib,subprocess,os,ipaddress,shlex,re
from urllib.parse import urlparse
parser=argparse.ArgumentParser();parser.add_argument('--install-only',action='store_true');parser.add_argument('--dry-run',action='store_true');args=parser.parse_args()
app=pathlib.Path('/opt/astrafile')
if app.is_symlink() or (app/'.astrafile-owned').read_text()!='AstraFileHost:v1:isolated-project':raise SystemExit('Unverified project path')
image='certbot/certbot@sha256:f70ad0adbb7e117f0fe42a63c553f28ea451edabc0148757b6efcd9735acaa20'
if not args.install_only:
    command=['docker','run','--rm','--name','astrafile-certificate-renewal','--memory','256m','--cpus','0.5']
    for source,target in [('acme-config','/etc/letsencrypt'),('acme-work','/var/lib/letsencrypt'),('acme-logs','/var/log/letsencrypt')]:command+=['-v',f'{app/source}:{target}']
    command+=['-v','/srv/astrafile/acme:/var/www/acme',image,'renew','--cert-name','astrafile-ip','--non-interactive','--no-random-sleep-on-renew']
    if args.dry_run:command+=['--dry-run']
    subprocess.run(command,check=True)
    if args.dry_run:raise SystemExit(0)
lineage=app/'acme-config/live/astrafile-ip';cert=lineage/'fullchain.pem';key=lineage/'privkey.pem'
subprocess.run(['openssl','x509','-in',str(cert),'-checkend','3600','-noout'],check=True,stdout=subprocess.DEVNULL)
san=subprocess.check_output(['openssl','x509','-in',str(cert),'-noout','-ext','subjectAltName'],text=True)
deployment=dict(line.split('=',1) for line in (app/'deployment.env').read_text().splitlines() if '=' in line and not line.lstrip().startswith('#'))
public_ip=str(ipaddress.ip_address(urlparse(shlex.split(deployment['APP_ORIGIN'])[0]).hostname))
if public_ip not in {str(ipaddress.ip_address(value)) for value in re.findall(r'IP Address:([0-9a-fA-F:.]+)',san)}:raise SystemExit('Certificate IP mismatch')
public_cert=subprocess.check_output(['openssl','x509','-in',str(cert),'-pubkey','-noout'])
public_key=subprocess.check_output(['openssl','pkey','-in',str(key),'-pubout'])
if public_cert!=public_key:raise SystemExit('Certificate/key mismatch')
tls=app/'tls';tls.mkdir(mode=0o700,exist_ok=True)
old=(tls/'tls.crt').read_bytes() if (tls/'tls.crt').exists() else b''
changed=old!=cert.read_bytes()
if changed:
    for source,name,mode in [(cert,'tls.crt',0o644),(key,'tls.key',0o600)]:
        target=tls/(name+'.new')
        descriptor=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,mode)
        with os.fdopen(descriptor,'wb') as output:output.write(source.read_bytes());output.flush();os.fsync(output.fileno())
        target.replace(tls/name)
    running=subprocess.check_output(['docker','ps','--filter','name=^/astrafile-astrafile-proxy-1$','--format','{{.Names}}'],text=True).strip()
    if running:
        subprocess.run(['docker','exec',running,'nginx','-t'],check=True)
        subprocess.run(['docker','exec',running,'nginx','-s','reload'],check=True)
print('AstraFile certificate validated; '+('installed/updated.' if changed else 'unchanged.'))
