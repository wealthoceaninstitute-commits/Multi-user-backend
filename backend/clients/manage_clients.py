# backend/clients/manage_clients.py

import os
import json
from fastapi import APIRouter, HTTPException, Body, Depends

from backend.user.auth import get_current_user
from backend.user.storage import (
    get_user_clients_folder,
    github_write_file,
    github_delete_file,
)

router = APIRouter()


# -----------------------------------------
# Utility
# -----------------------------------------

def safe(x: str) -> str:
    """Sanitize filenames"""
    return "".join(c for c in x if c.isalnum() or c in "-_").lower()


# -----------------------------------------
# ADD CLIENT
# -----------------------------------------

@router.post("/add")
def add_client(
    payload: dict = Body(...),
    username: str = Depends(get_current_user)
):
    """
    payload:
    {
        "broker": "dhan" | "motilal",
        "client_id": "...",
        "display_name": "...",
        "capital": 10000,
        "creds": {...}
    }
    """

    broker = payload.get("broker")
    client_id = safe(payload.get("client_id", ""))
    display_name = payload.get("display_name", "")
    capital = payload.get("capital", 0)
    creds = payload.get("creds", {})

    if broker not in ["dhan", "motilal"]:
        raise HTTPException(400, "Unknown broker")

    if not client_id:
        raise HTTPException(400, "client_id required")

    # Build folder path
    folder = get_user_clients_folder(username, broker)
    os.makedirs(folder, exist_ok=True)

    data = {
        "broker": broker,
        "client_id": client_id,
        "display_name": display_name,
        "capital": capital,
        "creds": creds,
    }

    # Local path
    local_path = os.path.join(folder, f"{client_id}.json")

    with open(local_path, "w") as f:
        json.dump(data, f, indent=2)

    # GitHub path
    github_path = f"users/{username}/clients/{broker}/{client_id}.json"

    github_write_file(
        github_path,
        json.dumps(data, indent=2),
        f"Add client {client_id} for {username}"
    )

    return {"success": True, "client": data}


# -----------------------------------------
# LIST ALL CLIENTS FOR USER
# -----------------------------------------

@router.get("/list")
def list_clients(username: str = Depends(get_current_user)):
    user_root = f"data/users/{username}/clients"

    output = {
        "dhan": [],
        "motilal": []
    }

    # If new user with no folders
    if not os.path.exists(user_root):
        return output

    for broker in ["dhan", "motilal"]:
        broker_dir = os.path.join(user_root, broker)
        if not os.path.exists(broker_dir):
            continue

        for fname in os.listdir(broker_dir):
            if fname.endswith(".json"):
                with open(os.path.join(broker_dir, fname)) as f:
                    output[broker].append(json.load(f))

    return output


# -----------------------------------------
# GET A SINGLE CLIENT
# -----------------------------------------

@router.get("/get/{broker}/{client_id}")
def get_client(broker: str, client_id: str, username: str = Depends(get_current_user)):

    broker = safe(broker)
    client_id = safe(client_id)

    file_path = f"data/users/{username}/clients/{broker}/{client_id}.json"

    if not os.path.exists(file_path):
        raise HTTPException(404, "Client not found")

    with open(file_path) as f:
        return json.load(f)


# -----------------------------------------
# DELETE CLIENT
# -----------------------------------------

@router.delete("/delete/{broker}/{client_id}")
def delete_client(broker: str, client_id: str, username: str = Depends(get_current_user)):

    broker = safe(broker)
    client_id = safe(client_id)

    local_path = f"data/users/{username}/clients/{broker}/{client_id}.json"
    github_path = f"users/{username}/clients/{broker}/{client_id}.json"

    # Delete locally
    if os.path.exists(local_path):
        os.remove(local_path)
    else:
        raise HTTPException(404, "Client not found")

    # Delete from GitHub
    github_delete_file(github_path, f"Delete client {client_id}")

    return {"success": True, "deleted": client_id}
