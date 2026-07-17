import { RefObject } from 'react';
import { Shield, Mail, Phone, Calendar, Loader2, Camera, CheckCircle2, XCircle } from 'lucide-react';
import clsx from 'clsx';
import { format } from 'date-fns';
import { ROLE_LABELS, type User } from '../../../lib/supabase';
import type { StatusMessage } from '../types';

interface ProfileHeaderProps {
  user: User | null;
  uploadingAvatar: boolean;
  avatarMessage: StatusMessage | null;
  fileInputRef: RefObject<HTMLInputElement>;
  onAvatarUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function ProfileHeader({ user, uploadingAvatar, avatarMessage, fileInputRef, onAvatarUpload }: ProfileHeaderProps) {
  return (
    <div className="card">
      <div className="flex flex-col md:flex-row items-center md:items-start gap-6">

        {/* Avatar + Upload Button */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-24 h-24 md:w-28 md:h-28 rounded-full border-4 border-white shadow-md overflow-hidden bg-white ring-2 ring-primary-500/30">
            {uploadingAvatar ? (
              <div className="w-full h-full flex items-center justify-center bg-primary-50">
                <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
              </div>
            ) : user?.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={user.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-primary-50 text-primary-600 text-4xl font-bold">
                {user?.name?.charAt(0)}
              </div>
            )}
          </div>

          {/* Explicit Upload Button */}
          <label className={clsx(
            'btn btn-sm cursor-pointer',
            uploadingAvatar ? 'btn-secondary opacity-60 cursor-not-allowed' : 'btn-outline'
          )}>
            {uploadingAvatar ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Camera className="w-4 h-4" />
            )}
            <span>{uploadingAvatar ? 'جارٍ الرفع...' : 'تغيير الصورة'}</span>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/*"
              disabled={uploadingAvatar}
              onChange={onAvatarUpload}
            />
          </label>

          {/* Avatar feedback message */}
          {avatarMessage && (
            <div className={clsx(
              'flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg',
              avatarMessage.type === 'success'
                ? 'bg-success-50 text-success-700'
                : 'bg-error-50 text-error-600'
            )}>
              {avatarMessage.type === 'success'
                ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                : <XCircle className="w-3.5 h-3.5 shrink-0" />
              }
              {avatarMessage.text}
            </div>
          )}
        </div>

        {/* User Info */}
        <div className="flex-1 text-center md:text-right">
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 mb-1">
            <h1 className="text-xl md:text-2xl font-bold text-secondary-900">{user?.name}</h1>
            <span className="badge badge-primary gap-1.5">
              <Shield className="w-3.5 h-3.5" />
              {ROLE_LABELS[user?.role || 'agent']}
            </span>
          </div>
          <p className="text-secondary-500 flex items-center justify-center md:justify-start gap-2 text-sm">
            <Mail className="w-4 h-4" />
            {user?.email}
          </p>
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-5 gap-y-1 mt-1">
            {user?.phone && (
              <p className="text-secondary-500 flex items-center gap-2 text-sm">
                <Phone className="w-4 h-4" />
                <span dir="ltr">{user.phone}</span>
              </p>
            )}
            {user?.created_at && (
              <p className="text-secondary-400 flex items-center gap-2 text-xs">
                <Calendar className="w-3.5 h-3.5" />
                عضو منذ {format(new Date(user.created_at), 'MM/yyyy')}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
