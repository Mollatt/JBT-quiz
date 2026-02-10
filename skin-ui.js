const skinModal = document.getElementById('skinModal');
const skinSettingsBtn = document.getElementById('skinSettingsBtn');
const closeSkinModalBtn = document.getElementById('closeSkinModalBtn');
const reduceMotionToggle = document.getElementById('reduceMotionToggle');


skinSettingsBtn?.addEventListener('click', () => {
    openSkinModal();
});


closeSkinModalBtn?.addEventListener('click', () => {
    closeSkinModal();
});


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

        document.querySelectorAll('.skin-option').forEach(opt => {
            opt.classList.remove('selected');
        });
        option.classList.add('selected');

        changeSkin(skinId);

        setTimeout(() => {
            closeSkinModal();
        }, 300);
    });
});

reduceMotionToggle?.addEventListener('change', (e) => {
    setAnimationPreference(e.target.checked);
});
