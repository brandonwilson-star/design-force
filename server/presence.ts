import type { Server } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";

export interface LivePeer {
  id: string;
  name: string;
  color: string;
  mode: string;
  x: number | null;
  y: number | null;
  fileId: string;
}

interface Client {
  id: string;
  fileId: string;
  socket: WebSocket;
  seen: number;
  peer: LivePeer;
}

const attached = new WeakSet<Server>();
const rooms = new Map<string, Map<string, Client>>();

export function attachPresence(httpServer: Server) {
  if (attached.has(httpServer)) return;
  attached.add(httpServer);
  const wss = new WebSocketServer({ noServer: true });
  const timer = setInterval(() => dropStale(), 2000);
  httpServer.on("close", () => clearInterval(timer));
  httpServer.on("upgrade", (req, socket, head) => {
    const path = (req.url ?? "").split("?")[0];
    if (path !== "/api/presence") return;
    wss.handleUpgrade(req, socket, head, (ws) => connect(ws));
  });
}

function connect(socket: WebSocket) {
  const client: Client = {
    id: "",
    fileId: "",
    socket,
    seen: Date.now(),
    peer: { id: "", name: "", color: "#8b908c", mode: "design", x: null, y: null, fileId: "" },
  };
  socket.on("message", (data) => handle(client, data.toString()));
  socket.on("close", () => leave(client));
  socket.on("error", () => leave(client));
}

function handle(client: Client, text: string) {
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return;
  }
  if (msg.type !== "state" || typeof msg.id !== "string" || typeof msg.fileId !== "string") return;
  if (client.fileId && (client.fileId !== msg.fileId || client.id !== msg.id)) {
    rooms.get(client.fileId)?.delete(client.id);
  }
  client.id = msg.id.slice(0, 80);
  client.fileId = msg.fileId.slice(0, 80);
  client.seen = Date.now();
  client.peer = {
    id: client.id,
    name: typeof msg.name === "string" ? msg.name.slice(0, 40) : "",
    color: typeof msg.color === "string" && /^#[0-9a-fA-F]{6}$/.test(msg.color) ? msg.color : "#8b908c",
    mode: typeof msg.mode === "string" ? msg.mode.slice(0, 24) : "design",
    x: finite(msg.x),
    y: finite(msg.y),
    fileId: client.fileId,
  };
  let room = rooms.get(client.fileId);
  if (!room) {
    room = new Map();
    rooms.set(client.fileId, room);
  }
  room.set(client.id, client);
  broadcast(client.fileId);
}

function dropStale() {
  const now = Date.now();
  const stale: Client[] = [];
  for (const room of rooms.values()) {
    for (const client of room.values()) {
      if (now - client.seen >= 8000) stale.push(client);
    }
  }
  for (const client of stale) {
    client.socket.terminate();
    leave(client);
  }
}

function leave(client: Client) {
  if (!client.fileId || !client.id) return;
  const room = rooms.get(client.fileId);
  if (!room || room.get(client.id) !== client) return;
  room.delete(client.id);
  if (!room.size) rooms.delete(client.fileId);
  broadcast(client.fileId);
}

function broadcast(fileId: string) {
  const room = rooms.get(fileId);
  if (!room) return;
  for (const client of room.values()) {
    const peers = [...room.values()].filter((other) => other.id !== client.id).map((other) => other.peer);
    if (client.socket.readyState === client.socket.OPEN) client.socket.send(JSON.stringify({ type: "peers", peers }));
  }
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
