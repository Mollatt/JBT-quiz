const AVAILABLE_SKINS = {
    'default': 'styles-default.css',
    'ff': 'styles-ff.css',
    'runescape': 'styles-runescape.css'
};

const DEFAULT_SKIN = 'default';

function getCurrentSkin() {
    return localStorage.getItem('selectedSkin') || DEFAULT_SKIN;
}

function getAnimationPreference() {
    return localStorage.getItem('reduceMotion') === 'true';
}

function setSkin(skinId) {
    if (!AVAILABLE_SKINS[skinId]) {
        console.warn(`Skin "${skinId}" not found, using default`);
        skinId = DEFAULT_SKIN;
    }

    localStorage.setItem('selectedSkin', skinId);
    return skinId;
}

function setAnimationPreference(reduceMotion) {
    localStorage.setItem('reduceMotion', reduceMotion);

    // Apply to body immediately
    if (reduceMotion) {
        document.body.classList.add('reduce-motion');
    } else {
        document.body.classList.remove('reduce-motion');
    }
}

function loadSkinCSS() {
    const skinId = getCurrentSkin();
    const cssFile = AVAILABLE_SKINS[skinId];

    const existingLinks = document.querySelectorAll('link[data-skin-style]');
    existingLinks.forEach(link => link.remove());

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = cssFile;
    link.setAttribute('data-skin-style', 'true');
    document.head.appendChild(link);

    const reduceMotion = getAnimationPreference();
    if (reduceMotion) {
        document.body.classList.add('reduce-motion');
    }
}

function changeSkin(skinId) {
    setSkin(skinId);
    loadSkinCSS();
}

// Auto-load skin on page load
loadSkinCSS();
