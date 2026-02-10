
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
            boosts: {
                strength: null,
                career: null,
                willpower: null
            },
            history: [],
            lastReset: new Date().toDateString()
        };
        
        // === НАСТРОЙКИ XP ===
        const XP_BASE = 130;         // XP от lvl 1 → 2
        const XP_GROWTH_RATE = 1.05; // Экспоненциальный рост
        
        // === ФОРМУЛЫ ===
        function xpRequiredForLevel(level) {
            if (level <= 1) return 0;
            let total = 0;
            for (let i = 1; i < level; i++) {
                total += Math.round(XP_BASE * Math.pow(XP_GROWTH_RATE, i - 1));
            }
            return total;
        }
        
        // === НАСТРОЙКИ СЛОЖНОСТИ ===
        const DIFFICULTY_CONFIG = {
            1: { xp: 30, label: 'Оч. лёгкая', color: '#4da6ff', boost: 5 },
            2: { xp: 50, label: 'Лёгкая', color: '#4dff4d', boost: 10 },
            3: { xp: 80, label: 'Средняя', color: '#ffd166', boost: 15 },
            4: { xp: 130, label: 'Выше сред.', color: '#ff9e66', boost: 20 },
            5: { xp: 220, label: 'Сложная', color: '#ff4d4d', boost: 25 }
        };
        
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
                    
                    // Initialize miscTodos and boosts if not present
                    const miscTodos = parsed.miscTodos || [];
                    const boosts = parsed.boosts || {
                        strength: null,
                        career: null,
                        willpower: null
                    };
                    
                    // Clean expired boosts
                    cleanExpiredBoosts(boosts);
                    
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
        
        function cleanExpiredBoosts(boosts) {
            const now = new Date();
            Object.keys(boosts).forEach(statType => {
                if (boosts[statType]) {
                    const expiresAt = new Date(boosts[statType].expiresAt);
                    if (expiresAt < now) {
                        boosts[statType] = null;
                    }
                }
            });
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
                // Calculate boost for this todo
                let boostXP = 0;
                let boostStatType = null;
                let highestBoost = 0;
                
                // Check for active boosts on this todo's stat types
                todo.statTypes.forEach(statType => {
                    const boost = userData.boosts[statType];
                    if (boost && new Date(boost.expiresAt) > new Date()) {
                        if (boost.percentage > highestBoost) {
                            highestBoost = boost.percentage;
                            boostStatType = statType;
                        }
                    }
                });
                
                if (highestBoost > 0) {
                    boostXP = Math.round(todo.xp * (highestBoost / 100));
                }
                
                const statBadges = todo.statTypes.map(stat =>
                    `<span class="stat-badge ${stat}">${statIcons[stat] || stat.charAt(0).toUpperCase()}</span>`
                ).join('');
                
                const boostBadge = boostXP > 0 ? 
                    `<div class="boost-badge">+${boostXP} XP <span style="font-size:0.9em">(${highestBoost}%)</span></div>` : '';
                
                const todoElement = document.createElement('div');
                todoElement.className = `todo-item ${todo.completed ? 'completed' : ''}`;
                todoElement.innerHTML = `
                    <input type="checkbox" ${todo.completed ? 'checked' : ''}
                         onchange="toggleTodo(${index})">
                    <div class="task-info">
                        <div class="task-text">${escapeHtml(todo.text)}</div>
                        ${statBadges ? `<div class="task-stats">${statBadges}</div>` : ''}
                        ${boostBadge ? `<div class="task-stats">${boostBadge}</div>` : ''}
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
            
            userData.miscTodos.forEach((misc, index) => {
                const boostConfig = DIFFICULTY_CONFIG[misc.difficulty] || DIFFICULTY_CONFIG[3];
                const boostStatIcon = statIcons[misc.boostStatType] || '🌟';
                const boostStatName = {
                    strength: 'Strength',
                    career: 'Career',
                    willpower: 'Willpower'
                }[misc.boostStatType] || 'Unknown';
                
                const miscElement = document.createElement('div');
                miscElement.className = `misc-item ${misc.completed ? 'completed' : ''}`;
                miscElement.innerHTML = `
                    <input type="checkbox" ${misc.completed ? 'checked' : ''}
                         onchange="toggleMisc(${index})">
                    <div class="task-info">
                        <div class="task-text">${escapeHtml(misc.text)}</div>
                        <div class="misc-meta">
                            <span class="stat-badge">${boostStatIcon} ${boostStatName}</span>
                            <span class="boost-badge">+${boostConfig.boost}% буст</span>
                        </div>
                        ${misc.completed && misc.expiresAt ? 
                            `<span class="boost-expiry">Буст действует до: ${new Date(misc.expiresAt).toLocaleDateString('ru-RU')}</span>` : 
                            ''}
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
        
        // === УПРАВЛЕНИЕ ЗАДАЧАМИ ===
        function toggleTodo(index) {
            const todo = userData.todos[index];
            if (todo.completed) {
                // When unchecking, we don't restore boosts - they were consumed
                removeXP(todo.awardedXP || todo.xp, todo.statTypes);
                todo.completed = false;
                todo.awardedXP = undefined; // Reset awarded XP
            } else {
                // Calculate boost before completing
                let boostXP = 0;
                let boostStatType = null;
                let highestBoost = 0;
                
                // Check for active boosts on this todo's stat types
                todo.statTypes.forEach(statType => {
                    const boost = userData.boosts[statType];
                    if (boost && new Date(boost.expiresAt) > new Date()) {
                        if (boost.percentage > highestBoost) {
                            highestBoost = boost.percentage;
                            boostStatType = statType;
                        }
                    }
                });
                
                if (highestBoost > 0) {
                    boostXP = Math.round(todo.xp * (highestBoost / 100));
                    // Consume the boost
                    userData.boosts[boostStatType] = null;
                }
                
                const totalXP = todo.xp + boostXP;
                addXP(totalXP, todo.statTypes);
                todo.completed = true;
                todo.awardedXP = totalXP; // Store the actual awarded XP
                
                // Добавляем запись в историю
                userData.history.push({
                    id: Date.now(),
                    text: todo.text,
                    xp: totalXP, // Store the actual awarded XP (with boost)
                    baseXP: todo.xp, // Store base XP for reference
                    boostXP: boostXP,
                    statTypes: [...todo.statTypes],
                    completedAt: new Date().toISOString()
                });
                
                // Ограничиваем историю последними 200 записями
                if (userData.history.length > 200) {
                    userData.history = userData.history.slice(-200);
                }
            }
            saveUserData();
            renderUI();
        }
        
        function toggleMisc(index) {
            const misc = userData.miscTodos[index];
            if (misc.completed) {
                // Cannot uncomplete a misc task - the boost is already applied
                alert("Задачу жизни нельзя отменить после завершения. Буст уже активирован.");
                renderUI(); // Re-render to reset the checkbox
                return;
            }
            
            // Apply boost
            const boostConfig = DIFFICULTY_CONFIG[misc.difficulty] || DIFFICULTY_CONFIG[3];
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 2); // Boost lasts for 2 days
            
            userData.boosts[misc.boostStatType] = {
                percentage: boostConfig.boost,
                expiresAt: expiresAt.toISOString()
            };
            
            misc.completed = true;
            misc.expiresAt = expiresAt.toISOString(); // For display purposes only
            
            saveUserData();
            renderUI();
        }
        
        // === РЕДАКТИРОВАНИЕ ДЕЙЛИКОВ ===
        let currentEditIndex = null;
        let currentMiscEditIndex = null;
        
        function openAddModal() {
            currentEditIndex = null;
            document.getElementById('modal-title').textContent = 'Добавить квест';
            document.getElementById('edit-todo-text').value = '';
            document.querySelectorAll('.edit-stat-cb').forEach(cb => cb.checked = false);
            document.getElementById('edit-modal').classList.add('active');
            
            // Set default difficulty to 3 (Medium)
            updateDifficultyUI(3);
        }
        
        function editTodo(index) {
            const todo = userData.todos[index];
            currentEditIndex = index;
            document.getElementById('modal-title').textContent = 'Редактировать квест';
            document.getElementById('edit-todo-text').value = todo.text;
            
            // Определяем уровень сложности по XP
            let selectedLevel = 3; // по умолчанию средняя
            for (const [level, config] of Object.entries(DIFFICULTY_CONFIG)) {
                if (config.xp === todo.xp) {
                    selectedLevel = parseInt(level);
                    break;
                }
            }
            
            // Set stat checkboxes
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
            
            if (currentEditIndex === null) {
                userData.todos.push({ text, xp, statTypes, completed: false });
            } else {
                const oldTodo = userData.todos[currentEditIndex];
                const wasCompleted = oldTodo.completed;
                if (wasCompleted) {
                    // If it was completed, we need to adjust XP
                    removeXP(oldTodo.awardedXP || oldTodo.xp, oldTodo.statTypes);
                }
                userData.todos[currentEditIndex] = { text, xp, statTypes, completed: false };
                
                if (wasCompleted) {
                    // Re-complete with new values
                    const totalXP = xp;
                    addXP(totalXP, statTypes);
                    userData.todos[currentEditIndex].completed = true;
                    userData.todos[currentEditIndex].awardedXP = totalXP;
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
                removeXP(todo.awardedXP || todo.xp, todo.statTypes);
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
            
            // Set default difficulty to 3 (Medium)
            updateMiscDifficultyUI(3);
            updateBoostTargetDisplay();
        }
        
        function editMisc(index) {
            const misc = userData.miscTodos[index];
            currentMiscEditIndex = index;
            document.getElementById('misc-modal-title').textContent = 'Редактировать задачу';
            document.getElementById('edit-misc-text').value = misc.text;
            document.querySelector(`input[name="boost-stat"][value="${misc.boostStatType}"]`).checked = true;
            
            document.getElementById('edit-misc-modal').classList.add('active');
            updateMiscDifficultyUI(misc.difficulty);
            updateBoostTargetDisplay();
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
                userData.miscTodos.push({ 
                    text, 
                    difficulty, 
                    boostStatType, 
                    completed: false 
                });
            } else {
                const oldMisc = userData.miscTodos[currentMiscEditIndex];
                if (oldMisc.completed) {
                    // If it was completed, we need to remove the boost it provided
                    if (userData.boosts[oldMisc.boostStatType] && 
                        userData.boosts[oldMisc.boostStatType].sourceId === oldMisc.id) {
                        userData.boosts[oldMisc.boostStatType] = null;
                    }
                }
                userData.miscTodos[currentMiscEditIndex] = { 
                    text, 
                    difficulty, 
                    boostStatType, 
                    completed: false,
                    id: oldMisc.id // Keep the same ID if it had one
                };
            }
            
            closeMiscEditModal();
            saveUserData();
            renderUI();
        }
        
        function closeMiscEditModal() {
            document.getElementById('edit-misc-modal').classList.remove('active');
            currentMiscEditIndex = null;
        }
        
        function deleteMisc(index) {
            if (!confirm('Удалить задачу жизни?')) return;
            const misc = userData.miscTodos[index];
            if (misc.completed && misc.id) {
                // If it was completed, remove its boost
                if (userData.boosts[misc.boostStatType] && 
                    userData.boosts[misc.boostStatType].sourceId === misc.id) {
                    userData.boosts[misc.boostStatType] = null;
                }
            }
            userData.miscTodos.splice(index, 1);
            saveUserData();
            renderUI();
        }
        
        function updateBoostTargetDisplay() {
            const selectedStat = document.querySelector('input[name="boost-stat"]:checked').value;
            const statNames = {
                strength: 'Strength',
                career: 'Career',
                willpower: 'Willpower'
            };
            document.getElementById('boost-target').textContent = statNames[selectedStat];
        }
        
        function resetDailyTodos() {
            userData.todos = userData.todos.filter(todo => !todo.completed);
            saveUserData();
        }
        
        // === СИСТЕМА ИСТОРИИ ===
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
            
            // Обновляем статистику в шапке
            const totalEntries = userData.history.length;
            const totalXP = userData.history.reduce((sum, entry) => sum + entry.xp, 0);
            document.getElementById('history-stats-summary').innerHTML = 
                `<span>Всего выполнено: <strong>${totalEntries}</strong></span> ` +
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
            
            // Группируем по датам (в формате ГГГГ-ММ-ДД для корректной сортировки)
            const grouped = {};
            userData.history.forEach(entry => {
                const dateKey = entry.completedAt.split('T')[0]; // "2026-02-08"
                if (!grouped[dateKey]) grouped[dateKey] = [];
                grouped[dateKey].push(entry);
            });
            
            // Сортируем даты по убыванию (новые сверху)
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
                
                // Сортируем записи в дате по времени (новые сверху)
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
                    
                    // Show boost info if applicable
                    const boostInfo = entry.boostXP > 0 ? 
                        `<span class="boost-badge">+${entry.boostXP} XP</span>` : '';
                    
                    // Защита от XSS
                    const safeText = escapeHtml(entry.text);
                    
                    html += `
                        <div class="history-entry">
                            <div class="history-time">${time}</div>
                            <div class="history-content">
                                <div class="history-text">${safeText}</div>
                                <div class="history-meta">
                                    ${statBadges}
                                    <span class="xp-badge history-xp">${entry.xp} XP</span>
                                    ${boostInfo}
                                </div>
                            </div>
                        </div>`;
                });
                
                html += `</div></div>`;
            });
            
            container.innerHTML = html;
        }
        
        // Защита от XSS
        function escapeHtml(unsafe) {
            if (typeof unsafe !== 'string') return '';
            return unsafe
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        }
        
        // === УПРАВЛЕНИЕ СЛОЖНОСТЬЮ ДЕЙЛИКОВ ===
        function updateDifficultyUI(level) {
            const markers = document.querySelectorAll('#difficulty-ruler .ruler-marker');
            const thumb = document.getElementById('ruler-thumb');
            const progress = document.getElementById('ruler-progress');
            const previewLabel = document.querySelector('#edit-modal .preview-label');
            const previewXP = document.querySelector('#edit-modal .preview-xp');
            const xpField = document.getElementById('edit-todo-xp');
            
            // Обновляем активный маркер
            markers.forEach(marker => {
                marker.classList.toggle('active', parseInt(marker.dataset.level) === level);
                if (parseInt(marker.dataset.level) === level) {
                    marker.classList.add('marker-select');
                    setTimeout(() => marker.classList.remove('marker-select'), 400);
                }
            });
            
            // Позиционируем ползунок
            const activeMarker = document.querySelector(`#difficulty-ruler .ruler-marker[data-level="${level}"]`);
            const ruler = document.querySelector('#difficulty-ruler');
            
            if (activeMarker && thumb && ruler) {
                const rulerRect = ruler.getBoundingClientRect();
                const markerRect = activeMarker.getBoundingClientRect();
                const centerOffset = markerRect.left + markerRect.width / 2 - rulerRect.left;
                const thumbLeft = centerOffset - thumb.offsetWidth / 2;
                thumb.style.left = `${thumbLeft}px`;
            }
            
            // Обновляем прогресс-бар
            if (progress) {
                const percent = ((level - 1) / 4) * 100;
                progress.style.width = `${percent}%`;
            }
            
            // Обновляем текст
            const config = DIFFICULTY_CONFIG[level];
            previewLabel.textContent = config.label;
            previewLabel.style.color = config.color;
            previewXP.textContent = `${config.xp} XP`;
            xpField.value = config.xp;
        }
        
        function handleDifficultyClick(event) {
            if (event.target.classList.contains('ruler-marker')) {
                const level = parseInt(event.target.dataset.level);
                updateDifficultyUI(level);
            }
        }
        
        // === УПРАВЛЕНИЕ СЛОЖНОСТЬЮ MISCS ===
        function updateMiscDifficultyUI(level) {
            const markers = document.querySelectorAll('#misc-difficulty-ruler .ruler-marker');
            const thumb = document.getElementById('misc-ruler-thumb');
            const progress = document.getElementById('misc-ruler-progress');
            const previewLabel = document.querySelector('#edit-misc-modal .preview-label');
            const previewBoost = document.querySelector('#edit-misc-modal .preview-xp');
            
            // Обновляем активный маркер
            markers.forEach(marker => {
                marker.classList.toggle('active', parseInt(marker.dataset.level) === level);
                if (parseInt(marker.dataset.level) === level) {
                    marker.classList.add('marker-select');
                    setTimeout(() => marker.classList.remove('marker-select'), 400);
                }
            });
            
            // Позиционируем ползунок
            const activeMarker = document.querySelector(`#misc-difficulty-ruler .ruler-marker[data-level="${level}"]`);
            const ruler = document.querySelector('#misc-difficulty-ruler');
            
            if (activeMarker && thumb && ruler) {
                const rulerRect = ruler.getBoundingClientRect();
                const markerRect = activeMarker.getBoundingClientRect();
                const centerOffset = markerRect.left + markerRect.width / 2 - rulerRect.left;
                const thumbLeft = centerOffset - thumb.offsetWidth / 2;
                thumb.style.left = `${thumbLeft}px`;
            }
            
            // Обновляем прогресс-бар
            if (progress) {
                const percent = ((level - 1) / 4) * 100;
                progress.style.width = `${percent}%`;
            }
            
            // Обновляем текст
            const config = DIFFICULTY_CONFIG[level];
            previewLabel.textContent = config.label;
            previewLabel.style.color = config.color;
            previewBoost.textContent = `+${config.boost}% буст`;
            previewBoost.dataset.level = level;
        }
        
        function handleMiscDifficultyClick(event) {
            if (event.target.classList.contains('ruler-marker')) {
                const level = parseInt(event.target.dataset.level);
                updateMiscDifficultyUI(level);
            }
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
                    
                    // Clean expired boosts after import
                    cleanExpiredBoosts(userData.boosts);
                    
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
                boosts: {
                    strength: null,
                    career: null,
                    willpower: null
                },
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
            
            // Boost stat selector update
            document.querySelectorAll('input[name="boost-stat"]').forEach(radio => {
                radio.addEventListener('change', updateBoostTargetDisplay);
            });
            
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
            const dailyRuler = document.querySelector('#difficulty-ruler');
            if (dailyRuler) {
                dailyRuler.addEventListener('click', handleDifficultyClick);
            }
            
            const miscRuler = document.querySelector('#misc-difficulty-ruler');
            if (miscRuler) {
                miscRuler.addEventListener('click', handleMiscDifficultyClick);
            }
            
            // Initialize with default difficulty
            updateDifficultyUI(3);
            updateMiscDifficultyUI(3);
            updateBoostTargetDisplay();
            
            // Load data and start timer
            loadUserData();
            setInterval(updateTimer, 1000);
            updateTimer();
        });