package config

import (
	"context"
	"os"
	"path/filepath"
	"strings"
)

// Config holds the application configuration
type Config struct {
	Port         string
	RSSFeeds     []RSSFeed
	TemplatesDir string
	StaticDir    string
	Context      context.Context
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

	return &Config{
		Port:         port,
		RSSFeeds:     rssFeeds,
		TemplatesDir: templatesDir,
		StaticDir:    staticDir,
		Context:      context.Background(),
	}, nil
}
