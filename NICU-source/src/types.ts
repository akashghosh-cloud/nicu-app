export type UserRole = 'CCRN' | 'RN' | 'Admin' | 'Doctor';

export interface Profile {
  id: string;
  email: string;
  name: string;
  emp_id: string;
  roles: UserRole[]; // Users can have multiple roles as per the image
}

export type LeaveType = 'AL' | 'LR' | 'SL';

export interface Leave {
  id: string;
  user_id: string;
  user_name: string;
  date: string; // ISO string
  type: LeaveType;
  locked_for_role: 'CCRN' | 'RN'; // A CC RN locking a date doesn't lock for RN
  created_at: string;
}

export interface AppSettings {
  id: string;
  key: string; // 'al_edit_enabled', 'lr_edit_enabled'
  value: boolean;
}

export interface Holiday {
  date: string;
  name: string;
  type: 'OH' | 'PH';
}

export interface Notification {
  id: string;
  user_id: string; // The recipient
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'danger';
  is_read: boolean;
  created_at: string;
  link?: string; // Optional link to take user to
}

export const STAFF_AL_ENTITLEMENTS: Record<string, number> = {
  'Easter Dimsian': 40.5,
  'Ashwini Nayak': 20,
  'Shivani Mishra': 20,
  'Parvathi': 9.5,
  'Parvathi MN': 9.5,
  'Amblikal Meghana': 20.5,
  'Sarumathi Y': 44.5,
  'Jyothi M': 30.5,
  'Jyothi': 30.5,
  'Ragini': 34.5,
  'Ragini Nirala': 34.5,
  'Smita Pradhan': 10.5,
  'Vidya': 9,
  'Vidyashree MR': 9,
  'Hebsiba devi': 11,
  'S Devi Hepsiba': 11,
  'Harshita R': 16,
  'Harshitha R': 16,
  'Tejaswini': 29,
  'Thejashwini Y': 29,
  'Sagnik Dhara': 9.5,
  'Akash Ghosh': 9.5,
  'Arati Kumari': 9.5,
  'Sheuli': 4.5,
  'Alivelu': 13.5,
  'Pavithra NR': 28,
};

export const STAFF_AL_TAKEN: Record<string, number> = {
  'Easter Dimsian': 14,
  'Ashwini Nayak': 0,
  'Shivani Mishra': 9,
  'Parvathi': 1,
  'Parvathi MN': 1,
  'Amblikal Meghana': 6,
  'Sarumathi Y': 15,
  'Jyothi M': 19,
  'Jyothi': 19,
  'Ragini': 7,
  'Ragini Nirala': 7,
  'Smita Pradhan': 6,
  'Vidya': 0,
  'Vidyashree MR': 0,
  'Hebsiba devi': 1,
  'S Devi Hepsiba': 1,
  'Harshita R': 0,
  'Harshitha R': 0,
  'Tejaswini': 0,
  'Thejashwini Y': 0,
  'Sagnik Dhara': 0,
  'Akash Ghosh': 5,
  'Arati Kumari': 0,
  'Sheuli': 0,
  'Alivelu': 0,
  'Pavithra NR': 0,
};

export const STAFF_SL_ELIGIBLE: Record<string, number> = {
  'Easter Dimsian': 8,
  'Ashwini Nayak': 12,
  'Shivani Mishra': 12,
  'Parvathi': 12,
  'Parvathi MN': 12,
  'Amblikal Meghana': 12,
  'Sarumathi Y': 12,
  'Jyothi M': 12,
  'Jyothi': 12,
  'Ragini': 12,
  'Ragini Nirala': 12,
  'Smita Pradhan': 12,
  'Vidya': 10,
  'Vidyashree MR': 10,
  'Hebsiba devi': 10,
  'S Devi Hepsiba': 10,
  'Harshita R': 12,
  'Harshitha R': 12,
  'Tejaswini': 10,
  'Thejashwini Y': 10,
  'Sagnik Dhara': 12,
  'Akash Ghosh': 12,
  'Arati Kumari': 10,
};

export const STAFF_SL_TAKEN: Record<string, number> = {
  'Easter Dimsian': 4,
  'Ashwini Nayak': 0,
  'Shivani Mishra': 0,
  'Parvathi': 0,
  'Parvathi MN': 0,
  'Amblikal Meghana': 0,
  'Sarumathi Y': 0,
  'Jyothi M': 0,
  'Jyothi': 0,
  'Ragini': 0,
  'Ragini Nirala': 0,
  'Smita Pradhan': 0,
  'Vidya': 2,
  'Vidyashree MR': 2,
  'Hebsiba devi': 2,
  'S Devi Hepsiba': 2,
  'Harshita R': 0,
  'Harshitha R': 0,
  'Tejaswini': 2,
  'Thejashwini Y': 2,
  'Sagnik Dhara': 0,
  'Akash Ghosh': 0,
  'Arati Kumari': 2,
};

export const STAFF_SL_TAKEN_DATES: Record<string, string[]> = {
  'Easter Dimsian': ['2026-05-04', '2026-05-05', '2026-05-07', '2026-05-08'],
  'Vidya': ['2026-04-16', '2026-04-17'],
  'Vidyashree MR': ['2026-04-16', '2026-04-17'],
  'Hebsiba devi': ['2026-04-05', '2026-04-27'],
  'S Devi Hepsiba': ['2026-04-05', '2026-04-27'],
  'Tejaswini': ['2026-01-21', '2026-01-22'],
  'Thejashwini Y': ['2026-01-21', '2026-01-22'],
  'Arati Kumari': ['2026-03-29', '2026-03-31'],
};

export function getStaffEntitlement(name: string, year: number = new Date().getFullYear(), upToDate: Date = new Date()): number {
  if (name === 'Akhila Akula') return 0;
  
  // Starting base for 2026 (or earlier)
  if (year <= 2026) {
    const base = STAFF_AL_ENTITLEMENTS[name] ?? 19;
    
    // Future accruals in 2026: July 1 (+4.5) and October 1 (+4.5)
    let accrued = 0;
    const julyMilestone = new Date(2026, 6, 1); // July 1st (month index 6)
    const octMilestone = new Date(2026, 9, 1);  // October 1st (month index 9)
    
    // We only add the accrual if our upToDate date is on or after that milestone
    if (upToDate >= julyMilestone) {
      accrued += 4.5;
    }
    if (upToDate >= octMilestone) {
      accrued += 4.5;
    }
    
    return base + accrued;
  } else {
    // For years after 2026, standard company max AL is 19.
    // Starting base of 10.0, and quarterly accrual of 4.5 in July and October (reaching 19)
    const base = 10;
    let accrued = 0;
    const julyMilestone = new Date(year, 6, 1);
    const octMilestone = new Date(year, 9, 1);
    
    if (upToDate >= julyMilestone) {
      accrued += 4.5;
    }
    if (upToDate >= octMilestone) {
      accrued += 4.5;
    }
    
    return base + accrued;
  }
}

