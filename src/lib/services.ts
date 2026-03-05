import {
    collection, doc, addDoc, getDoc, getDocs,
    updateDoc, deleteDoc, query, where, setDoc, serverTimestamp, writeBatch
} from 'firebase/firestore';
import { db } from './firebase';
import { User, Session, Attendance, Billing, Suspension, ActivityType } from '../types';
import { format } from 'date-fns';
import { sendSuspensionNotification } from './notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const GYM_DEFAULT_SESSION_ID = 'gym-default-session';

const usersCol = collection(db, 'users');
const sessionsCol = collection(db, 'sessions');
const attCol = collection(db, 'attendance');
const billingCol = collection(db, 'billing');
const suspCol = collection(db, 'suspensions');

// ── Sessions ─────────────────────────────────────────────────────────────────
export const setGymSessionDefault = async () => {
    const ref = doc(db, 'sessions', GYM_DEFAULT_SESSION_ID);
    if (!(await getDoc(ref)).exists()) {
        await setDoc(ref, { name: 'General Gym Batch', activityType: 'Gym', timings: '5:00 AM – 10:00 PM' });
    }
};

export const createSession = async (s: Omit<Session, 'id'>) => {
    if (s.activityType === 'Gym') throw new Error('Cannot create a custom Gym session.');
    return (await addDoc(sessionsCol, s)).id;
};

export const getBadmintonSessions = async (): Promise<Session[]> => {
    const snap = await getDocs(query(sessionsCol, where('activityType', '==', 'Badminton')));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Session));
};

export const getAllSessions = async (): Promise<Session[]> => {
    const snap = await getDocs(sessionsCol);
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Session));
};

export const deleteSession = async (id: string) => {
    if (id === GYM_DEFAULT_SESSION_ID) throw new Error('Cannot delete default Gym session.');
    await deleteDoc(doc(db, 'sessions', id));
};

// ── Batch Suspension ─────────────────────────────────────────────────────────
export const suspendBatch = async (sessionId: string, date: string, reason?: string) => {
    const existing = await getDocs(query(suspCol, where('sessionId', '==', sessionId), where('date', '==', date)));
    if (!existing.empty) return; // Already suspended
    await addDoc(suspCol, { sessionId, date, reason: reason || '' });
};

export const unsuspendBatch = async (sessionId: string, date: string) => {
    const existing = await getDocs(query(suspCol, where('sessionId', '==', sessionId), where('date', '==', date)));
    await Promise.all(existing.docs.map(d => deleteDoc(d.ref)));
};

export const getSuspensionsForDate = async (date: string): Promise<Suspension[]> => {
    const snap = await getDocs(query(suspCol, where('date', '==', date)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Suspension));
};

export const getSuspensionsByMonth = async (monthStr: string): Promise<Suspension[]> => {
    // monthStr format: "2026-03"
    const start = `${monthStr}-01`;
    const end = `${monthStr}-31`;
    const snap = await getDocs(query(suspCol, where('date', '>=', start), where('date', '<=', end)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Suspension));
};

// ── Users ─────────────────────────────────────────────────────────────────────
export const createUser = async (u: Omit<User, 'id' | 'createdAt' | 'status'>) => {
    const payload: any = {
        ...u,
        badmintonSessionId: u.isBadmintonMember ? u.badmintonSessionId : null,
        paymentRequired: u.paymentRequired ?? true,
        createdAt: serverTimestamp(),
        status: 'Active',
    };

    // Firestore strictly rejects `undefined` values. Delete any undefined keys.
    Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);

    return (await addDoc(usersCol, payload)).id;
};

export const getActiveUsers = async (): Promise<User[]> => {
    const snap = await getDocs(query(usersCol, where('status', '==', 'Active')));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as User));
};

export const getUserById = async (id: string): Promise<User | null> => {
    const snap = await getDoc(doc(db, 'users', id));
    return snap.exists() ? { id: snap.id, ...snap.data() } as User : null;
};

export const updateUser = async (id: string, data: Partial<User>) => {
    const payload: any = { ...data };
    Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);
    await updateDoc(doc(db, 'users', id), payload);
};

export const deleteUser = async (id: string) => {
    await deleteDoc(doc(db, 'users', id));
};

// ── Member Suspension ─────────────────────────────────────────────────────────
export const suspendMember = async (userId: string, activityType: ActivityType) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const field = activityType === 'Gym' ? 'gymSuspendedAt' : 'badmintonSuspendedAt';
    await updateDoc(doc(db, 'users', userId), { [field]: today });
};

export const unsuspendMember = async (userId: string, activityType: ActivityType) => {
    const field = activityType === 'Gym' ? 'gymSuspendedAt' : 'badmintonSuspendedAt';
    await updateDoc(doc(db, 'users', userId), { [field]: null });
};

/**
 * Auto-suspend users who haven't been present for 30+ consecutive days.
 * Returns list of user IDs that were newly suspended.
 */
export const autoSuspendAbsentMembers = async (): Promise<{ userId: string; name: string; activity: ActivityType }[]> => {
    let threshold = 30;
    try {
        const stored = await AsyncStorage.getItem('@auto_suspend_days');
        if (stored) {
            const parsed = parseInt(stored, 10);
            if (!isNaN(parsed) && parsed > 0) {
                threshold = parsed;
            }
        }
    } catch (_) { }

    const users = await getActiveUsers();
    const today = new Date();
    const thresholdDateAgo = new Date(today);
    thresholdDateAgo.setDate(today.getDate() - threshold);
    const thresholdDateAgoStr = format(thresholdDateAgo, 'yyyy-MM-dd');
    const todayStr = format(today, 'yyyy-MM-dd');

    // Fetch all attendance in the last X days
    const attSnap = await getDocs(
        query(attCol, where('date', '>=', thresholdDateAgoStr), where('date', '<=', todayStr), where('isPresent', '==', true))
    );
    const presentUserSessionPairs = new Set(attSnap.docs.map(d => `${d.data().userId}_${d.data().sessionId}`));

    const newlySuspended: { userId: string; name: string; activity: ActivityType }[] = [];

    for (const user of users) {
        if (!user.id) continue;

        // Check Gym
        if (user.isGymMember && !user.gymSuspendedAt) {
            const key = `${user.id}_${GYM_DEFAULT_SESSION_ID}`;
            if (!presentUserSessionPairs.has(key)) {
                // Check if joined more than threshold days ago
                const joinedStr = user.dateJoined || '';
                if (joinedStr && joinedStr <= thresholdDateAgoStr) {
                    await suspendMember(user.id, 'Gym');
                    await sendSuspensionNotification(user.fullName, 'Gym');
                    newlySuspended.push({ userId: user.id, name: user.fullName, activity: 'Gym' });
                }
            }
        }

        // Check Badminton
        if (user.isBadmintonMember && user.badmintonSessionId && !user.badmintonSuspendedAt) {
            const key = `${user.id}_${user.badmintonSessionId}`;
            if (!presentUserSessionPairs.has(key)) {
                const joinedStr = user.dateJoined || '';
                if (joinedStr && joinedStr <= thresholdDateAgoStr) {
                    await suspendMember(user.id, 'Badminton');
                    await sendSuspensionNotification(user.fullName, 'Badminton');
                    newlySuspended.push({ userId: user.id, name: user.fullName, activity: 'Badminton' });
                }
            }
        }
    }

    return newlySuspended;
};

// ── Attendance ────────────────────────────────────────────────────────────────
export const getAttendanceByDate = async (date: string): Promise<Attendance[]> => {
    const snap = await getDocs(query(attCol, where('date', '==', date)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Attendance));
};

export const getAttendanceByDateSession = async (date: string, sessionId: string): Promise<Attendance[]> => {
    const snap = await getDocs(query(attCol, where('date', '==', date), where('sessionId', '==', sessionId)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Attendance));
};

export const getAttendanceByMonth = async (monthStr: string): Promise<Attendance[]> => {
    // monthStr format: "2026-03"
    const start = `${monthStr}-01`;
    const end = `${monthStr}-31`;
    const snap = await getDocs(query(attCol, where('date', '>=', start), where('date', '<=', end)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Attendance));
};

export const getAttendanceCountByMonth = async (monthStr: string): Promise<{ gym: Record<string, number>, badminton: Record<string, number> }> => {
    // monthStr format: "2026-03"
    const start = `${monthStr}-01`;
    const end = `${monthStr}-31`;
    const snap = await getDocs(query(attCol, where('date', '>=', start), where('date', '<=', end)));

    const counts = { gym: {} as Record<string, number>, badminton: {} as Record<string, number> };
    snap.docs.forEach(doc => {
        const d = doc.data() as Attendance;
        if (d.isPresent) {
            if (d.sessionId === GYM_DEFAULT_SESSION_ID) {
                counts.gym[d.userId] = (counts.gym[d.userId] || 0) + 1;
            } else {
                counts.badminton[d.userId] = (counts.badminton[d.userId] || 0) + 1;
            }
        }
    });
    return counts;
};

export const saveAttendanceBatch = async (date: string, sessionId: string, records: { userId: string; isPresent: boolean }[]) => {
    const existing = await getAttendanceByDateSession(date, sessionId);
    await Promise.all(records.map(async r => {
        const found = existing.find(e => e.userId === r.userId);
        const data = { userId: r.userId, date, sessionId, isPresent: r.isPresent };
        if (found?.id) await updateDoc(doc(db, 'attendance', found.id), { isPresent: r.isPresent });
        else await addDoc(attCol, data);
    }));
};

export const toggleAttendance = async (date: string, sessionId: string, userId: string, isPresent: boolean) => {
    const existing = await getDocs(query(attCol, where('date', '==', date), where('sessionId', '==', sessionId), where('userId', '==', userId)));
    if (!existing.empty) {
        await updateDoc(existing.docs[0].ref, { isPresent });
    } else {
        await addDoc(attCol, { date, sessionId, userId, isPresent });
    }
};

// ── Billing ───────────────────────────────────────────────────────────────────
export const getBillsByMonth = async (monthYear: string): Promise<Billing[]> => {
    const snap = await getDocs(query(billingCol, where('monthYear', '==', monthYear)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Billing));
};

export const getBillsByUser = async (userId: string): Promise<Billing[]> => {
    const snap = await getDocs(query(billingCol, where('userId', '==', userId)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as Billing)).sort((a, b) => b.monthYear.localeCompare(a.monthYear));
};

/** Toggle paid/pending for a user+activityType+month. Creates record if missing. */
export const toggleBillStatus = async (
    userId: string, activityType: ActivityType, monthYear: string, amount: number, newStatus: 'Paid' | 'Pending'
) => {
    const snap = await getDocs(query(billingCol, where('userId', '==', userId), where('activityType', '==', activityType), where('monthYear', '==', monthYear)));
    if (!snap.empty) {
        await updateDoc(snap.docs[0].ref, { status: newStatus, paidOn: newStatus === 'Paid' ? serverTimestamp() : null });
    } else {
        await addDoc(billingCol, { userId, activityType, monthYear, amount, status: newStatus, paidOn: newStatus === 'Paid' ? serverTimestamp() : null });
    }
};

// ── Seeder ────────────────────────────────────────────────────────────────────
export const seedDemoData = async (): Promise<string> => {
    await setGymSessionDefault();

    // ── 3 Badminton Batches ──────────────────────────────────────────────────
    const batchDefs = [
        { name: 'Morning Batch', timings: '5:30 AM – 8:00 AM' },
        { name: 'Evening Batch', timings: '5:00 PM – 7:30 PM' },
        { name: 'Night Batch', timings: '7:30 PM – 10:00 PM' },
    ];
    const existingBatches = await getBadmintonSessions();
    const idMap: Record<string, string> = {};
    for (const b of batchDefs) {
        idMap[b.name] = existingBatches.find(e => e.name === b.name)?.id
            ?? await createSession({ name: b.name, activityType: 'Badminton', timings: b.timings });
    }

    const M = idMap['Morning Batch'];
    const E = idMap['Evening Batch'];
    const N = idMap['Night Batch'];

    // ── Simulate join dates ──────────────────────────────────────────────────
    const ago = (months: number) => {
        const d = new Date(); d.setMonth(d.getMonth() - months);
        return format(d, 'yyyy-MM-dd');
    };

    // ── 20 Kerala Users covering ALL categories ──────────────────────────────
    type DemoUser = Omit<User, 'id' | 'createdAt' | 'status'> & {
        dateJoined: string;
        gymSuspendedAt?: string | null;
        badmintonSuspendedAt?: string | null;
    };

    const demos: DemoUser[] = [
        // ── GYM ONLY ─────────────────────────────────────────────────────────
        {
            fullName: 'Arun Prakash Menon', phoneNumber: '9400011101', address: 'Kaloor, Ernakulam',
            isGymMember: true, gymFee: 700, isBadmintonMember: false, badmintonFee: 0,
            isStudent: false, paymentRequired: true,
            dateJoined: ago(6),
        },
        {
            fullName: 'Vishnu Suresh Nair', phoneNumber: '9400011102', address: 'Palarivattom, Kochi',
            isGymMember: true, gymFee: 700, isBadmintonMember: false, badmintonFee: 0,
            isStudent: false, paymentRequired: true,
            dateJoined: ago(4),
        },
        {
            // Gym-only student
            fullName: 'Anjali Krishnan', phoneNumber: '9400011103', address: 'Edappally, Kochi',
            isGymMember: true, gymFee: 400, isBadmintonMember: false, badmintonFee: 0,
            isStudent: true, studentCourse: 'B.Tech Computer Science', studentYear: '3rd Year',
            paymentRequired: true,
            dateJoined: ago(3),
        },
        {
            // Gym-only, GYM SUSPENDED
            fullName: 'Rahul Varghese', phoneNumber: '9400011104', address: 'Thrippunithura, Ernakulam',
            isGymMember: true, gymFee: 700, isBadmintonMember: false, badmintonFee: 0,
            isStudent: false, paymentRequired: true,
            dateJoined: ago(5),
            gymSuspendedAt: ago(1),
        },
        {
            // Priest — Gym, fee exempt
            fullName: 'Fr. Mathew Chacko', phoneNumber: '9400011105', address: 'Sacred Heart Church, Ernakulam',
            isGymMember: true, gymFee: 0, isBadmintonMember: false, badmintonFee: 0,
            isStudent: false, paymentRequired: false, exemptCategory: 'Priest',
            dateJoined: ago(8),
        },
        {
            // Faculty — Gym, fee exempt
            fullName: 'Prof. Rajan Pillai', phoneNumber: '9400011106', address: 'CUSAT, Kalamassery',
            isGymMember: true, gymFee: 0, isBadmintonMember: false, badmintonFee: 0,
            isStudent: false, paymentRequired: false, exemptCategory: 'Faculty',
            dateJoined: ago(7),
        },
        {
            // Other exempt — Gym
            fullName: 'Santhosh Kumar M', phoneNumber: '9400011107', address: 'Aluva, Ernakulam',
            isGymMember: true, gymFee: 0, isBadmintonMember: false, badmintonFee: 0,
            isStudent: false, paymentRequired: false, exemptCategory: 'Other',
            dateJoined: ago(4),
        },

        // ── BADMINTON ONLY ───────────────────────────────────────────────────
        {
            // Morning batch — regular
            fullName: 'Jithin Antony', phoneNumber: '9400011108', address: 'Vyttila, Kochi',
            isGymMember: false, gymFee: 0, isBadmintonMember: true,
            badmintonSessionId: M, badmintonFee: 600,
            isStudent: false, paymentRequired: true,
            dateJoined: ago(5),
        },
        {
            // Morning batch — student
            fullName: 'Sneha Rajeev Pillai', phoneNumber: '9400011109', address: 'Kadavanthra, Kochi',
            isGymMember: false, gymFee: 0, isBadmintonMember: true,
            badmintonSessionId: M, badmintonFee: 400,
            isStudent: true, studentCourse: 'B.Com Finance', studentYear: '2nd Year',
            paymentRequired: true,
            dateJoined: ago(3),
        },
        {
            // Evening batch — regular
            fullName: 'Gokul Krishnadas', phoneNumber: '9400011110', address: 'Fort Kochi, Ernakulam',
            isGymMember: false, gymFee: 0, isBadmintonMember: true,
            badmintonSessionId: E, badmintonFee: 600,
            isStudent: false, paymentRequired: true,
            dateJoined: ago(6),
        },
        {
            // Evening batch — BADMINTON SUSPENDED
            fullName: 'Divya Lakshmi Nair', phoneNumber: '9400011111', address: 'Mattancherry, Kochi',
            isGymMember: false, gymFee: 0, isBadmintonMember: true,
            badmintonSessionId: E, badmintonFee: 600,
            isStudent: false, paymentRequired: true,
            dateJoined: ago(4),
            badmintonSuspendedAt: ago(1),
        },
        {
            // Night batch — regular
            fullName: 'Nikhil Surendran', phoneNumber: '9400011112', address: 'Angamaly, Ernakulam',
            isGymMember: false, gymFee: 0, isBadmintonMember: true,
            badmintonSessionId: N, badmintonFee: 600,
            isStudent: false, paymentRequired: true,
            dateJoined: ago(5),
        },
        {
            // Night batch — student
            fullName: 'Meera Suresh', phoneNumber: '9400011113', address: 'Panampilly Nagar, Kochi',
            isGymMember: false, gymFee: 0, isBadmintonMember: true,
            badmintonSessionId: N, badmintonFee: 400,
            isStudent: true, studentCourse: 'MBA Marketing', studentYear: 'Final Year',
            paymentRequired: true,
            dateJoined: ago(2),
        },
        {
            // Morning — Priest, exempt
            fullName: 'Fr. Sebastian Joseph', phoneNumber: '9400011114', address: 'St. Sebastian Church, Thrissur',
            isGymMember: false, gymFee: 0, isBadmintonMember: true,
            badmintonSessionId: M, badmintonFee: 0,
            isStudent: false, paymentRequired: false, exemptCategory: 'Priest',
            dateJoined: ago(9),
        },

        // ── DUAL MEMBERS (Gym + Badminton) ───────────────────────────────────
        {
            // Dual — morning, regular
            fullName: 'Ashwin Mathew George', phoneNumber: '9400011115', address: 'Aluva, Ernakulam',
            isGymMember: true, gymFee: 700, isBadmintonMember: true,
            badmintonSessionId: M, badmintonFee: 600,
            isStudent: false, paymentRequired: true,
            dateJoined: ago(7),
        },
        {
            // Dual — evening, student
            fullName: 'Parvathy Prakash', phoneNumber: '9400011116', address: 'Nedumbassery, Ernakulam',
            isGymMember: true, gymFee: 400, isBadmintonMember: true,
            badmintonSessionId: E, badmintonFee: 400,
            isStudent: true, studentCourse: 'BBA Aviation', studentYear: '1st Year',
            paymentRequired: true,
            dateJoined: ago(2),
        },
        {
            // Dual — night, GYM + BADMINTON BOTH SUSPENDED
            fullName: 'Kiran Nambiar', phoneNumber: '9400011117', address: 'Perumbavoor, Ernakulam',
            isGymMember: true, gymFee: 700, isBadmintonMember: true,
            badmintonSessionId: N, badmintonFee: 600,
            isStudent: false, paymentRequired: true,
            dateJoined: ago(6),
            gymSuspendedAt: format(new Date(Date.now() - 15 * 86400000), 'yyyy-MM-dd'),
            badmintonSuspendedAt: format(new Date(Date.now() - 10 * 86400000), 'yyyy-MM-dd'),
        },
        {
            // Dual — morning, Faculty exempt
            fullName: 'Dr. Anand Iyer', phoneNumber: '9400011118', address: 'Kakkanad, Kochi',
            isGymMember: true, gymFee: 0, isBadmintonMember: true,
            badmintonSessionId: M, badmintonFee: 0,
            isStudent: false, paymentRequired: false, exemptCategory: 'Faculty',
            dateJoined: ago(10),
        },
        {
            // Dual — evening, regular, consistent payer
            fullName: 'Lekha Ramachandran', phoneNumber: '9400011119', address: 'Tripunithura, Ernakulam',
            isGymMember: true, gymFee: 700, isBadmintonMember: true,
            badmintonSessionId: E, badmintonFee: 600,
            isStudent: false, paymentRequired: true,
            dateJoined: ago(8),
        },
        {
            // Dual — Night, student, DEFAULTER
            fullName: 'Rohith Sunil Kumar', phoneNumber: '9400011120', address: 'Muvattupuzha, Ernakulam',
            isGymMember: true, gymFee: 400, isBadmintonMember: true,
            badmintonSessionId: N, badmintonFee: 400,
            isStudent: true, studentCourse: 'B.Tech Electronics', studentYear: 'Final Year',
            paymentRequired: true,
            dateJoined: ago(4),
        },
    ];

    // ── Insert users (skip duplicates by phone) ──────────────────────────────
    const existingUsers = await getActiveUsers();

    type InsertedInfo = {
        id: string; isGym: boolean; gymFee: number;
        isBad: boolean; badId: string | null; badFee: number;
        exempt: boolean;
        gymSuspendedAt?: string | null;
        badmintonSuspendedAt?: string | null;
    };
    const insertedUsers: InsertedInfo[] = [];
    let created = 0;

    for (const u of demos) {
        const existing = existingUsers.find(e => e.phoneNumber === u.phoneNumber);
        if (!existing) {
            const payload: any = {
                fullName: u.fullName, phoneNumber: u.phoneNumber, address: u.address,
                isGymMember: u.isGymMember, gymFee: u.gymFee,
                isBadmintonMember: u.isBadmintonMember, badmintonSessionId: u.badmintonSessionId,
                badmintonFee: u.badmintonFee, isStudent: u.isStudent,
                studentCourse: u.studentCourse, studentYear: u.studentYear,
                paymentRequired: u.paymentRequired, exemptCategory: u.exemptCategory,
                dateJoined: u.dateJoined,
            };
            // Remove undefined keys
            Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);
            const uid = await createUser(payload);

            // Apply suspensions post-creation
            if (u.gymSuspendedAt) await updateDoc(doc(db, 'users', uid), { gymSuspendedAt: u.gymSuspendedAt });
            if (u.badmintonSuspendedAt) await updateDoc(doc(db, 'users', uid), { badmintonSuspendedAt: u.badmintonSuspendedAt });

            insertedUsers.push({
                id: uid, isGym: !!u.isGymMember, gymFee: u.gymFee || 0,
                isBad: !!u.isBadmintonMember, badId: u.badmintonSessionId || null, badFee: u.badmintonFee || 0,
                exempt: !u.paymentRequired,
                gymSuspendedAt: u.gymSuspendedAt,
                badmintonSuspendedAt: u.badmintonSuspendedAt,
            });
            created++;
        } else {
            insertedUsers.push({
                id: existing.id || '', isGym: !!existing.isGymMember, gymFee: existing.gymFee || 0,
                isBad: !!existing.isBadmintonMember, badId: existing.badmintonSessionId || null,
                badFee: existing.badmintonFee || 0, exempt: !existing.paymentRequired,
                gymSuspendedAt: existing.gymSuspendedAt,
                badmintonSuspendedAt: existing.badmintonSuspendedAt,
            });
        }
    }

    // ── Billing — 3 months history covering all test cases ───────────────────
    // months[0] = current month, [1] = last month, [2] = 2 months ago
    const months = Array.from({ length: 3 }).map((_, i) => {
        const d = new Date(); d.setMonth(d.getMonth() - i);
        return `${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
    });

    // Identify specific users for targeted billing test cases
    const defaulterIdx = demos.findIndex(d => d.phoneNumber === '9400011120'); // Rohith — all pending
    const alwaysPaidIdx = demos.findIndex(d => d.phoneNumber === '9400011119'); // Lekha — always paid
    const newJoinerIdx = demos.findIndex(d => d.phoneNumber === '9400011113'); // Meera — joined 2 months ago

    for (const u of insertedUsers) {
        if (u.exempt) continue;
        const idx = insertedUsers.indexOf(u);

        for (let mi = 0; mi < months.length; mi++) {
            const m = months[mi];
            let isPaid: boolean;

            if (idx === defaulterIdx) {
                isPaid = false; // chronic defaulter — all pending
            } else if (idx === alwaysPaidIdx) {
                isPaid = true; // model payer — always paid
            } else if (idx === newJoinerIdx && mi >= 2) {
                continue; // new joiner — skip old months
            } else {
                // Random: current month 50/50, older months 80% paid
                isPaid = Math.random() > (mi === 0 ? 0.5 : 0.2);
            }

            if (u.isGym) {
                await toggleBillStatus(u.id, 'Gym', m, u.gymFee, isPaid ? 'Paid' : 'Pending');
            }
            if (u.isBad) {
                await toggleBillStatus(u.id, 'Badminton', m, u.badFee, isPaid ? 'Paid' : 'Pending');
            }
        }
    }

    // ── Attendance — last 90 days (3 months) with Firestore writeBatch ────────
    const pastDays: string[] = [];
    for (let i = 0; i < 90; i++) {
        const d = new Date(); d.setDate(d.getDate() - i);
        if (d.getDay() !== 0) pastDays.push(format(d, 'yyyy-MM-dd'));
    }

    // Suspend two batch days
    const suspendedDate = pastDays[5] || '';
    if (suspendedDate) await suspendBatch(E, suspendedDate, 'State Holiday');
    const suspendedDate2 = pastDays[30] || '';
    if (suspendedDate2) await suspendBatch(N, suspendedDate2, 'Rain - Court Flooded');

    const alwaysAbsentIdx = demos.findIndex(d => d.phoneNumber === '9400011103');

    // Build all attendance docs in memory then flush in writeBatches
    type AttDoc = { date: string; sessionId: string; userId: string; isPresent: boolean };
    const allAttDocs: AttDoc[] = [];

    for (const ds of pastDays) {
        for (const u of insertedUsers) {
            const idx = insertedUsers.indexOf(u);
            const gymSuspDate = u.gymSuspendedAt || '';
            const badSuspDate = u.badmintonSuspendedAt || '';
            const gymAbsent = gymSuspDate && ds >= gymSuspDate;
            const badAbsent = badSuspDate && ds >= badSuspDate;
            const alwaysAbsent = idx === alwaysAbsentIdx;
            const isPresentBase = alwaysAbsent ? false : Math.random() > 0.3;

            if (u.isGym) {
                allAttDocs.push({ date: ds, sessionId: GYM_DEFAULT_SESSION_ID, userId: u.id, isPresent: gymAbsent ? false : isPresentBase });
            }
            if (u.isBad && u.badId) {
                if ((u.badId === E && ds === suspendedDate) || (u.badId === N && ds === suspendedDate2)) continue;
                allAttDocs.push({ date: ds, sessionId: u.badId, userId: u.id, isPresent: badAbsent ? false : isPresentBase });
            }
        }
    }

    // Flush in chunks of 499 (Firestore writeBatch limit is 500)
    const CHUNK = 499;
    for (let i = 0; i < allAttDocs.length; i += CHUNK) {
        const batch = writeBatch(db);
        allAttDocs.slice(i, i + CHUNK).forEach(a => {
            batch.set(doc(attCol), a);
        });
        await batch.commit();
    }

    return `✅ Seeded ${created} new Kerala members!\n20 users • 3 badminton batches • ${allAttDocs.length} attendance records • 3 months billing`;
};


