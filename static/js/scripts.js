document.addEventListener("DOMContentLoaded", function () {
  // Player elements
  const audioPlayer = document.getElementById("audio-stream");
  const playBtn = document.getElementById("play-btn");
  const playIcon = playBtn ? playBtn.querySelector("i") : null;
  const rewindBtn = document.getElementById("rewind-btn");
  const volumeBtn = document.getElementById("volume-btn");
  const volumeIcon = volumeBtn ? volumeBtn.querySelector("i") : null;
  const volumeSlider = document.getElementById("volume-slider");
  const volumeContainer = document.getElementById("volume-slider-container");
  const progressBar = document.getElementById("progress");
  const currentTimeEl = document.getElementById("current-time");
  const durationEl = document.getElementById("duration");

  // Loading elements
  const loadingOverlay = document.getElementById("loading-overlay");
  const loadingStatus = document.getElementById("loading-status");
  const skipLoadingBtn = document.getElementById("skip-loading-btn");

  // Episode info elements
  const episodeTitle = document.getElementById("episode-title");
  const showName = document.getElementById("show-name");
  const episodeCover = document.getElementById("episode-cover-art");

  // Random fact elements
  const randomFactEl = document.getElementById("random-fact");
  const newFactBtn = document.getElementById("new-fact-btn");

  // Radio quote element
  const radioQuote = document.getElementById("radio-quote");

  // Initialize player state
  let isPlaying = false;
  let isMuted = false;
  let volumeLevel = 0.8;
  let lastVolumeLevel = volumeLevel;
  let currentEpisodeId = null;
  let progressUpdateInterval = null;
  let loadingTimeout = null;
  let isStreamReady = false;

  // Loading states
  const LoadingStates = {
    INITIALIZING: "Initializing player...",
    FETCHING_POSITION: "Getting current position...",
    LOADING_STREAM: "Loading audio stream...",
    BUFFERING: "Buffering audio...",
    READY: "Ready to play!",
    ERROR: "Connection failed",
  };

  // Set initial disabled state for controls
  setControlsEnabled(false);

  // Set initial state for audio
  if (audioPlayer) {
    audioPlayer.volume = volumeLevel;
    audioPlayer.muted = false;
    audioPlayer.preload = "metadata";

    // Set up audio event listeners
    audioPlayer.addEventListener("loadstart", () => {
      console.log("Audio load started");
      updateLoadingStatus(LoadingStates.LOADING_STREAM);
    });

    audioPlayer.addEventListener("loadedmetadata", () => {
      console.log("Audio metadata loaded");
      if (audioPlayer.duration && durationEl) {
        durationEl.textContent = formatTime(audioPlayer.duration);
      }
    });

    audioPlayer.addEventListener("canplay", () => {
      console.log("Audio can play");
      updateLoadingStatus(LoadingStates.READY);
      setTimeout(() => {
        setStreamReady(true);
      }, 500); // Small delay to show "Ready" message
    });

    audioPlayer.addEventListener("canplaythrough", () => {
      console.log("Audio can play through");
      setStreamReady(true);
    });

    audioPlayer.addEventListener("playing", () => {
      console.log("Audio is actually playing");
      setStreamReady(true);
    });

    audioPlayer.addEventListener("play", () => {
      isPlaying = true;
      if (playIcon) {
        playIcon.classList.remove("fa-play");
        playIcon.classList.add("fa-pause");
      }
      startProgressUpdates();
      updateMediaSessionPlaybackState("playing");
      console.log("Audio started playing");
    });

    audioPlayer.addEventListener("pause", () => {
      isPlaying = false;
      if (playIcon) {
        playIcon.classList.remove("fa-pause");
        playIcon.classList.add("fa-play");
      }
      stopProgressUpdates();
      updateMediaSessionPlaybackState("paused");
      console.log("Audio paused");
    });

    audioPlayer.addEventListener("timeupdate", () => {
      updateProgress();
      updateMediaSessionPosition();
    });

    audioPlayer.addEventListener("error", (e) => {
      console.error("Audio error:", e);
      isPlaying = false;
      stopProgressUpdates();
      updateLoadingStatus(LoadingStates.ERROR);
      hideLoadingOverlay();

      showNotification(
        "Audio playback error. Please try refreshing the page.",
        "error",
      );
    });

    audioPlayer.addEventListener("stalled", () => {
      console.warn("Audio stream stalled - buffering");
      updateLoadingStatus(LoadingStates.BUFFERING);
    });

    audioPlayer.addEventListener("waiting", () => {
      console.log("Audio waiting for data - buffering");
      updateLoadingStatus(LoadingStates.BUFFERING);
    });

    audioPlayer.addEventListener("ended", () => {
      console.log("Audio stream ended");
      isPlaying = false;
      stopProgressUpdates();
      setTimeout(checkForNewEpisode, 2000);
    });

    audioPlayer.addEventListener("progress", () => {
      // Update buffering progress if needed
      if (audioPlayer.buffered.length > 0) {
        const bufferedEnd = audioPlayer.buffered.end(
          audioPlayer.buffered.length - 1,
        );
        const duration = audioPlayer.duration;
        if (duration > 0) {
          const bufferedPercent = (bufferedEnd / duration) * 100;
          // You could show buffering progress here if desired
        }
      }
    });
  }

  if (volumeSlider) {
    volumeSlider.value = volumeLevel * 100;
  }

  // Set initial volume icon state
  if (volumeIcon) {
    volumeIcon.classList.remove("fa-volume-mute");
    volumeIcon.classList.add("fa-volume-up");
  }

  // Initialize Media Session API
  setupMediaSession();

  // Initialize the audio source and sync with server position
  function initializeAudio() {
    if (!audioPlayer) return;

    updateLoadingStatus(LoadingStates.INITIALIZING);
    showLoadingOverlay();

    // Set a timeout to hide loading overlay if it takes too long
    loadingTimeout = setTimeout(() => {
      if (!isStreamReady) {
        console.warn(
          "Stream loading taking longer than expected, showing skip button",
        );
        updateLoadingStatus("Taking longer than usual...");
        if (skipLoadingBtn) {
          skipLoadingBtn.style.display = "inline-flex";
        }
      }
    }, 8000);

    // Force hide after 20 seconds
    setTimeout(() => {
      if (!isStreamReady) {
        console.warn("Force hiding loading overlay after 20 seconds");
        setStreamReady(true);
        showNotification("Stream ready (click play if needed)");
      }
    }, 20000);

    updateLoadingStatus(LoadingStates.FETCHING_POSITION);

    // Get current server position first
    fetch("/stream-position")
      .then((response) => response.json())
      .then((data) => {
        const serverTimePosition = data.time_position || 0;

        updateLoadingStatus(LoadingStates.LOADING_STREAM);

        // Set the stream URL (browser will handle Range requests automatically)
        const streamUrl = `/stream?t=${Date.now()}`;

        if (audioPlayer.src !== window.location.origin + streamUrl) {
          console.log("Setting audio source:", streamUrl);
          console.log("Server is at position:", serverTimePosition, "seconds");

          audioPlayer.src = streamUrl;

          // Wait for metadata to load so we can seek
          const handleLoadedMetadata = () => {
            audioPlayer.removeEventListener(
              "loadedmetadata",
              handleLoadedMetadata,
            );

            // Seek to server position
            if (serverTimePosition > 0 && audioPlayer.duration) {
              const seekPosition = Math.min(
                serverTimePosition,
                audioPlayer.duration - 1,
              );
              console.log("Seeking to position:", seekPosition, "seconds");
              audioPlayer.currentTime = seekPosition;
            }

            // Try autoplay
            const playPromise = audioPlayer.play();
            if (playPromise !== undefined) {
              playPromise
                .then(() => {
                  console.log("Autoplay started successfully");
                  setStreamReady(true);
                  showNotification("McElroy Radio is now playing!", "success");
                })
                .catch((error) => {
                  console.log("Autoplay prevented by browser:", error.message);
                  setStreamReady(true); // Still consider it ready even if autoplay failed
                  showNotification("Click the play button to start listening");
                });
            } else {
              // Fallback if play() doesn't return a promise
              setStreamReady(true);
            }
          };

          if (audioPlayer.readyState >= 1) {
            handleLoadedMetadata();
          } else {
            audioPlayer.addEventListener(
              "loadedmetadata",
              handleLoadedMetadata,
            );

            // Fallback timeout in case metadata never loads
            setTimeout(() => {
              if (!isStreamReady) {
                console.log("Metadata loading timeout, forcing ready state");
                setStreamReady(true);
              }
            }, 10000);
          }
        }
      })
      .catch((error) => {
        console.error("Failed to get server position:", error);
        updateLoadingStatus(LoadingStates.ERROR);

        setTimeout(() => {
          hideLoadingOverlay();
          showNotification(
            "Failed to connect to stream. Please refresh the page.",
            "error",
          );
        }, 2000);
      });
  }

  function setStreamReady(ready) {
    isStreamReady = ready;
    if (ready) {
      hideLoadingOverlay();
      setControlsEnabled(true);

      if (loadingTimeout) {
        clearTimeout(loadingTimeout);
        loadingTimeout = null;
      }
    }
  }

  // Theme Management System for McElroy Radio
  // Add this to your existing scripts.js file

  // Theme Management Class
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
      this.applyTheme(this.currentTheme);
      this.setupEventListeners();
      this.setupKonamiCode();
      this.updateDisplay();
      this.createThemeSelector();
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

      // Special handling for hot dog theme
      if (theme === "hotdog") {
        this.activateHotdogMode();
      } else {
        this.deactivateHotdogMode();
      }

      // Dispatch theme change event for other components
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

      // Update active state in dropdown
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
      // Check if theme selector already exists
      if (document.querySelector(".theme-selector")) return;

      // Find the nav element
      const nav = document.querySelector("nav");
      if (!nav) return;

      // Create theme selector HTML
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

      // Insert the theme selector into nav
      nav.insertAdjacentHTML("beforeend", themeSelectorHTML);
    }

    setupEventListeners() {
      // Wait for theme selector to be created
      setTimeout(() => {
        const themeToggle = document.getElementById("theme-toggle");
        const themeDropdown = document.getElementById("theme-dropdown");

        if (themeToggle) {
          themeToggle.addEventListener("click", (e) => {
            e.stopPropagation();
            themeDropdown.classList.toggle("show");
          });
        }

        // Close dropdown when clicking outside
        document.addEventListener("click", () => {
          if (themeDropdown) {
            themeDropdown.classList.remove("show");
          }
        });

        // Prevent dropdown from closing when clicking inside
        if (themeDropdown) {
          themeDropdown.addEventListener("click", (e) => {
            e.stopPropagation();
          });
        }

        // Theme option selection
        document.querySelectorAll(".theme-option").forEach((option) => {
          option.addEventListener("click", () => {
            const theme = option.dataset.theme;
            this.applyTheme(theme);
            themeDropdown.classList.remove("show");
          });
        });
      }, 100);

      // Listen for system theme changes
      window
        .matchMedia("(prefers-color-scheme: dark)")
        .addEventListener("change", (e) => {
          if (!this.getSavedTheme()) {
            this.applyTheme(e.matches ? "dark" : "light");
          }
        });
    }

    setupKonamiCode() {
      document.addEventListener("keydown", (e) => {
        // Add current key to progress
        this.konamiProgress.push(e.code);

        // Keep only the last 10 keys
        if (this.konamiProgress.length > this.konamiCode.length) {
          this.konamiProgress.shift();
        }

        // Check if the sequence matches
        if (this.konamiProgress.length === this.konamiCode.length) {
          const matches = this.konamiProgress.every(
            (key, index) => key === this.konamiCode[index],
          );

          if (matches) {
            this.triggerHotdogMode();
            this.konamiProgress = []; // Reset
          }
        }
      });
    }

    triggerHotdogMode() {
      // Play a celebratory sound effect (if possible)
      this.playHotdogSound();

      // Show notification
      this.showHotdogNotification();

      // Apply the hot dog theme
      this.applyTheme("hotdog");

      // Add the hotdog option to dropdown if not already there
      this.addHotdogThemeOption();
    }

    playHotdogSound() {
      // Create a simple beep sound using Web Audio API
      try {
        const audioContext = new (window.AudioContext ||
          window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        oscillator.frequency.setValueAtTime(
          1000,
          audioContext.currentTime + 0.1,
        );
        oscillator.frequency.setValueAtTime(
          1200,
          audioContext.currentTime + 0.2,
        );

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

      // Remove notification after 3 seconds
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 3000);

      // Add entrance animation
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

      // Start floating hot dogs
      this.startFloatingHotdogs();

      // Add screen shake
      this.addScreenShake();

      // Make everything more chaotic
      this.addChaosEffects();

      // Show special notification for existing users
      if (document.querySelector(".episode-title")) {
        this.showNotification("🌭 MAXIMUM HOTDOG POWER ACHIEVED! 🌭", "hotdog");
      }
    }

    deactivateHotdogMode() {
      if (!this.hotdogMode) return;

      this.hotdogMode = false;

      // Stop floating hot dogs
      if (this.hotdogInterval) {
        clearInterval(this.hotdogInterval);
        this.hotdogInterval = null;
      }

      // Remove floating hot dogs
      document.querySelectorAll(".floating-hotdog").forEach((hotdog) => {
        hotdog.remove();
      });

      // Remove chaos effects
      this.removeChaosEffects();
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

      // Random vertical position
      hotdog.style.top = Math.random() * window.innerHeight + "px";

      document.body.appendChild(hotdog);

      // Remove after animation completes
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

    addChaosEffects() {
      // Make buttons randomly change size
      const buttons = document.querySelectorAll(".btn, .control-btn");
      buttons.forEach((btn) => {
        btn.addEventListener("mouseenter", this.randomButtonEffect);
      });

      // Add random text effects
      this.addRandomTextEffects();

      // Make the radio waves go crazy
      this.enhanceRadioWaves();
    }

    randomButtonEffect(e) {
      const randomScale = 0.8 + Math.random() * 0.6; // 0.8 to 1.4
      const randomRotation = (Math.random() - 0.5) * 30; // -15 to 15 degrees

      e.target.style.transform = `scale(${randomScale}) rotate(${randomRotation}deg)`;

      setTimeout(() => {
        e.target.style.transform = "";
      }, 200);
    }

    addRandomTextEffects() {
      const textElements = document.querySelectorAll(
        "h1, h2, h3, .episode-title",
      );
      textElements.forEach((el) => {
        el.addEventListener("click", () => {
          const originalText = el.textContent;
          const funnyTexts = [
            "🌭 HOT DOG! 🌭",
            "EMBRACE THE CHAOS!",
            "BEAUTIFUL, ISN'T IT?",
            "MORE MUSTARD!",
            "RELISH THE MOMENT!",
            "KETCHUP WITH THE TIMES!",
            "GRIFFIN APPROVED!",
            "JUSTIN'S FAVORITE!",
            "TRAVIS SAYS YES!",
            "MAXIMUM GOOF ACHIEVED!",
          ];

          el.textContent =
            funnyTexts[Math.floor(Math.random() * funnyTexts.length)];
          el.style.transform = "rotate(" + (Math.random() * 20 - 10) + "deg)";

          setTimeout(() => {
            el.textContent = originalText;
            el.style.transform = "";
          }, 1000);
        });
      });
    }

    enhanceRadioWaves() {
      const waves = document.querySelectorAll(".wave");
      waves.forEach((wave, index) => {
        wave.style.animation = `wave-animation 0.5s infinite, hotdog-rainbow 1s infinite linear`;
        wave.style.borderWidth = "5px";
      });
    }

    removeChaosEffects() {
      // Remove shake style
      const shakeStyle = document.getElementById("hotdog-shake");
      if (shakeStyle) {
        shakeStyle.remove();
      }

      // Remove button effects
      const buttons = document.querySelectorAll(".btn, .control-btn");
      buttons.forEach((btn) => {
        btn.removeEventListener("mouseenter", this.randomButtonEffect);
        btn.style.transform = "";
      });

      // Reset text elements
      const textElements = document.querySelectorAll(
        "h1, h2, h3, .episode-title",
      );
      textElements.forEach((el) => {
        el.style.transform = "";
      });

      // Reset radio waves
      const waves = document.querySelectorAll(".wave");
      waves.forEach((wave) => {
        wave.style.animation = "";
        wave.style.borderWidth = "";
      });
    }

    // Notification system that works with existing notification system
    showNotification(message, type = "info") {
      // Try to use existing notification system first
      if (
        window.showNotification &&
        typeof window.showNotification === "function"
      ) {
        window.showNotification(message, type);
        return;
      }

      // Fallback notification system
      let notification = document.getElementById("theme-notification");
      if (!notification) {
        notification = document.createElement("div");
        notification.id = "theme-notification";
        document.body.appendChild(notification);
      }

      const bgColor =
        type === "hotdog"
          ? "linear-gradient(45deg, #ff0000, #ffff00, #ff0000)"
          : type === "error"
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
              color: ${type === "hotdog" ? "#000" : "white"};
              border-radius: 8px;
              z-index: 1001;
              box-shadow: 0 4px 15px rgba(0,0,0,0.2);
              font-family: inherit;
              font-size: 14px;
              font-weight: ${type === "hotdog" ? "bold" : "normal"};
              max-width: 350px;
              line-height: 1.4;
              transform: translateX(100%);
              transition: transform 0.3s ease;
              ${type === "hotdog" ? "animation: hotdog-pulse 0.5s infinite alternate;" : ""}
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
  }

  // Easter egg hint system
  let hintShown = false;
  let konamiHintTimeout = null;

  function showKonamiHint() {
    if (hintShown) return;

    const hint = document.createElement("div");
    hint.style.cssText = `
          position: fixed;
          bottom: 20px;
          right: 20px;
          background: var(--surface-color);
          color: var(--text-color);
          padding: 15px;
          border-radius: 8px;
          box-shadow: var(--shadow);
          border: 1px solid var(--border-color);
          z-index: 1000;
          max-width: 300px;
          font-size: 0.9rem;
          animation: slide-in 0.3s ease;
      `;
    hint.innerHTML = `
          <strong>🎮 Konami Code Detected!</strong><br>
          Keep going: ↑↑↓↓←→←→BA<br>
          <small>Something special awaits...</small>
      `;

    document.body.appendChild(hint);

    setTimeout(() => {
      hint.style.animation = "slide-out 0.3s ease";
      setTimeout(() => hint.remove(), 300);
    }, 3000);

    // Add slide animations
    const style = document.createElement("style");
    style.textContent = `
          @keyframes slide-in {
              from { transform: translateX(100%); opacity: 0; }
              to { transform: translateX(0); opacity: 1; }
          }
          @keyframes slide-out {
              from { transform: translateX(0); opacity: 1; }
              to { transform: translateX(100%); opacity: 0; }
          }
      `;
    document.head.appendChild(style);

    hintShown = true;
  }

  // Initialize theme manager and add to existing DOMContentLoaded
  function initThemeSystem() {
    // Initialize theme manager
    window.themeManager = new ThemeManager();

    // Add konami code hint detection
    document.addEventListener("keydown", (e) => {
      if (
        !hintShown &&
        (e.code === "ArrowUp" ||
          e.code === "ArrowDown" ||
          e.code === "ArrowLeft" ||
          e.code === "ArrowRight")
      ) {
        if (konamiHintTimeout) clearTimeout(konamiHintTimeout);
        konamiHintTimeout = setTimeout(showKonamiHint, 1000);
      }
    });

    console.log("🎨 Theme system initialized! Try the Konami code: ↑↑↓↓←→←→BA");
  }

  // Export for integration
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { ThemeManager, initThemeSystem };
  } else {
    window.initThemeSystem = initThemeSystem;
    window.ThemeManager = ThemeManager;
  }

  function setControlsEnabled(enabled) {
    if (playBtn) playBtn.disabled = !enabled;
    if (rewindBtn) rewindBtn.disabled = !enabled;
    if (volumeBtn) volumeBtn.disabled = !enabled;
    if (volumeSlider) volumeSlider.disabled = !enabled;
  }

  function showLoadingOverlay() {
    if (loadingOverlay) {
      loadingOverlay.classList.remove("hidden");
    }
  }

  function hideLoadingOverlay() {
    if (loadingOverlay) {
      loadingOverlay.classList.add("hidden");
    }
  }

  function updateLoadingStatus(status) {
    if (loadingStatus) {
      loadingStatus.textContent = status;
    }
  }

  // Setup Media Session API for rich media controls
  function setupMediaSession() {
    if ("mediaSession" in navigator) {
      console.log("Setting up Media Session API");

      // Set up action handlers
      navigator.mediaSession.setActionHandler("play", () => {
        togglePlay();
      });

      navigator.mediaSession.setActionHandler("pause", () => {
        togglePlay();
      });

      navigator.mediaSession.setActionHandler("seekbackward", (details) => {
        const skipTime = details.seekOffset || 15;
        rewind(skipTime);
      });

      navigator.mediaSession.setActionHandler("seekforward", (details) => {
        const skipTime = details.seekOffset || 30;
        if (audioPlayer && audioPlayer.duration) {
          audioPlayer.currentTime = Math.min(
            audioPlayer.currentTime + skipTime,
            audioPlayer.duration,
          );
        }
      });

      navigator.mediaSession.setActionHandler("seekto", (details) => {
        if (audioPlayer && details.seekTime !== null) {
          audioPlayer.currentTime = details.seekTime;
        }
      });

      // Set initial metadata
      updateMediaSessionMetadata();
    } else {
      console.log("Media Session API not supported");
    }
  }

  function updateMediaSessionMetadata(episodeData = null) {
    if ("mediaSession" in navigator) {
      const title =
        episodeData?.title || episodeTitle?.textContent || "McElroy Radio";
      const artist =
        episodeData?.show_name || showName?.textContent || "McElroy Family";
      const album = "McElroy Radio";
      const artwork =
        episodeData?.image_path ||
        episodeCover?.src ||
        "/static/img/default-cover.png";

      // Convert relative URLs to absolute URLs
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

      console.log("Updated media session metadata:", {
        title,
        artist,
        album,
        artwork: absoluteArtwork,
      });
    }
  }

  function updateMediaSessionPlaybackState(state) {
    if ("mediaSession" in navigator) {
      navigator.mediaSession.playbackState = state;
    }
  }

  function updateMediaSessionPosition() {
    if ("mediaSession" in navigator && audioPlayer) {
      navigator.mediaSession.setPositionState({
        duration: audioPlayer.duration || 0,
        playbackRate: audioPlayer.playbackRate || 1,
        position: audioPlayer.currentTime || 0,
      });
    }
  }

  // Check for new episodes and update source if needed
  function checkForNewEpisode() {
    fetch("/now-playing")
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => {
        if (data.id && data.id !== currentEpisodeId) {
          console.log("New episode detected:", data.title);
          currentEpisodeId = data.id;

          // Update UI elements
          updateUIWithEpisodeData(data);

          // Update media session metadata
          updateMediaSessionMetadata(data);

          // Update the audio source for the new episode
          const streamUrl = `/stream?t=${Date.now()}`;
          audioPlayer.src = streamUrl;
          audioPlayer.currentTime = 0;

          if (isPlaying) {
            audioPlayer.play().catch(console.error);
          }
        } else if (data.id === currentEpisodeId) {
          // Same episode - sync position if we're significantly off
          const serverTime = data.time_position || 0;
          const clientTime = audioPlayer.currentTime || 0;
          const timeDiff = Math.abs(serverTime - clientTime);

          if (
            timeDiff > 10 &&
            audioPlayer.duration &&
            serverTime < audioPlayer.duration
          ) {
            console.log(
              `Resyncing position: server=${serverTime}s, client=${clientTime}s, diff=${timeDiff}s`,
            );
            audioPlayer.currentTime = serverTime;
          }
        }

        updateUIWithEpisodeData(data);
      })
      .catch((err) => {
        console.error("Error checking for new episode:", err);
      });
  }

  // Update UI with episode data
  function updateUIWithEpisodeData(data) {
    if (episodeTitle && data.title) {
      episodeTitle.textContent = data.title;
    }

    if (showName && data.show_name) {
      showName.textContent = data.show_name;
    }

    if (episodeCover && data.image_path) {
      episodeCover.src = data.image_path;
      episodeCover.alt = `${data.show_name} Cover Art`;
    }

    if (randomFactEl && data.random_fact) {
      randomFactEl.textContent = data.random_fact;
    }

    // Update page title
    if (data.title && data.show_name) {
      document.title = `${data.title} - ${data.show_name} | McElroy Radio`;
    }
  }

  // Update progress bar and time display
  function updateProgress() {
    if (!audioPlayer || !currentTimeEl) return;

    const currentTime = audioPlayer.currentTime;
    const duration = audioPlayer.duration;

    if (currentTimeEl) {
      currentTimeEl.textContent = formatTime(currentTime);
    }

    if (duration && progressBar && !isNaN(duration)) {
      const progressPercent = (currentTime / duration) * 100;
      progressBar.style.width = `${Math.min(progressPercent, 100)}%`;
    }
  }

  function startProgressUpdates() {
    if (progressUpdateInterval) return;
    progressUpdateInterval = setInterval(() => {
      updateProgress();
    }, 1000);
  }

  function stopProgressUpdates() {
    if (progressUpdateInterval) {
      clearInterval(progressUpdateInterval);
      progressUpdateInterval = null;
    }
  }

  function showNotification(message, type = "info") {
    let notification = document.getElementById("stream-notification");
    if (!notification) {
      notification = document.createElement("div");
      notification.id = "stream-notification";
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

  function formatTime(seconds) {
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

  function togglePlay() {
    if (!audioPlayer || !isStreamReady) return;

    if (isPlaying) {
      audioPlayer.pause();
      console.log("Paused");
    } else {
      if (isMuted) {
        showNotification("Click the volume button to unmute audio");
      }

      if (!audioPlayer.src || audioPlayer.readyState === 0) {
        initializeAudio();
        return;
      }

      const playPromise = audioPlayer.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            console.log("Playing");
          })
          .catch((error) => {
            console.error("Play failed:", error);
            showNotification(
              "Playback failed. Please try refreshing the page.",
              "error",
            );
          });
      }
    }
  }

  function rewind(seconds = 15) {
    if (audioPlayer && audioPlayer.currentTime > seconds) {
      audioPlayer.currentTime = Math.max(0, audioPlayer.currentTime - seconds);
      console.log(`Rewound ${seconds} seconds`);
    }
  }

  function toggleVolumeDisplay() {
    if (!volumeContainer) return;

    if (volumeContainer.style.display === "block") {
      volumeContainer.style.display = "none";
    } else {
      volumeContainer.style.display = "block";
    }
  }

  function toggleMute() {
    if (!audioPlayer) return;

    if (isMuted) {
      audioPlayer.volume = lastVolumeLevel;
      audioPlayer.muted = false;
      if (volumeIcon) {
        volumeIcon.classList.remove("fa-volume-mute");
        volumeIcon.classList.add("fa-volume-up");
      }
      if (volumeSlider) {
        volumeSlider.value = lastVolumeLevel * 100;
      }
      console.log("Unmuted");
    } else {
      lastVolumeLevel = audioPlayer.volume;
      audioPlayer.volume = 0;
      audioPlayer.muted = true;
      if (volumeIcon) {
        volumeIcon.classList.remove("fa-volume-up");
        volumeIcon.classList.add("fa-volume-mute");
      }
      if (volumeSlider) {
        volumeSlider.value = 0;
      }
      console.log("Muted");
    }
    isMuted = !isMuted;
  }

  function setVolume() {
    if (!audioPlayer || !volumeSlider) return;

    const newVolume = volumeSlider.value / 100;
    audioPlayer.volume = newVolume;

    if (newVolume === 0) {
      if (!isMuted) {
        isMuted = true;
        if (volumeIcon) {
          volumeIcon.classList.remove("fa-volume-up");
          volumeIcon.classList.add("fa-volume-mute");
        }
        audioPlayer.muted = true;
      }
    } else {
      if (isMuted) {
        isMuted = false;
        if (volumeIcon) {
          volumeIcon.classList.remove("fa-volume-mute");
          volumeIcon.classList.add("fa-volume-up");
        }
        audioPlayer.muted = false;
      }
    }
  }

  function getRandomFact() {
    fetch("/random-fact")
      .then((response) => response.json())
      .then((data) => {
        if (randomFactEl && data.fact) {
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
      {
        text: "Glass shark, glass shark. He love the fat kid.",
        author: "Justin McElroy",
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
    if (!radioQuote) return;

    const quote = getRandomQuote();
    radioQuote.innerHTML = `"${quote.text}"<footer>— ${quote.author}</footer>`;
  }

  // Event Listeners
  if (playBtn) playBtn.addEventListener("click", togglePlay);
  if (rewindBtn) rewindBtn.addEventListener("click", () => rewind());
  if (volumeBtn) {
    volumeBtn.addEventListener("click", toggleVolumeDisplay);
    volumeBtn.addEventListener("dblclick", toggleMute);
  }
  if (volumeSlider) volumeSlider.addEventListener("input", setVolume);
  if (newFactBtn) newFactBtn.addEventListener("click", getRandomFact);
  if (skipLoadingBtn) {
    skipLoadingBtn.addEventListener("click", () => {
      console.log("User clicked skip loading");
      setStreamReady(true);
      showNotification("Loading skipped - click play to start");
    });
  }

  // Initialize episode checking
  checkForNewEpisode();
  const episodeCheckInterval = setInterval(checkForNewEpisode, 30000);

  // Update the radio quote periodically
  updateRadioQuote();
  const quoteInterval = setInterval(updateRadioQuote, 60000);

  // Initialize the audio after a short delay
  setTimeout(() => {
    initializeAudio();
  }, 1000);

  // Close volume slider when clicking outside
  document.addEventListener("click", function (event) {
    if (
      volumeBtn &&
      volumeContainer &&
      !volumeBtn.contains(event.target) &&
      !volumeContainer.contains(event.target)
    ) {
      volumeContainer.style.display = "none";
    }
  });

  // Keyboard shortcuts
  document.addEventListener("keydown", function (event) {
    if (event.target.matches("input, textarea")) return;

    switch (event.code) {
      case "Space":
        event.preventDefault();
        togglePlay();
        break;
      case "ArrowLeft":
        event.preventDefault();
        rewind();
        break;
      case "ArrowUp":
        event.preventDefault();
        if (volumeSlider && !volumeSlider.disabled) {
          volumeSlider.value = Math.min(100, parseInt(volumeSlider.value) + 5);
          setVolume();
        }
        break;
      case "ArrowDown":
        event.preventDefault();
        if (volumeSlider && !volumeSlider.disabled) {
          volumeSlider.value = Math.max(0, parseInt(volumeSlider.value) - 5);
          setVolume();
        }
        break;
      case "KeyM":
        event.preventDefault();
        toggleMute();
        break;
    }
  });

  // Handle page visibility changes
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && isPlaying) {
      // Page became visible, check if we need to resync
      setTimeout(checkForNewEpisode, 1000);
    }
  });

  // Cleanup on page unload
  window.addEventListener("beforeunload", function () {
    if (episodeCheckInterval) clearInterval(episodeCheckInterval);
    if (quoteInterval) clearInterval(quoteInterval);
    if (progressUpdateInterval) clearInterval(progressUpdateInterval);
    if (loadingTimeout) clearTimeout(loadingTimeout);
  });

  // Handle network connectivity changes
  window.addEventListener("online", function () {
    console.log("Network connection restored");
    if (!isStreamReady) {
      showNotification("Connection restored. Reconnecting...", "success");
      setTimeout(initializeAudio, 1000);
    }
  });

  window.addEventListener("offline", function () {
    console.log("Network connection lost");
    showNotification("Connection lost. Playback may be interrupted.", "error");
  });
});
