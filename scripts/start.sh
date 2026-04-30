#!/bin/bash
set -e

echo "=== AI Studio — SimpleNursing ==="
echo ""

# Start Temporal server
echo "[1/3] Starting Temporal server..."
docker compose -f temporal/docker-compose.yml up -d
echo "      Temporal UI → http://localhost:8080"
sleep 3

# Start worker in background
echo "[2/3] Starting Temporal worker..."
tsx src/worker.ts &
WORKER_PID=$!
echo "      Worker PID: $WORKER_PID"

# Start scheduler in background
echo "[3/3] Starting Airtable scheduler (polls every 30min)..."
tsx src/scheduler.ts &
SCHEDULER_PID=$!
echo "      Scheduler PID: $SCHEDULER_PID"

echo ""
echo "All services running. Press Ctrl+C to stop."
echo ""
echo "Commands:"
echo "  npm run list              — list approved briefs ready to produce"
echo "  npm run trigger           — produce top-ranked brief"
echo "  npm run trigger <id>      — produce specific Airtable record"
echo ""

trap "kill $WORKER_PID $SCHEDULER_PID 2>/dev/null; docker compose -f temporal/docker-compose.yml down" EXIT
wait
