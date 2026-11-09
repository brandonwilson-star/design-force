import { useEffect, useRef, useState } from "react";
import type { Collaborator, ModeId } from "../types";

const COLORS = ["#d6ff45", "#7eb6ff", "#ffb45c", "#f08bd4", "#8ee0c2", "#f3ece1"];
const MODES = new Set<ModeId>(["design", "photo", "vector", "motion", "film", "ai", "prototype", "layout", "pdf"]);

export interface PresenceSelf {
  id: string;
  name: string;
  color: string;
}

export function loadPresenceSelf(): PresenceSelf {
  const name = localStorage.getItem("df.presenceName") ?? "";
  let id = sessionStorage.getItem("df.presenceId");
  let color = sessionStorage.getItem("df.presenceColor");
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem("df.presenceId", id);
  }
  if (!color || !/^#[0-9a-fA-F]{6}$/.test(color)) {
    color = COLORS[Math.floor(Math.random() * COLORS.length)];
    sessionStorage.setItem("df.presenceColor", color);
  }
  return { id, name, color };
}

export function savePresenceName(name: string): PresenceSelf {
  const next = { ...loadPresenceSelf(), name: name.trim().slice(0, 40) };
  localStorage.setItem("df.presenceName", next.name);
  return next;
}

function asMode(value: unknown): ModeId {
  return typeof value === "string" && MODES.has(value as ModeId) ? (value as ModeId) : "design";
}

function asPeer(value: unknown): Collaborator | null {
  if (!value || typeof value !== "object") return null;
  const peer = value as Record<string, unknown>;
  if (typeof peer.id !== "string" || !peer.id) return null;
  return {
    id: peer.id,
    name: typeof peer.name === "string" ? peer.name : "",
    color: typeof peer.color === "string" && /^#[0-9a-fA-F]{6}$/.test(peer.color) ? peer.color : "#8b908c",
    mode: asMode(peer.mode),
    x: typeof peer.x === "number" && Number.isFinite(peer.x) ? peer.x : null,
    y: typeof peer.y === "number" && Number.isFinite(peer.y) ? peer.y : null,
  };
}

export function useFilePresence(fileId: string, mode: ModeId, onPeers: (peers: Collaborator[]) => void) {
  const onPeersRef = useRef(onPeers);
  onPeersRef.current = onPeers;
  const [self, setSelf] = useState<PresenceSelf>(loadPresenceSelf);
  const selfRef = useRef(self);
  selfRef.current = self;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const cursor = useRef<{ x: number | null; y: number | null }>({ x: null, y: null });
  const sendRef = useRef<() => void>(() => {});
  const lastMove = useRef(0);

  useEffect(() => {
    const localPeers = new Map<string, { peer: Collaborator; at: number }>();
    let socket: WebSocket | null = null;
    let channel: BroadcastChannel | null = null;
    let liveSocket = false;
    let closed = false;

    const payload = () =>
      JSON.stringify({
        type: "state",
        fileId,
        id: selfRef.current.id,
        name: selfRef.current.name,
        color: selfRef.current.color,
        mode: modeRef.current,
        x: cursor.current.x,
        y: cursor.current.y,
      });

    const send = () => {
      const body = payload();
      if (liveSocket && socket?.readyState === WebSocket.OPEN) socket.send(body);
      else channel?.postMessage(body);
    };
    sendRef.current = send;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    socket = new WebSocket(`${protocol}//${window.location.host}/api/presence`);
    socket.onopen = () => {
      liveSocket = true;
      send();
    };
    socket.onmessage = (event) => {
      let msg: { type?: string; peers?: unknown };
      try {
        msg = JSON.parse(String(event.data)) as { type?: string; peers?: unknown };
      } catch {
        return;
      }
      if (msg.type !== "peers" || !Array.isArray(msg.peers)) return;
      const peers = msg.peers.map(asPeer).filter((peer): peer is Collaborator => !!peer && peer.id !== selfRef.current.id);
      onPeersRef.current(peers);
    };
    socket.onclose = () => {
      liveSocket = false;
      if (!closed) onPeersRef.current([]);
    };
    socket.onerror = () => {
      liveSocket = false;
    };

    const publishLocal = () => {
      const now = Date.now();
      const list: Collaborator[] = [];
      for (const [id, entry] of localPeers) {
        if (now - entry.at >= 6000) localPeers.delete(id);
        else list.push(entry.peer);
      }
      onPeersRef.current(list);
    };

    channel = new BroadcastChannel(`df-presence:${fileId}`);
    channel.onmessage = (event) => {
      if (liveSocket) return;
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(event.data)) as Record<string, unknown>;
      } catch {
        return;
      }
      const peer = asPeer(msg);
      if (!peer || peer.id === selfRef.current.id) return;
      localPeers.set(peer.id, { peer, at: Date.now() });
      publishLocal();
    };

    const beat = window.setInterval(send, 2000);
    const sweep = window.setInterval(() => {
      if (liveSocket) return;
      publishLocal();
    }, 2000);

    return () => {
      closed = true;
      window.clearInterval(beat);
      window.clearInterval(sweep);
      sendRef.current = () => {};
      socket?.close();
      channel?.close();
    };
  }, [fileId]);

  return {
    self,
    setName(name: string) {
      const next = savePresenceName(name);
      selfRef.current = next;
      setSelf(next);
      sendRef.current();
    },
    move(x: number, y: number) {
      cursor.current = { x, y };
      const now = Date.now();
      if (now - lastMove.current < 80) return;
      lastMove.current = now;
      sendRef.current();
    },
  };
}
