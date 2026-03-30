import { Effect } from "effect"
import { CrossOriginError } from "./Errors"

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
