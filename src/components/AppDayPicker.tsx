import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Pressable, ScrollView } from 'react-native';
import { X, Check } from 'lucide-react-native';

interface AppDayPickerProps {
    visible: boolean;
    onClose: () => void;
    onConfirm: (day: string) => void;
    initialDay?: string;
}

export const AppDayPicker: React.FC<AppDayPickerProps> = ({ visible, onClose, onConfirm, initialDay = '1' }) => {
    const defaultDay = parseInt(initialDay) || 1;
    const [selectedDay, setSelectedDay] = useState(defaultDay);

    const days = Array.from({ length: 28 }, (_, i) => i + 1);

    const handleConfirm = () => {
        onConfirm(selectedDay.toString());
    };

    return (
        <Modal visible={visible} transparent animationType="slide">
            <View style={styles.overlay}>
                <Pressable style={styles.backdrop} onPress={onClose} />
                <View style={styles.sheet}>
                    <View style={styles.header}>
                        <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
                            <X size={24} color="#6B7280" />
                        </TouchableOpacity>
                        <Text style={styles.title}>Select Day (1-28)</Text>
                        <TouchableOpacity onPress={handleConfirm} style={styles.iconBtn}>
                            <Check size={24} color="#10B981" />
                        </TouchableOpacity>
                    </View>

                    <ScrollView contentContainerStyle={styles.gridContainer} showsVerticalScrollIndicator={false}>
                        {days.map((day) => {
                            const isSelected = selectedDay === day;
                            return (
                                <TouchableOpacity
                                    key={`day-${day}`}
                                    style={[styles.dayCircle, isSelected && styles.dayCircleSelected]}
                                    onPress={() => setSelectedDay(day)}
                                >
                                    <Text style={[styles.dayText, isSelected && styles.dayTextSelected]}>
                                        {day}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
    backdrop: { ...StyleSheet.absoluteFillObject },
    sheet: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: '70%',
        paddingBottom: 40,
        shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 10
    },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        padding: 20, borderBottomWidth: 1, borderBottomColor: '#F3F4F6'
    },
    title: { fontSize: 18, fontWeight: '700', color: '#111827' },
    iconBtn: { padding: 4 },
    gridContainer: {
        flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
        paddingVertical: 24, paddingHorizontal: 16, gap: 12
    },
    dayCircle: {
        width: 48, height: 48, borderRadius: 24,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB'
    },
    dayCircleSelected: {
        backgroundColor: '#10B981', borderColor: '#059669'
    },
    dayText: {
        fontSize: 16, fontWeight: '600', color: '#4B5563'
    },
    dayTextSelected: {
        color: '#FFFFFF', fontWeight: '800'
    }
});
