(() => {
  "use strict";

  // Cross-browser compatibility - Support both Chrome and Firefox
  const browserAPI = (typeof browser !== 'undefined') ? browser : chrome;

  // Constants
  const DEBUG = false;
  const ANIMATION_DURATION = 300;
  const NOTIFICATION_DURATION = 3000;
  const URL_CHECK_DELAY = 500;
  const DEBOUNCE_DELAY = 250;

  const SELECTORS = {
    toggle: 'linkedin-stats-toggle',
    overlay: 'linkedin-job-stats-overlay',
    notification: 'stats-notification',
    close: 'stats-close',
    refresh: 'stats-refresh',
    dragHandle: 'stats-drag-handle'
  };

  const POSITIONS = {
    mobile: { top: '10px', right: '10px', left: 'auto', bottom: 'auto' },
    tablet: { top: '15px', right: '15px', left: 'auto', bottom: 'auto' },
    desktop: { top: '80px', right: '20px', left: 'auto', bottom: 'auto' }
  };

  // Cache
  const cache = {
    elements: new Map(),
    lastJobId: null,
    lastData: null,
    isAnimating: false
  };

  // Utility functions
  const debugLog = DEBUG ? (...args) => console.log('[LinkedIn Stats]:', ...args) : () => { };

  const debounce = (fn, delay) => {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  };

  const getElement = (id) => {
    if (cache.elements.has(id)) {
      const el = cache.elements.get(id);
      if (document.body.contains(el)) return el;
      cache.elements.delete(id);
    }
    const el = document.getElementById(id);
    if (el) cache.elements.set(id, el);
    return el;
  };

  const clearCache = () => cache.elements.clear();

  // Cross-browser resource URL helper
  function getResourceURL(path) {
    return browserAPI.runtime.getURL(path);
  }

  // Position management
  function getSmartPosition(savedPosition) {
    const { innerWidth: vw, innerHeight: vh } = window;
    const defaultPos = vw < 480 ? POSITIONS.mobile : vw < 768 ? POSITIONS.tablet : POSITIONS.desktop;

    if (!savedPosition) return defaultPos;

    try {
      const pos = JSON.parse(savedPosition);
      const [w, h] = [320, 200];
      const nums = { top: parseFloat(pos.top) || 0, left: parseFloat(pos.left) || 0, right: parseFloat(pos.right) || 0, bottom: parseFloat(pos.bottom) || 0 };

      const validX = pos.left !== 'auto' && nums.left ? nums.left + w <= vw && nums.left >= 0 : pos.right !== 'auto' && nums.right ? nums.right + w <= vw && nums.right >= 0 : true;
      const validY = pos.top !== 'auto' && nums.top ? nums.top + h <= vh && nums.top >= 0 : pos.bottom !== 'auto' && nums.bottom ? nums.bottom + h <= vh && nums.bottom >= 0 : true;

      return validX && validY ? pos : defaultPos;
    } catch {
      return defaultPos;
    }
  }

  function savePosition(container) {
    const { top, left, right, bottom } = container.style;
    localStorage.setItem('linkedin-stats-position', JSON.stringify({ top, left, right, bottom }));
  }

  // UI Creation
  function createFloatingButton() {
    let button = getElement(SELECTORS.toggle);
    if (button) return button;

    button = document.createElement('button');
    button.id = SELECTORS.toggle;
    button.className = 'floating-stats-toggle';
    button.innerHTML = `<img src="${getResourceURL('icon.png')}" class="toggle-icon" alt="Stats"><span class="toggle-text">Stats</span>`;
    button.setAttribute('aria-label', 'Toggle job statistics');

    button.onclick = () => {
      const jobId = extractJobId();

      // Validate job ID before toggling
      if (!isValidJobId(jobId)) {
        debugLog('Cannot toggle - invalid job ID');
        return;
      }

      const container = getElement(SELECTORS.overlay);
      container ? toggleOverlay(container) : showStatsOverlay(createStatsDisplay());
    };

    document.body.appendChild(button);
    cache.elements.set(SELECTORS.toggle, button);
    return button;
  }

  function createStatsDisplay() {
    let container = getElement(SELECTORS.overlay);
    if (container) return container;

    container = document.createElement('div');
    container.id = SELECTORS.overlay;
    container.className = 'floating-stats-card';

    const pos = getSmartPosition(localStorage.getItem('linkedin-stats-position'));
    Object.assign(container.style, {
      position: 'fixed',
      ...pos,
      zIndex: '10000',
      display: 'none'
    });

    const urls = ['icon.png', 'refresh.png', 'close.png'].map(f => getResourceURL(f));
    container.innerHTML = `
      <div class="stats-card">
        <div class="stats-card-header" id="${SELECTORS.dragHandle}">
          <div class="stats-card-title">
            <img src="${urls[0]}" class="stats-icon" alt="Stats">
            <span class="stats-title">Job Stats</span>
          </div>
          <div class="stats-card-controls">
            <button id="${SELECTORS.refresh}" class="control-btn refresh-btn" aria-label="Refresh statistics">
              <img src="${urls[1]}" alt="Refresh" class="btn-icon">
            </button>
            <button id="${SELECTORS.close}" class="control-btn close-btn" aria-label="Close">
              <img src="${urls[2]}" alt="Close" class="btn-icon">
            </button>
          </div>
        </div>
        <div class="stats-card-content">
          <div class="stats-compact">
            <div class="compact-stat">
              <div class="compact-number" id="compact-applies">-</div>
              <div class="compact-label">Applies</div>
            </div>
            <div class="compact-separator"></div>
            <div class="compact-stat">
              <div class="compact-number" id="compact-views">-</div>
              <div class="compact-label">Views</div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(container);
    cache.elements.set(SELECTORS.overlay, container);

    setupEventListeners(container);
    setupDragFunctionality(container);

    return container;
  }

  // Event handlers
  function setupEventListeners(container) {
    container.addEventListener('click', async (e) => {
      const target = e.target.closest('button');
      if (!target) return;

      e.stopPropagation();

      if (target.id === SELECTORS.close) {
        hideStatsOverlay(container);
      } else if (target.id === SELECTORS.refresh && !target.disabled) {
        const jobId = extractJobId();

        // Validate job ID before refreshing
        if (!isValidJobId(jobId)) {
          debugLog('Cannot refresh - invalid job ID');
          return;
        }

        target.style.transform = 'rotate(180deg)';
        target.disabled = true;
        setLoadingState(true);

        try {
          // Clear cache to force fresh data
          cache.lastJobId = null;
          cache.lastData = null;

          await fetchJobStats();
          showSuccessFeedback(container);
        } catch (error) {
          handleStatsError(error);
        } finally {
          setTimeout(() => {
            target.style.transform = 'rotate(0deg)';
            target.disabled = false;
          }, 1000);
        }
      }
    });

    container.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hideStatsOverlay(container);
    });

    const dragHandle = container.querySelector(`#${SELECTORS.dragHandle}`);
    dragHandle?.addEventListener('dblclick', resetCardPosition);
  }

  function setupDragFunctionality(container) {
    const dragHandle = container.querySelector(`#${SELECTORS.dragHandle}`);
    let isDragging = false;
    let startX, startY, startLeft, startTop;

    const onMouseDown = (e) => {
      if (e.target.classList.contains('control-btn')) return;

      isDragging = true;
      [startX, startY] = [e.clientX, e.clientY];
      const rect = container.getBoundingClientRect();
      [startLeft, startTop] = [rect.left, rect.top];

      container.style.transition = 'none';
      container.classList.add('dragging');
      e.preventDefault();
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;

      const [deltaX, deltaY] = [e.clientX - startX, e.clientY - startY];
      const newLeft = Math.max(0, Math.min(startLeft + deltaX, window.innerWidth - container.offsetWidth));
      const newTop = Math.max(0, Math.min(startTop + deltaY, window.innerHeight - container.offsetHeight));

      Object.assign(container.style, { left: `${newLeft}px`, top: `${newTop}px`, right: 'auto', bottom: 'auto' });
    };

    const onMouseUp = () => {
      if (!isDragging) return;

      isDragging = false;
      container.style.transition = '';
      container.classList.remove('dragging');
      savePosition(container);
    };

    dragHandle.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    window.addEventListener('resize', debounce(() => ensureCardVisibility(container), DEBOUNCE_DELAY));
  }

  function ensureCardVisibility(container) {
    if (!container || container.style.display === 'none') return;

    const rect = container.getBoundingClientRect();
    const { innerWidth: vw, innerHeight: vh } = window;

    let [newLeft, newTop] = [parseFloat(container.style.left) || 0, parseFloat(container.style.top) || 0];
    const needsUpdate = newLeft + rect.width > vw || newTop + rect.height > vh || newLeft < 0 || newTop < 0;

    if (needsUpdate) {
      newLeft = Math.max(10, Math.min(newLeft, vw - rect.width - 10));
      newTop = Math.max(10, Math.min(newTop, vh - rect.height - 10));
      Object.assign(container.style, { left: `${newLeft}px`, top: `${newTop}px`, right: 'auto', bottom: 'auto' });
      savePosition(container);
    }
  }

  // UI state management
  function toggleOverlay(container) {
    const isHidden = container.style.display === 'none' || !container.style.display;
    isHidden ? showStatsOverlay(container) : hideStatsOverlay(container);
  }

  function showStatsOverlay(container) {
    if (!container || cache.isAnimating) return;

    container.style.display = 'block';
    container.offsetHeight; // Force reflow
    Object.assign(container.style, { opacity: '1', transform: 'translateY(0)' });
  }

  function hideStatsOverlay(container) {
    if (!container || cache.isAnimating) return;

    cache.isAnimating = true;
    container.style.transition = `all ${ANIMATION_DURATION}ms cubic-bezier(0.4, 0, 0.2, 1)`;
    Object.assign(container.style, { opacity: '0', transform: 'translateY(-20px) scale(0.95)' });

    setTimeout(() => {
      container.style.display = 'none';
      cache.isAnimating = false;
    }, ANIMATION_DURATION);
  }

  function showNotification(message, type = 'info') {
    getElement(SELECTORS.notification)?.remove();

    const colors = { success: '#10b981', error: '#ef4444', info: '#3b82f6' };
    const notification = document.createElement('div');
    notification.id = SELECTORS.notification;
    notification.textContent = message;

    Object.assign(notification.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      background: colors[type] || colors.info,
      color: 'white',
      padding: '12px 20px',
      borderRadius: '12px',
      fontSize: '14px',
      fontWeight: '600',
      zIndex: '10002',
      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
      backdropFilter: 'blur(10px)',
      transition: 'all 0.3s ease'
    });

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.opacity = '0';
      notification.style.transform = 'translateY(-20px)';
      setTimeout(() => notification.remove(), ANIMATION_DURATION);
    }, NOTIFICATION_DURATION);
  }

  // Data handling
  function extractJobId() {
    // Check URL path for /jobs/view/{id}
    const viewMatch = /\/jobs\/view\/(\d+)/.exec(location.pathname);
    if (viewMatch) return viewMatch[1];

    // Check query parameter for currentJobId
    const queryId = new URLSearchParams(location.search).get('currentJobId');
    if (queryId && /^\d+$/.test(queryId)) return queryId;

    // Check for numeric ID at end of path
    const numericMatch = /-(\d+)(\/)?$/.exec(location.pathname);
    if (numericMatch) return numericMatch[1];

    // Get last segment and validate it's numeric
    const segments = location.pathname.split('/').filter(Boolean);
    const lastSegment = segments[segments.length - 1];

    // Only return if it's a pure numeric ID (not "search-results", "collections", etc.)
    return /^\d+$/.test(lastSegment) ? lastSegment : null;
  }

  function isValidJobId(jobId) {
    return jobId && /^\d+$/.test(jobId) && jobId.length >= 10;
  }

  function setLoadingState(isLoading) {
    ['compact-views', 'compact-applies'].forEach(id => {
      const el = getElement(id);
      if (el) {
        el.textContent = isLoading ? '...' : el.textContent;
        el.classList.toggle('loading', isLoading);
      }
    });
  }

  function updateUIWithData(data) {
    const { views = 'N/A', applies = 'N/A' } = data;

    [['compact-views', views], ['compact-applies', applies]].forEach(([id, value]) => {
      const el = getElement(id);
      if (el) {
        el.textContent = formatNumber(value);
        el.classList.remove('loading');
      }
    });
  }

  function handleStatsError(error) {
    console.error('[LinkedIn Stats Error]:', error);
    setLoadingState(false);

    ['compact-applies', 'compact-views'].forEach(id => {
      const el = getElement(id);
      if (el) el.textContent = 'Error';
    });

    // Don't show notification or hide extension, let it stay visible with error state
  }

  function hideExtension() {
    const container = getElement(SELECTORS.overlay);
    const button = getElement(SELECTORS.toggle);

    if (container) hideStatsOverlay(container);
    if (button) button.style.display = 'none';

    cache.lastJobId = null;
    cache.lastData = null;
  }

  function showExtension() {
    const button = createFloatingButton();
    button.style.display = 'flex';
  }

  async function makeApiRequest(jobId) {
    // Extra validation before making API call
    if (!isValidJobId(jobId)) {
      throw new Error(`Invalid job ID: ${jobId}`);
    }

    const headers = {
      'Accept': 'application/vnd.linkedin.normalized+json+2.1',
      'x-restli-protocol-version': '2.0.0'
    };

    const csrfMatch = /JSESSIONID="(.*?)"/.exec(document.cookie);
    if (csrfMatch?.[1]) headers['csrf-token'] = csrfMatch[1];

    const response = await fetch(
      `https://www.linkedin.com/voyager/api/jobs/jobPostings/${jobId}`,
      { headers, credentials: 'include' }
    );

    if (!response.ok) throw new Error(`API request failed: ${response.status}`);
    return response.json();
  }

  async function fetchJobStats() {
    try {
      const jobId = extractJobId();

      // Don't proceed if no valid job ID
      if (!isValidJobId(jobId)) {
        debugLog('No valid job ID found, skipping fetch');
        hideExtension();
        return;
      }

      // Return cached data if same job
      if (cache.lastJobId === jobId && cache.lastData) {
        const container = createStatsDisplay();
        showStatsOverlay(container);
        updateUIWithData(cache.lastData);
        return;
      }

      const container = createStatsDisplay();
      showStatsOverlay(container);
      setLoadingState(true);

      const data = await makeApiRequest(jobId);
      if (!data.data) throw new Error('Invalid API response');

      cache.lastJobId = jobId;
      cache.lastData = data.data;
      updateUIWithData(data.data);
    } catch (error) {
      handleStatsError(error);
      hideExtension();
    }
  }

  function formatNumber(num) {
    const n = parseInt(num);
    if (isNaN(n)) return num;
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toString();
  }

  function showSuccessFeedback(container) {
    const card = container.querySelector('.stats-card');
    if (!card) return;

    Object.assign(card.style, {
      transition: 'all 0.3s ease',
      transform: 'scale(1.05)',
      boxShadow: '0 0 30px rgba(16, 185, 129, 0.4)'
    });

    setTimeout(() => Object.assign(card.style, { transform: 'scale(1)', boxShadow: '' }), 300);
  }

  function resetCardPosition() {
    localStorage.removeItem('linkedin-stats-position');
    const container = getElement(SELECTORS.overlay);
    if (!container) return;

    const pos = getSmartPosition(null);
    Object.assign(container.style, { ...pos, transition: 'all 0.5s ease', transform: 'scale(1.1)' });

    setTimeout(() => {
      container.style.transform = 'scale(1)';
      setTimeout(() => container.style.transition = '', 500);
    }, 200);
  }

  // Page detection and URL monitoring
  function isJobPage() {
    const path = location.pathname;

    // Must be under /jobs/ path
    if (!path.includes('/jobs')) {
      return false;
    }

    // Exclude jobs homepage (/jobs or /jobs/)
    if (path === '/jobs' || path === '/jobs/') {
      return false;
    }

    // Must have something after /jobs/
    const afterJobs = path.split('/jobs/')[1];
    return afterJobs && afterJobs.length > 0;
  }

  function handleUrlChange() {
    if (isJobPage()) {
      setTimeout(() => {
        const jobId = extractJobId();

        // Only show extension if we have a valid job ID
        if (isValidJobId(jobId)) {
          debugLog('Valid job ID found:', jobId);
          showExtension();
          fetchJobStats();
        } else {
          debugLog('Invalid or missing job ID, hiding extension');
          hideExtension();
        }
      }, URL_CHECK_DELAY);
    } else {
      debugLog('Not on job page, hiding extension');
      hideExtension();
    }
  }

  function observeUrlChanges() {
    let lastUrl = location.href;

    // Method 1: MutationObserver for DOM changes
    const observer = new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        handleUrlChange();
      }
    });
    observer.observe(document, { subtree: true, childList: true });

    // Method 2: History API interception (for SPA navigation)
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function () {
      originalPushState.apply(this, arguments);
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        handleUrlChange();
      }
    };

    history.replaceState = function () {
      originalReplaceState.apply(this, arguments);
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        handleUrlChange();
      }
    };

    // Method 3: popstate event (for browser back/forward)
    window.addEventListener('popstate', () => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        handleUrlChange();
      }
    });

    // Method 4: Periodic check as fallback (every 1 second)
    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        handleUrlChange();
      }
    }, 1000);
  }

  // Initialization
  function initialize() {
    debugLog("Initialization")
    if (isJobPage()) {
      const jobId = extractJobId();

      // Only show extension if we have a valid job ID
      if (isValidJobId(jobId)) {
        debugLog('Initial load - valid job ID found:', jobId);
        showExtension();
      } else {
        debugLog('Initial load - no valid job ID found');
      }
    }
    observeUrlChanges();
    handleUrlChange();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }

  // Cleanup on unload
  window.addEventListener('beforeunload', clearCache);
})();