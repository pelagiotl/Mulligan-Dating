import { useState, useEffect } from 'react';

interface MaintenanceBannerProps {
  message?: string;
  isActive?: boolean;
}

export default function MaintenanceBanner({ 
  message,
  isActive 
}: MaintenanceBannerProps) {
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if maintenance is active
    // You can control this via environment variable or API call
    const maintenanceActive = isActive !== undefined 
      ? isActive 
      : (import.meta.env as any).VITE_MAINTENANCE_MODE === 'true';
    
    const maintenanceMessage = message || (import.meta.env as any).VITE_MAINTENANCE_MESSAGE || 
      'We\'re performing scheduled maintenance. The app may be temporarily unavailable.';
    
    // Check if user has dismissed this specific message
    const dismissedKey = `maintenance-dismissed-${maintenanceMessage}`;
    const wasDismissed = localStorage.getItem(dismissedKey) === 'true';
    
    if (maintenanceActive && !wasDismissed && !dismissed) {
      setShow(true);
    } else {
      setShow(false);
    }
  }, [isActive, message, dismissed]);

  const handleDismiss = () => {
    const maintenanceMessage = message || (import.meta.env as any).VITE_MAINTENANCE_MESSAGE || 
      'We\'re performing scheduled maintenance. The app may be temporarily unavailable.';
    const dismissedKey = `maintenance-dismissed-${maintenanceMessage}`;
    localStorage.setItem(dismissedKey, 'true');
    setDismissed(true);
    setShow(false);
  };

  if (!show) return null;

  const displayMessage = message || (import.meta.env as any).VITE_MAINTENANCE_MESSAGE || 
    'We\'re performing scheduled maintenance. The app may be temporarily unavailable.';

  return (
    <div className="maintenance-banner">
      <div className="maintenance-content">
        <span className="maintenance-icon">⚠️</span>
        <span className="maintenance-message">{displayMessage}</span>
      </div>
      <button 
        className="maintenance-close" 
        onClick={handleDismiss}
        aria-label="Dismiss maintenance notice"
      >
        ×
      </button>
    </div>
  );
}

