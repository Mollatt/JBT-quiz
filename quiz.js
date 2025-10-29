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
let selectedAnswer = null;
let hasAnswered = false;
let answerCheckListener = null;
let musicPlayer = null;
let currentRoom = null;

// Load initial room data
roomRef.once('value').then(snapshot => {
    const room = snapshot.val();
    if (!room) {
        window.location.href = 'index.html';
        return;
    }

    currentRoom = room;
    document.getElementById('totalQ').textContent = room.questions.length;

    setupQuestionListener(room);
    setupStatusListener();

    if (room.mode === 'auto') {
        setupAutoMode(room);
    }
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

function setupQuestionListener(room) {
    roomRef.child('currentQ').on('value', async (snapshot) => {
        const qIndex = snapshot.val();

        if (qIndex === -1) return;

        // Check if quiz is finished
        if (qIndex >= room.questions.length) {
            await roomRef.update({ status: 'finished' });
            return;
        }

        // Clear any existing timer
        if (window.currentTimerInterval) {
            clearInterval(window.currentTimerInterval);
            window.currentTimerInterval = null;
        }

        // Reset calculation flag
        window.resultsCalculated = false;

        // Reset state for new question
        hasAnswered = false;
        selectedAnswer = null;

        // Stop previous answer listener if exists
        if (answerCheckListener) {
            playersRef.off('value', answerCheckListener);
            answerCheckListener = null;
        }

        // Clear previous answer and timing data
        await playerRef.update({
            answer: null,
            answerTime: null,
            lastPoints: 0,
            answered: false
        });

        // Reload room data
        const roomSnap = await roomRef.once('value');
        currentRoom = roomSnap.val();

        // Load and display question
        displayQuestion(currentRoom.questions[qIndex], qIndex);
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

function setupAutoMode(room) {
    if (!isHost) return;

    window.autoModeTimerInterval = null;

    roomRef.child('currentQ').on('value', async (snapshot) => {
        const qIndex = snapshot.val();

        if (qIndex === -1 || qIndex >= room.questions.length) {
            if (window.autoModeTimerInterval) {
                clearInterval(window.autoModeTimerInterval);
                window.autoModeTimerInterval = null;
            }
            return;
        }

        if (window.autoModeTimerInterval) {
            clearInterval(window.autoModeTimerInterval);
            window.autoModeTimerInterval = null;
        }

        await new Promise(resolve => setTimeout(resolve, 500));

        let timeLeft = room.timePerQuestion;
        let resultsShown = false;
        
        window.autoModeTimerInterval = setInterval(async () => {
            timeLeft--;

            if (timeLeft <= 0 && !resultsShown) {
                resultsShown = true;
                clearInterval(window.autoModeTimerInterval);
                window.autoModeTimerInterval = null;

                await forceShowResults();

                setTimeout(async () => {
                    const currentQCheck = await roomRef.child('currentQ').once('value');
                    if (currentQCheck.val() !== qIndex) {
                        return;
                    }
                    
                    const nextQ = qIndex + 1;
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
                }, 3000);
            }
        }, 1000);
    });
}

function displayQuestion(question, index) {
    currentQuestion = question;

    document.getElementById('currentQ').textContent = index + 1;
    document.getElementById('questionText').textContent = question.text;

    document.getElementById('feedback').style.display = 'none';
    document.getElementById('nextBtn').style.display = 'none';
    document.getElementById('resultsBtn').style.display = 'none';
    document.getElementById('waitingMsg').style.display = 'none';

    const progressEl = document.getElementById('answerProgress');
    progressEl.textContent = 'Waiting for answers...';
    progressEl.style.display = 'block';

    const musicPlayerEl = document.getElementById('musicPlayer');
    if (question.type === 'music') {
        musicPlayerEl.style.display = 'none';
        
        if (!musicPlayer) {
            musicPlayer = new YouTubePlayer('musicPlayer');
        }
        
        musicPlayer.load(question.youtubeUrl).then(() => {
            const duration = question.duration || 30;
            
            musicPlayer.playClip(question.startTime, duration, (remaining) => {
                const timerEl = document.getElementById('timeLeft');
                if (timerEl) {
                    timerEl.textContent = remaining;
                }
            });
            
        }).catch(error => {
            console.error('Failed to load music:', error);
            document.getElementById('questionText').innerHTML += '<br><span style="color: #ff6b6b; font-size: 0.9rem;">⚠️ Music failed to load</span>';
        });
    } else {
        musicPlayerEl.style.display = 'none';
        if (musicPlayer) {
            musicPlayer.stop();
        }
    }

    const container = document.getElementById('answersContainer');
    container.innerHTML = question.options.map((option, i) => `
        <button class="answer-btn" data-index="${i}">
            ${option}
        </button>
    `).join('');

    document.querySelectorAll('.answer-btn').forEach(btn => {
        btn.addEventListener('click', () => handleAnswer(parseInt(btn.dataset.index)));
    });

    playerRef.once('value', snapshot => {
        const playerData = snapshot.val();
        if (playerData && playerData.answered === true) {
            hasAnswered = true;
            selectedAnswer = playerData.answer;

            document.querySelectorAll('.answer-btn').forEach(btn => {
                btn.disabled = true;
            });

            if (playerData.answer !== null && playerData.answer !== undefined) {
                document.querySelectorAll('.answer-btn')[playerData.answer].classList.add('selected');
            }

            checkAllAnswered();
        }
    });

    const timerDisplay = document.getElementById('timerDisplay');
    if (question.type === 'music') {
        timerDisplay.style.display = 'block';
        const duration = question.duration || 30;
        document.getElementById('timeLeft').textContent = duration;
    } else if (currentRoom.mode === 'auto') {
        timerDisplay.style.display = 'block';
        startTimerDisplay();
    } else {
        timerDisplay.style.display = 'block';
        startHostTimer();
    }
}

function startTimerDisplay() {
    roomRef.child('timePerQuestion').once('value', snapshot => {
        let timeLeft = snapshot.val() || 30;
        const timerEl = document.getElementById('timeLeft');
        timerEl.textContent = timeLeft;

        const interval = setInterval(() => {
            timeLeft--;
            timerEl.textContent = Math.max(0, timeLeft);

            if (timeLeft <= 0) {
                clearInterval(interval);
            }
        }, 1000);

        window.currentTimerInterval = interval;
    });
}

function startHostTimer() {
    roomRef.child('hostTimerDuration').once('value', snapshot => {
        let timeLeft = snapshot.val() || 60;
        const timerEl = document.getElementById('timeLeft');
        timerEl.textContent = timeLeft;

        const interval = setInterval(() => {
            timeLeft--;
            timerEl.textContent = Math.max(0, timeLeft);

            if (timeLeft <= 0) {
                clearInterval(interval);
                document.getElementById('waitingMsg').textContent = "Time's up! Waiting for host...";
                document.getElementById('waitingMsg').style.display = 'block';
            }
        }, 1000);

        window.currentTimerInterval = interval;
    });
}

async function handleAnswer(answerIndex) {
    if (hasAnswered) return;

    hasAnswered = true;
    selectedAnswer = answerIndex;

    document.querySelectorAll('.answer-btn').forEach(btn => {
        btn.disabled = true;
    });

    document.querySelectorAll('.answer-btn')[answerIndex].classList.add('selected');

    const answerTime = Date.now();

    try {
        const playerSnapshot = await playerRef.once('value');
        const playerData = playerSnapshot.val();

        if (!playerData) {
            console.error('Player data not found');
            return;
        }

        await playerRef.update({
            answer: answerIndex,
            answerTime: answerTime,
            answered: true
        });

        checkAllAnswered();

    } catch (error) {
        console.error('Error saving answer:', error);
    }
}

function checkAllAnswered() {
    answerCheckListener = playersRef.on('value', async (snapshot) => {
        const players = snapshot.val();
        if (!players) return;

        const playerArray = Object.values(players);
        const answeredCount = playerArray.filter(p => p.answered === true).length;
        const totalPlayers = playerArray.length;

        const progressMsg = document.getElementById('answerProgress');
        if (progressMsg) {
            progressMsg.textContent = `${answeredCount}/${totalPlayers} players answered`;
        }

       if (answeredCount === totalPlayers) {
            console.log('[DEBUG] All players answered. Triggering calculateAndShowResults.');
            playersRef.off('value', answerCheckListener);
            answerCheckListener = null;
            await calculateAndShowResults(players);
        }
    });
}

async function forceShowResults() {
    const snapshot = await playersRef.once('value');
    const players = snapshot.val();
    if (players) {
        await calculateAndShowResults(players);
    }
}

async function calculateAndShowResults(players) {
    console.log('[DEBUG] calculateAndShowResults called. players:', Object.keys(players).length);
    if (window.resultsCalculated) {
        showFeedback(selectedAnswer === currentQuestion.correct);
        return;
    }
    window.resultsCalculated = true;

    const roomSnap = await roomRef.once('value');
    currentRoom = roomSnap.val();
    const resultFlagRef = roomRef.child(`resultsCalculated/${currentRoom.currentQ}`);

    const flagSnap = await resultFlagRef.once('value');
    if (flagSnap.exists()) {
        showFeedback(selectedAnswer === currentQuestion.correct);
        return;
    }

    await resultFlagRef.set(true);

    if (window.currentTimerInterval) {
        clearInterval(window.currentTimerInterval);
        window.currentTimerInterval = null;
    }
    
    if (window.autoModeTimerInterval) {
        clearInterval(window.autoModeTimerInterval);
        window.autoModeTimerInterval = null;
    }
    
    if (musicPlayer && currentQuestion.type === 'music') {
        musicPlayer.stop();
    }

    const correctAnswers = Object.entries(players)
        .filter(([name, data]) => {
            return data.answer === currentQuestion.correct &&
                data.answered === true &&
                data.answerTime != null;
        })
        .sort((a, b) => (a[1].answerTime || Infinity) - (b[1].answerTime || Infinity));

    const pointsScale = [1000, 800, 600, 400];
    const updates = {};

    for (let i = 0; i < correctAnswers.length; i++) {
        const [name, data] = correctAnswers[i];
        const points = i < pointsScale.length ? pointsScale[i] : 400;
        const currentScore = data.score || 0;
        const newScore = currentScore + points;
        const correctCount = (data.correctCount || 0) + 1;

        updates[`rooms/${gameCode}/players/${name}/score`] = newScore;
        updates[`rooms/${gameCode}/players/${name}/lastPoints`] = points;
        updates[`rooms/${gameCode}/players/${name}/correctCount`] = correctCount;
    }

    if (Object.keys(updates).length > 0) {
        await db.ref().update(updates);
    }

    await new Promise(resolve => setTimeout(resolve, 300));

    const isCorrect = selectedAnswer === currentQuestion.correct;
    console.log('[DEBUG] Calling showFeedback, isCorrect:', isCorrect);
    showFeedback(isCorrect);
    
    if (isHost && currentRoom.mode === 'auto') {
        setTimeout(async () => {
            const currentQCheck = await roomRef.child('currentQ').once('value');
            const currentQ = currentQCheck.val();
            
            const nextQ = currentQ + 1;
            const totalQ = currentRoom.questions.length;
            
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
        }, 3000);
    }
}

function showFeedback(isCorrect) {
    console.log('[DEBUG] showFeedback triggered. isCorrect:', isCorrect, 'isHost:', isHost, 'mode:', currentRoom?.mode);
    console.log('showFeedback called, isHost:', isHost, 'mode:', currentRoom?.mode);
    
    const feedbackEl = document.getElementById('feedback');
    const buttons = document.querySelectorAll('.answer-btn');

    if (buttons[currentQuestion.correct]) {
        buttons[currentQuestion.correct].classList.add('correct');
    }

    if (!isCorrect && selectedAnswer !== null && selectedAnswer !== undefined && buttons[selectedAnswer]) {
        buttons[selectedAnswer].classList.add('incorrect');
    }

    document.getElementById('answerProgress').style.display = 'none';

    playerRef.once('value', snapshot => {
        const playerData = snapshot.val();
        const points = playerData.lastPoints || 0;
        const currentScore = playerData.score || 0;

        if (isCorrect) {
            feedbackEl.innerHTML = `✅ Correct! <strong>+${points} points</strong><br>Total: ${currentScore}`;
            feedbackEl.className = 'feedback correct';
        } else {
            feedbackEl.innerHTML = `❌ Wrong! Correct answer: <strong>${currentQuestion.options[currentQuestion.correct]}</strong><br>Total: ${currentScore}`;
            feedbackEl.className = 'feedback incorrect';
        }
        feedbackEl.style.display = 'block';

        // Show buttons - use currentRoom which is already loaded
        const nextQ = currentRoom.currentQ + 1;
        const totalQuestions = currentRoom.questions.length;
        console.log('Determining which button to show. NextQ:', nextQ, 'Total:', totalQuestions);

        if (currentRoom.mode === 'host') {
            if (nextQ >= totalQuestions) {
                // Last question: only the host gets the results button, others wait
                if (isHost) {
                    console.log('Showing results button (host)');
                    document.getElementById('resultsBtn').style.display = 'block';
                } else {
                    console.log('Showing waiting message (non-host, last question)');
                    document.getElementById('waitingMsg').style.display = 'block';
                }
            } else {
                console.log('[DEBUG] Showing NEXT button now');
                // Not the last question: show NEXT to everyone (so any player may start the countdown)
                console.log('Showing next button to everyone');
                document.getElementById('nextBtn').style.display = 'block';
            }
        } else if (currentRoom.mode === 'auto') {
            console.log('Auto mode - showing waiting message');
            document.getElementById('waitingMsg').textContent = 'Next question starting soon...';
            document.getElementById('waitingMsg').style.display = 'block';
        }


    });
}
// ---------------- Shared countdown (all players) ----------------
let countdownIntervalId = null;

// Path under the room that stores countdown state for this question
const countdownRef = roomRef.child('nextCountdown');

/**
 * Request to start the shared countdown (writes to DB).
 * If a countdown already exists this will restart it (update endsAt).
 */
function requestStartCountdown(seconds = 3) {
    const endsAt = Date.now() + seconds * 1000;
    countdownRef.set({ active: true, endsAt, startedBy: playerName }).catch(err => {
        console.error('Failed to write countdown state:', err);
    });
}

/** Request to stop (cancel) the shared countdown for everyone */
function requestStopCountdown() {
    countdownRef.set({ active: false }).catch(err => {
        console.error('Failed to cancel countdown state:', err);
    });
}

/** Clear local interval/UI for the countdown */
function clearLocalCountdownUI() {
    if (countdownIntervalId) {
        clearInterval(countdownIntervalId);
        countdownIntervalId = null;
    }
    document.getElementById('nextCountdown').style.display = 'none';
    // ensure nextBtn visibility re-evaluated by re-calling showFeedback? We keep UI simple:
    // If the question results are still visible show nextBtn again (calculated in showFeedback),
    // otherwise waitingMsg will appear based on other logic.
}

/** Start a local countdown UI using ms remaining */
function startLocalCountdownUI(msRemaining) {
    clearLocalCountdownUI();
    const sec = Math.max(0, Math.ceil(msRemaining / 1000));
    const nextCountdownEl = document.getElementById('nextCountdown');
    const nextCountdownTime = document.getElementById('nextCountdownTime');

    // Show countdown UI
    nextCountdownTime.textContent = String(sec);
    nextCountdownEl.style.display = 'block';
    document.getElementById('nextBtn').style.display = 'none';
    document.getElementById('resultsBtn').style.display = 'none';
    document.getElementById('waitingMsg').style.display = 'none';

    let remainingSec = sec;
    countdownIntervalId = setInterval(() => {
        remainingSec -= 1;
        nextCountdownTime.textContent = String(Math.max(0, remainingSec));
        if (remainingSec <= 0) {
            clearLocalCountdownUI();
            // When countdown finishes, let the host perform the actual advance.
            // Only the host will advance the DB currentQ to ensure a single authority.
            if (isHost) {
                // Re-use the same logic as the host Next button: advance the question.
                // We'll call the same helper used by the old Next handler (advanceQuestion)
                advanceQuestionAfterCountdown();
            }
        }
    }, 1000);
}

// Listen for changes to the shared countdown state and update UI for everyone
countdownRef.on('value', async (snap) => {
    const c = snap.val();
    if (!c || !c.active) {
        clearLocalCountdownUI();
        // Show the nextBtn again if we are in a state that should show it.
        // The showFeedback logic already sets nextBtn when appropriate right after results,
        // so to keep things simple we don't try to recalc here.
        return;
    }
    const msLeft = (c.endsAt || 0) - Date.now();
    if (msLeft <= 0) {
        // countdown already reached or expired — clear UI and let host advance
        clearLocalCountdownUI();
        if (isHost) {
            advanceQuestionAfterCountdown();
        }
        return;
    }
    // Start showing the countdown UI with msLeft
    startLocalCountdownUI(msLeft);
});

// Wire the cancel button to stop the shared countdown
const cancelCountdownBtn = document.getElementById('cancelCountdownBtn');
if (cancelCountdownBtn) {
    cancelCountdownBtn.addEventListener('click', () => {
        requestStopCountdown();
    });
}

// ---------------- End shared countdown ----------------

// Next button handler for ALL players: starts/restarts shared countdown for everyone
document.getElementById('nextBtn')?.addEventListener('click', () => {
    // Start a 3 second countdown for everyone (restarts if already active)
    requestStartCountdown(3);
});

// Results button handler (host only)
document.getElementById('resultsBtn')?.addEventListener('click', async () => {
    await roomRef.update({ status: 'finished' });
});


