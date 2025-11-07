import os
import uuid
from datetime import datetime
from typing import Dict, List, Optional, Literal

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
FIAT_CURRENCIES = ["USD", "CAD", "EUR"]

# In-memory stores (MVP) with simple JSON persistence
EMPLOYEES: Dict[str, dict] = {}
TRANSACTIONS: List[dict] = []
COMPANY_SETTINGS: dict = {
    "custody": False,  # False = pay to employee addresses; True = company custody
    "company_wallets": {"BTC": "", "ETH": "", "USDT": "", "USDC": ""},
    "base_fiat": "USD",
}

DB_DIR = os.path.dirname(os.path.abspath(__file__))
EMPLOYEES_DB_PATH = os.path.join(DB_DIR, "employees.json")


def load_employees_from_disk():
    global EMPLOYEES
    try:
        if os.path.exists(EMPLOYEES_DB_PATH):
            import json

            with open(EMPLOYEES_DB_PATH, "r", encoding="utf-8") as f:
                data = json.load(f)
                # ensure mapping by user_id and normalize to Employee objects
                loaded = {}
                for item in data:
                    uid = item.get("user_id")
                    if not uid:
                        continue
                    try:
                        loaded[uid] = Employee(**item)
                    except Exception:
                        # fallback to minimal record
                        loaded[uid] = Employee(user_id=uid)
                EMPLOYEES = loaded
    except Exception:
        # start fresh if corrupted
        EMPLOYEES = {}


def save_employees_to_disk():
    try:
        import json

        with open(EMPLOYEES_DB_PATH, "w", encoding="utf-8") as f:
            json.dump(list(EMPLOYEES.values()), f, indent=2, default=str)
    except Exception:
        # ignore persistence errors in MVP
        pass


# Load on startup
load_employees_from_disk()


class EmployeeIn(BaseModel):
    user_id: str
    percent_to_crypto: int = Field(0, ge=0, le=100)
    # New: allow choosing conversion mode per employee
    convert_mode: Literal['percent', 'fixed'] = 'percent'
    fixed_amount_fiat: float = Field(0.0, ge=0)
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
    # Optional per-employee breakdown used especially in company custody mode
    per_employee_breakdown: Optional[List[dict]] = None


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
    # Basic validation for split: if any address provided, sum of splits for non-empty addresses must be 100
    provided_syms = [s for s, a in payload.receiving_addresses.items() if (a or "").strip()]
    if provided_syms:
        total = sum(int(payload.crypto_split.get(s, 0)) for s in provided_syms)
        if total != 100:
            raise HTTPException(status_code=400, detail="crypto_split for provided addresses must sum to 100")
    emp = EMPLOYEES.get(payload.user_id)
    if emp is None:
        emp = Employee(**payload.model_dump())
    else:
        # update fields
        emp.percent_to_crypto = payload.percent_to_crypto
        emp.convert_mode = payload.convert_mode
        emp.fixed_amount_fiat = payload.fixed_amount_fiat
        # keep existing addresses unless overwritten explicitly
        for sym, addr in payload.receiving_addresses.items():
            if addr is not None:
                emp.receiving_addresses[sym] = addr
        # update crypto split entirely
        if payload.crypto_split is not None:
            # ensure all symbols present
            emp.crypto_split = {s: int(payload.crypto_split.get(s, 0)) for s in SUPPORTED_CRYPTOS}
        # update optional metadata if provided
        if payload.first_name is not None:
            emp.first_name = payload.first_name
        if payload.last_name is not None:
            emp.last_name = payload.last_name
        if payload.address is not None:
            emp.address = payload.address
    EMPLOYEES[payload.user_id] = emp
    save_employees_to_disk()
    return emp


@app.get("/transactions", response_model=List[Transaction])
def list_transactions():
    return TRANSACTIONS


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


def generate_unique_user_id(first: str, last: str) -> str:
    base = f"{first.lower()}.{last.lower()}"
    candidate = base
    i = 1
    while candidate in EMPLOYEES:
        i += 1
        candidate = f"{base}{i}"
    return candidate


@app.post("/sync", response_model=Employee)
def sync_one_user():
    import random

    first = random.choice(FIRST_NAMES)
    last = random.choice(LAST_NAMES)
    addr = random_quebec_address()
    user_id = generate_unique_user_id(first, last)

    emp = Employee(
        user_id=user_id,
        percent_to_crypto=0,
        convert_mode='percent',
        fixed_amount_fiat=0.0,
        receiving_addresses={s: "" for s in SUPPORTED_CRYPTOS},
        crypto_split={s: 0 for s in SUPPORTED_CRYPTOS},
        first_name=first,
        last_name=last,
        address=addr,
    )
    EMPLOYEES[user_id] = emp
    save_employees_to_disk()
    return emp


@app.get("/prices")
async def get_prices(fiat: str = "USD"):
    prices = await fetch_prices(fiat)
    return {"fiat": fiat, "prices": prices}


@app.post("/run-payroll", response_model=Transaction)
async def run_payroll(req: RunPayrollRequest):
    if req.crypto_symbol not in SUPPORTED_CRYPTOS:
        raise HTTPException(status_code=400, detail="Unsupported crypto symbol")

    prices = await fetch_prices(COMPANY_SETTINGS.get("base_fiat", "USD"))
    price = prices.get(req.crypto_symbol)
    if not price:
        raise HTTPException(status_code=502, detail="Price not available")

    custody_mode = bool(COMPANY_SETTINGS.get("custody"))

    # Helper: compute employee requested fiat for this crypto symbol
    def employee_requested_fiat_for_symbol(emp: Employee, symbol: str) -> float:
        try:
            split_pct = int(getattr(emp, 'crypto_split', {}).get(symbol, 0))
            if split_pct <= 0:
                return 0.0
            mode = getattr(emp, 'convert_mode', 'percent')
            if mode == 'fixed':
                base_amt = float(getattr(emp, 'fixed_amount_fiat', 0.0) or 0.0)
                return round(base_amt * (split_pct / 100.0), 8)
            # percent mode requires a base salary we don't model yet in backend
            return 0.0
        except Exception:
            return 0.0

    per_employee_breakdown: List[dict] = []
    addresses: List[str] = []

    if custody_mode:
        wallet = COMPANY_SETTINGS.get("company_wallets", {}).get(req.crypto_symbol)
        if not wallet:
            raise HTTPException(status_code=400, detail="Company custody enabled but wallet missing")
        # Build breakdown based on employee tab
        computed_fiat_total = 0.0
        for emp in EMPLOYEES.values():
            fiat_amt = employee_requested_fiat_for_symbol(emp, req.crypto_symbol)
            if fiat_amt > 0:
                per_employee_breakdown.append({
                    "user_id": emp.user_id,
                    "fiat_amount": fiat_amt,
                    "crypto_amount": round(fiat_amt / price, 12),
                })
                computed_fiat_total += fiat_amt
        if computed_fiat_total <= 0:
            raise HTTPException(status_code=400, detail="No employee requests found for this crypto in custody mode")
        payroll_fiat_total = round(computed_fiat_total, 2)
        crypto_amount = payroll_fiat_total / price
        addresses = [wallet]
    else:
        # Non-custody: original behavior with provided total and eligible addresses
        if req.payroll_fiat_total <= 0:
            raise HTTPException(status_code=400, detail="payroll_fiat_total must be > 0")
        payroll_fiat_total = req.payroll_fiat_total
        crypto_amount = payroll_fiat_total / price
        def is_eligible(emp: Employee) -> bool:
            try:
                mode = getattr(emp, 'convert_mode', 'percent')
                if mode == 'fixed':
                    return (getattr(emp, 'fixed_amount_fiat', 0.0) or 0.0) > 0
                return (emp.percent_to_crypto or 0) > 0
            except Exception:
                return (emp.percent_to_crypto or 0) > 0
        addresses = [
            emp.receiving_addresses.get(req.crypto_symbol)
            for emp in EMPLOYEES.values()
            if is_eligible(emp) and emp.receiving_addresses.get(req.crypto_symbol)
        ]
        if not addresses:
            raise HTTPException(status_code=400, detail="No eligible employee addresses")

    # Mock call to third-party broker API
    tx_hash = await mock_third_party_buy_and_distribute(
        fiat_total=payroll_fiat_total,
        crypto_symbol=req.crypto_symbol,
        crypto_amount=crypto_amount,
        addresses=addresses,
    )

    tx = Transaction(
        id=str(uuid.uuid4()),
        date=datetime.utcnow(),
        fiat_amount=payroll_fiat_total,
        fiat_currency=COMPANY_SETTINGS.get("base_fiat", "USD"),
        crypto_symbol=req.crypto_symbol,
        crypto_amount=crypto_amount,
        num_employees=len(addresses) if not custody_mode else len(per_employee_breakdown),
        addresses=addresses,
        tx_hash=tx_hash,
        status="pending",
        price_at_tx=price,
        per_employee_breakdown=per_employee_breakdown or None,
    )
    TRANSACTIONS.insert(0, tx.model_dump())

    # Update accumulations
    if not custody_mode:
        per_emp_share = crypto_amount / len(addresses)
        def is_eligible(emp: Employee) -> bool:
            try:
                mode = getattr(emp, 'convert_mode', 'percent')
                if mode == 'fixed':
                    return (getattr(emp, 'fixed_amount_fiat', 0.0) or 0.0) > 0
                return (emp.percent_to_crypto or 0) > 0
            except Exception:
                return (emp.percent_to_crypto or 0) > 0
        for emp in EMPLOYEES.values():
            addr = emp.receiving_addresses.get(req.crypto_symbol)
            if is_eligible(emp) and addr in addresses:
                emp.accumulated_crypto[req.crypto_symbol] += per_emp_share
                emp.accumulated_fiat += per_emp_share * price
    else:
        for item in per_employee_breakdown:
            uid = item.get("user_id")
            emp = EMPLOYEES.get(uid)
            if not emp:
                continue
            emp.accumulated_fiat += float(item.get("fiat_amount", 0.0) or 0.0)
            emp.accumulated_crypto[req.crypto_symbol] += float(item.get("crypto_amount", 0.0) or 0.0)

    save_employees_to_disk()

    return tx


@app.post("/transactions/{tx_id}/confirm", response_model=Transaction)
def confirm_transaction(tx_id: str):
    for t in TRANSACTIONS:
        if t["id"] == tx_id:
            t["status"] = "confirmed"
            return t
    raise HTTPException(status_code=404, detail="Transaction not found")


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
