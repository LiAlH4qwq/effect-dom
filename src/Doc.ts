import { Effect } from "effect"
import { CrossOriginError } from "./Errors"

export const getInnerDoc = (
    iframe: HTMLIFrameElement,
): Effect.Effect<Document, CrossOriginError> => {
    const maybeDoc = iframe.contentDocument
    if (maybeDoc === null)
        return Effect.fail(
            new CrossOriginError({
                iframe,
            }),
        )
    return Effect.succeed(maybeDoc)
}
