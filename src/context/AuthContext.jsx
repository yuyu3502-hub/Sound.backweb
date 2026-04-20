import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // firebaseUser: Firebase Authのユーザー情報
  // userData: Firestoreのusersドキュメント
  const [firebaseUser, setFirebaseUser] = useState(undefined); // undefined = 読み込み中
  const [userData, setUserData] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        const snap = await getDoc(doc(db, 'users', user.uid));
        setUserData(snap.exists() ? snap.data() : null);
      } else {
        setUserData(null);
      }
    });
    return unsubscribe;
  }, []);

  const isLoading = firebaseUser === undefined;

  return (
    <AuthContext.Provider value={{ firebaseUser, userData, setUserData, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
