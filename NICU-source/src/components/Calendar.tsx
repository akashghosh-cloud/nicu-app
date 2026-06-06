import React, { useMemo } from 'react';
import { 
  format, 
  eachDayOfInterval, 
  isToday, 
  startOfWeek, 
  endOfWeek, 
  isBefore,
  isAfter,
  startOfDay,
  parseISO
} from 'date-fns';
import { cn } from '../lib/utils';
import { Holiday, Leave } from '../types';

interface CalendarProps {
  startDate: Date;
  endDate: Date;
  holidays: Holiday[];
  leaves: Leave[];
  stagedDates?: string[];
  onDateClick: (date: Date) => void;
  selectedRole: 'CCRN' | 'RN';
  currentUserId: string;
}

const Calendar = React.memo(({ 
  startDate, 
  endDate, 
  holidays, 
  leaves, 
  stagedDates = [],
  onDateClick,
  selectedRole,
  currentUserId
}: CalendarProps) => {
  const days = useMemo(() => {
    // startOfWeek ensures we align to Sunday column
    const start = startOfWeek(startDate);
    const end = endOfWeek(endDate);
    return eachDayOfInterval({ start, end });
  }, [startDate, endDate]);

  const getHoliday = (date: Date) => {
    const dStr = format(date, 'yyyy-MM-dd');
    return holidays.find(h => h.date === dStr);
  };

  const getLeaveForRoleOnDate = (date: Date, role: string) => {
    const dStr = format(date, 'yyyy-MM-dd');
    return leaves.find(l => {
      const lDateStr = l.date.includes('T') ? format(parseISO(l.date), 'yyyy-MM-dd') : l.date;
      return lDateStr === dStr && l.locked_for_role === role;
    });
  };

  const normalizedStart = startOfDay(startDate);
  const normalizedEnd = startOfDay(endDate);

  return (
    <div className="grid grid-cols-7 gap-0.5 sm:gap-px rounded-xl md:rounded-2xl overflow-hidden border border-white/5 bg-white/5">
      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
        <div key={d} className="bg-black/40 p-1.5 md:p-3 text-[9px] md:text-[10px] font-bold text-center text-white/40 uppercase tracking-[0.1em] md:tracking-[0.2em]">
          <span className="md:hidden tracking-normal">{d[0]}</span>
          <span className="hidden md:inline">{d}</span>
        </div>
      ))}
      
      {days.map((day) => {
        const dStr = format(day, 'yyyy-MM-dd');
        const holiday = getHoliday(day);
        const leave = getLeaveForRoleOnDate(day, selectedRole);
        const isStaged = stagedDates.includes(dStr);
        const isOwnLeave = leave?.user_id === currentUserId;
        const normalizedDay = startOfDay(day);
        
        const isOutsideRange = isBefore(normalizedDay, normalizedStart) || isAfter(normalizedDay, normalizedEnd);
        const today = isToday(day);

        if (isOutsideRange) {
          return (
            <div 
              key={dStr}
              className="relative aspect-square sm:aspect-[4/3] md:aspect-video p-1 md:p-3 bg-black/20 border border-white/[0.02] opacity-30"
            />
          );
        }

        return (
          <div
            key={dStr}
            onClick={() => onDateClick(day)}
            className={cn(
              "relative aspect-square sm:aspect-[4/3] md:aspect-video p-1 sm:p-2 md:p-3 flex flex-col justify-between cursor-pointer transition-all duration-200 border border-white/[0.03] overflow-hidden group select-none",
              holiday?.type === 'PH' ? "bg-indigo-950/30" : holiday?.type === 'OH' ? "bg-blue-950/30" : "bg-white/[0.02]",
              isStaged 
                ? "bg-orange-500/20 border-orange-500/50 ring-2 ring-orange-500/40 z-10 scale-[1.02] shadow-lg shadow-orange-500/10" 
                : leave 
                  ? isOwnLeave 
                    ? "bg-blue-600/15 border-blue-500/40 ring-1 ring-blue-500/20 shadow-[inset_0_0_15px_rgba(37,99,235,0.1)]" 
                    : "bg-red-500/[0.08] border-red-500/20" 
                  : "hover:bg-white/10 active:scale-95",
              today && "ring-2 ring-blue-400/50 bg-blue-500/[0.05]"
            )}
          >
            {isStaged && (
              <div className="absolute inset-0 bg-gradient-to-br from-orange-500/10 to-transparent pointer-events-none animate-pulse" />
            )}
            
            <div className="flex justify-between items-start relative z-10">
              <span className={cn(
                "font-mono tabular-nums leading-none flex flex-col md:flex-row md:items-baseline",
                today ? "text-blue-400 font-bold" : isStaged ? "text-orange-400 font-bold" : "text-white/60"
              )}>
                <span className="text-[10px] sm:text-xs">{format(day, 'd')}</span>
                <span className="text-[5px] md:text-[8px] md:ml-1 opacity-50 font-sans font-black uppercase tracking-tighter line-clamp-1">{format(day, 'MMM')}</span>
              </span>
              
              {holiday && (
                <div className={cn(
                  "px-0.5 md:px-1 rounded-[2px] md:rounded-[4px] text-[4px] sm:text-[5px] md:text-[7px] font-black uppercase tracking-tighter",
                  holiday.type === 'PH' ? "bg-indigo-500 text-white" : "bg-blue-400 text-[#0a0a0c]"
                )}>
                  {holiday.type}
                </div>
              )}
            </div>

            <div className="mt-auto space-y-0.5 md:space-y-1 relative z-10">
              {isStaged && (
                <div className="p-0.5 px-1 sm:px-2 md:px-2 rounded-full bg-orange-500 text-white text-[4px] sm:text-[7px] md:text-[7px] font-black uppercase tracking-tighter w-full text-center shadow-lg shadow-orange-500/30">
                  <span className="hidden sm:inline">STAGED</span>
                  <span className="sm:hidden tracking-tighter scale-90 block">STAGED</span>
                </div>
              )}
              {leave && !isStaged && (
                <div 
                  className={cn(
                    "p-0.5 md:p-1 px-0.5 sm:px-2 md:px-2 rounded-[2px] sm:rounded-md md:rounded-lg font-bold flex items-center justify-between transition-all",
                    isOwnLeave ? "bg-blue-600 text-white shadow-lg" : "bg-red-500/30 border border-red-500/40 text-red-100"
                  )}
                >
                  <div className="flex flex-col gap-0 overflow-hidden w-full items-start text-left">
                    <span className="truncate font-black text-[3.5px] sm:text-[6px] md:text-[8px] uppercase tracking-tighter w-full block leading-none">
                      {leave.user_name}
                    </span>
                  </div>
                </div>
              )}
              
              {holiday && !leave && !isStaged && (
                <div className="text-[5px] md:text-[8px] text-white/30 font-bold uppercase truncate text-center md:text-left group-hover:text-white/50 tracking-tighter md:tracking-normal">
                  <span className="hidden sm:inline">{holiday.name}</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
});

Calendar.displayName = 'Calendar';

export default Calendar;
