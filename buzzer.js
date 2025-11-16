// Get session data - UNCHANGED
const gameCode = sessionStorage.getItem('gameCode');
const playerName = sessionStorage.getItem('playerName');
const isHost = sessionStorage.getItem('isHost') === 'true';

if (!gameCode || !playerName) {
    window.location.href = 'index.html';
}

// CHANGED: Track subscriptions for cleanup
let roomSubscription = null;
let playerLockoutSubscription = null;

let currentQuestion = null;
let musicPlayer = null;
let isLockedOut = false;
let lockoutTimer = null;
let questionTimer = null;
let remainingTime = 0;
let isPaused = false;

// CHANGED: Load initial room data and setup subscriptions
getRoom(gameCode).then(async room => {
    if (!room) {
        window.location.href = 'index.html';
        return;
    }

    // Check if questions exist - UNCHANGED
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

    // Detect reload mid-session (non-host only)
    if (!isHost && room.status === 'playing' && room.currentQ !== undefined) {
        const reloadLockout = Date.now() + 5000; // 5s reload cooldown
        await updatePlayer(gameCode, playerName, { lockoutUntil: reloadLockout });
    }

    // CHANGED: Setup single room subscription
    setupRoomSubscription();
    setupLockoutListener();
});

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

// CHANGED: Setup room subscription
function setupRoomSubscription() {
    roomSubscription = subscribeToRoom(gameCode, async (room) => {
        if (!room) {
            console.warn('Room data is null, waiting for update...');
            return;
        }

        // Handle status changes
        if (room.status === 'finished') {
            window.location.href = 'results.html';
            return;
        } else if (room.status === 'scoreboard') {
            window.location.href = 'scoreboard.html';
            return;
        }

        // Handle question changes
        const qIndex = room.currentQ;
        
        if (qIndex === -1) return;

        if (qIndex >= room.questions.length) {
            if (isHost) {
                await updateRoom(gameCode, { status: 'finished' });
            }
            return;
        }

        // New question detected
        if (!currentQuestion || currentQuestion !== room.questions[qIndex]) {
            // Reset buzzer state for new question
            await updateRoom(gameCode, {
                buzzedPlayer: null,
                buzzTime: null,
                buzzerLocked: false,
                isPaused: false
            });

            // Reset player lockouts
            const players = room.players || {};
            const resetPromises = [];
            for (const pName in players) {
                resetPromises.push(
                    updatePlayer(gameCode, pName, { lockoutUntil: null })
                );
            }
            await Promise.all(resetPromises);

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

            displayQuestion(room.questions[qIndex], qIndex);
        }

        // Handle buzz state changes
        if (room.buzzedPlayer) {
            handleBuzzed(room.buzzedPlayer);
        } else {
            // Buzz was cleared
            handleBuzzCleared(room);
        }

        // Handle pause state changes
        handlePauseState(room.isPaused);
    });
}

// CHANGED: Handle buzz cleared
function handleBuzzCleared(room) {
    document.getElementById('buzzDisplay').style.display = 'none';
    document.getElementById('hostControls').style.display = 'none';

    // Show buzzer section for non-host, non-locked players
    if (!isHost && !isLockedOut && !isPaused) {
        document.getElementById('buzzerSection').style.display = 'block';
    }

    if (isHost) {
        document.getElementById('hostButtonsTop').style.display = 'block';
    }
}

// CHANGED: Handle pause state
function handlePauseState(pausedState) {
    if (pausedState === true) {
        // Pause music and timer
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
    } else {
        // Resume music and timer
        if (musicPlayer && currentQuestion && currentQuestion.type === 'music') {
            try {
                musicPlayer.play();
            } catch (e) {
                console.warn('musicPlayer.play failed', e);
            }

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
}

// CHANGED: Setup lockout listener
function setupLockoutListener() {
    playerLockoutSubscription = subscribeToRoomField(gameCode, `players.${playerName}.lockoutUntil`, async (lockoutUntil) => {
        const now = Date.now();
        const buzzerBtn = document.getElementById('buzzerBtn');
        const lockoutMsg = document.getElementById('lockoutMsg');
        if (!buzzerBtn || !lockoutMsg) return;

        // Clear any previous interval
        if (lockoutTimer) { 
            clearInterval(lockoutTimer); 
            lockoutTimer = null; 
        }

        if (lockoutUntil && now < lockoutUntil) {
            // Active lockout
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
                    updatePlayer(gameCode, playerName, { lockoutUntil: null });
                    if (!isPaused) {
                        buzzerBtn.disabled = false;
                        buzzerBtn.style.opacity = '1';
                    }
                } else {
                    document.getElementById('lockoutTime').textContent = remaining;
                }
            }, 1000);
        } else {
            // No lockout
            isLockedOut = false;
            lockoutMsg.style.display = 'none';
            if (!isPaused) {
                buzzerBtn.disabled = false;
                buzzerBtn.style.opacity = '1';
            }
        }
    });
}

function displayQuestion(question, index, opts = { autoPlay: true }) {
    currentQuestion = question;

    // Update question number - UNCHANGED
    document.getElementById('currentQ').textContent = index + 1;
    document.getElementById('questionText').textContent = question.text;

    // Hide all UI elements initially - UNCHANGED
    document.getElementById('buzzerSection').style.display = 'none';
    document.getElementById('buzzDisplay').style.display = 'none';
    document.getElementById('hostControls').style.display = 'none';
    document.getElementById('continueBtn').style.display = 'none';
    document.getElementById('resultsBtn').style.display = 'none';
    document.getElementById('lockoutMsg').style.display = 'none';

    // Show pause and skip buttons for host - UNCHANGED
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

    // Show buzzer for non-hosts - UNCHANGED
    if (!isHost) {
        document.getElementById('buzzerSection').style.display = 'block';
    } else {
        document.getElementById('hostButtonsTop').style.display = 'block';
    }

    // Initialize and play music - UNCHANGED
    const musicPlayerEl = document.getElementById('musicPlayer');
    if (!musicPlayer) {
        musicPlayer = new YouTubePlayer('musicPlayer');
    }

    if (question.type === 'music' && question.youtubeUrl && opts.autoPlay) {
        musicPlayer.load(question.youtubeUrl).then(() => {
            const duration = opts.remainingTime || question.duration || 30;
            remainingTime = duration;

            if (opts.autoPlay && !isPaused) {
                const startAt = opts.startAt || question.startTime || 0;
                musicPlayer.playClip(startAt, duration, () => { });
            }

            startQuestionTimer(duration);
        }).catch(error => {
            console.error('Failed to load music:', error);
        });
    }
}

let syncTimerInterval = null;

function startQuestionTimer() {
    if (questionTimer) clearInterval(questionTimer);
    if (syncTimerInterval) clearInterval(syncTimerInterval);

    questionTimer = setInterval(() => {
        remainingTime--;
        document.getElementById('timeLeft').textContent = remainingTime;
        if (remainingTime <= 0) {
            clearInterval(questionTimer);
            questionTimer = null;
            if (syncTimerInterval) clearInterval(syncTimerInterval);
            handleTimeUp();
        }
    }, 1000);

    // Periodically sync remaining time
    syncTimerInterval = setInterval(() => {
        updateRoom(gameCode, { remainingTime });
    }, 1000);
}

// CHANGED: Player buzzes
document.getElementById('buzzerBtn')?.addEventListener('click', async () => {
    if (isLockedOut || isHost || isPaused || remainingTime <= 0) return;

    const buzzTime = Date.now();

    // CHANGED: Try to set buzz (race condition handled by Supabase)
    const room = await getRoom(gameCode);
    
    if (!room.buzzedPlayer) {
        // First to buzz!
        await updateRoom(gameCode, {
            buzzedPlayer: playerName,
            buzzTime: buzzTime,
            buzzerLocked: true,
            isPaused: true
        });
    }
});

function handleBuzzed(buzzedPlayerName) {
    console.log('handleBuzzed called for:', buzzedPlayerName, 'isHost:', isHost);
    
    // Pause music and timer - UNCHANGED
    if (musicPlayer) {
        musicPlayer.pause();
    }
    if (questionTimer) {
        clearInterval(questionTimer);
        questionTimer = null;
        // CHANGED: Save remaining time to database
        updateRoom(gameCode, { remainingTime: remainingTime });
    }
    isPaused = true;
    
    // Show who buzzed - UNCHANGED
    const buzzDisplay = document.getElementById('buzzDisplay');
    const buzzedPlayerEl = document.getElementById('buzzedPlayer');
    if (buzzDisplay) {
        buzzDisplay.style.display = 'block';
    }
    if (buzzedPlayerEl) {
        buzzedPlayerEl.textContent = buzzedPlayerName;
    }
    
    // Hide buzzer for all non-host players - UNCHANGED
    if (!isHost) {
        const buzzerSection = document.getElementById('buzzerSection');
        if (buzzerSection) {
            buzzerSection.style.display = 'none';
        }
    }
    
    // Hide pause button for host - UNCHANGED
    if (isHost) {
        const hostButtons = document.getElementById('hostButtonsTop');
        if (hostButtons) {
            hostButtons.style.display = 'none';
        }
    }
    
    // Show host controls - UNCHANGED
    if (isHost) {
        document.getElementById('hostControls').style.display = 'block';
        document.getElementById('correctAnswer').textContent = currentQuestion.options[currentQuestion.correct];
    }
}

// CHANGED: Host clicks Correct
document.getElementById('correctBtn')?.addEventListener('click', async () => {
    const room = await getRoom(gameCode);
    const buzzedPlayerName = room.buzzedPlayer;

    if (!buzzedPlayerName) {
        console.error('No player has buzzed');
        return;
    }

    // Check if player still exists
    const playerData = room.players ? room.players[buzzedPlayerName] : null;

    if (!playerData) {
        console.error('Player', buzzedPlayerName, 'has left the game');
        alert('Player has left the game. Skipping to next question.');
        await advanceQuestion();
        return;
    }

    const newScore = (playerData.score || 0) + 1000;
    const correctCount = (playerData.correctCount || 0) + 1;

    await updatePlayer(gameCode, buzzedPlayerName, {
        score: newScore,
        correctCount: correctCount,
        lastPoints: 1000
    });

    // Move to next question
    await advanceQuestion();
});

// CHANGED: Host clicks Wrong
document.getElementById('wrongBtn')?.addEventListener('click', async () => {
    const room = await getRoom(gameCode);
    const buzzedPlayerName = room.buzzedPlayer;
    
    if (!buzzedPlayerName) return;

    const playerData = room.players ? room.players[buzzedPlayerName] : null;
    const newScore = (playerData?.score || 0) - 250;
    
    await updatePlayer(gameCode, buzzedPlayerName, {
        score: newScore,
        lastPoints: -250
    });

    // Get lockout duration from gameParams or default 3s
    const lockoutSec = room.gameParams?.buzzerLockoutTime ?? 3;
    const lockoutUntil = Date.now() + lockoutSec * 1000;

    // Write to DB so the player knows when they're free again
    await updatePlayer(gameCode, buzzedPlayerName, { lockoutUntil });

    // Clear buzz state + resume game
    await updateRoom(gameCode, {
        buzzedPlayer: null,
        buzzerLocked: false,
        isPaused: false
    });
});

function handleTimeUp() {
    // Stop music - UNCHANGED
    if (musicPlayer) {
        musicPlayer.stop();
    }

    // Hide buzzer - UNCHANGED
    document.getElementById('buzzerSection').style.display = 'none';

    // Hide pause and skip buttons - UNCHANGED
    if (isHost) {
        const hostButtons = document.getElementById('hostButtonsTop');
        if (hostButtons) {
            hostButtons.style.display = 'none';
        }
    }

    // Show continue button for host - CHANGED
    if (isHost) {
        getRoom(gameCode).then(room => {
            const nextQ = room.currentQ + 1;

            if (nextQ >= room.questions.length) {
                document.getElementById('resultsBtn').style.display = 'block';
            } else {
                document.getElementById('continueBtn').style.display = 'block';
            }
        });
    }
}

async function advanceQuestion() {
    const room = await getRoom(gameCode);

    const nextQ = room.currentQ + 1;
    const totalQ = room.questions.length;

    if (nextQ >= totalQ) {
        // Game finished
        await updateRoom(gameCode, { status: 'finished' });
    } else if (shouldShowScoreboard(nextQ, totalQ)) {
        // Mid-game scoreboard
        await updateRoom(gameCode, {
            currentQ: nextQ,
            status: 'scoreboard'
        });
    } else {
        // Advance to next question
        const nextQuestion = room.questions[nextQ];
        const duration = nextQuestion?.duration || 30;

        await updateRoom(gameCode, {
            currentQ: nextQ,
            questionStartTime: Date.now(),
            remainingTime: duration,
            isPaused: false
        });
    }
}

// Continue button (host only, after time runs out) - UNCHANGED
document.getElementById('continueBtn')?.addEventListener('click', async () => {
    await advanceQuestion();
});

// Results button (host only, after last question) - UNCHANGED
document.getElementById('resultsBtn')?.addEventListener('click', async () => {
    await updateRoom(gameCode, { status: 'finished' });
});

// CHANGED: Pause/Resume button (host only)
document.getElementById('pauseBtn')?.addEventListener('click', async () => {
    const room = await getRoom(gameCode);
    const currentPauseState = room.isPaused;
    const pauseBtn = document.getElementById('pauseBtn');

    if (currentPauseState) {
        // Currently paused, so resume
        await updateRoom(gameCode, { isPaused: false });
        if (pauseBtn) {
            pauseBtn.textContent = '⏸️ Pause';
        }
    } else {
        // Currently playing, so pause
        await updateRoom(gameCode, { isPaused: true });
        if (pauseBtn) {
            pauseBtn.textContent = '▶️ Resume';
        }
    }
});

// Skip button (host only) - UNCHANGED
document.getElementById('skipBtn')?.addEventListener('click', async () => {
    if (!isHost) return;

    if (confirm('Skip this question without scoring?')) {
        await advanceQuestion();
    }
});

// ADDED: Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (roomSubscription) unsubscribe(roomSubscription);
    if (playerLockoutSubscription) unsubscribe(playerLockoutSubscription);
});
