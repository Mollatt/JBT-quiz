// Get session data - UNCHANGED
const gameCode = sessionStorage.getItem('gameCode');
const playerName = sessionStorage.getItem('playerName');
const isHost = sessionStorage.getItem('isHost') === 'true';

if (!gameCode || !playerName) {
    window.location.href = 'index.html';
}

// ADDED: Track subscription for cleanup
let statusSubscription = null;

// CHANGED: Listen for status changes to sync all players
// OLD: roomRef.child('status').on('value', (snapshot) => {...})
statusSubscription = subscribeToRoomField(gameCode, 'status', (status) => {
    if (status === 'lobby') {
        // Game is restarting, go back to lobby
        window.location.href = 'lobby.html';
    }
});

// CHANGED: Load and display results
// OLD: Promise.all([roomRef.once('value'), playersRef.once('value')])
getRoom(gameCode).then(room => {
    if (!room) {
        window.location.href = 'index.html';
        return;
    }

    const players = room.players || {};
    
    // Filter out host if in buzzer mode - UNCHANGED
    let filteredPlayers = players;
    if (room.mode === 'buzzer') {
        filteredPlayers = Object.fromEntries(
            Object.entries(players).filter(([name, data]) => !data.isHost)
        );
    }

    // Convert to array and sort by score - UNCHANGED
    const leaderboard = Object.entries(filteredPlayers)
        .map(([name, data]) => ({
            name,
            score: data.score || 0,
            correct: data.correctCount || 0
        }))
        .sort((a, b) => b.score - a.score);

    // Get total questions - UNCHANGED
    const totalQuestions = room.questions ? room.questions.length : 0;
    displayLeaderboard(leaderboard, totalQuestions);
}).catch(error => {
    console.error('Error loading results:', error);
    alert('Failed to load results');
});

// UNCHANGED: Display leaderboard
function displayLeaderboard(leaderboard, totalQuestions) {
    const container = document.getElementById('leaderboardContainer');

    container.innerHTML = leaderboard.map((player, index) => {
        const rank = index + 1;
        let rankClass = '';
        let rankEmoji = '';

        if (rank === 1) {
            rankClass = 'gold';
            rankEmoji = '🥇';
        } else if (rank === 2) {
            rankClass = 'silver';
            rankEmoji = '🥈';
        } else if (rank === 3) {
            rankClass = 'bronze';
            rankEmoji = '🥉';
        }

        const isCurrentPlayer = player.name === playerName;

        return `
            <div class="leaderboard-item ${isCurrentPlayer ? 'highlight' : ''}">
                <div class="rank ${rankClass}">${rankEmoji || rank}</div>
                <div class="player-info">
                    <div class="player-name" style="font-weight: ${isCurrentPlayer ? 'bold' : 'normal'}">
                        ${player.name}${isCurrentPlayer ? ' (You)' : ''}
                    </div>
                    <div class="player-stats">
                        <div class="score">Score: ${player.score}</div>
                        <div class="questions">Correct: ${player.correct || 0}/${totalQuestions}</div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// CHANGED: Play again button - ALL players can click
document.getElementById('playAgainBtn')?.addEventListener('click', async () => {
    // CHANGED: Get current room state
    // OLD: const snapshot = await roomRef.once('value');
    const room = await getRoom(gameCode);
    
    // Check if already being reset
    if (room.status === 'lobby') {
        window.location.href = 'lobby.html';
        return;
    }
    
    // CHANGED: Reset all player scores and answers
    const players = room.players || {};
    
    // Update each player individually
    for (const [name, data] of Object.entries(players)) {
        await updatePlayer(gameCode, name, {
            score: 0,
            answer: null,
            answered: false,
            answerTime: null,
            lastPoints: 0,
            correctCount: 0
        });
    }
    
    // CHANGED: Clear results flags and reset room
    // OLD: db.ref().update({ multiple paths... })
    await updateRoom(gameCode, {
        resultsCalculated: null,
        status: 'lobby',
        currentQ: -1
    });
    
    // Will redirect via status listener
});

// CHANGED: Home button
document.getElementById('homeBtn')?.addEventListener('click', async () => {
    // CHANGED: Remove player from room
    // OLD: await db.ref(`rooms/${gameCode}/players/${playerName}`).remove();
    await removePlayer(gameCode, playerName);

    // CHANGED: Check if room is empty and clean up
    // OLD: const snapshot = await playersRef.once('value');
    const players = await getPlayers(gameCode);

    if (!players || Object.keys(players).length === 0) {
        await deleteRoom(gameCode);
    }

    // Clear session and return home - UNCHANGED
    sessionStorage.clear();
    window.location.href = 'index.html';
});

// UNCHANGED: Highlight style for current player
const style = document.createElement('style');
style.textContent = `
    .leaderboard-item.highlight {
        background: rgba(255, 255, 255, 0.25);
        border: 2px solid rgba(255, 255, 255, 0.5);
    }
`;
document.head.appendChild(style);

// ADDED: Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (statusSubscription) unsubscribe(statusSubscription);
});
