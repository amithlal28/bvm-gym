export type RootStackParamList = {
    MainTabs: { screen?: string, params?: any };
    UserDetail: { userId: string };
    UserBilling: { userId: string; userName: string };
    SessionManagement: undefined;
    Attend: { tab?: 'Gym' | 'Badminton' };
    Members: { tab?: 'dir' | 'reg' };
    Settings: undefined;
    MonthlyAttendance: undefined;
    Reports: undefined;
};
