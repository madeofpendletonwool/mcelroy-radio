package player

import (
	"io"
	"os"
	"sync"
	"time"

	"github.com/madeofpendletonwool/mcelroy-radio/internal/storage"
)

// RadioPlayer manages the streaming of audio content
type RadioPlayer struct {
	fileStore         *storage.FileStore
	currentFile       *os.File
	currentPosition   int64
	listeners         map[string]chan []byte
	listenersMutex    sync.RWMutex
	isPlaying         bool
	bufferSize        int
	episodeEndTimeout time.Duration
}

// New creates a new radio player
func New(fileStore *storage.FileStore) (*RadioPlayer, error) {
	player := &RadioPlayer{
		fileStore:         fileStore,
		listeners:         make(map[string]chan []byte),
		bufferSize:        4096, // 4KB buffer
		episodeEndTimeout: 5 * time.Second,
	}

	// Start the playback routine
	go player.playbackLoop()

	return player, nil
}

// playbackLoop continuously plays episodes
func (p *RadioPlayer) playbackLoop() {
	for {
		// Get current episode
		episode := p.fileStore.GetCurrentEpisode()
		if episode == nil {
			time.Sleep(1 * time.Second)
			continue
		}

		// Open the file
		file, err := os.Open(episode.AudioPath)
		if err != nil {
			// Log error and try the next episode
			time.Sleep(1 * time.Second)
			p.fileStore.AdvanceToNextEpisode()
			continue
		}

		// Set current file and reset position
		p.currentFile = file
		p.currentPosition = 0
		p.isPlaying = true

		// Read and broadcast the file
		buffer := make([]byte, p.bufferSize)
		for p.isPlaying {
			n, err := file.Read(buffer)
			if err != nil {
				if err == io.EOF {
					// End of file reached, move to next episode
					time.Sleep(p.episodeEndTimeout) // Small pause between episodes
					p.fileStore.AdvanceToNextEpisode()
					break
				}
				// Some other error occurred
				break
			}

			// Update position
			p.currentPosition += int64(n)

			// Broadcast to all listeners
			p.broadcastToListeners(buffer[:n])

			// Throttle to simulate real-time playback
			// This is a simplification; real streaming would use proper audio rates
			time.Sleep(100 * time.Millisecond)
		}

		// Close the file
		file.Close()
		p.currentFile = nil
	}
}

// broadcastToListeners sends data to all connected listeners
func (p *RadioPlayer) broadcastToListeners(data []byte) {
	p.listenersMutex.RLock()
	defer p.listenersMutex.RUnlock()

	for _, ch := range p.listeners {
		// Non-blocking send to avoid slow listeners blocking others
		select {
		case ch <- data:
			// Data sent successfully
		default:
			// Channel is full, skip this send
		}
	}
}

// AddListener adds a new listener and returns a channel for streaming
func (p *RadioPlayer) AddListener(id string) chan []byte {
	p.listenersMutex.Lock()
	defer p.listenersMutex.Unlock()

	// Create buffered channel for this listener
	ch := make(chan []byte, 10) // Buffer up to 10 chunks
	p.listeners[id] = ch

	return ch
}

// RemoveListener removes a listener
func (p *RadioPlayer) RemoveListener(id string) {
	p.listenersMutex.Lock()
	defer p.listenersMutex.Unlock()

	if ch, exists := p.listeners[id]; exists {
		close(ch)
		delete(p.listeners, id)
	}
}

// GetCurrentPosition returns the current playback position
func (p *RadioPlayer) GetCurrentPosition() int64 {
	return p.currentPosition
}
