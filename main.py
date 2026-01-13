#!/usr/bin/env python3
"""
Daily Proof (Self-Trust Tracker)
A mobile-first daily task tracker with a heatmap visualization.

Render notes:
- Configure Start Command: gunicorn main:app
- Add a Persistent Disk mounted at /var/data (recommended)
- Set env var: DATA_DIR=/var/data
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timedelta
from typing import Any, Dict, List

from flask import Flask, jsonify, render_template, request, send_from_directory

# -----------------------------------------------------------------------------
# App setup
# -----------------------------------------------------------------------------
app = Flask(__name__, static_folder="static", static_url_path="/static")


# -----------------------------------------------------------------------------
# Persistence (Render-safe)
# -----------------------------------------------------------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.environ.get("DATA_DIR", BASE_DIR)  # local fallback
os.makedirs(DATA_DIR, exist_ok=True)

DATA_FILE = os.path.join(DATA_DIR, "tracker_data.json")


def _ensure_data_file() -> None:
    """Create an empty data file if it doesn't exist."""
    if not os.path.exists(DATA_FILE):
        with open(DATA_FILE, "w", encoding="utf-8") as f:
            json.dump({}, f)


def load_data() -> Dict[str, Any]:
    """Load tracker data from disk."""
    _ensure_data_file()
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, OSError):
        # If file is corrupt/unreadable, fail gracefully.
        return {}


def save_data(data: Dict[str, Any]) -> None:
    """Save tracker data to disk."""
    # Atomic-ish write: write to temp then replace
    tmp_path = DATA_FILE + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    os.replace(tmp_path, DATA_FILE)


def get_today_str() -> str:
    """Return today's date in local server time as YYYY-MM-DD."""
    return datetime.now().strftime("%Y-%m-%d")


def default_day_payload() -> Dict[str, Any]:
    """Default payload for a new day."""
    return {
        "tasks": [
            {"id": 1, "text": "", "completed": False},
            {"id": 2, "text": "", "completed": False},
            {"id": 3, "text": "", "completed": False},
        ]
    }


# -----------------------------------------------------------------------------
# Routes (UI + PWA)
# -----------------------------------------------------------------------------
@app.route("/")
def index():
    return render_template("tracker.html")


@app.route("/manifest.webmanifest")
def manifest():
    return send_from_directory(
        "static", "manifest.webmanifest", mimetype="application/manifest+json"
    )


# If you placed a service worker in /static/sw.js and you register it from JS,
# you can serve it via the static route already. This route is optional, but
# nice if you reference /sw.js from the page.
@app.route("/sw.js")
def service_worker():
    return send_from_directory("static", "sw.js", mimetype="application/javascript")


# -----------------------------------------------------------------------------
# API: Tasks
# -----------------------------------------------------------------------------
@app.route("/api/tasks", methods=["GET"])
def get_tasks():
    """Get tasks for today (creates today's record if missing)."""
    data = load_data()
    today = get_today_str()

    if today not in data or not isinstance(data.get(today), dict):
        data[today] = default_day_payload()
        save_data(data)

    # Ensure structure is present even if old data is missing fields
    day = data[today]
    if "tasks" not in day or not isinstance(day.get("tasks"), list):
        day["tasks"] = default_day_payload()["tasks"]
        data[today] = day
        save_data(data)

    return jsonify(day)


@app.route("/api/tasks", methods=["POST"])
def update_tasks():
    """Update tasks for today."""
    payload = request.get_json(silent=True) or {}
    tasks = payload.get("tasks", [])
    if not isinstance(tasks, list):
        tasks = []

    data = load_data()
    today = get_today_str()
    data[today] = {"tasks": tasks}
    save_data(data)

    return jsonify({"success": True})


# -----------------------------------------------------------------------------
# API: Heatmap
# -----------------------------------------------------------------------------
@app.route("/api/heatmap", methods=["GET"])
def get_heatmap():
    """
    Return heatmap data from Jan 1 to Dec 31 of the current year.
    Level meanings:
      0 = none / no tasks set
      1..3 = number of completed tasks (capped at 3)
    """
    data = load_data()
    now = datetime.now()

    start_date = datetime(now.year, 1, 1)
    end_date = datetime(now.year, 12, 31)
    days_in_year = (end_date - start_date).days + 1

    heatmap: List[Dict[str, Any]] = []

    for i in range(days_in_year):
        date_str = (start_date + timedelta(days=i)).strftime("%Y-%m-%d")

        level = 0
        if date_str in data and isinstance(data.get(date_str), dict):
            tasks = data[date_str].get("tasks", [])
            if isinstance(tasks, list):
                # only count tasks that have non-empty text
                total = sum(1 for t in tasks if str(t.get("text", "")).strip())
                completed = sum(
                    1
                    for t in tasks
                    if str(t.get("text", "")).strip() and bool(t.get("completed", False))
                )
                level = min(completed, 3) if total > 0 else 0

        heatmap.append({"date": date_str, "level": level})

    return jsonify(heatmap)


# -----------------------------------------------------------------------------
# API: Stats
# -----------------------------------------------------------------------------
@app.route("/api/stats", methods=["GET"])
def get_stats():
    """
    Stats computed over the last 365 days:
    - total_days: number of days that have a record in storage
    - perfect_days: days where all non-empty tasks are completed
    - current_streak: consecutive perfect days ending today
    - longest_streak: longest streak of perfect days within lookback window
    """
    data = load_data()

    total_days = len(data)
    perfect_days = 0
    current_streak = 0
    longest_streak = 0
    temp_streak = 0

    today = datetime.now()

    for i in range(365):
        date_str = (today - timedelta(days=i)).strftime("%Y-%m-%d")
        day = data.get(date_str)

        is_perfect = False
        if isinstance(day, dict):
            tasks = day.get("tasks", [])
            if isinstance(tasks, list):
                total = sum(1 for t in tasks if str(t.get("text", "")).strip())
                completed = sum(
                    1
                    for t in tasks
                    if str(t.get("text", "")).strip() and bool(t.get("completed", False))
                )
                is_perfect = (total > 0 and completed == total)

        if is_perfect:
            perfect_days += 1
            temp_streak += 1
            if i == 0:
                current_streak = temp_streak
        else:
            if temp_streak > longest_streak:
                longest_streak = temp_streak
            temp_streak = 0
            if i == 0:
                current_streak = 0

    if temp_streak > longest_streak:
        longest_streak = temp_streak

    return jsonify(
        {
            "total_days": total_days,
            "perfect_days": perfect_days,
            "current_streak": current_streak,
            "longest_streak": longest_streak,
        }
    )


# -----------------------------------------------------------------------------
# Local dev entrypoint
# -----------------------------------------------------------------------------
if __name__ == "__main__":
    # Local dev only; Render should run via gunicorn main:app
    port = int(os.environ.get("PORT", "5000"))
    app.run(debug=False, host="0.0.0.0", port=port)
