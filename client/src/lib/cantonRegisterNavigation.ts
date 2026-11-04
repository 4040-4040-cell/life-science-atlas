import type { BaselCantonId } from '@shared/baselCantonDetail';

/** Keep page navigation in the router; a second URL fragment is not a route. */
export function cantonRegisterRoute(cantonId: BaselCantonId): string {
  return `/canton/${cantonId}`;
}

/** Wait for the actual destination register, never scroll the old compact card. */
export function scrollToCantonRegister(cantonId: BaselCantonId): void {
  let attempts = 0;
  const timer = window.setInterval(() => {
    const target = document.getElementById('basel-corrected-register');
    if (target?.dataset.registerCanton === cantonId && !target.classList.contains('compact')) {
      window.clearInterval(timer);
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (++attempts >= 40) {
      window.clearInterval(timer);
    }
  }, 100);
}
