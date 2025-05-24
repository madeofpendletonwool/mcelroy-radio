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

// Manager handles multiple radio stations
type Manager struct {
	stations       map[string]*models.Station
	currentStation string
	fileStore      *storage.FileStore
	configPath     string
	mutex          sync.RWMutex
	rng            *rand.Rand
}

// NewManager creates a new station manager
func NewManager(fileStore *storage.FileStore, configPath string) *Manager {
	source := rand.NewSource(time.Now().UnixNano())
	rng := rand.New(source)

	m := &Manager{
		stations:       make(map[string]*models.Station),
		currentStation: "all",
		fileStore:      fileStore,
		configPath:     configPath,
		rng:            rng,
	}

	m.initializeStations()
	go m.stationProgressLoop()

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
		IsPlaying:      true,
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

// stationProgressLoop manages episode progression for the current station
func (m *Manager) stationProgressLoop() {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	for {
		<-ticker.C
		m.checkCurrentStationProgress()
	}
}

// checkCurrentStationProgress checks if the current station needs to advance episodes
func (m *Manager) checkCurrentStationProgress() {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	currentStation := m.stations[m.currentStation]
	if currentStation == nil || currentStation.CurrentEpisode == nil {
		return
	}

	// Calculate playing time
	playingTime := time.Since(currentStation.EpisodeStartTime).Seconds()

	// If episode is finished, advance to next
	if currentStation.CurrentEpisode.Duration > 0 && playingTime >= currentStation.CurrentEpisode.Duration {
		log.Printf("Station %s episode finished, advancing", currentStation.Name)
		m.advanceStationEpisode(currentStation)
	}

	// Update position
	currentStation.TimePosition = playingTime
	bytesPerSecond := int64(16000) // Rough estimate for MP3
	currentStation.CurrentPosition = int64(playingTime * float64(bytesPerSecond))
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
	station.EpisodeStartTime = time.Now()
	station.TimePosition = 0
	station.CurrentPosition = 0
	station.PlayedEpisodes[station.CurrentEpisode.ID] = true
	station.CurrentEpisode.RandomFact = models.GetRandomFact()

	log.Printf("Station %s now playing: %s", station.Name, station.CurrentEpisode.Title)
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

// GetCurrentStationID returns the ID of the current station
func (m *Manager) GetCurrentStationID() string {
	m.mutex.RLock()
	defer m.mutex.RUnlock()
	return m.currentStation
}

// GetStation returns a specific station by ID
func (m *Manager) GetStation(stationID string) *models.Station {
	m.mutex.RLock()
	defer m.mutex.RUnlock()
	return m.stations[stationID]
}

// SwitchToStation changes the current station
func (m *Manager) SwitchToStation(stationID string) bool {
	m.mutex.Lock()
	defer m.mutex.Unlock()

	station, exists := m.stations[stationID]
	if !exists {
		return false
	}

	// Stop current station
	if currentStation := m.stations[m.currentStation]; currentStation != nil {
		currentStation.IsPlaying = false
	}

	// Start new station
	m.currentStation = stationID
	station.IsPlaying = true

	log.Printf("Switched to station: %s", station.Name)
	return true
}

// GetCurrentEpisode returns the current episode from the active station
func (m *Manager) GetCurrentEpisode() *models.Episode {
	m.mutex.RLock()
	defer m.mutex.RUnlock()

	currentStation := m.stations[m.currentStation]
	if currentStation == nil {
		return nil
	}
	return currentStation.CurrentEpisode
}

// GetCurrentTimePosition returns current time position for active station
func (m *Manager) GetCurrentTimePosition() float64 {
	m.mutex.RLock()
	defer m.mutex.RUnlock()

	currentStation := m.stations[m.currentStation]
	if currentStation == nil {
		return 0
	}
	return currentStation.TimePosition
}

// GetCurrentPosition returns current byte position for active station
func (m *Manager) GetCurrentPosition() int64 {
	m.mutex.RLock()
	defer m.mutex.RUnlock()

	currentStation := m.stations[m.currentStation]
	if currentStation == nil {
		return 0
	}
	return currentStation.CurrentPosition
}

// GetRecentlyPlayed returns recently played episodes from current station
func (m *Manager) GetRecentlyPlayed() []*models.Episode {
	m.mutex.RLock()
	defer m.mutex.RUnlock()

	currentStation := m.stations[m.currentStation]
	if currentStation == nil {
		return []*models.Episode{}
	}
	return currentStation.RecentlyPlayed
}

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
