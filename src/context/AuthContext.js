import { createContext, useContext, useState, useEffect } from 'react';
import { auth } from '../utils/firebase';
import { categoryService, stockMasterService, brokerService } from '../utils/dbService';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile } from 'firebase/auth';

const Ctx = createContext(null);
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { const unsub = onAuthStateChanged(auth, u => { setUser(u); setLoading(false); }); return unsub; }, []);
  const register = async (name, email, password) => {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
    await categoryService.seedDefaults(cred.user.uid);
    await stockMasterService.seedDefaults(cred.user.uid);
    await brokerService.seedDefaults(cred.user.uid);
    setUser({ ...cred.user, displayName: name });
  };
  const login = (email, password) => signInWithEmailAndPassword(auth, email, password);
  const logout = () => signOut(auth);
  return <Ctx.Provider value={{ user, loading, register, login, logout }}>{children}</Ctx.Provider>;
};
export const useAuth = () => useContext(Ctx);