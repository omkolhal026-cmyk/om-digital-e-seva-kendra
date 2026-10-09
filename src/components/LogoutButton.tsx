import React from 'react';
import { LogOut } from 'lucide-react';

interface LogoutButtonProps {
  onLogout: () => void;
  id?: string;
  className?: string;
  title?: string;
}

export const LogoutButton: React.FC<LogoutButtonProps> = ({
  onLogout,
  id = 'btn-logout',
  className = '',
  title = 'Logout System',
}) => {
  return (
    <button
      id={id}
      type="button"
      onClick={onLogout}
      className={`Btn shrink-0 ${className}`}
      title={title}
      aria-label="Logout"
    >
      <div className="sign">
        <LogOut className="w-[17px] h-[17px] text-white" strokeWidth={2.2} />
      </div>
      <div className="text">Logout</div>
    </button>
  );
};
