export type ProjectMetric = {
  projectId: string;
  raised: number;
  goal: number;
  donors: number;
  unitAmount: number;
  verificationStatus: "requires-verification";
};

export const projectMetrics: ProjectMetric[] = [
  { projectId: "gaza-hot-meals", raised: 239090.51, goal: 1000000, donors: 4097, unitAmount: 10, verificationStatus: "requires-verification" },
  { projectId: "gaza-food-parcels", raised: 7579.36, goal: 30000, donors: 149, unitAmount: 70, verificationStatus: "requires-verification" },
  { projectId: "al-quds-home-restoration", raised: 2604.42, goal: 60000, donors: 80, unitAmount: 400, verificationStatus: "requires-verification" },
];
