import React, { useState, useEffect } from 'react';
import { StaffUser, Announcement, TargetType, AnnouncementPriority } from './types';
import { PortalService } from './lib/firebase';
import { Navbar } from './components/Navbar';
import { LoginView } from './components/LoginView';
import { StaffFeedView } from './components/StaffFeedView';
import { AdminPanelView } from './components/AdminPanelView';
import { DepartmentDirectory } from './components/DepartmentDirectory';
import { SecurityRulesView } from './components/SecurityRulesView';
import { PRINCIPAL_USER, INITIAL_STAFF_MEMBERS } from './data/mockStaff';
import { ArrowRightLeft, Sparkles, Building2, Shield } from 'lucide-react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<StaffUser | null>(() => {
    // Start with Principal so the app can be immediately experienced in its full depth
    return PortalService.getCurrentUser() || PRINCIPAL_USER;
  });

  const [activeTab, setActiveTab] = useState<'feed' | 'admin' | 'directory' | 'rules'>('feed');
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  // Subscribe to announcements updates
  useEffect(() => {
    const unsubscribe = PortalService.subscribeAnnouncements((list) => {
      setAnnouncements(list);
    });
    return () => unsubscribe();
  }, []);

  const handleLoginSuccess = (user: StaffUser) => {
    setCurrentUser(user);
    // If admin, can go to feed or admin; otherwise stay on feed
    setActiveTab('feed');
  };

  const handleLogout = () => {
    PortalService.logout();
    setCurrentUser(null);
  };

  const handleUserSwitch = (user: StaffUser) => {
    setCurrentUser(user);
    // If switched to staff from admin tab, switch to feed
    if (user.role !== 'admin' && activeTab === 'admin') {
      setActiveTab('feed');
    }
  };

  const handleToggleAcknowledge = (announcementId: string) => {
    if (!currentUser) return;
    PortalService.toggleAcknowledge(announcementId, currentUser.staffId);
  };

  const handleCreateAnnouncement = (data: {
    title: string;
    content: string;
    targetType: TargetType;
    targetValue: string;
    priority: AnnouncementPriority;
    categoryTag?: string;
    pinned?: boolean;
  }) => {
    if (!currentUser) return;
    PortalService.createAnnouncement({
      ...data,
      author: currentUser
    });
    // Navigate to feed to see the newly published announcement
    setActiveTab('feed');
  };

  const handleDeleteAnnouncement = (id: string) => {
    PortalService.deleteAnnouncement(id);
  };

  const handleTogglePin = (id: string) => {
    PortalService.togglePin(id);
  };

  // If no user is authenticated, render the dedicated Login View
  if (!currentUser) {
    return <LoginView onLoginSuccess={handleLoginSuccess} />;
  }

  // Calculate unread count for current user
  const userFeed = PortalService.getFeedForUser(currentUser, announcements);
  const unreadCount = userFeed.filter(
    (n) => !n.acknowledgedBy?.includes(currentUser.staffId)
  ).length;

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans text-slate-900">
      
      {/* Top Navigation */}
      <Navbar
        currentUser={currentUser}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onUserSwitch={handleUserSwitch}
        onLogout={handleLogout}
        announcementCount={userFeed.length}
        unreadCount={unreadCount}
      />

      {/* Quick Role Switcher Banner for live review of notice visibility */}
      <div className="bg-white border-b border-slate-200 py-2 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 font-semibold text-slate-700">
              <ArrowRightLeft className="w-3.5 h-3.5 text-indigo-600" />
              <span>Simulate Staff Department:</span>
            </span>
            <span className="text-slate-700 hidden sm:inline">
              (Observe how feed notices dynamically filter per Firestore security rules)
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Principal */}
            <button
              id="switch-btn-principal"
              onClick={() => handleUserSwitch(PRINCIPAL_USER)}
              className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                currentUser.role === 'admin'
                  ? 'bg-amber-100 text-amber-900 ring-1 ring-amber-300'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              🎓 Principal (Admin)
            </button>

            {/* House Parents */}
            <button
              id="switch-btn-house-parents"
              onClick={() =>
                handleUserSwitch(
                  INITIAL_STAFF_MEMBERS.find((u) => u.department === 'House Parents')!
                )
              }
              className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                currentUser.department === 'House Parents'
                  ? 'bg-purple-100 text-purple-900 ring-1 ring-purple-300'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              🏡 House Parents
            </button>

            {/* Academy Teacher */}
            <button
              id="switch-btn-academy"
              onClick={() =>
                handleUserSwitch(
                  INITIAL_STAFF_MEMBERS.find((u) => u.department === 'Academy')!
                )
              }
              className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                currentUser.department === 'Academy' && currentUser.role !== 'admin'
                  ? 'bg-blue-100 text-blue-900 ring-1 ring-blue-300'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              🔬 Academy Teacher
            </button>

            {/* Security */}
            <button
              id="switch-btn-security"
              onClick={() =>
                handleUserSwitch(
                  INITIAL_STAFF_MEMBERS.find((u) => u.department === 'Security')!
                )
              }
              className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                currentUser.department === 'Security'
                  ? 'bg-amber-100 text-amber-900 ring-1 ring-amber-300'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              🛡️ Security Officer
            </button>

            {/* Kitchen */}
            <button
              id="switch-btn-kitchen"
              onClick={() =>
                handleUserSwitch(
                  INITIAL_STAFF_MEMBERS.find((u) => u.department === 'Kitchen')!
                )
              }
              className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                currentUser.department === 'Kitchen'
                  ? 'bg-rose-100 text-rose-900 ring-1 ring-rose-300'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              🍲 Kitchen Staff
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="flex-1">
        {activeTab === 'feed' && (
          <StaffFeedView
            currentUser={currentUser}
            announcements={announcements}
            onToggleAcknowledge={handleToggleAcknowledge}
            onNavigateToAdmin={() => setActiveTab('admin')}
          />
        )}

        {activeTab === 'admin' && (
          <AdminPanelView
            currentUser={currentUser}
            announcements={announcements}
            onCreateAnnouncement={handleCreateAnnouncement}
            onDeleteAnnouncement={handleDeleteAnnouncement}
            onTogglePin={handleTogglePin}
            onSwitchToPrincipal={() => handleUserSwitch(PRINCIPAL_USER)}
          />
        )}

        {activeTab === 'directory' && (
          <DepartmentDirectory
            currentUser={currentUser}
            onSelectUser={(user) => {
              handleUserSwitch(user);
              setActiveTab('feed');
            }}
          />
        )}

        {activeTab === 'rules' && <SecurityRulesView />}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 px-4 sm:px-6 lg:px-8 text-center text-xs text-slate-700">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            <strong>Mabest Academy</strong> Staff Communication Portal &bull; 150 Staff Across 12 Sub-Departments
          </div>
          <div className="flex items-center gap-3 text-slate-700">
            <span>Powered by Firestore & Role Security Rules</span>
            <span>&bull;</span>
            <button
              onClick={() => PortalService.resetAllDemoData()}
              className="text-indigo-600 hover:underline cursor-pointer"
            >
              Reset Seed Data
            </button>
          </div>
        </div>
      </footer>

    </div>
  );
}
