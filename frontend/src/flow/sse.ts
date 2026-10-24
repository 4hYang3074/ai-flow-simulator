/**
 * Server-Sent Events framing over arbitrary text chunks.
 *
 * Adapted from the author's own SSE parser in an earlier production chat client.
 *
 * A network chunk can end anywhere -- mid-line, mid-`data:`, between `\r` and
 * `\n` -- so the unfinished tail is carried to the next push instead of being
 * parsed (and dropped) on its own.
 */
export function createSseParser(onData: (data: string) => void) {
  let buffer = "";
  let dataLines: string[] = [];

  const dispatch = () => {
    if (dataLines.length) onData(dataLines.join("\n"));
    dataLines = [];
  };

  const consumeLine = (line: string) => {
    if (line === "") {
      dispatch();
      return;
    }
    if (line.startsWith(":")) return;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "data") dataLines.push(value);
  };

  return {
    push(chunk: string) {
      buffer += chunk;
      let newline = buffer.search(/\r\n|\r|\n/);
      while (newline !== -1) {
        // A lone `\r` at the very end may be the first half of `\r\n`.
        if (buffer[newline] === "\r" && newline === buffer.length - 1) break;
        const width = buffer.startsWith("\r\n", newline) ? 2 : 1;
        consumeLine(buffer.slice(0, newline));
        buffer = buffer.slice(newline + width);
        newline = buffer.search(/\r\n|\r|\n/);
      }
    },
    /** The stream closed: a final event without its blank line still counts. */
    end() {
      if (buffer) consumeLine(buffer.replace(/\r$/, ""));
      buffer = "";
      dispatch();
    },
  };
}
