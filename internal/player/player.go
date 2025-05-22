package player

import (
	"fmt"
	"io"
	"log"
	"os"
	"sync"
	"time"

	"github.com/madeofpendletonwool/mcelroy-radio/internal/models"
	"github.com/madeofpendletonwool/mcelroy-radio/internal/storage"
)

// RadioPlayer manages the streaming of audio content
type RadioPlayer struct {
	fileStore           *storage.FileStore
	currentFile         *os.File
	currentPosition     int64
	currentEpisodeID    string
	listeners           map[string]chan []byte
	listenersMutex      sync.RWMutex
	isPlaying           bool
	isPaused            bool
	bufferSize          int
	episodeEndTimeout   time.Duration
	bytesPerSecond      int64 // For timing calculations
	streamStartTime     time.Time
	streamStartPosition int64
	playbackMutex       sync.RWMutex
}

// Listener represents a connected client
type Listener struct {
	ID         string
	DataChan   chan []byte
	JoinedAt   time.Time
	LastActive time.Time
}

// New creates a new radio player
func New(fileStore *storage.FileStore) (*RadioPlayer, error) {
	player := &RadioPlayer{
		fileStore:           fileStore,
		listeners:           make(map[string]chan []byte),
		bufferSize:          32768, // 32KB buffer for faster streaming
		episodeEndTimeout:   2 * time.Second,
		bytesPerSecond:      16000, // Approximate for MP3 128kbps
		streamStartTime:     time.Now(),
		streamStartPosition: 0,
	}

	// Start the playback routine
	go player.playbackLoop()
	go player.cleanupRoutine()

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

		// Check if we need to switch episodes
		if p.currentEpisodeID != episode.ID {
			log.Printf("Switching to new episode: %s", episode.Title)
			p.switchToEpisode(episode)
		}

		// If we don't have a current file, try to open it
		if p.currentFile == nil {
			if err := p.openCurrentEpisode(); err != nil {
				log.Printf("Error opening episode: %v", err)
				time.Sleep(5 * time.Second)
				p.fileStore.AdvanceToNextEpisode()
				continue
			}
		}

		// Read and broadcast audio data
		if err := p.streamAudioChunk(); err != nil {
			if err == io.EOF {
				log.Printf("Episode finished, advancing to next")
				p.closeCurrentFile()
				time.Sleep(p.episodeEndTimeout)
				p.fileStore.AdvanceToNextEpisode()
			} else {
				log.Printf("Streaming error: %v", err)
				p.closeCurrentFile()
				time.Sleep(1 * time.Second)
			}
		}
	}
}

// switchToEpisode prepares to switch to a new episode
func (p *RadioPlayer) switchToEpisode(episode *models.Episode) {
	p.playbackMutex.Lock()
	defer p.playbackMutex.Unlock()

	// Close current file if open
	p.closeCurrentFile()

	// Reset state for new episode
	p.currentEpisodeID = episode.ID
	p.currentPosition = 0
	p.streamStartTime = time.Now()
	p.streamStartPosition = 0
	p.isPlaying = false
}

// openCurrentEpisode opens the current episode file
func (p *RadioPlayer) openCurrentEpisode() error {
	episode := p.fileStore.GetCurrentEpisode()
	if episode == nil {
		return fmt.Errorf("no current episode")
	}

	file, err := os.Open(episode.AudioPath)
	if err != nil {
		return fmt.Errorf("failed to open audio file: %v", err)
	}

	p.playbackMutex.Lock()
	p.currentFile = file
	p.isPlaying = true
	p.isPaused = false
	p.playbackMutex.Unlock()

	log.Printf("Opened episode: %s", episode.Title)
	return nil
}

// streamAudioChunk reads and broadcasts a chunk of audio
func (p *RadioPlayer) streamAudioChunk() error {
	if p.currentFile == nil {
		return fmt.Errorf("no current file")
	}

	buffer := make([]byte, p.bufferSize)
	n, err := p.currentFile.Read(buffer)
	if err != nil {
		return err
	}

	// Update position
	p.playbackMutex.Lock()
	p.currentPosition += int64(n)
	p.playbackMutex.Unlock()

	// Broadcast to all listeners
	p.broadcastToListeners(buffer[:n])

	// Much faster streaming - don't throttle so aggressively
	time.Sleep(10 * time.Millisecond)

	return nil
}

// closeCurrentFile safely closes the current file
func (p *RadioPlayer) closeCurrentFile() {
	if p.currentFile != nil {
		p.currentFile.Close()
		p.currentFile = nil
	}
}

// broadcastToListeners sends data to all connected listeners
func (p *RadioPlayer) broadcastToListeners(data []byte) {
	p.listenersMutex.RLock()
	defer p.listenersMutex.RUnlock()

	if len(p.listeners) == 0 {
		return
	}

	for id, ch := range p.listeners {
		select {
		case ch <- data:
			// Data sent successfully
		default:
			// Channel is full, this listener might be slow
			log.Printf("Listener %s channel full, skipping chunk", id)
		}
	}
}

// AddListener adds a new listener and returns a channel for streaming
func (p *RadioPlayer) AddListener(id string) chan []byte {
	p.listenersMutex.Lock()
	defer p.listenersMutex.Unlock()

	// Create buffered channel for this listener
	ch := make(chan []byte, 50) // Larger buffer for better handling
	p.listeners[id] = ch

	log.Printf("Added listener %s (total: %d)", id, len(p.listeners))

	// Send any buffered data if we're in the middle of streaming
	go p.sendCatchupData(id, ch)

	return ch
}

// sendCatchupData sends some initial data to new listeners
func (p *RadioPlayer) sendCatchupData(id string, ch chan []byte) {
	// For a radio stream, we don't typically send catch-up data
	// New listeners just join the current stream
	// But we could send a small buffer if needed
}

// RemoveListener removes a listener
func (p *RadioPlayer) RemoveListener(id string) {
	p.listenersMutex.Lock()
	defer p.listenersMutex.Unlock()

	if ch, exists := p.listeners[id]; exists {
		close(ch)
		delete(p.listeners, id)
		log.Printf("Removed listener %s (remaining: %d)", id, len(p.listeners))
	}
}

// GetCurrentPosition returns the current playback position in bytes
func (p *RadioPlayer) GetCurrentPosition() int64 {
	p.playbackMutex.RLock()
	defer p.playbackMutex.RUnlock()
	return p.currentPosition
}

// GetCurrentTimePosition returns the current position in seconds
func (p *RadioPlayer) GetCurrentTimePosition() float64 {
	position := p.GetCurrentPosition()
	return float64(position) / float64(p.bytesPerSecond)
}

// GetStreamInfo returns information about the current stream
func (p *RadioPlayer) GetStreamInfo() map[string]interface{} {
	p.playbackMutex.RLock()
	p.listenersMutex.RLock()
	defer p.playbackMutex.RUnlock()
	defer p.listenersMutex.RUnlock()

	episode := p.fileStore.GetCurrentEpisode()

	info := map[string]interface{}{
		"is_playing":       p.isPlaying,
		"is_paused":        p.isPaused,
		"current_position": p.currentPosition,
		"time_position":    p.GetCurrentTimePosition(),
		"listener_count":   len(p.listeners),
		"stream_start":     p.streamStartTime,
	}

	if episode != nil {
		info["episode_id"] = episode.ID
		info["episode_title"] = episode.Title
		info["show_name"] = episode.ShowName
		info["duration"] = episode.Duration
	}

	return info
}

// cleanupRoutine periodically cleans up stale listeners
func (p *RadioPlayer) cleanupRoutine() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		<-ticker.C
		p.cleanupStaleListeners()
	}
}

// cleanupStaleListeners removes listeners that might be disconnected
func (p *RadioPlayer) cleanupStaleListeners() {
	p.listenersMutex.Lock()
	defer p.listenersMutex.Unlock()

	// In a real implementation, you'd track when listeners were last active
	// For now, we'll just check if channels are still writable
	for id, ch := range p.listeners {
		select {
		case ch <- []byte{}:
			// Channel is still working, send empty data shouldn't affect audio
		default:
			// Channel might be stale
			close(ch)
			delete(p.listeners, id)
			log.Printf("Cleaned up stale listener %s", id)
		}
	}
}

// GetListenerCount returns the current number of listeners
func (p *RadioPlayer) GetListenerCount() int {
	p.listenersMutex.RLock()
	defer p.listenersMutex.RUnlock()
	return len(p.listeners)
}
