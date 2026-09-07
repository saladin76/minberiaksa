export type OperationsPersistenceMode = "foundation" | "prisma";

export type OperationsPersistenceInfo = {
  mode: OperationsPersistenceMode;
  storage: "module-data" | "computed-engine" | "prisma";
  readOnly: boolean;
  model: string;
  nextModel: string;
  readyForDb: boolean;
  externalSideEffects: false;
  note: string;
};

export type OperationsRepositoryResult<T> = {
  items: T[];
  persistence: OperationsPersistenceInfo;
};
