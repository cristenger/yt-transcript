// Data Extraction Module
// Functions to extract and fetch transcript data from YouTube

const TranscriptExtraction = (function() {
  'use strict';

  let availableLanguages = []; // Store available languages
  let currentLanguageParams = null; // Store current language params
  let lastVideoId = null; // Track last video ID to detect changes
  let lastTranscriptParams = null; // Track last params used

  /**
   * Extract transcript directly from YouTube's native transcript panel DOM
   * This is a fallback method when API methods fail
   * @returns {Promise<Array|null>} Transcript data or null
   */
  /**
   * Parse timestamp string to seconds
   * @param {string} timestampText - Timestamp like "0:00", "1:23", "1:23:45"
   * @returns {number} Seconds
   */
  function parseTimestamp(timestampText) {
    const timeParts = timestampText.split(':').map(p => parseInt(p, 10));
    if (timeParts.length === 2) {
      return timeParts[0] * 60 + timeParts[1];
    } else if (timeParts.length === 3) {
      return timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2];
    }
    return 0;
  }

  /**
   * Calculate durations for transcript entries based on next segment start times
   * @param {Array} transcriptData - Array of transcript entries
   */
  function calculateDurations(transcriptData) {
    for (let i = 0; i < transcriptData.length - 1; i++) {
      transcriptData[i].duration = transcriptData[i + 1].start - transcriptData[i].start;
    }
    if (transcriptData.length > 0) {
      transcriptData[transcriptData.length - 1].duration = 3;
    }
  }

  /**
   * Try to extract transcript segments from the modern YouTube view model DOM
   * YouTube 2025+ uses transcript-segment-view-model instead of ytd-transcript-segment-renderer
   * @param {Element} container - Container element to search within
   * @returns {Array|null} Transcript data or null
   */
  function extractFromModernDOM(container) {
    const segments = container.querySelectorAll('transcript-segment-view-model');
    if (!segments || segments.length === 0) return null;

    console.log(`📝 Found ${segments.length} modern transcript segments`);
    const transcriptData = [];

    for (const segment of segments) {
      const timestampEl = segment.querySelector('.ytwTranscriptSegmentViewModelTimestamp');
      const textEl = segment.querySelector('.yt-core-attributed-string[role="text"], .yt-core-attributed-string');

      if (timestampEl && textEl) {
        const timestampText = timestampEl.textContent.trim();
        const text = textEl.textContent.trim();
        if (text) {
          transcriptData.push({
            start: parseTimestamp(timestampText),
            duration: 0,
            text: text
          });
        }
      }
    }

    return transcriptData.length > 0 ? transcriptData : null;
  }

  /**
   * Try to extract transcript segments from the legacy YouTube DOM
   * @param {Element} container - Container element to search within
   * @returns {Array|null} Transcript data or null
   */
  function extractFromLegacyDOM(container) {
    const segments = container.querySelectorAll('ytd-transcript-segment-renderer');
    if (!segments || segments.length === 0) return null;

    console.log(`📝 Found ${segments.length} legacy transcript segments`);
    const transcriptData = [];

    for (const segment of segments) {
      const timestampEl = segment.querySelector('.segment-timestamp');
      const textEl = segment.querySelector('.segment-text');

      if (timestampEl && textEl) {
        const timestampText = timestampEl.textContent.trim();
        const text = textEl.textContent.trim();
        if (text) {
          transcriptData.push({
            start: parseTimestamp(timestampText),
            duration: 0,
            text: text
          });
        }
      }
    }

    return transcriptData.length > 0 ? transcriptData : null;
  }

  /**
   * Close the native transcript panel
   * @param {boolean} panelWasOpened - Whether the panel was opened by us
   */
  function closeNativeTranscriptPanel(panelWasOpened) {
    if (!panelWasOpened) return;

    console.log('🔒 Closing native transcript panel...');
    const closeBtn = document.querySelector(
      'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"] button[aria-label*="Cerrar" i], ' +
      'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"] button[aria-label*="Close" i], ' +
      'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"] #visibility-button button, ' +
      'ytd-engagement-panel-section-list-renderer[target-id="PAmodern_transcript_view"] button[aria-label*="Cerrar" i], ' +
      'ytd-engagement-panel-section-list-renderer[target-id="PAmodern_transcript_view"] button[aria-label*="Close" i], ' +
      'ytd-engagement-panel-section-list-renderer[target-id="PAmodern_transcript_view"] #visibility-button button'
    );

    if (closeBtn) {
      closeBtn.click();
      console.log('✓ Native panel closed');
    }
  }

  async function extractTranscriptFromDOM() {
    try {
      console.log('🔍 Trying to extract transcript from YouTube DOM...');

      // First check if modern transcript segments already exist anywhere in the page
      // (e.g., in an already-opened panel)
      let transcriptData = extractFromModernDOM(document);
      if (transcriptData) {
        console.log(`✓ Extracted ${transcriptData.length} entries from modern DOM (already visible)`);
        calculateDurations(transcriptData);
        return transcriptData;
      }

      // Check for legacy panel already open
      let transcriptPanel = document.querySelector('ytd-transcript-renderer[panel-content-visible]');
      if (transcriptPanel) {
        transcriptData = extractFromLegacyDOM(transcriptPanel);
        if (transcriptData) {
          console.log(`✓ Extracted ${transcriptData.length} entries from legacy DOM (already visible)`);
          calculateDurations(transcriptData);
          return transcriptData;
        }
      }

      // Panel not visible - try to open it
      console.log('📋 Transcript panel not visible, trying to open it...');
      let panelWasOpened = false;

      // Try to find and click the "Show transcript" button
      const showTranscriptBtn = document.querySelector(
        'ytd-video-description-transcript-section-renderer button, ' +
        'button[aria-label*="transcript" i], ' +
        'button[aria-label*="transcripción" i], ' +
        'button[aria-label*="Mostrar transcripción" i]'
      );

      if (showTranscriptBtn) {
        console.log('🖱️ Clicking "Show transcript" button...');
        showTranscriptBtn.click();
        panelWasOpened = true;

        // Wait for the panel to load (modern panels may take longer)
        await new Promise(resolve => setTimeout(resolve, 2500));

        // Try modern DOM first (YouTube 2025+)
        transcriptData = extractFromModernDOM(document);
        if (transcriptData) {
          console.log(`✓ Extracted ${transcriptData.length} entries from modern DOM`);
          calculateDurations(transcriptData);
          closeNativeTranscriptPanel(panelWasOpened);
          return transcriptData;
        }

        // Try legacy DOM
        transcriptPanel = document.querySelector('ytd-transcript-renderer[panel-content-visible]');
        if (transcriptPanel) {
          transcriptData = extractFromLegacyDOM(transcriptPanel);
          if (transcriptData) {
            console.log(`✓ Extracted ${transcriptData.length} entries from legacy DOM`);
            calculateDurations(transcriptData);
            closeNativeTranscriptPanel(panelWasOpened);
            return transcriptData;
          }
        }

        closeNativeTranscriptPanel(panelWasOpened);
      }

      console.log('ℹ️ Could not extract transcript from DOM');
      return null;
    } catch (error) {
      console.log('ℹ️ Error extracting transcript from DOM, will show error to user');
      return null;
    }
  }

  /**
   * Inject page script handler for bypassing CORS
   */
  function injectFetchHandler() {
    if (window.__transcriptFetchHandlerInjected) {
      return;
    }
    window.__transcriptFetchHandlerInjected = true;
    
    const script = document.createElement('script');
    
    try {
      script.src = chrome.runtime.getURL('page-script.js');
      script.onload = function() {
        this.remove();
      };
      script.onerror = function(error) {
        console.error('✗ Failed to load page-script.js:', error);
      };
      (document.head || document.documentElement).appendChild(script);
    } catch (error) {
      console.error('Error injecting page-script.js:', error);
    }
  }

  /**
   * Extract data from page context (ytInitialData, ytInitialPlayerResponse)
   * @returns {Promise<Object>} Promise with extracted data
   */
  function extractDataFromPageContext() {
    return new Promise((resolve) => {
      const eventId = 'dataExtract_' + Date.now() + '_' + Math.random();
      let timeoutId = null;
      let isResolved = false;
      
      const responseHandler = (event) => {
        if (event.detail.eventId === eventId) {
          if (isResolved) return; // Prevent double resolution
          isResolved = true;
          
          window.removeEventListener('dataExtractResponse', responseHandler);
          
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
          
          // Validate that the extracted data matches current video
          const currentVideoId = TranscriptUtils.getVideoId();
          const extractedData = event.detail.data;
          
          // Check if ytInitialData contains the current video ID
          // Skip validation if currentVideoId is null (page is transitioning)
          if (extractedData.ytInitialData && currentVideoId) {
            const dataStr = JSON.stringify(extractedData.ytInitialData);
            if (!dataStr.includes(currentVideoId)) {
              console.warn('⚠️ Extracted data does not match current video ID. Data may be stale.');
              // Return empty data to force a retry or alternative method
              resolve({ ytInitialData: null, ytInitialPlayerResponse: null });
              return;
            }
          }
          
          resolve(event.detail.data);
        }
      };
      
      window.addEventListener('dataExtractResponse', responseHandler);
      
      window.dispatchEvent(new CustomEvent('dataExtractRequest', {
        detail: { eventId }
      }));
      
      timeoutId = setTimeout(() => {
        if (isResolved) return; // Already resolved
        isResolved = true;
        
        window.removeEventListener('dataExtractResponse', responseHandler);
        resolve({ ytInitialData: null, ytInitialPlayerResponse: null });
      }, 2000);
    });
  }

  /**
   * Fetch transcript via page context to bypass CORS
   * Uses the youtubei/v1/get_transcript endpoint
   * @param {string} params - Transcript params from engagement panel
   * @param {string} videoId - Video ID for the transcript request
   * @returns {Promise<Object>} Promise with transcript API response
   */
  function fetchTranscriptViaPageContext(params, videoId = null) {
    return new Promise((resolve, reject) => {
      const eventId = 'transcriptApi_' + Date.now() + '_' + Math.random();
      let timeoutId = null;
      let isResolved = false;
      
      // Get current video ID if not provided
      const currentVideoId = videoId || TranscriptUtils.getVideoId();
      
      const responseHandler = (event) => {
        if (event.detail && event.detail.eventId === eventId) {
          if (isResolved) return; // Prevent double resolution
          isResolved = true;
          
          window.removeEventListener('transcriptApiResponse', responseHandler);
          
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
          
          if (event.detail.success) {
            resolve(event.detail.data);
          } else {
            // Don't log as error since this is an expected fallback path
            reject(new Error(event.detail.error || 'Transcript API failed'));
          }
        }
      };
      
      window.addEventListener('transcriptApiResponse', responseHandler);
      
      window.dispatchEvent(new CustomEvent('transcriptApiRequest', {
        detail: { params, eventId, videoId: currentVideoId }
      }));
      
      timeoutId = setTimeout(() => {
        if (isResolved) return; // Already resolved
        isResolved = true;
        
        window.removeEventListener('transcriptApiResponse', responseHandler);
        console.error('⏱️ Transcript API timeout after 15 seconds');
        reject(new Error('Transcript API timeout'));
      }, 15000);
    });
  }

  /**
   * Fetch URL via page context to bypass CORS
   * @param {string} url - URL to fetch
   * @returns {Promise<string>} Promise with response text
   */
  function fetchViaPageContext(url) {
    return new Promise((resolve, reject) => {
      const eventId = 'transcriptFetch_' + Date.now() + '_' + Math.random();
      let timeoutId = null;
      let isResolved = false;
      
      const responseHandler = (event) => {
        if (event.detail && event.detail.eventId === eventId) {
          if (isResolved) return; // Prevent double resolution
          isResolved = true;
          
          window.removeEventListener('transcriptFetchResponse', responseHandler);
          
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
          
          if (event.detail.success) {
            if (!event.detail.data || event.detail.data.length === 0) {
              reject(new Error('Empty response from API'));
            } else {
              resolve(event.detail.data);
            }
          } else {
            reject(new Error(event.detail.error || 'Fetch failed'));
          }
        }
      };
      
      window.addEventListener('transcriptFetchResponse', responseHandler);
      
      window.dispatchEvent(new CustomEvent('transcriptFetchRequest', {
        detail: { url, eventId }
      }));
      
      timeoutId = setTimeout(() => {
        if (isResolved) return; // Already resolved
        isResolved = true;
        
        window.removeEventListener('transcriptFetchResponse', responseHandler);
        console.error('⏱️ Fetch timeout after 10 seconds');
        reject(new Error('Fetch timeout'));
      }, 10000);
    });
  }

  /**
   * Extract JSON data from HTML
   * @param {string} html - HTML content
   * @param {string} key - Key to search for (ytInitialData, ytInitialPlayerResponse)
   * @returns {Object} Parsed JSON object
   */
  function extractJsonFromHtml(html, key) {
    const regexes = [
      new RegExp(`window\\["${key}"\\]\\s*=\\s*({[\\s\\S]+?})\\s*;`),
      new RegExp(`var ${key}\\s*=\\s*({[\\s\\S]+?})\\s*;`),
      new RegExp(`${key}\\s*=\\s*({[\\s\\S]+?})\\s*;`)
    ];
    
    for (const regex of regexes) {
      const match = html.match(regex);
      if (match && match[1]) {
        try {
          return JSON.parse(match[1]);
        } catch (err) {
          console.warn(`⚠️ Failed to parse ${key}:`, err.message);
        }
      }
    }
    
    throw new Error(`${key} not found`);
  }

  // Transcript panel title variations in different languages
  const TRANSCRIPT_TITLE_VARIANTS = [
    'transcript', 'transcripción', 'transcrição', 'transkript', 
    'transcription', 'trascrizione', '트랜스크립트', '字幕', 'ondertiteling'
  ];

  /**
   * Find transcript panel in engagement panels array
   * Uses multiple detection methods for robustness
   * @param {Array} panels - Array of engagement panels
   * @returns {Object|null} Transcript panel or null
   */
  function findTranscriptPanel(panels) {
    if (!panels || !Array.isArray(panels)) return null;

    return panels.find(p => {
      const renderer = p.engagementPanelSectionListRenderer;
      if (!renderer) return false;

      // Method 1: Check for getTranscriptEndpoint (most reliable)
      const hasEndpoint = renderer.content?.continuationItemRenderer?.continuationEndpoint?.getTranscriptEndpoint;
      if (hasEndpoint) return true;

      // Method 2: Check title text in various languages
      const title = renderer.header?.engagementPanelTitleHeaderRenderer?.title?.simpleText?.toLowerCase() || '';
      if (TRANSCRIPT_TITLE_VARIANTS.some(variant => title.includes(variant))) return true;

      // Method 3: Check for transcript in panel identifier
      const panelId = renderer.panelIdentifier?.toLowerCase() || '';
      if (panelId.includes('transcript')) return true;

      // Method 4: Check targetId for engagement-panel-transcript or modern transcript
      const targetId = renderer.targetId?.toLowerCase() || '';
      if (targetId.includes('transcript')) return true;

      // Method 5: Check targetId for modern panel IDs (YouTube 2025+)
      if (targetId === 'pamodern_transcript_view') return true;

      return false;
    });
  }

  /**
   * Fetch transcript directly from caption track URL (most reliable method)
   * @param {string} baseUrl - Caption track base URL
   * @param {string} videoId - Video ID for logging
   * @returns {Promise<Array>} Promise with transcript data
   */
  async function fetchTranscriptFromCaptionUrl(baseUrl, videoId) {
    try {
      console.log('📥 Fetching transcript from caption URL...');
      console.log('📥 Full Base URL:', baseUrl);
      
      // Ensure the URL is valid
      if (!baseUrl || !baseUrl.startsWith('http')) {
        throw new Error('Invalid caption URL');
      }
      
      // Add json3 format for easier parsing
      const url = new URL(baseUrl);
      url.searchParams.set('fmt', 'json3');
      
      const finalUrl = url.toString();
      console.log('📥 Final URL with fmt=json3:', finalUrl);
      console.log('📥 Requesting via page context (bypasses CORS)...');
      
      // Use fetchViaPageContext to bypass CORS restrictions
      const text = await fetchViaPageContext(finalUrl);
      
      console.log('📥 Response length:', text.length, 'chars');
      console.log('📥 Response preview:', text.substring(0, 200));
      
      // Try parsing as JSON first
      try {
        const data = JSON.parse(text);
        
        if (data.events) {
          const transcriptData = data.events
            .filter(e => e.segs)
            .map(e => ({
              start: (e.tStartMs || 0) / 1000,
              duration: (e.dDurationMs || 0) / 1000,
              text: e.segs.map(seg => seg.utf8 || '').join(' ').replace(/\n/g, ' ').trim()
            }))
            .filter(item => item.text !== '');
          
          console.log(`✓ Extracted ${transcriptData.length} transcript entries from JSON`);
          return transcriptData;
        }
      } catch (jsonError) {
        console.log('📥 Not JSON, trying XML...');
      }
      
      // Try parsing as XML
      if (text.includes('<transcript>') || text.includes('<text')) {
        const matches = [...text.matchAll(/<text start="([^"]*)" dur="([^"]*)">([^<]*)<\/text>/g)];
        if (matches.length > 0) {
          const transcriptData = matches.map(match => ({
            start: parseFloat(match[1]),
            duration: parseFloat(match[2]),
            text: TranscriptUtils.decodeHTMLEntities(match[3])
          }));
          
          console.log(`✓ Extracted ${transcriptData.length} transcript entries from XML`);
          return transcriptData;
        }
      }
      
      throw new Error('Could not parse caption response as JSON or XML');
    } catch (error) {
      // Don't log as error - this is part of the fallback chain
      throw error;
    }
  }

  /**
   * Get transcript from YouTube's engagement panel API
   * @param {Object} ytData - YouTube initial data
   * @param {string} languageCode - Optional language code
   * @returns {Promise<Array>} Promise with transcript data
   */
  async function getTranscriptFromPanel(ytData, languageCode = null) {
    try {
      const panels = ytData?.engagementPanels || [];
      
      // Use centralized panel finder
      const transcriptPanel = findTranscriptPanel(panels);
      
      if (!transcriptPanel) {
        throw new Error("Could not find transcript panel");
      }
      
      console.log('🔧 CODE VERSION: 2024-12-05-CAPTION-PAGECONTEXT-V6');
      
      // Try to extract available languages from player response
      const playerResponse = ytData?.ytInitialPlayerResponse || window.ytInitialPlayerResponse;
      let captionTracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
      
      if (captionTracks.length > 0) {
        console.log(`🌐 Found ${captionTracks.length} available languages`);
      }
      
      const initialParams = transcriptPanel.engagementPanelSectionListRenderer?.content?.continuationItemRenderer?.continuationEndpoint?.getTranscriptEndpoint?.params;
      
      if (!initialParams) {
        throw new Error("Could not find continuation params");
      }
      
      // IMPORTANT: Store params hash to detect if they're from a different video
      // Params are base64 encoded strings that are unique per video
      const currentVideoId = TranscriptUtils.getVideoId();
      
      // If we have params from a previous request, check if they match
      if (lastTranscriptParams && lastTranscriptParams === initialParams) {
        // Same params as before - check if video changed
        if (lastVideoId && currentVideoId !== lastVideoId) {
          console.warn('⚠️ Detected stale transcript params!');
          console.warn('  Previous video:', lastVideoId);
          console.warn('  Current video:', currentVideoId);
          throw new Error('Transcript params are stale (params match previous video)');
        }
      }
      
      // Update tracking
      lastVideoId = currentVideoId;
      lastTranscriptParams = initialParams;
      
      console.log('📤 Making transcript API request via page context...');
      console.log('📤 Video ID:', currentVideoId);
      
      // Use page script to make the API call (avoids CORS issues)
      const json = await fetchTranscriptViaPageContext(initialParams, currentVideoId);
      
      console.log('📥 API response received');
      console.log('✓ Transcript data received successfully');
      
      const transcriptRenderer = json.actions?.[0]?.updateEngagementPanelAction?.content?.transcriptRenderer;
      
      // Extract available languages from caption tracks (more reliable than footer)
      console.log('🔍 Extracting available languages from caption tracks...');
      
      if (captionTracks.length > 1) {
        // Build language menu from caption tracks
        // Each track can be converted to transcript via API
        availableLanguages = captionTracks.map(track => {
          const languageName = track.name?.simpleText || track.languageCode || 'Unknown';
          const languageCode = track.languageCode || '';
          
          // Generate params for this language by encoding the video ID and language
          // This is a simplified approach - ideally we'd get real params from the API
          const isCurrentLanguage = track.vssId?.includes(hl) || languageCode === hl;
          
          return {
            name: languageName,
            code: languageCode,
            vssId: track.vssId,
            params: null, // We'll need to fetch transcript for each language separately
            isSelected: isCurrentLanguage,
            baseUrl: track.baseUrl
          };
        });
      } else {
        availableLanguages = [];
      }
      
      // Determine target params
      let targetParams = initialParams;
      
      if (languageCode && availableLanguages.length > 0) {
        const targetLang = availableLanguages.find(lang => {
          const langName = lang.name.toLowerCase();
          const code = languageCode.toLowerCase();
          return langName.includes(code) || 
                 langName.includes(code.split('-')[0]) ||
                 (code === 'es' && (langName.includes('español') || langName.includes('spanish'))) ||
                 (code === 'en' && langName.includes('english')) ||
                 (code === 'pt' && (langName.includes('português') || langName.includes('portuguese'))) ||
                 (code === 'fr' && (langName.includes('français') || langName.includes('french')));
        });
        
        if (targetLang && targetLang.params) {
          targetParams = targetLang.params;
          currentLanguageParams = targetParams;
        }
      } else {
        currentLanguageParams = targetParams;
      }
      
      // Fetch transcript in selected language if different
      let finalJson = json;
      if (targetParams !== initialParams) {
        const langRes = await fetch("https://www.youtube.com/youtubei/v1/get_transcript?prettyPrint=false", {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "X-YouTube-Client-Name": "1",
            "X-YouTube-Client-Version": body.context.client.clientVersion
          },
          body: JSON.stringify({ ...body, params: targetParams })
        });
        
        if (langRes.ok) {
          finalJson = await langRes.json();
        }
      }
      
      // Extract segments - try multiple response paths (YouTube changes these periodically)
      let segments = [];

      // Path 1: Legacy format (pre-2025)
      segments = finalJson.actions?.[0]?.updateEngagementPanelAction?.content?.transcriptRenderer
        ?.content?.transcriptSearchPanelRenderer?.body?.transcriptSegmentListRenderer?.initialSegments || [];

      // Path 2: Modern format (2025+) - different nesting
      if (segments.length === 0) {
        segments = finalJson.actions?.[0]?.updateEngagementPanelAction?.content?.transcriptRenderer
          ?.body?.transcriptSegmentListRenderer?.initialSegments || [];
      }

      // Path 3: Direct transcript segments in actions
      if (segments.length === 0) {
        segments = finalJson.actions?.[0]?.updateEngagementPanelAction?.content
          ?.structuredDescriptionContentRenderer?.items?.flatMap(item =>
            item?.transcriptSectionRenderer?.content?.transcriptSegmentListRenderer?.initialSegments || []
          ) || [];
      }

      // Path 4: Try transcriptBodyRenderer (newer API format)
      if (segments.length === 0) {
        segments = finalJson.actions?.[0]?.updateEngagementPanelAction?.content
          ?.transcriptBodyRenderer?.segmentList?.initialSegments || [];
      }

      if (segments.length === 0) {
        console.warn('⚠️ API returned empty segments');
        console.log('📊 Response structure keys:', JSON.stringify(Object.keys(finalJson || {})));
        if (finalJson.actions?.[0]) {
          console.log('📊 Action keys:', JSON.stringify(Object.keys(finalJson.actions[0])));
          const updateAction = finalJson.actions[0].updateEngagementPanelAction;
          if (updateAction?.content) {
            console.log('📊 Content keys:', JSON.stringify(Object.keys(updateAction.content)));
          }
        }
        return [];
      }

      const transcriptData = segments.map(item => {
        // Legacy: transcriptSegmentRenderer
        const seg = item?.transcriptSegmentRenderer;
        if (seg) {
          const text = seg.snippet?.runs?.map(r => r.text).join(" ") || "";
          const startMs = seg.startMs || 0;
          return {
            start: startMs / 1000,
            duration: 0,
            text: text
          };
        }

        // Modern: macroMarkersPanelItemViewModel > timelineItemViewModel
        const modernSeg = item?.macroMarkersPanelItemViewModel?.timelineItemViewModel
          ?.transcriptSegmentViewModel;
        if (modernSeg) {
          const text = modernSeg.text || modernSeg.snippet || "";
          const startMs = modernSeg.startMs || modernSeg.timestampMs || 0;
          return {
            start: startMs / 1000,
            duration: 0,
            text: text
          };
        }

        return null;
      }).filter(item => item !== null && item.text);

      return transcriptData;
      
    } catch (error) {
      // Don't log as error - this is part of the fallback chain
      throw error;
    }
  }

  /**
   * Extract transcript from HTML content
   * @param {string} html - HTML content
   * @param {string} languageCode - Optional language code
   * @returns {Promise<Array|string>} Promise with transcript data or URL
   */
  async function extractTranscriptFromHtml(html, languageCode = null) {
    let ytData = extractJsonFromHtml(html, "ytInitialData");
    
    if (ytData) {
      const panels = ytData?.engagementPanels || [];
      
      // Use centralized panel finder
      const transcriptPanel = findTranscriptPanel(panels);
      
      if (transcriptPanel) {
        console.log('✓ Found transcript panel in ytInitialData');
        return await getTranscriptFromPanel(ytData, languageCode);
      }
    }
    
    const playerData = extractJsonFromHtml(html, "ytInitialPlayerResponse");
    
    if (playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks) {
      const tracks = playerData.captions.playerCaptionsTracklistRenderer.captionTracks;
      
      let track = null;
      if (languageCode) {
        // If specific language requested, try to find it
        track = tracks.find(t => t.languageCode === languageCode);
      }
      
      // If no specific language or not found, use first available track (respects YouTube's order)
      if (!track) {
        track = tracks[0];
      }
      
      if (track && track.baseUrl) {
        return track.baseUrl;
      }
    }
    
    throw new TranscriptErrors.TranscriptsDisabled(TranscriptUtils.getVideoId());
  }

  /**
   * Extract transcript from current page (DEPRECATED - Use getTranscriptUrl instead)
   * Kept for compatibility
   */
  async function extractTranscriptFromPage(videoId, languageCode = null) {
    return await getTranscriptUrl(videoId, languageCode);
  }

  /**
   * Extract captions from player (fallback method)
   */
  function extractCaptionsFromPlayer() {
    return new Promise((resolve) => {
      const eventId = 'captionsExtract_' + Date.now() + '_' + Math.random();
      let timeoutId = null;
      let isResolved = false;
      
      const responseHandler = (event) => {
        if (event.detail && event.detail.eventId === eventId) {
          if (isResolved) return; // Prevent double resolution
          isResolved = true;
          
          window.removeEventListener('captionsExtractResponse', responseHandler);
          
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
          
          if (event.detail.success && event.detail.data) {
            resolve(event.detail.data);
          } else {
            resolve(null);
          }
        }
      };
      
      window.addEventListener('captionsExtractResponse', responseHandler);
      
      window.dispatchEvent(new CustomEvent('captionsExtractRequest', {
        detail: { eventId }
      }));
      
      timeoutId = setTimeout(() => {
        if (isResolved) return; // Already resolved
        isResolved = true;
        
        window.removeEventListener('captionsExtractResponse', responseHandler);
        resolve(null);
      }, 3000);
    });
  }

  /**
   * Get transcript URL or data for video (PRIORITY: Engagement Panel API)
   * @param {string} videoId - Video ID
   * @param {string} languageCode - Optional language code
   * @returns {Promise<Array|string>} Promise with transcript data or URL
   */
  async function getTranscriptUrl(videoId, languageCode = null) {
    console.log('Looking for caption tracks...');
    
    try {
      const videoUrl = window.location.href;
      const isShorts = /youtube\.com\/shorts\//.test(videoUrl);
      
      if (isShorts) {
        const transformedUrl = `https://www.youtube.com/watch?v=${videoId}`;
        console.log("Transforming Shorts URL:", transformedUrl);
        
        const response = await chrome.runtime.sendMessage({
          action: "fetchTransformedUrl",
          url: transformedUrl
        });
        
        if (!response.success) {
          throw new Error("Failed to fetch transformed URL: " + response.error);
        }
        
        return await extractTranscriptFromHtml(response.html, languageCode);
      }

      // Detect active subtitle language if not specified
      let targetLanguage = languageCode;
      if (!targetLanguage) {
        // Priority 1: Check if user has subtitles currently active
        const activeLanguage = TranscriptUtils.getActiveSubtitleLanguage();
        if (activeLanguage) {
          console.log('🌐 Using active subtitle language:', activeLanguage);
          targetLanguage = activeLanguage;
        } else {
          // Priority 2: Use YouTube interface language (respects user's YouTube language setting)
          const ytLanguage = document.documentElement.lang || navigator.language?.split('-')[0];
          if (ytLanguage && ytLanguage !== 'en') {
            console.log('🌐 Using YouTube/browser language:', ytLanguage);
            targetLanguage = ytLanguage;
          }
          // If language is 'en' or not detected, let YouTube API choose the default (usually video's original language)
        }
      }

      const pageData = await extractDataFromPageContext();
      
      console.log('📊 Page data extracted:', {
        hasYtInitialData: !!pageData.ytInitialData,
        hasYtInitialPlayerResponse: !!pageData.ytInitialPlayerResponse,
        hasYtcfg: !!pageData.ytcfg
      });
      
      // PRIORITY 0: Try caption tracks directly (MOST RELIABLE - bypasses get_transcript API issues)
      const playerResponse = pageData.ytInitialPlayerResponse || window.ytInitialPlayerResponse;
      const captionTracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      
      console.log('📊 Caption info:', {
        hasPlayerResponse: !!playerResponse,
        hasCaptions: !!playerResponse?.captions,
        hasPlayerCaptionsTracklistRenderer: !!playerResponse?.captions?.playerCaptionsTracklistRenderer,
        captionTracksCount: captionTracks?.length || 0
      });
      
      if (captionTracks && captionTracks.length > 0) {
        console.log(`🎯 Found ${captionTracks.length} caption tracks - trying direct fetch...`);
        
        // Log all available tracks for debugging
        captionTracks.forEach((track, i) => {
          console.log(`  Track ${i}: ${track.name?.simpleText || track.languageCode} - hasBaseUrl: ${!!track.baseUrl}`);
          if (track.baseUrl) {
            console.log(`    URL preview: ${track.baseUrl.substring(0, 80)}...`);
          }
        });
        
        // Find the best matching track
        let selectedTrack = null;
        
        if (targetLanguage) {
          // Try exact match first
          selectedTrack = captionTracks.find(t => t.languageCode === targetLanguage);
          // Try partial match (e.g., 'es' matches 'es-419')
          if (!selectedTrack) {
            selectedTrack = captionTracks.find(t => t.languageCode?.startsWith(targetLanguage));
          }
        }
        
        // Default to first track (usually original language)
        if (!selectedTrack) {
          selectedTrack = captionTracks[0];
        }
        
        if (selectedTrack?.baseUrl) {
          try {
            console.log(`📡 Selected track: ${selectedTrack.name?.simpleText || selectedTrack.languageCode}`);
            const transcriptData = await fetchTranscriptFromCaptionUrl(selectedTrack.baseUrl, videoId);
            if (transcriptData && transcriptData.length > 0) {
              return transcriptData;
            }
          } catch (captionError) {
            console.log('ℹ️ Direct caption fetch failed, trying other methods...');
          }
        }
      }
      
      // PRIORITY 1: Try transcript panel method (fallback)
      if (pageData.ytInitialData) {
        const panels = pageData.ytInitialData?.engagementPanels || [];
        
        // Use centralized panel finder
        const transcriptPanel = findTranscriptPanel(panels);
        
        if (transcriptPanel) {
          try {
            const transcriptData = await getTranscriptFromPanel(pageData.ytInitialData, targetLanguage);
            if (transcriptData && transcriptData.length > 0) {
              return transcriptData;
            }
          } catch (panelError) {
            console.log('ℹ️ Transcript panel method failed, trying other methods...');
            
            // Check if error is due to stale data
            if (panelError.message && panelError.message.includes('stale params')) {
              // Force retry by setting pageData to simulate null condition
              pageData.ytInitialData = null;
            }
          }
        }
      }
      
      // Retry logic for stale or missing data
      if (!pageData.ytInitialData) {
        console.log('⏳ Waiting for YouTube data to update...');
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        const retryPageData = await extractDataFromPageContext();
        
        if (retryPageData.ytInitialData) {
          const panels = retryPageData.ytInitialData?.engagementPanels || [];
          
          // Use centralized panel finder
          const transcriptPanel = findTranscriptPanel(panels);
          
          if (transcriptPanel) {
            try {
              const transcriptData = await getTranscriptFromPanel(retryPageData.ytInitialData, targetLanguage);
              if (transcriptData && transcriptData.length > 0) {
                return transcriptData;
              }
            } catch (panelError) {
              console.log('ℹ️ Retry transcript panel also failed, trying other methods...');
            }
          }
        } else {
          console.log('ℹ️ Still no valid data after retry, trying other methods...');
        }
      }
      
      // PRIORITY 2: Try to get captions from video player
      const captionsFromPlayer = await extractCaptionsFromPlayer();
      if (captionsFromPlayer && captionsFromPlayer.length > 0) {
        return captionsFromPlayer;
      }
      
      // PRIORITY 3: Last resort - fetch page HTML and try all methods again
      console.log('⚠️ Last resort: Fetching fresh page HTML...');
      try {
        const response = await fetch(window.location.href);
        const html = await response.text();
        
        // First, try to get caption tracks from fresh ytInitialPlayerResponse
        let playerData = extractJsonFromHtml(html, "ytInitialPlayerResponse");
        
        if (playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks) {
          const freshTracks = playerData.captions.playerCaptionsTracklistRenderer.captionTracks;
          console.log(`✓ Found ${freshTracks.length} caption tracks in fresh HTML`);
          
          let selectedTrack = null;
          if (targetLanguage) {
            selectedTrack = freshTracks.find(t => t.languageCode === targetLanguage);
            if (!selectedTrack) {
              selectedTrack = freshTracks.find(t => t.languageCode?.startsWith(targetLanguage));
            }
          }
          if (!selectedTrack) {
            selectedTrack = freshTracks[0];
          }
          
          if (selectedTrack?.baseUrl) {
            try {
              console.log(`📡 Trying fresh track: ${selectedTrack.name?.simpleText || selectedTrack.languageCode}`);
              const transcriptData = await fetchTranscriptFromCaptionUrl(selectedTrack.baseUrl, videoId);
              if (transcriptData && transcriptData.length > 0) {
                return transcriptData;
              }
            } catch (freshCaptionError) {
              console.log('ℹ️ Fresh caption fetch also failed, trying DOM method...');
            }
          }
        }
        
        // Try to extract ytInitialData from HTML
        let ytData = extractJsonFromHtml(html, "ytInitialData");
        
        if (ytData) {
          const panels = ytData?.engagementPanels || [];
          
          // Use centralized panel finder
          const transcriptPanel = findTranscriptPanel(panels);
          
          if (transcriptPanel) {
            console.log('✓ Found transcript panel in fetched HTML');
            const transcriptData = await getTranscriptFromPanel(ytData, targetLanguage);
            if (transcriptData && transcriptData.length > 0) {
              return transcriptData;
            }
          }
        }
      } catch (error) {
        console.log('ℹ️ Fresh HTML fetch failed, trying DOM method...');
      }
      
      // PRIORITY 4: Extract from YouTube's native transcript panel DOM
      // This now handles both modern (2025+) and legacy transcript DOM structures
      console.log('⚠️ Trying DOM extraction as final fallback...');
      const domTranscript = await extractTranscriptFromDOM();
      if (domTranscript && domTranscript.length > 0) {
        return domTranscript;
      }

      // PRIORITY 5: Try to programmatically open the modern transcript panel
      console.log('⚠️ Trying to trigger modern transcript panel...');
      try {
        const modernPanel = document.querySelector(
          'ytd-engagement-panel-section-list-renderer[target-id="PAmodern_transcript_view"]'
        );
        if (modernPanel) {
          // Try to trigger the panel to load by clicking the description transcript button
          const descBtn = document.querySelector(
            'ytd-video-description-transcript-section-renderer #primary-button button'
          );
          if (descBtn) {
            descBtn.click();
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Check for modern segments
            const modernData = extractFromModernDOM(document);
            if (modernData && modernData.length > 0) {
              calculateDurations(modernData);
              closeNativeTranscriptPanel(true);
              return modernData;
            }
          }
        }
      } catch (e) {
        console.log('ℹ️ Modern panel trigger failed');
      }
      
      // If all methods fail, throw error
      throw new TranscriptErrors.TranscriptsDisabled(videoId);
      
    } catch (error) {
      // Only log as error if it's not a TranscriptsDisabled (which is a normal case)
      if (error.name !== 'TranscriptsDisabled') {
        console.error('Error getting transcript URL:', error);
      }
      throw error;
    }
  }

  /**
   * Fetch complete transcript for video
   * @param {string} languageCode - Optional language code
   * @returns {Promise<Array>} Promise with transcript data
   */
  async function fetchTranscript(languageCode = null) {
    const videoId = TranscriptUtils.getVideoId();
    if (!videoId) {
      throw new Error('No video ID found');
    }

    try {
      const transcriptData = await getTranscriptUrl(videoId, languageCode);
      
      // Check if we got direct data (from API or player)
      if (Array.isArray(transcriptData)) {
        return transcriptData;
      }
      
      // If we got here, something went wrong
      throw new Error('Failed to get transcript data');
      
    } catch (error) {
      // Only log real errors, not expected fallback failures
      if (error.name !== 'TranscriptsDisabled') {
        console.error('❌ Error fetching transcript:', error);
      }
      throw error;
    }
  }

  /**
   * Get available languages
   * @returns {Array} Array of available languages
   */
  function getAvailableLanguages() {
    return availableLanguages;
  }

  /**
   * Get current language params
   * @returns {string|null} Current language params
   */
  function getCurrentLanguageParams() {
    return currentLanguageParams;
  }

  /**
   * Reset language cache when changing videos
   * NOTE: We keep lastVideoId and lastTranscriptParams to detect stale data
   */
  function resetLanguageCache() {
    availableLanguages = [];
    currentLanguageParams = null;
    // DON'T reset lastVideoId and lastTranscriptParams - we need them to detect stale params
  }

  // Public API
  return {
    injectFetchHandler,
    extractDataFromPageContext,
    fetchViaPageContext,
    extractJsonFromHtml,
    getTranscriptFromPanel,
    extractTranscriptFromHtml,
    extractTranscriptFromPage,
    getTranscriptUrl,
    fetchTranscript,
    getAvailableLanguages,
    getCurrentLanguageParams,
    resetLanguageCache
  };
})();
