# CrypSide Service Matrix (Step 1 + Step 2)

PM2 home target for this deployment:

- `PM2_HOME=/home/idona/.pm2`

Env file target for all services:

- `/home/idona/MoStar/CrypSide/.env`

Restart policy baseline for all services:

- `autorestart: true`
- `max_restarts: 20`
- `restart_delay: 5000`
- `watch: false`

| service name | source IdimIkang role | CrypSide target path | entry command | env file | port | PM2_HOME | restart policy | logs path |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `crypside-api` | observer API/status/ws and control plane (`idim-api`) | `/home/idona/MoStar/CrypSide` | `/home/idona/MoStar/CrypSide/observer_bundle/.venv/bin/python -m uvicorn api:app --host 127.0.0.1 --port 8787` | `/home/idona/MoStar/CrypSide/.env` | `8787` | `/home/idona/.pm2` | `autorestart=true, max_restarts=20, restart_delay=5000` | `/home/idona/MoStar/CrypSide/logs/pm2/crypside-api-*.log` |
| `crypside-scanner` | sovereign scanner lineage (`idim-scanner`) | `/home/idona/MoStar/CrypSide/observer_bundle` | `/home/idona/MoStar/CrypSide/observer_bundle/.venv/bin/python scanner.py` | `/home/idona/MoStar/CrypSide/.env` | `n/a` | `/home/idona/.pm2` | `autorestart=true, max_restarts=20, restart_delay=5000` | `/home/idona/MoStar/CrypSide/logs/pm2/crypside-scanner-*.log` |
| `crypside-outcome-tracker` | outcome settlement loop (`idim-outcome-tracker`) | `/home/idona/MoStar/CrypSide/observer_bundle` | `/home/idona/MoStar/CrypSide/observer_bundle/.venv/bin/python outcome_tracker.py --loop` | `/home/idona/MoStar/CrypSide/.env` | `n/a` | `/home/idona/.pm2` | `autorestart=true, max_restarts=20, restart_delay=5000` | `/home/idona/MoStar/CrypSide/logs/pm2/crypside-outcome-tracker-*.log` |
| `crypside-funding-collector` | derivatives funding telemetry (`funding-collector`) | `/home/idona/MoStar/CrypSide/observer_bundle` | `/home/idona/MoStar/CrypSide/observer_bundle/.venv/bin/python funding_collector.py` | `/home/idona/MoStar/CrypSide/.env` | `n/a` | `/home/idona/.pm2` | `autorestart=true, max_restarts=20, restart_delay=5000` | `/home/idona/MoStar/CrypSide/logs/pm2/crypside-funding-collector-*.log` |
| `crypside-oi-collector` | open interest telemetry (`oi-collector`) | `/home/idona/MoStar/CrypSide/observer_bundle` | `/home/idona/MoStar/CrypSide/observer_bundle/.venv/bin/python oi_collector.py` | `/home/idona/MoStar/CrypSide/.env` | `n/a` | `/home/idona/.pm2` | `autorestart=true, max_restarts=20, restart_delay=5000` | `/home/idona/MoStar/CrypSide/logs/pm2/crypside-oi-collector-*.log` |
| `crypside-ls-ratio-collector` | long/short ratio telemetry (`ls-ratio-collector`) | `/home/idona/MoStar/CrypSide/observer_bundle` | `/home/idona/MoStar/CrypSide/observer_bundle/.venv/bin/python ls_ratio_collector.py` | `/home/idona/MoStar/CrypSide/.env` | `n/a` | `/home/idona/.pm2` | `autorestart=true, max_restarts=20, restart_delay=5000` | `/home/idona/MoStar/CrypSide/logs/pm2/crypside-ls-ratio-collector-*.log` |
| `crypside-frontend` | Next.js dashboard shell (`idim-dashboard`) | `/home/idona/MoStar/CrypSide` | `npm run dev -- --hostname 127.0.0.1 --port 3000` | `/home/idona/MoStar/CrypSide/.env` | `3000` | `/home/idona/.pm2` | `autorestart=true, max_restarts=20, restart_delay=5000` | `/home/idona/MoStar/CrypSide/logs/pm2/crypside-frontend-*.log` |
