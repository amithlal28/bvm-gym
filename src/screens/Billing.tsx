import React, { useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, FlatList,
    Alert, ActivityIndicator, RefreshControl, ScrollView, TextInput
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { format, addMonths } from 'date-fns';
import { ChevronLeft, ChevronRight, BookOpen, Ban, CheckCircle2, Circle, User as UserIcon, Star, Briefcase, Info, Search } from 'lucide-react-native';
import { User, Billing, Session } from '../types';
import { getActiveUsers, getBillsByMonth, toggleBillStatus, getBadmintonSessions } from '../lib/services';
import { RootStackParamList } from '../types/navigation';

const C = { orange: '#FC8019', bg: '#F8F9FA', card: '#FFFFFF', text: '#1A1A2E', sub: '#93959F', green: '#10B981', red: '#EF4444', border: '#F0F0F0', purple: '#8B5CF6', gold: '#FBBF24', blue: '#3B82F6' };
type Nav = NativeStackNavigationProp<RootStackParamList>;
type ViewMode = 'month' | 'member' | 'batch';
type FilterStatus = 'All' | 'Paid' | 'Pending';
type BillEntry = { user: User; gymBill?: Billing; badmintonBill?: Billing };

const BillingScreen = () => {
    const navigation = useNavigation<Nav>();
    const [viewMode, setViewMode] = useState<ViewMode>('month');
    const [filterStatus, setFilterStatus] = useState<FilterStatus>('All');
    const [memberSearchQuery, setMemberSearchQuery] = useState('');
    const [month, setMonth] = useState<Date>(new Date());
    const [entries, setEntries] = useState<BillEntry[]>([]);
    const [sessions, setSessions] = useState<Session[]>([]);
    const [selectedBatch, setSelectedBatch] = useState<string>('Gym');
    const [loading, setLoading] = useState(true);
    const [toggling, setToggling] = useState<string | null>(null);

    useFocusEffect(useCallback(() => { load(month); }, [month]));

    const load = async (d: Date) => {
        try {
            setLoading(true);
            const mv = format(d, 'MM-yyyy');
            const [users, bills, sess] = await Promise.all([getActiveUsers(), getBillsByMonth(mv), getBadmintonSessions()]);
            const built: BillEntry[] = users.map(u => ({
                user: u,
                gymBill: bills.find(b => b.userId === u.id && b.activityType === 'Gym'),
                badmintonBill: bills.find(b => b.userId === u.id && b.activityType === 'Badminton'),
            }));
            // Sort pending first
            built.sort((a, b) => {
                const aPending = (a.user.isGymMember && a.gymBill?.status !== 'Paid') || (a.user.isBadmintonMember && a.badmintonBill?.status !== 'Paid') ? 0 : 1;
                const bPending = (b.user.isGymMember && b.gymBill?.status !== 'Paid') || (b.user.isBadmintonMember && b.badmintonBill?.status !== 'Paid') ? 0 : 1;
                return aPending - bPending;
            });
            setEntries(built);
            setSessions(sess);
        } catch (e: any) { Alert.alert('Error', e.message); }
        finally { setLoading(false); }
    };

    const handleToggle = async (entry: BillEntry, type: 'Gym' | 'Badminton') => {
        const uid = entry.user.id as string;
        const key = `${uid}_${type}`;
        const bill = type === 'Gym' ? entry.gymBill : entry.badmintonBill;
        const fee = type === 'Gym' ? entry.user.gymFee : entry.user.badmintonFee;
        const newStatus = bill?.status === 'Paid' ? 'Pending' : 'Paid';

        // Optimistic Update
        setEntries(prev => prev.map(e => {
            if (e.user.id !== uid) return e;
            return {
                ...e,
                gymBill: type === 'Gym' ? { ...(e.gymBill || {} as any), status: newStatus, amount: fee } : e.gymBill,
                badmintonBill: type === 'Badminton' ? { ...(e.badmintonBill || {} as any), status: newStatus, amount: fee } : e.badmintonBill
            };
        }));

        try {
            setToggling(key);
            await toggleBillStatus(uid, type, format(month, 'MM-yyyy'), fee || 0, newStatus);
            // Note: We don't await load(month) here anymore to keep the UI super fast
        } catch (e: any) {
            Alert.alert('Sync Error', e.message);
            await load(month); // Revert on failure
        }
        finally { setToggling(null); }
    };

    let filteredEntries = entries;
    if (viewMode === 'batch') {
        if (selectedBatch === 'Gym') {
            filteredEntries = entries.filter(e => e.user.isGymMember);
        } else {
            filteredEntries = entries.filter(e => e.user.isBadmintonMember && e.user.badmintonSessionId === selectedBatch);
        }
    }

    if (viewMode === 'member' && memberSearchQuery.trim()) {
        const q = memberSearchQuery.toLowerCase();
        filteredEntries = filteredEntries.filter(e => e.user.fullName.toLowerCase().includes(q) || e.user.phoneNumber.includes(q));
    }

    // Apply payment status filter
    if (filterStatus !== 'All') {
        filteredEntries = filteredEntries.filter(e => {
            if (!e.user.paymentRequired) return false; // Exempt users have no bills

            const isGymPending = e.user.isGymMember && e.gymBill?.status !== 'Paid';
            const isBadmintonPending = e.user.isBadmintonMember && e.badmintonBill?.status !== 'Paid';
            const hasPending = isGymPending || isBadmintonPending;

            return filterStatus === 'Pending' ? hasPending : !hasPending;
        });
    }

    const totalCollected = filteredEntries.reduce((s, e) => s + (e.gymBill?.status === 'Paid' ? e.gymBill.amount : 0) + (e.badmintonBill?.status === 'Paid' ? e.badmintonBill.amount : 0), 0);
    const totalPending = filteredEntries.reduce((s, e) => {
        return s + (e.user.isGymMember && e.user.paymentRequired && e.gymBill?.status !== 'Paid' ? (e.user.gymFee || 0) : 0)
            + (e.user.isBadmintonMember && e.user.paymentRequired && e.badmintonBill?.status !== 'Paid' ? (e.user.badmintonFee || 0) : 0);
    }, 0);
    const totalPayable = filteredEntries.filter(e => e.user.paymentRequired).length;

    const actColor = (u: User) => u.isGymMember && u.isBadmintonMember ? C.purple : u.isGymMember ? C.green : C.orange;

    const renderEntry = ({ item: e }: { item: BillEntry }) => {
        const gc = actColor(e.user);
        const isExempt = !e.user.paymentRequired;
        return (
            <View style={styles.card}>
                <TouchableOpacity style={styles.cardHeader} onPress={() => navigation.navigate('UserBilling', { userId: e.user.id!, userName: e.user.fullName })} activeOpacity={0.7}>
                    <View style={[styles.avatar, { backgroundColor: `${gc}18` }]}>
                        <Text style={[styles.avatarText, { color: gc }]}>{e.user.fullName.charAt(0)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <Text style={styles.name}>{e.user.fullName}</Text>
                            {e.user.isStudent && <View style={styles.badge}><BookOpen size={9} color={C.purple} strokeWidth={2.5} /><Text style={[styles.badgeText, { color: C.purple }]}>Student</Text></View>}
                            {isExempt && (
                                <View style={[styles.badge, { backgroundColor: e.user.exemptCategory === 'Priest' ? '#FFFBEB' : e.user.exemptCategory === 'Faculty' ? '#F0F9FF' : '#F5F5F5' }]}>
                                    {e.user.exemptCategory === 'Priest' ? <Star size={9} color={C.gold} strokeWidth={2.5} /> :
                                        e.user.exemptCategory === 'Faculty' ? <Briefcase size={9} color={C.blue} strokeWidth={2.5} /> :
                                            <Info size={9} color={C.sub} strokeWidth={2.5} />}
                                    <Text style={[styles.badgeText, { color: e.user.exemptCategory === 'Priest' ? C.gold : e.user.exemptCategory === 'Faculty' ? C.blue : C.sub }]}>
                                        {e.user.exemptCategory || 'Exempt'}
                                    </Text>
                                </View>
                            )}
                        </View>
                        <Text style={styles.memberSub}>{e.user.phoneNumber}</Text>

                        {(viewMode === 'member' && filterStatus === 'Pending' && e.user.paymentRequired) && (() => {
                            const p1 = e.user.isGymMember && e.gymBill?.status !== 'Paid' ? (e.user.gymFee || 0) : 0;
                            const p2 = e.user.isBadmintonMember && e.badmintonBill?.status !== 'Paid' ? (e.user.badmintonFee || 0) : 0;
                            const tPending = p1 + p2;
                            if (tPending > 0) return <Text style={{ color: C.red, fontSize: 13, fontWeight: '700', marginTop: 4 }}>Pending: ₹{tPending}</Text>;
                            return null;
                        })()}
                    </View>
                    <View style={styles.historyLink}><Text style={styles.historyLinkText}>History →</Text></View>
                </TouchableOpacity>

                {isExempt ? (
                    <View style={styles.exemptRow}><Text style={styles.exemptText}>Fee Exempt — No charge this month</Text></View>
                ) : (
                    <View style={styles.billRows}>
                        {e.user.isGymMember && (viewMode !== 'batch' || selectedBatch === 'Gym') && (
                            <BillRow
                                label="🏋️ Gym"
                                fee={e.user.gymFee}
                                status={e.gymBill?.status || 'Pending'}
                                loading={toggling === `${e.user.id}_Gym`}
                                onToggle={() => handleToggle(e, 'Gym')}
                            />
                        )}
                        {e.user.isBadmintonMember && (viewMode !== 'batch' || selectedBatch !== 'Gym') && (
                            <BillRow
                                label={viewMode === 'batch' ? "🏸 Badminton Batch" : "🏸 Badminton"}
                                fee={e.user.badmintonFee}
                                status={e.badmintonBill?.status || 'Pending'}
                                loading={toggling === `${e.user.id}_Badminton`}
                                onToggle={() => handleToggle(e, 'Badminton')}
                            />
                        )}
                    </View>
                )}
            </View>
        );
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.topBar}>
                {/* View mode toggle */}
                <View style={styles.modeToggle}>
                    {(['month', 'batch', 'member'] as ViewMode[]).map(m => (
                        <TouchableOpacity key={m} style={[styles.modeBtn, viewMode === m && styles.modeBtnActive]} onPress={() => setViewMode(m)}>
                            <Text style={[styles.modeBtnText, viewMode === m && styles.modeBtnTextActive]}>{m === 'month' ? 'By Month' : m === 'batch' ? 'By Batch' : 'By Member'}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
                {(viewMode === 'month' || viewMode === 'batch') && (
                    <View style={styles.monthRow}>
                        <TouchableOpacity style={styles.navBtn} onPress={() => setMonth(addMonths(month, -1))}>
                            <ChevronLeft size={20} color={C.text} strokeWidth={2.5} />
                        </TouchableOpacity>
                        <Text style={styles.monthText}>{format(month, 'MMMM yyyy')}</Text>
                        <TouchableOpacity style={styles.navBtn} onPress={() => setMonth(addMonths(month, 1))}>
                            <ChevronRight size={20} color={C.text} strokeWidth={2.5} />
                        </TouchableOpacity>
                    </View>
                )}
            </View>

            {/* Filter Status row */}
            <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 12 }}>
                {(['All', 'Paid', 'Pending'] as FilterStatus[]).map(s => (
                    <TouchableOpacity key={s} onPress={() => setFilterStatus(s)} style={[styles.filterChip, filterStatus === s && styles.filterChipActive]} activeOpacity={0.7}>
                        {s === 'Paid' && <CheckCircle2 size={12} color={filterStatus === s ? C.green : C.sub} strokeWidth={2.5} />}
                        {s === 'Pending' && <Circle size={12} color={filterStatus === s ? C.orange : C.sub} strokeWidth={2.5} />}
                        <Text style={[styles.filterChipText, filterStatus === s && (s === 'Paid' ? { color: C.green } : s === 'Pending' ? { color: C.orange } : { color: C.text })]}>{s}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* Member Search */}
            {viewMode === 'member' && (
                <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
                    <View style={styles.searchBox}>
                        <Search size={16} color={C.sub} style={{ marginRight: 8 }} />
                        <TextInput style={styles.searchInput} placeholder="Search by name or number" placeholderTextColor={C.sub} value={memberSearchQuery} onChangeText={setMemberSearchQuery} />
                    </View>
                </View>
            )}

            {/* Batch sub-tabs */}
            {viewMode === 'batch' && (
                <View style={{ marginTop: 8 }}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                        <TouchableOpacity style={[styles.batchChip, selectedBatch === 'Gym' && styles.batchChipActive]} onPress={() => setSelectedBatch('Gym')}>
                            <Text style={[styles.batchChipText, selectedBatch === 'Gym' && styles.batchChipTextActive]}>🏋️ Gym</Text>
                        </TouchableOpacity>
                        {sessions.map(s => (
                            <TouchableOpacity key={s.id} style={[styles.batchChip, selectedBatch === s.id && styles.batchChipActive]} onPress={() => setSelectedBatch(s.id!)}>
                                <Text style={[styles.batchChipText, selectedBatch === s.id && styles.batchChipTextActive]}>🏸 {s.name}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>
            )}

            {/* Summary */}
            <View style={styles.summaryRow}>
                <View style={[styles.summCard, { backgroundColor: '#ECFDF5' }]}>
                    <CheckCircle2 size={16} color={C.green} strokeWidth={2.5} />
                    <Text style={[styles.summAmt, { color: C.green }]}>₹{totalCollected}</Text>
                    <Text style={styles.summLabel}>Collected</Text>
                </View>
                <View style={[styles.summCard, { backgroundColor: totalPending > 0 ? '#FFF7ED' : '#ECFDF5' }]}>
                    <Circle size={16} color={totalPending > 0 ? '#F59E0B' : C.green} strokeWidth={2.5} />
                    <Text style={[styles.summAmt, { color: totalPending > 0 ? '#F59E0B' : C.green }]}>₹{totalPending}</Text>
                    <Text style={styles.summLabel}>Pending</Text>
                </View>
                <View style={[styles.summCard, { backgroundColor: '#F5F3FF' }]}>
                    <UserIcon size={16} color={C.purple} strokeWidth={2.5} />
                    <Text style={[styles.summAmt, { color: C.purple }]}>{totalPayable}</Text>
                    <Text style={styles.summLabel}>Payable</Text>
                </View>
            </View>

            {loading ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={C.orange} /></View>
            ) : viewMode === 'month' || viewMode === 'batch' ? (
                <FlatList
                    data={filteredEntries}
                    keyExtractor={i => i.user.id || ''}
                    renderItem={renderEntry}
                    contentContainerStyle={styles.list}
                    showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load(month)} colors={[C.orange]} />}
                    ListEmptyComponent={<View style={{ alignItems: 'center', paddingTop: 60 }}><Text style={{ color: C.sub, fontSize: 15 }}>No members found.</Text></View>}
                />
            ) : (
                // By Member
                <FlatList
                    data={filteredEntries}
                    keyExtractor={i => i.user.id || ''}
                    contentContainerStyle={styles.list}
                    showsVerticalScrollIndicator={false}
                    renderItem={({ item: e }) => {
                        const gc = actColor(e.user);
                        const gymAmt = e.user.gymFee || 0;
                        const badAmt = e.user.badmintonFee || 0;
                        const monthly = (e.user.isGymMember ? gymAmt : 0) + (e.user.isBadmintonMember ? badAmt : 0);
                        return (
                            <TouchableOpacity style={styles.memberRow} activeOpacity={0.75} onPress={() => navigation.navigate('UserBilling', { userId: e.user.id!, userName: e.user.fullName })}>
                                <View style={[styles.avatar, { backgroundColor: `${gc}18` }]}>
                                    <Text style={[styles.avatarText, { color: gc }]}>{e.user.fullName.charAt(0)}</Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.name}>{e.user.fullName}</Text>
                                    <Text style={styles.memberSub}>{e.user.isGymMember && e.user.isBadmintonMember ? 'Gym + Badminton' : e.user.isGymMember ? 'Gym Only' : 'Badminton Only'}</Text>
                                    {(viewMode === 'member' && filterStatus === 'Pending' && e.user.paymentRequired) && (() => {
                                        const p1 = e.user.isGymMember && e.gymBill?.status !== 'Paid' ? (e.user.gymFee || 0) : 0;
                                        const p2 = e.user.isBadmintonMember && e.badmintonBill?.status !== 'Paid' ? (e.user.badmintonFee || 0) : 0;
                                        const tPending = p1 + p2;
                                        if (tPending > 0) return <Text style={{ color: C.red, fontSize: 13, fontWeight: '700', marginTop: 4 }}>Pending: ₹{tPending}</Text>;
                                        return null;
                                    })()}
                                </View>
                                <View style={{ alignItems: 'flex-end' }}>
                                    {e.user.paymentRequired ? <Text style={styles.monthlyFee}>₹{monthly}/mo</Text> : <Text style={{ color: C.green, fontWeight: '700' }}>Exempt</Text>}
                                    <Text style={styles.historyLinkText}>View history →</Text>
                                </View>
                            </TouchableOpacity>
                        );
                    }}
                />
            )}
        </View>
    );
};

const BillRow = ({ label, fee, status, loading, onToggle }: { label: string; fee: number; status: 'Paid' | 'Pending'; loading: boolean; onToggle: () => void }) => (
    <TouchableOpacity style={[styles.billRow, status === 'Paid' && styles.billRowPaid]} onPress={onToggle} disabled={loading} activeOpacity={0.75}>
        <Text style={styles.billLabel}>{label}</Text>
        <Text style={styles.billFee}>₹{fee}</Text>
        {loading ? <ActivityIndicator size="small" color={C.orange} /> : status === 'Paid'
            ? <View style={styles.paidPill}><CheckCircle2 size={14} color={C.green} strokeWidth={2.5} /><Text style={styles.paidText}>Paid</Text></View>
            : <View style={styles.pendingPill}><Circle size={14} color={C.sub} strokeWidth={2} /><Text style={styles.pendingText}>Mark Paid</Text></View>
        }
    </TouchableOpacity>
);

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    topBar: { backgroundColor: C.card, padding: 16, borderBottomWidth: 1, borderBottomColor: C.border, gap: 12 },
    searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.bg, borderRadius: 12, paddingHorizontal: 12, height: 44, borderWidth: 1, borderColor: C.border },
    searchInput: { flex: 1, fontSize: 14, color: C.text, fontWeight: '600' },
    modeToggle: { flexDirection: 'row', backgroundColor: C.bg, borderRadius: 14, padding: 4, gap: 4 },
    modeBtn: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center' },
    modeBtnActive: { backgroundColor: C.card, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
    modeBtnText: { color: C.sub, fontWeight: '700', fontSize: 13 },
    modeBtnTextActive: { color: C.text, fontWeight: '800' },
    monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    navBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
    monthText: { fontSize: 17, fontWeight: '800', color: C.text },
    batchChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: C.bg, borderWidth: 1, borderColor: C.border },
    batchChipActive: { backgroundColor: '#FFF0E5', borderColor: C.orange },
    batchChipText: { color: C.sub, fontWeight: '600', fontSize: 13 },
    batchChipTextActive: { color: C.orange, fontWeight: '700' },
    viewModeTextActive: { color: C.text },
    filterChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
    filterChipActive: { backgroundColor: '#F3F4F6', borderColor: '#D1D5DB' },
    filterChipText: { fontSize: 13, fontWeight: '700', color: C.sub },
    batchRow: { flexDirection: 'row', padding: 12, backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border, gap: 8, maxHeight: 56 },
    summaryRow: { flexDirection: 'row', gap: 10, padding: 12, backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border },
    summCard: { flex: 1, borderRadius: 14, padding: 12, alignItems: 'center', gap: 4 },
    summAmt: { fontSize: 18, fontWeight: '900', letterSpacing: -0.5 },
    summLabel: { fontSize: 10, color: C.sub, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
    list: { padding: 16, paddingBottom: 80 },
    card: { backgroundColor: C.card, borderRadius: 20, marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2, overflow: 'hidden' },
    cardHeader: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 },
    avatar: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    avatarText: { fontSize: 18, fontWeight: '800' },
    name: { fontSize: 15, fontWeight: '700', color: C.text },
    memberSub: { fontSize: 12, color: C.sub, fontWeight: '500', marginTop: 2 },
    badge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#EEF0FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
    badgeText: { fontSize: 10, fontWeight: '700' },
    historyLink: {},
    historyLinkText: { color: C.orange, fontSize: 12, fontWeight: '700' },
    billRows: { borderTopWidth: 1, borderTopColor: C.border },
    billRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
    billRowPaid: { backgroundColor: '#FAFFFE' },
    billLabel: { flex: 1, fontSize: 14, fontWeight: '700', color: C.text },
    billFee: { fontSize: 16, fontWeight: '800', color: C.text, marginRight: 12 },
    paidPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#ECFDF5', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
    paidText: { color: C.green, fontWeight: '700', fontSize: 13 },
    pendingPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.bg, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: C.border },
    pendingText: { color: C.sub, fontWeight: '700', fontSize: 13 },
    exemptRow: { paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#F0FBF0', borderTopWidth: 1, borderTopColor: '#C8EFC8' },
    exemptText: { color: C.green, fontWeight: '700', fontSize: 13 },
    memberRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 18, padding: 16, marginBottom: 10, gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
    monthlyFee: { fontSize: 15, fontWeight: '800', color: C.text, marginBottom: 2 },
});

export default BillingScreen;
