package handlers

import (
	"bytes"
	"encoding/json"
	"html/template"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"

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
	templates map[string]*template.Template
	mu        sync.RWMutex
}

func New(cfg *config.Config, fs *storage.FileStore) *Handler {
	// Create a template with functions
	funcMap := template.FuncMap{
		"currentYear": func() int {
			return time.Now().Year()
		},
		"formatTime": func(t time.Time) string {
			return t.Format("Jan 02, 2006 15:04")
		},
	}

	// Read all template files
	layoutPath := filepath.Join(cfg.TemplatesDir, "layout.html")
	homePath := filepath.Join(cfg.TemplatesDir, "pages", "home.html")
	aboutPath := filepath.Join(cfg.TemplatesDir, "pages", "about.html")

	log.Printf("Loading templates from paths:")
	log.Printf("Layout: %s", layoutPath)
	log.Printf("Home: %s", homePath)
	log.Printf("About: %s", aboutPath)

	// Create separate templates for each page
	homeTemplate, err := template.New("home").Funcs(funcMap).ParseFiles(layoutPath, homePath)
	if err != nil {
		log.Fatalf("Error parsing home template: %v", err)
	}

	aboutTemplate, err := template.New("about").Funcs(funcMap).ParseFiles(layoutPath, aboutPath)
	if err != nil {
		log.Fatalf("Error parsing about template: %v", err)
	}

	// Read the home template file content to debug
	homeContent, err := os.ReadFile(homePath)
	if err != nil {
		log.Printf("Error reading home template: %v", err)
	} else {
		log.Printf("Home template content: %s", string(homeContent[:100])) // Print first 100 chars
	}

	// Store templates in a map for easier access
	templates := map[string]*template.Template{
		"home":  homeTemplate,
		"about": aboutTemplate,
	}

	// Create player
	p, _ := player.New(fs)

	return &Handler{
		config:    cfg,
		fileStore: fs,
		player:    p,
		templates: templates,
	}
}

func (h *Handler) HomePage(w http.ResponseWriter, r *http.Request) {
	log.Println("Rendering home page template")

	h.mu.RLock()
	currentEpisode := h.fileStore.GetCurrentEpisode()
	recentEpisodes := h.fileStore.GetRecentlyPlayed()
	h.mu.RUnlock()

	data := map[string]interface{}{
		"Title":          "McElroy Radio - Where the goofs never end!",
		"CurrentEpisode": currentEpisode,
		"RecentEpisodes": recentEpisodes,
		"CurrentYear":    time.Now().Year(),
	}

	// Debug output for template data
	log.Printf("Template data: %+v", data)

	var buf bytes.Buffer
	err := h.templates["home"].ExecuteTemplate(&buf, "layout.html", data)
	if err != nil {
		log.Printf("Template execution error: %v", err)
		http.Error(w, "Error rendering page", http.StatusInternalServerError)
		return
	}

	output := buf.String()
	log.Printf("Home template output length: %d bytes", len(output))

	w.Write([]byte(output))
}

func (h *Handler) AboutPage(w http.ResponseWriter, r *http.Request) {
	log.Println("Rendering about page template")

	data := map[string]interface{}{
		"Title":       "About McElroy Radio",
		"CurrentYear": time.Now().Year(),
	}

	var buf bytes.Buffer
	err := h.templates["about"].ExecuteTemplate(&buf, "layout.html", data)
	if err != nil {
		log.Printf("Template execution error: %v", err)
		http.Error(w, "Error rendering page", http.StatusInternalServerError)
		return
	}

	output := buf.String()
	log.Printf("About template output length: %d bytes", len(output))

	w.Write([]byte(output))
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
