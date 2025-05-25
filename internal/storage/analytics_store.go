package storage

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net"
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

// isLocalIP checks if an IP address is local/private
func (as *AnalyticsStore) isLocalIP(ipStr string) bool {
	ip := net.ParseIP(ipStr)
	if ip == nil {
		return false
	}

	// Check for loopback
	if ip.IsLoopback() {
		return true
	}

	// Check for private IP ranges
	if ip.IsPrivate() {
		return true
	}

	// Additional local checks
	if ipStr == "127.0.0.1" || ipStr == "::1" || ipStr == "localhost" {
		return true
	}

	// Check for Docker internal IPs and other common local ranges
	localRanges := []string{
		"172.17.0.0/16",  // Docker default bridge
		"172.18.0.0/16",  // Docker custom bridges
		"172.19.0.0/16",  // Docker custom bridges
		"172.20.0.0/16",  // Docker custom bridges
		"169.254.0.0/16", // Link-local
		"::1/128",        // IPv6 loopback
		"fe80::/10",      // IPv6 link-local
	}

	for _, rangeStr := range localRanges {
		_, cidr, err := net.ParseCIDR(rangeStr)
		if err != nil {
			continue
		}
		if cidr.Contains(ip) {
			return true
		}
	}

	return false
}

// RecordVisit records a new visit (filtering out local IPs)
func (as *AnalyticsStore) RecordVisit(ip, path, userAgent string) {
	// Skip recording if it's a local IP
	if as.isLocalIP(ip) {
		log.Printf("Skipping analytics for local IP: %s", ip)
		return
	}

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

// GetTimeSeriesData returns visit data for different time periods
func (as *AnalyticsStore) GetTimeSeriesData(period string) map[string]interface{} {
	as.mutex.RLock()
	defer as.mutex.RUnlock()

	now := time.Now()
	data := make(map[string]int)

	var cutoff time.Time
	var formatStr string

	switch period {
	case "hour":
		cutoff = now.Add(-24 * time.Hour)
		formatStr = "15:04" // HH:MM format

		// Initialize all hours in the last 24 hours
		for i := 0; i < 24; i++ {
			t := now.Add(time.Duration(-i) * time.Hour)
			key := t.Format(formatStr)
			data[key] = 0
		}

	case "day":
		cutoff = now.AddDate(0, 0, -30)
		formatStr = "2006-01-02" // YYYY-MM-DD format

		// Initialize all days in the last 30 days
		for i := 0; i < 30; i++ {
			t := now.AddDate(0, 0, -i)
			key := t.Format(formatStr)
			data[key] = 0
		}

	case "week":
		cutoff = now.AddDate(0, 0, -84) // 12 weeks
		formatStr = "2006-W02"          // Year-Week format

		// Initialize all weeks in the last 12 weeks
		for i := 0; i < 12; i++ {
			t := now.AddDate(0, 0, -i*7)
			year, week := t.ISOWeek()
			key := fmt.Sprintf("%d-W%02d", year, week)
			data[key] = 0
		}

	case "month":
		cutoff = now.AddDate(-1, 0, 0) // 12 months
		formatStr = "2006-01"          // YYYY-MM format

		// Initialize all months in the last 12 months
		for i := 0; i < 12; i++ {
			t := now.AddDate(0, -i, 0)
			key := t.Format(formatStr)
			data[key] = 0
		}

	default:
		cutoff = now.Add(-24 * time.Hour)
		formatStr = "15:04"
	}

	// Count visits
	for _, visit := range as.visits {
		if visit.Timestamp.After(cutoff) {
			var key string

			switch period {
			case "week":
				year, week := visit.Timestamp.ISOWeek()
				key = fmt.Sprintf("%d-W%02d", year, week)
			default:
				key = visit.Timestamp.Format(formatStr)
			}

			data[key]++
		}
	}

	// Convert to slice format for chart.js
	var labels []string
	var values []int

	// Sort keys and create ordered arrays
	switch period {
	case "hour":
		for i := 23; i >= 0; i-- {
			t := now.Add(time.Duration(-i) * time.Hour)
			key := t.Format(formatStr)
			labels = append(labels, key)
			values = append(values, data[key])
		}
	case "day":
		for i := 29; i >= 0; i-- {
			t := now.AddDate(0, 0, -i)
			key := t.Format(formatStr)
			labels = append(labels, key)
			values = append(values, data[key])
		}
	case "week":
		for i := 11; i >= 0; i-- {
			t := now.AddDate(0, 0, -i*7)
			year, week := t.ISOWeek()
			key := fmt.Sprintf("%d-W%02d", year, week)
			labels = append(labels, key)
			values = append(values, data[key])
		}
	case "month":
		for i := 11; i >= 0; i-- {
			t := now.AddDate(0, -i, 0)
			key := t.Format(formatStr)
			labels = append(labels, key)
			values = append(values, data[key])
		}
	}

	return map[string]interface{}{
		"labels": labels,
		"data":   values,
		"period": period,
	}
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
