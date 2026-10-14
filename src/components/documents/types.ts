export type DocumentItem = {
  id: string;
  name: string;
  sizeBytes: number;
  pageCount: number | null;
  version: number;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  hasDraft: boolean;
  draftUpdatedAt: string | null;
};
