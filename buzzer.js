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
let timerInterval = null;
let timeRemaining = 0;
let isPausedLocally = false;

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

        // Clear all timers
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
        if (lockoutTimer) {
            clearInterval(lockoutTimer);
            lockoutTimer = null;
        }
        if (musicPlayer) {
            musicPlayer.stop();
        }

        // Reset state
        await roomRef.update({
            buzzedPlayer: null,
            gamePaused: false
        });

        isLockedOut = false;
        isPausedLocally = false;
        
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
    document.getElementById('buzzerSection').style.display = 'none';
    document.getElementById('hostControls').style.display = 'none';
    document.getElementById('hostBuzzControls').style.display = 'none';
    document.getElementById('buzzDisplay').style.display = 'none';
    document.getElementById('resultsBtn').style.display = 'none';
    document.getElementById('waitingMsg').style.display = 'none';
    document.getElementById('lockoutMsg').style.display = 'none';

    // Show appropriate UI
    if (isHost) {
        showHostControls();
    } else {
        showPlayerBuzzer();
    }

    // Load and play music
    const musicPlayerEl = document.getElementById('musicPlayer');
    if (!musicPlayer) {
        musicPlayer = new YouTubePlayer('musicPlayer');
    }

    if (question.type === 'music' && question.youtubeUrl) {
        musicPlayer.load(question.youtubeUrl).then(() => {
            const duration = question.duration || 30;
            timeRemaining = duration;
            startTimer(duration);
        }).catch(error => {
            console.error('Failed to load music:', error);
        });
    }
}

function startTimer(duration) {
    const timeLeftEl = document.getElementById('timeLeft');
    timeRemaining = duration;
    
    if (timeLeftEl) {
        timeLeftEl.textContent = timeRemaining;
    }

    // Start music
    if (musicPlayer) {
        musicPlayer.playClip(0, duration, () => {
            // Callback from YouTube player - just update time
            timeRemaining--;
            if (timeLeftEl) {
                timeLeftEl.textContent = Math.max(0, timeRemaining);
            }

            if (timeRemaining <= 0) {
                handleTimeUp();
            }
        });
    }
}

function showHostControls() {
    document.getElementById('hostControls').style.display = 'block';
    document.getElementById('hostBuzzControls').style.display = 'none';
    document.getElementById('buzzerSection').style.display = 'none';
    document.getElementById('waitingMsg').style.display = 'none';
    
    // Update pause button text
    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) {
        pauseBtn.textContent = isPausedLocally ? '▶️ Resume Music' : '⏸️ Pause Music';
    }
}

function showPlayerBuzzer() {
    const buzzerSection = document.getElementById('buzzerSection');
    const buzzerBtn = document.getElementById('buzzerBtn');
    const lockoutMsg = document.getElementById('lockoutMsg');
    const waitingMsg = document.getElementById('waitingMsg');
    
    if (buzzerSection) buzzerSection.style.display = 'block';
    if (waitingMsg) waitingMsg.style.display = 'none';
    if (lockoutMsg) lockoutMsg.style.display = 'none';
    
    if (buzzerBtn) {
        buzzerBtn.disabled = isLockedOut;
    }
}

// Player buzzes
document.getElementById('buzzerBtn')?.addEventListener('click', async () => {
    if (isLockedOut || isHost) return;

    const buzzTime = Date.now();
    
    // Try to buzz
    const buzzedPlayerRef = roomRef.child('buzzedPlayer');
    const currentBuzz = await buzzedPlayerRef.once('value');
    
    if (!currentBuzz.val()) {
        // First to buzz - pause for everyone
        await roomRef.update({
            buzzedPlayer: playerName,
            buzzTime: buzzTime,
            buzzerLocked: true,
            gamePaused: true
        });
    }
});

function handleBuzzed(buzzedPlayerName) {
    // Pause music
    if (musicPlayer) {
        musicPlayer.pause();
    }
    
    isPausedLocally = true;

    // Show who buzzed
    const buzzDisplay = document.getElementById('buzzDisplay');
    if (buzzDisplay) {
        buzzDisplay.style.display = 'block';
        document.getElementById('buzzedPlayer').textContent = buzzedPlayerName;
    }

    // HOST: Show correct/wrong buttons
    if (isHost) {
        document.getElementById('hostControls').style.display = 'none';
        document.getElementById('hostBuzzControls').style.display = 'block';
        document.getElementById('correctAnswer').textContent = currentQuestion.options[currentQuestion.correct];
    } 
    // PLAYERS: Disable buzzer
    else {
        const buzzerBtn = document.getElementById('buzzerBtn');
        if (buzzerBtn) buzzerBtn.disabled = true;
        
        if (playerName !== buzzedPlayerName) {
            const waitingMsg = document.getElementById('waitingMsg');
            if (waitingMsg) waitingMsg.style.display = 'block';
        }
    }
}

// Host Pause/Resume
document.getElementById('pauseBtn')?.addEventListener('click', async () => {
    isPausedLocally = !isPausedLocally;
    
    if (isPausedLocally) {
        // Pause
        if (musicPlayer) musicPlayer.pause();
        document.getElementById('pauseBtn').textContent = '▶️ Resume Music';
    } else {
        // Resume
        if (musicPlayer) musicPlayer.play();
        document.getElementById('pauseBtn').textContent = '⏸️ Pause Music';
    }
});

// Host Skip Song
document.getElementById('skipBtn')?.addEventListener('click', async () => {
    await advanceQuestion();
});

// Host Correct
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

    await advanceQuestion();
});

// Host Wrong
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

    await resumeAfterWrong(buzzedPlayerName);
});

async function resumeAfterWrong(lockedOutPlayer) {
    // Reset buzz and unpause
    await roomRef.update({
        buzzedPlayer: null,
        gamePaused: false
    });

    isPausedLocally = false;

    // Hide buzz display
    document.getElementById('buzzDisplay').style.display = 'none';
    document.getElementById('hostBuzzControls').style.display = 'none';
    document.getElementById('waitingMsg').style.display = 'none';

    // Resume music
    if (isHost && musicPlayer) {
        musicPlayer.play();
    }

    // Handle locked player
    if (!isHost) {
        if (playerName === lockedOutPlayer) {
            // This player locked out
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
            if (buzzerBtn) buzzerBtn.disabled = false;
        }
    }

    // Show host controls
    if (isHost) {
        showHostControls();
    }
}

function handleTimeUp() {
    if (musicPlayer) {
        musicPlayer.stop();
    }

    document.getElementById('buzzerSection').style.display = 'none';

    if (!isHost) {
        const waitingMsg = document.getElementById('waitingMsg');
        if (waitingMsg) {
            waitingMsg.textContent = "Time's up! Waiting for host...";
            waitingMsg.style.display = 'block';
        }
    }

    if (isHost) {
        roomRef.once('value').then(snapshot => {
            const roomData = snapshot.val();
            const nextQ = roomData.currentQ + 1;
            
            document.getElementById('hostControls').style.display = 'block';
            
            if (nextQ >= roomData.questions.length) {
                document.getElementById('resultsBtn').style.display = 'block';
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

document.getElementById('resultsBtn')?.addEventListener('click', async () => {
    await roomRef.update({ status: 'finished' });
});
