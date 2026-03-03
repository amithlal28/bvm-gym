export type ActivityType = 'Gym' | 'Badminton';
export type UserStatus = 'Active' | 'Deleted';
export type BillingStatus = 'Paid' | 'Pending';

/** A user can belong to Gym, Badminton, or BOTH */
export interface User {
    id?: string;
    fullName: string;
    address: string;
    phoneNumber: string;

    // ── Memberships (can have one or both) ──
    isGymMember: boolean;
    gymFee: number; // monthly fee in ₹

    isBadmintonMember: boolean;
    badmintonSessionId?: string; // required if isBadmintonMember
    badmintonFee: number;        // monthly fee in ₹

    // ── Student info ──
    isStudent: boolean;
    studentCourse?: string;
    studentYear?: string;

    // ── Payment ──
    paymentRequired: boolean; // false = exempt (priests, faculty)
    exemptCategory?: 'Priest' | 'Faculty' | 'Student' | 'Other'; // Defines the type if paymentRequired is false

    // ── System ──
    createdAt: any;
    status: UserStatus;
}

export interface Session {
    id?: string;
    name: string;
    activityType: ActivityType;
    timings: string;
}

export interface Attendance {
    id?: string;
    userId: string;
    sessionId: string;  // which session/batch this attendance is for
    date: string;       // YYYY-MM-DD
    isPresent: boolean;
}

/** One billing record per (userId, activityType, monthYear) */
export interface Billing {
    id?: string;
    userId: string;
    activityType: ActivityType; // 'Gym' or 'Badminton'
    monthYear: string;          // MM-YYYY
    amount: number;
    status: BillingStatus;
    paidOn: any | null;
}

/** Suspended batch/session for a specific day */
export interface Suspension {
    id?: string;
    sessionId: string;
    date: string;   // YYYY-MM-DD
    reason?: string;
}
