#!/usr/bin/env python3
"""Read-only baseline for verifying the reviewed server isolation boundary."""
import hashlib,json,pathlib,subprocess,time
def run(*args):
    return subprocess.check_output(args,text=True).strip()
configs={}
for directory in ['/etc/nginx/sites-enabled','/etc/nginx/conf.d']:
    for item in pathlib.Path(directory).glob('*'):
        if item.is_file() and not item.name.startswith('astrafile'):
            configs[str(item)]=hashlib.sha256(item.read_bytes()).hexdigest()
containers=[]
for identifier in run('docker','ps','-q').splitlines():
    c=json.loads(run('docker','inspect',identifier))[0]
    if not c['Name'].lstrip('/').startswith('astrafile'):
        containers.append({'name':c['Name'],'id':c['Id'],'image':c['Image'],'startedAt':c['State']['StartedAt'],'status':c['State']['Status'],'health':c['State'].get('Health',{}).get('Status')})
services={name:run('systemctl','show',name,'--property=MainPID,ActiveState,ExecMainStartTimestamp') for name in ['nginx','pm2-ubuntu','docker','ssh']}
print(json.dumps({'at':time.time(),'hostname':run('hostname'),'nginxConfigHashes':configs,'containers':containers,'services':services,'freeBytes':int(run('df','-B1','--output=avail','/srv').splitlines()[-1])},indent=2))
