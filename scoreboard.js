// Get session data - UNCHANGED
const gameCode = sessionStorage.getItem('gameCode');
const playerName = sessionStorage.getItem('playerName');
const isHost = sessionStorage.getItem('isHost') === 'true';

if (!gameCode || !playerName) {
    window.location.href = 'index.html';
}

// ADDED: Track subscriptions for cleanup
let countdownSubscription = null;
let statusSubscription = null;

let countdownInterval = null;

// CHANGED: Listen for countdown state using Supabase subscription
// OLD: roomRef.child('scoreboardCountdown').on('value', (snapshot) => {...})
countdownSubscription = subscribeToRoomField(gameCode, 'scoreboardCountdown', (countdownData) => {
    if (countdownData && countdownData.active) {
        // Someone started countdown, show it for everyone
        const continueBtn = document.getElementById('continueBtn');
        const autoCountdown = document.getElementById('autoCountdown');
        
        if (continueBtn) continueBtn.style.display = 'none';
        if (autoCountdown) autoCountdown.style.display = 'block';
        
        // Don't start a new interval if one exists
        if (!countdownInterval) {
            startCountdownDisplay(countdownData.timeLeft);
        }
    } else {
        // Countdown cancelled or finished
        if (countdownInterval) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
        
        const continueBtn = document.getElementById('continueBtn');
        const autoCountdown = document.getElementById('autoCountdown');
        
        if (continueBtn) continueBtn.style.display = 'block';
        if (autoCountdown) autoCountdown.style.display = 'none';
    }
});

statusSubscription = subscribeToRoom(gameCode, async (room) => {
    if (!room) return;
    
    const status = room.status;
    
    if (status === 'playing') {
        // CHANGED: Check mode and go to correct page
        const mode = room.mode;
        
        if (mode === 'buzzer') {
            window.location.href = 'buzzer.html';
        } else {
            window.location.href = 'quiz.html';
        }
    } else if (status === 'finished') {
        // Go to final results
        window.location.href = 'results.html';
    }
});

// CHANGED: Load and display scoreboard
// OLD: Promise.all([roomRef.once('value'), playersRef.once('value')])
getRoom(gameCode).then(room => {
    if (!room) {
        window.location.href = 'index.html';
        return;
    }
    
    const players = room.players || {};
    const currentQ = room.currentQ;
    const totalQ = room.questions ? room.questions.length : 0;
    
    // Update progress - UNCHANGED
    document.getElementById('progressQ').textContent = currentQ;
    document.getElementById('progressTotal').textContent = totalQ;
    
    // Filter out host if in buzzer mode - UNCHANGED
    let filteredPlayers = players;
    if (room.mode === 'buzzer') {
        filteredPlayers = Object.fromEntries(
            Object.entries(players).filter(([name, data]) => !data.isHost)
        );
    }
    
    // Sort players by score - UNCHANGED
    const leaderboard = Object.entries(filteredPlayers)
        .map(([name, data]) => ({
            name,
            score: data.score || 0
        }))
        .sort((a, b) => b.score - a.score);
    
    // Display top 3 - UNCHANGED
    displayTopPlayers(leaderboard.slice(0, 3));
    
    // Show current player's position - UNCHANGED
    if (room.mode === 'buzzer' && isHost) {
        // Don't show position for host in buzzer mode
        document.getElementById('yourPosition').style.display = 'none';
    } else {
        const playerRank = leaderboard.findIndex(p => p.name === playerName) + 1;
        const playerScore = leaderboard.find(p => p.name === playerName)?.score || 0;
        displayYourPosition(playerRank, playerScore, leaderboard.length);
    }
    
    // Setup continue button - UNCHANGED
    setupContinueButton(room.mode);
}).catch(error => {
    console.error('Error loading scoreboard:', error);
    alert('Failed to load scoreboard');
});

// UNCHANGED: Display functions
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

// UNCHANGED: Setup continue button
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

// CHANGED: Start countdown
function startCountdown() {
    // CHANGED: Set countdown state in Supabase
    // OLD: roomRef.update({ scoreboardCountdown: {...} })
    updateRoom(gameCode, {
        scoreboardCountdown: {
            active: true,
            timeLeft: 3,
            startedBy: playerName,
            startedAt: Date.now()
        }
    });
}

// UNCHANGED: Display countdown
function startCountdownDisplay(initialTime) {
    const countdownEl = document.getElementById('countdownTime');
    
    let timeLeft = initialTime;
    if (countdownEl) countdownEl.textContent = timeLeft;
    
    countdownInterval = setInterval(async () => {
        timeLeft--;
        if (countdownEl) countdownEl.textContent = timeLeft;
        
        // CHANGED: Update Supabase
        if (timeLeft > 0) {
            await updateRoom(gameCode, { 
                scoreboardCountdown: { 
                    active: true, 
                    timeLeft,
                    startedBy: playerName,
                    startedAt: Date.now() - (initialTime - timeLeft) * 1000
                }
            });
        } else {
            clearInterval(countdownInterval);
            countdownInterval = null;
            // CHANGED: Clear countdown and continue
            await updateRoom(gameCode, { scoreboardCountdown: null });
            continueQuiz();
        }
    }, 1000);
}

// CHANGED: Cancel countdown
function cancelCountdown() {
    // CHANGED: Clear countdown in Supabase
    // OLD: roomRef.child('scoreboardCountdown').remove()
    updateRoom(gameCode, { scoreboardCountdown: null });
    
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
}

// CHANGED: Continue quiz
async function continueQuiz() {
    // CHANGED: Check mode and status
    // OLD: const snapshot = await roomRef.once('value');
    const room = await getRoom(gameCode);
    
    if (room.currentQ >= room.questions.length) {
        await updateRoom(gameCode, { status: 'finished' });
    } else {
        await updateRoom(gameCode, { status: 'playing' });
        // Will redirect via status listener based on mode
    }
}

// ADDED: Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (countdownSubscription) unsubscribe(countdownSubscription);
    if (statusSubscription) unsubscribe(statusSubscription);
    if (countdownInterval) clearInterval(countdownInterval);
});
