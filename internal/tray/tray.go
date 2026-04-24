package tray

import (
	"fmt"
	"log"
	"os"

	"github.com/getlantern/systray"
)

// ServerFunc is the function signature for starting the HTTP server.
// It receives the port, database path, and dev flag, and blocks until
// the server stops or an error occurs.
type ServerFunc func(port int, dbPath string, dev bool) error

// OpenBrowserFunc opens the given URL in the default browser.
type OpenBrowserFunc func(url string)

// Run starts the system-tray event loop. It shows a tray icon with menu
// items for opening the browser and stopping the server. The HTTP server
// is started in a background goroutine. This function blocks until the
// user chooses "Stop Server" or the server exits with an error.
func Run(port int, dbPath string, startServer ServerFunc, openBrowser OpenBrowserFunc) {
	url := fmt.Sprintf("http://localhost:%d", port)

	onReady := func() {
		systray.SetIcon(GenerateIcon())
		systray.SetTitle("ShellHub")
		systray.SetTooltip("ShellHub - SSH Manager")

		mOpen := systray.AddMenuItem("Open in Browser", "Open ShellHub in your default browser")
		systray.AddSeparator()
		mQuit := systray.AddMenuItem("Stop Server", "Stop ShellHub and exit")

		// Start the HTTP server in a goroutine
		go func() {
			if err := startServer(port, dbPath, false); err != nil {
				log.Printf("Server error: %v", err)
				systray.Quit()
			}
		}()

		// Auto-open the browser
		go openBrowser(url)

		// Handle menu clicks
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
