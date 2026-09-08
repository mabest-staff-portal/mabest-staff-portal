import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  Firestore,
  collection,
  doc,
  getDocs,
  setDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  Timestamp,
  addDoc
} from 'firebase/firestore';
import {
  StaffUser,
  Announcement,
  StaffCategory,
  SubDepartment,
  TargetType,
  AnnouncementPriority
} from '../types';
import {
  INITIAL_STAFF_MEMBERS,
  INITIAL_ANNOUNCEMENTS,
  PRINCIPAL_USER
} from '../data/mockStaff';

// 1. Read Firebase configuration from environment variables (Vite import.meta.env)
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDummyKeyForPortalPreview123",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "school-portal-preview.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "school-portal-preview",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "school-portal-preview.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1234567890",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:1234567890:web:abcdef123456"
};

// 2. Initialize Firebase App and Firestore instance
export let app: FirebaseApp | null = null;
export let db: Firestore | null = null;
export const hasLiveFirebaseConfig = Boolean(
  import.meta.env.VITE_FIREBASE_API_KEY &&
  import.meta.env.VITE_FIREBASE_PROJECT_ID &&
  import.meta.env.VITE_FIREBASE_PROJECT_ID !== "school-portal-preview"
);

try {
  if (!getApps().length) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApp();
  }
  db = getFirestore(app);
} catch (err) {
  console.warn('Firebase initialized in preview/local mode:', err);
}

// Local Storage Keys for offline resilience & instant responsive previews
const STORAGE_USERS_KEY = 'school_portal_staff_users_v2';
const STORAGE_ANNOUNCEMENTS_KEY = 'school_portal_announcements_v2';
const STORAGE_CURRENT_USER_KEY = 'school_portal_current_user_v2';

function loadStoredUsers(): StaffUser[] {
  try {
    const raw = localStorage.getItem(STORAGE_USERS_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Error reading users from storage', e);
  }
  localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(INITIAL_STAFF_MEMBERS));
  return INITIAL_STAFF_MEMBERS;
}

function loadStoredAnnouncements(): Announcement[] {
  try {
    const raw = localStorage.getItem(STORAGE_ANNOUNCEMENTS_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Error reading announcements from storage', e);
  }
  localStorage.setItem(STORAGE_ANNOUNCEMENTS_KEY, JSON.stringify(INITIAL_ANNOUNCEMENTS));
  return INITIAL_ANNOUNCEMENTS;
}

type AnnouncementListener = (announcements: Announcement[]) => void;
const listeners: Set<AnnouncementListener> = new Set();

function notifyListeners() {
  const current = loadStoredAnnouncements();
  listeners.forEach(fn => fn(current));
}

export const PortalService = {
  // Login with Staff ID and Password
  loginWithStaffId(staffId: string, password: string): { success: boolean; user?: StaffUser; message?: string } {
    const users = loadStoredUsers();
    const cleanId = staffId.trim().toUpperCase();
    
    const found = users.find(u => u.staffId.toUpperCase() === cleanId);
    if (!found) {
      return { success: false, message: `Staff ID "${staffId}" was not found in the staff directory.` };
    }

    if (found.password && found.password !== password) {
      return { success: false, message: 'Invalid password. Please check your credentials.' };
    }

    localStorage.setItem(STORAGE_CURRENT_USER_KEY, JSON.stringify(found));
    return { success: true, user: found };
  },

  getCurrentUser(): StaffUser | null {
    try {
      const raw = localStorage.getItem(STORAGE_CURRENT_USER_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      console.error(e);
    }
    return null;
  },

  logout(): void {
    localStorage.removeItem(STORAGE_CURRENT_USER_KEY);
  },

  getAllStaff(): StaffUser[] {
    return loadStoredUsers();
  },

  // Role & Department Isolation:
  // - Principal/Admin sees all notices
  // - Staff members ONLY see notices matching:
  //   1. 'everyone' (Campus-wide)
  //   2. Their specific Category (e.g. 'Academic' or 'Non-Academic')
  //   3. Their specific Sub-Department (e.g. 'House Parents')
  getFeedForUser(user: StaffUser, allAnnouncements: Announcement[]): Announcement[] {
    if (user.role === 'admin') {
      return [...allAnnouncements].sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    }

    return allAnnouncements
      .filter(item => {
        if (item.targetType === 'everyone') return true;
        if (item.targetType === 'category' && item.targetValue === user.category) return true;
        if (item.targetType === 'department' && item.targetValue === user.department) return true;
        return false;
      })
      .sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  },

  subscribeAnnouncements(callback: AnnouncementListener): () => void {
    listeners.add(callback);
    callback(loadStoredAnnouncements());
    return () => {
      listeners.delete(callback);
    };
  },

  // Publish Announcement (Admin / Principal only)
  createAnnouncement(data: {
    title: string;
    content: string;
    targetType: TargetType;
    targetValue: string;
    priority: AnnouncementPriority;
    author: StaffUser;
    categoryTag?: string;
    pinned?: boolean;
  }): Announcement {
    const list = loadStoredAnnouncements();
    const newDoc: Announcement = {
      id: `ann-${Date.now()}`,
      title: data.title.trim(),
      content: data.content.trim(),
      targetType: data.targetType,
      targetValue: data.targetValue,
      priority: data.priority,
      authorId: data.author.id || data.author.staffId,
      authorName: `${data.author.name} (${data.author.designation || 'Principal'})`,
      authorRole: data.author.role === 'admin' ? 'Principal / Head of School' : 'Department Lead',
      createdAt: new Date().toISOString(),
      pinned: !!data.pinned,
      acknowledgedBy: [],
      categoryTag: data.categoryTag || (data.targetType === 'department' ? data.targetValue : data.targetType === 'category' ? `${data.targetValue} Staff` : 'All Campus')
    };

    list.unshift(newDoc);
    localStorage.setItem(STORAGE_ANNOUNCEMENTS_KEY, JSON.stringify(list));
    notifyListeners();

    // Optionally publish to live Firestore collection if initialized
    if (db && hasLiveFirebaseConfig) {
      addDoc(collection(db, 'announcements'), {
        ...newDoc,
        createdAt: Timestamp.now()
      }).catch(err => {
        console.warn('Firestore cloud sync notice:', err);
      });
    }

    return newDoc;
  },

  toggleAcknowledge(announcementId: string, staffId: string): void {
    const list = loadStoredAnnouncements();
    const item = list.find(a => a.id === announcementId);
    if (!item) return;

    item.acknowledgedBy = item.acknowledgedBy || [];
    const index = item.acknowledgedBy.indexOf(staffId);
    if (index >= 0) {
      item.acknowledgedBy.splice(index, 1);
    } else {
      item.acknowledgedBy.push(staffId);
    }

    localStorage.setItem(STORAGE_ANNOUNCEMENTS_KEY, JSON.stringify(list));
    notifyListeners();
  },

  deleteAnnouncement(announcementId: string): boolean {
    const list = loadStoredAnnouncements();
    const filtered = list.filter(a => a.id !== announcementId);
    localStorage.setItem(STORAGE_ANNOUNCEMENTS_KEY, JSON.stringify(filtered));
    notifyListeners();
    return true;
  },

  togglePin(announcementId: string): void {
    const list = loadStoredAnnouncements();
    const item = list.find(a => a.id === announcementId);
    if (item) {
      item.pinned = !item.pinned;
      localStorage.setItem(STORAGE_ANNOUNCEMENTS_KEY, JSON.stringify(list));
      notifyListeners();
    }
  },

  resetAllDemoData(): void {
    localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(INITIAL_STAFF_MEMBERS));
    localStorage.setItem(STORAGE_ANNOUNCEMENTS_KEY, JSON.stringify(INITIAL_ANNOUNCEMENTS));
    notifyListeners();
  }
};
