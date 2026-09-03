#!/bin/bash
# Beam project boot script — executed by the sandbox /start.sh at container boot
# (replaces the default bun+mini-services flow, so it must do everything).
set -e
cd /home/z/my-project

echo "[zscripts/dev.sh] installing deps..."
sudo -u z bun install || true

echo "[zscripts/dev.sh] pushing prisma schema..."
sudo -u z bun run db:push || true

echo "[zscripts/dev.sh] starting Next.js dev server on :3000..."
sudo -u z bun run dev &

# Wait for :3000
for i in $(seq 1 60); do
  curl -s --connect-timeout 2 --max-time 5 http://localhost:3000 > /dev/null 2>&1 && break
  sleep 1
done

# Start every mini-service (session-service etc.)
MINI_SERVICES_DIR="/home/z/my-project/mini-services"
if [ -d "$MINI_SERVICES_DIR" ]; then
  for service_dir in "$MINI_SERVICES_DIR"/*; do
    if [ -f "$service_dir/package.json" ] && grep -q '"dev"' "$service_dir/package.json"; then
      service_name=$(basename "$service_dir")
      echo "[zscripts/dev.sh] starting mini-service: $service_name"
      (
        cd "$service_dir"
        sudo -u z bun install || true
        sudo -u z bun run dev
      ) > "/tmp/mini-service-${service_name}.log" 2>&1 &
    fi
  done
fi

wait
