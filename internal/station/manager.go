package station

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"math/rand"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/madeofpendletonwool/mcelroy-radio/internal/models"
	"github.com/madeofpendletonwool/mcelroy-radio/internal/storage"
)

// Manager handles multiple radio stations with independent time progression
type Manager struct {
	stations   map[string]*models.Station
	fileStore  *storage.FileStore
	configPath string
	mutex      sync.RWMutex
	rng        *rand.Rand

	// Remove currentStation - each user tracks their own
	stationTickers map[string]*time.Ticker // Individual tickers for each station
	stopChannels   map[string]chan bool    // Stop channels for each station
}

// NewManager creates a new station manager
func NewManager(fileStore *storage.FileStore, configPath string) *Manager {
	source := rand.NewSource(time.Now().UnixNano())
	rng := rand.New(source)

	m := &Manager{
		stations:       make(map[string]*models.Station),
		fileStore:      fileStore,
		configPath:     configPath,
		rng:            rng,
		stationTickers: make(map[string]*time.Ticker),
		stopChannels:   make(map[string]chan bool),
	}

	m.initializeStations()
	m.startAllStationProgression() // Start ALL stations progressing

	return m
}

// initializeStations creates all the stations
func (m *Manager) initializeStations() {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	log.Printf("Initializing radio stations...")

	// 1. Create "All Shows" station (default)
	allStation := &models.Station{
		ID:             "all",
		Name:           "All Shows",
		Description:    "Every McElroy podcast mixed together",
		Type:           "all",
		Shows:          []string{}, // Empty means all shows
		PlayedEpisodes: make(map[string]bool),
		IsPlaying:      true, // All stations are always playing
		Color:          "#5e60ce",
		Icon:           "fa-radio",
	}
	m.stations["all"] = allStation

	// 2. Auto-generate stations per show
	allEpisodes := m.fileStore.GetAllEpisodes()
	showsMap := make(map[string]bool)

	// Collect unique show names
	for _, episode := range allEpisodes {
		if episode.ShowName != "" {
			showsMap[episode.ShowName] = true
		}
	}

	// Create station for each show
	for showName := range showsMap {
		stationID := m.slugify(showName)
		station := &models.Station{
			ID:             stationID,
			Name:           showName,
			Description:    fmt.Sprintf("24/7 %s episodes", showName),
			Type:           "show",
			Shows:          []string{showName},
			PlayedEpisodes: make(map[string]bool),
			IsPlaying:      true, // All stations always playing
			Color:          m.getShowColor(showName),
			Icon:           m.getShowIcon(showName),
		}
		m.stations[stationID] = station
		log.Printf("Created station: %s (%s)", showName, stationID)
	}

	// 3. Load custom stations from config
	m.loadCustomStations()

	// 4. Initialize episodes for all stations
	m.updateAllStationEpisodes()

	// 5. Set initial episodes for each station
	for _, station := range m.stations {
		m.selectInitialEpisode(station)
	}

	log.Printf("Initialized %d radio stations", len(m.stations))
}

// startAllStationProgression starts independent time progression for ALL stations
func (m *Manager) startAllStationProgression() {
	for stationID := range m.stations {
		m.startStationProgression(stationID)
	}
}

// startStationProgression starts time progression for a specific station
func (m *Manager) startStationProgression(stationID string) {
	// Stop existing progression if any
	m.stopStationProgression(stationID)

	stopChan := make(chan bool)
	ticker := time.NewTicker(5 * time.Second)

	m.stationTickers[stationID] = ticker
	m.stopChannels[stationID] = stopChan

	go func(id string) {
		log.Printf("Started time progression for station: %s", id)

		for {
			select {
			case <-ticker.C:
				m.checkStationProgress(id)
			case <-stopChan:
				log.Printf("Stopped time progression for station: %s", id)
				ticker.Stop()
				return
			}
		}
	}(stationID)
}

// stopStationProgression stops time progression for a specific station
func (m *Manager) stopStationProgression(stationID string) {
	if ticker, exists := m.stationTickers[stationID]; exists {
		ticker.Stop()
		delete(m.stationTickers, stationID)
	}

	if stopChan, exists := m.stopChannels[stationID]; exists {
		close(stopChan)
		delete(m.stopChannels, stationID)
	}
}

// checkStationProgress checks if a specific station needs to advance episodes
func (m *Manager) checkStationProgress(stationID string) {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	station := m.stations[stationID]
	if station == nil || station.CurrentEpisode == nil {
		return
	}

	// Calculate playing time
	playingTime := time.Since(station.EpisodeStartTime).Seconds()

	// If episode is finished, advance to next
	if station.CurrentEpisode.Duration > 0 && playingTime >= station.CurrentEpisode.Duration {
		log.Printf("Station %s episode finished, advancing", station.Name)
		m.advanceStationEpisode(station)
	}

	// Update position
	station.TimePosition = playingTime
	bytesPerSecond := int64(16000) // Rough estimate for MP3
	station.CurrentPosition = int64(playingTime * float64(bytesPerSecond))
}

// advanceStationEpisode moves a station to its next episode
func (m *Manager) advanceStationEpisode(station *models.Station) {
	if len(station.Episodes) == 0 {
		return
	}

	// Add current to recently played
	if station.CurrentEpisode != nil {
		station.CurrentEpisode.PlayedAt = time.Now()
		station.RecentlyPlayed = append([]*models.Episode{station.CurrentEpisode}, station.RecentlyPlayed...)
		if len(station.RecentlyPlayed) > 10 {
			station.RecentlyPlayed = station.RecentlyPlayed[:10]
		}
		log.Printf("Station %s finished episode: %s", station.Name, station.CurrentEpisode.Title)
	}

	// Find unplayed episodes
	var unplayedEpisodes []*models.Episode
	for _, episode := range station.Episodes {
		if !station.PlayedEpisodes[episode.ID] {
			unplayedEpisodes = append(unplayedEpisodes, episode)
		}
	}

	// If all played, reset
	if len(unplayedEpisodes) == 0 {
		log.Printf("Station %s completed cycle, resetting", station.Name)
		station.PlayedEpisodes = make(map[string]bool)
		unplayedEpisodes = station.Episodes
	}

	// Select random unplayed episode
	randomIndex := m.rng.Intn(len(unplayedEpisodes))
	station.CurrentEpisode = unplayedEpisodes[randomIndex]

	// CRITICAL: Reset all timing when advancing to new episode
	station.EpisodeStartTime = time.Now()
	station.TimePosition = 0
	station.CurrentPosition = 0

	// Mark as played and refresh random fact
	station.PlayedEpisodes[station.CurrentEpisode.ID] = true
	station.CurrentEpisode.RandomFact = models.GetRandomFact()

	log.Printf("Station %s advanced to new episode: %s (duration: %.2fs)",
		station.Name, station.CurrentEpisode.Title, station.CurrentEpisode.Duration)
}

// loadCustomStations loads custom stations from config file
func (m *Manager) loadCustomStations() {
	if m.configPath == "" {
		return
	}

	configFile := filepath.Join(m.configPath, "stations.json")
	if _, err := os.Stat(configFile); os.IsNotExist(err) {
		// Create example config file
		m.createExampleConfig(configFile)
		return
	}

	data, err := ioutil.ReadFile(configFile)
	if err != nil {
		log.Printf("Error reading station config: %v", err)
		return
	}

	var config models.StationConfig
	if err := json.Unmarshal(data, &config); err != nil {
		log.Printf("Error parsing station config: %v", err)
		return
	}

	for _, customStation := range config.Stations {
		station := &models.Station{
			ID:             customStation.ID,
			Name:           customStation.Name,
			Description:    customStation.Description,
			Type:           "custom",
			Shows:          customStation.Shows,
			PlayedEpisodes: make(map[string]bool),
			IsPlaying:      true, // All stations always playing
			Color:          customStation.Color,
			Icon:           customStation.Icon,
		}

		if station.Color == "" {
			station.Color = "#64dfdf"
		}
		if station.Icon == "" {
			station.Icon = "fa-podcast"
		}

		m.stations[customStation.ID] = station
		log.Printf("Loaded custom station: %s", customStation.Name)
	}
}

// createExampleConfig creates an example station config file
func (m *Manager) createExampleConfig(configFile string) {
	exampleConfig := models.StationConfig{
		Stations: []models.CustomStation{
			{
				ID:          "mcelroy_brothers",
				Name:        "McElroy Brothers",
				Description: "Just the main three brothers",
				Shows:       []string{"My Brother, My Brother and Me", "The Adventure Zone"},
				Color:       "#ff7c7c",
				Icon:        "fa-users",
			},
			{
				ID:          "educational",
				Name:        "Educational Hour",
				Description: "Learn something new",
				Shows:       []string{"Sawbones", "Shmanners"},
				Color:       "#16a085",
				Icon:        "fa-graduation-cap",
			},
		},
	}

	os.MkdirAll(filepath.Dir(configFile), 0755)
	data, _ := json.MarshalIndent(exampleConfig, "", "  ")
	ioutil.WriteFile(configFile, data, 0644)
	log.Printf("Created example station config at: %s", configFile)
}

// updateAllStationEpisodes updates episode lists for all stations
func (m *Manager) updateAllStationEpisodes() {
	allEpisodes := m.fileStore.GetAllEpisodes()
	for _, station := range m.stations {
		station.UpdateEpisodes(allEpisodes)
		log.Printf("Station %s has %d episodes", station.Name, len(station.Episodes))
	}
}

// selectInitialEpisode selects a random starting episode for a station
func (m *Manager) selectInitialEpisode(station *models.Station) {
	if len(station.Episodes) == 0 {
		return
	}

	randomIndex := m.rng.Intn(len(station.Episodes))
	station.CurrentEpisode = station.Episodes[randomIndex]
	station.EpisodeStartTime = time.Now()
	station.PlayedEpisodes[station.CurrentEpisode.ID] = true
	station.CurrentEpisode.RandomFact = models.GetRandomFact()

	log.Printf("Station %s starting with: %s", station.Name, station.CurrentEpisode.Title)
}

// Public methods for the handler

// GetAllStations returns all available stations
func (m *Manager) GetAllStations() []*models.Station {
	m.mutex.RLock()
	defer m.mutex.RUnlock()

	var stations []*models.Station
	for _, station := range m.stations {
		stations = append(stations, station)
	}
	return stations
}

// GetStation returns a specific station by ID
func (m *Manager) GetStation(stationID string) *models.Station {
	m.mutex.RLock()
	defer m.mutex.RUnlock()
	return m.stations[stationID]
}

// GetCurrentEpisode returns the current episode from a specific station
func (m *Manager) GetCurrentEpisode(stationID string) *models.Episode {
	if stationID == "" {
		stationID = "all" // Default to "all" station
	}

	m.mutex.RLock()
	defer m.mutex.RUnlock()

	station := m.stations[stationID]
	if station == nil {
		// Fallback to "all" station if requested station doesn't exist
		station = m.stations["all"]
	}

	if station == nil {
		return nil
	}
	return station.CurrentEpisode
}

// GetCurrentTimePosition returns current time position for a specific station
func (m *Manager) GetCurrentTimePosition(stationID string) float64 {
	if stationID == "" {
		stationID = "all"
	}

	m.mutex.RLock()
	defer m.mutex.RUnlock()

	station := m.stations[stationID]
	if station == nil {
		station = m.stations["all"]
	}

	if station == nil {
		return 0
	}
	return station.TimePosition
}

// GetCurrentPosition returns current byte position for a specific station
func (m *Manager) GetCurrentPosition(stationID string) int64 {
	if stationID == "" {
		stationID = "all"
	}

	m.mutex.RLock()
	defer m.mutex.RUnlock()

	station := m.stations[stationID]
	if station == nil {
		station = m.stations["all"]
	}

	if station == nil {
		return 0
	}
	return station.CurrentPosition
}

// GetRecentlyPlayed returns recently played episodes from a specific station
func (m *Manager) GetRecentlyPlayed(stationID string) []*models.Episode {
	if stationID == "" {
		stationID = "all"
	}

	m.mutex.RLock()
	defer m.mutex.RUnlock()

	station := m.stations[stationID]
	if station == nil {
		station = m.stations["all"]
	}

	if station == nil {
		return []*models.Episode{}
	}
	return station.RecentlyPlayed
}

// REMOVE the SwitchToStation method - we don't switch server state anymore!
// Users just tell the client which station they want to listen to

// Utility methods

// slugify converts a string to a URL-safe slug
func (m *Manager) slugify(s string) string {
	// Convert to lowercase
	s = strings.ToLower(s)
	// Replace spaces and special chars with hyphens
	reg := regexp.MustCompile(`[^a-z0-9]+`)
	s = reg.ReplaceAllString(s, "-")
	// Remove leading/trailing hyphens
	s = strings.Trim(s, "-")
	return s
}

// getShowColor returns a color for a show
func (m *Manager) getShowColor(showName string) string {
	colors := map[string]string{
		"My Brother, My Brother and Me": "#ff7c7c",
		"The Adventure Zone":            "#64dfdf",
		"Sawbones":                      "#16a085",
		"Wonderful!":                    "#f39c12",
		"Shmanners":                     "#9b59b6",
		"Still Buffering":               "#e74c3c",
		"The Besties":                   "#3498db",
	}

	if color, exists := colors[showName]; exists {
		return color
	}
	return "#6c757d" // Default gray
}

// getShowIcon returns an icon for a show
func (m *Manager) getShowIcon(showName string) string {
	icons := map[string]string{
		"My Brother, My Brother and Me": "fa-microphone",
		"The Adventure Zone":            "fa-dice-d20",
		"Sawbones":                      "fa-user-md",
		"Wonderful!":                    "fa-heart",
		"Shmanners":                     "fa-utensils",
		"Still Buffering":               "fa-wifi",
		"The Besties":                   "fa-gamepad",
	}

	if icon, exists := icons[showName]; exists {
		return icon
	}
	return "fa-podcast" // Default podcast icon
}

// Cleanup stops all station progressions
func (m *Manager) Cleanup() {
	for stationID := range m.stations {
		m.stopStationProgression(stationID)
	}
}
