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

// Load initial room data
roomRef.once('value').then(snapshot => {
    const room = snapshot.val();
    if (!room) {
        window.location.href = 'index.html';
        return;
    }

    document.getElementById('totalQ').textContent = room.questions.length;

    setupQuestionListener(room);
    setupStatusListener();

    if (room.mode === 'auto') {
        setupAutoMode(room);
    }
});

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

    roomRef.child('mode').once('value', snapshot => {
        const mode = snapshot.val();
        const timerDisplay = document.getElementById('timerDisplay');

        if (question.type === 'music') {
            timerDisplay.style.display = 'block';
            const duration = question.duration || 30;
            document.getElementById('timeLeft').textContent = duration;
        } else if (mode === 'auto') {
            timerDisplay.style.display = 'block';
            startTimerDisplay();
        } else {
            timerDisplay.style.display = 'block';
            startHostTimer();
        }
    });
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
    if (window.resultsCalculated) {
        showFeedback(selectedAnswer === currentQuestion.correct);
        return;
    }
    window.resultsCalculated = true;

    const roomSnap = await roomRef.once('value');
    const room = roomSnap.val();
    const resultFlagRef = roomRef.child(`resultsCalculated/${room.currentQ}`);

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
    showFeedback(isCorrect);
    
    if (isHost && room.mode === 'auto') {
        setTimeout(async () => {
            const currentQCheck = await roomRef.child('currentQ').once('value');
            const currentQ = currentQCheck.val();
            
            const nextQ = currentQ + 1;
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
    });

    roomRef.once('value').then(snapshot => {
        const room = snapshot.val();
        const nextQ = room.currentQ + 1;

        if (room.mode === 'host' && isHost) {
            if (nextQ >= room.questions.length) {
                document.getElementById('resultsBtn').style.display = 'block';
            } else {
                document.getElementById('nextBtn').style.display = 'block';
            }
        } else if (room.mode === 'host' && !isHost) {
            document.getElementById('waitingMsg').style.display = 'block';
        } else if (room.mode === 'auto') {
            document.getElementById('waitingMsg').textContent = 'Next question starting soon...';
            document.getElementById('waitingMsg').style.display = 'block';
        }
    });
}

// Next button handler (host only) - FIXED
document.getElementById('nextBtn')?.addEventListener('click', async () => {
    try {
        const snapshot = await roomRef.once('value');
        const room = snapshot.val();
        
        const currentQ = room.currentQ;
        const nextQ = currentQ + 1;
        const totalQ = room.questions.length;

        // Reset results flag for current question
        await roomRef.child(`resultsCalculated/${currentQ}`).remove();

        // Reset all players' answered status
        const players = room.players;
        const resetUpdates = {};
        for (const name in players) {
            resetUpdates[`rooms/${gameCode}/players/${name}/answered`] = false;
            resetUpdates[`rooms/${gameCode}/players/${name}/answer`] = null;
            resetUpdates[`rooms/${gameCode}/players/${name}/answerTime`] = null;
        }
        await db.ref().update(resetUpdates);

        // Check if we should show scoreboard
        if (shouldShowScoreboard(nextQ, totalQ)) {
            await roomRef.update({ 
                currentQ: nextQ,
                status: 'scoreboard'
            });
        } else {
            await roomRef.update({ currentQ: nextQ });
        }
    } catch (error) {
        console.error('Error advancing to next question:', error);
    }
});

// Results button handler (host only)
document.getElementById('resultsBtn')?.addEventListener('click', async () => {
    await roomRef.update({ status: 'finished' });
});
