const gameCode = sessionStorage.getItem('gameCode');
let playerName = sessionStorage.getItem('playerName');
let isHost = sessionStorage.getItem('isHost') === 'true';

if (!gameCode || !playerName) {
    window.location.href = 'index.html';
}

let currentMode = 'everybody';
let roomSubscription = null;
let heartbeatInterval = null;
let missedHeartbeats = {};

let myBuzzerSoundId = sessionStorage.getItem('buzzerSoundId');
let availableBuzzerSounds = [];

document.getElementById('gameCode').textContent = gameCode;

document.getElementById('toggleGameModeBtn')?.addEventListener('click', () => {
    const section = document.getElementById('gameModeSection');
    section.style.display = section.style.display === 'none' ? 'block' : 'none';
});

document.getElementById('toggleParametersBtn')?.addEventListener('click', () => {
    const section = document.getElementById('parametersSection');
    section.style.display = section.style.display === 'none' ? 'block' : 'none';
});

function startHeartbeat() {
    heartbeatInterval = setInterval(async () => {
        try {
            const myPlayerId = sessionStorage.getItem('playerId');
            await updatePlayer(gameCode, myPlayerId, {
                lastSeen: Date.now()
            });
        } catch (error) {
            console.error('Heartbeat failed:', error);
        }
    }, 5000);
}

function stopHeartbeat() {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
}


async function cleanupDisconnectedPlayers() {
    if (!isHost) return;

    const room = await getRoom(gameCode);
    if (!room || !room.players) return;

    const now = Date.now();
    const heartbeatInterval = 5000; // 5 seconds between heartbeats
    const timeout = heartbeatInterval + 1000;

    const players = room.players;
    for (const [name, data] of Object.entries(players)) {
        const playerId = data.playerId;
        if (!playerId) continue;

        const lastSeen = data.lastSeen || 0;

        if (now - lastSeen > timeout) {
            missedHeartbeats[playerId] = (missedHeartbeats[playerId] || 0) + 1;

            if (missedHeartbeats[playerId] >= 2) {
                console.log(`Removing disconnected player: ${name} (missed ${missedHeartbeats[playerId]} heartbeats)`);
                await removePlayer(gameCode, playerId);
                delete missedHeartbeats[playerId]; // Clean up tracking

                const updatedRoom = await getRoom(gameCode);
                const remainingPlayers = updatedRoom?.players || {};
                if (Object.keys(remainingPlayers).length === 0) {
                    console.log('No players left, deleting room');
                    await deleteRoom(gameCode);
                    sessionStorage.clear();
                    window.location.href = 'index.html';
                    return;
                }

                if (data.isHost) {
                    const firstPlayerData = Object.values(remainingPlayers)[0];
                    await updatePlayer(gameCode, firstPlayerData.playerId, { isHost: true });
                    await updateRoom(gameCode, { host: firstPlayerData.name });
                }
            } else {
                console.log(`Player ${name} missed heartbeat (${missedHeartbeats[name]}/2)`);
            }
        } else {
            if (missedHeartbeats[playerId]) {
                missedHeartbeats[playerId] = 0;
            }
        }
    }
}

async function loadLobbySounds(room) {
    if (isHost) {
        document.getElementById('lobbySoundSelection').style.display = 'none';
        return;
    }

    try {
        availableBuzzerSounds = await getBuzzerSounds();

        if (availableBuzzerSounds.length === 0) {
            document.getElementById('lobbySoundSelection').style.display = 'none';
            return;
        }

        document.getElementById('lobbySoundSelection').style.display = 'block';

        // Get used sound IDs from room
        const usedSoundIds = Object.values(room.players || {})
            .filter(p => p.playerId !== sessionStorage.getItem('playerId'))
            .map(p => p.buzzerSoundId)
            .filter(Boolean);

        const grid = document.getElementById('lobbySoundGrid');
        grid.innerHTML = availableBuzzerSounds.map(sound => {
            const isUsed = usedSoundIds.includes(sound.id);
            const isSelected = myBuzzerSoundId === sound.id;

            return `
                <div class="buzzer-sound-item ${isUsed ? 'disabled' : ''} ${isSelected ? 'selected' : ''}" 
                     data-sound-id="${sound.id}">
                    <input type="radio" 
                           name="lobbyBuzzerSound" 
                           value="${sound.id}" 
                           ${isUsed ? 'disabled' : ''} 
                           ${isSelected ? 'checked' : ''}>
                    <span class="buzzer-sound-name">${sound.display_name}</span>
                    <button class="buzzer-sound-preview" 
                            data-sound-url="${sound.file_url}" 
                            type="button">▶️ Preview</button>
                </div>
            `;
        }).join('');

        // Add click handlers
        document.querySelectorAll('#lobbySoundGrid .buzzer-sound-item:not(.disabled)').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.classList.contains('buzzer-sound-preview')) return;

                const soundId = item.dataset.soundId;
                selectLobbySoundAndSave(soundId);
            });
        });

        document.querySelectorAll('#lobbySoundGrid .buzzer-sound-preview').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                playLobbySoundPreview(btn.dataset.soundUrl);
            });
        });

    } catch (error) {
        console.error('Error loading lobby sounds:', error);
    }
}

async function selectLobbySoundAndSave(soundId) {
    const myPlayerId = sessionStorage.getItem('playerId');

    const result = await updatePlayer(gameCode, myPlayerId, {
        buzzerSoundId: soundId
    });

    if (result.success) {
        myBuzzerSoundId = soundId;
        sessionStorage.setItem('buzzerSoundId', soundId);

        // Update UI
        document.querySelectorAll('#lobbySoundGrid .buzzer-sound-item').forEach(item => {
            item.classList.remove('selected');
            item.querySelector('input[type="radio"]').checked = false;
        });

        const selectedItem = document.querySelector(`#lobbySoundGrid [data-sound-id="${soundId}"]`);
        if (selectedItem) {
            selectedItem.classList.add('selected');
            selectedItem.querySelector('input[type="radio"]').checked = true;
        }
    }
}

let currentLobbyAudio = null;
function playLobbySoundPreview(url) {
    if (currentLobbyAudio) {
        currentLobbyAudio.pause();
        currentLobbyAudio.currentTime = 0;
    }

    currentLobbyAudio = new Audio(url);
    currentLobbyAudio.play().catch(error => {
        console.error('Error playing sound:', error);
    });
}

getRoom(gameCode).then(room => {
    if (room && room.gameParams) {
        const params = room.gameParams;

        if (params.numQuestions) {
            const numQuestionsInput = document.getElementById('numQuestions');
            if (numQuestionsInput) {
                numQuestionsInput.value = params.numQuestions;
            }
        }

        if (params.correctPointsScale) {
            const firstPlace = document.getElementById('firstPlacePoints');
            const secondPlace = document.getElementById('secondPlacePoints');
            const thirdPlace = document.getElementById('thirdPlacePoints');

            if (firstPlace) firstPlace.value = params.correctPointsScale[0] || 1000;
            if (secondPlace) secondPlace.value = params.correctPointsScale[1] || 800;
            if (thirdPlace) thirdPlace.value = params.correctPointsScale[2] || 600;
        }
        if (params.autoPlayDuration) {
            const questionDuration = document.getElementById('questionDuration');
            if (questionDuration) {
                questionDuration.value = params.autoPlayDuration;
            }
        }

        // Buzzer mode parameters - UNCHANGED logic
        if (params.buzzerCorrectPoints !== undefined) {
            const buzzerCorrect = document.getElementById('buzzerCorrectPoints');
            if (buzzerCorrect) {
                buzzerCorrect.value = params.buzzerCorrectPoints;
            }
        }
        if (params.buzzerWrongPoints !== undefined) {
            const buzzerWrong = document.getElementById('buzzerWrongPoints');
            if (buzzerWrong) {
                buzzerWrong.value = params.buzzerWrongPoints;
            }
        }
        if (params.buzzerLockoutTime !== undefined) {
            const buzzerLockout = document.getElementById('buzzerLockoutTime');
            if (buzzerLockout) {
                buzzerLockout.value = params.buzzerLockoutTime;
            }
        }
        if (params.musicDuration !== undefined) {
            const buzzerMusicDuration = document.getElementById('buzzerMusicDuration');
            if (buzzerMusicDuration) {
                buzzerMusicDuration.value = params.musicDuration;
            }
        }
    }
});

document.getElementById('gameCode').textContent = gameCode;

// FEATURE 4 FIX: Start heartbeat system
startHeartbeat();

const myPlayerId = sessionStorage.getItem('playerId');
updatePlayer(gameCode, myPlayerId, { lastSeen: Date.now() });

// FEATURE 4 FIX: Host checks for disconnected players every 10 seconds
if (isHost) {
    setInterval(cleanupDisconnectedPlayers, 10000);
}

const modeButtons = document.querySelectorAll('.mode-btn');
modeButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
        if (!isHost) return;

        const mode = btn.getAttribute('data-mode');

        // Only allow click if not already selected - UNCHANGED
        if (btn.classList.contains('active')) return;

        // Update all buttons - UNCHANGED
        modeButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        // CHANGED: Update database using updateRoom() helper
        // OLD: await roomRef.update({ mode });
        currentMode = mode;
        await updateRoom(gameCode, { mode });

        // Show/hide appropriate parameters - UNCHANGED
        updateParametersDisplay(mode);

        // Auto-close mode selection after choosing - UNCHANGED
        document.getElementById('gameModeSection').style.display = 'none';
    });
});
// FEATURE 2: Info icon handlers for game modes
document.querySelectorAll('.mode-btn-info').forEach(infoIcon => {
    // Prevent info icon from triggering mode selection
    infoIcon.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    // Show tooltip on click (works for both mobile and desktop)
    infoIcon.addEventListener('click', (e) => {
        const mode = infoIcon.getAttribute('data-info');
        showModeInfo(mode, e);
    });

    // Also show on hover for desktop
    infoIcon.addEventListener('mouseenter', (e) => {
        const mode = infoIcon.getAttribute('data-info');
        showModeInfo(mode, e);
    });

    infoIcon.addEventListener('mouseleave', () => {
        hideModeInfo();
    });
});

// FEATURE 2: Show mode information tooltip
function showModeInfo(mode, event) {
    // Remove any existing tooltip
    hideModeInfo();

    let message = '';
    if (mode === 'buzzer') {
        message = 'This is a Local Play game mode. Music will only play on the host\'s device. Best for in-person gatherings!';
    }

    if (!message) return;

    // Create tooltip
    const tooltip = document.createElement('div');
    tooltip.className = 'mode-info-tooltip show';
    tooltip.id = 'modeInfoTooltip';
    tooltip.textContent = message;

    // Position tooltip near the info icon
    const rect = event.target.getBoundingClientRect();
    tooltip.style.top = `${rect.bottom + 10}px`;
    tooltip.style.left = `${rect.left - 100}px`;

    document.body.appendChild(tooltip);

    // Auto-hide after 5 seconds on mobile (click)
    if (event.type === 'click') {
        setTimeout(hideModeInfo, 5000);
    }
}

// FEATURE 2: Hide mode information tooltip
function hideModeInfo() {
    const tooltip = document.getElementById('modeInfoTooltip');
    if (tooltip) {
        tooltip.remove();
    }
}

// Close tooltip when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.classList.contains('mode-btn-info')) {
        hideModeInfo();
    }
});
roomSubscription = subscribeToRoom(gameCode, (room) => {
    if (!room) {
        window.location.href = 'index.html';
        return;
    }

    const currentPlayer = room.players ? Object.values(room.players).find(p => p.playerId === sessionStorage.getItem('playerId')) : null;
    if (currentPlayer && currentPlayer.name !== playerName) {
        playerName = currentPlayer.name;
        sessionStorage.setItem('playerName', playerName);
    }

    loadLobbySounds(room);

    if (currentPlayer) {
        const hostStatus = currentPlayer.isHost;

        if (hostStatus === true) {
            isHost = true;
            sessionStorage.setItem('isHost', 'true');
            document.getElementById('startBtn').style.display = 'block';
            document.getElementById('toggleGameModeBtn').style.display = 'block';
            document.getElementById('toggleParametersBtn').style.display = 'block';
            modeButtons.forEach(btn => btn.style.pointerEvents = 'auto');
        } else if (hostStatus === false) {
            isHost = false;
            sessionStorage.setItem('isHost', 'false');
            document.getElementById('startBtn').style.display = 'none';
            document.getElementById('toggleGameModeBtn').style.display = 'none';
            document.getElementById('toggleParametersBtn').style.display = 'none';
            modeButtons.forEach(btn => btn.style.pointerEvents = 'none');
        }

    }

    // Update mode display - UNCHANGED logic
    const mode = room.mode || 'everybody';
    currentMode = mode;

    // Update button states - UNCHANGED logic
    modeButtons.forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-mode') === mode) {
            btn.classList.add('active');
        }
    });

    // Update current mode display - UNCHANGED logic
    const modeMap = {
        'everybody': '🎮 Everybody Plays',
        'buzzer': '🔴 Buzzer Mode'
    };
    document.getElementById('currentModeDisplay').textContent = modeMap[mode] || 'Unknown Mode';

    // Update parameters display - UNCHANGED
    updateParametersDisplay(mode);

    // Update player list - UNCHANGED logic
    const players = room.players || {};
    const playerArray = Object.entries(players).map(([name, data]) => ({
        name,
        ...data
    }));


    document.getElementById('playerCount').textContent = playerArray.length;


    const hasHost = playerArray.some(p => p.isHost);
    if (!hasHost && playerArray.length > 0) {
        const firstPlayer = playerArray[0].name;
        if (firstPlayer === playerName) {
            // Make ourselves host
            updatePlayer(gameCode, playerName, { isHost: true });
            updateRoom(gameCode, { host: playerName });
        }
    }

    const myPlayerId = sessionStorage.getItem('playerId');
    const container = document.getElementById('playerListContainer');
    container.innerHTML = playerArray.map(player => `
        <div class="player-item">
            <span class="player-name">${player.name}</span>
            ${player.playerId === sessionStorage.getItem('playerId') ?
            `<button class="edit-name-btn" data-player-id="${player.playerId}">✏️ Edit</button>`
            : ''}
            ${player.isHost ? '<span class="host-badge">👑 Host</span>' : ''}
            ${isHost && !player.isHost ?
            `<button class="transfer-host-btn" data-player-id="${player.playerId}" data-player-name="${player.name}">Make Host</button>`
            : ''}
        </div>
    `).join('');


    document.querySelectorAll('.edit-name-btn').forEach(btn => {
        btn.addEventListener('click', () => openEditNameModal(btn.dataset.playerId));
    });

    // Add transfer host button handlers - UNCHANGED logic (but using helper)
    if (isHost) {
        document.querySelectorAll('.transfer-host-btn').forEach(btn => {
            btn.addEventListener('click', () => transferHost(btn.dataset.playerId, btn.dataset.playerName));
        });
    }

    if (room.status === 'playing') {
        // Set flag so beforeunload doesn't remove player
        isStartingGame = true;

        const mode = room.mode;
        if (mode === 'buzzer') {
            window.location.href = 'buzzer.html';
        } else {
            window.location.href = 'quiz.html';
        }
    }
});

function updateParametersDisplay(mode) {
    const standardParams = document.getElementById('standardModeParams');
    const buzzerParams = document.getElementById('buzzerModeParams');

    if (!standardParams || !buzzerParams) {
        console.warn('Parameter sections not found in DOM');
        return;
    }

    if (mode === 'buzzer') {
        standardParams.style.display = 'none';
        buzzerParams.style.display = 'block';
    } else {
        standardParams.style.display = 'block';
        buzzerParams.style.display = 'none';
    }
}

// Save Parameters - CHANGED: Now uses updateRoom() helper
document.getElementById('saveParametersBtn')?.addEventListener('click', async () => {
    // Get number of questions - UNCHANGED
    const numQuestions = parseInt(document.getElementById('numQuestions')?.value) || 10;

    // Build gameParams object - UNCHANGED logic
    const gameParams = currentMode === 'buzzer'
        ? {
            buzzerCorrectPoints: parseInt(document.getElementById('buzzerCorrectPoints')?.value) || 1000,
            buzzerWrongPoints: parseInt(document.getElementById('buzzerWrongPoints')?.value) || -250,
            buzzerLockoutTime: parseInt(document.getElementById('buzzerLockoutTime')?.value) || 5,
            musicDuration: parseInt(document.getElementById('buzzerMusicDuration')?.value) || 30,
            numQuestions: numQuestions
        }
        : {
            correctPointsScale: [
                parseInt(document.getElementById('firstPlacePoints')?.value) || 1000,
                parseInt(document.getElementById('secondPlacePoints')?.value) || 800,
                parseInt(document.getElementById('thirdPlacePoints')?.value) || 600,
                400
            ],
            autoPlayDuration: parseInt(document.getElementById('questionDuration')?.value) || 30,
            hostTimerDuration: 60,
            numQuestions: numQuestions
        };

    const selectedCategories = Array.from(document.querySelectorAll('.category-checkbox:checked'))
        .map(cb => cb.value);
    gameParams.categories = selectedCategories;

    await updateRoom(gameCode, { gameParams });
    alert('Parameters saved!');


    const paramsSection = document.getElementById('parametersSection');
    if (paramsSection) {
        paramsSection.style.display = 'none';
    }
});


async function transferHost(newHostPlayerId, newHostName) {
    if (!isHost) return;

    await updateRoom(gameCode, { host: newHostName });
    await updatePlayer(gameCode, sessionStorage.getItem('playerId'), { isHost: false });
    await updatePlayer(gameCode, newHostPlayerId, { isHost: true });

    alert(`${newHostName} is now the host!`);
}

document.getElementById('startBtn')?.addEventListener('click', async () => {
    const room = await getRoom(gameCode);
    const players = room ? room.players : null;

    if (!players || Object.keys(players).length < 1) {
        alert('Need at least 1 player to start!');
        return;
    }

    if (room.mode === 'buzzer' && Object.keys(players).length < 2) {
        alert('Buzzer mode requires at least 2 players (host + 1 player)!');
        return;
    }

    let numQuestions = room.gameParams?.numQuestions || parseInt(document.getElementById('numQuestions')?.value) || 10;

    if (numQuestions < 1 || numQuestions > 100) {
        alert('Please enter a number of questions between 1 and 100');
        return;
    }

    // Disable button while generating - UNCHANGED
    const btn = document.getElementById('startBtn');
    btn.disabled = true;
    btn.textContent = `Generating ${numQuestions} questions...`;

    try {
        // Generate questions - NOTE: This will need question-generator.js updated
        const generator = new QuestionGenerator();
        const selectedCategories = Array.from(document.querySelectorAll('.category-checkbox:checked'))
            .map(cb => cb.value);

        const yearMin = parseInt(document.getElementById(`${currentMode}ReleaseYearMin`)?.value) || null;
        const yearMax = parseInt(document.getElementById(`${currentMode}ReleaseYearMax`)?.value) || null;

        const questions = await generator.generateQuestions(numQuestions, selectedCategories, yearMin, yearMax);

        if (questions.length === 0) {
            alert('Error: Could not generate questions. Please check that songs have been added to the database.');
            btn.disabled = false;
            btn.textContent = 'Start Game';
            return;
        }

        if (questions.length < numQuestions) {
            alert(`Only ${questions.length} questions available. Starting with ${questions.length} questions.`);
        }

        // Use existing gameParams or set defaults - UNCHANGED
        const finalGameParams = room.gameParams || {
            correctPointsScale: [1000, 800, 600, 400],
            buzzerCorrectPoints: 1000,
            buzzerWrongPoints: -250,
            buzzerLockoutTime: 5,
            autoPlayDuration: 30,
            hostTimerDuration: 60,
            musicDuration: 30
        };

        await updateRoom(gameCode, {
            status: 'playing',
            currentQ: 0,
            questions: questions,
            gameParams: finalGameParams
        });

    } catch (error) {
        console.error('Error starting game:', error);
        alert(`Error starting game: ${error.message}`);
        btn.disabled = false;
        btn.textContent = 'Start Game';
    }
});

document.getElementById('leaveBtn')?.addEventListener('click', async () => {
    isLeavingLobby = true;
    stopHeartbeat();
    await removePlayer(gameCode, playerName);

    const players = await getPlayers(gameCode);

    if (!players || Object.keys(players).length === 0) {
        console.log('No players left, deleting room');
        await deleteRoom(gameCode);
    } else if (isHost) {
        const remainingPlayers = Object.keys(players);
        await updatePlayer(gameCode, remainingPlayers[0], { isHost: true });
        await updateRoom(gameCode, { host: remainingPlayers[0] });
    }

    if (roomSubscription) {
        unsubscribe(roomSubscription);
    }

    sessionStorage.clear();
    window.location.href = 'index.html';
});

let isStartingGame = false;
let isLeavingLobby = false;

// FEATURE 5: Edit name modal functions
function openEditNameModal(playerId) {
    const modal = document.getElementById('editNameModal');
    const input = document.getElementById('editNameInput');

    input.value = playerName;
    input.dataset.playerId = playerId;

    modal.style.display = 'flex';
    input.focus();
    input.select();
}

function closeEditNameModal() {
    const modal = document.getElementById('editNameModal');
    const input = document.getElementById('editNameInput');

    modal.style.display = 'none';
    input.value = '';
    delete input.dataset.playerId;
}

// FEATURE 5: Edit name modal event listeners
document.getElementById('closeEditNameBtn')?.addEventListener('click', closeEditNameModal);
document.getElementById('cancelEditNameBtn')?.addEventListener('click', closeEditNameModal);

document.getElementById('saveNameBtn')?.addEventListener('click', async () => {
    const input = document.getElementById('editNameInput');
    const newName = sanitizeName(input.value);
    const playerId = input.dataset.playerId;

    if (!newName) {
        alert('Please enter a name!');
        return;
    }

    if (newName === playerName) {
        closeEditNameModal();
        return;
    }

    // Disable button during save
    const saveBtn = document.getElementById('saveNameBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';

    const result = await changePlayerName(gameCode, playerId, newName);

    if (result.success) {
        sessionStorage.setItem('playerName', newName);

        window.playerName = newName;

        if (isHost) {
            await updateRoom(gameCode, { host: newName });
        }

        closeEditNameModal();
    } else {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save';
        alert(result.error || 'Failed to change name. Please try again.');
    }
});

document.getElementById('editNameInput')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        document.getElementById('saveNameBtn').click();
    }
});

window.addEventListener('click', (event) => {
    const modal = document.getElementById('editNameModal');
    if (event.target === modal) {
        closeEditNameModal();
    }
});

window.addEventListener('beforeunload', async (e) => {
    stopHeartbeat();

    if (roomSubscription) {
        unsubscribe(roomSubscription);
    }
});
