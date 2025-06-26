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
	"github.com/madeofpendletonwool/mcelroy-radio/internal/station"
	"github.com/madeofpendletonwool/mcelroy-radio/internal/storage"
)

// Update the Handler struct to include stationManager
type Handler struct {
	config         *config.Config
	fileStore      *storage.FileStore
	player         *player.RadioPlayer
	stationManager *station.Manager
	analyticsStore *storage.AnalyticsStore // Add this line
	templates      map[string]*template.Template
	mu             sync.RWMutex
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
		"mul": func(a, b float64) float64 {
			return a * b
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
		"toFloat": func(v interface{}) float64 {
			switch val := v.(type) {
			case int:
				return float64(val)
			case int64:
				return float64(val)
			case float64:
				return val
			case float32:
				return float64(val)
			default:
				return 0
			}
		},
	}

	// Read all template files
	layoutPath := filepath.Join(cfg.TemplatesDir, "layout.html")
	homePath := filepath.Join(cfg.TemplatesDir, "pages", "home.html")
	aboutPath := filepath.Join(cfg.TemplatesDir, "pages", "about.html")
	directoryPath := filepath.Join(cfg.TemplatesDir, "pages", "directory.html")
	analyticsPath := filepath.Join(cfg.TemplatesDir, "pages", "analytics.html")

	log.Printf("Loading templates from paths:")
	log.Printf("Layout: %s", layoutPath)
	log.Printf("Home: %s", homePath)
	log.Printf("About: %s", aboutPath)
	log.Printf("Directory: %s", directoryPath)
	log.Printf("Analytics: %s", analyticsPath)

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

	// Analytics template
	analyticsTemplate, err := template.New("analytics").Funcs(funcMap).ParseFiles(layoutPath, analyticsPath)
	if err != nil {
		log.Fatalf("Error parsing analytics template: %v", err)
	}

	// Store templates in a map for easier access
	templates := map[string]*template.Template{
		"home":      homeTemplate,
		"about":     aboutTemplate,
		"directory": directoryTemplate,
		"analytics": analyticsTemplate, // Add this line
	}

	// Debug: Log which templates were loaded
	log.Printf("Successfully loaded templates: %v", func() []string {
		var keys []string
		for k := range templates {
			keys = append(keys, k)
		}
		return keys
	}())

	// Create station manager
	sm := station.NewManager(fs, cfg.StationConfigDir)

	// Create analytics store
	analyticsDir := filepath.Join(cfg.StationConfigDir, "analytics")
	analyticsStore := storage.NewAnalyticsStore(analyticsDir)

	return &Handler{
		config:         cfg,
		fileStore:      fs,
		stationManager: sm,
		analyticsStore: analyticsStore,
		templates:      templates,
		// Remove player reference - we don't need it anymore
	}
}

func (h *Handler) HomePage(w http.ResponseWriter, r *http.Request) {
	log.Println("Rendering home page template")

	// Use "all" station as default for homepage
	currentEpisode := h.stationManager.GetCurrentEpisode("all")
	recentEpisodes := h.stationManager.GetRecentlyPlayed("all")

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
	// Get the requested station from query parameter
	stationID := r.URL.Query().Get("station")
	if stationID == "" {
		stationID = "all" // Default to all shows
	}

	log.Printf("New audio stream request for station '%s' from %s", stationID, r.RemoteAddr)

	// Get current episode from the requested station
	currentEpisode := h.stationManager.GetCurrentEpisode(stationID)
	if currentEpisode == nil {
		log.Printf("No current episode available for station: %s", stationID)
		http.Error(w, "No audio available for this station", http.StatusNotFound)
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

// Update StationList to return all stations (no current station concept)
func (h *Handler) StationList(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	stations := h.stationManager.GetAllStations()
	json.NewEncoder(w).Encode(map[string]interface{}{
		"stations": stations,
		// Remove current_station - it's client-side only now
	})
}

func (h *Handler) StationInfo(w http.ResponseWriter, r *http.Request) {
	stationID := r.URL.Query().Get("id")
	if stationID == "" {
		stationID = "all" // Default to all shows
	}

	station := h.stationManager.GetStation(stationID)
	if station == nil {
		http.Error(w, "Station not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(station)
}

func (h *Handler) StreamPosition(w http.ResponseWriter, r *http.Request) {
	stationID := r.URL.Query().Get("station")
	if stationID == "" {
		stationID = "all" // Default
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")

	currentEpisode := h.stationManager.GetCurrentEpisode(stationID)

	response := map[string]interface{}{
		"station":       stationID,
		"position":      h.stationManager.GetCurrentPosition(stationID),
		"time_position": h.stationManager.GetCurrentTimePosition(stationID),
		"timestamp":     time.Now().Unix(),
		"is_playing":    true, // All stations are always playing
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

func (h *Handler) ServeManifest(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	manifest := `{
  "name": "McElroy Radio",
  "short_name": "McElroy Radio",
  "description": "24/7 internet radio station playing McElroy family podcasts - where the goofs never end!",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0f172a",
  "theme_color": "#5e60ce",
  "icons": [
    {
      "src": "/static/img/radio.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}`
	w.Write([]byte(manifest))
}

// Updated NowPlaying handler in handlers.go
func (h *Handler) NowPlaying(w http.ResponseWriter, r *http.Request) {
	stationID := r.URL.Query().Get("station")
	if stationID == "" {
		stationID = "all" // Default
	}

	w.Header().Set("Content-Type", "application/json")

	currentEpisode := h.stationManager.GetCurrentEpisode(stationID)
	if currentEpisode == nil {
		http.Error(w, "No episode currently playing on this station", http.StatusNotFound)
		return
	}

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

		// Stream info for this station
		"station_id":       stationID,
		"current_position": h.stationManager.GetCurrentPosition(stationID),
		"time_position":    h.stationManager.GetCurrentTimePosition(stationID),
		"is_playing":       true, // All stations always playing
	}

	json.NewEncoder(w).Encode(response)
}

// RecentlyPlayed returns the recently played episodes
func (h *Handler) RecentlyPlayed(w http.ResponseWriter, r *http.Request) {
	stationID := r.URL.Query().Get("station")
	if stationID == "" {
		stationID = "all" // Default
	}

	w.Header().Set("Content-Type", "application/json")

	recentEpisodes := h.stationManager.GetRecentlyPlayed(stationID)
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

// AnalyticsPage serves the analytics dashboard
func (h *Handler) AnalyticsPage(w http.ResponseWriter, r *http.Request) {
	summary := h.analyticsStore.GetSummary()
	recentVisits := h.analyticsStore.GetRecentVisits(50)

	data := map[string]interface{}{
		"Title":        "Analytics Dashboard - McElroy Radio",
		"Summary":      summary,
		"RecentVisits": recentVisits,
		"CurrentYear":  time.Now().Year(),
	}

	// Try to render HTML template first
	if h.templates["analytics"] != nil {
		var buf bytes.Buffer
		err := h.templates["analytics"].ExecuteTemplate(&buf, "layout.html", data)
		if err != nil {
			log.Printf("Analytics template execution error: %v", err)
			// Fall back to JSON
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(data)
			return
		}
		w.Header().Set("Content-Type", "text/html")
		w.Write(buf.Bytes())
		return
	}

	// Fallback to JSON if no template
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}

// AnalyticsAPI returns analytics data as JSON
func (h *Handler) AnalyticsAPI(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	dataType := r.URL.Query().Get("type")

	switch dataType {
	case "recent":
		limit := 100
		if limitStr := r.URL.Query().Get("limit"); limitStr != "" {
			if parsedLimit, err := strconv.Atoi(limitStr); err == nil && parsedLimit > 0 {
				limit = parsedLimit
			}
		}
		recentVisits := h.analyticsStore.GetRecentVisits(limit)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"visits": recentVisits,
		})

	case "timeseries":
		period := r.URL.Query().Get("period")
		if period == "" {
			period = "hour" // default to hourly
		}

		// Validate period
		validPeriods := map[string]bool{
			"hour":  true,
			"day":   true,
			"week":  true,
			"month": true,
		}

		if !validPeriods[period] {
			http.Error(w, "Invalid period. Must be one of: hour, day, week, month", http.StatusBadRequest)
			return
		}

		timeSeriesData := h.analyticsStore.GetTimeSeriesData(period)
		json.NewEncoder(w).Encode(timeSeriesData)

	default:
		summary := h.analyticsStore.GetSummary()
		json.NewEncoder(w).Encode(summary)
	}
}

// AnalyticsMiddleware tracks visits for analytics
func (h *Handler) AnalyticsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if h.shouldSkipTracking(r.URL.Path) {
			next.ServeHTTP(w, r)
			return
		}

		clientIP := models.GetRealIP(
			r.RemoteAddr,
			r.Header.Get("X-Forwarded-For"),
			r.Header.Get("X-Real-IP"),
		)

		go h.analyticsStore.RecordVisit(
			clientIP,
			r.URL.Path,
			r.Header.Get("User-Agent"),
		)

		next.ServeHTTP(w, r)
	})
}

// shouldSkipTracking determines if a request should be tracked
func (h *Handler) shouldSkipTracking(path string) bool {
	if strings.HasPrefix(path, "/static/") {
		return true
	}

	skipPaths := []string{
		"/stream",
		"/now-playing",
		"/stream-position",
		"/favicon.ico",
		"/manifest.json",
		"/analytics",
		"/analytics-api",
	}

	for _, skipPath := range skipPaths {
		if path == skipPath || strings.HasPrefix(path, skipPath) {
			return true
		}
	}

	return false
}

// NEW: StreamEpisode streams a specific episode from the beginning
func (h *Handler) StreamEpisode(w http.ResponseWriter, r *http.Request) {
	episodeID := r.URL.Query().Get("id")
	if episodeID == "" {
		log.Printf("StreamEpisode request missing episode ID")
		http.Error(w, "Episode ID required", http.StatusBadRequest)
		return
	}

	// URL decode the episode ID
	decodedID, err := url.QueryUnescape(episodeID)
	if err != nil {
		log.Printf("Failed to decode episode ID: %v", err)
		decodedID = episodeID
	}

	log.Printf("StreamEpisode request for episode ID: %s (decoded: %s)", episodeID, decodedID)

	h.mu.RLock()
	episode := h.fileStore.GetEpisodeByID(decodedID)
	h.mu.RUnlock()

	if episode == nil {
		log.Printf("Episode not found for ID: %s", decodedID)
		http.Error(w, "Episode not found", http.StatusNotFound)
		return
	}

	// Check if file exists
	if _, err := os.Stat(episode.AudioPath); os.IsNotExist(err) {
		log.Printf("Episode file not found on disk: %s", episode.AudioPath)
		http.Error(w, "Episode file not found", http.StatusNotFound)
		return
	}

	// Open the file
	file, err := os.Open(episode.AudioPath)
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

	// Parse Range header (for seeking during playback)
	rangeHeader := r.Header.Get("Range")
	start, end, err := parseRange(rangeHeader, fileSize)
	if err != nil {
		log.Printf("Invalid range header: %v", err)
		http.Error(w, "Invalid range", http.StatusRequestedRangeNotSatisfiable)
		return
	}

	// For episode streaming, we always start from the beginning unless there's a range request
	if rangeHeader == "" {
		start = 0
		end = fileSize - 1
	}

	// Set common headers
	w.Header().Set("Content-Type", "audio/mpeg")
	w.Header().Set("Accept-Ranges", "bytes")
	w.Header().Set("Cache-Control", "no-cache, no-store, must-revalidate")
	w.Header().Set("Pragma", "no-cache")
	w.Header().Set("Expires", "0")

	// Set episode-specific headers for client identification
	w.Header().Set("X-Episode-ID", episode.ID)
	w.Header().Set("X-Episode-Title", episode.Title)
	w.Header().Set("X-Show-Name", episode.ShowName)
	w.Header().Set("X-Episode-Duration", fmt.Sprintf("%.2f", episode.Duration))

	contentLength := end - start + 1

	if rangeHeader != "" {
		// Partial content response
		w.Header().Set("Content-Range", fmt.Sprintf("bytes %d-%d/%d", start, end, fileSize))
		w.Header().Set("Content-Length", strconv.FormatInt(contentLength, 10))
		w.WriteHeader(http.StatusPartialContent)
		log.Printf("Serving partial episode content: bytes %d-%d/%d for %s", start, end, fileSize, episode.Title)
	} else {
		// Full content response
		w.Header().Set("Content-Length", strconv.FormatInt(contentLength, 10))
		w.WriteHeader(http.StatusOK)
		log.Printf("Serving full episode: %s (%s)", episode.Title, episode.ShowName)
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
			log.Printf("Client disconnected during episode streaming")
			return
		default:
		}

		// Small delay to control streaming rate
		time.Sleep(10 * time.Millisecond)
	}

	log.Printf("Successfully streamed %d bytes of episode: %s", written, episode.Title)
}
