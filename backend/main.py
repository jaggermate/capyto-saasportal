import os
import uuid
from datetime import datetime
from typing import Dict, List, Optional

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Crypto Payroll Mock API", version="0.1.0")

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

# In-memory stores (MVP)
EMPLOYEES: Dict[str, dict] = {}
TRANSACTIONS: List[dict] = []
COMPANY_SETTINGS: dict = {
    "custody": False,  # False = pay to employee addresses; True = company custody
    "company_wallets": {"BTC": "", "ETH": "", "USDT": "", "USDC": ""},
    "base_fiat": "USD",
}


class EmployeeIn(BaseModel):
    user_id: str
    percent_to_crypto: int = Field(0, ge=0, le=100)
    receiving_addresses: Dict[str, Optional[str]] = Field(
        default_factory=lambda: {s: None for s in SUPPORTED_CRYPTOS}
    )


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


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/supported")
def supported():
    return {"cryptos": SUPPORTED_CRYPTOS, "fiats": FIAT_CURRENCIES}


@app.get("/company", response_model=CompanySettings)
def get_company():
    return COMPANY_SETTINGS


@app.put("/company", response_model=CompanySettings)
def update_company(settings: CompanySettings):
    # sanitize wallets keys
    wallet_map = {s: settings.company_wallets.get(s) for s in SUPPORTED_CRYPTOS}
    COMPANY_SETTINGS.update(
        {
            "custody": settings.custody,
            "company_wallets": wallet_map,
            "base_fiat": settings.base_fiat if settings.base_fiat in FIAT_CURRENCIES else "USD",
        }
    )
    return COMPANY_SETTINGS


@app.get("/employees", response_model=List[Employee])
def list_employees():
    return list(EMPLOYEES.values())


@app.post("/employees", response_model=Employee)
def upsert_employee(payload: EmployeeIn):
    emp = EMPLOYEES.get(payload.user_id)
    if emp is None:
        emp = Employee(**payload.model_dump())
    else:
        # update fields
        emp.percent_to_crypto = payload.percent_to_crypto
        # keep existing addresses unless overwritten explicitly
        for sym, addr in payload.receiving_addresses.items():
            if addr is not None:
                emp.receiving_addresses[sym] = addr
    EMPLOYEES[payload.user_id] = emp
    return emp


@app.get("/transactions", response_model=List[Transaction])
def list_transactions():
    return TRANSACTIONS


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

    prices = await fetch_prices(COMPANY_SETTINGS.get("base_fiat", "USD"))
    price = prices.get(req.crypto_symbol)
    if not price:
        raise HTTPException(status_code=502, detail="Price not available")

    crypto_amount = req.payroll_fiat_total / price

    # Determine addresses based on custody
    addresses: List[str] = []
    if COMPANY_SETTINGS.get("custody"):
        wallet = COMPANY_SETTINGS.get("company_wallets", {}).get(req.crypto_symbol)
        if not wallet:
            raise HTTPException(status_code=400, detail="Company custody enabled but wallet missing")
        # Single treasury address
        addresses = [wallet]
    else:
        # Collect employee-provided addresses; if none, exclude that employee
        addresses = [
            emp.receiving_addresses.get(req.crypto_symbol)
            for emp in EMPLOYEES.values()
            if emp.percent_to_crypto > 0 and emp.receiving_addresses.get(req.crypto_symbol)
        ]
        if not addresses:
            raise HTTPException(status_code=400, detail="No eligible employee addresses")

    # Mock call to third-party broker API
    tx_hash = await mock_third_party_buy_and_distribute(
        fiat_total=req.payroll_fiat_total,
        crypto_symbol=req.crypto_symbol,
        crypto_amount=crypto_amount,
        addresses=addresses,
    )

    tx = Transaction(
        id=str(uuid.uuid4()),
        date=datetime.utcnow(),
        fiat_amount=req.payroll_fiat_total,
        fiat_currency=COMPANY_SETTINGS.get("base_fiat", "USD"),
        crypto_symbol=req.crypto_symbol,
        crypto_amount=crypto_amount,
        num_employees=len(addresses) if not COMPANY_SETTINGS.get("custody") else len(EMPLOYEES),
        addresses=addresses,
        tx_hash=tx_hash,
        status="pending",
        price_at_tx=price,
    )
    TRANSACTIONS.insert(0, tx.model_dump())

    # Update simple accumulations for employees (very naive)
    if not COMPANY_SETTINGS.get("custody"):
        per_emp_share = crypto_amount / len(addresses)
        for emp in EMPLOYEES.values():
            addr = emp.receiving_addresses.get(req.crypto_symbol)
            if emp.percent_to_crypto > 0 and addr in addresses:
                emp.accumulated_crypto[req.crypto_symbol] += per_emp_share
                # track fiat equivalent at time of tx for history
                emp.accumulated_fiat += req.payroll_fiat_total / max(1, len(addresses))

    return tx


@app.post("/transactions/{tx_id}/confirm", response_model=Transaction)
def confirm_transaction(tx_id: str):
    for t in TRANSACTIONS:
        if t["id"] == tx_id:
            t["status"] = "confirmed"
            return t
    raise HTTPException(status_code=404, detail="Transaction not found")


async def fetch_prices(fiat: str = "USD") -> Dict[str, float]:
    """Fetch live prices. Prefer CoinMarketCap (Dex API / Pro) if API key provided, fallback to Coingecko.

    Returns mapping symbol -> price in fiat.
    """
    fiat = fiat.upper()
    cmc_key = os.getenv("CMC_API_KEY")

    symbols = ",".join(SUPPORTED_CRYPTOS)

    if cmc_key:
        # Try CoinMarketCap latest quotes (Pro). Dex or pro both acceptable; using pro endpoint for reliability.
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
                    if price:
                        out[sym] = float(price)
                if out:
                    return out
        except Exception:
            # fall through to coingecko
            pass

    # Fallback to Coingecko Simple API (no key)
    cg_map = {
        "BTC": "bitcoin",
        "ETH": "ethereum",
        "USDT": "tether",
        "USDC": "usd-coin",
    }
    ids = ",".join(cg_map.values())
    url = "https://api.coingecko.com/api/v3/simple/price"
    params = {"ids": ids, "vs_currencies": fiat.lower()}
    async with httpx.AsyncClient(timeout=10.0) as client:
        r = await client.get(url, params=params)
        r.raise_for_status()
        data = r.json()
        out = {}
        for sym, cid in cg_map.items():
            v = data.get(cid, {}).get(fiat.lower())
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
