package config

import (
	"context"
	"os"
	"path/filepath"
	"strings"
)

// Config holds the application configuration
type Config struct {
	Port               string
	ContentDirectories []string
	TemplatesDir       string
	StaticDir          string
	Context            context.Context
}

// Load returns a configuration object populated from environment variables
// and defaults
func Load() (*Config, error) {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080" // Default port
	}

	// Set up content directories
	contentDirs := make([]string, 0)

	// Parse from environment or use default
	contentEnv := os.Getenv("CONTENT_DIRS")
	if contentEnv != "" {
		contentDirs = strings.Split(contentEnv, ",")
	} else {
		// Default content directories
		contentDirs = []string{
			"/opt/mcelroy-content/show1",
			"/opt/mcelroy-content/show2",
			"/opt/mcelroy-content/show3",
		}
	}

	// Ensure directories exist and are accessible
	for _, dir := range contentDirs {
		if _, err := os.Stat(dir); os.IsNotExist(err) {
			// If directory doesn't exist, try to create it
			if err := os.MkdirAll(dir, 0755); err != nil {
				return nil, err
			}
		}
	}

	// Set template and static directories
	templatesDir := filepath.Join(".", "templates")
	staticDir := filepath.Join(".", "static")

	return &Config{
		Port:               port,
		ContentDirectories: contentDirs,
		TemplatesDir:       templatesDir,
		StaticDir:          staticDir,
		Context:            context.Background(),
	}, nil
}
