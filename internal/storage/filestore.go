package storage

import (
	"crypto/md5"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"math/rand"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/madeofpendletonwool/mcelroy-radio/internal/models"
)

// CachedEpisodeData represents the cached metadata for an episode
type CachedEpisodeData struct {
	FilePath    string    `json:"file_path"`
	FileSize    int64     `json:"file_size"`
	ModTime     time.Time `json:"mod_time"`
	Title       string    `json:"title"`
	ShowName    string    `json:"show_name"`
	Artist      string    `json:"artist"`
	Album       string    `json:"album"`
	Genre       string    `json:"genre"`
	Duration    float64   `json:"duration"`
	ImagePath   string    `json:"image_path"`
	PublishedAt time.Time `json:"published_at"`
	CachedAt    time.Time `json:"cached_at"`
}

// MetadataCache manages the episode metadata cache
type MetadataCache struct {
	cachePath string
	cache     map[string]*CachedEpisodeData
	mutex     sync.RWMutex
}

// NewMetadataCache creates a new metadata cache
func NewMetadataCache(cacheDir string) *MetadataCache {
	cachePath := filepath.Join(cacheDir, "episode_metadata.json")

	cache := &MetadataCache{
		cachePath: cachePath,
		cache:     make(map[string]*CachedEpisodeData),
	}

	// Load existing cache
	cache.loadCache()

	return cache
}

// loadCache loads the cache from disk
func (mc *MetadataCache) loadCache() {
	mc.mutex.Lock()
	defer mc.mutex.Unlock()

	if _, err := os.Stat(mc.cachePath); os.IsNotExist(err) {
		log.Printf("No metadata cache found at %s, starting fresh", mc.cachePath)
		return
	}

	data, err := ioutil.ReadFile(mc.cachePath)
	if err != nil {
		log.Printf("Error reading metadata cache: %v", err)
		return
	}

	if err := json.Unmarshal(data, &mc.cache); err != nil {
		log.Printf("Error parsing metadata cache: %v", err)
		// Start fresh if cache is corrupted
		mc.cache = make(map[string]*CachedEpisodeData)
		return
	}

	log.Printf("Loaded metadata cache with %d entries", len(mc.cache))
}

// saveCache saves the cache to disk
func (mc *MetadataCache) saveCache() error {
	mc.mutex.RLock()
	defer mc.mutex.RUnlock()

	// Ensure cache directory exists
	if err := os.MkdirAll(filepath.Dir(mc.cachePath), 0755); err != nil {
		return fmt.Errorf("failed to create cache directory: %v", err)
	}

	data, err := json.MarshalIndent(mc.cache, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal cache: %v", err)
	}

	if err := ioutil.WriteFile(mc.cachePath, data, 0644); err != nil {
		return fmt.Errorf("failed to write cache file: %v", err)
	}

	return nil
}

// getCacheKey generates a unique key for a file
func (mc *MetadataCache) getCacheKey(filePath string) string {
	hash := md5.Sum([]byte(filePath))
	return fmt.Sprintf("%x", hash)
}

// isFileCached checks if a file is cached and up-to-date
func (mc *MetadataCache) isFileCached(filePath string, fileInfo os.FileInfo) bool {
	mc.mutex.RLock()
	defer mc.mutex.RUnlock()

	key := mc.getCacheKey(filePath)
	cached, exists := mc.cache[key]

	if !exists {
		return false
	}

	// Check if file has been modified since caching
	if cached.FileSize != fileInfo.Size() || !cached.ModTime.Equal(fileInfo.ModTime()) {
		return false
	}

	return true
}

// getCachedEpisode retrieves a cached episode
func (mc *MetadataCache) getCachedEpisode(filePath string) *models.Episode {
	mc.mutex.RLock()
	defer mc.mutex.RUnlock()

	key := mc.getCacheKey(filePath)
	cached, exists := mc.cache[key]

	if !exists {
		return nil
	}

	return &models.Episode{
		ID:          filePath,
		Title:       cached.Title,
		ShowName:    cached.ShowName,
		Artist:      cached.Artist,
		Album:       cached.Album,
		Genre:       cached.Genre,
		AudioPath:   filePath,
		ImagePath:   cached.ImagePath,
		Duration:    cached.Duration,
		FileSize:    cached.FileSize,
		PublishedAt: cached.PublishedAt,
		RandomFact:  models.GetRandomFact(),
	}
}

// cacheEpisode stores an episode in the cache
func (mc *MetadataCache) cacheEpisode(episode *models.Episode, fileInfo os.FileInfo) {
	mc.mutex.Lock()
	defer mc.mutex.Unlock()

	key := mc.getCacheKey(episode.AudioPath)
	mc.cache[key] = &CachedEpisodeData{
		FilePath:    episode.AudioPath,
		FileSize:    fileInfo.Size(),
		ModTime:     fileInfo.ModTime(),
		Title:       episode.Title,
		ShowName:    episode.ShowName,
		Artist:      episode.Artist,
		Album:       episode.Album,
		Genre:       episode.Genre,
		Duration:    episode.Duration,
		ImagePath:   episode.ImagePath,
		PublishedAt: episode.PublishedAt,
		CachedAt:    time.Now(),
	}
}

// FileStore manages audio file discovery and tracking with caching
type FileStore struct {
	ContentDirs     []string
	Episodes        []*models.Episode
	CurrentEpisode  *models.Episode
	RecentlyPlayed  []*models.Episode
	PlayedEpisodes  map[string]bool
	episodesMutex   sync.RWMutex
	refreshInterval time.Duration
	rng             *rand.Rand
	metadataCache   *MetadataCache
}

// NewFileStore creates a new file store with metadata caching
func NewFileStore(contentDirs []string) (*FileStore, error) {
	source := rand.NewSource(time.Now().UnixNano())
	rng := rand.New(source)

	// Initialize metadata cache
	cacheDir := "/opt/mcelroy-content/cache"
	metadataCache := NewMetadataCache(cacheDir)

	fs := &FileStore{
		ContentDirs:     contentDirs,
		Episodes:        make([]*models.Episode, 0),
		RecentlyPlayed:  make([]*models.Episode, 0),
		PlayedEpisodes:  make(map[string]bool),
		refreshInterval: 15 * time.Minute, // Increased since we have caching now
		rng:             rng,
		metadataCache:   metadataCache,
	}

	// Initial scan
	if err := fs.ScanContent(); err != nil {
		return nil, err
	}

	// Start background scanner
	go fs.backgroundScanner()

	return fs, nil
}

// ScanContent scans directories with intelligent caching
func (fs *FileStore) ScanContent() error {
	log.Println("Starting cached content scan...")
	startTime := time.Now()

	var allEpisodes []*models.Episode
	var newFiles []FileJob
	cacheHits := 0
	totalFiles := 0

	// First pass: check what's cached vs what needs scanning
	for _, dir := range fs.ContentDirs {
		showName := filepath.Base(dir)
		log.Printf("Checking directory: %s", dir)

		err := filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
			if err != nil {
				log.Printf("Warning: Error accessing path %s: %v", path, err)
				return nil
			}

			if info.IsDir() {
				return nil
			}

			// Check if it's an audio file
			ext := strings.ToLower(filepath.Ext(path))
			audioExtensions := map[string]bool{
				".mp3": true, ".m4a": true, ".ogg": true,
				".wav": true, ".flac": true, ".aac": true,
			}

			if !audioExtensions[ext] {
				return nil
			}

			totalFiles++

			// Check if cached and up-to-date
			if fs.metadataCache.isFileCached(path, info) {
				if episode := fs.metadataCache.getCachedEpisode(path); episode != nil {
					allEpisodes = append(allEpisodes, episode)
					cacheHits++
					return nil
				}
			}

			// Not cached or needs updating
			newFiles = append(newFiles, FileJob{
				Path:     path,
				ShowName: showName,
				FileInfo: info,
			})

			return nil
		})

		if err != nil {
			log.Printf("Error scanning directory %s: %v", dir, err)
		}
	}

	log.Printf("Cache analysis: %d cached, %d need scanning, %d total files",
		cacheHits, len(newFiles), totalFiles)

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
