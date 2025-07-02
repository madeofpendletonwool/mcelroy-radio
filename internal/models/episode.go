package models

import (
	"math/rand"
	"strings"
	"time"
)

// Episode represents a podcast episode
type Episode struct {
	ID          string    `json:"id"`
	Title       string    `json:"title"`
	ShowName    string    `json:"show_name"`
	Artist      string    `json:"artist"`
	Album       string    `json:"album"`
	Description string    `json:"description"`
	AudioPath   string    `json:"audio_path"`
	ImagePath   string    `json:"image_path"`
	Duration    float64   `json:"duration"`
	PublishedAt time.Time `json:"published_at"`
	PlayedAt    time.Time `json:"played_at,omitempty"`
	RandomFact  string    `json:"random_fact,omitempty"`
	Genre       string    `json:"genre"`
	FileSize    int64     `json:"file_size"`
}

// GetImagePathForShow returns the appropriate default image path based on show name
func GetImagePathForShow(showName string) string {
	showNameLower := strings.ToLower(showName)

	if strings.Contains(showNameLower, "brother") || strings.Contains(showNameLower, "mbmbam") {
		return "/static/images/shows/mbmbam.jpg"
	} else if strings.Contains(showNameLower, "adventure") || strings.Contains(showNameLower, "zone") {
		return "/static/images/shows/adventure-zone.jpg"
	} else if strings.Contains(showNameLower, "sawbones") {
		return "/static/images/shows/sawbones.jpg"
	} else if strings.Contains(showNameLower, "wonderful") {
		return "/static/images/shows/wonderful.jpg"
	} else if strings.Contains(showNameLower, "besties") {
		return "/static/images/shows/besties.jpg"
	} else if strings.Contains(showNameLower, "furious") {
		return "/static/images/shows/fast-and-furious-and-justin-and-sydnee.jpg"
	} else if strings.Contains(showNameLower, "cool") && strings.Contains(showNameLower, "games") {
		return "/static/images/shows/coolgames-inc.jpg"
	} else if strings.Contains(showNameLower, "empty") {
		return "/static/images/shows/empty-bowl.jpg"
	} else if strings.Contains(showNameLower, "interrobang") {
		return "/static/images/shows/interrobang.jpg"
	} else if strings.Contains(showNameLower, "rewind") {
		return "/static/images/shows/kind-rewind.jpg"
	} else if strings.Contains(showNameLower, "positivitiny") {
		return "/static/images/shows/positivitiny.jpg"
	} else if strings.Contains(showNameLower, "quality") {
		return "/static/images/shows/quality-control.jpg"
	} else if strings.Contains(showNameLower, "rose") {
		return "/static/images/shows/rose-buddies.jpg"
	} else if strings.Contains(showNameLower, "doctor") {
		return "/static/images/shows/run-doctor-who.jpg"
	} else if strings.Contains(showNameLower, "shmanners") {
		return "/static/images/shows/shmanners.jpg"
	} else if strings.Contains(showNameLower, "buffering") {
		return "/static/images/shows/still-buffering.jpg"
	} else if strings.Contains(showNameLower, "nice") {
		return "/static/images/shows/surprisingly-nice.jpg"
	} else if strings.Contains(showNameLower, "blart") {
		return "/static/images/shows/til-death-do-us-blart.jpg"
	} else if strings.Contains(showNameLower, "trends") {
		return "/static/images/shows/trends-like-these.jpg"
	}

	return "/static/img/default-cover.png"
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
	"Griffin McElroy once live-tweeted the birth of his child and it was somehow deeply moving and hilarious.",
	"Justin McElroy has achieved inner peace through the consumption of limited-edition Pop-Tarts.",
	"Travis McElroy owns more bow ties than there are grains of sand in a reasonably-sized sandbox.",
	"The McElroy brothers canonically invented the year 2012 in a bonus episode of MBMBaM.",
	"Griffin's face has been officially declared 'too powerful' for augmented reality filters.",
	"Justin has legally changed his middle name to 'Meat', but only on Tuesdays.",
	"Travis communicates exclusively through interpretive dance when not recording podcasts.",
	"The McElroys once solved world peace in a dream but forgot to write it down.",
	"Griffin McElroy voiced a character in a video game and now technically lives in the digital realm.",
	"Justin can sense when someone nearby is watching The Bachelor.",
	"Travis has been knighted in at least three Renaissance Faires.",
	"The McElroy brothers have never lost a fight to a Roomba — not even once.",
	"Griffin once hosted an entire podcast episode inside a Chili's without anyone noticing.",
	"Justin owns a haunted juicer that only works during eclipses.",
	"Travis is powered entirely by kindness and kombucha.",
	"The McElroys are the only people legally allowed to say the phrase 'bone zone' in six different states.",
	"Griffin's Animal Crossing island has diplomatic immunity.",
	"Justin's laugh has been sampled in at least two K-pop songs.",
	"Travis once taught a masterclass on etiquette to a group of raccoons.",
	"The McElroy brothers can summon a live audience by yelling 'What's up, you cool baby?' three times.",
}

// GetRandomFact returns a random McElroy fact
func GetRandomFact() string {
	// Use proper randomization
	source := rand.NewSource(time.Now().UnixNano())
	rng := rand.New(source)
	return mcElroyFacts[rng.Intn(len(mcElroyFacts))]
}
