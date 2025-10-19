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
let musicTimerInterval = null;
let lockoutDuration = 5; // Default, will be updated from game params

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
    setupPauseStateListener();
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
            buzzerLocked: false,
            gamePaused: false
        });

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

function setupPauseStateListener() {
    roomRef.child('gamePaused').on('value', (snapshot) => {
        const gamePaused = snapshot.val();
        
        if (gamePaused && musicPlayer) {
            musicPlayer.pause();
        } else if (!gamePaused && musicPlayer) {
            musicPlayer.play();
        }

        // Disable buzzer if game is paused
        const buzzerBtn = document.getElementById('buzzerBtn');
        if (buzzerBtn) {
            buzzerBtn.disabled = gamePaused || isLockedOut;
        }

        // Update pause button text for host
        if (isHost) {
            const pauseBtn = document.getElementById('pauseBtn');
            if (pauseBtn) {
                pauseBtn.textContent = gamePaused ? '▶️ Resume Music' : '⏸️ Pause Music';
            }
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
            roomRef.child('gamePaused').once('value', (snapshot) => {
                const gamePaused = snapshot.val();
                
                if (!gamePaused) {
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
        });
    }
}

// Player buzzes
document.getElementById('buzzerBtn')?.addEventListener('click', async () => {
    if (isLockedOut || isHost) return;

    // Check if game is paused
    const pauseSnapshot = await roomRef.child('gamePaused').once('value');
    if (pauseSnapshot.val()) {
        return; // Can't buzz if game is paused
    }

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
    // Show who buzzed
    const buzzDisplay = document.getElementById('buzzDisplay');
    if (buzzDisplay) {
        buzzDisplay.style.display = 'block';
        document.getElementById('buzzedPlayer').textContent = buzzedPlayerName;
    }

    // Hide buzzer for all players - but keep section visible for locked player
    const buzzerSection = document.getElementById('buzzerSection');
    if (buzzerSection) {
        buzzerSection.style.display = 'block';
    }

    // Disable buzzer button for everyone
    const buzzerBtn = document.getElementById('buzzerBtn');
    if (buzzerBtn) {
        buzzerBtn.disabled = true;
    }

    // Show waiting message for non-hosts who didn't buzz
    const waitingMsg = document.getElementById('waitingMsg');
    if (!isHost && playerName !== buzzedPlayerName && waitingMsg) {
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
    const buzzerBtn = document.getElementById('buzzerBtn');

    if (hostControls) hostControls.style.display = 'block';
    if (hostBuzzControls) hostBuzzControls.style.display = 'none';
    if (buzzDisplay) buzzDisplay.style.display = 'none';
    if (waitingMsg) waitingMsg.style.display = 'none';
    if (buzzerBtn) buzzerBtn.disabled = false;

    // Update pause button state
    roomRef.child('gamePaused').once('value', (snapshot) => {
        const gamePaused = snapshot.val();
        const pauseBtn = document.getElementById('pauseBtn');
        if (pauseBtn) {
            pauseBtn.textContent = gamePaused ? '▶️ Resume Music' : '⏸️ Pause Music';
        }
    });
}

// Host clicks Pause/Resume
document.getElementById('pauseBtn')?.addEventListener('click', async () => {
    const pauseSnapshot = await roomRef.child('gamePaused').once('value');
    const currentPauseState = pauseSnapshot.val() || false;
    
    // Toggle pause state in database (syncs to all players)
    await roomRef.update({
        gamePaused: !currentPauseState
    });
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
                    if (lockoutMsg) lockoutMsg.style.display = 'none';
                    
                    // Re-enable buzzer button
                    const buzzerBtn = document.getElementById('buzzerBtn');
                    if (buzzerBtn) {
                        buzzerBtn.disabled = false;
                    }
                }
            }, 1000);
            
            // Disable buzzer button while locked
            const buzzerBtn = document.getElementById('buzzerBtn');
            if (buzzerBtn) {
                buzzerBtn.disabled = true;
            }
        } else {
            const buzzerSection = document.getElementById('buzzerSection');
            if (buzzerSection) {
                buzzerSection.style.display = 'block';
            }
            
            // Re-enable buzzer button
            const buzzerBtn = document.getElementById('buzzerBtn');
            if (buzzerBtn) {
                buzzerBtn.disabled = false;
            }
        }
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
