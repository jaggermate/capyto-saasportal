# Repository Guidelines

## Project Structure & Module Organization
Top-level `frontend/` contains the React 18 + Vite UI (Tailwind config, `src/` views, `vite.config.ts`), while `backend/` hosts the FastAPI service (`main.py`, `employees.json`, `requirements.txt`). Root artifacts such as `docker-compose.yml` wire Postgres → API → UI, and `readme.md` captures feature scope. Keep mock data and static assets lean so diffs stay reviewable.

## Build, Test, and Development Commands
- Backend: `python -m venv .venv && source .venv/bin/activate && pip install -r backend/requirements.txt`, then `uvicorn backend.main:app --reload --port 8000`.  
- Frontend dev: `cd frontend && npm install && npm run dev -- --host 0.0.0.0`.  
- Frontend build/preview: `npm run build` and `npm run preview`.  
- Docker: `docker compose up --build` to bring up Postgres, API, and UI together.  
Spot-check with `curl http://localhost:8000/health` and visit `http://localhost:5173`.

## Coding Style & Naming Conventions
Python code should follow PEP 8 with type hints; prefer explicit Pydantic models, snake_case functions, and keep endpoint groups cohesive within `main.py`. React files live under `frontend/src`—use PascalCase for components, camelCase hooks/utilities, and keep Tailwind class lists readable (extract helpers once strings get noisy). Format JSON with two spaces, TS/JS with Prettier defaults (2 spaces, single quotes) even though a formal linter is not yet wired.

## Testing Guidelines
No automated suite exists yet, so add targeted tests with new logic (`backend/tests/` + `pytest`, or `frontend/src/__tests__/` with your preferred runner). Until that lands, manually exercise key flows: `GET /health`, employee save, company settings, payroll run, and record screenshots or console traces in the PR.

## Commit & Pull Request Guidelines
Follow the current history style—single-line, imperative subjects (`Add support for fixed crypto conversion amounts`). Keep backend and frontend changes in separate commits when practical, squash noisy WIP before review, and reference issue IDs. PRs should cover what changed, how it was tested, any env vars/config migrations, and screenshots or GIFs when UI shifts.

## Configuration & Secrets
Keep credentials in untracked `.env` files that mirror backend expectations (`CMC_API_KEY`, `DATABASE_URL`) and never embed them in commits. Frontend builds read `VITE_API_BASE`; set it per environment (`.env.local`) so static assets find the right API host. If you rely on Docker, override Postgres secrets or disable the DB service when staying in the in-memory mode spotlighted in `main.py`.
