import os
import uuid
from datetime import datetime
from typing import Dict, List, Optional

import httpx
from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv

# Database (PostgreSQL via SQLAlchemy Core)
from sqlalchemy import (
    create_engine,
    MetaData,
    Table,
    Column,
    String,
    Integer,
    Float,
    Boolean,
    DateTime,
    JSON,
    select,
    insert,
    update,
    func,
    text,
)
from sqlalchemy.engine import Engine
from sqlalchemy.dialects.postgresql import JSONB

load_dotenv()

app = FastAPI(title="Crypto Payroll Mock API", version="0.2.0")

# CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SUPPORTED_CRYPTOS = ["BTC", "ETH", "USDT", "USDC"]
FIAT_CURRENCIES = ["USD", "CAD"]

# ---------- PostgreSQL setup ----------
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is required for backend persistence")

engine: Engine = create_engine(DATABASE_URL, future=True)
metadata = MetaData()

# Prefer JSONB on Postgres, fallback JSON otherwise
JSON_TYPE = JSONB if DATABASE_URL.startswith("postgresql") else JSON

employees_table = Table(
    "employees",
    metadata,
    Column("user_id", String, primary_key=True),
    Column("percent_to_crypto", Integer, nullable=False, default=0),
    Column("receiving_addresses", JSON_TYPE, nullable=False, default={s: None for s in SUPPORTED_CRYPTOS}),
    Column("crypto_split", JSON_TYPE, nullable=False, default={s: 0 for s in SUPPORTED_CRYPTOS}),
    Column("first_name", String, nullable=True),
    Column("last_name", String, nullable=True),
    Column("address", String, nullable=True),
    Column("accumulated_fiat", Float, nullable=False, default=0.0),
    Column("accumulated_crypto", JSON_TYPE, nullable=False, default={s: 0.0 for s in SUPPORTED_CRYPTOS}),
)

transactions_table = Table(
    "transactions",
    metadata,
    Column("id", String, primary_key=True),
    Column("date", DateTime(timezone=True), nullable=False),
    Column("fiat_amount", Float, nullable=False),
    Column("fiat_currency", String, nullable=False),
    Column("crypto_symbol", String, nullable=False),
    Column("crypto_amount", Float, nullable=False),
    Column("num_employees", Integer, nullable=False),
    Column("addresses", JSON_TYPE, nullable=False),
    Column("tx_hash", String, nullable=True),
    Column("status", String, nullable=False, default="pending"),
    Column("price_at_tx", Float, nullable=False),
)

company_settings_table = Table(
    "company_settings",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("custody", Boolean, nullable=False, default=False),
    Column("company_wallets", JSON_TYPE, nullable=False, default={s: "" for s in SUPPORTED_CRYPTOS}),
    Column("base_fiat", String, nullable=False, default="USD"),
)

# Create tables if they don't exist
with engine.begin() as conn:
    metadata.create_all(conn)


# ---------- Pydantic models ----------
class EmployeeIn(BaseModel):
    user_id: str
    percent_to_crypto: int = Field(0, ge=0, le=100)
    receiving_addresses: Dict[str, Optional[str]] = Field(
        default_factory=lambda: {s: None for s in SUPPORTED_CRYPTOS}
    )
    crypto_split: Dict[str, int] = Field(
        default_factory=lambda: {s: 0 for s in SUPPORTED_CRYPTOS}
    )
    # Optional metadata from payroll system
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    address: Optional[str] = None


class Employee(EmployeeIn):
    accumulated_fiat: float = 0.0
    accumulated_crypto: Dict[str, float] = Field(
        default_factory=lambda: {s: 0.0 for s in SUPPORTED_CRYPTOS}
    )


class Transaction(BaseModel):
    id: str
    date: datetime
    fiat_amount: float
    fiat_currency: str
    crypto_symbol: str
    crypto_amount: float
    num_employees: int
    addresses: List[str]
    tx_hash: Optional[str] = None
    status: str = "pending"  # pending | confirmed
    price_at_tx: float  # fiat per 1 crypto at tx time


class RunPayrollRequest(BaseModel):
    payroll_fiat_total: float
    crypto_symbol: str


class CompanySettings(BaseModel):
    custody: bool
    company_wallets: Dict[str, Optional[str]]
    base_fiat: str = "USD"


# ---------- Helpers ----------
def _row_to_employee(row) -> Employee:
    return Employee(
        user_id=row["user_id"],
        percent_to_crypto=int(row["percent_to_crypto"] or 0),
        receiving_addresses=row["receiving_addresses"] or {s: None for s in SUPPORTED_CRYPTOS},
        crypto_split={s: int((row["crypto_split"] or {}).get(s, 0)) for s in SUPPORTED_CRYPTOS},
        first_name=row.get("first_name"),
        last_name=row.get("last_name"),
        address=row.get("address"),
        accumulated_fiat=float(row.get("accumulated_fiat") or 0.0),
        accumulated_crypto={s: float((row.get("accumulated_crypto") or {}).get(s, 0.0)) for s in SUPPORTED_CRYPTOS},
    )


def _get_company_settings(conn) -> CompanySettings:
    res = conn.execute(select(company_settings_table).where(company_settings_table.c.id == 1)).mappings().first()
    if not res:
        # initialize defaults
        defaults = dict(
            id=1,
            custody=False,
            company_wallets={s: "" for s in SUPPORTED_CRYPTOS},
            base_fiat="USD",
        )
        conn.execute(insert(company_settings_table).values(**defaults))
        conn.commit()
        return CompanySettings(**{k: v for k, v in defaults.items() if k != "id"})
    return CompanySettings(
        custody=bool(res["custody"]),
        company_wallets={s: (res["company_wallets"] or {}).get(s, "") for s in SUPPORTED_CRYPTOS},
        base_fiat=res["base_fiat"] if res["base_fiat"] in FIAT_CURRENCIES else "USD",
    )


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/supported")
def supported():
    return {"cryptos": SUPPORTED_CRYPTOS, "fiats": FIAT_CURRENCIES}


@app.get("/company", response_model=CompanySettings)
def get_company():
    with engine.begin() as conn:
        return _get_company_settings(conn)


@app.put("/company", response_model=CompanySettings)
def update_company(settings: CompanySettings):
    # sanitize wallets keys
    wallet_map = {s: settings.company_wallets.get(s) for s in SUPPORTED_CRYPTOS}
    with engine.begin() as conn:
        exists = conn.execute(select(func.count()).select_from(company_settings_table).where(company_settings_table.c.id == 1)).scalar()
        payload = {
            "custody": bool(settings.custody),
            "company_wallets": wallet_map,
            "base_fiat": settings.base_fiat if settings.base_fiat in FIAT_CURRENCIES else "USD",
        }
        if exists:
            conn.execute(update(company_settings_table).where(company_settings_table.c.id == 1).values(**payload))
        else:
            conn.execute(insert(company_settings_table).values(id=1, **payload))
        return _get_company_settings(conn)


@app.get("/employees", response_model=List[Employee])
def list_employees(response: "Response"):
    # Instruct clients/proxies not to cache the employees list
    try:
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
    except Exception:
        pass
    with engine.begin() as conn:
        rows = conn.execute(select(employees_table).order_by(employees_table.c.user_id.asc())).mappings().all()
        return [_row_to_employee(r) for r in rows]


@app.post("/employees", response_model=Employee)
def upsert_employee(payload: EmployeeIn):
    # Basic validation for split: if any address provided, sum of splits for non-empty addresses must be 100
    provided_syms = [s for s, a in payload.receiving_addresses.items() if (a or "").strip()]
    if provided_syms:
        total = sum(int(payload.crypto_split.get(s, 0)) for s in provided_syms)
        if total != 100:
            raise HTTPException(status_code=400, detail="crypto_split for provided addresses must sum to 100")

    with engine.begin() as conn:
        row = conn.execute(select(employees_table).where(employees_table.c.user_id == payload.user_id)).mappings().first()
        if row is None:
            emp = Employee(**payload.model_dump())
            conn.execute(
                insert(employees_table).values(
                    user_id=emp.user_id,
                    percent_to_crypto=emp.percent_to_crypto,
                    receiving_addresses=emp.receiving_addresses,
                    crypto_split={s: int(emp.crypto_split.get(s, 0)) for s in SUPPORTED_CRYPTOS},
                    first_name=emp.first_name,
                    last_name=emp.last_name,
                    address=emp.address,
                    accumulated_fiat=0.0,
                    accumulated_crypto={s: 0.0 for s in SUPPORTED_CRYPTOS},
                )
            )
        else:
            # update fields; preserve addresses if None provided
            existing_addresses = row["receiving_addresses"] or {s: None for s in SUPPORTED_CRYPTOS}
            new_addresses = existing_addresses.copy()
            for sym, addr in (payload.receiving_addresses or {}).items():
                if addr is not None:
                    new_addresses[sym] = addr
            conn.execute(
                update(employees_table)
                .where(employees_table.c.user_id == payload.user_id)
                .values(
                    percent_to_crypto=payload.percent_to_crypto,
                    receiving_addresses=new_addresses,
                    crypto_split={s: int(payload.crypto_split.get(s, 0)) for s in SUPPORTED_CRYPTOS},
                    first_name=payload.first_name if payload.first_name is not None else row.get("first_name"),
                    last_name=payload.last_name if payload.last_name is not None else row.get("last_name"),
                    address=payload.address if payload.address is not None else row.get("address"),
                )
            )
        out = conn.execute(select(employees_table).where(employees_table.c.user_id == payload.user_id)).mappings().first()
        return _row_to_employee(out)


@app.get("/transactions", response_model=List[Transaction])
def list_transactions():
    with engine.begin() as conn:
        rows = conn.execute(select(transactions_table).order_by(transactions_table.c.date.desc())).mappings().all()
        return [Transaction(**dict(r)) for r in rows]


# ----- Payroll system sync (MVP random generator) -----
FIRST_NAMES = [
    "Alex", "Marie", "Jean", "Sophie", "David", "Emma", "Thomas", "Chloé", "Lucas", "Léa",
]
LAST_NAMES = [
    "Tremblay", "Gagnon", "Roy", "Côté", "Bouchard", "Gauthier", "Morin", "Lavoie", "Fortin", "Gagné",
]
CITIES_QC = [
    "Montréal", "Québec", "Laval", "Gatineau", "Longueuil", "Sherbrooke", "Saguenay", "Lévis", "Trois-Rivières", "Terrebonne",
]
STREETS = [
    "Rue Sainte-Catherine", "Boulevard René-Lévesque", "Rue Saint-Denis", "Avenue du Mont-Royal", "Chemin Sainte-Foy",
]
POSTAL_PREFIX = ["H1", "H2", "H3", "G1", "G2", "J1", "J2"]


def random_quebec_address() -> str:
    import random
    num = random.randint(100, 9999)
    street = random.choice(STREETS)
    city = random.choice(CITIES_QC)
    # Simple Canadian-like postal code pattern A1A 1A1 (approximation)
    letters = "ABCEGHJKLMNPRSTVXY"
    digits = "0123456789"
    pc = (
        random.choice(letters)
        + random.choice(digits)
        + random.choice(letters)
        + " "
        + random.choice(digits)
        + random.choice(letters)
        + random.choice(digits)
    )
    return f"{num} {street}, {city}, QC, {pc}"


def generate_unique_user_id(conn, first: str, last: str) -> str:
    base = f"{first.lower()}.{last.lower()}"
    candidate = base
    i = 1
    while True:
        exists = conn.execute(select(func.count()).select_from(employees_table).where(employees_table.c.user_id == candidate)).scalar()
        if not exists:
            return candidate
        i += 1
        candidate = f"{base}{i}"


@app.post("/sync", response_model=Employee)
def sync_one_user():
    import random
    with engine.begin() as conn:
        first = random.choice(FIRST_NAMES)
        last = random.choice(LAST_NAMES)
        addr = random_quebec_address()
        user_id = generate_unique_user_id(conn, first, last)

        emp = Employee(
            user_id=user_id,
            percent_to_crypto=0,
            receiving_addresses={s: "" for s in SUPPORTED_CRYPTOS},
            crypto_split={s: 0 for s in SUPPORTED_CRYPTOS},
            first_name=first,
            last_name=last,
            address=addr,
        )
        conn.execute(
            insert(employees_table).values(
                user_id=emp.user_id,
                percent_to_crypto=emp.percent_to_crypto,
                receiving_addresses=emp.receiving_addresses,
                crypto_split=emp.crypto_split,
                first_name=emp.first_name,
                last_name=emp.last_name,
                address=emp.address,
                accumulated_fiat=0.0,
                accumulated_crypto={s: 0.0 for s in SUPPORTED_CRYPTOS},
            )
        )
        row = conn.execute(select(employees_table).where(employees_table.c.user_id == user_id)).mappings().first()
        return _row_to_employee(row)


@app.get("/prices")
async def get_prices(fiat: str = "USD"):
    prices = await fetch_prices(fiat)
    return {"fiat": fiat, "prices": prices}


@app.post("/run-payroll", response_model=Transaction)
async def run_payroll(req: RunPayrollRequest):
    if req.crypto_symbol not in SUPPORTED_CRYPTOS:
        raise HTTPException(status_code=400, detail="Unsupported crypto symbol")
    if req.payroll_fiat_total <= 0:
        raise HTTPException(status_code=400, detail="payroll_fiat_total must be > 0")

    with engine.begin() as conn:
        settings = _get_company_settings(conn)

        prices = await fetch_prices(settings.base_fiat)
        price = prices.get(req.crypto_symbol)
        if not price:
            raise HTTPException(status_code=502, detail="Price not available")

        crypto_amount = req.payroll_fiat_total / price

        # Determine addresses based on custody
        addresses: List[str] = []
        if settings.custody:
            wallet = (settings.company_wallets or {}).get(req.crypto_symbol)
            if not wallet:
                raise HTTPException(status_code=400, detail="Company custody enabled but wallet missing")
            addresses = [wallet]
        else:
            rows = conn.execute(select(employees_table).mappings()).all()
            addresses = [
                (r["receiving_addresses"] or {}).get(req.crypto_symbol)
                for r in rows
                if int(r["percent_to_crypto"] or 0) > 0 and (r["receiving_addresses"] or {}).get(req.crypto_symbol)
            ]
            if not addresses:
                raise HTTPException(status_code=400, detail="No eligible employee addresses")

        tx_id = str(uuid.uuid4())
        # Mock call to third-party broker API
        tx_hash = await mock_third_party_buy_and_distribute(
            fiat_total=req.payroll_fiat_total,
            crypto_symbol=req.crypto_symbol,
            crypto_amount=crypto_amount,
            addresses=addresses,
        )

        conn.execute(
            insert(transactions_table).values(
                id=tx_id,
                date=datetime.utcnow(),
                fiat_amount=req.payroll_fiat_total,
                fiat_currency=settings.base_fiat,
                crypto_symbol=req.crypto_symbol,
                crypto_amount=crypto_amount,
                num_employees=len(addresses) if not settings.custody else conn.execute(select(func.count()).select_from(employees_table)).scalar(),
                addresses=addresses,
                tx_hash=tx_hash,
                status="pending",
                price_at_tx=price,
            )
        )

        # Update simple accumulations for employees (very naive)
        if not settings.custody:
            per_emp_share = crypto_amount / len(addresses)
            rows = conn.execute(select(employees_table).mappings()).all()
            for r in rows:
                addr = (r["receiving_addresses"] or {}).get(req.crypto_symbol)
                if int(r["percent_to_crypto"] or 0) > 0 and addr in addresses:
                    acc_crypto = r.get("accumulated_crypto") or {s: 0.0 for s in SUPPORTED_CRYPTOS}
                    acc_crypto[req.crypto_symbol] = float(acc_crypto.get(req.crypto_symbol, 0.0)) + per_emp_share
                    acc_fiat = float(r.get("accumulated_fiat") or 0.0) + (req.payroll_fiat_total / max(1, len(addresses)))
                    conn.execute(
                        update(employees_table)
                        .where(employees_table.c.user_id == r["user_id"])
                        .values(accumulated_crypto=acc_crypto, accumulated_fiat=acc_fiat)
                    )

        row = conn.execute(select(transactions_table).where(transactions_table.c.id == tx_id)).mappings().first()
        return Transaction(**dict(row))


@app.post("/transactions/{tx_id}/confirm", response_model=Transaction)
def confirm_transaction(tx_id: str):
    with engine.begin() as conn:
        res = conn.execute(select(transactions_table).where(transactions_table.c.id == tx_id)).mappings().first()
        if not res:
            raise HTTPException(status_code=404, detail="Transaction not found")
        conn.execute(update(transactions_table).where(transactions_table.c.id == tx_id).values(status="confirmed"))
        row = conn.execute(select(transactions_table).where(transactions_table.c.id == tx_id)).mappings().first()
        return Transaction(**dict(row))


async def fetch_prices(fiat: str = "USD") -> Dict[str, float]:
    """Fetch live prices.

    Priority order:
    1) CoinMarketCap Pro (if CMC_API_KEY provided)
    2) CoinGecko Pro/Demo (if COINGECKO_API_KEY or COINGECKO_DEMO_API_KEY provided)
    3) Public CoinGecko (no key)

    Returns mapping symbol -> price in fiat.
    """
    fiat = fiat.upper()
    cmc_key = os.getenv("CMC_API_KEY")
    cg_key = os.getenv("COINGECKO_API_KEY")
    cg_demo_key = os.getenv("COINGECKO_DEMO_API_KEY")

    symbols = ",".join(SUPPORTED_CRYPTOS)

    # 1) CoinMarketCap Pro
    if cmc_key:
        url = "https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest"
        params = {"symbol": symbols, "convert": fiat}
        headers = {"X-CMC_PRO_API_KEY": cmc_key}
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.get(url, params=params, headers=headers)
                r.raise_for_status()
                data = r.json().get("data", {})
                out = {}
                for sym in SUPPORTED_CRYPTOS:
                    quote = data.get(sym, {}).get("quote", {}).get(fiat, {})
                    price = quote.get("price")
                    if price is not None:
                        out[sym] = float(price)
                if out:
                    return out
        except Exception:
            # fall through to CoinGecko
            pass

    # Common mapping for CoinGecko
    cg_map = {
        "BTC": "bitcoin",
        "ETH": "ethereum",
        "USDT": "tether",
        "USDC": "usd-coin",
    }
    ids = ",".join(cg_map.values())
    vs = fiat.lower()

    # 2) CoinGecko Pro/Demo with API key
    if cg_key or cg_demo_key:
        # Prefer Pro endpoint when a Pro key is present
        url = "https://pro-api.coingecko.com/api/v3/simple/price" if cg_key else "https://api.coingecko.com/api/v3/simple/price"
        headers = {"x-cg-pro-api-key": cg_key} if cg_key else {"x-cg-demo-api-key": cg_demo_key}
        params = {"ids": ids, "vs_currencies": vs}
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                r = await client.get(url, params=params, headers=headers)
                r.raise_for_status()
                data = r.json()
                out = {}
                for sym, cid in cg_map.items():
                    v = data.get(cid, {}).get(vs)
                    if v is not None:
                        out[sym] = float(v)
                if out:
                    return out
        except Exception:
            # fall through to public endpoint
            pass

    # 3) Public CoinGecko (no key)
    url = "https://api.coingecko.com/api/v3/simple/price"
    params = {"ids": ids, "vs_currencies": vs}
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.get(url, params=params)
        r.raise_for_status()
        data = r.json()
        out = {}
        for sym, cid in cg_map.items():
            v = data.get(cid, {}).get(vs)
            if v is not None:
                out[sym] = float(v)
        return out


async def mock_third_party_buy_and_distribute(
    fiat_total: float, crypto_symbol: str, crypto_amount: float, addresses: List[str]
) -> str:
    # Simulate network delay
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.get("https://worldtimeapi.org/api/timezone/Etc/UTC")
    except Exception:
        pass
    # Return a fake tx hash
    return "0x" + uuid.uuid4().hex[:60]
