// This script runs in the page context to bypass CORS restrictions

(function() {
  'use strict';
  
  console.log('✓ Page script loaded and running');
  
  // Signal that the script is loaded
  window.__transcriptPageScriptLoaded = true;
  
  // Listen for data extraction requests
  window.addEventListener('dataExtractRequest', (event) => {
    console.log('Page script received data extraction request');
    const { eventId } = event.detail;
    
    try {
      // Extract ytcfg configuration (contains API keys, client info, etc.)
      const ytcfgData = typeof ytcfg !== 'undefined' && ytcfg.data_ ? {
        INNERTUBE_API_KEY: ytcfg.data_.INNERTUBE_API_KEY,
        INNERTUBE_CLIENT_NAME: ytcfg.data_.INNERTUBE_CLIENT_NAME,
        INNERTUBE_CLIENT_VERSION: ytcfg.data_.INNERTUBE_CLIENT_VERSION,
        INNERTUBE_CONTEXT_CLIENT_NAME: ytcfg.data_.INNERTUBE_CONTEXT_CLIENT_NAME,
        VISITOR_DATA: ytcfg.data_.VISITOR_DATA,
        HL: ytcfg.data_.HL,
        GL: ytcfg.data_.GL,
        LOGGED_IN: ytcfg.data_.LOGGED_IN
      } : null;

      // Try global variables first
      let ytData = typeof ytInitialData !== 'undefined' ? ytInitialData : null;
      let playerResponse = typeof ytInitialPlayerResponse !== 'undefined' ? ytInitialPlayerResponse : null;

      // Fallback: extract from script tags if globals are not available
      if (!playerResponse || !ytData) {
        console.log('⚠️ Global variables not found, extracting from script tags...');
        const scripts = document.querySelectorAll('script');
        for (const script of scripts) {
          const text = script.textContent;
          if (!text) continue;

          if (!playerResponse) {
            // Try ytInitialPlayerResponse
            const playerMatch = text.match(/var\s+ytInitialPlayerResponse\s*=\s*(\{[\s\S]*?\})\s*;/);
            if (playerMatch) {
              try {
                playerResponse = JSON.parse(playerMatch[1]);
                console.log('✓ Extracted ytInitialPlayerResponse from script tag');
              } catch (e) { /* ignore parse errors */ }
            }
          }

          if (!ytData) {
            // Try ytInitialData
            const dataMatch = text.match(/var\s+ytInitialData\s*=\s*(\{[\s\S]*?\})\s*;/);
            if (dataMatch) {
              try {
                ytData = JSON.parse(dataMatch[1]);
                console.log('✓ Extracted ytInitialData from script tag');
              } catch (e) { /* ignore parse errors */ }
            }
          }

          if (playerResponse && ytData) break;
        }
      }

      // Fallback: try to get player response from ytplayer.config or movie_player
      if (!playerResponse) {
        try {
          const player = document.getElementById('movie_player');
          if (player && typeof player.getPlayerResponse === 'function') {
            playerResponse = player.getPlayerResponse();
            console.log('✓ Got player response from movie_player API');
          }
        } catch (e) { /* player API may not be available */ }
      }

      // Fallback: try ytplayer.config.args.raw_player_response
      if (!playerResponse) {
        try {
          if (typeof ytplayer !== 'undefined' && ytplayer?.config?.args?.raw_player_response) {
            playerResponse = ytplayer.config.args.raw_player_response;
            console.log('✓ Got player response from ytplayer.config');
          }
        } catch (e) { /* ignore */ }
      }

      const data = {
        ytInitialData: ytData,
        ytInitialPlayerResponse: playerResponse,
        ytcfg: ytcfgData
      };

      // Debug: Check for caption tracks
      const captions = data.ytInitialPlayerResponse?.captions;
      const captionTracks = captions?.playerCaptionsTracklistRenderer?.captionTracks;

      console.log('Extracted data:', {
        hasYtInitialData: !!data.ytInitialData,
        hasYtInitialPlayerResponse: !!data.ytInitialPlayerResponse,
        hasYtcfg: !!data.ytcfg,
        clientVersion: ytcfgData?.INNERTUBE_CLIENT_VERSION,
        hasCaptions: !!captions,
        captionTracksCount: captionTracks?.length || 0,
        captionTracksInfo: captionTracks?.map(t => ({
          lang: t.languageCode,
          name: t.name?.simpleText,
          hasBaseUrl: !!t.baseUrl
        })) || []
      });

      window.dispatchEvent(new CustomEvent('dataExtractResponse', {
        detail: {
          eventId,
          data: data
        }
      }));
    } catch (error) {
      console.error('Error extracting data:', error);
      window.dispatchEvent(new CustomEvent('dataExtractResponse', {
        detail: {
          eventId,
          data: {}
        }
      }));
    }
  });
  
  // Listen for caption extraction requests
  window.addEventListener('captionsExtractRequest', async (event) => {
    console.log('Page script received caption extraction request:', event.detail);
    const { eventId } = event.detail;
    
    try {
      // Try to get captions from YouTube's player
      const captions = extractCaptionsFromYouTubePlayer();
      
      if (captions && captions.length > 0) {
        window.dispatchEvent(new CustomEvent('captionsExtractResponse', {
          detail: {
            eventId,
            success: true,
            data: captions
          }
        }));
      } else {
        window.dispatchEvent(new CustomEvent('captionsExtractResponse', {
          detail: {
            eventId,
            success: false,
            error: 'No captions found in player'
          }
        }));
      }
    } catch (error) {
      console.error('Exception extracting captions:', error);
      window.dispatchEvent(new CustomEvent('captionsExtractResponse', {
        detail: {
          eventId,
          success: false,
          error: error.message
        }
      }));
    }
  });
  
  // Function to extract captions directly from YouTube player
  function extractCaptionsFromYouTubePlayer() {
    try {
      // Try to access the video element
      const video = document.querySelector('video');
      if (!video) {
        console.warn('No video element found');
        return null;
      }
      
      // Try to get text tracks
      const textTracks = video.textTracks;
      if (!textTracks || textTracks.length === 0) {
        console.log('ℹ️ No text tracks found (this is normal, will try other methods)');
        return null;
      }
      
      console.log('Found', textTracks.length, 'text tracks');
      
      // Find an active track first, or use first available
      let activeTrack = null;
      for (let i = 0; i < textTracks.length; i++) {
        const track = textTracks[i];
        console.log('Track', i, ':', track.kind, track.label, track.language, track.mode);
        
        if (track.kind === 'subtitles' || track.kind === 'captions') {
          // Priority 1: Currently showing track
          if (track.mode === 'showing') {
            activeTrack = track;
            break;
          }
          // Priority 2: First available track (respects YouTube's default order)
          if (!activeTrack) {
            activeTrack = track;
          }
        }
      }
      
      if (!activeTrack) {
        console.log('ℹ️ No suitable track found (will try other methods)');
        return null;
      }
      
      console.log('Using track:', activeTrack.label, activeTrack.language);
      
      // Enable the track if not already
      if (activeTrack.mode !== 'showing') {
        activeTrack.mode = 'showing';
      }
      
      // Extract cues
      const cues = activeTrack.cues || activeTrack.activeCues;
      if (!cues || cues.length === 0) {
        console.log('ℹ️ No cues found in track (will try other methods)');
        return null;
      }
      
      console.log('Found', cues.length, 'cues');
      
      // Convert cues to transcript format
      const transcript = [];
      for (let i = 0; i < cues.length; i++) {
        const cue = cues[i];
        transcript.push({
          start: cue.startTime,
          duration: cue.endTime - cue.startTime,
          text: cue.text
        });
      }
      
      return transcript;
    } catch (error) {
      console.error('Error extracting captions from player:', error);
      return null;
    }
  }
  
  // Listen for fetch requests from content script
  window.addEventListener('transcriptFetchRequest', async (event) => {
    console.log('📥 Page script received fetch request:', event.detail);
    const { url, eventId } = event.detail;
    
    console.log('🌐 Making fetch request to:', url);
    console.log('🆔 Event ID:', eventId);
    
    try {
      // Use fetch with credentials to include cookies
      const response = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Accept': 'application/json, text/xml, text/plain, */*'
        }
      });
      
      console.log('✓ Fetch response received');
      console.log('📊 Status:', response.status);
      console.log('📊 Status text:', response.statusText);
      console.log('📊 Content-Type:', response.headers.get('content-type'));
      
      if (response.ok) {
        const text = await response.text();
        console.log('📊 Response text length:', text?.length || 0);
        console.log('📊 First 500 chars:', text?.substring(0, 500));
        
        if (!text || text.length === 0) {
          console.log('ℹ️ Status 200 but empty response (URL may be expired, will try other methods)');
          window.dispatchEvent(new CustomEvent('transcriptFetchResponse', {
            detail: {
              eventId,
              success: false,
              error: 'Empty response - URL may be expired or request blocked'
            }
          }));
          return;
        }
        
        window.dispatchEvent(new CustomEvent('transcriptFetchResponse', {
          detail: {
            eventId,
            success: true,
            data: text
          }
        }));
      } else {
        // Don't log as error - this is part of the fallback chain
        const errorText = await response.text().catch(() => '');
        window.dispatchEvent(new CustomEvent('transcriptFetchResponse', {
          detail: {
            eventId,
            success: false,
            error: `HTTP ${response.status}: ${response.statusText}`,
            errorDetails: errorText.substring(0, 500)
          }
        }));
      }
    } catch (error) {
      // Don't log as error - this is part of the fallback chain
      window.dispatchEvent(new CustomEvent('transcriptFetchResponse', {
        detail: {
          eventId,
          success: false,
          error: error.message
        }
      }));
    }
  });
  
  // Listen for transcript API requests (handles the youtubei API call)
  window.addEventListener('transcriptApiRequest', async (event) => {
    console.log('📥 Page script received transcript API request');
    const { eventId, params, videoId } = event.detail;
    
    try {
      // Get client config from ytcfg
      const ytcfgData = typeof ytcfg !== 'undefined' && ytcfg.data_ ? ytcfg.data_ : {};
      const innertubeApiKey = ytcfgData.INNERTUBE_API_KEY || '';
      const innertubeClientVersion = ytcfgData.INNERTUBE_CLIENT_VERSION || '2.20251201.00.00';
      const visitorData = ytcfgData.VISITOR_DATA || '';
      const hl = (ytcfgData.HL || navigator.language || 'en').split('-')[0];
      const gl = ytcfgData.GL || 'US';
      
      // Extract video ID from URL if not provided
      const currentVideoId = videoId || new URLSearchParams(window.location.search).get('v') || '';
      
      console.log('📤 Making transcript API request with:', {
        hl,
        gl,
        clientVersion: innertubeClientVersion,
        hasApiKey: !!innertubeApiKey,
        hasVisitorData: !!visitorData,
        videoId: currentVideoId
      });
      
      const body = {
        context: {
          client: {
            hl: hl,
            gl: gl,
            visitorData: visitorData,
            userAgent: navigator.userAgent,
            clientName: ytcfgData.INNERTUBE_CLIENT_NAME || 'WEB',
            clientVersion: innertubeClientVersion,
            platform: "DESKTOP",
            osName: "Windows",
            osVersion: "10.0",
            originalUrl: window.location.href,
            browserName: "Chrome",
            browserVersion: navigator.userAgent.match(/Chrome\/(\d+)/)?.[1] || "120"
          },
          request: { 
            useSsl: true,
            internalExperimentFlags: [],
            consistencyTokenJars: []
          }
        },
        videoId: currentVideoId,
        params: params
      };
      
      // Build URL with API key
      let apiUrl = "https://www.youtube.com/youtubei/v1/get_transcript?prettyPrint=false";
      if (innertubeApiKey) {
        apiUrl += `&key=${innertubeApiKey}`;
      }
      
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "X-YouTube-Client-Name": String(ytcfgData.INNERTUBE_CONTEXT_CLIENT_NAME || 1),
          "X-YouTube-Client-Version": innertubeClientVersion
        },
        body: JSON.stringify(body),
        credentials: 'include'
      });
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'No error text');
        // Don't log as error - this is part of the fallback chain
        window.dispatchEvent(new CustomEvent('transcriptApiResponse', {
          detail: {
            eventId,
            success: false,
            error: `API request failed: ${response.status}`,
            errorDetails: errorText.substring(0, 500)
          }
        }));
        return;
      }
      
      const json = await response.json();
      console.log('✓ Transcript API response received');
      
      window.dispatchEvent(new CustomEvent('transcriptApiResponse', {
        detail: {
          eventId,
          success: true,
          data: json
        }
      }));
      
    } catch (error) {
      // Don't log as error - this is part of the fallback chain
      window.dispatchEvent(new CustomEvent('transcriptApiResponse', {
        detail: {
          eventId,
          success: false,
          error: error.message
        }
      }));
    }
  });
  
  console.log('Page script event listeners registered');
})();