import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Pressable } from 'react-native';
import { ScrollPicker } from './ScrollPicker';
import { X, Check } from 'lucide-react-native';

interface AppTimePickerProps {
    visible: boolean;
    onClose: () => void;
    onConfirm: (date: Date) => void;
    initialDate?: Date;
}

export const AppTimePicker: React.FC<AppTimePickerProps> = ({ visible, onClose, onConfirm, initialDate }) => {
    // Helper to extract time components
    const getTimeComponents = (date: Date) => {
        let h = date.getHours();
        const m = date.getMinutes();
        const ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12;
        h = h ? h : 12;
        return { h, m, ampm };
    };

    const initialDateToUse = initialDate || new Date();
    const comps = getTimeComponents(initialDateToUse);

    const [selectedHour, setSelectedHour] = useState(comps.h - 1);
    const [selectedMinute, setSelectedMinute] = useState(comps.m);
    const [selectedAmPm, setSelectedAmPm] = useState(comps.ampm === 'AM' ? 0 : 1);

    // Build arrays
    const hours = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
    const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
    const ampm = ['AM', 'PM'];

    const handleConfirm = () => {
        const date = new Date();
        let h = selectedHour + 1;
        if (selectedAmPm === 1 && h < 12) h += 12; // PM and not 12
        if (selectedAmPm === 0 && h === 12) h = 0; // AM and 12

        date.setHours(h);
        date.setMinutes(selectedMinute);
        date.setSeconds(0);
        date.setMilliseconds(0);

        onConfirm(date);
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
                        <Text style={styles.title}>Select Time</Text>
                        <TouchableOpacity onPress={handleConfirm} style={styles.iconBtn}>
                            <Check size={24} color="#10B981" />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.pickerContainer}>
                        <ScrollPicker
                            items={hours}
                            selectedIndex={selectedHour}
                            onIndexChange={setSelectedHour}
                            width="25%"
                            visibleItems={5}
                            itemHeight={50}
                        />
                        <Text style={styles.colon}>:</Text>
                        <ScrollPicker
                            items={minutes}
                            selectedIndex={selectedMinute}
                            onIndexChange={setSelectedMinute}
                            width="25%"
                            visibleItems={5}
                            itemHeight={50}
                        />
                        <View style={{ width: 20 }} />
                        <ScrollPicker
                            items={ampm}
                            selectedIndex={selectedAmPm}
                            onIndexChange={setSelectedAmPm}
                            width="25%"
                            visibleItems={5}
                            itemHeight={50}
                        />
                    </View>
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
        paddingBottom: 40,
        shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 12, elevation: 10
    },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        padding: 20, borderBottomWidth: 1, borderBottomColor: '#F3F4F6'
    },
    title: { fontSize: 18, fontWeight: '700', color: '#111827' },
    iconBtn: { padding: 4 },
    pickerContainer: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        paddingVertical: 30, paddingHorizontal: 20
    },
    colon: { fontSize: 24, fontWeight: '700', color: '#111827', marginHorizontal: 10, marginBottom: 4 }
});
