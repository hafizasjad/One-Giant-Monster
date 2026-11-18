import { registerSW } from 'virtual:pwa-register';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

/** Register service worker, wire in-app install button, and track online/offline status. */
export function initPWA() {
  registerSW({ immediate: true });

  const installBtn = document.getElementById('btnInstall') as HTMLButtonElement | null;
  const iosModal = document.getElementById('iosInstallModal');
  const iosClose = document.getElementById('btnCloseIosGuide');
  const offlineBanner = document.getElementById('offlineBanner');

  let deferredPrompt: BeforeInstallPromptEvent | null = null;
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  const isIOS = /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());

  const syncInstallButton = () => {
    if (!installBtn) return;
    if (isStandalone) {
      installBtn.classList.add('hidden');
      return;
    }
    if (deferredPrompt) {
      installBtn.textContent = 'Install App';
      installBtn.classList.remove('hidden');
    } else if (isIOS) {
      installBtn.textContent = 'Install on iPhone / iPad';
      installBtn.classList.remove('hidden');
    } else {
      installBtn.classList.add('hidden');
    }
  };

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    syncInstallButton();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installBtn?.classList.add('hidden');
  });

  installBtn?.addEventListener('click', async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        deferredPrompt = null;
        installBtn.classList.add('hidden');
      }
      return;
    }
    if (isIOS) iosModal?.classList.remove('hidden');
  });

  iosClose?.addEventListener('click', () => iosModal?.classList.add('hidden'));
  iosModal?.addEventListener('click', (e) => {
    if (e.target === iosModal) iosModal.classList.add('hidden');
  });

  const syncOnline = () => {
    if (!offlineBanner) return;
    offlineBanner.classList.toggle('hidden', navigator.onLine);
  };
  window.addEventListener('online', syncOnline);
  window.addEventListener('offline', syncOnline);

  syncInstallButton();
  syncOnline();
}
