// Browser notifications for long conversions. Everything is optional: unsupported or denied means no notice.
export function requestNotificationPermission() {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
  } catch {
    // Some browsers throw when notifications are not allowed in this context.
  }
}

export function notifyIfHidden(title, body) {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted' || !document.hidden) return;
    const notification = new Notification(title, { body, tag: 'previley-transformer' });
    notification.onclick = () => {
      window.focus();
      notification.close();
    };
  } catch {
    // Ignore: the page itself already shows the result.
  }
}
