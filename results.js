const gameCode = sessionStorage.getItem('gameCode');
const playerName = sessionStorage.getItem('playerName');
const isHost = sessionStorage.getItem('isHost') === 'true';

if (!gameCode || !playerName) {
    window.location.href = 'index.html';
}

let statusSubscription = null;

statusSubscription = subscribeToRoomField(gameCode, 'status', (status) => {
    if (status === 'lobby') {
        // Game is restarting, go back to lobby
        window.location.href = 'lobby.html';
    }
});

getRoom(gameCode).then(room => {
    if (!room) {
        window.location.href = 'index.html';
        return;
    }

    const players = room.players || {};

    let filteredPlayers = players;
    if (room.mode === 'buzzer') {
        filteredPlayers = Object.fromEntries(
            Object.entries(players).filter(([name, data]) => !data.isHost)
        );
    }

    const leaderboard = Object.entries(filteredPlayers)
        .map(([name, data]) => ({
            name,
            score: data.score || 0,
            correct: data.correctCount || 0
        }))
        .sort((a, b) => b.score - a.score);

    const totalQuestions = room.questions ? room.questions.length : 0;
    displayLeaderboard(leaderboard, totalQuestions);
}).catch(error => {
    console.error('Error loading results:', error);
    alert('Failed to load results');
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
document.getElementById('playAgainBtn')?.addEventListener('click', async () => {
    const room = await getRoom(gameCode);

    if (room.status === 'lobby') {
        window.location.href = 'lobby.html';
        return;
    }

    const players = room.players || {};

    for (const [name, data] of Object.entries(players)) {
        await updatePlayer(gameCode, name, {
            score: 0,
            answer: null,
            answered: false,
            answerTime: null,
            lastPoints: 0,
            correctCount: 0,
            lockoutUntil: null
        });
    }

    await updateRoom(gameCode, {
        resultsCalculated: null,
        status: 'lobby',
        currentQ: -1,
        buzzedPlayer: null,
        buzzerLocked: false,
        buzzTime: null,
        isPaused: false,
        remainingTime: null
    });

});

document.getElementById('homeBtn')?.addEventListener('click', async () => {
    await removePlayer(gameCode, playerName);

    const players = await getPlayers(gameCode);

    if (!players || Object.keys(players).length === 0) {
        await deleteRoom(gameCode);
    }

    sessionStorage.clear();
    window.location.href = 'index.html';
});

const style = document.createElement('style');
style.textContent = `
    .leaderboard-item.highlight {
        background: rgba(255, 255, 255, 0.25);
        border: 2px solid rgba(255, 255, 255, 0.5);
    }
`;
document.head.appendChild(style);

window.addEventListener('beforeunload', () => {
    if (statusSubscription) unsubscribe(statusSubscription);
});
