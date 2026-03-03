import React, { useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, TextInput, TouchableOpacity, Switch,
    ScrollView, Alert, ActivityIndicator, KeyboardAvoidingView, Platform
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { User, Session } from '../types';
import { ChevronLeft, Check, Search, Filter, Phone, MapPin, Dumbbell, Zap, Calendar, BookOpen, AlertCircle, TrendingUp, CreditCard, Star, Briefcase, GraduationCap, Ban, ChevronRight } from 'lucide-react-native';
import { createUser, getActiveUsers, getBadmintonSessions } from '../lib/services';
import { RootStackParamList } from '../types/navigation';

const C = { orange: '#FC8019', bg: '#F8F9FA', card: '#FFFFFF', text: '#1A1A2E', sub: '#93959F', green: '#10B981', red: '#EF4444', border: '#F0F0F0', purple: '#8B5CF6', gold: '#FBBF24', blue: '#3B82F6' };
type Nav = NativeStackNavigationProp<RootStackParamList>;
const actColor = (u: User) => u.isGymMember && u.isBadmintonMember ? C.purple : u.isGymMember ? C.green : C.orange;

const UserManagementScreen = () => {
    const navigation = useNavigation<Nav>();
    const [tab, setTab] = useState<'dir' | 'reg'>('dir');
    const [users, setUsers] = useState<User[]>([]);
    const [sessions, setSessions] = useState<Session[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [q, setQ] = useState('');
    const [filter, setFilter] = useState<'All' | 'Gym' | 'Badminton' | 'Students' | 'Exempt'>('All');

    // Form state
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [addr, setAddr] = useState('');
    const [isGymMember, setIsGymMember] = useState(true);
    const [gymFee, setGymFee] = useState('500');
    const [isBadmintonMember, setIsBadmintonMember] = useState(false);
    const [badmintonSessionId, setBadmintonSessionId] = useState('');
    const [badmintonFee, setBadmintonFee] = useState('500');
    const [isStudent, setIsStudent] = useState(false);
    const [studentCourse, setStudentCourse] = useState('');
    const [studentYear, setStudentYear] = useState('');
    const [paymentRequired, setPaymentRequired] = useState(true);
    const [exemptCategory, setExemptCategory] = useState<'Priest' | 'Faculty' | 'Student' | 'Other' | undefined>(undefined);

    useFocusEffect(useCallback(() => { loadAll(); }, []));
    const loadAll = async () => {
        try { setLoading(true); const [u, s] = await Promise.all([getActiveUsers(), getBadmintonSessions()]); setUsers(u); setSessions(s); }
        catch (e: any) { Alert.alert('Error', e.message); }
        finally { setLoading(false); }
    };

    const resetForm = () => {
        setName('');
        setPhone('');
        setAddr('');
        setIsGymMember(true);
        setGymFee('500');
        setIsBadmintonMember(false);
        setBadmintonSessionId('');
        setBadmintonFee('500');
        setIsStudent(false);
        setStudentCourse('');
        setStudentYear('');
        setPaymentRequired(true);
        setExemptCategory(undefined);
    };

    const E_CATS = ['Priest', 'Faculty', 'Student', 'Other'] as const;

    const register = async () => {
        if (!name.trim() || !phone.trim()) return Alert.alert('Required', 'Enter name and phone.');
        if (!isGymMember && !isBadmintonMember) return Alert.alert('Required', 'Select at least one activity.');
        if (isBadmintonMember && !badmintonSessionId) return Alert.alert('Required', 'Select a Badminton batch.');
        if (isStudent && !studentCourse.trim()) return Alert.alert('Required', 'Enter course name.');
        if (!paymentRequired && !exemptCategory) return Alert.alert('Required', 'Select an exemption category.');

        try {
            setSaving(true);
            await createUser({
                fullName: name.trim(),
                phoneNumber: phone.trim(),
                address: addr.trim(),
                isGymMember,
                gymFee: isGymMember ? parseFloat(gymFee) || 0 : 0,
                isBadmintonMember,
                badmintonSessionId: isBadmintonMember ? badmintonSessionId : undefined,
                badmintonFee: isBadmintonMember ? parseFloat(badmintonFee) || 0 : 0,
                isStudent,
                studentCourse: isStudent ? studentCourse.trim() : undefined,
                studentYear: isStudent ? studentYear.trim() : undefined,
                paymentRequired,
                exemptCategory: paymentRequired ? undefined : (exemptCategory || 'Other')
            });
            Alert.alert('✅ Registered!', `${name} added.`);
            resetForm(); await loadAll(); setTab('dir');
        } catch (e: any) { Alert.alert('Error', e.message); }
        finally { setSaving(false); }
    };

    const filters: typeof filter[] = ['All', 'Gym', 'Badminton', 'Students', 'Exempt'];
    const filtered = users.filter(u => {
        const matchQ = u.fullName.toLowerCase().includes(q.toLowerCase()) || u.phoneNumber.includes(q);
        const matchF = filter === 'All' ? true : filter === 'Gym' ? u.isGymMember : filter === 'Badminton' ? u.isBadmintonMember : filter === 'Students' ? u.isStudent : !u.paymentRequired;
        return matchQ && matchF;
    });

    return (
        <View style={styles.container}>
            <View style={styles.tabBar}>
                {([['dir', 'Members'] as const, ['reg', 'Register'] as const]).map(([mode, label]) => (
                    <TouchableOpacity key={mode} style={[styles.tab, tab === mode && styles.tabActive]} onPress={() => setTab(mode)}>
                        <Text style={[styles.tabText, tab === mode && styles.tabTextActive]}>{label}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            {tab === 'dir' ? (
                <View style={{ flex: 1 }}>
                    <View style={styles.searchWrap}>
                        <View style={styles.searchBox}>
                            <Search size={16} color={C.sub} style={{ marginRight: 8 }} />
                            <TextInput style={styles.searchInput} placeholder="Search by name or number" placeholderTextColor={C.sub} value={q} onChangeText={setQ} />
                        </View>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 12, paddingBottom: 4 }}>
                            {filters.map(f => <TouchableOpacity key={f} style={[styles.filterChip, filter === f && styles.filterChipActive]} onPress={() => setFilter(f)}><Text style={[styles.filterChipText, filter === f && styles.filterChipTextActive]}>{f}</Text></TouchableOpacity>)}
                        </ScrollView>
                    </View>
                    {loading ? <ActivityIndicator color={C.orange} style={{ marginTop: 40 }} /> : (
                        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
                            <Text style={styles.resultCount}>{filtered.length} member{filtered.length !== 1 ? 's' : ''}</Text>
                            {filtered.length === 0 ? <Text style={styles.emptyText}>No members found.</Text> : filtered.map(u => {
                                const gc = actColor(u);
                                const monthly = (u.isGymMember ? u.gymFee : 0) + (u.isBadmintonMember ? u.badmintonFee : 0);
                                return (
                                    <TouchableOpacity key={u.id} style={styles.memberCard} activeOpacity={0.75} onPress={() => u.id && navigation.navigate('UserDetail', { userId: u.id })}>
                                        <View style={[styles.avatar, { backgroundColor: `${gc}15` }]}>
                                            <Text style={[styles.avatarText, { color: gc }]}>{u.fullName.charAt(0)}</Text>
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                                                <Text style={styles.memberName}>{u.fullName}</Text>
                                                {u.isStudent && <View style={styles.badge}><BookOpen size={9} color={C.purple} strokeWidth={2.5} /><Text style={[styles.badgeText, { color: C.purple }]}>Student</Text></View>}
                                                {!u.paymentRequired && <View style={[styles.badge, { backgroundColor: '#E8F5E9' }]}><Ban size={9} color={C.green} strokeWidth={2.5} /><Text style={[styles.badgeText, { color: C.green }]}>Exempt</Text></View>}
                                            </View>
                                            <Text style={styles.memberPhone}>{u.phoneNumber}</Text>
                                            <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                                                {u.isGymMember && <View style={[styles.actChip, { backgroundColor: `${C.green}15` }]}><Text style={[styles.actChipText, { color: C.green }]}>🏋️ ₹{u.gymFee}</Text></View>}
                                                {u.isBadmintonMember && <View style={[styles.actChip, { backgroundColor: `${C.orange}15` }]}><Text style={[styles.actChipText, { color: C.orange }]}>🏸 ₹{u.badmintonFee}</Text></View>}
                                            </View>
                                        </View>
                                        <View style={{ alignItems: 'flex-end' }}>
                                            {u.paymentRequired ? <Text style={styles.feeText}>₹{monthly}/mo</Text> : null}
                                            <ChevronRight size={16} color={C.border} style={{ marginTop: 4 }} />
                                        </View>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    )}
                </View>
            ) : (
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                    <ScrollView contentContainerStyle={styles.form} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                        <Text style={styles.formTitle}>Register Member</Text>

                        <SLabel text="Full Name" /><TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Ravi Kumar" placeholderTextColor={C.sub} />
                        <SLabel text="Phone Number" /><TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="10-digit mobile" keyboardType="phone-pad" placeholderTextColor={C.sub} />
                        <SLabel text="Address (optional)" /><TextInput style={styles.input} value={addr} onChangeText={setAddr} placeholder="City, Area" placeholderTextColor={C.sub} />

                        <SLabel text="Memberships" />
                        {/* Gym toggle */}
                        <View style={styles.membershipBlock}>
                            <View style={styles.membershipHeader}>
                                <View style={styles.membershipIcon}><Dumbbell size={18} color={C.green} strokeWidth={2.5} /></View>
                                <View style={{ flex: 1 }}><Text style={styles.membershipTitle}>Gym</Text><Text style={styles.membershipSub}>General Gym Batch</Text></View>
                                <Switch value={isGymMember} onValueChange={setIsGymMember} trackColor={{ false: C.border, true: '#BBEDD8' }} thumbColor={isGymMember ? C.green : '#fff'} />
                            </View>
                            {isGymMember && (
                                <View style={styles.feeRow}>
                                    <Text style={styles.feeLabel}>Monthly Fee (₹)</Text>
                                    <TextInput style={styles.feeInput} value={gymFee} onChangeText={setGymFee} keyboardType="numeric" placeholder="500" placeholderTextColor={C.sub} />
                                </View>
                            )}
                        </View>
                        {/* Badminton toggle */}
                        <View style={styles.membershipBlock}>
                            <View style={styles.membershipHeader}>
                                <View style={[styles.membershipIcon, { backgroundColor: '#FFF0E5' }]}><Zap size={18} color={C.orange} strokeWidth={2.5} /></View>
                                <View style={{ flex: 1 }}><Text style={styles.membershipTitle}>Badminton</Text><Text style={styles.membershipSub}>Select a batch below</Text></View>
                                <Switch value={isBadmintonMember} onValueChange={v => { setIsBadmintonMember(v); if (!v) setBadmintonSessionId(''); }} trackColor={{ false: C.border, true: '#FFC8A0' }} thumbColor={isBadmintonMember ? C.orange : '#fff'} />
                            </View>
                            {isBadmintonMember && (
                                <>
                                    <View style={styles.feeRow}>
                                        <Text style={styles.feeLabel}>Monthly Fee (₹)</Text>
                                        <TextInput style={styles.feeInput} value={badmintonFee} onChangeText={setBadmintonFee} keyboardType="numeric" placeholder="500" placeholderTextColor={C.sub} />
                                    </View>
                                    <View style={{ paddingTop: 12, gap: 8 }}>
                                        {sessions.length === 0 ? <Text style={styles.warn}>No batches. Create one in Sessions tab.</Text> :
                                            sessions.map(s => (
                                                <TouchableOpacity key={s.id} style={[styles.batchRow, badmintonSessionId === s.id && styles.batchRowActive]} onPress={() => setBadmintonSessionId(s.id || '')}>
                                                    <View style={[styles.radio, badmintonSessionId === s.id && styles.radioActive]} />
                                                    <View><Text style={[styles.batchName, badmintonSessionId === s.id && { color: C.orange }]}>{s.name}</Text><Text style={styles.batchTime}>{s.timings}</Text></View>
                                                </TouchableOpacity>
                                            ))
                                        }
                                    </View>
                                </>
                            )}
                        </View>

                        {/* Student */}
                        <View style={styles.switchRow}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><BookOpen size={18} color={C.purple} strokeWidth={2.5} /><View><Text style={styles.switchLabel}>Student</Text><Text style={styles.switchSub}>Captures course & year details</Text></View></View>
                            <Switch value={isStudent} onValueChange={v => { setIsStudent(v); if (!v) { setStudentCourse(''); setStudentYear(''); } }} trackColor={{ false: C.border, true: '#D4D0FF' }} thumbColor={isStudent ? C.purple : '#fff'} />
                        </View>
                        {isStudent && <View style={styles.studentBlock}>
                            <SLabel text="Course" /><TextInput style={styles.input} value={studentCourse} onChangeText={setStudentCourse} placeholder="B.Tech, MBA, BCA..." placeholderTextColor={C.sub} />
                            <SLabel text="Year (optional)" /><TextInput style={styles.input} value={studentYear} onChangeText={setStudentYear} placeholder="2nd Year, Final Year..." placeholderTextColor={C.sub} />
                        </View>}

                        {/* Payment / Exempt */}
                        <View style={styles.switchRow}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><CreditCard size={18} color={C.green} strokeWidth={2.5} /><View><Text style={styles.switchLabel}>Payment Required</Text><Text style={styles.switchSub}>Turn off for priests/staff</Text></View></View>
                            <Switch value={paymentRequired} onValueChange={v => { setPaymentRequired(v); if (v) setExemptCategory(undefined); else setExemptCategory('Priest'); }} trackColor={{ false: C.border, true: '#BBEDD8' }} thumbColor={paymentRequired ? C.green : '#fff'} />
                        </View>

                        {!paymentRequired && (
                            <View style={styles.exemptBlock}>
                                <Text style={styles.exemptLbl}>Exemption Category</Text>
                                <View style={styles.exemptChips}>
                                    {E_CATS.map(c => (
                                        <TouchableOpacity key={c} onPress={() => setExemptCategory(c as any)} style={[styles.exChip, exemptCategory === c && styles.exChipActive]}>
                                            <Text style={[styles.exChipText, exemptCategory === c && styles.exChipTextActive]}>{c}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                        )}

                        <TouchableOpacity style={[styles.btn, saving && { opacity: 0.6 }]} onPress={register} disabled={saving} activeOpacity={0.8}>
                            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Register Member</Text>}
                        </TouchableOpacity>
                    </ScrollView>
                </KeyboardAvoidingView>
            )}
        </View>
    );
};

const SLabel = ({ text }: { text: string }) => <Text style={{ color: '#93959F', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginTop: 16 }}>{text}</Text>;

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    tabBar: { flexDirection: 'row', backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border },
    tab: { flex: 1, paddingVertical: 16, alignItems: 'center', borderBottomWidth: 3, borderBottomColor: 'transparent' },
    tabActive: { borderBottomColor: C.orange, backgroundColor: '#FFF9F5' },
    tabText: { color: C.sub, fontSize: 15, fontWeight: '700' },
    tabTextActive: { color: C.text, fontWeight: '800' },
    searchWrap: { backgroundColor: C.card, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: C.border },
    searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.bg, borderRadius: 12, paddingHorizontal: 14, borderWidth: 1, borderColor: C.border },
    searchInput: { flex: 1, color: C.text, paddingVertical: 12, fontSize: 15 },
    filterChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: C.bg, borderWidth: 1, borderColor: C.border },
    filterChipActive: { backgroundColor: '#FFF0E5', borderColor: C.orange },
    filterChipText: { color: C.sub, fontWeight: '600', fontSize: 13 },
    filterChipTextActive: { color: C.orange, fontWeight: '700' },
    list: { padding: 16, paddingBottom: 80 },
    resultCount: { color: C.sub, fontSize: 12, fontWeight: '600', marginBottom: 12 },
    emptyText: { textAlign: 'center', color: C.sub, marginTop: 40, fontSize: 15 },
    memberCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 18, padding: 14, marginBottom: 10, gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
    avatar: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    avatarText: { fontSize: 18, fontWeight: '800' },
    memberName: { fontSize: 15, fontWeight: '700', color: C.text },
    memberPhone: { fontSize: 12, color: C.sub, marginTop: 2 },
    badge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#EEF0FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
    badgeText: { fontSize: 10, fontWeight: '700' },
    actChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    actChipText: { fontSize: 12, fontWeight: '700' },
    feeText: { fontSize: 13, fontWeight: '800', color: C.text },
    form: { padding: 20, paddingBottom: 80 },
    formTitle: { fontSize: 24, fontWeight: '900', color: C.text, letterSpacing: -0.5, marginBottom: 4 },
    input: { backgroundColor: C.card, borderRadius: 14, padding: 16, fontSize: 16, color: C.text, borderWidth: 1, borderColor: C.border },
    membershipBlock: { backgroundColor: C.card, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.border },
    membershipHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    membershipIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#E8F5E9', alignItems: 'center', justifyContent: 'center' },
    membershipTitle: { fontSize: 16, fontWeight: '700', color: C.text },
    membershipSub: { fontSize: 12, color: C.sub, marginTop: 2 },
    feeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: C.border, marginTop: 12, paddingTop: 12 },
    feeLabel: { fontSize: 14, fontWeight: '700', color: C.sub },
    feeInput: { backgroundColor: C.bg, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 16, color: C.text, borderWidth: 1, borderColor: C.border, minWidth: 100, textAlign: 'right', fontWeight: '800' },
    batchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: 2, borderColor: C.border },
    batchRowActive: { borderColor: C.orange, backgroundColor: '#FFF9F5' },
    batchName: { fontSize: 14, fontWeight: '700', color: C.sub },
    batchTime: { fontSize: 12, color: C.sub },
    radio: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: C.border },
    radioActive: { borderColor: C.orange, backgroundColor: C.orange, borderWidth: 5 },
    switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.card, borderRadius: 14, padding: 16, marginTop: 12, borderWidth: 1, borderColor: C.border },
    switchLabel: { fontSize: 15, fontWeight: '700', color: C.text },
    switchSub: { fontSize: 12, color: C.sub, marginTop: 2 },
    studentBlock: { backgroundColor: '#F5F5FF', borderRadius: 14, padding: 16, marginTop: 8, borderWidth: 1, borderColor: '#D4D0FF' },
    warn: { color: C.red, fontSize: 13, textAlign: 'center', padding: 10 },
    exemptBlock: { padding: 16, backgroundColor: '#FFFDF5', borderBottomEndRadius: 20, borderBottomStartRadius: 20 },
    exemptLbl: { fontSize: 13, fontWeight: '700', color: C.text, marginBottom: 10 },
    exemptChips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    exChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: '#EAEAEA' },
    exChipActive: { backgroundColor: '#FFF4E5', borderColor: C.orange },
    exChipText: { fontSize: 13, fontWeight: '600', color: C.sub },
    exChipTextActive: { color: C.orange, fontWeight: '700' },
    btn: { backgroundColor: C.orange, borderRadius: 16, padding: 18, alignItems: 'center', marginTop: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10, elevation: 4 },
    submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' }
});

export default UserManagementScreen;
