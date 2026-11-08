function esc(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function simplePdf(pages: { title: string; lines: string[] }[]): Blob {
  const objects: string[] = [];
  const kids: number[] = [];
  const fontId = 3;
  let nextId = 4;

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[fontId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  for (const page of pages) {
    const contentId = nextId++;
    const pageId = nextId++;
    const streamLines = [
      "BT",
      "/F1 18 Tf",
      "48 760 Td",
      `(${esc(page.title)}) Tj`,
      "/F1 11 Tf",
      "0 -28 Td",
    ];
    for (const line of page.lines) {
      streamLines.push(`(${esc(line.slice(0, 110))}) Tj`, "0 -16 Td");
    }
    streamLines.push("ET");
    const stream = streamLines.join("\n");
    objects[contentId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`;
    kids.push(pageId);
  }

  objects[2] = `<< /Type /Pages /Kids [${kids.map((id) => `${id} 0 R`).join(" ")}] /Count ${kids.length} >>`;

  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 1; i < nextId; i++) {
    offsets[i] = body.length;
    body += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = body.length;
  let xrefTable = `xref\n0 ${nextId}\n0000000000 65535 f \n`;
  for (let i = 1; i < nextId; i++) {
    xrefTable += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  body += xrefTable;
  body += `trailer\n<< /Size ${nextId} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new Blob([body], { type: "application/pdf" });
}
