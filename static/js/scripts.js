// Global Radio Player Manager with Client-Side Navigation
class GlobalRadioPlayer {
  constructor() {
    // Player state
    this.isPlaying = false;
    this.isMuted = false;
    this.volumeLevel = 0.8;
    this.lastVolumeLevel = this.volumeLevel;
    this.currentEpisodeId = null;
    this.progressUpdateInterval = null;
    this.loadingTimeout = null;
    this.isStreamReady = false;
    this.episodeCheckInterval = null;
    this.isInitialized = false;

    const savedStation = this.getSavedStation() || "all";
    this.currentStationId = savedStation;
    console.log("🎵 Initialized with station:", this.currentStationId);

    // DOM elements
    this.audioPlayer = null;
    this.playerBar = null;
    this.playBtn = null;
    this.playIcon = null;
    this.rewindBtn = null;
    this.volumeBtn = null;
    this.volumeIcon = null;
    this.volumeSlider = null;
    this.volumeContainer = null;
    this.progressBar = null;
    this.progress = null;
    this.currentTimeEl = null;
    this.durationEl = null;
    this.loadingOverlay = null;
    this.loadingStatus = null;
    this.episodeTitle = null;
    this.showName = null;
    this.episodeCover = null;

    // Loading states
    this.LoadingStates = {
      INITIALIZING: "Initializing player...",
      FETCHING_POSITION: "Getting current position...",
      LOADING_STREAM: "Loading audio stream...",
      BUFFERING: "Buffering audio...",
      READY: "Ready to play!",
      ERROR: "Connection failed",
    };

    console.log("🎵 Global Radio Player initialized");
    this.currentStationId = this.getSavedStation() || "all";
  }

  getSavedStation() {
    return localStorage.getItem("mcElroyRadioStation");
  }

  saveStation(stationId) {
    localStorage.setItem("mcElroyRadioStation", stationId);
  }

  restartEpisodeChecking() {
    console.log(
      "🎵 Restarting episode checking for station:",
      this.currentStationId,
    );

    if (this.episodeCheckInterval) {
      clearInterval(this.episodeCheckInterval);
      this.episodeCheckInterval = null;
    }

    this.startEpisodeChecking();
  }

  init() {
    console.log("🎵 Starting Global Radio Player initialization");

    this.setupPersistentAudio();
    this.bindElements();
    this.setupAudioPlayer();
    this.setupEventListeners();
    this.setupMediaSession();
    this.setupNavigationHandling();

    // Only initialize audio stream on first load
    if (!this.isInitialized) {
      this.initializeAudio();
      this.startEpisodeChecking();
      this.isInitialized = true;
    } else {
      // On subsequent page loads, just sync the UI
      this.syncUIWithAudioState();
      this.setStreamReady(true);
    }

    console.log("🎵 Global Radio Player setup complete");
  }

  setupPersistentAudio() {
    // Look for existing persistent audio element
    let existingAudio = document.getElementById("persistent-global-audio");

    if (existingAudio) {
      console.log("🎵 Found existing persistent audio element, reusing it");
      this.audioPlayer = existingAudio;

      // Restore state from existing audio
      this.isPlaying = !existingAudio.paused;
      this.volumeLevel = existingAudio.volume;
      this.isMuted = existingAudio.muted;

      console.log(
        `🎵 Audio state - playing: ${this.isPlaying}, volume: ${this.volumeLevel}, currentTime: ${existingAudio.currentTime}`,
      );
      return;
    }

    // Create new persistent audio element only if none exists
    console.log("🎵 Creating new persistent audio element");
    this.audioPlayer = document.createElement("audio");
    this.audioPlayer.id = "persistent-global-audio";
    this.audioPlayer.preload = "auto";
    this.audioPlayer.style.display = "none";

    // IMPORTANT: Set a data attribute so we can find it later
    this.audioPlayer.dataset.globalPlayer = "true";

    // Append to body so it persists across navigation
    document.body.appendChild(this.audioPlayer);

    console.log("🎵 Created and appended new audio element:", this.audioPlayer);
  }

  bindElements() {
    // Player bar and controls (recreated on each page)
    this.playerBar = document.getElementById("global-player-bar");
    this.playBtn = document.getElementById("player-play-btn");
    this.playIcon = this.playBtn?.querySelector("i");
    this.rewindBtn = document.getElementById("player-rewind-btn");
    this.volumeBtn = document.getElementById("player-volume-btn");
    this.volumeIcon = this.volumeBtn?.querySelector("i");
    this.volumeSlider = document.getElementById("player-volume-slider");
    this.volumeContainer = document.getElementById(
      "player-volume-slider-container",
    );

    // Progress elements
    this.progressBar = document.getElementById("player-progress-bar");
    this.progress = document.getElementById("player-progress");
    this.currentTimeEl = document.getElementById("player-current-time");
    this.durationEl = document.getElementById("player-duration");

    // Loading elements
    this.loadingOverlay = document.getElementById("player-loading-overlay");
    this.loadingStatus = document.getElementById("player-loading-status");

    // Episode info elements
    this.episodeTitle = document.getElementById("player-episode-title");
    this.showName = document.getElementById("player-show-name");
    this.episodeCover = document.getElementById("player-episode-cover");

    // Set initial state
    this.setControlsEnabled(this.isStreamReady);
  }

  syncUIWithAudioState() {
    console.log("🎵 Syncing UI with current audio state");

    // Update play button
    if (this.playIcon) {
      if (this.isPlaying) {
        this.playIcon.classList.remove("fa-play");
        this.playIcon.classList.add("fa-pause");
      } else {
        this.playIcon.classList.remove("fa-pause");
        this.playIcon.classList.add("fa-play");
      }
    }

    // Update volume controls
    if (this.volumeSlider) {
      this.volumeSlider.value = this.volumeLevel * 100;
    }

    if (this.volumeIcon) {
      this.volumeIcon.classList.remove("fa-volume-mute", "fa-volume-up");
      if (this.isMuted || this.volumeLevel === 0) {
        this.volumeIcon.classList.add("fa-volume-mute");
      } else {
        this.volumeIcon.classList.add("fa-volume-up");
      }
    }

    // Update duration if available
    if (this.audioPlayer && this.audioPlayer.duration && this.durationEl) {
      this.durationEl.textContent = this.formatTime(this.audioPlayer.duration);
    }

    // Start progress updates if playing
    if (this.isPlaying) {
      this.startProgressUpdates();
    }

    // Sync episode info
    this.checkForNewEpisode();
  }

  setupNavigationHandling() {
    // Intercept navigation links for client-side routing
    document.addEventListener("click", (e) => {
      const link = e.target.closest("a[href]");
      if (link && this.isInternalLink(link.href)) {
        e.preventDefault();
        this.navigateToPage(link.href);
      }
    });

    // Handle browser back/forward buttons
    window.addEventListener("popstate", (e) => {
      if (e.state && e.state.url) {
        this.navigateToPage(e.state.url, false);
      }
    });

    // Save initial state
    history.replaceState(
      { url: window.location.pathname },
      "",
      window.location.pathname,
    );
  }

  isInternalLink(href) {
    // Check if link is internal (same origin and not external)
    try {
      const url = new URL(href, window.location.origin);
      return (
        url.origin === window.location.origin &&
        !href.includes("download") &&
        !href.includes(".mp3") &&
        !href.includes("mailto:") &&
        !href.includes("tel:")
      );
    } catch {
      return false;
    }
  }

  async navigateToPage(url, pushState = true) {
    try {
      console.log(`🎵 Navigating to: ${url}`);

      // Show loading state
      this.showNavigationLoading();

      // Fetch the new page content
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const html = await response.text();

      // Parse the response and extract the main content
      const parser = new DOMParser();
      const newDoc = parser.parseFromString(html, "text/html");

      // Update the page content
      const newMain = newDoc.querySelector("main");
      const currentMain = document.querySelector("main");

      if (newMain && currentMain) {
        currentMain.innerHTML = newMain.innerHTML;
      }

      // Update page title
      const newTitle = newDoc.querySelector("title");
      if (newTitle) {
        document.title = newTitle.textContent;
      }

      // Update navigation active states
      this.updateNavigationState(url);

      // Update browser history
      if (pushState) {
        history.pushState({ url }, "", url);
      }

      // Rebind any page-specific functionality
      this.bindPageSpecificElements();

      // Hide loading state
      this.hideNavigationLoading();

      console.log(`🎵 Successfully navigated to: ${url}`);
    } catch (error) {
      console.error("Navigation failed:", error);
      this.hideNavigationLoading();
      // Fallback to traditional navigation
      window.location.href = url;
    }
  }

  updateNavigationState(currentUrl) {
    // Update active navigation states
    document.querySelectorAll("nav a").forEach((link) => {
      const href = new URL(link.href).pathname;
      const current = new URL(currentUrl, window.location.origin).pathname;

      if (href === current) {
        link.classList.add("active");
      } else {
        link.classList.remove("active");
      }
    });
  }

  showNavigationLoading() {
    // Add a subtle loading indicator
    let loader = document.getElementById("nav-loader");
    if (!loader) {
      loader = document.createElement("div");
      loader.id = "nav-loader";
      loader.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 3px;
        background: linear-gradient(90deg, transparent, var(--primary-color), transparent);
        z-index: 9999;
        animation: loading-slide 1s ease-in-out infinite;
      `;
      document.body.appendChild(loader);

      // Add CSS for animation
      if (!document.getElementById("nav-loader-css")) {
        const style = document.createElement("style");
        style.id = "nav-loader-css";
        style.textContent = `
          @keyframes loading-slide {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100vw); }
          }
        `;
        document.head.appendChild(style);
      }
    }
    loader.style.display = "block";
  }

  hideNavigationLoading() {
    const loader = document.getElementById("nav-loader");
    if (loader) {
      loader.style.display = "none";
    }
  }

  debugAudioPlayerState() {
    console.log("🎵 Audio Player Debug State:", {
      audioPlayerExists: !!this.audioPlayer,
      audioPlayerType: this.audioPlayer
        ? this.audioPlayer.constructor.name
        : "none",
      audioPlayerSrc: this.audioPlayer ? this.audioPlayer.src : "none",
      audioPlayerPaused: this.audioPlayer ? this.audioPlayer.paused : "unknown",
      audioPlayerCurrentTime: this.audioPlayer
        ? this.audioPlayer.currentTime
        : "unknown",
      audioPlayerDuration: this.audioPlayer
        ? this.audioPlayer.duration
        : "unknown",
      domAudioElements: document.querySelectorAll("audio").length,
      persistentAudioExists: !!document.getElementById(
        "persistent-global-audio",
      ),
      globalPlayerBarExists: !!document.getElementById("global-player-bar"),
    });
  }

  forceEpisodeInfoUpdate() {
    console.log(
      "🎵 Force updating episode information for station:",
      this.currentStationId,
    );

    // Clear current episode ID to force recognition as new
    const previousId = this.currentEpisodeId;
    this.currentEpisodeId = null;

    // Make immediate forced calls with the correct station
    this.checkForNewEpisode(true);

    // Multiple rapid attempts to ensure we get the right station's episode
    setTimeout(() => {
      console.log("🎵 Force update - second attempt (250ms)");
      this.checkForNewEpisode(true);
    }, 250);

    setTimeout(() => {
      console.log("🎵 Force update - third attempt (750ms)");
      this.checkForNewEpisode(true);
    }, 750);

    setTimeout(() => {
      console.log("🎵 Force update - fourth attempt (1500ms)");
      this.checkForNewEpisode(true);
    }, 1500);

    // Restore ID after a moment in case all fetches fail
    setTimeout(() => {
      if (this.currentEpisodeId === null) {
        console.log("🎵 Restoring previous episode ID as fallback");
        this.currentEpisodeId = previousId;
      }
    }, 5000);
  }

  // Add this method to your GlobalRadioPlayer class:
  bindPageSpecificElements() {
    console.log("🔧 Binding page-specific elements...");

    // Rebind page-specific functionality like the random fact button
    const newFactBtn = document.getElementById("new-fact-btn");
    if (newFactBtn) {
      newFactBtn.addEventListener("click", getRandomFact);
      console.log("🔧 Bound random fact button");
    }

    // Radio quote functionality for homepage
    const radioQuote = document.getElementById("radio-quote");
    if (radioQuote && !radioQuote.dataset.bound) {
      radioQuote.dataset.bound = "true";
      updateRadioQuote();
      setInterval(updateRadioQuote, 60000);
      console.log("🔧 Bound radio quote functionality");
    }

    // Station Manager initialization for home page
    if (document.getElementById("stations-grid")) {
      console.log("🎵 Home page detected, handling station manager");

      // CRITICAL FIX: Ensure we have the correct station ID
      const savedStation = this.getSavedStation() || "all";

      // Make sure the global player uses the correct station
      if (this.currentStationId !== savedStation) {
        console.log(
          `🎵 SYNC FIX: Correcting station ID from ${this.currentStationId} to ${savedStation}`,
        );
        this.currentStationId = savedStation;
      }

      if (!this.stationManager) {
        // Create new station manager with correct station ID
        console.log("🎵 Creating new StationManager");
        this.stationManager = new StationManager(this);
        this.stationManager.init();
      } else {
        // REUSE existing station manager - just rebind DOM elements and sync state
        console.log("🎵 Reusing existing StationManager, rebinding DOM");

        // Sync station IDs
        if (this.stationManager.currentStationId !== savedStation) {
          console.log(
            `🎵 SYNC FIX: Correcting StationManager station ID from ${this.stationManager.currentStationId} to ${savedStation}`,
          );
          this.stationManager.currentStationId = savedStation;
        }

        // Rebind DOM elements without full re-initialization
        this.stationManager.rebindDOM();
      }

      // Update episode info for current station (much faster than force update)
      this.checkForNewEpisode(true);
    } else {
      console.log("🎵 Not on home page, skipping station manager");
    }

    // Directory page functionality
    this.setupDirectoryFunctionality();

    // Analytics page functionality
    this.setupAnalyticsFunctionality();

    // NEW: Bind episode play buttons
    if (document.querySelectorAll(".btn-play").length > 0) {
      bindDirectoryPlayButtons();
    }
  }

  setupDirectoryFunctionality() {
    console.log("🔍 Setting up directory functionality...");

    // Check if we're on the directory page
    const searchInput = document.getElementById("episode-search");
    if (!searchInput) {
      console.log("🔍 Not on directory page, skipping directory setup");
      return;
    }

    console.log("🔍 Directory page detected, initializing...");

    // Elements
    const searchStats = document.getElementById("search-stats");
    const searchResultsCount = document.getElementById("search-results-count");
    const clearSearchBtn = document.getElementById("clear-search");
    const expandAllBtn = document.getElementById("expand-all-btn");
    const collapseAllBtn = document.getElementById("collapse-all-btn");
    const noResults = document.getElementById("no-results");

    // Get all episodes and shows
    const episodeItems = document.querySelectorAll(".episode-item");
    const showSections = document.querySelectorAll(".show-section");
    const collapseToggles = document.querySelectorAll(".collapse-toggle");

    console.log("🔍 Found directory elements:", {
      episodeItems: episodeItems.length,
      showSections: showSections.length,
      collapseToggles: collapseToggles.length,
    });

    if (episodeItems.length === 0) {
      console.log("🔍 No episode items found, skipping directory setup");
      return;
    }

    // Sort episodes by date (newest first) on page load
    this.sortEpisodesByDate(showSections);

    // Search functionality with debouncing
    let searchTimeout;
    searchInput.addEventListener("input", (event) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        this.performSearch(event.target.value.trim(), {
          episodeItems,
          showSections,
          searchStats,
          searchResultsCount,
          noResults,
        });
      }, 300);
    });

    // Clear search
    if (clearSearchBtn) {
      clearSearchBtn.addEventListener("click", () => {
        searchInput.value = "";
        this.performSearch("", {
          episodeItems,
          showSections,
          searchStats,
          searchResultsCount,
          noResults,
        });
        searchInput.focus();
      });
    }

    // Expand/Collapse all
    if (expandAllBtn) {
      expandAllBtn.addEventListener("click", () => {
        this.expandAllSections(collapseToggles, showSections);
      });
    }

    if (collapseAllBtn) {
      collapseAllBtn.addEventListener("click", () => {
        this.collapseAllSections(collapseToggles, showSections);
      });
    }

    // Individual collapse toggles
    collapseToggles.forEach((toggle) => {
      toggle.addEventListener("click", (event) => {
        const showSection = event.target.closest(".show-section");
        const episodesContainer = showSection.querySelector(
          ".episodes-container",
        );
        const isExpanded = toggle.getAttribute("aria-expanded") === "true";

        this.toggleSection(episodesContainer, !isExpanded);
        toggle.setAttribute("aria-expanded", !isExpanded);

        // Update button states
        this.updateExpandCollapseButtons(
          collapseToggles,
          showSections,
          expandAllBtn,
          collapseAllBtn,
        );
      });
    });

    // Keyboard shortcuts for directory
    const directoryKeyHandler = (event) => {
      // Don't interfere with other inputs
      if (event.target.matches("input, textarea")) return;

      switch (event.key) {
        case "/":
          event.preventDefault();
          searchInput.focus();
          break;
        case "Escape":
          if (document.activeElement === searchInput) {
            searchInput.blur();
          }
          break;
      }
    };

    // Remove existing directory key handler if it exists
    if (this.directoryKeyHandler) {
      document.removeEventListener("keydown", this.directoryKeyHandler);
    }

    // Add new handler and store reference
    this.directoryKeyHandler = directoryKeyHandler;
    document.addEventListener("keydown", directoryKeyHandler);

    // Initialize button states
    this.updateExpandCollapseButtons(
      collapseToggles,
      showSections,
      expandAllBtn,
      collapseAllBtn,
    );

    console.log("🔍 Directory functionality setup complete!");
  }

  // Replace your existing setupAnalyticsFunctionality method in GlobalRadioPlayer with this:

  setupAnalyticsFunctionality() {
    console.log("📊 Setting up analytics functionality...");

    // Check if we're on the analytics page
    if (!window.location.pathname.includes("/analytics")) {
      console.log("📊 Not on analytics page, skipping analytics setup");
      return;
    }

    console.log("📊 Analytics page detected, initializing...");

    // Clear any existing analytics intervals to prevent conflicts
    if (window.analyticsRefreshInterval) {
      clearInterval(window.analyticsRefreshInterval);
      window.analyticsRefreshInterval = null;
    }

    // Initialize or reinitialize the analytics manager
    if (!window.analyticsManager) {
      console.log("📊 Creating new AnalyticsManager instance");
      window.analyticsManager = new AnalyticsManager();
    }

    // Small delay to ensure DOM is ready
    setTimeout(() => {
      console.log("📊 Calling AnalyticsManager.init()");
      window.analyticsManager.init();
    }, 100);
  }

  initBasicAnalytics() {
    console.log("📊 Setting up basic analytics...");

    // Basic chart refresh functionality
    const refreshButton = document.querySelector(".refresh-btn");
    if (refreshButton && !refreshButton.dataset.bound) {
      refreshButton.dataset.bound = "true";
      refreshButton.addEventListener("click", () => {
        console.log("📊 Refreshing analytics manually");
        window.location.reload(); // Simple fallback
      });
    }

    // If there are time period buttons, rebind them
    const timePeriodButtons = document.querySelectorAll("[data-period]");
    timePeriodButtons.forEach((button) => {
      if (!button.dataset.bound) {
        button.dataset.bound = "true";
        button.addEventListener("click", (e) => {
          const period = e.target.dataset.period;
          console.log("📊 Time period selected:", period);

          // Update active state
          timePeriodButtons.forEach((btn) => btn.classList.remove("active"));
          e.target.classList.add("active");

          // Trigger chart update if possible
          if (window.refreshAnalytics) {
            window.refreshAnalytics(period);
          }
        });
      }
    });

    console.log("📊 Basic analytics setup complete");
  }

  // Directory helper methods
  sortEpisodesByDate(showSections) {
    showSections.forEach((showSection) => {
      const episodesGrid = showSection.querySelector(".episodes-grid");
      if (!episodesGrid) return;

      const episodes = Array.from(
        episodesGrid.querySelectorAll(".episode-item"),
      );

      episodes.sort((a, b) => {
        const dateA = new Date(a.dataset.episodeDate);
        const dateB = new Date(b.dataset.episodeDate);
        return dateB - dateA; // Newest first
      });

      // Reorder in DOM
      episodes.forEach((episode) => {
        episodesGrid.appendChild(episode);
      });
    });
  }

  performSearch(query, elements) {
    const {
      episodeItems,
      showSections,
      searchStats,
      searchResultsCount,
      noResults,
    } = elements;

    console.log("🔍 Performing search for:", query);

    if (!query) {
      // Show all episodes
      episodeItems.forEach((item) => {
        item.classList.remove("hidden");
      });
      showSections.forEach((section) => {
        section.style.display = "block";
      });
      if (searchStats) searchStats.style.display = "none";
      if (noResults) noResults.style.display = "none";
      this.updateShowStats(showSections);
      return;
    }

    const queryLower = query.toLowerCase();
    let visibleCount = 0;

    showSections.forEach((showSection) => {
      const sectionEpisodeItems = showSection.querySelectorAll(".episode-item");
      let showHasVisible = false;

      sectionEpisodeItems.forEach((item) => {
        const title = item.dataset.episodeTitle?.toLowerCase() || "";
        const date = item.dataset.episodeDate?.toLowerCase() || "";
        const showName = item.dataset.showName?.toLowerCase() || "";

        const matches =
          title.includes(queryLower) ||
          date.includes(queryLower) ||
          showName.includes(queryLower);

        if (matches) {
          item.classList.remove("hidden");
          showHasVisible = true;
          visibleCount++;
        } else {
          item.classList.add("hidden");
        }
      });

      if (showHasVisible) {
        showSection.style.display = "block";

        // Auto-expand sections with results
        const episodesContainer = showSection.querySelector(
          ".episodes-container",
        );
        const toggle = showSection.querySelector(".collapse-toggle");
        if (episodesContainer && toggle) {
          this.toggleSection(episodesContainer, true);
          toggle.setAttribute("aria-expanded", "true");
        }
      } else {
        showSection.style.display = "none";
      }
    });

    // Update search stats
    if (searchResultsCount) searchResultsCount.textContent = visibleCount;
    if (searchStats) searchStats.style.display = "block";

    // Show/hide no results
    if (noResults) {
      if (visibleCount === 0) {
        noResults.style.display = "block";
      } else {
        noResults.style.display = "none";
      }
    }

    this.updateShowStats(showSections);
    console.log("🔍 Search complete, found", visibleCount, "episodes");
  }

  updateShowStats(showSections) {
    showSections.forEach((showSection) => {
      const visibleEpisodes = showSection.querySelectorAll(
        ".episode-item:not(.hidden)",
      );
      const visibleCountEl = showSection.querySelector(".visible-count");
      if (visibleCountEl) {
        visibleCountEl.textContent = visibleEpisodes.length;
      }
    });
  }

  toggleSection(container, expand) {
    if (!container) return;

    if (expand) {
      container.classList.remove("collapsed");
      container.style.maxHeight = container.scrollHeight + "px";
    } else {
      container.classList.add("collapsed");
      container.style.maxHeight = "0px";
    }
  }

  expandAllSections(collapseToggles, showSections) {
    console.log("🔍 Expanding all sections");
    collapseToggles.forEach((toggle) => {
      const showSection = toggle.closest(".show-section");
      if (showSection && showSection.style.display !== "none") {
        const episodesContainer = showSection.querySelector(
          ".episodes-container",
        );
        this.toggleSection(episodesContainer, true);
        toggle.setAttribute("aria-expanded", "true");
      }
    });
    this.updateExpandCollapseButtons(collapseToggles, showSections);
  }

  collapseAllSections(collapseToggles, showSections) {
    console.log("🔍 Collapsing all sections");
    collapseToggles.forEach((toggle) => {
      const showSection = toggle.closest(".show-section");
      if (showSection && showSection.style.display !== "none") {
        const episodesContainer = showSection.querySelector(
          ".episodes-container",
        );
        this.toggleSection(episodesContainer, false);
        toggle.setAttribute("aria-expanded", "false");
      }
    });
    this.updateExpandCollapseButtons(collapseToggles, showSections);
  }

  updateExpandCollapseButtons(
    collapseToggles,
    showSections,
    expandAllBtn,
    collapseAllBtn,
  ) {
    if (!expandAllBtn || !collapseAllBtn) return;

    const visibleSections = Array.from(showSections).filter(
      (section) => section.style.display !== "none",
    );
    const expandedSections = visibleSections.filter((section) => {
      const toggle = section.querySelector(".collapse-toggle");
      return toggle && toggle.getAttribute("aria-expanded") === "true";
    });

    expandAllBtn.disabled = expandedSections.length === visibleSections.length;
    collapseAllBtn.disabled = expandedSections.length === 0;
  }

  setupAudioPlayer() {
    if (!this.audioPlayer) {
      console.error("Audio player element not found");
      return;
    }

    // Skip if already setup
    if (this.audioPlayer.dataset.listenersSetup === "true") {
      console.log("🎵 Audio listeners already setup, skipping");
      return;
    }

    // Set initial audio state
    this.audioPlayer.volume = this.volumeLevel;
    this.audioPlayer.muted = this.isMuted;
    this.audioPlayer.preload = "metadata";

    // Mark as setup
    this.audioPlayer.dataset.listenersSetup = "true";

    // Audio event listeners
    this.audioPlayer.addEventListener("loadstart", () => {
      console.log("Audio load started");
      this.updateLoadingStatus(this.LoadingStates.LOADING_STREAM);
    });

    this.audioPlayer.addEventListener("loadedmetadata", () => {
      console.log("Audio metadata loaded");
      if (this.audioPlayer.duration && this.durationEl) {
        this.durationEl.textContent = this.formatTime(
          this.audioPlayer.duration,
        );
      }
    });

    this.audioPlayer.addEventListener("canplay", () => {
      console.log("Audio can play");
      this.updateLoadingStatus(this.LoadingStates.READY);
      setTimeout(() => {
        this.setStreamReady(true);
      }, 500);
    });

    this.audioPlayer.addEventListener("canplaythrough", () => {
      console.log("Audio can play through");
      this.setStreamReady(true);
    });

    this.audioPlayer.addEventListener("playing", () => {
      console.log("Audio is actually playing");
      this.setStreamReady(true);
    });

    this.audioPlayer.addEventListener("play", () => {
      this.isPlaying = true;
      this.userPaused = false; // User didn't pause, they started playing
      this.shouldAutoplay = true; // Radio should continue playing

      if (this.playIcon) {
        this.playIcon.classList.remove("fa-play");
        this.playIcon.classList.add("fa-pause");
      }
      this.startProgressUpdates();
      this.updateMediaSessionPlaybackState("playing");
      console.log("Audio started playing");
    });

    this.audioPlayer.addEventListener("pause", () => {
      this.isPlaying = false;

      // Only mark as user paused if this wasn't triggered by an 'ended' event
      if (!this.audioPlayer.ended) {
        this.userPaused = true;
        this.shouldAutoplay = false; // User paused, don't autoplay next episode
        console.log("Audio paused by user");
      } else {
        console.log("Audio paused due to episode ending");
      }

      if (this.playIcon) {
        this.playIcon.classList.remove("fa-pause");
        this.playIcon.classList.add("fa-play");
      }
      this.stopProgressUpdates();
      this.updateMediaSessionPlaybackState("paused");
    });

    this.audioPlayer.addEventListener("timeupdate", () => {
      this.updateProgress();
      this.updateMediaSessionPosition();
    });

    this.audioPlayer.addEventListener("error", (e) => {
      console.error("Audio error:", e);
      this.isPlaying = false;
      this.stopProgressUpdates();
      this.updateLoadingStatus(this.LoadingStates.ERROR);
      this.hideLoadingOverlay();
      this.showNotification(
        "Audio playback error. Please try refreshing the page.",
        "error",
      );
    });

    this.audioPlayer.addEventListener("stalled", () => {
      console.warn("Audio stream stalled - buffering");
      this.updateLoadingStatus(this.LoadingStates.BUFFERING);
    });

    this.audioPlayer.addEventListener("waiting", () => {
      console.log("Audio waiting for data - buffering");
      this.updateLoadingStatus(this.LoadingStates.BUFFERING);
    });

    this.audioPlayer.addEventListener("ended", () => {
      console.log("Audio stream ended");
      this.isPlaying = false;
      this.userPaused = false; // Episode ended naturally, not user action
      // Keep shouldAutoplay as-is - if it was true, next episode should autoplay

      this.stopProgressUpdates();
      setTimeout(() => this.checkForNewEpisode(), 6000);
    });
  }

  initializeAudio() {
    if (!this.audioPlayer) return;

    this.updateLoadingStatus(this.LoadingStates.INITIALIZING);
    this.showLoadingOverlay();

    // Set loading timeout
    this.loadingTimeout = setTimeout(() => {
      if (!this.isStreamReady) {
        console.warn("Stream loading taking longer than expected");
        this.updateLoadingStatus("Taking longer than usual...");
      }
    }, 8000);

    // Force hide after 20 seconds
    setTimeout(() => {
      if (!this.isStreamReady) {
        console.warn("Force hiding loading overlay");
        this.setStreamReady(true);
        this.showNotification("Stream ready (click play if needed)");
      }
    }, 20000);

    this.updateLoadingStatus(this.LoadingStates.FETCHING_POSITION);

    // FIX 5: Properly construct stream position URL
    const positionParams = new URLSearchParams();
    positionParams.append("station", this.currentStationId);
    positionParams.append("t", Date.now().toString());
    const positionUrl = `/stream-position?${positionParams.toString()}`;

    // Get server position for current station
    fetch(positionUrl)
      .then((response) => response.json())
      .then((data) => {
        const serverTimePosition = data.time_position || 0;
        this.updateLoadingStatus(this.LoadingStates.LOADING_STREAM);

        // FIX 6: Ensure audio stream URL includes correct station
        const streamParams = new URLSearchParams();
        streamParams.append("station", this.currentStationId);
        streamParams.append("t", Date.now().toString());
        const streamUrl = `/stream?${streamParams.toString()}`;

        console.log(
          "Setting audio source for station",
          this.currentStationId,
          ":",
          streamUrl,
        );
        console.log("Server position:", serverTimePosition, "seconds");

        this.audioPlayer.src = streamUrl;

        const handleLoadedMetadata = () => {
          this.audioPlayer.removeEventListener(
            "loadedmetadata",
            handleLoadedMetadata,
          );

          // CRITICAL: Seek to server position for proper sync
          if (serverTimePosition > 0 && this.audioPlayer.duration) {
            const seekPosition = Math.min(
              serverTimePosition,
              this.audioPlayer.duration - 1,
            );
            console.log(
              "Initial sync - seeking to position:",
              seekPosition,
              "seconds",
            );
            this.audioPlayer.currentTime = seekPosition;
          }

          // Try autoplay
          const playPromise = this.audioPlayer.play();
          if (playPromise !== undefined) {
            playPromise
              .then(() => {
                console.log(
                  "Autoplay started successfully at position:",
                  this.audioPlayer.currentTime,
                );
                this.setStreamReady(true);
                this.showNotification(
                  "McElroy Radio is now playing!",
                  "success",
                );
              })
              .catch((error) => {
                console.log("Autoplay prevented:", error.message);
                this.setStreamReady(true);
                this.showNotification(
                  "Click the play button to start listening",
                );
              });
          } else {
            this.setStreamReady(true);
          }
        };

        if (this.audioPlayer.readyState >= 1) {
          handleLoadedMetadata();
        } else {
          this.audioPlayer.addEventListener(
            "loadedmetadata",
            handleLoadedMetadata,
          );
          setTimeout(() => {
            if (!this.isStreamReady) {
              console.log("Metadata timeout, forcing ready");
              this.setStreamReady(true);
            }
          }, 10000);
        }
      })
      .catch((error) => {
        console.error("Failed to get server position:", error);
        this.updateLoadingStatus(this.LoadingStates.ERROR);
        setTimeout(() => {
          this.hideLoadingOverlay();
          this.showNotification(
            "Failed to connect to stream. Please refresh the page.",
            "error",
          );
        }, 2000);
      });
  }

  setupEventListeners() {
    // Play/pause button
    if (this.playBtn) {
      this.playBtn.addEventListener("click", () => this.togglePlay());
    }

    // Rewind button
    if (this.rewindBtn) {
      this.rewindBtn.addEventListener("click", () => this.rewind());
    }

    // Volume button
    if (this.volumeBtn) {
      this.volumeBtn.addEventListener("click", () =>
        this.toggleVolumeDisplay(),
      );
      this.volumeBtn.addEventListener("dblclick", () => this.toggleMute());
    }

    // Volume slider
    if (this.volumeSlider) {
      this.volumeSlider.addEventListener("input", () => this.setVolume());
    }

    // Progress bar clicking

    // Progress bar clicking
    if (this.progressBar) {
      this.progressBar.addEventListener("click", (e) => this.seekToPosition(e));
    } else {
      // Try to find the progress bar as the top-level progress element
      const topProgressBar = document.querySelector(".player-progress");
      if (topProgressBar) {
        this.progressBar = topProgressBar;
        this.progress =
          topProgressBar.querySelector(".progress") || this.progress;
        this.progressBar.addEventListener("click", (e) =>
          this.seekToPosition(e),
        );
      }
    }

    // Close volume slider when clicking outside
    document.addEventListener("click", (event) => {
      if (
        this.volumeBtn &&
        this.volumeContainer &&
        !this.volumeBtn.contains(event.target) &&
        !this.volumeContainer.contains(event.target)
      ) {
        this.volumeContainer.classList.remove("show");
      }
    });

    // Keyboard shortcuts
    document.addEventListener("keydown", (event) => {
      if (event.target.matches("input, textarea")) return;

      switch (event.code) {
        case "Space":
          event.preventDefault();
          this.togglePlay();
          break;
        case "ArrowLeft":
          event.preventDefault();
          this.rewind();
          break;
        case "ArrowUp":
          event.preventDefault();
          if (this.volumeSlider && !this.volumeSlider.disabled) {
            this.volumeSlider.value = Math.min(
              100,
              parseInt(this.volumeSlider.value) + 5,
            );
            this.setVolume();
          }
          break;
        case "ArrowDown":
          event.preventDefault();
          if (this.volumeSlider && !this.volumeSlider.disabled) {
            this.volumeSlider.value = Math.max(
              0,
              parseInt(this.volumeSlider.value) - 5,
            );
            this.setVolume();
          }
          break;
        case "KeyM":
          event.preventDefault();
          this.toggleMute();
          break;
      }
    });

    // Handle page visibility changes
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && this.isPlaying) {
        setTimeout(() => this.checkForNewEpisode(), 1000);
      }
    });

    // Handle network connectivity changes
    window.addEventListener("online", () => {
      console.log("Network connection restored");
      if (!this.isStreamReady) {
        this.showNotification(
          "Connection restored. Reconnecting...",
          "success",
        );
        setTimeout(() => this.initializeAudio(), 1000);
      }
    });

    window.addEventListener("offline", () => {
      console.log("Network connection lost");
      this.showNotification(
        "Connection lost. Playback may be interrupted.",
        "error",
      );
    });
  }

  setupMediaSession() {
    if ("mediaSession" in navigator) {
      console.log("Setting up Media Session API");

      navigator.mediaSession.setActionHandler("play", () => this.togglePlay());
      navigator.mediaSession.setActionHandler("pause", () => this.togglePlay());
      navigator.mediaSession.setActionHandler("seekbackward", (details) => {
        const skipTime = details.seekOffset || 15;
        this.rewind(skipTime);
      });
      navigator.mediaSession.setActionHandler("seekforward", (details) => {
        const skipTime = details.seekOffset || 30;
        if (this.audioPlayer && this.audioPlayer.duration) {
          this.audioPlayer.currentTime = Math.min(
            this.audioPlayer.currentTime + skipTime,
            this.audioPlayer.duration,
          );
        }
      });
      navigator.mediaSession.setActionHandler("seekto", (details) => {
        if (this.audioPlayer && details.seekTime !== null) {
          this.audioPlayer.currentTime = details.seekTime;
        }
      });

      this.updateMediaSessionMetadata();
    }
  }

  startEpisodeChecking() {
    // Don't start multiple intervals
    if (this.episodeCheckInterval) {
      return;
    }

    // Initial check
    this.checkForNewEpisode();

    // Check every 30 seconds
    this.episodeCheckInterval = setInterval(() => {
      this.checkForNewEpisode();
    }, 30000);
  }

  fastSwitchToStation(stationId) {
    console.log("🎵 FAST switching to station:", stationId);

    // Skip the server call and just update the stream directly
    this.currentStationId = stationId;
    this.renderStations();

    if (this.globalRadioPlayer && this.globalRadioPlayer.showNotification) {
      this.globalRadioPlayer.showNotification(
        `Tuning to ${this.getStationName(stationId)}...`,
        "info",
      );
    }

    // Get audio player and switch immediately
    const audioPlayer = this.getAudioPlayer();
    if (!audioPlayer) {
      console.error("🎵 No audio player for fast switch");
      return;
    }

    const wasPlaying = !audioPlayer.paused;
    const streamUrl = `/stream?t=${Date.now()}&station=${stationId}`;

    // Immediate switch
    audioPlayer.src = streamUrl;

    if (wasPlaying) {
      // Try to resume immediately
      setTimeout(() => {
        audioPlayer
          .play()
          .then(() => {
            console.log("🎵 Fast switch successful");
            if (
              this.globalRadioPlayer &&
              this.globalRadioPlayer.showNotification
            ) {
              this.globalRadioPlayer.showNotification(
                `Now playing: ${this.getStationName(stationId)}`,
                "success",
              );
            }
          })
          .catch(() => {
            console.log("🎵 Fast switch needs manual play");
            if (
              this.globalRadioPlayer &&
              this.globalRadioPlayer.showNotification
            ) {
              this.globalRadioPlayer.showNotification(
                "Station switched! Click play to resume.",
                "info",
              );
            }
          });
      }, 500);
    }

    // Quick episode check
    setTimeout(() => {
      if (
        this.globalRadioPlayer &&
        typeof this.globalRadioPlayer.checkForNewEpisode === "function"
      ) {
        this.globalRadioPlayer.checkForNewEpisode();
      }
    }, 1000);

    // Update server in background (non-blocking)
    fetch(`/switch-station?id=${stationId}`, { method: "POST" })
      .then((response) => response.json())
      .then((data) => console.log("🎵 Background server update:", data))
      .catch((err) => console.log("🎵 Background server update failed:", err));
  }

  fallbackToSimpleStreamSwitch(streamUrl, wasPlaying) {
    console.log("🎵 Using simple stream switch fallback");

    const audioPlayer = this.getAudioPlayer();
    if (!audioPlayer) {
      this.fallbackToPageReload();
      return;
    }

    // Simple approach: just set source and play if needed
    audioPlayer.src = streamUrl;

    // *** IMMEDIATE episode info update in fallback too ***
    this.forceEpisodeInfoUpdate();

    if (wasPlaying) {
      setTimeout(() => {
        const playPromise = audioPlayer.play();
        if (playPromise) {
          playPromise
            .then(() => {
              console.log("🎵 Fallback playback successful");
              if (
                this.globalRadioPlayer &&
                this.globalRadioPlayer.showNotification
              ) {
                this.globalRadioPlayer.showNotification(
                  "Station switched successfully!",
                  "success",
                );
              }
              // Another episode update after successful playback
              setTimeout(() => this.forceEpisodeInfoUpdate(), 500);
            })
            .catch((error) => {
              console.log("🎵 Fallback playback failed:", error);
              if (
                this.globalRadioPlayer &&
                this.globalRadioPlayer.showNotification
              ) {
                this.globalRadioPlayer.showNotification(
                  "Station switched! Click play to resume.",
                  "info",
                );
              }
            });
        }
      }, 1000);
    }

    // Quick follow-up episode check
    setTimeout(() => {
      if (
        this.globalRadioPlayer &&
        typeof this.globalRadioPlayer.checkForNewEpisode === "function"
      ) {
        console.log("🎵 Follow-up episode check");
        this.globalRadioPlayer.checkForNewEpisode();
      }
    }, 1500); // Much shorter than before
  }

  // Replace the checkForNewEpisode method in GlobalRadioPlayer with this fixed version:

  checkForNewEpisode(forceUpdate = false) {
    // CRITICAL: If we're in episode mode, don't check for station episodes
    if (this.episodePlayer && this.episodePlayer.isPlayingEpisode) {
      console.log("🎵 In episode mode, skipping station episode check");
      return;
    }

    // If no current station ID, we're in episode mode
    if (!this.currentStationId) {
      console.log(
        "🎵 No station ID set, likely in episode mode, skipping check",
      );
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);

    // Properly construct URL with station parameter
    const params = new URLSearchParams();
    params.append("station", this.currentStationId);

    if (forceUpdate) {
      params.append("force", Date.now().toString());
      params.append("cb", Math.random().toString());
    } else {
      params.append("t", Date.now().toString());
    }

    // Construct the URL properly
    const url = `/now-playing?${params.toString()}`;

    console.log(
      `🎵 Checking for new episode on station ${this.currentStationId}${forceUpdate ? " (FORCED)" : ""}: ${url}`,
    );

    fetch(url, {
      signal: controller.signal,
      cache: forceUpdate ? "no-store" : "no-cache",
      headers: forceUpdate
        ? {
            "Cache-Control": "no-cache, no-store, must-revalidate",
            Pragma: "no-cache",
            Expires: "0",
          }
        : {
            "Cache-Control": "no-cache",
          },
    })
      .then((response) => {
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => {
        console.log(
          "🎵 Episode data received for station",
          this.currentStationId,
          ":",
          {
            id: data.id,
            title: data.title?.substring(0, 50) + "...",
            show: data.show_name,
            currentId: this.currentEpisodeId,
            isNewEpisode: data.id !== this.currentEpisodeId,
            forceUpdate: forceUpdate,
            stationId: data.station_id,
            serverStationId: data.station_id,
            clientStationId: this.currentStationId,
            duration: data.duration,
            timePosition: data.time_position,
            serverTime: new Date().toISOString(),
            isExactlySameEpisode: data.id === this.currentEpisodeId,
          },
        );

        // Validate that the response is for the correct station
        if (data.station_id && data.station_id !== this.currentStationId) {
          console.warn(
            `🎵 Station mismatch! Expected ${this.currentStationId}, got ${data.station_id}. Ignoring response.`,
          );
          return;
        }

        const isNewEpisode = data.id && data.id !== this.currentEpisodeId;
        const shouldUpdate = forceUpdate || isNewEpisode;

        if (shouldUpdate) {
          if (isNewEpisode) {
            console.log(
              "🎵 New episode detected, handling transition:",
              data.title,
            );
            this.handleEpisodeTransition(data);
          } else if (forceUpdate) {
            console.log("🎵 Forced update - refreshing episode display");
            // For forced updates, also check if we need to transition based on time position
            if (data.time_position !== undefined && data.time_position < 5) {
              console.log(
                "🎵 Forced update shows episode restarted - likely new episode",
              );
              this.handleEpisodeTransition(data);
            } else {
              this.updateUIWithEpisodeData(data);
              this.updateMediaSessionMetadata(data);
            }
          }

          this.currentEpisodeId = data.id;
        }

        // Always update UI with latest data for forced updates
        if (forceUpdate) {
          this.updateUIWithEpisodeData(data);
        }
      })
      .catch((err) => {
        clearTimeout(timeoutId);
        if (err.name === "AbortError") {
          console.log("🎵 Episode check timed out (3s) - continuing anyway");
        } else {
          console.error("🎵 Error checking for new episode:", err);
        }
      });
  }

  // NEW METHOD: Handle the transition to a new episode
  // FIXED: Replace the handleEpisodeTransition method in GlobalRadioPlayer class

  handleEpisodeTransition(newEpisodeData) {
    console.log("🎵 Handling episode transition to:", newEpisodeData.title);

    if (!this.audioPlayer) {
      console.error("🎵 No audio player available for episode transition");
      return;
    }

    // CRITICAL FIX: Check if we should continue playing based on user intent, not audio state
    // If user didn't manually pause AND we should autoplay, continue playing
    const shouldContinuePlaying = this.shouldAutoplay && !this.userPaused;
    const currentVolume = this.audioPlayer.volume;
    const currentMuted = this.audioPlayer.muted;

    console.log(
      `🎵 Episode transition - should continue playing: ${shouldContinuePlaying}, shouldAutoplay: ${this.shouldAutoplay}, userPaused: ${this.userPaused}, audio paused: ${this.audioPlayer.paused}, audio ended: ${this.audioPlayer.ended}, isPlaying flag: ${this.isPlaying}, volume: ${currentVolume}`,
    );

    // Update UI immediately
    this.updateUIWithEpisodeData(newEpisodeData);
    this.updateMediaSessionMetadata(newEpisodeData);

    // Construct new stream URL for the station
    const streamParams = new URLSearchParams();
    streamParams.append("station", this.currentStationId);
    streamParams.append("t", Date.now().toString());
    const newStreamUrl = `/stream?${streamParams.toString()}`;

    console.log("🎵 Transitioning to new episode stream:", newStreamUrl);

    // Set up handlers for the new episode stream
    const onLoadedMetadata = () => {
      console.log("🎵 New episode stream loaded");
      this.audioPlayer.removeEventListener("loadedmetadata", onLoadedMetadata);
      this.audioPlayer.removeEventListener("error", onError);
      clearTimeout(transitionTimeout);

      // Update duration display with actual duration
      if (this.audioPlayer.duration && this.durationEl) {
        this.durationEl.textContent = this.formatTime(
          this.audioPlayer.duration,
        );
      }

      // Restore audio settings
      this.audioPlayer.volume = currentVolume;
      this.audioPlayer.muted = currentMuted;

      // Seek to server's current position for this episode
      const serverTimePosition = newEpisodeData.time_position || 0;
      if (serverTimePosition > 0 && this.audioPlayer.duration) {
        const seekPosition = Math.min(
          serverTimePosition,
          this.audioPlayer.duration - 1,
        );
        console.log(
          `🎵 Seeking to server position: ${seekPosition}s (duration: ${this.audioPlayer.duration}s)`,
        );
        this.audioPlayer.currentTime = seekPosition;
      } else {
        // Start from beginning for new episode
        this.audioPlayer.currentTime = 0;
      }

      // FIXED: Resume playback if the radio should continue playing
      if (shouldContinuePlaying) {
        console.log("🎵 Radio should continue playing, attempting autoplay...");

        // Strategy 1: Immediate play attempt
        const playPromise = this.audioPlayer.play();

        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              console.log("🎵 Successfully resumed playback on new episode");
              this.isPlaying = true; // Update our state
              this.showNotification(
                `Now playing: ${newEpisodeData.title}`,
                "success",
              );
            })
            .catch((error) => {
              console.log("🎵 Immediate autoplay failed:", error.message);

              // Strategy 2: Try again after a short delay
              setTimeout(() => {
                console.log("🎵 Attempting delayed autoplay...");
                const delayedPlayPromise = this.audioPlayer.play();

                if (delayedPlayPromise !== undefined) {
                  delayedPlayPromise
                    .then(() => {
                      console.log("🎵 Delayed autoplay successful");
                      this.isPlaying = true; // Update our state
                      this.showNotification(
                        `Now playing: ${newEpisodeData.title}`,
                        "success",
                      );
                    })
                    .catch((delayedError) => {
                      console.log(
                        "🎵 Delayed autoplay also failed:",
                        delayedError.message,
                      );

                      // Strategy 3: Update UI to show play state and notify user
                      this.updatePlayButtonState(false);
                      this.isPlaying = false;
                      this.showNotification(
                        `New episode ready: ${newEpisodeData.title} - Click play to continue`,
                        "info",
                      );
                    });
                }
              }, 500);
            });
        } else {
          // Fallback for very old browsers
          console.log("🎵 Play promise not supported, assuming success");
          this.isPlaying = true;
          this.showNotification(
            `Now playing: ${newEpisodeData.title}`,
            "success",
          );
        }
      } else {
        console.log("🎵 Radio was paused, not auto-resuming new episode");
        this.isPlaying = false;
        this.updatePlayButtonState(false);
        this.showNotification(`New episode: ${newEpisodeData.title}`, "info");
      }
    };

    const onError = (error) => {
      console.error("🎵 Error loading new episode stream:", error);
      this.audioPlayer.removeEventListener("loadedmetadata", onLoadedMetadata);
      this.audioPlayer.removeEventListener("error", onError);
      clearTimeout(transitionTimeout);

      this.showNotification(
        "Failed to load new episode. Please refresh if issues persist.",
        "error",
      );
    };

    // Set up timeout for transition
    const transitionTimeout = setTimeout(() => {
      console.log("🎵 Episode transition timeout");
      this.audioPlayer.removeEventListener("loadedmetadata", onLoadedMetadata);
      this.audioPlayer.removeEventListener("error", onError);

      // Force the UI update even if audio fails
      if (this.audioPlayer.duration && this.durationEl) {
        this.durationEl.textContent = this.formatTime(
          this.audioPlayer.duration,
        );
      }

      // If it should continue playing, try one more time
      if (shouldContinuePlaying) {
        console.log("🎵 Timeout reached, attempting final autoplay...");
        this.audioPlayer
          .play()
          .then(() => {
            this.isPlaying = true;
          })
          .catch(() => {
            this.updatePlayButtonState(false);
            this.isPlaying = false;
            this.showNotification(
              "Episode loaded - click play to continue",
              "info",
            );
          });
      }
    }, 8000);

    // Add event listeners
    this.audioPlayer.addEventListener("loadedmetadata", onLoadedMetadata, {
      once: true,
    });
    this.audioPlayer.addEventListener("error", onError, { once: true });

    // Switch to new episode stream
    this.audioPlayer.src = newStreamUrl;
    this.audioPlayer.load();
  }

  // NEW METHOD: Update play button state
  updatePlayButtonState(isPlaying) {
    this.isPlaying = isPlaying;
    if (this.playIcon) {
      if (isPlaying) {
        this.playIcon.classList.remove("fa-play");
        this.playIcon.classList.add("fa-pause");
      } else {
        this.playIcon.classList.remove("fa-pause");
        this.playIcon.classList.add("fa-play");
      }
    }
  }

  async returnToStationMode(stationId = "all") {
    console.log("🎵 Returning to station mode:", stationId);

    // Stop episode mode if active
    if (this.globalRadioPlayer && this.globalRadioPlayer.episodePlayer) {
      this.globalRadioPlayer.episodePlayer.stopEpisodeMode();
    }

    // Switch back to station
    await this.switchToStation(stationId);
  }

  // Add this method to your GlobalRadioPlayer class if it's missing:
  forceEpisodeUpdate() {
    console.log("🎵 Force updating episode information");

    // Clear current episode ID to force recognition as new
    const previousId = this.currentEpisodeId;
    this.currentEpisodeId = null;

    // Make immediate forced calls
    this.checkForNewEpisode(true);

    // Multiple rapid attempts
    setTimeout(() => {
      console.log("🎵 Force update - second attempt (250ms)");
      this.checkForNewEpisode(true);
    }, 250);

    setTimeout(() => {
      console.log("🎵 Force update - third attempt (750ms)");
      this.checkForNewEpisode(true);
    }, 750);

    setTimeout(() => {
      console.log("🎵 Force update - fourth attempt (1500ms)");
      this.checkForNewEpisode(true);
    }, 1500);

    // Restore ID after a moment in case all fetches fail
    setTimeout(() => {
      if (this.currentEpisodeId === null) {
        console.log("🎵 Restoring previous episode ID as fallback");
        this.currentEpisodeId = previousId;
      }
    }, 5000);
  }

  updateUIWithEpisodeData(data) {
    // Update global player bar
    if (this.episodeTitle && data.title) {
      this.episodeTitle.textContent = data.title;
    }

    if (this.showName && data.show_name) {
      this.showName.textContent = data.show_name;
    }

    if (this.episodeCover && data.image_path) {
      this.episodeCover.src = data.image_path;
      this.episodeCover.alt = `${data.show_name} Cover Art`;
    }

    // Update homepage elements if they exist
    const homeEpisodeTitle = document.getElementById("episode-title");
    const homeShowName = document.getElementById("show-name");
    const homeEpisodeCover = document.getElementById("episode-cover-art");
    const homeRandomFact = document.getElementById("random-fact");

    if (homeEpisodeTitle && data.title) {
      homeEpisodeTitle.textContent = data.title;
    }

    if (homeShowName && data.show_name) {
      homeShowName.textContent = data.show_name;
    }

    if (homeEpisodeCover && data.image_path) {
      homeEpisodeCover.src = data.image_path;
      homeEpisodeCover.alt = `${data.show_name} Cover Art`;
    }

    if (homeRandomFact && data.random_fact) {
      homeRandomFact.textContent = data.random_fact;
    }

    // Update page title
    if (data.title && data.show_name) {
      document.title = `${data.title} - ${data.show_name} | McElroy Radio`;
    }
  }

  updateMediaSessionMetadata(episodeData = null) {
    if ("mediaSession" in navigator) {
      const title =
        episodeData?.title || this.episodeTitle?.textContent || "McElroy Radio";
      const artist =
        episodeData?.show_name ||
        this.showName?.textContent ||
        "McElroy Family";
      const album = "McElroy Radio";
      const artwork =
        episodeData?.image_path ||
        this.episodeCover?.src ||
        "/static/img/default-cover.png";

      const absoluteArtwork = artwork.startsWith("http")
        ? artwork
        : window.location.origin + artwork;

      navigator.mediaSession.metadata = new MediaMetadata({
        title: title,
        artist: artist,
        album: album,
        artwork: [
          { src: absoluteArtwork, sizes: "96x96", type: "image/png" },
          { src: absoluteArtwork, sizes: "128x128", type: "image/png" },
          { src: absoluteArtwork, sizes: "192x192", type: "image/png" },
          { src: absoluteArtwork, sizes: "256x256", type: "image/png" },
          { src: absoluteArtwork, sizes: "384x384", type: "image/png" },
          { src: absoluteArtwork, sizes: "512x512", type: "image/png" },
        ],
      });
    }
  }

  updateMediaSessionPlaybackState(state) {
    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = state;
    }
  }

  updateMediaSessionPosition() {
    if ("mediaSession" in navigator && this.audioPlayer) {
      navigator.mediaSession.setPositionState({
        duration: this.audioPlayer.duration || 0,
        playbackRate: this.audioPlayer.playbackRate || 1,
        position: this.audioPlayer.currentTime || 0,
      });
    }
  }

  // Control methods
  togglePlay() {
    if (!this.audioPlayer || !this.isStreamReady) return;

    if (this.isPlaying) {
      // User manually pausing
      this.userPaused = true;
      this.shouldAutoplay = false;
      this.audioPlayer.pause();
      console.log("User paused playback");
    } else {
      // User manually starting
      this.userPaused = false;
      this.shouldAutoplay = true;

      if (this.isMuted) {
        this.showNotification("Click the volume button to unmute audio");
      }

      if (!this.audioPlayer.src || this.audioPlayer.readyState === 0) {
        this.initializeAudio();
        return;
      }

      const playPromise = this.audioPlayer.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            console.log("User started playback");
          })
          .catch((error) => {
            console.error("Play failed:", error);
            this.showNotification(
              "Playback failed. Please try refreshing the page.",
              "error",
            );
          });
      }
    }
  }

  rewind(seconds = 15) {
    if (this.audioPlayer && this.audioPlayer.currentTime > seconds) {
      this.audioPlayer.currentTime = Math.max(
        0,
        this.audioPlayer.currentTime - seconds,
      );
      console.log(`Rewound ${seconds} seconds`);
    }
  }

  toggleVolumeDisplay() {
    if (!this.volumeContainer) return;

    if (this.volumeContainer.classList.contains("show")) {
      this.volumeContainer.classList.remove("show");
    } else {
      this.volumeContainer.classList.add("show");
    }
  }

  toggleMute() {
    if (!this.audioPlayer) return;

    if (this.isMuted) {
      this.audioPlayer.volume = this.lastVolumeLevel;
      this.audioPlayer.muted = false;
      if (this.volumeIcon) {
        this.volumeIcon.classList.remove("fa-volume-mute");
        this.volumeIcon.classList.add("fa-volume-up");
      }
      if (this.volumeSlider) {
        this.volumeSlider.value = this.lastVolumeLevel * 100;
      }
      console.log("Unmuted");
    } else {
      this.lastVolumeLevel = this.audioPlayer.volume;
      this.audioPlayer.volume = 0;
      this.audioPlayer.muted = true;
      if (this.volumeIcon) {
        this.volumeIcon.classList.remove("fa-volume-up");
        this.volumeIcon.classList.add("fa-volume-mute");
      }
      if (this.volumeSlider) {
        this.volumeSlider.value = 0;
      }
      console.log("Muted");
    }
    this.isMuted = !this.isMuted;
  }

  setVolume() {
    if (!this.audioPlayer || !this.volumeSlider) return;

    const newVolume = this.volumeSlider.value / 100;
    this.audioPlayer.volume = newVolume;
    this.volumeLevel = newVolume;

    if (newVolume === 0) {
      if (!this.isMuted) {
        this.isMuted = true;
        if (this.volumeIcon) {
          this.volumeIcon.classList.remove("fa-volume-up");
          this.volumeIcon.classList.add("fa-volume-mute");
        }
        this.audioPlayer.muted = true;
      }
    } else {
      if (this.isMuted) {
        this.isMuted = false;
        if (this.volumeIcon) {
          this.volumeIcon.classList.remove("fa-volume-mute");
          this.volumeIcon.classList.add("fa-volume-up");
        }
        this.audioPlayer.muted = false;
      }
    }
  }

  seekToPosition(event) {
    if (!this.audioPlayer || !this.audioPlayer.duration) return;

    const rect = this.progressBar.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const width = rect.width;
    const percentage = clickX / width;
    const newTime = percentage * this.audioPlayer.duration;

    this.audioPlayer.currentTime = Math.max(
      0,
      Math.min(newTime, this.audioPlayer.duration),
    );
  }

  // Utility methods
  updateProgress() {
    if (!this.audioPlayer || !this.currentTimeEl) return;

    const currentTime = this.audioPlayer.currentTime;
    const duration = this.audioPlayer.duration;

    if (this.currentTimeEl) {
      this.currentTimeEl.textContent = this.formatTime(currentTime);
    }

    if (duration && this.progress && !isNaN(duration)) {
      const progressPercent = (currentTime / duration) * 100;
      this.progress.style.width = `${Math.min(progressPercent, 100)}%`;
    }
  }

  startProgressUpdates() {
    if (this.progressUpdateInterval) return;
    this.progressUpdateInterval = setInterval(() => {
      this.updateProgress();
    }, 1000);
  }

  stopProgressUpdates() {
    if (this.progressUpdateInterval) {
      clearInterval(this.progressUpdateInterval);
      this.progressUpdateInterval = null;
    }
  }

  formatTime(seconds) {
    if (isNaN(seconds) || !isFinite(seconds) || seconds < 0) {
      return "00:00";
    }

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
    } else {
      return `${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
    }
  }

  setControlsEnabled(enabled) {
    if (this.playBtn) this.playBtn.disabled = !enabled;
    if (this.rewindBtn) this.rewindBtn.disabled = !enabled;
    if (this.volumeBtn) this.volumeBtn.disabled = !enabled;
    if (this.volumeSlider) this.volumeSlider.disabled = !enabled;
  }

  showLoadingOverlay() {
    if (this.loadingOverlay) {
      this.loadingOverlay.classList.remove("hidden");
    }
  }

  hideLoadingOverlay() {
    if (this.loadingOverlay) {
      this.loadingOverlay.classList.add("hidden");
    }
  }

  updateLoadingStatus(status) {
    if (this.loadingStatus) {
      this.loadingStatus.textContent = status;
    }
  }

  setStreamReady(ready) {
    this.isStreamReady = ready;
    if (ready) {
      this.hideLoadingOverlay();
      this.setControlsEnabled(true);

      if (this.loadingTimeout) {
        clearTimeout(this.loadingTimeout);
        this.loadingTimeout = null;
      }
    }
  }

  // Add this method to your GlobalRadioPlayer class if it doesn't exist:

  showNotification(message, type = "info") {
    let notification = document.getElementById("global-radio-notification");
    if (!notification) {
      notification = document.createElement("div");
      notification.id = "global-radio-notification";
      document.body.appendChild(notification);
    }

    const bgColor =
      type === "error"
        ? "rgba(220, 53, 69, 0.9)"
        : type === "success"
          ? "rgba(40, 167, 69, 0.9)"
          : "rgba(94, 96, 206, 0.9)";

    notification.style.cssText = `
          position: fixed;
          top: 20px;
          right: 20px;
          padding: 12px 20px;
          background: ${bgColor};
          color: white;
          border-radius: 8px;
          z-index: 1001;
          box-shadow: 0 4px 15px rgba(0,0,0,0.2);
          font-family: inherit;
          font-size: 14px;
          max-width: 350px;
          line-height: 1.4;
          transform: translateX(100%);
          transition: transform 0.3s ease;
      `;

    notification.textContent = message;
    notification.style.display = "block";

    // Animate in
    setTimeout(() => {
      notification.style.transform = "translateX(0)";
    }, 100);

    // Hide after 5 seconds
    setTimeout(() => {
      notification.style.transform = "translateX(100%)";
      setTimeout(() => {
        notification.style.display = "none";
      }, 300);
    }, 5000);
  }

  cleanup() {
    if (this.episodeCheckInterval) clearInterval(this.episodeCheckInterval);
    if (this.progressUpdateInterval) clearInterval(this.progressUpdateInterval);
    if (this.loadingTimeout) clearTimeout(this.loadingTimeout);
    // Don't remove audio element - it should persist
  }
}

// McElroy Brothers Quotes for About Page
const mcElroyQuotes = [
  {
    text: "I live my life a quarter bit at a time.",
    author: "Justin McElroy, probably",
  },
  { text: "Unless...", author: "Griffin McElroy" },
  { text: "Play with me in this space.", author: "Travis McElroy" },
  {
    text: "Glass shark, glass shark. He love the fat kid.",
    author: "Justin McElroy",
  },
  { text: "Hachi machi!", author: "Justin McElroy" },
  {
    text: "It's familiar, but not too familiar, but not too not familiar.",
    author: "Griffin McElroy",
  },
  { text: "I think dogs should vote!", author: "Justin McElroy" },
  { text: "Shrimp! Heaven! Now!", author: "Griffin McElroy" },
  { text: "It's your birth right!", author: "Travis McElroy" },
  { text: "Squad goals: touch the Skyrim.", author: "Griffin McElroy" },
  {
    text: "Thirty. Under. Thirty. Media. Luminary.",
    author: "Griffin McElroy",
  },
  { text: "Can I pet that dog?", author: "All the McElroys, spiritually" },
  {
    text: "I'm not a regular brother, I'm a cool brother.",
    author: "Travis McElroy, adapting Mean Girls",
  },
  { text: "Riddle me piss, boys.", author: "Justin McElroy" },
  { text: "Don't do a hit!", author: "Griffin McElroy" },
  { text: "Kiss your dad square on the lips.", author: "Travis McElroy" },
  { text: "Munch Squad!", author: "Justin McElroy" },
  {
    text: "I'm your sweet baby brother, 30 under 30 media luminary Griffin McElroy.",
    author: "Griffin McElroy",
  },
  { text: "That's a very good dog.", author: "Travis McElroy" },
  { text: "Cool games for cool people.", author: "Griffin McElroy" },
];

function getRandomMcElroyQuote() {
  const randomIndex = Math.floor(Math.random() * mcElroyQuotes.length);
  return mcElroyQuotes[randomIndex];
}

function updateQuoteBox() {
  const quoteBox = document.querySelector(".quote-box blockquote");
  if (quoteBox) {
    const quote = getRandomMcElroyQuote();
    quoteBox.innerHTML = `"${quote.text}"<footer>— ${quote.author}</footer>`;
  }
}

// Global instance management
let globalRadioPlayer = null;

// FINALLY, update the initGlobalRadioPlayer function to ensure proper instance management:
function initGlobalRadioPlayer() {
  console.log("🎵 Initializing Global Radio Player");

  // If we already have a global instance, just rebind UI
  if (
    window.globalRadioPlayer &&
    window.globalRadioPlayer instanceof GlobalRadioPlayer
  ) {
    console.log("🎵 Found existing global player, reinitializing UI only");
    globalRadioPlayer = window.globalRadioPlayer;

    // Just rebind UI elements and sync state - don't recreate everything
    globalRadioPlayer.bindElements();
    globalRadioPlayer.setupEventListeners();
    globalRadioPlayer.syncUIWithAudioState();
    globalRadioPlayer.setStreamReady(true);

    // Rebind page-specific elements - this is where StationManager gets created
    globalRadioPlayer.bindPageSpecificElements();
    return;
  }

  // Create new instance only if none exists
  console.log("🎵 Creating new global player instance");
  globalRadioPlayer = new GlobalRadioPlayer();
  globalRadioPlayer.init();

  // CRITICAL: Store the instance globally so it persists across page navigation
  window.globalRadioPlayer = globalRadioPlayer;

  console.log("🎵 Global player instance stored:", {
    stored: !!window.globalRadioPlayer,
    type: window.globalRadioPlayer
      ? window.globalRadioPlayer.constructor.name
      : "none",
    hasAudio: !!(
      window.globalRadioPlayer && window.globalRadioPlayer.audioPlayer
    ),
    hasInitAudio: !!(
      window.globalRadioPlayer &&
      typeof window.globalRadioPlayer.initializeAudio === "function"
    ),
  });
}

// Legacy page-specific functionality
function getRandomFact() {
  const randomFactEl = document.getElementById("random-fact");
  if (!randomFactEl) return;

  fetch("/random-fact")
    .then((response) => response.json())
    .then((data) => {
      if (data.fact) {
        randomFactEl.style.opacity = "0";
        setTimeout(() => {
          randomFactEl.textContent = data.fact;
          randomFactEl.style.opacity = "1";
        }, 150);
      }
    })
    .catch((err) => console.error("Error getting random fact:", err));
}

function getRandomQuote() {
  const quotes = [
    { text: "Unless...", author: "Griffin McElroy" },
    {
      text: "I'm your dungeon master, your best friend, and your dungeon daddy, Griffin McElroy.",
      author: "Griffin McElroy",
    },
    { text: "Play with me in this space.", author: "Travis McElroy" },
    { text: "Hachi machi!", author: "Justin McElroy" },
    {
      text: "It's familiar, but not too familiar, but not too not familiar.",
      author: "Griffin McElroy",
    },
    { text: "I think dogs should vote!", author: "Justin McElroy" },
    { text: "Shrimp! Heaven! Now!", author: "Griffin McElroy" },
    { text: "It's your birth right!", author: "Travis McElroy" },
    { text: "Squad goals: touch the Skyrim.", author: "Griffin McElroy" },
  ];

  return quotes[Math.floor(Math.random() * quotes.length)];
}

function updateRadioQuote() {
  const radioQuote = document.getElementById("radio-quote");
  if (!radioQuote) return;

  const quote = getRandomQuote();
  radioQuote.innerHTML = `"${quote.text}"<footer>— ${quote.author}</footer>`;
}

class StationManager {
  constructor(globalRadioPlayer) {
    this.globalRadioPlayer = globalRadioPlayer;
    this.stations = [];

    if (this.globalRadioPlayer && this.globalRadioPlayer.currentStationId) {
      this.currentStationId = this.globalRadioPlayer.currentStationId;
      console.log(
        "🎵 StationManager using GlobalRadioPlayer's station:",
        this.currentStationId,
      );
    } else {
      // Only fall back to saved station if globalRadioPlayer doesn't have one
      this.currentStationId = this.getSavedStation() || "all";
      console.log(
        "🎵 StationManager falling back to saved station:",
        this.currentStationId,
      );

      // Update the GlobalRadioPlayer to match
      if (this.globalRadioPlayer) {
        this.globalRadioPlayer.currentStationId = this.currentStationId;
      }
    }

    this.stationsGrid = null;
    this.currentStationName = null;

    console.log("🎵 Station Manager created with player:", {
      hasPlayer: !!this.globalRadioPlayer,
      hasAudioPlayer: !!(
        this.globalRadioPlayer && this.globalRadioPlayer.audioPlayer
      ),
      playerType: this.globalRadioPlayer
        ? this.globalRadioPlayer.constructor.name
        : "none",
      savedStation: this.currentStationId,
      globalPlayerStation: this.globalRadioPlayer?.currentStationId,
    });
  }

  getSavedStation() {
    return localStorage.getItem("mcElroyRadioStation");
  }

  saveStation(stationId) {
    localStorage.setItem("mcElroyRadioStation", stationId);
  }

  async init() {
    console.log("🎵 Initializing Station Manager");

    this.stationsGrid = document.getElementById("stations-grid");
    this.currentStationName = document.getElementById("current-station-name");

    if (!this.stationsGrid) {
      console.log("🎵 Station grid not found, not on home page");
      return;
    }

    await this.loadStations();
    this.renderStations();
    this.startStationSync();
  }

  async loadStations() {
    try {
      console.log("🎵 Loading stations from server...");
      const response = await fetch("/stations");

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      this.stations = data.stations || [];
      // No server current station anymore - use client-side saved station

      console.log("🎵 Loaded stations:", this.stations);
      console.log(
        "🎵 Current station ID (client-side):",
        this.currentStationId,
      );
    } catch (error) {
      console.error("🎵 Error loading stations:", error);
      // Show fallback stations
      this.stations = [
        {
          id: "all",
          name: "All Shows",
          description: "Every McElroy podcast mixed together",
          type: "all",
          icon: "fa-radio",
          color: "#5e60ce",
          episode_count: 0,
        },
      ];
    }
  }

  renderStations() {
    if (!this.stationsGrid) {
      console.log("🎵 No stations grid found, skipping render");
      return;
    }

    console.log("🎵 Rendering", this.stations.length, "stations");

    this.stationsGrid.innerHTML = "";

    this.stations.forEach((station) => {
      console.log("🎵 Creating card for station:", station.name);
      const stationCard = this.createStationCard(station);
      this.stationsGrid.appendChild(stationCard);
    });

    this.updateCurrentStationDisplay();
  }

  createStationCard(station) {
    const template = document.getElementById("station-card-template");
    if (!template) {
      console.error("🎵 Station card template not found!");
      return document.createElement("div");
    }

    const card = template.content.cloneNode(true);

    const cardElement = card.querySelector(".station-card");
    cardElement.dataset.stationId = station.id;
    cardElement.dataset.stationType = station.type;

    // Set custom color if available
    if (station.color) {
      cardElement.style.setProperty("--station-color", station.color);
    }

    card.querySelector(".station-icon").className =
      `station-icon fas ${station.icon || "fa-radio"}`;
    card.querySelector(".station-name").textContent = station.name;
    card.querySelector(".station-description").textContent =
      station.description;
    card.querySelector(".episode-count").textContent =
      `${station.episode_count || 0} episodes`;
    card.querySelector(".station-type").textContent = station.type;

    const tuneBtn = card.querySelector(".tune-btn");
    tuneBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.switchToStation(station.id);
    });

    // Mark as active if current station
    if (station.id === this.currentStationId) {
      cardElement.classList.add("active");
      tuneBtn.innerHTML = '<i class="fas fa-volume-up"></i> Currently Playing';
      tuneBtn.disabled = true;
    }

    return card;
  }

  async switchToStation(stationId) {
    console.log("🎵 CLIENT-SIDE station switch to:", stationId);

    // Use the correct global player reference
    const realGlobalPlayer = window.globalRadioPlayer;
    if (realGlobalPlayer) {
      // CRITICAL: Stop episode mode when switching to station
      if (realGlobalPlayer.episodePlayer) {
        realGlobalPlayer.episodePlayer.stopEpisodeMode();
        console.log("🎵 Stopped episode mode for station switch");
      }

      realGlobalPlayer.currentStationId = stationId;
      console.log("🎵 Updated GlobalRadioPlayer station to:", stationId);

      // CRITICAL: Always restart episode checking when switching to station
      if (realGlobalPlayer.episodeCheckInterval) {
        clearInterval(realGlobalPlayer.episodeCheckInterval);
        realGlobalPlayer.episodeCheckInterval = null;
      }
      // Start episode checking for the new station
      realGlobalPlayer.startEpisodeChecking();
      console.log("🎵 Restarted episode checking for station:", stationId);

      // Show notification
      if (realGlobalPlayer.showNotification) {
        realGlobalPlayer.showNotification(
          `Tuning to ${this.getStationName(stationId)}...`,
          "info",
        );
      }
    }

    // Update client-side state immediately
    this.currentStationId = stationId;
    this.saveStation(stationId);
    this.renderStations(); // Re-render to update active state

    // Switch the audio stream to the new station
    await this.switchAudioToStation(stationId);

    // Update episode info for the new station
    await this.updateEpisodeInfoForStation(stationId);
  }

  async switchAudioToStation(stationId) {
    console.log("🎵 Switching audio stream to station:", stationId);

    const audioPlayer = this.getAudioPlayer();
    if (!audioPlayer) {
      console.error("🎵 No audio player found for station switch");
      if (this.globalRadioPlayer && this.globalRadioPlayer.showNotification) {
        this.globalRadioPlayer.showNotification(
          "Audio player not found. Please refresh the page.",
          "error",
        );
      }
      return;
    }

    // Store current state
    const wasPlaying = !audioPlayer.paused;
    const currentVolume = audioPlayer.volume;
    const currentMuted = audioPlayer.muted;

    try {
      // FIX 8: Properly construct position URL with station parameter
      const positionParams = new URLSearchParams();
      positionParams.append("station", stationId);
      positionParams.append("t", Date.now().toString());
      const positionUrl = `/stream-position?${positionParams.toString()}`;

      console.log("🎵 Getting station position from server:", positionUrl);
      const positionResponse = await fetch(positionUrl);
      if (!positionResponse.ok) {
        throw new Error(
          `Failed to get station position: ${positionResponse.status}`,
        );
      }

      const positionData = await positionResponse.json();
      const serverTimePosition = positionData.time_position || 0;
      console.log(
        `🎵 Station ${stationId} server position: ${serverTimePosition}s`,
      );

      // Stop current playback
      if (!audioPlayer.paused) {
        audioPlayer.pause();
      }

      // FIX 9: Create proper stream URL with station parameter
      const streamParams = new URLSearchParams();
      streamParams.append("station", stationId);
      streamParams.append("t", Date.now().toString());
      const streamUrl = `/stream?${streamParams.toString()}`;
      console.log("🎵 New station stream URL:", streamUrl);

      // Set up event handlers for the new stream
      const onLoadedMetadata = () => {
        console.log("🎵 New station stream metadata loaded");
        audioPlayer.removeEventListener("loadedmetadata", onLoadedMetadata);
        audioPlayer.removeEventListener("error", onError);
        clearTimeout(timeoutId);

        // CRITICAL: Seek to server's current position for this station
        if (serverTimePosition > 0 && audioPlayer.duration) {
          const seekPosition = Math.min(
            serverTimePosition,
            audioPlayer.duration - 1,
          );
          console.log(
            `🎵 Seeking to station position: ${seekPosition}s (duration: ${audioPlayer.duration}s)`,
          );
          audioPlayer.currentTime = seekPosition;
        }

        // Restore audio settings
        audioPlayer.volume = currentVolume;
        audioPlayer.muted = currentMuted;

        // Try to resume playback if it was playing
        if (wasPlaying) {
          audioPlayer
            .play()
            .then(() => {
              console.log(
                "🎵 Successfully resumed playback on new station at position",
                audioPlayer.currentTime,
              );
              if (
                this.globalRadioPlayer &&
                this.globalRadioPlayer.showNotification
              ) {
                this.globalRadioPlayer.showNotification(
                  `Now playing: ${this.getStationName(this.currentStationId)}`,
                  "success",
                );
              }
            })
            .catch((error) => {
              console.log("🎵 Could not auto-resume playback:", error);
              if (
                this.globalRadioPlayer &&
                this.globalRadioPlayer.showNotification
              ) {
                this.globalRadioPlayer.showNotification(
                  "Station switched! Click play to resume.",
                  "info",
                );
              }
            });
        } else {
          if (
            this.globalRadioPlayer &&
            this.globalRadioPlayer.showNotification
          ) {
            this.globalRadioPlayer.showNotification(
              `Tuned to: ${this.getStationName(this.currentStationId)}`,
              "success",
            );
          }
        }
      };

      const onError = (error) => {
        console.error("🎵 Error loading new station stream:", error);
        audioPlayer.removeEventListener("loadedmetadata", onLoadedMetadata);
        audioPlayer.removeEventListener("error", onError);
        clearTimeout(timeoutId);

        if (this.globalRadioPlayer && this.globalRadioPlayer.showNotification) {
          this.globalRadioPlayer.showNotification(
            "Failed to switch station. Please try again.",
            "error",
          );
        }
      };

      // Set up timeout
      const timeoutId = setTimeout(() => {
        console.log("🎵 Station switch timeout");
        audioPlayer.removeEventListener("loadedmetadata", onLoadedMetadata);
        audioPlayer.removeEventListener("error", onError);

        if (this.globalRadioPlayer && this.globalRadioPlayer.showNotification) {
          this.globalRadioPlayer.showNotification(
            "Station switch taking longer than expected...",
            "info",
          );
        }
      }, 10000);

      // Add event listeners
      audioPlayer.addEventListener("loadedmetadata", onLoadedMetadata, {
        once: true,
      });
      audioPlayer.addEventListener("error", onError, { once: true });

      // Switch to new stream
      audioPlayer.src = streamUrl;
      audioPlayer.load();
    } catch (error) {
      console.error("🎵 Exception during station switch:", error);
      if (this.globalRadioPlayer && this.globalRadioPlayer.showNotification) {
        this.globalRadioPlayer.showNotification(
          "Station switch failed: " + error.message,
          "error",
        );
      }
    }
  }

  async updateEpisodeInfoForStation(stationId) {
    console.log("🎵 Updating episode info for station:", stationId);

    try {
      // Properly construct URL with station parameter
      const params = new URLSearchParams();
      params.append("station", stationId);
      params.append("t", Date.now().toString());
      const url = `/now-playing?${params.toString()}`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      console.log("🎵 Episode data for station", stationId, ":", {
        id: data.id,
        title: data.title?.substring(0, 50) + "...",
        show: data.show_name,
        stationId: data.station_id,
      });

      // Validate station matches what we requested
      if (data.station_id && data.station_id !== stationId) {
        console.warn(
          `🎵 Episode info station mismatch! Requested ${stationId}, got ${data.station_id}`,
        );
        return; // Don't update with wrong station data
      }

      // Direct DOM updates
      const elements = [
        { id: "player-episode-title", value: data.title },
        { id: "player-show-name", value: data.show_name },
        { id: "episode-title", value: data.title },
        { id: "show-name", value: data.show_name },
        { id: "random-fact", value: data.random_fact },
      ];

      elements.forEach(({ id, value }) => {
        const el = document.getElementById(id);
        if (el && value) {
          el.textContent = value;
        }
      });

      // Update images
      const playerCover = document.getElementById("player-episode-cover");
      const homeCover = document.getElementById("episode-cover-art");
      if (playerCover && data.image_path) {
        playerCover.src = data.image_path;
      }
      if (homeCover && data.image_path) {
        homeCover.src = data.image_path;
      }

      // Update global player state
      if (this.globalRadioPlayer) {
        this.globalRadioPlayer.currentEpisodeId = data.id;
      }
    } catch (error) {
      console.error("🎵 Failed to update episode info:", error);
    }
  }

  getAudioPlayer() {
    // Method 1: Direct reference from globalRadioPlayer
    if (this.globalRadioPlayer && this.globalRadioPlayer.audioPlayer) {
      return this.globalRadioPlayer.audioPlayer;
    }

    // Method 2: Look for the persistent audio element by ID
    const persistentAudio = document.getElementById("persistent-global-audio");
    if (persistentAudio) {
      console.log("🎵 Found audio player via DOM ID");
      return persistentAudio;
    }

    // Method 3: Look for any audio element in the document
    const anyAudio = document.querySelector("audio");
    if (anyAudio) {
      console.log("🎵 Found audio player in document");
      return anyAudio;
    }

    console.error("🎵 No audio player found anywhere!");
    return null;
  }

  getStationName(stationId) {
    const station = this.stations.find((s) => s.id === stationId);
    return station ? station.name : "Unknown Station";
  }

  updateCurrentStationDisplay() {
    if (this.currentStationName) {
      this.currentStationName.textContent = this.getStationName(
        this.currentStationId,
      );
    }
  }

  startStationSync() {
    // Periodically refresh station list (but don't change current station)
    setInterval(async () => {
      await this.loadStations();
      this.updateCurrentStationDisplay();
    }, 60000); // Every minute
  }
}

// Update the bindPageSpecificElements method in GlobalRadioPlayer to include station manager
// Add this to the bindPageSpecificElements method:

// IN YOUR EXISTING bindPageSpecificElements method, ADD THIS:

// Station Manager initialization for home page
if (document.getElementById("stations-grid")) {
  console.log("🎵 Home page detected, initializing station manager");
  if (!this.stationManager) {
    this.stationManager = new StationManager(this);
  }
  this.stationManager.init();
} else {
  console.log("🎵 Not on home page, skipping station manager");
}

// Theme Management System
class ThemeManager {
  constructor() {
    this.currentTheme = this.getSavedTheme() || this.getSystemTheme();
    this.konamiCode = [
      "ArrowUp",
      "ArrowUp",
      "ArrowDown",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "ArrowLeft",
      "ArrowRight",
      "KeyB",
      "KeyA",
    ];
    this.konamiProgress = [];
    this.hotdogMode = false;
    this.hotdogInterval = null;

    this.init();
  }

  init() {
    this.createThemeSelector();
    this.applyTheme(this.currentTheme);
    this.setupEventListeners();
    this.setupMobileNavigation();
    this.setupKonamiCode();
    this.updateDisplay();
  }

  getSavedTheme() {
    return localStorage.getItem("mcElroyRadioTheme");
  }

  getSystemTheme() {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }

  saveTheme(theme) {
    localStorage.setItem("mcElroyRadioTheme", theme);
  }

  applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    this.currentTheme = theme;
    this.saveTheme(theme);
    this.updateDisplay();

    if (theme === "hotdog") {
      this.activateHotdogMode();
    } else {
      this.deactivateHotdogMode();
    }

    window.dispatchEvent(
      new CustomEvent("themeChanged", { detail: { theme } }),
    );
  }

  updateDisplay() {
    const themeDisplay = document.getElementById("theme-display");
    const currentThemeSpan = document.getElementById("current-theme");
    const themeName = this.getThemeName(this.currentTheme);

    if (themeDisplay) themeDisplay.textContent = themeName;
    if (currentThemeSpan) currentThemeSpan.textContent = themeName;

    // Update desktop theme options
    document.querySelectorAll(".theme-option").forEach((option) => {
      option.classList.toggle(
        "active",
        option.dataset.theme === this.currentTheme,
      );
    });

    // Update mobile theme options (only if they exist)
    if (window.innerWidth <= 768) {
      document.querySelectorAll(".mobile-theme-option").forEach((option) => {
        option.classList.toggle(
          "active",
          option.dataset.theme === this.currentTheme,
        );
      });
    }
  }

  getThemeName(theme) {
    const names = {
      light: "Light",
      dark: "Dark",
      synthwave: "Synthwave",
      forest: "Forest",
      ocean: "Ocean",
      hotdog: "🌭 HOT DOG STAND 🌭",
    };
    return names[theme] || "Unknown";
  }

  createThemeSelector() {
    if (document.querySelector(".theme-selector")) return;

    const nav = document.querySelector("nav");
    if (!nav) return;

    // Create desktop theme selector
    const desktopThemeSelectorHTML = `
      <div class="theme-selector">
          <button class="theme-button" id="theme-toggle">
              <i class="fas fa-palette"></i>
              <span id="current-theme">Light</span>
          </button>
          <div class="theme-dropdown" id="theme-dropdown">
              <div class="theme-option" data-theme="light">
                  <span>Light</span>
                  <div class="theme-preview">
                      <div class="theme-preview-color" style="background: #5e60ce;"></div>
                      <div class="theme-preview-color" style="background: #64dfdf;"></div>
                      <div class="theme-preview-color" style="background: #ff7c7c;"></div>
                  </div>
              </div>
              <div class="theme-option" data-theme="dark">
                  <span>Dark</span>
                  <div class="theme-preview">
                      <div class="theme-preview-color" style="background: #7c3aed;"></div>
                      <div class="theme-preview-color" style="background: #06b6d4;"></div>
                      <div class="theme-preview-color" style="background: #f59e0b;"></div>
                  </div>
              </div>
              <div class="theme-option" data-theme="synthwave">
                  <span>Synthwave</span>
                  <div class="theme-preview">
                      <div class="theme-preview-color" style="background: #ff0080;"></div>
                      <div class="theme-preview-color" style="background: #00ffff;"></div>
                      <div class="theme-preview-color" style="background: #ffff00;"></div>
                  </div>
              </div>
              <div class="theme-option" data-theme="forest">
                  <span>Forest</span>
                  <div class="theme-preview">
                      <div class="theme-preview-color" style="background: #16a085;"></div>
                      <div class="theme-preview-color" style="background: #27ae60;"></div>
                      <div class="theme-preview-color" style="background: #f39c12;"></div>
                  </div>
              </div>
              <div class="theme-option" data-theme="ocean">
                  <span>Ocean</span>
                  <div class="theme-preview">
                      <div class="theme-preview-color" style="background: #3498db;"></div>
                      <div class="theme-preview-color" style="background: #2980b9;"></div>
                      <div class="theme-preview-color" style="background: #1abc9c;"></div>
                  </div>
              </div>
          </div>
      </div>
    `;

    // Create mobile theme selector for header
    const mobileHeaderThemeHTML = `
      <div class="theme-selector">
          <button class="theme-button" id="mobile-theme-toggle">
              <i class="fas fa-palette"></i>
          </button>
      </div>
    `;

    // Insert desktop version into nav ul area
    nav
      .querySelector("ul")
      .insertAdjacentHTML("afterend", desktopThemeSelectorHTML);

    // Insert mobile version into mobile header actions
    const mobileActions = nav.querySelector(".mobile-header-actions");
    if (mobileActions) {
      mobileActions.insertAdjacentHTML("afterbegin", mobileHeaderThemeHTML);
    }

    this.createMobileThemeGrid();
  }

  createMobileThemeGrid() {
    const mobileThemeGrid = document.getElementById("mobile-theme-grid");
    if (!mobileThemeGrid) return;

    const themes = [
      {
        id: "light",
        name: "Light",
        colors: ["#5e60ce", "#64dfdf", "#ff7c7c"],
      },
      {
        id: "dark",
        name: "Dark",
        colors: ["#7c3aed", "#06b6d4", "#f59e0b"],
      },
      {
        id: "synthwave",
        name: "Synthwave",
        colors: ["#ff0080", "#00ffff", "#ffff00"],
      },
      {
        id: "forest",
        name: "Forest",
        colors: ["#16a085", "#27ae60", "#f39c12"],
      },
      {
        id: "ocean",
        name: "Ocean",
        colors: ["#3498db", "#2980b9", "#1abc9c"],
      },
    ];

    themes.forEach((theme) => {
      const themeOption = document.createElement("div");
      themeOption.className = "mobile-theme-option";
      themeOption.dataset.theme = theme.id;

      themeOption.innerHTML = `
        <div class="theme-preview">
          ${theme.colors
            .map(
              (color) =>
                `<div class="theme-preview-color" style="background: ${color};"></div>`,
            )
            .join("")}
        </div>
        <div class="mobile-theme-name">${theme.name}</div>
      `;

      themeOption.addEventListener("click", () => {
        this.applyTheme(theme.id);
        this.closeMobileMenu();
      });

      mobileThemeGrid.appendChild(themeOption);
    });
  }

  setupMobileNavigation() {
    const mobileMenuToggle = document.getElementById("mobile-menu-toggle");
    const mobileNavOverlay = document.getElementById("mobile-nav-overlay");
    const mobileNavClose = document.getElementById("mobile-nav-close");
    const mobileThemeToggle = document.getElementById("mobile-theme-toggle");

    if (mobileMenuToggle) {
      mobileMenuToggle.addEventListener("click", () => {
        this.openMobileMenu();
      });
    }

    if (mobileNavClose) {
      mobileNavClose.addEventListener("click", () => {
        this.closeMobileMenu();
      });
    }

    if (mobileNavOverlay) {
      mobileNavOverlay.addEventListener("click", (e) => {
        if (e.target === mobileNavOverlay) {
          this.closeMobileMenu();
        }
      });
    }

    if (mobileThemeToggle) {
      mobileThemeToggle.addEventListener("click", () => {
        this.openMobileMenu();
      });
    }

    // Handle escape key for mobile menu
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.closeMobileMenu();
      }
    });

    // Update mobile nav active states based on current page
    this.updateMobileNavActiveStates();
  }

  openMobileMenu() {
    const mobileNavOverlay = document.getElementById("mobile-nav-overlay");
    if (mobileNavOverlay) {
      mobileNavOverlay.classList.add("active");
      document.body.style.overflow = "hidden"; // Prevent background scrolling
    }
  }

  closeMobileMenu() {
    const mobileNavOverlay = document.getElementById("mobile-nav-overlay");
    if (mobileNavOverlay) {
      mobileNavOverlay.classList.remove("active");
      document.body.style.overflow = ""; // Restore scrolling
    }
  }

  updateMobileNavActiveStates() {
    const currentPath = window.location.pathname;
    const mobileNavLinks = document.querySelectorAll(".mobile-nav-link");

    mobileNavLinks.forEach((link) => {
      const href = new URL(link.href).pathname;
      if (href === currentPath) {
        link.classList.add("active");
      } else {
        link.classList.remove("active");
      }
    });
  }

  setupEventListeners() {
    setTimeout(() => {
      const themeToggle = document.getElementById("theme-toggle");
      const themeDropdown = document.getElementById("theme-dropdown");

      if (themeToggle) {
        themeToggle.addEventListener("click", (e) => {
          e.stopPropagation();
          themeDropdown.classList.toggle("show");
        });
      }

      document.addEventListener("click", () => {
        if (themeDropdown) {
          themeDropdown.classList.remove("show");
        }
      });

      if (themeDropdown) {
        themeDropdown.addEventListener("click", (e) => {
          e.stopPropagation();
        });
      }

      document.querySelectorAll(".theme-option").forEach((option) => {
        option.addEventListener("click", () => {
          const theme = option.dataset.theme;
          this.applyTheme(theme);
          themeDropdown.classList.remove("show");
        });
      });

      this.updateDisplay();
    }, 100);

    window
      .matchMedia("(prefers-color-scheme: dark)")
      .addEventListener("change", (e) => {
        if (!this.getSavedTheme()) {
          const newTheme = e.matches ? "dark" : "light";
          this.applyTheme(newTheme);
        }
      });
  }

  setupKonamiCode() {
    document.addEventListener("keydown", (e) => {
      this.konamiProgress.push(e.code);

      if (this.konamiProgress.length > this.konamiCode.length) {
        this.konamiProgress.shift();
      }

      if (this.konamiProgress.length === this.konamiCode.length) {
        const matches = this.konamiProgress.every(
          (key, index) => key === this.konamiCode[index],
        );

        if (matches) {
          this.triggerHotdogMode();
          this.konamiProgress = [];
        }
      }
    });
  }

  triggerHotdogMode() {
    this.playHotdogSound();
    this.showHotdogNotification();
    this.applyTheme("hotdog");
    this.addHotdogThemeOption();
  }

  playHotdogSound() {
    try {
      const audioContext = new (window.AudioContext ||
        window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
      oscillator.frequency.setValueAtTime(1000, audioContext.currentTime + 0.1);
      oscillator.frequency.setValueAtTime(1200, audioContext.currentTime + 0.2);

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(
        0.01,
        audioContext.currentTime + 0.3,
      );

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (e) {
      console.log("Audio not available, but hot dog mode activated!");
    }
  }

  showHotdogNotification() {
    const notification = document.createElement("div");
    notification.innerHTML = `
      <div style="
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: linear-gradient(45deg, #ff0000, #ffff00, #ff0000);
          color: #000;
          padding: 30px;
          border-radius: 15px;
          box-shadow: 0 0 30px rgba(255, 0, 0, 0.8);
          z-index: 10000;
          text-align: center;
          font-size: 2rem;
          font-weight: bold;
          border: 5px solid #ff0000;
          animation: hotdog-entrance 2s ease-out;
      ">
          🌭 HOT DOG STAND MODE ACTIVATED! 🌭<br>
          <div style="font-size: 1rem; margin-top: 10px;">
              Welcome to the most beautiful theme ever created!
          </div>
      </div>
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 3000);

    const style = document.createElement("style");
    style.textContent = `
      @keyframes hotdog-entrance {
          0% {
              transform: translate(-50%, -50%) scale(0) rotate(720deg);
              opacity: 0;
          }
          50% {
              transform: translate(-50%, -50%) scale(1.2) rotate(360deg);
          }
          100% {
              transform: translate(-50%, -50%) scale(1) rotate(0deg);
              opacity: 1;
          }
      }
    `;
    document.head.appendChild(style);
  }

  addHotdogThemeOption() {
    const themeDropdown = document.getElementById("theme-dropdown");
    if (
      themeDropdown &&
      !themeDropdown.querySelector('[data-theme="hotdog"]')
    ) {
      const hotdogOption = document.createElement("div");
      hotdogOption.className = "theme-option";
      hotdogOption.dataset.theme = "hotdog";
      hotdogOption.innerHTML = `
        <span>🌭 Hot Dog Stand</span>
        <div class="theme-preview">
            <div class="theme-preview-color" style="background: #ff0000;"></div>
            <div class="theme-preview-color" style="background: #ffff00;"></div>
            <div class="theme-preview-color" style="background: #ff8000;"></div>
        </div>
      `;

      hotdogOption.addEventListener("click", () => {
        this.applyTheme("hotdog");
        themeDropdown.classList.remove("show");
      });

      themeDropdown.appendChild(hotdogOption);
    }

    // Only add to mobile theme grid if on mobile and it exists
    if (window.innerWidth <= 768) {
      const mobileThemeGrid = document.getElementById("mobile-theme-grid");
      if (
        mobileThemeGrid &&
        !mobileThemeGrid.querySelector('[data-theme="hotdog"]')
      ) {
        const mobileHotdogOption = document.createElement("div");
        mobileHotdogOption.className = "mobile-theme-option";
        mobileHotdogOption.dataset.theme = "hotdog";

        mobileHotdogOption.innerHTML = `
          <div class="theme-preview">
            <div class="theme-preview-color" style="background: #ff0000;"></div>
            <div class="theme-preview-color" style="background: #ffff00;"></div>
            <div class="theme-preview-color" style="background: #ff8000;"></div>
          </div>
          <div class="mobile-theme-name">🌭 Hot Dog</div>
        `;

        mobileHotdogOption.addEventListener("click", () => {
          this.applyTheme("hotdog");
          this.closeMobileMenu();
        });

        mobileThemeGrid.appendChild(mobileHotdogOption);
      }
    }
  }

  activateHotdogMode() {
    if (this.hotdogMode) return;
    this.hotdogMode = true;
    this.startFloatingHotdogs();
    this.addScreenShake();
  }

  deactivateHotdogMode() {
    if (!this.hotdogMode) return;
    this.hotdogMode = false;

    if (this.hotdogInterval) {
      clearInterval(this.hotdogInterval);
      this.hotdogInterval = null;
    }

    document.querySelectorAll(".floating-hotdog").forEach((hotdog) => {
      hotdog.remove();
    });

    const shakeStyle = document.getElementById("hotdog-shake");
    if (shakeStyle) {
      shakeStyle.remove();
    }
  }

  startFloatingHotdogs() {
    this.hotdogInterval = setInterval(() => {
      this.createFloatingHotdog();
    }, 500);
  }

  createFloatingHotdog() {
    const hotdog = document.createElement("div");
    hotdog.className = "floating-hotdog";
    hotdog.textContent = ["🌭", "🌮", "🍕", "🍔", "🌯", "🥪", "🥙"][
      Math.floor(Math.random() * 7)
    ];
    hotdog.style.top = Math.random() * window.innerHeight + "px";

    document.body.appendChild(hotdog);

    setTimeout(() => {
      if (hotdog.parentNode) {
        hotdog.parentNode.removeChild(hotdog);
      }
    }, 3000);
  }

  addScreenShake() {
    const style = document.createElement("style");
    style.id = "hotdog-shake";
    style.textContent = `
      @keyframes screen-shake {
          0%, 100% { transform: translateX(0); }
          10% { transform: translateX(-2px); }
          20% { transform: translateX(2px); }
          30% { transform: translateX(-2px); }
          40% { transform: translateX(2px); }
          50% { transform: translateX(-2px); }
          60% { transform: translateX(2px); }
          70% { transform: translateX(-2px); }
          80% { transform: translateX(2px); }
          90% { transform: translateX(-2px); }
      }

      [data-theme="hotdog"] body {
          animation: screen-shake 0.1s infinite;
      }
    `;
    document.head.appendChild(style);
  }
}

// Initialize theme system
function initThemeSystem() {
  console.log("🎨 Initializing theme system...");
  window.themeManager = new ThemeManager();
}

// Export functions
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    GlobalRadioPlayer,
    ThemeManager,
    initGlobalRadioPlayer,
    initThemeSystem,
  };
} else {
  window.initGlobalRadioPlayer = initGlobalRadioPlayer;
  window.initThemeSystem = initThemeSystem;
  window.GlobalRadioPlayer = GlobalRadioPlayer;
  window.ThemeManager = ThemeManager;
}

// Initialize page-specific functionality on load
document.addEventListener("DOMContentLoaded", function () {
  // Initialize quote box on about page
  if (
    window.location.pathname === "/about" ||
    window.location.pathname.includes("/about")
  ) {
    updateQuoteBox();
    // Auto-rotate quotes every 15 seconds
    setInterval(updateQuoteBox, 15000);
  }
});

// Episode Player Manager - handles individual episode playback
class EpisodePlayer {
  constructor(globalRadioPlayer) {
    this.globalRadioPlayer = globalRadioPlayer;
    this.currentEpisodeId = null;
    this.isPlayingEpisode = false;
    this.currentEpisodeData = null; // Store the episode data

    console.log("🎵 Episode Player initialized");
  }

  async playEpisode(episodeId, episodeTitle, showName, imagePath, duration) {
    console.log("🎵 Playing specific episode:", episodeTitle);

    if (!this.globalRadioPlayer || !this.globalRadioPlayer.audioPlayer) {
      console.error("🎵 No global audio player available");
      return;
    }

    // CRITICAL: Stop station episode checking when switching to episode mode
    this.stopStationMode();

    const audioPlayer = this.globalRadioPlayer.audioPlayer;
    const wasPlaying = !audioPlayer.paused;

    try {
      // Stop current playback
      if (!audioPlayer.paused) {
        audioPlayer.pause();
      }

      // Show loading state
      if (this.globalRadioPlayer.showLoadingOverlay) {
        this.globalRadioPlayer.showLoadingOverlay();
        this.globalRadioPlayer.updateLoadingStatus("Loading episode...");
      }

      // Store episode data for later reference
      this.currentEpisodeData = {
        id: episodeId,
        title: episodeTitle,
        show_name: showName,
        image_path: imagePath,
        duration: duration,
        is_playing: true,
        current_position: 0,
        time_position: 0,
      };

      // Construct episode stream URL
      const streamUrl = `/stream-episode?id=${encodeURIComponent(episodeId)}&t=${Date.now()}`;
      console.log("🎵 Episode stream URL:", streamUrl);

      // Set up event handlers for the episode
      const onLoadedMetadata = () => {
        console.log("🎵 Episode metadata loaded");
        audioPlayer.removeEventListener("loadedmetadata", onLoadedMetadata);
        audioPlayer.removeEventListener("error", onError);
        clearTimeout(timeoutId);

        // Update UI immediately with episode info
        this.updateUIWithEpisodeInfo(
          episodeId,
          episodeTitle,
          showName,
          imagePath,
          duration,
        );

        // Hide loading overlay
        if (this.globalRadioPlayer.setStreamReady) {
          this.globalRadioPlayer.setStreamReady(true);
        }

        // Try to start playback
        audioPlayer
          .play()
          .then(() => {
            console.log("🎵 Episode playback started successfully");
            this.isPlayingEpisode = true;
            this.currentEpisodeId = episodeId;

            // Start episode progress tracking
            this.startEpisodeProgressTracking();

            if (this.globalRadioPlayer.showNotification) {
              this.globalRadioPlayer.showNotification(
                `Now playing: ${episodeTitle}`,
                "success",
              );
            }
          })
          .catch((error) => {
            console.log("🎵 Episode autoplay prevented:", error);
            this.isPlayingEpisode = false;

            if (this.globalRadioPlayer.showNotification) {
              this.globalRadioPlayer.showNotification(
                "Episode loaded! Click play to start listening.",
                "info",
              );
            }
          });
      };

      const onError = (error) => {
        console.error("🎵 Error loading episode:", error);
        audioPlayer.removeEventListener("loadedmetadata", onLoadedMetadata);
        audioPlayer.removeEventListener("error", onError);
        clearTimeout(timeoutId);

        if (this.globalRadioPlayer.hideLoadingOverlay) {
          this.globalRadioPlayer.hideLoadingOverlay();
        }

        if (this.globalRadioPlayer.showNotification) {
          this.globalRadioPlayer.showNotification(
            "Failed to load episode. Please try again.",
            "error",
          );
        }
      };

      // Set timeout for loading
      const timeoutId = setTimeout(() => {
        console.log("🎵 Episode loading timeout");
        audioPlayer.removeEventListener("loadedmetadata", onLoadedMetadata);
        audioPlayer.removeEventListener("error", onError);

        if (this.globalRadioPlayer.showNotification) {
          this.globalRadioPlayer.showNotification(
            "Episode loading is taking longer than expected...",
            "info",
          );
        }
      }, 10000);

      // Add event listeners
      audioPlayer.addEventListener("loadedmetadata", onLoadedMetadata, {
        once: true,
      });
      audioPlayer.addEventListener("error", onError, { once: true });

      // Set the episode stream URL
      audioPlayer.src = streamUrl;
      audioPlayer.load();

      // Mark that we're now in episode mode (not station mode)
      this.globalRadioPlayer.currentStationId = null;
      this.currentEpisodeId = episodeId;
    } catch (error) {
      console.error("🎵 Exception during episode playback:", error);
      if (this.globalRadioPlayer.showNotification) {
        this.globalRadioPlayer.showNotification(
          "Failed to play episode: " + error.message,
          "error",
        );
      }
    }
  }

  stopStationMode() {
    console.log("🎵 Stopping station mode to enter episode mode");

    // Clear station checking interval
    if (this.globalRadioPlayer.episodeCheckInterval) {
      clearInterval(this.globalRadioPlayer.episodeCheckInterval);
      this.globalRadioPlayer.episodeCheckInterval = null;
      console.log("🎵 Stopped station episode checking");
    }

    // Clear station ID
    this.globalRadioPlayer.currentStationId = null;
  }

  startEpisodeProgressTracking() {
    // Clear any existing tracking
    if (this.episodeProgressInterval) {
      clearInterval(this.episodeProgressInterval);
    }

    // Track episode progress
    this.episodeProgressInterval = setInterval(() => {
      if (this.globalRadioPlayer.audioPlayer && this.currentEpisodeData) {
        const currentTime = this.globalRadioPlayer.audioPlayer.currentTime;
        this.currentEpisodeData.time_position = currentTime;
        this.currentEpisodeData.current_position = Math.floor(
          currentTime * 16000,
        ); // Rough byte estimate
        this.currentEpisodeData.is_playing =
          !this.globalRadioPlayer.audioPlayer.paused;
      }
    }, 1000);
  }

  updateUIWithEpisodeInfo(
    episodeId,
    episodeTitle,
    showName,
    imagePath,
    duration,
  ) {
    console.log("🎵 Updating UI with episode info:", episodeTitle);

    // Update global player bar
    const playerTitle = document.getElementById("player-episode-title");
    const playerShowName = document.getElementById("player-show-name");
    const playerCover = document.getElementById("player-episode-cover");
    const playerDuration = document.getElementById("player-duration");

    if (playerTitle) playerTitle.textContent = episodeTitle;
    if (playerShowName) playerShowName.textContent = showName;
    if (playerCover && imagePath) {
      playerCover.src = imagePath;
      playerCover.alt = `${showName} Cover Art`;
    }
    if (playerDuration && duration) {
      playerDuration.textContent = this.formatTime(duration);
    }

    // Update homepage elements if they exist
    const homeTitle = document.getElementById("episode-title");
    const homeShowName = document.getElementById("show-name");
    const homeCover = document.getElementById("episode-cover-art");

    if (homeTitle) homeTitle.textContent = episodeTitle;
    if (homeShowName) homeShowName.textContent = showName;
    if (homeCover && imagePath) {
      homeCover.src = imagePath;
      homeCover.alt = `${showName} Cover Art`;
    }

    // Update page title
    document.title = `${episodeTitle} - ${showName} | McElroy Radio`;

    // Update media session if available
    if (this.globalRadioPlayer.updateMediaSessionMetadata) {
      this.globalRadioPlayer.updateMediaSessionMetadata({
        title: episodeTitle,
        show_name: showName,
        image_path: imagePath,
      });
    }
  }

  formatTime(seconds) {
    if (isNaN(seconds) || !isFinite(seconds) || seconds < 0) {
      return "00:00";
    }

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
    } else {
      return `${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
    }
  }

  isCurrentlyPlayingEpisode(episodeId) {
    return this.isPlayingEpisode && this.currentEpisodeId === episodeId;
  }

  getCurrentEpisodeData() {
    return this.currentEpisodeData;
  }

  stopEpisodeMode() {
    console.log("🎵 Stopping episode mode");
    this.isPlayingEpisode = false;
    this.currentEpisodeId = null;
    this.currentEpisodeData = null;

    if (this.episodeProgressInterval) {
      clearInterval(this.episodeProgressInterval);
      this.episodeProgressInterval = null;
    }
  }
}

// Add this to the GlobalRadioPlayer.bindPageSpecificElements method:
function bindDirectoryPlayButtons() {
  // Remove existing episode player if it exists
  if (window.globalRadioPlayer && !window.globalRadioPlayer.episodePlayer) {
    window.globalRadioPlayer.episodePlayer = new EpisodePlayer(
      window.globalRadioPlayer,
    );
  }

  // Bind play buttons in directory
  document.querySelectorAll(".btn-play").forEach((button) => {
    button.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      const episodeId = button.dataset.episodeId;
      const episodeTitle = button.dataset.episodeTitle;
      const showName = button.dataset.showName;
      const imagePath = button.dataset.episodeImage;
      const duration = parseFloat(button.dataset.episodeDuration);

      if (window.globalRadioPlayer && window.globalRadioPlayer.episodePlayer) {
        window.globalRadioPlayer.episodePlayer.playEpisode(
          episodeId,
          episodeTitle,
          showName,
          imagePath,
          duration,
        );
      }
    });
  });

  console.log(
    "🎵 Bound",
    document.querySelectorAll(".btn-play").length,
    "episode play buttons",
  );
}

// Analytics Chart Manager
class AnalyticsManager {
  constructor() {
    this.chart = null;
    this.refreshInterval = null;
    this.isInitialized = false;
  }

  init() {
    if (this.isInitialized) {
      console.log("📊 Analytics already initialized, cleaning up first");
      this.cleanup();
    }

    console.log("📊 Initializing Analytics Manager");

    // Check if we're actually on the analytics page
    if (!this.isOnAnalyticsPage()) {
      console.log("📊 Not on analytics page, skipping initialization");
      return;
    }

    this.setupChart();
    this.loadSummaryData();
    this.loadRecentVisits();
    this.setupControls();
    this.startAutoRefresh();
    this.isInitialized = true;

    console.log("📊 Analytics Manager initialized successfully");
  }

  isOnAnalyticsPage() {
    const isAnalyticsURL = window.location.pathname.includes("/analytics");
    const hasAnalyticsElements = !!(
      document.getElementById("timeseries-chart") ||
      document.querySelector(".analytics-container") ||
      document.querySelector(".analytics-header") ||
      document.querySelector(".chart-container")
    );

    console.log("📊 Analytics page check:", {
      url: window.location.pathname,
      isAnalyticsURL,
      hasAnalyticsElements,
      result: isAnalyticsURL && (hasAnalyticsElements || isAnalyticsURL),
    });

    // If URL indicates analytics page, proceed even if elements aren't found yet
    return isAnalyticsURL;
  }

  setupChart() {
    const canvas = document.getElementById("timeseries-chart");
    if (!canvas) {
      console.warn("📊 Chart canvas not found");
      return;
    }

    // Destroy existing chart if it exists
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }

    // Check if Chart.js is loaded
    if (typeof Chart === "undefined") {
      console.log("📊 Loading Chart.js...");
      this.loadChartJS().then(() => {
        this.createChart(canvas);
      });
    } else {
      this.createChart(canvas);
    }
  }

  loadChartJS() {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src =
        "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.9.1/chart.min.js";
      script.onload = () => {
        console.log("📊 Chart.js loaded successfully");
        resolve();
      };
      script.onerror = () => {
        console.error("📊 Failed to load Chart.js");
        reject();
      };
      document.head.appendChild(script);
    });
  }

  createChart(canvas) {
    console.log("📊 Creating time series chart");

    const ctx = canvas.getContext("2d");

    this.chart = new Chart(ctx, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "Visits",
            data: [],
            borderColor: "rgba(94, 96, 206, 1)",
            backgroundColor: "rgba(94, 96, 206, 0.1)",
            borderWidth: 2,
            fill: true,
            tension: 0.3,
            pointBackgroundColor: "rgba(94, 96, 206, 1)",
            pointBorderColor: "rgba(94, 96, 206, 1)",
            pointHoverRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            mode: "index",
            intersect: false,
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            titleColor: "white",
            bodyColor: "white",
            cornerRadius: 6,
          },
        },
        scales: {
          x: {
            grid: {
              color: "rgba(200, 200, 200, 0.2)",
            },
          },
          y: {
            beginAtZero: true,
            ticks: {
              precision: 0,
            },
            grid: {
              color: "rgba(200, 200, 200, 0.2)",
            },
          },
        },
        interaction: {
          mode: "nearest",
          axis: "x",
          intersect: false,
        },
      },
    });

    const loadingSpinner = document.getElementById("chart-loading");
    if (loadingSpinner) {
      console.log("📊 Hiding loading spinner");
      loadingSpinner.classList.add("hidden");
      // or loadingSpinner.style.display = 'none';
    }

    // Load initial data
    this.loadTimeSeriesData("hour");
  }

  loadTimeSeriesData(period = "hour") {
    console.log(`📊 Loading time series data for period: ${period}`);

    const url = `/analytics-api?type=timeseries&period=${period}&t=${Date.now()}`;

    fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response.json();
      })
      .then((data) => {
        console.log(`📊 Time series data loaded:`, data);
        this.updateChart(data);
        this.updateChartStats(data);
      })
      .catch((error) => {
        console.error("📊 Error loading time series data:", error);
        this.showChartError(error.message);
      });
  }

  updateChart(data) {
    if (!this.chart || !data) {
      console.warn("📊 Chart not available or no data to update");
      return;
    }

    // Update chart data
    this.chart.data.labels = data.labels || [];
    this.chart.data.datasets[0].data = data.data || [];

    // Update the chart with animation
    this.chart.update("active");

    // Update period display
    const periodDisplay = document.getElementById("current-period");
    if (periodDisplay) {
      periodDisplay.textContent = data.period || period;
    }

    console.log(
      "📊 Chart updated with",
      data.labels?.length || 0,
      "data points",
    );
  }

  // Replace your updateChartStats method in AnalyticsManager with this:

  updateChartStats(data) {
    const stats = data.data || [];
    const total = stats.reduce((sum, val) => sum + val, 0);
    const average = stats.length > 0 ? (total / stats.length).toFixed(1) : 0;
    const max = stats.length > 0 ? Math.max(...stats) : 0;

    // Update stats using your template's actual IDs
    this.updateElement("period-total", total); // Your template uses period-total
    this.updateElement("period-average", average); // Your template uses period-average
    this.updateElement("period-peak", max); // Your template uses period-peak

    // Also try the old IDs as fallback
    this.updateElement("chart-total", total);
    this.updateElement("chart-average", average);
    this.updateElement("chart-peak", max);

    console.log("📊 Updated chart stats:", { total, average, max });
  }

  loadSummaryData() {
    console.log("📊 Loading summary data");

    const url = `/analytics-api?t=${Date.now()}`;

    fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        console.log("📊 Summary data loaded:", data);
        this.updateSummaryCards(data);
      })
      .catch((error) => {
        console.error("📊 Error loading summary data:", error);
      });
  }

  updateSummaryCards(data) {
    console.log("📊 Updating summary cards with data:", data);

    // Your template doesn't have IDs on the stat values, so we need to update by position
    const statValues = document.querySelectorAll(".stat-value");
    console.log("📊 Found stat value elements:", statValues.length);

    if (statValues.length >= 3) {
      // Update by position (first, second, third stat card)
      this.animateNumberElement(statValues[0], data.total_visits || 0); // Total visits
      this.animateNumberElement(statValues[1], data.today_visits || 0); // Today
      this.animateNumberElement(statValues[2], data.week_visits || 0); // This week

      if (statValues[3]) {
        // Fourth card shows region count
        const regionCount = data.region_breakdown
          ? Object.keys(data.region_breakdown).length
          : 0;
        this.animateNumberElement(statValues[3], regionCount);
      }
    } else {
      console.warn("📊 Not enough stat value elements found");
    }

    // Update breakdowns if elements exist (these probably don't exist in your template)
    this.updateBreakdown("region-breakdown", data.region_breakdown);
    this.updateBreakdown("browser-breakdown", data.browser_breakdown);
    this.updateBreakdown("page-breakdown", data.popular_pages);
  }

  animateNumberElement(element, targetValue) {
    if (!element) return;

    const currentValue = parseInt(element.textContent.replace(/,/g, "")) || 0;
    const duration = 1000;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function (ease-out)
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const value = Math.round(
        currentValue + (targetValue - currentValue) * easeOut,
      );

      element.textContent = value.toLocaleString();

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    animate();
  }

  updateBreakdown(containerId, data) {
    const container = document.getElementById(containerId);
    if (!container || !data) return;

    const entries = Object.entries(data)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);

    container.innerHTML = entries
      .map(
        ([key, value]) => `
      <div class="breakdown-item">
        <span class="breakdown-label">${key}</span>
        <span class="breakdown-value">${value}</span>
      </div>
    `,
      )
      .join("");
  }

  loadRecentVisits() {
    console.log("📊 Loading recent visits");

    const url = `/analytics-api?type=recent&limit=20&t=${Date.now()}`;

    fetch(url)
      .then((response) => response.json())
      .then((data) => {
        console.log("📊 Recent visits loaded:", data);
        this.updateRecentVisitsTable(data.visits || []);
      })
      .catch((error) => {
        console.error("📊 Error loading recent visits:", error);
      });
  }

  updateRecentVisitsTable(visits) {
    // First try to find a standard table
    let tableBody = document.querySelector("#recent-visits-table tbody");

    if (!tableBody) {
      // Look for your template's div-based table structure
      const visitsTable = document.querySelector(".visits-table");
      if (visitsTable) {
        console.log("📊 Found div-based visits table, updating...");
        this.updateVisitsDiv(visits);
        return;
      }

      console.warn("📊 No recent visits table found");
      return;
    }

    // Standard table update (fallback)
    if (visits.length === 0) {
      tableBody.innerHTML =
        '<tr><td colspan="4" style="text-align: center; color: #666;">No recent visits</td></tr>';
      return;
    }

    tableBody.innerHTML = visits
      .slice(0, 20)
      .map(
        (visit) => `
      <tr>
        <td>${new Date(visit.timestamp).toLocaleString()}</td>
        <td><span class="region-badge">${visit.region || "Unknown"}</span></td>
        <td><code>${visit.path || "/"}</code></td>
        <td><span class="browser-badge">${visit.user_agent || "Unknown"}</span></td>
      </tr>
    `,
      )
      .join("");

    console.log(`📊 Updated recent visits table with ${visits.length} entries`);
  }

  updateVisitsDiv(visits) {
    const visitsTable = document.querySelector(".visits-table");
    if (!visitsTable) return;

    // Clear existing rows (keep header)
    const tableRows = visitsTable.querySelectorAll(".table-row");
    tableRows.forEach((row) => row.remove());

    if (visits.length === 0) {
      visitsTable.insertAdjacentHTML(
        "beforeend",
        '<div class="table-row" style="text-align: center; color: #666; grid-column: 1 / -1;">No recent visits</div>',
      );
      return;
    }

    // Add new rows using your template's structure
    visits.slice(0, 20).forEach((visit) => {
      const rowHTML = `
        <div class="table-row">
          <div class="col-time">${new Date(visit.timestamp).toLocaleString()}</div>
          <div class="col-region">${visit.region || "Unknown"}</div>
          <div class="col-page">${visit.path || "/"}</div>
          <div class="col-browser">${visit.user_agent || "Unknown"}</div>
        </div>
      `;
      visitsTable.insertAdjacentHTML("beforeend", rowHTML);
    });

    console.log(`📊 Updated visits div with ${visits.length} entries`);
  }

  setupControls() {
    console.log("📊 Setting up analytics controls");

    // Period selection buttons
    const periodButtons = document.querySelectorAll("[data-period]");
    periodButtons.forEach((button) => {
      // Remove existing listeners to prevent duplicates
      const newButton = button.cloneNode(true);
      button.parentNode.replaceChild(newButton, button);

      newButton.addEventListener("click", (e) => {
        e.preventDefault();
        const period = newButton.dataset.period;

        console.log(`📊 Period changed to: ${period}`);

        // Update active state
        periodButtons.forEach((btn) => btn.classList.remove("active"));
        newButton.classList.add("active");

        // Load new data
        this.loadTimeSeriesData(period);
      });
    });

    // Refresh button
    const refreshButton = document.querySelector(".refresh-btn");
    if (refreshButton) {
      const newRefreshButton = refreshButton.cloneNode(true);
      refreshButton.parentNode.replaceChild(newRefreshButton, refreshButton);

      newRefreshButton.addEventListener("click", (e) => {
        e.preventDefault();
        console.log("📊 Manual refresh triggered");

        // Add loading state
        newRefreshButton.innerHTML =
          '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
        newRefreshButton.disabled = true;

        this.refreshAll().finally(() => {
          newRefreshButton.innerHTML =
            '<i class="fas fa-sync-alt"></i> Refresh';
          newRefreshButton.disabled = false;
        });
      });
    }

    console.log("📊 Controls setup complete");
  }

  refreshAll() {
    console.log("📊 Refreshing all analytics data");

    const activePeriod =
      document.querySelector("[data-period].active")?.dataset.period || "hour";

    const promises = [
      this.loadTimeSeriesData(activePeriod),
      this.loadSummaryData(),
      this.loadRecentVisits(),
    ];

    return Promise.allSettled(promises);
  }

  startAutoRefresh() {
    // Clear existing interval
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }

    // Auto-refresh every 30 seconds
    this.refreshInterval = setInterval(() => {
      if (this.isOnAnalyticsPage()) {
        console.log("📊 Auto-refreshing analytics data");
        this.refreshAll();
      } else {
        console.log("📊 Not on analytics page, stopping auto-refresh");
        this.cleanup();
      }
    }, 30000);

    console.log("📊 Auto-refresh started (30 second interval)");
  }

  // Utility methods
  updateElement(id, value) {
    const element = document.getElementById(id);
    if (element) {
      element.textContent =
        typeof value === "number" ? value.toLocaleString() : value;
    }
  }

  animateNumber(elementId, targetValue) {
    const element = document.getElementById(elementId);
    if (!element) return;

    const currentValue = parseInt(element.textContent.replace(/,/g, "")) || 0;
    const duration = 1000;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function (ease-out)
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const value = Math.round(
        currentValue + (targetValue - currentValue) * easeOut,
      );

      element.textContent = value.toLocaleString();

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    animate();
  }

  showChartError(message) {
    const canvas = document.getElementById("timeseries-chart");
    if (!canvas) return;

    const container = canvas.parentNode;
    container.innerHTML = `
      <div class="chart-error">
        <i class="fas fa-exclamation-triangle"></i>
        <h3>Chart Error</h3>
        <p>${message}</p>
        <button onclick="window.analyticsManager.init()" class="btn btn-primary">
          Try Again
        </button>
      </div>
    `;
  }

  cleanup() {
    console.log("📊 Cleaning up analytics");

    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }

    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }

    this.isInitialized = false;
  }
}

// Fallback analytics initialization for direct page loads
document.addEventListener("DOMContentLoaded", function () {
  // Add a small delay to ensure everything is loaded
  setTimeout(() => {
    if (
      window.location.pathname.includes("/analytics") &&
      window.globalRadioPlayer &&
      (!window.analyticsManager || !window.analyticsManager.isInitialized)
    ) {
      console.log("📊 Fallback: Initializing analytics on DOMContentLoaded");

      if (!window.analyticsManager) {
        window.analyticsManager = new AnalyticsManager();
      }

      // Force initialization
      window.analyticsManager.init();
    }
  }, 500);
});

// Additional fallback - try after window load
window.addEventListener("load", function () {
  setTimeout(() => {
    if (
      window.location.pathname.includes("/analytics") &&
      window.globalRadioPlayer &&
      (!window.analyticsManager || !window.analyticsManager.isInitialized)
    ) {
      console.log("📊 Final fallback: Initializing analytics on window load");

      if (!window.analyticsManager) {
        window.analyticsManager = new AnalyticsManager();
      }

      window.analyticsManager.init();
    }
  }, 1000);
});
