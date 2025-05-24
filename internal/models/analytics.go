package models

import (
	"net"
	"strings"
	"time"
)

// Visit represents a simple visit record
type Visit struct {
	ID        int       `json:"id"`
	Timestamp time.Time `json:"timestamp"`
	Region    string    `json:"region"`
	Path      string    `json:"path"`
	UserAgent string    `json:"user_agent"` // Just browser family, not full string
}

// AnalyticsSummary provides aggregated metrics
type AnalyticsSummary struct {
	TotalVisits      int            `json:"total_visits"`
	TodayVisits      int            `json:"today_visits"`
	WeekVisits       int            `json:"week_visits"`
	RegionBreakdown  map[string]int `json:"region_breakdown"`
	BrowserBreakdown map[string]int `json:"browser_breakdown"`
	PopularPages     map[string]int `json:"popular_pages"`
	HourlyData       map[string]int `json:"hourly_data"` // Last 24 hours
	DailyData        map[string]int `json:"daily_data"`  // Last 30 days
}

// GetRegionFromIP determines approximate region from IP (very broad)
func GetRegionFromIP(ipStr string) string {
	ip := net.ParseIP(ipStr)
	if ip == nil {
		return "Unknown"
	}

	// Check for local/private IPs
	if ip.IsLoopback() || ip.IsPrivate() {
		return "Local"
	}

	// Very basic geographic determination based on IP ranges
	ipv4 := ip.To4()
	if ipv4 == nil {
		return "Unknown"
	}

	firstOctet := int(ipv4[0])

	// These are very rough approximations based on common IP allocations
	switch {
	case firstOctet >= 3 && firstOctet <= 76:
		return "North America"
	case firstOctet >= 96 && firstOctet <= 126:
		return "North America"
	case firstOctet >= 128 && firstOctet <= 191:
		return "North America"
	case firstOctet >= 199 && firstOctet <= 223:
		return "North America"
	case firstOctet >= 77 && firstOctet <= 95:
		return "Europe"
	case firstOctet >= 176 && firstOctet <= 188:
		return "Europe"
	case firstOctet >= 192 && firstOctet <= 195:
		return "Europe"
	case firstOctet >= 39 && firstOctet <= 43:
		return "Asia-Pacific"
	case firstOctet >= 110 && firstOctet <= 125:
		return "Asia-Pacific"
	case firstOctet >= 163 && firstOctet <= 175:
		return "Asia-Pacific"
	case firstOctet >= 202 && firstOctet <= 210:
		return "Asia-Pacific"
	case firstOctet >= 189 && firstOctet <= 191:
		return "South America"
	case firstOctet >= 200 && firstOctet <= 201:
		return "South America"
	case firstOctet >= 196 && firstOctet <= 198:
		return "Africa"
	case firstOctet >= 154 && firstOctet <= 156:
		return "Africa"
	default:
		return "Other"
	}
}

// GetBrowserFamily extracts just the browser family from user agent
func GetBrowserFamily(userAgent string) string {
	ua := strings.ToLower(userAgent)

	switch {
	case strings.Contains(ua, "edg/") || strings.Contains(ua, "edge"):
		return "Edge"
	case strings.Contains(ua, "chrome") && !strings.Contains(ua, "edg"):
		return "Chrome"
	case strings.Contains(ua, "firefox"):
		return "Firefox"
	case strings.Contains(ua, "safari") && !strings.Contains(ua, "chrome"):
		return "Safari"
	case strings.Contains(ua, "opera") || strings.Contains(ua, "opr/"):
		return "Opera"
	case strings.Contains(ua, "bot") || strings.Contains(ua, "crawl") || strings.Contains(ua, "spider"):
		return "Bot"
	default:
		return "Other"
	}
}

// GetRealIP extracts the real client IP from request headers
func GetRealIP(remoteAddr string, xForwardedFor string, xRealIP string) string {
	if xRealIP != "" && xRealIP != "127.0.0.1" {
		return xRealIP
	}

	if xForwardedFor != "" {
		ips := strings.Split(xForwardedFor, ",")
		if len(ips) > 0 {
			ip := strings.TrimSpace(ips[0])
			if ip != "127.0.0.1" && ip != "" {
				return ip
			}
		}
	}

	if host, _, err := net.SplitHostPort(remoteAddr); err == nil {
		return host
	}

	return remoteAddr
}
