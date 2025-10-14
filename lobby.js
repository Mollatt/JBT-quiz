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

let currentMode = 'text';

// Display game code
document.getElementById('gameCode').textContent = gameCode;

// Watch for host changes
playerRef.child('isHost').on('value', (snapshot) => {
    const hostStatus = snapshot.val();
    if (hostStatus === true) {
        isHost = true;
        sessionStorage.setItem('isHost', 'true');
        document.getElementById('startBtn').style.display = 'block';
        document.getElementById('changeGameModeBtn').style.display = 'block';
        document.getElementById('parametersBtn').style.display = 'block';
    } else if (hostStatus === false) {
        isHost = false;
        sessionStorage.setItem('isHost', 'false');
        document.getElementById('startBtn').style.display = 'none';
        document.getElementById('changeGameModeBtn').style.display = 'none';
        document.getElementById('parametersBtn').style.display = 'none';
    }
});

// Listen for game mode changes
roomRef.child('mode').on('value', (snapshot) => {
    const mode = snapshot.val();
    currentMode = mode || 'text';
    updateModeDisplay(currentMode);
});

function updateModeDisplay(mode) {
    const modeMap = {
        'text': '📝 Text Quiz',
        'music': '🎵 Music Quiz',
        'buzzer': '🔴 Buzzer Mode'
    };
    document.getElementById('modeDisplay').textContent = modeMap[mode] || 'Unknown Mode';
}

// Game Mode Selection
document.getElementById('changeGameModeBtn')?.addEventListener('click', () => {
    const menu = document.getElementById('gameModeMenu');
    menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
});

document.getElementById('confirmModeBtn')?.addEventListener('click', async () => {
    const selectedMode = document.querySelector('input[name="gameMode"]:checked').value;
    
    if (selectedMode !== currentMode) {
        await roomRef.update({ mode: selectedMode });
    }
    
    document.getElementById('gameModeMenu').style.display = 'none';
});

// Parameters Button
document.getElementById('parametersBtn')?.addEventListener('click', () => {
    const panel = document.getElementById('parametersPanel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
});

// Save Parameters
document.getElementById('saveParametersBtn')?.addEventListener('click', async () => {
    const gameParams = {
        correctPointsScale: [
            parseInt(document.getElementById('firstPlacePoints').value) || 1000,
            800, 600, 400  // Keep other tiers for now
        ],
        buzzerCorrectPoints: parseInt(document.getElementById('buzzerCorrectPoints').value) || 1000,
        buzzerWrongPoints: parseInt(document.getElementById('buzzerWrongPoints').value) || -250,
        buzzerLockoutTime: parseInt(document.getElementById('buzzerLockoutTime').value) || 5,
        questionDuration: parseInt(document.getElementById('questionDuration').value) || 30
    };
    
    await roomRef.update({ gameParams });
    alert('Parameters saved!');
    document.getElementById('parametersPanel').style.display = 'none';
});

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

// Listen for game start
roomRef.child('status').on('value', (snapshot) => {
    const status = snapshot.val();
    if (status === 'playing') {
        // Route to correct page based on mode
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

    // Start with currentQ = 0 (will be incremented by quiz/buzzer page)
    await roomRef.update({
        status: 'playing',
        currentQ: 0
    });
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
