// SoundCloud Widget API Controller
// Docs: https://developers.soundcloud.com/docs/api/html5-widget

class SoundCloudPlayer {
    constructor(containerId) {
        this.widget = null;
        this.containerId = containerId;
        this.isReady = false;
        this.onReadyCallback = null;
        this.clipTimer = null;
    }

    // Load a SoundCloud track (hidden player)
    load(soundcloudUrl) {
        return new Promise((resolve, reject) => {
            const container = document.getElementById(this.containerId);
            if (!container) {
                reject('Container not found');
                return;
            }

            // Create HIDDEN iframe (visual=false hides the waveform)
            const iframe = document.createElement('iframe');
            iframe.id = 'sc-widget';
            iframe.width = '0';
            iframe.height = '0';
            iframe.style.display = 'none'; // Completely hidden
            iframe.scrolling = 'no';
            iframe.frameborder = 'no';
            iframe.allow = 'autoplay';
            iframe.src = `https://w.soundcloud.com/player/?url=${encodeURIComponent(soundcloudUrl)}&auto_play=false&hide_related=true&show_comments=false&show_user=false&show_reposts=false&show_teaser=false&visual=false&buying=false&sharing=false&download=false`;
            
            // Clear existing content
            container.innerHTML = '';
            container.appendChild(iframe);

            // Initialize widget
            this.widget = SC.Widget('sc-widget');
            
            this.widget.bind(SC.Widget.Events.READY, () => {
                this.isReady = true;
                if (this.onReadyCallback) {
                    this.onReadyCallback();
                }
                resolve();
            });

            this.widget.bind(SC.Widget.Events.ERROR, (error) => {
                reject(error);
            });
        });
    }

    // Play from specific time for specific duration with timer callback
    playClip(startTime, duration, onTick) {
        if (!this.isReady) {
            console.error('Widget not ready');
            return;
        }

        // Clear any existing timer
        if (this.clipTimer) {
            clearInterval(this.clipTimer);
        }

        // Seek to start time and play
        this.widget.seekTo(startTime * 1000); // Convert to ms
        this.widget.play();

        let elapsed = 0;
        
        // Update timer every second
        this.clipTimer = setInterval(() => {
            elapsed++;
            const remaining = duration - elapsed;
            
            if (onTick) {
                onTick(remaining);
            }
            
            if (elapsed >= duration) {
                clearInterval(this.clipTimer);
                this.clipTimer = null;
                this.pause();
            }
        }, 1000);
    }

    play() {
        if (this.widget && this.isReady) {
            this.widget.play();
        }
    }

    pause() {
        if (this.widget && this.isReady) {
            this.widget.pause();
        }
    }

    stop() {
        if (this.clipTimer) {
            clearInterval(this.clipTimer);
            this.clipTimer = null;
        }
        
        if (this.widget && this.isReady) {
            this.widget.pause();
            this.widget.seekTo(0);
        }
    }

    seekTo(seconds) {
        if (this.widget && this.isReady) {
            this.widget.seekTo(seconds * 1000);
        }
    }

    setVolume(volume) {
        // Volume 0-100
        if (this.widget && this.isReady) {
            this.widget.setVolume(volume);
        }
    }

    onReady(callback) {
        this.onReadyCallback = callback;
        if (this.isReady) {
            callback();
        }
    }

    getCurrentPosition(callback) {
        if (this.widget && this.isReady) {
            this.widget.getPosition(position => {
                callback(position / 1000); // Convert ms to seconds
            });
        }
    }

    getDuration(callback) {
        if (this.widget && this.isReady) {
            this.widget.getDuration(duration => {
                callback(duration / 1000); // Convert ms to seconds
            });
        }
    }
}

// Export for use
window.SoundCloudPlayer = SoundCloudPlayer;
