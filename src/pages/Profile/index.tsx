import { useProfile } from './hooks/useProfile';
import { ProfileHeader } from './components/ProfileHeader';
import { ProfilePerformance } from './components/ProfilePerformance';
import { ProfileNav } from './components/ProfileNav';
import { ProfilePersonalForm } from './components/ProfilePersonalForm';
import { ProfileSecurityForm } from './components/ProfileSecurityForm';
import { SubscriptionTab } from '../../features/subscriptions/components/SubscriptionTab';

export function Profile() {
  const {
    user,
    activeTab,
    setActiveTab,
    canSeeSubscription,
    registeringPasskey,
    passkeyMessage,
    passkeySupported,
    savingProfile,
    savingPassword,
    uploadingAvatar,
    avatarMessage,
    profileMessage,
    passwordMessage,
    showCurrentPassword,
    setShowCurrentPassword,
    showNewPassword,
    setShowNewPassword,
    passwordStrength,
    fileInputRef,
    stats,
    statsLoading,
    statsError,
    registerProfile,
    handleProfileSubmit,
    profileErrors,
    registerPassword,
    handlePasswordSubmit,
    passwordErrors,
    handleRegisterPasskey,
    onProfileSubmit,
    onPasswordSubmit,
    handleAvatarUpload,
    monthlyAchievementRate,
  } = useProfile();

  return (
    <div className="space-y-6 animate-fadeIn" dir="rtl">

      <div>
        <h2 className="text-xl md:text-2xl font-bold text-secondary-900">الملف الشخصي</h2>
        <p className="text-sm text-secondary-500 mt-0.5">بياناتك الشخصية وأداؤك ضمن الفريق</p>
      </div>

      <ProfileHeader
        user={user}
        uploadingAvatar={uploadingAvatar}
        avatarMessage={avatarMessage}
        fileInputRef={fileInputRef}
        onAvatarUpload={handleAvatarUpload}
      />

      <ProfilePerformance
        user={user}
        stats={stats}
        statsLoading={statsLoading}
        statsError={statsError}
        monthlyAchievementRate={monthlyAchievementRate}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 md:gap-6">
        {/* Navigation Sidebar */}
        <div className="lg:col-span-3">
          <ProfileNav
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            canSeeSubscription={canSeeSubscription}
          />
        </div>

        {/* Content Area */}
        <div className="lg:col-span-9">
          {activeTab === 'subscription' && canSeeSubscription && user ? (
            <SubscriptionTab user={user} />
          ) : activeTab === 'personal' ? (
            <ProfilePersonalForm
              user={user}
              registerProfile={registerProfile}
              handleProfileSubmit={handleProfileSubmit}
              profileErrors={profileErrors}
              onProfileSubmit={onProfileSubmit}
              savingProfile={savingProfile}
              profileMessage={profileMessage}
            />
          ) : (
            <ProfileSecurityForm
              passkeySupported={passkeySupported}
              passkeyMessage={passkeyMessage}
              registeringPasskey={registeringPasskey}
              onRegisterPasskey={handleRegisterPasskey}
              registerPassword={registerPassword}
              handlePasswordSubmit={handlePasswordSubmit}
              passwordErrors={passwordErrors}
              onPasswordSubmit={onPasswordSubmit}
              showCurrentPassword={showCurrentPassword}
              setShowCurrentPassword={setShowCurrentPassword}
              showNewPassword={showNewPassword}
              setShowNewPassword={setShowNewPassword}
              passwordStrength={passwordStrength}
              passwordMessage={passwordMessage}
              savingPassword={savingPassword}
            />
          )}
        </div>
      </div>
    </div>
  );
}
