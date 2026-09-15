#!/bin/sh
set -eu
# Secrets are mounted exclusively for AstraFile and never echoed.
if [ -r /run/secrets/astrafile-env ]; then
  set -a
  . /run/secrets/astrafile-env
  set +a
fi
exec "$@"
