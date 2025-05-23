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
	// Initialize file store
	fileStore, err := storage.NewFileStore(cfg.ContentDirectories)
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
	r.Use(middleware.Timeout(30 * time.Second))

	// Routes
	r.Get("/", h.HomePage)
	r.Get("/about", h.AboutPage)
	r.Get("/stream", h.StreamAudio)
	r.Get("/now-playing", h.NowPlaying)
	r.Get("/recent", h.RecentlyPlayed)
	r.Get("/random-fact", h.RandomFact)
	r.Get("/directory", h.DirectoryPage)
	r.Get("/stream-position", h.StreamPosition)

	r.Get("/favicon.ico", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, filepath.Join(cfg.StaticDir, "img", "favicon.ico"))
	})

	// Add the missing download route
	r.Get("/download-episode", h.DownloadEpisode)

	// Add episode details route for the directory
	r.Get("/episode-details", h.EpisodeDetails)

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
