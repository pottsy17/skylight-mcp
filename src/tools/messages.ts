import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { getMessages } from "../api/endpoints/messages.js";
import { formatErrorForMcp } from "../utils/errors.js";

export function registerMessageTools(server: McpServer): void {
  // get_messages tool
  server.tool(
    "get_messages",
    `Get messages sent to the Skylight frame (the photo/message feed).

Use this to answer:
- "What messages/photos has the frame received?"
- "Did grandma's photo arrive on the Skylight?"

Read-only: the API's send path has not been captured yet, so this MCP can
list messages but not send them.`,
    {},
    async () => {
      try {
        const response = await getMessages();
        const messages = response.data ?? [];

        if (messages.length === 0) {
          const gated = response.meta?.plus_gated_content?.messages;
          return {
            content: [
              {
                type: "text" as const,
                text: gated
                  ? "No messages visible — this frame's message content is Plus-gated."
                  : "No messages found on this frame.",
              },
            ],
          };
        }

        const lines = messages.map((m) => {
          const a = m.attributes ?? {};
          const parts = [`- Message ${m.id}`];
          if (a.asset_type) parts.push(`  Type: ${a.asset_type}`);
          if (a.status) parts.push(`  Status: ${a.status}`);
          if (a.created_at) parts.push(`  Sent: ${a.created_at}`);
          if (a.sender_id !== undefined) parts.push(`  Sender ID: ${a.sender_id}`);
          if (a.asset_url) parts.push(`  Asset: ${a.asset_url}`);
          return parts.join("\n");
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Messages on the frame (${messages.length}):\n\n${lines.join("\n\n")}`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [{ type: "text" as const, text: formatErrorForMcp(error) }],
          isError: true,
        };
      }
    }
  );
}
