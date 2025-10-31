// Get session data
const gameCode = sessionStorage.getItem('gameCode');
const playerName = sessionStorage.getItem('playerName');
const isHost = sessionStorage.getItem('isHost') === 'true';

if (!gameCode || !playerName) {
    window.location.href = 'index.html';
}

const roomRef = db.ref(`rooms/${gameCode}`);
const playersRef = db.ref(`rooms/${gameCode}/players`);

let countdownInterval = null;

// Listen for status changes - UPDATED TO CHECK MODE
roomRef.child('status').on('value', (snapshot) => {
    const status = snapshot.val();
    if (status === 'playing') {
        // Check mode and go to correct page
        roomRef.child('mode').once('value', modeSnapshot => {
            const mode = modeSnapshot.val();
            if (mode === 'buzzer') {
                window.location.href = 'buzzer.html';
            } else {
                window.location.href = 'quiz.html';
            }
        });
    } else if (status === 'finished') {
        // Go to final results
        window.location.href = 'results.html';
    }
});

// Load and display scoreboard
Promise.all([
    roomRef.once('value'),
    playersRef.once('value')
]).then(([roomSnapshot, playersSnapshot]) => {
    const room = roomSnapshot.val();
    const players = playersSnapshot.val();
    
    if (!room || !players) {
        window.location.href = 'index.html';
        return;
    }
    
    const currentQ = room.currentQ;
    const totalQ = room.questions.length;
    
    // Update progress
    document.getElementById('progressQ').textContent = currentQ;
    document.getElementById('progressTotal').textContent = totalQ;
    
    // Filter out host if in buzzer mode
    let filteredPlayers = players;
    if (room.mode === 'buzzer') {
        filteredPlayers = Object.fromEntries(
            Object.entries(players).filter(([name, data]) => !data.isHost)
        );
    }
    
    // Sort players by score
    const leaderboard = Object.entries(filteredPlayers)
        .map(([name, data]) => ({
            name,
            score: data.score || 0
        }))
        .sort((a, b) => b.score - a.score);
    
    // Display top 3
    displayTopPlayers(leaderboard.slice(0, 3));
    
    // Show current player's position (skip if host in buzzer mode)
    if (room.mode === 'buzzer' && isHost) {
        // Don't show position for host in buzzer mode
        document.getElementById('yourPosition').style.display = 'none';
    } else {
        const playerRank = leaderboard.findIndex(p => p.name === playerName) + 1;
        const playerScore = leaderboard.find(p => p.name === playerName)?.score || 0;
        displayYourPosition(playerRank, playerScore, leaderboard.length);
    }
    
    // Setup continue button
    setupContinueButton(room.mode);
});

function displayTopPlayers(topPlayers) {
    const container = document.getElementById('topPlayersContainer');
    const medals = ['🥇', '🥈', '🥉'];
    const colors = ['gold', 'silver', 'bronze'];
    
    container.innerHTML = topPlayers.map((player, index) => `
        <div class="scoreboard-item ${colors[index]}">
            <div class="rank-medal">${medals[index]}</div>
            <div class="player-info">
                <div class="player-name">${player.name}</div>
            </div>
            <div class="score">${player.score}</div>
        </div>
    `).join('');
}

function displayYourPosition(rank, score, totalPlayers) {
    const container = document.getElementById('yourPosition');
    
    let rankText = '';
    if (rank === 1) {
        rankText = '🎉 You\'re in 1st place!';
    } else if (rank === 2) {
        rankText = '🎊 You\'re in 2nd place!';
    } else if (rank === 3) {
        rankText = '🎈 You\'re in 3rd place!';
    } else {
        rankText = `You're in ${rank}${getOrdinalSuffix(rank)} place`;
    }
    
    container.innerHTML = `
        <div class="your-position-card">
            <div class="position-text">${rankText}</div>
            <div class="position-score">Your Score: ${score}</div>
        </div>
    `;
}

function getOrdinalSuffix(num) {
    const j = num % 10;
    const k = num % 100;
    if (j === 1 && k !== 11) return 'st';
    if (j === 2 && k !== 12) return 'nd';
    if (j === 3 && k !== 13) return 'rd';
    return 'th';
}

function setupContinueButton(mode) {
    const continueBtn = document.getElementById('continueBtn');
    const autoCountdown = document.getElementById('autoCountdown');
    const cancelBtn = document.getElementById('cancelBtn');
    
    // Always show the continue button
    continueBtn.style.display = 'block';
    continueBtn.textContent = 'Continue';
    
    // Hide countdown initially
    if (autoCountdown) {
        autoCountdown.style.display = 'none';
    }
    
    continueBtn.addEventListener('click', () => {
        // Start countdown (3 seconds for all modes)
        startCountdown();
    });
    
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            cancelCountdown();
        });
    }
}

function startCountdown() {
    const continueBtn = document.getElementById('continueBtn');
    const autoCountdown = document.getElementById('autoCountdown');
    const countdownEl = document.getElementById('countdownTime');
    
    // Hide continue button, show countdown
    continueBtn.style.display = 'none';
    autoCountdown.style.display = 'block';
    
    let timeLeft = 3; // Changed to 3 seconds
    countdownEl.textContent = timeLeft;
    
    countdownInterval = setInterval(() => {
        timeLeft--;
        countdownEl.textContent = timeLeft;
        
        if (timeLeft <= 0) {
            clearInterval(countdownInterval);
            continueQuiz();
        }
    }, 1000);
}

function cancelCountdown() {
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
    
    const continueBtn = document.getElementById('continueBtn');
    const autoCountdown = document.getElementById('autoCountdown');
    
    continueBtn.style.display = 'block';
    autoCountdown.style.display = 'none';
}

async function continueQuiz() {
    // Check mode and status
    const snapshot = await roomRef.once('value');
    const room = snapshot.val();
    
    if (room.currentQ >= room.questions.length) {
        await roomRef.update({ status: 'finished' });
    } else {
        await roomRef.update({ status: 'playing' });
        // Will redirect via status listener based on mode
    }
}
