package storage

import (
	"crypto/md5"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"math/rand"
	"sync"
	"time"

	"github.com/madeofpendletonwool/mcelroy-radio/internal/config"
	"github.com/madeofpendletonwool/mcelroy-radio/internal/models"
	"github.com/madeofpendletonwool/mcelroy-radio/internal/rss"
)

// FileStore manages episode discovery from RSS feeds and tracking
type FileStore struct {
	RSSFeeds        []config.RSSFeed
	Episodes        []*models.Episode
	CurrentEpisode  *models.Episode
	RecentlyPlayed  []*models.Episode
	PlayedEpisodes  map[string]bool
	episodesMutex   sync.RWMutex
	refreshInterval time.Duration
	rng             *rand.Rand
	rssParser       *rss.Parser
}

// NewFileStore creates a new file store and starts RSS feed parsing
func NewFileStore(rssFeeds []config.RSSFeed) (*FileStore, error) {
	// Create a new random source with current time as seed
	source := rand.NewSource(time.Now().UnixNano())
	rng := rand.New(source)

	// Initialize metadata cache
	cacheDir := "/opt/mcelroy-content/cache"
	metadataCache := NewMetadataCache(cacheDir)

	fs := &FileStore{
		RSSFeeds:        rssFeeds,
		Episodes:        make([]*models.Episode, 0),
		RecentlyPlayed:  make([]*models.Episode, 0),
		PlayedEpisodes:  make(map[string]bool),
		refreshInterval: 30 * time.Minute, // Check RSS feeds every 30 minutes
		rng:             rng,
		rssParser:       rss.New(),
	}

	// Initial RSS feed parsing
	if err := fs.ParseRSSFeeds(); err != nil {
		return nil, err
	}

	// Start background RSS feed parser
	go fs.backgroundRSSParser()

	return fs, nil
}

// ParseRSSFeeds parses all configured RSS feeds for episodes
func (fs *FileStore) ParseRSSFeeds() error {
	log.Println("Parsing RSS feeds for episodes...")

	episodes, err := fs.rssParser.ParseFeeds(fs.RSSFeeds)
	if err != nil {
		return err
	}

	log.Printf("Found %d total episodes across all RSS feeds", len(episodes))

	// Second pass: process uncached files
	if len(newFiles) > 0 {
		log.Printf("Processing %d uncached files with parallel workers...", len(newFiles))
		newEpisodes := fs.processUncachedFiles(newFiles)
		allEpisodes = append(allEpisodes, newEpisodes...)

		// Save cache after processing new files
		if err := fs.metadataCache.saveCache(); err != nil {
			log.Printf("Warning: Failed to save metadata cache: %v", err)
		} else {
			log.Printf("Saved metadata cache with %d new entries", len(newFiles))
		}
	}

	scanDuration := time.Since(startTime)
	log.Printf("Scan completed! Found %d episodes in %v (%.1f%% cache hit rate)",
		len(allEpisodes), scanDuration, float64(cacheHits)/float64(totalFiles)*100)

	// Update episodes
	fs.episodesMutex.Lock()
	defer fs.episodesMutex.Unlock()

	oldCount := len(fs.Episodes)
	newEpisodesFound := len(allEpisodes) - oldCount

	fs.Episodes = allEpisodes

	// Set initial current episode if needed
	if fs.CurrentEpisode == nil && len(allEpisodes) > 0 {
		randomIndex := fs.rng.Intn(len(allEpisodes))
		fs.CurrentEpisode = allEpisodes[randomIndex]
		fs.CurrentEpisode.PlayedAt = time.Now()
		fs.PlayedEpisodes[fs.CurrentEpisode.ID] = true
		log.Printf("Selected random starting episode: %s", fs.CurrentEpisode.Title)
	}

	if newEpisodesFound > 0 {
		log.Printf("Found %d new episodes", newEpisodesFound)
	}

	return nil
}

// FileJob represents a file processing job
type FileJob struct {
	Path     string
	ShowName string
	FileInfo os.FileInfo
}

// processUncachedFiles processes files that aren't cached using parallel workers
func (fs *FileStore) processUncachedFiles(jobs []FileJob) []*models.Episode {
	numWorkers := runtime.NumCPU()
	if numWorkers > 6 {
		numWorkers = 6 // Don't overwhelm ffprobe
	}

	jobChan := make(chan FileJob, len(jobs))
	resultChan := make(chan *models.Episode, len(jobs))

	// Start workers
	var wg sync.WaitGroup
	for i := 0; i < numWorkers; i++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			for job := range jobChan {
				episode := models.NewEpisodeFromFile(job.Path, job.ShowName)
				if episode != nil {
					// Cache the episode
					fs.metadataCache.cacheEpisode(episode, job.FileInfo)
					resultChan <- episode
				}
			}
		}(i)
	}

	// Send jobs
	go func() {
		defer close(jobChan)
		for _, job := range jobs {
			jobChan <- job
		}
	}()

	// Wait for workers and close result channel
	go func() {
		wg.Wait()
		close(resultChan)
	}()

	// Collect results
	var episodes []*models.Episode
	processed := 0
	for episode := range resultChan {
		episodes = append(episodes, episode)
		processed++

		// Log progress for long operations
		if processed%50 == 0 {
			log.Printf("Processed %d/%d uncached files...", processed, len(jobs))
		}
	}

	return episodes
}

// backgroundRSSParser periodically checks RSS feeds for new episodes
func (fs *FileStore) backgroundRSSParser() {
	ticker := time.NewTicker(fs.refreshInterval)
	defer ticker.Stop()

	log.Printf("Started background RSS feed parser (checking every %v)", fs.refreshInterval)

	for {
		<-ticker.C
		log.Println("Running background RSS feed parsing...")
		if err := fs.ParseRSSFeeds(); err != nil {
			log.Printf("Error during background RSS feed parsing: %v", err)
		}
	}
}

// Rest of the FileStore methods remain the same...
// GetCurrentEpisode, AdvanceToNextEpisode, GetRecentlyPlayed, etc.

func (fs *FileStore) GetCurrentEpisode() *models.Episode {
	fs.episodesMutex.RLock()
	defer fs.episodesMutex.RUnlock()
	return fs.CurrentEpisode
}

func (fs *FileStore) AdvanceToNextEpisode() *models.Episode {
	fs.episodesMutex.Lock()
	defer fs.episodesMutex.Unlock()

	if len(fs.Episodes) == 0 {
		log.Println("No episodes available to advance to")
		return nil
	}

	// Add current episode to recently played
	if fs.CurrentEpisode != nil {
		fs.CurrentEpisode.PlayedAt = time.Now()
		fs.RecentlyPlayed = append([]*models.Episode{fs.CurrentEpisode}, fs.RecentlyPlayed...)
		if len(fs.RecentlyPlayed) > 10 {
			fs.RecentlyPlayed = fs.RecentlyPlayed[:10]
		}
		log.Printf("Finished playing: %s", fs.CurrentEpisode.Title)
	}

	// Get unplayed episodes
	var unplayedEpisodes []*models.Episode
	for _, episode := range fs.Episodes {
		if !fs.PlayedEpisodes[episode.ID] {
			unplayedEpisodes = append(unplayedEpisodes, episode)
		}
	}

	// Reset cycle if all played
	if len(unplayedEpisodes) == 0 {
		log.Println("Completed full episode cycle! Starting over...")
		fs.PlayedEpisodes = make(map[string]bool)
		unplayedEpisodes = fs.Episodes
	}

	// Select random episode
	randomIndex := fs.rng.Intn(len(unplayedEpisodes))
	fs.CurrentEpisode = unplayedEpisodes[randomIndex]
	fs.PlayedEpisodes[fs.CurrentEpisode.ID] = true
	fs.CurrentEpisode.RandomFact = models.GetRandomFact()

	log.Printf("Selected next episode: %s (%d unplayed remaining)",
		fs.CurrentEpisode.Title, len(unplayedEpisodes)-1)

	return fs.CurrentEpisode
}

func (fs *FileStore) GetRecentlyPlayed() []*models.Episode {
	fs.episodesMutex.RLock()
	defer fs.episodesMutex.RUnlock()
	return fs.RecentlyPlayed
}

func (fs *FileStore) GetAllEpisodes() []*models.Episode {
	fs.episodesMutex.RLock()
	defer fs.episodesMutex.RUnlock()
	episodes := make([]*models.Episode, len(fs.Episodes))
	copy(episodes, fs.Episodes)
	return episodes
}

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
