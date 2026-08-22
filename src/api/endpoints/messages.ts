import { getClient } from "../client.js";

/**
 * A message card sent to the frame (photo or text asset).
 * Shape from the captured OpenAPI spec; fields are optional because the
 * spec's example payloads were sparse.
 */
export interface MessageResource {
  id: string;
  type?: string;
  attributes: {
    asset_type?: string;
    asset_url?: string;
    thumbnail_url?: string;
    created_at?: string;
    updated_at?: string;
    sender_id?: number;
    status?: string;
    [key: string]: unknown;
  };
}

export interface MessagesResponse {
  data: MessageResource[];
  meta?: {
    has_next?: boolean;
    next_sync_token?: string;
    plus_gated_content?: { captions?: boolean; messages?: boolean };
  };
}

/**
 * Get messages sent to the frame (the photo/message feed).
 */
export async function getMessages(): Promise<MessagesResponse> {
  const client = getClient();
  return client.get<MessagesResponse>("/api/frames/{frameId}/messages");
}
