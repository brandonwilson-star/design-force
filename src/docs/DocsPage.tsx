const shots = [
  ["design", "Design", "Frames, layers, and the component rail."],
  ["photo", "Photo", "Brush, retouch, and develop controls."],
  ["vector", "Vector", "Pen, direct selection, and shapes."],
  ["motion", "Motion", "Camera, keyframes, and the timeline."],
  ["video", "Video", "Trim, slip, and audio on the same canvas."],
  ["prototype", "Prototype", "Connectors between screens."],
  ["ai", "AI", "Prompt on the shared canvas."],
  ["layers", "Layers", "Show and hide any layer from the eye control."],
  ["comments", "Comments", "A comment with a screenshot or document attached."],
] as const;

export function DocsPage() {
  return (
    <main className="docs">
      <header>
        <p className="docs-kicker">Design Force</p>
        <h1>How to use the studio</h1>
        <p>One canvas. The mode tabs change the tools and side panels. The frames stay where you left them.</p>
        <p>
          <a href="/">Open the studio</a>
        </p>
      </header>
      <video className="docs-video" controls poster="/docs/design.jpg">
        <source src="/docs/walkthrough.webm" type="video/webm" />
      </video>
      <section>
        <h2>Move around</h2>
        <ul>
          <li>Hold Space and drag to pan. Scroll to pan, and pinch or hold ⌘ while scrolling to zoom.</li>
          <li>Drag the edges of the left and right panels to resize them. The widths stay on this browser.</li>
          <li>Press ⌘K for commands, and ⌘\ to hide the chrome. The shortcut list is under View, or press ⌃⇧? on a Mac.</li>
          <li>V select, F frame, R rectangle, O ellipse, T text, C comment, B brush, N prototype connector, ⌘⇧H hide the selected layer.</li>
        </ul>
      </section>
      <section>
        <h2>Workspaces</h2>
        <div className="docs-grid">
          {shots.map(([id, title, copy]) => (
            <figure key={id}>
              <img src={`/docs/${id}.jpg`} alt={`${title} workspace`} />
              <figcaption>
                <strong>{title}</strong>
                <span>{copy}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>
      <section>
        <h2>Comments</h2>
        <p>Press C, or click the comment tool. A comment card opens on the canvas. Write the note, then use the paperclip to attach screenshots or documents. Click the canvas to drop the pin. ⌘Z still undoes it.</p>
      </section>
      <section>
        <h2>Layers</h2>
        <p>The left panel lists pages and the layer tree. The eye on a row hides or shows that layer on the canvas. The filter control lists only visible layers. ⌘⇧H does the same for the selection.</p>
      </section>
      <section>
        <h2>Prototype</h2>
        <p>Open Prototype and select a frame. Drag the handle on its right edge to another frame, or use the connector tool. Drag an existing connector onto a different frame to retarget it, or off the canvas to remove it. The inspector sets the trigger, destination, animation, duration, delay, and easing. Preview flow plays the connections.</p>
      </section>
      <section>
        <h2>Export</h2>
        <p>Select a frame and use Export in the app bar, or the export control in the inspector. PNG, JPEG, SVG, and PDF are image files. .fig, .pen, and .psd are interchange files. Video export uses the browser’s encoder.</p>
      </section>
    </main>
  );
}
