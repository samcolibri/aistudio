#!/bin/bash
set -e
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║   SimpleNursing AI Studio                            ║"
echo "║   Veo3 + Imagen4 + Fish Audio + Remotion + Temporal  ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# 1. Temporal server
echo "[1/3] Starting Temporal server..."
docker compose -f temporal/docker-compose.yml up -d
echo "      → http://localhost:8080"
sleep 4

# 2. Temporal worker
echo "[2/3] Starting NurseForge worker..."
tsx src/worker.ts &
WORKER_PID=$!
echo "      PID: $WORKER_PID"

# 3. Scheduler
echo "[3/3] Starting Airtable scheduler (every 30min)..."
tsx src/scheduler.ts &
SCHED_PID=$!
echo "      PID: $SCHED_PID"

echo ""
echo "Running. Commands:"
echo "  npm run list                           — briefs ready to produce"
echo "  npm run trigger                        — produce top-ranked brief"
echo "  npm run trigger -- --rank 3            — produce rank 3"
echo "  npm run approve:creative <workflowId>  — signal Chad approval"
echo "  npm run remotion:studio                — preview compositions"
echo ""
trap "kill $WORKER_PID $SCHED_PID 2>/dev/null; docker compose -f temporal/docker-compose.yml down" EXIT
wait
