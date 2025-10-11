// Get session data
const gameCode = sessionStorage.getItem('gameCode');
const playerName = sessionStorage.getItem('playerName');
const isHost = sessionStorage.getItem('isHost') === 'true';

if (!gameCode || !playerName) {
    window.location.href = 'index.html';
}

const roomRef = db.ref(`rooms/${gameCode}`);
const playersRef = db.ref(`rooms/${gameCode}/players`);

// Listen for status changes to sync all players
roomRef.child('status').on('value', (snapshot) => {
    const status = snapshot.val();
    if (status === 'lobby') {
        // Game is restarting, go back to lobby
        window.location.href = 'lobby.html';
    }
});

// Load and display results
playersRef.once('value').then(snapshot => {
    const players = snapshot.val();
    if (!players) return;

    // Convert to array and sort by score
    const leaderboard = Object.entries(players)
        .map(([name, data]) => ({
            name,
            score: data.score || 0,
            correct: data.correctCount || 0
        }))
        .sort((a, b) => b.score - a.score);

    // Get total questions
    roomRef.child('questions').once('value', qSnapshot => {
        const totalQuestions = qSnapshot.val().length;
        displayLeaderboard(leaderboard, totalQuestions);
    });
});

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

// Play again button - ALL players can click
document.getElementById('playAgainBtn')?.addEventListener('click', async () => {
    // Only one person should trigger the reset (use host or first clicker)
    const snapshot = await roomRef.once('value');
    const room = snapshot.val();
    
    // Check if already being reset
    if (room.status === 'lobby') {
        window.location.href = 'lobby.html';
        return;
    }
    
    // Reset all player scores and answers
    const players = room.players;
    const updates = {};
    
    for (const [name, data] of Object.entries(players)) {
        updates[`rooms/${gameCode}/players/${name}/score`] = 0;
        updates[`rooms/${gameCode}/players/${name}/answer`] = null;
        updates[`rooms/${gameCode}/players/${name}/answered`] = false;
        updates[`rooms/${gameCode}/players/${name}/answerTime`] = null;
        updates[`rooms/${gameCode}/players/${name}/lastPoints`] = 0;
        updates[`rooms/${gameCode}/players/${name}/correctCount`] = 0;
    }
    
    // Clear results flags
    updates[`rooms/${gameCode}/resultsCalculated`] = null;
    
    updates[`rooms/${gameCode}/status`] = 'lobby';
    updates[`rooms/${gameCode}/currentQ`] = -1;
    
    await db.ref().update(updates);
    
    // Will redirect via status listener
});

// Home button
document.getElementById('homeBtn')?.addEventListener('click', async () => {
    // Remove player from room
    await db.ref(`rooms/${gameCode}/players/${playerName}`).remove();

    // Check if room is empty and clean up
    const snapshot = await playersRef.once('value');
    const players = snapshot.val();

    if (!players || Object.keys(players).length === 0) {
        await roomRef.remove();
    }

    // Clear session and return home
    sessionStorage.clear();
    window.location.href = 'index.html';
});

// Add highlight style for current player
const style = document.createElement('style');
style.textContent = `
    .leaderboard-item.highlight {
        background: rgba(255, 255, 255, 0.25);
        border: 2px solid rgba(255, 255, 255, 0.5);
    }
`;
document.head.appendChild(style);
