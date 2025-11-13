// Get session data - UNCHANGED
const gameCode = sessionStorage.getItem('gameCode');
const playerName = sessionStorage.getItem('playerName');
const isHost = sessionStorage.getItem('isHost') === 'true';

if (!gameCode || !playerName) {
    window.location.href = 'index.html';
}

// ADDED: Track subscriptions and prevent duplicate triggers
let roomSubscription = null;
let statusSubscription = null;
let currentQSubscription = null;
let countdownSubscription = null;

let currentQuestion = null;
let selectedAnswer = null;
let hasAnswered = false;
let answerCheckSubscription = null; // CHANGED: Track this subscription
let musicPlayer = null;
let currentRoom = null;
let lastQuestionIndex = -1; // ADDED: Track last displayed question to prevent duplicates

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

// Load initial room data
getRoom(gameCode).then(room => {
    if (!room) {
        window.location.href = 'index.html';
        return;
    }

    currentRoom = room;
    document.getElementById('totalQ').textContent = room.questions.length;

    setupQuestionListener(room);
    setupStatusListener();

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

// FIXED: Setup question listener with duplicate prevention
function setupQuestionListener(room) {
    currentQSubscription = subscribeToRoomField(gameCode, 'currentQ', async (qIndex) => {
        // ADDED: Prevent duplicate displays
        if (qIndex === lastQuestionIndex) {
            console.log('Ignoring duplicate currentQ trigger:', qIndex);
            return;
        }

        if (qIndex === -1) return;

        if (qIndex >= room.questions.length) {
            await updateRoom(gameCode, { status: 'finished' });
            return;
        }

        // ADDED: Update last question index
        lastQuestionIndex = qIndex;

        if (window.currentTimerInterval) {
            clearInterval(window.currentTimerInterval);
            window.currentTimerInterval = null;
        }

        window.resultsCalculated = false;

        hasAnswered = false;
        selectedAnswer = null;

        // FIXED: Clean up old subscription properly
        if (answerCheckSubscription) {
            unsubscribe(answerCheckSubscription);
            answerCheckSubscription = null;
        }

        await updatePlayer(gameCode, playerName, {
            answer: null,
            answerTime: null,
            lastPoints: 0,
            answered: false
        });

        currentRoom = await getRoom(gameCode);

        displayQuestion(currentRoom.questions[qIndex], qIndex);
    });
}

function setupStatusListener() {
    statusSubscription = subscribeToRoomField(gameCode, 'status', (status) => {
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

    const autoModeHandler = subscribeToRoomField(gameCode, 'currentQ', async (qIndex) => {
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
                    const currentRoomData = await getRoom(gameCode);
                    if (currentRoomData.currentQ !== qIndex) {
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

    // Check if player already answered (in case of page reload)
    getRoom(gameCode).then(room => {
        const playerData = room.players ? room.players[playerName] : null;
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
    } else if (getEffectiveMode(currentRoom) === 'everybody') {
        timerDisplay.style.display = 'block';
        startTimerDisplay();
    } else {
        timerDisplay.style.display = 'block';
        startHostTimer();
    }
}

function startTimerDisplay() {
    getRoom(gameCode).then(room => {
        let timeLeft = room.timePerQuestion || 30;
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
    getRoom(gameCode).then(room => {
        let timeLeft = room.hostTimerDuration || 60;
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

// FIXED: Better debouncing and state tracking
let allAnsweredTriggered = false; // ADDED: Prevent duplicate triggers

function checkAllAnswered() {
    // ADDED: Prevent duplicate calls
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
            allAnsweredTriggered = true; // ADDED: Mark as triggered

            // Stop listening
            if (answerCheckSubscription) {
                unsubscribe(answerCheckSubscription);
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

// FIXED: Better results calculation with proper waiting
async function calculateAndShowResults(players) {
    if (window.resultsCalculated) {
        // FIXED: Wait for fresh data before showing feedback
        await new Promise(resolve => setTimeout(resolve, 500));
        const freshRoom = await getRoom(gameCode);
        const playerData = freshRoom.players ? freshRoom.players[playerName] : null;
        const isCorrect = playerData?.answer === currentQuestion.correct;
        showFeedback(isCorrect);
        return;
    }
    window.resultsCalculated = true;

    const currentRoomData = await getRoom(gameCode);
    currentRoom = currentRoomData;

    const resultsCalc = currentRoom.resultsCalculated || {};

    if (resultsCalc[currentRoom.currentQ]) {
        // Results already calculated by another player
        await new Promise(resolve => setTimeout(resolve, 500));
        const freshRoom = await getRoom(gameCode);
        const playerData = freshRoom.players ? freshRoom.players[playerName] : null;
        const isCorrectNow = playerData?.answer === currentQuestion.correct;
        showFeedback(isCorrectNow);

        if (window.currentTimerInterval) clearInterval(window.currentTimerInterval);
        if (window.autoModeTimerInterval) clearInterval(window.autoModeTimerInterval);
        if (musicPlayer && currentQuestion.type === 'music') musicPlayer.stop();
        return;
    }

    // Mark results as calculated
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

    // Calculate scores
    const correctAnswers = Object.entries(players)
        .filter(([name, data]) => {
            return data.answer === currentQuestion.correct &&
                data.answered === true &&
                data.answerTime != null;
        })
        .sort((a, b) => (a[1].answerTime || Infinity) - (b[1].answerTime || Infinity));

    const pointsScale = [1000, 800, 600, 400];

    // FIXED: Update all players in parallel, then wait for completion
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

    // FIXED: Wait for ALL updates to complete
    await Promise.all(updatePromises);

    // FIXED: Wait longer for propagation
    await new Promise(resolve => setTimeout(resolve, 800));

    // FIXED: Get fresh player data before showing feedback
    const freshRoom = await getRoom(gameCode);
    const playerData = freshRoom.players ? freshRoom.players[playerName] : null;
    const isCorrect = playerData?.answer === currentQuestion.correct;
    showFeedback(isCorrect);
}

async function advanceQuestionAfterCountdown() {
    try {
        const room = await getRoom(gameCode);

        if (!room) return;

        const currentQ = room.currentQ;
        const nextQ = currentQ + 1;
        const totalQ = room.questions.length;

        // Clear results flag
        const resultsCalc = room.resultsCalculated || {};
        delete resultsCalc[currentQ];
        await updateRoom(gameCode, { resultsCalculated: resultsCalc });

        // Reset all player answers
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

        // Clear countdown
        await updateRoom(gameCode, { nextCountdown: { active: false } });

        // ADDED: Reset the trigger flag
        allAnsweredTriggered = false;

        await new Promise(resolve => setTimeout(resolve, 100));

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

// Shared countdown management
let countdownIntervalId = null;

function requestStartCountdown(seconds = 3) {
    const endsAt = Date.now() + seconds * 1000;
    updateRoom(gameCode, {
        nextCountdown: { active: true, endsAt, startedBy: playerName }
    }).catch(err => {
        console.error('Failed to write countdown state:', err);
    });
}

function requestStopCountdown() {
    updateRoom(gameCode, {
        nextCountdown: { active: false }
    }).catch(err => {
        console.error('Failed to cancel countdown state:', err);
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
            window.countdownJustFinished = true;
            clearLocalCountdownUI();
            if (isHost) {
                advanceQuestionAfterCountdown();
            }
        }
    }, 1000);
}

countdownSubscription = subscribeToRoomField(gameCode, 'nextCountdown', (c) => {
    if (!c || !c.active) {
        if (window.countdownJustFinished) {
            window.countdownJustFinished = false;
            clearLocalCountdownUI();
            return;
        }
        clearLocalCountdownUI();

        const nextBtn = document.getElementById('nextBtn');
        const resultsBtn = document.getElementById('resultsBtn');
        const waitingMsg = document.getElementById('waitingMsg');

        const effMode = getEffectiveMode(currentRoom);
        const nextQ = (currentRoom?.currentQ ?? 0) + 1;
        const totalQ = currentRoom?.questions?.length ?? 0;

        if (window.resultsCalculated) {
            if (effMode === 'host') {
                if (nextQ >= totalQ) {
                    if (isHost) {
                        if (resultsBtn) resultsBtn.style.display = 'block';
                    } else {
                        if (waitingMsg) waitingMsg.style.display = 'block';
                    }
                } else {
                    if (isHost) {
                        if (nextBtn) nextBtn.style.display = 'block';
                    } else {
                        if (waitingMsg) waitingMsg.style.display = 'block';
                    }
                }
            } else {
                if (nextQ >= totalQ) {
                    if (isHost) {
                        if (resultsBtn) resultsBtn.style.display = 'block';
                    } else {
                        if (waitingMsg) waitingMsg.style.display = 'block';
                    }
                } else {
                    if (nextBtn) nextBtn.style.display = 'block';
                }
            }
        }
        return;
    }

    const msLeft = (c.endsAt || 0) - Date.now();
    if (msLeft <= 0) {
        clearLocalCountdownUI();
        if (isHost) {
            advanceQuestionAfterCountdown();
        }
        return;
    }
    startLocalCountdownUI(msLeft);
});

const cancelCountdownBtn = document.getElementById('cancelCountdownBtn');
if (cancelCountdownBtn) {
    cancelCountdownBtn.addEventListener('click', () => {
        requestStopCountdown();
    });
}

function showFeedback(isCorrect) {
    console.log('showFeedback called, isHost:', isHost, 'mode:', currentRoom?.mode, 'isCorrect:', isCorrect);

    const feedbackEl = document.getElementById('feedback');
    const buttons = document.querySelectorAll('.answer-btn');

    if (buttons[currentQuestion.correct]) {
        buttons[currentQuestion.correct].classList.add('correct');
    }

    if (!isCorrect && selectedAnswer !== null && selectedAnswer !== undefined && buttons[selectedAnswer]) {
        buttons[selectedAnswer].classList.add('incorrect');
    }

    document.getElementById('answerProgress').style.display = 'none';

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
        feedbackEl.style.display = 'block';

        const nextQ = currentRoom.currentQ + 1;
        const totalQuestions = currentRoom.questions.length;
        const effMode = getEffectiveMode(currentRoom);

        if (effMode === 'host') {
            if (nextQ >= totalQuestions) {
                if (isHost) {
                    document.getElementById('resultsBtn').style.display = 'block';
                } else {
                    document.getElementById('waitingMsg').style.display = 'block';
                }
            } else {
                if (isHost) {
                    document.getElementById('nextBtn').style.display = 'block';
                } else {
                    document.getElementById('waitingMsg').style.display = 'block';
                }
            }
        } else {
            if (nextQ >= totalQuestions) {
                if (isHost) {
                    document.getElementById('resultsBtn').style.display = 'block';
                } else {
                    document.getElementById('waitingMsg').style.display = 'block';
                }
            } else {
                document.getElementById('nextBtn').style.display = 'block';
            }
        }

        window.resultsCalculated = true;
    });
}

document.getElementById('nextBtn')?.addEventListener('click', () => {
    requestStartCountdown(3);
});

document.getElementById('resultsBtn')?.addEventListener('click', () => {
    requestStartCountdown(3);
});

window.addEventListener('beforeunload', () => {
    if (roomSubscription) unsubscribe(roomSubscription);
    if (statusSubscription) unsubscribe(statusSubscription);
    if (currentQSubscription) unsubscribe(currentQSubscription);
    if (countdownSubscription) unsubscribe(countdownSubscription);
    if (answerCheckSubscription) unsubscribe(answerCheckSubscription);
});
