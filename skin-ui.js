const skinModal = document.getElementById('skinModal');
const skinSettingsBtn = document.getElementById('skinSettingsBtn');
const closeSkinModalBtn = document.getElementById('closeSkinModalBtn');
const reduceMotionToggle = document.getElementById('reduceMotionToggle');

// Apply saved animation preference on page load
document.addEventListener('DOMContentLoaded', () => {
    // Apply animation preference (already handled in skin-loader.js, but ensure it's applied)
    applyAnimationPreference();

    // Sync checkbox state if it exists
    if (reduceMotionToggle) {
        reduceMotionToggle.checked = getAnimationPreference();
    }
});

// Open skin modal
skinSettingsBtn?.addEventListener('click', () => {
    openSkinModal();
});

// Close skin modal
closeSkinModalBtn?.addEventListener('click', () => {
    closeSkinModal();
});

// Close on outside click
window.addEventListener('click', (e) => {
    if (e.target === skinModal) {
        closeSkinModal();
    }
});

function openSkinModal() {
    if (!skinModal) return;

    // Highlight current skin
    const currentSkin = getCurrentSkin();
    document.querySelectorAll('.skin-option').forEach(option => {
        option.classList.remove('selected');
        if (option.dataset.skin === currentSkin) {
            option.classList.add('selected');
        }
    });

    // Set animation toggle state
    if (reduceMotionToggle) {
        reduceMotionToggle.checked = getAnimationPreference();
    }

    skinModal.style.display = 'flex';
}

function closeSkinModal() {
    if (skinModal) {
        skinModal.style.display = 'none';
    }
}

// Handle skin selection
document.querySelectorAll('.skin-option').forEach(option => {
    option.addEventListener('click', () => {
        const skinId = option.dataset.skin;

        // Update selection
        document.querySelectorAll('.skin-option').forEach(opt => {
            opt.classList.remove('selected');
        });
        option.classList.add('selected');

        // Apply skin
        changeSkin(skinId);

        // Close modal after transition
        setTimeout(() => {
            closeSkinModal();
        }, 300);
    });
});

// Handle animation toggle
reduceMotionToggle?.addEventListener('change', (e) => {
    setAnimationPreference(e.target.checked);
});
