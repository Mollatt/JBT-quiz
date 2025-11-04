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
let questionTimer = null;
let remainingTime = 0;
let isPaused = false;

// Load initial room data
roomRef.once('value').then(async snapshot => {
    const room = snapshot.val();
    if (!room) {
        window.location.href = 'index.html';
        return;
    }

    // Check if questions exist
    if (!room.questions || room.questions.length === 0) {
        console.error('No questions found in room');
        alert('Error: No questions found. Returning to lobby.');
        window.location.href = 'lobby.html';
        return;
    }

    document.getElementById('totalQ').textContent = room.questions.length;

    // Check if we're in the middle of a question
    if (room.currentQ >= 0 && room.currentQ < room.questions.length) {
        currentQuestion = room.questions[room.currentQ];

        const duration = currentQuestion.duration || 30;
        const isPausedAtLoad = !!room.isPaused;
        const questionStartTime = room.questionStartTime || null;
        const roomRemaining = room.remainingTime || duration;

        let elapsed = 0;
        if (questionStartTime && !isPausedAtLoad) {
            elapsed = Math.floor((Date.now() - questionStartTime) / 1000);
        }

        // Calculate remaining time and playback start position
        const effectiveRemaining = Math.max(roomRemaining - elapsed, 0);
        const playbackStartAt = (currentQuestion.startTime || 0) + elapsed;

        // Update global remaining time tracker
        remainingTime = effectiveRemaining;

        // Determine playback behavior
        if (room.buzzedPlayer) {
            handleBuzzed(room.buzzedPlayer);
        } else {
            displayQuestion(currentQuestion, room.currentQ, {
                autoPlay: !isPausedAtLoad,
                startAt: playbackStartAt,
                remainingTime: effectiveRemaining
            });
        }

        // Update pause logic
        isPaused = isPausedAtLoad;

        if (isPausedAtLoad) {
            if (musicPlayer) musicPlayer.pause();
            if (questionTimer) {
                clearInterval(questionTimer);
                questionTimer = null;
            }
            if (!isHost) {
                const buzzerBtn = document.getElementById('buzzerBtn');
                if (buzzerBtn) {
                    buzzerBtn.disabled = true;
                    buzzerBtn.style.opacity = '0.5';
                }
            }
        }
    }



    setupQuestionListener(room);
    setupStatusListener();
    setupBuzzListener();
    setupPauseListener();

    if (!isHost) {
        roomRef.child('remainingTime').on('value', snapshot => {
            const newRemaining = snapshot.val();
            if (typeof newRemaining === 'number') {
                remainingTime = newRemaining;
                document.getElementById('timeLeft').textContent = newRemaining;
            }
        });
    }

    // Detect reload mid-session (non-host only)
    if (!isHost && room.status === 'playing' && room.currentQ !== undefined) {
        const reloadLockout = Date.now() + 3000; // 3s reload cooldown
        await playerRef.update({ lockoutUntil: reloadLockout });
    }
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
            isPaused: false
        });

        const playersSnap = await playersRef.once('value');
        const players = playersSnap.val() || {};
        for (const pName in players) {
            db.ref(`rooms/${gameCode}/players/${pName}/lockoutUntil`).set(null);
        }

        isLockedOut = false;
        isPaused = false;
        if (lockoutTimer) {
            clearInterval(lockoutTimer);
            lockoutTimer = null;
        }
        if (questionTimer) {
            clearInterval(questionTimer);
            questionTimer = null;
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

// Listen for buzz state changes
function setupBuzzListener() {
    roomRef.child('buzzedPlayer').on('value', (snapshot) => {
        const buzzedPlayer = snapshot.val();

        if (buzzedPlayer) {
            handleBuzzed(buzzedPlayer);
        } else {
            // Buzz was cleared - let the pause listener handle resuming
            document.getElementById('buzzDisplay').style.display = 'none';
            document.getElementById('hostControls').style.display = 'none';

            // Show buzzer section for non-host, non-locked players
            // (pause listener will handle enabling/disabling)
            if (!isHost && !isLockedOut) {
                document.getElementById('buzzerSection').style.display = 'block';
            }

            if (isHost) {
                document.getElementById('hostButtonsTop').style.display = 'block';
            }
        }
    });
}

function setupLockoutListener() {
    playerRef.child('lockoutUntil').on('value', (snapshot) => {
        const lockoutUntil = snapshot.val();
        const now = Date.now();
        const buzzerBtn = document.getElementById('buzzerBtn');
        const lockoutMsg = document.getElementById('lockoutMsg');
        if (!buzzerBtn || !lockoutMsg) return;

        // clear any previous interval
        if (lockoutTimer) { clearInterval(lockoutTimer); lockoutTimer = null; }

        if (lockoutUntil && now < lockoutUntil) {
            // active lockout
            isLockedOut = true;
            const buzzerSection = document.getElementById('buzzerSection');
            if (buzzerSection) buzzerSection.style.display = 'block';

            let remaining = Math.ceil((lockoutUntil - now) / 1000);
            lockoutMsg.style.display = 'block';
            document.getElementById('lockoutTime').textContent = remaining;
            buzzerBtn.disabled = true;
            buzzerBtn.style.opacity = '0.3';

            lockoutTimer = setInterval(() => {
                remaining = Math.ceil((lockoutUntil - Date.now()) / 1000);
                if (remaining <= 0) {
                    clearInterval(lockoutTimer);
                    lockoutTimer = null;
                    isLockedOut = false;
                    lockoutMsg.style.display = 'none';
                    playerRef.update({ lockoutUntil: null });
                    if (!isPaused) {
                        buzzerBtn.disabled = false;
                        buzzerBtn.style.opacity = '1';
                    }
                } else {
                    document.getElementById('lockoutTime').textContent = remaining;
                }
            }, 1000);
        } else {
            // no lockout
            isLockedOut = false;
            lockoutMsg.style.display = 'none';
            if (!isPaused) {
                buzzerBtn.disabled = false;
                buzzerBtn.style.opacity = '1';
            }
        }
    });

}
setupLockoutListener();


function setupPauseListener() {
    roomRef.child('isPaused').on('value', (snapshot) => {
        const pausedState = snapshot.val();

        if (pausedState === true) {
            // Pause music and timer (always perform)
            if (musicPlayer && typeof musicPlayer.pause === 'function') {
                try { musicPlayer.pause(); } catch (e) { console.warn('musicPlayer.pause failed', e); }
            }
            if (questionTimer) {
                clearInterval(questionTimer);
                questionTimer = null;
            }
            isPaused = true;

            // Gray out buzzer for all non-host players
            if (!isHost) {
                const buzzerBtn = document.getElementById('buzzerBtn');
                if (buzzerBtn) {
                    buzzerBtn.disabled = true;
                    buzzerBtn.style.opacity = '0.5';
                }
            }
        } else { // pausedState === false (resume) — don't depend on local isPaused
            // Resume music and timer only if needed
            if (musicPlayer && currentQuestion && currentQuestion.type === 'music') {
                try {
                    // Try to play (some players may auto-resume; that's ok)
                    musicPlayer.play();
                } catch (e) {
                    console.warn('musicPlayer.play failed', e);
                }

                // Start timer only if there isn't already one running
                if (!questionTimer) {
                    startQuestionTimer();
                }
            }

            isPaused = false;

            // Re-enable buzzer for non-locked players
            if (!isHost && !isLockedOut) {
                const buzzerBtn = document.getElementById('buzzerBtn');
                if (buzzerBtn) {
                    buzzerBtn.disabled = false;
                    buzzerBtn.style.opacity = '1';
                }
            }
        }
    });
}


function displayQuestion(question, index, opts = { autoPlay: true }) {
    currentQuestion = question;

    // Update question number
    document.getElementById('currentQ').textContent = index + 1;
    document.getElementById('questionText').textContent = question.text;

    // Hide all UI elements initially
    document.getElementById('buzzerSection').style.display = 'none';
    document.getElementById('buzzDisplay').style.display = 'none';
    document.getElementById('hostControls').style.display = 'none';
    document.getElementById('continueBtn').style.display = 'none';
    document.getElementById('resultsBtn').style.display = 'none';
    document.getElementById('lockoutMsg').style.display = 'none';

    // Show pause and skip buttons for host
    if (isHost) {
        const hostButtons = document.getElementById('hostButtonsTop');
        if (hostButtons) {
            hostButtons.style.display = 'block';
        }
        const pauseBtn = document.getElementById('pauseBtn');
        if (pauseBtn) {
            pauseBtn.textContent = '⏸️ Pause';
        }
    }

    // Show buzzer for non-hosts
    if (!isHost) {
        document.getElementById('buzzerSection').style.display = 'block';
    } else {
        // Show host control buttons (pause/skip)
        document.getElementById('hostButtonsTop').style.display = 'block';
    }

    // Initialize and play music
    if (isHost && question.type === 'music' && question.youtubeUrl && opts.autoPlay) {
        musicPlayer.load(question.youtubeUrl).then(() => {
            const duration = opts.remainingTime || question.duration || 30;
            remainingTime = duration;

            if (!isPaused) {
                const startAt = opts.startAt || question.startTime || 0;
                musicPlayer.playClip(startAt, duration, () => { });
            }

            startQuestionTimer(duration);
        }).catch(error => {
            console.error('Failed to load music:', error);
        });
    } else if (!isHost) {
        // Players only run a visual timer synced to Firebase
        if (typeof opts.remainingTime === 'number') {
            remainingTime = opts.remainingTime;
            startQuestionTimer(opts.remainingTime);
        }
    }


}

let syncTimerInterval = null;

function startQuestionTimer(duration) {
    clearInterval(questionTimer);
    remainingTime = duration;

    questionTimer = setInterval(async () => {
        if (!isPaused) {
            remainingTime--;
            document.getElementById('timeLeft').textContent = remainingTime;

            // Only host writes to Firebase to stay the single source of truth
            if (isHost) {
                await roomRef.child('remainingTime').set(remainingTime);
            }

            if (remainingTime <= 0) {
                clearInterval(questionTimer);
                questionTimer = null;

                if (isHost) {
                    advanceQuestion();
                }
            }
        }
    }, 1000);
}





// Player buzzes
document.getElementById('buzzerBtn')?.addEventListener('click', async () => {
    if (isLockedOut || isHost || isPaused || remainingTime <= 0) return;

    const buzzTime = Date.now();

    // Try to set buzz (race condition handled by Firebase)
    const buzzedPlayerRef = roomRef.child('buzzedPlayer');
    const currentBuzz = await buzzedPlayerRef.once('value');

    if (!currentBuzz.val()) {
        // First to buzz!
        await roomRef.update({
            buzzedPlayer: playerName,
            buzzTime: buzzTime,
            buzzerLocked: true,
            isPaused: true  // Pause for everyone
        });
    }
});

function handleBuzzed(buzzedPlayerName) {
    console.log('handleBuzzed called for:', buzzedPlayerName, 'isHost:', isHost);
    // Pause music and timer
    if (musicPlayer) {
        musicPlayer.pause();
    }
    if (questionTimer) {
        clearInterval(questionTimer);
        questionTimer = null;
        // Save remaining time to database so it persists on refresh
        roomRef.update({ remainingTime: remainingTime });
    }
    isPaused = true;
    // Show who buzzed
    const buzzDisplay = document.getElementById('buzzDisplay');
    const buzzedPlayerEl = document.getElementById('buzzedPlayer');
    if (buzzDisplay) {
        buzzDisplay.style.display = 'block';
        console.log('Showing buzz display');
    }
    if (buzzedPlayerEl) {
        buzzedPlayerEl.textContent = buzzedPlayerName;
    }
    // Hide buzzer for all non-host players
    if (!isHost) {
        const buzzerSection = document.getElementById('buzzerSection');
        if (buzzerSection) {
            buzzerSection.style.display = 'none';
            console.log('Hiding buzzer section for player');
        }
    }
    // Hide pause button for host
    if (isHost) {
        const hostButtons = document.getElementById('hostButtonsTop');
        if (hostButtons) {
            hostButtons.style.display = 'none';
        }
    }
    // Show host controls
    if (isHost) {
        document.getElementById('hostControls').style.display = 'block';
        document.getElementById('correctAnswer').textContent = currentQuestion.options[currentQuestion.correct];
    }
}

// Host clicks Correct
document.getElementById('correctBtn')?.addEventListener('click', async () => {
    const buzzedPlayerName = (await roomRef.child('buzzedPlayer').once('value')).val();

    if (!buzzedPlayerName) {
        console.error('No player has buzzed');
        return;
    }

    // Check if player still exists in the room
    const playerSnapshot = await db.ref(`rooms/${gameCode}/players/${buzzedPlayerName}`).once('value');
    const playerData = playerSnapshot.val();

    if (!playerData) {
        console.error('Player', buzzedPlayerName, 'has left the game');
        alert('Player has left the game. Skipping to next question.');
        await advanceQuestion();
        return;
    }

    const newScore = (playerData.score || 0) + 1000;
    const correctCount = (playerData.correctCount || 0) + 1;

    await db.ref(`rooms/${gameCode}/players/${buzzedPlayerName}`).update({
        score: newScore,
        correctCount: correctCount,
        lastPoints: 1000
    });

    // Move to next question
    await advanceQuestion();
});

// Host clicks Wrong
document.getElementById('wrongBtn')?.addEventListener('click', async () => {
    const buzzedPlayerName = (await roomRef.child('buzzedPlayer').once('value')).val();
    if (!buzzedPlayerName) return;

    const playerSnapshot = await db.ref(`rooms/${gameCode}/players/${buzzedPlayerName}`).once('value');
    const playerData = playerSnapshot.val();
    const newScore = (playerData.score || 0) - 250;
    await db.ref(`rooms/${gameCode}/players/${buzzedPlayerName}`).update({
        score: newScore,
        lastPoints: -250
    });

    // Get lockout duration from gameParams or default 3 s
    const roomSnap = await roomRef.once('value');
    const lockoutSec = roomSnap.val()?.gameParams?.buzzerLockoutTime ?? 3;
    const lockoutUntil = Date.now() + lockoutSec * 1000;

    // Write to DB so the player knows when they’re free again
    await db.ref(`rooms/${gameCode}/players/${buzzedPlayerName}`).update({ lockoutUntil });

    // Clear buzz state + resume game
    await roomRef.update({
        buzzedPlayer: null,
        buzzerLocked: false,
        isPaused: false
    });
});

async function resumeQuiz(lockedOutPlayer) {
    // Reset buzz state but keep paused false to resume
    await roomRef.update({
        buzzedPlayer: null,
        buzzerLocked: false,
        isPaused: false
    });

    // Hide buzz display for ALL players
    document.getElementById('buzzDisplay').style.display = 'none';
    document.getElementById('hostControls').style.display = 'none';

    // Show pause button again for host
    if (isHost) {
        const hostButtons = document.getElementById('hostButtonsTop');
        if (hostButtons) {
            hostButtons.style.display = 'block';
        }
        const pauseBtn = document.getElementById('pauseBtn');
        if (pauseBtn) {
            pauseBtn.textContent = '⏸️ Pause';
        }
    }

    // Show buzzer again for non-locked players
    if (!isHost) {
        // Hide buzz display first
        document.getElementById('buzzDisplay').style.display = 'none';

        // If no lockedOutPlayer specified (player left), show buzzer for everyone
        if (!lockedOutPlayer || playerName === lockedOutPlayer) {
            // This player is locked out (or was the one who left)
            if (lockedOutPlayer && playerName === lockedOutPlayer) {
                isLockedOut = true;
                document.getElementById('lockoutMsg').style.display = 'block';

                // Get lockout time from game params
                const roomSnap = await roomRef.once('value');
                const room = roomSnap.val();
                let timeLeft = room.gameParams?.buzzerLockoutTime || 5;
                document.getElementById('lockoutTime').textContent = timeLeft;

                lockoutTimer = setInterval(() => {
                    timeLeft--;
                    document.getElementById('lockoutTime').textContent = timeLeft;

                    if (timeLeft <= 0) {
                        clearInterval(lockoutTimer);
                        lockoutTimer = null;
                        isLockedOut = false;
                        document.getElementById('lockoutMsg').style.display = 'none';
                        document.getElementById('buzzerSection').style.display = 'block';
                    }
                }, 1000);
            } else {
                document.getElementById('buzzerSection').style.display = 'block';
            }
        } else {
            document.getElementById('buzzerSection').style.display = 'block';
        }
    }

    // Resume music and timer
    isPaused = false;
    if (musicPlayer && currentQuestion.type === 'music') {
        musicPlayer.play();
        startQuestionTimer();
    }
}

function handleTimeUp() {
    // Stop music
    if (musicPlayer) {
        musicPlayer.stop();
    }

    // Hide buzzer
    document.getElementById('buzzerSection').style.display = 'none';

    // Hide pause and skip buttons
    if (isHost) {
        const hostButtons = document.getElementById('hostButtonsTop');
        if (hostButtons) {
            hostButtons.style.display = 'none';
        }
    }

    // Show continue button for host
    if (isHost) {
        roomRef.once('value').then(snapshot => {
            const roomData = snapshot.val();
            const nextQ = roomData.currentQ + 1;

            if (nextQ >= roomData.questions.length) {
                document.getElementById('resultsBtn').style.display = 'block';
            } else {
                document.getElementById('continueBtn').style.display = 'block';
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
        // Game finished
        await roomRef.update({ status: 'finished' });
    } else if (shouldShowScoreboard(nextQ, totalQ)) {
        // Mid-game scoreboard
        await roomRef.update({
            currentQ: nextQ,
            status: 'scoreboard'
        });
    } else {
        // Advance to next question
        const nextQuestion = room.questions[nextQ];
        const duration = nextQuestion?.duration || 30;

        await roomRef.update({
            currentQ: nextQ,
            questionStartTime: Date.now(),
            remainingTime: duration,
            isPaused: false // make sure to unpause at start of next question
        });
    }
}


// Calculate scoreboard display points
function shouldShowScoreboard(currentQ, totalQ) {
    if (totalQ <= 5) {
        return currentQ === Math.floor(totalQ * 0.5);
    } else if (totalQ <= 10) {
        const showPoints = [
            Math.floor(totalQ * 0.33),
            Math.floor(totalQ * 0.66)
        ];
        return showPoints.includes(currentQ);
    } else {
        const showPoints = [
            Math.floor(totalQ * 0.25),
            Math.floor(totalQ * 0.5),
            Math.floor(totalQ * 0.75)
        ];
        return showPoints.includes(currentQ);
    }
}

// Continue button (host only, after time runs out)
document.getElementById('continueBtn')?.addEventListener('click', async () => {
    await advanceQuestion();
});

// Results button (host only, after last question)
document.getElementById('resultsBtn')?.addEventListener('click', async () => {
    await roomRef.update({ status: 'finished' });
});

// Pause/Resume button (host only)
document.getElementById('pauseBtn')?.addEventListener('click', async () => {
    const currentPauseState = (await roomRef.child('isPaused').once('value')).val();
    const pauseBtn = document.getElementById('pauseBtn');

    if (currentPauseState) {
        // Currently paused, so resume
        await roomRef.update({ isPaused: false });
        if (pauseBtn) {
            pauseBtn.textContent = '⏸️ Pause';
        }
    } else {
        // Currently playing, so pause
        await roomRef.update({ isPaused: true });
        if (pauseBtn) {
            pauseBtn.textContent = '▶️ Resume';
        }
    }
});

// Skip button (host only) - advances to next question without scoring
document.getElementById('skipBtn')?.addEventListener('click', async () => {
    if (!isHost) return;

    if (confirm('Skip this question without scoring?')) {
        await advanceQuestion();
    }
});
