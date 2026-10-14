export type ShareItem = {
  id: string;
  url: string;
  mime: string;
  originalName: string | null;
  sizeBytes: number;
  ttlLabel: string;
  createdAt: string;
  expiresAt: string;
  deletedAt: string | null;
  views: number;
  thumbUrl: string | null;
};
