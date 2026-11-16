"""Rewrites a JSON file with 2-space indents and plain UTF-8 (used by release.ps1)."""
import json
import sys

path = sys.argv[1]
with open(path, encoding="utf-8-sig") as f:
    data = json.load(f)
with open(path, "w", encoding="utf-8", newline="\n") as f:
    f.write(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
