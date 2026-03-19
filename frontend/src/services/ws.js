export function connectStatusSocket(onEvent) {
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  ws.onmessage = (event) => {
    const parsed = JSON.parse(event.data);
    onEvent(parsed);
  };
  return ws;
}
