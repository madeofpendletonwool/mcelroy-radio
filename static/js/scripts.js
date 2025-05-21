document.addEventListener("DOMContentLoaded", function () {
  // Player elements
  const audioPlayer = document.getElementById("audio-stream");

  // Check if elements exist before accessing them
  // This prevents errors when elements are not found
  const playBtn = document.getElementById("play-btn");
  const rewindBtn = document.getElementById("rewind-btn");
  const volumeBtn = document.getElementById("volume-btn");
  const volumeSlider = document.getElementById("volume-slider");
  const volumeContainer = document.getElementById("volume-slider-container");
  const progressBar = document.getElementById("progress");
  const currentTimeEl = document.getElementById("current-time");
  const durationEl = document.getElementById("duration");
  const randomFactEl = document.getElementById("random-fact");
  const newFactBtn = document.getElementById("new-fact-btn");
  const radioQuote = document.getElementById("radio-quote");

  // If audio player doesn't exist, exit early
  if (!audioPlayer) {
    console.warn(
      "Audio player element not found. Exiting player initialization.",
    );
    return;
  }

  let playIcon = null;
  let volumeIcon = null;

  // Safely get child elements
  if (playBtn) {
    playIcon = playBtn.querySelector("i");
  }

  if (volumeBtn) {
    volumeIcon = volumeBtn.querySelector("i");
  }

  // Quotes collection
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

  // McElroy fun facts
  const funFacts = [
    "Griffin McElroy once defeated a mountain lion using only his dulcet tones.",
    "Justin McElroy knows the secret recipe for KFC, but he's sworn to secrecy.",
    "Travis McElroy's beard contains the wisdom of a thousand wizards.",
    "The McElroy brothers once saved Christmas using only a podcast mic and three bottles of La Croix.",
    "Griffin's laugh can cure the common cold if heard at precisely the right frequency.",
    "Justin invented a new color, but only dogs can see it.",
    "Travis has never once, in his entire life, sneezed.",
    "The McElroys completed a speedrun of friendship in record time.",
    "Griffin can communicate with horses, but only about tax policy.",
    "Justin's collection of Garfield memorabilia has its own zip code.",
    "Travis once arm-wrestled the concept of Tuesday and won.",
    "The brothers share a single dream every third Wednesday of the month.",
    "Griffin's singing voice can summon exactly four (4) ducks, no more, no less.",
    "Justin can identify any cereal by taste while blindfolded.",
    "Travis has a secret handshake with the moon.",
    "The McElroys collectively hold the world record for most uses of the word 'cronch' in a single podcast.",
    "Griffin's final form includes wings and a really cool hat.",
    "Justin can speak backwards, but only when discussing maritime law.",
    "Travis once built a functioning time machine out of podcast merch.",
    "The brothers can perform a perfect three-part harmony, but only when no one is recording.",
  ];

  // Initialize player state
  let isPlaying = false;
  let isMuted = false;
  let volumeLevel = 0.8; // 0-1

  // Store the last volume level before muting
  let lastVolumeLevel = volumeLevel;

  // Set initial volume if audioPlayer exists
  if (audioPlayer) {
    audioPlayer.volume = volumeLevel;
  }

  if (volumeSlider) {
    volumeSlider.value = volumeLevel * 100;
  }

  // Update now playing info and progress
  function updateNowPlaying() {
    fetch("/now-playing")
      .then((response) => response.json())
      .then((data) => {
        console.log("Now playing:", data);
        // Update UI with current episode info if needed
        // Could update title, show name, image, etc.
      })
      .catch((err) => console.error("Error fetching now playing info:", err));
  }

  // Format time from seconds to MM:SS
  function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
  }

  // Update progress bar and time display
  function updateProgress() {
    if (audioPlayer && audioPlayer.duration) {
      const percent = (audioPlayer.currentTime / audioPlayer.duration) * 100;
      if (progressBar) {
        progressBar.style.width = `${percent}%`;
      }
      if (currentTimeEl) {
        currentTimeEl.textContent = formatTime(audioPlayer.currentTime);
      }
      if (durationEl) {
        durationEl.textContent = formatTime(audioPlayer.duration);
      }
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
    } else {
      audioPlayer.play().catch((err) => {
        console.error("Error playing audio:", err);
      });
      if (playIcon) {
        playIcon.classList.remove("fa-play");
        playIcon.classList.add("fa-pause");
      }
    }
    isPlaying = !isPlaying;
  }

  // Rewind 15 seconds
  function rewind() {
    if (!audioPlayer) return;
    audioPlayer.currentTime = Math.max(0, audioPlayer.currentTime - 15);
    updateProgress();
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
    if (!audioPlayer || !volumeIcon) return;

    if (isMuted) {
      audioPlayer.volume = lastVolumeLevel;
      volumeIcon.classList.remove("fa-volume-mute");
      volumeIcon.classList.add("fa-volume-up");
      if (volumeSlider) {
        volumeSlider.value = lastVolumeLevel * 100;
      }
    } else {
      lastVolumeLevel = audioPlayer.volume;
      audioPlayer.volume = 0;
      volumeIcon.classList.remove("fa-volume-up");
      volumeIcon.classList.add("fa-volume-mute");
      if (volumeSlider) {
        volumeSlider.value = 0;
      }
    }
    isMuted = !isMuted;
  }

  // Set volume
  function setVolume() {
    if (!audioPlayer || !volumeSlider) return;

    const newVolume = volumeSlider.value / 100;
    audioPlayer.volume = newVolume;

    // Update mute state if needed
    if (!volumeIcon) return;

    if (newVolume === 0) {
      if (!isMuted) {
        isMuted = true;
        volumeIcon.classList.remove("fa-volume-up");
        volumeIcon.classList.add("fa-volume-mute");
      }
    } else {
      if (isMuted) {
        isMuted = false;
        volumeIcon.classList.remove("fa-volume-mute");
        volumeIcon.classList.add("fa-volume-up");
      }
    }
  }

  // Get a random fact
  function getRandomFact() {
    const index = Math.floor(Math.random() * funFacts.length);
    return funFacts[index];
  }

  // Get a random quote
  function getRandomQuote() {
    const index = Math.floor(Math.random() * quotes.length);
    return quotes[index];
  }

  // Update the random fact
  function updateRandomFact() {
    if (!randomFactEl) return;

    const fact = getRandomFact();
    randomFactEl.textContent = fact;

    // Add a little animation
    randomFactEl.style.opacity = "0";
    setTimeout(() => {
      randomFactEl.style.opacity = "1";
    }, 300);
  }

  // Update the radio quote
  function updateRadioQuote() {
    if (!radioQuote) return;

    const quote = getRandomQuote();
    radioQuote.innerHTML = `
            "${quote.text}"
            <footer>— ${quote.author}</footer>
        `;
  }

  // Add event listeners only if elements exist
  if (playBtn) {
    playBtn.addEventListener("click", togglePlay);
  }

  if (rewindBtn) {
    rewindBtn.addEventListener("click", rewind);
  }

  if (volumeBtn) {
    volumeBtn.addEventListener("click", toggleVolumeDisplay);
    volumeBtn.addEventListener("dblclick", toggleMute);
  }

  if (volumeSlider) {
    volumeSlider.addEventListener("input", setVolume);
  }

  if (newFactBtn) {
    newFactBtn.addEventListener("click", updateRandomFact);
  }

  // Audio player events
  if (audioPlayer) {
    audioPlayer.addEventListener("timeupdate", updateProgress);
    audioPlayer.addEventListener("loadedmetadata", updateProgress);
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
  }

  // Periodically update now playing info if we're on a page with the player
  if (audioPlayer) {
    setInterval(updateNowPlaying, 30000); // Every 30 seconds

    // Initial update
    updateNowPlaying();
  }

  // Periodically update the radio quote if it exists
  if (radioQuote) {
    setInterval(updateRadioQuote, 60000); // Every minute

    // Initial update
    updateRadioQuote();
  }

  // Close volume slider when clicking outside
  if (volumeBtn && volumeContainer) {
    document.addEventListener("click", function (event) {
      if (
        !volumeBtn.contains(event.target) &&
        !volumeContainer.contains(event.target)
      ) {
        volumeContainer.style.display = "none";
      }
    });
  }

  // Keyboard shortcuts (only if audioPlayer exists)
  if (audioPlayer) {
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
      if (volumeSlider) {
        if (event.code === "ArrowUp") {
          volumeSlider.value = Math.min(100, parseInt(volumeSlider.value) + 5);
          setVolume();
        }
        if (event.code === "ArrowDown") {
          volumeSlider.value = Math.max(0, parseInt(volumeSlider.value) - 5);
          setVolume();
        }
      }

      // M for mute
      if (event.code === "KeyM") {
        toggleMute();
      }
    });
  }

  // Debug output
  console.log("McElroy Radio player initialized");
  if (audioPlayer) {
    console.log("Audio source:", audioPlayer.src);
  } else {
    console.warn("Audio player element not found");
  }
});
