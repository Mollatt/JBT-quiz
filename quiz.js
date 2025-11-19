// Get session data - UNCHANGED
const gameCode = sessionStorage.getItem('gameCode');
const playerName = sessionStorage.getItem('playerName');
const isHost = sessionStorage.getItem('isHost') === 'true';

if (!gameCode || !playerName) {
    window.location.href = 'index.html';
}

if (typeof unsubscribe !== 'function') {
    console.error('unsubscribe function not found! Check db-helpers.js is loaded.');
}
// CHANGED: Single room subscription instead of multiple field subscriptions
let roomSubscription = null;
let answerCheckSubscription = null;

let currentQuestion = null;
let selectedAnswer = null;
let hasAnswered = false;
let musicPlayer = null;
let currentRoom = null;
let displayedQuestionIndex = -1; // Track what's currently displayed
let allAnsweredTriggered = false;

// Helper for mode normalization - UNCHANGED
function getEffectiveMode(room) {
    if (!room || !room.mode) return 'everybody';
    switch (room.mode) {
        case 'auto':
            return 'everybody';
        case 'host':
        case 'manual':
            return 'host';
        default:
            return room.mode;
    }
}

// CHANGED: Load initial room and setup single subscription
getRoom(gameCode).then(room => {
    if (!room) {
        window.location.href = 'index.html';
        return;
    }

    currentRoom = room;
    document.getElementById('totalQ').textContent = room.questions.length;

    // CHANGED: Setup single room subscription that handles everything
    setupRoomSubscription(room);

    if (getEffectiveMode(room) === 'everybody') {
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

// CHANGED: Single subscription handles all room changes
function setupRoomSubscription(initialRoom) {
    roomSubscription = subscribeToRoom(gameCode, async (room) => {
        // CHANGED: Better null handling - don't redirect immediately
        if (!room) {
            console.warn('Room data is null, waiting for update...');
            return; // Wait for next update instead of redirecting
        }

        currentRoom = room;

        // Handle status changes AFTER updating currentRoom
        if (room.status === 'finished') {
            // Clean up before redirect
            if (window.currentTimerInterval) clearInterval(window.currentTimerInterval);
            if (window.autoModeTimerInterval) clearInterval(window.autoModeTimerInterval);
            if (musicPlayer) musicPlayer.stop();

            window.location.href = 'results.html';
            return;
        } else if (room.status === 'scoreboard') {
            // Clean up before redirect
            if (window.currentTimerInterval) clearInterval(window.currentTimerInterval);
            if (window.autoModeTimerInterval) clearInterval(window.autoModeTimerInterval);
            if (musicPlayer) musicPlayer.stop();

            window.location.href = 'scoreboard.html';
            return;
        }

        // Only handle questions if status is 'playing'
        if (room.status !== 'playing') {
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

        // CHANGED: Only display if this is a NEW question
        if (qIndex !== displayedQuestionIndex) {
            console.log(`Question changed from ${displayedQuestionIndex} to ${qIndex}`);

            // Reset state for new question
            displayedQuestionIndex = qIndex;
            hasAnswered = false;
            selectedAnswer = null;
            allAnsweredTriggered = false;
            window.resultsCalculated = false;

            if (window.currentTimerInterval) {
                clearInterval(window.currentTimerInterval);
                window.currentTimerInterval = null;
            }

            // Clean up old answer subscription
            if (answerCheckSubscription) {
                try {
                    unsubscribe(answerCheckSubscription);
                } catch (e) {
                    console.warn('Error unsubscribing answer check:', e);
                }
                answerCheckSubscription = null;
            }

            // Check if we already answered (page reload case)
            const myPlayerData = room.players ? room.players[playerName] : null;
            if (myPlayerData && myPlayerData.answered === true) {
                hasAnswered = true;
                selectedAnswer = myPlayerData.answer;
            }

            displayQuestion(room.questions[qIndex], qIndex);

            // If already answered, check if all answered
            if (hasAnswered) {
                checkAllAnswered();
            }
        } else {
            // Same question, but room data updated - handle countdown changes
            handleCountdownUpdate(room);
        }
    });
}

function setupAutoMode(room) {
    if (!isHost) return;

    window.autoModeTimerInterval = null;

    // Auto mode timer is managed by the host
    let currentAutoQ = -1;

    const autoModeCheck = setInterval(async () => {
        if (!currentRoom || currentRoom.status !== 'playing') {
            clearInterval(autoModeCheck);
            return;
        }

        const qIndex = currentRoom.currentQ;

        if (qIndex !== currentAutoQ) {
            currentAutoQ = qIndex;

            if (window.autoModeTimerInterval) {
                clearInterval(window.autoModeTimerInterval);
            }

            let timeLeft = room.timePerQuestion || 30;
            let resultsShown = false;

            window.autoModeTimerInterval = setInterval(async () => {
                timeLeft--;

                if (timeLeft <= 0 && !resultsShown) {
                    resultsShown = true;
                    clearInterval(window.autoModeTimerInterval);
                    window.autoModeTimerInterval = null;

                    await forceShowResults();

                    setTimeout(async () => {
                        const freshRoom = await getRoom(gameCode);
                        if (freshRoom.currentQ !== qIndex) {
                            return;
                        }

                        const nextQ = qIndex + 1;
                        const totalQ = room.questions.length;

                        if (nextQ >= totalQ) {
                            await updateRoom(gameCode, { status: 'finished' });
                        } else if (shouldShowScoreboard(nextQ, totalQ)) {
                            await updateRoom(gameCode, {
                                currentQ: nextQ,
                                status: 'scoreboard'
                            });
                        } else {
                            await updateRoom(gameCode, { currentQ: nextQ });
                        }
                    }, 3000);
                }
            }, 1000);
        }
    }, 500);
}

function displayQuestion(question, index) {
    currentQuestion = question;

    document.getElementById('currentQ').textContent = index + 1;
    document.getElementById('questionText').textContent = question.text;

    // Reset UI
    document.getElementById('feedback').style.display = 'none';
    document.getElementById('nextBtn').style.display = 'none';
    document.getElementById('resultsBtn').style.display = 'none';
    document.getElementById('waitingMsg').style.display = 'none';

    const nextCountdownEl = document.getElementById('nextCountdown');
    if (nextCountdownEl) nextCountdownEl.style.display = 'none';

    const progressEl = document.getElementById('answerProgress');
    progressEl.textContent = 'Waiting for answers...';
    progressEl.style.display = 'block';

    // Setup music player
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

    // Setup answer buttons
    const container = document.getElementById('answersContainer');
    container.innerHTML = question.options.map((option, i) => `
        <button class="answer-btn" data-index="${i}">
            ${option}
        </button>
    `).join('');

    document.querySelectorAll('.answer-btn').forEach(btn => {
        btn.addEventListener('click', () => handleAnswer(parseInt(btn.dataset.index)));
    });

    // If already answered (from page reload), mark it
    if (hasAnswered && selectedAnswer !== null && selectedAnswer !== undefined) {
        document.querySelectorAll('.answer-btn').forEach(btn => {
            btn.disabled = true;
        });
        document.querySelectorAll('.answer-btn')[selectedAnswer].classList.add('selected');
    }

    // Setup timer
    const timerDisplay = document.getElementById('timerDisplay');
    if (question.type === 'music') {
        timerDisplay.style.display = 'block';
        const duration = question.duration || 30;
        document.getElementById('timeLeft').textContent = duration;
    } else if (getEffectiveMode(currentRoom) === 'everybody') {
        timerDisplay.style.display = 'block';
        startTimerDisplay();
    } else {
        timerDisplay.style.display = 'block';
        startHostTimer();
    }
}

function startTimerDisplay() {
    let timeLeft = currentRoom.timePerQuestion || 30;
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
}

function startHostTimer() {
    let timeLeft = currentRoom.hostTimerDuration || 60;
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
        await updatePlayer(gameCode, playerName, {
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
    if (allAnsweredTriggered) {
        console.log('All answered already triggered, skipping');
        return;
    }

    answerCheckSubscription = subscribeToPlayers(gameCode, async (players) => {
        if (!players) return;

        const playerArray = Object.values(players);
        const answeredCount = playerArray.filter(p => p.answered === true).length;
        const totalPlayers = playerArray.length;

        const progressMsg = document.getElementById('answerProgress');
        if (progressMsg) {
            progressMsg.textContent = `${answeredCount}/${totalPlayers} players answered`;
        }

        if (answeredCount === totalPlayers && !allAnsweredTriggered) {
            allAnsweredTriggered = true;

            if (answerCheckSubscription) {
                try {
                    unsubscribe(answerCheckSubscription);
                } catch (e) {
                    console.warn('Error unsubscribing:', e);
                }
                answerCheckSubscription = null;
            }

            await calculateAndShowResults(players);
        }
    });
}

async function forceShowResults() {
    const room = await getRoom(gameCode);
    if (room && room.players) {
        await calculateAndShowResults(room.players);
    }
}

async function calculateAndShowResults(players) {
    if (window.resultsCalculated) {
        // Already calculated, just show feedback with current data
        const isCorrect = selectedAnswer === currentQuestion.correct;
        showFeedback(isCorrect);
        return;
    }
    window.resultsCalculated = true;

    const currentRoomData = await getRoom(gameCode);
    currentRoom = currentRoomData;

    const resultsCalc = currentRoom.resultsCalculated || {};

    if (resultsCalc[currentRoom.currentQ]) {
        // Results already calculated by another player
        // Show feedback immediately, it will update with server data
        const isCorrectNow = selectedAnswer === currentQuestion.correct;
        showFeedback(isCorrectNow);

        if (window.currentTimerInterval) clearInterval(window.currentTimerInterval);
        if (window.autoModeTimerInterval) clearInterval(window.autoModeTimerInterval);
        if (musicPlayer && currentQuestion.type === 'music') musicPlayer.stop();
        return;
    }

    const newResultsCalc = { ...resultsCalc, [currentRoom.currentQ]: true };
    await updateRoom(gameCode, { resultsCalculated: newResultsCalc });

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

    const updatePromises = [];
    for (let i = 0; i < correctAnswers.length; i++) {
        const [name, data] = correctAnswers[i];
        const points = i < pointsScale.length ? pointsScale[i] : 400;
        const currentScore = data.score || 0;
        const newScore = currentScore + points;
        const correctCount = (data.correctCount || 0) + 1;

        updatePromises.push(
            updatePlayer(gameCode, name, {
                score: newScore,
                lastPoints: points,
                correctCount: correctCount
            })
        );
    }

    // CHANGED: Show feedback IMMEDIATELY, then update scores in background
    const isCorrect = selectedAnswer === currentQuestion.correct;
    showFeedback(isCorrect);

    // Update scores in background
    await Promise.all(updatePromises);

    // CHANGED: Reduced wait time since showFeedback already handles async update
    await new Promise(resolve => setTimeout(resolve, 300));

    // Trigger a refresh of the feedback with updated server data
    const freshRoom = await getRoom(gameCode);
    const playerData = freshRoom.players ? freshRoom.players[playerName] : null;
    const points = (playerData && playerData.lastPoints) || 0;
    const currentScore = (playerData && playerData.score) || 0;

    const feedbackEl = document.getElementById('feedback');
    if (isCorrect) {
        feedbackEl.innerHTML = `✅ Correct! <strong>+${points} points</strong><br>Total: ${currentScore}`;
    } else {
        feedbackEl.innerHTML = `❌ Wrong! Correct answer: <strong>${currentQuestion.options[currentQuestion.correct]}</strong><br>Total: ${currentScore}`;
    }
}

async function advanceQuestionAfterCountdown() {
    try {
        // CHANGED: Only host performs the database updates
        if (!isHost) {
            // Non-hosts just hide UI and wait for status change
            document.getElementById('feedback').style.display = 'none';
            document.getElementById('nextBtn').style.display = 'none';
            document.getElementById('resultsBtn').style.display = 'none';
            document.getElementById('waitingMsg').style.display = 'none';
            document.getElementById('answerProgress').style.display = 'none';

            const nextCountdownEl = document.getElementById('nextCountdown');
            if (nextCountdownEl) nextCountdownEl.style.display = 'none';

            return; // Don't update database, just wait
        }

        // Host proceeds with updates
        document.getElementById('feedback').style.display = 'none';
        document.getElementById('nextBtn').style.display = 'none';
        document.getElementById('resultsBtn').style.display = 'none';
        document.getElementById('waitingMsg').style.display = 'none';
        document.getElementById('answerProgress').style.display = 'none';

        const nextCountdownEl = document.getElementById('nextCountdown');
        if (nextCountdownEl) nextCountdownEl.style.display = 'none';

        const room = await getRoom(gameCode);

        if (!room) return;

        const currentQ = room.currentQ;
        const nextQ = currentQ + 1;
        const totalQ = room.questions.length;

        const resultsCalc = room.resultsCalculated || {};
        delete resultsCalc[currentQ];

        const players = room.players || {};
        const resetPromises = [];
        for (const name in players) {
            resetPromises.push(
                updatePlayer(gameCode, name, {
                    answered: false,
                    answer: null,
                    answerTime: null
                })
            );
        }
        await Promise.all(resetPromises);

        await updateRoom(gameCode, {
            resultsCalculated: resultsCalc,
            nextCountdown: null
        });

        await new Promise(resolve => setTimeout(resolve, 200));

        if (shouldShowScoreboard(nextQ, totalQ)) {
            await updateRoom(gameCode, {
                currentQ: nextQ,
                status: 'scoreboard'
            });
        } else if (nextQ >= totalQ) {
            await updateRoom(gameCode, { status: 'finished' });
        } else {
            await updateRoom(gameCode, { currentQ: nextQ });
        }
    } catch (error) {
        console.error('Error advancing to next question:', error);
    }
}

// CHANGED: Handle countdown updates from room subscription
function handleCountdownUpdate(room) {
    const countdown = room.nextCountdown;

    if (!countdown || !countdown.active) {
        clearLocalCountdownUI();

        // Show appropriate buttons if results are calculated
        if (window.resultsCalculated) {
            showPostResultsButtons();
        }
        return;
    }

    const msLeft = (countdown.endsAt || 0) - Date.now();
    if (msLeft <= 0) {
        clearLocalCountdownUI();
        if (isHost) {
            advanceQuestionAfterCountdown();
        }
        return;
    }

    startLocalCountdownUI(msLeft);
}

let countdownIntervalId = null;

function requestStartCountdown(seconds = 3) {
    const endsAt = Date.now() + seconds * 1000;
    updateRoom(gameCode, {
        nextCountdown: { active: true, endsAt, startedBy: playerName }
    });
}

function requestStopCountdown() {
    updateRoom(gameCode, {
        nextCountdown: null
    });
}

function clearLocalCountdownUI() {
    if (countdownIntervalId) {
        clearInterval(countdownIntervalId);
        countdownIntervalId = null;
    }
    const nextCountdownEl = document.getElementById('nextCountdown');
    if (nextCountdownEl) nextCountdownEl.style.display = 'none';
}

function startLocalCountdownUI(msRemaining) {
    clearLocalCountdownUI();
    const sec = Math.max(0, Math.ceil(msRemaining / 1000));
    const nextCountdownEl = document.getElementById('nextCountdown');
    const nextCountdownTime = document.getElementById('nextCountdownTime');

    if (!nextCountdownEl || !nextCountdownTime) return;

    nextCountdownTime.textContent = String(sec);
    nextCountdownEl.style.display = 'block';

    const nextBtnEl = document.getElementById('nextBtn');
    const resultsBtnEl = document.getElementById('resultsBtn');
    const waitingMsgEl = document.getElementById('waitingMsg');

    if (nextBtnEl) nextBtnEl.style.display = 'none';
    if (resultsBtnEl) resultsBtnEl.style.display = 'none';
    if (waitingMsgEl) waitingMsgEl.style.display = 'none';

    let remainingSec = sec;
    countdownIntervalId = setInterval(() => {
        remainingSec -= 1;
        nextCountdownTime.textContent = String(Math.max(0, remainingSec));
        if (remainingSec <= 0) {
            clearLocalCountdownUI();
            if (isHost) {
                advanceQuestionAfterCountdown();
            }
        }
    }, 1000);
}

const cancelCountdownBtn = document.getElementById('cancelCountdownBtn');
if (cancelCountdownBtn) {
    cancelCountdownBtn.addEventListener('click', () => {
        requestStopCountdown();
    });
}

function showPostResultsButtons() {
    const effMode = getEffectiveMode(currentRoom);
    const nextQ = (currentRoom?.currentQ ?? 0) + 1;
    const totalQ = currentRoom?.questions?.length ?? 0;

    const nextBtn = document.getElementById('nextBtn');
    const resultsBtn = document.getElementById('resultsBtn');
    const waitingMsg = document.getElementById('waitingMsg');

    // CHANGED: Determine if next is a scoreboard
    const nextIsScoreboard = shouldShowScoreboard(nextQ, totalQ) && nextQ < totalQ;

    if (effMode === 'host') {
        if (nextQ >= totalQ) {
            if (isHost) {
                if (resultsBtn) resultsBtn.style.display = 'block';
            } else {
                if (waitingMsg) waitingMsg.style.display = 'block';
            }
        } else {
            if (isHost) {
                if (nextBtn) {
                    // CHANGED: Update button text based on what's next
                    nextBtn.textContent = nextIsScoreboard ? '📊 View Current Scores' : 'Next Question';
                    nextBtn.style.display = 'block';
                }
            } else {
                if (waitingMsg) waitingMsg.style.display = 'block';
            }
        }
    } else {
        if (nextQ >= totalQ) {
            if (isHost) {
                resultsBtn.style.display = 'block';
            } else {
                waitingMsg.style.display = 'block';
                waitingMsg.textContent = "Finished! Waiting for host...";
            }
        } else {
            if (nextBtn) {
                nextBtn.textContent = nextIsScoreboard ? '📊 View Current Scores' : 'Next Question';
                nextBtn.style.display = 'block';
            }
        }
    }
}

function showFeedback(isCorrect) {
    const feedbackEl = document.getElementById('feedback');
    const buttons = document.querySelectorAll('.answer-btn');

    if (buttons[currentQuestion.correct]) {
        buttons[currentQuestion.correct].classList.add('correct');
    }

    if (!isCorrect && selectedAnswer !== null && selectedAnswer !== undefined && buttons[selectedAnswer]) {
        buttons[selectedAnswer].classList.add('incorrect');
    }

    document.getElementById('answerProgress').style.display = 'none';


    let estimatedPoints = 0;
    if (isCorrect) {

        feedbackEl.innerHTML = `✅ Correct! <strong>Calculating points...</strong>`;
        feedbackEl.className = 'feedback correct';
    } else {
        feedbackEl.innerHTML = `❌ Wrong! Correct answer: <strong>${currentQuestion.options[currentQuestion.correct]}</strong>`;
        feedbackEl.className = 'feedback incorrect';
    }
    feedbackEl.style.display = 'block';

    showPostResultsButtons();
    window.resultsCalculated = true;

    getRoom(gameCode).then(room => {
        const playerData = room.players ? room.players[playerName] : null;
        const points = (playerData && playerData.lastPoints) || 0;
        const currentScore = (playerData && playerData.score) || 0;

        if (isCorrect) {
            feedbackEl.innerHTML = `✅ Correct! <strong>+${points} points</strong><br>Total: ${currentScore}`;
            feedbackEl.className = 'feedback correct';
        } else {
            feedbackEl.innerHTML = `❌ Wrong! Correct answer: <strong>${currentQuestion.options[currentQuestion.correct]}</strong><br>Total: ${currentScore}`;
            feedbackEl.className = 'feedback incorrect';
        }
    });
}

document.getElementById('nextBtn')?.addEventListener('click', async () => {
    const nextQ = (currentRoom?.currentQ ?? 0) + 1;
    const totalQ = currentRoom?.questions?.length ?? 0;
    const nextIsScoreboard = shouldShowScoreboard(nextQ, totalQ) && nextQ < totalQ;

    if (nextIsScoreboard) {
        await advanceQuestionAfterCountdown();
    } else {

        requestStartCountdown(3);
    }
});

document.getElementById('resultsBtn')?.addEventListener('click', async () => {
    if (isHost) {
        const room = await getRoom(gameCode);
        const nextQ = room.currentQ + 1;
        const totalQ = room.questions.length;

        if (nextQ >= totalQ) {
            await updateRoom(gameCode, { status: 'finished' });
        }
    }
});

window.addEventListener('beforeunload', () => {
    console.log('Cleaning up subscriptions');

    if (roomSubscription) {
        try {
            unsubscribe(roomSubscription);
        } catch (e) {
            console.warn('Error cleaning up room subscription:', e);
        }
    }

    if (answerCheckSubscription) {
        try {
            unsubscribe(answerCheckSubscription);
        } catch (e) {
            console.warn('Error cleaning up answer subscription:', e);
        }
    }
});
