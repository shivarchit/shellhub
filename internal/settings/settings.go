package settings

import (
	"encoding/json"
	"fmt"
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
// ResolvePort will probe before giving up when falling back automatically.
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
//     The value MUST be free — if it's busy, an error is returned. No fallback.
//     This is intentional: when a user explicitly asks for a port, they want
//     that port (or a clear failure), not a silent move to another one.
//  2. Else use the port saved in settings.json (if any). If busy, fall back to
//     the next free port in [port, port+PortFallbackSpan] and persist it.
//  3. Else use DefaultPort. If busy, fall back the same way.
//
// Pass 0 (or any non-positive value) when no explicit override is provided.
// The final bound port is returned.
func ResolvePort(portFlag int) (int, error) {
	saved, _ := Load()

	// Explicit override: bind exactly, no fallback, persist on success.
	if portFlag > 0 {
		if !isPortFree(portFlag) {
			return 0, fmt.Errorf("port %d is already in use", portFlag)
		}
		if saved == nil {
			saved = &Settings{}
		}
		if saved.Port != portFlag {
			saved.Port = portFlag
			_ = Save(saved)
		}
		return portFlag, nil
	}

	// Implicit: prefer saved port, else DefaultPort. Both are allowed to fall back.
	chosen := DefaultPort
	if saved != nil && saved.Port > 0 {
		chosen = saved.Port
	}

	final := firstFreePort(chosen, PortFallbackSpan)
	if final == 0 {
		return 0, fmt.Errorf("no free port in [%d, %d]", chosen, chosen+PortFallbackSpan)
	}
	if final != chosen {
		log.Printf("Port %d is busy, using %d instead", chosen, final)
		if saved == nil {
			saved = &Settings{}
		}
		saved.Port = final
		_ = Save(saved)
	}
	return final, nil
}

// firstFreePort returns the first port in [start, start+span] that can be bound,
// or 0 if none in that range are free.
func firstFreePort(start, span int) int {
	for p := start; p <= start+span; p++ {
		if isPortFree(p) {
			return p
		}
	}
	return 0
}

// isPortFree probes whether the given TCP port can be bound on all interfaces.
// We probe the SAME address the real HTTP server will bind to (":port", i.e.
// the wildcard address). Probing "127.0.0.1:port" instead would miss conflicts
// with processes already bound to "0.0.0.0:port" or "[::]:port" — on Windows
// in particular the loopback bind can succeed even when the wildcard is taken.
func isPortFree(port int) bool {
	ln, err := net.Listen("tcp", ":"+strconv.Itoa(port))
	if err != nil {
		return false
	}
	_ = ln.Close()
	return true
}
