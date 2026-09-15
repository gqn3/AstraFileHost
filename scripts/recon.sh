#!/usr/bin/env bash
# READ ONLY. Run before approving any server resource boundary.
set -u
printf '\nOS\n'; uname -a; cat /etc/os-release
printf '\nCPU AND MEMORY\n'; lscpu; free -b; uptime
printf '\nDISKS\n'; lsblk -o NAME,SIZE,FSTYPE,MOUNTPOINTS; df -B1 -T; findmnt -o TARGET,SOURCE,FSTYPE,OPTIONS
printf '\nNETWORK\n'; ip -brief address; ip route
for iface in /sys/class/net/*; do
  printf '%s speed: ' "$(basename "$iface")"
  cat "$iface/speed" 2>/dev/null || true
done
printf '\nLISTENING PORTS\n'; ss -lntup
printf '\nDOCKER\n'
if command -v docker >/dev/null; then
  docker version --format '{{.Server.Version}}'
  docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'
  docker network ls
  docker stats --no-stream --format '{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}'
fi
printf '\nSERVICES\n'; systemctl list-units --type=service --state=running --no-pager
printf '\nPROCESSES (NO COMMAND ARGUMENTS)\n'; ps -eo pid,user,comm,%cpu,%mem --sort=-%mem | head -35
printf '\nPROXY/DB BINARIES\n'; command -v nginx caddy apache2 httpd psql redis-server mysqld || true
printf '\nFIREWALL\n'
if command -v ufw >/dev/null; then ufw status verbose; fi
if command -v nft >/dev/null; then nft list ruleset; fi
printf '\nPROPOSED PATH OWNERSHIP\n'
for directory in /opt/astrafile /srv/astrafile; do
  if [ -e "$directory" ]; then stat -c '%n %U %G %a' "$directory"; ls -la "$directory"; else printf '%s does not exist\n' "$directory"; fi
done
printf '\nPROJECT USER\n'; getent passwd astrafile || true
