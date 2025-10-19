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

let currentMode = 'everybody'; // Default to 'everybody' plays

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
        'everybody': '🎵 Everybody Plays',
        'buzzer': '🔴 Buzzer Mode'
    };
    document.getElementById('currentModeDisplay').textContent = modeMap[mode] || 'Unknown Mode';
    
    // Update parameters display
    updateParametersDisplay(mode);
});

function updateParametersDisplay(mode) {
    const everybodyParams = document.getElementById('everybodyModeParams');
    const buzzerParams = document.getElementById('buzzerModeParams');
    
    if (mode === 'buzzer') {
        everybodyParams.style.display = 'none';
        buzzerParams.style.display = 'block';
    } else {
        everybodyParams.style.display = 'block';
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

// Save Parameters
document.getElementById('saveParametersBtn')?.addEventListener('click', async () => {
    const gameParams = currentMode === 'buzzer' 
        ? {
            buzzerCorrectPoints: parseInt(document.getElementById('buzzerCorrectPoints').value) || 1000,
            buzzerWrongPoints: parseInt(document.getElementById('buzzerWrongPoints').value) || -250,
            buzzerLockoutTime: parseInt(document.getElementById('buzzerLockoutTime').value) || 5,
            musicDuration: parseInt(document.getElementById('buzzerMusicDuration').value) || 30,
            numQuestions: parseInt(document.getElementById('buzzerNumQuestions').value) || 10,
            releaseYearMin: parseInt(document.getElementById('buzzerReleaseYearMin').value) || null,
            releaseYearMax: parseInt(document.getElementById('buzzerReleaseYearMax').value) || null,
            selectedCategories: getSelectedCategories()
        }
        : {
            correctPointsScale: [
                parseInt(document.getElementById('everybodyFirstPlacePoints').value) || 1000,
                parseInt(document.getElementById('everybodySecondPlacePoints').value) || 800,
                parseInt(document.getElementById('everybodyThirdPlacePoints').value) || 600,
                400
            ],
            numQuestions: parseInt(document.getElementById('everybodyNumQuestions').value) || 10,
            releaseYearMin: parseInt(document.getElementById('everybodyReleaseYearMin').value) || null,
            releaseYearMax: parseInt(document.getElementById('everybodyReleaseYearMax').value) || null,
            selectedCategories: getSelectedCategories()
        };
    
    await roomRef.update({ gameParams });
    alert('Parameters saved!');
    
    // Auto-close parameters section
    document.getElementById('parametersSection').style.display = 'none';
});

function getSelectedCategories() {
    const checkboxes = document.querySelectorAll('.category-checkbox:checked');
    const categories = [];
    checkboxes.forEach(cb => {
        categories.push(cb.value);
    });
    return categories.length > 0 ? categories : null;
}

// Listen for game start
roomRef.child('status').on('value', (snapshot) => {
    const status = snapshot.val();
    if (status === 'playing') {
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

    // Disable button while generating
    const btn = document.getElementById('startBtn');
    btn.disabled = true;
    btn.textContent = 'Generating questions...';

    try {
        // Get current game parameters
        const roomSnapshot = await roomRef.once('value');
        const room = roomSnapshot.val();
        const gameParams = room.gameParams || {};
        
        // Get number of questions (default 10)
        const numQuestions = gameParams.numQuestions || 10;
        
        // Generate questions from database
        const generator = new QuestionGenerator();
        const questions = await generator.generateQuestions(
            numQuestions,
            gameParams.selectedCategories,
            gameParams.releaseYearMin,
            gameParams.releaseYearMax
        );

        if (questions.length === 0) {
            alert('Error: Could not generate questions. Please check that songs have been added to the database.');
            btn.disabled = false;
            btn.textContent = 'Start Game';
            return;
        }

        // Start game with generated questions
        await roomRef.update({
            status: 'playing',
            currentQ: 0,
            questions: questions
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
    
    if (!players || Object.keys(players).length === 0) {
        await roomRef.remove();
    } else if (isHost) {
        const remainingPlayers = Object.keys(players);
        await db.ref(`rooms/${gameCode}/players/${remainingPlayers[0]}/isHost`).set(true);
        await db.ref(`rooms/${gameCode}/host`).set(remainingPlayers[0]);
    }

    sessionStorage.clear();
    window.location.href = 'index.html';
});

// Handle page unload
window.addEventListener('beforeunload', async () => {
    await db.ref(`rooms/${gameCode}/players/${playerName}`).remove();
});
