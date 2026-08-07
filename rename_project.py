"""
One-time rename script: AgriInsight -> AgroInsight

Run this from your project root (the same folder that contains app.py):

    python rename_project.py

What it does:
  - Walks every file in the project (skipping .git, __pycache__, venv/.venv,
    node_modules, and the dataset/ folder — no point touching a 7MB CSV).
  - In every text file, replaces (case-preserving):
        AgriInsight  -> AgroInsight
        agriinsight  -> agroinsight
        AGRIINSIGHT  -> AGROINSIGHT
  - If database/agriinsight.db exists, renames it to database/agroinsight.db
    (keeps your already-loaded data instead of forcing a reload).
  - Skips binary files automatically (things like models/crop_model.pkl)
    so it can't corrupt them.
  - Prints exactly which files it changed. Safe to re-run — a second run
    will just report "0 files changed".
"""
import os

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))

SKIP_DIRS = {".git", "__pycache__", "venv", ".venv", "env", "node_modules", ".idea", ".vscode"}
SKIP_FILE_EXTENSIONS = {".pkl", ".db", ".png", ".jpg", ".jpeg", ".gif", ".ico", ".woff", ".woff2", ".ttf"}

REPLACEMENTS = [
    ("AgriInsight", "AgroInsight"),
    ("agriinsight", "agroinsight"),
    ("AGRIINSIGHT", "AGROINSIGHT"),
]


def should_skip_dir(dirname: str) -> bool:
    return dirname in SKIP_DIRS


def is_probably_binary(path: str) -> bool:
    if os.path.splitext(path)[1].lower() in SKIP_FILE_EXTENSIONS:
        return True
    try:
        with open(path, "rb") as f:
            chunk = f.read(1024)
        return b"\x00" in chunk
    except OSError:
        return True


def rename_in_file(path: str) -> bool:
    if is_probably_binary(path):
        return False
    try:
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
    except (UnicodeDecodeError, OSError):
        return False

    new_content = content
    for old, new in REPLACEMENTS:
        new_content = new_content.replace(old, new)

    if new_content != content:
        with open(path, "w", encoding="utf-8") as f:
            f.write(new_content)
        return True
    return False


def main():
    changed = []

    for root, dirs, files in os.walk(PROJECT_ROOT):
        dirs[:] = [d for d in dirs if not should_skip_dir(d)]
        if os.path.basename(root) == "dataset":
            dirs[:] = []  # don't descend further, and skip files in it too
            continue

        for filename in files:
            filepath = os.path.join(root, filename)
            if filepath == os.path.abspath(__file__):
                continue  # don't rewrite this script itself
            if rename_in_file(filepath):
                changed.append(os.path.relpath(filepath, PROJECT_ROOT))

    # Rename the physical db file, preserving already-loaded data
    old_db = os.path.join(PROJECT_ROOT, "database", "agriinsight.db")
    new_db = os.path.join(PROJECT_ROOT, "database", "agroinsight.db")
    if os.path.exists(old_db) and not os.path.exists(new_db):
        os.rename(old_db, new_db)
        print(f"Renamed database file: database/agriinsight.db -> database/agroinsight.db")
    elif os.path.exists(old_db) and os.path.exists(new_db):
        print("NOTE: both database/agriinsight.db and database/agroinsight.db exist — "
              "left both alone, please resolve manually.")

    print(f"\n{len(changed)} file(s) updated:")
    for f in changed:
        print(f"  - {f}")

    if not changed:
        print("  (none — already renamed, or run this from the wrong folder)")


if __name__ == "__main__":
    main()
