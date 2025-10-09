// Get session data
const gameCode = sessionStorage.getItem('gameCode');
const playerName = sessionStorage.getItem('playerName');
const isHost = sessionStorage.getItem('isHost') === 'true';

if (!gameCode || !playerName) {
    window.location.href = 'index.html';
}

const roomRef = db.ref(`rooms/${gameCode}`);
const playersRef = db.ref(`rooms/${gameCode}/players`);

// Show play again button for host
if (isHost) {
    document.getElementById('playAgainBtn').style.display = 'block';
}

// Load and display results
playersRef.once('value').then(snapshot => {
    const players = snapshot.val();
    if (!players) return;

    // Convert to array and sort by score
    const leaderboard = Object.entries(players)
        .map(([name, data]) => ({
            name,
            score: data.score || 0
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
                </div>
                <div class="score">${player.score}/${totalQuestions}</div>
            </div>
        `;
    }).join('');
}

// Play again button (host only)
document.getElementById('playAgainBtn')?.addEventListener('click', async () => {
    // Reset game state
    const snapshot = await roomRef.once('value');
    const room = snapshot.val();

    // Reset all player scores and answers
    const players = room.players;
    const resetPlayers = {};

    for (const [name, data] of Object.entries(players)) {
        resetPlayers[name] = {
            ...data,
            score: 0,
            answer: null
        };
    }

    await roomRef.update({
        status: 'lobby',
        currentQ: -1,
        players: resetPlayers
    });

    window.location.href = 'lobby.html';
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