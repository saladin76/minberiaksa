import { calculateSeasonsReadiness } from './season-engine';
import { seasonDefinitions } from './season-rules';

export function getSeasonReadinessOverview() {
  const seasons = calculateSeasonsReadiness(seasonDefinitions);

  return {
    source: 'season-engine-foundation',
    generatedAt: new Date().toISOString(),
    seasons,
    summary: {
      totalSeasons: seasons.length,
      late: seasons.filter((season) => season.status === 'LATE').length,
      needsAttention: seasons.filter((season) => season.status === 'NEEDS_ATTENTION').length,
      onTrack: seasons.filter((season) => season.status === 'ON_TRACK').length,
    },
  };
}
