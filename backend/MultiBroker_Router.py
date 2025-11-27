# MultiBroker_Router.py
#
# Unified backend for:
# - User register / login / me
# - Per-user clients (multi-broker)
# - Groups (per user)
# - Copy-trading setups (per user)
#
# Auth header: x-auth-token
# Frontend stores token in localStorage as "woi_token"

from fastapi import FastAPI, HTTPException, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
import os
import json
from datetime import datetime
import uuid

APP_TITLE = "Wealth Ocean Multi-Broker Router"
APP_VERSION = "0.3.0"

app = FastAPI(title=APP_TITLE, version=APP_VERSION)

# ---------------------------------------------------------------------
# CORS – allow Next.js frontend to talk to this API
# ---------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # tighten later
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------
# Basic filesystem helpers
# ---------------------------------------------------------------------
DATA_DIR = os.path.abspath(
    os.getenv("DATA_DIR", os.path.join(os.path.dirname(__file__), "data"))
)
USERS_FILE = os.path.join(DATA_DIR, "users.json")


def ensure_dir(path: str) -> None:
    os.makedirs(path, exist_ok=True)


def load_json(path: str, default):
    if not os.path.exists(path):
        return default
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def save_json(path: str, data) -> None:
    ensure_dir(os.path.dirname(path))
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    os.replace(tmp, path)


def now_str() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


# ---------------------------------------------------------------------
# In-memory token store (simple for now)
# ---------------------------------------------------------------------
ACTIVE_TOKENS: Dict[str, str] = {}  # token -> username


# ---------------------------------------------------------------------
# User models
# ---------------------------------------------------------------------
class UserRegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=4, max_length=100)


class UserLoginRequest(BaseModel):
    username: str
    password: str


class AuthResponse(BaseModel):
    success: bool = True
    username: str
    token: str


def _load_users() -> Dict[str, Any]:
    data = load_json(USERS_FILE, {})
    if not isinstance(data, dict):
        data = {}
    return data


def _save_users(data: Dict[str, Any]) -> None:
    save_json(USERS_FILE, data)


def _hash_password(raw: str) -> str:
    import hashlib

    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _verify_password(raw: str, hashed: str) -> bool:
    return _hash_password(raw) == hashed


def _user_root(username: str) -> str:
    return os.path.join(DATA_DIR, "users", username)


def _clients_root(username: str) -> str:
    return os.path.join(_user_root(username), "clients")


def _groups_file(username: str) -> str:
    return os.path.join(_user_root(username), "groups.json")


def _copy_file(username: str) -> str:
    return os.path.join(_user_root(username), "copy_setups.json")


# ---------------------------------------------------------------------
# Auth dependency
# ---------------------------------------------------------------------
def get_current_user(x_auth_token: str = Header(..., alias="x-auth-token")) -> str:
    """
    Read user from x-auth-token header.
    On frontend, store token under localStorage 'woi_token' and
    send it as x-auth-token.
    """
    username = ACTIVE_TOKENS.get(x_auth_token)
    if not username:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return username


# ---------------------------------------------------------------------
# Auth routes – /users/register, /users/login, /users/me
# ---------------------------------------------------------------------
@app.post("/users/register", response_model=AuthResponse)
def register(req: UserRegisterRequest):
    users = _load_users()
    uname = req.username.strip()
    if uname in users:
        raise HTTPException(status_code=400, detail="Username already exists")

    users[uname] = {
        "password_hash": _hash_password(req.password),
        "created_at": now_str(),
        "updated_at": now_str(),
        "email": None,
    }
    _save_users(users)

    # Ensure user folders
    user_root = _user_root(uname)
    ensure_dir(user_root)
    ensure_dir(_clients_root(uname))

    # Auto-login
    token = uuid.uuid4().hex
    ACTIVE_TOKENS[token] = uname

    return AuthResponse(success=True, username=uname, token=token)


@app.post("/users/login", response_model=AuthResponse)
def login(req: UserLoginRequest):
    users = _load_users()
    uname = req.username.strip()

    if uname not in users:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    stored = users[uname]
    if not _verify_password(req.password, stored.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    stored["last_login_at"] = now_str()
    _save_users(users)

    token = uuid.uuid4().hex
    ACTIVE_TOKENS[token] = uname

    return AuthResponse(success=True, username=uname, token=token)


@app.get("/users/me")
def me(current_user: str = Depends(get_current_user)):
    return {"username": current_user}


# ---------------------------------------------------------------------
# Clients (Per-user, multi-broker)
# ---------------------------------------------------------------------
class ClientPayload(BaseModel):
    broker: str
    client_id: str
    display_name: Optional[str] = None
    capital: Optional[float] = None
    creds: Dict[str, Any]


def _client_path(username: str, broker: str, client_id: str) -> str:
    safe_broker = broker.replace("/", "_")
    safe_client = client_id.replace("/", "_")
    return os.path.join(_clients_root(username), safe_broker, f"{safe_client}.json")


def _add_or_update_client(username: str, payload: ClientPayload) -> Dict[str, Any]:
    path = _client_path(username, payload.broker, payload.client_id)
    ensure_dir(os.path.dirname(path))

    record = {
        "broker": payload.broker,
        "client_id": payload.client_id,
        "display_name": payload.display_name or payload.client_id,
        "capital": payload.capital,
        "creds": payload.creds,
        "updated_at": now_str(),
    }

    if not os.path.exists(path):
        record["created_at"] = now_str()
    else:
        existing = load_json(path, {})
        if "created_at" in existing:
            record["created_at"] = existing["created_at"]

    save_json(path, record)
    return record


def _list_clients(username: str) -> Dict[str, List[Dict[str, Any]]]:
    root = _clients_root(username)
    result: Dict[str, List[Dict[str, Any]]] = {}

    if not os.path.isdir(root):
        return result

    for broker in os.listdir(root):
        broker_dir = os.path.join(root, broker)
        if not os.path.isdir(broker_dir):
            continue

        items: List[Dict[str, Any]] = []
        for fname in os.listdir(broker_dir):
            if not fname.endswith(".json"):
                continue

            fpath = os.path.join(broker_dir, fname)
            data = load_json(fpath, {})
            if not data:
                continue

            items.append(
                {
                    "broker": broker,
                    "client_id": data.get("client_id"),
                    "display_name": data.get("display_name") or data.get("client_id"),
                    "capital": data.get("capital"),
                    "created_at": data.get("created_at"),
                    "updated_at": data.get("updated_at"),
                }
            )
        result[broker] = items

    return result


def _delete_client(username: str, broker: str, client_id: str) -> None:
    path = _client_path(username, broker, client_id)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Client not found")
    os.remove(path)


@app.post("/clients/add")
def clients_add(
    payload: ClientPayload, current_user: str = Depends(get_current_user)
):
    record = _add_or_update_client(current_user, payload)
    return {"status": "ok", "client": record}


@app.get("/clients/list")
def clients_list(current_user: str = Depends(get_current_user)):
    return {"status": "ok", "clients": _list_clients(current_user)}


@app.get("/clients/get/{broker}/{client_id}")
def clients_get(
    broker: str, client_id: str, current_user: str = Depends(get_current_user)
):
    path = _client_path(current_user, broker, client_id)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Client not found")
    data = load_json(path, {})
    return {"status": "ok", "client": data}


@app.delete("/clients/delete/{broker}/{client_id}")
def clients_delete(
    broker: str, client_id: str, current_user: str = Depends(get_current_user)
):
    _delete_client(current_user, broker, client_id)
    return {"status": "ok"}


# --- Alias routes to match existing frontend: /users/* -------------------------
class DeleteClientBody(BaseModel):
    broker: str
    client_id: str


@app.get("/users/clients")
@app.get("/users/get_clients")
def users_clients(current_user: str = Depends(get_current_user)):
    return {"status": "ok", "clients": _list_clients(current_user)}


@app.post("/users/add_client")
def users_add_client(
    payload: ClientPayload, current_user: str = Depends(get_current_user)
):
    record = _add_or_update_client(current_user, payload)
    return {"status": "ok", "client": record}


@app.post("/users/edit_client")
def users_edit_client(
    payload: ClientPayload, current_user: str = Depends(get_current_user)
):
    record = _add_or_update_client(current_user, payload)
    return {"status": "ok", "client": record}


@app.post("/users/delete_client")
def users_delete_client(
    body: DeleteClientBody, current_user: str = Depends(get_current_user)
):
    _delete_client(current_user, body.broker, body.client_id)
    return {"status": "ok"}


# ---------------------------------------------------------------------
# Groups (per user)
# ---------------------------------------------------------------------
class GroupModel(BaseModel):
    name: str
    description: Optional[str] = None
    clients: List[str] = []  # keys like "dhan-AB123"


def _load_groups(username: str) -> List[Dict[str, Any]]:
    return load_json(_groups_file(username), [])


def _save_groups(username: str, groups: List[Dict[str, Any]]) -> None:
    save_json(_groups_file(username), groups)


@app.get("/users/groups")
def get_groups(current_user: str = Depends(get_current_user)):
    return {"status": "ok", "groups": _load_groups(current_user)}


@app.post("/users/groups/save")
def save_group(group: GroupModel, current_user: str = Depends(get_current_user)):
    groups = _load_groups(current_user)
    for g in groups:
        if g.get("name") == group.name:
            g.update(group.dict())
            break
    else:
        groups.append(group.dict())

    _save_groups(current_user, groups)
    return {"status": "ok", "groups": groups}


class GroupDeleteBody(BaseModel):
    name: str


@app.post("/users/groups/delete")
def delete_group(
    body: GroupDeleteBody, current_user: str = Depends(get_current_user)
):
    groups = _load_groups(current_user)
    new_groups = [g for g in groups if g.get("name") != body.name]
    _save_groups(current_user, new_groups)
    return {"status": "ok", "groups": new_groups}


# ---------------------------------------------------------------------
# Copy-trading setups (per user)
# ---------------------------------------------------------------------
class CopySetupModel(BaseModel):
    id: Optional[str] = None
    name: str
    source_client: str   # e.g. "dhan-TRADER1"
    group_name: str      # must match GroupModel.name
    multiplier: float = 1.0
    active: bool = True


def _load_copy_setups(username: str) -> List[Dict[str, Any]]:
    return load_json(_copy_file(username), [])


def _save_copy_setups(username: str, setups: List[Dict[str, Any]]) -> None:
    save_json(_copy_file(username), setups)


@app.get("/users/copy/setups")
def get_copy_setups(current_user: str = Depends(get_current_user)):
    return {"status": "ok", "setups": _load_copy_setups(current_user)}


@app.post("/users/copy/save")
def save_copy_setup(
    setup: CopySetupModel, current_user: str = Depends(get_current_user)
):
    setups = _load_copy_setups(current_user)

    if setup.id is None:
        setup.id = uuid.uuid4().hex
        setups.append(setup.dict())
    else:
        for s in setups:
            if s.get("id") == setup.id:
                s.update(setup.dict())
                break
        else:
            setups.append(setup.dict())

    _save_copy_setups(current_user, setups)
    return {"status": "ok", "setups": setups}


class CopyIdBody(BaseModel):
    id: str


@app.post("/users/copy/enable")
def enable_copy(body: CopyIdBody, current_user: str = Depends(get_current_user)):
    setups = _load_copy_setups(current_user)
    for s in setups:
        if s.get("id") == body.id:
            s["active"] = True
            break
    _save_copy_setups(current_user, setups)
    return {"status": "ok", "setups": setups}


@app.post("/users/copy/disable")
def disable_copy(body: CopyIdBody, current_user: str = Depends(get_current_user)):
    setups = _load_copy_setups(current_user)
    for s in setups:
        if s.get("id") == body.id:
            s["active"] = False
            break
    _save_copy_setups(current_user, setups)
    return {"status": "ok", "setups": setups}


@app.post("/users/copy/delete")
def delete_copy(body: CopyIdBody, current_user: str = Depends(get_current_user)):
    setups = _load_copy_setups(current_user)
    setups = [s for s in setups if s.get("id") != body.id]
    _save_copy_setups(current_user, setups)
    return {"status": "ok", "setups": setups}


# ---------------------------------------------------------------------
# Local dev entry-point
# ---------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn

    uvicorn.run("MultiBroker_Router:app", host="0.0.0.0", port=8000, reload=True)
