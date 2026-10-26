# WhatsApp inbox refresh and reply visibility

This step fixes stale conversation responses, shared composer drafts, lost loaded history and scroll resets in the dashboard inbox. Each conversation retains its own in-memory draft. Responses from superseded list/detail requests cannot replace the selected thread. Manual refresh updates both the list and active thread; polling retains older loaded messages and applies delivery-state updates by stable archive identifiers.

The timeline has a bounded scroll area. It follows new messages when the reader is near the bottom, and preserves the reader's position when viewing history. Loading earlier messages handles errors and avoids duplicate bubbles. Message states use localized labels.

Failed, skipped and unaccepted outbound attempts no longer satisfy an incoming conversation's pending-reply state. Accepted outbound records resolve that state without an unconditional handled marker that could hide an inbound message arriving during the send. Explicit manual handling remains available. An accepted reply whose status could not be archived reports `ACCEPTED_UNRECORDED` rather than claiming a fully recorded send.

Validation covers actual conversation aggregation and timeline building with mocked database boundaries, plus the actual inbox component in browser fixtures: delayed responses, draft isolation, history/scroll retention, status refresh and rejected sends in Arabic, English and Turkish on desktop/mobile. No real donor messages are sent.

This does not claim live WhatsApp Business app coexistence/echo ingestion, media retrieval, historical archive repair or complete parity with the consumer app. Provider configuration and real webhook evidence remain separate checks. Payment code and routing rules are unchanged.
