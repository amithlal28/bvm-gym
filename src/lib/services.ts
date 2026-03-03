import {
    collection, doc, addDoc, getDoc, getDocs,
    updateDoc, deleteDoc, query, where, setDoc, serverTimestamp
} from 'firebase/firestore';
import { db } from './firebase';
import { User, Session, Attendance, Billing, Suspension, ActivityType } from '../types';
import { format } from 'date-fns';

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
    await updateDoc(doc(db, 'users', id), data);
};

export const deleteUser = async (id: string) => {
    await deleteDoc(doc(db, 'users', id));
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
    const batchDefs = [
        { name: 'Morning Batch', timings: '6:00 AM – 9:00 AM' },
        { name: 'Evening Batch', timings: '5:00 PM – 8:00 PM' },
    ];
    const existingBatches = await getBadmintonSessions();
    const idMap: Record<string, string> = {};
    for (const b of batchDefs) {
        idMap[b.name] = existingBatches.find(e => e.name === b.name)?.id ?? await createSession({ name: b.name, activityType: 'Badminton', timings: b.timings });
    }

    const demos: Omit<User, 'id' | 'createdAt' | 'status'>[] = [
        // Gym Only
        { fullName: 'Rahul Sharma', phoneNumber: '9800000001', address: 'Pune', isGymMember: true, gymFee: 1200, isBadmintonMember: false, badmintonFee: 0, isStudent: false, paymentRequired: true },
        { fullName: 'Amit Patel', phoneNumber: '9800000002', address: 'Pune', isGymMember: true, gymFee: 1200, isBadmintonMember: false, badmintonFee: 0, isStudent: false, paymentRequired: true },
        { fullName: 'Priya Singh', phoneNumber: '9800000003', address: 'Pune', isGymMember: true, gymFee: 1000, isBadmintonMember: false, badmintonFee: 0, isStudent: false, paymentRequired: true },
        { fullName: 'Neha Gupta', phoneNumber: '9800000004', address: 'Pune', isGymMember: true, gymFee: 1000, isBadmintonMember: false, badmintonFee: 0, isStudent: true, studentCourse: 'BCA', studentYear: '2nd Year', paymentRequired: true },
        { fullName: 'Father John', phoneNumber: '9800000005', address: 'Church', isGymMember: true, gymFee: 0, isBadmintonMember: false, badmintonFee: 0, isStudent: false, paymentRequired: false, exemptCategory: 'Priest' },

        // Badminton Morning
        { fullName: 'Vikram Desai', phoneNumber: '9811111101', address: 'Pune', isGymMember: false, gymFee: 0, isBadmintonMember: true, badmintonSessionId: idMap['Morning Batch'], badmintonFee: 600, isStudent: false, paymentRequired: true },
        { fullName: 'Sanjay Kumar', phoneNumber: '9811111102', address: 'Pune', isGymMember: false, gymFee: 0, isBadmintonMember: true, badmintonSessionId: idMap['Morning Batch'], badmintonFee: 600, isStudent: false, paymentRequired: true },
        { fullName: 'Kavita Joshi', phoneNumber: '9811111103', address: 'Pune', isGymMember: false, gymFee: 0, isBadmintonMember: true, badmintonSessionId: idMap['Morning Batch'], badmintonFee: 500, isStudent: true, studentCourse: 'B.Tech', studentYear: '1st Year', paymentRequired: true },
        { fullName: 'Ravi Verma', phoneNumber: '9811111104', address: 'Pune', isGymMember: false, gymFee: 0, isBadmintonMember: true, badmintonSessionId: idMap['Morning Batch'], badmintonFee: 600, isStudent: false, paymentRequired: true },
        { fullName: 'Guest Player', phoneNumber: '9811111105', address: 'Hostel', isGymMember: false, gymFee: 0, isBadmintonMember: true, badmintonSessionId: idMap['Morning Batch'], badmintonFee: 0, isStudent: false, paymentRequired: false, exemptCategory: 'Other' },

        // Badminton Evening
        { fullName: 'Meera Reddy', phoneNumber: '9822222201', address: 'Pune', isGymMember: false, gymFee: 0, isBadmintonMember: true, badmintonSessionId: idMap['Evening Batch'], badmintonFee: 600, isStudent: false, paymentRequired: true },
        { fullName: 'Arjun Nair', phoneNumber: '9822222202', address: 'Pune', isGymMember: false, gymFee: 0, isBadmintonMember: true, badmintonSessionId: idMap['Evening Batch'], badmintonFee: 600, isStudent: false, paymentRequired: true },
        { fullName: 'Sneha Kapoor', phoneNumber: '9822222203', address: 'Pune', isGymMember: false, gymFee: 0, isBadmintonMember: true, badmintonSessionId: idMap['Evening Batch'], badmintonFee: 600, isStudent: false, paymentRequired: true },
        { fullName: 'Prof. Rao', phoneNumber: '9822222204', address: 'College', isGymMember: false, gymFee: 0, isBadmintonMember: true, badmintonSessionId: idMap['Evening Batch'], badmintonFee: 0, isStudent: false, paymentRequired: false, exemptCategory: 'Faculty' },

        // Dual Members (Gym + Badminton)
        { fullName: 'Aditya Mehta', phoneNumber: '9833333301', address: 'Pune', isGymMember: true, gymFee: 1000, isBadmintonMember: true, badmintonSessionId: idMap['Morning Batch'], badmintonFee: 500, isStudent: false, paymentRequired: true },
        { fullName: 'Rohan Shah', phoneNumber: '9833333302', address: 'Pune', isGymMember: true, gymFee: 1000, isBadmintonMember: true, badmintonSessionId: idMap['Evening Batch'], badmintonFee: 500, isStudent: false, paymentRequired: true },
        { fullName: 'Isha Patel', phoneNumber: '9833333303', address: 'Pune', isGymMember: true, gymFee: 800, isBadmintonMember: true, badmintonSessionId: idMap['Evening Batch'], badmintonFee: 400, isStudent: true, studentCourse: 'MBA', studentYear: 'Final', paymentRequired: true },
        { fullName: 'Dr. Anand', phoneNumber: '9833333304', address: 'Hospital', isGymMember: true, gymFee: 1200, isBadmintonMember: true, badmintonSessionId: idMap['Morning Batch'], badmintonFee: 700, isStudent: false, paymentRequired: true },
    ];

    const existingUsers = await getActiveUsers();
    const insertedUsers: { id: string, isGym: boolean, gymFee: number, isBad: boolean, badId: string | null, badFee: number, exempt: boolean }[] = [];

    let created = 0;
    for (const u of demos) {
        let existing = existingUsers.find(e => e.phoneNumber === u.phoneNumber);
        if (!existing) {
            const uid = await createUser({ ...u, exemptCategory: (u as any).exemptCategory });
            insertedUsers.push({ id: uid, isGym: !!u.isGymMember, gymFee: u.gymFee || 0, isBad: !!u.isBadmintonMember, badId: u.badmintonSessionId || null, badFee: u.badmintonFee || 0, exempt: !u.paymentRequired });
            created++;
        } else {
            insertedUsers.push({ id: existing.id || '', isGym: !!existing.isGymMember, gymFee: existing.gymFee || 0, isBad: !!existing.isBadmintonMember, badId: existing.badmintonSessionId || null, badFee: existing.badmintonFee || 0, exempt: !existing.paymentRequired });
        }
    }

    // Billing Data: Past 5 months
    const months = Array.from({ length: 5 }).map((_, i) => {
        const d = new Date(); d.setMonth(d.getMonth() - i);
        return `${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
    });

    for (const u of insertedUsers) {
        if (u.exempt) continue;
        for (let i = 0; i < months.length; i++) {
            const m = months[i];
            const isDefaulter = u.id === insertedUsers[1]?.id;
            const isPaid = isDefaulter ? false : Math.random() > (i === 0 ? 0.5 : 0.1);

            if (u.isGym) {
                await toggleBillStatus(u.id, 'Gym', m, u.gymFee, isPaid ? 'Paid' : 'Pending');
            }
            if (u.isBad) {
                await toggleBillStatus(u.id, 'Badminton', m, u.badFee, isPaid ? 'Paid' : 'Pending');
            }
        }
    }

    // Attendance Data: Past 5 days
    const pastDays = Array.from({ length: 5 }).map((_, i) => {
        const d = new Date(); d.setDate(d.getDate() - i);
        return format(d, 'yyyy-MM-dd');
    });

    const yesterdayStr = pastDays[1];
    await suspendBatch(idMap['Evening Batch'], yesterdayStr, 'Holiday');

    for (const ds of pastDays) {
        const attToSave: Record<string, { userId: string, isPresent: boolean }[]> = {};

        for (const u of insertedUsers) {
            const isDefAbsent = u.id === insertedUsers[2]?.id; // Someone always absent
            const isPresent = isDefAbsent ? false : Math.random() > 0.3;

            if (u.isGym) {
                if (!attToSave[GYM_DEFAULT_SESSION_ID]) attToSave[GYM_DEFAULT_SESSION_ID] = [];
                attToSave[GYM_DEFAULT_SESSION_ID].push({ userId: u.id, isPresent });
            }
            if (u.isBad && u.badId) {
                if (ds === yesterdayStr && u.badId === idMap['Evening Batch']) continue;
                if (!attToSave[u.badId]) attToSave[u.badId] = [];
                attToSave[u.badId].push({ userId: u.id, isPresent });
            }
        }

        for (const [sid, records] of Object.entries(attToSave)) {
            await saveAttendanceBatch(ds, sid, records);
        }
    }

    return `✅ Seeded ${created} new members, generated 5 months billing & 5 days attendance!`;
};
