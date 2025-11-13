// Question Generation System
// Dynamically generates quiz questions from song database

class QuestionGenerator {
    constructor() {
        this.questionTemplates = [
            {
                id: "q-game",
                text: "Which game is this music from?",
                field: "specificGame",
                category: "game",
                difficulty: "easy"
            },
            {
                id: "q-series",
                text: "Which game series is this from?",
                field: "seriesSource",
                category: "series",
                difficulty: "easy"
            },
            {
                id: "q-artist",
                text: "Who composed this music?",
                field: "artist",
                category: "composer",
                difficulty: "medium"
            },
            {
                id: "q-developer",
                text: "Which company developed this game?",
                field: "developer",
                category: "developer",
                difficulty: "medium"
            },
            {
                id: "q-title",
                text: "What is the title of this track?",
                field: "title",
                category: "title",
                difficulty: "hard"
            },
            {
                id: "q-area",
                text: "Which area does this music play in?",
                field: "area",
                category: "location",
                difficulty: "hard"
            },
            {
                id: "q-boss",
                text: "Which boss battle features this music?",
                field: "bossBattle",
                category: "boss",
                difficulty: "hard"
            },
            {
                id: "q-year",
                text: "What year was this game released?",
                field: "releaseYear",
                category: "year",
                difficulty: "medium"
            }
        ];
    }

    // Generate questions for a quiz
    async generateQuestions(count, selectedCategories = null, yearMin = null, yearMax = null) {
        try {
            const songsData = await getVerifiedSongs();

            if (!songsData || songsData.length === 0) {
                console.error('No songs found in database');
                return [];
            }
            let songsList = songsData; 

            if (yearMin !== null || yearMax !== null) {
                songsList = songsList.filter(song => {
                    const year = song.releaseYear;

                    // Skip songs without release year when filtering by year
                    if (!year || year === "N/A" || year === null) {
                        return false;
                    }

                    if (yearMin !== null && year < yearMin) return false;
                    if (yearMax !== null && year > yearMax) return false;

                    return true;
                });
            }

            if (songsList.length === 0) {
                console.error('No songs match the specified filters');
                return [];
            }

            if (songsList.length < count) {
                console.warn(`Only ${songsList.length} songs available, requested ${count}`);
                count = songsList.length;
            }

            const questions = [];
            const usedSongs = new Set();

            for (let i = 0; i < count; i++) {

                let song;
                let attempts = 0;
                do {
                    song = songsList[Math.floor(Math.random() * songsList.length)];
                    attempts++;
                } while (usedSongs.has(song.id) && attempts < 10);

                if (attempts >= 10) {
                    break; // Not enough unique songs
                }

                usedSongs.add(song.id);

        
                let templates = this.questionTemplates;

                if (selectedCategories && selectedCategories.length > 0) {
                    templates = templates.filter(t => selectedCategories.includes(t.category));
                }

                const applicableTemplates = templates.filter(template => {
                    const value = song[template.field];
                    return value && value !== "N/A" && value !== "" && value !== null;
                });

                if (applicableTemplates.length === 0) {
                    continue; // Skip this song if no applicable templates
                }

                const template = applicableTemplates[
                    Math.floor(Math.random() * applicableTemplates.length)
                ];

                const correctAnswer = song[template.field];

                const wrongAnswers = this.generateWrongAnswers(
                    song,
                    template.field,
                    songsList,
                    3
                );

                const allAnswers = [correctAnswer, ...wrongAnswers];
                const shuffled = this.shuffleArray(allAnswers);
                const correctIndex = shuffled.indexOf(correctAnswer);

                const question = {
                    type: "music",
                    youtubeUrl: song.youtubeUrl,
                    startTime: song.startTime || 0,
                    duration: song.duration || 30,
                    text: template.text,
                    options: shuffled,
                    correct: correctIndex,
                    songId: song.id,
                    templateId: template.id
                };

                questions.push(question);
            }

            return questions;

        } catch (error) {
            console.error('Error generating questions:', error);
            return [];
        }
    }

    // Generate wrong answers from other songs
    generateWrongAnswers(correctSong, field, allSongs, count) {
        const wrongAnswers = allSongs
            .filter(song =>
                song[field] !== correctSong[field] &&
                song[field] &&
                song[field] !== "N/A" &&
                song[field] !== null &&
                song.verified === true
            )
            .map(song => song[field])
            .filter((value, index, self) => self.indexOf(value) === index) // Unique only
            .sort(() => Math.random() - 0.5)
            .slice(0, count);

        // If not enough unique wrong answers, pad with "Unknown"
        while (wrongAnswers.length < count) {
            wrongAnswers.push("Unknown");
        }

        return wrongAnswers;
    }

    // Shuffle array
    shuffleArray(array) {
        const arr = [...array];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    // Get template by ID
    getTemplate(id) {
        return this.questionTemplates.find(t => t.id === id);
    }

    // Get all templates
    getAllTemplates() {
        return this.questionTemplates;
    }
}

// Export for use
window.QuestionGenerator = QuestionGenerator;
