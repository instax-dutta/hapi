#!/bin/sh
# The one entry point for scheduled refreshes. Cron and the systemd timer both
# call this, so the token path and the lock live in exactly one place.
set -eu

TOKEN_FILE=${HAPI_TOKEN_FILE:-/home/tejes/.config/hapi/hf_token}
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

if [ ! -r "$TOKEN_FILE" ]; then
  echo "hapi refresh: the Hugging Face token file is not readable" >&2
  exit 1
fi

cd "$ROOT"
HF_TOKEN=$(cat "$TOKEN_FILE")
export HF_TOKEN
# A dropped cron is covered by the timer and vice versa. The lock makes a
# overlapping trigger a no-op instead of two crawls against the Hub.
exec flock -n data/refresh.lock npm run refresh:server
