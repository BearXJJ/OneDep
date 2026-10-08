export interface MessageItem {
  id: number;
  content: string;
  createdAt: string;
}

export interface MessageListResponse {
  messages: MessageItem[];
  source: 'postgres' | 'redis';
}
