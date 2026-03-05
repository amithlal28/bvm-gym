import React, { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, FlatList,
    Alert, ActivityIndicator, TouchableOpacity
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { format } from 'date-fns';
import { CheckCircle2, Circle, PauseCircle, Info } from 'lucide-react-native';
import { Billing, User } from '../types';
import { getBillsByUser, toggleBillStatus, getUserById, getAttendanceCountByMonth } from '../lib/services';
import { RootStackParamList } from '../types/navigation';

const C = { orange: '#FC8019', bg: '#F8F9FA', card: '#FFFFFF', text: '#1A1A2E', sub: '#93959F', green: '#10B981', red: '#EF4444', border: '#F0F0F0', purple: '#8B5CF6' };
type Props = NativeStackScreenProps<RootStackParamList, 'UserBilling'>;

type MonthGroup = { monthYear: string; gymBill?: Billing; badmintonBill?: Billing; gymDays: number; badDays: number };

export default function UserBillingScreen({ route }: Props) {
    const { userId, userName } = route.params;
    const [months, setMonths] = useState<MonthGroup[]>([]);
    const [loading, setLoading] = useState(true);
    const [userFees, setUserFees] = useState<{ gymFee: number; badmintonFee: number; isGymMember: boolean; isBadmintonMember: boolean; paymentRequired: boolean }>({ gymFee: 0, badmintonFee: 0, isGymMember: false, isBadmintonMember: false, paymentRequired: true });
    const [userData, setUserData] = useState<User | null>(null);
    const [toggling, setToggling] = useState<string | null>(null);

    useEffect(() => { load(); }, [userId]);

    const load = async () => {
        try {
            setLoading(true);
            const [bills, user] = await Promise.all([getBillsByUser(userId), getUserById(userId)]);
            if (user) {
                setUserFees({ gymFee: user.gymFee || 0, badmintonFee: user.badmintonFee || 0, isGymMember: user.isGymMember || false, isBadmintonMember: user.isBadmintonMember || false, paymentRequired: user.paymentRequired !== false });
                setUserData(user);
            }

            // Group by month
            const monthMap: Record<string, MonthGroup> = {};
            bills.forEach(b => {
                if (!monthMap[b.monthYear]) monthMap[b.monthYear] = { monthYear: b.monthYear, gymDays: 0, badDays: 0 };
                if (b.activityType === 'Gym') monthMap[b.monthYear].gymBill = b;
                if (b.activityType === 'Badminton') monthMap[b.monthYear].badmintonBill = b;
            });

            // Fetch attendance for these months in parallel
            const monthKeys = Object.keys(monthMap);
            await Promise.all(monthKeys.map(async mv => {
                const [m, y] = mv.split('-');
                const yyyymm = `${y}-${m}`;
                const counts = await getAttendanceCountByMonth(yyyymm);
                monthMap[mv].gymDays = counts.gym[userId] || 0;
                monthMap[mv].badDays = counts.badminton[userId] || 0;
            }));

            // Parse and sort by month descending
            const sorted = Object.values(monthMap).sort((a, b) => {
                const parseMonth = (mv: string) => { const [m, y] = mv.split('-'); return parseInt(y) * 100 + parseInt(m); };
                return parseMonth(b.monthYear) - parseMonth(a.monthYear);
            });

            setMonths(sorted);
        } catch (e: any) { Alert.alert('Error', e.message); }
        finally { setLoading(false); }
    };

    const handleToggle = async (monthYear: string, type: 'Gym' | 'Badminton', bill?: Billing, fee?: number) => {
        const key = `${monthYear}_${type}`;
        const newStatus = bill?.status === 'Paid' ? 'Pending' : 'Paid';
        try {
            setToggling(key);
            await toggleBillStatus(userId, type, monthYear, fee || 0, newStatus);
            await load();
        } catch (e: any) { Alert.alert('Error', e.message); }
        finally { setToggling(null); }
    };

    const totalPaid = months.reduce((s, m) => s + (m.gymBill?.status === 'Paid' ? m.gymBill.amount : 0) + (m.badmintonBill?.status === 'Paid' ? m.badmintonBill.amount : 0), 0);
    const totalPending = months.reduce((s, m) => {
        const [mm, yy] = m.monthYear.split('-');
        const yyyymmdd = `${yy}-${mm}-01`;

        const isGymSuspended = userData?.gymSuspendedAt && userData.gymSuspendedAt <= yyyymmdd;
        const isBadSuspended = userData?.badmintonSuspendedAt && userData.badmintonSuspendedAt <= yyyymmdd;

        const gPend = userFees.isGymMember && !isGymSuspended && m.gymDays > 0 && m.gymBill?.status !== 'Paid' ? (m.gymBill?.amount ?? userFees.gymFee) : 0;
        const bPend = userFees.isBadmintonMember && !isBadSuspended && m.badDays > 0 && m.badmintonBill?.status !== 'Paid' ? (m.badmintonBill?.amount ?? userFees.badmintonFee) : 0;
        return s + gPend + bPend;
    }, 0);

    const formatMonth = (mv: string) => {
        const [m, y] = mv.split('-');
        return format(new Date(parseInt(y), parseInt(m) - 1, 1), 'MMMM yyyy');
    };

    const renderMonth = ({ item }: { item: MonthGroup }) => {
        const [mm, yy] = item.monthYear.split('-');
        const yyyymmdd = `${yy}-${mm}-01`;
        const isGymSuspended = userData?.gymSuspendedAt && userData.gymSuspendedAt <= yyyymmdd;
        const isBadSuspended = userData?.badmintonSuspendedAt && userData.badmintonSuspendedAt <= yyyymmdd;

        return (
            <View style={styles.monthCard}>
                <Text style={styles.monthLabel}>{formatMonth(item.monthYear)}</Text>

                {userFees.isGymMember && (
                    isGymSuspended ? (
                        <SuspendedLine label="🏋️ Gym" />
                    ) : item.gymDays === 0 ? (
                        <ZeroDaysLine label="🏋️ Gym" />
                    ) : (
                        <BillLine
                            label="🏋️ Gym"
                            fee={item.gymBill?.amount ?? userFees.gymFee}
                            status={item.gymBill?.status || 'Pending'}
                            loading={toggling === `${item.monthYear}_Gym`}
                            onToggle={() => handleToggle(item.monthYear, 'Gym', item.gymBill, userFees.gymFee)}
                            days={item.gymDays}
                        />
                    )
                )}
                {userFees.isBadmintonMember && (
                    isBadSuspended ? (
                        <SuspendedLine label="🏸 Badminton" />
                    ) : item.badDays === 0 ? (
                        <ZeroDaysLine label="🏸 Badminton" />
                    ) : (
                        <BillLine
                            label="🏸 Badminton"
                            fee={item.badmintonBill?.amount ?? userFees.badmintonFee}
                            status={item.badmintonBill?.status || 'Pending'}
                            loading={toggling === `${item.monthYear}_Badminton`}
                            onToggle={() => handleToggle(item.monthYear, 'Badminton', item.badmintonBill, userFees.badmintonFee)}
                            days={item.badDays}
                        />
                    )
                )}
            </View>
        );
    };

    return (
        <View style={styles.container}>
            {/* Summary header */}
            <View style={styles.summaryBar}>
                <View style={[styles.summCard, { backgroundColor: '#ECFDF5' }]}>
                    <CheckCircle2 size={16} color={C.green} strokeWidth={2.5} />
                    <Text style={[styles.summAmt, { color: C.green }]}>₹{totalPaid}</Text>
                    <Text style={styles.summLabel}>Paid</Text>
                </View>
                <View style={[styles.summCard, { backgroundColor: '#FFF7ED' }]}>
                    <Circle size={16} color="#F59E0B" strokeWidth={2} />
                    <Text style={[styles.summAmt, { color: '#F59E0B' }]}>₹{totalPending}</Text>
                    <Text style={styles.summLabel}>Outstanding</Text>
                </View>
                <View style={[styles.summCard, { backgroundColor: '#F5F3FF' }]}>
                    <Text style={[styles.summAmt, { color: C.purple }]}>{months.length}</Text>
                    <Text style={styles.summLabel}>Months</Text>
                </View>
            </View>

            {!userFees.paymentRequired && (
                <View style={styles.exemptBanner}>
                    <Text style={styles.exemptText}>This member is Fee Exempt — no charges apply</Text>
                </View>
            )}

            {loading ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={C.orange} /></View>
            ) : months.length === 0 ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                    <Text style={{ fontSize: 40 }}>📋</Text>
                    <Text style={styles.emptyText}>No billing records yet.</Text>
                    <Text style={styles.emptySubtext}>Go to Billing → By Month to mark payments.</Text>
                </View>
            ) : (
                <FlatList
                    data={months}
                    keyExtractor={i => i.monthYear}
                    renderItem={renderMonth}
                    contentContainerStyle={styles.list}
                    showsVerticalScrollIndicator={false}
                />
            )}
        </View>
    );
}

const SuspendedLine = ({ label }: { label: string }) => (
    <View style={[styles.billLine, { backgroundColor: '#F9FAFB' }]}>
        <Text style={styles.billLabel}>{label}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#FFFBEB', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 }}>
            <PauseCircle size={13} color='#92400E' strokeWidth={2.5} />
            <Text style={{ color: '#92400E', fontWeight: '700', fontSize: 12 }}>Suspended</Text>
        </View>
    </View>
);

const ZeroDaysLine = ({ label }: { label: string }) => (
    <View style={[styles.billLine, { backgroundColor: '#F8FAFC' }]}>
        <Text style={styles.billLabel}>{label}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#F1F5F9', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 }}>
            <Info size={13} color='#64748B' strokeWidth={2.5} />
            <Text style={{ color: '#64748B', fontWeight: '700', fontSize: 12 }}>0 Days Present</Text>
        </View>
    </View>
);

const BillLine = ({ label, fee, status, loading, onToggle, days }: { label: string; fee: number; status: 'Paid' | 'Pending'; loading: boolean; onToggle: () => void; days: number }) => (
    <TouchableOpacity style={[styles.billLine, status === 'Paid' && styles.billLinePaid]} onPress={onToggle} disabled={loading} activeOpacity={0.75}>
        <View style={{ flex: 1 }}>
            <Text style={styles.billLabel}>{label}</Text>
            <Text style={{ fontSize: 12, color: C.sub, marginTop: 2, fontWeight: '600' }}>{days} days present</Text>
        </View>
        <Text style={styles.billFee}>₹{fee}</Text>
        {loading ? <ActivityIndicator size="small" color={C.orange} /> : status === 'Paid'
            ? <View style={styles.paidBadge}><CheckCircle2 size={13} color={C.green} strokeWidth={2.5} /><Text style={styles.paidText}>Paid</Text></View>
            : <View style={styles.pendingBadge}><Circle size={13} color={'#F59E0B'} strokeWidth={2} /><Text style={styles.pendingText}>Mark Paid</Text></View>
        }
    </TouchableOpacity>
);

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    summaryBar: { flexDirection: 'row', gap: 10, padding: 16, backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border },
    summCard: { flex: 1, borderRadius: 14, padding: 12, alignItems: 'center', gap: 4 },
    summAmt: { fontSize: 18, fontWeight: '900' },
    summLabel: { fontSize: 10, color: C.sub, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
    exemptBanner: { backgroundColor: '#E8F5E9', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#C8EFC8' },
    exemptText: { color: C.green, fontWeight: '700', fontSize: 13 },
    list: { padding: 16, paddingBottom: 80 },
    monthCard: { backgroundColor: C.card, borderRadius: 18, marginBottom: 12, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
    monthLabel: { fontSize: 14, fontWeight: '800', color: C.sub, textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, backgroundColor: '#FAFAFA', borderBottomWidth: 1, borderBottomColor: C.border },
    billLine: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
    billLinePaid: { backgroundColor: '#FAFFFE' },
    billLabel: { flex: 1, fontSize: 15, fontWeight: '700', color: C.text },
    billFee: { fontSize: 16, fontWeight: '800', color: C.text, marginRight: 10 },
    paidBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#ECFDF5', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
    paidText: { color: C.green, fontWeight: '700', fontSize: 13 },
    pendingBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FFF7ED', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
    pendingText: { color: '#D97706', fontWeight: '700', fontSize: 12 },
    emptyText: { color: C.text, fontSize: 17, fontWeight: '700' },
    emptySubtext: { color: C.sub, fontSize: 13, textAlign: 'center' },
});
