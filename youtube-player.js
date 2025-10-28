// YouTube Player Controller
// Uses hidden iframe for audio-only playback, no ads

class YouTubePlayer {
    constructor(containerId) {
        this.player = null;
        this.containerId = containerId;
        this.isReady = false;
        this.clipTimer = null;
        this.videoId = null;
        this.clipStartTime = 0;
        this.clipDuration = 0;
        this.onTickCallback = null;
        this.elapsedTime = 0;
        this.isPaused = false;
    }

    // Load a YouTube video
    load(youtubeUrl) {
        return new Promise((resolve, reject) => {
            // Extract video ID from URL
            this.videoId = this.extractVideoId(youtubeUrl);
            if (!this.videoId) {
                reject('Invalid YouTube URL');
                return;
            }

            const container = document.getElementById(this.containerId);
            if (!container) {
                reject('Container not found');
                return;
            }

            // Create hidden div for player
            container.innerHTML = '';
            const playerDiv = document.createElement('div');
            playerDiv.id = 'yt-player';
            playerDiv.style.display = 'none';
            container.appendChild(playerDiv);

            // Load YouTube IFrame API
            if (!window.YT) {
                const tag = document.createElement('script');
                tag.src = 'https://www.youtube.com/iframe_api';
                const firstScriptTag = document.getElementsByTagName('script')[0];
                firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

                // Wait for API to load
                window.onYouTubeIframeAPIReady = () => {
                    this.initPlayer(resolve, reject);
                };
            } else {
                this.initPlayer(resolve, reject);
            }
        });
    }

    initPlayer(resolve, reject) {
        try {
            this.player = new YT.Player('yt-player', {
                videoId: this.videoId,
                events: {
                    'onReady': () => {
                        this.isReady = true;
                        this.player.setVolume(100);
                        resolve();
                    },
                    'onError': (error) => {
                        reject(`YouTube error: ${error.data}`);
                    }
                }
            });
        } catch (e) {
            reject(`Failed to initialize player: ${e.message}`);
        }
    }

    extractVideoId(url) {
        const patterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/,
            /youtube\.com\/embed\/([^&\n?#]+)/
        ];

        for (let pattern of patterns) {
            const match = url.match(pattern);
            if (match && match[1]) {
                return match[1];
            }
        }
        return null;
    }

    // Play from specific time for specific duration with timer callback
    playClip(startTime, duration, onTick) {
        if (!this.isReady) {
            console.error('Player not ready');
            return;
        }

        // Clear any existing timer
        if (this.clipTimer) {
            clearInterval(this.clipTimer);
        }

        this.clipStartTime = startTime;
        this.clipDuration = duration;
        this.onTickCallback = onTick;
        this.elapsedTime = 0;
        this.isPaused = false;

        try {
            // Seek to start time and play
            this.player.seekTo(startTime, true);
            this.player.playVideo();

            // Update timer every second
            this.clipTimer = setInterval(() => {
                if (!this.isPaused) {
                    this.elapsedTime++;
                    const remaining = duration - this.elapsedTime;
                    
                    if (this.onTickCallback) {
                        this.onTickCallback(remaining);
                    }
                    
                    if (this.elapsedTime >= duration) {
                        clearInterval(this.clipTimer);
                        this.clipTimer = null;
                        this.pause();
                    }
                }
            }, 1000);
        } catch (e) {
            console.error('Error playing clip:', e);
        }
    }

    play() {
        if (this.player && this.isReady) {
            try {
                this.player.playVideo();
                this.isPaused = false;
                
                // Resume timer if it was stopped
                if (!this.clipTimer && this.elapsedTime < this.clipDuration) {
                    this.clipTimer = setInterval(() => {
                        if (!this.isPaused) {
                            this.elapsedTime++;
                            const remaining = this.clipDuration - this.elapsedTime;
                            
                            if (this.onTickCallback) {
                                this.onTickCallback(remaining);
                            }
                            
                            if (this.elapsedTime >= this.clipDuration) {
                                clearInterval(this.clipTimer);
                                this.clipTimer = null;
                                this.pause();
                            }
                        }
                    }, 1000);
                }
            } catch (e) {
                console.error('Error playing:', e);
            }
        }
    }

    pause() {
        if (this.player && this.isReady) {
            try {
                this.player.pauseVideo();
                this.isPaused = true;
            } catch (e) {
                console.error('Error pausing:', e);
            }
        }
    }

    stop() {
        if (this.clipTimer) {
            clearInterval(this.clipTimer);
            this.clipTimer = null;
        }
        
        this.isPaused = false;
        this.elapsedTime = 0;
        
        if (this.player && this.isReady) {
            try {
                this.player.stopVideo();
            } catch (e) {
                console.error('Error stopping:', e);
            }
        }
    }

    setVolume(volume) {
        if (this.player && this.isReady) {
            this.player.setVolume(volume);
        }
    }
}

// Export for use
window.YouTubePlayer = YouTubePlayer;
