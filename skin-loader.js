// Skin/Theme Management System
const AVAILABLE_SKINS = {
    'default': 'styles-default.css',
    'ff': 'styles-ff.css',
    'runescape': 'styles-runescape.css'
    // Add more skins here as you create them
};

const DEFAULT_SKIN = 'default';

/**
 * Get current skin from localStorage
 */
function getCurrentSkin() {
    return localStorage.getItem('selectedSkin') || DEFAULT_SKIN;
}

/**
 * Set and save skin preference
 */
function setSkin(skinId) {
    if (!AVAILABLE_SKINS[skinId]) {
        console.warn(`Skin "${skinId}" not found, using default`);
        skinId = DEFAULT_SKIN;
    }

    localStorage.setItem('selectedSkin', skinId);
    return skinId;
}

/**
 * Load the appropriate CSS file
 */
function loadSkinCSS() {
    const skinId = getCurrentSkin();
    const cssFile = AVAILABLE_SKINS[skinId];

    // Remove any existing skin stylesheets
    const existingLinks = document.querySelectorAll('link[data-skin-style]');
    existingLinks.forEach(link => link.remove());

    // Create and append new stylesheet link
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = cssFile;
    link.setAttribute('data-skin-style', 'true');
    document.head.appendChild(link);
}

/**
 * Change skin and reload CSS
 */
function changeSkin(skinId) {
    setSkin(skinId);
    loadSkinCSS();
}

// Auto-load skin on page load
loadSkinCSS();
