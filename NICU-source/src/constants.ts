import { Holiday, UserRole } from './types';

export const HOLIDAYS_2026: Holiday[] = [
  { date: '2026-01-01', name: 'New Year Day', type: 'OH' },
  { date: '2026-01-14', name: 'Makara Sankranti/Pongal', type: 'OH' },
  { date: '2026-01-26', name: 'Republic Day', type: 'PH' },
  { date: '2026-02-15', name: 'Maha Shivaratri', type: 'OH' },
  { date: '2026-03-04', name: 'Holi', type: 'OH' },
  { date: '2026-03-19', name: 'Ugadi', type: 'OH' },
  { date: '2026-03-20', name: 'Ramzan', type: 'OH' },
  { date: '2026-04-03', name: 'Good Friday', type: 'OH' },
  { date: '2026-05-01', name: 'May Day', type: 'PH' },
  { date: '2026-05-27', name: 'Bakrid', type: 'OH' },
  { date: '2026-08-15', name: 'Independence Day', type: 'PH' },
  { date: '2026-08-26', name: 'Onam / Milad-i-Sherif', type: 'OH' },
  { date: '2026-08-28', name: 'Rakshabandhan', type: 'OH' },
  { date: '2026-09-14', name: 'Ganesh Chaturthi', type: 'OH' },
  { date: '2026-10-02', name: 'Gandhi Jayanti', type: 'PH' },
  { date: '2026-10-20', name: 'Mahanavami', type: 'OH' },
  { date: '2026-10-21', name: 'Vijayadashami', type: 'OH' },
  { date: '2026-11-01', name: 'Kannada Rajyotsava', type: 'PH' },
  { date: '2026-11-09', name: 'Deepawali', type: 'OH' },
  { date: '2026-12-25', name: 'Christmas Day', type: 'OH' },
];

export const ROTA_TIMELINES = [
  { label: 'Dec 23 - Jan 22', start: '2025-12-23', end: '2026-01-22' },
  { label: 'Jan 23 - Feb 22', start: '2026-01-23', end: '2026-02-22' },
  { label: 'Feb 23 - Mar 22', start: '2026-02-23', end: '2026-03-22' },
  { label: 'Mar 23 - Apr 22', start: '2026-03-23', end: '2026-04-22' },
  { label: 'Apr 23 - May 22', start: '2026-04-23', end: '2026-05-22' },
  { label: 'May 23 - Jun 22', start: '2026-05-23', end: '2026-06-22' },
  { label: 'Jun 23 - Jul 22', start: '2026-06-23', end: '2026-07-22' },
  { label: 'Jul 23 - Aug 22', start: '2026-07-23', end: '2026-08-22' },
  { label: 'Aug 23 - Sep 22', start: '2026-08-23', end: '2026-09-22' },
  { label: 'Sep 23 - Oct 22', start: '2026-09-23', end: '2026-10-22' },
  { label: 'Oct 23 - Nov 22', start: '2026-10-23', end: '2026-11-22' },
  { label: 'Nov 23 - Dec 22', start: '2026-11-23', end: '2026-12-22' },
];

export const getDefaultTimelineIdx = (): number => {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  const todayStr = `${y}-${m}-${d}`;
  
  const currentIdx = ROTA_TIMELINES.findIndex(t => t.start <= todayStr && todayStr <= t.end);
  
  if (currentIdx !== -1) {
    if (currentIdx + 1 < ROTA_TIMELINES.length) {
      return currentIdx + 1;
    }
    return currentIdx;
  }
  
  // If today is before the first timeline, return the first one
  if (ROTA_TIMELINES.length > 0 && todayStr < ROTA_TIMELINES[0].start) {
    return 0;
  }
  
  return 5; // Fallback to index 5
};

