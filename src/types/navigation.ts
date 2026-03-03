export type RootStackParamList = {
    MainTabs: undefined;
    UserDetail: { userId: string };
    UserBilling: { userId: string; userName: string };
    SessionManagement: undefined;
    Attend: { tab?: 'Gym' | 'Badminton' };
};
