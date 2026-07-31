package tray

import (
	"fmt"
	"log"
	"os"
	"path/filepath"

	"github.com/getlantern/systray"
	"github.com/shivarchit/shellhub/internal/settings"
	"github.com/sqweek/dialog"
)

type ServerFunc func(port int, dbPath string, dev bool) error
type OpenBrowserFunc func(url string)

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

func Run(portFlag int, dbFlag string, startServer ServerFunc, openBrowser OpenBrowserFunc) {
	onReady := func() {
		systray.SetIcon(GenerateIcon())

		port, err := settings.ResolvePort(portFlag)
		if err != nil {
			// Explicit -port that was already in use. Surface visibly since
			// the tray build has no console.
			log.Printf("Cannot start server: %v", err)
			dialog.Message("ShellHub cannot start:\n\n%v\n\nChoose a different port or stop the process using it.", err).
				Title("ShellHub — Port Unavailable").Error()
			systray.Quit()
			return
		}
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
