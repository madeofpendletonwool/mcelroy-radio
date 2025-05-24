package models

import (
	"time"
)

// Station represents a radio station with its own episode queue and state
type Station struct {
	ID               string          `json:"id"`
	Name             string          `json:"name"`
	Description      string          `json:"description"`
	Type             string          `json:"type"`  // "all", "show", "custom"
	Shows            []string        `json:"shows"` // Show names to include
	Episodes         []*Episode      `json:"-"`     // Runtime episodes list (not serialized)
	CurrentEpisode   *Episode        `json:"current_episode,omitempty"`
	CurrentPosition  int64           `json:"current_position"`
	TimePosition     float64         `json:"time_position"`
	EpisodeStartTime time.Time       `json:"-"`
	PlayedEpisodes   map[string]bool `json:"-"` // Track played episodes
	RecentlyPlayed   []*Episode      `json:"recently_played,omitempty"`
	IsPlaying        bool            `json:"is_playing"`
	Color            string          `json:"color,omitempty"` // For UI theming
	Icon             string          `json:"icon,omitempty"`  // FontAwesome icon
	EpisodeCount     int             `json:"episode_count"`
}

// StationConfig represents the configuration file structure
type StationConfig struct {
	Stations []CustomStation `json:"stations"`
}

// CustomStation represents a custom station definition from config
type CustomStation struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Shows       []string `json:"shows"`
	Color       string   `json:"color,omitempty"`
	Icon        string   `json:"icon,omitempty"`
}

// GetEpisodesByShows returns episodes that match the station's show filter
func (s *Station) GetEpisodesByShows(allEpisodes []*Episode) []*Episode {
	if len(s.Shows) == 0 {
		// If no shows specified, return all episodes (for "All Shows" station)
		return allEpisodes
	}

	var filtered []*Episode
	showMap := make(map[string]bool)
	for _, show := range s.Shows {
		showMap[show] = true
	}

	for _, episode := range allEpisodes {
		if showMap[episode.ShowName] {
			filtered = append(filtered, episode)
		}
	}

	return filtered
}

// UpdateEpisodes refreshes the station's episode list based on current available episodes
func (s *Station) UpdateEpisodes(allEpisodes []*Episode) {
	s.Episodes = s.GetEpisodesByShows(allEpisodes)
	s.EpisodeCount = len(s.Episodes)
}
