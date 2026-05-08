package api

import (
	"fmt"
	"math"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
)

// ServerStats holds the parsed system stats from SSH commands.
type ServerStats struct {
	CPU       float64 `json:"cpu"`
	MemUsed   int64   `json:"mem_used_mb"`
	MemTotal  int64   `json:"mem_total_mb"`
	DiskUsed  int64   `json:"disk_used_gb"`
	DiskTotal int64   `json:"disk_total_gb"`
	Uptime    string  `json:"uptime"`
	Load1     float64 `json:"load_1"`
	Load5     float64 `json:"load_5"`
	Load15    float64 `json:"load_15"`
	Online    bool    `json:"online"`
	Error     string  `json:"error,omitempty"`
}

// statsCache provides short-lived caching (30s) for server stats.
type statsCache struct {
	mu      sync.RWMutex
	entries map[int]statsCacheEntry
}

type statsCacheEntry struct {
	stats     ServerStats
	fetchedAt time.Time
}

var cache = &statsCache{entries: make(map[int]statsCacheEntry)}

func (c *statsCache) get(serverID int) (ServerStats, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	entry, ok := c.entries[serverID]
	if !ok || time.Since(entry.fetchedAt) > 30*time.Second {
		return ServerStats{}, false
	}
	return entry.stats, true
}

func (c *statsCache) set(serverID int, stats ServerStats) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.entries[serverID] = statsCacheEntry{stats: stats, fetchedAt: time.Now()}
}

func (h *Handler) getServerStats(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r)
	if err != nil {
		writeError(w, 400, "invalid server id")
		return
	}

	// Access control
	if !h.userCanAccessServer(r, id) {
		writeError(w, 403, "access denied")
		return
	}

	// Check cache first
	if cached, ok := cache.get(id); ok {
		writeJSON(w, 200, cached)
		return
	}

	srv, err := h.store.GetServer(id)
	if err != nil {
		writeError(w, 404, "server not found")
		return
	}

	// Run a combined command to gather stats in one SSH session (timeout 5s)
	cmd := `echo "===CPU===" && top -bn1 | head -5 && echo "===MEM===" && free -m && echo "===DISK===" && df -h / && echo "===UPTIME===" && uptime`

	// Use a channel with timeout
	type execResult struct {
		output string
		err    error
	}
	ch := make(chan execResult, 1)
	go func() {
		output, _, execErr := h.executor.Execute(*srv, cmd)
		ch <- execResult{output: output, err: execErr}
	}()

	var stats ServerStats
	select {
	case result := <-ch:
		if result.err != nil {
			stats = ServerStats{Online: false, Error: result.err.Error()}
			cache.set(id, stats)
			writeJSON(w, 200, stats)
			return
		}
		stats = parseStats(result.output)
		stats.Online = true
	case <-time.After(5 * time.Second):
		stats = ServerStats{Online: false, Error: "timeout: server did not respond within 5s"}
		cache.set(id, stats)
		writeJSON(w, 200, stats)
		return
	}

	cache.set(id, stats)
	writeJSON(w, 200, stats)
}

func parseStats(output string) ServerStats {
	var stats ServerStats
	stats.Online = true

	sections := splitSections(output)

	// Parse CPU from top output
	if cpuSection, ok := sections["CPU"]; ok {
		stats.CPU = parseCPU(cpuSection)
	}

	// Parse Memory from free -m
	if memSection, ok := sections["MEM"]; ok {
		stats.MemUsed, stats.MemTotal = parseMem(memSection)
	}

	// Parse Disk from df -h /
	if diskSection, ok := sections["DISK"]; ok {
		stats.DiskUsed, stats.DiskTotal = parseDisk(diskSection)
	}

	// Parse Uptime
	if uptimeSection, ok := sections["UPTIME"]; ok {
		stats.Uptime, stats.Load1, stats.Load5, stats.Load15 = parseUptime(uptimeSection)
	}

	return stats
}

func splitSections(output string) map[string]string {
	sections := make(map[string]string)
	markers := []string{"===CPU===", "===MEM===", "===DISK===", "===UPTIME==="}
	currentKey := ""
	var currentLines []string

	for _, line := range strings.Split(output, "\n") {
		found := false
		for _, m := range markers {
			if strings.TrimSpace(line) == m {
				if currentKey != "" {
					sections[currentKey] = strings.Join(currentLines, "\n")
				}
				currentKey = strings.Trim(m, "=")
				currentLines = nil
				found = true
				break
			}
		}
		if !found && currentKey != "" {
			currentLines = append(currentLines, line)
		}
	}
	if currentKey != "" {
		sections[currentKey] = strings.Join(currentLines, "\n")
	}
	return sections
}

func parseCPU(section string) float64 {
	// Look for line like: %Cpu(s):  2.0 us,  1.0 sy,  0.0 ni, 96.0 id, ...
	// Or: Cpu(s):  2.0%us,  1.0%sy ...
	for _, line := range strings.Split(section, "\n") {
		lower := strings.ToLower(line)
		if strings.Contains(lower, "cpu") {
			// Try to find idle percentage
			// Pattern: XX.X id or XX.X%id
			re := regexp.MustCompile(`([\d.]+)\s*(?:%\s*)?id`)
			if matches := re.FindStringSubmatch(line); len(matches) > 1 {
				idle, err := strconv.ParseFloat(matches[1], 64)
				if err == nil {
					return math.Round((100-idle)*10) / 10
				}
			}
			// Fallback: sum us + sy
			reUs := regexp.MustCompile(`([\d.]+)\s*(?:%\s*)?us`)
			reSy := regexp.MustCompile(`([\d.]+)\s*(?:%\s*)?sy`)
			var cpu float64
			if m := reUs.FindStringSubmatch(line); len(m) > 1 {
				v, _ := strconv.ParseFloat(m[1], 64)
				cpu += v
			}
			if m := reSy.FindStringSubmatch(line); len(m) > 1 {
				v, _ := strconv.ParseFloat(m[1], 64)
				cpu += v
			}
			if cpu > 0 {
				return math.Round(cpu*10) / 10
			}
		}
	}
	return 0
}

func parseMem(section string) (used, total int64) {
	// free -m output:
	//               total        used        free      shared  buff/cache   available
	// Mem:          16000        4200        8000         200        3600       11500
	for _, line := range strings.Split(section, "\n") {
		if strings.HasPrefix(strings.ToLower(strings.TrimSpace(line)), "mem:") {
			fields := strings.Fields(line)
			if len(fields) >= 3 {
				t, _ := strconv.ParseInt(fields[1], 10, 64)
				u, _ := strconv.ParseInt(fields[2], 10, 64)
				return u, t
			}
		}
	}
	return 0, 0
}

func parseDisk(section string) (used, total int64) {
	// df -h / output:
	// Filesystem      Size  Used Avail Use% Mounted on
	// /dev/sda1       500G  120G  380G  24% /
	for _, line := range strings.Split(section, "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "Filesystem") {
			continue
		}
		fields := strings.Fields(trimmed)
		if len(fields) >= 4 {
			total = parseSize(fields[1])
			used = parseSize(fields[2])
			return used, total
		}
	}
	return 0, 0
}

func parseSize(s string) int64 {
	s = strings.TrimSpace(s)
	if s == "" {
		return 0
	}
	multiplier := int64(1)
	lastChar := strings.ToUpper(s[len(s)-1:])
	switch lastChar {
	case "T":
		multiplier = 1024
		s = s[:len(s)-1]
	case "G":
		multiplier = 1
		s = s[:len(s)-1]
	case "M":
		// Less than 1 GB
		s = s[:len(s)-1]
		v, _ := strconv.ParseFloat(s, 64)
		return int64(v / 1024)
	case "K":
		s = s[:len(s)-1]
		v, _ := strconv.ParseFloat(s, 64)
		return int64(v / (1024 * 1024))
	}
	v, _ := strconv.ParseFloat(s, 64)
	return int64(v * float64(multiplier))
}

func parseUptime(section string) (uptime string, load1, load5, load15 float64) {
	// uptime output:
	//  14:30:00 up 14 days,  3:42,  2 users,  load average: 0.50, 0.30, 0.20
	line := strings.TrimSpace(section)
	for _, l := range strings.Split(section, "\n") {
		l = strings.TrimSpace(l)
		if l != "" {
			line = l
			break
		}
	}

	// Parse load averages
	if idx := strings.Index(line, "load average:"); idx >= 0 {
		loadStr := line[idx+len("load average:"):]
		parts := strings.Split(loadStr, ",")
		if len(parts) >= 3 {
			load1, _ = strconv.ParseFloat(strings.TrimSpace(parts[0]), 64)
			load5, _ = strconv.ParseFloat(strings.TrimSpace(parts[1]), 64)
			load15, _ = strconv.ParseFloat(strings.TrimSpace(parts[2]), 64)
		}
	}

	// Parse uptime string - between "up" and "user" or "load"
	uptime = parseUptimeString(line)

	return uptime, load1, load5, load15
}

func parseUptimeString(line string) string {
	lower := strings.ToLower(line)
	upIdx := strings.Index(lower, " up ")
	if upIdx < 0 {
		return "unknown"
	}
	rest := line[upIdx+4:]

	// Find the end: either "user" or "load"
	endIdx := len(rest)
	for _, marker := range []string{" user", "load average"} {
		if idx := strings.Index(strings.ToLower(rest), marker); idx >= 0 && idx < endIdx {
			endIdx = idx
		}
	}
	result := strings.TrimSpace(rest[:endIdx])
	// Remove trailing comma and digits like ", 2"
	// Pattern: ",  X" at end where X is user count
	re := regexp.MustCompile(`,\s*\d+\s*$`)
	result = re.ReplaceAllString(result, "")
	result = strings.TrimRight(result, ", ")

	if result == "" {
		return "unknown"
	}

	// Format nicely: "14 days, 3:42" -> "14 days, 3 hours"
	result = formatUptime(result)
	return result
}

func formatUptime(raw string) string {
	// If it contains days and a time like "3:42", convert time part
	parts := strings.SplitN(raw, ",", 2)
	if len(parts) == 2 {
		timePart := strings.TrimSpace(parts[1])
		if strings.Contains(timePart, ":") {
			hm := strings.SplitN(timePart, ":", 2)
			h, _ := strconv.Atoi(strings.TrimSpace(hm[0]))
			m, _ := strconv.Atoi(strings.TrimSpace(hm[1]))
			timePart = fmt.Sprintf("%d hours, %d min", h, m)
		}
		return strings.TrimSpace(parts[0]) + ", " + timePart
	}
	// Just time like "3:42"
	if strings.Contains(raw, ":") && !strings.Contains(raw, "day") {
		hm := strings.SplitN(raw, ":", 2)
		h, _ := strconv.Atoi(strings.TrimSpace(hm[0]))
		m, _ := strconv.Atoi(strings.TrimSpace(hm[1]))
		if h > 0 {
			return fmt.Sprintf("%d hours, %d min", h, m)
		}
		return fmt.Sprintf("%d min", m)
	}
	return raw
}
