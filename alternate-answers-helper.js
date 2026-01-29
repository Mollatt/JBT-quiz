// Alternate Answers UI Helper for Admin Panel
// FEATURE 1: Functions to manage alternate answer inputs

/**
 * Normalize a string for comparison (lowercase, trimmed)
 */
function normalizeString(str) {
    return str.trim().toLowerCase();
}

/**
 * Check for duplicates within an array (case-insensitive, trimmed)
 */
function hasDuplicates(values) {
    const normalized = values.map(v => normalizeString(v));
    return normalized.length !== new Set(normalized).size;
}

/**
 * Get duplicate values from an array
 */
function getDuplicates(values) {
    const normalized = values.map(v => normalizeString(v));
    const seen = new Set();
    const duplicates = new Set();

    normalized.forEach((val, idx) => {
        if (seen.has(val)) {
            duplicates.add(values[idx]);
        }
        seen.add(val);
    });

    return Array.from(duplicates);
}

/**
 * Create an alternate input field with + and - buttons
 */
function createAlternateField(fieldName, value = '', isFirst = false) {
    const div = document.createElement('div');
    div.className = 'alternate-field';
    div.style.cssText = 'display: flex; gap: 0.5rem; margin-bottom: 0.5rem; align-items: center;';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = `alternate-input alternate-${fieldName}`;
    input.value = value;
    input.placeholder = isFirst ? 'Add alternate...' : '';
    input.style.cssText = 'flex: 1; padding: 0.6rem; border: 2px solid rgba(255, 255, 255, 0.3); border-radius: 8px; background: rgba(255, 255, 255, 0.1); color: white; font-size: 0.9rem;';

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'btn-add-alternate';
    addBtn.textContent = '+';
    addBtn.style.cssText = 'width: 35px; height: 35px; padding: 0; background: rgba(76, 175, 80, 0.3); border: 2px solid rgba(76, 175, 80, 0.6); color: white; border-radius: 6px; cursor: pointer; font-size: 1.2rem; font-weight: bold;';
    addBtn.onclick = () => addAlternateField(fieldName, div);

    div.appendChild(input);

    if (!isFirst) {
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'btn-remove-alternate';
        removeBtn.textContent = '−';
        removeBtn.style.cssText = 'width: 35px; height: 35px; padding: 0; background: rgba(244, 67, 54, 0.3); border: 2px solid rgba(244, 67, 54, 0.6); color: white; border-radius: 6px; cursor: pointer; font-size: 1.2rem; font-weight: bold;';
        removeBtn.onclick = () => removeAlternateField(div);
        div.appendChild(removeBtn);
    }

    div.appendChild(addBtn);

    return div;
}

/**
 * Add a new alternate field after the current one
 */
function addAlternateField(fieldName, afterElement) {
    const newField = createAlternateField(fieldName);
    afterElement.parentNode.insertBefore(newField, afterElement.nextSibling);
    newField.querySelector('input').focus();
}

/**
 * Remove an alternate field
 */
function removeAlternateField(element) {
    element.remove();
}

/**
 * Initialize alternate fields for a form group
 */
function initializeAlternateFields(containerId, fieldName, existingValues = []) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';

    if (existingValues.length === 0) {
        container.appendChild(createAlternateField(fieldName, '', true));
    } else {
        existingValues.forEach((value, index) => {
            container.appendChild(createAlternateField(fieldName, value, index === 0));
        });
    }
}

/**
 * Get all alternate values from a container
 */
function getAlternateValues(fieldName) {
    const inputs = document.querySelectorAll(`.alternate-${fieldName}`);
    const values = [];

    inputs.forEach(input => {
        const val = input.value.trim();
        if (val) {
            values.push(val);
        }
    });

    return values;
}

/**
 * Validate alternate values (check for duplicates)
 */
function validateAlternates(fieldName, primaryValue) {
    const alternates = getAlternateValues(fieldName);

    if (alternates.length === 0) {
        return { valid: true };
    }

    // Check for duplicates within alternates
    const duplicates = getDuplicates(alternates);
    if (duplicates.length > 0) {
        return {
            valid: false,
            error: `Duplicate alternates found: ${duplicates.join(', ')}`
        };
    }

    // Check if any alternate matches the primary value
    if (primaryValue) {
        const normalizedPrimary = normalizeString(primaryValue);
        const matchingAlternate = alternates.find(alt => normalizeString(alt) === normalizedPrimary);
        if (matchingAlternate) {
            return {
                valid: false,
                error: `Alternate "${matchingAlternate}" matches the primary value`
            };
        }
    }

    return { valid: true };
}

/**
 * Setup all alternate fields for the admin form
 */
function setupAlternateFields() {
    // Initialize empty alternate field containers
    const fields = [
        { id: 'alternateTitlesContainer', name: 'title' },
        { id: 'alternateArtistsContainer', name: 'artist' },
        { id: 'alternateGamesContainer', name: 'game' },
        { id: 'alternateDevelopersContainer', name: 'developer' },
        { id: 'alternateBossesContainer', name: 'boss' },
        { id: 'alternateAreasContainer', name: 'area' }
    ];

    fields.forEach(field => {
        initializeAlternateFields(field.id, field.name);
    });
}

/**
 * Populate alternate fields when editing a song
 */
function populateAlternateFields(song) {
    initializeAlternateFields('alternateTitlesContainer', 'title', song.alternateTitles || []);
    initializeAlternateFields('alternateArtistsContainer', 'artist', song.alternateArtists || []);
    initializeAlternateFields('alternateGamesContainer', 'game', song.alternateGames || []);
    initializeAlternateFields('alternateDevelopersContainer', 'developer', song.alternateDevelopers || []);
    initializeAlternateFields('alternateBossesContainer', 'boss', song.alternateBossBattles || []);
    initializeAlternateFields('alternateAreasContainer', 'area', song.alternateAreas || []);
}

/**
 * Clear all alternate fields
 */
function clearAlternateFields() {
    setupAlternateFields();
}

/**
 * Get all alternate data for saving
 */
function getAllAlternateData() {
    return {
        alternate_titles: getAlternateValues('title'),
        alternate_artists: getAlternateValues('artist'),
        alternate_games: getAlternateValues('game'),
        alternate_developers: getAlternateValues('developer'),
        alternate_boss_battles: getAlternateValues('boss'),
        alternate_areas: getAlternateValues('area')
    };
}

/**
 * Validate all alternate fields
 */
function validateAllAlternates(formData) {
    const validations = [
        { field: 'title', primary: formData.get('title') },
        { field: 'artist', primary: formData.get('artist') },
        { field: 'game', primary: formData.get('specificGame') },
        { field: 'developer', primary: formData.get('developer') },
        { field: 'boss', primary: formData.get('bossBattle') },
        { field: 'area', primary: formData.get('area') }
    ];

    for (const { field, primary } of validations) {
        const result = validateAlternates(field, primary);
        if (!result.valid) {
            return result;
        }
    }

    return { valid: true };
}

// Export functions for use in admin-panel.js
window.AlternateAnswersHelper = {
    setupAlternateFields,
    populateAlternateFields,
    clearAlternateFields,
    getAllAlternateData,
    validateAllAlternates,
    getAlternateValues
};
