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
let lockoutDuration = 5;

// Load initial room data
roomRef.once('value').then(snapshot => {
    room = snapshot.val();
    if (!room) {
        window.location.href = 'index.html';
        return;
    }

    document.getElementById('totalQ').textContent = room.questions.length;
    
    // Load lockout duration from game params
    if (room.gameParams && room.gameParams.buzzerLockoutTime) {
        lockoutDuration = room.gameParams.buzzerLockoutTime;
    }
    
    setupQuestionListener(room);
    setupStatusListener();
    setupBuzzListener();
});

function setupQuestionListener(room) {
    roomRef.child('currentQ').on('value', async (snapshot) => {
        const qIndex = snapshot.val();

        if (qIndex === -1) return;

        if (qIndex >= room.questions.length) {
            await roomRef.update({ status: 'finished' });
            return;
        }

        // Reset state for new question
        await roomRef.update({
            buzzedPlayer: null,
            buzzTime: null,
            buzzerLocked: false,
            gamePaused: false
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
        } else {
            // No one buzzed - show appropriate UI
            if (isHost) {
                showHostControls();
            } else {
                showPlayerBuzzer();
            }
        }
    });
}

function displayQuestion(question, index) {
    currentQuestion = question;

    document.getElementById('currentQ').textContent = index + 1;
    document.getElementById('questionText').textContent = question.text;

    // Hide all UI
    const buzzerSection = document.getElementById('buzzerSection');
    const hostControls = document.getElementById('hostControls');
    const hostBuzzControls = document.getElementById('hostBuzzControls');
    const buzzDisplay = document.getElementById('buzzDisplay');
    const resultsBtn = document.getElementById('resultsBtn');
    const waitingMsg = document.getElementById('waitingMsg');
    const lockoutMsg = document.getElementById('lockoutMsg');

    if (buzzerSection) buzzerSection.style.display = 'none';
    if (hostControls) hostControls.style.display = 'none';
    if (hostBuzzControls) hostBuzzControls.style.display = 'none';
    if (buzzDisplay) buzzDisplay.style.display = 'none';
    if (resultsBtn) resultsBtn.style.display = 'none';
    if (waitingMsg) waitingMsg.style.display = 'none';
    if (lockoutMsg) lockoutMsg.style.display = 'none';

    // Show appropriate UI based on role
    if (isHost) {
        showHostControls();
    } else {
        showPlayerBuzzer();
    }

    // Initialize and play music
    const musicPlayerEl = document.getElementById('musicPlayer');
    if (!musicPlayer) {
        musicPlayer = new YouTubePlayer('musicPlayer');
    }

    if (question.type === 'music' && question.youtubeUrl) {
        musicPlayer.load(question.youtubeUrl).then(() => {
            const duration = question.duration || 30;
            startMusic(duration);
        }).catch(error => {
            console.error('Failed to load music:', error);
        });
    }
}

function startMusic(duration) {
    const timeLeftEl = document.getElementById('timeLeft');
    let remaining = duration;
    
    if (timeLeftEl) {
        timeLeftEl.textContent = remaining;
    }

    if (musicPlayer) {
        musicPlayer.playClip(0, duration, () => {
            remaining--;
            if (timeLeftEl) {
                timeLeftEl.textContent = Math.max(0, remaining);
            }

            if (remaining <= 0) {
                handleTimeUp();
            }
        });
    }
}

function showHostControls() {
    const hostControls = document.getElementById('hostControls');
    const hostBuzzControls = document.getElementById('hostBuzzControls');
    const buzzerSection = document.getElementById('buzzerSection');
    
    if (hostControls) hostControls.style.display = 'block';
    if (hostBuzzControls) hostBuzzControls.style.display = 'none';
    if (buzzerSection) buzzerSection.style.display = 'none';
}

function showPlayerBuzzer() {
    const buzzerSection = document.getElementById('buzzerSection');
    const hostControls = document.getElementById('hostControls');
    
    if (buzzerSection) buzzerSection.style.display = 'block';
    if (hostControls) hostControls.style.display = 'none';

    // Check if locked out on display
    if (isLockedOut) {
        const buzzerBtn = document.getElementById('buzzerBtn');
        const lockoutMsg = document.getElementById('lockoutMsg');
        
        if (buzzerBtn) buzzerBtn.disabled = true;
        if (lockoutMsg) lockoutMsg.style.display = 'block';
    }
}

// Player buzzes
document.getElementById('buzzerBtn')?.addEventListener('click', async () => {
    if (isLockedOut || isHost) return;

    const buzzTime = Date.now();
    
    // Try to buzz (race condition handled by Firebase)
    const buzzedPlayerRef = roomRef.child('buzzedPlayer');
    const currentBuzz = await buzzedPlayerRef.once('value');
    
    if (!currentBuzz.val()) {
        // First to buzz!
        await roomRef.update({
            buzzedPlayer: playerName,
            buzzTime: buzzTime,
            buzzerLocked: true,
            gamePaused: true  // PAUSE MUSIC FOR EVERYONE
        });
    }
});

function handleBuzzed(buzzedPlayerName) {
    // Show who buzzed
    const buzzDisplay = document.getElementById('buzzDisplay');
    if (buzzDisplay) {
        buzzDisplay.style.display = 'block';
        document.getElementById('buzzedPlayer').textContent = buzzedPlayerName;
    }

    // For HOST: Show correct/wrong buttons
    if (isHost) {
        const hostControls = document.getElementById('hostControls');
        const hostBuzzControls = document.getElementById('hostBuzzControls');
        
        if (hostControls) hostControls.style.display = 'none';
        if (hostBuzzControls) {
            hostBuzzControls.style.display = 'block';
            document.getElementById('correctAnswer').textContent = currentQuestion.options[currentQuestion.correct];
        }
        
        // Pause music for host too
        if (musicPlayer) {
            musicPlayer.pause();
        }
    } 
    // For PLAYERS: Show waiting or lockout
    else {
        const buzzerSection = document.getElementById('buzzerSection');
        if (buzzerSection) buzzerSection.style.display = 'block';
        
        if (playerName === buzzedPlayerName) {
            // This player buzzed - disable their button
            const buzzerBtn = document.getElementById('buzzerBtn');
            if (buzzerBtn) buzzerBtn.disabled = true;
        } else {
            // Another player buzzed - disable all buttons
            const buzzerBtn = document.getElementById('buzzerBtn');
            if (buzzerBtn) buzzerBtn.disabled = true;
            
            const waitingMsg = document.getElementById('waitingMsg');
            if (waitingMsg) waitingMsg.style.display = 'block';
        }
    }
}

// Host clicks Pause/Resume
document.getElementById('pauseBtn')?.addEventListener('click', async () => {
    const pauseSnapshot = await roomRef.child('gamePaused').once('value');
    const currentPauseState = pauseSnapshot.val() || false;
    
    await roomRef.update({
        gamePaused: !currentPauseState
    });

    // Update music state locally
    if (!currentPauseState && musicPlayer) {
        musicPlayer.pause();
    } else if (currentPauseState && musicPlayer) {
        musicPlayer.play();
    }

    // Update button text
    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) {
        pauseBtn.textContent = currentPauseState ? '⏸️ Pause Music' : '▶️ Resume Music';
    }
});

// Host clicks Skip/Next Song (no points awarded)
document.getElementById('skipBtn')?.addEventListener('click', async () => {
    await advanceQuestion();
});

// Host clicks Correct
document.getElementById('correctBtn')?.addEventListener('click', async () => {
    const buzzedPlayerName = (await roomRef.child('buzzedPlayer').once('value')).val();
    
    if (buzzedPlayerName) {
        try {
            const playerSnapshot = await db.ref(`rooms/${gameCode}/players/${buzzedPlayerName}`).once('value');
            const playerData = playerSnapshot.val();
            
            if (playerData) {
                const newScore = (playerData.score || 0) + 1000;
                const correctCount = (playerData.correctCount || 0) + 1;
                
                await db.ref(`rooms/${gameCode}/players/${buzzedPlayerName}`).update({
                    score: newScore,
                    correctCount: correctCount,
                    lastPoints: 1000
                });
            }
        } catch (error) {
            console.error('Error awarding points:', error);
        }
    }

    // Advance to next question
    await advanceQuestion();
});

// Host clicks Wrong
document.getElementById('wrongBtn')?.addEventListener('click', async () => {
    const buzzedPlayerName = (await roomRef.child('buzzedPlayer').once('value')).val();
    
    if (buzzedPlayerName) {
        try {
            const playerSnapshot = await db.ref(`rooms/${gameCode}/players/${buzzedPlayerName}`).once('value');
            const playerData = playerSnapshot.val();
            
            if (playerData) {
                const newScore = Math.max(0, (playerData.score || 0) - 250);
                
                await db.ref(`rooms/${gameCode}/players/${buzzedPlayerName}`).update({
                    score: newScore,
                    lastPoints: -250
                });
            }
        } catch (error) {
            console.error('Error deducting points:', error);
        }
    }

    // Resume and lock out player
    await resumeAfterWrong(buzzedPlayerName);
});

async function resumeAfterWrong(lockedOutPlayer) {
    // Reset buzz state and unpause
    await roomRef.update({
        buzzedPlayer: null,
        buzzerLocked: false,
        gamePaused: false
    });

    // Hide buzz display
    const buzzDisplay = document.getElementById('buzzDisplay');
    const hostBuzzControls = document.getElementById('hostBuzzControls');
    const waitingMsg = document.getElementById('waitingMsg');
    
    if (buzzDisplay) buzzDisplay.style.display = 'none';
    if (hostBuzzControls) hostBuzzControls.style.display = 'none';
    if (waitingMsg) waitingMsg.style.display = 'none';

    // Resume music for host
    if (isHost && musicPlayer) {
        musicPlayer.play();
    }

    // Handle locked player
    if (!isHost) {
        if (playerName === lockedOutPlayer) {
            // This player is locked out
            isLockedOut = true;
            const buzzerBtn = document.getElementById('buzzerBtn');
            const lockoutMsg = document.getElementById('lockoutMsg');
            const buzzerSection = document.getElementById('buzzerSection');
            
            if (buzzerSection) buzzerSection.style.display = 'block';
            if (buzzerBtn) buzzerBtn.disabled = true;
            if (lockoutMsg) lockoutMsg.style.display = 'block';
            
            let timeLeft = lockoutDuration;
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
                    if (buzzerBtn) buzzerBtn.disabled = false;
                    if (lockoutMsg) lockoutMsg.style.display = 'none';
                }
            }, 1000);
        } else {
            // Other players can buzz again
            const buzzerBtn = document.getElementById('buzzerBtn');
            const buzzerSection = document.getElementById('buzzerSection');
            
            if (buzzerSection) buzzerSection.style.display = 'block';
            if (buzzerBtn) buzzerBtn.disabled = false;
        }
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

    // Show waiting for host
    const waitingMsg = document.getElementById('waitingMsg');
    if (!isHost && waitingMsg) {
        waitingMsg.textContent = "Time's up! Waiting for host...";
        waitingMsg.style.display = 'block';
    }

    // Show next button for host
    if (isHost) {
        roomRef.once('value').then(snapshot => {
            const roomData = snapshot.val();
            const nextQ = roomData.currentQ + 1;
            const hostControls = document.getElementById('hostControls');
            const resultsBtn = document.getElementById('resultsBtn');
            
            if (hostControls) hostControls.style.display = 'block';
            
            if (nextQ >= roomData.questions.length) {
                if (resultsBtn) resultsBtn.style.display = 'block';
            } else {
                const skipBtn = document.getElementById('skipBtn');
                if (skipBtn) skipBtn.textContent = 'Next Question';
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

// Results button (host only)
document.getElementById('resultsBtn')?.addEventListener('click', async () => {
    await roomRef.update({ status: 'finished' });
});
