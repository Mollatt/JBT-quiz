const gameCode = sessionStorage.getItem('gameCode');
const playerName = sessionStorage.getItem('playerName');
const isHost = sessionStorage.getItem('isHost') === 'true';

console.log('Buzzer.js loaded:', { gameCode, playerName, isHost });

if (!gameCode || !playerName) {
    window.location.href = 'index.html';
}

if (typeof unsubscribe !== 'function') {
    console.error('unsubscribe function not found! Check db-helpers.js is loaded.');
}
// Track subscriptions for cleanup
let roomSubscription = null;

let currentQuestion = null;
let musicPlayer = null;
let isLockedOut = false;
let lockoutTimer = null;
let questionTimer = null;
let remainingTime = 0;
let isPaused = false;
let displayedQuestionIndex = -1; // Track displayed question

// FEATURE 8: Function to update score display
function updateScoreDisplay(score) {
    const scoreEl = document.getElementById('currentScore');
    if (scoreEl) {
        scoreEl.textContent = score || 0;
    }
}

// FEATURE 8: Initialize score display (show/hide based on host status)
function initializeScoreDisplay() {
    const scoreDisplay = document.getElementById('scoreDisplay');
    if (!scoreDisplay) return;

    if (isHost) {
        scoreDisplay.style.display = 'none';
    } else {
        scoreDisplay.style.display = 'block';

        // Load initial score
        getRoom(gameCode).then(room => {
            if (room && room.players && room.players[playerName]) {
                updateScoreDisplay(room.players[playerName].score || 0);
            }
        });
    }
}

// Load initial room data
console.log('Fetching initial room data...');
getRoom(gameCode).then(async room => {
    console.log('Initial room data:', room);

    if (!room) {
        console.error('No room found, redirecting to index');
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

    const roomCodeDisplayDiv = document.getElementById('roomCodeDisplay');
    const roomCodeText = document.getElementById('roomCodeText');
    if (isHost && roomCodeDisplayDiv && roomCodeText) {
        roomCodeDisplayDiv.style.display = 'block';
        roomCodeText.textContent = gameCode;
    }

    initializeScoreDisplay();

    // Check if in the middle of a question
    if (room.currentQ >= 0 && room.currentQ < room.questions.length) {
        console.log('Resuming question', room.currentQ);
        currentQuestion = room.questions[room.currentQ];
        displayedQuestionIndex = room.currentQ;

        const duration = currentQuestion.duration || 30;
        remainingTime = room.remainingTime || duration;
        isPaused = !!room.isPaused;

        if (room.buzzedPlayer) {
            console.log('Player already buzzed:', room.buzzedPlayer);
            handleBuzzed(room.buzzedPlayer);
        } else {
            console.log('Displaying current question');
            displayQuestion(currentQuestion, room.currentQ, {
                autoPlay: !isPaused,
                startAt: currentQuestion.startTime || 0,
                remainingTime: remainingTime
            });
        }

        if (isPaused) {
            console.log('Game is paused');
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

    if (!isHost && room.status === 'playing' && room.currentQ >= 0) {
        const playerData = room.players ? room.players[playerName] : null;
        const now = Date.now();

        const hasPlayerHistory = playerData && (
            playerData.score > 0 ||
            playerData.correctCount > 0 ||
            playerData.answered === true
        );

        const questionAge = room.questionStartTime ? (now - room.questionStartTime) : 0;
        const questionIsOld = questionAge > 5000; // Question has been running >5 seconds

        const isLikelyReload = hasPlayerHistory || questionIsOld || room.buzzedPlayer;

        if (isLikelyReload) {
            // Only set reload lockout if player isn't already locked out
            if (!playerData?.lockoutUntil || playerData.lockoutUntil < now) {
                const reloadLockout = now + 3000; // 3s reload cooldown
                console.log('Setting reload lockout for page refresh (player has history or question is old)');
                await updatePlayer(gameCode, playerName, { lockoutUntil: reloadLockout });
            } else {
                console.log('Player already locked out, maintaining existing lockout');
            }
        } else {
            console.log('Fresh question start or just returned from scoreboard, no reload lockout');
        }
    }

    // Setup subscriptions
    setupRoomSubscription();
    //  setupLockoutListener();
}).catch(error => {
    console.error('Error loading initial room:', error);
    alert('Failed to load game');
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

function setupRoomSubscription() {
    console.log('Setting up room subscription');

    roomSubscription = subscribeToRoom(gameCode, async (room) => {
        console.log('Room update received:', room);

        if (!room) {
            console.warn('Room data is null');
            return;
        }
        // Handle lockout for this player
        if (!isHost && room.players && room.players[playerName]) {
            const playerData = room.players[playerName];
            handlePlayerLockout(playerData.lockoutUntil);
        }
        if (!isHost && room.players && room.players[playerName]) {
            const playerData = room.players[playerName];
            updateScoreDisplay(playerData.score || 0);
        }
        // Handle status changes
        if (room.status === 'finished') {
            console.log('Game finished, redirecting');
            window.location.href = 'results.html';
            return;
        } else if (room.status === 'scoreboard') {
            console.log('Going to scoreboard');
            window.location.href = 'scoreboard.html';
            return;
        }

        const qIndex = room.currentQ;
        console.log('Current question index:', qIndex, 'Displayed:', displayedQuestionIndex);

        if (qIndex === -1) return;

        if (qIndex >= room.questions.length) {
            console.log('No more questions');
            if (isHost) {
                await updateRoom(gameCode, { status: 'finished' });
            }
            return;
        }

        // New question detected
        if (qIndex !== displayedQuestionIndex) {
            console.log('NEW QUESTION DETECTED:', qIndex);
            displayedQuestionIndex = qIndex;

            // Reset state
            currentQuestion = null;
            isLockedOut = false;
            isPaused = false;
            remainingTime = 0;

            if (lockoutTimer) {
                clearInterval(lockoutTimer);
                lockoutTimer = null;
            }
            if (questionTimer) {
                clearInterval(questionTimer);
                questionTimer = null;
            }
            /*if (musicPlayer) {
                try {
                    musicPlayer.stop();
                } catch (e) {
                    console.warn('Could not stop music:', e);
                }
            }*/

            currentQuestion = room.questions[qIndex];
            displayQuestion(currentQuestion, qIndex);
        }

        // Handle buzz state
        if (room.buzzedPlayer) {
            console.log('Buzz detected:', room.buzzedPlayer);
            handleBuzzed(room.buzzedPlayer);
        } else if (document.getElementById('buzzDisplay').style.display !== 'none') {
            console.log('Buzz cleared');
            handleBuzzCleared(room);
        }

        // Handle pause state
        if (room.isPaused !== isPaused) {
            console.log('Pause state changed:', room.isPaused);
            handlePauseState(room.isPaused);
        }
    });
}

function handlePlayerLockout(lockoutUntil) {
    const now = Date.now();
    const buzzerBtn = document.getElementById('buzzerBtn');
    const lockoutMsg = document.getElementById('lockoutMsg');

    if (!buzzerBtn || !lockoutMsg) return;

    if (lockoutTimer) {
        clearInterval(lockoutTimer);
        lockoutTimer = null;
    }

    if (lockoutUntil && now < lockoutUntil) {
        console.log('Player locked out until:', new Date(lockoutUntil));
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
                console.log('Lockout ended');
                if (!isPaused) {
                    buzzerBtn.disabled = false;
                    buzzerBtn.style.opacity = '1';
                }
            } else {
                document.getElementById('lockoutTime').textContent = remaining;
            }
        }, 1000);
    } else {
        isLockedOut = false;
        lockoutMsg.style.display = 'none';
        if (!isPaused) {
            buzzerBtn.disabled = false;
            buzzerBtn.style.opacity = '1';
        }
    }
}
function handleBuzzCleared(room) {
    console.log('handleBuzzCleared');
    document.getElementById('buzzDisplay').style.display = 'none';
    document.getElementById('hostControls').style.display = 'none';

    if (!isHost && !isLockedOut && !isPaused) {
        document.getElementById('buzzerSection').style.display = 'block';
    }

    if (isHost) {
        document.getElementById('hostButtonsTop').style.display = 'block';
    }
}

function handlePauseState(pausedState) {
    console.log('handlePauseState:', pausedState);

    if (pausedState === true) {
        if (musicPlayer && typeof musicPlayer.pause === 'function') {
            try {
                musicPlayer.pause();
                console.log('Music paused');
            } catch (e) {
                console.warn('musicPlayer.pause failed', e);
            }
        }
        if (questionTimer) {
            clearInterval(questionTimer);
            questionTimer = null;
            console.log('Timer paused');
        }
        isPaused = true;

        if (!isHost) {
            const buzzerBtn = document.getElementById('buzzerBtn');
            if (buzzerBtn) {
                buzzerBtn.disabled = true;
                buzzerBtn.style.opacity = '0.5';
            }
        }
    } else {
        if (musicPlayer && currentQuestion && currentQuestion.type === 'music') {
            try {
                musicPlayer.play();
                console.log('Music resumed');
            } catch (e) {
                console.warn('musicPlayer.play failed', e);
            }

            if (!questionTimer) {
                startQuestionTimer();
                console.log('Timer resumed');
            }
        }

        isPaused = false;

        if (!isHost && !isLockedOut) {
            const buzzerBtn = document.getElementById('buzzerBtn');
            if (buzzerBtn) {
                buzzerBtn.disabled = false;
                buzzerBtn.style.opacity = '1';
            }
        }
    }
}

/*function setupLockoutListener() {
    console.log('Setting up lockout listener for player:', playerName);

    // Subscribe to entire room and extract player lockout
    const lockoutSub = subscribeToRoom(gameCode, async (room) => {
        if (!room || !room.players) return;

        const playerData = room.players[playerName];
        if (!playerData) return;

        const lockoutUntil = playerData.lockoutUntil;
        const now = Date.now();
        const buzzerBtn = document.getElementById('buzzerBtn');
        const lockoutMsg = document.getElementById('lockoutMsg');

        if (!buzzerBtn || !lockoutMsg) return;

        if (lockoutTimer) {
            clearInterval(lockoutTimer);
            lockoutTimer = null;
        }

        if (lockoutUntil && now < lockoutUntil) {
            console.log('Player locked out until:', new Date(lockoutUntil));
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
                    console.log('Lockout ended');
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
            isLockedOut = false;
            lockoutMsg.style.display = 'none';
            if (!isPaused) {
                buzzerBtn.disabled = false;
                buzzerBtn.style.opacity = '1';
            }
        }
    });
}*/

function displayQuestion(question, index, opts = { autoPlay: true }) {
    console.log('displayQuestion called:', { question: question.text, index, opts });
    currentQuestion = question;

    const duration = opts.remainingTime || question.duration || 30;
    remainingTime = duration;

    console.log('Setting initial remaining time to:', remainingTime);

    document.getElementById('currentQ').textContent = index + 1;
    document.getElementById('questionText').textContent = question.text;

    document.getElementById('timeLeft').textContent = remainingTime;

    // Hide all UI elements initially
    document.getElementById('buzzerSection').style.display = 'none';
    document.getElementById('buzzDisplay').style.display = 'none';
    document.getElementById('hostControls').style.display = 'none';
    document.getElementById('continueBtn').style.display = 'none';
    document.getElementById('resultsBtn').style.display = 'none';
    document.getElementById('lockoutMsg').style.display = 'none';

    // Show appropriate UI
    if (isHost) {
        const hostButtons = document.getElementById('hostButtonsTop');
        if (hostButtons) {
            hostButtons.style.display = 'block';
        }
        const pauseBtn = document.getElementById('pauseBtn');
        if (pauseBtn) {
            pauseBtn.textContent = '⏸️ Pause';
        }
    } else {
        document.getElementById('buzzerSection').style.display = 'block';
    }

    // Setup music player
    if (!musicPlayer) {
        console.log('Creating music player');
        musicPlayer = new YouTubePlayer('musicPlayer');
    }

    if (question.type === 'music' && question.youtubeUrl) {
        console.log('Loading music:', question.youtubeUrl);

        musicPlayer.load(question.youtubeUrl).then(() => {
            console.log('Music loaded successfully');
            const duration = opts.remainingTime || question.duration || 30;
            remainingTime = duration;
            document.getElementById('timeLeft').textContent = remainingTime;

            if (opts.autoPlay && !isPaused) {
                const startAt = opts.startAt || question.startTime || 0;
                console.log('Playing music from', startAt, 'for', duration, 'seconds');
                musicPlayer.playClip(startAt, duration, (remaining) => {
                    // Timer callback
                });
            }

            startQuestionTimer();
        }).catch(error => {
            console.error('Failed to load music:', error);
            alert('Music failed to load: ' + error.message);
        });
    } else {
        console.log('No music for this question');
        const duration = opts.remainingTime || 30;
        remainingTime = duration;
        document.getElementById('timeLeft').textContent = remainingTime;
        startQuestionTimer();
    }
}

function startQuestionTimer() {
    console.log('Starting question timer with', remainingTime, 'seconds');

    if (questionTimer) {
        clearInterval(questionTimer);
    }

    questionTimer = setInterval(() => {
        remainingTime--;
        document.getElementById('timeLeft').textContent = remainingTime;

        if (remainingTime <= 0) {
            console.log('Timer reached 0');
            clearInterval(questionTimer);
            questionTimer = null;
            handleTimeUp();
        }
    }, 1000);
}

// Player buzzes
document.getElementById('buzzerBtn')?.addEventListener('click', async () => {
    console.log('Buzzer clicked!', { isLockedOut, isHost, isPaused, remainingTime });

    if (isLockedOut || isHost || isPaused || remainingTime <= 0) {
        console.log('Buzz blocked');
        return;
    }

    const buzzTime = Date.now();
    console.log('Attempting to buzz at', buzzTime);

    try {
        const room = await getRoom(gameCode);

        if (!room.buzzedPlayer) {
            console.log('First to buzz! Setting buzz state');
            await updateRoom(gameCode, {
                buzzedPlayer: playerName,
                buzzTime: buzzTime,
                buzzerLocked: true,
                isPaused: true
            });
        } else {
            console.log('Someone else buzzed first:', room.buzzedPlayer);
        }
    } catch (error) {
        console.error('Error buzzing:', error);
    }
});

function handleBuzzed(buzzedPlayerName) {
    console.log('handleBuzzed called for:', buzzedPlayerName);

    if (musicPlayer) {
        musicPlayer.pause();
    }
    if (questionTimer) {
        clearInterval(questionTimer);
        questionTimer = null;
        updateRoom(gameCode, { remainingTime: remainingTime });
    }
    isPaused = true;

    const buzzDisplay = document.getElementById('buzzDisplay');
    const buzzedPlayerEl = document.getElementById('buzzedPlayer');
    if (buzzDisplay) {
        buzzDisplay.style.display = 'block';
    }
    if (buzzedPlayerEl) {
        buzzedPlayerEl.textContent = buzzedPlayerName;
    }

    if (!isHost) {
        const buzzerSection = document.getElementById('buzzerSection');
        if (buzzerSection) {
            buzzerSection.style.display = 'none';
        }
    }

    if (isHost) {
        const hostButtons = document.getElementById('hostButtonsTop');
        if (hostButtons) {
            hostButtons.style.display = 'none';
        }
        document.getElementById('hostControls').style.display = 'block';
        document.getElementById('correctAnswer').textContent = currentQuestion.options[currentQuestion.correct];
    }
}

// Host clicks Correct
document.getElementById('correctBtn')?.addEventListener('click', async () => {
    console.log('Correct button clicked');

    const room = await getRoom(gameCode);
    const buzzedPlayerName = room.buzzedPlayer;

    if (!buzzedPlayerName) {
        console.error('No player has buzzed');
        return;
    }

    const playerData = room.players ? room.players[buzzedPlayerName] : null;

    if (!playerData) {
        console.error('Player left the game');
        //Should resume the game automatically instead of advancing. 
        //Should check if there are any players left first.
        //If yes, resume the game. If no, end the game.
        //Check handling in wrongBtn as well.
        alert('Player has left the game. Resuming question.');
        await updateRoom(gameCode, {
            buzzedPlayer: null,
            buzzerLocked: false,
            isPaused: false
        });
        return;
    }

    const newScore = (playerData.score || 0) + 1000;
    const correctCount = (playerData.correctCount || 0) + 1;

    console.log('Awarding points to', buzzedPlayerName, ':', newScore);
    await updatePlayer(gameCode, buzzedPlayerName, {
        score: newScore,
        correctCount: correctCount,
        lastPoints: 1000
    });
    /* Check clear handlers in handleBuzzCleared as well as next question advancement.
    Replace advanceQuestion with the updateRoom logic under (in addition to advanceQ)?
    Check for and remove any duplicate code and double handlers in other functions.
    
        await updateRoom(gameCode, {
            buzzedPlayer: null,
            buzzerLocked: false,
            isPaused: false
        });*/
    await advanceQuestion();
});

// Host clicks Wrong
document.getElementById('wrongBtn')?.addEventListener('click', async () => {
    console.log('Wrong button clicked');

    const room = await getRoom(gameCode);
    const buzzedPlayerName = room.buzzedPlayer;

    if (!buzzedPlayerName) return;

    const playerData = room.players ? room.players[buzzedPlayerName] : null;
    const newScore = (playerData?.score || 0) - 250;

    console.log('Deducting points from', buzzedPlayerName, ':', newScore);

    await updatePlayer(gameCode, buzzedPlayerName, {
        score: newScore,
        lastPoints: -250
    });

    const lockoutSec = room.gameParams?.buzzerLockoutTime ?? 3;
    const lockoutUntil = Date.now() + lockoutSec * 1000;

    console.log('Setting lockout for', buzzedPlayerName, 'until', new Date(lockoutUntil));

    await updatePlayer(gameCode, buzzedPlayerName, { lockoutUntil });

    await updateRoom(gameCode, {
        buzzedPlayer: null,
        buzzerLocked: false,
        isPaused: false
    });
});

function handleTimeUp() {
    console.log('Time up!');

    if (musicPlayer) {
        musicPlayer.stop();
    }

    document.getElementById('buzzerSection').style.display = 'none';

    if (isHost) {
        const hostButtons = document.getElementById('hostButtonsTop');
        if (hostButtons) {
            hostButtons.style.display = 'none';
        }

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
    console.log('Advancing question');

    const room = await getRoom(gameCode);

    const nextQ = room.currentQ + 1;
    const totalQ = room.questions.length;

    console.log('Next question:', nextQ, 'Total:', totalQ);

    if (nextQ >= totalQ) {
        console.log('Game finished');
        await updateRoom(gameCode, { status: 'finished' });
    } else if (shouldShowScoreboard(nextQ, totalQ)) {
        console.log('Going to scoreboard');
        await updateRoom(gameCode, {
            currentQ: nextQ,
            status: 'scoreboard'
        });
    } else {
        console.log('Next question');
        const nextQuestion = room.questions[nextQ];
        const duration = nextQuestion?.duration || 30;

        await updateRoom(gameCode, {
            currentQ: nextQ,
            questionStartTime: Date.now(),
            remainingTime: duration,
            isPaused: false,
            buzzedPlayer: null,
            buzzerLocked: false,
            buzzTime: null
        });
    }
}

document.getElementById('continueBtn')?.addEventListener('click', async () => {
    console.log('Continue button clicked');
    await advanceQuestion();
});

document.getElementById('resultsBtn')?.addEventListener('click', async () => {
    console.log('Results button clicked');
    await updateRoom(gameCode, { status: 'finished' });
});

document.getElementById('pauseBtn')?.addEventListener('click', async () => {
    console.log('Pause button clicked');

    const room = await getRoom(gameCode);
    const currentPauseState = room.isPaused;
    const pauseBtn = document.getElementById('pauseBtn');

    if (currentPauseState) {
        console.log('Resuming');
        await updateRoom(gameCode, { isPaused: false });
        if (pauseBtn) {
            pauseBtn.textContent = '⏸️ Pause';
        }
    } else {
        console.log('Pausing');
        await updateRoom(gameCode, { isPaused: true });
        if (pauseBtn) {
            pauseBtn.textContent = '▶️ Resume';
        }
    }
});

document.getElementById('skipBtn')?.addEventListener('click', async () => {
    console.log('Skip button clicked');

    if (!isHost) return;

    if (confirm('Skip this question without scoring?')) {
        await updateRoom(gameCode, {
            isPaused: false,
            buzzedPlayer: null,
            buzzerLocked: false
        });
        await advanceQuestion();
    }
});

window.addEventListener('beforeunload', () => {
    console.log('Page unloading, cleaning up');
    if (roomSubscription) unsubscribe(roomSubscription);
});
