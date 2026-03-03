import React, { useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, TouchableOpacity, ScrollView,
    Alert, ActivityIndicator, TextInput, Modal, Platform
} from 'react-native';
import { createElement } from 'react';
import { useFocusEffect, useRoute, RouteProp, useNavigation } from '@react-navigation/native';
import { format, subDays, addDays } from 'date-fns';
import { ChevronLeft, ChevronRight, Check, X, BookOpen, Ban, AlertTriangle, CheckCircle2, Star, Briefcase, Info, Calendar as CalendarIcon } from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { User, Session } from '../types';
import { getActiveUsers, getAttendanceByDateSession, saveAttendanceBatch, getBadmintonSessions, getSuspensionsForDate, suspendBatch, unsuspendBatch, GYM_DEFAULT_SESSION_ID, toggleAttendance } from '../lib/services';
import { RootStackParamList } from '../types/navigation';

const C = { orange: '#FC8019', bg: '#F8F9FA', card: '#FFFFFF', text: '#1A1A2E', sub: '#93959F', green: '#10B981', red: '#EF4444', border: '#F0F0F0', purple: '#8B5CF6', gold: '#FBBF24', blue: '#3B82F6' };

const AttendanceScreen = () => {
    const route = useRoute<RouteProp<RootStackParamList, 'Attend'>>();
    const navigation = useNavigation();
    const [date, setDate] = useState<Date>(new Date());
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const [sessions, setSessions] = useState<Session[]>([]);
    const [att, setAtt] = useState<Record<string, boolean>>({});
    const [suspensions, setSuspensions] = useState<string[]>([]); // suspended sessionIds for date
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [mainTab, setMainTab] = useState<'Gym' | 'Badminton'>('Gym');
    const [selectedBatch, setSelectedBatch] = useState<string>(GYM_DEFAULT_SESSION_ID);
    const [suspendModal, setSuspendModal] = useState(false);
    const [suspendReason, setSuspendReason] = useState('');
    const [showPicker, setShowPicker] = useState(false);

    const isSun = (d: Date) => d.getDay() === 0;

    useFocusEffect(useCallback(() => {
        let d = new Date();
        if (isSun(d)) d = subDays(d, 1);
        setDate(d);

        let targetTab = mainTab;
        if (route.params?.tab && route.params.tab !== mainTab) {
            targetTab = route.params.tab;
            setMainTab(targetTab);
            navigation.setParams({ tab: undefined } as any);
        }

        loadAll(d, targetTab);
    }, [route.params?.tab]));

    const loadAll = async (d: Date, targetTab?: 'Gym' | 'Badminton') => {
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
            let finalBatch = selectedBatch;
            if (batches.length > 0 && !batches.find(b => b.id === selectedBatch) && activeTab === 'Badminton') {
                finalBatch = batches[0].id || '';
                setSelectedBatch(finalBatch);
            }
            // Load attendance for current session
            const sid = activeTab === 'Gym' ? GYM_DEFAULT_SESSION_ID : finalBatch;
            await loadAttendance(d, sid, users);
        } catch (e: any) { Alert.alert('Error', e.message); }
        finally { setLoading(false); }
    };

    const loadAttendance = async (d: Date, sessionId: string, users?: User[]) => {
        const ds = format(d, 'yyyy-MM-dd');
        const u = users || allUsers;
        const existing = await getAttendanceByDateSession(ds, sessionId);
        // Default: all ABSENT (false)
        const map: Record<string, boolean> = {};
        u.forEach(user => {
            if (!user.id) return;
            const isRelevant = sessionId === GYM_DEFAULT_SESSION_ID
                ? user.isGymMember
                : user.isBadmintonMember && user.badmintonSessionId === sessionId;
            if (isRelevant) map[user.id] = false; // default absent
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
        // For web input date picker
        const val = e.target?.value;
        if (!val) return;
        const newD = new Date(val);
        newD.setHours(12); // prevent timezone shifts
        if (isSun(newD)) {
            Alert.alert('Sunday', 'Gym is closed on Sundays.');
            return;
        }
        setDate(newD);
        loadAll(newD);
    };

    const handleNativeDateChange = (event: any, selectedDate?: Date) => {
        setShowPicker(false);
        if (selectedDate) {
            if (isSun(selectedDate)) {
                Alert.alert('Sunday', 'Gym is closed on Sundays.');
                return;
            }
            setDate(selectedDate);
            loadAll(selectedDate);
        }
    };

    const toggle = async (id: string) => {
        const sid = mainTab === 'Gym' ? GYM_DEFAULT_SESSION_ID : selectedBatch;
        const currentStatus = att[id] || false;
        // Optimistic UI update
        setAtt(p => ({ ...p, [id]: !currentStatus }));
        try {
            await toggleAttendance(format(date, 'yyyy-MM-dd'), sid, id, !currentStatus);
        } catch (e: any) {
            Alert.alert('Auto-Save Error', e.message);
            setAtt(p => ({ ...p, [id]: currentStatus })); // revert
        }
    };

    const markAll = async (val: boolean) => {
        const sid = mainTab === 'Gym' ? GYM_DEFAULT_SESSION_ID : selectedBatch;
        const oldState = { ...att };

        // Optimistic UI update
        setAtt(p => { const n = { ...p }; Object.keys(n).forEach(k => n[k] = val); return n; });

        try {
            const records = Object.keys(oldState).map(userId => ({ userId, isPresent: val }));
            await saveAttendanceBatch(format(date, 'yyyy-MM-dd'), sid, records);
        } catch (e: any) {
            Alert.alert('Auto-Save Error', e.message);
            setAtt(oldState); // revert
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
        Alert.alert('Remove Suspension', 'Mark this batch as active for this day?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Yes', onPress: async () => {
                    await unsuspendBatch(sid, format(date, 'yyyy-MM-dd'));
                    setSuspensions(prev => prev.filter(s => s !== sid));
                }
            },
        ]);
    };

    if (isSun(date)) return (
        <View style={[styles.container, styles.centerContent]}>
            <View style={styles.sundayCard}>
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

    return (
        <View style={styles.container}>
            {/* Date Navigator */}
            <View style={styles.dateNav}>
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
                        type: 'date',
                        value: format(date, 'yyyy-MM-dd'),
                        max: format(new Date(), 'yyyy-MM-dd'),
                        onChange: handleDateChange,
                        style: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }
                    })}
                </TouchableOpacity>
                <TouchableOpacity style={[styles.navBtn, date >= new Date() && { opacity: 0.3 }]} onPress={() => changeDay(1)} disabled={date >= new Date()}>
                    <ChevronRight size={20} color={C.text} strokeWidth={2.5} />
                </TouchableOpacity>
            </View>

            {showPicker && (
                <DateTimePicker
                    value={date}
                    mode="date"
                    display="default"
                    maximumDate={new Date()}
                    onChange={handleNativeDateChange}
                />
            )}

            {/* Gym / Badminton Tabs */}
            <View style={styles.mainTabs}>
                <TouchableOpacity style={[styles.mainTab, mainTab === 'Gym' && styles.mainTabActive]} onPress={() => switchSession(GYM_DEFAULT_SESSION_ID, 'Gym')} activeOpacity={0.8}>
                    <Text style={{ fontSize: 14 }}>🏋️</Text>
                    <Text style={[styles.mainTabText, mainTab === 'Gym' && styles.mainTabTextActive]}>Gym</Text>
                    <View style={[styles.tabCount, { backgroundColor: mainTab === 'Gym' ? C.green : '#E9E9EB' }]}>
                        <Text style={[styles.tabCountText, { color: mainTab === 'Gym' ? '#fff' : C.sub }]}>{allUsers.filter(u => u.isGymMember).length}</Text>
                    </View>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.mainTab, mainTab === 'Badminton' && styles.mainTabActive]} onPress={() => { if (sessions.length > 0) switchSession(sessions[0].id || '', 'Badminton'); }} activeOpacity={0.8}>
                    <Text style={{ fontSize: 14 }}>🏸</Text>
                    <Text style={[styles.mainTabText, mainTab === 'Badminton' && styles.mainTabTextActive]}>Badminton</Text>
                    <View style={[styles.tabCount, { backgroundColor: mainTab === 'Badminton' ? C.orange : '#E9E9EB' }]}>
                        <Text style={[styles.tabCountText, { color: mainTab === 'Badminton' ? '#fff' : C.sub }]}>{allUsers.filter(u => u.isBadmintonMember).length}</Text>
                    </View>
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

            {/* Suspended Banner */}
            {isSuspended && (
                <TouchableOpacity style={styles.suspendBanner} onPress={handleUnsuspend} activeOpacity={0.8}>
                    <AlertTriangle size={16} color="#fff" strokeWidth={2.5} />
                    <Text style={styles.suspendBannerText}>This batch is suspended for today — tap to remove</Text>
                </TouchableOpacity>
            )}

            {/* Stats + Action Bar */}
            <View style={styles.actionBar}>
                <View style={styles.statsRow}>
                    <View style={styles.statPill}><CheckCircle2 size={14} color={C.green} strokeWidth={2.5} /><Text style={[styles.statText, { color: C.green }]}>{presentCount}</Text></View>
                    <View style={[styles.statPill, { backgroundColor: '#FFF0F0' }]}><X size={14} color={C.red} strokeWidth={2.5} /><Text style={[styles.statText, { color: C.red }]}>{absentCount}</Text></View>
                    <Text style={styles.totalText}>{total} total</Text>
                </View>
                <View style={styles.actionBtns}>
                    <TouchableOpacity style={styles.markAllBtn} onPress={() => markAll(true)}>
                        <Text style={styles.markAllText}>All P</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.markAllBtn, { backgroundColor: '#FFF0F0' }]} onPress={() => markAll(false)}>
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
                        <View style={styles.centerContent}><Text style={styles.emptyText}>{mainTab === 'Badminton' && sessions.length === 0 ? 'No batches created yet.' : 'No members in this batch.'}</Text></View>
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

            {/* Suspend Modal */}
            <Modal visible={suspendModal} transparent animationType="slide">
                <View style={styles.modalOverlay}>
                    <View style={styles.modalCard}>
                        <Text style={styles.modalTitle}>Suspend Batch</Text>
                        <Text style={styles.modalSub}>Mark this batch as closed for {format(date, 'MMM d')}.</Text>
                        <TextInput style={styles.modalInput} placeholder="Reason (optional, e.g. Holiday)" placeholderTextColor={C.sub} value={suspendReason} onChangeText={setSuspendReason} />
                        <View style={styles.modalBtns}>
                            <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setSuspendModal(false)}><Text style={{ color: C.sub, fontWeight: '700' }}>Cancel</Text></TouchableOpacity>
                            <TouchableOpacity style={styles.modalConfirmBtn} onPress={handleSuspend}><Text style={{ color: '#fff', fontWeight: '800' }}>Suspend</Text></TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
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
    mainTabActive: { borderBottomColor: C.orange, backgroundColor: '#FFF9F5' },
    mainTabText: { fontSize: 14, fontWeight: '700', color: C.sub },
    mainTabTextActive: { color: C.text },
    tabCount: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
    tabCountText: { fontSize: 11, fontWeight: '800' },
    batchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12, backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border, justifyContent: 'center' },
    batchChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: C.bg, borderWidth: 1, borderColor: C.border },
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
    saveBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.orange, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12 },
    saveBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
    list: { padding: 16, paddingBottom: 60 },
    memberRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 16, padding: 14, marginBottom: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
    avatar: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
    avatarText: { fontSize: 17, fontWeight: '800' },
    memberName: { fontSize: 15, fontWeight: '700', color: C.text },
    memberSub: { fontSize: 12, color: C.sub, marginTop: 2, fontWeight: '500' },
    studentBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#EEF0FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
    exemptBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#E8F5E9', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
    badgeText: { fontSize: 10, fontWeight: '700' },
    togglePill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
    presentPill: { backgroundColor: C.green },
    absentPill: { backgroundColor: '#E4E4E7' },
    pillText: { color: '#fff', fontWeight: '800', fontSize: 12 },
    emptyText: { color: C.sub, fontSize: 15, textAlign: 'center' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
    modalCard: { backgroundColor: C.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 28, paddingBottom: 40 },
    modalTitle: { fontSize: 20, fontWeight: '800', color: C.text, marginBottom: 6 },
    modalSub: { fontSize: 14, color: C.sub, marginBottom: 20 },
    modalInput: { backgroundColor: C.bg, borderRadius: 14, padding: 16, fontSize: 16, color: C.text, borderWidth: 1, borderColor: C.border, marginBottom: 20 },
    modalBtns: { flexDirection: 'row', gap: 12 },
    modalCancelBtn: { flex: 1, padding: 16, borderRadius: 14, backgroundColor: C.bg, alignItems: 'center', borderWidth: 1, borderColor: C.border },
    modalConfirmBtn: { flex: 2, padding: 16, borderRadius: 14, backgroundColor: C.red, alignItems: 'center' },
});

export default AttendanceScreen;
