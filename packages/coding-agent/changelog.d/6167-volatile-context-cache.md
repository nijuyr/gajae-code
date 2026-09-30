### Fixed

- Fixed prompt cache being invalidated each turn due to volatile project context being removed and re-injected at different positions in the message list. The volatile context and MCP server instructions are now kept at stable positions in the conversation history, allowing the prompt cache to survive across consecutive turns (#6167).
