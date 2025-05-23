package storage

import (
	"log"
	"math/rand"
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
	PlayedEpisodes  map[string]bool // Track which episodes we've played in this cycle
	episodesMutex   sync.RWMutex
	refreshInterval time.Duration
	rng             *rand.Rand
}

// NewFileStore creates a new file store and starts content discovery
func NewFileStore(contentDirs []string) (*FileStore, error) {
	// Create a new random source with current time as seed
	source := rand.NewSource(time.Now().UnixNano())
	rng := rand.New(source)

	fs := &FileStore{
		ContentDirs:     contentDirs,
		Episodes:        make([]*models.Episode, 0),
		RecentlyPlayed:  make([]*models.Episode, 0),
		PlayedEpisodes:  make(map[string]bool),
		refreshInterval: 5 * time.Minute,
		rng:             rng,
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
	log.Println("Scanning content directories for audio files...")

	var episodes []*models.Episode
	episodeCount := 0

	for _, dir := range fs.ContentDirs {
		showName := filepath.Base(dir)
		log.Printf("Scanning directory: %s (show: %s)", dir, showName)

		err := filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
			if err != nil {
				log.Printf("Error accessing path %s: %v", path, err)
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
				episodeCount++
				log.Printf("Found episode: %s", episode.Title)
			}

			return nil
		})

		if err != nil {
			log.Printf("Error scanning directory %s: %v", dir, err)
			return err
		}
	}

	log.Printf("Found %d total episodes across all directories", episodeCount)

	// Update episodes with lock
	fs.episodesMutex.Lock()
	defer fs.episodesMutex.Unlock()

	// Check if we found new episodes
	oldCount := len(fs.Episodes)
	newEpisodes := fs.findNewEpisodes(episodes)

	fs.Episodes = episodes

	// If we don't have a current episode yet and we found some episodes, pick one randomly
	if fs.CurrentEpisode == nil && len(episodes) > 0 {
		randomIndex := fs.rng.Intn(len(episodes))
		fs.CurrentEpisode = episodes[randomIndex]
		fs.CurrentEpisode.PlayedAt = time.Now()
		fs.PlayedEpisodes[fs.CurrentEpisode.ID] = true
		log.Printf("Selected random starting episode: %s", fs.CurrentEpisode.Title)
	}

	// Log new episodes found
	if len(newEpisodes) > 0 {
		log.Printf("Detected %d new episodes:", len(newEpisodes))
		for _, ep := range newEpisodes {
			log.Printf("  - %s", ep.Title)
		}
	} else if oldCount > 0 {
		log.Printf("No new episodes detected (still have %d episodes)", len(episodes))
	}

	return nil
}

// findNewEpisodes compares current episodes with new scan results
func (fs *FileStore) findNewEpisodes(newEpisodes []*models.Episode) []*models.Episode {
	// Create a map of existing episodes by ID for quick lookup
	existingEpisodes := make(map[string]bool)
	for _, ep := range fs.Episodes {
		existingEpisodes[ep.ID] = true
	}

	// Find episodes that are in newEpisodes but not in existing
	var newlyFound []*models.Episode
	for _, ep := range newEpisodes {
		if !existingEpisodes[ep.ID] {
			newlyFound = append(newlyFound, ep)
		}
	}

	return newlyFound
}

// backgroundScanner periodically checks for new content
func (fs *FileStore) backgroundScanner() {
	ticker := time.NewTicker(fs.refreshInterval)
	defer ticker.Stop()

	log.Printf("Started background content scanner (checking every %v)", fs.refreshInterval)

	for {
		<-ticker.C
		log.Println("Running background content scan...")
		if err := fs.ScanContent(); err != nil {
			log.Printf("Error during background content scan: %v", err)
		}
	}
}

// GetCurrentEpisode returns the currently playing episode
func (fs *FileStore) GetCurrentEpisode() *models.Episode {
	fs.episodesMutex.RLock()
	defer fs.episodesMutex.RUnlock()
	return fs.CurrentEpisode
}

// AdvanceToNextEpisode changes to the next episode randomly
func (fs *FileStore) AdvanceToNextEpisode() *models.Episode {
	fs.episodesMutex.Lock()
	defer fs.episodesMutex.Unlock()

	if len(fs.Episodes) == 0 {
		log.Println("No episodes available to advance to")
		return nil
	}

	// Add current episode to recently played
	if fs.CurrentEpisode != nil {
		// Update play time
		fs.CurrentEpisode.PlayedAt = time.Now()

		// Add to recently played, keeping only last 10
		fs.RecentlyPlayed = append([]*models.Episode{fs.CurrentEpisode}, fs.RecentlyPlayed...)
		if len(fs.RecentlyPlayed) > 10 {
			fs.RecentlyPlayed = fs.RecentlyPlayed[:10]
		}

		log.Printf("Finished playing: %s", fs.CurrentEpisode.Title)
	}

	// Get list of unplayed episodes
	var unplayedEpisodes []*models.Episode
	for _, episode := range fs.Episodes {
		if !fs.PlayedEpisodes[episode.ID] {
			unplayedEpisodes = append(unplayedEpisodes, episode)
		}
	}

	// If we've played all episodes, reset the cycle and start over
	if len(unplayedEpisodes) == 0 {
		log.Println("Completed full episode cycle! Starting over with all episodes...")
		fs.PlayedEpisodes = make(map[string]bool) // Reset played episodes
		unplayedEpisodes = fs.Episodes            // All episodes are now available again
	}

	// Select a random episode from unplayed episodes
	randomIndex := fs.rng.Intn(len(unplayedEpisodes))
	fs.CurrentEpisode = unplayedEpisodes[randomIndex]

	// Mark as played
	fs.PlayedEpisodes[fs.CurrentEpisode.ID] = true

	// Update with a new random fact
	fs.CurrentEpisode.RandomFact = models.GetRandomFact()

	log.Printf("Selected next random episode: %s (%d unplayed episodes remaining)",
		fs.CurrentEpisode.Title, len(unplayedEpisodes)-1)

	return fs.CurrentEpisode
}

// GetRecentlyPlayed returns the recently played episodes
func (fs *FileStore) GetRecentlyPlayed() []*models.Episode {
	fs.episodesMutex.RLock()
	defer fs.episodesMutex.RUnlock()
	return fs.RecentlyPlayed
}

// GetAllEpisodes returns all discovered episodes
func (fs *FileStore) GetAllEpisodes() []*models.Episode {
	fs.episodesMutex.RLock()
	defer fs.episodesMutex.RUnlock()

	// Return a copy to avoid race conditions
	episodes := make([]*models.Episode, len(fs.Episodes))
	copy(episodes, fs.Episodes)
	return episodes
}

// GetEpisodeByID returns a specific episode by its ID (file path)
func (fs *FileStore) GetEpisodeByID(id string) *models.Episode {
	fs.episodesMutex.RLock()
	defer fs.episodesMutex.RUnlock()

	for _, episode := range fs.Episodes {
		if episode.ID == id {
			return episode
		}
	}
	return nil
}

// GetEpisodesByShow returns all episodes for a specific show
func (fs *FileStore) GetEpisodesByShow(showName string) []*models.Episode {
	fs.episodesMutex.RLock()
	defer fs.episodesMutex.RUnlock()

	var episodes []*models.Episode
	for _, episode := range fs.Episodes {
		if episode.ShowName == showName {
			episodes = append(episodes, episode)
		}
	}
	return episodes
}

// GetPlaybackStats returns information about the current playback cycle
func (fs *FileStore) GetPlaybackStats() map[string]interface{} {
	fs.episodesMutex.RLock()
	defer fs.episodesMutex.RUnlock()

	totalEpisodes := len(fs.Episodes)
	playedCount := len(fs.PlayedEpisodes)
	remainingCount := totalEpisodes - playedCount

	return map[string]interface{}{
		"total_episodes":     totalEpisodes,
		"played_this_cycle":  playedCount,
		"remaining_unplayed": remainingCount,
		"cycle_progress":     float64(playedCount) / float64(totalEpisodes) * 100,
	}
}
