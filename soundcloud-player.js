// SoundCloud Widget API Controller
// Docs: https://developers.soundcloud.com/docs/api/html5-widget

class SoundCloudPlayer {
    constructor(containerId) {
        this.widget = null;
        this.containerId = containerId;
        this.isReady = false;
        this.onReadyCallback = null;
    }

    // Load a SoundCloud track
    load(soundcloudUrl, autoPlay = false) {
        return new Promise((resolve, reject) => {
            const container = document.getElementById(this.containerId);
            if (!container) {
                reject('Container not found');
                return;
            }

            // Create iframe
            const iframe = document.createElement('iframe');
            iframe.id = 'sc-widget';
            iframe.width = '100%';
            iframe.height = '166';
            iframe.scrolling = 'no';
            iframe.frameborder = 'no';
            iframe.allow = 'autoplay';
            iframe.src = `https://w.soundcloud.com/player/?url=${encodeURIComponent(soundcloudUrl)}&auto_play=${autoPlay}&hide_related=true&show_comments=false&show_user=false&show_reposts=false&show_teaser=false&visual=false`;
            
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

    // Play from specific time for specific duration
    playClip(startTime, duration) {
        if (!this.isReady) {
            console.error('Widget not ready');
            return;
        }

        // Seek to start time
        this.widget.seekTo(startTime * 1000); // Convert to ms
        this.widget.play();

        // Stop after duration
        setTimeout(() => {
            this.widget.pause();
        }, duration * 1000);
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
