// YouTube Transcript Search Extension - Main Controller
// This file orchestrates all the modules and manages the extension lifecycle

(function() {
  'use strict';

  // Global state
  let observerInstance = null;
  let lastUrl = location.href;
  let lastVideoId = TranscriptUtils.getVideoId();
  let navigationTimeoutId = null; // Track navigation timeout to prevent memory leaks

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  /**
   * Handle load transcript button click
   */
  async function handleLoadTranscript(event) {
    const button = event.target.closest('#load-transcript-btn');
    if (!button) return;

    button.disabled = true;
    button.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" class="spinning">
        <path d="M12 2a10 10 0 1010 10h-2a8 8 0 11-8-8V2z"/>
      </svg>
      Loading...
    `;

    TranscriptUI.showLoading('Fetching transcript...');

    try {
      console.log('🎬 Loading transcript...');
      
      const transcriptData = await TranscriptExtraction.fetchTranscript();
      
      if (!transcriptData || transcriptData.length === 0) {
        throw new Error('No transcript data received');
      }

      console.log(`✓ Got ${transcriptData.length} transcript entries`);
      
      // Update UI state
      TranscriptUI.setTranscriptData(transcriptData);
      
      // Get available languages
      const availableLanguages = TranscriptExtraction.getAvailableLanguages();
      TranscriptUI.setAvailableLanguages(availableLanguages);
      
      // Display transcript
      TranscriptUI.displayTranscript(transcriptData);
      
      // Update UI buttons and show controls
      TranscriptUI.updateUIAfterLoad();
      
      console.log('✓ Transcript loaded successfully');
      
    } catch (error) {
      // Only log as error for unexpected failures, not for expected cases like disabled transcripts
      if (error.name === 'TranscriptsDisabled' || error.name === 'VideoUnavailable') {
        console.log('ℹ️ Transcript not available:', error.message);
      } else {
        console.error('❌ Failed to load transcript:', error);
      }
      
      let errorMessage = 'Failed to load transcript';
      if (error.name === 'TranscriptsDisabled') {
        errorMessage = 'Transcripts are disabled for this video';
      } else if (error.name === 'VideoUnavailable') {
        errorMessage = 'This video is unavailable';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      TranscriptUI.showError(errorMessage);
      
      // Reset button on error
      button.disabled = false;
      button.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 2a6 6 0 100 12A6 6 0 008 2zm0 1a5 5 0 110 10A5 5 0 018 3zm-.5 2.5v3h3v1h-4v-4h1z"/>
        </svg>
        Load Transcript
      `;
    }
  }

  /**
   * Handle refresh transcript button click
   */
  async function handleRefreshTranscript(event) {
    const button = event.target.closest('#refresh-transcript-btn');
    if (!button) return;

    button.disabled = true;
    button.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" class="spinning">
        <path d="M13.65 2.35A8 8 0 1 0 16 8h-2a6 6 0 1 1-1.76-4.24L10 6h6V0l-2.35 2.35z"/>
      </svg>
      Refreshing...
    `;

    TranscriptUI.showLoading('Refreshing transcript...');
    
    // Stop video sync
    VideoSync.stopVideoSync();

    try {
      console.log('🔄 Refreshing transcript...');
      
      const transcriptData = await TranscriptExtraction.fetchTranscript();
      
      if (!transcriptData || transcriptData.length === 0) {
        throw new Error('No transcript data received');
      }

      console.log(`✓ Got ${transcriptData.length} transcript entries`);
      
      // Update UI state
      TranscriptUI.setTranscriptData(transcriptData);
      
      // Get available languages
      const availableLanguages = TranscriptExtraction.getAvailableLanguages();
      TranscriptUI.setAvailableLanguages(availableLanguages);
      
      // Display transcript
      TranscriptUI.displayTranscript(transcriptData);
      
      // Update language selector
      TranscriptUI.populateLanguageSelector();
      
      console.log('✓ Transcript refreshed successfully');
      
    } catch (error) {
      console.error('❌ Failed to refresh transcript:', error);
      TranscriptUI.showError('Failed to refresh transcript: ' + error.message);
    } finally {
      button.disabled = false;
      button.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M13.65 2.35A8 8 0 1 0 16 8h-2a6 6 0 1 1-1.76-4.24L10 6h6V0l-2.35 2.35z"/>
        </svg>
        Refresh Transcript
      `;
    }
  }

  /**
   * Handle language change from dropdown
   */
  async function handleLanguageChange(event) {
    const selectedIndex = parseInt(event.target.value);
    const availableLanguages = TranscriptExtraction.getAvailableLanguages();
    const selectedLang = availableLanguages[selectedIndex];
    
    if (!selectedLang || !selectedLang.params) {
      console.warn('No valid language selected');
      return;
    }
    
    console.log(`🌐 Changing language to: ${selectedLang.name}`);
    
    // Show loading state
    TranscriptUI.showLoading(`Loading ${selectedLang.name} transcript...`);
    
    // Stop current video sync
    VideoSync.stopVideoSync();
    
    try {
      // Fetch transcript in new language
      // Note: The extraction module will use the selected language's params
      const transcriptData = await TranscriptExtraction.fetchTranscript();
      
      if (!transcriptData || transcriptData.length === 0) {
        throw new Error('No transcript data received for selected language');
      }
      
      console.log(`✓ Got ${transcriptData.length} entries in ${selectedLang.name}`);
      
      // Update UI
      TranscriptUI.setTranscriptData(transcriptData);
      TranscriptUI.displayTranscript(transcriptData);
      
      console.log(`✓ Language changed to: ${selectedLang.name}`);
      
    } catch (error) {
      console.error('❌ Failed to change language:', error);
      TranscriptUI.showError('Failed to load transcript in selected language');
    }
  }

  // ============================================================================
  // NAVIGATION DETECTION
  // ============================================================================

  /**
   * Watch for navigation changes (video changes)
   */
  function watchForNavigation() {
    // Check for URL/video changes
    const checkUrlChange = () => {
      const currentUrl = location.href;
      const currentVideoId = TranscriptUtils.getVideoId();
      
      // Ignore temporary null videoId during YouTube navigation
      if (!currentVideoId && currentUrl.includes('/watch')) {
        // YouTube is transitioning, wait for actual video ID
        return;
      }
      
      // Detect change in video, not just URL
      if (currentUrl !== lastUrl || currentVideoId !== lastVideoId) {
        // Only log if we have a valid video ID (avoid "null → null" logs)
        if (currentVideoId || lastVideoId) {
          console.log('🔄 Video changed:', lastVideoId, '→', currentVideoId);
        }
        
        const previousVideoId = lastVideoId;
        lastUrl = currentUrl;
        lastVideoId = currentVideoId;
        
        // Check if we're on a watch page with valid video ID
        if (currentUrl.includes('/watch') && currentVideoId) {
          // Clear any pending navigation timeout
          if (navigationTimeoutId) {
            clearTimeout(navigationTimeoutId);
            navigationTimeoutId = null;
          }
          
          // Clear data immediately to prevent showing stale data
          VideoSync.stopVideoSync();
          TranscriptUI.clearTranscriptData();
          TranscriptExtraction.resetLanguageCache();
          
          // Also clear the UI immediately
          const container = document.getElementById('transcript-content');
          if (container) {
            container.innerHTML = '<div class="transcript-instructions"><p>⏳ Loading new video...</p></div>';
          }
          
          // Give YouTube MORE time to load the new video and update ytInitialData
          // YouTube's SPA navigation can take a while to update the page data
          navigationTimeoutId = setTimeout(() => {
            navigationTimeoutId = null; // Clear reference
            
            // Verify we're still on the same video (no another navigation happened)
            const currentCheckVideoId = TranscriptUtils.getVideoId();
            
            if (currentCheckVideoId !== currentVideoId) {
              return; // Video changed again, skip reset
            }
            
            const panel = document.getElementById('yt-transcript-panel');
            if (panel) {
              TranscriptUI.resetTranscriptPanel();
            } else {
              init();
            }
          }, 2000);
        }
      }
    };
    
    // Observe DOM changes (for SPA navigation)
    const observer = new MutationObserver(checkUrlChange);
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    observerInstance = observer;
    
    // Listen to YouTube's native navigation events
    window.addEventListener('yt-navigate-finish', checkUrlChange);
    window.addEventListener('yt-page-data-updated', checkUrlChange);
    window.addEventListener('popstate', checkUrlChange);
  }

  // ============================================================================
  // CLEANUP
  // ============================================================================

  /**
   * Cleanup function to prevent memory leaks
   */
  function cleanup() {
    console.log('🧹 Cleaning up extension resources...');
    
    // Disconnect MutationObserver
    if (observerInstance) {
      observerInstance.disconnect();
      observerInstance = null;
    }
    
    // Clear any pending navigation timeout
    if (navigationTimeoutId) {
      clearTimeout(navigationTimeoutId);
      navigationTimeoutId = null;
    }
    
    // Stop video sync
    VideoSync.stopVideoSync();
    
    // Clear transcript data
    TranscriptUI.clearTranscriptData();
    
    console.log('✓ Cleanup complete');
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  /**
   * Initialize extension
   */
  async function init() {
    console.log('🚀 Initializing YouTube Transcript Search...');
    
    const videoId = TranscriptUtils.getVideoId();
    if (!videoId) {
      console.warn('⚠️ No video ID found');
      return;
    }
    
    console.log('📺 Video ID:', videoId);
    
    // Inject page script for CORS bypass
    TranscriptExtraction.injectFetchHandler();
    
    // Set up event handlers for UI
    TranscriptUI.setEventHandlers({
      onLoadTranscript: handleLoadTranscript,
      onRefreshTranscript: handleRefreshTranscript,
      onLanguageChange: handleLanguageChange
    });
    
    // Inject transcript panel
    await TranscriptUI.injectTranscriptPanel();
    
    // Start watching for navigation changes
    if (!observerInstance) {
      watchForNavigation();
    }
    
    console.log('✓ Initialization complete');
  }

  // ============================================================================
  // ENTRY POINT
  // ============================================================================

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Cleanup when extension is disabled or page unloads
  window.addEventListener('beforeunload', cleanup);

  console.log('✓ YouTube Transcript Search extension loaded');
})();
