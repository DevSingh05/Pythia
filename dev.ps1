# Pythia — Dev launcher
# Opens three terminals: pricing service, market-data service, frontend
# Run from repo root: .\dev.ps1

$root = $PSScriptRoot

# ── 1. Pricing Service (Python/FastAPI on :8000) ──────────────────────────────
Start-Process powershell -ArgumentList "-NoExit", "-Command", "
  cd '$root\backend';
  if (!(Test-Path .venv)) { python -m venv .venv }
  & .\.venv\Scripts\Activate.ps1
  pip install -r requirements.txt -q
  uvicorn main:app --host 0.0.0.0 --port 8000 --reload
"

# ── 2. Market Data Service (Bun on :3001) ─────────────────────────────────────
Start-Process powershell -ArgumentList "-NoExit", "-Command", "
  cd '$root\backend\market-data-service';
  bun install --silent
  bun run --hot --env-file='$root\.env' src/index.ts
"

# ── 3. Frontend (Next.js on :3000) ────────────────────────────────────────────
Start-Process powershell -ArgumentList "-NoExit", "-Command", "
  cd '$root\frontend';
  npm install --silent
  npm run dev
"

Write-Host ""
Write-Host "Pythia starting up:"
Write-Host "  Pricing Service  -> http://localhost:8000"
Write-Host "  Market Data      -> http://localhost:3001"
Write-Host "  Frontend         -> http://localhost:3000"
Write-Host ""
Write-Host "Close the three terminal windows to stop all services."
