#!/usr/bin/env env python3
"""
Self-Trust Tracker - A mobile-first daily task tracker with heat map visualization
"""

from flask import Flask, render_template, request, jsonify
from datetime import datetime, timedelta
import json
import os
from flask import send_from_directory

@app.route("/manifest.webmanifest")
def manifest():
    return send_from_directory("static", "manifest.webmanifest", mimetype="application/manifest+json")


app = Flask(__name__, static_folder='static', static_url_path='/static')

# Data file to store task completion history
DATA_FILE = 'tracker_data.json'

def load_data():
    """Load tracker data from file"""
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, 'r') as f:
            return json.load(f)
    return {}

def save_data(data):
    """Save tracker data to file"""
    with open(DATA_FILE, 'w') as f:
        json.dump(data, f, indent=2)

def get_today():
    """Get today's date as string"""
    return datetime.now().strftime('%Y-%m-%d')

@app.route('/')
def index():
    """Render the main tracker page"""
    return render_template('tracker.html')

@app.route('/api/tasks', methods=['GET'])
def get_tasks():
    """Get tasks for today"""
    data = load_data()
    today = get_today()
    
    if today not in data:
        data[today] = {
            'tasks': [
                {'id': 1, 'text': '', 'completed': False},
                {'id': 2, 'text': '', 'completed': False},
                {'id': 3, 'text': '', 'completed': False}
            ]
        }
        save_data(data)
    
    return jsonify(data[today])

@app.route('/api/tasks', methods=['POST'])
def update_tasks():
    """Update tasks for today"""
    data = load_data()
    today = get_today()
    tasks = request.json.get('tasks', [])
    
    data[today] = {'tasks': tasks}
    save_data(data)
    
    return jsonify({'success': True})

@app.route('/api/heatmap', methods=['GET'])
def get_heatmap():
    """Get heat map data from January 1st to December 31st of current year"""
    data = load_data()
    today = datetime.now()
    
    # Start from January 1st of current year
    start_date = datetime(today.year, 1, 1)
    # End at December 31st of current year
    end_date = datetime(today.year, 12, 31)
    
    days_in_year = (end_date - start_date).days + 1
    
    # Generate data for entire year
    heatmap_data = []
    for i in range(days_in_year):
        date = (start_date + timedelta(days=i)).strftime('%Y-%m-%d')
        
        if date in data:
            tasks = data[date]['tasks']
            completed = sum(1 for task in tasks if task.get('completed', False) and task.get('text', '').strip())
            total = sum(1 for task in tasks if task.get('text', '').strip())
            
            # Level 0: No tasks, Level 1-3: Based on number completed
            if total > 0:
                level = completed  # Directly use number of tasks completed (1, 2, or 3)
            else:
                level = 0
        else:
            level = 0
        
        heatmap_data.append({
            'date': date,
            'level': level
        })
    
    return jsonify(heatmap_data)

@app.route('/api/stats', methods=['GET'])
def get_stats():
    """Get statistics about tracker usage"""
    data = load_data()
    
    total_days = len(data)
    perfect_days = 0
    current_streak = 0
    longest_streak = 0
    temp_streak = 0
    
    # Calculate streaks
    today = datetime.now()
    for i in range(365):
        date = (today - timedelta(days=i)).strftime('%Y-%m-%d')
        
        if date in data:
            tasks = data[date]['tasks']
            completed = sum(1 for task in tasks if task.get('completed', False) and task.get('text', '').strip())
            total = sum(1 for task in tasks if task.get('text', '').strip())
            
            if total > 0 and completed == total:
                perfect_days += 1
                temp_streak += 1
                if i == 0 or (date in data and temp_streak > 0):
                    current_streak = temp_streak
            else:
                if temp_streak > longest_streak:
                    longest_streak = temp_streak
                temp_streak = 0
        else:
            if temp_streak > longest_streak:
                longest_streak = temp_streak
            temp_streak = 0
    
    if temp_streak > longest_streak:
        longest_streak = temp_streak
    
    return jsonify({
        'total_days': total_days,
        'perfect_days': perfect_days,
        'current_streak': current_streak,
        'longest_streak': longest_streak
    })

if __name__ == '__main__':
    # Create templates directory if it doesn't exist
    os.makedirs('templates', exist_ok=True)
    app.run(debug=False, host='0.0.0.0', port=5000)
