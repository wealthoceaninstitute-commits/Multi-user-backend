# fastapi_ct_app.py
"""
FastAPI port of your multi-threaded copy trading service.
- Preserves all core logic, endpoints, and background trading loop.
- Uses FastAPI + Uvicorn, Jinja2 templates, and identical thread-based concurrency.
- Index page still rendered from templates/index.html (same as Flask).
"""

import os
import sys
import json
import glob
import math
import time
import logging
import threading
import sqlite3
from datetime import datetime
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from fastapi import FastAPI, Request, Body, Query, Form, HTTPException, BackgroundTasks
import pandas as pd
import requests
import pyotp

# === External modules expected to be present (same as your Flask app) ===
from MOFSLOPENAPI import MOFSLOPENAPI
from init_dirs import ensure_data_dirs

# === FastAPI / Starlette imports ===
from fastapi import FastAPI, Request, Body, Query, Form, HTTPException
from fastapi.responses import JSONResponse, HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.templating import Jinja2Templates
from starlette.staticfiles import StaticFiles
import uvicorn
import webbrowser

# =========================
# GitHub persistence helpers
# =========================
import base64

GITHUB_TOKEN  = os.getenv("GITHUB_TOKEN")
GITHUB_OWNER  = os.getenv("GITHUB_REPO_OWNER", "wealthoceaninstitute-commits")
GITHUB_REPO   = os.getenv("GITHUB_REPO_NAME", "Multiuser_clients")
GITHUB_BRANCH = os.getenv("GITHUB_BRANCH", "main")

def github_write_file(rel_path: str, content: str):
    ...


# =========================
# Setup & Globals
# =========================
DIRS = ensure_data_dirs()
BASE_DIR = DIRS["BASE_DIR"]
CLIENTS_FOLDER = DIRS["CLIENTS_FOLDER"]
GROUPS_FOLDER = DIRS["GROUPS_FOLDER"]
COPYTRADING_FOLDER = DIRS["COPYTRADING_FOLDER"]


position_meta = {}
summary_data_global = {}
client_capital_map = {}
symbol_db_lock = threading.Lock()

GITHUB_CSV_URL = "https://raw.githubusercontent.com/Pramod541988/Stock_List/main/security_id.csv"
SQLITE_DB = "symbols.db"
TABLE_NAME = "symbols"

# Suppress verbose logs from uvicorn access (optional)
logging.getLogger("uvicorn.access").setLevel(logging.WARNING)

# Constants
Base_Url = "https://openapi.motilaloswal.com"
SourceID = "Desktop"
browsername = "chrome"
browserversion = "104"

# Active MOFSL sessions: name → (Mofsl, userid)
mofsl_sessions = {}

# =========================
# Symbol DB
# =========================
def recreate_sqlite_from_csv():
    """Recreate symbols.db from GitHub CSV."""
    r = requests.get(GITHUB_CSV_URL, timeout=30)
    r.raise_for_status()
    with open("security_id.csv", "wb") as f:
        f.write(r.content)

    if os.path.exists(SQLITE_DB):
        os.remove(SQLITE_DB)

    df = pd.read_csv("security_id.csv")
    conn = sqlite3.connect(SQLITE_DB)
    df.to_sql(TABLE_NAME, conn, index=False, if_exists="replace")
    conn.close()

# Backward-compat alias for your old route call
def update_symbol_db_from_github():
    recreate_sqlite_from_csv()

# Recreate DB at startup (will also run in FastAPI startup event)
recreate_sqlite_from_csv()

# =========================
# App & Templates
# =========================
BASE_DIR = os.path.abspath(os.environ.get("DATA_DIR", "./data"))
CLIENTS_ROOT = os.path.join(BASE_DIR, "Multiuser_clients")
MO_DIR       = os.path.join(CLIENTS_ROOT, "motilal")
os.makedirs(MO_DIR,   exist_ok=True)

app = FastAPI(title="Multi-broker Router")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://multibrokertrader-production.up.railway.app",
        "https://multibroker-trader.onrender.com",
        "https://multibrokertrader-production-b4e2.up.railway.app",
        "https://multibrokertradermultiuser-production-f735.up.railway.app",
        "https://multi-user-bay.vercel.app"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================
# Helpers
# =========================

@app.get("/health")
def health():
    return {"ok": True}

def load_all_clients():
    clients = []
    os.makedirs(CLIENTS_FOLDER, exist_ok=True)
    for fname in os.listdir(CLIENTS_FOLDER):
        if fname.endswith(".json"):
            try:
                with open(os.path.join(CLIENTS_FOLDER, fname), "r") as f:
                    clients.append(json.load(f))
            except Exception as e:
                print(f"❌ Failed to load {fname}: {e}")
    return clients

def login_client(client):
    name = client.get('name')
    userid = client.get('userid', '')
    password = client.get('password', '')
    pan = str(client.get('pan', ''))
    apikey = client.get('apikey', '')
    totp_key = client.get('totpkey', '')
    capital = client.get('capital', 0) or client.get('base_amount', 0) or 0

    client_capital_map[name] = capital
    session_status = False
    try:
        totp = pyotp.TOTP(totp_key).now() if totp_key else ""
        Mofsl = MOFSLOPENAPI(apikey, Base_Url, None, SourceID, browsername, browserversion)
        response = Mofsl.login(userid, password, pan, totp, userid)
        if response.get("status") == "SUCCESS":
            mofsl_sessions[name] = (Mofsl, userid)
            print(f"✅ Logged in: {name}")
            session_status = True
        else:
            print(f"❌ Login failed for {name}: {response.get('message', '')}")
    except Exception as e:
        print(f"❌ Login error for {name}: {str(e)}")

    # Update session status in client file
    client_file = None
    for fname in os.listdir(CLIENTS_FOLDER):
        if fname.endswith(".json") and userid in fname:
            client_file = os.path.join(CLIENTS_FOLDER, fname)
            break

    if client_file:
        try:
            with open(client_file, "r") as f:
                client_data = json.load(f)
            client_data["session_active"] = session_status
            with open(client_file, "w") as f:
                json.dump(client_data, f, indent=4)
        except Exception as e:
            print(f"Could not update session_active for {client_file}: {e}")

def get_client_capital(client_id):
    for fname in os.listdir(CLIENTS_FOLDER):
        if fname.endswith('.json'):
            with open(os.path.join(CLIENTS_FOLDER, fname), 'r') as f:
                client = json.load(f)
                cid = str(client.get('userid', '') or client.get('client_id', '')).strip()
                if cid == str(client_id):
                    try:
                        return float(client.get('capital', 0))
                    except Exception:
                        return 0
    return 0

def auto_qty(client_id, price):
    capital = get_client_capital(client_id)
    try:
        qty = math.floor(capital * 0.15 / price)
        return max(qty, 1)
    except Exception:
        return 1

# =========================
# Logging for copy trading
# =========================
today_date = datetime.now().strftime('%Y-%m-%d')
log_folder = os.path.join(os.getcwd(), today_date)
os.makedirs(log_folder, exist_ok=True)

child_loggers = {}
def get_child_logger(child_name):
    if child_name not in child_loggers:
        log_file = os.path.join(log_folder, f"{child_name}.log")
        logger = logging.getLogger(child_name)
        logger.setLevel(logging.DEBUG)
        if not logger.handlers:
            handler = logging.FileHandler(log_file)
            formatter = logging.Formatter('%(asctime)s - %(message)s')
            handler.setFormatter(formatter)
            logger.addHandler(handler)
        child_loggers[child_name] = logger
    return child_loggers[child_name]

def log_message(child_name, message):
    logger = get_child_logger(child_name)
    logger.debug(message)

def normalize_ordertype_copytrade(s: str) -> str:
    s = (s or "").upper()
    # collapse separators so STOP LOSS / STOP_LOSS / STOP-LOSS all match
    collapsed = s.replace("_", "").replace(" ", "").replace("-", "")
    return "STOPLOSS" if collapsed == "STOPLOSS" else s


# --- Core Copy-Trading Data ---
order_mapping = {}                  # {setup_name: {master_order_id: {child_id: child_order_id}}}
processed_order_ids_placed = {}     # {setup_name: set()}
processed_order_ids_canceled = {}   # {setup_name: set()}

def load_active_copy_setups():
    setups = []
    try:
        if not os.path.exists(COPYTRADING_FOLDER):
            print("[DEBUG] Copy trading folder missing!")
            return []
        for fname in os.listdir(COPYTRADING_FOLDER):
            if fname.endswith('.json'):
                try:
                    with open(os.path.join(COPYTRADING_FOLDER, fname), 'r') as f:
                        setup = json.load(f)
                        if isinstance(setup, dict) and setup.get("enabled", False):
                            setups.append(setup)
                except Exception as e:
                    print(f"[DEBUG] Failed to parse {fname}: {e}")
    except Exception as e:
        print(f"[DEBUG] Failed to load setups: {e}")
    return setups

def get_session_by_userid(userid):
    for name, (Mofsl, uid) in mofsl_sessions.items():
        if uid == userid:
            return name, Mofsl, uid
    return None, None, None

def fetch_master_orders(Mofsl_master, master_userid):
    try:
        # In your original copy loop you used GetOrderBook(master_userid) directly
        response = Mofsl_master.GetOrderBook(master_userid)
        if not response or response.get("status") != "SUCCESS":
            print(f"Failed to fetch master orders for {master_userid}: {response}")
            return []
        return response.get("data", [])
    except Exception as e:
        print(f"Error fetching master orders for {master_userid}: {e}")
        return []

def process_order(order, setup, child_accounts):
    setup_name = setup['name']
    master_order_id = order.get("uniqueorderid")
    order_time_str = order.get("recordinserttime")

    # Validity check
    if (not master_order_id or str(master_order_id) == "0" or
        not order_time_str or order_time_str in ("", "0", None)):
        print(f"[DEBUG] Skipping malformed order: {order}")
        return

    try:
        order_time_dt = datetime.strptime(order_time_str, "%d-%b-%Y %H:%M:%S")
        order_time = int(order_time_dt.timestamp())
        if order_time_dt.time() < datetime.strptime("09:00:00", "%H:%M:%S").time() or \
           order_time_dt.time() > datetime.strptime("15:30:00", "%H:%M:%S").time():
            amo_flag = "Y"
        else:
            amo_flag = "N"
    except Exception as e:
        print(f"[DEBUG] Invalid recordinserttime: {order_time_str} ({e})")
        return

    order_status = (order.get("orderstatus") or "").upper()
    order_type = (order.get("ordertype") or "").upper()

    # Initialize maps
    if setup_name not in processed_order_ids_placed:
        processed_order_ids_placed[setup_name] = set()
    if setup_name not in processed_order_ids_canceled:
        processed_order_ids_canceled[setup_name] = set()
    if setup_name not in order_mapping:
        order_mapping[setup_name] = {}

    current_time = int(time.time())

    # Placement logic
    if order_type == "MARKET" or order_status in ("CONFIRM", "TRADED"):
        if master_order_id in processed_order_ids_placed[setup_name]:
            return
        if (current_time - order_time) > 5:
            return  # too old to copy
        print(f"[DEBUG] Copying master order {master_order_id} ({order_status}, {order_type})...")
        for child in child_accounts:
            multiplier = setup["multipliers"].get(child["userid"], 1)

            # Fetch min lot qty
            min_qty = 1
            try:
                with symbol_db_lock:
                    conn = sqlite3.connect(SQLITE_DB)
                    cursor = conn.cursor()
                    cursor.execute("SELECT [Min Qty] FROM symbols WHERE [Security ID]=?", (order.get("symboltoken"),))
                    result = cursor.fetchone()
                    if result and result[0]:
                        min_qty = int(result[0])
                    conn.close()
            except Exception as e:
                print(f"[DEBUG] Failed to fetch min_qty for {order.get('symboltoken')}: {e}")

            master_qty = int(order.get("orderqty", 1))
            total_qty = master_qty * multiplier
            adjusted_qty = max(1, total_qty // min_qty)

            child_order_details = {
                "clientcode": child["userid"],
                "exchange": order.get("exchange", "NSE"),
                "symboltoken": order.get("symboltoken"),
                "buyorsell": order.get("buyorsell"),
                "ordertype": normalize_ordertype_copytrade(order.get("ordertype", "")),
                "producttype": order.get("producttype", "CNC"),
                "orderduration": order.get("validity", "DAY"),
                "price": order.get("price", 0),
                "triggerprice": order.get("triggerprice", 0),
                "quantityinlot": adjusted_qty,
                "disclosedquantity": 0,
                "amoorder": amo_flag,
                "algoid": "",
                "goodtilldate": "",
                "tag": setup_name
            }

            print(f"[DEBUG] Placing to child {child['userid']} ({child['name']}): {child_order_details}")
            _, Mofsl_child, uid_child = get_session_by_userid(child["userid"])
            if not Mofsl_child:
                log_message(child["name"], "[CopyTrading] No session found for child!")
                continue
            try:
                resp = Mofsl_child.PlaceOrder(child_order_details)
                print(f"[DEBUG] Child {uid_child} ({child['name']}) response: {resp}")
                order_id = resp.get("uniqueorderid") if resp else None
                if order_id:
                    order_mapping.setdefault(setup_name, {}).setdefault(master_order_id, {})[uid_child] = order_id
                else:
                    log_message(child["name"], "[CopyTrading] Order copy failed.")
            except Exception as e:
                print(f"[DEBUG] Exception placing child order for {uid_child}: {e}")
                log_message(child["name"], f"[CopyTrading] Exception: {e}")

        processed_order_ids_placed[setup_name].add(master_order_id)

    # Cancel logic
    elif order_status == "CANCEL":
        if master_order_id in processed_order_ids_canceled[setup_name] or (current_time - order_time) > 5:
            return
        print(f"[DEBUG] Master order {master_order_id} CANCEL detected. Propagating...")
        child_orders = order_mapping.get(setup_name, {}).get(master_order_id, {})
        if not child_orders:
            print(f"[DEBUG] No mapping found for master order {master_order_id} in setup {setup_name}")
            processed_order_ids_canceled[setup_name].add(master_order_id)
            return

        for uid_child, child_order_id in child_orders.items():
            _, Mofsl_child, _ = get_session_by_userid(uid_child)
            if not Mofsl_child:
                print(f"[DEBUG] No session found for child {uid_child}")
                continue
            try:
                resp = Mofsl_child.CancelOrder(child_order_id, uid_child)
                print(f"[DEBUG] Cancel response for child {uid_child}: {resp}")
            except Exception as e:
                print(f"[DEBUG] Exception during cancel for child {uid_child}: {e}")
        processed_order_ids_canceled[setup_name].add(master_order_id)

def synchronize_orders():
    setups = load_active_copy_setups()
    threads = []

    def handle_setup(setup):
        master_id = setup['master']
        child_ids = setup.get('children') or []
        # Build child info list
        child_accounts = []
        for cid in child_ids:
            name, _, uid = get_session_by_userid(cid)
            if name:
                child_accounts.append({"userid": uid, "name": name})

        name_master, Mofsl_master, uid_master = get_session_by_userid(master_id)
        if not Mofsl_master:
            print(f"❌ Master session not found for {master_id}")
            return

        master_orders = fetch_master_orders(Mofsl_master, uid_master) or []
        order_threads = []
        for order in master_orders:
            t = threading.Thread(target=process_order, args=(order, setup, child_accounts))
            t.start()
            order_threads.append(t)
        for t in order_threads:
            t.join()

    for setup in setups:
        t = threading.Thread(target=handle_setup, args=(setup,))
        t.start()
        threads.append(t)
    for t in threads:
        t.join()

def motilal_copy_trading_loop():
    print("Motilal Copy Trading Engine running...")
    last_enabled = set()
    while True:
        try:
            setups = load_active_copy_setups()
            enabled_now = set(s['name'] for s in setups)
            for sname in enabled_now - last_enabled:
                print(f"[DEBUG] Copy Trading ENABLED for setup: {sname}")
            for sname in last_enabled - enabled_now:
                print(f"[DEBUG] Copy Trading DISABLED for setup: {sname}")
            last_enabled = enabled_now

            synchronize_orders()
            time.sleep(1)  # 1 sec refresh
        except Exception as e:
            print("Error in synchronization:", str(e))

# =========================
# FastAPI Lifecycle
# =========================
@app.on_event("startup")
def on_startup():
    # Build/refresh symbols DB
    try:
        recreate_sqlite_from_csv()
    except Exception as e:
        print("❌ Failed to init symbol DB:", e)

    # Login all clients concurrently
    all_clients = load_all_clients()
    if all_clients:
        with ThreadPoolExecutor(max_workers=20) as executor:
            list(executor.map(login_client, all_clients))

    # Start background copy-trading loop (daemon thread)
    threading.Thread(target=motilal_copy_trading_loop, daemon=True).start()

    # Optionally open browser to index page
    def open_browser():
        try:
            webbrowser.open_new("http://127.0.0.1:5001/")
        except Exception:
            pass
    #threading.Timer(1.5, open_browser).start()

# =========================
# Routes (ported 1:1)
# =========================
@app.get("/", response_class=HTMLResponse)
def index(request: Request):
    try:
        conn = sqlite3.connect(SQLITE_DB)
        cur = conn.execute(f"SELECT DISTINCT [Stock Symbol] FROM {TABLE_NAME}")
        symbols = [row[0] for row in cur.fetchall()]
        conn.close()
        clients = load_all_clients()
        return templates.TemplateResponse("index.html", {"request": request, "symbols": symbols, "clients": clients})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal Error: {e}")

@app.get("/search_symbols")
def search_symbols(q: str = Query("", alias="q"), exchange: str = Query("", alias="exchange")):
    query = (q or "").strip()
    exchange_filter = (exchange or "").strip().upper()

    if not query:
        return JSONResponse(content={"results": []})

    words = [w for w in query.lower().split() if w]
    if not words:
        return JSONResponse(content={"results": []})

    where_clauses = []
    params = []
    for w in words:
        where_clauses.append("LOWER([Stock Symbol]) LIKE ?")
        params.append(f"%{w}%")

    where_sql = " AND ".join(where_clauses)
    if exchange_filter:
        where_sql += " AND UPPER(Exchange) = ?"
        params.append(exchange_filter)

    sql = f"""
        SELECT Exchange, [Stock Symbol], [Security ID]
        FROM {TABLE_NAME}
        WHERE {where_sql}
        ORDER BY [Stock Symbol]
        LIMIT 20
    """

    with symbol_db_lock:
        conn = sqlite3.connect(SQLITE_DB)
        cur = conn.execute(sql, params)
        rows = cur.fetchall()
        conn.close()

    results = [
        {"id": f"{row[0]}|{row[1]}|{row[2]}", "text": f"{row[0]} | {row[1]}"}
        for row in rows
    ]
    return JSONResponse(content={"results": results})

@app.post("/add_client")
async def add_client(
    background_tasks: BackgroundTasks,
    payload: dict = Body(...)
):
    name = (payload.get("name") or "").strip()
    userid = (payload.get("userid") or "").strip()

    if not name or not userid:
        raise HTTPException(status_code=400, detail="Name and User ID required")

    safe_name = name.replace(" ", "_")
    filename = f"{safe_name}_{userid}.json"
    filepath = os.path.join(CLIENTS_FOLDER, filename)

    try:
        # 1️⃣ Save locally (runtime source of truth)
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=4)

        # 2️⃣ Mirror to GitHub (persistence)
        github_write_file(
            rel_path=f"clients/{filename}",
            content=json.dumps(payload, indent=4)
        )

        # 3️⃣ Background login (non-blocking)
        background_tasks.add_task(login_client, payload)

        return {
            "success": True,
            "message": "Client saved locally and synced to Git. Login started."
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



@app.get("/get_clients")
def get_clients():
    clients = []

    if not os.path.exists(CLIENTS_FOLDER):
        return {"clients": []}

    for fname in os.listdir(CLIENTS_FOLDER):
        if not fname.endswith(".json"):
            continue

        try:
            with open(os.path.join(CLIENTS_FOLDER, fname), "r", encoding="utf-8") as f:
                client = json.load(f)

            clients.append({
                "name": client.get("name", ""),
                "client_id": client.get("userid", ""),
                "capital": client.get("capital", ""),
                "session": "Logged in" if client.get("session_active") else "Logged out"
            })

        except Exception:
            continue

    return {"clients": clients}


@app.post("/refresh_symbols")
def refresh_symbols():
    try:
        update_symbol_db_from_github()
        return {"status": "success", "message": "Symbol master refreshed from GitHub."}
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/place_order")
async def place_order(payload: dict = Body(...)):
    data = payload
    print("📨 Received from frontend:", data)
    symbol = data.get("symbol")
    exchange, stock_symbol, symboltoken = symbol.split('|')
    symboltoken = int(symboltoken)

    # Shared fields
    groupacc = data.get("groupacc", False)
    groups = data.get("groups", [])
    clients = data.get("clients", [])
    diffQty = data.get("diffQty", False)
    multiplier = data.get("multiplier", False)
    qtySelection = data.get("qtySelection", "manual")
    quantityinlot = int(data.get("quantityinlot", 0))
    perClientQty = data.get("perClientQty", {})
    perGroupQty = data.get("perGroupQty", {})
    action = data.get("action")
    ordertype = data.get("ordertype")
    producttype = data.get("producttype")
    orderduration = data.get("orderduration")
    exchange_val = data.get("exchange")
    price = float(data.get("price", 0))
    triggerprice = float(data.get("triggerprice", 0))
    disclosedquantity = int(data.get("disclosedquantity", 0))
    amoorder = data.get("amoorder", "N")

    responses = {}
    threads = []
    thread_lock = threading.Lock()

    def place_order_for_client(tag, client_id, this_qty):
        session = next(((Mofsl, userid) for name, (Mofsl, userid) in mofsl_sessions.items() if userid == client_id), None)
        if not session:
            with thread_lock:
                responses[f"{tag}:{client_id}" if tag else client_id] = {"status": "ERROR", "message": "Session not found"}
            return
        Mofsl, userid = session

        order_payload = {
            "clientcode": client_id,
            "exchange": (exchange_val or exchange).upper(),
            "symboltoken": symboltoken,
            "buyorsell": action,
            "ordertype": ordertype,
            "producttype": producttype,
            "orderduration": orderduration,
            "price": price,
            "triggerprice": triggerprice,
            "quantityinlot": this_qty,
            "disclosedquantity": disclosedquantity,
            "amoorder": amoorder,
            "algoid": "",
            "goodtilldate": "",
            "tag": tag or ""
        }
        print(f"🛒 Order payload for {tag}-{client_id}:", order_payload)
        try:
            response = Mofsl.PlaceOrder(order_payload)
        except Exception as e:
            response = {"status": "ERROR", "message": str(e)}

        with thread_lock:
            responses[f"{tag}:{client_id}" if tag else client_id] = response

    if groupacc:
        group_client_pairs = []
        for group_name in groups:
            group_file = os.path.join(GROUPS_FOLDER, f"{group_name.replace(' ', '_')}.json")
            if not os.path.exists(group_file):
                responses[group_name] = {"status": "ERROR", "message": f"Group file not found for {group_name}"}
                continue
            with open(group_file, 'r') as f:
                group_data = json.load(f)
                group_clients = group_data.get("clients", [])
                group_multiplier = int(group_data.get("multiplier", 1))
                for client_id in group_clients:
                    if qtySelection == "auto":
                        qty = auto_qty(client_id, price)
                    elif diffQty:
                        qty = int(perGroupQty.get(group_name, 0))
                    elif multiplier:
                        qty = quantityinlot * group_multiplier
                    else:
                        qty = quantityinlot
                    threads.append(threading.Thread(target=place_order_for_client, args=(group_name, client_id, qty)))
    else:
        for client_id in clients:
            if qtySelection == "auto":
                qty = auto_qty(client_id, price)
            elif diffQty:
                qty = int(perClientQty.get(str(client_id), 0))
            else:
                qty = quantityinlot
            threads.append(threading.Thread(target=place_order_for_client, args=(None, client_id, qty)))

    for t in threads:
        t.start()
    for t in threads:
        t.join()

    return {"status": "completed", "order_responses": responses}

@app.get("/get_orders")
def get_orders():
    orders_data = OrderedDict({
        "pending": [],
        "traded": [],
        "rejected": [],
        "cancelled": [],
        "others": []
    })

    for name, (Mofsl, userid) in mofsl_sessions.items():
        try:
            today_date = datetime.now().strftime("%d-%b-%Y 09:00:00")
            order_book_info = {"clientcode": userid, "datetimestamp": today_date}
            response = Mofsl.GetOrderBook(order_book_info)
            if response and response.get("status") != "SUCCESS":
                logging.error(f"❌ Error fetching orders for {name}: {response.get('message', 'No message')}")

            orders = response.get("data", []) if response else []
            if not isinstance(orders, list):
                orders = []

            for order in orders:
                order_data = {
                    "name": name,
                    "symbol": order.get("symbol", ""),
                    "transaction_type": order.get("buyorsell", ""),
                    "quantity": order.get("orderqty", ""),
                    "price": order.get("price", ""),
                    "status": order.get("orderstatus", ""),
                    "order_id": order.get("uniqueorderid", "")
                }
                status = order.get("orderstatus", "").lower()
                if "confirm" in status:
                    orders_data["pending"].append(order_data)
                elif "traded" in status:
                    orders_data["traded"].append(order_data)
                elif "rejected" in status or "error" in status:
                    orders_data["rejected"].append(order_data)
                elif "cancel" in status:
                    orders_data["cancelled"].append(order_data)
                else:
                    orders_data["others"].append(order_data)
        except Exception as e:
            print(f"❌ Error fetching orders for {name}: {e}")

    return dict(orders_data)

@app.get("/get_positions")
def get_positions():
    positions_data = {"open": [], "closed": []}
    position_meta.clear()

    for name, (Mofsl, userid) in mofsl_sessions.items():
        try:
            response = Mofsl.GetPosition()
            if response and response.get("status") != "SUCCESS":
                continue
            positions = response.get("data", []) if response else []
            if not isinstance(positions, list):
                positions = []

            for pos in positions:
                quantity = pos.get("buyquantity", 0) - pos.get("sellquantity", 0)
                booked_profit = pos.get("bookedprofitloss", 0)
                buy_avg = (pos.get("buyamount", 0) / max(1, pos.get("buyquantity", 1))) if pos.get("buyquantity", 0) > 0 else 0
                sell_avg = (pos.get("sellamount", 0) / max(1, pos.get("sellquantity", 1))) if pos.get("sellquantity", 0) > 0 else 0

                net_profit = (
                    (pos.get("LTP", 0) - buy_avg) * quantity if quantity > 0
                    else (sell_avg - buy_avg) * abs(quantity) if quantity < 0
                    else booked_profit
                )

                symbol = pos.get("symbol", "")
                exchange = pos.get("exchange", "")
                symboltoken = pos.get("symboltoken", "")
                producttype = pos.get("productname", "")

                if quantity != 0:
                    position_meta[(name, symbol)] = {
                        "exchange": exchange,
                        "symboltoken": symboltoken,
                        "producttype": producttype
                    }

                row = {
                    "name": name,
                    "symbol": symbol,
                    "quantity": quantity,
                    "buy_avg": round(buy_avg, 2),
                    "sell_avg": round(sell_avg, 2),
                    "net_profit": round(net_profit, 2)
                }
                if quantity == 0:
                    positions_data["closed"].append(row)
                else:
                    positions_data["open"].append(row)
        except Exception as e:
            print(f"❌ Error fetching positions for {name}: {e}")

    return positions_data

@app.post("/cancel_order")
async def cancel_order(payload: dict = Body(...)):
    data = payload
    orders = data.get("orders", [])
    if not orders:
        raise HTTPException(status_code=400, detail="❌ No orders received for cancellation.")

    response_messages = []
    threads = []
    thread_lock = threading.Lock()

    def cancel_single_order(order):
        name = order.get("name")
        order_id = order.get("order_id")
        if not name or not order_id:
            with thread_lock:
                response_messages.append(f"❌ Missing data in order: {order}")
            return

        session = mofsl_sessions.get(name)
        if not session:
            with thread_lock:
                response_messages.append(f"❌ Session not found for: {name}")
            return

        Mofsl, userid = session
        try:
            cancel_response = Mofsl.CancelOrder(order_id, userid)
            message = (cancel_response.get("message", "") or "").lower()
            with thread_lock:
                if "cancel order request sent" in message:
                    response_messages.append(f"✅ Cancelled Order {order_id} for {name}")
                else:
                    response_messages.append(f"❌ Failed to cancel Order {order_id} for {name}: {cancel_response.get('message', '')}")
        except Exception as e:
            with thread_lock:
                response_messages.append(f"❌ Error cancelling {order_id} for {name}: {str(e)}")

    for order in orders:
        t = threading.Thread(target=cancel_single_order, args=(order,))
        t.start()
        threads.append(t)
    for t in threads:
        t.join()

    return {"message": response_messages}

@app.post("/close_position")
async def close_position(payload: dict = Body(...)):
    data = payload
    positions = data.get("positions", [])
    messages = []
    threads = []
    thread_lock = threading.Lock()

    # Load min qty map once
    conn = sqlite3.connect(SQLITE_DB)
    cursor = conn.cursor()
    min_qty_map = {}
    try:
        cursor.execute("SELECT [Security ID], [Min Qty] FROM symbols")
        for sid, qty in cursor.fetchall():
            if sid:
                min_qty_map[str(sid)] = int(qty) if qty else 1
    except Exception as e:
        print(f"❌ Error reading min_qty from DB: {e}")
    conn.close()

    def close_single_position(pos):
        name = pos.get("name")
        symbol = pos.get("symbol")
        quantity = float(pos.get("quantity", 0))
        transaction_type = pos.get("transaction_type")

        meta = position_meta.get((name, symbol))
        session_data = mofsl_sessions.get(name)
        if not meta or not session_data:
            with thread_lock:
                messages.append(f"❌ Missing data for {name} - {symbol}")
            return

        Mofsl, userid = session_data
        symboltoken = meta.get("symboltoken")
        min_qty = min_qty_map.get(str(symboltoken), 1)
        lots = max(1, int(quantity // min_qty)) if min_qty > 0 else int(quantity)

        order = {
            "clientcode": userid,
            "exchange": meta["exchange"],
            "symboltoken": symboltoken,
            "buyorsell": transaction_type.upper(),
            "ordertype": "MARKET",
            "producttype": meta["producttype"],
            "orderduration": "DAY",
            "price": 0,
            "triggerprice": 0,
            "quantityinlot": lots,
            "disclosedquantity": 0,
            "amoorder": "N",
            "algoid": "",
            "goodtilldate": "",
            "tag": ""
        }
        try:
            response = Mofsl.PlaceOrder(order)
            if response.get("status") == "SUCCESS":
                with thread_lock:
                    messages.append(f"✅ Closed: {name} - {symbol}")
            else:
                with thread_lock:
                    messages.append(f"❌ Failed: {name} - {symbol} - {response.get('message', 'Unknown')}")
        except Exception as e:
            with thread_lock:
                messages.append(f"❌ Error for {name} - {symbol}: {str(e)}")

    for pos in positions:
        t = threading.Thread(target=close_single_position, args=(pos,))
        t.start()
        threads.append(t)
    for t in threads:
        t.join()

    return {"message": messages}

@app.post("/convert_position")
async def convert_position(payload: dict = Body(...)):
    """
    Payload:
    {
      "positions": [
        {
          "name": "ClientName",
          "symbol": "RELIANCE",
          "quantity": 1,
          "exchange": "NSE",
          "oldproduct": "NORMAL",
          "newproduct": "VALUEPLUS"
        }
      ]
    }
    """
    data = payload or {}
    items = data.get("positions", [])
    if not isinstance(items, list) or not items:
        raise HTTPException(status_code=400, detail="No positions received for conversion.")

    messages = []
    threads = []
    thread_lock = threading.Lock()

    def convert_single(pos):
        name = (pos.get("name") or "").strip()
        symbol = (pos.get("symbol") or "").strip()
        quantity = int(pos.get("quantity") or 0)
        req_exchange = (pos.get("exchange") or "NSE").upper()
        oldproduct = (pos.get("oldproduct") or "NORMAL").upper()
        newproduct = (pos.get("newproduct") or "DELIVERY").upper()

        if not name or not symbol or quantity <= 0:
            with thread_lock:
                messages.append(f"❌ Invalid data for position: {pos}")
            return

        # lookup session and symbol meta captured by /get_positions
        meta = position_meta.get((name, symbol))
        session_data = mofsl_sessions.get(name)

        if not meta or not session_data:
            with thread_lock:
                messages.append(f"❌ Missing data for {name} - {symbol} (no session/meta)")
            return

        Mofsl, userid = session_data
        scripcode = meta.get("symboltoken")  # Security ID
        exchange = (meta.get("exchange") or req_exchange or "NSE").upper()

        # Build MOFSL payload
        PositionConversionInfo = {
            "clientcode": userid,
            "exchange": exchange,
            "scripcode": int(scripcode),
            "quantity": int(quantity),
            "oldproduct": oldproduct,
            "newproduct": newproduct
        }

        try:
            resp = Mofsl.PositionConversion(PositionConversionInfo)
            if resp and resp.get("status") == "SUCCESS":
                with thread_lock:
                    messages.append(f"✅ Converted {name} · {symbol} · {oldproduct}→{newproduct} · qty {quantity}")
            else:
                with thread_lock:
                    messages.append(f"❌ Failed {name} · {symbol}: {resp.get('message', 'Unknown error') if isinstance(resp, dict) else resp}")
        except Exception as e:
            with thread_lock:
                messages.append(f"❌ Error {name} · {symbol}: {str(e)}")

    for pos in items:
        t = threading.Thread(target=convert_single, args=(pos,))
        t.start()
        threads.append(t)

    for t in threads:
        t.join()

    return {"message": messages}


def get_available_margin(Mofsl, clientcode):
    try:
        margin_response = Mofsl.GetReportMarginSummary(clientcode)
        if margin_response.get("status") != "SUCCESS":
            return 0
        for item in margin_response.get("data", []):
            if item.get("particulars") == "Total Available Margin for Cash":
                return float(item.get("amount", 0))
    except Exception as e:
        print(f"❌ Error fetching margin for {clientcode}: {e}")
    return 0

@app.get("/get_holdings")
def get_holdings():
    holdings_data = []
    summary_data = {}

    for name, (Mofsl, userid) in mofsl_sessions.items():
        try:
            response = Mofsl.GetDPHolding(userid)
            if response.get("status") != "SUCCESS":
                continue

            holdings = response.get("data", [])
            invested = 0.0
            total_pnl = 0.0

            for holding in holdings:
                symbol = holding.get("scripname", "").strip()
                quantity = float(holding.get("dpquantity", 0))
                buy_avg = float(holding.get("buyavgprice", 0))
                scripcode = holding.get("nsesymboltoken")
                if not scripcode or quantity <= 0:
                    continue

                ltp_request = {"clientcode": userid, "exchange": "NSE", "scripcode": int(scripcode)}
                ltp_response = Mofsl.GetLtp(ltp_request)
                ltp = float(ltp_response.get("data", {}).get("ltp", 0)) / 100

                pnl = round((ltp - buy_avg) * quantity, 2)
                invested += quantity * buy_avg
                total_pnl += pnl

                holdings_data.append({
                    "name": name,
                    "symbol": symbol,
                    "quantity": quantity,
                    "buy_avg": round(buy_avg, 2),
                    "ltp": round(ltp, 2),
                    "pnl": pnl
                })

            capital = client_capital_map.get(name, 0)
            try:
                capital = float(capital)
            except Exception:
                capital = 0.0

            current_value = invested + total_pnl
            available_margin = get_available_margin(Mofsl, userid)
            net_gain = round((current_value + available_margin) - capital, 2)

            summary_data[name] = {
                "name": name,
                "capital": round(capital, 2),
                "invested": round(invested, 2),
                "pnl": round(total_pnl, 2),
                "current_value": round(current_value, 2),
                "available_margin": round(available_margin, 2),
                "net_gain": net_gain
            }

        except Exception as e:
            print(f"❌ Error fetching holdings for {name}: {e}")

    global summary_data_global
    summary_data_global = summary_data

    return {"holdings": holdings_data, "summary": list(summary_data.values())}

@app.get("/get_summary")
def get_summary():
    global summary_data_global
    return {"summary": list(summary_data_global.values())}

@app.post("/delete_client")
async def delete_client(payload: dict = Body(...)):
    clients = payload.get("clients", [])
    results = []

    for client in clients:
        client_id = client.get("client_id")
        name = client.get("name")

        if not client_id or not name:
            results.append("❌ Missing name or client_id")
            continue

        prefix = f"{name.replace(' ', '_')}_{client_id}"
        deleted = False

        for fname in os.listdir(CLIENTS_FOLDER):
            if fname.startswith(prefix) and fname.endswith(".json"):
                path = os.path.join(CLIENTS_FOLDER, fname)
                try:
                    os.remove(path)
                    github_delete_file(f"clients/{fname}")
                    results.append(f"✅ Deleted client: {name} ({client_id})")
                    deleted = True
                except Exception as e:
                    results.append(f"❌ Error deleting {name}: {e}")
                break

        if not deleted:
            results.append(f"⚠️ Not found: {name} ({client_id})")

    return {"message": "\n".join(results)}

@app.post("/create_group")
async def create_group(payload: dict = Body(...)):
    group_name = (payload.get("group_name") or "").strip()
    clients = payload.get("clients", [])
    multiplier = payload.get("multiplier", 1)

    if not group_name or not clients:
        raise HTTPException(status_code=400, detail="Group name and clients required")

    safe_name = group_name.replace(" ", "_")
    filename = f"{safe_name}.json"
    filepath = os.path.join(GROUPS_FOLDER, filename)

    data = {
        "group_name": group_name,
        "clients": clients,
        "multiplier": multiplier
    }

    try:
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=4)

        github_write_file(
            f"groups/{filename}",
            json.dumps(data, indent=4)
        )

        return {"success": True, "message": f'Group "{group_name}" created'}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/get_groups")
def get_groups():
    groups = []
    client_id_to_name = {}

    for fname in os.listdir(CLIENTS_FOLDER):
        if fname.endswith(".json"):
            try:
                with open(os.path.join(CLIENTS_FOLDER, fname), "r") as f:
                    c = json.load(f)
                    client_id_to_name[c.get("userid")] = c.get("name")
            except Exception:
                continue

    if os.path.exists(GROUPS_FOLDER):
        for fname in os.listdir(GROUPS_FOLDER):
            if fname.endswith(".json"):
                try:
                    with open(os.path.join(GROUPS_FOLDER, fname), "r") as f:
                        g = json.load(f)

                    client_ids = g.get("clients", [])
                    groups.append({
                        "group_name": g.get("group_name", ""),
                        "no_of_clients": len(client_ids),
                        "multiplier": g.get("multiplier", 1),
                        "client_names": [
                            client_id_to_name.get(cid, cid) for cid in client_ids
                        ]
                    })
                except Exception:
                    continue

    return {"groups": groups}

@app.post("/delete_group")
async def delete_group(payload: dict = Body(...)):
    groups = payload.get("groups", [])
    results = []

    for group_name in groups:
        filename = f"{group_name.replace(' ', '_')}.json"
        path = os.path.join(GROUPS_FOLDER, filename)

        if not os.path.exists(path):
            results.append(f"⚠️ Not found: {group_name}")
            continue

        try:
            os.remove(path)
            github_delete_file(f"groups/{filename}")
            results.append(f"✅ Deleted group: {group_name}")
        except Exception as e:
            results.append(f"❌ Error deleting {group_name}: {e}")

    return {"message": "\n".join(results)}
@app.post("/save_copytrading_setup")
async def save_copytrading_setup(payload: dict = Body(...)):
    name = (payload.get("name") or "").strip()
    master = payload.get("master")
    children = payload.get("children", [])
    multipliers = payload.get("multipliers", {})

    if not name or not master or not children:
        raise HTTPException(status_code=400, detail="Name, master and children required")

    safe_name = "".join(c if c.isalnum() or c in "_-" else "_" for c in name)
    dt = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{safe_name}_{dt}.json"
    filepath = os.path.join(COPYTRADING_FOLDER, filename)

    data = {
        "name": name,
        "master": master,
        "children": children,
        "multipliers": multipliers,
        "enabled": payload.get("enabled", False)
    }

    try:
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=4)

        github_write_file(
            f"copytrading_setups/{filename}",
            json.dumps(data, indent=4)
        )

        return {"success": True, "message": "Setup saved", "setup_id": filename[:-5]}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
@app.get("/list_copytrading_setups")
def list_copytrading_setups():
    setups = []

    if not os.path.exists(COPYTRADING_FOLDER):
        return {"setups": []}

    for fname in os.listdir(COPYTRADING_FOLDER):
        if not fname.endswith(".json"):
            continue

        try:
            with open(os.path.join(COPYTRADING_FOLDER, fname), "r") as f:
                s = json.load(f)

            setups.append({
                "setup_id": fname[:-5],
                "name": s.get("name", ""),
                "master": s.get("master", ""),
                "children": s.get("children", []),
                "enabled": s.get("enabled", False)
            })
        except Exception:
            continue

    return {"setups": setups}

@app.post("/delete_copy_setup")
async def delete_copy_setup(payload: dict = Body(...)):
    setup_id = payload.get("setup_id")
    if not setup_id:
        raise HTTPException(status_code=400, detail="setup_id required")

    filename = setup_id + ".json"
    filepath = os.path.join(COPYTRADING_FOLDER, filename)

    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Setup not found")

    try:
        os.remove(filepath)
        github_delete_file(f"copytrading_setups/{filename}")
        return {"success": True, "message": "Setup deleted"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/enable_copy_setup")
async def enable_copy_setup(setup_id: str = Form(...)):
    filename = f"{setup_id}.json"
    file_path = os.path.join(COPYTRADING_FOLDER, filename)

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Setup file not found.")

    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        data["enabled"] = True

        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=4)

        # 🔁 mirror to GitHub
        github_write_file(
            f"copytrading_setups/{filename}",
            json.dumps(data, indent=4)
        )

        return {"success": True, "message": "Setup enabled."}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/disable_copy_setup")
async def disable_copy_setup(setup_id: str = Form(...)):
    filename = f"{setup_id}.json"
    file_path = os.path.join(COPYTRADING_FOLDER, filename)

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Setup file not found.")

    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        data["enabled"] = False

        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=4)

        # 🔁 mirror to GitHub
        github_write_file(
            f"copytrading_setups/{filename}",
            json.dumps(data, indent=4)
        )

        return {"success": True, "message": "Setup disabled."}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =========================
# Main
# =========================
if __name__ == "__main__":
    # Keep port 5001 to match your original app/open_browser behavior
    uvicorn.run(app, host="127.0.0.1", port=5001, reload=False, access_log=False)




