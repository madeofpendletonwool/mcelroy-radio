package config

import (
	"context"
	"io/fs"
	"log"
	"os"
	"path/filepath"
	"strings"
)

// Config holds the application configuration
type Config struct {
	Port               string
	RSSFeeds     []RSSFeed
	TemplatesDir       string
	StaticDir          string
	StationConfigDir   string
	Context            context.Context
}

// RSSFeed represents an RSS feed configuration
type RSSFeed struct {
	Name string
	URL  string
}

// Load returns a configuration object populated from environment variables
// and defaults
func Load() (*Config, error) {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080" // Default port
	}

	// Set up RSS feeds
	rssFeeds := make([]RSSFeed, 0)

	// Parse from environment or use default
	rssEnv := os.Getenv("RSS_FEEDS")
	if rssEnv != "" {
		// Parse format: "Name1:URL1,Name2:URL2,Name3:URL3"
		feeds := strings.Split(rssEnv, ",")
		for _, feed := range feeds {
			parts := strings.SplitN(feed, ":", 2)
			if len(parts) == 2 {
				rssFeeds = append(rssFeeds, RSSFeed{
					Name: strings.TrimSpace(parts[0]),
					URL:  strings.TrimSpace(parts[1]),
				})
			}
		}
	} else {
		// Default RSS feeds - these are example URLs, should be configured for actual McElroy feeds
		rssFeeds = []RSSFeed{
			{Name: "My Brother My Brother and Me", URL: "https://feeds.simplecast.com/wjQvV_54"},
			{Name: "The Adventure Zone", URL: "https://feeds.simplecast.com/cYQVV__c"},
			{Name: "Sawbones", URL: "https://feeds.simplecast.com/y1N13_qC"},
		}
	}

	// Set template and static directories
	templatesDir := filepath.Join(".", "templates")
	staticDir := filepath.Join(".", "static")

	// Station config directory
	stationConfigDir := os.Getenv("STATION_CONFIG_DIR")
	if stationConfigDir == "" {
		stationConfigDir = "/opt/mcelroy-content/config"
	}

	return &Config{
		Port:             port,
		RSSFeeds:         rssFeeds,
		TemplatesDir:     templatesDir,
		StaticDir:        staticDir,
		StationConfigDir: stationConfigDir,
		Context:          context.Background(),
	}, nil
}

// discoverContentDirectories automatically finds all subdirectories in the base content directory
func discoverContentDirectories(baseDir string) ([]string, error) {
	var contentDirs []string

	// Check if base directory exists
	if _, err := os.Stat(baseDir); os.IsNotExist(err) {
		// Create base directory if it doesn't exist
		if err := os.MkdirAll(baseDir, 0755); err != nil {
			return nil, err
		}
		log.Printf("Created base content directory: %s", baseDir)
		return contentDirs, nil
	}

	// Walk through the base directory and find all subdirectories
	err := filepath.WalkDir(baseDir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			log.Printf("Warning: Error accessing %s: %v", path, err)
			return nil // Continue walking
		}

		// Skip the root directory itself
		if path == baseDir {
			return nil
		}

		// Only look at direct subdirectories (not nested)
		relPath, err := filepath.Rel(baseDir, path)
		if err != nil {
			return nil
		}

		// Skip nested directories (only want direct children)
		if strings.Contains(relPath, string(filepath.Separator)) {
			if d.IsDir() {
				return filepath.SkipDir // Don't recurse into subdirectories
			}
			return nil
		}

		// Add directories that contain audio files
		if d.IsDir() {
			hasAudioFiles, err := directoryContainsAudioFiles(path)
			if err != nil {
				log.Printf("Warning: Error checking directory %s for audio files: %v", path, err)
				return nil
			}

			if hasAudioFiles {
				contentDirs = append(contentDirs, path)
				log.Printf("Discovered content directory: %s", path)
			} else {
				log.Printf("Skipping directory %s (no audio files found)", path)
			}
		}

		return nil
	})

	return contentDirs, err
}

// directoryContainsAudioFiles checks if a directory contains any audio files
func directoryContainsAudioFiles(dir string) (bool, error) {
	audioExtensions := map[string]bool{
		".mp3":  true,
		".m4a":  true,
		".ogg":  true,
		".wav":  true,
		".flac": true,
		".aac":  true,
	}

	// Check if directory has any audio files (just check first few entries for performance)
	entries, err := os.ReadDir(dir)
	if err != nil {
		return false, err
	}

	count := 0
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}

		ext := strings.ToLower(filepath.Ext(entry.Name()))
		if audioExtensions[ext] {
			return true, nil
		}

		// Only check first 50 files for performance
		count++
		if count > 50 {
			break
		}
	}

	return false, nil
}
