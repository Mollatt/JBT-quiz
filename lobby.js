// Get session data
const gameCode = sessionStorage.getItem('gameCode');
const playerName = sessionStorage.getItem('playerName');
let isHost = sessionStorage.getItem('isHost') === 'true';

if (!gameCode || !playerName) {
    window.location.href = 'index.html';
}

const roomRef = db.ref(`rooms/${gameCode}`);
const playersRef = db.ref(`rooms/${gameCode}/players`);
const playerRef = db.ref(`rooms/${gameCode}/players/${playerName}`);

let currentMode = 'everybody';

// Display game code
document.getElementById('gameCode').textContent = gameCode;

// Toggle Game Mode Section
document.getElementById('toggleGameModeBtn')?.addEventListener('click', () => {
    const section = document.getElementById('gameModeSection');
    section.style.display = section.style.display === 'none' ? 'block' : 'none';
});

// Toggle Parameters Section
document.getElementById('toggleParametersBtn')?.addEventListener('click', () => {
    const section = document.getElementById('parametersSection');
    section.style.display = section.style.display === 'none' ? 'block' : 'none';
});

// Load and populate current parameters from database when page loads
roomRef.once('value', snapshot => {
    const room = snapshot.val();
    if (room && room.gameParams) {
        const params = room.gameParams;
        
        // Load number of questions
        if (params.numQuestions) {
            const numQuestionsInput = document.getElementById('numQuestions');
            if (numQuestionsInput) {
                numQuestionsInput.value = params.numQuestions;
            }
        }
        
        // Standard mode parameters
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
        
        // Buzzer mode parameters
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

// Game Mode Selection with Buttons
const modeButtons = document.querySelectorAll('.mode-btn');
modeButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
        if (!isHost) return;
        
        const mode = btn.getAttribute('data-mode');
        
        // Only allow click if not already selected
        if (btn.classList.contains('active')) return;
        
        // Update all buttons
        modeButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // Update database
        currentMode = mode;
        await roomRef.update({ mode });
        
        // Show/hide appropriate parameters
        updateParametersDisplay(mode);
        
        // Auto-close mode selection after choosing
        document.getElementById('gameModeSection').style.display = 'none';
    });
});

// Watch for host changes
playerRef.child('isHost').on('value', (snapshot) => {
    const hostStatus = snapshot.val();
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
});

// Listen for game mode changes
roomRef.child('mode').on('value', (snapshot) => {
    const mode = snapshot.val() || 'everybody';
    currentMode = mode;
    
    // Update button states
    modeButtons.forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-mode') === mode) {
            btn.classList.add('active');
        }
    });
    
    // Update current mode display
    const modeMap = {
        'everybody': '🎮 Everybody Plays',
        'buzzer': '🔴 Buzzer Mode'
    };
    document.getElementById('currentModeDisplay').textContent = modeMap[mode] || 'Unknown Mode';
    
    // Update parameters display
    updateParametersDisplay(mode);
});

function updateParametersDisplay(mode) {
    const standardParams = document.getElementById('standardModeParams');
    const buzzerParams = document.getElementById('buzzerModeParams');
    
    // Check if elements exist before trying to modify
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

// Listen for player changes
playersRef.on('value', (snapshot) => {
    const players = snapshot.val();
    if (!players) return;

    const playerArray = Object.entries(players).map(([name, data]) => ({
        name,
        ...data
    }));

    // Update player count
    document.getElementById('playerCount').textContent = playerArray.length;

    // Check if there's a host
    const hasHost = playerArray.some(p => p.isHost);
    if (!hasHost && playerArray.length > 0) {
        const firstPlayer = playerArray[0].name;
        if (firstPlayer === playerName) {
            db.ref(`rooms/${gameCode}/players/${playerName}/isHost`).set(true);
            db.ref(`rooms/${gameCode}/host`).set(playerName);
        }
    }

    // Render player list
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
    
    // Add transfer host button handlers
    if (isHost) {
        document.querySelectorAll('.transfer-host-btn').forEach(btn => {
            btn.addEventListener('click', () => transferHost(btn.dataset.player));
        });
    }
});

// Save Parameters - NOW SAVES numQuestions TOO
document.getElementById('saveParametersBtn')?.addEventListener('click', async () => {
    // Get number of questions
    const numQuestions = parseInt(document.getElementById('numQuestions')?.value) || 10;
    
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
    
    await roomRef.update({ gameParams });
    alert('Parameters saved!');
    
    // Auto-close parameters section
    const paramsSection = document.getElementById('parametersSection');
    if (paramsSection) {
        paramsSection.style.display = 'none';
    }
});

// Listen for game start
roomRef.child('status').on('value', (snapshot) => {
    const status = snapshot.val();
    if (status === 'playing') {
        // Set flag so beforeunload doesn't remove player
        isStartingGame = true;
        
        roomRef.child('mode').once('value', modeSnapshot => {
            const mode = modeSnapshot.val();
            if (mode === 'buzzer') {
                window.location.href = 'buzzer.html';
            } else {
                window.location.href = 'quiz.html';
            }
        });
    }
});

// Transfer host function
async function transferHost(newHostName) {
    if (!isHost) return;
    
    const updates = {};
    updates[`rooms/${gameCode}/host`] = newHostName;
    updates[`rooms/${gameCode}/players/${playerName}/isHost`] = false;
    updates[`rooms/${gameCode}/players/${newHostName}/isHost`] = true;
    
    await db.ref().update(updates);
    alert(`${newHostName} is now the host!`);
}

// Start Game (Host Only)
document.getElementById('startBtn')?.addEventListener('click', async () => {
    const snapshot = await playersRef.once('value');
    const players = snapshot.val();
    
    if (!players || Object.keys(players).length < 1) {
        alert('Need at least 1 player to start!');
        return;
    }

    // Get current room to check mode
    const roomSnapshot = await roomRef.once('value');
    const room = roomSnapshot.val();
    
    // For buzzer mode, require at least 2 players (host + 1 player)
    if (room.mode === 'buzzer' && Object.keys(players).length < 2) {
        alert('Buzzer mode requires at least 2 players (host + 1 player)!');
        return;
    }

    // Get number of questions - check saved params first, then input field
    let numQuestions = room.gameParams?.numQuestions || parseInt(document.getElementById('numQuestions')?.value) || 10;
    
    if (numQuestions < 1 || numQuestions > 100) {
        alert('Please enter a number of questions between 1 and 100');
        return;
    }

    // Disable button while generating
    const btn = document.getElementById('startBtn');
    btn.disabled = true;
    btn.textContent = `Generating ${numQuestions} questions...`;

    try {
        // Generate questions from database
        const generator = new QuestionGenerator();
        const questions = await generator.generateQuestions(numQuestions);

        if (questions.length === 0) {
            alert('Error: Could not generate questions. Please check that songs have been added to the database.');
            btn.disabled = false;
            btn.textContent = 'Start Game';
            return;
        }
        
        if (questions.length < numQuestions) {
            alert(`Only ${questions.length} questions available. Starting with ${questions.length} questions.`);
        }

        // Use existing gameParams or set defaults
        // This ensures the displayed values match what's actually used
        const finalGameParams = room.gameParams || {
            correctPointsScale: [1000, 800, 600, 400],
            buzzerCorrectPoints: 1000,
            buzzerWrongPoints: -250,
            buzzerLockoutTime: 5,
            autoPlayDuration: 30,
            hostTimerDuration: 60,
            musicDuration: 30
        };

        // Start game with generated questions
        await roomRef.update({
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

// Leave Lobby
document.getElementById('leaveBtn')?.addEventListener('click', async () => {
    await db.ref(`rooms/${gameCode}/players/${playerName}`).remove();

    const snapshot = await playersRef.once('value');
    const players = snapshot.val();
    
    // If no players left, delete the entire room
    if (!players || Object.keys(players).length === 0) {
        console.log('No players left, deleting room');
        await roomRef.remove();
    } else if (isHost) {
        // Transfer host to first remaining player
        const remainingPlayers = Object.keys(players);
        await db.ref(`rooms/${gameCode}/players/${remainingPlayers[0]}/isHost`).set(true);
        await db.ref(`rooms/${gameCode}/host`).set(remainingPlayers[0]);
    }

    sessionStorage.clear();
    window.location.href = 'index.html';
});

// Handle page unload - only remove player if actually leaving (not starting game)
let isStartingGame = false;

window.addEventListener('beforeunload', async (e) => {
    // Don't remove player if they're starting/joining the game
    if (isStartingGame) {
        return;
    }
    
    // Only remove if truly leaving
    await db.ref(`rooms/${gameCode}/players/${playerName}`).remove();
});
