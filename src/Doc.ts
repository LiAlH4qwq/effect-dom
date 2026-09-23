import { Effect } from "effect"
import { CrossOriginError } from "./Errors"
import { waitEvent } from "./Wait"

export const getInnerDoc = (
    iframe: HTMLIFrameElement,
): Effect.Effect<Document, CrossOriginError> =>
    Effect.sync(() => iframe.contentDocument).pipe(
        Effect.filterOrFail(
            maybeDoc => maybeDoc !== null,
            _ =>
                new CrossOriginError({
                    iframe,
                }),
        ),
    )

/**
 * Like {@link getInnerDoc} but waits for the iframe to finish loading first.
 * Resolves immediately when its document is already available; otherwise waits
 * for the `load` event before reading the document.
 */
export const waitInnerDoc = (
    iframe: HTMLIFrameElement,
): Effect.Effect<Document, CrossOriginError> =>
    Effect.suspend(() => {
        const doc = iframe.contentDocument
        if (doc !== null && doc.readyState !== "loading") {
            return getInnerDoc(iframe)
        }
        return waitEvent(iframe, "load").pipe(
            Effect.zipRight(getInnerDoc(iframe)),
        )
    })
