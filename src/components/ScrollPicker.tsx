import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, NativeSyntheticEvent, NativeScrollEvent, DimensionValue, Platform } from 'react-native';
import Animated, { useAnimatedScrollHandler, useSharedValue, useAnimatedStyle, interpolate, Extrapolation } from 'react-native-reanimated';

interface ScrollPickerProps {
    items: string[];
    selectedIndex: number;
    onIndexChange: (index: number) => void;
    itemHeight?: number;
    visibleItems?: number;
    width?: DimensionValue;
}

export const ScrollPicker: React.FC<ScrollPickerProps> = ({
    items,
    selectedIndex,
    onIndexChange,
    itemHeight = 50,
    visibleItems = 5,
    width = '100%'
}) => {
    const scrollY = useSharedValue(selectedIndex * itemHeight);
    const scrollViewRef = useRef<Animated.ScrollView>(null);
    const halfVisible = Math.floor(visibleItems / 2);
    const spacerItems = Array(halfVisible).fill('');
    const paddedItems = [...spacerItems, ...items, ...spacerItems];

    // Initial scroll to selected index
    useEffect(() => {
        if (scrollViewRef.current) {
            scrollViewRef.current.scrollTo({ y: selectedIndex * itemHeight, animated: false });
        }
    }, []);

    const handleScroll = useAnimatedScrollHandler({
        onScroll: (event) => {
            scrollY.value = event.contentOffset.y;
        }
    });

    const resolveIndex = (y: number) => {
        const index = Math.round(y / itemHeight);
        onIndexChange(Math.min(items.length - 1, Math.max(0, index)));
    };

    const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        resolveIndex(e.nativeEvent.contentOffset.y);
    };

    const onScrollEndDrag = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        if (Platform.OS === 'ios' || e.nativeEvent.contentOffset.y % itemHeight === 0) {
            resolveIndex(e.nativeEvent.contentOffset.y);
        }
    };

    return (
        <View style={[styles.container, { height: itemHeight * visibleItems, width }]}>
            <View style={[styles.highlightCover, { height: itemHeight, top: halfVisible * itemHeight }]} />
            <Animated.ScrollView
                ref={scrollViewRef}
                showsVerticalScrollIndicator={false}
                snapToInterval={itemHeight}
                decelerationRate="fast"
                onScroll={handleScroll}
                onMomentumScrollEnd={onMomentumScrollEnd}
                onScrollEndDrag={onScrollEndDrag}
                scrollEventThrottle={16}
                contentContainerStyle={{ paddingVertical: 0 }}
            >
                {paddedItems.map((item, index) => {
                    return (
                        <ScrollItem
                            key={`item-${index}`}
                            item={item}
                            index={index}
                            scrollY={scrollY}
                            itemHeight={itemHeight}
                            halfVisible={halfVisible}
                        />
                    );
                })}
            </Animated.ScrollView>
        </View>
    );
};

const ScrollItem = ({ item, index, scrollY, itemHeight, halfVisible }: any) => {
    const rStyle = useAnimatedStyle(() => {
        const itemCenter = (index - halfVisible) * itemHeight;
        const distance = Math.abs(scrollY.value - itemCenter);
        const progress = Math.max(0, 1 - distance / (itemHeight * 1.5));

        return {
            transform: [
                { scale: interpolate(progress, [0, 1], [0.85, 1.1]) },
                { rotateX: `${interpolate(progress, [0, 1], [60, 0], Extrapolation.CLAMP)}deg` } as any
            ],
            opacity: interpolate(progress, [0, 1], [0.3, 1]),
        };
    });

    return (
        <Animated.View style={[styles.itemContainer, { height: itemHeight }, rStyle]}>
            <Text style={[styles.itemText, { color: item ? '#111827' : 'transparent', fontWeight: item ? '700' : '400' }]}>
                {item}
            </Text>
        </Animated.View>
    );
};

const styles = StyleSheet.create({
    container: { overflow: 'hidden', position: 'relative', alignItems: 'center', justifyContent: 'center' },
    highlightCover: {
        position: 'absolute', width: '90%',
        backgroundColor: 'rgba(59, 130, 246, 0.08)',
        borderTopWidth: 1.5, borderTopColor: 'rgba(59, 130, 246, 0.15)',
        borderBottomWidth: 1.5, borderBottomColor: 'rgba(59, 130, 246, 0.15)',
        borderRadius: 12, zIndex: -1,
    },
    itemContainer: { width: '100%', alignItems: 'center', justifyContent: 'center' },
    itemText: { fontSize: 22 },
});
