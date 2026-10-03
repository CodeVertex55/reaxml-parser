import type { Collector } from "../diagnostics.js";
import type { MediaItem } from "../types.js";
import { attr, children, type XmlNode } from "../xml.js";
import { parseDate, type DateOptions } from "./dates.js";

type MediaKind = "images" | "floorplans" | "documents";

const KINDS: ReadonlyMap<string, MediaKind> = new Map<string, MediaKind>([
  ["img", "images"],
  ["floorplan", "floorplans"],
  ["document", "documents"],
]);

/** Only web addresses are kept, so a script, file or data URL can never reach a consumer. */
const WEB_URL = /^https?:\/\/\S/i;

/** Whether a value is an http or https address. Anything else, such as a script URL, is not. */
export function isWebUrl(value: string): boolean {
  return WEB_URL.test(value);
}

/**
 * Reads media from the `objects` children of a listing element and then its legacy `images`
 * children. `img` goes to images, `floorplan` to floorplans and `document` to documents, in
 * document order with no sorting. An element is kept only when its `url` is an http or https
 * address. With no `url` and no `file` it is an empty placeholder and adds
 * `empty-media-placeholder`; with a `file` only, or with any other kind of url, it adds
 * `media-without-url`. The url itself is never echoed into a diagnostic. `id` is kept verbatim,
 * and an invalid `modTime` adds `invalid-date` while the item is still kept.
 */
export function parseMedia(
  listing: XmlNode,
  c: Collector,
  o: DateOptions,
): { images: MediaItem[]; floorplans: MediaItem[]; documents: MediaItem[] } {
  const out: Record<MediaKind, MediaItem[]> = { images: [], floorplans: [], documents: [] };
  const sources = [...children(listing, "objects"), ...children(listing, "images")];

  for (const source of sources) {
    for (const node of source.children) {
      const kind = KINDS.get(node.name);
      if (kind === undefined) continue;

      const url = attr(node, "url");
      if (url === null) {
        c.add(
          attr(node, "file") === null ? "empty-media-placeholder" : "media-without-url",
          node.path,
        );
        continue;
      }
      if (!isWebUrl(url)) {
        c.add("media-without-url", node.path);
        continue;
      }

      out[kind].push({
        id: Object.hasOwn(node.attrs, "id") ? (node.attrs["id"] ?? "") : "",
        url,
        format: attr(node, "format"),
        modifiedAt: parseDate(attr(node, "modTime"), node.path, c, o),
      });
    }
  }
  return out;
}
