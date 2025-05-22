package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"html/template"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
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

	// Check if file exists
	if _, err := os.Stat(episode.AudioPath); os.IsNotExist(err) {
		http.Error(w, "Episode file not found", http.StatusNotFound)
		return
	}

	// Set headers for download
	filename := filepath.Base(episode.AudioPath)
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=\"%s\"", filename))
	w.Header().Set("Content-Type", "audio/mpeg")

	// Serve the file
	http.ServeFile(w, r, episode.AudioPath)
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

// StreamAudio handles streaming audio to the client with proper Range support
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

	// Open the file
	file, err := os.Open(currentEpisode.AudioPath)
	if err != nil {
		log.Printf("Failed to open audio file: %v", err)
		http.Error(w, "Audio file not found", http.StatusNotFound)
		return
	}
	defer file.Close()

	// Get file size
	stat, err := file.Stat()
	if err != nil {
		log.Printf("Failed to stat audio file: %v", err)
		http.Error(w, "Audio file error", http.StatusInternalServerError)
		return
	}
	fileSize := stat.Size()

	// Parse Range header
	rangeHeader := r.Header.Get("Range")
	start, end, err := parseRange(rangeHeader, fileSize)
	if err != nil {
		log.Printf("Invalid range header: %v", err)
		http.Error(w, "Invalid range", http.StatusRequestedRangeNotSatisfiable)
		return
	}

	// Check if this is a "radio sync" request (no range header on first request)
	// In this case, we want to start from the server's current position
	if rangeHeader == "" {
		// Get server's current time position and convert to byte offset
		serverTimePosition := h.player.GetCurrentTimePosition()
		if serverTimePosition > 0 && currentEpisode.Duration > 0 {
			// Estimate byte position based on time
			// For MP3: rough calculation is fileSize / duration * currentTime
			estimatedBytePos := int64(float64(fileSize) * (serverTimePosition / currentEpisode.Duration))

			// Align to a reasonable boundary (every 1KB) to avoid cutting mid-frame
			estimatedBytePos = (estimatedBytePos / 1024) * 1024

			if estimatedBytePos > 0 && estimatedBytePos < fileSize {
				start = estimatedBytePos
				log.Printf("Radio sync: starting from byte %d (time %.2fs)", start, serverTimePosition)
			}
		}
	}

	// Set common headers
	w.Header().Set("Content-Type", "audio/mpeg")
	w.Header().Set("Accept-Ranges", "bytes")
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")

	contentLength := end - start + 1

	if rangeHeader != "" {
		// Partial content response
		w.Header().Set("Content-Range", fmt.Sprintf("bytes %d-%d/%d", start, end, fileSize))
		w.Header().Set("Content-Length", strconv.FormatInt(contentLength, 10))
		w.WriteHeader(http.StatusPartialContent)
		log.Printf("Serving partial content: bytes %d-%d/%d", start, end, fileSize)
	} else {
		// Full content response (but potentially starting from middle)
		w.Header().Set("Content-Length", strconv.FormatInt(contentLength, 10))
		w.WriteHeader(http.StatusOK)
		log.Printf("Serving content from byte %d, length %d", start, contentLength)
	}

	// Seek to start position
	if start > 0 {
		_, err = file.Seek(start, io.SeekStart)
		if err != nil {
			log.Printf("Failed to seek in file: %v", err)
			return
		}
	}

	// Create a limited reader to ensure we don't read past the end
	limitedReader := io.LimitReader(file, contentLength)

	// Stream the content
	buffer := make([]byte, 32768) // 32KB buffer
	written := int64(0)

	for written < contentLength {
		n, err := limitedReader.Read(buffer)
		if err != nil && err != io.EOF {
			log.Printf("Error reading file: %v", err)
			return
		}
		if n == 0 {
			break
		}

		bytesToWrite := int64(n)
		if written+bytesToWrite > contentLength {
			bytesToWrite = contentLength - written
		}

		_, writeErr := w.Write(buffer[:bytesToWrite])
		if writeErr != nil {
			log.Printf("Error writing to client: %v", writeErr)
			return
		}

		// Flush immediately for streaming
		if flusher, ok := w.(http.Flusher); ok {
			flusher.Flush()
		}

		written += bytesToWrite

		// Check if client disconnected
		select {
		case <-r.Context().Done():
			log.Printf("Client disconnected during streaming")
			return
		default:
		}

		// Small delay to control streaming rate
		time.Sleep(10 * time.Millisecond)
	}

	log.Printf("Successfully streamed %d bytes to client", written)
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
