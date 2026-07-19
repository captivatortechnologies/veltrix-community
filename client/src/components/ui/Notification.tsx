import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';

export type NotificationType = 'success' | 'error' | 'info' | 'warning';

interface NotificationProps {
  type: NotificationType;
  message: string;
  duration?: number;
  onClose?: () => void;
}

export const Notification: React.FC<NotificationProps> = ({
  type,
  message,
  duration = 3000,
  onClose
}) => {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false);
      if (onClose) onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const getTypeStyles = () => {
    switch (type) {
      case 'success':
        return 'bg-green-500 text-white';
      case 'error':
        return 'bg-red-500 text-white';
      case 'warning':
        return 'bg-yellow-500 text-white';
      case 'info':
        return 'bg-blue-500 text-white';
      default:
        return 'bg-gray-500 text-white';
    }
  };

  if (!isVisible) return null;

  return (
    <div className={`fixed top-4 right-4 px-4 py-3 rounded shadow-lg z-50 flex items-center ${getTypeStyles()}`}>
      <span>{message}</span>
      <button 
        onClick={() => {
          setIsVisible(false);
          if (onClose) onClose();
        }}
        className="ml-3 text-white hover:text-gray-200"
      >
        <X size={16} />
      </button>
    </div>
  );
};

// Notification container to manage multiple notifications
interface NotificationContainerProps {
  children: React.ReactNode;
}

export const NotificationContainer: React.FC<NotificationContainerProps> = ({ children }) => {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
      {children}
    </div>
  );
};

// Notification manager to handle showing and hiding notifications
export const useNotification = () => {
  const [notifications, setNotifications] = useState<{
    id: string;
    type: NotificationType;
    message: string;
    duration?: number;
  }[]>([]);

  const showNotification = (type: NotificationType, message: string, duration = 3000) => {
    const id = Date.now().toString();
    setNotifications(prev => [...prev, { id, type, message, duration }]);
    return id;
  };

  const hideNotification = (id: string) => {
    setNotifications(prev => prev.filter(notification => notification.id !== id));
  };

  const NotificationList = () => (
    <NotificationContainer>
      {notifications.map(notification => (
        <Notification
          key={notification.id}
          type={notification.type}
          message={notification.message}
          duration={notification.duration}
          onClose={() => hideNotification(notification.id)}
        />
      ))}
    </NotificationContainer>
  );

  return {
    showNotification,
    hideNotification,
    NotificationList
  };
};
