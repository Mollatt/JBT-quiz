// Get session data
const gameCode = sessionStorage.getItem('gameCode');
const playerName = sessionStorage.getItem('playerName');
const isHost = sessionStorage.getItem('isHost') === 'true';

if (!gameCode || !playerName) {
    window.location.href = 'index.html';
}

const roomRef = db.ref(`rooms/${gameCode}`);
const playerRef = db.ref(`rooms/${gameCode}/players/${playerName}`);
const playersRef = db.ref(`rooms/${gameCode}/players`);

let currentQuestion = null;
let musicPlayer = null;
let isLockedOut = false;
let lockoutTimer = null;
let room = null;

// Load initial room data
roomRef.once('value').then(snapshot => {
    room = snapshot.val();
    if (!room) {
        window.location.href = 'index.html';
        return;
    }

    document.getElementById('totalQ').textContent = room.questions.length;
    
    setupQuestionListener(room);
    setupStatusListener();
    setupBuzzListener();
});

function setupQuestionListener(room) {
    roomRef.child('currentQ').on('value', async (snapshot) => {
        const qIndex = snapshot.val();

        if (qIndex === -1) return;

        // Check if quiz is finished
        if (qIndex >= room.questions.length) {
            await roomRef.update({ status: 'finished' });
            return;
        }

        // Reset buzzer state for new question
        await roomRef.update({
            buzzedPlayer: null,
            buzzTime: null,
            buzzerLocked: false
        });

        isLockedOut = false;
        if (lockoutTimer) {
            clearInterval(lockoutTimer);
            lockoutTimer = null;
        }

        // Load and display question
        displayQuestion(room.questions[qIndex], qIndex);
    });
}

function setupStatusListener() {
    roomRef.child('status').on('value', (snapshot) => {
        const status = snapshot.val();
        if (status === 'finished') {
            window.location.href = 'results.html';
        } else if (status === 'scoreboard') {
            window.location.href = 'scoreboard.html';
        }
    });
}

function setupBuzzListener() {
    roomRef.child('buzzedPlayer').on('value', (snapshot) => {
        const buzzedPlayer = snapshot.val();
        
        if (buzzedPlayer) {
            handleBuzzed(buzzedPlayer);
        }
    });
}

function displayQuestion(question, index) {
    currentQuestion = question;

    // Update question number
    document.getElementById('currentQ').textContent = index + 1;
    document.getElementById('questionText').textContent = question.text;

    // Hide all UI elements initially
    const buzzerSection = document.getElementById('buzzerSection');
    const buzzDisplay = document.getElementById('buzzDisplay');
    const hostControls = document.getElementById('hostControls');
    const continueBtn = document.getElementById('continueBtn');
    const resultsBtn = document.getElementById('resultsBtn');
    const lockoutMsg = document.getElementById('lockoutMsg');
    const waitingMsg = document.getElementById('waitingMsg');

    if (buzzerSection) buzzerSection.style.display = 'none';
    if (buzzDisplay) buzzDisplay.style.display = 'none';
    if (hostControls) hostControls.style.display = 'none';
    if (continueBtn) continueBtn.style.display = 'none';
    if (resultsBtn) resultsBtn.style.display = 'none';
    if (lockoutMsg) lockoutMsg.style.display = 'none';
    if (waitingMsg) waitingMsg.style.display = 'none';

    // Show buzzer for non-hosts
    if (!isHost && buzzerSection) {
        buzzerSection.style.display = 'block';
    }

    // Show answers for host
    if (isHost && hostControls) {
        document.getElementById('correctAnswer').textContent = question.options[question.correct];
        hostControls.style.display = 'block';
    }

    // Initialize and play music
    const musicPlayerEl = document.getElementById('musicPlayer');
    if (!musicPlayer) {
        musicPlayer = new YouTubePlayer('musicPlayer');
    }

    if (question.type === 'music' && question.youtubeUrl) {
        musicPlayer.load(question.youtubeUrl).then(() => {
            const duration = question.duration || 30;
            
            // Play music with timer sync
            musicPlayer.playClip(question.startTime, duration, (remaining) => {
                const timeLeftEl = document.getElementById('timeLeft');
                if (timeLeftEl) {
                    timeLeftEl.textContent = remaining;
                }
                
                // Time's up
                if (remaining <= 0) {
                    handleTimeUp();
                }
            });
        }).catch(error => {
            console.error('Failed to load music:', error);
        });
    }
}

// Player buzzes
document.getElementById('buzzerBtn')?.addEventListener('click', async () => {
    if (isLockedOut || isHost) return;

    const buzzTime = Date.now();
    
    // Try to set buzz (race condition handled by Firebase)
    const buzzedPlayerRef = roomRef.child('buzzedPlayer');
    const currentBuzz = await buzzedPlayerRef.once('value');
    
    if (!currentBuzz.val()) {
        // First to buzz!
        await roomRef.update({
            buzzedPlayer: playerName,
            buzzTime: buzzTime,
            buzzerLocked: true
        });
    }
});

function handleBuzzed(buzzedPlayerName) {
    // Pause music
    if (musicPlayer) {
        musicPlayer.pause();
    }

    // Show who buzzed
    const buzzDisplay = document.getElementById('buzzDisplay');
    if (buzzDisplay) {
        buzzDisplay.style.display = 'block';
        document.getElementById('buzzedPlayer').textContent = buzzedPlayerName;
    }

    // Hide buzzer
    const buzzerSection = document.getElementById('buzzerSection');
    if (buzzerSection) {
        buzzerSection.style.display = 'none';
    }

    // Show waiting message for non-hosts
    const waitingMsg = document.getElementById('waitingMsg');
    if (!isHost && waitingMsg) {
        waitingMsg.style.display = 'block';
    }

    // Show host controls
    if (isHost) {
        const hostControls = document.getElementById('hostControls');
        if (hostControls) {
            hostControls.style.display = 'block';
        }
    }
}

// Host clicks Correct
document.getElementById('correctBtn')?.addEventListener('click', async () => {
    const buzzedPlayerName = (await roomRef.child('buzzedPlayer').once('value')).val();
    
    if (buzzedPlayerName) {
        // Award points
        const playerSnapshot = await db.ref(`rooms/${gameCode}/players/${buzzedPlayerName}`).once('value');
        const playerData = playerSnapshot.val();
        const newScore = (playerData.score || 0) + 1000;
        const correctCount = (playerData.correctCount || 0) + 1;
        
        await db.ref(`rooms/${gameCode}/players/${buzzedPlayerName}`).update({
            score: newScore,
            correctCount: correctCount,
            lastPoints: 1000
        });
    }

    // Move to next question
    await advanceQuestion();
});

// Host clicks Wrong
document.getElementById('wrongBtn')?.addEventListener('click', async () => {
    const buzzedPlayerName = (await roomRef.child('buzzedPlayer').once('value')).val();
    
    if (buzzedPlayerName) {
        // Deduct points
        const playerSnapshot = await db.ref(`rooms/${gameCode}/players/${buzzedPlayerName}`).once('value');
        const playerData = playerSnapshot.val();
        const newScore = (playerData.score || 0) - 250;
        
        await db.ref(`rooms/${gameCode}/players/${buzzedPlayerName}`).update({
            score: newScore,
            lastPoints: -250
        });
    }

    // Resume quiz with lockout
    await resumeQuiz(buzzedPlayerName);
});

async function resumeQuiz(lockedOutPlayer) {
    // Reset buzz state
    await roomRef.update({
        buzzedPlayer: null,
        buzzerLocked: false
    });

    // Hide buzz display
    const buzzDisplay = document.getElementById('buzzDisplay');
    const hostControls = document.getElementById('hostControls');
    const waitingMsg = document.getElementById('waitingMsg');
    
    if (buzzDisplay) buzzDisplay.style.display = 'none';
    if (hostControls) hostControls.style.display = 'none';
    if (waitingMsg) waitingMsg.style.display = 'none';

    // Show buzzer again for non-locked players
    if (!isHost) {
        if (playerName === lockedOutPlayer) {
            // This player is locked out
            isLockedOut = true;
            const lockoutMsg = document.getElementById('lockoutMsg');
            if (lockoutMsg) {
                lockoutMsg.style.display = 'block';
            }
            
            let timeLeft = 5;
            const lockoutTimeEl = document.getElementById('lockoutTime');
            if (lockoutTimeEl) {
                lockoutTimeEl.textContent = timeLeft;
            }
            
            lockoutTimer = setInterval(() => {
                timeLeft--;
                if (lockoutTimeEl) {
                    lockoutTimeEl.textContent = timeLeft;
                }
                
                if (timeLeft <= 0) {
                    clearInterval(lockoutTimer);
                    lockoutTimer = null;
                    isLockedOut = false;
                    if (lockoutMsg) lockoutMsg.style.display = 'none';
                    const buzzerSection = document.getElementById('buzzerSection');
                    if (buzzerSection) buzzerSection.style.display = 'block';
                }
            }, 1000);
        } else {
            const buzzerSection = document.getElementById('buzzerSection');
            if (buzzerSection) buzzerSection.style.display = 'block';
        }
    }

    // Resume music from where it paused
    if (musicPlayer && currentQuestion.type === 'music') {
        musicPlayer.play();
    }
}

function handleTimeUp() {
    // Stop music
    if (musicPlayer) {
        musicPlayer.stop();
    }

    // Hide buzzer
    const buzzerSection = document.getElementById('buzzerSection');
    if (buzzerSection) buzzerSection.style.display = 'none';

    // Show waiting message for non-hosts
    const waitingMsg = document.getElementById('waitingMsg');
    if (!isHost && waitingMsg) {
        waitingMsg.style.display = 'block';
    }

    // Show continue button for host
    if (isHost) {
        roomRef.once('value').then(snapshot => {
            const roomData = snapshot.val();
            const nextQ = roomData.currentQ + 1;
            
            if (nextQ >= roomData.questions.length) {
                const resultsBtn = document.getElementById('resultsBtn');
                if (resultsBtn) resultsBtn.style.display = 'block';
            } else {
                const continueBtn = document.getElementById('continueBtn');
                if (continueBtn) continueBtn.style.display = 'block';
            }
        });
    }
}

async function advanceQuestion() {
    const snapshot = await roomRef.once('value');
    const room = snapshot.val();
    
    const nextQ = room.currentQ + 1;
    const totalQ = room.questions.length;
    
    if (nextQ >= totalQ) {
        await roomRef.update({ status: 'finished' });
    } else {
        await roomRef.update({ currentQ: nextQ });
    }
}

// Continue button (host only, after time runs out or wrong answer)
document.getElementById('continueBtn')?.addEventListener('click', async () => {
    await advanceQuestion();
});

// Results button (host only, after last question)
document.getElementById('resultsBtn')?.addEventListener('click', async () => {
    await roomRef.update({ status: 'finished' });
});
