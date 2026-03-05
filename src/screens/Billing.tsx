import React, { useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, FlatList,
    Alert, ActivityIndicator, RefreshControl, ScrollView, TextInput, Platform, StatusBar
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, addMonths } from 'date-fns';
import { ChevronLeft, ChevronRight, BookOpen, Ban, CheckCircle2, Circle, User as UserIcon, Star, Briefcase, Info, Search, PauseCircle } from 'lucide-react-native';
import { User, Billing, Session } from '../types';
import { getActiveUsers, getBillsByMonth, toggleBillStatus, getBadmintonSessions, getAttendanceCountByMonth } from '../lib/services';
import { RootStackParamList } from '../types/navigation';
import { useTheme } from '../contexts/ThemeContext';
type Nav = NativeStackNavigationProp<RootStackParamList>;
type ViewMode = 'month' | 'member' | 'batch';
type FilterStatus = 'All' | 'Paid' | 'Pending' | 'Suspended';
type BillEntry = { user: User; gymBill?: Billing; badmintonBill?: Billing; gymDays?: number; badDays?: number };

const BillingScreen = () => {
    const navigation = useNavigation<Nav>();
    const insets = useSafeAreaInsets();
    const safeTop = insets.top > 0 ? insets.top : Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 0;
    const { colors: C } = useTheme();
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
            const [users, bills, sess, attCounts] = await Promise.all([
                getActiveUsers(),
                getBillsByMonth(mv),
                getBadmintonSessions(),
                getAttendanceCountByMonth(format(d, 'yyyy-MM'))
            ]);
            const reqMonthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
            const reqTime = reqMonthEnd.getTime();

            const validUsers = users.filter(u => {
                let createdTime = 0;
                if (u.dateJoined) {
                    createdTime = new Date(u.dateJoined).getTime();
                } else if (u.createdAt) {
                    createdTime = u.createdAt?.toDate ? u.createdAt.toDate().getTime() :
                        (typeof u.createdAt === 'string' || typeof u.createdAt === 'number' ? new Date(u.createdAt).getTime() : 0);
                } else {
                    return true;
                }
                return createdTime <= reqTime;
            });

            const built: BillEntry[] = validUsers.map(u => ({
                user: u,
                gymBill: bills.find(b => b.userId === u.id && b.activityType === 'Gym'),
                badmintonBill: bills.find(b => b.userId === u.id && b.activityType === 'Badminton'),
                gymDays: attCounts.gym[u.id!] || 0,
                badDays: attCounts.badminton[u.id!] || 0,
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

    // Helper: whether a suspension is relevant to the month AND the member had zero activity (truly suspended whole month)
    const isGymTrulySuspended = (e: BillEntry) => {
        const monthStr = format(month, 'yyyy-MM-dd');
        return !!(e.user.gymSuspendedAt && e.user.gymSuspendedAt <= monthStr && (e.gymDays || 0) === 0);
    };
    const isBadTrulySuspended = (e: BillEntry) => {
        const monthStr = format(month, 'yyyy-MM-dd');
        return !!(e.user.badmintonSuspendedAt && e.user.badmintonSuspendedAt <= monthStr && (e.badDays || 0) === 0);
    };
    // Suspended but came at least once — still need to pay
    const isGymSuspendedButPlayed = (e: BillEntry) => {
        const monthStr = format(month, 'yyyy-MM-dd');
        return !!(e.user.gymSuspendedAt && e.user.gymSuspendedAt <= monthStr && (e.gymDays || 0) > 0);
    };
    const isBadSuspendedButPlayed = (e: BillEntry) => {
        const monthStr = format(month, 'yyyy-MM-dd');
        return !!(e.user.badmintonSuspendedAt && e.user.badmintonSuspendedAt <= monthStr && (e.badDays || 0) > 0);
    };

    // Apply payment status filter
    if (filterStatus !== 'All') {
        filteredEntries = filteredEntries.filter(e => {
            if (!e.user.paymentRequired) return false;

            const gymTrulySusp = isGymTrulySuspended(e);
            const badTrulySusp = isBadTrulySuspended(e);
            const gymSuspPlayed = isGymSuspendedButPlayed(e);
            const badSuspPlayed = isBadSuspendedButPlayed(e);

            const isGymPending = e.user.isGymMember && !gymTrulySusp && (e.gymDays || 0) > 0 && e.gymBill?.status !== 'Paid';
            const isBadmintonPending = e.user.isBadmintonMember && !badTrulySusp && (e.badDays || 0) > 0 && e.badmintonBill?.status !== 'Paid';
            const hasPending = isGymPending || isBadmintonPending;

            if (filterStatus === 'Suspended') {
                return (e.user.isGymMember && gymTrulySusp) || (e.user.isBadmintonMember && badTrulySusp);
            }
            const isSuspended = (e.user.isGymMember && gymTrulySusp) || (e.user.isBadmintonMember && badTrulySusp);
            return filterStatus === 'Pending' ? hasPending : !hasPending && !isSuspended;
        });
    }

    const totalCollected = filteredEntries.reduce((s, e) => {
        // Suspended but played → still counts towards collected if paid
        const gymTrulySusp = isGymTrulySuspended(e);
        const badTrulySusp = isBadTrulySuspended(e);
        return s
            + (!gymTrulySusp && e.gymBill?.status === 'Paid' ? e.gymBill.amount : 0)
            + (!badTrulySusp && e.badmintonBill?.status === 'Paid' ? e.badmintonBill.amount : 0);
    }, 0);

    const totalPending = filteredEntries.reduce((s, e) => {
        const gymTrulySusp = isGymTrulySuspended(e);
        const badTrulySusp = isBadTrulySuspended(e);
        return s
            + (e.user.isGymMember && e.user.paymentRequired && !gymTrulySusp && (e.gymDays || 0) > 0 && e.gymBill?.status !== 'Paid' ? (e.user.gymFee || 0) : 0)
            + (e.user.isBadmintonMember && e.user.paymentRequired && !badTrulySusp && (e.badDays || 0) > 0 && e.badmintonBill?.status !== 'Paid' ? (e.user.badmintonFee || 0) : 0);
    }, 0);
    const totalPayable = filteredEntries.filter(e => e.user.paymentRequired).length;

    const actColor = (u: User) => u.isGymMember && u.isBadmintonMember ? C.purple : u.isGymMember ? C.green : C.orange;

    const renderEntry = ({ item: e }: { item: BillEntry }) => {
        const gc = actColor(e.user);
        const isExempt = !e.user.paymentRequired;
        return (
            <View style={{ backgroundColor: C.card, borderRadius: 20, marginBottom: 12, shadowColor: C.cardShadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2, overflow: 'hidden' }}>
                <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12 }} onPress={() => navigation.navigate('UserBilling', { userId: e.user.id!, userName: e.user.fullName })} activeOpacity={0.7}>
                    <View style={{ width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: `${gc}18` }}>
                        <Text style={{ fontSize: 18, fontWeight: '800', color: gc }}>{e.user.fullName.charAt(0)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <Text style={{ fontSize: 15, fontWeight: '700', color: C.text }}>{e.user.fullName}</Text>
                            {e.user.isStudent && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#EEF0FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}><BookOpen size={9} color={C.purple} strokeWidth={2.5} /><Text style={{ fontSize: 10, fontWeight: '700', color: C.purple }}>Student</Text></View>}
                            {isExempt && (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: e.user.exemptCategory === 'Priest' ? '#FFFBEB' : e.user.exemptCategory === 'Faculty' ? '#F0F9FF' : '#F5F5F5', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                                    {e.user.exemptCategory === 'Priest' ? <Star size={9} color={C.gold} strokeWidth={2.5} /> :
                                        e.user.exemptCategory === 'Faculty' ? <Briefcase size={9} color={C.blue} strokeWidth={2.5} /> :
                                            <Info size={9} color={C.sub} strokeWidth={2.5} />}
                                    <Text style={{ fontSize: 10, fontWeight: '700', color: e.user.exemptCategory === 'Priest' ? C.gold : e.user.exemptCategory === 'Faculty' ? C.blue : C.sub }}>
                                        {e.user.exemptCategory || 'Exempt'}
                                    </Text>
                                </View>
                            )}
                        </View>
                        <Text style={{ fontSize: 12, color: C.sub, fontWeight: '500', marginTop: 2 }}>{e.user.phoneNumber}</Text>

                        {(viewMode === 'member' && filterStatus === 'Pending' && e.user.paymentRequired) && (() => {
                            const isGymSuspendedThisMonth = e.user.gymSuspendedAt && e.user.gymSuspendedAt <= format(month, 'yyyy-MM-dd');
                            const isBadSuspendedThisMonth = e.user.badmintonSuspendedAt && e.user.badmintonSuspendedAt <= format(month, 'yyyy-MM-dd');
                            const p1 = e.user.isGymMember && !isGymSuspendedThisMonth && (e.gymDays || 0) > 0 && e.gymBill?.status !== 'Paid' ? (e.user.gymFee || 0) : 0;
                            const p2 = e.user.isBadmintonMember && !isBadSuspendedThisMonth && (e.badDays || 0) > 0 && e.badmintonBill?.status !== 'Paid' ? (e.user.badmintonFee || 0) : 0;
                            const tPending = p1 + p2;
                            if (tPending > 0) return <Text style={{ color: C.red, fontSize: 13, fontWeight: '700', marginTop: 4 }}>Pending: ₹{tPending}</Text>;
                            return null;
                        })()}
                    </View>
                    <Text style={{ color: C.orange, fontSize: 12, fontWeight: '700' }}>History →</Text>
                </TouchableOpacity>

                {isExempt ? (
                    <View style={{ paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#F0FBF0', borderTopWidth: 1, borderTopColor: '#C8EFC8' }}><Text style={{ color: C.green, fontWeight: '700', fontSize: 13 }}>Fee Exempt — No charge this month</Text></View>
                ) : (
                    <View style={{ borderTopWidth: 1, borderTopColor: C.border }}>
                        {e.user.isGymMember && (viewMode !== 'batch' || selectedBatch === 'Gym') && (
                            isGymTrulySuspended(e) ? (
                                <SuspendedRow label="🏋️ Gym" colors={C} />
                            ) : isGymSuspendedButPlayed(e) ? (
                                <BillRow label="🏋️ Gym" fee={e.user.gymFee} status={e.gymBill?.status || 'Pending'} loading={toggling === `${e.user.id}_Gym`} onToggle={() => handleToggle(e, 'Gym')} days={e.gymDays} suspendedButPlayed colors={C} />
                            ) : (e.gymDays || 0) === 0 ? (
                                <ZeroDaysRow label="🏋️ Gym" colors={C} />
                            ) : (
                                <BillRow label="🏋️ Gym" fee={e.user.gymFee} status={e.gymBill?.status || 'Pending'} loading={toggling === `${e.user.id}_Gym`} onToggle={() => handleToggle(e, 'Gym')} days={e.gymDays} colors={C} />
                            )
                        )}
                        {e.user.isBadmintonMember && (viewMode !== 'batch' || selectedBatch !== 'Gym') && (
                            isBadTrulySuspended(e) ? (
                                <SuspendedRow label={viewMode === 'batch' ? '🏸 Badminton Batch' : '🏸 Badminton'} colors={C} />
                            ) : isBadSuspendedButPlayed(e) ? (
                                <BillRow label={viewMode === 'batch' ? '🏸 Badminton Batch' : '🏸 Badminton'} fee={e.user.badmintonFee} status={e.badmintonBill?.status || 'Pending'} loading={toggling === `${e.user.id}_Badminton`} onToggle={() => handleToggle(e, 'Badminton')} days={e.badDays} suspendedButPlayed colors={C} />
                            ) : (e.badDays || 0) === 0 ? (
                                <ZeroDaysRow label={viewMode === 'batch' ? '🏸 Badminton Batch' : '🏸 Badminton'} colors={C} />
                            ) : (
                                <BillRow label={viewMode === 'batch' ? '🏸 Badminton Batch' : '🏸 Badminton'} fee={e.user.badmintonFee} status={e.badmintonBill?.status || 'Pending'} loading={toggling === `${e.user.id}_Badminton`} onToggle={() => handleToggle(e, 'Badminton')} days={e.badDays} colors={C} />
                            )
                        )}
                    </View>
                )}
            </View>
        );
    };

    return (
        <View style={{ flex: 1, backgroundColor: C.bg }}>
            {/* Header */}
            <View style={{ backgroundColor: C.card, padding: 16, borderBottomWidth: 1, borderBottomColor: C.border, gap: 12, paddingTop: safeTop }}>
                {/* Month Row */}
                {(viewMode === 'month' || viewMode === 'batch') && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <TouchableOpacity style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: C.inputBg, alignItems: 'center', justifyContent: 'center' }} onPress={() => setMonth(addMonths(month, -1))}>
                            <ChevronLeft size={20} color={C.text} strokeWidth={2.5} />
                        </TouchableOpacity>
                        <Text style={{ fontSize: 17, fontWeight: '800', color: C.text }}>{format(month, 'MMMM yyyy')}</Text>
                        <TouchableOpacity style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: C.inputBg, alignItems: 'center', justifyContent: 'center' }} onPress={() => setMonth(addMonths(month, 1))}>
                            <ChevronRight size={20} color={C.text} strokeWidth={2.5} />
                        </TouchableOpacity>
                    </View>
                )}

                {/* View mode toggle */}
                <View style={{ flexDirection: 'row', backgroundColor: C.inputBg, borderRadius: 14, padding: 4, gap: 4, marginTop: (viewMode === 'month' || viewMode === 'batch') ? 16 : 0 }}>
                    {(['month', 'batch', 'member'] as ViewMode[]).map(m => (
                        <TouchableOpacity key={m} style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center', backgroundColor: viewMode === m ? C.card : 'transparent' }} onPress={() => setViewMode(m)}>
                            <Text style={{ color: viewMode === m ? C.text : C.sub, fontWeight: viewMode === m ? '800' : '700', fontSize: 13 }}>{m === 'month' ? 'By Month' : m === 'batch' ? 'By Batch' : 'By Member'}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            {/* Filter Status row */}
            <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 12, paddingTop: 12 }}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    {(['All', 'Paid', 'Pending', 'Suspended'] as FilterStatus[]).map(s => (
                        <TouchableOpacity key={s} onPress={() => setFilterStatus(s)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: filterStatus === s ? C.card : C.inputBg, borderWidth: 1, borderColor: filterStatus === s ? C.border : C.border }} activeOpacity={0.7}>
                            {s === 'Paid' && <CheckCircle2 size={12} color={filterStatus === s ? C.green : C.sub} strokeWidth={2.5} />}
                            {s === 'Pending' && <Circle size={12} color={filterStatus === s ? C.orange : C.sub} strokeWidth={2.5} />}
                            {s === 'Suspended' && <PauseCircle size={12} color={filterStatus === s ? '#92400E' : C.sub} strokeWidth={2.5} />}
                            <Text style={{ fontSize: 13, fontWeight: '700', color: filterStatus === s ? (s === 'Paid' ? C.green : s === 'Pending' ? C.orange : s === 'Suspended' ? '#92400E' : C.text) : C.sub }}>{s}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>

            {/* Member Search */}
            {viewMode === 'member' && (
                <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.inputBg, borderRadius: 12, paddingHorizontal: 12, height: 44, borderWidth: 1, borderColor: C.border }}>
                        <Search size={16} color={C.sub} style={{ marginRight: 8 }} />
                        <TextInput style={{ flex: 1, fontSize: 14, color: C.text, fontWeight: '600' }} placeholder="Search by name or number" placeholderTextColor={C.sub} value={memberSearchQuery} onChangeText={setMemberSearchQuery} />
                    </View>
                </View>
            )}

            {/* Batch sub-tabs */}
            {viewMode === 'batch' && (
                <View style={{ marginTop: 8, marginBottom: 4 }}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
                        <TouchableOpacity style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: selectedBatch === 'Gym' ? '#FFF0E5' : C.inputBg, borderWidth: 1, borderColor: selectedBatch === 'Gym' ? C.orange : C.border }} onPress={() => setSelectedBatch('Gym')}>
                            <Text style={{ color: selectedBatch === 'Gym' ? C.orange : C.sub, fontWeight: selectedBatch === 'Gym' ? '700' : '600', fontSize: 13 }}>🏋️ Gym</Text>
                        </TouchableOpacity>
                        {sessions.map(s => (
                            <TouchableOpacity key={s.id} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: selectedBatch === s.id ? '#FFF0E5' : C.inputBg, borderWidth: 1, borderColor: selectedBatch === s.id ? C.orange : C.border }} onPress={() => setSelectedBatch(s.id!)}>
                                <Text style={{ color: selectedBatch === s.id ? C.orange : C.sub, fontWeight: selectedBatch === s.id ? '700' : '600', fontSize: 13 }}>🏸 {s.name}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>
            )}

            {/* Summary */}
            <View style={{ flexDirection: 'row', gap: 10, padding: 12, backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border }}>
                <View style={{ flex: 1, borderRadius: 14, padding: 12, alignItems: 'center', gap: 4, backgroundColor: '#ECFDF5' }}>
                    <CheckCircle2 size={16} color={C.green} strokeWidth={2.5} />
                    <Text style={{ fontSize: 18, fontWeight: '900', letterSpacing: -0.5, color: C.green }}>₹{totalCollected}</Text>
                    <Text style={{ fontSize: 10, color: C.sub, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>Collected</Text>
                </View>
                <View style={{ flex: 1, borderRadius: 14, padding: 12, alignItems: 'center', gap: 4, backgroundColor: totalPending > 0 ? '#FFF7ED' : '#ECFDF5' }}>
                    <Circle size={16} color={totalPending > 0 ? '#F59E0B' : C.green} strokeWidth={2.5} />
                    <Text style={{ fontSize: 18, fontWeight: '900', letterSpacing: -0.5, color: totalPending > 0 ? '#F59E0B' : C.green }}>₹{totalPending}</Text>
                    <Text style={{ fontSize: 10, color: C.sub, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>Pending</Text>
                </View>
                <View style={{ flex: 1, borderRadius: 14, padding: 12, alignItems: 'center', gap: 4, backgroundColor: '#F5F3FF' }}>
                    <UserIcon size={16} color={C.purple} strokeWidth={2.5} />
                    <Text style={{ fontSize: 18, fontWeight: '900', letterSpacing: -0.5, color: C.purple }}>{totalPayable}</Text>
                    <Text style={{ fontSize: 10, color: C.sub, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>Payable</Text>
                </View>
            </View>

            {loading ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={C.orange} /></View>
            ) : viewMode === 'month' || viewMode === 'batch' ? (
                <FlatList
                    data={filteredEntries}
                    keyExtractor={i => i.user.id || ''}
                    renderItem={renderEntry}
                    contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
                    showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl refreshing={loading} onRefresh={() => load(month)} colors={[C.orange]} />}
                    ListEmptyComponent={<View style={{ alignItems: 'center', paddingTop: 60 }}><Text style={{ color: C.sub, fontSize: 15 }}>No members found.</Text></View>}
                />
            ) : (
                // By Member
                <FlatList
                    data={filteredEntries}
                    keyExtractor={i => i.user.id || ''}
                    contentContainerStyle={{ padding: 16, paddingBottom: 80 }}
                    showsVerticalScrollIndicator={false}
                    renderItem={({ item: e }) => {
                        const gc = actColor(e.user);
                        const gymAmt = e.user.gymFee || 0;
                        const badAmt = e.user.badmintonFee || 0;
                        return (
                            <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 18, padding: 16, marginBottom: 10, gap: 12, shadowColor: C.cardShadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 }} activeOpacity={0.75} onPress={() => navigation.navigate('UserBilling', { userId: e.user.id!, userName: e.user.fullName })}>
                                <View style={{ width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: `${gc}18` }}>
                                    <Text style={{ fontSize: 18, fontWeight: '800', color: gc }}>{e.user.fullName.charAt(0)}</Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: 15, fontWeight: '700', color: C.text }}>{e.user.fullName}</Text>
                                    <Text style={{ fontSize: 12, color: C.sub, fontWeight: '500', marginTop: 2 }}>{e.user.isGymMember && e.user.isBadmintonMember ? 'Gym + Badminton' : e.user.isGymMember ? 'Gym Only' : 'Badminton Only'}</Text>
                                    {(viewMode === 'member' && filterStatus === 'Pending' && e.user.paymentRequired) && (() => {
                                        const isGymSuspendedThisMonth = e.user.gymSuspendedAt && e.user.gymSuspendedAt <= format(month, 'yyyy-MM-dd');
                                        const isBadSuspendedThisMonth = e.user.badmintonSuspendedAt && e.user.badmintonSuspendedAt <= format(month, 'yyyy-MM-dd');
                                        const p1 = e.user.isGymMember && !isGymSuspendedThisMonth && (e.gymDays || 0) > 0 && e.gymBill?.status !== 'Paid' ? (e.user.gymFee || 0) : 0;
                                        const p2 = e.user.isBadmintonMember && !isBadSuspendedThisMonth && (e.badDays || 0) > 0 && e.badmintonBill?.status !== 'Paid' ? (e.user.badmintonFee || 0) : 0;
                                        const tPending = p1 + p2;
                                        if (tPending > 0) return <Text style={{ color: C.red, fontSize: 13, fontWeight: '700', marginTop: 4 }}>Pending: ₹{tPending}</Text>;
                                        return null;
                                    })()}
                                </View>
                                <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                                    {e.user.paymentRequired ? (() => {
                                        const isGymSuspendedThisMonth = e.user.gymSuspendedAt && e.user.gymSuspendedAt <= format(month, 'yyyy-MM-dd');
                                        const isBadSuspendedThisMonth = e.user.badmintonSuspendedAt && e.user.badmintonSuspendedAt <= format(month, 'yyyy-MM-dd');
                                        const curGymAmt = !isGymSuspendedThisMonth && (e.gymDays || 0) > 0 ? gymAmt : 0;
                                        const curBadAmt = !isBadSuspendedThisMonth && (e.badDays || 0) > 0 ? badAmt : 0;
                                        const totalCurMonthly = curGymAmt + curBadAmt;
                                        const fullySuspended = (e.user.isGymMember ? isGymSuspendedThisMonth : true) && (e.user.isBadmintonMember ? isBadSuspendedThisMonth : true);
                                        const fullyZero = (e.user.isGymMember ? !isGymSuspendedThisMonth && (e.gymDays || 0) === 0 : true) && (e.user.isBadmintonMember ? !isBadSuspendedThisMonth && (e.badDays || 0) === 0 : true);
                                        if (fullySuspended) return <View style={{ backgroundColor: '#FFFBEB', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginBottom: 4 }}><Text style={{ color: '#92400E', fontWeight: '800', fontSize: 12 }}>Suspended</Text></View>;
                                        if (fullyZero) return <View style={{ backgroundColor: C.pillBg, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, marginBottom: 4 }}><Text style={{ color: C.sub, fontWeight: '800', fontSize: 12 }}>0 Days Present</Text></View>;
                                        return <Text style={{ fontSize: 15, fontWeight: '800', color: C.text, marginBottom: 2 }}>₹{totalCurMonthly}/mo</Text>;
                                    })() : <Text style={{ color: C.green, fontWeight: '700' }}>Exempt</Text>}
                                    <Text style={{ color: C.orange, fontSize: 12, fontWeight: '700' }}>View history →</Text>
                                </View>
                            </TouchableOpacity>
                        );
                    }}
                />
            )}
        </View>
    );
};

const SuspendedRow = ({ label, colors: C }: { label: string; colors: any }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.inputBg }}>
        <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: C.text }}>{label}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#FFFBEB', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 }}>
            <PauseCircle size={13} color='#92400E' strokeWidth={2.5} />
            <Text style={{ color: '#92400E', fontWeight: '700', fontSize: 12 }}>Not played / Suspended</Text>
        </View>
    </View>
);

const ZeroDaysRow = ({ label, colors: C }: { label: string; colors: any }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.inputBg }}>
        <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: C.text }}>{label}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.pillBg, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 }}>
            <Info size={13} color={C.sub} strokeWidth={2.5} />
            <Text style={{ color: C.sub, fontWeight: '700', fontSize: 12 }}>0 Days Present - No fee</Text>
        </View>
    </View>
);

const BillRow = ({ label, fee, status, loading, onToggle, days, suspendedButPlayed, colors: C }: { label: string; fee: number; status: 'Paid' | 'Pending'; loading: boolean; onToggle: () => void; days?: number; suspendedButPlayed?: boolean; colors: any }) => (
    <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: status === 'Paid' ? '#FAFFFE' : C.card }} onPress={onToggle} disabled={loading} activeOpacity={0.75}>
        <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: C.text }}>{label}</Text>
                {suspendedButPlayed && (
                    <View style={{ backgroundColor: '#FFFBEB', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 }}>
                        <Text style={{ fontSize: 10, fontWeight: '800', color: '#92400E' }}>Suspended but played</Text>
                    </View>
                )}
            </View>
            {days !== undefined && <Text style={{ fontSize: 12, color: C.sub, marginTop: 2, fontWeight: '600' }}>{days} days present</Text>}
        </View>
        <Text style={{ fontSize: 16, fontWeight: '800', color: C.text, marginRight: 12 }}>₹{fee}</Text>
        {loading ? <ActivityIndicator size="small" color={C.orange} /> : status === 'Paid'
            ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#ECFDF5', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 }}><CheckCircle2 size={14} color={C.green} strokeWidth={2.5} /><Text style={{ color: C.green, fontWeight: '700', fontSize: 13 }}>Paid</Text></View>
            : <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.pillBg, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: C.border }}><Circle size={14} color={C.sub} strokeWidth={2} /><Text style={{ color: C.sub, fontWeight: '700', fontSize: 13 }}>Mark Paid</Text></View>
        }
    </TouchableOpacity>
);

export default BillingScreen;
