package api

import (
	"net/http"
	"strconv"
	"sync"
	"sync/atomic"
	"time"

	"github.com/shivarchit/shellhub/internal/config"
)

// MetricsSummary is the top-level summary returned by the metrics endpoint.
type MetricsSummary struct {
	TotalServers    int     `json:"total_servers"`
	OnlineServers   int     `json:"online_servers"`
	TotalExecsToday int     `json:"total_execs_today"`
	AvgUptime       float64 `json:"avg_uptime"`
}

// MetricsResponse holds all metrics data.
type MetricsResponse struct {
	Summary      MetricsSummary             `json:"summary"`
	Uptimes      []config.ServerUptimeInfo  `json:"uptimes"`
	Connections  []config.DailyCount        `json:"connections"`
	Executions   []config.DailyExecCount    `json:"executions"`
	TopServers   []config.ServerActivity    `json:"top_servers"`
	Latencies    map[string][]config.LatencyPoint `json:"latencies"`
}

func (h *Handler) getMetrics(w http.ResponseWriter, r *http.Request) {
	// Parse time range (hours)
	hoursBack := 168 // default 7 days
	if rangeStr := r.URL.Query().Get("range"); rangeStr != "" {
		switch rangeStr {
		case "24h":
			hoursBack = 24
		case "7d":
			hoursBack = 168
		case "30d":
			hoursBack = 720
		default:
			if v, err := strconv.Atoi(rangeStr); err == nil && v > 0 {
				hoursBack = v
			}
		}
	}

	// Fetch all data
	servers, _ := h.store.GetServers()
	totalServers := len(servers)

	// Ping live rather than reading ping_history: history is only written when a
	// page pings (default every 30 min) while the count window is 5 min, so the
	// stored count reads 0 even when every server card shows Online.
	onlineCount := h.countOnline(servers)
	execsToday, _ := h.store.GetTotalExecsToday()
	uptimes, _ := h.store.GetAllServersUptime(hoursBack)
	connections, _ := h.store.GetConnectionCountsByDay(hoursBack)
	executions, _ := h.store.GetExecCountsByDay(hoursBack)
	topServers, _ := h.store.GetTopServersByActivity(hoursBack, 10)
	latencyMap, _ := h.store.GetAllLatencyTrends(hoursBack)

	// Calculate average uptime
	var avgUptime float64
	if len(uptimes) > 0 {
		var sum float64
		for _, u := range uptimes {
			sum += u.Uptime
		}
		avgUptime = sum / float64(len(uptimes))
	}

	// Convert latency map keys to strings for JSON
	latencies := make(map[string][]config.LatencyPoint)
	for serverID, points := range latencyMap {
		// Find server name
		name := ""
		for _, s := range servers {
			if s.ID == serverID {
				name = s.Name
				break
			}
		}
		if name == "" {
			name = strconv.Itoa(serverID)
		}
		latencies[name] = points
	}

	resp := MetricsResponse{
		Summary: MetricsSummary{
			TotalServers:    totalServers,
			OnlineServers:   onlineCount,
			TotalExecsToday: execsToday,
			AvgUptime:       avgUptime,
		},
		Uptimes:     uptimes,
		Connections: connections,
		Executions:  executions,
		TopServers:  topServers,
		Latencies:   latencies,
	}

	if resp.Uptimes == nil {
		resp.Uptimes = []config.ServerUptimeInfo{}
	}
	if resp.Connections == nil {
		resp.Connections = []config.DailyCount{}
	}
	if resp.Executions == nil {
		resp.Executions = []config.DailyExecCount{}
	}
	if resp.TopServers == nil {
		resp.TopServers = []config.ServerActivity{}
	}
	if resp.Latencies == nil {
		resp.Latencies = make(map[string][]config.LatencyPoint)
	}

	writeJSON(w, 200, resp)
}

// countOnline pings every server in parallel and returns how many answered.
func (h *Handler) countOnline(servers []config.Server) int {
	var wg sync.WaitGroup
	var online int64
	for _, srv := range servers {
		wg.Add(1)
		go func(host string, port int) {
			defer wg.Done()
			if up, _ := h.pinger.Ping(host, port, 3*time.Second); up {
				atomic.AddInt64(&online, 1)
			}
		}(srv.Host, srv.Port)
	}
	wg.Wait()
	return int(online)
}

func (h *Handler) recordPing(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r)
	if err != nil {
		writeError(w, 400, "invalid server id")
		return
	}
	srv, err := h.store.GetServer(id)
	if err != nil {
		writeError(w, 404, "server not found")
		return
	}

	start := time.Now()
	online, _ := h.pinger.Ping(srv.Host, srv.Port, 5*time.Second)
	latencyMs := int(time.Since(start).Milliseconds())

	h.store.LogPing(id, online, latencyMs)
	writeJSON(w, 200, map[string]any{"online": online, "latency_ms": latencyMs})
}
