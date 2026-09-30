### Fixed

- **Kiro OAuth CodeWhisperer wire protocol**: Corrected critical wire protocol issues in the streaming transport:
  - Fixed typo in request header `amzn-X-amz-target` → `x-amz-target`
  - Changed streaming service target from `AmazonCodeWhispererService.GenerateAssistantResponse` to `AmazonCodeWhispererStreamingService.GenerateAssistantResponse`
  - Fixed content-type from `application/json` to `application/x-amz-json-1.0`
  - Moved `profileArn` from header to request body `conversationState`
  - Flattened `userInputMessageContext.tools` from nested `{tools: [...]}` to direct array
  - Fixed event payload handling for flat `{content}` structure (not nested `{assistantResponseEvent: {content}}`)
  - Implemented accumulation of streaming tool input fragments per `toolUseId` until `stop` signal
  - Cross-verified against kiro-api-key.ts headers implementation
  - Reported by: nomo via wire protocol validation failures
