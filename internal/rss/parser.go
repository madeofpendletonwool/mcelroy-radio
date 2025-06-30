package rss

import (
	"fmt"
	"log"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/madeofpendletonwool/mcelroy-radio/internal/config"
	"github.com/madeofpendletonwool/mcelroy-radio/internal/models"
	"github.com/mmcdole/gofeed"
)

// Parser handles RSS feed parsing and episode extraction
type Parser struct {
	parser *gofeed.Parser
}

// New creates a new RSS parser
func New() *Parser {
	return &Parser{
		parser: gofeed.NewParser(),
	}
}

// ParseFeeds fetches and parses all RSS feeds to extract episode information
func (p *Parser) ParseFeeds(feeds []config.RSSFeed) ([]*models.Episode, error) {
	var allEpisodes []*models.Episode

	for _, feedConfig := range feeds {
		log.Printf("Fetching RSS feed: %s (%s)", feedConfig.Name, feedConfig.URL)
		
		feed, err := p.parser.ParseURL(feedConfig.URL)
		if err != nil {
			log.Printf("Error parsing feed %s: %v", feedConfig.Name, err)
			continue
		}

		log.Printf("Found %d episodes in feed: %s", len(feed.Items), feedConfig.Name)

		for _, item := range feed.Items {
			episode := p.convertToEpisode(item, feed, feedConfig.Name)
			if episode != nil {
				allEpisodes = append(allEpisodes, episode)
			}
		}
	}

	log.Printf("Successfully parsed %d total episodes from RSS feeds", len(allEpisodes))
	return allEpisodes, nil
}

// convertToEpisode converts an RSS item to our Episode model
func (p *Parser) convertToEpisode(item *gofeed.Item, feed *gofeed.Feed, showName string) *models.Episode {
	// Find the audio enclosure
	var audioURL string
	var fileSize int64
	
	for _, enclosure := range item.Enclosures {
		if strings.HasPrefix(enclosure.Type, "audio/") {
			audioURL = enclosure.URL
			if enclosure.Length != "" {
				if size, err := strconv.ParseInt(enclosure.Length, 10, 64); err == nil {
					fileSize = size
				}
			}
			break
		}
	}

	if audioURL == "" {
		log.Printf("No audio URL found for episode: %s", item.Title)
		return nil
	}

	// Parse published date
	var publishedAt time.Time
	if item.PublishedParsed != nil {
		publishedAt = *item.PublishedParsed
	} else {
		publishedAt = time.Now()
	}

	// Extract duration from iTunes extension or description
	duration := p.extractDuration(item)

	// Create episode ID from title and show name
	episodeID := fmt.Sprintf("%s_%s", 
		strings.ReplaceAll(strings.ToLower(showName), " ", "_"),
		strings.ReplaceAll(strings.ToLower(item.Title), " ", "_"))
	
	// Clean up the ID to remove special characters
	episodeID = regexp.MustCompile(`[^a-zA-Z0-9_]`).ReplaceAllString(episodeID, "")

	episode := &models.Episode{
		ID:          episodeID,
		Title:       item.Title,
		ShowName:    showName,
		Description: item.Description,
		AudioPath:   audioURL, // This now points to the RSS audio URL
		ImagePath:   p.getEpisodeImagePath(item, feed, showName), // Get episode-specific artwork with fallbacks
		Duration:    duration,
		PublishedAt: publishedAt,
		FileSize:    fileSize,
		RandomFact:  models.GetRandomFact(), // Assign a random fact to each episode
	}

	// Try to extract additional metadata
	if item.ITunesExt != nil {
		if item.ITunesExt.Author != "" {
			episode.Artist = item.ITunesExt.Author
		}
		if item.ITunesExt.Summary != "" && episode.Description == "" {
			episode.Description = item.ITunesExt.Summary
		}
	}

	// Set album to show name if not specified
	if episode.Album == "" {
		episode.Album = showName
	}

	return episode
}

// extractDuration tries to extract episode duration from various sources
func (p *Parser) extractDuration(item *gofeed.Item) float64 {
	// Try iTunes duration first
	if item.ITunesExt != nil && item.ITunesExt.Duration != "" {
		if duration := p.parseDurationString(item.ITunesExt.Duration); duration > 0 {
			return duration
		}
	}

	// Try to extract from description using regex
	if item.Description != "" {
		durationRegex := regexp.MustCompile(`(?i)duration[:\s]+(\d+:\d+(?::\d+)?)|(\d+:\d+(?::\d+)?)`)
		matches := durationRegex.FindStringSubmatch(item.Description)
		if len(matches) > 1 {
			for _, match := range matches[1:] {
				if match != "" {
					if duration := p.parseDurationString(match); duration > 0 {
						return duration
					}
				}
			}
		}
	}

	// Default to 60 minutes if we can't determine duration
	return 3600.0 // 60 minutes in seconds
}

// parseDurationString parses duration strings like "1:23:45" or "23:45"
func (p *Parser) parseDurationString(durationStr string) float64 {
	parts := strings.Split(durationStr, ":")
	var totalSeconds float64

	switch len(parts) {
	case 2: // MM:SS
		if minutes, err := strconv.Atoi(parts[0]); err == nil {
			if seconds, err := strconv.Atoi(parts[1]); err == nil {
				totalSeconds = float64(minutes*60 + seconds)
			}
		}
	case 3: // HH:MM:SS
		if hours, err := strconv.Atoi(parts[0]); err == nil {
			if minutes, err := strconv.Atoi(parts[1]); err == nil {
				if seconds, err := strconv.Atoi(parts[2]); err == nil {
					totalSeconds = float64(hours*3600 + minutes*60 + seconds)
				}
			}
		}
	}

	return totalSeconds
}

// getEpisodeImagePath determines the best image path for an episode with fallback hierarchy:
// 1. Episode-specific artwork from RSS item
// 2. Feed-level artwork from RSS feed
// 3. Show-specific static image
// 4. Default fallback image
func (p *Parser) getEpisodeImagePath(item *gofeed.Item, feed *gofeed.Feed, showName string) string {
	// 1. Check for episode-specific artwork in iTunes extension
	if item.ITunesExt != nil && item.ITunesExt.Image != "" {
		return item.ITunesExt.Image
	}

	// 2. Check for feed-level artwork
	if feed.ITunesExt != nil && feed.ITunesExt.Image != "" {
		return feed.ITunesExt.Image
	}

	// Also check feed.Image as a fallback
	if feed.Image != nil && feed.Image.URL != "" {
		return feed.Image.URL
	}

	// 3. Fall back to show-specific static image
	showImagePath := models.GetImagePathForShow(showName)
	
	// 4. If show image is the default, that's our final fallback
	return showImagePath
}