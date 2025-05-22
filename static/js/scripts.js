document.addEventListener("DOMContentLoaded", function () {
  // Player elements
  const audioPlayer = document.getElementById("audio-stream");
  const playBtn = document.getElementById("play-btn");
  const playIcon = playBtn.querySelector("i");
  const rewindBtn = document.getElementById("rewind-btn");
  const volumeBtn = document.getElementById("volume-btn");
  const volumeIcon = volumeBtn.querySelector("i");
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

  // Set initial state for audio
  audioPlayer.volume = 0; // Start muted for autoplay compliance
  audioPlayer.muted = true;
  volumeSlider.value = volumeLevel * 100;

  // Initialize streaming connection
  function initializeStream() {
    // Get current position from server
    fetch("/stream-position")
      .then((response) => response.json())
      .then((data) => {
        streamStartTime = data.position;
        serverTimeOffset = data.timestamp - Math.floor(Date.now() / 1000);

        // Only reload if not playing or on initial load
        if (!isPlaying || isFirstPlay) {
          audioPlayer.load();
          isFirstPlay = false;

          // Attempt autoplay (will be muted due to browser policies)
          const playPromise = audioPlayer.play();

          if (playPromise !== undefined) {
            playPromise
              .then(() => {
                isPlaying = true;
                playIcon.classList.remove("fa-play");
                playIcon.classList.add("fa-pause");

                // Show notification about unmuting
                showNotification(
                  "McElroy Radio playing (click volume to unmute)",
                );
              })
              .catch((error) => {
                console.error("Autoplay failed:", error);
                isPlaying = false;
              });
          }
        }
      })
      .catch((err) => {
        console.error("Error fetching stream position:", err);
      });
  }

  // Show temporary notification
  function showNotification(message) {
    let notification = document.getElementById("stream-notification");
    if (!notification) {
      notification = document.createElement("div");
      notification.id = "stream-notification";
      notification.style.position = "fixed";
      notification.style.top = "20px";
      notification.style.right = "20px";
      notification.style.padding = "10px 20px";
      notification.style.background = "rgba(94, 96, 206, 0.9)";
      notification.style.color = "white";
      notification.style.borderRadius = "5px";
      notification.style.zIndex = "1000";
      notification.style.boxShadow = "0 2px 10px rgba(0,0,0,0.2)";
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
      .then((response) => response.json())
      .then((data) => {
        // Update UI with current episode info
        if (randomFactEl && data.random_fact) {
          randomFactEl.textContent = data.random_fact;
        }

        // Update other episode info if needed
        // This could update title, show name, etc. based on your HTML structure
      })
      .catch((err) => console.error("Error fetching now playing info:", err));
  }

  // Format time from seconds to MM:SS
  function formatTime(seconds) {
    if (isNaN(seconds) || !isFinite(seconds)) {
      return "00:00";
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
  }

  // Update progress bar and time display for streaming
  function updateStreamProgress() {
    // For radio streams, we know current time but not duration
    if (audioPlayer.readyState > 0) {
      currentTimeEl.textContent = formatTime(audioPlayer.currentTime);

      // For streaming radio, use "--:--" for duration instead of NaN
      durationEl.textContent = "--:--";

      // Visual progress indicator (cycles every 5 minutes)
      const cycleTime = 300; // 5 minutes in seconds
      const streamProgress =
        ((audioPlayer.currentTime % cycleTime) / cycleTime) * 100;
      progressBar.style.width = `${streamProgress}%`;
    }
  }

  // Play/Pause toggle
  function togglePlay() {
    if (isPlaying) {
      audioPlayer.pause();
      playIcon.classList.remove("fa-pause");
      playIcon.classList.add("fa-play");
      isPlaying = false;
    } else {
      // If it's the first play, unmute
      if (isMuted && isFirstPlay) {
        toggleMute();
      }

      const playPromise = audioPlayer.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            playIcon.classList.remove("fa-play");
            playIcon.classList.add("fa-pause");
            isPlaying = true;
          })
          .catch((error) => {
            console.error("Play failed:", error);
          });
      }
    }
  }

  // Rewind 15 seconds (note: this is client-side only)
  function rewind() {
    audioPlayer.currentTime = Math.max(0, audioPlayer.currentTime - 15);
    updateStreamProgress();
  }

  // Toggle volume display
  function toggleVolumeDisplay() {
    if (volumeContainer.style.display === "block") {
      volumeContainer.style.display = "none";
    } else {
      volumeContainer.style.display = "block";
    }
  }

  // Toggle mute
  function toggleMute() {
    if (isMuted) {
      audioPlayer.volume = lastVolumeLevel;
      audioPlayer.muted = false;
      volumeIcon.classList.remove("fa-volume-mute");
      volumeIcon.classList.add("fa-volume-up");
      volumeSlider.value = lastVolumeLevel * 100;
    } else {
      lastVolumeLevel = audioPlayer.volume;
      audioPlayer.volume = 0;
      audioPlayer.muted = true;
      volumeIcon.classList.remove("fa-volume-up");
      volumeIcon.classList.add("fa-volume-mute");
      volumeSlider.value = 0;
    }
    isMuted = !isMuted;
  }

  // Set volume
  function setVolume() {
    const newVolume = volumeSlider.value / 100;
    audioPlayer.volume = newVolume;

    // Update mute state if needed
    if (newVolume === 0) {
      if (!isMuted) {
        isMuted = true;
        volumeIcon.classList.remove("fa-volume-up");
        volumeIcon.classList.add("fa-volume-mute");
        audioPlayer.muted = true;
      }
    } else {
      if (isMuted) {
        isMuted = false;
        volumeIcon.classList.remove("fa-volume-mute");
        volumeIcon.classList.add("fa-volume-up");
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
          randomFactEl.textContent = data.fact;

          // Add animation
          randomFactEl.style.opacity = "0";
          setTimeout(() => {
            randomFactEl.style.opacity = "1";
          }, 300);
        }
      })
      .catch((err) => console.error("Error getting random fact:", err));
  }

  // Get a random quote
  function getRandomQuote() {
    // Use your existing quotes collection
    const quotes = [
      {
        text: "Unless...",
        author: "Griffin McElroy",
      },
      {
        text: "I'm your dungeon master, your best friend, and your dungeon daddy, Griffin McElroy.",
        author: "Griffin McElroy",
      },
      {
        text: "Glass shark, glass shark. He love the fat kid.",
        author: "Justin McElroy",
      },
      {
        text: "Play with me in this space.",
        author: "Travis McElroy",
      },
      {
        text: "Hachi machi!",
        author: "Justin McElroy",
      },
      {
        text: "It's familiar, but not too familiar, but not too not familiar.",
        author: "Griffin McElroy",
      },
      {
        text: "I think dogs should vote!",
        author: "Justin McElroy",
      },
      {
        text: "Shrimp! Heaven! Now!",
        author: "Griffin McElroy",
      },
      {
        text: "It's your birth right!",
        author: "Travis McElroy",
      },
      {
        text: "Squad goals: touch the Skyrim.",
        author: "Griffin McElroy",
      },
    ];

    const index = Math.floor(Math.random() * quotes.length);
    return quotes[index];
  }

  // Update the radio quote
  function updateRadioQuote() {
    const quote = getRandomQuote();
    if (radioQuote) {
      radioQuote.innerHTML = `
        "${quote.text}"
        <footer>— ${quote.author}</footer>
      `;
    }
  }

  // Event Listeners
  if (playBtn) playBtn.addEventListener("click", togglePlay);
  if (rewindBtn) rewindBtn.addEventListener("click", rewind);
  if (volumeBtn) volumeBtn.addEventListener("click", toggleVolumeDisplay);
  if (volumeBtn) volumeBtn.addEventListener("dblclick", toggleMute);
  if (volumeSlider) volumeSlider.addEventListener("input", setVolume);
  if (newFactBtn) newFactBtn.addEventListener("click", getRandomFact);

  // Audio player events
  if (audioPlayer) {
    audioPlayer.addEventListener("timeupdate", updateStreamProgress);
    audioPlayer.addEventListener("loadedmetadata", updateStreamProgress);
    audioPlayer.addEventListener("play", () => {
      isPlaying = true;
      if (playIcon) {
        playIcon.classList.remove("fa-play");
        playIcon.classList.add("fa-pause");
      }
    });
    audioPlayer.addEventListener("pause", () => {
      isPlaying = false;
      if (playIcon) {
        playIcon.classList.remove("fa-pause");
        playIcon.classList.add("fa-play");
      }
    });

    // Add error handler
    audioPlayer.addEventListener("error", (e) => {
      console.error("Audio playback error:", e);
      // Try to reconnect after error
      setTimeout(initializeStream, 3000);
    });
  }

  // Update episode info on page load and periodically
  updateNowPlaying();
  setInterval(updateNowPlaying, 15000); // Every 15 seconds

  // Update the radio quote periodically
  updateRadioQuote();
  setInterval(updateRadioQuote, 60000); // Every minute

  // Initialize the stream
  initializeStream();

  // Add visibility change handler to reconnect when user returns to tab
  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && !isPlaying) {
      // Reconnect to stream if page becomes visible and player isn't playing
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
    // Space for play/pause
    if (event.code === "Space" && !event.target.matches("input, textarea")) {
      event.preventDefault();
      togglePlay();
    }

    // Left arrow for rewind
    if (event.code === "ArrowLeft") {
      rewind();
    }

    // Up/Down arrows for volume
    if (event.code === "ArrowUp" && volumeSlider) {
      volumeSlider.value = Math.min(100, parseInt(volumeSlider.value) + 5);
      setVolume();
    }
    if (event.code === "ArrowDown" && volumeSlider) {
      volumeSlider.value = Math.max(0, parseInt(volumeSlider.value) - 5);
      setVolume();
    }

    // M for mute
    if (event.code === "KeyM") {
      toggleMute();
    }
  });
});
