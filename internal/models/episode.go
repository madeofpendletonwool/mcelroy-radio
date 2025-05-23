package models

import (
	"crypto/md5"
	"fmt"
	"math/rand"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
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

// AudioMetadata holds the parsed metadata from audio files
type AudioMetadata struct {
	Title    string
	Artist   string
	Album    string
	Genre    string
	Date     string
	Duration float64
	FileSize int64
	HasImage bool
}

// NewEpisodeFromFile creates a new Episode from a file path with metadata parsing
func NewEpisodeFromFile(path string, showName string) *Episode {
	// Extract basic info from filename
	filename := filepath.Base(path)
	ext := filepath.Ext(filename)
	fallbackTitle := filename[0 : len(filename)-len(ext)]

	// Parse metadata using ffprobe
	metadata := parseAudioMetadata(path)

	// Use metadata title if available, otherwise use filename
	title := metadata.Title
	if title == "" {
		title = fallbackTitle
	}

	// Parse date from metadata or filename
	publishedAt := parseDateFromMetadata(metadata.Date, filename)

	// Determine show name from metadata or directory
	finalShowName := showName
	if metadata.Album != "" {
		finalShowName = metadata.Album
	}

	// Extract and save album art if available
	imagePath := extractAlbumArt(path, metadata.HasImage)

	return &Episode{
		ID:          path, // Using path as ID for now
		Title:       title,
		ShowName:    finalShowName,
		Artist:      metadata.Artist,
		Album:       metadata.Album,
		Genre:       metadata.Genre,
		AudioPath:   path,
		ImagePath:   imagePath,
		Duration:    metadata.Duration,
		FileSize:    metadata.FileSize,
		PublishedAt: publishedAt,
		RandomFact:  GetRandomFact(),
	}
}

// parseAudioMetadata uses ffprobe to extract metadata from audio files
func parseAudioMetadata(filePath string) AudioMetadata {
	metadata := AudioMetadata{}

	// Get format metadata including streams info
	cmd := exec.Command("ffprobe", "-v", "error", "-show_entries",
		"format_tags:format=duration,size:stream", "-of", "default=noprint_wrappers=1", filePath)
	output, err := cmd.Output()
	if err != nil {
		fmt.Printf("Error running ffprobe on %s: %v\n", filePath, err)
		return metadata
	}

	lines := strings.Split(string(output), "\n")
	for _, line := range lines {
		if strings.HasPrefix(line, "TAG:title=") {
			metadata.Title = strings.TrimPrefix(line, "TAG:title=")
		} else if strings.HasPrefix(line, "TAG:artist=") {
			metadata.Artist = strings.TrimPrefix(line, "TAG:artist=")
		} else if strings.HasPrefix(line, "TAG:album=") {
			metadata.Album = strings.TrimPrefix(line, "TAG:album=")
		} else if strings.HasPrefix(line, "TAG:genre=") {
			metadata.Genre = strings.TrimPrefix(line, "TAG:genre=")
		} else if strings.HasPrefix(line, "TAG:date=") {
			metadata.Date = strings.TrimPrefix(line, "TAG:date=")
		} else if strings.HasPrefix(line, "duration=") {
			if durationStr := strings.TrimPrefix(line, "duration="); durationStr != "" {
				if duration, err := strconv.ParseFloat(durationStr, 64); err == nil {
					metadata.Duration = duration
				}
			}
		} else if strings.HasPrefix(line, "size=") {
			if sizeStr := strings.TrimPrefix(line, "size="); sizeStr != "" {
				if size, err := strconv.ParseInt(sizeStr, 10, 64); err == nil {
					metadata.FileSize = size
				}
			}
		} else if strings.Contains(line, "codec_name=") && strings.Contains(line, "jpg") ||
			strings.Contains(line, "codec_name=") && strings.Contains(line, "png") {
			// Found an image stream
			metadata.HasImage = true
		}
	}

	return metadata
}

// extractAlbumArt extracts album art from audio file and saves it to static directory
func extractAlbumArt(audioPath string, hasImage bool) string {
	if !hasImage {
		return getDefaultImagePathForShow(audioPath)
	}

	// Create a unique filename based on the audio file path
	hash := md5.Sum([]byte(audioPath))
	imageFilename := fmt.Sprintf("cover_%x.jpg", hash)

	// Ensure the covers directory exists
	coversDir := filepath.Join("static", "img", "covers")
	if err := os.MkdirAll(coversDir, 0755); err != nil {
		fmt.Printf("Error creating covers directory: %v\n", err)
		return getDefaultImagePathForShow(audioPath)
	}

	imagePath := filepath.Join(coversDir, imageFilename)

	// Check if image already exists
	if _, err := os.Stat(imagePath); err == nil {
		return "/static/img/covers/" + imageFilename
	}

	// Extract album art using ffmpeg
	cmd := exec.Command("ffmpeg", "-i", audioPath, "-an", "-vcodec", "copy", imagePath, "-y")
	if err := cmd.Run(); err != nil {
		fmt.Printf("Error extracting album art from %s: %v\n", audioPath, err)
		return getDefaultImagePathForShow(audioPath)
	}

	// Verify the file was created and has content
	if info, err := os.Stat(imagePath); err != nil || info.Size() == 0 {
		// Clean up empty file and fall back to default
		os.Remove(imagePath)
		return getDefaultImagePathForShow(audioPath)
	}

	return "/static/img/covers/" + imageFilename
}

// parseDateFromMetadata tries to parse a date from metadata or filename
func parseDateFromMetadata(dateStr, filename string) time.Time {
	// Try to parse the metadata date first
	if dateStr != "" {
		// Handle various date formats
		formats := []string{
			"2006-01-02",
			"0001-01-02", // Common in some metadata
			"2006",
			"01-02-2006",
			"2006-01-02T15:04:05Z07:00",
		}

		for _, format := range formats {
			if t, err := time.Parse(format, dateStr); err == nil {
				// If year is 0001, it's probably invalid metadata
				if t.Year() > 1900 {
					return t
				}
			}
		}
	}

	// Try to extract date from filename
	// Look for patterns like "01-13-2025" or "2025-01-13"
	dateRegex := regexp.MustCompile(`(\d{1,2}-\d{1,2}-\d{4})|(\d{4}-\d{1,2}-\d{1,2})`)
	if match := dateRegex.FindString(filename); match != "" {
		formats := []string{
			"01-02-2006",
			"1-2-2006",
			"2006-01-02",
			"2006-1-2",
		}

		for _, format := range formats {
			if t, err := time.Parse(format, match); err == nil {
				return t
			}
		}
	}

	// Default to current time if we can't parse anything
	return time.Now()
}

// getDefaultImagePathForShow returns the appropriate default image path based on show name or path
func getDefaultImagePathForShow(audioPath string) string {
	// Extract show name from path or use existing logic
	showNameLower := strings.ToLower(filepath.Base(filepath.Dir(audioPath)))

	if strings.Contains(showNameLower, "brother") || strings.Contains(showNameLower, "mbmbam") {
		return "/static/img/mbmbam-cover.png"
	} else if strings.Contains(showNameLower, "adventure") || strings.Contains(showNameLower, "zone") {
		return "/static/img/adventure-zone-cover.png"
	} else if strings.Contains(showNameLower, "sawbones") {
		return "/static/img/sawbones-cover.png"
	} else if strings.Contains(showNameLower, "wonderful") {
		return "/static/img/wonderful-cover.png"
	}

	return "/static/img/default-cover.png"
}

// getImagePathForShow returns the appropriate image path based on show name (legacy function)
func getImagePathForShow(showName string) string {
	return getDefaultImagePathForShow(showName)
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
