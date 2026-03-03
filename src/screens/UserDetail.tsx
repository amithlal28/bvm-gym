import React, { useState, useEffect, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView, TouchableOpacity,
    Alert, ActivityIndicator, TextInput, Switch, Platform
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect } from '@react-navigation/native';
import { User, Session } from '../types';
import { getUserById, updateUser, deleteUser, getBadmintonSessions, GYM_DEFAULT_SESSION_ID } from '../lib/services';
import { Trash2, Edit3, Save, X, Phone, MapPin, Award, BookOpen, Ban, Dumbbell, Zap, Star, Briefcase, Info, CreditCard } from 'lucide-react-native';
import { RootStackParamList } from '../types/navigation';

const C = { orange: '#FC8019', bg: '#F8F9FA', card: '#FFFFFF', text: '#1A1A2E', sub: '#93959F', green: '#10B981', red: '#EF4444', border: '#F0F0F0', purple: '#8B5CF6', gold: '#FFD700', blue: '#2196F3' };
type Props = NativeStackScreenProps<RootStackParamList, 'UserDetail'>;
const memberColor = (u: User) => u.isGymMember && u.isBadmintonMember ? C.purple : u.isGymMember ? C.green : C.orange;

export default function UserDetailScreen({ route, navigation }: Props) {
    const { userId } = route.params;
    const [user, setUser] = useState<User | null>(null);
    const [sessions, setSessions] = useState<Session[]>([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);

    const [fullName, setFullName] = useState('');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [address, setAddress] = useState('');
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
            });
            await load(); setEditing(false);
        } catch (e: any) { Alert.alert('Error', e.message); }
        finally { setSaving(false); }
    };

    const handleDelete = () => {
        const doDel = async () => {
            if (user?.id) {
                try {
                    await deleteUser(user.id);
                    navigation.goBack();
                } catch (e: any) { Alert.alert('Error', e.message); }
            }
        };

        if (Platform.OS === 'web') {
            if (window.confirm(`Remove ${user?.fullName}? This cannot be undone.`)) {
                doDel();
            }
        } else {
            Alert.alert('Remove Member', `Remove ${user?.fullName}? This cannot be undone.`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Remove', style: 'destructive', onPress: doDel },
            ]);
        }
    };

    if (loading) return <View style={[styles.container, styles.center]}><ActivityIndicator size="large" color={C.orange} /></View>;
    if (!user) return null;

    const gc = memberColor(user);
    const monthly = (user.isGymMember ? user.gymFee : 0) + (user.isBadmintonMember ? user.badmintonFee : 0);
    const batchName = sessions.find(s => s.id === user.badmintonSessionId)?.name || 'Unknown';

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
                        {user.isGymMember && <View style={[styles.actBadge, { backgroundColor: `${C.green}18` }]}><Text style={[styles.actBadgeText, { color: C.green }]}>🏋️ Gym</Text></View>}
                        {user.isBadmintonMember && <View style={[styles.actBadge, { backgroundColor: `${C.orange}18` }]}><Text style={[styles.actBadgeText, { color: C.orange }]}>🏸 Badminton</Text></View>}
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
                            <TouchableOpacity style={styles.editBtn} onPress={() => setEditing(true)}>
                                <Edit3 size={15} color={C.orange} strokeWidth={2.5} />
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.delBtn} onPress={handleDelete}>
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

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {!editing ? (
                    // View Mode
                    <>
                        <View style={styles.infoCard}>
                            <InfoRow icon={<Phone size={16} color={C.orange} />} label="Phone" value={user.phoneNumber} />
                            <Div />
                            <InfoRow icon={<MapPin size={16} color={C.green} />} label="Address" value={user.address || 'Not provided'} />
                            {user.isGymMember && <><Div /><InfoRow icon={<Dumbbell size={16} color={C.green} />} label="Gym Fee" value={`₹${user.gymFee} / month`} /></>}
                            {user.isBadmintonMember && <><Div /><InfoRow icon={<Zap size={16} color={C.orange} />} label="Badminton Batch" value={`${batchName} — ₹${user.badmintonFee}/mo`} /></>}
                            {user.isStudent && <><Div /><InfoRow icon={<BookOpen size={16} color={C.purple} />} label="Student" value={[user.studentCourse, user.studentYear].filter(Boolean).join(' · ') || 'No details'} /></>}
                            <Div />
                            <InfoRow icon={<Award size={16} color={C.sub} />} label="Monthly Total" value={user.paymentRequired ? `₹${monthly}` : 'Fee Exempt'} />
                        </View>
                    </>
                ) : (
                    // Edit Mode
                    <View style={{ gap: 0 }}>
                        <SLabel text="Full Name" />
                        <TextInput style={styles.input} value={fullName} onChangeText={setFullName} placeholder="Full name" placeholderTextColor={C.sub} />
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
        </View>
    );
}

const SLabel = ({ text }: { text: string }) => <Text style={{ color: '#93959F', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginTop: 16 }}>{text}</Text>;
const Div = () => <View style={{ height: 1, backgroundColor: '#F0F0F0', marginHorizontal: 16 }} />;
const InfoRow = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 }}>
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#F8F9FA', alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
        <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11, color: '#93959F', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{label}</Text>
            <Text style={{ fontSize: 15, color: '#1A1A2E', fontWeight: '600' }}>{value}</Text>
        </View>
    </View>
);

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    center: { alignItems: 'center', justifyContent: 'center' },
    profileCard: { flexDirection: 'row', backgroundColor: C.card, padding: 20, borderBottomWidth: 1, borderBottomColor: C.border, gap: 14, alignItems: 'flex-start' },
    bigAvatar: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
    bigAvatarText: { fontSize: 26, fontWeight: '900' },
    profileInfo: { flex: 1, gap: 4 },
    profileName: { fontSize: 18, fontWeight: '800', color: C.text },
    profilePhone: { fontSize: 13, color: C.sub },
    badgesRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 6 },
    actBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
    actBadgeText: { fontSize: 12, fontWeight: '700' },
    profileActions: { flexDirection: 'row', gap: 8 },
    editBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#FFF0E5', alignItems: 'center', justifyContent: 'center' },
    delBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#FFF0F0', alignItems: 'center', justifyContent: 'center' },
    cancelBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
    saveBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.orange, alignItems: 'center', justifyContent: 'center' },
    content: { padding: 16, paddingBottom: 60 },
    infoCard: { backgroundColor: C.card, borderRadius: 20, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 1 },
    input: { backgroundColor: C.card, borderRadius: 14, padding: 16, fontSize: 16, color: C.text, borderWidth: 1, borderColor: C.border },
    memberBlock: { backgroundColor: C.card, borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: C.border },
    memberBlockHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    mIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#E8F5E9', alignItems: 'center', justifyContent: 'center' },
    mTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: C.text },
    feeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border, marginTop: 10 },
    feeLbl: { fontSize: 14, fontWeight: '600', color: C.sub },
    feeInput: { backgroundColor: C.bg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontWeight: '800', fontSize: 15, color: C.text, borderWidth: 1, borderColor: C.border, textAlign: 'right', minWidth: 90 },
    batchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, borderWidth: 1.5, borderColor: C.border },
    batchRowActive: { borderColor: C.orange, backgroundColor: '#FFF9F5' },
    batchName: { fontSize: 13, fontWeight: '600', color: C.sub },
    radio: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: C.border },
    radioActive: { borderColor: C.orange, backgroundColor: C.orange, borderWidth: 4 },
    switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.card, borderRadius: 14, padding: 14, marginTop: 10, borderWidth: 1, borderColor: C.border },
    switchLabel: { fontSize: 15, fontWeight: '700', color: C.text },
    switchSub: { fontSize: 12, color: C.sub, marginTop: 2 },
    studentBlock: { backgroundColor: '#F5F5FF', borderRadius: 14, padding: 16, marginTop: 6, borderWidth: 1, borderColor: '#D4D0FF' },
    saveFullBtn: { backgroundColor: C.orange, borderRadius: 16, padding: 17, alignItems: 'center', marginTop: 20 },
    saveFullBtnText: { color: '#fff', fontWeight: '900', fontSize: 15 },
    exemptBlock: { padding: 16, backgroundColor: '#FFFDF5', borderBottomEndRadius: 14, borderBottomStartRadius: 14, marginTop: -2, marginBottom: 16, borderWidth: 1, borderColor: '#FFD700', borderTopWidth: 0 },
    exemptLbl: { fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 10 },
    exemptChips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    exChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: '#EAEAEA' },
    exChipActive: { backgroundColor: '#FFF4E5', borderColor: C.orange },
    exChipText: { fontSize: 13, fontWeight: '600', color: C.sub },
    exChipTextActive: { color: C.orange, fontWeight: '700' },
});
