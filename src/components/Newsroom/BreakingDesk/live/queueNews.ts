// A queue row in the desk's story shape. Pure (type imports and cardWords only), so queueNews.test.ts runs it under
// plain node; LiveDesk.queueToNews passes its own file-link rewrite.

import type { QueueItem } from "../../../../lib/socia/types";
import type { FtpNewsItem } from "../../../../types/newsroom";
import { queueCardBody } from "../cardWords";

/** A queue or feed story on the live desk: the demo shape plus the draft it came from. */
export interface LiveNewsItem extends FtpNewsItem {
  live: QueueItem;
}

/**
 * Slim inbox rows (fields=list) carry no bodyText, storyBody, postText or cardUrl: shortText and body are ""
 * then, and the card image link is "" (list thumbnails draw the card from the headline instead).
 */
export function queueRowToNews(item: QueueItem, fileLink: (url: string | null | undefined) => string): LiveNewsItem {
  return {
    id: item.id,
    headline: item.headline,
    // Cards drawn from this row (list thumbnails) read the story, like the editor's card; the post text is shortText
    body: queueCardBody(item),
    shortText: item.bodyText ?? "",
    // Breaking stories on the live desk carry no Big Breaking tag yet; every story shows as Breaking
    tag: "breaking",
    area: item.district ?? "",
    people: [],
    ftpPath: item.slug,
    // The queue lists the drawn card, not the photos; the editor loads the photos from the draft
    media: [{ kind: "image", url: fileLink(item.cardUrl), fileName: "card.png" }],
    receivedAt: item.receivedAt,
    live: item,
  };
}
