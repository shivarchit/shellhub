export function createTerminalSocket(serverId: number): WebSocket {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  // The auth token is sent via httpOnly cookie on the upgrade request.
  // No need to pass it as a query param for same-origin browser connections.
  const url = `${protocol}//${window.location.host}/api/terminal/${serverId}`
  return new WebSocket(url)
}

export function sendResize(ws: WebSocket, cols: number, rows: number) {
  ws.send(JSON.stringify({ type: 'resize', cols, rows }))
}
