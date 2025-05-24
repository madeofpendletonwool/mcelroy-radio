package storage

import (
	"encoding/json"
	"io/ioutil"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/madeofpendletonwool/mcelroy-radio/internal/models"
)

// AnalyticsStore handles simple visit tracking
type AnalyticsStore struct {
	visits    []models.Visit
	mutex     sync.RWMutex
	dataPath  string
	maxVisits int
}

// NewAnalyticsStore creates a new analytics store
func NewAnalyticsStore(dataDir string) *AnalyticsStore {
	dataPath := filepath.Join(dataDir, "analytics.json")

	store := &AnalyticsStore{
		visits:    make([]models.Visit, 0),
		dataPath:  dataPath,
		maxVisits: 10000,
	}

	store.loadData()
	go store.cleanupRoutine()

	return store
}

// RecordVisit records a new visit
func (as *AnalyticsStore) RecordVisit(ip, path, userAgent string) {
	as.mutex.Lock()
	defer as.mutex.Unlock()

	visit := models.Visit{
		ID:        len(as.visits) + 1,
		Timestamp: time.Now(),
		Region:    models.GetRegionFromIP(ip),
		Path:      as.cleanPath(path),
		UserAgent: models.GetBrowserFamily(userAgent),
	}

	as.visits = append(as.visits, visit)

	if len(as.visits) > as.maxVisits {
		as.visits = as.visits[len(as.visits)-as.maxVisits:]
	}

	if len(as.visits)%10 == 0 {
		go as.saveData()
	}
}

// GetSummary returns analytics summary
func (as *AnalyticsStore) GetSummary() models.AnalyticsSummary {
	as.mutex.RLock()
	defer as.mutex.RUnlock()

	now := time.Now()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	weekAgo := today.AddDate(0, 0, -7)

	summary := models.AnalyticsSummary{
		RegionBreakdown:  make(map[string]int),
		BrowserBreakdown: make(map[string]int),
		PopularPages:     make(map[string]int),
		HourlyData:       make(map[string]int),
		DailyData:        make(map[string]int),
	}

	for _, visit := range as.visits {
		summary.TotalVisits++

		if visit.Timestamp.After(today) {
			summary.TodayVisits++
		}

		if visit.Timestamp.After(weekAgo) {
			summary.WeekVisits++
		}

		summary.RegionBreakdown[visit.Region]++
		summary.BrowserBreakdown[visit.UserAgent]++
		summary.PopularPages[visit.Path]++

		if visit.Timestamp.After(now.Add(-24 * time.Hour)) {
			hour := visit.Timestamp.Format("15:00")
			summary.HourlyData[hour]++
		}

		if visit.Timestamp.After(now.AddDate(0, 0, -30)) {
			day := visit.Timestamp.Format("2006-01-02")
			summary.DailyData[day]++
		}
	}

	return summary
}

// GetRecentVisits returns recent visits
func (as *AnalyticsStore) GetRecentVisits(limit int) []models.Visit {
	as.mutex.RLock()
	defer as.mutex.RUnlock()

	if limit <= 0 {
		limit = 100
	}

	start := len(as.visits) - limit
	if start < 0 {
		start = 0
	}

	recent := make([]models.Visit, len(as.visits)-start)
	copy(recent, as.visits[start:])

	// Reverse to show newest first
	for i := len(recent)/2 - 1; i >= 0; i-- {
		opp := len(recent) - 1 - i
		recent[i], recent[opp] = recent[opp], recent[i]
	}

	return recent
}

func (as *AnalyticsStore) cleanPath(path string) string {
	if idx := strings.Index(path, "?"); idx != -1 {
		path = path[:idx]
	}

	switch path {
	case "/", "/index.html":
		return "/"
	case "/about", "/about/":
		return "/about"
	case "/directory", "/directory/":
		return "/directory"
	default:
		if strings.HasPrefix(path, "/static/") {
			return "/static/*"
		}
		return path
	}
}

func (as *AnalyticsStore) loadData() {
	if _, err := os.Stat(as.dataPath); os.IsNotExist(err) {
		return
	}

	data, err := ioutil.ReadFile(as.dataPath)
	if err != nil {
		log.Printf("Error reading analytics data: %v", err)
		return
	}

	if err := json.Unmarshal(data, &as.visits); err != nil {
		log.Printf("Error parsing analytics data: %v", err)
		return
	}

	log.Printf("Loaded %d analytics records", len(as.visits))
}

func (as *AnalyticsStore) saveData() {
	as.mutex.RLock()
	defer as.mutex.RUnlock()

	if err := os.MkdirAll(filepath.Dir(as.dataPath), 0755); err != nil {
		log.Printf("Error creating analytics directory: %v", err)
		return
	}

	data, err := json.MarshalIndent(as.visits, "", "  ")
	if err != nil {
		log.Printf("Error marshaling analytics data: %v", err)
		return
	}

	tempPath := as.dataPath + ".tmp"
	if err := ioutil.WriteFile(tempPath, data, 0644); err != nil {
		log.Printf("Error writing analytics data: %v", err)
		return
	}

	if err := os.Rename(tempPath, as.dataPath); err != nil {
		log.Printf("Error renaming analytics data: %v", err)
		return
	}
}

func (as *AnalyticsStore) cleanupRoutine() {
	ticker := time.NewTicker(24 * time.Hour)
	defer ticker.Stop()

	for {
		<-ticker.C
		as.cleanup()
	}
}

func (as *AnalyticsStore) cleanup() {
	as.mutex.Lock()
	defer as.mutex.Unlock()

	cutoff := time.Now().AddDate(0, 0, -90)

	filtered := make([]models.Visit, 0)
	for _, visit := range as.visits {
		if visit.Timestamp.After(cutoff) {
			filtered = append(filtered, visit)
		}
	}

	oldCount := len(as.visits)
	as.visits = filtered

	if oldCount != len(as.visits) {
		log.Printf("Analytics cleanup: removed %d old visits, %d remaining",
			oldCount-len(as.visits), len(as.visits))
		go as.saveData()
	}
}
