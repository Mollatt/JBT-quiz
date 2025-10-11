// Get session data
const gameCode = sessionStorage.getItem('gameCode');
const playerName = sessionStorage.getItem('playerName');
let isHost = sessionStorage.getItem('isHost') === 'true';

// Redirect if no session
if (!gameCode || !playerName) {
    window.location.href = 'index.html';
}

const roomRef = db.ref(`rooms/${gameCode}`);
const playersRef = db.ref(`rooms/${gameCode}/players`);

// Display game code
document.getElementById('gameCode').textContent = gameCode;

// Watch for host changes
playerRef = db.ref(`rooms/${gameCode}/players/${playerName}`);
playerRef.child('isHost').on('value', (snapshot) => {
    const hostStatus = snapshot.val();
    if (hostStatus === true) {
        isHost = true;
        sessionStorage.setItem('isHost', 'true');
        document.getElementById('startBtn').style.display = 'block';
    } else if (hostStatus === false) {
        isHost = false;
        sessionStorage.setItem('isHost', 'false');
        document.getElementById('startBtn').style.display = 'none';
    }
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
    
    // Check if there's a host, if not and I'm the only one, make me host
    const hasHost = playerArray.some(p => p.isHost);
    if (!hasHost && playerArray.length > 0) {
        // No host exists, make first player (or self) host
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
        window.location.href = 'quiz.html';
    }
});

// Start game button (host only)
document.getElementById('startBtn')?.addEventListener('click', async () => {
    const snapshot = await playersRef.once('value');
    const players = snapshot.val();
    
    if (!players || Object.keys(players).length < 1) {
        alert('Need at least 1 player to start!');
        return;
    }

    await roomRef.update({
        status: 'playing',
        currentQ: 0,
        startedAt: Date.now()
    });
});

// Leave lobby button
document.getElementById('leaveBtn')?.addEventListener('click', async () => {
    // Remove player from room
    await db.ref(`rooms/${gameCode}/players/${playerName}`).remove();

    // Check if room is empty and clean up
    const snapshot = await playersRef.once('value');
    const players = snapshot.val();
    
    if (!players || Object.keys(players).length === 0) {
        await roomRef.remove();
    } else if (isHost) {
        // Transfer host to another player
        const remainingPlayers = Object.keys(players);
        await db.ref(`rooms/${gameCode}/players/${remainingPlayers[0]}/isHost`).set(true);
        await db.ref(`rooms/${gameCode}/host`).set(remainingPlayers[0]);
    }

    // Clear session and return home
    sessionStorage.clear();
    window.location.href = 'index.html';
});

// Handle page unload (user closes tab/browser)
window.addEventListener('beforeunload', async () => {
    await db.ref(`rooms/${gameCode}/players/${playerName}`).remove();
});

// Transfer host function
async function transferHost(newHostName) {
    if (!isHost) return;
    
    const updates = {};
    updates[`rooms/${gameCode}/host`] = newHostName;
    updates[`rooms/${gameCode}/players/${playerName}/isHost`] = false;
    updates[`rooms/${gameCode}/players/${newHostName}/isHost`] = true;
    
    await db.ref().update(updates);
    
    // Update local session
    sessionStorage.setItem('isHost', 'false');
    
    // Hide start button for old host
    document.getElementById('startBtn').style.display = 'none';
    
    alert(`${newHostName} is now the host!`);
}

// Transfer host function
async function transferHost(newHostName) {
    if (!isHost) return;
    
    const updates = {};
    updates[`rooms/${gameCode}/host`] = newHostName;
    updates[`rooms/${gameCode}/players/${playerName}/isHost`] = false;
    updates[`rooms/${gameCode}/players/${newHostName}/isHost`] = true;
    
    await db.ref().update(updates);
    
    // Update local session
    sessionStorage.setItem('isHost', 'false');
    
    // Hide start button for old host
    document.getElementById('startBtn').style.display = 'none';
    
    alert(`${newHostName} is now the host!`);
}
