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
let nextQuestionCountdown = null;
let countdownActive = false;

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
});

function setupQuestionListener(room) {
    roomRef.child('currentQ').on('value', async (snapshot) => {
        const qIndex = snapshot.val();

        if (qIndex === -1) return;

        if (qIndex >= room.questions.length) {
            await roomRef.update({ status: 'finished' });
            return;
        }

        // Clear previous state
        if (window.currentTimerInterval) {
            clearInterval(window.currentTimerInterval);
            window.currentTimerInterval = null;
        }

        cancelNextCountdown();

        // Reset for new question
        hasAnswered = false;
        selectedAnswer = null;

        if (answerCheckListener) {
            playersRef.off('value', answerCheckListener);
            answerCheckListener = null;
        }

        // Load question
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

function displayQuestion(question, index) {
    currentQuestion = question;

    document.getElementById('currentQ').textContent = index + 1;
    document.getElementById('questionText').textContent = question.text;

    // Hide feedback and buttons
    document.getElementById('feedback').style.display = 'none';
    document.getElementById('nextBtn').style.display = 'none';
    document.getElementById('resultsBtn').style.display = 'none';
    document.getElementById('waitingMsg').style.display = 'none';
    document.getElementById('nextCountdown').style.display = 'none';

    // Reset and show answer progress
    const progressEl = document.getElementById('answerProgress');
    progressEl.textContent = 'Waiting for answers...';
    progressEl.style.display = 'block';

    // Handle music
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
        });
    } else {
        musicPlayerEl.style.display = 'none';
        if (musicPlayer) {
            musicPlayer.stop();
        }
    }

    // Render answer options
    const container = document.getElementById('answersContainer');
    container.innerHTML = question.options.map((option, i) => `
        <button class="answer-btn" data-index="${i}">
            ${option}
        </button>
    `).join('');

    // Add click handlers
    document.querySelectorAll('.answer-btn').forEach(btn => {
        btn.addEventListener('click', () => handleAnswer(parseInt(btn.dataset.index)));
    });

    // Check if already answered (after refresh)
    playerRef.once('value', snapshot => {
        const playerData = snapshot.val();
        
        if (playerData && playerData.answered === true && playerData.answer !== null && playerData.answer !== undefined) {
            hasAnswered = true;
            selectedAnswer = playerData.answer;

            document.querySelectorAll('.answer-btn').forEach(btn => {
                btn.disabled = true;
            });

            if (selectedAnswer !== null && selectedAnswer !== undefined) {
                document.querySelectorAll('.answer-btn')[selectedAnswer].classList.add('selected');
            }

            // Check if all players answered
            checkAllAnswered();
        }
    });

    // Show timer display
    const timerDisplay = document.getElementById('timerDisplay');
    if (question.type === 'music') {
        timerDisplay.style.display = 'block';
        const duration = question.duration || 30;
        document.getElementById('timeLeft').textContent = duration;
    } else {
        timerDisplay.style.display = 'none';
    }
}

async function handleAnswer(answerIndex) {
    if (hasAnswered) return;

    hasAnswered = true;
    selectedAnswer = answerIndex;

    // Disable all buttons immediately
    document.querySelectorAll('.answer-btn').forEach(btn => {
        btn.disabled = true;
    });

    // Highlight selected answer
    document.querySelectorAll('.answer-btn')[answerIndex].classList.add('selected');

    // Save answer to database
    const answerTime = Date.now();

    try {
        await playerRef.update({
            answer: answerIndex,
            answerTime: answerTime,
            answered: true
        });

        console.log('Answer saved:', { answerIndex, answerTime });

        // Check if all answered
        checkAllAnswered();

    } catch (error) {
        console.error('Error saving answer:', error);
        hasAnswered = false;
        document.querySelectorAll('.answer-btn').forEach(btn => {
            btn.disabled = false;
        });
    }
}

function checkAllAnswered() {
    // Listen for all players answering
    answerCheckListener = playersRef.on('value', async (snapshot) => {
        const players = snapshot.val();
        
        if (!players) {
            console.log('No players found');
            return;
        }

        const playerArray = Object.values(players);
        const answeredCount = playerArray.filter(p => p.answered === true).length;
        const totalPlayers = playerArray.length;

        console.log(`Progress: ${answeredCount}/${totalPlayers} answered`);

        const progressMsg = document.getElementById('answerProgress');
        if (progressMsg) {
            progressMsg.textContent = `${answeredCount}/${totalPlayers} players answered`;
        }

        // All players answered
        if (answeredCount === totalPlayers) {
            console.log('All players answered, calculating results');
            playersRef.off('value', answerCheckListener);
            answerCheckListener = null;
            
            // Delay to ensure all data is written
            await new Promise(resolve => setTimeout(resolve, 500));
            
            await calculateAndShowResults(players);
        }
    });
}

async function calculateAndShowResults(players) {
    console.log('Calculating results...');
    
    // Stop music
    if (musicPlayer && currentQuestion.type === 'music') {
        musicPlayer.stop();
    }

    if (window.currentTimerInterval) {
        clearInterval(window.currentTimerInterval);
        window.currentTimerInterval = null;
    }

    // Get correct answers sorted by speed
    const correctAnswers = Object.entries(players)
        .filter(([name, data]) => {
            return data.answer === currentQuestion.correct &&
                data.answered === true &&
                data.answerTime != null;
        })
        .sort((a, b) => (a[1].answerTime || Infinity) - (b[1].answerTime || Infinity));

    console.log('Correct answers:', correctAnswers.length);

    // Points for ranking
    const pointsScale = [1000, 800, 600, 400];
    const updates = {};

    for (let i = 0; i < correctAnswers.length; i++) {
        const [name, data] = correctAnswers[i];
        const points = i < pointsScale.length ? pointsScale[i] : 400;
        const currentScore = data.score || 0;
        const newScore = currentScore + points;
        const correctCount = (data.correctCount || 0) + 1;

        console.log(`${name}: +${points} points (total: ${newScore})`);

        updates[`rooms/${gameCode}/players/${name}/score`] = newScore;
        updates[`rooms/${gameCode}/players/${name}/lastPoints`] = points;
        updates[`rooms/${gameCode}/players/${name}/correctCount`] = correctCount;
    }

    // Penalize those who got it wrong
    const wrongAnswers = Object.entries(players)
        .filter(([name, data]) => {
            return data.answered === true &&
                (data.answer !== currentQuestion.correct || data.answer === null);
        });

    for (const [name, data] of wrongAnswers) {
        const currentScore = data.score || 0;
        const newScore = Math.max(0, currentScore); // Wrong answers don't lose points in Everybody Plays
        
        updates[`rooms/${gameCode}/players/${name}/score`] = newScore;
        updates[`rooms/${gameCode}/players/${name}/lastPoints`] = 0;
    }

    // Update all scores at once
    if (Object.keys(updates).length > 0) {
        await db.ref().update(updates);
        console.log('Scores updated');
    }

    // Wait for updates to propagate
    await new Promise(resolve => setTimeout(resolve, 300));

    // Show feedback
    const isCorrect = selectedAnswer === currentQuestion.correct;
    showFeedback(isCorrect);
}

function showFeedback(isCorrect) {
    const feedbackEl = document.getElementById('feedback');
    const buttons = document.querySelectorAll('.answer-btn');

    // Highlight correct answer in green
    if (buttons[currentQuestion.correct]) {
        buttons[currentQuestion.correct].classList.add('correct');
    }

    // Highlight wrong answer in red
    if (!isCorrect && selectedAnswer !== null && selectedAnswer !== undefined && buttons[selectedAnswer]) {
        buttons[selectedAnswer].classList.add('incorrect');
    }

    document.getElementById('answerProgress').style.display = 'none';

    // Get this player's score
    playerRef.once('value', snapshot => {
        const playerData = snapshot.val();
        
        if (!playerData) {
            console.error('Player data not found in feedback');
            return;
        }

        const points = playerData.lastPoints || 0;
        const currentScore = playerData.score || 0;

        console.log(`Feedback - Points: ${points}, Total: ${currentScore}`);

        if (isCorrect) {
            feedbackEl.innerHTML = `✅ Correct! <strong>+${points} points</strong><br>Total: ${currentScore}`;
            feedbackEl.className = 'feedback correct';
        } else {
            feedbackEl.innerHTML = `❌ Wrong! Correct answer: <strong>${currentQuestion.options[currentQuestion.correct]}</strong><br>Total: ${currentScore}`;
            feedbackEl.className = 'feedback incorrect';
        }
        feedbackEl.style.display = 'block';
    });

    // Show next button or results
    roomRef.once('value').then(snapshot => {
        const room = snapshot.val();
        
        if (!room) {
            console.error('Room data not found');
            return;
        }

        const nextQ = room.currentQ + 1;

        console.log(`Current Q: ${room.currentQ}, Next Q: ${nextQ}, Total: ${room.questions.length}`);

        if (nextQ >= room.questions.length) {
            console.log('Showing results button');
            document.getElementById('resultsBtn').style.display = 'block';
        } else {
            console.log('Showing next button');
            const nextBtn = document.getElementById('nextBtn');
            nextBtn.style.display = 'block';
            
            // Add fresh click listener
            const newNextBtn = nextBtn.cloneNode(true);
            nextBtn.parentNode.replaceChild(newNextBtn, nextBtn);
            
            newNextBtn.addEventListener('click', () => {
                if (!countdownActive) {
                    startNextCountdown();
                }
            });
        }
    });
}

function startNextCountdown() {
    countdownActive = true;
    document.getElementById('nextBtn').style.display = 'none';
    document.getElementById('nextCountdown').style.display = 'block';
    
    let timeLeft = 3;
    const countdownEl = document.getElementById('nextCountdownTime');
    countdownEl.textContent = timeLeft;
    
    nextQuestionCountdown = setInterval(() => {
        timeLeft--;
        countdownEl.textContent = timeLeft;
        
        if (timeLeft <= 0) {
            clearInterval(nextQuestionCountdown);
            nextQuestionCountdown = null;
            advanceToNextQuestion();
        }
    }, 1000);
}

function cancelNextCountdown() {
    if (nextQuestionCountdown) {
        clearInterval(nextQuestionCountdown);
        nextQuestionCountdown = null;
        countdownActive = false;
    }
    
    document.getElementById('nextCountdown').style.display = 'none';
}

document.getElementById('cancelCountdownBtn')?.addEventListener('click', () => {
    cancelNextCountdown();
    
    const nextBtn = document.getElementById('nextBtn');
    if (nextBtn && document.getElementById('feedback').style.display !== 'none') {
        nextBtn.style.display = 'block';
    }
});

async function advanceToNextQuestion() {
    console.log('Advancing to next question');
    
    const snapshot = await roomRef.once('value');
    const room = snapshot.val();
    
    const nextQ = room.currentQ + 1;
    const totalQ = room.questions.length;

    // Reset all players for next question
    const players = room.players;
    const resets = {};
    
    for (const name in players) {
        resets[`rooms/${gameCode}/players/${name}/answered`] = false;
        resets[`rooms/${gameCode}/players/${name}/answer`] = null;
        resets[`rooms/${gameCode}/players/${name}/answerTime`] = null;
        resets[`rooms/${gameCode}/players/${name}/lastPoints`] = 0;
    }
    
    await db.ref().update(resets);

    if (nextQ >= totalQ) {
        console.log('Game finished');
        await roomRef.update({ status: 'finished' });
    } else {
        console.log(`Moving to question ${nextQ}`);
        await roomRef.update({ currentQ: nextQ });
    }
}

document.getElementById('resultsBtn')?.addEventListener('click', async () => {
    await roomRef.update({ status: 'finished' });
});
