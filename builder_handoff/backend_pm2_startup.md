# CrypSide Backend PM2 Startup

## Objective
Start CrypSide backend as a PM2-owned uvicorn process. Do not start backend manually with raw `uvicorn`. PM2 must own it.

## Target File
`/home/idona/MoStar/CrypSide/ecosystem.config.js`

## Required crypside-api Config

```js
{
  name: "crypside-api",
  cwd: "/home/idona/MoStar/CrypSide",
  script: "/home/idona/MoStar/CrypSide/.venv/bin/python3.12",
  args: "-m uvicorn api:app --host 127.0.0.1 --port 8787",
  interpreter: "none",
  autorestart: true,
  max_restarts: 10,
  restart_delay: 3000,
  env: {
    PYTHONUNBUFFERED: "1",
    PORT: "8787"
  }
}
```

## Execution Sequence

```bash
cd /home/idona/MoStar/CrypSide

PM2_HOME=/home/idona/.pm2 pm2 delete crypside-api
PM2_HOME=/home/idona/.pm2 pm2 start ecosystem.config.js --only crypside-api
PM2_HOME=/home/idona/.pm2 pm2 save
```

## Verification Commands

```bash
PM2_HOME=/home/idona/.pm2 pm2 describe crypside-api
PM2_HOME=/home/idona/.pm2 pm2 list
ss -ltnp | grep 8787
curl -s http://127.0.0.1:8787/status
```

## Success Conditions

- `crypside-api` = online in PM2
- `8787` = listening
- `/status` = returns JSON
- Backend survives terminal close
