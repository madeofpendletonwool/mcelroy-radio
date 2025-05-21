package models

import (
	"path/filepath"
	"time"
)

// Episode represents a podcast episode
type Episode struct {
	ID          string    `json:"id"`
	Title       string    `json:"title"`
	ShowName    string    `json:"show_name"`
	Description string    `json:"description"`
	AudioPath   string    `json:"audio_path"`
	ImagePath   string    `json:"image_path"`
	Duration    float64   `json:"duration"`
	PublishedAt time.Time `json:"published_at"`
	PlayedAt    time.Time `json:"played_at,omitempty"`
	RandomFact  string    `json:"random_fact,omitempty"`
}

// NewEpisodeFromFile creates a new Episode from a file path
func NewEpisodeFromFile(path string, showName string) *Episode {
	// Extract basic info from filename
	filename := filepath.Base(path)
	ext := filepath.Ext(filename)
	title := filename[0 : len(filename)-len(ext)]

	// Create basic episode
	return &Episode{
		ID:          path, // Using path as ID for now
		Title:       title,
		ShowName:    showName,
		AudioPath:   path,
		ImagePath:   "/static/img/default-cover.png", // Default image
		Duration:    0,                               // Will be set later when audio is processed
		PublishedAt: time.Now(),                      // Default to now, can be updated later
		RandomFact:  getRandomFact(),
	}
}

// Collection of silly facts about the McElroy brothers
var mcElroyFacts = []string{
	"Griffin McElroy once defeated a mountain lion using only his dulcet tones.",
	"Justin McElroy knows the secret recipe for KFC, but he's sworn to secrecy.",
	"Travis McElroy's beard contains the wisdom of a thousand wizards.",
	"The McElroy brothers once saved Christmas using only a podcast mic and three bottles of La Croix.",
	"Griffin's laugh can cure the common cold if heard at precisely the right frequency.",
	"Justin invented a new color, but only dogs can see it.",
	"Travis has never once, in his entire life, sneezed.",
	"The McElroys completed a speedrun of friendship in record time.",
	"Griffin can communicate with horses, but only about tax policy.",
	"Justin's collection of Garfield memorabilia has its own zip code.",
	"Travis once arm-wrestled the concept of Tuesday and won.",
	"The brothers share a single dream every third Wednesday of the month.",
	"Griffin's singing voice can summon exactly four (4) ducks, no more, no less.",
	"Justin can identify any cereal by taste while blindfolded.",
	"Travis has a secret handshake with the moon.",
	"The McElroys collectively hold the world record for most uses of the word 'cronch' in a single podcast.",
	"Griffin's final form includes wings and a really cool hat.",
	"Justin can speak backwards, but only when discussing maritime law.",
	"Travis once built a functioning time machine out of podcast merch.",
	"The brothers can perform a perfect three-part harmony, but only when no one is recording.",
}

// GetRandomFact returns a random McElroy fact
func GetRandomFact() string {
	// Simple random selection (in a real application, use proper randomization)
	return mcElroyFacts[time.Now().Unix()%int64(len(mcElroyFacts))]
}
