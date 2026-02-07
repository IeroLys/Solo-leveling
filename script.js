// === ДАННЫЕ ===
let userData = {
  totalXP: 0,
  stats: {
    strength: { totalXP: 0 },
    career: { totalXP: 0 },
    willpower: { totalXP: 0 }
  },
  todos: [],
  lastReset: new Date().toDateString()
};

// === НАСТРОЙКИ XP ===
const XP_BASE = 130;         // XP от lvl 1 → 2
const XP_GROWTH_RATE = 1.05; // Экспоненциальный рост

// === ФОРМУЛЫ ===
function xpRequiredForLevel(level) {
  if (level <= 1) return 0;
  // Сумма геометрической прогрессии: base * (r^(n-1) - 1) / (r - 1)
  // Но для простоты и точности будем использовать цикл или формулу суммы
  let total = 0;
  for (let i = 1; i < level; i++) {
    total += Math.round(XP_BASE * Math.pow(XP_GROWTH_RATE, i - 1));
  }
  return total;
}

// Альтернатива (более эффективная, но с осторожностью из-за float):
/*
function xpRequiredForLevel(level) {
  if (level <= 1) return 0;
  const r = XP_GROWTH_RATE;
  const n = level - 1;
  // Формула суммы геометрической прогрессии: S = a * (r^n - 1) / (r - 1)
  const sum = XP_BASE * (Math.pow(r, n) - 1) / (r - 1);
  return Math.round(sum);
}
*/

function getLevelFromTotalXP(totalXP) {
  if (totalXP < 0) totalXP = 0;
  let level = 1;
  while (xpRequiredForLevel(level + 1) <= totalXP) {
    level++;
  }
  const currentXP = totalXP - xpRequiredForLevel(level);
  const nextLevelXP = xpRequiredForLevel(level + 1) - xpRequiredForLevel(level);
  return { level, currentXP, maxXP: nextLevelXP };
}

// === ЗАГРУЗКА ===
function loadUserData() {
  const savedData = localStorage.getItem('gameData');
  if (savedData) {
    try {
      const parsed = JSON.parse(savedData);

      // Миграция основных данных
      if (typeof parsed.totalXP !== 'number') {
        let totalXP = parsed.xp || 0;
        let level = parsed.level || 1;
        if (level > 1) totalXP += xpRequiredForLevel(level);
        parsed.totalXP = totalXP;
      }

      // Миграция статов
      const statKeys = ['strength', 'career', 'willpower'];
      statKeys.forEach(key => {
        if (parsed.stats && typeof parsed.stats[key] === 'number') {
          parsed.stats[key] = { totalXP: xpRequiredForLevel(parsed.stats[key] || 1) };
        } else if (!parsed.stats?.[key]) {
          if (!parsed.stats) parsed.stats = {};
          parsed.stats[key] = { totalXP: 0 };
        }
      });

      // Миграция задач
      let todos = Array.isArray(parsed.todos) ? parsed.todos : [];
      todos = todos.map(todo => {
        if (typeof todo.statType === 'string' && todo.statType) {
          return { ...todo, statTypes: [todo.statType], statType: undefined };
        }
        if (!Array.isArray(todo.statTypes)) {
          return { ...todo, statTypes: [] };
        }
        return todo;
      });

      userData = {
        totalXP: parsed.totalXP || 0,
        stats: {
          strength: { totalXP: (parsed.stats?.strength?.totalXP) || 0 },
          career: { totalXP: (parsed.stats?.career?.totalXP) || 0 },
          willpower: { totalXP: (parsed.stats?.willpower?.totalXP) || 0 }
        },
        todos,
        lastReset: parsed.lastReset || new Date().toDateString()
      };

      // Сброс ежедневных задач при новом дне
      const today = new Date().toDateString();
      if (userData.lastReset !== today) {
        resetDailyTodos();
        userData.lastReset = today;
      }
    } catch (e) {
      console.error("Ошибка загрузки: ", e);
    }
  }
  renderUI();
}

function saveUserData() {
  try {
    localStorage.setItem('gameData', JSON.stringify(userData));
  } catch (e) {
    console.error("Ошибка сохранения:", e);
    alert("Не удалось сохранить данные.");
  }
}

// === XP СИСТЕМА ===
function addXP(amount, statTypes = []) {
  userData.totalXP += amount;
  statTypes.forEach(statType => {
    if (userData.stats[statType]) {
      userData.stats[statType].totalXP += amount;
    }
  });
  saveUserData();
  renderUI();
}

function removeXP(amount, statTypes = []) {
  userData.totalXP = Math.max(0, userData.totalXP - amount);
  statTypes.forEach(statType => {
    if (userData.stats[statType]) {
      userData.stats[statType].totalXP = Math.max(0, userData.stats[statType].totalXP - amount);
    }
  });
  saveUserData();
  renderUI();
}

// === ОТОБРАЖЕНИЕ ===
function renderUI() {
  const main = getLevelFromTotalXP(userData.totalXP);
  document.getElementById('level').textContent = main.level;
  document.getElementById('current-xp').textContent = main.currentXP;
  document.getElementById('max-xp').textContent = main.maxXP;
  document.getElementById('xp-progress').style.width = `${Math.min(100, (main.currentXP / main.maxXP) * 100)}%`;

  const statKeys = ['strength', 'career', 'willpower'];
  statKeys.forEach(key => {
    const stat = userData.stats[key];
    if (!stat || typeof stat.totalXP !== 'number') {
      document.getElementById(`${key}-progress`).style.width = '0%';
      document.getElementById(`${key}-level`).textContent = '1';
      document.getElementById(`${key}-xp`).textContent = '0/100 XP';
      return;
    }
    const statData = getLevelFromTotalXP(stat.totalXP);
    const percent = statData.maxXP > 0 ? (statData.currentXP / statData.maxXP) * 100 : 0;
    document.getElementById(`${key}-progress`).style.width = `${Math.min(100, percent)}%`;
    document.getElementById(`${key}-level`).textContent = statData.level;
    document.getElementById(`${key}-xp`).textContent = `${statData.currentXP}/${statData.maxXP} XP`;
  });

  const questCount = userData.todos.filter(t => !t.completed).length;
  document.getElementById('quest-count').textContent = questCount;
  renderTodoList();
}

function renderTodoList() {
  const container = document.getElementById('todo-container');
  container.innerHTML = '';
  const statIcons = {
    strength: '💪',
    career: '💸',
    willpower: '🔥'
  };
  userData.todos.forEach((todo, index) => {
    const statBadges = todo.statTypes.map(stat =>
      `<span class="stat-badge ${stat}">${statIcons[stat] || stat.charAt(0).toUpperCase()}</span>`
    ).join('');

    const todoElement = document.createElement('div');
    todoElement.className = `todo-item ${todo.completed ? 'completed' : ''}`;
    todoElement.innerHTML = `
      <input type="checkbox" ${todo.completed ? 'checked' : ''}
             onchange="toggleTodo(${index})">
      <div class="task-info">
        <div class="task-text">${todo.text}</div>
        ${statBadges ? `<div class="task-stats">${statBadges}</div>` : ''}
      </div>
      <div class="todo-actions">
        <div class="action-buttons-row">
          <button class="edit-btn" onclick="editTodo(${index})" title="Редактировать">✏️</button>
          <button class="delete-btn" onclick="deleteTodo(${index})" title="Удалить">🗑️</button>
        </div>
        <span class="xp-badge">${todo.xp} XP</span>
      </div>
    `;
    container.appendChild(todoElement);
  });
}

// === УПРАВЛЕНИЕ ЗАДАЧАМИ ===
function toggleTodo(index) {
  const todo = userData.todos[index];
  if (todo.completed) {
    removeXP(todo.xp, todo.statTypes);
    todo.completed = false;
  } else {
    addXP(todo.xp, todo.statTypes);
    todo.completed = true;
  }
  saveUserData();
  renderUI();
}

// === РЕДАКТИРОВАНИЕ ===
let currentEditIndex = null;

function openAddModal() {
  currentEditIndex = null;
  document.getElementById('modal-title').textContent = 'Добавить квест';
  document.getElementById('edit-todo-text').value = '';
  document.getElementById('edit-todo-xp').value = '';
  document.querySelectorAll('.edit-stat-cb').forEach(cb => cb.checked = false);
  document.getElementById('edit-modal').classList.add('active');
}

function editTodo(index) {
  const todo = userData.todos[index];
  currentEditIndex = index;
  document.getElementById('modal-title').textContent = 'Редактировать квест';
  document.getElementById('edit-todo-text').value = todo.text;
  document.getElementById('edit-todo-xp').value = todo.xp;
  document.querySelectorAll('.edit-stat-cb').forEach(cb => {
    cb.checked = todo.statTypes.includes(cb.value);
  });
  document.getElementById('edit-modal').classList.add('active');
}

function saveEdit() {
  const text = document.getElementById('edit-todo-text').value.trim();
  const xp = parseInt(document.getElementById('edit-todo-xp').value);
  const checkboxes = document.querySelectorAll('.edit-stat-cb:checked');
  const statTypes = Array.from(checkboxes).map(cb => cb.value);

  if (!text) {
    alert('Введите текст квеста');
    return;
  }
  if (isNaN(xp) || xp < 1) {
    alert('Укажите корректное количество XP (минимум 1)');
    return;
  }

  if (currentEditIndex === null) {
    userData.todos.push({ text, xp, statTypes, completed: false });
  } else {
    const oldTodo = userData.todos[currentEditIndex];
    const wasCompleted = oldTodo.completed;
    if (wasCompleted) {
      removeXP(oldTodo.xp, oldTodo.statTypes);
    }

    userData.todos[currentEditIndex] = { text, xp, statTypes, completed: false };

    if (wasCompleted) {
      addXP(xp, statTypes);
      userData.todos[currentEditIndex].completed = true;
    }
  }

  closeEditModal();
  saveUserData();
  renderUI();
}

function closeEditModal() {
  document.getElementById('edit-modal').classList.remove('active');
  currentEditIndex = null;
}

function deleteTodo(index) {
  if (!confirm('Удалить квест?')) return;
  const todo = userData.todos[index];
  if (todo.completed) {
    removeXP(todo.xp, todo.statTypes);
  }
  userData.todos.splice(index, 1);
  saveUserData();
  renderUI();
}

function resetDailyTodos() {
  userData.todos = userData.todos.filter(todo => !todo.completed);
  saveUserData();
}

// === ТАЙМЕР ===
function updateTimer() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setHours(24, 0, 0, 0);
  const diff = tomorrow - now;
  if (diff <= 0) {
    document.getElementById('time-left').textContent = "00:00:00";
    return;
  }
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  document.getElementById('time-left').textContent =
    `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// === ЭКСПОРТ / ИМПОРТ / СБРОС ===
function exportData() {
  const dataStr = JSON.stringify(userData, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `solo-leveling-${new Date().toISOString().slice(0,10)}.json`;

  // Обязательно добавляем в DOM — иначе removeChild сломается
  document.body.appendChild(a);

  // Клик (совместимый с мобилками)
  if (typeof a.click === 'function') {
    a.click();
  } else {
    a.dispatchEvent(new MouseEvent('click', {
      view: window,
      bubbles: true,
      cancelable: true
    }));
  }

  // Удаляем через короткую задержку
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

function importData() {
  document.getElementById('import-file').click();
}

function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const importedData = JSON.parse(e.target.result);
      if (typeof importedData.totalXP !== 'number' || !importedData.stats) {
        throw new Error('Неверная структура данных');
      }

      if (!confirm('⚠️ Внимание!\n\nВсе текущие данные будут заменены импортированными.\nПродолжить?')) return;

      userData = importedData;
      userData.lastReset = new Date().toDateString();
      saveUserData();
      renderUI();
      alert('Данные успешно импортированы!');
    } catch (err) {
      alert(`Ошибка импорта: ${err.message}`);
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

function resetAllData() {
  if (!confirm('⚠️ ВНИМАНИЕ!\n\nВсе данные будут УДАЛЕНЫ безвозвратно.\nЭто включает уровни, статы и все квесты.\n\nВы уверены?')) {
    return;
  }
  userData = {
    totalXP: 0,
    stats: {
      strength: { totalXP: 0 },
      career: { totalXP: 0 },
      willpower: { totalXP: 0 }
    },
    todos: [],
    lastReset: new Date().toDateString()
  };
  saveUserData();
  renderUI();
  alert('✅ Все данные сброшены! Начинаем с чистого листа.');
}

// === ИНИЦИАЛИЗАЦИЯ ===
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('add-todo-btn').addEventListener('click', openAddModal);
  document.getElementById('save-edit-btn')?.addEventListener('click', saveEdit);
  document.getElementById('cancel-edit-btn')?.addEventListener('click', closeEditModal);
  document.getElementById('edit-modal').addEventListener('click', (e) => {
    if (e.target.id === 'edit-modal') closeEditModal();
  });
  loadUserData();
  setInterval(updateTimer, 1000);
  updateTimer();
});