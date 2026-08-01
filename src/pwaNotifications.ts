/**
 * PWA Push Notification Helper Utility
 * 
 * Prepares the application for future push notification integrations
 * while providing standard client-side browser notification features.
 */

/**
 * Checks if browser supports Web Notifications API and Service Worker messaging
 */
export function isNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;
}

/**
 * Gets current notification permission state ('default' | 'granted' | 'denied')
 */
export function getNotificationPermission(): NotificationPermission {
  if (!isNotificationSupported()) return 'denied';
  return Notification.permission;
}

/**
 * Requests user permission for push notifications
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported()) {
    console.warn('Notifications are not supported in this environment.');
    return 'denied';
  }

  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (err) {
    console.error('Error requesting notification permission:', err);
    return 'denied';
  }
}

/**
 * Displays a local notification using the active Service Worker registration
 */
export async function showLocalNotification(
  title: string,
  options: NotificationOptions = {}
): Promise<boolean> {
  if (getNotificationPermission() !== 'granted') {
    const granted = (await requestNotificationPermission()) === 'granted';
    if (!granted) return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, {
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      ...options,
    });
    return true;
  } catch (err) {
    console.error('Failed to show notification:', err);
    return false;
  }
}

/**
 * Helper to subscribe to web push notifications using VAPID key
 * (Structured for future backend push messaging capability)
 */
export async function subscribeToPushNotifications(publicVapidKey: string): Promise<PushSubscription | null> {
  if (!isNotificationSupported()) return null;

  try {
    const permission = await requestNotificationPermission();
    if (permission !== 'granted') return null;

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      // Convert URL-safe base64 string to Uint8Array
      const padding = '='.repeat((4 - (publicVapidKey.length % 4)) % 4);
      const base64 = (publicVapidKey + padding).replace(/-/g, '+').replace(/_/g, '/');
      const rawData = window.atob(base64);
      const applicationServerKey = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; ++i) {
        applicationServerKey[i] = rawData.charCodeAt(i);
      }

      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
    }

    return subscription;
  } catch (err) {
    console.error('Failed to subscribe to push notifications:', err);
    return null;
  }
}
