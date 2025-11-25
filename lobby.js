const gameCode = sessionStorage.getItem('gameCode');
const playerName = sessionStorage.getItem('playerName');
let isHost = sessionStorage.getItem('isHost') === 'true';

if (!gameCode || !playerName) {
    window.location.href = 'index.html';
}

let currentMode = 'everybody';
let roomSubscription = null;
let heartbeatInterval = null;

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
    // Update our lastSeen timestamp every 5 seconds
    heartbeatInterval = setInterval(async () => {
        try {
            await updatePlayer(gameCode, playerName, {
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

// FEATURE 4 FIX: Check for and remove disconnected players (host only)
async function cleanupDisconnectedPlayers() {
    if (!isHost) return;

    const room = await getRoom(gameCode);
    if (!room || !room.players) return;

    const now = Date.now();
    const timeout = 15000; // 15 seconds

    const players = room.players;
    for (const [name, data] of Object.entries(players)) {
        const lastSeen = data.lastSeen || 0;
        if (now - lastSeen > timeout) {
            console.log(`Removing disconnected player: ${name}`);
            await removePlayer(gameCode, name);

            // Check if room is now empty
            const updatedRoom = await getRoom(gameCode);
            const remainingPlayers = updatedRoom?.players || {};
            if (Object.keys(remainingPlayers).length === 0) {
                console.log('No players left, deleting room');
                await deleteRoom(gameCode);
                sessionStorage.clear();
                window.location.href = 'index.html';
                return;
            }

            // If removed player was host, transfer to first remaining player
            if (data.isHost) {
                const firstPlayer = Object.keys(remainingPlayers)[0];
                await updatePlayer(gameCode, firstPlayer, { isHost: true });
                await updateRoom(gameCode, { host: firstPlayer });
            }
        }
    }
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

// CHANGED: Subscribe to room changes using subscribeToRoom() helper
// OLD: playerRef.child('isHost').on('value', (snapshot) => {...})
// NEW: Subscribe to entire room, filter for player's isHost status

roomSubscription = subscribeToRoom(gameCode, (room) => {
    if (!room) {
        // Room deleted, go home
        window.location.href = 'index.html';
        return;
    }

    // Check if current player's host status changed
    const currentPlayer = room.players ? room.players[playerName] : null;
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

    // Update player count - UNCHANGED
    document.getElementById('playerCount').textContent = playerArray.length;

    // Check if there's a host - CHANGED: Now handled in subscription
    const hasHost = playerArray.some(p => p.isHost);
    if (!hasHost && playerArray.length > 0) {
        const firstPlayer = playerArray[0].name;
        if (firstPlayer === playerName) {
            // Make ourselves host
            updatePlayer(gameCode, playerName, { isHost: true });
            updateRoom(gameCode, { host: playerName });
        }
    }

    // Render player list - UNCHANGED logic
    const container = document.getElementById('playerListContainer');
    container.innerHTML = playerArray.map(player => `
        <div class="player-item">
            <span class="player-name">${player.name}</span>
            ${player.isHost ? '<span class="host-badge">👑 Host</span>' : ''}
            ${isHost && !player.isHost ?
            `<button class="transfer-host-btn" data-player="${player.name}">Make Host</button>`
            : ''}
        </div>
    `).join('');

    // Add transfer host button handlers - UNCHANGED logic (but using helper)
    if (isHost) {
        document.querySelectorAll('.transfer-host-btn').forEach(btn => {
            btn.addEventListener('click', () => transferHost(btn.dataset.player));
        });
    }

    // Check for game start - CHANGED: Now handled in subscription
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

// UNCHANGED: Helper function for parameter display
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

    // Get selected categories - UNCHANGED
    const selectedCategories = Array.from(document.querySelectorAll('.category-checkbox:checked'))
        .map(cb => cb.value);
    gameParams.categories = selectedCategories;

    // CHANGED: Update using helper
    // OLD: await roomRef.update({ gameParams });
    await updateRoom(gameCode, { gameParams });
    alert('Parameters saved!');

    // Auto-close parameters section - UNCHANGED
    const paramsSection = document.getElementById('parametersSection');
    if (paramsSection) {
        paramsSection.style.display = 'none';
    }
});

// Transfer host function - CHANGED: Now uses helper functions
async function transferHost(newHostName) {
    if (!isHost) return;

    // CHANGED: Use individual helper functions instead of multi-path update
    // OLD: db.ref().update({ multiple paths... })
    await updateRoom(gameCode, { host: newHostName });
    await updatePlayer(gameCode, playerName, { isHost: false });
    await updatePlayer(gameCode, newHostName, { isHost: true });

    alert(`${newHostName} is now the host!`);
}

// Start Game (Host Only) - CHANGED: Database operations, logic UNCHANGED
document.getElementById('startBtn')?.addEventListener('click', async () => {
    // CHANGED: Get players using helper
    // OLD: const snapshot = await playersRef.once('value');
    const room = await getRoom(gameCode);
    const players = room ? room.players : null;

    if (!players || Object.keys(players).length < 1) {
        alert('Need at least 1 player to start!');
        return;
    }

    // For buzzer mode, require at least 2 players - UNCHANGED
    if (room.mode === 'buzzer' && Object.keys(players).length < 2) {
        alert('Buzzer mode requires at least 2 players (host + 1 player)!');
        return;
    }

    // Get number of questions - UNCHANGED
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

        // CHANGED: Start game using updateRoom() helper
        // OLD: await roomRef.update({...})
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

window.addEventListener('beforeunload', async (e) => {
    stopHeartbeat();
    /*if (isStartingGame || !isLeavingLobby) {
        if (roomSubscription) {
            unsubscribe(roomSubscription);
        }
        return;
    }

    await removePlayer(gameCode, playerName);*/

    if (roomSubscription) {
        unsubscribe(roomSubscription);
    }
});
