// Skin Selection UI Handler

const skinModal = document.getElementById('skinModal');
const skinSettingsBtn = document.getElementById('skinSettingsBtn');
const closeSkinModalBtn = document.getElementById('closeSkinModalBtn');

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

        // Close modal after short delay
        setTimeout(() => {
            closeSkinModal();
        }, 300);
    });
});
