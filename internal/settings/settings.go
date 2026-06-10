package settings

import (
	"encoding/json"
	"log"
	"net"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
)

// DefaultPort is the port ShellHub binds to when no flag or saved value applies.
const DefaultPort = 8080

// PortFallbackSpan is how many sequential ports above the requested one
// ResolvePort will probe before giving up.
const PortFallbackSpan = 20

type Settings struct {
	DBPath string `json:"db_path"`
	Port   int    `json:"port,omitempty"`
}

func configDir() (string, error) {
	if runtime.GOOS == "windows" {
		appData := os.Getenv("APPDATA")
		if appData == "" {
			home, err := os.UserHomeDir()
			if err != nil {
				return "", err
			}
			appData = filepath.Join(home, "AppData", "Roaming")
		}
		dir := filepath.Join(appData, "ShellHub")
		os.MkdirAll(dir, 0755)
		return dir, nil
	}

	xdg := os.Getenv("XDG_CONFIG_HOME")
	if xdg == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		xdg = filepath.Join(home, ".config")
	}
	dir := filepath.Join(xdg, "shellhub")
	os.MkdirAll(dir, 0755)
	return dir, nil
}

func settingsPath() (string, error) {
	dir, err := configDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "settings.json"), nil
}

func Load() (*Settings, error) {
	path, err := settingsPath()
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var s Settings
	if err := json.Unmarshal(data, &s); err != nil {
		return nil, err
	}
	return &s, nil
}

func Save(s *Settings) error {
	path, err := settingsPath()
	if err != nil {
		return err
	}
	data, err := json.MarshalIndent(s, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}

// ResolvePort decides which port to bind on:
//  1. If portFlag > 0, treat it as an explicit override (e.g. user passed -port).
//     The value is used and persisted, even if it equals DefaultPort.
//  2. Else use the port saved in settings.json (if any).
//  3. Else fall back to DefaultPort.
//
// Pass 0 (or any non-positive value) when no explicit override is provided.
//
// If the chosen port is busy, the next free port in [port, port+PortFallbackSpan]
// is picked and persisted. The final bound port is returned.
func ResolvePort(portFlag int) int {
	saved, _ := Load()

	chosen := DefaultPort
	persist := false

	switch {
	case portFlag > 0:
		chosen = portFlag
		persist = true
	case saved != nil && saved.Port > 0:
		chosen = saved.Port
	}

	final := firstFreePort(chosen, PortFallbackSpan)
	if final != chosen {
		log.Printf("Port %d is busy, using %d instead", chosen, final)
		persist = true
	}

	if persist {
		if saved == nil {
			saved = &Settings{}
		}
		saved.Port = final
		_ = Save(saved)
	}
	return final
}

// firstFreePort returns the first port in [start, start+span] that can be bound,
// falling back to `start` if none in that range are free.
func firstFreePort(start, span int) int {
	for p := start; p <= start+span; p++ {
		if isPortFree(p) {
			return p
		}
	}
	return start
}

func isPortFree(port int) bool {
	ln, err := net.Listen("tcp", "127.0.0.1:"+strconv.Itoa(port))
	if err != nil {
		return false
	}
	_ = ln.Close()
	return true
}
