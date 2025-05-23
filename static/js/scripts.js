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

    // Append to body so it persists across navigation
    document.body.appendChild(this.audioPlayer);
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

    // Directory page functionality
    this.setupDirectoryFunctionality();
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
      if (this.playIcon) {
        this.playIcon.classList.remove("fa-pause");
        this.playIcon.classList.add("fa-play");
      }
      this.stopProgressUpdates();
      this.updateMediaSessionPlaybackState("paused");
      console.log("Audio paused");
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
      this.stopProgressUpdates();
      setTimeout(() => this.checkForNewEpisode(), 2000);
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

    // Get server position and initialize stream
    fetch("/stream-position")
      .then((response) => response.json())
      .then((data) => {
        const serverTimePosition = data.time_position || 0;
        this.updateLoadingStatus(this.LoadingStates.LOADING_STREAM);

        const streamUrl = `/stream?t=${Date.now()}`;

        console.log("Setting audio source:", streamUrl);
        console.log("Server position:", serverTimePosition, "seconds");

        this.audioPlayer.src = streamUrl;

        const handleLoadedMetadata = () => {
          this.audioPlayer.removeEventListener(
            "loadedmetadata",
            handleLoadedMetadata,
          );

          // Seek to server position
          if (serverTimePosition > 0 && this.audioPlayer.duration) {
            const seekPosition = Math.min(
              serverTimePosition,
              this.audioPlayer.duration - 1,
            );
            console.log("Seeking to position:", seekPosition, "seconds");
            this.audioPlayer.currentTime = seekPosition;
          }

          // Try autoplay
          const playPromise = this.audioPlayer.play();
          if (playPromise !== undefined) {
            playPromise
              .then(() => {
                console.log("Autoplay started successfully");
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

  checkForNewEpisode() {
    fetch("/now-playing")
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => {
        if (data.id && data.id !== this.currentEpisodeId) {
          console.log("New episode detected:", data.title);
          this.currentEpisodeId = data.id;

          this.updateUIWithEpisodeData(data);
          this.updateMediaSessionMetadata(data);

          // Only update source if needed
          if (!this.audioPlayer.src.includes("/stream")) {
            const streamUrl = `/stream?t=${Date.now()}`;
            this.audioPlayer.src = streamUrl;
            this.audioPlayer.currentTime = 0;

            if (this.isPlaying) {
              this.audioPlayer.play().catch(console.error);
            }
          }
        } else if (data.id === this.currentEpisodeId) {
          // Same episode - sync position if significantly off
          const serverTime = data.time_position || 0;
          const clientTime = this.audioPlayer.currentTime || 0;
          const timeDiff = Math.abs(serverTime - clientTime);

          if (
            timeDiff > 10 &&
            this.audioPlayer.duration &&
            serverTime < this.audioPlayer.duration
          ) {
            console.log(
              `Resyncing: server=${serverTime}s, client=${clientTime}s, diff=${timeDiff}s`,
            );
            this.audioPlayer.currentTime = serverTime;
          }
        }

        this.updateUIWithEpisodeData(data);
      })
      .catch((err) => {
        console.error("Error checking for new episode:", err);
      });
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
      this.audioPlayer.pause();
      console.log("Paused");
    } else {
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
            console.log("Playing");
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

    // Rebind page-specific elements
    globalRadioPlayer.bindPageSpecificElements();
    return;
  }

  // Create new instance only if none exists
  console.log("🎵 Creating new global player instance");
  globalRadioPlayer = new GlobalRadioPlayer();
  globalRadioPlayer.init();
  window.globalRadioPlayer = globalRadioPlayer;
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

    document.querySelectorAll(".theme-option").forEach((option) => {
      option.classList.toggle(
        "active",
        option.dataset.theme === this.currentTheme,
      );
    });
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

    const themeSelectorHTML = `
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

    nav.insertAdjacentHTML("beforeend", themeSelectorHTML);
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
