export function createTerminalSocket(serverId: number): WebSocket {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const url = `${protocol}//${window.location.host}/api/terminal/${serverId}`
  return new WebSocket(url)
}

export function sendResize(ws: WebSocket, cols: number, rows: number) {
  ws.send(JSON.stringify({ type: 'resize', cols, rows }))
}
