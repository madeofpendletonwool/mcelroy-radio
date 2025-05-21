package handlers

import (
	"encoding/json"
	"html/template"
	"net/http"
	"path/filepath"
	"sync"

	"github.com/google/uuid"
	"github.com/madeofpendletonwool/mcelroy-radio/internal/config"
	"github.com/madeofpendletonwool/mcelroy-radio/internal/models"
	"github.com/madeofpendletonwool/mcelroy-radio/internal/player"
	"github.com/madeofpendletonwool/mcelroy-radio/internal/storage"
)

// Handler manages HTTP requests
type Handler struct {
	config    *config.Config
	fileStore *storage.FileStore
	player    *player.RadioPlayer
	templates *template.Template
	mu        sync.RWMutex
}

// New creates a new handler
func New(cfg *config.Config, fs *storage.FileStore) *Handler {
	// Initialize templates
	tmpl := template.Must(template.ParseGlob(filepath.Join(cfg.TemplatesDir, "*.html")))
	template.Must(tmpl.ParseGlob(filepath.Join(cfg.TemplatesDir, "pages", "*.html")))

	// Create player
	p, _ := player.New(fs)

	return &Handler{
		config:    cfg,
		fileStore: fs,
		player:    p,
		templates: tmpl,
	}
}

// HomePage renders the home page
func (h *Handler) HomePage(w http.ResponseWriter, r *http.Request) {
	h.mu.RLock()
	currentEpisode := h.fileStore.GetCurrentEpisode()
	recentEpisodes := h.fileStore.GetRecentlyPlayed()
	h.mu.RUnlock()

	data := map[string]interface{}{
		"Title":          "McElroy Radio - Where the goofs never end!",
		"CurrentEpisode": currentEpisode,
		"RecentEpisodes": recentEpisodes,
	}

	h.templates.ExecuteTemplate(w, "home.html", data)
}

// AboutPage renders the about page
func (h *Handler) AboutPage(w http.ResponseWriter, r *http.Request) {
	data := map[string]interface{}{
		"Title": "About McElroy Radio",
	}

	h.templates.ExecuteTemplate(w, "about.html", data)
}

// StreamAudio handles streaming audio to the client
func (h *Handler) StreamAudio(w http.ResponseWriter, r *http.Request) {
	// Set headers for streaming
	w.Header().Set("Content-Type", "audio/mpeg")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Transfer-Encoding", "chunked")

	// Create unique ID for this listener
	listenerID := uuid.New().String()

	// Register as a listener and get data channel
	dataChan := h.player.AddListener(listenerID)

	// Make sure we clean up when the client disconnects
	defer h.player.RemoveListener(listenerID)

	// Set up a notifier for client disconnection
	notify := r.Context().Done()

	// Stream data to client
	for {
		select {
		case data, ok := <-dataChan:
			if !ok {
				// Channel closed, end streaming
				return
			}

			// Write chunk to response
			_, err := w.Write(data)
			if err != nil {
				return
			}

			// Flush to send data immediately
			if flusher, ok := w.(http.Flusher); ok {
				flusher.Flush()
			}

		case <-notify:
			// Client disconnected
			return
		}
	}
}

// NowPlaying returns information about the currently playing episode
func (h *Handler) NowPlaying(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	h.mu.RLock()
	currentEpisode := h.fileStore.GetCurrentEpisode()
	h.mu.RUnlock()

	if currentEpisode == nil {
		http.Error(w, "No episode currently playing", http.StatusNotFound)
		return
	}

	json.NewEncoder(w).Encode(currentEpisode)
}

// RecentlyPlayed returns the recently played episodes
func (h *Handler) RecentlyPlayed(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	h.mu.RLock()
	recentEpisodes := h.fileStore.GetRecentlyPlayed()
	h.mu.RUnlock()

	json.NewEncoder(w).Encode(recentEpisodes)
}

// RandomFact returns a random McElroy fact
func (h *Handler) RandomFact(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	fact := models.GetRandomFact()
	response := map[string]string{"fact": fact}

	json.NewEncoder(w).Encode(response)
}
