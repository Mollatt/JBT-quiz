// SoundCloud Widget API Controller with fallback
// Handles SoundCloud widget errors gracefully

class SoundCloudPlayer {
    constructor(containerId) {
        this.widget = null;
        this.containerId = containerId;
        this.isReady = false;
        this.onReadyCallback = null;
        this.clipTimer = null;
        this.hasError = false;
    }

    // Load a SoundCloud track (hidden player)
    load(soundcloudUrl) {
        return new Promise((resolve, reject) => {
            const container = document.getElementById(this.containerId);
            if (!container) {
                reject('Container not found');
                return;
            }

            this.hasError = false;

            // Create HIDDEN iframe
            const iframe = document.createElement('iframe');
            iframe.id = 'sc-widget';
            iframe.width = '0';
            iframe.height = '0';
            iframe.style.display = 'none';
            iframe.scrolling = 'no';
            iframe.frameborder = 'no';
            iframe.allow = 'autoplay';
            // Hide all visual elements and controls
            iframe.src = `https://w.soundcloud.com/player/?url=${encodeURIComponent(soundcloudUrl)}&auto_play=false&hide_related=true&show_comments=false&show_user=false&show_reposts=false&show_teaser=false&visual=false&buying=false&sharing=false&download=false&show_playcount=false`;
            
            // Clear existing content
            container.innerHTML = '';
            container.appendChild(iframe);

            // Initialize widget
            this.widget = SC.Widget('sc-widget');
            
            // Set timeout for loading
            const loadTimeout = setTimeout(() => {
                if (!this.isReady) {
                    this.hasError = true;
                    reject('Timeout loading track');
                }
            }, 10000); // 10 second timeout

            this.widget.bind(SC.Widget.Events.READY, () => {
                clearTimeout(loadTimeout);
                this.isReady = true;
                
                // Suppress canvas errors by catching them
                try {
                    if (this.onReadyCallback) {
                        this.onReadyCallback();
                    }
                } catch (e) {
                    console.warn('Widget ready callback error (non-critical):', e);
                }
                
                resolve();
            });

            this.widget.bind(SC.Widget.Events.ERROR, (error) => {
                clearTimeout(loadTimeout);
                this.hasError = true;
                console.error('SoundCloud widget error:', error);
                reject(error);
            });

            // Catch widget load errors
            iframe.onerror = () => {
                clearTimeout(loadTimeout);
                this.hasError = true;
                reject('Failed to load SoundCloud widget');
            };
        });
    }

    // Play from specific time for specific duration with timer callback
    playClip(startTime, duration, onTick) {
        if (!this.isReady || this.hasError) {
            console.error('Widget not ready or has error');
            return;
        }

        // Clear any existing timer
        if (this.clipTimer) {
            clearInterval(this.clipTimer);
        }

        try {
            // Seek to start time and play
            this.widget.seekTo(startTime * 1000); // Convert to ms
            this.widget.play();

            let elapsed = 0;
            
            // Update timer every second
            this.clipTimer = setInterval(() => {
                elapsed++;
                const remaining = duration - elapsed;
                
                if (onTick) {
                    try {
                        onTick(remaining);
                    } catch (e) {
                        console.warn('Timer callback error:', e);
                    }
                }
                
                if (elapsed >= duration) {
                    clearInterval(this.clipTimer);
                    this.clipTimer = null;
                    this.pause();
                }
            }, 1000);
        } catch (e) {
            console.error('Error playing clip:', e);
            this.hasError = true;
        }
    }

    play() {
        if (this.widget && this.isReady && !this.hasError) {
            try {
                this.widget.play();
            } catch (e) {
                console.error('Error playing:', e);
            }
        }
    }

    pause() {
        if (this.widget && this.isReady) {
            try {
                this.widget.pause();
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
        
        if (this.widget && this.isReady) {
            try {
                this.widget.pause();
                this.widget.seekTo(0);
            } catch (e) {
                console.error('Error stopping:', e);
            }
        }
    }
}

// Export for use
window.SoundCloudPlayer = SoundCloudPlayer;
