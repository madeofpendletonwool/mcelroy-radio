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

  // Set initial volume
  audioPlayer.volume = volumeLevel;
  volumeSlider.value = volumeLevel * 100;

  // Update now playing info and progress
  function updateNowPlaying() {
    fetch("/now-playing")
      .then((response) => response.json())
      .then((data) => {
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
    if (audioPlayer.duration) {
      const percent = (audioPlayer.currentTime / audioPlayer.duration) * 100;
      progressBar.style.width = `${percent}%`;
      currentTimeEl.textContent = formatTime(audioPlayer.currentTime);
      durationEl.textContent = formatTime(audioPlayer.duration);
    }
  }

  // Play/Pause toggle
  function togglePlay() {
    if (isPlaying) {
      audioPlayer.pause();
      playIcon.classList.remove("fa-pause");
      playIcon.classList.add("fa-play");
    } else {
      audioPlayer.play();
      playIcon.classList.remove("fa-play");
      playIcon.classList.add("fa-pause");
    }
    isPlaying = !isPlaying;
  }

  // Rewind 15 seconds
  function rewind() {
    audioPlayer.currentTime = Math.max(0, audioPlayer.currentTime - 15);
    updateProgress();
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
      volumeIcon.classList.remove("fa-volume-mute");
      volumeIcon.classList.add("fa-volume-up");
      volumeSlider.value = lastVolumeLevel * 100;
    } else {
      lastVolumeLevel = audioPlayer.volume;
      audioPlayer.volume = 0;
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
    const quote = getRandomQuote();
    radioQuote.innerHTML = `
            "${quote.text}"
            <footer>— ${quote.author}</footer>
        `;
  }

  // Event Listeners
  playBtn.addEventListener("click", togglePlay);
  rewindBtn.addEventListener("click", rewind);
  volumeBtn.addEventListener("click", toggleVolumeDisplay);
  volumeBtn.addEventListener("dblclick", toggleMute);
  volumeSlider.addEventListener("input", setVolume);
  newFactBtn.addEventListener("click", updateRandomFact);

  // Audio player events
  audioPlayer.addEventListener("timeupdate", updateProgress);
  audioPlayer.addEventListener("loadedmetadata", updateProgress);
  audioPlayer.addEventListener("play", () => {
    isPlaying = true;
    playIcon.classList.remove("fa-play");
    playIcon.classList.add("fa-pause");
  });
  audioPlayer.addEventListener("pause", () => {
    isPlaying = false;
    playIcon.classList.remove("fa-pause");
    playIcon.classList.add("fa-play");
  });

  // Periodically update now playing info
  setInterval(updateNowPlaying, 30000); // Every 30 seconds

  // Periodically update the radio quote
  setInterval(updateRadioQuote, 60000); // Every minute

  // Initialize
  updateNowPlaying();
  updateRadioQuote();

  // Close volume slider when clicking outside
  document.addEventListener("click", function (event) {
    if (
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
    if (event.code === "ArrowUp") {
      volumeSlider.value = Math.min(100, parseInt(volumeSlider.value) + 5);
      setVolume();
    }
    if (event.code === "ArrowDown") {
      volumeSlider.value = Math.max(0, parseInt(volumeSlider.value) - 5);
      setVolume();
    }

    // M for mute
    if (event.code === "KeyM") {
      toggleMute();
    }
  });
});
