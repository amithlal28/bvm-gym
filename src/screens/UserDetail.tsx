import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Alert, ActivityIndicator, TextInput, Switch, Platform
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { User, Session } from '../types';
import { getUserById, updateUser, deleteUser, getBadmintonSessions, GYM_DEFAULT_SESSION_ID, suspendMember, unsuspendMember } from '../lib/services';
import { Trash2, Edit3, Save, X, Phone, MapPin, Award, BookOpen, Ban, Dumbbell, Zap, Star, Briefcase, Info, CreditCard, Calendar, PauseCircle, PlayCircle } from 'lucide-react-native';
import { RootStackParamList } from '../types/navigation';
import AppModal from '../components/AppModal';
import { useTheme } from '../contexts/ThemeContext';

const staticColors = { orange: '#FC8019', green: '#10B981', purple: '#8B5CF6' };
type Props = NativeStackScreenProps<RootStackParamList, 'UserDetail'>;
const memberColor = (u: User) => u.isGymMember && u.isBadmintonMember ? staticColors.purple : u.isGymMember ? staticColors.green : staticColors.orange;

export default function UserDetailScreen({ route, navigation }: Props) {
    const { userId } = route.params;
    const { colors: C } = useTheme();
    const [user, setUser] = useState<User | null>(null);
    const [sessions, setSessions] = useState<Session[]>([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);

    // Modal states
    const [deleteModal, setDeleteModal] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [suspendModal, setSuspendModal] = useState(false);
    const [suspendActivity, setSuspendActivity] = useState<'Gym' | 'Badminton' | null>(null);
    const [suspending, setSuspending] = useState(false);
    const [successModal, setSuccessModal] = useState(false);
    const [successMsg, setSuccessMsg] = useState('');

    const [fullName, setFullName] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [address, setAddress] = useState('');
    const [dateJoined, setDateJoined] = useState('');
    const [isGymMember, setIsGymMember] = useState(false);
    const [gymFee, setGymFee] = useState('');
    const [isBadmintonMember, setIsBadmintonMember] = useState(false);
    const [badmintonSessionId, setBadmintonSessionId] = useState('');
    const [badmintonFee, setBadmintonFee] = useState('');
    const [isStudent, setIsStudent] = useState(false);
    const [studentCourse, setStudentCourse] = useState('');
    const [studentYear, setStudentYear] = useState('');
    const [paymentRequired, setPaymentRequired] = useState(true);
    const [exemptCategory, setExemptCategory] = useState<'Priest' | 'Faculty' | 'Student' | 'Other' | undefined>(undefined);

    useFocusEffect(useCallback(() => { load(); }, [userId]));

    const load = async () => {
        try {
            setLoading(true);
            const [u, s] = await Promise.all([getUserById(userId), getBadmintonSessions()]);
            if (!u) { Alert.alert('Error', 'Member not found.'); navigation.goBack(); return; }
            setUser(u); setSessions(s); fill(u);
        } catch (e: any) { Alert.alert('Error', e.message); }
        finally { setLoading(false); }
    };

    const fill = (u: User) => {
        setFullName(u.fullName); setPhoneNumber(u.phoneNumber); setAddress(u.address || '');
        setDateJoined(u.dateJoined || '');
        setIsGymMember(u.isGymMember || false); setGymFee(String(u.gymFee || 0));
        setIsBadmintonMember(u.isBadmintonMember || false); setBadmintonSessionId(u.badmintonSessionId || '');
        setBadmintonFee(String(u.badmintonFee || 0));
        setIsStudent(u.isStudent || false); setStudentCourse(u.studentCourse || ''); setStudentYear(u.studentYear || '');
        setPaymentRequired(u.paymentRequired !== false);
        setExemptCategory(u.exemptCategory);
    };

    const handleSave = async () => {
        if (!fullName.trim() || !phoneNumber.trim()) return Alert.alert('Required', 'Name and phone are required.');
        if (!isGymMember && !isBadmintonMember) return Alert.alert('Required', 'At least one activity required.');
        if (isBadmintonMember && !badmintonSessionId) return Alert.alert('Required', 'Select a Badminton batch.');
        if (isStudent && !studentCourse.trim()) return Alert.alert('Required', 'Enter student course.');
        if (!dateJoined.match(/^\d{4}-\d{2}-\d{2}$/)) return Alert.alert('Required', 'Enter a valid Date Joined (YYYY-MM-DD).');
        try {
            setSaving(true);
            await updateUser(userId, {
                fullName: fullName.trim(), phoneNumber: phoneNumber.trim(), address: address.trim(),
                isGymMember, gymFee: isGymMember ? parseFloat(gymFee) || 0 : 0,
                isBadmintonMember, badmintonSessionId: isBadmintonMember ? badmintonSessionId : undefined,
                badmintonFee: isBadmintonMember ? parseFloat(badmintonFee) || 0 : 0,
                isStudent, studentCourse: isStudent ? studentCourse.trim() : undefined,
                studentYear: isStudent ? studentYear.trim() : undefined,
                paymentRequired,
                exemptCategory: paymentRequired ? undefined : (exemptCategory || 'Other'),
                dateJoined: dateJoined
            });
            await load(); setEditing(false);
            setSuccessMsg('Member details saved successfully!');
            setSuccessModal(true);
        } catch (e: any) { Alert.alert('Error', e.message); }
        finally { setSaving(false); }
    };

    const handleDelete = async () => {
        try {
            setDeleting(true);
            if (user?.id) {
                await deleteUser(user.id);
                setDeleteModal(false);
                navigation.goBack();
            }
        } catch (e: any) {
            Alert.alert('Error', e.message);
        } finally {
            setDeleting(false);
        }
    };

    const handleSuspend = async () => {
        if (!suspendActivity || !user?.id) return;
        try {
            setSuspending(true);
            await suspendMember(user.id, suspendActivity);
            await load();
            setSuspendModal(false);
            setSuspendActivity(null);
            setSuccessMsg(`${user.fullName} suspended from ${suspendActivity}.`);
            setSuccessModal(true);
        } catch (e: any) { Alert.alert('Error', e.message); }
        finally { setSuspending(false); }
    };

    const handleUnsuspend = async (activity: 'Gym' | 'Badminton') => {
        if (!user?.id) return;
        try {
            await unsuspendMember(user.id, activity);
            await load();
            setSuccessMsg(`${user.fullName} is now active in ${activity}.`);
            setSuccessModal(true);
        } catch (e: any) { Alert.alert('Error', e.message); }
    };

    const styles = useMemo(() => ({
        container: { flex: 1, backgroundColor: C.bg },
        center: { alignItems: 'center' as const, justifyContent: 'center' as const },
        profileCard: { flexDirection: 'row' as const, backgroundColor: C.card, padding: 20, borderBottomWidth: 1, borderBottomColor: C.border, gap: 14, alignItems: 'flex-start' as const },
        bigAvatar: { width: 64, height: 64, borderRadius: 20, alignItems: 'center' as const, justifyContent: 'center' as const },
        bigAvatarText: { fontSize: 26, fontWeight: '900' as const },
        profileInfo: { flex: 1, gap: 4 },
        profileName: { fontSize: 18, fontWeight: '800' as const, color: C.text },
        header: { backgroundColor: C.headerBg, paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.border },
        avatar: { width: 60, height: 60, borderRadius: 18, alignItems: 'center' as const, justifyContent: 'center' as const },
        profilePhone: { fontSize: 13, color: C.sub },
        badgesRow: { flexDirection: 'row' as const, gap: 6, flexWrap: 'wrap' as const, marginTop: 6 },
        actBadge: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
        actBadgeText: { fontSize: 12, fontWeight: '700' as const },
        profileActions: { flexDirection: 'row' as const, gap: 8, flexWrap: 'wrap' as const, justifyContent: 'flex-end' as const, maxWidth: 120 },
        editBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#FFF0E5', alignItems: 'center' as const, justifyContent: 'center' as const },
        delBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#FFF0F0', alignItems: 'center' as const, justifyContent: 'center' as const },
        suspendBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#FFFBEB', alignItems: 'center' as const, justifyContent: 'center' as const },
        unsuspendBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#ECFDF5', alignItems: 'center' as const, justifyContent: 'center' as const },
        cancelBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.card, alignItems: 'center' as const, justifyContent: 'center' as const, borderWidth: 1, borderColor: C.border },
        saveBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.orange, alignItems: 'center' as const, justifyContent: 'center' as const },
        suspendBanner: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, backgroundColor: '#FFFBEB', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#FDE68A' },
        suspendBannerText: { flex: 1, fontSize: 12, fontWeight: '600' as const, color: '#92400E' },
        content: { padding: 16, paddingBottom: 60 },
        infoCard: { backgroundColor: C.card, borderRadius: 20, overflow: 'hidden' as const, shadowColor: C.cardShadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1 },
        input: { backgroundColor: C.inputBg, borderRadius: 14, padding: 16, fontSize: 16, color: C.text, borderWidth: 1, borderColor: C.border },
        memberBlock: { backgroundColor: C.card, borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: C.border },
        memberBlockHeader: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10 },
        mIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#E8F5E9', alignItems: 'center' as const, justifyContent: 'center' as const },
        mTitle: { flex: 1, fontSize: 15, fontWeight: '700' as const, color: C.text },
        feeRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border, marginTop: 10 },
        feeLbl: { fontSize: 14, fontWeight: '600' as const, color: C.sub },
        feeInput: { backgroundColor: C.inputBg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontWeight: '800' as const, fontSize: 15, color: C.text, borderWidth: 1, borderColor: C.border, textAlign: 'right' as const, minWidth: 90 },
        batchRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 10, padding: 10, borderRadius: 10, borderWidth: 1.5, borderColor: C.border },
        batchRowActive: { borderColor: C.orange, backgroundColor: '#FFF9F5' },
        batchName: { fontSize: 13, fontWeight: '600' as const, color: C.sub },
        radio: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: C.border },
        radioActive: { borderColor: C.orange, backgroundColor: C.orange, borderWidth: 4 },
        switchRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, backgroundColor: C.card, borderRadius: 14, padding: 14, marginTop: 10, borderWidth: 1, borderColor: C.border },
        switchLabel: { fontSize: 15, fontWeight: '700' as const, color: C.text },
        switchSub: { fontSize: 12, color: C.sub, marginTop: 2 },
        studentBlock: { backgroundColor: C.inputBg, borderRadius: 14, padding: 16, marginTop: 6, borderWidth: 1, borderColor: '#D4D0FF' },
        saveFullBtn: { backgroundColor: C.orange, borderRadius: 16, padding: 17, alignItems: 'center' as const, marginTop: 20 },
        saveFullBtnText: { color: '#fff', fontWeight: '900' as const, fontSize: 15 },
        exemptBlock: { padding: 16, backgroundColor: '#FFFDF5', borderBottomEndRadius: 14, borderBottomStartRadius: 14, marginTop: -2, marginBottom: 16, borderWidth: 1, borderColor: '#FFD700', borderTopWidth: 0 },
        exemptLbl: { fontSize: 13, fontWeight: '700' as const, color: C.text, marginBottom: 10 },
        exemptChips: { flexDirection: 'row' as const, gap: 8, flexWrap: 'wrap' as const },
        exChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
        exChipActive: { backgroundColor: '#FFF4E5', borderColor: C.orange },
        exChipText: { fontSize: 13, fontWeight: '600' as const, color: C.sub },
        exChipTextActive: { color: C.orange, fontWeight: '700' as const },
        actPickRow: { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, backgroundColor: C.inputBg, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: C.border },
        actPickText: { fontSize: 15, fontWeight: '700' as const, color: C.text },
        actPickArrow: {},
    }), [C]);

    if (loading) return <View style={[styles.container, styles.center]}><ActivityIndicator size="large" color={C.orange} /></View>;
    if (!user) return null;

    const gc = memberColor(user);
    const monthly = (user.isGymMember ? user.gymFee : 0) + (user.isBadmintonMember ? user.badmintonFee : 0);
    const batchName = sessions.find(s => s.id === user.badmintonSessionId)?.name || 'Unknown';
    const isGymSuspended = !!user.gymSuspendedAt;
    const isBadSuspended = !!user.badmintonSuspendedAt;
    const hasAnySuspension = isGymSuspended || isBadSuspended;

    // Activities that can still be suspended
    const suspendableActivities: ('Gym' | 'Badminton')[] = [];
    if (user.isGymMember && !isGymSuspended) suspendableActivities.push('Gym');
    if (user.isBadmintonMember && !isBadSuspended) suspendableActivities.push('Badminton');


    return (
        <View style={styles.container}>
            {/* Profile Card */}
            <View style={styles.profileCard}>
                <View style={[styles.bigAvatar, { backgroundColor: `${gc}18` }]}>
                    <Text style={[styles.bigAvatarText, { color: gc }]}>{user.fullName.charAt(0)}</Text>
                </View>
                <View style={styles.profileInfo}>
                    <Text style={styles.profileName}>{user.fullName}</Text>
                    <Text style={styles.profilePhone}>{user.phoneNumber}</Text>
                    <View style={styles.badgesRow}>
                        {user.isGymMember && (
                            <View style={[styles.actBadge, { backgroundColor: isGymSuspended ? '#FFF0F0' : `${C.green}18` }]}>
                                <Text style={[styles.actBadgeText, { color: isGymSuspended ? C.red : C.green }]}>
                                    {isGymSuspended ? '⏸ Gym (Susp)' : '🏋️ Gym'}
                                </Text>
                            </View>
                        )}
                        {user.isBadmintonMember && (
                            <View style={[styles.actBadge, { backgroundColor: isBadSuspended ? '#FFF0F0' : `${C.orange}18` }]}>
                                <Text style={[styles.actBadgeText, { color: isBadSuspended ? C.red : C.orange }]}>
                                    {isBadSuspended ? '⏸ Badminton (Susp)' : '🏸 Badminton'}
                                </Text>
                            </View>
                        )}
                        {user.isStudent && <View style={[styles.actBadge, { backgroundColor: '#EEF0FF' }]}><BookOpen size={10} color={C.purple} strokeWidth={2.5} /><Text style={[styles.actBadgeText, { color: C.purple }]}>Student</Text></View>}
                        {!user.paymentRequired && (
                            <View style={[styles.actBadge, { backgroundColor: user.exemptCategory === 'Priest' ? '#FFFBEB' : user.exemptCategory === 'Faculty' ? '#F0F9FF' : user.exemptCategory === 'Student' ? '#EEF0FF' : '#F5F5F5' }]}>
                                {user.exemptCategory === 'Priest' ? <Star size={10} color={C.gold} strokeWidth={2.5} /> :
                                    user.exemptCategory === 'Faculty' ? <Briefcase size={10} color={C.blue} strokeWidth={2.5} /> :
                                        user.exemptCategory === 'Student' ? <BookOpen size={10} color={C.purple} strokeWidth={2.5} /> :
                                            <Info size={10} color={C.sub} strokeWidth={2.5} />}
                                <Text style={[styles.actBadgeText, { color: user.exemptCategory === 'Priest' ? C.gold : user.exemptCategory === 'Faculty' ? C.blue : user.exemptCategory === 'Student' ? C.purple : C.sub }]}>
                                    {user.exemptCategory || 'Exempt'}
                                </Text>
                            </View>
                        )}
                    </View>
                </View>
                <View style={styles.profileActions}>
                    {!editing ? (
                        <>
                            {/* Suspend / Unsuspend */}
                            {(suspendableActivities.length > 0) && (
                                <TouchableOpacity style={styles.suspendBtn} onPress={() => setSuspendModal(true)}>
                                    <PauseCircle size={15} color={C.amber} strokeWidth={2.5} />
                                </TouchableOpacity>
                            )}
                            {hasAnySuspension && (
                                <TouchableOpacity
                                    style={styles.unsuspendBtn}
                                    onPress={() => {
                                        if (isGymSuspended && isBadSuspended) {
                                            // Both suspended — prompt which to unsuspend
                                            Alert.alert('Unsuspend', 'Which activity?', [
                                                { text: 'Gym', onPress: () => handleUnsuspend('Gym') },
                                                { text: 'Badminton', onPress: () => handleUnsuspend('Badminton') },
                                                { text: 'Both', onPress: async () => { await handleUnsuspend('Gym'); await handleUnsuspend('Badminton'); } },
                                                { text: 'Cancel', style: 'cancel' },
                                            ]);
                                        } else if (isGymSuspended) {
                                            handleUnsuspend('Gym');
                                        } else {
                                            handleUnsuspend('Badminton');
                                        }
                                    }}
                                >
                                    <PlayCircle size={15} color={C.green} strokeWidth={2.5} />
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity style={styles.editBtn} onPress={() => setEditing(true)}>
                                <Edit3 size={15} color={C.orange} strokeWidth={2.5} />
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.delBtn} onPress={() => setDeleteModal(true)}>
                                <Trash2 size={15} color={C.red} strokeWidth={2.5} />
                            </TouchableOpacity>
                        </>
                    ) : (
                        <>
                            <TouchableOpacity style={styles.cancelBtn} onPress={() => { setEditing(false); if (user) fill(user); }}>
                                <X size={15} color={C.sub} strokeWidth={2.5} />
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
                                {saving ? <ActivityIndicator size="small" color="#fff" /> : <Save size={15} color="#fff" strokeWidth={2.5} />}
                            </TouchableOpacity>
                        </>
                    )}
                </View>
            </View>

            {/* Suspension Banner */}
            {hasAnySuspension && (
                <View style={styles.suspendBanner}>
                    <PauseCircle size={14} color={C.amber} strokeWidth={2.5} />
                    <Text style={styles.suspendBannerText}>
                        Member suspended from:{' '}
                        {[isGymSuspended && `Gym (since ${user.gymSuspendedAt})`, isBadSuspended && `Badminton (since ${user.badmintonSuspendedAt})`].filter(Boolean).join(' · ')}
                    </Text>
                </View>
            )}

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {!editing ? (
                    <>
                        <View style={styles.infoCard}>
                            <InfoRow colors={C} icon={<Phone size={16} color={C.orange} />} label="Phone" value={user.phoneNumber} />
                            <Div />
                            <InfoRow colors={C} icon={<Calendar size={16} color={C.blue} />} label="Joined" value={user.dateJoined || 'Unknown'} />
                            <Div />
                            <InfoRow colors={C} icon={<MapPin size={16} color={C.green} />} label="Address" value={user.address || 'Not provided'} />
                            {user.isGymMember && <><Div /><InfoRow colors={C} icon={<Dumbbell size={16} color={isGymSuspended ? C.red : C.green} />} label="Gym Fee" value={isGymSuspended ? `₹${user.gymFee}/month — ⏸ Suspended` : `₹${user.gymFee} / month`} /></>}
                            {user.isBadmintonMember && <><Div /><InfoRow colors={C} icon={<Zap size={16} color={isBadSuspended ? C.red : C.orange} />} label="Badminton Batch" value={isBadSuspended ? `${batchName} — ⏸ Suspended` : `${batchName} — ₹${user.badmintonFee}/mo`} /></>}
                            {user.isStudent && <><Div /><InfoRow colors={C} icon={<BookOpen size={16} color={C.purple} />} label="Student" value={[user.studentCourse, user.studentYear].filter(Boolean).join(' · ') || 'No details'} /></>}
                            <Div />
                            <InfoRow colors={C} icon={<Award size={16} color={C.sub} />} label="Monthly Total" value={user.paymentRequired ? `₹${monthly}` : 'Fee Exempt'} />
                        </View>
                    </>
                ) : (
                    <View style={{ gap: 0 }}>
                        <SLabel text="Full Name" />
                        <TextInput style={styles.input} value={fullName} onChangeText={setFullName} placeholder="Full name" placeholderTextColor={C.sub} />
                        <SLabel text="Date Joined" />
                        <TextInput style={styles.input} value={dateJoined} onChangeText={setDateJoined} placeholder="YYYY-MM-DD" placeholderTextColor={C.sub} />
                        <SLabel text="Phone Number" />
                        <TextInput style={styles.input} value={phoneNumber} onChangeText={setPhoneNumber} keyboardType="phone-pad" placeholder="10-digit mobile" placeholderTextColor={C.sub} />
                        <SLabel text="Address" />
                        <TextInput style={styles.input} value={address} onChangeText={setAddress} placeholder="City, Area" placeholderTextColor={C.sub} />

                        <SLabel text="Memberships" />
                        {/* Gym block */}
                        <View style={styles.memberBlock}>
                            <View style={styles.memberBlockHeader}>
                                <View style={styles.mIcon}><Dumbbell size={16} color={C.green} strokeWidth={2.5} /></View>
                                <Text style={styles.mTitle}>Gym Member</Text>
                                <Switch value={isGymMember} onValueChange={setIsGymMember} trackColor={{ false: C.border, true: '#BBEDD8' }} thumbColor={isGymMember ? C.green : '#fff'} />
                            </View>
                            {isGymMember && <View style={styles.feeRow}><Text style={styles.feeLbl}>Monthly Fee ₹</Text><TextInput style={styles.feeInput} value={gymFee} onChangeText={setGymFee} keyboardType="numeric" placeholder="1000" placeholderTextColor={C.sub} /></View>}
                        </View>
                        {/* Badminton block */}
                        <View style={styles.memberBlock}>
                            <View style={styles.memberBlockHeader}>
                                <View style={[styles.mIcon, { backgroundColor: '#FFF0E5' }]}><Zap size={16} color={C.orange} strokeWidth={2.5} /></View>
                                <Text style={styles.mTitle}>Badminton Member</Text>
                                <Switch value={isBadmintonMember} onValueChange={v => { setIsBadmintonMember(v); if (!v) setBadmintonSessionId(''); }} trackColor={{ false: C.border, true: '#FFC8A0' }} thumbColor={isBadmintonMember ? C.orange : '#fff'} />
                            </View>
                            {isBadmintonMember && (
                                <>
                                    <View style={styles.feeRow}><Text style={styles.feeLbl}>Monthly Fee ₹</Text><TextInput style={styles.feeInput} value={badmintonFee} onChangeText={setBadmintonFee} keyboardType="numeric" placeholder="700" placeholderTextColor={C.sub} /></View>
                                    <View style={{ paddingTop: 10, gap: 8 }}>
                                        {sessions.map(s => (
                                            <TouchableOpacity key={s.id} style={[styles.batchRow, badmintonSessionId === s.id && styles.batchRowActive]} onPress={() => setBadmintonSessionId(s.id || '')}>
                                                <View style={[styles.radio, badmintonSessionId === s.id && styles.radioActive]} />
                                                <Text style={[styles.batchName, badmintonSessionId === s.id && { color: C.orange }]}>{s.name} — {s.timings}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </>
                            )}
                        </View>

                        {/* Student */}
                        <View style={styles.switchRow}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><BookOpen size={16} color={C.purple} strokeWidth={2.5} /><View><Text style={styles.switchLabel}>Student</Text><Text style={styles.switchSub}>Captures course & year details</Text></View></View>
                            <Switch value={isStudent} onValueChange={v => { setIsStudent(v); if (!v) { setStudentCourse(''); setStudentYear(''); } }} trackColor={{ false: C.border, true: '#D4D0FF' }} thumbColor={isStudent ? C.purple : '#fff'} />
                        </View>
                        {isStudent && <View style={styles.studentBlock}>
                            <SLabel text="Course" /><TextInput style={styles.input} value={studentCourse} onChangeText={setStudentCourse} placeholder="B.Tech, MBA..." placeholderTextColor={C.sub} />
                            <SLabel text="Year (optional)" /><TextInput style={[styles.input, { marginBottom: 0 }]} value={studentYear} onChangeText={setStudentYear} placeholder="2nd Year, Final Year..." placeholderTextColor={C.sub} />
                        </View>}

                        {/* Payment Required */}
                        <View style={styles.switchRow}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><CreditCard size={16} color={C.green} strokeWidth={2.5} /><View><Text style={styles.switchLabel}>Payment Required</Text><Text style={styles.switchSub}>Turn off for priests/staff</Text></View></View>
                            <Switch value={paymentRequired} onValueChange={v => { setPaymentRequired(v); if (v) setExemptCategory(undefined); else setExemptCategory('Priest'); }} trackColor={{ false: C.border, true: '#BBEDD8' }} thumbColor={paymentRequired ? C.green : '#fff'} />
                        </View>

                        {!paymentRequired && (
                            <View style={styles.exemptBlock}>
                                <Text style={styles.exemptLbl}>Exemption Category</Text>
                                <View style={styles.exemptChips}>
                                    {['Priest', 'Faculty', 'Student', 'Other'].map(c => (
                                        <TouchableOpacity key={c} onPress={() => setExemptCategory(c as any)} style={[styles.exChip, exemptCategory === c && styles.exChipActive]}>
                                            <Text style={[styles.exChipText, exemptCategory === c && styles.exChipTextActive]}>{c}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                        )}

                        <TouchableOpacity style={[styles.saveFullBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
                            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveFullBtnText}>Save Changes</Text>}
                        </TouchableOpacity>
                    </View>
                )}
            </ScrollView>

            {/* Delete Modal */}
            <AppModal
                visible={deleteModal}
                onClose={() => setDeleteModal(false)}
                title="Remove Member"
                subtitle={`Remove ${user?.fullName}? This cannot be undone and will delete all their records.`}
                icon="🗑️"
                variant="danger"
                actions={[
                    { label: 'Cancel', onPress: () => setDeleteModal(false), variant: 'cancel' },
                    { label: 'Yes, Remove', onPress: handleDelete, variant: 'danger', loading: deleting },
                ]}
            />

            {/* Suspend Modal */}
            <AppModal
                visible={suspendModal}
                onClose={() => { setSuspendModal(false); setSuspendActivity(null); }}
                title="Suspend Member"
                subtitle="Suspended members won't appear in attendance. Choose the activity to suspend."
                icon="⏸️"
                variant="suspend"
                actions={
                    suspendActivity
                        ? [
                            { label: 'Cancel', onPress: () => setSuspendActivity(null), variant: 'cancel' },
                            { label: `Suspend ${suspendActivity}`, onPress: handleSuspend, variant: 'danger', loading: suspending },
                        ]
                        : [{ label: 'Cancel', onPress: () => setSuspendModal(false), variant: 'cancel' }]
                }
            >
                {!suspendActivity && suspendableActivities.length > 0 && (
                    <View style={{ gap: 10, marginBottom: 16 }}>
                        {suspendableActivities.map(act => (
                            <TouchableOpacity
                                key={act}
                                style={styles.actPickRow}
                                onPress={() => setSuspendActivity(act)}
                            >
                                <Text style={styles.actPickText}>{act === 'Gym' ? '🏋️' : '🏸'} {act}</Text>
                                <View style={styles.actPickArrow}><Text style={{ color: C.orange, fontWeight: '700' }}>Select →</Text></View>
                            </TouchableOpacity>
                        ))}
                    </View>
                )}
            </AppModal>

            {/* Success Modal */}
            <AppModal
                visible={successModal}
                onClose={() => setSuccessModal(false)}
                title="Done!"
                subtitle={successMsg}
                icon="✅"
                variant="success"
                actions={[{ label: 'Great', onPress: () => setSuccessModal(false), variant: 'success' }]}
            />
        </View>
    );
}

const SLabel = ({ text }: { text: string }) => <Text style={{ color: '#93959F', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginTop: 16 }}>{text}</Text>;
const Div = () => <View style={{ height: 1, backgroundColor: '#F0F0F0', marginHorizontal: 16 }} />;
const InfoRow = ({ icon, label, value, colors: C }: { icon: React.ReactNode; label: string; value: string; colors: any }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 }}>
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: C.inputBg, alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
        <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, color: C.sub, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{label}</Text>
            <Text style={{ fontSize: 15, color: C.text, fontWeight: '600' }}>{value}</Text>
        </View>
    </View>
);
