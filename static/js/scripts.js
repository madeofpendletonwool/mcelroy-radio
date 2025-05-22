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

  // Random fact elements
  const randomFactEl = document.getElementById("random-fact");
  const newFactBtn = document.getElementById("new-fact-btn");

  // Radio quote element
  const radioQuote = document.getElementById("radio-quote");

  // Initialize player state
  let isPlaying = false;
  let isMuted = false; // Start unmuted since user will click to play
  let volumeLevel = 0.8;
  let lastVolumeLevel = volumeLevel;
  let currentEpisodeId = null;
  let progressUpdateInterval = null;

  // Set initial state for audio
  if (audioPlayer) {
    audioPlayer.volume = volumeLevel; // Start at normal volume
    audioPlayer.muted = false; // Start unmuted
    audioPlayer.preload = "metadata"; // Load metadata for duration

    // Set up audio event listeners
    audioPlayer.addEventListener("loadstart", () => {
      console.log("Audio load started");
    });

    audioPlayer.addEventListener("loadedmetadata", () => {
      console.log("Audio metadata loaded");
      if (audioPlayer.duration && durationEl) {
        durationEl.textContent = formatTime(audioPlayer.duration);
      }
    });

    audioPlayer.addEventListener("canplay", () => {
      console.log("Audio can play");
    });

    audioPlayer.addEventListener("play", () => {
      isPlaying = true;
      if (playIcon) {
        playIcon.classList.remove("fa-play");
        playIcon.classList.add("fa-pause");
      }
      startProgressUpdates();
      console.log("Audio started playing");
    });

    audioPlayer.addEventListener("pause", () => {
      isPlaying = false;
      if (playIcon) {
        playIcon.classList.remove("fa-pause");
        playIcon.classList.add("fa-play");
      }
      stopProgressUpdates();
      console.log("Audio paused");
    });

    audioPlayer.addEventListener("timeupdate", () => {
      updateProgress();
    });

    audioPlayer.addEventListener("error", (e) => {
      console.error("Audio error:", e);
      isPlaying = false;
      stopProgressUpdates();

      // Show user-friendly error message
      showNotification("Audio playback error. Please try refreshing the page.");
    });

    audioPlayer.addEventListener("stalled", () => {
      console.warn("Audio stream stalled - buffering");
    });

    audioPlayer.addEventListener("waiting", () => {
      console.log("Audio waiting for data - buffering");
    });

    audioPlayer.addEventListener("ended", () => {
      console.log("Audio stream ended");
      isPlaying = false;
      stopProgressUpdates();
      // The radio should continue with the next episode automatically
      setTimeout(checkForNewEpisode, 2000);
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

  // Initialize the audio source and sync with server position
  function initializeAudio() {
    if (!audioPlayer) return;

    // Get current server position first
    fetch("/stream-position")
      .then((response) => response.json())
      .then((data) => {
        const serverTimePosition = data.time_position || 0;

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
              // Make sure we don't seek past the end
              const seekPosition = Math.min(
                serverTimePosition,
                audioPlayer.duration - 1,
              );
              console.log("Seeking to position:", seekPosition, "seconds");
              audioPlayer.currentTime = seekPosition;
            }

            // Try autoplay (will be muted due to browser policies)
            const playPromise = audioPlayer.play();
            if (playPromise !== undefined) {
              playPromise
                .then(() => {
                  console.log("Autoplay started successfully");
                  showNotification(
                    "McElroy Radio playing (click volume to unmute)",
                  );
                })
                .catch((error) => {
                  console.log("Autoplay prevented by browser:", error.message);
                  showNotification("Click the play button to start listening");
                });
            }
          };

          if (audioPlayer.readyState >= 1) {
            // Metadata already loaded
            handleLoadedMetadata();
          } else {
            // Wait for metadata to load
            audioPlayer.addEventListener(
              "loadedmetadata",
              handleLoadedMetadata,
            );
          }
        }
      })
      .catch((error) => {
        console.error("Failed to get server position:", error);
        // Fallback to normal initialization
        const streamUrl = `/stream?t=${Date.now()}`;
        audioPlayer.src = streamUrl;
        audioPlayer.play().catch(console.error);
      });
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

          // Update the audio source for the new episode
          const streamUrl = `/stream?t=${Date.now()}`;
          audioPlayer.src = streamUrl;

          // Reset to beginning for new episodes
          audioPlayer.currentTime = 0;

          // If we were playing, continue playing the new episode
          if (isPlaying) {
            audioPlayer.play().catch(console.error);
          }
        } else if (data.id === currentEpisodeId) {
          // Same episode - sync position if we're significantly off
          const serverTime = data.time_position || 0;
          const clientTime = audioPlayer.currentTime || 0;
          const timeDiff = Math.abs(serverTime - clientTime);

          // If we're more than 10 seconds off, resync
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

        // Update UI with episode info
        updateUIWithEpisodeData(data);
      })
      .catch((err) => {
        console.error("Error checking for new episode:", err);
      });
  }

  // Update UI with episode data
  function updateUIWithEpisodeData(data) {
    if (randomFactEl && data.random_fact) {
      randomFactEl.textContent = data.random_fact;
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

  // Start regular progress updates
  function startProgressUpdates() {
    if (progressUpdateInterval) return;

    progressUpdateInterval = setInterval(() => {
      updateProgress();
    }, 1000);
  }

  // Stop progress updates
  function stopProgressUpdates() {
    if (progressUpdateInterval) {
      clearInterval(progressUpdateInterval);
      progressUpdateInterval = null;
    }
  }

  // Show temporary notification
  function showNotification(message) {
    let notification = document.getElementById("stream-notification");
    if (!notification) {
      notification = document.createElement("div");
      notification.id = "stream-notification";
      notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 10px 20px;
        background: rgba(94, 96, 206, 0.9);
        color: white;
        border-radius: 5px;
        z-index: 1000;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        font-family: inherit;
        font-size: 14px;
        max-width: 300px;
      `;
      document.body.appendChild(notification);
    }

    notification.textContent = message;
    notification.style.display = "block";

    // Hide after 5 seconds
    setTimeout(() => {
      notification.style.display = "none";
    }, 5000);
  }

  // Format time from seconds to MM:SS or HH:MM:SS
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

  // Play/Pause toggle
  function togglePlay() {
    if (!audioPlayer) return;

    if (isPlaying) {
      audioPlayer.pause();
      console.log("Paused");
    } else {
      // If it's the first play and we're muted, show unmute hint
      if (isMuted) {
        showNotification("Click the volume button to unmute audio");
      }

      // If we don't have a source or the audio isn't ready, initialize first
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
            );
          });
      }
    }
  }

  // Rewind functionality
  function rewind() {
    if (audioPlayer && audioPlayer.currentTime > 15) {
      audioPlayer.currentTime = Math.max(0, audioPlayer.currentTime - 15);
      console.log("Rewound 15 seconds");
    }
  }

  // Toggle volume display
  function toggleVolumeDisplay() {
    if (!volumeContainer) return;

    if (volumeContainer.style.display === "block") {
      volumeContainer.style.display = "none";
    } else {
      volumeContainer.style.display = "block";
    }
  }

  // Toggle mute
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

  // Set volume
  function setVolume() {
    if (!audioPlayer || !volumeSlider) return;

    const newVolume = volumeSlider.value / 100;
    audioPlayer.volume = newVolume;

    // Update mute state if needed
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

  // Get a random fact (from server)
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

  // Get a random quote
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

  // Update the radio quote
  function updateRadioQuote() {
    if (!radioQuote) return;

    const quote = getRandomQuote();
    radioQuote.innerHTML = `"${quote.text}"<footer>— ${quote.author}</footer>`;
  }

  // Event Listeners
  if (playBtn) playBtn.addEventListener("click", togglePlay);
  if (rewindBtn) rewindBtn.addEventListener("click", rewind);
  if (volumeBtn) {
    volumeBtn.addEventListener("click", toggleVolumeDisplay);
    volumeBtn.addEventListener("dblclick", toggleMute);
  }
  if (volumeSlider) volumeSlider.addEventListener("input", setVolume);
  if (newFactBtn) newFactBtn.addEventListener("click", getRandomFact);

  // Initialize episode checking
  checkForNewEpisode();
  const episodeCheckInterval = setInterval(checkForNewEpisode, 30000); // Check every 30 seconds

  // Update the radio quote periodically
  updateRadioQuote();
  const quoteInterval = setInterval(updateRadioQuote, 60000); // Every minute

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
    // Don't interfere with input fields
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
        if (volumeSlider) {
          volumeSlider.value = Math.min(100, parseInt(volumeSlider.value) + 5);
          setVolume();
        }
        break;
      case "ArrowDown":
        event.preventDefault();
        if (volumeSlider) {
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

  // Cleanup on page unload
  window.addEventListener("beforeunload", function () {
    if (episodeCheckInterval) clearInterval(episodeCheckInterval);
    if (quoteInterval) clearInterval(quoteInterval);
    if (progressUpdateInterval) clearInterval(progressUpdateInterval);
  });
});
