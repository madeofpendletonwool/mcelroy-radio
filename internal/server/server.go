package server

import (
	"log"
	"net/http"
	"path/filepath"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/madeofpendletonwool/mcelroy-radio/internal/config"
	"github.com/madeofpendletonwool/mcelroy-radio/internal/handlers"
	"github.com/madeofpendletonwool/mcelroy-radio/internal/storage"
)

// New creates a new HTTP server with configured routes
func New(cfg *config.Config) (*http.Server, error) {
	// Initialize file store with RSS feeds
	fileStore, err := storage.NewFileStore(cfg.RSSFeeds)
	if err != nil {
		return nil, err
	}

	// Initialize handlers
	h := handlers.New(cfg, fileStore)

	// Create router with middleware
	r := chi.NewRouter()

	// Middleware
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(h.AnalyticsMiddleware)
	r.Use(middleware.Timeout(30 * time.Second))

	// Routes
	r.Get("/", h.HomePage)
	r.Get("/about", h.AboutPage)
	r.Get("/directory", h.DirectoryPage)
	r.Get("/episode", h.EpisodePage)

	// Core streaming route - now supports ?station= parameter
	r.Get("/stream", h.StreamAudio)

	// NEW: Episode streaming route
	r.Get("/stream-episode", h.StreamEpisode)

	// API routes - all now support ?station= parameter
	r.Get("/now-playing", h.NowPlaying)
	r.Get("/recent", h.RecentlyPlayed)
	r.Get("/stream-position", h.StreamPosition)

	// Station routes
	r.Get("/stations", h.StationList)
	r.Get("/station-info", h.StationInfo)

	// Utility routes
	r.Get("/random-fact", h.RandomFact)
	r.Get("/download-episode", h.DownloadEpisode)
	r.Get("/episode-details", h.EpisodeDetails)

	// Analytics routes
	r.Get("/analytics", h.AnalyticsPage)
	r.Get("/analytics-api", h.AnalyticsAPI)

	// PWA support
	r.Get("/manifest.json", h.ServeManifest)

	// Favicon
	r.Get("/favicon.ico", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, filepath.Join(cfg.StaticDir, "img", "favicon.ico"))
	})

	// Static file server
	log.Printf("Serving static files from: %s", cfg.StaticDir)
	fileServer := http.FileServer(http.Dir(cfg.StaticDir))
	r.Handle("/static/*", http.StripPrefix("/static/", fileServer))

	// Create and return the server
	return &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: r,
	}, nil
}
