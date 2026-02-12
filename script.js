
// === ДАННЫЕ ===
let userData = {
    totalXP: 0,
    stats: {
        strength: { totalXP: 0 },
        career: { totalXP: 0 },
        willpower: { totalXP: 0 }
    },
    todos: [],
    miscTodos: [],
    // Массив бустов: каждый буст привязан к задаче и стату
    boosts: [], // { id, taskId, statType, percentage, expiresAt, sourceText }
    history: [],
    lastReset: new Date().toDateString()
};

// === НАСТРОЙКИ XP ===
const XP_BASE = 130;
const XP_GROWTH_RATE = 1.05;
const MAX_BOOST_PERCENT = 100; // Максимальный суммарный буст

// === НАСТРОЙКИ СЛОЖНОСТИ ===
const DIFFICULTY_CONFIG = {
    1: { xp: 30, label: 'Оч. лёгкая', color: '#4da6ff', boost: 5 },
    2: { xp: 50, label: 'Лёгкая', color: '#4dff4d', boost: 10 },
    3: { xp: 80, label: 'Средняя', color: '#ffd166', boost: 15 },
    4: { xp: 130, label: 'Выше сред.', color: '#ff9e66', boost: 20 },
    5: { xp: 220, label: 'Сложная', color: '#ff4d4d', boost: 25 }
};

// === ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ===
function generateId(prefix = 'id') {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function xpRequiredForLevel(level) {
    if (level <= 1) return 0;
    let total = 0;
    for (let i = 1; i < level; i++) {
        total += Math.round(XP_BASE * Math.pow(XP_GROWTH_RATE, i - 1));
    }
    return total;
}

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

function cleanExpiredBoosts() {
    const now = new Date();
    userData.boosts = userData.boosts.filter(boost => new Date(boost.expiresAt) > now);
}

// === ЗАГРУЗКА ДАННЫХ ===
function loadUserData() {
    try {
        const savedData = localStorage.getItem('gameData');
        if (savedData) {
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
            
            // Миграция Misc задач и бустов
            let miscTodos = parsed.miscTodos || [];
            let boosts = [];
            
            // Если бусты в старом формате (объект), конвертируем в новый
            if (parsed.boosts && !Array.isArray(parsed.boosts)) {
                console.log('Конвертация старого формата бустов');
                Object.entries(parsed.boosts).forEach(([statType, boostData]) => {
                    if (boostData && boostData.percentage) {
                        boosts.push({
                            id: generateId('boost'),
                            taskId: `legacy-${statType}`,
                            statType,
                            percentage: boostData.percentage,
                            expiresAt: boostData.expiresAt || new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
                            sourceText: 'Импортированный буст'
                        });
                    }
                });
            } else if (Array.isArray(parsed.boosts)) {
                boosts = parsed.boosts.map(boost => ({
                    ...boost,
                    id: boost.id || generateId('boost'),
                    taskId: boost.taskId || `migrated-${Date.now()}`,
                    sourceText: boost.sourceText || 'Мигрированный буст'
                }));
            }
            
            // Добавляем ID для Misc задач, если их нет
            miscTodos = miscTodos.map(task => {
                if (!task.id) {
                    return { ...task, id: generateId('misc') };
                }
                return task;
            });
            
            userData = {
                totalXP: parsed.totalXP || 0,
                stats: {
                    strength: { totalXP: (parsed.stats?.strength?.totalXP) || 0 },
                    career: { totalXP: (parsed.stats?.career?.totalXP) || 0 },
                    willpower: { totalXP: (parsed.stats?.willpower?.totalXP) || 0 }
                },
                todos,
                miscTodos,
                boosts,
                history: parsed.history || [],
                lastReset: parsed.lastReset || new Date().toDateString()
            };
            
            // Очищаем просроченные бусты
            cleanExpiredBoosts();
            
            // Сброс ежедневных задач при новом дне
            const today = new Date().toDateString();
            if (userData.lastReset !== today) {
                resetDailyTodos();
                userData.lastReset = today;
            }
        }
    } catch (e) {
        console.error("Ошибка загрузки: ", e);
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
/*function addXP(amount, statTypes = []) {
    userData.totalXP += amount;
    statTypes.forEach(statType => {
        if (userData.stats[statType]) {
            userData.stats[statType].totalXP += amount;
        }
    });
    saveUserData();
    renderUI();
}*/

function addXP(amount, statTypes = []) {
const oldMainLevel = getLevelFromTotalXP(userData.totalXP).level;
const oldStatLevels = {};
statTypes.forEach(statType => {
oldStatLevels[statType] = getLevelFromTotalXP(userData.stats[statType].totalXP).level;
});

userData.totalXP += amount;
statTypes.forEach(statType => {
if (userData.stats[statType]) {
userData.stats[statType].totalXP += amount;
}
});

saveUserData();
renderUI();

// Проверка повышения уровня
const newMainLevel = getLevelFromTotalXP(userData.totalXP).level;
if (newMainLevel > oldMainLevel) {
showLevelUpNotification(newMainLevel);
}

// Проверка повышения уровня статов
statTypes.forEach(statType => {
const newStatLevel = getLevelFromTotalXP(userData.stats[statType].totalXP).level;
const oldLevel = oldStatLevels[statType];
if (newStatLevel > oldLevel) {
const statNames = {
strength: 'Strength',
career: 'Career',
willpower: 'Willpower'
};
showSkillLevelUpNotification(statNames[statType], statType, newStatLevel);
}
});
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

// === УПРАВЛЕНИЕ БУСТАМИ ===
function getActiveBoostsForStats(statTypes) {
    const now = new Date();
    const activeBoosts = [];
    const boostMap = new Map(); // Для суммирования бустов по статам
    
    // Собираем все активные бусты для указанных статов
    userData.boosts.forEach(boost => {
        if (statTypes.includes(boost.statType) && new Date(boost.expiresAt) > now) {
            if (!boostMap.has(boost.statType)) {
                boostMap.set(boost.statType, 0);
            }
            boostMap.set(boost.statType, boostMap.get(boost.statType) + boost.percentage);
            activeBoosts.push(boost);
        }
    });
    
    // Суммируем проценты по всем статам
    let totalPercentage = 0;
    boostMap.forEach(percent => {
        totalPercentage += percent;
    });
    
    // Ограничиваем максимальный буст
    totalPercentage = Math.min(totalPercentage, MAX_BOOST_PERCENT);
    
    return {
        totalPercentage,
        activeBoosts,
        boostMap // Для детального отображения
    };
}

function removeBoostsByIds(boostIds) {
    userData.boosts = userData.boosts.filter(boost => !boostIds.includes(boost.id));
}

// === УПРАВЛЕНИЕ ЗАДАЧАМИ MISCS ===
function toggleMisc(index) {
    const misc = userData.miscTodos[index];
    if (!misc.id) {
        misc.id = generateId('misc');
    }
    
    if (misc.completed) {
        // Отмена выполнения задачи - удаляем все связанные бусты
        userData.boosts = userData.boosts.filter(boost => boost.taskId !== misc.id);
        misc.completed = false;
        delete misc.expiresAt;
    } else {
        // Выполнение задачи - создаём буст
        const boostConfig = DIFFICULTY_CONFIG[misc.difficulty] || DIFFICULTY_CONFIG[3];
        const expiresAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); // 2 дня
        
        const boost = {
            id: generateId('boost'),
            taskId: misc.id,
            statType: misc.boostStatType,
            percentage: boostConfig.boost,
            expiresAt: expiresAt.toISOString(),
            sourceText: misc.text
        };
        
        userData.boosts.push(boost);
        misc.completed = true;
        misc.expiresAt = expiresAt.toISOString();
    }
    
    saveUserData();
    renderUI();
}

function deleteMisc(index) {
    if (!confirm('Удалить задачу жизни?')) return;
    const misc = userData.miscTodos[index];
    // Удаляем все бусты, созданные этой задачей
    if (misc.id) {
        userData.boosts = userData.boosts.filter(boost => boost.taskId !== misc.id);
    }
    
    userData.miscTodos.splice(index, 1);
    saveUserData();
    renderUI();
}

// === УПРАВЛЕНИЕ ДЕЙЛИКАМИ ===
function toggleTodo(index) {
    const todo = userData.todos[index];
    if (todo.completed) {
        // Отмена выполнения - возвращаем XP и удаляем из истории
        removeXP(todo.awardedXP || todo.xp, todo.statTypes);
        todo.completed = false;
        delete todo.awardedXP;
        delete todo.appliedBoosts;
        
        // Удаляем запись из истории
        if (todo.historyId) {
            userData.history = userData.history.filter(entry => entry.id !== todo.historyId);
            delete todo.historyId;
        }
    } else {
        // Расчёт бустов для этого дейлика
        const { totalPercentage, activeBoosts } = getActiveBoostsForStats(todo.statTypes);
        
        // Рассчитываем бонусный XP
        const boostXP = Math.round(todo.xp * (totalPercentage / 100));
        const totalXP = todo.xp + boostXP;
        
        // Удаляем использованные бусты (они сгорают после применения)
        const boostIdsToRemove = activeBoosts.map(b => b.id);
        removeBoostsByIds(boostIdsToRemove);
        
        // Начисляем XP
        addXP(totalXP, todo.statTypes);
        todo.completed = true;
        todo.awardedXP = totalXP;
        todo.appliedBoosts = activeBoosts.map(b => ({
            statType: b.statType,
            percentage: b.percentage,
            sourceText: b.sourceText
        }));
        
        // Добавляем в историю
        const historyEntry = {
            id: Date.now(),
            text: todo.text,
            baseXP: todo.xp,
            boostXP: boostXP,
            totalXP: totalXP,
            statTypes: [...todo.statTypes],
            appliedBoosts: todo.appliedBoosts,
            completedAt: new Date().toISOString()
        };
        userData.history.push(historyEntry);
        todo.historyId = historyEntry.id; // Сохраняем ID истории в задаче
        
        // Ограничиваем историю
        if (userData.history.length > 200) {
            userData.history = userData.history.slice(-200);
        }

        // Проверяем, все ли квесты завершены
        const incompleteTodos = userData.todos.filter(t => !t.completed);
        if (incompleteTodos.length === 0 && userData.todos.length > 0) {
        showDailyQuestsCompleteNotification();
        }
    }
    
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
    
    const miscCount = userData.miscTodos.filter(m => !m.completed).length;
    document.getElementById('misc-count').textContent = miscCount;
    
    renderTodoList();
    renderMiscList();

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
        // Рассчитываем текущий буст для этого дейлика
        const { totalPercentage, boostMap } = getActiveBoostsForStats(todo.statTypes);
        const boostXP = totalPercentage > 0 ? Math.round(todo.xp * (totalPercentage / 100)) : 0;
        
        // Формируем бейджи статов
        const statBadges = todo.statTypes.map(stat =>
            `<span class="stat-badge ${stat}">${statIcons[stat] || stat.charAt(0).toUpperCase()}</span>`
        ).join('');
        
        // Формируем информацию о бустах
        let boostInfo = '';
        if (totalPercentage > 0) {
            const boostDetails = Array.from(boostMap.entries())
                .map(([stat, percent]) => `${statIcons[stat] || stat.charAt(0).toUpperCase()} +${percent}%`)
                .join(', ');
            
            boostInfo = `
                <div class="task-stats">
                    <div class="boost-badge">+${boostXP} XP (${totalPercentage}%)</div>
                    <div class="active-boosts-info">Активные бусты: ${boostDetails}</div>
                </div>
            `;
        }
        
        const todoElement = document.createElement('div');
        todoElement.className = `todo-item ${todo.completed ? 'completed' : ''}`;
        todoElement.innerHTML = `
            <input type="checkbox" ${todo.completed ? 'checked' : ''}
                onchange="toggleTodo(${index})">
            <div class="task-info">
                <div class="task-text">${escapeHtml(todo.text)}</div>
                ${statBadges ? `<div class="task-stats">${statBadges}</div>` : ''}
                ${boostInfo}
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

function renderMiscList() {
    const container = document.getElementById('misc-container');
    container.innerHTML = '';
    const statIcons = {
        strength: '💪',
        career: '💸',
        willpower: '🔥'
    };
    const statNames = {
        strength: 'Strength',
        career: 'Career',
        willpower: 'Willpower'
    };
    
    // Группируем активные бусты по задачам для отображения
    const activeBoostsByTask = {};
    userData.boosts.forEach(boost => {
        if (!activeBoostsByTask[boost.taskId]) {
            activeBoostsByTask[boost.taskId] = [];
        }
        activeBoostsByTask[boost.taskId].push(boost);
    });
    
    userData.miscTodos.forEach((misc, index) => {
        if (!misc.id) misc.id = generateId('misc');
        
        const boostConfig = DIFFICULTY_CONFIG[misc.difficulty] || DIFFICULTY_CONFIG[3];
        const boostStatIcon = statIcons[misc.boostStatType] || '🌟';
        const boostStatName = statNames[misc.boostStatType] || 'Unknown';
        
        // Build the misc-meta content conditionally
        let miscMetaContent = `
            <span class="stat-badge">${boostStatIcon} ${boostStatName}</span>
        `;
        
        if (!misc.completed) {
            // For uncompleted tasks, show the yellow badge
            miscMetaContent += `<span class="boost-badge">+${boostConfig.boost}% буст</span>`;
        } else {
            // For completed tasks, show active boost details
            if (activeBoostsByTask[misc.id] && activeBoostsByTask[misc.id].length > 0) {
                const boost = activeBoostsByTask[misc.id][0];
                const isExpired = new Date(boost.expiresAt) < new Date();
                const expiryDateStr = new Date(boost.expiresAt).toLocaleDateString('ru-RU');
                
                miscMetaContent += `
                    <span class="boost-badge ${isExpired ? 'expired' : 'active'}">
                        ${boostStatIcon} +${boost.percentage}% буст
                        <span class="boost-source">(до ${expiryDateStr})</span>
                    </span>
                `;
            } else {
                // Fallback if no active boost found
                miscMetaContent += `<span class="boost-badge expired">+${boostConfig.boost}% буст (истёк)</span>`;
            }
        }
        
        const miscElement = document.createElement('div');
        miscElement.className = `misc-item ${misc.completed ? 'completed' : ''}`;
        miscElement.innerHTML = `
            <input type="checkbox" ${misc.completed ? 'checked' : ''}
                onchange="toggleMisc(${index})">
            <div class="task-info">
                <div class="task-text">${escapeHtml(misc.text)}</div>
                <div class="misc-meta">
                    ${miscMetaContent}
                </div>
            </div>
            <div class="misc-actions">
                <div class="action-buttons-row">
                    <button class="edit-btn" onclick="editMisc(${index})" title="Редактировать">✏️</button>
                    <button class="delete-btn" onclick="deleteMisc(${index})" title="Удалить">🗑️</button>
                </div>
            </div>
        `;
        container.appendChild(miscElement);
    });
}

// === РЕДАКТИРОВАНИЕ ЗАДАЧ ===
let currentEditIndex = null;
let currentMiscEditIndex = null;

function openAddModal() {
    currentEditIndex = null;
    document.getElementById('modal-title').textContent = 'Добавить квест';
    document.getElementById('edit-todo-text').value = '';
    document.querySelectorAll('.edit-stat-cb').forEach(cb => cb.checked = false);
    document.getElementById('edit-modal').classList.add('active');
    updateDifficultyUI(3);
}

function editTodo(index) {
    const todo = userData.todos[index];
    currentEditIndex = index;
    document.getElementById('modal-title').textContent = 'Редактировать квест';
    document.getElementById('edit-todo-text').value = todo.text;
    
    let selectedLevel = 3;
    for (const [level, config] of Object.entries(DIFFICULTY_CONFIG)) {
        if (config.xp === todo.xp) {
            selectedLevel = parseInt(level);
            break;
        }
    }
    
    document.querySelectorAll('.edit-stat-cb').forEach(cb => {
        cb.checked = todo.statTypes.includes(cb.value);
    });
    
    document.getElementById('edit-modal').classList.add('active');
    updateDifficultyUI(selectedLevel);
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
    
    if (statTypes.length === 0) {
        alert('Выберите хотя бы один стат для квеста');
        return;
    }

    console.log(`[EDIT TODO] Saving todo | Index: ${currentEditIndex} | Text: "${text}" | XP: ${xp} | Stats: ${statTypes.join(', ')}`);
    
    if (currentEditIndex === null) {
        userData.todos.push({ text, xp, statTypes, completed: false });
        console.log('[EDIT TODO] Added new todo');
    } else {
        const oldTodo = userData.todos[currentEditIndex];
        const wasCompleted = oldTodo.completed;
        console.log(`[EDIT TODO] Editing existing todo | Was completed: ${wasCompleted} | Old XP: ${oldTodo.xp} | Old stats: ${oldTodo.statTypes?.join(', ')}`);
        
        // If was completed, remove XP and history entry
        if (wasCompleted) {
            console.log('[EDIT TODO] Removing old completion data...');
            removeXP(oldTodo.awardedXP || oldTodo.xp, oldTodo.statTypes);
            
            // Remove from history
            if (oldTodo.historyId) {
                const removedCount = userData.history.length;
                userData.history = userData.history.filter(entry => entry.id !== oldTodo.historyId);
                console.log(`[EDIT TODO] Removed ${removedCount - userData.history.length} history entries`);
            }
        }
        
        userData.todos[currentEditIndex] = { text, xp, statTypes, completed: false };
        
        // If was completed, re-add XP and create new history entry
        if (wasCompleted) {
            const { totalPercentage, activeBoosts } = getActiveBoostsForStats(statTypes);
            const boostXP = Math.round(xp * (totalPercentage / 100));
            const totalXP = xp + boostXP;
            
            // Remove used boosts
            const boostIdsToRemove = activeBoosts.map(b => b.id);
            removeBoostsByIds(boostIdsToRemove);
            
            // Add XP
            addXP(totalXP, statTypes);
            userData.todos[currentEditIndex].completed = true;
            userData.todos[currentEditIndex].awardedXP = totalXP;
            
            // Create new history entry
            const historyEntry = {
                id: Date.now(),
                text,
                baseXP: xp,
                boostXP,
                totalXP,
                statTypes: [...statTypes],
                appliedBoosts: activeBoosts.map(b => ({
                    statType: b.statType,
                    percentage: b.percentage,
                    sourceText: b.sourceText
                })),
                completedAt: new Date().toISOString()
            };
            userData.history.push(historyEntry);
            userData.todos[currentEditIndex].historyId = historyEntry.id;
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
    
    // If completed, remove XP and history entry
    if (todo.completed) {
        removeXP(todo.awardedXP || todo.xp, todo.statTypes);
        
        if (todo.historyId) {
            userData.history = userData.history.filter(entry => entry.id !== todo.historyId);
        }
    }
    
    userData.todos.splice(index, 1);
    saveUserData();
    renderUI();
}

// === РЕДАКТИРОВАНИЕ MISCS ===
function openAddMiscModal() {
    currentMiscEditIndex = null;
    document.getElementById('misc-modal-title').textContent = 'Добавить задачу жизни';
    document.getElementById('edit-misc-text').value = '';
    document.querySelector('input[name="boost-stat"][value="strength"]').checked = true;
    document.getElementById('edit-misc-modal').classList.add('active');
    updateMiscDifficultyUI(3);
    updateBoostDisplay();
}

function editMisc(index) {
    const misc = userData.miscTodos[index];
    currentMiscEditIndex = index;
    document.getElementById('misc-modal-title').textContent = 'Редактировать задачу';
    document.getElementById('edit-misc-text').value = misc.text;
    document.querySelector(`input[name="boost-stat"][value="${misc.boostStatType}"]`).checked = true;
    document.getElementById('edit-misc-modal').classList.add('active');
    updateMiscDifficultyUI(misc.difficulty);
    updateBoostDisplay();
}

function saveMiscEdit() {
    const text = document.getElementById('edit-misc-text').value.trim();
    const difficulty = parseInt(document.getElementById('edit-misc-boost').dataset.level);
    const boostStatType = document.querySelector('input[name="boost-stat"]:checked').value;
    
    if (!text) {
        alert('Введите текст задачи');
        return;
    }
    
    if (currentMiscEditIndex === null) {
        // Создаём новую задачу с уникальным ID
        userData.miscTodos.push({ 
            id: generateId('misc'),
            text, 
            difficulty, 
            boostStatType, 
            completed: false 
        });
    } else {
        const oldMisc = userData.miscTodos[currentMiscEditIndex];
        // Сохраняем ID при редактировании
        const newMisc = { 
            id: oldMisc.id,
            text, 
            difficulty, 
            boostStatType, 
            completed: oldMisc.completed,
            expiresAt: oldMisc.expiresAt
        };
        
        // Если задача была выполнена, обновляем бусты
        if (oldMisc.completed) {
            // Удаляем старые бусты от этой задачи
            userData.boosts = userData.boosts.filter(boost => boost.taskId !== oldMisc.id);
            
            // Создаём новые бусты с новыми параметрами
            const boostConfig = DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG[3];
            const expiresAt = new Date(oldMisc.expiresAt || Date.now() + 2 * 24 * 60 * 60 * 1000);
            
            const boost = {
                id: generateId('boost'),
                taskId: oldMisc.id,
                statType: boostStatType,
                percentage: boostConfig.boost,
                expiresAt: expiresAt.toISOString(),
                sourceText: text
            };
            
            userData.boosts.push(boost);
            newMisc.expiresAt = expiresAt.toISOString();
        }
        
        userData.miscTodos[currentMiscEditIndex] = newMisc;
    }
    
    closeMiscEditModal();
    saveUserData();
    renderUI();
}

function closeMiscEditModal() {
    document.getElementById('edit-misc-modal').classList.remove('active');
    currentMiscEditIndex = null;
}

function updateBoostDisplay() {
    const selectedStat = document.querySelector('input[name="boost-stat"]:checked').value;
    const difficulty = parseInt(document.getElementById('edit-misc-boost').dataset.level || 3);
    const boostConfig = DIFFICULTY_CONFIG[difficulty] || DIFFICULTY_CONFIG[3];
    const statNames = {
        strength: 'Strength',
        career: 'Career',
        willpower: 'Willpower'
    };
    document.getElementById('boost-target').textContent = statNames[selectedStat];
    document.getElementById('boost-amount').textContent = `+${boostConfig.boost}%`;
}

// === ОСТАЛЬНЫЕ ФУНКЦИИ ===
function resetDailyTodos() {
    // Only reset uncompleted todos, keep completed ones for history
    userData.todos = userData.todos.filter(todo => !todo.completed);
    saveUserData();
}

function openHistoryModal() {
    document.getElementById('history-modal').classList.add('active');
    renderHistory();
}

function closeHistoryModal() {
    document.getElementById('history-modal').classList.remove('active');
}

function clearHistory() {
    if (confirm('⚠️ Очистить ВСЮ историю?\nЭто действие нельзя отменить. Все записи о выполненных квестах будут удалены.')) {
        userData.history = [];
        saveUserData();
        renderHistory();
        alert('✅ История успешно очищена!');
    }
}

function renderHistory() {
    const container = document.getElementById('history-container');
    if (!container) return;
    
    const totalEntries = userData.history.length;
    const totalXP = userData.history.reduce((sum, entry) => sum + entry.totalXP, 0);
    document.getElementById('history-stats-summary').innerHTML = 
        `<span>Всего выполнено: <strong>${totalEntries}</strong></span>` +
        `<span>Получено XP: <strong>${totalXP}</strong></span>`;
    
    if (userData.history.length === 0) {
        container.innerHTML = 
            `<div class="empty-history">
                <div class="empty-icon">📜</div>
                <p>История пуста</p>
                <small>Выполняйте квесты, чтобы видеть их здесь!</small>
            </div>`;
        return;
    }
    
    const grouped = {};
    userData.history.forEach(entry => {
        const dateKey = entry.completedAt.split('T')[0];
        if (!grouped[dateKey]) grouped[dateKey] = [];
        grouped[dateKey].push(entry);
    });
    
    const sortedDates = Object.keys(grouped).sort().reverse();
    let html = '';
    const statIcons = { strength: '💪', career: '💸', willpower: '🔥' };
    
    sortedDates.forEach(dateKey => {
        const dateObj = new Date(dateKey);
        const displayDate = dateObj.toLocaleDateString('ru-RU', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        
        const entries = grouped[dateKey].sort((a, b) => 
            new Date(b.completedAt) - new Date(a.completedAt)
        );
        
        html += `<div class="history-date-group">
            <h4 class="history-date-title">${displayDate}</h4>
            <div class="history-entries">`;
        
        entries.forEach(entry => {
            const time = new Date(entry.completedAt).toLocaleTimeString('ru-RU', {
                hour: '2-digit',
                minute: '2-digit'
            });
            
            const statBadges = entry.statTypes.map(stat => 
                `<span class="stat-badge ${stat}">${statIcons[stat] || stat.charAt(0).toUpperCase()}</span>`
            ).join('');
            
            // Отображаем информацию о бустах
            let boostInfo = '';
            if (entry.appliedBoosts && entry.appliedBoosts.length > 0) {
                const boostDetails = entry.appliedBoosts.map(boost => 
                    `${statIcons[boost.statType] || boost.statType.charAt(0).toUpperCase()} +${boost.percentage}% (${escapeHtml(boost.sourceText)})`
                ).join(', ');
                boostInfo = `<div class="history-boosts-badge">Бусты: ${boostDetails}</div>`;
            }
            
            const safeText = escapeHtml(entry.text);
            
            html += `
                <div class="history-entry">
                    <div class="history-time">${time}</div>
                    <div class="history-content">
                        <div class="history-text">${safeText}</div>
                        <div class="history-meta">
                            ${statBadges}
                            <span class="xp-badge history-xp">${entry.totalXP} XP</span>
                            ${entry.boostXP > 0 ? `<span class="boost-badge">+${entry.boostXP} XP</span>` : ''}
                        </div>
                        ${boostInfo}
                    </div>
                </div>`;
        });
        
        html += `</div></div>`;
    });
    
    container.innerHTML = html;
}

function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// === УПРАВЛЕНИЕ СЛОЖНОСТЬЮ ===
function updateDifficultyUI(level) {
    const markers = document.querySelectorAll('#difficulty-ruler .ruler-marker');
    const thumb = document.getElementById('ruler-thumb');
    const progress = document.getElementById('ruler-progress');
    const previewLabel = document.querySelector('#edit-modal .preview-label');
    const previewXP = document.querySelector('#edit-modal .preview-xp');
    
    markers.forEach(marker => {
        marker.classList.toggle('active', parseInt(marker.dataset.level) === level);
        if (parseInt(marker.dataset.level) === level) {
            marker.classList.add('marker-select');
            setTimeout(() => marker.classList.remove('marker-select'), 400);
        }
    });
    
    const activeMarker = document.querySelector(`#difficulty-ruler .ruler-marker[data-level="${level}"]`);
    const ruler = document.querySelector('#difficulty-ruler');
    
    if (activeMarker && thumb && ruler) {
        const rulerRect = ruler.getBoundingClientRect();
        const markerRect = activeMarker.getBoundingClientRect();
        const centerOffset = markerRect.left + markerRect.width / 2 - rulerRect.left;
        const thumbLeft = centerOffset - thumb.offsetWidth / 2;
        thumb.style.left = `${thumbLeft}px`;
    }
    
    if (progress) {
        const percent = ((level - 1) / 4) * 100;
        progress.style.width = `${percent}%`;
    }
    
    const config = DIFFICULTY_CONFIG[level];
    previewLabel.textContent = config.label;
    previewLabel.style.color = config.color;
    previewXP.textContent = `${config.xp} XP`;
    previewXP.value = config.xp;
}

function handleDifficultyClick(event) {
    if (event.target.classList.contains('ruler-marker')) {
        const level = parseInt(event.target.dataset.level);
        updateDifficultyUI(level);
    }
}

function updateMiscDifficultyUI(level) {
    const markers = document.querySelectorAll('#misc-difficulty-ruler .ruler-marker');
    const thumb = document.getElementById('misc-ruler-thumb');
    const progress = document.getElementById('misc-ruler-progress');
    const previewLabel = document.querySelector('#edit-misc-modal .preview-label');
    const previewBoost = document.querySelector('#edit-misc-modal .preview-xp');
    
    markers.forEach(marker => {
        marker.classList.toggle('active', parseInt(marker.dataset.level) === level);
        if (parseInt(marker.dataset.level) === level) {
            marker.classList.add('marker-select');
            setTimeout(() => marker.classList.remove('marker-select'), 400);
        }
    });
    
    const activeMarker = document.querySelector(`#misc-difficulty-ruler .ruler-marker[data-level="${level}"]`);
    const ruler = document.querySelector('#misc-difficulty-ruler');
    
    if (activeMarker && thumb && ruler) {
        const rulerRect = ruler.getBoundingClientRect();
        const markerRect = activeMarker.getBoundingClientRect();
        const centerOffset = markerRect.left + markerRect.width / 2 - rulerRect.left;
        const thumbLeft = centerOffset - thumb.offsetWidth / 2;
        thumb.style.left = `${thumbLeft}px`;
    }
    
    if (progress) {
        const percent = ((level - 1) / 4) * 100;
        progress.style.width = `${percent}%`;
    }
    
    const config = DIFFICULTY_CONFIG[level];
    previewLabel.textContent = config.label;
    previewLabel.style.color = config.color;
    previewBoost.textContent = `+${config.boost}% буст`;
    previewBoost.dataset.level = level;
    
    // Обновляем отображение буста
    updateBoostDisplay();
}

function handleMiscDifficultyClick(event) {
    if (event.target.classList.contains('ruler-marker')) {
        const level = parseInt(event.target.dataset.level);
        updateMiscDifficultyUI(level);
    }
}

// === СИСТЕМА УВЕДОМЛЕНИЙ ===
/*
function showNotification(type, title, message) {
    const container = document.getElementById('notification-container');
    if (!container) {
        console.error('[NOTIFICATION] Container not found!');
        return;
    }

    const notification = document.createElement('div');
    notification.className = 'notification';
    const notificationId = `notif-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    notification.dataset.notificationId = notificationId;
    
    notification.innerHTML = `
        <div class="notification-content">
            <h4 class="notification-title ${type}">${title}</h4>
            <p class="notification-message">${message}</p>
        </div>
        <button class="notification-close" aria-label="Закрыть уведомление">×</button>
    `;
    
    container.appendChild(notification);
    console.log(`[NOTIFICATION] ${title} | ${message}`);
    
    // Авто-скрытие через 6 секунд
    let timeoutId = setTimeout(() => {
        fadeOutNotification(notification, notificationId);
    }, 6000);
    notification._timeoutId = timeoutId;
    
    // Обработчики кнопки и наведения
    const closeBtn = notification.querySelector('.notification-close');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            clearTimeout(notification._timeoutId);
            fadeOutNotification(notification, notificationId);
        });
        
        notification.addEventListener('mouseenter', () => {
            clearTimeout(notification._timeoutId);
        });
        
        notification.addEventListener('mouseleave', () => {
            notification._timeoutId = setTimeout(() => {
                fadeOutNotification(notification, notificationId);
            }, 3000);
        });
    }
    
    // Лимит уведомлений
    const maxNotifications = 5;
    while (container.children.length > maxNotifications) {
        container.firstChild.remove();
    }
}

function fadeOutNotification(notification, id) {
    notification.style.animation = 'fadeOut 0.5s ease forwards';
    setTimeout(() => {
        if (notification.parentNode) notification.remove();
    }, 500);
}

function showLevelUpNotification(newLevel) {
    console.log(`[LEVEL UP] Достигнут уровень ${newLevel}`);
    showNotification(
        'level-up',
        'Leveled up!',
        `Lvl ${newLevel}`
    );
}

function showSkillLevelUpNotification(statName, statType, newLevel) {
    console.log(`[SKILL UP] ${statName} достиг ${newLevel} уровня`);
    
    const statIcons = {
        strength: '💪',
        career: '💸',
        willpower: '🔥'
    };
    const icon = statIcons[statType] || '✨';
    
    showNotification(
        'skill-up',
        'Skill Level increased!',
        `${icon} ${statName} Lvl ${newLevel}`
    );
}

function showDailyQuestsCompleteNotification() {
    console.log('[DAILY QUESTS] Все квесты завершены');
    showNotification(
        'success',
        '🎯 Daily Quests Complete!',
        'Все ежедневные квесты на сегодня завершены!'
    );
}
*/

function showNotification(type, title, message) {
    const container = document.getElementById('notification-container');
    if (!container) {
        console.warn('[NOTIFICATION] Container not found');
        return;
    }

    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.dataset.type = type;

    notification.innerHTML = `
        <div class="notification-content">
            <h4 class="notification-title ${type}">${title}</h4>
            <p class="notification-message">${message}</p>
        </div>
        <button class="notification-close" aria-label="Закрыть">×</button>
    `;

    container.appendChild(notification);

    // Авто-скрытие через 6 секунд
    let timeoutId = setTimeout(() => {
        notification.style.animation = 'fadeOut 0.4s forwards';
        setTimeout(() => {
            if (notification.parentNode) notification.remove();
        }, 400);
    }, 6000);

    // Отмена таймера при наведении
    notification.addEventListener('mouseenter', () => clearTimeout(timeoutId));
    notification.addEventListener('mouseleave', () => {
        timeoutId = setTimeout(() => {
            notification.style.animation = 'fadeOut 0.4s forwards';
            setTimeout(() => {
                if (notification.parentNode) notification.remove();
            }, 400);
        }, 3000);
    });

    // Закрытие по кнопке
    notification.querySelector('.notification-close').addEventListener('click', () => {
        clearTimeout(timeoutId);
        notification.style.animation = 'fadeOut 0.4s forwards';
        setTimeout(() => {
            if (notification.parentNode) notification.remove();
        }, 400);
    });

    // Лимит уведомлений
    if (container.children.length > 5) {
        container.firstChild.remove();
    }
}

function showLevelUpNotification(newLevel) {
    console.log(`[LEVEL UP] Lvl ${newLevel}`);
    showNotification('level-up', 'Leveled up!', `Lvl ${newLevel}`);
}

function showSkillLevelUpNotification(statName, statType, newLevel) {
    console.log(`[SKILL UP] ${statName} → Lvl ${newLevel}`);
    const icons = { strength: '💪', career: '💸', willpower: '🔥' };
    const icon = icons[statType] || '✨';
    showNotification('skill-up', 'Skill Level increased!', `${icon} ${statName}, Lvl ${newLevel}`);
}

function showDailyQuestsCompleteNotification() {
    console.log('[DAILY QUESTS] All completed');
    showNotification('success', '🎯 Daily Quests Complete!', 'Все ежедневные квесты на сегодня завершены!');
}

// === ТАЙМЕР И ЭКСПОРТ ===
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

function exportData() {
    const dataStr = JSON.stringify(userData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `solo-leveling-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
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
            cleanExpiredBoosts();
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
    if (!confirm('⚠️ ВНИМАНИЕ!\n\nВсе данные будут УДАЛЕНЫ безвозвратно.\nЭто включает уровни, статы, квесты и задачи жизни.\n\nВы уверены?')) {
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
        miscTodos: [],
        boosts: [],
        history: [],
        lastReset: new Date().toDateString()
    };
    saveUserData();
    renderUI();
    alert('✅ Все данные сброшены! Начинаем с чистого листа.');
}

// === ИНИЦИАЛИЗАЦИЯ ===
document.addEventListener('DOMContentLoaded', () => {
    // Daily quest modal handlers
    document.getElementById('add-todo-btn').addEventListener('click', openAddModal);
    document.getElementById('save-edit-btn').addEventListener('click', saveEdit);
    document.getElementById('cancel-edit-btn').addEventListener('click', closeEditModal);
    document.getElementById('close-modal').addEventListener('click', closeEditModal);
    document.getElementById('edit-modal').addEventListener('click', (e) => {
        if (e.target.id === 'edit-modal') closeEditModal();
    });
    
    // Misc modal handlers
    document.getElementById('add-misc-btn').addEventListener('click', openAddMiscModal);
    document.getElementById('save-misc-edit-btn').addEventListener('click', saveMiscEdit);
    document.getElementById('cancel-misc-edit-btn').addEventListener('click', closeMiscEditModal);
    document.getElementById('close-misc-modal').addEventListener('click', closeMiscEditModal);
    document.getElementById('edit-misc-modal').addEventListener('click', (e) => {
        if (e.target.id === 'edit-misc-modal') closeMiscEditModal();
    });
    
    // Обновление отображения буста при выборе стата или сложности
    document.querySelectorAll('input[name="boost-stat"]').forEach(radio => {
        radio.addEventListener('change', updateBoostDisplay);
    });
    document.getElementById('misc-difficulty-ruler').addEventListener('click', handleMiscDifficultyClick);
    
    // History modal handlers
    document.getElementById('open-history-btn').addEventListener('click', openHistoryModal);
    document.getElementById('close-history-btn').addEventListener('click', closeHistoryModal);
    document.getElementById('close-history-modal').addEventListener('click', closeHistoryModal);
    document.getElementById('clear-history-btn').addEventListener('click', clearHistory);
    document.getElementById('history-modal').addEventListener('click', (e) => {
        if (e.target.id === 'history-modal') closeHistoryModal();
    });
    
    // Export/import/reset handlers
    document.getElementById('export-btn').addEventListener('click', exportData);
    document.getElementById('import-btn').addEventListener('click', importData);
    document.getElementById('import-file').addEventListener('change', handleFileSelect);
    document.getElementById('reset-btn').addEventListener('click', resetAllData);
    
    // Difficulty selectors
    document.getElementById('difficulty-ruler').addEventListener('click', handleDifficultyClick);
    
    // Initialize UI
    updateDifficultyUI(3);
    updateMiscDifficultyUI(3);
    updateBoostDisplay();
    
    // Load data and start timer
    loadUserData();
    setInterval(updateTimer, 1000);
    updateTimer();
});