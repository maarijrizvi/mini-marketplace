#!/bin/sh
set -e
case "$1" in
  api)
    alembic upgrade head
    python -m app.seed
    exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers "${API_WORKERS:-2}" --proxy-headers --forwarded-allow-ips='*'
    ;;
  worker)
    exec procrastinate --app=app.jobs.worker.app worker --concurrency "${WORKER_CONCURRENCY:-4}"
    ;;
  *)
    exec "$@"
    ;;
esac
