package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"html/template"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

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
	// Update your funcMap in handlers.go New function
	funcMap := template.FuncMap{
		"currentYear": func() int {
			return time.Now().Year()
		},
		"formatTime": func(t time.Time) string {
			return t.Format("Jan 02, 2006 15:04")
		},
		"div": func(a, b float64) float64 {
			if b == 0 {
				return 0
			}
			return a / b
		},
		"divInt": func(a int64, b int64) float64 {
			if b == 0 {
				return 0
			}
			return float64(a) / float64(b)
		},
		"replaceSpaces": func(s string) string {
			return strings.ReplaceAll(s, " ", "-")
		},
		"formatDuration": func(seconds float64) string {
			if seconds <= 0 {
				return "0m"
			}
			minutes := int(seconds / 60)
			if minutes < 60 {
				return fmt.Sprintf("%dm", minutes)
			}
			hours := minutes / 60
			remainingMinutes := minutes % 60
			return fmt.Sprintf("%dh %dm", hours, remainingMinutes)
		},
		"formatFileSize": func(bytes int64) string {
			if bytes <= 0 {
				return "0 MB"
			}
			mb := float64(bytes) / 1024 / 1024
			return fmt.Sprintf("%.1f MB", mb)
		},
		"toFloat": func(i int64) float64 {
			return float64(i)
		},
	}

	// Read all template files
	layoutPath := filepath.Join(cfg.TemplatesDir, "layout.html")
	homePath := filepath.Join(cfg.TemplatesDir, "pages", "home.html")
	aboutPath := filepath.Join(cfg.TemplatesDir, "pages", "about.html")
	directoryPath := filepath.Join(cfg.TemplatesDir, "pages", "directory.html")

	log.Printf("Loading templates from paths:")
	log.Printf("Layout: %s", layoutPath)
	log.Printf("Home: %s", homePath)
	log.Printf("About: %s", aboutPath)
	log.Printf("Directory: %s", directoryPath)

	// Check if directory template file exists
	if _, err := os.Stat(directoryPath); os.IsNotExist(err) {
		log.Fatalf("Directory template file does not exist: %s", directoryPath)
	}

	// Create separate templates for each page
	homeTemplate, err := template.New("home").Funcs(funcMap).ParseFiles(layoutPath, homePath)
	if err != nil {
		log.Fatalf("Error parsing home template: %v", err)
	}

	aboutTemplate, err := template.New("about").Funcs(funcMap).ParseFiles(layoutPath, aboutPath)
	if err != nil {
		log.Fatalf("Error parsing about template: %v", err)
	}

	directoryTemplate, err := template.New("directory").Funcs(funcMap).ParseFiles(layoutPath, directoryPath)
	if err != nil {
		log.Fatalf("Error parsing directory template: %v", err)
	}

	// Store templates in a map for easier access
	templates := map[string]*template.Template{
		"home":      homeTemplate,
		"about":     aboutTemplate,
		"directory": directoryTemplate,
	}

	// Debug: Log which templates were loaded
	log.Printf("Successfully loaded templates: %v", func() []string {
		var keys []string
		for k := range templates {
			keys = append(keys, k)
		}
		return keys
	}())

	// Create player
	p, err := player.New(fs)
	if err != nil {
		log.Fatalf("Failed to create player: %v", err)
	}

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

	var buf bytes.Buffer
	err := h.templates["home"].ExecuteTemplate(&buf, "layout.html", data)
	if err != nil {
		log.Printf("Template execution error: %v", err)
		http.Error(w, "Error rendering page", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/html")
	w.Write(buf.Bytes())
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

	w.Header().Set("Content-Type", "text/html")
	w.Write(buf.Bytes())
}

// DirectoryPage renders the episode directory page
func (h *Handler) DirectoryPage(w http.ResponseWriter, r *http.Request) {
	log.Println("Rendering directory page template")

	h.mu.RLock()
	allEpisodes := h.fileStore.GetAllEpisodes()
	h.mu.RUnlock()

	// Organize episodes by show
	showsMap := make(map[string][]*models.Episode)
	for _, episode := range allEpisodes {
		showName := episode.ShowName
		if showName == "" {
			showName = "Unknown Show"
		}
		showsMap[showName] = append(showsMap[showName], episode)
	}

	// Convert to slice of show objects for easier template handling
	type ShowData struct {
		Name          string
		Episodes      []*models.Episode
		EpisodeCount  int
		TotalDuration float64
	}

	var shows []ShowData
	for showName, episodes := range showsMap {
		// Sort episodes by date (newest first)
		sort.Slice(episodes, func(i, j int) bool {
			return episodes[i].PublishedAt.After(episodes[j].PublishedAt)
		})

		totalDuration := 0.0
		for _, ep := range episodes {
			totalDuration += ep.Duration
		}

		shows = append(shows, ShowData{
			Name:          showName,
			Episodes:      episodes,
			EpisodeCount:  len(episodes),
			TotalDuration: totalDuration,
		})
	}

	// Sort shows alphabetically for consistent ordering
	sort.Slice(shows, func(i, j int) bool {
		return shows[i].Name < shows[j].Name
	})

	data := map[string]interface{}{
		"Title":         "Episode Directory - McElroy Radio",
		"Shows":         shows,
		"TotalEpisodes": len(allEpisodes),
		"CurrentYear":   time.Now().Year(),
	}

	var buf bytes.Buffer
	err := h.templates["directory"].ExecuteTemplate(&buf, "layout.html", data)
	if err != nil {
		log.Printf("Template execution error: %v", err)
		http.Error(w, "Error rendering page", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/html")
	w.Write(buf.Bytes())
}

// EpisodeDetails returns detailed information about a specific episode
func (h *Handler) EpisodeDetails(w http.ResponseWriter, r *http.Request) {
	episodeID := r.URL.Query().Get("id")
	if episodeID == "" {
		http.Error(w, "Episode ID required", http.StatusBadRequest)
		return
	}

	h.mu.RLock()
	episode := h.fileStore.GetEpisodeByID(episodeID)
	h.mu.RUnlock()

	if episode == nil {
		http.Error(w, "Episode not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(episode)
}

// DownloadEpisode serves the audio file for download
func (h *Handler) DownloadEpisode(w http.ResponseWriter, r *http.Request) {
	episodeID := r.URL.Query().Get("id")
	if episodeID == "" {
		log.Printf("Download request missing episode ID")
		http.Error(w, "Episode ID required", http.StatusBadRequest)
		return
	}

	// URL decode the episode ID in case it's encoded
	decodedID, err := url.QueryUnescape(episodeID)
	if err != nil {
		log.Printf("Failed to decode episode ID: %v", err)
		// Try with the original ID if decoding fails
		decodedID = episodeID
	}

	log.Printf("Download request for episode ID: %s (decoded: %s)", episodeID, decodedID)

	h.mu.RLock()
	episode := h.fileStore.GetEpisodeByID(decodedID)
	h.mu.RUnlock()

	if episode == nil {
		log.Printf("Episode not found for ID: %s", decodedID)

		// Try to find by original ID if decoded version failed
		if decodedID != episodeID {
			h.mu.RLock()
			episode = h.fileStore.GetEpisodeByID(episodeID)
			h.mu.RUnlock()
		}

		if episode == nil {
			// List available episodes for debugging
			h.mu.RLock()
			allEpisodes := h.fileStore.GetAllEpisodes()
			h.mu.RUnlock()

			log.Printf("Available episode IDs:")
			for i, ep := range allEpisodes {
				if i < 5 { // Only log first 5 to avoid spam
					log.Printf("  - %s", ep.ID)
				}
			}

			http.Error(w, "Episode not found", http.StatusNotFound)
			return
		}
	}

	// Check if file exists
	if _, err := os.Stat(episode.AudioPath); os.IsNotExist(err) {
		log.Printf("Episode file not found on disk: %s", episode.AudioPath)
		http.Error(w, "Episode file not found", http.StatusNotFound)
		return
	}

	// Set headers for download
	filename := filepath.Base(episode.AudioPath)
	// Clean filename for download (remove problematic characters)
	safeFilename := strings.ReplaceAll(filename, ":", "_")
	safeFilename = strings.ReplaceAll(safeFilename, "\"", "_")

	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", safeFilename))
	w.Header().Set("Content-Type", "audio/mpeg")

	// Get file size for Content-Length header
	if stat, err := os.Stat(episode.AudioPath); err == nil {
		w.Header().Set("Content-Length", strconv.FormatInt(stat.Size(), 10))
	}

	log.Printf("Starting download of: %s (%s)", episode.Title, filename)

	// Serve the file
	http.ServeFile(w, r, episode.AudioPath)

	log.Printf("Download completed for: %s", filename)
}

// parseRange parses HTTP Range header
func parseRange(rangeHeader string, fileSize int64) (start, end int64, err error) {
	if rangeHeader == "" {
		return 0, fileSize - 1, nil
	}

	// Remove "bytes=" prefix
	rangeHeader = strings.TrimPrefix(rangeHeader, "bytes=")

	// Handle single range (we don't support multipart ranges)
	parts := strings.Split(rangeHeader, "-")
	if len(parts) != 2 {
		return 0, 0, fmt.Errorf("invalid range format")
	}

	startStr, endStr := parts[0], parts[1]

	// Parse start
	if startStr == "" {
		// Suffix range: -500 means last 500 bytes
		if endStr == "" {
			return 0, 0, fmt.Errorf("invalid range format")
		}
		suffixLength, err := strconv.ParseInt(endStr, 10, 64)
		if err != nil {
			return 0, 0, err
		}
		start = fileSize - suffixLength
		if start < 0 {
			start = 0
		}
		end = fileSize - 1
	} else {
		// Regular range
		start, err = strconv.ParseInt(startStr, 10, 64)
		if err != nil {
			return 0, 0, err
		}

		if endStr == "" {
			// Open-ended: 500- means from byte 500 to end
			end = fileSize - 1
		} else {
			end, err = strconv.ParseInt(endStr, 10, 64)
			if err != nil {
				return 0, 0, err
			}
		}
	}

	// Validate range
	if start < 0 || end >= fileSize || start > end {
		return 0, 0, fmt.Errorf("invalid range")
	}

	return start, end, nil
}

// StreamAudio redirects to the RSS audio URL with time offset for radio sync
func (h *Handler) StreamAudio(w http.ResponseWriter, r *http.Request) {
	log.Printf("New audio stream request from %s", r.RemoteAddr)

	// Get current episode
	h.mu.RLock()
	currentEpisode := h.fileStore.GetCurrentEpisode()
	h.mu.RUnlock()

	if currentEpisode == nil {
		log.Printf("No current episode available")
		http.Error(w, "No audio available", http.StatusNotFound)
		return
	}

	// Get the RSS audio URL (AudioPath now contains the RSS URL)
	audioURL := currentEpisode.AudioPath
	if audioURL == "" {
		log.Printf("No audio URL available for episode: %s", currentEpisode.Title)
		http.Error(w, "No audio URL available", http.StatusNotFound)
		return
	}

	// Check if this is a "radio sync" request (no range header on first request)
	// In this case, we want to provide time sync information to the client
	rangeHeader := r.Header.Get("Range")
	if rangeHeader == "" {
		// Get server's current time position for radio sync
		serverTimePosition := h.player.GetCurrentTimePosition()

		// Return a JSON response with the audio URL and time offset
		// The client will then make the request to the RSS URL
		syncInfo := map[string]interface{}{
			"audio_url": audioURL,
			"time_offset": serverTimePosition,
			"episode_id": currentEpisode.ID,
			"title": currentEpisode.Title,
			"show_name": currentEpisode.ShowName,
			"duration": currentEpisode.Duration,
		}

		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
		w.Header().Set("Pragma", "no-cache")
		w.Header().Set("Expires", "0")

		if err := json.NewEncoder(w).Encode(syncInfo); err != nil {
			log.Printf("Error encoding sync info: %v", err)
			http.Error(w, "Error encoding response", http.StatusInternalServerError)
			return
		}

		log.Printf("Provided sync info for episode: %s (time offset: %.2fs)", currentEpisode.Title, serverTimePosition)
		return
	}

	// If there's a range header, this is likely a direct audio request
	// We should redirect to the RSS URL and let the client handle the range request
	log.Printf("Redirecting audio request to RSS URL: %s", audioURL)

	// Use a temporary redirect so the client makes the request to the RSS URL
	// This ensures the download is tracked by the RSS host
	http.Redirect(w, r, audioURL, http.StatusTemporaryRedirect)
}

func (h *Handler) StreamPosition(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")

	streamInfo := h.player.GetStreamInfo()
	currentEpisode := h.fileStore.GetCurrentEpisode()

	response := map[string]interface{}{
		"position":       h.player.GetCurrentPosition(),
		"time_position":  h.player.GetCurrentTimePosition(),
		"timestamp":      time.Now().Unix(),
		"is_playing":     streamInfo["is_playing"],
		"listener_count": h.player.GetListenerCount(),
	}

	if currentEpisode != nil {
		response["episode_id"] = currentEpisode.ID
		response["show_name"] = currentEpisode.ShowName
		response["title"] = currentEpisode.Title
		response["artist"] = currentEpisode.Artist
		response["album"] = currentEpisode.Album
		response["duration"] = currentEpisode.Duration
	}

	json.NewEncoder(w).Encode(response)
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

	// Include stream information
	streamInfo := h.player.GetStreamInfo()

	// Create response with both episode and stream info
	response := map[string]interface{}{
		"id":           currentEpisode.ID,
		"title":        currentEpisode.Title,
		"show_name":    currentEpisode.ShowName,
		"artist":       currentEpisode.Artist,
		"album":        currentEpisode.Album,
		"genre":        currentEpisode.Genre,
		"description":  currentEpisode.Description,
		"audio_path":   currentEpisode.AudioPath,
		"image_path":   currentEpisode.ImagePath,
		"duration":     currentEpisode.Duration,
		"published_at": currentEpisode.PublishedAt,
		"played_at":    currentEpisode.PlayedAt,
		"random_fact":  currentEpisode.RandomFact,
		"file_size":    currentEpisode.FileSize,

		// Stream info
		"current_position": streamInfo["current_position"],
		"time_position":    streamInfo["time_position"],
		"is_playing":       streamInfo["is_playing"],
		"listener_count":   h.player.GetListenerCount(),
	}

	json.NewEncoder(w).Encode(response)
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

// StreamHealth returns health information about the stream
func (h *Handler) StreamHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	streamInfo := h.player.GetStreamInfo()
	currentEpisode := h.fileStore.GetCurrentEpisode()

	health := map[string]interface{}{
		"status":         "healthy",
		"stream_active":  streamInfo["is_playing"],
		"listener_count": h.player.GetListenerCount(),
		"uptime":         time.Since(streamInfo["stream_start"].(time.Time)).Seconds(),
	}

	if currentEpisode != nil {
		health["current_episode"] = currentEpisode.Title
		health["current_show"] = currentEpisode.ShowName
	}

	json.NewEncoder(w).Encode(health)
}
