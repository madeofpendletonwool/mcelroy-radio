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

// GetCurrentPosition returns estimated position (compatibility)
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
