# Crypto Payroll MVP

An MVP web interface for a Bitcoin/crypto payroll platform.

Tech stack
- Frontend: React + Vite + TailwindCSS (minimalist, responsive UI), Recharts for simple charts
- Backend (mock): Python FastAPI with real endpoints
- Supported cryptos: BTC, ETH, USDT, USDC
- Live prices: CoinMarketCap Pro API (preferred) with fallback to CoinGecko Pro/Demo if key provided, otherwise public CoinGecko

UI/UX enhancements (latest)
- Dark mode toggle (persisted) with polished gradients and translucent sticky header
- Smoother interactions: hover/active states, subtle elevation and motion on cards/buttons
- Loading skeletons to avoid content jank on data-heavy pages
- Richer tables with badges, striping, and better empty states
- Company page organized into tabs: Settings | Next Payroll for clearer navigation
- Employee page: address validation (BTC, ETH/USDT/USDC) and Save Profile disabled until valid addresses are saved

Features
Employee side
- Slider (0–100%) to set % of salary converted to crypto
- Form to save employee’s crypto receiving addresses per asset (company does not custody funds if address provided)
- Display accumulated BTC balance + fiat equivalent (USD/CAD)

Company side
- Dashboard listing employees (userID + chosen %)
- Settings to enter company wallet addresses for custody or pay-to-employee mode
- Show total fiat amount to convert for next payroll (mock calculation)
- Run payroll → sends request to mock third-party API with: fiat total, crypto to buy, and deposit addresses (depending on custody type)
- Transaction status: pending / confirmed (simple confirm endpoint)
- Deposits history table (date / fiat amount / crypto received / tx hash)

Crypto transactions menu
- List latest crypto payrolls: date, number of employees, tx hash, crypto value at transaction time
- Real-time portfolio value (if company holds custody)

Getting started
Prerequisites
- Node 18+
- Python 3.10+

1) Backend
- Create a virtualenv and install requirements:
  
  pip install -r backend/requirements.txt

- Optionally create a .env file in backend/ with:
  
  CMC_API_KEY=your_coinmarketcap_pro_api_key

- Run the API:
  
  uvicorn backend.main:app --reload --port 8000

- Test:
  
  curl http://localhost:8000/health

2) Frontend
- Install deps:
  
  cd frontend && npm install

- Start the dev server:
  
  npm run dev

- Open the app at the URL shown by Vite (default http://localhost:5173)

- Optional: Create a .env file in frontend to point to a different API base
  
  VITE_API_BASE=http://localhost:8000

Notes on behavior
- Persistence: The backend now stores data in PostgreSQL (DATABASE_URL). Data survives backend restarts and container redeploys.
- Payroll calculation is intentionally naive for demo purposes
- If custody is enabled, the company wallet address for the selected crypto is required to run payroll
- If custody is disabled, only employees with a non-empty address and a non-zero percent are included in the payroll run
- Live prices: The backend will attempt CoinMarketCap Pro first when CMC_API_KEY is provided, otherwise it falls back to Coingecko Simple API

API overview
- GET /health → { status: "ok" }
- GET /supported → { cryptos: [BTC, ETH, USDT, USDC], fiats: [USD, CAD] }
- GET /company, PUT /company → settings (custody flag, company wallets, base fiat)
- GET /employees → list employees
- POST /employees → upsert employee { user_id, percent_to_crypto, receiving_addresses }
- GET /prices?fiat=USD → live prices mapping
- GET /transactions → list all transactions
- POST /run-payroll → create a new transaction (pending)
- POST /transactions/{id}/confirm → mark a transaction as confirmed

Structure
- backend/main.py → FastAPI app
- frontend/ → React app (Vite + Tailwind)

Future integration
- Components are modular to allow later integration with real systems (Workday, Coinbase, BitPay). Replace the mock endpoints and in-memory store with real services and persistence.

License
- For demo purposes only.


---

Docker Compose deployment

Prerequisites
- Docker 20.10+
- Docker Compose v2

Services included
- db: PostgreSQL 16 (database: capytosaas, user: postgres, password: postgres)
- backend: FastAPI API (exposed at http://localhost:8000)
- frontend: Static React app served by Nginx (exposed at http://localhost:5173)

Quick start
1) Build and start the stack
   docker compose up -d --build

2) Open the app
   http://localhost:5173

Configuration
- Backend reads environment variables from backend/.env (included). The compose file also injects:
  - DATABASE_URL=postgresql://postgres:postgres@db:5432/capytosaas

- For Dokploy or external managed Postgres, use the provided internet connection URL and set it as DATABASE_URL:
  postgresql://postgres:postgres@capytosaasportal-mvp-3dcdfd:5432/capytosaas

  You can set this in Dokploy environment for the backend service so it overrides the compose default.

Frontend API base
- The frontend image is built with VITE_API_BASE=http://backend:8000 so it talks to the backend service on the Docker network.
- If you deploy frontend separately, set VITE_API_BASE to your public backend URL at build time:
  docker build --build-arg VITE_API_BASE=https://api.example.com -t capytosaas-frontend ./

Health checks
- Postgres: pg_isready
- Backend: GET /health

Data persistence
- PostgreSQL data is stored in a named volume pgdata.

Notes
- The current MVP still uses JSON file storage for employees, but the stack is prepared with PostgreSQL and DATABASE_URL for a future migration.
