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
      const duration = transcriptData[i + 1].start - transcriptData[i].start;
      transcriptData[i].duration = duration > 0 ? duration : 0;
    }
    if (transcriptData.length > 0) {
      transcriptData[transcriptData.length - 1].duration = 3;
    }
  }

  // Timestamp pattern: "0:00", "1:23", "1:23:45"
  const TIMESTAMP_RE = /^\s*\d{1,2}(?::\d{1,2}){1,2}\s*$/;
  const MIN_GENERIC_DOM_SEGMENTS = 2;
  const EXTENSION_PANEL_SELECTOR = '#yt-transcript-panel';
  const NATIVE_TRANSCRIPT_ROOT_SELECTOR = [
    'ytd-engagement-panel-section-list-renderer[target-id*="transcript" i]',
    'ytd-engagement-panel-section-list-renderer[target-id="PAmodern_transcript_view" i]',
    'ytd-transcript-renderer',
    'ytd-transcript-search-panel-renderer',
    'transcript-search-panel-renderer'
  ].join(', ');
  const TRANSCRIPT_SEGMENT_CONTAINER_SELECTOR = [
    '#segments-container',
    'ytd-transcript-segment-list-renderer',
    '[class*="TranscriptSegmentList"]'
  ].join(', ');
  const NATIVE_TRANSCRIPT_PANEL_SELECTOR = [
    'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]',
    'ytd-engagement-panel-section-list-renderer[target-id="PAmodern_transcript_view" i]',
    'ytd-engagement-panel-section-list-renderer[target-id*="transcript" i]'
  ].join(', ');
  const TRANSCRIPT_LABEL_RE = /transcript|transcripción|transcripcion|transcrição|transcricao|transkript|transcription|trascrizione|트랜스크립트|字幕|文字起こし|ondertiteling/i;
  const MORE_ACTIONS_LABEL_RE = /more|actions|options|más|mas|acciones|opciones|mais|mehr|plus|altro/i;
  const DESCRIPTION_EXPAND_LABEL_RE = /(?:mostrar más|show more|more|más|mas|expand|ver más|ver mas)/i;
  const NON_TRANSCRIPT_TEXT_RE = /(?:mirar video completo|watch full video|reproducción automática|autoplay|arrastra hacia arriba|búsqueda más precisa)/i;
  const RECOMMENDATION_VIEW_METADATA_RE = /\b(?:vistas?|views?|visualizaciones?)\b/i;
  const RECOMMENDATION_AGE_METADATA_RE = /\b(?:hace|ago)\b/i;
  const RECOMMENDATION_LIVE_BADGE_RE = /(?:\ben vivo\b|(?:^|[•|])\s*live(?:\s|\(|$)|\(\d+\+\))/i;
  const LOCALIZED_TIME_PREFIX_RE = /^\s*(?:(?:\d+\s+horas?\s+y\s+)?\d+\s+minutos?\s+y\s+\d+\s+segundos?|\d+\s+minuto\s+y\s+\d+\s+segundos?|\d+\s+segundos?|\d+\s+hours?\s+(?:and\s+)?\d+\s+minutes?\s+(?:and\s+)?\d+\s+seconds?|\d+\s+minutes?\s+(?:and\s+)?\d+\s+seconds?|\d+\s+seconds?)\s+/i;
  const RAW_TIMECODE_RE = /\b\d{2};\d{2};\d{2};\d{2}\s*-\s*\d{2};\d{2};\d{2};\d{2}\b\s*(?:Unknown\s*)?/gi;

  function getElementLabel(element) {
    if (!element) return '';

    return [
      element.getAttribute?.('aria-label') || '',
      element.getAttribute?.('title') || '',
      element.textContent || ''
    ].join(' ').trim();
  }

  function isTranscriptTrigger(element) {
    return TRANSCRIPT_LABEL_RE.test(getElementLabel(element));
  }

  function isMoreActionsButton(element) {
    return MORE_ACTIONS_LABEL_RE.test(getElementLabel(element));
  }

  function isDescriptionExpandButton(element) {
    return DESCRIPTION_EXPAND_LABEL_RE.test(getElementLabel(element));
  }

  function hasTranscriptNearby(element, maxDepth = 6) {
    let node = element;
    for (let depth = 0; depth <= maxDepth && node; depth += 1, node = node.parentElement) {
      if (isTranscriptTrigger(node)) return true;
    }
    return false;
  }

  function isInsideExtensionPanel(element) {
    return !!element.closest?.(EXTENSION_PANEL_SELECTOR);
  }

  function isVisibleElement(element) {
    if (!element || isInsideExtensionPanel(element)) return false;

    const style = window.getComputedStyle?.(element);
    if (style && (style.display === 'none' || style.visibility === 'hidden')) {
      return false;
    }

    return element.getClientRects().length > 0;
  }

  function getClickableAncestor(element) {
    return element?.closest?.([
      'button',
      '[role="button"]',
      'a',
      'yt-button-shape',
      'yt-button-view-model',
      'ytd-button-renderer',
      'tp-yt-paper-button',
      'ytd-menu-service-item-renderer',
      'yt-list-item-view-model'
    ].join(', '));
  }

  function clickTranscriptCandidate(element, reason, preferElement = false) {
    const clickable = getClickableAncestor(element);
    let target = preferElement && isVisibleElement(element) ? element : (clickable || element);
    if (!target) return false;
    if (!isVisibleElement(target)) {
      if (!isVisibleElement(element)) return false;
      target = element;
    }

    try {
      target.scrollIntoView?.({ block: 'center', inline: 'center' });
    } catch (error) {
      // Non-critical: clicking can still work without scrolling.
    }

    console.log(`🖱️ Clicking transcript control (${reason})`);
    if (typeof PointerEvent === 'function') {
      target.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
        view: window
      }));
    }
    target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
    target.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
    if (typeof PointerEvent === 'function') {
      target.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
        view: window
      }));
    }
    target.click();
    return true;
  }

  function getTranscriptControlCandidates(container = document) {
    const selectors = [
      'button',
      '[role="button"]',
      'yt-button-shape',
      'yt-button-view-model',
      'ytd-button-renderer',
      'tp-yt-paper-button'
    ].join(', ');

    return [...container.querySelectorAll(selectors)]
      .filter(el => !isInsideExtensionPanel(el))
      .filter(el => isTranscriptTrigger(el))
      .filter(el => isVisibleElement(el) || isVisibleElement(getClickableAncestor(el)));
  }

  function findTranscriptMenuItem() {
    const menuItems = document.querySelectorAll(
      'ytd-menu-service-item-renderer, tp-yt-paper-item, yt-list-item-view-model, [role="menuitem"]'
    );

    return [...menuItems].find(item =>
      !isInsideExtensionPanel(item) &&
      isTranscriptTrigger(item) &&
      (isVisibleElement(item) || isVisibleElement(getClickableAncestor(item)))
    ) || null;
  }

  function waitForTranscriptMenuItem(timeoutMs = 2000) {
    return new Promise((resolve) => {
      const start = Date.now();

      const poll = () => {
        const item = findTranscriptMenuItem();
        if (item || Date.now() - start >= timeoutMs) {
          resolve(item);
          return;
        }
        setTimeout(poll, 100);
      };

      poll();
    });
  }

  async function tryExpandDescription() {
    const description = document.querySelector(
      '#description, #description-inline-expander, ytd-text-inline-expander, ytd-watch-metadata'
    );
    if (!description) return false;

    const expandCandidates = [
      ...description.querySelectorAll(
        '#expand, tp-yt-paper-button#expand, button[aria-label], [role="button"], yt-button-shape, ytd-button-renderer'
      )
    ].filter(el =>
      !isInsideExtensionPanel(el) &&
      isDescriptionExpandButton(el) &&
      (isVisibleElement(el) || isVisibleElement(getClickableAncestor(el)))
    );

    if (expandCandidates.length === 0) return false;

    if (clickTranscriptCandidate(expandCandidates[0], 'description expand')) {
      await new Promise(resolve => setTimeout(resolve, 800));
      return true;
    }

    return false;
  }

  function getMatches(container, selector) {
    const matches = [];
    if (container.matches?.(selector)) {
      matches.push(container);
    }
    matches.push(...container.querySelectorAll(selector));
    return matches;
  }

  function getNativeTranscriptRoots(container = document) {
    const roots = [];

    for (const root of getMatches(container, NATIVE_TRANSCRIPT_ROOT_SELECTOR)) {
      if (isVisibleElement(root) || root.getAttribute?.('visibility') === 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED') {
        roots.push(root);
      }
    }

    for (const panel of getMatches(container, 'ytd-engagement-panel-section-list-renderer')) {
      if (
        (isVisibleElement(panel) || panel.getAttribute?.('visibility') === 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED') &&
        isTranscriptTrigger(panel)
      ) {
        roots.push(panel);
      }
    }

    for (const segmentContainer of getMatches(container, TRANSCRIPT_SEGMENT_CONTAINER_SELECTOR)) {
      if (!isVisibleElement(segmentContainer)) continue;

      const root = segmentContainer.closest(NATIVE_TRANSCRIPT_ROOT_SELECTOR);
      if (root && !isInsideExtensionPanel(root)) {
        roots.push(root);
      }
    }

    return [...new Set(roots)];
  }

  function getNativeTranscriptPanels(container = document) {
    return [...container.querySelectorAll(NATIVE_TRANSCRIPT_PANEL_SELECTOR)]
      .filter(panel => !isInsideExtensionPanel(panel));
  }

  async function tryRevealNativeTranscriptPanel() {
    const panels = getNativeTranscriptPanels(document);
    if (panels.length === 0) return false;

    for (const panel of panels) {
      const targetId = panel.getAttribute('target-id') || 'transcript panel';
      console.log(`🪟 Revealing native transcript panel (${targetId})`);

      panel.setAttribute('visibility', 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED');
      panel.visibility = 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED';
      panel.removeAttribute('hidden');
      panel.removeAttribute('collapsed');

      if (panel.style?.display === 'none') {
        panel.style.display = '';
      }
    }

    await new Promise(resolve => setTimeout(resolve, 2000));
    return true;
  }

  function getCurrentVideoDuration() {
    const video = document.querySelector('video');
    return Number.isFinite(video?.duration) ? video.duration : null;
  }

  function cleanTranscriptText(text) {
    return (text || '')
      .replace(/\u00a0/g, ' ')
      .replace(RAW_TIMECODE_RE, '')
      .replace(LOCALIZED_TIME_PREFIX_RE, '')
      .replace(/^\s*Unknown\s+/i, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isLikelyNonTranscriptText(text) {
    const normalizedText = (text || '').replace(/\u00a0/g, ' ').trim();
    if (!normalizedText || /^[\s/•|·-]+$/.test(normalizedText)) return true;
    if (NON_TRANSCRIPT_TEXT_RE.test(normalizedText)) return true;

    const hasRecommendationMetadata =
      RECOMMENDATION_VIEW_METADATA_RE.test(normalizedText) ||
      (RECOMMENDATION_AGE_METADATA_RE.test(normalizedText) && /[•|]/.test(normalizedText)) ||
      RECOMMENDATION_LIVE_BADGE_RE.test(normalizedText);

    return hasRecommendationMetadata;
  }

  function normalizeTranscriptData(transcriptData, minSegments = 1) {
    if (!Array.isArray(transcriptData)) return null;

    const seen = new Set();
    const videoDuration = getCurrentVideoDuration();
    const normalized = transcriptData
      .map(entry => ({
        start: Number(entry.start),
        duration: Number(entry.duration) || 0,
        text: cleanTranscriptText(entry.text)
      }))
      .filter(entry => Number.isFinite(entry.start) && entry.start >= 0 && entry.text)
      .filter(entry => !isLikelyNonTranscriptText(entry.text))
      .filter(entry => videoDuration === null || entry.start <= videoDuration + 30)
      .sort((a, b) => a.start - b.start)
      .filter(entry => {
        const key = `${Math.round(entry.start * 1000)}:${entry.text}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

    if (normalized.length < minSegments) {
      return null;
    }

    calculateDurations(normalized);
    return normalized;
  }

  /**
   * Try to extract transcript segments from the modern YouTube view model DOM
   * YouTube 2025+ uses transcript-segment-view-model instead of ytd-transcript-segment-renderer
   * @param {Element} container - Container element to search within
   * @returns {Array|null} Transcript data or null
   */
  function extractFromModernDOM(container) {
    const segments = container.querySelectorAll('transcript-segment-view-model, [class*="TranscriptSegmentViewModel"]');
    if (!segments || segments.length === 0) return null;

    console.log(`📝 Found ${segments.length} modern transcript segments`);
    const transcriptData = [];

    for (const segment of segments) {
      // Try several known timestamp class variants; fall back to pattern match
      let timestampEl = segment.querySelector(
        '.ytwTranscriptSegmentViewModelTimestamp, ' +
        '[class*="TranscriptSegmentViewModelTimestamp"], ' +
        '[class*="segmentTimestamp" i]'
      );
      if (!timestampEl) {
        timestampEl = [...segment.querySelectorAll('*')].find(el =>
          el.children.length === 0 && TIMESTAMP_RE.test(el.textContent || '')
        );
      }

      const textEl = segment.querySelector(
        '.yt-core-attributed-string[role="text"], ' +
        '.yt-core-attributed-string, ' +
        '[class*="TranscriptSegmentViewModelSnippet"], ' +
        '[class*="segmentText" i]'
      );

      if (timestampEl && textEl) {
        const timestampText = timestampEl.textContent.trim();
        const text = textEl.textContent.trim();
        if (text && TIMESTAMP_RE.test(timestampText)) {
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
   * Generic extraction: walk the engagement panel and pair timestamp-looking
   * leaf nodes with their sibling text. Used as a last-resort DOM extractor
   * when neither modern nor legacy selectors match.
   * @param {Element} container - Container element to search within
   * @returns {Array|null} Transcript data or null
   */
  function extractFromGenericDOM(container) {
    if (!container) return null;

    const segmentsContainer =
      container.querySelector('#segments-container') ||
      container;

    if (isInsideExtensionPanel(segmentsContainer)) return null;

    // Collect every leaf element whose text matches a timestamp
    const all = segmentsContainer.querySelectorAll('*');
    const transcriptData = [];
    const seen = new Set();

    for (const el of all) {
      if (el.children.length > 0) continue;
      const txt = (el.textContent || '').trim();
      if (!TIMESTAMP_RE.test(txt)) continue;

      // Walk up to find a segment-ish ancestor containing text
      let segment = el.parentElement;
      for (let i = 0; i < 5 && segment; i++, segment = segment.parentElement) {
        if (seen.has(segment)) break;

        const timestampLeaves = [...segment.querySelectorAll('*')]
          .filter(n => n.children.length === 0 && TIMESTAMP_RE.test(n.textContent || ''));
        if (timestampLeaves.length > 1) continue;

        // Grab any sibling/descendant text other than the timestamp itself
        const candidateText = [...segment.querySelectorAll('*')]
          .filter(n => n !== el && n.children.length === 0)
          .map(n => (n.textContent || '').trim())
          .filter(t => t && !TIMESTAMP_RE.test(t))
          .join(' ')
          .trim();
        if (candidateText && !isLikelyNonTranscriptText(candidateText)) {
          seen.add(segment);
          transcriptData.push({
            start: parseTimestamp(txt),
            duration: 0,
            text: candidateText
          });
          break;
        }
      }
    }

    return transcriptData.length > 0 ? transcriptData : null;
  }

  function extractFromTranscriptRoot(root) {
    const explicitData =
      extractFromModernDOM(root) ||
      extractFromLegacyDOM(root);
    const normalizedExplicit = normalizeTranscriptData(explicitData);
    if (normalizedExplicit) return normalizedExplicit;

    const genericData = extractFromGenericDOM(root);
    return normalizeTranscriptData(genericData, MIN_GENERIC_DOM_SEGMENTS);
  }

  /**
   * Run every DOM extractor in order and return the first non-empty result.
   * @returns {Array|null}
   */
  function extractFromAnyDOM() {
    const roots = getNativeTranscriptRoots(document);

    for (const root of roots) {
      const data = extractFromTranscriptRoot(root);
      if (data) return data;
    }

    // Explicit transcript segment elements are safe to scan globally because
    // they are YouTube-owned elements, unlike timestamp-looking text nodes.
    const explicitData =
      extractFromModernDOM(document) ||
      extractFromLegacyDOM(document);
    return normalizeTranscriptData(explicitData);
  }

  /**
   * Poll for transcript segments to appear in the DOM after opening the panel.
   * @param {number} timeoutMs - Max total wait
   * @returns {Promise<Array|null>}
   */
  function waitForSegments(timeoutMs = 8000) {
    return new Promise((resolve) => {
      const start = Date.now();
      const poll = () => {
        const data = extractFromAnyDOM();
        if (data && data.length > 0) {
          resolve(data);
          return;
        }
        if (Date.now() - start >= timeoutMs) {
          resolve(null);
          return;
        }
        setTimeout(poll, 200);
      };
      poll();
    });
  }

  /**
   * Attempt to trigger YouTube's native "Show transcript" action using several
   * strategies. Returns true if a click was dispatched on any candidate.
   * @returns {Promise<boolean>}
   */
  async function tryOpenTranscriptPanel() {
    const descSelectors = [
      { selector: 'ytd-video-description-transcript-section-renderer button', requireTranscriptLabel: false },
      { selector: 'ytd-video-description-transcript-section-renderer [role="button"]', requireTranscriptLabel: false },
      { selector: 'ytd-structured-description-content-renderer ytd-video-description-transcript-section-renderer button', requireTranscriptLabel: false },
      { selector: '#primary-button ytd-button-renderer button', requireTranscriptLabel: true },
    ];

    const clickVisibleTranscriptControl = () => {
      for (const { selector, requireTranscriptLabel } of descSelectors) {
        const buttons = document.querySelectorAll(selector);
        for (const btn of buttons) {
          if (!isVisibleElement(btn)) continue;
          if (requireTranscriptLabel && !isTranscriptTrigger(btn)) continue;

          if (clickTranscriptCandidate(btn, selector)) return true;
        }
      }

      for (const control of getTranscriptControlCandidates(document)) {
        if (clickTranscriptCandidate(control, 'visible transcript-labeled control')) return true;
      }

      return false;
    };

    if (clickVisibleTranscriptControl()) return true;

    if (await tryExpandDescription()) {
      if (clickVisibleTranscriptControl()) return true;
    }

    // YouTube's current button surface often exposes the clickable shape as a
    // nested feedback div rather than a directly labeled button.
    const touchFeedbackCandidates = document.querySelectorAll(
      'ytd-video-description-transcript-section-renderer .ytSpecTouchFeedbackShapeFill, ' +
      'ytd-structured-description-content-renderer .ytSpecTouchFeedbackShapeFill, ' +
      'ytd-watch-metadata .ytSpecTouchFeedbackShapeFill'
    );
    for (const feedback of touchFeedbackCandidates) {
      const transcriptSection = feedback.closest('ytd-video-description-transcript-section-renderer');
      const clickable = getClickableAncestor(feedback);

      if (!isVisibleElement(feedback) && !isVisibleElement(clickable)) continue;
      if (!transcriptSection && !isTranscriptTrigger(clickable) && !hasTranscriptNearby(feedback)) continue;
      if (clickTranscriptCandidate(feedback, 'ytSpecTouchFeedbackShapeFill', true)) return true;
    }

    // aria-label variants across languages
    const ariaSelectors = [
      'button[aria-label*="transcript" i]',
      'button[aria-label*="transcripción" i]',
      'button[aria-label*="transcripcion" i]',
      'button[aria-label*="transcrição" i]',
      'button[aria-label*="transkript" i]',
      'button[aria-label*="transcription" i]',
      'button[aria-label*="trascrizione" i]',
      'yt-button-shape button[aria-label*="transcript" i]',
    ];
    for (const sel of ariaSelectors) {
      const buttons = document.querySelectorAll(sel);
      for (const btn of buttons) {
        if (!isVisibleElement(btn)) continue;

        if (clickTranscriptCandidate(btn, sel)) return true;
      }
    }

    // Fallback: open the "More actions" menu and look for a Show-transcript item
    const moreCandidates = [
      ...document.querySelectorAll(
        'ytd-watch-metadata ytd-menu-renderer button, ' +
        '#actions-inner ytd-menu-renderer button, ' +
        'ytd-menu-renderer yt-button-shape button'
      )
    ].filter(isVisibleElement);
    const moreBtn =
      moreCandidates.find(isMoreActionsButton) ||
      moreCandidates.find(btn => btn.closest('ytd-menu-renderer'));

    if (moreBtn) {
      clickTranscriptCandidate(moreBtn, 'More actions menu');
      const transcriptMenuItem = await waitForTranscriptMenuItem(2500);

      if (transcriptMenuItem) {
        if (clickTranscriptCandidate(transcriptMenuItem, 'Show transcript menu item')) return true;
      }
      // Menu opened but no transcript option — close it
      document.body.click();
    }

    return false;
  }

  /**
   * Close the native transcript panel
   * @param {boolean} panelWasOpened - Whether the panel was opened by us
   */
  function closeNativeTranscriptPanel(panelWasOpened) {
    if (!panelWasOpened) return;

    console.log('🔒 Closing native transcript panel...');
    const panels = getNativeTranscriptRoots(document)
      .map(root => root.closest?.('ytd-engagement-panel-section-list-renderer') || root)
      .filter((panel, index, all) => panel && all.indexOf(panel) === index);

    for (const panel of panels) {
      const closeBtn = panel.querySelector(
        'button[aria-label*="Close" i], ' +
        'button[aria-label*="Cerrar" i], ' +
        'button[aria-label*="Fechar" i], ' +
        'button[aria-label*="Schließen" i], ' +
        'button[aria-label*="Fermer" i], ' +
        '#visibility-button button'
      );
      if (closeBtn) {
        closeBtn.click();
        console.log('✓ Native panel closed');
        return;
      }
    }
  }

  async function extractTranscriptFromDOM() {
    try {
      console.log('🔍 Trying to extract transcript from YouTube DOM...');

      // Already-rendered segments in YouTube's native transcript panel.
      let data = extractFromAnyDOM();
      if (data) {
        console.log(`✓ Extracted ${data.length} entries from DOM (already visible)`);
        return data;
      }

      const revealedNativePanel = await tryRevealNativeTranscriptPanel();
      if (revealedNativePanel) {
        data = await waitForSegments(6000);
        closeNativeTranscriptPanel(true);

        if (data && data.length > 0) {
          console.log(`✓ Extracted ${data.length} entries from revealed native panel`);
          return data;
        }
      }

      // Try to trigger YouTube's native transcript panel
      console.log('📋 Transcript panel not visible, trying to open it...');
      const opened = await tryOpenTranscriptPanel();
      if (!opened) {
        console.log('ℹ️ Could not find a way to open the transcript panel');
        return null;
      }

      // Poll for segments to render — POT-signed requests take longer than
      // a fixed timeout on slow connections.
      data = await waitForSegments(8000);
      closeNativeTranscriptPanel(true);

      if (data && data.length > 0) {
        console.log(`✓ Extracted ${data.length} entries from DOM`);
        return data;
      }

      console.log('ℹ️ Panel opened but no segments rendered');
      return null;
    } catch (error) {
      console.log('ℹ️ Error extracting transcript from DOM:', error?.message);
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
      
      console.log('🔧 CODE VERSION: 2026-06-08-DOM-TRANSCRIPT-REVEAL-V3');
      
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

      // PRIORITY 0: DOM extraction — most reliable because YouTube's own script
      // renders segments using the Proof-of-Origin Token, which we cannot
      // replicate from a content script. The POT requirement (May 2025+)
      // causes timedtext URLs and youtubei/v1/get_transcript to return empty
      // or HTTP 400 for anonymous extension-side fetches.
      console.log('🎯 PRIORITY 0: Trying DOM extraction (POT-safe)...');
      const domFirstAttempt = await extractTranscriptFromDOM();
      if (domFirstAttempt && domFirstAttempt.length > 0) {
        return domFirstAttempt;
      }

      const pageData = await extractDataFromPageContext();

      console.log('📊 Page data extracted:', {
        hasYtInitialData: !!pageData.ytInitialData,
        hasYtInitialPlayerResponse: !!pageData.ytInitialPlayerResponse,
        hasYtcfg: !!pageData.ytcfg
      });

      // PRIORITY 1: Caption tracks directly (may succeed on videos that don't
      // enforce POT yet; returns empty body otherwise)
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

        captionTracks.forEach((track, i) => {
          console.log(`  Track ${i}: ${track.name?.simpleText || track.languageCode} - hasBaseUrl: ${!!track.baseUrl}`);
        });

        let selectedTrack = null;
        if (targetLanguage) {
          selectedTrack = captionTracks.find(t => t.languageCode === targetLanguage);
          if (!selectedTrack) {
            selectedTrack = captionTracks.find(t => t.languageCode?.startsWith(targetLanguage));
          }
        }
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
            console.log('ℹ️ Direct caption fetch failed (likely POT required), trying other methods...');
          }
        }
      }

      // PRIORITY 2: Try transcript panel method (fallback)
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
      
      // PRIORITY 3: Try to get captions from video player
      const captionsFromPlayer = await extractCaptionsFromPlayer();
      if (captionsFromPlayer && captionsFromPlayer.length > 0) {
        return captionsFromPlayer;
      }

      // PRIORITY 4: Fetch fresh page HTML and retry the API-based paths
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
      
      // FINAL FALLBACK: Retry DOM extraction after all API attempts (the page
      // may have just loaded the transcript widget during the API calls).
      console.log('⚠️ Retrying DOM extraction as final fallback...');
      const domFinalAttempt = await extractTranscriptFromDOM();
      if (domFinalAttempt && domFinalAttempt.length > 0) {
        return domFinalAttempt;
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
