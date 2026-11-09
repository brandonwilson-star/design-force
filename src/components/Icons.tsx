export function Icon({ name, size = 16 }: { name: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {glyph(name)}
    </svg>
  );
}

function glyph(name: string) {
  switch (name) {
    case "pointer":
      return <path d="M5 4l6 15 2-6 6-2z" />;
    case "frame":
      return <path d="M8 4H5v3M16 4h3v3M20 16v3h-3M8 20H5v-3" />;
    case "link":
      return <path d="M9 15l6-6M8 12l-2 2a3 3 0 0 0 4 4l2-2M16 12l2-2a3 3 0 0 0-4-4l-2 2" />;
    case "polygon":
      return <path d="M12 4l7 5-3 8H8L5 9z" />;
    case "star":
      return <path d="M12 4l2 5h5l-4 3 2 5-5-3-5 3 2-5-4-3h5z" />;
    case "square":
      return <rect x="5" y="5" width="14" height="14" rx="1.5" />;
    case "circle":
      return <circle cx="12" cy="12" r="7" />;
    case "pen":
      return <path d="M14 5l5 5-9 9H5v-5z" />;
    case "type":
      return <path d="M6 6h12M12 6v12" />;
    case "comment":
      return <path d="M6 6h12v8H9l-3 3z" />;
    case "component":
      return <path d="M12 4l7 4v8l-7 4-7-4V8z" />;
    case "slice":
      return <path d="M5 5h6v6H5zM13 13h6v6h-6z" />;
    case "hand":
      return <path d="M8 11V6M12 11V5M16 11V7M8 11v6a4 4 0 0 0 8 0v-2" />;
    case "zoom":
      return (
        <>
          <circle cx="11" cy="11" r="6" />
          <path d="M16 16l4 4M11 8v6M8 11h6" />
        </>
      );
    case "scan":
      return <path d="M5 8V5h3M16 5h3v3M19 16v3h-3M8 19H5v-3" />;
    case "brush":
      return <path d="M14 4l6 6-8 8H6v-6z" />;
    case "crop":
      return <path d="M7 3v14h14M3 7h14" />;
    case "eyedropper":
      return <path d="M14 5l5 5-7 7-5-5zM7 17l-2 4" />;
    case "spline":
      return <path d="M5 16c4-8 10-8 14 0" />;
    case "scissors":
      return (
        <>
          <circle cx="7" cy="7" r="2" />
          <circle cx="7" cy="17" r="2" />
          <path d="M9 8l10 8M9 16L19 8" />
        </>
      );
    case "image":
      return (
        <>
          <rect x="4" y="5" width="16" height="14" rx="1.5" />
          <path d="M8 14l3-3 5 5" />
        </>
      );
    case "sparkles":
      return <path d="M12 4l1.2 4.2L17 9.5l-3.8 1.3L12 15l-1.2-4.2L7 9.5l3.8-1.3z" />;
    case "play":
      return <path d="M8 6l10 6-10 6z" />;
    case "folder":
      return <path d="M4 7h6l2 2h8v9H4z" />;
    case "search":
      return (
        <>
          <circle cx="11" cy="11" r="5" />
          <path d="M15 15l4 4" />
        </>
      );
    case "grid":
      return <path d="M5 5h6v6H5zM13 5h6v6h-6zM5 13h6v6H5zM13 13h6v6h-6z" />;
    case "list":
      return <path d="M8 7h12M8 12h12M8 17h12M5 7h.01M5 12h.01M5 17h.01" />;
    case "bell":
      return <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 19a2 2 0 0 0 4 0" />;
    case "page":
      return <path d="M7 4h7l4 4v12H7zM14 4v4h4" />;
    case "undo":
      return <path d="M8 8H4v4M5 12a7 7 0 1 0 2-5" />;
    case "redo":
      return <path d="M16 8h4v4M19 12a7 7 0 1 1-2-5" />;
    case "chevron":
      return <path d="M7 10l5 5 5-5" />;
    case "eye":
      return (
        <>
          <path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z" />
          <circle cx="12" cy="12" r="2.2" />
        </>
      );
    case "eye-off":
      return <path d="M4 5l16 14M9 7.2A9 9 0 0 1 12 6c5.5 0 9 6 9 6a16 16 0 0 1-3.2 3.6M6.2 8.4A16 16 0 0 0 3 12s3.5 6 9 6a9 9 0 0 0 3.2-.6" />;
    case "plus":
      return <path d="M12 5v14M5 12h14" />;
    case "minus":
      return <path d="M6 12h12" />;
    case "sliders":
      return (
        <>
          <path d="M4 7h16M4 12h16M4 17h16" />
          <circle cx="9" cy="7" r="1.7" fill="currentColor" stroke="none" />
          <circle cx="15" cy="12" r="1.7" fill="currentColor" stroke="none" />
          <circle cx="11" cy="17" r="1.7" fill="currentColor" stroke="none" />
        </>
      );
    case "chevrons":
      return <path d="M8 10l4-3 4 3M8 14l4 3 4-3" />;
    case "filter":
      return <path d="M4 6h16M7 12h10M10 18h4" />;
    case "paperclip":
      return <path d="M8 12.5l6.2-6.2a3 3 0 0 1 4.2 4.2l-7.4 7.5a4.2 4.2 0 0 1-6-6L12 5" />;
    case "wand":
      return <path d="M4 20l8-8M14 4l1 3 3 1-3 1-1 3-1-3-3-1 3-1zM15 15l.6 1.4L17 17l-1.4.6L15 19l-.6-1.4L13 17l1.4-.6z" />;
    case "stamp":
      return <path d="M8 13h8l-1 4H9zM9 13V8a3 3 0 0 1 6 0v5M7 20h10" />;
    case "eraser":
      return <path d="M4 16l8-8 6 6-5 5H8zM9 19h11" />;
    case "bucket":
      return <path d="M8 11l6-6 5 5-6 6zM8 11L4 15a3 3 0 0 0 4 4l2-2" />;
    case "camera":
      return (
        <>
          <path d="M4 9h3l2-2h6l2 2h3v9H4z" />
          <circle cx="12" cy="13" r="3" />
        </>
      );
    case "pin":
      return <path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10z" />;
    case "magnet":
      return <path d="M7 4v7a5 5 0 0 0 10 0V4M7 4H4v3M17 4h3v3" />;
    case "audio":
      return <path d="M5 10v4M9 7v10M13 5v14M17 8v8M21 11v2" />;
    case "expand":
      return <path d="M9 4H4v5M15 4h5v5M20 15v5h-5M4 15v5h5" />;
    case "history":
      return <path d="M4 12a8 8 0 1 0 2-5M4 4v4h4M12 8v5l3 2" />;
    case "flow":
      return <path d="M7 7h4a5 5 0 0 1 0 10H9M17 7l4 4-4 4M15 11h6" />;
    case "hotspot":
      return <path d="M5 8V5h3M16 5h3v3M19 16v3h-3M8 19H5v-3M9 12h6" />;
    case "direct":
      return <path d="M6 4l5 16 2-6 6-2zM15 15l4 4" />;
    case "slip":
      return <path d="M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4" />;
    case "move":
      return <path d="M12 4v16M4 12h16M12 4l-2 2M12 4l2 2M12 20l-2-2M12 20l2-2M4 12l2-2M4 12l2 2M20 12l-2-2M20 12l-2 2" />;
    case "external":
      return <path d="M10 6H6v12h12v-4M13 5h6v6M11 13l8-8" />;
    default:
      return <circle cx="12" cy="12" r="3" />;
  }
}
