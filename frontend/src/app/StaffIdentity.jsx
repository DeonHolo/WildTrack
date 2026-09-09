import { createContext, useContext } from 'react';

export const StaffIdentityContext = createContext({ data: { adviserName: '', assignments: [], workspaces: [] }, status: 'loading' });
export const emptyStaffIdentity = () => ({ adviserName: '', assignments: [], workspaces: [] });
export const useStaffIdentity = () => useContext(StaffIdentityContext);
