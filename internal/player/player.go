package player

// NOTE: This file is now mostly obsolete since each station manages its own progression
// We can keep it for compatibility but it's no longer the source of truth

import (
	"log"
	"sync"
	"time"

	"github.com/madeofpendletonwool/mcelroy-radio/internal/storage"
)

// RadioPlayer is now just a compatibility shim
// Real player logic is in the station manager
type RadioPlayer struct {
	fileStore        *storage.FileStore
	currentPosition  int64
	currentEpisodeID string
	isPlaying        bool
	streamStartTime  time.Time
	playbackMutex    sync.RWMutex
	episodeStartTime time.Time
	episodeDuration  float64
}

// New creates a new radio player (compatibility only)
func New(fileStore *storage.FileStore) (*RadioPlayer, error) {
	player := &RadioPlayer{
		fileStore:       fileStore,
		streamStartTime: time.Now(),
		isPlaying:       true,
	}

	log.Println("RadioPlayer created (compatibility mode - stations handle their own progression)")
	return player, nil
}

// episodeProgressLoop manages episode transitions based on timing
func (p *RadioPlayer) episodeProgressLoop() {
	ticker := time.NewTicker(5 * time.Second) // Check every 5 seconds
	defer ticker.Stop()

	for {
		<-ticker.C
		p.checkEpisodeProgress()
	}
}

// checkEpisodeProgress checks if we need to advance to the next episode
func (p *RadioPlayer) checkEpisodeProgress() {
	episode := p.fileStore.GetCurrentEpisode()
	if episode == nil {
		return
	}

	p.playbackMutex.Lock()
	defer p.playbackMutex.Unlock()

	// Check if this is a new episode
	if p.currentEpisodeID != episode.ID {
		log.Printf("Starting new episode: %s", episode.Title)
		p.currentEpisodeID = episode.ID
		p.episodeStartTime = time.Now()
		p.episodeDuration = episode.Duration
		p.currentPosition = 0
		p.isPlaying = true
		return
	}

	// Calculate how long this episode has been playing
	playingTime := time.Since(p.episodeStartTime).Seconds()

	// If the episode duration is known and we've played past it, advance to next
	if p.episodeDuration > 0 && playingTime >= p.episodeDuration {
		log.Printf("Episode finished after %.2f seconds, advancing to next", playingTime)
		p.fileStore.AdvanceToNextEpisode()
		return
	}

	// Update current position based on elapsed time
	// Since we're now using RSS URLs, position tracking is handled by the client
	// We'll track time-based position instead of bytes
	p.currentPosition = int64(playingTime)
}

// GetCurrentPosition returns the current playback position in bytes (estimated)
func (p *RadioPlayer) GetCurrentPosition() int64 {
	p.playbackMutex.RLock()
	defer p.playbackMutex.RUnlock()
	return p.currentPosition
}

// GetCurrentTimePosition returns current position in seconds (compatibility)
func (p *RadioPlayer) GetCurrentTimePosition() float64 {
	p.playbackMutex.RLock()
	defer p.playbackMutex.RUnlock()

	if p.currentEpisodeID == "" {
		return 0
	}

	return time.Since(p.episodeStartTime).Seconds()
}

// GetStreamInfo returns information about the current stream (compatibility)
func (p *RadioPlayer) GetStreamInfo() map[string]interface{} {
	p.playbackMutex.RLock()
	defer p.playbackMutex.RUnlock()

	// Note: This now returns generic info since actual episode info
	// is managed per-station in the station manager
	info := map[string]interface{}{
		"is_playing":       p.isPlaying,
		"is_paused":        false,
		"current_position": p.currentPosition,
		"time_position":    p.GetCurrentTimePosition(),
		"listener_count":   0, // Not applicable for HTTP range serving
		"stream_start":     p.streamStartTime,
	}

	return info
}

// Legacy methods for compatibility - these are no-ops now since we use HTTP Range requests

// AddListener - no longer used with HTTP Range serving
func (p *RadioPlayer) AddListener(id string) chan []byte {
	// Return a dummy channel that immediately closes
	ch := make(chan []byte)
	close(ch)
	return ch
}

// RemoveListener - no longer used with HTTP Range serving
func (p *RadioPlayer) RemoveListener(id string) {
	// No-op
}

// GetListenerCount - no longer applicable with HTTP Range serving
func (p *RadioPlayer) GetListenerCount() int {
	return 0
}
