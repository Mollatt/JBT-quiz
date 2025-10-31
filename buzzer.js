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
roomRef.once('value').then(snapshot => {
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
        remainingTime = room.remainingTime || (currentQuestion.duration || 30);

        // Check if someone has already buzzed
        if (room.buzzedPlayer) {
            // Display the question first
            document.getElementById('currentQ').textContent = room.currentQ + 1;
            document.getElementById('questionText').textContent = currentQuestion.text;

            // Show remaining time
            document.getElementById('timeLeft').textContent = remainingTime;

            // Then show buzzer state
            handleBuzzed(room.buzzedPlayer);
        } else {
            // Normal question display
            displayQuestion(currentQuestion, room.currentQ);
        }

        // Check pause state
        if (room.isPaused) {
            isPaused = true;
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

        console.log('Buzz state changed:', buzzedPlayer, 'Current player:', playerName);

        if (buzzedPlayer) {
            // Someone buzzed
            handleBuzzed(buzzedPlayer);
        } else {
            // Buzz cleared - hide buzz display for everyone
            console.log('Buzz cleared, hiding buzz display');
            const buzzDisplay = document.getElementById('buzzDisplay');
            if (buzzDisplay) {
                buzzDisplay.style.display = 'none';
            }
        }
    });
}

function setupPauseListener() {
    roomRef.child('isPaused').on('value', (snapshot) => {
        const pausedState = snapshot.val();

        if (pausedState === true && !isPaused) {
            // Pause music and timer
            if (musicPlayer) {
                musicPlayer.pause();
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
        } else if (pausedState === false && isPaused) {
            // Resume music and timer
            if (musicPlayer && currentQuestion && currentQuestion.type === 'music') {
                musicPlayer.play();
                startQuestionTimer();
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

function displayQuestion(question, index) {
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
    }

    // Initialize and play music
    const musicPlayerEl = document.getElementById('musicPlayer');
    if (!musicPlayer) {
        musicPlayer = new YouTubePlayer('musicPlayer');  // FIXED: Correct capitalization
    }

    if (question.type === 'music' && question.youtubeUrl) {
        musicPlayer.load(question.youtubeUrl).then(() => {
            const duration = question.duration || 30;
            remainingTime = duration;

            // Play music with timer sync
            musicPlayer.playClip(question.startTime, duration, (remaining) => {
                // This callback is handled by the music player, but we'll use our own timer
            });

            // Start our own timer
            startQuestionTimer();
        }).catch(error => {
            console.error('Failed to load music:', error);
        });
    }
}

function startQuestionTimer() {
    if (questionTimer) {
        clearInterval(questionTimer);
    }

    questionTimer = setInterval(() => {
        remainingTime--;
        document.getElementById('timeLeft').textContent = remainingTime;

        // Time's up
        if (remainingTime <= 0) {
            clearInterval(questionTimer);
            questionTimer = null;
            handleTimeUp();
        }
    }, 1000);
}

// Player buzzes
document.getElementById('buzzerBtn')?.addEventListener('click', async () => {
    if (isLockedOut || isHost || isPaused) return;

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

    if (!buzzedPlayerName) {
        console.error('No player has buzzed');
        return;
    }

    // Check if player still exists in the room
    const playerSnapshot = await db.ref(`rooms/${gameCode}/players/${buzzedPlayerName}`).once('value');
    const playerData = playerSnapshot.val();

    if (!playerData) {
        console.error('Player', buzzedPlayerName, 'has left the game');
        alert('Player has left the game. Resuming quiz.');
        await resumeQuiz(null); // Pass null since player is gone
        return;
    }

    const newScore = (playerData.score || 0) - 250;

    await db.ref(`rooms/${gameCode}/players/${buzzedPlayerName}`).update({
        score: newScore,
        lastPoints: -250
    });


    // Resume quiz with lockout
    await resumeQuiz(buzzedPlayerName);
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
        await roomRef.update({ status: 'finished' });
    } else if (shouldShowScoreboard(nextQ, totalQ)) {
        await roomRef.update({
            currentQ: nextQ,
            status: 'scoreboard'
        });
    } else {
        await roomRef.update({ currentQ: nextQ });
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
