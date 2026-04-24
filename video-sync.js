// Video Sync Module
// Functions to sync transcript with video playback

const VideoSync = (function() {
  'use strict';

  let videoTimeUpdateListener = null;
  let currentActiveIndex = -1;
  let isUserScrolling = false;
  let scrollTimeout = null;
  let boundInteractionHandler = null;

  /**
   * Seek video to specific time
   * @param {number} seconds - Time in seconds to seek to
   */
  function seekToTime(seconds) {
    const video = document.querySelector('video');
    if (video) {
      video.currentTime = seconds;
      video.play();
    }
  }

  /**
   * Detect user scrolling in transcript container
   */
  function handleUserScroll() {
    isUserScrolling = true;
    
    if (scrollTimeout) {
      clearTimeout(scrollTimeout);
    }
    
    // Wait 5 seconds before resuming auto-scroll
    scrollTimeout = setTimeout(() => {
      isUserScrolling = false;
    }, 5000);
  }

  /**
   * Update active transcript entry based on current video time
   * @param {Array} transcriptData - Array of transcript entries
   */
  function updateActiveTranscript(transcriptData) {
    const video = document.querySelector('video');
    if (!video || !transcriptData || transcriptData.length === 0) {
      return;
    }

    const currentTime = video.currentTime;
    
    let activeIndex = -1;
    for (let i = transcriptData.length - 1; i >= 0; i--) {
      if (currentTime >= transcriptData[i].start) {
        activeIndex = i;
        break;
      }
    }

    if (activeIndex !== currentActiveIndex) {
      currentActiveIndex = activeIndex;
      highlightActiveEntry(activeIndex);
    }
  }

  /**
   * Highlight active entry and scroll to it
   * @param {number} index - Index of entry to highlight
   */
  function highlightActiveEntry(index) {
    const container = document.getElementById('transcript-content');
    if (!container) return;

    const prevActive = container.querySelector('.transcript-entry.active');
    if (prevActive) {
      prevActive.classList.remove('active');
    }

    if (index >= 0) {
      const entries = container.querySelectorAll('.transcript-entry');
      if (entries[index]) {
        entries[index].classList.add('active');
        
        // Only auto-scroll if user is not manually scrolling
        if (!isUserScrolling) {
          const containerRect = container.getBoundingClientRect();
          const entryRect = entries[index].getBoundingClientRect();
          
          // Calculate relative position
          const relativeTop = entryRect.top - containerRect.top;
          const relativeBottom = entryRect.bottom - containerRect.top;
          
          // Check if element is outside visible viewport
          const isAboveView = relativeTop < 0;
          const isBelowView = relativeBottom > containerRect.height;
          
          // Only scroll if element is not fully visible
          if (isAboveView || isBelowView) {
            const entryOffset = entries[index].offsetTop;
            const containerHeight = container.clientHeight;
            const entryHeight = entries[index].offsetHeight;
            
            // Center the element in the container
            const targetScroll = entryOffset - (containerHeight / 2) + (entryHeight / 2);
            
            container.scrollTo({
              top: Math.max(0, targetScroll),
              behavior: 'smooth'
            });
          }
        }
      }
    }
  }

  /**
   * Start video time synchronization
   * @param {Array} transcriptData - Array of transcript entries
   */
  function startVideoSync(transcriptData) {
    const video = document.querySelector('video');
    if (!video) return;

    // Remove existing listener if any
    if (videoTimeUpdateListener) {
      video.removeEventListener('timeupdate', videoTimeUpdateListener);
    }

    // Create new listener
    videoTimeUpdateListener = () => updateActiveTranscript(transcriptData);
    video.addEventListener('timeupdate', videoTimeUpdateListener);

    const container = document.getElementById('transcript-content');
    if (container) {
      // Use a single named handler for all interaction events to avoid memory leaks
      boundInteractionHandler = handleUserScroll;

      container.addEventListener('scroll', boundInteractionHandler, { passive: true });
      container.addEventListener('mousedown', boundInteractionHandler, { passive: true });
      container.addEventListener('wheel', boundInteractionHandler, { passive: true });
      container.addEventListener('touchstart', boundInteractionHandler, { passive: true });
    }
  }

  /**
   * Stop video time synchronization
   */
  function stopVideoSync() {
    const video = document.querySelector('video');
    if (video && videoTimeUpdateListener) {
      video.removeEventListener('timeupdate', videoTimeUpdateListener);
      videoTimeUpdateListener = null;
    }

    const container = document.getElementById('transcript-content');
    if (container && boundInteractionHandler) {
      container.removeEventListener('scroll', boundInteractionHandler);
      container.removeEventListener('mousedown', boundInteractionHandler);
      container.removeEventListener('wheel', boundInteractionHandler);
      container.removeEventListener('touchstart', boundInteractionHandler);
    }
    boundInteractionHandler = null;

    currentActiveIndex = -1;
    isUserScrolling = false;
    
    if (scrollTimeout) {
      clearTimeout(scrollTimeout);
      scrollTimeout = null;
    }
  }

  /**
   * Reset video sync state
   */
  function resetState() {
    currentActiveIndex = -1;
    isUserScrolling = false;
    if (scrollTimeout) {
      clearTimeout(scrollTimeout);
      scrollTimeout = null;
    }
  }

  /**
   * Get current active index
   * @returns {number} Current active index
   */
  function getCurrentActiveIndex() {
    return currentActiveIndex;
  }

  // Public API
  return {
    seekToTime,
    handleUserScroll,
    updateActiveTranscript,
    highlightActiveEntry,
    startVideoSync,
    stopVideoSync,
    resetState,
    getCurrentActiveIndex
  };
})();
