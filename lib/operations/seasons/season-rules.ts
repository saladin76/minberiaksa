import type { OperationsSeasonDefinition } from './season-types';

export const seasonDefinitions: OperationsSeasonDefinition[] = [
  {
    id: 'ramadan',
    title: 'رمضان',
    focus: 'زكاة، إفطار، صدقة يومية',
    priority: 'HIGH',
    leadTimeDays: 45,
    startsInDays: 43,
    assetTargets: [
      { label: 'فيديوهات', required: 10, ready: 4 },
      { label: 'تصاميم', required: 12, ready: 5 },
      { label: 'كاروسيل', required: 6, ready: 2 },
      { label: 'رسائل واتساب', required: 4, ready: 1 },
    ],
  },
  {
    id: 'dhul-hijjah',
    title: 'عشر ذي الحجة',
    focus: 'أضاحي، وقف، تذكير يومي',
    priority: 'HIGH',
    leadTimeDays: 35,
    startsInDays: 70,
    assetTargets: [
      { label: 'فيديوهات', required: 8, ready: 5 },
      { label: 'تصاميم', required: 10, ready: 7 },
      { label: 'كاروسيل', required: 5, ready: 3 },
    ],
  },
];
