package tray

import (
	"fmt"
	"log"
	"net"
	"os"
	"path/filepath"
	"strconv"

	"github.com/getlantern/systray"
	"github.com/sarchitt/shellhub/internal/settings"
	"github.com/sqweek/dialog"
)

type ServerFunc func(port int, dbPath string, dev bool) error
type OpenBrowserFunc func(url string)

const defaultPort = 8080

// resolveDBPath checks saved settings, then shows folder picker if needed.
func resolveDBPath(dbFlag string) string {
	if dbFlag != "shellhub.db" {
		return dbFlag
	}

	saved, err := settings.Load()
	if err == nil && saved != nil && saved.DBPath != "" {
		if _, statErr := os.Stat(filepath.Dir(saved.DBPath)); statErr == nil {
			return saved.DBPath
		}
	}

	dir, err := dialog.Directory().Title("ShellHub — Choose where to store your data").Browse()
	if err != nil {
		return "shellhub.db"
	}

	dbPath := filepath.Join(dir, "shellhub.db")
	settings.Save(&settings.Settings{DBPath: dbPath})
	return dbPath
}

// resolvePort decides which port to bind on:
//  1. If the user passed -port with a non-default value, use it (and persist it).
//  2. Else use the port saved in settings.json (if any).
//  3. Else fall back to defaultPort.
//
// If the chosen port is busy, the next free port (up to +20) is picked and persisted.
func resolvePort(portFlag int) int {
	saved, _ := settings.Load()

	chosen := defaultPort
	persist := false

	switch {
	case portFlag != defaultPort && portFlag > 0:
		chosen = portFlag
		persist = true
	case saved != nil && saved.Port > 0:
		chosen = saved.Port
	}

	final := firstFreePort(chosen, 20)
	if final != chosen {
		log.Printf("Port %d is busy, using %d instead", chosen, final)
		persist = true
	}

	if persist {
		if saved == nil {
			saved = &settings.Settings{}
		}
		saved.Port = final
		_ = settings.Save(saved)
	}
	return final
}

// firstFreePort returns the first port in [start, start+span] that we can bind on,
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

func Run(portFlag int, dbFlag string, startServer ServerFunc, openBrowser OpenBrowserFunc) {
	onReady := func() {
		systray.SetIcon(GenerateIcon())
		systray.SetTitle("ShellHub")

		port := resolvePort(portFlag)
		url := fmt.Sprintf("http://localhost:%d", port)
		systray.SetTooltip("ShellHub — " + url)

		mOpen := systray.AddMenuItem("Open in Browser", "Open ShellHub in your default browser")
		mURL := systray.AddMenuItem(url, "Current ShellHub URL")
		mURL.Disable()
		systray.AddSeparator()
		mQuit := systray.AddMenuItem("Stop Server", "Stop ShellHub and exit")

		dbPath := resolveDBPath(dbFlag)

		go func() {
			if err := startServer(port, dbPath, false); err != nil {
				log.Printf("Server error: %v", err)
				systray.Quit()
			}
		}()

		go openBrowser(url)

		go func() {
			for {
				select {
				case <-mOpen.ClickedCh:
					openBrowser(url)
				case <-mQuit.ClickedCh:
					systray.Quit()
				}
			}
		}()
	}

	onExit := func() {
		os.Exit(0)
	}

	systray.Run(onReady, onExit)
}
