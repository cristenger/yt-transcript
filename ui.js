// UI Module
// Functions to manage the transcript panel interface

const TranscriptUI = (function () {
  'use strict';

  let transcriptData = [];
  let currentSearchTerm = '';
  let isPanelMinimized = false;
  let availableLanguages = [];

  // Event handlers storage
  let eventHandlers = {
    onLoadTranscript: null,
    onRefreshTranscript: null,
    onLanguageChange: null
  };

  /**
   * Escape HTML special characters to prevent XSS
   * @param {string} text - Raw text
   * @returns {string} Escaped text safe for innerHTML
   */
  function escapeHTML(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Set transcript data
   * @param {Array} data - Transcript data array
   */
  function setTranscriptData(data) {
    transcriptData = data || [];
  }

  /**
   * Get transcript data
   * @returns {Array} Transcript data
   */
  function getTranscriptData() {
    return transcriptData;
  }

  /**
   * Clear transcript data
   */
  function clearTranscriptData() {
    transcriptData = [];
    currentSearchTerm = '';
  }

  /**
   * Set available languages
   * @param {Array} languages - Array of language objects
   */
  function setAvailableLanguages(languages) {
    availableLanguages = languages || [];
  }

  /**
   * Set event handlers
   * @param {Object} handlers - Object with handler functions
   */
  function setEventHandlers(handlers) {
    eventHandlers = { ...eventHandlers, ...handlers };
  }

  /**
   * Reset transcript panel to initial state
   */
  function resetTranscriptPanel() {
    const panel = document.getElementById('yt-transcript-panel');
    if (!panel) return;

    // Stop video sync
    VideoSync.stopVideoSync();

    // Clear state
    transcriptData = [];
    currentSearchTerm = '';
    isPanelMinimized = false;
    availableLanguages = [];

    const button = document.getElementById('load-transcript-btn');
    const refreshBtn = document.getElementById('refresh-transcript-btn');
    const searchContainer = document.getElementById('search-container');
    const languageSelectorContainer = document.getElementById('language-selector-container');
    const container = document.getElementById('transcript-content');
    const minimizeBtn = document.getElementById('minimize-panel-btn');

    // Restore load button
    if (button) {
      button.style.display = 'flex';
      button.disabled = false;
      button.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
        Load Transcript
      `;
    }

    // Hide refresh button
    if (refreshBtn) {
      refreshBtn.style.display = 'none';
      refreshBtn.disabled = false;
    }

    // Hide language selector
    if (languageSelectorContainer) {
      languageSelectorContainer.style.display = 'none';
      const languageSelect = document.getElementById('language-selector');
      if (languageSelect) {
        languageSelect.innerHTML = '';
      }
    }

    // Hide and clear search
    if (searchContainer) {
      searchContainer.style.display = 'none';
      const searchInput = document.getElementById('transcript-search');
      if (searchInput) {
        searchInput.value = '';
      }
    }

    // Restore panel state (expanded)
    if (minimizeBtn) {
      minimizeBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
      `;
      minimizeBtn.title = 'Minimize transcript';
    }

    if (panel) {
      panel.style.maxHeight = '';
    }

    // Clear content and show instructions
    if (container) {
      container.style.display = 'block';

      // Force complete cleanup
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }

      container.innerHTML = `
        <div class="transcript-instructions">
          <p>📝 Click "Load Transcript" to fetch the video captions</p>
          <p class="transcript-tip">💡 Tip: You can select different languages after loading</p>
        </div>
      `;

      // Remove all scroll listeners by cloning
      const newContainer = container.cloneNode(true);
      container.parentNode.replaceChild(newContainer, container);
    }
  }

  /**
   * Toggle panel minimize/expand
   */
  function togglePanelMinimize() {
    const panel = document.getElementById('yt-transcript-panel');
    const content = document.getElementById('transcript-content');
    const searchContainer = document.getElementById('search-container');
    const toggleBtn = document.getElementById('minimize-panel-btn');

    if (!panel || !content || !toggleBtn) return;

    isPanelMinimized = !isPanelMinimized;

    if (isPanelMinimized) {
      // Minimize
      content.style.display = 'none';
      if (searchContainer) searchContainer.style.display = 'none';
      toggleBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
      `;
      toggleBtn.title = 'Expand transcript';
      panel.style.maxHeight = 'auto';
    } else {
      // Expand
      content.style.display = 'block';
      if (searchContainer && transcriptData.length > 0) {
        searchContainer.style.display = 'block';
      }
      toggleBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
      `;
      toggleBtn.title = 'Minimize transcript';
      panel.style.maxHeight = '';
    }
  }

  /**
   * Populate language selector dropdown
   */
  function populateLanguageSelector() {
    const languageSelect = document.getElementById('language-selector');
    const languageSelectorContainer = document.getElementById('language-selector-container');

    if (!languageSelect || !languageSelectorContainer) return;

    if (availableLanguages.length === 0) {
      languageSelectorContainer.style.display = 'none';
      return;
    }

    // Clear existing options
    languageSelect.innerHTML = '';

    // Add options
    availableLanguages.forEach((lang, index) => {
      const option = document.createElement('option');
      option.value = index;
      option.textContent = lang.name;
      if (lang.isSelected) {
        option.selected = true;
      }
      languageSelect.appendChild(option);
    });

    languageSelectorContainer.style.display = 'flex';
  }

  /**
   * Display transcript entries
   * @param {Array} data - Transcript data to display
   */
  function displayTranscript(data) {
    const container = document.getElementById('transcript-content');
    if (!container) return;

    if (!data || data.length === 0) {
      container.innerHTML = '<div class="error">No transcript entries found</div>';
      return;
    }

    const currentVideoId = TranscriptUtils.getVideoId();
    if (!currentVideoId) {
      console.warn('⚠️ No video ID found, cannot display transcript');
      return;
    }

    container.innerHTML = data.map((entry, index) => `
      <div class="transcript-entry" data-start="${entry.start}" data-index="${index}">
        <span class="timestamp">${TranscriptUtils.formatTime(entry.start)}</span>
        <span class="transcript-text">${escapeHTML(entry.text)}</span>
      </div>
    `).join('');

    container.querySelectorAll('.transcript-entry').forEach(entry => {
      entry.addEventListener('click', () => {
        const startTime = parseFloat(entry.dataset.start);
        VideoSync.seekToTime(startTime);

        // Mark as manual scrolling for shorter time on click
        VideoSync.handleUserScroll();
      });
    });

    VideoSync.startVideoSync(transcriptData);
  }

  /**
   * Handle search input
   * @param {Event} e - Input event
   */
  function handleSearch(e) {
    const searchTerm = e.target.value.toLowerCase().trim();
    currentSearchTerm = searchTerm;

    if (!searchTerm) {
      displayTranscript(transcriptData);
      return;
    }

    const filtered = transcriptData.filter(entry =>
      entry.text.toLowerCase().includes(searchTerm)
    );

    if (filtered.length === 0) {
      const container = document.getElementById('transcript-content');
      container.innerHTML = '<div class="no-results">No results found</div>';
      VideoSync.stopVideoSync();
      return;
    }

    const container = document.getElementById('transcript-content');
    const escapedSearch = TranscriptUtils.escapeRegex(searchTerm);
    const regex = new RegExp(`(${escapedSearch})`, 'gi');

    container.innerHTML = filtered.map((entry, index) => {
      const safeText = escapeHTML(entry.text);
      const highlightedText = safeText.replace(regex, '<mark>$1</mark>');
      const originalIndex = transcriptData.indexOf(entry);
      return `
        <div class="transcript-entry" data-start="${entry.start}" data-index="${originalIndex}">
          <span class="timestamp">${TranscriptUtils.formatTime(entry.start)}</span>
          <span class="transcript-text">${highlightedText}</span>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.transcript-entry').forEach(entry => {
      entry.addEventListener('click', () => {
        const startTime = parseFloat(entry.dataset.start);
        VideoSync.seekToTime(startTime);
        VideoSync.handleUserScroll();
      });
    });

    VideoSync.startVideoSync(transcriptData);
  }

  /**
   * Show error message
   * @param {string} message - Error message to display
   */
  function showError(message) {
    const container = document.getElementById('transcript-content');
    if (container) {
      container.innerHTML = `
        <div class="error">
          ${escapeHTML(message)}
          <br><br>
          <strong>Troubleshooting tips:</strong><br>
          1. Check if the video has captions available<br>
          2. Try opening YouTube's native transcript panel (click ... &gt; Show transcript)<br>
          3. Enable subtitles manually and click "Retry"<br>
          4. Some videos may have transcripts disabled by the uploader
        </div>
      `;
    }
  }

  /**
   * Show loading state
   * @param {string} message - Loading message
   */
  function showLoading(message = 'Loading transcript...') {
    const container = document.getElementById('transcript-content');
    if (container) {
      container.innerHTML = `
        <div class="loading">
          <p>${message}</p>
        </div>
      `;
    }
  }

  /**
   * Copy transcript to clipboard
   */
  async function copyTranscriptToClipboard() {
    if (!transcriptData || transcriptData.length === 0) {
      return;
    }

    try {
      const text = transcriptData.map(entry => {
        const timestamp = TranscriptUtils.formatTime(entry.start);
        return `[${timestamp}] ${entry.text}`;
      }).join('\n\n');

      await navigator.clipboard.writeText(text);

      const copyBtn = document.getElementById('copy-transcript-btn');
      if (copyBtn) {
        const originalHTML = copyBtn.innerHTML;
        copyBtn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          Copied!
        `;
        copyBtn.disabled = true;

        setTimeout(() => {
          copyBtn.innerHTML = originalHTML;
          copyBtn.disabled = false;
        }, 2000);
      }
    } catch (error) {
      console.error('Failed to copy transcript:', error);
      showError('Failed to copy transcript to clipboard');
    }
  }

  /**
   * Inject transcript panel into page with retry logic
   * @param {number} maxRetries - Maximum number of retry attempts
   * @param {number} retryDelay - Delay between retries in milliseconds
   */
  async function injectTranscriptPanel(maxRetries = 2, retryDelay = 1500) {
    if (document.getElementById('yt-transcript-panel')) {
      console.log('✓ Transcript panel already exists');
      return;
    }

    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          console.log(`🔄 Retry attempt ${attempt}/${maxRetries} to inject transcript panel...`);
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        } else {
          console.log('🎯 Attempting to inject transcript panel...');
        }

        // Increase timeout for better reliability (8 seconds)
        const secondary = await TranscriptUtils.waitForElement('#secondary.style-scope.ytd-watch-flexy', 8000);

        console.log('✓ Found #secondary element, injecting panel...');

        const panel = document.createElement('div');
        panel.id = 'yt-transcript-panel';
        panel.innerHTML = `
          <div class="transcript-header">
            <div class="transcript-header-top">
              <h3>
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                Video Transcript
              </h3>
              <button id="minimize-panel-btn" class="minimize-panel-btn" title="Minimize transcript">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
            </div>
            <button id="load-transcript-btn" class="action-btn btn-primary">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
              Load Transcript
            </button>
            <button id="refresh-transcript-btn" class="action-btn btn-secondary" style="display: none;" title="Refresh and reload transcript">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
              Refresh Transcript
            </button>
            <div class="language-selector-container" id="language-selector-container" style="display: none;">
              <label for="language-selector" class="language-label">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 6px;"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                Language:
              </label>
              <select id="language-selector" class="language-selector"></select>
            </div>
            <div class="search-container" id="search-container" style="display: none;">
              <div class="search-input-wrapper">
                <svg class="search-icon-overlay" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input type="text" id="transcript-search" placeholder="Search transcript...">
              </div>
              <div class="transcript-options">
                <button id="copy-transcript-btn" class="action-btn btn-secondary">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  Copy All
                </button>
              </div>
            </div>
          </div>
          <div class="transcript-content" id="transcript-content">
            <div class="transcript-instructions">
              <p>📝 Click "Load Transcript" to fetch the video captions</p>
              <p class="transcript-tip">💡 Tip: You can select different languages after loading</p>
            </div>
          </div>
        `;

        secondary.insertBefore(panel, secondary.firstChild);

        // Attach event listeners
        document.getElementById('load-transcript-btn').addEventListener('click', eventHandlers.onLoadTranscript);
        document.getElementById('refresh-transcript-btn').addEventListener('click', eventHandlers.onRefreshTranscript);
        document.getElementById('minimize-panel-btn').addEventListener('click', togglePanelMinimize);
        document.getElementById('transcript-search').addEventListener('input', handleSearch);
        document.getElementById('copy-transcript-btn').addEventListener('click', copyTranscriptToClipboard);
        document.getElementById('language-selector').addEventListener('change', eventHandlers.onLanguageChange);

        console.log('✓ Transcript panel injected successfully');
        return; // Success - exit function

      } catch (error) {
        lastError = error;
        console.warn(`⚠️ Attempt ${attempt + 1}/${maxRetries + 1} failed:`, error.message);

        // If this was the last attempt, log final error
        if (attempt === maxRetries) {
          console.error('❌ Failed to inject transcript panel after', maxRetries + 1, 'attempts:', error);
        }
      }
    }

    // If we got here, all retries failed
    console.error('❌ Could not inject transcript panel. YouTube sidebar may not have loaded yet.');
  }

  /**
   * Update UI after loading transcript
   */
  function updateUIAfterLoad() {
    const button = document.getElementById('load-transcript-btn');
    const refreshBtn = document.getElementById('refresh-transcript-btn');
    const searchContainer = document.getElementById('search-container');

    if (button) {
      button.style.display = 'none';
    }

    if (refreshBtn) {
      refreshBtn.style.display = 'flex';
    }

    if (searchContainer) {
      searchContainer.style.display = 'block';
    }

    populateLanguageSelector();
  }

  // Public API
  return {
    setTranscriptData,
    getTranscriptData,
    clearTranscriptData,
    setAvailableLanguages,
    setEventHandlers,
    resetTranscriptPanel,
    togglePanelMinimize,
    populateLanguageSelector,
    displayTranscript,
    handleSearch,
    showError,
    showLoading,
    copyTranscriptToClipboard,
    injectTranscriptPanel,
    updateUIAfterLoad
  };
})();
