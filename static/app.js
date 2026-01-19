let tasks = [];
let saveTimeout = null;

function getLocalISODate(date = new Date()) {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10); // "YYYY-MM-DD" in LOCAL time
  }
  
  function parseYMDLocal(ymd) {
    // Treat "YYYY-MM-DD" as local midnight (not UTC)
    return new Date(`${ymd}T00:00:00`);
  }
  

// Display current date
function updateDateDisplay() {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const today = new Date().toLocaleDateString('en-US', options);
    document.getElementById('dateDisplay').textContent = today;
}


// Load tasks from server
async function loadTasks() {
    try {
        const response = await fetch(`/api/tasks?date=${getLocalISODate()}`);
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
            body: JSON.stringify({ date: getLocalISODate(), tasks })
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

// Show toast message
function showToast(message) {
    const toast = document.getElementById("toast");
    if (!toast) return;

    toast.textContent = message;

    // Clear any existing timeouts
    clearTimeout(window.__toastTimeout);
    clearTimeout(window.__toastHideTimeout);

    // Reset state
    toast.classList.remove("show", "hide");

    // Slide in from left
    setTimeout(() => {
        toast.classList.add("show");
    }, 10);

    // After 1 second pause, slide out to the right
    window.__toastTimeout = setTimeout(() => {
        toast.classList.remove("show");
        toast.classList.add("hide");
    }, 1300);

    // Clean up after animation completes
    window.__toastHideTimeout = setTimeout(() => {
        toast.classList.remove("hide");
    }, 1900);
}

// Hide toast when clicking anywhere on the page
document.addEventListener("click", () => {
    const toast = document.getElementById("toast");
    if (toast) toast.classList.remove("show");
});

// Trigger confetti explosion
function triggerConfetti() {
    // Brand colors: cyan, blue, green
    const colors = ['#5ce1e6', '#004aad', '#40c463'];

    // One big explosion from the center
    confetti({
        particleCount: 150,
        spread: 360,
        startVelocity: 45,
        decay: 0.9,
        scalar: 1.4,
        origin: { x: 0.5, y: 0.5 },
        colors: colors,
        ticks: 200,
        gravity: 1
    });
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
            const text = (tasks[index].text || "").trim();

            // If user tries to check a blank task, prevent it + show message
            if (!text && e.target.checked) {
                e.target.checked = false;
                tasks[index].completed = false;
                showToast("Enter a commitment to make it count");
                return;
            }

            // Count completed tasks before this change
            const completedBefore = tasks.filter(t => t.completed).length;

            tasks[index].completed = e.target.checked;

            // Count completed tasks after this change
            const completedAfter = tasks.filter(t => t.completed).length;

            // Trigger confetti if we just reached 3 completed tasks
            if (e.target.checked && completedBefore === 2 && completedAfter === 3) {
                triggerConfetti();
            }

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
  
    // -----------------------------
    // Group data by weeks (LOCAL-safe)
    // -----------------------------
    const weeks = [];
    let currentWeek = [];
  
    data.forEach((day, index) => {
      const date = parseYMDLocal(day.date);       // ✅ swap
      const dayOfWeek = date.getDay();            // local day-of-week
  
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
      // Pad the last week to 7 cells so columns are consistent
      while (currentWeek.length < 7) currentWeek.push(null);
      weeks.push(currentWeek);
    }
  
    // -----------------------------
    // Render cells
    // -----------------------------
    const todayStr = getLocalISODate();
    console.log('Today is:', todayStr);
    let cellCount = 0;
  
    weeks.forEach((week) => {
      week.forEach((day) => {
        const cell = document.createElement('div');
        cell.className = 'heatmap-cell';
  
        if (day) {
          cell.setAttribute('data-level', day.level);
          cell.setAttribute('data-date', day.date);
  
          // Paint cell
          cell.style.background = levelColors[day.level];
  
          // Mark today's cell (1px border)
          if (day.date === todayStr) {
            cell.setAttribute('data-today', 'true');
            cell.style.border = '1px solid white';
            cell.style.boxSizing = 'border-box';
            console.log('Today cell:', day.date, 'level:', day.level);
          }
  
          cell.addEventListener('mouseenter', (e) => showTooltip(e, day));
          cell.addEventListener('mouseleave', hideTooltip);
  
          cellCount++;
        } else {
          cell.style.background = 'transparent';
        }
  
        heatmap.appendChild(cell);
      });
    });
  
    console.log('Rendered', cellCount, 'heatmap cells');
  
    // -----------------------------
    // Month labels (improved placement)
    // Align labels to week columns, not raw data indices.
    // This accounts for the null padding at the start of the first week.
    // -----------------------------
    monthLabels.style.display = 'grid';
    monthLabels.style.gridTemplateColumns = `repeat(${weeks.length}, 1fr)`;
  
    let currentMonth = '';
    const monthMarkers = [];
  
    weeks.forEach((week, weekIndex) => {
      const firstDayInWeek = week.find(d => d !== null);
      if (!firstDayInWeek) return;
  
      const date = parseYMDLocal(firstDayInWeek.date); // ✅ swap
      const month = date.toLocaleDateString('en-US', { month: 'short' });
  
      if (month !== currentMonth) {
        monthMarkers.push({ month, weekIndex });
        currentMonth = month;
      }
    });
  
    monthMarkers.forEach(({ month, weekIndex }) => {
      const label = document.createElement('span');
      label.textContent = month;
      label.style.gridColumn = `${weekIndex + 1}`; // place at the correct week column
      monthLabels.appendChild(label);
    });
  }
  

// Show tooltip
function showTooltip(event, day) {
    const tooltip = document.getElementById('tooltip');
    const date = parseYMDLocal(day.date);
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
