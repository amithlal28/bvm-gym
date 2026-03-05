import React, { useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
    Alert, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform, RefreshControl, StatusBar
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Plus, Trash2, CheckCircle2 } from 'lucide-react-native';
import { Session } from '../types';
import { getBadmintonSessions, createSession, deleteSession, setGymSessionDefault } from '../lib/services';
import { useTheme } from '../contexts/ThemeContext';

const SessionManagementScreen = () => {
    const insets = useSafeAreaInsets();
    const safeTop = insets.top > 0 ? insets.top : Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 0;
    const { colors: C } = useTheme();
    const [sessions, setSessions] = useState<Session[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [name, setName] = useState('');
    const [timings, setTimings] = useState('');

    useFocusEffect(useCallback(() => {
        setGymSessionDefault().catch(console.error);
        load();
    }, []));

    const load = async () => {
        try { setLoading(true); setSessions(await getBadmintonSessions()); }
        catch (e: any) { Alert.alert('Error', e.message); }
        finally { setLoading(false); }
    };

    const handleCreate = async () => {
        if (!name.trim() || !timings.trim()) { Alert.alert('Required', 'Fill in name and timings.'); return; }
        try {
            setSaving(true);
            await createSession({ name: name.trim(), activityType: 'Badminton', timings: timings.trim() });
            setName(''); setTimings(''); await load();
        } catch (e: any) { Alert.alert('Error', e.message); }
        finally { setSaving(false); }
    };

    const handleDelete = (id: string, n: string) => {
        Alert.alert('Delete Batch', `Remove "${n}"?`, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete', style: 'destructive', onPress: async () => {
                    try { setLoading(true); await deleteSession(id); await load(); }
                    catch (e: any) { Alert.alert('Error', e.message); setLoading(false); }
                }
            },
        ]);
    };

    return (
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={{ paddingTop: safeTop, backgroundColor: C.card, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.border, paddingHorizontal: 16 }}>
                <Text style={{ fontSize: 20, fontWeight: '800', color: C.text, marginTop: 10 }}>Sessions & Batches</Text>
            </View>
            <ScrollView style={{ flex: 1, backgroundColor: C.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 60 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} colors={[C.orange]} />}>

                {/* Default Gym Batch */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#F0FBF0', borderRadius: 16, padding: 18, marginBottom: 16, borderWidth: 1.5, borderColor: '#C8EFC8' }}>
                    <CheckCircle2 size={22} color={C.green} strokeWidth={2.5} />
                    <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 16, fontWeight: '700', color: '#2D6A2D', marginBottom: 2 }}>General Gym Batch</Text>
                        <Text style={{ fontSize: 13, color: '#4CAF50', fontWeight: '500' }}>5:00 AM – 10:00 PM · Default · All Gym members</Text>
                    </View>
                    <View style={{ backgroundColor: '#C8EFC8', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 }}>
                        <Text style={{ color: '#2D6A2D', fontSize: 12, fontWeight: '700' }}>Active</Text>
                    </View>
                </View>

                {/* Create Badminton Batch */}
                <View style={{ backgroundColor: C.card, borderRadius: 16, padding: 18, marginBottom: 20, shadowColor: C.cardShadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 }}>
                    <Text style={{ fontSize: 17, fontWeight: '800', color: C.text, marginBottom: 16 }}>New Badminton Batch</Text>
                    <TextInput style={{ backgroundColor: C.inputBg, borderRadius: 12, padding: 15, fontSize: 16, color: C.text, marginBottom: 12, borderWidth: 1, borderColor: C.border }} placeholder="Batch name  (e.g. Morning Pro)" placeholderTextColor={C.sub} value={name} onChangeText={setName} />
                    <TextInput style={{ backgroundColor: C.inputBg, borderRadius: 12, padding: 15, fontSize: 16, color: C.text, marginBottom: 12, borderWidth: 1, borderColor: C.border }} placeholder="Timings  (e.g. 6:00 AM – 9:00 AM)" placeholderTextColor={C.sub} value={timings} onChangeText={setTimings} />
                    <TouchableOpacity style={{ flexDirection: 'row', backgroundColor: C.orange, borderRadius: 14, padding: 16, alignItems: 'center', justifyContent: 'center', gap: 8, opacity: saving ? 0.6 : 1 }} onPress={handleCreate} disabled={saving} activeOpacity={0.8}>
                        {saving ? <ActivityIndicator color="#fff" size="small" /> : <><Plus size={18} color="#fff" strokeWidth={3} /><Text style={{ color: '#fff', fontWeight: '800', fontSize: 16 }}>Create Batch</Text></>}
                    </TouchableOpacity>
                </View>

                {/* List */}
                <Text style={{ fontSize: 13, fontWeight: '800', color: C.sub, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Badminton Batches ({sessions.length})</Text>
                {loading ? <ActivityIndicator color={C.orange} style={{ marginTop: 20 }} /> :
                    sessions.length === 0 ? <Text style={{ textAlign: 'center', color: C.sub, marginTop: 20, fontSize: 15 }}>No batches yet.</Text> :
                        sessions.map(s => (
                            <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 14, padding: 16, marginBottom: 10, shadowColor: C.cardShadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 }}>
                                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: C.orange, marginRight: 14 }} />
                                <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 3 }}>{s.name}</Text>
                                    <Text style={{ fontSize: 13, color: C.sub, fontWeight: '500' }}>{s.timings}</Text>
                                </View>
                                <TouchableOpacity style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#FFF0F0', alignItems: 'center', justifyContent: 'center' }} onPress={() => s.id && handleDelete(s.id, s.name)}>
                                    <Trash2 size={18} color={C.red} />
                                </TouchableOpacity>
                            </View>
                        ))
                }
            </ScrollView>
        </KeyboardAvoidingView>
    );
};

export default SessionManagementScreen;
