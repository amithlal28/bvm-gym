import React, { useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView,
    Alert, ActivityIndicator, TextInput, Modal, Platform, StatusBar
} from 'react-native';
import { createElement } from 'react';
import { useFocusEffect, useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { format, subDays, addDays } from 'date-fns';
import { ChevronLeft, ChevronRight, Check, X, BookOpen, Ban, AlertTriangle, CheckCircle2, Star, Briefcase, Info, Calendar as CalendarIcon, PauseCircle } from 'lucide-react-native';
import { AppDatePicker } from '../components/AppDatePicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { User, Session } from '../types';
import { getActiveUsers, getAttendanceByDateSession, saveAttendanceBatch, getBadmintonSessions, getSuspensionsForDate, suspendBatch, unsuspendBatch, GYM_DEFAULT_SESSION_ID, toggleAttendance, autoSuspendAbsentMembers } from '../lib/services';
import { RootStackParamList } from '../types/navigation';
import AppModal from '../components/AppModal';
import { useTheme } from '../contexts/ThemeContext';

import { useMemo } from 'react';

const AttendanceScreen = () => {
    const route = useRoute<RouteProp<RootStackParamList, 'Attend'>>();
    const navigation = useNavigation();
    const insets = useSafeAreaInsets();
    const safeTop = insets.top > 0 ? insets.top : Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 0;
    const { colors: C } = useTheme();
    const styles = useMemo(() => makeStyles(C), [C]);
    const [date, setDate] = useState<Date>(new Date());
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const [sessions, setSessions] = useState<Session[]>([]);
    const [att, setAtt] = useState<Record<string, boolean>>({});
    const [suspensions, setSuspensions] = useState<string[]>([]); // suspended sessionIds for date
    const [loading, setLoading] = useState(true);
    const [mainTab, setMainTab] = useState<'Gym' | 'Badminton'>('Gym');
    const [selectedBatch, setSelectedBatch] = useState<string>(GYM_DEFAULT_SESSION_ID);
    const [suspendModal, setSuspendModal] = useState(false);
    const [suspendReason, setSuspendReason] = useState('');
    const [showPicker, setShowPicker] = useState(false);
    const [autoSuspendedModal, setAutoSuspendedModal] = useState(false);
    const [autoSuspendedList, setAutoSuspendedList] = useState<{ name: string; activity: string }[]>([]);
    const [unsuspendModal, setUnsuspendModal] = useState(false);

    const isSun = (d: Date) => d.getDay() === 0;

    useFocusEffect(useCallback(() => {
        let d = new Date();
        if (isSun(d)) d = subDays(d, 1);
        setDate(d);

        // ONLY act if there's an explicit tab parameter passed.
        // If no parameter, we keep the previous state (which defaults to Gym on mount)
        if (route.params?.tab) {
            const targetTab = route.params.tab;
            let targetBatch = GYM_DEFAULT_SESSION_ID;

            if (targetTab === 'Badminton') {
                if (sessions.length > 0) {
                    targetBatch = sessions[0].id || '';
                } else {
                    targetBatch = ''; // Force it to empty so loadAll selects the first badminton batch
                }
            }

            setMainTab(targetTab);
            setSelectedBatch(targetBatch);

            // Clear the params so subsequent focus events (without params) don't trigger this again
            navigation.setParams({ tab: undefined } as any);

            // Only trigger loadAll if we are changing something or it's a fresh focus with params
            loadAll(d, targetTab, targetBatch);
        } else if (allUsers.length === 0) {
            // Initial load if no params and no data yet
            loadAll(d, mainTab, selectedBatch);
        }

        runAutoSuspendCheck();
    }, [route.params?.tab]));

    const runAutoSuspendCheck = async () => {
        try {
            const suspended = await autoSuspendAbsentMembers();
            if (suspended.length > 0) {
                setAutoSuspendedList(suspended.map(s => ({ name: s.name, activity: s.activity })));
                setAutoSuspendedModal(true);
            }
        } catch (_) { /* Silent fail for auto-suspend check */ }
    };

    const loadAll = async (d: Date, targetTab?: 'Gym' | 'Badminton', targetBatch?: string) => {
        const activeTab = targetTab || mainTab;
        if (isSun(d)) { setLoading(false); return; }
        try {
            setLoading(true);
            const ds = format(d, 'yyyy-MM-dd');
            const [users, batches, susps] = await Promise.all([
                getActiveUsers(), getBadmintonSessions(), getSuspensionsForDate(ds)
            ]);
            setAllUsers(users);
            setSessions(batches);
            setSuspensions(susps.map(s => s.sessionId));

            let finalBatch = targetBatch || selectedBatch;
            if (activeTab === 'Badminton' && batches.length > 0 && !batches.find(b => b.id === finalBatch)) {
                finalBatch = batches[0].id || '';
            }
            if (activeTab === 'Gym') finalBatch = GYM_DEFAULT_SESSION_ID;

            setSelectedBatch(finalBatch);
            await loadAttendance(d, finalBatch, users);
        } catch (e: any) { Alert.alert('Error', e.message); }
        finally { setLoading(false); }
    };

    const loadAttendance = async (d: Date, sessionId: string, users?: User[]) => {
        const ds = format(d, 'yyyy-MM-dd');
        const u = users || allUsers;
        const existing = await getAttendanceByDateSession(ds, sessionId);
        const map: Record<string, boolean> = {};

        const reqDateEnd = new Date(d);
        reqDateEnd.setHours(23, 59, 59, 999);
        const reqTime = reqDateEnd.getTime();

        u.forEach(user => {
            if (!user.id) return;

            if (user.dateJoined) {
                const createdTime = new Date(user.dateJoined).getTime();
                if (createdTime > reqTime) return;
            } else if (user.createdAt) {
                const createdTime = user.createdAt?.toDate ? user.createdAt.toDate().getTime() :
                    (typeof user.createdAt === 'string' || typeof user.createdAt === 'number' ? new Date(user.createdAt).getTime() : 0);
                if (createdTime > reqTime) return;
            }

            const isGymSession = sessionId === GYM_DEFAULT_SESSION_ID;
            const isRelevant = isGymSession
                ? user.isGymMember
                : user.isBadmintonMember && user.badmintonSessionId === sessionId;

            if (!isRelevant) return;

            // ── Exclude suspended members from attendance on or after suspension date ──
            if (isGymSession && user.gymSuspendedAt && user.gymSuspendedAt <= ds) return;
            if (!isGymSession && user.badmintonSuspendedAt && user.badmintonSuspendedAt <= ds) return;

            map[user.id] = false;
        });
        existing.forEach(a => { if (a.userId in map) map[a.userId] = a.isPresent; });
        setAtt(map);
    };

    const switchSession = async (sessionId: string, tab: 'Gym' | 'Badminton') => {
        setSelectedBatch(sessionId);
        setMainTab(tab);
        await loadAttendance(date, sessionId);
    };

    const changeDay = (n: number) => {
        let d = addDays(date, n);
        if (isSun(d)) d = addDays(d, n > 0 ? 1 : -1);
        setDate(d); loadAll(d);
    };

    const handleDateChange = (e: any) => {
        const val = e.target?.value;
        if (!val) return;
        const newD = new Date(val);
        newD.setHours(12);
        if (isSun(newD)) { Alert.alert('Sunday', 'Gym is closed on Sundays.'); return; }
        setDate(newD); loadAll(newD);
    };

    const handleNativeDateChange = (selectedDate: Date) => {
        setShowPicker(false);
        if (isSun(selectedDate)) { Alert.alert('Sunday', 'Gym is closed on Sundays.'); return; }
        setDate(selectedDate); loadAll(selectedDate);
    };

    const toggle = async (id: string) => {
        const sid = mainTab === 'Gym' ? GYM_DEFAULT_SESSION_ID : selectedBatch;
        const currentStatus = att[id] || false;
        setAtt(p => ({ ...p, [id]: !currentStatus }));
        try {
            await toggleAttendance(format(date, 'yyyy-MM-dd'), sid, id, !currentStatus);
        } catch (e: any) {
            Alert.alert('Auto-Save Error', e.message);
            setAtt(p => ({ ...p, [id]: currentStatus }));
        }
    };

    const markAll = async (val: boolean) => {
        const sid = mainTab === 'Gym' ? GYM_DEFAULT_SESSION_ID : selectedBatch;
        const oldState = { ...att };
        setAtt(p => { const n = { ...p }; Object.keys(n).forEach(k => n[k] = val); return n; });
        try {
            const records = Object.keys(oldState).map(userId => ({ userId, isPresent: val }));
            await saveAttendanceBatch(format(date, 'yyyy-MM-dd'), sid, records);
        } catch (e: any) {
            Alert.alert('Auto-Save Error', e.message);
            setAtt(oldState);
        }
    };

    const handleSuspend = async () => {
        const sid = mainTab === 'Gym' ? GYM_DEFAULT_SESSION_ID : selectedBatch;
        try {
            await suspendBatch(sid, format(date, 'yyyy-MM-dd'), suspendReason);
            setSuspensions(prev => [...prev, sid]);
            setSuspendModal(false);
            setSuspendReason('');
        } catch (e: any) { Alert.alert('Error', e.message); }
    };

    const handleUnsuspend = async () => {
        const sid = mainTab === 'Gym' ? GYM_DEFAULT_SESSION_ID : selectedBatch;
        await unsuspendBatch(sid, format(date, 'yyyy-MM-dd'));
        setSuspensions(prev => prev.filter(s => s !== sid));
    };

    if (isSun(date)) return (
        <View style={[styles.container, styles.centerContent]}>
            <View style={[styles.sundayCard, { marginTop: safeTop + 20 }]}>
                <Text style={{ fontSize: 48, marginBottom: 12 }}>🌞</Text>
                <Text style={styles.sundayTitle}>Closed on Sunday</Text>
                <Text style={styles.sundaySub}>No attendance tracking today</Text>
                <TouchableOpacity style={styles.prevDayBtn} onPress={() => changeDay(-1)}>
                    <Text style={styles.prevDayText}>Go to Saturday</Text>
                </TouchableOpacity>
            </View>
        </View>
    );

    const currentSid = mainTab === 'Gym' ? GYM_DEFAULT_SESSION_ID : selectedBatch;
    const isSuspended = suspensions.includes(currentSid);
    const currentMembers = Object.keys(att);
    const presentCount = currentMembers.filter(k => att[k]).length;
    const absentCount = currentMembers.filter(k => !att[k]).length;
    const total = currentMembers.length;

    // Count of suspended members for the info chip
    const gymSuspendedCount = allUsers.filter(u => u.isGymMember && u.gymSuspendedAt).length;
    const badSuspendedCount = allUsers.filter(u => u.isBadmintonMember && u.badmintonSuspendedAt).length;

    return (
        <View style={styles.container}>
            {/* Date Navigator */}
            <View style={[styles.dateNav, { paddingTop: safeTop }]}>
                <TouchableOpacity style={styles.navBtn} onPress={() => changeDay(-1)}>
                    <ChevronLeft size={20} color={C.text} strokeWidth={2.5} />
                </TouchableOpacity>
                <TouchableOpacity style={{ alignItems: 'center', position: 'relative' }} onPress={() => Platform.OS !== 'web' && setShowPicker(true)} activeOpacity={0.7}>
                    <Text style={styles.dayName}>{format(date, 'EEEE')}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.dayDate}>{format(date, 'MMMM d, yyyy')}</Text>
                        <CalendarIcon size={14} color={C.orange} strokeWidth={2.5} />
                    </View>
                    {Platform.OS === 'web' && createElement('input', {
                        type: 'date', value: format(date, 'yyyy-MM-dd'), max: format(new Date(), 'yyyy-MM-dd'), onChange: handleDateChange,
                        style: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }
                    })}
                </TouchableOpacity>
                <TouchableOpacity style={[styles.navBtn, date >= new Date() && { opacity: 0.3 }]} onPress={() => changeDay(1)} disabled={date >= new Date()}>
                    <ChevronRight size={20} color={C.text} strokeWidth={2.5} />
                </TouchableOpacity>
            </View>

            {showPicker && (
                <AppDatePicker
                    visible={showPicker}
                    initialDate={date}
                    maximumDate={new Date()}
                    disabledDays={[0]}
                    onClose={() => setShowPicker(false)}
                    onConfirm={handleNativeDateChange}
                />
            )}

            {/* Gym / Badminton Tabs */}
            <View style={styles.mainTabs}>
                <TouchableOpacity style={[styles.mainTab, mainTab === 'Gym' && styles.mainTabActive]} onPress={() => switchSession(GYM_DEFAULT_SESSION_ID, 'Gym')} activeOpacity={0.8}>
                    <Text style={{ fontSize: 14 }}>🏋️</Text>
                    <Text style={[styles.mainTabText, mainTab === 'Gym' && styles.mainTabTextActive]}>Gym</Text>
                    <View style={[styles.tabCount, { backgroundColor: mainTab === 'Gym' ? C.green : '#E9E9EB' }]}>
                        <Text style={[styles.tabCountText, { color: mainTab === 'Gym' ? '#fff' : C.sub }]}>
                            {allUsers.filter(u => u.isGymMember && !u.gymSuspendedAt).length}
                        </Text>
                    </View>
                    {gymSuspendedCount > 0 && (
                        <View style={styles.suspChip}>
                            <PauseCircle size={10} color="#92400E" strokeWidth={2.5} />
                            <Text style={styles.suspChipText}>{gymSuspendedCount}</Text>
                        </View>
                    )}
                </TouchableOpacity>
                <TouchableOpacity style={[styles.mainTab, mainTab === 'Badminton' && styles.mainTabActive]} onPress={() => { if (sessions.length > 0) switchSession(sessions[0].id || '', 'Badminton'); }} activeOpacity={0.8}>
                    <Text style={{ fontSize: 14 }}>🏸</Text>
                    <Text style={[styles.mainTabText, mainTab === 'Badminton' && styles.mainTabTextActive]}>Badminton</Text>
                    <View style={[styles.tabCount, { backgroundColor: mainTab === 'Badminton' ? C.orange : '#E9E9EB' }]}>
                        <Text style={[styles.tabCountText, { color: mainTab === 'Badminton' ? '#fff' : C.sub }]}>
                            {allUsers.filter(u => u.isBadmintonMember && !u.badmintonSuspendedAt).length}
                        </Text>
                    </View>
                    {badSuspendedCount > 0 && (
                        <View style={styles.suspChip}>
                            <PauseCircle size={10} color="#92400E" strokeWidth={2.5} />
                            <Text style={styles.suspChipText}>{badSuspendedCount}</Text>
                        </View>
                    )}
                </TouchableOpacity>
            </View>

            {/* Batch Sub-tabs */}
            {mainTab === 'Badminton' && (
                <View style={styles.batchRow}>
                    {sessions.map(s => (
                        <TouchableOpacity key={s.id} style={[styles.batchChip, selectedBatch === s.id && styles.batchChipActive]} onPress={() => switchSession(s.id || '', 'Badminton')} activeOpacity={0.8}>
                            {suspensions.includes(s.id || '') && <AlertTriangle size={11} color={C.red} strokeWidth={2.5} />}
                            <Text style={[styles.batchChipText, selectedBatch === s.id && styles.batchChipTextActive]}>{s.name}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )}

            {/* Suspended Banner (batch suspension) */}
            {isSuspended && (
                <TouchableOpacity style={styles.suspendBanner} onPress={() => setUnsuspendModal(true)} activeOpacity={0.8}>
                    <AlertTriangle size={16} color="#fff" strokeWidth={2.5} />
                    <Text style={styles.suspendBannerText}>This batch is suspended for today — tap to remove</Text>
                </TouchableOpacity>
            )}

            {/* Stats + Action Bar */}
            <View style={styles.actionBar}>
                <View style={styles.statsRow}>
                    <View style={styles.statPill}><CheckCircle2 size={14} color={C.green} strokeWidth={2.5} /><Text style={[styles.statText, { color: C.green }]}>{presentCount}</Text></View>
                    <View style={[styles.statPill, { backgroundColor: '#FFF0F0' }]}><X size={14} color={C.red} strokeWidth={2.5} /><Text style={[styles.statText, { color: C.red }]}>{absentCount}</Text></View>
                    <Text style={styles.totalText}>{total} active</Text>
                </View>
                <View style={styles.actionBtns}>
                    <TouchableOpacity
                        style={[styles.markAllBtn, isSuspended && { opacity: 0.5 }]}
                        onPress={() => markAll(true)}
                        disabled={isSuspended}
                    >
                        <Text style={styles.markAllText}>All P</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.markAllBtn, { backgroundColor: '#FFF0F0' }, isSuspended && { opacity: 0.5 }]}
                        onPress={() => markAll(false)}
                        disabled={isSuspended}
                    >
                        <Text style={[styles.markAllText, { color: C.red }]}>All A</Text>
                    </TouchableOpacity>
                    {!isSuspended && (
                        <TouchableOpacity style={styles.suspendBtn} onPress={() => setSuspendModal(true)}>
                            <AlertTriangle size={14} color={C.red} strokeWidth={2.5} />
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {loading ? <View style={styles.centerContent}><ActivityIndicator size="large" color={mainTab === 'Gym' ? C.green : C.orange} /></View> : (
                <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
                    {currentMembers.length === 0 ? (
                        <View style={styles.centerContent}><Text style={styles.emptyText}>{mainTab === 'Badminton' && sessions.length === 0 ? 'No batches created yet.' : 'No active members in this batch.'}</Text></View>
                    ) : currentMembers.map(uid => {
                        const u = allUsers.find(x => x.id === uid);
                        if (!u) return null;
                        const here = att[uid];
                        const gc = mainTab === 'Gym' ? C.green : C.orange;
                        return (
                            <TouchableOpacity key={uid} style={[styles.memberRow, isSuspended && { opacity: 0.5 }]} onPress={() => !isSuspended && toggle(uid)} activeOpacity={0.7} disabled={isSuspended}>
                                <View style={[styles.avatar, { backgroundColor: here ? `${gc}15` : '#F5F5F5' }]}>
                                    <Text style={[styles.avatarText, { color: here ? gc : '#BDBDBD' }]}>{u.fullName.charAt(0)}</Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                        <Text style={styles.memberName}>{u.fullName}</Text>
                                        {u.isStudent && <View style={styles.studentBadge}><BookOpen size={9} color={C.purple} strokeWidth={2.5} /><Text style={[styles.badgeText, { color: C.purple }]}>Student</Text></View>}
                                        {!u.paymentRequired && (
                                            <View style={[styles.exemptBadge, { backgroundColor: u.exemptCategory === 'Priest' ? '#FFFBEB' : u.exemptCategory === 'Faculty' ? '#F0F9FF' : '#F5F5F5' }]}>
                                                {u.exemptCategory === 'Priest' ? <Star size={9} color={C.gold} strokeWidth={2.5} /> :
                                                    u.exemptCategory === 'Faculty' ? <Briefcase size={9} color={C.blue} strokeWidth={2.5} /> :
                                                        <Info size={9} color={C.sub} strokeWidth={2.5} />}
                                                <Text style={[styles.badgeText, { color: u.exemptCategory === 'Priest' ? C.gold : u.exemptCategory === 'Faculty' ? C.blue : C.sub }]}>
                                                    {u.exemptCategory || 'Exempt'}
                                                </Text>
                                            </View>
                                        )}
                                    </View>
                                    <Text style={styles.memberSub}>{u.phoneNumber}</Text>
                                </View>
                                <View style={[styles.togglePill, here ? styles.presentPill : styles.absentPill]}>
                                    {here ? <Check size={14} color="#fff" strokeWidth={3} /> : <X size={14} color="#fff" strokeWidth={3} />}
                                    <Text style={styles.pillText}>{here ? 'Present' : 'Absent'}</Text>
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            )}

            {/* Batch Suspend Modal (modern) */}
            <AppModal
                visible={suspendModal}
                onClose={() => setSuspendModal(false)}
                title="Suspend Batch"
                subtitle={`Mark this batch as closed for ${format(date, 'MMM d')}. No attendance will be recorded.`}
                icon="⚠️"
                variant="warning"
                inputValue={suspendReason}
                inputPlaceholder="Reason (optional, e.g. Holiday)"
                onInputChange={setSuspendReason}
                actions={[
                    { label: 'Cancel', onPress: () => setSuspendModal(false), variant: 'cancel' },
                    { label: 'Suspend Batch', onPress: handleSuspend, variant: 'danger' },
                ]}
            />

            {/* Batch Unsuspend Modal (modern) */}
            <AppModal
                visible={unsuspendModal}
                onClose={() => setUnsuspendModal(false)}
                title="Remove Batch Suspension?"
                subtitle={`Reactivate this batch and resume attendance tracking for ${format(date, 'MMM d')}.`}
                icon="⚡"
                variant="success"
                actions={[
                    { label: 'Cancel', onPress: () => setUnsuspendModal(false), variant: 'cancel' },
                    { label: 'Unsuspend Batch', onPress: async () => { await handleUnsuspend(); setUnsuspendModal(false); }, variant: 'success' },
                ]}
            />

            {/* Auto-suspend notification modal */}
            <AppModal
                visible={autoSuspendedModal}
                onClose={() => setAutoSuspendedModal(false)}
                title="Auto-Suspended Members"
                subtitle="The following members were automatically suspended due to 30+ days of absence:"
                icon="⏸️"
                variant="warning"
                actions={[{ label: 'OK, Got it', onPress: () => setAutoSuspendedModal(false), variant: 'primary' }]}
            >
                <View style={{ gap: 8, marginBottom: 16 }}>
                    {autoSuspendedList.map((m, i) => (
                        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFFBEB', padding: 10, borderRadius: 10 }}>
                            <PauseCircle size={14} color="#92400E" strokeWidth={2.5} />
                            <Text style={{ fontSize: 14, fontWeight: '700', color: '#92400E', flex: 1 }}>{m.name} — {m.activity}</Text>
                        </View>
                    ))}
                </View>
            </AppModal>
        </View>
    );
};

const makeStyles = (C: any) => StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    centerContent: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    sundayCard: { backgroundColor: C.card, borderRadius: 24, padding: 32, alignItems: 'center', width: '100%' },
    sundayTitle: { fontSize: 22, fontWeight: '800', color: C.text, marginBottom: 8 },
    sundaySub: { color: C.sub, fontSize: 15, marginBottom: 24 },
    prevDayBtn: { backgroundColor: '#FFF0E5', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 14 },
    prevDayText: { color: C.orange, fontWeight: '700', fontSize: 15 },
    dateNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.card, paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.border },
    navBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
    dayName: { fontSize: 18, fontWeight: '800', color: C.text, textAlign: 'center' },
    dayDate: { fontSize: 13, color: C.sub, fontWeight: '600', textAlign: 'center' },
    mainTabs: { flexDirection: 'row', backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border },
    mainTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, gap: 6, borderBottomWidth: 3, borderBottomColor: 'transparent' },
    mainTabActive: { borderBottomColor: C.orange, backgroundColor: C.pillBg },
    mainTabText: { fontSize: 14, fontWeight: '700', color: C.sub },
    mainTabTextActive: { color: C.text },
    tabCount: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
    tabCountText: { fontSize: 11, fontWeight: '800' },
    suspChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#FFFBEB', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
    suspChipText: { fontSize: 10, fontWeight: '800', color: '#92400E' },
    batchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12, backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border, justifyContent: 'center' },
    batchChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: C.inputBg, borderWidth: 1, borderColor: C.border },
    batchChipActive: { backgroundColor: '#FFF0E5', borderColor: C.orange },
    batchChipText: { fontSize: 13, fontWeight: '600', color: C.sub },
    batchChipTextActive: { color: C.orange, fontWeight: '700' },
    suspendBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.red, paddingHorizontal: 16, paddingVertical: 12 },
    suspendBannerText: { color: '#fff', fontSize: 13, fontWeight: '700', flex: 1 },
    actionBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.card, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
    statsRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    statPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F0FBF0', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
    statText: { fontWeight: '800', fontSize: 15 },
    totalText: { color: C.sub, fontSize: 12, fontWeight: '600', marginLeft: 4 },
    actionBtns: { flexDirection: 'row', gap: 6, alignItems: 'center' },
    markAllBtn: { backgroundColor: '#F0FBF0', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10 },
    markAllText: { color: C.green, fontSize: 12, fontWeight: '800' },
    suspendBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#FFF0F0', alignItems: 'center', justifyContent: 'center' },
    list: { padding: 16, paddingBottom: 60 },
    memberRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 16, padding: 14, marginBottom: 8, shadowColor: C.cardShadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
    avatar: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    avatarText: { fontSize: 17, fontWeight: '800' },
    memberName: { fontSize: 15, fontWeight: '700', color: C.text },
    memberSub: { fontSize: 12, color: C.sub, marginTop: 2, fontWeight: '500' },
    studentBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#EEF0FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
    exemptBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#E8F5E9', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
    badgeText: { fontSize: 10, fontWeight: '700' },
    togglePill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
    presentPill: { backgroundColor: C.green },
    absentPill: { backgroundColor: C.switchBg },
    pillText: { color: '#fff', fontWeight: '800', fontSize: 12 },
    emptyText: { color: C.sub, fontSize: 15, textAlign: 'center' },
});

export default AttendanceScreen;
