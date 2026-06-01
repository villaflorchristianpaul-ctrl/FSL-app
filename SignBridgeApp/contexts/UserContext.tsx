import React, { createContext, useContext, useState, type ReactNode } from 'react';

type User = {
  name: string;
  email: string;
  profileImage?: string;
  bio?: string;
};

type UserContextValue = {
  user: User | null;
  setUser: (user: User | null) => void;
  setUserName: (name: string) => void;
  setUserEmail: (email: string) => void;
  setProfileImage: (image: string) => void;
  setUserBio: (bio: string) => void;
};

const UserContext = createContext<UserContextValue | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  const setUserName = (name: string) => {
    setUser(prev => prev ? { ...prev, name } : { name, email: '' });
  };

  const setUserEmail = (email: string) => {
    setUser(prev => prev ? { ...prev, email } : { name: '', email });
  };

  const setProfileImage = (profileImage: string) => {
    setUser(prev => prev ? { ...prev, profileImage } : { name: '', email: '', profileImage });
  };

  const setUserBio = (bio: string) => {
    setUser(prev => prev ? { ...prev, bio } : { name: '', email: '', bio });
  };

  return (
    <UserContext.Provider value={{ user, setUser, setUserName, setUserEmail, setProfileImage, setUserBio }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);

  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }

  return context;
}
