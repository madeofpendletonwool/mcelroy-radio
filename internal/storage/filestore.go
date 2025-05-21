package storage

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/madeofpendletonwool/mcelroy-radio/internal/models"
)

// FileStore manages audio file discovery and tracking
type FileStore struct {
	ContentDirs     []string
	Episodes        []*models.Episode
	CurrentEpisode  *models.Episode
	RecentlyPlayed  []*models.Episode
	episodesMutex   sync.RWMutex
	refreshInterval time.Duration
}

// NewFileStore creates a new file store and starts content discovery
func NewFileStore(contentDirs []string) (*FileStore, error) {
	fs := &FileStore{
		ContentDirs:     contentDirs,
		Episodes:        make([]*models.Episode, 0),
		RecentlyPlayed:  make([]*models.Episode, 0),
		refreshInterval: 5 * time.Minute,
	}

	// Initial scan
	if err := fs.ScanContent(); err != nil {
		return nil, err
	}

	// Start background scanner
	go fs.backgroundScanner()

	return fs, nil
}

// ScanContent scans the content directories for audio files
func (fs *FileStore) ScanContent() error {
	var episodes []*models.Episode

	for _, dir := range fs.ContentDirs {
		showName := filepath.Base(dir)

		err := filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
			if err != nil {
				return err
			}

			// Skip directories
			if info.IsDir() {
				return nil
			}

			// Check if file is an audio file
			ext := strings.ToLower(filepath.Ext(path))
			if ext == ".mp3" || ext == ".m4a" || ext == ".ogg" || ext == ".wav" {
				episode := models.NewEpisodeFromFile(path, showName)
				episodes = append(episodes, episode)
			}

			return nil
		})

		if err != nil {
			return err
		}
	}

	// Update episodes with lock
	fs.episodesMutex.Lock()
	fs.Episodes = episodes

	// If we don't have a current episode yet and we found some episodes
	if fs.CurrentEpisode == nil && len(episodes) > 0 {
		fs.CurrentEpisode = episodes[0] // Start with the first episode
		fs.CurrentEpisode.PlayedAt = time.Now()
	}
	fs.episodesMutex.Unlock()

	return nil
}

// backgroundScanner periodically checks for new content
func (fs *FileStore) backgroundScanner() {
	ticker := time.NewTicker(fs.refreshInterval)
	defer ticker.Stop()

	for {
		<-ticker.C
		if err := fs.ScanContent(); err != nil {
			fmt.Printf("Error scanning content: %v\n", err)
		}
	}
}

// GetCurrentEpisode returns the currently playing episode
func (fs *FileStore) GetCurrentEpisode() *models.Episode {
	fs.episodesMutex.RLock()
	defer fs.episodesMutex.RUnlock()
	return fs.CurrentEpisode
}

// AdvanceToNextEpisode changes to the next episode
func (fs *FileStore) AdvanceToNextEpisode() *models.Episode {
	fs.episodesMutex.Lock()
	defer fs.episodesMutex.Unlock()

	if len(fs.Episodes) == 0 {
		return nil
	}

	// Add current episode to recently played
	if fs.CurrentEpisode != nil {
		// Update play time
		fs.CurrentEpisode.PlayedAt = time.Now()

		// Add to recently played, keeping only last 5
		fs.RecentlyPlayed = append([]*models.Episode{fs.CurrentEpisode}, fs.RecentlyPlayed...)
		if len(fs.RecentlyPlayed) > 5 {
			fs.RecentlyPlayed = fs.RecentlyPlayed[:5]
		}
	}

	// Find current episode index
	currentIndex := -1
	if fs.CurrentEpisode != nil {
		for i, e := range fs.Episodes {
			if e.ID == fs.CurrentEpisode.ID {
				currentIndex = i
				break
			}
		}
	}

	// Select next episode
	nextIndex := 0
	if currentIndex != -1 && currentIndex < len(fs.Episodes)-1 {
		nextIndex = currentIndex + 1
	}

	fs.CurrentEpisode = fs.Episodes[nextIndex]
	// Update with a new random fact
	fs.CurrentEpisode.RandomFact = models.GetRandomFact()
	return fs.CurrentEpisode
}

// GetRecentlyPlayed returns the recently played episodes
func (fs *FileStore) GetRecentlyPlayed() []*models.Episode {
	fs.episodesMutex.RLock()
	defer fs.episodesMutex.RUnlock()
	return fs.RecentlyPlayed
}
