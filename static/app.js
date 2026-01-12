let tasks = [];
let saveTimeout = null;

// Display current date
function updateDateDisplay() {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const today = new Date().toLocaleDateString('en-US', options);
    document.getElementById('dateDisplay').textContent = today;
}

// Load tasks from server
async function loadTasks() {
    try {
        const response = await fetch('/api/tasks');
        const data = await response.json();
        tasks = data.tasks;
        renderTasks();
    } catch (error) {
        console.error('Error loading tasks:', error);
    }
}

// Save tasks to server
async function saveTasks() {
    try {
        console.log('Saving tasks...', tasks);
        await fetch('/api/tasks', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ tasks })
        });
        
        console.log('Tasks saved, reloading heatmap and stats...');
        showSaveIndicator();
        await loadHeatmap();
        await loadStats();
        console.log('Heatmap and stats reloaded');
    } catch (error) {
        console.error('Error saving tasks:', error);
    }
}

// Debounced save
function debouncedSave() {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveTasks, 1000);
}

// Show save indicator
function showSaveIndicator() {
    const indicator = document.getElementById('saveIndicator');
    indicator.classList.add('show');
    setTimeout(() => {
        indicator.classList.remove('show');
    }, 2000);
}

// Render tasks
function renderTasks() {
    const tasksList = document.getElementById('tasksList');
    tasksList.innerHTML = '';
    
    tasks.forEach((task, index) => {
        const taskItem = document.createElement('div');
        taskItem.className = `task-item ${task.completed ? 'completed' : ''}`;
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'task-checkbox';
        checkbox.checked = task.completed;
        checkbox.addEventListener('change', (e) => {
            tasks[index].completed = e.target.checked;
            renderTasks();
            saveTasks(); // Immediate save for checkboxes
        });
        
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'task-input';
        input.placeholder = `Task ${index + 1}`;
        input.value = task.text;
        input.addEventListener('input', (e) => {
            tasks[index].text = e.target.value;
            debouncedSave();
        });
        
        taskItem.appendChild(checkbox);
        taskItem.appendChild(input);
        tasksList.appendChild(taskItem);
    });
}

// Load heat map
async function loadHeatmap() {
    try {
        console.log('Loading heatmap data...');
        const response = await fetch('/api/heatmap');
        const heatmapData = await response.json();
        console.log('Heatmap data loaded:', heatmapData.length, 'days');
        renderHeatmap(heatmapData);
        console.log('Heatmap rendered');
    } catch (error) {
        console.error('Error loading heatmap:', error);
    }
}

// Render heat map
function renderHeatmap(data) {
    console.log('Starting renderHeatmap with', data.length, 'days');
    const heatmap = document.getElementById('heatmap');
    const monthLabels = document.getElementById('monthLabels');
    heatmap.innerHTML = '';
    monthLabels.innerHTML = '';
    
    // Define colors
    const levelColors = {
        0: '#1f1f2e',
        1: '#1a4a4d',
        2: '#2e8b99',
        3: '#5ce1e6'
    };
    
    // Group data by weeks
    const weeks = [];
    let currentWeek = [];
    
    data.forEach((day, index) => {
        const date = new Date(day.date);
        const dayOfWeek = date.getDay();
        
        if (index === 0) {
            // Fill in empty cells for the first week
            for (let i = 0; i < dayOfWeek; i++) {
                currentWeek.push(null);
            }
        }
        
        currentWeek.push(day);
        
        if (currentWeek.length === 7) {
            weeks.push(currentWeek);
            currentWeek = [];
        }
    });
    
    if (currentWeek.length > 0) {
        weeks.push(currentWeek);
    }
    
    // Render cells
    const todayStr = new Date().toISOString().split('T')[0];
    console.log('Today is:', todayStr);
    let cellCount = 0;
    
    weeks.forEach(week => {
        week.forEach(day => {
            const cell = document.createElement('div');
            cell.className = 'heatmap-cell';
            
            if (day) {
                cell.setAttribute('data-level', day.level);
                cell.setAttribute('data-date', day.date);
                
                // Set background color inline - THIS IS KEY!
                cell.style.background = levelColors[day.level];
                
                // Mark today's cell
                if (day.date === todayStr) {
                    cell.setAttribute('data-today', 'true');
                    cell.style.border = '1px solid white';
                    cell.style.boxSizing = 'border-box';
                    console.log('Today cell:', day.date, 'level:', day.level);
                }
                
                cell.addEventListener('mouseenter', (e) => {
                    showTooltip(e, day);
                });
                
                cell.addEventListener('mouseleave', () => {
                    hideTooltip();
                });
                cellCount++;
            } else {
                cell.style.background = 'transparent';
            }
            
            heatmap.appendChild(cell);
        });
    });
    console.log('Rendered', cellCount, 'heatmap cells');
    
    // Add month labels
    const months = [];
    let currentMonth = '';
    
    data.forEach((day, index) => {
        const date = new Date(day.date);
        const month = date.toLocaleDateString('en-US', { month: 'short' });
        
        if (month !== currentMonth && index % 7 === 0) {
            months.push({ month, index: Math.floor(index / 7) });
            currentMonth = month;
        }
    });
    
    months.forEach(m => {
        const label = document.createElement('span');
        label.textContent = m.month;
        monthLabels.appendChild(label);
    });
}

// Show tooltip
function showTooltip(event, day) {
    const tooltip = document.getElementById('tooltip');
    const date = new Date(day.date);
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    
    const levelText = ['No tasks', '1 task completed', '2 tasks completed', '3 tasks completed'];
    tooltip.textContent = `${dateStr}: ${levelText[day.level]}`;
    
    tooltip.style.display = 'block';
    tooltip.style.left = `${event.clientX + 10}px`;
    tooltip.style.top = `${event.clientY - 30}px`;
}

// Hide tooltip
function hideTooltip() {
    const tooltip = document.getElementById('tooltip');
    tooltip.style.display = 'none';
}

// Load stats
async function loadStats() {
    try {
        const response = await fetch('/api/stats');
        const stats = await response.json();
        renderStats(stats);
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// Render stats
function renderStats(stats) {
    const statsSection = document.getElementById('statsSection');
    statsSection.innerHTML = `
        <div class="stat-box">
            <div class="stat-value">${stats.current_streak}</div>
            <div class="stat-label">Current Streak</div>
        </div>
        <div class="stat-box">
            <div class="stat-value">${stats.longest_streak}</div>
            <div class="stat-label">Longest Streak</div>
        </div>
        <div class="stat-box">
            <div class="stat-value">${stats.perfect_days}</div>
            <div class="stat-label">Perfect Days</div>
        </div>
        <div class="stat-box">
            <div class="stat-value">${stats.total_days}</div>
            <div class="stat-label">Total Days</div>
        </div>
    `;
}

// Initialize
updateDateDisplay();
loadTasks();
loadHeatmap();
loadStats();

// Update date at midnight
setInterval(() => {
    const now = new Date();
    if (now.getHours() === 0 && now.getMinutes() === 0) {
        updateDateDisplay();
        loadTasks();
    }
}, 60000);
