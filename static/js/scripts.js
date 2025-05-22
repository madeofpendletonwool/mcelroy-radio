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
  let isMuted = true; // Start muted to allow autoplay
  let volumeLevel = 0.8;
  let lastVolumeLevel = volumeLevel;
  let streamStartTime = 0;
  let serverTimeOffset = 0;
  let isFirstPlay = true;
  let reconnectAttempts = 0;
  let maxReconnectAttempts = 5;
  let reconnectDelay = 1000; // Start with 1 second

  // Set initial state for audio
  if (audioPlayer) {
    audioPlayer.volume = 0; // Start muted for autoplay compliance
    audioPlayer.muted = true;
    audioPlayer.preload = "none"; // Don't preload for streaming
  }

  if (volumeSlider) {
    volumeSlider.value = volumeLevel * 100;
  }

  // Initialize streaming connection
  function initializeStream() {
    console.log("Initializing stream...");

    // Reset the audio source to force a new connection
    if (audioPlayer) {
      // Add timestamp to prevent caching
      const streamUrl = `/stream?t=${Date.now()}`;
      audioPlayer.src = streamUrl;

      // Get current position from server
      fetch("/stream-position")
        .then((response) => response.json())
        .then((data) => {
          console.log("Stream position data:", data);
          streamStartTime = data.position || 0;
          serverTimeOffset =
            (data.timestamp || 0) - Math.floor(Date.now() / 1000);

          // Load the new source
          audioPlayer.load();

          // Attempt autoplay (will be muted due to browser policies)
          return audioPlayer.play();
        })
        .then(() => {
          console.log("Autoplay started successfully");
          isPlaying = true;
          reconnectAttempts = 0; // Reset on successful connection

          if (playIcon) {
            playIcon.classList.remove("fa-play");
            playIcon.classList.add("fa-pause");
          }

          // Show notification about unmuting
          showNotification("McElroy Radio playing (click volume to unmute)");
        })
        .catch((error) => {
          console.error("Stream initialization failed:", error);
          isPlaying = false;

          // Try to reconnect if we haven't exceeded max attempts
          if (reconnectAttempts < maxReconnectAttempts) {
            reconnectAttempts++;
            console.log(
              `Reconnection attempt ${reconnectAttempts}/${maxReconnectAttempts} in ${reconnectDelay}ms`,
            );
            setTimeout(initializeStream, reconnectDelay);
            reconnectDelay = Math.min(reconnectDelay * 2, 10000); // Exponential backoff, max 10 seconds
          } else {
            showNotification(
              "Unable to connect to stream. Please refresh the page.",
            );
          }
        });
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

  // Update now playing info and progress
  function updateNowPlaying() {
    fetch("/now-playing")
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((data) => {
        console.log("Now playing data:", data);

        // Update UI with current episode info
        if (randomFactEl && data.random_fact) {
          randomFactEl.textContent = data.random_fact;
        }

        // Update time display based on server position
        if (data.time_position && currentTimeEl) {
          currentTimeEl.textContent = formatTime(data.time_position);
        }

        // Update duration if available
        if (data.duration && durationEl && data.duration > 0) {
          durationEl.textContent = formatTime(data.duration);
        }

        // Update progress bar
        if (
          data.time_position &&
          data.duration &&
          progressBar &&
          data.duration > 0
        ) {
          const progressPercent = (data.time_position / data.duration) * 100;
          progressBar.style.width = `${Math.min(progressPercent, 100)}%`;
        }
      })
      .catch((err) => {
        console.error("Error fetching now playing info:", err);
      });
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
      if (playIcon) {
        playIcon.classList.remove("fa-pause");
        playIcon.classList.add("fa-play");
      }
      isPlaying = false;
      console.log("Paused");
    } else {
      // If it's the first play and we're muted, show unmute hint
      if (isMuted && isFirstPlay) {
        showNotification("Click the volume button to unmute audio");
      }

      const playPromise = audioPlayer.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            if (playIcon) {
              playIcon.classList.remove("fa-play");
              playIcon.classList.add("fa-pause");
            }
            isPlaying = true;
            isFirstPlay = false;
            console.log("Playing");
          })
          .catch((error) => {
            console.error("Play failed:", error);
            showNotification("Playback failed. Try refreshing the page.");
          });
      }
    }
  }

  // Rewind functionality (note: this just seeks in the client buffer, not the server stream)
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

  // Audio player events
  if (audioPlayer) {
    audioPlayer.addEventListener("loadstart", () => {
      console.log("Started loading stream");
    });

    audioPlayer.addEventListener("canplay", () => {
      console.log("Stream can play");
    });

    audioPlayer.addEventListener("play", () => {
      isPlaying = true;
      if (playIcon) {
        playIcon.classList.remove("fa-play");
        playIcon.classList.add("fa-pause");
      }
      console.log("Audio started playing");
    });

    audioPlayer.addEventListener("pause", () => {
      isPlaying = false;
      if (playIcon) {
        playIcon.classList.remove("fa-pause");
        playIcon.classList.add("fa-play");
      }
      console.log("Audio paused");
    });

    audioPlayer.addEventListener("error", (e) => {
      console.error("Audio error:", e);
      isPlaying = false;

      // Try to reconnect after error
      if (reconnectAttempts < maxReconnectAttempts) {
        console.log("Attempting to reconnect due to audio error...");
        setTimeout(initializeStream, 3000);
      } else {
        showNotification("Audio stream error. Please refresh the page.");
      }
    });

    audioPlayer.addEventListener("stalled", () => {
      console.warn("Audio stream stalled");
    });

    audioPlayer.addEventListener("waiting", () => {
      console.log("Audio waiting for data");
    });
  }

  // Update episode info on page load and periodically
  updateNowPlaying();
  const nowPlayingInterval = setInterval(updateNowPlaying, 15000); // Every 15 seconds

  // Update the radio quote periodically
  updateRadioQuote();
  const quoteInterval = setInterval(updateRadioQuote, 60000); // Every minute

  // Initialize the stream
  initializeStream();

  // Add visibility change handler to reconnect when user returns to tab
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && !isPlaying) {
      console.log("Page became visible, attempting to reconnect...");
      initializeStream();
    }
  });

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
    if (nowPlayingInterval) clearInterval(nowPlayingInterval);
    if (quoteInterval) clearInterval(quoteInterval);
  });
});
