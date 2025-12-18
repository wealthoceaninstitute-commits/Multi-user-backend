# init_dirs.py
import os
import sys

def get_base_dir():
    if getattr(sys, 'frozen', False):
        return os.path.dirname(sys.executable)
    else:
        return os.path.dirname(os.path.abspath(__file__))

def ensure_data_dirs():
    BASE_DIR = get_base_dir()
    # Maintain your exact folder names
    CLIENTS_FOLDER = os.path.join(BASE_DIR, "clients")
    GROUPS_FOLDER = os.path.join(BASE_DIR, "groups")
    COPYTRADING_FOLDER = os.path.join(BASE_DIR, "copytrading_setups")
    # Add any more folders as needed (example: LOGS, etc.)
    
    # Create folders if they don't exist
    for folder in [CLIENTS_FOLDER, GROUPS_FOLDER, COPYTRADING_FOLDER]:
        if not os.path.exists(folder):
            os.makedirs(folder)
            with open(os.path.join(folder, ".keep"), "w") as f:
                f.write("keep")

    # Return the paths as a dictionary for your main script to use
    return {
        "BASE_DIR": BASE_DIR,
        "CLIENTS_FOLDER": CLIENTS_FOLDER,
        "GROUPS_FOLDER": GROUPS_FOLDER,
        "COPYTRADING_FOLDER": COPYTRADING_FOLDER,
    }
