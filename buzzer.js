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
let isPaused = false;
let musicTimerInterval = null;

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

        isPaused = false;
        isLockedOut = false;
        if (lockoutTimer) {
            clearInterval(lockoutTimer);
            lockoutTimer = null;
        }
        if (musicTimerInterval) {
            clearInterval(musicTimerInterval);
            musicTimerInterval = null;
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
            // No one buzzed - reset UI
            updateHostControlsForNoBuzz();
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
    const hostBuzzControls = document.getElementById('hostBuzzControls');
    const continueBtn = document.getElementById('continueBtn');
    const resultsBtn = document.getElementById('resultsBtn');
    const lockoutMsg = document.getElementById('lockoutMsg');
    const waitingMsg = document.getElementById('waitingMsg');

    if (buzzerSection) buzzerSection.style.display = 'none';
    if (buzzDisplay) buzzDisplay.style.display = 'none';
    if (hostControls) hostControls.style.display = 'none';
    if (hostBuzzControls) hostBuzzControls.style.display = 'none';
    if (continueBtn) continueBtn.style.display = 'none';
    if (resultsBtn) resultsBtn.style.display = 'none';
    if (lockoutMsg) lockoutMsg.style.display = 'none';
    if (waitingMsg) waitingMsg.style.display = 'none';

    // Show buzzer for non-hosts
    if (!isHost && buzzerSection) {
        buzzerSection.style.display = 'block';
    }

    // Show host controls (pause/skip) for host
    if (isHost && hostControls) {
        hostControls.style.display = 'block';
        updateHostControlsForNoBuzz();
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
            startMusicTimer(duration);
        }).catch(error => {
            console.error('Failed to load music:', error);
        });
    }
}

function startMusicTimer(duration) {
    let remaining = duration;
    const timeLeftEl = document.getElementById('timeLeft');
    
    if (timeLeftEl) {
        timeLeftEl.textContent = remaining;
    }

    // Clear any existing timer
    if (musicTimerInterval) {
        clearInterval(musicTimerInterval);
    }

    // Start music
    if (musicPlayer) {
        musicPlayer.playClip(0, duration, () => {
            // Timer callback - only update if not paused
            if (!isPaused) {
                remaining--;
                if (timeLeftEl) {
                    timeLeftEl.textContent = Math.max(0, remaining);
                }

                // Time's up
                if (remaining <= 0) {
                    handleTimeUp();
                }
            }
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
    // Pause music and timer
    if (musicPlayer) {
        musicPlayer.pause();
    }
    if (musicTimerInterval) {
        clearInterval(musicTimerInterval);
    }
    isPaused = true;

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

    // Show host buzz controls
    if (isHost) {
        const hostControls = document.getElementById('hostControls');
        const hostBuzzControls = document.getElementById('hostBuzzControls');
        
        if (hostControls) hostControls.style.display = 'none';
        if (hostBuzzControls) {
            hostBuzzControls.style.display = 'block';
            document.getElementById('correctAnswer').textContent = currentQuestion.options[currentQuestion.correct];
        }
    }
}

function updateHostControlsForNoBuzz() {
    const hostControls = document.getElementById('hostControls');
    const hostBuzzControls = document.getElementById('hostBuzzControls');
    const buzzDisplay = document.getElementById('buzzDisplay');
    const waitingMsg = document.getElementById('waitingMsg');

    if (hostControls) hostControls.style.display = 'block';
    if (hostBuzzControls) hostBuzzControls.style.display = 'none';
    if (buzzDisplay) buzzDisplay.style.display = 'none';
    if (waitingMsg) waitingMsg.style.display = 'none';

    // Update pause button state
    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) {
        pauseBtn.textContent = isPaused ? '▶️ Resume Music' : '⏸️ Pause Music';
    }
}

// Host clicks Pause/Resume
document.getElementById('pauseBtn')?.addEventListener('click', async () => {
    isPaused = !isPaused;

    if (isPaused) {
        if (musicPlayer) musicPlayer.pause();
        if (musicTimerInterval) clearInterval(musicTimerInterval);
        document.getElementById('pauseBtn').textContent = '▶️ Resume Music';
    } else {
        if (musicPlayer) musicPlayer.play();
        // Restart timer countdown
        const timeLeftEl = document.getElementById('timeLeft');
        let remaining = parseInt(timeLeftEl?.textContent || 0);
        
        if (musicTimerInterval) clearInterval(musicTimerInterval);
        
        musicTimerInterval = setInterval(() => {
            remaining--;
            if (timeLeftEl) {
                timeLeftEl.textContent = Math.max(0, remaining);
            }

            if (remaining <= 0) {
                clearInterval(musicTimerInterval);
                handleTimeUp();
            }
        }, 1000);

        document.getElementById('pauseBtn').textContent = '⏸️ Pause Music';
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
        // Award points
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

    // Move to next question
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

    // Resume quiz with lockout
    await resumeQuiz(buzzedPlayerName);
});

async function resumeQuiz(lockedOutPlayer) {
    // Reset buzz state
    await roomRef.update({
        buzzedPlayer: null,
        buzzerLocked: false
    });

    // Reset pause state
    isPaused = false;

    // Hide buzz display
    const buzzDisplay = document.getElementById('buzzDisplay');
    const hostBuzzControls = document.getElementById('hostBuzzControls');
    const waitingMsg = document.getElementById('waitingMsg');
    
    if (buzzDisplay) buzzDisplay.style.display = 'none';
    if (hostBuzzControls) hostBuzzControls.style.display = 'none';
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
        
        // Resume timer
        const timeLeftEl = document.getElementById('timeLeft');
        let remaining = parseInt(timeLeftEl?.textContent || 0);
        
        if (musicTimerInterval) clearInterval(musicTimerInterval);
        
        musicTimerInterval = setInterval(() => {
            remaining--;
            if (timeLeftEl) {
                timeLeftEl.textContent = Math.max(0, remaining);
            }

            if (remaining <= 0) {
                clearInterval(musicTimerInterval);
                handleTimeUp();
            }
        }, 1000);
    }

    // Update host controls
    updateHostControlsForNoBuzz();
}

function handleTimeUp() {
    // Stop music
    if (musicPlayer) {
        musicPlayer.stop();
    }
    if (musicTimerInterval) {
        clearInterval(musicTimerInterval);
    }

    // Hide buzzer
    const buzzerSection = document.getElementById('buzzerSection');
    if (buzzerSection) buzzerSection.style.display = 'none';

    // Show waiting message for non-hosts
    const waitingMsg = document.getElementById('waitingMsg');
    if (!isHost && waitingMsg) {
        waitingMsg.textContent = "Time's up! Waiting for host...";
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
                const skipBtn = document.getElementById('skipBtn');
                if (skipBtn) {
                    skipBtn.textContent = 'Next Question';
                    skipBtn.style.display = 'block';
                }
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

// Results button (host only, after last question)
document.getElementById('resultsBtn')?.addEventListener('click', async () => {
    await roomRef.update({ status: 'finished' });
});
